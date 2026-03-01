import re
import time
import uuid
import requests
import gspread
from gspread.exceptions import APIError, WorksheetNotFound
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import SessionLocal, AnimeEntry

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


# ==========================================
# 2. DATA CLEANING & EXTRACTION
# ==========================================


def clean_value(val, expected_type=str):
    """Utility function to clean empty Google Sheets cells into None or correct types."""
    if not val or str(val).strip() == "":
        return None
    try:
        if expected_type == int:
            return int(val)
        if expected_type == float:
            return float(val)
    except ValueError:
        return None
    return str(val).strip()


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
    # Regex matches "Season <number>" optionally followed by " Part <number>"
    match = re.search(r"(Season\s\d+(?:\sPart\s\d+)?)", str(title_en), re.IGNORECASE)
    if match:
        # Capitalize properly (e.g. "Season 2 Part 1")
        return match.group(1).title()
    return None


def extract_season_from_cn_title(title_cn):
    """Extracts '第X季' from the Chinese title and converts it to 'Season X'."""
    if not title_cn:
        return None

    # Matches '第' followed by Chinese numerals (一 to 十) or Arabic numerals, then '季'
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

    sys_id_col = headers.index("system_id") if "system_id" in headers else 0
    en_col = headers.index("series_en") if "series_en" in headers else 1

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
            existing_series_tracker.add(s_en)

    if cells_to_update:
        print(
            f"Updating {len(cells_to_update)} missing system_ids in 'Anime Series' tab..."
        )
        execute_with_retry(series_sheet.update_cells, cells_to_update)

    # 2. Extract unique series from the main Anime tab (using only series_en now)
    new_series_to_append = []

    for a_dict in anime_row_dicts:
        s_en = clean_value(a_dict.get("series_en"))

        # Skip if there's no overarching series name
        if not s_en:
            continue

        if s_en not in existing_series_tracker:
            existing_series_tracker.add(s_en)

            new_row = []
            for h in headers:
                if h == "system_id":
                    new_row.append(str(uuid.uuid4()))
                elif h == "series_en":
                    new_row.append(s_en)
                else:
                    new_row.append("")  # Leave other fields blank for manual entry

            new_series_to_append.append(new_row)

    # 3. Append new unique series
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
    """Hits the Jikan API to grab the Key Visual and MAL Score."""
    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}"
        response = requests.get(url)

        if response.status_code == 200:
            data = response.json().get("data", {})
            image_url = data.get("images", {}).get("jpg", {}).get("large_image_url")
            score = data.get("score")
            return {"cover_image_url": image_url, "mal_rating": score}
        elif response.status_code == 429:
            print(f"⚠️ Jikan Rate Limit hit while fetching ID {mal_id}.")
            return None
    except Exception as e:
        print(f"❌ Failed to fetch Jikan data for ID {mal_id}: {e}")
    return None


def enrich_anime_database(db: Session):
    """
    Finds ALL anime with a mal_id but missing cover image OR mal_rating, and fetches them.
    Skips fetching if ONLY mal_rating is missing but the show is 'Not Yet Aired'.
    Warning: This will take a while if the database is mostly empty due to rate limits.
    """
    anime_to_enrich = (
        db.query(AnimeEntry)
        .filter(
            AnimeEntry.mal_id.isnot(None),
            or_(
                AnimeEntry.cover_image_url.is_(None),
                and_(
                    AnimeEntry.mal_rating.is_(None),
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
    print(
        "This may take a while depending on the amount. Please do not close the terminal."
    )

    enriched_count = 0

    for anime in anime_to_enrich:
        print(f"Fetching data for MAL ID {anime.mal_id}...")
        mal_data = fetch_mal_data(anime.mal_id)

        if mal_data:
            if mal_data["cover_image_url"]:
                anime.cover_image_url = mal_data["cover_image_url"]
            if mal_data["mal_rating"]:
                anime.mal_rating = mal_data["mal_rating"]
            enriched_count += 1

        # MANDATORY JIKAN RATE LIMIT SLEEP (Max 3 requests per second allowed, 2 seconds is safe)
        time.sleep(2)

    db.commit()
    return enriched_count


# ==========================================
# 5. MAIN SYNC LOGIC
# ==========================================


def sync_sheet_to_db(db_session: Session = None):
    print("Starting Google Sheets Sync...")

    spreadsheet = get_google_spreadsheet()
    worksheet = execute_with_retry(spreadsheet.worksheet, "Anime")

    print("Fetching data from main Anime tab...")
    rows = execute_with_retry(worksheet.get_all_values)
    if not rows:
        print("No data found.")
        return

    headers = rows[0]

    # 1. Transform raw rows into dictionaries and count series
    anime_row_dicts = []
    series_counts = {}

    for row in rows[1:]:
        padded_row = row + [""] * (len(headers) - len(row))
        row_dict = dict(zip(headers, padded_row))
        anime_row_dicts.append(row_dict)

        # Track how many times each series_en appears
        s_en = clean_value(row_dict.get("series_en"))
        if s_en:
            series_counts[s_en] = series_counts.get(s_en, 0) + 1

    # 2. Automatically populate the new Anime Series tab!
    populate_anime_series_tab(spreadsheet, anime_row_dicts)

    # 3. Resume Postgres Database Sync Operations for Main Anime Tab
    print("\n--- Syncing Main Anime Tab to PostgreSQL ---")
    db = db_session if db_session else SessionLocal()

    updated_count = 0
    added_count = 0
    cells_to_update = []

    try:
        for idx, row_data in enumerate(anime_row_dicts, start=2):
            system_id = row_data.get("system_id", "").strip()
            if not system_id:
                system_id = str(uuid.uuid4())
                print(f"Row {idx}: Missing system_id. Generating new UUID: {system_id}")
                if "system_id" in headers:
                    col_idx = headers.index("system_id") + 1
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
                    print(f"Row {idx}: Extracted MAL ID {extracted_id} from link.")
                    if "mal_id" in headers:
                        col_idx = headers.index("mal_id") + 1
                        cells_to_update.append(
                            gspread.Cell(row=idx, col=col_idx, value=extracted_id)
                        )

            # --- NEW: Season Extraction Logic with Count check ---
            series_season_val = row_data.get("series_season", "")
            series_season_en_val = row_data.get("series_season_en", "")
            series_season_cn_val = row_data.get("series_season_cn", "")
            series_en_val = clean_value(row_data.get("series_en"))

            # Only auto-extract if the season cell is currently empty
            if not series_season_val or str(series_season_val).strip() == "":

                # Try English first
                extracted_season = extract_season_from_title(series_season_en_val)

                # If English fails, try Chinese
                if not extracted_season:
                    extracted_season = extract_season_from_cn_title(
                        series_season_cn_val
                    )

                # If regex fails completely, but this is the ONLY entry for this franchise, default to "Season 1"
                if (
                    not extracted_season
                    and series_en_val
                    and series_counts.get(series_en_val) == 1
                ):
                    extracted_season = "Season 1"

                if extracted_season:
                    series_season_val = extracted_season
                    print(f"Row {idx}: Set season '{extracted_season}'.")
                    if "series_season" in headers:
                        col_idx = headers.index("series_season") + 1
                        cells_to_update.append(
                            gspread.Cell(row=idx, col=col_idx, value=extracted_season)
                        )

            # --- NEW: Movie Episode Total Logic ---
            airing_type_val = clean_value(row_data.get("airing_type"))
            ep_total_val = clean_value(row_data.get("ep_total"), int)

            if airing_type_val and airing_type_val.lower() == "movie":
                if ep_total_val != 1:
                    ep_total_val = 1
                    print(f"Row {idx}: Set ep_total to 1 because airing_type is Movie.")
                    if "ep_total" in headers:
                        col_idx = headers.index("ep_total") + 1
                        cells_to_update.append(
                            gspread.Cell(row=idx, col=col_idx, value=1)
                        )

            # Updated mapping
            entry_data = {
                "system_id": system_id,
                "series_en": clean_value(row_data.get("series_en")),
                "series_season_en": clean_value(row_data.get("series_season_en")),
                "series_season_roman": clean_value(row_data.get("series_season_roman")),
                "series_season_cn": clean_value(row_data.get("series_season_cn")),
                "series_season": clean_value(series_season_val),
                "airing_type": airing_type_val,
                "my_progress": clean_value(row_data.get("my_progress")),
                "airing_status": clean_value(row_data.get("airing_status")),
                "ep_total": ep_total_val,
                "ep_fin": clean_value(row_data.get("ep_fin"), int),
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
                "mal_link": clean_value(mal_link_val),
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
                for key, value in entry_data.items():
                    # Preserve API fetched data like covers and ratings
                    if (
                        key in ["cover_image_url", "mal_rating"]
                        and getattr(existing_entry, key) is not None
                    ):
                        continue
                    setattr(existing_entry, key, value)
                updated_count += 1
            else:
                new_entry = AnimeEntry(**entry_data)
                db.add(new_entry)
                added_count += 1

        if cells_to_update:
            print(
                f"Sending batch update to Google Sheets for {len(cells_to_update)} rows..."
            )
            chunk_size = 50
            for i in range(0, len(cells_to_update), chunk_size):
                chunk = cells_to_update[i : i + chunk_size]
                execute_with_retry(worksheet.update_cells, chunk)

        db.commit()
        print(
            f"✅ PostgreSQL Sync Complete! Added: {added_count} | Updated: {updated_count}"
        )

        # --- 4. ENRICH ALL MISSING DATA ---
        enriched_count = enrich_anime_database(db)
        if enriched_count > 0:
            print(f"✨ Successfully enriched {enriched_count} anime with MAL Data!")

        return {
            "status": "success",
            "rows_updated": added_count + updated_count,
            "enriched_count": enriched_count,
        }

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during sync: {e}")
        raise e
    finally:
        if not db_session:
            db.close()


def update_episode_progress_in_sheet(system_id: str, ep_fin: int):
    """Finds a specific system_id in Google Sheets and updates its ep_fin column."""
    sheet = get_google_sheet("Anime")

    cell = execute_with_retry(sheet.find, system_id)
    if not cell:
        raise ValueError(f"system_id {system_id} not found in Google Sheet.")

    headers = execute_with_retry(sheet.row_values, 1)
    try:
        col_index = headers.index("ep_fin") + 1
    except ValueError:
        raise ValueError("Column 'ep_fin' not found in the header row.")

    execute_with_retry(sheet.update_cell, cell.row, col_index, ep_fin)
    return True


if __name__ == "__main__":
    sync_sheet_to_db()
