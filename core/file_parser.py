import io
import csv
import re
from datetime import datetime
import openpyxl

def clean_amount(val) -> tuple[float, bool]:
    """Strips currency symbols, commas, and converts value to a float. Returns (amount, is_fallback)."""
    if val is None:
        return 0.0, True
    if isinstance(val, (int, float)):
        return float(val), False
    # Convert string
    s = str(val).strip()
    s = re.sub(r"[^\d.-]", "", s)  # keep only digits, dots, and minus signs
    try:
        return float(s), False
    except ValueError:
        return 0.0, True

def parse_date(val) -> tuple[str, bool]:
    """Attempts to parse various date formats and return (YYYY-MM-DD, is_fallback)."""
    if val is None:
        return datetime.today().strftime("%Y-%m-%d"), True
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d"), False
    
    s = str(val).strip()
    if not s:
        return datetime.today().strftime("%Y-%m-%d"), True
    # Try common formats
    formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%b %d, %Y",
        "%d-%m-%Y"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d"), False
        except ValueError:
            continue
            
    # Try regex match for YYYY-MM-DD
    match = re.search(r"(\d{4})[-/](\d{2})[-/](\d{2})", s)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}", False
        
    return datetime.today().strftime("%Y-%m-%d"), True

def is_date_like(val) -> bool:
    """Checks if a cell value looks like a date."""
    if isinstance(val, datetime):
        return True
    s = str(val).strip()
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"]:
        try:
            datetime.strptime(s, fmt)
            return True
        except ValueError:
            continue
    if re.match(r"^\d{4}[-/]\d{2}[-/]\d{2}$", s) or re.match(r"^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$", s):
        return True
    return False

def is_number_like(val) -> bool:
    """Checks if a cell value looks like a number."""
    if isinstance(val, (int, float)):
        return True
    s = str(val).strip().replace(",", "")
    s = re.sub(r"[^\d.-]", "", s)
    try:
        float(s)
        return True
    except ValueError:
        return False

def is_header_row(row: list) -> bool:
    """Returns True if the row looks like a header row, False otherwise."""
    header_keywords = [
        "date", "day", "petsa", "araw", "tanggal", "month", "buwan", "year", "taon",
        "desc", "particular", "item", "detail", "deskripsyon", "detalye", "keterangan",
        "cat", "type", "tag", "kategorya", "uri",
        "amount", "value", "cost", "price", "php", "halaga", "presyo", "pera",
        "vendor", "payee", "supplier", "merchant", "store", "bilihan", "tindahan"
    ]
    match_count = 0
    for cell in row:
        if cell is None:
            continue
        c_clean = str(cell).strip().lower()
        if any(keyword in c_clean for keyword in header_keywords):
            match_count += 1
            
    # If at least one cell matches header keywords, we treat it as a header
    return match_count >= 1

def find_column_indices(headers: list[str]) -> dict[str, int]:
    """Map expected fields to header indices case-insensitively (supporting English and Tagalog)."""
    mapping = {}
    for i, h in enumerate(headers):
        if not h:
            continue
        h_clean = h.strip().lower()
        
        # Match Date
        if any(w in h_clean for w in ["date", "day", "petsa", "araw", "tanggal", "month", "buwan", "year", "taon"]):
            mapping["date"] = i
        # Match Description
        elif any(w in h_clean for w in ["desc", "particular", "item", "detail", "deskripsyon", "detalye", "keterangan"]):
            mapping["description"] = i
        # Match Category
        elif any(w in h_clean for w in ["cat", "type", "tag", "kategorya", "uri"]):
            mapping["category"] = i
        # Match Amount
        elif any(w in h_clean for w in ["amount", "value", "cost", "price", "php", "halaga", "presyo", "pera"]):
            mapping["amount"] = i
        # Match Vendor
        elif any(w in h_clean for w in ["vendor", "payee", "supplier", "merchant", "store", "bilihan", "tindahan"]):
            mapping["vendor"] = i
        # Match Receipt
        elif any(w in h_clean for w in ["receipt", "resibo", "file", "document"]):
            mapping["receipt"] = i
            
    return mapping

def guess_column_indices_from_row(row: list) -> dict[str, int]:
    """Guesses column mapping from a sample data row based on data types."""
    mapping = {}
    
    # 1. Find date column
    for i, cell in enumerate(row):
        if cell is not None and is_date_like(cell):
            mapping["date"] = i
            break
            
    # 2. Find amount column
    for i, cell in enumerate(row):
        if i == mapping.get("date"):
            continue
        if cell is not None and is_number_like(cell):
            val_str = str(cell).strip()
            # Exclude things that are long text but happen to start with numbers
            if len(val_str) < 15:
                mapping["amount"] = i
                break
                
    # 3. Find description, category, vendor among remaining text columns
    text_indices = []
    for i, cell in enumerate(row):
        if i == mapping.get("date") or i == mapping.get("amount"):
            continue
        if cell is not None and str(cell).strip():
            text_indices.append(i)
            
    if len(text_indices) >= 2:
        mapping["description"] = text_indices[0]
        mapping["category"] = text_indices[1]
        if len(text_indices) >= 3:
            mapping["vendor"] = text_indices[2]
    elif len(text_indices) == 1:
        mapping["description"] = text_indices[0]
        
    return mapping

def parse_transactions_file(file_bytes: bytes, filename: str, expected_type: str = "any") -> tuple[list[dict], list[str]]:
    """
    Parses a CSV or Excel (.xlsx) file containing transaction rows.
    Returns a tuple of:
      - list of dictionaries with normalized transaction data.
      - list of validation warning strings.
    Automatically handles files without header rows, different names, and Tagalog column names.
    """
    fn_lower = filename.lower()
    raw_rows = []
    
    # 1. Read all raw rows from file
    if fn_lower.endswith(".csv"):
        content = file_bytes.decode("utf-8", errors="ignore")
        f = io.StringIO(content)
        reader = csv.reader(f)
        for r in reader:
            if r and any(cell.strip() for cell in r):
                raw_rows.append([cell.strip() for cell in r])
                
    elif fn_lower.endswith(".xlsx"):
        f = io.BytesIO(file_bytes)
        wb = openpyxl.load_workbook(f, data_only=True)
        sheet = wb.active
        sheet_rows = list(sheet.iter_rows(values_only=True))
        for r in sheet_rows:
            if r and any(cell is not None for cell in r):
                raw_rows.append(r)
    else:
        raise ValueError("Unsupported file format. Please upload a .csv or .xlsx file.")
        
    if not raw_rows:
        return [], []
        
    # 2. Determine if the first row is a header row
    first_row = raw_rows[0]
    has_header = is_header_row(first_row)
    
    # 3. Create mapping
    mapping = {}
    data_start_idx = 1
    
    if has_header:
        headers = [str(c) if c is not None else "" for c in first_row]
        mapping = find_column_indices(headers)
        
        # Prevent importing forecast export files
        forecast_keywords = ["projected sales", "projected expenses", "projected profit", "margin", "forecast", "projection"]
        if any(any(fk in h.lower() for fk in forecast_keywords) for h in headers):
            raise ValueError("This file appears to contain Forecast data, not actual transaction records. Please upload a valid sales or expenses transaction file.")

        # Enforce strict headers check to protect against cross-uploading (Sales vs Expenses files)
        vendor_keywords = ["vendor", "payee", "supplier", "merchant", "store", "bilihan", "tindahan"]
        has_vendor_col = any(any(vk in h.lower() for vk in vendor_keywords) for h in headers)
        
        if expected_type == "sales" and has_vendor_col:
            raise ValueError("This file appears to contain Expense data (detected 'Vendor' or 'Supplier' column). Please upload it under Expenses.")
        elif expected_type == "expenses" and not has_vendor_col:
            raise ValueError("This file is missing required Expense columns (could not find 'Vendor' or 'Supplier' column). Please verify your file format.")
            
        # If headers are missing crucial columns, try to guess from the first data row
        if len(raw_rows) > 1:
            guessed = guess_column_indices_from_row(raw_rows[1])
            for key in ["date", "description", "category", "amount", "vendor"]:
                if key not in mapping and key in guessed:
                    mapping[key] = guessed[key]
    else:
        # First row is data! Guess mapping directly from it
        data_start_idx = 0
        mapping = guess_column_indices_from_row(first_row)
        
        if expected_type == "sales" and "vendor" in mapping:
            raise ValueError("This data contains expense-like vendor columns. Please upload it under Expenses.")
        elif expected_type == "expenses" and "vendor" not in mapping:
            raise ValueError("This data is missing expense-specific columns (like Vendor). Please verify your file format.")
        
    # 4. Fallback to positional defaults if still missing
    row_len = len(first_row)
    if "date" not in mapping:
        mapping["date"] = 0
    if "description" not in mapping and row_len > 1:
        mapping["description"] = 1
    if "category" not in mapping and row_len > 2:
        mapping["category"] = 2
    if "amount" not in mapping:
        mapping["amount"] = (row_len - 1) if row_len > 3 else 3
    if expected_type != "sales" and "vendor" not in mapping and row_len > 4:
        if not has_header:
            mapping["vendor"] = 3
            if mapping.get("amount") == 3:
                mapping["amount"] = 4

    # 5. Process data rows and track warnings
    parsed_transactions = []
    warnings = []
    
    for i, row in enumerate(raw_rows[data_start_idx:]):
        row_num = i + 1 + data_start_idx
        
        date_idx = mapping.get("date")
        desc_idx = mapping.get("description")
        cat_idx = mapping.get("category")
        amt_idx = mapping.get("amount")
        vendor_idx = mapping.get("vendor")
        rcpt_idx = mapping.get("receipt")
        
        # Raw value lookups
        raw_date = row[date_idx] if date_idx is not None and date_idx < len(row) else None
        raw_desc = row[desc_idx] if desc_idx is not None and desc_idx < len(row) else None
        raw_cat  = row[cat_idx] if cat_idx is not None and cat_idx < len(row) else None
        raw_amt  = row[amt_idx] if amt_idx is not None and amt_idx < len(row) else None
        raw_vnd  = row[vendor_idx] if vendor_idx is not None and vendor_idx < len(row) else None
        raw_rcpt = row[rcpt_idx] if rcpt_idx is not None and rcpt_idx < len(row) else None
        
        # Parse fields with fallback tracking
        date_val, date_fallback = parse_date(raw_date)
        amt_val, amt_fallback = clean_amount(raw_amt)
        
        desc_val = str(raw_desc).strip() if raw_desc is not None else ""
        desc_fallback = False
        if not desc_val:
            desc_val = "Imported Transaction"
            desc_fallback = True
            
        cat_val = str(raw_cat).strip() if raw_cat is not None else ""
        cat_fallback = False
        if not cat_val:
            cat_val = "Uncategorized"
            cat_fallback = True
            
        # Collect warnings
        row_warns = []
        
        min_allowed_date = "2020-01-01"
        if date_val < min_allowed_date:
            date_val = min_allowed_date
            row_warns.append(f"Date '{raw_date}' is before system limit (clamped to 2020-01-01)")
        elif date_fallback:
            row_warns.append(f"Invalid date '{raw_date or ''}' (defaulted to today's date)")
            
        if amt_fallback:
            row_warns.append(f"Invalid amount format '{raw_amt or ''}' (defaulted to 0.0)")
        elif amt_val <= 0:
            row_warns.append(f"Amount {amt_val} is zero or negative")
        if desc_fallback:
            row_warns.append("Missing description (defaulted to 'Imported Transaction')")
        if cat_fallback:
            row_warns.append("Missing category (defaulted to 'Uncategorized')")
            
        if row_warns:
            warnings.append(f"Row {row_num}: " + ", ".join(row_warns))
            
        parsed_row = {
            "date": date_val,
            "description": desc_val,
            "category": cat_val,
            "amount": amt_val,
            "vendor": (str(raw_vnd).strip() if raw_vnd is not None else None),
            "receipt": (str(raw_rcpt).strip() if raw_rcpt is not None else None)
        }
        parsed_transactions.append(parsed_row)
        
    return parsed_transactions, warnings
