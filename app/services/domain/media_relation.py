"""
Media relation normalization and resolution.

Two jobs. First, turning the direction an admin typed into the one direction
that gets stored, so that one fact is always one row and the unique constraint
can actually catch a duplicate entered from the other side. Second, reading one
entry's relations from both endpoints and labelling each row for the side it is
being read from.

Resolution happens here rather than in the page because a relation may point at
any of the seven media tables and across franchises, so the frontend has no
reason to already hold the referenced entry.
"""

from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models import MediaRelation
from app.services.domain.watch_order import entry_exists  # noqa: F401 (re-export)
from app.utils.media_resolver import entry_ref_for, resolve_entries
from app.utils.relation_kinds import INPUT_ONLY_KINDS, RELATION_KINDS


Endpoint = Tuple[str, UUID]


def normalize_relation(
    from_type: str,
    from_id: UUID,
    kind: str,
    to_type: str,
    to_id: UUID,
) -> Tuple[str, UUID, str, str, UUID]:
    """
    Turns a typed-in relation into its stored form.

    Two rewrites can happen:

    1. `prequel` is not a stored kind. "B's prequel is A" is the same fact as
       "A is the sequel of B", so the kind becomes `sequel` and the endpoints
       swap.
    2. A symmetric kind means the same thing both ways, so its endpoints are
       sorted. Without this, A-alt-B and B-alt-A would be two rows the unique
       constraint could not see as duplicates.

    Every other kind is directional and stored exactly as given: which of two
    movies is the Director's Cut is the point of the relation.
    """
    if kind in INPUT_ONLY_KINDS:
        kind = INPUT_ONLY_KINDS[kind]
        from_type, from_id, to_type, to_id = to_type, to_id, from_type, from_id

    if RELATION_KINDS[kind].symmetric:
        if (to_type, str(to_id)) < (from_type, str(from_id)):
            from_type, from_id, to_type, to_id = to_type, to_id, from_type, from_id

    return from_type, from_id, kind, to_type, to_id


def find_duplicate(
    db: Session,
    from_type: str,
    from_id: UUID,
    relation_type: str,
    to_type: str,
    to_id: UUID,
    exclude_id: Optional[UUID] = None,
) -> Optional[MediaRelation]:
    """
    The existing row this one would collide with, if any.

    Checked before insert so the API can answer 409 with a useful message
    instead of letting uq_media_relation_pair surface as a 500. Arguments must
    already be normalized. `exclude_id` lets PATCH ignore the row being edited.
    """
    query = db.query(MediaRelation).filter(
        MediaRelation.from_type == from_type,
        MediaRelation.from_id == from_id,
        MediaRelation.relation_type == relation_type,
        MediaRelation.to_type == to_type,
        MediaRelation.to_id == to_id,
    )
    if exclude_id is not None:
        query = query.filter(MediaRelation.system_id != exclude_id)
    return query.first()


def _touching(media_type: str, entry_id: UUID):
    """The filter matching rows with this entry at either endpoint."""
    return or_(
        and_(
            MediaRelation.from_type == media_type,
            MediaRelation.from_id == entry_id,
        ),
        and_(
            MediaRelation.to_type == media_type,
            MediaRelation.to_id == entry_id,
        ),
    )


def relations_for_entry(
    db: Session, media_type: str, entry_id: UUID
) -> List[Dict[str, Any]]:
    """
    Every relation touching this entry, from both endpoints, each labelled for
    the side it is being read from.

    `other` is always the entry at the far end, resolved to display data or
    flagged missing, and `label` describes *that* entry, not the one being
    viewed - which is what the detail pages have always rendered.

    So the labels invert from what the stored row says. A row reads
    "`from` is the {label} of `to`". Viewing `from`, the far entry is `to`,
    which makes it the *inverse*: if A is the Sequel of B, then from A's page B
    is the Prequel. Viewing `to` gives the kind's own label.
    """
    rows = (
        db.query(MediaRelation)
        .filter(_touching(media_type, entry_id))
        .order_by(MediaRelation.created_at)
        .all()
    )

    # One batched resolve for every far endpoint, so a heavily linked entry
    # never degrades into an N+1.
    others: List[Endpoint] = []
    forwards: List[bool] = []
    for row in rows:
        forward = row.from_type == media_type and row.from_id == entry_id
        forwards.append(forward)
        others.append(
            (row.to_type, row.to_id) if forward else (row.from_type, row.from_id)
        )

    resolved = resolve_entries(db, others)

    payload: List[Dict[str, Any]] = []
    for row, forward, other in zip(rows, forwards, others):
        kind = RELATION_KINDS.get(row.relation_type)
        ref = entry_ref_for(resolved, other[0], other[1])
        payload.append(
            {
                "system_id": row.system_id,
                "relation_type": row.relation_type,
                # Describes `other`, so it is the inverse of the stored kind
                # when the viewed entry is the row's `from` side.
                "label": (
                    (kind.inverse_label if forward else kind.label)
                    if kind
                    # A kind restored from a sheet written by a newer version
                    # shows its raw key rather than blanking the row.
                    else row.relation_type
                ),
                "family": kind.family if kind else "derivation",
                "direction": "forward" if forward else "reverse",
                "remark": row.remark,
                "other": {
                    "media_type": ref.media_type,
                    "entry_id": ref.entry_id,
                    "missing": ref.missing,
                    "display_name": ref.display_name,
                    "label": ref.label,
                    "cover_image_file": ref.cover_image_file,
                    "franchise_id": ref.franchise_id,
                    "nav_path": ref.nav_path,
                },
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )
    return payload
