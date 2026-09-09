from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from db.supabase_client import get_supabase_client
from core.cache import cache_metrics

router = APIRouter(prefix="/health", tags=["health"])
templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def read_health(request: Request):
    """
    Renders the Health Score HTML page.
    """
    return templates.TemplateResponse(
        request=request, name="health.html", context={"title": "Health Score", "active_page": "health"}
    )

@router.get("/api/metrics")
@cache_metrics(ttl_seconds=60)
async def get_health_metrics(request: Request):
    """
    Computes real business health score from Supabase sales and expenses data.
    Falls back to mock data if not connected or table errors occur.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    from collections import defaultdict
    from datetime import datetime
    from core.health_calculator import calculate_health_metrics
    from core.db_fallback import MOCK_SALES, MOCK_EXPENSES, is_missing_table_error

    supabase = get_supabase_client()
    sales_data = []
    expenses_data = []
    using_fallback = False

    if supabase:
        try:
            try:
                sales_res = supabase.table('sales').select("amount, date").eq("user_id", user.id).neq("is_deleted", True).execute()
                expenses_res = supabase.table('expenses').select("amount, date").eq("user_id", user.id).neq("is_deleted", True).execute()
                sales_data = sales_res.data or []
                expenses_data = expenses_res.data or []
            except Exception as ex:
                err = str(ex)
                if "is_deleted" in err.lower() or "42703" in err:
                    print("[Health] 'is_deleted' column missing — retrying query without it.")
                    sales_res = supabase.table('sales').select("amount, date").eq("user_id", user.id).execute()
                    expenses_res = supabase.table('expenses').select("amount, date").eq("user_id", user.id).execute()
                    sales_data = sales_res.data or []
                    expenses_data = expenses_res.data or []
                elif is_missing_table_error(ex):
                    using_fallback = True
                else:
                    raise ex
        except Exception as e:
            print(f"[Health] Supabase query failed: {e} — falling back to mock data.")
            using_fallback = True
    else:
        using_fallback = True

    if using_fallback:
        sales_data = [s for s in MOCK_SALES if not s.get("is_deleted")]
        expenses_data = [e for e in MOCK_EXPENSES if not e.get("is_deleted")]

    # Calculate overall health metrics
    metrics = calculate_health_metrics(sales_data, expenses_data)
    current_score = metrics["score"]
    classification = metrics["classification"]
    revenue_trend_score = metrics["factors"]["revenue_trend"]
    expense_ratio_score = metrics["factors"]["expense_ratio"]
    profit_margin_score = metrics["factors"]["profit_margin"]
    cash_consistency_score = metrics["factors"]["cash_consistency"]

    sales_by_month = defaultdict(float)
    for r in sales_data:
        try:
            month = str(r["date"])[:7]
            sales_by_month[month] += float(r.get("amount", 0))
        except Exception:
            pass
    sorted_months = sorted(sales_by_month.keys())

    # History labels from available months
    history_labels = [datetime.strptime(m, "%Y-%m").strftime("%b '%y") for m in sorted_months[-6:]]
    # Approximate scores per month using cumulative data
    history_scores = []
    cumulative_sales = 0
    cumulative_expenses = 0
    for m in sorted_months[-6:]:
        cumulative_sales += sales_by_month.get(m, 0)
        exp_by_month = defaultdict(float)
        for r in expenses_data:
            try:
                mo = str(r["date"])[:7]
                exp_by_month[mo] += float(r.get("amount", 0))
            except Exception:
                pass
        cumulative_expenses += exp_by_month.get(m, 0)
        ratio = (cumulative_expenses / cumulative_sales) if cumulative_sales > 0 else 1
        history_scores.append(max(0, min(100, int(100 - ratio * 100))))

    return {
        "current_score": current_score,
        "classification": classification,
        "factors": {
            "revenue_trend": revenue_trend_score,
            "expense_ratio": expense_ratio_score,
            "profit_margin": profit_margin_score,
            "cash_consistency": cash_consistency_score
        },
        "trend_assessment": "Growing" if revenue_trend_score > 55 else "Declining" if revenue_trend_score < 45 else "Stable",
        "history": {
            "labels": history_labels if history_labels else ["Now"],
            "scores": history_scores if history_scores else [current_score],
            "statuses": [classification] * len(history_scores) if history_scores else [classification]
        }
    }
