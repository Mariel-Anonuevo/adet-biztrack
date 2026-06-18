from db.supabase_client import get_supabase_client
supabase = get_supabase_client()
print(dir(supabase.auth))
