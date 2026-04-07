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

import models
import schemas
from services.image_manager import download_cover_image, delete_cover_image
from services.other_logics import (
    autofill_ep_previous,
    check_is_completed,
    mark_completed,
    resolve_parent_hierarchy,
    apply_single_fill_logic,
)
from database import get_taipei_now
from dependencies import get_db, get_current_admin

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


@router.post("/", response_model=schemas.AnimeResponse, summary="Create Anime Entry")
def create_anime_entry(
    payload: schemas.AnimeCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Creates a new Anime Entry."""

    # We explicitly generate the UUID here since 'system_id' is intentionally
    # omitted from the AnimeCreate Pydantic validation schema.
    anime_data = payload.dict()
    new_anime = models.Anime(system_id=uuid.uuid4(), **anime_data)

    # 2. Inject Business Logic
    autofill_ep_previous(db, new_anime)
    if check_is_completed(new_anime):
        mark_completed(new_anime)

    db.add(new_anime)
    db.commit()
    db.refresh(new_anime)

    return new_anime


@router.put(
    "/{system_id}", response_model=schemas.AnimeResponse, summary="Update Anime Entry"
)
def update_anime_entry(
    system_id: str,
    payload: schemas.AnimeUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates an Anime entry. Resolves parent changes and applies math logic."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    # Resolve hierarchy in case the user detached it and needs new parents
    names = {
        "en": payload.anime_name_en or db_anime.anime_name_en,
        "cn": payload.anime_name_cn or db_anime.anime_name_cn,
        "romanji": payload.anime_name_romanji or db_anime.anime_name_romanji,
        "jp": payload.anime_name_jp or db_anime.anime_name_jp,
        "alt": payload.anime_name_alt or db_anime.anime_name_alt,
    }
    f_id, s_id = resolve_parent_hierarchy(
        db, payload.franchise_id, payload.series_id, names
    )

    update_data = payload.dict(exclude_unset=True)
    update_data["franchise_id"] = f_id
    update_data["series_id"] = s_id

    for key, value in update_data.items():
        setattr(db_anime, key, value)

    db_anime.updated_at = get_taipei_now()

    # Apply Logic
    apply_single_fill_logic(db_anime, force_replace_ratings=False)
    autofill_ep_previous(db, db_anime)
    if check_is_completed(db_anime):
        mark_completed(db_anime)

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

    # Check for completion after patching
    if check_is_completed(db_anime):
        mark_completed(db_anime)

    db_anime.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_anime)

    return db_anime


@router.post(
    "/{system_id}/fill",
    response_model=schemas.AnimeResponse,
    summary="Fill Single Anime",
)
def fill_single_anime(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Executes 'Autofill & Update' logic.
    1. Calculation (autofill_ep_previous).
    2. MAL Autofill (Force replaces ratings/rank, fills missing others).
    3. Calculate Season from Month.
    """
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    # 1. Calculation
    autofill_ep_previous(db, db_anime)

    # 2 & 3. MAL Autofill (Force Ratings) & Calc Season From Month
    apply_single_fill_logic(db_anime, force_replace_ratings=True)

    # Safety check for completion
    if check_is_completed(db_anime):
        mark_completed(db_anime)

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
    """Deletes an entry, cleans up local image, and logs to V2 audit trail."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    # Clean up static files
    delete_cover_image(system_id)

    # V2 Audit Trail Logging
    display_name = db_anime.anime_name_en or db_anime.system_id
    deleted_record = models.DeletedRecord(
        system_id=str(db_anime.system_id),
        table_name="anime",  # Updated to V2 table name
        data_json=json.dumps({"anime_name_en": display_name}),
        deleted_at=get_taipei_now(),
    )
    db.add(deleted_record)

    db.delete(db_anime)
    db.commit()

    return {"message": f"Anime '{display_name}' deleted successfully."}
