"""
Write-through for the `remark` field.

`remark` is no longer a column on the ten owner tables: it is the singleton
`remark` row in `note`. The Add form, the Modify form and the hub RemarkModal
still post a plain `remark` string to the owner's own endpoint, so every write
path pops it out of the payload and lands it here instead.

Reads go the other way, through the `remark` column_property attached in
app/models/__init__.py. That property is read-only by construction, which is
why assigning to it must never be attempted.
"""

import uuid
from typing import Any, Optional, Tuple

from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import Note

REMARK_SECTION = "remark"


def pop_remark(data: dict) -> Tuple[dict, Optional[str], bool]:
    """
    Split `remark` out of a write payload.

    Returns the payload without it, its value, and whether the key was present
    at all. The third value matters: a PATCH that never mentions `remark` must
    leave the note row alone, while a PUT that sends null must clear it.
    """
    if "remark" not in data:
        return data, None, False
    rest = {k: v for k, v in data.items() if k != "remark"}
    return rest, data["remark"], True


def upsert_remark(
    db: Session, owner_type: str, owner_id: Any, text: Optional[str]
) -> None:
    """
    Create, update or clear one owner's singleton remark note.

    Empty or whitespace-only text deletes the row rather than storing a blank
    one, so a cleared remark leaves no empty section on the notes page. The
    text itself is stored as typed - only the emptiness test is stripped.
    """
    row = (
        db.query(Note)
        .filter(
            Note.owner_type == owner_type,
            Note.owner_id == owner_id,
            Note.section == REMARK_SECTION,
        )
        .first()
    )

    if not (text or "").strip():
        if row:
            db.delete(row)
        return

    if row:
        row.content = text
        row.updated_at = get_taipei_now()
        return

    db.add(
        Note(
            system_id=uuid.uuid4(),
            owner_type=owner_type,
            owner_id=owner_id,
            section=REMARK_SECTION,
            content=text,
            sort_index=0.0,
        )
    )
