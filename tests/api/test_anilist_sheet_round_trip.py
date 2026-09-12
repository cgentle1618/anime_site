"""
The AniList columns survive the sheet round-trip.

Database contents move between this project's two development machines through
Google Sheets - Backup writes DB -> sheet, Pull All writes sheet -> DB. The
parse_*_from_sheet dicts are hand-typed, so a misspelled key would not fail any
test; it would silently drop the column on the next Pull All. These assert the
three AniList columns survive, for every media type that has them.
"""

import pytest

from app.utils.formatter import (
    parse_anime_from_sheet,
    parse_anime_movie_from_sheet,
    parse_manga_from_sheet,
    parse_novel_from_sheet,
)

ANILIST_CELLS = {
    "anilist_rating": "86",
    "anilist_rank": "55",
    "anilist_popularity_rank": "54",
}

PARSERS = [
    pytest.param(parse_anime_from_sheet, id="anime"),
    pytest.param(parse_anime_movie_from_sheet, id="anime-movie"),
    pytest.param(parse_manga_from_sheet, id="manga"),
    pytest.param(parse_novel_from_sheet, id="novel"),
]


@pytest.mark.parametrize("parser", PARSERS)
def test_the_three_anilist_columns_survive_a_pull(parser):
    parsed = parser(dict(ANILIST_CELLS))

    assert parsed["anilist_rating"] == 86
    assert parsed["anilist_rank"] == 55
    assert parsed["anilist_popularity_rank"] == 54


@pytest.mark.parametrize("parser", PARSERS)
def test_empty_anilist_cells_parse_to_none_not_zero(parser):
    """
    A blank cell is 'unknown', never rank #0. Values arrive from the sheet as
    strings, so this is the case a naive int() would get wrong.
    """
    parsed = parser({"anilist_rating": "", "anilist_rank": "", "anilist_popularity_rank": ""})

    assert parsed["anilist_rating"] is None
    assert parsed["anilist_rank"] is None
    assert parsed["anilist_popularity_rank"] is None
