"""
The `user` role is three ideas, not a subsystem: everything a guest may read,
plus write-your-own-list, plus write-your-own-personal-notes. Catalogue writes
stay behind require_manage_catalog, so granting this role adds no admin
surface at all.
"""

from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
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
    assert PERM_ADMIN_AUTHZ not in default_user_permissions()
    assert PERM_MANAGE_CATALOG not in default_user_permissions()
    assert PERM_MANAGE_PIPELINES not in default_user_permissions()
