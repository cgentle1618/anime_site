"""
Which entries a viewer may see.

Two gates, always applied together by apply_entry_visibility so no caller can
wire one and forget the other:

  media type  the viewer holds media_type.<key>, or the whole type disappears
              - the ROLE axis, so is_root still reaches it through has()
  labels      the entry carries no label the viewer's ACTIVE MODE lacks
              - the OBJECT axis, which is_root cannot reach at all

require_visible_media is the write-side front door to the same two gates: it
resolves an entry id to its own media type before asking, because a
caller-supplied type is not evidence of anything.

Both gates are expressed in SQL. Filtering in Python after .limit()/.offset()
would silently shrink pages - a list of 500 would return 498 and the next page would
start in the wrong place - so the anti-join has to run in the database.
"""

from typing import Iterable, Optional
from uuid import UUID

import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from app import models
from app.services.rbac.permissions import media_type_perm
from app.services.rbac.resolver import Viewer
from app.utils.media_resolver import MEDIA_TABLES


def hidden_label_ids(db: Session, viewer: Viewer) -> list[UUID]:
    """
    content_label rows the viewer's ACTIVE MODE does not carry.

    An empty list is the overwhelmingly common case - no labels defined, or a
    mode carrying them all - and every caller short-circuits on it, so the
    feature costs one cheap query when unused and nothing at all for a session
    in a wide mode. Every consumer is untouched by the Phase B change, because
    the list it receives still means exactly "labels to hide".

    NO is_root SHORT-CIRCUIT, and that is the point of the whole phase:
    holding every capability says nothing about which objects this SESSION
    reaches, so an admin sitting in a narrow mode is narrowed like anybody
    else.
    """
    visible = viewer.visible_label_ids
    return [
        system_id
        for (system_id,) in db.query(models.ContentLabel.system_id).all()
        if system_id not in visible
    ]


def _label_anti_join(model, hidden: list[UUID]):
    """
    No media_type test: media_content_label.media_id is a media.system_id,
    which is unique across all nine media tables, so matching the entry's own
    system_id already pins the type.
    """
    return ~sa.exists().where(
        sa.and_(
            models.MediaContentLabel.media_id == model.system_id,
            models.MediaContentLabel.label_id.in_(hidden),
        )
    )


def apply_entry_visibility(
    query: Query, model, media_type: str, db: Session, viewer: Optional[Viewer]
) -> Query:
    """Narrow a media-entry query to what `viewer` may see."""
    # `viewer is None` means "not a request" - internal callers pass it
    # deliberately - and must stay. The is_root half is gone: object
    # scoping left the role axis in Phase B.
    if viewer is None:
        return query
    if not viewer.has(media_type_perm(media_type)):
        return query.filter(sa.false())
    hidden = hidden_label_ids(db, viewer)
    if not hidden:
        return query
    return query.filter(_label_anti_join(model, hidden))


def apply_media_visibility(query: Query, db: Session, viewer: Optional[Viewer]):
    """
    The same two gates as apply_entry_visibility, over the `media` supertable
    rather than one detail table.

    A profile and a community aggregate both span every media type in one
    query, so the media-type check becomes an IN over the types the viewer
    holds instead of a boolean per query, and the label anti-join goes through
    media_content_label.media_id (a real FK since step 0) instead of the old
    (media_type, entry_id) pair.

    The query must already select from or join `models.Media`.
    """
    if viewer is None:
        return query

    allowed = [
        media_type
        for media_type in MEDIA_TABLES
        if viewer.has(media_type_perm(media_type))
    ]
    if not allowed:
        return query.filter(sa.false())
    query = query.filter(models.Media.media_type.in_(allowed))

    hidden = hidden_label_ids(db, viewer)
    if not hidden:
        return query
    return query.filter(
        ~sa.exists().where(
            sa.and_(
                models.MediaContentLabel.media_id == models.Media.system_id,
                models.MediaContentLabel.label_id.in_(hidden),
            )
        )
    )


def entry_visible(
    db: Session, viewer: Optional[Viewer], media_type: str, entry_id
) -> bool:
    """
    Whether one entry may be seen. Callers 404 rather than 403 on False, using
    their own existing not-found message, so a hidden entry is indistinguishable
    from a missing one.
    """
    if viewer is None:
        return True
    if not viewer.has(media_type_perm(media_type)):
        return False
    hidden = hidden_label_ids(db, viewer)
    if not hidden:
        return True
    return (
        db.query(models.MediaContentLabel.system_id)
        .filter(
            models.MediaContentLabel.media_id == entry_id,
            models.MediaContentLabel.label_id.in_(hidden),
        )
        .first()
        is None
    )


def require_visible_media(
    db: Session,
    viewer: Optional[Viewer],
    entry_id,
    detail: str,
    *,
    require_media_row: bool = False,
) -> Optional[str]:
    """
    Gate a write on the entry an id names, resolving the TYPE from the media
    row rather than trusting the caller. Returns the resolved media type, or
    None when the id names no media row at all.

    This exists because forgetting it is a security bug, and the lesson has
    not travelled by comment: three routers - quote, note and meme - take a
    (type, id) pair from the client and write against the id alone, and all
    three shipped the same defect. `Quote.media_type` and `Note.owner_type`
    are both derived from the id, and meme's `_owner_columns` writes any media
    type to the same `media_id` column; so a caller-supplied type paired with
    a client-supplied id gates the write under the WRONG media_type.<key>
    permission. The label half of entry_visible still bites (it is keyed on
    media_id), so the failure is silent and only the type axis is bypassed:
    a viewer holding media_type.movie and not media_type.anime could post
    {"owner_type": "movie", "owner_id": <an anime id>} and write onto an entry
    it cannot read. Resolving the type here makes the safe form the short one.

    An id naming no media row is NOT refused by default: a grouping tier
    (collection / franchise / series) is a legitimate owner for a meme or a
    note and carries no labels, so entry_visible has no opinion about it. That
    also waves through an id naming nothing at all, which then fails on the
    media_id foreign key - see the residuals list in docs/authorization.md.
    A caller whose id must be a media entry (quote) passes
    require_media_row=True and gets the same refusal for both.

    Raises HTTPException(404, detail) so that hidden answers exactly as
    missing, in the words the calling router already uses for missing.
    """
    if entry_id is None:
        if require_media_row:
            raise HTTPException(status_code=404, detail=detail)
        return None
    media_type = (
        db.query(models.Media.media_type)
        .filter(models.Media.system_id == entry_id)
        .scalar()
    )
    if media_type is None:
        if require_media_row:
            raise HTTPException(status_code=404, detail=detail)
        return None
    if not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail=detail)
    return media_type


def filter_visible_pairs(
    db: Session,
    viewer: Optional[Viewer],
    pairs: Iterable[tuple[str, UUID]],
) -> set[tuple[str, UUID]]:
    """
    The visible subset of many (media_type, entry_id) pairs, in one query.

    The batch form exists because the aggregate routes - quotes, memes, watch
    orders, relations - resolve a page of cross-type references at once, and
    asking per row would be an N+1 on every one of them.
    """
    pairs = {(media_type, entry_id) for media_type, entry_id in pairs}
    if viewer is None or not pairs:
        return pairs

    # A pair naming a grouping tier is not a media entry: tiers carry no
    # labels and have no media_type permission, so denying them by default
    # would blank every meme attached to a franchise.
    allowed = {
        pair
        for pair in pairs
        if pair[0] not in MEDIA_TABLES or viewer.has(media_type_perm(pair[0]))
    }
    hidden = hidden_label_ids(db, viewer)
    if not hidden or not allowed:
        return allowed

    # One id column, not a tuple: media_id is unique across the nine media
    # tables, so a pair is hidden exactly when its id carries a hidden label.
    hidden_ids = {
        media_id
        for (media_id,) in db.query(models.MediaContentLabel.media_id).filter(
            models.MediaContentLabel.label_id.in_(hidden),
            models.MediaContentLabel.media_id.in_([eid for _, eid in allowed]),
        )
    }
    return {pair for pair in allowed if pair[1] not in hidden_ids}


def drop_hidden_rows(
    db: Session,
    viewer: Optional[Viewer],
    rows: list,
    type_attr: str,
    id_attr: str,
) -> list:
    """
    The subset of `rows` whose referenced entry the viewer may see.

    Rows are DROPPED, not degraded to missing=True. A quote or meme carries its
    own text, so leaving the row and blanking the reference would still publish
    the thing worth hiding - and the UI reads missing=True as "dangling
    reference, go fix it", which would be a lie.

    A row with no reference at all (a general quote) belongs to no entry and is
    always kept.
    """
    if viewer is None:
        return list(rows)

    pairs = {
        (getattr(row, type_attr), getattr(row, id_attr))
        for row in rows
        if getattr(row, type_attr) and getattr(row, id_attr)
    }
    if not pairs:
        return list(rows)

    visible = filter_visible_pairs(db, viewer, pairs)
    kept = []
    for row in rows:
        media_type, entry_id = getattr(row, type_attr), getattr(row, id_attr)
        if not media_type or not entry_id:
            kept.append(row)
        elif (media_type, entry_id) in visible:
            kept.append(row)
    return kept
