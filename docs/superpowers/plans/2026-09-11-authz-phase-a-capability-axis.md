# Authorization Phase A — the capability axis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `admin` permission with three named ones —
`admin.authz`, `manage.catalog`, `manage.pipelines` — and seed a `super` role
that holds the two `manage.*` but not `admin.authz`.

**Architecture:** `get_current_admin` is already a thin wrapper over
`viewer.has(PERM_ADMIN)`, so this is a per-router swap of one dependency, not 89
hand edits. Three module-level dependency singletons are added beside
`require_permission` in `resolver.py`; each router swaps its import and its
`Depends(...)`. The `admin` role stays `is_superuser=True`, so `has()`
short-circuits true for every new permission — which means **every task in this
plan is behaviour-neutral for the owner's account**, before and after, and a
half-applied Phase A cannot lock anyone out. The last task deletes
`get_current_admin` and `PERM_ADMIN` so any missed call site becomes an
ImportError rather than a silent grant.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL 17, pytest; React + Vite,
vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`
— section 1 and its "Consequences named". Read it before Task 1.

## Global Constraints

- **No Alembic migration in Phase A.** Roles are seeded by `ensure_rbac_seed`
  at lifespan, which is idempotent and tops up a role holding nothing. The
  `super` role therefore appears on the next app start on both machines. Do not
  add a revision; there is no schema change in this phase.
- **401, never 403.** Every gate in this codebase answers 401 with
  `"Could not validate credentials or insufficient permissions"` and a
  `WWW-Authenticate: Bearer` header. `require_permission` already does this.
- **`cache.bump()` on every grant write.** Unchanged by this phase, but do not
  remove a call.
- **Media-type keys are hyphenated** in the data layer (`anime-movie`,
  `tv-show`) and underscored in the registry. Not touched here.
- **Concurrent sessions:** stage only the files a task names. Never
  `git add -A`, never a directory pathspec. Stage and commit in one command.
- **Four gates stay green:** `venv/Scripts/python.exe -m pytest -q`,
  `venv/Scripts/ruff.exe check .`, and in `frontend/`: `npm run test:run`,
  `npm run lint`. Run `npm run build` after any frontend change.

---

### Task 1: Mint the three permissions

**Files:**
- Modify: `app/services/rbac/permissions.py`
- Modify: `app/routers/roles.py:94-166` (the `/catalog` endpoint)
- Test: `tests/api/test_permission_catalog.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `PERM_ADMIN_AUTHZ = "admin.authz"`,
  `PERM_MANAGE_CATALOG = "manage.catalog"`,
  `PERM_MANAGE_PIPELINES = "manage.pipelines"`,
  `FAMILY_MANAGE = "manage"`, `manage_perm(key) -> str`,
  `admin_perm(key) -> str`. Every later task imports these from
  `app.services.rbac.permissions`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_permission_catalog.py`:

```python
"""
The three capability permissions that replace the bare `admin`.

`admin.authz` is the ability to change who may do what. `manage.catalog` is
every catalogue write. `manage.pipelines` is Backup, Pull, Fill, Replace and
Calculate - split out because a helper account should be able to fix a typo
without being able to overwrite the whole database.
"""

import pytest

from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    is_valid,
    split_perm,
    static_catalog,
)


@pytest.fixture
def db(db_session):
    return db_session


def test_the_three_permissions_are_in_the_static_catalog():
    catalog = static_catalog()
    assert PERM_ADMIN_AUTHZ in catalog
    assert PERM_MANAGE_CATALOG in catalog
    assert PERM_MANAGE_PIPELINES in catalog


def test_they_validate_as_grantable(db):
    for permission in (PERM_ADMIN_AUTHZ, PERM_MANAGE_CATALOG,
                       PERM_MANAGE_PIPELINES):
        assert is_valid(db, permission), permission


def test_they_split_into_family_and_key():
    assert split_perm(PERM_ADMIN_AUTHZ) == ("admin", "authz")
    assert split_perm(PERM_MANAGE_CATALOG) == ("manage", "catalog")
    assert split_perm(PERM_MANAGE_PIPELINES) == ("manage", "pipelines")


def test_the_role_editor_offers_them(admin_client):
    families = {f["family"]: f for f in admin_client.get("/api/roles/catalog").json()}
    assert "manage" in families
    offered = {p["permission"] for p in families["manage"]["permissions"]}
    assert offered == {PERM_MANAGE_CATALOG, PERM_MANAGE_PIPELINES}
    admin_family = {p["permission"] for p in families["admin"]["permissions"]}
    assert PERM_ADMIN_AUTHZ in admin_family


def test_every_offered_permission_has_a_label_and_description(admin_client):
    """A permission with no copy is unusable in the editor."""
    for family in admin_client.get("/api/roles/catalog").json():
        for permission in family["permissions"]:
            assert permission["label"], permission
            assert permission["description"], permission
```

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_permission_catalog.py -q
```

Expected: `ImportError: cannot import name 'PERM_ADMIN_AUTHZ'`.

- [ ] **Step 3: Add the vocabulary**

In `app/services/rbac/permissions.py`, after the `PERM_ADMIN = "admin"` line and
its family constants, add:

```python
FAMILY_ADMIN = "admin"
# What an account may DO, as opposed to which objects it may reach. The bare
# `admin` above is the old single permission and is removed at the end of
# Phase A; these three replace it.
FAMILY_MANAGE = "manage"

ADMIN_PERMISSION_KEYS: tuple[str, ...] = ("authz",)
MANAGE_PERMISSION_KEYS: tuple[str, ...] = ("catalog", "pipelines")

ADMIN_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "authz": (
        "Manage Authorization",
        "Create and edit roles, accounts and content labels - that is, change "
        "who may do what. Does not itself grant any catalogue write.",
    ),
}

MANAGE_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "catalog": (
        "Manage Catalogue",
        "Add, change and delete entries, groups, people, studios, publishers, "
        "characters, credits, options, relations, watch orders and catalogue "
        "notes.",
    ),
    "pipelines": (
        "Run Pipelines",
        "Backup, Pull, Fill, Replace and Calculate. Separate from the "
        "catalogue because a single Pull All overwrites every table.",
    ),
}


def admin_perm(key: str) -> str:
    """Permission to change who may do what."""
    return f"{FAMILY_ADMIN}.{key}"


def manage_perm(key: str) -> str:
    """Permission to perform one class of catalogue-side operation."""
    return f"{FAMILY_MANAGE}.{key}"


PERM_ADMIN_AUTHZ = admin_perm("authz")
PERM_MANAGE_CATALOG = manage_perm("catalog")
PERM_MANAGE_PIPELINES = manage_perm("pipelines")
```

Add `FAMILY_ADMIN` and `FAMILY_MANAGE` to `PERMISSION_FAMILIES`:

```python
PERMISSION_FAMILIES: tuple[str, ...] = (
    FAMILY_ADMIN,
    FAMILY_MANAGE,
    FAMILY_MEDIA_TYPE,
    FAMILY_FIELD_GROUP,
    FAMILY_LABEL,
    FAMILY_SELF,
)
```

And extend `static_catalog()`:

```python
def static_catalog() -> frozenset[str]:
    """Every permission knowable without a database."""
    return frozenset(
        {PERM_ADMIN}
        | {admin_perm(key) for key in ADMIN_PERMISSION_KEYS}
        | {manage_perm(key) for key in MANAGE_PERMISSION_KEYS}
        | {media_type_perm(media_type) for media_type in MEDIA_TYPE_KEYS}
        | {field_group_perm(key) for key in FIELD_GROUP_KEYS}
        | {self_perm(key) for key in SELF_PERMISSION_KEYS}
    )
```

- [ ] **Step 4: Offer them in the role editor**

In `app/routers/roles.py`, extend the imports from
`app.services.rbac.permissions` with `ADMIN_PERMISSION_KEYS`,
`ADMIN_PERMISSION_LABELS`, `FAMILY_MANAGE`, `MANAGE_PERMISSION_KEYS`,
`MANAGE_PERMISSION_LABELS`, `admin_perm` and `manage_perm`.

Replace the first entry of the list `get_catalog` returns — the one whose
`family=PERM_ADMIN` — with these two, keeping every other family unchanged:

```python
        schemas.PermissionFamilyOut(
            family=PERM_ADMIN,
            label="Administration",
            permissions=[
                schemas.PermissionOut(
                    permission=PERM_ADMIN,
                    label="Administrator",
                    description=(
                        "Full access. A role marked superuser holds every "
                        "permission without being granted them."
                    ),
                )
            ]
            + [
                schemas.PermissionOut(
                    permission=admin_perm(key),
                    label=ADMIN_PERMISSION_LABELS[key][0],
                    description=ADMIN_PERMISSION_LABELS[key][1],
                )
                for key in ADMIN_PERMISSION_KEYS
            ],
        ),
        schemas.PermissionFamilyOut(
            family=FAMILY_MANAGE,
            label="Management",
            permissions=[
                schemas.PermissionOut(
                    permission=manage_perm(key),
                    label=MANAGE_PERMISSION_LABELS[key][0],
                    description=MANAGE_PERMISSION_LABELS[key][1],
                )
                for key in MANAGE_PERMISSION_KEYS
            ],
        ),
```

- [ ] **Step 5: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_permission_catalog.py -q
venv/Scripts/ruff.exe check app tests
```

Expected: 5 passed, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add app/services/rbac/permissions.py app/routers/roles.py tests/api/test_permission_catalog.py
git commit -m "feat(authz): mint admin.authz, manage.catalog and manage.pipelines"
```

---

### Task 2: Seed the `super` role

**Files:**
- Modify: `app/services/rbac/seed.py`
- Test: `tests/api/test_super_role_seed.py` (create)

**Interfaces:**
- Consumes: `PERM_MANAGE_CATALOG`, `PERM_MANAGE_PIPELINES` from Task 1.
- Produces: `SUPER_ROLE = "super"` and
  `default_super_permissions() -> set[str]` in
  `app.services.rbac.seed`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_super_role_seed.py`:

```python
"""
`super` is everything except the ability to change who may do what.

It is the shape a second person takes: they can fix an entry and run a
pipeline, but cannot grant themselves anything or edit a role. The owner's
`admin` account remains a superset and is unaffected.
"""

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
)
from app.services.rbac.seed import (
    SUPER_ROLE,
    default_super_permissions,
    default_user_permissions,
    ensure_rbac_seed,
)


@pytest.fixture
def db(db_session):
    return db_session


def test_the_super_role_exists_after_seeding(db):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    assert role.is_system is True
    assert role.is_superuser is False


def test_super_holds_both_manage_permissions_and_not_authz():
    granted = default_super_permissions()
    assert PERM_MANAGE_CATALOG in granted
    assert PERM_MANAGE_PIPELINES in granted
    assert PERM_ADMIN_AUTHZ not in granted


def test_super_is_a_superset_of_user():
    """A super account still has its own list and its own personal notes."""
    assert default_user_permissions() <= default_super_permissions()


def test_seeding_twice_does_not_duplicate_the_role(db):
    ensure_rbac_seed(db)
    db.flush()
    ensure_rbac_seed(db)
    db.flush()
    assert (
        db.query(models.Role).filter(models.Role.name == SUPER_ROLE).count() == 1
    )


def test_a_grant_removed_by_hand_is_not_handed_back(db):
    """Matches the rule guest and user already follow: top up only a role
    holding nothing at all."""
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db.query(models.RolePermission).filter(
        models.RolePermission.role_id == role.system_id,
        models.RolePermission.permission == PERM_MANAGE_PIPELINES,
    ).delete()
    db.flush()

    ensure_rbac_seed(db)
    db.flush()

    held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }
    assert PERM_MANAGE_PIPELINES not in held
```

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_super_role_seed.py -q
```

Expected: `ImportError: cannot import name 'SUPER_ROLE'`.

- [ ] **Step 3: Add the role and its grant set**

In `app/services/rbac/seed.py`, import the two permissions alongside the
existing ones:

```python
from app.services.rbac.permissions import (
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
    field_group_perm,
    media_type_perm,
)
```

Add the role name beside the other three:

```python
USER_ROLE = "user"
# Everything except the ability to change who may do what. NOT is_superuser:
# the point of the role is that its grant set is finite and inspectable, so a
# permission minted in code reaches it only when someone grants it.
SUPER_ROLE = "super"
```

Add the grant set beneath `default_user_permissions`:

```python
def default_super_permissions() -> set[str]:
    """
    A super account: everything a signed-in member has, plus both management
    permissions. Derived from default_user_permissions() rather than restated,
    so a media type or field group added later reaches this role too.

    admin.authz is deliberately absent. That is the whole distinction between
    this role and the admin account.
    """
    return default_user_permissions() | {
        PERM_MANAGE_CATALOG,
        PERM_MANAGE_PIPELINES,
    }
```

Inside `ensure_rbac_seed`, create the role after the `user` role block:

```python
    super_role = _ensure_role(
        db,
        SUPER_ROLE,
        label="Super",
        description=(
            "Manages the catalogue and runs the pipelines. Cannot change "
            "roles, accounts or content labels."
        ),
        is_system=True,
        is_superuser=False,
        sort_order=75,
    )
```

And top it up with the same guard the other two use, after the `user` top-up:

```python
    super_held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == super_role.system_id
        )
    }
    if not super_held:
        for permission in sorted(default_super_permissions()):
            db.add(
                models.RolePermission(
                    role_id=super_role.system_id, permission=permission
                )
            )
```

- [ ] **Step 4: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_super_role_seed.py -q
venv/Scripts/ruff.exe check app tests
```

Expected: 5 passed, ruff clean.

- [ ] **Step 5: Commit**

```bash
git add app/services/rbac/seed.py tests/api/test_super_role_seed.py
git commit -m "feat(authz): seed the super role holding both manage permissions"
```

---

### Task 3: The three route dependencies

**Files:**
- Modify: `app/services/rbac/resolver.py` (after `require_permission`, ~line 138)
- Test: `tests/api/test_capability_dependencies.py` (create)

**Interfaces:**
- Consumes: Task 1's permission constants; Task 2's `SUPER_ROLE`.
- Produces: `require_admin_authz`, `require_manage_catalog`,
  `require_manage_pipelines` — three ready-made FastAPI dependencies in
  `app.services.rbac.resolver`, each returning the `Viewer`. Every router task
  imports these.

They live in `resolver.py` and not `dependencies.py` deliberately:
`resolver.py` already imports `dependencies` for `SECRET_KEY` and `get_db`, so
defining them the other way round would be a circular import.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_capability_dependencies.py`:

```python
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
    """is_superuser short-circuits, so Phase A changes nothing for the owner."""
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_capability_dependencies.py -q
```

Expected: `ImportError: cannot import name 'require_admin_authz'`.

- [ ] **Step 3: Define the three dependencies**

In `app/services/rbac/resolver.py`, immediately after the `require_permission`
function, add:

```python
# The three capability gates, bound once at import. Routers depend on these by
# name rather than calling require_permission inline, so that swapping a
# router's gate is a one-word edit and so that grepping for a capability finds
# every route holding it.
require_admin_authz = require_permission(PERM_ADMIN_AUTHZ)
require_manage_catalog = require_permission(PERM_MANAGE_CATALOG)
require_manage_pipelines = require_permission(PERM_MANAGE_PIPELINES)
```

Add the imports at the top of `resolver.py`, beside its existing imports:

```python
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
)
```

- [ ] **Step 4: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_capability_dependencies.py -q
venv/Scripts/ruff.exe check app tests
```

Expected: 3 passed, ruff clean. If ruff reports a circular import, the
permissions import was added to the wrong module — it belongs in `resolver.py`,
which already imports `dependencies`, never the reverse.

- [ ] **Step 5: Commit**

```bash
git add app/services/rbac/resolver.py tests/api/test_capability_dependencies.py
git commit -m "feat(authz): add the three capability route dependencies"
```

---

### Task 4: Swap the authorization routers to `admin.authz`

**Files:**
- Modify: `app/routers/roles.py:24,49`
- Modify: `app/routers/users.py:32` (and its two other `get_current_admin` uses)
- Modify: `app/routers/content_labels.py:22,32`
- Test: `tests/api/test_authz_router_gates.py` (create)

**Interfaces:**
- Consumes: `require_admin_authz` from Task 3.
- Produces: nothing new.

All three gate at **router level** — one `dependencies=[...]` line each — so this
is three one-line swaps plus their imports.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_authz_router_gates.py`:

```python
"""
Changing who may do what is admin-only.

A super account manages the catalogue and runs pipelines, but must not be able
to grant itself anything, edit a role, create an account, or change a content
label - the labels being what the access-mode axis will scope in Phase B.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed import SUPER_ROLE, ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def super_client(db, client):
    """Logged in as an account holding the `super` role."""
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="supergate",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": "supergate", "role": SUPER_ROLE})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


@pytest.mark.parametrize(
    "path",
    ["/api/roles/", "/api/users/", "/api/content-labels/"],
)
def test_super_is_refused_the_authorization_routers(super_client, path):
    response = super_client.get(path)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "path",
    ["/api/roles/", "/api/users/", "/api/content-labels/"],
)
def test_the_admin_account_still_reaches_them(admin_client, path):
    assert admin_client.get(path).status_code == 200
```

- [ ] **Step 2: Run it and expect it to PASS — this task is a pure refactor**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_authz_router_gates.py -q
```

Expected: **6 passed, before any change is made.** This is correct and is not a
reason to stop.

No failing test is possible for this task, and it is worth understanding why
rather than trying to manufacture one. Before the swap the gate asks for
`admin`; a `super` account is not `is_superuser` and holds no `admin` grant, so
it is refused. After the swap the gate asks for `admin.authz`, which `super` is
also not granted, so it is refused identically. The owner's `admin` account
passes both ways through `is_superuser`. The observable behaviour of these
three routers is unchanged by design — that is the whole point of Phase A being
safe to apply in pieces.

The tests above are therefore **characterisation tests**: they pin the
behaviour so that Phase B, which does change who reaches these routers, cannot
alter it silently. What actually protects this task is the full suite staying
green plus Task 9's ImportError sweep, which is what catches a router nobody
re-gated.

Do not skip the step. A subagent that sees green here should record "passes
before and after, as the plan predicts" and continue.

- [ ] **Step 3: Swap the three routers**

In each of `app/routers/roles.py`, `app/routers/users.py` and
`app/routers/content_labels.py`:

Change the import line from:

```python
from app.dependencies import get_current_admin, get_db
```

to:

```python
from app.dependencies import get_db
from app.services.rbac.resolver import require_admin_authz
```

and every `Depends(get_current_admin)` to `Depends(require_admin_authz)`.

`users.py` has three occurrences (the router-level one at line 32 and two
others); `roles.py` and `content_labels.py` have one each, at router level.
Confirm none remain:

```bash
grep -n "get_current_admin" app/routers/roles.py app/routers/users.py app/routers/content_labels.py
```

Expected: no output.

- [ ] **Step 4: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_authz_router_gates.py tests/api/test_roles.py tests/api/test_users.py -q
venv/Scripts/ruff.exe check app tests
```

Expected: all pass. (If `tests/api/test_roles.py` or `test_users.py` do not
exist under those names, run `venv/Scripts/python.exe -m pytest -q -k "role or user"` instead.)

- [ ] **Step 5: Commit**

```bash
git add app/routers/roles.py app/routers/users.py app/routers/content_labels.py tests/api/test_authz_router_gates.py
git commit -m "feat(authz): gate roles, users and content labels on admin.authz"
```

---

### Task 5: Swap the pipeline routers to `manage.pipelines`

**Files:**
- Modify: `app/routers/system.py:16,23`
- Modify: `app/routers/data_control.py:18,43`
- Test: `tests/api/test_pipeline_router_gates.py` (create)

**Interfaces:**
- Consumes: `require_manage_pipelines` from Task 3.
- Produces: nothing new.

Both gate at router level. This is the task that makes the `manage.catalog` /
`manage.pipelines` split real.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_pipeline_router_gates.py`:

```python
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


@pytest.mark.parametrize("path", ["/api/system/", "/api/data-control/"])
def test_manage_catalog_alone_does_not_open_the_pipelines(
    catalog_only_client, path
):
    response = catalog_only_client.get(path)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize("path", ["/api/system/", "/api/data-control/"])
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


@pytest.mark.parametrize("path", ["/api/system/", "/api/data-control/"])
def test_super_may_run_the_pipelines(super_client, path):
    """
    The failing case that drives this task.

    Before the swap these routers ask for the bare `admin`, which `super` does
    not hold and is not superuser for - so this is a 401. After the swap they
    ask for manage.pipelines, which the seeded super role does hold.
    """
    assert super_client.get(path).status_code in (200, 404, 405)
```

The `in (200, 404, 405)` assertions are deliberate: a prefix may expose no bare
`GET /`, and what is being tested is that the **gate** does not answer 401, not
that a particular route exists.

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_pipeline_router_gates.py -q
```

Expected: the two `test_super_may_run_the_pipelines` cases FAIL with 401. The
other four pass already — the `catalog_only` refusal is a characterisation test
(that account is refused both before and after, since it holds neither `admin`
nor `manage.pipelines`), and it earns its place by pinning the split once
`super` can reach these routes.

If the failures are not 401, correct the two prefixes in the parametrize lists
against the routers' real ones before continuing:

```bash
grep -n "prefix=" app/routers/system.py app/routers/data_control.py
```

- [ ] **Step 3: Swap the two routers**

In both `app/routers/system.py` and `app/routers/data_control.py`, change:

```python
from app.dependencies import get_current_admin, get_db
```

to:

```python
from app.dependencies import get_db
from app.services.rbac.resolver import require_manage_pipelines
```

and `Depends(get_current_admin)` to `Depends(require_manage_pipelines)`.

Confirm:

```bash
grep -n "get_current_admin" app/routers/system.py app/routers/data_control.py
```

Expected: no output.

- [ ] **Step 4: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_pipeline_router_gates.py -q
venv/Scripts/python.exe -m pytest -q -k "pull or backup or data_control or system"
venv/Scripts/ruff.exe check app tests
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/routers/system.py app/routers/data_control.py tests/api/test_pipeline_router_gates.py
git commit -m "feat(authz): gate the pipelines on manage.pipelines"
```

---

### Task 6: Swap the catalogue routers to `manage.catalog`

**Files:** Modify each of these, replacing the `get_current_admin` import and
every `Depends(get_current_admin)`:

- `app/routers/_factory.py` (5)
- `app/routers/watch_order.py` (17)
- `app/routers/collection.py` (4), `franchise.py` (4), `series.py` (4)
- `app/routers/person.py` (4), `studio.py` (4), `publisher.py` (4),
  `character.py` (4), `casting.py` (1), `credits.py` (1)
- `app/routers/quote.py` (4), `meme.py` (4), `media_relation.py` (4)
- `app/routers/options.py` (3), `announcements.py` (3), `form_defaults.py` (4)
- `app/routers/constants.py` (1), `comic.py` (1), `game.py` (1)

- Test: `tests/api/test_catalog_router_gates.py` (create)

**Interfaces:**
- Consumes: `require_manage_catalog` from Task 3.
- Produces: nothing new.

**Do not include `plan_next.py`** — its three are dropped entirely in Task 7,
not swapped. **Do not include `me_list.py`** — its only match is a docstring
mention, not a call.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_catalog_router_gates.py`:

```python
"""
A super account may edit the catalogue; an ordinary member may not.

One representative route per router family rather than all 80: the gate is one
dependency and the swap is mechanical, so the risk is a router MISSED, which
Task 9's deletion of get_current_admin catches by import error. What these
pin is that the permission chosen is the right one.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed import SUPER_ROLE, ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


def _login_as(db, client, username, role_name):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == role_name).one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username=username,
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": username, "role": role_name})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


def test_a_member_cannot_create_a_collection(db, client):
    _login_as(db, client, "plainmember", "user")
    response = client.post("/api/collection/", json={"collection_name_en": "X"})
    assert response.status_code == 401


def test_super_can_create_a_collection(db, client):
    _login_as(db, client, "supercatalog", SUPER_ROLE)
    response = client.post("/api/collection/", json={"collection_name_en": "X"})
    assert response.status_code in (200, 201)


def test_a_member_cannot_create_a_person(db, client):
    _login_as(db, client, "plainmember2", "user")
    response = client.post("/api/person/", json={"name_en": "Nobody"})
    assert response.status_code == 401


def test_super_can_create_a_person(db, client):
    _login_as(db, client, "supercatalog2", SUPER_ROLE)
    response = client.post("/api/person/", json={"name_en": "Somebody"})
    assert response.status_code in (200, 201)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_catalog_router_gates.py -q
```

Expected: the two `super_can_*` cases FAIL with 401, because `super` does not
hold the bare `admin` these routers still ask for. If a payload shape is
rejected with 422 instead, fix the payload to match that router's schema before
continuing — a 422 means the gate passed, which is not what is being tested.

- [ ] **Step 3: Swap every router in the Files list**

For each file, the edit is identical. Change the import from:

```python
from app.dependencies import get_current_admin, get_db
```

to:

```python
from app.dependencies import get_db
from app.services.rbac.resolver import require_manage_catalog
```

and every `Depends(get_current_admin)` to `Depends(require_manage_catalog)`.

Some files import `get_current_admin` alongside other names — keep those:

```python
from app.dependencies import get_current_admin, get_current_user_id, get_db
```

becomes

```python
from app.dependencies import get_current_user_id, get_db
from app.services.rbac.resolver import require_manage_catalog
```

Work one file at a time and confirm as you go:

```bash
grep -rn "get_current_admin" app/routers/ | grep -v plan_next | grep -v "^app/routers/me_list.py:7"
```

Expected when done: no output.

- [ ] **Step 4: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_catalog_router_gates.py -q
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check app tests
```

Expected: the new file passes and the full suite is green. A failure here is
almost certainly a router whose import was edited but whose `Depends` was not,
or vice versa.

- [ ] **Step 5: Commit**

```bash
git add app/routers/_factory.py app/routers/watch_order.py app/routers/collection.py app/routers/franchise.py app/routers/series.py app/routers/person.py app/routers/studio.py app/routers/publisher.py app/routers/character.py app/routers/casting.py app/routers/credits.py app/routers/quote.py app/routers/meme.py app/routers/media_relation.py app/routers/options.py app/routers/announcements.py app/routers/form_defaults.py app/routers/constants.py app/routers/comic.py app/routers/game.py tests/api/test_catalog_router_gates.py
git commit -m "feat(authz): gate every catalogue router on manage.catalog"
```

---

### Task 7: Drop the three `plan_next.py` admin gates

**Files:**
- Modify: `app/routers/plan_next.py:23,145,195,224`
- Test: `tests/api/test_plan_next_is_per_user.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

These three writes are the caller's **own** plan rows — each already takes
`user_id: UUID = Depends(get_current_user_id)` on the line below. The admin gate
is a leftover from when the admin was the only account, and it means an ordinary
member cannot manage their own plan.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_plan_next_is_per_user.py`:

```python
"""
A plan row belongs to the account that made it, so an ordinary member may
write their own.

The three write routes carried Depends(get_current_admin) from when the admin
was the only account, while already taking get_current_user_id on the next
line - so the row was always the caller's, and the gate only decided whether
the caller was allowed to have one.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed import ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def member_client(db, client):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="planner",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": "planner", "role": "user"})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


def test_a_member_can_create_their_own_plan_row(member_client, sample_anime):
    response = member_client.post(
        "/api/plan-next/",
        json={
            "kind": "Watch Next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code in (200, 201), response.text


def test_the_row_belongs_to_the_caller(member_client, db, sample_anime):
    member_client.post(
        "/api/plan-next/",
        json={
            "kind": "Watch Next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    planner = db.query(models.User).filter(
        models.User.username == "planner"
    ).one()
    rows = db.query(models.PlanNext).filter(
        models.PlanNext.user_id == planner.id
    ).count()
    assert rows == 1


def test_an_anonymous_caller_is_still_refused(client, sample_anime):
    response = client.post(
        "/api/plan-next/",
        json={
            "kind": "Watch Next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code == 401
```

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_is_per_user.py -q
```

Expected: the first two FAIL with 401. If the POST body is rejected with 422,
correct it against `app/schemas/plan_next.py` before continuing.

- [ ] **Step 3: Remove the three gates**

In `app/routers/plan_next.py`, delete these three lines — one at 145, 195 and
224, each immediately above a `user_id: UUID = Depends(get_current_user_id)`:

```python
    _admin=Depends(get_current_admin),
```

Then drop `get_current_admin` from the import on line 23:

```python
from app.dependencies import get_current_user_id, get_db
```

`get_current_user_id` already raises 401 for an anonymous caller, which is what
keeps the third test passing.

- [ ] **Step 4: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_is_per_user.py -q
venv/Scripts/python.exe -m pytest -q -k plan
venv/Scripts/ruff.exe check app tests
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/routers/plan_next.py tests/api/test_plan_next_is_per_user.py
git commit -m "fix(plan): a member may write their own plan rows"
```

---

### Task 8: Redefine `is_admin` and split the SPA's route guard

**Files:**
- Modify: `app/routers/auth.py:101-107` (the `/me` payload)
- Modify: `frontend/src/App.jsx:178-195` (the admin route block)
- Test: `tests/api/test_me_is_admin.py` (create)
- Test: `frontend/src/App.test.jsx` if it exists; otherwise none

**Interfaces:**
- Consumes: Task 1's `PERM_MANAGE_CATALOG`, `PERM_ADMIN_AUTHZ`.
- Produces: `/api/auth/me` continues to return `is_admin`, now meaning
  "holds `manage.catalog`".

`isAdmin` has 394 uses across 77 files and they overwhelmingly mean "may this
person edit the catalogue?". Redefining the alias leaves them correct and adds
the edit surface for `super`; only the three authorization pages need the
finer permission.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_me_is_admin.py`:

```python
"""
`is_admin` in /api/auth/me means "may edit the catalogue".

It is an alias kept for the SPA's 394 existing call sites, which gate edit
buttons, notes editors and tracker controls - all catalogue-editing concerns.
Redefining it to manage.catalog leaves those correct and correctly opens them
to a super account. The authorization pages ask for admin.authz instead.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ, PERM_MANAGE_CATALOG
from app.services.rbac.seed import SUPER_ROLE, ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


def test_a_super_account_reads_as_is_admin(db, client):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="superme",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    client.cookies.set(
        "access_token",
        f"Bearer {create_access_token({'sub': 'superme', 'role': SUPER_ROLE})}",
    )

    body = client.get("/api/auth/me").json()
    assert body["is_admin"] is True
    assert PERM_MANAGE_CATALOG in body["permissions"]
    assert PERM_ADMIN_AUTHZ not in body["permissions"]


def test_the_owner_account_still_reads_as_is_admin(admin_client):
    assert admin_client.get("/api/auth/me").json()["is_admin"] is True


def test_a_guest_does_not(client):
    assert client.get("/api/auth/me").json()["is_admin"] is False
```

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_me_is_admin.py -q
```

Expected: `test_a_super_account_reads_as_is_admin` FAILS — `is_admin` is False,
because `super` does not hold the bare `admin`.

- [ ] **Step 3: Redefine the flag**

In `app/routers/auth.py`, change the import of `PERM_ADMIN` to
`PERM_MANAGE_CATALOG` and the `/me` payload line from:

```python
        "is_admin": viewer.has(PERM_ADMIN),
```

to:

```python
        # Means "may edit the catalogue", not "is an administrator". The SPA's
        # 394 isAdmin call sites gate edit buttons, notes editors and tracker
        # controls, which is exactly manage.catalog - so a super account
        # correctly gains them. The three authorization pages ask for
        # admin.authz instead; see App.jsx.
        "is_admin": viewer.has(PERM_MANAGE_CATALOG),
```

- [ ] **Step 4: Split the SPA route block**

In `frontend/src/App.jsx`, the block currently reading
`<Route element={<ProtectedRoute />}>` wraps all fifteen admin pages.
`ProtectedRoute` takes a `permission` prop defaulting to `"admin"`. Replace that
one block with two:

```jsx
                {/* Catalogue and pipeline work. manage.catalog is what the
                    SPA's isAdmin has meant since Phase A, so a super account
                    reaches all of these. */}
                <Route element={<ProtectedRoute permission="manage.catalog" />}>
                  <Route path="/system" element={<Admin />} />
                  <Route path="/data-history" element={<DataHistory />} />
                  <Route path="/review-queue" element={<ReviewQueue />} />
                  <Route path="/add" element={<Add />} />
                  <Route path="/modify" element={<Modify />} />
                  <Route path="/delete" element={<Delete />} />
                  <Route path="/defaults" element={<FormDefaults />} />
                  <Route path="/watch-orders" element={<WatchOrders />} />
                  <Route path="/relations" element={<Relations />} />
                  <Route path="/options" element={<SystemOptions />} />
                  <Route path="/aliases" element={<Aliases />} />
                  <Route path="/external-apis" element={<ExternalApis />} />
                </Route>

                {/* Changing who may do what. Admin only. */}
                <Route element={<ProtectedRoute permission="admin.authz" />}>
                  <Route path="/roles" element={<Roles />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/content-labels" element={<ContentLabels />} />
                </Route>
```

- [ ] **Step 5: Run everything**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_me_is_admin.py -q
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check app tests
cd frontend && npm run test:run && npm run lint && npm run build
```

Expected: all green. `npm run build` is required — `:8000` serves the prebuilt
bundle and will otherwise show the old routes.

- [ ] **Step 6: Commit**

```bash
git add app/routers/auth.py frontend/src/App.jsx tests/api/test_me_is_admin.py
git commit -m "feat(authz): is_admin means manage.catalog; authz pages ask admin.authz"
```

---

### Task 9: Delete `get_current_admin` and `PERM_ADMIN`

**Files:**
- Modify: `app/dependencies.py:42-78` (delete `get_current_admin`)
- Modify: `app/services/rbac/permissions.py` (delete `PERM_ADMIN`, its catalog entry)
- Modify: `app/routers/roles.py` (drop the `PERM_ADMIN` catalog entry)
- Modify: `app/services/rbac/seed.py` if it references `PERM_ADMIN`
- Test: `tests/api/test_no_bare_admin_permission.py` (create)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing. This task exists to convert "a router I forgot" from a
  silent wrong grant into an ImportError.

Do this **last**. Until it runs, a missed router still works via the superuser
short-circuit and nobody notices.

**No data cleanup is needed.** Checked on the company database 2026-09-11:
`role_permission` holds **zero** rows whose permission is `admin`, and the only
roles are the three seeded ones (`guest`, `admin`, `user`). The admin role
reaches everything through `is_superuser`, never through an explicit grant, so
deleting the name orphans nothing. If a later machine disagrees, delete those
rows in the same commit rather than keeping the permission alive.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_no_bare_admin_permission.py`:

```python
"""
The bare `admin` permission is gone, and nothing may quietly reintroduce it.

While it existed, a router that had not been re-gated kept working - the admin
role is is_superuser, so has() answered True for anything. That made a missed
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_no_bare_admin_permission.py -q
```

Expected: all three FAIL.

- [ ] **Step 3: Delete both**

In `app/dependencies.py`, delete the whole `get_current_admin` function
(lines 42-78, from the `def` through its `return`). Leave `get_current_user_id`
untouched.

In `app/services/rbac/permissions.py`, delete the `PERM_ADMIN = "admin"` line,
remove `{PERM_ADMIN}` from the `static_catalog()` union, and update the module
docstring's closing sentence — it currently explains the bare name:

```python
A name is always `<family>.<key>`. The bare `admin` that used to be the
exception was removed in Phase A of the authorization redesign; it is now
three named permissions, `admin.authz` and the two `manage.*`.
```

In `app/routers/roles.py`, drop the `PERM_ADMIN` entry from the Administration
family so it lists only `admin.authz`:

```python
        schemas.PermissionFamilyOut(
            family=FAMILY_ADMIN,
            label="Administration",
            permissions=[
                schemas.PermissionOut(
                    permission=admin_perm(key),
                    label=ADMIN_PERMISSION_LABELS[key][0],
                    description=ADMIN_PERMISSION_LABELS[key][1],
                )
                for key in ADMIN_PERMISSION_KEYS
            ],
        ),
```

and remove `PERM_ADMIN` from its imports.

- [ ] **Step 4: Chase every ImportError until the suite is green**

```bash
venv/Scripts/python.exe -m pytest -q
```

Each failure names a module still importing a deleted name. For a router, the
fix is the swap from Task 4, 5 or 6 — decide which capability it belongs to by
what it does, not by where it sits. For a test, re-point it at the new
permission. **Do not** reintroduce either name to silence a failure.

- [ ] **Step 5: Run everything**

```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check app tests
cd frontend && npm run test:run && npm run lint
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/dependencies.py app/services/rbac/permissions.py app/routers/roles.py tests/api/test_no_bare_admin_permission.py
git commit -m "refactor(authz): delete the bare admin permission and its dependency"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/authorization.md` (the permission table ~line 59, the gate
  table ~line 319, the `Last verified` line at line 3)
- Modify: `docs/PROGRESS.md` (the In flight block)
- Modify: `docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`
  (mark Phase A done in "Implementation shape")

**Interfaces:** none.

- [ ] **Step 1: Update `docs/authorization.md`**

Add the three permissions to the family table, beside the existing
`self.<key>` row:

```markdown
| `admin.authz` | may **change who may do what** — roles, accounts, content labels | `ADMIN_PERMISSION_KEYS` in `app/services/rbac/permissions.py` |
| `manage.catalog` | may **write the catalogue** — entries, groups, people, credits, options, relations, watch orders, catalogue notes | `MANAGE_PERMISSION_KEYS` in the same module |
| `manage.pipelines` | may **run a pipeline** — Backup, Pull, Fill, Replace, Calculate | `MANAGE_PERMISSION_KEYS` in the same module |
```

Note in the same section that the bare `admin` permission and
`get_current_admin` were removed in Phase A, and that `is_admin` in
`/api/auth/me` now means `manage.catalog`.

Bump line 3 to `Last verified: 2026-09-11 (Phase A: the capability axis)`.

- [ ] **Step 2: Update `docs/PROGRESS.md`**

In the In flight block, change the phase line to read that **Phase A is done**
with its sha, and that Phase B is next.

- [ ] **Step 3: Update the spec**

In "Implementation shape", change the Phase A paragraph to open with
`**Phase A — the capability axis. DONE 2026-09-11.**` and state what shipped:
three permissions, the `super` role, 20 routers re-gated, `is_admin`
redefined, the bare `admin` deleted.

- [ ] **Step 4: Commit**

```bash
git add docs/authorization.md docs/PROGRESS.md docs/superpowers/specs/2026-09-10-authorization-redesign-design.md
git commit -m "docs(authz): record Phase A, the capability axis"
```

---

## Verification checklist

Before calling Phase A complete, run all four gates from a clean tree and paste
the output rather than summarising it:

```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```

Then confirm by hand, because no test covers it:

- [ ] `grep -rn "get_current_admin\|PERM_ADMIN\b" app/ tests/` returns nothing.
- [ ] Log in as `admin` on `:5173` and confirm `/roles`, `/users`,
      `/content-labels`, `/add`, `/modify` and `/system` all still load.
- [ ] Create a second account on `/users` holding the `super` role, log in as
      it, and confirm `/add` loads while `/roles` does not.
- [ ] The `super` role appears on `/roles` with both `manage.*` ticked and
      `admin.authz` unticked.
