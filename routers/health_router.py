from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from db.supabase_client import get_supabase_client

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
async def get_health_metrics():
    """
    Computes real business health score from Supabase sales and expenses data.
    Falls back to mock data if not connected.
    """
    supabase = get_supabase_client()

    if supabase:
        try:
            from collections import defaultdict
            from datetime import datetime

            sales_res = supabase.table('sales').select("amount, date").execute()
            expenses_res = supabase.table('expenses').select("amount, date").execute()

            sales_data = sales_res.data or []
            expenses_data = expenses_res.data or []

            total_sales = sum(r.get("amount", 0) for r in sales_data)
            total_expenses = sum(r.get("amount", 0) for r in expenses_data)

            # Use shared health metrics calculator
            from core.health_calculator import calculate_health_metrics
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
                    month = r["date"][:7]
                    sales_by_month[month] += r.get("amount", 0)
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
                        mo = r["date"][:7]
                        exp_by_month[mo] += r.get("amount", 0)
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

        except Exception as e:
            from core.db_error_handler import handle_db_error
            handle_db_error(e)
    else:
        # Fallback mock data
        return {
            "current_score": 38,
            "classification": "At Risk",
            "factors": {
                "revenue_trend": 42,
                "expense_ratio": 29,
                "profit_margin": 33,
                "cash_consistency": 48
            },
            "trend_assessment": "Declining",
            "history": {
                "labels": ["Dec 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "May 26"],
                "scores": [62, 58, 54, 49, 44, 38],
                "statuses": ["Stable", "Stable", "Stable", "Stable", "Stable", "At Risk"]
            }
        }
