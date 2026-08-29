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
    """Ensure every referenced option carries a scope row for its media type."""
    added = 0
    for tag in db.query(models.MediaTag).all():
        spec = TAG_FIELDS.get(tag.field)
        if spec is None:
            continue
        option = db.get(models.SystemOption, tag.option_id)
        if option is None:
            continue
        if tag.media_type not in {s.scope for s in option.scopes}:
            db.add(
                models.SystemOptionScope(
                    option_id=option.system_id, scope=tag.media_type
                )
            )
            added += 1

    if added:
        db.commit()

    logger.info("extract_system_options: added %s scope rows.", added)
    return {
        "status": "success",
        "message": f"Added {added} missing option scope rows.",
    }
