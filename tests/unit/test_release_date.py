"""Unit tests for app/utils/release_date.py — the single owner of the
truncated ISO-8601 release date format."""

import pytest

from app.utils.release_date import (
    DATE_COLUMNS,
    RELEASE_PRIORITY,
    UNDATED,
    display,
    is_valid,
    normalize,
    sort_key,
)


@pytest.mark.parametrize("value", ["2024", "2024-05", "2024-05-17", "0001", "9999-12-31"])
def test_is_valid_accepts_the_three_legal_shapes(value):
    assert is_valid(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "24",            # too short
        "2024-5",        # month not zero-padded
        "2024-05-1",     # day not zero-padded
        "2024-05-17-01", # too many components
        "JUL 2001",      # the old format is not a legal stored value
        "2024/05/17",    # wrong separator
        "",
        None,
    ],
)
def test_is_valid_rejects_everything_else(value):
    assert is_valid(value) is False


@pytest.mark.parametrize("value", ["2024-00", "2024-13", "2024-02-30", "2023-02-29", "2024-04-31"])
def test_is_valid_rejects_calendar_impossible_values(value):
    assert is_valid(value) is False


def test_is_valid_accepts_a_real_leap_day():
    assert is_valid("2024-02-29") is True


@pytest.mark.parametrize(
    "source,expected",
    [
        ("JUL 2001", "2001-07"),
        ("jul 2001", "2001-07"),
        ("  NOV 2025  ", "2025-11"),
        ("2001", "2001"),
        (2020, "2020"),
        (2020.0, "2020"),
        ("2020.0", "2020"),
        ("2001-07-20", "2001-07-20"),
        ("2001-07", "2001-07"),
        (None, None),
        ("", None),
        ("   ", None),
        ("not a date", None),
        ("MARCH 2001", None),  # only the three-letter abbreviations are recognized
    ],
)
def test_normalize_converts_every_historical_source_format(source, expected):
    assert normalize(source) == expected


def test_normalize_is_idempotent():
    assert normalize(normalize("JUL 2001")) == "2001-07"


@pytest.mark.parametrize(
    "value,expected",
    [
        ("2024", (2024, 1, 1)),
        ("2024-05", (2024, 5, 1)),
        ("2024-05-17", (2024, 5, 17)),
        (None, None),
        ("garbage", None),
    ],
)
def test_sort_key_fills_missing_precision_with_the_first_of_the_period(value, expected):
    assert sort_key(value) == expected


def test_a_year_only_value_sorts_with_not_before_the_first_of_that_year():
    assert sort_key("2024") == sort_key("2024-01-01")


def test_lexicographic_order_matches_chronological_order():
    values = ["2024-05-17", "2023", "2024-05", "2024", "2023-12-31"]
    assert sorted(values) == ["2023", "2023-12-31", "2024", "2024-05", "2024-05-17"]


def test_undated_sorts_after_every_real_date():
    assert UNDATED > sort_key("9999-12-31")


@pytest.mark.parametrize("value", ["2024", "2024-05", "2024-05-17"])
def test_display_returns_the_stored_string_verbatim(value):
    assert display(value) == value


def test_display_returns_none_for_empty_values():
    assert display(None) is None
    assert display("") is None


def test_movie_priority_puts_taiwan_first():
    assert RELEASE_PRIORITY["movie"] == ("release_date_tw", "release_date_usa")


def test_anime_movie_priority_puts_japan_first():
    assert RELEASE_PRIORITY["anime-movie"] == ("release_date_jp", "release_date_tw")


def test_date_columns_cover_every_media_table():
    assert set(DATE_COLUMNS) == {
        "anime",
        "anime_movies",
        "movies",
        "tv_shows",
        "cartoons",
        "manga",
        "novel",
        "comic",
    }


def test_date_columns_include_the_run_end_columns():
    assert DATE_COLUMNS["manga"] == ("release_date", "end_date")
    assert DATE_COLUMNS["novel"] == ("release_date", "end_date")
    assert DATE_COLUMNS["comic"] == ("release_date", "end_date")
