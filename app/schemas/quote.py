"""Quote request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class QuoteBase(BaseModel):
    media_type: Optional[str] = None
    entry_id: Optional[UUID] = None
    kind: Optional[str] = "quote"
    text: Optional[str] = None
    translation: Optional[str] = None
    language: Optional[str] = None
    speaker: Optional[str] = None
    original_source: Optional[str] = None
    episode: Optional[str] = None
    link: Optional[str] = None
    image_file: Optional[str] = None
    tags: Optional[List[str]] = None
    is_general: Optional[bool] = False
    is_favorite: Optional[bool] = False
    needs_review: Optional[bool] = False
    sort_index: Optional[float] = None
    remark: Optional[str] = None


class QuoteCreate(QuoteBase):
    pass


class QuoteUpdate(QuoteBase):
    pass


class QuoteResponse(QuoteBase):
    system_id: UUID
    # Nullable in the database, and a blank Google Sheets cell parses to None
    # on Pull, so one timestamp-less row must not fail the whole list endpoint.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class QuoteResolved(QuoteResponse):
    """
    A quote plus the referenced entry's display data, resolved server-side.

    Resolution cannot be left to the frontend: the Quote page spans every media
    type, so it has no reason to already hold those entries. `missing` is True
    when `entry_id` no longer exists (entries are FK-less).
    """

    missing: bool = False
    entry_display_name: Optional[str] = None
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    entry_nav_path: Optional[str] = None


class QuoteGroup(BaseModel):
    """Every quote for one media entry, with that entry's display data."""

    media_type: Optional[str] = None
    entry_id: Optional[UUID] = None
    missing: bool = False
    entry_display_name: Optional[str] = None
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    entry_nav_path: Optional[str] = None
    quotes: List[QuoteResponse] = []


class QuoteSheetSync(QuoteCreate):
    """Schema for Google Sheets Quote sync, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
