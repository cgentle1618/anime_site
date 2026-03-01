import re
import time
import uuid
import requests
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
    Crucial for handling '429 Quota Exceeded' errors safely.
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
# 3. ETL PROCESSING LOGIC
# ==========================================


def process_row_data(row_index, row_dict, header_map):
    """
    Processes a single row from Google Sheets.
    Handles UUID generation, MAL ID extraction, and formats the dictionary for SQLAlchemy.
    Returns: (cleaned_entry_dict, list_of_cells_to_update_in_sheets)
    """
    cells_to_update = []

    system_id = row_dict.get("system_id", "").strip()
    if not system_id:
        system_id = str(uuid.uuid4())
        print(f"Row {row_index}: Missing system_id. Generating new UUID: {system_id}")
        if "system_id" in header_map:
            cells_to_update.append(
                gspread.Cell(
                    row=row_index, col=header_map["system_id"], value=system_id
                )
            )

    mal_id_val = row_dict.get("mal_id", "")
    mal_link_val = row_dict.get("mal_link", "")

    if (not mal_id_val or str(mal_id_val).strip() == "") and mal_link_val:
        extracted_id = extract_mal_id(mal_link_val)
        if extracted_id:
            mal_id_val = extracted_id
            print(f"Row {row_index}: Extracted MAL ID {extracted_id} from link.")
            if "mal_id" in header_map:
                cells_to_update.append(
                    gspread.Cell(
                        row=row_index, col=header_map["mal_id"], value=extracted_id
                    )
                )

    entry_data = {
        "system_id": system_id,
        "series_en": clean_value(row_dict.get("series_en")),
        "series_roman": clean_value(row_dict.get("series_roman")),
        "series_cn": clean_value(row_dict.get("series_cn")),
        "series_season_en": clean_value(row_dict.get("series_season_en")),
        "series_season_roman": clean_value(row_dict.get("series_season_roman")),
        "series_season_cn": clean_value(row_dict.get("series_season_cn")),
        "alt_name": clean_value(row_dict.get("alt_name")),
        "airing_type": clean_value(row_dict.get("airing_type")),
        "my_progress": clean_value(row_dict.get("my_progress")),
        "airing_status": clean_value(row_dict.get("airing_status")),
        "ep_total": clean_value(row_dict.get("ep_total"), int),
        "ep_fin": clean_value(row_dict.get("ep_fin"), int),
        "rating_mine": clean_value(row_dict.get("rating_mine")),
        "main_spinoff": clean_value(row_dict.get("main_spinoff")),
        "release_date": clean_value(row_dict.get("release_date")),
        "studio": clean_value(row_dict.get("studio")),
        "director": clean_value(row_dict.get("director")),
        "producer": clean_value(row_dict.get("producer")),
        "distributor_tw": clean_value(row_dict.get("distributor_tw")),
        "genre_main": clean_value(row_dict.get("genre_main")),
        "genre_sub": clean_value(row_dict.get("genre_sub")),
        "remark": clean_value(row_dict.get("remark")),
        "mal_id": clean_value(mal_id_val, int),
        "mal_link": clean_value(mal_link_val),
        "anilist_link": clean_value(row_dict.get("anilist_link")),
        "op": clean_value(row_dict.get("op")),
        "ed": clean_value(row_dict.get("ed")),
        "insert_ost": clean_value(row_dict.get("insert_ost")),
        "seiyuu": clean_value(row_dict.get("seiyuu")),
        "source_baha": clean_value(row_dict.get("source_baha")),
        "source_netflix": clean_value(row_dict.get("source_netflix")),
    }

    return entry_data, cells_to_update


def upsert_anime_entry(db: Session, entry_data: dict):
    """Updates an existing entry in PostgreSQL or creates a new one."""
    existing_entry = (
        db.query(AnimeEntry)
        .filter(AnimeEntry.system_id == entry_data["system_id"])
        .first()
    )

    if existing_entry:
        for key, value in entry_data.items():
            # Never overwrite existing external data (like cover images) if it was already fetched
            if (
                key in ["cover_image_url", "mal_rating"]
                and getattr(existing_entry, key) is not None
            ):
                continue
            setattr(existing_entry, key, value)
        return "updated"
    else:
        new_entry = AnimeEntry(**entry_data)
        db.add(new_entry)
        return "added"


# ==========================================
# 4. EXTERNAL API ENRICHMENT (JIKAN / MAL)
# ==========================================


def fetch_mal_key_visual(mal_id):
    """Hits the Jikan API to grab the highest quality Key Visual."""
    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}"
        response = requests.get(url)

        if response.status_code == 200:
            data = response.json().get("data", {})
            return data.get("images", {}).get("jpg", {}).get("large_image_url")
        elif response.status_code == 429:
            print(f"⚠️ Jikan Rate Limit hit while fetching ID {mal_id}.")
            return None
    except Exception as e:
        print(f"❌ Failed to fetch Jikan data for ID {mal_id}: {e}")
    return None


def enrich_anime_database(db: Session):
    """
    Finds ALL anime with a mal_id but no cover image, and fetches them.
    Warning: If you have 100 missing images, this will take ~200 seconds to complete
    due to mandatory rate-limit pacing.
    """
    anime_to_enrich = (
        db.query(AnimeEntry)
        .filter(AnimeEntry.mal_id.isnot(None), AnimeEntry.cover_image_url.is_(None))
        .all()
    )

    if not anime_to_enrich:
        return 0

    print(f"\n--- Fetching MAL Key Visuals for {len(anime_to_enrich)} anime ---")
    print(
        "This may take a while depending on the amount. Please do not close the terminal."
    )

    enriched_count = 0

    for anime in anime_to_enrich:
        print(f"Fetching cover for MAL ID {anime.mal_id}...")
        image_url = fetch_mal_key_visual(anime.mal_id)

        if image_url:
            anime.cover_image_url = image_url
            enriched_count += 1

        # MANDATORY JIKAN RATE LIMIT SLEEP (Max 3 requests per second allowed, 2 seconds is very safe)
        time.sleep(2)

    db.commit()
    return enriched_count


# ==========================================
# 5. MAIN SYNC CONTROLLERS
# ==========================================


def sync_sheet_to_db():
    """Main ETL Pipeline orchestrator."""
    print("Starting Google Sheets Sync...")

    worksheet = get_google_sheet()

    print("Fetching data from Google Sheets...")
    rows = execute_with_retry(worksheet.get_all_values)
    if not rows:
        print("No data found.")
        return

    headers = rows[0]
    header_map = {name: idx + 1 for idx, name in enumerate(headers)}

    db: Session = SessionLocal()
    updated_count = 0
    added_count = 0
    all_cells_to_update = []

    try:
        for idx, row in enumerate(rows[1:], start=2):
            row = row + [""] * (len(headers) - len(row))
            row_dict = dict(zip(headers, row))

            entry_data, cell_updates = process_row_data(idx, row_dict, header_map)
            all_cells_to_update.extend(cell_updates)

            action = upsert_anime_entry(db, entry_data)
            if action == "updated":
                updated_count += 1
            else:
                added_count += 1

        if all_cells_to_update:
            print(
                f"\nSending batch update to Google Sheets for {len(all_cells_to_update)} cells..."
            )
            chunk_size = 100
            for i in range(0, len(all_cells_to_update), chunk_size):
                chunk = all_cells_to_update[i : i + chunk_size]
                execute_with_retry(worksheet.update_cells, chunk)

        db.commit()
        print(
            f"\n✅ PostgreSQL Sync Complete! Added: {added_count} | Updated: {updated_count}"
        )

        # --- ENRICH ALL MISSING DATA ---
        enriched_count = enrich_anime_database(db)
        if enriched_count > 0:
            print(
                f"✨ Successfully enriched {enriched_count} anime with Key Visuals from MAL!"
            )

        return {
            "status": "success",
            "rows_updated": added_count + updated_count,
            "enriched_images": enriched_count,
        }

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during sync: {e}")
        raise e
    finally:
        db.close()


def update_episode_progress_in_sheet(system_id: str, ep_fin: int):
    """Finds a specific system_id in Google Sheets and updates its ep_fin column."""
    sheet = get_google_sheet()

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
