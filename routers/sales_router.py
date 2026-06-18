from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
import re
from db.supabase_client import get_supabase_client
from core.security import sanitize_html

router = APIRouter(prefix="/sales", tags=["sales"])
templates = Jinja2Templates(directory="templates")

class SalesRecord(BaseModel):
    # 🔒 INPUT VALIDATION: Enforce strict structural schema rules (Mitigates V5 / T5)
    date: str = Field(..., description="Date of transaction, YYYY-MM-DD")
    description: str = Field(..., min_length=2, max_length=100, description="Sale description details")
    category: str = Field(..., min_length=2, max_length=50, description="Category of sale")
    amount: float = Field(..., gt=0, description="Amount in Pesos, must be strictly positive")
    receipt: Optional[str] = Field(None, max_length=100)

    @field_validator("date")
    @classmethod
    def validate_date_pattern(cls, v: str) -> str:
        """Enforces YYYY-MM-DD date representation."""
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Date of sale must follow the YYYY-MM-DD standard format.")
        return v

@router.get("/", response_class=HTMLResponse)
async def read_sales_dashboard(request: Request):
    """
    Renders the Sales Dashboard HTML page using Jinja2.
    """
    return templates.TemplateResponse(
        request=request, name="sales.html", context={"title": "Sales", "active_page": "sales"}
    )

@router.get("/api/records")
async def get_sales_records():
    """
    API Endpoint to fetch sales records. 
    It tries to fetch from Supabase. Falls back to demo data if tables are missing.
    """
    from core.db_fallback import MOCK_SALES, is_missing_table_error, normalize_sales_row

    supabase = get_supabase_client()
    
    if supabase:
        try:
            response = supabase.table('sales').select("*").order("date", desc=True).execute()
            rows = response.data or []
            return [normalize_sales_row(r) for r in rows]
        except Exception as e:
            if is_missing_table_error(e):
                print("[DB] sales table missing — using demo data. Run db/create_tables.sql in Supabase.")
                return MOCK_SALES
            from core.db_error_handler import handle_db_error
            handle_db_error(e)
    return MOCK_SALES

@router.post("/api/records")
async def create_sales_record(record: SalesRecord):
    """
    Creates a new sales record in Supabase.
    """
    # 🔒 INPUT SANITIZATION (Mitigates V4 / T4 - XSS Prevention)
    # Neutralize script injection payloads on the server side prior to database insertion.
    clean_description = sanitize_html(record.description)
    clean_category = sanitize_html(record.category)
    clean_receipt = sanitize_html(record.receipt) if record.receipt else None

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    try:
        response = supabase.table('sales').insert({
            "date": record.date,
            "description": clean_description,
            "category": clean_category,
            "amount": record.amount,
            "receipt": clean_receipt
        }).execute()
        return {"message": "Sales record created", "data": response.data}
    except Exception as e:
        from core.db_error_handler import handle_db_error
        handle_db_error(e)

@router.post("/api/ask-ai")
async def ask_ai_assistant(query: dict):
    """
    Placeholder endpoint for AI Assistant integration.
    """
    question = query.get("question", "")
    clean_question = sanitize_html(question)
    return {"reply": f"AI Assistant received your question: '{clean_question}'. Integration pending!"}
