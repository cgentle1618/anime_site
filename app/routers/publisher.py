"""
routers/publisher.py
CRUD for publishers and distributors credited on media entries, plus merge.

Mirrors app/routers/studio.py endpoint for endpoint, minus the MAL derivation
and autofill: MAL has no record of a games publisher or a Taiwanese
distributor, so there is nothing to enrich a publisher from.

Deleting a publisher cascades its credits away (see MediaCredit.publisher_id
ondelete="CASCADE") - merge is the fix for a duplicate, repointing every
credit before deleting the loser so credit history survives.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db
from app.services.domain.credits import find_publisher
from app.services.integrations.image_manager import delete_cover_image
from app.services.rbac.enforcement import filter_visible_pairs
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.entity_ref import find_entity
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.release_date import primary_release_value

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/publisher", tags=["Publisher Management"])


def _to_response(
    db: Session, publisher: models.Publisher, viewer=None
) -> schemas.PublisherResponse:
    credit_rows = (
        db.query(models.Media.media_type, models.MediaCredit.media_id)
        .join(models.Media, models.MediaCredit.media_id == models.Media.system_id)
        .filter(models.MediaCredit.publisher_id == publisher.system_id)
        .all()
    )
    # Count only credits on entries the viewer may see. A number is a smaller
    # leak than a title, but "published 3 things, you can see 2" is still one.
    credit_count = len(
        filter_visible_pairs(
            db, viewer, [(mt, eid) for mt, eid in credit_rows if mt and eid]
        )
    )
    return schemas.PublisherResponse(
        system_id=publisher.system_id,
        public_id=publisher.public_id,
        name_en=publisher.name_en,
        name_cn=publisher.name_cn,
        name_jp=publisher.name_jp,
        name_alt=publisher.name_alt,
        display_name_field=publisher.display_name_field,
        display_name=publisher.display_name,
        my_rating=publisher.my_rating,
        logo_file=publisher.logo_file,
        remark=publisher.remark,
        founded_date=publisher.founded_date,
        defunct_date=publisher.defunct_date,
        country=publisher.country,
        website_url=publisher.website_url,
        scopes=sorted(s.scope for s in publisher.scopes),
        credit_count=credit_count,
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.PublisherResponse], summary="Get All Publishers"
)
def get_all_publishers(
    scope: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Retrieves every publisher, sorted by display name.

    `scope` narrows the list to the publishers offered on one media type, so a
    form asks for the suggestions it can actually use. Omitting it returns
    everything, including publishers holding no scope at all - the admin list
    page must be able to see a publisher in order to give it one.
    """
    query = db.query(models.Publisher)
    if scope:
        query = query.join(models.PublisherScope).filter(
            models.PublisherScope.scope == scope
        )
    publishers = query.all()
    publishers.sort(key=lambda p: p.display_name.casefold())
    return [_to_response(db, publisher, viewer) for publisher in publishers]


@router.get(
    "/{system_id}",
    response_model=schemas.PublisherResponse,
    summary="Get Publisher by ID",
)
def get_publisher_by_id(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single publisher by its public_id or its UUID."""
    publisher = find_entity(db, models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail="Publisher not found.")
    return _to_response(db, publisher, viewer)


@router.get("/{system_id}/entries", summary="Entries Credited to This Publisher")
def get_publisher_entries(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The entries this publisher is credited on, grouped by media type.

    Visibility runs through the same filter_visible_pairs call _to_response
    uses for credit_count, so the number on the card and the list on the page
    can never disagree. A publisher carries no content label of its own, so
    one whose every credit is hidden answers with empty groups, not a 404 -
    the publisher is not the secret, its credits are.
    """
    publisher = db.get(models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail="Publisher not found.")

    rows = (
        db.query(models.Media.media_type, models.MediaCredit.media_id)
        .join(models.Media, models.MediaCredit.media_id == models.Media.system_id)
        .filter(models.MediaCredit.publisher_id == system_id)
        .all()
    )
    visible = filter_visible_pairs(
        db, viewer, [(mt, eid) for mt, eid in rows if mt and eid]
    )

    groups = []
    for media_type, ref in MEDIA_TABLES.items():
        ids = [eid for mt, eid in visible if mt == media_type]
        if not ids:
            continue
        entries = db.query(ref.model).filter(ref.model.system_id.in_(ids)).all()
        payload = [
            {
                "system_id": str(entry.system_id),
                "display_name": entry.display_name,
                "public_id": entry.public_id,
                "cover_image_file": getattr(entry, "cover_image_file", None),
                "release_date": primary_release_value(media_type, entry),
            }
            for entry in entries
        ]
        # Newest first; an undated entry sorts last, as UNDATED does elsewhere.
        payload.sort(key=lambda e: e["release_date"] or "", reverse=True)
        groups.append(
            {
                "media_type": media_type,
                "label": ref.label,
                "nav_path": ref.nav_path,
                "entries": payload,
            }
        )
    return {"groups": groups}


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.PublisherResponse, summary="Create Publisher")
def create_publisher(
    payload: schemas.PublisherCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Creates a publisher, or returns the existing one under that name.

    Find-or-create for the same reason as POST /api/studio: the Add and Modify
    forms POST here through ensureSourceValues.js whenever a typed name is not
    in the suggestion list, so a "create" for a publisher that already exists
    is routine, and a second row would split its credits. Matching is on the
    normalized name, the key resolve_publisher uses.

    Metadata on an existing publisher is left untouched - use PUT to edit it.
    """
    first_name = next(
        n
        for n in (payload.name_en, payload.name_cn, payload.name_jp, payload.name_alt)
        if n
    )
    data = payload.model_dump()
    wanted = data.pop("scopes", [])
    publisher = find_publisher(db, first_name)
    if publisher is None:
        publisher = models.Publisher(**data)
        db.add(publisher)
        db.flush()

    # Additive, like POST /api/person: a create for a publisher that already
    # exists is routine (ensureSourceValues posts every typed name), and it
    # must not narrow the scopes the existing row holds.
    held = {s.scope for s in publisher.scopes}
    for scope in wanted:
        if scope not in held:
            held.add(scope)
            db.add(
                models.PublisherScope(
                    publisher_id=publisher.system_id, scope=scope
                )
            )
    db.commit()
    db.refresh(publisher)
    return _to_response(db, publisher)


@router.put(
    "/{system_id}",
    response_model=schemas.PublisherResponse,
    summary="Update Publisher",
)
def update_publisher(
    system_id: UUID,
    payload: schemas.PublisherUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Fully updates a publisher's metadata and the set of scopes it holds. Since
    every media_credit points at the publisher row by id, renaming here changes
    what every credited entry shows - no separate propagation step is needed.

    The scopes are a full replace, like PUT /api/person's roles: this is the
    one path an admin uses to take a scope away, so unlike POST it must be able
    to narrow.
    """
    publisher = db.get(models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail="Publisher not found.")

    data = payload.model_dump()
    wanted = list(dict.fromkeys(data.pop("scopes", [])))
    for key, value in data.items():
        setattr(publisher, key, value)

    db.query(models.PublisherScope).filter_by(
        publisher_id=system_id
    ).delete(synchronize_session=False)
    for scope in wanted:
        db.add(models.PublisherScope(publisher_id=system_id, scope=scope))

    db.commit()
    db.refresh(publisher)
    return _to_response(db, publisher)


@router.delete("/{system_id}", summary="Delete Publisher")
def delete_publisher(
    system_id: UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a publisher. Its credits cascade away with it - see
    the merge endpoint for the correct fix when this publisher is a duplicate.
    """
    publisher = db.get(models.Publisher, system_id)
    if publisher is None:
        raise HTTPException(status_code=404, detail="Publisher not found.")

    db.delete(publisher)
    db.commit()

    # Studio's delete path never does this, so a deleted studio leaks its logo
    # (cleanup exists only for media entries: _factory.py:31,
    # calculation.py:278). Publisher does not inherit that gap.
    delete_cover_image("publisher", str(system_id))

    return {"status": "success", "message": "Publisher deleted successfully."}


@router.post("/{system_id}/merge", summary="Merge Another Publisher Into This One")
def merge_publisher(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Repoint every credit from `source_id` onto this publisher, then delete the
    source. This - not delete - is the fix for a duplicate: deleting cascades
    the credits away, so merging is the only way to keep them.
    """
    if system_id == payload.source_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a publisher into itself."
        )

    keep = db.get(models.Publisher, system_id)
    drop = db.get(models.Publisher, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail="Publisher not found.")

    # media_id alone identifies the entry - it is globally unique across the
    # nine media tables, which is what the supertable bought.
    held = {
        (c.media_id, c.role)
        for c in db.query(models.MediaCredit).filter_by(publisher_id=system_id).all()
    }
    moved = 0
    for credit in (
        db.query(models.MediaCredit).filter_by(publisher_id=payload.source_id).all()
    ):
        if (credit.media_id, credit.role) in held:
            db.delete(credit)
            continue
        credit.publisher_id = system_id
        moved += 1

    # A merge must never narrow: the survivor is offered everywhere either row
    # was, or a form that used to suggest the loser would silently stop
    # suggesting anyone.
    held_scopes = {s.scope for s in keep.scopes}
    for scope_row in drop.scopes:
        if scope_row.scope not in held_scopes:
            held_scopes.add(scope_row.scope)
            db.add(
                models.PublisherScope(
                    publisher_id=system_id, scope=scope_row.scope
                )
            )

    db.delete(drop)
    db.commit()
    return {"status": "success", "credits_moved": moved}
