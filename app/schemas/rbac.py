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
    is_root: bool
    permissions: List[str] = []
    user_count: int = 0
    # What this role must hold and what it may never hold, from
    # permissions.locked_permissions(). Served rather than mirrored in the SPA
    # for the same reason the permission catalog is: the disabled checkbox and
    # the 409 that would reject the same save come from one table.
    locked_on: List[str] = []
    locked_off: List[str] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class AccessModeItems(BaseModel):
    """What a mode carries. Replaced wholesale, like a role's permissions."""

    label_keys: List[str] = []
    field_group_keys: List[str] = []


class AccessModeCreate(AccessModeItems):
    key: str
    label: str
    description: Optional[str] = None
    sort_order: int = 0


class AccessModeUpdate(BaseModel):
    """Label, description, order and the guest-default flag.

    `key` is absent deliberately: the seeded modes are read by key in
    seed_modes.py, and renaming one would silently detach the seeder from the
    row it maintains.
    """

    label: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class AccessModeResponse(BaseModel):
    system_id: UUID
    key: str
    label: str
    description: Optional[str] = None
    sort_order: int
    is_system: bool
    label_keys: List[str]
    field_group_keys: List[str]
    user_count: int


class AccessModeCatalogItem(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    # How many modes carry this item. Zero on a content label means its
    # entries are hidden from everybody, which is what the page warns about.
    mode_count: int


class AccessModeCatalogGroup(BaseModel):
    group: str
    label: str
    items: List[AccessModeCatalogItem]


class UserAccessModeGrant(BaseModel):
    """One mode an account holds, with the items it does NOT get from it.

    Denials only SUBTRACT (decision 8). There is no "extra" counterpart and
    there must not be one: a mode is a ceiling, so an account's reach is
    always a subset of its mode's, which is what makes a mode name on the user
    list a trustworthy upper bound.
    """

    mode_id: UUID
    is_default: bool = False
    denied_label_keys: List[str] = []
    denied_field_group_keys: List[str] = []


class UserAccessModes(BaseModel):
    """Replaces an account's whole set - grants, default and denials.

    One payload and one write, matching PUT /roles/{id}/permissions. An empty
    list is legitimate: an account holding no mode resolves the empty object
    set, which is fail-closed and a reasonable way to park somebody.
    """

    modes: List[UserAccessModeGrant] = []


class AccessModeSwitch(BaseModel):
    """Body of POST /api/auth/access-mode.

    `password` is optional because narrowing does not need one. Widening
    without it is a 401 carrying `requires_password`, so the SPA prompts
    rather than guessing which switches are free.
    """

    mode_id: UUID
    password: Optional[str] = None


class ManagedUserCreate(BaseModel):
    username: str
    password: str
    role_id: UUID


class ManagedUserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[UUID] = None


class HeldAccessMode(BaseModel):
    """One mode an account holds, as the per-account panel needs to render it."""

    mode_id: UUID
    key: str
    label: str
    is_default: bool
    denied_label_keys: List[str] = []
    denied_field_group_keys: List[str] = []


class ManagedUserResponse(BaseModel):
    id: UUID
    username: str
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    # Read-only here. Written only by the account's owner, through
    # PATCH /api/account/settings.
    list_is_public: bool = False
    # The OBJECT axis for this account. Carried on the user response rather
    # than behind a second endpoint because the panel that edits it lives on
    # the users page, and PUT .../access-modes returns this same shape - so
    # the page never has to reconcile two sources.
    access_modes: List[HeldAccessMode] = []

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
# Public profiles
# ---------------------------------------------------------------------------

class ProfileEntry(BaseModel):
    """One row of somebody's list, joined to the catalogue."""

    media_id: UUID
    media_type: str
    public_id: int
    display_name: str
    cover_image_file: Optional[str] = None
    status: str
    my_rating: Optional[str] = None


class ProfileStatusCount(BaseModel):
    status: str
    count: int


class ProfileResponse(BaseModel):
    """
    One user's list. Carries no personal notes and no email or password: a
    profile says what somebody has watched and what they thought of it, and
    nothing else about them.
    """

    username: str
    list_is_public: bool
    # True when the caller is looking at their own profile, so the SPA can
    # offer the visibility toggle rather than guessing from the username.
    is_self: bool
    counts: List[ProfileStatusCount] = []
    entries: List[ProfileEntry] = []


# ---------------------------------------------------------------------------
# Community aggregates
# ---------------------------------------------------------------------------

class CommunityStatusCount(BaseModel):
    status: str
    count: int


class CommunityAggregate(BaseModel):
    """
    What the public lists say about one entry.

    sample_size is separate from list_count on purpose: a work can be on forty
    lists and rated by six, and a "6" beside an average is the difference
    between a figure and a rumour.
    """

    media_id: UUID
    # How many public lists hold this entry at all.
    list_count: int
    statuses: List[CommunityStatusCount] = []
    # How many of those carried a rating.
    sample_size: int
    # The mean on the 1-8 letter scale, and that mean as the nearest letter.
    average_points: Optional[float] = None
    average_rating: Optional[str] = None


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
    # No `permission` field. A label stopped being a permission in Phase B -
    # it is carried by an access mode now, not granted to a role - and
    # publishing `label.<key>` would have named something that no longer
    # exists. `key` is the identifier that still means something, and it is on
    # ContentLabelBase.

    model_config = ConfigDict(from_attributes=True)


class EntryLabels(BaseModel):
    """The whole set for one entry, replaced at once - as credits.py does."""

    label_keys: List[str]
