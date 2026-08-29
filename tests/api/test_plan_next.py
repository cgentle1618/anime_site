"""
API integration tests for /api/plan-next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


def _payload(scope, target_id, media_type="anime", remark=None):
    return {
        "media_type": media_type,
        "scope": scope,
        "target_id": str(target_id),
        "remark": remark,
    }


def test_kinds_exposes_scopes_and_bucket_vocabularies(client):
    res = client.get("/api/plan-next/kinds")
    assert res.status_code == 200
    body = res.json()
    assert body["scopes"] == ["entry", "series", "franchise"]
    assert body["allowed_scopes"]["next"]["manga"] == ["entry"]
    assert [g["key"] for g in body["size_groups"]["comic"]] == [
        "1_3",
        "4_10",
        "11_plus",
    ]


def test_list_is_public_and_starts_empty(client):
    res = client.get("/api/plan-next/")
    assert res.status_code == 200
    assert res.json() == []


def test_create_requires_admin(client, sample_franchise):
    res = client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    assert res.status_code in (401, 403)


def test_admin_can_plan_a_franchise(admin_client, sample_franchise):
    res = admin_client.post(
        "/api/plan-next/", json=_payload("franchise", sample_franchise.system_id)
    )
    assert res.status_code == 201
    body = res.json()
    assert body["scope"] == "franchise"
    assert body["media_type"] == "anime"


def test_admin_can_plan_a_series(admin_client, sample_series):
    res = admin_client.post(
        "/api/plan-next/", json=_payload("series", sample_series.system_id)
    )
    assert res.status_code == 201


def test_planning_the_same_target_twice_conflicts(admin_client, sample_franchise):
    payload = _payload("franchise", sample_franchise.system_id)
    assert admin_client.post("/api/plan-next/", json=payload).status_code == 201
    assert admin_client.post("/api/plan-next/", json=payload).status_code == 409


def test_a_disallowed_scope_is_rejected(admin_client, sample_franchise):
    res = admin_client.post(
        "/api/plan-next/",
        json=_payload("franchise", sample_franchise.system_id, "manga"),
    )
    assert res.status_code == 400
    assert "franchise" in res.json()["detail"]


def test_an_unknown_media_type_is_rejected(admin_client, sample_franchise):
    res = admin_client.post(
        "/api/plan-next/",
        json=_payload("entry", sample_franchise.system_id, "podcast"),
    )
    assert res.status_code == 400


def test_a_missing_target_is_rejected(admin_client):
    res = admin_client.post("/api/plan-next/", json=_payload("franchise", uuid.uuid4()))
    assert res.status_code == 404


def test_list_filters_by_media_type_and_scope(admin_client, sample_franchise, sample_series):
    admin_client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    admin_client.post("/api/plan-next/", json=_payload("series", sample_series.system_id))

    assert len(admin_client.get("/api/plan-next/").json()) == 2
    assert len(admin_client.get("/api/plan-next/?scope=series").json()) == 1
    assert len(admin_client.get("/api/plan-next/?media_type=anime").json()) == 2
    assert len(admin_client.get("/api/plan-next/?media_type=movie").json()) == 0


def test_delete_by_row_id(admin_client, sample_franchise):
    created = admin_client.post(
        "/api/plan-next/", json=_payload("franchise", sample_franchise.system_id)
    ).json()
    res = admin_client.delete(f"/api/plan-next/{created['system_id']}")
    assert res.status_code == 200
    assert admin_client.get("/api/plan-next/").json() == []


def test_delete_by_target(admin_client, sample_franchise):
    admin_client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    res = admin_client.delete(
        "/api/plan-next/target",
        params={
            "scope": "franchise",
            "media_type": "anime",
            "target_id": str(sample_franchise.system_id),
        },
    )
    assert res.status_code == 200
    assert admin_client.get("/api/plan-next/").json() == []


def test_delete_by_target_404s_when_not_planned(admin_client, sample_franchise):
    res = admin_client.delete(
        "/api/plan-next/target",
        params={
            "scope": "franchise",
            "media_type": "anime",
            "target_id": str(sample_franchise.system_id),
        },
    )
    assert res.status_code == 404


def test_a_row_whose_target_was_deleted_reads_as_missing(
    admin_client, db_session, sample_franchise
):
    admin_client.post("/api/plan-next/", json=_payload("franchise", sample_franchise.system_id))
    db_session.delete(sample_franchise)
    db_session.flush()

    rows = admin_client.get("/api/plan-next/").json()
    assert len(rows) == 1
    assert rows[0]["missing"] is True
