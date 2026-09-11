"""
Running a pipeline is a separate permission from editing the catalogue.

The distinction is blast radius: an account that may fix a typo on an entry
must not thereby be able to overwrite every table with a Pull All. A tab of a
Pull All silently rolled back on 2026-09-11, which is the failure this split
is drawn around.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.permissions import PERM_MANAGE_CATALOG
from app.services.rbac.seed import default_guest_permissions
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def catalog_only_client(db, client):
    """An account holding manage.catalog but NOT manage.pipelines."""
    role = models.Role(
        system_id=uuid.uuid4(),
        name="catalog-only",
        label="Catalogue only",
        is_system=False,
        is_superuser=False,
    )
    db.add(role)
    db.flush()
    for permission in default_guest_permissions() | {PERM_MANAGE_CATALOG}:
        db.add(
            models.RolePermission(role_id=role.system_id, permission=permission)
        )
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="catalogonly",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": "catalogonly", "role": role.name})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


@pytest.mark.parametrize("path", ["/api/system/logs", "/api/data-control/check/duplicates"])
def test_manage_catalog_alone_does_not_open_the_pipelines(
    catalog_only_client, path
):
    response = catalog_only_client.get(path)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize("path", ["/api/system/logs", "/api/data-control/check/duplicates"])
def test_the_admin_account_still_reaches_the_pipelines(admin_client, path):
    assert admin_client.get(path).status_code in (200, 404, 405)


@pytest.fixture
def super_client(db, client):
    """An account holding the seeded `super` role, which has both manage.*."""
    from app.services.rbac.seed import SUPER_ROLE, ensure_rbac_seed

    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="superpipes",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": "superpipes", "role": SUPER_ROLE})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


@pytest.mark.parametrize("path", ["/api/system/logs", "/api/data-control/check/duplicates"])
def test_super_may_run_the_pipelines(super_client, path):
    """
    The failing case that drives this task.

    Before the swap these routers ask for the bare `admin`, which `super` does
    not hold and is not superuser for - so this is a 401. After the swap they
    ask for manage.pipelines, which the seeded super role does hold.
    """
    assert super_client.get(path).status_code in (200, 404, 405)
