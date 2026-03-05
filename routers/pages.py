"""
pages.py
Refactored to use Jinja2 Templates.
Instead of serving static files, we now 'render' templates, allowing
for a universal layout (base.html) to be shared across all pages.
"""

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["Frontend Pages"])

# Initialize Jinja2 Templates directory
# This folder will hold our base layout and page-specific content
templates = Jinja2Templates(directory="templates")

# ==========================================
# PUBLIC FRONTEND ROUTES
# ==========================================


@router.get("/", response_class=HTMLResponse, summary="Serve Dashboard")
async def serve_dashboard(request: Request):
    """Renders the main dashboard using Jinja2."""
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/library", response_class=HTMLResponse, summary="Serve Library")
async def serve_library(request: Request):
    """Renders the library view."""
    return templates.TemplateResponse("library.html", {"request": request})


@router.get(
    "/anime/{system_id}", response_class=HTMLResponse, summary="Serve Anime Details"
)
async def serve_details(request: Request, system_id: str):
    """Renders the anime details page."""
    return templates.TemplateResponse(
        "details.html", {"request": request, "system_id": system_id}
    )


@router.get(
    "/series/{system_id}", response_class=HTMLResponse, summary="Serve Series Hub"
)
async def serve_series(request: Request, system_id: str):
    """Renders the series hub page."""
    return templates.TemplateResponse(
        "series.html", {"request": request, "system_id": system_id}
    )


@router.get("/search", response_class=HTMLResponse, summary="Serve Search Results")
async def serve_search(request: Request):
    """Renders the global search results page."""
    return templates.TemplateResponse("search.html", {"request": request})


# ==========================================
# ADMIN FRONTEND ROUTES
# ==========================================


@router.get("/system", response_class=HTMLResponse, summary="Serve Admin Dashboard")
async def read_admin(request: Request):
    """Renders the administration dashboard."""
    return templates.TemplateResponse("admin.html", {"request": request})


@router.get("/add", response_class=HTMLResponse, summary="Serve Add Entry Page")
async def read_add(request: Request):
    """Renders the tool for adding new entries."""
    return templates.TemplateResponse("add.html", {"request": request})


@router.get("/modify", response_class=HTMLResponse, summary="Serve Modify Entry Page")
async def read_modify(request: Request):
    """Renders the edit tool for existing records."""
    return templates.TemplateResponse("modify.html", {"request": request})


@router.get("/delete", response_class=HTMLResponse, summary="Serve Delete Entry Page")
async def read_delete(request: Request):
    """Renders the deletion management tool."""
    return templates.TemplateResponse("delete.html", {"request": request})
