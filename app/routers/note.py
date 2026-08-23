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

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_db, get_current_admin
from app.schemas.note import sections_out, validate_note_payload
from app.utils.media_resolver import OWNER_TABLES
from app.utils.note_sections import NOTE_SECTIONS, section_by_key

logger = logging.getLogger(__name__)

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
):
    """Every note for one owner, ordered the way the page renders them."""
    _validate_owner_type(owner_type)
    notes = (
        db.query(models.Note)
        .filter(models.Note.owner_type == owner_type, models.Note.owner_id == owner_id)
        .all()
    )
    return _ordered(notes)


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
    for key, value in data.items():
        setattr(db_note, key, value)

    # Validate the row as it will be, not just the fields that changed - a
    # partial update can still land on an invalid combination.
    merged = schemas.NoteUpdate(
        owner_type=db_note.owner_type,
        owner_id=db_note.owner_id,
        section=db_note.section,
        episode=db_note.episode,
        kind=db_note.kind,
        title=db_note.title,
        content=db_note.content,
        links=db_note.links,
        sort_index=db_note.sort_index,
    )
    try:
        validate_note_payload(merged)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    _reject_second_singleton(db, merged, exclude_id=note_id)

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
    db.delete(db_note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
