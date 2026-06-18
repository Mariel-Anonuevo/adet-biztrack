from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from routers import sales_router, dashboard_router, expenses_router, reports_router, health_router, auth_router, forecasting_router
from core.auth import get_current_user, is_public_path, is_authenticated
from core.navigation import is_direct_url_access, is_api_path, append_nav_param
import os

templates = Jinja2Templates(directory="templates")

# Initialize the FastAPI app
app = FastAPI(
    title="BizTrack API",
    description="Backend for the BizTrack application.",
    version="1.0.0"
)

# Ensure the static directory exists (where we will put CSS and JS)
os.makedirs("static", exist_ok=True)
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Mount the static directory so the frontend can access CSS and JS files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include the routers
app.include_router(auth_router.router)
app.include_router(dashboard_router.router)
app.include_router(sales_router.router)
app.include_router(expenses_router.router)
app.include_router(reports_router.router)
app.include_router(health_router.router)
app.include_router(forecasting_router.router)




def _wants_html(request: Request) -> bool:
    """Browsers and address-bar navigation prefer HTML error pages over raw JSON."""
    accept = request.headers.get("accept", "")
    if "application/json" in accept and "text/html" not in accept:
        return False
    return "text/html" in accept or "*/*" in accept or not accept.strip()


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"

    # Prevent browser from caching protected pages so the back button
    # cannot redisplay them after logout.
    path = request.url.path
    if not path.startswith("/static"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


import time, threading
from collections import defaultdict, deque
from fastapi.responses import JSONResponse

MAX_REQUESTS_PER_MINUTE = 100          
WINDOW_SECONDS = 60                 

_rate_store: defaultdict[str, deque[float]] = defaultdict(deque)
_rate_lock = threading.Lock()

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """
    Limits each client IP to MAX_REQUESTS_PER_MINUTE requests per WINDOW_SECONDS.
    Returns HTTP 429 if the limit is exceeded.
    Excludes static assets and favicon to prevent false positives.
    """
    path = request.url.path
    if path.startswith("/static") or path == "/favicon.ico":
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    with _rate_lock:
        timestamps = _rate_store[client_ip]
        # Drop old timestamps
        while timestamps and now - timestamps[0] > WINDOW_SECONDS:
            timestamps.popleft()
        timestamps.append(now)
        if len(timestamps) > MAX_REQUESTS_PER_MINUTE:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests – rate limit exceeded."},
            )
    return await call_next(request)



@app.middleware("http")
async def require_login_middleware(request: Request, call_next):
    path = request.url.path

    if is_public_path(path):
        return await call_next(request)

    user = get_current_user(request)
    if not user:
        if "/api/" in path:
            return JSONResponse(
                status_code=401,
                content={"detail": "Security: Authentication required. You must sign in first."},
            )
        if _wants_html(request):
            return templates.TemplateResponse(
                request=request,
                name="error.html",
                context={
                    "title": "Authentication Required",
                    "heading": "Security: Authentication Required",
                    "message": (
                        "You cannot open this page directly without signing in. "
                        "BizTrack blocks unauthorized URL access to protect financial data."
                    ),
                    "icon": "fa-shield-halved",
                    "color": "warning",
                    "status_code": 401,
                    "action_url": "/auth/login",
                    "action_label": "Go to Sign In",
                },
                status_code=401,
            )
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    request.state.user = user

    # RBAC removed: no admin-only middleware checks

    # Block typing URLs in the address bar — must use sidebar (even when logged in)
    if not is_api_path(path) and is_direct_url_access(request):
        if _wants_html(request):
            return templates.TemplateResponse(
                request=request,
                name="error.html",
                context={
                    "title": "Page Not Found",
                    "heading": "Page Not Found",
                    "message": "Page Not Found",
                    "icon": "fa-circle-question",
                    "color": "warning",
                    "status_code": 404,
                    "action_url": "/",
                    "action_label": "Go to Home",
                },
                status_code=404,
            )
        return JSONResponse(status_code=404, content={"detail": "Page Not Found"})

    return await call_next(request)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code == 401:
        detail = exc.detail if isinstance(exc.detail, str) else "Authentication required"
        if _wants_html(request):
            return templates.TemplateResponse(
                request=request,
                name="error.html",
                context={
                    "title": "Authentication Required",
                    "heading": "Security: Authentication Required",
                    "message": detail,
                    "icon": "fa-shield-halved",
                    "color": "warning",
                    "status_code": 401,
                    "action_url": "/auth/login",
                    "action_label": "Go to Sign In",
                },
                status_code=401,
            )
        return JSONResponse(status_code=401, content={"detail": detail})

    if exc.status_code == 403:
        detail = exc.detail if isinstance(exc.detail, str) else "Access denied"
        if _wants_html(request):
            return templates.TemplateResponse(
                request=request,
                name="error.html",
                context={
                    "title": "Access Denied",
                    "heading": "Access Denied",
                    "message": detail,
                    "icon": "fa-lock",
                    "color": "danger",
                    "status_code": 403,
                    "action_url": "/dashboard/",
                    "action_label": "Return to Dashboard",
                },
                status_code=403,
            )
        return JSONResponse(status_code=403, content={"detail": detail})

    if exc.status_code == 404:
        detail = exc.detail if isinstance(exc.detail, str) else "Page Not Found"
        if _wants_html(request):
            return templates.TemplateResponse(
                request=request,
                name="error.html",
                context={
                    "title": "Page Not Found",
                    "heading": "Page Not Found",
                    "message": detail,
                    "icon": "fa-circle-question",
                    "color": "warning",
                    "status_code": 404,
                    "action_url": "/",
                    "action_label": "Go to Home",
                },
                status_code=404,
            )
        return JSONResponse(status_code=404, content={"detail": detail})

    if _wants_html(request):
        detail = exc.detail if isinstance(exc.detail, str) else "An error occurred"
        return templates.TemplateResponse(
            request=request,
            name="error.html",
            context={
                "title": f"Error {exc.status_code}",
                "heading": "An Error Occurred",
                "message": detail,
                "icon": "fa-circle-exclamation",
                "color": "danger" if exc.status_code >= 500 else "warning",
                "status_code": exc.status_code,
                "action_url": "/",
                "action_label": "Go to Home",
            },
            status_code=exc.status_code,
        )

    if exc.status_code >= 500:
        if "/api/" in request.url.path:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": "A secure server error occurred. Details are logged server-side only."},
            )

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})



@app.get("/", include_in_schema=False)
async def root(request: Request):
    """
    Redirect the root URL to the login page if not authenticated, else to dashboard.
    """
    if is_authenticated(request):
        return RedirectResponse(url=append_nav_param("/dashboard/"))
    return RedirectResponse(url="/auth/login")

# Note: Swagger UI is automatically available at /docs
