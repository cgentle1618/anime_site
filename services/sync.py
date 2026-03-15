"""
sync.py
The master orchestrator for Version 2 synchronization.
Enforces PostgreSQL as the Source of Truth while treating Google Sheets as a
Secondary Input (for manually added rows) and a Read-Only Backup (via bulk overwrites).
Strictly aligned with models.py and schemas.py typing.
"""

import uuid
import json
import time
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

# Adjust imports based on your exact file structure
from database import get_taipei_now
import schemas
from models import AnimeEntry, SyncLog
from services.sync_utils import (
    clean_value,
    extract_season_from_title,
    extract_season_from_cn_title,
)
from services.sheets_client import (
    execute_with_retry,
    bulk_overwrite_sheet,
    get_all_rows,
)
import services.jikan_client as jikan_client

# ==========================================
# CONSTANTS: EXACT V2 GOOGLE SHEET HEADERS
# ==========================================
# These 47 headers exactly match the database columns and the studio_results CSV.
# The order here dictates the column order when backing up to Google Sheets.
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

# ==========================================
# HELPER FUNCTIONS
# ==========================================


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
    """Logs the sync results into the database audit trail."""
    new_log = SyncLog(
        timestamp=get_taipei_now(),
        sync_type=sync_type,
        status=status,
        rows_added=added,
        rows_updated=updated,
        rows_deleted=deleted,
        error_message=error,
        details_json=details_json,
    )
    db.add(new_log)
    db.commit()


def _extract_mal_id_from_link(mal_link: str) -> int | None:
    """Helper to safely extract MAL ID if sync_utils lacks it."""
    import re

    if not mal_link:
        return None
    match = re.search(r"myanimelist\.net/anime/(\d+)", str(mal_link))
    return int(match.group(1)) if match else None


def _format_for_sheet(val: any, expected_type: type) -> str:
    """Formats Python/SQLAlchemy types cleanly for Google Sheets."""
    if val is None:
        return ""
    if expected_type == bool:
        return "TRUE" if val else "FALSE"
    if isinstance(val, datetime):
        return val.isoformat() + "Z"
    return str(val)


# ==========================================
# CORE SYNC WORKERS
# ==========================================


def _pull_new_manual_entries(db: Session) -> int:
    """
    Pulls data from Google Sheets.
    If a row has no system_id, it is treated as a new manual entry, parsed, and saved to the DB.
    """
    try:
        data_rows = get_all_rows("Anime")
        if not data_rows:
            return 0

        added_count = 0

        for row_data in data_rows:
            # Only process rows that DO NOT have a system_id (newly added via Google Sheets)
            if (
                not row_data.get("system_id")
                or str(row_data.get("system_id")).strip() == ""
            ):

                # Verify we at least have an English Series Name before adding
                if not row_data.get("series_en"):
                    continue

                # Pydantic validation handles all the messy data coercion instantly
                validated_data = schemas.AnimeSheetSync(**row_data)
                validated_data.system_id = str(uuid.uuid4())

                # Unpack directly into SQLAlchemy model
                new_entry = AnimeEntry(**validated_data.model_dump(exclude_none=True))
                db.add(new_entry)
                added_count += 1

        db.commit()
        return added_count
    except Exception as e:
        print(f"❌ Error pulling manual entries: {e}")
        db.rollback()
        return 0


def _autofill_missing_data(db: Session) -> int:
    """
    Fills in easily calculable missing fields within the database without heavy API calls.
    """
    updated_count = 0
    entries = db.query(AnimeEntry).all()

    for entry in entries:
        changed = False

        # 1. Autofill MAL ID from link if missing
        if not entry.mal_id and entry.mal_link:
            extracted_id = _extract_mal_id_from_link(entry.mal_link)
            if extracted_id:
                entry.mal_id = extracted_id
                changed = True

        # 2. Autofill Series Season from EN Title
        if not entry.series_season and entry.series_season_en:
            season_str = extract_season_from_title(entry.series_season_en)
            if season_str:
                entry.series_season = season_str
                changed = True

        # 3. Autofill Series Season from CN Title fallback
        if not entry.series_season and entry.series_season_cn:
            season_str = extract_season_from_cn_title(entry.series_season_cn)
            if season_str:
                entry.series_season = season_str
                changed = True

        if changed:
            updated_count += 1

    db.commit()
    return updated_count


def _push_db_backup_to_sheets(db: Session) -> dict:
    """
    Fetches all DB records and performs a bulk overwrite on the Google Sheet.
    This establishes the Database as the ultimate source of truth.
    """
    try:
        entries = db.query(AnimeEntry).all()

        # FIXED: Initialize matrix empty; headers are passed separately to bulk_overwrite_sheet
        data_matrix = []

        for entry in entries:
            row = [
                _format_for_sheet(entry.system_id, str),
                _format_for_sheet(entry.series_en, str),
                _format_for_sheet(entry.series_season_en, str),
                _format_for_sheet(entry.series_season_roman, str),
                _format_for_sheet(entry.series_season_cn, str),
                _format_for_sheet(entry.anime_alt_name, str),
                _format_for_sheet(entry.series_season, str),
                _format_for_sheet(entry.airing_type, str),
                _format_for_sheet(entry.my_progress, str),
                _format_for_sheet(entry.airing_status, str),
                _format_for_sheet(entry.ep_total, int),
                _format_for_sheet(entry.ep_fin, int),
                _format_for_sheet(entry.rating_mine, str),
                _format_for_sheet(entry.main_spinoff, str),
                _format_for_sheet(entry.release_month, str),
                _format_for_sheet(entry.release_season, str),
                _format_for_sheet(entry.release_year, str),
                _format_for_sheet(entry.studio, str),
                _format_for_sheet(entry.director, str),
                _format_for_sheet(entry.producer, str),
                _format_for_sheet(entry.music, str),
                _format_for_sheet(entry.distributor_tw, str),
                _format_for_sheet(entry.genre_main, str),
                _format_for_sheet(entry.genre_sub, str),
                _format_for_sheet(entry.prequel, str),
                _format_for_sheet(entry.sequel, str),
                _format_for_sheet(entry.alternative, str),
                _format_for_sheet(entry.watch_order, float),
                _format_for_sheet(entry.watch_order_rec, float),
                _format_for_sheet(entry.remark, str),
                _format_for_sheet(entry.mal_id, int),
                _format_for_sheet(entry.mal_link, str),
                _format_for_sheet(entry.mal_rating, float),
                _format_for_sheet(entry.mal_rank, int),
                _format_for_sheet(entry.anilist_link, str),
                _format_for_sheet(entry.op, str),
                _format_for_sheet(entry.ed, str),
                _format_for_sheet(entry.insert_ost, str),
                _format_for_sheet(entry.seiyuu, str),
                _format_for_sheet(entry.source_baha, bool),
                _format_for_sheet(entry.baha_link, str),
                _format_for_sheet(entry.source_other, str),
                _format_for_sheet(entry.source_other_link, str),
                _format_for_sheet(entry.source_netflix, bool),
                _format_for_sheet(entry.cover_image_file, str),
                _format_for_sheet(entry.created_at, datetime),
                _format_for_sheet(entry.updated_at, datetime),
            ]
            data_matrix.append(row)

        # FIXED: Pass ANIME_HEADERS as the correct 2nd argument
        success = bulk_overwrite_sheet("Anime", ANIME_HEADERS, data_matrix)
        return {"success": success, "rows": len(entries)}

    except Exception as e:
        print(f"❌ Error building backup matrix: {e}")
        return {"success": False, "rows": 0}


# ==========================================
# PUBLIC ORCHESTRATION ENDPOINTS
# ==========================================


def basic_sync(db: Session) -> dict:
    """
    Executes the standard daily sync:
    1. Pulls new manual entries from Google Sheets into DB.
    2. Autofills missing localized data.
    3. Overwrites the Google Sheet with the newly structured DB.
    """
    print("▶️ [Basic Sync] Starting...")
    try:
        added_count = _pull_new_manual_entries(db)
        print(f"   ↳ Added {added_count} new entries from Sheets.")

        updated_count = _autofill_missing_data(db)
        print(f"   ↳ Autofilled {updated_count} empty fields.")

        push_metrics = _push_db_backup_to_sheets(db)
        print(f"   ↳ Pushed {push_metrics['rows']} rows back to Sheets.")

        success = push_metrics["success"]
        status = "success" if success else "failed"

        details = {
            "type": "basic_sync",
            "added_from_sheets": added_count,
            "autofilled_in_db": updated_count,
            "sheets_backup_success": success,
        }

        log_sync_event(
            db,
            sync_type="basic_sync",
            status=status,
            added=added_count,
            updated=updated_count,
            error=None if success else "Backup push failed",
            details_json=json.dumps(details),
        )

        return {
            "status": status,
            "message": f"Basic sync completed. Added: {added_count}, Autofilled: {updated_count}",
        }

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"❌ [Basic Sync] Failed: {error_msg}")
        log_sync_event(db, "basic_sync", "failed", error=error_msg)
        return {"status": "failed", "message": error_msg}


def strong_sync(db: Session) -> dict:
    """
    Executes a heavy sync:
    Contacts Jikan API to fetch and update live stats (Scores, Ranks, Status)
    for all anime in the DB that have a mal_id, then backs up to Google Sheets.
    """
    print("▶️ [Strong Sync] Starting...")
    try:
        entries = db.query(AnimeEntry).filter(AnimeEntry.mal_id.isnot(None)).all()
        updated_count = 0

        for entry in entries:
            try:
                # Jikan API integration
                jikan_data = jikan_client.fetch_anime_details(entry.mal_id)
                if jikan_data:
                    changed = False

                    # Update Rating
                    new_score = clean_value(jikan_data.get("score"), float)
                    if new_score and entry.mal_rating != new_score:
                        entry.mal_rating = new_score
                        changed = True

                    # Update Rank
                    new_rank = clean_value(jikan_data.get("rank"), int)
                    if new_rank and entry.mal_rank != new_rank:
                        entry.mal_rank = new_rank
                        changed = True

                    # Update Airing Status
                    jikan_status = jikan_data.get("status")
                    if jikan_status and entry.airing_status != jikan_status:
                        entry.airing_status = jikan_status
                        changed = True

                    if changed:
                        updated_count += 1

                # Strict Rate Limiting (1.2s per request to avoid Jikan 429 Bans)
                time.sleep(1.2)

            except Exception as e:
                print(f"⚠️ [Strong Sync] Jikan Error for {entry.system_id}: {e}")

        db.commit()

        # Push the freshly updated stats to the cloud sheet
        push_metrics = _push_db_backup_to_sheets(db)
        success = push_metrics["success"]

        status = "success" if success else "failed"
        details = {
            "type": "strong_sync",
            "jikan_updates": updated_count,
            "sheets_backup_success": success,
        }

        log_sync_event(
            db,
            sync_type="strong_sync",
            status=status,
            updated=updated_count,
            error=None if success else "Backup push failed",
            details_json=json.dumps(details),
        )

        return {
            "status": status,
            "message": f"Strong sync completed. Updated {updated_count} entries from Jikan.",
        }

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"❌ [Strong Sync] Failed: {error_msg}")
        log_sync_event(db, "strong_sync", "failed", error=error_msg)
        return {"status": "failed", "message": error_msg}
