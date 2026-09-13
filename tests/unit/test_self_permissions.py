"""
The `self` family: permissions a viewer holds over their OWN rows.

Distinct from every existing family, which answers "may you SEE this". These
answer "may you WRITE your own". They are deliberately absent from
default_guest_permissions(): a guest has no rows of their own to write, and a
guest who held self.list would be handed a list the moment accounts existed.
"""

from app.services.rbac.permissions import (
    FAMILY_SELF,
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
    PERMISSION_FAMILIES,
    SELF_PERMISSION_KEYS,
    self_perm,
    split_perm,
    static_catalog,
)
from app.services.rbac.seed import default_guest_permissions


def test_the_two_self_permissions_have_the_names_the_plan_promised():
    assert PERM_SELF_LIST == "self.list"
    assert PERM_SELF_PERSONAL_NOTES == "self.personal_notes"
    assert self_perm("list") == PERM_SELF_LIST
    assert SELF_PERMISSION_KEYS == ("list", "personal_notes")


def test_self_is_a_declared_family():
    assert FAMILY_SELF == "self"
    assert FAMILY_SELF in PERMISSION_FAMILIES


def test_split_perm_handles_the_new_family():
    assert split_perm(PERM_SELF_PERSONAL_NOTES) == ("self", "personal_notes")


def test_both_are_in_the_static_catalog():
    catalog = static_catalog()
    assert PERM_SELF_LIST in catalog
    assert PERM_SELF_PERSONAL_NOTES in catalog


def test_guest_holds_neither():
    guest = default_guest_permissions()
    assert PERM_SELF_LIST not in guest
    assert PERM_SELF_PERSONAL_NOTES not in guest
