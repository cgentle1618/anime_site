"""
routers/credits.py
Read and replace one media entry's credits and tags in a single call.

Mirrors how the Add/Modify forms already submit: the whole set for a field at
once, not incremental adds. GET returns only the roles/fields that actually
have rows - a bare entry returns two empty maps. PUT touches only the roles
and fields named in the payload; a role absent from the body is left alone,
one present with an empty list is cleared.
"""

from typing import Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies import get_current_admin, get_db
from app.services.domain import credits as credits_service
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.credit_roles import credit_roles_for, tag_fields_for
from app.utils.media_resolver import MEDIA_TABLES

router = APIRouter(prefix="/api/credits", tags=["Credits"])


class CreditsAndTags(BaseModel):
    credits: Dict[str, List[str]] = {}
    tags: Dict[str, List[str]] = {}


def _resolve_entry(db: Session, media_type: str, entry_id: UUID):
    """Validate media_type first, so an unknown type is a 400 not a KeyError."""
    if media_type not in MEDIA_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown media type: {media_type}")

    model = MEDIA_TABLES[media_type].model
    entry = db.get(model, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry


@router.get("/{media_type}/{entry_id}", summary="Get an entry's credits and tags")
def get_credits(
    media_type: str,
    entry_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Returns only the roles and fields that actually have rows."""
    _resolve_entry(db, media_type, entry_id)
    # Credits name the people on an entry, and a 200 here confirms it exists,
    # so a hidden entry has to answer exactly as an absent one does.
    if not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found.")

    credits_out: Dict[str, List[str]] = {}
    for role_spec in credit_roles_for(media_type):
        names = credits_service.credit_names(db, media_type, entry_id, role_spec.key)
        if names:
            credits_out[role_spec.key] = names

    tags_out: Dict[str, List[str]] = {}
    for field_spec in tag_fields_for(media_type):
        values = credits_service.tag_values(db, media_type, entry_id, field_spec.key)
        if values:
            tags_out[field_spec.key] = values

    return {"credits": credits_out, "tags": tags_out}


@router.put("/{media_type}/{entry_id}", summary="Replace an entry's credits and tags")
def replace_credits(
    media_type: str,
    entry_id: UUID,
    payload: CreditsAndTags,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Replaces only the roles and fields named in the payload."""
    _resolve_entry(db, media_type, entry_id)

    allowed_roles = {r.key for r in credit_roles_for(media_type)}
    allowed_fields = {f.key for f in tag_fields_for(media_type)}

    for role in payload.credits:
        if role not in allowed_roles:
            raise HTTPException(
                status_code=400,
                detail=f"'{role}' is not a valid credit role for {media_type}.",
            )
    for field in payload.tags:
        if field not in allowed_fields:
            raise HTTPException(
                status_code=400,
                detail=f"'{field}' is not a valid tag field for {media_type}.",
            )

    for role, names in payload.credits.items():
        credits_service.replace_credits(db, media_type, entry_id, role, names)
    for field, values in payload.tags.items():
        credits_service.replace_tags(db, media_type, entry_id, field, values)

    db.commit()
    return {"status": "success"}
