"""
routers/studio.py
CRUD for production studios credited on media entries, plus merge.

Mirrors app/routers/person.py without the role filter (studios have no
role_scope concept). Deleting a studio cascades its credits away (see
MediaCredit.studio_id ondelete="CASCADE") - merge is the fix for a duplicate,
repointing every credit before deleting the loser so credit history survives.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db
from app.services.domain.credits import find_studio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studio", tags=["Studio Management"])


def _to_response(db: Session, studio: models.Studio) -> schemas.StudioResponse:
    credit_count = (
        db.query(models.MediaCredit)
        .filter(models.MediaCredit.studio_id == studio.system_id)
        .count()
    )
    return schemas.StudioResponse(
        system_id=studio.system_id,
        name_native=studio.name_native,
        name_en=studio.name_en,
        name_cn=studio.name_cn,
        my_rating=studio.my_rating,
        logo_file=studio.logo_file,
        remark=studio.remark,
        credit_count=credit_count,
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.StudioResponse], summary="Get All Studios")
def get_all_studios(db: Session = Depends(get_db)):
    """Retrieves every studio, sorted by native name."""
    studios = db.query(models.Studio).order_by(models.Studio.name_native).all()
    return [_to_response(db, studio) for studio in studios]


@router.get(
    "/{system_id}", response_model=schemas.StudioResponse, summary="Get Studio by ID"
)
def get_studio_by_id(system_id: UUID, db: Session = Depends(get_db)):
    """Retrieves a single studio by its UUID."""
    studio = db.get(models.Studio, system_id)
    if studio is None:
        raise HTTPException(status_code=404, detail="Studio not found.")
    return _to_response(db, studio)


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.StudioResponse, summary="Create Studio")
def create_studio(
    payload: schemas.StudioCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a studio, or returns the existing one under that name.

    Find-or-create for the same reason as POST /api/person: the Add and Modify
    forms POST here through ensureSourceValues.js whenever a typed name is not
    in the suggestion list, so a "create" for a studio that already exists is
    routine, and a second row would split its credits. Matching is on the
    normalized name, the key resolve_studio uses.

    Metadata on an existing studio is left untouched - use PUT to edit it.
    """
    studio = find_studio(db, payload.name_native)
    if studio is None:
        studio = models.Studio(**payload.model_dump())
        db.add(studio)
        db.commit()
        db.refresh(studio)
    return _to_response(db, studio)


@router.put(
    "/{system_id}", response_model=schemas.StudioResponse, summary="Update Studio"
)
def update_studio(
    system_id: UUID,
    payload: schemas.StudioUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Fully updates a studio's metadata. Since every media_credit points at the
    studio row by id, renaming here changes what every credited entry shows -
    no separate propagation step is needed.
    """
    studio = db.get(models.Studio, system_id)
    if studio is None:
        raise HTTPException(status_code=404, detail="Studio not found.")

    for key, value in payload.model_dump().items():
        setattr(studio, key, value)

    db.commit()
    db.refresh(studio)
    return _to_response(db, studio)


@router.delete("/{system_id}", summary="Delete Studio")
def delete_studio(
    system_id: UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a studio. Its credits cascade away with it - see the
    merge endpoint for the correct fix when this studio is a duplicate.
    """
    studio = db.get(models.Studio, system_id)
    if studio is None:
        raise HTTPException(status_code=404, detail="Studio not found.")

    db.delete(studio)
    db.commit()

    return {"status": "success", "message": "Studio deleted successfully."}


@router.post("/{system_id}/merge", summary="Merge Another Studio Into This One")
def merge_studio(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Repoint every credit from `source_id` onto this studio, then delete the
    source. This - not delete - is the fix for a duplicate: deleting cascades
    the credits away, so merging is the only way to keep them.
    """
    if system_id == payload.source_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a studio into itself."
        )

    keep = db.get(models.Studio, system_id)
    drop = db.get(models.Studio, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail="Studio not found.")

    held = {
        (c.media_type, c.entry_id, c.role)
        for c in db.query(models.MediaCredit).filter_by(studio_id=system_id).all()
    }
    moved = 0
    for credit in (
        db.query(models.MediaCredit).filter_by(studio_id=payload.source_id).all()
    ):
        if (credit.media_type, credit.entry_id, credit.role) in held:
            db.delete(credit)
            continue
        credit.studio_id = system_id
        moved += 1

    db.delete(drop)
    db.commit()
    return {"status": "success", "credits_moved": moved}
