"""
anilist_utils.py
Transforms a raw AniList GraphQL `Media` record into the columns our models
carry. Pure: no network, no session, no model imports.
"""

from typing import Any, Dict, List, Optional

# media_rankings.type. AniList publishes both at three scopes; only the
# all-time rows are stored - see _all_time_rank.
RATED = "RATED"
POPULAR = "POPULAR"


def _all_time_rank(
    rankings: Optional[List[Dict[str, Any]]], kind: str
) -> Optional[int]:
    """
    The all-time rank of one kind, or None.

    `rankings` mixes RATED and POPULAR across all-time, year and season
    scopes - six rows for a well-ranked title. Only `allTime` is comparable
    across the collection: a show ranked #1 for its season says nothing about
    where it sits overall.
    """
    for ranking in rankings or []:
        if ranking.get("allTime") and ranking.get("type") == kind:
            return ranking.get("rank")
    return None


def map_anilist_record(record: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    One AniList `Media` record to our four values.

    Every value is independently Optional. A record that resolves but carries
    nothing - a stub entry with a null averageScore and an empty rankings
    array - is a real and common response, not an error, so this returns the
    same all-None shape as a total miss and lets the caller's guard decide.
    """
    if not record:
        return {
            "anilist_rating": None,
            "anilist_rank": None,
            "anilist_popularity_rank": None,
            "anilist_link": None,
        }

    rankings = record.get("rankings")
    return {
        "anilist_rating": record.get("averageScore"),
        "anilist_rank": _all_time_rank(rankings, RATED),
        "anilist_popularity_rank": _all_time_rank(rankings, POPULAR),
        "anilist_link": record.get("siteUrl"),
    }
