"""The entries credited to a studio, and who may see them."""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import label_perm
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import (  # noqa: F401
    HIDDEN_NAME,
    hidden_anime,
    make_viewer,
    nsfw_label,
)


@pytest.fixture
def mappa(db_session):
    studio = models.Studio(name_en="MAPPA")
    db_session.add(studio)
    db_session.flush()
    return studio


def credit(db_session, studio, media_type, entry_id):
    db_session.add(
        models.MediaCredit(
            media_type=media_type,
            entry_id=entry_id,
            role="studio",
            studio_id=studio.system_id,
        )
    )
    db_session.commit()


def test_lists_the_entries_credited_to_the_studio(
    admin_client, db_session, mappa, sample_anime
):
    credit(db_session, mappa, "anime", sample_anime.system_id)
    body = admin_client.get(f"/api/studio/{mappa.system_id}/entries").json()
    assert body["groups"][0]["media_type"] == "anime"
    assert body["groups"][0]["entries"][0]["system_id"] == str(sample_anime.system_id)


def test_a_studio_with_no_credits_returns_no_groups(admin_client, mappa):
    body = admin_client.get(f"/api/studio/{mappa.system_id}/entries").json()
    assert body["groups"] == []


def test_unknown_studio_is_404(admin_client):
    r = admin_client.get(f"/api/studio/{uuid.uuid4()}/entries")
    assert r.status_code == 404


def test_a_labelled_entry_is_hidden_from_a_viewer_without_the_permission(
    client, db_session, mappa, hidden_anime, nsfw_label
):
    credit(db_session, mappa, "anime", hidden_anime.system_id)
    make_viewer(db_session, client, "plain", default_guest_permissions())
    r = client.get(f"/api/studio/{mappa.system_id}/entries")
    # Assert on the whole body, not parsed fields: a title can leak through a
    # key this test does not model.
    assert HIDDEN_NAME not in r.text
    assert r.json()["groups"] == []


def test_the_same_entry_is_visible_to_a_viewer_holding_the_label(
    client, db_session, mappa, hidden_anime, nsfw_label
):
    credit(db_session, mappa, "anime", hidden_anime.system_id)
    make_viewer(
        db_session,
        client,
        "labelled",
        list(default_guest_permissions()) + [label_perm(nsfw_label.key)],
    )
    assert HIDDEN_NAME in client.get(f"/api/studio/{mappa.system_id}/entries").text
