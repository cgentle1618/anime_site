"""
jikan.py
Handles all HTTP interactions with the external Jikan v4 API.
Strictly responsible for fetching raw external JSON data and handling rate limits (429).
"""

import logging
import time
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

# Constants for MyAnimeList's Unofficial API
JIKAN_BASE_URL = "https://api.jikan.moe/v4"


def fetch_jikan_anime_data(
    mal_id: int, max_retries: int = 3
) -> Optional[Dict[str, Any]]:
    """
    Fetches raw anime details from Jikan.
    Works for anime and anime movie entries.
    Includes strict timeouts and an exponential backoff retry mechanism for 429 Rate Limits.
    """
    if not mal_id:
        return None

    url = f"{JIKAN_BASE_URL}/anime/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnimeTracker/2.0"
    }

    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 429:
                wait_time = 2**attempt
                logger.warning(
                    f"Jikan Rate Limit (429) for MAL ID {mal_id}. "
                    f"Attempt {attempt + 1} of {max_retries}. Sleeping for {wait_time}s..."
                )
                time.sleep(wait_time)
                continue

            if response.status_code == 404:
                logger.warning(f"Anime not found (404) on Jikan for MAL ID {mal_id}")
                return None

            response.raise_for_status()

            return response.json().get("data", {})

        except requests.exceptions.RequestException as e:
            logger.error(
                f"Network/Timeout Error connecting to Jikan for MAL ID {mal_id}: {e}"
            )

            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                return None

    logger.error(
        f"Failed to fetch MAL ID {mal_id} after {max_retries} attempts due to rate limits."
    )
    return None
