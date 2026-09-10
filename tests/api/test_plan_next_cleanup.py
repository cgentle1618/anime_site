"""
Deleting a planned thing removes its plan_next rows - IN THE DATABASE.

This file used to test delete_plans_for, the hand-written sweep that existed
only because the target was FK-less. Step 3 gave plan_next real foreign keys
with ON DELETE CASCADE, so the sweep is gone and what is worth testing is that
PostgreSQL does the work. Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.utils.plan_next_kinds import owner_kwargs


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(admin_user):
    """The account admin_client acts as (conftest's admin_user)."""
    return admin_user


def _plan(db, owner, scope, target_id, media_type="anime", kind="next"):
    db.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            user_id=owner.id,
            media_type=media_type,
            kind=kind,
            **owner_kwargs(scope, target_id),
        )
    )
    db.flush()


def test_deleting_a_franchise_cascades_every_media_type(db, owner, sample_franchise):
    _plan(db, owner, "franchise", sample_franchise.system_id, "anime", "next")
    _plan(db, owner, "franchise", sample_franchise.system_id, "anime", "rewatch")
    _plan(db, owner, "franchise", sample_franchise.system_id, "tv-show", "next")

    db.delete(sample_franchise)
    db.flush()
    db.expire_all()

    assert db.query(models.PlanNext).count() == 0


def test_the_cascade_is_scoped(db, owner, sample_franchise, sample_series):
    _plan(db, owner, "franchise", sample_franchise.system_id)
    _plan(db, owner, "series", sample_series.system_id)

    db.delete(sample_franchise)
    db.flush()
    db.expire_all()

    remaining = db.query(models.PlanNext).one()
    assert remaining.scope == "series"


def test_deleting_a_user_cascades_their_plans(db, owner, sample_franchise):
    _plan(db, owner, "franchise", sample_franchise.system_id)
    db.delete(owner)
    db.flush()
    db.expire_all()
    assert db.query(models.PlanNext).count() == 0


def test_deleting_a_franchise_through_the_api_clears_its_plan(
    admin_client, sample_franchise
):
    admin_client.post(
        "/api/plan-next/",
        json={
            "media_type": "anime",
            "scope": "franchise",
            "target_id": str(sample_franchise.system_id),
            "remark": None,
        },
    )
    res = admin_client.delete(f"/api/franchise/{sample_franchise.system_id}")
    assert res.status_code in (200, 204)
    assert admin_client.get("/api/plan-next/").json() == []


def test_deleting_an_entry_through_the_api_clears_its_plan(admin_client, sample_anime):
    admin_client.put(f"/api/anime/{sample_anime.system_id}", json={"watch_next": True})
    res = admin_client.delete(f"/api/anime/{sample_anime.system_id}")
    assert res.status_code in (200, 204)
    assert admin_client.get("/api/plan-next/").json() == []


def test_delete_plans_for_is_gone():
    import app.services.domain.plan_next as service

    assert not hasattr(service, "delete_plans_for")
