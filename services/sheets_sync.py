"""
sheets_sync.py
The central orchestrator for synchronizing data between Google Sheets,
the local PostgreSQL database, and external APIs (Jikan).
"""

import time
import uuid
import json
import gspread
from gspread.exceptions import WorksheetNotFound
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from database import SessionLocal, get_taipei_now, cleanup_old_logs
from models import AnimeEntry, AnimeSeries, SyncLog

from sync_utils import (
    clean_value,
    extract_mal_id,
    extract_season_from_title,
    extract_season_from_cn_title,
)
from jikan_client import fetch_mal_data
from sheets_client import (
    execute_with_retry,
    get_google_spreadsheet,
    get_google_sheet,
    append_new_anime,
    append_new_series,
    update_anime_row,
    delete_anime_row,
    update_series_row,
    delete_series_row,
    update_anime_field_in_sheet,
)


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
    """Writes a record of the sync operation to the database for the Admin Dashboard."""
    try:
        log_entry = SyncLog(
            sync_type=sync_type,
            status=status,
            rows_added=added,
            rows_updated=updated,
            rows_deleted=deleted,
            error_message=error,
            details_json=details_json,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️ Failed to write sync log to DB: {e}")


def populate_anime_series_tab(spreadsheet: gspread.Spreadsheet, anime_row_dicts: list):
    """
    Scans the 'Anime Series' tab to ensure all existing rows have a system_id.
    Note: Auto-population of missing series from the main tab has been disabled
    to prevent accidental resurrection of intentionally deleted Series Hubs.
    """
    print("\n--- Checking 'Anime Series' Tab ---")

    try:
        series_sheet = execute_with_retry(spreadsheet.worksheet, "Anime Series")
    except WorksheetNotFound:
        print("⚠️ 'Anime Series' tab not found! Skipping series population.")
        return

    series_rows = execute_with_retry(series_sheet.get_all_values)

    if not series_rows:
        # Initialize empty sheet with headers
        headers = [
            "system_id",
            "series_en",
            "series_roman",
            "series_cn",
            "rating_series",
            "alt_name",
        ]
        execute_with_retry(series_sheet.append_row, headers)
        series_rows = [headers]
    else:
        headers = series_rows[0]

    cells_to_update = []
    sys_id_col = (
        (len(headers) - headers[::-1].index("system_id") - 1)
        if "system_id" in headers
        else 0
    )

    # Ensure all existing series have a UUID
    for i, row in enumerate(series_rows[1:], start=2):
        row = row + [""] * (len(headers) - len(row))  # Pad row
        sys_id = row[sys_id_col].strip()
        if not sys_id:
            sys_id = str(uuid.uuid4())
            cells_to_update.append(
                gspread.Cell(row=i, col=sys_id_col + 1, value=sys_id)
            )
            print(f"Generated missing UUID for Series Tab row {i}")

    if cells_to_update:
        print(
            f"Updating {len(cells_to_update)} missing system_ids in 'Anime Series' tab..."
        )
        execute_with_retry(
            series_sheet.update_cells,
            cells_to_update,
            value_input_option="USER_ENTERED",
        )


def enrich_anime_database(db: Session, worksheet: gspread.Worksheet) -> int:
    """
    Finds all DB anime with a mal_id but missing cover image, rating, or rank.
    Fetches the missing data via Jikan API and pushes the updates back to Google Sheets.
    """
    anime_to_enrich = (
        db.query(AnimeEntry)
        .filter(
            AnimeEntry.mal_id.isnot(None),
            or_(
                AnimeEntry.cover_image_url.is_(None),
                and_(
                    or_(AnimeEntry.mal_rating.is_(None), AnimeEntry.mal_rank.is_(None)),
                    or_(
                        AnimeEntry.airing_status != "Not Yet Aired",
                        AnimeEntry.airing_status.is_(None),
                    ),
                ),
            ),
        )
        .all()
    )

    if not anime_to_enrich:
        return 0

    print(f"\n--- Fetching MAL Data for {len(anime_to_enrich)} anime ---")
    headers = execute_with_retry(worksheet.row_values, 1)

    # Locate column indices dynamically
    sys_id_col = (
        len(headers) - headers[::-1].index("system_id")
        if "system_id" in headers
        else None
    )
    rating_col = (
        len(headers) - headers[::-1].index("mal_rating")
        if "mal_rating" in headers
        else None
    )
    rank_col = (
        len(headers) - headers[::-1].index("mal_rank")
        if "mal_rank" in headers
        else None
    )

    # Map system_ids to row numbers for fast sheet updating
    row_map = {}
    if sys_id_col:
        sys_id_values = execute_with_retry(worksheet.col_values, sys_id_col)
        row_map = {val.strip(): idx + 1 for idx, val in enumerate(sys_id_values)}

    enriched_count = 0
    cells_to_update = []

    for anime in anime_to_enrich:
        mal_data = fetch_mal_data(anime.mal_id)
        if not mal_data:
            continue

        updated_fields = 0
        row_idx = row_map.get(anime.system_id)

        # Update Image (Only stored in DB, not Sheets)
        if mal_data["cover_image_url"] and not anime.cover_image_url:
            anime.cover_image_url = mal_data["cover_image_url"]
            updated_fields += 1

        # Update Rating
        if mal_data["mal_rating"] and not anime.mal_rating:
            anime.mal_rating = mal_data["mal_rating"]
            if row_idx and rating_col:
                cells_to_update.append(
                    gspread.Cell(
                        row=row_idx, col=rating_col, value=mal_data["mal_rating"]
                    )
                )
            updated_fields += 1

        # Update Rank
        if mal_data["mal_rank"] and not anime.mal_rank:
            anime.mal_rank = mal_data["mal_rank"]
            if row_idx and rank_col:
                cells_to_update.append(
                    gspread.Cell(row=row_idx, col=rank_col, value=mal_data["mal_rank"])
                )
            updated_fields += 1

        if updated_fields > 0:
            enriched_count += 1
            time.sleep(1.5)  # Respect Jikan Rate Limits

    if cells_to_update:
        execute_with_retry(
            worksheet.update_cells, cells_to_update, value_input_option="USER_ENTERED"
        )

    db.commit()
    return enriched_count


def detect_orphans(db: Session) -> list:
    """
    Compares DB records against Google Sheets to find orphaned Postgres entries.
    Useful for resolving hard-deletions made manually on Google Sheets.
    """
    worksheet = get_google_sheet("Anime")
    headers = execute_with_retry(worksheet.row_values, 1)

    try:
        sys_id_col = len(headers) - headers[::-1].index("system_id")
    except ValueError:
        print("Error: system_id column not found in Google Sheets.")
        return []

    # Get valid IDs from sheet
    sheet_sys_ids = execute_with_retry(worksheet.col_values, sys_id_col)
    sheet_sys_ids_set = {sid.strip() for sid in sheet_sys_ids[1:] if sid.strip()}

    # Query DB for missing IDs
    if not sheet_sys_ids_set:
        db_orphans = db.query(AnimeEntry).all()
    else:
        db_orphans = (
            db.query(AnimeEntry)
            .filter(AnimeEntry.system_id.notin_(sheet_sys_ids_set))
            .all()
        )

    # Format for API response
    orphans = []
    for entry in db_orphans:
        orphans.append(
            {
                "system_id": entry.system_id,
                "series_en": entry.series_en,
                "series_season_en": entry.series_season_en,
                "series_season_cn": entry.series_season_cn,
            }
        )

    return orphans


# --- Sub-Routine: Sync Series ---
def _sync_series_tab(db: Session, series_sheet: gspread.Worksheet, sync_metrics: dict):
    """
    Internal helper function that synchronizes the Franchise Hubs ('Anime Series' tab).
    It reads the Google Sheet, compares it against the local PostgreSQL database,
    and automatically inserts new series, updates modified fields, or deletes
    orphaned series from the database to ensure both sources match perfectly.
    """
    print("\n--- Syncing Anime Series Tab to PostgreSQL ---")
    valid_series_ids = set()

    if not series_sheet:
        return

    series_rows = execute_with_retry(series_sheet.get_all_values)
    if not series_rows or len(series_rows) <= 1:
        return

    s_headers = series_rows[0]
    for s_row in series_rows[1:]:
        padded_s_row = s_row + [""] * (len(s_headers) - len(s_row))
        s_dict = dict(zip(s_headers, padded_s_row))

        s_sys_id = s_dict.get("system_id", "").strip()
        if not s_sys_id:
            continue

        valid_series_ids.add(s_sys_id)

        s_entry_data = {
            "system_id": s_sys_id,
            "series_en": clean_value(s_dict.get("series_en")),
            "series_roman": clean_value(s_dict.get("series_roman")),
            "series_cn": clean_value(s_dict.get("series_cn")),
            "rating_series": clean_value(s_dict.get("rating_series")),
            "alt_name": clean_value(s_dict.get("alt_name")),
        }

        existing_s = (
            db.query(AnimeSeries).filter(AnimeSeries.system_id == s_sys_id).first()
        )

        if existing_s:
            # Update existing
            is_modified = False
            for key, value in s_entry_data.items():
                current_val = getattr(existing_s, key)
                if current_val is None and value is None:
                    continue
                if str(current_val) != str(value):
                    setattr(existing_s, key, value)
                    is_modified = True
            if is_modified:
                existing_s.updated_at = get_taipei_now()
                sync_metrics["updated_items"].append(
                    f"Series Hub: {existing_s.series_en}"
                )
        else:
            # Add new
            new_s = AnimeSeries(**s_entry_data)
            new_s.created_at = get_taipei_now()
            new_s.updated_at = get_taipei_now()
            db.add(new_s)
            sync_metrics["added_items"].append(f"Series Hub: {new_s.series_en}")

    # Process Series Deletions
    all_db_series = db.query(AnimeSeries).all()
    for db_s in all_db_series:
        if db_s.system_id not in valid_series_ids:
            print(f"Auto-deleting orphaned Series from DB: {db_s.series_en}")
            sync_metrics["deleted_items"].append(f"Series Hub: {db_s.series_en}")
            db.delete(db_s)
            sync_metrics["deleted_count"] += 1


# --- Sub-Routine: Sync Anime ---
def _sync_anime_tab(
    db: Session,
    worksheet: gspread.Worksheet,
    headers: list,
    anime_row_dicts: list,
    sync_metrics: dict,
):
    """
    Internal helper function that synchronizes the individual anime entries ('Anime' tab).
    It processes row data from Google Sheets, performs automated data cleaning (like
    extracting MAL IDs or normalizing progress), and mirrors the changes to the
    PostgreSQL database by inserting new records, updating existing ones, or
    pruning orphaned entries.
    """
    print("\n--- Syncing Main Anime Tab to PostgreSQL ---")
    cells_to_update = []
    valid_anime_ids = set()

    for idx, row_data in enumerate(anime_row_dicts, start=2):
        system_id = row_data.get("system_id", "").strip()

        # Generate missing UUIDs
        if not system_id:
            system_id = str(uuid.uuid4())
            print(f"Row {idx}: Missing system_id. Generating new UUID: {system_id}")
            if "system_id" in headers:
                col_idx = len(headers) - headers[::-1].index("system_id")
                cells_to_update.append(
                    gspread.Cell(row=idx, col=col_idx, value=system_id)
                )
            row_data["system_id"] = system_id

        valid_anime_ids.add(system_id)

        # 1. Parse Missing MAL IDs from links
        mal_id_val = row_data.get("mal_id", "")
        mal_link_val = row_data.get("mal_link", "")
        if (not mal_id_val or str(mal_id_val).strip() == "") and mal_link_val:
            extracted_id = extract_mal_id(mal_link_val)
            if extracted_id:
                mal_id_val = extracted_id
                if "mal_id" in headers:
                    col_idx = len(headers) - headers[::-1].index("mal_id")
                    cells_to_update.append(
                        gspread.Cell(row=idx, col=col_idx, value=extracted_id)
                    )

        # 2. Parse Season String
        series_season_val = row_data.get("series_season", "")
        if not series_season_val or str(series_season_val).strip() == "":
            extracted_season = extract_season_from_title(
                row_data.get("series_season_en", "")
            )
            if not extracted_season:
                extracted_season = extract_season_from_cn_title(
                    row_data.get("series_season_cn", "")
                )

            if extracted_season:
                series_season_val = extracted_season
                if "series_season" in headers:
                    col_idx = len(headers) - headers[::-1].index("series_season")
                    cells_to_update.append(
                        gspread.Cell(row=idx, col=col_idx, value=extracted_season)
                    )

        # 3. Clean Types & Progress
        airing_type_val = clean_value(row_data.get("airing_type"))
        ep_total_val = clean_value(row_data.get("ep_total"), int)

        if airing_type_val and airing_type_val.lower() == "movie" and ep_total_val != 1:
            ep_total_val = 1
            if "ep_total" in headers:
                col_idx = len(headers) - headers[::-1].index("ep_total")
                cells_to_update.append(gspread.Cell(row=idx, col=col_idx, value=1))

        my_progress_val = clean_value(row_data.get("my_progress"))
        ep_fin_val = clean_value(row_data.get("ep_fin"), int)

        if (
            my_progress_val in ["Completed", "Finished"]
            and ep_total_val
            and ep_fin_val is None
        ):
            ep_fin_val = ep_total_val
            if "ep_fin" in headers:
                col_idx = len(headers) - headers[::-1].index("ep_fin")
                cells_to_update.append(
                    gspread.Cell(row=idx, col=col_idx, value=ep_total_val)
                )

        mal_rating_extracted = clean_value(
            row_data.get("mal_rating", row_data.get("MAL Rating")), float
        )
        mal_rank_extracted = clean_value(
            row_data.get("mal_rank", row_data.get("MAL Rank")), str
        )

        # Build Data Payload
        entry_data = {
            "system_id": system_id,
            "series_en": clean_value(row_data.get("series_en")),
            "series_season_en": clean_value(row_data.get("series_season_en")),
            "series_season_roman": clean_value(row_data.get("series_season_roman")),
            "series_season_cn": clean_value(row_data.get("series_season_cn")),
            "series_season": clean_value(series_season_val),
            "airing_type": airing_type_val,
            "my_progress": my_progress_val,
            "airing_status": clean_value(row_data.get("airing_status")),
            "ep_total": ep_total_val,
            "ep_fin": ep_fin_val,
            "rating_mine": clean_value(row_data.get("rating_mine")),
            "main_spinoff": clean_value(row_data.get("main_spinoff")),
            "release_date": clean_value(row_data.get("release_date")),
            "studio": clean_value(row_data.get("studio")),
            "director": clean_value(row_data.get("director")),
            "producer": clean_value(row_data.get("producer")),
            "distributor_tw": clean_value(row_data.get("distributor_tw")),
            "genre_main": clean_value(row_data.get("genre_main")),
            "genre_sub": clean_value(row_data.get("genre_sub")),
            "remark": clean_value(row_data.get("remark")),
            "mal_id": clean_value(mal_id_val, int),
            "mal_link": clean_value(row_data.get("mal_link")),
            "mal_rating": mal_rating_extracted,
            "mal_rank": mal_rank_extracted,
            "anilist_link": clean_value(row_data.get("anilist_link")),
            "op": clean_value(row_data.get("op")),
            "ed": clean_value(row_data.get("ed")),
            "insert_ost": clean_value(row_data.get("insert_ost")),
            "seiyuu": clean_value(row_data.get("seiyuu")),
            "source_baha": clean_value(row_data.get("source_baha")),
            "source_netflix": clean_value(row_data.get("source_netflix")),
        }

        # Compare with DB
        existing_entry = (
            db.query(AnimeEntry).filter(AnimeEntry.system_id == system_id).first()
        )
        if existing_entry:
            is_modified = False
            for key, value in entry_data.items():
                if (
                    key in ["cover_image_url", "mal_rating", "mal_rank"]
                    and getattr(existing_entry, key) is not None
                ):
                    continue  # Do not overwrite enriched fields

                current_val = getattr(existing_entry, key)
                if current_val != value:
                    setattr(existing_entry, key, value)
                    is_modified = True

            if is_modified:
                existing_entry.updated_at = get_taipei_now()
                sync_metrics["updated_count"] += 1
                sync_metrics["updated_items"].append(
                    f"Anime: {existing_entry.series_season_cn or existing_entry.series_en}"
                )
        else:
            new_entry = AnimeEntry(**entry_data)
            new_entry.created_at = get_taipei_now()
            new_entry.updated_at = get_taipei_now()
            db.add(new_entry)
            sync_metrics["added_count"] += 1
            sync_metrics["added_items"].append(
                f"Anime: {new_entry.series_season_cn or new_entry.series_en}"
            )

    # Process Anime Deletions
    all_db_anime = db.query(AnimeEntry).all()
    for db_a in all_db_anime:
        if db_a.system_id not in valid_anime_ids:
            print(
                f"Auto-deleting orphaned Anime from DB: {db_a.series_season_cn or db_a.series_en}"
            )
            sync_metrics["deleted_items"].append(
                f"Anime: {db_a.series_season_cn or db_a.series_en}"
            )
            db.delete(db_a)
            sync_metrics["deleted_count"] += 1

    # Batch update any missing metadata directly to Google Sheets
    if cells_to_update:
        chunk_size = 50
        for i in range(0, len(cells_to_update), chunk_size):
            chunk = cells_to_update[i : i + chunk_size]
            execute_with_retry(
                worksheet.update_cells, chunk, value_input_option="USER_ENTERED"
            )


# ==========================================
# MAIN EXECUTION
# ==========================================


def sync_sheet_to_db(db_session: Session = None, sync_type: str = "cron"):
    """
    The main sync orchestration function.
    Reads Google Sheets, processes data, synchronizes the database,
    and triggers API enrichment and cleanup tasks.
    """
    print(f"Starting Google Sheets Sync ({sync_type})...")

    db = db_session if db_session else SessionLocal()

    sync_metrics = {
        "added_count": 0,
        "updated_count": 0,
        "deleted_count": 0,
        "added_items": [],
        "updated_items": [],
        "deleted_items": [],
    }

    try:
        spreadsheet = get_google_spreadsheet()
        worksheet = execute_with_retry(spreadsheet.worksheet, "Anime")

        try:
            series_sheet = execute_with_retry(spreadsheet.worksheet, "Anime Series")
        except WorksheetNotFound:
            series_sheet = None

        print("Fetching data from main Anime tab...")
        rows = execute_with_retry(worksheet.get_all_values)
        if not rows:
            print("No data found.")
            log_sync_event(
                db,
                sync_type=sync_type,
                status="success",
                error="No data found in sheet.",
            )
            return

        headers = rows[0]
        anime_row_dicts = []

        # Parse raw rows into dictionaries
        for row in rows[1:]:
            padded_row = row + [""] * (len(headers) - len(row))
            anime_row_dicts.append(dict(zip(headers, padded_row)))

        # 1. Run Pre-checks
        populate_anime_series_tab(spreadsheet, anime_row_dicts)

        # 2. Sync Series
        _sync_series_tab(db, series_sheet, sync_metrics)

        # 3. Sync Anime
        _sync_anime_tab(db, worksheet, headers, anime_row_dicts, sync_metrics)

        # 4. Commit all changes to DB
        db.commit()
        print(
            f"✅ PostgreSQL Sync Complete! Added: {sync_metrics['added_count']} | Updated: {sync_metrics['updated_count']} | Deleted: {sync_metrics['deleted_count']}"
        )

        # 5. Enrich missing data via Jikan API
        enriched_count = enrich_anime_database(db, worksheet)
        if enriched_count > 0:
            print(f"✨ Successfully enriched {enriched_count} anime with MAL Data!")

        # 6. Log the Sync Event
        audit_trail = {
            "added": sync_metrics["added_items"],
            "updated": sync_metrics["updated_items"],
            "deleted": sync_metrics["deleted_items"],
        }

        log_sync_event(
            db,
            sync_type=sync_type,
            status="success",
            added=sync_metrics["added_count"],
            updated=sync_metrics["updated_count"],
            deleted=sync_metrics["deleted_count"],
            details_json=json.dumps(audit_trail, ensure_ascii=False),
        )

        # 7. Background Cleanup
        try:
            purged = cleanup_old_logs(db, days_to_keep=30)
            if purged > 0:
                print(f"🧹 Auto-cleanup: Removed {purged} old sync logs.")
        except Exception as cleanup_error:
            print(f"⚠️ Failed to auto-cleanup old logs: {cleanup_error}")

        return {
            "status": "success",
            "rows_updated": sync_metrics["added_count"] + sync_metrics["updated_count"],
            "rows_deleted": sync_metrics["deleted_count"],
            "enriched_count": enriched_count,
        }

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during sync: {e}")
        log_sync_event(db, sync_type=sync_type, status="failed", error=str(e))
        raise e
    finally:
        if not db_session:
            db.close()


if __name__ == "__main__":
    sync_sheet_to_db(sync_type="manual")
