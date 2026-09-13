"""
The notes section registry - the single authority on what a note may be.

Notes used to be a JSONB blob whose shape lived in seven frontend config files.
The backend could not validate or query it, and the same section drifted
between media types. This module replaces those files: each entry declares one
section's shape, label, applicable owner types, ordering and dropdown values,
and both the API schema layer and the frontend read it from here.

Adding a section is one entry and no migration. Adding a new *shape* is rare
and costs one nullable column on `note`.

Each section also declares a `scope`: `catalog` sections hold one shared set of
rows written by admins and read by everyone, `personal` sections hold one set
per user and are read only by their author. That distinction lives here rather
than on the table so that changing it later stays a registry edit plus a data
reassignment - no schema change - which is the whole reason this module exists.

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
# content XOR one link. Distinct from text_links, which lets one row carry a
# body AND its sources: a public review is either what someone said or a
# pointer to where they said it, so mixing the two in one row is ambiguous.
SHAPE_TEXT_OR_LINK = "text_or_link"  # content or links[0], never both
SHAPE_EPISODE_TEXT = "episode_text"  # episode, content, kind where declared
SHAPE_NAME_LINKS = "name_links"  # title, links
# A named list whose items are each either a line of text or a labelled link,
# in one ordered array. name_links can only hold URLs, and text_links has no
# title, so neither can say "here is my Malenia plan: two notes and a video".
SHAPE_NAME_ENTRIES = "name_entries"  # title, entries
# The widest shape: the episode a song plays in, its name, what it does there,
# where to hear it, and how far tracking it has got. text_links has no title and
# name_links has no episode or body, so neither can say all of it. The status is
# the same Need/Pending/Done the music_track sections use - an insert song is
# tracked like an OP, it just also has an episode.
SHAPE_EPISODE_NAME_LINKS = (
    "episode_name_links"  # episode, title, content, links, status
)
# One theme song of a work: its name, which cut it is, how far tracking it has
# got, where to hear it, and a remark. The only shape with two dropdowns - the
# type is a property of the song, the status is a property of my work on it -
# which is why `note` carries a `status` column alongside `kind`.
SHAPE_MUSIC_TRACK = "music_track"  # title, kind, status, links, content
# Backed by its own table (quote, meme), never by a `note` row.
SHAPE_EXTERNAL = "external"

STORED_SHAPES = frozenset(
    {
        SHAPE_TEXT,
        SHAPE_TEXT_LINKS,
        SHAPE_TEXT_OR_LINK,
        SHAPE_EPISODE_TEXT,
        SHAPE_NAME_LINKS,
        SHAPE_NAME_ENTRIES,
        SHAPE_EPISODE_NAME_LINKS,
        SHAPE_MUSIC_TRACK,
    }
)

# --- Scopes ---------------------------------------------------------------
# Whose rows a section holds. The distinction lives here rather than in the
# schema because this module's own rule is "adding a section is one entry and
# no migration", and a catalogue/personal reclassification must obey it: it is
# a registry edit plus a data reassignment, never an ALTER TABLE.
SCOPE_CATALOG = "catalog"  # one shared set of rows, admin-authored
SCOPE_PERSONAL = "personal"  # one set per user

# --- Owner groups ---------------------------------------------------------
# Both derive from media_resolver rather than restating its lists: a new media
# type must not silently leave a group here stale.
ENTRY_OWNERS = MEDIA_TYPE_KEYS
ALL_OWNERS = tuple(OWNER_TYPE_KEYS)

# Sections every owner shares, spelled out per section below rather than
# composed, so one section's applicability is readable in one place.
_SERIES_AND_UP = ("series", "franchise")


@dataclass(frozen=True)
class NoteGroup:
    """A run of sections the page renders inside one collapsible card."""

    key: str
    label: str
    icon: str


# Grouping is display-only: a grouped section is still an ordinary registry
# entry with its own rows, and `group` is the only thing that puts it inside a
# card. The page renders that card BESIDE the Notes card rather than within it,
# so a group is a peer of Notes, not a section of it. Sections sharing a group
# are kept adjacent in NOTE_SECTIONS below - the page no longer needs them to
# be, but the order is what a reader uses to see a group whole.
NOTE_GROUPS: tuple[NoteGroup, ...] = (
    NoteGroup(key="reviews", label="評論 Reviews and Comments", icon="fa-comments"),
    # The key is not `analysis` because a section already owns that key. The two
    # namespaces are separate dicts, but a reader scanning for "analysis" should
    # not have to work out which one a bare key means.
    NoteGroup(
        key="analysis_group",
        label="解析 Analysis and Cinematography",
        icon="fa-clapperboard",
    ),
    # The key `guides` is free only because the SECTION `guides` was retired
    # when this group replaced it. Group keys and section keys are separate
    # dicts, so the two could coexist - `analysis_group` above is keyed that way
    # to avoid making a reader work that out. Here the collision was removed
    # instead, which is why this key does not need the same suffix.
    NoteGroup(key="guides", label="攻略 Guides", icon="fa-map"),
    # 劇情 is what HAPPENS; `analysis_group` above is what it MEANS. Keeping
    # them apart is why `story_other` exists - a stray observation lands there
    # rather than drifting into Analysis.
    NoteGroup(key="story", label="劇情 Story", icon="fa-book-open"),
    # NOT "進度 Progress": Game.jsx already renders a <Slip title="Progress">
    # (playtime and achievements) on the same page, and two cards with one name
    # is the `resources` / `builds_and_mods` collision again.
    NoteGroup(key="todo", label="待辦 Todo", icon="fa-list-check"),
    NoteGroup(key="music", label="音樂 Music", icon="fa-music"),
    NoteGroup(key="quotes_memes", label="名言/梗 Quotes and Memes", icon="fa-quote-right"),
)

_GROUPS_BY_KEY = {g.key: g for g in NOTE_GROUPS}


@dataclass(frozen=True)
class NoteSection:
    """One section of the notes page."""

    key: str
    shape: str
    label: str
    owners: tuple[str, ...]
    # catalog: one shared set of rows, written by admins, read unfiltered by
    # everyone. personal: one set per user, read only by its author.
    # None only for SHAPE_EXTERNAL sections, which store no `note` row at all.
    #
    # No default, deliberately. A default would let the next section added
    # inherit a scope by omission, and the wrong inheritance publishes one
    # person's private note to every user. A test asserts the absence.
    scope: str | None
    # Per-owner label overrides; `label` is the fallback.
    labels: dict[str, str] = field(default_factory=dict)
    # The group whose card this section renders inside. None renders flat.
    group: str | None = None
    # Render this section as its own top-level card instead of inside the Notes
    # card. Every shape component already draws its own SectionCard, so a
    # standalone section needs no wrapper - it is simply lifted out. This is for
    # a section that stands alone; a section that belongs with others gets a
    # `group`, and setting both is meaningless (a test forbids it).
    standalone: bool = False
    # Allowed values for note.kind. Empty means the section has no dropdown.
    kinds: tuple[str, ...] = ()
    # Which kind a new row starts on. None starts blank.
    default_kind: str | None = None
    # Allowed values for note.status - how far tracking has got. Used by the
    # music_track sections and by insert_songs. Empty means no status field.
    statuses: tuple[str, ...] = ()
    # Per-owner kind overrides; `kinds` is the fallback. A section may offer a
    # dropdown to some owners and none to others - manga highlights are always
    # 神回, so a chooser there would have one choice.
    kinds_by_owner: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # The label for `note.locator` - what "where in the work" means here. None
    # means the section has no anchor and shows no field.
    locator_placeholder: str | None = None
    # Per-owner locator-placeholder overrides; `locator_placeholder` is the
    # fallback. Manga counts chapters, not episodes.
    locator_placeholders: dict[str, str] = field(default_factory=dict)
    # Sections whose whole point is the anchor: an OP change with no episode,
    # or a highlight with no episode, says nothing. Section-level rather than
    # per-owner, unlike `desc_required` - that is true of every owner the
    # section has.
    locator_required: bool = False
    # At most one row per owner.
    singleton: bool = False
    # Owner types where `content` may not be empty.
    desc_required: tuple[str, ...] = ()


OP_ED_KINDS = ("變化OP", "變化ED", "無OP", "無ED", "特殊OP", "特殊ED")

# Which cut of a theme song a row is about. Shared by the three music_track
# sections so OP and ED cannot drift apart.
MUSIC_TYPES = ("normal", "different version", "all inclusive version")

# How far I have got with a song: the same three values the anime.op / ed /
# insert_ost columns held before they became note rows. Every music section
# offers it, insert_songs included - it is the one thing they all track.
MUSIC_STATUSES = ("Need", "Pending", "Done")

# A standout episode, a standout moment inside one, and a standout arc across
# several. Shared by the two episode-shaped highlight sections so they cannot
# drift apart.
HIGHLIGHT_KINDS = ("神回", "神片段", "神篇章")

# Order here is display order.
NOTE_SECTIONS: tuple[NoteSection, ...] = (
    NoteSection(
        key="remark",
        shape=SHAPE_TEXT,
        label="備註 Remark",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        singleton=True,
    ),
    NoteSection(
        key="advantages",
        shape=SHAPE_TEXT,
        label="優點 Advantages",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="disadvantages",
        shape=SHAPE_TEXT,
        label="缺點 Disadvantages",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="double_edged",
        shape=SHAPE_TEXT,
        label="優缺點",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="public_reviews",
        shape=SHAPE_TEXT_OR_LINK,
        label="大眾評價 Public Reviews",
        owners=ALL_OWNERS,
        scope=SCOPE_CATALOG,
        group="reviews",
    ),
    NoteSection(
        key="personal_reviews",
        shape=SHAPE_TEXT,
        label="我的評價 Personal Reviews",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="episode_comments",
        locator_required=True,
        shape=SHAPE_TEXT_LINKS,
        label="各集評論 Episode Comments",
        owners=("anime", "tv-show", "cartoon", "game"),
        scope=SCOPE_PERSONAL,
        # A game is cut into chapters or parts rather than episodes, but the
        # section is the same one: a comment on one segment of the work.
        labels={"game": "各章評論 Part Reviews"},
        locator_placeholder="Episode, e.g. ep 1",
        locator_placeholders={"game": "Chapter / Part, e.g. Ch 3"},
        group="reviews",
    ),
    NoteSection(
        key="highlights",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段 Highlights",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 6",
        # The stored data distinguishes a great episode from a great moment or
        # arc, so the section keeps a dropdown even though its siblings do not.
        kinds=HIGHLIGHT_KINDS,
    ),
    NoteSection(
        key="highlight_episodes",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段",
        owners=("tv-show", "cartoon", "manga"),
        scope=SCOPE_CATALOG,
        labels={"manga": "神回"},
        # TV shows and cartoons draw the same distinction anime does. Manga
        # does not, so it keeps the plain field.
        kinds_by_owner={"tv-show": HIGHLIGHT_KINDS, "cartoon": HIGHLIGHT_KINDS},
        locator_placeholder="Episode(s), e.g. ep 3",
        locator_placeholders={"manga": "Chapter(s), e.g. ch 6"},
    ),
    NoteSection(
        key="highlight_passages",
        shape=SHAPE_TEXT,
        label="神片段",
        owners=("novel",),
        scope=SCOPE_CATALOG,
    ),
    NoteSection(
        key="highlight_moments",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="神場景 Highlights",
        owners=("game",),
        scope=SCOPE_CATALOG,
        locator_placeholder="Chapter / Boss, e.g. Ch 3",
    ),
    NoteSection(
        key="analysis",
        shape=SHAPE_TEXT_LINKS,
        label="解析 Analysis",
        owners=ALL_OWNERS,
        scope=SCOPE_CATALOG,
        group="analysis_group",
    ),
    NoteSection(
        key="cinematography",
        shape=SHAPE_TEXT_LINKS,
        label="分鏡/演出/巧思",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "manga", "series"),
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
        group="analysis_group",
    ),
    NoteSection(
        key="craft",
        shape=SHAPE_TEXT_LINKS,
        label="巧思",
        owners=("novel",),
        scope=SCOPE_CATALOG,
        group="analysis_group",
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
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
        group="analysis_group",
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
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
        group="analysis_group",
    ),
    # --- 攻略 Guides ------------------------------------------------------
    # Fifteen sections rather than one section with a kind, because each is a
    # list somebody actually keeps separately: which build to run is not the
    # same question as where the collectibles are. All game-only - 屬性&配點
    # means nothing for a novel - and all catalogue: a guide is shared.
    #
    # `name_entries` where a row is one NAMED thing and what is known about it
    # (a quest, a build, a boss, an ending); `text_links` where it is advice
    # with sources and no name. Neither shape renders a locator, so "which
    # area" is written as an entry line.
    NoteSection(
        key="beginner",
        shape=SHAPE_TEXT_LINKS,
        label="新手 Beginner",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="controls",
        shape=SHAPE_TEXT_LINKS,
        label="操作 Controls",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="trivia",
        shape=SHAPE_TEXT_LINKS,
        label="小知識 Trivia",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="side_quests",
        shape=SHAPE_NAME_ENTRIES,
        label="支線任務列表 Side Quests",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="builds_and_styles",
        shape=SHAPE_NAME_ENTRIES,
        label="配裝&流派 Builds & Styles",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="stats_and_points",
        shape=SHAPE_TEXT_LINKS,
        label="屬性&配點 Stats & Points",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="skills",
        shape=SHAPE_NAME_ENTRIES,
        label="技能 Skills",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="collectibles",
        shape=SHAPE_NAME_ENTRIES,
        label="收集物 Collectibles",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="items",
        shape=SHAPE_NAME_ENTRIES,
        label="道具 Items",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="weapons_and_gear",
        shape=SHAPE_NAME_ENTRIES,
        label="武器&裝備 Weapons & Gear",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        # NOT `characters`: a `character` table and a /character/:id page
        # already exist, and a bare `characters` note section would read as
        # related to them.
        key="characters_guide",
        shape=SHAPE_NAME_ENTRIES,
        label="角色 Characters",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="enemies",
        shape=SHAPE_NAME_ENTRIES,
        label="敵人 Enemies",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        key="endings",
        shape=SHAPE_NAME_ENTRIES,
        label="結局 Endings",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    NoteSection(
        # Where `builds_and_mods`'s Mod and Tool rows went. A mod is not a
        # guide, so it is not folded into one of the sections above; Mod and
        # Tool stay one section with a kind because they are the same shape.
        key="mods_and_tools",
        shape=SHAPE_NAME_ENTRIES,
        label="模組&工具 Mods & Tools",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
        kinds=("Mod", "Tool"),
    ),
    NoteSection(
        # The old `guides` section: a pointer to somebody else's walkthrough,
        # which is all it ever held now that the fourteen above cover the
        # content itself.
        key="guide_resources",
        shape=SHAPE_NAME_ENTRIES,
        label="攻略資源 Guide Resources",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="guides",
    ),
    # --- 劇情 Story -------------------------------------------------------
    # What happens, as opposed to what it means - 解析 Analysis, two cards up,
    # holds the second. This card is a wall of spoilers and the site has no
    # spoiler gate; the collapsible card is all today's UI offers.
    NoteSection(
        key="main_plot",
        shape=SHAPE_EPISODE_TEXT,
        label="主線劇情 Main Plot",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
        # Deliberately NOT locator_required, unlike episode_comments and
        # highlight_moments: a beat remembered without its chapter number is
        # still a beat, whereas a per-chapter comment about nothing in
        # particular is not a per-chapter comment.
        locator_placeholder="Chapter / Part, e.g. Ch 3",
    ),
    NoteSection(
        key="side_plot",
        shape=SHAPE_EPISODE_TEXT,
        label="支線劇情 Side Stories",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
        locator_placeholder="Chapter / Part, e.g. Ch 3",
    ),
    NoteSection(
        key="character_arcs",
        shape=SHAPE_TEXT_LINKS,
        label="角色劇情 Character Arcs",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        key="lore",
        shape=SHAPE_TEXT_LINKS,
        label="世界觀&設定 Lore",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        # Plain text: one ordered list of dated events. Every row wanting a
        # link would mean this should have been text_links.
        key="timeline",
        shape=SHAPE_TEXT,
        label="時間線 Timeline",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        key="mysteries",
        shape=SHAPE_TEXT_LINKS,
        label="未解之謎 Mysteries",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    NoteSection(
        # The overflow that keeps a stray story observation out of Analysis.
        key="story_other",
        shape=SHAPE_TEXT_LINKS,
        label="其他 Other",
        owners=("game",),
        scope=SCOPE_CATALOG,
        group="story",
    ),
    # --- 待辦 Todo --------------------------------------------------------
    # Four sections rather than one section with a kind, because ordering is
    # PER SECTION: sort_index orders rows within one (owner, section) pair and
    # PATCH /api/notes/reorder renumbers the whole section, so a kind-tagged
    # single section could not order items within a bucket. Moving an item
    # between buckets is therefore a PATCH of `section`, which the API already
    # accepts - no UI does it, and none does reorder either.
    #
    # Personal, not catalogue: a backlog is one person's. text_links so an item
    # can carry the guide link that prompted it.
    NoteSection(
        key="todo_now",
        shape=SHAPE_TEXT_LINKS,
        label="現在進行 Doing now",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_next",
        shape=SHAPE_TEXT_LINKS,
        label="接下來 To do next",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_later",
        shape=SHAPE_TEXT_LINKS,
        label="未來 To do in the future",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    NoteSection(
        key="todo_maybe",
        shape=SHAPE_TEXT_LINKS,
        label="可能 Might do",
        owners=("game",),
        scope=SCOPE_PERSONAL,
        group="todo",
    ),
    # --- 音樂 Music -------------------------------------------------------
    # The five sections below form the music group, and the page renders that
    # run inside one card. They stay separate registry entries rather than one
    # section with an OP/ED/OST dropdown: a work has its own list of OP rows,
    # and folding the lists into one would make "which OPs do I still need?" a
    # filter rather than a section.
    NoteSection(
        key="op",
        shape=SHAPE_MUSIC_TRACK,
        label="OP",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        kinds=MUSIC_TYPES,
        default_kind="normal",
        statuses=MUSIC_STATUSES,
    ),
    NoteSection(
        key="ed",
        shape=SHAPE_MUSIC_TRACK,
        label="ED",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        kinds=MUSIC_TYPES,
        default_kind="normal",
        statuses=MUSIC_STATUSES,
    ),
    NoteSection(
        key="insert_songs",
        # An insert song with no episode is just a song: where it plays is what
        # makes it a note. Everything else is optional - a remembered scene
        # often comes before the title does.
        locator_required=True,
        shape=SHAPE_EPISODE_NAME_LINKS,
        label="插入曲 Insert Song",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        # The only tracking dropdown this section needs, and the same one OP,
        # ED and OST offer. There is no type: an insert song is whatever cut
        # plays in that episode, so "which version" has no answer separate from
        # the episode itself.
        statuses=MUSIC_STATUSES,
        locator_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="ost",
        shape=SHAPE_MUSIC_TRACK,
        label="OST",
        owners=("anime",),
        scope=SCOPE_CATALOG,
        group="music",
        kinds=MUSIC_TYPES,
        default_kind="normal",
        statuses=MUSIC_STATUSES,
    ),
    NoteSection(
        key="op_ed_changes",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="OP/ED 變動",
        owners=("anime", "tv-show", "cartoon"),
        scope=SCOPE_CATALOG,
        group="music",
        kinds=OP_ED_KINDS,
        locator_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="extended_episodes",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="加長",
        owners=("anime", "tv-show", "cartoon"),
        scope=SCOPE_CATALOG,
        locator_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="adaptation",
        shape=SHAPE_TEXT_LINKS,
        label="改編 Adaptation",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "novel")
        + _SERIES_AND_UP,
        scope=SCOPE_CATALOG,
        desc_required=("anime", "anime-movie", "novel"),
    ),
    NoteSection(
        key="resources",
        shape=SHAPE_NAME_LINKS,
        label="Resources",
        owners=ALL_OWNERS,
        scope=SCOPE_CATALOG,
        standalone=True,
    ),
    NoteSection(
        key="questions",
        shape=SHAPE_EPISODE_TEXT,
        label="Questions",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        # The locator here is not an episode: it is whatever prompted the
        # question - an episode, a scene, an interview. Optional, because
        # plenty of questions are about the work as a whole.
        locator_placeholder="Source, e.g. ep 3",
        # The mirror of locator_required: a source with no question attached
        # says nothing, so the body is what cannot be missing.
        desc_required=ALL_OWNERS,
        standalone=True,
    ),
    NoteSection(
        key="quotes",
        shape=SHAPE_EXTERNAL,
        label="名言 Quotes",
        # A quote is said in a specific work, so it stays entry-only - see the
        # class docstring in app/models/quote.py.
        owners=ENTRY_OWNERS,
        # Universal: shared, unfiltered, no per-user copies. Backed by the
        # `quote` table, so there is no `note` row to scope.
        scope=None,
        group="quotes_memes",
    ),
    NoteSection(
        key="memes",
        shape=SHAPE_EXTERNAL,
        label="梗/迷因 Memes",
        # A running gag often spans a franchise, so meme already allows all ten.
        owners=ALL_OWNERS,
        # Universal, like quotes, and backed by the `meme` table.
        scope=None,
        group="quotes_memes",
    ),
)

_BY_KEY = {s.key: s for s in NOTE_SECTIONS}

PERSONAL_SECTIONS: frozenset[str] = frozenset(
    s.key for s in NOTE_SECTIONS if s.scope == SCOPE_PERSONAL
)
CATALOG_SECTIONS: frozenset[str] = frozenset(
    s.key for s in NOTE_SECTIONS if s.scope == SCOPE_CATALOG
)


def sections_by_scope(scope: str) -> list[NoteSection]:
    """Every section of one scope, in display order."""
    return [s for s in NOTE_SECTIONS if s.scope == scope]


def section_by_key(key: str) -> NoteSection | None:
    """The section with this key, or None if it is not a known section."""
    return _BY_KEY.get(key)


def sections_for(owner_type: str) -> list[NoteSection]:
    """Every section that applies to this owner type, in display order."""
    return [s for s in NOTE_SECTIONS if owner_type in s.owners]


def label_for(section: NoteSection, owner_type: str) -> str:
    """This section's label for this owner, falling back to the default."""
    return section.labels.get(owner_type, section.label)


def kinds_for(section: NoteSection, owner_type: str) -> tuple[str, ...]:
    """This section's allowed kinds for this owner, falling back to the default."""
    return section.kinds_by_owner.get(owner_type, section.kinds)


def group_by_key(key: str) -> NoteGroup | None:
    """The group with this key, or None if it is not a known group."""
    return _GROUPS_BY_KEY.get(key)


def locator_for(section: NoteSection, owner_type: str) -> str | None:
    """This section's locator label for this owner, else the default."""
    return section.locator_placeholders.get(owner_type, section.locator_placeholder)
