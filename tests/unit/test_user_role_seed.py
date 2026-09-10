"""
The `user` role is three ideas, not a subsystem: everything a guest may read,
plus write-your-own-list, plus write-your-own-personal-notes. Catalogue writes
stay behind Depends(get_current_admin), so granting this role adds no admin
surface at all.
"""

from app.services.rbac.permissions import (
    PERM_ADMIN,
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
)
from app.services.rbac.seed import (
    ADMIN_ROLE,
    GUEST_ROLE,
    USER_ROLE,
    default_guest_permissions,
    default_user_permissions,
)


def test_the_role_is_named_user():
    assert USER_ROLE == "user"
    assert {GUEST_ROLE, ADMIN_ROLE, USER_ROLE} == {"guest", "admin", "user"}


def test_it_holds_everything_guest_holds():
    assert default_guest_permissions() <= default_user_permissions()


def test_it_adds_exactly_the_two_self_permissions():
    extra = default_user_permissions() - default_guest_permissions()
    assert extra == {PERM_SELF_LIST, PERM_SELF_PERSONAL_NOTES}


def test_it_is_not_an_admin():
    assert PERM_ADMIN not in default_user_permissions()
