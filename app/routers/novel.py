"""
routers/novel.py
Handles all API endpoints related to Novel entries.
Thin controller layer — all heavy logic delegated to services.
"""

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from dependencies import get_db, get_current_admin
from database import get_taipei_now
import models
import schemas

from services.image_manager import delete_cover_image
from services.other_logics import apply_completion_timestamp, mark_novel_completed, resolve_novel_parent_hierarchy
from services.data_control import execute_replace_single_novel
from utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/novel", tags=["Novel Management"])


# ==========================================
# PUBLIC READ OPERATIONS
# ==========================================


@router.get("/", response_model=List[schemas.NovelResponse], summary="Get All Novels")
def get_all_novels(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    reading_status: Optional[str] = None,
    serialization_status: Optional[str] = None,
    to_reread: Optional[bool] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(models.Novel)

    if franchise_id:
        query = query.filter(models.Novel.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Novel.series_id == series_id)
    if reading_status:
        query = query.filter(models.Novel.reading_status == reading_status)
    if serialization_status:
        query = query.filter(models.Novel.serialization_status == serialization_status)
    if to_reread is not None:
        query = query.filter(models.Novel.to_reread == to_reread)
    if search_query:
        q = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Novel.novel_name_cn.ilike(q),
                models.Novel.novel_name_en.ilike(q),
                models.Novel.novel_name_roman.ilike(q),
                models.Novel.novel_name_jp.ilike(q),
                models.Novel.novel_name_alt.ilike(q),
            )
        )

    return query.order_by(models.Novel.created_at.desc()).limit(limit).offset(offset).all()


@router.get(
    "/{novel_id}", response_model=schemas.NovelResponse, summary="Get Novel by ID"
)
def get_novel_by_id(novel_id: str, db: Session = Depends(get_db)):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")
    return entry


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.NovelResponse,
    status_code=201,
    summary="Create Novel",
)
async def create_novel(
    data: schemas.NovelCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    new_entry = models.Novel(**data.model_dump())
    new_entry.system_id = uuid.uuid4()

    new_entry.franchise_id, new_entry.series_id = resolve_novel_parent_hierarchy(
        db,
        new_entry.franchise_id,
        new_entry.series_id,
        {
            "en": new_entry.novel_name_en,
            "cn": new_entry.novel_name_cn,
            "roman": new_entry.novel_name_roman,
            "jp": new_entry.novel_name_jp,
            "alt": new_entry.novel_name_alt,
        },
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    await execute_replace_single_novel(
        db, str(new_entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(new_entry)

    return new_entry


@router.put(
    "/{novel_id}",
    response_model=schemas.NovelResponse,
    summary="Update Novel",
)
async def update_novel(
    novel_id: str,
    data: schemas.NovelUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    apply_completion_timestamp(entry, data.reading_status)

    entry.franchise_id, entry.series_id = resolve_novel_parent_hierarchy(
        db,
        entry.franchise_id,
        entry.series_id,
        {
            "en": entry.novel_name_en,
            "cn": entry.novel_name_cn,
            "roman": entry.novel_name_roman,
            "jp": entry.novel_name_jp,
            "alt": entry.novel_name_alt,
        },
    )

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)

    await execute_replace_single_novel(
        db, str(entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(entry)

    return entry


@router.patch(
    "/{novel_id}",
    response_model=schemas.NovelResponse,
    summary="Patch Novel",
)
async def patch_novel(
    novel_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    for key, value in payload.items():
        if hasattr(entry, key):
            setattr(entry, key, value)

    apply_completion_timestamp(entry, payload.get("reading_status"))

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    return entry


@router.post(
    "/{novel_id}/complete",
    response_model=schemas.NovelResponse,
    summary="Mark Novel Entry as Completed",
)
def complete_novel_entry(
    novel_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a novel entry."""
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    mark_novel_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{novel_id}", summary="Delete Novel")
def delete_novel(
    novel_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    if entry.cover_image_file:
        delete_cover_image(novel_id)
    log_deleted_record(db, entry, "Novel")
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": "Novel entry deleted successfully."}
