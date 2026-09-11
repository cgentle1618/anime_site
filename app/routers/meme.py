"""
routers/meme.py
Handles all operations for Memes (jokes, catchphrases and running gags). A meme
is one text, one image, or one of each, and belongs to a media entry or to a
whole series, franchise or collection. Includes public reads for the Meme page
and secure administrative CRUD lifecycle.

A meme names its owner with one of four foreign keys - `media_id` for any of
the nine media types, plus one each for collection, franchise and series -
because no single FK spans the twelve owner tables. The API still speaks the
(owner_type, owner_id) pair, which `_owner_filters` and `_owner_columns`
translate in one place.

Resolution for display goes through OWNER_TABLES rather than the entry-only
MEDIA_TABLES, because a tier is a valid owner here.

`quote_id` by contrast IS a real foreign key, so the two rules that used to need
router code are now database constraints: ON DELETE SET NULL means a deleted
quote nulls the link, and UNIQUE means a quote belongs to at most one meme.
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_db
from app.routers._patching import apply_column_patch
from app.services.rbac.enforcement import drop_hidden_rows, require_visible_media
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.utils.data_control_utils import log_deleted_record
from app.utils.media_resolver import (
    OWNER_TABLES,
    entry_ref_for,
    resolve_entries,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meme", tags=["Meme Management"])


# ==========================================
# HELPERS
# ==========================================


def _hydrate_quotes(db: Session, memes: list[models.Meme]) -> dict:
    """
    Batch-load every quote named by these memes.

    One query for the whole response rather than one per meme, so a page never
    degrades into N+1 lookups.
    """
    wanted = {m.quote_id for m in memes if m.quote_id}
    if not wanted:
        return {}
    rows = (
        db.query(models.Quote).filter(models.Quote.system_id.in_(list(wanted))).all()
    )
    return {row.system_id: row for row in rows}


def _to_resolved(
    meme: models.Meme, owner_refs: dict, quotes: dict
) -> schemas.MemeResolved:
    quote = quotes.get(meme.quote_id) if meme.quote_id else None
    return schemas.MemeResolved(
        **schemas.MemeResponse.model_validate(meme).model_dump(),
        **entry_ref_for(owner_refs, meme.owner_type, meme.owner_id).as_owner_dict(),
        quote_speaker=quote.speaker if quote else None,
        quote_translation=quote.translation if quote else None,
    )


_TIER_COLUMNS = {
    "collection": "collection_id",
    "franchise": "franchise_id",
    "series": "series_id",
}


def _owner_filters(owner_type: Optional[str], owner_id) -> list:
    """
    The WHERE clauses selecting one owner's memes, or a whole owner type.

    A tier key filters its own column; a media key filters `media_id`, and with
    no id given it asks `media` which rows are of that type - "every anime
    meme" is a question the pair used to answer directly and the FK answers
    through the supertable.
    """
    clauses = []
    if owner_type in _TIER_COLUMNS:
        column = getattr(models.Meme, _TIER_COLUMNS[owner_type])
        clauses.append(column.isnot(None))
        if owner_id:
            clauses.append(column == owner_id)
        return clauses
    if owner_type:
        clauses.append(
            models.Meme.media_id.in_(
                select(models.Media.system_id).where(
                    models.Media.media_type == owner_type
                )
            )
        )
    if owner_id:
        clauses.append(
            or_(
                models.Meme.media_id == owner_id,
                models.Meme.collection_id == owner_id,
                models.Meme.franchise_id == owner_id,
                models.Meme.series_id == owner_id,
            )
        )
    return clauses


def _owner_columns(owner_type: str, owner_id) -> dict:
    """The column assignment writing one owner onto a meme."""
    if owner_type in _TIER_COLUMNS:
        return {_TIER_COLUMNS[owner_type]: owner_id}
    return {"media_id": owner_id}


def _apply_owner(target, owner_type, owner_id) -> None:
    """
    Write the (owner_type, owner_id) pair the API speaks onto the four columns.

    The other three are cleared, so the CHECK still sees exactly one - a meme
    moved from an anime to its franchise must not keep both.
    """
    columns = _owner_columns(owner_type, owner_id)
    for column in ("media_id", "collection_id", "franchise_id", "series_id"):
        setattr(target, column, columns.get(column))


def _apply_filters(
    query,
    owner_type: Optional[str],
    owner_id: Optional[str],
    is_favorite: Optional[bool],
    search_query: Optional[str],
):
    """Shared filter chain for the list and grouped endpoints."""
    owner_clauses = _owner_filters(owner_type, owner_id)
    if owner_clauses:
        query = query.filter(*owner_clauses)
    if is_favorite is not None:
        query = query.filter(models.Meme.is_favorite.is_(is_favorite))
    if search_query:
        query = query.filter(models.Meme.text.ilike(f"%{search_query}%"))
    return query


def _get_or_404(db: Session, meme_id: str) -> models.Meme:
    db_meme = db.query(models.Meme).filter(models.Meme.system_id == meme_id).first()
    if not db_meme:
        raise HTTPException(status_code=404, detail="Meme not found.")
    return db_meme


def _validate_owner_type(owner_type: Optional[str]) -> None:
    """Ten valid owners: the seven media entries plus the three grouping tiers."""
    if owner_type and owner_type not in OWNER_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown owner_type '{owner_type}'."
        )


def _quote_conflict(db: Session, quote_id, exclude_meme_id: Optional[str] = None):
    """
    Turn a would-be UNIQUE violation into a useful 400 before it reaches the DB.

    The constraint is the real guarantee; this exists only so the admin sees
    which meme already owns the quote rather than a bare integrity error.
    """
    if not quote_id:
        return
    query = db.query(models.Meme).filter(models.Meme.quote_id == quote_id)
    if exclude_meme_id:
        query = query.filter(models.Meme.system_id != exclude_meme_id)
    other = query.first()
    if other:
        raise HTTPException(
            status_code=400,
            detail=f"That quote already belongs to another meme ({other.system_id}).",
        )


def _require_visible_owner(db: Session, viewer, owner_id) -> None:
    """
    The write half of the visibility check `get_meme` already does.

    There is deliberately no `owner_type` parameter. `_owner_columns` above
    writes EVERY media type to the same `media_id` column, so the type the
    caller sent is not evidence of anything: gating on it let a viewer holding
    media_type.movie and not media_type.anime post
    {"owner_type": "movie", "owner_id": <an anime id>} and attach a meme to an
    entry it cannot read - only the type axis was bypassed, because the label
    half of the check is keyed on media_id. A PATCH naming only `owner_id`
    had the same shape with the STORED type. `require_visible_media` resolves
    the type from the id itself, which closes both.

    An owner may be a grouping tier, which carries no labels and is not a
    Media row at all, so a tier is never refused here. 404 and "Meme not
    found.", so a hidden owner answers exactly as a missing meme.
    """
    require_visible_media(db, viewer, owner_id, "Meme not found.")


_INTEGRITY_DETAIL = "That quote is already linked to a meme, or does not exist."


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.MemeResolved], summary="Get All Memes")
def get_all_memes(
    owner_type: Optional[str] = None,
    owner_id: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Retrieves Memes, optionally filtered.
    Each row carries its owner's display data and, when the text is also a
    quote, that quote's speaker and translation - all resolved server-side.
    """
    query = _apply_filters(
        db.query(models.Meme), owner_type, owner_id, is_favorite, search_query
    )
    memes = (
        query.order_by(models.Meme.created_at.desc()).limit(limit).offset(offset).all()
    )
    # The caption is the leak, so a meme on a hidden entry goes entirely.
    memes = drop_hidden_rows(db, viewer, memes, "owner_type", "owner_id")

    owner_refs = resolve_entries(
        db, [(m.owner_type, m.owner_id) for m in memes], OWNER_TABLES
    )
    quotes = _hydrate_quotes(db, memes)
    return [_to_resolved(m, owner_refs, quotes) for m in memes]


@router.get(
    "/grouped",
    response_model=List[schemas.MemeGroup],
    summary="Get Memes Grouped By Owner",
)
def get_memes_grouped(
    owner_type: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=2000, ge=1, le=5000),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The Meme page's primary feed: memes bucketed by the owner they belong to.

    Grouping happens here rather than in the browser because the page needs one
    resolved owner header per bucket, and only the server can turn an
    (owner_type, owner_id) pair into a name, label and cover.
    """
    query = _apply_filters(
        db.query(models.Meme), owner_type, None, is_favorite, search_query
    )
    memes = (
        # Ordered by the four owner columns rather than the old pair, so
        # every meme of one owner still arrives together for the grouping
        # below. Which of the four is set is what identifies the owner.
        query.order_by(
            models.Meme.media_id,
            models.Meme.collection_id,
            models.Meme.franchise_id,
            models.Meme.series_id,
            models.Meme.sort_index.nullslast(),
            models.Meme.created_at,
        )
        .limit(limit)
        .all()
    )
    memes = drop_hidden_rows(db, viewer, memes, "owner_type", "owner_id")

    owner_refs = resolve_entries(
        db, [(m.owner_type, m.owner_id) for m in memes], OWNER_TABLES
    )
    quotes = _hydrate_quotes(db, memes)

    groups: dict = {}
    for m in memes:
        key = (m.owner_type, m.owner_id)
        if key not in groups:
            ref = entry_ref_for(owner_refs, m.owner_type, m.owner_id)
            groups[key] = schemas.MemeGroup(
                owner_type=m.owner_type,
                owner_id=m.owner_id,
                memes=[],
                **ref.as_owner_dict(),
            )
        groups[key].memes.append(_to_resolved(m, owner_refs, quotes))

    # Named owners first, alphabetically; unresolvable ones sink to the bottom
    # rather than disappearing, so a dangling reference stays visible and fixable.
    return sorted(
        groups.values(),
        key=lambda g: (g.missing, (g.owner_display_name or "").lower()),
    )


@router.get("/{meme_id}", response_model=schemas.MemeResolved, summary="Get Meme By ID")
def get_meme(
    meme_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single Meme with its owner and linked-quote data resolved."""
    db_meme = _get_or_404(db, meme_id)
    if not drop_hidden_rows(db, viewer, [db_meme], "owner_type", "owner_id"):
        raise HTTPException(status_code=404, detail="Meme not found.")
    owner_refs = resolve_entries(
        db, [(db_meme.owner_type, db_meme.owner_id)], OWNER_TABLES
    )
    return _to_resolved(db_meme, owner_refs, _hydrate_quotes(db, [db_meme]))


# ==========================================
# ADMIN WRITE OPERATIONS (Protected)
# ==========================================


@router.post("/", response_model=schemas.MemeResponse, summary="Create Meme")
def create_meme(
    payload: schemas.MemeCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
    viewer: Viewer = Depends(get_viewer),
):
    """Creates a new Meme attached to an entry, series, franchise or collection."""
    _validate_owner_type(payload.owner_type)
    _require_visible_owner(db, admin, payload.owner_id)
    _quote_conflict(db, payload.quote_id)
    try:
        data = payload.model_dump(exclude_unset=True)
        # The author is who is asking, not who the payload says they are.
        data.pop("author_id", None)
        # The API still speaks (owner_type, owner_id); the table speaks four FKs.
        data.pop("owner_type", None)
        data.pop("owner_id", None)
        data.update(_owner_columns(payload.owner_type, payload.owner_id))
        db_meme = models.Meme(
            system_id=uuid.uuid4(),
            created_at=get_taipei_now(),
            updated_at=get_taipei_now(),
            author_id=viewer.user_id,
            **data,
        )
        db.add(db_meme)
        db.commit()
        db.refresh(db_meme)
        return db_meme
    except HTTPException:
        raise
    except IntegrityError as e:
        # The UNIQUE/FK constraints are the real guarantee, so anything that
        # slips past the pre-check still fails cleanly rather than 500ing.
        logger.warning(f"Meme integrity error: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail=_INTEGRITY_DETAIL)
    except Exception as e:
        logger.error(f"Error creating meme: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create meme.")


@router.put("/{meme_id}", response_model=schemas.MemeResponse, summary="Update Meme")
def update_meme(
    meme_id: str,
    payload: schemas.MemeUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Fully updates a Meme."""
    db_meme = _get_or_404(db, meme_id)
    _require_visible_owner(db, admin, db_meme.owner_id)
    _validate_owner_type(payload.owner_type)
    _quote_conflict(db, payload.quote_id, exclude_meme_id=meme_id)
    data = payload.model_dump(exclude_unset=True)
    if "owner_id" in data:
        # The INCOMING owner, resolved from the id alone - see
        # _require_visible_owner. A payload naming only owner_type moves the
        # stored id between columns and is covered by the check above.
        _require_visible_owner(db, admin, data["owner_id"])
    try:
        if "owner_type" in data or "owner_id" in data:
            _apply_owner(
                db_meme,
                data.get("owner_type", db_meme.owner_type),
                data.get("owner_id", db_meme.owner_id),
            )
        data.pop("owner_type", None)
        data.pop("owner_id", None)
        for key, value in data.items():
            setattr(db_meme, key, value)
        db_meme.updated_at = get_taipei_now()
        db.commit()
        db.refresh(db_meme)
        return db_meme
    except HTTPException:
        raise
    except IntegrityError as e:
        logger.warning(f"Meme integrity error: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail=_INTEGRITY_DETAIL)
    except Exception as e:
        logger.error(f"Error updating meme {meme_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update meme.")


@router.patch("/{meme_id}", response_model=schemas.MemeResponse, summary="Patch Meme")
def patch_meme(
    meme_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Partially updates a Meme (used for inline edits on the Meme page)."""
    db_meme = _get_or_404(db, meme_id)
    _require_visible_owner(db, admin, db_meme.owner_id)
    # A patch may not reassign authorship: `payload` is a raw dict here, so
    # nothing else would stop it.
    payload.pop("author_id", None)
    _validate_owner_type(payload.get("owner_type"))
    if "owner_id" in payload:
        # The INCOMING owner, resolved from the id alone - see
        # _require_visible_owner. A payload naming only owner_type moves the
        # stored id between columns and is covered by the check above.
        _require_visible_owner(db, admin, payload["owner_id"])
    if "quote_id" in payload:
        _quote_conflict(db, payload["quote_id"], exclude_meme_id=meme_id)
    try:
        if "owner_type" in payload or "owner_id" in payload:
            _apply_owner(
                db_meme,
                payload.get("owner_type", db_meme.owner_type),
                payload.get("owner_id", db_meme.owner_id),
            )
        payload.pop("owner_type", None)
        payload.pop("owner_id", None)
        apply_column_patch(db_meme, payload)
        db_meme.updated_at = get_taipei_now()
        db.commit()
        db.refresh(db_meme)
        return db_meme
    except HTTPException:
        raise
    except IntegrityError as e:
        logger.warning(f"Meme integrity error: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail=_INTEGRITY_DETAIL)
    except Exception as e:
        logger.error(f"Error patching meme {meme_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to patch meme.")


@router.delete("/{meme_id}", summary="Delete Meme")
def delete_meme(
    meme_id: str,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Permanently deletes a Meme.

    The linked quote is NOT deleted: a quote stands on its own, and the meme
    only ever pointed at it. `image_file` is left alone too - quote and meme
    images are hand-managed local files.
    """
    db_meme = _get_or_404(db, meme_id)
    _require_visible_owner(db, admin, db_meme.owner_id)

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, db_meme, "Meme")

    db.delete(db_meme)
    db.commit()

    return {"status": "success", "message": "Meme deleted successfully."}
