"""
Blocks direct address-bar / bookmark URL entry while allowing in-app sidebar navigation.
Uses Sec-Fetch-Site when available; falls back to ?nav=1 on sidebar links.
"""
from fastapi import Request

NAV_QUERY_FLAG = "nav"
PROTECTED_APP_PREFIXES = ("/dashboard", "/sales", "/expenses", "/reports", "/health", "/forecasting")


def is_protected_app_page(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    return any(
        normalized == prefix or normalized.startswith(prefix + "/")
        for prefix in PROTECTED_APP_PREFIXES
    )


def is_api_path(path: str) -> bool:
    return "/api/" in path


def has_valid_nav_token(request: Request) -> bool:
    return request.query_params.get(NAV_QUERY_FLAG) == "1"


def is_sidebar_navigation(request: Request) -> bool:
    """
    True when the user clicked a link inside BizTrack (sidebar), not typed the URL.
    Checks if the referer header is from the same domain/origin host.
    """
    referer = request.headers.get("referer", "")
    if not referer:
        return False

    from urllib.parse import urlparse
    try:
        ref_url = urlparse(referer)
        req_url = urlparse(str(request.url))
        if ref_url.netloc == req_url.netloc:
            return True
    except Exception:
        pass

    return False


def is_direct_url_access(request: Request) -> bool:
    """
    True when the user typed/pasted a URL in the browser bar (or external bookmark).
    """
    path = request.url.path
    if not is_protected_app_page(path) or is_api_path(path):
        return False

    # Any access to a protected app page that is NOT classified as sidebar/in-app navigation
    # is considered a direct URL access.
    if is_sidebar_navigation(request):
        return False

    return True



def append_nav_param(path: str) -> str:
    """No-op. Returning path as-is since nav params are removed."""
    return path
