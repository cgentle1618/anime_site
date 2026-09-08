# Novel Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give novel entries a per-type structure — a `novel_unit` child table for volumes, arcs, stories and chapters — and two-stage reading progress for web novels whose arcs each carry their own chapter count.

**Architecture:** One child table with a `unit_kind` discriminator replaces the two parallel JSONB name lists on `novel`. The reading cursor stays on the parent row: `arc_fin` counts fully finished arcs and a new `ch_fin_in_arc` says how far into the current arc the reader is, normalised server-side so a hand-edited sheet gets the same rollover guarantee as the UI. `arc_total`, `ch_total` and absolute `ch_fin` are recomputed from the unit rows on every write but stay stored columns, so every existing reader keeps working untouched.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, Alembic, Pydantic v2, pytest; React + Vite, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-novel-units-design.md` — read it before Task 1. Decisions A–G there are binding; this plan implements them and does not revisit them.

## Global Constraints

- Python 3.13. Backend tests: `venv/Scripts/python.exe -m pytest -q`. API tests need the `anime_site_test` PostgreSQL database to exist.
- Backend lint: `venv/Scripts/ruff.exe check .` must stay green.
- Frontend: `cd frontend && npm run test:run && npm run lint`. **After any frontend change run `cd frontend && npm run build`** — `:8000` serves the prebuilt `frontend_dist/` and will otherwise show stale code.
- Alembic must keep a **single head**. At the time of writing head is `r0l1c2o3l4p5` (`collapse_person_roles`). Confirm with `venv/Scripts/python.exe -m alembic heads` before writing the migration — another session may have added one.
- **Other Claude Code sessions may be editing this branch concurrently.** Never `git add -A`, never `git commit -a`, never `git checkout --` / `restore` / `stash` / `reset`. Stage only the exact files each task lists. Re-read a file if an edit fails to match.
- Tailwind: semantic tokens only (`bg-surface`, `text-text-muted`, `border-border`, …). Hard-coded grey utilities fail `src/theme-tokens.test.js`.
- Test-first: every task writes a failing test, watches it fail, then implements.
- Sheets header names are a restore contract. Do not rename existing columns.

## Vocabulary (used by every task)

```
unit_kind ∈ {"volume", "arc", "story", "chapter"}

novel.type -> kinds offered
  "Light Novel" -> ("volume",)
  "Novel"       -> ("volume",)
  "Web"         -> ("arc",)
  "Other"       -> ("volume", "story", "chapter")
```

Worked example used throughout: a web novel with arc 1 = 100 chapters and arc 2 = 112 chapters. Reader has finished arc 1 and 101 chapters of arc 2. Stored: `arc_fin = 1`, `ch_fin_in_arc = 101`. Derived: `arc_total = 2`, `ch_total = 212`, `ch_fin = 201`. When arc 2 closes: `arc_fin = 2`, `ch_fin_in_arc = 0`, `ch_fin = 212`.

## File Structure

| File | Responsibility |
|---|---|
| `app/models/novel.py` | `Novel` (unchanged columns minus the two JSONB lists, plus `ch_fin_in_arc`) and the new `NovelUnit`. They change together, so they live together. |
| `app/models/__init__.py` | Re-export `NovelUnit`. |
| `app/schemas/novel.py` | `NovelUnitBase` / `NovelUnitWrite` / `NovelUnitResponse`, and `units` on the novel schemas. |
| `app/utils/constants.py` | `NOVEL_UNIT_KINDS`, `NOVEL_UNIT_KINDS_BY_TYPE`, `NOVEL_UNIT_KEY_PREFIX`. |
| `app/services/domain/novel_units.py` | **New.** Pure arithmetic: `normalize_arc_progress`, `derive_novel_progress`, `unit_display_key`. No I/O, no ORM queries. |
| `app/services/domain/novel_unit_writer.py` | **New.** `write_novel_units(db, entry, payload)` — the nested-collection diff. |
| `app/registry.py` | `MediaTypeSpec.nested_collections` and `progress_hook`; novel wires both. |
| `app/routers/_factory.py` | Pop nested collections; call `progress_hook` in create / update / patch; `selectinload` on list. |
| `app/utils/formatter.py` | `parse_novel_unit_from_sheet`. |
| `app/services/pipelines/tabs.py` | The `Novel Unit` tab, after `Novel`. |
| `alembic/versions/nv1u2n3i4t5s_novel_units.py` | **New.** Table, column, data migration, drops. |
| `frontend/src/components/forms/NovelUnitsEditor.jsx` | **New**, replaces `BelongingNovelsEditor.jsx`. |
| `frontend/src/lib/novelUnits.js` | **New.** `unitDisplayKey`, `kindsForType`, `arcStep`. |
| `frontend/src/components/tracker/NovelTrackerBlock.jsx` | Two-stage stepper. |
| `frontend/src/lib/formatters.js` | `getNovelProgress` two-stage rendering. |

---

### Task 1: `NovelUnit` model

**Files:**
- Modify: `app/models/novel.py`
- Modify: `app/models/__init__.py`
- Modify: `app/utils/constants.py`
- Test: `tests/unit/test_novel_unit_model.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `app.models.NovelUnit` with columns `system_id, novel_id, unit_kind, position, unit_key, name_cn, name_en, remark, ch_count, created_at, updated_at`; `Novel.units` relationship ordered by `position`; `Novel.ch_fin_in_arc` Float NOT NULL default 0. `app.utils.constants.NOVEL_UNIT_KINDS: tuple[str, ...]` and `NOVEL_UNIT_KINDS_BY_TYPE: dict[str, tuple[str, ...]]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_novel_unit_model.py`:

```python
"""NovelUnit model shape — columns, constraints, ordering, kind vocabulary."""

from app import models
from app.utils.constants import NOVEL_UNIT_KINDS, NOVEL_UNIT_KINDS_BY_TYPE


def test_novel_unit_columns():
    cols = {c.name for c in models.NovelUnit.__table__.columns}
    assert cols == {
        "system_id",
        "novel_id",
        "unit_kind",
        "position",
        "unit_key",
        "name_cn",
        "name_en",
        "remark",
        "ch_count",
        "created_at",
        "updated_at",
    }


def test_novel_unit_fk_cascades():
    fk = list(models.NovelUnit.__table__.c.novel_id.foreign_keys)[0]
    assert fk.column.table.name == "novel"
    assert fk.ondelete == "CASCADE"


def test_novel_unit_check_constraints():
    names = {c.name for c in models.NovelUnit.__table__.constraints if c.name}
    assert "ck_novel_unit_kind" in names
    assert "ck_novel_unit_ch_count_arc_only" in names


def test_novel_gains_ch_fin_in_arc_and_drops_json_lists():
    cols = {c.name for c in models.Novel.__table__.columns}
    assert "ch_fin_in_arc" in cols
    assert "novel_name_each_cn" not in cols
    assert "novel_name_each_en" not in cols


def test_kind_vocabulary():
    assert NOVEL_UNIT_KINDS == ("volume", "arc", "story", "chapter")
    assert NOVEL_UNIT_KINDS_BY_TYPE == {
        "Light Novel": ("volume",),
        "Novel": ("volume",),
        "Web": ("arc",),
        "Other": ("volume", "story", "chapter"),
    }
    # Every offered kind must be a real kind.
    for kinds in NOVEL_UNIT_KINDS_BY_TYPE.values():
        assert set(kinds) <= set(NOVEL_UNIT_KINDS)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_unit_model.py -v`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'NovelUnit'`.

- [ ] **Step 3: Add the kind vocabulary**

In `app/utils/constants.py`, next to `NOVEL_TYPES`:

```python
# Unit kinds a novel can hold. A plain map rather than a system_option
# category: code branches on these (which kinds the editor offers, which
# counter pair the tracker renders), and docs/options.md reserves
# system_option for values nothing branches on.
NOVEL_UNIT_KINDS = ("volume", "arc", "story", "chapter")

NOVEL_UNIT_KINDS_BY_TYPE = {
    "Light Novel": ("volume",),
    "Novel": ("volume",),
    "Web": ("arc",),
    "Other": ("volume", "story", "chapter"),
}

# Prefix used when a unit has no unit_key of its own.
NOVEL_UNIT_KEY_PREFIX = {
    "volume": "Vol",
    "arc": "Arc",
    "story": "Story",
    "chapter": "Ch",
}
```

- [ ] **Step 4: Add the model**

In `app/models/novel.py`, extend the imports to include `Index` and `relationship`:

```python
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import relationship
```

On `Novel`, delete these two lines:

```python
    novel_name_each_cn = Column(JSONB, default=None, nullable=True)
    novel_name_each_en = Column(JSONB, default=None, nullable=True)
```

Add `ch_fin_in_arc` directly after `ch_fin`:

```python
    ch_fin = Column(Float, nullable=False, default=0)
    # Chapters read into the arc *currently* being read, which is the arc at
    # position arc_fin + 1. Zero for every novel with no arc rows.
    ch_fin_in_arc = Column(Float, nullable=False, default=0)
```

Add the relationship after the column block, before `display_name`:

```python
    units = relationship(
        "NovelUnit",
        back_populates="novel",
        cascade="all, delete-orphan",
        order_by="NovelUnit.position",
    )
```

Append the new model at the end of the file:

```python
class NovelUnit(Base):
    """
    One volume, arc, story or chapter belonging to exactly one Novel.

    Replaces the two parallel JSONB lists (novel_name_each_cn/_en) that could
    drift out of alignment, because they were matched by list position and
    nothing else. One row now holds both languages.

    The kind asymmetry matters (Decision B in the design doc): volume rows are
    optional enrichment and nothing derives from them — vol_total_original /
    vol_total_tw remain the denominators. Arc rows are authoritative, because
    ch_count lives nowhere else.
    """

    __tablename__ = "novel_unit"
    __table_args__ = (
        CheckConstraint(
            "unit_kind IN ('volume','arc','story','chapter')",
            name="ck_novel_unit_kind",
        ),
        # ch_count is the arc's chapter count; it means nothing on other kinds.
        CheckConstraint(
            "unit_kind = 'arc' OR ch_count IS NULL",
            name="ck_novel_unit_ch_count_arc_only",
        ),
        Index("ix_novel_unit_novel_kind_position", "novel_id", "unit_kind", "position"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    novel_id = Column(
        UUID(as_uuid=True),
        ForeignKey("novel.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_kind = Column(String, nullable=False)
    # Float, matching read_order and the half-volume convention on vol_fin.
    # Deliberately NOT unique: the editor reorders by swapping adjacent
    # values, and a unique constraint would fire mid-swap.
    position = Column(Float, nullable=False)
    unit_key = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    name_en = Column(String, nullable=True)
    remark = Column(String, nullable=True)
    ch_count = Column(Float, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    novel = relationship("Novel", back_populates="units")
```

`JSONB` is still imported for `source_other`; leave the import alone.

- [ ] **Step 5: Re-export the model**

In `app/models/__init__.py`, change the novel import and add to `__all__`:

```python
from app.models.novel import Novel, NovelUnit
```

Add `"NovelUnit",` to `__all__` immediately after `"Novel",`.

- [ ] **Step 6: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_unit_model.py -v`
Expected: PASS (5 tests).

Then confirm nothing else broke at import time:
Run: `venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/models/novel.py app/models/__init__.py app/utils/constants.py tests/unit/test_novel_unit_model.py
git commit -m "feat(novel): NovelUnit model and per-type kind vocabulary"
```

---

### Task 2: Progress arithmetic

**Files:**
- Create: `app/services/domain/novel_units.py`
- Modify: `app/services/domain/__init__.py`
- Test: `tests/unit/test_novel_progress.py` (create)

**Interfaces:**
- Consumes: `NOVEL_UNIT_KEY_PREFIX` from Task 1.
- Produces:
  - `normalize_arc_progress(arc_counts: list[float], arc_fin: float, ch_fin_in_arc: float) -> tuple[float, float]`
  - `derive_novel_progress(entry) -> None` — mutates `arc_fin`, `ch_fin_in_arc`, `arc_total`, `ch_total`, `ch_fin` in place; no-op beyond zeroing `ch_fin_in_arc` when the entry has no arc rows.
  - `unit_display_key(unit_kind: str, position: float, unit_key: str | None) -> str`

Pure functions with no database access, so they are unit-testable without PostgreSQL.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_novel_progress.py`:

```python
"""Two-stage novel progress: rollover, derivation, key fallback."""

from types import SimpleNamespace

import pytest

from app.services.domain.novel_units import (
    derive_novel_progress,
    normalize_arc_progress,
    unit_display_key,
)


def arc(position, ch_count):
    return SimpleNamespace(
        unit_kind="arc", position=position, ch_count=ch_count, unit_key=None
    )


def volume(position):
    return SimpleNamespace(
        unit_kind="volume", position=position, ch_count=None, unit_key=None
    )


# --- normalize_arc_progress -------------------------------------------------

def test_within_current_arc_is_left_alone():
    # Arc 1 (100) done, 101 chapters into arc 2 (112). Nothing to roll over.
    assert normalize_arc_progress([100, 112], 1, 101) == (1, 101)


def test_carries_up_when_current_arc_completes():
    assert normalize_arc_progress([100, 112], 1, 112) == (2, 0)


def test_carries_across_more_than_one_arc():
    # 250 chapters into arc 1 spans arc 1 (100) and arc 2 (112), leaving 38.
    assert normalize_arc_progress([100, 112, 90], 0, 250) == (2, 38)


def test_borrows_down_into_previous_arc():
    # Stepping back from arc 2 chapter 0 lands on the last chapter of arc 1.
    assert normalize_arc_progress([100, 112], 1, -1) == (0, 99)


def test_borrows_across_more_than_one_arc():
    assert normalize_arc_progress([100, 112, 90], 2, -150) == (0, 62)


def test_clamps_at_zero():
    assert normalize_arc_progress([100], 0, -5) == (0, 0)


def test_does_not_clamp_past_the_last_recorded_arc():
    # An ongoing web novel is read into an arc not yet recorded. Clamping
    # here would silently discard that progress.
    assert normalize_arc_progress([100], 1, 40) == (1, 40)


def test_zero_count_arc_stops_the_carry():
    # An arc whose ch_count is unknown cannot be carried through.
    assert normalize_arc_progress([100, 0, 90], 1, 30) == (1, 30)


def test_no_arcs_is_a_no_op():
    assert normalize_arc_progress([], 0, 0) == (0, 0)


# --- derive_novel_progress --------------------------------------------------

def test_derives_totals_and_absolute_chapters():
    entry = SimpleNamespace(
        units=[arc(1, 100), arc(2, 112)],
        arc_fin=1,
        ch_fin_in_arc=101,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive_novel_progress(entry)
    assert entry.arc_total == 2
    assert entry.ch_total == 212
    assert entry.ch_fin == 201          # 100 finished + 101 into arc 2
    assert entry.arc_fin == 1
    assert entry.ch_fin_in_arc == 101


def test_absolute_chapters_after_the_arc_closes():
    entry = SimpleNamespace(
        units=[arc(1, 100), arc(2, 112)],
        arc_fin=1,
        ch_fin_in_arc=112,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive_novel_progress(entry)
    assert entry.arc_fin == 2
    assert entry.ch_fin_in_arc == 0
    assert entry.ch_fin == 212


def test_units_are_read_in_position_order_not_list_order():
    entry = SimpleNamespace(
        units=[arc(2, 112), arc(1, 100)],
        arc_fin=1,
        ch_fin_in_arc=101,
        arc_total=None,
        ch_total=None,
        ch_fin=0,
    )
    derive_novel_progress(entry)
    assert entry.ch_fin == 201


def test_volume_rows_do_not_touch_progress():
    # Decision B: volume rows are optional enrichment. vol_fin may exceed the
    # number of named volumes and nothing derives from them.
    entry = SimpleNamespace(
        units=[volume(1), volume(2)],
        arc_fin=0,
        ch_fin_in_arc=0,
        arc_total=None,
        ch_total=7,
        ch_fin=3,
        vol_fin=9,
        vol_total_original=12,
    )
    derive_novel_progress(entry)
    assert entry.vol_fin == 9
    assert entry.vol_total_original == 12
    assert entry.ch_total == 7          # untouched
    assert entry.ch_fin == 3            # untouched
    assert entry.arc_total is None      # untouched


def test_no_arc_rows_zeroes_only_the_in_arc_cursor():
    entry = SimpleNamespace(
        units=[],
        arc_fin=0,
        ch_fin_in_arc=44,
        arc_total=None,
        ch_total=300,
        ch_fin=120,
    )
    derive_novel_progress(entry)
    assert entry.ch_fin_in_arc == 0
    assert entry.ch_fin == 120          # flat pair still governs


# --- unit_display_key -------------------------------------------------------

@pytest.mark.parametrize(
    "kind,position,expected",
    [
        ("volume", 1, "Vol 1"),
        ("arc", 2, "Arc 2"),
        ("story", 3, "Story 3"),
        ("chapter", 4, "Ch 4"),
        ("volume", 1.5, "Vol 1.5"),
    ],
)
def test_generated_key_when_none_given(kind, position, expected):
    assert unit_display_key(kind, position, None) == expected
    assert unit_display_key(kind, position, "   ") == expected


def test_explicit_key_wins():
    assert unit_display_key("volume", 1, "第一卷") == "第一卷"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_progress.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.domain.novel_units'`.

- [ ] **Step 3: Implement**

Create `app/services/domain/novel_units.py`:

```python
"""
Novel unit arithmetic — rollover, derivation, and the display-key fallback.

Pure functions: no session, no queries. They are called from the router
(every write path) and from run_sync_novel (Calculate), so they must be
idempotent — running them twice on the same entry changes nothing.
"""

from app.utils.constants import NOVEL_UNIT_KEY_PREFIX


def _num(val) -> float:
    return float(val or 0)


def normalize_arc_progress(arc_counts, arc_fin, ch_fin_in_arc):
    """
    Fold an out-of-range chapter cursor into the right arc.

    arc_counts is every arc's ch_count in position order. arc_fin counts arcs
    that are *fully* finished, so the arc being read is at index arc_fin.

    Carrying up stops at the last recorded arc: an ongoing web novel is read
    into an arc nobody has entered yet, and clamping would discard that.
    An arc with an unknown (zero or null) count also stops the carry, because
    there is no width to subtract.
    """
    counts = [_num(c) for c in arc_counts]
    total = len(counts)
    fin = max(0, int(_num(arc_fin)))
    ch = _num(ch_fin_in_arc)

    # Borrow downward: a negative cursor means stepping back past the start
    # of the current arc, into the end of the previous one.
    while ch < 0 and fin > 0:
        fin -= 1
        ch += counts[fin]
    if ch < 0:
        ch = 0.0

    # Carry upward while the current arc has a known width and is full.
    while fin < total:
        width = counts[fin]
        if width <= 0 or ch < width:
            break
        ch -= width
        fin += 1

    return fin, ch


def derive_novel_progress(entry) -> None:
    """
    Recompute the derived progress columns from the entry's arc rows.

    Decision B: only arcs are authoritative. Volume rows are optional
    enrichment, so vol_fin / vol_total_original / vol_total_tw are never
    touched here. A novel with no arc rows keeps its flat ch_fin / ch_total
    pair and only has the in-arc cursor zeroed.
    """
    arcs = sorted(
        (u for u in (entry.units or []) if u.unit_kind == "arc"),
        key=lambda u: _num(u.position),
    )
    if not arcs:
        entry.ch_fin_in_arc = 0
        return

    counts = [_num(u.ch_count) for u in arcs]
    fin, ch = normalize_arc_progress(counts, entry.arc_fin, entry.ch_fin_in_arc)

    entry.arc_fin = float(fin)
    entry.ch_fin_in_arc = float(ch)
    entry.arc_total = float(len(arcs))
    entry.ch_total = float(sum(counts))
    entry.ch_fin = float(sum(counts[:fin]) + ch)


def unit_display_key(unit_kind, position, unit_key) -> str:
    """
    The label shown for a unit. An explicit unit_key always wins; otherwise
    generate one from kind and position ("Vol 1", "Arc 2"). Display-time only
    — the generated value is never stored.
    """
    if unit_key and str(unit_key).strip():
        return str(unit_key).strip()
    prefix = NOVEL_UNIT_KEY_PREFIX.get(unit_kind, "Unit")
    pos = _num(position)
    shown = int(pos) if pos == int(pos) else pos
    return f"{prefix} {shown}"
```

- [ ] **Step 4: Export from the domain package**

In `app/services/domain/__init__.py`, add alongside the existing re-exports (match the file's existing import and `__all__` style):

```python
from app.services.domain.novel_units import (
    derive_novel_progress,
    normalize_arc_progress,
    unit_display_key,
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_progress.py -v`
Expected: PASS (all parametrised cases).

- [ ] **Step 6: Lint**

Run: `venv/Scripts/ruff.exe check .`
Expected: no findings.

- [ ] **Step 7: Commit**

```bash
git add app/services/domain/novel_units.py app/services/domain/__init__.py tests/unit/test_novel_progress.py
git commit -m "feat(novel): arc rollover, progress derivation and key fallback"
```

---

### Task 3: Alembic migration

**Files:**
- Create: `alembic/versions/nv1u2n3i4t5s_novel_units.py`
- Test: `tests/unit/test_novel_unit_migration.py` (create)

**Interfaces:**
- Consumes: the model from Task 1.
- Produces: `migrate_each_lists(each_cn: list | None, each_en: list | None) -> list[dict]` — importable from the revision module so the zip logic is testable without running Alembic. Each dict has keys `position`, `unit_key`, `name_cn`, `name_en`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_novel_unit_migration.py`:

```python
"""The JSONB-lists -> novel_unit rows zip, tested without running Alembic."""

import importlib.util
import pathlib

# Loaded by path: alembic/versions is not an importable package.
_path = (
    pathlib.Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "nv1u2n3i4t5s_novel_units.py"
)
_spec = importlib.util.spec_from_file_location("nv1u2n3i4t5s_novel_units", _path)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)
migrate_each_lists = mod.migrate_each_lists


def test_aligned_lists_merge_into_one_row_each():
    rows = migrate_each_lists(
        [{"key": "vol 1", "name": "第一卷"}, {"key": "vol 2", "name": "第二卷"}],
        [{"key": "vol 1", "name": "Volume One"}, {"key": "vol 2", "name": "Volume Two"}],
    )
    assert rows == [
        {"position": 1, "unit_key": "vol 1", "name_cn": "第一卷", "name_en": "Volume One"},
        {"position": 2, "unit_key": "vol 2", "name_cn": "第二卷", "name_en": "Volume Two"},
    ]


def test_longer_list_governs_and_missing_language_is_null():
    rows = migrate_each_lists(
        [{"key": "vol 1", "name": "第一卷"}],
        [
            {"key": "vol 1", "name": "Volume One"},
            {"key": "vol 2", "name": "Volume Two"},
        ],
    )
    assert len(rows) == 2
    assert rows[1] == {
        "position": 2,
        "unit_key": "vol 2",
        "name_cn": None,
        "name_en": "Volume Two",
    }


def test_key_falls_back_to_the_other_language():
    rows = migrate_each_lists(
        [{"key": "", "name": "第一卷"}],
        [{"key": "vol 1", "name": "Volume One"}],
    )
    assert rows[0]["unit_key"] == "vol 1"


def test_fully_empty_entries_are_skipped():
    rows = migrate_each_lists(
        [{"key": "", "name": ""}, {"key": "vol 2", "name": "第二卷"}],
        [{"key": "", "name": ""}, {"key": "vol 2", "name": "Volume Two"}],
    )
    assert len(rows) == 1
    assert rows[0]["position"] == 2      # position follows the original index


def test_both_lists_absent_produces_nothing():
    assert migrate_each_lists(None, None) == []
    assert migrate_each_lists([], []) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_unit_migration.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Confirm the current head**

Run: `venv/Scripts/python.exe -m alembic heads`
Expected: exactly one head. Use it as `down_revision` below — the value written here (`r0l1c2o3l4p5`) was correct when the plan was written, but another session may have moved it. **If more than one head prints, stop and report it.**

- [ ] **Step 4: Write the migration**

Create `alembic/versions/nv1u2n3i4t5s_novel_units.py`:

```python
"""novel_unit table, ch_fin_in_arc, and the JSONB name lists migrated to rows

Revision ID: nv1u2n3i4t5s
Revises: r0l1c2o3l4p5
Create Date: 2026-09-04

Downgrade is lossy and deliberately so: it rebuilds novel_name_each_cn and
novel_name_each_en from the volume rows, but per-unit remarks, arc rows and
their ch_count have nowhere to go in the old shape and are dropped. Run a
Sheets Backup before upgrading.
"""

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "nv1u2n3i4t5s"
down_revision = "r0l1c2o3l4p5"
branch_labels = None
depends_on = None


def _clean(val):
    """Empty and whitespace-only cells become NULL, not ''."""
    if val is None:
        return None
    text = str(val).strip()
    return text or None


def migrate_each_lists(each_cn, each_en):
    """
    Zip the two parallel per-volume lists into one row per position.

    They were aligned by list index and nothing else, so a length mismatch is
    expected in the wild: the longer list governs and the absent language is
    NULL. unit_key takes CN's key, falling back to EN's. A position where key
    and both names are all empty carried no information and is skipped, but
    the positions of the rows that remain still follow the original index, so
    surviving volumes keep their original numbering.
    """
    cn = each_cn or []
    en = each_en or []
    rows = []
    for i in range(max(len(cn), len(en))):
        cn_entry = cn[i] if i < len(cn) else {}
        en_entry = en[i] if i < len(en) else {}
        if not isinstance(cn_entry, dict):
            cn_entry = {}
        if not isinstance(en_entry, dict):
            en_entry = {}

        unit_key = _clean(cn_entry.get("key")) or _clean(en_entry.get("key"))
        name_cn = _clean(cn_entry.get("name"))
        name_en = _clean(en_entry.get("name"))
        if unit_key is None and name_cn is None and name_en is None:
            continue

        rows.append(
            {
                "position": i + 1,
                "unit_key": unit_key,
                "name_cn": name_cn,
                "name_en": name_en,
            }
        )
    return rows


def _as_list(val):
    """The column is JSONB, but a restored sheet can leave a JSON string."""
    if val is None:
        return []
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except (ValueError, TypeError):
            return []
    return val if isinstance(val, list) else []


def upgrade():
    op.create_table(
        "novel_unit",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "novel_id",
            UUID(as_uuid=True),
            sa.ForeignKey("novel.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("unit_kind", sa.String(), nullable=False),
        sa.Column("position", sa.Float(), nullable=False),
        sa.Column("unit_key", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("remark", sa.String(), nullable=True),
        sa.Column("ch_count", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "unit_kind IN ('volume','arc','story','chapter')",
            name="ck_novel_unit_kind",
        ),
        sa.CheckConstraint(
            "unit_kind = 'arc' OR ch_count IS NULL",
            name="ck_novel_unit_ch_count_arc_only",
        ),
    )
    op.create_index("ix_novel_unit_system_id", "novel_unit", ["system_id"])
    op.create_index("ix_novel_unit_novel_id", "novel_unit", ["novel_id"])
    op.create_index(
        "ix_novel_unit_novel_kind_position",
        "novel_unit",
        ["novel_id", "unit_kind", "position"],
    )

    op.add_column(
        "novel",
        sa.Column("ch_fin_in_arc", sa.Float(), nullable=False, server_default="0"),
    )

    conn = op.get_bind()
    existing = conn.execute(
        sa.text(
            "SELECT system_id, novel_name_each_cn, novel_name_each_en FROM novel"
        )
    ).fetchall()

    for novel_id, each_cn, each_en in existing:
        for row in migrate_each_lists(_as_list(each_cn), _as_list(each_en)):
            conn.execute(
                sa.text(
                    "INSERT INTO novel_unit "
                    "(system_id, novel_id, unit_kind, position, unit_key,"
                    " name_cn, name_en, created_at, updated_at) "
                    "VALUES (:sid, :nid, 'volume', :position, :unit_key,"
                    " :name_cn, :name_en, NOW(), NOW())"
                ),
                {"sid": uuid.uuid4(), "nid": novel_id, **row},
            )

    op.drop_column("novel", "novel_name_each_cn")
    op.drop_column("novel", "novel_name_each_en")


def downgrade():
    op.add_column("novel", sa.Column("novel_name_each_cn", JSONB(), nullable=True))
    op.add_column("novel", sa.Column("novel_name_each_en", JSONB(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT novel_id, unit_key, name_cn, name_en FROM novel_unit "
            "WHERE unit_kind = 'volume' ORDER BY novel_id, position"
        )
    ).fetchall()

    grouped = {}
    for novel_id, unit_key, name_cn, name_en in rows:
        cn, en = grouped.setdefault(novel_id, ([], []))
        cn.append({"key": unit_key or "", "name": name_cn or ""})
        en.append({"key": unit_key or "", "name": name_en or ""})

    for novel_id, (cn, en) in grouped.items():
        conn.execute(
            sa.text(
                "UPDATE novel SET novel_name_each_cn = CAST(:cn AS JSONB),"
                " novel_name_each_en = CAST(:en AS JSONB) WHERE system_id = :nid"
            ),
            {
                "cn": json.dumps(cn, ensure_ascii=False),
                "en": json.dumps(en, ensure_ascii=False),
                "nid": novel_id,
            },
        )

    op.drop_column("novel", "ch_fin_in_arc")
    op.drop_index("ix_novel_unit_novel_kind_position", table_name="novel_unit")
    op.drop_index("ix_novel_unit_novel_id", table_name="novel_unit")
    op.drop_index("ix_novel_unit_system_id", table_name="novel_unit")
    op.drop_table("novel_unit")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_unit_migration.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Apply the migration and verify a single head**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Expected: applies cleanly.
Run: `venv/Scripts/python.exe -m alembic heads`
Expected: exactly one head, `nv1u2n3i4t5s`.

Round-trip the downgrade once to prove it is runnable (it is lossy by design, so do this on the dev database only):
Run: `venv/Scripts/python.exe -m alembic downgrade -1` then `venv/Scripts/python.exe -m alembic upgrade head`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add alembic/versions/nv1u2n3i4t5s_novel_units.py tests/unit/test_novel_unit_migration.py
git commit -m "feat(novel): migration for novel_unit, ch_fin_in_arc, JSONB list backfill"
```

---

### Task 4: Schemas

**Files:**
- Modify: `app/schemas/novel.py`
- Modify: `app/schemas/__init__.py`
- Test: `tests/unit/test_novel_unit_schemas.py` (create)

**Interfaces:**
- Consumes: `unit_display_key` from Task 2.
- Produces: `NovelUnitWrite` (accepts optional `system_id` so an existing row can be updated) and `NovelUnitResponse` (adds the computed `display_key`). `NovelBase.units: Optional[list[NovelUnitWrite]]`, `NovelResponse.units: list[NovelUnitResponse]`. `NovelBase.ch_fin_in_arc: float = 0`. The `novel_name_each_*` fields and their coercing validator are gone.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_novel_unit_schemas.py`:

```python
"""Novel unit schemas — write shape, response shape, display_key."""

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.novel import NovelBase, NovelUnitResponse, NovelUnitWrite


def test_write_accepts_a_new_unit_without_system_id():
    unit = NovelUnitWrite(unit_kind="volume", position=1, name_cn="第一卷")
    assert unit.system_id is None
    assert unit.ch_count is None


def test_write_accepts_an_existing_unit_with_system_id():
    sid = uuid.uuid4()
    unit = NovelUnitWrite(system_id=sid, unit_kind="arc", position=2, ch_count=112)
    assert unit.system_id == sid
    assert unit.ch_count == 112


def test_write_rejects_an_unknown_kind():
    with pytest.raises(ValidationError):
        NovelUnitWrite(unit_kind="tankobon", position=1)


def test_response_generates_the_display_key():
    resp = NovelUnitResponse(
        system_id=uuid.uuid4(),
        unit_kind="arc",
        position=2,
        unit_key=None,
        name_cn=None,
        name_en=None,
        remark=None,
        ch_count=112,
    )
    assert resp.display_key == "Arc 2"


def test_response_prefers_an_explicit_key():
    resp = NovelUnitResponse(
        system_id=uuid.uuid4(),
        unit_kind="volume",
        position=1,
        unit_key="第一卷",
        name_cn=None,
        name_en=None,
        remark=None,
        ch_count=None,
    )
    assert resp.display_key == "第一卷"


def test_novel_base_carries_units_and_the_in_arc_cursor():
    novel = NovelBase(
        novel_name_cn="測試",
        ch_fin_in_arc=101,
        units=[{"unit_kind": "arc", "position": 1, "ch_count": 100}],
    )
    assert novel.ch_fin_in_arc == 101
    assert novel.units[0].ch_count == 100


def test_the_old_json_lists_are_gone():
    assert "novel_name_each_cn" not in NovelBase.model_fields
    assert "novel_name_each_en" not in NovelBase.model_fields
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_unit_schemas.py -v`
Expected: FAIL — `ImportError: cannot import name 'NovelUnitWrite'`.

- [ ] **Step 3: Implement**

In `app/schemas/novel.py`, add to the imports:

```python
from typing import List, Literal, Optional

from app.services.domain.novel_units import unit_display_key
```

Add the two unit schemas above `NovelBase`:

```python
class NovelUnitWrite(BaseModel):
    """
    One unit as the client sends it. system_id present means "update this
    row"; absent means "insert". Rows the payload omits are deleted — see
    write_novel_units.
    """

    system_id: Optional[UUID] = None
    unit_kind: Literal["volume", "arc", "story", "chapter"]
    position: float
    unit_key: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    remark: Optional[str] = None
    ch_count: Optional[float] = None


class NovelUnitResponse(BaseModel):
    system_id: UUID
    unit_kind: str
    position: float
    unit_key: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    remark: Optional[str] = None
    ch_count: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_key(self) -> str:
        return unit_display_key(self.unit_kind, self.position, self.unit_key)
```

In `NovelBase`, delete these five lines (the two fields and the validator):

```python
    novel_name_each_cn: Optional[list] = None
    novel_name_each_en: Optional[list] = None

    @field_validator("novel_name_each_cn", "novel_name_each_en", mode="before")
    @classmethod
    def _coerce_each_to_list(cls, v):
        if isinstance(v, dict):
            return [{"key": k, "name": n} for k, n in v.items()]
        return v
```

If `field_validator` is now unused in the file, drop it from the pydantic import so ruff stays clean.

Add `ch_fin_in_arc` after `ch_fin` in `NovelBase`:

```python
    ch_fin: float = 0
    ch_fin_in_arc: float = 0
```

Add `units` to `NovelBase`, after `source_other`:

```python
    # Popped out of the payload by the router before the model is built;
    # see MediaTypeSpec.nested_collections.
    units: Optional[List[NovelUnitWrite]] = None
```

Add to `NovelResponse`, after `system_id`:

```python
    units: List[NovelUnitResponse] = []
```

- [ ] **Step 4: Export**

In `app/schemas/__init__.py`, add `NovelUnitResponse` and `NovelUnitWrite` to the novel import line and to `__all__`, matching the file's existing style.

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_unit_schemas.py -v`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add app/schemas/novel.py app/schemas/__init__.py tests/unit/test_novel_unit_schemas.py
git commit -m "feat(novel): unit write/response schemas, drop the JSONB name lists"
```

---

### Task 5: Nested-collection writer and router wiring

**Files:**
- Create: `app/services/domain/novel_unit_writer.py`
- Modify: `app/services/domain/__init__.py`
- Modify: `app/registry.py`
- Modify: `app/routers/_factory.py`
- Test: `tests/api/test_novel_units_api.py` (create)

**Interfaces:**
- Consumes: `NovelUnit` (Task 1), `derive_novel_progress` (Task 2), `NovelUnitWrite` (Task 4).
- Produces: `write_novel_units(db, entry, units) -> None`. `MediaTypeSpec.nested_collections: Optional[dict[str, Callable]]` and `MediaTypeSpec.progress_hook: Optional[Callable]`.

**Why a second hook rather than reusing `pre_commit_hook`:** `pre_commit_hook` is called only in `create` and `update`, and only anime sets it. The tracker patches progress through `PATCH`, which must also normalise. Widening `pre_commit_hook` to `patch` would start running `prepare_anime_write` on every anime patch — a behaviour change outside this work. `progress_hook` is called in all three and only novel sets it.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_novel_units_api.py`. Follow the fixture names used by the neighbouring API tests — read `tests/api/test_media_crud.py` first and mirror its client/admin fixtures exactly.

```python
"""Novel units round-trip through the media router factory."""

import uuid


def _novel_payload(**overrides):
    payload = {
        "novel_name_cn": "測試小說",
        "type": "Web",
        "units": [
            {"unit_kind": "arc", "position": 1, "unit_key": "arc 1", "ch_count": 100},
            {"unit_kind": "arc", "position": 2, "unit_key": "arc 2", "ch_count": 112},
        ],
    }
    payload.update(overrides)
    return payload


def test_create_persists_units_and_derives_totals(admin_client):
    resp = admin_client.post("/api/novel/", json=_novel_payload(arc_fin=1, ch_fin_in_arc=101))
    assert resp.status_code == 201
    body = resp.json()

    assert len(body["units"]) == 2
    assert body["arc_total"] == 2
    assert body["ch_total"] == 212
    assert body["ch_fin"] == 201
    assert body["units"][0]["display_key"] == "arc 1"


def test_update_inserts_updates_and_deletes_in_one_request(admin_client):
    created = admin_client.post("/api/novel/", json=_novel_payload()).json()
    keep, drop = created["units"][0], created["units"][1]

    resp = admin_client.put(
        f"/api/novel/{created['system_id']}",
        json={
            "novel_name_cn": "測試小說",
            "type": "Web",
            "units": [
                # updated in place
                {
                    "system_id": keep["system_id"],
                    "unit_kind": "arc",
                    "position": 1,
                    "unit_key": "arc 1",
                    "ch_count": 105,
                },
                # inserted
                {"unit_kind": "arc", "position": 2, "unit_key": "arc 2b", "ch_count": 50},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    ids = {u["system_id"] for u in body["units"]}
    assert keep["system_id"] in ids       # kept and updated
    assert drop["system_id"] not in ids   # omitted, therefore deleted
    assert len(body["units"]) == 2
    assert body["ch_total"] == 155


def test_patching_the_cursor_rolls_over(admin_client):
    created = admin_client.post(
        "/api/novel/", json=_novel_payload(arc_fin=1, ch_fin_in_arc=0)
    ).json()

    resp = admin_client.patch(
        f"/api/novel/{created['system_id']}", json={"ch_fin_in_arc": 112}
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["arc_fin"] == 2
    assert body["ch_fin_in_arc"] == 0
    assert body["ch_fin"] == 212


def test_deleting_a_novel_removes_its_units(admin_client, db_session):
    from app import models

    created = admin_client.post("/api/novel/", json=_novel_payload()).json()
    novel_id = uuid.UUID(created["system_id"])

    assert admin_client.delete(f"/api/novel/{novel_id}").status_code == 200

    remaining = (
        db_session.query(models.NovelUnit)
        .filter(models.NovelUnit.novel_id == novel_id)
        .count()
    )
    assert remaining == 0


def test_volume_units_do_not_touch_volume_counters(admin_client):
    resp = admin_client.post(
        "/api/novel/",
        json={
            "novel_name_cn": "輕小說",
            "type": "Light Novel",
            "vol_fin": 9,
            "vol_total_original": 12,
            "units": [
                {"unit_kind": "volume", "position": 1, "name_cn": "第一卷"},
                {"unit_kind": "volume", "position": 2, "name_cn": "第二卷"},
            ],
        },
    )
    body = resp.json()
    # Decision B: naming two volumes must not redefine the denominator.
    assert body["vol_fin"] == 9
    assert body["vol_total_original"] == 12
    assert len(body["units"]) == 2


def test_listing_novels_does_not_n_plus_one(admin_client, db_session):
    from sqlalchemy import event

    for _ in range(3):
        admin_client.post("/api/novel/", json=_novel_payload())

    statements = []
    engine = db_session.get_bind()

    def record(conn, cursor, statement, params, context, executemany):
        if "novel_unit" in statement:
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        resp = admin_client.get("/api/novel/")
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert resp.status_code == 200
    # selectinload issues exactly one query for all novels' units, not one
    # query per novel.
    assert len(statements) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_units_api.py -v`
Expected: FAIL — the create returns 500 or 422 because `units` is not a column.

- [ ] **Step 3: Write the writer**

Create `app/services/domain/novel_unit_writer.py`:

```python
"""
Nested write for a novel's units.

The media-router factory builds an entry with spec.model(**payload) and
assigns updates with a blind setattr loop, so a nested list has to come out
of the payload first — the same escape hatch pop_remark and pop_plan_flag
use. This module owns what happens to that list.
"""

import uuid

from app.models import NovelUnit


def write_novel_units(db, entry, units) -> None:
    """
    Reconcile entry.units with the payload, in the caller's transaction.

    Rows carrying a system_id are updated, rows without one are inserted, and
    rows the payload omits are deleted. Passing None means "not supplied" and
    leaves the existing rows alone; passing [] clears them.
    """
    if units is None:
        return

    existing = {
        u.system_id: u
        for u in db.query(NovelUnit).filter(NovelUnit.novel_id == entry.system_id).all()
    }
    seen = set()

    for item in units:
        data = item if isinstance(item, dict) else item.model_dump()
        unit_id = data.get("system_id")
        fields = {
            "unit_kind": data.get("unit_kind"),
            "position": data.get("position"),
            "unit_key": data.get("unit_key"),
            "name_cn": data.get("name_cn"),
            "name_en": data.get("name_en"),
            "remark": data.get("remark"),
            # Guarded by ck_novel_unit_ch_count_arc_only; normalise here so a
            # client that leaves a stale count on a re-kinded row cannot trip
            # the constraint.
            "ch_count": data.get("ch_count") if data.get("unit_kind") == "arc" else None,
        }

        row = existing.get(unit_id) if unit_id else None
        if row is None:
            row = NovelUnit(system_id=uuid.uuid4(), novel_id=entry.system_id, **fields)
            db.add(row)
        else:
            for key, value in fields.items():
                setattr(row, key, value)
        seen.add(row.system_id)

    for unit_id, row in existing.items():
        if unit_id not in seen:
            db.delete(row)

    db.flush()
    db.refresh(entry)
```

Re-export it from `app/services/domain/__init__.py` alongside the Task 2 exports.

- [ ] **Step 4: Extend `MediaTypeSpec`**

In `app/registry.py`, add two fields to the dataclass after `pre_commit_hook`:

```python
    # Payload key -> writer(db, entry, value), popped before the model is
    # built because the value is not a column. Only novel uses this.
    nested_collections: Optional[dict] = None
    # (db, entry) -> None, called in create, update AND patch, after columns
    # and nested collections are applied. Distinct from pre_commit_hook,
    # which patch deliberately does not call. Only novel uses this.
    progress_hook: Optional[Callable] = None
```

Import the two functions at the top of `registry.py` alongside the other domain imports:

```python
from app.services.domain import derive_novel_progress, write_novel_units
```

Wire them on the novel spec, after `write_hook=execute_replace_single_novel,`:

```python
        nested_collections={"units": write_novel_units},
        progress_hook=lambda db, entry: derive_novel_progress(entry),
```

- [ ] **Step 5: Wire the factory**

In `app/routers/_factory.py`, add a helper next to `_finish`:

```python
    def _pop_nested(payload: dict) -> dict:
        """Lift nested collections out of the payload; they are not columns."""
        if not spec.nested_collections:
            return {}
        return {
            key: payload.pop(key)
            for key in list(spec.nested_collections)
            if key in payload
        }

    def _write_nested(db: Session, entry, nested: dict) -> None:
        for key, value in nested.items():
            spec.nested_collections[key](db, entry, value)

    def _derive(db: Session, entry) -> None:
        if spec.progress_hook:
            spec.progress_hook(db, entry)
```

In `create`, after `payload, plan_flags = pop_plan_flag(...)` add:

```python
        nested = _pop_nested(payload)
```

and after `db.add(entry)`, before the `pre_commit_hook` call:

```python
        db.flush()
        _write_nested(db, entry, nested)
        _derive(db, entry)
```

In `update`, after `payload, plan_flags = pop_plan_flag(...)` add the same `nested = _pop_nested(payload)` line, and after the `setattr` loop, before `apply_completion_timestamp`:

```python
        _write_nested(db, entry, nested)
        _derive(db, entry)
```

In `patch`, after `apply_column_patch(entry, payload)`:

```python
        _derive(db, entry)
```

In `list_entries`, eager-load so the response's `units` does not fire one query per novel. Add the import `from sqlalchemy.orm import selectinload` and, immediately after the `query = apply_entry_visibility(...)` assignment:

```python
        for name in (spec.nested_collections or {}):
            query = query.options(selectinload(getattr(spec.model, name)))
```

- [ ] **Step 6: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_units_api.py -v`
Expected: PASS (6 tests).

Then the whole API suite, since the factory is shared by eight media types:
Run: `venv/Scripts/python.exe -m pytest tests/api -q`
Expected: PASS. Anime must be unaffected — `prepare_anime_write` still runs only in create and update.

- [ ] **Step 7: Commit**

```bash
git add app/services/domain/novel_unit_writer.py app/services/domain/__init__.py app/registry.py app/routers/_factory.py tests/api/test_novel_units_api.py
git commit -m "feat(novel): nested unit writes and progress derivation through the router"
```

---

### Task 6: Completion and Calculate

**Files:**
- Modify: `app/services/domain/completion.py`
- Modify: `app/services/calculation.py`
- Test: `tests/unit/test_novel_completion.py` (create)

**Interfaces:**
- Consumes: `derive_novel_progress` (Task 2).
- Produces: `mark_novel_completed` zeroes `ch_fin_in_arc` and sets `arc_fin` to the arc count; `run_sync_novel` re-derives every novel.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_novel_completion.py`:

```python
"""mark_novel_completed with the two-stage cursor."""

from types import SimpleNamespace

from app.services.domain.completion import mark_novel_completed


def arc(position, ch_count):
    return SimpleNamespace(unit_kind="arc", position=position, ch_count=ch_count)


def novel(**overrides):
    base = dict(
        units=[],
        serialization_status=None,
        reading_status="Active Reading",
        vol_total_original=None,
        vol_total_tw=None,
        vol_fin=0,
        arc_total=None,
        arc_fin=0,
        ch_total=None,
        ch_fin=0,
        ch_fin_in_arc=0,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_completing_an_arc_novel_closes_every_arc():
    entry = novel(units=[arc(1, 100), arc(2, 112)], arc_fin=1, ch_fin_in_arc=101)
    mark_novel_completed(entry)
    assert entry.reading_status == "Completed"
    assert entry.serialization_status == "完結"
    assert entry.arc_fin == 2
    assert entry.ch_fin_in_arc == 0
    assert entry.ch_fin == 212
    assert entry.ch_total == 212


def test_completing_a_volume_novel_is_unchanged():
    entry = novel(vol_total_original=12, vol_total_tw=9, vol_fin=3)
    mark_novel_completed(entry)
    assert entry.vol_fin == 12
    assert entry.vol_total_tw == 12
    assert entry.ch_fin_in_arc == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_completion.py -v`
Expected: FAIL — `arc_fin` stays 1 and `ch_fin` stays 0.

- [ ] **Step 3: Implement**

In `app/services/domain/completion.py`, import the derivation:

```python
from app.services.domain.novel_units import derive_novel_progress
```

In `mark_novel_completed`, replace the existing `arc` and `ch` blocks (the two that take the max of `arc_total`/`arc_fin` and `ch_total`/`ch_fin`) with:

```python
    # Arc-structured novels: close every recorded arc and let the derivation
    # recompute the totals, so ch_fin and ch_total cannot disagree with the
    # rows. The old max() dance could not express "which arc am I in".
    arcs = [u for u in (getattr(entry, "units", None) or []) if u.unit_kind == "arc"]
    if arcs:
        entry.arc_fin = float(len(arcs))
        entry.ch_fin_in_arc = 0
        derive_novel_progress(entry)
    else:
        entry.ch_fin_in_arc = 0
        arc_vals = [v for v in [entry.arc_total, entry.arc_fin] if v is not None]
        if arc_vals:
            arc_max = max(arc_vals)
            entry.arc_fin = arc_max
            if entry.arc_total is not None:
                entry.arc_total = arc_max

        ch_vals = [v for v in [entry.ch_total, entry.ch_fin] if v is not None]
        if ch_vals:
            ch_max = max(ch_vals)
            entry.ch_fin = ch_max
            if entry.ch_total is not None:
                entry.ch_total = ch_max
```

Leave the `vol` block exactly as it is — Decision B.

In `app/services/calculation.py`, fill in `run_sync_novel`:

```python
def run_sync_novel(db: Session) -> dict:
    extract_system_options(db)
    # Re-derive from the unit rows so a Sheets restore, which writes rows
    # straight to the tables without going through the router, lands with
    # consistent totals.
    for entry in db.query(Novel).all():
        derive_novel_progress(entry)
    db.commit()
    return {
        "status": "success",
        "message": "Novel sync completed.",
    }
```

Add `derive_novel_progress` to the `from app.services.domain import (...)` block at the top of `calculation.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_completion.py -v`
Expected: PASS (2 tests).

Run: `venv/Scripts/python.exe -m pytest tests/api/test_complete_endpoints.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/completion.py app/services/calculation.py tests/unit/test_novel_completion.py
git commit -m "feat(novel): completion and Calculate re-derive arc progress"
```

---

### Task 7: Sheets round-trip

**Files:**
- Modify: `app/utils/formatter.py`
- Modify: `app/services/pipelines/tabs.py`
- Test: `tests/unit/test_formatter_novel_unit.py` (create)

**Interfaces:**
- Consumes: `NovelUnit` (Task 1).
- Produces: `parse_novel_unit_from_sheet(raw: dict) -> dict`; the `Novel Unit` tab.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_formatter_novel_unit.py`:

```python
"""Novel Unit sheet parser and tab ordering."""

from uuid import UUID

from app.services.pipelines.tabs import TAB_NAMES
from app.utils.formatter import parse_novel_unit_from_sheet


def test_parses_a_full_row():
    parsed = parse_novel_unit_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "novel_id": "22222222-2222-2222-2222-222222222222",
            "unit_kind": "arc",
            "position": "2",
            "unit_key": "arc 2",
            "name_cn": "第二章",
            "name_en": "Arc Two",
            "remark": "best arc",
            "ch_count": "112",
        }
    )
    assert parsed["system_id"] == UUID("11111111-1111-1111-1111-111111111111")
    assert parsed["novel_id"] == UUID("22222222-2222-2222-2222-222222222222")
    assert parsed["unit_kind"] == "arc"
    assert parsed["position"] == 2.0
    assert parsed["ch_count"] == 112.0


def test_blank_cells_become_none():
    parsed = parse_novel_unit_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "novel_id": "22222222-2222-2222-2222-222222222222",
            "unit_kind": "volume",
            "position": "1",
            "unit_key": "",
            "name_cn": "",
            "name_en": "",
            "remark": "",
            "ch_count": "",
        }
    )
    assert parsed["unit_key"] is None
    assert parsed["ch_count"] is None


def test_an_unresolvable_novel_id_becomes_none_not_a_string():
    parsed = parse_novel_unit_from_sheet(
        {
            "system_id": "11111111-1111-1111-1111-111111111111",
            "novel_id": "not-a-uuid",
            "unit_kind": "volume",
            "position": "1",
        }
    )
    assert parsed["novel_id"] is None


def test_the_tab_restores_after_its_parent():
    assert "Novel Unit" in TAB_NAMES
    assert TAB_NAMES.index("Novel Unit") > TAB_NAMES.index("Novel")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_novel_unit.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_novel_unit_from_sheet'`.

- [ ] **Step 3: Implement the parser**

In `app/utils/formatter.py`, next to `parse_novel_from_sheet`:

```python
def parse_novel_unit_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Novel Unit sheet into typed data ready
    for the Database.

    novel_id goes through _uuid_or_none: unlike the entry tabs there is no
    name to resolve a bad cell against, so anything unparseable must become
    NULL rather than reach Postgres as a string.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "novel_id": _uuid_or_none(raw.get("novel_id")),
        "unit_kind": parse_from_sheet(raw.get("unit_kind"), str),
        "position": parse_from_sheet(raw.get("position"), float),
        "unit_key": parse_from_sheet(raw.get("unit_key"), str),
        "name_cn": parse_from_sheet(raw.get("name_cn"), str),
        "name_en": parse_from_sheet(raw.get("name_en"), str),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "ch_count": parse_from_sheet(raw.get("ch_count"), float),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
```

Also remove the two now-dead lines from `parse_novel_from_sheet` (around `app/utils/formatter.py:648`):

```python
        "novel_name_each_cn": _safe_json(raw.get("novel_name_each_cn")),
        "novel_name_each_en": _safe_json(raw.get("novel_name_each_en")),
```

and add `"ch_fin_in_arc": parse_from_sheet(raw.get("ch_fin_in_arc"), float) or 0.0,` next to the existing `ch_fin` line.

- [ ] **Step 4: Register the tab**

In `app/services/pipelines/tabs.py`, immediately after the `SheetTab("Novel", ...)` line:

```python
    # After Novel: novel_id is a real FK, so the parent rows must exist first.
    SheetTab("Novel Unit", models.NovelUnit, f.parse_novel_unit_from_sheet),
```

Note it carries **no** `media_type` — units are not a media entry and have no credit or tag columns.

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_novel_unit.py -v`
Expected: PASS (4 tests).

Run: `venv/Scripts/python.exe -m pytest tests/api/test_data_control_pull_tab.py tests/unit/test_backup_overwrite.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/utils/formatter.py app/services/pipelines/tabs.py tests/unit/test_formatter_novel_unit.py
git commit -m "feat(novel): Novel Unit sheet tab and parser"
```

---

### Task 8: Frontend unit helpers

**Files:**
- Create: `frontend/src/lib/novelUnits.js`
- Create: `frontend/src/lib/novelUnits.test.js`
- Modify: `frontend/src/config/fieldOptions.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `unitDisplayKey(kind, position, unitKey)`, `kindsForType(novelType)`, `arcStep(arcs, arcFin, chInArc, direction)` returning `{ arc_fin, ch_fin_in_arc }`. `NOVEL_UNIT_KINDS_BY_TYPE` exported from `fieldOptions.js`.

The helpers mirror `app/services/domain/novel_units.py`. The editor needs a live preview before anything is saved, so the fallback cannot be server-only; the drift test in Task 12 pins the two together.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/novelUnits.test.js`:

```javascript
import { describe, expect, it } from "vitest";
import { arcStep, kindsForType, unitDisplayKey } from "./novelUnits";

describe("unitDisplayKey", () => {
  it("uses the explicit key when there is one", () => {
    expect(unitDisplayKey("volume", 1, "第一卷")).toBe("第一卷");
  });

  it("generates a key from kind and position otherwise", () => {
    expect(unitDisplayKey("volume", 1, "")).toBe("Vol 1");
    expect(unitDisplayKey("arc", 2, null)).toBe("Arc 2");
    expect(unitDisplayKey("story", 3, "   ")).toBe("Story 3");
    expect(unitDisplayKey("chapter", 4, undefined)).toBe("Ch 4");
  });

  it("keeps a fractional position", () => {
    expect(unitDisplayKey("volume", 1.5, null)).toBe("Vol 1.5");
  });
});

describe("kindsForType", () => {
  it("maps each novel type to its kinds", () => {
    expect(kindsForType("Light Novel")).toEqual(["volume"]);
    expect(kindsForType("Novel")).toEqual(["volume"]);
    expect(kindsForType("Web")).toEqual(["arc"]);
    expect(kindsForType("Other")).toEqual(["volume", "story", "chapter"]);
  });

  it("falls back to volume for an unknown type", () => {
    expect(kindsForType(null)).toEqual(["volume"]);
  });
});

describe("arcStep", () => {
  const arcs = [{ ch_count: 100 }, { ch_count: 112 }];

  it("steps forward inside the current arc", () => {
    expect(arcStep(arcs, 1, 100, 1)).toEqual({ arc_fin: 1, ch_fin_in_arc: 101 });
  });

  it("rolls into the next arc when the current one completes", () => {
    expect(arcStep(arcs, 1, 111, 1)).toEqual({ arc_fin: 2, ch_fin_in_arc: 0 });
  });

  it("borrows from the previous arc when stepping back past zero", () => {
    expect(arcStep(arcs, 1, 0, -1)).toEqual({ arc_fin: 0, ch_fin_in_arc: 99 });
  });

  it("clamps at the very beginning", () => {
    expect(arcStep(arcs, 0, 0, -1)).toEqual({ arc_fin: 0, ch_fin_in_arc: 0 });
  });

  it("keeps counting past the last recorded arc", () => {
    expect(arcStep([{ ch_count: 100 }], 1, 40, 1)).toEqual({
      arc_fin: 1,
      ch_fin_in_arc: 41,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/novelUnits.test.js`
Expected: FAIL — cannot resolve `./novelUnits`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/novelUnits.js`:

```javascript
// Frontend mirror of app/services/domain/novel_units.py. The editor previews
// a generated key before anything is saved, so the fallback cannot live only
// on the server. src/config/novelUnitKinds.test.js pins the two together.

const KEY_PREFIX = {
  volume: "Vol",
  arc: "Arc",
  story: "Story",
  chapter: "Ch",
};

export const NOVEL_UNIT_KINDS_BY_TYPE = {
  "Light Novel": ["volume"],
  Novel: ["volume"],
  Web: ["arc"],
  Other: ["volume", "story", "chapter"],
};

export function unitDisplayKey(kind, position, unitKey) {
  if (unitKey && String(unitKey).trim()) return String(unitKey).trim();
  const prefix = KEY_PREFIX[kind] || "Unit";
  const pos = Number(position) || 0;
  return `${prefix} ${pos}`;
}

export function kindsForType(novelType) {
  return NOVEL_UNIT_KINDS_BY_TYPE[novelType] || ["volume"];
}

/**
 * One chapter step for a web novel with arcs, folded into the right arc.
 * Mirrors normalize_arc_progress: carrying stops at the last recorded arc,
 * because an ongoing novel is read into an arc nobody has entered yet.
 */
export function arcStep(arcs, arcFin, chInArc, direction) {
  const counts = (arcs || []).map((a) => Number(a.ch_count) || 0);
  let fin = Math.max(0, Math.floor(Number(arcFin) || 0));
  let ch = (Number(chInArc) || 0) + direction;

  while (ch < 0 && fin > 0) {
    fin -= 1;
    ch += counts[fin];
  }
  if (ch < 0) ch = 0;

  while (fin < counts.length) {
    const width = counts[fin];
    if (width <= 0 || ch < width) break;
    ch -= width;
    fin += 1;
  }

  return { arc_fin: fin, ch_fin_in_arc: ch };
}
```

In `frontend/src/config/fieldOptions.js`, re-export the map so form config can read it without importing from `lib/`:

```javascript
export { NOVEL_UNIT_KINDS_BY_TYPE } from "../lib/novelUnits";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/novelUnits.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/novelUnits.js frontend/src/lib/novelUnits.test.js frontend/src/config/fieldOptions.js
git commit -m "feat(novel): frontend unit helpers for keys, kinds and arc stepping"
```

---

### Task 9: Units editor

**Files:**
- Create: `frontend/src/components/forms/NovelUnitsEditor.jsx`
- Delete: `frontend/src/components/forms/BelongingNovelsEditor.jsx`
- Modify: `frontend/src/pages/add-tabs/NovelAddTab.jsx:512-527`
- Modify: `frontend/src/pages/modify-tabs/NovelModifyTab.jsx` (the matching Belonging Novels block)
- Modify: `frontend/src/config/formFactories.js:257-258`
- Modify: `frontend/src/config/formFields/fieldMeta.js:506-517`

**Interfaces:**
- Consumes: `unitDisplayKey`, `kindsForType` (Task 8).
- Produces: `<NovelUnitsEditor items novelType onChange />`, where `items` is the `units` array in API shape (`{system_id?, unit_kind, position, unit_key, name_cn, name_en, remark, ch_count}`).

- [ ] **Step 1: Write the component**

Create `frontend/src/components/forms/NovelUnitsEditor.jsx`. Replaces `BelongingNovelsEditor`: one row per unit holding both languages, so the CN and EN lists can no longer drift apart.

```jsx
// Frontend: form component for a novel's units (volumes, arcs, stories).
import { kindsForType, unitDisplayKey } from "../../lib/novelUnits";

const baseCls =
  "border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";
const keyInputCls = baseCls + " w-24 shrink-0";
const nameInputCls = baseCls + " flex-1 min-w-0";
const numInputCls = baseCls + " w-24 shrink-0";
const kindSelectCls = baseCls + " w-28 shrink-0";

export default function NovelUnitsEditor({ items, novelType, onChange }) {
  const kinds = kindsForType(novelType);
  const rows = items || [];

  const addEntry = () =>
    onChange([
      ...rows,
      {
        unit_kind: kinds[0],
        position: rows.length + 1,
        unit_key: "",
        name_cn: "",
        name_en: "",
        remark: "",
        ch_count: "",
      },
    ]);

  const removeEntry = (i) =>
    onChange(rows.filter((_, j) => j !== i).map((r, j) => ({ ...r, position: j + 1 })));

  const updateEntry = (i, field, value) =>
    onChange(rows.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

  // Swap adjacent rows and renumber. position is not unique in the database
  // precisely so this swap cannot trip a constraint mid-move.
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((r, k) => ({ ...r, position: k + 1 })));
  };

  return (
    <div className="space-y-2">
      {rows.map((entry, i) => (
        <div key={entry.system_id || i} className="flex gap-1.5 items-center">
          <div className="flex flex-col shrink-0">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Move up"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-up text-[9px]" />
            </button>
            <button
              type="button"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Move down"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-down text-[9px]" />
            </button>
          </div>

          {kinds.length > 1 ? (
            <select
              className={kindSelectCls}
              value={entry.unit_kind}
              onChange={(e) => updateEntry(i, "unit_kind", e.target.value)}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          ) : null}

          <input
            className={keyInputCls}
            placeholder={unitDisplayKey(entry.unit_kind, entry.position, null)}
            value={entry.unit_key || ""}
            onChange={(e) => updateEntry(i, "unit_key", e.target.value)}
          />
          <input
            className={nameInputCls}
            placeholder="CN name"
            value={entry.name_cn || ""}
            onChange={(e) => updateEntry(i, "name_cn", e.target.value)}
          />
          <input
            className={nameInputCls}
            placeholder="EN name"
            value={entry.name_en || ""}
            onChange={(e) => updateEntry(i, "name_en", e.target.value)}
          />
          <input
            className={nameInputCls}
            placeholder="Remark"
            value={entry.remark || ""}
            onChange={(e) => updateEntry(i, "remark", e.target.value)}
          />
          {entry.unit_kind === "arc" ? (
            <input
              className={numInputCls}
              type="number"
              step="any"
              placeholder="chapters"
              value={entry.ch_count ?? ""}
              onChange={(e) => updateEntry(i, "ch_count", e.target.value)}
            />
          ) : null}

          <button
            type="button"
            className="text-danger/70 hover:text-danger px-1 shrink-0"
            aria-label="Remove"
            onClick={() => removeEntry(i)}
          >
            <i className="fas fa-times" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-brand hover:underline mt-1"
        onClick={addEntry}
      >
        + Add {kinds.length > 1 ? "unit" : kinds[0]}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Swap it into the Add tab**

In `frontend/src/pages/add-tabs/NovelAddTab.jsx`, replace the import of `BelongingNovelsEditor` with `NovelUnitsEditor`, and replace the whole "Belonging Novels" block (the `SectionHeader` plus the two editors, currently around lines 512–527) with:

```jsx
      <SectionHeader icon="fa-book-open" title="Units" />
      <NovelUnitsEditor
        items={nvf.units}
        novelType={nvf.type}
        onChange={(val) => unv("units", val)}
      />
```

- [ ] **Step 3: Swap it into the Modify tab**

Make the identical change in `frontend/src/pages/modify-tabs/NovelModifyTab.jsx`, using that file's own field-setter (read the file — it uses a different setter name from the Add tab).

- [ ] **Step 4: Update the form config**

In `frontend/src/config/formFactories.js`, replace:

```javascript
  novel_name_each_cn: [],
  novel_name_each_en: [],
```

with:

```javascript
  units: [],
```

In `frontend/src/config/formFields/fieldMeta.js`, replace both `novel_name_each_*` blocks with:

```javascript
    units: {
      label: "Units (Volumes / Arcs)",
      control: "none",
      defaultable: false,
      group: "Names",
    },
```

- [ ] **Step 5: Remove the old component**

```bash
git rm frontend/src/components/forms/BelongingNovelsEditor.jsx
```

Then confirm nothing still imports it:
Run: `cd frontend && npx eslint src --max-warnings=0`
Expected: no unresolved imports.

- [ ] **Step 6: Verify**

Run: `cd frontend && npm run test:run && npm run lint`
Expected: PASS.
Run: `cd frontend && npm run build`
Expected: build succeeds (required — `:8000` serves the prebuilt bundle).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/forms/NovelUnitsEditor.jsx frontend/src/pages/add-tabs/NovelAddTab.jsx frontend/src/pages/modify-tabs/NovelModifyTab.jsx frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js
git commit -m "feat(novel): units editor replaces the parallel CN/EN name lists"
```

---

### Task 10: Two-stage tracker

**Files:**
- Modify: `frontend/src/components/tracker/NovelTrackerBlock.jsx`
- Modify: `frontend/src/lib/formatters.js:77-91`
- Modify: `frontend/src/components/tracker/NovelDashboardCard.jsx`
- Test: `frontend/src/lib/formatters.test.js` (create or extend)

**Interfaces:**
- Consumes: `arcStep` (Task 8).
- Produces: `getNovelProgress(novel)` renders `arc 2 · 101/112 CH` for the two-stage case; `NovelTrackerBlock` calls `onArcProgressChange({ arc_fin, ch_fin_in_arc })`.

- [ ] **Step 1: Write the failing test**

In `frontend/src/lib/formatters.test.js` (create if absent, matching the surrounding test style):

```javascript
import { describe, expect, it } from "vitest";
import { getNovelProgress } from "./formatters";

describe("getNovelProgress", () => {
  it("renders the two-stage arc position", () => {
    const novel = {
      progress_display: "arc_ch",
      arc_fin: 1,
      arc_total: 2,
      ch_fin_in_arc: 101,
      units: [
        { unit_kind: "arc", position: 1, ch_count: 100 },
        { unit_kind: "arc", position: 2, ch_count: 112 },
      ],
    };
    expect(getNovelProgress(novel)).toBe("arc 2 · 101/112 CH");
  });

  it("falls back to the flat chapter pair when there are no arcs", () => {
    const novel = { progress_display: "ch", ch_fin: 120, ch_total: 300, units: [] };
    expect(getNovelProgress(novel)).toBe("120 / 300 CH");
  });

  it("shows the JP/KR volume label", () => {
    const novel = { progress_display: "vol_original", vol_fin: 3, vol_total_original: 12 };
    expect(getNovelProgress(novel)).toBe("3 / 12 VOL JP/KR");
  });

  it("still shows TW volumes", () => {
    const novel = { progress_display: "vol_tw", vol_fin: 3, vol_total_tw: 9 };
    expect(getNovelProgress(novel)).toBe("3 / 9 VOL TW");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/formatters.test.js`
Expected: FAIL — the arc case renders the old `1/2 ARC  0/? CH` string and the JP/KR label says `VOL`.

- [ ] **Step 3: Update the formatter**

In `frontend/src/lib/formatters.js`, replace `getNovelProgress`:

```javascript
/**
 * Human-readable progress for a novel, branching on progress_display.
 *
 * The arc_ch case is two-stage: the arc being read is arc_fin + 1, and
 * ch_fin_in_arc counts chapters inside it, so the denominator is that arc's
 * own ch_count rather than the whole novel's chapter total.
 */
export function getNovelProgress(novel) {
  switch (novel.progress_display) {
    case "vol_tw":
      return `${novel.vol_fin ?? 0} / ${novel.vol_total_tw ?? "?"} VOL TW`;
    case "vol_original":
      return `${novel.vol_fin ?? 0} / ${novel.vol_total_original ?? "?"} VOL JP/KR`;
    case "arc_ch": {
      const arcs = (novel.units || [])
        .filter((u) => u.unit_kind === "arc")
        .sort((a, b) => a.position - b.position);
      const finished = novel.arc_fin ?? 0;
      const current = arcs[finished];
      if (!current) {
        return `${novel.ch_fin ?? 0} / ${novel.ch_total ?? "?"} CH`;
      }
      return `arc ${finished + 1} · ${novel.ch_fin_in_arc ?? 0}/${
        current.ch_count ?? "?"
      } CH`;
    }
    default:
      return `${novel.ch_fin ?? 0} / ${novel.ch_total ?? "?"} CH`;
  }
}
```

- [ ] **Step 4: Update the tracker block**

In `frontend/src/components/tracker/NovelTrackerBlock.jsx`:

Import the helper and narrow the options list:

```javascript
import { arcStep } from "../../lib/novelUnits";

// Decision G: the display follows the type, so the dropdown only offers the
// choices that type actually leaves open. A Web novel has none — arcs decide
// it. Volume-shaped types choose their denominator. "Other" can be counted
// by volume or by chapter, so it gets both.
function progressDisplayOptions(novelType) {
  const volume = [
    { value: "", label: "— Default (VOL JP/KR) —" },
    { value: "vol_original", label: "VOL JP/KR" },
    { value: "vol_tw", label: "VOL TW (Taiwan Volumes)" },
  ];
  if (novelType === "Web") return [];
  if (novelType === "Other") {
    return [...volume, { value: "ch", label: "CH (Chapters)" }];
  }
  return volume;
}
```

Hide the whole select when `progressDisplayOptions(novel.type)` is empty. The stored column keeps accepting `ch` and `arc_ch` whatever the dropdown offers, so rows written before this change still render.

Replace `handleArcStep` and `handleChStep` with one two-stage stepper, and derive the arc list at the top of the component:

```javascript
  const arcs = (novel.units || [])
    .filter((u) => u.unit_kind === "arc")
    .sort((a, b) => a.position - b.position);
  const currentArc = arcs[novel.arc_fin ?? 0] || null;
  const chInArc = novel.ch_fin_in_arc ?? 0;

  function handleArcChapterStep(dir) {
    if (!isAdmin) return;
    const next = arcStep(arcs, novel.arc_fin ?? 0, chInArc, dir);
    if (next.arc_fin === (novel.arc_fin ?? 0) && next.ch_fin_in_arc === chInArc) {
      return;
    }
    onArcProgressChange(next);
  }
```

Render the two-stage row when `arcs.length > 0`, in place of the current separate ARC and CH rows. It reuses `TrackerRow` and `StepButton` already in the file:

```jsx
{arcs.length > 0 ? (
  <TrackerRow isHighlighted label="Arc / Chapter">
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">
        arc {(novel.arc_fin ?? 0) + 1}
        <span className={UNIT_CLS}>of {arcs.length}</span>
      </span>
      <span className="text-text-faint">·</span>
      <StepButton onClick={() => handleArcChapterStep(-1)} label="Previous chapter">
        −
      </StepButton>
      <span className="font-mono text-sm">
        {chInArc}
        <span className={UNIT_CLS}>/ {currentArc?.ch_count ?? "?"} ch</span>
      </span>
      <StepButton onClick={() => handleArcChapterStep(1)} label="Next chapter">
        +
      </StepButton>
    </div>
  </TrackerRow>
) : null}
```

Keep the existing volume row, and keep the flat chapter row for novels with no arcs. Relabel the volume row's total from "Original" to "JP/KR".

- [ ] **Step 5: Update the caller**

The parent that renders `NovelTrackerBlock` currently passes `onArcChange` and `onChChange`. Replace those with a single `onArcProgressChange` that PATCHes both fields at once:

```javascript
onArcProgressChange={(next) =>
  onProgressChange(novel.system_id, next, {
    arc_fin: novel.arc_fin,
    ch_fin_in_arc: novel.ch_fin_in_arc,
  })
}
```

Find every caller with `grep -rn "NovelTrackerBlock" frontend/src` and update each. Keep the existing optimistic-rollback argument shape — `NovelDashboardCard.jsx:99` shows it.

- [ ] **Step 6: Update the dashboard card**

`NovelDashboardCard.jsx:56` computes an arc percentage from `arc_fin / arc_total`. Extend it so the two-stage case includes the partial arc:

```javascript
  } else if (pd === "arc_ch" && novel.ch_total) {
    pct = Math.min(((novel.ch_fin ?? 0) / novel.ch_total) * 100, 100);
```

`ch_fin` is derived server-side and already accounts for the partial arc, so this needs no unit maths on the client.

- [ ] **Step 7: Verify**

Run: `cd frontend && npx vitest run src/lib/formatters.test.js`
Expected: PASS.
Run: `cd frontend && npm run test:run && npm run lint`
Expected: PASS.
Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/tracker/NovelTrackerBlock.jsx frontend/src/components/tracker/NovelDashboardCard.jsx frontend/src/lib/formatters.js frontend/src/lib/formatters.test.js
git commit -m "feat(novel): two-stage arc/chapter tracker and JP/KR volume label"
```

---

### Task 11: Detail page, Add/Modify payloads and remaining labels

**Files:**
- Modify: `frontend/src/pages/detail/Novel.jsx:35-55`
- Modify: `frontend/src/pages/admin/Add.jsx:1865-1945`
- Modify: `frontend/src/pages/admin/Modify.jsx:725-770, 1860-1940`
- Modify: `frontend/src/config/formFields/fieldMeta.js` (the `vol_total_original` label)
- Modify: `frontend/src/components/cards/MediaCard.jsx:394-410`

**Interfaces:**
- Consumes: `NovelUnitsEditor` (Task 9), `unitDisplayKey` (Task 8).
- Produces: novel create/update payloads carry `units`; nothing references `novel_name_each_*`.

- [ ] **Step 1: Find every remaining reference**

Run: `grep -rn "novel_name_each" frontend/src app`
Expected at the end of this task: **no matches**.

- [ ] **Step 2: Detail page**

In `frontend/src/pages/detail/Novel.jsx`, replace the two `cnItems` / `enItems` state hooks and their `useEffect` with a single `units` state seeded from `novel.units`, render the list using each unit's server-provided `display_key` (plus `name_cn` / `name_en` / `remark`, and `ch_count` for arcs), and send `units` in the save payload instead of the two `novel_name_each_*` keys.

- [ ] **Step 3: Add page payload**

In `frontend/src/pages/admin/Add.jsx`, delete the two blocks that filter `novel_name_each_cn` / `novel_name_each_en` for non-empty names (around lines 1868–1880) and the two payload keys (around 1936–1941). Replace with:

```javascript
      units: (nvf.units || [])
        .filter(
          (u) =>
            (u.unit_key && u.unit_key.trim()) ||
            (u.name_cn && u.name_cn.trim()) ||
            (u.name_en && u.name_en.trim()) ||
            u.ch_count !== "",
        )
        .map((u, i) => ({
          ...u,
          position: i + 1,
          ch_count: u.ch_count === "" ? null : Number(u.ch_count),
        })),
```

- [ ] **Step 4: Modify page payload**

Make the equivalent change in `frontend/src/pages/admin/Modify.jsx` — the seed block around lines 729–765 and the payload block around 1866–1933. The seed must keep each unit's `system_id`, otherwise every save deletes and recreates every row.

- [ ] **Step 5: Labels**

In `fieldMeta.js`, change `vol_total_original`'s label to `"Total Volumes (JP/KR)"`. Leave the column name alone (Decision F).

In `MediaCard.jsx:394-410`, the `arc_fin`/`arc_total` render becomes the same two-stage string as `getNovelProgress` — import and call it rather than duplicating the branch.

- [ ] **Step 6: Verify**

Run: `grep -rn "novel_name_each" frontend/src app`
Expected: no matches.
Run: `cd frontend && npm run test:run && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Manual smoke test**

Start the app (`uvicorn app.main:app --reload --reload-dir app`, and `cd frontend && npm run dev`). Then:
1. Add a Web novel with two arcs (100 and 112 chapters). Save.
2. On its detail page, step chapters up to 100 and confirm the tracker rolls into arc 2.
3. Add a Light Novel with two named volumes and a remark on each; confirm the volume counters are untouched by the unit rows.
4. Confirm the volume total reads "JP/KR".

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/detail/Novel.jsx frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx frontend/src/config/formFields/fieldMeta.js frontend/src/components/cards/MediaCard.jsx
git commit -m "feat(novel): units in the detail page and admin payloads, JP/KR labels"
```

---

### Task 12: Drift guard and documentation

**Files:**
- Create: `frontend/src/config/novelUnitKinds.test.js`
- Modify: `docs/data-model.md`, `docs/options.md`, `docs/entry-types.md`, `docs/api.md`, `docs/business-rules.md`, `docs/frontend/components.md`, `docs/testing.md`
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a test that fails if the frontend and backend kind maps diverge.

- [ ] **Step 1: Write the drift guard**

`NOVEL_UNIT_KINDS_BY_TYPE` is hand-maintained in two languages, the way `planNext.test.js` guards `ALLOWED_SCOPES`. Create `frontend/src/config/novelUnitKinds.test.js`:

```javascript
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOVEL_UNIT_KINDS_BY_TYPE } from "../lib/novelUnits";

// Reads the Python source rather than importing it: the guard has to fail
// when the backend map changes, which a duplicated JS copy could never do.
const constants = fs.readFileSync(
  path.resolve(__dirname, "../../../app/utils/constants.py"),
  "utf8",
);

describe("novel unit kinds", () => {
  it("matches the backend map", () => {
    const block = constants.match(
      /NOVEL_UNIT_KINDS_BY_TYPE = \{([\s\S]*?)\n\}/,
    );
    expect(block).not.toBeNull();

    const parsed = {};
    for (const line of block[1].split("\n")) {
      const m = line.match(/"([^"]+)":\s*\(([^)]*)\)/);
      if (!m) continue;
      parsed[m[1]] = m[2]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }
    expect(parsed).toEqual(NOVEL_UNIT_KINDS_BY_TYPE);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd frontend && npx vitest run src/config/novelUnitKinds.test.js`
Expected: PASS. Then temporarily edit one kind in `app/utils/constants.py`, re-run, confirm it FAILS, and revert.

- [ ] **Step 3: Update the docs**

Each edit bumps that file's `Last verified` line.

- `docs/data-model.md`: rewrite the `novel` column table — drop `novel_name_each_cn` / `_en`, add `ch_fin_in_arc`, note which columns are derived; add a `novel_unit` section; add `novel_unit` to the table list at the top.
- `docs/options.md`: add `NOVEL_UNIT_KINDS` and the per-type map (noting they are code-branching values, not `system_option`); narrow the documented `progress_display` vocabulary; record that `vol_total_original` is labelled JP/KR.
- `docs/entry-types.md`: describe the four novel structures and which kinds each type offers.
- `docs/api.md`: the `units` payload on novel create/update, and `display_key` on the response.
- `docs/business-rules.md`: the rollover rule, the derivation formula, and Decision B's volume/arc asymmetry.
- `docs/frontend/components.md`: `NovelUnitsEditor` replaces `BelongingNovelsEditor`.
- `docs/testing.md`: the new test files.

- [ ] **Step 4: Record progress on the roadmap**

Add a line to the **"Next"** section of `docs/roadmap.md` only. Do not restructure the file, and do not edit the plan itself — that is the standing rule at the top of that document.

- [ ] **Step 5: Full verification**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: PASS.
Run: `venv/Scripts/ruff.exe check .`
Expected: clean.
Run: `cd frontend && npm run test:run && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/config/novelUnitKinds.test.js docs/data-model.md docs/options.md docs/entry-types.md docs/api.md docs/business-rules.md docs/frontend/components.md docs/testing.md docs/roadmap.md
git commit -m "docs(novel): document novel_unit, two-stage progress and the kind vocabulary"
```

---

## Notes for the executor

- **Task 3 destroys data.** Run a Sheets Backup before `alembic upgrade head`. GCP is down but Google Sheets still works.
- **Decision B is counter-intuitive on purpose.** Adding volume rows must never change `vol_fin`, `vol_total_original` or `vol_total_tw`. If a test seems to want that, re-read the design doc before changing the test.
- **The worked example is the anchor.** Arc 1 = 100, arc 2 = 112, `arc_fin = 1`, `ch_fin_in_arc = 101` → `ch_total = 212`, `ch_fin = 201`. If an implementation produces 101 or 213, the carry is wrong.
- Tasks 1–7 are backend and can be reviewed without a frontend build. Tasks 8–11 each need `npm run build` before they count as done.
