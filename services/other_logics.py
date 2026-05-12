"""
other_logics.py
Contains isolated business logic specific to Anime entries (e.g., episode math,
completion checks, hierarchy resolution).
These functions mutate or evaluate SQLAlchemy models directly and are meant to be
called by FastAPI routers or other higher-level orchestrators.
"""

import logging
import uuid
from datetime import date
from typing import Any, Dict, Tuple, Union

from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_taipei_now
from models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Manga,
    Novel,
    Movies,
    TVShows,
    Franchise,
    Series,
    Seasonal,
    SystemOption,
)

from services.jikan import fetch_jikan_anime_data, fetch_jikan_manga_novel_data
from services.imdb import fetch_imdb_data
from services.tmdb import fetch_tmdb_tv_season_data
from services.image_manager import download_cover_image

from utils.utils import (
    SEASON_PATTERN,
    PART_PATTERN,
    ANIME_FIELDS_TO_FILL,
    ANIME_MOVIE_FIELDS_TO_FILL,
    CARTOON_TV_FIELDS_TO_FILL,
    CARTOON_MOVIE_FIELDS_TO_FILL,
    MANGA_FIELDS_TO_FILL,
    NOVEL_FIELDS_TO_FILL,
    MOVIE_FIELDS_TO_FILL,
    TV_SHOW_FIELDS_TO_FILL,
    extract_mal_id_anime,
    extract_mal_id_manga_novel,
    extract_imdb_id,
    extract_season_from_title,
    calculate_seasonal_from_month,
    validate_episode_math,
    validate_vol_math,
    validate_ch_math,
)
from utils.jikan_utils import (
    map_jikan_to_anime_data,
    map_jikan_to_anime_movie_data,
    map_jikan_to_manga_data,
    map_jikan_to_novel_data,
)
from utils.imdb_utils import (
    _parse_season_number,
    _derive_tv_season_airing_status,
    map_imdb_to_cartoon_data,
    map_imdb_to_movie_data,
    map_imdb_to_tv_show_data,
)

logger = logging.getLogger(__name__)

# ==========================================
# PRE-COMPILED REGEX PATTERNS
# ==========================================

_AIRING_TYPE_ORDER = {"TV": 0, "ONA": 1, "Special": 2, "OVA": 3, "OAD": 4}
_PLANNED_STATUSES = {"Plan to Watch", "Watch When Airs"}
_WATCHING_STATUSES = {"Active Watching", "Passive Watching", "Paused"}
_DROPPED_STATUSES = {"Temp Dropped", "Dropped"}
_SEASONAL_AIRING_TYPES = {"TV", "ONA", "Movie", "Special"}


# ==========================================
# HELPERS
# ==========================================


def resolve_series_parent_hierarchy(
    db: Session, franchise_id: Any, names: Dict[str, Any]
) -> Any:
    """
    Dynamically resolves the parent Franchise for a Series entry.
    If franchise_id is null: searches for an existing Franchise by name, auto-creates if missing.
    """
    final_franchise_id = franchise_id

    if not final_franchise_id:
        # Consolidate non-empty names
        valid_names = {str(v).strip() for v in names.values() if v and str(v).strip()}

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_roman.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Series: {final_franchise_id}"
            )
        else:
            # Auto-create the missing Franchise
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Anime",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()  # Flush to assign the ID immediately
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Series: {final_franchise_id}"
            )

    return final_franchise_id


def resolve_anime_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensure grabbing the correct UUID for the parent entities or create new ones if missing.
    e.g. resolve typing franchise name in franchise_id field.
    1. If franchise is null: searches for an existing one by name, auto-creates if missing.
    2. If series_id is null, it remains null.
    """
    final_franchise_id = franchise_id

    # Resolve Franchise
    if not final_franchise_id:
        search_conditions = []
        valid_names = set()

        for lang_key in ["en", "cn", "roman", "jp", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_roman.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing_franchise = None
        if search_conditions:
            existing_franchise = (
                db.query(Franchise).filter(or_(*search_conditions)).first()
            )

        if existing_franchise:
            final_franchise_id = existing_franchise.system_id
            logger.info(
                f"Auto-resolved existing Franchise via name match: {final_franchise_id}"
            )
        else:
            new_franchise = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Anime",  # Default type
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_roman=names.get("roman"),
                franchise_name_jp=names.get("jp"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_franchise)
            db.flush()  # Flush to get the ID without committing
            final_franchise_id = new_franchise.system_id
            logger.info(f"Auto-created missing Franchise: {final_franchise_id}")

    # 2. Resolve Series
    # We only attach a series if the frontend explicitly passes a valid series_id.
    # If the field for series is null, we leave it null.
    final_series_id = series_id

    return final_franchise_id, final_series_id


def resolve_anime_movie_parent_hierarchy(
    db: Session, franchise_id: Any, names: Dict[str, Any]
) -> Any:
    """
    Ensures a valid franchise_id UUID for an AnimeMovies entry.
    If franchise_id is null or a string name: searches by name, auto-creates if missing.
    """
    if franchise_id and not isinstance(franchise_id, str):
        return franchise_id

    valid_names = set()
    for lang_key in ["en", "cn", "roman", "jp", "alt"]:
        name_val = names.get(lang_key)
        if name_val and str(name_val).strip():
            valid_names.add(str(name_val).strip())

    search_conditions = []
    for name_str in valid_names:
        search_conditions.extend(
            [
                Franchise.franchise_name_en.ilike(name_str),
                Franchise.franchise_name_cn.ilike(name_str),
                Franchise.franchise_name_roman.ilike(name_str),
                Franchise.franchise_name_jp.ilike(name_str),
                Franchise.franchise_name_alt.ilike(name_str),
            ]
        )

    existing = None
    if search_conditions:
        existing = db.query(Franchise).filter(or_(*search_conditions)).first()

    if existing:
        logger.info(
            f"Auto-resolved existing Franchise for AnimeMovie: {existing.system_id}"
        )
        return existing.system_id

    new_fran = Franchise(
        system_id=str(uuid.uuid4()),
        franchise_type="Anime",
        franchise_name_en=names.get("en"),
        franchise_name_cn=names.get("cn"),
        franchise_name_roman=names.get("roman"),
        franchise_name_jp=names.get("jp"),
        franchise_name_alt=names.get("alt"),
        created_at=get_taipei_now(),
        updated_at=get_taipei_now(),
    )
    db.add(new_fran)
    db.flush()
    logger.info(f"Auto-created missing Franchise for AnimeMovie: {new_fran.system_id}")
    return new_fran.system_id


def resolve_movie_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensures valid franchise_id and series_id UUIDs for a Movies entry.
    Franchise: searches by name, auto-creates if missing.
    Series: searches by name if a string is provided; does not auto-create.
    Returns (final_franchise_id, final_series_id).
    """
    # Resolve Franchise
    if franchise_id and not isinstance(franchise_id, str):
        final_franchise_id = franchise_id
    else:
        valid_names = set()
        for lang_key in ["en", "cn", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Movie: {final_franchise_id}"
            )
        else:
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Movie",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Movie: {final_franchise_id}"
            )

    # Resolve Series: look up by name if a string was provided; no auto-create
    final_series_id = series_id
    if series_id and isinstance(series_id, str) and series_id.strip():
        sname = series_id.strip()
        existing_series = (
            db.query(Series)
            .filter(
                or_(
                    Series.series_name_en.ilike(sname),
                    Series.series_name_cn.ilike(sname),
                    Series.series_name_alt.ilike(sname),
                )
            )
            .first()
        )
        if existing_series:
            final_series_id = existing_series.system_id
            logger.info(f"Auto-resolved existing Series for Movie: {final_series_id}")
        else:
            final_series_id = None
            logger.warning(
                f"Could not resolve Series by name '{sname}' for Movie. Setting to null."
            )

    return final_franchise_id, final_series_id


def resolve_tv_show_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensures valid franchise_id and series_id UUIDs for a TVShows entry.
    Franchise: valid UUID pass-through; null/string → search by name; not found → auto-create with
    franchise_type="TV".
    Series: non-string pass-through; non-empty string → search by name; not found → set null (no auto-create).
    Returns (final_franchise_id, final_series_id).
    """
    if franchise_id and not isinstance(franchise_id, str):
        final_franchise_id = franchise_id
    else:
        valid_names = set()
        for lang_key in ["en", "cn", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for TV Show: {final_franchise_id}"
            )
        else:
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="TV",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for TV Show: {final_franchise_id}"
            )

    final_series_id = series_id
    if series_id and isinstance(series_id, str) and series_id.strip():
        sname = series_id.strip()
        existing_series = (
            db.query(Series)
            .filter(
                or_(
                    Series.series_name_en.ilike(sname),
                    Series.series_name_cn.ilike(sname),
                    Series.series_name_alt.ilike(sname),
                )
            )
            .first()
        )
        if existing_series:
            final_series_id = existing_series.system_id
            logger.info(f"Auto-resolved existing Series for TV Show: {final_series_id}")
        else:
            final_series_id = None
            logger.warning(
                f"Could not resolve Series by name '{sname}' for TV Show. Setting to null."
            )

    return final_franchise_id, final_series_id


def resolve_cartoon_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensures valid franchise_id and series_id UUIDs for a Cartoon entry.
    Franchise: valid UUID pass-through; null/string → search by name; not found → auto-create with
    franchise_type="Cartoon".
    Series: non-string pass-through; non-empty string → search by name; not found → set null.
    Returns (final_franchise_id, final_series_id).
    """
    if franchise_id and not isinstance(franchise_id, str):
        final_franchise_id = franchise_id
    else:
        valid_names = set()
        for lang_key in ["en", "cn", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Cartoon: {final_franchise_id}"
            )
        else:
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Cartoon",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Cartoon: {final_franchise_id}"
            )

    final_series_id = series_id
    if series_id and isinstance(series_id, str) and series_id.strip():
        sname = series_id.strip()
        existing_series = (
            db.query(Series)
            .filter(
                or_(
                    Series.series_name_en.ilike(sname),
                    Series.series_name_cn.ilike(sname),
                    Series.series_name_alt.ilike(sname),
                )
            )
            .first()
        )
        if existing_series:
            final_series_id = existing_series.system_id
            logger.info(f"Auto-resolved existing Series for Cartoon: {final_series_id}")
        else:
            final_series_id = None
            logger.warning(
                f"Could not resolve Series by name '{sname}' for Cartoon. Setting to null."
            )

    return final_franchise_id, final_series_id


def resolve_manga_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensures valid franchise_id and series_id UUIDs for a Manga entry.
    Franchise: valid UUID pass-through; null/string → search by name across all name fields;
    not found → auto-create with franchise_type="ACG".
    Series: non-string pass-through; non-empty string → search by name; not found → set null.
    Returns (final_franchise_id, final_series_id).
    """
    if franchise_id and not isinstance(franchise_id, str):
        final_franchise_id = franchise_id
    else:
        valid_names = set()
        for lang_key in ["en", "cn", "roman", "jp", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_roman.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Manga: {final_franchise_id}"
            )
        else:
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="ACG",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_roman=names.get("roman"),
                franchise_name_jp=names.get("jp"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Manga: {final_franchise_id}"
            )

    final_series_id = series_id
    if series_id and isinstance(series_id, str) and series_id.strip():
        sname = series_id.strip()
        existing_series = (
            db.query(Series)
            .filter(
                or_(
                    Series.series_name_en.ilike(sname),
                    Series.series_name_cn.ilike(sname),
                    Series.series_name_alt.ilike(sname),
                )
            )
            .first()
        )
        if existing_series:
            final_series_id = existing_series.system_id
            logger.info(f"Auto-resolved existing Series for Manga: {final_series_id}")
        else:
            final_series_id = None
            logger.warning(
                f"Could not resolve Series by name '{sname}' for Manga. Setting to null."
            )

    return final_franchise_id, final_series_id


def resolve_novel_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensures valid franchise_id and series_id UUIDs for a Novel entry.
    Franchise: valid UUID pass-through; null/string → search by name across all name fields;
    not found → auto-create with franchise_type="Novel".
    Series: non-string pass-through; non-empty string → search by name; not found → set null.
    Returns (final_franchise_id, final_series_id).
    """
    if franchise_id and not isinstance(franchise_id, str):
        final_franchise_id = franchise_id
    else:
        valid_names = set()
        for lang_key in ["en", "cn", "roman", "jp", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_roman.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Novel: {final_franchise_id}"
            )
        else:
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Novel",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_roman=names.get("roman"),
                franchise_name_jp=names.get("jp"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Novel: {final_franchise_id}"
            )

    final_series_id = series_id
    if isinstance(series_id, str):
        if series_id.strip():
            series_obj = (
                db.query(Series)
                .filter(
                    or_(
                        Series.series_name_en == series_id,
                        Series.series_name_cn == series_id,
                        Series.series_name_alt == series_id,
                    )
                )
                .first()
            )
            final_series_id = series_obj.system_id if series_obj else None
        else:
            final_series_id = None

    return final_franchise_id, final_series_id


# ==========================================
# CHECKING LOGICS
# ==========================================


def apply_validate_episode_math(entry: Union[Anime, TVShows, Cartoon]) -> bool:
    ep_total = getattr(entry, "ep_total", None)
    ep_fin = getattr(entry, "ep_fin", None)
    if ep_total is None and ep_fin is None:
        return False
    safe_total, safe_fin = validate_episode_math(ep_total, ep_fin)
    if ep_total != safe_total or ep_fin != safe_fin:
        entry.ep_total = safe_total
        entry.ep_fin = safe_fin
        return True
    return False


def apply_validate_vol_math(manga: Manga) -> bool:
    """Clamps vol_fin <= vol_total. Returns True if any value changed."""
    safe_total, safe_fin = validate_vol_math(manga.vol_total, manga.vol_fin)
    changed = manga.vol_total != safe_total or manga.vol_fin != safe_fin
    if changed:
        manga.vol_total = safe_total
        manga.vol_fin = safe_fin
    return changed


def apply_validate_ch_math(manga: Manga) -> bool:
    """Clamps ch_fin <= ch_total. Returns True if any value changed."""
    safe_total, safe_fin = validate_ch_math(manga.ch_total, manga.ch_fin)
    changed = manga.ch_total != safe_total or manga.ch_fin != safe_fin
    if changed:
        manga.ch_total = safe_total
        manga.ch_fin = safe_fin
    return changed


def has_missing_values_anime(anime: Anime) -> bool:
    """
    Evaluates an anime entry against the ANIME_FIELDS_TO_FILL list.
    Returns True if any required fields are missing, False if fully populated.

    Business Rules:
    1. If 'Not Yet Aired', ignores missing mal_rating and mal_rank.
    2. Detects missing 'ep_previous' ONLY if it meets specific Execution Conditions.
    """
    missing_fields = []

    for field in ANIME_FIELDS_TO_FILL:
        val = getattr(anime, field, None)
        if val is None or str(val).strip() == "":
            missing_fields.append(field)

    # Exception Rule: "Not Yet Aired" entries don't have ratings/ranks yet
    if anime.airing_status == "Not Yet Aired":
        missing_fields = [
            f for f in missing_fields if f not in ("mal_rating", "mal_rank")
        ]

    # Clean out ep_previous if it was caught by the general loop
    if "ep_previous" in missing_fields:
        missing_fields.remove("ep_previous")

    # Custom Execution Condition for ep_previous
    if anime.ep_previous is None:
        is_tv_or_ona = anime.airing_type in ["TV", "ONA"]
        no_ep_special = anime.ep_special is None
        has_season = bool(anime.season_part and str(anime.season_part).strip())

        if is_tv_or_ona and no_ep_special and has_season:
            missing_fields.append("ep_previous")

    return len(missing_fields) > 0


def has_missing_values_anime_movie(anime_movie: AnimeMovies) -> bool:
    """
    Returns True if any required field is blank.
    Skips mal_rating and mal_rank for 'Not Yet Aired' entries.
    """
    missing = []
    for field in ANIME_MOVIE_FIELDS_TO_FILL:
        val = getattr(anime_movie, field, None)
        if val is None or str(val).strip() == "":
            missing.append(field)

    if anime_movie.airing_status == "Not Yet Aired":
        missing = [f for f in missing if f not in ("mal_rating", "mal_rank")]

    return len(missing) > 0


def has_missing_values_movie(movie) -> bool:
    """Returns True if any required Movies field is missing."""
    for field in MOVIE_FIELDS_TO_FILL:
        val = getattr(movie, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_tv_show(tv_show: TVShows) -> bool:
    """Returns True if any required TVShows field is missing."""
    for field in TV_SHOW_FIELDS_TO_FILL:
        val = getattr(tv_show, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_cartoon(cartoon: Cartoon) -> bool:
    """Returns True if any required Cartoon field is missing."""
    fields = (
        CARTOON_MOVIE_FIELDS_TO_FILL
        if cartoon.airing_type == "Movie"
        else CARTOON_TV_FIELDS_TO_FILL
    )
    for field in fields:
        val = getattr(cartoon, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_manga(manga: Manga) -> bool:
    """
    Returns True if any required fill field is blank.
    Special case: vol_total and ch_total are only required when serialization_status == "完結".
    """
    for field in MANGA_FIELDS_TO_FILL:
        val = getattr(manga, field, None)
        if val is None or str(val).strip() == "":
            return True

    if manga.serialization_status == "完結":
        if manga.vol_total is None and manga.ch_total is None:
            return True

    return False


def has_missing_values_novel(novel: Novel) -> bool:
    """
    Returns True if any required fill field is blank.
    Special case: vol_total_original and ch_total are only required when serialization_status == "完結".
    Gate: if mal_link is null, returns False (skip entirely — no MAL data source available).
    """
    if novel.mal_link is None:
        return False

    for field in NOVEL_FIELDS_TO_FILL:
        val = getattr(novel, field, None)
        if val is None or str(val).strip() == "":
            return True

    if novel.serialization_status == "完結":
        if novel.vol_total_original is None and novel.ch_total is None:
            return True

    return False


def check_is_tv_completed(entry: Union[Anime, TVShows, Cartoon]) -> bool:
    """
    Determine if a Watching-type entry (Anime, Anime Movie, Movie, TV Show, Cartoon)
    should be considered completed.
    Returns True if watching_status is 'Completed' or ep_fin equals ep_total.
    """
    if entry.watching_status == "Completed":
        return True

    ep_total = getattr(entry, "ep_total", None)
    ep_fin = getattr(entry, "ep_fin", None)
    if ep_total is not None and ep_total > 0 and ep_fin == ep_total:
        return True

    return False


def check_is_movie_completed(entry: Union[AnimeMovies, Movies]) -> bool:
    """
    Determine if a Watching-type entry (Anime, Anime Movie, Movie, TV Show, Cartoon)
    should be considered completed.
    Returns True if watching_status is 'Completed' or ep_fin equals ep_total.
    """
    if entry.watching_status == "Completed":
        return True

    return False


def check_is_reading_completed(entry: Manga) -> bool:
    """
    Returns True if a manga entry should be considered completed.
    Conditions (any one is sufficient):
    - serialization_status is "完結" or "腰斬"
    - ch_fin == ch_total and ch_total is not None and not 0
    - vol_fin == vol_total and vol_total is not None and not 0
    """
    if entry.serialization_status in ("完結", "腰斬"):
        return True
    ch_total = getattr(entry, "ch_total", None)
    ch_fin = getattr(entry, "ch_fin", None)
    if ch_total is not None and ch_total > 0 and ch_fin == ch_total:
        return True
    vol_total = getattr(entry, "vol_total", None)
    vol_fin = getattr(entry, "vol_fin", None)
    if vol_total is not None and vol_total > 0 and vol_fin == vol_total:
        return True
    return False


def apply_check_baha(entry: Union[Anime, AnimeMovies]) -> None:
    """Sets source_baha=True if baha_link is present and airing_status is 'Airing'."""
    if (
        entry.baha_link
        and entry.airing_status == "Airing"
        and entry.source_baha is None
    ):
        entry.source_baha = True


def find_all_remarks(db: Session) -> dict:
    """Returns all entries with a non-empty remark, grouped by media type."""

    def _query(model):
        return (
            db.query(model)
            .filter(model.remark.isnot(None), model.remark != "")
            .order_by(model.updated_at.desc())
            .all()
        )

    return {
        "anime": [
            {
                "system_id": str(e.system_id),
                "anime_name_cn": e.anime_name_cn,
                "anime_name_en": e.anime_name_en,
                "airing_type": e.airing_type,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(Anime)
        ],
        "anime_movie": [
            {
                "system_id": str(e.system_id),
                "anime_movie_name_cn": e.anime_movie_name_cn,
                "anime_movie_name_en": e.anime_movie_name_en,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(AnimeMovies)
        ],
        "movie": [
            {
                "system_id": str(e.system_id),
                "movie_name_cn": e.movie_name_cn,
                "movie_name_en": e.movie_name_en,
                "release_date_usa": e.release_date_usa,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(Movies)
        ],
        "tv_show": [
            {
                "system_id": str(e.system_id),
                "tv_name_cn": e.tv_name_cn,
                "tv_name_en": e.tv_name_en,
                "season_part": e.season_part,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(TVShows)
        ],
        "cartoon": [
            {
                "system_id": str(e.system_id),
                "cartoon_name_cn": e.cartoon_name_cn,
                "cartoon_name_en": e.cartoon_name_en,
                "airing_type": e.airing_type,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(Cartoon)
        ],
        "manga": [
            {
                "system_id": str(e.system_id),
                "manga_name_cn": e.manga_name_cn,
                "manga_name_en": e.manga_name_en,
                "is_main": e.is_main,
                "reading_status": e.reading_status,
                "remark": e.remark,
            }
            for e in _query(Manga)
        ],
    }


# ==========================================
# DUPLICATE CHECKS
# ==========================================


def find_duplicate_franchises(db: Session) -> list[list[dict]]:
    """
    Finds Franchise entries that share the same franchise_type and at least one
    identical name field (case-insensitive). Uses union-find so transitive matches
    (A=B, B=C) collapse into the same group.
    Returns a list of duplicate clusters; each cluster is a list of franchise dicts.
    """
    franchises = db.query(Franchise).all()

    by_type: dict[str, list] = {}
    for f in franchises:
        ft_raw = (f.franchise_type or "").strip()
        tokens = [t.strip() for t in ft_raw.split(",") if t.strip()]
        for token in tokens if tokens else ([ft_raw] if ft_raw else []):
            by_type.setdefault(token, []).append(f)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    franchise_map = {str(f.system_id): f for f in franchises}

    for group in by_type.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for fid in franchise_map:
        clusters.setdefault(find(fid), []).append(fid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": fid,
                        "franchise_type": franchise_map[fid].franchise_type,
                        "franchise_name_en": franchise_map[fid].franchise_name_en,
                        "franchise_name_cn": franchise_map[fid].franchise_name_cn,
                        "franchise_name_roman": franchise_map[fid].franchise_name_roman,
                        "franchise_name_jp": franchise_map[fid].franchise_name_jp,
                        "franchise_name_alt": franchise_map[fid].franchise_name_alt,
                    }
                    for fid in members
                ]
            )

    return result


def find_duplicate_series(db: Session) -> list[list[dict]]:
    """
    Finds Series entries that share the same franchise_id and at least one
    identical name field (case-insensitive). Uses union-find so transitive matches
    collapse into the same group.
    Returns a list of duplicate clusters; each cluster is a list of series dicts.
    """
    series_list = db.query(Series).filter(Series.franchise_id.isnot(None)).all()

    by_franchise: dict[str, list] = {}
    for s in series_list:
        by_franchise.setdefault(str(s.franchise_id), []).append(s)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    series_map = {str(s.system_id): s for s in series_list}

    for group in by_franchise.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for sid in series_map:
        clusters.setdefault(find(sid), []).append(sid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": sid,
                        "franchise_id": str(series_map[sid].franchise_id),
                        "series_name_en": series_map[sid].series_name_en,
                        "series_name_cn": series_map[sid].series_name_cn,
                        "series_name_alt": series_map[sid].series_name_alt,
                    }
                    for sid in members
                ]
            )

    return result


def _anime_duplicate_key(a: Anime) -> tuple:
    season = (a.season_part or "").strip().lower() or None
    return (
        str(a.franchise_id) if a.franchise_id else None,
        str(a.series_id) if a.series_id else None,
        a.airing_type,
        season,
        a.is_main,
        a.ep_special,
    )


def find_duplicate_anime(db: Session) -> list[list[dict]]:
    """
    Finds Anime entries that share the same franchise_id, series_id, airing_type,
    season_part, is_main, and ep_special, AND at least one identical name field
    (case-insensitive). Uses union-find so transitive matches collapse into one group.
    Returns a list of duplicate clusters; each cluster is a list of anime dicts.
    """
    animes = db.query(Anime).all()

    by_key: dict[tuple, list] = {}
    for a in animes:
        by_key.setdefault(_anime_duplicate_key(a), []).append(a)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    anime_map = {str(a.system_id): a for a in animes}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for aid in anime_map:
        clusters.setdefault(find(aid), []).append(aid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            a = anime_map[members[0]]
            result.append(
                [
                    {
                        "system_id": aid,
                        "franchise_id": (
                            str(anime_map[aid].franchise_id)
                            if anime_map[aid].franchise_id
                            else None
                        ),
                        "series_id": (
                            str(anime_map[aid].series_id)
                            if anime_map[aid].series_id
                            else None
                        ),
                        "airing_type": anime_map[aid].airing_type,
                        "season_part": anime_map[aid].season_part,
                        "is_main": anime_map[aid].is_main,
                        "ep_special": anime_map[aid].ep_special,
                        "anime_name_en": anime_map[aid].anime_name_en,
                        "anime_name_cn": anime_map[aid].anime_name_cn,
                        "anime_name_roman": anime_map[aid].anime_name_roman,
                        "anime_name_jp": anime_map[aid].anime_name_jp,
                        "anime_name_alt": anime_map[aid].anime_name_alt,
                    }
                    for aid in members
                ]
            )

    return result


def find_duplicate_system_options(db: Session) -> list[list[dict]]:
    """
    Finds SystemOption entries that share the same category and option_value
    (case-insensitive). Returns a list of duplicate clusters; each cluster is
    a list of system option dicts.
    """
    options = db.query(SystemOption).all()

    groups: dict[tuple, list] = {}
    for opt in options:
        key = (
            (opt.category or "").strip().lower(),
            (opt.option_value or "").strip().lower(),
        )
        groups.setdefault(key, []).append(opt)

    return [
        [
            {"id": opt.id, "category": opt.category, "option_value": opt.option_value}
            for opt in members
        ]
        for members in groups.values()
        if len(members) > 1
    ]


def find_duplicate_anime_movie(db: Session) -> list[list[dict]]:
    """
    Finds AnimeMovies entries that share the same franchise_id and at least one
    identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    movies = db.query(AnimeMovies).filter(AnimeMovies.franchise_id.isnot(None)).all()

    by_franchise: dict[str, list] = {}
    for m in movies:
        by_franchise.setdefault(str(m.franchise_id), []).append(m)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    movie_map = {str(m.system_id): m for m in movies}

    for group in by_franchise.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for mid in movie_map:
        clusters.setdefault(find(mid), []).append(mid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": mid,
                        "franchise_id": str(movie_map[mid].franchise_id),
                        "anime_movie_name_en": movie_map[mid].anime_movie_name_en,
                        "anime_movie_name_cn": movie_map[mid].anime_movie_name_cn,
                        "anime_movie_name_roman": movie_map[mid].anime_movie_name_roman,
                        "anime_movie_name_jp": movie_map[mid].anime_movie_name_jp,
                        "anime_movie_name_alt": movie_map[mid].anime_movie_name_alt,
                    }
                    for mid in members
                ]
            )

    return result


def find_duplicate_movie(db: Session) -> list[list[dict]]:
    """
    Finds Movies entries that share the same (franchise_id, series_id) and at least one
    identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    movies = db.query(Movies).filter(Movies.franchise_id.isnot(None)).all()

    by_key: dict[tuple, list] = {}
    for m in movies:
        key = (
            str(m.franchise_id),
            str(m.series_id) if m.series_id else None,
        )
        by_key.setdefault(key, []).append(m)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    movie_map = {str(m.system_id): m for m in movies}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for mid in movie_map:
        clusters.setdefault(find(mid), []).append(mid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": mid,
                        "franchise_id": str(movie_map[mid].franchise_id),
                        "series_id": (
                            str(movie_map[mid].series_id)
                            if movie_map[mid].series_id
                            else None
                        ),
                        "movie_name_en": movie_map[mid].movie_name_en,
                        "movie_name_cn": movie_map[mid].movie_name_cn,
                        "movie_name_alt": movie_map[mid].movie_name_alt,
                    }
                    for mid in members
                ]
            )

    return result


def find_duplicate_tv_show(db: Session) -> list[list[dict]]:
    """
    Finds TVShows entries that share the same (franchise_id, series_id, season_part, is_main)
    and at least one identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    shows = db.query(TVShows).filter(TVShows.franchise_id.isnot(None)).all()

    def _key(t: TVShows) -> tuple:
        season = (t.season_part or "").strip().lower() or None
        return (
            str(t.franchise_id),
            str(t.series_id) if t.series_id else None,
            season,
            t.is_main,
        )

    by_key: dict[tuple, list] = {}
    for t in shows:
        by_key.setdefault(_key(t), []).append(t)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    show_map = {str(t.system_id): t for t in shows}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for tid in show_map:
        clusters.setdefault(find(tid), []).append(tid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": tid,
                        "franchise_id": str(show_map[tid].franchise_id),
                        "series_id": (
                            str(show_map[tid].series_id)
                            if show_map[tid].series_id
                            else None
                        ),
                        "season_part": show_map[tid].season_part,
                        "is_main": show_map[tid].is_main,
                        "tv_name_en": show_map[tid].tv_name_en,
                        "tv_name_cn": show_map[tid].tv_name_cn,
                        "tv_name_alt": show_map[tid].tv_name_alt,
                    }
                    for tid in members
                ]
            )

    return result


def find_duplicate_cartoon(db: Session) -> list[list[dict]]:
    """
    Finds Cartoon entries that share the same (franchise_id, series_id, season_part, is_main)
    and at least one identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    cartoons = db.query(Cartoon).filter(Cartoon.franchise_id.isnot(None)).all()

    def _key(c: Cartoon) -> tuple:
        season = (c.season_part or "").strip().lower() or None
        return (
            str(c.franchise_id),
            str(c.series_id) if c.series_id else None,
            season,
            c.is_main,
        )

    by_key: dict[tuple, list] = {}
    for c in cartoons:
        by_key.setdefault(_key(c), []).append(c)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    cartoon_map = {str(c.system_id): c for c in cartoons}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for cid in cartoon_map:
        clusters.setdefault(find(cid), []).append(cid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": cid,
                        "franchise_id": str(cartoon_map[cid].franchise_id),
                        "series_id": (
                            str(cartoon_map[cid].series_id)
                            if cartoon_map[cid].series_id
                            else None
                        ),
                        "season_part": cartoon_map[cid].season_part,
                        "is_main": cartoon_map[cid].is_main,
                        "cartoon_name_en": cartoon_map[cid].cartoon_name_en,
                        "cartoon_name_cn": cartoon_map[cid].cartoon_name_cn,
                        "cartoon_name_alt": cartoon_map[cid].cartoon_name_alt,
                    }
                    for cid in members
                ]
            )

    return result


def find_duplicate_manga(db: Session) -> list[list[dict]]:
    """
    Finds Manga entries that share the same (franchise_id, series_id, is_main)
    and at least one identical name field (case-insensitive). Uses union-find for transitive closure.
    """
    mangas = db.query(Manga).filter(Manga.franchise_id.isnot(None)).all()

    def _key(m: Manga) -> tuple:
        return (
            str(m.franchise_id),
            str(m.series_id) if m.series_id else None,
            m.is_main,
        )

    by_key: dict[tuple, list] = {}
    for m in mangas:
        by_key.setdefault(_key(m), []).append(m)

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        root = x
        while parent.get(root, root) != root:
            root = parent[root]
        while parent.get(x, x) != root:
            nxt = parent.get(x, x)
            parent[x] = root
            x = nxt
        return root

    def union(x: str, y: str) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    manga_map = {str(m.system_id): m for m in mangas}

    for group in by_key.values():
        for i in range(len(group)):
            a_names = group[i].get_all_names()
            for j in range(i + 1, len(group)):
                if a_names & group[j].get_all_names():
                    union(str(group[i].system_id), str(group[j].system_id))

    clusters: dict[str, list[str]] = {}
    for mid in manga_map:
        clusters.setdefault(find(mid), []).append(mid)

    result = []
    for members in clusters.values():
        if len(members) > 1:
            result.append(
                [
                    {
                        "system_id": mid,
                        "franchise_id": str(manga_map[mid].franchise_id),
                        "series_id": (
                            str(manga_map[mid].series_id)
                            if manga_map[mid].series_id
                            else None
                        ),
                        "is_main": manga_map[mid].is_main,
                        "manga_name_cn": manga_map[mid].manga_name_cn,
                        "manga_name_en": manga_map[mid].manga_name_en,
                        "manga_name_roman": manga_map[mid].manga_name_roman,
                        "manga_name_jp": manga_map[mid].manga_name_jp,
                        "manga_name_alt": manga_map[mid].manga_name_alt,
                    }
                    for mid in members
                ]
            )

    return result


def find_all_duplicates(db: Session) -> dict:
    """Runs all duplicate checks and returns a combined report."""
    return {
        "franchise": find_duplicate_franchises(db),
        "series": find_duplicate_series(db),
        "anime": find_duplicate_anime(db),
        "anime_movie": find_duplicate_anime_movie(db),
        "cartoon": find_duplicate_cartoon(db),
        "movie": find_duplicate_movie(db),
        "tv_show": find_duplicate_tv_show(db),
        "manga": find_duplicate_manga(db),
        "system_options": find_duplicate_system_options(db),
    }


# ==========================================
# FILL MISSING ENTRY DATA
# ==========================================


def apply_extract_mal_id_anime(anime: Anime) -> bool:
    mal_id = extract_mal_id_anime(anime.mal_link)
    if mal_id:
        anime.mal_id = mal_id
        return True
    return False


def apply_extract_mal_id_manga_novel(entry: Union[Manga, Novel]) -> bool:
    """Extracts MAL manga ID from mal_link and writes it to mal_id. Returns True if set."""
    mal_id = extract_mal_id_manga_novel(entry.mal_link)
    if mal_id:
        entry.mal_id = mal_id
        return True
    return False


def apply_extract_imdb_id(entry: Union[Movies, TVShows, Cartoon]) -> bool:
    """Extracts IMDb ID from imdb_link and writes it to imdb_id. Returns True if set."""
    imdb_id = extract_imdb_id(entry.imdb_link)
    if imdb_id:
        entry.imdb_id = imdb_id
        return True
    return False


def apply_extract_season_from_title(entry: Union[Anime, TVShows, Cartoon]) -> bool:
    if isinstance(entry, Cartoon):
        title = entry.cartoon_name_en or ""
    elif isinstance(entry, TVShows):
        title = entry.tv_name_en or ""
    else:
        title = entry.anime_name_en or entry.anime_name_roman or ""
    extracted = extract_season_from_title(title)
    if extracted:
        entry.season_part = extracted
        return True
    return False


def apply_calculate_seasonal_from_month(anime: Anime) -> bool:
    if (
        anime.release_season is None
        and anime.release_month is not None
        and anime.airing_type in ("TV", "ONA")
    ):
        season = calculate_seasonal_from_month(anime.release_month)
        if season:
            anime.release_season = season
            return True
    return False


def derive_watch_order_anime(db: Session, franchise_id: Any) -> None:
    """
    Assigns watch_order to eligible entries within an acg franchise.
    Eligible: airing_type not null/Other, season_part set.
    Entries grouped by series (sorted by series name), no-series entries last.
    Within each group, sorted by season/part then airing_type (TV, ONA, Special, OVA, OAD).
    Only fills entries where watch_order is None. Order is consecutive across all groups.
    """
    if not franchise_id:
        return

    eligible = (
        db.query(Anime)
        .filter(
            Anime.franchise_id == franchise_id,
            Anime.season_part.isnot(None),
            Anime.airing_type.isnot(None),
            Anime.airing_type.not_in(["Other"]),
        )
        .all()
    )

    if not eligible:
        return

    def get_sort_key(a: Anime):
        s_part = str(a.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        type_order = _AIRING_TYPE_ORDER.get(a.airing_type or "", 99)
        return (s_num, p_num, type_order)

    # Separate into series groups and no-series group
    series_groups: dict = {}
    no_series: list = []

    for anime in eligible:
        if anime.series_id:
            series_groups.setdefault(anime.series_id, []).append(anime)
        else:
            no_series.append(anime)

    # Sort entries within each group
    for entries in series_groups.values():
        entries.sort(key=get_sort_key)
    no_series.sort(key=get_sort_key)

    # Order series groups by series display_name for deterministic ordering
    ordered_series_ids = list(series_groups.keys())
    if len(ordered_series_ids) > 1:
        series_objs = (
            db.query(Series).filter(Series.system_id.in_(ordered_series_ids)).all()
        )
        name_map = {s.system_id: (s.display_name or "") for s in series_objs}
        ordered_series_ids.sort(key=lambda sid: name_map.get(sid, ""))

    # Build final order: series groups first, no-series last
    ordered_entries = []
    for sid in ordered_series_ids:
        ordered_entries.extend(series_groups[sid])
    ordered_entries.extend(no_series)

    for position, entry in enumerate(ordered_entries, start=1):
        if entry.watch_order is None:
            entry.watch_order = float(position)


def derive_watch_order_tv_show(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    eligible = (
        db.query(TVShows)
        .filter(
            TVShows.franchise_id == franchise_id,
            TVShows.season_part.isnot(None),
        )
        .all()
    )

    if not eligible:
        return

    def get_sort_key(t: TVShows):
        s_part = str(t.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        return (s_num, p_num)

    series_groups: dict = {}
    no_series: list = []

    for show in eligible:
        if show.series_id:
            series_groups.setdefault(show.series_id, []).append(show)
        else:
            no_series.append(show)

    for entries in series_groups.values():
        entries.sort(key=get_sort_key)
    no_series.sort(key=get_sort_key)

    ordered_series_ids = list(series_groups.keys())
    if len(ordered_series_ids) > 1:
        series_objs = (
            db.query(Series).filter(Series.system_id.in_(ordered_series_ids)).all()
        )
        name_map = {s.system_id: (s.display_name or "") for s in series_objs}
        ordered_series_ids.sort(key=lambda sid: name_map.get(sid, ""))

    ordered_entries = []
    for sid in ordered_series_ids:
        ordered_entries.extend(series_groups[sid])
    ordered_entries.extend(no_series)

    for position, entry in enumerate(ordered_entries, start=1):
        if entry.watch_order is None:
            entry.watch_order = float(position)


def derive_watch_order_cartoon(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    eligible = (
        db.query(Cartoon)
        .filter(
            Cartoon.franchise_id == franchise_id,
            Cartoon.airing_type == "TV",
            Cartoon.season_part.isnot(None),
        )
        .all()
    )

    if not eligible:
        return

    def get_sort_key(c: Cartoon):
        s_part = str(c.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        return (s_num, p_num)

    series_groups: dict = {}
    no_series: list = []

    for cartoon in eligible:
        if cartoon.series_id:
            series_groups.setdefault(cartoon.series_id, []).append(cartoon)
        else:
            no_series.append(cartoon)

    for entries in series_groups.values():
        entries.sort(key=get_sort_key)
    no_series.sort(key=get_sort_key)

    ordered_series_ids = list(series_groups.keys())
    if len(ordered_series_ids) > 1:
        series_objs = (
            db.query(Series).filter(Series.system_id.in_(ordered_series_ids)).all()
        )
        name_map = {s.system_id: (s.display_name or "") for s in series_objs}
        ordered_series_ids.sort(key=lambda sid: name_map.get(sid, ""))

    ordered_entries = []
    for sid in ordered_series_ids:
        ordered_entries.extend(series_groups[sid])
    ordered_entries.extend(no_series)

    for position, entry in enumerate(ordered_entries, start=1):
        if entry.watch_order is None:
            entry.watch_order = float(position)


def derive_prequel_sequel_anime(db: Session, franchise_id: Any) -> None:
    """
    Derives prequel_id and sequel_id for eligible entries within an acg franchise.
    Eligible: watch_order is not null.
    Entries are ordered by watch_order; only fills fields that are currently None.
    """
    if not franchise_id:
        return

    entries = (
        db.query(Anime)
        .filter(
            Anime.franchise_id == franchise_id,
            Anime.watch_order.isnot(None),
            Anime.derive_related.isnot(False),
        )
        .order_by(Anime.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_TV_SPECIAL_FRANCHISE_NAMES = {
    "獨立電影 / 影集",
    "Marvel",
    "Disney",
    "Christopher Nolan",
    "周星馳",
}


def derive_prequel_sequel_tv_show(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    franchise = db.query(Franchise).filter(Franchise.system_id == franchise_id).first()
    if franchise:
        franchise_names = franchise.get_all_names()
        if franchise_names & _TV_SPECIAL_FRANCHISE_NAMES:
            return

    entries = (
        db.query(TVShows)
        .filter(
            TVShows.franchise_id == franchise_id,
            TVShows.watch_order.isnot(None),
            TVShows.derive_related.isnot(False),
        )
        .order_by(TVShows.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_CARTOON_SPECIAL_FRANCHISE_NAMES: set[str] = set()


def derive_prequel_sequel_cartoon(db: Session, franchise_id) -> None:
    if not franchise_id:
        return

    franchise = db.query(Franchise).filter(Franchise.system_id == franchise_id).first()
    if franchise:
        franchise_names = franchise.get_all_names()
        if franchise_names & _CARTOON_SPECIAL_FRANCHISE_NAMES:
            return

    entries = (
        db.query(Cartoon)
        .filter(
            Cartoon.franchise_id == franchise_id,
            Cartoon.watch_order.isnot(None),
            Cartoon.derive_related.isnot(False),
        )
        .order_by(Cartoon.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_MANGA_SPECIAL_FRANCHISE_NAMES: set[str] = set()


def derive_prequel_sequel_manga(db: Session, franchise_id: Any) -> None:
    """Sets prequel_id and sequel_id for eligible manga entries in a franchise, fill-only."""
    if not franchise_id:
        return

    franchise = db.query(Franchise).filter(Franchise.system_id == franchise_id).first()
    if franchise:
        franchise_names = franchise.get_all_names()
        if franchise_names & _MANGA_SPECIAL_FRANCHISE_NAMES:
            return

    entries = (
        db.query(Manga)
        .filter(
            Manga.franchise_id == franchise_id,
            Manga.watch_order.isnot(None),
            Manga.derive_related.isnot(False),
        )
        .order_by(Manga.watch_order)
        .all()
    )

    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i < len(entries) - 1 else None

        if entry.prequel_id is None and prev_entry is not None:
            entry.prequel_id = prev_entry.system_id

        if entry.sequel_id is None and next_entry is not None:
            entry.sequel_id = next_entry.system_id


_SERIES_UNSET = object()


def derive_ep_previous_anime(
    db: Session, franchise_id: Any, series_id: Any = _SERIES_UNSET
) -> None:
    """
    Derives ep_previous for eligible anime entries within an acg franchise.
    Eligible: same franchise+series, airing_type TV/ONA, ep_special null, season_part set.
    Each series forms its own sibling group; no-series entries form their own group.
    When series_id is provided (including None for no-series), only that group is processed.
    When series_id is omitted, all groups in the franchise are processed.
    Only fills entries where ep_previous is currently None.
    """
    if not franchise_id:
        return

    def get_sort_key(a: Anime):
        s_part = str(a.season_part or "")
        s_match = SEASON_PATTERN.search(s_part)
        p_match = PART_PATTERN.search(s_part)
        s_num = int(s_match.group(1)) if s_match else 1
        p_num = int(p_match.group(1)) if p_match else 1
        return (s_num, p_num)

    def process_group(siblings: list) -> None:
        if not siblings:
            return
        sorted_siblings = sorted(siblings, key=get_sort_key)
        for i, entry in enumerate(sorted_siblings):
            if entry.ep_previous is not None:
                continue
            s_part_clean = str(entry.season_part).strip().lower()
            if s_part_clean in ("season 1", "season 1 part 1"):
                entry.ep_previous = 0
                continue
            if i == 0:
                break
            prev = sorted_siblings[i - 1]
            if not prev.ep_total:
                break
            if prev.ep_previous is None:
                break
            entry.ep_previous = prev.ep_previous + prev.ep_total

    base_query = db.query(Anime).filter(
        Anime.franchise_id == franchise_id,
        Anime.airing_type.in_(["TV", "ONA"]),
        Anime.ep_special.is_(None),
        Anime.season_part.isnot(None),
    )

    if series_id is not _SERIES_UNSET:
        # Specific group: series UUID or None (no-series)
        if series_id is None:
            base_query = base_query.filter(Anime.series_id.is_(None))
        else:
            base_query = base_query.filter(Anime.series_id == series_id)
        process_group(base_query.all())
    else:
        # All groups: partition by series_id and process each independently
        all_eligible = base_query.all()
        groups: dict = {}
        for anime in all_eligible:
            groups.setdefault(anime.series_id, []).append(anime)
        for group in groups.values():
            process_group(group)


def derive_season_1_anime(anime: Anime, db: Session) -> None:
    if anime.season_part is not None:
        return
    if not anime.franchise_id or anime.airing_type != "TV":
        return
    tv_count = (
        db.query(Anime)
        .filter(Anime.franchise_id == anime.franchise_id, Anime.airing_type == "TV")
        .count()
    )
    if tv_count == 1:
        anime.season_part = "Season 1"


def derive_season_1_tv_show(tv_show: TVShows, db: Session) -> None:
    if tv_show.season_part is not None:
        return
    if not tv_show.franchise_id:
        return
    count = (
        db.query(TVShows).filter(TVShows.franchise_id == tv_show.franchise_id).count()
    )
    if count == 1:
        tv_show.season_part = "Season 1"


def derive_season_1_cartoon(cartoon: Cartoon, db: Session) -> None:
    if cartoon.season_part is not None:
        return
    if not cartoon.franchise_id:
        return
    if cartoon.airing_type != "TV":
        return
    count = (
        db.query(Cartoon)
        .filter(
            Cartoon.franchise_id == cartoon.franchise_id,
            Cartoon.airing_type == "TV",
        )
        .count()
    )
    if count == 1:
        cartoon.season_part = "Season 1"


# ==========================================
# FILL FROM OTHER SOURCES
# ==========================================


def autofill_anime_from_mal(anime: Anime, force_replace_ratings: bool = True) -> None:
    """
    Dedicated logic to fetch MAL data via Jikan and enrich a single Anime entry.
    Fills empty fields and overwrites ratings/rankings if instructed.
    """
    mal_id = anime.mal_id
    if not mal_id:
        return

    anime.mal_id = mal_id

    try:
        # MAL Fetch Anime and Anime Movies
        raw_data = fetch_jikan_anime_data(mal_id)
        if not raw_data:
            return

        # MAL Conversion for Anime
        j_data = map_jikan_to_anime_data(raw_data)

        # Fill Missing Data
        if anime.airing_type is None:
            anime.airing_type = j_data.get("airing_type")
        if anime.airing_status is None:
            anime.airing_status = j_data.get("airing_status")
        if anime.release_month is None:
            anime.release_month = j_data.get("release_month")
        if anime.release_season is None:
            anime.release_season = j_data.get("release_season")
        if anime.release_year is None:
            anime.release_year = j_data.get("release_year")
        if anime.ep_total is None:
            anime.ep_total = j_data.get("ep_total")
        if not anime.official_link:
            anime.official_link = j_data.get("official_link")
        if not anime.twitter_link:
            anime.twitter_link = j_data.get("twitter_link")

        # Overwrite Ratings
        if force_replace_ratings or anime.mal_rating is None:
            anime.mal_rating = (
                j_data.get("mal_rating")
                if j_data.get("mal_rating")
                else anime.mal_rating
            )
        if force_replace_ratings or anime.mal_rank is None:
            anime.mal_rank = (
                str(j_data.get("mal_rank"))
                if j_data.get("mal_rank")
                else anime.mal_rank
            )

        # Conditionally Download Cover Image
        if not anime.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(anime.system_id)
            )
            if filename:
                anime.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Anime ID {anime.system_id} (MAL {mal_id}): {e}"
        )


def autofill_anime_movie_from_mal(
    anime_movie: AnimeMovies, force_replace_ratings: bool = True
) -> None:
    """
    Fetches Jikan data for a single AnimeMovies entry and fills/overwrites fields.
    Does not commit — caller is responsible.
    """
    mal_id = anime_movie.mal_id
    if not mal_id:
        return

    try:
        raw_data = fetch_jikan_anime_data(mal_id)
        if not raw_data:
            return

        j_data = map_jikan_to_anime_movie_data(raw_data)

        if anime_movie.airing_status is None:
            anime_movie.airing_status = j_data.get("airing_status")
        if anime_movie.release_date_jp is None:
            anime_movie.release_date_jp = j_data.get("release_date_jp")
        if not anime_movie.official_link:
            anime_movie.official_link = j_data.get("official_link")
        if not anime_movie.twitter_link:
            anime_movie.twitter_link = j_data.get("twitter_link")

        if force_replace_ratings or anime_movie.mal_rating is None:
            anime_movie.mal_rating = j_data.get("mal_rating") or anime_movie.mal_rating
        if force_replace_ratings or anime_movie.mal_rank is None:
            raw_rank = j_data.get("mal_rank")
            anime_movie.mal_rank = str(raw_rank) if raw_rank else anime_movie.mal_rank

        if not anime_movie.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(anime_movie.system_id)
            )
            if filename:
                anime_movie.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for AnimeMovie ID {anime_movie.system_id} (MAL {mal_id}): {e}"
        )


def autofill_manga_from_mal(manga: Manga, force_replace_ratings: bool = True) -> None:
    """
    Enriches a single Manga entry with Jikan API data. Does not commit — caller is responsible.
    Fill-only: serialization_status, release_year, end_year.
    vol_total and ch_total are filled only when serialization_status == "完結".
    Ratings always replaced when force_replace_ratings=True.
    """
    mal_id = manga.mal_id
    if not mal_id:
        return

    try:
        raw_data = fetch_jikan_manga_novel_data(mal_id)
        if not raw_data:
            return

        j_data = map_jikan_to_manga_data(raw_data)

        if manga.serialization_status is None:
            manga.serialization_status = j_data.get("serialization_status")
        if manga.release_year is None:
            manga.release_year = j_data.get("release_year")
        if manga.end_year is None:
            manga.end_year = j_data.get("end_year")

        if manga.serialization_status == "完結":
            if manga.vol_total is None:
                manga.vol_total = j_data.get("vol_total")
            if manga.ch_total is None:
                manga.ch_total = j_data.get("ch_total")

        if force_replace_ratings or manga.mal_rating is None:
            manga.mal_rating = j_data.get("mal_rating") or manga.mal_rating
        if force_replace_ratings or manga.mal_rank is None:
            raw_rank = j_data.get("mal_rank")
            manga.mal_rank = str(raw_rank) if raw_rank else manga.mal_rank

        if not manga.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(manga.system_id)
            )
            if filename:
                manga.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Manga ID {manga.system_id} (MAL {mal_id}): {e}"
        )


def autofill_novel_from_mal(novel: Novel, force_replace_ratings: bool = True) -> None:
    """
    Enriches a single Novel entry with Jikan API data. Does not commit — caller is responsible.
    Fill-only: serialization_status, release_year, end_year.
    vol_total_original and ch_total are filled only when serialization_status == "完結".
    Ratings always replaced when force_replace_ratings=True.
    """
    mal_id = novel.mal_id
    if not mal_id:
        return

    try:
        raw_data = fetch_jikan_manga_novel_data(mal_id)
        if not raw_data:
            return

        j_data = map_jikan_to_novel_data(raw_data)

        if novel.serialization_status is None:
            novel.serialization_status = j_data.get("serialization_status")
        if novel.release_year is None:
            novel.release_year = j_data.get("release_year")
        if novel.end_year is None:
            novel.end_year = j_data.get("end_year")

        if novel.serialization_status == "完結":
            if novel.vol_total_original is None:
                novel.vol_total_original = j_data.get("vol_total_original")
            if novel.ch_total is None:
                novel.ch_total = j_data.get("ch_total")

        if force_replace_ratings or novel.mal_rating is None:
            novel.mal_rating = j_data.get("mal_rating") or novel.mal_rating
        if force_replace_ratings or novel.mal_rank is None:
            raw_rank = j_data.get("mal_rank")
            novel.mal_rank = str(raw_rank) if raw_rank else novel.mal_rank

        if not novel.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(novel.system_id)
            )
            if filename:
                novel.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Novel ID {novel.system_id} (MAL {mal_id}): {e}"
        )


def autofill_movie_from_imdb(movie: Movies, db: Session) -> None:
    """
    Fetches TMDB + OMDb data for a single Movies entry and fills/overwrites fields.
    Does not commit — caller is responsible.
    """
    if movie.imdb_id is None:
        return

    try:

        result = fetch_imdb_data(movie.imdb_id)
        tmdb_raw = result.get("tmdb_raw")
        omdb_raw = result.get("omdb_raw")

        mapped = map_imdb_to_movie_data(tmdb_raw, omdb_raw)

        # Fill-only fields
        if movie.length_min is None:
            movie.length_min = mapped.get("length_min")
        if movie.director is None:
            movie.director = mapped.get("director")
        if movie.release_date_usa is None:
            movie.release_date_usa = mapped.get("release_date_usa")

        # Always overwrite imdb_rating if fetched
        fetched_rating = mapped.get("imdb_rating")
        if fetched_rating is not None:
            movie.imdb_rating = fetched_rating

        # Derive airing_status from raw release_date (fill-only)
        if movie.airing_status is None and tmdb_raw is not None:
            raw_date = tmdb_raw.get("release_date")
            if raw_date:
                try:
                    release_date = date.fromisoformat(raw_date)
                    movie.airing_status = (
                        "Finished Airing"
                        if release_date <= date.today()
                        else "Not Yet Aired"
                    )
                except (ValueError, TypeError):
                    pass

        # Download cover image if missing
        if movie.cover_image_file is None and mapped.get("cover_image_url"):
            filename = download_cover_image(
                mapped["cover_image_url"], str(movie.system_id)
            )
            if filename:
                movie.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"IMDb Autofill failed for Movie ID {movie.system_id} (IMDb {movie.imdb_id}): {e}"
        )


def autofill_tv_show_from_imdb(tv_show: TVShows, db: Session) -> None:
    """
    Fetches TMDB + OMDb season data for a single TVShows entry and fills/overwrites fields.
    Does not commit — caller is responsible.
    """
    if tv_show.imdb_id is None:
        return

    try:
        result = fetch_imdb_data(tv_show.imdb_id)
        tmdb_raw = result.get("tmdb_raw")
        omdb_raw = result.get("omdb_raw")

        tmdb_season_raw = None
        if tmdb_raw is not None:
            tmdb_id = tmdb_raw.get("id")
            if tmdb_id:
                season_number = _parse_season_number(tv_show.season_part)
                tmdb_season_raw = fetch_tmdb_tv_season_data(tmdb_id, season_number)

        mapped = map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)

        # Fill-only fields
        if tv_show.release_date is None:
            tv_show.release_date = mapped.get("release_date")
        if tv_show.ep_total is None:
            fetched_ep_total = mapped.get("ep_total")
            if fetched_ep_total:
                tv_show.ep_total = fetched_ep_total

        # Always overwrite imdb_rating if fetched
        fetched_rating = mapped.get("imdb_rating")
        if fetched_rating is not None:
            tv_show.imdb_rating = fetched_rating

        # Derive airing_status (fill-only)
        if tv_show.airing_status is None:
            derived_status = _derive_tv_season_airing_status(
                mapped.get("_season_air_date"), mapped.get("_episodes")
            )
            if derived_status is not None:
                tv_show.airing_status = derived_status

        # Download cover image if missing
        if tv_show.cover_image_file is None and mapped.get("cover_image_url"):
            filename = download_cover_image(
                mapped["cover_image_url"], str(tv_show.system_id)
            )
            if filename:
                tv_show.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"IMDb Autofill failed for TV Show ID {tv_show.system_id} (IMDb {tv_show.imdb_id}): {e}"
        )


def autofill_cartoon_from_imdb(cartoon: Cartoon, db: Session) -> None:
    """
    Fetches TMDB + OMDb data for a single Cartoon entry and fills/overwrites fields.
    Routes to movie path (airing_type == "Movie") or TV path (airing_type == "TV").
    All other airing_type values skip autofill entirely.
    Does not commit — caller is responsible.
    """
    if cartoon.imdb_id is None:
        return
    if cartoon.airing_type not in {"Movie", "TV"}:
        return

    try:
        result = fetch_imdb_data(cartoon.imdb_id)
        tmdb_raw = result.get("tmdb_raw")
        omdb_raw = result.get("omdb_raw")

        if cartoon.airing_type == "Movie":
            mapped = map_imdb_to_movie_data(tmdb_raw, omdb_raw)

            if cartoon.release_date is None:
                cartoon.release_date = mapped.get("release_date_usa")

            fetched_rating = mapped.get("imdb_rating")
            if fetched_rating is not None:
                cartoon.imdb_rating = fetched_rating

            if cartoon.airing_status is None and tmdb_raw is not None:
                raw_date = tmdb_raw.get("release_date")
                if raw_date:
                    try:
                        release_date = date.fromisoformat(raw_date)
                        cartoon.airing_status = (
                            "Finished Airing"
                            if release_date <= date.today()
                            else "Not Yet Aired"
                        )
                    except (ValueError, TypeError):
                        pass

            if cartoon.cover_image_file is None and mapped.get("cover_image_url"):
                filename = download_cover_image(
                    mapped["cover_image_url"], str(cartoon.system_id)
                )
                if filename:
                    cartoon.cover_image_file = filename

        else:  # airing_type == "TV"
            tmdb_season_raw = None
            if tmdb_raw is not None:
                tmdb_id = tmdb_raw.get("id")
                if tmdb_id:
                    season_number = _parse_season_number(cartoon.season_part)
                    tmdb_season_raw = fetch_tmdb_tv_season_data(tmdb_id, season_number)

            mapped = map_imdb_to_cartoon_data(tmdb_raw, tmdb_season_raw, omdb_raw)

            if cartoon.release_date is None:
                cartoon.release_date = mapped.get("release_date")
            if cartoon.ep_total is None:
                fetched_ep_total = mapped.get("ep_total")
                if fetched_ep_total:
                    cartoon.ep_total = fetched_ep_total

            fetched_rating = mapped.get("imdb_rating")
            if fetched_rating is not None:
                cartoon.imdb_rating = fetched_rating

            if cartoon.airing_status is None:
                derived_status = _derive_tv_season_airing_status(
                    mapped.get("_season_air_date"), mapped.get("_episodes")
                )
                if derived_status is not None:
                    cartoon.airing_status = derived_status

            if cartoon.cover_image_file is None and mapped.get("cover_image_url"):
                filename = download_cover_image(
                    mapped["cover_image_url"], str(cartoon.system_id)
                )
                if filename:
                    cartoon.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"IMDb Autofill failed for Cartoon ID {cartoon.system_id} (IMDb {cartoon.imdb_id}): {e}"
        )


# ==========================================
# OTHER ACTIONS
# ==========================================


def mark_tv_completed(entry: Union[Anime, Cartoon, TVShows]) -> None:
    """
    Forcefully mutates an TV type (Anime, TV Show, Cartoon) entry's fields to represent a 100% finished state.
    """
    entry.watching_status = "Completed"
    entry.airing_status = "Finished Airing"

    if entry.ep_total is not None:
        entry.ep_fin = entry.ep_total


def mark_movie_completed(entry: Union[AnimeMovies, Movies]) -> None:
    """Mutates an AnimeMovies or Movie entry to represent a fully finished state."""
    entry.watching_status = "Completed"
    entry.airing_status = "Finished Airing"


def mark_reading_completed(entry: Manga) -> None:
    """Sets a manga entry to represent a fully finished reading state."""
    if entry.serialization_status != "腰斬":
        entry.serialization_status = "完結"
    entry.reading_status = "Completed"
    if entry.ch_total:
        entry.ch_fin = entry.ch_total
    if entry.vol_total:
        entry.vol_fin = entry.vol_total
    entry.vol_fin_page = 0


def mark_novel_completed(entry: Novel) -> None:
    """Sets a novel entry to a fully finished reading state."""
    entry.serialization_status = "完結"
    entry.reading_status = "Completed"

    # vol: set all three to the max of the three
    vol_vals = [
        v
        for v in [entry.vol_total_original, entry.vol_total_tw, entry.vol_fin]
        if v is not None
    ]
    if vol_vals:
        vol_max = max(vol_vals)
        entry.vol_fin = vol_max
        if entry.vol_total_original is not None:
            entry.vol_total_original = vol_max
        if entry.vol_total_tw is not None:
            entry.vol_total_tw = vol_max

    # arc: set both to max of the two
    arc_vals = [v for v in [entry.arc_total, entry.arc_fin] if v is not None]
    if arc_vals:
        arc_max = max(arc_vals)
        entry.arc_fin = arc_max
        if entry.arc_total is not None:
            entry.arc_total = arc_max

    # ch: set both to max of the two
    ch_vals = [v for v in [entry.ch_total, entry.ch_fin] if v is not None]
    if ch_vals:
        ch_max = max(ch_vals)
        entry.ch_fin = ch_max
        if entry.ch_total is not None:
            entry.ch_total = ch_max


# ==========================================
# REPLACE for Single Entry
# ==========================================


def apply_single_replace_anime(
    db: Session, anime: Anime, bulk: bool = False, force_replace_ratings: bool = True
) -> None:
    """
    Core 'Replace' logic for a single anime entry.
    When bulk=False (single-entry update), also derives related entries.
    When bulk=True (batch replace), caller handles derive_related after the loop.
    """
    apply_extract_mal_id_anime(anime)
    autofill_anime_from_mal(anime, force_replace_ratings=force_replace_ratings)
    anime_post_processing(anime, db)

    if not bulk:
        derive_related_anime(db)


def apply_single_replace_anime_movie(
    db: Session,
    anime_movie: AnimeMovies,
    force_replace_ratings: bool = True,
) -> None:
    """
    Core 'Replace' logic for a single AnimeMovies entry.
    Used by both single-entry and bulk replace paths.
    """
    apply_extract_mal_id_anime(anime_movie)
    autofill_anime_movie_from_mal(
        anime_movie, force_replace_ratings=force_replace_ratings
    )
    anime_movie_post_processing(anime_movie, db)


def apply_single_replace_movie(db: Session, movie: Movies, bulk: bool = False) -> None:
    """Core 'Replace' logic for a single Movies entry."""
    apply_extract_imdb_id(movie)
    autofill_movie_from_imdb(movie, db)


def apply_single_replace_tv_show(
    db: Session, tv_show: TVShows, bulk: bool = False
) -> None:
    """
    Core 'Replace' logic for a single TVShows entry.
    When bulk=False, also derives related entries for all TV show franchises.
    When bulk=True, caller handles derive_related after the loop.
    """
    apply_extract_imdb_id(tv_show)
    autofill_tv_show_from_imdb(tv_show, db)
    tv_show_post_processing(tv_show, db)

    if not bulk:
        derive_related_tv_show(db)


def apply_single_replace_cartoon(
    db: Session, cartoon: Cartoon, bulk: bool = False
) -> None:
    """
    Core 'Replace' logic for a single Cartoon entry.
    When bulk=False, also derives related entries for all cartoon franchises.
    When bulk=True, caller handles derive_related after the loop.
    """
    apply_extract_imdb_id(cartoon)
    autofill_cartoon_from_imdb(cartoon, db)
    cartoon_post_processing(cartoon, db)

    if not bulk:
        derive_related_cartoon(db)


def apply_single_replace_manga(db: Session, manga: Manga, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Manga entry.
    When bulk=False (single-entry update), also derives related entries.
    When bulk=True (batch replace), caller handles derive_related after the loop.
    """
    apply_extract_mal_id_manga_novel(manga)
    autofill_manga_from_mal(manga, force_replace_ratings=True)
    manga_post_processing(manga, db)

    if not bulk:
        derive_related_manga(db)


def apply_single_replace_novel(db: Session, novel: Novel, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Novel entry.
    No post_processing and no derive_related — novel has neither.
    """
    apply_extract_mal_id_manga_novel(novel)
    autofill_novel_from_mal(novel, force_replace_ratings=True)


# ==========================================
# SYNC
# ==========================================

_SYSTEM_OPTION_FIELD_MAP = {
    "Genre Main": "genre_main",
    "Genre Sub": "genre_sub",
    "Studio": "studio",
    "Distributor TW": "distributor_tw",
    "Director": "director",
    "Producer": "producer",
    "Music / Composer": "music",
}


def create_missing_seasonal(db: Session) -> None:
    """
    Scans the Anime table for unique combinations of release_season and release_year.
    Creates a new entry in the Seasonal table (e.g., 'WIN 2026') if it does not already exist.
    """
    unique_combinations = (
        db.query(Anime.release_season, Anime.release_year)
        .filter(Anime.release_season.isnot(None), Anime.release_year.isnot(None))
        .distinct()
        .all()
    )

    new_seasonals_added = 0

    for season, year in unique_combinations:
        seasonal_string = f"{season} {year}"

        existing = (
            db.query(Seasonal).filter(Seasonal.seasonal == seasonal_string).first()
        )

        if not existing:
            new_seasonal = Seasonal(seasonal=seasonal_string)
            db.add(new_seasonal)
            new_seasonals_added += 1

    if new_seasonals_added > 0:
        db.commit()
        logger.info(f"Auto-created {new_seasonals_added} new seasonal entries.")
    else:
        logger.info("No new seasonal entries needed to be created.")


def sync_seasonal_counts(db: Session) -> None:
    """
    Recomputes entry_planned, entry_completed, entry_watching, and entry_dropped for every
    Seasonal by scanning linked Anime entries. Always overwrites existing counts.
    Only considers airing_type in TV, ONA, Movie, Special.
    Planned  = Plan to Watch | Watch When Airs
    Watching = Active Watching | Passive Watching | Paused.
    Dropped  = Temp Dropped | Dropped.
    """
    seasonals = db.query(Seasonal).all()
    if not seasonals:
        return

    seasonal_map = {s.seasonal: s for s in seasonals}

    for s in seasonals:
        s.entry_planned = 0
        s.entry_completed = 0
        s.entry_watching = 0
        s.entry_dropped = 0

    animes = (
        db.query(Anime)
        .filter(
            Anime.release_season.isnot(None),
            Anime.release_year.isnot(None),
            Anime.airing_type.in_(list(_SEASONAL_AIRING_TYPES)),
        )
        .all()
    )

    for anime in animes:
        key = f"{anime.release_season} {anime.release_year}"
        s = seasonal_map.get(key)
        if not s:
            continue
        if anime.watching_status == "Completed":
            s.entry_completed += 1
        elif anime.watching_status in _PLANNED_STATUSES:
            s.entry_planned += 1
        elif anime.watching_status in _WATCHING_STATUSES:
            s.entry_watching += 1
        elif anime.watching_status in _DROPPED_STATUSES:
            s.entry_dropped += 1

    db.commit()


def extract_system_options_from_anime(db: Session) -> dict:
    """
    Scans all Anime entries for values in system-option-backed fields.
    Any value not already present in the SystemOption table is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    animes = db.query(Anime).all()
    new_options = []

    for category, field in _SYSTEM_OPTION_FIELD_MAP.items():
        for anime in animes:
            raw = getattr(anime, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_anime: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(animes)} entries, created {len(new_options)} missing system options.",
    }


def extract_system_options_from_anime_movie(db: Session) -> dict:
    """
    Scans all AnimeMovies entries for studio and director values.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    movies = db.query(AnimeMovies).all()
    new_options = []

    for category, field in _SYSTEM_OPTION_FIELD_MAP.items():
        for movie in movies:
            raw = getattr(movie, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_anime_movie: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(movies)} entries, created {len(new_options)} missing system options.",
    }


_TV_SHOW_OPTION_FIELD_MAP = {
    "TV Official Source": "source_official",
}


def extract_system_options_from_tv_show(db: Session) -> dict:
    """
    Scans all TVShows entries for source_official values.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    shows = db.query(TVShows).all()
    new_options = []

    for category, field in _TV_SHOW_OPTION_FIELD_MAP.items():
        for show in shows:
            raw = getattr(show, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_tv_show: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(shows)} entries, created {len(new_options)} missing system options.",
    }


_CARTOON_OPTION_FIELD_MAP = {
    "Cartoon Official Source": "source_official",
}


def extract_system_options_from_cartoon(db: Session) -> dict:
    """
    Scans all Cartoon entries for source_official values.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    cartoons = db.query(Cartoon).all()
    new_options = []

    for category, field in _CARTOON_OPTION_FIELD_MAP.items():
        for cartoon in cartoons:
            raw = getattr(cartoon, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_cartoon: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(cartoons)} entries, created {len(new_options)} missing system options.",
    }


_MANGA_OPTION_FIELD_MAP = {
    "Manga Author": "author_plot",
    "Distributor TW": "distributor_tw",
    "Studio": "anime_studio",
}


def extract_system_options_from_manga(db: Session) -> dict:
    """
    Scans all Manga entries for values in author_plot, author_draw, distributor_tw, anime_studio.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    mangas = db.query(Manga).all()
    new_options = []

    for category, field in _MANGA_OPTION_FIELD_MAP.items():
        for manga in mangas:
            raw = getattr(manga, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    # author_draw uses the same "Manga Author" category
    for manga in mangas:
        raw = getattr(manga, "author_draw", None)
        if not raw:
            continue
        for val in (v.strip() for v in str(raw).split(",") if v.strip()):
            if val not in existing.get("Manga Author", set()):
                new_options.append(
                    SystemOption(category="Manga Author", option_value=val)
                )
                existing.setdefault("Manga Author", set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_manga: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(mangas)} entries, created {len(new_options)} missing system options.",
    }


_NOVEL_OPTION_FIELD_MAP = {
    "Novel Author": "author",
    "Novel Illustrator": "illustrator",
    "Novel Publisher TW": "publisher_tw",
}


def extract_system_options_from_novel(db: Session) -> dict:
    """
    Scans all Novel entries for values in author, illustrator, publisher_tw.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    novels = db.query(Novel).all()
    new_options = []

    for category, field in _NOVEL_OPTION_FIELD_MAP.items():
        for novel in novels:
            raw = getattr(novel, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_novel: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(novels)} entries, created {len(new_options)} missing system options.",
    }


# ==========================================
# COMPOSITE LOGICS
# ==========================================


def anime_post_processing(anime: Anime, db: Session) -> None:
    apply_validate_episode_math(anime)
    apply_check_baha(anime)

    if check_is_tv_completed(anime) and anime.watching_status != "Completed":
        mark_tv_completed(anime)

    if (
        anime.release_season is None
        and anime.release_month is not None
        and anime.airing_type == "TV"
    ):
        apply_calculate_seasonal_from_month(anime)

    if anime.season_part is None:
        apply_extract_season_from_title(anime)
        derive_season_1_anime(anime, db)


def anime_movie_post_processing(anime_movie: AnimeMovies, db: Session) -> None:
    apply_check_baha(anime_movie)
    if (
        check_is_movie_completed(anime_movie)
        and anime_movie.watching_status != "Completed"
    ):
        mark_movie_completed(anime_movie)


def tv_show_post_processing(tv_show: TVShows, db: Session) -> None:
    apply_validate_episode_math(tv_show)

    if check_is_tv_completed(tv_show) and tv_show.watching_status != "Completed":
        mark_tv_completed(tv_show)

    if tv_show.season_part is None:
        apply_extract_season_from_title(tv_show)
        derive_season_1_tv_show(tv_show, db)


def cartoon_post_processing(cartoon: Cartoon, db: Session) -> None:
    apply_validate_episode_math(cartoon)

    if check_is_tv_completed(cartoon) and cartoon.watching_status != "Completed":
        mark_tv_completed(cartoon)

    if cartoon.season_part is None:
        apply_extract_season_from_title(cartoon)
        derive_season_1_cartoon(cartoon, db)


def manga_post_processing(manga: Manga, db: Session) -> None:
    """Runs all single-entry checks and repairs for one manga entry."""
    apply_validate_vol_math(manga)
    apply_validate_ch_math(manga)

    if check_is_reading_completed(manga) and manga.reading_status != "Completed":
        mark_reading_completed(manga)


def derive_related_anime(db: Session) -> None:
    """Derives watch order, ep_previous, and prequel/sequel for all acg franchises."""
    rows = (
        db.query(Anime.franchise_id)
        .filter(Anime.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_watch_order_anime(db, fid)
        derive_ep_previous_anime(db, fid)
        derive_prequel_sequel_anime(db, fid)
    if franchise_ids:
        db.commit()


def derive_related_tv_show(db: Session) -> None:
    """Derives watch order and prequel/sequel for all TV show franchises."""
    rows = (
        db.query(TVShows.franchise_id)
        .filter(TVShows.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_watch_order_tv_show(db, fid)
        derive_prequel_sequel_tv_show(db, fid)
    if franchise_ids:
        db.commit()


def derive_related_cartoon(db: Session) -> None:
    """Derives watch order and prequel/sequel for all cartoon franchises."""
    rows = (
        db.query(Cartoon.franchise_id)
        .filter(Cartoon.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_watch_order_cartoon(db, fid)
        derive_prequel_sequel_cartoon(db, fid)
    if franchise_ids:
        db.commit()


def derive_related_manga(db: Session) -> None:
    """Derives prequel/sequel for all ACG franchises that have manga entries."""
    rows = (
        db.query(Manga.franchise_id)
        .filter(Manga.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_prequel_sequel_manga(db, fid)
    if franchise_ids:
        db.commit()
