"""Person and Studio request/response schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PersonRoleIn(BaseModel):
    role: str
    scope: Optional[str] = None


class PersonBase(BaseModel):
    name_native: str
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    gender: Optional[str] = None
    my_rating: Optional[str] = None
    photo_file: Optional[str] = None
    remark: Optional[str] = None


class PersonCreate(PersonBase):
    roles: List[PersonRoleIn] = []


class PersonUpdate(PersonBase):
    roles: List[PersonRoleIn] = []


class PersonResponse(PersonBase):
    system_id: UUID
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class StudioBase(BaseModel):
    name_native: str
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    my_rating: Optional[str] = None
    logo_file: Optional[str] = None
    remark: Optional[str] = None


class StudioCreate(StudioBase):
    pass


class StudioUpdate(StudioBase):
    pass


class StudioResponse(StudioBase):
    system_id: UUID
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class MergeRequest(BaseModel):
    source_id: UUID
