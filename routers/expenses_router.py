from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re
from db.supabase_client import get_supabase_client
from core.security import sanitize_html

router = APIRouter(prefix="/expenses", tags=["expenses"])
templates = Jinja2Templates(directory="templates")

class ExpenseRecord(BaseModel):
    # 🔒 INPUT VALIDATION: Enforce strict structural schema rules (Mitigates V5 / T5)
    date: str = Field(..., description="Date of expense, YYYY-MM-DD")
    description: str = Field(..., min_length=2, max_length=100, description="Expense description details")
    category: str = Field(..., min_length=2, max_length=50, description="Category of expense")
    vendor: Optional[str] = Field(None, max_length=100, description="Vendor name")
    amount: float = Field(..., gt=0, description="Expense amount, must be strictly positive")
    receipt: Optional[str] = Field(None, max_length=100)

    @field_validator("date")
    @classmethod
    def validate_date_pattern(cls, v: str) -> str:
        """Enforces YYYY-MM-DD date representation."""
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Date of expense must follow the YYYY-MM-DD standard format.")
        return v

@router.get("/", response_class=HTMLResponse)
async def read_expenses(request: Request):
    """
    Renders the Expenses HTML page.
    """
    return templates.TemplateResponse(
        request=request, name="expenses.html", context={"title": "Expenses", "active_page": "expenses"}
    )

@router.get("/api/records")
async def get_expense_records():
    """
    Fetches expense records from Supabase. Falls back to mock data if not connected.
    """
    supabase = get_supabase_client()

    from core.db_fallback import MOCK_EXPENSES, is_missing_table_error, normalize_expense_row

    if supabase:
        try:
            response = supabase.table('expenses').select("*").order("date", desc=True).execute()
            rows = response.data or []
            return [normalize_expense_row(r) for r in rows]
        except Exception as e:
            if is_missing_table_error(e):
                print("[DB] expenses table missing — using demo data. Run db/create_tables.sql in Supabase.")
                return MOCK_EXPENSES
            from core.db_error_handler import handle_db_error
            handle_db_error(e)
    return MOCK_EXPENSES

@router.post("/api/records")
async def create_expense_record(record: ExpenseRecord):
    """
    Creates a new expense record in Supabase.
    """
    # 🔒 INPUT SANITIZATION (Mitigates V4 / T4 - XSS Prevention)
    # Neutralize script injection payloads on the server side prior to database insertion.
    clean_description = sanitize_html(record.description)
    clean_category = sanitize_html(record.category)
    clean_vendor = sanitize_html(record.vendor) if record.vendor else None
    clean_receipt = sanitize_html(record.receipt) if record.receipt else None

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    try:
        response = supabase.table('expenses').insert({
            "date": record.date,
            "description": clean_description,
            "category": clean_category,
            "vendor": clean_vendor,
            "amount": record.amount,
            "receipt": clean_receipt
        }).execute()
        return {"message": "Expense record created", "data": response.data}
    except Exception as e:
        from core.db_error_handler import handle_db_error
        handle_db_error(e)
