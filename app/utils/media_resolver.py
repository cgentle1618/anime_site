"""
Shared media-type resolution for tables that reference an entry across all
seven media tables.

`app/registry.py` deliberately covers only the five uniform media types, and
each media table has its own `system_id` space, so a bare UUID is ambiguous —
a cross-type reference must carry a `media_type` discriminator alongside it.
Tables doing that (`quote`, `watch_order_item`) store the pair FK-less, because
no single foreign key can span seven tables, and resolve it here at read time.

A row whose entry has since been deleted resolves to `missing=True` rather than
vanishing, so a dangling reference stays visible and fixable in the UI.
"""

from dataclasses import dataclass
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models


@dataclass(frozen=True)
class MediaRef:
    """Per-type facts needed to resolve and display a cross-type entry reference."""

    key: str        # value stored in the `media_type` column
    label: str      # human label, e.g. "Anime Movie"
    model: type
    nav_path: str   # frontend detail route prefix, e.g. "/anime-movie"


# Keys use the hyphenated spelling already established by
# app/services/domain/watch_order.py's MEDIA_TYPE_MODELS, so both tables that
# store a media_type discriminator agree on its values. Note this differs from
# MEDIA_REGISTRY's underscore keys, which name router configs, not column data.
MEDIA_TABLES: dict[str, MediaRef] = {
    "anime": MediaRef("anime", "Anime", models.Anime, "/anime"),
    "anime-movie": MediaRef(
        "anime-movie", "Anime Movie", models.AnimeMovies, "/anime-movie"
    ),
    "movie": MediaRef("movie", "Movie", models.Movies, "/movie"),
    "tv-show": MediaRef("tv-show", "TV Show", models.TVShows, "/tv-show"),
    "cartoon": MediaRef("cartoon", "Cartoon", models.Cartoon, "/cartoon"),
    "manga": MediaRef("manga", "Manga", models.Manga, "/manga"),
    "novel": MediaRef("novel", "Novel", models.Novel, "/novel"),
}

MEDIA_TYPE_KEYS: tuple[str, ...] = tuple(MEDIA_TABLES.keys())


@dataclass
class EntryRef:
    """Display data for one resolved entry reference."""

    media_type: Optional[str] = None
    entry_id: Optional[UUID] = None
    missing: bool = True
    display_name: Optional[str] = None
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    nav_path: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "missing": self.missing,
            "entry_display_name": self.display_name,
            "cover_image_file": self.cover_image_file,
            "franchise_id": self.franchise_id,
            "entry_nav_path": self.nav_path,
        }


def resolve_entries(
    db: Session, pairs: Iterable[tuple[Optional[str], Optional[UUID]]]
) -> dict[tuple[str, UUID], EntryRef]:
    """
    Batch-resolve (media_type, entry_id) pairs into display data.

    Issues at most one query per involved media table regardless of how many
    pairs are passed, so a page of rows never degrades into N+1 lookups.
    Pairs whose type is unknown, or whose row no longer exists, are simply
    absent from the returned mapping; callers treat a miss as `missing=True`
    via `entry_ref_for()`.
    """
    # Group wanted ids by table so each table is queried exactly once.
    wanted: dict[str, set[UUID]] = {}
    for media_type, entry_id in pairs:
        if not media_type or not entry_id:
            continue
        if media_type not in MEDIA_TABLES:
            continue
        wanted.setdefault(media_type, set()).add(entry_id)

    resolved: dict[tuple[str, UUID], EntryRef] = {}
    for media_type, ids in wanted.items():
        ref = MEDIA_TABLES[media_type]
        rows = (
            db.query(ref.model)
            .filter(ref.model.system_id.in_(list(ids)))
            .all()
        )
        for row in rows:
            resolved[(media_type, row.system_id)] = EntryRef(
                media_type=media_type,
                entry_id=row.system_id,
                missing=False,
                display_name=row.display_name,
                cover_image_file=row.cover_image_file,
                franchise_id=row.franchise_id,
                nav_path=f"{ref.nav_path}/{row.system_id}",
            )
    return resolved


def entry_ref_for(
    resolved: dict[tuple[str, UUID], EntryRef],
    media_type: Optional[str],
    entry_id: Optional[UUID],
) -> EntryRef:
    """Look up one pair in a `resolve_entries()` result, defaulting to missing."""
    if media_type and entry_id:
        hit = resolved.get((media_type, entry_id))
        if hit:
            return hit
    return EntryRef(media_type=media_type, entry_id=entry_id, missing=True)
