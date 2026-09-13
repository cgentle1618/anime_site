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

# The counters that were NOT NULL DEFAULT 0 on their detail table. On
# user_media_list every field is nullable, so an entry the viewer has no row
# for would otherwise read back None where the column always said 0 - and the
# response schemas still declare them `int`, not `int | None`. "Read zero
# chapters" and "never opened it" are the same thing today; inventing a
# distinction here would be a data change dressed up as a move.
#
# anime/tv_shows/cartoons `ep_fin` is deliberately absent: it was nullable on
# those tables, so None is a value it always could have had.
LIST_FIELD_DEFAULTS: dict[str, int] = {
    "vol_fin": 0,
    "vol_fin_page": 0,
    "ch_fin": 0,
    "arc_fin": 0,
    "ch_fin_in_arc": 0,
    "issue_fin": 0,
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
    Whose list the request reads and writes. None when nobody is asking.

    There is deliberately **no fallback**. Steps 1 and 2 kept one - an
    unresolved viewer became the lowest-username admin - so that the list
    columns stayed visible on the public pages while the data model went
    multi-user underneath. That made a stranger read one person's statuses,
    ratings and progress as though they were facts about the work, and picked
    *which* person by an accident of username sort. A status is a claim about
    somebody; with nobody asking there is no one to make it about, so the
    fields come back empty.

    `db` is now unused and kept in the signature on purpose: eight call sites
    pass it, and the answer to "whose list is this?" is the sort of thing that
    acquires a query again later.

    Not to be confused with installation_owner_id() below, which answers a
    different question and does still name somebody.
    """
    if viewer is not None and getattr(viewer, "user_id", None) is not None:
        return viewer.user_id
    return None


def installation_owner_id(db: Session) -> Optional[UUID]:
    """
    Whose rows a restore or a pipeline writes. NOT a visibility rule.

    A Sheets restore and the Calculate pipeline both have to file their rows
    under an account: the sheet holds one person's collection and carries no
    owner column, and `user_media_list.user_id` is NOT NULL. That is a
    data-ownership question, and it survives the removal of the visibility
    fallback because it was never the same question - it just happened to
    share an implementation, which is how a stranger came to be shown somebody
    else's ratings.

    The answer is DATA: `users.is_installation_owner`, a partial-unique flag
    so at most one account holds it. It used to be the account named `admin`,
    which is how every personal row in the first installation came to belong
    to an administrative account (revision o1a1ownerflag moved them). An admin
    administers; it does not carry a library, and the two questions are not
    the same one.

    The two fallbacks are for a database where nobody holds the flag - a fresh
    install, or a restore from a sheet backed up before the column existed:
    the alphabetically-first NON-root account, then the
    alphabetically-first account of any kind. Never None while any account
    exists, because `user_media_list.user_id` is NOT NULL and a restore has to
    file its rows somewhere. The second fallback can therefore still name an
    admin, on a database that has no other account - which is right: a sheet
    must restore onto a fresh machine before a second account exists on it.

    Nothing on a request path may call this. If a route needs to know who is
    asking, the answer is acting_user_id() and it is allowed to be None.
    """
    owner = (
        db.query(models.User)
        .filter(models.User.is_installation_owner)
        .first()
    )
    if owner is None:
        owner = (
            db.query(models.User)
            .join(models.Role, models.User.role_id == models.Role.system_id)
            .filter(~models.Role.is_root)
            .order_by(models.User.username)
            .first()
        )
    if owner is None:
        owner = db.query(models.User).order_by(models.User.username).first()
    return owner.id if owner is not None else None


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

    A `user_id` of None means **nobody is asking**, and that is not the same
    thing as "asked, and has not touched this". The default status is a claim
    about a person - "Might Watch" says somebody might - so with no person it
    is not made: every personal field is left unset, and the response schemas
    render them null. Setting the default here instead would print
    "Might Watch" against every entry in the library to a logged-out visitor,
    which reads as a statement rather than an absence.
    """
    if user_id is None:
        return

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
                if value is None and field in LIST_FIELD_DEFAULTS:
                    value = LIST_FIELD_DEFAULTS[field]
            setattr(entry, field, value)


def attach_unit_ratings(db: Session, media_type: str, entries, user_id) -> None:
    """Put the reader's per-unit rating back on each of a novel's units.

    Task 20 moved novel_unit.my_rating to user_novel_unit_rating, but
    NovelUnitResponse still declares my_rating and reads it off the ORM object
    - so without this every unit serialises as None. The same trick
    attach_list_fields uses, one level down.

    Novel-only, and one query for every unit of every entry passed, not one
    per unit.
    """
    if media_type != "novel":
        return
    if isinstance(entries, Iterable) and not hasattr(entries, "system_id"):
        items = list(entries)
    else:
        items = [entries]
    units = [u for e in items for u in (getattr(e, "units", None) or [])]
    if not units:
        return

    rows = {}
    if user_id is not None:
        rows = {
            r.unit_id: r.my_rating
            for r in db.query(models.UserNovelUnitRating)
            .filter(
                models.UserNovelUnitRating.user_id == user_id,
                models.UserNovelUnitRating.unit_id.in_([u.system_id for u in units]),
            )
            .all()
        }
    for unit in units:
        unit.my_rating = rows.get(unit.system_id)


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
