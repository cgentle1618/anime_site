"""
mark_* splits into a catalogue half and a list half.

Pure objects: the catalogue halves take an entry, the list halves take a row
and an entry. No session, no database.
"""

import pytest

from app.models import Anime, Comic, Manga, Movies, UserMediaList
from app.services.domain.completion import (
    mark_comic_catalog,
    mark_comic_list,
    mark_movie_catalog,
    mark_movie_list,
    mark_reading_catalog,
    mark_reading_list,
    mark_tv_catalog,
    mark_tv_list,
)


@pytest.fixture
def row():
    return UserMediaList(status="Might Watch")


def test_mark_tv_catalog_touches_only_catalogue_columns():
    entry = Anime(ep_total=12, airing_status="Currently Airing")
    mark_tv_catalog(entry)
    assert entry.airing_status == "Finished Airing"
    assert entry.ep_total == 12


def test_mark_tv_list_sets_status_and_progress(row):
    entry = Anime(ep_total=12)
    mark_tv_list(row, entry)
    assert row.status == "Completed"
    assert row.ep_fin == 12


def test_mark_tv_list_leaves_ep_fin_alone_when_the_total_is_unknown(row):
    entry = Anime(ep_total=None)
    row.ep_fin = 4
    mark_tv_list(row, entry)
    assert row.status == "Completed"
    assert row.ep_fin == 4


def test_mark_movie_halves():
    entry = Movies(airing_status="Not Yet Aired")
    mark_movie_catalog(entry)
    assert entry.airing_status == "Finished Airing"

    r = UserMediaList(status="Might Watch")
    mark_movie_list(r, entry)
    assert r.status == "Completed"


def test_mark_reading_catalog_closes_the_serialization_but_no_progress():
    entry = Manga(serialization_status="連載中", ch_total=100, vol_total=10)
    mark_reading_catalog(entry)
    assert entry.serialization_status == "完結"
    assert entry.ch_total == 100
    assert entry.vol_total == 10


def test_mark_reading_catalog_keeps_a_cancelled_serialization():
    entry = Manga(serialization_status="腰斬")
    mark_reading_catalog(entry)
    assert entry.serialization_status == "腰斬"


def test_mark_reading_list_fills_progress_from_the_totals():
    entry = Manga(ch_total=100, vol_total=10)
    r = UserMediaList(status="Might Read")
    mark_reading_list(r, entry)
    assert r.status == "Completed"
    assert r.ch_fin == 100
    assert r.vol_fin == 10
    assert r.vol_fin_page == 0


def test_mark_comic_halves():
    entry = Comic(serialization_status="連載中", issue_total=6)
    mark_comic_catalog(entry)
    assert entry.serialization_status == "完結"
    assert entry.issue_total == 6

    r = UserMediaList(status="Might Read")
    mark_comic_list(r, entry)
    assert r.status == "Completed"
    assert r.issue_fin == 6


def test_no_catalog_half_writes_a_status_or_a_fin_column():
    """The seam, asserted directly: a catalogue half must not touch personal
    fields even when the entry model still declares them."""
    entry = Manga(serialization_status="連載中", ch_total=100, vol_total=10)
    mark_reading_catalog(entry)
    assert getattr(entry, "reading_status", None) in (None, "Might Read")


def test_vol_math_no_longer_touches_progress():
    """vol_fin is one reader's position and lives on their list row; a
    pipeline clamping it would be editing somebody's list."""
    from app.models import Manga
    from app.services.domain.checking import apply_validate_vol_math

    entry = Manga(vol_total=-3)
    apply_validate_vol_math(entry)
    assert entry.vol_total in (0, None)
    assert not hasattr(entry, "vol_fin")


def test_ch_math_no_longer_touches_progress():
    from app.models import Manga
    from app.services.domain.checking import apply_validate_ch_math

    entry = Manga(ch_total=-9)
    apply_validate_ch_math(entry)
    assert entry.ch_total in (0, None)
    assert not hasattr(entry, "ch_fin")
