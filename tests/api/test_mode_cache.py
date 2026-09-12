"""The two new caches, and the one thing that must never be forgotten about
them: bump() clears all three.

If it does not, mode state leaks between tests and the failures are random and
order-dependent - which is the most expensive kind to debug.
"""

from app import models
from app.services.rbac import cache
from app.services.rbac.seed_modes import MODE_SAFE, ensure_access_mode_seed


def _safe(db):
    ensure_access_mode_seed(db)
    return db.query(models.AccessMode).filter(models.AccessMode.key == MODE_SAFE).one()


def test_mode_sets_reads_the_modes_items(db_session):
    safe = _safe(db_session)
    sets = cache.mode_sets(db_session, safe.system_id)
    assert "sources_restricted" not in sets.field_groups
    assert "sources_other" in sets.field_groups
    assert sets.label_ids == frozenset()


def test_mode_sets_is_cached(db_session):
    safe = _safe(db_session)
    first = cache.mode_sets(db_session, safe.system_id)
    assert cache.mode_sets(db_session, safe.system_id) is first


def test_bump_clears_the_mode_cache_too(db_session):
    """Every write that changes a grant already calls bump(); the new mode and
    denial writes call the same one. A bump that cleared only the role cache
    would leave a revoked mode live until restart."""
    safe = _safe(db_session)
    first = cache.mode_sets(db_session, safe.system_id)
    cache.bump()
    assert cache.mode_sets(db_session, safe.system_id) is not first


def test_denials_for_an_untouched_grant_is_empty(db_session, admin_user):
    safe = _safe(db_session)
    grant = models.UserAccessMode(user_id=admin_user.id, mode_id=safe.system_id)
    db_session.add(grant)
    db_session.flush()

    denials = cache.denials_for(db_session, grant.system_id)
    assert denials.label_ids == frozenset()
    assert denials.field_groups == frozenset()


def test_denials_for_reads_both_kinds(db_session, admin_user):
    safe = _safe(db_session)
    label = models.ContentLabel(key="cache-denial-label", label="L")
    db_session.add(label)
    db_session.flush()
    grant = models.UserAccessMode(user_id=admin_user.id, mode_id=safe.system_id)
    db_session.add(grant)
    db_session.flush()
    db_session.add(
        models.UserAccessModeDenial(
            user_access_mode_id=grant.system_id, label_id=label.system_id
        )
    )
    db_session.add(
        models.UserAccessModeDenial(
            user_access_mode_id=grant.system_id, field_group_key="sources_other"
        )
    )
    db_session.flush()
    cache.bump()

    denials = cache.denials_for(db_session, grant.system_id)
    assert denials.label_ids == frozenset({label.system_id})
    assert denials.field_groups == frozenset({"sources_other"})
