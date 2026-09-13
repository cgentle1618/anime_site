"""
Permission names are the contract between the code registry and the grants
stored in role_permission. A rename on one side and not the other silently
turns a grant into a no-op, so the naming helpers and the catalog they build
are pinned here.

The label family is deliberately absent from the static catalog: it is derived
from the content_label table at request time. Only its naming is testable
without a database.
"""

import pytest

from app.services.rbac.permissions import (
    ADMIN_PERMISSION_KEYS,
    FAMILY_MEDIA_TYPE,
    MANAGE_PERMISSION_KEYS,
    SELF_PERMISSION_KEYS,
    admin_perm,
    manage_perm,
    media_type_perm,
    self_perm,
    split_perm,
    static_catalog,
)
from app.utils.media_resolver import MEDIA_TYPE_KEYS


@pytest.mark.parametrize("media_type", sorted(MEDIA_TYPE_KEYS))
def test_media_type_permission_round_trips(media_type):
    perm = media_type_perm(media_type)
    assert perm == f"media_type.{media_type}"
    assert split_perm(perm) == (FAMILY_MEDIA_TYPE, media_type)


def test_hyphenated_media_type_keeps_its_hyphen():
    """MEDIA_TABLES keys are hyphenated; splitting on '.' must not touch them."""
    assert split_perm(media_type_perm("tv-show")) == (FAMILY_MEDIA_TYPE, "tv-show")


def test_static_catalog_holds_admin_manage_every_media_type_and_self():
    """Four families, and only four. Content labels and field groups are the
    access-mode axis since Phase B, not grantable permissions."""
    catalog = static_catalog()
    expected = (
        {admin_perm(key) for key in ADMIN_PERMISSION_KEYS}
        | {manage_perm(key) for key in MANAGE_PERMISSION_KEYS}
        | {media_type_perm(mt) for mt in MEDIA_TYPE_KEYS}
        | {self_perm(key) for key in SELF_PERMISSION_KEYS}
    )
    assert catalog == expected


def test_static_catalog_is_immutable():
    """A caller must not be able to widen the catalog by mutating it."""
    with pytest.raises((AttributeError, TypeError)):
        static_catalog().add("anything")


def test_the_object_families_are_not_grantable_to_a_role():
    """Object scoping left the role axis in Phase B.

    Permission resolution is a UNION and a union can only add - so if
    field_group.sources_restricted stayed grantable on a role, no access mode
    could ever take it away and the narrow tiers would be unbuildable.

    The helpers are DELETED rather than left unused on purpose: any call site
    still asking has(field_group.<key>) would silently answer True for a
    root role, which is a wrong answer no test would obviously catch. An
    ImportError that stops the build beats a behaviour that quietly changes.
    """
    from app.services.rbac import permissions as perms

    assert not hasattr(perms, "label_perm")
    assert not hasattr(perms, "field_group_perm")
    assert not any(
        p.startswith(("label.", "field_group."))
        for p in perms.static_catalog()
    )


def test_the_families_tuple_no_longer_lists_them():
    from app.services.rbac.permissions import PERMISSION_FAMILIES

    assert "label" not in PERMISSION_FAMILIES
    assert "field_group" not in PERMISSION_FAMILIES
