"""resolve_mode, in isolation.

The four branches of the resolution order, plus the two that matter most: a
revoked mode resolves to NOTHING rather than to the account's default, and a
logged-out visitor resolves to `safe` and to nothing else, whatever the
database holds. Both are the fail-closed direction, and both would be
invisible in manual testing.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache
from app.services.rbac.modes import EMPTY_MODE, resolve_mode
from app.services.rbac.seed_modes import (
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
    ensure_access_mode_seed,
)


@pytest.fixture
def label(db_session):
    row = models.ContentLabel(key="resolution-label", label="L")
    db_session.add(row)
    db_session.flush()
    ensure_access_mode_seed(db_session)
    cache.bump()
    return row


def _mode(db, key):
    return db.query(models.AccessMode).filter(models.AccessMode.key == key).one()


def _grant(db, user, mode, is_default=False):
    row = models.UserAccessMode(
        user_id=user.id, mode_id=mode.system_id, is_default=is_default
    )
    db.add(row)
    db.flush()
    return row


def test_a_granted_mode_resolves_to_its_sets(db_session, admin_user, label):
    mode = _mode(db_session, MODE_UNRESTRICTED)
    _grant(db_session, admin_user, mode)

    resolved = resolve_mode(db_session, admin_user, mode.system_id)

    assert resolved.mode_key == MODE_UNRESTRICTED
    assert resolved.label_ids == frozenset({label.system_id})
    assert "sources_restricted" in resolved.field_groups


def test_denials_subtract(db_session, admin_user, label):
    mode = _mode(db_session, MODE_UNRESTRICTED)
    grant = _grant(db_session, admin_user, mode)
    db_session.add(
        models.UserAccessModeDenial(
            user_access_mode_id=grant.system_id, label_id=label.system_id
        )
    )
    db_session.flush()
    cache.bump()

    resolved = resolve_mode(db_session, admin_user, mode.system_id)

    assert resolved.label_ids == frozenset()
    assert "sources_restricted" in resolved.field_groups


def test_a_mode_the_account_does_not_hold_resolves_to_nothing(
    db_session, admin_user, label
):
    """NOT to the account's default. Falling back to is_default could WIDEN a
    session: sitting in `safe` when an admin revokes `safe` would hand the
    viewer `unrestricted` with no password."""
    unheld = _mode(db_session, MODE_UNRESTRICTED)
    _grant(db_session, admin_user, _mode(db_session, MODE_SAFE), is_default=True)

    assert resolve_mode(db_session, admin_user, unheld.system_id) == EMPTY_MODE


def test_an_unknown_mode_id_resolves_to_nothing(db_session, admin_user, label):
    assert resolve_mode(db_session, admin_user, uuid.uuid4()) == EMPTY_MODE


def test_a_logged_in_account_with_no_claim_resolves_to_nothing(
    db_session, admin_user, label
):
    """A signed-in caller does NOT fall through to the guest default: that
    would be a fallback that can widen, and the guest mode is not this
    account's policy."""
    _grant(db_session, admin_user, _mode(db_session, MODE_SAFE), is_default=True)
    assert resolve_mode(db_session, admin_user, None) == EMPTY_MODE


def test_no_user_resolves_to_safe(db_session, label):
    resolved = resolve_mode(db_session, None, None)
    assert resolved.mode_key == MODE_SAFE
    assert "sources_restricted" not in resolved.field_groups


def test_the_anonymous_policy_is_not_stored_anywhere(db_session, label):
    """`safe` is looked up by key, so there is no row an edit could move.

    The flag this replaced was ordinary data: a Pull All, a migration or a
    hand-edit could point it at `unrestricted`, and that failure publishes
    every labelled entry to the internet while looking like a successful
    restore. Nothing on the table decides this any more.
    """
    assert not hasattr(models.AccessMode, "is_guest_default")

    # The mirror, so a green above is not just the attribute being renamed:
    # widening every OTHER mode changes nothing about what a guest reaches.
    for key in (MODE_UNRESTRICTED, MODE_NORMAL):
        _mode(db_session, key).sort_order = -1
    db_session.flush()
    cache.bump()

    assert resolve_mode(db_session, None, None).mode_key == MODE_SAFE


def test_a_missing_safe_mode_resolves_to_nothing(db_session, label):
    """Fail closed. A misconfiguration must hide everything, not publish it."""
    db_session.query(models.AccessMode).filter(
        models.AccessMode.key == MODE_SAFE
    ).delete(synchronize_session=False)
    db_session.flush()
    cache.bump()

    assert resolve_mode(db_session, None, None) == EMPTY_MODE
