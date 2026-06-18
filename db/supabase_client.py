from supabase import create_client, Client
from core.config import get_settings
import os

settings = get_settings()

def get_supabase_client() -> Client | None:
    url: str = settings.supabase_url
    key: str = settings.supabase_key
    
    # If the URL and Key are empty (like before .env is set up), return None
    # This prevents the app from crashing entirely if the user hasn't configured it yet.
    if not url or not key:
        print("Warning: Supabase credentials not found in .env. Database features will be disabled.")
        return None
        
    try:
        supabase: Client = create_client(url, key)
        return supabase
    except Exception as e:
        print(f"Error initializing Supabase client: {e}")
        return None
