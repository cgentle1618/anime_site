"""
Read and wholesale-replace one media entry's cast.

Owns the two operations app/routers/casting.py needs: `casting_rows` (bulk
read, positioned, with photo_file already resolved) and `replace_casting`
(delete-then-insert the whole set in payload order). Validation that would
otherwise surface as a raw IntegrityError from ck_casting_voice_scope - a
seiyuu on a manga/novel casting - is rejected here in Python, before any row
is written, so the constraint is a backstop rather than the user-facing
message.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.routers.constants import CHARACTER_ROLES

# The four ACG media types character_casting.media_type may hold - a subset
# of MEDIA_TABLES's eight, per ck_casting_voice_scope's own comment.
CASTING_MEDIA_TYPES: tuple[str, ...] = ("anime", "anime-movie", "manga", "novel")

# Media types a seiyuu (person_id) may be attached to - the two with voice
# acting. Mirrors ck_casting_voice_scope exactly.
VOICED_MEDIA_TYPES: tuple[str, ...] = ("anime", "anime-movie")


class CastingValidationError(ValueError):
    """A casting payload failed a rule the CHECK constraint would also catch."""


def casting_rows(db: Session, media_type: str, entry_id: UUID) -> list[dict]:
    """
    One entry's cast, ordered by position.

    Bulk-loads the referenced characters and people in two queries total,
    regardless of cast size - not one per row - then resolves photo_file here
    (the casting's own value, falling back to the character's) so every
    reader gets the same answer without repeating the fallback.
    """
    castings = (
        db.query(models.CharacterCasting)
        .filter(
            models.CharacterCasting.media_type == media_type,
            models.CharacterCasting.entry_id == entry_id,
        )
        .order_by(models.CharacterCasting.position)
        .all()
    )
    if not castings:
        return []

    character_ids = {c.character_id for c in castings}
    characters = {
        c.system_id: c
        for c in db.query(models.Character).filter(
            models.Character.system_id.in_(character_ids)
        )
    }

    person_ids = {c.person_id for c in castings if c.person_id}
    people = (
        {
            p.system_id: p
            for p in db.query(models.Person).filter(
                models.Person.system_id.in_(person_ids)
            )
        }
        if person_ids
        else {}
    )

    rows = []
    for casting in castings:
        character = characters.get(casting.character_id)
        person = people.get(casting.person_id) if casting.person_id else None
        rows.append(
            {
                "system_id": str(casting.system_id),
                "character_id": str(casting.character_id),
                "character_name": character.display_name if character else None,
                "person_id": str(person.system_id) if person else None,
                "person_name": person.display_name if person else None,
                "role": casting.role,
                "position": casting.position,
                "photo_file": casting.photo_file
                or (character.photo_file if character else None),
                "remark": casting.remark,
            }
        )
    return rows


def _validate_row(media_type: str, row: dict) -> None:
    person_id: Optional[UUID] = row.get("person_id")
    if person_id is not None and media_type not in VOICED_MEDIA_TYPES:
        raise CastingValidationError(
            f"A seiyuu cannot be cast on a {media_type} entry."
        )
    role = row.get("role")
    if role is not None and role not in CHARACTER_ROLES:
        raise CastingValidationError(
            f"'{role}' is not a valid character role."
        )


def replace_casting(
    db: Session, media_type: str, entry_id: UUID, rows: list[dict]
) -> None:
    """
    Deletes an entry's existing castings and inserts `rows` in order.

    `position` is taken from list index when a row omits it, so callers may
    submit an ordered list without stamping positions themselves. Raises
    CastingValidationError - mapped to a 422 by the router - for a media type
    outside CASTING_MEDIA_TYPES, a seiyuu on a non-voiced media type, or a
    role outside CHARACTER_ROLES, so the CHECK constraint is never the first
    line of defense.
    """
    if media_type not in CASTING_MEDIA_TYPES:
        raise CastingValidationError(f"Unknown casting media type: {media_type}")

    for row in rows:
        _validate_row(media_type, row)

    db.query(models.CharacterCasting).filter(
        models.CharacterCasting.media_type == media_type,
        models.CharacterCasting.entry_id == entry_id,
    ).delete(synchronize_session=False)

    for index, row in enumerate(rows):
        db.add(
            models.CharacterCasting(
                character_id=row["character_id"],
                media_type=media_type,
                entry_id=entry_id,
                person_id=row.get("person_id"),
                role=row.get("role"),
                position=row.get("position", index),
                photo_file=row.get("photo_file"),
                remark=row.get("remark"),
            )
        )
