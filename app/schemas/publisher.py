"""Publisher request/response schemas.

Mirrors StudioBase in app/schemas/staff.py minus the two MAL columns: MAL
has no record of a games publisher or a Taiwanese distributor, so there is
nothing to autofill from and nothing to link to.
"""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator


class PublisherBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    my_rating: Optional[str] = None
    logo_file: Optional[str] = None
    remark: Optional[str] = None
    founded_date: Optional[str] = None
    defunct_date: Optional[str] = None
    country: Optional[str] = None
    website_url: Optional[str] = None

    @model_validator(mode="after")
    def at_least_one_name(self):
        """
        Mirrors ck_publisher_has_a_name, so a nameless publisher is a 422 from
        the API rather than a 500 surfacing the database's IntegrityError.
        """
        if not any((self.name_en, self.name_cn, self.name_jp, self.name_alt)):
            raise ValueError("A publisher needs at least one name.")
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


class PublisherCreate(PublisherBase):
    pass


class PublisherUpdate(PublisherBase):
    pass


class PublisherResponse(PublisherBase):
    system_id: UUID
    display_name: str = ""
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)
