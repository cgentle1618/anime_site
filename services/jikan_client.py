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
    Fetches comprehensive data from Jikan's /anime/{id}/full endpoint.
    Parses release date, Netflix streaming availability, rating, and rank.
    Downloads the MAL cover image to local storage asynchronously.
    """
    if not mal_id:
        return None

    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}/full"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json().get("data", {})

            # 1. Download Cover Image Locally
            cover_image_file = None
            images = data.get("images", {})
            jpg_url = images.get("jpg", {}).get("large_image_url") or images.get(
                "jpg", {}
            ).get("image_url")

            if jpg_url:
                cover_image_file = download_cover_image(jpg_url, system_id)

            # 2. Parse Precise Release Dates
            release_year = None
            release_month = None
            release_season = None

            aired = data.get("aired", {})
            start_date_str = aired.get("from")

            if start_date_str:
                try:
                    dt = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
                    release_year = str(dt.year)
                    release_month = MONTH_MAP.get(dt.month)
                    release_season = get_season_from_month(dt.month)
                except (ValueError, TypeError):
                    pass  # Ignore if MAL has malformed date data

            # 3. Parse Streaming (Netflix) - V2 Fix: Return String TRUE/FALSE
            streaming_list = data.get("streaming", [])
            netflix_found = any(
                "netflix" in s.get("name", "").lower() for s in streaming_list
            )
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

        elif response.status_code == 429:
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
