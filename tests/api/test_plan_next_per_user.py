"""
plan_next is per user and points at its target with a real foreign key.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.domain.plan_next import entry_flag, planned_entry_ids, set_entry_flag
from app.services.security import get_password_hash
from app.utils.plan_next_kinds import OWNER_COLUMN, owner_kwargs, scope_for_columns
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(admin_user, admin_client):
    """The account admin_client acts as (conftest's admin_user)."""
    return admin_user


@pytest.fixture
def other_user(db_session):
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "admin"),
    )
    db_session.add(u)
    db_session.flush()
    return u


def test_owner_column_maps_every_scope():
    assert OWNER_COLUMN == {
        "entry": "media_id",
        "series": "series_id",
        "franchise": "franchise_id",
    }


def test_owner_kwargs_names_one_column():
    target = uuid.uuid4()
    assert owner_kwargs("franchise", target) == {"franchise_id": target}


def test_owner_kwargs_rejects_an_unknown_scope():
    with pytest.raises(ValueError, match="Unknown plan scope"):
        owner_kwargs("collection", uuid.uuid4())


def test_scope_for_columns_reads_the_non_null_one():
    target = uuid.uuid4()
    assert scope_for_columns(target, None, None) == "entry"
    assert scope_for_columns(None, target, None) == "franchise"
    assert scope_for_columns(None, None, target) == "series"


def test_the_derived_scope_and_target_read_back(db, owner, sample_franchise):
    row = models.PlanNext(
        system_id=uuid.uuid4(),
        user_id=owner.id,
        kind="next",
        media_type="anime",
        franchise_id=sample_franchise.system_id,
    )
    db.add(row)
    db.flush()
    assert row.scope == "franchise"
    assert row.target_id == sample_franchise.system_id


def test_two_users_may_queue_the_same_franchise(
    db, owner, other_user, sample_franchise
):
    for user in (owner, other_user):
        db.add(
            models.PlanNext(
                system_id=uuid.uuid4(),
                user_id=user.id,
                kind="next",
                media_type="anime",
                franchise_id=sample_franchise.system_id,
            )
        )
    db.flush()
    assert db.query(models.PlanNext).count() == 2


def test_one_user_may_not_queue_it_twice(db, owner, sample_franchise):
    for _ in range(2):
        db.add(
            models.PlanNext(
                system_id=uuid.uuid4(),
                user_id=owner.id,
                kind="next",
                media_type="anime",
                franchise_id=sample_franchise.system_id,
            )
        )
    with pytest.raises(IntegrityError):
        db.flush()


def test_entry_flags_are_per_user(db, owner, other_user, sample_anime):
    set_entry_flag(db, "anime", sample_anime.system_id, True, user_id=owner.id)
    db.flush()
    assert entry_flag(db, "anime", sample_anime.system_id, user_id=owner.id) is True
    assert (
        entry_flag(db, "anime", sample_anime.system_id, user_id=other_user.id) is False
    )
    assert planned_entry_ids(db, "anime", user_id=owner.id) == {sample_anime.system_id}
    assert planned_entry_ids(db, "anime", user_id=other_user.id) == set()


def test_the_list_endpoint_returns_the_viewers_rows(
    admin_client, db, owner, other_user, sample_franchise
):
    db.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            user_id=other_user.id,
            kind="next",
            media_type="anime",
            franchise_id=sample_franchise.system_id,
        )
    )
    db.flush()
    # The admin queued nothing; kana's row is not theirs to see.
    assert admin_client.get("/api/plan-next/").json() == []


def test_an_anonymous_visitor_is_refused(client, db, other_user, sample_franchise):
    db.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            user_id=other_user.id,
            kind="next",
            media_type="anime",
            franchise_id=sample_franchise.system_id,
        )
    )
    db.flush()
    # A visible refusal, not an empty page: a plan queue belongs to one account.
    assert client.get("/api/plan-next/").status_code == 401
    assert client.get("/api/plan-next/kinds").status_code == 401


def test_the_create_endpoint_stamps_the_caller(
    admin_client, db, owner, sample_franchise
):
    response = admin_client.post(
        "/api/plan-next/",
        json={
            "media_type": "anime",
            "scope": "franchise",
            "target_id": str(sample_franchise.system_id),
            "remark": None,
        },
    )
    assert response.status_code == 201
    assert response.json()["scope"] == "franchise"
    assert response.json()["target_id"] == str(sample_franchise.system_id)
    row = db.query(models.PlanNext).one()
    assert row.user_id == owner.id
    assert row.franchise_id == sample_franchise.system_id
    assert row.media_id is None and row.series_id is None
