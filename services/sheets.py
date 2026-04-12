"""
sheets.py
Handles direct communication with the Google Sheets API via gspread.
Treats Google Sheets as a Read-Only Backup and Pull destination.
Contains zero database logic or data parsing to ensure strict separation of concerns.
"""

import json
import logging
import os
import time
from typing import Any, Callable, List, Optional

import gspread
from dotenv import load_dotenv
from gspread.exceptions import APIError, WorksheetNotFound
from google.oauth2.service_account import Credentials

# Explicitly load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# ==========================================
# CORE GOOGLE API & AUTHENTICATION
# ==========================================


def _execute_with_retry(func: Callable, *args, max_retries: int = 3, **kwargs) -> Any:
    """
    Wraps Google Sheets API calls with an exponential backoff retry mechanism.
    Primarily used to handle '429 Quota Exceeded' errors safely.
    """
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except APIError as e:
            if "429" in str(e):
                wait_time = 60 * (attempt + 1)
                logger.warning(
                    f"Google API Quota Exceeded (429). Attempt {attempt + 1}/{max_retries}. "
                    f"Pausing for {wait_time}s..."
                )
                time.sleep(wait_time)
            else:
                logger.error(f"Google Sheets API Error: {e}")
                raise e
        except Exception as e:
            logger.error(f"Unexpected error during Sheets API call: {e}")
            raise e

    logger.error("Max retries exceeded for Google Sheets API.")
    return None


def _get_google_spreadsheet() -> gspread.Spreadsheet:
    """
    Authenticates and establishes a connection to the target Google Spreadsheet.
    Prioritizes GOOGLE_CREDENTIALS_JSON from env, falling back to local credentials.json.
    """
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    # 1. Identity Resolution
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    try:
        if creds_json:
            creds_dict = json.loads(creds_json)
            credentials = Credentials.from_service_account_info(
                creds_dict, scopes=scopes
            )
        else:
            # Fallback for local development if env var is missing
            credentials = Credentials.from_service_account_file(
                "credentials.json", scopes=scopes
            )
    except Exception as e:
        logger.error(f"Failed to load Google Service Account credentials: {e}")
        raise e

    client = gspread.authorize(credentials)

    # 2. Spreadsheet Targeting
    # Supports both naming conventions used in deployment history
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if not sheet_id:
        logger.error("GOOGLE_SHEET_ID environment variable is missing.")
        raise ValueError("GOOGLE_SHEET_ID must be set in environment variables.")

    try:
        return _execute_with_retry(client.open_by_key, sheet_id)
    except Exception as e:
        logger.error(f"Failed to open spreadsheet with ID '{sheet_id}': {e}")
        raise e


def get_google_sheet_tab(tab_name: str) -> gspread.Worksheet:
    """
    Retrieves a specific worksheet by name.
    If the tab does not exist, it is automatically created with default dimensions.
    """
    spreadsheet = _get_google_spreadsheet()

    try:
        return _execute_with_retry(spreadsheet.worksheet, tab_name)
    except WorksheetNotFound:
        logger.info(f"Worksheet '{tab_name}' not found. Creating new tab.")
        # Default to 1000 rows and 50 columns for a clean backup canvas
        return _execute_with_retry(
            spreadsheet.add_worksheet, title=tab_name, rows=1000, cols=50
        )


# ==========================================
# EXTERNAL ACTIONS (Called by data_control.py)
# ==========================================


def get_all_raw_rows(tab_name: str) -> List[List[str]]:
    """
    Reads all cell values from a tab and returns them as a list of lists.
    Used as the data source for Pull pipelines.
    """
    try:
        worksheet = get_google_sheet_tab(tab_name)
        raw_data = _execute_with_retry(worksheet.get_all_values)
        return raw_data if raw_data else []
    except Exception as e:
        logger.error(f"Failed to retrieve data from tab '{tab_name}': {e}")
        return []


def bulk_overwrite_sheet(tab_name: str, data_matrix: List[List[Any]]) -> bool:
    """
    Permanently overwrites a tab with the provided matrix.
    Includes headers as the first row. Uses USER_ENTERED to preserve data types.
    """
    if not data_matrix:
        logger.warning(
            f"No data provided for tab '{tab_name}'. Aborting bulk overwrite."
        )
        return False

    try:
        worksheet = get_google_sheet_tab(tab_name)

        _execute_with_retry(worksheet.clear)

        _execute_with_retry(
            worksheet.update, "A1", data_matrix, value_input_option="USER_ENTERED"
        )

        logger.info(f"Successfully backed up {len(data_matrix)} rows to '{tab_name}'.")
        return True

    except Exception as e:
        logger.error(f"Failed to perform bulk overwrite on tab '{tab_name}': {e}")
        return False
