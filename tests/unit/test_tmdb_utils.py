"""TMDB dates keep their day precision instead of being flattened to a month."""

import pytest

from app.utils.tmdb_utils import _convert_tmdb_date


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2008-07-18", "2008-07-18"),
        ("2008-07", "2008-07"),
        ("2008", "2008"),
        ("", None),
        (None, None),
        ("not-a-date", None),
    ],
)
def test_tmdb_dates_are_stored_at_full_precision(raw, expected):
    assert _convert_tmdb_date(raw) == expected
