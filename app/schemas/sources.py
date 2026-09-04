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


class SourceWrite(BaseModel):
    """One row of the `sources` list accepted on POST/PUT/PATCH.

    Shaped for `services.domain.sources.replace_sources`, which resolves
    `name` against the vocabulary itself - no id or position is accepted
    here, the writer always replaces the whole set in list order.
    """

    kind: str
    bucket: str
    name: str
    available: Optional[bool] = None
    url: Optional[str] = None


class SourceWriteFields(BaseModel):
    """Mixed into every media type's Create/Update schema.

    `None` means "the payload said nothing about sources" (PUT with
    exclude_unset, or a POST that omits the key) - the nested-collections
    writer only runs when the key is present, so the existing set is left
    alone. An empty list means "clear the sources".
    """

    sources: Optional[list[SourceWrite]] = None
