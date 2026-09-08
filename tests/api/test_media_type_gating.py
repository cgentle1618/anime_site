"""
A role can be blocked from a whole media type.

Blocking a type has to hold on every route keyed by (media_type, entry_id),
not just the library list - credits and notes are public GETs that would
otherwise confirm an entry exists and name the people on it.
"""

import pytest

from app.services.rbac.permissions import media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.utils.media_resolver import MEDIA_TYPE_KEYS
from tests.api.test_visibility import make_viewer


@pytest.fixture
def no_anime_client(client, db_session):
    """Everything a guest holds, except the right to see anime."""
    return make_viewer(
        db_session,
        client,
        "noanime",
        default_guest_permissions() - {media_type_perm("anime")},
    )


def test_the_blocked_type_lists_nothing(no_anime_client, sample_anime):
    response = no_anime_client.get("/api/anime/")
    assert response.status_code == 200
    assert response.json() == []


def test_the_blocked_type_detail_is_not_found(no_anime_client, sample_anime):
    assert (
        no_anime_client.get(f"/api/anime/{sample_anime.system_id}").status_code == 404
    )


def test_another_type_is_unaffected(no_anime_client, sample_comic):
    """Blocking anime must not blank the rest of the library."""
    response = no_anime_client.get("/api/comic/")
    assert response.status_code == 200
    assert str(sample_comic.system_id) in response.text


def test_admin_is_unaffected(admin_client, sample_anime):
    assert str(sample_anime.system_id) in admin_client.get("/api/anime/").text


@pytest.mark.parametrize("media_type", sorted(MEDIA_TYPE_KEYS))
def test_every_media_type_has_a_permission_a_role_can_hold(media_type):
    """A type with no permission could never be blocked - and none may be missed."""
    assert media_type_perm(media_type) in default_guest_permissions()
