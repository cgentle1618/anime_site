"""
sheets_client.py
Handles direct communication with the Google Sheets API via gspread.
Includes retry logic for quota limits and raw CRUD operations.
"""

import time
import gspread
from gspread.exceptions import APIError, WorksheetNotFound
from typing import Callable, Any, Dict, List

# ==========================================
# CORE GOOGLE API HELPERS
# ==========================================


def execute_with_retry(func: Callable, *args, max_retries: int = 3, **kwargs) -> Any:
    """
    Executes a Google Sheets API call with exponential backoff.
    Crucial for handling '429 Quota Exceeded' errors safely without crashing the sync.
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


def get_google_spreadsheet() -> gspread.Spreadsheet:
    """Authenticates with Google using the service account and returns the main Spreadsheet object."""
    gc = gspread.service_account(filename="credentials.json")
    return gc.open("Anime Database")


def get_google_sheet(sheet_name: str = "Anime") -> gspread.Worksheet:
    """Helper to get a specific tab from the main spreadsheet."""
    return get_google_spreadsheet().worksheet(sheet_name)


# ==========================================
# CRUD OPERATIONS: ANIME
# ==========================================


def append_new_anime(anime_data: dict) -> bool:
    """Appends a new anime dictionary directly to the bottom of the 'Anime' sheet."""
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


def update_anime_row(system_id: str, update_data: dict) -> bool:
    """Overwrites an existing anime row in the 'Anime' sheet matched by system_id."""
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
    old_row = None

    # Locate the target row
    for i, row in enumerate(values):
        if len(row) > sys_id_idx and row[sys_id_idx] == system_id:
            row_idx = i + 1
            # Pad row in case sheet is missing empty trailing columns
            old_row = row + [""] * (len(headers) - len(row))
            break

    if not row_idx:
        raise ValueError(f"Anime with system_id '{system_id}' not found in Sheets.")

    # Construct the updated row, preserving existing data for un-updated columns
    new_row = []
    for i, header in enumerate(headers):
        if header in update_data:
            val = update_data[header]
            new_row.append(val if val is not None else "")
        else:
            new_row.append(old_row[i])

    print(f"Updating row {row_idx} for anime {system_id} in Google Sheets...")
    try:
        execute_with_retry(
            sheet.update,
            values=[new_row],
            range_name=f"A{row_idx}",
            value_input_option="USER_ENTERED",
        )
    except TypeError:  # Fallback for older gspread versions
        execute_with_retry(
            sheet.update, f"A{row_idx}", [new_row], value_input_option="USER_ENTERED"
        )
    return True


def delete_anime_row(system_id: str) -> bool:
    """Deletes an entire anime row from the 'Anime' sheet matched by system_id."""
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


def update_anime_field_in_sheet(system_id: str, field_name: str, value: Any) -> bool:
    """Dynamically updates a single specific cell for a target system_id."""
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
# CRUD OPERATIONS: SERIES
# ==========================================


def append_new_series(series_data: dict) -> bool:
    """Appends a completely new Franchise/Series directly to the 'Anime Series' Sheet."""
    try:
        sheet = execute_with_retry(get_google_spreadsheet().worksheet, "Anime Series")
    except WorksheetNotFound:
        print("⚠️ 'Anime Series' tab not found! Cannot append new series.")
        return False

    headers = execute_with_retry(sheet.row_values, 1)

    # Prevent duplicate Series English Names
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


def update_series_row(system_id: str, update_data: dict) -> bool:
    """Overwrites an existing series row in the 'Anime Series' sheet matched by system_id."""
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
    old_row = None
    for i, row in enumerate(values):
        if len(row) > sys_id_idx and row[sys_id_idx] == system_id:
            row_idx = i + 1
            old_row = row + [""] * (len(headers) - len(row))
            break

    if not row_idx:
        raise ValueError(f"Series with system_id '{system_id}' not found in Sheets.")

    new_row = []
    for i, header in enumerate(headers):
        if header in update_data:
            val = update_data[header]
            new_row.append(val if val is not None else "")
        else:
            new_row.append(old_row[i])

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


def delete_series_row(system_id: str) -> bool:
    """Deletes an entire series row from the 'Anime Series' sheet matched by system_id."""
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
