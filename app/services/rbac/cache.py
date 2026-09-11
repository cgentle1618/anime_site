"""
Role permission sets and access-mode item sets, cached in process.

Permissions are resolved from the database on every request rather than carried
in the JWT, so that revoking one takes effect immediately instead of whenever
the viewer's cookie happens to expire - there is no refresh flow or token
blacklist to bolt onto. That choice costs a query per request, which this
removes for all but the first.

Single-process by design: the app runs as one process, so one dict is the whole
cache. Every write in the roles and content-label routers calls bump(); running
a second instance would need a short TTL instead.

THREE caches now, and ONE bump() that clears all of them. The mode caches are
keyed the way the role cache is - on the thing that is shared, not on the
account - because adding the user to a key would make the cache unbounded in
accounts and destroy the sharing that makes it worth having:

  _CACHE          role_id             -> the role's permissions
  _MODE_CACHE     mode_id             -> the mode's labels and field groups,
                                         shared by everyone holding it, hot
  _DENIAL_CACHE   user_access_mode_id -> that pair's denials, usually empty

A bump() that cleared only the first would leave a revoked mode live until
restart, and would leak mode state between tests in a way whose failures are
random and order-dependent.
"""

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.orm import Session

from app import models

if TYPE_CHECKING:  # pragma: no cover
    from app.services.rbac.modes import ModeSets

_CACHE: dict[UUID, frozenset[str]] = {}
_MODE_CACHE: dict[UUID, "ModeSets"] = {}
_DENIAL_CACHE: dict[UUID, "ModeSets"] = {}


def bump() -> None:
    """Drop every cache. Called by every write that changes a grant - role
    permissions, access-mode items, and per-account denials alike."""
    _CACHE.clear()
    _MODE_CACHE.clear()
    _DENIAL_CACHE.clear()


def permissions_for(db: Session, role_id: UUID) -> frozenset[str]:
    cached = _CACHE.get(role_id)
    if cached is not None:
        return cached
    granted = frozenset(
        row.permission
        for row in db.query(models.RolePermission.permission).filter(
            models.RolePermission.role_id == role_id
        )
    )
    _CACHE[role_id] = granted
    return granted


def mode_sets(db: Session, mode_id: UUID) -> "ModeSets":
    """
    What one mode carries: its content labels and its field groups.

    Shared by everyone holding the mode, so this is the hot one. Imported
    lazily because modes.py imports this module for exactly these two
    functions.
    """
    cached = _MODE_CACHE.get(mode_id)
    if cached is not None:
        return cached

    from app.services.rbac.modes import ModeSets

    labels = frozenset(
        row.label_id
        for row in db.query(models.AccessModeLabel.label_id).filter(
            models.AccessModeLabel.mode_id == mode_id
        )
    )
    groups = frozenset(
        row.field_group_key
        for row in db.query(models.AccessModeFieldGroup.field_group_key).filter(
            models.AccessModeFieldGroup.mode_id == mode_id
        )
    )
    sets = ModeSets(label_ids=labels, field_groups=groups)
    _MODE_CACHE[mode_id] = sets
    return sets


def denials_for(db: Session, user_access_mode_id: UUID) -> "ModeSets":
    """
    What one (account, mode) pair subtracts from its mode. Usually empty.

    Same shape as mode_sets because resolution is a set difference.
    """
    cached = _DENIAL_CACHE.get(user_access_mode_id)
    if cached is not None:
        return cached

    from app.services.rbac.modes import ModeSets

    rows = db.query(
        models.UserAccessModeDenial.label_id,
        models.UserAccessModeDenial.field_group_key,
    ).filter(models.UserAccessModeDenial.user_access_mode_id == user_access_mode_id)
    labels, groups = set(), set()
    for label_id, field_group_key in rows:
        if label_id is not None:
            labels.add(label_id)
        if field_group_key is not None:
            groups.add(field_group_key)
    sets = ModeSets(label_ids=frozenset(labels), field_groups=frozenset(groups))
    _DENIAL_CACHE[user_access_mode_id] = sets
    return sets
