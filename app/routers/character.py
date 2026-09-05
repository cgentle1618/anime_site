"""
routers/character.py
CRUD for fictional characters, plus their per-entry castings, reverse lookup
by entry, and merge.

Deleting a character cascades their castings away (see
CharacterCasting.character_id ondelete="CASCADE") - that is the chosen design
for a genuine removal. Merge exists because deleting is the WRONG fix for a
duplicate: it repoints every casting onto the survivor before deleting the
loser, so no casting history is lost.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db
from app.services.rbac.enforcement import filter_visible_pairs
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.release_date import primary_release_value

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/character", tags=["Character Management"])


def _to_response(
    db: Session, character: models.Character, viewer=None
) -> schemas.CharacterResponse:
    casting_rows = (
        db.query(models.CharacterCasting.media_type, models.CharacterCasting.entry_id)
        .filter(models.CharacterCasting.character_id == character.system_id)
        .all()
    )
    # Count only castings on entries the viewer may see, exactly as
    # person._to_response counts credit_count - a number is a smaller leak
    # than a title, but "cast in 3 things, you can see 2" is still one.
    casting_count = len(
        filter_visible_pairs(
            db, viewer, [(mt, eid) for mt, eid in casting_rows if mt and eid]
        )
    )
    return schemas.CharacterResponse(
        system_id=character.system_id,
        name_en=character.name_en,
        name_cn=character.name_cn,
        name_jp=character.name_jp,
        name_alt=character.name_alt,
        display_name_field=character.display_name_field,
        display_name=character.display_name,
        gender=character.gender,
        my_rating=character.my_rating,
        photo_file=character.photo_file,
        remark=character.remark,
        casting_count=casting_count,
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.CharacterResponse], summary="Get All Characters"
)
def get_all_characters(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves every character."""
    characters = db.query(models.Character).all()
    # Sorted in Python, not SQL: display_name is a property over four columns
    # with a per-row choice, so no single ORDER BY column can express it.
    characters.sort(key=lambda c: c.display_name.casefold())
    return [_to_response(db, character, viewer) for character in characters]


@router.get(
    "/{system_id}/entries", summary="Entries This Character Is Cast On"
)
def get_character_entries(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The entries this character appears in, grouped by media type.

    The reverse of GET /api/credits/{media_type}/{entry_id}'s cast list, and
    the mirror of get_person_entries - except that a character holds no roles,
    so the group key is only the media type, not (media type, role).

    Visibility runs through the same filter_visible_pairs call _to_response
    uses for casting_count, so the number on the card and the list on the
    page can never disagree. A character carries no content label of their
    own, so one whose every casting is hidden answers with empty groups, not
    a 404 - the character is not the secret, their castings are.
    """
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Character not found.")

    rows = (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.character_id == system_id)
        .order_by(models.CharacterCasting.position)
        .all()
    )
    visible = set(
        filter_visible_pairs(
            db,
            viewer,
            [(r.media_type, r.entry_id) for r in rows if r.media_type and r.entry_id],
        )
    )

    # One query per media type that appears, not one per casting row.
    wanted: dict[str, set[UUID]] = {}
    for row in rows:
        if (row.media_type, row.entry_id) in visible:
            wanted.setdefault(row.media_type, set()).add(row.entry_id)
    loaded: dict[str, dict[UUID, object]] = {}
    for media_type, ids in wanted.items():
        ref = MEDIA_TABLES.get(media_type)
        if ref is None:
            continue
        loaded[media_type] = {
            entry.system_id: entry
            for entry in db.query(ref.model)
            .filter(ref.model.system_id.in_(ids))
            .all()
        }

    # person_id -> Person, for the seiyuu display_name/system_id on each entry.
    person_ids = {r.person_id for r in rows if r.person_id}
    people = {
        p.system_id: p
        for p in db.query(models.Person).filter(models.Person.system_id.in_(person_ids))
    } if person_ids else {}

    groups: dict[str, list] = {}
    for row in rows:
        if row.media_type not in MEDIA_TABLES:
            continue
        # setdefault before the visibility check on purpose: a group the
        # viewer may not see any entry of still exists, empty. Hiding the
        # group as well would tell them the character has no such castings
        # at all.
        payload = groups.setdefault(row.media_type, [])
        entry = loaded.get(row.media_type, {}).get(row.entry_id)
        if entry is None:
            continue
        seiyuu = people.get(row.person_id) if row.person_id else None
        payload.append(
            {
                "system_id": str(entry.system_id),
                "display_name": entry.display_name,
                "cover_image_file": getattr(entry, "cover_image_file", None),
                "release_date": primary_release_value(row.media_type, entry),
                "seiyuu_display_name": seiyuu.display_name if seiyuu else None,
                "seiyuu_system_id": str(seiyuu.system_id) if seiyuu else None,
            }
        )

    out = []
    for media_type, entries in groups.items():
        # Newest first; an undated entry sorts last, as UNDATED does elsewhere.
        entries.sort(key=lambda e: e["release_date"] or "", reverse=True)
        ref = MEDIA_TABLES[media_type]
        out.append(
            {
                "media_type": media_type,
                "nav_path": ref.nav_path,
                "entries": entries,
            }
        )
    return {"groups": out}


@router.get(
    "/{system_id}",
    response_model=schemas.CharacterResponse,
    summary="Get Character by ID",
)
def get_character_by_id(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single character by their UUID."""
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Character not found.")
    return _to_response(db, character, viewer)


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.CharacterResponse, summary="Create Character")
def create_character(
    payload: schemas.CharacterCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a character. Always a plain create - never find-or-create.

    Decision G: POST /api/person is find-or-create because two spellings of
    one director are one human. Characters are the opposite - the "Yuki" of
    one anime and the "Yuki" of another are different characters, and
    silently returning the first would fuse two unrelated casts under one
    system_id. There is deliberately no find_character helper, and no name
    slotting: this endpoint must never resolve a payload against an existing
    row by name. Disambiguation belongs in the cast editor's combobox, which
    lets the admin pick "existing" or "new" explicitly - never in a silent
    server-side match here.
    """
    character = models.Character(**payload.model_dump())
    db.add(character)
    db.commit()
    db.refresh(character)
    return _to_response(db, character)


@router.put(
    "/{system_id}", response_model=schemas.CharacterResponse, summary="Update Character"
)
def update_character(
    system_id: UUID,
    payload: schemas.CharacterUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates a character's metadata."""
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Character not found.")

    for key, value in payload.model_dump().items():
        setattr(character, key, value)

    db.commit()
    db.refresh(character)
    return _to_response(db, character)


@router.delete("/{system_id}", summary="Delete Character")
def delete_character(
    system_id: UUID,
    castings: int = Query(..., description="Casting count the admin confirmed"),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a character. Their castings cascade away with them -
    see the merge endpoint for the correct fix when this character is a
    duplicate.

    `castings` is the count the UI showed in its confirmation, and it is
    REQUIRED. If it no longer matches, the request is rejected with 409: the
    admin agreed to destroy a specific amount of casting history, and a count
    that moved underneath them - another session casting this character while
    the dialog was open - is not what they agreed to.
    """
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Character not found.")

    actual = (
        db.query(models.CharacterCasting).filter_by(character_id=system_id).count()
    )
    if actual != castings:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This character now has {actual} castings, not {castings}. "
                "Reload and confirm again."
            ),
        )

    db.delete(character)
    db.commit()

    return {"status": "success", "message": "Character deleted successfully."}


@router.post("/{system_id}/merge", summary="Merge Another Character Into This One")
def merge_character(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Repoint every casting from `source_id` onto this character, then delete
    the source. This - not delete - is the fix for a duplicate: deleting
    cascades the castings away, so merging is the only way to keep them.
    """
    if system_id == payload.source_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a character into itself."
        )

    keep = db.get(models.Character, system_id)
    drop = db.get(models.Character, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail="Character not found.")

    held = {
        (c.media_type, c.entry_id)
        for c in db.query(models.CharacterCasting)
        .filter_by(character_id=system_id)
        .all()
    }
    moved = 0
    for casting in (
        db.query(models.CharacterCasting)
        .filter_by(character_id=payload.source_id)
        .all()
    ):
        if (casting.media_type, casting.entry_id) in held:
            db.delete(casting)
            continue
        casting.character_id = system_id
        moved += 1

    db.delete(drop)
    db.commit()
    return {"status": "success", "castings_moved": moved}
