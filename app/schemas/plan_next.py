"""Pydantic schemas for /api/plan-next."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PlanNextBase(BaseModel):
    # Hyphenated MEDIA_TABLES key. Validated against plan_next_kinds in the
    # router rather than as an Enum here, so a value added in a newer version
    # survives a round trip through an older one.
    media_type: str
    scope: str
    target_id: UUID
    remark: Optional[str] = None


class PlanNextCreate(PlanNextBase):
    pass


class PlanNextRead(PlanNextBase):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Resolved at read time from OWNER_TABLES. A deleted target reads as
    # missing rather than vanishing, so the admin page can show and fix it.
    missing: bool = True
    display_name: Optional[str] = None
    label: Optional[str] = None
    is_tier: bool = False
    cover_image_file: Optional[str] = None
    nav_path: Optional[str] = None
    # Whichever expectation column the target carries. Resolved here rather
    # than re-derived in the browser, because the Plan page sorts by it and the
    # column is named differently on each of the three tiers.
    expectation: Optional[str] = None
