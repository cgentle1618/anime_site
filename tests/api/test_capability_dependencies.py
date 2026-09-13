"""
The three dependencies that replace Depends(get_current_admin).

Each is require_permission bound to one capability, so they answer 401 with
the one error shape the SPA knows - never 403.
"""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_db
from app.services.rbac.resolver import (
    Viewer,
    require_admin_authz,
    require_manage_catalog,
    require_manage_pipelines,
)


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def probe_app(db_session):
    """A throwaway app exposing one route per dependency."""
    app = FastAPI()

    @app.get("/authz")
    def authz(viewer: Viewer = Depends(require_admin_authz)):
        return {"ok": viewer.role_name}

    @app.get("/catalog")
    def catalog(viewer: Viewer = Depends(require_manage_catalog)):
        return {"ok": viewer.role_name}

    @app.get("/pipelines")
    def pipelines(viewer: Viewer = Depends(require_manage_pipelines)):
        return {"ok": viewer.role_name}

    app.dependency_overrides[get_db] = lambda: db_session
    return app


def test_an_anonymous_caller_is_refused_by_all_three(probe_app):
    client = TestClient(probe_app)
    for path in ("/authz", "/catalog", "/pipelines"):
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.headers["WWW-Authenticate"] == "Bearer"


def test_the_admin_account_passes_all_three(probe_app, admin_user, db):
    """is_root short-circuits, so Phase A changes nothing for the owner."""
    from app.services.security import create_access_token

    client = TestClient(probe_app)
    token = create_access_token({"sub": admin_user.username, "role": "admin"})
    client.cookies.set("access_token", f"Bearer {token}")
    for path in ("/authz", "/catalog", "/pipelines"):
        assert client.get(path).status_code == 200, path


def test_a_super_account_manages_but_cannot_touch_authorization(
    probe_app, db
):
    import uuid

    from app import models
    from app.services.rbac import cache as rbac_cache
    from app.services.rbac.seed import (
        SUPER_ROLE,
        default_super_permissions,
        ensure_rbac_seed,
    )
    from app.services.security import create_access_token, get_password_hash

    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    assert default_super_permissions()  # guard: the seed is not empty
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="supertester",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()

    client = TestClient(probe_app)
    token = create_access_token({"sub": "supertester", "role": SUPER_ROLE})
    client.cookies.set("access_token", f"Bearer {token}")

    assert client.get("/catalog").status_code == 200
    assert client.get("/pipelines").status_code == 200
    assert client.get("/authz").status_code == 401
