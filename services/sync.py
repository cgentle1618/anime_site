"""
sync.py
The master orchestrator for Version 2 synchronization.
Enforces PostgreSQL as the Source of Truth while treating Google Sheets as a
Secondary Input (for manually added rows) and a Read-Only Backup (via bulk overwrites).
Strictly aligned with models.py and schemas.py typing.
"""

import uuid
import time
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

# Adjust imports based on your exact file structure
from models import AnimeEntry, AnimeSeries, SystemOption
import schemas
from services.sync_utils import (
    clean_value,
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
# HELPER FUNCTIONS (CALCULATION & FORMATTING)
# ==========================================


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


def _extract_jikan_image(jikan_data: dict) -> str | None:
    """Safely extracts the high-res cover image URL from a Jikan API response."""
    images = jikan_data.get("images", {})
    jpg = images.get("jpg", {})
    return (
        jpg.get("large_image_url")
        or jpg.get("image_url")
        or jikan_data.get("image_url")
    )


def _autofill_missing_data(db: Session) -> int:
    """
    Core Calculation Step:
    Fills in easily calculable missing fields within the database without heavy API calls.
    """
    updated_count = 0
    entries = db.query(AnimeEntry).all()

    for entry in entries:
        changed = False

        # Fill missing system_id (Edge case safety)
        if not entry.system_id or str(entry.system_id).strip() == "":
            entry.system_id = str(uuid.uuid4())
            changed = True

        # Extract MAL ID from Link
        if not entry.mal_id and entry.mal_link:
            extracted_id = _extract_mal_id_from_link(entry.mal_link)
            if extracted_id:
                entry.mal_id = extracted_id
                changed = True

        # Extract Season from English Title
        if not entry.series_season and entry.series_season_en:
            season_str = extract_season_from_title(entry.series_season_en)
            if season_str:
                entry.series_season = season_str
                changed = True

        # Extract Season from Chinese Title Fallback
        if not entry.series_season and entry.series_season_cn:
            season_str = extract_season_from_cn_title(entry.series_season_cn)
            if season_str:
                entry.series_season = season_str
                changed = True

        if changed:
            updated_count += 1

    db.commit()
    return updated_count


# ==========================================
# BACKUP WORKERS
# ==========================================


def _push_db_backup_to_sheets(db: Session) -> dict:
    try:
        entries = db.query(AnimeEntry).all()
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
                _format_for_sheet(
                    entry.watch_order, str
                ),  # string parsing is safest for decimals here
                _format_for_sheet(entry.watch_order_rec, str),
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

        success = bulk_overwrite_sheet("Anime", ANIME_HEADERS, data_matrix)
        return {"success": success, "rows": len(entries)}
    except Exception as e:
        print(f"❌ Error building Anime backup matrix: {e}")
        return {"success": False, "rows": 0}


def _push_series_backup_to_sheets(db: Session) -> dict:
    try:
        series_entries = db.query(AnimeSeries).all()
        data_matrix = []
        for entry in series_entries:
            row = [
                _format_for_sheet(entry.system_id, str),
                _format_for_sheet(entry.series_en, str),
                _format_for_sheet(entry.series_roman, str),
                _format_for_sheet(entry.series_cn, str),
                _format_for_sheet(entry.rating_series, str),
                _format_for_sheet(entry.series_alt_name, str),
                _format_for_sheet(entry.series_expectation, str),
                _format_for_sheet(entry.favorite_3x3_slot, int),
                _format_for_sheet(entry.created_at, datetime),
                _format_for_sheet(entry.updated_at, datetime),
            ]
            data_matrix.append(row)
        success = bulk_overwrite_sheet("Anime Series", SERIES_HEADERS, data_matrix)
        return {"success": success, "rows": len(series_entries)}
    except Exception as e:
        print(f"❌ Error building Series backup matrix: {e}")
        return {"success": False, "rows": 0}


def _push_options_backup_to_sheets(db: Session) -> dict:
    try:
        options = (
            db.query(SystemOption)
            .order_by(SystemOption.category, SystemOption.option_value)
            .all()
        )
        data_matrix = []
        for opt in options:
            row = [
                _format_for_sheet(opt.id, int),
                _format_for_sheet(opt.category, str),
                _format_for_sheet(opt.option_value, str),
            ]
            data_matrix.append(row)
        success = bulk_overwrite_sheet("Options", OPTIONS_HEADERS, data_matrix)
        return {"success": success, "rows": len(options)}
    except Exception as e:
        print(f"❌ Error building Options backup matrix: {e}")
        return {"success": False, "rows": 0}


def _run_full_backup(db: Session) -> dict:
    """Executes all three backup routines to fully mirror DB to Sheets."""
    anime_metrics = _push_db_backup_to_sheets(db)
    series_metrics = _push_series_backup_to_sheets(db)
    options_metrics = _push_options_backup_to_sheets(db)

    success = (
        anime_metrics["success"]
        and series_metrics["success"]
        and options_metrics["success"]
    )
    return {
        "success": success,
        "anime_rows": anime_metrics["rows"],
        "series_rows": series_metrics["rows"],
        "options_rows": options_metrics["rows"],
    }


# ==========================================
# PUBLIC ORCHESTRATION ENDPOINTS
# ==========================================


def action_backup(db: Session) -> dict:
    """Action: Backup. Performs Calculation -> Full Backup to Sheets."""
    print("▶️ [Action: Backup] Starting...")
    try:
        calc_updates = _autofill_missing_data(db)
        metrics = _run_full_backup(db)
        status = "success" if metrics["success"] else "failed"

        return {
            "status": status,
            "message": f"Backup completed. Calc Updates: {calc_updates}. Backed up {metrics['anime_rows']} Anime, {metrics['series_rows']} Series, {metrics['options_rows']} Options.",
        }
    except Exception as e:
        db.rollback()
        return {"status": "failed", "message": str(e)}


def action_sync_from_sheets(db: Session) -> dict:
    """Action: Sync from Sheets. Pulls new manual entries -> Calculation -> Full Backup."""
    print("▶️ [Action: Sync from Sheets] Starting...")
    try:
        # Pull Phase
        data_rows = get_all_rows("Anime")
        added_count = 0
        if data_rows:
            for row_data in data_rows:
                if (
                    not row_data.get("system_id")
                    or str(row_data.get("system_id")).strip() == ""
                ):
                    if not row_data.get("series_en"):
                        continue
                    validated_data = schemas.AnimeSheetSync(**row_data)
                    validated_data.system_id = str(uuid.uuid4())
                    new_entry = AnimeEntry(
                        **validated_data.model_dump(exclude_none=True)
                    )
                    db.add(new_entry)
                    added_count += 1
            db.commit()

        # Calculation Phase
        calc_updates = _autofill_missing_data(db)

        # Backup Phase
        metrics = _run_full_backup(db)
        status = "success" if metrics["success"] else "failed"

        return {
            "status": status,
            "message": f"Sync from Sheets completed. Added: {added_count}. Calc Updates: {calc_updates}.",
        }
    except Exception as e:
        db.rollback()
        return {"status": "failed", "message": str(e)}


def action_fill(db: Session) -> dict:
    """
    Action: Fill. Calculation -> Finds missing cover, mal_rating, or mal_rank -> Calls Jikan -> Full Backup.
    Ignores mal_rating/mal_rank if the series is 'Not Yet Aired'.
    """
    print("▶️ [Action: Fill] Starting...")
    try:
        _autofill_missing_data(db)

        # Find entries with mal_id but missing ONE of the target fields
        entries = (
            db.query(AnimeEntry)
            .filter(
                AnimeEntry.mal_id.isnot(None),
                or_(
                    AnimeEntry.cover_image_file == None,
                    AnimeEntry.cover_image_file == "",
                    # Only check for missing scores/ranks if it's NOT "Not Yet Aired"
                    and_(
                        or_(
                            AnimeEntry.airing_status != "Not Yet Aired",
                            AnimeEntry.airing_status.is_(None),
                        ),
                        or_(AnimeEntry.mal_rating == None, AnimeEntry.mal_rank == None),
                    ),
                ),
            )
            .all()
        )

        total_entries = len(entries)
        print(
            f"   ↳ Found {total_entries} entries missing data. Estimated time: {total_entries * 1.2:.1f}s"
        )

        filled_count = 0
        for idx, entry in enumerate(entries, 1):
            title_display = entry.series_en or str(entry.system_id)[:8]
            print(
                f"   ↳ [{idx}/{total_entries}] Fetching MAL {entry.mal_id} for '{title_display}'..."
            )

            try:
                jikan_data = jikan_client.fetch_anime_details(entry.mal_id)
                if jikan_data:
                    changed = False
                    is_not_yet_aired = entry.airing_status == "Not Yet Aired"

                    # Only attempt to extract scores if it's actually released
                    if not is_not_yet_aired:
                        if not entry.mal_rating and jikan_data.get("score"):
                            entry.mal_rating = clean_value(
                                jikan_data.get("score"), float
                            )
                            changed = True

                        if not entry.mal_rank and jikan_data.get("rank"):
                            entry.mal_rank = clean_value(jikan_data.get("rank"), int)
                            changed = True

                    # Always attempt to fill missing covers, even if unreleased
                    if not entry.cover_image_file:
                        cover_url = _extract_jikan_image(jikan_data)
                        if cover_url:
                            # Actually download the image to local/cloud storage instead of just saving the URL
                            downloaded_path = download_cover_image(
                                cover_url, entry.system_id
                            )
                            if downloaded_path:
                                entry.cover_image_file = downloaded_path
                                changed = True

                    if changed:
                        print(f"        [+] Successfully filled missing fields.")
                        filled_count += 1
                    else:
                        print(f"        [-] No valid missing fields found on Jikan.")

                time.sleep(1.2)  # Jikan Rate Limit
            except Exception as e:
                print(f"⚠️ [Fill] Jikan Error for {entry.system_id}: {e}")

        db.commit()

        metrics = _run_full_backup(db)
        status = "success" if metrics["success"] else "failed"

        return {
            "status": status,
            "message": f"Fill completed. Checked and filled missing fields for {filled_count} entries.",
        }
    except Exception as e:
        db.rollback()
        return {"status": "failed", "message": str(e)}


def action_replace(db: Session) -> dict:
    """
    Action: Replace. Calculation -> Updates ALL mal_rating and mal_rank. Fills cover ONLY IF MISSING -> Full Backup.
    """
    print("▶️ [Action: Replace] Starting...")
    try:
        _autofill_missing_data(db)

        entries = db.query(AnimeEntry).filter(AnimeEntry.mal_id.isnot(None)).all()
        total_entries = len(entries)
        print(
            f"   ↳ Found {total_entries} entries to update. Estimated time: {total_entries * 1.2:.1f}s"
        )

        replaced_count = 0

        for idx, entry in enumerate(entries, 1):
            title_display = entry.series_en or str(entry.system_id)[:8]
            print(
                f"   ↳ [{idx}/{total_entries}] Updating MAL {entry.mal_id} for '{title_display}'..."
            )

            try:
                jikan_data = jikan_client.fetch_anime_details(entry.mal_id)
                if jikan_data:
                    changed = False

                    # Unconditional replace for rating and rank
                    new_score = clean_value(jikan_data.get("score"), float)
                    if new_score and entry.mal_rating != new_score:
                        entry.mal_rating = new_score
                        changed = True

                    new_rank = clean_value(jikan_data.get("rank"), int)
                    if new_rank and entry.mal_rank != new_rank:
                        entry.mal_rank = new_rank
                        changed = True

                    # Conditional fill for cover image (Does not replace existing images)
                    if not entry.cover_image_file:
                        cover_url = _extract_jikan_image(jikan_data)
                        if cover_url:
                            # Actually download the image to local/cloud storage instead of just saving the URL
                            downloaded_path = download_cover_image(
                                cover_url, entry.system_id
                            )
                            if downloaded_path:
                                entry.cover_image_file = downloaded_path
                                changed = True

                    if changed:
                        print(f"        [+] Updated stats/cover successfully.")
                        replaced_count += 1
                    else:
                        print(f"        [-] Data already up-to-date.")

                time.sleep(1.2)  # Jikan Rate Limit
            except Exception as e:
                print(f"⚠️ [Replace] Jikan Error for {entry.system_id}: {e}")

        db.commit()

        metrics = _run_full_backup(db)
        status = "success" if metrics["success"] else "failed"

        return {
            "status": status,
            "message": f"Replace completed. Replaced/Filled stats for {replaced_count} entries.",
        }
    except Exception as e:
        db.rollback()
        return {"status": "failed", "message": str(e)}
