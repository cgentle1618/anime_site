"""Publisher request/response schemas.

Mirrors StudioBase in app/schemas/staff.py minus the two MAL columns: MAL
has no record of a games publisher or a Taiwanese distributor, so there is
nothing to autofill from and nothing to link to.
"""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.utils.credit_roles import legal_scopes


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
    # Which media types this publisher is offered on. A bare list, not the
    # {role, scope} pairs PersonRoleIn carries: a publisher holds exactly one
    # role, so there is no second axis to name.
    scopes: list[str] = []

    @field_validator("scopes", mode="before")
    @classmethod
    def _scope_rows_to_values(cls, v):
        """
        Accept PublisherScope ORM rows as well as plain strings.

        For the reason PersonRoleIn carries from_attributes: /api/search hands
        the ORM publisher to the response model rather than building it field
        by field the way routers/publisher.py does, and a bare list[str] would
        reject the rows it finds on `Publisher.scopes`.
        """
        if isinstance(v, (list, tuple)):
            return [getattr(s, "scope", s) for s in v]
        return v

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
        legal = legal_scopes("publisher")
        for scope in self.scopes:
            if scope not in legal:
                raise ValueError(
                    f"{scope} is not a media type a publisher may be offered on."
                )
        return self


class PublisherCreate(PublisherBase):
    pass


class PublisherUpdate(PublisherBase):
    pass


class PublisherResponse(PublisherBase):
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    display_name: str = ""
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)
