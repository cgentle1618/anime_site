"""
google_sheets.py
Handles direct communication with the Google Sheets API via gspread.
Optimized for V2: Treats Google Sheets strictly as a Read-Only Backup destination.
Contains ZERO database logic or data parsing.
"""

import os
import json
import time
import logging
import gspread
from gspread.exceptions import APIError, WorksheetNotFound
from typing import Callable, Any, List, Optional
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

# Explicitly load environment variables from .env file
load_dotenv()

# Setup basic logging
logger = logging.getLogger(__name__)

# ==========================================
# CORE GOOGLE API & AUTHENTICATION
# ==========================================


def _execute_with_retry(func: Callable, *args, max_retries: int = 3, **kwargs) -> Any:
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
                logger.warning(
                    f"Google API Quota Exceeded (429). Pausing for {wait_time}s..."
                )
                time.sleep(wait_time)
            else:
                logger.error(f"Google API Error: {e}")
                raise e
        except Exception as e:
            logger.error(f"Unexpected Google Sheets Error: {e}")
            raise e

    logger.error("Max retries exceeded for Google Sheets API call.")
    return None


def _get_google_spreadsheet() -> gspread.Spreadsheet:
    """
    Authenticates and connects to the target Google Spreadsheet.
    Prioritizes environment variables, falls back to local credentials.json.
    """
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    # 1. Authenticate
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if creds_json:
        creds_dict = json.loads(creds_json)
        credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    else:
        # Fallback for local development
        credentials = Credentials.from_service_account_file(
            "credentials.json", scopes=scopes
        )

    client = gspread.authorize(credentials)

    # 2. Connect to the specific Spreadsheet (Supports both naming conventions)
    sheet_id = os.environ.get("GOOGLE_SHEET_ID") or os.environ.get("SPREADSHEET_ID")
    if not sheet_id:
        raise ValueError(
            "GOOGLE_SHEET_ID environment variable is missing. Please check your .env file."
        )

    return _execute_with_retry(client.open_by_key, sheet_id)


def get_google_sheet_tab(tab_name: str) -> gspread.Worksheet:
    """
    Retrieves a specific tab (Worksheet) from the Spreadsheet.
    If the tab does not exist, it safely creates it.
    """
    spreadsheet = _get_google_spreadsheet()

    try:
        # Attempt to fetch the existing tab
        worksheet = _execute_with_retry(spreadsheet.worksheet, tab_name)
        return worksheet
    except WorksheetNotFound:
        logger.info(f"Tab '{tab_name}' not found. Creating a new tab.")
        # Create a fresh tab if it doesn't exist (1000 rows, 50 cols is a safe default)
        worksheet = _execute_with_retry(
            spreadsheet.add_worksheet, title=tab_name, rows=1000, cols=50
        )
        return worksheet


# ==========================================
# EXTERNAL ACTIONS (Called by data_control.py)
# ==========================================


def get_all_raw_rows(tab_name: str) -> List[List[str]]:
    """
    Fetches every single cell in a tab as a 2D array of strings.
    Used as the foundation for the 'Pull from Sheets' logic.
    """
    try:
        worksheet = get_google_sheet_tab(tab_name)
        # get_all_values() returns a list of lists of strings
        raw_data = _execute_with_retry(worksheet.get_all_values)
        return raw_data if raw_data else []
    except Exception as e:
        logger.error(f"Failed to pull raw rows from '{tab_name}': {e}")
        return []


def bulk_overwrite_sheet(tab_name: str, data_matrix: List[List[Any]]) -> bool:
    """
    The core Backup logic.
    Clears the target tab completely and blasts the new 2D array into it.
    Note: The orchestrator should include the Headers as the first row of data_matrix.
    """
    if not data_matrix:
        logger.warning(f"No data provided to overwrite '{tab_name}'. Aborting.")
        return False

    try:
        worksheet = get_google_sheet_tab(tab_name)

        # Step 1: Wipe the tab clean
        _execute_with_retry(worksheet.clear)

        # Step 2: Write the new data. USER_ENTERED preserves dates/numbers formatting.
        _execute_with_retry(
            worksheet.update, "A1", data_matrix, value_input_option="USER_ENTERED"
        )

        logger.info(f"Successfully backed up {len(data_matrix)} rows to '{tab_name}'.")
        return True

    except Exception as e:
        logger.error(f"Failed to bulk overwrite '{tab_name}': {e}")
        return False
