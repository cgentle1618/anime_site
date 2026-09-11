"""
The permission vocabulary.

Permissions are declared in code and only their grants are stored, following
the rule app/models/system.py::SystemOption already states: anything the
business logic compares against is a Python constant, so it cannot be renamed
out from under the logic. A permission names a column, a MEDIA_TABLES key or a
field group - all code - so a row with no code behind it would be inert.

Content labels and field groups are NOT here. They stopped being permissions
in Phase B of the authorization redesign: they scope which OBJECTS a session
reaches, which is the access-mode axis (app/services/rbac/modes.py), and they
had to leave this one because permission resolution is a union and a union can
only add - a role holding field_group.sources_restricted could never have it
taken away by a mode. label_perm() and field_group_perm() were deleted rather
than left unused, so that any call site still asking has(field_group.<key>) -
which would silently answer True for a superuser - is an ImportError instead.

A name is always `<family>.<key>`. The bare `admin` that used to be the
exception was removed in Phase A of the authorization redesign; it is now
three named permissions, `admin.authz` and the two `manage.*`.
"""

from typing import TYPE_CHECKING

from app.utils.media_resolver import MEDIA_TYPE_KEYS

if TYPE_CHECKING:  # pragma: no cover
    from sqlalchemy.orm import Session

FAMILY_ADMIN = "admin"
# What an account may DO, as opposed to which objects it may reach. These
# three permissions (admin.authz and the two manage.* below) replaced the old
# bare `admin` permission at the end of Phase A.
FAMILY_MANAGE = "manage"

FAMILY_MEDIA_TYPE = "media_type"
# What a viewer may write about their OWN rows. Every other family answers
# "may you see this"; this one answers "may you write your own". It is the
# whole of the `user` role beyond the guest reads, which is why it is two
# permissions rather than a subsystem.
FAMILY_SELF = "self"

PERMISSION_FAMILIES: tuple[str, ...] = (
    FAMILY_ADMIN,
    FAMILY_MANAGE,
    FAMILY_MEDIA_TYPE,
    FAMILY_SELF,
)

ADMIN_PERMISSION_KEYS: tuple[str, ...] = ("authz",)
MANAGE_PERMISSION_KEYS: tuple[str, ...] = ("catalog", "pipelines")

ADMIN_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "authz": (
        "Manage Authorization",
        "Create and edit roles, accounts and content labels directly - that "
        "is, change who may do what. Does not itself grant any catalogue "
        "write. Not the only way to change these, though: manage.pipelines "
        "can rewrite accounts, content labels and role assignments too, by "
        "running Pull All over the sheet.",
    ),
}

MANAGE_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "catalog": (
        "Manage Catalogue",
        "Add, change and delete entries, groups, people, studios, publishers, "
        "characters, credits, options, relations, watch orders and catalogue "
        "notes.",
    ),
    "pipelines": (
        "Run Pipelines",
        "Backup, Pull, Fill, Replace and Calculate. Separate from the "
        "catalogue because a single Pull All overwrites every table.",
    ),
}


def admin_perm(key: str) -> str:
    """Permission to change who may do what."""
    return f"{FAMILY_ADMIN}.{key}"


def manage_perm(key: str) -> str:
    """Permission to perform one class of catalogue-side operation."""
    return f"{FAMILY_MANAGE}.{key}"


PERM_ADMIN_AUTHZ = admin_perm("authz")
PERM_MANAGE_CATALOG = manage_perm("catalog")
PERM_MANAGE_PIPELINES = manage_perm("pipelines")

# Declared here rather than derived from a table: like every other permission
# these name code (a router dependency), so a row with no code behind it would
# be inert.
SELF_PERMISSION_KEYS: tuple[str, ...] = ("list", "personal_notes")

SELF_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "list": (
        "Own List",
        "Add, change and remove entries on your own list. Does not grant any "
        "write access to the catalogue itself.",
    ),
    "personal_notes": (
        "Own Personal Notes",
        "Write your own personal-scope notes on an entry. Catalogue notes stay "
        "admin-only.",
    ),
}


def media_type_perm(media_type: str) -> str:
    """Permission to see any entry of one media type. Keys are hyphenated."""
    return f"{FAMILY_MEDIA_TYPE}.{media_type}"


def self_perm(key: str) -> str:
    """Permission to write one kind of your own rows."""
    return f"{FAMILY_SELF}.{key}"


PERM_SELF_LIST = self_perm("list")
PERM_SELF_PERSONAL_NOTES = self_perm("personal_notes")


def split_perm(permission: str) -> tuple[str, str]:
    """
    ("media_type", "tv-show") for "media_type.tv-show"; (perm, "") for a bare
    name like admin. Splits once, so a hyphenated key keeps its hyphen.
    """
    family, sep, key = permission.partition(".")
    return (family, key) if sep else (permission, "")


def static_catalog() -> frozenset[str]:
    """Every permission knowable without a database."""
    return frozenset(
        {admin_perm(key) for key in ADMIN_PERMISSION_KEYS}
        | {manage_perm(key) for key in MANAGE_PERMISSION_KEYS}
        | {media_type_perm(media_type) for media_type in MEDIA_TYPE_KEYS}
        | {self_perm(key) for key in SELF_PERMISSION_KEYS}
    )


def catalog(db: "Session") -> frozenset[str]:
    """
    The whole grantable vocabulary. Writes validate against it, so a grant
    naming nothing is rejected rather than silently stored.

    Takes a Session it no longer reads: the label family used to be joined in
    here from content_label, and since Phase B there is no database-dependent
    half. The parameter stays because is_valid() and roles.py both pass one,
    and changing their signatures is a separate edit from deleting a family.
    """
    return static_catalog()


def is_valid(db: "Session", permission: str) -> bool:
    return permission in catalog(db)
