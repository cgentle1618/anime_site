"""
default_guest_permissions() is a pure function (no DB needed): it computes
the grant set a brand-new guest role is seeded with.

It is media types and NOTHING else since Phase B. Field groups used to live
here - the guest role was seeded holding every one except sources_restricted
- and they moved to the access-mode axis, where the `safe` mode carries them
and is itself derived from this role's own grants at migration time.
"""

from app.services.rbac.permissions import media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.utils.media_resolver import MEDIA_TYPE_KEYS


def test_guest_defaults_are_media_types_and_nothing_else():
    perms = default_guest_permissions()
    assert perms == {media_type_perm(mt) for mt in MEDIA_TYPE_KEYS}


def test_guest_defaults_carry_no_field_group():
    """The regression test for the axis split. A field group granted on a role
    could never be taken away by a mode, because permission resolution is a
    union."""
    assert not any(p.startswith("field_group.") for p in default_guest_permissions())


def test_guest_defaults_still_include_every_media_type():
    perms = default_guest_permissions()
    for media_type in MEDIA_TYPE_KEYS:
        assert media_type_perm(media_type) in perms
