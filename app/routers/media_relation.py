"""
routers/media_relation.py
Handles Media Relations - typed, cross-media-type links between two entries.

Reads are public (a relation is ordinary catalogue data); every write is
admin-only, matching watch orders.

Replaces the prequel_id / sequel_id / alternative columns. Nothing here derives
relations automatically: they are curated on the /relations admin page.
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app import schemas
from app.dependencies import get_current_admin, get_db
from app.services.domain.media_relation import (
    entry_exists,
    find_duplicate,
    graph_for_scope,
    normalize_relation,
    relations_for_entry,
)
from app.services.domain.watch_order import list_candidate_entries
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.relation_kinds import (
    ACCEPTED_INPUT_KINDS,
    INPUT_ONLY_KINDS,
    RELATION_KINDS,
)
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/media-relation", tags=["Media Relation"])


# ==========================================
# HELPERS
# ==========================================


def _get_relation_or_404(db: Session, system_id: str) -> models.MediaRelation:
    row = (
        db.query(models.MediaRelation)
        .filter(models.MediaRelation.system_id == system_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Relation not found.")
    return row


def _validate_kind(value: str) -> None:
    """
    Rejects a kind outside the ten the dropdown offers.

    Refused rather than coerced: unlike a blank importance cell from Sheets,
    a bad kind from the editor is a bug worth surfacing.
    """
    if value not in ACCEPTED_INPUT_KINDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown relation kind '{value}'. "
                f"Expected one of: {', '.join(ACCEPTED_INPUT_KINDS)}."
            ),
        )


def _validate_endpoint(db: Session, media_type: str, entry_id) -> None:
    """Rejects an endpoint pointing at an unknown table or a missing row."""
    if media_type not in MEDIA_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media type '{media_type}'."
        )
    if entry_id is None or not entry_exists(db, media_type, entry_id):
        raise HTTPException(
            status_code=400, detail="Referenced entry does not exist."
        )


def _reject_self_and_duplicate(
    db: Session,
    from_type: str,
    from_id,
    relation_type: str,
    to_type: str,
    to_id,
    exclude_id=None,
) -> None:
    """
    Mirrors the two table constraints so a bad payload returns 409, not a 500.

    Arguments must already be normalized, which is what makes the duplicate
    check catch the same relation entered from the other side.
    """
    if from_type == to_type and from_id == to_id:
        raise HTTPException(
            status_code=409, detail="An entry cannot relate to itself."
        )
    existing = find_duplicate(
        db, from_type, from_id, relation_type, to_type, to_id, exclude_id
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "That relation already exists "
                f"(id {existing.system_id}), possibly entered from the other side."
            ),
        )


# ==========================================
# PUBLIC READS
# ==========================================


@router.get(
    "/kinds",
    response_model=List[schemas.RelationKindResponse],
    summary="List Relation Kinds",
)
def get_relation_kinds():
    """
    The vocabulary, so the admin dropdown has exactly one source of truth.

    Returns the nine stored kinds plus `prequel`, which the create endpoint
    accepts and records as a swapped `sequel` row.
    """
    payload = [
        {
            "key": kind.key,
            "label": kind.label,
            "inverse_label": kind.inverse_label,
            "family": kind.family,
            "symmetric": kind.symmetric,
            "stored_as": kind.key,
        }
        for kind in RELATION_KINDS.values()
    ]
    for input_key, stored_key in INPUT_ONLY_KINDS.items():
        stored = RELATION_KINDS[stored_key]
        payload.append(
            {
                "key": input_key,
                "label": stored.inverse_label,
                "inverse_label": stored.label,
                "family": stored.family,
                "symmetric": False,
                "stored_as": stored_key,
            }
        )
    return payload


@router.get(
    "/for-entry",
    response_model=List[schemas.MediaRelationResolved],
    summary="Get One Entry's Relations",
)
def get_relations_for_entry(
    media_type: str = Query(...),
    entry_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Every relation touching this entry, from both endpoints, already labelled
    for the side being viewed.

    Resolution is server-side because a relation may point at any of the seven
    media tables and across franchises, so the page has no reason to hold the
    referenced entry already.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media type '{media_type}'."
        )
    return relations_for_entry(db, media_type, uuid.UUID(entry_id))


@router.get(
    "",
    response_model=List[schemas.MediaRelationResponse],
    summary="List Relations In A Scope",
)
@router.get(
    "/",
    response_model=List[schemas.MediaRelationResponse],
    include_in_schema=False,
)
def list_relations_in_scope(
    franchise_id: Optional[str] = None,
    collection_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Every relation with at least one endpoint among a scope's entries.

    One request backs the admin page's per-entry count badges, instead of one
    /for-entry call per row. A collection resolves to its member franchises
    first, exactly as the watch order candidates endpoint does.
    """
    if bool(franchise_id) == bool(collection_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of franchise_id or collection_id.",
        )

    if franchise_id:
        franchise_ids = [franchise_id]
    else:
        franchise_ids = [
            row[0]
            for row in db.query(models.Franchise.system_id)
            .filter(models.Franchise.collection_id == collection_id)
            .all()
        ]

    entry_ids = [
        c["entry_id"] for c in list_candidate_entries(db, franchise_ids)
    ]
    if not entry_ids:
        return []

    return (
        db.query(models.MediaRelation)
        .filter(
            or_(
                models.MediaRelation.from_id.in_(entry_ids),
                models.MediaRelation.to_id.in_(entry_ids),
            )
        )
        .all()
    )


@router.get(
    "/graph",
    response_model=schemas.RelationGraphResponse,
    summary="Graph For A Scope",
)
def get_relation_graph(
    franchise_id: Optional[str] = None,
    collection_id: Optional[str] = None,
    series_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Everything the relations canvas draws for one group, at any of the three
    tiers.

    One request rather than two, because "which nodes does this canvas contain"
    is a single question whose answer needs the cross-table resolver - the page
    would otherwise have to synthesize the ghost set by diffing two lists.

    A series scope resolves against series_id directly rather than widening to
    the parent franchise, so the graph holds that series alone. Note anime_movie
    carries no series_id, so an anime movie can only ever appear on a series
    graph as a ghost.
    """
    scopes = [franchise_id, collection_id, series_id]
    if sum(1 for value in scopes if value) != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Provide exactly one of franchise_id, collection_id or series_id."
            ),
        )

    if series_id:
        return graph_for_scope(db, [], series_ids=[series_id])

    if franchise_id:
        franchise_ids = [franchise_id]
    else:
        franchise_ids = [
            row[0]
            for row in db.query(models.Franchise.system_id)
            .filter(models.Franchise.collection_id == collection_id)
            .all()
        ]

    return graph_for_scope(db, franchise_ids)


# ==========================================
# PROTECTED WRITES (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.MediaRelationResponse,
    status_code=201,
    summary="Create Relation",
)
def create_relation(
    payload: schemas.MediaRelationCreate,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """
    Stores one relation, normalizing the direction the admin typed.

    A `prequel` becomes a swapped `sequel`; a symmetric `alternative` has its
    endpoints sorted. Both rewrites exist so one fact is one row.
    """
    _validate_kind(payload.kind)
    _validate_endpoint(db, payload.from_type, payload.from_id)
    _validate_endpoint(db, payload.to_type, payload.to_id)

    from_type, from_id, relation_type, to_type, to_id = normalize_relation(
        payload.from_type,
        payload.from_id,
        payload.kind,
        payload.to_type,
        payload.to_id,
    )
    _reject_self_and_duplicate(
        db, from_type, from_id, relation_type, to_type, to_id
    )

    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type=from_type,
        from_id=from_id,
        relation_type=relation_type,
        to_type=to_type,
        to_id=to_id,
        remark=payload.remark,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch(
    "/{system_id}",
    response_model=schemas.MediaRelationResponse,
    summary="Update Relation",
)
def update_relation(
    system_id: str,
    payload: schemas.MediaRelationUpdate,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """
    Edits the kind or the remark.

    Changing the kind re-runs normalization, so switching Sequel to Prequel
    flips the stored endpoints rather than inventing an unstorable kind.
    """
    row = _get_relation_or_404(db, system_id)

    if payload.kind is not None:
        _validate_kind(payload.kind)
        from_type, from_id, relation_type, to_type, to_id = normalize_relation(
            row.from_type, row.from_id, payload.kind, row.to_type, row.to_id
        )
        _reject_self_and_duplicate(
            db,
            from_type,
            from_id,
            relation_type,
            to_type,
            to_id,
            exclude_id=row.system_id,
        )
        row.from_type, row.from_id = from_type, from_id
        row.relation_type = relation_type
        row.to_type, row.to_id = to_type, to_id

    if payload.remark is not None:
        row.remark = payload.remark

    db.commit()
    db.refresh(row)
    return row


@router.delete("/{system_id}", summary="Delete Relation")
def delete_relation(
    system_id: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """Removes one relation. The two entries themselves are untouched."""
    row = _get_relation_or_404(db, system_id)
    # Signature is (db, entry, entry_type), and it deliberately does not
    # commit - the delete below commits both together, as watch_order.py:904
    # does.
    log_deleted_record(db, row, "Media Relation")
    db.delete(row)
    db.commit()
    return {"status": "success", "message": "Relation deleted."}
