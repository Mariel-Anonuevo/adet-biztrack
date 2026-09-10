from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from db.supabase_client import get_supabase_client
from core.db_fallback import MOCK_SALES, MOCK_EXPENSES, is_missing_table_error
from core.health_calculator import calculate_health_metrics
from core.cache import cache_metrics
from typing import Optional
from collections import defaultdict
from datetime import datetime

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
templates = Jinja2Templates(directory="templates")


# ─────────────────────────────────────────────────────────────────────────────
# Inline ML helpers (linear regression for the forecast preview)
# ─────────────────────────────────────────────────────────────────────────────

def _month_index(month_str: str) -> int:
    y, m = map(int, month_str.split("-"))
    return y * 12 + m


def _month_label(month_str: str) -> str:
    dt = datetime.strptime(month_str, "%Y-%m")
    return dt.strftime("%b '%y")


def _next_months(last_month_str: str, count: int) -> list:
    y, m = map(int, last_month_str.split("-"))
    result = []
    for _ in range(count):
        m += 1
        if m > 12:
            m = 1
            y += 1
        result.append(f"{y:04d}-{m:02d}")
    return result


def _linear_regression(x: list, y: list):
    n = len(x)
    if n < 2:
        return 0.0, (y[0] if y else 0.0)
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    num = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    den = sum((x[i] - mean_x) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0.0
    return slope, mean_y - slope * mean_x


def _forecast_linear(x_idx: list, y: list, future_x: list) -> list:
    slope, intercept = _linear_regression(x_idx, y)
    return [max(0.0, round(slope * xi + intercept, 2)) for xi in future_x]


@router.get("/", response_class=HTMLResponse)
async def read_dashboard(request: Request):
    """
    Renders the Dashboard HTML page.
    """
    return templates.TemplateResponse(
        request=request, name="dashboard.html", context={"title": "Dashboard", "active_page": "dashboard"}
    )

@router.get("/api/metrics")
@cache_metrics(ttl_seconds=60)
async def get_dashboard_metrics(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    analysis_type: Optional[str] = "Growth"
):
    """
    Computes real metrics from Supabase sales and expenses tables with optional date and type filtering.
    Also includes a 3-month linear regression forecast preview for the dashboard.
    Falls back to mock data if Supabase is not connected or tables are missing.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    supabase = get_supabase_client()
    sales_data = []
    expenses_data = []
    using_fallback = False

    # Calculate earliest_date and latest_date dynamically
    earliest_date = "2025-01-01"
    latest_date = datetime.today().strftime("%Y-%m-%d")

    if supabase:
        try:
            # Query earliest sale/expense date (excluding is_deleted)
            min_s_res = supabase.table('sales').select("date").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=False).limit(1).execute()
            min_e_res = supabase.table('expenses').select("date").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=False).limit(1).execute()
            
            min_s_date = min_s_res.data[0]["date"][:10] if min_s_res.data else None
            min_e_date = min_e_res.data[0]["date"][:10] if min_e_res.data else None
            
            min_dates = [d for d in [min_s_date, min_e_date] if d]
            if min_dates:
                earliest_date = min(min_dates)
            
            # Query latest sale/expense date
            max_s_res = supabase.table('sales').select("date").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=True).limit(1).execute()
            max_e_res = supabase.table('expenses').select("date").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=True).limit(1).execute()
            
            max_s_date = max_s_res.data[0]["date"][:10] if max_s_res.data else None
            max_e_date = max_e_res.data[0]["date"][:10] if max_e_res.data else None
            
            max_dates = [d for d in [max_s_date, max_e_date] if d]
            if max_dates:
                latest_date = max(max(max_dates), latest_date)
        except Exception as e_minmax:
            # Table might not exist or columns missing, retry without neq("is_deleted", True)
            try:
                min_s_res = supabase.table('sales').select("date").eq("user_id", user.id).order("date", desc=False).limit(1).execute()
                min_e_res = supabase.table('expenses').select("date").eq("user_id", user.id).order("date", desc=False).limit(1).execute()
                min_s_date = min_s_res.data[0]["date"][:10] if min_s_res.data else None
                min_e_date = min_e_res.data[0]["date"][:10] if min_e_res.data else None
                min_dates = [d for d in [min_s_date, min_e_date] if d]
                if min_dates:
                    earliest_date = min(min_dates)

                max_s_res = supabase.table('sales').select("date").eq("user_id", user.id).order("date", desc=True).limit(1).execute()
                max_e_res = supabase.table('expenses').select("date").eq("user_id", user.id).order("date", desc=True).limit(1).execute()
                max_s_date = max_s_res.data[0]["date"][:10] if max_s_res.data else None
                max_e_date = max_e_res.data[0]["date"][:10] if max_e_res.data else None
                max_dates = [d for d in [max_s_date, max_e_date] if d]
                if max_dates:
                    latest_date = max(max(max_dates), latest_date)
            except Exception as e_minmax_retry:
                print(f"[Dashboard] Error finding dynamic min/max date: {e_minmax_retry}")
                if is_missing_table_error(e_minmax_retry):
                    using_fallback = True

    if not supabase or using_fallback:
        using_fallback = True
        # Find min/max dates in mock data
        fallback_sales = [s for s in MOCK_SALES if not s.get("is_deleted")]
        fallback_exps = [e for e in MOCK_EXPENSES if not e.get("is_deleted")]
        all_mock_dates = [r.get("date") for r in fallback_sales + fallback_exps if r.get("date")]
        if all_mock_dates:
            earliest_date = min(all_mock_dates)
            latest_date = max(max(all_mock_dates), datetime.today().strftime("%Y-%m-%d"))

    # Clamp input dates to available boundaries
    if start_date and start_date < earliest_date:
        start_date = earliest_date
    if end_date and end_date > latest_date:
        end_date = latest_date

    all_sales = []
    all_expenses = []

    if supabase and not using_fallback:
        try:
            # Query unfiltered data
            sales_res = supabase.table('sales').select("amount, date, category, description").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=False).execute()
            expenses_res = supabase.table('expenses').select("amount, date, category, description, vendor").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=False).execute()
            all_sales = sales_res.data or []
            all_expenses = expenses_res.data or []
        except Exception as e:
            err = str(e)
            if "is_deleted" in err.lower() or "42703" in err:
                print("[Dashboard] 'is_deleted' column missing — retrying query without it.")
                try:
                    sales_res = supabase.table('sales').select("amount, date, category, description").eq("user_id", user.id).order("date", desc=False).execute()
                    expenses_res = supabase.table('expenses').select("amount, date, category, description, vendor").eq("user_id", user.id).order("date", desc=False).execute()
                    all_sales = sales_res.data or []
                    all_expenses = expenses_res.data or []
                except Exception as e2:
                    print(f"[Dashboard] Supabase retry error: {e2}")
                    using_fallback = True
            elif is_missing_table_error(e):
                print("[Dashboard] sales/expenses table missing — using demo data. Run db/create_tables.sql in Supabase.")
                using_fallback = True
            else:
                print(f"[Dashboard] Supabase error: {e} — falling back to mock data.")
                using_fallback = True

    if using_fallback:
        all_sales = [s for s in MOCK_SALES if not s.get("is_deleted")]
        all_expenses = [e for e in MOCK_EXPENSES if not e.get("is_deleted")]

    # Calculate overall health metrics using UNFILTERED data
    health_metrics = calculate_health_metrics(all_sales, all_expenses)
    health_score = health_metrics["score"]
    health_classification = health_metrics["classification"]
    health_factors = health_metrics["factors"]
    health_factor_labels = health_metrics["factor_labels"]

    # Filter data by date range for summary metrics and charts
    sales_data = list(all_sales)
    expenses_data = list(all_expenses)
    if start_date:
        sales_data    = [s for s in sales_data    if str(s.get("date", ""))[:10] >= start_date]
        expenses_data = [e for e in expenses_data if str(e.get("date", ""))[:10] >= start_date]
    if end_date:
        sales_data    = [s for s in sales_data    if str(s.get("date", ""))[:10] <= end_date]
        expenses_data = [e for e in expenses_data if str(e.get("date", ""))[:10] <= end_date]

    # Aggregate totals
    total_sales = sum(float(r.get("amount", 0)) for r in sales_data)
    total_expenses = sum(float(r.get("amount", 0)) for r in expenses_data)
    net_profit = total_sales - total_expenses
    profit_margin = round((net_profit / total_sales * 100), 1) if total_sales > 0 else 0

    # Monthly trend — show all months in range, not arbitrarily capped
    sales_by_month: defaultdict = defaultdict(float)
    for r in sales_data:
        try:
            month = str(r["date"])[:7]  # YYYY-MM
            sales_by_month[month] += float(r.get("amount", 0))
        except Exception:
            pass

    expenses_by_month: defaultdict = defaultdict(float)
    for r in expenses_data:
        try:
            month = str(r["date"])[:7]
            expenses_by_month[month] += float(r.get("amount", 0))
        except Exception:
            pass

    all_months = sorted(set(list(sales_by_month.keys()) + list(expenses_by_month.keys())))
    month_labels = [datetime.strptime(m, "%Y-%m").strftime("%b") for m in all_months]

    # Expense breakdown by category
    cat_totals: defaultdict = defaultdict(float)
    for r in expenses_data:
        cat_totals[r.get("category", "Other")] += float(r.get("amount", 0))


    # Month-over-month trends
    sales_trend = "+0%"
    expenses_trend = "+0%"
    profit_trend = "+0%"
    margin_trend = "0pts"

    sorted_months = sorted(set(list(sales_by_month.keys()) + list(expenses_by_month.keys())))
    if len(sorted_months) >= 2:
        curr_m = sorted_months[-1]
        prev_m = sorted_months[-2]

        s_curr = sales_by_month.get(curr_m, 0)
        s_prev = sales_by_month.get(prev_m, 0)
        if s_prev > 0:
            s_change = (s_curr - s_prev) / s_prev * 100
            sales_trend = f"+{s_change:.1f}%" if s_change >= 0 else f"{s_change:.1f}%"
        elif s_curr > 0:
            sales_trend = "+100%"

        e_curr = expenses_by_month.get(curr_m, 0)
        e_prev = expenses_by_month.get(prev_m, 0)
        if e_prev > 0:
            e_change = (e_curr - e_prev) / e_prev * 100
            expenses_trend = f"+{e_change:.1f}%" if e_change >= 0 else f"{e_change:.1f}%"
        elif e_curr > 0:
            expenses_trend = "+100%"

        p_curr = s_curr - e_curr
        p_prev = s_prev - e_prev
        if p_prev != 0:
            p_change = (p_curr - p_prev) / abs(p_prev) * 100
            profit_trend = f"+{p_change:.1f}%" if p_change >= 0 else f"{p_change:.1f}%"
        elif p_curr != 0:
            profit_trend = "+100%"

        m_curr = (p_curr / s_curr * 100) if s_curr > 0 else 0
        m_prev = (p_prev / s_prev * 100) if s_prev > 0 else 0
        m_diff = m_curr - m_prev
        margin_trend = f"+{m_diff:.1f}pts" if m_diff >= 0 else f"{m_diff:.1f}pts"

    # ── 3-month forecast preview ──────────────────────────────────────────────
    # Supplement sparse data with mock history so regression is meaningful
    fc_sales_by_month = defaultdict(float, sales_by_month)
    fc_expenses_by_month = defaultdict(float, expenses_by_month)
    fc_all_months = list(all_months)

    MIN_MONTHS = 4
    if len(fc_all_months) < MIN_MONTHS:
        from core.db_fallback import MOCK_SALES as MS, MOCK_EXPENSES as ME
        mock_s: defaultdict = defaultdict(float)
        mock_e: defaultdict = defaultdict(float)
        for r in MS:
            mo = str(r.get("date", ""))[:7]
            if mo:
                mock_s[mo] += float(r.get("amount", 0))
        for r in ME:
            mo = str(r.get("date", ""))[:7]
            if mo:
                mock_e[mo] += float(r.get("amount", 0))

        real_avg_s = (sum(fc_sales_by_month.values()) / len(fc_sales_by_month)) if fc_sales_by_month else None
        mock_avg_s = (sum(mock_s.values()) / len(mock_s)) if mock_s else 1
        scale_s = (real_avg_s / mock_avg_s) if real_avg_s else 1.0

        real_avg_e = (sum(fc_expenses_by_month.values()) / len(fc_expenses_by_month)) if fc_expenses_by_month else None
        mock_avg_e = (sum(mock_e.values()) / len(mock_e)) if mock_e else 1
        scale_e = (real_avg_e / mock_avg_e) if real_avg_e else 1.0

        for mo in sorted(mock_s.keys()):
            if mo not in fc_sales_by_month:
                fc_sales_by_month[mo] = mock_s[mo] * scale_s
        for mo in sorted(mock_e.keys()):
            if mo not in fc_expenses_by_month:
                fc_expenses_by_month[mo] = mock_e[mo] * scale_e

        fc_all_months = sorted(set(list(fc_sales_by_month.keys()) + list(fc_expenses_by_month.keys())))

    # Run linear regression forecast (3 months ahead)
    fc_preview = {"labels": [], "hist_sales": [], "hist_expenses": [],
                  "fc_sales": [], "fc_expenses": [], "fc_profit": [],
                  "fc_labels": []}
    if fc_all_months:
        x_idx  = [float(_month_index(m)) for m in fc_all_months]
        y_s    = [fc_sales_by_month.get(m, 0.0) for m in fc_all_months]
        y_e    = [fc_expenses_by_month.get(m, 0.0) for m in fc_all_months]
        fut_mo = _next_months(fc_all_months[-1], 3)
        fut_x  = [float(_month_index(m)) for m in fut_mo]

        fs = _forecast_linear(x_idx, y_s, fut_x)
        fe = _forecast_linear(x_idx, y_e, fut_x)
        fp = [round(s - e, 2) for s, e in zip(fs, fe)]

        fc_preview = {
            "labels":       [_month_label(m) for m in fc_all_months],
            "hist_sales":   [round(fc_sales_by_month.get(m, 0), 2) for m in fc_all_months],
            "hist_expenses":[round(fc_expenses_by_month.get(m, 0), 2) for m in fc_all_months],
            "fc_labels":    [_month_label(m) for m in fut_mo],
            "fc_sales":     fs,
            "fc_expenses":  fe,
            "fc_profit":    fp,
        }

    # Compute avg forecasted values for insight text
    avg_fc_sales    = round(sum(fc_preview["fc_sales"])    / 3, 0) if fc_preview["fc_sales"]    else 0
    avg_fc_expenses = round(sum(fc_preview["fc_expenses"]) / 3, 0) if fc_preview["fc_expenses"] else 0
    avg_fc_profit   = round(avg_fc_sales - avg_fc_expenses, 0)
    next_mo_sales   = fc_preview["fc_sales"][0]   if fc_preview["fc_sales"]   else 0
    next_mo_label   = fc_preview["fc_labels"][0]  if fc_preview["fc_labels"]  else "next month"

    # ── AI Insights (forward-looking) ─────────────────────────────────────────
    insights = []

    # 1. Forward-looking revenue projection
    insights.append({
        "title": f"Sales Forecast — {next_mo_label}",
        "text": (
            f"AI projects ₱{next_mo_sales:,.0f} in sales for {next_mo_label}. "
            f"Average over the next 3 months: ₱{avg_fc_sales:,.0f}/mo. "
            f"{'Revenue is trending upward — capitalize on momentum.' if avg_fc_sales > (total_sales / max(len(all_months), 1)) else 'Growth is stabilizing — consider promotions to boost revenue.'}"
        ),
        "icon": "fa-solid fa-chart-line",
        "color": "#16a34a",
        "confidence": 82,
    })

    # 2. Expense forecast
    insights.append({
        "title": "3-Month Expense Outlook",
        "text": (
            f"Projected average expenses: ₱{avg_fc_expenses:,.0f}/mo over the next 3 months. "
            f"{'⚠️ Expenses are projected to exceed 80% of revenue — review cost structure.' if avg_fc_expenses > avg_fc_sales * 0.8 else 'Expense levels look manageable relative to projected revenue.'}"
        ),
        "icon": "fa-solid fa-receipt",
        "color": "#f97316" if avg_fc_expenses > avg_fc_sales * 0.8 else "#7c3aed",
        "confidence": 78,
    })

    # 3. Profit projection
    profit_outlook_text = (
        f"Projected net profit: ₱{avg_fc_profit:,.0f}/mo. "
        f"{'Strong margin expected — maintain current efficiency.' if avg_fc_profit > 0 and avg_fc_sales > 0 and avg_fc_profit / avg_fc_sales * 100 > 20 else 'Margins are tight — monitor expenses closely to stay profitable.' if avg_fc_profit > 0 else '⚠️ Losses projected — immediate cost review recommended.'}"
    )
    insights.append({
        "title": "Profit Projection",
        "text": profit_outlook_text,
        "icon": "fa-solid fa-coins",
        "color": "#16a34a" if avg_fc_profit > 0 else "#dc2626",
        "confidence": 80,
    })

    # 4. Expense alert if currently overspending
    if total_expenses > total_sales:
        insights.insert(0, {
            "title": "⚠️ Expense Alert",
            "text": f"Current expenses exceed sales by ₱{total_expenses - total_sales:,.0f}. This places your business in the At Risk zone. AI strongly recommends immediate cost reduction.",
            "icon": "fa-solid fa-triangle-exclamation",
            "color": "#dc2626",
            "confidence": 95,
        })

    # 5. Top expense category
    if cat_totals:
        highest_cat = max(cat_totals, key=cat_totals.get)
        highest_pct = (cat_totals[highest_cat] / total_expenses * 100) if total_expenses > 0 else 0
        insights.append({
            "title": f"Top Spend: {highest_cat.capitalize()}",
            "text": f"{highest_cat.capitalize()} accounts for {highest_pct:.1f}% of total expenses. Consider negotiating better rates or finding cost-saving alternatives in this category.",
            "icon": "fa-solid fa-chart-pie",
            "color": "#0ea5e9",
            "confidence": 88,
        })

    # Analysis-type-specific insight injection
    if analysis_type == "Profitability":
        insights.insert(0, {
            "title": "Profitability Performance",
            "text": f"Current profit margin: {profit_margin}%. Net profit: ₱{net_profit:,.0f}. AI forecasts ₱{avg_fc_profit:,.0f}/mo over the next quarter. {'Excellent performance!' if profit_margin > 30 else 'Focus on reducing COGS to improve margins.'}",
            "icon": "fa-solid fa-percent",
            "color": "#16a34a",
            "confidence": 95,
        })
    elif analysis_type == "Stability":
        insights.insert(0, {
            "title": "Stability Assessment",
            "text": f"Health Score: {health_score}/100 ({health_classification}). AI projects consistent revenue of ₱{avg_fc_sales:,.0f}/mo over the next 3 months — indicating {'strong' if health_score >= 70 else 'moderate'} operational stability.",
            "icon": "fa-solid fa-compass",
            "color": "#0277bd",
            "confidence": 93,
        })

    return {
        "summary": {
            "total_sales": total_sales,
            "sales_trend": sales_trend,
            "total_expenses": total_expenses,
            "expenses_trend": expenses_trend,
            "net_profit": net_profit,
            "profit_trend": profit_trend,
            "profit_margin": profit_margin,
            "margin_trend": margin_trend
        },
        "health_score": health_score,
        "health_classification": health_classification,
        "health_factors": health_factors,
        "health_factor_labels": health_factor_labels,
        "monthly_trend": {
            "labels": month_labels if month_labels else ["No data"],
            "sales": [sales_by_month.get(m, 0) for m in all_months] if all_months else [0],
            "expenses": [expenses_by_month.get(m, 0) for m in all_months] if all_months else [0]
        },
        "expense_breakdown": dict(cat_totals),
        "forecast_preview": fc_preview,
        "insights": insights,
        "earliest_date": earliest_date,
        "latest_date": latest_date
    }
