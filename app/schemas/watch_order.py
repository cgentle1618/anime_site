"""Watch Order request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


# ==========================================
# ITEM
# ==========================================


class WatchOrderItemBase(BaseModel):
    media_type: Optional[str] = None
    entry_id: Optional[UUID] = None
    position: Optional[float] = None
    ep_start: Optional[int] = None
    ep_end: Optional[int] = None
    # "Essential" | "Normal" | "Optional". Validated against ITEM_IMPORTANCE by
    # the item endpoints; a step carries exactly one of the three.
    importance: Optional[str] = "Normal"
    note: Optional[str] = None


class WatchOrderItemCreate(WatchOrderItemBase):
    """`list_id` comes from the path, so it is not part of the body."""


class WatchOrderItemUpdate(WatchOrderItemBase):
    pass


class WatchOrderItemResponse(WatchOrderItemBase):
    system_id: UUID
    list_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WatchOrderItemResolved(WatchOrderItemResponse):
    """
    An item plus the referenced entry's display data, resolved server-side.

    Resolution cannot be left to the frontend: a collection-scoped order spans
    franchises, so the page has no reason to already hold those entries.
    `missing` is True when `entry_id` no longer exists (entries are FK-less).
    """

    missing: bool = False
    display_name: Optional[str] = None
    # The entry's release date as stored, at whatever precision it carries:
    # "2018-09-01", "NOV 2025" or "2023". None when the entry has no date.
    release_display: Optional[str] = None
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    status: Optional[str] = None
    total_episodes: Optional[int] = None
    # Anime only, and a number rather than a count - 0 and 14.5 are both real
    # values, so consumers must test for None, never falsiness.
    ep_special: Optional[float] = None


# ==========================================
# LIST
# ==========================================


class WatchOrderListBase(BaseModel):
    franchise_id: Optional[UUID] = None
    collection_id: Optional[UUID] = None
    series_id: Optional[UUID] = None
    list_name: Optional[str] = None
    list_type: Optional[str] = "Custom"
    is_default: Optional[bool] = False
    is_most_recommended: Optional[bool] = False
    # None for a hand-built list; "release" for one whose steps are generated.
    auto_source: Optional[str] = None
    sort_index: Optional[float] = None
    remark: Optional[str] = None


class WatchOrderListCreate(WatchOrderListBase):
    pass


class WatchOrderListUpdate(WatchOrderListBase):
    pass


class WatchOrderListResponse(WatchOrderListBase):
    system_id: UUID
    item_count: int = 0
    # Distinct media types among the items, in a fixed order. One entry means a
    # single-type order; several mean a cross-type one. Derived, not stored.
    media_types: List[str] = []
    # Nullable in the database, and a blank Google Sheets cell parses to None
    # on Pull, so one timestamp-less row must not fail the whole list endpoint.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WatchOrderListDetailResponse(WatchOrderListResponse):
    items: List[WatchOrderItemResolved] = []


# ==========================================
# CANDIDATES
# ==========================================


class WatchOrderCandidate(BaseModel):
    """One entry the admin may add as a step, flattened across media types."""

    media_type: str
    entry_id: UUID
    display_name: Optional[str] = None
    release_display: Optional[str] = None
    # Every title the entry answers to, lowercased, so the picker can match a
    # query against any language and not only the displayed name.
    search_names: List[str] = []
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    status: Optional[str] = None
    total_episodes: Optional[int] = None
    ep_special: Optional[float] = None


# ==========================================
# REORDER
# ==========================================


class WatchOrderReorder(BaseModel):
    """Ordered item ids; positions are renumbered 1..N to match."""

    item_ids: List[UUID]


# ==========================================
# SHEET SYNC
# ==========================================


class WatchOrderListSheetSync(WatchOrderListCreate):
    """Schema for Google Sheets Watch Order List sync, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WatchOrderItemSheetSync(WatchOrderItemCreate):
    """Schema for Google Sheets Watch Order Item sync, including timestamps."""

    list_id: Optional[UUID] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
