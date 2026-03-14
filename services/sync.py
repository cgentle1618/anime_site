"""
sync.py
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
from models import AnimeEntry, AnimeSeries, SyncLog, SystemOption

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
    "studio",
    "source_baha",
    "source_netflix",
    "source_other",
    "source_other_link",
    "watch_order",
    "watch_order_rec",
    "genre_main",
    "genre_sub",
    "insert_ost",
    "seiyuu",
    "remark",
    "mal_id",
    "mal_url",
    "mal_rating",
    "mal_rank",
    "cover_image_file",
    "cover_image_url",
    "jikan_last_updated",
]

SERIES_HEADERS = [
    "system_id",
    "series_en",
    "series_cn",
    "series_roman",
    "series_alt_name",
    "series_expectation",
    "favorite_3x3_slot",
    "rating_series",
]

# V2 Addition: Keep System Options backed up in Google Sheets
OPTIONS_HEADERS = ["id", "category", "value"]


def log_sync_event(
    db: Session,
    sync_type: str,
    status: str,
    updated: int = 0,
    error: str = None,
    details_json: str = None,
):
    log = SyncLog(
        sync_type=sync_type,
        status=status,
        items_updated=updated,
        error_message=error,
        details=details_json,
    )
    db.add(log)
    db.commit()


def _push_db_backup_to_sheets(db: Session) -> dict:
    """
    Overwrites the Google Sheets entirely with the current state of the PostgreSQL database.
    This enforces the database as the ultimate Source of Truth.
    """
    try:
        # 1. Push Anime Entries
        anime_entries = db.query(AnimeEntry).all()
        anime_data = []
        for a in anime_entries:
            row = []
            for h in ANIME_HEADERS:
                val = getattr(a, h, "")
                if val is None:
                    val = ""
                row.append(str(val))
            anime_data.append(row)
        bulk_overwrite_sheet("Anime", ANIME_HEADERS, anime_data)

        # 2. Push Series Hubs
        series_entries = db.query(AnimeSeries).all()
        series_data = []
        for s in series_entries:
            row = []
            for h in SERIES_HEADERS:
                val = getattr(s, h, "")
                if val is None:
                    val = ""
                row.append(str(val))
            series_data.append(row)
        bulk_overwrite_sheet("Series", SERIES_HEADERS, series_data)

        # 3. Push System Options (V2 Fix: Options matrix syncing)
        options_entries = db.query(SystemOption).all()
        options_data = []
        for o in options_entries:
            row = []
            for h in OPTIONS_HEADERS:
                val = getattr(o, h, "")
                if val is None:
                    val = ""
                row.append(str(val))
            options_data.append(row)

        # NOTE: Make sure you have a sheet named "System_Options" created in your Google Sheet!
        bulk_overwrite_sheet("System_Options", OPTIONS_HEADERS, options_data)

        return {"success": True, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _pull_new_manual_entries(db: Session) -> int:
    """
    Scans Google Sheets for ANY rows missing a system_id.
    These are assumed to be "manual additions" by the user directly in Sheets.
    Pulls them into the DB and generates a new system_id.
    """
    added_count = 0
    try:
        anime_sheet_rows = get_all_rows("Anime")
        series_sheet_rows = get_all_rows("Series")

        # Handle Manual Series Additions
        for row in series_sheet_rows:
            if not row.get("system_id") or str(row.get("system_id")).strip() == "":
                new_sys_id = f"SER-{uuid.uuid4().hex[:8].upper()}"
                new_series = AnimeSeries(
                    system_id=new_sys_id,
                    series_en=clean_value(row.get("series_en")),
                    series_cn=clean_value(row.get("series_cn")),
                    series_roman=clean_value(row.get("series_roman")),
                    series_alt_name=clean_value(row.get("series_alt_name")),
                    series_expectation=clean_value(row.get("series_expectation")),
                    favorite_3x3_slot=clean_value(row.get("favorite_3x3_slot"), int),
                    rating_series=clean_value(row.get("rating_series")),
                )
                db.add(new_series)
                added_count += 1

        # Handle Manual Anime Additions
        for row in anime_sheet_rows:
            if not row.get("system_id") or str(row.get("system_id")).strip() == "":
                new_sys_id = f"ANI-{uuid.uuid4().hex[:8].upper()}"
                new_anime = AnimeEntry(
                    system_id=new_sys_id,
                    series_en=clean_value(row.get("series_en")),
                    series_season_en=clean_value(row.get("series_season_en")),
                    series_season_roman=clean_value(row.get("series_season_roman")),
                    series_season_cn=clean_value(row.get("series_season_cn")),
                    anime_alt_name=clean_value(row.get("anime_alt_name")),
                    airing_type=clean_value(row.get("airing_type")),
                    my_progress=clean_value(row.get("my_progress")),
                    airing_status=clean_value(row.get("airing_status")),
                    ep_total=clean_value(row.get("ep_total"), int),
                    ep_fin=clean_value(row.get("ep_fin"), int),
                    rating_mine=clean_value(row.get("rating_mine")),
                    main_spinoff=clean_value(row.get("main_spinoff")),
                    release_year=clean_value(row.get("release_year")),
                    release_month=clean_value(row.get("release_month")),
                    release_season=clean_value(row.get("release_season")),
                    release_date=clean_value(row.get("release_date")),
                    studio=clean_value(row.get("studio")),
                    source_baha=clean_value(row.get("source_baha"), str),
                    source_netflix=clean_value(row.get("source_netflix"), str),
                    source_other=clean_value(row.get("source_other")),
                    source_other_link=clean_value(row.get("source_other_link")),
                    watch_order=clean_value(row.get("watch_order"), float),
                    watch_order_rec=clean_value(row.get("watch_order_rec")),
                    genre_main=clean_value(row.get("genre_main")),
                    genre_sub=clean_value(row.get("genre_sub")),
                    insert_ost=clean_value(row.get("insert_ost")),
                    seiyuu=clean_value(row.get("seiyuu")),
                    remark=clean_value(row.get("remark")),
                    mal_id=clean_value(row.get("mal_id"), int),
                    mal_url=clean_value(row.get("mal_url")),
                    mal_rating=clean_value(row.get("mal_rating")),
                    mal_rank=clean_value(row.get("mal_rank")),
                    cover_image_file=clean_value(row.get("cover_image_file")),
                    cover_image_url=clean_value(row.get("cover_image_url")),
                )
                db.add(new_anime)
                added_count += 1

        db.commit()
        return added_count
    except Exception as e:
        db.rollback()
        raise e


def run_full_sync(db: Session, direction: str = "push") -> dict:
    """
    Executes a Master Sync.
    If direction="pull_first", it scans for newly added Google Sheet rows first.
    Then, it permanently overwrites the Google Sheets with the PostgreSQL DB.
    """
    start_time = time.time()
    error_msg = None
    added_from_sheets = 0
    push_metrics = {"success": False, "error": "Did not run"}

    try:
        cleanup_old_logs(db)

        if direction == "pull_first":
            print("⏬ [Master Sync] Pulling new manual entries from Google Sheets...")
            added_from_sheets = _pull_new_manual_entries(db)

        print("⏫ [Master Sync] Pushing Database Truth to Google Sheets...")
        push_metrics = _push_db_backup_to_sheets(db)
        if not push_metrics["success"]:
            error_msg = f"Backup to Sheets failed: {push_metrics['error']}"

        status = "failed" if error_msg else "success"
        details = {
            "type": "master_sync",
            "direction": direction,
            "added_from_sheets": added_from_sheets,
            "sheets_backup_success": push_metrics["success"],
            "duration_seconds": round(time.time() - start_time, 2),
        }

        log_sync_event(
            db,
            sync_type="v2_master_sync",
            status=status,
            updated=added_from_sheets,
            error=error_msg,
            details_json=json.dumps(details),
        )

        return {
            "status": status,
            "message": (
                "Master Sync completed successfully." if not error_msg else error_msg
            ),
            "added_from_sheets": added_from_sheets,
        }
    except Exception as e:
        error_msg = str(e)
        log_sync_event(db, "v2_master_sync", "failed", 0, error_msg)
        return {"status": "failed", "message": error_msg}


def run_strong_sync(db: Session) -> dict:
    """
    Executes a Strong Sync.
    Crawls MAL (Jikan) for missing data for all entries missing a cover image,
    MAL rating, or total episodes.
    """
    updated_count = 0
    error_msg = None

    try:
        print("▶️ [Strong Sync] Identifying targets needing Jikan updates...")
        targets = (
            db.query(AnimeEntry)
            .filter(
                or_(
                    AnimeEntry.ep_total == None,
                    AnimeEntry.cover_image_file == None,
                    AnimeEntry.mal_rating == None,
                    and_(
                        AnimeEntry.airing_status == "Airing", AnimeEntry.mal_id != None
                    ),
                )
            )
            .all()
        )

        for anime in targets:
            try:
                mal_id = anime.mal_id
                if not mal_id and anime.mal_url:
                    mal_id = extract_mal_id(anime.mal_url)
                if not mal_id:
                    mal_id = jikan_client.search_anime_mal_id(
                        anime.series_season_en or anime.series_en
                    )

                if mal_id:
                    anime.mal_id = mal_id
                    jikan_data = jikan_client.get_anime_details(mal_id)

                    if jikan_data:
                        if not anime.ep_total and jikan_data.get("episodes"):
                            anime.ep_total = jikan_data.get("episodes")

                        anime.mal_rating = (
                            str(jikan_data.get("score"))
                            if jikan_data.get("score")
                            else anime.mal_rating
                        )
                        anime.mal_rank = (
                            str(jikan_data.get("rank"))
                            if jikan_data.get("rank")
                            else anime.mal_rank
                        )
                        anime.airing_status = (
                            jikan_data.get("status") or anime.airing_status
                        )

                        if not anime.cover_image_file and jikan_data.get("image_url"):
                            anime.cover_image_url = jikan_data.get("image_url")

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
        print(f"❌ [Strong Sync] Critical Error: {error_msg}")
        log_sync_event(db, "v2_strong_sync", "failed", 0, error_msg)
        return {"status": "failed", "message": error_msg}
