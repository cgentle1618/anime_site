# To Rewatch / To Reread Per-Type Scopes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the nine scattered `to_rewatch` / `to_reread` booleans into the existing `plan_next` table behind a new `kind` column, so franchises, series and entries can each be marked for rewatch according to a per-media-type scope map.

**Architecture:** `plan_next` gains `kind ∈ {next, rewatch}`. Its unique constraint and index widen to include it. `ALLOWED_SCOPES` in `app/utils/plan_next_kinds.py` gains a kind dimension, because rewatch's scope map genuinely differs from next's — anime and cartoon rewatch at franchise scope only, novel rewatches at all three. Entry-level `to_rewatch` / `to_reread` survive on the API as virtual fields over the table, exactly as Task 6 of the plan-next plan does for `watch_next`, so ~30 frontend files need no change.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, Alembic, pytest; React + Vite + Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-rewatch-levels-design.md`

## Hard Dependency

**Do not start this plan until `docs/superpowers/plans/2026-08-29-plan-next.md` has completed through Task 10.** Every task below consumes something those tasks build:

| This plan needs | Built by plan-next task |
|---|---|
| `models.PlanNext`, the migration chain | Task 3 (done, `583ac70`) |
| `app/services/domain/plan_next.py` | Task 4 |
| `PlanNextCreate` / `PlanNextRead`, the router, `/api/plan-next/kinds` | Task 5 |
| `set_entry_flag` / `entry_flag` / `planned_entry_ids`, `_factory.py` translation | Task 6 |
| `parse_plan_next_from_sheet`, the "Plan Next" Sheets tab | Task 7 |
| `planNextGroups.js`, `planNext.js` | Task 8 |
| `SizeGroupControls.jsx` | Task 9 |
| Rewritten `usePlanData`, `PlanNextCard.jsx` | Task 10 |

Before starting, verify: `git log --oneline | grep plan-next` shows at least ten commits, and `frontend/src/pages/plan/PlanNextCard.jsx` exists.

## Global Constraints

- **Media type keys are hyphenated**: `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`. These are the `MEDIA_TABLES` keys in `app/utils/media_resolver.py`. Never introduce the underscored spelling.
- **Kind keys** are exactly `next` and `rewatch`. **Scope keys** are exactly `entry`, `series`, `franchise`.
- Physical table names differ from media type keys: `anime`, `anime_movies`, `movies`, `tv_shows`, `cartoons`, `manga`, `novel`, `comic`, `franchise`, `series`.
- **`kind` defaults to `"next"`** wherever it is omitted — on the API, in helper signatures, in the migration backfill. This is what keeps every plan-next call site working unedited.
- Backend lives under `app/`. Dev server: `uvicorn app.main:app --reload --reload-dir app`.
- Tests run with the project venv: `venv/Scripts/python.exe -m pytest`. API tests require the `anime_site_test` PostgreSQL database (see `tests/api/conftest.py`).
- **After any frontend change run `cd frontend && npm run build`** — port 8000 serves the prebuilt `frontend_dist/` bundle and will otherwise serve stale code.
- Other Claude Code sessions may be editing this branch. Stage only the files named in each task's commit step. Never `git add -A`.

## Scope Map (the substance of this plan)

| Type | `next` scopes (existing) | `rewatch` scopes (new) |
|---|---|---|
| anime | entry, series, franchise | **franchise** |
| anime-movie | entry | entry |
| movie | entry, series, franchise | entry, series, franchise |
| tv-show | entry, series, franchise | entry, series, franchise |
| cartoon | entry, series, franchise | **franchise** |
| manga | entry | entry |
| novel | entry | **entry, series, franchise** |
| comic | entry, series | entry, series |

---

### Task 1: Kind vocabulary

Adds the kind dimension to the vocabulary module and moves every call site to the new `scope_allowed` signature. Pure data and pure functions — no DB, no FastAPI.

**Files:**
- Modify: `app/utils/plan_next_kinds.py`
- Modify: every caller of `scope_allowed` (find them in Step 3)
- Test: `tests/unit/test_plan_next_kinds.py`

**Interfaces:**
- Consumes: `MEDIA_TYPE_KEYS` from `app/utils/media_resolver.py`.
- Produces:
  - `KINDS: tuple[str, ...]` — `("next", "rewatch")`
  - `ALLOWED_SCOPES: dict[str, dict[str, frozenset[str]]]` — keyed by kind, then media type
  - `scope_allowed(kind: str, media_type: str, scope: str) -> bool`
  - `kind_valid(kind: str) -> bool`
  - `allowed_scopes_for(kind: str) -> dict[str, frozenset[str]]`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_plan_next_kinds.py`:

```python
import pytest

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils.plan_next_kinds import (
    ALLOWED_SCOPES,
    KINDS,
    allowed_scopes_for,
    kind_valid,
    scope_allowed,
)


class TestKindVocabulary:
    def test_kinds_are_next_and_rewatch(self):
        assert KINDS == ("next", "rewatch")

    def test_kind_valid(self):
        assert kind_valid("next")
        assert kind_valid("rewatch")
        assert not kind_valid("reread")
        assert not kind_valid("")

    def test_every_kind_covers_every_media_type(self):
        for kind in KINDS:
            assert set(ALLOWED_SCOPES[kind]) == set(MEDIA_TYPE_KEYS), kind


class TestRewatchScopes:
    # The whole point of the kind dimension: rewatch's map is not next's.
    @pytest.mark.parametrize(
        "media_type,expected",
        [
            ("anime", {"franchise"}),
            ("anime-movie", {"entry"}),
            ("movie", {"entry", "series", "franchise"}),
            ("tv-show", {"entry", "series", "franchise"}),
            ("cartoon", {"franchise"}),
            ("manga", {"entry"}),
            ("novel", {"entry", "series", "franchise"}),
            ("comic", {"entry", "series"}),
        ],
    )
    def test_rewatch_scope_map(self, media_type, expected):
        assert set(ALLOWED_SCOPES["rewatch"][media_type]) == expected

    def test_anime_differs_between_kinds(self):
        # Anime is queued one season at a time but rewatched whole.
        assert scope_allowed("next", "anime", "entry")
        assert not scope_allowed("rewatch", "anime", "entry")
        assert scope_allowed("rewatch", "anime", "franchise")

    def test_novel_differs_between_kinds(self):
        assert not scope_allowed("next", "novel", "series")
        assert scope_allowed("rewatch", "novel", "series")

    def test_unknown_kind_allows_nothing(self):
        assert not scope_allowed("nope", "movie", "entry")

    def test_allowed_scopes_for_returns_the_inner_map(self):
        assert allowed_scopes_for("rewatch")["manga"] == frozenset({"entry"})
        assert allowed_scopes_for("nope") == {}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_plan_next_kinds.py -v
```

Expected: FAIL with `ImportError: cannot import name 'KINDS'`.

- [ ] **Step 3: Find every caller of the old signature**

```bash
grep -rn "scope_allowed\|ALLOWED_SCOPES" app/ tests/ --include=*.py
```

Record the list. Every hit outside `plan_next_kinds.py` itself must be updated in Step 4. Expect hits in `app/routers/plan_next.py` and `app/services/domain/plan_next.py`.

- [ ] **Step 4: Re-key the vocabulary**

In `app/utils/plan_next_kinds.py`, replace the `ALLOWED_SCOPES` block and `scope_allowed`:

```python
# The two things a Plan row can mean. Not a DB enum: validated in the API
# layer, the same choice media_type and scope already make, so adding a kind
# needs no migration.
KINDS: tuple[str, ...] = ("next", "rewatch")

# Which scopes each media type may use, per kind. The two maps differ on
# purpose: anime is queued one season at a time but rewatched as a whole
# franchise, and novels are reread at every tier though they are only ever
# queued one book at a time.
ALLOWED_SCOPES: dict[str, dict[str, frozenset[str]]] = {
    "next": {
        "anime": frozenset({"entry", "series", "franchise"}),
        "movie": frozenset({"entry", "series", "franchise"}),
        "tv-show": frozenset({"entry", "series", "franchise"}),
        "cartoon": frozenset({"entry", "series", "franchise"}),
        "comic": frozenset({"entry", "series"}),
        "anime-movie": frozenset({"entry"}),
        "manga": frozenset({"entry"}),
        "novel": frozenset({"entry"}),
    },
    "rewatch": {
        "anime": frozenset({"franchise"}),
        "movie": frozenset({"entry", "series", "franchise"}),
        "tv-show": frozenset({"entry", "series", "franchise"}),
        "cartoon": frozenset({"franchise"}),
        "comic": frozenset({"entry", "series"}),
        "anime-movie": frozenset({"entry"}),
        "manga": frozenset({"entry"}),
        "novel": frozenset({"entry", "series", "franchise"}),
    },
}


def kind_valid(kind: str) -> bool:
    """True when this is a kind the Plan page knows about."""
    return kind in KINDS


def allowed_scopes_for(kind: str) -> dict[str, frozenset[str]]:
    """The media-type to scopes map for one kind. Empty for an unknown kind."""
    return ALLOWED_SCOPES.get(kind, {})


def scope_allowed(kind: str, media_type: str, scope: str) -> bool:
    """True when this media type may be marked at this scope, for this kind."""
    return scope in allowed_scopes_for(kind).get(media_type, frozenset())
```

Replace the closing assertion:

```python
# Guards the maps against drifting from the resolver's key list.
assert set(ALLOWED_SCOPES) == set(KINDS)
for _kind, _map in ALLOWED_SCOPES.items():
    assert set(_map) == set(MEDIA_TYPE_KEYS), _kind
assert set(SIZE_THRESHOLDS) <= set(MEDIA_TYPE_KEYS)
```

Update the module docstring's first paragraph to say the map is keyed by kind.

- [ ] **Step 5: Update every call site found in Step 3**

Each `scope_allowed(media_type, scope)` becomes `scope_allowed("next", media_type, scope)` unless that call site already has a kind in hand. Each `ALLOWED_SCOPES[x]` becomes `ALLOWED_SCOPES["next"][x]` or `allowed_scopes_for(kind)[x]`.

- [ ] **Step 6: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_plan_next_kinds.py -v
venv/Scripts/python.exe -m pytest tests/ -q
```

Expected: the new tests PASS, and the full suite shows no *new* failures versus before this task.

- [ ] **Step 7: Commit**

```bash
git add app/utils/plan_next_kinds.py tests/unit/test_plan_next_kinds.py
# plus every file changed in Step 5
git commit -m "feat(rewatch): add the kind dimension to the plan scope vocabulary"
```

---

### Task 2: The `kind` column and its migration

Adds the column, widens the constraint and index, backfills rewatch rows from the nine booleans, then drops them.

**Files:**
- Modify: `app/models/plan_next.py`
- Modify: `app/models/franchise.py` (drop `to_rewatch` from `Franchise` and `Series`)
- Modify: `app/models/anime_movie.py`, `app/models/movie.py`, `app/models/tv_show.py`, `app/models/cartoon.py`, `app/models/manga.py`, `app/models/novel.py`, `app/models/comic.py`
- Create: `alembic/versions/<hash>_add_plan_next_kind.py`
- Test: `tests/api/test_plan_next_kind_model.py`

**Interfaces:**
- Consumes: Task 1's `KINDS`.
- Produces: `models.PlanNext.kind`; the constraint `uq_plan_next_target` over `(kind, scope, target_id, media_type)`; the index `ix_plan_next_kind_type_scope`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_plan_next_kind_model.py`:

```python
"""
The kind column on plan_next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def _row(db, kind, scope="franchise", media_type="anime", target_id=None):
    row = models.PlanNext(
        kind=kind,
        scope=scope,
        media_type=media_type,
        target_id=target_id or uuid.uuid4(),
    )
    db.add(row)
    db.commit()
    return row


def test_kind_is_stored(db):
    row = _row(db, "rewatch")
    db.refresh(row)
    assert row.kind == "rewatch"


def test_same_target_under_both_kinds_is_allowed(db):
    # A franchise can be both queued and marked for rewatch.
    target = uuid.uuid4()
    _row(db, "next", target_id=target)
    _row(db, "rewatch", target_id=target)
    assert db.query(models.PlanNext).filter_by(target_id=target).count() == 2


def test_duplicate_within_one_kind_is_rejected(db):
    target = uuid.uuid4()
    _row(db, "rewatch", target_id=target)
    with pytest.raises(IntegrityError):
        _row(db, "rewatch", target_id=target)
    db.rollback()


def test_kind_is_not_nullable(db):
    row = models.PlanNext(
        scope="entry", media_type="movie", target_id=uuid.uuid4()
    )
    db.add(row)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_kind_model.py -v
```

Expected: FAIL — `TypeError: 'kind' is an invalid keyword argument for PlanNext`.

- [ ] **Step 3: Add the column to the model**

In `app/models/plan_next.py`, add above `media_type`:

```python
    # "next" or "rewatch" - one of KINDS in app/utils/plan_next_kinds.py.
    # The table holds both Plan-page queues; the name predates the second one.
    kind = Column(String, nullable=False)
```

Replace `__table_args__`:

```python
    __table_args__ = (
        # One row per marked thing per media type per kind. A franchise can be
        # both queued and marked for rewatch, so kind joins the key.
        UniqueConstraint(
            "kind", "scope", "target_id", "media_type", name="uq_plan_next_target"
        ),
        # The Plan page reads one tab of one section at a time.
        Index("ix_plan_next_kind_type_scope", "kind", "media_type", "scope"),
    )
```

Update the class docstring: it currently says the table holds what is queued to watch or read next. It now holds both kinds.

- [ ] **Step 4: Drop the nine boolean columns from the models**

Delete the `to_rewatch` line from `Franchise` and `Series` in `app/models/franchise.py`, and from `app/models/anime_movie.py:86`, `app/models/movie.py:72`, `app/models/tv_show.py:70`, `app/models/cartoon.py:71`. Delete the `to_reread` line from `app/models/manga.py:94`, `app/models/novel.py:102`, `app/models/comic.py:95`.

Line numbers are as of this plan's writing — grep to confirm:

```bash
grep -rn "to_rewatch\|to_reread" app/models/*.py
```

- [ ] **Step 5: Generate the migration**

```bash
venv/Scripts/python.exe -m alembic revision -m "add plan_next kind and drop rewatch booleans"
```

Do **not** use `--autogenerate` — the backfill has to interleave with the DDL. Write `upgrade()` by hand:

```python
def upgrade() -> None:
    conn = op.get_bind()

    # 1. kind, nullable first so existing rows survive the add.
    op.add_column("plan_next", sa.Column("kind", sa.String(), nullable=True))
    conn.execute(sa.text("UPDATE plan_next SET kind = 'next'"))
    op.alter_column("plan_next", "kind", nullable=False)

    # 2. Widen the key. Drop before create: the old constraint would reject
    #    the same target appearing under a second kind.
    op.drop_constraint("uq_plan_next_target", "plan_next", type_="unique")
    op.create_unique_constraint(
        "uq_plan_next_target", "plan_next", ["kind", "scope", "target_id", "media_type"]
    )
    op.drop_index("ix_plan_next_type_scope", table_name="plan_next")
    op.create_index(
        "ix_plan_next_kind_type_scope", "plan_next", ["kind", "media_type", "scope"]
    )

    # 3a. Entry-scope rewatch rows, one per flagged entry.
    #     cartoons is deliberately absent: cartoon moves to franchise-only and
    #     its entry marks are discarded (see the spec's migration section).
    entry_tables = [
        ("anime_movies", "to_rewatch", "anime-movie"),
        ("movies", "to_rewatch", "movie"),
        ("tv_shows", "to_rewatch", "tv-show"),
        ("manga", "to_reread", "manga"),
        ("novel", "to_reread", "novel"),
        ("comic", "to_reread", "comic"),
    ]
    for table, column, media_type in entry_tables:
        conn.execute(
            sa.text(
                f"""
                INSERT INTO plan_next
                    (system_id, kind, scope, media_type, target_id, created_at, updated_at)
                SELECT gen_random_uuid(), 'rewatch', 'entry', :mt, system_id, NOW(), NOW()
                FROM {table}
                WHERE {column} IS TRUE
                """
            ),
            {"mt": media_type},
        )

    # 3b. Group-scope rows, one per media type the group actually holds.
    #     Types come from the child entries, never from franchise_type: that
    #     column is multi-valued, bundles types (ACG implies anime and manga
    #     and novel), and carries an undocumented legacy "Anime" value.
    group_sources = [
        # (group column on the entry table, scope, legal media types)
        ("franchise_id", "franchise", ["anime", "movie", "tv-show", "cartoon", "novel"]),
        ("series_id", "series", ["movie", "tv-show", "novel", "comic"]),
    ]
    entry_type_tables = [
        ("anime", "anime"),
        ("anime_movies", "anime-movie"),
        ("movies", "movie"),
        ("tv_shows", "tv-show"),
        ("cartoons", "cartoon"),
        ("manga", "manga"),
        ("novel", "novel"),
        ("comic", "comic"),
    ]
    for fk_column, scope, legal in group_sources:
        group_table = "franchise" if scope == "franchise" else "series"
        for table, media_type in entry_type_tables:
            if media_type not in legal:
                continue
            conn.execute(
                sa.text(
                    f"""
                    INSERT INTO plan_next
                        (system_id, kind, scope, media_type, target_id, created_at, updated_at)
                    SELECT DISTINCT gen_random_uuid(), 'rewatch', :scope, :mt,
                           g.system_id, NOW(), NOW()
                    FROM {group_table} g
                    JOIN {table} e ON e.{fk_column} = g.system_id
                    WHERE g.to_rewatch IS TRUE
                    """
                ),
                {"scope": scope, "mt": media_type},
            )

    # 4. The rows are the source of truth now.
    for table, column in [
        ("franchise", "to_rewatch"),
        ("series", "to_rewatch"),
        ("anime_movies", "to_rewatch"),
        ("movies", "to_rewatch"),
        ("tv_shows", "to_rewatch"),
        ("cartoons", "to_rewatch"),
        ("manga", "to_reread"),
        ("novel", "to_reread"),
        ("comic", "to_reread"),
    ]:
        op.drop_column(table, column)
```

`downgrade()` reverses it, accepting the loss the spec records:

```python
def downgrade() -> None:
    conn = op.get_bind()

    for table, column in [
        ("franchise", "to_rewatch"),
        ("series", "to_rewatch"),
        ("anime_movies", "to_rewatch"),
        ("movies", "to_rewatch"),
        ("tv_shows", "to_rewatch"),
        ("cartoons", "to_rewatch"),
        ("manga", "to_reread"),
        ("novel", "to_reread"),
        ("comic", "to_reread"),
    ]:
        op.add_column(
            table,
            sa.Column(column, sa.Boolean(), nullable=True, server_default=sa.false()),
        )

    # Per-type detail collapses back to one boolean. Discarded cartoon entry
    # marks do not return.
    for table, column, media_type in [
        ("anime_movies", "to_rewatch", "anime-movie"),
        ("movies", "to_rewatch", "movie"),
        ("tv_shows", "to_rewatch", "tv-show"),
        ("manga", "to_reread", "manga"),
        ("novel", "to_reread", "novel"),
        ("comic", "to_reread", "comic"),
    ]:
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} SET {column} = TRUE
                WHERE system_id IN (
                    SELECT target_id FROM plan_next
                    WHERE kind = 'rewatch' AND scope = 'entry' AND media_type = :mt
                )
                """
            ),
            {"mt": media_type},
        )
    for group_table, scope in [("franchise", "franchise"), ("series", "series")]:
        conn.execute(
            sa.text(
                f"""
                UPDATE {group_table} SET to_rewatch = TRUE
                WHERE system_id IN (
                    SELECT target_id FROM plan_next
                    WHERE kind = 'rewatch' AND scope = :scope
                )
                """
            ),
            {"scope": scope},
        )

    conn.execute(sa.text("DELETE FROM plan_next WHERE kind = 'rewatch'"))
    op.drop_index("ix_plan_next_kind_type_scope", table_name="plan_next")
    op.create_index("ix_plan_next_type_scope", "plan_next", ["media_type", "scope"])
    op.drop_constraint("uq_plan_next_target", "plan_next", type_="unique")
    op.create_unique_constraint(
        "uq_plan_next_target", "plan_next", ["scope", "target_id", "media_type"]
    )
    op.drop_column("plan_next", "kind")
```

- [ ] **Step 6: Round-trip the migration**

```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic downgrade -1
venv/Scripts/python.exe -m alembic upgrade head
```

Expected: all three succeed with no error. If `gen_random_uuid()` is unavailable, add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` as the migration's first statement.

- [ ] **Step 7: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_kind_model.py -v
```

Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add app/models/plan_next.py app/models/franchise.py app/models/anime_movie.py \
        app/models/movie.py app/models/tv_show.py app/models/cartoon.py \
        app/models/manga.py app/models/novel.py app/models/comic.py \
        alembic/versions/ tests/api/test_plan_next_kind_model.py
git commit -m "feat(rewatch): add plan_next.kind, backfill rewatch rows, drop the nine booleans"
```

---

### Task 3: Schemas, router and domain helpers

Threads `kind` through the API surface and the domain helpers, defaulting to `"next"` everywhere so no plan-next call site needs editing.

**Files:**
- Modify: `app/schemas/plan_next.py`
- Modify: `app/routers/plan_next.py`
- Modify: `app/services/domain/plan_next.py`
- Test: `tests/api/test_plan_next_kind_api.py`

**Interfaces:**
- Consumes: Task 1's `KINDS`, `kind_valid`, `scope_allowed`, `allowed_scopes_for`; Task 2's `models.PlanNext.kind`.
- Produces:
  - `PlanNextCreate.kind: str = "next"`, `PlanNextRead.kind: str`
  - `GET /api/plan-next/?kind=` filter
  - `DELETE /api/plan-next/target` matching on `(kind, scope, media_type, target_id)`
  - `GET /api/plan-next/kinds` response gains `kinds: list[str]`, and `allowed_scopes` becomes keyed by kind
  - `set_entry_flag(db, media_type, entry_id, planned, kind="next") -> None`
  - `entry_flag(db, media_type, entry_id, kind="next") -> bool`
  - `planned_entry_ids(db, media_type, kind="next") -> set[UUID]`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_plan_next_kind_api.py`:

```python
"""
The kind parameter across /api/plan-next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid


def _payload(scope, target_id, media_type="movie", kind=None):
    body = {"media_type": media_type, "scope": scope, "target_id": str(target_id)}
    if kind is not None:
        body["kind"] = kind
    return body


def test_kind_defaults_to_next(admin_client, seeded_movie):
    res = admin_client.post("/api/plan-next/", json=_payload("entry", seeded_movie))
    assert res.status_code == 201
    assert res.json()["kind"] == "next"


def test_rewatch_row_round_trips(admin_client, seeded_movie):
    res = admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )
    assert res.status_code == 201
    assert res.json()["kind"] == "rewatch"


def test_same_target_under_both_kinds(admin_client, seeded_movie):
    assert admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie)
    ).status_code == 201
    assert admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    ).status_code == 201


def test_duplicate_within_a_kind_is_409(admin_client, seeded_movie):
    admin_client.post("/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch"))
    res = admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )
    assert res.status_code == 409


def test_unknown_kind_is_422(admin_client, seeded_movie):
    res = admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="reread")
    )
    assert res.status_code == 422


def test_anime_entry_is_legal_for_next_but_not_rewatch(admin_client, seeded_anime):
    # The scope map differs by kind; the router must consult the right one.
    assert admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_anime, media_type="anime")
    ).status_code == 201
    res = admin_client.post(
        "/api/plan-next/",
        json=_payload("entry", seeded_anime, media_type="anime", kind="rewatch"),
    )
    assert res.status_code == 422


def test_list_filters_by_kind(admin_client, seeded_movie):
    admin_client.post("/api/plan-next/", json=_payload("entry", seeded_movie))
    admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )

    both = admin_client.get("/api/plan-next/").json()
    assert len({r["kind"] for r in both}) == 2

    only = admin_client.get("/api/plan-next/?kind=rewatch").json()
    assert only and all(r["kind"] == "rewatch" for r in only)


def test_delete_by_target_is_kind_scoped(admin_client, seeded_movie):
    admin_client.post("/api/plan-next/", json=_payload("entry", seeded_movie))
    admin_client.post(
        "/api/plan-next/", json=_payload("entry", seeded_movie, kind="rewatch")
    )

    res = admin_client.request(
        "DELETE",
        "/api/plan-next/target",
        json=_payload("entry", seeded_movie, kind="rewatch"),
    )
    assert res.status_code == 200

    left = admin_client.get("/api/plan-next/").json()
    assert [r["kind"] for r in left] == ["next"]


def test_kinds_endpoint_exposes_both_maps(client):
    body = client.get("/api/plan-next/kinds").json()
    assert body["kinds"] == ["next", "rewatch"]
    assert body["allowed_scopes"]["next"]["anime"] == ["entry", "series", "franchise"]
    assert body["allowed_scopes"]["rewatch"]["anime"] == ["franchise"]
```

If `seeded_movie` / `seeded_anime` / `admin_client` fixtures do not exist under those names, reuse whatever `tests/api/test_plan_next.py` (plan-next Task 5) established and rename accordingly. Read that file first.

- [ ] **Step 2: Run the test to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_kind_api.py -v
```

Expected: FAIL — the response has no `kind` key.

- [ ] **Step 3: Add `kind` to the schemas**

In `app/schemas/plan_next.py`, add to `PlanNextCreate`:

```python
    # Defaults to "next" so every caller written before rewatch existed keeps
    # working without passing the field.
    kind: str = "next"
```

Add `kind: str` to `PlanNextRead`.

- [ ] **Step 4: Validate and filter in the router**

In `app/routers/plan_next.py`:

- import `KINDS`, `kind_valid`, `allowed_scopes_for` alongside the existing imports;
- in the create handler, reject an unknown kind with 422 before the scope check, then pass `payload.kind` as the first argument to `scope_allowed`;
- give the list handler a `kind: str | None = None` query parameter and filter on it when present;
- add `kind` to the `DELETE /target` body model and to its filter;
- in the `/kinds` handler, add `"kinds": list(KINDS)` and change `allowed_scopes` to:

```python
        "allowed_scopes": {
            kind: {
                media_type: sorted(scopes)
                for media_type, scopes in allowed_scopes_for(kind).items()
            }
            for kind in KINDS
        },
```

> **Breaking response change.** `allowed_scopes` gains a kind level. Update `tests/api/test_plan_next.py`'s `test_kinds_exposes_scopes_and_bucket_vocabularies`, which asserts `body["allowed_scopes"]["manga"] == ["entry"]`; it becomes `body["allowed_scopes"]["next"]["manga"]`. Update the frontend consumer in Task 6.

Sort order note: the test above expects `["entry", "series", "franchise"]` for anime/next. `sorted()` yields `["entry", "franchise", "series"]`. Either sort by `SCOPES` order — `sorted(scopes, key=SCOPES.index)` — or relax the test to compare sets. Prefer the former; scope order is meaningful in the UI.

- [ ] **Step 5: Thread `kind` through the domain helpers**

In `app/services/domain/plan_next.py`, add a trailing `kind: str = "next"` parameter to `set_entry_flag`, `entry_flag` and `planned_entry_ids`, and include `PlanNext.kind == kind` in each one's filter.

Leave `delete_plans_for` alone — deleting a target must remove its rows of **both** kinds, which the existing signature already does.

- [ ] **Step 6: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_kind_api.py tests/api/test_plan_next.py -v
```

Expected: all pass, including the amended `/kinds` assertion.

- [ ] **Step 7: Commit**

```bash
git add app/schemas/plan_next.py app/routers/plan_next.py \
        app/services/domain/plan_next.py \
        tests/api/test_plan_next_kind_api.py tests/api/test_plan_next.py
git commit -m "feat(rewatch): thread kind through the plan-next schemas, router and helpers"
```

---

### Task 4: Entry flags as virtual fields

Restores `to_rewatch` / `to_reread` on the entry schemas, backed by `kind='rewatch'` rows, so the ~30 frontend files that reference them keep working. Removes cartoon's flag entirely.

**Files:**
- Modify: `app/schemas/anime_movie.py`, `app/schemas/movie.py`, `app/schemas/tv_show.py`, `app/schemas/manga.py`, `app/schemas/novel.py`, `app/schemas/comic.py` (restore the field)
- Modify: `app/schemas/cartoon.py` (remove it)
- Modify: `app/routers/_factory.py` (extend the Task 6 translation to the rewatch kind)
- Modify: `app/registry.py:115` (drop `to_rewatch` from cartoon's `list_filters`)
- Test: `tests/api/test_rewatch_entry_flags.py`

**Interfaces:**
- Consumes: Task 3's `set_entry_flag(..., kind=)`, `entry_flag(..., kind=)`, `planned_entry_ids(..., kind=)`.
- Produces: no new symbols; the `to_rewatch` / `to_reread` fields behave as before on six entry types.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_rewatch_entry_flags.py`:

```python
"""
Entry-level to_rewatch / to_reread are virtual fields over plan_next rows
with kind='rewatch'.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

from app import models


def test_setting_to_rewatch_creates_one_rewatch_row(admin_client, db, seeded_movie):
    res = admin_client.patch(
        f"/api/movies/{seeded_movie}", json={"to_rewatch": True}
    )
    assert res.status_code == 200
    assert res.json()["to_rewatch"] is True

    rows = db.query(models.PlanNext).filter_by(target_id=seeded_movie).all()
    assert len(rows) == 1
    assert (rows[0].kind, rows[0].scope, rows[0].media_type) == (
        "rewatch",
        "entry",
        "movie",
    )


def test_clearing_to_rewatch_deletes_the_row(admin_client, db, seeded_movie):
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": True})
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": False})

    assert db.query(models.PlanNext).filter_by(target_id=seeded_movie).count() == 0


def test_watch_next_and_to_rewatch_are_independent(admin_client, db, seeded_movie):
    # Two kinds, one target: setting one must not disturb the other.
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"watch_next": True})
    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": True})

    body = admin_client.get(f"/api/movies/{seeded_movie}").json()
    assert body["watch_next"] is True
    assert body["to_rewatch"] is True

    admin_client.patch(f"/api/movies/{seeded_movie}", json={"to_rewatch": False})
    body = admin_client.get(f"/api/movies/{seeded_movie}").json()
    assert body["watch_next"] is True
    assert body["to_rewatch"] is False


def test_comic_uses_to_reread(admin_client, db, seeded_comic):
    res = admin_client.patch(f"/api/comic/{seeded_comic}", json={"to_reread": True})
    assert res.status_code == 200
    assert res.json()["to_reread"] is True

    row = db.query(models.PlanNext).filter_by(target_id=seeded_comic).one()
    assert (row.kind, row.media_type) == ("rewatch", "comic")


def test_cartoon_has_no_rewatch_field(admin_client, seeded_cartoon):
    # Cartoon rewatches at franchise scope only.
    body = admin_client.get(f"/api/cartoon/{seeded_cartoon}").json()
    assert "to_rewatch" not in body


def test_cartoon_list_rejects_the_filter(client):
    res = client.get("/api/cartoon/?to_rewatch=true")
    assert res.status_code == 422
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_rewatch_entry_flags.py -v
```

Expected: FAIL — `to_rewatch` is not an accepted field (Task 2 dropped the column and its schema field went with it).

- [ ] **Step 3: Restore the fields on six schemas**

Add to `app/schemas/anime_movie.py`, `movie.py`, `tv_show.py` (in the base class, beside `watch_next`):

```python
    # Virtual field: backed by a plan_next row with kind='rewatch',
    # scope='entry'. See app/services/domain/plan_next.py.
    to_rewatch: Optional[bool] = None
```

And to `manga.py`, `novel.py`, `comic.py`:

```python
    # Virtual field: backed by a plan_next row with kind='rewatch',
    # scope='entry'. See app/services/domain/plan_next.py.
    to_reread: Optional[bool] = None
```

Do **not** add either to `app/schemas/anime.py` or `app/schemas/cartoon.py` — neither type rewatches at entry scope.

- [ ] **Step 4: Extend the factory translation**

In `app/routers/_factory.py`, plan-next Task 6 added a write hook that pops `watch_next` / `read_next` and calls `set_entry_flag`, plus a read hook that populates it from `entry_flag` / `planned_entry_ids`. Generalise both over a small table rather than duplicating the block:

```python
# (schema field, kind) per media type. A type absent from a row's list has no
# such virtual field - anime has no rewatch flag, cartoon has neither.
VIRTUAL_PLAN_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "anime": (("watch_next", "next"),),
    "anime-movie": (("watch_next", "next"), ("to_rewatch", "rewatch")),
    "movie": (("watch_next", "next"), ("to_rewatch", "rewatch")),
    "tv-show": (("watch_next", "next"), ("to_rewatch", "rewatch")),
    "cartoon": (("watch_next", "next"),),
    "manga": (("read_next", "next"), ("to_reread", "rewatch")),
    "novel": (("read_next", "next"), ("to_reread", "rewatch")),
    "comic": (("read_next", "next"), ("to_reread", "rewatch")),
}
```

Both hooks then loop over `VIRTUAL_PLAN_FIELDS[media_type]`, passing each pair's kind through to `set_entry_flag` / `entry_flag`. The list path uses `planned_entry_ids(db, media_type, kind)` once per pair, not once per row.

- [ ] **Step 5: Drop cartoon's list filter**

In `app/registry.py:115`, remove `"to_rewatch"` from the cartoon `list_filters` tuple, leaving:

```python
        list_filters=("franchise_id", "series_id", "watching_status", "airing_status"),
```

- [ ] **Step 6: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_rewatch_entry_flags.py -v
venv/Scripts/python.exe -m pytest tests/api/ -q
```

Expected: the new file passes; the API suite shows no new failures.

- [ ] **Step 7: Commit**

```bash
git add app/schemas/anime_movie.py app/schemas/movie.py app/schemas/tv_show.py \
        app/schemas/manga.py app/schemas/novel.py app/schemas/comic.py \
        app/schemas/cartoon.py app/routers/_factory.py app/registry.py \
        tests/api/test_rewatch_entry_flags.py
git commit -m "feat(rewatch): back the entry rewatch flags with plan_next rows, drop cartoon's"
```

---

### Task 5: Sheets round-trip

Adds `kind` to the Plan Next tab's parser and removes the nine dead columns from the entry and group parsers.

**Files:**
- Modify: `app/utils/formatter.py`
- Test: `tests/api/test_plan_next_sheets.py` (extend the file Task 7 of plan-next created)

**Interfaces:**
- Consumes: Task 2's `models.PlanNext.kind`.
- Produces: `parse_plan_next_from_sheet` emitting `kind`.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_plan_next_sheets.py`:

```python
from app.utils.formatter import (
    parse_cartoon_from_sheet,
    parse_franchise_from_sheet,
    parse_plan_next_from_sheet,
    parse_series_from_sheet,
)


class TestPlanNextKindParsing:
    def test_kind_is_parsed(self):
        assert parse_plan_next_from_sheet({"kind": "rewatch"})["kind"] == "rewatch"

    def test_missing_kind_defaults_to_next(self):
        # A Plan Next tab backed up before the kind column existed.
        assert parse_plan_next_from_sheet({})["kind"] == "next"


class TestDroppedRewatchColumns:
    # A stale sheet still carrying these columns must parse without error and
    # without inventing a key: pull.py would assign it to a dropped attribute.
    def test_franchise_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_franchise_from_sheet({"to_rewatch": "TRUE"})

    def test_series_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_series_from_sheet({"to_rewatch": "TRUE"})

    def test_cartoon_parser_drops_to_rewatch(self):
        assert "to_rewatch" not in parse_cartoon_from_sheet({"to_rewatch": "TRUE"})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_sheets.py -v -k "Kind or Dropped"
```

Expected: FAIL — `KeyError: 'kind'`, and the drop tests fail because the key is still emitted.

- [ ] **Step 3: Emit `kind` from the plan-next parser**

In `parse_plan_next_from_sheet`, add:

```python
        # Defaults to "next": a Plan Next tab backed up before rewatch existed
        # has no such column, and every row in it was a queue entry.
        "kind": parse_from_sheet(raw.get("kind"), str) or "next",
```

- [ ] **Step 4: Drop the nine keys**

Remove the `to_rewatch` line from `parse_franchise_from_sheet` (line ~278), `parse_series_from_sheet` (~348), `parse_anime_movie_from_sheet`, `parse_movie_from_sheet` (~479), `parse_tv_show_from_sheet` (~514) and `parse_cartoon_from_sheet` (~550). Remove the `to_reread` line from the manga, novel and comic parsers.

Confirm none remain:

```bash
grep -n "to_rewatch\|to_reread" app/utils/formatter.py
```

Expected: no output.

Backup needs no change — headers derive from `__table__.columns` (`backup.py:141-149`), so the Plan Next tab gains `kind` and the nine tabs lose their column automatically on the next Backup.

- [ ] **Step 5: Run the tests**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_plan_next_sheets.py tests/unit/test_formatter_series.py -v
```

Expected: pass. `tests/unit/test_formatter_series.py` asserts `to_rewatch` is among the emitted keys — remove it from that list in the same commit.

- [ ] **Step 6: Commit**

```bash
git add app/utils/formatter.py tests/api/test_plan_next_sheets.py \
        tests/unit/test_formatter_series.py
git commit -m "feat(rewatch): parse plan_next.kind and drop the nine rewatch sheet columns"
```

---

### Task 6: Frontend vocabulary

The frontend mirror of Task 1. A pure module with vitest coverage, so the two UI tasks have something tested to build on.

**Files:**
- Modify: `frontend/src/config/planNextGroups.js`
- Test: `frontend/src/utils/planNext.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, from `planNextGroups.js`:
  - `KINDS` — `["next", "rewatch"]`
  - `ALLOWED_SCOPES` — object keyed by kind, then media type, each an array of scope strings in `SCOPES` order
  - `REWATCH_TABS` — array of `{ key, label, icon }`, the tabs the rewatch section shows
  - `scopesFor(kind, mediaType)` — array of scopes, empty for an unknown pair

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/planNext.test.js`:

```js
import {
  ALLOWED_SCOPES,
  KINDS,
  REWATCH_TABS,
  scopesFor,
} from "../config/planNextGroups";

describe("kind vocabulary", () => {
  it("has exactly two kinds", () => {
    expect(KINDS).toEqual(["next", "rewatch"]);
  });

  it("covers every media type under both kinds", () => {
    const types = Object.keys(ALLOWED_SCOPES.next);
    expect(types).toHaveLength(8);
    expect(Object.keys(ALLOWED_SCOPES.rewatch).sort()).toEqual(types.sort());
  });
});

describe("scopesFor", () => {
  // Must agree with app/utils/plan_next_kinds.py for all 16 pairs.
  it.each([
    ["rewatch", "anime", ["franchise"]],
    ["rewatch", "anime-movie", ["entry"]],
    ["rewatch", "movie", ["entry", "series", "franchise"]],
    ["rewatch", "tv-show", ["entry", "series", "franchise"]],
    ["rewatch", "cartoon", ["franchise"]],
    ["rewatch", "manga", ["entry"]],
    ["rewatch", "novel", ["entry", "series", "franchise"]],
    ["rewatch", "comic", ["entry", "series"]],
  ])("%s / %s", (kind, mediaType, expected) => {
    expect(scopesFor(kind, mediaType)).toEqual(expected);
  });

  it("returns scopes in entry-series-franchise order", () => {
    expect(scopesFor("next", "movie")).toEqual(["entry", "series", "franchise"]);
  });

  it("is empty for an unknown pair", () => {
    expect(scopesFor("nope", "movie")).toEqual([]);
    expect(scopesFor("rewatch", "nope")).toEqual([]);
  });
});

describe("REWATCH_TABS", () => {
  it("covers all eight types", () => {
    expect(REWATCH_TABS.map((t) => t.key)).toEqual([
      "anime",
      "anime-movie",
      "movie",
      "tv-show",
      "cartoon",
      "manga",
      "novel",
      "comic",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm run test:run -- planNext
```

Expected: FAIL — `KINDS` is not exported.

- [ ] **Step 3: Add the vocabulary**

Append to `frontend/src/config/planNextGroups.js`:

```js
// Mirrors app/utils/plan_next_kinds.py. Kept as a literal rather than fetched
// so the Plan page renders without waiting on a vocabulary request; the
// table-driven test in planNext.test.js guards the two copies against drift.
export const KINDS = ["next", "rewatch"];

const SCOPE_ORDER = ["entry", "series", "franchise"];

export const ALLOWED_SCOPES = {
  next: {
    anime: ["entry", "series", "franchise"],
    "anime-movie": ["entry"],
    movie: ["entry", "series", "franchise"],
    "tv-show": ["entry", "series", "franchise"],
    cartoon: ["entry", "series", "franchise"],
    manga: ["entry"],
    novel: ["entry"],
    comic: ["entry", "series"],
  },
  rewatch: {
    // Anime and cartoon are rewatched as whole franchises; novels are reread
    // at every tier though they are only ever queued one book at a time.
    anime: ["franchise"],
    "anime-movie": ["entry"],
    movie: ["entry", "series", "franchise"],
    "tv-show": ["entry", "series", "franchise"],
    cartoon: ["franchise"],
    manga: ["entry"],
    novel: ["entry", "series", "franchise"],
    comic: ["entry", "series"],
  },
};

export const REWATCH_TABS = [
  { key: "anime", label: "Anime", icon: "fa-tv" },
  { key: "anime-movie", label: "Anime Movie", icon: "fa-film" },
  { key: "movie", label: "Movie", icon: "fa-ticket-alt" },
  { key: "tv-show", label: "TV Show", icon: "fa-broadcast-tower" },
  { key: "cartoon", label: "Cartoon", icon: "fa-laugh-squint" },
  { key: "manga", label: "Manga", icon: "fa-book" },
  { key: "novel", label: "Novel", icon: "fa-book-open" },
  { key: "comic", label: "Comic", icon: "fa-book-dead" },
];

export function scopesFor(kind, mediaType) {
  const scopes = ALLOWED_SCOPES[kind]?.[mediaType];
  if (!scopes) return [];
  return SCOPE_ORDER.filter((scope) => scopes.includes(scope));
}

```

- [ ] **Step 4: Fix the `/kinds` consumer**

Task 3 changed `allowed_scopes` in the `/api/plan-next/kinds` response to be keyed by kind. Find and update any frontend read of it:

```bash
grep -rn "allowed_scopes" frontend/src
```

- [ ] **Step 5: Run the tests**

```bash
cd frontend && npm run test:run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/config/planNextGroups.js frontend/src/utils/planNext.test.js
# plus any file changed in Step 4
git commit -m "feat(rewatch): add the frontend kind vocabulary and rewatch scope map"
```

---

### Task 7: Group-level admin UI

Replaces the single "To Rewatch" checkbox on the franchise and series forms with a per-media-type toggle row, built as one control shared with the plan toggle Task 9 of plan-next added.

**Files:**
- Create: `frontend/src/components/plan/PlanKindToggles.jsx`
- Modify: `frontend/src/components/plan/SizeGroupControls.jsx` (delegate its plan toggles to the new control)
- Modify: `frontend/src/pages/detail/FranchisePage.jsx` (badge ~1108, control ~1181)
- Modify: `frontend/src/pages/detail/SeriesPage.jsx` (badge ~848, control ~923)
- Modify: `frontend/src/pages/modify-tabs/FranchiseModifyTab.jsx` (~310)
- Modify: `frontend/src/pages/modify-tabs/SeriesModifyTab.jsx` (~187)
- Modify: `frontend/src/pages/add-tabs/SeriesAddTab.jsx` (~119)

**Interfaces:**
- Consumes: Task 6's `scopesFor`, `KINDS`; Task 3's `/api/plan-next/` routes.
- Produces: `<PlanKindToggles kind="rewatch" scope="franchise" mediaTypes={[...]} marked={Set} onToggle={(mediaType, next) => {}} />`

- [ ] **Step 1: Write the control**

Create `frontend/src/components/plan/PlanKindToggles.jsx`:

```jsx
// Frontend: per-media-type plan toggles for one group and one kind.
//
// One control serves both kinds: the Plan page's two sections differ only in
// which scope map they consult and what the row is called. `mediaTypes` is
// what the group actually holds; this component filters that down to the
// types the kind/scope pair allows, so a franchise with no movies never shows
// a Movie toggle.
import { scopesFor } from "../../config/planNextGroups";

const LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
};

// Read types say "reread"; watch types say "rewatch".
const READ_TYPES = new Set(["manga", "novel", "comic"]);

export function kindLabel(kind, mediaTypes) {
  if (kind === "next") return "Watch/Read Next";
  const allRead = mediaTypes.length > 0 && mediaTypes.every((t) => READ_TYPES.has(t));
  return allRead ? "To Reread" : "To Rewatch";
}

export default function PlanKindToggles({
  kind,
  scope,
  mediaTypes,
  marked,
  onToggle,
  disabled = false,
}) {
  const applicable = mediaTypes.filter((t) => scopesFor(kind, t).includes(scope));
  if (applicable.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {applicable.map((mediaType) => (
        <label
          key={mediaType}
          className="flex items-center gap-2 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={marked.has(mediaType)}
            disabled={disabled}
            onChange={(e) => onToggle(mediaType, e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-xs font-medium text-gray-700">
            {LABELS[mediaType]}
          </span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/components/plan/PlanKindToggles.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlanKindToggles, { kindLabel } from "./PlanKindToggles";

const ALL = ["anime", "movie", "tv-show", "novel"];

describe("PlanKindToggles", () => {
  it("offers only types the kind allows at that scope", () => {
    render(
      <PlanKindToggles
        kind="rewatch"
        scope="series"
        mediaTypes={ALL}
        marked={new Set()}
        onToggle={() => {}}
      />,
    );
    // Anime rewatches at franchise scope only, so it must not appear here.
    expect(screen.queryByLabelText("Anime")).toBeNull();
    expect(screen.getByLabelText("Movie")).toBeInTheDocument();
    expect(screen.getByLabelText("Novel")).toBeInTheDocument();
  });

  it("renders nothing when the group holds no applicable type", () => {
    const { container } = render(
      <PlanKindToggles
        kind="rewatch"
        scope="series"
        mediaTypes={["anime"]}
        marked={new Set()}
        onToggle={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the toggled type and its next state", async () => {
    const onToggle = vi.fn();
    render(
      <PlanKindToggles
        kind="rewatch"
        scope="franchise"
        mediaTypes={ALL}
        marked={new Set(["movie"])}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByLabelText("Anime"));
    expect(onToggle).toHaveBeenCalledWith("anime", true);

    await userEvent.click(screen.getByLabelText("Movie"));
    expect(onToggle).toHaveBeenCalledWith("movie", false);
  });
});

describe("kindLabel", () => {
  it("says reread when every type is a read type", () => {
    expect(kindLabel("rewatch", ["novel", "comic"])).toBe("To Reread");
  });

  it("says rewatch when any type is watched", () => {
    expect(kindLabel("rewatch", ["novel", "movie"])).toBe("To Rewatch");
  });
});
```

The checkbox has no `<label for>` — `getByLabelText` works because the `<input>` is nested inside the `<label>`. If your Testing Library version does not resolve that, switch to `getByRole("checkbox", { name })`.

- [ ] **Step 3: Run the test**

```bash
cd frontend && npm run test:run -- PlanKindToggles
```

Expected: PASS. (The component is written first here because it is pure presentation with no prior interface to fail against; the test still gates the behavior.)

- [ ] **Step 4: Wire it into the franchise page**

In `frontend/src/pages/detail/FranchisePage.jsx`:

- delete the `toRewatch` state at line ~97 and its `setToRewatch` in the loader at ~234;
- derive the franchise's media types from the per-type entry lists the page already builds (`animeList`, `movieList`, `tvList`, `cartoonList`, `novelList`), **not** from `parseTypes(franchise.franchise_type)` — that value is bundled and partly legacy;
- derive `marked` from the `plan_next` rows for this franchise, filtered to `kind === "rewatch"` and `scope === "franchise"`;
- replace the badge at ~1108 with one chip per marked type, and delete the `hasACG &&` guard;
- replace the checkbox block at ~1181-1219 with:

```jsx
<div>
  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
    {kindLabel("rewatch", franchiseMediaTypes)}
  </label>
  <PlanKindToggles
    kind="rewatch"
    scope="franchise"
    mediaTypes={franchiseMediaTypes}
    marked={rewatchMarked}
    onToggle={handleRewatchToggle}
  />
</div>
```

`handleRewatchToggle` POSTs `{ kind: "rewatch", scope: "franchise", media_type, target_id }` to `/api/plan-next/` when checked, and `DELETE`s `/api/plan-next/target` with the same body when unchecked — the same handler shape Task 9 of plan-next wrote for the next kind. Extract that handler rather than duplicating it.

- [ ] **Step 5: Repeat for the series page and the three form tabs**

`SeriesPage.jsx` mirrors Step 4 with `scope="series"`. `FranchiseModifyTab.jsx`, `SeriesModifyTab.jsx` and `SeriesAddTab.jsx` each replace their `<Field label="To Rewatch">` block with the same control.

`SeriesAddTab` is the one exception: a series that does not exist yet has no `system_id` to target, and the file's own comment at line ~115 already records this reasoning for the Main Cover control. **Remove the To Rewatch field from the Add tab entirely** and let it be set on Modify, exactly as cover is.

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run test:run && npm run build
```

Then, with the dev server running, check on `:5173`: a franchise holding anime and movies shows two toggles; one holding only anime shows one; toggling persists across reload.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/plan/PlanKindToggles.jsx \
        frontend/src/components/plan/PlanKindToggles.test.jsx \
        frontend/src/components/plan/SizeGroupControls.jsx \
        frontend/src/pages/detail/FranchisePage.jsx \
        frontend/src/pages/detail/SeriesPage.jsx \
        frontend/src/pages/modify-tabs/FranchiseModifyTab.jsx \
        frontend/src/pages/modify-tabs/SeriesModifyTab.jsx \
        frontend/src/pages/add-tabs/SeriesAddTab.jsx
git commit -m "feat(rewatch): per-media-type rewatch toggles on the franchise and series forms"
```

---

### Task 8: Plan page rewrite

Collapses `PlanToRewatch.jsx`'s seven near-identical blocks into one config-driven render with per-scope sections, and adds the comic tab.

**Files:**
- Modify: `frontend/src/pages/plan/PlanToRewatch.jsx` (full rewrite)
- Modify: `frontend/src/pages/plan/usePlanData.js` (carry `kind` onto each row)
- Modify: `frontend/src/pages/plan/PlanWatchNext.jsx` (filter to `kind === "next"`)
- Modify: `frontend/src/pages/public/Plan.jsx` (props change)

**Interfaces:**
- Consumes: Task 6's `REWATCH_TABS`, `scopesFor`; Task 10 of plan-next's `usePlanData()` returning `{ planRows, franchiseMap, seriesMap, entriesByType, ... }` where each row is `{ system_id, scope, media_type, target_id, display_name, cover_image_file, nav_path, missing, bucket }`, and its `PlanNextCard`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Carry `kind` onto the plan rows**

Two things must be true of `usePlanData` before this task's filter works, and neither is guaranteed by Task 10 of plan-next — that task was written before `kind` existed.

First, the fetch must not filter:

```bash
grep -n "plan-next" frontend/src/pages/plan/usePlanData.js
```

Expected: a fetch with no `?kind=`. If Task 10 added one, remove it — a single request should feed both sections.

Second, **`kind` must survive into the row objects.** Task 10's documented row shape is `{ system_id, scope, media_type, target_id, display_name, cover_image_file, nav_path, missing, bucket }` — no `kind`. Find where rows are built (the `withBucket` helper and whatever maps the raw response into it) and confirm the API's `kind` is spread through rather than dropped by an explicit field list. Add it if it is missing.

Guard it with a test in `frontend/src/utils/planNext.test.js`, or by asserting in the browser console that `planRows.some(r => r.kind === "rewatch")` is true once a mark exists. Without this, every tab renders empty and the cause is invisible.

Also confirm `PlanWatchNext` filters to `kind === "next"`. Before this plan every row was a queue row, so Task 10 had no reason to filter; after Task 2's backfill it will otherwise show rewatch marks in the Watch Next section. Fix it in this task if so — it is the same bug in the mirror.

- [ ] **Step 2: Rewrite the component**

Replace `frontend/src/pages/plan/PlanToRewatch.jsx` entirely:

```jsx
// Frontend: plan page file for PlanToRewatch.
//
// One render path for all eight tabs. Which scopes a tab shows comes from the
// rewatch scope map, so anime shows only a Franchise section and comic only
// Series and Entries - the page never hardcodes a tier again.
import { useState } from "react";
import { REWATCH_TABS, scopesFor } from "../../config/planNextGroups";
import PlanNextCard from "./PlanNextCard";

const SCOPE_LABELS = {
  franchise: "Franchises",
  series: "Series",
  entry: "Entries",
};

export default function PlanToRewatch({ planRows }) {
  const [tab, setTab] = useState("anime");

  const rows = planRows.filter(
    (row) => row.kind === "rewatch" && row.media_type === tab,
  );
  const scopes = scopesFor("rewatch", tab);

  return (
    <section>
      <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <i className="fas fa-redo text-brand/70"></i>
          To Rewatch
        </h2>
      </div>

      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {REWATCH_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <i className={`fas ${t.icon} text-xs`}></i>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <i className="fas fa-redo text-3xl text-gray-300 mb-3"></i>
          <p className="text-gray-500 font-medium">Nothing marked for rewatch.</p>
          <p className="text-gray-400 text-xs mt-1">
            Toggle it on a detail page or in Modify.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {scopes
            .slice()
            .reverse() // Franchise first, then Series, then Entries.
            .map((scope) => {
              const inScope = rows
                .filter((row) => row.scope === scope)
                .sort((a, b) =>
                  (a.display_name || "").localeCompare(b.display_name || ""),
                );
              if (inScope.length === 0) return null;
              return (
                <div key={scope}>
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                    {SCOPE_LABELS[scope]}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {inScope.map((row) => (
                      <PlanNextCard key={row.system_id} row={row} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
```

`scopesFor` returns entry-series-franchise order; `.reverse()` gives the franchise-first display order the spec asks for. If `PlanNextCard`'s prop shape differs from `row`, match whatever Task 10 built rather than changing the card.

- [ ] **Step 3: Update the parent**

In `frontend/src/pages/public/Plan.jsx`, replace the eight props passed to `<PlanToRewatch>` with `planRows={planRows}`, taking `planRows` from the `usePlanData()` destructure Task 10 established.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run test:run && npm run build
```

On `:5173`, check each tab: Anime shows only a Franchises section; Comic shows Series and Entries; Movie shows all three; a franchise marked under two types appears on both tabs.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/plan/PlanToRewatch.jsx frontend/src/pages/plan/usePlanData.js \
        frontend/src/pages/plan/PlanWatchNext.jsx frontend/src/pages/public/Plan.jsx
git commit -m "feat(rewatch): render the To Rewatch page from plan rows, per scope"
```

---

### Task 9: Comic toggle and cartoon removal

The last two frontend surfaces: comic gains its missing admin control, cartoon loses its entry-level one.

**Files:**
- Modify: `frontend/src/pages/detail/Comic.jsx`
- Modify: `frontend/src/pages/detail/Cartoon.jsx` (~395-415)
- Modify: `frontend/src/pages/add-tabs/CartoonAddTab.jsx` (~326)
- Modify: `frontend/src/pages/modify-tabs/CartoonModifyTab.jsx`
- Modify: `frontend/src/config/formFactories.js` (`defaultCartoon`, ~152-180)
- Modify: `frontend/src/pages/admin/Add.jsx` (~1434)
- Modify: `frontend/src/pages/admin/Modify.jsx`

**Interfaces:**
- Consumes: Task 4's restored `to_reread` field on the comic schema.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the comic toggle**

`Comic.jsx` renders its tracker without a reread control. Add it the way `Cartoon.jsx:395-415` does today, using `MyTrackerCard`'s existing props:

```jsx
            toRewatch={comic.to_reread}
            onToRewatchChange={(v) =>
              saveField(
                { to_reread: v },
                v ? "Marked for reread" : "Removed from reread",
              )
            }
```

Match `Comic.jsx`'s own `saveField` signature — read it before writing. If `Comic.jsx` uses `NovelTrackerBlock` rather than `MyTrackerCard`, copy `NovelTrackerBlock.jsx:325`'s checkbox instead.

- [ ] **Step 2: Remove cartoon's entry flag**

In `Cartoon.jsx`, delete the `toRewatch` and `onToRewatchChange` props at ~395 and ~412-415. `MyTrackerCard.jsx:151` already hides the control when `onToRewatchChange` is undefined, so that component needs no change.

Delete the `to_rewatch` checkbox block from `CartoonAddTab.jsx` (~322-330) and `CartoonModifyTab.jsx`; the `to_rewatch: false` line from `defaultCartoon` in `formFactories.js`; and the `to_rewatch: cf.to_rewatch ?? false` line from `Add.jsx` (~1434) and its counterpart in `Modify.jsx`.

Confirm nothing is left:

```bash
grep -rn "to_rewatch" frontend/src | grep -i cartoon
```

Expected: no output.

`LibraryCartoon.jsx` has no rewatch column — verify with `grep -in rewatch frontend/src/pages/library/LibraryCartoon.jsx`, expect no output, and leave the file alone.

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run test:run && npm run build
```

On `:5173`: a comic detail page shows and persists To Reread; a cartoon detail page shows no To Rewatch control; the cartoon Add and Modify forms submit without error.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/detail/Comic.jsx frontend/src/pages/detail/Cartoon.jsx \
        frontend/src/pages/add-tabs/CartoonAddTab.jsx \
        frontend/src/pages/modify-tabs/CartoonModifyTab.jsx \
        frontend/src/config/formFactories.js \
        frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx
git commit -m "feat(rewatch): add the comic reread toggle, remove cartoon's entry flag"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/database-schema.md`, `docs/options.md`, `docs/api.md`, `docs/pages.md`, `docs/business-logic.md`, `docs/current-plan.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: `database-schema.md`**

Add `kind` to the `plan_next` table, and state plainly that the table holds both the Watch Next and To Rewatch queues despite its name. Remove the `to_rewatch` rows from the franchise, series, anime_movie, movie, tv_show and cartoon tables (lines ~124, ~154, ~384, ~461, ~544, ~628) and the `to_reread` rows from manga, novel and comic (~728, ~831, ~929). For the six that survive as API fields, note that they are virtual fields over `plan_next`, not columns.

- [ ] **Step 2: `options.md`**

Add a **Plan Kind** section listing `next` and `rewatch`, and a per-kind scope table reproducing this plan's Scope Map.

- [ ] **Step 3: `api.md`**

Document `kind` on the plan-next routes (query param, body field, and its `"next"` default), the kind level added to `/api/plan-next/kinds`'s `allowed_scopes`, and remove `to_rewatch` from the cartoon list filters at line ~174.

- [ ] **Step 4: `pages.md`**

Rewrite § To Rewatch (~1046-1053) for the per-scope sections and the comic tab. Update the franchise page (~561-563) and series page (~670-672) badge and control descriptions. Remove the To Rewatch checkbox from the cartoon form description (~1443 or ~1452 — confirm which is cartoon).

- [ ] **Step 5: `business-logic.md`**

Note that the nine rewatch columns are gone, that `parse_plan_next_from_sheet` handles `kind` with a `"next"` default for tabs backed up before the column existed, and that the entry-level flags are a compatibility surface over the table.

- [ ] **Step 6: `current-plan.md`**

`docs/current-plan.md:180` records that `comic.read_next` and `comic.to_reread` are columns with no UI. Both now have UI and neither is a column. Update that line.

- [ ] **Step 7: Verify no stale references**

```bash
grep -rn "to_rewatch\|to_reread" docs/*.md
```

Every remaining hit should describe a virtual field or the migration, never a column on franchise, series or cartoon.

- [ ] **Step 8: Commit**

```bash
git add docs/database-schema.md docs/options.md docs/api.md docs/pages.md \
        docs/business-logic.md docs/current-plan.md
git commit -m "docs(rewatch): document plan_next.kind and the per-type rewatch scopes"
```

---

## Final Verification

- [ ] `venv/Scripts/python.exe -m pytest tests/ -q` — no new failures versus the pre-task baseline.
- [ ] `cd frontend && npm run test:run` — all pass.
- [ ] `cd frontend && npm run build` — succeeds, so `:8000` serves current code.
- [ ] `venv/Scripts/python.exe -m alembic upgrade head && venv/Scripts/python.exe -m alembic downgrade -1 && venv/Scripts/python.exe -m alembic upgrade head` — clean round trip.
- [ ] Manual: run a Backup, then a Pull, and confirm rewatch marks survive.
- [ ] Manual: every Plan tab shows only its legal scopes.
