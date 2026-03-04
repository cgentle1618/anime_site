"""
sync_utils.py
Contains utility functions for cleaning and parsing raw data
extracted from Google Sheets before inserting it into the database.
"""

import re
from typing import Any, Optional, Type


def clean_value(val: Any, expected_type: Type = str) -> Any:
    """
    Cleans raw Google Sheets cell values.
    Converts empty strings or None to a proper Python None.
    Casts values to the specified expected_type (e.g., int, float, str).
    """
    if val is None or str(val).strip() == "":
        return None

    val_str = str(val).strip()
    try:
        if expected_type == int:
            return int(float(val_str))  # Handles strings like "1.0" gracefully
        if expected_type == float:
            return float(val_str)
    except ValueError:
        return None
    return val_str


def extract_mal_id(mal_link: str) -> Optional[int]:
    """
    Extracts the numeric MyAnimeList ID from a standard MAL URL.
    Example: 'https://myanimelist.net/anime/5114/Fullmetal_Alchemist' -> 5114
    """
    if not mal_link:
        return None
    match = re.search(r"myanimelist\.net/anime/(\d+)", str(mal_link))
    if match:
        return int(match.group(1))
    return None


def extract_season_from_title(title_en: str) -> Optional[str]:
    """
    Extracts season information from an English title.
    Matches patterns like 'Season 2' or 'Season 3 Part 2'.
    """
    if not title_en:
        return None
    match = re.search(r"(Season\s\d+(?:\sPart\s\d+)?)", str(title_en), re.IGNORECASE)
    if match:
        return match.group(1).title()
    return None


def extract_season_from_cn_title(title_cn: str) -> Optional[str]:
    """
    Extracts season information from a Chinese title and converts it to English format.
    Example: '某科學的超電磁砲 第2季' -> 'Season 2'
    """
    if not title_cn:
        return None
    # Match '第X季' where X is an Arabic numeral or Chinese character
    match = re.search(r"第\s*([一二三四五六七八九十]+|\d+)\s*季", str(title_cn))

    if match:
        num_str = match.group(1)
        if num_str.isdigit():
            return f"Season {num_str}"

        # Map Chinese numerals to Arabic
        cn_to_num = {
            "一": 1,
            "二": 2,
            "三": 3,
            "四": 4,
            "五": 5,
            "六": 6,
            "七": 7,
            "八": 8,
            "九": 9,
            "十": 10,
        }
        num = cn_to_num.get(num_str)
        if num:
            return f"Season {num}"

    return None
