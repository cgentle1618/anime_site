"""
Model-level tests for plan_next and the size-group columns.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.utils.plan_next_kinds import owner_kwargs


def _row(owner, scope, target_id, media_type="anime", kind="next"):
    return models.PlanNext(
        system_id=uuid.uuid4(),
        user_id=owner.id,
        kind=kind,
        media_type=media_type,
        **owner_kwargs(scope, target_id),
    )


def test_a_franchise_can_be_planned(db_session, admin_user, sample_franchise):
    db_session.add(_row(admin_user, "franchise", sample_franchise.system_id))
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 1


def test_the_same_target_cannot_repeat_within_one_media_type(
    db_session, admin_user, sample_franchise
):
    db_session.add(_row(admin_user, "franchise", sample_franchise.system_id))
    db_session.flush()
    db_session.add(_row(admin_user, "franchise", sample_franchise.system_id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_one_franchise_may_be_planned_under_two_media_types(
    db_session, admin_user, sample_franchise
):
    db_session.add(_row(admin_user, "franchise", sample_franchise.system_id, "anime"))
    db_session.add(_row(admin_user, "franchise", sample_franchise.system_id, "tv-show"))
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 2


def test_the_same_uuid_may_not_be_planned_at_two_scopes(
    db_session, admin_user, sample_franchise
):
    # It used to be permitted: the constraint keyed on scope, and the two
    # system_id spaces were separate. A real foreign key ends the question -
    # a franchise's uuid is not in series, so the second row cannot exist.
    db_session.add(_row(admin_user, "franchise", sample_franchise.system_id))
    db_session.add(_row(admin_user, "series", sample_franchise.system_id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_an_entry_plan_may_not_claim_the_wrong_media_type(
    db_session, admin_user, sample_anime
):
    # fk_plan_next_media_type resolves (media_id, media_type) against
    # media(system_id, media_type): an anime's id filed under 'manga' has no
    # parent row.
    db_session.add(_row(admin_user, "entry", sample_anime.system_id, "manga"))
    with pytest.raises(IntegrityError):
        db_session.flush()


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
