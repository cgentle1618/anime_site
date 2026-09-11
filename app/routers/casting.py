"""
routers/casting.py
Read and wholesale-replace one media entry's cast.

Not a part of /api/credits, whose payload is Dict[str, List[str]] - bare
names keyed by role. A cast row is richer than that: it names a character, an
optional seiyuu, a role, a display position, a photo, and a remark, and each
of those needs its own column rather than collapsing into a name string.
Keeping the two endpoints apart also keeps /api/credits' role vocabulary
(credit_roles_for) untouched by a concern - character casting - that only
four of the eight media types even have.

Mirrors app/routers/credits.py's shape: `_resolve_entry` validates media_type
before doing anything else, so an unknown type is a 400 rather than a
KeyError; a hidden entry answers exactly as an absent one does (404, not
403); and only PUT requires an admin.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.domain import casting as casting_service
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.utils.media_resolver import MEDIA_TABLES

router = APIRouter(prefix="/api/casting", tags=["Casting"])


class CastRowIn(BaseModel):
    character_id: UUID
    person_id: Optional[UUID] = None
    role: Optional[str] = None
    position: Optional[int] = None
    photo_file: Optional[str] = None
    remark: Optional[str] = None


class CastIn(BaseModel):
    cast: List[CastRowIn] = []


def _resolve_entry(db: Session, media_type: str, entry_id: UUID, viewer):
    """
    Validate media_type first, so an unknown type is a 400 not a KeyError.

    `viewer` is required and the visibility test is not optional: the GET above
    has asked since the content-label work and the PUT below never did, so a
    holder of manage.catalog lacking the label could rewrite an entry it cannot
    read. Writes follow reads (decision 9), and the 404 message is the one a
    genuinely missing entry gets.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown media type: {media_type}")

    model = MEDIA_TABLES[media_type].model
    entry = db.get(model, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    if not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry


@router.get("/{media_type}/{entry_id}", summary="Get an entry's cast")
def get_casting(
    media_type: str,
    entry_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """The entry's cast, ordered by position."""
    _resolve_entry(db, media_type, entry_id, viewer)

    return {"cast": casting_service.casting_rows(db, media_type, entry_id)}


@router.put("/{media_type}/{entry_id}", summary="Replace an entry's cast")
def replace_casting(
    media_type: str,
    entry_id: UUID,
    payload: CastIn,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Replaces the whole cast in the order submitted."""
    _resolve_entry(db, media_type, entry_id, admin)

    rows = [row.model_dump(exclude_none=True) for row in payload.cast]
    try:
        casting_service.replace_casting(db, media_type, entry_id, rows)
    except casting_service.CastingValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.commit()
    return {"status": "success"}
