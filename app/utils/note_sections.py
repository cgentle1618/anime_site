"""
The notes section registry - the single authority on what a note may be.

Notes used to be a JSONB blob whose shape lived in seven frontend config files.
The backend could not validate or query it, and the same section drifted
between media types. This module replaces those files: each entry declares one
section's shape, label, applicable owner types, ordering and dropdown values,
and both the API schema layer and the frontend read it from here.

Adding a section is one entry and no migration. Adding a new *shape* is rare
and costs one nullable column on `note`.

Sections that look similar across media types are deliberately kept distinct
(`highlights` vs `highlight_episodes` vs `highlight_passages`, `cinematography`
vs `craft`): the drift is intentional, not accidental.
"""

from dataclasses import dataclass, field

from app.utils.media_resolver import MEDIA_TYPE_KEYS, OWNER_TYPE_KEYS

# --- Shapes ---------------------------------------------------------------
# Each shape names which of `note`'s content columns a section uses. Columns a
# shape does not name stay null.
SHAPE_TEXT = "text"  # content
SHAPE_TEXT_LINKS = "text_links"  # content, links, optional episode
SHAPE_EPISODE_TEXT = "episode_text"  # episode, content, kind where declared
SHAPE_NAME_LINKS = "name_links"  # title, links
# Backed by its own table (quote, meme), never by a `note` row.
SHAPE_EXTERNAL = "external"

STORED_SHAPES = frozenset(
    {SHAPE_TEXT, SHAPE_TEXT_LINKS, SHAPE_EPISODE_TEXT, SHAPE_NAME_LINKS}
)

# --- Owner groups ---------------------------------------------------------
# Both derive from media_resolver rather than restating its lists: a new media
# type must not silently leave a group here stale.
ENTRY_OWNERS = MEDIA_TYPE_KEYS
ALL_OWNERS = tuple(OWNER_TYPE_KEYS)

# Sections every owner shares, spelled out per section below rather than
# composed, so one section's applicability is readable in one place.
_SERIES_AND_UP = ("series", "franchise")


@dataclass(frozen=True)
class NoteSection:
    """One section of the notes page."""

    key: str
    shape: str
    label: str
    owners: tuple[str, ...]
    # Per-owner label overrides; `label` is the fallback.
    labels: dict[str, str] = field(default_factory=dict)
    # Allowed values for note.kind. Empty means the section has no dropdown.
    kinds: tuple[str, ...] = ()
    episode_placeholder: str | None = None
    # Per-owner episode-placeholder overrides; `episode_placeholder` is the
    # fallback. Manga counts chapters, not episodes.
    episode_placeholders: dict[str, str] = field(default_factory=dict)
    # At most one row per owner.
    singleton: bool = False
    # Owner types where `content` may not be empty.
    desc_required: tuple[str, ...] = ()


OP_ED_KINDS = ("變化OP", "變化ED", "無OP", "無ED", "特殊OP", "特殊ED")

# Order here is display order.
NOTE_SECTIONS: tuple[NoteSection, ...] = (
    NoteSection(
        key="remark",
        shape=SHAPE_TEXT,
        label="備註 Remark",
        owners=ALL_OWNERS,
        singleton=True,
    ),
    NoteSection(
        key="advantages",
        shape=SHAPE_TEXT,
        label="優點 Advantages",
        owners=ENTRY_OWNERS + _SERIES_AND_UP,
    ),
    NoteSection(
        key="disadvantages",
        shape=SHAPE_TEXT,
        label="缺點 Disadvantages",
        owners=ENTRY_OWNERS + _SERIES_AND_UP,
    ),
    NoteSection(
        key="double_edged",
        shape=SHAPE_TEXT,
        label="優缺點",
        owners=ENTRY_OWNERS + _SERIES_AND_UP,
    ),
    NoteSection(
        key="public_reviews",
        shape=SHAPE_TEXT,
        label="大眾評價 Public Reviews",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="personal_reviews",
        shape=SHAPE_TEXT,
        label="我的評價 Personal Reviews",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="episode_comments",
        shape=SHAPE_EPISODE_TEXT,
        label="各集評論 Episode Comments",
        owners=("anime", "tv-show", "cartoon"),
        episode_placeholder="Episode, e.g. ep 1",
    ),
    NoteSection(
        key="highlights",
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段 Highlights",
        owners=("anime",),
        episode_placeholder="Episode(s), e.g. ep 6",
        # The stored data distinguishes a great episode from a great arc, so the
        # section keeps a dropdown even though its siblings do not.
        kinds=("神回", "神篇章"),
    ),
    NoteSection(
        key="highlight_episodes",
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段",
        owners=("tv-show", "cartoon", "manga"),
        labels={"manga": "神回"},
        episode_placeholder="Episode(s), e.g. ep 3",
        episode_placeholders={"manga": "Chapter(s), e.g. ch 6"},
    ),
    NoteSection(
        key="highlight_passages",
        shape=SHAPE_TEXT,
        label="神片段",
        owners=("novel",),
    ),
    NoteSection(
        key="analysis",
        shape=SHAPE_TEXT_LINKS,
        label="解析 Analysis",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="cinematography",
        shape=SHAPE_TEXT_LINKS,
        label="分鏡/演出/巧思",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "manga", "series"),
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="craft",
        shape=SHAPE_TEXT_LINKS,
        label="巧思",
        owners=("novel",),
    ),
    NoteSection(
        key="foreshadowing",
        shape=SHAPE_TEXT_LINKS,
        label="Foreshadowing",
        owners=(
            "anime",
            "anime-movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        )
        + _SERIES_AND_UP,
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="symmetry",
        shape=SHAPE_TEXT_LINKS,
        label="對稱 Symmetry",
        owners=(
            "anime",
            "anime-movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        )
        + _SERIES_AND_UP,
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="op_ed_changes",
        shape=SHAPE_EPISODE_TEXT,
        label="OP/ED 變動",
        owners=("anime", "tv-show", "cartoon"),
        kinds=OP_ED_KINDS,
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="extended_episodes",
        shape=SHAPE_EPISODE_TEXT,
        label="加長",
        owners=("anime", "tv-show", "cartoon"),
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="adaptation",
        shape=SHAPE_TEXT_LINKS,
        label="改編 Adaptation",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "novel")
        + _SERIES_AND_UP,
        desc_required=("anime", "anime-movie", "novel"),
    ),
    NoteSection(
        key="resources",
        shape=SHAPE_NAME_LINKS,
        label="Resources",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="unread",
        shape=SHAPE_NAME_LINKS,
        label="Unread",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="questions",
        shape=SHAPE_TEXT,
        label="Questions",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="quotes",
        shape=SHAPE_EXTERNAL,
        label="名言 Quotes",
        # A quote is said in a specific work, so it stays entry-only - see the
        # class docstring in app/models/quote.py.
        owners=ENTRY_OWNERS,
    ),
    NoteSection(
        key="memes",
        shape=SHAPE_EXTERNAL,
        label="梗/迷因 Memes",
        # A running gag often spans a franchise, so meme already allows all ten.
        owners=ALL_OWNERS,
    ),
)

_BY_KEY = {s.key: s for s in NOTE_SECTIONS}


def section_by_key(key: str) -> NoteSection | None:
    """The section with this key, or None if it is not a known section."""
    return _BY_KEY.get(key)


def sections_for(owner_type: str) -> list[NoteSection]:
    """Every section that applies to this owner type, in display order."""
    return [s for s in NOTE_SECTIONS if owner_type in s.owners]


def label_for(section: NoteSection, owner_type: str) -> str:
    """This section's label for this owner, falling back to the default."""
    return section.labels.get(owner_type, section.label)


def placeholder_for(section: NoteSection, owner_type: str) -> str | None:
    """This section's episode placeholder for this owner, else the default."""
    return section.episode_placeholders.get(owner_type, section.episode_placeholder)
