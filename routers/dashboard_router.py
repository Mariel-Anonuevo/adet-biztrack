from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from db.supabase_client import get_supabase_client
from typing import Optional

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def read_dashboard(request: Request):
    """
    Renders the Dashboard HTML page.
    """
    return templates.TemplateResponse(
        request=request, name="dashboard.html", context={"title": "Dashboard", "active_page": "dashboard"}
    )

@router.get("/api/metrics")
async def get_dashboard_metrics(start_date: Optional[str] = None, end_date: Optional[str] = None, analysis_type: Optional[str] = "Growth"):
    """
    Computes real metrics from Supabase sales and expenses tables with optional date and type filtering.
    Falls back to mock data if Supabase is not connected.
    """
    from core.db_fallback import MOCK_SALES, MOCK_EXPENSES
    from collections import defaultdict
    from datetime import datetime

    supabase = get_supabase_client()
    sales_data = []
    expenses_data = []
    using_fallback = False

    if supabase:
        try:
            # Fetch all sales
            sales_res = supabase.table('sales').select("amount, date").execute()
            # Fetch all expenses
            expenses_res = supabase.table('expenses').select("amount, date, category").execute()

            sales_data = sales_res.data or []
            expenses_data = expenses_res.data or []
        except Exception as e:
            using_fallback = True
    else:
        using_fallback = True

    if using_fallback or (not sales_data and not expenses_data):
        sales_data = MOCK_SALES
        expenses_data = MOCK_EXPENSES

    # Server-side date filtering
    if start_date:
        sales_data = [s for s in sales_data if s.get("date", "") >= start_date]
        expenses_data = [e for e in expenses_data if e.get("date", "") >= start_date]
    if end_date:
        sales_data = [s for s in sales_data if s.get("date", "") <= end_date]
        expenses_data = [e for e in expenses_data if e.get("date", "") <= end_date]

    total_sales = sum(r.get("amount", 0) for r in sales_data)
    total_expenses = sum(r.get("amount", 0) for r in expenses_data)
    net_profit = total_sales - total_expenses
    profit_margin = round((net_profit / total_sales * 100), 1) if total_sales > 0 else 0

    # Monthly trend
    sales_by_month = defaultdict(float)
    for r in sales_data:
        try:
            month = r["date"][:7]  # YYYY-MM
            sales_by_month[month] += r.get("amount", 0)
        except Exception:
            pass

    expenses_by_month = defaultdict(float)
    for r in expenses_data:
        try:
            month = r["date"][:7]
            expenses_by_month[month] += r.get("amount", 0)
        except Exception:
            pass

    all_months = sorted(set(list(sales_by_month.keys()) + list(expenses_by_month.keys())))[-5:]
    month_labels = [datetime.strptime(m, "%Y-%m").strftime("%b") for m in all_months]

    # Expense breakdown by category
    cat_totals = defaultdict(float)
    for r in expenses_data:
        cat_totals[r.get("category", "Other")] += r.get("amount", 0)

    # Use shared health metrics calculator
    from core.health_calculator import calculate_health_metrics
    health_metrics = calculate_health_metrics(sales_data, expenses_data)
    health_score = health_metrics["score"]
    health_classification = health_metrics["classification"]
    health_factors = health_metrics["factors"]

    # Calculate trends dynamically
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
            s_change = ((s_curr - s_prev) / s_prev * 100)
            sales_trend = f"+{s_change:.1f}%" if s_change >= 0 else f"{s_change:.1f}%"
        elif s_curr > 0:
            sales_trend = "+100%"
        
        e_curr = expenses_by_month.get(curr_m, 0)
        e_prev = expenses_by_month.get(prev_m, 0)
        if e_prev > 0:
            e_change = ((e_curr - e_prev) / e_prev * 100)
            expenses_trend = f"+{e_change:.1f}%" if e_change >= 0 else f"{e_change:.1f}%"
        elif e_curr > 0:
            expenses_trend = "+100%"
        
        p_curr = s_curr - e_curr
        p_prev = s_prev - e_prev
        if p_prev != 0:
            p_change = ((p_curr - p_prev) / abs(p_prev) * 100)
            profit_trend = f"+{p_change:.1f}%" if p_change >= 0 else f"{p_change:.1f}%"
        elif p_curr != 0:
            profit_trend = "+100%"
        
        m_curr = (p_curr / s_curr * 100) if s_curr > 0 else 0
        m_prev = (p_prev / s_prev * 100) if s_prev > 0 else 0
        m_diff = m_curr - m_prev
        margin_trend = f"+{m_diff:.1f}pts" if m_diff >= 0 else f"{m_diff:.1f}pts"

    # Calculate dynamic AI Insights
    insights = []
    if total_expenses > total_sales:
        insights.append({
            "title": "Expense Alert",
            "text": f"Expenses are exceeding sales by ₱{total_expenses - total_sales:,.2f}. This places your business in the At Risk zone.",
            "icon": "fa-solid fa-triangle-exclamation",
            "color": "#dc2626",
            "confidence": 95
        })

    if cat_totals:
        highest_cat = max(cat_totals, key=cat_totals.get)
        highest_val = cat_totals[highest_cat]
        highest_pct = (highest_val / total_expenses * 100) if total_expenses > 0 else 0
        insights.append({
            "title": f"Highest Spend: {highest_cat.capitalize()}",
            "text": f"Your spend on {highest_cat} is your largest expense component, accounting for {highest_pct:.1f}% of total costs.",
            "icon": "fa-solid fa-chart-pie",
            "color": "#7c3aed",
            "confidence": 88
        })

    if profit_margin > 30:
        insights.append({
            "title": "Strong Profit Margin",
            "text": f"Your current profit margin is a healthy {profit_margin}%. Keep maintaining this level of operational efficiency.",
            "icon": "fa-solid fa-trophy",
            "color": "#16a34a",
            "confidence": 92
        })
    elif profit_margin > 0:
        insights.append({
            "title": "Stable Margins",
            "text": f"Your net profit margin is {profit_margin}%. Opportunities exist to optimize expense ratios.",
            "icon": "fa-solid fa-shield-halved",
            "color": "#d97706",
            "confidence": 85
        })

    if not insights:
        insights.append({
            "title": "Data density optimized",
            "text": "Add more sales and expense records to unlock deeper AI trend matching & anomaly detection insights.",
            "icon": "fa-solid fa-circle-info",
            "color": "#2563eb",
            "confidence": 99
        })

    # Custom Analysis Type Insight injection
    if analysis_type == "Profitability":
        insights.insert(0, {
            "title": "Profitability Performance",
            "text": f"Profit Margin is {profit_margin}%. Net profit totals ₱{net_profit:,.0f}. Keep minimizing fixed cost overheads.",
            "icon": "fa-solid fa-percent",
            "color": "#16a34a",
            "confidence": 95
        })
    elif analysis_type == "Stability":
        insights.insert(0, {
            "title": "Stability Assessment",
            "text": f"Financial Health Score is classified as {health_classification} ({health_score}/100). Consistency rating is stable.",
            "icon": "fa-solid fa-compass",
            "color": "#0277bd",
            "confidence": 93
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
        "monthly_trend": {
            "labels": month_labels if month_labels else ["No data"],
            "sales": [sales_by_month.get(m, 0) for m in all_months] if all_months else [0],
            "expenses": [expenses_by_month.get(m, 0) for m in all_months] if all_months else [0]
        },
        "expense_breakdown": dict(cat_totals),
        "insights": insights
    }
