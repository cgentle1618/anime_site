# Media Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four overlapping "source" mechanisms with one `media_source` table plus three vocabulary-backed tag fields, and add a second RBAC-gated bucket, Restricted Sources.

**Architecture:** `media_source` is a polymorphic child table shaped exactly like `media_credit` — `(media_type, entry_id)` with no foreign key, read back in a batched attach step and written through the existing `nested_collections` hook. Platform and reference vocabularies live in `system_option`, scoped per media type by the existing `SystemOptionScope` and split watch-vs-origin by a new parallel `SystemOptionUsage`.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL 17, Alembic, pytest; React + Vite, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-media-sources-design.md` — read it before Task 1. The plan argues from the spec; where they disagree, the spec wins.

## Global Constraints

- Python 3.13, backend lives under `app/`. Run backend tests with `venv/Scripts/python.exe -m pytest -q`; lint with `venv/Scripts/ruff.exe check .`.
- Frontend tests: `cd frontend && npm run test:run`; lint: `npm run lint`. **After any frontend change run `cd frontend && npm run build`** or the change is invisible on `:8000`.
- Alembic has a **single head**. Every migration in this plan must chain off the previous one in task order. Check `alembic heads` before writing a revision.
- Tailwind: semantic tokens only (`bg-surface`, `text-text-muted`). Hard-coded greys fail `src/theme-tokens.test.js`.
- Media type keys are **hyphenated** in the data layer (`anime-movie`, `tv-show`) and underscored in router filenames. Use `spec.owner_type` / `MEDIA_TYPE_KEYS`.
- **Other Claude Code sessions may be editing this working tree.** Never `git add -A`, never `git commit -a`, never `git stash`/`reset`/`checkout --`. Stage only the files your task names. Re-read a file if an edit fails to match.
- Never commit without the user's approval. Each task's commit step is written out; run it only when the user has said yes.
- Write the failing test first. `pytest`, `ruff`, `vitest`, `eslint` must all be green before a task is considered done.

## Decisions taken during planning

These refine the spec after reading the codebase. Flagged so they can be overturned on review:

1. **Naming follows `media_credit`:** `media_type`/`entry_id` (not `owner_type`/`owner_id`), `position` (not `sort_order`).
2. **`main` rows use `option_id` FK**, not a string key — matching `media_tag`. Mutually exclusive with `name` via `num_nonnulls(option_id, name) = 1`, exactly as `media_credit` separates `person_id` from `studio_id`.
3. **The sheet tab stores the option's `category` + `value` strings, not `option_id`** — option UUIDs differ per database; entry UUIDs do not.

## Execution waves

Tasks within a wave are independent and can be dispatched in parallel. Waves are sequential.

| Wave | Tasks |
|---|---|
| 1 | 1, 2, 3 |
| 2 | 4, 5 |
| 3 | 6, 7 |
| 4 | 8, 9 |
| 5 | 10 → 11 → 12 (strictly sequential — migration chain) |
| 6 | 13, 14, 15 |
| 7 | 16, 17 |
| 8 | 18 |

---

## Task 1: `SystemOptionUsage` model and migration

**Files:**
- Modify: `app/models/system.py` (after line 78)
- Create: `alembic/versions/<rev>_add_system_option_usage.py`
- Test: `tests/api/test_system_option_usage_model.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `models.SystemOptionUsage` with columns `id: int`, `option_id: UUID`, `usage: str`; `SystemOption.usages` relationship (list of `SystemOptionUsage`).

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_system_option_usage_model.py`:

```python
"""SystemOptionUsage mirrors SystemOptionScope: a child row per usage."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_usages_cascade_when_the_option_is_deleted(db_session):
    option = models.SystemOption(category="Platform", value="Netflix")
    option.usages = [models.SystemOptionUsage(usage="origin")]
    db_session.add(option)
    db_session.commit()

    db_session.delete(option)
    db_session.commit()

    assert db_session.query(models.SystemOptionUsage).count() == 0


def test_the_same_usage_cannot_be_recorded_twice(db_session):
    option = models.SystemOption(category="Platform", value="Fox")
    option.usages = [
        models.SystemOptionUsage(usage="origin"),
        models.SystemOptionUsage(usage="origin"),
    ]
    db_session.add(option)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_no_usage_rows_means_the_value_serves_both(db_session):
    option = models.SystemOption(category="Platform", value="Disney+")
    db_session.add(option)
    db_session.commit()

    assert option.usages == []
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_system_option_usage_model.py -q`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'SystemOptionUsage'`

- [ ] **Step 3: Add the model**

In `app/models/system.py`, add a `usages` relationship to `SystemOption` immediately after the existing `scopes` relationship (which ends at line 51):

```python
    usages = relationship(
        "SystemOptionUsage",
        back_populates="option",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
```

Then add the class after `SystemOptionScope` (after line 78):

```python
class SystemOptionUsage(Base):
    """
    Which roles a vocabulary value may be used in.

    Parallel to SystemOptionScope, which answers "in which media types". This
    answers "for what". The Platform category serves both the access rows on a
    media entry and the origin tag fields, and some values belong to only one:
    Fox and ABC are places a show first aired, never places to go and watch it.

    A value with no usage rows serves every usage.
    """

    __tablename__ = "system_option_usage"
    __table_args__ = (
        UniqueConstraint("option_id", "usage", name="uq_system_option_usage"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of app.utils.source_fields.OPTION_USAGES.
    usage = Column(String, nullable=False)

    option = relationship("SystemOption", back_populates="usages")
```

- [ ] **Step 4: Export it**

In `app/models/__init__.py`, add `SystemOptionUsage` beside the existing `SystemOptionScope` export (same import line and same `__all__` entry style).

- [ ] **Step 5: Write the migration**

Run `venv/Scripts/python.exe -m alembic heads` and use that revision as `down_revision`.

Create `alembic/versions/<rev>_add_system_option_usage.py`:

```python
"""add system_option_usage

Revision ID: su1s2a3g4e5
Revises: <current head>
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "su1s2a3g4e5"
down_revision = "<current head>"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "system_option_usage",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("usage", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["option_id"], ["system_option.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("option_id", "usage", name="uq_system_option_usage"),
    )
    op.create_index(
        "ix_system_option_usage_option_id",
        "system_option_usage",
        ["option_id"],
    )


def downgrade():
    op.drop_index("ix_system_option_usage_option_id", "system_option_usage")
    op.drop_table("system_option_usage")
```

- [ ] **Step 6: Run the migration and the tests**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m pytest tests/api/test_system_option_usage_model.py -q`
Expected: 3 passed

- [ ] **Step 7: Lint**

Run: `venv/Scripts/ruff.exe check .`
Expected: no new findings.

- [ ] **Step 8: Commit**

```bash
git add app/models/system.py app/models/__init__.py alembic/versions/su1s2a3g4e5_add_system_option_usage.py tests/api/test_system_option_usage_model.py
git commit -m "feat(options): system_option_usage table, parallel to scope" -- app/models/system.py app/models/__init__.py alembic/versions/su1s2a3g4e5_add_system_option_usage.py tests/api/test_system_option_usage_model.py
```

---

## Task 2: `MediaSource` model and migration

**Files:**
- Create: `app/models/media_source.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/<rev>_add_media_source.py`
- Test: `tests/api/test_media_source_model.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `models.MediaSource` with columns `system_id: UUID`, `media_type: str`, `entry_id: UUID`, `kind: str`, `bucket: str`, `option_id: UUID | None`, `name: str | None`, `available: bool | None`, `url: str | None`, `position: int`, `created_at: datetime`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_media_source_model.py`:

```python
"""media_source: one row per place an entry can be watched, read or looked up."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def _row(**kw):
    base = dict(
        media_type="anime",
        entry_id=uuid.uuid4(),
        kind="access",
        bucket="other",
        name="Some Site",
    )
    base.update(kw)
    return models.MediaSource(**base)


def test_a_free_form_row_carries_a_name_and_no_option(db_session):
    row = _row(url="https://example.test")
    db_session.add(row)
    db_session.commit()
    assert row.option_id is None
    assert row.position == 0


def test_a_row_cannot_carry_both_an_option_and_a_name(db_session):
    option = models.SystemOption(category="Platform", value="Netflix")
    db_session.add(option)
    db_session.flush()

    db_session.add(_row(bucket="main", option_id=option.system_id, name="Netflix"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_a_row_must_carry_one_of_them(db_session):
    db_session.add(_row(name=None))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_the_same_source_cannot_be_recorded_twice_on_one_entry(db_session):
    entry_id = uuid.uuid4()
    db_session.add(_row(entry_id=entry_id))
    db_session.add(_row(entry_id=entry_id))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_deleting_the_option_deletes_the_row(db_session):
    option = models.SystemOption(category="Platform", value="Bahamut")
    db_session.add(option)
    db_session.flush()
    db_session.add(_row(bucket="main", option_id=option.system_id, name=None))
    db_session.commit()

    db_session.delete(option)
    db_session.commit()

    assert db_session.query(models.MediaSource).count() == 0
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_media_source_model.py -q`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'MediaSource'`

- [ ] **Step 3: Write the model**

Create `app/models/media_source.py`:

```python
"""
Where an entry can be watched, read, or looked up.

Shaped like media_credit: no single foreign key can span the eight media
tables, so the (media_type, entry_id) pair is resolved at read time through
MEDIA_TABLES in app/utils/media_resolver.py.

Two axes, both plain strings so a value added in a newer version survives a
round trip through an older one:

  kind    access    somewhere to watch or read the work
          reference somewhere to read *about* it - a wiki, a database

  bucket  main       a vocabulary platform, pointed at by option_id
          other      free-form, gated by the sources_other field group
          restricted free-form, gated by sources_restricted

A row carries exactly one target: option_id for a vocabulary platform, name for
a free-form one. `available` is the tristate that used to be source_baha -
True available, False not, NULL unknown - and is meaningful only on main access
rows, because a wiki page either has a URL or it does not.
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
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class MediaSource(Base):
    __tablename__ = "media_source"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(option_id, name) = 1",
            name="ck_media_source_one_target",
        ),
        # nulls_not_distinct so two free-form rows with the same name on one
        # entry collide instead of both being stored - option_id is NULL on
        # both, and the default NULL-is-distinct rule would let them through.
        UniqueConstraint(
            "media_type",
            "entry_id",
            "kind",
            "bucket",
            "option_id",
            "name",
            name="uq_media_source_row",
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_media_source_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # MEDIA_TYPE_KEYS, hyphenated. No FK - see the module docstring.
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)

    kind = Column(String, nullable=False, index=True)
    bucket = Column(String, nullable=False, index=True)

    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name = Column(String, nullable=True)

    available = Column(Boolean, nullable=True)
    url = Column(String, nullable=True)

    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
```

- [ ] **Step 4: Export it**

In `app/models/__init__.py`, add beside the `media_credit` imports:

```python
from app.models.media_source import MediaSource  # noqa: F401
```

and add `"MediaSource"` to `__all__` if the file declares one.

- [ ] **Step 5: Write the migration**

Chain off Task 1's revision. Create `alembic/versions/<rev>_add_media_source.py`:

```python
"""add media_source

Revision ID: ms1o2u3r4c5e
Revises: su1s2a3g4e5
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "ms1o2u3r4c5e"
down_revision = "su1s2a3g4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "media_source",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("bucket", sa.String(), nullable=False),
        sa.Column("option_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("available", sa.Boolean(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(option_id, name) = 1",
            name="ck_media_source_one_target",
        ),
        sa.ForeignKeyConstraint(
            ["option_id"], ["system_option.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index("ix_media_source_system_id", "media_source", ["system_id"])
    op.create_index("ix_media_source_kind", "media_source", ["kind"])
    op.create_index("ix_media_source_bucket", "media_source", ["bucket"])
    op.create_index("ix_media_source_option_id", "media_source", ["option_id"])
    op.create_index(
        "ix_media_source_entry", "media_source", ["media_type", "entry_id"]
    )
    # NULLS NOT DISTINCT is not expressible through sa.UniqueConstraint in this
    # Alembic version, so the index is created by hand.
    op.execute(
        "CREATE UNIQUE INDEX uq_media_source_row ON media_source "
        "(media_type, entry_id, kind, bucket, option_id, name) "
        "NULLS NOT DISTINCT"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_media_source_row")
    op.drop_index("ix_media_source_entry", "media_source")
    op.drop_index("ix_media_source_option_id", "media_source")
    op.drop_index("ix_media_source_bucket", "media_source")
    op.drop_index("ix_media_source_kind", "media_source")
    op.drop_index("ix_media_source_system_id", "media_source")
    op.drop_table("media_source")
```

> **Verify before writing:** `NULLS NOT DISTINCT` needs PostgreSQL 15+. This project runs 17, so it is available. Confirm with `SELECT version();` if the `CREATE UNIQUE INDEX` fails.

- [ ] **Step 6: Run the migration and the tests**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m pytest tests/api/test_media_source_model.py -q`
Expected: 5 passed

- [ ] **Step 7: Lint and commit**

```bash
venv/Scripts/ruff.exe check .
git add app/models/media_source.py app/models/__init__.py alembic/versions/ms1o2u3r4c5e_add_media_source.py tests/api/test_media_source_model.py
git commit -m "feat(sources): media_source table" -- app/models/media_source.py app/models/__init__.py alembic/versions/ms1o2u3r4c5e_add_media_source.py tests/api/test_media_source_model.py
```

---

## Task 3: Source vocabulary constants

**Files:**
- Create: `app/utils/source_fields.py`
- Test: `tests/unit/test_source_fields.py`

**Interfaces:**
- Consumes: `MEDIA_TYPE_KEYS` from `app/utils/media_resolver.py`.
- Produces:
  - `SOURCE_KINDS: tuple[str, ...] = ("access", "reference")`
  - `SOURCE_BUCKETS: tuple[str, ...] = ("main", "other", "restricted")`
  - `FREE_FORM_BUCKETS: tuple[str, ...] = ("other", "restricted")`
  - `OPTION_USAGES: tuple[str, ...] = ("watch", "origin")`
  - `PLATFORM_CATEGORY: str = "Platform"`
  - `REFERENCE_CATEGORY: str = "Reference Source"`
  - `SERIALIZATION_CATEGORY: str = "Serialization Platform"`
  - `category_for_kind(kind: str) -> str`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_source_fields.py`:

```python
"""The source vocabulary is small, closed, and named in exactly one place."""

import pytest

from app.utils.source_fields import (
    FREE_FORM_BUCKETS,
    OPTION_USAGES,
    PLATFORM_CATEGORY,
    REFERENCE_CATEGORY,
    SOURCE_BUCKETS,
    SOURCE_KINDS,
    category_for_kind,
)


def test_free_form_buckets_are_a_subset_of_all_buckets():
    assert set(FREE_FORM_BUCKETS) < set(SOURCE_BUCKETS)


def test_main_is_the_only_vocabulary_bucket():
    assert set(SOURCE_BUCKETS) - set(FREE_FORM_BUCKETS) == {"main"}


@pytest.mark.parametrize(
    "kind,expected",
    [("access", PLATFORM_CATEGORY), ("reference", REFERENCE_CATEGORY)],
)
def test_each_kind_draws_from_its_own_category(kind, expected):
    assert category_for_kind(kind) == expected


def test_an_unknown_kind_is_rejected():
    with pytest.raises(KeyError):
        category_for_kind("nonsense")


def test_usages_are_the_two_the_platform_vocabulary_serves():
    assert OPTION_USAGES == ("watch", "origin")


def test_kinds_and_buckets_have_no_overlap():
    assert not set(SOURCE_KINDS) & set(SOURCE_BUCKETS)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_source_fields.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.source_fields'`

- [ ] **Step 3: Write the module**

Create `app/utils/source_fields.py`:

```python
"""
The closed vocabulary behind media_source.

Shaped like credit_roles.py: constants that code branches on live here, not in
system_option, so they cannot be renamed out from under the logic. The values
inside a category - Netflix, Bahamut, Wikipedia - are open vocabulary and do
live in system_option, managed on the admin Options page.
"""

# media_source.kind
SOURCE_KINDS: tuple[str, ...] = ("access", "reference")

# media_source.bucket
SOURCE_BUCKETS: tuple[str, ...] = ("main", "other", "restricted")

# The buckets whose rows carry a typed name instead of an option_id. These are
# the gated ones - see FIELD_GROUPS in app/services/rbac/field_groups.py.
FREE_FORM_BUCKETS: tuple[str, ...] = ("other", "restricted")

# system_option_usage.usage. A value with no usage rows serves both.
OPTION_USAGES: tuple[str, ...] = ("watch", "origin")

# system_option categories.
PLATFORM_CATEGORY = "Platform"
REFERENCE_CATEGORY = "Reference Source"
SERIALIZATION_CATEGORY = "Serialization Platform"

_CATEGORY_BY_KIND: dict[str, str] = {
    "access": PLATFORM_CATEGORY,
    "reference": REFERENCE_CATEGORY,
}


def category_for_kind(kind: str) -> str:
    """The system_option category a main row of this kind draws from."""
    return _CATEGORY_BY_KIND[kind]
```

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_source_fields.py -q`
Expected: 6 passed

- [ ] **Step 5: Register the new categories**

In `app/utils/credit_roles.py`, `OPTION_CATEGORIES` (line 153) is derived from `TAG_FIELDS` plus `FILTER_ONLY_CATEGORIES`. `Platform` and `Reference Source` are used by `media_source`, not by a `TagField`, so they will not appear. Add them to `FILTER_ONLY_CATEGORIES` (line 133) — that constant already means "a vocabulary with no `TagField` behind it":

```python
FILTER_ONLY_CATEGORIES: tuple[str, ...] = (
    "Franchise for Filter",
    # Drawn on by media_source rows rather than by a TagField.
    "Platform",
    "Reference Source",
)
```

> Note: `Platform` also backs the `original_source` and `exclusive_source` tag fields added in Task 9, so it will be reachable through `TAG_FIELDS` too once that lands. `dict.fromkeys` in `OPTION_CATEGORIES` dedupes, so listing it twice is harmless.

- [ ] **Step 6: Run the full unit suite and lint**

Run: `venv/Scripts/python.exe -m pytest tests/unit -q && venv/Scripts/ruff.exe check .`
Expected: all pass. If `tests/unit/test_retire_orphan_option_categories.py` fails, it is asserting that no live category is retired — the new categories are live, so that is the correct outcome and needs no change.

- [ ] **Step 7: Commit**

```bash
git add app/utils/source_fields.py app/utils/credit_roles.py tests/unit/test_source_fields.py
git commit -m "feat(sources): source kind/bucket vocabulary constants" -- app/utils/source_fields.py app/utils/credit_roles.py tests/unit/test_source_fields.py
```

---

## Task 4: `usage` on the options API

**Files:**
- Modify: `app/schemas/system.py:30-68`
- Modify: `app/routers/options.py:30-212`
- Test: `tests/api/test_options_router.py` (extend)

**Interfaces:**
- Consumes: `models.SystemOptionUsage` (Task 1), `OPTION_USAGES` (Task 3).
- Produces: `SystemOptionCreate.usages: list[str]`, `SystemOptionResponse.usages: list[str]`, and a `usage` query parameter on both option GET endpoints.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_options_router.py`:

```python
def test_create_records_usages(admin_client):
    r = admin_client.post(
        "/api/options/",
        json={
            "category": "Platform",
            "value": "Fox",
            "scopes": ["tv-show"],
            "usages": ["origin"],
        },
    )
    assert r.status_code == 200
    assert r.json()["usages"] == ["origin"]


def test_an_unknown_usage_is_rejected(admin_client):
    r = admin_client.post(
        "/api/options/",
        json={"category": "Platform", "value": "Bad", "usages": ["streaming"]},
    )
    assert r.status_code == 422


def test_reading_a_category_filters_by_usage(client, admin_client):
    admin_client.post(
        "/api/options/",
        json={"category": "Platform", "value": "ABC", "usages": ["origin"]},
    )
    admin_client.post(
        "/api/options/", json={"category": "Platform", "value": "Netflix"}
    )

    values = [o["value"] for o in client.get("/api/options/Platform?usage=watch").json()]
    assert "Netflix" in values
    assert "ABC" not in values


def test_an_unrestricted_value_serves_every_usage(client, admin_client):
    admin_client.post(
        "/api/options/", json={"category": "Platform", "value": "Prime Video"}
    )
    for usage in ("watch", "origin"):
        values = [
            o["value"] for o in client.get(f"/api/options/Platform?usage={usage}").json()
        ]
        assert "Prime Video" in values


def test_update_replaces_the_usage_set(admin_client):
    created = admin_client.post(
        "/api/options/",
        json={"category": "Platform", "value": "HBO Max", "usages": ["origin"]},
    ).json()

    r = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={
            "category": "Platform",
            "value": "HBO Max",
            "sort_order": 0,
            "remark": None,
            "scopes": [],
            "usages": [],
        },
    )
    assert r.status_code == 200
    assert r.json()["usages"] == []
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_options_router.py -q -k usage`
Expected: FAIL — the `usages` key is dropped, so `KeyError` / assertion failures.

- [ ] **Step 3: Extend the schemas**

In `app/schemas/system.py`, add to `SystemOptionCreate` (after the `scopes` validator, line 53):

```python
    # Roles this value may be used in. Empty = every usage.
    usages: list[str] = []

    @field_validator("usages")
    @classmethod
    def _known_usages(cls, v: list[str]) -> list[str]:
        from app.utils.source_fields import OPTION_USAGES

        unknown = [u for u in v if u not in OPTION_USAGES]
        if unknown:
            raise ValueError(
                "Not usages: " + ", ".join(unknown)
                + ". Expected any of: " + ", ".join(OPTION_USAGES)
            )
        return list(dict.fromkeys(v))
```

And to `SystemOptionResponse` (after `_flatten_scopes`, line 68):

```python
    usages: list[str] = []

    @field_validator("usages", mode="before")
    @classmethod
    def _flatten_usages(cls, v):
        # ORM gives SystemOptionUsage rows; the API contract is plain strings.
        if v and not isinstance(v[0], str):
            return [u.usage for u in v]
        return v
```

- [ ] **Step 4: Extract the filter helper in the router**

`app/routers/options.py` duplicates the scope predicate at lines 46-54 and 85-93. Replace both with one helper. Add near the top of the file, after the imports:

```python
def _filter_by_child(query, relation, column, value):
    """
    Narrow to options that either declare no child rows at all, or declare one
    matching `value`. Used for both scope and usage: an option that names
    neither is offered everywhere, for everything.
    """
    if not value:
        return query
    return query.filter(or_(~relation.any(), relation.any(column == value)))
```

Then in `get_all_system_options` (line 30) and `get_system_options` (line 68), replace the inline `if scope:` block with:

```python
    query = _filter_by_child(
        query, models.SystemOption.scopes, models.SystemOptionScope.scope, scope
    )
    query = _filter_by_child(
        query, models.SystemOption.usages, models.SystemOptionUsage.usage, usage
    )
```

and add the parameter to both signatures:

```python
    usage: Optional[str] = Query(None),
```

- [ ] **Step 5: Write usages on create and update**

In `add_system_option` (line 130), after the `new_option.scopes = [...]` line:

```python
    new_option.usages = [
        models.SystemOptionUsage(usage=u) for u in payload.usages
    ]
```

In `update_system_option`, after the existing scope delete-then-insert at lines 203-207 — copy the pattern exactly, for the reason the comment at lines 188-202 gives:

```python
    db.query(models.SystemOptionUsage).filter_by(option_id=option_id).delete(
        synchronize_session=False
    )
    for usage in payload.usages:
        db.add(models.SystemOptionUsage(option_id=option_id, usage=usage))
```

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_options_router.py -q`
Expected: all pass, including the pre-existing scope tests — the helper must not have changed their behaviour.

- [ ] **Step 7: Lint and commit**

```bash
venv/Scripts/ruff.exe check .
git add app/schemas/system.py app/routers/options.py tests/api/test_options_router.py
git commit -m "feat(options): usage axis alongside scope" -- app/schemas/system.py app/routers/options.py tests/api/test_options_router.py
```

---

## Task 5: The sources domain service

**Files:**
- Create: `app/services/domain/sources.py`
- Test: `tests/api/test_sources_service.py`

**Interfaces:**
- Consumes: `models.MediaSource`, `models.SystemOption` (Tasks 1-2), `app/utils/source_fields` (Task 3), `resolve_option` from `app/services/domain/credits.py`.
- Produces:
  - `attach_sources(db, media_type, entries, viewer=None) -> None` — sets `entry.sources: list[SourceRef]` in place, batched.
  - `replace_sources(db, media_type, entry_id, payload: list[dict]) -> None` — whole-set replace, does not commit.
  - `delete_sources_for(db, media_type, entry_id) -> int`
  - `write_media_sources(db, entry, value) -> None` — the `nested_collections` adapter.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_sources_service.py`:

```python
"""Reading and writing an entry's media_source rows."""

import uuid

from app import models
from app.services.domain.sources import (
    attach_sources,
    delete_sources_for,
    replace_sources,
)


def _option(db, value, category="Platform"):
    option = models.SystemOption(category=category, value=value)
    db.add(option)
    db.flush()
    return option


def test_attaching_to_an_entry_with_no_sources_gives_an_empty_list(
    db_session, sample_anime
):
    attach_sources(db_session, "anime", sample_anime)
    assert sample_anime.sources == []


def test_a_main_row_reports_its_option_value(db_session, sample_anime):
    option = _option(db_session, "Netflix")
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="main",
            option_id=option.system_id,
            available=True,
            url="https://netflix.test/1",
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    (row,) = sample_anime.sources
    assert row.name == "Netflix"
    assert row.kind == "access"
    assert row.bucket == "main"
    assert row.available is True
    assert row.url == "https://netflix.test/1"


def test_a_free_form_row_reports_its_typed_name(db_session, sample_anime):
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="restricted",
            name="Some Site",
            url="https://example.test",
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    (row,) = sample_anime.sources
    assert row.name == "Some Site"
    assert row.bucket == "restricted"


def test_attach_batches_across_entries(db_session, sample_anime):
    """One query for rows, one for options - not one per entry."""
    option = _option(db_session, "Bahamut")
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="main",
            option_id=option.system_id,
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", [sample_anime])
    assert len(sample_anime.sources) == 1


def test_replace_is_a_whole_set_replace(db_session, sample_anime):
    _option(db_session, "Netflix")
    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [{"kind": "access", "bucket": "other", "name": "First", "url": None}],
    )
    db_session.commit()

    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [{"kind": "access", "bucket": "other", "name": "Second", "url": None}],
    )
    db_session.commit()

    rows = db_session.query(models.MediaSource).all()
    assert [r.name for r in rows] == ["Second"]


def test_replace_resolves_a_main_row_by_option_value(db_session, sample_anime):
    _option(db_session, "Crunchyroll")
    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [
            {
                "kind": "access",
                "bucket": "main",
                "name": "Crunchyroll",
                "url": "https://cr.test",
                "available": True,
            }
        ],
    )
    db_session.commit()

    (row,) = db_session.query(models.MediaSource).all()
    assert row.option_id is not None
    assert row.name is None


def test_replace_records_order(db_session, sample_anime):
    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [
            {"kind": "access", "bucket": "other", "name": "A"},
            {"kind": "access", "bucket": "other", "name": "B"},
        ],
    )
    db_session.commit()

    rows = db_session.query(models.MediaSource).order_by(models.MediaSource.position).all()
    assert [r.position for r in rows] == [0, 1]


def test_delete_removes_only_this_entry(db_session, sample_anime):
    other_id = uuid.uuid4()
    for entry_id in (sample_anime.system_id, other_id):
        db_session.add(
            models.MediaSource(
                media_type="anime",
                entry_id=entry_id,
                kind="access",
                bucket="other",
                name="Site",
            )
        )
    db_session.commit()

    removed = delete_sources_for(db_session, "anime", sample_anime.system_id)
    db_session.commit()

    assert removed == 1
    assert db_session.query(models.MediaSource).count() == 1
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_sources_service.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.domain.sources'`

- [ ] **Step 3: Write the service**

Create `app/services/domain/sources.py`:

```python
"""
Reading and writing media_source rows.

Modelled on services.domain.credits: the read path is batched (one query for
rows, one for the options they cite) because attach runs on every list
endpoint, and the write path is a whole-set replace that does not commit -
the caller owns the transaction.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.schemas.sources import SourceRef
from app.utils.source_fields import FREE_FORM_BUCKETS, category_for_kind


def _option_lookup(db: Session, option_ids: set[UUID]) -> dict[UUID, str]:
    if not option_ids:
        return {}
    rows = (
        db.query(models.SystemOption.system_id, models.SystemOption.value)
        .filter(models.SystemOption.system_id.in_(option_ids))
        .all()
    )
    return {system_id: value for system_id, value in rows}


def attach_sources(
    db: Session, media_type: str, entries, viewer=None
) -> None:
    """
    Set `entry.sources` on ORM entries in place.

    Rows in a bucket the viewer is not granted are dropped here rather than in
    field_gate.gate(), because the filtering is partial: a viewer may hold
    `other` and not `restricted`, so the attribute cannot simply be blanked.
    """
    # Imported here: field_groups imports credits, and credits must not import
    # rbac back at module scope.
    from app.services.rbac.field_gate import gated_source_buckets

    if entries is None:
        return
    rows_in = list(entries) if isinstance(entries, (list, tuple)) else [entries]
    if not rows_in:
        return

    withheld = set(gated_source_buckets(viewer))
    entry_ids = [e.system_id for e in rows_in]

    query = db.query(models.MediaSource).filter(
        models.MediaSource.media_type == media_type,
        models.MediaSource.entry_id.in_(entry_ids),
    )
    if withheld:
        query = query.filter(models.MediaSource.bucket.notin_(withheld))
    source_rows = query.order_by(models.MediaSource.position).all()

    options = _option_lookup(
        db, {r.option_id for r in source_rows if r.option_id}
    )

    by_entry: dict[UUID, list[SourceRef]] = {}
    for row in source_rows:
        name = row.name if row.option_id is None else options.get(row.option_id)
        if not name:
            # The option was deleted out from under the row. Skip rather than
            # render a nameless link.
            continue
        by_entry.setdefault(row.entry_id, []).append(
            SourceRef(
                system_id=row.system_id,
                kind=row.kind,
                bucket=row.bucket,
                name=name,
                available=row.available,
                url=row.url,
                position=row.position,
            )
        )

    for entry in rows_in:
        entry.sources = by_entry.get(entry.system_id, [])


def replace_sources(
    db: Session, media_type: str, entry_id: UUID, payload: list[dict]
) -> None:
    """
    Make the entry's sources exactly `payload`, in that order.

    A row is a dict of kind, bucket, name, and optionally url and available.
    `name` is resolved against the vocabulary for `main` rows and stored as
    typed text for the free-form buckets. Does not commit.
    """
    from app.services.domain.credits import resolve_option

    db.query(models.MediaSource).filter_by(
        media_type=media_type, entry_id=entry_id
    ).delete(synchronize_session=False)

    for position, item in enumerate(payload or []):
        name = (item.get("name") or "").strip()
        if not name:
            continue
        kind = item.get("kind") or "access"
        bucket = item.get("bucket") or "other"

        option_id = None
        stored_name = name
        if bucket not in FREE_FORM_BUCKETS:
            option = resolve_option(db, category_for_kind(kind), name)
            option_id = option.system_id
            stored_name = None

        db.add(
            models.MediaSource(
                media_type=media_type,
                entry_id=entry_id,
                kind=kind,
                bucket=bucket,
                option_id=option_id,
                name=stored_name,
                available=item.get("available"),
                url=(item.get("url") or None),
                position=position,
            )
        )
    db.flush()


def delete_sources_for(db: Session, media_type: str, entry_id: UUID) -> int:
    """Remove every source row for one entry. Nothing cascades - no FK."""
    return (
        db.query(models.MediaSource)
        .filter_by(media_type=media_type, entry_id=entry_id)
        .delete(synchronize_session=False)
    )


def media_sources_writer(media_type: str):
    """
    Build the `nested_collections` adapter for one media type.

    A factory rather than a plain function because entries do not carry their
    own media type - the registry knows it, so it is closed over at spec
    declaration time. See app/routers/_factory.py:83-96.
    """

    def write(db: Session, entry, value) -> None:
        replace_sources(db, media_type, entry.system_id, value or [])

    return write
```

> **Check `write_novel_units` first** (`app/services/domain/novel_unit_writer.py`) — it is the existing `nested_collections` callable, and its signature is the contract `_write_nested` calls with. If it takes `(db, entry, value)` as assumed here, the factory above is right. If it differs, match it rather than the sketch.

- [ ] **Step 4: Add the `resolve_option` import check**

Confirm `resolve_option(db, category, value)` exists in `app/services/domain/credits.py` and returns a `SystemOption`. If its signature differs, adapt the call rather than the service.

Run: `venv/Scripts/python.exe -c "from app.services.domain.credits import resolve_option; import inspect; print(inspect.signature(resolve_option))"`

- [ ] **Step 5: Run the tests**

They will still fail on `app.schemas.sources` — that is Task 6. Stub it for now by creating `app/schemas/sources.py` with just `SourceRef` (the full file is written in Task 6):

```python
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SourceRef(BaseModel):
    """One row of an entry's Sources card."""

    system_id: UUID
    kind: str
    bucket: str
    name: str
    available: Optional[bool] = None
    url: Optional[str] = None
    position: int = 0

    model_config = ConfigDict(from_attributes=True)
```

Also add a temporary `gated_source_buckets` returning `()` to `app/services/rbac/field_gate.py` so the import resolves; Task 7 gives it a real body:

```python
def gated_source_buckets(viewer: Optional[Viewer]) -> tuple[str, ...]:
    """media_source buckets to withhold. Real implementation in Task 7."""
    return ()
```

Run: `venv/Scripts/python.exe -m pytest tests/api/test_sources_service.py -q`
Expected: 8 passed

- [ ] **Step 6: Lint and commit**

```bash
venv/Scripts/ruff.exe check .
git add app/services/domain/sources.py app/schemas/sources.py app/services/rbac/field_gate.py tests/api/test_sources_service.py
git commit -m "feat(sources): batched attach and whole-set replace service" -- app/services/domain/sources.py app/schemas/sources.py app/services/rbac/field_gate.py tests/api/test_sources_service.py
```

---

## Task 6: Response schema and router wiring

**Files:**
- Modify: `app/schemas/sources.py`
- Modify: `app/schemas/link_fields.py` (the eight `*LinkFields` classes, lines 54-116)
- Modify: `app/routers/_factory.py:77-80, 134, 258-272`
- Modify: `app/registry.py` (the eight `MediaTypeSpec` declarations)
- Test: `tests/api/test_sources_api.py`

**Interfaces:**
- Consumes: `attach_sources`, `delete_sources_for`, `media_sources_writer` (Task 5); `SourceRef` (Task 5).
- Produces: every media entry response carries `sources: list[SourceRef]`; POST/PATCH accept a `sources` key.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_sources_api.py`:

```python
"""Sources travel with the entry: read on GET, written on POST/PATCH."""

from app import models


def test_a_new_entry_reports_no_sources(admin_client, sample_anime):
    r = admin_client.get(f"/api/anime/{sample_anime.system_id}")
    assert r.status_code == 200
    assert r.json()["sources"] == []


def test_posting_sources_creates_rows(admin_client, sample_franchise, db_session):
    db_session.add(models.SystemOption(category="Platform", value="Netflix"))
    db_session.commit()

    r = admin_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Sourced",
            "franchise_id": str(sample_franchise.system_id),
            "sources": [
                {
                    "kind": "access",
                    "bucket": "main",
                    "name": "Netflix",
                    "url": "https://netflix.test/x",
                    "available": True,
                },
                {"kind": "access", "bucket": "other", "name": "Elsewhere"},
            ],
        },
    )
    assert r.status_code == 201
    names = [s["name"] for s in r.json()["sources"]]
    assert names == ["Netflix", "Elsewhere"]


def test_patching_sources_replaces_the_whole_set(
    admin_client, sample_anime, db_session
):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [{"kind": "access", "bucket": "other", "name": "One"}]},
    )
    r = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [{"kind": "access", "bucket": "other", "name": "Two"}]},
    )
    assert [s["name"] for s in r.json()["sources"]] == ["Two"]


def test_deleting_the_entry_deletes_its_sources(
    admin_client, sample_anime, db_session
):
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="other",
            name="Site",
        )
    )
    db_session.commit()

    admin_client.delete(f"/api/anime/{sample_anime.system_id}")

    assert db_session.query(models.MediaSource).count() == 0


def test_the_list_endpoint_attaches_sources(admin_client, sample_anime, db_session):
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="reference",
            bucket="main",
            name=None,
            option_id=_wiki(db_session),
        )
    )
    db_session.commit()

    rows = admin_client.get("/api/anime/").json()
    mine = next(r for r in rows if r["system_id"] == str(sample_anime.system_id))
    assert [s["name"] for s in mine["sources"]] == ["Wikipedia"]


def _wiki(db):
    option = models.SystemOption(category="Reference Source", value="Wikipedia")
    db.add(option)
    db.flush()
    return option.system_id
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_sources_api.py -q`
Expected: FAIL — `KeyError: 'sources'`

- [ ] **Step 3: Add `sources` to the response mixins**

`app/schemas/link_fields.py` has eight `*LinkFields` classes (lines 54-116) and `LINK_FIELD_MIXINS` (lines 120-129). Every one of them gains the same field, so add it to a shared base rather than eight times. At the top of the mixin block:

```python
class SourceFields(BaseModel):
    """Attached by services.domain.sources.attach_sources at read time."""

    sources: list[SourceRef] = []
```

and make each of the eight `*LinkFields` classes inherit it in addition to `BaseModel`. Import `SourceRef` from `app.schemas.sources`.

- [ ] **Step 4: Attach on read**

In `app/routers/_factory.py`, `_finish` (line 77) has no viewer in scope, but `get_one` (line 141) does. Change `_finish` to take one:

```python
    def _finish(db: Session, entry, viewer=None):
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        attach_sources(db, spec.owner_type, entry, viewer)
        return entry
```

Update `get_one` (line 144) to pass it:

```python
        return gate(viewer, spec.owner_type, _finish(db, entry, viewer), spec.response_schema)
```

Find every other `_finish(` call site (`create`, `update`, `patch`) and pass `viewer` where one exists, `None` where the caller is an admin write path.

In `list_entries`, after `attach_link_fields(db, spec.owner_type, entries)` (line 134):

```python
        attach_sources(db, spec.owner_type, entries, viewer)
```

Add the import at the top, beside the credits import on line 21:

```python
from app.services.domain.sources import (
    attach_sources,
    delete_sources_for,
    media_sources_writer,
)
```

- [ ] **Step 5: Delete on entry delete**

In the `delete` endpoint (line 266), beside `delete_links_for`:

```python
        delete_sources_for(db, spec.owner_type, entry.system_id)
```

- [ ] **Step 6: Register the nested collection**

In `app/registry.py`, every one of the eight `MediaTypeSpec(...)` declarations gains `sources` in `nested_collections`. For a spec that already has one (novel), add to the existing dict; for the rest, add the key:

```python
    nested_collections={"sources": media_sources_writer("anime")},
```

Use each spec's own `owner_type` string. Import `media_sources_writer` at the top of `registry.py`.

- [ ] **Step 7: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_sources_api.py -q`
Expected: 5 passed

Then the whole API suite, because `_finish`'s signature changed:
Run: `venv/Scripts/python.exe -m pytest tests/api -q`
Expected: no new failures.

- [ ] **Step 8: Lint and commit**

```bash
venv/Scripts/ruff.exe check .
git add app/schemas/sources.py app/schemas/link_fields.py app/routers/_factory.py app/registry.py tests/api/test_sources_api.py
git commit -m "feat(sources): sources on every entry response and write path" -- app/schemas/sources.py app/schemas/link_fields.py app/routers/_factory.py app/registry.py tests/api/test_sources_api.py
```

---

## Task 7: RBAC — the `sources_restricted` group

**Files:**
- Modify: `app/services/rbac/field_groups.py:11-30, 44-57, 107-113`
- Modify: `app/services/rbac/field_gate.py`
- Test: `tests/unit/test_field_groups.py` (extend), `tests/api/test_field_gating.py` (extend)

**Interfaces:**
- Consumes: `FREE_FORM_BUCKETS` (Task 3), `attach_sources` (Task 5).
- Produces: `FieldGroup.source_buckets: tuple[str, ...]`; `gated_source_buckets(viewer) -> tuple[str, ...]` with a real body; `FIELD_GROUPS["sources_restricted"]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_field_groups.py`:

```python
def test_every_gated_bucket_is_a_real_bucket():
    from app.utils.source_fields import SOURCE_BUCKETS

    for key, group in FIELD_GROUPS.items():
        for bucket in group.source_buckets:
            assert bucket in SOURCE_BUCKETS, f"{key} gates unknown bucket {bucket}"


def test_the_two_source_groups_gate_different_buckets():
    other = FIELD_GROUPS["sources_other"].source_buckets
    restricted = FIELD_GROUPS["sources_restricted"].source_buckets
    assert not set(other) & set(restricted)


def test_sources_other_no_longer_gates_a_column():
    from app.utils.media_resolver import MEDIA_TYPE_KEYS

    for media_type in MEDIA_TYPE_KEYS:
        assert columns_for(FIELD_GROUPS["sources_other"], media_type) == ()
```

Append to `tests/api/test_field_gating.py`:

```python
def test_a_viewer_without_restricted_sources_does_not_see_them(
    client, admin_client, sample_anime, db_session
):
    from app import models

    for bucket in ("other", "restricted"):
        db_session.add(
            models.MediaSource(
                media_type="anime",
                entry_id=sample_anime.system_id,
                kind="access",
                bucket=bucket,
                name=f"{bucket} site",
            )
        )
    db_session.commit()

    seen = admin_client.get(f"/api/anime/{sample_anime.system_id}").json()["sources"]
    assert {s["bucket"] for s in seen} == {"other", "restricted"}

    guest = client.get(f"/api/anime/{sample_anime.system_id}")
    if guest.status_code == 200:
        assert "restricted" not in {s["bucket"] for s in guest.json()["sources"]}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_field_groups.py tests/api/test_field_gating.py -q`
Expected: FAIL — `AttributeError: 'FieldGroup' object has no attribute 'source_buckets'`

- [ ] **Step 3: Add the fifth storage flavour**

In `app/services/rbac/field_groups.py`, add to the `FieldGroup` dataclass (after `note_sections`, line 57):

```python
    # Values in media_source.bucket to filter out of the composed source list.
    # Filtered at attach time rather than in field_gate.gate(): the gating is
    # partial - a viewer may hold `other` and not `restricted` - so the
    # attribute cannot simply be blanked.
    source_buckets: tuple[str, ...] = ()
```

Extend the module docstring's list of flavours (lines 11-27) with a fifth entry:

```
  source_buckets  rows in `media_source`, filtered by
                  services.domain.sources.attach_sources before the response
                  is built.
```

- [ ] **Step 4: Rewrite the two source groups**

Replace the existing `sources_other` entry (lines 107-113) with:

```python
    "sources_other": FieldGroup(
        key="sources_other",
        label="Other Sources",
        description="The free-form source list on every media entry.",
        source_buckets=("other",),
        ui_block="info.SourcesCard.other",
    ),
    "sources_restricted": FieldGroup(
        key="sources_restricted",
        label="Restricted Sources",
        description="The restricted free-form source list on every media entry.",
        source_buckets=("restricted",),
        ui_block="info.SourcesCard.restricted",
    ),
```

> `sources_other` keeps its key deliberately: it is the value stored in `role_permission.permission`, so renaming it would silently revoke the grant from every role that holds it. Only what it points at changes — from the `source_other` column to the `other` bucket.

- [ ] **Step 5: Give `gated_source_buckets` a real body**

In `app/services/rbac/field_gate.py`, replace the Task 5 stub:

```python
def gated_source_buckets(viewer: Optional[Viewer]) -> tuple[str, ...]:
    """
    media_source buckets to withhold. Not per media type: a bucket means the
    same thing on all eight, so the group names it once.
    """
    out: list[str] = []
    for group in _withheld(viewer):
        out.extend(group.source_buckets)
    return tuple(dict.fromkeys(out))
```

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_field_groups.py tests/api/test_field_gating.py tests/api/test_rbac_admin_api.py -q`
Expected: all pass. `test_the_catalog_lists_every_family` should still pass — a new group in an existing family does not add a family.

- [ ] **Step 7: Lint and commit**

```bash
venv/Scripts/ruff.exe check .
git add app/services/rbac/field_groups.py app/services/rbac/field_gate.py tests/unit/test_field_groups.py tests/api/test_field_gating.py
git commit -m "feat(rbac): Restricted Sources field group, gated by bucket" -- app/services/rbac/field_groups.py app/services/rbac/field_gate.py tests/unit/test_field_groups.py tests/api/test_field_gating.py
```

---

## Task 8: The Sheets round trip

**Files:**
- Modify: `app/utils/formatter.py` (new parser, near `parse_system_option_scope_from_sheet` at line 834)
- Modify: `app/services/pipelines/tabs.py:33-70`
- Modify: `app/services/pipelines/pull.py:88-105`
- Test: `tests/unit/test_formatter_media_source.py`, `tests/api/test_pull_media_source.py`

**Interfaces:**
- Consumes: `models.MediaSource` (Task 2).
- Produces: `parse_media_source_from_sheet(raw: dict) -> dict`; a `SheetTab("Media Source", ...)` entry; a `DERIVED_IDENTITY_KEYS["Media Source"]` entry.

- [ ] **Step 1: Write the failing parser test**

Create `tests/unit/test_formatter_media_source.py`:

```python
"""Media Source cells parse into typed values, blanks into None."""

from uuid import UUID

from app.utils.formatter import parse_media_source_from_sheet


def test_a_full_row_parses():
    parsed = parse_media_source_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "media_type": "anime",
            "entry_id": "22222222-2222-2222-2222-222222222222",
            "kind": "access",
            "bucket": "main",
            "option_category": "Platform",
            "option_value": "Netflix",
            "name": "",
            "available": "TRUE",
            "url": "https://netflix.test",
            "position": "2",
        }
    )
    assert parsed["media_type"] == "anime"
    assert isinstance(parsed["entry_id"], UUID)
    assert parsed["available"] is True
    assert parsed["position"] == 2
    assert parsed["name"] is None


def test_an_unparseable_entry_id_becomes_none_not_a_string():
    parsed = parse_media_source_from_sheet({"entry_id": "Tokyo Ghoul"})
    assert parsed["entry_id"] is None


def test_a_blank_available_stays_unknown():
    parsed = parse_media_source_from_sheet({"available": ""})
    assert parsed["available"] is None
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_media_source.py -q`
Expected: FAIL — `ImportError: cannot import name 'parse_media_source_from_sheet'`

- [ ] **Step 3: Write the parser**

In `app/utils/formatter.py`, after `parse_system_option_scope_from_sheet` (line 845):

```python
def parse_media_source_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Media Source sheet into typed data ready
    for the Database.

    option_id is deliberately absent. system_option mints a different uuid in
    every database, so the sheet carries the option's category and value
    instead and pull.py resolves them - the same treatment credits and tags
    get. entry_id needs no such step: entry ids are identical everywhere.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "media_type": parse_from_sheet(raw.get("media_type"), str),
        "entry_id": _uuid_or_none(raw.get("entry_id")),
        # Preserved as written, not coerced: a kind or bucket added in a newer
        # version must survive a round trip through an older one.
        "kind": parse_from_sheet(raw.get("kind"), str),
        "bucket": parse_from_sheet(raw.get("bucket"), str),
        "name": parse_from_sheet(raw.get("name"), str),
        "available": parse_from_sheet(raw.get("available"), bool),
        "url": parse_from_sheet(raw.get("url"), str),
        "position": parse_from_sheet(raw.get("position"), int),
    }
```

- [ ] **Step 4: Add the derived sheet columns**

`backup.py:33` derives headers from the model's columns, which would emit a raw `option_id`. Two extra columns are needed and one suppressed. Find how `backup.py` handles `tab.media_type` link columns (lines 35-38) and follow the same shape: add an optional `extra_columns` / `extra_values` pair to `SheetTab`, or special-case `Media Source` in `backup.py`.

The simplest change that stays in the existing idiom is a per-tab hook on `SheetTab`:

```python
@dataclass(frozen=True)
class SheetTab:
    name: str
    model: type
    parser: Callable
    media_type: Optional[str] = None
    # Columns to drop from the derived header list, and (header, fn) pairs to
    # append. Used by Media Source, whose option_id is database-local.
    drop_columns: tuple[str, ...] = ()
    extra_columns: tuple[tuple[str, Callable], ...] = ()
```

and in `backup.py`, between lines 33 and 34:

```python
            headers = [
                c.name
                for c in tab.model.__table__.columns
                if c.name not in tab.drop_columns
            ]
            headers += [name for name, _fn in tab.extra_columns]
```

with the matching value logic in `format_model_for_sheet`'s caller.

> Confirm the exact shape of `format_model_for_sheet` before writing this — it walks `__table__.columns` itself (`formatter.py:38-64`), so dropping a column from the header list without dropping it from the values would misalign every row. Either pass the drop list down, or filter the emitted row in `backup.py`.

- [ ] **Step 5: Register the tab**

In `app/services/pipelines/tabs.py`, after the `Note` entry (line 67):

```python
    # After every media tab and after System Options: cites an entry by id and
    # an option by (category, value).
    SheetTab(
        "Media Source",
        models.MediaSource,
        f.parse_media_source_from_sheet,
        drop_columns=("option_id",),
        extra_columns=(
            ("option_category", lambda row: _option_category(row)),
            ("option_value", lambda row: _option_value(row)),
        ),
    ),
```

- [ ] **Step 6: Add the pull identity key**

In `app/services/pipelines/pull.py`, add to `DERIVED_IDENTITY_KEYS` (line 88):

```python
    # Mints its own uuid but cites an entry id, which is the same in every
    # database. The option is cited by category+value and resolved on the way
    # in, so it is not part of the key.
    "Media Source": (
        "media_type",
        "entry_id",
        "kind",
        "bucket",
        "name",
    ),  # uq_media_source_row
```

And in the pull row handler, resolve `option_category` + `option_value` into `option_id` before the upsert — mirroring how credit/tag columns are popped and reapplied at `pull.py:276-283` and `:827-843`.

- [ ] **Step 7: Write the round-trip test**

Create `tests/api/test_pull_media_source.py`, modelled on `tests/api/test_pull_derived_identity.py:369-379`:

```python
"""A Media Source row survives backup -> pull with a different local uuid."""

import uuid

from app import models


def test_pulling_the_same_row_twice_does_not_duplicate(db_session, sample_anime):
    from app.services.pipelines.pull import _match_by_natural_key

    payload = {
        "media_type": "anime",
        "entry_id": sample_anime.system_id,
        "kind": "access",
        "bucket": "other",
        "name": "Site",
    }
    db_session.add(models.MediaSource(**payload))
    db_session.commit()

    # A second machine's export carries a different system_id for the same row.
    match = _match_by_natural_key(db_session, "Media Source", dict(payload))
    assert match is not None
    assert match.name == "Site"


def test_a_partial_key_never_matches(db_session, sample_anime):
    from app.services.pipelines.pull import _match_by_natural_key

    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="other",
            name="Site",
        )
    )
    db_session.commit()

    assert _match_by_natural_key(db_session, "Media Source", {"media_type": "anime"}) is None
```

- [ ] **Step 8: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_media_source.py tests/api/test_pull_media_source.py -q`
Expected: all pass.

Then the existing pipeline suite, since `SheetTab` gained fields:
Run: `venv/Scripts/python.exe -m pytest tests/api -q -k "pull or backup or tabs"`
Expected: no new failures.

- [ ] **Step 9: Lint and commit**

```bash
venv/Scripts/ruff.exe check .
git add app/utils/formatter.py app/services/pipelines/tabs.py app/services/pipelines/backup.py app/services/pipelines/pull.py tests/unit/test_formatter_media_source.py tests/api/test_pull_media_source.py
git commit -m "feat(sources): Media Source sheet tab and pull identity" -- app/utils/formatter.py app/services/pipelines/tabs.py app/services/pipelines/backup.py app/services/pipelines/pull.py tests/unit/test_formatter_media_source.py tests/api/test_pull_media_source.py
```

---

## Task 9: The three tag fields

**Files:**
- Modify: `app/utils/credit_roles.py:107-129, 169-196`
- Modify: `app/services/domain/credits.py:405-406` (`BACKFILL_MAP`)
- Modify: `app/schemas/link_fields.py:78-90`
- Modify: `app/models/novel.py` (new `serialization_platform` column)
- Modify: `app/utils/formatter.py:504, 533, 565` and the novel parser
- Create: `alembic/versions/<rev>_source_tag_fields.py`
- Test: `tests/unit/test_source_tag_fields.py`

**Interfaces:**
- Consumes: `PLATFORM_CATEGORY`, `SERIALIZATION_CATEGORY` (Task 3).
- Produces: `TAG_FIELDS["original_source"]`, `TAG_FIELDS["exclusive_source"]`, `TAG_FIELDS["serialization_platform"]`; `source_official` removed.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_source_tag_fields.py`:

```python
"""The three origin fields: what each answers, and where each is offered."""

import pytest

from app.utils.credit_roles import TAG_FIELDS
from app.utils.source_fields import PLATFORM_CATEGORY, SERIALIZATION_CATEGORY


def test_source_official_is_gone():
    assert "source_official" not in TAG_FIELDS


def test_original_source_is_offered_on_the_reality_types():
    field = TAG_FIELDS["original_source"]
    assert field.category == PLATFORM_CATEGORY
    assert set(field.media_types) == {"movie", "tv-show", "cartoon"}


def test_exclusive_source_is_offered_on_the_anime_types():
    field = TAG_FIELDS["exclusive_source"]
    assert field.category == PLATFORM_CATEGORY
    assert set(field.media_types) == {"anime", "anime-movie"}


def test_serialization_platform_is_offered_on_the_prose_types():
    field = TAG_FIELDS["serialization_platform"]
    assert field.category == SERIALIZATION_CATEGORY
    assert set(field.media_types) == {"manga", "novel"}


def test_the_two_platform_fields_never_overlap():
    """A type answers 'where first' or 'exclusive to', never both."""
    a = set(TAG_FIELDS["original_source"].media_types)
    b = set(TAG_FIELDS["exclusive_source"].media_types)
    assert not a & b


@pytest.mark.parametrize("key", ["original_source", "exclusive_source"])
def test_both_platform_fields_share_one_vocabulary(key):
    assert TAG_FIELDS[key].category == PLATFORM_CATEGORY
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_source_tag_fields.py -q`
Expected: FAIL — `assert "source_official" not in TAG_FIELDS`

- [ ] **Step 3: Rewrite the tag fields**

In `app/utils/credit_roles.py`, replace the `source_official` entry (lines 107-110) with:

```python
    # Where a work FIRST appeared. Multi-value: a film can open in cinemas and
    # on a streaming service the same day.
    "original_source": TagField(
        "original_source", "Original Source", PLATFORM_CATEGORY,
        ("tv-show", "cartoon", "movie"),
    ),
    # Which platform carries a work EXCLUSIVELY. Blank means not exclusive,
    # which is a fact about the work, not a missing value. Single-valued: you
    # cannot be exclusive to two platforms.
    "exclusive_source": TagField(
        "exclusive_source", "Exclusive Source", PLATFORM_CATEGORY,
        ("anime", "anime-movie"),
    ),
    "serialization_platform": TagField(
        "serialization_platform", "Serialization Platform",
        SERIALIZATION_CATEGORY, ("manga", "novel"),
    ),
```

Import the two category constants at the top of the file from `app.utils.source_fields`.

In `LEGACY_SHEET_COLUMN` (lines 180-181), replace the two `source_official` entries:

```python
    ("tv-show", "original_source"): "source_official",
    ("cartoon", "original_source"): "source_official",
```

> Keeping the legacy sheet header is deliberate: `sheet_column_for` exists precisely so a rename in code does not break the spreadsheet's column name. Task 12 is where the header itself changes, if you decide it should.

- [ ] **Step 4: Update `BACKFILL_MAP`**

In `app/services/domain/credits.py`, lines 405-406:

```python
    ("tv-show", "source_official", "tag", "original_source"),
    ("cartoon", "source_official", "tag", "original_source"),
```

The second element is the legacy *column*, the fourth the *field key* — only the key changes.

- [ ] **Step 5: Update the link-field schemas**

In `app/schemas/link_fields.py` lines 78-90, rename `source_official` to `original_source` in the three classes (movie, tv-show, cartoon) and add `exclusive_source: Optional[str] = None` to the anime and anime-movie classes, `serialization_platform: Optional[str] = None` to manga and novel.

- [ ] **Step 6: Add novel's column**

`serialization_platform` is a `TagField`, so its values live in `media_tag`, not in a column — **no new column on `novel` is needed.** Delete manga's `serialization_platform` column instead, in Task 12, once its values have been migrated into `media_tag`.

> This supersedes the spec's "new column on the `novel` table". The spec was written before it was clear `serialization_platform` would become a `TagField`; as a tag field it needs no column on either table.

- [ ] **Step 7: Enforce single-value on `exclusive_source`**

In `app/routers/credits.py`, `replace_credits` (line 76) validates roles and fields. Add a cardinality check before the write loop:

```python
    SINGLE_VALUED = {"exclusive_source"}
    for field, values in payload.tags.items():
        if field in SINGLE_VALUED and len(values) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"{field} takes at most one value, got {len(values)}",
            )
```

Add a test for it in `tests/api/test_credits_router.py` (or the nearest existing credits API test):

```python
def test_exclusive_source_rejects_a_second_value(admin_client, sample_anime):
    r = admin_client.put(
        f"/api/credits/anime/{sample_anime.system_id}",
        json={"tags": {"exclusive_source": ["Netflix", "Crunchyroll"]}},
    )
    assert r.status_code == 400
```

- [ ] **Step 8: Migrate the vocabulary rows**

Create `alembic/versions/<rev>_source_tag_fields.py`, chained off Task 2's revision:

```python
"""rename Official Source vocabulary to Platform

Revision ID: st1a2g3s4
Revises: ms1o2u3r4c5e
"""

from alembic import op

revision = "st1a2g3s4"
down_revision = "ms1o2u3r4c5e"
branch_labels = None
depends_on = None


def upgrade():
    # Disney was always Disney+; normalise before the merge so the dedupe
    # below sees one value, not two.
    op.execute(
        "UPDATE system_option SET value = 'Disney+' "
        "WHERE category = 'Official Source' AND value = 'Disney'"
    )
    # Drop any Official Source row whose value already exists under Platform -
    # (category, value) is unique, so the rename would collide. Its media_tag
    # rows are repointed at the surviving Platform row first.
    op.execute(
        """
        UPDATE media_tag mt
           SET option_id = keep.system_id
          FROM system_option dup
          JOIN system_option keep
            ON keep.category = 'Platform' AND keep.value = dup.value
         WHERE dup.category = 'Official Source'
           AND mt.option_id = dup.system_id
        """
    )
    op.execute(
        """
        DELETE FROM system_option dup
         USING system_option keep
         WHERE dup.category = 'Official Source'
           AND keep.category = 'Platform'
           AND keep.value = dup.value
        """
    )
    op.execute(
        "UPDATE system_option SET category = 'Platform' "
        "WHERE category = 'Official Source'"
    )
    # The field key on the tag rows themselves.
    op.execute(
        "UPDATE media_tag SET field = 'original_source' "
        "WHERE field = 'source_official'"
    )


def downgrade():
    op.execute(
        "UPDATE media_tag SET field = 'source_official' "
        "WHERE field = 'original_source'"
    )
    op.execute(
        "UPDATE system_option SET category = 'Official Source' "
        "WHERE category = 'Platform'"
    )
```

> **Before running this, dump the live values** and check the split by hand — the spec flags this as the one thing not to guess:
>
> ```bash
> venv/Scripts/python.exe -c "from app.database import SessionLocal; from app import models; db=SessionLocal(); [print(o.category,'|',o.value,'|',[s.scope for s in o.scopes]) for o in db.query(models.SystemOption).filter(models.SystemOption.category.in_(('Official Source','Platform'))).order_by(models.SystemOption.value)]"
> ```
>
> Values that are broadcast networks (Fox, ABC, The CW, Nickelodeon, Adult Swim, Cartoon Network) need a `usage='origin'` row; streaming services need none. Add those inserts to the migration once you have seen the real list.

- [ ] **Step 9: Run the tests**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m pytest tests/unit/test_source_tag_fields.py tests/unit/test_field_groups.py tests/api -q`
Expected: all pass.

- [ ] **Step 10: Lint and commit**

```bash
venv/Scripts/ruff.exe check .
git add app/utils/credit_roles.py app/services/domain/credits.py app/schemas/link_fields.py app/routers/credits.py alembic/versions/st1a2g3s4_source_tag_fields.py tests/unit/test_source_tag_fields.py tests/api/test_credits_router.py
git commit -m "feat(sources): original_source, exclusive_source, serialization_platform tag fields" -- app/utils/credit_roles.py app/services/domain/credits.py app/schemas/link_fields.py app/routers/credits.py alembic/versions/st1a2g3s4_source_tag_fields.py tests/unit/test_source_tag_fields.py tests/api/test_credits_router.py
```

---

## Task 10: Seed the vocabulary

**Files:**
- Create: `alembic/versions/<rev>_seed_source_vocabulary.py`
- Test: `tests/unit/test_seed_source_vocabulary.py`

**Interfaces:**
- Consumes: Task 9's revision.
- Produces: `system_option` rows for the `Platform` and `Reference Source` categories, with their scopes and usages, exactly as the spec's two vocabulary tables list them.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_seed_source_vocabulary.py`, using the importlib idiom from `tests/unit/test_retire_orphan_option_categories.py:23-29`:

```python
"""The seeded vocabulary matches the spec's tables."""

import importlib.util
import pathlib

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils.source_fields import (
    OPTION_USAGES,
    PLATFORM_CATEGORY,
    REFERENCE_CATEGORY,
)

_spec = importlib.util.spec_from_file_location(
    "sv1o2c3a4b",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/sv1o2c3a4b_seed_source_vocabulary.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_every_seeded_scope_is_a_media_type():
    for _cat, _val, scopes, _usages in migration.SEED:
        for scope in scopes:
            assert scope in MEDIA_TYPE_KEYS, f"{scope} is not a media type"


def test_every_seeded_usage_is_known():
    for _cat, _val, _scopes, usages in migration.SEED:
        for usage in usages:
            assert usage in OPTION_USAGES


def test_only_the_two_source_categories_are_seeded():
    assert {row[0] for row in migration.SEED} == {
        PLATFORM_CATEGORY,
        REFERENCE_CATEGORY,
    }


def test_no_value_is_seeded_twice_in_one_category():
    seen = [(cat, val) for cat, val, _s, _u in migration.SEED]
    assert len(seen) == len(set(seen))


def test_origin_only_values_are_never_offered_as_watch_platforms():
    origin_only = {val for _c, val, _s, u in migration.SEED if u == ["origin"]}
    assert {"Fox", "ABC", "The CW", "Nickelodeon", "Adult Swim", "Cartoon Network"} <= origin_only


def test_reference_values_carry_no_usage():
    for cat, _val, _scopes, usages in migration.SEED:
        if cat == REFERENCE_CATEGORY:
            assert usages == []
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_seed_source_vocabulary.py -q`
Expected: FAIL — `FileNotFoundError`

- [ ] **Step 3: Write the migration**

Create `alembic/versions/<rev>_seed_source_vocabulary.py`:

```python
"""seed the Platform and Reference Source vocabularies

Revision ID: sv1o2c3a4b
Revises: st1a2g3s4
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "sv1o2c3a4b"
down_revision = "st1a2g3s4"
branch_labels = None
depends_on = None

PLATFORM = "Platform"
REFERENCE = "Reference Source"

# (category, value, scopes, usages). Empty scopes = offered on every media
# type; empty usages = serves both watch and origin.
SEED: list[tuple[str, str, list[str], list[str]]] = [
    (PLATFORM, "Netflix", [], []),
    (PLATFORM, "Disney+", [], []),
    (PLATFORM, "Prime Video", [], []),
    (PLATFORM, "Apple TV+", ["movie", "tv-show", "cartoon"], []),
    (PLATFORM, "HBO Max", ["movie", "tv-show", "cartoon"], []),
    (PLATFORM, "Cinema", ["movie", "anime-movie"], []),
    (PLATFORM, "Crunchyroll", ["anime", "anime-movie"], []),
    (PLATFORM, "Bahamut", ["anime", "anime-movie"], []),
    (PLATFORM, "Bilibili", ["anime", "anime-movie"], []),
    (PLATFORM, "Fox", ["tv-show", "cartoon"], ["origin"]),
    (PLATFORM, "ABC", ["tv-show"], ["origin"]),
    (PLATFORM, "The CW", ["tv-show"], ["origin"]),
    (PLATFORM, "Nickelodeon", ["cartoon"], ["origin"]),
    (PLATFORM, "Adult Swim", ["cartoon"], ["origin"]),
    (PLATFORM, "Cartoon Network", ["cartoon"], ["origin"]),
    (PLATFORM, "Other", ["cartoon"], ["origin"]),
    (REFERENCE, "Wikipedia", [], []),
    (REFERENCE, "Fandom wiki", [], []),
    (REFERENCE, "Official site", ["anime", "anime-movie", "comic"], []),
    (REFERENCE, "Twitter", ["anime", "anime-movie", "manga", "novel"], []),
    (REFERENCE, "AniList", ["anime", "anime-movie", "manga", "novel"], []),
    (REFERENCE, "KeyFrame Staff List", ["anime", "anime-movie"], []),
]

# Cartoon Network is now part of HBO Max. Recorded as a remark rather than
# inside the value: (category, value) is the unique key and every entry points
# at that string, so folding the parenthetical in would make a future rename
# break them all.
REMARKS = {"Cartoon Network": "now part of HBO Max"}


def upgrade():
    conn = op.get_bind()
    for sort_order, (category, value, scopes, usages) in enumerate(SEED):
        existing = conn.execute(
            sa.text(
                "SELECT system_id FROM system_option "
                "WHERE category = :c AND value = :v"
            ),
            {"c": category, "v": value},
        ).scalar()
        if existing:
            option_id = existing
        else:
            option_id = uuid.uuid4()
            conn.execute(
                sa.text(
                    "INSERT INTO system_option "
                    "(system_id, category, value, sort_order, remark) "
                    "VALUES (:id, :c, :v, :so, :r)"
                ),
                {
                    "id": option_id,
                    "c": category,
                    "v": value,
                    "so": sort_order,
                    "r": REMARKS.get(value),
                },
            )
        for scope in scopes:
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_scope (option_id, scope) "
                    "VALUES (:id, :s) ON CONFLICT DO NOTHING"
                ),
                {"id": option_id, "s": scope},
            )
        for usage in usages:
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_usage (option_id, usage) "
                    "VALUES (:id, :u) ON CONFLICT DO NOTHING"
                ),
                {"id": option_id, "u": usage},
            )


def downgrade():
    conn = op.get_bind()
    for category, value, _scopes, _usages in SEED:
        conn.execute(
            sa.text(
                "DELETE FROM system_option WHERE category = :c AND value = :v"
            ),
            {"c": category, "v": value},
        )
```

- [ ] **Step 4: Seed the serialization vocabulary from live data**

The `Serialization Platform` values come from whatever is already in `manga.serialization_platform`, so they cannot be listed here. Add to `upgrade()`:

```python
    # Seeded from the free-text column rather than listed: these are whatever
    # has been typed so far. Duplicates get merged by hand on the Options page.
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option (system_id, category, value, sort_order)
            SELECT gen_random_uuid(), 'Serialization Platform',
                   TRIM(serialization_platform), 0
              FROM manga
             WHERE serialization_platform IS NOT NULL
               AND TRIM(serialization_platform) <> ''
             GROUP BY TRIM(serialization_platform)
            ON CONFLICT (category, value) DO NOTHING
            """
        )
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option_scope (option_id, scope)
            SELECT system_id, 'manga' FROM system_option
             WHERE category = 'Serialization Platform'
            ON CONFLICT DO NOTHING
            """
        )
    )
```

- [ ] **Step 5: Run the migration and the tests**

Run: `venv/Scripts/python.exe -m alembic upgrade head && venv/Scripts/python.exe -m pytest tests/unit/test_seed_source_vocabulary.py -q`
Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
venv/Scripts/ruff.exe check .
git add alembic/versions/sv1o2c3a4b_seed_source_vocabulary.py tests/unit/test_seed_source_vocabulary.py
git commit -m "feat(sources): seed the Platform and Reference Source vocabularies" -- alembic/versions/sv1o2c3a4b_seed_source_vocabulary.py tests/unit/test_seed_source_vocabulary.py
```

---

## Task 11: Backfill the old columns into rows

**Files:**
- Create: `alembic/versions/<rev>_backfill_media_source.py`
- Test: `tests/api/test_backfill_media_source.py`

**Interfaces:**
- Consumes: Task 10's revision, the seeded vocabulary.
- Produces: `media_source` rows for every existing entry; the old columns still present (dropped in Task 12).

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_backfill_media_source.py`:

```python
"""Every source in the old columns survives the move to media_source."""

import importlib.util
import pathlib

from app import models

_spec = importlib.util.spec_from_file_location(
    "bf1i2l3l4",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/bf1i2l3l4_backfill_media_source.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_the_map_covers_every_media_type():
    from app.utils.media_resolver import MEDIA_TYPE_KEYS

    assert set(migration.SOURCE_COLUMNS) == set(MEDIA_TYPE_KEYS)


def test_baha_carries_both_its_flag_and_its_link():
    anime = migration.SOURCE_COLUMNS["anime"]
    baha = next(c for c in anime if c.option_value == "Bahamut")
    assert baha.flag_column == "source_baha"
    assert baha.link_column == "baha_link"


def test_netflix_has_a_flag_but_no_link_column():
    anime = migration.SOURCE_COLUMNS["anime"]
    netflix = next(c for c in anime if c.option_value == "Netflix")
    assert netflix.flag_column == "source_netflix"
    assert netflix.link_column is None


def test_reference_columns_carry_no_flag():
    anime = migration.SOURCE_COLUMNS["anime"]
    for column in anime:
        if column.kind == "reference":
            assert column.flag_column is None


def test_comic_has_no_access_columns_to_migrate():
    assert [c for c in migration.SOURCE_COLUMNS["comic"] if c.kind == "access"] == []
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_backfill_media_source.py -q`
Expected: FAIL — `FileNotFoundError`

- [ ] **Step 3: Write the migration**

Create `alembic/versions/<rev>_backfill_media_source.py`:

```python
"""backfill media_source from the old source columns

Revision ID: bf1i2l3l4
Revises: sv1o2c3a4b

Kept as a migration rather than a service so it runs exactly once, in order,
on both machines. The Twitter rows on manga and novel come out of source_other
by name, replacing the string-match that used to happen in the browser.
"""

import json
import uuid
from dataclasses import dataclass

import sqlalchemy as sa
from alembic import op

revision = "bf1i2l3l4"
down_revision = "sv1o2c3a4b"
branch_labels = None
depends_on = None


@dataclass(frozen=True)
class SourceColumn:
    """One old column, and the media_source row it becomes."""

    option_value: str
    kind: str
    link_column: str | None = None
    flag_column: str | None = None


SOURCE_COLUMNS: dict[str, tuple[SourceColumn, ...]] = {
    "anime": (
        SourceColumn("Bahamut", "access", "baha_link", "source_baha"),
        SourceColumn("Netflix", "access", None, "source_netflix"),
        SourceColumn("Official site", "reference", "official_link"),
        SourceColumn("Twitter", "reference", "twitter_link"),
        SourceColumn("AniList", "reference", "anilist_link"),
    ),
    "anime-movie": (
        SourceColumn("Bahamut", "access", "baha_link", "source_baha"),
        SourceColumn("Netflix", "access", None, "source_netflix"),
        SourceColumn("Official site", "reference", "official_link"),
        SourceColumn("Twitter", "reference", "twitter_link"),
        SourceColumn("AniList", "reference", "anilist_link"),
    ),
    "movie": (),
    "tv-show": (),
    "cartoon": (),
    "manga": (SourceColumn("AniList", "reference", "anilist_link"),),
    "novel": (SourceColumn("AniList", "reference", "anilist_link"),),
    "comic": (),
}

TABLE_FOR_TYPE = {
    "anime": "anime",
    "anime-movie": "anime_movies",
    "movie": "movies",
    "tv-show": "tv_shows",
    "cartoon": "cartoons",
    "manga": "manga",
    "novel": "novel",
    "comic": "comic",
}


def _option_ids(conn) -> dict[tuple[str, str], uuid.UUID]:
    rows = conn.execute(
        sa.text("SELECT category, value, system_id FROM system_option")
    ).fetchall()
    return {(c, v): i for c, v, i in rows}


def upgrade():
    conn = op.get_bind()
    options = _option_ids(conn)

    for media_type, columns in SOURCE_COLUMNS.items():
        table = TABLE_FOR_TYPE[media_type]

        # --- named columns -> main rows ---------------------------------
        for column in columns:
            category = "Platform" if column.kind == "access" else "Reference Source"
            option_id = options.get((category, column.option_value))
            if option_id is None:
                continue

            selects = ["system_id"]
            if column.link_column:
                selects.append(column.link_column)
            if column.flag_column:
                selects.append(column.flag_column)

            rows = conn.execute(
                sa.text(f"SELECT {', '.join(selects)} FROM {table}")
            ).mappings().fetchall()

            for row in rows:
                url = row.get(column.link_column) if column.link_column else None
                flag = row.get(column.flag_column) if column.flag_column else None
                if not url and flag is None:
                    continue
                conn.execute(
                    sa.text(
                        "INSERT INTO media_source "
                        "(system_id, media_type, entry_id, kind, bucket, "
                        " option_id, name, available, url, position) "
                        "VALUES (:id, :mt, :eid, :k, 'main', :oid, NULL, "
                        "        :av, :url, 0) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "mt": media_type,
                        "eid": row["system_id"],
                        "k": column.kind,
                        "oid": option_id,
                        "av": flag,
                        "url": url or None,
                    },
                )

        # --- source_other -> other rows, with Twitter lifted out --------
        twitter_id = options.get(("Reference Source", "Twitter"))
        rows = conn.execute(
            sa.text(f"SELECT system_id, source_other FROM {table}")
        ).mappings().fetchall()

        for row in rows:
            raw = row["source_other"]
            if not raw:
                continue
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except ValueError:
                    continue
            if not isinstance(raw, dict):
                continue

            position = 0
            for name, url in raw.items():
                name = (name or "").strip()
                if not name:
                    continue
                is_twitter = (
                    name.lower() == "twitter"
                    and media_type in ("manga", "novel")
                    and twitter_id is not None
                )
                conn.execute(
                    sa.text(
                        "INSERT INTO media_source "
                        "(system_id, media_type, entry_id, kind, bucket, "
                        " option_id, name, available, url, position) "
                        "VALUES (:id, :mt, :eid, :k, :b, :oid, :nm, NULL, "
                        "        :url, :pos) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "mt": media_type,
                        "eid": row["system_id"],
                        "k": "reference" if is_twitter else "access",
                        "b": "main" if is_twitter else "other",
                        "oid": twitter_id if is_twitter else None,
                        "nm": None if is_twitter else name,
                        "url": (url or None),
                        "pos": 0 if is_twitter else position,
                    },
                )
                if not is_twitter:
                    position += 1

    # --- manga.serialization_platform -> media_tag ----------------------
    conn.execute(
        sa.text(
            """
            INSERT INTO media_tag (system_id, media_type, entry_id, field,
                                   option_id, position)
            SELECT gen_random_uuid(), 'manga', m.system_id,
                   'serialization_platform', o.system_id, 0
              FROM manga m
              JOIN system_option o
                ON o.category = 'Serialization Platform'
               AND o.value = TRIM(m.serialization_platform)
             WHERE m.serialization_platform IS NOT NULL
               AND TRIM(m.serialization_platform) <> ''
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade():
    op.execute("DELETE FROM media_source")
    op.execute("DELETE FROM media_tag WHERE field = 'serialization_platform'")
```

> **`movie`, `tv-show`, `cartoon` and `comic` have empty column tuples** — none of them had a named source column, only `source_other`, which the second block handles for every type. `imdb_link` and `comicvine_link` stay columns and are deliberately not migrated.

- [ ] **Step 4: Write a losslessness check**

Add to `tests/api/test_backfill_media_source.py`:

```python
def test_every_source_other_key_becomes_a_row(db_session, sample_anime):
    """A round-trip check against real data, run after the migration."""
    from sqlalchemy import text

    leftover = db_session.execute(
        text(
            """
            SELECT COUNT(*) FROM anime a
             WHERE a.source_other IS NOT NULL
               AND jsonb_typeof(a.source_other) = 'object'
               AND (SELECT COUNT(*) FROM jsonb_object_keys(a.source_other))
                   > (SELECT COUNT(*) FROM media_source ms
                       WHERE ms.media_type = 'anime'
                         AND ms.entry_id = a.system_id
                         AND ms.bucket = 'other')
            """
        )
    ).scalar()
    assert leftover == 0
```

- [ ] **Step 5: Run the migration and the tests**

Run: `venv/Scripts/python.exe -m alembic upgrade head && venv/Scripts/python.exe -m pytest tests/api/test_backfill_media_source.py -q`
Expected: 6 passed

- [ ] **Step 6: Eyeball the result before moving on**

```bash
venv/Scripts/python.exe -c "from app.database import SessionLocal; from app import models; from sqlalchemy import func; db=SessionLocal(); print(db.query(models.MediaSource.media_type, models.MediaSource.kind, models.MediaSource.bucket, func.count()).group_by(models.MediaSource.media_type, models.MediaSource.kind, models.MediaSource.bucket).all())"
```

Compare the `other` counts against the number of non-empty `source_other` maps. **Do not proceed to Task 12 until this looks right** — Task 12 drops the source columns and there is no way back except a restore.

- [ ] **Step 7: Commit**

```bash
git add alembic/versions/bf1i2l3l4_backfill_media_source.py tests/api/test_backfill_media_source.py
git commit -m "feat(sources): backfill media_source from the old columns" -- alembic/versions/bf1i2l3l4_backfill_media_source.py tests/api/test_backfill_media_source.py
```

---

## Task 12: Drop the old columns

**Files:**
- Modify: all eight model files under `app/models/`
- Modify: all eight schema files under `app/schemas/`
- Modify: `app/utils/formatter.py` (the eight entry parsers)
- Modify: `app/services/domain/checking.py:229-231`
- Create: `alembic/versions/<rev>_drop_source_columns.py`
- Test: `tests/unit/test_schema_guard.py` (should catch drift automatically)

**Interfaces:**
- Consumes: Task 11's revision.
- Produces: the columns gone from models, schemas, parsers and the database.

**Columns dropped per table:**

| Table | Columns |
|---|---|
| `anime`, `anime_movies` | `source_baha`, `baha_link`, `source_netflix`, `source_other`, `official_link`, `twitter_link`, `anilist_link` |
| `manga`, `novel` | `source_other`, `anilist_link` |
| `manga` | also `serialization_platform` |
| `movies`, `tv_shows`, `cartoons`, `comic` | `source_other` |

`mal_id`, `mal_link`, `imdb_id`, `imdb_link`, `comicvine_id`, `comicvine_link` all stay.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_source_columns_are_gone.py`:

```python
"""The old source columns are gone from every model."""

import pytest

from app.utils.media_resolver import MEDIA_TABLES

DROPPED = (
    "source_baha",
    "baha_link",
    "source_netflix",
    "source_other",
    "official_link",
    "twitter_link",
    "anilist_link",
)

KEPT = ("mal_link", "imdb_link", "comicvine_link")


@pytest.mark.parametrize("media_type", sorted(MEDIA_TABLES))
def test_no_old_source_column_survives(media_type):
    columns = MEDIA_TABLES[media_type].model.__table__.columns
    for name in DROPPED:
        assert name not in columns, f"{media_type} still has {name}"


def test_the_id_bearing_links_are_untouched():
    assert "mal_link" in MEDIA_TABLES["anime"].model.__table__.columns
    assert "imdb_link" in MEDIA_TABLES["movie"].model.__table__.columns
    assert "comicvine_link" in MEDIA_TABLES["comic"].model.__table__.columns


def test_serialization_platform_is_no_longer_a_column():
    assert (
        "serialization_platform"
        not in MEDIA_TABLES["manga"].model.__table__.columns
    )
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_source_columns_are_gone.py -q`
Expected: FAIL on every media type.

- [ ] **Step 3: Strip the models**

Delete the listed columns from `app/models/{anime,anime_movie,manga,novel,comic,movie,tv_show,cartoon}.py`. The lines are the `source_*` / `*_link` block identified in the spec's Problem section.

- [ ] **Step 4: Strip the schemas**

Delete the matching `Optional[...]` fields from `app/schemas/{anime,anime_movie,manga,novel,comic,movie,tv_show,cartoon}.py`.

- [ ] **Step 5: Strip the sheet parsers**

In `app/utils/formatter.py`, delete the corresponding keys from the eight entry parsers (lines 429-432, 471-474, 511, 544, 578, 626, 678, 744 and their neighbours). Sheet headers are derived from the model, so nothing else needs updating.

- [ ] **Step 6: Move the baha derivation**

`app/services/domain/checking.py:229-231` sets `source_baha` from `baha_link`. That rule now belongs to the row, not the entry. Rewrite it to operate on `media_source`:

```python
def derive_baha_available(db, media_type: str, entry_id) -> bool:
    """Sets available=True on the Bahamut row when it has a link and no verdict."""
    from app import models

    row = (
        db.query(models.MediaSource)
        .join(models.SystemOption, models.MediaSource.option_id == models.SystemOption.system_id)
        .filter(
            models.MediaSource.media_type == media_type,
            models.MediaSource.entry_id == entry_id,
            models.SystemOption.value == "Bahamut",
        )
        .first()
    )
    if row and row.url and row.available is None:
        row.available = True
        return True
    return False
```

Update its call site and its existing test.

- [ ] **Step 7: Write the migration**

```python
"""drop the old source columns

Revision ID: dc1o2l3s4
Revises: bf1i2l3l4
"""

from alembic import op

revision = "dc1o2l3s4"
down_revision = "bf1i2l3l4"
branch_labels = None
depends_on = None

DROPS: dict[str, tuple[str, ...]] = {
    "anime": (
        "source_baha", "baha_link", "source_netflix", "source_other",
        "official_link", "twitter_link", "anilist_link",
    ),
    "anime_movies": (
        "source_baha", "baha_link", "source_netflix", "source_other",
        "official_link", "twitter_link", "anilist_link",
    ),
    "manga": ("source_other", "anilist_link", "serialization_platform"),
    "novel": ("source_other", "anilist_link"),
    "movies": ("source_other",),
    "tv_shows": ("source_other",),
    "cartoons": ("source_other",),
    "comic": ("source_other",),
}


def upgrade():
    for table, columns in DROPS.items():
        for column in columns:
            op.drop_column(table, column)


def downgrade():
    raise NotImplementedError(
        "Restore from a Backup. The column data now lives in media_source and "
        "media_tag; recreating empty columns would silently lose it."
    )
```

- [ ] **Step 8: Run everything**

```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: all green. `tests/unit/test_schema_guard.py` should confirm model and schema agree.

- [ ] **Step 9: Commit**

```bash
git add app/models app/schemas app/utils/formatter.py app/services/domain/checking.py alembic/versions/dc1o2l3s4_drop_source_columns.py tests/unit/test_source_columns_are_gone.py
git commit -m "feat(sources): drop the superseded source columns" -- app/models app/schemas app/utils/formatter.py app/services/domain/checking.py alembic/versions/dc1o2l3s4_drop_source_columns.py tests/unit/test_source_columns_are_gone.py
```

---

## Task 13: `usage` in the frontend vocabulary helper

**Files:**
- Modify: `frontend/src/lib/formatters.js:35-67`
- Create: `frontend/src/components/forms/UsagePicker.jsx`
- Modify: `frontend/src/config/scopeColors.js`
- Modify: `frontend/src/pages/add-tabs/OptionsAddTab.jsx`, `frontend/src/pages/modify-tabs/OptionsModifyTab.jsx`
- Modify: `frontend/src/pages/admin/Add.jsx`, `frontend/src/pages/admin/Modify.jsx`
- Test: `frontend/src/lib/formatters.test.js` (extend)

**Interfaces:**
- Consumes: `usages` on the options API response (Task 4).
- Produces: `getSourceValues(sources, { kind: "option", category, scope, usage })` filtering on usage; `<UsagePicker usages setUsages />`.

- [ ] **Step 1: Write the failing test**

In `frontend/src/lib/formatters.test.js`, add `usages` to the fixture rows at lines 31-46 and a new block:

```js
describe("getSourceValues — usage", () => {
  const sources = {
    options: [
      { category: "Platform", value: "Netflix", scopes: [], usages: [] },
      { category: "Platform", value: "Fox", scopes: [], usages: ["origin"] },
      { category: "Platform", value: "Bahamut", scopes: ["anime"], usages: [] },
    ],
  };

  it("hides an origin-only value from a watch picker", () => {
    const values = getSourceValues(sources, {
      kind: "option",
      category: "Platform",
      usage: "watch",
    });
    expect(values).toContain("Netflix");
    expect(values).not.toContain("Fox");
  });

  it("offers a value with no usages for every usage", () => {
    for (const usage of ["watch", "origin"]) {
      const values = getSourceValues(sources, {
        kind: "option",
        category: "Platform",
        usage,
      });
      expect(values).toContain("Netflix");
    }
  });

  it("applies scope and usage together", () => {
    const values = getSourceValues(sources, {
      kind: "option",
      category: "Platform",
      scope: "movie",
      usage: "watch",
    });
    expect(values).toEqual(["Netflix"]);
  });

  it("ignores usage when none is asked for", () => {
    const values = getSourceValues(sources, {
      kind: "option",
      category: "Platform",
    });
    expect(values).toContain("Fox");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/lib/formatters.test.js`
Expected: FAIL — "hides an origin-only value" gets `["Netflix", "Fox", "Bahamut"]`.

- [ ] **Step 3: Extend the filter**

In `frontend/src/lib/formatters.js`, the `option` branch (lines 37-48) gains a usage clause built the same way as the scope clause — absent or empty means "matches everything":

```js
  if (source.kind === "option") {
    return (sources.options || [])
      .filter(
        (o) =>
          o.category === source.category &&
          (!source.scope ||
            !o.scopes ||
            o.scopes.length === 0 ||
            o.scopes.includes(source.scope)) &&
          (!source.usage ||
            !o.usages ||
            o.usages.length === 0 ||
            o.usages.includes(source.usage)),
      )
      .map((o) => o.value);
  }
```

Update the doc block at lines 26-34 to mention `usage`.

- [ ] **Step 4: Build the picker**

Create `frontend/src/components/forms/UsagePicker.jsx`, copying `ScopePicker.jsx` exactly and changing the vocabulary:

```jsx
// Which roles a vocabulary value may be used in. Parallel to ScopePicker,
// which answers "in which media types".
//
// Like scopes, usages are admin-managed and never derived on save: a value
// with none selected serves every usage, which is the common case.
import Field from "./Field";

export const USAGES = ["watch", "origin"];

export default function UsagePicker({ usages, setUsages }) {
  const selected = new Set(usages || []);

  function toggle(key) {
    setUsages((prev) => {
      const next = new Set(prev || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return USAGES.filter((u) => next.has(u));
    });
  }

  return (
    <Field
      label="Usages"
      hint="Watch = somewhere to watch it. Origin = where it first appeared. None selected = both."
    >
      <div className="flex flex-wrap gap-2">
        {USAGES.map((usage) => (
          <button
            key={usage}
            type="button"
            onClick={() => toggle(usage)}
            className={
              selected.has(usage)
                ? "px-2 py-1 text-xs border border-brand bg-brand-soft text-brand"
                : "px-2 py-1 text-xs border border-border text-text-muted hover:text-text"
            }
          >
            {usage}
          </button>
        ))}
      </div>
    </Field>
  );
}
```

> Match `ScopePicker.jsx`'s actual markup and imports rather than this sketch — read it first. Semantic Tailwind tokens only; `src/theme-tokens.test.js` fails the build on hard-coded greys.

- [ ] **Step 5: Wire it into the two option forms**

In `OptionsAddTab.jsx` (beside `<ScopePicker />` at lines 94-98) and `OptionsModifyTab.jsx` (lines 32-36), add `<UsagePicker usages={optUsages} setUsages={setOptUsages} />` and thread the two new props through.

In `Add.jsx`, add `const [optUsages, setOptUsages] = useState([]);` beside line 151, pass it at line 2552, include `usages: optUsages` in the POST body at line 982, and reset it at line 999.

In `Modify.jsx`, add the state beside line 291, load it at line 858 (`setOptUsages(item.usages ?? [])`), pass it at line 3417, and include `usages: optUsages` in the PUT body at line 1153.

> While in `Modify.jsx:1145`, replace the hardcoded `/api/options/${id}` with `endpoints.options.update(editingItem.system_id)` — the helper already exists at `frontend/src/api/endpoints.js:46`.

- [ ] **Step 6: Add usage chips**

In `frontend/src/config/scopeColors.js`, add a `USAGE_CHIPS` map and a `usageChip(usage)` helper beside the existing `SCOPE_CHIPS` / `scopeChip`. Extend `frontend/src/config/scopeColors.test.js` to assert every value in `USAGES` has a chip.

- [ ] **Step 7: Run the tests and build**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/formatters.js frontend/src/lib/formatters.test.js frontend/src/components/forms/UsagePicker.jsx frontend/src/config/scopeColors.js frontend/src/config/scopeColors.test.js frontend/src/pages/add-tabs/OptionsAddTab.jsx frontend/src/pages/modify-tabs/OptionsModifyTab.jsx frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx
git commit -m "feat(options): usage picker and usage-aware vocabulary filter" -- frontend/src/lib/formatters.js frontend/src/lib/formatters.test.js frontend/src/components/forms/UsagePicker.jsx frontend/src/config/scopeColors.js frontend/src/config/scopeColors.test.js frontend/src/pages/add-tabs/OptionsAddTab.jsx frontend/src/pages/modify-tabs/OptionsModifyTab.jsx frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx
```

---

## Task 14: The shared sources editor

**Files:**
- Create: `frontend/src/components/forms/SourcesEditor.jsx`
- Test: `frontend/src/components/forms/SourcesEditor.test.jsx`

**Interfaces:**
- Consumes: `getSourceValues` (Task 13).
- Produces: `<SourcesEditor value={rows} onChange={fn} mediaType="anime" sources={sources} />` where a row is `{ kind, bucket, name, url, available }`.

This replaces the eight copy-pasted `source_other` blocks (`AnimeAddTab.jsx:672-719` and its seven twins).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/forms/SourcesEditor.test.jsx`:

```jsx
// The one editor behind every media type's Sources block. Guards the three
// things the eight copy-pasted editors used to get subtly wrong: rows are
// identified by index not by name, a blank name is dropped on save, and the
// bucket is explicit rather than implied.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SourcesEditor from "./SourcesEditor";

const sources = {
  options: [
    { category: "Platform", value: "Netflix", scopes: [], usages: [] },
    { category: "Platform", value: "Fox", scopes: [], usages: ["origin"] },
  ],
};

function renderEditor(value = [], onChange = vi.fn()) {
  render(
    <SourcesEditor
      value={value}
      onChange={onChange}
      mediaType="anime"
      sources={sources}
    />,
  );
  return onChange;
}

describe("SourcesEditor", () => {
  it("adds a free-form row to the other bucket", () => {
    const onChange = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /add other source/i }));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "access", bucket: "other", name: "", url: "", available: null },
    ]);
  });

  it("adds a row to the restricted bucket separately", () => {
    const onChange = renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: /add restricted source/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      {
        kind: "access",
        bucket: "restricted",
        name: "",
        url: "",
        available: null,
      },
    ]);
  });

  it("removes the row at the clicked index, not the first with that name", () => {
    const rows = [
      { kind: "access", bucket: "other", name: "Same", url: "a" },
      { kind: "access", bucket: "other", name: "Same", url: "b" },
    ];
    const onChange = renderEditor(rows);
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    expect(onChange).toHaveBeenCalledWith([rows[0]]);
  });

  it("does not offer an origin-only platform as a watch source", () => {
    renderEditor([
      { kind: "access", bucket: "main", name: "", url: "", available: null },
    ]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Netflix");
    expect(options).not.toContain("Fox");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/forms/SourcesEditor.test.jsx`
Expected: FAIL — cannot resolve `./SourcesEditor`.

- [ ] **Step 3: Build the editor**

Create `frontend/src/components/forms/SourcesEditor.jsx`. It renders three groups — main (a select per vocabulary platform, with an availability tristate and a URL), other, and restricted — and calls `onChange` with the whole array on every edit. Rows are keyed and spliced **by index**; the old editors used `filter((x, j) => j !== i)` correctly but `Object.entries` at save time collapsed duplicate names, which is the bug this fixes.

Read `AnimeAddTab.jsx:672-719` first and keep the visual structure; only the data shape changes. Use `getSourceValues(sources, { kind: "option", category: "Platform", scope: mediaType, usage: "watch" })` for the main-row select and `category: "Reference Source"` for reference rows.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/components/forms/SourcesEditor.test.jsx`
Expected: 4 passed

- [ ] **Step 5: Lint, build, commit**

```bash
cd frontend && npm run lint && npm run build
git add frontend/src/components/forms/SourcesEditor.jsx frontend/src/components/forms/SourcesEditor.test.jsx
git commit -m "feat(sources): one shared sources editor" -- frontend/src/components/forms/SourcesEditor.jsx frontend/src/components/forms/SourcesEditor.test.jsx
```

---

## Task 15: Rewrite `SourcesCard`

**Files:**
- Modify: `frontend/src/components/info/SourcesCard.jsx`
- Test: `frontend/src/components/info/SourcesCard.test.jsx`

**Interfaces:**
- Consumes: `sources: SourceRef[]` from the entry response (Task 6).
- Produces: `<SourcesCard sources={entry.sources} mediaType="anime" malLink={...} imdbLink={...} comicvineLink={...} originalSource={...} exclusiveSource={...} serializationPlatform={...} />`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/info/SourcesCard.test.jsx`:

```jsx
// Two sections, not one flat list: where to watch/read, and where to look up.
// Row order comes from the server (vocabulary sort_order), so the card must
// not re-sort.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SourcesCard from "./SourcesCard";

const rows = [
  { system_id: "1", kind: "access", bucket: "main", name: "Bahamut", url: "https://b.test", available: true },
  { system_id: "2", kind: "access", bucket: "main", name: "Netflix", url: null, available: false },
  { system_id: "3", kind: "access", bucket: "restricted", name: "Elsewhere", url: "https://e.test" },
  { system_id: "4", kind: "reference", bucket: "main", name: "Wikipedia", url: "https://w.test" },
];

describe("SourcesCard", () => {
  it("splits access rows from reference rows", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const watch = screen.getByRole("region", { name: /where to watch/i });
    expect(within(watch).getByText("Bahamut")).toBeInTheDocument();
    expect(within(watch).queryByText("Wikipedia")).not.toBeInTheDocument();
  });

  it("says Where to Read for a reading type", () => {
    render(<SourcesCard sources={rows} mediaType="manga" />);
    expect(screen.getByRole("region", { name: /where to read/i })).toBeInTheDocument();
  });

  it("keeps the server's order", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const names = screen.getAllByTestId("source-name").map((n) => n.textContent);
    expect(names.slice(0, 2)).toEqual(["Bahamut", "Netflix"]);
  });

  it("renders an unavailable platform as text, not a link", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    expect(screen.queryByRole("link", { name: /netflix/i })).toBeNull();
  });

  it("renders the column-backed links alongside the rows", () => {
    render(
      <SourcesCard sources={rows} mediaType="anime" malLink="https://mal.test" />,
    );
    expect(screen.getByRole("link", { name: /myanimelist/i })).toBeInTheDocument();
  });

  it("says so when there is nothing at all", () => {
    render(<SourcesCard sources={[]} mediaType="anime" />);
    expect(screen.getByText(/no sources recorded/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/info/SourcesCard.test.jsx`
Expected: FAIL — the current component takes `sourceOther`/`showBaha`/etc., not `sources`.

- [ ] **Step 3: Rewrite the component**

Keep `Slip`, `SourceLink`, `SourceRow` and `Tag` exactly as they are — only the props and the body change. The new body maps `sources` into two sections and appends the column-backed links to the reference section. Heading text comes from the media type:

```jsx
const READING_TYPES = new Set(["manga", "novel", "comic"]);
const accessHeading = (mediaType) =>
  READING_TYPES.has(mediaType) ? "Where to Read" : "Where to Watch";
```

Do **not** sort — the server already ordered by `position` (vocabulary `sort_order` for `main` rows, insertion order for the free-form buckets).

Delete the `showBaha` / `bahaLink` / `sourceNetflix` / `sourceOther` / `officialLink` / `twitterLink` / `anilistLink` / `officialSource` props entirely.

- [ ] **Step 4: Run the tests, lint, build**

```bash
cd frontend && npx vitest run src/components/info/SourcesCard.test.jsx && npm run lint && npm run build
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/info/SourcesCard.jsx frontend/src/components/info/SourcesCard.test.jsx
git commit -m "feat(sources): SourcesCard splits access from reference" -- frontend/src/components/info/SourcesCard.jsx frontend/src/components/info/SourcesCard.test.jsx
```

---

## Task 16: Wire the eight detail pages

**Files:**
- Modify: `frontend/src/pages/detail/{Anime,AnimeMovie,Movie,TV,Cartoon,Manga,Novel,Comic}.jsx`
- Modify: `frontend/src/components/cards/MediaCard.jsx:78-98`, `frontend/src/components/tracker/DashboardCard.jsx:153-180`

**Interfaces:**
- Consumes: the new `SourcesCard` (Task 15).
- Produces: no `source_other`, `baha_link`, `source_netflix` or `anilist_link` reference anywhere in `frontend/src/`.

- [ ] **Step 1: Write the failing guard test**

Create `frontend/src/lib/noLegacySourceFields.test.js`:

```js
// A tripwire, not a unit test: the eight detail pages used to reach into
// source_other and baha_link directly. Once sources arrive as rows, any
// surviving reference is a bug.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DEAD = [
  "source_other",
  "baha_link",
  "source_netflix",
  "source_baha",
  "anilist_link",
  "official_link",
  "twitter_link",
  "source_official",
];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : e.name.endsWith(".jsx") || e.name.endsWith(".js")
        ? [join(dir, e.name)]
        : [],
  );
}

describe("legacy source fields", () => {
  it("are gone from the whole frontend", () => {
    const offenders = [];
    for (const file of walk("src")) {
      if (file.includes("noLegacySourceFields")) continue;
      const text = readFileSync(file, "utf8");
      for (const dead of DEAD) {
        if (text.includes(dead)) offenders.push(`${file}: ${dead}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/lib/noLegacySourceFields.test.js`
Expected: FAIL, listing every remaining reference.

- [ ] **Step 3: Update each detail page**

Replace each `<SourcesCard ... />` call. The eight become, respectively:

```jsx
// Anime.jsx:285, AnimeMovie.jsx:251
<SourcesCard sources={anime.sources} mediaType="anime" malLink={anime.mal_link} exclusiveSource={anime.exclusive_source} />

// Movie.jsx:263
<SourcesCard sources={movie.sources} mediaType="movie" imdbLink={movie.imdb_link} originalSource={movie.original_source} />

// TV.jsx:274, Cartoon.jsx:283
<SourcesCard sources={show.sources} mediaType="tv-show" imdbLink={show.imdb_link} originalSource={show.original_source} />

// Manga.jsx:523
<SourcesCard sources={manga.sources} mediaType="manga" malLink={manga.mal_link} serializationPlatform={manga.serialization_platform} />

// Novel.jsx:368
<SourcesCard sources={novel.sources} mediaType="novel" malLink={novel.mal_link} serializationPlatform={novel.serialization_platform} />

// Comic.jsx:289
<SourcesCard sources={comic.sources} mediaType="comic" comicvineLink={comic.comicvine_link} />
```

Movie now renders `original_source` for the first time, and Comic renders `comicvine_link` for the first time — both were declared but never passed.

- [ ] **Step 4: Delete the Twitter string-match**

Remove the block at `Manga.jsx:394-400` (`rawSourceOther`, `twitterLink`, `filteredSourceOther`) and its twin in `Novel.jsx`. Twitter is a `reference` row now.

- [ ] **Step 5: Delete the duplicate serialization render**

Remove `Manga.jsx:630` — `serialization_platform` shows in Sources only.

- [ ] **Step 6: Update the card components**

`MediaCard.jsx:78-98` and `DashboardCard.jsx:153-180` read `baha_link` and `source_netflix` directly. Rewrite both to pick the row out of `sources`:

```jsx
const bahaRow = (data.sources || []).find(
  (s) => s.kind === "access" && s.name === "Bahamut",
);
const hasBahaLink = bahaRow?.available && bahaRow.url;
```

- [ ] **Step 7: Run everything**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green, including the tripwire.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/detail frontend/src/components/cards/MediaCard.jsx frontend/src/components/tracker/DashboardCard.jsx frontend/src/lib/noLegacySourceFields.test.js
git commit -m "feat(sources): detail pages and cards read source rows" -- frontend/src/pages/detail frontend/src/components/cards/MediaCard.jsx frontend/src/components/tracker/DashboardCard.jsx frontend/src/lib/noLegacySourceFields.test.js
```

---

## Task 17: Wire the admin forms

**Files:**
- Modify: `frontend/src/pages/add-tabs/*AddTab.jsx` (all 8)
- Modify: `frontend/src/pages/modify-tabs/*ModifyTab.jsx` (all 8)
- Modify: `frontend/src/config/formFactories.js`, `frontend/src/config/formFields/fieldMeta.js`
- Modify: `frontend/src/lib/payloads.js:168-238`

**Interfaces:**
- Consumes: `<SourcesEditor />` (Task 14).
- Produces: forms that post `sources: [{kind, bucket, name, url, available}]`.

- [ ] **Step 1: Write the failing test**

Extend `frontend/src/lib/payloads.test.js` (create it if absent):

```js
import { describe, expect, it } from "vitest";

import { buildAnimePayload } from "./payloads";

describe("source rows in the payload", () => {
  it("drops rows with a blank name", () => {
    const payload = buildAnimePayload({
      sources: [
        { kind: "access", bucket: "other", name: "  ", url: "x" },
        { kind: "access", bucket: "other", name: "Keep", url: "y" },
      ],
    });
    expect(payload.sources).toEqual([
      { kind: "access", bucket: "other", name: "Keep", url: "y", available: null },
    ]);
  });

  it("keeps two rows that share a name", () => {
    const payload = buildAnimePayload({
      sources: [
        { kind: "access", bucket: "other", name: "Same", url: "a" },
        { kind: "access", bucket: "other", name: "Same", url: "b" },
      ],
    });
    expect(payload.sources).toHaveLength(2);
  });
});
```

> The second test is the bug fix: `Object.fromEntries` in the old `payloads.js` collapsed same-named rows silently.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/lib/payloads.test.js`
Expected: FAIL.

- [ ] **Step 3: Replace the payload mapping**

In `frontend/src/lib/payloads.js`, delete the eight `source_other: ... Object.fromEntries(...)` blocks (lines 168-171, 235-238 and their twins) and replace each with:

```js
    sources: (f.sources || [])
      .filter((s) => (s.name || "").trim())
      .map((s) => ({
        kind: s.kind || "access",
        bucket: s.bucket || "other",
        name: s.name.trim(),
        url: (s.url || "").trim() || null,
        available: s.available ?? null,
      })),
```

- [ ] **Step 4: Update the form factories**

In `frontend/src/config/formFactories.js`, replace all eight `source_other: []` defaults (lines 60, 94, 120, 148, 177, 216, 261, 296) with `sources: []`, and delete `source_baha: ""`, `baha_link: ""`, `source_netflix: ""` (lines 57-59) and `serialization_platform: ""` (line 211).

- [ ] **Step 5: Update fieldMeta**

In `frontend/src/config/formFields/fieldMeta.js`, delete the `baha_link`, `source_netflix` and `source_other` entries (lines 195-208). Change `serialization_platform` (line 501) to a vocabulary-backed tags control and move it out of the Credits group:

```js
    serialization_platform: {
      label: "Serialization Platform",
      control: "tags",
      source: {
        kind: "option",
        category: "Serialization Platform",
        scope: "manga",
      },
      group: "Sources",
    },
```

Add `original_source` (movie, tv-show, cartoon) and `exclusive_source` (anime, anime-movie) entries in the same shape, drawing on `category: "Platform"` with `usage: "origin"`.

- [ ] **Step 6: Swap the editors**

In each of the eight `*AddTab.jsx` files, delete the copy-pasted `source_other` block (e.g. `AnimeAddTab.jsx:672-719`) and replace with:

```jsx
<SourcesEditor
  value={af.sources}
  onChange={(rows) => ua("sources", rows)}
  mediaType="anime"
  sources={sources}
/>
```

Do the same in the eight `*ModifyTab.jsx` files. Delete the `serialization_platform` bare `<input>` at `MangaAddTab.jsx:422-428` and `MangaModifyTab.jsx:345` — it is a tags control now, rendered by the generic field machinery.

- [ ] **Step 7: Run everything**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green, including the Task 16 tripwire, which now has no remaining offenders.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/add-tabs frontend/src/pages/modify-tabs frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/lib/payloads.test.js
git commit -m "feat(sources): admin forms use the shared editor" -- frontend/src/pages/add-tabs frontend/src/pages/modify-tabs frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/lib/payloads.test.js
```

---

## Task 18: Documentation

**Files:**
- Modify: `docs/data-model.md`, `docs/options.md`, `docs/authorization.md`, `docs/entry-types.md`, `docs/data-actions.md`, `docs/frontend/components.md`, `docs/business-rules.md`, `docs/api.md`, `docs/roadmap.md`

- [ ] **Step 1: `docs/data-model.md`**

Remove the `source_other`, `source_baha`, `source_netflix`, `baha_link`, `official_link`, `twitter_link`, `anilist_link` and `serialization_platform` rows from the eight entry tables (line 206 and the per-type blocks at 248, 250, 274, 276, 321, 342). Add a `media_source` section and a `system_option_usage` section, following the format of the existing `media_relation` section.

- [ ] **Step 2: `docs/options.md`**

Document the `Platform`, `Reference Source` and `Serialization Platform` categories, and the `usage` axis — what "no usage rows means both" means, and why Fox is origin-only.

- [ ] **Step 3: `docs/authorization.md`**

Add `sources_restricted` to the field group table. Document the fifth storage flavour (`source_buckets`) and note that `sources_other` kept its permission key so existing grants survive.

- [ ] **Step 4: `docs/data-actions.md`**

Document the `Media Source` and `System Option Usage` tabs, their position in the restore order, and the `option_category`/`option_value` columns standing in for `option_id`. **Include the breaking-change rollout note** from the spec: Backup from the newer machine before the other pulls.

- [ ] **Step 5: `docs/frontend/components.md`**

Update the `SourcesCard` entry for its new props, and add `SourcesEditor` and `UsagePicker`. Update the "adding a media type" checklist to mention registering `sources` in `nested_collections`.

- [ ] **Step 6: `docs/business-rules.md`**

Record the guiding rule verbatim: *a link the system acts on is a column; a link that is only ever displayed is a `media_source` row*. Record that `exclusive_source` blank means "not exclusive", not "unknown".

- [ ] **Step 7: `docs/api.md`**

Document `sources` on every entry response, the `usage` query parameter on `/api/options/`, and the 400 on a second `exclusive_source` value.

- [ ] **Step 8: Bump every `Last verified` line to 2026-09-04 and update the roadmap**

Mark the sources work done in `docs/roadmap.md`'s progress section. Do not modify the plan itself.

- [ ] **Step 9: Commit**

```bash
git add docs/
git commit -m "docs(sources): media_source, usage axis, and the Media Source tab" -- docs/
```

---

## Post-implementation checklist

- [ ] `venv/Scripts/python.exe -m pytest -q` — green
- [ ] `venv/Scripts/ruff.exe check .` — clean
- [ ] `cd frontend && npm run test:run && npm run lint` — green
- [ ] `cd frontend && npm run build` — done, so `:8000` matches `:5173`
- [ ] `venv/Scripts/python.exe -m alembic heads` — exactly one head
- [ ] **Run Backup** from this machine before touching the other one. The sheet's shape has changed; an old sheet pulled into the new schema drops every source. See `docs/switching-environments.md`.
