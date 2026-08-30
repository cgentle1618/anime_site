"""Unit tests for size-bucket arithmetic and inheritance."""

import pytest

from app.services.domain.size_group import (
    bucket_for,
    effective_bucket,
    entry_bucket,
)

# --- bucket_for: boundaries ------------------------------------------------


@pytest.mark.parametrize(
    "measure,expected",
    [(1, "12ep"), (12, "12ep"), (13, "24ep"), (24, "24ep"), (25, "30ep_plus")],
)
def test_anime_bucket_boundaries(measure, expected):
    assert bucket_for("anime", measure) == expected


@pytest.mark.parametrize(
    "measure,expected",
    [(1, "1season"), (2, "2season"), (3, "3season_plus"), (9, "3season_plus")],
)
def test_tv_show_bucket_boundaries(measure, expected):
    assert bucket_for("tv-show", measure) == expected


def test_cartoon_uses_the_same_bands_as_tv_show():
    assert bucket_for("cartoon", 2) == "2season"


@pytest.mark.parametrize(
    "measure,expected",
    [
        (1, "standalone"),
        (2, "2_3movies"),
        (3, "2_3movies"),
        (4, "4movies_plus"),
    ],
)
def test_movie_bucket_boundaries(measure, expected):
    assert bucket_for("movie", measure) == expected


@pytest.mark.parametrize(
    "measure,expected",
    [(1, "1_3"), (3, "1_3"), (4, "4_10"), (10, "4_10"), (11, "11_plus")],
)
def test_comic_bucket_boundaries(measure, expected):
    assert bucket_for("comic", measure) == expected


def test_unbucketed_types_have_no_bucket():
    assert bucket_for("manga", 5) is None
    assert bucket_for("novel", 5) is None
    assert bucket_for("anime-movie", 5) is None


def test_zero_and_none_measures_have_no_bucket():
    assert bucket_for("anime", 0) is None
    assert bucket_for("anime", None) is None
    assert bucket_for("comic", 0) is None


# --- effective_bucket: manual wins per key ---------------------------------


def test_manual_overrides_derived_for_that_key():
    derived = {"anime": "24ep", "tv-show": "2season"}
    manual = {"anime": "12ep"}
    assert effective_bucket(derived, manual, "anime") == "12ep"
    # The un-overridden key still reads from derived.
    assert effective_bucket(derived, manual, "tv-show") == "2season"


def test_derived_is_used_when_no_manual_key_exists():
    assert effective_bucket({"anime": "24ep"}, {}, "anime") == "24ep"
    assert effective_bucket({"anime": "24ep"}, None, "anime") == "24ep"


def test_missing_key_everywhere_yields_none():
    assert effective_bucket({"anime": "24ep"}, {}, "movie") is None
    assert effective_bucket(None, None, "anime") is None


# --- entry_bucket: comic self-buckets, everything else inherits ------------


def test_comic_entry_buckets_on_its_own_issue_total():
    series = ({"comic": "11_plus"}, None)
    assert entry_bucket("comic", 5, series, None) == "4_10"


def test_comic_entry_with_no_issue_total_has_no_bucket():
    series = ({"comic": "11_plus"}, None)
    assert entry_bucket("comic", None, series, None) is None


def test_entry_inherits_from_its_series():
    series = ({"anime": "24ep"}, None)
    franchise = ({"anime": "12ep"}, None)
    assert entry_bucket("anime", None, series, franchise) == "24ep"


def test_entry_falls_back_to_its_franchise():
    franchise = ({"anime": "12ep"}, None)
    assert entry_bucket("anime", None, None, franchise) == "12ep"


def test_entry_falls_back_when_the_series_lacks_that_media_type_key():
    series = ({"tv-show": "2season"}, None)
    franchise = ({"anime": "30ep_plus"}, None)
    assert entry_bucket("anime", None, series, franchise) == "30ep_plus"


def test_entry_series_manual_override_wins_over_franchise():
    series = ({"anime": "24ep"}, {"anime": "12ep"})
    franchise = ({"anime": "30ep_plus"}, None)
    assert entry_bucket("anime", None, series, franchise) == "12ep"


def test_entry_with_no_group_has_no_bucket():
    assert entry_bucket("anime", None, None, None) is None
