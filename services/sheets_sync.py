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


def populate_anime_series_tab(spreadsheet, anime_row_dicts):
    print("\n--- Checking 'Anime Series' Tab ---")

    try:
        series_sheet = execute_with_retry(spreadsheet.worksheet, "Anime Series")
    except WorksheetNotFound:
        print("⚠️ 'Anime Series' tab not found! Skipping series population.")
        return

    series_rows = execute_with_retry(series_sheet.get_all_values)

    if not series_rows:
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

    existing_series_tracker = set()
    cells_to_update = []

    sys_id_col = (
        (len(headers) - headers[::-1].index("system_id") - 1)
        if "system_id" in headers
        else 0
    )
    en_col = (
        (len(headers) - headers[::-1].index("series_en") - 1)
        if "series_en" in headers
        else 1
    )

    for i, row in enumerate(series_rows[1:], start=2):
        row = row + [""] * (len(headers) - len(row))
        sys_id = row[sys_id_col].strip()
        if not sys_id:
            sys_id = str(uuid.uuid4())
            cells_to_update.append(
                gspread.Cell(row=i, col=sys_id_col + 1, value=sys_id)
            )
            print(f"Generated missing UUID for Series Tab row {i}")

        s_en = clean_value(row[en_col])
        if s_en:
            existing_series_tracker.add(s_en.lower())

    if cells_to_update:
        print(
            f"Updating {len(cells_to_update)} missing system_ids in 'Anime Series' tab..."
        )
        execute_with_retry(
            series_sheet.update_cells,
            cells_to_update,
            value_input_option="USER_ENTERED",
        )

    print(
        "Skipping automatic Series auto-generation to allow standalone Anime entries."
    )


def enrich_anime_database(db: Session, worksheet):
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

        if mal_data["cover_image_url"] and not anime.cover_image_url:
            anime.cover_image_url = mal_data["cover_image_url"]
            updated_fields += 1

        if mal_data["mal_rating"] and not anime.mal_rating:
            anime.mal_rating = mal_data["mal_rating"]
            if row_idx and rating_col:
                cells_to_update.append(
                    gspread.Cell(
                        row=row_idx, col=rating_col, value=mal_data["mal_rating"]
                    )
                )
            updated_fields += 1

        if mal_data["mal_rank"] and not anime.mal_rank:
            anime.mal_rank = mal_data["mal_rank"]
            if row_idx and rank_col:
                cells_to_update.append(
                    gspread.Cell(row=row_idx, col=rank_col, value=mal_data["mal_rank"])
                )
            updated_fields += 1

        if updated_fields > 0:
            enriched_count += 1
            time.sleep(1.5)

    if cells_to_update:
        execute_with_retry(
            worksheet.update_cells, cells_to_update, value_input_option="USER_ENTERED"
        )

    db.commit()
    return enriched_count


def detect_orphans(db: Session):
    worksheet = get_google_sheet("Anime")
    headers = execute_with_retry(worksheet.row_values, 1)

    try:
        sys_id_col = len(headers) - headers[::-1].index("system_id")
    except ValueError:
        print("Error: system_id column not found in Google Sheets.")
        return []

    sheet_sys_ids = execute_with_retry(worksheet.col_values, sys_id_col)
    sheet_sys_ids_set = {sid.strip() for sid in sheet_sys_ids[1:] if sid.strip()}

    if not sheet_sys_ids_set:
        db_orphans = db.query(AnimeEntry).all()
    else:
        db_orphans = (
            db.query(AnimeEntry)
            .filter(AnimeEntry.system_id.notin_(sheet_sys_ids_set))
            .all()
        )

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


def sync_sheet_to_db(db_session: Session = None, sync_type: str = "cron"):
    print(f"Starting Google Sheets Sync ({sync_type})...")

    db = db_session if db_session else SessionLocal()
    added_count = 0
    updated_count = 0
    deleted_count = 0

    added_items = []
    updated_items = []
    deleted_items = []

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
        series_counts = {}

        for row in rows[1:]:
            padded_row = row + [""] * (len(headers) - len(row))
            row_dict = dict(zip(headers, padded_row))
            anime_row_dicts.append(row_dict)

            s_en = clean_value(row_dict.get("series_en"))
            if s_en:
                series_counts[s_en] = series_counts.get(s_en, 0) + 1

        populate_anime_series_tab(spreadsheet, anime_row_dicts)

        print("\n--- Syncing Anime Series Tab to PostgreSQL ---")
        valid_series_ids = set()
        try:
            if series_sheet:
                series_rows = execute_with_retry(series_sheet.get_all_values)
                if series_rows and len(series_rows) > 1:
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
                            db.query(AnimeSeries)
                            .filter(AnimeSeries.system_id == s_sys_id)
                            .first()
                        )
                        if existing_s:
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
                                updated_items.append(
                                    f"Series Hub: {existing_s.series_en}"
                                )
                        else:
                            new_s = AnimeSeries(**s_entry_data)
                            new_s.created_at = get_taipei_now()
                            new_s.updated_at = get_taipei_now()
                            db.add(new_s)
                            added_items.append(f"Series Hub: {new_s.series_en}")

            all_db_series = db.query(AnimeSeries).all()
            for db_s in all_db_series:
                if db_s.system_id not in valid_series_ids:
                    print(
                        f"Auto-deleting orphaned Series from DB: {db_s.series_en} ({db_s.system_id})"
                    )
                    deleted_items.append(f"Series Hub: {db_s.series_en}")
                    db.delete(db_s)
                    deleted_count += 1

        except Exception as e:
            print(f"⚠️ Error syncing Anime Series tab to DB: {e}")

        print("\n--- Syncing Main Anime Tab to PostgreSQL ---")
        cells_to_update = []
        valid_anime_ids = set()

        for idx, row_data in enumerate(anime_row_dicts, start=2):
            system_id = row_data.get("system_id", "").strip()
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

            airing_type_val = clean_value(row_data.get("airing_type"))
            ep_total_val = clean_value(row_data.get("ep_total"), int)
            if airing_type_val and airing_type_val.lower() == "movie":
                if ep_total_val != 1:
                    ep_total_val = 1
                    if "ep_total" in headers:
                        col_idx = len(headers) - headers[::-1].index("ep_total")
                        cells_to_update.append(
                            gspread.Cell(row=idx, col=col_idx, value=1)
                        )

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
                        continue

                    current_val = getattr(existing_entry, key)
                    if current_val != value:
                        setattr(existing_entry, key, value)
                        is_modified = True

                if is_modified:
                    existing_entry.updated_at = get_taipei_now()
                    updated_count += 1
                    updated_items.append(
                        f"Anime: {existing_entry.series_season_cn or existing_entry.series_en}"
                    )
            else:
                new_entry = AnimeEntry(**entry_data)
                new_entry.created_at = get_taipei_now()
                new_entry.updated_at = get_taipei_now()
                db.add(new_entry)
                added_count += 1
                added_items.append(
                    f"Anime: {new_entry.series_season_cn or new_entry.series_en}"
                )

        all_db_anime = db.query(AnimeEntry).all()
        for db_a in all_db_anime:
            if db_a.system_id not in valid_anime_ids:
                print(
                    f"Auto-deleting orphaned Anime from DB: {db_a.series_season_cn or db_a.series_en} ({db_a.system_id})"
                )
                deleted_items.append(
                    f"Anime: {db_a.series_season_cn or db_a.series_en}"
                )
                db.delete(db_a)
                deleted_count += 1

        if cells_to_update:
            chunk_size = 50
            for i in range(0, len(cells_to_update), chunk_size):
                chunk = cells_to_update[i : i + chunk_size]
                execute_with_retry(
                    worksheet.update_cells, chunk, value_input_option="USER_ENTERED"
                )

        db.commit()
        print(
            f"✅ PostgreSQL Sync Complete! Added: {added_count} | Updated: {updated_count} | Deleted: {deleted_count}"
        )

        enriched_count = enrich_anime_database(db, worksheet)
        if enriched_count > 0:
            print(f"✨ Successfully enriched {enriched_count} anime with MAL Data!")

        audit_trail = {
            "added": added_items,
            "updated": updated_items,
            "deleted": deleted_items,
        }

        log_sync_event(
            db,
            sync_type=sync_type,
            status="success",
            added=added_count,
            updated=updated_count,
            deleted=deleted_count,
            details_json=json.dumps(audit_trail, ensure_ascii=False),
        )

        try:
            purged = cleanup_old_logs(db, days_to_keep=30)
            if purged > 0:
                print(f"🧹 Auto-cleanup: Removed {purged} old sync logs.")
        except Exception as cleanup_error:
            print(f"⚠️ Failed to auto-cleanup old logs: {cleanup_error}")

        return {
            "status": "success",
            "rows_updated": added_count + updated_count,
            "rows_deleted": deleted_count,
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
