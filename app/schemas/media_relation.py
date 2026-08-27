"""Media Relation request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RelationKindResponse(BaseModel):
    """One choice in the admin dropdown.

    `stored_as` differs from `key` only for `prequel`, which is recorded as a
    swapped `sequel` row; the UI does not need to care, but showing it keeps
    the API self-describing.
    """

    key: str
    label: str
    inverse_label: str
    family: str
    symmetric: bool
    stored_as: str


class MediaRelationCreate(BaseModel):
    """A relation as the admin typed it, before normalization.

    `kind` accepts the ten user-facing choices, including `prequel`, which is
    never stored under that name.
    """

    from_type: str
    from_id: UUID
    kind: str
    to_type: str
    to_id: UUID
    remark: Optional[str] = None


class MediaRelationUpdate(BaseModel):
    """Only the kind and the remark are editable.

    Repointing a relation at a different entry means deleting it and adding the
    right one, which keeps this endpoint from having to re-validate endpoints.
    """

    kind: Optional[str] = None
    remark: Optional[str] = None


class MediaRelationResponse(BaseModel):
    """A stored row, exactly as it sits in the table."""

    system_id: UUID
    from_type: str
    from_id: UUID
    relation_type: str
    to_type: str
    to_id: UUID
    remark: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RelationOtherEndpoint(BaseModel):
    """The entry at the far end, resolved for display.

    `missing` is True when the id no longer exists — endpoints are FK-less, so
    a dangling link stays visible rather than disappearing.
    """

    media_type: Optional[str] = None
    entry_id: Optional[UUID] = None
    missing: bool = True
    display_name: Optional[str] = None
    # The media type's human label, e.g. "Anime Movie".
    label: Optional[str] = None
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    nav_path: Optional[str] = None


class MediaRelationResolved(BaseModel):
    """A relation as read from one particular entry's point of view."""

    system_id: UUID
    relation_type: str
    # The kind's label, or its inverse label when this entry is the `to` side.
    label: str
    family: str
    # "forward" when the viewed entry is `from`, "reverse" when it is `to`.
    direction: str
    remark: Optional[str] = None
    other: RelationOtherEndpoint
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RelationGraphNode(BaseModel):
    """
    One entry on the canvas.

    `in_scope` separates the franchise's own entries from the ghosts pulled in
    by a relation that leaves the scope; `missing` marks an endpoint whose row
    is gone, which stays visible so it can be found and deleted.
    """

    key: str
    media_type: str
    entry_id: Optional[UUID] = None
    in_scope: bool
    missing: bool = False
    display_name: Optional[str] = None
    # Every title the entry answers to, so the canvas search box finds an entry
    # displayed under its Chinese title.
    search_names: List[str] = []
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    nav_path: Optional[str] = None
    # The media type's human label ("Anime Movie"), for the node badge.
    type_label: Optional[str] = None


class RelationGraphEdge(BaseModel):
    """
    One media_relation row, keyed by the two node keys it joins.

    Both labels travel with the edge - `label` reads the row in the stored
    direction and `inverse_label` reads it backwards - so the canvas never
    needs a second copy of RELATION_KINDS to label an edge or its inspector.
    """

    system_id: UUID
    # Named `from` in JSON; `from` is a Python keyword, hence the alias.
    from_key: str = Field(..., alias="from")
    to_key: str = Field(..., alias="to")
    relation_type: str
    label: str
    inverse_label: str
    family: str
    remark: Optional[str] = None

    model_config = {"populate_by_name": True}


class RelationGraphResponse(BaseModel):
    """Everything one canvas draws, in one request."""

    nodes: List[RelationGraphNode]
    edges: List[RelationGraphEdge]
