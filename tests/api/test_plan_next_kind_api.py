"""
The kind parameter across /api/plan-next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.

The client here is `super_client`, not `admin_client`: since 2026-09-12 an
administrative account holds no `self.*` grant and every route in this prefix
answers it 401. The `super` role is the account shape that legitimately keeps
a library - it holds both self.* grants and manage.catalog, so the catalogue
writes some of these tests make still land. Spec:
docs/superpowers/specs/2026-09-12-admin-holds-no-user-data.md.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def seeded_movie(db_session, sample_franchise):
    m = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Test Movie",
    )
    db_session.add(m)
    db_session.flush()
    return m.system_id


@pytest.fixture
def seeded_anime(sample_anime):
    return sample_anime.system_id


def _payload(scope, target_id, media_type="movie", kind=None):
    body = {"media_type": media_type, "scope": scope, "target_id": str(target_id)}
    if kind is not None:
        body["kind"] = kind
    return body


def test_kind_defaults_to_next(super_client, seeded_movie):
    res = super_client.post("/api/plan-next/", json=_payload("entry", seeded_movie))
    assert res.status_code == 201
    assert res.json()["kind"] == "next"


def test_rewatch_row_round_trips(super_client, seeded_movie):
    res = super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )
    assert res.status_code == 201
    assert res.json()["kind"] == "rewatch"


def test_same_target_under_both_kinds(super_client, seeded_movie):
    assert super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie)
    ).status_code == 201
    assert super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    ).status_code == 201


def test_duplicate_within_a_kind_is_409(super_client, seeded_movie):
    super_client.post("/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch"))
    res = super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )
    assert res.status_code == 409


def test_unknown_kind_is_422(super_client, seeded_movie):
    res = super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="reread")
    )
    assert res.status_code == 422


def test_anime_entry_is_legal_for_next_but_not_rewatch(super_client, seeded_anime):
    # The scope map differs by kind; the router must consult the right one.
    assert super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_anime, media_type="anime")
    ).status_code == 201
    res = super_client.post(
        "/api/plan-next/",
        json=_payload("entry", seeded_anime, media_type="anime", kind="rewatch"),
    )
    # This is a "combination disallowed" failure, the same branch that
    # test_a_disallowed_scope_is_rejected (tests/api/test_plan_next.py)
    # already asserts is a 400 for the same reason shape (scope_allowed
    # returning False). 422 is reserved for a malformed/unknown kind value;
    # see the brief deviation noted in task-3-report.md.
    assert res.status_code == 400


def test_list_filters_by_kind(super_client, seeded_movie):
    super_client.post("/api/plan-next/", json=_payload("entry", seeded_movie))
    super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )

    both = super_client.get("/api/plan-next/").json()
    assert len({r["kind"] for r in both}) == 2

    only = super_client.get("/api/plan-next/?kind=rewatch").json()
    assert only and all(r["kind"] == "rewatch" for r in only)


def test_delete_by_target_is_kind_scoped(super_client, seeded_movie):
    super_client.post("/api/plan-next/", json=_payload("entry", seeded_movie))
    super_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )

    res = super_client.delete(
        "/api/plan-next/target",
        params={
            "scope": "entry",
            "media_type": "movie",
            "target_id": str(seeded_movie),
            "kind": "rewatch",
        },
    )
    assert res.status_code == 200

    left = super_client.get("/api/plan-next/").json()
    assert [r["kind"] for r in left] == ["next"]


def test_kinds_endpoint_exposes_both_maps(super_client):
    # Authenticated from Step 3 on: everything under the prefix needs a login.
    body = super_client.get("/api/plan-next/kinds").json()
    assert body["kinds"] == ["next", "rewatch"]
    assert body["allowed_scopes"]["next"]["anime"] == ["entry", "series", "franchise"]
    assert body["allowed_scopes"]["rewatch"]["anime"] == ["franchise"]
