import time
import uuid
import gspread
from gspread.exceptions import APIError
from sqlalchemy.orm import Session
from database import SessionLocal, AnimeEntry


def get_google_sheet():
    """Authenticates with Google and returns the specific worksheet."""
    gc = gspread.service_account(filename="credentials.json")

    # 2. Open the spreadsheet by its exact name
    # ⚠️ CHANGE "Anime Database" to the exact name of your Google Sheet file if it's different!
    spreadsheet = gc.open("Anime Database")

    # 3. Select the specific tab/worksheet
    # ⚠️ CHANGE "Anime" to the exact name of the tab at the bottom of your screen if it's different!
    worksheet = spreadsheet.worksheet("Anime")

    return worksheet


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


def sync_sheet_to_db():
    print("Starting Google Sheets Sync...")

    # 1. Connect to Google Sheets
    worksheet = get_google_sheet()

    print("Fetching data from Google Sheets...")
    rows = worksheet.get_all_values()
    if not rows:
        print("No data found.")
        return

    headers = rows[0]
    db: Session = SessionLocal()

    updated_count = 0
    added_count = 0

    # We will store all our Google Sheets cell updates here to do them in ONE batch
    cells_to_update = []

    try:
        # start=2 because row 1 is headers, row 2 is the first data row
        for idx, row in enumerate(rows[1:], start=2):
            row = row + [""] * (len(headers) - len(row))
            row_data = dict(zip(headers, row))

            system_id = row_data.get("system_id", "").strip()

            # 2. UUID Generation (Queued for Batch Update)
            if not system_id:
                system_id = str(uuid.uuid4())
                print(f"Row {idx}: Missing system_id. Generating new UUID: {system_id}")

                # Instead of updating immediately, we queue the Cell object
                cells_to_update.append(gspread.Cell(row=idx, col=1, value=system_id))
                row_data["system_id"] = system_id

            # 3. Data Mapping & Cleaning
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
                "mal_id": clean_value(row_data.get("mal_id"), int),
                "mal_link": clean_value(row_data.get("mal_link")),
                "anilist_link": clean_value(row_data.get("anilist_link")),
                "op": clean_value(row_data.get("op")),
                "ed": clean_value(row_data.get("ed")),
                "insert_ost": clean_value(row_data.get("insert_ost")),
                "seiyuu": clean_value(row_data.get("seiyuu")),
                "source_baha": clean_value(row_data.get("source_baha")),
                "source_netflix": clean_value(row_data.get("source_netflix")),
            }

            # 4. Upsert (Update or Insert) into PostgreSQL
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

        # 5. Execute the Google Sheets Batch Update with Retry Logic
        if cells_to_update:
            print(
                f"\nSending batch update to Google Sheets for {len(cells_to_update)} rows..."
            )
            max_retries = 3

            for attempt in range(max_retries):
                try:
                    worksheet.update_cells(cells_to_update)
                    print("✅ Successfully wrote all UUIDs to Google Sheets!")
                    break  # Break out of the retry loop if successful
                except APIError as e:
                    if "429" in str(e):
                        wait_time = 60 * (
                            attempt + 1
                        )  # Exponentially wait longer: 60s, 120s, 180s...
                        print(
                            f"⚠️ Quota exceeded! Waiting {wait_time} seconds before retry {attempt + 1}/{max_retries}..."
                        )
                        time.sleep(wait_time)
                    else:
                        raise e  # If it's a different error, crash normally

        # Finally, commit the PostgreSQL database changes
        db.commit()
        print(
            f"\n✅ PostgreSQL Sync Complete! Added: {added_count} | Updated: {updated_count}"
        )

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during sync: {e}")
    finally:
        db.close()


def update_episode_progress_in_sheet(system_id: str, ep_fin: int):
    """Finds a specific system_id in Google Sheets and updates its ep_fin column."""
    sheet = get_google_sheet()

    # 1. Find the row with the matching system_id
    cell = sheet.find(system_id)
    if not cell:
        raise ValueError(f"system_id {system_id} not found in Google Sheet.")
    row_index = cell.row

    # 2. Find the column index for 'ep_fin' dynamically
    headers = sheet.row_values(1)
    try:
        col_index = headers.index("ep_fin") + 1  # gspread is 1-indexed
    except ValueError:
        raise ValueError("Column 'ep_fin' not found in the header row.")

    # 3. Update that specific cell
    sheet.update_cell(row_index, col_index, ep_fin)
    return True


if __name__ == "__main__":
    sync_sheet_to_db()
