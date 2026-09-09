from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from db.supabase_client import get_supabase_client
from collections import defaultdict
from datetime import datetime
from typing import Optional
import math

router = APIRouter(prefix="/forecasting", tags=["forecasting"])
templates = Jinja2Templates(directory="templates")


# ─────────────────────────────────────────────────────────────────────────────
# Helper utilities
# ─────────────────────────────────────────────────────────────────────────────

def _month_index(month_str: str) -> int:
    """Convert 'YYYY-MM' to an integer index (months since epoch)."""
    y, m = map(int, month_str.split("-"))
    return y * 12 + m


def _month_label(month_str: str) -> str:
    """Convert 'YYYY-MM' to display label like \"Jan '26\"."""
    dt = datetime.strptime(month_str, "%Y-%m")
    return dt.strftime("%b '%y")


def _next_months(last_month_str: str, count: int) -> list[str]:
    """Return the next `count` month strings after `last_month_str`."""
    y, m = map(int, last_month_str.split("-"))
    result = []
    for _ in range(count):
        m += 1
        if m > 12:
            m = 1
            y += 1
        result.append(f"{y:04d}-{m:02d}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# ML Models (pure Python — no external dependencies)
# ─────────────────────────────────────────────────────────────────────────────

def _linear_regression(x: list[float], y: list[float]) -> tuple[float, float]:
    """Ordinary least-squares simple linear regression → (slope, intercept)."""
    n = len(x)
    if n < 2:
        return 0.0, (y[0] if y else 0.0)
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    num = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    den = sum((x[i] - mean_x) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0.0
    return slope, mean_y - slope * mean_x


def _r2_score(y_true: list[float], y_pred: list[float]) -> float:
    """Coefficient of determination R²."""
    if len(y_true) < 2:
        return 0.0
    mean_y = sum(y_true) / len(y_true)
    ss_tot = sum((yi - mean_y) ** 2 for yi in y_true)
    ss_res = sum((y_true[i] - y_pred[i]) ** 2 for i in range(len(y_true)))
    return max(0.0, 1 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0


# ── Model 1: Linear Regression ───────────────────────────────────────────────
def forecast_linear(x_idx: list[float], y: list[float], future_x: list[float]) -> tuple[list[float], float]:
    slope, intercept = _linear_regression(x_idx, y)
    predictions = [max(0.0, slope * xi + intercept) for xi in future_x]
    fitted = [slope * xi + intercept for xi in x_idx]
    r2 = _r2_score(y, fitted)
    # Penalise R² confidence when we have very few data points
    n = len(y)
    adjusted = r2 * (1 - 1 / max(n, 1))  # shrinks toward 0 for tiny n
    confidence = max(20, min(95, int(adjusted * 100)))
    return predictions, confidence


# ── Model 2: Moving Average ───────────────────────────────────────────────────
def forecast_moving_average(y: list[float], periods: int, window: int = 3) -> tuple[list[float], float]:
    """Simple moving average: each future value = mean of last `window` actuals/predictions."""
    if not y:
        return [0.0] * periods, 30
    effective_window = min(window, len(y))
    series = list(y)
    predictions = []
    for _ in range(periods):
        avg = sum(series[-effective_window:]) / effective_window
        predictions.append(max(0.0, avg))
        series.append(avg)
    # Confidence: based on variance of the window — low variance = high confidence
    if len(y) >= effective_window:
        window_data = y[-effective_window:]
        mean_w = sum(window_data) / len(window_data)
        variance = sum((v - mean_w) ** 2 for v in window_data) / len(window_data)
        cv = (math.sqrt(variance) / mean_w) if mean_w > 0 else 1.0
        confidence = max(20, min(85, int((1 - min(cv, 1)) * 85)))
    else:
        confidence = 50
    return predictions, confidence


# ── Model 3: Exponential Smoothing (Holt's Double — trend-aware) ─────────────
def forecast_exponential_smoothing(y: list[float], periods: int,
                                   alpha: float = 0.4, beta: float = 0.2) -> tuple[list[float], float]:
    """
    Holt's double exponential smoothing (level + trend).
    alpha: smoothing factor for level  (0 < alpha < 1)
    beta:  smoothing factor for trend  (0 < beta  < 1)
    """
    if not y:
        return [0.0] * periods, 30
    if len(y) == 1:
        return [max(0.0, y[0])] * periods, 40

    # Initialise level and trend using first min(4, len(y)) points for stability
    init_len = min(4, len(y))
    level = sum(y[:init_len]) / init_len
    if init_len > 1:
        trend = sum(y[i] - y[i-1] for i in range(1, init_len)) / (init_len - 1)
    else:
        trend = 0.0

    fitted = []
    for i in range(1, len(y)):
        prev_level = level
        level = alpha * y[i] + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
        fitted.append(level)

    # Project future values
    predictions = [max(0.0, level + (i + 1) * trend) for i in range(periods)]

    # Confidence via in-sample MAPE
    if fitted and len(y) >= 2:
        errors = [abs(y[i + 1] - fitted[i]) / y[i + 1] for i in range(len(fitted)) if y[i + 1] != 0]
        mape = sum(errors) / len(errors) if errors else 1.0
        confidence = max(20, min(90, int((1 - min(mape, 1)) * 90)))
    else:
        confidence = 45
    return predictions, confidence


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _trend_kpis(slope_s: float, avg_forecast_sales: float,
                 avg_historical_sales: float) -> tuple[str, str, str, float]:
    """Classify trend direction based on regression slope relative to historical levels."""
    # Classify based on slope relative to average historical sales
    relative_slope = slope_s / avg_historical_sales if avg_historical_sales > 0 else 0.0
    
    # Growth % compares the projected average to the historical average
    sales_growth_pct = (
        (avg_forecast_sales - avg_historical_sales) / avg_historical_sales * 100
        if avg_historical_sales > 0 else 0
    )
    
    if relative_slope > 0.005:  # More than 0.5% growth per month
        return "Upward", "fa-arrow-trend-up", "#16a34a", sales_growth_pct
    elif relative_slope < -0.005:  # Decline
        return "Downward", "fa-arrow-trend-down", "#dc2626", sales_growth_pct
    else:
        return "Flat", "fa-minus", "#d97706", sales_growth_pct


def _build_recommendations(avg_forecast_sales: float, avg_forecast_expenses: float,
                            slope_s: float, slope_e: float,
                            sales_growth_pct: float, model: str) -> list[dict]:
    recs = []
    if avg_forecast_expenses > avg_forecast_sales * 0.8:
        recs.append({
            "icon": "fa-triangle-exclamation", "color": "#dc2626",
            "title": "Expense Risk Ahead",
            "text": "Projected expenses are >80% of forecasted revenue. Consider reducing discretionary costs."
        })
    if sales_growth_pct > 10:
        recs.append({
            "icon": "fa-rocket", "color": "#16a34a",
            "title": "Strong Growth Projected",
            "text": f"Sales are projected to grow by {sales_growth_pct:.1f}%. Consider scaling operations to match demand."
        })
    if slope_e > slope_s:
        recs.append({
            "icon": "fa-chart-line", "color": "#d97706",
            "title": "Expense Growth Outpacing Sales",
            "text": "Expenses are growing faster than revenue. Review your cost structure to protect margins."
        })
    if model == "moving_average":
        recs.append({
            "icon": "fa-wave-square", "color": "#6366f1",
            "title": "Moving Average Model",
            "text": "This model averages recent data points. Best when your data has no strong upward/downward trend."
        })
    elif model == "exponential":
        recs.append({
            "icon": "fa-chart-area", "color": "#0ea5e9",
            "title": "Exponential Smoothing (Holt's Method)",
            "text": "This trend-aware model weights recent months more heavily. More responsive to sudden changes in revenue."
        })
    if not recs:
        recs.append({
            "icon": "fa-circle-check", "color": "#2563eb",
            "title": "Stable Outlook",
            "text": "Forecasts indicate a balanced financial trajectory. Keep maintaining current operational efficiency."
        })
    return recs


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def read_forecasting(request: Request):
    """Renders the Forecasting HTML page."""
    return templates.TemplateResponse(
        request=request,
        name="forecasting.html",
        context={"title": "Forecasting", "active_page": "forecasting"},
    )


@router.get("/api/forecast")
async def get_forecast(
    request: Request,
    periods: Optional[int] = 3,
    model: Optional[str] = "linear"
):
    """
    Computes a forecast for sales and expenses using the selected ML model.

    Models:
      - linear          : Ordinary Least-Squares Linear Regression
      - moving_average  : Simple Moving Average (3-month window)
      - exponential     : Holt's Double Exponential Smoothing (level + trend)

    Returns historical + forecasted series, KPI summary, and AI recommendations.
    Falls back to mock data if Supabase is not connected.
    """
    from core.db_fallback import MOCK_SALES, MOCK_EXPENSES

    # Clamp periods
    periods = max(1, min(periods or 3, 12))
    model = model or "linear"

    # ── Fetch data ────────────────────────────────────────────────────────────
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    supabase = get_supabase_client()
    sales_data: list = []
    expenses_data: list = []
    using_fallback = False

    if supabase:
        try:
            s_res = supabase.table("sales").select("amount, date").eq("user_id", user.id).neq("is_deleted", True).execute()
            e_res = supabase.table("expenses").select("amount, date").eq("user_id", user.id).neq("is_deleted", True).execute()
            sales_data    = s_res.data or []
            expenses_data = e_res.data or []
        except Exception as ex:
            err = str(ex)
            if "is_deleted" in err.lower() or "42703" in err:
                print("[Forecasting] 'is_deleted' column missing — retrying query without it.")
                try:
                    s_res = supabase.table("sales").select("amount, date").eq("user_id", user.id).execute()
                    e_res = supabase.table("expenses").select("amount, date").eq("user_id", user.id).execute()
                    sales_data    = s_res.data or []
                    expenses_data = e_res.data or []
                except Exception as ex2:
                    print(f"[Forecasting] Supabase retry error: {ex2}")
                    using_fallback = True
            elif is_missing_table_error(ex):
                print(f"[Forecasting] Missing table: {ex} — using mock data")
                using_fallback = True
            else:
                from core.db_error_handler import handle_db_error
                handle_db_error(ex)
    else:
        using_fallback = True

    if using_fallback:
        sales_data    = [s for s in MOCK_SALES if not s.get("is_deleted")]
        expenses_data = [e for e in MOCK_EXPENSES if not e.get("is_deleted")]

    # ── Aggregate by month ────────────────────────────────────────────────────
    sales_by_month: defaultdict[str, float] = defaultdict(float)
    for r in sales_data:
        try:
            month = str(r.get("date", ""))[:7]
            sales_by_month[month] += float(r.get("amount", 0))
        except Exception:
            pass

    expenses_by_month: defaultdict[str, float] = defaultdict(float)
    for r in expenses_data:
        try:
            month = str(r.get("date", ""))[:7]
            expenses_by_month[month] += float(r.get("amount", 0))
        except Exception:
            pass

    all_months = sorted(set(list(sales_by_month.keys()) + list(expenses_by_month.keys())))

    if not all_months:
        return {"error": "No historical data available for forecasting. Please add some sales or expenses records first."}

    # Generate a contiguous range of months from first to last
    start_year, start_month = map(int, all_months[0].split("-"))
    end_year, end_month = map(int, all_months[-1].split("-"))
    
    contiguous_months = []
    cy, cm = start_year, start_month
    while (cy < end_year) or (cy == end_year and cm <= end_month):
        contiguous_months.append(f"{cy:04d}-{cm:02d}")
        cm += 1
        if cm > 12:
            cm = 1
            cy += 1

    # Linear interpolation helper for missing months
    def _interpolate_series(months: list[str], val_dict: dict[str, float]) -> list[float]:
        n = len(months)
        values = [val_dict.get(m) if m in val_dict else None for m in months]
        if all(v is None for v in values):
            return [0.0] * n
        first_idx = next(i for i, v in enumerate(values) if v is not None)
        for i in range(first_idx):
            values[i] = values[first_idx]
        last_idx = next(i for i in range(n - 1, -1, -1) if values[i] is not None)
        for i in range(last_idx + 1, n):
            values[i] = values[last_idx]
        i = first_idx
        while i < last_idx:
            if values[i] is None:
                j = i + 1
                while j <= last_idx and values[j] is None:
                    j += 1
                val_start = values[i - 1]
                val_end = values[j]
                steps = j - (i - 1)
                for k in range(i, j):
                    values[k] = val_start + (val_end - val_start) * (k - (i - 1)) / steps
                i = j
            else:
                i += 1
        return [float(v) for v in values]

    y_sales    = _interpolate_series(contiguous_months, sales_by_month)
    y_expenses = _interpolate_series(contiguous_months, expenses_by_month)
    all_months = contiguous_months

    # ── Build historical series ───────────────────────────────────────────────
    x_indices  = [float(_month_index(m)) for m in all_months]
    future_months = _next_months(all_months[-1], periods)
    future_x      = [float(_month_index(m)) for m in future_months]

    # ── Run selected model ────────────────────────────────────────────────────
    if model == "moving_average":
        window = min(3, len(y_sales))
        forecast_sales,    conf_s = forecast_moving_average(y_sales,    periods, window)
        forecast_expenses, conf_e = forecast_moving_average(y_expenses, periods, window)
        confidence = (conf_s + conf_e) // 2

    elif model == "exponential":
        forecast_sales,    conf_s = forecast_exponential_smoothing(y_sales,    periods)
        forecast_expenses, conf_e = forecast_exponential_smoothing(y_expenses, periods)
        confidence = (conf_s + conf_e) // 2

    else:  # default: linear regression
        model = "linear"
        forecast_sales,    conf_s = forecast_linear(x_indices, y_sales,    future_x)
        forecast_expenses, conf_e = forecast_linear(x_indices, y_expenses, future_x)
        confidence = (conf_s + conf_e) // 2

    # ── Safeguard: clamp explosive forecasts ─────────────────────────
    # Cap forecasts at 3x the max historical values, and minimum at 10% of historical average
    max_hist_sale = max(y_sales) if y_sales else 1.0
    min_hist_sale = sum(y_sales) / len(y_sales) * 0.1 if y_sales else 0.0
    forecast_sales = [max(min_hist_sale, min(s, max_hist_sale * 3)) for s in forecast_sales]

    max_hist_expense = max(y_expenses) if y_expenses else 1.0
    min_hist_expense = sum(y_expenses) / len(y_expenses) * 0.1 if y_expenses else 0.0
    forecast_expenses = [max(min_hist_expense, min(e, max_hist_expense * 3)) for e in forecast_expenses]
    
    forecast_profit   = [s - e for s, e in zip(forecast_sales, forecast_expenses)]

    # ── KPIs ──────────────────────────────────────────────────────────────────
    avg_forecast_sales    = sum(forecast_sales)    / len(forecast_sales)
    avg_forecast_expenses = sum(forecast_expenses) / len(forecast_expenses)
    avg_forecast_profit   = avg_forecast_sales - avg_forecast_expenses

    avg_historical_sales  = sum(y_sales) / len(y_sales) if y_sales else 1.0

    # Compute effective slope for trend direction (use LR slope regardless of model)
    slope_s, _ = _linear_regression(x_indices, y_sales)
    slope_e, _ = _linear_regression(x_indices, y_expenses)

    trend_direction, trend_icon, trend_color, sales_growth_pct = _trend_kpis(
        slope_s, avg_forecast_sales, avg_historical_sales
    )
    recommendations = _build_recommendations(
        avg_forecast_sales, avg_forecast_expenses,
        slope_s, slope_e, sales_growth_pct, model
    )

    # ── Model metadata for UI ─────────────────────────────────────────────────
    model_labels = {
        "linear":         "AI Forecast Model (Trend-based)",
        "moving_average": "Recent Average Model",
        "exponential":    "Recent Growth-Weighted Model",
    }

    # ── Projected Health Scores ────────────────────────────────────────────────
    projected_health_scores = []
    # Smooth outlier spikes for the base month by averaging the last min(3, len(y_sales)) months
    recent_len = min(3, len(y_sales))
    prev_sale = sum(y_sales[-recent_len:]) / recent_len if y_sales else 1.0
    for i in range(len(forecast_sales)):
        s_val = forecast_sales[i]
        e_val = forecast_expenses[i]
        
        expense_ratio = (e_val / s_val) if s_val > 0 else 1.0
        profit_margin_score = max(0, min(100, int((1.0 - expense_ratio) * 100)))
        expense_ratio_score = max(0, min(100, int(100 - (expense_ratio * 100))))
        
        growth = ((s_val - prev_sale) / prev_sale) if prev_sale > 0 else 0.0
        revenue_trend_score = max(0, min(100, int(50 + growth * 100)))
        
        cash_consistency_score = 100
        
        score = int(
            revenue_trend_score * 0.35 +
            expense_ratio_score * 0.30 +
            profit_margin_score * 0.20 +
            cash_consistency_score * 0.15
        )
        projected_health_scores.append(score)
        prev_sale = s_val

    avg_projected_health = sum(projected_health_scores) / len(projected_health_scores) if projected_health_scores else 50
    avg_projected_health = round(avg_projected_health, 0)
    
    if avg_projected_health >= 70:
        projected_health_status = "Healthy"
    elif avg_projected_health >= 45:
        projected_health_status = "Stable"
    else:
        projected_health_status = "At Risk"
        
    health_trend = "Stable"
    if len(projected_health_scores) >= 2:
        diff = projected_health_scores[-1] - projected_health_scores[0]
        if diff >= 2:
            health_trend = "Improving"
        elif diff <= -2:
            health_trend = "Declining"

    return {
        "historical": {
            "labels":   [_month_label(m) for m in all_months],
            "sales":    y_sales,
            "expenses": y_expenses,
            "profit":   [y_sales[i] - y_expenses[i] for i in range(len(all_months))],
        },
        "forecast": {
            "labels":   [_month_label(m) for m in future_months],
            "sales":    [round(v, 2) for v in forecast_sales],
            "expenses": [round(v, 2) for v in forecast_expenses],
            "profit":   [round(v, 2) for v in forecast_profit],
            "health_scores": projected_health_scores,
        },
        "health_projection": {
            "scores": projected_health_scores,
            "average": avg_projected_health,
            "status": projected_health_status,
            "trend": health_trend,
        },
        "kpis": {
            "avg_forecast_sales":    round(avg_forecast_sales,    2),
            "avg_forecast_expenses": round(avg_forecast_expenses, 2),
            "avg_forecast_profit":   round(avg_forecast_profit,   2),
            "sales_growth_pct":      round(sales_growth_pct,      1),
            "confidence":            confidence,
            "trend_direction":       trend_direction,
            "trend_icon":            trend_icon,
            "trend_color":           trend_color,
            "periods":               periods,
            "model":                 model,
            "model_label":           model_labels.get(model, model),
        },
        "recommendations": recommendations,
    }
