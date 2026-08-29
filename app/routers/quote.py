"""
routers/quote.py
Handles all operations for Quotes (memorable lines drawn from media entries).
Includes public reads for the Quote page and secure administrative CRUD
lifecycle. Memes are a sibling tier with their own router (routers/meme.py).

Quotes reference an entry with a (media_type, entry_id) pair rather than a
foreign key, so every read resolves that pair through
`app.utils.media_resolver` before returning.
"""

import uuid
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app import models
from app import schemas
from app.database import get_taipei_now
from app.dependencies import get_db, get_current_admin
from app.services.rbac.enforcement import drop_hidden_rows, entry_visible
from app.services.rbac.resolver import Viewer, get_viewer
from app.utils.data_control_utils import log_deleted_record
from app.utils.media_resolver import MEDIA_TABLES, entry_ref_for, resolve_entries

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/quote", tags=["Quote Management"])


# ==========================================
# HELPERS
# ==========================================


def _apply_filters(
    query,
    media_type: Optional[str],
    entry_id: Optional[str],
    is_general: Optional[bool],
    is_favorite: Optional[bool],
    needs_review: Optional[bool],
    tag: Optional[str],
    search_query: Optional[str],
):
    """Shared filter chain for the list and grouped endpoints."""
    if media_type:
        query = query.filter(models.Quote.media_type == media_type)
    if entry_id:
        query = query.filter(models.Quote.entry_id == entry_id)
    if is_general is not None:
        query = query.filter(models.Quote.is_general.is_(is_general))
    if is_favorite is not None:
        query = query.filter(models.Quote.is_favorite.is_(is_favorite))
    if needs_review is not None:
        query = query.filter(models.Quote.needs_review.is_(needs_review))
    if tag:
        # JSONB containment: matches a quote whose tags list holds this tag.
        query = query.filter(models.Quote.tags.contains([tag]))
    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Quote.text.ilike(search_term),
                models.Quote.translation.ilike(search_term),
                models.Quote.speaker.ilike(search_term),
                models.Quote.original_source.ilike(search_term),
            )
        )
    return query


def _get_or_404(db: Session, quote_id: str) -> models.Quote:
    db_quote = db.query(models.Quote).filter(models.Quote.system_id == quote_id).first()
    if not db_quote:
        raise HTTPException(status_code=404, detail="Quote not found.")
    return db_quote


def _meme_membership(db: Session, quote_ids: list) -> dict:
    """
    quote id -> the meme that names it, for the quotes given.

    Derived rather than stored on the quote: meme.quote_id is the single source
    of truth, and it is a unique indexed column, so this is one lookup rather
    than the JSONB scan it needed while the link lived inside a content list.
    """
    if not quote_ids:
        return {}
    rows = (
        db.query(models.Meme.quote_id, models.Meme.system_id)
        .filter(models.Meme.quote_id.in_(list(quote_ids)))
        .all()
    )
    return {str(quote_id): meme_id for quote_id, meme_id in rows}


def _resolved(db: Session, db_quote: models.Quote) -> schemas.QuoteResolved:
    """Wraps one quote with its referenced entry's display data."""
    resolved = resolve_entries(db, [(db_quote.media_type, db_quote.entry_id)])
    ref = entry_ref_for(resolved, db_quote.media_type, db_quote.entry_id)
    membership = _meme_membership(db, [db_quote.system_id])
    return schemas.QuoteResolved(
        **schemas.QuoteResponse.model_validate(db_quote).model_dump(),
        **ref.as_dict(),
        meme_id=membership.get(str(db_quote.system_id)),
    )


def _validate_media_type(media_type: Optional[str]) -> None:
    if media_type and media_type not in MEDIA_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media_type '{media_type}'."
        )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get("/", response_model=List[schemas.QuoteResolved], summary="Get All Quotes")
def get_all_quotes(
    media_type: Optional[str] = None,
    entry_id: Optional[str] = None,
    is_general: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    needs_review: Optional[bool] = None,
    tag: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Retrieves Quotes, optionally filtered.
    'search_query' searches the text, translation, speaker, and original source.
    Each row carries its referenced entry's display data, resolved server-side.
    """
    query = _apply_filters(
        db.query(models.Quote),
        media_type,
        entry_id,
        is_general,
        is_favorite,
        needs_review,
        tag,
        search_query,
    )

    quotes = (
        query.order_by(models.Quote.created_at.desc()).limit(limit).offset(offset).all()
    )
    # The quote TEXT is the leak, so the row goes, not just its entry reference.
    quotes = drop_hidden_rows(db, viewer, quotes, "media_type", "entry_id")

    resolved = resolve_entries(db, [(q.media_type, q.entry_id) for q in quotes])
    membership = _meme_membership(db, [q.system_id for q in quotes])
    return [
        schemas.QuoteResolved(
            **schemas.QuoteResponse.model_validate(q).model_dump(),
            **entry_ref_for(resolved, q.media_type, q.entry_id).as_dict(),
            meme_id=membership.get(str(q.system_id)),
        )
        for q in quotes
    ]


@router.get(
    "/grouped",
    response_model=List[schemas.QuoteGroup],
    summary="Get Quotes Grouped By Entry",
)
def get_quotes_grouped(
    media_type: Optional[str] = None,
    is_general: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    needs_review: Optional[bool] = None,
    tag: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=2000, ge=1, le=5000),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The Quote page's primary feed: quotes bucketed by the entry they come from.

    Grouping happens here rather than in the browser because the page needs one
    resolved entry header per bucket, and only the server can turn a
    (media_type, entry_id) pair into a name and cover.
    """
    query = _apply_filters(
        db.query(models.Quote),
        media_type,
        None,
        is_general,
        is_favorite,
        needs_review,
        tag,
        search_query,
    )

    quotes = (
        query.order_by(
            models.Quote.media_type,
            models.Quote.entry_id,
            models.Quote.sort_index.nullslast(),
            models.Quote.created_at,
        )
        .limit(limit)
        .all()
    )
    quotes = drop_hidden_rows(db, viewer, quotes, "media_type", "entry_id")

    resolved = resolve_entries(db, [(q.media_type, q.entry_id) for q in quotes])

    groups: dict = {}
    for q in quotes:
        key = (q.media_type, q.entry_id)
        if key not in groups:
            ref = entry_ref_for(resolved, q.media_type, q.entry_id)
            groups[key] = schemas.QuoteGroup(
                media_type=q.media_type,
                entry_id=q.entry_id,
                quotes=[],
                **ref.as_dict(),
            )
        groups[key].quotes.append(schemas.QuoteResponse.model_validate(q))

    # Named entries first, alphabetically; unresolvable ones sink to the bottom
    # rather than disappearing, so a dangling reference stays visible and fixable.
    return sorted(
        groups.values(),
        key=lambda g: (g.missing, (g.entry_display_name or "").lower()),
    )


@router.get(
    "/{quote_id}", response_model=schemas.QuoteResolved, summary="Get Quote By ID"
)
def get_quote(
    quote_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single Quote with its referenced entry's display data."""
    db_quote = _get_or_404(db, quote_id)
    if db_quote.media_type and db_quote.entry_id and not entry_visible(
        db, viewer, db_quote.media_type, db_quote.entry_id
    ):
        raise HTTPException(status_code=404, detail="Quote not found.")
    return _resolved(db, db_quote)


# ==========================================
# ADMIN WRITE OPERATIONS (Protected)
# ==========================================


@router.post("/", response_model=schemas.QuoteResponse, summary="Create Quote")
def create_quote(
    payload: schemas.QuoteCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Creates a new Quote attached to a media entry."""
    _validate_media_type(payload.media_type)
    try:
        db_quote = models.Quote(
            system_id=uuid.uuid4(),
            created_at=get_taipei_now(),
            updated_at=get_taipei_now(),
            **payload.model_dump(exclude_unset=True),
        )
        db.add(db_quote)
        db.commit()
        db.refresh(db_quote)
        return db_quote
    except Exception as e:
        logger.error(f"Error creating quote: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create quote.")


@router.put("/{quote_id}", response_model=schemas.QuoteResponse, summary="Update Quote")
def update_quote(
    quote_id: str,
    payload: schemas.QuoteUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Fully updates a Quote."""
    db_quote = _get_or_404(db, quote_id)
    _validate_media_type(payload.media_type)
    try:
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(db_quote, key, value)
        db_quote.updated_at = get_taipei_now()
        db.commit()
        db.refresh(db_quote)
        return db_quote
    except Exception as e:
        logger.error(f"Error updating quote {quote_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update quote.")


@router.patch("/{quote_id}", response_model=schemas.QuoteResponse, summary="Patch Quote")
def patch_quote(
    quote_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Partially updates a Quote (used for inline edits on the Quote page)."""
    db_quote = _get_or_404(db, quote_id)
    _validate_media_type(payload.get("media_type"))
    try:
        for key, value in payload.items():
            if hasattr(db_quote, key):
                setattr(db_quote, key, value)
        db_quote.updated_at = get_taipei_now()
        db.commit()
        db.refresh(db_quote)
        return db_quote
    except Exception as e:
        logger.error(f"Error patching quote {quote_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to patch quote.")


@router.delete("/{quote_id}", summary="Delete Quote")
def delete_quote(
    quote_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a Quote.
    Note: `image_file` is left alone. Unlike covers, quote images are
    hand-managed local files, so removing one is the admin's call.
    """
    db_quote = _get_or_404(db, quote_id)

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, db_quote, "Quote")

    db.delete(db_quote)
    db.commit()

    return {"status": "success", "message": "Quote deleted successfully."}
