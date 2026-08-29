"""
formatter.py
Contains utility functions for formatting data between
SQLAlchemy models and Google Sheets.
"""

import json
from typing import Any, List, Dict
from datetime import datetime, time
from uuid import UUID

# Imported rather than duplicated so the Sheets tab and the API agree on what
# the three rungs are.
from app.services.domain.watch_order import normalize_importance
from app.utils import release_date

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
    if isinstance(val, (dict, list)):
        return json.dumps(val, ensure_ascii=False)
    return str(val)


def format_model_for_sheet(instance: Any) -> list:
    """
    Dynamically extracts and formats all fields from a SQLAlchemy model instance.
    This guarantees the Google Sheet order is 100% identical to the Postgres Database order forever,
    preventing column-shifting bugs.

    Release date columns are prefixed with an apostrophe. The backup writes with
    value_input_option="USER_ENTERED", under which Sheets parses "2024-05-17"
    into a date cell and returns the spreadsheet's locale rendering on the next
    read — corrupting the value on the first backup-then-pull cycle. The
    apostrophe forces a text cell and is not part of the value on read.
    """
    if not instance:
        return []

    date_columns = release_date.DATE_COLUMNS.get(instance.__class__.__tablename__, ())

    row_data = []
    # Loop through the exact columns in the exact order they appear in the database schema
    for column in instance.__class__.__table__.columns:
        val = getattr(instance, column.name, None)
        cell = format_for_sheet(val)
        if column.name in date_columns and cell:
            cell = f"'{cell}"
        row_data.append(cell)

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


def _safe_json(val: Any) -> Any:
    if not val or not str(val).strip():
        return None
    try:
        return json.loads(val)
    except (json.JSONDecodeError, ValueError):
        return None


def _uuid_or_none(val: Any) -> Any:
    """
    Strict UUID parse for columns that have no name-resolution fallback.

    parse_from_sheet(..., UUID) deliberately returns the raw string when a cell is
    not a valid UUID, so the service layer can resolve names like "Tokyo Ghoul".
    For plain UUID pointer columns that string would reach the database and raise,
    so coerce anything unparseable to None instead.
    """
    parsed = parse_from_sheet(val, UUID)
    return parsed if isinstance(parsed, UUID) else None


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
    elif expected_type == time:
        try:
            # Sheets may render a time cell as "23:00", "23:00:00" or "23:00:00.000"
            return time.fromisoformat(val_str)
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


def parse_watch_order_list_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Watch Order List sheet into typed data
    ready for the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        # Owner columns are strict UUIDs: unlike the media tabs there is no
        # name-resolution step for them in the Pull pipeline, so a junk cell
        # would otherwise reach the DB and violate the single-owner check.
        "franchise_id": _uuid_or_none(raw.get("franchise_id")),
        "collection_id": _uuid_or_none(raw.get("collection_id")),
        "series_id": _uuid_or_none(raw.get("series_id")),
        "list_name": parse_from_sheet(raw.get("list_name"), str),
        "list_type": parse_from_sheet(raw.get("list_type"), str),
        "is_default": parse_from_sheet(raw.get("is_default"), bool),
        "is_most_recommended": parse_from_sheet(
            raw.get("is_most_recommended"), bool
        ),
        "auto_source": parse_from_sheet(raw.get("auto_source"), str),
        "sort_index": parse_from_sheet(raw.get("sort_index"), float),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_watch_order_section_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Watch Order Section sheet into typed data
    ready for the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "list_id": _uuid_or_none(raw.get("list_id")),
        "position": parse_from_sheet(raw.get("position"), float),
        "section_name": parse_from_sheet(raw.get("section_name"), str),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_watch_order_item_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Watch Order Item sheet into typed data
    ready for the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "list_id": _uuid_or_none(raw.get("list_id")),
        "position": parse_from_sheet(raw.get("position"), float),
        "media_type": parse_from_sheet(raw.get("media_type"), str),
        # entry_id has no foreign key - it points at whichever media table
        # media_type names - so an unparseable cell becomes None and the row
        # shows up in the guide as a missing step.
        "entry_id": _uuid_or_none(raw.get("entry_id")),
        # Real FK, unlike entry_id: an unparseable cell becomes None and the
        # step restores ungrouped rather than pointing at nothing.
        "section_id": _uuid_or_none(raw.get("section_id")),
        "ep_start": parse_from_sheet(raw.get("ep_start"), int),
        "ep_end": parse_from_sheet(raw.get("ep_end"), int),
        # Coerced, not validated: a blank cell, or a row backed up before the
        # column existed, restores as "Normal" rather than failing the Pull.
        "importance": normalize_importance(
            parse_from_sheet(raw.get("importance"), str)
        ),
        "note": parse_from_sheet(raw.get("note"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_media_relation_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Media Relation sheet into typed data
    ready for the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "from_type": parse_from_sheet(raw.get("from_type"), str),
        # Neither endpoint has a foreign key - each points at whichever media
        # table its *_type names - so an unparseable cell becomes None and the
        # row shows up in the admin page as a missing endpoint rather than
        # failing the whole Pull.
        "from_id": _uuid_or_none(raw.get("from_id")),
        # Preserved as written, not coerced: a kind added in a newer version
        # must survive a round trip through an older one.
        "relation_type": parse_from_sheet(raw.get("relation_type"), str),
        "to_type": parse_from_sheet(raw.get("to_type"), str),
        "to_id": _uuid_or_none(raw.get("to_id")),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_plan_next_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Plan Next sheet into typed data ready for
    the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        # Preserved as written, not coerced: a media type or scope added in a
        # newer version must survive a round trip through an older one.
        "media_type": parse_from_sheet(raw.get("media_type"), str),
        "scope": parse_from_sheet(raw.get("scope"), str),
        # No foreign key - the target is whichever table scope and media_type
        # name - so an unparseable cell becomes None and the row shows up in
        # the admin page as a missing target rather than failing the Pull.
        "target_id": _uuid_or_none(raw.get("target_id")),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
        # Defaults to "next": a Plan Next tab backed up before rewatch existed
        # has no such column, and every row in it was a queue entry.
        "kind": parse_from_sheet(raw.get("kind"), str) or "next",
    }


def parse_franchise_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Franchise sheet into typed data ready for the Database.
    """
    parsed = {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_type": parse_from_sheet(raw.get("franchise_type"), str),
        "franchise_name_en": parse_from_sheet(raw.get("franchise_name_en"), str),
        "franchise_name_cn": parse_from_sheet(raw.get("franchise_name_cn"), str),
        "franchise_name_roman": parse_from_sheet(raw.get("franchise_name_roman"), str),
        "franchise_name_jp": parse_from_sheet(raw.get("franchise_name_jp"), str),
        "franchise_name_alt": parse_from_sheet(raw.get("franchise_name_alt"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "franchise_expectation": parse_from_sheet(
            raw.get("franchise_expectation"), str
        ),
        # These six were previously omitted (or, for the size-group maps, added
        # later without being wired up here), so every Pull of the Franchise
        # tab silently wiped them from the database. Four of the six are
        # JSONB fields and go through _safe_json.
        "cover_entry_id": _uuid_or_none(raw.get("cover_entry_id")),
        "type_covers": _safe_json(raw.get("type_covers")),
        "type_slots": _safe_json(raw.get("type_slots")),
        "size_group_derived": _safe_json(raw.get("size_group_derived")),
        "size_group_manual": _safe_json(raw.get("size_group_manual")),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }

    # Only surface collection_id when the sheet actually has that column.
    # Including it unconditionally would set collection_id=None on every franchise
    # whenever a Franchise tab predating the Collection tier is pulled.
    # Note: this may be a UUID *or* a raw string name, which pull.py resolves.
    if "collection_id" in raw:
        parsed["collection_id"] = parse_from_sheet(raw.get("collection_id"), UUID)

    return parsed


def parse_collection_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Collection sheet into typed data ready for the Database.
    """
    parsed = {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "collection_name_en": parse_from_sheet(raw.get("collection_name_en"), str),
        "collection_name_cn": parse_from_sheet(raw.get("collection_name_cn"), str),
        "collection_name_roman": parse_from_sheet(
            raw.get("collection_name_roman"), str
        ),
        "collection_name_jp": parse_from_sheet(raw.get("collection_name_jp"), str),
        "collection_name_alt": parse_from_sheet(raw.get("collection_name_alt"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "collection_expectation": parse_from_sheet(
            raw.get("collection_expectation"), str
        ),
        # Must be a real UUID: unlike franchise_id/series_id there is no
        # name-resolution step for this column, so a junk cell would hit the DB.
        "cover_franchise_id": _uuid_or_none(raw.get("cover_franchise_id")),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }

    # Emitted only when the sheet actually has the column. Emitting it always
    # would set no_built_in_orders = None on every collection whenever a
    # Collection tab predating the flag is pulled - the same silent wipe the
    # franchise collection_id safeguard exists to prevent.
    if "no_built_in_orders" in raw:
        parsed["no_built_in_orders"] = parse_from_sheet(
            raw.get("no_built_in_orders"), bool
        )
    return parsed


def parse_series_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Series sheet into typed data ready for the Database.
    Note: franchise_id could be a UUID or a raw String name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(
            raw.get("franchise_id"), UUID
        ),  # Might be string, handled in the pull pipeline
        "series_name_en": parse_from_sheet(raw.get("series_name_en"), str),
        "series_name_cn": parse_from_sheet(raw.get("series_name_cn"), str),
        "series_name_roman": parse_from_sheet(raw.get("series_name_roman"), str),
        "series_name_jp": parse_from_sheet(raw.get("series_name_jp"), str),
        "series_name_alt": parse_from_sheet(raw.get("series_name_alt"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "series_expectation": parse_from_sheet(raw.get("series_expectation"), str),
        # Must be a real UUID: unlike franchise_id there is no name-resolution
        # step for this column, so a junk cell would hit the DB.
        "cover_entry_id": _uuid_or_none(raw.get("cover_entry_id")),
        "size_group_derived": _safe_json(raw.get("size_group_derived")),
        "size_group_manual": _safe_json(raw.get("size_group_manual")),
        # Previously omitted, so every Pull of the Series tab silently wiped it.
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
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
        "anime_name_roman": parse_from_sheet(raw.get("anime_name_roman"), str),
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
        "release_season": parse_from_sheet(raw.get("release_season"), str),
        "release_date": release_date.normalize(parse_from_sheet(raw.get("release_date"), str)),
        "broadcast_day": parse_from_sheet(raw.get("broadcast_day"), str),
        "broadcast_time": parse_from_sheet(raw.get("broadcast_time"), time),
        "my_watch_day": parse_from_sheet(raw.get("my_watch_day"), str),
        "studio": parse_from_sheet(raw.get("studio"), str),
        "director": parse_from_sheet(raw.get("director"), str),
        "producer": parse_from_sheet(raw.get("producer"), str),
        "music": parse_from_sheet(raw.get("music"), str),
        "distributor_tw": parse_from_sheet(raw.get("distributor_tw"), str),
        "genre_main": parse_from_sheet(raw.get("genre_main"), str),
        "genre_sub": parse_from_sheet(raw.get("genre_sub"), str),
        "is_main_entry": parse_from_sheet(raw.get("is_main_entry"), bool),
        "mal_id": parse_from_sheet(raw.get("mal_id"), int),
        "official_link": parse_from_sheet(raw.get("official_link"), str),
        "twitter_link": parse_from_sheet(raw.get("twitter_link"), str),
        "mal_link": parse_from_sheet(raw.get("mal_link"), str),
        "mal_rating": parse_from_sheet(raw.get("mal_rating"), float),
        "mal_rank": parse_from_sheet(raw.get("mal_rank"), str),
        "anilist_link": parse_from_sheet(raw.get("anilist_link"), str),
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), str),
        "source_baha": parse_from_sheet(raw.get("source_baha"), bool),
        "baha_link": parse_from_sheet(raw.get("baha_link"), str),
        "source_netflix": parse_from_sheet(raw.get("source_netflix"), bool) or False,
        "source_other": _safe_json(raw.get("source_other")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
    }


def parse_anime_movie_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Anime Movies sheet into typed data ready for the Database.
    franchise_id may be a UUID or a raw string name — handled in the pull pipeline.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "anime_movie_name_en": parse_from_sheet(raw.get("anime_movie_name_en"), str),
        "anime_movie_name_cn": parse_from_sheet(raw.get("anime_movie_name_cn"), str),
        "anime_movie_name_roman": parse_from_sheet(
            raw.get("anime_movie_name_roman"), str
        ),
        "anime_movie_name_jp": parse_from_sheet(raw.get("anime_movie_name_jp"), str),
        "anime_movie_name_alt": parse_from_sheet(raw.get("anime_movie_name_alt"), str),
        "airing_status": parse_from_sheet(raw.get("airing_status"), str),
        "watching_status": parse_from_sheet(raw.get("watching_status"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "mal_rating": parse_from_sheet(raw.get("mal_rating"), float),
        "mal_rank": parse_from_sheet(raw.get("mal_rank"), str),
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), str),
        "length_min": parse_from_sheet(raw.get("length_min"), int),
        "release_date_jp": release_date.normalize(parse_from_sheet(raw.get("release_date_jp"), str)),
        "release_date_tw": release_date.normalize(parse_from_sheet(raw.get("release_date_tw"), str)),
        "studio": parse_from_sheet(raw.get("studio"), str),
        "director": parse_from_sheet(raw.get("director"), str),
        "mal_id": parse_from_sheet(raw.get("mal_id"), int),
        "mal_link": parse_from_sheet(raw.get("mal_link"), str),
        "anilist_link": parse_from_sheet(raw.get("anilist_link"), str),
        "official_link": parse_from_sheet(raw.get("official_link"), str),
        "twitter_link": parse_from_sheet(raw.get("twitter_link"), str),
        "source_baha": parse_from_sheet(raw.get("source_baha"), bool),
        "baha_link": parse_from_sheet(raw.get("baha_link"), str),
        "source_netflix": parse_from_sheet(raw.get("source_netflix"), bool) or False,
        "source_other": _safe_json(raw.get("source_other")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
    }


def parse_movie_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Movies sheet into typed data ready for the Database.
    franchise_id and series_id may be a UUID or a raw string name — handled in the pull pipeline.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "movie_name_en": parse_from_sheet(raw.get("movie_name_en"), str),
        "movie_name_cn": parse_from_sheet(raw.get("movie_name_cn"), str),
        "movie_name_alt": parse_from_sheet(raw.get("movie_name_alt"), str),
        "airing_status": parse_from_sheet(raw.get("airing_status"), str),
        "watching_status": parse_from_sheet(raw.get("watching_status"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "imdb_rating": parse_from_sheet(raw.get("imdb_rating"), str),
        "movie_type": parse_from_sheet(raw.get("movie_type"), str),
        "is_main": parse_from_sheet(raw.get("is_main"), str),
        # No legacy column - movie/source_official is a new tag field the
        # credits redesign added, so it only ever shows up at the end of the
        # tab under its own key. Popped out in pull.py before the setattr
        # loop, exactly like the anime/manga/novel/comic credit columns.
        "source_official": parse_from_sheet(raw.get("source_official"), str),
        "length_min": parse_from_sheet(raw.get("length_min"), int),
        "release_date_usa": release_date.normalize(parse_from_sheet(raw.get("release_date_usa"), str)),
        "release_date_tw": release_date.normalize(parse_from_sheet(raw.get("release_date_tw"), str)),
        "director": parse_from_sheet(raw.get("director"), str),
        "imdb_id": parse_from_sheet(raw.get("imdb_id"), str),
        "imdb_link": parse_from_sheet(raw.get("imdb_link"), str),
        "source_other": (_safe_json(raw.get("source_other"))),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
    }


def parse_tv_show_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the TV Shows sheet into typed data ready for the Database.
    franchise_id and series_id may be a UUID or a raw string name — handled in the pull pipeline.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "tv_name_en": parse_from_sheet(raw.get("tv_name_en"), str),
        "tv_name_cn": parse_from_sheet(raw.get("tv_name_cn"), str),
        "tv_name_alt": parse_from_sheet(raw.get("tv_name_alt"), str),
        "region": parse_from_sheet(raw.get("region"), str),
        "season_part": parse_from_sheet(raw.get("season_part"), str),
        "source_official": parse_from_sheet(raw.get("source_official"), str),
        "airing_status": parse_from_sheet(raw.get("airing_status"), str),
        "watching_status": parse_from_sheet(raw.get("watching_status"), str),
        "is_main": parse_from_sheet(raw.get("is_main"), str),
        "ep_total": parse_from_sheet(raw.get("ep_total"), int),
        "ep_fin": parse_from_sheet(raw.get("ep_fin"), int),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "imdb_rating": parse_from_sheet(raw.get("imdb_rating"), str),
        "release_date": release_date.normalize(parse_from_sheet(raw.get("release_date"), str)),
        "imdb_id": parse_from_sheet(raw.get("imdb_id"), str),
        "imdb_link": parse_from_sheet(raw.get("imdb_link"), str),
        "source_other": _safe_json(raw.get("source_other")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_cartoon_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Cartoon sheet into typed data ready for the Database.
    franchise_id and series_id may be a UUID or a raw string name — handled in the pull pipeline.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "cartoon_name_en": parse_from_sheet(raw.get("cartoon_name_en"), str),
        "cartoon_name_cn": parse_from_sheet(raw.get("cartoon_name_cn"), str),
        "cartoon_name_alt": parse_from_sheet(raw.get("cartoon_name_alt"), str),
        "season_part": parse_from_sheet(raw.get("season_part"), str),
        "source_official": parse_from_sheet(raw.get("source_official"), str),
        "airing_type": parse_from_sheet(raw.get("airing_type"), str),
        "airing_status": parse_from_sheet(raw.get("airing_status"), str),
        "watching_status": parse_from_sheet(raw.get("watching_status"), str),
        "is_main": parse_from_sheet(raw.get("is_main"), str),
        "ep_total": parse_from_sheet(raw.get("ep_total"), int),
        "ep_fin": parse_from_sheet(raw.get("ep_fin"), int),
        "length_ep_min": parse_from_sheet(raw.get("length_ep_min"), int),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "imdb_rating": parse_from_sheet(raw.get("imdb_rating"), str),
        "release_date": release_date.normalize(parse_from_sheet(raw.get("release_date"), str)),
        "imdb_id": parse_from_sheet(raw.get("imdb_id"), str),
        "imdb_link": parse_from_sheet(raw.get("imdb_link"), str),
        "source_other": _safe_json(raw.get("source_other")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_manga_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Manga sheet into typed data ready for the Database.
    franchise_id and series_id may be a UUID or a raw string name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "manga_name_en": parse_from_sheet(raw.get("manga_name_en"), str),
        "manga_name_cn": parse_from_sheet(raw.get("manga_name_cn"), str),
        "manga_name_roman": parse_from_sheet(raw.get("manga_name_roman"), str),
        "manga_name_jp": parse_from_sheet(raw.get("manga_name_jp"), str),
        "manga_name_alt": parse_from_sheet(raw.get("manga_name_alt"), str),
        "region": parse_from_sheet(raw.get("region"), str),
        "is_main": parse_from_sheet(raw.get("is_main"), str),
        "serialization_status": parse_from_sheet(raw.get("serialization_status"), str),
        "reading_status": parse_from_sheet(raw.get("reading_status"), str)
        or "Might Read",
        "vol_total": parse_from_sheet(raw.get("vol_total"), int),
        "vol_fin": parse_from_sheet(raw.get("vol_fin"), int) or 0,
        "vol_fin_page": parse_from_sheet(raw.get("vol_fin_page"), int) or 0,
        "ch_total": parse_from_sheet(raw.get("ch_total"), int),
        "ch_fin": parse_from_sheet(raw.get("ch_fin"), int) or 0,
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "mal_rating": parse_from_sheet(raw.get("mal_rating"), float),
        "mal_rank": parse_from_sheet(raw.get("mal_rank"), str),
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), str),
        "author_plot": parse_from_sheet(raw.get("author_plot"), str),
        "author_draw": parse_from_sheet(raw.get("author_draw"), str),
        "release_date": release_date.normalize(parse_from_sheet(raw.get("release_date"), str)),
        "end_date": release_date.normalize(parse_from_sheet(raw.get("end_date"), str)),
        "anime_studio": parse_from_sheet(raw.get("anime_studio"), str),
        "serialization_platform": parse_from_sheet(
            raw.get("serialization_platform"), str
        ),
        "publisher_tw": parse_from_sheet(raw.get("publisher_tw"), str),
        "mal_id": parse_from_sheet(raw.get("mal_id"), int),
        "mal_link": parse_from_sheet(raw.get("mal_link"), str),
        "anilist_link": parse_from_sheet(raw.get("anilist_link"), str),
        "source_other": _safe_json(raw.get("source_other")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_novel_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Novel sheet into typed data ready for the Database.
    franchise_id and series_id may be a UUID or a raw string name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "novel_name_en": parse_from_sheet(raw.get("novel_name_en"), str),
        "novel_name_cn": parse_from_sheet(raw.get("novel_name_cn"), str),
        "novel_name_roman": parse_from_sheet(raw.get("novel_name_roman"), str),
        "novel_name_jp": parse_from_sheet(raw.get("novel_name_jp"), str),
        "novel_name_alt": parse_from_sheet(raw.get("novel_name_alt"), str),
        "novel_name_each_cn": _safe_json(raw.get("novel_name_each_cn")),
        "novel_name_each_en": _safe_json(raw.get("novel_name_each_en")),
        "region": parse_from_sheet(raw.get("region"), str),
        "type": parse_from_sheet(raw.get("type"), str),
        "version": parse_from_sheet(raw.get("version"), str),
        "is_main": parse_from_sheet(raw.get("is_main"), str),
        "serialization_status": parse_from_sheet(raw.get("serialization_status"), str),
        "reading_status": parse_from_sheet(raw.get("reading_status"), str)
        or "Might Read",
        "vol_total_original": parse_from_sheet(raw.get("vol_total_original"), float),
        "vol_total_tw": parse_from_sheet(raw.get("vol_total_tw"), float),
        "vol_fin": parse_from_sheet(raw.get("vol_fin"), float) or 0.0,
        "arc_total": parse_from_sheet(raw.get("arc_total"), float),
        "arc_fin": parse_from_sheet(raw.get("arc_fin"), float) or 0.0,
        "ch_total": parse_from_sheet(raw.get("ch_total"), float),
        "ch_fin": parse_from_sheet(raw.get("ch_fin"), float) or 0.0,
        "progress_display": parse_from_sheet(raw.get("progress_display"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "mal_rating": parse_from_sheet(raw.get("mal_rating"), float),
        "mal_rank": parse_from_sheet(raw.get("mal_rank"), str),
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), str),
        "author": parse_from_sheet(raw.get("author"), str),
        "illustrator": parse_from_sheet(raw.get("illustrator"), str),
        "release_date": release_date.normalize(parse_from_sheet(raw.get("release_date"), str)),
        "end_date": release_date.normalize(parse_from_sheet(raw.get("end_date"), str)),
        "publisher_tw": parse_from_sheet(raw.get("publisher_tw"), str),
        "is_main_entry": parse_from_sheet(raw.get("is_main_entry"), bool),
        "read_order": parse_from_sheet(raw.get("read_order"), float),
        "mal_id": parse_from_sheet(raw.get("mal_id"), int),
        "mal_link": parse_from_sheet(raw.get("mal_link"), str),
        "anilist_link": parse_from_sheet(raw.get("anilist_link"), str),
        "source_other": _safe_json(raw.get("source_other")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_comic_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Comic sheet into typed data ready for the Database.
    franchise_id and series_id may be a UUID or a raw string name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "comic_name_en": parse_from_sheet(raw.get("comic_name_en"), str),
        "comic_name_cn": parse_from_sheet(raw.get("comic_name_cn"), str),
        "comic_name_alt": parse_from_sheet(raw.get("comic_name_alt"), str),
        "volume_label": parse_from_sheet(raw.get("volume_label"), str),
        "comic_type": parse_from_sheet(raw.get("comic_type"), str),
        "publisher": parse_from_sheet(raw.get("publisher"), str),
        "imprint": parse_from_sheet(raw.get("imprint"), str),
        "continuity": parse_from_sheet(raw.get("continuity"), str),
        "era": parse_from_sheet(raw.get("era"), str),
        "events": parse_from_sheet(raw.get("events"), str),
        "is_main_entry": parse_from_sheet(raw.get("is_main_entry"), bool),
        "writer": parse_from_sheet(raw.get("writer"), str),
        "artist": parse_from_sheet(raw.get("artist"), str),
        "release_date": release_date.normalize(parse_from_sheet(raw.get("release_date"), str)),
        "end_date": release_date.normalize(parse_from_sheet(raw.get("end_date"), str)),
        "publisher_tw": parse_from_sheet(raw.get("publisher_tw"), str),
        "issue_total": parse_from_sheet(raw.get("issue_total"), int),
        "issue_fin": parse_from_sheet(raw.get("issue_fin"), int) or 0,
        "serialization_status": parse_from_sheet(raw.get("serialization_status"), str),
        "reading_status": parse_from_sheet(raw.get("reading_status"), str)
        or "Might Read",
        "read_order": parse_from_sheet(raw.get("read_order"), float),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "comicvine_id": parse_from_sheet(raw.get("comicvine_id"), int),
        "comicvine_link": parse_from_sheet(raw.get("comicvine_link"), str),
        "source_other": _safe_json(raw.get("source_other")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_system_option_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the System Options sheet into typed data ready for the Database.

    OPERATIONAL HAZARD: the live spreadsheet's System Options tab still carries
    the OLD headers (id | category | option_value) until a Backup is run
    against the reshaped table. pull.py filters parsed keys by whatever the
    sheet header actually carried, so pulling a stale tab silently imports
    rows keyed only by "category" (no system_id/value/sort_order/remark).
    Always run a Backup of this tab before a Pull.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), str),
        "category": parse_from_sheet(raw.get("category"), str),
        "value": parse_from_sheet(raw.get("value"), str),
        "sort_order": parse_from_sheet(raw.get("sort_order"), int),
        "remark": parse_from_sheet(raw.get("remark"), str),
    }


def parse_person_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Person sheet into typed data ready for
    the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "name_native": parse_from_sheet(raw.get("name_native"), str),
        "name_en": parse_from_sheet(raw.get("name_en"), str),
        "name_cn": parse_from_sheet(raw.get("name_cn"), str),
        "gender": parse_from_sheet(raw.get("gender"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "photo_file": parse_from_sheet(raw.get("photo_file"), str),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_person_role_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Person Role sheet into typed data ready
    for the Database. The Person tab restores before this one (see
    tabs_in_order in pull.py), so person_id round-trips as a plain UUID with
    no name-resolution step - the same treatment other strict FK columns get.
    """
    return {
        "id": parse_from_sheet(raw.get("id"), int),
        "person_id": _uuid_or_none(raw.get("person_id")),
        "role": parse_from_sheet(raw.get("role"), str),
        "scope": parse_from_sheet(raw.get("scope"), str),
    }


def parse_studio_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Studio sheet into typed data ready for
    the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "name_native": parse_from_sheet(raw.get("name_native"), str),
        "name_en": parse_from_sheet(raw.get("name_en"), str),
        "name_cn": parse_from_sheet(raw.get("name_cn"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "logo_file": parse_from_sheet(raw.get("logo_file"), str),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_system_option_scope_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the System Option Scope sheet into typed
    data ready for the Database. The System Options tab restores before this
    one, so option_id round-trips as a plain UUID with no name-resolution
    step - the same treatment other strict FK columns get.
    """
    return {
        "id": parse_from_sheet(raw.get("id"), int),
        "option_id": _uuid_or_none(raw.get("option_id")),
        "scope": parse_from_sheet(raw.get("scope"), str),
    }


def parse_system_config_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the System Configs sheet into typed data ready for the Database.
    """
    return {
        "id": parse_from_sheet(raw.get("id"), int),
        "config_key": parse_from_sheet(raw.get("config_key"), str),
        "config_value": parse_from_sheet(raw.get("config_value"), str),
    }


def parse_seasonal_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Seasonal sheet into typed data ready for the Database.
    """
    return {
        "seasonal": parse_from_sheet(raw.get("seasonal"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "entry_planned": parse_from_sheet(raw.get("entry_planned"), int),
        "entry_completed": parse_from_sheet(raw.get("entry_completed"), int),
        "entry_watching": parse_from_sheet(raw.get("entry_watching"), int),
        "entry_dropped": parse_from_sheet(raw.get("entry_dropped"), int),
    }


def parse_quote_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Quote sheet into typed data ready for the
    Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "media_type": parse_from_sheet(raw.get("media_type"), str),
        # entry_id has no foreign key - it points at whichever media table
        # media_type names - and unlike the media tabs there is no
        # name-resolution step for it in Pull, so an unparseable cell becomes
        # None and the quote shows up on the page as unlinked.
        "entry_id": _uuid_or_none(raw.get("entry_id")),
        "text": parse_from_sheet(raw.get("text"), str),
        "translation": parse_from_sheet(raw.get("translation"), str),
        "language": parse_from_sheet(raw.get("language"), str),
        "speaker": parse_from_sheet(raw.get("speaker"), str),
        "original_source": parse_from_sheet(raw.get("original_source"), str),
        "episode": parse_from_sheet(raw.get("episode"), str),
        "link": parse_from_sheet(raw.get("link"), str),
        "image_file": parse_from_sheet(raw.get("image_file"), str),
        "tags": _safe_json(raw.get("tags")),
        "is_general": parse_from_sheet(raw.get("is_general"), bool),
        "is_favorite": parse_from_sheet(raw.get("is_favorite"), bool),
        "needs_review": parse_from_sheet(raw.get("needs_review"), bool),
        "sort_index": parse_from_sheet(raw.get("sort_index"), float),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_meme_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Meme sheet into typed data ready for the
    Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "owner_type": parse_from_sheet(raw.get("owner_type"), str),
        # owner_id has no foreign key - it points at whichever of the ten owner
        # tables owner_type names - and there is no name-resolution step for it
        # in Pull, so an unparseable cell becomes None and the meme shows up on
        # the page as unlinked.
        "owner_id": _uuid_or_none(raw.get("owner_id")),
        "text": parse_from_sheet(raw.get("text"), str),
        "image_file": parse_from_sheet(raw.get("image_file"), str),
        # A real foreign key with a UNIQUE constraint, so a junk cell must not
        # reach the database - coerce anything unparseable to None.
        "quote_id": _uuid_or_none(raw.get("quote_id")),
        "episode": parse_from_sheet(raw.get("episode"), str),
        "link": parse_from_sheet(raw.get("link"), str),
        "is_favorite": parse_from_sheet(raw.get("is_favorite"), bool),
        "sort_index": parse_from_sheet(raw.get("sort_index"), float),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_note_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Note sheet into typed data ready for the
    Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "owner_type": parse_from_sheet(raw.get("owner_type"), str),
        # owner_id has no foreign key - it points at whichever of the ten owner
        # tables owner_type names - and there is no name-resolution step for it
        # in Pull, so an unparseable cell becomes None and the note shows up
        # unlinked rather than failing the import.
        "owner_id": _uuid_or_none(raw.get("owner_id")),
        "section": parse_from_sheet(raw.get("section"), str),
        # `episode` is the column's pre-rename header. Sheets backed up before
        # the rename must still Pull, or every anchor in them is lost, so the
        # old name is accepted where the current one is absent.
        "locator": parse_from_sheet(
            raw.get("locator") if raw.get("locator") else raw.get("episode"), str
        ),
        "kind": parse_from_sheet(raw.get("kind"), str),
        "status": parse_from_sheet(raw.get("status"), str),
        "title": parse_from_sheet(raw.get("title"), str),
        "content": parse_from_sheet(raw.get("content"), str),
        "links": json.loads(raw["links"]) if raw.get("links") else None,
        "sort_index": parse_from_sheet(raw.get("sort_index"), float),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
