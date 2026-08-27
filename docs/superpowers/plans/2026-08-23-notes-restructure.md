# Notes Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move notes out of the per-entry `notes` JSONB blob into one polymorphic `note` table driven by a backend-owned section registry, and extend notes to collections, franchises, and series.

**Architecture:** One row per note item in a `note` table keyed by `(owner_type, owner_id, section)`, following the FK-less polymorphic owner pattern already established by `app/models/meme.py`. A Python registry declares every section's shape, label, applicable owners, ordering, and dropdown values; the schema layer validates against it and the frontend renders generically from it. The seven frontend config files are deleted.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL (JSONB), Alembic, Pydantic v2, pytest, React + Vite, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-08-23-notes-restructure-design.md`

## Global Constraints

- The registry lives in **`app/utils/note_sections.py`**, not `app/utils/constants.py`. This is a deliberate deviation from the spec: `constants.py` currently holds three small enums, and a 23-entry registry with a dataclass would dominate it. Everything else in the spec is unchanged.
- Owner types are exactly the ten keys of `OWNER_TABLES` in `app/utils/media_resolver.py`: `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `series`, `franchise`, `collection`. Note the **hyphenated** spelling of the two-word keys — it matches app/services/domain/watch_order.py's MEDIA_TYPE_MODELS, and differs from MEDIA_REGISTRY's underscore keys, which name router configs rather than column data.
- The `remark` **Text column** on every table is untouched everywhere in this plan. It is a different field from the `remark` notes section.
- Alembic head at plan time is revision `wo_series_owner`. Task 2's revision chains from it; Task 6's chains from Task 2's; Task 9's chains from Task 6's.
- Declaration order of columns in `app/models/note.py` is also the Google Sheets column order — `format_model_for_sheet` walks `__table__.columns` in declaration order. Do not reorder columns after Task 5.
- Labels use the ASCII solidus `/`, never the fullwidth `／`.
- Tests run with the project venv: `venv/Scripts/python.exe -m pytest`. API tests need PostgreSQL running and the `anime_site_test` database (see `tests/api/conftest.py`).
- Per `CLAUDE.md`, other sessions may be editing the same files. Stage only the specific files each task names. Never use `git add -A`.

---

### Task 1: Section registry

**Files:**
- Create: `app/utils/note_sections.py`
- Test: `tests/unit/test_note_sections.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NoteSection` frozen dataclass with fields `key: str`, `shape: str`, `label: str`, `owners: tuple[str, ...]`, `labels: dict[str, str]`, `kinds: tuple[str, ...]`, `episode_placeholder: str | None`, `singleton: bool`, `desc_required: tuple[str, ...]`
  - `NOTE_SECTIONS: tuple[NoteSection, ...]` — ordered; list position is display order
  - `SHAPE_TEXT`, `SHAPE_TEXT_LINKS`, `SHAPE_EPISODE_TEXT`, `SHAPE_NAME_LINKS`, `SHAPE_EXTERNAL` string constants
  - `section_by_key(key: str) -> NoteSection | None`
  - `sections_for(owner_type: str) -> list[NoteSection]`
  - `label_for(section: NoteSection, owner_type: str) -> str`
  - `STORED_SHAPES: frozenset[str]` — the four shapes that produce `note` rows (excludes `SHAPE_EXTERNAL`)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_note_sections.py`:

```python
"""Unit tests for the notes section registry."""

import pytest

from app.utils.media_resolver import OWNER_TABLES
from app.utils import note_sections as ns


def test_every_section_has_a_known_shape():
    valid = {
        ns.SHAPE_TEXT,
        ns.SHAPE_TEXT_LINKS,
        ns.SHAPE_EPISODE_TEXT,
        ns.SHAPE_NAME_LINKS,
        ns.SHAPE_EXTERNAL,
    }
    for sec in ns.NOTE_SECTIONS:
        assert sec.shape in valid, f"{sec.key} has unknown shape {sec.shape}"


def test_section_keys_are_unique():
    keys = [s.key for s in ns.NOTE_SECTIONS]
    assert len(keys) == len(set(keys))


def test_every_owner_is_a_real_owner_table():
    for sec in ns.NOTE_SECTIONS:
        for owner in sec.owners:
            assert owner in OWNER_TABLES, f"{sec.key} names unknown owner {owner}"


def test_only_remark_is_singleton():
    singletons = [s.key for s in ns.NOTE_SECTIONS if s.singleton]
    assert singletons == ["remark"]


def test_only_declared_sections_have_kinds():
    with_kinds = [s.key for s in ns.NOTE_SECTIONS if s.kinds]
    assert with_kinds == ["highlights", "op_ed_changes"]


def test_op_ed_kinds_exclude_retired_values():
    sec = ns.section_by_key("op_ed_changes")
    assert "回顧" not in sec.kinds
    assert "其他" not in sec.kinds
    assert "加長" not in sec.kinds
    assert "特別OP" not in sec.kinds  # normalized to 特殊OP


def test_retired_sections_are_gone():
    assert ns.section_by_key("special_changes") is None
    assert ns.section_by_key("special_episodes") is None


def test_anime_sections_in_registry_order():
    keys = [s.key for s in ns.sections_for("anime")]
    assert keys == [
        "remark",
        "advantages",
        "disadvantages",
        "double_edged",
        "public_reviews",
        "personal_reviews",
        "episode_comments",
        "highlights",
        "analysis",
        "cinematography",
        "foreshadowing",
        "symmetry",
        "op_ed_changes",
        "extended_episodes",
        "adaptation",
        "resources",
        "unread",
        "questions",
        "quotes",
        "memes",
    ]


def test_collection_gets_the_narrow_set():
    keys = [s.key for s in ns.sections_for("collection")]
    # Registry order, not the order the spec's prose happens to list them in:
    # `questions` sits after `unread` in NOTE_SECTIONS.
    assert keys == [
        "remark",
        "public_reviews",
        "personal_reviews",
        "analysis",
        "resources",
        "unread",
        "questions",
        "memes",
    ]


def test_franchise_is_series_minus_cinematography():
    series = {s.key for s in ns.sections_for("series")}
    franchise = {s.key for s in ns.sections_for("franchise")}
    assert series - franchise == {"cinematography"}


def test_episode_sections_never_reach_the_tiers():
    episode_keys = {
        s.key for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_EPISODE_TEXT
    }
    for tier in ("series", "franchise", "collection"):
        assert not episode_keys & {s.key for s in ns.sections_for(tier)}


def test_quotes_stay_entry_only():
    assert ns.section_by_key("quotes").owners == ns.ENTRY_OWNERS


def test_memes_span_every_owner():
    assert set(ns.section_by_key("memes").owners) == set(OWNER_TABLES)


def test_label_for_falls_back_to_default():
    sec = ns.section_by_key("highlight_episodes")
    assert ns.label_for(sec, "manga") == "神回"
    assert ns.label_for(sec, "tv-show") == "神回/神片段"


def test_desc_required_is_per_owner():
    sec = ns.section_by_key("adaptation")
    assert "anime" in sec.desc_required
    assert "tv-show" not in sec.desc_required


def test_labels_use_ascii_solidus():
    for sec in ns.NOTE_SECTIONS:
        assert "／" not in sec.label
        for value in sec.labels.values():
            assert "／" not in value
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_sections.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.note_sections'`

- [ ] **Step 3: Write the registry**

Create `app/utils/note_sections.py`:

```python
"""
The notes section registry - the single authority on what a note may be.

Notes used to be a JSONB blob whose shape lived in seven frontend config files.
The backend could not validate or query it, and the same section drifted
between media types. This module replaces those files: each entry declares one
section's shape, label, applicable owner types, ordering and dropdown values,
and both the API schema layer and the frontend read it from here.

Adding a section is one entry and no migration. Adding a new *shape* is rare
and costs one nullable column on `note`.

Sections that look similar across media types are deliberately kept distinct
(`highlights` vs `highlight_episodes` vs `highlight_passages`, `cinematography`
vs `craft`): the drift is intentional, not accidental.
"""

from dataclasses import dataclass, field

from app.utils.media_resolver import OWNER_TYPE_KEYS

# --- Shapes ---------------------------------------------------------------
# Each shape names which of `note`'s content columns a section uses. Columns a
# shape does not name stay null.
SHAPE_TEXT = "text"  # content
SHAPE_TEXT_LINKS = "text_links"  # content, links, optional episode
SHAPE_EPISODE_TEXT = "episode_text"  # episode, content, kind where declared
SHAPE_NAME_LINKS = "name_links"  # title, links
# Backed by its own table (quote, meme), never by a `note` row.
SHAPE_EXTERNAL = "external"

STORED_SHAPES = frozenset(
    {SHAPE_TEXT, SHAPE_TEXT_LINKS, SHAPE_EPISODE_TEXT, SHAPE_NAME_LINKS}
)

# --- Owner groups ---------------------------------------------------------
ENTRY_OWNERS = (
    "anime",
    "anime-movie",
    "movie",
    "tv-show",
    "cartoon",
    "manga",
    "novel",
)
TIER_OWNERS = ("series", "franchise", "collection")
ALL_OWNERS = tuple(OWNER_TYPE_KEYS)

# Sections every owner shares, spelled out per section below rather than
# composed, so one section's applicability is readable in one place.
_SERIES_AND_UP = ("series", "franchise")


@dataclass(frozen=True)
class NoteSection:
    """One section of the notes page."""

    key: str
    shape: str
    label: str
    owners: tuple[str, ...]
    # Per-owner label overrides; `label` is the fallback.
    labels: dict[str, str] = field(default_factory=dict)
    # Allowed values for note.kind. Empty means the section has no dropdown.
    kinds: tuple[str, ...] = ()
    episode_placeholder: str | None = None
    # At most one row per owner.
    singleton: bool = False
    # Owner types where `content` may not be empty.
    desc_required: tuple[str, ...] = ()


OP_ED_KINDS = ("變化OP", "變化ED", "無OP", "無ED", "特殊OP", "特殊ED")

# Order here is display order.
NOTE_SECTIONS: tuple[NoteSection, ...] = (
    NoteSection(
        key="remark",
        shape=SHAPE_TEXT,
        label="備註 Remark",
        owners=ALL_OWNERS,
        singleton=True,
    ),
    NoteSection(
        key="advantages",
        shape=SHAPE_TEXT,
        label="優點 Advantages",
        owners=ENTRY_OWNERS + _SERIES_AND_UP,
    ),
    NoteSection(
        key="disadvantages",
        shape=SHAPE_TEXT,
        label="缺點 Disadvantages",
        owners=ENTRY_OWNERS + _SERIES_AND_UP,
    ),
    NoteSection(
        key="double_edged",
        shape=SHAPE_TEXT,
        label="優缺點",
        owners=ENTRY_OWNERS + _SERIES_AND_UP,
    ),
    NoteSection(
        key="public_reviews",
        shape=SHAPE_TEXT,
        label="大眾評價 Public Reviews",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="personal_reviews",
        shape=SHAPE_TEXT,
        label="我的評價 Personal Reviews",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="episode_comments",
        shape=SHAPE_EPISODE_TEXT,
        label="各集評論 Episode Comments",
        owners=("anime", "tv-show", "cartoon"),
        episode_placeholder="Episode, e.g. ep 1",
    ),
    NoteSection(
        key="highlights",
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段 Highlights",
        owners=("anime",),
        # The stored data distinguishes a great episode from a great arc, so the
        # section keeps a dropdown even though its siblings do not.
        kinds=("神回", "神篇章"),
        episode_placeholder="Episode(s), e.g. ep 6",
    ),
    NoteSection(
        key="highlight_episodes",
        shape=SHAPE_EPISODE_TEXT,
        label="神回/神片段",
        owners=("tv-show", "cartoon", "manga"),
        labels={"manga": "神回"},
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="highlight_passages",
        shape=SHAPE_TEXT,
        label="神片段",
        owners=("novel",),
    ),
    NoteSection(
        key="analysis",
        shape=SHAPE_TEXT_LINKS,
        label="解析 Analysis",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="cinematography",
        shape=SHAPE_TEXT_LINKS,
        label="分鏡/演出/巧思",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "manga", "series"),
    ),
    NoteSection(
        key="craft",
        shape=SHAPE_TEXT_LINKS,
        label="巧思",
        owners=("novel",),
    ),
    NoteSection(
        key="foreshadowing",
        shape=SHAPE_TEXT_LINKS,
        label="Foreshadowing",
        owners=(
            "anime",
            "anime-movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        )
        + _SERIES_AND_UP,
    ),
    NoteSection(
        key="symmetry",
        shape=SHAPE_TEXT_LINKS,
        label="對稱 Symmetry",
        owners=(
            "anime",
            "anime-movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        )
        + _SERIES_AND_UP,
    ),
    NoteSection(
        key="op_ed_changes",
        shape=SHAPE_EPISODE_TEXT,
        label="OP/ED 變動",
        owners=("anime", "tv-show", "cartoon"),
        kinds=OP_ED_KINDS,
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="extended_episodes",
        shape=SHAPE_EPISODE_TEXT,
        label="加長",
        owners=("anime", "tv-show", "cartoon"),
        episode_placeholder="Episode(s), e.g. ep 3",
    ),
    NoteSection(
        key="adaptation",
        shape=SHAPE_TEXT_LINKS,
        label="改編 Adaptation",
        owners=("anime", "anime-movie", "tv-show", "cartoon", "novel")
        + _SERIES_AND_UP,
        desc_required=("anime", "anime-movie", "novel"),
    ),
    NoteSection(
        key="resources",
        shape=SHAPE_NAME_LINKS,
        label="Resources",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="unread",
        shape=SHAPE_NAME_LINKS,
        label="Unread",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="questions",
        shape=SHAPE_TEXT,
        label="Questions",
        owners=ALL_OWNERS,
    ),
    NoteSection(
        key="quotes",
        shape=SHAPE_EXTERNAL,
        label="名言 Quotes",
        # A quote is said in a specific work, so it stays entry-only - see the
        # class docstring in app/models/quote.py.
        owners=ENTRY_OWNERS,
    ),
    NoteSection(
        key="memes",
        shape=SHAPE_EXTERNAL,
        label="梗/迷因 Memes",
        # A running gag often spans a franchise, so meme already allows all ten.
        owners=ALL_OWNERS,
    ),
)

_BY_KEY = {s.key: s for s in NOTE_SECTIONS}


def section_by_key(key: str) -> NoteSection | None:
    """The section with this key, or None if it is not a known section."""
    return _BY_KEY.get(key)


def sections_for(owner_type: str) -> list[NoteSection]:
    """Every section that applies to this owner type, in display order."""
    return [s for s in NOTE_SECTIONS if owner_type in s.owners]


def label_for(section: NoteSection, owner_type: str) -> str:
    """This section's label for this owner, falling back to the default."""
    return section.labels.get(owner_type, section.label)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_sections.py -v`
Expected: PASS, 16 tests.

If `test_anime_sections_in_registry_order` fails, the section order in `NOTE_SECTIONS` is wrong — reorder entries to match the assertion, which mirrors the current `animeNotesConfig.js` order.

- [ ] **Step 5: Commit**

```bash
git add app/utils/note_sections.py tests/unit/test_note_sections.py
git commit -m "feat(notes): add backend-owned section registry"
```

---

### Task 2: `note` model and table

**Files:**
- Create: `app/models/note.py`
- Create: `alembic/versions/note_add_table.py`
- Modify: `app/models/__init__.py`
- Test: `tests/unit/test_note_model.py`

**Interfaces:**
- Consumes: `app.utils.note_sections` (Task 1) for nothing at import time — the model does not import the registry; validation lives in the schema layer.
- Produces: `models.Note` with columns in this exact declaration order: `system_id`, `owner_type`, `owner_id`, `section`, `episode`, `kind`, `title`, `content`, `links`, `sort_index`, `created_at`, `updated_at`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_note_model.py`:

```python
"""Unit tests for the Note ORM model."""

from app import models


def test_column_order_is_the_sheet_order():
    # format_model_for_sheet walks __table__.columns in declaration order, so
    # this order is also the Google Sheets column order. Changing it silently
    # reorders the sheet.
    assert [c.name for c in models.Note.__table__.columns] == [
        "system_id",
        "owner_type",
        "owner_id",
        "section",
        "episode",
        "kind",
        "title",
        "content",
        "links",
        "sort_index",
        "created_at",
        "updated_at",
    ]


def test_owner_is_fk_less():
    # No single foreign key can span the ten owner tables.
    assert not models.Note.__table__.c.owner_id.foreign_keys


def test_lookup_index_exists():
    names = {ix.name for ix in models.Note.__table__.indexes}
    assert "ix_note_owner_section" in names
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_model.py -v`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'Note'`

- [ ] **Step 3: Write the model**

Create `app/models/note.py`:

```python
"""Note ORM model - one item of structured notes on any owner."""

import uuid
from sqlalchemy import Column, DateTime, Float, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base, get_taipei_now


class Note(Base):
    """
    One note item - one bullet, one linked resource, one episode comment.

    Replaces the `notes` JSONB column that used to sit on each of the seven
    media tables. A blob could not be validated, queried across the library, or
    edited a bullet at a time, and its shape lived in seven frontend config
    files rather than in the backend.

    `section` names an entry in app/utils/note_sections.NOTE_SECTIONS, which
    declares that section's shape - which of the content columns below it uses.
    Columns a shape does not use stay null; this is one table on purpose, so
    adding a section costs a registry entry rather than a migration.

    `owner_id` is deliberately FK-less: it points at whichever of the ten tables
    `owner_type` names, and no single foreign key can span them - the same
    reason `meme.owner_id` has none. A deleted owner leaves rows that
    `app.utils.media_resolver` flags as missing rather than silently dropping.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "note"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Linkage ---
    # The owner may be a media entry OR one of the three grouping tiers: see
    # OWNER_TABLES in app/utils/media_resolver.
    owner_type = Column(String, nullable=True, index=True)
    owner_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # --- Which section this item belongs to ---
    section = Column(String, nullable=True, index=True)

    # --- Content, per the section's shape ---
    # Free text so "ep 3", "ep 3-5" and "ch 12" all fit one column.
    episode = Column(String, nullable=True)
    # Only populated where the section declares `kinds`.
    kind = Column(String, nullable=True)
    # The name half of a name_links item.
    title = Column(String, nullable=True)
    content = Column(Text, nullable=True)
    # List of URLs. A list even where the old shape held one, so `resources`
    # gains multi-link support without another migration.
    links = Column(JSONB, nullable=True)

    # --- Ordering within (owner, section) ---
    sort_index = Column(Float, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    __table_args__ = (
        # The only read path the notes page uses.
        Index("ix_note_owner_section", "owner_type", "owner_id", "section"),
    )
```

- [ ] **Step 4: Register the model**

In `app/models/__init__.py`, add the import next to the existing `Meme` import (around line 19) and the name to `__all__` (around line 46):

```python
from app.models.note import Note
```

```python
    "Note",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_model.py -v`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write the Alembic revision**

Create `alembic/versions/note_add_table.py`:

```python
"""add note table

Revision ID: note_add_table
Revises: wo_series_owner
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'note_add_table'
down_revision: Union[str, Sequence[str], None] = 'wo_series_owner'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the note table.

    Schema only - this revision moves no data. The backfill out of the seven
    `notes` JSONB columns is a separate revision, so the table can be created
    and exercised before any existing content depends on it.

    owner_id has no foreign key on purpose: it points at whichever of the ten
    owner tables owner_type names, and no single FK can span them.

    Column order is deliberate - format_model_for_sheet walks
    __table__.columns in declaration order, so it is also the Sheets order.
    """
    op.create_table(
        "note",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("owner_type", sa.String(), nullable=True),
        sa.Column("owner_id", sa.UUID(), nullable=True),
        sa.Column("section", sa.String(), nullable=True),
        sa.Column("episode", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("links", postgresql.JSONB(), nullable=True),
        sa.Column("sort_index", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(op.f("ix_note_system_id"), "note", ["system_id"])
    op.create_index(op.f("ix_note_owner_type"), "note", ["owner_type"])
    op.create_index(op.f("ix_note_owner_id"), "note", ["owner_id"])
    op.create_index(op.f("ix_note_section"), "note", ["section"])
    op.create_index(
        "ix_note_owner_section", "note", ["owner_type", "owner_id", "section"]
    )


def downgrade() -> None:
    """Drop the note table."""
    op.drop_index("ix_note_owner_section", table_name="note")
    op.drop_index(op.f("ix_note_section"), table_name="note")
    op.drop_index(op.f("ix_note_owner_id"), table_name="note")
    op.drop_index(op.f("ix_note_owner_type"), table_name="note")
    op.drop_index(op.f("ix_note_system_id"), table_name="note")
    op.drop_table("note")
```

- [ ] **Step 7: Run the migration up and down**

```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic downgrade -1
venv/Scripts/python.exe -m alembic upgrade head
```

Expected: no errors; `note` exists after the final command. Verify with `\d note` in psql that `ix_note_owner_section` is present.

- [ ] **Step 8: Commit**

```bash
git add app/models/note.py app/models/__init__.py alembic/versions/note_add_table.py tests/unit/test_note_model.py
git commit -m "feat(notes): add note table"
```

---

### Task 3: Schemas and registry-driven validation

**Files:**
- Create: `app/schemas/note.py`
- Modify: `app/schemas/__init__.py`
- Test: `tests/unit/test_note_schemas.py`

**Interfaces:**
- Consumes: `models.Note` (Task 2), `app.utils.note_sections.{section_by_key, sections_for, label_for, STORED_SHAPES}` (Task 1).
- Produces:
  - `NoteBase`, `NoteCreate`, `NoteUpdate`, `NoteResponse` Pydantic models
  - `NoteSectionOut` — the registry entry as served to the frontend: `key`, `shape`, `label`, `kinds: list[str]`, `episode_placeholder`, `singleton`, `desc_required: bool`
  - `NoteReorder` — `{"section": str, "owner_type": str, "owner_id": UUID, "ordered_ids": list[UUID]}`
  - `validate_note_payload(payload: NoteBase) -> None` — raises `ValueError` on a registry violation. Singleton-uniqueness is NOT checked here (it needs a DB query); the router does that.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_note_schemas.py`:

```python
"""Unit tests for note schema validation against the registry."""

import uuid
import pytest

from app.schemas.note import NoteCreate, validate_note_payload


def _payload(**kw):
    base = dict(
        owner_type="anime",
        owner_id=uuid.uuid4(),
        section="advantages",
        content="敘事結構精巧",
    )
    base.update(kw)
    return NoteCreate(**base)


def test_valid_payload_passes():
    validate_note_payload(_payload())


def test_unknown_section_rejected():
    with pytest.raises(ValueError, match="Unknown note section"):
        validate_note_payload(_payload(section="not_a_section"))


def test_unknown_owner_type_rejected():
    with pytest.raises(ValueError, match="Unknown owner_type"):
        validate_note_payload(_payload(owner_type="podcast"))


def test_section_not_applicable_to_owner_rejected():
    # episode_comments is entry-only; a franchise may not have one.
    with pytest.raises(ValueError, match="does not apply"):
        validate_note_payload(
            _payload(owner_type="franchise", section="episode_comments", episode="ep 1")
        )


def test_external_section_rejected():
    # Quotes and memes live in their own tables, never in `note`.
    with pytest.raises(ValueError, match="own table"):
        validate_note_payload(_payload(section="quotes"))


def test_kind_must_be_in_the_dropdown():
    with pytest.raises(ValueError, match="not a valid kind"):
        validate_note_payload(
            _payload(section="op_ed_changes", episode="ep 3", kind="回顧")
        )


def test_kind_from_the_dropdown_accepted():
    validate_note_payload(
        _payload(section="op_ed_changes", episode="ep 3", kind="變化OP")
    )


def test_kind_rejected_where_no_dropdown_declared():
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            _payload(section="extended_episodes", episode="ep 12", kind="加長")
        )


def test_desc_required_section_rejects_empty_content():
    with pytest.raises(ValueError, match="requires content"):
        validate_note_payload(_payload(section="adaptation", content="   "))


def test_desc_required_does_not_apply_to_other_owners():
    # adaptation is desc_required on anime but not on tv_show.
    validate_note_payload(
        _payload(owner_type="tv-show", section="adaptation", content=None)
    )


def test_blank_content_rejected_for_ordinary_text_section():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(_payload(content="  "))


def test_name_links_row_may_have_title_and_no_content():
    validate_note_payload(
        _payload(section="resources", content=None, title="官方設定集",
                 links=["https://example.com/artbook"])
    )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.note'`

- [ ] **Step 3: Write the schemas**

Create `app/schemas/note.py`:

```python
"""Note request/response schemas, validated against the section registry."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.utils.media_resolver import OWNER_TABLES
from app.utils.note_sections import (
    SHAPE_EPISODE_TEXT,
    SHAPE_NAME_LINKS,
    STORED_SHAPES,
    NoteSection,
    label_for,
    section_by_key,
    sections_for,
)


class NoteBase(BaseModel):
    owner_type: Optional[str] = None
    owner_id: Optional[UUID] = None
    section: Optional[str] = None
    episode: Optional[str] = None
    kind: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    links: Optional[List[str]] = None
    sort_index: Optional[float] = None


class NoteCreate(NoteBase):
    pass


class NoteUpdate(NoteBase):
    pass


class NoteResponse(NoteBase):
    system_id: UUID
    # Nullable in the database, and a blank Google Sheets cell parses to None
    # on Pull, so one timestamp-less row must not fail the whole list endpoint.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NoteSectionOut(BaseModel):
    """One registry entry as the frontend needs it, resolved for one owner."""

    key: str
    shape: str
    label: str
    kinds: List[str] = []
    episode_placeholder: Optional[str] = None
    singleton: bool = False
    desc_required: bool = False


class NoteReorder(BaseModel):
    """New ordering for one section of one owner."""

    owner_type: str
    owner_id: UUID
    section: str
    ordered_ids: List[UUID]


def section_out(section: NoteSection, owner_type: str) -> NoteSectionOut:
    """Resolve a registry entry for one owner type."""
    return NoteSectionOut(
        key=section.key,
        shape=section.shape,
        label=label_for(section, owner_type),
        kinds=list(section.kinds),
        episode_placeholder=section.episode_placeholder,
        singleton=section.singleton,
        desc_required=owner_type in section.desc_required,
    )


def sections_out(owner_type: str) -> List[NoteSectionOut]:
    """The whole registry for one owner type, in display order."""
    return [section_out(s, owner_type) for s in sections_for(owner_type)]


def validate_note_payload(payload: NoteBase) -> None:
    """
    Check one note against the registry.

    Raises ValueError, which the router turns into a 422. Singleton uniqueness
    is not checked here - it needs a database query, so the router owns it.
    """
    owner_type = payload.owner_type
    if owner_type not in OWNER_TABLES:
        raise ValueError(f"Unknown owner_type '{owner_type}'.")

    section = section_by_key(payload.section or "")
    if section is None:
        raise ValueError(f"Unknown note section '{payload.section}'.")

    if section.shape not in STORED_SHAPES:
        raise ValueError(
            f"Section '{section.key}' has its own table and is not stored as a note."
        )

    if owner_type not in section.owners:
        raise ValueError(
            f"Section '{section.key}' does not apply to owner type '{owner_type}'."
        )

    if payload.kind:
        if not section.kinds:
            raise ValueError(f"Section '{section.key}' takes no kind.")
        if payload.kind not in section.kinds:
            raise ValueError(
                f"'{payload.kind}' is not a valid kind for section '{section.key}'."
            )

    content = (payload.content or "").strip()
    if owner_type in section.desc_required and not content:
        raise ValueError(f"Section '{section.key}' requires content.")

    # A row with nothing in it is never worth storing. What counts as "nothing"
    # depends on the shape: a name_links row may carry only a title and a link,
    # and an episode_text row may carry only an episode.
    if section.shape == SHAPE_NAME_LINKS:
        if not content and not (payload.title or "").strip() and not payload.links:
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif section.shape == SHAPE_EPISODE_TEXT:
        if not content and not (payload.episode or "").strip():
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif not content and not payload.links:
        raise ValueError(f"Section '{section.key}' note is empty.")
```

- [ ] **Step 4: Export the schemas**

In `app/schemas/__init__.py`, add alongside the existing meme exports:

```python
from app.schemas.note import (
    NoteBase,
    NoteCreate,
    NoteUpdate,
    NoteResponse,
    NoteReorder,
    NoteSectionOut,
)
```

Match the file's existing export style — if it uses an `__all__` list, add these names to it too.

- [ ] **Step 5: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_schemas.py -v`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add app/schemas/note.py app/schemas/__init__.py tests/unit/test_note_schemas.py
git commit -m "feat(notes): add note schemas with registry-driven validation"
```

---

### Task 4: Note router

**Files:**
- Create: `app/routers/note.py`
- Modify: `app/main.py` (import near line 37, `include_router` near line 151)
- Test: `tests/api/test_note.py`

**Interfaces:**
- Consumes: `models.Note` (Task 2); `schemas.NoteCreate`, `NoteUpdate`, `NoteResponse`, `NoteReorder`, `NoteSectionOut` and `app.schemas.note.{validate_note_payload, sections_out}` (Task 3).
- Produces: router at prefix `/api/notes`, mounted in `app/main.py`.

| method | path | auth |
|---|---|---|
| GET | `/api/notes/sections` | guest |
| GET | `/api/notes` | guest |
| POST | `/api/notes` | admin |
| PATCH | `/api/notes/reorder` | admin |
| PATCH | `/api/notes/{note_id}` | admin |
| DELETE | `/api/notes/{note_id}` | admin |

Route order matters: `/reorder` must be declared **before** `/{note_id}`, or FastAPI matches `reorder` as a note id.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_note.py`:

```python
"""
API integration tests for /api/notes endpoints.

Notes are per-item rows on any of the ten owner types, shaped by the section
registry in app/utils/note_sections.py.
Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def anime_note(db_session, sample_anime):
    n = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="advantages",
        content="敘事結構精巧",
        sort_index=0.0,
    )
    db_session.add(n)
    db_session.flush()
    return n


# --- Sections endpoint ----------------------------------------------------


def test_sections_for_anime(client):
    r = client.get("/api/notes/sections", params={"owner_type": "anime"})
    assert r.status_code == 200
    keys = [s["key"] for s in r.json()]
    assert keys[0] == "remark"
    assert "op_ed_changes" in keys
    assert "special_changes" not in keys


def test_sections_for_collection_is_narrower(client):
    r = client.get("/api/notes/sections", params={"owner_type": "collection"})
    keys = [s["key"] for s in r.json()]
    assert "episode_comments" not in keys
    assert "remark" in keys


def test_sections_rejects_unknown_owner_type(client):
    r = client.get("/api/notes/sections", params={"owner_type": "podcast"})
    assert r.status_code == 400


def test_sections_carry_kinds_and_placeholders(client):
    r = client.get("/api/notes/sections", params={"owner_type": "anime"})
    by_key = {s["key"]: s for s in r.json()}
    assert by_key["op_ed_changes"]["kinds"] == [
        "變化OP", "變化ED", "無OP", "無ED", "特殊OP", "特殊ED",
    ]
    assert by_key["extended_episodes"]["kinds"] == []
    assert by_key["remark"]["singleton"] is True
    assert by_key["adaptation"]["desc_required"] is True


# --- List -----------------------------------------------------------------


def test_list_notes_for_owner(client, sample_anime, anime_note):
    r = client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["content"] == "敘事結構精巧"


def test_list_is_registry_ordered(client, db_session, sample_anime):
    # questions sorts after advantages in the registry, so insert it first.
    for section, content in (("questions", "為什麼"), ("advantages", "好看")):
        db_session.add(
            models.Note(
                system_id=uuid.uuid4(),
                owner_type="anime",
                owner_id=sample_anime.system_id,
                section=section,
                content=content,
                sort_index=0.0,
            )
        )
    db_session.flush()
    r = client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert [n["section"] for n in r.json()] == ["advantages", "questions"]


# --- Create ---------------------------------------------------------------


def test_create_requires_admin(client, sample_anime):
    r = client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "配樂與畫面高度契合",
        },
    )
    assert r.status_code == 401


def test_admin_creates_note(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "配樂與畫面高度契合",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["content"] == "配樂與畫面高度契合"


def test_create_rejects_section_not_applicable(admin_client, sample_franchise):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "franchise",
            "owner_id": str(sample_franchise.system_id),
            "section": "episode_comments",
            "episode": "ep 1",
            "content": "x",
        },
    )
    assert r.status_code == 422
    assert "does not apply" in r.text


def test_create_rejects_bad_kind(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "op_ed_changes",
            "episode": "ep 3",
            "kind": "回顧",
            "content": "x",
        },
    )
    assert r.status_code == 422


def test_create_rejects_external_section(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "quotes",
            "content": "x",
        },
    )
    assert r.status_code == 422


def test_singleton_section_rejects_a_second_row(admin_client, sample_anime):
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "section": "remark",
        "content": "重看第三次",
    }
    assert admin_client.post("/api/notes", json=body).status_code == 201
    r = admin_client.post("/api/notes", json=body)
    assert r.status_code == 422
    assert "already has" in r.text


def test_create_assigns_next_sort_index(admin_client, sample_anime, anime_note):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "配樂與畫面高度契合",
        },
    )
    assert r.json()["sort_index"] == 1.0


# --- Update and delete ----------------------------------------------------


def test_admin_updates_one_row(admin_client, anime_note):
    r = admin_client.patch(
        f"/api/notes/{anime_note.system_id}", json={"content": "改過的內容"}
    )
    assert r.status_code == 200
    assert r.json()["content"] == "改過的內容"


def test_update_revalidates_against_registry(admin_client, anime_note):
    r = admin_client.patch(
        f"/api/notes/{anime_note.system_id}", json={"section": "episode_comments"}
    )
    # advantages -> episode_comments with no episode and no kind is still valid
    # for an anime, so this must succeed; the guard is on unknown sections.
    assert r.status_code == 200
    r = admin_client.patch(
        f"/api/notes/{anime_note.system_id}", json={"section": "nope"}
    )
    assert r.status_code == 422


def test_update_404s_on_missing_note(admin_client):
    r = admin_client.patch(f"/api/notes/{uuid.uuid4()}", json={"content": "x"})
    assert r.status_code == 404


def test_admin_deletes_one_row(admin_client, anime_note):
    r = admin_client.delete(f"/api/notes/{anime_note.system_id}")
    assert r.status_code == 204
    r = admin_client.delete(f"/api/notes/{anime_note.system_id}")
    assert r.status_code == 404


def test_delete_requires_admin(client, anime_note):
    assert client.delete(f"/api/notes/{anime_note.system_id}").status_code == 401


# --- Reorder --------------------------------------------------------------


def test_reorder_rewrites_sort_index(admin_client, db_session, sample_anime):
    ids = []
    for i, text in enumerate(("第一", "第二", "第三")):
        n = models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="advantages",
            content=text,
            sort_index=float(i),
        )
        db_session.add(n)
        ids.append(str(n.system_id))
    db_session.flush()

    r = admin_client.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "ordered_ids": [ids[2], ids[0], ids[1]],
        },
    )
    assert r.status_code == 200
    got = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    ).json()
    assert [n["content"] for n in got] == ["第三", "第一", "第二"]


def test_reorder_rejects_ids_from_another_section(admin_client, sample_anime, anime_note):
    r = admin_client.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "questions",
            "ordered_ids": [str(anime_note.system_id)],
        },
    )
    assert r.status_code == 400
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_note.py -v`
Expected: FAIL — every test 404s, because the router is not mounted.

- [ ] **Step 3: Write the router**

Create `app/routers/note.py`:

```python
"""
routers/note.py
Handles all operations for Notes - the structured commentary attached to a
media entry or to a collection, franchise or series.

A note references its owner with an (owner_type, owner_id) pair rather than a
foreign key, because no single FK spans the ten owner tables; resolution goes
through OWNER_TABLES rather than the entry-only MEDIA_TABLES.

Every write is validated against app/utils/note_sections.NOTE_SECTIONS, which
is the authority on what a section is. That is the point of the table: the
shape used to live in seven frontend config files, where nothing could enforce
it.
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_db, get_current_admin
from app.schemas.note import sections_out, validate_note_payload
from app.utils.media_resolver import OWNER_TABLES
from app.utils.note_sections import NOTE_SECTIONS, section_by_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notes", tags=["Note Management"])

# Registry position, used to sort a listing the way the page renders it.
_SECTION_ORDER = {s.key: i for i, s in enumerate(NOTE_SECTIONS)}


# ==========================================
# HELPERS
# ==========================================


def _validate_owner_type(owner_type: Optional[str]) -> None:
    """Ten valid owners: the seven media entries plus the three grouping tiers."""
    if owner_type and owner_type not in OWNER_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown owner_type '{owner_type}'."
        )


def _get_or_404(db: Session, note_id: str) -> models.Note:
    db_note = db.query(models.Note).filter(models.Note.system_id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found.")
    return db_note


def _validate_or_422(payload: schemas.NoteBase) -> None:
    try:
        validate_note_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _reject_second_singleton(
    db: Session, payload: schemas.NoteBase, exclude_id: Optional[str] = None
) -> None:
    """
    A singleton section holds at most one row per owner.

    Enforced here rather than in the schema layer because it needs a query.
    """
    section = section_by_key(payload.section or "")
    if not section or not section.singleton:
        return
    query = db.query(models.Note).filter(
        models.Note.owner_type == payload.owner_type,
        models.Note.owner_id == payload.owner_id,
        models.Note.section == section.key,
    )
    if exclude_id:
        query = query.filter(models.Note.system_id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=422,
            detail=f"This owner already has a '{section.key}' note.",
        )


def _next_sort_index(db: Session, payload: schemas.NoteBase) -> float:
    """Append to the end of its section."""
    last = (
        db.query(models.Note.sort_index)
        .filter(
            models.Note.owner_type == payload.owner_type,
            models.Note.owner_id == payload.owner_id,
            models.Note.section == payload.section,
        )
        .order_by(models.Note.sort_index.desc())
        .first()
    )
    if not last or last[0] is None:
        return 0.0
    return float(last[0]) + 1.0


def _ordered(notes: List[models.Note]) -> List[models.Note]:
    """Registry order first, then sort_index within a section."""
    return sorted(
        notes,
        key=lambda n: (
            _SECTION_ORDER.get(n.section, len(_SECTION_ORDER)),
            n.sort_index if n.sort_index is not None else 0.0,
        ),
    )


# ==========================================
# PUBLIC READS
# ==========================================


@router.get("/sections", response_model=List[schemas.NoteSectionOut])
def get_sections(owner_type: str = Query(...)):
    """The section registry, resolved for one owner type, in display order."""
    _validate_owner_type(owner_type)
    return sections_out(owner_type)


@router.get("", response_model=List[schemas.NoteResponse])
def list_notes(
    owner_type: str = Query(...),
    owner_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
):
    """Every note for one owner, ordered the way the page renders them."""
    _validate_owner_type(owner_type)
    notes = (
        db.query(models.Note)
        .filter(models.Note.owner_type == owner_type, models.Note.owner_id == owner_id)
        .all()
    )
    return _ordered(notes)


# ==========================================
# ADMIN CRUD
# ==========================================


@router.post("", response_model=schemas.NoteResponse, status_code=201)
def create_note(
    payload: schemas.NoteCreate,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    _validate_or_422(payload)
    _reject_second_singleton(db, payload)

    data = payload.model_dump(exclude_unset=True)
    if data.get("sort_index") is None:
        data["sort_index"] = _next_sort_index(db, payload)

    db_note = models.Note(system_id=uuid.uuid4(), **data)
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


@router.patch("/reorder")
def reorder_notes(
    payload: schemas.NoteReorder,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Rewrite sort_index for one section of one owner, in the order given."""
    _validate_owner_type(payload.owner_type)
    if section_by_key(payload.section) is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown note section '{payload.section}'."
        )

    rows = (
        db.query(models.Note)
        .filter(
            models.Note.owner_type == payload.owner_type,
            models.Note.owner_id == payload.owner_id,
            models.Note.section == payload.section,
        )
        .all()
    )
    by_id = {r.system_id: r for r in rows}
    if set(payload.ordered_ids) != set(by_id):
        raise HTTPException(
            status_code=400,
            detail="ordered_ids must name exactly the notes in this section.",
        )

    for position, note_id in enumerate(payload.ordered_ids):
        by_id[note_id].sort_index = float(position)
    db.commit()
    return {"status": "success", "reordered": len(payload.ordered_ids)}


@router.patch("/{note_id}", response_model=schemas.NoteResponse)
def update_note(
    note_id: str,
    payload: schemas.NoteUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    db_note = _get_or_404(db, note_id)

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(db_note, key, value)

    # Validate the row as it will be, not just the fields that changed - a
    # partial update can still land on an invalid combination.
    merged = schemas.NoteUpdate(
        owner_type=db_note.owner_type,
        owner_id=db_note.owner_id,
        section=db_note.section,
        episode=db_note.episode,
        kind=db_note.kind,
        title=db_note.title,
        content=db_note.content,
        links=db_note.links,
        sort_index=db_note.sort_index,
    )
    try:
        validate_note_payload(merged)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    _reject_second_singleton(db, merged, exclude_id=note_id)

    db_note.updated_at = get_taipei_now()
    db.commit()
    db.refresh(db_note)
    return db_note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    db_note = _get_or_404(db, note_id)
    db.delete(db_note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Mount the router**

In `app/main.py`, add `note` to the router import block near line 37 (alphabetically after `movie`), and add near line 151:

```python
app.include_router(note.router)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_note.py -v`
Expected: PASS, 20 tests.

If `test_reorder_rewrites_sort_index` 404s, the `/reorder` route is declared after `/{note_id}` — move it above.

- [ ] **Step 6: Commit**

```bash
git add app/routers/note.py app/main.py tests/api/test_note.py
git commit -m "feat(notes): add note CRUD and sections endpoints"
```

---

### Task 5: Google Sheets round-trip

**Files:**
- Modify: `app/utils/formatter.py` (add `parse_note_from_sheet` after `parse_meme_from_sheet`, around line 714)
- Modify: `app/services/pipelines/backup.py` (after the Meme block, around line 225)
- Modify: `app/services/pipelines/pull.py` (`MODEL_MAP` ~line 129, `PARSER_MAP` ~line 148, tab dispatch ~line 394, tab list ~line 663)
- Modify: `app/utils/data_control_utils.py` (~line 144)
- Test: `tests/unit/test_formatter_note.py`

**Interfaces:**
- Consumes: `models.Note` (Task 2).
- Produces: `parse_note_from_sheet(raw: dict) -> dict`; a `"Note"` tab in backup and pull.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_formatter_note.py`:

```python
"""Unit tests for the Note sheet parser."""

import uuid

from app.utils.formatter import parse_note_from_sheet


def test_parses_a_full_row():
    owner_id = uuid.uuid4()
    parsed = parse_note_from_sheet(
        {
            "system_id": str(uuid.uuid4()),
            "owner_type": "anime",
            "owner_id": str(owner_id),
            "section": "op_ed_changes",
            "episode": "ep 10",
            "kind": "變化OP",
            "title": "",
            "content": "這集OP換成劇中曲",
            "links": '["https://example.com/a"]',
            "sort_index": "0",
            "created_at": "",
            "updated_at": "",
        }
    )
    assert parsed["owner_id"] == owner_id
    assert parsed["section"] == "op_ed_changes"
    assert parsed["kind"] == "變化OP"
    assert parsed["links"] == ["https://example.com/a"]
    assert parsed["sort_index"] == 0.0
    assert parsed["created_at"] is None


def test_unparseable_owner_id_becomes_none():
    # owner_id is FK-less with no name-resolution step in Pull, so a junk cell
    # must not fail the import - the note shows up unlinked instead.
    parsed = parse_note_from_sheet({"owner_id": "not-a-uuid", "section": "advantages"})
    assert parsed["owner_id"] is None


def test_blank_links_cell_becomes_none():
    parsed = parse_note_from_sheet({"section": "advantages", "links": ""})
    assert parsed["links"] is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_note.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_note_from_sheet'`

- [ ] **Step 3: Write the parser**

In `app/utils/formatter.py`, directly after `parse_meme_from_sheet`:

```python
def parse_note_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Note sheet into typed data ready for the
    Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "owner_type": parse_from_sheet(raw.get("owner_type"), str),
        # owner_id has no foreign key - it points at whichever of the ten owner
        # tables owner_type names - and there is no name-resolution step for it
        # in Pull, so an unparseable cell becomes None and the note shows up
        # unlinked rather than failing the import.
        "owner_id": _uuid_or_none(raw.get("owner_id")),
        "section": parse_from_sheet(raw.get("section"), str),
        "episode": parse_from_sheet(raw.get("episode"), str),
        "kind": parse_from_sheet(raw.get("kind"), str),
        "title": parse_from_sheet(raw.get("title"), str),
        "content": parse_from_sheet(raw.get("content"), str),
        "links": parse_from_sheet(raw.get("links"), list),
        "sort_index": parse_from_sheet(raw.get("sort_index"), float),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
```

Check how `parse_from_sheet` handles a `list` target. If it has no `list` branch, mirror whatever the existing JSONB columns use (`notes` was parsed with `json.loads` directly — see `business-logic.md:1529`) and use:

```python
        "links": json.loads(raw["links"]) if raw.get("links") else None,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_formatter_note.py -v`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire backup**

In `app/services/pipelines/backup.py`, import `Note` alongside `Meme`, and add after the Meme block:

```python
        # Notes point at owners the same FK-less way memes do, so they carry no
        # ordering constraint of their own.
        notes = db.query(Note).all()
        note_headers = [c.name for c in Note.__table__.columns]
        note_matrix = [note_headers] + [format_model_for_sheet(n) for n in notes]
        bulk_overwrite_sheet("Note", note_matrix)
```

- [ ] **Step 6: Wire pull**

In `app/services/pipelines/pull.py`:

1. Import `Note` and `parse_note_from_sheet`.
2. `MODEL_MAP`: add `"Note": Note,` after `"Meme": Meme,`.
3. `PARSER_MAP`: add `"Note": parse_note_from_sheet,` after the Meme entry.
4. Tab dispatch (the `elif tab_name == "Meme":` chain around line 394) — add:

```python
            elif tab_name == "Note":
                # An id-less row is matched on owner + section + content, so
                # re-importing the same sheet updates rather than duplicating.
                # Notes have no name of their own to match on.
                n_owner_type = clean_header_dict.get("owner_type")
                n_owner_id = clean_header_dict.get("owner_id")
                n_section = clean_header_dict.get("section")
                n_content = clean_header_dict.get("content")
                if n_owner_type and n_owner_id and n_section:
                    existing = (
                        db.query(Note)
                        .filter(
                            Note.owner_type == n_owner_type,
                            Note.owner_id == n_owner_id,
                            Note.section == n_section,
                            Note.content == n_content,
                        )
                        .first()
                    )
```

Match the surrounding branches' variable names and control flow exactly — read the Meme branch in full before writing this one.

5. Tab list (around line 663): add `"Note",` after `"Meme",`, with a comment noting notes restore after the media tabs their owners live in.

- [ ] **Step 7: Wire the deleted-record log**

In `app/utils/data_control_utils.py` around line 144, add a branch alongside `"Meme"`:

```python
        elif entry_type == "Note":
            # A note has no name of its own, so its content stands in for one.
            name = (record.content or record.title or record.section or "")[:80]
```

Match the surrounding branch's exact shape — read it before writing.

- [ ] **Step 8: Verify the whole suite still passes**

Run: `venv/Scripts/python.exe -m pytest tests/ -v`
Expected: PASS. No existing test should change behavior; this task only adds a tab.

- [ ] **Step 9: Commit**

```bash
git add app/utils/formatter.py app/services/pipelines/backup.py app/services/pipelines/pull.py app/utils/data_control_utils.py tests/unit/test_formatter_note.py
git commit -m "feat(notes): round-trip notes through Google Sheets"
```

---

### Task 6: Backfill migration

**Files:**
- Create: `alembic/versions/note_backfill_rows.py`
- Test: `tests/unit/test_note_backfill.py`

**Interfaces:**
- Consumes: the `note` table (Task 2).
- Produces: `_rows_from_value(section_key, value) -> list[dict]` and `_episode_sort_key(episode) -> tuple` inside the revision module, importable by the test. The `notes` JSONB columns are **retained** by this task; Task 9 drops them.

**Why the shape is detected structurally:** the old configs used seven section types whose stored shapes differ in ways the config files do not state (`episode_entry` stores `episodes` plural, `episode_type_desc` stores `episode` singular, `episode_comments` stores an object map rather than a list, `name_link` stores a single `link`). Rather than re-encode that mapping, the migration reads the value's structure.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_note_backfill.py`:

```python
"""Unit tests for the notes backfill helpers."""

import importlib

mod = importlib.import_module(
    "alembic.versions.note_backfill_rows"
)


def rows(section, value):
    return mod._rows_from_value(section, value)


def test_bare_string_becomes_one_row():
    got = rows("remark", "重看第三次")
    assert got == [
        {"section": "remark", "content": "重看第三次", "episode": None,
         "kind": None, "title": None, "links": None, "sort_index": 0.0}
    ]


def test_string_list_becomes_one_row_each_in_order():
    got = rows("advantages", ["敘事結構精巧", "配樂與畫面高度契合"])
    assert [r["content"] for r in got] == ["敘事結構精巧", "配樂與畫面高度契合"]
    assert [r["sort_index"] for r in got] == [0.0, 1.0]


def test_desc_links_maps_to_content_and_links():
    got = rows("analysis", [{"description": "契約制度", "links": ["https://a"]}])
    assert got[0]["content"] == "契約制度"
    assert got[0]["links"] == ["https://a"]


def test_name_link_single_link_widens_to_a_list():
    got = rows("resources", [{"name": "官方設定集", "link": "https://a"}])
    assert got[0]["title"] == "官方設定集"
    assert got[0]["links"] == ["https://a"]
    assert got[0]["content"] is None


def test_name_link_with_blank_link_stores_no_links():
    got = rows("resources", [{"name": "官方設定集", "link": ""}])
    assert got[0]["links"] is None


def test_episode_entry_plural_key():
    got = rows("highlights", [{"episodes": "ep 10", "type": "", "description": "揭露"}])
    assert got[0]["episode"] == "ep 10"
    assert got[0]["kind"] is None
    assert got[0]["content"] == "揭露"


def test_episode_type_desc_singular_key():
    got = rows(
        "highlight_episodes",
        [{"episode": "ep 3", "type": "", "description": "翻轉"}],
    )
    assert got[0]["episode"] == "ep 3"
    assert got[0]["content"] == "翻轉"


def test_episode_comments_object_map_expands():
    got = rows("episode_comments", {"ep 10": "最痛", "ep 3": "翻轉"})
    # Ordered by natural sort of the episode, not by dict key order.
    assert [r["episode"] for r in got] == ["ep 3", "ep 10"]
    assert [r["sort_index"] for r in got] == [0.0, 1.0]


def test_empty_values_produce_no_rows():
    assert rows("advantages", None) == []
    assert rows("advantages", []) == []
    assert rows("advantages", ["", "   "]) == []
    assert rows("remark", "") == []


def test_split_extended_episodes():
    got = mod._split_special(
        [{"episodes": "ep 12", "type": "加長", "description": "加長五分鐘"}]
    )
    assert got.rows[0]["section"] == "extended_episodes"
    assert got.rows[0]["kind"] is None
    assert got.unplaced == []


def test_split_op_ed_normalizes_special_spelling():
    got = mod._split_special(
        [{"episode": "ep 5", "type": "特別OP", "description": "換OP"}]
    )
    assert got.rows[0]["section"] == "op_ed_changes"
    assert got.rows[0]["kind"] == "特殊OP"


def test_split_reports_unplaced_kinds_instead_of_dropping():
    got = mod._split_special(
        [{"episode": "ep 7", "type": "回顧", "description": "總集篇"}]
    )
    assert got.rows == []
    assert got.unplaced == [{"episode": "ep 7", "type": "回顧", "description": "總集篇"}]


def test_episode_sort_key_is_numeric_not_lexical():
    eps = ["ep 10", "ep 2", "ep 1"]
    assert sorted(eps, key=mod._episode_sort_key) == ["ep 1", "ep 2", "ep 10"]


def test_episode_sort_key_handles_no_digits():
    # Must not raise; non-numeric episodes sort after numeric ones.
    assert mod._episode_sort_key("OVA") > mod._episode_sort_key("ep 99")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_backfill.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write the migration**

Create `alembic/versions/note_backfill_rows.py`:

```python
"""backfill note rows from the notes JSONB columns

Revision ID: note_backfill_rows
Revises: wo_item_importance
Create Date: 2026-08-23 00:00:00.000000

The `notes` columns are NOT dropped here. This revision only moves content, so
it can be run and inspected while the old columns are still readable; a later
revision drops them once the frontend no longer reads them.

Two things are knowingly lossy, and both are reported rather than hidden:

1. `episode_comments` was stored as a JSONB object map, which preserves no
   insertion order. The original order is not recoverable, so rows are ordered
   by a natural sort of the episode string instead of pretending otherwise.
2. `special_changes` / `special_episodes` split into `op_ed_changes` and
   `extended_episodes`. The kinds 回顧 and 其他 belong to neither and are
   retired from the vocabulary; any row carrying one is logged with its owner
   id and content and left for manual placement, never silently dropped.

`name_link` held one link and `note.links` holds a list, so that direction
widens and loses nothing.
"""
from dataclasses import dataclass, field
import json
import logging
import re
import uuid
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'note_backfill_rows'
down_revision: Union[str, Sequence[str], None] = 'wo_item_importance'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

# owner_type -> table name. The seven media tables are the only ones that ever
# had a notes column; the three tiers start empty.
MEDIA_TABLES = {
    "anime": "anime",
    "anime-movie": "anime_movies",
    "movie": "movies",
    "tv-show": "tv_shows",
    "cartoon": "cartoons",
    "manga": "manga",
    "novel": "novel",
}

# Sections that already left the blob for their own tables.
ALREADY_MIGRATED = {"quotes", "memes", "quotes_memes"}

RETIRED_SPECIAL_SECTIONS = {"special_changes", "special_episodes"}

# 特別 was the TV spelling, 特殊 the anime one; the vocabulary keeps 特殊.
OP_ED_KIND_MAP = {
    "變化OP": "變化OP",
    "變化ED": "變化ED",
    "無OP": "無OP",
    "無ED": "無ED",
    "特殊OP": "特殊OP",
    "特殊ED": "特殊ED",
    "特別OP": "特殊OP",
    "特別ED": "特殊ED",
}
EXTENDED_KIND = "加長"

_DIGITS = re.compile(r"\d+")


def _blank_row(section: str) -> dict:
    return {
        "section": section,
        "episode": None,
        "kind": None,
        "title": None,
        "content": None,
        "links": None,
        "sort_index": 0.0,
    }


def _clean(value: Any) -> Any:
    """Trim strings; turn empties into None."""
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _clean_links(value: Any) -> Any:
    if not isinstance(value, list):
        return None
    kept = [v.strip() for v in value if isinstance(v, str) and v.strip()]
    return kept or None


def _episode_sort_key(episode: Any):
    """
    Natural sort: 'ep 2' before 'ep 10'.

    Episodes with no digits sort after every numbered one, so 'OVA' lands at
    the end rather than in the middle.
    """
    text = episode if isinstance(episode, str) else ""
    match = _DIGITS.search(text)
    if match:
        return (0, int(match.group()), text)
    return (1, 0, text)


def _row_from_item(section: str, item: Any) -> dict | None:
    """
    One JSONB item to one note row, detecting the shape structurally.

    The old configs named seven section types, but the stored shapes differ in
    ways the configs did not state - `episode_entry` used a plural `episodes`
    key, `episode_type_desc` a singular `episode`, `name_link` a single `link`.
    Reading the value's structure avoids re-encoding that table here.
    """
    row = _blank_row(section)

    if isinstance(item, str):
        row["content"] = _clean(item)
        return row if row["content"] else None

    if not isinstance(item, dict):
        return None

    # episode_entry (episodes) or episode_type_desc (episode)
    row["episode"] = _clean(item.get("episodes") or item.get("episode"))
    row["kind"] = _clean(item.get("type"))
    # desc_links / episode shapes use `description`; name_link uses `name`.
    row["content"] = _clean(item.get("description") or item.get("comment"))
    row["title"] = _clean(item.get("name"))

    links = item.get("links")
    if links is None and item.get("link"):
        # name_link held exactly one link; the column holds a list.
        links = [item["link"]]
    row["links"] = _clean_links(links)

    if not any((row["episode"], row["content"], row["title"], row["links"])):
        return None
    return row


def _rows_from_value(section: str, value: Any) -> list[dict]:
    """Every note row for one section's stored value."""
    if value is None:
        return []

    # episode_comments is an object map {episode: comment}, not a list.
    if isinstance(value, dict):
        pairs = [
            (ep, comment)
            for ep, comment in value.items()
            if _clean(ep) or _clean(comment)
        ]
        pairs.sort(key=lambda pair: _episode_sort_key(pair[0]))
        rows = []
        for index, (episode, comment) in enumerate(pairs):
            row = _blank_row(section)
            row["episode"] = _clean(episode)
            row["content"] = _clean(comment)
            row["sort_index"] = float(index)
            rows.append(row)
        return rows

    items = value if isinstance(value, list) else [value]
    rows = []
    for item in items:
        row = _row_from_item(section, item)
        if row is None:
            continue
        row["sort_index"] = float(len(rows))
        rows.append(row)
    return rows


@dataclass
class SplitResult:
    rows: list[dict] = field(default_factory=list)
    unplaced: list[Any] = field(default_factory=list)


def _split_special(value: Any) -> SplitResult:
    """
    Split the retired special_changes / special_episodes into two sections.

    加長 becomes its own section, so its kind is cleared - the section is the
    kind. The OP/ED kinds keep theirs, normalized to the 特殊 spelling. Anything
    else (回顧, 其他, or a stray value) is returned unplaced.
    """
    result = SplitResult()
    items = value if isinstance(value, list) else ([value] if value else [])

    for item in items:
        kind = _clean(item.get("type")) if isinstance(item, dict) else None

        if kind == EXTENDED_KIND:
            row = _row_from_item("extended_episodes", item)
            if row:
                row["kind"] = None
                row["sort_index"] = float(
                    sum(1 for r in result.rows if r["section"] == "extended_episodes")
                )
                result.rows.append(row)
            continue

        if kind in OP_ED_KIND_MAP:
            row = _row_from_item("op_ed_changes", item)
            if row:
                row["kind"] = OP_ED_KIND_MAP[kind]
                row["sort_index"] = float(
                    sum(1 for r in result.rows if r["section"] == "op_ed_changes")
                )
                result.rows.append(row)
            continue

        result.unplaced.append(item)

    return result


def upgrade() -> None:
    """Expand every notes JSONB blob into note rows."""
    conn = op.get_bind()
    total = 0
    unplaced_report: list[str] = []

    for owner_type, table in MEDIA_TABLES.items():
        rows = conn.execute(
            sa.text(
                f"SELECT system_id, notes FROM {table} WHERE notes IS NOT NULL"
            )
        ).fetchall()

        for owner_id, notes in rows:
            blob = notes if isinstance(notes, dict) else json.loads(notes or "{}")
            note_rows: list[dict] = []

            for section, value in blob.items():
                if section in ALREADY_MIGRATED:
                    # Quotes and memes left the blob in earlier revisions.
                    continue
                if section in RETIRED_SPECIAL_SECTIONS:
                    split = _split_special(value)
                    note_rows.extend(split.rows)
                    for item in split.unplaced:
                        unplaced_report.append(
                            f"{owner_type} {owner_id} {section}: {item!r}"
                        )
                    continue
                note_rows.extend(_rows_from_value(section, value))

            for row in note_rows:
                conn.execute(
                    sa.text(
                        "INSERT INTO note (system_id, owner_type, owner_id, section,"
                        " episode, kind, title, content, links, sort_index,"
                        " created_at, updated_at)"
                        " VALUES (:system_id, :owner_type, :owner_id, :section,"
                        " :episode, :kind, :title, :content, CAST(:links AS JSONB),"
                        " :sort_index, NOW(), NOW())"
                    ),
                    {
                        "system_id": str(uuid.uuid4()),
                        "owner_type": owner_type,
                        "owner_id": str(owner_id),
                        **row,
                        "links": json.dumps(row["links"]) if row["links"] else None,
                    },
                )
            total += len(note_rows)

    logger.info("Backfilled %s note rows.", total)
    if unplaced_report:
        logger.warning(
            "%s special-change item(s) had no home section and were NOT migrated. "
            "Place them by hand:\n%s",
            len(unplaced_report),
            "\n".join(unplaced_report),
        )


def downgrade() -> None:
    """Delete the backfilled rows.

    The `notes` columns were never dropped by this revision, so the original
    content is still there and nothing needs folding back.
    """
    op.execute("DELETE FROM note")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_backfill.py -v`
Expected: PASS, 14 tests.

If the import fails because `alembic/versions/` has no `__init__.py`, load the module by path instead:

```python
import importlib.util, pathlib
spec = importlib.util.spec_from_file_location(
    "backfill",
    pathlib.Path(__file__).parents[2] / "alembic/versions/note_backfill_rows.py",
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
```

- [ ] **Step 5: Dry-run the migration against a copy of real data**

```bash
# Replace anime_site with the real local database name if it differs.
createdb -U postgres anime_site_backfill_check
pg_dump -U postgres anime_site | psql -U postgres anime_site_backfill_check
```

Point `DATABASE_URL` at the copy, then:

```bash
venv/Scripts/python.exe -m alembic upgrade head
```

Read the Alembic log. Record the backfilled row count and **every** unplaced-item warning. Compare counts:

```sql
SELECT section, count(*) FROM note GROUP BY section ORDER BY 2 DESC;
```

against a spot check of two or three entries' original `notes` values. Then verify the downgrade is clean:

```bash
venv/Scripts/python.exe -m alembic downgrade -1
```

Expected: `SELECT count(*) FROM note` returns 0 and every `notes` column is untouched.

- [ ] **Step 6: Report before continuing**

Show the operator the row counts per section and the unplaced list. Do not proceed to Task 9 (which drops the columns) until they confirm the backfill looks right.

- [ ] **Step 7: Commit**

```bash
git add alembic/versions/note_backfill_rows.py tests/unit/test_note_backfill.py
git commit -m "feat(notes): backfill note rows from the notes JSONB columns"
```

---

### Task 7: Registry-driven notes frontend

**Files:**
- Create: `frontend/src/pages/notes/api.js`
- Create: `frontend/src/pages/notes/sections/TextSection.jsx`
- Create: `frontend/src/pages/notes/sections/TextLinksSection.jsx`
- Create: `frontend/src/pages/notes/sections/EpisodeTextSection.jsx`
- Create: `frontend/src/pages/notes/sections/NameLinksSection.jsx`
- Modify: `frontend/src/pages/notes/NotesTemplate.jsx` (full rewrite)
- Delete: `frontend/src/pages/notes/configs/*.js` (all seven)
- Modify: `frontend/src/pages/detail/{Anime,AnimeMovie,Movie,TvShow,Cartoon,Manga,Novel}Notes.jsx` — drop the `SECTIONS` import and prop

**Interfaces:**
- Consumes: `GET /api/notes/sections?owner_type=`, `GET /api/notes?owner_type=&owner_id=`, `POST/PATCH/DELETE /api/notes`, `PATCH /api/notes/reorder` (Task 4).
- Produces:
  - `api.js`: `fetchSections(ownerType)`, `fetchNotes(ownerType, ownerId)`, `createNote(payload)`, `updateNote(id, payload)`, `deleteNote(id)`, `reorderNotes({ownerType, ownerId, section, orderedIds})`
  - Each section component takes the same props: `{ section, notes, isAdmin, onCreate, onUpdate, onDelete, onReorder }` where `section` is a `NoteSectionOut` and `notes` is that section's rows.
  - `NotesTemplate` takes `{ ownerType, ownerId, isAdmin }` — no `SECTIONS` prop.

- [ ] **Step 1: Read the current component before rewriting**

Read `frontend/src/pages/notes/NotesTemplate.jsx` in full. The four new components must preserve its existing edit affordances (inline add row, per-item edit and delete, admin gating) and Tailwind classes — this task changes where the data lives, not how the page looks.

- [ ] **Step 2: Write the API client**

Create `frontend/src/pages/notes/api.js`:

```javascript
// Frontend: thin fetch wrappers for the note endpoints. The notes page reads
// its own structure from the backend registry, so there is no local config.

const json = async (res) => {
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.status === 204 ? null : res.json();
};

export const fetchSections = (ownerType) =>
  fetch(`/api/notes/sections?owner_type=${encodeURIComponent(ownerType)}`).then(json);

export const fetchNotes = (ownerType, ownerId) =>
  fetch(
    `/api/notes?owner_type=${encodeURIComponent(ownerType)}&owner_id=${ownerId}`,
  ).then(json);

export const createNote = (payload) =>
  fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(json);

export const updateNote = (id, payload) =>
  fetch(`/api/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(json);

export const deleteNote = (id) =>
  fetch(`/api/notes/${id}`, { method: "DELETE" }).then(json);

export const reorderNotes = ({ ownerType, ownerId, section, orderedIds }) =>
  fetch("/api/notes/reorder", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_type: ownerType,
      owner_id: ownerId,
      section,
      ordered_ids: orderedIds,
    }),
  }).then(json);
```

Check `frontend/src/lib/` for an existing fetch helper that already handles credentials and error toasts. If one exists, use it instead of raw `fetch` and keep this module's exported signatures unchanged.

- [ ] **Step 3: Write the four section components**

Each lives in `frontend/src/pages/notes/sections/`. They share one prop contract, so `NotesTemplate` can dispatch on `section.shape` alone. `TextSection` is the model the other three follow:

```jsx
// Frontend: renders one `text`-shaped notes section - a list of one-line items.
// Each item is one `note` row, so editing one is a PATCH of that row rather
// than a rewrite of the whole section.
import { useState } from "react";

export default function TextSection({
  section,
  notes,
  isAdmin,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");

  const commit = () => {
    const content = draft.trim();
    if (!content) return;
    onCreate({ section: section.key, content });
    setDraft("");
  };

  const saveEdit = (id) => {
    const content = editVal.trim();
    if (!content) return;
    onUpdate(id, { content });
    setEditId(null);
  };

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{section.label}</h3>
      <ul className="space-y-1">
        {notes.map((n) =>
          editId === n.system_id ? (
            <li key={n.system_id} className="flex gap-2">
              <input
                className="flex-1 rounded border px-2 py-1"
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
              />
              <button onClick={() => saveEdit(n.system_id)}>Save</button>
              <button onClick={() => setEditId(null)}>Cancel</button>
            </li>
          ) : (
            <li key={n.system_id} className="flex gap-2">
              <span className="flex-1">{n.content}</span>
              {isAdmin && (
                <>
                  <button
                    onClick={() => {
                      setEditId(n.system_id);
                      setEditVal(n.content || "");
                    }}
                  >
                    Edit
                  </button>
                  <button onClick={() => onDelete(n.system_id)}>Delete</button>
                </>
              )}
            </li>
          ),
        )}
      </ul>
      {isAdmin && !section.singleton && (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an item..."
          />
          <button onClick={commit}>Add</button>
        </div>
      )}
      {isAdmin && section.singleton && notes.length === 0 && (
        <textarea
          className="w-full rounded border px-2 py-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder="Add private overview notes, specific remarks, etc."
        />
      )}
    </section>
  );
}
```

The other three differ only in which fields they edit — replace the markup above, keeping the same props, state pattern, and admin gating:

- `TextLinksSection` — a `content` textarea plus a repeatable `links` list, and an optional `episode` input rendered when `section.episode_placeholder` is set. Refuses to commit an empty `content` when `section.desc_required` is true.
- `EpisodeTextSection` — an `episode` input using `section.episode_placeholder`, a `kind` `<select>` rendered only when `section.kinds.length > 0`, and a `content` textarea.
- `NameLinksSection` — a `title` input and a repeatable `links` list.

Copy the existing visual treatment from the corresponding component in the old `NotesTemplate.jsx` (`StringListSection`, `DescLinksSection`, `EpisodeEntryForm`/`EpisodeTypeDescForm`, `NameLinkForm`).

- [ ] **Step 4: Rewrite NotesTemplate**

```jsx
// Frontend: the notes page for every owner type.
//
// The page no longer knows what a section is: it fetches the registry from
// /api/notes/sections and dispatches on each section's shape. That is why the
// seven configs/*.js files are gone - the backend owns the structure now.
import { useCallback, useEffect, useMemo, useState } from "react";

import * as api from "./api";
import TextSection from "./sections/TextSection";
import TextLinksSection from "./sections/TextLinksSection";
import EpisodeTextSection from "./sections/EpisodeTextSection";
import NameLinksSection from "./sections/NameLinksSection";

const SHAPES = {
  text: TextSection,
  text_links: TextLinksSection,
  episode_text: EpisodeTextSection,
  name_links: NameLinksSection,
};

export default function NotesTemplate({ ownerType, ownerId, isAdmin }) {
  const [sections, setSections] = useState([]);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [secs, rows] = await Promise.all([
        api.fetchSections(ownerType),
        api.fetchNotes(ownerType, ownerId),
      ]);
      setSections(secs);
      setNotes(rows);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const bySection = useMemo(() => {
    const map = {};
    for (const n of notes) (map[n.section] ||= []).push(n);
    return map;
  }, [notes]);

  const handlers = useMemo(
    () => ({
      onCreate: async (payload) => {
        await api.createNote({
          owner_type: ownerType,
          owner_id: ownerId,
          ...payload,
        });
        reload();
      },
      onUpdate: async (id, payload) => {
        await api.updateNote(id, payload);
        reload();
      },
      onDelete: async (id) => {
        await api.deleteNote(id);
        reload();
      },
      onReorder: async (section, orderedIds) => {
        await api.reorderNotes({ ownerType, ownerId, section, orderedIds });
        reload();
      },
    }),
    [ownerType, ownerId, reload],
  );

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        // quotes and memes have their own tables and their own pages; the
        // registry lists them so the page can link to them, not render them.
        const Component = SHAPES[section.shape];
        if (!Component) return null;
        return (
          <Component
            key={section.key}
            section={section}
            notes={bySection[section.key] || []}
            isAdmin={isAdmin}
            {...handlers}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Update the seven detail wrappers**

Each of `frontend/src/pages/detail/{Anime,AnimeMovie,Movie,TvShow,Cartoon,Manga,Novel}Notes.jsx` currently imports a config and passes it as `SECTIONS`. Replace with the owner type, e.g. in `AnimeNotes.jsx`:

```jsx
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeNotes({ entryId, isAdmin }) {
  return <NotesTemplate ownerType="anime" ownerId={entryId} isAdmin={isAdmin} />;
}
```

Keep each file's existing props and surrounding layout — read the file before editing. The `ownerType` values are `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`.

- [ ] **Step 6: Delete the configs**

```bash
git rm frontend/src/pages/notes/configs/animeNotesConfig.js \
       frontend/src/pages/notes/configs/animeMovieNotesConfig.js \
       frontend/src/pages/notes/configs/movieNotesConfig.js \
       frontend/src/pages/notes/configs/tvShowNotesConfig.js \
       frontend/src/pages/notes/configs/cartoonNotesConfig.js \
       frontend/src/pages/notes/configs/mangaNotesConfig.js \
       frontend/src/pages/notes/configs/novelNotesConfig.js
```

- [ ] **Step 7: Verify in the running app**

```bash
docker-compose up -d
venv/Scripts/python.exe -m uvicorn app.main:app --reload
cd frontend && npm run dev
```

Check, logged in as admin, on one anime entry that has existing notes:

1. Every section from the registry renders, in the order the registry gives.
2. Existing backfilled content appears under the right sections.
3. Adding, editing, deleting one bullet each works and survives a reload.
4. `op_ed_changes` shows a kind dropdown; `extended_episodes` shows none.
5. `remark` shows one textarea, and no "Add" affordance once it has content.
6. Logged out, everything renders read-only with no edit controls.

Also confirm the build is clean:

```bash
cd frontend && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/notes frontend/src/pages/detail
git commit -m "feat(notes): drive the notes page from the backend registry"
```

---

### Task 8: Notes on collections, franchises, and series

**Files:**
- Modify: `frontend/src/pages/detail/` — the collection, franchise, and series detail pages (find them with `ls frontend/src/pages/detail/`)
- Create: `frontend/src/pages/detail/CollectionNotes.jsx`, `FranchiseNotes.jsx`, `SeriesNotes.jsx`

**Interfaces:**
- Consumes: `NotesTemplate` (Task 7), which already accepts any owner type.
- Produces: a Notes tab on each of the three tier pages.

- [ ] **Step 1: Read one existing detail page's tab structure**

Read the anime detail page and note exactly how it declares its Notes tab — the tab list, the routing or state that selects it, and how `isAdmin` reaches the component. The three tier pages must follow the same pattern, not a new one.

- [ ] **Step 2: Write the three wrappers**

`frontend/src/pages/detail/FranchiseNotes.jsx`:

```jsx
// Frontend: the Notes tab for a franchise. A franchise-level note is the same
// row shape as an entry's - only owner_type differs - so this is the same
// component with a different owner.
import NotesTemplate from "../notes/NotesTemplate";

export default function FranchiseNotes({ franchiseId, isAdmin }) {
  return (
    <NotesTemplate ownerType="franchise" ownerId={franchiseId} isAdmin={isAdmin} />
  );
}
```

`CollectionNotes.jsx` and `SeriesNotes.jsx` are identical with `ownerType="collection"` / `"series"` and the matching id prop.

- [ ] **Step 3: Add the tab to each tier page**

Add a "Notes" tab to the collection, franchise, and series detail pages, matching the tab pattern read in Step 1.

- [ ] **Step 4: Verify in the running app**

With the dev servers from Task 7 still running, on one franchise:

1. The Notes tab appears and renders the franchise section set — `advantages` present, `episode_comments` absent.
2. Adding a franchise-level note works and survives a reload.
3. The collection page shows the narrower set (no `advantages`, no `disadvantages`).
4. A series shows `cinematography`; a franchise does not.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/detail
git commit -m "feat(notes): add notes to collections, franchises, and series"
```

---

### Task 9: Drop the `notes` column

Do not start this task until the operator has confirmed the Task 6 backfill and the Task 7/8 frontend both look right in the real app. This is the irreversible step.

**Files:**
- Create: `alembic/versions/note_drop_jsonb.py`
- Modify: `app/schemas/{anime,anime_movie,movie,tv_show,cartoon,manga,novel}.py` — remove the `notes` field
- Modify: `app/models/{anime,anime_movie,movie,tv_show,cartoon,manga,novel}.py` — remove the `notes` column
- Modify: `app/utils/formatter.py` — remove `notes` from the seven `parse_*_from_sheet` functions
- Modify: `frontend/src/lib/payloads.js:58,149` — remove `notes`
- Modify: `frontend/src/pages/admin/Modify.jsx` — the seven prefills (`:130,231,495,542,592,653,716`) and seven submit fields (`:861,1078,1218,1360,1503,1666,1867`)
- Modify: `frontend/src/pages/add-tabs/*.jsx` — the seven "Private notes..." inputs
- Modify: `frontend/src/pages/detail/{Anime,AnimeMovie}.jsx` — the `performUpdate({ notes: ... })` calls
- Modify: `frontend/src/pages/admin/Delete.jsx` — the seven `selectedX.notes?.remark` previews
- Modify: `frontend/src/components/modals/FranchiseCreateModal.jsx:50` — the notes placeholder

**Interfaces:**
- Consumes: everything above.
- Produces: no `notes` JSONB anywhere. Notes are written only through `/api/notes`.

- [ ] **Step 1: Switch the Delete.jsx previews to the remark column**

In `frontend/src/pages/admin/Delete.jsx`, replace each of the seven `selectedX.notes?.remark` blocks with `selectedX.remark`. The `remark` Text column is a different field and is untouched by this plan — it is already on every model.

- [ ] **Step 2: Remove `notes` from every frontend write path**

Delete the `notes` key from the franchise and series payload builders in `payloads.js`, the fourteen prefill/submit sites in `Modify.jsx`, the "Private notes..." inputs in the seven add-tabs, the `performUpdate({ notes: ... })` calls in the detail pages, and the notes field in `FranchiseCreateModal.jsx`. Notes are now edited only on the Notes tab.

- [ ] **Step 3: Verify the frontend builds and nothing references notes**

```bash
cd frontend && npm run build
grep -rn "notes" frontend/src --include=*.jsx --include=*.js | grep -v "pages/notes"
```

Expected: build clean; the grep returns only comments and the `AnnouncementBoard.jsx:1` comment about announcement notes.

- [ ] **Step 4: Remove `notes` from the backend models, schemas, and parsers**

Delete the `notes` column from the seven model files (`anime.py:111`, `anime_movie.py:78`, `cartoon.py:73`, `manga.py:91`, `movie.py:70`, `novel.py:97`, `tv_show.py:72`), the `notes` field from the seven schema files, and the `notes` key from the seven `parse_*_from_sheet` functions in `formatter.py`.

- [ ] **Step 5: Write the migration**

Create `alembic/versions/note_drop_jsonb.py`:

```python
"""drop the notes JSONB column from the seven media tables

Revision ID: note_drop_jsonb
Revises: note_backfill_rows
Create Date: 2026-08-23 00:00:00.000000

The content moved to the `note` table in note_backfill_rows. This revision is run
only once that backfill has been verified against real data, because
downgrading restores the columns but not what was in them - the note rows
would have to be folded back by hand.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'note_drop_jsonb'
down_revision: Union[str, Sequence[str], None] = 'note_backfill_rows'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("anime", "anime_movies", "movies", "tv_shows", "cartoons", "manga", "novel")


def upgrade() -> None:
    """Drop the notes column now that every row lives in `note`."""
    for table in TABLES:
        op.drop_column(table, "notes")


def downgrade() -> None:
    """Restore the columns, empty.

    Their content is in `note` and is not folded back automatically: the
    expansion was one-to-many and two parts of it are documented as lossy.
    """
    for table in TABLES:
        op.add_column(
            table, sa.Column("notes", postgresql.JSONB(), nullable=True)
        )
```

- [ ] **Step 6: Run the migration**

```bash
venv/Scripts/python.exe -m alembic upgrade head
```

Expected: no errors. Verify with `\d anime` in psql that `notes` is gone and `remark` remains.

- [ ] **Step 7: Run the whole suite**

Run: `venv/Scripts/python.exe -m pytest tests/ -v`
Expected: PASS. Any failure here is a test still asserting on `notes` — update it to the `note` table rather than restoring the column.

- [ ] **Step 8: Verify the app end to end**

With both dev servers running: open an anime entry, a franchise, and a collection; confirm notes render and edit; run a Backup and then a Pull of the `Note` tab and confirm the row count is unchanged.

- [ ] **Step 9: Commit**

```bash
git add app/models app/schemas app/utils/formatter.py alembic/versions/note_drop_jsonb.py frontend/src
git commit -m "feat(notes): drop the notes JSONB column"
```

---

## Documentation

After Task 9, update the docs listed in `CLAUDE.md`'s Documentation Map that this change invalidates:

- `docs/database-schema.md` — remove the seven `notes` JSONB rows; add the `note` table.
- `docs/api.md` — add the six `/api/notes` endpoints.
- `docs/business-logic.md` — the `notes` parse note at line 1529.
- `docs/pages.md` and `docs/reusable-elements.md` — the notes page and its four shape components.
- `docs/options.md` — the `op_ed_changes` kinds, and the retirement of `回顧` / `其他`.
- `docs/admin-forms.md` — add and modify forms no longer carry notes.

Commit as `docs: update for the notes restructure`.
