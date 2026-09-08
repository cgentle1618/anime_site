"""
Model-level tests for plan_next and the size-group columns.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def _row(scope, target_id, media_type="anime", kind="next"):
    return models.PlanNext(
        system_id=uuid.uuid4(),
        kind=kind,
        media_type=media_type,
        scope=scope,
        target_id=target_id,
    )


def test_a_franchise_can_be_planned(db_session, sample_franchise):
    db_session.add(_row("franchise", sample_franchise.system_id))
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 1


def test_the_same_target_cannot_repeat_within_one_media_type(
    db_session, sample_franchise
):
    db_session.add(_row("franchise", sample_franchise.system_id))
    db_session.flush()
    db_session.add(_row("franchise", sample_franchise.system_id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_one_franchise_may_be_planned_under_two_media_types(
    db_session, sample_franchise
):
    db_session.add(_row("franchise", sample_franchise.system_id, "anime"))
    db_session.add(_row("franchise", sample_franchise.system_id, "tv-show"))
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 2


def test_the_same_uuid_may_be_planned_at_two_scopes(db_session, sample_franchise):
    # Contrived, but the constraint keys on scope, so it must be permitted.
    db_session.add(_row("franchise", sample_franchise.system_id))
    db_session.add(_row("series", sample_franchise.system_id))
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 2


def test_franchise_carries_both_size_group_maps(db_session, sample_franchise):
    sample_franchise.size_group_derived = {"anime": "24ep"}
    sample_franchise.size_group_manual = {"anime": "12ep"}
    db_session.flush()
    db_session.expire(sample_franchise)
    assert sample_franchise.size_group_derived == {"anime": "24ep"}
    assert sample_franchise.size_group_manual == {"anime": "12ep"}


def test_series_carries_both_size_group_maps(db_session, sample_series):
    sample_series.size_group_derived = {"tv-show": "2season"}
    db_session.flush()
    db_session.expire(sample_series)
    assert sample_series.size_group_derived == {"tv-show": "2season"}
    assert sample_series.size_group_manual is None


def test_the_old_columns_are_gone():
    assert not hasattr(models.Franchise, "watch_next_group")
    assert not hasattr(models.Movies, "watch_next")
    assert not hasattr(models.TVShows, "watch_next")
    assert not hasattr(models.Cartoon, "watch_next")
    assert not hasattr(models.AnimeMovies, "watch_next")
    assert not hasattr(models.Manga, "read_next")
    assert not hasattr(models.Novel, "read_next")
    assert not hasattr(models.Comic, "read_next")
