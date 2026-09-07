"""
default_guest_permissions() is a pure function (no DB needed): it computes
the grant set a brand-new guest role is seeded with. sources_restricted
exists to withhold certain sources from ordinary viewers, so a fresh guest
must not be seeded holding it - that would defeat the field group on day one.
"""

from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.permissions import field_group_perm, media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.utils.media_resolver import MEDIA_TYPE_KEYS


def test_guest_defaults_withhold_sources_restricted():
    perms = default_guest_permissions()
    assert field_group_perm("sources_restricted") not in perms


def test_guest_defaults_still_include_every_other_field_group():
    perms = default_guest_permissions()
    for key in FIELD_GROUP_KEYS:
        if key == "sources_restricted":
            continue
        assert field_group_perm(key) in perms
    assert field_group_perm("sources_other") in perms


def test_guest_defaults_still_include_every_media_type():
    perms = default_guest_permissions()
    for media_type in MEDIA_TYPE_KEYS:
        assert media_type_perm(media_type) in perms
