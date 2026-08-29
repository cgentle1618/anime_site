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

from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.permissions import (
    FAMILY_FIELD_GROUP,
    FAMILY_LABEL,
    FAMILY_MEDIA_TYPE,
    PERM_ADMIN,
    field_group_perm,
    label_perm,
    media_type_perm,
    split_perm,
    static_catalog,
)
from app.utils.media_resolver import MEDIA_TYPE_KEYS


def test_admin_is_a_bare_name_with_no_family():
    """Admin is not one of anything; it is the permission that holds them all."""
    assert PERM_ADMIN == "admin"
    assert split_perm(PERM_ADMIN) == (PERM_ADMIN, "")


@pytest.mark.parametrize("media_type", sorted(MEDIA_TYPE_KEYS))
def test_media_type_permission_round_trips(media_type):
    perm = media_type_perm(media_type)
    assert perm == f"media_type.{media_type}"
    assert split_perm(perm) == (FAMILY_MEDIA_TYPE, media_type)


@pytest.mark.parametrize("key", sorted(FIELD_GROUP_KEYS))
def test_field_group_permission_round_trips(key):
    perm = field_group_perm(key)
    assert perm == f"field_group.{key}"
    assert split_perm(perm) == (FAMILY_FIELD_GROUP, key)


def test_label_permission_round_trips():
    perm = label_perm("nsfw")
    assert perm == "label.nsfw"
    assert split_perm(perm) == (FAMILY_LABEL, "nsfw")


def test_hyphenated_media_type_keeps_its_hyphen():
    """MEDIA_TABLES keys are hyphenated; splitting on '.' must not touch them."""
    assert split_perm(media_type_perm("tv-show")) == (FAMILY_MEDIA_TYPE, "tv-show")


def test_static_catalog_holds_admin_every_media_type_and_every_field_group():
    catalog = static_catalog()
    expected = (
        {PERM_ADMIN}
        | {media_type_perm(mt) for mt in MEDIA_TYPE_KEYS}
        | {field_group_perm(key) for key in FIELD_GROUP_KEYS}
    )
    assert catalog == expected


def test_static_catalog_excludes_labels():
    """Label permissions are derived from the DB, never hard-coded."""
    assert not any(p.startswith(f"{FAMILY_LABEL}.") for p in static_catalog())


def test_static_catalog_is_immutable():
    """A caller must not be able to widen the catalog by mutating it."""
    with pytest.raises((AttributeError, TypeError)):
        static_catalog().add("anything")
