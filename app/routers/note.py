"""
routers/note.py
Handles all operations for Notes - the structured commentary attached to a
media entry or to a collection, franchise or series.

A note names its owner with one of four foreign keys - `media_id` for any of
the nine media types, plus one column each for collection, franchise and series
- because no single FK spans the twelve owner tables. The API still speaks the
(owner_type, owner_id) pair: `_owner_filters` and `_owner_columns` translate it
in one place, and resolution goes through OWNER_TABLES rather than the
entry-only MEDIA_TABLES.

Every write is validated against app/utils/note_sections.NOTE_SECTIONS, which
is the authority on what a section is. That is the point of the table: the
shape used to live in seven frontend config files, where nothing could enforce
it.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_db
from app.schemas.note import sections_out, validate_note_payload
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.field_gate import gated_note_sections
from app.services.rbac.permissions import (
    PERM_ADMIN,
    PERM_SELF_PERSONAL_NOTES,
    field_group_perm,
)
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.data_control_utils import log_deleted_record
from app.utils.media_resolver import MEDIA_TABLES, OWNER_TABLES, TIER_TABLES
from app.utils.note_sections import (
    NOTE_SECTIONS,
    PERSONAL_SECTIONS,
    SCOPE_PERSONAL,
    section_by_key,
)

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


_TIER_COLUMNS = {
    "collection": "collection_id",
    "franchise": "franchise_id",
    "series": "series_id",
}


def _owner_filters(owner_type: str, owner_id) -> list:
    """
    The WHERE clauses selecting one owner's notes.

    A media owner is matched on `media_id`, because note.media_id points at
    media.system_id and Step 0's backfill reused each entry's own uuid; the
    three tiers are matched on their own column directly.
    """
    if owner_type in TIER_TABLES:
        return [getattr(models.Note, _TIER_COLUMNS[owner_type]) == owner_id]
    return [models.Note.media_id == owner_id]


def _owner_columns(owner_type: str, owner_id) -> dict:
    """The column assignment writing one owner onto a new note."""
    if owner_type in TIER_TABLES:
        return {_TIER_COLUMNS[owner_type]: owner_id}
    return {"media_id": owner_id}


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
    db: Session,
    payload: schemas.NoteBase,
    exclude_id: Optional[str] = None,
    author_id: Optional[uuid.UUID] = None,
) -> None:
    """
    A singleton section holds at most one row per owner.

    Enforced here rather than in the schema layer because it needs a query.
    """
    section = section_by_key(payload.section or "")
    if not section or not section.singleton:
        return
    query = db.query(models.Note).filter(
        *_owner_filters(payload.owner_type, payload.owner_id),
        models.Note.section == section.key,
    )
    if section.scope == SCOPE_PERSONAL and author_id is not None:
        # One remark per owner PER AUTHOR. See Task 9 of the Step 5 plan for
        # why the database's index is still per-owner.
        query = query.filter(models.Note.author_id == author_id)
    if exclude_id:
        query = query.filter(models.Note.system_id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=422,
            detail=f"This owner already has a '{section.key}' note.",
        )


def _authorize_write(viewer: Viewer, section_key: Optional[str]) -> None:
    """
    Catalogue sections are admin-only; personal sections need
    self.personal_notes.

    Scope is read from the registry rather than from a list here, so a section
    reclassified in note_sections.py changes who may write it with no change to
    this file - which is the whole reason scope lives there.
    """
    section = section_by_key(section_key or "")
    if section is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown note section '{section_key}'."
        )
    if section.scope == SCOPE_PERSONAL:
        if viewer.user_id is None or not viewer.has(PERM_SELF_PERSONAL_NOTES):
            raise HTTPException(
                status_code=403, detail="You may not write personal notes."
            )
        return
    if not viewer.has(PERM_ADMIN):
        raise HTTPException(
            status_code=403, detail="Catalogue notes are written by admins."
        )


def _authorize_edit(viewer: Viewer, db_note: models.Note) -> None:
    """A personal note is edited by its author; a catalogue note by an admin."""
    section = section_by_key(db_note.section or "")
    if section is not None and section.scope == SCOPE_PERSONAL:
        if viewer.is_superuser or db_note.author_id == viewer.user_id:
            return
        raise HTTPException(
            status_code=403, detail="That note belongs to someone else."
        )
    if not viewer.has(PERM_ADMIN):
        raise HTTPException(
            status_code=403, detail="Catalogue notes are edited by admins."
        )


def _next_sort_index(db: Session, payload: schemas.NoteBase) -> float:
    """Append to the end of its section."""
    last = (
        db.query(models.Note.sort_index)
        .filter(
            *_owner_filters(payload.owner_type, payload.owner_id),
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
    # Whose personal notes to show instead of the viewer's own. Honoured only
    # for a user whose list is public, and only for a viewer holding
    # field_group.personal_notes - which is that group's new job now that
    # personal sections filter by author on the entry page.
    author: Optional[str] = Query(None),
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
    query = db.query(models.Note).filter(*_owner_filters(owner_type, owner_id))

    # Personal sections hold one set of rows per user. A viewer sees their own
    # and nobody else's; a logged-out viewer, having no id, sees none. This is
    # the read half of the scope declared in app/utils/note_sections.py -
    # catalogue sections fall through untouched, which is what "one shared set
    # of rows, read by everyone" means.
    # Whose personal rows this read is for. `author` names somebody else, and
    # is honoured only where both halves agree: their list is public AND the
    # viewer holds field_group.personal_notes. A user who is unknown, private,
    # or asked about by a viewer without the group all answer the same 403, so
    # the reply cannot be read as "this account exists".
    author_id = viewer.user_id
    if author is not None:
        owner = db.query(models.User).filter(models.User.username == author).first()
        if (
            owner is None
            or not owner.list_is_public
            or not viewer.has(field_group_perm("personal_notes"))
        ):
            raise HTTPException(
                status_code=403, detail="That user's notes are not public."
            )
        author_id = owner.id

    personal = list(PERSONAL_SECTIONS)
    if author_id is None:
        query = query.filter(models.Note.section.notin_(personal))
    else:
        query = query.filter(
            or_(
                models.Note.section.notin_(personal),
                models.Note.author_id == author_id,
            )
        )

    # A withheld section is absent rather than blanked: an empty card would
    # advertise that there is something here to not-see. Applied only to rows
    # the viewer did not write - field_group.personal_notes governs seeing
    # SOMEBODY ELSE's personal notes, and hiding a viewer's own from them is
    # not a permission, it is a bug.
    withheld = gated_note_sections(viewer)
    if withheld:
        query = query.filter(
            or_(
                models.Note.section.notin_(withheld),
                models.Note.author_id == author_id,
            )
        )
    return _ordered(query.all())


# ==========================================
# ADMIN CRUD
# ==========================================


@router.post("", response_model=schemas.NoteResponse, status_code=201)
def create_note(
    payload: schemas.NoteCreate,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    _authorize_write(viewer, payload.section)
    _validate_or_422(payload)
    _reject_second_singleton(db, payload, author_id=viewer.user_id)

    data = payload.model_dump(exclude_unset=True)
    if data.get("sort_index") is None:
        data["sort_index"] = _next_sort_index(db, payload)
    # Never taken from the payload: the author is who is asking, not who says
    # they are. NoteBase has no author_id field, so nothing can supply one.
    data.pop("author_id", None)
    # The API still speaks (owner_type, owner_id); the table speaks four FKs.
    data.pop("owner_type", None)
    data.pop("owner_id", None)
    data.update(_owner_columns(payload.owner_type, payload.owner_id))

    db_note = models.Note(system_id=uuid.uuid4(), author_id=viewer.user_id, **data)
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
    viewer: Viewer = Depends(get_viewer),
):
    """Rewrite sort_index for one section of one owner, in the order given."""
    _validate_owner_type(payload.owner_type)
    section = section_by_key(payload.section)
    if section is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown note section '{payload.section}'."
        )
    _authorize_write(viewer, payload.section)

    query = db.query(models.Note).filter(
        *_owner_filters(payload.owner_type, payload.owner_id),
        models.Note.section == payload.section,
    )
    if section.scope == SCOPE_PERSONAL:
        # Reordering somebody else's list is a write to their rows, so a
        # personal section reorders only the caller's own.
        query = query.filter(models.Note.author_id == viewer.user_id)
    rows = query.all()
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
    viewer: Viewer = Depends(get_viewer),
):
    db_note = _get_or_404(db, note_id)
    _authorize_edit(viewer, db_note)
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
    # After the merge, so a PATCH cannot move a row into a section the caller
    # may not write.
    _authorize_write(viewer, merged.section)
    _reject_second_singleton(
        db, merged, exclude_id=note_id, author_id=db_note.author_id
    )

    # owner_type / owner_id are read-only properties now, so a PATCH that
    # names them is translated into the four columns - clearing the other three
    # so the CHECK still sees exactly one.
    if "owner_type" in data or "owner_id" in data:
        columns = _owner_columns(merged.owner_type, merged.owner_id)
        for column in ("media_id", "collection_id", "franchise_id", "series_id"):
            setattr(db_note, column, columns.get(column))
    data.pop("owner_type", None)
    data.pop("owner_id", None)

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
    viewer: Viewer = Depends(get_viewer),
):
    db_note = _get_or_404(db, note_id)
    _authorize_edit(viewer, db_note)

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, db_note, "Note")

    db.delete(db_note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
