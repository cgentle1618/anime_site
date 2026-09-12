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


# ---------------------------------------------------------------------------
# Which grants a role may not change
# ---------------------------------------------------------------------------
#
# Some cells of the role grid are not an admin's to decide. `admin.authz` is
# the clearest: it is the permission to change who may do what, so handing it
# out through the very page it governs is how an installation loses control of
# itself. It is now grantable to NOTHING - the superuser short-circuit is the
# only way to hold it.
#
# The rest follow from what each system role IS, rather than from what it
# happens to have been seeded with. `super` means "everything except changing
# authorization", so every permission but admin.authz is locked on; `guest` is
# what an anonymous request resolves to, so the whole of admin.*, manage.* and
# self.* is locked off and that role can only view.
#
# Returned to the frontend per role (RoleResponse.locked_on / locked_off) and
# enforced on the write path from this same table, so the disabled checkbox
# and the 409 can never disagree.
#
# The role NAMES live here rather than in seed.py, which imports them back:
# a table keyed on a name must own that name, or a rename reaches the seed and
# silently unlocks the role.

SUPER_ROLE_NAME = "super"
GUEST_ROLE_NAME = "guest"


def _self_family() -> frozenset[str]:
    return frozenset(self_perm(key) for key in SELF_PERMISSION_KEYS)


def locked_permissions(
    role_name: str, is_superuser: bool
) -> tuple[frozenset[str], frozenset[str]]:
    """
    (locked_on, locked_off) for one role: what it must hold and what it may
    never hold. Disjoint by construction - a permission in neither set is the
    admin's free choice.

    A superuser's locked_on is everything EXCEPT the self family, and its
    locked_off is that family, because Viewer.has() deliberately does not
    short-circuit self.* (resolver.py): an administrative account keeps no
    list and no personal notes, so drawing those boxes ticked would state the
    opposite of what the code does.
    """
    every = static_catalog()
    own = _self_family()

    if is_superuser:
        return frozenset(every - own), own
    if role_name == GUEST_ROLE_NAME:
        # Every anonymous request resolves to this role, so anything beyond a
        # read would be handed to every visitor on the internet.
        return frozenset(), frozenset(
            {admin_perm(key) for key in ADMIN_PERMISSION_KEYS}
            | {manage_perm(key) for key in MANAGE_PERMISSION_KEYS}
            | own
        )
    if role_name == SUPER_ROLE_NAME:
        return frozenset(every - {PERM_ADMIN_AUTHZ}), frozenset({PERM_ADMIN_AUTHZ})
    # `user` and every custom role. manage.catalog and the self family are
    # free choices here; running a pipeline is not, because one Pull All
    # overwrites every table including the accounts and role assignments.
    return frozenset(), frozenset({PERM_ADMIN_AUTHZ, PERM_MANAGE_PIPELINES})
