"""
The vocabulary of `media_credit.role` and `media_tag.field`.

Deliberately shaped like app/utils/relation_kinds.py and MEDIA_TABLES in
app/utils/media_resolver.py: a frozen dataclass per entry, a dict keyed by the
value stored in the column, and a tuple of keys for validation.

ONE vocabulary. `media_credit.role` and `person_role.role` store the same five
person keys plus `studio`; the key a credit stores IS the person role it
implies. Before the collapse these were two lists that disagreed - 原作 and
作画 were separate credit keys sharing one `manga_author` dropdown, while
`novel_author` and `comic_writer` were separate person roles meaning the same
thing.

What varies by media type is the LABEL, not the key: `author` reads 原作 on a
manga, Author on a novel and Writer on a comic. credit_label() owns that.

Scope is the media type. `person_role.scope` holds a hyphenated media-type key
and is NOT NULL, so a role's `media_types` doubles as its legal scopes. The old
anime/non_anime split and the director_scope_for() that derived it are gone.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class CreditRole:
    """One role a person or studio can be credited in."""

    # Value stored in media_credit.role AND, for people, person_role.role.
    key: str
    # Human label, used wherever the media type does not override it below.
    label: str
    # Which entity table the credit points at: "person" or "studio".
    target: str
    # Media type keys (hyphenated, from MEDIA_TABLES) that may use this role.
    # For a person role this doubles as the set of legal person_role.scope
    # values, because the scope IS the media type.
    media_types: tuple[str, ...]


CREDIT_ROLES: dict[str, CreditRole] = {
    "studio": CreditRole("studio", "Studio", "studio", ("anime", "anime-movie")),
    "director": CreditRole(
        "director", "Director", "person", ("anime", "anime-movie", "movie")
    ),
    "producer": CreditRole("producer", "Producer", "person", ("anime",)),
    "composer": CreditRole("composer", "Music / Composer", "person", ("anime",)),
    "author": CreditRole("author", "Author", "person", ("manga", "novel", "comic")),
    "illustrator": CreditRole(
        "illustrator", "Illustrator", "person", ("manga", "novel", "comic")
    ),
}

CREDIT_ROLE_KEYS: tuple[str, ...] = tuple(CREDIT_ROLES.keys())

PERSON_ROLES: tuple[str, ...] = tuple(
    key for key, role in CREDIT_ROLES.items() if role.target == "person"
)

# Labels that differ by media type. One person type, three reader-facing words:
# the same `author` is 原作 on a manga, Author on a novel and Writer on a
# comic. 作畫 is the traditional form, matching the site's other CJK labels
# (標籤 Label, Quality 品質); the pre-collapse label carried the Japanese 作画.
# Anything absent falls back to CreditRole.label.
_LABEL_OVERRIDES: dict[tuple[str, str], str] = {
    ("author", "manga"): "原作",
    ("illustrator", "manga"): "作畫",
    ("author", "comic"): "Writer",
    ("illustrator", "comic"): "Artist",
}


def credit_label(role: str, media_type: str) -> str:
    """What this credit is called on this media type."""
    return _LABEL_OVERRIDES.get((role, media_type)) or CREDIT_ROLES[role].label


def legal_scopes(role: str) -> tuple[str, ...]:
    """The media types a person may hold this role in."""
    return CREDIT_ROLES[role].media_types


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

# The categories the admin Add / Modify / Delete pages offer under their
# "Tags" sub-tab instead of "Options". Both sub-tabs are the same form over
# the same system_option rows - the split is navigational, nothing in the
# data or the API distinguishes a tag category from any other.
#
# Listed, not derived. These four happen to be exactly the anime-only tag
# fields today, but that is a coincidence of the current vocabulary, not the
# rule: what puts a category here is that its values read as tags ON the
# work, while Official Source, Publisher / Distributor TW and the Comic
# vocabularies name an outside party. A new anime-only category is not
# automatically a tag, so it must be added here deliberately.
TAG_CATEGORIES: tuple[str, ...] = (
    "Genre Main",
    "Genre Sub",
    "Label",
    "Quality",
)

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
    ("manga", "author"): "author_plot",
    ("manga", "illustrator"): "author_draw",
    ("manga", "publisher_tw"): "publisher_tw",
    ("novel", "author"): "author",
    ("novel", "illustrator"): "illustrator",
    ("novel", "publisher_tw"): "publisher_tw",
    ("comic", "author"): "writer",
    ("comic", "illustrator"): "artist",
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


def credit_roles_for(media_type: str) -> tuple[CreditRole, ...]:
    """Every credit role usable on entries of this media type."""
    return tuple(r for r in CREDIT_ROLES.values() if media_type in r.media_types)


def tag_fields_for(media_type: str) -> tuple[TagField, ...]:
    """Every vocabulary-backed field on entries of this media type."""
    return tuple(f for f in TAG_FIELDS.values() if media_type in f.media_types)
