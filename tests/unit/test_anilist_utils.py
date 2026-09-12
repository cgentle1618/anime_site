"""
Unit tests for utils/anilist_utils.py

The AniList `rankings` array is the whole reason this module exists: it mixes
RATED and POPULAR at three scopes (all-time, year, season) and only the two
all-time rows are stored. Shapes verified against graphql.anilist.co on
2026-09-12.
"""

from app.utils.anilist_utils import POPULAR, RATED, _all_time_rank, map_anilist_record


def make_record():
    """Fullmetal Alchemist: Brotherhood, trimmed to the fields we select."""
    return {
        "idMal": 5114,
        "siteUrl": "https://anilist.co/anime/5114",
        "averageScore": 90,
        "rankings": [
            {"rank": 5, "type": "RATED", "allTime": True},
            {"rank": 11, "type": "POPULAR", "allTime": True},
            {"rank": 1, "type": "RATED", "allTime": False},
            {"rank": 1, "type": "POPULAR", "allTime": False},
        ],
    }


def test_both_all_time_ranks_are_selected():
    assert map_anilist_record(make_record()) == {
        "anilist_rating": 90,
        "anilist_rank": 5,
        "anilist_popularity_rank": 11,
        "anilist_link": "https://anilist.co/anime/5114",
    }


def test_year_and_season_ranks_are_ignored():
    """A title ranked #1 for its season is not ranked #1 of all time."""
    record = make_record()
    record["rankings"] = [
        {"rank": 1, "type": "RATED", "allTime": False},
        {"rank": 2, "type": "POPULAR", "allTime": False},
    ]
    mapped = map_anilist_record(record)
    assert mapped["anilist_rank"] is None
    assert mapped["anilist_popularity_rank"] is None
    assert mapped["anilist_rating"] == 90


def test_a_stub_record_maps_to_all_none():
    """
    An idMal can resolve to a near-empty AniList entry - one light novel
    returned averageScore None with no rankings at all. Every value must come
    back None so the write guard leaves the entry alone.
    """
    mapped = map_anilist_record(
        {"idMal": 21311, "siteUrl": "https://anilist.co/manga/51311",
         "averageScore": None, "rankings": []}
    )
    assert mapped == {
        "anilist_rating": None,
        "anilist_rank": None,
        "anilist_popularity_rank": None,
        "anilist_link": "https://anilist.co/manga/51311",
    }


def test_no_record_at_all_maps_to_all_none():
    assert map_anilist_record(None) == {
        "anilist_rating": None,
        "anilist_rank": None,
        "anilist_popularity_rank": None,
        "anilist_link": None,
    }


def test_missing_rankings_key_does_not_raise():
    mapped = map_anilist_record({"idMal": 1, "averageScore": 70})
    assert mapped["anilist_rank"] is None
    assert mapped["anilist_link"] is None


def test_all_time_rank_picks_by_kind():
    rankings = [
        {"rank": 5, "type": "RATED", "allTime": True},
        {"rank": 11, "type": "POPULAR", "allTime": True},
    ]
    assert _all_time_rank(rankings, RATED) == 5
    assert _all_time_rank(rankings, POPULAR) == 11
