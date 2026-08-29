"""
Role permission sets, cached in process.

Permissions are resolved from the database on every request rather than carried
in the JWT, so that revoking one takes effect immediately instead of whenever
the viewer's cookie happens to expire - there is no refresh flow or token
blacklist to bolt onto. That choice costs a query per request, which this
removes for all but the first.

Single-process by design (Cloud Run runs one app per instance). Every write in
the roles and content-label routers calls bump(); a second instance would need
a short TTL instead.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from app import models

_CACHE: dict[UUID, frozenset[str]] = {}


def bump() -> None:
    """Drop the cache. Called by every write that changes a grant."""
    _CACHE.clear()


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
