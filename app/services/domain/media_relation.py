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
from app.services.domain.watch_order import (
    entry_exists,  # noqa: F401 (re-export)
    list_candidate_entries,
)
from app.utils.media_resolver import MEDIA_TABLES, entry_ref_for, resolve_entries
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


def _node_key(media_type: str, entry_id: UUID) -> str:
    """
    The canvas's identity for an entry.

    Type-qualified because each media table has its own system_id space, so an
    id alone cannot name a node. Matches the "type:id" convention the admin
    page already uses for its picker.
    """
    return f"{media_type}:{entry_id}"


def graph_for_scope(
    db: Session,
    franchise_ids: List[UUID],
    series_ids: Optional[List[UUID]] = None,
) -> Dict[str, Any]:
    """
    Every node and edge one relations canvas draws.

    Entries with no relations are included on purpose: you cannot drag a line
    from a node that is not drawn, and connecting an unconnected entry is the
    page's main job.

    Relation endpoints falling outside the scope come back as ghost nodes, so a
    cross-franchise link is visible as structure rather than hidden behind a
    count. They are resolved in one batch, so a heavily linked franchise never
    degrades into an N+1.

    `series_ids` narrows the node set to the middle tier, which is what the
    series hub's read-only graph draws. Scoping that tightly makes ghosts the
    normal case rather than the exception: a sibling series in the same
    franchise is out of scope, so a link into it arrives as a ghost node.
    """
    candidates = list_candidate_entries(db, franchise_ids, series_ids=series_ids)

    nodes: List[Dict[str, Any]] = []
    in_scope: set = set()
    for c in candidates:
        endpoint = (c["media_type"], c["entry_id"])
        in_scope.add(endpoint)
        ref = MEDIA_TABLES.get(c["media_type"])
        nodes.append(
            {
                "key": _node_key(*endpoint),
                "media_type": c["media_type"],
                "entry_id": c["entry_id"],
                "in_scope": True,
                "missing": False,
                "display_name": c["display_name"],
                "search_names": c["search_names"],
                "cover_image_file": c["cover_image_file"],
                "franchise_id": c["franchise_id"],
                "nav_path": (
                    f"{ref.nav_path}/{c['entry_id']}"
                    if ref and ref.nav_path
                    else None
                ),
                "type_label": ref.label if ref else None,
            }
        )

    entry_ids = [c["entry_id"] for c in candidates]
    rows = (
        db.query(MediaRelation)
        .filter(
            or_(
                MediaRelation.from_id.in_(entry_ids),
                MediaRelation.to_id.in_(entry_ids),
            )
        )
        .order_by(MediaRelation.created_at)
        .all()
        if entry_ids
        else []
    )
    # The id filter above ignores the type discriminator, which SQL cannot
    # express against seven tables at once. Re-check the pair here so a row
    # whose id happens to collide across tables is not drawn on this canvas.
    rows = [
        row
        for row in rows
        if (row.from_type, row.from_id) in in_scope
        or (row.to_type, row.to_id) in in_scope
    ]

    # One batched resolve for every endpoint the scope does not already hold.
    outside: List[Endpoint] = []
    for row in rows:
        for endpoint in ((row.from_type, row.from_id), (row.to_type, row.to_id)):
            if endpoint not in in_scope and endpoint not in outside:
                outside.append(endpoint)

    resolved = resolve_entries(db, outside)
    for media_type, entry_id in outside:
        ref = entry_ref_for(resolved, media_type, entry_id)
        nodes.append(
            {
                "key": _node_key(media_type, entry_id),
                "media_type": media_type,
                "entry_id": entry_id,
                "in_scope": False,
                "missing": ref.missing,
                "display_name": ref.display_name,
                "search_names": [],
                "cover_image_file": ref.cover_image_file,
                "franchise_id": ref.franchise_id,
                "nav_path": ref.nav_path,
                "type_label": ref.label,
            }
        )

    edges: List[Dict[str, Any]] = []
    for row in rows:
        kind = RELATION_KINDS.get(row.relation_type)
        edges.append(
            {
                "system_id": row.system_id,
                "from": _node_key(row.from_type, row.from_id),
                "to": _node_key(row.to_type, row.to_id),
                "relation_type": row.relation_type,
                # A kind restored from a sheet written by a newer version shows
                # its raw key rather than blanking the edge.
                "label": kind.label if kind else row.relation_type,
                "inverse_label": (
                    kind.inverse_label if kind else row.relation_type
                ),
                "family": kind.family if kind else "derivation",
                "remark": row.remark,
            }
        )

    return {"nodes": nodes, "edges": edges}
