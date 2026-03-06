"""
routers/pages.py
Handles serving Jinja2 HTML templates for the frontend.
Includes logic to detect admin status via secure cookies.
"""

import jwt
import os
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

# We need the security settings to decode the cookie
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_dev_secret_key_change_me_in_prod")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

router = APIRouter(tags=["Frontend Pages"])
templates = Jinja2Templates(directory="templates")


def check_admin_status(request: Request) -> bool:
    """
    Helper to check if the current request has a valid Admin JWT in the cookies.
    """
    token = request.cookies.get("access_token")
    if not token or not token.startswith("Bearer "):
        return False

    try:
        # Extract the token string after 'Bearer '
        token_str = token.split(" ")[1]
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("role") == "admin"
    except Exception:
        return False


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
    "/anime/{system_id}", response_class=HTMLResponse, summary="Serve Anime Details"
)
async def serve_details(request: Request, system_id: str):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "details.html",
        {"request": request, "system_id": system_id, "is_admin": is_admin},
    )


@router.get(
    "/series/{system_id}", response_class=HTMLResponse, summary="Serve Series Hub"
)
async def serve_series(request: Request, system_id: str):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "series.html",
        {"request": request, "system_id": system_id, "is_admin": is_admin},
    )


@router.get("/search", response_class=HTMLResponse, summary="Serve Search Results")
async def serve_search(request: Request):
    is_admin = check_admin_status(request)
    return templates.TemplateResponse(
        "search.html", {"request": request, "is_admin": is_admin}
    )


@router.get("/login", response_class=HTMLResponse, summary="Serve Login Portal")
async def serve_login(request: Request):
    # If already logged in, don't show login page; go to admin system
    if check_admin_status(request):
        return RedirectResponse(url="/system", status_code=303)
    return templates.TemplateResponse(
        "login.html", {"request": request, "is_admin": False}
    )


# --- ADMIN ROUTES ---
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
