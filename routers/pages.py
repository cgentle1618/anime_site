"""
pages.py
Handles the routing for serving frontend HTML web pages.
Separates the public-facing dashboard templates from the admin tools.
"""

from fastapi import APIRouter
from fastapi.responses import FileResponse

# Initialize the router with a tag for grouping in Swagger UI (/docs)
router = APIRouter(tags=["Frontend Pages"])

# ==========================================
# PUBLIC FRONTEND ROUTES
# ==========================================


@router.get("/", summary="Serve Dashboard")
def serve_frontend():
    """Serves the main public dashboard (Currently Watching/Paused)."""
    return FileResponse("static/index.html")


@router.get("/library", summary="Serve Library")
def serve_library():
    """Serves the full anime library data grid view."""
    return FileResponse("static/library.html")


@router.get("/anime/{system_id}", summary="Serve Anime Details")
def serve_details(system_id: str):
    """Serves the individual anime details and progress editing page."""
    return FileResponse("static/details.html")


@router.get("/series/{system_id}", summary="Serve Series Hub")
def serve_series(system_id: str):
    """Serves the franchise hub page grouping related anime."""
    return FileResponse("static/series.html")


@router.get("/search", summary="Serve Search Results")
def serve_search():
    """Serves the global search results page."""
    return FileResponse("static/search.html")


# ==========================================
# ADMIN FRONTEND ROUTES
# ==========================================


@router.get("/system", summary="Serve Admin Dashboard")
def read_admin():
    """Serves the system administration and logging dashboard."""
    return FileResponse("static/admin.html")


@router.get("/add", summary="Serve Add Entry Page")
def read_add():
    """Serves the tool for manually appending new database entries."""
    return FileResponse("static/add.html")


@router.get("/modify", summary="Serve Modify Entry Page")
def read_modify():
    """Serves the tool for editing existing database entries."""
    return FileResponse("static/modify.html")


@router.get("/delete", summary="Serve Delete Entry Page")
def read_delete():
    """Serves the tool for permanently deleting database entries."""
    return FileResponse("static/delete.html")
