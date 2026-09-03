"""
The vocabulary of `media_credit.role` and `media_tag.field`.

Deliberately shaped like app/utils/relation_kinds.py and MEDIA_TABLES in
app/utils/media_resolver.py: a frozen dataclass per entry, a dict keyed by the
value stored in the column, and a tuple of keys for validation.

Credit roles and person roles are two vocabularies on purpose. Two credits can
imply one role: 原作 (manga_author_plot) and 作画 (manga_author_draw) are
distinct credits that share a single dropdown, exactly as the old single
"Manga Author" option category behaved.

Director scope is never stored on the credit. It is derived from the media type
on write and recorded on person_role, so a director can be offered in the anime
dropdown before their first credit exists.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CreditRole:
    """One role a person or studio can be credited in."""

    # Value stored in media_credit.role.
    key: str
    # Human label for the form and the docs.
    label: str
    # Which entity table the credit points at: "person" or "studio".
    target: str
    # The person_role this credit implies, or None for studio credits.
    person_role: Optional[str]
    # Media type keys (hyphenated, from MEDIA_TABLES) that may use this role.
    media_types: tuple[str, ...]


CREDIT_ROLES: dict[str, CreditRole] = {
    "studio": CreditRole(
        "studio", "Studio", "studio", None, ("anime", "anime-movie")
    ),
    "director": CreditRole(
        "director", "Director", "person", "director",
        ("anime", "anime-movie", "movie"),
    ),
    "producer": CreditRole(
        "producer", "Producer", "person", "producer", ("anime",)
    ),
    "composer": CreditRole(
        "composer", "Music / Composer", "person", "composer", ("anime",)
    ),
    "manga_author_plot": CreditRole(
        "manga_author_plot", "原作", "person", "manga_author", ("manga",)
    ),
    "manga_author_draw": CreditRole(
        "manga_author_draw", "作画", "person", "manga_author", ("manga",)
    ),
    "novel_author": CreditRole(
        "novel_author", "Author", "person", "novel_author", ("novel",)
    ),
    "novel_illustrator": CreditRole(
        "novel_illustrator", "Illustrator", "person", "novel_illustrator",
        ("novel",),
    ),
    "comic_writer": CreditRole(
        "comic_writer", "Writer", "person", "comic_writer", ("comic",)
    ),
    "comic_artist": CreditRole(
        "comic_artist", "Artist", "person", "comic_artist", ("comic",)
    ),
}

CREDIT_ROLE_KEYS: tuple[str, ...] = tuple(CREDIT_ROLES.keys())

PERSON_ROLES: tuple[str, ...] = tuple(
    dict.fromkeys(
        role.person_role
        for role in CREDIT_ROLES.values()
        if role.person_role is not None
    )
)

# Only "director" is scoped. Every other person_role means the same thing
# everywhere, and stores scope=NULL.
SCOPED_PERSON_ROLES: frozenset[str] = frozenset({"director"})

DIRECTOR_ANIME_MEDIA_TYPES: frozenset[str] = frozenset({"anime", "anime-movie"})


@dataclass(frozen=True)
class TagField:
    """One vocabulary-backed field on a media entry."""

    # Value stored in media_tag.field.
    key: str
    label: str
    # system_option.category the values are drawn from.
    category: str
    media_types: tuple[str, ...]


TAG_FIELDS: dict[str, TagField] = {
    "genre_main": TagField(
        "genre_main", "Genre Main", "Genre Main", ("anime",)
    ),
    "genre_sub": TagField("genre_sub", "Genre Sub", "Genre Sub", ("anime",)),
    # Viewing-experience tags (會跳OP, 很多福利, ...). No legacy column ever
    # held these, so no LEGACY_SHEET_COLUMN entry: the sheet header is the key.
    "label": TagField("label", "標籤 Label", "Label", ("anime",)),
    # Production-quality tags (神作畫, 作畫崩壞, ...). Anime-only and, like
    # `label`, never a legacy column, so its sheet header is the key itself.
    "quality": TagField("quality", "Quality 品質", "Quality", ("anime",)),
    "source_official": TagField(
        "source_official", "Official Source", "Official Source",
        ("tv-show", "cartoon", "movie"),
    ),
    "publisher_tw": TagField(
        "publisher_tw", "Publisher / Distributor TW",
        "Publisher / Distributor TW",
        ("anime", "manga", "novel", "comic"),
    ),
    "comic_publisher": TagField(
        "comic_publisher", "Publisher", "Comic Publisher", ("comic",)
    ),
    "comic_imprint": TagField(
        "comic_imprint", "Imprint", "Comic Imprint", ("comic",)
    ),
    "comic_continuity": TagField(
        "comic_continuity", "Continuity", "Comic Continuity", ("comic",)
    ),
    "comic_era": TagField("comic_era", "Era", "Comic Era", ("comic",)),
    "comic_event": TagField("comic_event", "Events", "Comic Event", ("comic",)),
}

TAG_FIELD_KEYS: tuple[str, ...] = tuple(TAG_FIELDS.keys())

# Categories that exist as vocabularies but back no entry column - they drive
# list-page filters only, so no TagField names them.
FILTER_ONLY_CATEGORIES: tuple[str, ...] = ("Franchise for Filter",)

OPTION_CATEGORIES: tuple[str, ...] = tuple(
    dict.fromkeys(
        [f.category for f in TAG_FIELDS.values()] + list(FILTER_ONLY_CATEGORIES)
    )
)


# The sheet header each (media_type, role/field key) pair has always been
# written under, back when the value lived in a plain string column on the
# entry table. Keyed by the pair, not by the key alone, because the same key
# can carry a different legacy header per media type - anime.publisher_tw
# wrote under "distributor_tw" while manga/novel/comic wrote under
# "publisher_tw" itself. The sheets predate this design and must keep reading
# the same; only what sits behind the column changed. A pair absent here (for
# example movie/source_official, which never had a legacy column) falls back
# to its own key as the header - see credits.sheet_link_headers.
LEGACY_SHEET_COLUMN: dict[tuple[str, str], str] = {
    ("anime", "studio"): "studio",
    ("anime", "director"): "director",
    ("anime", "producer"): "producer",
    ("anime", "composer"): "music",
    ("anime", "publisher_tw"): "distributor_tw",
    ("anime", "genre_main"): "genre_main",
    ("anime", "genre_sub"): "genre_sub",
    ("anime-movie", "studio"): "studio",
    ("anime-movie", "director"): "director",
    ("movie", "director"): "director",
    ("tv-show", "source_official"): "source_official",
    ("cartoon", "source_official"): "source_official",
    ("manga", "manga_author_plot"): "author_plot",
    ("manga", "manga_author_draw"): "author_draw",
    ("manga", "publisher_tw"): "publisher_tw",
    ("novel", "novel_author"): "author",
    ("novel", "novel_illustrator"): "illustrator",
    ("novel", "publisher_tw"): "publisher_tw",
    ("comic", "comic_writer"): "writer",
    ("comic", "comic_artist"): "artist",
    ("comic", "comic_publisher"): "publisher",
    ("comic", "comic_imprint"): "imprint",
    ("comic", "comic_continuity"): "continuity",
    ("comic", "comic_era"): "era",
    ("comic", "comic_event"): "events",
    ("comic", "publisher_tw"): "publisher_tw",
}


def sheet_column_for(media_type: str, key: str) -> str:
    """The sheet header a credit role or tag field key has always used."""
    return LEGACY_SHEET_COLUMN.get((media_type, key), key)


def director_scope_for(media_type: str) -> str:
    """Which director dropdown a credit on this media type belongs to."""
    return "anime" if media_type in DIRECTOR_ANIME_MEDIA_TYPES else "non_anime"


def credit_roles_for(media_type: str) -> tuple[CreditRole, ...]:
    """Every credit role usable on entries of this media type."""
    return tuple(r for r in CREDIT_ROLES.values() if media_type in r.media_types)


def tag_fields_for(media_type: str) -> tuple[TagField, ...]:
    """Every vocabulary-backed field on entries of this media type."""
    return tuple(f for f in TAG_FIELDS.values() if media_type in f.media_types)
