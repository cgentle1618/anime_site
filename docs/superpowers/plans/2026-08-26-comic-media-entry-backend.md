# Comic Media Entry (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `comic` as a full backend media entry type — table, schemas, a registry-driven `/api/comic` CRUD router, hierarchy resolution, cross-type referencing, Fill/Replace pipelines, and Google Sheets backup/pull.

**Architecture:** Comic is a *uniform* media type, so it does not get a hand-written router. One `MediaTypeSpec` in `app/registry.py` is consumed by `app/routers/_factory.py` to generate the entire CRUD surface. The work is therefore: build the pieces the spec references (model, schemas, hierarchy resolver, completion helper, write hook), register them, then extend the four cross-cutting systems (media resolver, options extraction, pipelines, sheets).

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, Alembic, pydantic v2, pytest.

**Spec:** `docs/superpowers/specs/2026-08-26-comic-media-entry-design.md`

## Global Constraints

- Backend code lives under `app/`. Run the app with `uvicorn app.main:app`.
- Run tests with `venv/Scripts/python.exe -m pytest` (pytest 9.1.1). The bare `python`/`py` launchers do **not** have pytest installed.
- Entry grain: one comic entry is a **run**, measured in issues read out of issues total. Events/eras are labels on a run, never entries.
- `display_name` fallback for comic is **EN → CN → Alt**. Every other entry type leads with CN. Do not "fix" this to match the others.
- No `mal_*` or `anilist_*` columns, and no external API call anywhere in the comic paths. Comics are manual-entry.
- There is no `progress_display` column on comic (see the spec's Amendment section).
- `serialization_status` values are Chinese: `連載中` (serializing), `停更` (hiatus), `腰斬` (cancelled), `完結` (completed).
- `reading_status` defaults to `Might Read`, not null.
- New `system_options` categories introduced here: `Comic Publisher`, `Comic Imprint`, `Comic Continuity`, `Comic Era`, `Comic Event`, `Comic Writer`, `Comic Artist`.
- **Concurrent sessions:** other Claude sessions may be editing this working tree. Stage only the files each task names. Never `git add -A`, never `git checkout --`/`restore`/`stash`/`reset` on shared files.
- Commit at the end of each task. Do not push; the user pushes.

---

### Task 1: Comic model and migration

**Files:**
- Create: `app/models/comic.py`
- Modify: `app/models/__init__.py` (import, `__all__`, `_REMARK_OWNERS`)
- Create: `alembic/versions/a0b1c2d3e4f5_add_comic_table.py`
- Test: `tests/unit/test_comic_model.py`

**Interfaces:**
- Consumes: `app.database.Base`, `app.database.get_taipei_now`, `app.models.base.NameFallbackMixin`.
- Produces: `models.Comic` with `__tablename__ = "comic"`, a `display_name` property falling back EN → CN → Alt, and a `remark` column property wired through `_REMARK_OWNERS` with owner type `"comic"`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_comic_model.py`. These are pure model tests — no DB session needed, since `display_name` is computed from instance attributes.

```python
"""
Unit tests for the Comic model.

Comic is the only entry type whose display name leads with EN rather than CN,
because Western comics are known by their English titles.
"""

from app.models.comic import Comic


class TestComicDisplayName:
    """Fallback order is EN -> CN -> Alt."""

    def test_prefers_en(self):
        c = Comic(comic_name_en="Amazing Spider-Man", comic_name_cn="蜘蛛人")
        assert c.display_name == "Amazing Spider-Man"

    def test_falls_back_to_cn(self):
        c = Comic(comic_name_cn="蜘蛛人", comic_name_alt="ASM")
        assert c.display_name == "蜘蛛人"

    def test_falls_back_to_alt(self):
        c = Comic(comic_name_alt="ASM")
        assert c.display_name == "ASM"

    def test_empty_when_no_names(self):
        c = Comic()
        assert c.display_name == ""

    def test_ignores_whitespace_only_names(self):
        c = Comic(comic_name_en="   ", comic_name_cn="蜘蛛人")
        assert c.display_name == "蜘蛛人"


class TestComicColumns:
    def test_tablename(self):
        assert Comic.__tablename__ == "comic"

    def test_name_fields_registered_for_fallback_mixin(self):
        assert Comic._name_fields == [
            "comic_name_en",
            "comic_name_cn",
            "comic_name_alt",
        ]

    def test_has_no_external_rating_columns(self):
        # Comics are manual-entry: nothing would ever populate these.
        cols = {c.name for c in Comic.__table__.columns}
        assert not {c for c in cols if c.startswith("mal_") or c.startswith("anilist_")}

    def test_has_no_progress_display_column(self):
        cols = {c.name for c in Comic.__table__.columns}
        assert "progress_display" not in cols

    def test_issue_columns_exist(self):
        cols = {c.name for c in Comic.__table__.columns}
        assert {"issue_total", "issue_fin"} <= cols
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_comic_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.comic'`

- [ ] **Step 3: Write the model**

Create `app/models/comic.py`:

```python
"""Comic ORM model."""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Comic(Base, NameFallbackMixin):
    """Western comic runs, Marvel-focused. One entry is one numbered run."""

    __tablename__ = "comic"
    _name_fields = [
        "comic_name_en",
        "comic_name_cn",
        "comic_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    comic_name_en = Column(String, nullable=True)
    comic_name_cn = Column(String, nullable=True)
    comic_name_alt = Column(String, nullable=True)
    # Run designator: "Vol. 5", "(2018)", "Legacy". Free text, not numeric:
    # Marvel run labels are not consistently numbered.
    volume_label = Column(String, nullable=True)

    comic_type = Column(String, nullable=True)
    publisher = Column(String, nullable=True)
    imprint = Column(String, nullable=True)
    continuity = Column(String, nullable=True)
    era = Column(String, nullable=True)
    # Comma-joined multi-select, same idiom as franchise.franchise_type.
    events = Column(String, nullable=True)
    is_main_entry = Column(Boolean, nullable=True)

    writer = Column(String, nullable=True)
    artist = Column(String, nullable=True)
    release_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    publisher_tw = Column(String, nullable=True)

    issue_total = Column(Integer, nullable=True)
    issue_fin = Column(Integer, nullable=False, default=0)
    serialization_status = Column(String, nullable=True)
    reading_status = Column(String, nullable=False, default="Might Read")
    read_order = Column(Float, nullable=True)

    my_rating = Column(String, nullable=True)

    source_other = Column(JSONB, default=None, nullable=True)

    # No UI this pass (plan pages are out of scope), but created now so adding
    # those pages later needs no migration.
    read_next = Column(Boolean, nullable=True)
    to_reread = Column(Boolean, default=False, nullable=True)

    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    @property
    def display_name(self) -> str:
        sequence = [
            ("EN", self.comic_name_en),
            ("CN", self.comic_name_cn),
            ("Alt", self.comic_name_alt),
        ]
        return self.get_fallback_name(sequence, "EN")
```

- [ ] **Step 4: Register the model**

In `app/models/__init__.py`, add the import next to the other model imports:

```python
from app.models.comic import Comic
```

Add `"Comic"` to `__all__` (next to `"Novel"`), and add the remark owner tuple to `_REMARK_OWNERS` after the `(Novel, "novel")` entry:

```python
    (Novel, "novel"),
    (Comic, "comic"),
```

That last line is what gives `Comic.remark` its column property, so notes written against owner type `"comic"` read back on the entry.

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_comic_model.py -v`
Expected: PASS, 9 tests.

- [ ] **Step 6: Write the migration**

The current head is `z9a0b1c2d3e4` (`alembic/versions/z9a0b1c2d3e4_meme_single_content.py`). Hand-write the migration rather than autogenerating, so the revision id follows the repo's existing sequence style.

Create `alembic/versions/a0b1c2d3e4f5_add_comic_table.py`:

```python
"""add comic table

Revision ID: a0b1c2d3e4f5
Revises: z9a0b1c2d3e4
Create Date: 2026-08-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, Sequence[str], None] = 'z9a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'comic',
        sa.Column('system_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('franchise_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('series_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('comic_name_en', sa.String(), nullable=True),
        sa.Column('comic_name_cn', sa.String(), nullable=True),
        sa.Column('comic_name_alt', sa.String(), nullable=True),
        sa.Column('volume_label', sa.String(), nullable=True),
        sa.Column('comic_type', sa.String(), nullable=True),
        sa.Column('publisher', sa.String(), nullable=True),
        sa.Column('imprint', sa.String(), nullable=True),
        sa.Column('continuity', sa.String(), nullable=True),
        sa.Column('era', sa.String(), nullable=True),
        sa.Column('events', sa.String(), nullable=True),
        sa.Column('is_main_entry', sa.Boolean(), nullable=True),
        sa.Column('writer', sa.String(), nullable=True),
        sa.Column('artist', sa.String(), nullable=True),
        sa.Column('release_year', sa.Integer(), nullable=True),
        sa.Column('end_year', sa.Integer(), nullable=True),
        sa.Column('publisher_tw', sa.String(), nullable=True),
        sa.Column('issue_total', sa.Integer(), nullable=True),
        sa.Column('issue_fin', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('serialization_status', sa.String(), nullable=True),
        sa.Column('reading_status', sa.String(), nullable=False,
                  server_default='Might Read'),
        sa.Column('read_order', sa.Float(), nullable=True),
        sa.Column('my_rating', sa.String(), nullable=True),
        sa.Column('source_other', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('read_next', sa.Boolean(), nullable=True),
        sa.Column('to_reread', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('cover_image_file', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['franchise_id'], ['franchise.system_id'],
                                ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['series_id'], ['series.system_id'],
                                ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('system_id'),
    )
    op.create_index(op.f('ix_comic_system_id'), 'comic', ['system_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_comic_system_id'), table_name='comic')
    op.drop_table('comic')
```

- [ ] **Step 7: Apply and verify the migration**

Make sure PostgreSQL is up (`docker-compose up -d`), then run:

```bash
venv/Scripts/python.exe -m alembic upgrade head
```

Expected: `Running upgrade z9a0b1c2d3e4 -> a0b1c2d3e4f5, add comic table`

Verify the round trip by downgrading and re-upgrading:

```bash
venv/Scripts/python.exe -m alembic downgrade -1
venv/Scripts/python.exe -m alembic upgrade head
```

Expected: both succeed with no error. A failure here means the migration is not reversible and must be fixed before committing.

- [ ] **Step 8: Commit**

```bash
git add app/models/comic.py app/models/__init__.py alembic/versions/a0b1c2d3e4f5_add_comic_table.py tests/unit/test_comic_model.py
git commit -m "feat(comic): add Comic model and table migration"
```

---

### Task 2: Comic schemas

**Files:**
- Create: `app/schemas/comic.py`
- Modify: `app/schemas/__init__.py`
- Test: `tests/unit/test_comic_schemas.py`

**Interfaces:**
- Consumes: `models.Comic` from Task 1.
- Produces: `ComicBase`, `ComicCreate`, `ComicUpdate`, `ComicResponse`, `ComicSheetSync`. `ComicResponse` carries a `display_name` computed field with the EN → CN → Alt fallback and `model_config = ConfigDict(from_attributes=True)`. Task 4's registry entry consumes `ComicCreate`/`ComicUpdate`/`ComicResponse`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_comic_schemas.py`:

```python
"""Schema tests for Comic — defaults, and the EN-first display_name."""

import pytest
from pydantic import ValidationError

from app.schemas.comic import ComicCreate, ComicResponse
from uuid import uuid4


class TestComicCreateDefaults:
    def test_reading_status_defaults_to_might_read(self):
        c = ComicCreate(comic_name_en="Amazing Spider-Man")
        assert c.reading_status == "Might Read"

    def test_issue_fin_defaults_to_zero(self):
        c = ComicCreate(comic_name_en="Amazing Spider-Man")
        assert c.issue_fin == 0

    def test_all_names_optional(self):
        c = ComicCreate()
        assert c.comic_name_en is None

    def test_events_is_a_comma_joined_string(self):
        c = ComicCreate(comic_name_en="ASM", events="Hunted, Sinister War")
        assert c.events == "Hunted, Sinister War"

    def test_rejects_non_integer_issue_total(self):
        with pytest.raises(ValidationError):
            ComicCreate(comic_name_en="ASM", issue_total="not a number")


class TestComicResponseDisplayName:
    def _response(self, **names):
        return ComicResponse(system_id=uuid4(), **names)

    def test_prefers_en(self):
        r = self._response(comic_name_en="Amazing Spider-Man", comic_name_cn="蜘蛛人")
        assert r.display_name == "Amazing Spider-Man"

    def test_falls_back_to_cn(self):
        r = self._response(comic_name_cn="蜘蛛人", comic_name_alt="ASM")
        assert r.display_name == "蜘蛛人"

    def test_falls_back_to_alt(self):
        r = self._response(comic_name_alt="ASM")
        assert r.display_name == "ASM"

    def test_empty_when_no_names(self):
        assert self._response().display_name == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_comic_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.comic'`

- [ ] **Step 3: Write the schemas**

Create `app/schemas/comic.py`:

```python
"""Comic request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field


class ComicBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    comic_name_en: Optional[str] = None
    comic_name_cn: Optional[str] = None
    comic_name_alt: Optional[str] = None
    volume_label: Optional[str] = None

    comic_type: Optional[str] = None
    publisher: Optional[str] = None
    imprint: Optional[str] = None
    continuity: Optional[str] = None
    era: Optional[str] = None
    events: Optional[str] = None
    is_main_entry: Optional[bool] = None

    writer: Optional[str] = None
    artist: Optional[str] = None
    release_year: Optional[int] = None
    end_year: Optional[int] = None
    publisher_tw: Optional[str] = None

    issue_total: Optional[int] = None
    issue_fin: int = 0
    serialization_status: Optional[str] = None
    reading_status: str = "Might Read"
    read_order: Optional[float] = None

    my_rating: Optional[str] = None

    source_other: Optional[dict] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None


class ComicCreate(ComicBase):
    pass


class ComicUpdate(ComicBase):
    pass


class ComicResponse(ComicBase):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        # EN first: Western comics are known by their English titles. Every
        # other entry type leads with CN.
        for val in (
            self.comic_name_en,
            self.comic_name_cn,
            self.comic_name_alt,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class ComicSheetSync(ComicCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
```

- [ ] **Step 4: Export the schemas**

In `app/schemas/__init__.py`, next to the `app.schemas.novel` import block, add:

```python
from app.schemas.comic import (
    ComicBase,
    ComicCreate,
    ComicUpdate,
    ComicResponse,
    ComicSheetSync,
)
```

If that file has an `__all__`, add the five names to it as well.

- [ ] **Step 5: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_comic_schemas.py -v`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add app/schemas/comic.py app/schemas/__init__.py tests/unit/test_comic_schemas.py
git commit -m "feat(comic): add Comic request and response schemas"
```

---

### Task 3: Hierarchy resolver and completion helper

**Files:**
- Modify: `app/services/domain/hierarchy.py`
- Modify: `app/services/domain/completion.py`
- Modify: `app/services/domain/__init__.py`
- Test: `tests/unit/test_comic_completion.py`

**Interfaces:**
- Consumes: `models.Comic` (Task 1), `FranchiseType.COMIC` from `app/utils/constants.py` (already shipped in commit `1bf8b89`).
- Produces:
  - `resolve_comic_parent_hierarchy(db, franchise_id, series_id, names) -> tuple[Any, Any]` where `names` has keys `"en"`, `"cn"`, `"alt"`.
  - `mark_comic_completed(entry: Comic) -> None`.
  Both are consumed by Task 4's registry entry, and `resolve_comic_parent_hierarchy` again by Task 7's pull path.

- [ ] **Step 1: Write the failing test**

`mark_comic_completed` is pure — no DB needed — so it gets real unit tests. The hierarchy resolver needs a session and is covered by the API tests in Task 4.

Create `tests/unit/test_comic_completion.py`:

```python
"""Unit tests for mark_comic_completed."""

from app.models.comic import Comic
from app.services.domain.completion import mark_comic_completed


class TestMarkComicCompleted:
    def test_sets_reading_and_serialization_status(self):
        c = Comic(comic_name_en="ASM", issue_total=93, issue_fin=74)
        mark_comic_completed(c)
        assert c.reading_status == "Completed"
        assert c.serialization_status == "完結"

    def test_snaps_issue_fin_up_to_issue_total(self):
        c = Comic(comic_name_en="ASM", issue_total=93, issue_fin=74)
        mark_comic_completed(c)
        assert c.issue_fin == 93

    def test_raises_issue_total_when_fin_is_further_along(self):
        # Trusting the higher of the two matches how Novel handles vol counts.
        c = Comic(comic_name_en="ASM", issue_total=50, issue_fin=74)
        mark_comic_completed(c)
        assert c.issue_fin == 74
        assert c.issue_total == 74

    def test_leaves_unknown_total_alone(self):
        c = Comic(comic_name_en="ASM", issue_total=None, issue_fin=12)
        mark_comic_completed(c)
        assert c.issue_total is None
        assert c.issue_fin == 12

    def test_handles_both_counts_missing(self):
        c = Comic(comic_name_en="ASM")
        mark_comic_completed(c)
        assert c.reading_status == "Completed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_comic_completion.py -v`
Expected: FAIL — `ImportError: cannot import name 'mark_comic_completed'`

- [ ] **Step 3: Write the completion helper**

In `app/services/domain/completion.py`, add the `Comic` import alongside the existing model imports, then append:

```python
def mark_comic_completed(entry: Comic) -> None:
    """Sets a comic entry to a fully finished reading state."""
    entry.serialization_status = "完結"
    entry.reading_status = "Completed"

    issue_vals = [v for v in [entry.issue_total, entry.issue_fin] if v is not None]
    if issue_vals:
        issue_max = max(issue_vals)
        entry.issue_fin = issue_max
        if entry.issue_total is not None:
            entry.issue_total = issue_max
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_comic_completion.py -v`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the hierarchy resolver**

In `app/services/domain/hierarchy.py`, append this after `resolve_novel_parent_hierarchy`. Comic searches only three name keys — it has no romaji or JP names — but still searches all five *franchise* name columns, because an existing franchise may well carry them.

```python
def resolve_comic_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensures valid franchise_id and series_id UUIDs for a Comic entry.
    Franchise: valid UUID pass-through; null/string → search by name across all name fields;
    not found → auto-create with franchise_type="Comic".
    Series: non-string pass-through; non-empty string → search by name; not found → set null.
    Returns (final_franchise_id, final_series_id).
    """
    if franchise_id and not isinstance(franchise_id, str):
        final_franchise_id = franchise_id
    else:
        valid_names = set()
        for lang_key in ["en", "cn", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_roman.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Comic: {final_franchise_id}"
            )
        else:
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type=FranchiseType.COMIC,
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Comic: {final_franchise_id}"
            )

    final_series_id = series_id
    if isinstance(series_id, str):
        if series_id.strip():
            series_obj = (
                db.query(Series)
                .filter(
                    or_(
                        Series.series_name_en == series_id,
                        Series.series_name_cn == series_id,
                        Series.series_name_alt == series_id,
                    )
                )
                .first()
            )
            final_series_id = series_obj.system_id if series_obj else None
        else:
            final_series_id = None

    return final_franchise_id, final_series_id
```

- [ ] **Step 6: Export both from the domain package**

In `app/services/domain/__init__.py`, add `resolve_comic_parent_hierarchy` and `mark_comic_completed` to the imports and to `__all__`, next to their Novel counterparts.

- [ ] **Step 7: Verify the package still imports**

Run: `venv/Scripts/python.exe -c "from app.services.domain import resolve_comic_parent_hierarchy, mark_comic_completed; print('ok')"`
Expected: `ok`

- [ ] **Step 8: Commit**

```bash
git add app/services/domain/hierarchy.py app/services/domain/completion.py app/services/domain/__init__.py tests/unit/test_comic_completion.py
git commit -m "feat(comic): resolve comic parent hierarchy and mark entries completed"
```

---

### Task 4: Registry entry, write hook, and the /api/comic router

**Files:**
- Modify: `app/services/pipelines/replace.py`
- Modify: `app/services/pipelines/__init__.py`
- Modify: `app/registry.py`
- Create: `app/routers/comic.py`
- Modify: `app/main.py`
- Test: `tests/api/test_media_crud.py:14-21` (add comic to `CASES`)

**Interfaces:**
- Consumes: `models.Comic`, `ComicCreate`/`ComicUpdate`/`ComicResponse`, `resolve_comic_parent_hierarchy`, `mark_comic_completed` from Tasks 1–3.
- Produces: `execute_replace_single_comic(db, comic_id, action_type="Manual", log_action=True) -> dict`, `MEDIA_REGISTRY["comic"]`, and a mounted router serving `/api/comic`.

- [ ] **Step 1: Add comic to the parametrized CRUD suite**

`tests/api/test_media_crud.py` is parametrized over `CASES`, so comic joins with one line. Update the `CASES` list and the module docstring:

```python
"""
CRUD smoke tests for the six "regular" media routers (movie, tv_show, cartoon,
manga, novel, comic). These capture the behavior the router factory must preserve.

Entries are created with only a name (no imdb/mal link), so the create/update
write hook (execute_replace_single_*) is a no-op and no network call is made.
"""
```

```python
CASES = [
    ("movies", "movie_name_en", "watching_status", models.Movies),
    ("tv-shows", "tv_name_en", "watching_status", models.TVShows),
    ("cartoon", "cartoon_name_en", "watching_status", models.Cartoon),
    ("manga", "manga_name_en", "reading_status", models.Manga),
    ("novel", "novel_name_en", "reading_status", models.Novel),
    ("comic", "comic_name_en", "reading_status", models.Comic),
]
```

- [ ] **Step 2: Run the suite to verify comic fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_media_crud.py -v -k comic`
Expected: FAIL — every comic case 404s, because no `/api/comic` router is mounted yet.

- [ ] **Step 3: Write the write hook**

Comic has no external metadata source, so its write hook does not fetch anything. It re-runs options extraction (Task 6 supplies `run_sync_comic`) — but that function does not exist yet, so implement the hook now without it and wire the sync call in Task 6. In `app/services/pipelines/replace.py`, add the `Comic` import next to the other models and append:

```python
async def execute_replace_single_comic(
    db: Session,
    comic_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """
    Write hook for a single Comic entry.

    Unlike the other single-replace hooks this fetches nothing: comics are
    manual-entry, so there is no external record to reconcile against. It
    exists so the registry has a uniform write_hook, and so the write is
    logged like every other type's.
    """
    logger.info(f"Starting Single Replace Pipeline for Comic ID: {comic_id}")
    action_specific = "Replace for single comic entry"

    try:
        comic = db.query(Comic).filter(Comic.system_id == comic_id).first()
        if not comic:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Comic not found 404",
                )
            return {
                "status": "error",
                "message": "Comic entry not found",
                "status_code": 404,
            }

        db.commit()

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {comic.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Comic Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}
```

Export it from `app/services/pipelines/__init__.py` alongside `execute_replace_single_novel`.

- [ ] **Step 4: Add the registry entry**

In `app/registry.py`, add `resolve_comic_parent_hierarchy` and `mark_comic_completed` to the `app.services.domain` import block, and `execute_replace_single_comic` to the `app.services.pipelines` block. Then add this entry to `MEDIA_REGISTRY` after `"novel"`:

```python
    "comic": MediaTypeSpec(
        key="comic",
        owner_type="comic",
        label="Comic",
        route="comic",
        model=models.Comic,
        create_schema=schemas.ComicCreate,
        update_schema=schemas.ComicUpdate,
        response_schema=schemas.ComicResponse,
        status_field="reading_status",
        list_filters=("franchise_id", "series_id", "reading_status", "serialization_status", "to_reread"),
        hierarchy_names={"en": "comic_name_en", "cn": "comic_name_cn", "alt": "comic_name_alt"},
        search_fields=("comic_name_en", "comic_name_cn", "comic_name_alt"),
        resolve_hierarchy=resolve_comic_parent_hierarchy,
        mark_completed=mark_comic_completed,
        write_hook=execute_replace_single_comic,
    ),
```

Also update the module docstring: it says "Only the five uniform types live here" — that becomes six.

- [ ] **Step 5: Create and mount the router**

Create `app/routers/comic.py`:

```python
"""routers/comic.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.
"""
from app.routers._factory import make_media_router
from app.registry import MEDIA_REGISTRY

router = make_media_router(MEDIA_REGISTRY["comic"])
```

In `app/main.py`, add `comic` to the routers import list and add the include next to the novel one:

```python
app.include_router(comic.router)
```

- [ ] **Step 6: Run the suite to verify comic passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_media_crud.py -v`
Expected: PASS for all six types, comic included.

- [ ] **Step 7: Run the whole backend suite for regressions**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures versus the pre-task baseline. Registering a new model touches `_REMARK_OWNERS` and the shared metadata, so this is the checkpoint that catches collateral damage.

- [ ] **Step 8: Commit**

```bash
git add app/services/pipelines/replace.py app/services/pipelines/__init__.py app/registry.py app/routers/comic.py app/main.py tests/api/test_media_crud.py
git commit -m "feat(comic): serve /api/comic through the media router factory"
```

---

### Task 5: Cross-type references (notes, remarks, quotes, memes)

**Files:**
- Modify: `app/utils/media_resolver.py:50-59`
- Test: `tests/unit/test_media_resolver.py`

**Interfaces:**
- Consumes: `models.Comic` (Task 1).
- Produces: `MEDIA_TABLES["comic"]`, which widens `MEDIA_TYPE_KEYS` and `OWNER_TABLES`/`OWNER_TYPE_KEYS` automatically. This is what lets a note, remark, quote or meme point at a comic entry.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_media_resolver.py` — match the surrounding file's existing style and imports:

```python
class TestComicIsResolvable:
    def test_comic_in_media_tables(self):
        from app.utils.media_resolver import MEDIA_TABLES

        ref = MEDIA_TABLES["comic"]
        assert ref.key == "comic"
        assert ref.label == "Comic"
        assert ref.nav_path == "/comic"
        assert ref.is_tier is False

    def test_comic_in_media_type_keys(self):
        from app.utils.media_resolver import MEDIA_TYPE_KEYS

        assert "comic" in MEDIA_TYPE_KEYS

    def test_comic_is_a_valid_meme_owner(self):
        from app.utils.media_resolver import OWNER_TYPE_KEYS

        assert "comic" in OWNER_TYPE_KEYS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_media_resolver.py -v -k Comic`
Expected: FAIL — `KeyError: 'comic'`

- [ ] **Step 3: Register comic in MEDIA_TABLES**

In `app/utils/media_resolver.py`, add the entry after `"novel"`:

```python
    "novel": MediaRef("novel", "Novel", models.Novel, "/novel"),
    "comic": MediaRef("comic", "Comic", models.Comic, "/comic"),
```

`MEDIA_TYPE_KEYS`, `OWNER_TABLES` and `OWNER_TYPE_KEYS` are all derived from this dict, so no other edit is needed in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_media_resolver.py -v`
Expected: PASS, including the three new cases.

- [ ] **Step 5: Commit**

```bash
git add app/utils/media_resolver.py tests/unit/test_media_resolver.py
git commit -m "feat(comic): let notes, remarks, quotes and memes reference comics"
```

---

### Task 6: System options extraction and the Fill pipeline

**Files:**
- Modify: `app/services/domain/options_extraction.py`
- Modify: `app/services/domain/__init__.py`
- Modify: `app/services/calculation.py`
- Modify: `app/services/pipelines/fill.py`
- Modify: `app/services/pipelines/replace.py` (wire `run_sync_comic` into the Task 4 hook)
- Modify: `app/routers/data_control.py`
- Test: `tests/api/test_comic_options_extraction.py`

**Interfaces:**
- Consumes: `models.Comic`, `SystemOption`.
- Produces: `extract_system_options_from_comic(db) -> dict`, `run_sync_comic(db) -> dict`, `execute_fill_comic(db, request, action_specific="Fill Comic", action_type="Manual", log_action=True)` as an async SSE generator, and the `/api/data-control/fill/comic` and `/api/data-control/replace/comic/{comic_id}` endpoints.

- [ ] **Step 1: Write the failing test**

This test needs a real DB session. The `db_session` fixture is defined in `tests/api/conftest.py` (function-scoped, wraps each test in a transaction that rolls back), and it requires PostgreSQL to be running — `docker-compose up -d` first. Because the fixture lives under `tests/api/`, the test file goes there too, not in `tests/unit/`.

Create `tests/api/test_comic_options_extraction.py`:

```python
"""Options extraction from Comic entries."""

from app.models.comic import Comic
from app.models.system import SystemOption
from app.services.domain.options_extraction import extract_system_options_from_comic


def _values(db, category):
    return {
        o.option_value
        for o in db.query(SystemOption).filter(SystemOption.category == category).all()
    }


class TestExtractSystemOptionsFromComic:
    def test_extracts_creator_and_publisher_fields(self, db_session):
        db_session.add(
            Comic(
                comic_name_en="Amazing Spider-Man",
                writer="Nick Spencer",
                artist="Ryan Ottley",
                publisher="Marvel",
            )
        )
        db_session.commit()

        extract_system_options_from_comic(db_session)

        assert "Nick Spencer" in _values(db_session, "Comic Writer")
        assert "Ryan Ottley" in _values(db_session, "Comic Artist")
        assert "Marvel" in _values(db_session, "Comic Publisher")

    def test_splits_comma_joined_events(self, db_session):
        db_session.add(
            Comic(comic_name_en="ASM", events="Hunted, Sinister War")
        )
        db_session.commit()

        extract_system_options_from_comic(db_session)

        events = _values(db_session, "Comic Event")
        assert "Hunted" in events
        assert "Sinister War" in events

    def test_does_not_duplicate_existing_options(self, db_session):
        db_session.add(SystemOption(category="Comic Publisher", option_value="Marvel"))
        db_session.add(Comic(comic_name_en="ASM", publisher="Marvel"))
        db_session.commit()

        extract_system_options_from_comic(db_session)

        marvels = [
            o
            for o in db_session.query(SystemOption)
            .filter(SystemOption.category == "Comic Publisher")
            .all()
            if o.option_value == "Marvel"
        ]
        assert len(marvels) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_comic_options_extraction.py -v`
Expected: FAIL — `ImportError: cannot import name 'extract_system_options_from_comic'`

- [ ] **Step 3: Write the extractor**

In `app/services/domain/options_extraction.py`, add the `Comic` import, then add the field map next to `_NOVEL_OPTION_FIELD_MAP`:

```python
_COMIC_OPTION_FIELD_MAP = {
    "Comic Publisher": "publisher",
    "Comic Imprint": "imprint",
    "Comic Continuity": "continuity",
    "Comic Era": "era",
    "Comic Event": "events",
    "Comic Writer": "writer",
    "Comic Artist": "artist",
    "Distributor TW": "publisher_tw",
}
```

Then the extractor. The comma split in the loop is what makes the multi-valued `events` field work without special handling:

```python
def extract_system_options_from_comic(db: Session) -> dict:
    """
    Scans all Comic entries for values in publisher, imprint, continuity, era,
    events, writer, artist and publisher_tw. Any value not already in
    SystemOption is created. Comma-joined fields (events) are split per value.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    comics = db.query(Comic).all()
    new_options = []

    for category, field in _COMIC_OPTION_FIELD_MAP.items():
        for comic in comics:
            raw = getattr(comic, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_comic: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(comics)} entries, created {len(new_options)} missing system options.",
    }
```

Export `extract_system_options_from_comic` from `app/services/domain/__init__.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_comic_options_extraction.py -v`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add run_sync_comic**

In `app/services/calculation.py`, next to `run_sync_novel`:

```python
def run_sync_comic(db: Session) -> dict:
    extract_system_options_from_comic(db)
    return {
        "status": "success",
        "message": "System options extracted from comic.",
    }
```

Add the `extract_system_options_from_comic` import at the top of that module.

- [ ] **Step 6: Wire run_sync_comic into the write hook**

In `app/services/pipelines/replace.py`, inside `execute_replace_single_comic`, replace the bare `db.commit()` from Task 4 with:

```python
        db.commit()
        run_sync_comic(db)
```

Add the `run_sync_comic` import alongside the existing `run_sync_novel` import in that module.

- [ ] **Step 7: Write the Fill pipeline**

In `app/services/pipelines/fill.py`, add the `Comic` and `run_sync_comic` imports, then append. Note this is much shorter than `execute_fill_novel`: with no external source there is no fetch queue, no throttling sleep and no per-entry progress, but it stays an SSE generator so the admin page's existing streaming UI works unchanged.

```python
async def execute_fill_comic(
    db: Session,
    request: Request,
    action_specific: str = "Fill Comic",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """
    Async Generator (SSE) for 'Fill Comic'.

    Comics are manual-entry, so there is nothing to fetch. This extracts system
    options and returns — it exists so the admin Fill controls behave uniformly
    across types.
    """
    logger.info(f"Starting {action_specific} Pipeline...")

    try:
        total = db.query(Comic).count()

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': 0, 'total': total})}\n\n"
        run_sync_comic(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=total,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total, 'processed': total})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.warning(f"{action_specific} cancelled by client.")
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
```

- [ ] **Step 8: Add the data-control endpoints**

In `app/routers/data_control.py`, add `execute_fill_comic` and `execute_replace_single_comic` to the pipeline imports at the top, then add these two handlers after `trigger_replace_single_novel` (around line 547). Both are **POST** — the Fill endpoints in this router are POST even though they stream.

Comic gets no bulk `/replace/comic`: bulk replace exists to re-fetch every entry from an external source, and comic has none.

```python
@router.post("/fill/comic")
async def trigger_fill_comic(request: Request, db: Session = Depends(get_db)):
    """Triggers the Fill Pipeline specifically for Comic entries. SSE streaming."""
    try:
        return StreamingResponse(
            execute_fill_comic(
                db,
                request,
                action_specific="Fill Comic",
                action_type="Manual",
                log_action=True,
            ),
            media_type="text/event-stream",
        )
    except Exception as e:
        logger.error(f"Error in fill comic: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replace/comic/{comic_id}")
async def trigger_replace_single_comic(comic_id: str, db: Session = Depends(get_db)):
    """Triggers the Replace Pipeline for a single comic entry."""
    try:
        result = await execute_replace_single_comic(
            db, comic_id, action_type="Manual", log_action=False
        )
        if result.get("status") == "error":
            raise HTTPException(
                status_code=result.get("status_code", 400), detail=result.get("message")
            )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in replace single comic: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 9: Verify the endpoints are mounted**

Run: `venv/Scripts/python.exe -c "from app.main import app; print([r.path for r in app.routes if 'comic' in r.path])"`
Expected: a list containing `/api/comic/`, `/api/data-control/fill/comic` and `/api/data-control/replace/comic/{comic_id}`. (`/api/data-control/pull/comic` arrives in Task 7.)

- [ ] **Step 10: Run the whole backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures.

- [ ] **Step 11: Commit**

```bash
git add app/services/domain/options_extraction.py app/services/domain/__init__.py app/services/calculation.py app/services/pipelines/fill.py app/services/pipelines/replace.py app/routers/data_control.py tests/api/test_comic_options_extraction.py
git commit -m "feat(comic): extract comic system options and add the Fill pipeline"
```

---

### Task 7: Google Sheets backup and pull

**Files:**
- Modify: `app/utils/formatter.py`
- Modify: `app/services/pipelines/backup.py:196-200`
- Modify: `app/services/pipelines/pull.py:118-160, 225-240, 745-760`
- Modify: `app/routers/data_control.py` (the `/pull/comic` endpoint)
- Test: `tests/unit/test_formatter_comic.py`

**Interfaces:**
- Consumes: `models.Comic`, `resolve_comic_parent_hierarchy` (Task 3), the existing `parse_from_sheet` and `_safe_json` helpers in `app/utils/formatter.py`.
- Produces: `parse_comic_from_sheet(raw: dict) -> dict`, a `Comic` tab in the backup workbook, and the `"Comic"` entries in pull's `MODEL_MAP`, `PARSER_MAP` and tab order.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_formatter_comic.py`, following the shape of the existing `tests/unit/test_formatter_*.py` files:

```python
"""parse_comic_from_sheet — sheet strings in, typed values out."""

import uuid

from app.utils.formatter import parse_comic_from_sheet


class TestParseComicFromSheet:
    def test_parses_names_and_ids(self):
        fid = str(uuid.uuid4())
        parsed = parse_comic_from_sheet(
            {
                "system_id": "",
                "franchise_id": fid,
                "comic_name_en": "Amazing Spider-Man",
                "comic_name_cn": "蜘蛛人",
            }
        )
        assert str(parsed["franchise_id"]) == fid
        assert parsed["comic_name_en"] == "Amazing Spider-Man"
        assert parsed["comic_name_cn"] == "蜘蛛人"

    def test_franchise_id_may_be_a_raw_name(self):
        # Pull resolves these through resolve_comic_parent_hierarchy.
        parsed = parse_comic_from_sheet({"franchise_id": "Spider-Man"})
        assert parsed["franchise_id"] == "Spider-Man"

    def test_issue_counts_parse_as_ints(self):
        parsed = parse_comic_from_sheet({"issue_total": "93", "issue_fin": "74"})
        assert parsed["issue_total"] == 93
        assert parsed["issue_fin"] == 74

    def test_blank_issue_fin_defaults_to_zero(self):
        parsed = parse_comic_from_sheet({"issue_fin": ""})
        assert parsed["issue_fin"] == 0

    def test_blank_reading_status_defaults_to_might_read(self):
        parsed = parse_comic_from_sheet({"reading_status": ""})
        assert parsed["reading_status"] == "Might Read"

    def test_events_stay_a_comma_joined_string(self):
        parsed = parse_comic_from_sheet({"events": "Hunted, Sinister War"})
        assert parsed["events"] == "Hunted, Sinister War"

    def test_booleans_parse(self):
        parsed = parse_comic_from_sheet({"is_main_entry": "TRUE", "to_reread": "FALSE"})
        assert parsed["is_main_entry"] is True
        assert parsed["to_reread"] is False

    def test_round_trips_every_model_column(self):
        # Guards against a column being added to the model but forgotten here.
        from app.models.comic import Comic

        parsed = parse_comic_from_sheet({})
        model_cols = {c.name for c in Comic.__table__.columns}
        # created_at/updated_at are stamped by the DB, not parsed from the sheet.
        expected = model_cols - {"created_at", "updated_at"}
        assert expected <= set(parsed.keys())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_comic.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_comic_from_sheet'`

- [ ] **Step 3: Write the parser**

In `app/utils/formatter.py`, add after `parse_novel_from_sheet`:

```python
def parse_comic_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Comic sheet into typed data ready for the Database.
    franchise_id and series_id may be a UUID or a raw string name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "comic_name_en": parse_from_sheet(raw.get("comic_name_en"), str),
        "comic_name_cn": parse_from_sheet(raw.get("comic_name_cn"), str),
        "comic_name_alt": parse_from_sheet(raw.get("comic_name_alt"), str),
        "volume_label": parse_from_sheet(raw.get("volume_label"), str),
        "comic_type": parse_from_sheet(raw.get("comic_type"), str),
        "publisher": parse_from_sheet(raw.get("publisher"), str),
        "imprint": parse_from_sheet(raw.get("imprint"), str),
        "continuity": parse_from_sheet(raw.get("continuity"), str),
        "era": parse_from_sheet(raw.get("era"), str),
        "events": parse_from_sheet(raw.get("events"), str),
        "is_main_entry": parse_from_sheet(raw.get("is_main_entry"), bool),
        "writer": parse_from_sheet(raw.get("writer"), str),
        "artist": parse_from_sheet(raw.get("artist"), str),
        "release_year": parse_from_sheet(raw.get("release_year"), int),
        "end_year": parse_from_sheet(raw.get("end_year"), int),
        "publisher_tw": parse_from_sheet(raw.get("publisher_tw"), str),
        "issue_total": parse_from_sheet(raw.get("issue_total"), int),
        "issue_fin": parse_from_sheet(raw.get("issue_fin"), int) or 0,
        "serialization_status": parse_from_sheet(raw.get("serialization_status"), str),
        "reading_status": parse_from_sheet(raw.get("reading_status"), str)
        or "Might Read",
        "read_order": parse_from_sheet(raw.get("read_order"), float),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "source_other": _safe_json(raw.get("source_other")),
        "read_next": parse_from_sheet(raw.get("read_next"), bool),
        "to_reread": parse_from_sheet(raw.get("to_reread"), bool),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_comic.py -v`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the backup tab**

In `app/services/pipelines/backup.py`, add the `Comic` import, and after the Novel block (around line 196-200) add:

```python
        comic_entries = db.query(Comic).all()
        comic_headers = [c.name for c in Comic.__table__.columns]
        comic_matrix = [comic_headers] + [
            format_model_for_sheet(c) for c in comic_entries
        ]
        bulk_overwrite_sheet("Comic", comic_matrix)
```

It must sit before the watch-order writes, which the file's comment explains must come last.

- [ ] **Step 6: Add the pull wiring**

Three edits in `app/services/pipelines/pull.py`:

1. `MODEL_MAP` — add `"Comic": Comic,` after the `"Novel"` line.
2. `PARSER_MAP` — add `"Comic": parse_comic_from_sheet,` after the `"Novel"` line.
3. The tab order list (around line 745-760) — add `"Comic",` after `"Novel"`, still ahead of `"Watch Order List"`.

Then add the hierarchy branch after the Novel branch (around line 230):

```python
        # Comic uses resolve_comic_parent_hierarchy (auto-creates franchise with type "Comic", looks up series)
        elif tab_name == "Comic" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("comic_name_en"),
                "cn": clean_header_dict.get("comic_name_cn"),
                "alt": clean_header_dict.get("comic_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_comic_parent_hierarchy(db, fid, sid, name_fields)
            )
```

Add `Comic`, `parse_comic_from_sheet` and `resolve_comic_parent_hierarchy` to that module's imports.

- [ ] **Step 7: Add the single-tab pull endpoint**

Every media type has a `/pull/<type>` endpoint that restores just its tab. In `app/routers/data_control.py`, add this after `trigger_pull_novel` (around line 563), matching that handler exactly — note it is a plain `def`, not `async def`, like its neighbors:

```python
@router.post("/pull/comic")
def trigger_pull_comic(db: Session = Depends(get_db)):
    """Pulls the Comic tab from Google Sheets into PostgreSQL."""
    try:
        result = execute_pull_sheet_data(
            db, "Comic", action_type="Manual", log_action=True
        )
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in pull comic: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

Confirm the pull function's name in that file before pasting — the novel handler above it is the reference. The tab name string `"Comic"` must match the `MODEL_MAP`/`PARSER_MAP` keys added in Step 6 and the tab written in Step 5.

- [ ] **Step 8: Run the whole backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures.

- [ ] **Step 9: Commit**

```bash
git add app/utils/formatter.py app/services/pipelines/backup.py app/services/pipelines/pull.py app/routers/data_control.py tests/unit/test_formatter_comic.py
git commit -m "feat(comic): back up and pull comics through Google Sheets"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/database-schema.md`
- Modify: `docs/api.md`
- Modify: `docs/options.md`
- Modify: `docs/business-logic.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–7. No code changes.

- [ ] **Step 1: Document the table**

In `docs/database-schema.md`, add a `comic` section following the format of the existing `novel` section — every column with type, nullability and notes. Call out the two things a reader would otherwise get wrong: the EN-first `display_name` fallback, and that `read_next`/`to_reread` have no UI yet.

- [ ] **Step 2: Document the endpoints**

In `docs/api.md`, add the comic router section mirroring the novel one: `GET/POST /api/comic/`, `GET/PUT/DELETE /api/comic/{system_id}`, the list filters (`franchise_id`, `series_id`, `reading_status`, `serialization_status`, `to_reread`, `search_query`), and the three data-control endpoints: `POST /api/data-control/fill/comic`, `POST /api/data-control/replace/comic/{comic_id}` and `POST /api/data-control/pull/comic`. Note explicitly that comic has no bulk `/replace/comic`, and why.

- [ ] **Step 3: Document the options**

In `docs/options.md`, add the seven new `system_options` categories to the System Options Categories table: `Comic Publisher`, `Comic Imprint`, `Comic Continuity`, `Comic Era`, `Comic Event`, `Comic Writer`, `Comic Artist`. Add a `Comic Type` section listing Ongoing / Limited / One-Shot / Annual. Note that comic reuses the existing Reading Status and Serialization Status lists.

- [ ] **Step 4: Document the pipeline behavior**

In `docs/business-logic.md`, record that comic's Fill runs options extraction only and makes no external call, that its Replace write hook fetches nothing, and that `mark_comic_completed` sets `完結` and snaps `issue_fin`/`issue_total` to the higher of the two.

- [ ] **Step 5: Commit**

```bash
git add docs/database-schema.md docs/api.md docs/options.md docs/business-logic.md
git commit -m "docs: describe the comic entry type, endpoints and options"
```

---

## What This Plan Does Not Cover

The frontend is a separate plan, written after this one lands: config registration (`mediaRegistry.js`, `mediaTypeColors.js`, `namingConfigs.js`, `adminTabs.js`, `formFactories.js`, `fieldMeta.js`, `lib/status.js`), the new pages (`Comic.jsx`, `ComicNotes.jsx`, `LibraryComic.jsx`, `ComicAddTab.jsx`, `ComicModifyTab.jsx`), `getComicProgress` in `lib/formatters.js`, and the comic branches in `App.jsx`, `Nav.jsx`, `Add.jsx`, `Modify.jsx`, `Delete.jsx`, `Admin.jsx`, `MediaCard.jsx`, `GroupedEntryPage.jsx`, `MemeOwnerPicker.jsx`, `QuoteEntryPicker.jsx` and the three tier pages.

Also deferred by the spec, and not in either plan: statistics, Plan to Read / Read Next, the review queue, find-duplicates, the with-remarks check, public Completions, the Index dashboard, and any external metadata API.
