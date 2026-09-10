from fastapi import HTTPException
from core.config import get_settings

def handle_db_error(e: Exception):
    """
    Catches database exceptions. If it detects a missing table (PGRST205),
    it raises a 400 Bad Request with a custom payload containing
    the project reference to help the user set up their database tables.
    """
    err_msg = str(e)
    
    if "PGRST205" in err_msg or "Could not find the table" in err_msg:
        settings = get_settings()
        url = settings.supabase_url
        project_ref = "imakqpchdemjozsjnsei"  # Fallback
        
        try:
            if "supabase.co" in url:
                project_ref = url.split("://")[1].split(".")[0]
        except Exception:
            pass
            
        raise HTTPException(
            status_code=400,
            detail={
                "error_type": "MISSING_TABLES",
                "message": "Database tables not initialized in Supabase.",
                "project_ref": project_ref
            }
        )
        
    if "42703" in err_msg or "user_id" in err_msg:
        raise HTTPException(
            status_code=400,
            detail="The database schema is outdated. Please run the SQL migration script (db/add_user_id.sql) in your Supabase SQL Editor to add the 'user_id' column."
        )
        
    # Print detailed error on the server side for secure auditing & debugging
    print(f"[SECURE DB AUDIT] Detailed Database Exception Blocked: {err_msg}")
    
    # Mask detailed error messages from API clients to prevent database reconnaissance
    raise HTTPException(
        status_code=500, 
        detail="A secure database transaction error occurred. The detailed error message has been masked to prevent schema disclosure."
    )

