"""
Calculate-time derivation of size_group_derived.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models
from app.services.domain.plan_next import derive_size_groups


def _anime(db, franchise, series, ep_total):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_id=series.system_id if series else None,
        anime_name_en=f"Anime {ep_total}",
        ep_total=ep_total,
    )
    db.add(a)
    return a


def _movie(db, franchise, series, name):
    m = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_id=series.system_id if series else None,
        movie_name_en=name,
    )
    db.add(m)
    return m


def test_anime_series_sums_ep_total(db_session, sample_franchise, sample_series):
    _anime(db_session, sample_franchise, sample_series, 12)
    _anime(db_session, sample_franchise, sample_series, 12)
    db_session.flush()

    derive_size_groups(db_session)
    db_session.flush()

    assert sample_series.size_group_derived == {"anime": "24ep"}
    assert sample_franchise.size_group_derived == {"anime": "24ep"}


def test_a_single_long_anime_lands_in_the_open_band(
    db_session, sample_franchise, sample_series
):
    _anime(db_session, sample_franchise, sample_series, 51)
    db_session.flush()

    derive_size_groups(db_session)
    db_session.flush()

    assert sample_series.size_group_derived == {"anime": "30ep_plus"}


def test_movies_bucket_on_entry_count(db_session, sample_franchise, sample_series):
    for name in ("One", "Two"):
        _movie(db_session, sample_franchise, sample_series, name)
    db_session.flush()

    derive_size_groups(db_session)
    db_session.flush()

    assert sample_series.size_group_derived == {"movie": "2_3movies"}


def test_a_mixed_franchise_gets_one_key_per_media_type(
    db_session, sample_franchise, sample_series
):
    _anime(db_session, sample_franchise, sample_series, 12)
    _movie(db_session, sample_franchise, sample_series, "Side Story")
    db_session.flush()

    derive_size_groups(db_session)
    db_session.flush()

    assert sample_franchise.size_group_derived == {
        "anime": "12ep",
        "movie": "standalone",
    }


def test_comic_is_derived_for_series_but_not_franchise(
    db_session, sample_franchise, sample_series
):
    db_session.add(
        models.Comic(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            series_id=sample_series.system_id,
            comic_name_en="A Run",
            issue_total=12,
        )
    )
    db_session.flush()

    derive_size_groups(db_session)
    db_session.flush()

    assert sample_series.size_group_derived == {"comic": "11_plus"}
    # Comic has no franchise scope and comic entries self-bucket, so a
    # franchise-level comic key would never be read.
    assert (sample_franchise.size_group_derived or {}).get("comic") is None


def test_derivation_never_touches_the_manual_map(
    db_session, sample_franchise, sample_series
):
    sample_series.size_group_manual = {"anime": "12ep"}
    _anime(db_session, sample_franchise, sample_series, 51)
    db_session.flush()

    derive_size_groups(db_session)
    db_session.flush()

    assert sample_series.size_group_manual == {"anime": "12ep"}
    assert sample_series.size_group_derived == {"anime": "30ep_plus"}


def test_an_empty_group_gets_an_empty_map(db_session, sample_series):
    derive_size_groups(db_session)
    db_session.flush()
    assert sample_series.size_group_derived == {}


def test_unbucketed_types_produce_no_keys(db_session, sample_franchise, sample_series):
    db_session.add(
        models.Manga(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            series_id=sample_series.system_id,
            manga_name_en="Some Manga",
        )
    )
    db_session.flush()

    derive_size_groups(db_session)
    db_session.flush()

    assert sample_series.size_group_derived == {}
