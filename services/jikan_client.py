"""
jikan_client.py
Handles all interactions with the external Jikan API (MyAnimeList's Unofficial API).
Strictly responsible for fetching and parsing external JSON data.
"""

import logging
import requests
from typing import Optional, Dict, Any
from datetime import datetime

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants for MyAnimeList's Unofficial API
JIKAN_BASE_URL = "https://api.jikan.moe/v4"

# Mapping for V2 strict month format
MONTH_MAP = {
    1: "JAN",
    2: "FEB",
    3: "MAR",
    4: "APR",
    5: "MAY",
    6: "JUN",
    7: "JUL",
    8: "AUG",
    9: "SEP",
    10: "OCT",
    11: "NOV",
    12: "DEC",
}


def get_season_from_month(month_num: int) -> str:
    """Helper to determine the standard anime broadcasting season based on release month."""
    if month_num in [1, 2, 3]:
        return "WIN"
    if month_num in [4, 5, 6]:
        return "SPR"
    if month_num in [7, 8, 9]:
        return "SUM"
    if month_num in [10, 11, 12]:
        return "FAL"
    return ""


def fetch_anime_details(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches anime details from Jikan and parses the data into our V2 internal schema.
    Includes strict timeouts and exception handling to survive Jikan's heavy rate-limiting.
    """
    if not mal_id:
        return None

    # We use the /full endpoint to get both core stats and streaming links in one call
    url = f"{JIKAN_BASE_URL}/anime/{mal_id}/full"

    try:
        response = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json().get("data", {})

        # ==========================================
        # PARSE DATES & SEASONS
        # ==========================================
        release_year = ""
        release_month = ""
        release_season = ""

        aired = data.get("aired", {})
        from_date_str = aired.get("from")

        if from_date_str:
            try:
                # Jikan usually returns ISO 8601 strings: "2009-04-05T00:00:00+00:00"
                dt = datetime.fromisoformat(from_date_str.replace("Z", "+00:00"))
                release_year = str(dt.year)
                release_month = MONTH_MAP.get(dt.month, "")
                release_season = get_season_from_month(dt.month)
            except (ValueError, TypeError):
                logger.warning(
                    f"Malformed date string from Jikan for MAL ID {mal_id}: {from_date_str}"
                )
                pass

        # ==========================================
        # PARSE STREAMING (NETFLIX)
        # ==========================================
        streaming_list = data.get("streaming", [])
        # Returns a standard Python Boolean, aligning with our strict SQL models
        source_netflix = any(
            "netflix" in s.get("name", "").lower() for s in streaming_list
        )

        # ==========================================
        # PARSE SCORES & IMAGES
        # ==========================================
        score = data.get("score")
        rank = data.get("rank")

        # We pass the raw image dictionaries back to the orchestrator,
        # which will decide if it actually needs to trigger a download.
        images = data.get("images", {})

        return {
            "release_year": release_year,
            "release_month": release_month,
            "release_season": release_season,
            "source_netflix": source_netflix,
            "score": score,
            "rank": rank,
            "images": images,
        }

    except requests.exceptions.HTTPError as e:
        if response.status_code == 429:
            logger.warning(f"Jikan Rate Limit Exceeded (429) for MAL ID {mal_id}")
        elif response.status_code == 404:
            logger.warning(f"Anime not found (404) on Jikan for MAL ID {mal_id}")
        else:
            logger.error(f"HTTP Error fetching from Jikan for MAL ID {mal_id}: {e}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network/Timeout Error connecting to Jikan for MAL ID {mal_id}: {e}"
        )
        return None
    except Exception as e:
        logger.error(f"Unexpected parsing error for MAL ID {mal_id}: {e}")
        return None
