"""Mock data and helpers when Supabase tables are not set up yet."""

MOCK_SALES = [
    # 2025 — Jan through Jun (baseline ~₱18k–₱22k/month)
    {"date": "2025-01-10", "description": "Product batch A",       "category": "Product", "amount": 18000, "receipt": None},
    {"date": "2025-02-08", "description": "Online orders Feb",     "category": "Online",  "amount": 17500, "receipt": None},
    {"date": "2025-03-12", "description": "Wholesale deal Mar",    "category": "Product", "amount": 19000, "receipt": None},
    {"date": "2025-04-15", "description": "Service consultation",  "category": "Service", "amount": 20000, "receipt": "inv_apr.pdf"},
    {"date": "2025-05-10", "description": "Product batch May",     "category": "Product", "amount": 21000, "receipt": None},
    {"date": "2025-06-20", "description": "Online orders Jun",     "category": "Online",  "amount": 20500, "receipt": None},
    # 2025 — Jul through Dec (growing ~₱22k–₱27k/month)
    {"date": "2025-07-05", "description": "Wholesale deal Jul",    "category": "Product", "amount": 22000, "receipt": None},
    {"date": "2025-08-14", "description": "Service contract Aug",  "category": "Service", "amount": 23000, "receipt": "inv_aug.pdf"},
    {"date": "2025-09-09", "description": "Product batch Sep",     "category": "Product", "amount": 23500, "receipt": None},
    {"date": "2025-10-18", "description": "Online orders Oct",     "category": "Online",  "amount": 24500, "receipt": None},
    {"date": "2025-11-22", "description": "Product batch Nov",     "category": "Product", "amount": 26000, "receipt": None},
    {"date": "2025-12-15", "description": "Year-end deal Dec",     "category": "Product", "amount": 27500, "receipt": "inv_dec.pdf"},
    # 2026 — Jan through Jun (recent ~₱27k–₱32k/month)
    {"date": "2026-01-08", "description": "Product batch Jan",     "category": "Product", "amount": 27000, "receipt": None},
    {"date": "2026-02-12", "description": "Service contract Feb",  "category": "Service", "amount": 28000, "receipt": None},
    {"date": "2026-03-20", "description": "Wholesale deal Mar",    "category": "Product", "amount": 29000, "receipt": "rcpt_mar.jpg"},
    {"date": "2026-04-15", "description": "Online orders Apr",     "category": "Online",  "amount": 30000, "receipt": None},
    {"date": "2026-05-03", "description": "Product batch May",     "category": "Product", "amount": 31000, "receipt": None},
    {"date": "2026-06-10", "description": "Service deal Jun",      "category": "Service", "amount": 32000, "receipt": "inv_jun.pdf"},
]

MOCK_EXPENSES = [
    # 2025 — Jan through Jun (baseline ~₱9k–₱11k/month)
    {"date": "2025-01-05", "description": "Supplies restock",   "category": "Supplies",   "vendor": "ABC Supply", "amount": 9000,  "receipt": None},
    {"date": "2025-02-05", "description": "Utility bills Feb",  "category": "Utilities",  "vendor": "Meralco",    "amount": 8500,  "receipt": None},
    {"date": "2025-03-01", "description": "Office rent Mar",    "category": "Rent",       "vendor": "Realty Corp","amount": 10000, "receipt": "rent_mar.pdf"},
    {"date": "2025-04-01", "description": "Staff salaries Apr", "category": "Salaries",   "vendor": "Internal",   "amount": 10500, "receipt": None},
    {"date": "2025-05-01", "description": "Supplies May",       "category": "Supplies",   "vendor": "ABC Supply", "amount": 9500,  "receipt": None},
    {"date": "2025-06-01", "description": "Office rent Jun",    "category": "Rent",       "vendor": "Realty Corp","amount": 10000, "receipt": "rent_jun.pdf"},
    # 2025 — Jul through Dec (growing ~₱10k–₱13k/month)
    {"date": "2025-07-01", "description": "Salaries Jul",       "category": "Salaries",   "vendor": "Internal",   "amount": 11000, "receipt": None},
    {"date": "2025-08-01", "description": "Supplies Aug",       "category": "Supplies",   "vendor": "ABC Supply", "amount": 10000, "receipt": None},
    {"date": "2025-09-01", "description": "Rent Sep",           "category": "Rent",       "vendor": "Realty Corp","amount": 10000, "receipt": None},
    {"date": "2025-10-01", "description": "Utility bills Oct",  "category": "Utilities",  "vendor": "Meralco",    "amount": 11500, "receipt": None},
    {"date": "2025-11-01", "description": "Supplies Nov",       "category": "Supplies",   "vendor": "ABC Supply", "amount": 12000, "receipt": None},
    {"date": "2025-12-01", "description": "Salaries Dec",       "category": "Salaries",   "vendor": "Internal",   "amount": 13000, "receipt": "salary_dec.pdf"},
    # 2026 — Jan through Jun (recent ~₱12k–₱15k/month)
    {"date": "2026-01-01", "description": "Rent Jan",           "category": "Rent",       "vendor": "Realty Corp","amount": 12000, "receipt": None},
    {"date": "2026-02-01", "description": "Salaries Feb",       "category": "Salaries",   "vendor": "Internal",   "amount": 13000, "receipt": None},
    {"date": "2026-03-01", "description": "Supplies Mar",       "category": "Supplies",   "vendor": "ABC Supply", "amount": 12500, "receipt": None},
    {"date": "2026-04-01", "description": "Utility bills Apr",  "category": "Utilities",  "vendor": "Meralco",    "amount": 13500, "receipt": None},
    {"date": "2026-05-01", "description": "Office rent May",    "category": "Rent",       "vendor": "Realty Corp","amount": 14000, "receipt": "rent_may.pdf"},
    {"date": "2026-06-01", "description": "Salaries Jun",       "category": "Salaries",   "vendor": "Internal",   "amount": 15000, "receipt": None},
]



def is_missing_table_error(exc: Exception) -> bool:
    msg = str(exc)
    return "PGRST205" in msg or "Could not find the table" in msg


def normalize_sales_row(row: dict) -> dict:
    res = {
        "date": str(row.get("date", ""))[:10],
        "description": row.get("description", ""),
        "category": row.get("category", ""),
        "amount": float(row.get("amount", 0)),
        "receipt": row.get("receipt"),
        "is_deleted": row.get("is_deleted", False)
    }
    if "id" in row:
        res["id"] = row["id"]
    return res


def normalize_expense_row(row: dict) -> dict:
    res = {
        "date": str(row.get("date", ""))[:10],
        "description": row.get("description", ""),
        "category": row.get("category", ""),
        "vendor": row.get("vendor", ""),
        "amount": float(row.get("amount", 0)),
        "receipt": row.get("receipt"),
        "is_deleted": row.get("is_deleted", False)
    }
    if "id" in row:
        res["id"] = row["id"]
    return res

# Auto-assign IDs to baseline mock data for demo delete operations
for i, item in enumerate(MOCK_SALES):
    if "id" not in item:
        item["id"] = i + 1

for i, item in enumerate(MOCK_EXPENSES):
    if "id" not in item:
        item["id"] = i + 1
