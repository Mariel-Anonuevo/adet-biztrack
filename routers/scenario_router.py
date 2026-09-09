from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from db.supabase_client import get_supabase_client
from collections import defaultdict
from datetime import datetime
from typing import Optional
import json
import urllib.request
from core.config import get_settings
from core.security import sanitize_html

router = APIRouter(prefix="/scenario-sim", tags=["scenario-sim"])
templates = Jinja2Templates(directory="templates")

# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

def _month_index(month_str: str) -> int:
    y, m = map(int, month_str.split("-"))
    return y * 12 + m

def _month_label(month_str: str) -> str:
    dt = datetime.strptime(month_str, "%Y-%m")
    return dt.strftime("%b '%y")

def _next_months(last_month_str: str, count: int) -> list[str]:
    y, m = map(int, last_month_str.split("-"))
    result = []
    for _ in range(count):
        m += 1
        if m > 12:
            m = 1
            y += 1
        result.append(f"{y:04d}-{m:02d}")
    return result

def _linear_regression(x: list[float], y: list[float]) -> tuple[float, float]:
    n = len(x)
    if n < 2:
        return 0.0, (y[0] if y else 0.0)
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    num = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    den = sum((x[i] - mean_x) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0.0
    return slope, mean_y - slope * mean_x

# ─────────────────────────────────────────────────────────────────────────────
# Request Schema
# ─────────────────────────────────────────────────────────────────────────────

class ScenarioParams(BaseModel):
    sales_growth: float          # percentage, e.g. 10 means +10%
    expense_growth: float        # percentage, e.g. -5 means -5%
    additional_marketing: float  # flat amount in PHP
    additional_hiring: float     # flat amount in PHP

# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def read_scenario_sim(request: Request):
    """Renders the Scenario Simulation page."""
    return templates.TemplateResponse(
        request=request,
        name="scenario_sim.html",
        context={"title": "Scenario Sim", "active_page": "scenario_sim"},
    )

@router.get("/api/baseline")
async def get_baseline_data(request: Request):
    """
    Fetches historical data from Supabase/Fallback mock data, 
    and returns it along with a 6-month baseline linear regression forecast.
    """
    from core.db_fallback import MOCK_SALES, MOCK_EXPENSES

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
                print("[ScenarioSim] 'is_deleted' column missing — retrying query without it.")
                try:
                    s_res = supabase.table("sales").select("amount, date").eq("user_id", user.id).execute()
                    e_res = supabase.table("expenses").select("amount, date").eq("user_id", user.id).execute()
                    sales_data    = s_res.data or []
                    expenses_data = e_res.data or []
                except Exception as ex2:
                    print(f"[ScenarioSim] Supabase retry error: {ex2}")
                    using_fallback = True
            elif is_missing_table_error(ex):
                print(f"[ScenarioSim] Missing table: {ex} — using mock data")
                using_fallback = True
            else:
                from core.db_error_handler import handle_db_error
                handle_db_error(ex)
    else:
        using_fallback = True

    if using_fallback:
        sales_data    = [s for s in MOCK_SALES if not s.get("is_deleted")]
        expenses_data = [e for e in MOCK_EXPENSES if not e.get("is_deleted")]

    # Aggregate by month
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

    # No blending guard block needed - we rely solely on user's real records if connected.

    if not all_months:
        return {"error": "No historical data available. Please add some sales or expenses records first."}

    # Build historical vectors
    x_indices = [float(_month_index(m)) for m in all_months]
    y_sales = [sales_by_month.get(m, 0.0) for m in all_months]
    y_expenses = [expenses_by_month.get(m, 0.0) for m in all_months]

    # Generate 6 months baseline forecast
    periods = 6
    future_months = _next_months(all_months[-1], periods)
    future_x = [float(_month_index(m)) for m in future_months]

    slope_s, intercept_s = _linear_regression(x_indices, y_sales)
    slope_e, intercept_e = _linear_regression(x_indices, y_expenses)

    baseline_sales = [max(0.0, slope_s * xi + intercept_s) for xi in future_x]
    baseline_expenses = [max(0.0, slope_e * xi + intercept_e) for xi in future_x]

    # Clamp explosive expense forecasts (cap at 3x max historical)
    max_hist_expense = max(y_expenses) if y_expenses else 1.0
    baseline_expenses = [min(e, max_hist_expense * 3) for e in baseline_expenses]

    return {
        "historical": {
            "labels": [_month_label(m) for m in all_months],
            "sales": y_sales,
            "expenses": y_expenses,
            "profit": [y_sales[i] - y_expenses[i] for i in range(len(all_months))]
        },
        "baseline": {
            "labels": [_month_label(m) for m in future_months],
            "sales": [round(s, 2) for s in baseline_sales],
            "expenses": [round(e, 2) for e in baseline_expenses],
            "profit": [round(s - e, 2) for s, e in zip(baseline_sales, baseline_expenses)]
        }
    }

@router.post("/api/analyze")
async def analyze_scenario(request: Request, params: ScenarioParams):
    """
    Performs Gemini AI strategy recommendation analysis on the simulated variables.
    """
    settings = get_settings()
    api_key = settings.gemini_api_key

    # Fetch baseline data to construct numbers
    base_res = await get_baseline_data(request)
    if "error" in base_res:
        raise HTTPException(status_code=400, detail=base_res["error"])

    baseline = base_res["baseline"]
    sales_proj = baseline["sales"]
    expenses_proj = baseline["expenses"]

    # Calculate simulated numbers
    simulated_sales = []
    simulated_expenses = []

    for i in range(len(sales_proj)):
        # Apply sales growth offset
        s_val = sales_proj[i] * (1.0 + params.sales_growth / 100.0)
        simulated_sales.append(s_val)

        # Apply expense growth offset + flat additional spend
        e_val = expenses_proj[i] * (1.0 + params.expense_growth / 100.0)
        e_val += params.additional_marketing + params.additional_hiring
        simulated_expenses.append(e_val)

    # Compute aggregates
    total_baseline_sales = sum(sales_proj)
    total_baseline_expenses = sum(expenses_proj)
    total_baseline_profit = total_baseline_sales - total_baseline_expenses
    baseline_margin = (total_baseline_profit / total_baseline_sales * 100) if total_baseline_sales > 0 else 0.0

    total_simulated_sales = sum(simulated_sales)
    total_simulated_expenses = sum(simulated_expenses)
    total_simulated_profit = total_simulated_sales - total_simulated_expenses
    simulated_margin = (total_simulated_profit / total_simulated_sales * 100) if total_simulated_sales > 0 else 0.0

    # Build prompt
    context_prompt = (
        f"You are the BizTrack AI Financial Strategist. The business owner is simulating a future scenario over the next 6 months with the following modifications to their baseline forecast:\n"
        f"- Sales Growth Rate Adjustment: {params.sales_growth:+.1f}%\n"
        f"- Expense Growth Rate Adjustment: {params.expense_growth:+.1f}%\n"
        f"- Additional Monthly Marketing Budget: ₱{params.additional_marketing:,.2f}\n"
        f"- Additional Monthly Staff Hiring Costs: ₱{params.additional_hiring:,.2f}\n\n"
        f"Here are the resulting simulated financial projections:\n"
        f"- Total Simulated Revenue over 6 months: ₱{total_simulated_sales:,.2f} (compared to baseline: ₱{total_baseline_sales:,.2f})\n"
        f"- Total Simulated Expenses over 6 months: ₱{total_simulated_expenses:,.2f} (compared to baseline: ₱{total_baseline_expenses:,.2f})\n"
        f"- Net Simulated Profit over 6 months: ₱{total_simulated_profit:,.2f} (compared to baseline: ₱{total_baseline_profit:,.2f})\n"
        f"- Simulated Net Margin: {simulated_margin:.1f}% (compared to baseline: {baseline_margin:.1f}%)\n\n"
        f"Please provide an executive summary and strategic advice in markdown format. Focus on:\n"
        f"1. A review of this scenario's feasibility and cash flow health.\n"
        f"2. Recommendations for optimization (e.g., if hiring costs are too high, or if marketing ROI needs validation).\n"
        f"3. Concrete steps the business should take to execute this scenario successfully.\n\n"
        f"Keep the tone professional, motivating, and clear. Avoid greeting introductions. Use clean markdown formatting."
    )

    if not api_key or api_key.strip() == "" or api_key == "your-gemini-api-key-here":
        return {
            "report": (
                "### 💡 AI Integration Setup Required\n\n"
                "To get customized strategic business advice based on your simulation, please add your Gemini API Key to your `.env` file:\n"
                "```env\n"
                "GEMINI_API_KEY=your_key_here\n"
                "```"
            )
        }

    try:
        from core.gemini import query_gemini
        reply_text = query_gemini(context_prompt)
        return {"report": reply_text}
    except Exception as e:
        print(f"Gemini API simulation analysis error: {e}")
        return {"report": f"Sorry, I encountered an error communicating with Gemini AI: {str(e)}"}

