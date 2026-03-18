"""
sheets_client.py
Handles direct communication with the Google Sheets API via gspread.
Optimized for V2: Includes Bulk Overwrite methods to treat Google Sheets as a Read-Only Backup,
while perfectly preserving the original V1 authentication and quota fallback logic.
"""

import os
import json
import time
import logging
import gspread
from gspread.exceptions import APIError, WorksheetNotFound
from typing import Callable, Any, Dict, List
from google.oauth2.service_account import Credentials

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
                # Using the original 60s multiplier as Jikan/Sheets quotas are strict
                wait_time = 60 * (attempt + 1)
                logger.warning(
                    f"Google API Quota Exceeded (429). Pausing for {wait_time}s (Attempt {attempt + 1}/{max_retries})..."
                )
                time.sleep(wait_time)
            else:
                raise e
    raise Exception(
        f"Failed to execute {func.__name__} after {max_retries} retries due to strict quota limits."
    )


def get_google_spreadsheet() -> gspread.Spreadsheet:
    """
    Authenticates with Google using the service account and returns the main Spreadsheet object.
    Intelligently routes between Cloud Environment Variables and local credentials.json.
    """
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    # 1. Production: Try to load from Environment Variable
    creds_json_str = os.getenv("GOOGLE_CREDENTIALS_JSON")

    if creds_json_str:
        try:
            creds_info = json.loads(creds_json_str)
            credentials = Credentials.from_service_account_info(
                creds_info, scopes=scopes
            )
            gc = gspread.authorize(credentials)
            logger.info(
                "Authenticated to Google Sheets via Cloud Environment Variables."
            )
        except json.JSONDecodeError as e:
            raise Exception(
                f"Failed to parse GOOGLE_CREDENTIALS_JSON. Ensure it is a valid JSON string. Error: {e}"
            )
    else:
        # 2. Local Development: Fallback to local file
        if not os.path.exists("credentials.json"):
            raise Exception(
                "Missing credentials! Provide GOOGLE_CREDENTIALS_JSON env var or a credentials.json file."
            )
        gc = gspread.service_account(filename="credentials.json")
        logger.info("Authenticated to Google Sheets via local credentials.json.")

    # Prioritize the explicit ID from .env if it was set to a real ID, otherwise fallback to filename
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    if sheet_id and sheet_id != "your_id_here":
        return gc.open_by_key(sheet_id)

    return gc.open("Anime Database")


def get_google_sheet(sheet_name: str = "Anime") -> gspread.Worksheet:
    """Helper to get a specific tab from the main spreadsheet."""
    return get_google_spreadsheet().worksheet(sheet_name)


def _pad_row(row: list, target_length: int) -> list:
    """
    Helper function to ensure a row has the exact number of columns as the headers.
    Google Sheets truncates trailing empty cells when fetching data.
    """
    return row + [""] * (target_length - len(row))


def sanitize_sheet_row(row_dict: Dict[str, str]) -> Dict[str, Any]:
    """
    Sanitizes a raw row fetched from Google Sheets before it touches Pydantic or SQLAlchemy.
    Converts 'TRUE'/'FALSE' to booleans, and empty strings to None to prevent DB cast errors
    on strict Integer/Float columns.
    """
    sanitized = {}
    for key, value in row_dict.items():
        if isinstance(value, str):
            val = value.strip()
            if val == "":
                sanitized[key] = None
            elif val.upper() == "TRUE":
                sanitized[key] = True
            elif val.upper() == "FALSE":
                sanitized[key] = False
            else:
                sanitized[key] = val
        else:
            sanitized[key] = value

    return sanitized


def get_all_rows(tab_name: str) -> List[Dict[str, Any]]:
    """
    Fetches all data from a specific tab as a list of dictionaries.
    Used by the Sync Engine to scan for manual additions (Secondary Input).
    """
    try:
        sheet = execute_with_retry(get_google_spreadsheet().worksheet, tab_name)
        all_values = execute_with_retry(sheet.get_all_values)

        if not all_values or len(all_values) < 2:
            return []

        headers = all_values[0]
        data = []

        for row in all_values[1:]:
            # Ensure row perfectly aligns with headers
            padded_row = _pad_row(row, len(headers))

            # Map to dictionary
            raw_row_dict = {headers[i]: padded_row[i] for i in range(len(headers))}

            # Sanitize and append
            data.append(sanitize_sheet_row(raw_row_dict))

        return data
    except WorksheetNotFound:
        logger.warning(f"Worksheet '{tab_name}' not found.")
        return []


# ==========================================
# V2 BULK BACKUP OPERATIONS (DB -> SHEETS)
# ==========================================


def bulk_overwrite_sheet(
    tab_name: str, headers: List[str], data_matrix: List[List[Any]]
) -> bool:
    """
    V2 Primary Sync Method: Overwrites the entire Google Sheet tab with PostgreSQL data.
    Extremely efficient: Does the whole backup in just 2 API calls.
    """
    try:
        spreadsheet = get_google_spreadsheet()

        # FIXED: Catch WorksheetNotFound and auto-create the missing tab!
        try:
            sheet = execute_with_retry(spreadsheet.worksheet, tab_name)
        except WorksheetNotFound:
            logger.warning(f"Worksheet '{tab_name}' not found. Auto-creating it now...")
            num_rows = max(100, len(data_matrix) + 10)
            num_cols = max(10, len(headers))
            sheet = execute_with_retry(
                spreadsheet.add_worksheet, title=tab_name, rows=num_rows, cols=num_cols
            )

        # 1. Clear everything currently in the sheet to prevent leftover ghost data
        execute_with_retry(sheet.clear)

        # 2. Combine headers and data
        full_payload = [headers] + data_matrix

        # 3. Push the entire payload at once starting from A1
        execute_with_retry(
            sheet.update,
            values=full_payload,
            range_name="A1",
            value_input_option="USER_ENTERED",
        )

        logger.info(
            f"Successfully bulk-backed up {len(data_matrix)} rows to '{tab_name}'."
        )
        return True
    except Exception as e:
        logger.error(f"Failed to bulk overwrite '{tab_name}': {e}")
        return False


# ==========================================
# SURGICAL OPERATIONS (For Instant UI Patches)
# ==========================================


def update_anime_field_in_sheet(system_id: str, field_name: str, value: Any) -> bool:
    """
    Dynamically updates a single specific cell for a target system_id.
    Retained in V2 so that minor frontend updates (like +1 ep_fin) sync instantly
    without triggering a massive bulk overwrite.
    """
    sheet = get_google_sheet("Anime")

    cell = execute_with_retry(sheet.find, system_id)
    if not cell:
        logger.warning(
            f"system_id {system_id} not found in Google Sheet. Skipping patch."
        )
        return False

    headers = execute_with_retry(sheet.row_values, 1)
    try:
        # Simplified Column Math: Because header keys are strictly unique,
        # we can just find its index and add 1 (gspread uses 1-based indexing)
        col_index = headers.index(field_name) + 1
    except ValueError:
        logger.warning(f"Column '{field_name}' not found in the header row.")
        return False

    execute_with_retry(
        sheet.update_cell, cell.row, col_index, value if value is not None else ""
    )
    return True
