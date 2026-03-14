"""
routers/admin.py
Handles administrative operations including manual data entry,
synchronization triggers, and system maintenance.
Optimized for V2 (PostgreSQL as Source of Truth).
"""

import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from services.sync import basic_sync, strong_sync, _push_db_backup_to_sheets
from services.sync_utils import extract_season_from_title, extract_season_from_cn_title
from dependencies import get_db, get_current_admin

# Apply the security dependency globally to all endpoints in this router
router = APIRouter(
    prefix="/api/admin",
    tags=["System Administration"],
    dependencies=[Depends(get_current_admin)],
)

# ==========================================
# DATA ENTRY & CRUD OPERATIONS
# ==========================================


@router.post("/add", summary="Add New Anime Entry")
def add_anime(payload: schemas.AnimeEntryCreate, db: Session = Depends(get_db)):
    """
    Appends a new anime entry strictly to the PostgreSQL database (Source of Truth).
    If the Series Hub doesn't exist (based on series_en), it creates a basic one.
    Finally, it triggers a bulk push to Google Sheets to update the backup.
    """

    # 1. Check if the parent Series Hub exists. If not, create a basic shell.
    existing_series = (
        db.query(models.AnimeSeries)
        .filter(models.AnimeSeries.series_en == payload.series_en)
        .first()
    )

    if not existing_series:
        new_series = models.AnimeSeries(
            system_id=str(uuid.uuid4()),
            series_en=payload.series_en,
            series_roman=payload.series_season_roman,  # Fallback
            series_cn=payload.series_season_cn,  # Fallback
            series_alt_name=payload.series_alt_name,
        )
        db.add(new_series)
        db.flush()  # Flush to get the series into the session before adding the entry

    # 2. Auto-calculate season if missing
    calculated_season = payload.series_season
    if not calculated_season:
        if payload.series_season_en:
            calculated_season = extract_season_from_title(payload.series_season_en)
        elif payload.series_season_cn:
            calculated_season = extract_season_from_cn_title(payload.series_season_cn)

    # 3. Create the Database Entry
    new_entry = models.AnimeEntry(
        system_id=str(uuid.uuid4()),
        series_en=payload.series_en,
        # Title Information
        series_season_en=payload.series_season_en,
        series_season_roman=payload.series_season_roman,
        series_season_cn=payload.series_season_cn,
        anime_alt_name=payload.anime_alt_name,
        # Format & Status
        series_season=calculated_season,
        airing_type=payload.airing_type,
        my_progress=payload.my_progress,
        airing_status=payload.airing_status,
        # Progress
        ep_total=payload.ep_total,
        ep_fin=payload.ep_fin,
        rating_mine=payload.rating_mine,
        main_spinoff=payload.main_spinoff,
        # Release Information
        release_month=payload.release_month,
        release_season=payload.release_season,
        release_year=payload.release_year,
        # Staff & Production
        studio=payload.studio,
        director=payload.director,
        producer=payload.producer,
        music=payload.music,
        distributor_tw=payload.distributor_tw,
        # Metadata & Themes
        genre_main=payload.genre_main,
        genre_sub=payload.genre_sub,
        prequel=payload.prequel,
        sequel=payload.sequel,
        alternative=payload.alternative,
        # Timeline
        watch_order=payload.watch_order,
        watch_order_rec=payload.watch_order_rec,
        remark=payload.remark,
        # External Stats
        mal_id=payload.mal_id,
        mal_link=payload.mal_link,
        mal_rating=payload.mal_rating,
        mal_rank=payload.mal_rank,
        anilist_link=payload.anilist_link,
        # Music & Cast
        op=payload.op,
        ed=payload.ed,
        insert_ost=payload.insert_ost,
        seiyuu=payload.seiyuu,
        # Streaming & Assets
        source_baha=payload.source_baha,
        baha_link=payload.baha_link,
        source_other=payload.source_other,
        source_other_link=payload.source_other_link,
        source_netflix=payload.source_netflix,
        cover_image_file=payload.cover_image_file,
    )

    db.add(new_entry)
    db.commit()

    # 4. Push Backup to Google Sheets
    print(f"▶️ Admin added entry for {new_entry.series_en}. Pushing backup to Sheets...")
    _push_db_backup_to_sheets(db)

    return {
        "message": "Entry added successfully and backed up to Sheets.",
        "system_id": new_entry.system_id,
    }


# ==========================================
# SYNCHRONIZATION TRIGGERS
# ==========================================


@router.post("/sync/basic", summary="Trigger Basic Sync")
def trigger_basic_sync(db: Session = Depends(get_db)):
    """
    Manually triggers the basic sync workflow.
    Pulls manual additions from Google Sheets, autofills DB, and pushes backup.
    """
    print("🔔 Admin requested Basic Sync.")
    result = basic_sync(db)

    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


@router.post("/sync/strong", summary="Trigger Strong Sync")
def trigger_strong_sync(db: Session = Depends(get_db)):
    """
    Manually triggers the strong sync workflow.
    Calls Jikan API for all relevant entries to update scores and status.
    """
    print("🔔 Admin requested Strong Sync.")
    result = strong_sync(db)

    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


# ==========================================
# SYSTEM MAINTENANCE (LOGS)
# ==========================================


@router.get(
    "/logs", response_model=List[schemas.SyncLogResponse], summary="Get Admin Sync Logs"
)
def get_admin_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Retrieves recent synchronization logs for the admin dashboard."""
    return (
        db.query(models.SyncLog)
        .order_by(models.SyncLog.timestamp.desc())
        .limit(limit)
        .all()
    )


@router.get("/deletions", summary="Get Recent Deletions")
def get_recent_deletions(limit: int = 50, db: Session = Depends(get_db)):
    """Retrieves a history of recently deleted anime entries."""
    return (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.deleted_at.desc())
        .limit(limit)
        .all()
    )
