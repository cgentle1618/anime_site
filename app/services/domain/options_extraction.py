"""
Reconcile the option vocabulary with what entries actually reference.

Before the options redesign this was six near-identical functions, one per
media type, each with its own hand-maintained category map. Two of those maps
disagreed with the frontend about a category name ("TV Official Source" vs
"TV Show Official Source"), so extracted values landed in a category no
dropdown read. There is now one map - credit_roles.TAG_FIELDS - and one pass
over it, so that class of drift cannot recur.

Since media_tag holds a foreign key, a tag row cannot name a value that does
not exist. What this pass still does is make sure every referenced value
carries a scope row for the media type referencing it, so scoped dropdowns
offer it.
"""

import logging

from sqlalchemy.orm import Session

from app import models
from app.utils.credit_roles import TAG_FIELDS

logger = logging.getLogger(__name__)


def extract_system_options(db: Session) -> dict:
    """
    Ensure every referenced option carries a scope row for its media type.

    Purely ADDITIVE, and deliberately so (Ruling R27): a value's scopes are
    admin-managed data, so a reconcile pass may widen what a value is offered
    in but must never narrow it. Nothing here removes a scope row.

    The already-present pairs are read ONCE into a local set rather than
    re-read from `option.scopes` per tag. That relationship is loaded on first
    access and no autoflush fires between two `db.add()` calls, so a second tag
    naming the same (option, media type) - two anime sharing the genre
    "Action", the common case on any real database - would see a stale empty
    collection, add a duplicate, and blow up on uq_system_option_scope at
    commit. Calculate calls this seven times, so that was a 500 on the first
    Calculate after any restore.
    """
    existing = {
        (row.option_id, row.scope)
        for row in db.query(models.SystemOptionScope).all()
    }
    known_options = {
        option_id for (option_id,) in db.query(models.SystemOption.system_id).all()
    }

    added = 0
    for tag in db.query(models.MediaTag).all():
        if TAG_FIELDS.get(tag.field) is None:
            continue
        if tag.option_id not in known_options:
            continue
        pair = (tag.option_id, tag.media_type)
        if pair in existing:
            continue
        db.add(
            models.SystemOptionScope(option_id=tag.option_id, scope=tag.media_type)
        )
        existing.add(pair)
        added += 1

    if added:
        db.commit()

    logger.info("extract_system_options: added %s scope rows.", added)
    return {
        "status": "success",
        "message": f"Added {added} missing option scope rows.",
    }
