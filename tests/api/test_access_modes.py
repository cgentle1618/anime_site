"""What an access mode does to a read.

Read scoping, denials, fail-closed resolution and axis independence. The last
of those is the test that proves the redesign did what it set out to do: it
would have been unwritable in the old model, where is_superuser
short-circuited every gate.
"""

from app import models
from app.services.rbac import cache
from app.services.rbac.seed_modes import MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE


def test_a_labelled_entry_is_invisible_in_safe(nsfw_label, hidden_anime, mode_client):
    c = mode_client(MODE_SAFE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_the_same_entry_is_visible_in_borderline(
    nsfw_label, hidden_anime, mode_client
):
    c = mode_client(MODE_BORDERLINE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


def test_a_hidden_entry_is_absent_from_the_list(nsfw_label, hidden_anime, mode_client):
    c = mode_client(MODE_NORMAL)
    body = c.get("/api/anime/").json()
    assert str(hidden_anime.system_id) not in {entry["system_id"] for entry in body}


def test_hidden_answers_404_with_the_ordinary_not_found_message(
    nsfw_label, hidden_anime, mode_client
):
    """Indistinguishability is the property being protected. A 403 would leak
    the entry's existence as surely as a 200."""
    c = mode_client(MODE_NORMAL)
    missing = c.get("/api/anime/00000000-0000-0000-0000-000000000000")
    hidden = c.get(f"/api/anime/{hidden_anime.system_id}")
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json()["detail"] == missing.json()["detail"]


def test_a_denial_subtracts_one_label_from_a_wide_mode(
    nsfw_label, hidden_anime, mode_client
):
    """An account holding `borderline` MINUS nsfw sees what `normal` sees,
    without anyone having created a mode for it."""
    c = mode_client(MODE_BORDERLINE, denials=(nsfw_label.key,))
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_revoking_the_grant_cascades_the_denial_away(
    db_session, admin_user, nsfw_label, grant_mode
):
    grant = grant_mode(admin_user, MODE_BORDERLINE, denials=(nsfw_label.key,))
    assert (
        db_session.query(models.UserAccessModeDenial)
        .filter(models.UserAccessModeDenial.user_access_mode_id == grant.system_id)
        .count()
        == 1
    )
    db_session.delete(grant)
    db_session.flush()
    assert (
        db_session.query(models.UserAccessModeDenial)
        .filter(models.UserAccessModeDenial.user_access_mode_id == grant.system_id)
        .count()
        == 0
    )


def test_revoking_a_live_sessions_mode_resolves_to_nothing_not_to_the_default(
    db_session, nsfw_label, hidden_anime, mode_client
):
    """Delete the grant while the cookie is live: the next request must see
    NOTHING, not fall back to the account's default mode. Falling back to
    is_default could WIDEN the session."""
    c = mode_client(MODE_BORDERLINE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200

    db_session.query(models.UserAccessMode).delete()
    db_session.flush()
    cache.bump()

    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_a_guest_sees_nothing_labelled_when_no_mode_is_flagged(
    db_session, client, access_modes, nsfw_label, hidden_anime
):
    """Fail closed. A misconfiguration must hide everything, not publish it."""
    db_session.query(models.AccessMode).update({"is_guest_default": False})
    db_session.flush()
    cache.bump()
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_a_superuser_sitting_in_safe_does_not_see_a_labelled_entry(
    db_session, admin_user, nsfw_label, hidden_anime, mode_client
):
    """The test that proves the two axes are independent.

    admin_user is on the `admin` role, which is is_superuser=True. Under the
    old model that short-circuited every label check and this could not have
    been written. is_superuser now means "holds every CAPABILITY permission"
    and says nothing about which objects a session reaches.
    """
    assert db_session.get(models.Role, admin_user.role_id).is_superuser is True
    c = mode_client(MODE_SAFE, user=admin_user)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_a_superuser_in_a_narrow_mode_still_holds_every_capability(
    db_session, admin_user, nsfw_label, mode_client, sample_anime
):
    """The other half of axis independence: narrowing the objects a session
    reaches must NOT take away what it may do. Dropping to `safe` does not
    drop the manage.catalog grant."""
    c = mode_client(MODE_SAFE, user=admin_user)
    assert c.get("/api/auth/me").json()["is_admin"] is True
