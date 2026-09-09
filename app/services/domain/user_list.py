"""
Reading and writing one user's list row.

Step 1 moved the personal columns off the nine detail tables into
user_media_list. The response schemas did not change - AnimeResponse still
declares watching_status, my_rating and ep_fin - so something has to put those
values back on the ORM instance before it is serialized, and take them back off
a write payload before it is applied to the detail model. That is this module.

The three status columns collapse into one `status`, so every function here is
keyed by the hyphenated media type: STATUS_FIELD says which payload key means
`status` for this type, LIST_FIELDS says which keys live on the list row at
all. Nothing else in the codebase may hard-code that mapping.
"""

import uuid
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.database import get_taipei_now

# Which payload key carries the status, per hyphenated media type.
STATUS_FIELD: dict[str, str] = {
    "anime": "watching_status",
    "anime-movie": "watching_status",
    "movie": "watching_status",
    "tv-show": "watching_status",
    "cartoon": "watching_status",
    "manga": "reading_status",
    "novel": "reading_status",
    "comic": "reading_status",
    "game": "playing_status",
}

# The NOT NULL default each detail column carried before it moved. Copied from
# the models and from pull.py's insert defaults; a new list row starts here.
DEFAULT_STATUS: dict[str, str] = {
    "anime": "Might Watch",
    "anime-movie": "Might Watch",
    "movie": "Might Watch",
    "tv-show": "Might Watch",
    "cartoon": "Might Watch",
    "manga": "Might Read",
    "novel": "Might Read",
    "comic": "Might Read",
    "game": "Might Play",
}

# Every payload key that lives on the list row, per type. The status key is
# included and is translated to `status` on the way in and back on the way out.
LIST_FIELDS: dict[str, tuple[str, ...]] = {
    "anime": ("watching_status", "my_rating", "ep_fin", "my_watch_day", "completed_at"),
    "anime-movie": ("watching_status", "my_rating", "completed_at"),
    "movie": ("watching_status", "my_rating", "completed_at"),
    "tv-show": ("watching_status", "my_rating", "ep_fin", "completed_at"),
    "cartoon": ("watching_status", "my_rating", "ep_fin", "completed_at"),
    "manga": (
        "reading_status", "my_rating", "vol_fin", "vol_fin_page", "ch_fin",
        "completed_at",
    ),
    "novel": (
        "reading_status", "my_rating", "vol_fin", "arc_fin", "ch_fin",
        "ch_fin_in_arc", "progress_display", "completed_at",
    ),
    "comic": ("reading_status", "my_rating", "issue_fin", "completed_at"),
    "game": ("playing_status", "my_rating", "completed_at"),
}


def acting_user_id(db: Session, viewer) -> Optional[UUID]:
    """
    Whose list the request reads and writes.

    Until Step 2 ships real accounts there is exactly one person's data and a
    logged-out visitor sees it, so an unresolved viewer falls back to the admin
    user rather than to nothing. Removing that fallback IS Step 2; keeping it
    here is what makes Step 1 invisible to the SPA and to a guest.
    """
    if viewer is not None and getattr(viewer, "user_id", None) is not None:
        return viewer.user_id
    admin = (
        db.query(models.User)
        .join(models.Role, models.User.role_id == models.Role.system_id)
        .filter(models.Role.name == "admin")
        .order_by(models.User.username)
        .first()
    )
    return admin.id if admin is not None else None


def list_row(db: Session, user_id: Optional[UUID], media_id: UUID):
    """One user's row for one entry, or None. Never creates."""
    if user_id is None:
        return None
    return (
        db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.user_id == user_id,
            models.UserMediaList.media_id == media_id,
        )
        .first()
    )


def ensure_list_row(db: Session, user_id: UUID, media_id: UUID, media_type: str):
    """
    The user's row for this entry, created at the type's default status if it
    does not exist. Added to the session but not committed - the caller owns
    the transaction, exactly as upsert_remark does.
    """
    row = list_row(db, user_id, media_id)
    if row is not None:
        return row
    row = models.UserMediaList(
        system_id=uuid.uuid4(),
        user_id=user_id,
        media_id=media_id,
        status=DEFAULT_STATUS[media_type],
    )
    db.add(row)
    db.flush()
    return row


def _rows_by_media(db: Session, user_id: Optional[UUID], media_ids: list[UUID]) -> dict:
    """One query for a whole page of entries, never one per entry."""
    if user_id is None or not media_ids:
        return {}
    rows = (
        db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.user_id == user_id,
            models.UserMediaList.media_id.in_(media_ids),
        )
        .all()
    )
    return {row.media_id: row for row in rows}


def attach_list_fields(db: Session, media_type: str, entries, user_id) -> None:
    """
    Put the viewer's personal values back on the ORM instances before they are
    serialized.

    The response schema reads from attributes and the columns are gone, so the
    values have to be set on the object - the same trick attach_plan_flag uses
    for its virtual flags. A plain instance attribute is enough; SQLAlchemy
    does not manage it.

    An entry the viewer has no list row for gets the type's default status and
    None for everything else, which is exactly what the detail row used to
    hold for an untouched entry.
    """
    if isinstance(entries, Iterable) and not hasattr(entries, "system_id"):
        items = list(entries)
    else:
        items = [entries]
    if not items:
        return
    rows = _rows_by_media(db, user_id, [e.system_id for e in items])
    status_field = STATUS_FIELD[media_type]
    fields = LIST_FIELDS[media_type]
    for entry in items:
        row = rows.get(entry.system_id)
        for field in fields:
            if field == status_field:
                value = row.status if row is not None else DEFAULT_STATUS[media_type]
            else:
                value = getattr(row, field) if row is not None else None
            setattr(entry, field, value)


def split_list_payload(media_type: str, payload: dict) -> tuple[dict, dict]:
    """
    Split a write payload into (catalogue keys, personal keys).

    A key this type does not own stays in the catalogue half deliberately: it
    then hits the model the way it always did and raises the usual unknown-
    column error, instead of being silently dropped into a list row that has
    no meaning for it.
    """
    fields = set(LIST_FIELDS[media_type])
    catalog = {k: v for k, v in payload.items() if k not in fields}
    personal = {k: v for k, v in payload.items() if k in fields}
    return catalog, personal


def apply_list_payload(row, personal: dict, media_type: str) -> None:
    """Apply a personal payload to a list row, translating the status key."""
    status_field = STATUS_FIELD[media_type]
    for key, value in personal.items():
        if key == status_field:
            # A status is NOT NULL; a payload explicitly clearing it falls
            # back to the type's default rather than failing at COMMIT.
            row.status = value if value is not None else DEFAULT_STATUS[media_type]
        else:
            setattr(row, key, value)
    row.updated_at = get_taipei_now()


def join_list(query, model, user_id: Optional[UUID]):
    """
    Outer-join the viewer's list rows onto a media query so a filter or an
    order_by can name a personal column.

    OUTER, not inner: an entry the viewer has never touched has no row and
    must still appear in the catalogue listing. Filters that compare against a
    status therefore have to allow for NULL - see _factory's list_entries.
    """
    if user_id is None:
        return query
    return query.outerjoin(
        models.UserMediaList,
        (models.UserMediaList.media_id == model.system_id)
        & (models.UserMediaList.user_id == user_id),
    )
