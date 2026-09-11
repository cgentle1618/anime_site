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
from app.utils.media_resolver import TIER_TABLES

REMARK_SECTION = "remark"

# The owner is four nullable FK columns on `note` now, not an (owner_type,
# owner_id) pair; callers still speak the pair, so it is translated here.
_TIER_COLUMNS = {
    "collection": "collection_id",
    "franchise": "franchise_id",
    "series": "series_id",
}


def _owner_columns(owner_type: str, owner_id: Any) -> dict:
    if owner_type in TIER_TABLES:
        return {_TIER_COLUMNS[owner_type]: owner_id}
    return {"media_id": owner_id}


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
    db: Session,
    owner_type: str,
    owner_id: Any,
    text: Optional[str],
    author_id: Any,
) -> None:
    """
    Create, update or clear one owner's singleton remark note.

    Empty or whitespace-only text deletes the row rather than storing a blank
    one, so a cleared remark leaves no empty section on the notes page. The
    text itself is stored as typed - only the emptiness test is stripped.

    `remark` is a personal-scope section, so a row belongs to its author and
    this looks up THIS author's row - not the first one for the owner. That
    author filter is half of decision 12 and must not be removed without the
    other half: ix_note_one_remark_per_owner is per-owner-per-author now, so
    without it a second account's write would silently overwrite the first
    account's remark instead of creating its own.
    """
    owner_columns = _owner_columns(owner_type, owner_id)
    row = (
        db.query(Note)
        .filter(
            *[getattr(Note, name) == value for name, value in owner_columns.items()],
            Note.section == REMARK_SECTION,
            Note.author_id == author_id,
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
            **owner_columns,
            section=REMARK_SECTION,
            content=text,
            sort_index=0.0,
            author_id=author_id,
        )
    )


# ---------------------------------------------------------------------------
# Read side
# ---------------------------------------------------------------------------


def attach_remark(db: Session, owner_type: str, entries, user_id) -> None:
    """
    Set `remark` on one entry or a page of them, filtered to this viewer.

    `remark` is a personal-scope section, so it belongs to its author. It used
    to be a class-level column_property on the ten owner models, and a scalar
    subquery cannot know who is asking - so one person's private assessment
    was served to everybody, and the database refused a second account's
    remark outright to keep that subquery single-valued. Decision 12 replaced
    both halves at once.

    ONE query for the whole page, never one per entry - the rule
    attach_list_fields and attach_link_fields already follow.

    Every entry is blanked FIRST and then filled from the query. An entry the
    query does not match must read None, not keep whatever a previous request
    left on a cached instance - and `remark` is a plain attribute now, not a
    mapped column, so nothing else would clear it.

    A viewer with no remark, and a guest (user_id None), get None. Never
    somebody else's.
    """
    rows = entries if isinstance(entries, list) else [entries]
    if not rows:
        return
    for entry in rows:
        entry.remark = None
    if user_id is None:
        return

    column = _TIER_COLUMNS.get(owner_type, "media_id")
    ids = [entry.system_id for entry in rows]
    owner_column = getattr(Note, column)
    found = {
        owner_id: content
        for owner_id, content in db.query(owner_column, Note.content).filter(
            owner_column.in_(ids),
            Note.section == REMARK_SECTION,
            Note.author_id == user_id,
        )
    }
    for entry in rows:
        if entry.system_id in found:
            entry.remark = found[entry.system_id]
