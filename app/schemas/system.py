"""System-support schemas (options, config, seasonal, logs, deleted records)."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator


class SystemOptionBase(BaseModel):
    category: str
    option_value: str


class SystemOptionCreate(SystemOptionBase):
    pass


class SystemOptionResponse(SystemOptionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)



class SystemConfigResponse(BaseModel):
    config_key: str
    config_value: str

    model_config = ConfigDict(from_attributes=True)


class AnnouncementBase(BaseModel):
    """Dashboard announcement note, stored in system_configs as 'announcement:<title>'."""

    title: str
    body: str


class AnnouncementCreate(AnnouncementBase):
    pass


class AnnouncementUpdate(AnnouncementBase):
    """Update payload — original_title identifies the row, title may rename it."""

    original_title: str


class AnnouncementResponse(AnnouncementBase):
    pass


class SeasonalBase(BaseModel):
    seasonal: str
    my_rating: Optional[str] = None
    entry_planned: int = 0
    entry_completed: int = 0
    entry_watching: int = 0
    entry_dropped: int = 0


class SeasonalResponse(SeasonalBase):
    model_config = ConfigDict(from_attributes=True)


class SeasonalUpdate(BaseModel):
    my_rating: Optional[str] = None


class CurrentSeasonUpdate(BaseModel):
    """Specific schema for updating global 'current_season' setting."""

    release_season: str
    release_year: int



class DataControlLogResponse(BaseModel):
    id: int
    action_main: str
    action_specific: str
    type: str
    status: str
    rows_added: int
    rows_updated: int
    rows_deleted: int
    error_message: Optional[str] = None
    details_json: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class DeletedRecordResponse(BaseModel):
    id: int
    type: str
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    franchise_cn: Optional[str] = None
    franchise_type: Optional[str] = None
    series_cn: Optional[str] = None
    category: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
