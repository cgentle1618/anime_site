"""POST /api/auth/access-mode - changing the active access mode mid-session.

THE FIRST TEST IS THE ONE THAT MATTERS. A reissued cookie must carry the
ORIGINAL token's `exp`. If switching minted a fresh 24-hour token, toggling
safe -> normal -> safe would be an unlimited session-extension oracle, and the
flat 24-hour lifetime - which has no refresh flow and no revocation - would
stop meaning anything. It is invisible to manual testing and to every form of
checking except decoding both tokens and comparing. It is written first on
purpose: the happy path passing is what makes people stop looking.
"""

import jwt
import pytest

from app import models
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)
from app.services.security import ALGORITHM, SECRET_KEY

SWITCH = "/api/auth/access-mode"


def _claims(client):
    """Decode the cookie the client is currently holding.

    The value is `Bearer <jwt>`, and because it contains a space the server
    sends it QUOTED - so a reissued cookie reads as '"Bearer ey..."' while the
    one a fixture set by hand does not. Strip both, or the assertion that
    matters fails on a padding error instead of on the expiry.
    """
    raw = client.cookies["access_token"].strip('"')
    if raw.startswith("Bearer "):
        raw = raw[len("Bearer ") :]
    return jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])


# ---------------------------------------------------------------------------
# The session-extension oracle
# ---------------------------------------------------------------------------


def test_switching_keeps_the_original_expiry(mode_client, mode, admin_user, grant_mode):
    grant_mode(admin_user, MODE_SAFE)
    c = mode_client(MODE_NORMAL)
    before = _claims(c)["exp"]

    response = c.post(SWITCH, json={"mode_id": str(mode(MODE_SAFE).system_id)})

    assert response.status_code == 200
    assert _claims(c)["exp"] == before


def test_toggling_repeatedly_never_extends_the_session(
    mode_client, mode, admin_user, grant_mode
):
    """The oracle in its actual shape.

    Narrow, widen back, narrow again. Knowing the password makes every hop
    legitimate - which is the point: the password stops an ATTACKER toggling,
    it does not stop the account holder, and the account holder toggling must
    not be able to extend their own session indefinitely. The widening hops
    carry the password precisely so this test exercises the path that could
    mint a fresh token rather than the one that refuses.
    """
    grant_mode(admin_user, MODE_SAFE)
    c = mode_client(MODE_NORMAL)
    before = _claims(c)["exp"]

    for key in (MODE_SAFE, MODE_NORMAL, MODE_SAFE, MODE_NORMAL):
        response = c.post(
            SWITCH,
            json={"mode_id": str(mode(key).system_id), "password": "testpass"},
        )
        assert response.status_code == 200

    assert _claims(c)["exp"] == before


# ---------------------------------------------------------------------------
# Narrowing is free, widening is not
# ---------------------------------------------------------------------------


def test_narrowing_needs_no_password(mode_client, mode, admin_user, grant_mode):
    grant_mode(admin_user, MODE_SAFE)
    c = mode_client(MODE_NORMAL)

    assert c.post(SWITCH, json={"mode_id": str(mode(MODE_SAFE).system_id)}).status_code == 200
    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_SAFE


def test_widening_bare_is_refused_with_a_marker(
    mode_client, mode, admin_user, grant_mode, nsfw_label
):
    """401 with `requires_password` so the SPA prompts rather than guesses."""
    grant_mode(admin_user, MODE_BORDERLINE)
    c = mode_client(MODE_NORMAL)

    response = c.post(SWITCH, json={"mode_id": str(mode(MODE_BORDERLINE).system_id)})

    assert response.status_code == 401
    assert response.json()["requires_password"] is True


def test_widening_leaves_the_session_where_it_was(
    mode_client, mode, admin_user, grant_mode, nsfw_label
):
    """A refused switch must not half-apply."""
    grant_mode(admin_user, MODE_BORDERLINE)
    c = mode_client(MODE_NORMAL)

    c.post(SWITCH, json={"mode_id": str(mode(MODE_BORDERLINE).system_id)})

    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_NORMAL


def test_widening_with_the_wrong_password_is_refused(
    mode_client, mode, admin_user, grant_mode, nsfw_label
):
    grant_mode(admin_user, MODE_BORDERLINE)
    c = mode_client(MODE_NORMAL)

    response = c.post(
        SWITCH,
        json={
            "mode_id": str(mode(MODE_BORDERLINE).system_id),
            "password": "not-the-password",
        },
    )

    assert response.status_code == 401


def test_widening_with_the_right_password_succeeds(
    mode_client, mode, admin_user, grant_mode, nsfw_label
):
    grant_mode(admin_user, MODE_BORDERLINE)
    c = mode_client(MODE_NORMAL)

    response = c.post(
        SWITCH,
        json={
            "mode_id": str(mode(MODE_BORDERLINE).system_id),
            "password": "testpass",
        },
    )

    assert response.status_code == 200
    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_BORDERLINE


def test_widening_with_the_right_password_still_keeps_the_expiry(
    mode_client, mode, admin_user, grant_mode, nsfw_label
):
    """Re-authenticating proves who you are; it does not buy a new 24 hours."""
    grant_mode(admin_user, MODE_BORDERLINE)
    c = mode_client(MODE_NORMAL)
    before = _claims(c)["exp"]

    c.post(
        SWITCH,
        json={
            "mode_id": str(mode(MODE_BORDERLINE).system_id),
            "password": "testpass",
        },
    )

    assert _claims(c)["exp"] == before


# ---------------------------------------------------------------------------
# Refusals that are not about the password
# ---------------------------------------------------------------------------


def test_switching_to_an_ungranted_mode_is_refused_and_not_as_a_password_problem(
    db_session, mode_client, admin_user
):
    """The account may not use this mode AT ALL. Answering `requires_password`
    would invite the SPA to prompt for a password that cannot help."""
    c = mode_client(MODE_SAFE)
    other = models.AccessMode(key="ungranted", label="Ungranted")
    db_session.add(other)
    db_session.flush()

    response = c.post(SWITCH, json={"mode_id": str(other.system_id)})

    assert response.status_code == 404
    assert response.json().get("requires_password") is not True


def test_switching_to_a_mode_that_does_not_exist_answers_the_same(
    mode_client, admin_user
):
    """Indistinguishable from an ungranted one: which modes exist is not this
    caller's business."""
    import uuid

    c = mode_client(MODE_SAFE)
    ungranted = c.post(SWITCH, json={"mode_id": str(uuid.uuid4())})

    assert ungranted.status_code == 404


def test_a_guest_may_not_switch(client, mode, access_modes):
    response = client.post(SWITCH, json={"mode_id": str(mode(MODE_SAFE).system_id)})
    assert response.status_code == 401


@pytest.mark.parametrize("key", [MODE_SAFE, MODE_NORMAL, MODE_UNRESTRICTED])
def test_switching_to_the_active_mode_is_a_no_op_not_a_widening(
    mode_client, mode, key, nsfw_label
):
    c = mode_client(key)
    assert c.post(SWITCH, json={"mode_id": str(mode(key).system_id)}).status_code == 200
