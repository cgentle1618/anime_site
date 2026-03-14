"""
services/sync.py
The master orchestrator for Version 2 synchronization.
Enforces PostgreSQL as the Source of Truth while treating Google Sheets as a
Secondary Input (for new rows) and a Read-Only Backup (via bulk overwrites).
"""

import uuid
import json
import time
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from database import cleanup_old_logs
from models import AnimeEntry, SyncLog, SystemOption

from services.sync_utils import (
    clean_value,
    extract_mal_id,
    extract_season_from_title,
    extract_season_from_cn_title,
)
from services.sheets_client import get_all_rows, bulk_overwrite_sheet
import services.jikan_client as jikan_client

# Define the exact V2 column headers expected in the Google Sheet
ANIME_HEADERS = [
    "system_id",
    "series_en",
    "series_season_en",
    "series_season_roman",
    "series_season_cn",
    "anime_alt_name",
    "airing_type",
    "my_progress",
    "airing_status",
    "ep_total",
    "ep_fin",
    "rating_mine",
    "main_spinoff",
    "release_year",
    "release_month",
    "release_season",
    "release_date",
    "mal_id",
    "mal_rating",
    "remark",
    "op",
    "ed",
    "insert_ost",
    "seiyuu",
    "source_baha",
    "baha_link",
    "source_netflix",
    "source_other",
    "source_other_link",
    "cover_image_file",
]


def log_sync_event(
    db: Session,
    sync_type: str,
    status: str,
    added: int = 0,
    updated: int = 0,
    deleted: int = 0,
    error: str = None,
    details_json: str = None,
):
    """Utility to record a synchronization event in the database logs."""
    log = SyncLog(
        sync_type=sync_type,
        status=status,
        rows_added=added,  # Fixed from items_added
        rows_updated=updated,  # Fixed from items_updated
        rows_deleted=deleted,  # Fixed from items_deleted
        error_message=error,
        details_json=details_json,
    )
    db.add(log)
    db.commit()


def run_v2_basic_sync(db: Session):
    """
    Performs the basic sync:
    1. Fetches rows from Google Sheets.
    2. Identifies 'new' entries (no system_id).
    3. Updates 'existing' entries (match by system_id).
    4. Performs a bulk backup to Google Sheets to ensure headers/IDs are synced.
    """
    added_count = 0
    updated_count = 0
    error_msg = None

    try:
        print("▶️ [Basic Sync] Fetching data from Google Sheets...")
        rows = get_all_rows()

        for row in rows:
            sys_id = row.get("system_id")

            # 1. ADD NEW ENTRIES
            if not sys_id or str(sys_id).strip() == "":
                new_id = str(uuid.uuid4())
                new_entry = AnimeEntry(
                    system_id=new_id,
                    series_en=clean_value(row.get("series_en"), str),
                    series_season_en=clean_value(row.get("series_season_en"), str),
                    series_season_roman=clean_value(
                        row.get("series_season_roman"), str
                    ),
                    series_season_cn=clean_value(row.get("series_season_cn"), str),
                    anime_alt_name=clean_value(row.get("anime_alt_name"), str),
                    airing_type=clean_value(row.get("airing_type"), str),
                    my_progress=clean_value(row.get("my_progress"), str),
                    airing_status=clean_value(row.get("airing_status"), str),
                    ep_total=clean_value(row.get("ep_total"), int),
                    ep_fin=clean_value(row.get("ep_fin"), int),
                    rating_mine=clean_value(row.get("rating_mine"), float),
                    main_spinoff=clean_value(row.get("main_spinoff"), str),
                    release_year=clean_value(row.get("release_year"), int),
                    release_month=clean_value(row.get("release_month"), int),
                    release_season=clean_value(row.get("release_season"), str),
                    release_date=clean_value(row.get("release_date"), str),
                    mal_id=clean_value(row.get("mal_id"), int),
                    mal_rating=clean_value(row.get("mal_rating"), float),
                    remark=clean_value(row.get("remark"), str),
                    op=clean_value(row.get("op"), str),
                    ed=clean_value(row.get("ed"), str),
                    insert_ost=clean_value(row.get("insert_ost"), str),
                    seiyuu=clean_value(row.get("seiyuu"), str),
                    source_baha=clean_value(row.get("source_baha"), str),
                    baha_link=clean_value(row.get("baha_link"), str),
                    source_netflix=clean_value(row.get("source_netflix"), bool),
                    source_other=clean_value(row.get("source_other"), str),
                    source_other_link=clean_value(row.get("source_other_link"), str),
                    cover_image_file=clean_value(row.get("cover_image_file"), str),
                )
                db.add(new_entry)
                added_count += 1

            # 2. UPDATE EXISTING ENTRIES
            else:
                existing = db.query(AnimeEntry).filter_by(system_id=sys_id).first()
                if existing:
                    existing.series_en = clean_value(row.get("series_en"), str)
                    existing.series_season_en = clean_value(
                        row.get("series_season_en"), str
                    )
                    existing.series_season_roman = clean_value(
                        row.get("series_season_roman"), str
                    )
                    existing.series_season_cn = clean_value(
                        row.get("series_season_cn"), str
                    )
                    existing.anime_alt_name = clean_value(
                        row.get("anime_alt_name"), str
                    )
                    existing.airing_type = clean_value(row.get("airing_type"), str)
                    existing.my_progress = clean_value(row.get("my_progress"), str)
                    existing.airing_status = clean_value(row.get("airing_status"), str)
                    existing.ep_total = clean_value(row.get("ep_total"), int)
                    existing.ep_fin = clean_value(row.get("ep_fin"), int)
                    existing.rating_mine = clean_value(row.get("rating_mine"), float)
                    existing.main_spinoff = clean_value(row.get("main_spinoff"), str)
                    existing.release_year = clean_value(row.get("release_year"), int)
                    existing.release_month = clean_value(row.get("release_month"), int)
                    existing.release_season = clean_value(
                        row.get("release_season"), str
                    )
                    existing.release_date = clean_value(row.get("release_date"), str)
                    existing.mal_id = clean_value(row.get("mal_id"), int)
                    existing.mal_rating = clean_value(row.get("mal_rating"), float)
                    existing.remark = clean_value(row.get("remark"), str)
                    existing.op = clean_value(row.get("op"), str)
                    existing.ed = clean_value(row.get("ed"), str)
                    existing.insert_ost = clean_value(row.get("insert_ost"), str)
                    existing.seiyuu = clean_value(row.get("seiyuu"), str)
                    existing.source_baha = clean_value(row.get("source_baha"), str)
                    existing.baha_link = clean_value(row.get("baha_link"), str)
                    existing.source_netflix = clean_value(
                        row.get("source_netflix"), bool
                    )
                    existing.source_other = clean_value(row.get("source_other"), str)
                    existing.source_other_link = clean_value(
                        row.get("source_other_link"), str
                    )
                    existing.cover_image_file = clean_value(
                        row.get("cover_image_file"), str
                    )
                    updated_count += 1

        db.commit()

        # 3. OVERWRITE GOOGLE SHEETS AS BACKUP
        print("▶️ [Basic Sync] Overwriting Google Sheets for backup...")
        push_metrics = _push_db_backup_to_sheets(db)
        if not push_metrics["success"]:
            error_msg = "Failed to overwrite Google Sheets backup."

        status = "failed" if error_msg else "success"
        log_sync_event(
            db,
            sync_type="v2_basic_sync",
            status=status,
            added=added_count,
            updated=updated_count,
            error=error_msg,
        )

        return {
            "status": status,
            "message": (
                "Basic Sync completed successfully." if not error_msg else error_msg
            ),
            "added": added_count,
            "updated": updated_count,
        }

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"❌ [Basic Sync] FATAL ERROR: {error_msg}")
        log_sync_event(db, sync_type="v2_basic_sync", status="failed", error=error_msg)
        return {"status": "failed", "message": error_msg}


def run_v2_strong_sync(db: Session):
    """
    Performs the 'Strong' sync:
    1. Iterates through all DB entries that have a MAL ID but NO MAL Rating.
    2. Fetches metadata from the Jikan (MyAnimeList) API.
    3. Updates ratings and metadata in the DB.
    4. Backs up the new data to Google Sheets.
    """
    updated_count = 0
    error_msg = None

    try:
        print("▶️ [Strong Sync] Identifying items missing MAL ratings...")
        # Target entries with a MAL ID but zero/missing rating to save API calls
        targets = (
            db.query(AnimeEntry)
            .filter(
                and_(
                    AnimeEntry.mal_id != None,
                    or_(AnimeEntry.mal_rating == 0, AnimeEntry.mal_rating == None),
                )
            )
            .all()
        )

        for anime in targets:
            try:
                j_data = jikan_client.get_anime_by_id(anime.mal_id)
                if j_data:
                    anime.mal_rating = j_data.get("score")
                    # Optionally update other fields like status if empty
                    if not anime.airing_status:
                        anime.airing_status = j_data.get("status")
                    updated_count += 1
                    time.sleep(1.2)  # Rate limiting to respect Jikan API limits
            except Exception as e:
                print(f"⚠️ [Strong Sync] Error fetching data for {anime.system_id}: {e}")

        db.commit()

        print("▶️ [Strong Sync] Backing up updated stats to Google Sheets...")
        push_metrics = _push_db_backup_to_sheets(db)
        if not push_metrics["success"]:
            error_msg = "Failed to backup Strong Sync results to Sheets."

        status = "failed" if error_msg else "success"
        details = {
            "type": "strong_sync",
            "items_updated_from_jikan": updated_count,
            "sheets_backup": push_metrics["success"],
        }
        log_sync_event(
            db,
            sync_type="v2_strong_sync",
            status=status,
            updated=updated_count,
            error=error_msg,
            details_json=json.dumps(details),
        )

        return {
            "status": status,
            "message": (
                "Strong Sync completed successfully." if not error_msg else error_msg
            ),
            "jikan_updated": updated_count,
        }

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"❌ [Strong Sync] FATAL ERROR: {error_msg}")
        log_sync_event(db, sync_type="v2_strong_sync", status="failed", error=error_msg)
        return {"status": "failed", "message": error_msg}


def _push_db_backup_to_sheets(db: Session):
    """Helper to convert the current PostgreSQL state into a nested list for Google Sheets overwrite."""
    try:
        entries = db.query(AnimeEntry).all()
        data_to_push = []

        for e in entries:
            row = []
            # We must map attributes to the EXACT order of ANIME_HEADERS
            for header in ANIME_HEADERS:
                val = getattr(e, header, "")
                # Convert booleans to strings for Sheets readability
                if isinstance(val, bool):
                    val = str(val)
                row.append(val)
            data_to_push.append(row)

        success = bulk_overwrite_sheet(data_to_push)
        return {"success": success}
    except Exception as e:
        print(f"⚠️ [Sheets Backup] Backup failed: {e}")
        return {"success": False}
