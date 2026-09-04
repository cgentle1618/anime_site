from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SourceRef(BaseModel):
    """One row of an entry's Sources card."""

    system_id: UUID
    kind: str
    bucket: str
    name: str
    available: Optional[bool] = None
    url: Optional[str] = None
    position: int = 0

    model_config = ConfigDict(from_attributes=True)
