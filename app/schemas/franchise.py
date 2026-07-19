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
    watch_next_group: Optional[str] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None


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
    series_name_alt: Optional[str] = None
    remark: Optional[str] = None


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(SeriesBase):
    pass


class SeriesResponse(SeriesBase):
    system_id: UUID

    model_config = ConfigDict(from_attributes=True)



class FranchiseSheetSync(FranchiseCreate):
    """Schema for Google Sheets Franchise Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SeriesSheetSync(SeriesCreate):
    """Schema for Google Sheets Series Sync operations."""

    pass
