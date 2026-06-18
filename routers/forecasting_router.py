from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from db.supabase_client import get_supabase_client
from collections import defaultdict
from datetime import datetime, date
from typing import Optional

router = APIRouter(prefix="/forecasting", tags=["forecasting"])
templates = Jinja2Templates(directory="templates")


@router.get("/", response_class=HTMLResponse)
async def read_forecasting(request: Request):
    """
    Renders the Forecasting HTML page.
    """
    return templates.TemplateResponse(
        request=request,
        name="forecasting.html",
        context={"title": "Forecasting", "active_page": "forecasting"},
    )


def _linear_regression(x: list[float], y: list[float]):
    """Returns (slope, intercept) for a simple linear regression."""
    n = len(x)
    if n < 2:
        return 0.0, (y[0] if y else 0.0)
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    numerator = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    denominator = sum((x[i] - mean_x) ** 2 for i in range(n))
    slope = numerator / denominator if denominator != 0 else 0.0
    intercept = mean_y - slope * mean_x
    return slope, intercept


def _month_index(month_str: str) -> int:
    """Converts 'YYYY-MM' to an integer index for regression (months since epoch)."""
    y, m = map(int, month_str.split("-"))
    return y * 12 + m


def _month_label(month_str: str) -> str:
    """Converts 'YYYY-MM' to a display label like 'Jan '26'."""
    dt = datetime.strptime(month_str, "%Y-%m")
    return dt.strftime("%b '%y")


def _next_months(last_month_str: str, count: int) -> list[str]:
    """Returns the next `count` month strings after `last_month_str`."""
    y, m = map(int, last_month_str.split("-"))
    result = []
    for _ in range(count):
        m += 1
        if m > 12:
            m = 1
            y += 1
        result.append(f"{y:04d}-{m:02d}")
    return result


@router.get("/api/forecast")
async def get_forecast(periods: Optional[int] = 3):
    """
    Computes a linear-regression forecast for sales and expenses
    using historical monthly aggregates. Returns up to `periods` future months.
    Falls back to mock data if Supabase is not connected.
    """
    from core.db_fallback import MOCK_SALES, MOCK_EXPENSES

    supabase = get_supabase_client()
    sales_data = []
    expenses_data = []

    if supabase:
        try:
            sales_res = supabase.table("sales").select("amount, date").execute()
            expenses_res = supabase.table("expenses").select("amount, date").execute()
            sales_data = sales_res.data or []
            expenses_data = expenses_res.data or []
        except Exception:
            pass

    if not sales_data and not expenses_data:
        sales_data = MOCK_SALES
        expenses_data = MOCK_EXPENSES

    # ── Aggregate by month ──────────────────────────────────────────────────
    sales_by_month: defaultdict[str, float] = defaultdict(float)
    for r in sales_data:
        try:
            month = str(r.get("date", ""))[:7]  # YYYY-MM
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
        return {"error": "No historical data available for forecasting."}

    # ── Build historical series ─────────────────────────────────────────────
    x_indices = [_month_index(m) for m in all_months]
    y_sales = [sales_by_month.get(m, 0.0) for m in all_months]
    y_expenses = [expenses_by_month.get(m, 0.0) for m in all_months]

    slope_s, intercept_s = _linear_regression(x_indices, y_sales)
    slope_e, intercept_e = _linear_regression(x_indices, y_expenses)

    # ── Project future months ───────────────────────────────────────────────
    periods = max(1, min(periods, 12))
    future_months = _next_months(all_months[-1], periods)
    future_x = [_month_index(m) for m in future_months]

    forecast_sales = [max(0.0, slope_s * xi + intercept_s) for xi in future_x]
    forecast_expenses = [max(0.0, slope_e * xi + intercept_e) for xi in future_x]
    forecast_profit = [s - e for s, e in zip(forecast_sales, forecast_expenses)]

    # ── Summary KPIs ────────────────────────────────────────────────────────
    avg_forecast_sales = sum(forecast_sales) / len(forecast_sales) if forecast_sales else 0
    avg_forecast_expenses = sum(forecast_expenses) / len(forecast_expenses) if forecast_expenses else 0
    avg_forecast_profit = avg_forecast_sales - avg_forecast_expenses

    last_actual_sales = y_sales[-1] if y_sales else 0
    sales_growth_pct = (
        ((avg_forecast_sales - last_actual_sales) / last_actual_sales * 100)
        if last_actual_sales > 0
        else 0
    )

    # ── Confidence level (based on R² of sales regression) ─────────────────
    if len(y_sales) >= 2:
        mean_y = sum(y_sales) / len(y_sales)
        ss_tot = sum((yi - mean_y) ** 2 for yi in y_sales)
        y_pred = [slope_s * xi + intercept_s for xi in x_indices]
        ss_res = sum((y_sales[i] - y_pred[i]) ** 2 for i in range(len(y_sales)))
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        confidence = max(0, min(100, int(r2 * 100)))
    else:
        confidence = 50

    # ── Trend direction ─────────────────────────────────────────────────────
    if slope_s > 0:
        trend_direction = "Upward"
        trend_icon = "fa-arrow-trend-up"
        trend_color = "#16a34a"
    elif slope_s < 0:
        trend_direction = "Downward"
        trend_icon = "fa-arrow-trend-down"
        trend_color = "#dc2626"
    else:
        trend_direction = "Flat"
        trend_icon = "fa-minus"
        trend_color = "#d97706"

    # ── Recommendations ─────────────────────────────────────────────────────
    recommendations = []
    if avg_forecast_expenses > avg_forecast_sales * 0.8:
        recommendations.append({
            "icon": "fa-triangle-exclamation",
            "color": "#dc2626",
            "title": "Expense Risk Ahead",
            "text": "Projected expenses are more than 80% of forecasted revenue. Consider reducing discretionary costs.",
        })
    if sales_growth_pct > 10:
        recommendations.append({
            "icon": "fa-rocket",
            "color": "#16a34a",
            "title": "Strong Growth Projected",
            "text": f"Sales are projected to grow by {sales_growth_pct:.1f}%. Consider scaling operations to match demand.",
        })
    if slope_e > slope_s:
        recommendations.append({
            "icon": "fa-chart-line",
            "color": "#d97706",
            "title": "Expense Growth Outpacing Sales",
            "text": "Expenses are growing faster than revenue. Review your cost structure to protect margins.",
        })
    if not recommendations:
        recommendations.append({
            "icon": "fa-circle-check",
            "color": "#2563eb",
            "title": "Stable Outlook",
            "text": "Forecasts indicate a balanced financial trajectory. Keep maintaining current operational efficiency.",
        })

    return {
        "historical": {
            "labels": [_month_label(m) for m in all_months],
            "sales": y_sales,
            "expenses": y_expenses,
            "profit": [y_sales[i] - y_expenses[i] for i in range(len(all_months))],
        },
        "forecast": {
            "labels": [_month_label(m) for m in future_months],
            "sales": [round(v, 2) for v in forecast_sales],
            "expenses": [round(v, 2) for v in forecast_expenses],
            "profit": [round(v, 2) for v in forecast_profit],
        },
        "kpis": {
            "avg_forecast_sales": round(avg_forecast_sales, 2),
            "avg_forecast_expenses": round(avg_forecast_expenses, 2),
            "avg_forecast_profit": round(avg_forecast_profit, 2),
            "sales_growth_pct": round(sales_growth_pct, 1),
            "confidence": confidence,
            "trend_direction": trend_direction,
            "trend_icon": trend_icon,
            "trend_color": trend_color,
            "periods": periods,
        },
        "recommendations": recommendations,
    }
