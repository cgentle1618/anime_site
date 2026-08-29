"""
Resolve names to entities and replace an entry's link rows.

Every writer goes through here: the data migration, the credits API, Fill/Pull
and the Sheets restore. That is the point - an entity name arriving from Tenrai
must land on the same row as the one typed into the Add form, and matching on
the normalized key is what makes that true.

replace_* is a whole-set replace rather than an add: the entry forms submit
every value for a field at once, so a diff against what is stored is the only
way "the user removed one name" can be expressed.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.utils.credit_roles import CREDIT_ROLES, TAG_FIELDS, director_scope_for
from app.utils.name_normalize import normalize_name, split_names

logger = logging.getLogger(__name__)


def _find_by_name(db: Session, model, name: str):
    """
    Find an entity whose stored name normalizes to the same key.

    Linear scan over the whole table in Python rather than a SQL filter -
    normalize_name folds width/case/whitespace in ways SQL can't express
    portably, and these tables are small enough that this stays cheap.
    """
    key = normalize_name(name)
    for row in db.query(model).all():
        if normalize_name(row.name_native) == key:
            return row
        if row.name_en and normalize_name(row.name_en) == key:
            return row
    return None


def resolve_person(
    db: Session, name: str, *, role: str, scope: Optional[str] = None
) -> models.Person:
    """Find or create the person, and make sure they hold the given role."""
    person = _find_by_name(db, models.Person, name)
    if person is None:
        person = models.Person(name_native=name.strip())
        db.add(person)
        db.flush()

    held = {(r.role, r.scope) for r in person.roles}
    if (role, scope) not in held:
        db.add(
            models.PersonRole(person_id=person.system_id, role=role, scope=scope)
        )
        db.flush()
        db.refresh(person)
    return person


def resolve_studio(db: Session, name: str) -> models.Studio:
    """Find or create the studio."""
    studio = _find_by_name(db, models.Studio, name)
    if studio is None:
        studio = models.Studio(name_native=name.strip())
        db.add(studio)
        db.flush()
    return studio


def resolve_option(
    db: Session, category: str, value: str, *, scope: Optional[str] = None
) -> models.SystemOption:
    """Find or create the vocabulary value, and record the scope it is used in."""
    key = normalize_name(value)
    option = next(
        (
            o
            for o in db.query(models.SystemOption).filter_by(category=category).all()
            if normalize_name(o.value) == key
        ),
        None,
    )
    if option is None:
        option = models.SystemOption(category=category, value=value.strip())
        db.add(option)
        db.flush()

    if scope and scope not in {s.scope for s in option.scopes}:
        db.add(
            models.SystemOptionScope(option_id=option.system_id, scope=scope)
        )
        db.flush()
        db.refresh(option)
    return option


def replace_credits(
    db: Session, media_type: str, entry_id: UUID, role: str, names: list[str]
) -> None:
    """Make the entry's credits for one role exactly `names`, in that order."""
    spec = CREDIT_ROLES[role]

    db.query(models.MediaCredit).filter_by(
        media_type=media_type, entry_id=entry_id, role=role
    ).delete(synchronize_session=False)

    for position, name in enumerate(names):
        if spec.target == "studio":
            target = resolve_studio(db, name)
            row = models.MediaCredit(
                media_type=media_type,
                entry_id=entry_id,
                role=role,
                studio_id=target.system_id,
                position=position,
            )
        else:
            scope = (
                director_scope_for(media_type)
                if spec.person_role == "director"
                else None
            )
            target = resolve_person(
                db, name, role=spec.person_role, scope=scope
            )
            row = models.MediaCredit(
                media_type=media_type,
                entry_id=entry_id,
                role=role,
                person_id=target.system_id,
                position=position,
            )
        db.add(row)
    db.flush()


def replace_tags(
    db: Session, media_type: str, entry_id: UUID, field: str, values: list[str]
) -> None:
    """Make the entry's tags for one field exactly `values`, in that order."""
    spec = TAG_FIELDS[field]

    db.query(models.MediaTag).filter_by(
        media_type=media_type, entry_id=entry_id, field=field
    ).delete(synchronize_session=False)

    for position, value in enumerate(values):
        option = resolve_option(db, spec.category, value, scope=media_type)
        db.add(
            models.MediaTag(
                media_type=media_type,
                entry_id=entry_id,
                field=field,
                option_id=option.system_id,
                position=position,
            )
        )
    db.flush()


def credit_names(
    db: Session, media_type: str, entry_id: UUID, role: str
) -> list[str]:
    """The entry's credited names for one role, in stored order."""
    rows = (
        db.query(models.MediaCredit)
        .filter_by(media_type=media_type, entry_id=entry_id, role=role)
        .order_by(models.MediaCredit.position)
        .all()
    )
    out = []
    for row in rows:
        if row.person_id:
            entity = db.get(models.Person, row.person_id)
        else:
            entity = db.get(models.Studio, row.studio_id)
        if entity is not None:
            out.append(entity.name_native)
    return out


def tag_values(
    db: Session, media_type: str, entry_id: UUID, field: str
) -> list[str]:
    """The entry's vocabulary values for one field, in stored order."""
    rows = (
        db.query(models.MediaTag)
        .filter_by(media_type=media_type, entry_id=entry_id, field=field)
        .order_by(models.MediaTag.position)
        .all()
    )
    out = []
    for row in rows:
        option = db.get(models.SystemOption, row.option_id)
        if option is not None:
            out.append(option.value)
    return out


def credits_to_sheet_value(
    db: Session, media_type: str, entry_id: UUID, role: str
) -> str:
    """Comma-joined names, the shape the entry sheet columns keep."""
    return ", ".join(credit_names(db, media_type, entry_id, role))


def tags_to_sheet_value(
    db: Session, media_type: str, entry_id: UUID, field: str
) -> str:
    """Comma-joined values, the shape the entry sheet columns keep."""
    return ", ".join(tag_values(db, media_type, entry_id, field))


def names_from_sheet_value(raw: Optional[str]) -> list[str]:
    """Split one comma-joined sheet cell back into names."""
    return split_names(raw)
