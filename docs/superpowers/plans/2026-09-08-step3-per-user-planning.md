# Step 3 — per-user `plan_next` and `seasonal` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two remaining single-user tables per-user. `plan_next` gains
a `user_id` and, in the same move, trades its FK-less `(scope, target_id)` pair
for a disjoint set of real foreign keys, so every plan row cascades when the
thing it points at is deleted. `seasonal`'s primary key becomes
`(user_id, seasonal)` and its four counters become per-user aggregates computed
from `user_media_list`.

**Architecture:** Expand, convert, contract — the same order Step 0 used, and
for the same reason. **Expand** (Task 2) adds `user_id`, `media_id`,
`franchise_id` and `series_id` to `plan_next`, backfills them from the existing
`(scope, target_id)` pair, adds the CHECK and the FKs, and makes the two old
columns nullable so the code may stop writing them. **Convert** (Tasks 3–5)
moves the model, the services, every caller and the Sheets layer onto the new
columns and onto a user scope. **Contract** (Task 6) drops `scope` and
`target_id`. `seasonal` follows in Tasks 7–9, which are a straight
add-column / repoint-the-PK / rewrite-the-recompute sequence because nothing
outside `app/services/domain/seasonal.py` and two routers writes it.

Two facts about `plan_next` decide the shape of the conversion, and both come
from reading the model rather than from the spec:

- **`media_type` stays.** It is stored on *every* row, including the
  franchise-scope and series-scope ones, where it is not derivable from
  anything: it is the Plan page's tab discriminator, and the unique constraint
  keys on it so one franchise can be queued once under `anime` and again under
  `tv-show`. It is not the owner kind and it does not go away.
- **`scope` is what becomes a derivation.** `scope` holds `entry`, `series` or
  `franchise` — the owner kind — and that is exactly what the non-null FK
  column will say. After Task 6 `scope` and `target_id` are read-only Python
  properties on the model, so the API wire format, `drop_hidden_rows` and the
  whole frontend keep working unchanged.

**`plan_next` has no collection scope.** `SCOPES` in
`app/utils/plan_next_kinds.py` is `("entry", "series", "franchise")` — three
values, no `collection`. The disjoint FK set is therefore **three** columns, not
the four the design sketch shows, and `ck_plan_next_one_owner` reads
`num_nonnulls(media_id, franchise_id, series_id) = 1`. A `collection_id` column
here would be permanently NULL on every row and could never be written, because
the API rejects any scope outside `SCOPES`. `note` and `meme` do resolve through
the full `OWNER_TABLES` and will need the four-column set in Step 5; `plan_next`
does not.

**The API wire format is deliberately preserved.** `PlanNextRead` still carries
`scope` and `target_id`, `PlanNextCreate` still accepts them, and
`SeasonalResponse` is untouched, so no page component changes shape.

**The frontend change is routing only.** Plan, Seasonal and Statistics stop
being publicly reachable (Task 10): `App.jsx` moves four routes behind the
existing `frontend/src/components/layout/ProtectedRoute.jsx`, which redirects a
logged-out visitor to `/login?next=…`. No page component is edited, so no
Tailwind class changes — but `cd frontend && npm run build` still runs after
Task 10, because `App.jsx` is a frontend file.

**Tech Stack:** FastAPI, SQLAlchemy 2.0.48, Alembic, PostgreSQL 17, pytest,
ruff; React + Vite, TanStack Query, Tailwind v4, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-multi-user-catalog-design.md` —
the Step 3 row of the Sub-projects table and the "`plan_next` and `seasonal`"
section.

## Global Constraints

Every task's requirements implicitly include this section.

- **Never commit or push automatically.** `CLAUDE.md` is explicit: finish the
  task, run the checks, show a one-line commit message, and commit only after
  approval. Every task's final step is "prepare and ask", not "commit".
- **Stage only the exact files named in the task.** Other Claude Code sessions
  may be editing this branch. Never `git add -A`, never `git commit -a`, and
  **never stage a directory pathspec** — `git add docs/` sweeps another
  session's work. Name every path. Stage and commit in one step, no gap.
- **Write the failing test first.** Every behaviour change starts with a red
  test.
- **Four checks stay green** before any commit is offered:
  `venv/Scripts/python.exe -m pytest -q`, `venv/Scripts/ruff.exe check .`, and
  in `frontend/`: `npm run test:run`, `npm run lint`.
- **Migrations must never import `app.models`.** `docs/PROGRESS.md` records this
  as an open, unfixed defect class: a data migration that queries live ORM
  models SELECTs every column the model currently declares, so it breaks the
  moment a later migration adds one. Every backfill in this plan is **raw SQL
  via `op.execute` / `conn.execute(sa.text(...))`**, with column lists spelled
  out. No exceptions.
- **One Alembic head.** This plan adds exactly three revisions, in this order:
  `m3a1plannext` (Task 2) → `m3a2plandrop` (Task 6) → `m3b1seasonal` (Task 7).
  The second and third chain from the first and second by those literal ids.
  **The one value you must fill in is the `down_revision` of `m3a1plannext`:**
  run `venv/Scripts/python.exe -m alembic heads` before starting Task 2 and use
  the single id it prints — the last revision Step 2 landed. Re-run
  `alembic heads` before every commit and confirm exactly one head.
- **`alembic upgrade head` from an empty database is already broken** at
  `86982d71c2f1` (`docs/PROGRESS.md`, open item). Test migrations against a
  database restored from a Backup, not a fresh one, and do not treat that
  pre-existing failure as caused by this plan.
- **Give this session its own test database.** Concurrent sessions poison a
  shared `anime_site_test`. Export `POSTGRES_DB=anime_site_test_step3` before
  running pytest and record it in `docs/PROGRESS.md`.
- **The session fixture is `db_session`, not `db`.** House convention for a
  short alias is a three-line module-local fixture, as in
  `tests/api/test_rewatch_entry_flags.py:15-17`:

```python
@pytest.fixture
def db(db_session):
    return db_session
```

- **Media-type keys are hyphenated in the data layer** (`anime-movie`,
  `tv-show`) and underscored only in router filenames. Every `media_type` value
  in this plan is hyphenated, matching `MEDIA_TABLES`.
- **Tailwind v4 semantic colour tokens only** in any frontend file
  (`bg-surface`, `text-text-muted`, …). Hard-coded greys fail the build through
  `frontend/src/theme-tokens.test.js`. Task 10 is the only frontend task and it
  touches routing rather than styling, so it should add no colour class at all
  - but **run `cd frontend && npm run build` after it**, because `:8000` serves
  the prebuilt bundle and the route guard would otherwise exist on `:5173`
  only.
- **Update the matching doc in the same change** and bump its `Last verified`
  line. This plan touches `docs/systems/plan-next.md`, `docs/data-model.md`,
  `docs/api.md`, `docs/business-rules.md`, `docs/frontend/pages.md` and
  `docs/authorization.md`.
- **Claim the task in `docs/PROGRESS.md`** (`wip <who>`) before starting; set it
  to `done <sha>` in the same commit as the work.
- **Back up before the first migration.** `/system` → Backup. Task 6 drops
  columns and Task 7 rewrites a primary key; the sheet is the only copy.

## Interface contract from earlier steps

Used verbatim. Do not rename, and do not re-derive.

```python
# Step 0 - app/models/media.py
class Media(Base):
    __tablename__ = "media"
    system_id: UUID          # PK, EQUAL to the detail row's existing system_id
    media_type: str          # hyphenated MEDIA_TABLES key
    public_id: int
    display_name: str
    cover_image_file: str | None
    franchise_id: UUID | None
    series_id: UUID | None
    created_at: datetime
    updated_at: datetime
    # UNIQUE (system_id, media_type) named uq_media_id_type
```

Because Step 0 reused each detail row's existing UUID, `media.system_id`
**equals** the `plan_next.target_id` value an entry-scope row already holds.
Every backfill below is a join on equal ids, never a remap.

```python
# Step 1 - app/models/user_media_list.py
class UserMediaList(Base):
    __tablename__ = "user_media_list"
    system_id, user_id, media_id, status, my_rating, completed_at,
    my_watch_day, ep_fin, vol_fin, vol_fin_page, ch_fin, arc_fin,
    ch_fin_in_arc, progress_display, issue_fin, created_at, updated_at
```

```python
# Step 2 - app/models/system.py
class User(Base):
    list_is_public: bool      # new in Step 2
# and a `user` role beside `guest` and `admin`.
```

## What this plan produces

Names later tasks and Steps 4 and 5 depend on.

```python
# app/models/plan_next.py
class PlanNext(Base):
    __tablename__ = "plan_next"
    system_id: UUID
    user_id: UUID            # FK users.id ON DELETE CASCADE, NOT NULL
    kind: str                # "next" | "rewatch"
    media_type: str          # hyphenated key; the Plan page's tab, NOT the owner kind
    media_id: UUID | None      # FK media.system_id      ON DELETE CASCADE
    franchise_id: UUID | None  # FK franchise.system_id  ON DELETE CASCADE
    series_id: UUID | None     # FK series.system_id     ON DELETE CASCADE
    remark: str | None
    created_at, updated_at

    @property
    def scope(self) -> str: ...       # "entry" | "series" | "franchise", derived
    @property
    def target_id(self) -> UUID: ...  # whichever FK is non-null, derived
```

Constraint and index names, used verbatim by the tests:

- `ck_plan_next_one_owner` — `CHECK (num_nonnulls(media_id, franchise_id, series_id) = 1)`
- `fk_plan_next_user` — `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- `fk_plan_next_media_type` — composite `(media_id, media_type)` → `media(system_id, media_type)` `ON DELETE CASCADE`
- `fk_plan_next_franchise` / `fk_plan_next_series` — single-column, `ON DELETE CASCADE`
- `uq_plan_next_target` — `UNIQUE NULLS NOT DISTINCT (user_id, kind, media_type, media_id, franchise_id, series_id)`
- `ix_plan_next_user_kind_type` — `(user_id, kind, media_type)`
- `pk_seasonal` — `PRIMARY KEY (user_id, seasonal)`
- `fk_seasonal_user` — `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

```python
# app/services/rbac/resolver.py
def viewer_user_id(viewer) -> UUID | None:
    """The viewer's own id, or None when nobody is logged in. No fallback."""

# app/dependencies.py
def get_current_user_id(request, db) -> UUID:
    """The authenticated caller's id, or 401. The guard on every per-user route."""
```

```python
# app/utils/plan_next_kinds.py
OWNER_COLUMN: dict[str, str]              # scope -> plan_next column name
def owner_kwargs(scope: str, target_id: UUID) -> dict: ...
def scope_for_columns(media_id, franchise_id, series_id) -> str: ...
```

## The policy this step implements

`plan_next` reads and `seasonal` reads are public today, and the Plan page, the
Seasonal pages and the Statistics page are all reachable logged out. Per-user
rows force the question "whose rows does a stranger see?", and the owner has
answered it:

**Plan, Seasonal and Statistics become authenticated-only. A logged-out visitor
cannot view them at all.** Not an empty page — a visible refusal: the API
answers `401` and the SPA redirects to `/login?next=…`. There is no
site-owner fallback and no notion of "the public collection's plan queue"; a
per-user table is only ever read by the user it belongs to.

That has three consequences the tasks below carry out:

- **Route-level authentication.** Every `/api/plan-next` and `/api/seasonal`
  route gains `Depends(get_current_user_id)`, which 401s an anonymous caller.
  The full list is in "Routes that gain the authentication dependency" below.
- **`viewer_user_id(viewer)` has no fallback.** It returns the viewer's own id
  or `None`. It survives only for the handful of paths that must stay public
  and simply show *nothing* per-user: the entry `watch_next` / `read_next`
  flags on catalogue list and detail endpoints, which every visitor may still
  read, and the `seasonal` bucket of `/api/search`, which stays public because
  the rest of search is the shared catalogue. In those places a `None` id means
  "no flags, empty bucket" — never "somebody else's flags".
- **Frontend routing.** `/plan`, `/seasonal`, `/seasonal/:seasonal_id` and
  `/statistics` move behind `ProtectedRoute` (Task 10).

Writes: plan writes stay `Depends(get_current_admin)`; a seasonal rating write
requires an authenticated user (`get_current_user_id`) rather than an admin,
because it is now that user's own rating.

There is no `site_owner_id` helper anywhere in this plan. Backfills still assign
existing rows to the `admin` account, and Pull still stamps restored rows with
it, but that is a *data-ownership* question inside a migration and a restore —
not a visibility rule, and not reachable from a request.

### Routes that gain the authentication dependency

| Route | Was | Becomes |
|---|---|---|
| `GET /api/plan-next/kinds` | public | `Depends(get_current_user_id)` |
| `GET /api/plan-next/` | public | `Depends(get_current_user_id)` |
| `POST /api/plan-next/` | admin | admin, **plus** `get_current_user_id` for the id to stamp |
| `DELETE /api/plan-next/target` | admin | admin, **plus** `get_current_user_id` |
| `DELETE /api/plan-next/{system_id}` | admin | admin, **plus** `get_current_user_id` |
| `GET /api/seasonal/current-season` | public | `Depends(get_current_user_id)` |
| `GET /api/seasonal/` | public | `Depends(get_current_user_id)` |
| `GET /api/seasonal/{seasonal_id}` | public | `Depends(get_current_user_id)` |
| `PATCH /api/seasonal/{seasonal_id}` | admin | `Depends(get_current_user_id)` (any account, own row) |

`GET /api/plan-next/kinds` returns vocabulary, not user data, and
`GET /api/seasonal/current-season` returns one `system_configs` value. Both are
guarded anyway: every remaining caller of either sits on a page that is now
authenticated (`Statistics.jsx`, `SeasonalOverall.jsx`,
`PlanToWatchFuture.jsx`), nothing in the frontend calls `/kinds` at all, and
"everything under these two prefixes needs a login" is a rule a reader can hold
in their head. The admin mirror of the season value,
`/api/system/config/current_season`, is untouched.

**There is no statistics router.** `frontend/src/pages/statistics/useStatisticsData.js`
builds the page from `/api/seasonal/` and `/api/seasonal/current-season` plus
shared catalogue endpoints; guarding those two seasonal routes plus the
`/statistics` frontend route is the whole of it. No catalogue endpoint is
gated by this step.

---

# Phase A — who is asking

### Task 1: `Viewer.user_id`, `viewer_user_id` and `get_current_user_id`

**Files:**
- Modify: `app/services/rbac/resolver.py`
- Modify: `app/dependencies.py`
- Create: `tests/api/test_viewer_identity.py`

**Interfaces:**
- Consumes: `models.User`, `resolve_viewer`.
- Produces: `Viewer.user_id`, `viewer_user_id(viewer)`, `get_current_user_id` —
  used by Tasks 3, 4, 5, 9 and 10.

`viewer_user_id` lives in `resolver.py` beside `Viewer` rather than in a module
of its own: it takes no `Session`, holds no policy, and is one attribute read
with a `None`-viewer guard. The guard exists because `_factory.py`'s
`_finish(db, entry, viewer=None)` really can be called with no viewer.

**Note:** Step 1 or Step 2 may already have added `Viewer.user_id`. If it is
there, keep the tests below and skip only the resolver edit.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_viewer_identity.py
"""
Who the request belongs to.

plan_next and seasonal rows are per user from Step 3 on. Every per-user route
demands a real account (get_current_user_id, 401 otherwise); the few public
routes that still mention per-user facts - the entry plan flags and the
seasonal search bucket - read viewer_user_id and show nothing when it is None.
There is no fallback to anybody else's rows. Requires PostgreSQL. See
tests/api/conftest.py.
"""

import uuid

import pytest
from fastapi import HTTPException

from app import models
from app.security import get_password_hash
from app.services.rbac.resolver import GUEST_FALLBACK, resolve_viewer, viewer_user_id
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


def _user(db, username, role="admin"):
    u = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, role),
    )
    db.add(u)
    db.flush()
    return u


def test_the_guest_fallback_has_no_user_id():
    assert GUEST_FALLBACK.user_id is None


def test_viewer_user_id_is_none_for_an_anonymous_viewer():
    assert viewer_user_id(GUEST_FALLBACK) is None


def test_viewer_user_id_is_none_for_no_viewer_at_all():
    # _factory._finish(db, entry, viewer=None) really does happen.
    assert viewer_user_id(None) is None


def test_a_cookieless_request_resolves_to_no_user(db):
    _user(db, "admin")

    class _Req:
        cookies = {}

    assert resolve_viewer(_Req(), db).user_id is None


def test_viewer_user_id_is_the_viewers_own_id(db):
    _user(db, "admin")
    kana = _user(db, "kana")

    class _Req:
        cookies = {}

    anonymous = resolve_viewer(_Req(), db)
    logged_in = type(anonymous)(
        username="kana",
        role_id=anonymous.role_id,
        role_name=anonymous.role_name,
        is_superuser=False,
        permissions=frozenset(),
        user_id=kana.id,
    )
    # Never the admin account, never the first user: only kana.
    assert viewer_user_id(logged_in) == kana.id


def test_get_current_user_id_rejects_an_anonymous_caller(db):
    from app.dependencies import get_current_user_id

    class _Req:
        cookies = {}

    with pytest.raises(HTTPException) as excinfo:
        get_current_user_id(_Req(), db)
    assert excinfo.value.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_viewer_identity.py -v`
Expected: FAIL — `ImportError: cannot import name 'viewer_user_id' from 'app.services.rbac.resolver'`

- [ ] **Step 3: Add `user_id` to `Viewer`**

In `app/services/rbac/resolver.py`, add the field to the dataclass, after
`permissions`:

```python
    permissions: frozenset[str]
    # The row's own id, not just its name. plan_next and seasonal rows are
    # keyed by it, so a read path that only knew the username would have to
    # re-query users on every request.
    user_id: Optional[UUID] = None
```

and set it in `resolve_viewer`'s return:

```python
        return Viewer(
            username=user.username if user else None,
            role_id=role.system_id,
            role_name=role.name,
            is_superuser=bool(role.is_superuser),
            permissions=cache.permissions_for(db, role.system_id),
            user_id=user.id if user else None,
            token_payload=payload,
        )
```

`GUEST_FALLBACK` needs no edit: `user_id` defaults to `None`.

- [ ] **Step 4: Add `viewer_user_id`**

At the bottom of `app/services/rbac/resolver.py`, beside `get_viewer`:

```python
def viewer_user_id(viewer) -> Optional[UUID]:
    """
    The viewer's OWN user id, or None when nobody is logged in.

    There is deliberately no fallback to another account. plan_next and
    seasonal are per-user from Step 3 on, and every route that returns them
    demands a real account through get_current_user_id. This helper exists for
    the two paths that stay public and must simply show nothing per-user: the
    entry watch_next / read_next flags on the catalogue endpoints, and the
    seasonal bucket of /api/search. None there means "no flags, empty bucket",
    never "somebody else's".

    Takes no Session and holds no policy - it is one attribute read plus the
    None-viewer guard that _factory._finish(db, entry, viewer=None) needs.
    """
    return getattr(viewer, "user_id", None) if viewer is not None else None
```

- [ ] **Step 5: Add `get_current_user_id`**

In `app/dependencies.py`, beside `get_current_admin`:

```python
def get_current_user_id(
    request: Request, db: Session = Depends(get_db)
) -> UUID:
    """
    The authenticated caller's user id, or 401.

    The guard on every per-user route, read as well as write: plan_next and
    seasonal hold one account's private queues and ratings, so an anonymous
    caller gets a refusal rather than an empty page. Distinct from
    get_current_admin, which asks for a permission - this asks only for an
    account, because a seasonal rating is the caller's OWN. 401 rather than
    403, matching the one error shape the SPA knows.
    """
    viewer = resolve_viewer(request, db)
    if viewer.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or insufficient permissions",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return viewer.user_id
```

Add `from uuid import UUID` to the imports if it is not already there.

- [ ] **Step 6: Run the test green**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_viewer_identity.py -v`
Expected: all PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: no new failures. Nothing reads the new field yet.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/rbac/resolver.py app/dependencies.py \
        tests/api/test_viewer_identity.py docs/PROGRESS.md
```
Proposed message: `feat(auth): carry user_id on Viewer and add the authenticated-user dependency`
**Ask before running `git commit`.**

---

# Phase B — `plan_next`

### Task 2: Expand `plan_next` — the four new columns, backfilled

**Files:**
- Create: `alembic/versions/m3a1plannext_plan_next_per_user_fks.py`
- Create: `tests/api/test_plan_next_schema.py`

**Interfaces:**
- Consumes: `media` (Step 0), `users` (existing).
- Produces: `plan_next.user_id`, `.media_id`, `.franchise_id`, `.series_id`
  populated, constrained and indexed; `scope` and `target_id` still present but
  nullable.

No model change and no code change in this task.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_plan_next_schema.py
"""
The shape of plan_next after Step 3's expand migration.

Reads the live database catalog rather than the ORM: the point of this task is
what the DATABASE enforces, and the model still describes the old columns.
Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest
from sqlalchemy import text


@pytest.fixture
def db(db_session):
    return db_session


def _columns(db) -> set:
    rows = db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'plan_next'"
        )
    ).all()
    return {r[0] for r in rows}


def _constraints(db) -> set:
    rows = db.execute(
        text(
            "SELECT conname FROM pg_constraint "
            "WHERE conrelid = 'plan_next'::regclass"
        )
    ).all()
    return {r[0] for r in rows}


def test_the_four_new_columns_exist(db):
    assert {"user_id", "media_id", "franchise_id", "series_id"} <= _columns(db)


def test_user_id_is_not_nullable(db):
    nullable = db.execute(
        text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = 'plan_next' AND column_name = 'user_id'"
        )
    ).scalar_one()
    assert nullable == "NO"


def test_the_old_pair_is_now_nullable(db):
    rows = db.execute(
        text(
            "SELECT column_name, is_nullable FROM information_schema.columns "
            "WHERE table_name = 'plan_next' "
            "AND column_name IN ('scope', 'target_id')"
        )
    ).all()
    assert {r[0]: r[1] for r in rows} == {"scope": "YES", "target_id": "YES"}


def test_every_constraint_is_present_by_name(db):
    names = _constraints(db)
    assert "ck_plan_next_one_owner" in names
    assert "fk_plan_next_user" in names
    assert "fk_plan_next_media_type" in names
    assert "fk_plan_next_franchise" in names
    assert "fk_plan_next_series" in names
    assert "uq_plan_next_target" in names


def test_the_owner_check_rejects_two_owners(db, sample_franchise, sample_series):
    owner = db.execute(text("SELECT id FROM users LIMIT 1")).scalar()
    with pytest.raises(Exception):
        db.execute(
            text(
                "INSERT INTO plan_next "
                "(system_id, user_id, kind, media_type, franchise_id, series_id) "
                "VALUES (gen_random_uuid(), :u, 'next', 'anime', :f, :s)"
            ),
            {
                "u": owner,
                "f": str(sample_franchise.system_id),
                "s": str(sample_series.system_id),
            },
        )
        db.flush()


def test_the_owner_check_rejects_no_owner(db):
    owner = db.execute(text("SELECT id FROM users LIMIT 1")).scalar()
    with pytest.raises(Exception):
        db.execute(
            text(
                "INSERT INTO plan_next (system_id, user_id, kind, media_type) "
                "VALUES (gen_random_uuid(), :u, 'next', 'anime')"
            ),
            {"u": owner},
        )
        db.flush()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_plan_next_schema.py -v`
Expected: FAIL — the four columns are absent, so
`test_the_four_new_columns_exist` fails first.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m3a1plannext_plan_next_per_user_fks.py
"""plan_next: per-user, with disjoint owner foreign keys

Expand only. The four new columns are added and backfilled from the existing
(scope, target_id) pair; scope and target_id are made NULLABLE so the code may
stop writing them, and are dropped in m3a2plandrop once nothing does.

Entry-scope rows backfill straight into media_id because Step 0 gave every
media row the detail row's OWN system_id - target_id and media.system_id are
the same value, so this is a join, not a remap.

DANGLING ROWS ARE DELETED. plan_next deliberately kept a row whose target no
longer exists, surfacing it in the admin page as missing=True; a real foreign
key cannot. The count is logged so the deletion is not silent.

No app.models import: a data migration that queries live ORM models SELECTs
every column the model currently declares and breaks the moment a later
migration adds one (docs/PROGRESS.md, open item).

Revision ID: m3a1plannext
Revises: the single id printed by `alembic heads` before this task ran - the
         last revision Step 2 landed. It is the ONE value in this plan that is
         not written out literally.
Create Date: 2026-09-08 00:00:00.000000

"""
import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3a1plannext"
down_revision: Union[str, Sequence[str], None] = "PUT THE STEP 2 HEAD ID HERE"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def _owner_id(conn) -> object:
    """The user every existing plan row belongs to: `admin`, else the first."""
    owner = conn.execute(
        sa.text("SELECT id FROM users WHERE username = 'admin'")
    ).scalar()
    if owner is None:
        owner = conn.execute(
            sa.text("SELECT id FROM users ORDER BY username LIMIT 1")
        ).scalar()
    return owner


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column(
        "plan_next",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "plan_next",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "plan_next",
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "plan_next",
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # --- Dangling rows first: a FK cannot hold what is not there. ---
    for label, sql in (
        (
            "entry",
            "DELETE FROM plan_next WHERE scope = 'entry' AND target_id NOT IN "
            "(SELECT system_id FROM media)",
        ),
        (
            "franchise",
            "DELETE FROM plan_next WHERE scope = 'franchise' AND target_id NOT IN "
            "(SELECT system_id FROM franchise)",
        ),
        (
            "series",
            "DELETE FROM plan_next WHERE scope = 'series' AND target_id NOT IN "
            "(SELECT system_id FROM series)",
        ),
        (
            "unknown scope",
            "DELETE FROM plan_next WHERE scope NOT IN "
            "('entry', 'franchise', 'series') OR scope IS NULL "
            "OR target_id IS NULL",
        ),
    ):
        removed = conn.execute(sa.text(sql)).rowcount
        if removed:
            logger.warning(
                "plan_next: dropped %d dangling %s row(s).", removed, label
            )

    # --- Backfill the owner columns from the FK-less pair. ---
    op.execute("UPDATE plan_next SET media_id = target_id WHERE scope = 'entry'")
    op.execute(
        "UPDATE plan_next SET franchise_id = target_id WHERE scope = 'franchise'"
    )
    op.execute("UPDATE plan_next SET series_id = target_id WHERE scope = 'series'")

    # --- Backfill the owner. ---
    row_count = conn.execute(sa.text("SELECT COUNT(*) FROM plan_next")).scalar()
    owner = _owner_id(conn)
    if owner is None and row_count:
        raise RuntimeError(
            "plan_next holds rows but the users table is empty; cannot decide "
            "whose plans these are."
        )
    if owner is not None:
        conn.execute(
            sa.text("UPDATE plan_next SET user_id = :owner WHERE user_id IS NULL"),
            {"owner": owner},
        )

    op.alter_column("plan_next", "user_id", nullable=False)

    # --- The old pair loosens; m3a2plandrop removes it. ---
    op.alter_column("plan_next", "scope", nullable=True)
    op.alter_column("plan_next", "target_id", nullable=True)

    # --- Constraints. ---
    op.execute(
        "ALTER TABLE plan_next ADD CONSTRAINT ck_plan_next_one_owner "
        "CHECK (num_nonnulls(media_id, franchise_id, series_id) = 1)"
    )
    op.create_foreign_key(
        "fk_plan_next_user", "plan_next", "users", ["user_id"], ["id"],
        ondelete="CASCADE",
    )
    # Composite, against Step 0's uq_media_id_type: an entry plan filed under
    # media_type 'anime' can only point at a media row that IS an anime. A NULL
    # media_id makes the whole constraint inapplicable (MATCH SIMPLE), which is
    # what the franchise- and series-scope rows need.
    op.create_foreign_key(
        "fk_plan_next_media_type",
        "plan_next",
        "media",
        ["media_id", "media_type"],
        ["system_id", "media_type"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_plan_next_franchise", "plan_next", "franchise",
        ["franchise_id"], ["system_id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_plan_next_series", "plan_next", "series",
        ["series_id"], ["system_id"], ondelete="CASCADE",
    )

    # --- Keys and indexes. ---
    op.drop_constraint("uq_plan_next_target", "plan_next", type_="unique")
    op.drop_index("ix_plan_next_kind_type_scope", table_name="plan_next")
    # NULLS NOT DISTINCT: two of the three owner columns are NULL on every row,
    # and PostgreSQL's default would treat those NULLs as distinct, so the same
    # franchise could be queued twice. Raw SQL because sa.UniqueConstraint
    # cannot express it through op.create_unique_constraint - the same reason
    # and the same shape as n1u2l3l4s5n6d.
    op.execute(
        "ALTER TABLE plan_next ADD CONSTRAINT uq_plan_next_target "
        "UNIQUE NULLS NOT DISTINCT "
        "(user_id, kind, media_type, media_id, franchise_id, series_id)"
    )
    op.create_index(
        "ix_plan_next_user_kind_type",
        "plan_next",
        ["user_id", "kind", "media_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_plan_next_user_kind_type", table_name="plan_next")
    op.execute("ALTER TABLE plan_next DROP CONSTRAINT uq_plan_next_target")
    op.create_index(
        "ix_plan_next_kind_type_scope",
        "plan_next",
        ["kind", "media_type", "scope"],
    )
    op.create_unique_constraint(
        "uq_plan_next_target",
        "plan_next",
        ["kind", "scope", "target_id", "media_type"],
    )
    op.drop_constraint("fk_plan_next_series", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_plan_next_franchise", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_plan_next_media_type", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_plan_next_user", "plan_next", type_="foreignkey")
    op.execute("ALTER TABLE plan_next DROP CONSTRAINT ck_plan_next_one_owner")
    op.alter_column("plan_next", "scope", nullable=False)
    op.alter_column("plan_next", "target_id", nullable=False)
    op.drop_column("plan_next", "series_id")
    op.drop_column("plan_next", "franchise_id")
    op.drop_column("plan_next", "media_id")
    op.drop_column("plan_next", "user_id")
```

- [ ] **Step 4: Apply it and run the test green**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_schema.py -v
```
Expected: one head printed; every test PASSes.

- [ ] **Step 5: Exercise the downgrade**

Run:
```bash
venv/Scripts/python.exe -m alembic downgrade -1
venv/Scripts/python.exe -m alembic upgrade head
```
Expected: both directions succeed, and
`SELECT COUNT(*) FROM plan_next WHERE user_id IS NULL` returns 0 afterwards.

- [ ] **Step 6: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: the model still writes `scope` and `target_id` and ignores the new
columns, so every ORM insert now violates `ck_plan_next_one_owner` and
`tests/api/test_plan_next*.py` plus `test_visibility_aggregates.py` fail.
**That is expected and is exactly what Task 3 fixes**; do not work around it in
the migration. If a green suite is wanted at every commit, land Tasks 2 and 3
as one commit.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add alembic/versions/m3a1plannext_plan_next_per_user_fks.py \
        tests/api/test_plan_next_schema.py docs/PROGRESS.md
```
Proposed message: `feat(plan-next): add user_id and disjoint owner FKs, backfilled`
**Ask before running `git commit`,** and say plainly that the plan tests are red
until Task 3 lands.

---

### Task 3: The model, the vocabulary and the services

**Files:**
- Modify: `app/models/plan_next.py`
- Modify: `app/utils/plan_next_kinds.py`
- Modify: `app/services/domain/plan_next.py`
- Modify: `app/routers/plan_next.py`
- Modify: `tests/api/test_plan_next_model.py`
- Create: `tests/api/test_plan_next_per_user.py`

**Interfaces:**
- Consumes: Task 1's `get_current_user_id`; Task 2's columns.
- Produces: `PlanNext.scope` / `.target_id` as read-only properties;
  `OWNER_COLUMN` / `owner_kwargs` / `scope_for_columns`; every plan-flag service
  function taking a `user_id`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_plan_next_per_user.py
"""
plan_next is per user and points at its target with a real foreign key.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.security import get_password_hash
from app.services.domain.plan_next import entry_flag, planned_entry_ids, set_entry_flag
from app.utils.plan_next_kinds import OWNER_COLUMN, owner_kwargs, scope_for_columns
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(db_session, admin_client):
    return db_session.query(models.User).filter_by(username="testadmin").one()


@pytest.fixture
def other_user(db_session):
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "admin"),
    )
    db_session.add(u)
    db_session.flush()
    return u


def test_owner_column_maps_every_scope():
    assert OWNER_COLUMN == {
        "entry": "media_id",
        "series": "series_id",
        "franchise": "franchise_id",
    }


def test_owner_kwargs_names_one_column():
    target = uuid.uuid4()
    assert owner_kwargs("franchise", target) == {"franchise_id": target}


def test_owner_kwargs_rejects_an_unknown_scope():
    with pytest.raises(ValueError, match="Unknown plan scope"):
        owner_kwargs("collection", uuid.uuid4())


def test_scope_for_columns_reads_the_non_null_one():
    target = uuid.uuid4()
    assert scope_for_columns(target, None, None) == "entry"
    assert scope_for_columns(None, target, None) == "franchise"
    assert scope_for_columns(None, None, target) == "series"


def test_the_derived_scope_and_target_read_back(db, owner, sample_franchise):
    row = models.PlanNext(
        system_id=uuid.uuid4(),
        user_id=owner.id,
        kind="next",
        media_type="anime",
        franchise_id=sample_franchise.system_id,
    )
    db.add(row)
    db.flush()
    assert row.scope == "franchise"
    assert row.target_id == sample_franchise.system_id


def test_two_users_may_queue_the_same_franchise(
    db, owner, other_user, sample_franchise
):
    for user in (owner, other_user):
        db.add(
            models.PlanNext(
                system_id=uuid.uuid4(),
                user_id=user.id,
                kind="next",
                media_type="anime",
                franchise_id=sample_franchise.system_id,
            )
        )
    db.flush()
    assert db.query(models.PlanNext).count() == 2


def test_one_user_may_not_queue_it_twice(db, owner, sample_franchise):
    for _ in range(2):
        db.add(
            models.PlanNext(
                system_id=uuid.uuid4(),
                user_id=owner.id,
                kind="next",
                media_type="anime",
                franchise_id=sample_franchise.system_id,
            )
        )
    with pytest.raises(IntegrityError):
        db.flush()


def test_entry_flags_are_per_user(db, owner, other_user, sample_anime):
    set_entry_flag(db, "anime", sample_anime.system_id, True, user_id=owner.id)
    db.flush()
    assert entry_flag(db, "anime", sample_anime.system_id, user_id=owner.id) is True
    assert (
        entry_flag(db, "anime", sample_anime.system_id, user_id=other_user.id) is False
    )
    assert planned_entry_ids(db, "anime", user_id=owner.id) == {sample_anime.system_id}
    assert planned_entry_ids(db, "anime", user_id=other_user.id) == set()


def test_the_list_endpoint_returns_the_viewers_rows(
    admin_client, db, owner, other_user, sample_franchise
):
    db.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            user_id=other_user.id,
            kind="next",
            media_type="anime",
            franchise_id=sample_franchise.system_id,
        )
    )
    db.flush()
    # testadmin queued nothing; kana's row is not theirs to see.
    assert admin_client.get("/api/plan-next/").json() == []


def test_an_anonymous_visitor_is_refused(client, db, other_user, sample_franchise):
    db.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            user_id=other_user.id,
            kind="next",
            media_type="anime",
            franchise_id=sample_franchise.system_id,
        )
    )
    db.flush()
    # A visible refusal, not an empty page: a plan queue belongs to one account.
    assert client.get("/api/plan-next/").status_code == 401
    assert client.get("/api/plan-next/kinds").status_code == 401


def test_the_create_endpoint_stamps_the_caller(
    admin_client, db, owner, sample_franchise
):
    response = admin_client.post(
        "/api/plan-next/",
        json={
            "media_type": "anime",
            "scope": "franchise",
            "target_id": str(sample_franchise.system_id),
            "remark": None,
        },
    )
    assert response.status_code == 201
    assert response.json()["scope"] == "franchise"
    assert response.json()["target_id"] == str(sample_franchise.system_id)
    row = db.query(models.PlanNext).one()
    assert row.user_id == owner.id
    assert row.franchise_id == sample_franchise.system_id
    assert row.media_id is None and row.series_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_plan_next_per_user.py -v`
Expected: FAIL — `ImportError: cannot import name 'OWNER_COLUMN' from 'app.utils.plan_next_kinds'`.

- [ ] **Step 3: Add the vocabulary**

Append to `app/utils/plan_next_kinds.py`, after `PLAN_FLAG_FIELDS` and before
the existing assertions:

```python
# Which plan_next column holds the owner, per scope. The three columns are
# mutually exclusive - ck_plan_next_one_owner enforces exactly one non-null -
# and this map is the only place the correspondence is written down.
#
# There is no "collection" entry because SCOPES has no collection value: a plan
# is filed against an entry, a series or a franchise and nothing else. note and
# meme DO resolve through the full OWNER_TABLES and will need a fourth column
# in Step 5; plan_next does not.
OWNER_COLUMN: dict[str, str] = {
    "entry": "media_id",
    "series": "series_id",
    "franchise": "franchise_id",
}


def owner_kwargs(scope: str, target_id) -> dict:
    """{the owner column for this scope: target_id}, for a PlanNext(...) call."""
    column = OWNER_COLUMN.get(scope)
    if column is None:
        raise ValueError(f"Unknown plan scope: {scope}")
    return {column: target_id}


def scope_for_columns(media_id, franchise_id, series_id) -> str:
    """The scope a row's non-null owner column implies. '' when none is set."""
    if media_id is not None:
        return "entry"
    if franchise_id is not None:
        return "franchise"
    if series_id is not None:
        return "series"
    return ""


# The map and the vocabulary must agree, or a scope the API accepts would have
# nowhere to be stored.
assert set(OWNER_COLUMN) == set(SCOPES)
```

- [ ] **Step 4: Rewrite the model**

Replace `app/models/plan_next.py` in full:

```python
"""Plan Next ORM model - what is queued to watch or read, at any of three tiers."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.utils.plan_next_kinds import scope_for_columns


class PlanNext(Base):
    """
    One thing one USER has queued to watch/read next, or marked for rewatch:
    an entry, a series, or a franchise. The table holds both Plan-page queues,
    distinguished by kind; the name predates the second one.

    The row's existence is the flag. There is no is_next column - un-planning
    deletes the row - so the table only ever holds what is actually queued.

    THE OWNER IS THREE MUTUALLY EXCLUSIVE FOREIGN KEYS, exactly one of which is
    set (ck_plan_next_one_owner). It used to be a FK-less (scope, target_id)
    pair resolved through OWNER_TABLES, which meant nothing cascaded: the
    franchise and series delete paths, and every entry delete, each had to call
    delete_plans_for by hand or leave the row behind forever. Every owner now
    cascades in the database, and delete_plans_for is gone.

    `scope` and `target_id` survive as READ-ONLY properties derived from
    whichever column is set. They are the API's wire format, the key
    drop_hidden_rows reads, and what the Plan page's JSON carries; deriving
    them keeps that contract while storing the fact once.

    media_type is stored on every row, INCLUDING the franchise- and
    series-scope ones, and is NOT the owner kind. It is the tab discriminator
    on the Plan page: one franchise can be queued once under 'anime' and again
    under 'tv-show'. For an entry-scope row fk_plan_next_media_type pins it
    against media(system_id, media_type), so an entry filed under 'anime'
    cannot point at a manga; for the two tier scopes media_id is NULL and the
    composite FK is inapplicable, which is the intended MATCH SIMPLE
    behaviour.
    """

    __tablename__ = "plan_next"
    __table_args__ = (
        # Exactly one owner. num_nonnulls is a PostgreSQL builtin.
        CheckConstraint(
            "num_nonnulls(media_id, franchise_id, series_id) = 1",
            name="ck_plan_next_one_owner",
        ),
        # Pins an entry plan's media_type against the media row's own type,
        # using Step 0's uq_media_id_type.
        ForeignKeyConstraint(
            ["media_id", "media_type"],
            ["media.system_id", "media.media_type"],
            ondelete="CASCADE",
            name="fk_plan_next_media_type",
        ),
        # One row per marked thing per media type per kind PER USER. A
        # franchise can be both queued and marked for rewatch, so kind joins
        # the key. NULLS NOT DISTINCT because two of the three owner columns
        # are NULL on every row and the default would make every row unique.
        UniqueConstraint(
            "user_id",
            "kind",
            "media_type",
            "media_id",
            "franchise_id",
            "series_id",
            name="uq_plan_next_target",
            postgresql_nulls_not_distinct=True,
        ),
        # The Plan page reads one tab of one section of one user at a time.
        Index("ix_plan_next_user_kind_type", "user_id", "kind", "media_type"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_plan_next_user"),
        nullable=False,
        index=True,
    )

    # "next" or "rewatch" - one of KINDS in app/utils/plan_next_kinds.py.
    #
    # server_default is load-bearing, not decoration. A Pull of a Plan Next tab
    # backed up before this column existed carries no `kind` header, and pull.py
    # drops parsed keys the header did not have - so the ORM builds the row with
    # `kind` unset. SQLAlchemy emits an unset non-nullable column as an explicit
    # NULL unless the MODEL declares a default, which fails the NOT NULL check.
    kind = Column(String, nullable=False, server_default="next")
    # Hyphenated key from MEDIA_TABLES, e.g. "anime-movie". Not a DB enum: the
    # vocabulary is validated in the API layer, the same choice already made for
    # media_relation.relation_type, so adding a type needs no migration.
    media_type = Column(String, nullable=False)

    # --- The disjoint owner set. Exactly one is non-null. ---
    # media_id declares no column-level ForeignKey: its FK is the composite
    # fk_plan_next_media_type above, and declaring both would put two
    # constraints on one column.
    media_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "franchise.system_id",
            ondelete="CASCADE",
            name="fk_plan_next_franchise",
        ),
        nullable=True,
        index=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "series.system_id", ondelete="CASCADE", name="fk_plan_next_series"
        ),
        nullable=True,
        index=True,
    )

    # Free text scoping the plan, e.g. "after the movie".
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def scope(self) -> str:
        """The owner kind, derived. Read-only: set the owner column instead."""
        return scope_for_columns(self.media_id, self.franchise_id, self.series_id)

    @property
    def target_id(self):
        """The owner's id, derived. Read-only: set the owner column instead."""
        if self.media_id is not None:
            return self.media_id
        if self.franchise_id is not None:
            return self.franchise_id
        return self.series_id
```

- [ ] **Step 5: Rewrite the service functions**

In `app/services/domain/plan_next.py`, change the four plan-flag helpers to take
a `user_id` and filter on the owner columns. `derive_size_groups`, `_map_for`,
`_measure`, `target_exists`, `validate_plan_target` and `pop_plan_flag` are
unchanged — they never touch a plan row's owner columns.

```python
from app.utils.plan_next_kinds import (
    PLAN_FLAG_FIELDS,
    SIZE_MEASURE,
    owner_kwargs,
    scope_allowed,
)


def entry_flag(
    db: Session, media_type: str, entry_id: UUID, kind: str = "next", *, user_id
) -> bool:
    """Whether one entry is queued BY THIS USER. Backs watch_next / read_next."""
    if user_id is None:
        return False
    return (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_type == media_type,
            models.PlanNext.media_id == entry_id,
            models.PlanNext.kind == kind,
        )
        .first()
        is not None
    )


def planned_entry_ids(
    db: Session, media_type: str, kind: str = "next", *, user_id
) -> set:
    """Every entry id of one media type this user has queued, for list endpoints."""
    if user_id is None:
        return set()
    rows = (
        db.query(models.PlanNext.media_id)
        .filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_type == media_type,
            models.PlanNext.media_id.isnot(None),
            models.PlanNext.kind == kind,
        )
        .all()
    )
    return {row[0] for row in rows}


def set_entry_flag(
    db: Session,
    media_type: str,
    entry_id: UUID,
    planned: bool,
    kind: str = "next",
    *,
    user_id,
) -> None:
    """
    Upsert or delete THIS USER's entry-scope row behind watch_next / read_next.

    The flag stays on the entry schemas so the Add and Modify forms, the detail
    pages and the library filters keep working unchanged; plan_next is the only
    place the fact is stored.
    """
    if user_id is None:
        return
    existing = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_type == media_type,
            models.PlanNext.media_id == entry_id,
            models.PlanNext.kind == kind,
        )
        .first()
    )
    if planned and existing is None:
        db.add(
            models.PlanNext(
                user_id=user_id,
                media_type=media_type,
                kind=kind,
                **owner_kwargs("entry", entry_id),
            )
        )
    elif not planned and existing is not None:
        db.delete(existing)


def attach_plan_flag(db: Session, media_type: str, entry, *, user_id) -> None:
    """
    Set every virtual flag on an ORM instance before it is serialized.

    The response schema reads from attributes, and the column is gone, so the
    value has to be put back on the object. A plain instance attribute is enough
    - SQLAlchemy does not manage it.
    """
    for field, kind in PLAN_FLAG_FIELDS.get(media_type, ()):
        setattr(
            entry,
            field,
            entry_flag(db, media_type, entry.system_id, kind, user_id=user_id),
        )
```

**Delete `delete_plans_for` entirely.** Keep the `UUID` import — `target_exists`
still uses it. Its callers are removed in Task 4.

- [ ] **Step 6: Rewrite the router**

In `app/routers/plan_next.py`:

```python
from app.dependencies import get_current_admin, get_current_user_id, get_db
from app.utils.plan_next_kinds import (
    KINDS,
    OWNER_COLUMN,
    SCOPES,
    SIZE_GROUPS,
    allowed_scopes_for,
    kind_valid,
    owner_kwargs,
)
```

`_resolve` needs no edit — it reads `row.scope`, which is now a property.

**Every route in this file becomes authenticated.** `list_kinds` gains
`_user_id: UUID = Depends(get_current_user_id)` — it returns vocabulary, but it
belongs to a feature that now needs a login and nothing in the frontend calls
it. `list_plan_next` gains `user_id: UUID = Depends(get_current_user_id)` and
keeps its `viewer` for `drop_hidden_rows`. The three write routes keep
`_admin=Depends(get_current_admin)` and add
`user_id: UUID = Depends(get_current_user_id)` for the id they stamp and filter
on.

`list_plan_next`:

```python
    query = db.query(models.PlanNext).filter(models.PlanNext.user_id == user_id)
    if media_type:
        query = query.filter(models.PlanNext.media_type == media_type)
    if scope:
        column = OWNER_COLUMN.get(scope)
        if column is None:
            raise HTTPException(status_code=400, detail=f"Unknown scope: {scope}")
        query = query.filter(getattr(models.PlanNext, column).isnot(None))
    if kind:
        query = query.filter(models.PlanNext.kind == kind)
```

The two `query.all()` calls below and the
`drop_hidden_rows(db, viewer, rows, "media_type", "target_id")` line stay
exactly as they are: `target_id` is a property and `drop_hidden_rows` reads it
with `getattr`.

`create_plan_next`, after the two vocabulary checks and `validate_plan_target`:

```python
    column = OWNER_COLUMN[payload.scope]
    existing = (
        db.query(models.PlanNext)
        .filter(
            models.PlanNext.user_id == user_id,
            getattr(models.PlanNext, column) == payload.target_id,
            models.PlanNext.media_type == payload.media_type,
            models.PlanNext.kind == payload.kind,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already planned.")

    row = models.PlanNext(
        user_id=user_id,
        kind=payload.kind,
        media_type=payload.media_type,
        remark=payload.remark,
        **owner_kwargs(payload.scope, payload.target_id),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _resolve(db, row)
```

`delete_plan_next_by_target`'s filter becomes the same four clauses as
`existing` above, rejecting an unknown scope with the same 400 as
`list_plan_next`. `delete_plan_next` (by `system_id`) adds
`models.PlanNext.user_id == user_id` to its filter, so one user cannot delete
another's row by id.

Keep `viewer: Viewer = Depends(get_viewer)` on `list_plan_next` — the
`drop_hidden_rows` call still needs it — and drop it from the three write
routes, which never used it.

- [ ] **Step 7: Update the existing model test**

In `tests/api/test_plan_next_model.py`, add
`from app.utils.plan_next_kinds import owner_kwargs`, and make `_row` take the
session so it can find the user:

```python
def _row(db, scope, target_id, media_type="anime", kind="next"):
    owner = db.query(models.User).filter_by(username="testadmin").one()
    return models.PlanNext(
        system_id=uuid.uuid4(),
        user_id=owner.id,
        kind=kind,
        media_type=media_type,
        **owner_kwargs(scope, target_id),
    )
```

Every test that builds a row passes `db_session` first and takes the
`admin_client` fixture so `testadmin` exists. Two tests change meaning and are
rewritten rather than repaired:

```python
def test_the_same_uuid_may_not_be_planned_at_two_scopes(
    db_session, admin_client, sample_franchise
):
    # It used to be permitted: the constraint keyed on scope, and the two
    # system_id spaces were separate. A real foreign key ends the question -
    # a franchise's uuid is not in series, so the second row cannot exist.
    db_session.add(_row(db_session, "franchise", sample_franchise.system_id))
    db_session.add(_row(db_session, "series", sample_franchise.system_id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_an_entry_plan_may_not_claim_the_wrong_media_type(
    db_session, admin_client, sample_anime
):
    # fk_plan_next_media_type resolves (media_id, media_type) against
    # media(system_id, media_type): an anime's id filed under 'manga' has no
    # parent row.
    db_session.add(_row(db_session, "entry", sample_anime.system_id, "manga"))
    with pytest.raises(IntegrityError):
        db_session.flush()
```

`test_the_old_columns_are_gone` and the two size-group tests are unchanged.

- [ ] **Step 8: Run both test files green**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_per_user.py \
    tests/api/test_plan_next_model.py -v
```
Expected: all PASS.

- [ ] **Step 9: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: failures remain only in `tests/api/test_plan_next.py`,
`test_plan_next_entry_flags.py`, `test_rewatch_entry_flags.py`,
`test_plan_next_cleanup.py`, `test_plan_next_kind_api.py`,
`test_visibility_aggregates.py`, `test_search.py` and
`test_plan_next_sheets.py` — the callers Tasks 4 and 5 fix. Write the list down
and confirm it does not grow.

- [ ] **Step 10: Prepare the commit and ask**

```bash
git add app/models/plan_next.py app/utils/plan_next_kinds.py \
        app/services/domain/plan_next.py app/routers/plan_next.py \
        tests/api/test_plan_next_model.py \
        tests/api/test_plan_next_per_user.py docs/PROGRESS.md
```
Proposed message: `refactor(plan-next): store the owner as a foreign key, scoped to a user`
**Ask before running `git commit`.**

---

### Task 4: Every caller, and the death of `delete_plans_for`

**Files:**
- Modify: `app/routers/_factory.py`
- Modify: `app/services/domain/search.py`
- Modify: `app/routers/franchise.py`
- Modify: `app/routers/series.py`
- Modify: `tests/api/test_plan_next_cleanup.py`
- Modify: `tests/api/test_plan_next_entry_flags.py`
- Modify: `tests/api/test_rewatch_entry_flags.py`
- Modify: `tests/api/test_visibility_aggregates.py`

**Interfaces:**
- Consumes: Task 3's service signatures; Task 1's `viewer_user_id`.
- Produces: no `delete_plans_for` anywhere; every plan read and write scoped to
  a user.

- [ ] **Step 1: Write the failing test**

Replace `tests/api/test_plan_next_cleanup.py` in full — it currently tests the
hand-written cleanup, and the hand-written cleanup is what this task removes:

```python
"""
Deleting a planned thing removes its plan_next rows - IN THE DATABASE.

This file used to test delete_plans_for, the hand-written sweep that existed
only because the target was FK-less. Step 3 gave plan_next real foreign keys
with ON DELETE CASCADE, so the sweep is gone and what is worth testing is that
PostgreSQL does the work. Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.utils.plan_next_kinds import owner_kwargs


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(db_session, admin_client):
    return db_session.query(models.User).filter_by(username="testadmin").one()


def _plan(db, owner, scope, target_id, media_type="anime", kind="next"):
    db.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            user_id=owner.id,
            media_type=media_type,
            kind=kind,
            **owner_kwargs(scope, target_id),
        )
    )
    db.flush()


def test_deleting_a_franchise_cascades_every_media_type(db, owner, sample_franchise):
    _plan(db, owner, "franchise", sample_franchise.system_id, "anime", "next")
    _plan(db, owner, "franchise", sample_franchise.system_id, "anime", "rewatch")
    _plan(db, owner, "franchise", sample_franchise.system_id, "tv-show", "next")

    db.delete(sample_franchise)
    db.flush()
    db.expire_all()

    assert db.query(models.PlanNext).count() == 0


def test_the_cascade_is_scoped(db, owner, sample_franchise, sample_series):
    _plan(db, owner, "franchise", sample_franchise.system_id)
    _plan(db, owner, "series", sample_series.system_id)

    db.delete(sample_franchise)
    db.flush()
    db.expire_all()

    remaining = db.query(models.PlanNext).one()
    assert remaining.scope == "series"


def test_deleting_a_user_cascades_their_plans(db, owner, sample_franchise):
    _plan(db, owner, "franchise", sample_franchise.system_id)
    db.delete(owner)
    db.flush()
    db.expire_all()
    assert db.query(models.PlanNext).count() == 0


def test_deleting_a_franchise_through_the_api_clears_its_plan(
    admin_client, sample_franchise
):
    admin_client.post(
        "/api/plan-next/",
        json={
            "media_type": "anime",
            "scope": "franchise",
            "target_id": str(sample_franchise.system_id),
            "remark": None,
        },
    )
    res = admin_client.delete(f"/api/franchise/{sample_franchise.system_id}")
    assert res.status_code in (200, 204)
    assert admin_client.get("/api/plan-next/").json() == []


def test_deleting_an_entry_through_the_api_clears_its_plan(admin_client, sample_anime):
    admin_client.put(f"/api/anime/{sample_anime.system_id}", json={"watch_next": True})
    res = admin_client.delete(f"/api/anime/{sample_anime.system_id}")
    assert res.status_code in (200, 204)
    assert admin_client.get("/api/plan-next/").json() == []


def test_delete_plans_for_is_gone():
    import app.services.domain.plan_next as service

    assert not hasattr(service, "delete_plans_for")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_plan_next_cleanup.py -v`
Expected: FAIL — `test_delete_plans_for_is_gone` fails, and the entry-delete
test fails because `_factory.py` still calls the helper.

- [ ] **Step 3: Thread the user through `_factory.py`**

Remove `delete_plans_for` from the import block at line 22 and delete the
`delete_plans_for(db, "entry", entry.system_id)` call in the delete endpoint
(around line 293) — Step 0's `trg_<table>_delete_media` trigger removes the
`media` row, and `fk_plan_next_media_type`'s `ON DELETE CASCADE` removes the
plan rows.

Add:

```python
from app.services.rbac.resolver import Viewer, get_viewer, viewer_user_id
```

(the module already imports `Viewer` and `get_viewer`; add `viewer_user_id` to
that line.)

These endpoints stay **public** — they are the shared catalogue. What changes is
that a logged-out reader gets `watch_next` / `read_next` as `False` rather than
somebody else's flags, which is exactly what `viewer_user_id` returning `None`
already produces through Task 3's `entry_flag` and `planned_entry_ids` guards.

`_finish` passes an id down:

```python
    def _finish(db: Session, entry, viewer=None):
        attach_plan_flag(
            db, spec.owner_type, entry, user_id=viewer_user_id(viewer)
        )
```

The list endpoint (around line 149) resolves the id once, above the flag loop:

```python
            user_id = viewer_user_id(viewer)
            for field, kind in PLAN_FLAG_FIELDS.get(spec.owner_type, ()):
                planned = planned_entry_ids(
                    db, spec.owner_type, kind, user_id=user_id
                )
                for entry in entries:
                    setattr(entry, field, entry.system_id in planned)
```

Each of the three write endpoints (create, put, patch — the `set_entry_flag`
calls at roughly lines 193, 222 and 254) becomes:

```python
            set_entry_flag(
                db,
                spec.owner_type,
                entry.system_id,
                bool(planned),
                kind=kind,
                user_id=viewer_user_id(viewer),
            )
```

Every write route in `_factory.py` is already `Depends(get_current_admin)`, so
`viewer_user_id` cannot be `None` there in practice; `set_entry_flag`'s
`if user_id is None: return` guard is the belt to that braces.

- [ ] **Step 4: Thread the user through `search.py`**

In `app/services/domain/search.py`'s `_decorate` (the block at line 307):

```python
    user_id = viewer_user_id(viewer)
    for field, kind in PLAN_FLAG_FIELDS.get(spec.owner_type, ()):
        planned = planned_entry_ids(db, spec.owner_type, kind, user_id=user_id)
        for entry in entries:
            setattr(entry, field, entry.system_id in planned)
```

with `viewer_user_id` added to the existing
`from app.services.rbac.resolver import ...` line (or a new import from that
module if the file does not already import from it). `/api/search` stays
public: a logged-out searcher gets the catalogue with every plan flag `False`.

- [ ] **Step 5: Drop the two tier-delete sweeps**

In `app/routers/franchise.py`, remove the import at line 20 and the
`delete_plans_for(db, "franchise", db_franchise.system_id)` call at line 210.
In `app/routers/series.py`, remove the import at line 20 and the
`delete_plans_for(db, "series", db_series.system_id)` call at line 198.
`fk_plan_next_franchise` and `fk_plan_next_series` now do it.

- [ ] **Step 6: Repair the three affected test files**

`tests/api/test_plan_next_entry_flags.py` and
`tests/api/test_rewatch_entry_flags.py` call `entry_flag` / `set_entry_flag`
directly. Add to each:

```python
@pytest.fixture
def owner(db_session, admin_client):
    return db_session.query(models.User).filter_by(username="testadmin").one()
```

and pass `user_id=owner.id` at every call. Tests that drive the flags through
HTTP need no change — the API resolves the user itself.

`tests/api/test_visibility_aggregates.py`'s `hidden_plan` fixture builds a
`PlanNext(...)` directly: replace `scope="entry"` and
`target_id=hidden_anime.system_id` with `media_id=hidden_anime.system_id`, and
add `user_id=` the `testadmin` id. The two assertions on
`str(hidden_plan.target_id)` still work — `target_id` is a property.

- [ ] **Step 7: Run the changed tests green**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_cleanup.py \
    tests/api/test_plan_next_entry_flags.py \
    tests/api/test_rewatch_entry_flags.py tests/api/test_plan_next.py \
    tests/api/test_plan_next_kind_api.py \
    tests/api/test_visibility_aggregates.py tests/api/test_search.py -v
```
Expected: all PASS.

- [ ] **Step 8: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: only `tests/api/test_plan_next_sheets.py` still fails — Task 5.

- [ ] **Step 9: Prepare the commit and ask**

```bash
git add app/routers/_factory.py app/services/domain/search.py \
        app/routers/franchise.py app/routers/series.py \
        tests/api/test_plan_next_cleanup.py \
        tests/api/test_plan_next_entry_flags.py \
        tests/api/test_rewatch_entry_flags.py \
        tests/api/test_visibility_aggregates.py docs/PROGRESS.md
```
Proposed message: `refactor(plan-next): scope plan flags to the viewer and let the database cascade`
**Ask before running `git commit`.**

---

### Task 5: Backup and Pull keep the Plan Next tab's shape

**Files:**
- Modify: `app/services/pipelines/tabs.py`
- Modify: `app/utils/formatter.py`
- Modify: `app/services/pipelines/pull.py`
- Modify: `tests/api/test_plan_next_sheets.py`

**Interfaces:**
- Consumes: Task 3's `OWNER_COLUMN`.
- Produces: a Plan Next sheet tab whose headers are unchanged, so a sheet
  written before Step 3 still restores and a sheet written after it still opens
  on the other machine.

Step 4 of the programme is what gives the sheets a `username` column. Until
then the tab must stay readable by a human during an environment switch, so the
sheet keeps `scope` and `target_id` and hides the four new columns.

- [ ] **Step 1: Write the failing test**

Add to `tests/api/test_plan_next_sheets.py`:

```python
class TestPlanNextOwnerColumns:
    """The sheet still speaks (scope, target_id); the table speaks foreign keys."""

    def test_an_entry_row_parses_into_media_id(self):
        target = uuid.uuid4()
        parsed = parse_plan_next_from_sheet(
            {"media_type": "anime", "scope": "entry", "target_id": str(target)}
        )
        assert parsed["media_id"] == target
        assert parsed["franchise_id"] is None
        assert parsed["series_id"] is None
        assert "scope" not in parsed
        assert "target_id" not in parsed

    def test_a_franchise_row_parses_into_franchise_id(self):
        target = uuid.uuid4()
        parsed = parse_plan_next_from_sheet(
            {"media_type": "anime", "scope": "franchise", "target_id": str(target)}
        )
        assert parsed["franchise_id"] == target
        assert parsed["media_id"] is None

    def test_a_series_row_parses_into_series_id(self):
        target = uuid.uuid4()
        parsed = parse_plan_next_from_sheet(
            {"media_type": "comic", "scope": "series", "target_id": str(target)}
        )
        assert parsed["series_id"] == target

    def test_an_unparseable_target_leaves_every_owner_none(self):
        parsed = parse_plan_next_from_sheet(
            {"media_type": "anime", "scope": "entry", "target_id": "not-a-uuid"}
        )
        assert parsed["media_id"] is None
        assert parsed["franchise_id"] is None
        assert parsed["series_id"] is None

    def test_an_unknown_scope_leaves_every_owner_none(self):
        parsed = parse_plan_next_from_sheet(
            {
                "media_type": "anime",
                "scope": "collection",
                "target_id": str(uuid.uuid4()),
            }
        )
        assert parsed["media_id"] is None
        assert parsed["franchise_id"] is None
        assert parsed["series_id"] is None


def test_the_plan_next_tab_hides_the_new_columns_and_shows_the_old_pair():
    from app.services.pipelines.tabs import TAB_BY_NAME

    tab = TAB_BY_NAME["Plan Next"]
    assert set(tab.drop_columns) == {
        "user_id",
        "media_id",
        "franchise_id",
        "series_id",
    }
    assert [name for name, _fn in tab.extra_columns] == ["scope", "target_id"]
```

The two pre-existing tests asserting `parsed["scope"] == "series"` and
`parsed["target_id"] == target` must be rewritten to the new keys — they assert
the storage shape, not the sheet shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_plan_next_sheets.py -v`
Expected: FAIL — `KeyError: 'media_id'`.

- [ ] **Step 3: Rewrite the parser**

In `app/utils/formatter.py`:

```python
def parse_plan_next_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Plan Next sheet into typed data ready for
    the Database.

    The SHEET still carries the (scope, target_id) pair a human can read; the
    TABLE carries three mutually exclusive foreign keys. The translation is
    here, so a sheet written before Step 3 restores unchanged. user_id is not
    in the sheet at all - pull.py stamps the restore owner, the `admin`
    account (Step 4 of the
    programme replaces that with a username column).
    """
    scope = parse_from_sheet(raw.get("scope"), str)
    # No foreign key in the sheet - the target is whichever table scope and
    # media_type name - so an unparseable cell becomes None and the row is
    # rejected by pull.py rather than failing the whole tab.
    target_id = _uuid_or_none(raw.get("target_id"))
    owners = {"media_id": None, "franchise_id": None, "series_id": None}
    column = OWNER_COLUMN.get(scope or "")
    if column and target_id is not None:
        owners[column] = target_id

    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        # Preserved as written, not coerced: a media type added in a newer
        # version must survive a round trip through an older one.
        "media_type": parse_from_sheet(raw.get("media_type"), str),
        **owners,
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
        # Defaults to "next": a Plan Next tab backed up before rewatch existed
        # has no such column, and every row in it was a queue entry.
        "kind": parse_from_sheet(raw.get("kind"), str) or "next",
    }
```

with `from app.utils.plan_next_kinds import OWNER_COLUMN` added to the imports —
`plan_next_kinds` imports only `media_resolver`, so there is no cycle.

- [ ] **Step 4: Reshape the tab**

In `app/services/pipelines/tabs.py`, add two derivers beside `_option_category`:

```python
def _plan_scope(row: Any, db: Session) -> Optional[str]:
    """The owner kind, for the sheet's human reader. See models/plan_next.py."""
    return row.scope or None


def _plan_target_id(row: Any, db: Session) -> Optional[object]:
    """The owner's id, whichever of the three columns holds it."""
    return row.target_id
```

and replace the tab entry, leaving its position in `SHEET_TABS` alone — it must
still come after every media tab, after Franchise and after Series, and the FKs
are real now, so a mis-ordered restore fails loudly instead of orphaning:

```python
    # The sheet keeps the (scope, target_id) pair a human reads during an
    # environment switch; the table stores three foreign keys. user_id is
    # dropped because the sheet has no user column until Step 4 - Pull stamps
    # the restore owner (_restore_owner_id in pull.py).
    SheetTab(
        "Plan Next",
        models.PlanNext,
        f.parse_plan_next_from_sheet,
        drop_columns=("user_id", "media_id", "franchise_id", "series_id"),
        extra_columns=(("scope", _plan_scope), ("target_id", _plan_target_id)),
    ),
```

Backup writes kept columns first and extras after, so `scope` and `target_id`
move to the end of the header row. Pull reads by header name, so the order does
not matter; mention it when handing over, because a human will notice.

- [ ] **Step 5: Stamp the owner in Pull**

Pull is a restore, not a request: it has no viewer, and the rows it is writing
were backed up before the sheet had a user column. They belong to the same
account the Step 3 migrations backfilled to. That is a data-ownership rule
inside the restore and **not** a visibility rule — nothing about it is reachable
from an HTTP read — so it lives as a private helper in `pull.py` rather than as
a shared "site owner" concept.

Add near the top of `app/services/pipelines/pull.py`:

```python
def _restore_owner_id(db: Session):
    """
    Which account a restored plan_next / seasonal row belongs to.

    The sheet has no user column until Step 4 of the multi-user rollout, and
    both tables' user_id is NOT NULL, so a restore has to name somebody. It
    names the same account the Step 3 migrations backfilled to: `admin`, or the
    alphabetically first user when no account carries that name.

    Restore-time only. No request path calls this, and it is deliberately not a
    "whose rows does a visitor see" rule - a visitor sees neither table at all.
    """
    owner = (
        db.query(models.User).filter(models.User.username == "admin").first()
    )
    if owner is None:
        owner = db.query(models.User).order_by(models.User.username).first()
    return owner.id if owner else None
```

and, immediately after the `Media Source` block and before the `pk_field`
selection:

```python
        # plan_next.user_id and seasonal.user_id are NOT NULL and the sheet
        # carries no user column yet. Stamped before the natural-key match
        # below, because user_id is part of both tables' keys.
        if tab_name in ("Plan Next", "Seasonal"):
            owner = _restore_owner_id(db)
            if owner is None:
                logger.warning(
                    "No user account exists; skipping the %s row.", tab_name
                )
                continue
            clean_header_dict["user_id"] = owner
```

Then update the natural key:

```python
    # user_id is part of the key: the same franchise may be queued by two
    # users, and the sheet's uuid belongs to whichever database last backed up.
    "Plan Next": (
        "kind",
        "media_type",
        "user_id",
        "media_id",
        "franchise_id",
        "series_id",
    ),  # uq_plan_next_target
```

`_match_by_natural_key` compares a NULL part of the key as `IS NULL`, which is
what `NULLS NOT DISTINCT` means — and the parser always emits all three owner
keys, so the match is never partial and never silently returns None.

- [ ] **Step 6: Run the sheets tests green**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_sheets.py \
    tests/api/test_pull_derived_identity.py -v
```
Expected: all PASS.

- [ ] **Step 7: Run the full backend suite and a real round trip**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: green. Then on the dev database run `/system` → **Backup**, confirm
the Plan Next tab still has `scope` and `target_id` headers and no `user_id`,
then **Pull** that one tab and confirm the row count is unchanged.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/pipelines/tabs.py app/utils/formatter.py \
        app/services/pipelines/pull.py tests/api/test_plan_next_sheets.py \
        docs/PROGRESS.md
```
Proposed message: `feat(sheets): translate the Plan Next tab between scope/target and the owner FKs`
**Ask before running `git commit`.**

---

### Task 6: Contract — drop `scope` and `target_id`

**Files:**
- Create: `alembic/versions/m3a2plandrop_drop_plan_next_scope_target.py`
- Modify: `tests/api/test_plan_next_schema.py`

**Interfaces:**
- Consumes: Tasks 3–5 (nothing writes the two columns any more).
- Produces: `plan_next` with no FK-less pair.

- [ ] **Step 1: Write the failing test**

Add to `tests/api/test_plan_next_schema.py`, replacing
`test_the_old_pair_is_now_nullable`:

```python
def test_the_fk_less_pair_is_gone(db):
    assert "scope" not in _columns(db)
    assert "target_id" not in _columns(db)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_plan_next_schema.py -v`
Expected: FAIL — both columns are still there.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m3a2plandrop_drop_plan_next_scope_target.py
"""plan_next: drop the FK-less (scope, target_id) pair

Contract half of m3a1plannext. Nothing has written these two columns since the
model was rewritten; scope and target_id are read-only properties derived from
whichever owner FK is set.

The downgrade recreates the columns and refills them from the FKs, so a rolled
back database is usable rather than merely well-shaped.

Revision ID: m3a2plandrop
Revises: m3a1plannext
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3a2plandrop"
down_revision: Union[str, Sequence[str], None] = "m3a1plannext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("plan_next", "scope")
    op.drop_column("plan_next", "target_id")


def downgrade() -> None:
    op.add_column("plan_next", sa.Column("scope", sa.String(), nullable=True))
    op.add_column(
        "plan_next",
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        "UPDATE plan_next SET scope = 'entry', target_id = media_id "
        "WHERE media_id IS NOT NULL"
    )
    op.execute(
        "UPDATE plan_next SET scope = 'franchise', target_id = franchise_id "
        "WHERE franchise_id IS NOT NULL"
    )
    op.execute(
        "UPDATE plan_next SET scope = 'series', target_id = series_id "
        "WHERE series_id IS NOT NULL"
    )
    op.alter_column("plan_next", "scope", nullable=False)
    op.alter_column("plan_next", "target_id", nullable=False)
```

- [ ] **Step 4: Apply, verify, and exercise the downgrade**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_schema.py -v
venv/Scripts/python.exe -m alembic downgrade -1
venv/Scripts/python.exe -m alembic upgrade head
```
Expected: one head; tests PASS; both directions succeed.

- [ ] **Step 5: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: green.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add alembic/versions/m3a2plandrop_drop_plan_next_scope_target.py \
        tests/api/test_plan_next_schema.py docs/PROGRESS.md
```
Proposed message: `refactor(plan-next): drop the FK-less scope/target_id pair`
**Ask before running `git commit`.**

---

# Phase C — `seasonal`

### Task 7: `seasonal`'s primary key becomes `(user_id, seasonal)`

**Files:**
- Modify: `app/models/system.py`
- Create: `alembic/versions/m3b1seasonal_seasonal_per_user.py`
- Create: `tests/api/test_seasonal_per_user.py`

**Interfaces:**
- Consumes: `users`.
- Produces: `Seasonal.user_id`, `pk_seasonal`, `fk_seasonal_user`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_seasonal_per_user.py
"""
seasonal rows belong to a user.

The counters and my_rating were only ever global because there was one user.
Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models
from app.security import get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(db_session, admin_client):
    return db_session.query(models.User).filter_by(username="testadmin").one()


@pytest.fixture
def other_user(db_session):
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "admin"),
    )
    db_session.add(u)
    db_session.flush()
    return u


def test_the_primary_key_is_the_pair(db):
    rows = db.execute(
        text(
            "SELECT a.attname FROM pg_index i "
            "JOIN pg_attribute a ON a.attrelid = i.indrelid "
            "AND a.attnum = ANY(i.indkey) "
            "WHERE i.indrelid = 'seasonal'::regclass AND i.indisprimary"
        )
    ).all()
    assert {r[0] for r in rows} == {"user_id", "seasonal"}


def test_two_users_may_hold_the_same_season(db, owner, other_user):
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026", my_rating="9"))
    db.add(models.Seasonal(user_id=other_user.id, seasonal="WIN 2026", my_rating="7"))
    db.flush()
    assert db.query(models.Seasonal).filter_by(seasonal="WIN 2026").count() == 2


def test_one_user_may_not_hold_it_twice(db, owner):
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026"))
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_deleting_a_user_cascades_their_seasons(db, owner):
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026"))
    db.flush()
    db.delete(owner)
    db.flush()
    db.expire_all()
    assert db.query(models.Seasonal).count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_seasonal_per_user.py -v`
Expected: FAIL — `TypeError: 'user_id' is an invalid keyword argument for Seasonal`.

- [ ] **Step 3: Rewrite the model**

In `app/models/system.py`, replace the `Seasonal` class:

```python
class Seasonal(Base):
    """
    One user's view of one airing season: their rating and their four counts.

    The counters are aggregates over THAT USER's list rows (see
    app/services/domain/seasonal.py) and my_rating is their own; both were
    global before Step 3 only because the database held one person. The
    primary key is therefore the pair, and a deleted user takes their seasons
    with them.
    """

    __tablename__ = "seasonal"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_seasonal_user"),
        primary_key=True,
    )
    # No longer unique on its own: two users hold "WIN 2026" independently.
    seasonal = Column(String, primary_key=True, index=True)
    my_rating = Column(String, nullable=True)
    entry_planned = Column(Integer, nullable=False, default=0)
    entry_completed = Column(Integer, nullable=False, default=0)
    entry_watching = Column(Integer, nullable=False, default=0)
    entry_dropped = Column(Integer, nullable=False, default=0)
```

- [ ] **Step 4: Write the migration**

```python
# alembic/versions/m3b1seasonal_seasonal_per_user.py
"""seasonal: one row per user per season

The four counters and my_rating are per-user facts that were global only
because the database held one person. Existing rows belong to the `admin`
account, the same backfill target m3a1plannext used.

No app.models import (docs/PROGRESS.md, open item): raw SQL throughout.

Revision ID: m3b1seasonal
Revises: m3a2plandrop
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3b1seasonal"
down_revision: Union[str, Sequence[str], None] = "m3a2plandrop"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _owner_id(conn) -> object:
    owner = conn.execute(
        sa.text("SELECT id FROM users WHERE username = 'admin'")
    ).scalar()
    if owner is None:
        owner = conn.execute(
            sa.text("SELECT id FROM users ORDER BY username LIMIT 1")
        ).scalar()
    return owner


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column(
        "seasonal",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    row_count = conn.execute(sa.text("SELECT COUNT(*) FROM seasonal")).scalar()
    owner = _owner_id(conn)
    if owner is None and row_count:
        raise RuntimeError(
            "seasonal holds rows but the users table is empty; cannot decide "
            "whose seasons these are."
        )
    if owner is not None:
        conn.execute(
            sa.text("UPDATE seasonal SET user_id = :owner WHERE user_id IS NULL"),
            {"owner": owner},
        )

    op.alter_column("seasonal", "user_id", nullable=False)

    # The old shape: PRIMARY KEY (seasonal), plus the redundant UNIQUE that
    # Column(..., primary_key=True, unique=True, index=True) produced.
    op.execute("ALTER TABLE seasonal DROP CONSTRAINT IF EXISTS seasonal_seasonal_key")
    op.execute("ALTER TABLE seasonal DROP CONSTRAINT seasonal_pkey")
    op.execute(
        "ALTER TABLE seasonal ADD CONSTRAINT pk_seasonal "
        "PRIMARY KEY (user_id, seasonal)"
    )
    op.create_foreign_key(
        "fk_seasonal_user", "seasonal", "users", ["user_id"], ["id"],
        ondelete="CASCADE",
    )
    # ix_seasonal_seasonal survives: the season string is still looked up on
    # its own by the search bucket and by Pull.


def downgrade() -> None:
    conn = op.get_bind()
    owner = _owner_id(conn)
    if owner is not None:
        # Only one user's rows can survive a single-column key.
        conn.execute(
            sa.text("DELETE FROM seasonal WHERE user_id <> :owner"),
            {"owner": owner},
        )
    op.drop_constraint("fk_seasonal_user", "seasonal", type_="foreignkey")
    op.execute("ALTER TABLE seasonal DROP CONSTRAINT pk_seasonal")
    op.execute(
        "ALTER TABLE seasonal ADD CONSTRAINT seasonal_pkey PRIMARY KEY (seasonal)"
    )
    op.execute(
        "ALTER TABLE seasonal ADD CONSTRAINT seasonal_seasonal_key UNIQUE (seasonal)"
    )
    op.drop_column("seasonal", "user_id")
```

- [ ] **Step 5: Apply, verify, and exercise the downgrade**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_seasonal_per_user.py -v
venv/Scripts/python.exe -m alembic downgrade -1
venv/Scripts/python.exe -m alembic upgrade head
```
Expected: one head; all tests PASS; both directions succeed.

- [ ] **Step 6: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: `tests/api/test_seasonal_release_date.py`,
`tests/api/test_pull_insert_defaults.py` and `tests/api/test_search.py` fail
wherever they construct a `Seasonal(...)` without a user. Add `user_id=` in
those constructions here; report any failure that is not a missing `user_id`.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/models/system.py \
        alembic/versions/m3b1seasonal_seasonal_per_user.py \
        tests/api/test_seasonal_per_user.py docs/PROGRESS.md
```
Proposed message: `feat(seasonal): key seasonal rows on (user_id, seasonal)`
**Ask before running `git commit`.**

---

### Task 8: The counters become per-user aggregates over `user_media_list`

**Files:**
- Modify: `app/services/domain/seasonal.py`
- Create: `tests/api/test_seasonal_counts_per_user.py`

**Interfaces:**
- Consumes: Step 0's `Media`, Step 1's `UserMediaList`, Task 7's model.
- Produces: `create_missing_seasonal(db)` writing one row per user per season;
  `sync_seasonal_counts(db)` counting each user's own list.

`sync_seasonal_counts` currently reads `Anime.watching_status`. Step 1 moved
that column to `user_media_list.status`, so this is not an improvement but a
repair: without it the function cannot run at all.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_seasonal_counts_per_user.py
"""
Seasonal counters count each user's own list.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.security import get_password_hash
from app.services.domain.seasonal import create_missing_seasonal, sync_seasonal_counts
from app.utils.constants import WatchStatus
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(db_session, admin_client):
    return db_session.query(models.User).filter_by(username="testadmin").one()


@pytest.fixture
def other_user(db_session):
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "admin"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def winter_anime(db_session, sample_anime):
    sample_anime.release_season = "WIN"
    sample_anime.release_date = "2026-01-10"
    sample_anime.airing_type = "TV"
    db_session.flush()
    return sample_anime


def _list_row(db, user, anime, status):
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=user.id,
            media_id=anime.system_id,
            status=status,
        )
    )
    db.flush()


def test_create_missing_seasonal_makes_one_row_per_user(
    db, owner, other_user, winter_anime
):
    create_missing_seasonal(db)
    rows = db.query(models.Seasonal).filter_by(seasonal="WIN 2026").all()
    assert {r.user_id for r in rows} == {owner.id, other_user.id}


def test_each_users_counts_are_their_own(db, owner, other_user, winter_anime):
    _list_row(db, owner, winter_anime, WatchStatus.COMPLETED)
    _list_row(db, other_user, winter_anime, WatchStatus.ACTIVE_WATCHING)
    create_missing_seasonal(db)
    sync_seasonal_counts(db)

    mine = (
        db.query(models.Seasonal)
        .filter_by(user_id=owner.id, seasonal="WIN 2026")
        .one()
    )
    theirs = (
        db.query(models.Seasonal)
        .filter_by(user_id=other_user.id, seasonal="WIN 2026")
        .one()
    )

    assert (mine.entry_completed, mine.entry_watching) == (1, 0)
    assert (theirs.entry_completed, theirs.entry_watching) == (0, 1)


def test_a_user_with_no_list_rows_counts_zero(db, owner, other_user, winter_anime):
    _list_row(db, owner, winter_anime, WatchStatus.COMPLETED)
    create_missing_seasonal(db)
    sync_seasonal_counts(db)
    theirs = (
        db.query(models.Seasonal)
        .filter_by(user_id=other_user.id, seasonal="WIN 2026")
        .one()
    )
    assert (
        theirs.entry_planned,
        theirs.entry_completed,
        theirs.entry_watching,
        theirs.entry_dropped,
    ) == (0, 0, 0, 0)


def test_a_second_run_overwrites_rather_than_accumulates(db, owner, winter_anime):
    _list_row(db, owner, winter_anime, WatchStatus.COMPLETED)
    create_missing_seasonal(db)
    sync_seasonal_counts(db)
    sync_seasonal_counts(db)
    mine = (
        db.query(models.Seasonal)
        .filter_by(user_id=owner.id, seasonal="WIN 2026")
        .one()
    )
    assert mine.entry_completed == 1
```

`WatchStatus.COMPLETED` must be a real member of
`app/utils/constants.WatchStatus` that appears in `COMPLETED_WATCH_STATUSES` —
read the constant and use the name it actually defines; do not invent one.

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_seasonal_counts_per_user.py -v`
Expected: FAIL — `create_missing_seasonal` inserts a `Seasonal` with no
`user_id` and the NOT NULL fails.

- [ ] **Step 3: Rewrite `create_missing_seasonal`**

```python
def create_missing_seasonal(db: Session) -> None:
    """
    Ensure every user has a row for every season the catalogue mentions.

    The seasons are a CATALOGUE fact - they come from anime.release_season and
    the year prefix of anime.release_date - but a seasonal row is a PER-USER
    fact, so it is the cross product that has to exist. A user with nothing in
    that season gets a row of zeroes, which is what the Seasonal page shows.
    """
    year_expr = func.substr(Anime.release_date, 1, 4)
    unique_combinations = (
        db.query(Anime.release_season, year_expr)
        .filter(Anime.release_season.isnot(None), Anime.release_date.isnot(None))
        .distinct()
        .all()
    )
    seasons = {f"{season} {year}" for season, year in unique_combinations}
    if not seasons:
        logger.info("No new seasonal entries needed to be created.")
        return

    user_ids = [row[0] for row in db.query(User.id).all()]
    existing = {
        (row[0], row[1])
        for row in db.query(Seasonal.user_id, Seasonal.seasonal).all()
    }

    new_seasonals_added = 0
    for user_id in user_ids:
        for seasonal_string in seasons:
            if (user_id, seasonal_string) in existing:
                continue
            db.add(Seasonal(user_id=user_id, seasonal=seasonal_string))
            new_seasonals_added += 1

    if new_seasonals_added > 0:
        db.commit()
        logger.info(f"Auto-created {new_seasonals_added} new seasonal entries.")
    else:
        logger.info("No new seasonal entries needed to be created.")
```

with `User` added to the `from app.models import (...)` block.

- [ ] **Step 4: Rewrite `sync_seasonal_counts`**

```python
def sync_seasonal_counts(db: Session) -> None:
    """
    Recompute entry_planned / entry_completed / entry_watching / entry_dropped
    for every seasonal row, from THAT ROW'S USER's list. Always overwrites.

    Only anime whose airing_type is TV, ONA, Movie or Special count.
    Planned  = Plan to Watch | Watch When Airs
    Watching = Active Watching | Passive Watching | Paused
    Dropped  = Temp Dropped | Dropped

    The status comes from user_media_list, not from anime: Step 1 moved the
    personal columns off the catalogue tables, and a per-user count cannot be
    read from a shared row.
    """
    seasonals = db.query(Seasonal).all()
    if not seasonals:
        return

    seasonal_map = {(s.user_id, s.seasonal): s for s in seasonals}

    for s in seasonals:
        s.entry_planned = 0
        s.entry_completed = 0
        s.entry_watching = 0
        s.entry_dropped = 0

    rows = (
        db.query(
            UserMediaList.user_id,
            UserMediaList.status,
            Anime.release_season,
            Anime.release_date,
        )
        .join(Media, Media.system_id == UserMediaList.media_id)
        .join(Anime, Anime.system_id == Media.system_id)
        .filter(
            Media.media_type == "anime",
            Anime.release_season.isnot(None),
            Anime.release_date.isnot(None),
            Anime.airing_type.in_(list(_SEASONAL_AIRING_TYPES)),
        )
        .all()
    )

    for user_id, status, release_season, release_date in rows:
        s = seasonal_map.get((user_id, f"{release_season} {str(release_date)[:4]}"))
        if not s:
            continue
        if status in COMPLETED_WATCH_STATUSES:
            s.entry_completed += 1
        elif status in _PLANNED_STATUSES:
            s.entry_planned += 1
        elif status in _WATCHING_STATUSES:
            s.entry_watching += 1
        elif status in _DROPPED_STATUSES:
            s.entry_dropped += 1

    db.commit()
```

with `Media` and `UserMediaList` added to the `from app.models import (...)`
block.

- [ ] **Step 5: Run the test green**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_seasonal_counts_per_user.py -v`
Expected: all PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: only the seasonal read paths of Task 9 still fail.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/domain/seasonal.py \
        tests/api/test_seasonal_counts_per_user.py docs/PROGRESS.md
```
Proposed message: `feat(seasonal): compute the counters per user from user_media_list`
**Ask before running `git commit`.**

---

### Task 9: Seasonal reads, writes and the Seasonal sheet tab

**Files:**
- Modify: `app/routers/seasonal.py`
- Modify: `app/services/domain/search.py`
- Modify: `app/services/pipelines/tabs.py`
- Modify: `app/services/pipelines/pull.py`
- Create: `tests/api/test_seasonal_api_per_user.py`
- Modify: `tests/api/test_search.py`

**Interfaces:**
- Consumes: Task 1's `get_current_user_id` and `viewer_user_id`; Task 7's model.
- Produces: `/api/seasonal` authenticated and scoped to the caller; the Seasonal
  sheet tab unchanged in shape.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_seasonal_api_per_user.py
"""
/api/seasonal answers for whoever is asking, and refuses a stranger.

Every route under the prefix is authenticated from Step 3 on: the counters and
the rating are one account's own, so a logged-out visitor gets 401 rather than
a page of somebody else's numbers. Requires PostgreSQL. See
tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.security import get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(db_session, admin_client):
    return db_session.query(models.User).filter_by(username="testadmin").one()


@pytest.fixture
def other_user(db_session):
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "admin"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def two_ratings(db_session, owner, other_user):
    db_session.add(
        models.Seasonal(user_id=owner.id, seasonal="WIN 2026", my_rating="9")
    )
    db_session.add(
        models.Seasonal(user_id=other_user.id, seasonal="WIN 2026", my_rating="4")
    )
    db_session.flush()


def test_the_list_returns_one_row_per_season_for_the_caller(admin_client, two_ratings):
    body = admin_client.get("/api/seasonal/").json()
    winters = [row for row in body if row["seasonal"] == "WIN 2026"]
    assert len(winters) == 1
    assert winters[0]["my_rating"] == "9"


def test_every_seasonal_read_refuses_an_anonymous_visitor(client, two_ratings):
    assert client.get("/api/seasonal/").status_code == 401
    assert client.get("/api/seasonal/WIN 2026").status_code == 401
    assert client.get("/api/seasonal/current-season").status_code == 401


def test_the_detail_endpoint_is_scoped(admin_client, two_ratings):
    assert admin_client.get("/api/seasonal/WIN 2026").json()["my_rating"] == "9"


def test_a_rating_write_touches_only_the_callers_row(
    admin_client, db, owner, other_user, two_ratings
):
    response = admin_client.patch("/api/seasonal/WIN 2026", json={"my_rating": "10"})
    assert response.status_code == 200
    db.expire_all()
    mine = (
        db.query(models.Seasonal)
        .filter_by(user_id=owner.id, seasonal="WIN 2026")
        .one()
    )
    theirs = (
        db.query(models.Seasonal)
        .filter_by(user_id=other_user.id, seasonal="WIN 2026")
        .one()
    )
    assert mine.my_rating == "10"
    assert theirs.my_rating == "4"


def test_an_anonymous_rating_write_is_rejected(client, two_ratings):
    response = client.patch("/api/seasonal/WIN 2026", json={"my_rating": "1"})
    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_seasonal_api_per_user.py -v`
Expected: FAIL — the list returns two `WIN 2026` rows and answers 200 to an
anonymous caller.

- [ ] **Step 3: Authenticate and scope the router**

In `app/routers/seasonal.py`:

```python
from uuid import UUID

from app.dependencies import get_current_user_id, get_db
```

**All four routes take `user_id: UUID = Depends(get_current_user_id)`**, so an
anonymous caller gets 401 from every one of them:

- `get_current_season_public` — rename it `get_current_season` and drop
  "(Public)" from its `summary`; it no longer is. Its body is unchanged (it
  reads one `system_configs` row), and it is guarded because its only remaining
  callers, `Statistics.jsx`, `SeasonalOverall.jsx` and `PlanToWatchFuture.jsx`,
  now all sit behind a login. The admin mirror
  `/api/system/config/current_season` is untouched.
- `list_seasonals`:

```python
    return (
        db.query(models.Seasonal)
        .filter(models.Seasonal.user_id == user_id)
        .order_by(models.Seasonal.seasonal.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
```

- `get_seasonal` — the same `user_id` clause beside its
  `seasonal == seasonal_id` filter.

- `update_seasonal` swaps `_: models.User = Depends(get_current_admin)` for
  the same `user_id: UUID = Depends(get_current_user_id)` — a rating is now the
  caller's own, so any real account may write theirs — and looks the row up by
  both columns:

```python
    record = (
        db.query(models.Seasonal)
        .filter(
            models.Seasonal.user_id == user_id,
            models.Seasonal.seasonal == seasonal_id,
        )
        .first()
    )
```

A missing row still 404s: `create_missing_seasonal` mints rows, not the PATCH.
Remove the `get_current_admin` import if nothing else in the file uses it.

- [ ] **Step 4: Scope the seasonal search bucket**

`/api/search` stays public — it is the shared catalogue — but `SEARCHABLE_TYPES`
has a `seasonal` entry, which would now return one row per user per season and,
worse, another account's ratings to a stranger. In
`app/services/domain/search.py`'s `search()`, immediately before
`raw[spec.key] = _run(db, viewer, spec, criteria, q_clean, limit)`:

```python
        # seasonal rows are per user. A logged-in searcher gets their own; a
        # stranger gets an empty bucket rather than somebody else's ratings -
        # the same rule the /api/seasonal routes enforce with a 401.
        if spec.key == "seasonal":
            searcher_id = viewer_user_id(viewer)
            if searcher_id is None:
                raw[spec.key] = []
                continue
            criteria = and_(criteria, models.Seasonal.user_id == searcher_id)
```

Add `and_` to the existing `from sqlalchemy import or_` import.
`viewer_user_id` is already imported by Task 4. Add a test to
`tests/api/test_search.py` asserting the `seasonal` bucket is `[]` for an
anonymous searcher and holds the caller's own row for `admin_client`.

- [ ] **Step 5: Keep the Seasonal sheet tab's shape**

In `app/services/pipelines/tabs.py`:

```python
    # user_id is dropped for the same reason the Plan Next tab drops it: the
    # sheet has no user column until Step 4, and Pull stamps the restore
    # owner (_restore_owner_id in pull.py).
    SheetTab(
        "Seasonal",
        models.Seasonal,
        f.parse_seasonal_from_sheet,
        drop_columns=("user_id",),
    ),
```

`parse_seasonal_from_sheet` needs no change — Task 5's Pull block already
stamps `user_id` for the `"Seasonal"` tab name. What does need changing is the
row lookup: `pk_field` is `"seasonal"`, so a single-column match would find
another user's row. In `pull.py`, immediately after

```python
        existing = None
        if pk_value:
            existing = (
                db.query(Model).filter(getattr(Model, pk_field) == pk_value).first()
            )
```

insert:

```python
        # seasonal's primary key is (user_id, seasonal); matching on the season
        # string alone would update whichever user's row happened to be first.
        if tab_name == "Seasonal" and pk_value:
            existing = (
                db.query(Model)
                .filter(
                    Model.user_id == clean_header_dict["user_id"],
                    Model.seasonal == pk_value,
                )
                .first()
            )
```

- [ ] **Step 6: Run the changed tests green**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_seasonal_api_per_user.py \
    tests/api/test_search.py tests/api/test_seasonal_release_date.py \
    tests/api/test_pull_insert_defaults.py -v
```
Expected: all PASS. Any `Seasonal(...)` construction in those files gains
`user_id=`.

- [ ] **Step 7: Run the full backend suite and a real round trip**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: green. Then on the dev database run `/system` → **Backup**, confirm
the Seasonal tab has no `user_id` header, **Pull** that tab, and confirm the row
count and the ratings are unchanged.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/routers/seasonal.py app/services/domain/search.py \
        app/services/pipelines/tabs.py app/services/pipelines/pull.py \
        tests/api/test_seasonal_api_per_user.py tests/api/test_search.py \
        docs/PROGRESS.md
```
Proposed message: `feat(seasonal): scope the API, the search bucket and Pull to a user`
**Ask before running `git commit`.**

---

### Task 10: Plan, Seasonal and Statistics leave the public site

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/layout/ProtectedRoute.jsx`
- Create: `frontend/src/components/layout/ProtectedRoute.test.jsx`

**Interfaces:**
- Consumes: Tasks 3 and 9 (the routes those pages call now answer 401).
- Produces: `/plan`, `/seasonal`, `/seasonal/:seasonal_id` and `/statistics`
  redirecting a logged-out visitor to `/login?next=…`.

`ProtectedRoute` gates on a *permission* and defaults to `"admin"`. These four
pages need a weaker gate — "any account at all" — which is what the server's
`get_current_user_id` asks for. Rather than invent a second guard component or
mint a permission the backend does not check, give the existing one an optional
`requireAuth` prop. `AuthContext` already exposes `username` (`null` when
anonymous), so the check is one line and mirrors the server exactly.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/layout/ProtectedRoute.test.jsx
// Frontend: test for the route guard.
//
// Plan, Seasonal and Statistics are per-user pages from Step 3 on and their
// APIs answer 401 to a stranger. The guard is what turns that into a login
// redirect instead of a screen full of errors.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ProtectedRoute from "./ProtectedRoute";

const mockAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuth(),
}));

function renderAt(path, auth) {
  mockAuth.mockReturnValue(auth);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute requireAuth />}>
          <Route path="/plan" element={<div>the plan page</div>} />
        </Route>
        <Route path="/login" element={<div>the login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute requireAuth", () => {
  it("sends a logged-out visitor to login", () => {
    renderAt("/plan", { username: null, has: () => false, loading: false });
    expect(screen.getByText("the login page")).toBeInTheDocument();
  });

  it("lets a logged-in non-admin through", () => {
    renderAt("/plan", { username: "kana", has: () => false, loading: false });
    expect(screen.getByText("the plan page")).toBeInTheDocument();
  });

  it("still gates on the permission when requireAuth is absent", () => {
    mockAuth.mockReturnValue({
      username: "kana",
      has: () => false,
      loading: false,
    });
    render(
      <MemoryRouter initialEntries={["/system"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/system" element={<div>the admin page</div>} />
          </Route>
          <Route path="/login" element={<div>the login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("the login page")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- ProtectedRoute`
Expected: FAIL — `requireAuth` is ignored, so the logged-in non-admin is
redirected too.

- [ ] **Step 3: Teach `ProtectedRoute` the weaker gate**

```jsx
export default function ProtectedRoute({ permission = "admin", requireAuth = false }) {
  const { has, username, loading } = useAuth();
  const location = useLocation();
  ...
  // requireAuth gates on "is anyone logged in" rather than on a permission,
  // mirroring the server's get_current_user_id. The per-user pages (Plan,
  // Seasonal, Statistics) need an account, not a role.
  const allowed = requireAuth ? Boolean(username) : has(permission);

  return allowed ? (
    <Outlet />
  ) : (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}
```

The loading branch is unchanged. No colour classes change, so the semantic
token rule is not in play — but do not add any.

- [ ] **Step 4: Move the four routes in `App.jsx`**

Cut these four lines out of the public block (they are at roughly lines
146–155):

```jsx
                <Route path="/seasonal" element={<SeasonalOverall />} />
                <Route
                  path="/seasonal/:seasonal_id"
                  element={<SeasonalDetail />}
                />
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/plan" element={<Plan />} />
```

and add them in a new guarded block, immediately above the existing
`<Route element={<ProtectedRoute />}>` admin block:

```jsx
                {/* Per-user pages: a plan queue and a season's counters belong
                    to one account, and their APIs 401 a stranger. */}
                <Route element={<ProtectedRoute requireAuth />}>
                  <Route path="/seasonal" element={<SeasonalOverall />} />
                  <Route
                    path="/seasonal/:seasonal_id"
                    element={<SeasonalDetail />}
                  />
                  <Route path="/statistics" element={<Statistics />} />
                  <Route path="/plan" element={<Plan />} />
                </Route>
```

Leave `/completions`, `/quote`, `/meme` and every library and detail route in
the public block — none of them reads a per-user table.

- [ ] **Step 5: Check the navigation**

Grep `frontend/src/config/navigation.js` for the four paths. If the nav renders
them unconditionally, a logged-out visitor now sees four links that bounce them
to login. Gate those entries on `username` the way the file already gates its
admin entries, and extend `frontend/src/config/navigation.test.js` with a case
asserting they are absent for an anonymous viewer. If the nav already derives
its entries from `has(...)`/`username`, note that and change nothing.

- [ ] **Step 6: Run the frontend checks and build**

Run:
```bash
cd frontend && npm run test:run
cd frontend && npm run lint
cd frontend && npm run build
```
Expected: green, green, and a fresh `frontend_dist/` — `:8000` serves the
prebuilt bundle, so without the build the guard exists on `:5173` only.

- [ ] **Step 7: See it in a browser**

With the app running, log out and visit `/plan`, `/seasonal`, `/statistics` and
a `/seasonal/WIN 2026` URL. Each must land on `/login?next=…`. Log in and
confirm all four render.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add frontend/src/App.jsx \
        frontend/src/components/layout/ProtectedRoute.jsx \
        frontend/src/components/layout/ProtectedRoute.test.jsx \
        docs/PROGRESS.md
```
(add `frontend/src/config/navigation.js` and
`frontend/src/config/navigation.test.js` if Step 5 changed them.)
Proposed message: `feat(routing): put Plan, Seasonal and Statistics behind a login`
**Ask before running `git commit`.**

---

### Task 11: Documentation and the four checks

**Files:**
- Modify: `docs/systems/plan-next.md`
- Modify: `docs/data-model.md`
- Modify: `docs/api.md`
- Modify: `docs/business-rules.md`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: Tasks 1–10.
- Produces: docs that describe the code as it now is.

Also modify `docs/frontend/pages.md` (the four pages are no longer public) and
`docs/authorization.md` (the new authenticated-but-not-admin gate).

- [ ] **Step 1: `docs/systems/plan-next.md`**

Rewrite the storage section so it says, in the doc's own voice:

- A plan row belongs to a user (`user_id`, `ON DELETE CASCADE`).
- The owner is one of three foreign keys — `media_id`, `franchise_id`,
  `series_id` — with `ck_plan_next_one_owner` enforcing exactly one, and there
  is **no** collection scope because `SCOPES` has none.
- `scope` and `target_id` are derived read-only properties, kept because they
  are the API's wire format; the sheet still carries them too.
- `media_type` is the Plan page's tab discriminator, stored on every row, and
  for entry rows it is pinned against `media.media_type` by
  `fk_plan_next_media_type`.
- `delete_plans_for` is gone; the database cascades.
- The Plan page is authenticated-only: every `/api/plan-next` route answers 401
  to a stranger, and `/plan` redirects to login. There is no site-owner
  fallback and no public view of anybody's queue.

Bump `Last verified`.

- [ ] **Step 2: `docs/data-model.md`**

Update the `plan_next` and `seasonal` table entries to the columns and
constraint names in this plan's "What this plan produces" section. Bump
`Last verified`.

- [ ] **Step 3: `docs/api.md`**

Reproduce the "Routes that gain the authentication dependency" table from this
plan: all four `/api/seasonal` routes and all five `/api/plan-next` routes now
require an account and answer 401 otherwise, `PATCH /api/seasonal/{id}` is
authenticated rather than admin-only and writes the caller's own rating, and
`/api/search`'s `seasonal` bucket is empty for an anonymous searcher. Request
and response bodies are unchanged. Bump `Last verified`.

- [ ] **Step 4: `docs/business-rules.md`, `docs/frontend/pages.md`, `docs/authorization.md`**

`business-rules.md`: the seasonal counters are per-user aggregates over
`user_media_list`, not over `anime.watching_status`.
`frontend/pages.md`: Plan, Seasonal, Seasonal detail and Statistics are no
longer public pages; they redirect a logged-out visitor to `/login?next=…`.
`authorization.md`: `ProtectedRoute`'s new `requireAuth` gate and its server
counterpart `get_current_user_id` — a gate on *having an account*, distinct
from the permission gates the rest of the doc describes. Bump each
`Last verified`.

- [ ] **Step 5: Run all four checks**

Run, in order:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run
cd frontend && npm run lint
```
Expected: four green results. Task 10 already ran `npm run build`; run it again
if anything under `frontend/` changed since.

- [ ] **Step 6: Confirm one Alembic head**

Run: `venv/Scripts/python.exe -m alembic heads`
Expected: exactly one, `m3b1seasonal`.

- [ ] **Step 7: Back up**

`/system` → **Backup**, so the sheet holds the post-Step-3 data before the next
environment switch.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add docs/systems/plan-next.md docs/data-model.md docs/api.md \
        docs/business-rules.md docs/frontend/pages.md \
        docs/authorization.md docs/PROGRESS.md
```
Proposed message: `docs(step3): record per-user plan_next and seasonal`
**Ask before running `git commit`.**

---

## Definition of done

- `plan_next` has `user_id` and exactly one of `media_id` / `franchise_id` /
  `series_id` on every row; `scope` and `target_id` are gone from the table and
  survive only as derived properties and as sheet headers.
- Deleting a franchise, a series, a media entry or a user removes the matching
  plan rows without a line of Python; `delete_plans_for` does not exist.
- `seasonal` is keyed `(user_id, seasonal)`, its counters come from
  `user_media_list`, and two users hold independent ratings for the same season.
- A logged-out visitor cannot reach Plan, Seasonal or Statistics: every
  `/api/plan-next` and `/api/seasonal` route answers 401, and the four frontend
  routes redirect to `/login?next=…`. No route falls back to another account's
  rows, and `site_owner_id` exists nowhere in the codebase.
- The public catalogue is unchanged for a stranger: library and detail pages
  still render, with `watch_next` / `read_next` simply `False`, and
  `/api/search` still answers — with an empty `seasonal` bucket.
- Backup and Pull round-trip both tabs with unchanged headers.
- Four checks green, `npm run build` run; one Alembic head.
