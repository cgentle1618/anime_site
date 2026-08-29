"""
The vocabulary of `plan_next.scope` and of the size buckets on franchise and
series.

Deliberately shaped like app/utils/relation_kinds.py: a frozen dataclass per
value, dicts keyed by the value stored in the column, and helpers for
validation. Both are registries for cross-table facts and read the same way on
purpose.

Media type keys are the hyphenated ones from MEDIA_TABLES in
app/utils/media_resolver.py, so plan_next agrees with media_relation and
watch_order_item on what a media_type value looks like.

This module is the single source of truth for the API validator, the Calculate
derivation, the admin dropdowns and the docs tables. The frontend fetches it
over HTTP (GET /api/plan-next/kinds) rather than keeping a second copy.
"""

from dataclasses import dataclass
from typing import Optional

from app.utils.media_resolver import MEDIA_TYPE_KEYS


@dataclass(frozen=True)
class SizeGroup:
    """One size bucket: the value stored, and how it reads in the UI."""

    key: str
    label: str


SCOPES: tuple[str, ...] = ("entry", "series", "franchise")

# Which scopes each media type may be planned at. Entry is universal; the two
# grouping tiers are opt-in, because anime movies, manga and novels are tracked
# one entry at a time and comic has no franchise-level planning.
ALLOWED_SCOPES: dict[str, frozenset[str]] = {
    "anime": frozenset({"entry", "series", "franchise"}),
    "movie": frozenset({"entry", "series", "franchise"}),
    "tv-show": frozenset({"entry", "series", "franchise"}),
    "cartoon": frozenset({"entry", "series", "franchise"}),
    "comic": frozenset({"entry", "series"}),
    "anime-movie": frozenset({"entry"}),
    "manga": frozenset({"entry"}),
    "novel": frozenset({"entry"}),
}

# Upper bound of each band, paired with the bucket key it yields. Read in
# order; a None bound is the open-ended last band. A type absent from this dict
# has no bucket vocabulary at all.
SIZE_THRESHOLDS: dict[str, tuple[tuple[Optional[int], str], ...]] = {
    "anime": ((12, "12ep"), (24, "24ep"), (None, "30ep_plus")),
    "tv-show": ((1, "1season"), (2, "2season"), (None, "3season_plus")),
    "cartoon": ((1, "1season"), (2, "2season"), (None, "3season_plus")),
    "movie": ((1, "standalone"), (3, "2_3movies"), (None, "4movies_plus")),
    "comic": ((3, "1_3"), (10, "4_10"), (None, "11_plus")),
}

# What number the thresholds are read against. "count" is the number of the
# group's entries of that type; the two sums add a per-entry column, so two
# 12-episode anime seasons read as one 24ep commitment.
SIZE_MEASURE: dict[str, str] = {
    "anime": "sum_ep_total",
    "tv-show": "count",
    "cartoon": "count",
    "movie": "count",
    "comic": "sum_issue_total",
}

_LABELS: dict[str, str] = {
    "12ep": "12 EP",
    "24ep": "24 EP",
    "30ep_plus": "30+ EP",
    "1season": "1 Season",
    "2season": "2 Seasons",
    "3season_plus": "3+ Seasons",
    "standalone": "Standalone",
    "2_3movies": "2-3 Movies",
    "4movies_plus": "4+ Movies",
    "1_3": "1-3 Issues",
    "4_10": "4-10 Issues",
    "11_plus": "11+ Issues",
}

SIZE_GROUPS: dict[str, tuple[SizeGroup, ...]] = {
    media_type: tuple(SizeGroup(key, _LABELS[key]) for _, key in bands)
    for media_type, bands in SIZE_THRESHOLDS.items()
}


def scope_allowed(media_type: str, scope: str) -> bool:
    """True when this media type may be planned at this scope."""
    return scope in ALLOWED_SCOPES.get(media_type, frozenset())


def size_group_keys(media_type: str) -> tuple[str, ...]:
    """The bucket keys for a media type, in display order. Empty when unbucketed."""
    return tuple(group.key for group in SIZE_GROUPS.get(media_type, ()))


# Guards the two dicts against drifting from the resolver's key list.
assert set(ALLOWED_SCOPES) == set(MEDIA_TYPE_KEYS)
assert set(SIZE_THRESHOLDS) <= set(MEDIA_TYPE_KEYS)
