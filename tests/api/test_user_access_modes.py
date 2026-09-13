"""PUT /api/users/{id}/access-modes, and what a NEW account starts with.

One endpoint replaces the whole set - grants, login default and per-account
denials - in a single payload. Same contract as PUT /roles/{id}/permissions:
one write, one bump(), no partial states.

Decision 8 is enforced here and not merely rendered: a mode is a CEILING, so a
denial naming something the mode does not carry is meaningless and refused.
The per-account panel is built so it cannot express one, but a UI that cannot
ask for the invalid thing and a server that would accept it is one refactor
away from a silent no-op.
"""

import uuid

from app import models
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)


def _url(user):
    return f"/api/users/{user.id}/access-modes"


def _held(db, user):
    return {
        db.get(models.AccessMode, row.mode_id).key: row
        for row in db.query(models.UserAccessMode).filter(
            models.UserAccessMode.user_id == user.id
        )
    }


# ---------------------------------------------------------------------------
# Replacing the set
# ---------------------------------------------------------------------------


def test_replacing_sets_grants_and_the_login_default(
    db_session, admin_client, plain_user, mode
):
    response = admin_client.put(
        _url(plain_user),
        json={
            "modes": [
                {"mode_id": str(mode(MODE_SAFE).system_id), "is_default": True},
                {"mode_id": str(mode(MODE_NORMAL).system_id), "is_default": False},
            ]
        },
    )

    assert response.status_code == 200
    held = _held(db_session, plain_user)
    assert set(held) == {MODE_SAFE, MODE_NORMAL}
    assert held[MODE_SAFE].is_default is True
    assert held[MODE_NORMAL].is_default is False


def test_replacing_drops_the_modes_left_out(
    db_session, admin_client, plain_user, mode, grant_mode
):
    grant_mode(plain_user, MODE_UNRESTRICTED, is_default=True)

    admin_client.put(
        _url(plain_user),
        json={"modes": [{"mode_id": str(mode(MODE_SAFE).system_id),
                         "is_default": True}]},
    )

    assert set(_held(db_session, plain_user)) == {MODE_SAFE}


def test_dropping_a_mode_takes_its_denials_with_it(
    db_session, admin_client, plain_user, mode, nsfw_label
):
    """Denials hang off the GRANT row, not the user, so revoking a mode
    cascades that account's adjustments to it away."""
    admin_client.put(
        _url(plain_user),
        json={
            "modes": [
                {
                    "mode_id": str(mode(MODE_BORDERLINE).system_id),
                    "is_default": True,
                    "denied_label_keys": [nsfw_label.key],
                }
            ]
        },
    )
    assert db_session.query(models.UserAccessModeDenial).count() == 1

    admin_client.put(
        _url(plain_user),
        json={"modes": [{"mode_id": str(mode(MODE_SAFE).system_id),
                         "is_default": True}]},
    )

    assert db_session.query(models.UserAccessModeDenial).count() == 0


def test_a_denial_narrows_what_that_account_actually_sees(
    db_session, admin_client, plain_user, user_client, nsfw_label, hidden_anime, mode
):
    """Not just stored - felt. The account holds `borderline`, which carries
    the label, minus that label."""
    admin_client.put(
        _url(plain_user),
        json={
            "modes": [
                {
                    "mode_id": str(mode(MODE_BORDERLINE).system_id),
                    "is_default": True,
                    "denied_label_keys": [nsfw_label.key],
                }
            ]
        },
    )

    from app.services.security import create_access_token

    token = create_access_token(
        {
            "sub": plain_user.username,
            "role": "user",
            "mode": str(mode(MODE_BORDERLINE).system_id),
        }
    )
    user_client.cookies.set("access_token", f"Bearer {token}")

    assert (
        user_client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404
    )


# ---------------------------------------------------------------------------
# Decision 8: a mode is a ceiling
# ---------------------------------------------------------------------------


def test_a_denial_outside_the_mode_is_422(
    admin_client, plain_user, mode, nsfw_label
):
    """`normal` carries no labels, so denying one subtracts nothing. Storing
    it would be a no-op that looks like a setting."""
    response = admin_client.put(
        _url(plain_user),
        json={
            "modes": [
                {
                    "mode_id": str(mode(MODE_NORMAL).system_id),
                    "is_default": True,
                    "denied_label_keys": [nsfw_label.key],
                }
            ]
        },
    )

    assert response.status_code == 422


def test_a_field_group_denial_outside_the_mode_is_422(
    admin_client, plain_user, mode
):
    """`safe` does not carry sources_restricted, so denying it is meaningless."""
    response = admin_client.put(
        _url(plain_user),
        json={
            "modes": [
                {
                    "mode_id": str(mode(MODE_SAFE).system_id),
                    "is_default": True,
                    "denied_field_group_keys": ["sources_restricted"],
                }
            ]
        },
    )

    assert response.status_code == 422


def test_two_defaults_is_422_not_a_500(admin_client, plain_user, mode):
    """ix_one_default_mode_per_user would raise; refuse it as the payload
    error it is."""
    response = admin_client.put(
        _url(plain_user),
        json={
            "modes": [
                {"mode_id": str(mode(MODE_SAFE).system_id), "is_default": True},
                {"mode_id": str(mode(MODE_NORMAL).system_id), "is_default": True},
            ]
        },
    )

    assert response.status_code == 422


def test_an_unknown_mode_is_422(admin_client, plain_user, mode):
    response = admin_client.put(
        _url(plain_user),
        json={"modes": [{"mode_id": str(uuid.uuid4()), "is_default": True}]},
    )
    assert response.status_code == 422


def test_an_empty_set_is_allowed(db_session, admin_client, plain_user, mode):
    """Holding no mode resolves the EMPTY object set - fail-closed, and a
    legitimate way to park an account without deleting it."""
    response = admin_client.put(_url(plain_user), json={"modes": []})

    assert response.status_code == 200
    assert _held(db_session, plain_user) == {}


def test_a_super_may_not_assign_modes(super_client, plain_user, mode):
    """The authorization surface, so admin.authz."""
    assert (
        super_client.put(_url(plain_user), json={"modes": []}).status_code == 401
    )


# ---------------------------------------------------------------------------
# A new account starts narrow
# ---------------------------------------------------------------------------


def test_a_new_account_holds_safe_and_only_safe(db_session, admin_client, mode):
    """Decision 4. An invitee starts narrow and is widened deliberately - the
    opposite of starting wide and being narrowed if anyone remembers."""
    role_id = str(
        db_session.query(models.Role).filter(models.Role.name == "user").one().system_id
    )

    response = admin_client.post(
        "/api/users/",
        json={"username": "invitee", "password": "hunter2xyz", "role_id": role_id},
    )

    assert response.status_code == 201
    created = (
        db_session.query(models.User)
        .filter(models.User.username == "invitee")
        .one()
    )
    held = _held(db_session, created)
    assert set(held) == {MODE_SAFE}
    assert held[MODE_SAFE].is_default is True


def test_a_new_account_can_actually_see_something(db_session, admin_client, mode):
    """The reason this is not left to an admin to remember. An account holding
    NO mode resolves the empty object set - correct, fail-closed, and a
    terrible first impression that looks like a broken site."""
    from app.services.rbac.modes import resolve_mode

    role_id = str(
        db_session.query(models.Role).filter(models.Role.name == "user").one().system_id
    )
    admin_client.post(
        "/api/users/",
        json={"username": "invitee2", "password": "hunter2xyz", "role_id": role_id},
    )
    created = (
        db_session.query(models.User)
        .filter(models.User.username == "invitee2")
        .one()
    )

    resolved = resolve_mode(db_session, created, mode(MODE_SAFE).system_id)

    assert resolved.mode_key == MODE_SAFE
    assert resolved.field_groups
