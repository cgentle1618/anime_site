"""
sheets.py
Handles direct communication with the Google Sheets API via gspread.
Treats Google Sheets as a Read-Only Backup and Pull destination.
Contains zero database logic or data parsing to ensure strict separation of concerns.
"""

import json
import logging
import re
import time
from typing import Any, Callable, List, Optional

import gspread
from gspread.exceptions import APIError, WorksheetNotFound
from google.oauth2.service_account import Credentials

from app.config import settings

logger = logging.getLogger(__name__)

# Google answers with these when its own backend is momentarily unwell rather
# than when anything is wrong with the request, so they are safe to repeat.
TRANSIENT_STATUS_CODES = (500, 502, 503, 504)


class SheetsUnavailableError(RuntimeError):
    """
    Raised when a Sheets call fails for a reason unrelated to the data itself
    (an outage, a quota wall, a revoked credential).

    Callers must be able to tell this apart from a tab that is genuinely empty:
    the two used to be indistinguishable, so a 503 read as "nothing to pull"
    and the pipeline reported success while quietly skipping the tab.
    """


# ==========================================
# HELPER FUNCTIONS
# ==========================================


# The two shapes gspread renders an API error in, in the order they are tried.
# `[503]: ...` is the bracketed status line it falls back to when the body is
# not JSON; `{'code': 503, ...}` is the repr of the parsed error dict. Anchored
# on purpose - a bare three-digit number anywhere in a message ("wrote 1975
# rows") must not be mistaken for a status, or a permanent error would be
# retried three times before surfacing.
_STATUS_IN_MESSAGE = (
    re.compile(r"\[(\d{3})\]"),
    re.compile(r"['\"]code['\"]\s*:\s*(\d{3})\b"),
)


def _status_code(error: Exception) -> Optional[int]:
    """
    Digs the HTTP status out of a gspread APIError.

    Read off `error.response` first. gspread 5.12.0 - the pinned version -
    builds APIError straight from the `requests.Response` and keeps nothing but
    that response: there is no `.code` attribute at all, so the response is the
    only place the status reliably survives.

    `.code` is checked next for gspread 6, which does set it, so an upgrade does
    not silently turn every retry back off. It parks the value at -1 when it
    could not parse the body, hence the `> 0` guard.

    The message is the last resort, for an error carrying neither.
    """
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    if isinstance(status, int) and status > 0:
        return status

    code = getattr(error, "code", None)
    if isinstance(code, int) and code > 0:
        return code

    text = str(error)
    for pattern in _STATUS_IN_MESSAGE:
        match = pattern.search(text)
        if match:
            return int(match.group(1))
    return None


def _execute_with_retry(func: Callable, *args, max_retries: int = 3, **kwargs) -> Any:
    """
    Wraps Google Sheets API calls with a backoff retry mechanism.

    Two retryable families, with very different pacing: a 429 means we spent the
    per-minute quota and have to sit out most of a minute, while a 5xx is a blip
    that usually clears in seconds. Everything else is a real error about the
    request and is raised on the spot.
    """
    last_error: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except APIError as e:
            status = _status_code(e)
            last_error = e

            if status == 429:
                wait_time = 60 * (attempt + 1)
                logger.warning(
                    f"Google API Quota Exceeded (429). Attempt {attempt + 1}/{max_retries}. "
                    f"Pausing for {wait_time}s..."
                )
            elif status in TRANSIENT_STATUS_CODES:
                wait_time = 2 ** (attempt + 1)
                logger.warning(
                    f"Google Sheets is temporarily unavailable ({status}). "
                    f"Attempt {attempt + 1}/{max_retries}. Retrying in {wait_time}s..."
                )
            else:
                logger.error(f"Google Sheets API Error: {e}")
                raise e

            # No point sleeping through the backoff of an attempt we will not make.
            if attempt < max_retries - 1:
                time.sleep(wait_time)
        except Exception as e:
            logger.error(f"Unexpected error during Sheets API call: {e}")
            raise e

    logger.error("Max retries exceeded for Google Sheets API.")
    raise SheetsUnavailableError(
        f"Max retries exceeded for Google Sheets API: {last_error}"
    )


# ==========================================
# CORE GOOGLE API & AUTHENTICATION
# ==========================================


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
    creds_json = settings.google_credentials_json
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
    sheet_id = settings.google_sheet_id
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
# EXTERNAL ACTIONS (Called by the pipelines package)
# ==========================================


def get_all_raw_rows(tab_name: str) -> List[List[str]]:
    """
    Reads all cell values from a tab and returns them as a list of lists.
    Used as the data source for Pull pipelines.

    An empty list means the tab is empty. A tab we could not read raises
    SheetsUnavailableError instead, so the caller never mistakes an outage for
    a tab with nothing in it.
    """
    try:
        worksheet = get_google_sheet_tab(tab_name)
        raw_data = _execute_with_retry(worksheet.get_all_values)
        return raw_data if raw_data else []
    except SheetsUnavailableError:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve data from tab '{tab_name}': {e}")
        raise SheetsUnavailableError(
            f"Failed to retrieve data from tab '{tab_name}': {e}"
        ) from e


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
