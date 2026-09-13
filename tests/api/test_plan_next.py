"""
API integration tests for /api/plan-next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.

The client here is `super_client`, not `admin_client`: since 2026-09-12 an
administrative account holds no `self.*` grant and every route in this prefix
answers it 401. The `super` role is the account shape that legitimately keeps
a library - it holds both self.* grants and manage.catalog, so the catalogue
writes some of these tests make still land. Spec:
docs/superpowers/specs/2026-09-12-admin-holds-no-user-data.md.
"""

import uuid


def _payload(scope, target_id, media_type="anime", remark=None):
    return {
        "media_type": media_type,
        "scope": scope,
        "target_id": str(target_id),
        "remark": remark,
    }


def test_kinds_exposes_scopes_and_bucket_vocabularies(super_client):
    # Authenticated from Step 3 on: everything under the prefix needs a login.
    res = super_client.get("/api/plan-next/kinds")
    assert res.status_code == 200
    body = res.json()
    assert body["scopes"] == ["entry", "series", "franchise"]
    assert body["allowed_scopes"]["next"]["manga"] == ["entry"]
    assert [g["key"] for g in body["size_groups"]["comic"]] == [
        "1_3",
        "4_10",
        "11_plus",
    ]


def test_the_list_starts_empty_for_the_caller(super_client):
    res = super_client.get("/api/plan-next/")
    assert res.status_code == 200
    assert res.json() == []


def test_the_list_refuses_an_anonymous_caller(client):
    # A plan queue belongs to one account: a refusal, not an empty page.
    assert client.get("/api/plan-next/").status_code == 401


def test_create_requires_admin(client, sample_franchise):
    res = client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    assert res.status_code in (401, 403)


def test_admin_can_plan_a_franchise(super_client, sample_franchise):
    res = super_client.post(
        "/api/plan-next/", json=_payload("franchise", sample_franchise.system_id)
    )
    assert res.status_code == 201
    body = res.json()
    assert body["scope"] == "franchise"
    assert body["media_type"] == "anime"


def test_admin_can_plan_a_series(super_client, sample_series):
    res = super_client.post(
        "/api/plan-next/", json=_payload("series", sample_series.system_id)
    )
    assert res.status_code == 201


def test_planning_the_same_target_twice_conflicts(super_client, sample_franchise):
    payload = _payload("franchise", sample_franchise.system_id)
    assert super_client.post("/api/plan-next/", json=payload).status_code == 201
    assert super_client.post("/api/plan-next/", json=payload).status_code == 409


def test_a_disallowed_scope_is_rejected(super_client, sample_franchise):
    res = super_client.post(
        "/api/plan-next/",
        json=_payload("franchise", sample_franchise.system_id, "manga"),
    )
    assert res.status_code == 400
    assert "franchise" in res.json()["detail"]


def test_an_unknown_media_type_is_rejected(super_client, sample_franchise):
    res = super_client.post(
        "/api/plan-next/",
        json=_payload("entry", sample_franchise.system_id, "podcast"),
    )
    assert res.status_code == 400


def test_a_missing_target_is_rejected(super_client):
    res = super_client.post("/api/plan-next/", json=_payload("franchise", uuid.uuid4()))
    assert res.status_code == 404


def test_list_filters_by_media_type_and_scope(super_client, sample_franchise, sample_series):
    super_client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    super_client.post("/api/plan-next/", json=_payload("series", sample_series.system_id))

    assert len(super_client.get("/api/plan-next/").json()) == 2
    assert len(super_client.get("/api/plan-next/?scope=series").json()) == 1
    assert len(super_client.get("/api/plan-next/?media_type=anime").json()) == 2
    assert len(super_client.get("/api/plan-next/?media_type=movie").json()) == 0


def test_delete_by_row_id(super_client, sample_franchise):
    created = super_client.post(
        "/api/plan-next/", json=_payload("franchise", sample_franchise.system_id)
    ).json()
    res = super_client.delete(f"/api/plan-next/{created['system_id']}")
    assert res.status_code == 200
    assert super_client.get("/api/plan-next/").json() == []


def test_delete_by_target(super_client, sample_franchise):
    super_client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    res = super_client.delete(
        "/api/plan-next/target",
        params={
            "scope": "franchise",
            "media_type": "anime",
            "target_id": str(sample_franchise.system_id),
        },
    )
    assert res.status_code == 200
    assert super_client.get("/api/plan-next/").json() == []


def test_delete_by_target_404s_when_not_planned(super_client, sample_franchise):
    res = super_client.delete(
        "/api/plan-next/target",
        params={
            "scope": "franchise",
            "media_type": "anime",
            "target_id": str(sample_franchise.system_id),
        },
    )
    assert res.status_code == 404


def test_a_row_whose_target_was_deleted_is_gone(
    super_client, db_session, sample_franchise
):
    # It used to survive as missing=True, because the target was FK-less.
    # fk_plan_next_franchise cascades now, so there is nothing left to flag.
    super_client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    db_session.delete(sample_franchise)
    db_session.flush()

    assert super_client.get("/api/plan-next/").json() == []
