"""
sync.py
The master orchestrator for Version 2 synchronization.
Refactored for self-sufficient background sessions and calculation pipelines.
"""

import uuid
import time
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

# Adjust imports based on your exact file structure
from models import AnimeEntry, AnimeSeries, SystemOption
from database import SessionLocal  # For independent background sessions
import schemas

# Import all utilities for the calculation pipeline
from services.sync_utils import (
    format_for_sheet,
    extract_mal_id,
    extract_season_from_title,
    extract_season_from_cn_title,
)
from services.sheets_client import bulk_overwrite_sheet, get_all_rows
import services.jikan_client as jikan_client
from services.image_manager import download_cover_image

# ==========================================
# CONSTANTS: EXACT V2 GOOGLE SHEET HEADERS
# ==========================================
ANIME_HEADERS = [
    "system_id",
    "series_en",
    "series_season_en",
    "series_season_roman",
    "series_season_cn",
    "anime_alt_name",
    "series_season",
    "airing_type",
    "my_progress",
    "airing_status",
    "ep_total",
    "ep_fin",
    "rating_mine",
    "main_spinoff",
    "release_month",
    "release_season",
    "release_year",
    "studio",
    "director",
    "producer",
    "music",
    "distributor_tw",
    "genre_main",
    "genre_sub",
    "prequel",
    "sequel",
    "alternative",
    "watch_order",
    "watch_order_rec",
    "remark",
    "mal_id",
    "mal_link",
    "mal_rating",
    "mal_rank",
    "anilist_link",
    "op",
    "ed",
    "insert_ost",
    "seiyuu",
    "source_baha",
    "baha_link",
    "source_other",
    "source_other_link",
    "source_netflix",
    "cover_image_file",
    "created_at",
    "updated_at",
]

SERIES_HEADERS = [
    "system_id",
    "series_en",
    "series_roman",
    "series_cn",
    "rating_series",
    "series_alt_name",
    "series_expectation",
    "favorite_3x3_slot",
    "created_at",
    "updated_at",
]

OPTIONS_HEADERS = ["id", "category", "option_value"]


# ==========================================
# CALCULATION PIPELINES
# ==========================================


def _run_calculations(db: Session) -> int:
    """
    Centralized data cleaning and auto-fill pipeline.
    Runs before Backup, Fill, and Replace operations.
    """
    updated_count = 0
    entries = db.query(AnimeEntry).all()

    for entry in entries:
        changed = False

        # --- PART 1: DATA CLEANING ---

        # 1a. Trim whitespace and convert empty strings to None universally
        for key, value in vars(entry).items():
            if key.startswith("_"):
                continue  # Skip SQLAlchemy internal state variables
            if isinstance(value, str):
                stripped = value.strip()
                if stripped == "":
                    setattr(entry, key, None)
                    changed = True
                elif stripped != value:
                    setattr(entry, key, stripped)
                    changed = True

        # 1b. Enforce Strict Episode Logic
        if entry.ep_fin is not None and entry.ep_fin < 0:
            entry.ep_fin = 0
            changed = True

        if entry.ep_total and entry.ep_fin and entry.ep_fin > entry.ep_total:
            entry.ep_fin = entry.ep_total
            changed = True

        if (
            entry.my_progress == "Completed"
            and entry.ep_total
            and entry.ep_fin != entry.ep_total
        ):
            entry.ep_fin = entry.ep_total
            changed = True

        # --- PART 2: AUTO-FILL MISSING DATA ---

        # 2a. Auto-fill missing System ID
        if not entry.system_id:
            entry.system_id = str(uuid.uuid4())
            changed = True

        # 2b. Auto-extract missing MAL ID from Link
        if not entry.mal_id and entry.mal_link:
            extracted_id = extract_mal_id(entry.mal_link)
            if extracted_id:
                entry.mal_id = extracted_id
                changed = True

        # 2c. Auto-calculate missing Season String
        if not entry.series_season:
            calculated_season = None
            if entry.series_season_en:
                calculated_season = extract_season_from_title(entry.series_season_en)
            elif entry.series_season_cn:
                calculated_season = extract_season_from_cn_title(entry.series_season_cn)

            if calculated_season:
                entry.series_season = calculated_season
                changed = True

        # Track updates
        if changed:
            updated_count += 1

    if updated_count > 0:
        db.commit()

    return updated_count


# ==========================================
# SELF-SUFFICIENT BACKUP WORKERS
# ==========================================


def _push_db_backup_to_sheets():
    """Independent background worker for Anime backup."""
    with SessionLocal() as db:
        try:
            entries = db.query(AnimeEntry).all()
            data_matrix = []
            for entry in entries:
                row = [
                    format_for_sheet(getattr(entry, h, None), str)
                    for h in ANIME_HEADERS
                ]
                row[45] = format_for_sheet(entry.created_at, datetime)
                row[46] = format_for_sheet(entry.updated_at, datetime)
                data_matrix.append(row)
            success = bulk_overwrite_sheet("Anime", ANIME_HEADERS, data_matrix)
            return {"success": success, "rows": len(entries)}
        except Exception as e:
            print(f"❌ Background Anime backup failed: {e}")
            return {"success": False, "rows": 0}


def _push_series_backup_to_sheets():
    """Independent background worker for Series backup."""
    with SessionLocal() as db:
        try:
            series_list = db.query(AnimeSeries).all()
            data_matrix = []
            for s in series_list:
                row = [
                    format_for_sheet(getattr(s, h, None), str) for h in SERIES_HEADERS
                ]
                row[8] = format_for_sheet(s.created_at, datetime)
                row[9] = format_for_sheet(s.updated_at, datetime)
                data_matrix.append(row)
            success = bulk_overwrite_sheet("Anime Series", SERIES_HEADERS, data_matrix)
            return {"success": success, "rows": len(series_list)}
        except Exception as e:
            print(f"❌ Background Series backup failed: {e}")
            return {"success": False, "rows": 0}


def _push_options_backup_to_sheets():
    """Independent background worker for Options backup."""
    with SessionLocal() as db:
        try:
            options = db.query(SystemOption).order_by(SystemOption.category).all()
            data_matrix = []
            for opt in options:
                row = [str(opt.id), opt.category, opt.option_value]
                data_matrix.append(row)
            success = bulk_overwrite_sheet("Options", OPTIONS_HEADERS, data_matrix)
            return {"success": success, "rows": len(options)}
        except Exception as e:
            print(f"❌ Background Options backup failed: {e}")
            return {"success": False, "rows": 0}


def _run_full_backup():
    """Executes all three backup routines independently."""
    _push_db_backup_to_sheets()
    _push_series_backup_to_sheets()
    _push_options_backup_to_sheets()


# ==========================================
# PUBLIC ORCHESTRATION ENDPOINTS
# ==========================================


def action_backup(db: Session) -> dict:
    print("▶️ [Action: Backup] Starting...")
    try:
        _run_calculations(db)
        _run_full_backup()
        return {"status": "success", "message": "Full backup triggered."}
    except Exception as e:
        return {"status": "failed", "message": str(e)}


def action_sync_from_sheets(db: Session) -> dict:
    print("▶️ [Action: Sync from Sheets] Starting...")
    try:
        # Note: We do NOT run calculations here by instruction.
        # Sheets sync assumes raw pull. Calculations happen on subsequent backup/fills.
        data_rows = get_all_rows("Anime")
        added_count = 0
        if data_rows:
            for row in data_rows:
                if not row.get("system_id"):
                    new_entry = AnimeEntry(
                        **schemas.AnimeSheetSync(**row).model_dump(exclude_none=True)
                    )
                    new_entry.system_id = str(uuid.uuid4())
                    db.add(new_entry)
                    added_count += 1
            db.commit()
        _run_full_backup()
        return {"status": "success", "message": f"Sync done. Added {added_count}."}
    except Exception as e:
        db.rollback()
        return {"status": "failed", "message": str(e)}


def action_fill(db: Session, limit: int = 5) -> dict:
    _run_calculations(db)
    query = db.query(AnimeEntry).filter(
        AnimeEntry.mal_id.isnot(None),
        or_(AnimeEntry.cover_image_file == None, AnimeEntry.cover_image_file == ""),
    )
    total_missing = query.count()
    if total_missing == 0:
        _run_full_backup()
        return {"status": "success", "remaining": 0, "processed": 0}

    entries = query.limit(limit).all()
    for entry in entries:
        try:
            jikan_data = jikan_client.fetch_anime_details(entry.mal_id)
            if jikan_data:
                images = jikan_data.get("images", {}).get("jpg", {})
                url = images.get("large_image_url") or images.get("image_url")
                if url:
                    path = download_cover_image(url, entry.system_id)
                    if path:
                        entry.cover_image_file = path
            time.sleep(1.2)
        except:
            pass
    db.commit()
    _run_full_backup()
    return {"status": "success", "remaining": query.count(), "processed": len(entries)}


def action_replace(db: Session, limit: int = 5, offset: int = 0) -> dict:
    """
    Overwrites ALL ratings/ranks for entries with a mal_id, and fills missing covers.
    Uses 'offset' to prevent infinite loops during chunked processing.
    """
    _run_calculations(db)

    query = (
        db.query(AnimeEntry)
        .filter(AnimeEntry.mal_id.isnot(None))
        .order_by(AnimeEntry.system_id)
    )
    total_valid = query.count()

    if offset >= total_valid:
        _run_full_backup()
        return {"status": "success", "remaining": 0, "processed": 0}

    entries = query.offset(offset).limit(limit).all()

    for entry in entries:
        try:
            jikan_data = jikan_client.fetch_anime_details(entry.mal_id)
            if jikan_data:
                entry.mal_rating = jikan_data.get("score")
                entry.mal_rank = jikan_data.get("rank")

                if not entry.cover_image_file:
                    images = jikan_data.get("images", {}).get("jpg", {})
                    url = images.get("large_image_url") or images.get("image_url")
                    if url:
                        path = download_cover_image(url, entry.system_id)
                        if path:
                            entry.cover_image_file = path

                entry.updated_at = datetime.utcnow()
            time.sleep(1.2)
        except Exception as e:
            print(f"⚠️ [Replace] Jikan Error for {entry.system_id}: {e}")

    db.commit()
    _run_full_backup()

    remaining = max(0, total_valid - (offset + limit))

    return {"status": "success", "remaining": remaining, "processed": len(entries)}
