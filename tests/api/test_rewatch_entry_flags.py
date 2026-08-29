"""
Entry-level to_rewatch / to_reread are virtual fields over plan_next rows
with kind='rewatch'.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def seeded_movie(db_session, sample_franchise):
    m = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Test Movie",
        watching_status="Might Watch",
    )
    db_session.add(m)
    db_session.flush()
    return m.system_id


@pytest.fixture
def seeded_comic(sample_comic):
    return sample_comic.system_id


@pytest.fixture
def seeded_cartoon(db_session, sample_franchise):
    c = models.Cartoon(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        cartoon_name_en="Test Cartoon",
        watching_status="Might Watch",
    )
    db_session.add(c)
    db_session.flush()
    return c.system_id


def test_setting_to_rewatch_creates_one_rewatch_row(admin_client, db, seeded_movie):
    res = admin_client.patch(
        f"/api/movies/{seeded_movie}", json={"to_rewatch": True}
    )
    assert res.status_code == 200
    assert res.json()["to_rewatch"] is True

    rows = db.query(models.PlanNext).filter_by(target_id=seeded_movie).all()
    assert len(rows) == 1
    assert (rows[0].kind, rows[0].scope, rows[0].media_type) == (
        "rewatch",
        "entry",
        "movie",
    )


def test_clearing_to_rewatch_deletes_the_row(admin_client, db, seeded_movie):
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": True})
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": False})

    assert db.query(models.PlanNext).filter_by(target_id=seeded_movie).count() == 0


def test_watch_next_and_to_rewatch_are_independent(admin_client, db, seeded_movie):
    # Two kinds, one target: setting one must not disturb the other.
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"watch_next": True})
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": True})

    body = admin_client.get(f"/api/movies/{seeded_movie}").json()
    assert body["watch_next"] is True
    assert body["to_rewatch"] is True

    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": False})
    body = admin_client.get(f"/api/movies/{seeded_movie}").json()
    assert body["watch_next"] is True
    assert body["to_rewatch"] is False


def test_comic_uses_to_reread(admin_client, db, seeded_comic):
    res = admin_client.patch(f"/api/comic/{seeded_comic}", json={"to_reread": True})
    assert res.status_code == 200
    assert res.json()["to_reread"] is True

    row = db.query(models.PlanNext).filter_by(target_id=seeded_comic).one()
    assert (row.kind, row.media_type) == ("rewatch", "comic")


def test_cartoon_has_no_rewatch_field(admin_client, seeded_cartoon):
    # Cartoon rewatches at franchise scope only.
    body = admin_client.get(f"/api/cartoon/{seeded_cartoon}").json()
    assert "to_rewatch" not in body


def test_cartoon_list_ignores_the_dropped_filter(client):
    # `to_rewatch` was removed from cartoon's list_filters (app/registry.py), so
    # the factory's generic query-param loop (app/routers/_factory.py) never
    # looks at it. Unknown filters aren't rejected by that loop - they're just
    # not applied - so this is a 200 with the filter silently ignored, not a
    # 422. (The brief's version of this test assumed stricter validation than
    # the factory implements; see task-4-report.md.)
    res = client.get("/api/cartoon/?to_rewatch=true")
    assert res.status_code == 200
