"""
routers/person.py
CRUD for people credited on media entries, plus scoped role filtering and merge.

Deleting a person cascades their credits away (see MediaCredit.person_id
ondelete="CASCADE") - that is the chosen design for a genuine removal. Merge
exists because deleting is the WRONG fix for a duplicate: it repoints every
credit and unions the person_role rows onto the survivor before deleting the
loser, so no credit history is lost.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db
from app.services.domain.credits import find_person
from app.services.rbac.enforcement import filter_visible_pairs
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.credit_roles import PERSON_ROLES, legal_scopes
from app.utils.name_normalize import name_slot_for

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/person", tags=["Person Management"])


def _to_response(db: Session, person: models.Person, viewer=None) -> schemas.PersonResponse:
    credit_rows = (
        db.query(models.MediaCredit.media_type, models.MediaCredit.entry_id)
        .filter(models.MediaCredit.person_id == person.system_id)
        .all()
    )
    # Count only credits on entries the viewer may see. A number is a smaller
    # leak than a title, but "worked on 3 things, you can see 2" is still one.
    credit_count = len(
        filter_visible_pairs(
            db, viewer, [(mt, eid) for mt, eid in credit_rows if mt and eid]
        )
    )
    return schemas.PersonResponse(
        system_id=person.system_id,
        name_en=person.name_en,
        name_cn=person.name_cn,
        name_jp=person.name_jp,
        name_alt=person.name_alt,
        display_name_field=person.display_name_field,
        display_name=person.display_name,
        gender=person.gender,
        my_rating=person.my_rating,
        photo_file=person.photo_file,
        remark=person.remark,
        credit_count=credit_count,
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.PersonResponse], summary="Get All People")
def get_all_people(
    role: Optional[str] = Query(default=None),
    scope: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Retrieves people, optionally filtered to those who hold a given role
    (and, for a scoped role like director, a given scope).
    """
    query = db.query(models.Person)
    if role:
        query = query.join(models.PersonRole)
        query = query.filter(models.PersonRole.role == role)
        if scope:
            query = query.filter(models.PersonRole.scope == scope)
    people = query.distinct().all()
    # Sorted in Python, not SQL: display_name is a property over four columns
    # with a per-row choice, so no single ORDER BY column can express it.
    people.sort(key=lambda p: p.display_name.casefold())
    return [_to_response(db, person, viewer) for person in people]


@router.get(
    "/role-counts",
    response_model=dict[str, int],
    summary="Count People per Role",
)
def get_role_counts(db: Session = Depends(get_db)):
    """
    How many distinct people hold each person_role, zeros included.

    Declared BEFORE /{system_id} on purpose: that route parses its path as a
    UUID, so "role-counts" would 422 there if this came second.

    Counts people, not person_role rows - a director scoped for
    all three of their media types has three rows but is one person.
    """
    tallied = dict(
        db.query(
            models.PersonRole.role,
            func.count(func.distinct(models.PersonRole.person_id)),
        )
        .group_by(models.PersonRole.role)
        .all()
    )
    return {role: tallied.get(role, 0) for role in PERSON_ROLES}


@router.get(
    "/role-scopes",
    response_model=dict[str, list[str]],
    summary="Legal Scopes per Person Role",
)
def get_role_scopes():
    """
    Which media types each person role may be scoped to.

    The person form offers exactly these, so an admin cannot give a role a
    scope naming a credit that does not exist - (composer, manga), say. Derived
    from the same CreditRole.media_types that PersonRoleIn validates against,
    so the form and the validator cannot drift.

    Not on /api/constants: that endpoint serves one flat list per key, and this
    is a map of lists. Declared BEFORE /{system_id} for the same reason
    role-counts is - that route parses its path as a UUID.
    """
    return {role: list(legal_scopes(role)) for role in PERSON_ROLES}


@router.get(
    "/{system_id}", response_model=schemas.PersonResponse, summary="Get Person by ID"
)
def get_person_by_id(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single person by their UUID."""
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")
    return _to_response(db, person, viewer)


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.PersonResponse, summary="Create Person")
def create_person(
    payload: schemas.PersonCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a person, or returns the existing one under that name with the
    requested roles added.

    Deliberately find-or-create, matching resolve_person, because this endpoint
    is not only an admin form: ensureSourceValues.js POSTs here whenever a
    typed name is missing from a ROLE-FILTERED suggestion list. Typing an
    existing producer's name into anime's Director field therefore arrives as
    a "create" for someone who already exists, and minting a second row would
    split their credits across two people. Matching is on the normalized name,
    the same key resolve_person uses, so the two writers agree.

    A payload may carry the four labelled name columns (the admin form) or one
    unslotted `name` (every other writer); see schemas.PersonCreate. An
    unslotted name is placed by name_slot_for, using the first requested role
    for context, so the column it lands in matches what resolve_person would
    have chosen for the same name.

    Metadata on an existing person is left untouched - use PUT to edit it.
    """
    data = payload.model_dump(exclude={"roles", "name"})
    lookup = payload.name or next(
        n
        for n in (
            payload.name_en, payload.name_cn, payload.name_jp, payload.name_alt
        )
        if n
    )
    person = find_person(db, lookup)
    if person is None:
        if payload.name:
            first = payload.roles[0] if payload.roles else None
            slot = name_slot_for(
                payload.name.strip(),
                role=first.role if first else "",
                scope=first.scope if first else "",
            )
            data[f"name_{slot}"] = payload.name.strip()
        person = models.Person(**data)
        db.add(person)
        db.flush()

    held = {(r.role, r.scope) for r in person.roles}
    for role_in in payload.roles:
        if (role_in.role, role_in.scope) in held:
            continue
        db.add(
            models.PersonRole(
                person_id=person.system_id, role=role_in.role, scope=role_in.scope
            )
        )
        held.add((role_in.role, role_in.scope))

    db.commit()
    db.refresh(person)
    return _to_response(db, person)


@router.put(
    "/{system_id}", response_model=schemas.PersonResponse, summary="Update Person"
)
def update_person(
    system_id: UUID,
    payload: schemas.PersonUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates a person's metadata and the set of roles they hold."""
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    data = payload.model_dump(exclude={"roles"})
    for key, value in data.items():
        setattr(person, key, value)

    db.query(models.PersonRole).filter_by(person_id=system_id).delete(
        synchronize_session=False
    )
    seen = set()
    for role_in in payload.roles:
        if (role_in.role, role_in.scope) in seen:
            continue
        seen.add((role_in.role, role_in.scope))
        db.add(
            models.PersonRole(
                person_id=system_id, role=role_in.role, scope=role_in.scope
            )
        )

    db.commit()
    db.refresh(person)
    return _to_response(db, person)


@router.delete("/{system_id}", summary="Delete Person")
def delete_person(
    system_id: UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a person. Their credits cascade away with them - see
    the merge endpoint for the correct fix when this person is a duplicate.
    """
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    db.delete(person)
    db.commit()

    return {"status": "success", "message": "Person deleted successfully."}


@router.post("/{system_id}/merge", summary="Merge Another Person Into This One")
def merge_person(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Repoint every credit and role from `source_id` onto this person, then delete
    the source. This - not delete - is the fix for a duplicate: deleting cascades
    the credits away, so merging is the only way to keep them.
    """
    if system_id == payload.source_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a person into itself."
        )

    keep = db.get(models.Person, system_id)
    drop = db.get(models.Person, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    held = {
        (c.media_type, c.entry_id, c.role)
        for c in db.query(models.MediaCredit).filter_by(person_id=system_id).all()
    }
    moved = 0
    for credit in (
        db.query(models.MediaCredit).filter_by(person_id=payload.source_id).all()
    ):
        if (credit.media_type, credit.entry_id, credit.role) in held:
            db.delete(credit)
            continue
        credit.person_id = system_id
        moved += 1

    keep_roles = {(r.role, r.scope) for r in keep.roles}
    for role_row in list(drop.roles):
        if (role_row.role, role_row.scope) not in keep_roles:
            db.add(
                models.PersonRole(
                    person_id=system_id, role=role_row.role, scope=role_row.scope
                )
            )

    db.delete(drop)
    db.commit()
    return {"status": "success", "credits_moved": moved}
