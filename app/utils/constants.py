from enum import Enum


class WatchStatus(str, Enum):
    MIGHT_WATCH = "Might Watch"
    PLAN_TO_WATCH = "Plan to Watch"
    WATCH_WHEN_AIRS = "Watch When Airs"
    ACTIVE_WATCHING = "Active Watching"
    PASSIVE_WATCHING = "Passive Watching"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    COMPLETED_EXPLAINED = "Completed (解說)"
    TEMP_DROPPED = "Temp Dropped"
    DROPPED = "Dropped"
    WONT_WATCH = "Won't Watch"


class ReadStatus(str, Enum):
    MIGHT_READ = "Might Read"
    PLAN_TO_READ = "Plan to Read"
    ACTIVE_READING = "Active Reading"
    PASSIVE_READING = "Passive Reading"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    COMPLETED_EXPLAINED = "Completed (解說)"
    TEMP_DROPPED = "Temp Dropped"
    DROPPED = "Dropped"
    WONT_READ = "Won't Read"


# "Completed (解說)" means the entry was finished through a summary/commentary
# video rather than the work itself. It still counts as completed everywhere the
# plain "Completed" status does, so both live behind these sets.
COMPLETED_WATCH_STATUSES = frozenset(
    {WatchStatus.COMPLETED, WatchStatus.COMPLETED_EXPLAINED}
)
COMPLETED_READ_STATUSES = frozenset(
    {ReadStatus.COMPLETED, ReadStatus.COMPLETED_EXPLAINED}
)


class PlayStatus(str, Enum):
    MIGHT_PLAY = "Might Play"
    PLAN_TO_PLAY = "Plan to Play"
    # The analogue of WatchStatus.WATCH_WHEN_AIRS, and more load-bearing here:
    # a pre-ordered or wishlisted unreleased title is a normal state in a
    # collection organised by purchasable.
    PLAY_WHEN_RELEASED = "Play When Released"
    ACTIVE_PLAYING = "Active Playing"
    PASSIVE_PLAYING = "Passive Playing"
    # Sandbox, live-service and roguelike titles: no playthrough to resume and
    # no finish to reach, so neither PAUSED (mid-playthrough, means to finish)
    # nor TEMP_DROPPED (walked away) fits. Depth of finish stays in
    # COMPLETION_LEVELS, which is why one status covers Minecraft, Valorant and
    # Slay the Spire - what differs between them is the game, not the state.
    PLAY_ANYTIME = "Play Anytime"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    TEMP_DROPPED = "Temp Dropped"
    DROPPED = "Dropped"
    WONT_PLAY = "Won't Play"


# There is no games analogue of "Completed (解說)", so this holds one value.
# Declared anyway, so it reads beside COMPLETED_WATCH_STATUSES and so a second
# completed-ish status later is a one-line change rather than a new concept.
COMPLETED_PLAY_STATUSES = frozenset({PlayStatus.COMPLETED})


class AiringStatus(str, Enum):
    NOT_YET_AIRED = "Not Yet Aired"
    AIRING = "Airing"
    FINISHED_AIRING = "Finished Airing"
    CANCELED = "Canceled"
    RUMORED = "Rumored"


class AnimeAiringType(str, Enum):
    TV = "TV"
    ONA = "ONA"
    OVA = "OVA"
    OAD = "OAD"
    SPECIAL = "Special"
    MOVIE = "Movie"


class FranchiseType(str, Enum):
    ANIME = "Anime"
    MOVIE = "Movie"
    TV = "TV"
    CARTOON = "Cartoon"
    COMIC = "Comic"
    ACG = "ACG"
    NOVEL = "Novel"
    GAME = "Game"


# ---------------------------------------------------------------------------
# Tier 1 closed enums that had no Python home. Values are copied verbatim from
# frontend/src/config/fieldOptions.js and weekdays.js, which were the source
# until app/routers/constants.py took over. Do not "fix" a value here: several
# differ from docs/options.md, and reconciling them is deliberately out of
# scope for the options redesign.
# ---------------------------------------------------------------------------

MY_RATINGS: tuple[str, ...] = ("S", "A+", "A", "B", "C", "D", "E", "F")

FRANCHISE_EXPECTATIONS: tuple[str, ...] = ("Highest", "High", "Medium", "Low")

# Formerly the "Main / Spinoff" system option category.
IS_MAIN: tuple[str, ...] = ("本傳", "外傳", "前傳", "後傳", "總集篇")

MOVIE_TYPES: tuple[str, ...] = ("Reality", "Animation")

# Formerly the "Region (TV Show)" / "Region (Manga)" option categories.
TV_REGIONS: tuple[str, ...] = ("歐美劇", "韓劇", "日劇", "陸劇", "台劇", "動畫")
MANGA_REGIONS: tuple[str, ...] = ("日漫", "韓漫", "國漫", "台漫", "其他")
NOVEL_REGIONS: tuple[str, ...] = ("JP", "CN", "TW", "KR", "Western")

NOVEL_TYPES: tuple[str, ...] = ("Light Novel", "Novel", "Web", "Other")

# Unit kinds a novel can hold. A plain map rather than a system_option
# category: code branches on these (which kinds the editor offers, which
# counter pair the tracker renders), and docs/options.md reserves
# system_option for values nothing branches on.
NOVEL_UNIT_KINDS = ("volume", "arc", "story", "chapter")

NOVEL_UNIT_KINDS_BY_TYPE = {
    "Light Novel": ("volume",),
    "Novel": ("volume",),
    "Web": ("arc",),
    "Other": ("volume", "story", "chapter"),
}

# Types that count volumes and nothing else: chapter and arc columns are not
# merely empty on them, they are meaningless. Derived from the map above so the
# two cannot drift - a type that may only hold volume rows may only count
# volumes. derive_novel_progress() clears the other columns for these types.
NOVEL_VOLUME_ONLY_TYPES: tuple[str, ...] = tuple(
    t for t, kinds in NOVEL_UNIT_KINDS_BY_TYPE.items() if kinds == ("volume",)
)

# Prefix used when a unit has no unit_key of its own.
NOVEL_UNIT_KEY_PREFIX = {
    "volume": "Vol",
    "arc": "Arc",
    "story": "Story",
    "chapter": "Ch",
}

COMIC_TYPES: tuple[str, ...] = ("Ongoing", "Limited", "One-Shot", "Annual")

MANGA_SERIALIZATION_STATUSES: tuple[str, ...] = ("連載中", "停更", "腰斬", "完結")
NOVEL_SERIALIZATION_STATUSES: tuple[str, ...] = (
    "連載中",
    "連載中 (不穩定)",
    "連載中 (有生之年)",
    "停更",
    "完結",
    "腰斬",
    "可能更多",
    "未出",
)

CARTOON_AIRING_TYPES: tuple[str, ...] = ("TV", "Movie", "OVA", "Special")

WEEKDAYS: tuple[str, ...] = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)

MUSIC_STATUSES: tuple[str, ...] = ("Need", "Pending", "Done")
SEIYUU_STATUSES: tuple[str, ...] = ("Need", "Done")

# ---------------------------------------------------------------------------
# frontend/src/config/fieldOptions.js diverges from the Enum classes above for
# these two fields (FranchiseType has "Anime" and no "Anime Movie";
# AnimeAiringType lacks the trailing "Other"). The /api/constants endpoint
# must serve what the dropdowns show today, so it reads these tuples instead
# of the enums — see Ruling R10 in the system-options-redesign spec. The
# Enum classes stay untouched; backend logic keeps using them. Do not
# collapse these back into `_values(c.FranchiseType)` /
# `_values(c.AnimeAiringType)` without first reconciling the two lists.
FRANCHISE_TYPES: tuple[str, ...] = (
    "ACG",
    "Anime Movie",
    "TV",
    "Movie",
    "Cartoon",
    "Comic",
    "Novel",
    "Game",
)

ANIME_AIRING_TYPES: tuple[str, ...] = (
    "TV",
    "Movie",
    "ONA",
    "OVA",
    "OAD",
    "Special",
    "Other",
)


GAME_TYPES: tuple[str, ...] = ("Base Game", "DLC", "Expansion", "Bundle")

# How deep a finish went. Deliberately a ladder of content depth only: whether
# every ending was seen, every achievement earned and every collectible found
# (games.all_endings / all_achievements / all_collected) and how many
# achievements were earned (games.achievements_*) are separate axes, because
# they move independently of this one. Speedrun and glitch categories are out
# of scope.
COMPLETION_LEVELS: tuple[str, ...] = (
    "Main Story",
    "Main + Extras",
    "Post-game",
    "Completionist",
)

# A lifecycle ladder, ordered from "does not exist yet" to "over". "Released"
# is out and static; "Ongoing" is out and still receiving content or running
# servers, and it is the one that later becomes "Discontinued" (關服: servers
# shut down, or support and sales ended). "Cancelled" is death before release,
# "Discontinued" death after it.
GAME_RELEASE_STATUSES: tuple[str, ...] = (
    "Rumored",
    "Unreleased",
    "Early Access",
    "Released",
    "Ongoing",
    "Discontinued",
    "Cancelled",
)

GAME_STOREFRONTS: tuple[str, ...] = (
    "Steam",
    "Nintendo eShop",
    "PlayStation Store",
    "Xbox Store",
    "GOG",
    "Epic Games Store",
    "Physical",
    "Other",
)
GAME_OWNERSHIP_KINDS: tuple[str, ...] = (
    "Owned",
    "Wishlist",
    "Subscription",
    "Free",
    "Not Owned",
)
GAME_COPY_FORMATS: tuple[str, ...] = ("Digital", "Physical")
GAME_ACQUISITION_KINDS: tuple[str, ...] = (
    "Bought",
    "Gifted",
    "Free",
    "Bundled",
    "Subscription",
)
