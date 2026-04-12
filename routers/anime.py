"""
routers/anime.py
Handles all API endpoints related to individual anime entries.
Strictly acts as a Controller layer: handles routing, schema validation, and HTTP responses.
All heavy business logic is delegated to services.other_logics.
"""

import uuid
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_

from dependencies import get_db, get_current_admin
from database import get_taipei_now
import models
import schemas

from services.image_manager import delete_cover_image
from services.other_logics import (
    autofill_ep_previous,
    apply_single_replace_anime,
    resolve_anime_parent_hierarchy,
)

from utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/anime", tags=["Anime Management"])


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.AnimeResponse], summary="Get All Anime")
def get_all_anime(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    search_query: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Retrieves Anime entries, supporting foreign key filters and search."""
    query = db.query(models.Anime)

    if franchise_id:
        query = query.filter(models.Anime.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Anime.series_id == series_id)

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Anime.anime_name_en.ilike(search_term),
                models.Anime.anime_name_cn.ilike(search_term),
                models.Anime.anime_name_romanji.ilike(search_term),
                models.Anime.anime_name_jp.ilike(search_term),
                models.Anime.anime_name_alt.ilike(search_term),
            )
        )

    return query.order_by(models.Anime.created_at.desc()).all()


@router.get(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Get Anime by ID"
)
def get_anime_by_id(system_id: str, db: Session = Depends(get_db)):
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")
    return db_anime


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.AnimeResponse,
    status_code=201,
    summary="Create Anime Entry",
)
def create_anime_entry(
    anime_in: schemas.AnimeCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a new anime entry.
    Applies unified domain rules and correctly cascades episode calculations.
    """
    new_anime = models.Anime(**anime_in.model_dump())
    new_anime.system_id = uuid.uuid4()

    final_franchise_id, final_series_id = resolve_anime_parent_hierarchy(
        db, new_anime.franchise_id, new_anime.series_id, new_anime.names_dict
    )
    new_anime.franchise_id = final_franchise_id
    new_anime.series_id = final_series_id

    db.add(new_anime)

    apply_single_replace_anime(db, new_anime, force_replace_ratings=False)

    db.flush()

    autofill_ep_previous(db, new_anime.franchise_id, new_anime.series_id)

    db.commit()
    db.refresh(new_anime)
    return new_anime


@router.put(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Update Anime Entry"
)
def update_anime_entry(
    system_id: str,
    anime_in: schemas.AnimeUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Updates an anime entry.
    Applies unified domain rules and correctly cascades episode calculations.
    """
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    update_data = anime_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_anime, key, value)

    final_franchise_id, final_series_id = resolve_anime_parent_hierarchy(
        db, db_anime.franchise_id, db_anime.series_id, db_anime.names_dict
    )
    db_anime.franchise_id = final_franchise_id
    db_anime.series_id = final_series_id

    apply_single_replace_anime(db, db_anime, force_replace_ratings=False)

    db.flush()

    autofill_ep_previous(db, db_anime.franchise_id, db_anime.series_id)

    db_anime.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_anime)

    return db_anime


@router.patch(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Patch Anime Entry"
)
def patch_anime_entry(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates an entry (e.g., '+1 Episode'). Auto-completes if maxed."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    for key, value in payload.items():
        if hasattr(db_anime, key):
            setattr(db_anime, key, value)

    db_anime.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_anime)

    return db_anime


@router.delete("/{system_id}", summary="Delete Anime Entry")
def delete_anime_entry(
    system_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Deletes an entry, cleans up local image, and logs to audit trail."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    delete_cover_image(system_id)

    log_deleted_record(db, db_anime, "Anime")

    db.delete(db_anime)
    db.commit()

    return {"status": "success", "message": "Anime entry deleted successfully."}
