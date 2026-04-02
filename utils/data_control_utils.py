"""
data_control_utils.py
Contains business-logic utility functions, primarily focused on serializing
SQLAlchemy models into formats required by Google Sheets.
"""

from typing import Any
from datetime import datetime
from models import Franchise, Series, Anime


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
    """
    Serializes a Franchise model into a flat array for the 'Franchise' Sheet tab.
    """
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
    """
    Serializes a Series model into a flat array for the 'Series' Sheet tab.
    """
    return [
        format_for_sheet(series.system_id),
        format_for_sheet(series.franchise_id),
        format_for_sheet(series.series_name_en),
        format_for_sheet(series.series_name_cn),
        format_for_sheet(series.series_name_alt),
    ]


def format_anime_for_sheet(anime: Anime) -> list:
    """
    Serializes an Anime model into a flat array for the 'Anime' Sheet tab.
    """
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
