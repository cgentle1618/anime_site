"""
jikan_client.py
Handles all interactions with the external Jikan API (MyAnimeList's Unofficial API).
Used to fetch missing metadata, parse V2 release dates/streaming, and trigger image downloads.
"""

import requests
from typing import Optional, Dict, Any
from datetime import datetime
from services.image_manager import download_cover_image

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
    """Helper to determine the anime season based on release month."""
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
    Core function to fetch raw anime details from Jikan API.
    Handles the HTTP request, timeout, and rate limit detection.
    Returns the inner 'data' dictionary from the response.
    """
    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}/full"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            payload = response.json()
            return payload.get("data", {})

        elif response.status_code == 429:
            print(f"⚠️ [Jikan API] Rate limited when fetching MAL ID {mal_id}")
            return None
        else:
            print(
                f"⚠️ [Jikan API] Failed with status {response.status_code} for MAL ID {mal_id}"
            )
            return None

    except requests.RequestException as e:
        print(f"⚠️ [Jikan API] Connection error for MAL ID {mal_id}: {e}")
        return None


def fetch_mal_data(mal_id: int, system_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches data and parses it strictly for the frontend /fetch-mal autofill UI.
    Downloads the cover image locally.
    """
    # Use the core fetch function to get the raw data
    data = fetch_anime_details(mal_id)

    if not data:
        return None

    # 1. Download & Save Cover Image
    images = data.get("images", {})
    jpg = images.get("jpg", {})
    image_url = (
        jpg.get("large_image_url") or jpg.get("image_url") or data.get("image_url")
    )

    cover_image_file = None
    if image_url:
        # Download the image locally and get the relative path
        cover_image_file = download_cover_image(image_url, system_id)

    # 2. Parse Dates (V2 Strict String Formatting)
    release_year = ""
    release_month = ""
    release_season = ""

    aired = data.get("aired", {})
    from_date_str = aired.get("from")

    if from_date_str:
        try:
            # Jikan usually returns ISO 8601 strings for "from": "2009-04-05T00:00:00+00:00"
            # Sometimes it's just "2009-04-05" depending on the endpoint depth
            dt = datetime.fromisoformat(from_date_str.replace("Z", "+00:00"))
            release_year = str(dt.year)
            release_month = MONTH_MAP.get(dt.month, "")
            release_season = get_season_from_month(dt.month)
        except (ValueError, TypeError):
            pass  # Ignore if MAL has malformed date data

    # 3. Parse Streaming (Netflix) - V2 Fix: Return String TRUE/FALSE
    streaming_list = data.get("streaming", [])
    netflix_found = any("netflix" in s.get("name", "").lower() for s in streaming_list)
    source_netflix = "TRUE" if netflix_found else "FALSE"

    # 4. Parse Scores
    score = data.get("score")
    rank = data.get("rank")
    rank_str = str(rank) if rank is not None else "N/A"

    return {
        "cover_image_file": cover_image_file,
        "release_year": release_year,
        "release_month": release_month,
        "release_season": release_season,
        "source_netflix": source_netflix,
        "mal_rating": score,
        "mal_rank": rank_str,
    }
