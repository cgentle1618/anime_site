import re
import time
import uuid
import requests
import gspread
from datetime import datetime
from gspread.exceptions import APIError, WorksheetNotFound
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import SessionLocal, AnimeEntry, AnimeSeries, SyncLog

# ==========================================
# 1. API & GOOGLE SHEETS HELPERS
# ==========================================


def execute_with_retry(func, *args, max_retries=3, **kwargs):
    """
    Executes a Google Sheets API call with exponential backoff.
    Crucial for handling '429 Quota Exceeded' errors safely without crashing.
    """
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except APIError as e:
            if "429" in str(e):
                wait_time = 60 * (attempt + 1)
                print(
                    f"⚠️ Google API Quota Exceeded (429). Pausing for {wait_time}s (Attempt {attempt + 1}/{max_retries})..."
                )
                time.sleep(wait_time)
            else:
                raise e
    raise Exception(
        f"Failed to execute {func.__name__} after {max_retries} retries due to strict quota limits."
    )


def get_google_spreadsheet():
    """Authenticates with Google and returns the entire Spreadsheet object."""
    gc = gspread.service_account(filename="credentials.json")
    return gc.open("Anime Database")


def get_google_sheet(sheet_name="Anime"):
    """Helper to get a specific tab."""
    return get_google_spreadsheet().worksheet(sheet_name)


def log_sync_event(
    db: Session,
    sync_type: str,
    status: str,
    added: int = 0,
    updated: int = 0,
    deleted: int = 0,
    error: str = None,
):
    """Logs the results of a sync operation to the database for the Admin Dashboard."""
    try:
        log_entry = SyncLog(
            sync_type=sync_type,
            status=status,
            rows_added=added,
            rows_updated=updated,
            rows_deleted=deleted,
            error_message=error,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️ Failed to write sync log to DB: {e}")


# ==========================================
# 2. DATA CLEANING & EXTRACTION
# ==========================================


def clean_value(val, expected_type=str):
    """Utility function to clean empty Google Sheets cells into None or correct types."""
    if val is None or str(val).strip() == "":
        return None

    val_str = str(val).strip()
    try:
        if expected_type == int:
            return int(float(val_str))
        if expected_type == float:
            return float(val_str)
    except ValueError:
        return None
    return val_str


def extract_mal_id(mal_link):
    """Extracts the integer ID from a MyAnimeList URL."""
    if not mal_link:
        return None
    match = re.search(r"myanimelist\.net/anime/(\d+)", str(mal_link))
    if match:
        return int(match.group(1))
    return None


def extract_season_from_title(title_en):
    """Extracts 'Season X' or 'Season X Part Y' from the English title."""
    if not title_en:
        return None
    match = re.search(r"(Season\s\d+(?:\sPart\s\d+)?)", str(title_en), re.IGNORECASE)
    if match:
        return match.group(1).title()
    return None


def extract_season_from_cn_title(title_cn):
    """Extracts '第X季' from the Chinese title and converts it to 'Season X'."""
    if not title_cn:
        return None
    match = re.search(r"第\s*([一二三四五六七八九十]+|\d+)\s*季", str(title_cn))
    if match:
        num_str = match.group(1)
        if num_str.isdigit():
            return f"Season {num_str}"
        cn_to_num = {
            "一": 1,
            "二": 2,
            "三": 3,
            "四": 4,
            "五": 5,
            "六": 6,
            "七": 7,
            "八": 8,
            "九": 9,
            "十": 10,
        }
        num = cn_to_num.get(num_str)
        if num:
            return f"Season {num}"
    return None


# ==========================================
# 3. GOOGLE SHEETS TAB MANAGEMENT
# ==========================================


def populate_anime_series_tab(spreadsheet, anime_row_dicts):
    """
    Scans the main Anime tab, extracts unique franchises by series_en,
    and auto-populates the 'Anime Series' tab.
    """
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

    # 1. Check existing rows
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

    # 2. Extract unique series from the main Anime tab
    new_series_to_append = []

    for a_dict in anime_row_dicts:
        s_en = clean_value(a_dict.get("series_en"))
        if not s_en:
            continue

        if s_en.lower() not in existing_series_tracker:
            existing_series_tracker.add(s_en.lower())
            new_row = []
            for h in headers:
                if h == "system_id":
                    new_row.append(str(uuid.uuid4()))
                elif h == "series_en":
                    new_row.append(s_en)
                else:
                    new_row.append("")

            new_series_to_append.append(new_row)

    if new_series_to_append:
        print(
            f"Discovered {len(new_series_to_append)} new unique series! Appending to 'Anime Series' tab..."
        )
        execute_with_retry(series_sheet.append_rows, new_series_to_append)
    else:
        print("No new series to add to 'Anime Series' tab. All up to date.")


# ==========================================
# 4. EXTERNAL API ENRICHMENT (JIKAN / MAL)
# ==========================================


def fetch_mal_data(mal_id):
    """Hits the Jikan API to grab the Key Visual, MAL Score, and MAL Rank."""
    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}"
        response = requests.get(url)

        if response.status_code == 200:
            data = response.json().get("data", {})
            image_url = data.get("images", {}).get("jpg", {}).get("large_image_url")
            score = data.get("score")
            rank = data.get("rank")
            rank_str = str(rank) if rank is not None else "N/A"

            return {
                "cover_image_url": image_url,
                "mal_rating": score,
                "mal_rank": rank_str,
            }
        elif response.status_code == 429:
            print(f"⚠️ Jikan Rate Limit hit while fetching ID {mal_id}.")
            return None
    except Exception as e:
        print(f"❌ Failed to fetch Jikan data for ID {mal_id}: {e}")
    return None


def enrich_anime_database(db: Session, worksheet):
    """
    Finds ALL anime with a mal_id but missing cover image, mal_rating, OR mal_rank and fetches them.
    Skips fetching ratings/ranks if the show is 'Not Yet Aired'.
    Batches API updates back to Google Sheets to save quota limits.
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
            time.sleep(1.5)  # Rate limiting

    if cells_to_update:
        execute_with_retry(
            worksheet.update_cells, cells_to_update, value_input_option="USER_ENTERED"
        )

    db.commit()
    return enriched_count


# ==========================================
# 5. CRUD GOOGLE SHEETS ACTIONS
# ==========================================


def append_new_anime(anime_data: dict):
    """Appends a new manually created anime entry directly to the Google Sheet."""
    sheet = get_google_sheet("Anime")
    headers = execute_with_retry(sheet.row_values, 1)

    new_row = []
    for header in headers:
        val = anime_data.get(header, "")
        new_row.append(val if val is not None else "")

    print(
        f"Appending new row with system_id {anime_data.get('system_id')} to Google Sheets..."
    )
    execute_with_retry(sheet.append_row, new_row, value_input_option="USER_ENTERED")
    return True


def append_new_series(series_data: dict):
    """Appends a completely new Franchise/Series directly to the 'Anime Series' Google Sheet with Duplicate Checks."""
    try:
        sheet = execute_with_retry(get_google_spreadsheet().worksheet, "Anime Series")
    except WorksheetNotFound:
        print("⚠️ 'Anime Series' tab not found! Cannot append new series.")
        return False

    headers = execute_with_retry(sheet.row_values, 1)

    series_en_to_add = series_data.get("series_en", "").strip()
    if series_en_to_add:
        try:
            en_col_idx = headers.index("series_en")
            existing_en_names = execute_with_retry(sheet.col_values, en_col_idx + 1)

            if any(
                series_en_to_add.lower() == existing.strip().lower()
                for existing in existing_en_names[1:]
            ):
                print(
                    f"⚠️ Series '{series_en_to_add}' already exists in Google Sheets. Skipping duplicate append."
                )
                return True
        except ValueError:
            pass

    new_row = []
    for header in headers:
        val = series_data.get(header, "")
        new_row.append(val if val is not None else "")

    print(f"Appending new series '{series_en_to_add}' to Google Sheets...")
    execute_with_retry(sheet.append_row, new_row, value_input_option="USER_ENTERED")
    return True


def update_anime_row(system_id: str, update_data: dict):
    """Overwrites an existing anime row in Google Sheets matched by system_id."""
    sheet = get_google_sheet("Anime")
    values = execute_with_retry(sheet.get_all_values)
    if not values:
        raise ValueError("Anime sheet is empty.")

    headers = values[0]
    try:
        sys_id_idx = headers.index("system_id")
    except ValueError:
        raise ValueError("system_id column not found in Anime sheet.")

    row_idx = None
    for i, row in enumerate(values):
        if len(row) > sys_id_idx and row[sys_id_idx] == system_id:
            row_idx = i + 1
            break

    if not row_idx:
        raise ValueError(f"Anime with system_id '{system_id}' not found in Sheets.")

    new_row = []
    for header in headers:
        val = update_data.get(header, "")
        new_row.append(val if val is not None else "")

    print(f"Updating row {row_idx} for anime {system_id} in Google Sheets...")
    try:
        execute_with_retry(
            sheet.update,
            values=[new_row],
            range_name=f"A{row_idx}",
            value_input_option="USER_ENTERED",
        )
    except TypeError:
        execute_with_retry(
            sheet.update, f"A{row_idx}", [new_row], value_input_option="USER_ENTERED"
        )
    return True


def delete_anime_row(system_id: str):
    """Deletes an entire anime row from Google Sheets matched by system_id."""
    sheet = get_google_sheet("Anime")
    values = execute_with_retry(sheet.get_all_values)
    if not values:
        raise ValueError("Anime sheet is empty.")

    headers = values[0]
    try:
        sys_id_idx = headers.index("system_id")
    except ValueError:
        raise ValueError("system_id column not found in Anime sheet.")

    row_idx = None
    for i, row in enumerate(values):
        if len(row) > sys_id_idx and row[sys_id_idx] == system_id:
            row_idx = i + 1
            break

    if not row_idx:
        raise ValueError(f"Anime with system_id '{system_id}' not found in Sheets.")

    print(f"Deleting row {row_idx} for anime {system_id} from Google Sheets...")
    execute_with_retry(sheet.delete_rows, row_idx)
    return True


def update_series_row(system_id: str, update_data: dict):
    """Overwrites an existing series row in Google Sheets matched by system_id."""
    try:
        sheet = execute_with_retry(get_google_spreadsheet().worksheet, "Anime Series")
    except Exception:
        raise ValueError("Anime Series tab not found.")

    values = execute_with_retry(sheet.get_all_values)
    if not values:
        raise ValueError("Anime Series sheet is empty.")

    headers = values[0]
    try:
        sys_id_idx = headers.index("system_id")
    except ValueError:
        raise ValueError("system_id column not found in Anime Series sheet.")

    row_idx = None
    for i, row in enumerate(values):
        if len(row) > sys_id_idx and row[sys_id_idx] == system_id:
            row_idx = i + 1
            break

    if not row_idx:
        raise ValueError(f"Series with system_id '{system_id}' not found in Sheets.")

    new_row = []
    for header in headers:
        val = update_data.get(header, "")
        new_row.append(val if val is not None else "")

    print(f"Updating row {row_idx} for series {system_id} in Google Sheets...")
    try:
        execute_with_retry(
            sheet.update,
            values=[new_row],
            range_name=f"A{row_idx}",
            value_input_option="USER_ENTERED",
        )
    except TypeError:
        execute_with_retry(
            sheet.update, f"A{row_idx}", [new_row], value_input_option="USER_ENTERED"
        )
    return True


def delete_series_row(system_id: str):
    """Deletes an entire series row from Google Sheets matched by system_id."""
    try:
        sheet = execute_with_retry(get_google_spreadsheet().worksheet, "Anime Series")
    except Exception:
        raise ValueError("Anime Series tab not found.")

    values = execute_with_retry(sheet.get_all_values)
    if not values:
        raise ValueError("Anime Series sheet is empty.")

    headers = values[0]
    try:
        sys_id_idx = headers.index("system_id")
    except ValueError:
        raise ValueError("system_id column not found in Anime Series sheet.")

    row_idx = None
    for i, row in enumerate(values):
        if len(row) > sys_id_idx and row[sys_id_idx] == system_id:
            row_idx = i + 1
            break

    if not row_idx:
        raise ValueError(f"Series with system_id '{system_id}' not found in Sheets.")

    print(f"Deleting row {row_idx} for series {system_id} from Google Sheets...")
    execute_with_retry(sheet.delete_rows, row_idx)
    return True


def detect_orphans(db: Session):
    """Scans Google Sheet and compares system_ids against DB. Returns IDs missing from Sheet."""
    worksheet = get_google_sheet("Anime")
    headers = execute_with_retry(worksheet.row_values, 1)

    try:
        sys_id_col = len(headers) - headers[::-1].index("system_id")
    except ValueError:
        print("Error: system_id column not found in Google Sheets.")
        return []

    sheet_sys_ids = execute_with_retry(worksheet.col_values, sys_id_col)
    sheet_sys_ids_set = {sid.strip() for sid in sheet_sys_ids[1:] if sid.strip()}

    db_entries = db.query(AnimeEntry.system_id).all()
    db_sys_ids_set = {entry[0] for entry in db_entries}

    orphans = list(db_sys_ids_set - sheet_sys_ids_set)
    return orphans


def update_anime_field_in_sheet(system_id: str, field_name: str, value):
    """Dynamically updates a single field for a specific system_id."""
    sheet = get_google_sheet("Anime")

    cell = execute_with_retry(sheet.find, system_id)
    if not cell:
        raise ValueError(f"system_id {system_id} not found in Google Sheet.")

    headers = execute_with_retry(sheet.row_values, 1)
    try:
        col_index = len(headers) - headers[::-1].index(field_name)
    except ValueError:
        raise ValueError(f"Column '{field_name}' not found in the header row.")

    execute_with_retry(
        sheet.update_cell, cell.row, col_index, value if value is not None else ""
    )
    return True


# ==========================================
# 6. MAIN SYNC LOGIC (WITH DIFF/TIMESTAMPS)
# ==========================================


def sync_sheet_to_db(db_session: Session = None, sync_type: str = "cron"):
    print(f"Starting Google Sheets Sync ({sync_type})...")

    db = db_session if db_session else SessionLocal()
    added_count = 0
    updated_count = 0

    try:
        spreadsheet = get_google_spreadsheet()
        worksheet = execute_with_retry(spreadsheet.worksheet, "Anime")

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

        # 1. Populate 'Anime Series' tab
        populate_anime_series_tab(spreadsheet, anime_row_dicts)

        # 2. Sync Anime Series Tab to PostgreSQL (With Timestamp & Diff logic)
        print("\n--- Syncing Anime Series Tab to PostgreSQL ---")
        try:
            series_sheet = execute_with_retry(spreadsheet.worksheet, "Anime Series")
            series_rows = execute_with_retry(series_sheet.get_all_values)
            if series_rows and len(series_rows) > 1:
                s_headers = series_rows[0]
                for s_row in series_rows[1:]:
                    padded_s_row = s_row + [""] * (len(s_headers) - len(s_row))
                    s_dict = dict(zip(s_headers, padded_s_row))

                    s_sys_id = s_dict.get("system_id", "").strip()
                    if not s_sys_id:
                        continue

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
                            existing_s.updated_at = datetime.utcnow()
                    else:
                        new_s = AnimeSeries(**s_entry_data)
                        new_s.created_at = datetime.utcnow()
                        new_s.updated_at = datetime.utcnow()
                        db.add(new_s)
        except Exception as e:
            print(f"⚠️ Error syncing Anime Series tab to DB: {e}")

        # 3. Sync Main Anime Tab to PostgreSQL (With Timestamp & Diff logic)
        print("\n--- Syncing Main Anime Tab to PostgreSQL ---")
        cells_to_update = []

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

            # MAL ID Extraction
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

            # Season Extraction Logic
            series_season_val = row_data.get("series_season", "")
            if not series_season_val or str(series_season_val).strip() == "":
                extracted_season = extract_season_from_title(
                    row_data.get("series_season_en", "")
                )
                if not extracted_season:
                    extracted_season = extract_season_from_cn_title(
                        row_data.get("series_season_cn", "")
                    )
                if (
                    not extracted_season
                    and clean_value(row_data.get("series_en"))
                    and series_counts.get(clean_value(row_data.get("series_en"))) == 1
                ):
                    extracted_season = "Season 1"

                if extracted_season:
                    series_season_val = extracted_season
                    if "series_season" in headers:
                        col_idx = len(headers) - headers[::-1].index("series_season")
                        cells_to_update.append(
                            gspread.Cell(row=idx, col=col_idx, value=extracted_season)
                        )

            # Movie Episode Total Logic
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

            # Completed Auto-Match Logic
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
                    existing_entry.updated_at = datetime.utcnow()
                    updated_count += 1
            else:
                new_entry = AnimeEntry(**entry_data)
                new_entry.created_at = datetime.utcnow()
                new_entry.updated_at = datetime.utcnow()
                db.add(new_entry)
                added_count += 1

        if cells_to_update:
            chunk_size = 50
            for i in range(0, len(cells_to_update), chunk_size):
                chunk = cells_to_update[i : i + chunk_size]
                execute_with_retry(
                    worksheet.update_cells, chunk, value_input_option="USER_ENTERED"
                )

        db.commit()
        print(
            f"✅ PostgreSQL Sync Complete! Added: {added_count} | Updated: {updated_count}"
        )

        # 4. ENRICH ALL MISSING DATA
        enriched_count = enrich_anime_database(db, worksheet)
        if enriched_count > 0:
            print(f"✨ Successfully enriched {enriched_count} anime with MAL Data!")

        log_sync_event(
            db,
            sync_type=sync_type,
            status="success",
            added=added_count,
            updated=updated_count,
        )

        return {
            "status": "success",
            "rows_updated": added_count + updated_count,
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
