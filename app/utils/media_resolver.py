"""
Shared resolution for tables that reference a row across several tables by a
(type, id) pair rather than a foreign key.

Two maps are exported. MEDIA_TABLES covers the eight media entry tables and is
what `quote` and `watch_order_item` resolve against. OWNER_TABLES adds the
three grouping tiers (series, franchise, collection) and is what `meme`
resolves against, since a meme can belong to a franchise rather than to one
entry. Passing the map in keeps the wider set from leaking into the tables that
must stay entry-only.

`app/registry.py` deliberately covers only the six uniform media types, and
each table has its own `system_id` space, so a bare UUID is ambiguous — a
cross-table reference must carry a type discriminator alongside it. Those pairs
are stored FK-less, because no single foreign key can span the tables involved,
and are resolved here at read time.

A row whose target has since been deleted resolves to `missing=True` rather than
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

    key: str        # value stored in the type discriminator column
    label: str      # human label, e.g. "Anime Movie"
    model: type
    # Frontend detail route prefix, e.g. "/anime-movie". None for Series, which
    # has no page of its own - such a reference resolves to a name, not a link.
    nav_path: Optional[str] = None
    # True for the three grouping tiers, so the UI can badge them apart from
    # media entries and skip the cover lookup they have no column for.
    is_tier: bool = False


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
    "comic": MediaRef("comic", "Comic", models.Comic, "/comic"),
}

MEDIA_TYPE_KEYS: tuple[str, ...] = tuple(MEDIA_TABLES.keys())

# The three grouping tiers a meme may belong to instead of a single entry.
# Franchise and Collection have hub pages; Series does not.
TIER_TABLES: dict[str, MediaRef] = {
    "series": MediaRef("series", "Series", models.Series, None, is_tier=True),
    "franchise": MediaRef(
        "franchise", "Franchise", models.Franchise, "/franchise", is_tier=True
    ),
    "collection": MediaRef(
        "collection", "Collection", models.Collection, "/collection", is_tier=True
    ),
}

# What `meme` resolves against: an entry OR a grouping tier.
OWNER_TABLES: dict[str, MediaRef] = {**MEDIA_TABLES, **TIER_TABLES}

OWNER_TYPE_KEYS: tuple[str, ...] = tuple(OWNER_TABLES.keys())


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
    label: Optional[str] = None
    is_tier: bool = False

    def as_dict(self) -> dict:
        """Payload for the entry-only consumers (quote)."""
        return {
            "missing": self.missing,
            "entry_display_name": self.display_name,
            "cover_image_file": self.cover_image_file,
            "franchise_id": self.franchise_id,
            "entry_nav_path": self.nav_path,
        }

    def as_owner_dict(self) -> dict:
        """
        Payload for consumers whose reference may be a tier (meme).

        Named owner_* rather than entry_* because "entry" is wrong once a
        franchise can be the target, and carries the label and tier flag the UI
        needs to badge a group.
        """
        return {
            "missing": self.missing,
            "owner_display_name": self.display_name,
            "owner_label": self.label,
            "owner_is_tier": self.is_tier,
            "cover_image_file": self.cover_image_file,
            "franchise_id": self.franchise_id,
            "owner_nav_path": self.nav_path,
        }


def resolve_entries(
    db: Session,
    pairs: Iterable[tuple[Optional[str], Optional[UUID]]],
    tables: Optional[dict[str, MediaRef]] = None,
) -> dict[tuple[str, UUID], EntryRef]:
    """
    Batch-resolve (media_type, entry_id) pairs into display data.

    Issues at most one query per involved table regardless of how many pairs
    are passed, so a page of rows never degrades into N+1 lookups. Pairs whose
    type is unknown, or whose row no longer exists, are simply absent from the
    returned mapping; callers treat a miss as `missing=True` via
    `entry_ref_for()`.

    `tables` defaults to MEDIA_TABLES, so entry-only callers keep rejecting a
    tier type. Meme passes OWNER_TABLES.
    """
    tables = tables if tables is not None else MEDIA_TABLES
    # Group wanted ids by table so each table is queried exactly once.
    wanted: dict[str, set[UUID]] = {}
    for media_type, entry_id in pairs:
        if not media_type or not entry_id:
            continue
        if media_type not in tables:
            continue
        wanted.setdefault(media_type, set()).add(entry_id)

    resolved: dict[tuple[str, UUID], EntryRef] = {}
    for media_type, ids in wanted.items():
        ref = tables[media_type]
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
                # The tiers have neither column: a franchise's cover is derived
                # from its entries on the frontend, and Series has no franchise.
                cover_image_file=getattr(row, "cover_image_file", None),
                franchise_id=getattr(row, "franchise_id", None),
                nav_path=(
                    f"{ref.nav_path}/{row.system_id}" if ref.nav_path else None
                ),
                label=ref.label,
                is_tier=ref.is_tier,
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
