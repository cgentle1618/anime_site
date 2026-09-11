"""The four seeded modes.

`safe` is today's guest exactly - GUEST_WITHHELD_FIELD_GROUPS is
{"sources_restricted"} and nothing else - so the day this lands, a logged-out
visitor sees precisely what they saw the day before. That property is the
whole reason Phase B is safe to ship before Phase D gives anyone a way to
change a mode.
"""

from app import models
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
    ensure_access_mode_seed,
)


def _mode(db, key):
    return db.query(models.AccessMode).filter(models.AccessMode.key == key).one()


def _field_groups(db, mode):
    return {
        row.field_group_key
        for row in db.query(models.AccessModeFieldGroup).filter(
            models.AccessModeFieldGroup.mode_id == mode.system_id
        )
    }


def test_seeds_four_system_modes(db_session):
    ensure_access_mode_seed(db_session)
    keys = {m.key for m in db_session.query(models.AccessMode)}
    assert keys == {MODE_UNRESTRICTED, MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE}
    assert all(m.is_system for m in db_session.query(models.AccessMode))


def test_safe_is_the_guest_default_and_the_only_one(db_session):
    ensure_access_mode_seed(db_session)
    flagged = [
        m.key
        for m in db_session.query(models.AccessMode).filter(
            models.AccessMode.is_guest_default.is_(True)
        )
    ]
    assert flagged == [MODE_SAFE]


def test_safe_withholds_restricted_sources_and_nothing_else(db_session):
    """The one step that changes what a REACHABLE entry shows. The top three
    tiers differ only in which entries exist for you."""
    ensure_access_mode_seed(db_session)
    assert _field_groups(db_session, _mode(db_session, MODE_SAFE)) == (
        set(FIELD_GROUP_KEYS) - {"sources_restricted"}
    )
    for key in (MODE_NORMAL, MODE_BORDERLINE, MODE_UNRESTRICTED):
        assert _field_groups(db_session, _mode(db_session, key)) == set(
            FIELD_GROUP_KEYS
        )


def test_unrestricted_carries_every_label_and_normal_carries_none(db_session):
    label = models.ContentLabel(key="nsfw-seedtest", label="NSFW")
    db_session.add(label)
    db_session.flush()
    ensure_access_mode_seed(db_session)

    def labels(key):
        return {
            row.label_id
            for row in db_session.query(models.AccessModeLabel).filter(
                models.AccessModeLabel.mode_id == _mode(db_session, key).system_id
            )
        }

    assert labels(MODE_UNRESTRICTED) == {label.system_id}
    assert labels(MODE_BORDERLINE) == {label.system_id}
    assert labels(MODE_NORMAL) == set()
    assert labels(MODE_SAFE) == set()


def test_is_idempotent(db_session):
    """The lifespan runs against a database that may already hold these rows,
    and it must not duplicate or overwrite them."""
    ensure_access_mode_seed(db_session)
    ensure_access_mode_seed(db_session)
    assert db_session.query(models.AccessMode).count() == 4
    assert (
        db_session.query(models.AccessModeFieldGroup)
        .filter(
            models.AccessModeFieldGroup.mode_id
            == _mode(db_session, MODE_SAFE).system_id
        )
        .count()
        == len(FIELD_GROUP_KEYS) - 1
    )


def test_does_not_hand_back_an_item_an_admin_removed(db_session):
    """Same rule ensure_rbac_seed already follows for guest: top up a mode
    holding NOTHING, never a mode somebody has deliberately narrowed."""
    ensure_access_mode_seed(db_session)
    safe = _mode(db_session, MODE_SAFE)
    db_session.query(models.AccessModeFieldGroup).filter(
        models.AccessModeFieldGroup.mode_id == safe.system_id,
        models.AccessModeFieldGroup.field_group_key == "credits",
    ).delete(synchronize_session=False)
    db_session.flush()

    ensure_access_mode_seed(db_session)

    assert "credits" not in _field_groups(db_session, safe)
