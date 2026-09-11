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
from app.services.rbac.permissions import PERM_SELF_LIST, label_perm
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
def hidden_anime(db_session, sample_franchise, nsfw_label, list_row):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en=HIDDEN_NAME,
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    # Completed lives on the acting user's list row since step 1.
    list_row(entry, status="Completed")
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
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


def test_the_cross_type_search_cannot_surface_a_hidden_entry(client, hidden_anime):
    """/api/search fans out over every table; each fan-out arm needs the gate."""
    response = client.get("/api/search/", params={"q": "Zvornik"})
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text


def test_franchise_expansion_cannot_surface_a_hidden_entry(client, hidden_anime):
    """
    A franchise-name match pulls in the franchise's anime. That second query is
    a separate one, so it needs its own visibility filter - otherwise searching
    the franchise name is a way around the label.
    """
    response = client.get("/api/search/", params={"q": "Test Franchise"})
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------
#
# The gate above is a READ gate, and that was the whole of it: me_list.py's two
# handlers resolved their entry with a bare db.get(models.Media, media_id) and
# never asked entry_visible. So an account holding self.list could set a status,
# rating and progress on an entry it cannot see - and could learn the entry
# exists - by knowing the uuid. OWASP API1:2023, Broken Object Level
# Authorization.
#
# The rule these pin: writes follow reads. If GET answers 404 for a viewer,
# every write to that id answers 404 too, with the same message - a 403 would
# confirm the entry exists just as surely as a 200 would.


def _list_viewer(db_session, client, username="listwriter", extra=frozenset()):
    """A viewer holding the list permission but NOT the nsfw label."""
    return make_viewer(
        db_session,
        client,
        username,
        default_guest_permissions() | {PERM_SELF_LIST} | set(extra),
    )


def test_writing_a_list_row_for_a_hidden_entry_is_indistinguishable_from_missing(
    client, db_session, hidden_anime
):
    _list_viewer(db_session, client)
    response = client.put(
        f"/api/me/list/{hidden_anime.system_id}",
        json={"watching_status": "Completed"},
    )
    assert response.status_code == 404
    assert HIDDEN_NAME not in response.text


def test_reading_a_list_row_for_a_hidden_entry_is_indistinguishable_from_missing(
    client, db_session, hidden_anime
):
    """Returns only the caller's own row, but still confirms the id exists."""
    _list_viewer(db_session, client)
    response = client.get(f"/api/me/list/{hidden_anime.system_id}")
    assert response.status_code == 404
    assert HIDDEN_NAME not in response.text


def test_a_hidden_entry_write_leaves_no_list_row_behind(
    client, db_session, hidden_anime
):
    """
    The 404 must precede the upsert, not follow it.

    Counted before and after rather than asserted to be zero: the hidden_anime
    fixture gives the entry a Completed row on the ACTING user's list, so the
    table is not empty here to begin with. What must not change is that no row
    appears for the caller.
    """
    _list_viewer(db_session, client)
    rows = (
        db_session.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == hidden_anime.system_id)
    )
    before = rows.count()
    client.put(
        f"/api/me/list/{hidden_anime.system_id}",
        json={"watching_status": "Completed"},
    )
    assert rows.count() == before


def test_the_write_gate_does_not_block_an_entry_the_viewer_may_see(
    client, db_session, sample_anime
):
    """The control: an unlabelled entry still writes, so the guard is a gate
    and not a blanket refusal."""
    _list_viewer(db_session, client)
    response = client.put(
        f"/api/me/list/{sample_anime.system_id}",
        json={"watching_status": "Completed"},
    )
    assert response.status_code == 200


def test_a_viewer_holding_the_label_may_write_the_hidden_entry(
    client, db_session, hidden_anime
):
    """Holding the label restores the write, not just the read."""
    _list_viewer(db_session, client, username="trustedwriter",
                 extra={label_perm("nsfw")})
    response = client.put(
        f"/api/me/list/{hidden_anime.system_id}",
        json={"watching_status": "Completed"},
    )
    assert response.status_code == 200
