"""
Which entries a viewer may see.

Two gates, always applied together by apply_entry_visibility so no caller can
wire one and forget the other:

  media type  the viewer holds media_type.<key>, or the whole type disappears
  labels      the entry carries no label whose label.<key> the viewer lacks

Both are expressed in SQL. Filtering in Python after .limit()/.offset() would
silently shrink pages - a list of 500 would return 498 and the next page would
start in the wrong place - so the anti-join has to run in the database.
"""

from typing import Iterable, Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Query, Session

from app import models
from app.services.rbac.permissions import label_perm, media_type_perm
from app.services.rbac.resolver import Viewer
from app.utils.media_resolver import MEDIA_TABLES


def hidden_label_ids(db: Session, viewer: Viewer) -> list[UUID]:
    """
    content_label rows whose permission the viewer lacks.

    An empty list is the overwhelmingly common case - no labels defined, or a
    viewer who holds them all - and every caller short-circuits on it, so the
    feature costs one cheap query when unused and nothing at all for an admin.
    """
    if viewer.is_superuser:
        return []
    return [
        system_id
        for system_id, key in db.query(
            models.ContentLabel.system_id, models.ContentLabel.key
        ).all()
        if not viewer.has(label_perm(key))
    ]


def _label_anti_join(model, media_type: str, hidden: list[UUID]):
    return ~sa.exists().where(
        sa.and_(
            models.MediaContentLabel.media_type == media_type,
            models.MediaContentLabel.entry_id == model.system_id,
            models.MediaContentLabel.label_id.in_(hidden),
        )
    )


def apply_entry_visibility(
    query: Query, model, media_type: str, db: Session, viewer: Optional[Viewer]
) -> Query:
    """Narrow a media-entry query to what `viewer` may see."""
    if viewer is None or viewer.is_superuser:
        return query
    if not viewer.has(media_type_perm(media_type)):
        return query.filter(sa.false())
    hidden = hidden_label_ids(db, viewer)
    if not hidden:
        return query
    return query.filter(_label_anti_join(model, media_type, hidden))


def entry_visible(
    db: Session, viewer: Optional[Viewer], media_type: str, entry_id
) -> bool:
    """
    Whether one entry may be seen. Callers 404 rather than 403 on False, using
    their own existing not-found message, so a hidden entry is indistinguishable
    from a missing one.
    """
    if viewer is None or viewer.is_superuser:
        return True
    if not viewer.has(media_type_perm(media_type)):
        return False
    hidden = hidden_label_ids(db, viewer)
    if not hidden:
        return True
    return (
        db.query(models.MediaContentLabel.system_id)
        .filter(
            models.MediaContentLabel.media_type == media_type,
            models.MediaContentLabel.entry_id == entry_id,
            models.MediaContentLabel.label_id.in_(hidden),
        )
        .first()
        is None
    )


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
    if viewer is None or viewer.is_superuser or not pairs:
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

    labelled = {
        (row.media_type, row.entry_id)
        for row in db.query(
            models.MediaContentLabel.media_type, models.MediaContentLabel.entry_id
        ).filter(
            models.MediaContentLabel.label_id.in_(hidden),
            sa.tuple_(
                models.MediaContentLabel.media_type,
                models.MediaContentLabel.entry_id,
            ).in_([(mt, eid) for mt, eid in allowed]),
        )
    }
    return allowed - labelled


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
    if viewer is None or viewer.is_superuser:
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
