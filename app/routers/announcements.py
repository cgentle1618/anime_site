"""
routers/announcements.py
Handles the dashboard "Announcement & Notes" board.

Announcements are stored in the existing system_configs key/value table, one row
per note, keyed as 'announcement:<title>' with the note body as the value. The
prefix namespaces them away from other config keys (e.g. 'current_season').

Reads are public (the dashboard is guest-visible); writes are admin-only.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models
from app import schemas
from app.dependencies import get_db, get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])

ANNOUNCEMENT_PREFIX = "announcement:"
MAX_TITLE_LENGTH = 120


def _to_key(title: str) -> str:
    """Builds the system_configs key for an announcement title."""
    return f"{ANNOUNCEMENT_PREFIX}{title}"


def _to_title(config_key: str) -> str:
    """Strips the prefix off a system_configs key to recover the title."""
    return config_key[len(ANNOUNCEMENT_PREFIX):]


def _clean(title: str, body: str) -> tuple[str, str]:
    """Validates and normalizes an announcement title/body pair."""
    title = (title or "").strip()
    body = (body or "").strip()

    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")
    if not body:
        raise HTTPException(status_code=400, detail="Body cannot be empty.")
    if len(title) > MAX_TITLE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Title cannot exceed {MAX_TITLE_LENGTH} characters.",
        )
    if title.startswith(ANNOUNCEMENT_PREFIX):
        raise HTTPException(
            status_code=400,
            detail=f"Title cannot start with '{ANNOUNCEMENT_PREFIX}'.",
        )

    return title, body


def _get_row(db: Session, title: str):
    """Fetches the system_configs row backing an announcement, or None."""
    return (
        db.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key == _to_key(title))
        .first()
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/",
    response_model=List[schemas.AnnouncementResponse],
    summary="List Announcements",
)
def list_announcements(db: Session = Depends(get_db)):
    """Returns all dashboard announcements in creation order. Public endpoint."""
    rows = (
        db.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key.like(f"{ANNOUNCEMENT_PREFIX}%"))
        .order_by(models.SystemConfigs.id)
        .all()
    )
    return [
        schemas.AnnouncementResponse(
            title=_to_title(row.config_key), body=row.config_value
        )
        for row in rows
    ]


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", summary="Add Announcement")
def add_announcement(
    payload: schemas.AnnouncementCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Creates a new announcement. Titles must be unique."""
    title, body = _clean(payload.title, payload.body)

    if _get_row(db, title):
        raise HTTPException(
            status_code=409, detail=f"An announcement titled '{title}' already exists."
        )

    db.add(models.SystemConfigs(config_key=_to_key(title), config_value=body))
    db.commit()
    return {"message": f"Announcement '{title}' added successfully.", "title": title}


@router.put("/", summary="Update Announcement")
def update_announcement(
    payload: schemas.AnnouncementUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Updates an announcement's body, and optionally renames its title."""
    original_title = (payload.original_title or "").strip()
    if not original_title:
        raise HTTPException(status_code=400, detail="Missing original_title.")

    title, body = _clean(payload.title, payload.body)

    row = _get_row(db, original_title)
    if not row:
        raise HTTPException(
            status_code=404, detail=f"Announcement '{original_title}' not found."
        )

    if title != original_title and _get_row(db, title):
        raise HTTPException(
            status_code=409, detail=f"An announcement titled '{title}' already exists."
        )

    row.config_key = _to_key(title)
    row.config_value = body
    db.commit()
    return {"message": f"Announcement '{title}' updated successfully.", "title": title}


@router.delete("/", summary="Delete Announcement")
def delete_announcement(
    title: str = Query(..., description="Title of the announcement to delete"),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Deletes an announcement by title."""
    row = _get_row(db, title.strip())
    if not row:
        raise HTTPException(status_code=404, detail=f"Announcement '{title}' not found.")

    db.delete(row)
    db.commit()
    return {"message": f"Announcement '{title}' deleted successfully."}
