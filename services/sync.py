"""
sync.py
The master orchestrator for Version 2 synchronization.
Enforces PostgreSQL as the Source of Truth while treating Google Sheets as a
Secondary Input (for new rows) and a Read-Only Backup (via bulk overwrites).
"""

import uuid
import json
from sqlalchemy.orm import Session

from database import cleanup_old_logs
from models import AnimeEntry, AnimeSeries, SyncLog

from services.sync_utils import clean_value, extract_mal_id
from services.sheets_client import get_all_rows, bulk_overwrite_sheet

# Define the exact V2 column headers expected in the Google Sheet
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
    """Helper to write sync audit trails to the database."""
    log = SyncLog(
        sync_type=sync_type,
        status=status,
        rows_added=added,
        rows_updated=updated,
        rows_deleted=deleted,
        error_message=error,
        details_json=details_json,
    )
    db.add(log)
    db.commit()


def _pull_new_manual_entries(db: Session) -> dict:
    """
    Secondary Input Mechanism:
    Scans the Google Sheet for any rows that are manually typed in and lack a 'system_id'.
    Generates a UUID for them, cleans the data, and inserts them into PostgreSQL.
    """
    metrics = {"anime_added": 0, "series_added": 0}

    # --- 1. Pull New Anime Entries ---
    anime_rows = get_all_rows("Anime")
    for row in anime_rows:
        if not str(row.get("system_id", "")).strip():
            # This is a brand new manual entry!
            new_id = str(uuid.uuid4())

            new_anime = AnimeEntry(
                system_id=new_id,
                series_en=clean_value(row.get("series_en")),
                series_season_en=clean_value(row.get("series_season_en")),
                series_season_roman=clean_value(row.get("series_season_roman")),
                series_season_cn=clean_value(row.get("series_season_cn")),
                anime_alt_name=clean_value(row.get("anime_alt_name")),
                series_season=clean_value(row.get("series_season")),
                airing_type=clean_value(row.get("airing_type")),
                my_progress=clean_value(row.get("my_progress")),
                airing_status=clean_value(row.get("airing_status")),
                ep_total=clean_value(row.get("ep_total"), int),
                ep_fin=clean_value(row.get("ep_fin"), int) or 0,
                rating_mine=clean_value(row.get("rating_mine")),
                main_spinoff=clean_value(row.get("main_spinoff")),
                release_month=clean_value(row.get("release_month")),
                release_season=clean_value(row.get("release_season")),
                release_year=clean_value(row.get("release_year")),
                studio=clean_value(row.get("studio")),
                director=clean_value(row.get("director")),
                producer=clean_value(row.get("producer")),
                music=clean_value(row.get("music")),
                distributor_tw=clean_value(row.get("distributor_tw")),
                genre_main=clean_value(row.get("genre_main")),
                genre_sub=clean_value(row.get("genre_sub")),
                prequel=clean_value(row.get("prequel")),
                sequel=clean_value(row.get("sequel")),
                alternative=clean_value(row.get("alternative")),
                watch_order=clean_value(row.get("watch_order"), float),
                watch_order_rec=clean_value(row.get("watch_order_rec")),
                remark=clean_value(row.get("remark")),
                mal_id=clean_value(row.get("mal_id")),
                mal_link=clean_value(row.get("mal_link")),
                anilist_link=clean_value(row.get("anilist_link")),
                op=clean_value(row.get("op")),
                ed=clean_value(row.get("ed")),
                insert_ost=clean_value(row.get("insert_ost")),
                seiyuu=clean_value(row.get("seiyuu")),
                source_baha=clean_value(row.get("source_baha")),
                baha_link=clean_value(row.get("baha_link")),
                source_other=clean_value(row.get("source_other")),
                source_other_link=clean_value(row.get("source_other_link")),
                source_netflix=str(row.get("source_netflix", "")).strip().lower()
                == "true",
                cover_image_file=clean_value(row.get("cover_image_file")),
            )
            db.add(new_anime)
            metrics["anime_added"] += 1

    # --- 2. Pull New Series Entries ---
    series_rows = get_all_rows("Anime Series")
    for row in series_rows:
        if not str(row.get("system_id", "")).strip():
            new_id = str(uuid.uuid4())
            new_series = AnimeSeries(
                system_id=new_id,
                series_en=clean_value(row.get("series_en")),
                series_roman=clean_value(row.get("series_roman")),
                series_cn=clean_value(row.get("series_cn")),
                rating_series=clean_value(row.get("rating_series")),
                series_alt_name=clean_value(row.get("series_alt_name")),
                series_expectation=clean_value(row.get("series_expectation")),
                favorite_3x3_slot=clean_value(row.get("favorite_3x3_slot"), int),
            )
            db.add(new_series)
            metrics["series_added"] += 1

    if metrics["anime_added"] > 0 or metrics["series_added"] > 0:
        db.commit()

    return metrics


def _push_db_backup_to_sheets(db: Session) -> dict:
    """
    Source of Truth Mechanism:
    Takes all data currently in the PostgreSQL database and performs a bulk overwrite
    of the Google Sheets, ensuring the backup perfectly mirrors the DB.
    """
    # --- 1. Push Anime Entries ---
    all_anime = db.query(AnimeEntry).all()
    anime_matrix = []

    for a in all_anime:
        row = [
            a.system_id,
            a.series_en,
            a.series_season_en,
            a.series_season_roman,
            a.series_season_cn,
            a.anime_alt_name,
            a.series_season,
            a.airing_type,
            a.my_progress,
            a.airing_status,
            a.ep_total,
            a.ep_fin,
            a.rating_mine,
            a.main_spinoff,
            a.release_month,
            a.release_season,
            a.release_year,
            a.studio,
            a.director,
            a.producer,
            a.music,
            a.distributor_tw,
            a.genre_main,
            a.genre_sub,
            a.prequel,
            a.sequel,
            a.alternative,
            a.watch_order,
            a.watch_order_rec,
            a.remark,
            a.mal_id,
            a.mal_link,
            a.anilist_link,
            a.op,
            a.ed,
            a.insert_ost,
            a.seiyuu,
            a.source_baha,
            a.baha_link,
            a.source_other,
            a.source_other_link,
            "TRUE" if a.source_netflix else "FALSE",
            a.cover_image_file,
        ]
        # Clean nulls into empty strings for Google Sheets
        cleaned_row = ["" if val is None else str(val) for val in row]
        anime_matrix.append(cleaned_row)

    anime_success = bulk_overwrite_sheet("Anime", ANIME_HEADERS, anime_matrix)

    # --- 2. Push Series Entries ---
    all_series = db.query(AnimeSeries).all()
    series_matrix = []

    for s in all_series:
        row = [
            s.system_id,
            s.series_en,
            s.series_roman,
            s.series_cn,
            s.rating_series,
            s.series_alt_name,
            s.series_expectation,
            s.favorite_3x3_slot,
        ]
        cleaned_row = ["" if val is None else str(val) for val in row]
        series_matrix.append(cleaned_row)

    series_success = bulk_overwrite_sheet("Anime Series", SERIES_HEADERS, series_matrix)

    return {
        "anime_backed_up": len(all_anime) if anime_success else 0,
        "series_backed_up": len(all_series) if series_success else 0,
        "success": anime_success and series_success,
    }


def run_full_sync(db: Session, direction: str = "both") -> dict:
    """
    Executes the V2 master synchronization process.
    'direction' can be 'pull' (only check for manual sheet additions),
    'push' (only force DB backup to sheets), or 'both' (default).
    """
    total_added = 0
    total_updated = 0
    error_msg = None

    try:
        # Step 1: Check Google Sheets for manual entries without a system_id
        if direction in ["both", "pull"]:
            pull_metrics = _pull_new_manual_entries(db)
            total_added = pull_metrics["anime_added"] + pull_metrics["series_added"]
            print(
                f"📥 Pulled {pull_metrics['anime_added']} new anime and {pull_metrics['series_added']} new series from Sheets."
            )

        # Step 2: Force DB Backup to Google Sheets
        if direction in ["both", "push"]:
            push_metrics = _push_db_backup_to_sheets(db)
            if not push_metrics["success"]:
                error_msg = "Bulk overwrite failed for one or more tabs."
            else:
                total_updated = (
                    push_metrics["anime_backed_up"] + push_metrics["series_backed_up"]
                )
                print(
                    f"📤 Backed up {push_metrics['anime_backed_up']} anime and {push_metrics['series_backed_up']} series to Sheets."
                )

        # Step 3: Log Event
        status = "failed" if error_msg else "success"
        details = {
            "direction": direction,
            "items_added_to_db": total_added,
            "items_backed_up": total_updated,
        }

        log_sync_event(
            db,
            sync_type="v2_master_sync",
            status=status,
            added=total_added,
            updated=total_updated,
            error=error_msg,
            details_json=json.dumps(details),
        )

        # Cleanup old logs
        cleanup_old_logs(db, days_to_keep=30)

        return {
            "status": status,
            "message": "Sync completed successfully" if not error_msg else error_msg,
            "added_to_db": total_added,
            "backed_up_to_sheets": total_updated,
        }

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"❌ V2 Master Sync Error: {error_msg}")
        log_sync_event(db, sync_type="v2_master_sync", status="failed", error=error_msg)
        return {"status": "failed", "message": error_msg}
