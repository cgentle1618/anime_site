"""
A labelled entry must not reach a viewer who lacks the label's permission.

Assertions run against response.text, not parsed fields, because an entry can
leak through a payload this test never models - a resolved display name inside
a quote, a watch-order step, a relation graph node. A substring check on the
whole body catches those; checking `[e["system_id"] for e in body]` does not.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.permissions import label_perm, media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.services.security import create_access_token, get_password_hash

HIDDEN_NAME = "Zvornik Hidden Sentinel"


def make_viewer(db_session, client, username, permissions):
    """Log `client` in as a new user holding exactly `permissions`."""
    role = models.Role(
        system_id=uuid.uuid4(),
        name=f"role-{username}",
        label=username,
        is_system=False,
        is_superuser=False,
    )
    db_session.add(role)
    db_session.flush()
    for permission in permissions:
        db_session.add(
            models.RolePermission(role_id=role.system_id, permission=permission)
        )
    db_session.add(
        models.User(
            id=uuid.uuid4(),
            username=username,
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db_session.flush()
    rbac_cache.bump()

    token = create_access_token({"sub": username, "role": role.name})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


@pytest.fixture
def nsfw_label(db_session):
    label = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    db_session.add(label)
    db_session.flush()
    return label


@pytest.fixture
def hidden_anime(db_session, sample_franchise, nsfw_label):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en=HIDDEN_NAME,
        airing_type="TV",
        airing_status="Finished Airing",
        watching_status="Completed",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=entry.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db_session.flush()
    return entry


# ---------------------------------------------------------------------------
# Entry-level
# ---------------------------------------------------------------------------

def test_an_unlabelled_entry_stays_visible(client, sample_anime):
    """The default must remain: nothing is hidden until it is labelled."""
    body = client.get("/api/anime/").text
    assert str(sample_anime.system_id) in body


def test_a_labelled_entry_is_absent_from_the_list(client, hidden_anime):
    response = client.get("/api/anime/")
    assert response.status_code == 200
    assert str(hidden_anime.system_id) not in response.text
    assert HIDDEN_NAME not in response.text


def test_a_labelled_entry_detail_is_indistinguishable_from_missing(
    client, hidden_anime
):
    response = client.get(f"/api/anime/{hidden_anime.system_id}")
    assert response.status_code == 404
    assert HIDDEN_NAME not in response.text


def test_admin_still_sees_a_labelled_entry(admin_client, hidden_anime):
    """is_superuser must not need a label.* grant to see labelled content."""
    assert HIDDEN_NAME in admin_client.get("/api/anime/").text
    assert (
        admin_client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200
    )


def test_a_viewer_holding_the_label_sees_the_entry(
    client, db_session, hidden_anime
):
    make_viewer(
        db_session,
        client,
        "trusted",
        default_guest_permissions() | {label_perm("nsfw")},
    )
    assert HIDDEN_NAME in client.get("/api/anime/").text
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


def test_a_viewer_lacking_the_label_does_not(client, db_session, hidden_anime):
    make_viewer(db_session, client, "untrusted", default_guest_permissions())
    assert HIDDEN_NAME not in client.get("/api/anime/").text
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_hiding_an_entry_does_not_hide_its_siblings(
    client, hidden_anime, sample_anime
):
    """The anti-join must remove one row, not empty the page."""
    body = client.get("/api/anime/").text
    assert str(sample_anime.system_id) in body
    assert str(hidden_anime.system_id) not in body


def test_a_search_cannot_surface_a_hidden_entry(client, hidden_anime):
    response = client.get("/api/anime/", params={"search_query": "Zvornik"})
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text
