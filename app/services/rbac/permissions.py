"""
The permission vocabulary.

Permissions are declared in code and only their grants are stored, following
the rule app/models/system.py::SystemOption already states: anything the
business logic compares against is a Python constant, so it cannot be renamed
out from under the logic. A permission names a column, a MEDIA_TABLES key or a
field group - all code - so a row with no code behind it would be inert.

The one exception is the label family. Content labels are admin-managed rows,
so `label.<key>` is derived from the content_label table at request time;
`static_catalog()` is the half knowable without a database; the label half
joins it in catalog(), added with the content_label table.

A name is `<family>.<key>`, except `admin`, which is bare: it is not one of
anything, it is the permission that implies all the others.
"""

from typing import TYPE_CHECKING, Iterable

from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.utils.media_resolver import MEDIA_TYPE_KEYS

if TYPE_CHECKING:  # pragma: no cover
    from sqlalchemy.orm import Session

PERM_ADMIN = "admin"

FAMILY_MEDIA_TYPE = "media_type"
FAMILY_FIELD_GROUP = "field_group"
FAMILY_LABEL = "label"

PERMISSION_FAMILIES: tuple[str, ...] = (
    FAMILY_MEDIA_TYPE,
    FAMILY_FIELD_GROUP,
    FAMILY_LABEL,
)


def media_type_perm(media_type: str) -> str:
    """Permission to see any entry of one media type. Keys are hyphenated."""
    return f"{FAMILY_MEDIA_TYPE}.{media_type}"


def field_group_perm(key: str) -> str:
    """Permission to see the fields in one FIELD_GROUPS entry."""
    return f"{FAMILY_FIELD_GROUP}.{key}"


def label_perm(key: str) -> str:
    """Permission to see entries carrying one content label."""
    return f"{FAMILY_LABEL}.{key}"


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
        {PERM_ADMIN}
        | {media_type_perm(media_type) for media_type in MEDIA_TYPE_KEYS}
        | {field_group_perm(key) for key in FIELD_GROUP_KEYS}
    )


def label_catalog(label_keys: Iterable[str]) -> frozenset[str]:
    """The label family, given the keys currently in content_label."""
    return frozenset(label_perm(key) for key in label_keys)


def catalog(db: "Session") -> frozenset[str]:
    """
    The whole vocabulary: the static half plus one permission per content
    label. Writes validate against this, so a grant naming nothing is rejected
    rather than silently stored.
    """
    from app import models

    keys = [key for (key,) in db.query(models.ContentLabel.key).all()]
    return static_catalog() | label_catalog(keys)


def is_valid(db: "Session", permission: str) -> bool:
    return permission in catalog(db)
