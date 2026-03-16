"""
sync_utils.py
Contains utility functions for cleaning and parsing raw data
extracted from Google Sheets before inserting it into the PostgreSQL database.
Optimized for V2 with "Season X Part Y" support.
"""

import re
from typing import Any, Optional


def clean_value(val: Any, expected_type: type = str) -> Any:
    """
    Cleans raw Google Sheets cell values.
    Converts empty strings or None to a proper Python None.
    Casts values to the specified expected_type (e.g., int, float, str, bool).
    """
    # 1. Immediate return for empty data
    if val is None:
        return None

    # 2. Short-circuit: If the value is already exactly the requested type, return it.
    if type(val) is expected_type:
        return val

    # 3. Convert to string and check for emptiness
    val_str = str(val).strip()
    if val_str == "":
        return None

    # 4. Handle Boolean casting
    if expected_type == bool:
        return val_str.lower() in ["true", "t", "1", "yes", "y", "有"]

    # 5. Handle Numeric casting
    try:
        if expected_type == int:
            return int(float(val_str))
        if expected_type == float:
            return float(val_str)
    except ValueError:
        return None

    # 6. Default fallback
    return val_str


def extract_mal_id(mal_link: str) -> Optional[int]:
    """
    Extracts the MAL ID from a MyAnimeList URL.
    """
    if not mal_link:
        return None

    match = re.search(r"myanimelist\.net/anime/(\d+)", str(mal_link))
    if match:
        return int(match.group(1))

    return None


def extract_season_from_title(title_en: str) -> Optional[str]:
    """
    Extracts season and part information from an English title.
    Matches patterns like 'Season 2' or 'Season 3 Part 2'.
    Returns formatted string: 'Season X Part Y' or 'Season X'
    """
    if not title_en:
        return None

    # Captures "Season X" and optional "Part Y"
    match = re.search(r"(Season\s\d+(?:\sPart\s\d+)?)", str(title_en), re.IGNORECASE)
    if match:
        return match.group(1).title()

    return None


def extract_season_from_cn_title(title_cn: str) -> Optional[str]:
    """
    Extracts season and part information from a Chinese title.
    Example: '某科學的超電磁砲 第2季 第1部' -> 'Season 2 Part 1'
    Example: '進擊的巨人 Final Season Part 2' -> 'Season 4 Part 2' (Special handling for 'Final')
    """
    if not title_cn:
        return None

    val = str(title_cn)
    result_parts = []

    # 1. Map for Chinese Numerals
    cn_num_map = {
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

    def _get_num(s: str) -> str:
        if s.isdigit():
            return s
        return str(cn_num_map.get(s, s))

    # 2. Extract Season (第X季)
    s_match = re.search(r"第\s*([一二三四五六七八九十]+|\d+)\s*季", val)
    if s_match:
        result_parts.append(f"Season {_get_num(s_match.group(1))}")
    elif "Final Season" in val:
        # Common convention: if Final Season is found in CN title context
        result_parts.append("Season 4")

    # 3. Extract Part (Part X or 第X部 or 第X部分)
    # Check for English "Part X" first as it's common in Chinese titles
    p_match_en = re.search(r"Part\s*(\d+)", val, re.IGNORECASE)
    if p_match_en:
        result_parts.append(f"Part {p_match_en.group(1)}")
    else:
        # Check for Chinese "第X部"
        p_match_cn = re.search(r"第\s*([一二三四五六七八九十]+|\d+)\s*部", val)
        if p_match_cn:
            result_parts.append(f"Part {_get_num(p_match_cn.group(1))}")

    if result_parts:
        return " ".join(result_parts)

    return None
