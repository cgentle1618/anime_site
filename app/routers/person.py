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
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/person", tags=["Person Management"])


def _to_response(db: Session, person: models.Person) -> schemas.PersonResponse:
    credit_count = (
        db.query(models.MediaCredit)
        .filter(models.MediaCredit.person_id == person.system_id)
        .count()
    )
    return schemas.PersonResponse(
        system_id=person.system_id,
        name_native=person.name_native,
        name_en=person.name_en,
        name_cn=person.name_cn,
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
    people = query.order_by(models.Person.name_native).distinct().all()
    return [_to_response(db, person) for person in people]


@router.get(
    "/{system_id}", response_model=schemas.PersonResponse, summary="Get Person by ID"
)
def get_person_by_id(system_id: UUID, db: Session = Depends(get_db)):
    """Retrieves a single person by their UUID."""
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")
    return _to_response(db, person)


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.PersonResponse, summary="Create Person")
def create_person(
    payload: schemas.PersonCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Creates a new person, along with the roles they should be offered under."""
    data = payload.model_dump(exclude={"roles"})
    person = models.Person(**data)
    db.add(person)
    db.flush()

    for role_in in payload.roles:
        db.add(
            models.PersonRole(
                person_id=person.system_id, role=role_in.role, scope=role_in.scope
            )
        )

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
    for role_in in payload.roles:
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
