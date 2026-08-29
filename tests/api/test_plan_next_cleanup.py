"""
Deleting a planned thing removes its plan_next rows.

The target is FK-less, so nothing cascades on its own. Requires PostgreSQL
(anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models
from app.services.domain.plan_next import delete_plans_for


def _plan(db, scope, target_id, media_type="anime", kind="next"):
    db.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            media_type=media_type,
            scope=scope,
            target_id=target_id,
            kind=kind,
        )
    )
    db.flush()


def test_deleting_a_franchise_clears_every_media_type(db_session, sample_franchise):
    # delete_plans_for is scoped by (scope, target_id) only - it deliberately
    # takes no kind parameter, so it must clear rows of every kind too.
    _plan(db_session, "franchise", sample_franchise.system_id, "anime", kind="next")
    _plan(db_session, "franchise", sample_franchise.system_id, "anime", kind="rewatch")
    _plan(db_session, "franchise", sample_franchise.system_id, "tv-show", kind="next")

    assert delete_plans_for(db_session, "franchise", sample_franchise.system_id) == 3
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 0


def test_cleanup_is_scoped(db_session, sample_franchise, sample_series):
    _plan(db_session, "franchise", sample_franchise.system_id)
    _plan(db_session, "series", sample_series.system_id)

    delete_plans_for(db_session, "franchise", sample_franchise.system_id)
    db_session.flush()

    remaining = db_session.query(models.PlanNext).one()
    assert remaining.scope == "series"


def test_cleanup_on_an_unplanned_target_is_a_no_op(db_session, sample_series):
    assert delete_plans_for(db_session, "series", sample_series.system_id) == 0


def test_deleting_a_franchise_through_the_api_clears_its_plan(
    admin_client, db_session, sample_franchise
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


def test_deleting_an_entry_through_the_api_clears_its_plan(
    admin_client, sample_anime
):
    admin_client.put(f"/api/anime/{sample_anime.system_id}", json={"watch_next": True})
    res = admin_client.delete(f"/api/anime/{sample_anime.system_id}")
    assert res.status_code in (200, 204)
    assert admin_client.get("/api/plan-next/").json() == []
