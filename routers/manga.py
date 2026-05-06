"""
routers/manga.py
Handles all API endpoints related to Manga entries (manga, manhwa, manhua).
Thin controller layer — all heavy logic delegated to services.
"""

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import or_

from dependencies import get_db, get_current_admin
from database import get_taipei_now
import models
import schemas

from services.image_manager import delete_cover_image
from services.other_logics import resolve_manga_parent_hierarchy
from services.data_control import execute_replace_single_manga
from utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/manga", tags=["Manga Management"])


# ==========================================
# PUBLIC READ OPERATIONS
# ==========================================


@router.get("/", response_model=List[schemas.MangaResponse], summary="Get All Manga")
def get_all_manga(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    reading_status: Optional[str] = None,
    serialization_status: Optional[str] = None,
    to_reread: Optional[bool] = None,
    search_query: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Manga)

    if franchise_id:
        query = query.filter(models.Manga.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Manga.series_id == series_id)
    if reading_status:
        query = query.filter(models.Manga.reading_status == reading_status)
    if serialization_status:
        query = query.filter(models.Manga.serialization_status == serialization_status)
    if to_reread is not None:
        query = query.filter(models.Manga.to_reread == to_reread)
    if search_query:
        q = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Manga.manga_name_cn.ilike(q),
                models.Manga.manga_name_en.ilike(q),
                models.Manga.manga_name_roman.ilike(q),
                models.Manga.manga_name_jp.ilike(q),
                models.Manga.manga_name_alt.ilike(q),
            )
        )

    return query.order_by(models.Manga.created_at.desc()).all()


@router.get(
    "/{manga_id}", response_model=schemas.MangaResponse, summary="Get Manga by ID"
)
def get_manga_by_id(manga_id: str, db: Session = Depends(get_db)):
    entry = db.query(models.Manga).filter(models.Manga.system_id == manga_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Manga entry not found.")
    return entry


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.MangaResponse,
    status_code=201,
    summary="Create Manga",
)
async def create_manga(
    data: schemas.MangaCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    new_entry = models.Manga(**data.model_dump())
    new_entry.system_id = uuid.uuid4()

    new_entry.franchise_id, new_entry.series_id = resolve_manga_parent_hierarchy(
        db,
        new_entry.franchise_id,
        new_entry.series_id,
        {
            "en": new_entry.manga_name_en,
            "cn": new_entry.manga_name_cn,
            "roman": new_entry.manga_name_roman,
            "jp": new_entry.manga_name_jp,
            "alt": new_entry.manga_name_alt,
        },
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    await execute_replace_single_manga(
        db, str(new_entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(new_entry)

    return new_entry


@router.put(
    "/{manga_id}",
    response_model=schemas.MangaResponse,
    summary="Update Manga",
)
async def update_manga(
    manga_id: str,
    data: schemas.MangaUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Manga).filter(models.Manga.system_id == manga_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Manga entry not found.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    if data.reading_status == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.franchise_id, entry.series_id = resolve_manga_parent_hierarchy(
        db,
        entry.franchise_id,
        entry.series_id,
        {
            "en": entry.manga_name_en,
            "cn": entry.manga_name_cn,
            "roman": entry.manga_name_roman,
            "jp": entry.manga_name_jp,
            "alt": entry.manga_name_alt,
        },
    )

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)

    await execute_replace_single_manga(
        db, str(entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(entry)

    return entry


@router.patch(
    "/{manga_id}",
    response_model=schemas.MangaResponse,
    summary="Patch Manga",
)
async def patch_manga(
    manga_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Manga).filter(models.Manga.system_id == manga_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Manga entry not found.")

    for key, value in payload.items():
        if hasattr(entry, key):
            setattr(entry, key, value)

    if payload.get("reading_status") == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{manga_id}", summary="Delete Manga")
def delete_manga(
    manga_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Manga).filter(models.Manga.system_id == manga_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Manga entry not found.")

    if entry.cover_image_file:
        delete_cover_image(manga_id)
    log_deleted_record(db, entry, "Manga")
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": "Manga entry deleted successfully."}
