"""Image library request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    storage_key: str
    thumb_key: Optional[str] = None
    checksum: str
    original_filename: Optional[str] = None
    byte_size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    uploaded_by: Optional[UUID] = None
    uploaded_at: Optional[datetime] = None

    # Computed per request rather than stored: whether the bytes are on THIS
    # machine, and what this image is currently used for.
    missing: bool = False
    attachments: List["AttachmentOut"] = []


class AttachmentIn(BaseModel):
    owner_type: str
    owner_id: UUID
    role: str = "cover"


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    image_id: UUID
    owner_type: str
    owner_id: UUID
    role: str
    position: int


class ImageListOut(BaseModel):
    images: List[ImageOut]
    total: int


ImageOut.model_rebuild()
