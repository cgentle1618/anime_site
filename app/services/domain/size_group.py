"""
Size-bucket arithmetic and resolution.

A bucket is a standing property of a grouping tier - a series *is* "2 Seasons"
whether or not it is currently planned - so it lives on franchise and series
rather than on the plan_next row. It must also vary per media type, because one
franchise can hold both anime and TV show entries, so it is stored as two JSONB
maps keyed by media type:

    size_group_derived  written by Calculate, rewritten freely
    size_group_manual   written by the admin, never touched by Calculate

The effective value is the manual key if present, else the derived one. Two
maps rather than one map plus an "is overridden" flag: Calculate can never
stomp an edit, and clearing an override is just removing a key.

Every function here is pure. Callers pass the numbers and maps in, so the
boundaries can be tested exhaustively without a database.
"""

from typing import Optional

from app.utils.plan_next_kinds import SIZE_THRESHOLDS

# (derived, manual) for one grouping tier, or None when the entry has no such
# group. Spelled out because it appears in three signatures.
GroupMaps = Optional[tuple[Optional[dict], Optional[dict]]]


def bucket_for(media_type: str, measure: Optional[int]) -> Optional[str]:
    """
    The bucket key for a measured size, or None.

    `measure` is whatever SIZE_MEASURE names for the type: summed ep_total,
    entry count, or summed issue_total. A missing or zero measure has no
    bucket - nothing was measured, which is not the same as being small.
    """
    bands = SIZE_THRESHOLDS.get(media_type)
    if not bands or not measure or measure <= 0:
        return None
    for upper, key in bands:
        if upper is None or measure <= upper:
            return key
    return None


def effective_bucket(
    derived: Optional[dict],
    manual: Optional[dict],
    media_type: str,
) -> Optional[str]:
    """A group's bucket for one media type: manual key wins, else derived."""
    if manual and media_type in manual and manual[media_type]:
        return manual[media_type]
    if derived and media_type in derived and derived[media_type]:
        return derived[media_type]
    return None


def entry_bucket(
    media_type: str,
    issue_total: Optional[int],
    series_maps: GroupMaps,
    franchise_maps: GroupMaps,
) -> Optional[str]:
    """
    An entry's bucket. Never stored - resolved at display time.

    Comic is the one exception to inheritance: an individual comic run has a
    meaningful issue count of its own, so it buckets on `issue_total` and
    ignores whatever its series says. Every other type reads its series'
    effective bucket, falling back to its franchise's.
    """
    if media_type == "comic":
        return bucket_for("comic", issue_total)
    for maps in (series_maps, franchise_maps):
        if maps is None:
            continue
        found = effective_bucket(maps[0], maps[1], media_type)
        if found:
            return found
    return None
