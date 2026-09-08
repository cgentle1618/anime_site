# Step 2 — Accounts, the `user` role, profiles and community aggregates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## ⛔ BLOCKING PREREQUISITE — do not ship this step first

**The deferred auth-hardening work is a precondition for shipping Step 2. This
plan may be *implemented* before it, but nothing here may reach a database that
holds another person's password until that work lands.**

The spec says so directly, in
[What this forces auth to decide later](../specs/2026-09-08-multi-user-catalog-design.md#what-this-forces-auth-to-decide-later):

> **Real accounts make the deferred hardening urgent.** The cookie's
> unconditional `secure=False` and the absent fail-fast on a default
> `JWT_SECRET_KEY` / `ADMIN_PASSWORD` are tolerable for a single local user and
> are not tolerable once other people have passwords in this database. Step 2
> should not ship before that work does.

Exactly what is unsafe today, both documented in `CLAUDE.md` under "Required
Environment Variables":

| # | Defect | Where | Why it matters once there are real accounts |
|---|---|---|---|
| 1 | The login cookie is set with **`secure=False` unconditionally** | `app/routers/auth.py`, in `login_for_access_token`'s `response.set_cookie(...)` — the comment there says "Plain HTTP today; make this conditional on the request scheme once the app is served over HTTPS" | The session cookie is sent over plain HTTP. One person's session on a shared network is one person's problem; several people's sessions is a credential-harvesting surface |
| 2 | **Nothing fails fast on a default `JWT_SECRET_KEY` or `ADMIN_PASSWORD`** | `app/config.py` supplies defaults; `settings.validate_production()` — the guard that refused to boot on a default — was deleted with the GCP deployment on 2026-09-08 (`docs/authentication.md`, "The JWT") | A default signing secret means anyone can mint a token for any username, including one with the admin role. With one local user that is theatre; with invited users it is a full authentication bypass |

**This plan does not fix either of them, and must not.** The spec puts the
cookie `Secure` flag, the JWT-secret fail-fast, session lifetime, password
reset and the `personal_notes` field-group redesign in a separate future
project. Adding any of them here would silently expand a scoped step into the
auth redesign the spec deliberately deferred.

**Gate, in one line:** land the auth-hardening project, then enable this step's
`/users` invitations. Until then, create no account for anyone but yourself.

---

**Goal:** Turn a single-user application with a multi-user data model into an
actual multi-user site: an admin invites accounts, each account gets the new
`user` role, each account chooses whether its list is public, a public list is
readable at `/user/<username>`, and a media detail page shows what the public
lists collectively think of it.

**Architecture:** Nothing in the existing auth or RBAC machinery is replaced.
Three additions, in order.

1. **The vocabulary grows by one family.** `self.list` and
   `self.personal_notes` join `admin`, `media_type.*`, `field_group.*` and
   `label.*` in `app/services/rbac/permissions.py`. They are *withheld* from
   guest and granted to the new `user` role — the same shape
   `GUEST_WITHHELD_FIELD_GROUPS` already uses. Catalogue writes keep sitting
   behind `Depends(get_current_admin)`, so **no new admin surface appears** and
   the `/roles` editor picks the new family up for free because it is served
   from `catalog(db)` rather than mirrored in the frontend.
2. **One boolean on `users`.** `list_is_public`, default false. It is read by
   exactly two endpoints and written by exactly one.
3. **Two read endpoints and their pages.** `/api/profile/{username}` answers
   "what is on this person's list", `/api/community/{media_id}` answers "what do
   the public lists think of this work". Both are read-only, both apply the
   *viewer's* media-type and content-label visibility, and neither can write
   anything.

The order matters: the permission must exist before a role can hold it, and the
role must exist before the admin Users page can assign it. There is nothing to
build on the Users page itself — its role `<select>` is populated from
`GET /api/roles/`, so the new role appears there the moment it is seeded.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL 17, pytest, ruff;
React + Vite, TanStack Query, Tailwind v4, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-multi-user-catalog-design.md`
(the Step 2 row of "Sub-projects")

## Global Constraints

Every task's requirements implicitly include this section.

- **Never commit or push automatically.** `CLAUDE.md` is explicit: finish the
  task, run the checks, show a one-line commit message, and commit only after
  approval. Every task's final step is "prepare and ask", not "commit".
- **Stage only the exact files named in the task.** Other Claude Code sessions
  may be editing this branch. Never `git add -A`, never `git commit -a`, and
  **never stage a directory pathspec** — `git add docs/` or
  `git add frontend/src/pages/` sweeps another session's work into your commit.
  Name every path, even when that means ten of them. Stage and commit in one
  step, with no gap.
- **Write the failing test first.** Every behaviour change starts with a red
  test, and every task says which command should print the failure.
- **Four checks stay green** before any commit is offered:
  `venv/Scripts/python.exe -m pytest -q`, `venv/Scripts/ruff.exe check .`, and
  in `frontend/`: `npm run test:run`, `npm run lint`.
- **After any frontend change, run `cd frontend && npm run build`** before
  claiming the change is done. `:5173` serves source, `:8000` serves
  `frontend_dist/`, and only the build updates the second.
- **Migrations must never import `app.models`.** `docs/PROGRESS.md` records
  this as an open, unfixed defect class: a migration that queries live ORM
  models SELECTs every column the model currently declares, so it breaks the
  moment a later migration adds one. Both migrations in this plan are **raw SQL
  via `op.execute`**, with column lists spelled out. No exceptions — in
  particular, do **not** call `ensure_rbac_seed` from a migration, even though
  migration A did.
- **One Alembic head.** This plan's first revision is `m2a1users` and its
  `down_revision` is whatever `alembic heads` prints when the task starts,
  which will be the last revision of the Step 1 plan. Task 2 has an explicit
  step for reading and pasting that id. Run `alembic heads` before committing
  and confirm exactly one.
- **`alembic upgrade head` from an empty database is already broken** at
  `86982d71c2f1` (`docs/PROGRESS.md`, open item). Test migrations against a
  database restored from a Backup, not a fresh one, and do not treat that
  pre-existing failure as caused by this plan.
- **Give this session its own test database.** Concurrent sessions poison a
  shared `anime_site_test`. Export `POSTGRES_DB=anime_site_test_step2` before
  running pytest and record it in `docs/PROGRESS.md`'s Environment table.
- **The session fixture is `db_session`, not `db`.** House convention for a
  short alias is a three-line module-local fixture, as in
  `tests/api/test_rewatch_entry_flags.py:15-17`:

```python
@pytest.fixture
def db(db_session):
    return db_session
```

- **`tests/api/conftest.py` gives you `client` and `admin_client`.** `client`
  is anonymous with the test DB override; `admin_client` additionally creates
  a `testadmin` user on the `admin` role and sets a valid JWT cookie. To log a
  client in as anyone else, use the `make_viewer` helper already written at
  `tests/api/test_visibility.py:23` — it creates a role, grants it exactly the
  permissions you name, creates a user on it, bumps the RBAC cache and sets the
  cookie. **Import it rather than rewriting it.**
- **Frontend colours come from semantic tokens only** — `bg-surface`,
  `bg-surface-2`, `text-text`, `text-text-muted`, `text-text-faint`,
  `border-border`, `text-brand`, `bg-brand`/`text-on-brand`, `text-danger`.
  A hard-coded grey utility (`bg-gray-100`, `text-slate-500`, …) fails
  `src/theme-tokens.test.js` and so fails the build. Read
  `docs/frontend/design-system.md` before writing any markup; the archive rules
  that bite here are **one accent** (brand only), **structure is mono**
  (`Eyebrow` for captions and labels), **flat** (hairlines, not shadows), **no
  decorative icons**, and **colour never encodes a category**. Reuse
  `Eyebrow`, `Slip`, `Chip`, `RatingStamp`, `Button` from
  `frontend/src/components/ui/primitives.jsx`.
- **Update the matching doc in the same change** and bump its `Last verified`
  line. This plan touches `docs/authorization.md`, `docs/authentication.md`,
  `docs/api.md` and `docs/data-model.md`.
- **Claim the task in `docs/PROGRESS.md`** (`wip <who>`) before starting; set it
  to `done <sha>` in the same commit as the work.
- **Back up before the first migration.** `/system` → Backup. `role`,
  `role_permission` and `users` have no sheet tab, so a mistake there is not
  recoverable from the sheet — take a `pg_dump` as well.

## Interface contract from Steps 0 and 1

Produced by the earlier plans, consumed verbatim here. Do not rename, and do
not re-derive.

```python
# app/models/media.py  (Step 0)
class Media(Base):
    __tablename__ = "media"
    system_id: UUID          # PK
    media_type: str          # hyphenated MEDIA_TABLES key
    public_id: int
    display_name: str
    cover_image_file: str | None
    franchise_id: UUID | None
    series_id: UUID | None
```

```python
# app/models/user_media_list.py  (Step 1)
class UserMediaList(Base):
    __tablename__ = "user_media_list"
    system_id: UUID          # PK
    user_id: UUID            # FK users.id       ON DELETE CASCADE, NOT NULL
    media_id: UUID           # FK media.system_id ON DELETE CASCADE, NOT NULL
    status: str
    my_rating: str | None
    completed_at: datetime | None
    my_watch_day: str | None
    ep_fin: int | None
    vol_fin: float | None
    vol_fin_page: int | None
    ch_fin: float | None
    arc_fin: float | None
    ch_fin_in_arc: float | None
    progress_display: str | None
    issue_fin: int | None
    created_at: datetime
    updated_at: datetime
    # UniqueConstraint("user_id", "media_id", name="uq_user_media")
```

Step 0 also converted `media_content_label` from the FK-less
`(media_type, entry_id)` pair to a single `media_id` FK. Task 7 relies on that.

## Interface contract this step produces

Names later steps and later plans depend on. Do not rename.

```python
# app/services/rbac/permissions.py
FAMILY_SELF = "self"
PERM_SELF_LIST = "self.list"                      # write your own list rows
PERM_SELF_PERSONAL_NOTES = "self.personal_notes"  # write your own personal notes
SELF_PERMISSION_KEYS: tuple[str, ...] = ("list", "personal_notes")
def self_perm(key: str) -> str: ...
```

```python
# app/services/rbac/seed.py
USER_ROLE = "user"
def default_user_permissions() -> set[str]: ...
```

```python
# app/models/system.py :: User
list_is_public: bool   # NOT NULL, default false
```

| Route | Method | Who | Answers |
|---|---|---|---|
| `/api/account/settings` | GET | any signed-in user | that user's own settings |
| `/api/account/settings` | PATCH | any signed-in user | writes `list_is_public` |
| `/api/profile/{username}` | GET | anyone | that user's list, all media types |
| `/api/community/{media_id}` | GET | anyone | per-status counts and average rating over public lists |

Alembic revision ids: `m2a1users` (the role), `m2a2public` (the column).

## A correction to the spec, applied throughout

**`my_rating` is a letter grade, not a number.** `app/utils/constants.py:106`
declares `MY_RATINGS = ("S", "A+", "A", "B", "C", "D", "E", "F")` and every
`my_rating` column in the codebase is `Column(String)`. The spec's two SQL
sketches assume otherwise:

- `ORDER BY l.my_rating DESC NULLS LAST` sorts those strings alphabetically,
  which puts `S` first only by luck and puts `A+` before `A` — the reverse of
  the intended order.
- `ROUND(AVG(l.my_rating::numeric), 2)` raises
  `invalid input syntax for type numeric: "A+"` on the first row it reaches.

Task 6 adds one small helper module that maps the letters to points, and Tasks
7 and 8 use it. Wherever this plan and the spec's SQL disagree, this plan is
right and the reason is here.

---

# Phase A — Permissions and accounts

Backend only. Nothing a user can see changes until Phase C.

### Task 1: The `self` permission family

**Files:**
- Modify: `app/services/rbac/permissions.py`
- Modify: `app/routers/roles.py`
- Create: `tests/unit/test_self_permissions.py`
- Modify: `tests/api/test_roles.py`

**Interfaces:**
- Consumes: `static_catalog()`, `catalog(db)`, `PERMISSION_FAMILIES`.
- Produces: `FAMILY_SELF`, `PERM_SELF_LIST`, `PERM_SELF_PERSONAL_NOTES`,
  `self_perm()`, `SELF_PERMISSION_KEYS`.

The vocabulary is declared in code and only grants are stored, so a new
permission is a code change by design (`app/services/rbac/permissions.py`'s
module docstring). `/api/roles/catalog` is *served* rather than mirrored in the
frontend, so the role editor renders the new family with no frontend change at
all — that is why this task touches `roles.py` and no `.jsx`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_self_permissions.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_self_permissions.py -v`
Expected: FAIL with `ImportError: cannot import name 'FAMILY_SELF' from
'app.services.rbac.permissions'`

- [ ] **Step 3: Add the family to the permission catalog**

In `app/services/rbac/permissions.py`, beside the other family constants:

```python
FAMILY_MEDIA_TYPE = "media_type"
FAMILY_FIELD_GROUP = "field_group"
FAMILY_LABEL = "label"
# What a viewer may write about their OWN rows. Every other family answers
# "may you see this"; this one answers "may you write your own". It is the
# whole of the `user` role beyond the guest reads, which is why it is two
# permissions rather than a subsystem.
FAMILY_SELF = "self"

PERMISSION_FAMILIES: tuple[str, ...] = (
    FAMILY_MEDIA_TYPE,
    FAMILY_FIELD_GROUP,
    FAMILY_LABEL,
    FAMILY_SELF,
)

# Declared here rather than derived from a table: like every other permission
# these name code (a router dependency), so a row with no code behind it would
# be inert.
SELF_PERMISSION_KEYS: tuple[str, ...] = ("list", "personal_notes")

SELF_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "list": (
        "Own List",
        "Add, change and remove entries on your own list. Does not grant any "
        "write access to the catalogue itself.",
    ),
    "personal_notes": (
        "Own Personal Notes",
        "Write your own personal-scope notes on an entry. Catalogue notes stay "
        "admin-only.",
    ),
}
```

and beside `label_perm`:

```python
def self_perm(key: str) -> str:
    """Permission to write one kind of your own rows."""
    return f"{FAMILY_SELF}.{key}"


PERM_SELF_LIST = self_perm("list")
PERM_SELF_PERSONAL_NOTES = self_perm("personal_notes")
```

Extend `static_catalog()` — it is the half of the vocabulary knowable without a
database, and these keys are constants, so they belong there:

```python
def static_catalog() -> frozenset[str]:
    """Every permission knowable without a database."""
    return frozenset(
        {PERM_ADMIN}
        | {media_type_perm(media_type) for media_type in MEDIA_TYPE_KEYS}
        | {field_group_perm(key) for key in FIELD_GROUP_KEYS}
        | {self_perm(key) for key in SELF_PERMISSION_KEYS}
    )
```

**Do not touch `default_guest_permissions()`.** It is subtracted from and
compared against in seven existing test modules (`tests/api/test_field_gating.py`,
`test_media_type_gating.py`, `test_visibility.py`, …); leaving it alone is what
keeps guest behaving exactly as it does today.

- [ ] **Step 4: Serve the new family from the role editor's catalog**

In `app/routers/roles.py`, import the new names:

```python
from app.services.rbac.permissions import (
    FAMILY_FIELD_GROUP,
    FAMILY_LABEL,
    FAMILY_MEDIA_TYPE,
    FAMILY_SELF,
    PERM_ADMIN,
    SELF_PERMISSION_KEYS,
    SELF_PERMISSION_LABELS,
    catalog,
    field_group_perm,
    label_perm,
    media_type_perm,
    self_perm,
)
```

and add a fourth block to the list `get_catalog` returns, between the field
groups and the content labels:

```python
        schemas.PermissionFamilyOut(
            family=FAMILY_SELF,
            label="Own Rows",
            permissions=[
                schemas.PermissionOut(
                    permission=self_perm(key),
                    label=SELF_PERMISSION_LABELS[key][0],
                    description=SELF_PERMISSION_LABELS[key][1],
                )
                for key in SELF_PERMISSION_KEYS
            ],
        ),
```

- [ ] **Step 5: Add the catalog-endpoint test**

Append to `tests/api/test_roles.py`:

```python
def test_catalog_serves_the_self_family(admin_client):
    """
    The role editor's checkbox grid is built from this response, so a new
    family appears in the UI with no frontend change. That is the point of
    serving the catalog instead of mirroring it.
    """
    r = admin_client.get("/api/roles/catalog")
    assert r.status_code == 200

    families = {block["family"]: block for block in r.json()}
    assert "self" in families

    names = {p["permission"] for p in families["self"]["permissions"]}
    assert names == {"self.list", "self.personal_notes"}


def test_a_self_permission_can_be_granted_to_a_role(admin_client, db_session):
    from app import models

    role = models.Role(
        name="listers", label="Listers", is_system=False, is_superuser=False
    )
    db_session.add(role)
    db_session.flush()

    r = admin_client.put(
        f"/api/roles/{role.system_id}/permissions",
        json={"permissions": ["self.list"]},
    )
    assert r.status_code == 200
    assert "self.list" in r.json()["permissions"]
```

**Before writing this, open `tests/api/test_roles.py` and match the fixture
names and the request shape the existing tests in that file already use** — in
particular whether the permissions PUT takes `{"permissions": [...]}` or a bare
list. If it differs, use what the file does and say so in the commit message.

- [ ] **Step 6: Run the tests**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/unit/test_self_permissions.py tests/api/test_roles.py -v
venv/Scripts/ruff.exe check .
```
Expected: all PASS; ruff clean.

- [ ] **Step 7: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures. Nothing holds the new permissions yet, so nothing
can behave differently.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/rbac/permissions.py app/routers/roles.py \
        tests/unit/test_self_permissions.py tests/api/test_roles.py \
        docs/PROGRESS.md
```
Proposed message: `feat(rbac): add the self permission family for own-row writes`
**Ask before running `git commit`.**

---

### Task 2: The `user` role

**Files:**
- Modify: `app/services/rbac/seed.py`
- Create: `alembic/versions/m2a1users_seed_user_role.py`
- Create: `tests/unit/test_user_role_seed.py`
- Create: `tests/api/test_user_role.py`

**Interfaces:**
- Consumes: `PERM_SELF_LIST`, `PERM_SELF_PERSONAL_NOTES` (Task 1);
  `default_guest_permissions()`.
- Produces: `USER_ROLE`, `default_user_permissions()`, a seeded `user` role.

The spec is exact about what this role is:

> **The `user` role is three permissions**, not a new system: guest reads, plus
> write-own-list, plus write-own-personal-notes. Catalogue writes stay
> `admin`-only, so no new admin surface appears.

`ensure_rbac_seed` is called from the lifespan **and** from
`tests/api/conftest.py`'s `test_engine` fixture, because conftest resets the
schema with `Base.metadata.create_all` and never runs Alembic. Adding the role
there is what makes it exist in tests. The migration exists separately, for
databases that already have their schema.

`_ensure_role`'s `if not held:` guard matters here and is easy to get wrong.
Read the existing code: the guard is **not** inside `_ensure_role` — that
helper only creates a missing role row. The guard lives in `ensure_rbac_seed`,
where guest's grants are counted and topped up **only when the role holds
nothing at all**. That is deliberate: an admin who deliberately removed a grant
must not have it handed back on the next restart. Mirror the same shape for the
`user` role — its own `held` query, its own `if not held:`.

- [ ] **Step 1: Write the failing unit test**

```python
# tests/unit/test_user_role_seed.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_user_role_seed.py -v`
Expected: FAIL with `ImportError: cannot import name 'USER_ROLE' from
'app.services.rbac.seed'`

- [ ] **Step 3: Extend the seed**

In `app/services/rbac/seed.py`, add the imports and constants:

```python
from app.services.rbac.permissions import (
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
    field_group_perm,
    media_type_perm,
)

GUEST_ROLE = "guest"
ADMIN_ROLE = "admin"
# A signed-in member. Not an administrator and not a second kind of admin:
# guest reads plus the two self.* writes, and nothing else.
USER_ROLE = "user"
```

and the derivation, directly below `default_guest_permissions`:

```python
def default_user_permissions() -> set[str]:
    """
    A signed-in member's grants: everything a guest may read, plus the two
    permissions over their own rows.

    Derived from default_guest_permissions() rather than restated, so a media
    type or field group added later reaches both roles at once. The spec is
    explicit that this role is three permissions and not a new system - if this
    function ever grows a fourth idea, that is a design change, not a tidy-up.
    """
    return default_guest_permissions() | {PERM_SELF_LIST, PERM_SELF_PERSONAL_NOTES}
```

and inside `ensure_rbac_seed`, after the admin role is ensured:

```python
    user = _ensure_role(
        db,
        USER_ROLE,
        label="User",
        description=(
            "A signed-in member. Reads what a guest reads, and writes their "
            "own list and their own personal notes."
        ),
        is_system=True,
        is_superuser=False,
        sort_order=50,
    )
```

and, beside guest's existing top-up block, the same shape for `user`:

```python
    # Same rule as guest above: top up only a role holding nothing at all, so
    # a grant an admin deliberately removed is not handed back on restart.
    user_held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == user.system_id
        )
    }
    if not user_held:
        for permission in sorted(default_user_permissions()):
            db.add(
                models.RolePermission(role_id=user.system_id, permission=permission)
            )
```

Update the module docstring's first line — it says "The two roles the app reads
by name" and there are now three:

```python
"""
The three roles the app reads by name.
"""
```

- [ ] **Step 4: Run the unit test**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_user_role_seed.py -v`
Expected: all PASS.

- [ ] **Step 5: Write the API test**

```python
# tests/api/test_user_role.py
"""
The seeded `user` role, as the running app sees it.

conftest's test_engine calls ensure_rbac_seed once per session, so the role is
already in the database here - the same path the lifespan takes.
"""

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_ADMIN,
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
    media_type_perm,
)
from app.services.rbac.seed import USER_ROLE


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def user_role(db):
    role = db.query(models.Role).filter(models.Role.name == USER_ROLE).first()
    assert role is not None, "ensure_rbac_seed did not create the user role"
    return role


def test_the_role_is_a_system_role_and_not_a_superuser(user_role):
    assert user_role.is_system is True
    assert user_role.is_superuser is False


def test_its_grants_are_stored(db, user_role):
    held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == user_role.system_id
        )
    }
    assert PERM_SELF_LIST in held
    assert PERM_SELF_PERSONAL_NOTES in held
    assert media_type_perm("anime") in held
    assert PERM_ADMIN not in held


def test_an_admin_can_create_an_account_on_it(admin_client, user_role):
    """
    Invite-only accounts. There is no registration route to test the absence
    of - accounts exist only because an admin made one here.
    """
    r = admin_client.post(
        "/api/users/",
        json={
            "username": "invitee",
            "password": "a-password",
            "role_id": str(user_role.system_id),
        },
    )
    assert r.status_code == 201
    assert r.json()["role_name"] == "user"


def test_that_account_is_not_an_admin(client, admin_client, user_role, db):
    from app.services.security import create_access_token

    admin_client.post(
        "/api/users/",
        json={
            "username": "invitee2",
            "password": "a-password",
            "role_id": str(user_role.system_id),
        },
    )
    token = create_access_token({"sub": "invitee2", "role": "user"})
    client.cookies.set("access_token", f"Bearer {token}")

    me = client.get("/api/auth/me").json()
    assert me["username"] == "invitee2"
    assert me["is_admin"] is False
    assert "self.list" in me["permissions"]

    # The one thing that must stay closed: catalogue writes.
    assert client.get("/api/users/").status_code == 401
```

- [ ] **Step 6: Run the API test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_user_role.py -v`
Expected: all PASS.

- [ ] **Step 7: Read the current head**

Run: `venv/Scripts/python.exe -m alembic heads`
Write down the single id it prints. That is the value of `down_revision` in the
next step. It will be the last revision of the Step 1 plan.

- [ ] **Step 8: Write the migration**

```python
# alembic/versions/m2a1users_seed_user_role.py
"""seed the user role and its grants

Revision ID: m2a1users
Revises: <PASTE THE ID FROM STEP 7>
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m2a1users"
down_revision: Union[str, Sequence[str], None] = "<PASTE THE ID FROM STEP 7>"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Raw SQL, and deliberately NOT a call to ensure_rbac_seed.

    docs/PROGRESS.md records that migrations importing live ORM models break
    whenever a later migration adds a column, because the model SELECTs every
    column it currently declares. Migration A got away with calling the seed;
    this one does not repeat that.

    The grants are copied from whatever the guest role currently holds rather
    than recomputed, so an admin who narrowed guest gets a user role narrowed
    the same way. That is the intent: "the guest read permissions" means this
    installation's guest, not a fresh one's.

    Idempotent: the lifespan's ensure_rbac_seed runs against databases that may
    already have been through this, and must not duplicate anything.
    """
    op.execute("""
        INSERT INTO role (system_id, name, label, description,
                          is_system, is_superuser, sort_order)
        SELECT gen_random_uuid(), 'user', 'User',
               'A signed-in member. Reads what a guest reads, and writes '
               'their own list and their own personal notes.',
               true, false, 50
        WHERE NOT EXISTS (SELECT 1 FROM role WHERE name = 'user')
    """)

    # Guest's reads.
    op.execute("""
        INSERT INTO role_permission (role_id, permission)
        SELECT u.system_id, gp.permission
        FROM role u
        JOIN role g ON g.name = 'guest'
        JOIN role_permission gp ON gp.role_id = g.system_id
        WHERE u.name = 'user'
          AND NOT EXISTS (
              SELECT 1 FROM role_permission x
              WHERE x.role_id = u.system_id AND x.permission = gp.permission
          )
    """)

    # The two writes that make it a user rather than a guest with a password.
    op.execute("""
        INSERT INTO role_permission (role_id, permission)
        SELECT u.system_id, p.permission
        FROM role u
        CROSS JOIN (VALUES ('self.list'), ('self.personal_notes'))
                   AS p(permission)
        WHERE u.name = 'user'
          AND NOT EXISTS (
              SELECT 1 FROM role_permission x
              WHERE x.role_id = u.system_id AND x.permission = p.permission
          )
    """)

    granted = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM role_permission rp "
            "JOIN role r ON r.system_id = rp.role_id WHERE r.name = 'user'"
        )
    ).scalar_one()
    if granted < 2:
        raise RuntimeError(
            f"user role seeded with only {granted} grants; expected the guest "
            "set plus self.list and self.personal_notes"
        )


def downgrade() -> None:
    """
    Deletes the role. role_permission cascades on role_id; users.role_id is
    ON DELETE RESTRICT, so this fails loudly if any account still holds the
    role rather than silently orphaning it - which is the correct outcome.
    """
    op.execute("DELETE FROM role WHERE name = 'user'")
```

- [ ] **Step 9: Run the migration**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
```
Expected: applies with no error; exactly one head, `m2a1users`.

Then check the result by hand:
```bash
venv/Scripts/python.exe -c "from app.database import SessionLocal; from sqlalchemy import text; d=SessionLocal(); print(d.execute(text(\"SELECT r.name, COUNT(*) FROM role r JOIN role_permission p ON p.role_id=r.system_id GROUP BY r.name ORDER BY r.name\")).all())"
```
Expected: `user` has guest's count plus 2.

- [ ] **Step 10: Run the migration a second time**

Run: `venv/Scripts/python.exe -m alembic downgrade -1 && venv/Scripts/python.exe -m alembic upgrade head`
Expected: both succeed; the grant count is identical to Step 9. This is the
idempotency check the docstring claims.

- [ ] **Step 11: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures. Watch specifically for `tests/api/test_roles.py` —
`list_roles` now returns three rows where it returned two, and an existing test
may assert a length.

- [ ] **Step 12: Prepare the commit and ask**

```bash
git add app/services/rbac/seed.py alembic/versions/m2a1users_seed_user_role.py \
        tests/unit/test_user_role_seed.py tests/api/test_user_role.py \
        docs/PROGRESS.md
```
Proposed message: `feat(rbac): seed the user role - guest reads plus own-row writes`
**Ask before running `git commit`.**

---

### Task 3: `users.list_is_public`

**Files:**
- Modify: `app/models/system.py`
- Modify: `app/schemas/rbac.py`
- Modify: `app/routers/users.py`
- Create: `alembic/versions/m2a2public_user_list_visibility.py`
- Create: `tests/api/test_list_visibility_column.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `models.User.list_is_public`; `ManagedUserResponse.list_is_public`.

Private by default is the spec's decision and the column's default enforces it.
The admin Users page gets a read-only view of the flag — an admin may see that
someone's list is public but does not set it for them; that is the owner's
choice, made in Task 5's settings endpoint.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_list_visibility_column.py
"""
users.list_is_public - private by default, per-user.

The default is the whole guarantee: an account created by an admin invitation
must not expose its list until its owner says so, and nothing in the creation
path asks the question.
"""

import pytest

from app import models
from app.services.rbac.seed import USER_ROLE
from app.services.security import get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def user_role_id(db):
    role = db.query(models.Role).filter(models.Role.name == USER_ROLE).first()
    assert role is not None
    return role.system_id


def test_a_new_user_row_is_private(db, user_role_id):
    u = models.User(
        username="private-by-default",
        hashed_password=get_password_hash("x"),
        role_id=user_role_id,
    )
    db.add(u)
    db.flush()
    db.refresh(u)
    assert u.list_is_public is False


def test_the_column_is_not_nullable():
    assert models.User.__table__.c.list_is_public.nullable is False


def test_an_admin_invitation_creates_a_private_account(admin_client, user_role_id):
    r = admin_client.post(
        "/api/users/",
        json={
            "username": "invited",
            "password": "a-password",
            "role_id": str(user_role_id),
        },
    )
    assert r.status_code == 201
    assert r.json()["list_is_public"] is False


def test_the_admin_user_list_reports_the_flag(admin_client, user_role_id):
    admin_client.post(
        "/api/users/",
        json={
            "username": "listed",
            "password": "a-password",
            "role_id": str(user_role_id),
        },
    )
    rows = admin_client.get("/api/users/").json()
    listed = next(row for row in rows if row["username"] == "listed")
    assert listed["list_is_public"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_list_visibility_column.py -v`
Expected: FAIL with `AttributeError: type object 'User' has no attribute
'list_is_public'`

- [ ] **Step 3: Add the column to the model**

In `app/models/system.py`, inside `class User`, after `role_id`:

```python
    # Private by default, and only its owner can change it (PATCH
    # /api/account/settings). An admin may see the flag on the Users page but
    # does not set it: whose list is visible is the account holder's decision,
    # not the inviter's.
    list_is_public = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
```

`Boolean` is already imported in that module (`Role.is_system` uses it); confirm
before adding an import.

- [ ] **Step 4: Report it from the admin users API**

In `app/schemas/rbac.py`, add the field to `ManagedUserResponse`:

```python
class ManagedUserResponse(BaseModel):
    id: UUID
    username: str
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    # Read-only here. Written only by the account's owner, through
    # PATCH /api/account/settings.
    list_is_public: bool = False

    model_config = ConfigDict(from_attributes=True)
```

and in `app/routers/users.py`, in `_to_response`:

```python
def _to_response(user: models.User) -> schemas.ManagedUserResponse:
    return schemas.ManagedUserResponse(
        id=user.id,
        username=user.username,
        role_id=user.role_id,
        role_name=user.role_ref.name if user.role_ref else None,
        list_is_public=bool(user.list_is_public),
    )
```

**Do not add `list_is_public` to `ManagedUserUpdate`.** An admin editing
someone else's visibility is exactly the thing the per-user toggle exists to
avoid.

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m2a2public_user_list_visibility.py
"""add users.list_is_public, default false

Revision ID: m2a2public
Revises: m2a1users
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m2a2public"
down_revision: Union[str, Sequence[str], None] = "m2a1users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    NOT NULL with a server default, so every existing row - including the
    admin's - becomes private without a backfill statement. Private by default
    is the spec's decision and this is where it is enforced; a nullable column
    would let a NULL mean "unanswered" and every reader would have to decide
    what that meant.
    """
    op.add_column(
        "users",
        sa.Column(
            "list_is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "list_is_public")
```

- [ ] **Step 6: Run the migration and the test**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_list_visibility_column.py -v
```
Expected: applies; exactly one head, `m2a2public`; all four tests PASS.

- [ ] **Step 7: Run the full backend suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures; ruff clean.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/models/system.py app/schemas/rbac.py app/routers/users.py \
        alembic/versions/m2a2public_user_list_visibility.py \
        tests/api/test_list_visibility_column.py docs/PROGRESS.md
```
Proposed message: `feat(users): add list_is_public, private by default`
**Ask before running `git commit`.**

---

### Task 4: Gate list writes on `self.list`

**Files:**
- Modify: the router Step 1 created for list writes (found in Step 1 below)
- Create: `tests/api/test_list_write_permission.py`

**Interfaces:**
- Consumes: `PERM_SELF_LIST` (Task 1), the `user` role (Task 2),
  `require_permission` in `app/services/rbac/resolver.py`.
- Produces: a list-write path that a guest cannot reach.

Step 1 shipped the endpoints that write `user_media_list` while there was still
only one account, so they are gated on whatever Step 1 chose. This task moves
them behind `self.list`, which is the permission that now means "may write your
own list". Nothing else about them changes — not the paths, not the payloads,
not which row they write.

- [ ] **Step 1: Find the router**

Run:
```bash
grep -rln "UserMediaList" app/routers/
grep -rn "UserMediaList" app/routers/ --include=*.py | head -20
```
Note the module and the router's `prefix`. Everything below says "the list
router"; substitute the real module path.

- [ ] **Step 2: Write the failing test**

```python
# tests/api/test_list_write_permission.py
"""
Who may write a list row.

Three viewers, three answers, and the middle one is the whole point of the
`user` role: an anonymous visitor is refused, a signed-in member writes their
own row, and an admin - superuser - is never blocked.
"""

import pytest

from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer


@pytest.fixture
def db(db_session):
    return db_session


def _list_write(client, media_id):
    """The Step 1 list-write call. One place, so this file has one thing to fix
    if that route's shape ever changes."""
    return client.put(
        f"/api/me/list/{media_id}",
        json={"status": "Watching", "my_rating": "A"},
    )


def test_an_anonymous_visitor_cannot_write_a_list_row(client, sample_anime):
    r = _list_write(client, sample_anime.system_id)
    assert r.status_code == 401


def test_a_viewer_without_self_list_cannot_write_one(db, client, sample_anime):
    make_viewer(db, client, "readonly", default_guest_permissions())
    r = _list_write(client, sample_anime.system_id)
    assert r.status_code == 401


def test_a_viewer_holding_self_list_can(db, client, sample_anime):
    make_viewer(
        db, client, "member", default_guest_permissions() | {PERM_SELF_LIST}
    )
    r = _list_write(client, sample_anime.system_id)
    assert r.status_code in (200, 201)


def test_an_admin_is_not_blocked(admin_client, sample_anime):
    r = _list_write(admin_client, sample_anime.system_id)
    assert r.status_code in (200, 201)
```

**Fix `_list_write` to match the real route and payload found in Step 1 before
running this.** `sample_anime.system_id` is the media id because Step 0's
backfill reused each detail row's existing UUID.

- [ ] **Step 3: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_list_write_permission.py -v`
Expected: the two "cannot" cases FAIL (they succeed, or answer some status
other than 401), because the route is not yet gated on `self.list`.

- [ ] **Step 4: Add the dependency**

In the list router, at the router declaration:

```python
from fastapi import APIRouter, Depends

from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.resolver import require_permission

router = APIRouter(
    prefix="/api/me",
    tags=["My List"],
    # Router-level, not per-route: every write here is a write to the caller's
    # own list, so a route added later is gated by default rather than by
    # someone remembering. require_permission answers 401 (never 403), matching
    # the one error shape the SPA knows.
    dependencies=[Depends(require_permission(PERM_SELF_LIST))],
)
```

**If the list router also serves reads** (a `GET` of the caller's own row), the
router-level dependency gates those too, which is correct: a viewer with no
list has no own-row read to make. If Step 1 put a catalogue read on the same
router, move it off rather than weakening the gate.

- [ ] **Step 5: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_list_write_permission.py -v`
Expected: all four PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures. Any Step 1 test that wrote a list row as an
anonymous client now needs a `make_viewer` line — fix the test, not the gate.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add <the list router path> tests/api/test_list_write_permission.py \
        docs/PROGRESS.md
```
Proposed message: `feat(rbac): gate list writes on self.list`
**Ask before running `git commit`.**

---

# Phase B — Read endpoints

### Task 5: `/api/account/settings`

**Files:**
- Create: `app/routers/account.py`
- Modify: `app/schemas/rbac.py`
- Modify: `app/schemas/__init__.py`
- Modify: `app/main.py`
- Create: `tests/api/test_account_settings.py`

**Interfaces:**
- Consumes: `models.User.list_is_public` (Task 3), `get_viewer`.
- Produces: `GET`/`PATCH /api/account/settings`.

A separate router from `/api/users` because that one carries
`dependencies=[Depends(get_current_admin)]` at the router level — these routes
are the opposite: any signed-in account, acting only on itself. A separate
router from Step 1's `/api/me` because this is settings, not list data, and
because the two are gated differently: a member may change their own settings
whether or not they hold `self.list`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_account_settings.py
"""
The per-user list-visibility toggle.

Everything here acts on the caller and only the caller. There is no user id in
any path: an endpoint that took one would be an endpoint that could be pointed
at somebody else.
"""

import pytest

from app import models
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer


@pytest.fixture
def db(db_session):
    return db_session


def test_an_anonymous_visitor_has_no_settings(client):
    assert client.get("/api/account/settings").status_code == 401


def test_a_signed_in_member_reads_their_own(db, client):
    make_viewer(db, client, "member", default_guest_permissions())
    r = client.get("/api/account/settings")
    assert r.status_code == 200
    assert r.json() == {
        "username": "member",
        "role_name": "role-member",
        "list_is_public": False,
    }


def test_they_can_make_their_list_public(db, client):
    make_viewer(db, client, "member", default_guest_permissions())
    r = client.patch("/api/account/settings", json={"list_is_public": True})
    assert r.status_code == 200
    assert r.json()["list_is_public"] is True

    stored = db.query(models.User).filter(models.User.username == "member").one()
    assert stored.list_is_public is True


def test_and_private_again(db, client):
    make_viewer(db, client, "member", default_guest_permissions())
    client.patch("/api/account/settings", json={"list_is_public": True})
    r = client.patch("/api/account/settings", json={"list_is_public": False})
    assert r.json()["list_is_public"] is False


def test_an_anonymous_visitor_cannot_write_them(client):
    r = client.patch("/api/account/settings", json={"list_is_public": True})
    assert r.status_code == 401


def test_the_payload_carries_no_user_id(db, client):
    """A body field naming somebody else must be ignored, not honoured."""
    make_viewer(db, client, "member", default_guest_permissions())
    make_viewer(db, client, "other", default_guest_permissions())
    # `client` is now logged in as "other" - make_viewer resets the cookie.
    client.patch(
        "/api/account/settings",
        json={"list_is_public": True, "username": "member"},
    )
    member = db.query(models.User).filter(models.User.username == "member").one()
    other = db.query(models.User).filter(models.User.username == "other").one()
    assert member.list_is_public is False
    assert other.list_is_public is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_account_settings.py -v`
Expected: FAIL — every request 404s, because no route is mounted.

- [ ] **Step 3: Add the schemas**

In `app/schemas/rbac.py`, below the managed-user schemas:

```python
# ---------------------------------------------------------------------------
# The caller's own account
# ---------------------------------------------------------------------------

class AccountSettingsResponse(BaseModel):
    """What the caller may see and change about their own account."""

    username: str
    role_name: str
    list_is_public: bool


class AccountSettingsUpdate(BaseModel):
    """
    One field, deliberately. There is no username or user id here: the caller
    is taken from the session, so this payload cannot name somebody else.
    Pydantic ignores unknown keys by default, so a stray "username" in the body
    is dropped rather than honoured.
    """

    list_is_public: bool
```

Export both from `app/schemas/__init__.py` — add them to the
`from app.schemas.rbac import (...)` list and to `__all__`, beside
`"ManagedUserResponse"`.

- [ ] **Step 4: Write the router**

```python
# app/routers/account.py
"""
routers/account.py
The caller's own account settings.

Separate from routers/users.py, which is admin-only at the router level and
acts on other people. Everything here acts on the caller and only the caller:
no path takes a user id, and the update payload carries no identity, so there
is no shape of request that could point one of these at another account.

List visibility lives here rather than on the admin Users page because it is
the account holder's decision. An admin can see the flag; they do not set it.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac.resolver import Viewer, get_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["Account"])


def _current_user(db: Session, viewer: Viewer) -> models.User:
    """
    The row behind the session, or 401.

    resolve_viewer never raises - a bad cookie resolves to the guest viewer
    with username None - so "who is asking" and "is anyone asking" are two
    questions and this asks the second. 401 with the same detail and header
    every other refusal in this app sends, so the SPA sees one shape.
    """
    unauthenticated = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or insufficient permissions",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not viewer.username:
        raise unauthenticated
    user = (
        db.query(models.User)
        .filter(models.User.username == viewer.username)
        .first()
    )
    if user is None:
        raise unauthenticated
    return user


def _to_response(user: models.User) -> schemas.AccountSettingsResponse:
    return schemas.AccountSettingsResponse(
        username=user.username,
        role_name=user.role_ref.name if user.role_ref else "guest",
        list_is_public=bool(user.list_is_public),
    )


@router.get(
    "/settings",
    response_model=schemas.AccountSettingsResponse,
    summary="My Account Settings",
)
def get_settings(
    db: Session = Depends(get_db), viewer: Viewer = Depends(get_viewer)
):
    return _to_response(_current_user(db, viewer))


@router.patch(
    "/settings",
    response_model=schemas.AccountSettingsResponse,
    summary="Update My Account Settings",
)
def update_settings(
    payload: schemas.AccountSettingsUpdate,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Making a list public exposes every row on it at /user/<username>, subject
    to the *reader's* own media-type and content-label permissions. It does not
    expose personal notes: those stay behind the personal_notes field group.
    """
    user = _current_user(db, viewer)
    user.list_is_public = payload.list_is_public
    db.commit()
    db.refresh(user)
    logger.info(
        "%s set list_is_public=%s", user.username, user.list_is_public
    )
    return _to_response(user)
```

- [ ] **Step 5: Mount it**

In `app/main.py`, beside the other `include_router` calls, after
`app.include_router(users.router)`:

```python
app.include_router(account.router)
```

and add `account` to the routers import at the top of the file, matching how
the existing imports there are written.

- [ ] **Step 6: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_account_settings.py -v`
Expected: all six PASS.

- [ ] **Step 7: Run the full backend suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures; ruff clean.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/routers/account.py app/schemas/rbac.py app/schemas/__init__.py \
        app/main.py tests/api/test_account_settings.py docs/PROGRESS.md
```
Proposed message: `feat(account): add the per-user list visibility toggle`
**Ask before running `git commit`.**

---

### Task 6: Rating points — the helper the spec's SQL needs

**Files:**
- Create: `app/services/domain/rating_points.py`
- Modify: `app/services/domain/__init__.py`
- Create: `tests/unit/test_rating_points.py`

**Interfaces:**
- Consumes: `MY_RATINGS` in `app/utils/constants.py`.
- Produces: `rating_points(letter)`, `points_to_letter(points)`,
  `rating_rank_case(column)`.

See "A correction to the spec" above. `my_rating` is one of
`("S", "A+", "A", "B", "C", "D", "E", "F")`, so neither `AVG(...::numeric)` nor
a string `ORDER BY` does what the spec's SQL was reaching for. One module owns
the mapping so the profile ordering and the community average cannot disagree.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_rating_points.py
"""
my_rating is a letter grade, not a number.

app/utils/constants.py declares MY_RATINGS = ("S", "A+", "A", "B", "C", "D",
"E", "F") and every my_rating column is a String. Averaging them and sorting
them both need a mapping, and this is the only one.
"""

import pytest

from app.services.domain.rating_points import (
    points_to_letter,
    rating_points,
)
from app.utils.constants import MY_RATINGS


def test_s_is_the_best_and_f_is_the_worst():
    assert rating_points("S") == 8
    assert rating_points("F") == 1


def test_a_plus_beats_a():
    assert rating_points("A+") > rating_points("A")


def test_every_declared_rating_maps_to_a_point():
    assert all(rating_points(r) is not None for r in MY_RATINGS)


def test_an_unknown_or_missing_rating_maps_to_none():
    assert rating_points(None) is None
    assert rating_points("") is None
    assert rating_points("9.5") is None


def test_whitespace_is_tolerated():
    assert rating_points(" A ") == rating_points("A")


def test_points_round_trip_to_the_nearest_letter():
    assert points_to_letter(8.0) == "S"
    assert points_to_letter(1.0) == "F"
    assert points_to_letter(6.4) == "A"


def test_points_to_letter_is_none_without_a_sample():
    assert points_to_letter(None) is None


@pytest.mark.parametrize("letter", MY_RATINGS)
def test_each_letter_round_trips(letter):
    assert points_to_letter(float(rating_points(letter))) == letter
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_rating_points.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named
'app.services.domain.rating_points'`

- [ ] **Step 3: Write the implementation**

```python
# app/services/domain/rating_points.py
"""
One place that turns a letter grade into a number and back.

my_rating is one of app.utils.constants.MY_RATINGS - "S", "A+", "A", "B", "C",
"D", "E", "F" - stored as a String on every table that has it. Two things need
it as a number: ordering a profile's list best-first, and averaging the public
lists' opinion of one work. Doing either in SQL against the raw string is
wrong in two different ways ("A+" sorts before "A"; "A+"::numeric raises), so
both go through this module and cannot drift apart.

The scale is the index of MY_RATINGS reversed: S=8 down to F=1. It is ordinal,
not interval - the gap between S and A+ is not claimed to equal the gap between
E and F - which is why an average is reported alongside its sample size and
rendered as the nearest letter rather than as a bare figure.
"""

from typing import Optional

from sqlalchemy import Integer, case

from app.utils.constants import MY_RATINGS

# {"S": 8, "A+": 7, ..., "F": 1}
RATING_POINTS: dict[str, int] = {
    letter: len(MY_RATINGS) - index for index, letter in enumerate(MY_RATINGS)
}


def rating_points(letter: Optional[str]) -> Optional[int]:
    """Points for one letter grade; None for missing, blank or unknown."""
    if not letter:
        return None
    return RATING_POINTS.get(str(letter).strip())


def points_to_letter(points: Optional[float]) -> Optional[str]:
    """
    The declared letter nearest to `points`, or None without a sample.

    An average of 6.4 is reported as "A", not as "6.4": the scale is ordinal
    and a decimal implies a precision the data does not have.
    """
    if points is None:
        return None
    return min(RATING_POINTS, key=lambda k: abs(RATING_POINTS[k] - points))


def rating_rank_case(column):
    """
    A SQL CASE turning a my_rating column into its points, for ORDER BY and
    AVG. Unknown and NULL become NULL, so `NULLS LAST` puts unrated rows at the
    end and AVG skips them.
    """
    return case(
        {letter: points for letter, points in RATING_POINTS.items()},
        value=column,
        else_=None,
    ).cast(Integer)
```

Export it from `app/services/domain/__init__.py` beside the other domain
helpers:

```python
from app.services.domain.rating_points import (  # noqa: F401
    points_to_letter,
    rating_points,
    rating_rank_case,
)
```

**Check `app/services/domain/__init__.py` before editing** — if it re-exports
nothing and modules are imported by path elsewhere, follow that convention
instead and skip this edit.

- [ ] **Step 4: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_rating_points.py -v`
Expected: all PASS.

- [ ] **Step 5: Run ruff and the unit tier**

Run:
```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest tests/unit -q
```
Expected: clean; no new failures.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/services/domain/rating_points.py app/services/domain/__init__.py \
        tests/unit/test_rating_points.py docs/PROGRESS.md
```
Proposed message: `feat(rating): map the letter grades to points for sorting and averaging`
**Ask before running `git commit`.**

---

### Task 7: `GET /api/profile/{username}`

**Files:**
- Create: `app/routers/profile.py`
- Modify: `app/schemas/rbac.py`
- Modify: `app/schemas/__init__.py`
- Modify: `app/services/rbac/enforcement.py`
- Modify: `app/main.py`
- Create: `tests/api/test_profile.py`

**Interfaces:**
- Consumes: `models.Media` (Step 0), `models.UserMediaList` (Step 1),
  `list_is_public` (Task 3), `rating_rank_case` (Task 6),
  `hidden_label_ids` (existing).
- Produces: `GET /api/profile/{username}`,
  `apply_media_visibility(query, db, viewer)`.

This is the spec's central query, corrected for letter grades:

```sql
SELECT m.media_type, m.display_name, l.status, l.my_rating
FROM user_media_list l JOIN media m ON m.system_id = l.media_id
WHERE l.user_id = :user
ORDER BY <rating points> DESC NULLS LAST;
```

**Three visibility rules, all enforced here.** A private list is 404 to
everyone but its owner and an admin — 404 rather than 403, matching
`entry_visible`'s rule that a hidden thing is indistinguishable from a missing
one. A public list is filtered by the **reader's** permissions, not the
owner's: a row for a media type the reader may not see, or carrying a content
label the reader lacks, is absent. And personal notes are not on this response
at all — the spec's open question 1 assumes only the list, and this plan takes
that assumption.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_profile.py
"""
GET /api/profile/{username} - one user's list, all media types.

The three rules this file exists to pin:
  private is 404 to everyone but its owner and an admin;
  a public list is filtered by the READER's permissions, not the owner's;
  personal notes are not on this response at all.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import label_perm, media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.services.security import get_password_hash
from tests.api.test_visibility import make_viewer


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(db):
    """A user with a two-entry list. Private until a test says otherwise."""
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role.system_id,
    )
    db.add(u)
    db.flush()
    return u


@pytest.fixture
def listed(db, owner, sample_anime, sample_manga):
    rows = [
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=owner.id,
            media_id=sample_anime.system_id,
            status="Completed",
            my_rating="S",
        ),
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=owner.id,
            media_id=sample_manga.system_id,
            status="Reading",
            my_rating="B",
        ),
    ]
    db.add_all(rows)
    db.flush()
    return rows


def test_a_private_list_is_404_to_a_stranger(client, owner, listed):
    assert client.get("/api/profile/kana").status_code == 404


def test_a_private_list_is_visible_to_its_owner(db, client, owner, listed):
    from app.services.security import create_access_token

    client.cookies.set(
        "access_token", f"Bearer {create_access_token({'sub': 'kana'})}"
    )
    r = client.get("/api/profile/kana")
    assert r.status_code == 200
    assert r.json()["is_self"] is True
    assert len(r.json()["entries"]) == 2


def test_a_private_list_is_visible_to_an_admin(admin_client, owner, listed):
    r = admin_client.get("/api/profile/kana")
    assert r.status_code == 200
    assert r.json()["is_self"] is False


def test_a_public_list_is_visible_to_a_stranger(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()

    r = client.get("/api/profile/kana")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "kana"
    assert body["list_is_public"] is True
    assert {e["media_type"] for e in body["entries"]} == {"anime", "manga"}


def test_entries_are_ordered_best_rated_first(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()

    ratings = [e["my_rating"] for e in client.get("/api/profile/kana").json()["entries"]]
    assert ratings == ["S", "B"]


def test_a_media_type_the_reader_may_not_see_is_absent(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()
    make_viewer(
        db,
        client,
        "no-manga",
        default_guest_permissions() - {media_type_perm("manga")},
    )

    types = {e["media_type"] for e in client.get("/api/profile/kana").json()["entries"]}
    assert types == {"anime"}


def test_a_labelled_entry_is_absent_for_a_reader_lacking_the_label(
    db, client, owner, listed, sample_anime
):
    owner.list_is_public = True
    label = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    db.add(label)
    db.flush()
    db.add(
        models.MediaContentLabel(
            media_id=sample_anime.system_id, label_id=label.system_id, position=0
        )
    )
    db.flush()

    make_viewer(db, client, "untrusted", default_guest_permissions())
    types = {e["media_type"] for e in client.get("/api/profile/kana").json()["entries"]}
    assert types == {"manga"}

    make_viewer(
        db, client, "trusted", default_guest_permissions() | {label_perm("nsfw")}
    )
    types = {e["media_type"] for e in client.get("/api/profile/kana").json()["entries"]}
    assert types == {"anime", "manga"}


def test_an_unknown_username_is_404(client):
    assert client.get("/api/profile/nobody").status_code == 404


def test_the_response_carries_no_personal_notes(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()
    body = client.get("/api/profile/kana").json()
    assert "notes" not in body
    assert all("notes" not in e for e in body["entries"])


def test_status_counts_are_reported(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()
    counts = {c["status"]: c["count"] for c in client.get("/api/profile/kana").json()["counts"]}
    assert counts == {"Completed": 1, "Reading": 1}
```

**`sample_manga` may not exist as a fixture.** Check `tests/api/conftest.py`
first; if it is missing, add one in that file modelled exactly on
`sample_anime` (a `models.Manga` with `manga_name_en="Test Manga"` and
`franchise_id=sample_franchise.system_id`), and include `tests/api/conftest.py`
in this task's commit.

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_profile.py -v`
Expected: FAIL — every request 404s because no route is mounted. (The
`test_an_unknown_username_is_404` case passes for the wrong reason; that is
fine, the others carry the task.)

- [ ] **Step 3: Add the media-visibility helper**

`apply_entry_visibility` narrows a query over **one** detail model of **one**
media type. A profile spans all nine at once, so it needs the same two gates
expressed against `media`. Add to `app/services/rbac/enforcement.py`, below
`apply_entry_visibility`:

```python
def apply_media_visibility(query: Query, db: Session, viewer: Optional[Viewer]):
    """
    The same two gates as apply_entry_visibility, over the `media` supertable
    rather than one detail table.

    A profile and a community aggregate both span every media type in one
    query, so the media-type check becomes an IN over the types the viewer
    holds instead of a boolean per query, and the label anti-join goes through
    media_content_label.media_id (a real FK since step 0) instead of the old
    (media_type, entry_id) pair.

    The query must already select from or join `models.Media`.
    """
    if viewer is None or viewer.is_superuser:
        return query

    allowed = [
        media_type
        for media_type in MEDIA_TABLES
        if viewer.has(media_type_perm(media_type))
    ]
    if not allowed:
        return query.filter(sa.false())
    query = query.filter(models.Media.media_type.in_(allowed))

    hidden = hidden_label_ids(db, viewer)
    if not hidden:
        return query
    return query.filter(
        ~sa.exists().where(
            sa.and_(
                models.MediaContentLabel.media_id == models.Media.system_id,
                models.MediaContentLabel.label_id.in_(hidden),
            )
        )
    )
```

- [ ] **Step 4: Add the schemas**

In `app/schemas/rbac.py`, below the account schemas:

```python
# ---------------------------------------------------------------------------
# Public profiles
# ---------------------------------------------------------------------------

class ProfileEntry(BaseModel):
    """One row of somebody's list, joined to the catalogue."""

    media_id: UUID
    media_type: str
    public_id: int
    display_name: str
    cover_image_file: Optional[str] = None
    status: str
    my_rating: Optional[str] = None


class ProfileStatusCount(BaseModel):
    status: str
    count: int


class ProfileResponse(BaseModel):
    """
    One user's list. Carries no personal notes and no email or password: a
    profile says what somebody has watched and what they thought of it, and
    nothing else about them.
    """

    username: str
    list_is_public: bool
    # True when the caller is looking at their own profile, so the SPA can
    # offer the visibility toggle rather than guessing from the username.
    is_self: bool
    counts: List[ProfileStatusCount] = []
    entries: List[ProfileEntry] = []
```

Export `ProfileEntry`, `ProfileStatusCount` and `ProfileResponse` from
`app/schemas/__init__.py`, in the `from app.schemas.rbac import (...)` list and
in `__all__`.

- [ ] **Step 5: Write the router**

```python
# app/routers/profile.py
"""
routers/profile.py
One user's list, read by anyone the owner allowed.

Read-only, and public by default in the routing sense - no dependency gates the
router - because the gate is per profile: a list is private unless its owner
made it public, and a private one answers 404 rather than 403 so it is
indistinguishable from a username that does not exist. That is the same rule
services.rbac.enforcement.entry_visible follows, for the same reason.

The rows a reader gets back are filtered by the READER's permissions, not the
owner's. A public list does not hand out a media type or a content label the
reader was never allowed to see; it only says which of the things they can
already see this person has on their list.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.rating_points import rating_rank_case
from app.services.rbac.enforcement import apply_media_visibility
from app.services.rbac.permissions import PERM_ADMIN
from app.services.rbac.resolver import Viewer, get_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profile", tags=["Profiles"])


@router.get(
    "/{username}",
    response_model=schemas.ProfileResponse,
    summary="A User's List",
)
def get_profile(
    username: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    owner = db.query(models.User).filter(models.User.username == username).first()
    if owner is None:
        raise HTTPException(status_code=404, detail="Profile not found.")

    is_self = bool(viewer.username) and viewer.username == owner.username
    may_read = is_self or bool(owner.list_is_public) or viewer.has(PERM_ADMIN)
    if not may_read:
        # 404, not 403: a private profile and a username nobody has are the
        # same answer, so a stranger cannot enumerate accounts.
        raise HTTPException(status_code=404, detail="Profile not found.")

    rank = rating_rank_case(models.UserMediaList.my_rating)
    query = (
        db.query(
            models.UserMediaList.media_id,
            models.Media.media_type,
            models.Media.public_id,
            models.Media.display_name,
            models.Media.cover_image_file,
            models.UserMediaList.status,
            models.UserMediaList.my_rating,
        )
        .join(models.Media, models.Media.system_id == models.UserMediaList.media_id)
        .filter(models.UserMediaList.user_id == owner.id)
    )
    query = apply_media_visibility(query, db, viewer)
    rows = query.order_by(
        rank.desc().nullslast(), models.Media.display_name
    ).all()

    entries = [
        schemas.ProfileEntry(
            media_id=row.media_id,
            media_type=row.media_type,
            public_id=row.public_id,
            display_name=row.display_name,
            cover_image_file=row.cover_image_file,
            status=row.status,
            my_rating=row.my_rating,
        )
        for row in rows
    ]

    # Counted from the filtered rows, not with a second GROUP BY query: the
    # figure a reader sees must match the list they were shown, or a hidden
    # entry leaks as a discrepancy in the totals.
    counts: dict[str, int] = {}
    for entry in entries:
        counts[entry.status] = counts.get(entry.status, 0) + 1

    return schemas.ProfileResponse(
        username=owner.username,
        list_is_public=bool(owner.list_is_public),
        is_self=is_self,
        counts=[
            schemas.ProfileStatusCount(status=status, count=count)
            for status, count in sorted(counts.items())
        ],
        entries=entries,
    )
```

- [ ] **Step 6: Mount it**

In `app/main.py`, after `app.include_router(account.router)`:

```python
app.include_router(profile.router)
```

and add `profile` to the routers import.

- [ ] **Step 7: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_profile.py -v`
Expected: all PASS.

- [ ] **Step 8: Run the full backend suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures; ruff clean.

- [ ] **Step 9: Prepare the commit and ask**

```bash
git add app/routers/profile.py app/services/rbac/enforcement.py \
        app/schemas/rbac.py app/schemas/__init__.py app/main.py \
        tests/api/test_profile.py tests/api/conftest.py docs/PROGRESS.md
```
(Drop `tests/api/conftest.py` from the list if Step 1 found `sample_manga`
already there.)
Proposed message: `feat(profile): serve a user's list at /api/profile/{username}`
**Ask before running `git commit`.**

---

### Task 8: `GET /api/community/{media_id}`

**Files:**
- Create: `app/routers/community.py`
- Modify: `app/schemas/rbac.py`
- Modify: `app/schemas/__init__.py`
- Modify: `app/main.py`
- Create: `tests/api/test_community_aggregate.py`

**Interfaces:**
- Consumes: `models.UserMediaList` (Step 1), `list_is_public` (Task 3),
  `rating_points` / `points_to_letter` (Task 6).
- Produces: `GET /api/community/{media_id}`.

The spec's answer to its own open question 2 is taken as decided: **public
lists only**, which means a small site shows small numbers. That is the point —
a count that included private lists would let anyone infer a private list's
contents by watching the number move.

The average is computed in Python from the letter grades, not in SQL: see "A
correction to the spec". Counts stay in SQL, where they belong.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_community_aggregate.py
"""
GET /api/community/{media_id} - what the PUBLIC lists think of one entry.

Private lists are not counted, and the reason is not squeamishness: a total
that moved when a private list changed would let anyone read a private list one
bit at a time.
"""

import uuid

import pytest

from app import models
from app.services.security import get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


def _member(db, username, public):
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    u = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("x"),
        role_id=role.system_id,
        list_is_public=public,
    )
    db.add(u)
    db.flush()
    return u


def _listed(db, user, media_id, status, rating):
    row = models.UserMediaList(
        system_id=uuid.uuid4(),
        user_id=user.id,
        media_id=media_id,
        status=status,
        my_rating=rating,
    )
    db.add(row)
    db.flush()
    return row


def test_an_entry_nobody_listed_reports_nothing(client, sample_anime):
    r = client.get(f"/api/community/{sample_anime.system_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["statuses"] == []
    assert body["sample_size"] == 0
    assert body["average_rating"] is None


def test_public_lists_are_counted_per_status(db, client, sample_anime):
    _listed(db, _member(db, "a", True), sample_anime.system_id, "Completed", "S")
    _listed(db, _member(db, "b", True), sample_anime.system_id, "Completed", "A")
    _listed(db, _member(db, "c", True), sample_anime.system_id, "Watching", None)

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    counts = {s["status"]: s["count"] for s in body["statuses"]}
    assert counts == {"Completed": 2, "Watching": 1}
    assert body["list_count"] == 3


def test_private_lists_are_not_counted(db, client, sample_anime):
    _listed(db, _member(db, "seen", True), sample_anime.system_id, "Completed", "A")
    _listed(db, _member(db, "hidden", False), sample_anime.system_id, "Completed", "F")

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    assert body["list_count"] == 1
    assert body["sample_size"] == 1
    assert body["average_rating"] == "A"


def test_the_average_ignores_unrated_rows(db, client, sample_anime):
    _listed(db, _member(db, "a", True), sample_anime.system_id, "Completed", "S")
    _listed(db, _member(db, "b", True), sample_anime.system_id, "Watching", None)

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    assert body["list_count"] == 2
    assert body["sample_size"] == 1
    assert body["average_rating"] == "S"


def test_the_average_is_the_nearest_letter(db, client, sample_anime):
    # S=8 and A=6 average to 7, which is A+.
    _listed(db, _member(db, "a", True), sample_anime.system_id, "Completed", "S")
    _listed(db, _member(db, "b", True), sample_anime.system_id, "Completed", "A")

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    assert body["average_points"] == 7.0
    assert body["average_rating"] == "A+"


def test_an_unknown_media_id_reports_nothing_rather_than_erroring(client):
    r = client.get(f"/api/community/{uuid.uuid4()}")
    assert r.status_code == 200
    assert r.json()["list_count"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_community_aggregate.py -v`
Expected: FAIL — 404, no route mounted.

- [ ] **Step 3: Add the schemas**

In `app/schemas/rbac.py`, below the profile schemas:

```python
# ---------------------------------------------------------------------------
# Community aggregates
# ---------------------------------------------------------------------------

class CommunityStatusCount(BaseModel):
    status: str
    count: int


class CommunityAggregate(BaseModel):
    """
    What the public lists say about one entry.

    sample_size is separate from list_count on purpose: a work can be on forty
    lists and rated by six, and a "6" beside an average is the difference
    between a figure and a rumour.
    """

    media_id: UUID
    # How many public lists hold this entry at all.
    list_count: int
    statuses: List[CommunityStatusCount] = []
    # How many of those carried a rating.
    sample_size: int
    # The mean on the 1-8 letter scale, and that mean as the nearest letter.
    average_points: Optional[float] = None
    average_rating: Optional[str] = None
```

Export `CommunityStatusCount` and `CommunityAggregate` from
`app/schemas/__init__.py`.

- [ ] **Step 4: Write the router**

```python
# app/routers/community.py
"""
routers/community.py
What the public lists collectively say about one entry.

PUBLIC LISTS ONLY, and that is a correctness rule rather than a courtesy. A
figure that moved when a private list changed would let anyone read a private
list one bit at a time by watching the number: add an entry, refresh, see the
count rise. Every query here joins users and filters on list_is_public.

The average is computed in Python from the letter grades. my_rating is one of
MY_RATINGS ("S", "A+", "A", ...), stored as a String, so AVG(my_rating::numeric)
raises on the first row. app.services.domain.rating_points owns the mapping and
the profile ordering uses the same one.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.rating_points import points_to_letter, rating_points

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/community", tags=["Community"])


@router.get(
    "/{media_id}",
    response_model=schemas.CommunityAggregate,
    summary="Public-list Aggregate for One Entry",
)
def get_community_aggregate(media_id: UUID, db: Session = Depends(get_db)):
    """
    An unknown media_id answers an empty aggregate rather than 404: this is a
    block on a detail page whose own route already decided whether the entry
    exists, and a 404 here would blank a page that is otherwise fine.
    """
    status_rows = (
        db.query(models.UserMediaList.status, func.count().label("count"))
        .join(models.User, models.User.id == models.UserMediaList.user_id)
        .filter(
            models.UserMediaList.media_id == media_id,
            models.User.list_is_public.is_(True),
        )
        .group_by(models.UserMediaList.status)
        .order_by(models.UserMediaList.status)
        .all()
    )

    rating_rows = (
        db.query(models.UserMediaList.my_rating)
        .join(models.User, models.User.id == models.UserMediaList.user_id)
        .filter(
            models.UserMediaList.media_id == media_id,
            models.User.list_is_public.is_(True),
            models.UserMediaList.my_rating.isnot(None),
        )
        .all()
    )
    points = [
        value
        for value in (rating_points(row.my_rating) for row in rating_rows)
        if value is not None
    ]
    average = round(sum(points) / len(points), 2) if points else None

    return schemas.CommunityAggregate(
        media_id=media_id,
        list_count=sum(row.count for row in status_rows),
        statuses=[
            schemas.CommunityStatusCount(status=row.status, count=row.count)
            for row in status_rows
        ],
        sample_size=len(points),
        average_points=average,
        average_rating=points_to_letter(average),
    )
```

- [ ] **Step 5: Mount it**

In `app/main.py`, after `app.include_router(profile.router)`:

```python
app.include_router(community.router)
```

and add `community` to the routers import.

- [ ] **Step 6: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_community_aggregate.py -v`
Expected: all six PASS.

- [ ] **Step 7: Run the full backend suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures; ruff clean.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/routers/community.py app/schemas/rbac.py app/schemas/__init__.py \
        app/main.py tests/api/test_community_aggregate.py docs/PROGRESS.md
```
Proposed message: `feat(community): aggregate public lists per entry`
**Ask before running `git commit`.**

---

# Phase C — Frontend

Read `docs/frontend/design-system.md` before this phase if you have not. The
rules that bite: one accent (`brand`), structure in mono (`Eyebrow`), flat
hairlines, no decorative icons, colour never encodes a category, semantic
tokens only.

### Task 9: Endpoint builders and the settings page

**Files:**
- Modify: `frontend/src/api/endpoints.js`
- Create: `frontend/src/pages/public/Settings.jsx`
- Create: `frontend/src/pages/public/Settings.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/config/navigation.js`
- Modify: `frontend/src/config/navigation.test.js`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/account/settings` (Task 5).
- Produces: `endpoints.account`, `endpoints.profile`, `endpoints.community`;
  the `/settings` route.

`/settings` is guarded by `<ProtectedRoute permission="self.list" />`. That
component already takes a `permission` prop and defaults to `"admin"`, so this
needs no change to it: a guest is redirected to login, a `user` passes, an
admin passes as a superuser. The nav link carries `requires: "self.list"` for
the same reason.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/public/Settings.test.jsx
// The one thing a signed-in member can change about their own account.
//
// What matters here is that the toggle reflects the server and writes back to
// it - a switch that only moved locally would tell someone their list was
// public when it was not.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Settings from "./Settings";

const PRIVATE = { username: "kana", role_name: "user", list_is_public: false };

function renderPage() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (options.method === "PATCH") {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...PRIVATE, ...body }),
          };
        }
        return { ok: true, status: 200, json: async () => PRIVATE };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the account it is about", async () => {
    renderPage();
    expect(await screen.findByText("kana")).toBeInTheDocument();
  });

  it("starts on the value the server reported", async () => {
    renderPage();
    const toggle = await screen.findByRole("checkbox", {
      name: /make my list public/i,
    });
    expect(toggle).not.toBeChecked();
  });

  it("writes the new value back", async () => {
    renderPage();
    const toggle = await screen.findByRole("checkbox", {
      name: /make my list public/i,
    });
    await userEvent.click(toggle);

    await waitFor(() => {
      const patch = global.fetch.mock.calls.find(
        ([, opts]) => opts?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
      expect(patch[0]).toBe("/api/account/settings");
      expect(JSON.parse(patch[1].body)).toEqual({ list_is_public: true });
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("says where a public list becomes visible", async () => {
    renderPage();
    expect(await screen.findByText(/\/user\/kana/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/public/Settings.test.jsx`
Expected: FAIL — `Failed to resolve import "./Settings"`.

- [ ] **Step 3: Add the endpoint builders**

In `frontend/src/api/endpoints.js`, after the `users` block:

```js
  // The caller's own account. No id in any path: these act on whoever the
  // session says you are.
  account: {
    settings: () => "/api/account/settings",
  },

  profile: {
    detail: (username) => `/api/profile/${encodeURIComponent(username)}`,
  },

  community: {
    forEntry: (mediaId) => `/api/community/${mediaId}`,
  },
```

- [ ] **Step 4: Write the page**

```jsx
// frontend/src/pages/public/Settings.jsx
// Frontend: the account's own settings. One switch today.
//
// The toggle writes on change rather than behind a Save button: there is one
// field, and a Save button for one boolean is a second click that can only be
// forgotten. The switch reflects the server's answer, not the click, so a
// refused write leaves it where it was.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { Eyebrow, Slip } from "../../components/ui/primitives";

export default function Settings() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await fetchJson(endpoints.account.settings()));
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function setPublic(next) {
    setSaving(true);
    try {
      const updated = await fetchJson(endpoints.account.settings(), {
        method: "PATCH",
        ...jsonBody({ list_is_public: next }),
      });
      setSettings(updated);
      showToast(
        "success",
        updated.list_is_public ? "Your list is public." : "Your list is private.",
      );
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-text-faint">Loading settings...</div>;
  }

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-text-muted">
        Sign in to change your settings.
      </div>
    );
  }

  const profilePath = `/user/${settings.username}`;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <Eyebrow className="mt-1">Account</Eyebrow>
        <p className="mt-1 text-sm text-text-muted">
          <span className="font-mono">{settings.username}</span>
          <span className="text-text-faint"> · {settings.role_name}</span>
        </p>
      </header>

      <Slip title="List visibility">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.list_is_public}
            disabled={saving}
            onChange={(e) => setPublic(e.target.checked)}
            className="mt-1 accent-brand"
          />
          <span>
            <span className="block text-sm text-text">Make my list public</span>
            <span className="block text-sm text-text-muted mt-1">
              A public list can be read by anyone at{" "}
              <Link to={profilePath} className="text-brand underline">
                {profilePath}
              </Link>
              , and its ratings count towards the community figures on an
              entry&apos;s page. Your personal notes stay private either way.
            </span>
          </span>
        </label>
      </Slip>
    </div>
  );
}
```

**`accent-brand` is a Tailwind arbitrary-property use of the brand token, not a
palette colour** — it passes `theme-tokens.test.js`, which only rejects
`gray`/`slate`/`zinc`/`neutral` scales. If the checkbox does not pick up the
colour, drop the class rather than reaching for a palette hue.

- [ ] **Step 5: Add the route**

In `frontend/src/App.jsx`, add the lazy import beside the other lazy pages:

```jsx
const Settings = lazy(() => import("./pages/public/Settings"));
```

and the route — **not** inside the existing `<Route element={<ProtectedRoute />}>`
block, which defaults to the admin permission:

```jsx
                <Route element={<ProtectedRoute permission="self.list" />}>
                  <Route path="/settings" element={<Settings />} />
                </Route>
```

Place it directly above the admin `<Route element={<ProtectedRoute />}>` block.

- [ ] **Step 6: Add the nav link**

In `frontend/src/config/navigation.js`, the Admin section is `requires:
"admin"` as a whole, so `/settings` cannot live there. Add it to the section a
signed-in non-admin can already open — check which sections have no `requires`
and put it in the last one, as a divider plus one item:

```js
      { divider: true },
      {
        label: "Settings",
        icon: "fas fa-sliders-h",
        to: "/settings",
        requires: "self.list",
      },
```

Then update `frontend/src/config/navigation.test.js`: the existing test that
asserts an exact `sectionItems(...).map((i) => i.to)` array for that section
now needs the two new members (`undefined` for the divider, then `/settings`),
and the test asserting which sections carry a requirement is unaffected because
this is an item-level `requires`, not a section-level one. **Run the nav test
first to see exactly which assertion breaks, then fix that assertion — do not
rewrite the file.**

- [ ] **Step 7: Run the frontend tests**

Run:
```bash
cd frontend && npx vitest run src/pages/public/Settings.test.jsx src/config/navigation.test.js
```
Expected: all PASS.

- [ ] **Step 8: Run the whole frontend suite, lint and build**

Run:
```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green. `theme-tokens.test.js` and `nav-offset.test.js` must pass —
if `theme-tokens` fails it names the file and the offending class.

- [ ] **Step 9: Prepare the commit and ask**

```bash
git add frontend/src/api/endpoints.js frontend/src/pages/public/Settings.jsx \
        frontend/src/pages/public/Settings.test.jsx frontend/src/App.jsx \
        frontend/src/config/navigation.js frontend/src/config/navigation.test.js \
        docs/PROGRESS.md
```
Proposed message: `feat(settings): add the per-user list visibility toggle page`
**Ask before running `git commit`.**

---

### Task 10: The `/user/:username` profile page

**Files:**
- Create: `frontend/src/pages/public/Profile.jsx`
- Create: `frontend/src/pages/public/Profile.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/profile/{username}` (Task 7), `endpoints.profile`
  (Task 9), `entityPath` in `frontend/src/lib/entityPath.js`.
- Produces: the `/user/:username` route.

Public route, no `ProtectedRoute`: the server already answers 404 for a list
the caller may not read, so the page's job on a 404 is to say so plainly rather
than to guess why.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/public/Profile.test.jsx
// Somebody's list, all media types on one page.
//
// The two things worth pinning: the page groups by media type rather than
// running nine tables down the screen, and a list the server would not show
// reads as "not found" rather than as an empty list - an empty list and a
// private one must not look the same.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Profile from "./Profile";

const BODY = {
  username: "kana",
  list_is_public: true,
  is_self: false,
  counts: [
    { status: "Completed", count: 1 },
    { status: "Reading", count: 1 },
  ],
  entries: [
    {
      media_id: "11111111-1111-1111-1111-111111111111",
      media_type: "anime",
      public_id: 412,
      display_name: "葬送的芙莉蓮",
      cover_image_file: null,
      status: "Completed",
      my_rating: "S",
    },
    {
      media_id: "22222222-2222-2222-2222-222222222222",
      media_type: "manga",
      public_id: 118,
      display_name: "鏈鋸人",
      cover_image_file: null,
      status: "Reading",
      my_rating: "B",
    },
  ],
};

function renderAt(username = "kana") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/user/${username}`]}>
        <Routes>
          <Route path="/user/:username" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Profile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("a public list", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, status: 200, json: async () => BODY })),
      );
    });

    it("names whose list it is", async () => {
      renderAt();
      expect(await screen.findByText("kana")).toBeInTheDocument();
    });

    it("shows every media type on one page", async () => {
      renderAt();
      expect(await screen.findByText("葬送的芙莉蓮")).toBeInTheDocument();
      expect(screen.getByText("鏈鋸人")).toBeInTheDocument();
    });

    it("groups the entries by media type", async () => {
      renderAt();
      const headings = (await screen.findAllByRole("heading", { level: 2 })).map(
        (h) => h.textContent,
      );
      expect(headings).toEqual(["Anime", "Manga"]);
    });

    it("links each entry to its detail page", async () => {
      renderAt();
      const link = await screen.findByRole("link", { name: /葬送的芙莉蓮/ });
      expect(link.getAttribute("href")).toContain("/anime/412");
    });

    it("shows the status totals", async () => {
      renderAt();
      expect(await screen.findByText(/Completed/)).toBeInTheDocument();
      expect(screen.getByText(/Reading/)).toBeInTheDocument();
    });
  });

  describe("a list the server will not show", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          json: async () => ({ detail: "Profile not found." }),
        })),
      );
    });

    it("says the profile is not available rather than showing an empty list", async () => {
      renderAt("nobody");
      expect(
        await screen.findByText(/no profile here/i),
      ).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/public/Profile.test.jsx`
Expected: FAIL — `Failed to resolve import "./Profile"`.

- [ ] **Step 3: Write the page**

```jsx
// frontend/src/pages/public/Profile.jsx
// Frontend: one person's list, every media type on one page.
//
// The whole point of the media supertable is that this is one query and one
// page rather than nine. Grouping by type is presentation only - the server
// already ordered the rows best-rated first, and each group keeps that order.
//
// A private list answers 404 from the server, so this page never has to decide
// whether it may show something. It only has to say "no profile here" in a way
// that does not distinguish a private list from a username nobody has.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";
import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { entityPath } from "../../lib/entityPath";
import { Chip, Eyebrow, RatingStamp, Slip } from "../../components/ui/primitives";

// Hyphenated data-layer keys, in the order a page should read them.
const TYPE_ORDER = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
];

function typeLabel(key) {
  return MEDIA_CONFIG[key]?.label ?? key;
}

export default function Profile() {
  const { username } = useParams();
  const { data, isLoading, isError } = useApiQuery(
    ["profile", username],
    endpoints.profile.detail(username),
    { queryOptions: { retry: false } },
  );

  const groups = useMemo(() => {
    if (!data?.entries) return [];
    const byType = new Map();
    for (const entry of data.entries) {
      if (!byType.has(entry.media_type)) byType.set(entry.media_type, []);
      byType.get(entry.media_type).push(entry);
    }
    return TYPE_ORDER.filter((key) => byType.has(key)).map((key) => ({
      key,
      label: typeLabel(key),
      entries: byType.get(key),
    }));
  }, [data]);

  if (isLoading) {
    return <div className="p-8 text-center text-text-faint">Loading profile...</div>;
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold text-text">No profile here</h1>
        <p className="mt-2 text-text-muted">
          There is no public list for that name. A list is private until its
          owner makes it public.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6 border-b border-border pb-4">
        <Eyebrow>Profile</Eyebrow>
        <h1 className="text-3xl font-bold text-text">{data.username}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.counts.map((row) => (
            <Chip key={row.status}>
              {row.status} {row.count}
            </Chip>
          ))}
          {data.counts.length === 0 && (
            <span className="text-sm text-text-muted">Nothing on this list yet.</span>
          )}
        </div>
        {data.is_self && !data.list_is_public && (
          <p className="mt-3 text-sm text-text-muted">
            Only you can see this.{" "}
            <Link to="/settings" className="text-brand underline">
              Make it public
            </Link>
            .
          </p>
        )}
      </header>

      <div className="space-y-6">
        {groups.map((group) => (
          <Slip key={group.key} title={group.label} titleAs="h2">
            <ul className="divide-y divide-border">
              {group.entries.map((entry) => (
                <li
                  key={entry.media_id}
                  className="flex items-center gap-3 py-2"
                >
                  <div className="w-10 shrink-0 text-center">
                    {entry.my_rating ? (
                      <RatingStamp rating={entry.my_rating} size="sm" />
                    ) : (
                      <span className="text-text-faint font-mono text-xs">—</span>
                    )}
                  </div>
                  <Link
                    to={entityPath(entry.media_type, entry.public_id, entry.display_name)}
                    className="flex-1 text-text hover:text-brand"
                  >
                    {entry.display_name}
                  </Link>
                  <span className="font-mono text-xs uppercase text-text-faint">
                    {entry.status}
                  </span>
                </li>
              ))}
            </ul>
          </Slip>
        ))}
      </div>
    </div>
  );
}
```

**Two things to verify against the real code before running the test.** First,
`Slip`'s title-element prop: open
`frontend/src/components/ui/primitives.jsx` and check whether it accepts
`titleAs`. If it does not, the test's `getAllByRole("heading", { level: 2 })`
will not match — either pass the prop the component actually takes or render
the heading yourself above the `Slip`. Second, `entityPath`'s signature: open
`frontend/src/lib/entityPath.js` and call it exactly as the detail pages do.

- [ ] **Step 4: Add the route**

In `frontend/src/App.jsx`, beside the other lazy public pages:

```jsx
const Profile = lazy(() => import("./pages/public/Profile"));
```

and among the public routes, beside `/plan`:

```jsx
                <Route path="/user/:username" element={<Profile />} />
```

- [ ] **Step 5: Run the test**

Run: `cd frontend && npx vitest run src/pages/public/Profile.test.jsx`
Expected: all six PASS.

- [ ] **Step 6: Run the whole frontend suite, lint and build**

Run:
```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 7: Look at it**

Start the dev server (`dev.ps1`, or `cd frontend && npm run dev`), sign in,
make your own list public at `/settings`, and open `/user/<your username>`.
Check both themes with the theme toggle. This is a design-system page and
`theme-tokens.test.js` only catches the greys, not a layout that reads wrong.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add frontend/src/pages/public/Profile.jsx \
        frontend/src/pages/public/Profile.test.jsx frontend/src/App.jsx \
        docs/PROGRESS.md
```
Proposed message: `feat(profile): add the /user/:username page`
**Ask before running `git commit`.**

---

### Task 11: The community block on detail pages

**Files:**
- Create: `frontend/src/components/info/CommunityCard.jsx`
- Create: `frontend/src/components/info/CommunityCard.test.jsx`
- Modify: `frontend/src/pages/detail/Anime.jsx`
- Modify: the other eight detail pages under `frontend/src/pages/detail/`

**Interfaces:**
- Consumes: `GET /api/community/{media_id}` (Task 8), `endpoints.community`
  (Task 9).
- Produces: `<CommunityCard mediaId={...} />`.

One component, used by all nine detail pages, because the aggregate is the same
question on every one of them. It renders **nothing** when no public list holds
the entry — an empty "Community" slip on a site with three accounts is a frame
around nothing, which is the rule `CastSection` in `Anime.jsx` already follows
for an empty cast.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/info/CommunityCard.test.jsx
// What the public lists think of one entry.
//
// The sample size is the thing this component must never drop: an average of
// "A" over two ratings and an average of "A" over two hundred are different
// claims, and only one of them is worth reading.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import CommunityCard from "./CommunityCard";

const MEDIA_ID = "11111111-1111-1111-1111-111111111111";

function stub(body) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommunityCard mediaId={MEDIA_ID} />
    </QueryClientProvider>,
  );
}

describe("CommunityCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when no public list holds the entry", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 0,
      statuses: [],
      sample_size: 0,
      average_points: null,
      average_rating: null,
    });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the per-status counts", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 3,
      statuses: [
        { status: "Completed", count: 2 },
        { status: "Watching", count: 1 },
      ],
      sample_size: 2,
      average_points: 7.0,
      average_rating: "A+",
    });
    renderCard();
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("shows the average beside its sample size", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 3,
      statuses: [{ status: "Completed", count: 2 }],
      sample_size: 2,
      average_points: 7.0,
      average_rating: "A+",
    });
    renderCard();
    expect(await screen.findByText("A+")).toBeInTheDocument();
    expect(screen.getByText(/2 ratings/)).toBeInTheDocument();
  });

  it("omits the average when nobody rated it", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 2,
      statuses: [{ status: "Watching", count: 2 }],
      sample_size: 0,
      average_points: null,
      average_rating: null,
    });
    renderCard();
    expect(await screen.findByText("Watching")).toBeInTheDocument();
    expect(screen.queryByText(/ratings/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/info/CommunityCard.test.jsx`
Expected: FAIL — `Failed to resolve import "./CommunityCard"`.

- [ ] **Step 3: Write the component**

```jsx
// frontend/src/components/info/CommunityCard.jsx
// Frontend: what the PUBLIC lists say about one entry.
//
// Public lists only, which on a small site means small numbers. That is the
// honest answer: counting private lists would let anyone read one by watching
// the total move. The sample size is always printed beside the average for the
// same reason - an average over two ratings is not the same claim as an
// average over two hundred, and a bare letter hides the difference.
//
// Renders nothing at all when no public list holds the entry. An empty
// "Community" slip is a frame around nothing.
import { endpoints } from "../../api/endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Eyebrow, RatingStamp, Slip } from "../ui/primitives";

export default function CommunityCard({ mediaId }) {
  const { data } = useApiQuery(
    ["community", mediaId],
    endpoints.community.forEntry(mediaId),
    { enabled: Boolean(mediaId), queryOptions: { retry: false } },
  );

  if (!data || data.list_count === 0) return null;

  return (
    <Slip title="Community">
      {data.average_rating && (
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
          <RatingStamp rating={data.average_rating} size="md" />
          <div>
            <Eyebrow>Average</Eyebrow>
            <div className="font-mono text-xs text-text-faint">
              {data.sample_size} ratings
            </div>
          </div>
        </div>
      )}

      <ul className="space-y-1">
        {data.statuses.map((row) => (
          <li key={row.status} className="flex items-baseline justify-between">
            <span className="text-sm text-text-muted">{row.status}</span>
            <span className="font-mono text-sm text-text">{row.count}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-text-faint">
        Public lists only
      </p>
    </Slip>
  );
}
```

- [ ] **Step 4: Run the component test**

Run: `cd frontend && npx vitest run src/components/info/CommunityCard.test.jsx`
Expected: all four PASS.

- [ ] **Step 5: Put it on the nine detail pages**

In each of `frontend/src/pages/detail/Anime.jsx`, `AnimeMovie.jsx`,
`Movie.jsx`, `TV.jsx`, `Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx` and
`Game.jsx`, add the import:

```jsx
import CommunityCard from "../../components/info/CommunityCard";
```

and render it in the same column as `MyTrackerCard`, directly after it:

```jsx
              <CommunityCard mediaId={item.system_id} />
```

**Read each page before editing it.** The variable holding the entry is not
`item` on every page — `Anime.jsx` names it in its `useMediaItem` destructure —
and the column layout differs. Use whatever that page already calls the entry,
and put the card where `MyTrackerCard` already sits so the two personal /
collective answers read together.

- [ ] **Step 6: Run the whole frontend suite, lint and build**

Run:
```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 7: Look at it**

With the dev server running and at least one public list holding an entry, open
that entry's detail page. Check that the card is absent on an entry no public
list holds, and check both themes.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add frontend/src/components/info/CommunityCard.jsx \
        frontend/src/components/info/CommunityCard.test.jsx \
        frontend/src/pages/detail/Anime.jsx \
        frontend/src/pages/detail/AnimeMovie.jsx \
        frontend/src/pages/detail/Movie.jsx \
        frontend/src/pages/detail/TV.jsx \
        frontend/src/pages/detail/Cartoon.jsx \
        frontend/src/pages/detail/Manga.jsx \
        frontend/src/pages/detail/Novel.jsx \
        frontend/src/pages/detail/Comic.jsx \
        frontend/src/pages/detail/Game.jsx \
        docs/PROGRESS.md
```
Proposed message: `feat(community): show the public-list aggregate on detail pages`
**Ask before running `git commit`.**

---

# Phase D — Documentation

### Task 12: Record what shipped

**Files:**
- Modify: `docs/authorization.md`
- Modify: `docs/authentication.md`
- Modify: `docs/api.md`
- Modify: `docs/data-model.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: `docs/authorization.md`**

Add a `self` row to the "Permission catalog (code)" table:

| Name | Meaning | Source of keys |
|---|---|---|
| `self.<key>` | may write your own rows of that kind — `self.list`, `self.personal_notes` | `SELF_PERMISSION_KEYS` in `app/services/rbac/permissions.py` |

Add a "Roles" subsection recording that there are now three seeded roles —
`guest`, `user` (`sort_order` 50, system, not superuser) and `admin` — that
`default_user_permissions()` is `default_guest_permissions()` plus the two
`self.*` grants, and that the same `if not held:` top-up rule applies: an
already-established role is never re-granted a permission an admin removed.

Add a note that `self.personal_notes` is **granted but not yet enforced
anywhere**: the note-scope work is Step 5 of the multi-user programme, and
until it lands the permission is a promise the schema cannot yet keep. Say so
explicitly rather than leaving a reader to discover it.

Bump `Last verified`.

- [ ] **Step 2: `docs/authentication.md`**

The line "There is no self-registration and no password reset. Accounts are
created by an admin through `/api/users`" is still true and should stay. Add,
directly below it, a pointer to the blocking prerequisite: real accounts make
the cookie `secure=False` and the missing secret fail-fast urgent, they are not
fixed, and the plan for them is a separate project. Reference this plan file by
path.

Bump `Last verified`.

- [ ] **Step 3: `docs/api.md`**

Add the four routes: `GET`/`PATCH /api/account/settings`,
`GET /api/profile/{username}` and `GET /api/community/{media_id}`, with their
auth requirement (session / session / none / none) and the 404-not-403 rule for
a private profile. Bump `Last verified`.

- [ ] **Step 4: `docs/data-model.md`**

Add `users.list_is_public` (boolean, NOT NULL, default false) to the `users`
row of whichever table describes that table, with the one-line reason: private
by default, written only by its owner. Bump `Last verified`.

- [ ] **Step 5: `docs/roadmap.md`**

Record that Step 2 of the multi-user programme shipped, and that it is gated on
the auth-hardening project before any account is created for another person.
Do not modify the plan itself.

- [ ] **Step 6: `docs/PROGRESS.md`**

Delete this plan's table. Add the auth-hardening gate to "Open items" if it is
not already there, with the two defects named. Remove
`anime_site_test_step2` from the Environment table's droppable list only if you
dropped it.

- [ ] **Step 7: Run the four checks one last time**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add docs/authorization.md docs/authentication.md docs/api.md \
        docs/data-model.md docs/roadmap.md docs/PROGRESS.md
```
Proposed message: `docs: record accounts, the user role, profiles and community aggregates`
**Ask before running `git commit`.**

---

## Definition of done

- **The gate is stated and not crossed.** No cookie flag changed, no secret
  fail-fast added, no session lifetime touched, no password reset, no
  `personal_notes` field-group redesign. `git diff` over the whole step touches
  `app/routers/auth.py` not at all.
- `ensure_rbac_seed` creates three roles; `default_user_permissions()` minus
  `default_guest_permissions()` is exactly `{self.list, self.personal_notes}`.
- `alembic heads` shows exactly one head, `m2a2public`. Both migrations run
  twice in a row without changing the result.
- An admin creates an account on the `user` role from the existing `/users`
  page with **no change to that page** — its role `<select>` is populated from
  `GET /api/roles/`, so the new role is simply there.
- **No new admin surface exists.** `grep -rn "get_current_admin" app/routers/`
  returns the same set of modules it returned before this step, plus nothing.
- A brand-new account's list is private: `GET /api/profile/<them>` answers 404
  to a stranger and 200 to them.
- Toggling `/settings` flips `users.list_is_public` and nothing else; the same
  request from an anonymous client answers 401.
- `/user/<username>` renders a public list across every media type in one page,
  filtered by the **reader's** media-type and content-label permissions.
- A detail page shows per-status counts and an average letter grade over public
  lists only, with the sample size beside the average, and shows nothing when
  no public list holds the entry.
- `grep -rn "my_rating::numeric" app/` returns nothing — the spec's SQL sketch
  was wrong about the column's type and no code copied it.
- All four checks green; `frontend_dist/` rebuilt.
