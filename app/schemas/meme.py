"""Meme request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MemeBase(BaseModel):
    owner_type: Optional[str] = None
    owner_id: Optional[UUID] = None
    # One text and/or one image - never a list.
    text: Optional[str] = None
    image_file: Optional[str] = None
    # The Quote this meme's text also is, when it is one.
    quote_id: Optional[UUID] = None
    episode: Optional[str] = None
    link: Optional[str] = None
    is_favorite: Optional[bool] = False
    sort_index: Optional[float] = None
    remark: Optional[str] = None


class MemeCreate(MemeBase):
    pass


class MemeUpdate(MemeBase):
    pass


class MemeResponse(MemeBase):
    system_id: UUID
    # Nullable in the database, and a blank Google Sheets cell parses to None
    # on Pull, so one timestamp-less row must not fail the whole list endpoint.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MemeResolved(MemeResponse):
    """
    A meme plus the referenced entry's display data, resolved server-side.

    Resolution cannot be left to the frontend: the Meme page spans every owner
    type, so it has no reason to already hold them. `missing` is True when
    `owner_id` no longer exists (owners are FK-less). The linked quote's display
    data is folded in too, so the page can show whose line it is without a
    second request.
    """

    quote_speaker: Optional[str] = None
    quote_translation: Optional[str] = None

    missing: bool = False
    owner_display_name: Optional[str] = None
    # "Franchise", "Anime", ... - lets the UI badge a group by owner kind.
    owner_label: Optional[str] = None
    # True for series/franchise/collection, which have no cover column.
    owner_is_tier: bool = False
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    owner_nav_path: Optional[str] = None


class MemeGroup(BaseModel):
    """Every meme for one owner, with that owner's display data."""

    owner_type: Optional[str] = None
    owner_id: Optional[UUID] = None
    missing: bool = False
    owner_display_name: Optional[str] = None
    owner_label: Optional[str] = None
    owner_is_tier: bool = False
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    owner_nav_path: Optional[str] = None
    memes: List[MemeResolved] = []


class MemeSheetSync(MemeCreate):
    """Schema for Google Sheets Meme sync, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
