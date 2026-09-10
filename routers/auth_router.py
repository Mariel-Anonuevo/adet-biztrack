import re
import secrets
import smtplib
import urllib.parse
import bcrypt
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from core.auth import is_authenticated
from core.config import get_settings
from core.navigation import append_nav_param
from core.security import validate_password_strength
from db.supabase_client import get_supabase_client

router = APIRouter(prefix="/auth", tags=["auth"])
templates = Jinja2Templates(directory="templates")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: Optional[str] = "User"


class ForgotRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    full_name: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ---------------------------------------------------------------------------
# Supabase admin client (service-role key required for password updates)
# ---------------------------------------------------------------------------

def _get_supabase_admin_client():
    """Return a Supabase client authenticated with the service-role key.
    
    The service-role key bypasses Row Level Security and is only used
    server-side for admin operations such as updating a user's password.
    """
    from supabase import create_client
    settings = get_settings()
    url = settings.supabase_url
    key = settings.supabase_service_key
    if not url or not key or key == "your-supabase-service-role-key-here":
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        print(f"[SECURE AUDIT] Admin client init error: {e}")
        return None


# ---------------------------------------------------------------------------
# Email sending
# ---------------------------------------------------------------------------

def _build_reset_email_html(reset_url: str, expires_minutes: int = 30) -> str:
    """Return a styled HTML email body for the password reset."""
    return f"""
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1b4f3a 0%,#2d7a56 100%);padding:36px 40px;text-align:center;">
            <svg width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 12px;">
              <rect x="0" y="55" width="14" height="45" fill="#1b2e4b" rx="2"/>
              <rect x="20" y="45" width="14" height="55" fill="#1b2e4b" rx="2"/>
              <rect x="40" y="35" width="14" height="65" fill="#ffffff" rx="2"/>
              <rect x="60" y="25" width="14" height="75" fill="#1b2e4b" rx="2"/>
              <rect x="80" y="10" width="14" height="90" fill="#1b2e4b" rx="2"/>
              <path d="M 5 60 L 30 35 L 50 45 L 85 5" fill="none" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
            </svg>
            <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">BizTrack</div>
            <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">Business Intelligence</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a2e1e;">Password Reset Request</h1>
            <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
              We received a request to reset the password for your BizTrack account.
              Click the button below to choose a new password. This link expires in
              <strong>{expires_minutes} minutes</strong>.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="{reset_url}"
                 style="display:inline-block;background:linear-gradient(135deg,#1b4f3a,#2d7a56);color:#ffffff;
                        font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;
                        border-radius:8px;letter-spacing:0.3px;">
                Reset My Password
              </a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
              Or copy and paste this link into your browser:
            </p>
            <p style="margin:0 0 24px;font-size:12px;color:#2d7a56;word-break:break-all;">
              {reset_url}
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              If you did not request this, you can safely ignore this email — your password will not change.<br>
              For security, this link can only be used once.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              &copy; 2026 BizTrack &mdash; Secure Business Intelligence Platform
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _send_reset_email(to_email: str, reset_url: str) -> None:
    """Send a styled HTML password reset email via Gmail SMTP.
    
    Falls back to printing the reset URL to the console if SMTP is not configured,
    so development/demo mode still functions without email credentials.
    """
    settings = get_settings()
    smtp_server   = settings.smtp_server
    smtp_port     = settings.smtp_port
    smtp_user     = settings.smtp_user
    smtp_password = settings.smtp_password
    from_addr     = settings.from_email or smtp_user

    # --- Demo / dev fallback ---
    placeholder_values = {"", "yourgmail@gmail.com", "your-16-char-app-password-here"}
    if not smtp_user or smtp_user in placeholder_values or not smtp_password or smtp_password in placeholder_values:
        print(f"\n[SECURE AUDIT] SMTP not configured — password reset link for {to_email}:\n  {reset_url}\n")
        return

    html_body = _build_reset_email_html(reset_url)
    plain_body = (
        f"BizTrack Password Reset\n\n"
        f"You requested a password reset. Click the link below (expires in 30 minutes):\n\n"
        f"{reset_url}\n\n"
        f"If you did not request this, ignore this email."
    )

    msg = EmailMessage()
    msg["Subject"] = "BizTrack — Password Reset Request"
    msg["From"]    = f"BizTrack <{from_addr}>"
    msg["To"]      = to_email
    msg.set_content(plain_body)
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)

    print(f"[SECURE AUDIT] Password reset email sent to {to_email}")


# ---------------------------------------------------------------------------
# Page routes (HTML)
# ---------------------------------------------------------------------------

@router.get("/login", response_class=HTMLResponse)
async def read_login(request: Request):
    if is_authenticated(request):
        return RedirectResponse(url=append_nav_param("/dashboard/"), status_code=302)
    return templates.TemplateResponse(request=request, name="login.html")


@router.get("/register", response_class=HTMLResponse)
async def read_register(request: Request):
    if is_authenticated(request):
        return RedirectResponse(url=append_nav_param("/dashboard/"), status_code=302)
    return templates.TemplateResponse(request=request, name="register.html")


@router.get("/forgot", response_class=HTMLResponse)
async def read_forgot(request: Request):
    if is_authenticated(request):
        return RedirectResponse(url=append_nav_param("/dashboard/"), status_code=302)
    return templates.TemplateResponse(request=request, name="forgot.html")


@router.get("/reset", response_class=HTMLResponse)
async def read_reset(request: Request, token: str = "", email: str = ""):
    """Render the reset password page with token + email from the link."""
    return templates.TemplateResponse(
        request=request,
        name="reset_password.html",
        context={"token": token, "email": email}
    )


@router.get("/logout")
async def logout(request: Request):
    """Clear the session cookie and redirect to the login page."""
    response = RedirectResponse(url="/auth/login", status_code=302)
    response.delete_cookie(key="access_token")
    return response


# ---------------------------------------------------------------------------
# API routes (JSON)
# ---------------------------------------------------------------------------

@router.post("/api/login")
async def api_login(credentials: LoginRequest):
    # 🛡️ LOCAL PRESENTATION SECURITY FALLBACK
    # Allows the student to successfully demonstrate both roles during their
    # face-to-face defense even in the case of network failures or Supabase
    # database connectivity issues.
    # Local demo fallback: single standard user account
    if credentials.email.strip().lower() == "user@biztrack.com" and credentials.password == "user123!":
        res = JSONResponse(content={"message": "Login successful (Demo Standard User)", "redirect": append_nav_param("/dashboard/")})
        res.set_cookie(key="access_token", value="mock-user-token", httponly=True, max_age=3600 * 24, samesite="lax")
        return res

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(
            status_code=500,
            detail="Supabase is not configured. For testing, please use fallback account (user@biztrack.com / user123!).",
        )

    try:
        auth_res = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password,
        })

        access_token = auth_res.session.access_token
        res = JSONResponse(content={"message": "Login successful", "redirect": append_nav_param("/dashboard/")})
        res.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            max_age=3600 * 24,
            samesite="lax",
        )
        return res
    except Exception as e:
        error_msg = str(e)
        print(f"[SECURE AUTH AUDIT] Login error: {error_msg}")

        if any(phrase in error_msg.lower() for phrase in ["email not confirmed", "email_not_confirmed", "not confirmed"]):
            raise HTTPException(
                status_code=403,
                detail="Email not confirmed. Please check your inbox and confirm your email.",
            )
        raise HTTPException(status_code=401, detail="Authentication failed. Invalid email or password.")


@router.post("/api/register")
async def api_register(user: RegisterRequest):
    # 1. Enforce Password Complexity Policy (Vulnerability V2 / T2)
    is_valid, error_details = validate_password_strength(user.password, user.email)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_details)

    supabase = get_supabase_client()
    if supabase is None:
        return {"message": "Demo Account created successfully! Please log in.", "redirect": "/auth/login"}

    try:
        supabase.auth.sign_up({
            "email": user.email,
            "password": user.password,
            "options": {
                "data": {
                    "full_name": user.full_name,
                    "role": "User",
                }
            },
        })
        return {"message": "Registration successful. You can now log in.", "redirect": "/auth/login"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")


# ---------------------------------------------------------------------------
# Forgot Password — Step 1: request a reset link
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_TOKEN_EXPIRY_MINUTES = 30


@router.post("/api/forgot")
async def api_forgot(request: ForgotRequest):
    """Accept an email address and — if registered — send a one-time reset link.

    Security properties:
    - Always returns the same response to prevent user enumeration.
    - Token is generated with `secrets.token_urlsafe(32)` (256-bit entropy).
    - Only the bcrypt hash of the token is persisted in the database.
    - Any previous unused tokens for the same email are invalidated.
    """
    email = request.email.strip().lower()

    # Basic format validation
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    # Generic success message returned regardless of whether the email exists
    _generic_ok = JSONResponse(
        content={"message": "If that email is registered with BizTrack, a reset link has been sent. Please check your inbox (and spam folder)."}
    )

    supabase = get_supabase_client()
    admin    = _get_supabase_admin_client()

    # ---- Check whether the email belongs to a registered user ----
    user_exists = False
    user_id: Optional[str] = None

    if admin:
        try:
            # Supabase admin.list_users() returns paginated results
            users_page = admin.auth.admin.list_users()
            for u in users_page:
                if getattr(u, "email", "").lower() == email:
                    user_exists = True
                    user_id = str(u.id)
                    break
        except Exception as e:
            print(f"[SECURE AUDIT] User lookup error: {e}")

    # In demo mode (no admin key) we proceed anyway so the flow can be demonstrated
    if not user_exists and admin is not None:
        # Email not registered — return generic response silently
        return _generic_ok

    # ---- Generate a secure one-time token ----
    raw_token  = secrets.token_urlsafe(32)
    token_hash = bcrypt.hashpw(raw_token.encode(), bcrypt.gensalt()).decode()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=_TOKEN_EXPIRY_MINUTES)).isoformat()

    # ---- Persist the token hash (invalidate any previous tokens first) ----
    # Use the anon client for table access; RLS is bypassed server-side via service key
    store_client = admin or supabase
    if store_client:
        try:
            # Invalidate old pending tokens for this email
            store_client.table("password_reset_tokens") \
                .update({"used": True}) \
                .eq("email", email) \
                .eq("used", False) \
                .execute()

            # Insert new token
            store_client.table("password_reset_tokens").insert({
                "email":      email,
                "token_hash": token_hash,
                "expires_at": expires_at,
                "used":       False,
            }).execute()
        except Exception as e:
            print(f"[SECURE AUDIT] Token storage error: {e}")
            # Do NOT reveal DB errors to the caller
            return _generic_ok

    # ---- Send the reset email ----
    reset_url = (
        f"http://localhost:8000/auth/reset"
        f"?token={urllib.parse.quote(raw_token)}"
        f"&email={urllib.parse.quote(email)}"
    )
    try:
        _send_reset_email(email, reset_url)
    except Exception as e:
        import traceback
        print(f"[SECURE AUDIT] Email send error for {email}: {e}")
        print(traceback.format_exc())
        # Do NOT expose SMTP errors to the caller
        return _generic_ok

    return _generic_ok


# ---------------------------------------------------------------------------
# Reset Password — Step 2: submit the new password
# ---------------------------------------------------------------------------

@router.post("/api/reset_password")
async def api_reset_password(req: ResetPasswordRequest):
    """Validate the reset token, enforce password policy, update the password.

    Security properties:
    - Token compared via constant-time bcrypt.checkpw (timing-safe).
    - Token is marked `used=True` BEFORE the password is updated (prevents
      race-condition double-use).
    - Expired tokens are rejected server-side.
    - Password hashing is delegated to Supabase (argon2/bcrypt internally);
      bcrypt is also applied to the reset token itself.
    - Returns a generic error for invalid/expired tokens.
    """
    email     = req.email.strip().lower()
    raw_token = req.token.strip()

    if not email or not raw_token:
        raise HTTPException(status_code=400, detail="Missing email or token.")

    # ---- Validate password strength before touching the DB ----
    is_valid, error_msg = validate_password_strength(req.new_password, email)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    admin    = _get_supabase_admin_client()
    supabase = get_supabase_client()
    store_client = admin or supabase

    if store_client is None:
        raise HTTPException(status_code=500, detail="Database not configured. Please contact your administrator.")

    # ---- Fetch all non-expired, non-used tokens for this email ----
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        result  = (
            store_client.table("password_reset_tokens")
            .select("id, token_hash, expires_at, used")
            .eq("email", email)
            .eq("used", False)
            .gt("expires_at", now_iso)
            .execute()
        )
        candidates = result.data or []
    except Exception as e:
        print(f"[SECURE AUDIT] Token query error: {e}")
        raise HTTPException(status_code=500, detail="Token verification failed. Please try again.")

    # ---- Constant-time token comparison via bcrypt ----
    matched = None
    for row in candidates:
        try:
            if bcrypt.checkpw(raw_token.encode(), row["token_hash"].encode()):
                matched = row
                break
        except Exception:
            continue  # malformed hash — skip

    if not matched:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link. Please request a new one.",
        )

    # ---- Mark token as used FIRST (prevents replay / race condition) ----
    try:
        store_client.table("password_reset_tokens") \
            .update({"used": True}) \
            .eq("id", matched["id"]) \
            .execute()
    except Exception as e:
        print(f"[SECURE AUDIT] Token invalidation error: {e}")

    # ---- Update the user's password via admin client ----
    if admin is None:
        # Fallback: inform user — admin key not yet configured
        print(f"[SECURE AUDIT] Password reset token valid for {email} but SUPABASE_SERVICE_KEY not set.")
        raise HTTPException(
            status_code=500,
            detail=(
                "Password update requires the Supabase Service Role Key. "
                "Please add SUPABASE_SERVICE_KEY to your .env file."
            ),
        )

    try:
        # Find the user by email to get their UUID
        users_page = admin.auth.admin.list_users()
        target_user = next(
            (u for u in users_page if getattr(u, "email", "").lower() == email),
            None
        )
        if not target_user:
            raise HTTPException(status_code=400, detail="No account found for that email address.")

        # Update password — Supabase hashes it securely before storing
        admin.auth.admin.update_user_by_id(str(target_user.id), {"password": req.new_password})
        print(f"[SECURE AUDIT] Password successfully reset for user: {email}")

    except HTTPException:
        raise
    except Exception as e:
        err = str(e)
        print(f"[SECURE AUDIT] Password update error for {email}: {err}")
        raise HTTPException(status_code=500, detail="Password update failed. Please try again or contact support.")

    return JSONResponse(content={"message": "Your password has been reset successfully. You can now sign in with your new password."})


# ---------------------------------------------------------------------------
# Profile Management Routes
# ---------------------------------------------------------------------------

from core.auth import get_current_user
from core.security import sanitize_html

@router.get("/profile", response_class=HTMLResponse)
async def read_profile(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/auth/login", status_code=302)
    return templates.TemplateResponse(
        request=request,
        name="profile.html",
        context={"title": "My Profile", "active_page": "profile"}
    )


@router.post("/api/update-profile")
async def update_profile(request: Request, payload: UpdateProfileRequest):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    new_name = sanitize_html(payload.full_name.strip())
    if len(new_name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")

    token = request.cookies.get("access_token")
    if token == "mock-user-token":
        return {"message": "Profile updated successfully! (Demo Mode)"}

    admin = _get_supabase_admin_client()
    if admin is None:
        return {"message": "Profile updated successfully! (Local Offline)"}

    try:
        users_page = admin.auth.admin.list_users()
        target_user = next(
            (u for u in users_page if getattr(u, "email", "").lower() == user.email.lower()),
            None
        )
        if not target_user:
            raise HTTPException(status_code=404, detail="User account not found.")

        admin.auth.admin.update_user_by_id(str(target_user.id), {"user_metadata": {"full_name": new_name}})
        return {"message": "Profile updated successfully!"}
    except Exception as e:
        print(f"[SECURE AUDIT] Profile update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update profile. Please try again.")


@router.post("/api/change-password")
async def change_password(request: Request, payload: ChangePasswordRequest):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    is_valid, error_msg = validate_password_strength(payload.new_password, user.email)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    token = request.cookies.get("access_token")
    if token == "mock-user-token":
        if payload.current_password != "user123!":
            raise HTTPException(status_code=400, detail="Incorrect current password.")
        return {"message": "Password updated successfully! (Demo Mode)"}

    supabase = get_supabase_client()
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured.")

    try:
        supabase.auth.sign_in_with_password({
            "email": user.email,
            "password": payload.current_password
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Incorrect current password.")

    admin = _get_supabase_admin_client()
    if admin is None:
        raise HTTPException(status_code=500, detail="Supabase Admin key not configured.")

    try:
        users_page = admin.auth.admin.list_users()
        target_user = next(
            (u for u in users_page if getattr(u, "email", "").lower() == user.email.lower()),
            None
        )
        if not target_user:
            raise HTTPException(status_code=404, detail="User account not found.")

        admin.auth.admin.update_user_by_id(str(target_user.id), {"password": payload.new_password})
        return {"message": "Password updated successfully!"}
    except Exception as e:
        print(f"[SECURE AUDIT] Profile password change error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update password. Please try again.")
