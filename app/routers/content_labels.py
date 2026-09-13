"""
routers/content_labels.py
The content-label vocabulary, and which entries carry which labels.

Creating a label grants it to `unrestricted` and to no other mode, so a new
label immediately hides every entry it is put on from everyone EXCEPT a
session sitting in the widest mode. That is the safe direction in the only
place it can be: a label exists to restrict, so it restricts until an admin
decides who else may see through it - but "everybody, the owner included" is
not a safe default, it is an entry that has silently vanished.

Entry assignment replaces the whole set, structurally identical to
credits.py::replace_credits, because that is how the Add/Modify forms submit.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac import cache
from app.services.rbac.resolver import require_admin_authz
from app.services.rbac.seed_modes import MODE_UNRESTRICTED
from app.utils.media_resolver import MEDIA_TABLES

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/content-labels",
    tags=["Content Labels"],
    dependencies=[Depends(require_admin_authz)],
)


def _to_response(row: models.ContentLabel) -> schemas.ContentLabelResponse:
    return schemas.ContentLabelResponse(
        system_id=row.system_id,
        key=row.key,
        label=row.label,
        description=row.description,
        sort_order=row.sort_order,
    )


def _get_or_404(db: Session, label_id: UUID) -> models.ContentLabel:
    row = db.get(models.ContentLabel, label_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Content label not found.")
    return row


def _grant_to_unrestricted(db: Session, label: models.ContentLabel) -> None:
    """Give a new label to `unrestricted`, and to no other mode.

    Belt to cache.mode_sets's braces. That function DERIVES the unrestricted
    set, so resolution is already correct without this row; what this keeps
    correct is the table, which is what /access-modes and anything else
    reading the rows will see. Every other mode is left alone deliberately:
    a label exists to restrict, so it restricts everywhere except the mode
    whose meaning is "no restrictions".
    """
    mode = (
        db.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_UNRESTRICTED)
        .first()
    )
    if mode is None:
        # A database seeded before the modes existed, or mid-migration. The
        # derivation covers it either way.
        return
    db.add(
        models.AccessModeLabel(mode_id=mode.system_id, label_id=label.system_id)
    )


def _resolve_entry(db: Session, media_type: str, entry_id: UUID):
    """Validate the type first, so an unknown one is a 400 not a KeyError."""
    if media_type not in MEDIA_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown media type: {media_type}")
    entry = db.get(MEDIA_TABLES[media_type].model, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry


# ==========================================
# VOCABULARY
# ==========================================


@router.get(
    "/", response_model=List[schemas.ContentLabelResponse], summary="List Labels"
)
def list_labels(db: Session = Depends(get_db)):
    rows = (
        db.query(models.ContentLabel)
        .order_by(models.ContentLabel.sort_order, models.ContentLabel.key)
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post(
    "/",
    response_model=schemas.ContentLabelResponse,
    status_code=201,
    summary="Create Label",
)
def create_label(payload: schemas.ContentLabelCreate, db: Session = Depends(get_db)):
    if (
        db.query(models.ContentLabel)
        .filter(models.ContentLabel.key == payload.key)
        .first()
    ):
        raise HTTPException(status_code=409, detail="That label key exists.")
    row = models.ContentLabel(
        key=payload.key,
        label=payload.label,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(row)
    db.flush()
    _grant_to_unrestricted(db, row)
    db.commit()
    db.refresh(row)
    # The catalog just grew, so any cached "unknown permission" answer is stale.
    cache.bump()
    return _to_response(row)


@router.patch(
    "/{label_id}",
    response_model=schemas.ContentLabelResponse,
    summary="Update Label",
)
def update_label(
    label_id: UUID,
    payload: schemas.ContentLabelUpdate,
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, label_id)
    # `key` is deliberately absent: it is half of a permission name that roles
    # already hold, so renaming it would silently void every grant.
    for field in ("label", "description", "sort_order"):
        value = getattr(payload, field)
        if value is not None:
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(label_id: UUID, db: Session = Depends(get_db)):
    """Deleting a label reveals every entry that carried it - by design."""
    row = _get_or_404(db, label_id)
    db.delete(row)
    db.commit()
    cache.bump()
    return None


# ==========================================
# ENTRY ASSIGNMENT
# ==========================================


@router.get(
    "/entry/{media_type}/{entry_id}",
    response_model=List[str],
    summary="Get an Entry's Labels",
)
def get_entry_labels(
    media_type: str, entry_id: UUID, db: Session = Depends(get_db)
):
    _resolve_entry(db, media_type, entry_id)
    rows = (
        db.query(models.ContentLabel.key)
        .join(
            models.MediaContentLabel,
            models.MediaContentLabel.label_id == models.ContentLabel.system_id,
        )
        .filter(models.MediaContentLabel.media_id == entry_id)
        .all()
    )
    return sorted(key for (key,) in rows)


@router.put(
    "/entry/{media_type}/{entry_id}",
    response_model=List[str],
    summary="Replace an Entry's Labels",
)
def replace_entry_labels(
    media_type: str,
    entry_id: UUID,
    payload: schemas.EntryLabels,
    db: Session = Depends(get_db),
):
    _resolve_entry(db, media_type, entry_id)

    wanted = sorted(set(payload.label_keys))
    rows = (
        db.query(models.ContentLabel)
        .filter(models.ContentLabel.key.in_(wanted))
        .all()
        if wanted
        else []
    )
    found = {row.key: row.system_id for row in rows}
    unknown = [key for key in wanted if key not in found]
    if unknown:
        raise HTTPException(
            status_code=422, detail=f"Unknown label(s): {', '.join(unknown)}"
        )

    db.query(models.MediaContentLabel).filter(
        models.MediaContentLabel.media_id == entry_id
    ).delete(synchronize_session=False)
    for position, key in enumerate(wanted):
        db.add(
            models.MediaContentLabel(
                media_id=entry_id,
                label_id=found[key],
                position=position,
            )
        )
    db.commit()
    return wanted
