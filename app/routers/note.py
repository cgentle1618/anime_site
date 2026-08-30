"""
routers/note.py
Handles all operations for Notes - the structured commentary attached to a
media entry or to a collection, franchise or series.

A note references its owner with an (owner_type, owner_id) pair rather than a
foreign key, because no single FK spans the ten owner tables; resolution goes
through OWNER_TABLES rather than the entry-only MEDIA_TABLES.

Every write is validated against app/utils/note_sections.NOTE_SECTIONS, which
is the authority on what a section is. That is the point of the table: the
shape used to live in seven frontend config files, where nothing could enforce
it.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_current_admin, get_db
from app.schemas.note import sections_out, validate_note_payload
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.field_gate import gated_note_sections
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.data_control_utils import log_deleted_record
from app.utils.media_resolver import MEDIA_TABLES, OWNER_TABLES
from app.utils.note_sections import NOTE_SECTIONS, section_by_key

router = APIRouter(prefix="/api/notes", tags=["Note Management"])

# Registry position, used to sort a listing the way the page renders it.
_SECTION_ORDER = {s.key: i for i, s in enumerate(NOTE_SECTIONS)}


# ==========================================
# HELPERS
# ==========================================


def _validate_owner_type(owner_type: Optional[str]) -> None:
    """Ten valid owners: the seven media entries plus the three grouping tiers."""
    if owner_type and owner_type not in OWNER_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown owner_type '{owner_type}'."
        )


def _get_or_404(db: Session, note_id: str) -> models.Note:
    db_note = db.query(models.Note).filter(models.Note.system_id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found.")
    return db_note


def _validate_or_422(payload: schemas.NoteBase) -> None:
    try:
        validate_note_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _reject_second_singleton(
    db: Session, payload: schemas.NoteBase, exclude_id: Optional[str] = None
) -> None:
    """
    A singleton section holds at most one row per owner.

    Enforced here rather than in the schema layer because it needs a query.
    """
    section = section_by_key(payload.section or "")
    if not section or not section.singleton:
        return
    query = db.query(models.Note).filter(
        models.Note.owner_type == payload.owner_type,
        models.Note.owner_id == payload.owner_id,
        models.Note.section == section.key,
    )
    if exclude_id:
        query = query.filter(models.Note.system_id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=422,
            detail=f"This owner already has a '{section.key}' note.",
        )


def _next_sort_index(db: Session, payload: schemas.NoteBase) -> float:
    """Append to the end of its section."""
    last = (
        db.query(models.Note.sort_index)
        .filter(
            models.Note.owner_type == payload.owner_type,
            models.Note.owner_id == payload.owner_id,
            models.Note.section == payload.section,
            models.Note.sort_index.isnot(None),
        )
        .order_by(models.Note.sort_index.desc())
        .first()
    )
    if not last or last[0] is None:
        return 0.0
    return float(last[0]) + 1.0


def _ordered(notes: List[models.Note]) -> List[models.Note]:
    """Registry order first, then sort_index within a section."""
    return sorted(
        notes,
        key=lambda n: (
            _SECTION_ORDER.get(n.section, len(_SECTION_ORDER)),
            n.sort_index if n.sort_index is not None else 0.0,
        ),
    )


# ==========================================
# PUBLIC READS
# ==========================================


@router.get("/sections", response_model=List[schemas.NoteSectionOut])
def get_sections(owner_type: str = Query(...)):
    """The section registry, resolved for one owner type, in display order."""
    _validate_owner_type(owner_type)
    return sections_out(owner_type)


@router.get("", response_model=List[schemas.NoteResponse])
def list_notes(
    owner_type: str = Query(...),
    owner_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Every note for one owner, ordered the way the page renders them."""
    _validate_owner_type(owner_type)
    # An owner may be a grouping tier, which carries no labels; entry_visible
    # only has an opinion about the eight media types.
    if owner_type in MEDIA_TABLES and not entry_visible(
        db, viewer, owner_type, owner_id
    ):
        raise HTTPException(status_code=404, detail="Owner not found.")
    query = db.query(models.Note).filter(
        models.Note.owner_type == owner_type, models.Note.owner_id == owner_id
    )
    # A withheld section is absent rather than blanked: an empty card would
    # advertise that there is something here to not-see.
    withheld = gated_note_sections(viewer)
    if withheld:
        query = query.filter(models.Note.section.notin_(withheld))
    return _ordered(query.all())


# ==========================================
# ADMIN CRUD
# ==========================================


@router.post("", response_model=schemas.NoteResponse, status_code=201)
def create_note(
    payload: schemas.NoteCreate,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    _validate_or_422(payload)
    _reject_second_singleton(db, payload)

    data = payload.model_dump(exclude_unset=True)
    if data.get("sort_index") is None:
        data["sort_index"] = _next_sort_index(db, payload)

    db_note = models.Note(system_id=uuid.uuid4(), **data)
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


# Declared before "/{note_id}" on purpose: FastAPI matches in declaration order,
# so the dynamic route would otherwise swallow "reorder" as a note id.
#
# No frontend calls this yet - the half-built reorder plumbing was removed as
# dead code. The endpoint is intentional surface kept for a future reorder UI
# (it is covered by tests); do not delete it as unused.
@router.patch("/reorder")
def reorder_notes(
    payload: schemas.NoteReorder,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Rewrite sort_index for one section of one owner, in the order given."""
    _validate_owner_type(payload.owner_type)
    if section_by_key(payload.section) is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown note section '{payload.section}'."
        )

    rows = (
        db.query(models.Note)
        .filter(
            models.Note.owner_type == payload.owner_type,
            models.Note.owner_id == payload.owner_id,
            models.Note.section == payload.section,
        )
        .all()
    )
    by_id = {r.system_id: r for r in rows}
    if set(payload.ordered_ids) != set(by_id):
        raise HTTPException(
            status_code=400,
            detail="ordered_ids must name exactly the notes in this section.",
        )

    for position, note_id in enumerate(payload.ordered_ids):
        by_id[note_id].sort_index = float(position)
    db.commit()
    return {"status": "success", "reordered": len(payload.ordered_ids)}


@router.patch("/{note_id}", response_model=schemas.NoteResponse)
def update_note(
    note_id: str,
    payload: schemas.NoteUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    db_note = _get_or_404(db, note_id)
    data = payload.model_dump(exclude_unset=True)

    # Validate the row as it WILL be, before mutating anything - a partial
    # update can still land on an invalid combination, and a check that runs
    # after the mutation lets autoflush write the unvalidated row into the
    # open transaction. This also preserves the existing behavior that a PATCH
    # may change owner_type/owner_id: data.get(..., current) picks up an
    # incoming owner if one is supplied, so section-applicability is checked
    # against the NEW owner.
    # Built from NoteUpdate's own field list rather than a hand-written one:
    # every field of the schema is also a column of `note`, so a field added to
    # the shape (the `status` dropdown was the first) is merged here without
    # this function being touched. The hand-written list silently dropped
    # `status`, which made a PATCH on a status-only music row - every row the
    # op/ed/insert/ost migration created - validate as empty and 422.
    merged = schemas.NoteUpdate(
        **{
            name: data.get(name, getattr(db_note, name))
            for name in schemas.NoteUpdate.model_fields
        }
    )
    _validate_or_422(merged)
    _reject_second_singleton(db, merged, exclude_id=note_id)

    for key, value in data.items():
        setattr(db_note, key, value)
    db_note.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_note)
    return db_note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    db_note = _get_or_404(db, note_id)

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, db_note, "Note")

    db.delete(db_note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
