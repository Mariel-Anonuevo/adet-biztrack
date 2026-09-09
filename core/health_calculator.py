from collections import defaultdict
from datetime import datetime

def calculate_health_metrics(sales_data: list, expenses_data: list) -> dict:
    """
    Shared helper to compute identical, dynamic business health metrics
    from sales and expenses data.
    """
    if not sales_data and not expenses_data:
        return {
            "score": 0,
            "classification": "No Data",
            "factors": {
                "revenue_trend": 0,
                "expense_ratio": 0,
                "profit_margin": 0,
                "cash_consistency": 0
            },
            "factor_labels": {
                "revenue_trend": "No Data",
                "expense_ratio": "No Data",
            }
        }

    total_sales = float(sum(r.get("amount", 0) for r in sales_data))
    total_expenses = float(sum(r.get("amount", 0) for r in expenses_data))

    # 1. Profit margin score (higher profit margin = better)
    expense_ratio = (total_expenses / total_sales) if total_sales > 0 else 1.0
    profit_margin_score = max(0, min(100, int((1.0 - expense_ratio) * 100)))

    # 2. Expense ratio score (lower expense ratio = better)
    expense_ratio_score = max(0, min(100, int(100 - (expense_ratio * 100))))

    # 3. Revenue trend: month-over-month growth
    sales_by_month = defaultdict(float)
    for r in sales_data:
        try:
            month = str(r["date"])[:7]  # YYYY-MM
            sales_by_month[month] += float(r.get("amount", 0))
        except Exception:
            pass

    sorted_months = sorted(sales_by_month.keys())
    if len(sorted_months) >= 2:
        prev = sales_by_month[sorted_months[-2]]
        curr = sales_by_month[sorted_months[-1]]
        growth = ((curr - prev) / prev) if prev > 0 else 0.0
        revenue_trend_score = max(0, min(100, int(50 + growth * 100)))
    else:
        revenue_trend_score = 50

    # 4. Cash consistency (more months with data = better)
    cash_consistency_score = min(100, len(sorted_months) * 15)

    # Overall weighted health score (matches frontend slider weights: Profitability 40%, Growth 25%, Stability 35%)
    current_score = int(
        profit_margin_score * 0.40 +
        revenue_trend_score * 0.25 +
        expense_ratio_score * 0.35
    )

    if current_score >= 70:
        classification = "Healthy"
    elif current_score >= 40:
        classification = "Stable"
    else:
        classification = "At Risk"

    # Build human-readable labels for dashboard display
    if revenue_trend_score >= 60:
        revenue_trend_label = "Positive ↑"
    elif revenue_trend_score >= 40:
        revenue_trend_label = "Stable →"
    else:
        revenue_trend_label = "Declining ↓"

    expense_ratio_pct = round(expense_ratio * 100, 1)
    if expense_ratio_pct <= 60:
        expense_ratio_label = f"{expense_ratio_pct}% — Good"
    elif expense_ratio_pct <= 85:
        expense_ratio_label = f"{expense_ratio_pct}% — High"
    else:
        expense_ratio_label = f"{expense_ratio_pct}% — Critical"

    return {
        "score": current_score,
        "classification": classification,
        # Raw numeric scores used by health.js for slider recalculation
        "factors": {
            "revenue_trend": revenue_trend_score,
            "expense_ratio": expense_ratio_score,
            "profit_margin": profit_margin_score,
            "cash_consistency": cash_consistency_score
        },
        # Human-readable labels used by the dashboard display
        "factor_labels": {
            "revenue_trend": revenue_trend_label,
            "expense_ratio": expense_ratio_label,
        }
    }
