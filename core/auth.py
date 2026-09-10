from dataclasses import dataclass
from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse
from db.supabase_client import get_supabase_client
from core.config import get_settings

PUBLIC_PREFIXES = ("/auth", "/static", "/docs", "/redoc", "/openapi.json")

# RBAC removed: no admin-only paths
ADMIN_ONLY_PATHS = ()


@dataclass
class SessionUser:
    """Normalized session user with guaranteed metadata for templates and RBAC."""
    email: str
    user_metadata: dict
    id: str = "mock-user-id"

    @property
    def role(self) -> str:
        return self.user_metadata.get("role", "User")

    @property
    def full_name(self) -> str:
        return self.user_metadata.get("full_name", "BizTrack User")


def is_public_path(path: str) -> bool:
    if path == "/":
        return True
    if path.startswith("/auth/profile") or path.startswith("/auth/api/update-profile") or path.startswith("/auth/api/change-password"):
        return False
    return any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)


def resolve_role(email: str, meta_role: str | None = None) -> str:
    """RBAC removed — all accounts are Standard Users."""
    return "User"


def _session_from_supabase_user(user) -> SessionUser:
    raw_meta = getattr(user, "user_metadata", None)
    meta = raw_meta if isinstance(raw_meta, dict) else {}
    email = getattr(user, "email", None) or meta.get("email") or "user@biztrack.com"
    meta_role = meta.get("role")
    user_id = getattr(user, "id", None) or "mock-user-id"
    return SessionUser(
        email=email,
        user_metadata={
            "full_name": meta.get("full_name") or meta.get("name") or email.split("@")[0],
            "role": resolve_role(email, meta_role),
        },
        id=str(user_id)
    )


def get_current_user(request: Request) -> SessionUser | None:
    """
    Verifies the session token and returns a normalized user object.
    Only mock tokens work when Supabase is offline.
    """
    token = request.cookies.get("access_token")
    if not token or not token.strip():
        return None

    token = token.strip()
    # Strip quotes if the browser/framework wrapped the cookie value in quotes
    if token.startswith('"') and token.endswith('"'):
        token = token[1:-1].strip()

    # Local/demo fallback: single standard user token
    if token == "mock-user-token":
        return SessionUser(
            email="user@biztrack.com",
            user_metadata={"full_name": "Standard User", "role": "User"},
            id="mock-user-id"
        )

    supabase = get_supabase_client()
    if not supabase:
        return None

    try:
        auth_res = supabase.auth.get_user(jwt=token)
        if auth_res and auth_res.user:
            return _session_from_supabase_user(auth_res.user)
        return None
    except Exception as e:
        print(f"[SECURE AUTH AUDIT] Token verification failed: {e}")
        return None



def is_authenticated(request: Request) -> bool:
    return get_current_user(request) is not None


def login_redirect(reason: str | None = None) -> RedirectResponse:
    url = "/auth/login"
    if reason:
        url = f"{url}?reason={reason}"
    return RedirectResponse(url=url, status_code=302)


def get_user_role(user) -> str:
    if user is None:
        return "User"
    if isinstance(user, SessionUser):
        return user.role
    meta = getattr(user, "user_metadata", None)
    if isinstance(meta, dict):
        return meta.get("role", "User")
    return "User"


def require_admin(user) -> None:
    """No-op: admin role removed from the system."""
    return None


def is_admin_only_path(path: str) -> bool:
    # With RBAC removed there are no admin-only paths
    return False
