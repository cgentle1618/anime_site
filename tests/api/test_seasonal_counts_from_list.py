"""
Seasonal counters read the admin's user_media_list rows, not anime columns.

Written before the column is dropped, so it starts red against the current
implementation, which counts from anime.watching_status.
"""

import uuid

import pytest

from app import models
from app.services.domain.seasonal import sync_seasonal_counts
from app.services.domain.user_list import acting_user_id


@pytest.fixture
def db(db_session):
    return db_session


def _anime(db, franchise, name, season, year):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
        airing_type="TV",
        release_season=season,
        release_date=f"{year}-10-01",
    )
    db.add(entry)
    db.flush()
    return entry


def _list_row(db, media_id, status):
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=acting_user_id(db, None),
            media_id=media_id,
            status=status,
        )
    )
    db.flush()


@pytest.fixture
def one_season(db, admin_client, sample_franchise):
    """FAL 2023 with one entry in each of the four counted buckets, plus one
    the counters must ignore because no list row exists for it."""
    season = models.Seasonal(seasonal="FAL 2023")
    db.add(season)
    db.flush()

    for name, status in [
        ("Seasonal Completed", "Completed"),
        ("Seasonal Planned", "Plan to Watch"),
        ("Seasonal Watching", "Active Watching"),
        ("Seasonal Dropped", "Dropped"),
    ]:
        entry = _anime(db, sample_franchise, name, "FAL", 2023)
        _list_row(db, entry.system_id, status)

    _anime(db, sample_franchise, "Seasonal Untouched", "FAL", 2023)
    return season


def test_counts_come_from_the_admins_list_rows(db, one_season):
    sync_seasonal_counts(db)
    db.refresh(one_season)
    assert one_season.entry_completed == 1
    assert one_season.entry_planned == 1
    assert one_season.entry_watching == 1
    assert one_season.entry_dropped == 1


def test_an_entry_with_no_list_row_counts_in_no_bucket(db, one_season):
    """ "Might Watch" is in none of the four sets, and neither is a missing
    row, so the untouched entry must move no counter."""
    sync_seasonal_counts(db)
    db.refresh(one_season)
    total = (
        one_season.entry_completed
        + one_season.entry_planned
        + one_season.entry_watching
        + one_season.entry_dropped
    )
    assert total == 4


def test_another_users_row_does_not_leak_into_the_admins_counts(
    db, one_season, sample_franchise
):
    """Pins the scoping before step 2 makes it reachable: a second user's
    Completed row must not raise the admin's completed count."""
    from app.services.security import get_password_hash
    from tests.api.conftest import role_id_for

    other = models.User(
        id=uuid.uuid4(),
        username="seasonal_other",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "guest"),
    )
    db.add(other)
    db.flush()
    entry = _anime(db, sample_franchise, "Seasonal Other User", "FAL", 2023)
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=other.id,
            media_id=entry.system_id,
            status="Completed",
        )
    )
    db.flush()

    sync_seasonal_counts(db)
    db.refresh(one_season)
    assert one_season.entry_completed == 1


def test_sync_is_idempotent(db, one_season):
    sync_seasonal_counts(db)
    sync_seasonal_counts(db)
    db.refresh(one_season)
    assert one_season.entry_completed == 1
    assert one_season.entry_watching == 1
