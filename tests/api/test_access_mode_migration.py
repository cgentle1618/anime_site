"""What the Phase B migration must leave behind.

These run against the create_all schema, not against Alembic - the suite has
no migration harness. They assert the POST-STATE the migration is written to
produce, so that if someone changes the grant rule and forgets the migration,
the divergence shows up here rather than on the other machine.
"""

from app import models
from app.services.rbac.modes import grant_all_modes_to_existing_accounts
from app.services.rbac.seed_modes import MODE_UNRESTRICTED, ensure_access_mode_seed


def test_every_account_holds_all_four_modes(db_session, admin_user, plain_user):
    """Behaviour-neutral on the day it lands: `unrestricted` is the faithful
    mapping of today's is_root, which sees everything."""
    ensure_access_mode_seed(db_session)
    grant_all_modes_to_existing_accounts(db_session)

    for user in (admin_user, plain_user):
        held = (
            db_session.query(models.UserAccessMode)
            .filter(models.UserAccessMode.user_id == user.id)
            .all()
        )
        assert len(held) == 4
        defaults = [row for row in held if row.is_default]
        assert len(defaults) == 1
        assert (
            db_session.get(models.AccessMode, defaults[0].mode_id).key
            == MODE_UNRESTRICTED
        )


def test_granting_twice_does_not_duplicate(db_session, admin_user):
    ensure_access_mode_seed(db_session)
    grant_all_modes_to_existing_accounts(db_session)
    grant_all_modes_to_existing_accounts(db_session)

    assert (
        db_session.query(models.UserAccessMode)
        .filter(models.UserAccessMode.user_id == admin_user.id)
        .count()
        == 4
    )


def test_an_account_that_already_holds_a_mode_is_left_alone(db_session, admin_user):
    """Re-running must never overwrite a choice - including which mode is the
    login default."""
    ensure_access_mode_seed(db_session)
    safe = (
        db_session.query(models.AccessMode)
        .filter(models.AccessMode.key == "safe")
        .one()
    )
    db_session.add(
        models.UserAccessMode(
            user_id=admin_user.id, mode_id=safe.system_id, is_default=True
        )
    )
    db_session.flush()

    grant_all_modes_to_existing_accounts(db_session)

    held = (
        db_session.query(models.UserAccessMode)
        .filter(models.UserAccessMode.user_id == admin_user.id)
        .all()
    )
    assert len(held) == 1
    assert held[0].is_default is True
