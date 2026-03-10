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


def fetch_mal_data(mal_id: int, system_id: str) -> Optional[Dict[str, Any]]:
    """
    Hits the Jikan API /full endpoint to grab V2 metadata.
    Downloads the cover image locally and extracts precise date/streaming data.
    """
    try:
        # Using the /full endpoint to ensure we get the 'streaming' array
        url = f"https://api.jikan.moe/v4/anime/{mal_id}/full"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json().get("data", {})

            # 1. Parse Image and Download Locally
            image_url = data.get("images", {}).get("jpg", {}).get("large_image_url")
            cover_image_file = download_cover_image(image_url, system_id)

            # 2. Parse Dates (Aired From)
            release_year, release_month, release_season = None, None, None
            aired_from = data.get("aired", {}).get(
                "from"
            )  # Format: "2014-10-10T00:00:00+00:00"

            if aired_from:
                try:
                    # Parse ISO format (handling the trailing timezone Z/+00:00 simply by truncating)
                    dt = datetime.fromisoformat(aired_from.split("T")[0])
                    release_year = str(dt.year)
                    release_month = MONTH_MAP.get(dt.month)
                    release_season = get_season_from_month(dt.month)
                except (ValueError, TypeError):
                    pass  # Ignore if MAL has malformed date data

            # 3. Parse Streaming (Netflix)
            streaming_list = data.get("streaming", [])
            source_netflix = any(
                "netflix" in s.get("name", "").lower() for s in streaming_list
            )

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

        elif response.status_code == 429:
            # Jikan enforces a strict rate limit
            print(f"⚠️ [Jikan API] Rate limited when fetching MAL ID {mal_id}")
            return None
        else:
            print(
                f"⚠️ [Jikan API] Failed with status {response.status_code} for MAL ID {mal_id}"
            )
            return None

    except requests.exceptions.RequestException as e:
        print(f"❌ [Jikan API] Network error for MAL ID {mal_id}: {e}")
        return None
