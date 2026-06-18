from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    # Service-role key for admin operations (password reset, user lookup)
    supabase_service_key: str = ""
    # Comma-separated emails that always receive Admin role (e.g. your school account)
    admin_emails: str = "admin@biztrack.com"

    # SMTP settings for sending password reset emails (Gmail App Password recommended)
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""          # Your Gmail address
    smtp_password: str = ""      # Your Gmail App Password (16-char)
    from_email: str = ""         # Display email (defaults to smtp_user if empty)

    class Config:
        env_file = ".env"

    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

def get_settings():
    return Settings()
