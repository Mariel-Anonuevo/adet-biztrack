import sys
import os

# Add the project root to python path so we can import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.supabase_client import get_supabase_client
from core.db_fallback import MOCK_SALES, MOCK_EXPENSES

def seed():
    supabase = get_supabase_client()
    if not supabase:
        print("Error: Could not initialize Supabase client. Make sure .env is configured.")
        return

    print("--- Seeding Sales Records ---")
    for sale in MOCK_SALES:
        try:
            # Drop unnecessary keys like 'receipt' if it's None to avoid SQL errors
            data = {
                "date": sale["date"],
                "description": sale["description"],
                "category": sale["category"],
                "amount": sale["amount"]
            }
            if sale.get("receipt"):
                data["receipt"] = sale["receipt"]
                
            supabase.table("sales").insert(data).execute()
            print(f"✅ Inserted sale: {sale['description']} ({sale['amount']} PHP)")
        except Exception as e:
            print(f"❌ Failed to insert sale '{sale['description']}': {e}")
            print("   (Make sure the 'sales' table is created in Supabase first.)")

    print("\n--- Seeding Expense Records ---")
    for expense in MOCK_EXPENSES:
        try:
            data = {
                "date": expense["date"],
                "description": expense["description"],
                "category": expense["category"],
                "vendor": expense["vendor"],
                "amount": expense["amount"]
            }
            supabase.table("expenses").insert(data).execute()
            print(f"✅ Inserted expense: {expense['description']} ({expense['amount']} PHP)")
        except Exception as e:
            print(f"❌ Failed to insert expense '{expense['description']}': {e}")
            print("   (Make sure the 'expenses' table is created in Supabase first.)")

if __name__ == "__main__":
    seed()
