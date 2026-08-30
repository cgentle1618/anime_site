"""
Parent-hierarchy resolution: turn whatever a form or a sheet row carries in
its franchise_id / series_id cells into real UUIDs.

One rule for every media type (it used to be nine near-identical copies that
had drifted: some searched three name columns, some five, two matched series
exactly instead of case-insensitively, anime ignored a name in the franchise
cell):

Franchise
  * a UUID passes through;
  * a non-empty string names the franchise itself and is looked up
    case-insensitively across every franchise name column;
  * a blank cell falls back to the entry's own titles, looked up the same way;
  * nothing found -> a franchise is created, typed for the media
    (see FRANCHISE_TYPE_FOR), carrying whatever names were available.

Series
  * a UUID passes through;
  * a non-empty string is looked up case-insensitively by name;
  * not found -> None. A series is never auto-created: a series is a
    deliberate grouping, a franchise is just the top of the tree.
"""

import logging
import uuid
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import Franchise, Series
from app.utils.constants import FranchiseType

logger = logging.getLogger(__name__)

NAME_KEYS = ("en", "cn", "roman", "jp", "alt")
FRANCHISE_NAME_COLUMNS = (
    Franchise.franchise_name_en,
    Franchise.franchise_name_cn,
    Franchise.franchise_name_roman,
    Franchise.franchise_name_jp,
    Franchise.franchise_name_alt,
)
SERIES_NAME_COLUMNS = (Series.series_name_en, Series.series_name_cn, Series.series_name_alt)

# Type stamped on an auto-created franchise, per media type.
FRANCHISE_TYPE_FOR = {
    "anime": FranchiseType.ANIME,
    "anime-movie": FranchiseType.ANIME,
    "series": FranchiseType.ANIME,
    "movie": FranchiseType.MOVIE,
    "tv-show": FranchiseType.TV,
    "cartoon": FranchiseType.CARTOON,
    "manga": FranchiseType.ACG,
    "novel": FranchiseType.NOVEL,
    "comic": FranchiseType.COMIC,
}


def _clean_names(names: Dict[str, Any]) -> Dict[str, Optional[str]]:
    out = {}
    for key in NAME_KEYS:
        value = names.get(key)
        out[key] = str(value).strip() if value and str(value).strip() else None
    return out


def _find_by_names(db: Session, model, columns, values) -> Optional[Any]:
    values = [v for v in values if v]
    if not values:
        return None
    return db.query(model).filter(or_(*[c.ilike(v) for c in columns for v in values])).first()


def resolve_franchise(db: Session, franchise_id: Any, names: Dict[str, Any], media_type: str) -> Any:
    """See the module docstring. Returns a franchise system_id."""
    if franchise_id and not isinstance(franchise_id, str):
        return franchise_id

    label = media_type.replace("-", " ").title()
    cell = franchise_id.strip() if isinstance(franchise_id, str) else ""
    names = {"en": cell} if cell else _clean_names(names)

    existing = _find_by_names(db, Franchise, FRANCHISE_NAME_COLUMNS, names.values())
    if existing:
        logger.info("Auto-resolved existing Franchise for %s: %s", label, existing.system_id)
        return existing.system_id

    if not any(names.values()):
        return None

    created = Franchise(
        system_id=str(uuid.uuid4()),
        franchise_type=FRANCHISE_TYPE_FOR[media_type],
        franchise_name_en=names.get("en"),
        franchise_name_cn=names.get("cn"),
        franchise_name_roman=names.get("roman"),
        franchise_name_jp=names.get("jp"),
        franchise_name_alt=names.get("alt"),
        created_at=get_taipei_now(),
        updated_at=get_taipei_now(),
    )
    db.add(created)
    db.flush()
    logger.info("Auto-created missing Franchise for %s: %s", label, created.system_id)
    return created.system_id


def resolve_series(db: Session, series_id: Any, media_type: str) -> Any:
    """See the module docstring. Returns a series system_id or None."""
    if not isinstance(series_id, str):
        return series_id
    name = series_id.strip()
    if not name:
        return None
    existing = _find_by_names(db, Series, SERIES_NAME_COLUMNS, [name])
    if existing:
        return existing.system_id
    logger.warning("Could not resolve Series by name %r for %s; setting to null.", name, media_type)
    return None


def _entry_resolver(media_type: str):
    def resolve(db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]) -> Tuple[Any, Any]:
        return (
            resolve_franchise(db, franchise_id, names, media_type),
            resolve_series(db, series_id, media_type),
        )

    resolve.__name__ = f"resolve_{media_type.replace('-', '_')}_parent_hierarchy"
    resolve.__doc__ = f"(franchise_id, series_id) for a {media_type} entry - see module docstring."
    return resolve


resolve_anime_parent_hierarchy = _entry_resolver("anime")
resolve_movie_parent_hierarchy = _entry_resolver("movie")
resolve_tv_show_parent_hierarchy = _entry_resolver("tv-show")
resolve_cartoon_parent_hierarchy = _entry_resolver("cartoon")
resolve_manga_parent_hierarchy = _entry_resolver("manga")
resolve_novel_parent_hierarchy = _entry_resolver("novel")
resolve_comic_parent_hierarchy = _entry_resolver("comic")


def resolve_anime_movie_parent_hierarchy(db: Session, franchise_id: Any, names: Dict[str, Any]) -> Any:
    """Franchise only: anime_movies has no series_id column."""
    return resolve_franchise(db, franchise_id, names, "anime-movie")


def resolve_series_parent_hierarchy(db: Session, franchise_id: Any, names: Dict[str, Any]) -> Any:
    """The franchise a Series entry belongs to, found or created from the series' own names."""
    return resolve_franchise(db, franchise_id, names, "series")
