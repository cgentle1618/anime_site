"""
routers/movie.py
Handles all API endpoints related to Movie entries (live-action and animated films).
Thin controller layer — all heavy logic delegated to services.
"""

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from dependencies import get_db, get_current_admin
from database import get_taipei_now
import models
import schemas

from services.image_manager import delete_cover_image
from services.other_logics import resolve_movie_parent_hierarchy, mark_movie_completed
from services.data_control import execute_replace_single_movie
from utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/movies", tags=["Movie Management"])


# ==========================================
# PUBLIC READ OPERATIONS
# ==========================================


@router.get("/", response_model=List[schemas.MovieResponse], summary="Get All Movies")
def get_all_movies(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    watching_status: Optional[str] = None,
    airing_status: Optional[str] = None,
    movie_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Movies)

    if franchise_id:
        query = query.filter(models.Movies.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Movies.series_id == series_id)
    if watching_status:
        query = query.filter(models.Movies.watching_status == watching_status)
    if airing_status:
        query = query.filter(models.Movies.airing_status == airing_status)
    if movie_type:
        query = query.filter(models.Movies.movie_type == movie_type)

    return query.order_by(models.Movies.created_at.desc()).all()


@router.get(
    "/{movie_id}",
    response_model=schemas.MovieResponse,
    summary="Get Movie by ID",
)
def get_movie_by_id(movie_id: str, db: Session = Depends(get_db)):
    entry = db.query(models.Movies).filter(models.Movies.system_id == movie_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Movie entry not found.")
    return entry


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.MovieResponse,
    status_code=201,
    summary="Create Movie",
)
async def create_movie(
    data: schemas.MovieCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    new_entry = models.Movies(**data.model_dump())
    new_entry.system_id = uuid.uuid4()

    new_entry.franchise_id, new_entry.series_id = resolve_movie_parent_hierarchy(
        db,
        new_entry.franchise_id,
        new_entry.series_id,
        {
            "en": new_entry.movie_name_en,
            "cn": new_entry.movie_name_cn,
            "alt": new_entry.movie_name_alt,
        },
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    await execute_replace_single_movie(
        db, str(new_entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(new_entry)

    return new_entry


@router.put(
    "/{movie_id}",
    response_model=schemas.MovieResponse,
    summary="Update Movie",
)
async def update_movie(
    movie_id: str,
    data: schemas.MovieUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Movies).filter(models.Movies.system_id == movie_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Movie entry not found.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    if data.watching_status == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.franchise_id, entry.series_id = resolve_movie_parent_hierarchy(
        db,
        entry.franchise_id,
        entry.series_id,
        {
            "en": entry.movie_name_en,
            "cn": entry.movie_name_cn,
            "alt": entry.movie_name_alt,
        },
    )

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)

    await execute_replace_single_movie(
        db, str(entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(entry)

    return entry


@router.patch(
    "/{movie_id}",
    response_model=schemas.MovieResponse,
    summary="Patch Movie",
)
async def patch_movie(
    movie_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Movies).filter(models.Movies.system_id == movie_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Movie entry not found.")

    for key, value in payload.items():
        if hasattr(entry, key):
            setattr(entry, key, value)

    if payload.get("watching_status") == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    return entry


@router.post(
    "/{system_id}/complete",
    response_model=schemas.MovieResponse,
    summary="Mark Movie Entry as Completed",
)
def complete_movie_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a movie entry."""
    entry = (
        db.query(models.Movies)
        .filter(models.Movies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Movie entry not found.")

    mark_movie_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{movie_id}", summary="Delete Movie")
def delete_movie(
    movie_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Movies).filter(models.Movies.system_id == movie_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Movie entry not found.")

    if entry.cover_image_file:
        delete_cover_image(movie_id)
    log_deleted_record(db, entry, "Movie")
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": "Movie entry deleted successfully."}
