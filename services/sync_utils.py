"""
sync_utils.py
Contains utility functions for parsing, extracting, and formatting data
moving between Google Sheets and the PostgreSQL database.
Optimized for V2.
"""

import re
from typing import Any, Optional
from datetime import datetime


def format_for_sheet(val: Any, expected_type: type) -> str:
    """
    Formats Python/SQLAlchemy data types into Google Sheets compatible strings.
    Converts Booleans to TRUE/FALSE and datetimes to ISO 8601 strings.
    """
    if val is None:
        return ""
    if expected_type == bool:
        return "TRUE" if val else "FALSE"
    if isinstance(val, datetime):
        return val.isoformat() + "Z"
    return str(val)


def extract_mal_id(mal_link: str) -> Optional[int]:
    """
    Extracts the MAL ID from a MyAnimeList URL.
    Example: 'https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood' -> 5114
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
