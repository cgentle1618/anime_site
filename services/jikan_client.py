"""
jikan_client.py
Handles all interactions with the external Jikan API (MyAnimeList's Unofficial API).
Used to fetch missing metadata like cover images, ratings, and global rankings.
"""

import requests
from typing import Optional, Dict, Any


def fetch_mal_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Hits the Jikan API to grab the Key Visual, MAL Score, and MAL Rank for a given ID.
    Returns None if the request fails or hits a rate limit.
    """
    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}"
        response = requests.get(url)

        if response.status_code == 200:
            data = response.json().get("data", {})

            # Safely navigate nested JSON for the large JPG image
            image_url = data.get("images", {}).get("jpg", {}).get("large_image_url")
            score = data.get("score")
            rank = data.get("rank")
            rank_str = str(rank) if rank is not None else "N/A"

            return {
                "cover_image_url": image_url,
                "mal_rating": score,
                "mal_rank": rank_str,
            }

        elif response.status_code == 429:
            # Jikan enforces a strict rate limit (approx 3 requests/second)
            print(f"⚠️ Jikan Rate Limit hit while fetching ID {mal_id}.")
            return None

    except Exception as e:
        print(f"❌ Failed to fetch Jikan data for ID {mal_id}: {e}")

    return None
