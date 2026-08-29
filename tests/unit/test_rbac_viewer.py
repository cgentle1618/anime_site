"""
Viewer is the answer to "who is asking", resolved once per request.

A superuser holds every permission without any of them being granted, which is
what keeps a new content label or field group from hiding content from the
admin the moment it is created.
"""

from app.services.rbac.resolver import Viewer

GUEST = Viewer(
    username=None,
    role_id=None,
    role_name="guest",
    is_superuser=False,
    permissions=frozenset({"media_type.anime"}),
)

SUPERUSER = Viewer(
    username="admin",
    role_id=None,
    role_name="admin",
    is_superuser=True,
    permissions=frozenset(),
)


def test_a_granted_permission_is_held():
    assert GUEST.has("media_type.anime")


def test_an_ungranted_permission_is_not_held():
    assert not GUEST.has("media_type.manga")


def test_a_superuser_holds_a_permission_nobody_granted():
    """The point of is_superuser: no grant list to keep in step."""
    assert SUPERUSER.has("label.nsfw")
    assert SUPERUSER.has("anything.at.all")


def test_a_guest_is_anonymous():
    assert GUEST.username is None
    assert GUEST.role_name == "guest"
