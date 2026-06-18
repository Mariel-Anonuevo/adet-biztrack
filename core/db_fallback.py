"""Mock data and helpers when Supabase tables are not set up yet."""

MOCK_SALES = [
    {"date": "2026-05-03", "description": "Product batch A", "category": "Product", "amount": 12000, "receipt": "receipt1.jpg"},
    {"date": "2026-05-10", "description": "Online orders", "category": "Online", "amount": 8500, "receipt": None},
    {"date": "2026-04-15", "description": "Service consultation", "category": "Service", "amount": 15000, "receipt": "inv001.pdf"},
    {"date": "2026-04-02", "description": "Product batch B", "category": "Product", "amount": 9700, "receipt": None},
    {"date": "2026-03-20", "description": "Wholesale deal", "category": "Online", "amount": 19000, "receipt": "rcpt2.jpg"},
]

MOCK_EXPENSES = [
    {"date": "2026-05-01", "description": "Monthly supplies", "category": "Supplies", "vendor": "ABC Supply Co.", "amount": 18500, "receipt": "rec_supplies.pdf"},
    {"date": "2026-05-01", "description": "Office rent", "category": "Rent", "vendor": "Realty Corp", "amount": 15000, "receipt": "rent_contract.pdf"},
    {"date": "2026-05-05", "description": "Staff salaries", "category": "Salaries", "vendor": "Internal", "amount": 13500, "receipt": None},
    {"date": "2026-04-01", "description": "Utility bills", "category": "Utilities", "vendor": "Meralco", "amount": 8000, "receipt": "utility_bill_apr.pdf"},
    {"date": "2026-03-01", "description": "Supplies restock", "category": "Supplies", "vendor": "ABC Supply Co.", "amount": 6500, "receipt": None},
]


def is_missing_table_error(exc: Exception) -> bool:
    msg = str(exc)
    return "PGRST205" in msg or "Could not find the table" in msg


def normalize_sales_row(row: dict) -> dict:
    return {
        "date": str(row.get("date", ""))[:10],
        "description": row.get("description", ""),
        "category": row.get("category", ""),
        "amount": float(row.get("amount", 0)),
        "receipt": row.get("receipt"),
    }


def normalize_expense_row(row: dict) -> dict:
    return {
        "date": str(row.get("date", ""))[:10],
        "description": row.get("description", ""),
        "category": row.get("category", ""),
        "vendor": row.get("vendor", ""),
        "amount": float(row.get("amount", 0)),
        "receipt": row.get("receipt"),
    }
