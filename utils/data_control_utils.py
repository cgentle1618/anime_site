"""
data_control_utils.py
Contains business-logic utility functions, primarily focused on serializing
and deserializing SQLAlchemy models to/from Google Sheets formats.
"""

from typing import Any, List, Dict
from datetime import datetime
from uuid import UUID
from models import Franchise, Series, Anime

# ==========================================
# FORMATTERS (DB -> Google Sheets)
# ==========================================


def format_for_sheet(val: Any, expected_type: type = str) -> str:
    """
    Formats Python/SQLAlchemy data types into Google Sheets compatible strings.
    Converts UUIDs to strings, Booleans to TRUE/FALSE, and datetimes to ISO strings.
    """
    if val is None:
        return ""
    if expected_type == bool or isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, datetime):
        return val.isoformat() + "Z"
    return str(val)


def format_franchise_for_sheet(franchise: Franchise) -> list:
    return [
        format_for_sheet(franchise.system_id),
        format_for_sheet(franchise.franchise_type),
        format_for_sheet(franchise.franchise_name_en),
        format_for_sheet(franchise.franchise_name_cn),
        format_for_sheet(franchise.franchise_name_romanji),
        format_for_sheet(franchise.franchise_name_jp),
        format_for_sheet(franchise.franchise_name_alt),
        format_for_sheet(franchise.my_rating),
        format_for_sheet(franchise.franchise_expectation),
        format_for_sheet(franchise.favorite_3x3_slot),
        format_for_sheet(franchise.remark),
        format_for_sheet(franchise.created_at, datetime),
        format_for_sheet(franchise.updated_at, datetime),
    ]


def format_series_for_sheet(series: Series) -> list:
    return [
        format_for_sheet(series.system_id),
        format_for_sheet(series.franchise_id),
        format_for_sheet(series.series_name_en),
        format_for_sheet(series.series_name_cn),
        format_for_sheet(series.series_name_alt),
    ]


def format_anime_for_sheet(anime: Anime) -> list:
    return [
        format_for_sheet(anime.system_id),
        format_for_sheet(anime.franchise_id),
        format_for_sheet(anime.series_id),
        format_for_sheet(anime.anime_name_en),
        format_for_sheet(anime.anime_name_cn),
        format_for_sheet(anime.anime_name_romanji),
        format_for_sheet(anime.anime_name_jp),
        format_for_sheet(anime.anime_name_alt),
        format_for_sheet(anime.airing_type),
        format_for_sheet(anime.watching_status),
        format_for_sheet(anime.airing_status),
        format_for_sheet(anime.ep_total),
        format_for_sheet(anime.ep_fin),
        format_for_sheet(anime.ep_previous),
        format_for_sheet(anime.ep_special),
        format_for_sheet(anime.season_part),
        format_for_sheet(anime.my_rating),
        format_for_sheet(anime.is_main),
        format_for_sheet(anime.release_month),
        format_for_sheet(anime.release_season),
        format_for_sheet(anime.release_year),
        format_for_sheet(anime.studio),
        format_for_sheet(anime.director),
        format_for_sheet(anime.producer),
        format_for_sheet(anime.music),
        format_for_sheet(anime.distributor_tw),
        format_for_sheet(anime.genre_main),
        format_for_sheet(anime.genre_sub),
        format_for_sheet(anime.prequel_id),
        format_for_sheet(anime.sequel_id),
        format_for_sheet(anime.alternative),
        format_for_sheet(anime.watch_order),
        format_for_sheet(anime.remark),
        format_for_sheet(anime.official_link),
        format_for_sheet(anime.twitter_link),
        format_for_sheet(anime.mal_id),
        format_for_sheet(anime.mal_link),
        format_for_sheet(anime.mal_rating),
        format_for_sheet(anime.mal_rank),
        format_for_sheet(anime.anilist_link),
        format_for_sheet(anime.anilist_rating),
        format_for_sheet(anime.op),
        format_for_sheet(anime.ed),
        format_for_sheet(anime.insert_ost),
        format_for_sheet(anime.seiyuu),
        format_for_sheet(anime.source_baha, bool),
        format_for_sheet(anime.baha_link),
        format_for_sheet(anime.source_other),
        format_for_sheet(anime.source_other_link),
        format_for_sheet(anime.source_netflix, bool),
        format_for_sheet(anime.cover_image_file),
        format_for_sheet(anime.created_at, datetime),
        format_for_sheet(anime.updated_at, datetime),
    ]


# ==========================================
# PARSERS (Google Sheets -> DB)
# ==========================================


def parse_from_sheet(val: Any, expected_type: type) -> Any:
    """
    Safely converts strings from Google Sheets back into Python types.
    Handles converting empty strings to None/Null to preserve database integrity.
    """
    if val is None or str(val).strip() == "":
        return None

    val_str = str(val).strip()

    try:
        if expected_type == bool:
            return val_str.upper() == "TRUE"
        if expected_type == int:
            return int(float(val_str))  # Float cast first handles strings like '1.0'
        if expected_type == float:
            return float(val_str)
        if expected_type == datetime:
            return datetime.fromisoformat(val_str.replace("Z", "+00:00"))
        if expected_type == UUID:
            return UUID(val_str)
    except (ValueError, TypeError):
        return None

    return val_str


def parse_row_to_dict(headers: List[str], row: List[str]) -> Dict[str, str]:
    """Zips a list of headers and a row together, padding missing columns."""
    padded_row = row + [""] * (len(headers) - len(row))
    return dict(zip(headers, padded_row))


def parse_franchise_from_sheet(raw: Dict[str, str]) -> Dict[str, Any]:
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_type": parse_from_sheet(raw.get("franchise_type"), str),
        "franchise_name_en": parse_from_sheet(raw.get("franchise_name_en"), str),
        "franchise_name_cn": parse_from_sheet(raw.get("franchise_name_cn"), str),
        "franchise_name_romanji": parse_from_sheet(
            raw.get("franchise_name_romanji"), str
        ),
        "franchise_name_jp": parse_from_sheet(raw.get("franchise_name_jp"), str),
        "franchise_name_alt": parse_from_sheet(raw.get("franchise_name_alt"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "franchise_expectation": parse_from_sheet(raw.get("franchise_expectation"), str)
        or "Low",
        "favorite_3x3_slot": parse_from_sheet(raw.get("favorite_3x3_slot"), int),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_series_from_sheet(raw: Dict[str, str]) -> Dict[str, Any]:
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_name_en": parse_from_sheet(raw.get("series_name_en"), str),
        "series_name_cn": parse_from_sheet(raw.get("series_name_cn"), str),
        "series_name_alt": parse_from_sheet(raw.get("series_name_alt"), str),
    }


def parse_anime_from_sheet(raw: Dict[str, str]) -> Dict[str, Any]:
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "anime_name_en": parse_from_sheet(raw.get("anime_name_en"), str),
        "anime_name_cn": parse_from_sheet(raw.get("anime_name_cn"), str),
        "anime_name_romanji": parse_from_sheet(raw.get("anime_name_romanji"), str),
        "anime_name_jp": parse_from_sheet(raw.get("anime_name_jp"), str),
        "anime_name_alt": parse_from_sheet(raw.get("anime_name_alt"), str),
        "airing_type": parse_from_sheet(raw.get("airing_type"), str),
        "watching_status": parse_from_sheet(raw.get("watching_status"), str)
        or "Might Watch",
        "airing_status": parse_from_sheet(raw.get("airing_status"), str),
        "ep_total": parse_from_sheet(raw.get("ep_total"), int),
        "ep_fin": parse_from_sheet(raw.get("ep_fin"), int) or 0,
        "ep_previous": parse_from_sheet(raw.get("ep_previous"), int),
        "ep_special": parse_from_sheet(raw.get("ep_special"), float),
        "season_part": parse_from_sheet(raw.get("season_part"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "is_main": parse_from_sheet(raw.get("is_main"), str),
        "release_month": parse_from_sheet(raw.get("release_month"), str),
        "release_season": parse_from_sheet(raw.get("release_season"), str),
        "release_year": parse_from_sheet(raw.get("release_year"), str),
        "studio": parse_from_sheet(raw.get("studio"), str),
        "director": parse_from_sheet(raw.get("director"), str),
        "producer": parse_from_sheet(raw.get("producer"), str),
        "music": parse_from_sheet(raw.get("music"), str),
        "distributor_tw": parse_from_sheet(raw.get("distributor_tw"), str),
        "genre_main": parse_from_sheet(raw.get("genre_main"), str),
        "genre_sub": parse_from_sheet(raw.get("genre_sub"), str),
        "prequel_id": parse_from_sheet(raw.get("prequel_id"), UUID),
        "sequel_id": parse_from_sheet(raw.get("sequel_id"), UUID),
        "alternative": parse_from_sheet(raw.get("alternative"), str),
        "watch_order": parse_from_sheet(raw.get("watch_order"), float),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "official_link": parse_from_sheet(raw.get("official_link"), str),
        "twitter_link": parse_from_sheet(raw.get("twitter_link"), str),
        "mal_id": parse_from_sheet(raw.get("mal_id"), int),
        "mal_link": parse_from_sheet(raw.get("mal_link"), str),
        "mal_rating": parse_from_sheet(raw.get("mal_rating"), float),
        "mal_rank": parse_from_sheet(raw.get("mal_rank"), str),
        "anilist_link": parse_from_sheet(raw.get("anilist_link"), str),
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), str),
        "op": parse_from_sheet(raw.get("op"), str),
        "ed": parse_from_sheet(raw.get("ed"), str),
        "insert_ost": parse_from_sheet(raw.get("insert_ost"), str),
        "seiyuu": parse_from_sheet(raw.get("seiyuu"), str),
        "source_baha": parse_from_sheet(raw.get("source_baha"), bool),
        "baha_link": parse_from_sheet(raw.get("baha_link"), str),
        "source_other": parse_from_sheet(raw.get("source_other"), str),
        "source_other_link": parse_from_sheet(raw.get("source_other_link"), str),
        "source_netflix": parse_from_sheet(raw.get("source_netflix"), bool) or False,
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_system_option_from_sheet(raw: Dict[str, str]) -> Dict[str, Any]:
    return {
        "id": parse_from_sheet(raw.get("id"), int),
        "category": parse_from_sheet(raw.get("category"), str),
        "option_value": parse_from_sheet(raw.get("option_value"), str),
    }
