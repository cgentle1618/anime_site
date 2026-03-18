"""
routers/pages.py
Handles serving Jinja2 HTML templates for the frontend.
Strictly responsible for UI rendering, not API data processing.
"""

import jwt
import logging
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

# Import centralized cryptographic constants
from services.security import SECRET_KEY, ALGORITHM

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize router and template engine
router = APIRouter(tags=["Frontend Pages"])
templates = Jinja2Templates(directory="templates")


def check_admin_status(request: Request) -> bool:
    """
    Helper to securely check if the current request has a valid Admin JWT in the HTTP-Only cookie.
    Returns a boolean rather than raising an exception, allowing templates to dynamically
    render Guest vs. Admin views without crashing the page load.
    """
    token = request.cookies.get("access_token")
    if not token or not token.startswith("Bearer "):
        return False

    try:
        # Extract the raw JWT string
        token_str = token.split(" ")[1]
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("role") == "admin"

    except jwt.ExpiredSignatureError:
        logger.warning("JWT decode failed: Token has expired.")
        return False
    except jwt.PyJWTError as e:
        logger.warning(f"JWT decode failed: Invalid token ({e}).")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during JWT template validation: {e}")
        return False


# ==========================================
# PUBLIC ROUTES (Accessible to Guests)
# ==========================================


@router.get("/", response_class=HTMLResponse, summary="Serve Dashboard")
async def serve_dashboard(request: Request):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "index.html", {"request": request, "is_admin": is_admin}
    )


@router.get("/library", response_class=HTMLResponse, summary="Serve Library")
async def serve_library(request: Request):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "library.html", {"request": request, "is_admin": is_admin}
    )


@router.get(
    "/under-development",
    response_class=HTMLResponse,
    summary="Serve Under Development Page",
)
async def serve_under_development(request: Request):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "under_development.html", {"request": request, "is_admin": is_admin}
    )


@router.get("/search", response_class=HTMLResponse, summary="Serve Search Results")
async def serve_search(request: Request):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "search.html", {"request": request, "is_admin": is_admin}
    )


@router.get(
    "/anime/{system_id}", response_class=HTMLResponse, summary="Serve Anime Details"
)
async def serve_anime_details(request: Request, system_id: str):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "details.html",
        {"request": request, "is_admin": is_admin, "system_id": system_id},
    )


@router.get(
    "/series/{system_id}", response_class=HTMLResponse, summary="Serve Series Details"
)
async def serve_series_details(request: Request, system_id: str):
    is_admin = check_admin_status(request)
    # Uses a generic series details or falls back to standard view structure
    return templates.TemplateResponse(
        "series.html",
        {"request": request, "is_admin": is_admin, "system_id": system_id},
    )


@router.get("/login", response_class=HTMLResponse, summary="Serve Login Page")
async def serve_login(request: Request):
    """
    Serves the login page. If the user is already authenticated with a valid
    Admin cookie, they are seamlessly redirected back to the dashboard.
    """
    if check_admin_status(request):
        return RedirectResponse(url="/", status_code=303)

    return templates.TemplateResponse(
        "login.html", {"request": request, "is_admin": False}
    )


# ==========================================
# PROTECTED ADMIN ROUTES (Redirects Guests)
# ==========================================


@router.get("/system", response_class=HTMLResponse, summary="Serve Admin Dashboard")
async def serve_admin(request: Request):
    is_admin = check_admin_status(request)
    if not is_admin:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        "admin.html", {"request": request, "is_admin": is_admin}
    )


@router.get("/add", response_class=HTMLResponse, summary="Serve Add Page")
async def serve_add(request: Request):
    is_admin = check_admin_status(request)
    if not is_admin:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        "add.html", {"request": request, "is_admin": is_admin}
    )


@router.get("/modify", response_class=HTMLResponse, summary="Serve Modify Page")
async def serve_modify(request: Request):
    is_admin = check_admin_status(request)
    if not is_admin:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        "modify.html", {"request": request, "is_admin": is_admin}
    )


@router.get("/delete", response_class=HTMLResponse, summary="Serve Delete Page")
async def serve_delete(request: Request):
    is_admin = check_admin_status(request)
    if not is_admin:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        "delete.html", {"request": request, "is_admin": is_admin}
    )
