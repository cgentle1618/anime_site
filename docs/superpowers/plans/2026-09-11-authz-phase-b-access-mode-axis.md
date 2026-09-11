# Authorization Phase B — the access-mode axis, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move content labels and field groups off the role axis onto a new
per-session **access mode**, so that what an account may *do* and which objects
it may *reach* become two independent knobs.

**Architecture:** Five new tables describe modes, what each carries, who holds
one, and per-account subtractions. A resolved `Viewer` gains the active mode's
label-id set and field-group set; `hidden_label_ids` and `field_gate._withheld`
read those sets instead of asking `viewer.has(label.<key>)`, and instead of
short-circuiting on `is_superuser`. The `label_perm()` and `field_group_perm()`
helpers are then deleted, so any missed call site is an `ImportError` rather
than a silent `True`. Phase B is **reads and resolution only** — the admin UI
and the mode switcher are Phase D. Three decided riders land here because they
cannot be built before modes exist or because the file is already open:
decision 14 (the pipeline gate), decision 13 (`note.py` status codes) and
decision 12 (per-viewer `remark`).

**Tech Stack:** FastAPI, SQLAlchemy 2.x ORM, Alembic (single head,
`m5b2memefks`), PostgreSQL 17 in Docker, pytest. Python 3.13 via
`venv/Scripts/python.exe`.

**Spec:** `docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`
— sections 2, 3, 4, 6, "Decision 14 in detail", and decisions 5-9 and 12-14.
Read the spec alongside this plan; the plan argues from it and does not repeat
its reasoning.

## Global Constraints

- **Behaviour-neutral for the owner on the day it lands.** Every existing
  account is granted all four modes with `unrestricted` as the default, so no
  page changes. If a task makes something disappear for the `admin` account,
  the task is wrong.
- **Fail closed, always.** Every unresolvable step yields the **empty set**,
  never a fallback to a wider mode. `resolve_viewer` must continue never to
  raise.
- **404, never 403, for the object axis.** A hidden entry answers with the
  calling router's own existing not-found message. 401 is for capability
  failures. See decision 13.
- **The backend suite takes ~5.5 minutes and must be run in full before every
  commit.** A scoped `-k` run cannot see a test three directories away.
  **Never run two pytest processes at once** — both trees share one PostgreSQL
  and one `anime_site_test`.
- **Give this session its own test database.** Set `POSTGRES_DB` to
  `anime_site_test_phaseb` before running the suite, and record it in
  `docs/PROGRESS.md` under Environment. Concurrent sessions otherwise poison
  each other's runs with "relation role does not exist".
- **Concurrent sessions may be editing the same files.** Stage named files
  only — never a directory pathspec, never `git add -A`. Stage and commit in
  one step with no gap. Re-read the diff of every file you stage.
- **Ask before committing.** This repo's rule: show a one-line version of the
  commit and wait. The `git commit` lines in this plan are the *content* of
  that ask, not permission to run it unattended.
- Migrations must **not** import `app.models`. Seed through Core SQL with the
  column list written out literally — the reason is in spec section 5 and in
  the open item about `86982d71c2f1`.
- Commit-message attribution lines are in the session's system reminder.
  Every commit ends with them.
- After any frontend change run `cd frontend && npm run build`. **Phase B
  touches no frontend source**; if you find yourself editing `frontend/src`,
  stop — that is Phase D.

## Naming locked across tasks

Use these exact names. Later tasks depend on them.

```
app/models/access_mode.py
    AccessMode              .system_id .key .label .description .sort_order
                            .is_system .is_guest_default .created_at .updated_at
    AccessModeLabel         .system_id .mode_id .label_id
    AccessModeFieldGroup    .system_id .mode_id .field_group_key
    UserAccessMode          .system_id .user_id .mode_id .is_default
    UserAccessModeDenial    .system_id .user_access_mode_id .label_id
                            .field_group_key

app/services/rbac/cache.py
    mode_sets(db, mode_id) -> ModeSets
    denials_for(db, user_access_mode_id) -> ModeSets
    bump()                  # clears all three caches

app/services/rbac/modes.py
    ModeSets                # frozen dataclass
        .label_ids: frozenset[UUID]
        .field_groups: frozenset[str]
    ResolvedMode            # frozen dataclass
        .mode_id: Optional[UUID]
        .mode_key: Optional[str]
        .label_ids: frozenset[UUID]
        .field_groups: frozenset[str]
    EMPTY_MODE: ResolvedMode
    resolve_mode(db, user, token_mode_id) -> ResolvedMode
    default_mode_id(db, user) -> Optional[UUID]
    is_unscoped(db, viewer) -> bool
    require_unscoped_mode    # FastAPI dependency
    grant_all_modes_to_existing_accounts(db) -> None

app/services/rbac/seed_modes.py
    MODE_UNRESTRICTED = "unrestricted"
    MODE_BORDERLINE   = "borderline"
    MODE_NORMAL       = "normal"
    MODE_SAFE         = "safe"
    SEEDED_MODES      # tuple of dicts, the frozen snapshot
    ensure_access_mode_seed(db) -> None

Viewer gains, in this order, all defaulted:
    mode_id: Optional[UUID] = None
    mode_key: Optional[str] = None
    visible_label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()
```

`visible_label_ids` holds the labels the mode **carries**. `hidden_label_ids()`
derives its complement. Do not invert this — every consumer of
`hidden_label_ids` expects "labels to hide" and none of them changes.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `app/models/access_mode.py` | The five tables. Nothing else — models in this repo hold no policy. |
| `app/services/rbac/modes.py` | Mode *policy*: resolution order, the empty-set fallback, the unscoped test, the pipeline dependency. |
| `app/services/rbac/seed_modes.py` | The four seeded modes, as data plus an idempotent runtime seeder. Separate from `seed.py`, which is about roles and is already 190 lines. |
| `alembic/versions/n1a1accessmode.py` | Tables, seed, per-account grants, and the removal of the old grants — in that order. |
| `tests/api/test_access_modes.py` | Matrix rows 2, 4, 6, 7 (read scoping, denials, fail-closed, axis independence). |
| `tests/api/test_pipeline_mode_gate.py` | Matrix row 9 (decision 14). |
| `tests/api/test_note_status_codes.py` | Matrix row 10, status-code half (decision 13). |
| `tests/api/test_remark_per_viewer.py` | Matrix row 10, remark half (decision 12). |
| `tests/unit/test_mode_resolution.py` | `resolve_mode` and `is_unscoped` in isolation. |

**Modified**

| File | Change |
|---|---|
| `app/models/__init__.py` | Export the five classes; task 13 also rewrites the `remark` column_property block. |
| `app/services/rbac/cache.py` | Two more dicts, cleared by the same `bump()`. |
| `app/services/rbac/resolver.py` | `Viewer` gains four fields; `resolve_viewer` resolves the mode. |
| `app/services/rbac/enforcement.py` | `hidden_label_ids` reads the mode; the `is_superuser` short-circuits go. |
| `app/services/rbac/field_gate.py` | `_withheld` reads the mode; its `is_superuser` short-circuit goes. |
| `app/services/rbac/permissions.py` | `label_perm` / `field_group_perm` deleted; the two families leave `static_catalog()` and `catalog()`. |
| `app/services/rbac/seed.py` | Stops granting `field_group.*`; `GUEST_WITHHELD_FIELD_GROUPS` moves to `seed_modes.py`. |
| `app/routers/roles.py` | `/catalog` stops offering the two families. |
| `app/routers/content_labels.py` | `_to_response` stops publishing a `permission` string. |
| `app/routers/auth.py` | Login mints the `mode` claim; `/me` serves field groups from the mode and gains the mode surface. |
| `app/routers/note.py` | The `field_group_perm` call site moves to the mode; the five 403s become 401/404. |
| `app/routers/data_control.py`, `app/routers/system.py` | The decision-14 dependency. |
| `app/routers/_factory.py`, `collection.py`, `franchise.py`, `series.py` | `attach_remark` (task 13). |
| `app/main.py` | Lifespan calls `ensure_access_mode_seed`. |
| `tests/api/conftest.py` | `super_user`/`super_client`, `mode`, `grant_mode`, `labelled_entry`; `_clear_permission_cache` clears the new caches; `make_viewer` grows a `mode` argument. |
| `docs/authorization.md`, `docs/data-model.md`, `docs/api.md`, `docs/business-rules.md` | Behaviour changed, so the docs change with it. |

## Task order, and why

Tasks 1-5 build machinery nothing reads yet, so each is individually safe and
the suite stays green throughout. **Task 6 is the pivot**: it flips
`hidden_label_ids` and `field_gate` onto the mode axis and re-points every test
that granted `label.*` or `field_group.*` — those two must land together,
because the moment enforcement reads the mode, a test granting `label.nsfw` to
a role is asserting a model that no longer exists. Task 7 then deletes the dead
helpers, which is the safety move: a missed call site becomes an `ImportError`.
Task 8 restores `/api/auth/me`'s contract from the new source. Tasks 9, 10 and
11 are the three decided riders — decisions 14, 13 and 12 — and task 12 is the
documentation, including the three finishing edits this repo's rules require in
the same commit.

---

### Task 1: The five tables

**Files:**
- Create: `app/models/access_mode.py`
- Modify: `app/models/__init__.py`
- Test: `tests/unit/test_access_mode_models.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `models.AccessMode`, `models.AccessModeLabel`,
  `models.AccessModeFieldGroup`, `models.UserAccessMode`,
  `models.UserAccessModeDenial`, with the column names locked above.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_access_mode_models.py
"""The five access-mode tables, checked at the metadata level.

No database needed: these assertions are about the mapping, and the
constraints they check are the ones task 3's migration must reproduce
literally.
"""

from app import models


def test_five_tables_are_mapped():
    assert models.AccessMode.__tablename__ == "access_mode"
    assert models.AccessModeLabel.__tablename__ == "access_mode_label"
    assert models.AccessModeFieldGroup.__tablename__ == "access_mode_field_group"
    assert models.UserAccessMode.__tablename__ == "user_access_mode"
    assert models.UserAccessModeDenial.__tablename__ == "user_access_mode_denial"


def test_only_one_mode_may_be_the_guest_default():
    """A partial unique index over a constant, not a column constraint: at
    most one row may carry the flag, and the rest are free to be false."""
    index = next(
        ix
        for ix in models.AccessMode.__table__.indexes
        if ix.name == "ix_one_guest_default_access_mode"
    )
    assert index.unique is True
    assert index.dialect_options["postgresql"]["where"] is not None


def test_only_one_held_mode_may_be_the_login_default():
    index = next(
        ix
        for ix in models.UserAccessMode.__table__.indexes
        if ix.name == "ix_one_default_mode_per_user"
    )
    assert index.unique is True
    assert index.dialect_options["postgresql"]["where"] is not None


def test_a_denial_names_exactly_one_thing():
    """label_id XOR field_group_key - the same shape note's four owner
    columns already use. A row naming both, or neither, is meaningless."""
    names = {
        c.name
        for c in models.UserAccessModeDenial.__table__.constraints
        if c.__class__.__name__ == "CheckConstraint"
    }
    assert "ck_denial_names_one_thing" in names


def test_revoking_a_mode_grant_cascades_its_denials_away():
    column = models.UserAccessModeDenial.__table__.c.user_access_mode_id
    assert next(iter(column.foreign_keys)).ondelete == "CASCADE"


def test_revoking_a_mode_cascades_its_items_and_grants_away():
    for column in (
        models.AccessModeLabel.__table__.c.mode_id,
        models.AccessModeFieldGroup.__table__.c.mode_id,
        models.UserAccessMode.__table__.c.mode_id,
    ):
        assert next(iter(column.foreign_keys)).ondelete == "CASCADE"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_access_mode_models.py -q`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'AccessMode'`.

- [ ] **Step 3: Write `app/models/access_mode.py`**

Follow `app/models/content_label.py` for style: a docstring that says *why*,
`system_id` as a `UUID(as_uuid=True)` primary key defaulting to `uuid.uuid4`,
timestamps from `get_taipei_now`.

```python
"""
Access modes: which objects a session may reach.

The role axis answers "what kinds of operation may this account perform".
This axis answers "which objects can those operations reach", and the two are
deliberately disjoint. There is no column here in which `manage.catalog` or
`admin.authz` could be stored, so "a mode scopes objects, it never grants
powers" is a property of the schema rather than a rule a reviewer has to
remember - which is why there are two typed link tables below instead of one
generic access_mode_grant(permission text).

An account holds one role and one OR MORE modes; exactly one is active per
session. Per-account denials SUBTRACT from the mode and can never add to it,
so a mode name on the user list is a trustworthy upper bound.
"""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class AccessMode(Base):
    """One named ceiling on what a session may reach."""

    __tablename__ = "access_mode"
    __table_args__ = (
        # At most one mode may be the anonymous policy. A partial unique index
        # over a constant is how PostgreSQL says "at most one row with this
        # flag"; a column constraint cannot express it. The resolver falls
        # back to the EMPTY set when none is flagged, so the failure mode of
        # this index is closed rather than open.
        Index(
            "ix_one_guest_default_access_mode",
            text("(true)"),
            unique=True,
            postgresql_where=text("is_guest_default"),
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    key = Column(String, nullable=False, unique=True, index=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # UI ordering only. Enforcement never ranks modes: with per-account
    # denials they are genuinely not a total order, which is exactly why
    # decision 3's widening test is a set comparison.
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    is_system = Column(Boolean, nullable=False, default=False, server_default="false")
    # What a logged-out visitor resolves to. A flag rather than the hardcoded
    # key "safe": editing the mode you happen to sit in yourself must not
    # silently republish it to the internet.
    is_guest_default = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class AccessModeLabel(Base):
    """One content label a mode carries - that is, does NOT hide."""

    __tablename__ = "access_mode_label"
    __table_args__ = (
        UniqueConstraint("mode_id", "label_id", name="uq_access_mode_label"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    mode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("access_mode.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label_id = Column(
        UUID(as_uuid=True),
        ForeignKey("content_label.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=get_taipei_now)


class AccessModeFieldGroup(Base):
    """
    One field group a mode carries.

    `field_group_key` is a plain string validated against FIELD_GROUP_KEYS on
    write - the same contract role_permission.permission had before this table
    took the family over. Not a foreign key, because field groups are code and
    not rows; see app/services/rbac/field_groups.py.
    """

    __tablename__ = "access_mode_field_group"
    __table_args__ = (
        UniqueConstraint(
            "mode_id", "field_group_key", name="uq_access_mode_field_group"
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    mode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("access_mode.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_group_key = Column(String, nullable=False)
    created_at = Column(DateTime, default=get_taipei_now)


class UserAccessMode(Base):
    """
    One mode an account holds, and whether a fresh login lands in it.

    is_default lives HERE rather than on users so that an account's landing
    mode is necessarily one it holds; it cannot drift out of the granted set.
    """

    __tablename__ = "user_access_mode"
    __table_args__ = (
        UniqueConstraint("user_id", "mode_id", name="uq_user_access_mode"),
        Index(
            "ix_one_default_mode_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("access_mode.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_default = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime, default=get_taipei_now)


class UserAccessModeDenial(Base):
    """
    One item this account does NOT get from this mode.

    Subtraction only. There is no "grant" counterpart and there must not be
    one: a mode is a ceiling, so an account's reach is always a subset of its
    mode's, and widening a mode later reaches everyone not explicitly narrowed.
    To let one person reach MORE, assign a wider mode and deny the specifics.

    Hangs off the GRANT row rather than the user, so revoking a mode takes
    that account's adjustments to it away with it.
    """

    __tablename__ = "user_access_mode_denial"
    __table_args__ = (
        # Mirrors the constraint already on note's four owner columns.
        CheckConstraint(
            "(label_id IS NOT NULL)::int + (field_group_key IS NOT NULL)::int = 1",
            name="ck_denial_names_one_thing",
        ),
        UniqueConstraint("user_access_mode_id", "label_id", name="uq_denial_label"),
        UniqueConstraint(
            "user_access_mode_id", "field_group_key", name="uq_denial_field_group"
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_access_mode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("user_access_mode.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label_id = Column(
        UUID(as_uuid=True),
        ForeignKey("content_label.system_id", ondelete="CASCADE"),
        nullable=True,
    )
    field_group_key = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
```

- [ ] **Step 4: Export them from `app/models/__init__.py`**

Put the import beside the other model imports and the five names in `__all__`
next to `"ContentLabel", "MediaContentLabel"` — same subsystem, and reading
them together is the point.

```python
from app.models.access_mode import (  # noqa: F401
    AccessMode,
    AccessModeFieldGroup,
    AccessModeLabel,
    UserAccessMode,
    UserAccessModeDenial,
)
```

- [ ] **Step 5: Run the new test**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_access_mode_models.py -q`
Expected: 6 passed.

- [ ] **Step 6: Run the whole suite and ruff**

Run: `venv/Scripts/ruff.exe check . ; venv/Scripts/python.exe -m pytest -q`
Expected: green. New tables nothing reads cannot change behaviour — but
`tests/api/conftest.py` builds the schema with `create_all`, so a bad
constraint shows up here as a collection error. If something breaks it is a
real collision (most likely a duplicate index name); fix it, do not rename
around it.

- [ ] **Step 7: Commit**

```bash
git add app/models/access_mode.py app/models/__init__.py tests/unit/test_access_mode_models.py
git commit -m "feat(authz): the five access-mode tables"
```

---

### Task 2: The seeded modes and the runtime seeder

**Files:**
- Create: `app/services/rbac/seed_modes.py`
- Modify: `app/main.py` (lifespan), `app/services/rbac/seed.py` (move `GUEST_WITHHELD_FIELD_GROUPS`)
- Test: `tests/unit/test_access_mode_seed.py`

**Interfaces:**
- Consumes: task 1's models.
- Produces:
  - `MODE_UNRESTRICTED`, `MODE_BORDERLINE`, `MODE_NORMAL`, `MODE_SAFE` — str constants.
  - `SEEDED_MODES: tuple[dict, ...]` — each `{"key", "label", "description", "sort_order", "is_guest_default", "field_groups": tuple[str, ...], "all_labels": bool}`.
  - `ensure_access_mode_seed(db: Session) -> None` — idempotent, tops up only what is missing.

**Why a separate module:** `seed.py` is about roles, is 190 lines, and its
docstring is entirely about the role axis. Task 3's migration also needs the
same data as a frozen snapshot, and having one module that *is* the data makes
the duplication between the two visible instead of accidental.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_access_mode_seed.py
"""The four seeded modes.

`safe` is today's guest exactly - GUEST_WITHHELD_FIELD_GROUPS is
{"sources_restricted"} and nothing else - so the day this lands, a logged-out
visitor sees precisely what they saw the day before. That property is the
whole reason Phase B is safe to ship before Phase D gives anyone a way to
change a mode.
"""

import pytest

from app import models
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
    ensure_access_mode_seed,
)


def _mode(db, key):
    return db.query(models.AccessMode).filter(models.AccessMode.key == key).one()


def _field_groups(db, mode):
    return {
        row.field_group_key
        for row in db.query(models.AccessModeFieldGroup).filter(
            models.AccessModeFieldGroup.mode_id == mode.system_id
        )
    }


def test_seeds_four_system_modes(db_session):
    ensure_access_mode_seed(db_session)
    keys = {m.key for m in db_session.query(models.AccessMode)}
    assert keys == {MODE_UNRESTRICTED, MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE}
    assert all(m.is_system for m in db_session.query(models.AccessMode))


def test_safe_is_the_guest_default_and_the_only_one(db_session):
    ensure_access_mode_seed(db_session)
    flagged = [
        m.key
        for m in db_session.query(models.AccessMode).filter(
            models.AccessMode.is_guest_default.is_(True)
        )
    ]
    assert flagged == [MODE_SAFE]


def test_safe_withholds_restricted_sources_and_nothing_else(db_session):
    """The one step that changes what a REACHABLE entry shows. The top three
    tiers differ only in which entries exist for you."""
    ensure_access_mode_seed(db_session)
    assert _field_groups(db_session, _mode(db_session, MODE_SAFE)) == (
        set(FIELD_GROUP_KEYS) - {"sources_restricted"}
    )
    for key in (MODE_NORMAL, MODE_BORDERLINE, MODE_UNRESTRICTED):
        assert _field_groups(db_session, _mode(db_session, key)) == set(FIELD_GROUP_KEYS)


def test_unrestricted_carries_every_label_and_normal_carries_none(db_session):
    label = models.ContentLabel(key="nsfw", label="NSFW")
    db_session.add(label)
    db_session.flush()
    ensure_access_mode_seed(db_session)

    def labels(key):
        return {
            row.label_id
            for row in db_session.query(models.AccessModeLabel).filter(
                models.AccessModeLabel.mode_id == _mode(db_session, key).system_id
            )
        }

    assert labels(MODE_UNRESTRICTED) == {label.system_id}
    assert labels(MODE_BORDERLINE) == {label.system_id}
    assert labels(MODE_NORMAL) == set()
    assert labels(MODE_SAFE) == set()


def test_is_idempotent(db_session):
    """The lifespan runs against a database that may already hold these rows,
    and it must not duplicate or overwrite them."""
    ensure_access_mode_seed(db_session)
    ensure_access_mode_seed(db_session)
    assert db_session.query(models.AccessMode).count() == 4
    assert (
        db_session.query(models.AccessModeFieldGroup)
        .filter(
            models.AccessModeFieldGroup.mode_id
            == _mode(db_session, MODE_SAFE).system_id
        )
        .count()
        == len(FIELD_GROUP_KEYS) - 1
    )


def test_does_not_hand_back_an_item_an_admin_removed(db_session):
    """Same rule ensure_rbac_seed already follows for guest: top up a mode
    holding NOTHING, never a mode somebody has deliberately narrowed."""
    ensure_access_mode_seed(db_session)
    safe = _mode(db_session, MODE_SAFE)
    db_session.query(models.AccessModeFieldGroup).filter(
        models.AccessModeFieldGroup.mode_id == safe.system_id,
        models.AccessModeFieldGroup.field_group_key == "credits",
    ).delete(synchronize_session=False)
    db_session.flush()

    ensure_access_mode_seed(db_session)

    assert "credits" not in _field_groups(db_session, safe)
```

Note `test_unrestricted_carries_every_label_and_normal_carries_none` also
pins the one genuinely dynamic part of the seed: `unrestricted` and
`borderline` are defined over the `content_label` rows that exist **when the
seeder runs**. A label added later is not retro-granted, matching the "never
hand back what an admin removed" rule — and is a thing the Phase D admin page
exists to fix.

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_access_mode_seed.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.rbac.seed_modes`.

- [ ] **Step 3: Write `app/services/rbac/seed_modes.py`**

```python
"""
The four access modes the app ships with.

Called from the lifespan AND named by the Phase B migration, for the reason
seed.py already gives: tests/api/conftest.py resets the schema with
Base.metadata.create_all and never runs Alembic, so a seed living only in a
migration body would leave every API test mode-less. The migration does NOT
import this module - it carries its own frozen copy of the same rows, because
a migration that imports app code breaks the day a later revision adds a
column. See spec section 5, "The seed is a frozen snapshot".

`safe` is today's guest exactly, so nothing a visitor sees changes on the day
this lands.
"""

from sqlalchemy.orm import Session

from app import models
from app.services.rbac.field_groups import FIELD_GROUP_KEYS

MODE_UNRESTRICTED = "unrestricted"
MODE_BORDERLINE = "borderline"
MODE_NORMAL = "normal"
MODE_SAFE = "safe"

# Field groups the `safe` mode does NOT carry. A group lands here when its
# whole purpose is to withhold something from ordinary viewers, so granting it
# by default would defeat it. Moved from seed.py, where it was
# GUEST_WITHHELD_FIELD_GROUPS: the role axis no longer carries field groups.
SAFE_WITHHELD_FIELD_GROUPS: frozenset[str] = frozenset({"sources_restricted"})

SEEDED_MODES: tuple[dict, ...] = (
    {
        "key": MODE_UNRESTRICTED,
        "label": "Unrestricted",
        "description": "Every entry and every field. The widest mode.",
        "sort_order": 0,
        "is_guest_default": False,
        "all_labels": True,
        "field_groups": tuple(FIELD_GROUP_KEYS),
    },
    {
        "key": MODE_BORDERLINE,
        "label": "Borderline",
        "description": "Adult-labelled entries are visible; every field shows.",
        "sort_order": 10,
        "is_guest_default": False,
        "all_labels": True,
        "field_groups": tuple(FIELD_GROUP_KEYS),
    },
    {
        "key": MODE_NORMAL,
        "label": "Normal",
        "description": "No labelled entries; every field of a visible entry shows.",
        "sort_order": 20,
        "is_guest_default": False,
        "all_labels": False,
        "field_groups": tuple(FIELD_GROUP_KEYS),
    },
    {
        "key": MODE_SAFE,
        "label": "Safe",
        "description": (
            "No labelled entries, and the restricted source list is withheld. "
            "What a logged-out visitor sees."
        ),
        "sort_order": 30,
        "is_guest_default": True,
        "all_labels": False,
        "field_groups": tuple(
            key for key in FIELD_GROUP_KEYS if key not in SAFE_WITHHELD_FIELD_GROUPS
        ),
    },
)


def ensure_access_mode_seed(db: Session) -> None:
    """Create the four modes and top up their items. Idempotent.

    Tops up only a mode holding NOTHING of a given kind, exactly as
    ensure_rbac_seed does for guest: an item an admin deliberately removed
    must not be handed back on the next restart.
    """
    label_ids = [row.system_id for row in db.query(models.ContentLabel.system_id)]

    for spec in SEEDED_MODES:
        mode = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.key == spec["key"])
            .first()
        )
        if mode is None:
            mode = models.AccessMode(
                key=spec["key"],
                label=spec["label"],
                description=spec["description"],
                sort_order=spec["sort_order"],
                is_system=True,
                is_guest_default=spec["is_guest_default"],
            )
            db.add(mode)
            db.flush()

        held_groups = db.query(models.AccessModeFieldGroup).filter(
            models.AccessModeFieldGroup.mode_id == mode.system_id
        )
        if held_groups.first() is None:
            for key in spec["field_groups"]:
                db.add(
                    models.AccessModeFieldGroup(
                        mode_id=mode.system_id, field_group_key=key
                    )
                )

        if spec["all_labels"] and label_ids:
            held_labels = db.query(models.AccessModeLabel).filter(
                models.AccessModeLabel.mode_id == mode.system_id
            )
            if held_labels.first() is None:
                for label_id in label_ids:
                    db.add(
                        models.AccessModeLabel(
                            mode_id=mode.system_id, label_id=label_id
                        )
                    )

    db.flush()
```

- [ ] **Step 4: Move the constant out of `seed.py`**

In `app/services/rbac/seed.py`, delete `GUEST_WITHHELD_FIELD_GROUPS` and
re-export nothing — task 8 removes `default_guest_permissions`' field-group
half entirely. For now, import the new name so the two cannot drift:

```python
from app.services.rbac.seed_modes import SAFE_WITHHELD_FIELD_GROUPS

# Kept as an alias for this task only; task 8 deletes the field-group half of
# default_guest_permissions() and this goes with it.
GUEST_WITHHELD_FIELD_GROUPS = SAFE_WITHHELD_FIELD_GROUPS
```

Check `tests/unit/test_rbac_seed.py` for a reference to the old name and leave
it passing.

- [ ] **Step 5: Call it from the lifespan**

In `app/main.py`, beside the existing `ensure_rbac_seed` call — modes after
roles, because a mode's label rows depend on `content_label` and nothing else,
but keeping the two seeds adjacent is how the next reader finds both.

- [ ] **Step 6: Run the new test, then the suite**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_access_mode_seed.py -q`
Expected: 6 passed.

Run: `venv/Scripts/ruff.exe check . ; venv/Scripts/python.exe -m pytest -q`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add app/services/rbac/seed_modes.py app/services/rbac/seed.py app/main.py tests/unit/test_access_mode_seed.py
git commit -m "feat(authz): seed the four access modes"
```

---

### Task 3: The migration

**Files:**
- Create: `alembic/versions/n1a1accessmode.py` (down_revision `m5b2memefks`)
- Test: `tests/api/test_access_mode_migration.py`

**Interfaces:**
- Consumes: task 1's table shapes and task 2's `SEEDED_MODES` *values* — but
  **not** by import. The migration carries its own literal copy.
- Produces: a database in which every existing account holds all four modes,
  defaults to `unrestricted`, and `role_permission` holds zero `field_group.*`
  and zero `label.*` rows.

**The order is load-bearing** (spec section 5, as corrected by post-Phase-A
audit item 2 — step 3 of the spec's list already shipped in Phase A with no
migration at all, so this revision does four things, not five):

1. Create the five tables.
2. Seed the four modes and their items; flag `safe`.
3. Grant every existing account all four modes, defaulting to `unrestricted`.
4. *Only then* delete `field_group.*` and `label.*` from `role_permission`.

Steps 3 and 4 must not be reordered: the mode grants have to exist before the
old grants go, or there is a window in which an account holds neither. Alembic
runs on container start before uvicorn serves, so a half-applied state is never
exposed to a request — but the ordering still matters to whoever resumes a
failed migration by hand.

**No `app.models` import.** Write the column list out literally in
`sa.table(...)`. The reason is in spec section 5 and in the open item about
`alembic upgrade head` already failing at `86982d71c2f1` from an empty
database: a migration that queries the ORM SELECTs every column the model
declares *today*, so it breaks the day a later revision adds one.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_access_mode_migration.py
"""What the Phase B migration must leave behind.

These run against the create_all schema, not against Alembic - the suite has
no migration harness. They assert the POST-STATE the migration is written to
produce, so that if someone changes the seed and forgets the migration, the
divergence shows up as a failure here rather than on the home machine.
"""

from app import models
from app.services.rbac.seed_modes import MODE_UNRESTRICTED


def test_every_account_holds_all_four_modes(db_session, admin_user, plain_user):
    from app.services.rbac.modes import grant_all_modes_to_existing_accounts

    grant_all_modes_to_existing_accounts(db_session)

    for user in (admin_user, plain_user):
        held = (
            db_session.query(models.UserAccessMode)
            .filter(models.UserAccessMode.user_id == user.id)
            .all()
        )
        assert len(held) == 4
        defaults = [row for row in held if row.is_default]
        assert len(defaults) == 1
        assert (
            db_session.get(models.AccessMode, defaults[0].mode_id).key
            == MODE_UNRESTRICTED
        )


def test_granting_twice_does_not_duplicate(db_session, admin_user):
    from app.services.rbac.modes import grant_all_modes_to_existing_accounts

    grant_all_modes_to_existing_accounts(db_session)
    grant_all_modes_to_existing_accounts(db_session)

    assert (
        db_session.query(models.UserAccessMode)
        .filter(models.UserAccessMode.user_id == admin_user.id)
        .count()
        == 4
    )
```

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_access_mode_migration.py -q`
Expected: FAIL — `ImportError: cannot import name 'grant_all_modes_to_existing_accounts'`.

- [ ] **Step 3: Add the helper to `app/services/rbac/modes.py`**

It lives in `modes.py`, not in the migration, because the runtime also needs it:
the lifespan seed must give a database built by `create_all` the same grants.
The migration reproduces it in Core SQL.

```python
def grant_all_modes_to_existing_accounts(db: Session) -> None:
    """
    Every existing account holds all four modes and lands in `unrestricted`.

    This is what makes Phase B behaviour-neutral: for the owner's admin
    account, `unrestricted` is the faithful mapping of today's is_superuser,
    which sees everything. New accounts get `safe` only - that is runtime code
    in users.py's create handler (Phase D), not this.

    Idempotent: an account that already holds a mode is left alone, including
    its is_default flag, so re-running never overwrites a choice.
    """
    modes = {m.key: m.system_id for m in db.query(models.AccessMode)}
    if len(modes) < len(SEEDED_MODES):
        return
    for user in db.query(models.User):
        held = {
            row.mode_id
            for row in db.query(models.UserAccessMode).filter(
                models.UserAccessMode.user_id == user.id
            )
        }
        if held:
            continue
        for key, mode_id in modes.items():
            db.add(
                models.UserAccessMode(
                    user_id=user.id,
                    mode_id=mode_id,
                    is_default=(key == MODE_UNRESTRICTED),
                )
            )
    db.flush()
```

Call it from the lifespan right after `ensure_access_mode_seed`.

- [ ] **Step 4: Run the new test**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_access_mode_migration.py -q`
Expected: 2 passed.

- [ ] **Step 5: Write the revision**

```bash
venv/Scripts/python.exe -m alembic revision -m "access mode axis"
```

Rename the file to `n1a1accessmode.py` and set `revision = "n1a1accessmode"`,
`down_revision = "m5b2memefks"` — matching the naming the other revisions in
this repo use. Then write the body by hand; **do not trust
`--autogenerate`** for the seed half, and check its table DDL against task 1's
model before keeping it.

The upgrade body, in four clearly commented blocks:

```python
"""access mode axis

Creates the five access-mode tables, seeds the four system modes, grants every
existing account all four (defaulting to `unrestricted`, so nothing changes
visibly on the day this lands), and only THEN removes the field_group.* and
label.* grants from role_permission.

DOWNGRADE LOSES DENIALS. Dropping the tables cannot reconstruct per-account
adjustments, and the field_group.* grants restored on the way down are the
seeded defaults, not whatever an admin had edited them to. Downgrading is a
recovery action, not a round trip.

The seed below is a FROZEN SNAPSHOT: the column lists are written out
literally rather than imported from app.models. A migration that queries the
ORM emits SELECT over every column the model declares today, so it breaks the
day a later revision adds one - which has already happened twice in this repo
(86982d71c2f1, and the instance that blocked the home machine on 2026-09-07).
"""
```

Block 1, `op.create_table` five times, mirroring task 1's models exactly,
followed by the two partial unique indexes:

```python
op.create_index(
    "ix_one_guest_default_access_mode",
    "access_mode",
    [sa.text("(true)")],
    unique=True,
    postgresql_where=sa.text("is_guest_default"),
)
op.create_index(
    "ix_one_default_mode_per_user",
    "user_access_mode",
    ["user_id"],
    unique=True,
    postgresql_where=sa.text("is_default"),
)
```

Block 2, the frozen seed. Generate the uuids in Python so the same values go
into the link rows:

```python
MODES = [
    # (key, label, description, sort_order, is_guest_default, all_labels,
    #  withheld_field_groups)
    ("unrestricted", "Unrestricted", "Every entry and every field. The widest mode.", 0, False, True, ()),
    ("borderline", "Borderline", "Adult-labelled entries are visible; every field shows.", 10, False, True, ()),
    ("normal", "Normal", "No labelled entries; every field of a visible entry shows.", 20, False, False, ()),
    ("safe", "Safe", "No labelled entries, and the restricted source list is withheld. What a logged-out visitor sees.", 30, True, False, ("sources_restricted",)),
]

# Frozen snapshot of FIELD_GROUP_KEYS as of 2026-09-11. NOT imported: a field
# group added later must not retroactively change what this revision seeded.
FIELD_GROUPS_AT_WRITE_TIME = (
    "sources_other",
    "sources_restricted",
    "personal_notes",
    "system_info",
    "credits",
)
```

Verify `FIELD_GROUPS_AT_WRITE_TIME` against
`app/services/rbac/field_groups.py`'s `FIELD_GROUPS` dict before committing —
the list above is what the file held when this plan was written, and a plan is
not evidence.

Read the existing `content_label` rows with Core SQL for the `all_labels`
modes:

```python
conn = op.get_bind()
label_ids = [r[0] for r in conn.execute(sa.text("SELECT system_id FROM content_label"))]
```

Block 3, the per-account grants:

```python
user_ids = [r[0] for r in conn.execute(sa.text("SELECT id FROM users"))]
# is_default on `unrestricted` only: the faithful mapping of today's
# is_superuser for the owner's account, and behaviour-neutral for everyone.
```

Block 4, and not before it:

```python
conn.execute(
    sa.text(
        "DELETE FROM role_permission "
        "WHERE permission LIKE 'field_group.%' OR permission LIKE 'label.%'"
    )
)
```

The downgrade drops the five tables and re-inserts the seeded `field_group.*`
grants onto the guest, user and super roles by name — twelve rows, as the
post-Phase-A audit counted. It cannot restore denials, and the docstring says
so.

- [ ] **Step 6: Run it against a scratch database, both ways**

```bash
POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m alembic upgrade head
POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m alembic downgrade -1
POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m alembic upgrade head
```

Expected: three clean runs. Then confirm the post-state by hand:

```bash
psql -c "SELECT key, is_guest_default FROM access_mode ORDER BY sort_order"
psql -c "SELECT count(*) FROM role_permission WHERE permission LIKE 'field_group.%' OR permission LIKE 'label.%'"
```

Expected: four rows with `safe` flagged; count 0.

Record `anime_site_test_phaseb` in `docs/PROGRESS.md` under Environment as a
droppable scratch database.

- [ ] **Step 7: Run the suite, then commit**

```bash
git add alembic/versions/n1a1accessmode.py app/services/rbac/modes.py app/main.py tests/api/test_access_mode_migration.py
git commit -m "feat(authz): migrate to the access-mode axis"
```

---

### Task 4: The mode caches

**Files:**
- Modify: `app/services/rbac/cache.py`
- Modify: `tests/api/conftest.py` (`_clear_permission_cache`)
- Test: `tests/unit/test_mode_cache.py`

**Interfaces:**
- Consumes: task 1's models.
- Produces:
  - `ModeSets` (defined in `modes.py`, imported by `cache.py`) — frozen
    dataclass with `.label_ids: frozenset[UUID]` and `.field_groups: frozenset[str]`.
  - `cache.mode_sets(db, mode_id) -> ModeSets`
  - `cache.denials_for(db, user_access_mode_id) -> ModeSets`
  - `cache.bump()` clears all three dicts.

**Why not one cache keyed on the user:** `_CACHE` today is
`dict[UUID, frozenset[str]]` keyed on role id alone, and that sharing is what
makes it worth having. Adding the user to the key would make it unbounded in
accounts. Two dicts instead: `_MODE_CACHE[mode_id]`, shared by everyone
holding that mode and hot; `_DENIAL_CACHE[user_access_mode_id]`, usually empty.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_mode_cache.py
"""The two new caches, and the one thing that must never be forgotten about
them: bump() clears all three. If it does not, mode state leaks between tests
and the failures are random and order-dependent."""

from app import models
from app.services.rbac import cache
from app.services.rbac.seed_modes import MODE_SAFE, ensure_access_mode_seed


def test_mode_sets_reads_the_modes_items(db_session):
    ensure_access_mode_seed(db_session)
    safe = (
        db_session.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_SAFE)
        .one()
    )
    sets = cache.mode_sets(db_session, safe.system_id)
    assert "sources_restricted" not in sets.field_groups
    assert "credits" in sets.field_groups
    assert sets.label_ids == frozenset()


def test_mode_sets_is_cached(db_session):
    ensure_access_mode_seed(db_session)
    safe = (
        db_session.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_SAFE)
        .one()
    )
    first = cache.mode_sets(db_session, safe.system_id)
    assert cache.mode_sets(db_session, safe.system_id) is first


def test_bump_clears_the_mode_cache_too(db_session):
    """Every write that changes a grant already calls bump(); the new mode and
    denial writes call the same one. A bump that cleared only the role cache
    would leave a revoked mode live until restart."""
    ensure_access_mode_seed(db_session)
    safe = (
        db_session.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_SAFE)
        .one()
    )
    first = cache.mode_sets(db_session, safe.system_id)
    cache.bump()
    assert cache.mode_sets(db_session, safe.system_id) is not first


def test_denials_for_an_untouched_grant_is_empty(db_session, admin_user):
    ensure_access_mode_seed(db_session)
    safe = (
        db_session.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_SAFE)
        .one()
    )
    grant = models.UserAccessMode(user_id=admin_user.id, mode_id=safe.system_id)
    db_session.add(grant)
    db_session.flush()

    denials = cache.denials_for(db_session, grant.system_id)
    assert denials.label_ids == frozenset()
    assert denials.field_groups == frozenset()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/unit/test_mode_cache.py -q`
Expected: FAIL — `AttributeError: module ... has no attribute 'mode_sets'`.

- [ ] **Step 3: Add `ModeSets` to `modes.py` and the two caches to `cache.py`**

In `app/services/rbac/modes.py`:

```python
@dataclass(frozen=True)
class ModeSets:
    """What a mode carries, or what a grant subtracts - the same shape used
    for both, because the resolution step is a set difference."""

    label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()


```

`ModeSets()` with both defaults is the empty answer; do not add a named
`EMPTY_SETS` constant unless a second call site wants one.

In `app/services/rbac/cache.py`, extend the module docstring to say there are
now three caches and one `bump()`, then:

```python
_MODE_CACHE: dict[UUID, "ModeSets"] = {}
_DENIAL_CACHE: dict[UUID, "ModeSets"] = {}


def bump() -> None:
    """Drop every cache. Called by every write that changes a grant - role
    permissions, mode items, and per-account denials alike."""
    _CACHE.clear()
    _MODE_CACHE.clear()
    _DENIAL_CACHE.clear()


def mode_sets(db: Session, mode_id: UUID) -> "ModeSets":
    """What one mode carries. Shared by everyone holding it, so this is the
    hot one."""
    cached = _MODE_CACHE.get(mode_id)
    if cached is not None:
        return cached
    labels = frozenset(
        row.label_id
        for row in db.query(models.AccessModeLabel.label_id).filter(
            models.AccessModeLabel.mode_id == mode_id
        )
    )
    groups = frozenset(
        row.field_group_key
        for row in db.query(models.AccessModeFieldGroup.field_group_key).filter(
            models.AccessModeFieldGroup.mode_id == mode_id
        )
    )
    sets = ModeSets(label_ids=labels, field_groups=groups)
    _MODE_CACHE[mode_id] = sets
    return sets


def denials_for(db: Session, user_access_mode_id: UUID) -> "ModeSets":
    """What one (account, mode) pair subtracts. Usually empty."""
    cached = _DENIAL_CACHE.get(user_access_mode_id)
    if cached is not None:
        return cached
    rows = db.query(
        models.UserAccessModeDenial.label_id,
        models.UserAccessModeDenial.field_group_key,
    ).filter(models.UserAccessModeDenial.user_access_mode_id == user_access_mode_id)
    labels, groups = set(), set()
    for label_id, field_group_key in rows:
        if label_id is not None:
            labels.add(label_id)
        if field_group_key is not None:
            groups.add(field_group_key)
    sets = ModeSets(frozenset(labels), frozenset(groups))
    _DENIAL_CACHE[user_access_mode_id] = sets
    return sets
```

Import `ModeSets` from `modes.py` inside the functions or under
`TYPE_CHECKING` if a circular import bites — `modes.py` will import `cache`.

- [ ] **Step 4: Make the autouse fixture clear them**

`tests/api/conftest.py`'s `_clear_permission_cache` already calls
`rbac_cache.bump()` on both sides, so extending `bump()` is enough — but
**update its docstring** to say it now covers three caches. The spec calls
this out as the likeliest source of a day lost to mystery flakes; a docstring
that still says "the role -> permissions cache" is how the next person
reintroduces a separate clear.

- [ ] **Step 5: Run the new test, then the suite**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/ruff.exe check . ; POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest -q`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add app/services/rbac/cache.py app/services/rbac/modes.py tests/api/conftest.py tests/unit/test_mode_cache.py
git commit -m "feat(authz): cache mode items and per-account denials"
```

---

### Task 5: Resolution — `Viewer` learns its mode

**Files:**
- Modify: `app/services/rbac/modes.py`, `app/services/rbac/resolver.py`, `app/routers/auth.py`
- Test: `tests/unit/test_mode_resolution.py`, `tests/api/test_access_modes.py` (the fail-closed half)

**Interfaces:**
- Consumes: `cache.mode_sets`, `cache.denials_for`, `ModeSets`.
- Produces:
  - `ResolvedMode(mode_id, mode_key, label_ids, field_groups)`, `EMPTY_MODE`.
  - `resolve_mode(db, user, token_mode_id) -> ResolvedMode`.
  - `default_mode_id(db, user) -> Optional[UUID]`.
  - `Viewer.mode_id`, `.mode_key`, `.visible_label_ids`, `.field_groups`.
  - The login token carries `"mode": str(mode_id)`.

**The resolution order, fail-closed** (spec section 3 — copy it into the
docstring, because the wrong fallback here is a silent widening):

```
token.mode  ->  still granted to this user?
                  yes -> effective = mode's sets - this pair's denials
                  no  -> effective = EMPTY SET
no token    ->  the is_guest_default mode, or EMPTY SET if none flagged
```

The fallback for a revoked mode is the **empty set, not the account's default
mode**. Narrowest is not well-defined once modes are deliberately unordered,
and falling back to `is_default` could *widen* a session: sitting in `safe`
when an admin revokes `safe` would hand the viewer `unrestricted` with no
password. The empty set is the only fallback that cannot widen.

- [ ] **Step 1: Write the failing unit test**

```python
# tests/unit/test_mode_resolution.py
"""resolve_mode, in isolation. The HTTP-level consequences are in
tests/api/test_access_modes.py; these are the four branches of the order."""

import uuid

import pytest

from app import models
from app.services.rbac import cache
from app.services.rbac.modes import EMPTY_MODE, resolve_mode
from app.services.rbac.seed_modes import (
    MODE_SAFE,
    MODE_UNRESTRICTED,
    ensure_access_mode_seed,
)


@pytest.fixture
def seeded(db_session):
    label = models.ContentLabel(key="nsfw", label="NSFW")
    db_session.add(label)
    db_session.flush()
    ensure_access_mode_seed(db_session)
    cache.bump()
    return label


def _mode(db, key):
    return db.query(models.AccessMode).filter(models.AccessMode.key == key).one()


def _grant(db, user, mode, is_default=False):
    row = models.UserAccessMode(
        user_id=user.id, mode_id=mode.system_id, is_default=is_default
    )
    db.add(row)
    db.flush()
    return row


def test_a_granted_mode_resolves_to_its_sets(db_session, admin_user, seeded):
    mode = _mode(db_session, MODE_UNRESTRICTED)
    _grant(db_session, admin_user, mode)

    resolved = resolve_mode(db_session, admin_user, mode.system_id)

    assert resolved.mode_key == MODE_UNRESTRICTED
    assert resolved.label_ids == frozenset({seeded.system_id})
    assert "sources_restricted" in resolved.field_groups


def test_denials_subtract(db_session, admin_user, seeded):
    mode = _mode(db_session, MODE_UNRESTRICTED)
    grant = _grant(db_session, admin_user, mode)
    db_session.add(
        models.UserAccessModeDenial(
            user_access_mode_id=grant.system_id, label_id=seeded.system_id
        )
    )
    db_session.flush()
    cache.bump()

    resolved = resolve_mode(db_session, admin_user, mode.system_id)

    assert resolved.label_ids == frozenset()
    assert "sources_restricted" in resolved.field_groups


def test_a_mode_the_account_does_not_hold_resolves_to_nothing(
    db_session, admin_user, seeded
):
    """NOT to the account's default. Falling back to is_default could WIDEN a
    session: sitting in `safe` when an admin revokes `safe` would hand the
    viewer `unrestricted` with no password."""
    unheld = _mode(db_session, MODE_UNRESTRICTED)
    _grant(db_session, admin_user, _mode(db_session, MODE_SAFE), is_default=True)

    assert resolve_mode(db_session, admin_user, unheld.system_id) == EMPTY_MODE


def test_an_unknown_mode_id_resolves_to_nothing(db_session, admin_user, seeded):
    assert resolve_mode(db_session, admin_user, uuid.uuid4()) == EMPTY_MODE


def test_no_user_resolves_to_the_guest_default(db_session, seeded):
    resolved = resolve_mode(db_session, None, None)
    assert resolved.mode_key == MODE_SAFE
    assert "sources_restricted" not in resolved.field_groups


def test_no_flagged_guest_default_resolves_to_nothing(db_session, seeded):
    """Fail closed. A misconfiguration must hide everything, not publish it."""
    db_session.query(models.AccessMode).update({"is_guest_default": False})
    db_session.flush()
    cache.bump()

    assert resolve_mode(db_session, None, None) == EMPTY_MODE
```

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/unit/test_mode_resolution.py -q`
Expected: FAIL — `ImportError: cannot import name 'resolve_mode'`.

- [ ] **Step 3: Write `resolve_mode` in `modes.py`**

```python
@dataclass(frozen=True)
class ResolvedMode:
    """The active mode of one session, after denials."""

    mode_id: Optional[UUID] = None
    mode_key: Optional[str] = None
    label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()


EMPTY_MODE = ResolvedMode()


def resolve_mode(
    db: Session, user: Optional["models.User"], token_mode_id: Optional[UUID]
) -> ResolvedMode:
    """
    Which objects this session may reach.

    token.mode  ->  still granted to this user?
                      yes -> effective = mode's sets - this pair's denials
                      no  -> effective = EMPTY SET
    no token    ->  the is_guest_default mode, or EMPTY SET if none flagged

    The claim NAMES A CHOICE, NOT A GRANT: whether the account may still use
    the mode is resolved from the database on every request, exactly as the
    role already is. So revoking a mode or ticking a new denial takes effect
    on the viewer's next request even with a live cookie.

    The fallback for a revoked mode is the EMPTY SET, never the account's
    default. "Narrowest" is not well-defined once modes are deliberately
    unordered, and falling back to is_default could WIDEN a session - sitting
    in `safe` when an admin revokes `safe` would hand the viewer
    `unrestricted` with no password. The empty set is the only fallback that
    cannot widen.
    """
    if user is None:
        mode = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.is_guest_default.is_(True))
            .first()
        )
        if mode is None:
            return EMPTY_MODE
        sets = cache.mode_sets(db, mode.system_id)
        return ResolvedMode(mode.system_id, mode.key, sets.label_ids, sets.field_groups)

    if token_mode_id is None:
        return EMPTY_MODE

    grant = (
        db.query(models.UserAccessMode)
        .filter(
            models.UserAccessMode.user_id == user.id,
            models.UserAccessMode.mode_id == token_mode_id,
        )
        .first()
    )
    if grant is None:
        return EMPTY_MODE

    mode = db.get(models.AccessMode, token_mode_id)
    if mode is None:
        return EMPTY_MODE

    sets = cache.mode_sets(db, mode.system_id)
    denials = cache.denials_for(db, grant.system_id)
    return ResolvedMode(
        mode.system_id,
        mode.key,
        sets.label_ids - denials.label_ids,
        sets.field_groups - denials.field_groups,
    )


def default_mode_id(db: Session, user: "models.User") -> Optional[UUID]:
    """The mode a fresh login lands in: the account's is_default grant.

    None when the account holds no default - which resolve_mode turns into the
    empty set, so a login with no mode shows nothing rather than everything.
    """
    row = (
        db.query(models.UserAccessMode.mode_id)
        .filter(
            models.UserAccessMode.user_id == user.id,
            models.UserAccessMode.is_default.is_(True),
        )
        .first()
    )
    return row[0] if row else None
```

- [ ] **Step 4: Widen `Viewer` and `resolve_viewer`**

In `resolver.py`, add the four fields to the dataclass **after** the existing
defaulted ones (a dataclass cannot put an undefaulted field after a defaulted
one — the same constraint `user_id`'s comment already records):

```python
    # The ACTIVE access mode, resolved per request. `permissions` above still
    # means the ROLE's capability set and has() is unchanged: the two axes are
    # disjoint by construction, and neither can express the other.
    mode_id: Optional[UUID] = None
    mode_key: Optional[str] = None
    # The labels this session may SEE. enforcement.hidden_label_ids derives
    # the complement; do not invert this.
    visible_label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()
```

`GUEST_FALLBACK` keeps its empty sets by taking the defaults, which is already
the fail-closed answer — add a comment saying so rather than passing them
explicitly.

In `resolve_viewer`, after the role is resolved:

```python
        token_mode_id = None
        raw_mode = (payload or {}).get("mode")
        if raw_mode:
            try:
                token_mode_id = UUID(str(raw_mode))
            except (ValueError, AttributeError, TypeError):
                token_mode_id = None
        mode = resolve_mode(db, user, token_mode_id)
```

and pass `mode_id=mode.mode_id, mode_key=mode.mode_key,
visible_label_ids=mode.label_ids, field_groups=mode.field_groups` into the
`Viewer(...)` construction. A malformed claim resolves to `None`, which for a
logged-in user is the empty set — fail closed, and it costs one `try`.

- [ ] **Step 5: Mint the claim at login**

In `app/routers/auth.py`'s `login_for_access_token`:

```python
    # The claim names a CHOICE, not a grant: whether the account may still use
    # this mode is re-resolved from the database on every request, the same way
    # the decorative `role` claim above is. Carries the uuid rather than the
    # key so renaming a mode does not invalidate live sessions.
    token_data = {
        "sub": user.username,
        "role": user.role,
        "mode": str(default_mode_id(db, user) or ""),
    }
```

The empty string for an account with no default resolves to the empty set in
step 4's parser — which is the correct answer, not a bug to special-case.

- [ ] **Step 6: Run both test files, then the suite**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/unit/test_mode_resolution.py -q`
Expected: 6 passed.

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/ruff.exe check . ; POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest -q`
Expected: green. Nothing reads the new `Viewer` fields yet, so behaviour is
unchanged. `tests/unit/test_rbac_viewer.py` constructs `Viewer` directly —
check it still passes; the new fields are all defaulted precisely so it does.

- [ ] **Step 7: Commit**

```bash
git add app/services/rbac/modes.py app/services/rbac/resolver.py app/routers/auth.py tests/unit/test_mode_resolution.py
git commit -m "feat(authz): resolve the active access mode per request"
```

---

### Task 6: The pivot — enforcement reads the mode

**This is the largest and riskiest task in the plan.** It flips both gates onto
the mode axis and re-points every test that granted `label.*` or
`field_group.*`. The two halves cannot be split: the moment
`hidden_label_ids` reads the mode, a test granting `label.nsfw` to a role is
asserting a model that no longer exists.

**Files:**
- Modify: `app/services/rbac/enforcement.py`, `app/services/rbac/field_gate.py`, `app/routers/note.py` (line 282 only)
- Modify: `tests/api/conftest.py` — new fixtures, and `make_viewer` grows a `mode` argument
- Modify: the test files that grant the two families (see step 4)
- Test: `tests/api/test_access_modes.py`

**Interfaces:**
- Consumes: `Viewer.visible_label_ids`, `Viewer.field_groups`.
- Produces:
  - `hidden_label_ids(db, viewer) -> list[UUID]` — unchanged signature and
    unchanged meaning ("labels to hide"), new source. **All five consumers are
    untouched**, which is the point.
  - conftest: `super_user`, `super_client`, `mode(key)`, `grant_mode(user, mode_key, denials=())`, `labelled_entry(label_key)`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_access_modes.py
"""What an access mode does to a read.

Matrix rows 2 (read scoping), 4 (denials), 6 (fail-closed resolution) and 7
(axis independence) from spec section 6. Row 7 is the one that proves the
redesign did what it set out to do: it would have PASSED trivially in the old
model, where is_superuser short-circuited every gate.
"""

import pytest

from app import models
from app.services.rbac import cache
from app.services.rbac.seed_modes import MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE


def test_a_labelled_entry_is_invisible_in_safe(
    db_session, client, nsfw_label, hidden_anime, grant_mode, mode_client
):
    c = mode_client(MODE_SAFE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_the_same_entry_is_visible_in_borderline(
    db_session, nsfw_label, hidden_anime, mode_client
):
    c = mode_client(MODE_BORDERLINE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


def test_a_hidden_entry_is_absent_from_the_list(
    db_session, nsfw_label, hidden_anime, mode_client
):
    c = mode_client(MODE_NORMAL)
    body = c.get("/api/anime/").json()
    assert hidden_anime.system_id not in {entry["system_id"] for entry in body}


def test_hidden_answers_404_with_the_ordinary_not_found_message(
    db_session, nsfw_label, hidden_anime, mode_client
):
    """Indistinguishability is the property being protected. A 403 would leak
    the entry's existence as surely as a 200."""
    c = mode_client(MODE_NORMAL)
    missing = c.get("/api/anime/00000000-0000-0000-0000-000000000000")
    hidden = c.get(f"/api/anime/{hidden_anime.system_id}")
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json()["detail"] == missing.json()["detail"]


def test_restricted_sources_are_withheld_in_safe_and_present_in_normal(
    db_session, sample_anime, restricted_source, mode_client
):
    safe = mode_client(MODE_SAFE).get(f"/api/anime/{sample_anime.system_id}").json()
    normal = mode_client(MODE_NORMAL).get(f"/api/anime/{sample_anime.system_id}").json()
    assert not [s for s in safe["sources"] if s["bucket"] == "restricted"]
    assert [s for s in normal["sources"] if s["bucket"] == "restricted"]


def test_a_denial_subtracts_one_label_from_a_wide_mode(
    db_session, nsfw_label, hidden_anime, mode_client
):
    """An account holding `borderline` MINUS nsfw sees exactly what `normal`
    sees, without anyone having created a mode for it."""
    c = mode_client(MODE_BORDERLINE, denials=(nsfw_label.key,))
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_revoking_the_grant_cascades_the_denial_away(
    db_session, admin_user, nsfw_label, grant_mode
):
    grant = grant_mode(admin_user, MODE_BORDERLINE, denials=(nsfw_label.key,))
    db_session.delete(grant)
    db_session.flush()
    assert (
        db_session.query(models.UserAccessModeDenial)
        .filter(models.UserAccessModeDenial.user_access_mode_id == grant.system_id)
        .count()
        == 0
    )


def test_revoking_a_live_sessions_mode_resolves_to_nothing_not_to_the_default(
    db_session, admin_user, nsfw_label, hidden_anime, mode_client, grant_mode
):
    """Matrix row 6. Delete the grant while the cookie is live: the next
    request must see NOTHING, not fall back to the account's default mode."""
    c = mode_client(MODE_BORDERLINE)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200

    db_session.query(models.UserAccessMode).delete()
    db_session.flush()
    cache.bump()

    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_a_guest_sees_nothing_labelled_when_no_mode_is_flagged(
    db_session, client, nsfw_label, hidden_anime
):
    db_session.query(models.AccessMode).update({"is_guest_default": False})
    db_session.flush()
    cache.bump()
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404


def test_a_superuser_sitting_in_safe_does_not_see_a_labelled_entry(
    db_session, admin_user, nsfw_label, hidden_anime, mode_client
):
    """Matrix row 7 - the test that proves the two axes are independent.

    admin_user is on the `admin` role, which is is_superuser=True. Under the
    old model its short-circuit reached every label and this could not have
    been written. Now is_superuser means "holds every CAPABILITY permission"
    and says nothing about which objects a session reaches.
    """
    assert db_session.get(models.Role, admin_user.role_id).is_superuser is True
    c = mode_client(MODE_SAFE, user=admin_user)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404
```

- [ ] **Step 2: Add the fixtures to `tests/api/conftest.py`**

`mode_client` is the one that carries the weight; `super_user` / `super_client`
pay off the post-Phase-A audit's item 4 (Phase A built a super account inline
in five files).

```python
@pytest.fixture
def access_modes(db_session):
    """The four seeded modes. Any test touching the object axis needs these,
    and create_all does not run the lifespan."""
    from app.services.rbac.seed_modes import ensure_access_mode_seed

    ensure_access_mode_seed(db_session)
    rbac_cache.bump()


@pytest.fixture
def mode(db_session, access_modes):
    def _get(key):
        return (
            db_session.query(models.AccessMode)
            .filter(models.AccessMode.key == key)
            .one()
        )

    return _get


@pytest.fixture
def grant_mode(db_session, mode):
    """Give `user` a mode, optionally minus some of its labels.

    Denials name label KEYS, not ids, because that is what a test can read.
    """

    def _grant(user, mode_key, denials=(), is_default=False):
        row = models.UserAccessMode(
            user_id=user.id, mode_id=mode(mode_key).system_id, is_default=is_default
        )
        db_session.add(row)
        db_session.flush()
        for key in denials:
            label = (
                db_session.query(models.ContentLabel)
                .filter(models.ContentLabel.key == key)
                .one()
            )
            db_session.add(
                models.UserAccessModeDenial(
                    user_access_mode_id=row.system_id, label_id=label.system_id
                )
            )
        db_session.flush()
        rbac_cache.bump()
        return row

    return _grant


@pytest.fixture
def mode_client(db_session, admin_user, grant_mode):
    """A client logged in as `user` (default: admin_user) sitting in `mode_key`.

    The mode travels in the token claim exactly as it does in production, so
    these tests exercise the real resolution path rather than a Viewer built
    by hand.
    """

    def _client(mode_key, user=None, denials=()):
        user = user or admin_user
        grant = grant_mode(user, mode_key, denials=denials)

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        token = create_access_token(
            {"sub": user.username, "role": user.role, "mode": str(grant.mode_id)}
        )
        c = TestClient(app)
        c.cookies.set("access_token", f"Bearer {token}")
        return c

    yield _client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def super_user(db_session):
    """An account on the `super` role: both manage.* and no admin.authz.

    Extracted here because Phase A built this inline in five files -
    test_authz_router_gates, test_capability_dependencies,
    test_catalog_router_gates, test_me_is_admin and test_pipeline_router_gates.
    """
    user = models.User(
        id=uuid.uuid4(),
        username="superuser",
        hashed_password=get_password_hash("testpass"),
        role_id=role_id_for(db_session, "super"),
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture(scope="function")
def super_client(db_session, super_user):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    token = create_access_token({"sub": super_user.username, "role": "super"})
    with TestClient(app) as c:
        c.cookies.set("access_token", f"Bearer {token}")
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def restricted_source(db_session, sample_anime):
    """One media_source row in the `restricted` bucket - the single thing that
    separates `safe` from `normal`."""
    row = models.MediaSource(
        media_id=sample_anime.system_id,
        bucket="restricted",
        label="Restricted",
        url="https://example.invalid/restricted",
    )
    db_session.add(row)
    db_session.flush()
    return row
```

Check `models.MediaSource`'s actual column names in
`app/models/media_source.py` before writing `restricted_source` — the fields
above are the shape, not a quotation.

Then **re-point the five files that built a super account inline** — Phase A
left the same fixture duplicated in `test_authz_router_gates.py`,
`test_capability_dependencies.py`, `test_catalog_router_gates.py`,
`test_me_is_admin.py` and `test_pipeline_router_gates.py`. Post-Phase-A audit
item 4 asks for exactly this, and doing it here rather than later is what makes
task 9's pipeline-test changes a one-line fixture edit instead of five.

Also give `make_viewer` a `mode` argument, defaulting to `None`, that adds the
`"mode"` claim when given. Roughly 26 files call `make_viewer`; the default
keeps every one of them compiling, and only those asserting on labels or field
groups need the new argument.

- [ ] **Step 3: Run the new tests and watch them fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_access_modes.py -q`
Expected: FAIL. The label tests fail because `hidden_label_ids` still asks
`viewer.has(label_perm(key))` and the mode grants nothing on the role axis;
the superuser test fails because `is_superuser` still short-circuits.

- [ ] **Step 4: Flip `hidden_label_ids`**

In `app/services/rbac/enforcement.py`:

```python
def hidden_label_ids(db: Session, viewer: Viewer) -> list[UUID]:
    """
    content_label rows the viewer's ACTIVE MODE does not carry.

    An empty list is the overwhelmingly common case - no labels defined, or a
    mode carrying them all - and every caller short-circuits on it, so the
    feature costs one cheap query when unused and nothing at all for a session
    in `unrestricted`.

    No is_superuser short-circuit. That is the whole point of Phase B: holding
    every capability says nothing about which objects this SESSION reaches, so
    an admin sitting in `safe` is narrowed like anybody else.
    """
    visible = viewer.visible_label_ids
    return [
        system_id
        for (system_id,) in db.query(models.ContentLabel.system_id).all()
        if system_id not in visible
    ]
```

Then remove the `or viewer.is_superuser` from the three guards that gate on
labels — `apply_entry_visibility`, `apply_media_visibility`, `entry_visible`
and `filter_visible_pairs`.

**Careful, and this is the subtle part.** Those four functions short-circuit on
`viewer is None or viewer.is_superuser` and the two halves do different jobs.
`viewer is None` must **stay**: internal callers pass `None` deliberately and
`_factory._finish(db, entry, viewer=None)` relies on it. Only the
`is_superuser` half goes. The media-type half of each guard still reads
`viewer.has(media_type_perm(...))`, which is correct — `media_type.*` stays on
the role axis, and `has()` still short-circuits on `is_superuser`, which is
what keeps a super account able to see every type.

- [ ] **Step 5: Flip `field_gate._withheld`**

```python
def _withheld(viewer: Optional[Viewer]):
    """Groups the viewer's ACTIVE MODE does not carry.

    A None viewer withholds nothing: internal callers pass None to mean "not a
    request", and blanking their fields would corrupt a pipeline's view of the
    row rather than protect anybody. Only the is_superuser short-circuit is
    gone - field groups left the role axis, so holding every capability no
    longer reaches them.
    """
    if viewer is None:
        return ()
    held = viewer.field_groups
    return tuple(group for group in FIELD_GROUPS.values() if group.key not in held)
```

- [ ] **Step 6: Move `note.py`'s field-group check**

`app/routers/note.py:282` reads
`viewer.has(field_group_perm("personal_notes"))`. That helper dies in task 8,
and the permission it names no longer exists. Replace with:

```python
            or "personal_notes" not in viewer.field_groups
```

Keep the surrounding condition and the message as they are — the status code
on that line changes in task 12, not here. One task, one reason.

- [ ] **Step 7: Re-point the tests that granted the two families**

Run this to find them:

```bash
grep -rn "label\.\|field_group\." tests/ --include=*.py | grep -v "field_groups.py"
```

The files the audit expects: `test_field_gating.py`, `test_visibility.py`,
`test_visibility_aggregates.py`, `test_note_scope_reads.py`, `test_profile.py`,
`test_sources_gated_replace.py`, `test_media_type_gating.py`,
`test_write_binding.py`, `test_rbac_core.py`, `test_rbac_admin_api.py`,
`tests/unit/test_rbac_permissions.py`, `tests/unit/test_rbac_seed.py`.

Each break is **signal, never noise**. A test that granted `label.nsfw` to a
role was asserting the old model; re-point it at a mode with `mode_client`, do
not silence it. A test that asserted `field_group.*` appears in
`/api/auth/me`'s `permissions` **keeps passing** — task 9 makes `/me` publish
those entries from the mode, and the contract is deliberately unchanged.

- [ ] **Step 8: Run the whole suite**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/ruff.exe check . ; POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest -q`
Expected: green. Expect to iterate here — 28 test files touch `is_admin`,
`field_group` or `is_superuser`. Budget real time: this step alone is several
suite runs at ~5.5 minutes each.

- [ ] **Step 9: Commit**

```bash
git add app/services/rbac/enforcement.py app/services/rbac/field_gate.py app/routers/note.py tests/api/conftest.py tests/api/test_access_modes.py <each re-pointed test file, named>
git commit -m "feat(authz): both gates read the active access mode"
```

---

### Task 7: Delete `label_perm()` and `field_group_perm()`

**Files:**
- Modify: `app/services/rbac/permissions.py`, `app/services/rbac/seed.py`, `app/routers/roles.py`, `app/routers/content_labels.py`
- Test: `tests/unit/test_rbac_permissions.py` (amend)

**Why this is a task and not a tidy-up:** any call site still asking
`viewer.has(field_group_perm(k))` would silently answer `True` for a superuser
— a wrong answer no test would obviously catch. Removing the helpers turns
every stale call into an `ImportError`. A break that stops the build beats a
behaviour that quietly changes.

**Interfaces:**
- Consumes: task 6 having moved every real call site.
- Produces: `static_catalog()` and `catalog()` no longer contain
  `field_group.*` or `label.*`; `FAMILY_FIELD_GROUP` and `FAMILY_LABEL` leave
  `PERMISSION_FAMILIES`; `ContentLabelResponse` loses its `permission` field.

- [ ] **Step 1: Write the failing test**

```python
# in tests/unit/test_rbac_permissions.py
def test_the_object_families_are_not_grantable_to_a_role():
    """Object scoping left the role axis in Phase B. Permission resolution is
    a UNION and a union can only add - so if field_group.sources_restricted
    stayed grantable on a role, no mode could ever take it away and the narrow
    tiers would be unbuildable."""
    from app.services.rbac import permissions

    assert not hasattr(permissions, "label_perm")
    assert not hasattr(permissions, "field_group_perm")
    assert not any(p.startswith(("label.", "field_group.")) for p in permissions.static_catalog())


def test_the_families_tuple_no_longer_lists_them():
    from app.services.rbac.permissions import PERMISSION_FAMILIES

    assert "label" not in PERMISSION_FAMILIES
    assert "field_group" not in PERMISSION_FAMILIES
```

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/unit/test_rbac_permissions.py -q`
Expected: FAIL on both.

- [ ] **Step 3: Delete the helpers and the families**

In `permissions.py`: delete `label_perm`, `field_group_perm`,
`FAMILY_FIELD_GROUP`, `FAMILY_LABEL`, `label_catalog`; drop both from
`PERMISSION_FAMILIES` and from `static_catalog()`; simplify `catalog()`, which
no longer needs a `Session` for the label half — **keep its signature**, since
`is_valid(db, permission)` and `roles.py` both call it, and changing two things
at once is how a task grows a defect.

Update the module docstring: the paragraph beginning "The one exception is the
label family" describes a thing that is no longer true, and leaving it is worse
than deleting it.

- [ ] **Step 4: Stop seeding field groups on roles**

In `seed.py`, `default_guest_permissions()` drops its field-group half and
becomes media types only; `GUEST_WITHHELD_FIELD_GROUPS` (task 2's alias) goes
with it. Update the module docstring, which currently explains the guest
field-group rule at length.

- [ ] **Step 5: Stop offering them in the role editor**

In `roles.py`'s `/catalog`, delete the `FAMILY_FIELD_GROUP` and `FAMILY_LABEL`
entries and the now-unused `labels` query. Add a one-line comment saying where
they went, so the next reader of the roles page is not left guessing:

```python
    # Content labels and field groups are NOT here. They are the access-mode
    # axis (app/services/rbac/modes.py) and are granted on /access-modes.
```

In `content_labels.py`, drop `permission=label_perm(row.key)` from
`_to_response` and the field from `schemas.ContentLabelResponse`. Check
`frontend/src/` for a consumer of that field before removing it; if one exists,
**stop and report** rather than editing the SPA — the SPA is Phase D.

- [ ] **Step 6: Run the suite**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/ruff.exe check . ; POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest -q`
Expected: green. Any `ImportError` here is this task working as designed —
fix the call site, do not re-add the helper.

- [ ] **Step 7: Commit**

```bash
git add app/services/rbac/permissions.py app/services/rbac/seed.py app/routers/roles.py app/routers/content_labels.py app/schemas.py tests/unit/test_rbac_permissions.py
git commit -m "refactor(authz): delete label_perm and field_group_perm"
```

---

### Task 8: `/api/auth/me` serves field groups from the mode

**Files:**
- Modify: `app/routers/auth.py`
- Test: `tests/api/test_me_access_mode.py`

**The contract does not change.** `/me` goes on publishing `field_group.*`
entries in `permissions`, computed from the active mode minus denials instead
of from the role's grants. Every `has("field_group.system_info")` already
written in the SPA keeps working untouched — which is what lets Phase B ship
without touching the frontend at all.

**Interfaces:**
- Consumes: `Viewer.field_groups`, `Viewer.mode_key`, `Viewer.mode_id`.
- Produces: `permissions` = role permissions ∪ `{f"field_group.{k}" for k in viewer.field_groups}`; a new `mode` object `{id, key}`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_me_access_mode.py
"""/api/auth/me after the axis split.

The `permissions` list keeps publishing field_group.* strings even though they
are no longer role permissions - the SPA has hundreds of has() calls against
them and the whole point of Phase B's frontend cost being zero is that this
contract holds.
"""

from app.services.rbac.seed_modes import MODE_NORMAL, MODE_SAFE


def test_field_groups_still_appear_in_permissions(mode_client):
    body = mode_client(MODE_NORMAL).get("/api/auth/me").json()
    assert "field_group.sources_restricted" in body["permissions"]


def test_safe_withholds_restricted_sources_from_the_payload(mode_client):
    body = mode_client(MODE_SAFE).get("/api/auth/me").json()
    assert "field_group.sources_restricted" not in body["permissions"]
    assert "field_group.credits" in body["permissions"]


def test_the_active_mode_is_published(mode_client):
    body = mode_client(MODE_SAFE).get("/api/auth/me").json()
    assert body["mode"]["key"] == MODE_SAFE


def test_labels_stay_out_of_the_payload(mode_client, nsfw_label):
    """They scope whole entries server-side; the browser never needs them,
    and publishing them would tell a narrowed session what it is missing."""
    body = mode_client(MODE_NORMAL).get("/api/auth/me").json()
    assert not [p for p in body["permissions"] if p.startswith("label.")]


def test_a_guest_gets_the_guest_default_modes_groups(client):
    body = client.get("/api/auth/me").json()
    assert body["mode"]["key"] == MODE_SAFE
    assert "field_group.sources_restricted" not in body["permissions"]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_me_access_mode.py -q`
Expected: FAIL — `field_group.*` is absent from `permissions` (task 7 removed
the grants) and there is no `mode` key.

- [ ] **Step 3: Compose the payload from both axes**

```python
    return {
        "is_admin": viewer.has(PERM_MANAGE_CATALOG),
        "username": viewer.username,
        "role": viewer.role_name,
        "is_superuser": viewer.is_superuser,
        # Two axes, one list, deliberately. The role half answers "what may
        # this account DO"; the field_group.* half answers "which fields of a
        # reachable entry may this SESSION see" and comes from the active mode
        # minus its denials. They are merged here because the SPA has hundreds
        # of has() calls that predate the split and must keep working; the
        # server never merges them anywhere else.
        "permissions": sorted(
            set(viewer.permissions)
            | {f"field_group.{key}" for key in viewer.field_groups}
        ),
        # Labels are NOT published. They scope whole entries server-side, and
        # listing them would tell a narrowed session exactly what it is missing.
        "mode": {"id": str(viewer.mode_id) if viewer.mode_id else None,
                 "key": viewer.mode_key},
    }
```

The `f"field_group.{key}"` literal is deliberate: `field_group_perm()` is gone,
and re-introducing a helper for one call site would invite exactly the stale
call the deletion was meant to prevent. If a third call site ever appears,
that is the moment to name a constant.

The list of modes this account holds, each flagged with whether switching
would need the password, is **Phase D** — it exists for the switcher, and there
is no switcher yet. Do not add it here.

- [ ] **Step 4: Run the test, then the suite**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_me_access_mode.py -q`
Expected: 5 passed.

Run: the full suite plus ruff. `tests/api/test_me_is_admin.py` and any test
asserting on the exact shape of `/me` will need the new `mode` key accounted
for.

- [ ] **Step 5: Commit**

```bash
git add app/routers/auth.py tests/api/test_me_access_mode.py <any amended /me test>
git commit -m "feat(authz): /api/auth/me serves field groups from the active mode"
```

---

### Task 9: The pipeline gate (decision 14)

**Files:**
- Modify: `app/services/rbac/modes.py`, `app/routers/data_control.py`, `app/routers/system.py`
- Test: `tests/api/test_pipeline_mode_gate.py`

**The rule:** `manage.pipelines` is unscoped on the object axis — a pipeline
sees and rewrites everything — and every route on `data_control.py` and
`system.py` therefore additionally requires the session's **active mode to be
unscoped**: to carry every row in `content_label` and every key in
`FIELD_GROUP_KEYS`.

**Computed, never a named mode.** Comparing against the key `unrestricted`
would silently widen the qualifying set the day someone edits that mode, and
would refuse an admin's own equivalent custom mode. Comparing against the two
full sets cannot do either.

**Why the refusal is 401, not 404:** the route's existence is not a secret, and
the caller is being told to widen — a thing they can act on. 404 is for the
object axis, where indistinguishability is the property being protected. See
decision 13.

**Interfaces:**
- Consumes: `Viewer.visible_label_ids`, `Viewer.field_groups`.
- Produces: `is_unscoped(db, viewer) -> bool`, `require_unscoped_mode` (a
  FastAPI dependency returning `Viewer`).

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_pipeline_mode_gate.py
"""Decision 14: a pipeline runs only from an unscoped session.

A pipeline's object set is EVERY entry, declared and not negotiable - a
partial Backup or a partial Pull is not a smaller version of the job, it is a
corrupt one. So the mode still only decides which objects an operation
reaches; it is the operation that refuses to run against a subset.
"""

import pytest

from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)

# Every route the two pipeline routers expose that a test can reach cheaply.
PIPELINE_ROUTES = [
    ("post", "/api/data-control/backup"),
    ("post", "/api/data-control/pull"),
    ("post", "/api/data-control/replace/all"),
]


@pytest.mark.parametrize("method,path", PIPELINE_ROUTES)
def test_a_narrowed_session_may_not_run_a_pipeline(mode_client, method, path, nsfw_label):
    """`normal` carries every field group but not the nsfw label, so it is
    scoped - and scoped is scoped, however narrowly."""
    response = getattr(mode_client(MODE_NORMAL), method)(path)
    assert response.status_code == 401


@pytest.mark.parametrize("method,path", PIPELINE_ROUTES)
def test_safe_may_not_either(mode_client, method, path, nsfw_label):
    assert getattr(mode_client(MODE_SAFE), method)(path).status_code == 401


def test_the_refusal_is_401_and_not_404(mode_client, nsfw_label):
    """401 means "you may not do this kind of thing right now" and the caller
    can act on it by widening. 404 is the object axis, where hiding the
    existence of the thing is the point."""
    response = mode_client(MODE_NORMAL).post("/api/data-control/backup")
    assert response.status_code == 401
    assert "mode" in response.json()["detail"].lower()


def test_an_unscoped_session_reaches_the_handler(mode_client, nsfw_label, monkeypatch):
    """`unrestricted` carries every label and every field group, so the gate
    passes and the request reaches the pipeline itself. Asserting "not 401" -
    the pipeline's own outcome is not this test's business.
    """
    response = mode_client(MODE_UNRESTRICTED).post("/api/data-control/backup")
    assert response.status_code != 401


def test_a_custom_mode_holding_everything_also_qualifies(
    db_session, admin_user, nsfw_label, mode_client
):
    """Computed, not a comparison against the key `unrestricted`. An admin's
    own equivalent mode must work, or the rule is really "be unrestricted"."""
    from app import models
    from app.services.rbac import cache
    from app.services.rbac.field_groups import FIELD_GROUP_KEYS

    custom = models.AccessMode(key="everything", label="Everything")
    db_session.add(custom)
    db_session.flush()
    db_session.add(
        models.AccessModeLabel(mode_id=custom.system_id, label_id=nsfw_label.system_id)
    )
    for key in FIELD_GROUP_KEYS:
        db_session.add(
            models.AccessModeFieldGroup(mode_id=custom.system_id, field_group_key=key)
        )
    db_session.flush()
    cache.bump()

    c = mode_client("everything")
    assert c.post("/api/data-control/backup").status_code != 401


def test_adding_a_label_narrows_a_previously_qualifying_mode(
    db_session, admin_user, mode_client
):
    """The edge the computed test exists for. A mode that carried every label
    yesterday does not carry the one minted today, and stops qualifying until
    somebody grants it - which is the fail-closed direction."""
    from app import models
    from app.services.rbac import cache

    c = mode_client(MODE_UNRESTRICTED)
    assert c.post("/api/data-control/backup").status_code != 401

    db_session.add(models.ContentLabel(key="gore", label="Gore"))
    db_session.flush()
    cache.bump()

    assert c.post("/api/data-control/backup").status_code == 401


def test_replace_one_on_a_hidden_entry_is_unreachable(mode_client, hidden_anime, nsfw_label):
    """The oracle decision 14 closes for free. POST
    /api/data-control/replace/anime/{id} answered 404 for a missing entry and
    200 "Successfully updated <display_name>." for a hidden one - a write, an
    existence oracle and a title leak in one answer. A caller who can reach
    the route has no hidden entries, so the oracle has no domain."""
    c = mode_client(MODE_NORMAL)
    response = c.post(f"/api/data-control/replace/anime/{hidden_anime.system_id}")
    assert response.status_code == 401
```

Verify the three paths in `PIPELINE_ROUTES` against `data_control.py` before
running — `/replace/all` and `/backup` are declared literally, but the
per-type routes are registered in a loop over `PIPELINES` and the names come
from `spec.key`.

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_pipeline_mode_gate.py -q`
Expected: FAIL — every narrowed call reaches its handler.

- [ ] **Step 3: Write the test and the dependency in `modes.py`**

```python
def is_unscoped(db: Session, viewer: Viewer) -> bool:
    """
    Whether this session's mode reaches EVERYTHING.

    Computed against the two full sets, never a comparison against the key
    `unrestricted`: editing that mode must not silently widen the set of
    sessions that qualify, and an admin's own equivalent custom mode must
    qualify. A label minted today narrows every mode that does not carry it,
    which is the fail-closed direction.
    """
    all_labels = {
        system_id for (system_id,) in db.query(models.ContentLabel.system_id)
    }
    return all_labels <= set(viewer.visible_label_ids) and set(
        FIELD_GROUP_KEYS
    ) <= set(viewer.field_groups)


def require_unscoped_mode(
    viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
) -> Viewer:
    """
    Gate a pipeline on the session's mode as well as its permissions.

    Decision 14. A pipeline's object set is EVERY entry: the sheet holds one
    version of the data and Backup overwrites every tab, so a per-viewer
    filter would write a PARTIAL sheet over the complete one and a Pull All
    would restore a partial database - silent data loss rather than the
    information leak it was meant to close. The permission is therefore
    unscoped, and this is what stops that being merely a trust assertion.

    This does NOT contradict decision 2. The mode still only decides which
    objects an operation reaches; it is the OPERATION that refuses to run
    against a subset, because a partial Backup is not a smaller version of the
    job. The test is the same subset comparison decision 3 uses for switching,
    with `required` fixed at everything. viewer.has(PERM_MANAGE_PIPELINES)
    answers the same in `safe` as in `unrestricted`.

    401, not 404: the route's existence is not a secret and the caller is
    being told to widen, which is a thing they can act on.
    """
    if not is_unscoped(db, viewer):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Running a pipeline requires an unscoped access mode. Switch "
                "to a mode that carries every content label and field group."
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )
    return viewer
```

- [ ] **Step 4: Wire it onto both routers**

`data_control.py:45` and `system.py:24` already carry
`dependencies=[Depends(require_manage_pipelines)]` at router level. Add the
second dependency beside it in both:

```python
    dependencies=[
        Depends(require_manage_pipelines),
        Depends(require_unscoped_mode),
    ],
```

Router level, not per handler, and for the reason the capability gate is there
too: `data_control.py` registers most of its routes in a loop over `PIPELINES`
rather than declaring handlers, so a per-handler gate would miss them silently
— which is exactly how the Replace-one oracle survived a year.

- [ ] **Step 5: Run the test file, then the suite**

Expect existing pipeline tests to fail: `test_pipeline_router_gates.py` and
anything driving Backup or Pull through `admin_client` now needs the client to
sit in an unscoped mode. Those are true failures of an out-of-date assumption —
give the fixtures a mode; do not weaken the gate.

- [ ] **Step 6: Commit**

```bash
git add app/services/rbac/modes.py app/routers/data_control.py app/routers/system.py tests/api/test_pipeline_mode_gate.py <amended pipeline tests>
git commit -m "feat(authz): pipelines run only from an unscoped session"
```

---

### Task 10: `note.py`'s status codes (decision 13)

**Files:**
- Modify: `app/routers/note.py` (five sites)
- Test: `tests/api/test_note_status_codes.py`

**Two answers, and 403 disappears.** `401` means *you may not do this kind of
thing* — a capability failure, matching what `require_permission` already
returns and the one error shape the SPA knows. `404` means *this object is not
yours to see* — the same not-found message a genuinely absent row gets,
because a 403 confirms the row exists exactly as surely as a 200 does.

**A correction to the spec, applied here deliberately.** Decision 13's table
assigns line 199 to 404. Line 199 is
`"Editing a catalogue note requires the manage.catalog permission."` — a
**capability** failure, so by decision 13's own rule it is a **401**. The
mapping below is what gets implemented; if the spec's line list is preferred,
that is a decision to take before starting this task, not during it.

| Line | Today | Becomes | Why |
|---|---|---|---|
| 178 | 403 "You may not write personal notes." | **401** | Lacking `self.personal_notes` — a capability. |
| 183 | 403 "Catalogue notes require the manage.catalog permission." | **401** | Capability. |
| 195 | 403 "That note belongs to someone else." | **404** | Object axis: confirms the note exists. |
| 199 | 403 "Editing a catalogue note requires the manage.catalog permission." | **401** | Capability, **not** 404 — see above. |
| 285 | 403 "That user's notes are not public." | **404** | Object axis: confirms the account and its list state. |

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_note_status_codes.py
"""Decision 13: two answers, and 403 disappears from note.py.

401 = you may not do this kind of thing (capability).
404 = this object is not yours to see (object axis), in the same words a
      genuinely absent row gets.
"""


def test_writing_a_personal_note_without_the_permission_is_401(
    client, make_viewer, sample_anime
):
    c = make_viewer(client, "nonotes", permissions={"media_type.anime"})
    response = c.post(
        "/api/notes/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "personal_reviews",
            "content": "x",
        },
    )
    assert response.status_code == 401


def test_writing_a_catalogue_note_without_manage_catalog_is_401(
    user_client, sample_anime
):
    response = user_client.post(
        "/api/notes/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "synopsis",
            "content": "x",
        },
    )
    assert response.status_code == 401


def test_editing_someone_elses_personal_note_is_404(
    db_session, user_client, admin_user, personal_note_by
):
    """404, not 403: a 403 confirms the note exists as surely as a 200 does."""
    note = personal_note_by(admin_user)
    response = user_client.patch(f"/api/notes/{note.system_id}", json={"content": "x"})
    assert response.status_code == 404


def test_editing_a_catalogue_note_without_manage_catalog_is_401(
    user_client, catalogue_note
):
    """A CAPABILITY failure, so 401 - this corrects decision 13's line list,
    which assigned 404. The caller is being told they may not edit catalogue
    notes at all, which is not a fact about this note."""
    response = user_client.patch(
        f"/api/notes/{catalogue_note.system_id}", json={"content": "x"}
    )
    assert response.status_code == 401


def test_reading_a_private_accounts_notes_is_404(user_client, admin_user):
    response = user_client.get(f"/api/notes/?username={admin_user.username}")
    assert response.status_code == 404


def test_no_403_is_reachable_from_this_router(user_client, sample_anime):
    """The property, asserted directly. Every refusal note.py can produce is
    now one of the two answers."""
    import app.routers.note as note_module
    import inspect

    assert "status_code=403" not in inspect.getsource(note_module)
```

`personal_note_by` and `catalogue_note` are new small fixtures — write them
beside the tests, not in `conftest.py`, until a second file needs them.

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_note_status_codes.py -q`
Expected: FAIL, all 403s.

- [ ] **Step 3: Change the five sites**

For the two 404s, use the router's own existing not-found wording so hidden
answers exactly as missing. Find it — `note.py` already 404s for a missing note
somewhere in `_get_or_404`; reuse that literal string rather than inventing a
second one, because two nearly-identical messages are themselves a weak oracle.

Add a comment at the top of the changed block explaining the two-answer rule in
one sentence, with a pointer to decision 13. A future reader restoring a 403
"for clarity" is the failure this comment prevents.

- [ ] **Step 4: Run the suite**

Existing note tests asserting 403 will fail. Re-point them; each is a true
statement about the old model.

- [ ] **Step 5: Commit**

```bash
git add app/routers/note.py tests/api/test_note_status_codes.py <amended note tests>
git commit -m "fix(authz): note.py answers 401 for capability and 404 for object"
```

---

### Task 11: Per-viewer `remark` (decision 12)

**Files:**
- Modify: `app/models/__init__.py`, `app/models/note.py`, `app/routers/_factory.py`, `app/routers/collection.py`, `app/routers/franchise.py`, `app/routers/series.py`, `app/services/domain/remark_field.py`
- Create: `alembic/versions/n1a2remarkauthor.py`
- Test: `tests/api/test_remark_per_viewer.py`

**Both halves land in ONE commit.** `remark` is a class-level
`column_property` and a scalar subquery cannot know who is asking, so it cannot
filter on `note.author_id`. Today a second account's remark is refused **loudly
by the database**. Relaxing `ix_note_one_remark_per_owner` without the read fix
would make it **accepted and then invisible** — a data-loss shape rather than a
limitation, and strictly worse than doing neither. The migration and the read
fix go in together or neither goes.

**Interfaces:**
- Consumes: `viewer_user_id(viewer)` (already in `resolver.py`).
- Produces: `attach_remark(db, owner_type, entry_or_entries, user_id)` in
  `app/services/domain/remark_field.py`, following the shape of
  `attach_list_fields` / `attach_link_fields` — one IN query for a whole page,
  never one per entry.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_remark_per_viewer.py
"""Decision 12: a remark belongs to its author.

The two assertions have to fail if either half of the change lands alone. The
index test fails without the migration; the read test fails without
attach_remark. That pairing is the point - a half-fix turns a loud refusal
into a silent one.
"""

from app import models


def test_two_accounts_may_each_hold_a_remark_on_one_entry(
    db_session, admin_user, plain_user, sample_anime
):
    """Without the relaxed index this raises IntegrityError on the second
    insert."""
    from app.services.domain.remark_field import upsert_remark

    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    upsert_remark(db_session, "anime", sample_anime.system_id, "theirs", plain_user.id)
    db_session.flush()

    assert (
        db_session.query(models.Note)
        .filter(
            models.Note.media_id == sample_anime.system_id,
            models.Note.section == "remark",
        )
        .count()
        == 2
    )


def test_each_viewer_reads_back_their_own(
    db_session, admin_client, user_client, admin_user, plain_user, sample_anime
):
    from app.services.domain.remark_field import upsert_remark

    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    upsert_remark(db_session, "anime", sample_anime.system_id, "theirs", plain_user.id)
    db_session.flush()

    path = f"/api/anime/{sample_anime.system_id}"
    assert admin_client.get(path).json()["remark"] == "mine"
    assert user_client.get(path).json()["remark"] == "theirs"


def test_a_viewer_with_no_remark_reads_null_not_someone_elses(
    db_session, user_client, admin_user, sample_anime
):
    """The failure mode a class-level column_property produces: one person's
    private assessment shown to everybody."""
    from app.services.domain.remark_field import upsert_remark

    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    db_session.flush()

    assert user_client.get(f"/api/anime/{sample_anime.system_id}").json()["remark"] is None


def test_the_list_endpoint_is_per_viewer_too(
    db_session, admin_client, user_client, admin_user, sample_anime
):
    """One IN query for the page, not one per entry - and the same filter."""
    from app.services.domain.remark_field import upsert_remark

    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    db_session.flush()

    def remark_for(c):
        rows = c.get("/api/anime/").json()
        return next(r["remark"] for r in rows if r["system_id"] == str(sample_anime.system_id))

    assert remark_for(admin_client) == "mine"
    assert remark_for(user_client) is None


def test_a_guest_reads_no_remark(client, db_session, admin_user, sample_anime):
    from app.services.domain.remark_field import upsert_remark

    upsert_remark(db_session, "anime", sample_anime.system_id, "mine", admin_user.id)
    db_session.flush()

    assert client.get(f"/api/anime/{sample_anime.system_id}").json()["remark"] is None
```

- [ ] **Step 2: Run it and watch it fail**

Run: `POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m pytest tests/api/test_remark_per_viewer.py -q`
Expected: FAIL — the first test raises `IntegrityError` on
`ix_note_one_remark_per_owner`; the rest return one account's remark to
everybody.

- [ ] **Step 3: Relax the index**

In `app/models/note.py`, change `ix_note_one_remark_per_owner` from per-owner
to per-owner-per-author by adding `author_id` to the index columns, and
**rewrite the comment block at lines 170-198** — it currently explains at
length why the index is per-owner and why the column_property depends on it.
Leaving that comment in place after inverting the rule is how the next reader
concludes the change was a mistake.

Write `alembic/versions/n1a2remarkauthor.py` (down_revision
`n1a1accessmode`): drop the index, recreate it with `author_id`. The downgrade
recreates the narrower index and **will fail if two accounts already hold a
remark on one owner** — say so in the docstring rather than leaving it to be
discovered.

- [ ] **Step 4: Replace the column_property with `attach_remark`**

In `app/models/__init__.py`, delete the `remark` `column_property` block for
both `_REMARK_MEDIA_OWNERS` and `_REMARK_TIER_OWNERS`, **and the LIMITATION
comment above it** — that comment ends "do not relax that index", which this
task deliberately does. Replace the block with a short note saying `remark` is
now attached per request by `attach_remark` and why a class-level property
could not be.

In `app/services/domain/remark_field.py`:

```python
def attach_remark(db: Session, owner_type: str, entries, user_id) -> None:
    """
    Set `remark` on one entry or a page of them, filtered to this viewer.

    `remark` is a personal-scope section, so it belongs to its author. It used
    to be a class-level column_property, which could not filter by author
    because a scalar subquery cannot know who is asking - so one person's
    private assessment was shown to everybody, and the database refused a
    second account's remark outright. See decision 12.

    One IN query for the whole page, never one per entry - the same rule
    attach_list_fields and attach_link_fields follow.

    A viewer with no remark, and a guest, get None. Not somebody else's.
    """
```

Set the attribute to `None` first for every entry, then overwrite from the
query: an entry the query does not match must read `None`, not keep whatever a
previous request left on a cached instance.

- [ ] **Step 5: Call it from the four read paths**

- `_factory.py::_finish` — beside the other `attach_*` calls, using
  `viewer_user_id(viewer)`. Covers the nine detail GETs and the four write
  routes that return through `_finish`.
- `_factory.py`'s list route — beside its own `attach_*` sequence, with the
  same `plan_user_id = viewer_user_id(viewer)` it already computes.
- `collection.py`, `franchise.py`, `series.py` — the three tier routers, whose
  responses declare `remark` too.

Then grep for other readers: `find_all_remarks`
(`app/services/domain/remarks.py`) and the Backup pipeline read `remark` off
the model. Those run as the installation, not as a viewer — decide explicitly
what they see and **write the decision in a comment**. Recommended: they keep
reading every remark by querying `note` directly, because a Backup that
silently dropped other accounts' remarks would lose data on the next Pull.
That is exactly the failure shape this task exists to prevent, one level up.

- [ ] **Step 6: Run the tests, the migration round trip, then the suite**

```bash
POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m alembic upgrade head
POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m alembic downgrade -1
POSTGRES_DB=anime_site_test_phaseb venv/Scripts/python.exe -m alembic upgrade head
```

Then the full suite. `remark` is read in a lot of places; expect breakage in
the Sheets tests and in `Delete.jsx`'s preview endpoint's tests.

- [ ] **Step 7: Commit — one commit, both halves**

```bash
git add app/models/note.py app/models/__init__.py app/services/domain/remark_field.py app/services/domain/remarks.py app/routers/_factory.py app/routers/collection.py app/routers/franchise.py app/routers/series.py alembic/versions/n1a2remarkauthor.py tests/api/test_remark_per_viewer.py <amended tests>
git commit -m "fix(authz): a remark belongs to its author"
```

If the read fix is not ready, **do not commit the index migration on its own.**

---

### Task 12: Docs, roadmap and progress

**Files:**
- Modify: `docs/authorization.md`, `docs/data-model.md`, `docs/api.md`, `docs/business-rules.md`, `docs/testing.md`, `docs/roadmap.md`, `docs/PROGRESS.md`, and the spec and this plan

Behaviour changed, so the docs change with it, and each carries a
`Last verified` line to bump. This is not paperwork: `docs/authorization.md` is
the page the next session is told to read before designing, and a stale one
sends them down a road that no longer exists.

- [ ] **Step 1: `docs/authorization.md`**

The page describes the four existing gates and a residuals list audited on
2026-09-11. Rewrite the label and field-group sections onto the mode axis; add
the resolution order verbatim; add decision 14's rule and its named residual
(a `super` in a qualifying session can read every title through a Replace All
stream — not a leak, because qualifying *means* the mode reaches every label).
Strike the residual about `PUT /me/list` (Phase 0) if it is still listed, and
check whether the community-aggregate residual changed shape now that
`hidden_label_ids` reads the mode — **it did not**, `community.py` still
applies neither gate, so the row stays.

- [ ] **Step 2: `docs/data-model.md`** — the five new tables, the relaxed
`ix_note_one_remark_per_owner`, and the removal of the two permission families
from `role_permission`.

- [ ] **Step 3: `docs/api.md`** — `/api/auth/me` gained a `mode` object;
`/api/content-labels` lost `permission`; the pipeline routes gained a second
gate and a new 401.

- [ ] **Step 4: `docs/business-rules.md`** — a remark belongs to its author.

- [ ] **Step 5: `docs/testing.md`** — the new fixtures (`mode_client`,
`grant_mode`, `super_client`) and the rule that `bump()` now clears three
caches.

- [ ] **Step 6: The three finishing edits, in this commit, unprompted**

1. `docs/roadmap.md` — a **Done** entry, newest first, in the style of the
   entries already there: what changed, *why* it was done that way, what was
   deliberately not done (the switcher, the admin page, the per-account panel —
   all Phase D), and any defect found on the way.
2. `docs/PROGRESS.md` — set Phase B to `done <sha>`, close questions 3, 4 and
   5, and record `anime_site_test_phaseb` as droppable.
3. The spec — mark Phase B done with its sha in "Implementation shape", the
   way Phases 0, A, A.1 and C already are. Mark this plan's phase done too.

- [ ] **Step 7: Commit**

```bash
git add docs/authorization.md docs/data-model.md docs/api.md docs/business-rules.md docs/testing.md docs/roadmap.md docs/PROGRESS.md docs/superpowers/specs/2026-09-10-authorization-redesign-design.md docs/superpowers/plans/2026-09-11-authz-phase-b-access-mode-axis.md
git commit -m "docs(authz): record Phase B"
```

---

## What Phase B deliberately does not do

Named here so that a reviewer does not read them as gaps:

- **No mode switcher.** `POST /api/auth/access-mode`, the subset test, the
  re-auth prompt and the preserved `exp` are all **Phase D** (spec section 3).
  Until then a session sits in whatever mode it logged in with.
- **No admin UI.** `/access-modes`, the per-account panel on `Users.jsx` and
  `PUT /api/users/{id}/access-modes` are Phase D (spec section 5). Modes exist
  and are enforced but can only be changed in the database — which is why the
  migration grants everyone `unrestricted`.
- **New accounts still do not get `safe` only.** Decision 4's rule is runtime
  code in `users.py`'s create handler, and it belongs with the panel that shows
  what an account holds. Phase D.
- **No frontend change at all.** `/api/auth/me`'s contract is preserved
  precisely so this is true. If a task makes you edit `frontend/src`, stop.
- **`media_type.*` stays on the role axis.** The one arguable boundary, decided
  in the spec: it says what an account is *for* rather than how careful this
  session is being.
- **The community aggregate is still not visibility-filtered.** A pre-existing
  accepted residual (`app/routers/community.py`), unchanged by Phase B and
  still listed in `docs/authorization.md`.

## Risks, and where they actually are

| Risk | Where | Mitigation in this plan |
|---|---|---|
| Mode state leaking between tests, producing random order-dependent failures | `_MODE_CACHE`, `_DENIAL_CACHE` | Task 4 extends the existing `bump()` rather than adding a second clear, and updates the autouse fixture's docstring. The spec calls this the likeliest source of a lost day. |
| A missed call site silently answering `True` for a superuser | anywhere still asking `has(field_group.*)` | Task 7 deletes both helpers, so a miss is an `ImportError`. |
| Half of decision 12 landing alone | `ix_note_one_remark_per_owner` | Task 11 is one commit with a test that fails for each half independently. |
| The migration breaking a from-empty upgrade later | `n1a1accessmode` | Frozen Core-SQL snapshot, no `app.models` import. Task 3 step 6 runs it from empty, both ways. |
| Task 6 sprawling | 28 test files touch the affected names | Expect several full suite runs. The breakage is signal; re-point, never silence. |
| Committing another session's work | shared branch | Name every file; never a directory pathspec; stage and commit with no gap. |

## Estimated time

Backend-only, and the suite is ~5.5 minutes. Twelve tasks at a minimum of two
suite runs each is a **~2 hour floor in test runs alone**. Task 6 realistically
needs four to six runs on its own. Budget **two working sessions**, and do not
start task 6 near the end of one — it is the task that leaves the tree
half-migrated if abandoned.
