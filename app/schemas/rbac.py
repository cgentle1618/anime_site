"""Role, user-management and content-label schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Permission catalog
# ---------------------------------------------------------------------------

class PermissionOut(BaseModel):
    """One grantable permission, described for the role editor."""

    permission: str
    label: str
    description: str = ""


class PermissionFamilyOut(BaseModel):
    """
    Permissions grouped the way the admin UI renders them.

    The catalog is served rather than mirrored in the frontend so the checkbox
    grid cannot drift from what the server will actually accept.
    """

    family: str
    label: str
    permissions: List[PermissionOut]


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

class RoleBase(BaseModel):
    name: str
    label: str
    description: Optional[str] = None
    sort_order: int = 0


class RoleCreate(RoleBase):
    permissions: List[str] = []


class RoleUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class RolePermissions(BaseModel):
    """The whole set, replaced at once - never an incremental add."""

    permissions: List[str]


class RoleResponse(RoleBase):
    system_id: UUID
    is_system: bool
    is_superuser: bool
    permissions: List[str] = []
    user_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class ManagedUserCreate(BaseModel):
    username: str
    password: str
    role_id: UUID


class ManagedUserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[UUID] = None


class ManagedUserResponse(BaseModel):
    id: UUID
    username: str
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    # Read-only here. Written only by the account's owner, through
    # PATCH /api/account/settings.
    list_is_public: bool = False

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# The caller's own account
# ---------------------------------------------------------------------------

class AccountSettingsResponse(BaseModel):
    """What the caller may see and change about their own account."""

    username: str
    role_name: str
    list_is_public: bool


class AccountSettingsUpdate(BaseModel):
    """
    One field, deliberately. There is no username or user id here: the caller
    is taken from the session, so this payload cannot name somebody else.
    Pydantic ignores unknown keys by default, so a stray "username" in the body
    is dropped rather than honoured.
    """

    list_is_public: bool


# ---------------------------------------------------------------------------
# Content labels
# ---------------------------------------------------------------------------

class ContentLabelBase(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    sort_order: int = 0


class ContentLabelCreate(ContentLabelBase):
    pass


class ContentLabelUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class ContentLabelResponse(ContentLabelBase):
    system_id: UUID
    permission: str

    model_config = ConfigDict(from_attributes=True)


class EntryLabels(BaseModel):
    """The whole set for one entry, replaced at once - as credits.py does."""

    label_keys: List[str]
