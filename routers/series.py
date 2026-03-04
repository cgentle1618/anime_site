"""
routers/series.py
Handles API endpoints related to Series Hubs (Franchises).
Manages franchise-level metadata and overall ratings.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from dependencies import get_db

# Initialize the router with a standard prefix
router = APIRouter(prefix="/api/series", tags=["Franchise Hubs"])

# ==========================================
# READ OPERATIONS
# ==========================================


@router.get(
    "/", response_model=List[schemas.AnimeSeriesResponse], summary="Get All Series"
)
def get_all_series(db: Session = Depends(get_db)):
    """Retrieves all high-level Series Hubs (Franchises) from the database."""
    return db.query(models.AnimeSeries).all()


@router.get(
    "/details/{system_id:path}",
    response_model=schemas.AnimeSeriesResponse,
    summary="Smart Series Lookup",
)
def get_series_details_by_id(system_id: str, db: Session = Depends(get_db)):
    """
    A smart lookup endpoint that resolves series info using three fallback levels:
    1. Exact System ID match.
    2. Case-insensitive Series English Name match.
    3. Auto-resolving the parent series using an Anime Entry's System ID.
    """
    # Level 1: Standard ID lookup (Direct match)
    series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if series:
        return series

    # Level 2: Name-based lookup (Fallback for direct URL typing or semantic links)
    clean_query = str(system_id).strip().lower()
    all_series = db.query(models.AnimeSeries).all()
    for s in all_series:
        if s.series_en and str(s.series_en).strip().lower() == clean_query:
            return s

    # Level 3: Cross-reference lookup (User passed an Anime ID instead of a Series ID)
    anime = (
        db.query(models.AnimeEntry)
        .filter(models.AnimeEntry.system_id == system_id)
        .first()
    )
    if anime and anime.series_en:
        parent_name = str(anime.series_en).strip().lower()
        for s in all_series:
            if s.series_en and str(s.series_en).strip().lower() == parent_name:
                return s

    # If all fallbacks fail, the series doesn't exist
    raise HTTPException(status_code=404, detail="Franchise Hub not found.")


# ==========================================
# UPDATE OPERATIONS
# ==========================================


@router.patch("/{system_id}", summary="Update Series Overall Rating")
def update_series_state(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    """
    Updates series-level metadata. Currently primarily used for
    updating the 'Overall Franchise Rating' from the frontend UI.
    """
    series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.system_id == system_id)
        .first()
    )
    if not series:
        raise HTTPException(status_code=404, detail="Series Hub not found.")

    # Process and sanitize the incoming payload
    if "rating_series" in payload:
        val = payload["rating_series"]
        # Convert JS 'null' strings to true Python None
        series.rating_series = None if val == "null" else val

    db.commit()
    return {"status": "success"}
