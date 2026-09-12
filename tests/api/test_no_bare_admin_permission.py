"""
The bare `admin` permission is gone, and nothing may quietly reintroduce it.

While it existed, a router that had not been re-gated kept working - the admin
role is is_root, so has() answered True for anything. That made a missed
router invisible. Removing the name turns the same mistake into an ImportError
at startup.
"""

from pathlib import Path

from app.services.rbac.permissions import static_catalog

APP = Path(__file__).resolve().parents[2] / "app"


def test_the_bare_admin_permission_is_not_in_the_catalog():
    assert "admin" not in static_catalog()


def test_no_module_imports_get_current_admin():
    offenders = [
        path.relative_to(APP).as_posix()
        for path in APP.rglob("*.py")
        if "get_current_admin" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []


def test_every_catalogued_permission_has_a_family():
    """A bare name would split to ("x", "") and belong to no family."""
    from app.services.rbac.permissions import PERMISSION_FAMILIES, split_perm

    for permission in static_catalog():
        family, key = split_perm(permission)
        assert key, f"{permission} is a bare name"
        assert family in PERMISSION_FAMILIES, permission
