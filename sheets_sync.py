import re
import time
import uuid
import gspread
from gspread.exceptions import APIError
from sqlalchemy.orm import Session
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
                wait_time = 60 * (attempt + 1)  # Waits 60s, then 120s, etc.
                print(
                    f"⚠️ Google API Quota Exceeded (429). Pausing for {wait_time}s (Attempt {attempt + 1}/{max_retries})..."
                )
                time.sleep(wait_time)
            else:
                raise e
    raise Exception(
        f"Failed to execute {func.__name__} after {max_retries} retries due to strict quota limits."
    )


def get_google_sheet():
    """Authenticates with Google and returns the specific worksheet."""
    gc = gspread.service_account(filename="credentials.json")
    return gc.open("Anime Database").worksheet("Anime")


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


# ==========================================
# 3. MAIN SYNC LOGIC
# ==========================================


# Fixed signature to accept an optional 'db_session' to prevent the positional argument crash
def sync_sheet_to_db(db_session: Session = None):
    print("Starting Google Sheets Sync...")

    worksheet = get_google_sheet()

    print("Fetching data from Google Sheets...")
    # Protected with retry logic
    rows = execute_with_retry(worksheet.get_all_values)
    if not rows:
        print("No data found.")
        return

    headers = rows[0]

    # Use the passed session if it exists, otherwise create a new one
    db = db_session if db_session else SessionLocal()

    updated_count = 0
    added_count = 0
    cells_to_update = []

    try:
        for idx, row in enumerate(rows[1:], start=2):
            row = row + [""] * (len(headers) - len(row))
            row_data = dict(zip(headers, row))

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

            entry_data = {
                "system_id": system_id,
                "series_en": clean_value(row_data.get("series_en")),
                "series_roman": clean_value(row_data.get("series_roman")),
                "series_cn": clean_value(row_data.get("series_cn")),
                "series_season_en": clean_value(row_data.get("series_season_en")),
                "series_season_roman": clean_value(row_data.get("series_season_roman")),
                "series_season_cn": clean_value(row_data.get("series_season_cn")),
                "alt_name": clean_value(row_data.get("alt_name")),
                "airing_type": clean_value(row_data.get("airing_type")),
                "my_progress": clean_value(row_data.get("my_progress")),
                "airing_status": clean_value(row_data.get("airing_status")),
                "ep_total": clean_value(row_data.get("ep_total"), int),
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
                    setattr(existing_entry, key, value)
                updated_count += 1
            else:
                new_entry = AnimeEntry(**entry_data)
                db.add(new_entry)
                added_count += 1

        if cells_to_update:
            print(
                f"\nSending batch update to Google Sheets for {len(cells_to_update)} rows..."
            )
            # Protected with chunking and retry logic to prevent 429 errors
            chunk_size = 50
            for i in range(0, len(cells_to_update), chunk_size):
                chunk = cells_to_update[i : i + chunk_size]
                execute_with_retry(worksheet.update_cells, chunk)

        db.commit()
        print(
            f"\n✅ PostgreSQL Sync Complete! Added: {added_count} | Updated: {updated_count}"
        )
        return {"status": "success", "rows_updated": added_count + updated_count}

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during sync: {e}")
        raise e
    finally:
        # Only close if we created the session locally (prevents closing FastAPI's dependency session)
        if not db_session:
            db.close()


def update_episode_progress_in_sheet(system_id: str, ep_fin: int):
    """Finds a specific system_id in Google Sheets and updates its ep_fin column."""
    sheet = get_google_sheet()

    # Protected with retry logic
    cell = execute_with_retry(sheet.find, system_id)
    if not cell:
        raise ValueError(f"system_id {system_id} not found in Google Sheet.")

    headers = execute_with_retry(sheet.row_values, 1)
    try:
        col_index = headers.index("ep_fin") + 1
    except ValueError:
        raise ValueError("Column 'ep_fin' not found in the header row.")

    # Protected with retry logic
    execute_with_retry(sheet.update_cell, cell.row, col_index, ep_fin)
    return True


if __name__ == "__main__":
    sync_sheet_to_db()
