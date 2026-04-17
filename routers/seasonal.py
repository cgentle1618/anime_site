"""
routers/seasonal.py
Handles API endpoints for the Seasonal table — listing all seasonal records
and patching the my_rating field for admin users.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_db, get_current_admin
import models
import schemas

from sqlalchemy import text

router = APIRouter(prefix="/api/seasonal", tags=["Seasonal"])


@router.get("/current-season", summary="Get Current Season (Public)")
def get_current_season_public(db: Session = Depends(get_db)):
    """Returns the globally configured current season string from system_configs. Public endpoint."""
    result = db.execute(
        text("SELECT config_value FROM system_configs WHERE config_key = 'current_season'")
    ).fetchone()
    return {"current_season": result[0] if result else None}


@router.get("/", response_model=List[schemas.SeasonalResponse], summary="List All Seasonals")
def list_seasonals(db: Session = Depends(get_db)):
    """Returns all seasonal records ordered by seasonal string descending."""
    return (
        db.query(models.Seasonal)
        .order_by(models.Seasonal.seasonal.desc())
        .all()
    )


@router.get("/{seasonal_id}", response_model=schemas.SeasonalResponse, summary="Get Seasonal by ID")
def get_seasonal(seasonal_id: str, db: Session = Depends(get_db)):
    """Returns a single seasonal record by its string key (e.g. 'WIN 2026')."""
    record = db.query(models.Seasonal).filter(models.Seasonal.seasonal == seasonal_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Seasonal '{seasonal_id}' not found.")
    return record


@router.patch("/{seasonal_id}", response_model=schemas.SeasonalResponse, summary="Update Seasonal Rating")
def update_seasonal(
    seasonal_id: str,
    payload: schemas.SeasonalUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    """Updates the my_rating field of a seasonal record. Admin only."""
    record = db.query(models.Seasonal).filter(models.Seasonal.seasonal == seasonal_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Seasonal '{seasonal_id}' not found.")
    record.my_rating = payload.my_rating
    db.commit()
    db.refresh(record)
    return record
