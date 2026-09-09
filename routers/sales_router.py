from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
import re
from db.supabase_client import get_supabase_client
from core.security import sanitize_html
from core.db_fallback import MOCK_SALES, is_missing_table_error, normalize_sales_row
from core.cache import invalidate_cache

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
        """Enforces YYYY-MM-DD date representation and prevents future dates/dates before 2020."""
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Date of sale must follow the YYYY-MM-DD standard format.")
        from datetime import date, timedelta
        try:
            y, m, d = map(int, v.split("-"))
            input_date = date(y, m, d)
            if input_date < date(2020, 1, 1):
                raise ValueError("Transaction date cannot be before January 1, 2020.")
            # Allow up to tomorrow (today + 1 day) for timezone tolerance
            if input_date > date.today() + timedelta(days=1):
                raise ValueError("Transaction date cannot be in the future.")
        except ValueError as ve:
            raise ve
        except Exception:
            pass
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
async def get_sales_records(request: Request):
    """
    API Endpoint to fetch sales records.
    It tries to fetch from Supabase. Falls back to demo data if tables are missing.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    supabase = get_supabase_client()

    if supabase:
        try:
            response = supabase.table('sales').select("*").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=True).execute()
            rows = response.data or []
            return [normalize_sales_row(r) for r in rows]
        except Exception as e:
            err = str(e)
            if "is_deleted" in err.lower() or "42703" in err:
                print("[DB] 'is_deleted' column missing on sales table — retrying query without it. Please run migrations.")
                try:
                    response = supabase.table('sales').select("*").eq("user_id", user.id).order("date", desc=True).execute()
                    rows = response.data or []
                    return [normalize_sales_row(r) for r in rows]
                except Exception as e2:
                    from core.db_error_handler import handle_db_error
                    handle_db_error(e2)
                    
            if is_missing_table_error(e):
                print("[DB] sales table missing — using demo data. Run db/create_tables.sql in Supabase.")
                return [normalize_sales_row(r) for r in MOCK_SALES if not r.get("is_deleted")]
            from core.db_error_handler import handle_db_error
            handle_db_error(e)
    return [normalize_sales_row(r) for r in MOCK_SALES if not r.get("is_deleted")]


@router.delete("/api/records/{record_id}")
async def delete_sales_record(request: Request, record_id: int):
    """
    Soft deletes a sales record by setting is_deleted=True.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    supabase = get_supabase_client()
    
    if supabase:
        try:
            response = supabase.table('sales').update({"is_deleted": True}).eq("id", record_id).eq("user_id", user.id).execute()
            if not response.data:
                raise HTTPException(status_code=404, detail=f"Sales record with ID {record_id} not found.")
            invalidate_cache(user.id)
            return {"message": f"Sales record {record_id} deleted successfully."}
        except HTTPException:
            raise
        except Exception as e:
            err = str(e)
            if is_missing_table_error(e):
                for r in MOCK_SALES:
                    if r.get("id") == record_id:
                        r["is_deleted"] = True
                        invalidate_cache(user.id)
                        return {"message": f"Sales record {record_id} deleted successfully (Demo Mode)."}
                raise HTTPException(status_code=404, detail=f"Sales record with ID {record_id} not found.")
            
            if "PGRST204" in err or ("is_deleted" in err.lower() and "column" in err.lower()):
                raise HTTPException(
                    status_code=400,
                    detail="Soft delete failed because 'is_deleted' column is missing. Please run db/migrations/02_add_soft_delete.sql in your Supabase SQL Editor."
                )
                
            from core.db_error_handler import handle_db_error
            handle_db_error(e)

    # Demo Mode fallback if Supabase client is not available
    for r in MOCK_SALES:
        if r.get("id") == record_id:
            r["is_deleted"] = True
            invalidate_cache(user.id)
            return {"message": f"Sales record {record_id} deleted successfully (Demo Mode)."}
    raise HTTPException(status_code=404, detail=f"Sales record with ID {record_id} not found.")

@router.post("/api/records")
async def create_sales_record(request: Request, record: SalesRecord):
    """
    Creates a new sales record in Supabase.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

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
            "user_id": user.id,
            "date": record.date,
            "description": clean_description,
            "category": clean_category,
            "amount": record.amount,
            "receipt": clean_receipt
        }).execute()
        invalidate_cache(user.id)
        return {"message": "Sales record created", "data": response.data}
    except Exception as e:
        from core.db_error_handler import handle_db_error
        handle_db_error(e)

import json
import urllib.request
from core.config import get_settings

@router.post("/api/ask-ai")
async def ask_ai_assistant(request: Request, query: dict):
    """
    Interactive AI Assistant integration with Google Gemini API.
    Loads real sales and expenses metrics as context.
    """
    question = query.get("question", "")
    clean_question = sanitize_html(question)
    if not clean_question.strip():
        return {"reply": "Please ask a question!"}

    settings = get_settings()
    api_key = settings.gemini_api_key

    # Try to load recent metrics to inject into context
    try:
        from routers.sales_router import get_sales_records
        from routers.expenses_router import get_expense_records
        
        sales_recs = await get_sales_records(request)
        exp_recs = await get_expense_records(request)
        
        total_s = sum(float(r.get("amount", 0)) for r in sales_recs)
        total_e = sum(float(r.get("amount", 0)) for r in exp_recs)
        net_prof = total_s - total_e
        
        sales_summary = ", ".join([f"{r.get('date')}: {r.get('description')} (₱{r.get('amount'):,.0f})" for r in sales_recs[:10]])
        expenses_summary = ", ".join([f"{r.get('date')}: {r.get('description')} under {r.get('category')} (₱{r.get('amount'):,.0f})" for r in exp_recs[:10]])
        
        context_prompt = (
            f"You are the BizTrack AI Assistant. Here is the current financial status of the business:\n"
            f"- Total Sales: ₱{total_s:,.2f}\n"
            f"- Total Expenses: ₱{total_e:,.2f}\n"
            f"- Net Profit: ₱{net_prof:,.2f}\n\n"
            f"Recent Sales records (up to 10): {sales_summary if sales_summary else 'None'}\n"
            f"Recent Expenses records (up to 10): {expenses_summary if expenses_summary else 'None'}\n\n"
            f"Please help the business owner answer their question concisely and professionally: '{clean_question}'"
        )
    except Exception as context_err:
        print(f"Error compiling AI context: {context_err}")
        context_prompt = f"You are the BizTrack AI Assistant. Please answer this business question: '{clean_question}'"

    if not api_key or api_key.strip() == "" or api_key == "your-gemini-api-key-here":
        # Safe fallback response if key is missing, with setup helper instructions!
        return {
            "reply": (
                f"I received your question: '{clean_question}'.\n\n"
                f"💡 **AI Integration Setup**: To activate live AI reasoning, please add your Gemini API Key in your project's `.env` file:\n"
                f"`GEMINI_API_KEY=your_key_here`"
            )
        }

    try:
        from core.gemini import query_gemini
        reply_text = query_gemini(context_prompt)
        return {"reply": reply_text}
    except Exception as e:
        print(f"Gemini API query error: {e}")
        return {"reply": f"Sorry, I encountered an error communicating with Gemini AI: {str(e)}"}


@router.post("/api/upload")
async def upload_sales_file(request: Request, file: UploadFile = File(...)):
    """
    Accepts a CSV or Excel XLSX file containing sales records, parses it,
    and bulk-inserts it into Supabase (or demo fallback data).
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        file_bytes = await file.read()
        from core.file_parser import parse_transactions_file
        parsed_rows, warnings = parse_transactions_file(file_bytes, file.filename, expected_type="sales")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="No valid transaction rows found in the uploaded file.")

    supabase = get_supabase_client()
    
    # Sanitize and prepare rows
    from core.security import sanitize_html
    rows_to_insert = []
    for r in parsed_rows:
        rows_to_insert.append({
            "user_id": user.id,
            "date": r["date"],
            "description": sanitize_html(r["description"]),
            "category": sanitize_html(r["category"]),
            "amount": r["amount"],
            "receipt": sanitize_html(r["receipt"]) if r.get("receipt") else None
        })

    if supabase:
        try:
            # Supabase bulk insert
            response = supabase.table('sales').insert(rows_to_insert).execute()
            invalidate_cache(user.id)
            return {
                "message": f"Successfully imported {len(rows_to_insert)} sales records.",
                "count": len(rows_to_insert),
                "warnings": warnings
            }
        except Exception as e:
            err = str(e)
            if is_missing_table_error(e):
                from core.db_fallback import MOCK_SALES
                for r in rows_to_insert:
                    r["id"] = len(MOCK_SALES) + 1
                    MOCK_SALES.insert(0, r)
                invalidate_cache(user.id)
                return {
                    "message": f"Successfully imported {len(rows_to_insert)} sales records (Demo Mode).",
                    "count": len(rows_to_insert),
                    "warnings": warnings
                }

            # Missing 'receipt' column — schema not migrated yet (PGRST204)
            if "PGRST204" in err or ("receipt" in err.lower() and "column" in err.lower()):
                print("[DB] 'receipt' column missing on sales — retrying without it.")
                rows_no_receipt = []
                for r in rows_to_insert:
                    row_clean = {k: v for k, v in r.items() if k != "receipt"}
                    rows_no_receipt.append(row_clean)
                try:
                    response = supabase.table('sales').insert(rows_no_receipt).execute()
                    invalidate_cache(user.id)
                    return {
                        "message": f"Successfully imported {len(rows_no_receipt)} sales records (Receipt fields omitted).",
                        "count": len(rows_no_receipt),
                        "warnings": warnings
                    }
                except Exception as ex2:
                    err = str(ex2)

            from core.db_error_handler import handle_db_error
            handle_db_error(e)
            
    # Fallback if no database client
    from core.db_fallback import MOCK_SALES
    for r in rows_to_insert:
        r["id"] = len(MOCK_SALES) + 1
        MOCK_SALES.insert(0, r)
    invalidate_cache(user.id)
    return {
        "message": f"Successfully imported {len(rows_to_insert)} sales records (Demo Mode).",
        "count": len(rows_to_insert),
        "warnings": warnings
    }

