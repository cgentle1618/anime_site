"""Parent-hierarchy resolution for each media type."""

import logging
import uuid
from datetime import date
from typing import Any, Dict, Optional, Tuple, Union

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import (
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

from app.utils.utils import (
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
from app.utils.constants import AnimeAiringType, FranchiseType, WatchStatus

logger = logging.getLogger(__name__)


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
                franchise_type=FranchiseType.ANIME,
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
                franchise_type=FranchiseType.ANIME,
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
        franchise_type=FranchiseType.ANIME,
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
                franchise_type=FranchiseType.MOVIE,
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
                franchise_type=FranchiseType.TV,
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
                franchise_type=FranchiseType.CARTOON,
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
                franchise_type=FranchiseType.ACG,
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
                franchise_type=FranchiseType.NOVEL,
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
