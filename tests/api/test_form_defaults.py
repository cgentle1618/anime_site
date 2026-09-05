"""
API tests for /api/form-defaults — the admin Form Defaults page backend.

Covers the auth matrix, upsert semantics, sparse storage, validation limits,
and the one real risk of reusing system_configs: that the new 'form_defaults:'
keys must not leak into the announcements listing.
"""

import json

import pytest

from app import models
from app.routers.form_defaults import FORM_DEFAULTS_PREFIX


def _row(db_session, media_type="anime"):
    return (
        db_session.query(models.SystemConfigs)
        .filter(
            models.SystemConfigs.config_key == f"{FORM_DEFAULTS_PREFIX}{media_type}"
        )
        .first()
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_list_requires_admin(client):
    assert client.get("/api/form-defaults/").status_code == 401


def test_get_requires_admin(client):
    assert client.get("/api/form-defaults/anime").status_code == 401


def test_put_requires_admin(client):
    res = client.put("/api/form-defaults/anime", json={"defaults": {}})
    assert res.status_code == 401


def test_delete_requires_admin(client):
    assert client.delete("/api/form-defaults/anime").status_code == 401


# ---------------------------------------------------------------------------
# Reads before anything is configured
# ---------------------------------------------------------------------------

def test_list_empty_when_nothing_configured(admin_client):
    res = admin_client.get("/api/form-defaults/")
    assert res.status_code == 200
    assert res.json() == {}


def test_get_unconfigured_type_returns_empty_payload_not_404(admin_client):
    """'Unconfigured' is a normal state — the client shouldn't branch on 404."""
    res = admin_client.get("/api/form-defaults/anime")
    assert res.status_code == 200
    assert res.json() == {
        "media_type": "anime",
        "version": 1,
        "defaults": {},
        "autofill": None,
    }


# ---------------------------------------------------------------------------
# Save / round-trip
# ---------------------------------------------------------------------------

def test_put_then_get_round_trips(admin_client):
    payload = {
        "version": 1,
        "defaults": {"watching_status": "Plan to Watch", "ep_total": "12"},
        "autofill": ["anime_name_en", "studio"],
    }
    assert admin_client.put("/api/form-defaults/anime", json=payload).status_code == 200

    body = admin_client.get("/api/form-defaults/anime").json()
    assert body["defaults"] == payload["defaults"]
    assert body["autofill"] == payload["autofill"]
    assert body["media_type"] == "anime"


def test_stored_defaults_stay_sparse(admin_client, db_session):
    """Only overridden fields are persisted — the rest stay built-in."""
    admin_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {"watching_status": "Plan to Watch"}},
    )
    stored = json.loads(_row(db_session).config_value)
    assert list(stored["defaults"]) == ["watching_status"]


def test_put_twice_upserts_a_single_row(admin_client, db_session):
    admin_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "1"}})
    admin_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "2"}})

    rows = (
        db_session.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key.like(f"{FORM_DEFAULTS_PREFIX}%"))
        .all()
    )
    assert len(rows) == 1
    assert json.loads(rows[0].config_value)["defaults"]["ep_total"] == "2"


def test_list_returns_every_configured_type(admin_client):
    admin_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "12"}})
    admin_client.put("/api/form-defaults/manga", json={"defaults": {"region": "日漫"}})

    body = admin_client.get("/api/form-defaults/").json()
    assert set(body) == {"anime", "manga"}
    assert body["manga"]["defaults"]["region"] == "日漫"


def test_empty_autofill_list_is_preserved(admin_client):
    """[] means 'copy nothing' and must not collapse to null/built-in."""
    admin_client.put(
        "/api/form-defaults/anime", json={"defaults": {}, "autofill": []}
    )
    assert admin_client.get("/api/form-defaults/anime").json()["autofill"] == []


def test_various_value_types_are_accepted(admin_client):
    payload = {
        "defaults": {
            "watching_status": "Paused",
            "ep_total": 12,
            "is_main_entry": True,
            "remark": None,
        }
    }
    assert admin_client.put("/api/form-defaults/anime", json=payload).status_code == 200


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_unknown_media_type_rejected(admin_client, method):
    kwargs = {"json": {"defaults": {}}} if method == "put" else {}
    res = getattr(admin_client, method)("/api/form-defaults/bogus-type", **kwargs)
    assert res.status_code == 400


@pytest.mark.parametrize(
    "media_type",
    [
        "anime",
        "anime-movie",
        "movie",
        "tv-show",
        "cartoon",
        "manga",
        "novel",
        "comic",
        "collection",
        "franchise",
        "series",
        "studio",
        "person",
        "character",
    ],
)
def test_every_form_tab_is_accepted(admin_client, media_type):
    # Every tab with an Add form must round-trip; a missing slug 400s instead.
    res = admin_client.put(
        f"/api/form-defaults/{media_type}", json={"defaults": {"region": "USA"}}
    )
    assert res.status_code == 200, res.text
    assert admin_client.get(f"/api/form-defaults/{media_type}").status_code == 200


def test_nested_object_value_rejected(admin_client):
    res = admin_client.put(
        "/api/form-defaults/anime", json={"defaults": {"studio": {"nested": 1}}}
    )
    assert res.status_code == 422


def test_non_string_list_value_rejected(admin_client):
    res = admin_client.put(
        "/api/form-defaults/anime", json={"defaults": {"source_other": [{"a": 1}]}}
    )
    assert res.status_code == 422


def test_invalid_field_key_rejected(admin_client):
    res = admin_client.put(
        "/api/form-defaults/anime", json={"defaults": {"Bad-Key!": "x"}}
    )
    assert res.status_code == 422


def test_too_many_fields_rejected(admin_client):
    res = admin_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {f"field_{i}": "x" for i in range(300)}},
    )
    assert res.status_code == 422


def test_oversized_payload_rejected(admin_client):
    res = admin_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {"remark": "x" * 40000}},
    )
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

def test_delete_removes_the_row(admin_client, db_session):
    admin_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "12"}})
    assert _row(db_session) is not None

    assert admin_client.delete("/api/form-defaults/anime").status_code == 200
    assert _row(db_session) is None
    assert admin_client.get("/api/form-defaults/anime").json()["defaults"] == {}


def test_delete_is_idempotent(admin_client):
    """Resetting an already-unconfigured type is the state the caller asked for."""
    assert admin_client.delete("/api/form-defaults/anime").status_code == 200
    assert admin_client.delete("/api/form-defaults/anime").status_code == 200


# ---------------------------------------------------------------------------
# Robustness / shared-table safety
# ---------------------------------------------------------------------------

def test_unreadable_json_is_treated_as_unconfigured(admin_client, db_session):
    db_session.add(
        models.SystemConfigs(
            config_key=f"{FORM_DEFAULTS_PREFIX}anime", config_value="not json"
        )
    )
    db_session.flush()

    res = admin_client.get("/api/form-defaults/anime")
    assert res.status_code == 200
    assert res.json()["defaults"] == {}

    assert admin_client.get("/api/form-defaults/").status_code == 200


def test_form_defaults_do_not_leak_into_announcements(admin_client):
    """Both features share system_configs — their key namespaces must not mix."""
    admin_client.post(
        "/api/announcements/", json={"title": "Notice", "body": "Hello"}
    )
    admin_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "12"}})

    announcements = admin_client.get("/api/announcements/").json()
    assert [a["title"] for a in announcements] == ["Notice"]

    assert set(admin_client.get("/api/form-defaults/").json()) == {"anime"}
