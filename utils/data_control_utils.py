"""
data_control_utils.py
Contains business-logic utility functions, primarily focused on serializing
and deserializing SQLAlchemy models to/from Google Sheets formats.
"""

import logging
from typing import Any, List, Dict
from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session

from models import Franchise, Series, Anime, DataControlLog, DeletedRecord


logger = logging.getLogger(__name__)

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


def format_model_for_sheet(instance: Any) -> list:
    """
    Dynamically extracts and formats all fields from a SQLAlchemy model instance.
    This guarantees the Google Sheet order is 100% identical to the Postgres Database order forever,
    preventing column-shifting bugs.
    """
    if not instance:
        return []

    row_data = []
    # Loop through the exact columns in the exact order they appear in the database schema
    for column in instance.__class__.__table__.columns:
        val = getattr(instance, column.name, None)
        row_data.append(format_for_sheet(val))

    return row_data


# ==========================================
# PARSERS (Google Sheets -> Python Types)
# ==========================================


def parse_row_to_dict(headers: List[str], row: List[Any]) -> Dict[str, Any]:
    """
    Maps a sheet row list to a dictionary based on the header list.
    Handles rows that are shorter than the headers array.
    """
    data = {}
    for i, header in enumerate(headers):
        # Sheet rows often drop trailing empty columns. This safeguards against IndexError.
        val = row[i] if i < len(row) else ""
        data[header] = val
    return data


def parse_from_sheet(val_str: str, expected_type: Any) -> Any:
    """
    Converts a string from Google Sheets to the expected Python type based on SQLAlchemy column type.
    It’s a helper function for parsers.
    """
    if val_str is None or str(val_str).strip() == "":
        return None

    val_str = str(val_str).strip()

    if expected_type == int:
        try:
            return int(float(val_str))  # Handle cases where sheet exports "1.0"
        except ValueError:
            return None
    elif expected_type == float:
        try:
            return float(val_str)
        except ValueError:
            return None
    elif expected_type == bool:
        lower_val = val_str.lower()
        if lower_val in ["true", "1", "yes", "y", "t"]:
            return True
        if lower_val in ["false", "0", "no", "n", "f"]:
            return False
        return None
    elif expected_type == datetime:
        try:
            # Handle standard ISO formatting and common sheet formats
            val_str_clean = val_str.replace("Z", "+00:00")
            return datetime.fromisoformat(val_str_clean)
        except ValueError:
            return None
    elif expected_type == UUID:
        try:
            return UUID(val_str)
        except ValueError:
            # IMPORTANT FIX: Return the string instead of None
            # This allows the service layer to intercept string names (like "Tokyo Ghoul")
            # and look up their actual UUID in the database.
            return val_str
    else:
        return val_str


def parse_franchise_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Franchise sheet into typed data ready for the Database.
    """
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
        "franchise_expectation": parse_from_sheet(
            raw.get("franchise_expectation"), str
        ),
        "favorite_3x3_slot": parse_from_sheet(raw.get("favorite_3x3_slot"), int),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_series_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Series sheet into typed data ready for the Database.
    Note: franchise_id could be a UUID or a raw String name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(
            raw.get("franchise_id"), UUID
        ),  # Might be string, handled in data_control
        "series_name_en": parse_from_sheet(raw.get("series_name_en"), str),
        "series_name_cn": parse_from_sheet(raw.get("series_name_cn"), str),
        "series_name_alt": parse_from_sheet(raw.get("series_name_alt"), str),
    }


def parse_anime_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Anime sheet into typed data ready for the Database.
    Note: franchise_id and series_id could be a UUID or a raw String name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "anime_name_en": parse_from_sheet(raw.get("anime_name_en"), str),
        "anime_name_cn": parse_from_sheet(raw.get("anime_name_cn"), str),
        "anime_name_romanji": parse_from_sheet(raw.get("anime_name_romanji"), str),
        "anime_name_jp": parse_from_sheet(raw.get("anime_name_jp"), str),
        "anime_name_alt": parse_from_sheet(raw.get("anime_name_alt"), str),
        "season_part": parse_from_sheet(raw.get("season_part"), str),
        "airing_type": parse_from_sheet(raw.get("airing_type"), str),
        "airing_status": parse_from_sheet(raw.get("airing_status"), str),
        "watching_status": parse_from_sheet(raw.get("watching_status"), str),
        "ep_previous": parse_from_sheet(raw.get("ep_previous"), int),
        "ep_total": parse_from_sheet(raw.get("ep_total"), int),
        "ep_fin": parse_from_sheet(raw.get("ep_fin"), int),
        "ep_special": parse_from_sheet(raw.get("ep_special"), float),
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
        "mal_id": parse_from_sheet(raw.get("mal_id"), int),
        "official_link": parse_from_sheet(raw.get("official_link"), str),
        "twitter_link": parse_from_sheet(raw.get("twitter_link"), str),
        "mal_link": parse_from_sheet(raw.get("mal_link"), str),
        "mal_rating": parse_from_sheet(raw.get("mal_rating"), float),
        "mal_rank": parse_from_sheet(raw.get("mal_rank"), str),
        "anilist_link": parse_from_sheet(raw.get("anilist_link"), str),
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), str),
        "op": parse_from_sheet(raw.get("op"), str),
        "ed": parse_from_sheet(raw.get("ed"), str),
        "insert_ost": parse_from_sheet(raw.get("insert_ost"), str),
        "source_baha": parse_from_sheet(raw.get("source_baha"), bool),
        "baha_link": parse_from_sheet(raw.get("baha_link"), str),
        "source_other": parse_from_sheet(raw.get("source_other"), str),
        "source_other_link": parse_from_sheet(raw.get("source_other_link"), str),
        "source_netflix": parse_from_sheet(raw.get("source_netflix"), bool) or False,
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_system_option_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the System Options sheet into typed data ready for the Database.
    """
    return {
        "id": parse_from_sheet(raw.get("id"), int),
        "category": parse_from_sheet(raw.get("category"), str),
        "option_value": parse_from_sheet(raw.get("option_value"), str),
    }


# ==========================================
# CENTRALIZED AUDIT LOGGING
# ==========================================


def log_data_control(
    db: Session,
    action_main: str,
    action_specific: str,
    action_type: str,
    status: str,
    rows_added: int = 0,
    rows_updated: int = 0,
    rows_deleted: int = 0,
    error_message: str = None,
    details_json: str = None,
):
    """
    Safely commits an audit trail entry for Data Control Pipelines.
    """
    try:
        log_entry = DataControlLog(
            action_main=action_main,
            action_specific=action_specific,
            type=action_type,
            status=status,
            rows_added=rows_added,
            rows_updated=rows_updated,
            rows_deleted=rows_deleted,
            error_message=error_message,
            details_json=details_json,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save DataControlLog: {e}")
        db.rollback()


def log_deleted_record(db: Session, entry: Any, entry_type: str):
    """
    Intercepts an entry right before deletion and stages its metadata in the deleted_record table.
    NOTE: This does NOT call db.commit(). The parent router must commit the transaction
    so the log and the actual deletion succeed or fail together atomically.
    """
    try:
        franchise_name = None
        series_name = None
        anime_cn = None
        anime_en = None
        airing_type = None

        # Fallback Helper: CN -> EN -> Alt -> Romanji -> JP
        def get_cn_name(item, t):
            if not item:
                return None
            if t == "series":
                return (
                    getattr(item, f"{t}_name_cn")
                    or getattr(item, f"{t}_name_en")
                    or getattr(item, f"{t}_name_alt")
                )
            return (
                getattr(item, f"{t}_name_cn")
                or getattr(item, f"{t}_name_en")
                or getattr(item, f"{t}_name_alt")
                or getattr(item, f"{t}_name_romanji", None)
                or getattr(item, f"{t}_name_jp", None)
            )

        # Fallback Helper: EN -> Romanji -> CN -> Alt -> JP
        def get_en_name(item, t):
            if not item:
                return None
            if t == "series":
                return (
                    getattr(item, f"{t}_name_en")
                    or getattr(item, f"{t}_name_cn")
                    or getattr(item, f"{t}_name_alt")
                )
            return (
                getattr(item, f"{t}_name_en")
                or getattr(item, f"{t}_name_romanji", None)
                or getattr(item, f"{t}_name_cn")
                or getattr(item, f"{t}_name_alt")
                or getattr(item, f"{t}_name_jp", None)
            )

        if entry_type == "System Options":
            # Map category/value to CN/EN columns so it displays nicely in the UI
            anime_cn = getattr(entry, "category", None)
            anime_en = getattr(entry, "option_value", None)

        elif entry_type == "Franchise":
            franchise_name = get_cn_name(entry, "franchise")

        elif entry_type == "Series":
            series_name = get_cn_name(entry, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_name = get_cn_name(f, "franchise")

        elif entry_type == "Anime":
            anime_cn = get_cn_name(entry, "anime")
            anime_en = get_en_name(entry, "anime")
            airing_type = getattr(entry, "airing_type", None)

            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_name = get_cn_name(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_name = get_cn_name(f, "franchise")

        deleted_log = DeletedRecord(
            type=entry_type,
            franchise=franchise_name,
            series=series_name,
            anime_cn=anime_cn,
            anime_en=anime_en,
            airing_type=airing_type,
        )

        db.add(deleted_log)
        logger.info(
            f"Staged deleted record log for {entry_type}: {anime_cn or franchise_name or series_name}"
        )

    except Exception as e:
        logger.error(f"Failed to stage deleted record log: {e}")
