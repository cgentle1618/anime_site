"""
Shared PATCH semantics for the free-form ``payload: dict = Body(...)`` handlers.

A PATCH body may only touch real, writable columns of the target row.
``hasattr``-based loops let ``system_id``, ``created_at``, relationship
attributes and SQLAlchemy internals through, so a typo'd or hostile key became
a column write. Protected keys are a 422; keys that are not columns at all
(relationship names, virtual fields a caller forgot to strip) are ignored, so
an older SPA bundle cannot break on a harmless extra key.
"""

import logging

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Server-owned columns no client may set through PATCH.
PROTECTED_COLUMNS = frozenset({"system_id", "id", "created_at", "updated_at"})


def apply_column_patch(entry, payload: dict) -> None:
    """Sets ``payload`` keys on ``entry`` if they are writable columns.

    Raises 422 for protected columns; silently skips non-column keys.
    """
    columns = {c.name for c in entry.__table__.columns}
    protected = sorted(k for k in payload if k in PROTECTED_COLUMNS)
    if protected:
        raise HTTPException(
            status_code=422,
            detail=f"Field(s) cannot be set through PATCH: {', '.join(protected)}",
        )
    for key, value in payload.items():
        if key in columns:
            setattr(entry, key, value)
        else:
            logger.debug("PATCH ignored non-column key %r on %s", key, type(entry).__name__)
