from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re
from db.supabase_client import get_supabase_client
from core.security import sanitize_html
from core.db_fallback import MOCK_EXPENSES, is_missing_table_error, normalize_expense_row
from core.cache import invalidate_cache

router = APIRouter(prefix="/expenses", tags=["expenses"])
templates = Jinja2Templates(directory="templates")


class ExpenseRecord(BaseModel):
    # 🔒 INPUT VALIDATION: Enforce strict structural schema rules (Mitigates V5 / T5)
    date: str = Field(..., description="Date of expense, YYYY-MM-DD")
    description: str = Field(..., min_length=2, max_length=100, description="Expense description details")
    category: str = Field(..., min_length=2, max_length=50, description="Category of expense")
    vendor: Optional[str] = Field(None, max_length=100, description="Vendor name (optional)")
    amount: float = Field(..., gt=0, description="Expense amount, must be strictly positive")
    receipt: Optional[str] = Field(None, max_length=200, description="Receipt filename (optional)")

    @field_validator("date")
    @classmethod
    def validate_date_pattern(cls, v: str) -> str:
        """Enforces YYYY-MM-DD date representation and prevents future dates/dates before 2020."""
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Date of expense must follow the YYYY-MM-DD standard format.")
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
async def read_expenses(request: Request):
    """
    Renders the Expenses HTML page.
    """
    return templates.TemplateResponse(
        request=request, name="expenses.html", context={"title": "Expenses", "active_page": "expenses"}
    )


@router.get("/api/records")
async def get_expense_records(request: Request):
    """
    Fetches expense records from Supabase, ordered by date descending.
    Falls back to mock data if Supabase is not connected or tables are missing.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    supabase = get_supabase_client()

    if supabase:
        try:
            response = supabase.table('expenses').select("*").eq("user_id", user.id).neq("is_deleted", True).order("date", desc=True).execute()
            rows = response.data or []
            return [normalize_expense_row(r) for r in rows]
        except Exception as e:
            err = str(e)
            if "is_deleted" in err.lower() or "42703" in err:
                print("[DB] 'is_deleted' column missing on expenses table — retrying query without it. Please run migrations.")
                try:
                    response = supabase.table('expenses').select("*").eq("user_id", user.id).order("date", desc=True).execute()
                    rows = response.data or []
                    return [normalize_expense_row(r) for r in rows]
                except Exception as e2:
                    from core.db_error_handler import handle_db_error
                    handle_db_error(e2)
                    
            if is_missing_table_error(e):
                print("[DB] expenses table missing — using demo data. Run db/create_tables.sql in Supabase.")
                return [normalize_expense_row(r) for r in MOCK_EXPENSES if not r.get("is_deleted")]
            from core.db_error_handler import handle_db_error
            handle_db_error(e)
    return [normalize_expense_row(r) for r in MOCK_EXPENSES if not r.get("is_deleted")]


@router.post("/api/records")
async def create_expense_record(request: Request, record: ExpenseRecord):
    """
    Creates a new expense record in Supabase.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 🔒 INPUT SANITIZATION (Mitigates V4 / T4 - XSS Prevention)
    # Neutralize script injection payloads on the server side prior to database insertion.
    clean_description = sanitize_html(record.description)
    clean_category = sanitize_html(record.category)
    # Treat empty or whitespace-only vendor as null (matches nullable DB column)
    raw_vendor = record.vendor.strip() if record.vendor else ""
    clean_vendor = sanitize_html(raw_vendor) if raw_vendor else None
    clean_receipt = sanitize_html(record.receipt) if record.receipt else None

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=503, detail="Database not configured. Please set up Supabase credentials.")

    row = {
        "user_id": user.id,
        "date": record.date,
        "description": clean_description,
        "category": clean_category,
        "vendor": clean_vendor,
        "amount": record.amount,
        "receipt": clean_receipt
    }

    try:
        response = supabase.table('expenses').insert(row).execute()
        invalidate_cache(user.id)
        return {"message": "Expense record created successfully.", "data": response.data}

    except Exception as e:
        err = str(e)

        # Missing table entirely (PGRST205)
        if is_missing_table_error(e):
            raise HTTPException(
                status_code=503,
                detail="Expenses table not found. Please run db/create_tables.sql in your Supabase SQL Editor."
            )

        # Missing 'receipt' column — schema not migrated yet (PGRST204)
        if "PGRST204" in err or ("receipt" in err.lower() and "column" in err.lower()):
            print("[DB] 'receipt' column missing on expenses — retrying without it. Run the migration SQL to fix.")
            try:
                row_no_receipt = {k: v for k, v in row.items() if k != "receipt"}
                response = supabase.table('expenses').insert(row_no_receipt).execute()
                invalidate_cache(user.id)
                return {
                    "message": "Expense saved! (Receipt field unavailable — ask your admin to run the migration SQL.)",
                    "data": response.data
                }
            except Exception as e2:
                err = str(e2)

        # vendor NOT NULL constraint violated (Postgres error code 23502)
        if "23502" in err or 'null value in column "vendor"' in err:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Your Supabase expenses table requires a Vendor value. "
                    "Fix it by running in Supabase SQL Editor: "
                    "ALTER TABLE expenses ALTER COLUMN vendor DROP NOT NULL;"
                )
            )

        from core.db_error_handler import handle_db_error
        handle_db_error(e)


@router.delete("/api/records/{record_id}")
async def delete_expense_record(request: Request, record_id: int):
    """
    Soft deletes an expense record by setting is_deleted=True.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    supabase = get_supabase_client()
    
    if supabase:
        try:
            response = supabase.table('expenses').update({"is_deleted": True}).eq("id", record_id).eq("user_id", user.id).execute()
            if not response.data:
                raise HTTPException(status_code=404, detail=f"Expense record with ID {record_id} not found.")
            invalidate_cache(user.id)
            return {"message": f"Expense record {record_id} deleted successfully."}
        except HTTPException:
            raise
        except Exception as e:
            err = str(e)
            if is_missing_table_error(e):
                for r in MOCK_EXPENSES:
                    if r.get("id") == record_id:
                        r["is_deleted"] = True
                        invalidate_cache(user.id)
                        return {"message": f"Expense record {record_id} deleted successfully (Demo Mode)."}
                raise HTTPException(status_code=404, detail=f"Expense record with ID {record_id} not found.")
            
            if "PGRST204" in err or ("is_deleted" in err.lower() and "column" in err.lower()):
                raise HTTPException(
                    status_code=400,
                    detail="Soft delete failed because 'is_deleted' column is missing. Please run db/migrations/02_add_soft_delete.sql in your Supabase SQL Editor."
                )
                
            from core.db_error_handler import handle_db_error
            handle_db_error(e)

    # Demo Mode fallback if Supabase client is not available
    for r in MOCK_EXPENSES:
        if r.get("id") == record_id:
            r["is_deleted"] = True
            invalidate_cache(user.id)
            return {"message": f"Expense record {record_id} deleted successfully (Demo Mode)."}
    raise HTTPException(status_code=404, detail=f"Expense record with ID {record_id} not found.")


@router.post("/api/upload")
async def upload_expenses_file(request: Request, file: UploadFile = File(...)):
    """
    Accepts a CSV or Excel XLSX file containing expenses records, parses it,
    and bulk-inserts it into Supabase (or demo fallback data).
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        file_bytes = await file.read()
        from core.file_parser import parse_transactions_file
        parsed_rows, warnings = parse_transactions_file(file_bytes, file.filename, expected_type="expenses")
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
            "vendor": sanitize_html(r["vendor"]) if r["vendor"] else None,
            "amount": r["amount"],
            "receipt": sanitize_html(r["receipt"]) if r.get("receipt") else None
        })

    if supabase:
        try:
            # Supabase bulk insert
            response = supabase.table('expenses').insert(rows_to_insert).execute()
            invalidate_cache(user.id)
            return {
                "message": f"Successfully imported {len(rows_to_insert)} expenses records.",
                "count": len(rows_to_insert),
                "warnings": warnings
            }
        except Exception as e:
            err = str(e)
            if is_missing_table_error(e):
                from core.db_fallback import MOCK_EXPENSES
                for r in rows_to_insert:
                    r["id"] = len(MOCK_EXPENSES) + 1
                    MOCK_EXPENSES.insert(0, r)
                invalidate_cache(user.id)
                return {
                    "message": f"Successfully imported {len(rows_to_insert)} expenses records (Demo Mode).",
                    "count": len(rows_to_insert),
                    "warnings": warnings
                }
            
            # Missing 'receipt' column — schema not migrated yet (PGRST204)
            if "PGRST204" in err or ("receipt" in err.lower() and "column" in err.lower()):
                print("[DB] 'receipt' column missing on expenses — retrying without it.")
                rows_no_receipt = []
                for r in rows_to_insert:
                    row_clean = {k: v for k, v in r.items() if k != "receipt"}
                    rows_no_receipt.append(row_clean)
                try:
                    response = supabase.table('expenses').insert(rows_no_receipt).execute()
                    invalidate_cache(user.id)
                    return {
                        "message": f"Successfully imported {len(rows_no_receipt)} expenses records (Receipt fields omitted).",
                        "count": len(rows_no_receipt),
                        "warnings": warnings
                    }
                except Exception as ex2:
                    err = str(ex2)
            
            # If vendor constraint or columns missing, let's retry without vendor or show specific error
            if "23502" in err or 'null value in column "vendor"' in err:
                for r in rows_to_insert:
                    if r["vendor"] is None:
                        r["vendor"] = "Imported Vendor"

                try:
                    response = supabase.table('expenses').insert(rows_to_insert).execute()
                    invalidate_cache(user.id)
                    return {
                        "message": f"Successfully imported {len(rows_to_insert)} expenses records (with default vendor name).",
                        "count": len(rows_to_insert),
                        "warnings": warnings
                    }
                except Exception as ex2:
                    from core.db_error_handler import handle_db_error
                    handle_db_error(ex2)
            
            from core.db_error_handler import handle_db_error
            handle_db_error(e)
            
    # Fallback if no database client
    from core.db_fallback import MOCK_EXPENSES
    for r in rows_to_insert:
        r["id"] = len(MOCK_EXPENSES) + 1
        MOCK_EXPENSES.insert(0, r)
    invalidate_cache(user.id)
    return {
        "message": f"Successfully imported {len(rows_to_insert)} expenses records (Demo Mode).",
        "count": len(rows_to_insert),
        "warnings": warnings
    }

