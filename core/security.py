import re
import html

def sanitize_html(value: str) -> str:
    """
    Escapes HTML special characters in user inputs to prevent Cross-Site Scripting (XSS).
    It converts characters like <, >, &, ", and ' into safe HTML entities.
    """
    if not value:
        return value
    return html.escape(value.strip())

def validate_password_strength(password: str, email: str | None = None) -> tuple[bool, str]:
    """
    Enforces password complexity policy.
    
    Requirements:
    - At least 8 characters long.
    - At least one uppercase letter (A-Z).
    - At least one numerical digit (0-9).
    - At least one special character (e.g., !@#$%^&*(),.?":{}|<>).
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
        
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number."
        
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character (e.g., !@#$%^&*)."
            
    return True, "Password meets complexity requirements."
