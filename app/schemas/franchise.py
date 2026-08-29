"""Franchise and Series request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator


class FranchiseBase(BaseModel):
    franchise_type: Optional[str] = None
    franchise_name_en: Optional[str] = None
    franchise_name_cn: Optional[str] = None
    franchise_name_roman: Optional[str] = None
    franchise_name_jp: Optional[str] = None
    franchise_name_alt: Optional[str] = None
    my_rating: Optional[str] = None
    franchise_expectation: Optional[str] = "Low"
    cover_entry_id: Optional[UUID] = None
    type_covers: Optional[dict] = None
    type_slots: Optional[dict] = None
    # size_group_derived is Calculate-owned (see app/services/domain/plan_next.py)
    # and included here only so GET responses carry it; the admin UI never
    # writes it back. size_group_manual is the admin's override map.
    size_group_derived: Optional[dict] = None
    size_group_manual: Optional[dict] = None
    remark: Optional[str] = None
    collection_id: Optional[UUID] = None


class FranchiseCreate(FranchiseBase):
    pass


class FranchiseUpdate(FranchiseBase):
    pass


class FranchiseResponse(FranchiseBase):
    system_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# SERIES SCHEMAS
# ==========================================


class SeriesBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_name_en: Optional[str] = None
    series_name_cn: Optional[str] = None
    series_name_roman: Optional[str] = None
    series_name_jp: Optional[str] = None
    series_name_alt: Optional[str] = None
    my_rating: Optional[str] = None
    series_expectation: Optional[str] = "Low"
    cover_entry_id: Optional[UUID] = None
    size_group_derived: Optional[dict] = None
    size_group_manual: Optional[dict] = None
    remark: Optional[str] = None


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(SeriesBase):
    pass


class SeriesResponse(SeriesBase):
    system_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)



class FranchiseSheetSync(FranchiseCreate):
    """Schema for Google Sheets Franchise Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SeriesSheetSync(SeriesCreate):
    """Schema for Google Sheets Series Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
