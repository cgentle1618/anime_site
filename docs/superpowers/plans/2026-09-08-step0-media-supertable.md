# Step 0 — `media` supertable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every media entry one row in a shared `media` table so that
anything pointing at "some entry" uses a real foreign key, and the fields all
nine types share can be queried in one place.

**Architecture:** Three phases, in order, and the order is the whole design.
**Expand** creates `media`, backfills it from the nine detail tables using their
existing UUIDs, and points each detail table at it — the detail tables keep
every column they have, so nothing reads `media` yet and no behaviour can
change. **Convert** moves the six entry-only link tables from their FK-less
`(media_type, entry_id)` pair to a real `media_id`, which is where the cascades
and the deleted cleanup code land. **Contract** repoints reads onto `media` one
column at a time and drops each detail-table copy in the same task, so a column
is never writable in two places at once.

The contract phase is last and per-column because
`app/utils/entity_ref.py:entity_ref_filter` resolves a detail route by
`getattr(model, kind) == value`. Move `public_id` off the nine detail models
carelessly and all nine detail routes 500 at once.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL 17, pytest, ruff;
React + Vite, TanStack Query, Tailwind v4, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-multi-user-catalog-design.md`

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
  via `op.execute`**, with column lists spelled out. No exceptions.
- **One Alembic head.** Each task that adds a migration sets `down_revision` to
  the previous task's revision id. Run `alembic heads` before committing and
  confirm exactly one.
- **`alembic upgrade head` from an empty database is already broken** at
  `86982d71c2f1` (`docs/PROGRESS.md`, open item). Test migrations against a
  database restored from a Backup, not a fresh one, and do not treat that
  pre-existing failure as caused by this plan.
- **Give this session its own test database.** Concurrent sessions poison a
  shared `anime_site_test`. Export `POSTGRES_DB=anime_site_test_step0` before
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
  written in this plan is hyphenated, matching `MEDIA_TABLES`.
- **Update the matching doc in the same change** and bump its `Last verified`
  line. This plan touches `docs/data-model.md` throughout.
- **Claim the task in `docs/PROGRESS.md`** (`wip <who>`) before starting; set it
  to `done <sha>` in the same commit as the work.
- **Back up before the first migration.** `/system` → Backup. These migrations
  drop columns; the sheet is the only copy.

## Interface contract

Names every later task and every later plan depends on. Do not rename.

```python
# app/models/media.py
class Media(Base):
    __tablename__ = "media"
    system_id: UUID          # PK, equal to the detail row's existing system_id
    media_type: str          # hyphenated MEDIA_TABLES key
    public_id: int
    display_name: str
    cover_image_file: str | None
    franchise_id: UUID | None
    series_id: UUID | None
    created_at: datetime
    updated_at: datetime
```

```python
# app/services/domain/display_name.py
def compute_display_name(entry) -> str:
    """CN-first fallback across the entry's *_name_* columns."""
```

Constraint names, used verbatim by the drift test in Task 12:

- `uq_media_id_type` — `UNIQUE (system_id, media_type)` on `media`
- `uq_media_type_public_id` — `UNIQUE (media_type, public_id)` on `media`,
  `DEFERRABLE INITIALLY DEFERRED`
- `fk_<table>_media` — composite FK `(system_id, media_type)` on each detail table
- `ck_<table>_media_type` — `CHECK (media_type = '<key>')` on each detail table
- `trg_<table>_delete_media` — `AFTER DELETE` trigger removing the `media` row

The nine `(table, key)` pairs, in the order tasks port them:

| Table | `media_type` key | Has `series_id`? |
|---|---|---|
| `anime` | `anime` | yes |
| `anime_movies` | `anime-movie` | **no** |
| `movies` | `movie` | yes |
| `tv_shows` | `tv-show` | yes |
| `cartoons` | `cartoon` | yes |
| `manga` | `manga` | yes |
| `novel` | `novel` | yes |
| `comic` | `comic` | yes |
| `games` | `game` | yes |

---

# Phase A — Expand

Nothing in this phase changes behaviour. `media` is written but never read.

### Task 1: The `media` model and its table

**Files:**
- Create: `app/models/media.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/m0a1media_create_media.py`
- Create: `tests/unit/test_media_model.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `models.Media` with the columns in the interface contract above.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_media_model.py
"""The media supertable's shape. Pure metadata - no database."""

from app import models


def test_media_table_exists_with_expected_columns():
    cols = {c.name for c in models.Media.__table__.columns}
    assert cols == {
        "system_id", "media_type", "public_id", "display_name",
        "cover_image_file", "franchise_id", "series_id",
        "created_at", "updated_at",
    }


def test_media_type_and_display_name_are_not_nullable():
    t = models.Media.__table__
    assert t.c.media_type.nullable is False
    assert t.c.display_name.nullable is False
    assert t.c.public_id.nullable is False


def test_media_carries_both_unique_constraints_by_name():
    names = {c.name for c in models.Media.__table__.constraints if c.name}
    assert "uq_media_id_type" in names
    assert "uq_media_type_public_id" in names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_media_model.py -v`
Expected: FAIL with `AttributeError: module 'app.models' has no attribute 'Media'`

- [ ] **Step 3: Write the model**

```python
# app/models/media.py
"""
The media supertable - one row per media entry, whatever its type.

Exists so that anything pointing at "some entry" - a user's list row, a credit,
a source, a quote - can use a real foreign key instead of a
(media_type, entry_id) pair, and so that the fields every type shares can be
queried across types in one place.

PROMOTION RULE. A field belongs here only when all nine types have it AND
something queries across types by it. Both halves are required. Without the
rule this becomes a junk drawer and the detail tables hollow out; any addition
must name the cross-type query that justifies it in its commit message.
Deliberately NOT here: my_rating and watching_status (per-user, not
catalogue); mal_rating and mal_id (only the MAL-sourced types have them);
airing_status (spelled serialization_status / release_status elsewhere and not
the same concept).
"""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class Media(Base):
    __tablename__ = "media"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Hyphenated, matching MEDIA_TABLES keys: "anime", "anime-movie", "tv-show".
    media_type = Column(String, nullable=False, index=True)
    # Per-type numbering is kept: each detail table still owns its own
    # <table>_public_id_seq and its own range. This column stores the value.
    public_id = Column(Integer, nullable=False)

    display_name = Column(String, nullable=False, index=True)
    cover_image_file = Column(String, nullable=True)
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    # Null for every anime-movie row: anime movies have no series.
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    __table_args__ = (
        # Lets a detail table FK on (system_id, media_type) and so pin its own
        # type in the database: an anime row can never point at a manga.
        UniqueConstraint("system_id", "media_type", name="uq_media_id_type"),
        UniqueConstraint(
            "media_type",
            "public_id",
            name="uq_media_type_public_id",
            # The Sheets restore can hand row A an id row B still holds until
            # the restore reaches B; only the end state has to be unique. This
            # mirrors the per-table constraint it replaces (see anime.py).
            deferrable=True,
            initially="DEFERRED",
        ),
    )
```

Add to `app/models/__init__.py` beside the other model imports:

```python
from app.models.media import Media  # noqa: F401
```

- [ ] **Step 4: Write the migration**

```python
# alembic/versions/m0a1media_create_media.py
"""create the media supertable (empty)

Revision ID: m0a1media
Revises: pdf1e2r3d4e5
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m0a1media"
down_revision: Union[str, Sequence[str], None] = "pdf1e2r3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the table only. Backfill happens per media type, later."""
    op.create_table(
        "media",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("public_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("cover_image_file", sa.String(), nullable=True),
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["franchise_id"], ["franchise.system_id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["series_id"], ["series.system_id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint("system_id", "media_type", name="uq_media_id_type"),
    )
    op.create_index("ix_media_system_id", "media", ["system_id"])
    op.create_index("ix_media_media_type", "media", ["media_type"])
    op.create_index("ix_media_display_name", "media", ["display_name"])
    # Deferrable uniques cannot be declared inline by create_table's helper in
    # a way that carries DEFERRABLE, so it is added explicitly.
    op.execute(
        "ALTER TABLE media ADD CONSTRAINT uq_media_type_public_id "
        "UNIQUE (media_type, public_id) DEFERRABLE INITIALLY DEFERRED"
    )


def downgrade() -> None:
    op.drop_index("ix_media_display_name", table_name="media")
    op.drop_index("ix_media_media_type", table_name="media")
    op.drop_index("ix_media_system_id", table_name="media")
    op.drop_table("media")
```

- [ ] **Step 5: Run the migration and the test**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m pytest tests/unit/test_media_model.py -v
```
Expected: migration applies; all three tests PASS. Then
`venv/Scripts/python.exe -m alembic heads` prints exactly one head.

- [ ] **Step 6: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures. `media` is empty and unreferenced.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/models/media.py app/models/__init__.py \
        alembic/versions/m0a1media_create_media.py \
        tests/unit/test_media_model.py docs/PROGRESS.md
```
Proposed message: `feat(media): add the media supertable, empty and unreferenced`
**Ask before running `git commit`.**

---

### Task 2: `compute_display_name` and its drift test

**Files:**
- Create: `app/services/domain/display_name.py`
- Modify: `app/services/domain/__init__.py`
- Create: `tests/unit/test_display_name.py`

**Interfaces:**
- Consumes: `models.Media` (Task 1); `NameFallbackMixin` in `app/models/base.py`.
- Produces: `compute_display_name(entry) -> str`, used by every backfill task
  and by the write path in Task 13.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_display_name.py
"""CN-first display name derivation, shared by media backfills and writes."""

import pytest

from app import models
from app.services.domain.display_name import compute_display_name


def test_prefers_cn():
    a = models.Anime(anime_name_cn="葬送的芙莉蓮", anime_name_en="Frieren")
    assert compute_display_name(a) == "葬送的芙莉蓮"


def test_falls_back_when_cn_missing():
    a = models.Anime(anime_name_cn=None, anime_name_en="Frieren")
    assert compute_display_name(a) == "Frieren"


def test_treats_whitespace_only_as_missing():
    a = models.Anime(anime_name_cn="   ", anime_name_en="Frieren")
    assert compute_display_name(a) == "Frieren"


def test_raises_when_every_name_is_empty():
    a = models.Anime()
    with pytest.raises(ValueError, match="no name"):
        compute_display_name(a)


@pytest.mark.parametrize(
    "model, kwargs, expected",
    [
        (models.Manga, {"manga_name_cn": "鏈鋸人"}, "鏈鋸人"),
        (models.Movies, {"movie_name_en": "Fight Club"}, "Fight Club"),
        (models.Game, {"game_name_en": "Hollow Knight"}, "Hollow Knight"),
    ],
)
def test_works_for_every_media_model(model, kwargs, expected):
    assert compute_display_name(model(**kwargs)) == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_display_name.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.domain.display_name`

- [ ] **Step 3: Write the implementation**

```python
# app/services/domain/display_name.py
"""
One place that answers "what is this entry called?".

media.display_name is denormalized: it is derived from the detail table's
*_name_* columns and stored on media so that a search across all nine types is
one indexed query instead of a nine-way UNION. Denormalized state needs one
producer, and this is it - the backfills and the write hook both call this, so
they cannot disagree.

This is not a new pattern: person, studio, publisher and character already each
carry a stored display_name_field derived the same way.
"""


def compute_display_name(entry) -> str:
    """
    CN-first fallback across `entry._name_fields`, in declaration order.

    Raises ValueError when every name column is empty - media.display_name is
    NOT NULL, and an entry with no name at all is a data error worth failing on
    rather than storing an empty string that no search will ever match.
    """
    fields = getattr(entry, "_name_fields", None)
    if not fields:
        raise ValueError(f"{type(entry).__name__} declares no _name_fields")

    cn = [f for f in fields if f.endswith("_cn")]
    ordered = cn + [f for f in fields if f not in cn]

    for field in ordered:
        value = getattr(entry, field, None)
        if value and str(value).strip():
            return str(value).strip()

    raise ValueError(f"{type(entry).__name__} has no name in any of {fields}")
```

Export it from `app/services/domain/__init__.py` beside the other domain
helpers:

```python
from app.services.domain.display_name import compute_display_name  # noqa: F401
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_display_name.py -v`
Expected: all PASS.

- [ ] **Step 5: Run ruff and the full unit tier**

Run:
```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest tests/unit -q
```
Expected: clean; no new failures.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/services/domain/display_name.py app/services/domain/__init__.py \
        tests/unit/test_display_name.py docs/PROGRESS.md
```
Proposed message: `feat(media): add compute_display_name, the single producer of media.display_name`
**Ask before running `git commit`.**

---

### Task 3: Port `anime` — the pattern every other type follows

**Files:**
- Modify: `app/models/anime.py`
- Create: `alembic/versions/m0a2anime_anime_to_media.py`
- Create: `tests/api/test_media_supertable.py`

**Interfaces:**
- Consumes: `models.Media` (Task 1), `compute_display_name` (Task 2).
- Produces: the porting pattern — composite FK `fk_anime_media`, check
  `ck_anime_media_type`, trigger `trg_anime_delete_media`. Tasks 4–11 repeat it.

**Note on the SQL name expression.** The migration cannot call
`compute_display_name` (no ORM imports in migrations, per Global Constraints),
so the CN-first fallback is spelled as a SQL `COALESCE` over the same columns in
the same order. Task 12's drift test is what proves the two agree.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_media_supertable.py
"""
Every media entry has exactly one media row, and deleting either end cleans up.

The pair (system_id, media_type) is what stops a detail row attaching to a
media row of the wrong type; the trigger is what stops a delete against the
detail table leaving the parent behind.
"""

import pytest
from sqlalchemy import text

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_creating_an_anime_creates_its_media_row(db, sample_franchise):
    a = models.Anime(anime_name_cn="測試", franchise_id=sample_franchise.system_id)
    db.add(a)
    db.commit()

    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    assert m.media_type == "anime"
    assert m.display_name == "測試"
    assert m.franchise_id == sample_franchise.system_id


def test_deleting_the_media_row_removes_the_anime(db):
    a = models.Anime(anime_name_cn="測試刪除")
    db.add(a)
    db.commit()
    sid = a.system_id

    db.execute(text("DELETE FROM media WHERE system_id = :s"), {"s": sid})
    db.commit()

    assert db.query(models.Anime).filter_by(system_id=sid).first() is None


def test_deleting_the_anime_row_removes_its_media(db):
    """The AFTER DELETE trigger: deleting the child must not orphan the parent."""
    a = models.Anime(anime_name_cn="測試觸發")
    db.add(a)
    db.commit()
    sid = a.system_id

    db.execute(text("DELETE FROM anime WHERE system_id = :s"), {"s": sid})
    db.commit()

    assert db.query(models.Media).filter_by(system_id=sid).first() is None


def test_an_anime_cannot_point_at_a_manga_media_row(db):
    m = models.Media(
        media_type="manga", public_id=999999, display_name="不是動畫"
    )
    db.add(m)
    db.commit()

    db.execute(
        text(
            "INSERT INTO anime (system_id, media_type, public_id, anime_name_cn) "
            "VALUES (:s, 'anime', 999998, '錯型別')"
        ),
        {"s": m.system_id},
    )
    with pytest.raises(Exception):  # ForeignKeyViolation on (system_id, media_type)
        db.commit()
    db.rollback()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_media_supertable.py -v`
Expected: FAIL — no `media` row is created for a new anime.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m0a2anime_anime_to_media.py
"""backfill media from anime and point anime at it

Revision ID: m0a2anime
Revises: m0a1media
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m0a2anime"
down_revision: Union[str, Sequence[str], None] = "m0a1media"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# CN-first, matching compute_display_name and NameFallbackMixin. NULLIF collapses
# whitespace-only names to NULL so COALESCE skips them, exactly as the Python
# helper's .strip() check does.
DISPLAY_NAME = """
    COALESCE(
        NULLIF(TRIM(anime_name_cn), ''),
        NULLIF(TRIM(anime_name_en), ''),
        NULLIF(TRIM(anime_name_roman), ''),
        NULLIF(TRIM(anime_name_jp), ''),
        NULLIF(TRIM(anime_name_alt), ''),
        '(unnamed anime ' || public_id::text || ')'
    )
"""


def upgrade() -> None:
    """
    Raw SQL by design. docs/PROGRESS.md records that data migrations importing
    live ORM models break whenever a later migration adds a column, because the
    model SELECTs every column it currently declares.
    """
    op.execute(f"""
        INSERT INTO media (system_id, media_type, public_id, display_name,
                           cover_image_file, franchise_id, series_id,
                           created_at, updated_at)
        SELECT system_id, 'anime', public_id, {DISPLAY_NAME},
               cover_image_file, franchise_id, series_id,
               COALESCE(created_at, now()), COALESCE(updated_at, now())
        FROM anime
    """)

    op.add_column(
        "anime",
        sa.Column("media_type", sa.String(), nullable=False, server_default="anime"),
    )
    op.create_check_constraint(
        "ck_anime_media_type", "anime", "media_type = 'anime'"
    )
    op.create_foreign_key(
        "fk_anime_media",
        "anime",
        "media",
        ["system_id", "media_type"],
        ["system_id", "media_type"],
        ondelete="CASCADE",
    )

    # Deleting the child must not orphan the parent. The cascade only runs
    # downward, and code will reach for the table named `anime`.
    op.execute("""
        CREATE OR REPLACE FUNCTION delete_media_row() RETURNS trigger AS $$
        BEGIN
            DELETE FROM media WHERE system_id = OLD.system_id;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_anime_delete_media
        AFTER DELETE ON anime
        FOR EACH ROW EXECUTE FUNCTION delete_media_row()
    """)

    counts = sa.text(
        "SELECT (SELECT COUNT(*) FROM anime), "
        "(SELECT COUNT(*) FROM media WHERE media_type = 'anime')"
    )
    detail, parent = op.get_bind().execute(counts).one()
    if detail != parent:
        raise RuntimeError(f"anime backfill mismatch: {detail} rows, {parent} media")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_anime_delete_media ON anime")
    op.drop_constraint("fk_anime_media", "anime", type_="foreignkey")
    op.drop_constraint("ck_anime_media_type", "anime", type_="check")
    op.drop_column("anime", "media_type")
    op.execute("DELETE FROM media WHERE media_type = 'anime'")
    # The function is shared by all nine triggers; drop it only with the last.
```

- [ ] **Step 4: Update the model**

In `app/models/anime.py`, add the discriminator column beside `system_id` and
declare the constraints so SQLAlchemy metadata matches the database:

```python
    media_type = Column(String, nullable=False, server_default="anime")
```

and inside `__table_args__`, alongside the existing deferrable `public_id`
constraint:

```python
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_anime_media",
            ondelete="CASCADE",
        ),
        CheckConstraint("media_type = 'anime'", name="ck_anime_media_type"),
```

Import `CheckConstraint` and `ForeignKeyConstraint` from `sqlalchemy` at the top
of the file if they are not already imported.

- [ ] **Step 5: Write the media row on insert**

In `app/registry.py`, the anime spec already declares `pre_commit_hook`
(`prepare_anime_write`). Add the `media` row there so an insert writes both
tables in one transaction. In `app/services/domain/anime_write.py`, inside
`prepare_anime_write`, after the existing derivations:

```python
    from app.services.domain.display_name import compute_display_name

    existing = db.query(models.Media).filter_by(system_id=entry.system_id).first()
    if existing is None:
        db.add(
            models.Media(
                system_id=entry.system_id,
                media_type="anime",
                public_id=entry.public_id,
                display_name=compute_display_name(entry),
                cover_image_file=entry.cover_image_file,
                franchise_id=entry.franchise_id,
                series_id=entry.series_id,
            )
        )
    else:
        existing.display_name = compute_display_name(entry)
        existing.cover_image_file = entry.cover_image_file
        existing.franchise_id = entry.franchise_id
        existing.series_id = entry.series_id
```

- [ ] **Step 6: Run the migration and the tests**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m pytest tests/api/test_media_supertable.py -v
```
Expected: migration applies with no mismatch error; all four tests PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: no new failures.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/models/anime.py app/services/domain/anime_write.py \
        alembic/versions/m0a2anime_anime_to_media.py \
        tests/api/test_media_supertable.py docs/PROGRESS.md
```
Proposed message: `feat(media): back anime with a media row`
**Ask before running `git commit`.**

---

### Tasks 4–11: Port the remaining eight types

Each task is the shape of Task 3 with its own table, key, name columns and
`series_id` handling. **Do not read Task 3 and improvise** — each task below
gives its own migration constant and its own test, because the implementer may
be reading tasks out of order.

Every one of these tasks:

1. Adds a migration `m0a<N><key>_<table>_to_media.py` whose `down_revision` is
   the previous task's revision id.
2. Adds `media_type` plus `fk_<table>_media` and `ck_<table>_media_type` to the
   model's `__table_args__`.
3. Creates trigger `trg_<table>_delete_media` using the shared
   `delete_media_row()` function created in Task 3.
4. Adds a row-count assertion in the migration, as Task 3 does.
5. Writes the `media` row on insert. For the seven factory types this is a new
   `pre_commit_hook` on the type's `MediaTypeSpec` in `app/registry.py`;
   anime-movie already has none and gains one.
6. Extends `tests/api/test_media_supertable.py` with a parametrised case.

**Per-type facts. These are the only things that differ:**

**The name columns are NOT uniform across types.** Five types have five name
columns; four have only three, and `tv_shows` does not use the prefix its table
name suggests. Verified against `_name_fields` in each model on 2026-09-08:

| Task | Table | Key | Revision id | `DISPLAY_NAME` columns, **CN first** | `series_id` in backfill |
|---|---|---|---|---|---|
| 4 | `anime_movies` | `anime-movie` | `m0a3animemovie` | `anime_movie_name_cn/_en/_roman/_jp/_alt` (5) | `NULL` — **no such column** |
| 5 | `movies` | `movie` | `m0a4movie` | `movie_name_cn/_en/_alt` (**3**) | `series_id` |
| 6 | `tv_shows` | `tv-show` | `m0a5tvshow` | `tv_name_cn/_en/_alt` (**3, `tv_` not `tv_show_`**) | `series_id` |
| 7 | `cartoons` | `cartoon` | `m0a6cartoon` | `cartoon_name_cn/_en/_alt` (**3**) | `series_id` |
| 8 | `manga` | `manga` | `m0a7manga` | `manga_name_cn/_en/_roman/_jp/_alt` (5) | `series_id` |
| 9 | `novel` | `novel` | `m0a8novel` | `novel_name_cn/_en/_roman/_jp/_alt` (5) | `series_id` |
| 10 | `comic` | `comic` | `m0a9comic` | `comic_name_cn/_en/_alt` (**3**) | `series_id` |
| 11 | `games` | `game` | `m0b1game` | `game_name_cn/_en/_roman/_jp/_alt` (5) | `series_id` |

A `COALESCE` naming `tv_show_name_roman` — a column that does not exist — fails
the migration outright, which is the good case. The bad case is naming three of
five real columns and silently producing a worse `display_name` for entries
whose only name is Japanese.

**Before writing each migration, re-confirm against the model anyway.** Run
`grep -n "_name_fields" -A 8 app/models/<file>.py` and use exactly those columns,
reordered CN first. The model is authoritative; if it disagrees with this table,
fix the table and say so in the commit message.

**Task 4 is the one with a real difference.** `anime_movies` has no `series_id`
column, so its `INSERT ... SELECT` must select a literal `NULL` into
`media.series_id`:

```python
    op.execute(f"""
        INSERT INTO media (system_id, media_type, public_id, display_name,
                           cover_image_file, franchise_id, series_id,
                           created_at, updated_at)
        SELECT system_id, 'anime-movie', public_id, {DISPLAY_NAME},
               cover_image_file, franchise_id, NULL,
               COALESCE(created_at, now()), COALESCE(updated_at, now())
        FROM anime_movies
    """)
```

**The parametrised test each task extends**, added once in Task 4 and given a
new row by Tasks 5–11:

```python
# appended to tests/api/test_media_supertable.py
@pytest.mark.parametrize(
    "model, kwargs, key, expected_name",
    [
        (models.AnimeMovies, {"anime_movie_name_cn": "電影"}, "anime-movie", "電影"),
        (models.Movies, {"movie_name_cn": "電影二"}, "movie", "電影二"),
        (models.TVShows, {"tv_show_name_cn": "影集"}, "tv-show", "影集"),
        (models.Cartoon, {"cartoon_name_cn": "卡通"}, "cartoon", "卡通"),
        (models.Manga, {"manga_name_cn": "漫畫"}, "manga", "漫畫"),
        (models.Novel, {"novel_name_cn": "小說"}, "novel", "小說"),
        (models.Comic, {"comic_name_cn": "美漫"}, "comic", "美漫"),
        (models.Game, {"game_name_cn": "遊戲"}, "game", "遊戲"),
    ],
)
def test_every_type_gets_a_media_row(db, model, kwargs, key, expected_name):
    entry = model(**kwargs)
    db.add(entry)
    db.commit()

    m = db.query(models.Media).filter_by(system_id=entry.system_id).one()
    assert m.media_type == key
    assert m.display_name == expected_name


@pytest.mark.parametrize(
    "model, kwargs, table",
    [
        (models.AnimeMovies, {"anime_movie_name_cn": "刪除"}, "anime_movies"),
        (models.Movies, {"movie_name_cn": "刪除"}, "movies"),
        (models.TVShows, {"tv_show_name_cn": "刪除"}, "tv_shows"),
        (models.Cartoon, {"cartoon_name_cn": "刪除"}, "cartoons"),
        (models.Manga, {"manga_name_cn": "刪除"}, "manga"),
        (models.Novel, {"novel_name_cn": "刪除"}, "novel"),
        (models.Comic, {"comic_name_cn": "刪除"}, "comic"),
        (models.Game, {"game_name_cn": "刪除"}, "games"),
    ],
)
def test_deleting_the_detail_row_removes_its_media(db, model, kwargs, table):
    entry = model(**kwargs)
    db.add(entry)
    db.commit()
    sid = entry.system_id

    db.execute(text(f"DELETE FROM {table} WHERE system_id = :s"), {"s": sid})
    db.commit()

    assert db.query(models.Media).filter_by(system_id=sid).first() is None
```

Each task's steps are: write its parametrise row (red) → run it and see it fail
→ write the migration → update the model → add the write hook → `alembic upgrade
head` → run `tests/api/test_media_supertable.py` (green) → run `pytest -q` →
prepare the commit `feat(media): back <type> with a media row` and ask.

---

### Task 12: The constraint drift test

**Files:**
- Create: `tests/unit/test_media_constraints.py`

**Interfaces:**
- Consumes: every model ported in Tasks 3–11; `MEDIA_TABLES` in
  `app/utils/media_resolver.py`.
- Produces: the guard that makes adding a tenth media type safe.

This is the mitigation for the "eighteen constraints must stay in sync" sharp
edge in the spec. Alembic's autogenerate will not write a composite FK or a
CHECK, so nothing else catches a missing one.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_media_constraints.py
"""
Every media detail table must FK up to `media` on (system_id, media_type) and
pin its own type with a CHECK. Neither is autogenerated by Alembic, and a
missing one fails silently - a detail row could attach to a media row of the
wrong type, which is the thing the supertable exists to prevent.

Metadata only; no database.
"""

from sqlalchemy import CheckConstraint, ForeignKeyConstraint

from app.utils.media_resolver import MEDIA_TABLES


def test_every_media_table_has_its_composite_fk_and_check():
    missing = []
    for key, ref in MEDIA_TABLES.items():
        table = ref.model.__table__

        fks = [
            c for c in table.constraints
            if isinstance(c, ForeignKeyConstraint)
            and {col.name for col in c.columns} == {"system_id", "media_type"}
        ]
        if not fks:
            missing.append(f"{key}: no composite (system_id, media_type) FK")
        elif fks[0].name != f"fk_{table.name}_media":
            missing.append(f"{key}: FK named {fks[0].name!r}")

        checks = [
            c for c in table.constraints
            if isinstance(c, CheckConstraint)
            and c.name == f"ck_{table.name}_media_type"
        ]
        if not checks:
            missing.append(f"{key}: no ck_{table.name}_media_type")

    assert not missing, "\n".join(missing)


def test_every_media_table_declares_the_discriminator_column():
    for key, ref in MEDIA_TABLES.items():
        cols = ref.model.__table__.c
        assert "media_type" in cols, f"{key} has no media_type column"
        assert cols["media_type"].nullable is False
```

- [ ] **Step 2: Run it**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_media_constraints.py -v`
Expected: PASS if Tasks 3–11 were all done correctly. **If it fails, the
failure names the type that was missed — go back and fix that task, do not
weaken this test.**

- [ ] **Step 3: Add a database-level companion**

```python
# appended to tests/api/test_media_supertable.py
from sqlalchemy import text as _text


def test_every_media_table_has_its_delete_trigger_in_the_database(db):
    from app.utils.media_resolver import MEDIA_TABLES

    rows = db.execute(_text("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")).all()
    present = {r[0] for r in rows}
    for ref in MEDIA_TABLES.values():
        name = f"trg_{ref.model.__table__.name}_delete_media"
        assert name in present, f"missing trigger {name}"
```

- [ ] **Step 4: Run both and the full suite**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_media_constraints.py tests/api/test_media_supertable.py -v && venv/Scripts/python.exe -m pytest -q`
Expected: all PASS.

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add tests/unit/test_media_constraints.py tests/api/test_media_supertable.py \
        docs/PROGRESS.md
```
Proposed message: `test(media): pin the composite FK, CHECK and delete trigger on all nine types`
**Ask before running `git commit`.**

---

### Task 13: The `display_name` drift test

**Files:**
- Create: `tests/api/test_display_name_drift.py`

**Interfaces:**
- Consumes: `compute_display_name` (Task 2), the write hooks (Tasks 3–11).
- Produces: the guard for the spec's "single new bug class".

- [ ] **Step 1: Write the test**

```python
# tests/api/test_display_name_drift.py
"""
media.display_name is denormalized. This is the test that catches it going
stale - the one new class of bug the supertable introduces.
"""

import pytest

from app import models
from app.services.domain.display_name import compute_display_name
from app.utils.media_resolver import MEDIA_TABLES


@pytest.fixture
def db(db_session):
    return db_session


def test_renaming_an_entry_updates_its_media_display_name(db, admin_client):
    a = models.Anime(anime_name_cn="舊名")
    db.add(a)
    db.commit()

    r = admin_client.patch(f"/api/anime/{a.system_id}", json={"anime_name_cn": "新名"})
    assert r.status_code == 200

    db.expire_all()
    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    assert m.display_name == "新名"


def test_no_stored_display_name_has_drifted(db):
    """Walks every entry in the database. Catches a backfill that got it wrong."""
    drifted = []
    for key, ref in MEDIA_TABLES.items():
        for entry in db.query(ref.model).all():
            m = db.query(models.Media).filter_by(system_id=entry.system_id).first()
            if m is None:
                drifted.append(f"{key} {entry.system_id}: no media row")
                continue
            try:
                expected = compute_display_name(entry)
            except ValueError:
                continue  # unnamed entries get the migration's placeholder
            if m.display_name != expected:
                drifted.append(
                    f"{key} {entry.system_id}: stored {m.display_name!r} "
                    f"!= computed {expected!r}"
                )
    assert not drifted, "\n".join(drifted)
```

- [ ] **Step 2: Run it**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_display_name_drift.py -v`
Expected: PASS. A failure names the type whose write hook is missing or whose
backfill `COALESCE` order does not match `compute_display_name`.

- [ ] **Step 3: Prepare the commit and ask**

```bash
git add tests/api/test_display_name_drift.py docs/PROGRESS.md
```
Proposed message: `test(media): pin display_name against drift on write and in the backfill`
**Ask before running `git commit`.**

---

# Phase B — Convert the link tables

Six tables move from `(media_type, entry_id)` to `media_id`. Each is one task
with the same five steps; the differences are the table name and which service
reads it. **`note`, `meme` and `plan_next` are NOT in this phase** — their owner
may be a grouping tier, so they take the disjoint-FK treatment in the Step 5
plan.

### Task 14: `media_source`
### Task 15: `media_credit`
### Task 16: `media_tag`
### Task 17: `media_content_label`
### Task 18: `quote`
### Task 19: `watch_order_item`

**Files, per task:**
- Modify: `app/models/<the table's model file>`
- Create: `alembic/versions/m0c<N>_<table>_media_fk.py`
- Modify: the service that queries it — `app/services/domain/sources.py`,
  `credits.py`, `app/routers/content_labels.py`, `app/routers/quote.py`,
  `app/services/domain/watch_order.py` respectively
- Modify: `tests/api/test_entry_delete_links.py`

**Interfaces:**
- Consumes: `media` fully backfilled (Tasks 3–11).
- Produces: `<table>.media_id` replacing `<table>.media_type` +
  `<table>.entry_id`.

**The migration shape, shown for `media_source`.** Every task repeats it with
its own table name:

```python
def upgrade() -> None:
    op.add_column(
        "media_source",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # media.system_id equals the old entry_id: the backfill in Task 3 reused
    # each detail row's existing UUID, so this is a rename with a check.
    op.execute("""
        UPDATE media_source s
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = s.entry_id AND m.media_type = s.media_type
    """)

    orphans = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM media_source WHERE media_id IS NULL")
    ).scalar_one()
    if orphans:
        # These are rows the old FK-less pair allowed to outlive their entry -
        # exactly what this change exists to prevent. Report, then delete: they
        # reference nothing and cannot be migrated.
        op.execute("DELETE FROM media_source WHERE media_id IS NULL")

    op.alter_column("media_source", "media_id", nullable=False)
    op.create_foreign_key(
        "fk_media_source_media", "media_source", "media",
        ["media_id"], ["system_id"], ondelete="CASCADE",
    )
    op.drop_column("media_source", "media_type")
    op.drop_column("media_source", "entry_id")
```

**Steps, per task:**

- [ ] **Step 1:** In `tests/api/test_entry_delete_links.py`, replace that
  table's manual-cleanup assertion with a cascade assertion — delete the entry
  via `DELETE FROM media`, then assert the link rows are gone **without any
  service call having run**. Run it; it fails.
- [ ] **Step 2:** Write the migration above with this task's table name.
- [ ] **Step 3:** Update the model: drop `media_type` and `entry_id`, add
  `media_id` with `ForeignKey("media.system_id", ondelete="CASCADE")`.
- [ ] **Step 4:** Update the querying service. Every
  `filter_by(media_type=..., entry_id=...)` becomes `filter_by(media_id=...)`.
  Grep for the old pair to be sure none is left:
  `grep -rn "entry_id" app/ --include=*.py`.
- [ ] **Step 5:** Delete the now-dead manual cleanup for this table. For
  `media_credit` and `media_tag` that is the cleanup called from
  `app/routers/_factory.py`'s `delete`; for `media_source` it is in
  `app/services/domain/sources.py`.
- [ ] **Step 6:** `alembic upgrade head`, then
  `venv/Scripts/python.exe -m pytest tests/api/test_entry_delete_links.py -v`
  and `venv/Scripts/python.exe -m pytest -q`. Both green.
- [ ] **Step 7:** Prepare the commit `refactor(<table>): address entries by a real media FK` and ask.

---

# Phase C — Contract

One column at a time. Each task moves the read path onto `media` and drops the
detail-table copy **in the same commit**, so no column is ever writable in two
places.

### Task 20: `cover_image_file`

**Files:**
- Modify: `app/services/calculation.py:62-100` (`COVER_OWNER_TABLES`)
- Modify: the nine detail models, `app/schemas/*.py`
- Create: `alembic/versions/m0d1_drop_detail_cover.py`
- Modify: `tests/api/test_cover_image_bulk.py`

The nine media entries collapse into one `media` branch;
`staff`/`character`/`publisher`/`studio` keep their own, since they are not
media and their columns are named `photo_file` and `logo_file`.

- [ ] **Step 1:** Write a failing test asserting
  `bulk_check_unused_cover_images` finds a cover referenced only by a `media`
  row.
- [ ] **Step 2:** Run it; it fails.
- [ ] **Step 3:** Rewrite `COVER_OWNER_TABLES` as one `("media", Media,
  "cover_image_file")` entry plus the four entity rows.
- [ ] **Step 4:** Drop `cover_image_file` from the nine detail models and their
  schemas; the response field is now served from the joined `media` row.
- [ ] **Step 5:** Migration dropping the column from all nine tables.
- [ ] **Step 6:** `pytest -q`, `ruff check .`; then `cd frontend && npm run
  test:run && npm run lint && npm run build`.
- [ ] **Step 7:** Prepare the commit `refactor(media): serve covers from the supertable` and ask.

### Task 21: `franchise_id` and `series_id`

**Files:**
- Modify: `app/services/domain/hierarchy.py`
- Modify: the nine `resolve_*_parent_hierarchy` callables reached from
  `app/registry.py`
- Modify: `app/routers/franchise.py`, `app/routers/series.py`,
  `app/routers/collection.py`
- Modify: the nine detail models and their schemas in `app/schemas/`
- Create: `alembic/versions/m0d2_drop_detail_parents.py`
- Modify: `tests/api/test_franchise.py`, `tests/api/test_collection.py`

**Interfaces:**
- Consumes: `media.franchise_id` / `media.series_id`, backfilled in Tasks 3–11.
- Produces: `media` as the sole home of an entry's parent links. Task 22 and
  Step 3's `plan_next` work both rely on this.

**Read `app/services/domain/hierarchy.py` first.** It auto-creates a franchise
when an entry names none, and it is the single writer of these two columns. It
is the only place that needs to change on the write side; everything else reads.

- [ ] **Step 1: Write the failing test**

```python
# appended to tests/api/test_franchise.py
def test_franchise_members_are_found_through_media(db_session, admin_client,
                                                   sample_franchise):
    """
    A franchise's member list must come from media.franchise_id. Before this
    task it came from nine per-table columns; after it, one query answers for
    every type at once.
    """
    from app import models

    a = models.Anime(anime_name_cn="動畫成員", franchise_id=sample_franchise.system_id)
    g = models.Game(game_name_cn="遊戲成員", franchise_id=sample_franchise.system_id)
    db_session.add_all([a, g])
    db_session.commit()

    rows = (
        db_session.query(models.Media)
        .filter_by(franchise_id=sample_franchise.system_id)
        .all()
    )
    assert {r.media_type for r in rows} == {"anime", "game"}

    r = admin_client.get(f"/api/franchise/{sample_franchise.system_id}")
    assert r.status_code == 200
    names = {e["display_name"] for e in r.json()["entries"]}
    assert names == {"動畫成員", "遊戲成員"}


def test_an_entry_reports_its_parents_after_the_columns_move(db_session,
                                                             sample_series):
    from app import models

    a = models.Anime(anime_name_cn="子項", series_id=sample_series.system_id)
    db_session.add(a)
    db_session.commit()

    m = db_session.query(models.Media).filter_by(system_id=a.system_id).one()
    assert m.series_id == sample_series.system_id
    assert m.franchise_id == sample_series.franchise_id
```

The second assertion is deliberate: the hierarchy resolver fills a franchise
from the series when only a series is named, and that behaviour must survive the
move.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_franchise.py -k "through_media or after_the_columns_move" -v`
Expected: FAIL — the response has no `display_name`, and `media.franchise_id`
is not maintained on write for entries created through the ORM directly.

- [ ] **Step 3: Move the write side into the hierarchy resolver**

In `app/services/domain/hierarchy.py`, wherever `entry.franchise_id` and
`entry.series_id` are currently assigned, assign them on the entry's `media`
row instead. Keep one writer — do not set both.

- [ ] **Step 4: Move the read side**

Replace every `filter_by(franchise_id=...)` / `filter_by(series_id=...)` against
a detail model with the equivalent against `models.Media`. Find them all:

```bash
grep -rn "franchise_id\|series_id" app/routers/ app/services/ --include=*.py
```

The nine-way member lookups in `franchise.py`, `series.py` and `collection.py`
collapse into one `Media` query each. A collection's members are still reached
through `franchise.collection_id`, which is unchanged — collections do not
appear on `media`.

- [ ] **Step 5: Drop the columns from the models, schemas and database**

```python
# alembic/versions/m0d2_drop_detail_parents.py
def upgrade() -> None:
    for table in ("anime", "movies", "tv_shows", "cartoons", "manga",
                  "novel", "comic", "games"):
        op.drop_column(table, "series_id")
    for table in ("anime", "anime_movies", "movies", "tv_shows", "cartoons",
                  "manga", "novel", "comic", "games"):
        op.drop_column(table, "franchise_id")
    # anime_movies has no series_id: it never did. See the spec's per-type table.
```

Write the matching `downgrade()` that re-adds the columns and repopulates them
from `media` with raw SQL.

- [ ] **Step 6: Run the tests, the suite, and the frontend**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m pytest tests/api/test_franchise.py tests/api/test_collection.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green. The franchise and collection hub pages are the visible
surface here — open one on :5173 and confirm its member grid still fills.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/domain/hierarchy.py app/routers/franchise.py \
        app/routers/series.py app/routers/collection.py \
        alembic/versions/m0d2_drop_detail_parents.py \
        tests/api/test_franchise.py tests/api/test_collection.py \
        docs/PROGRESS.md
```
(plus the nine model files and their schemas — name each one explicitly.)
Proposed message: `refactor(media): hold franchise and series links on the supertable`
**Ask before running `git commit`.**

---

### Task 22: `public_id` and `entity_ref_filter`

**Task 22 is the highest-risk task in this plan.**
`app/utils/entity_ref.py:entity_ref_filter` builds `getattr(model, kind) ==
value`. Once `public_id` lives on `media`, that expression must resolve against
`media` for the nine media types and against the model itself for the other
eight entities.

- [ ] **Step 1:** Write failing tests hitting all nine detail routes by
  `public_id` and by `system_id`, plus one entity route (`/api/person/{id}`) to
  prove the non-media path is untouched.
- [ ] **Step 2:** Run them; the media ones fail.
- [ ] **Step 3:** Add `media_entity_ref_filter` to `app/utils/entity_ref.py`:

```python
def media_entity_ref_filter(model, ref: str):
    """
    A clause selecting the media row this reference names.

    Media entries keep their public_id on `media`, so a public_id reference
    resolves through a subquery against it. The eight non-media entities
    (person, studio, publisher, character, watch_order_list and the three
    grouping tiers) still hold their own public_id and keep using
    entity_ref_filter unchanged.
    """
    from app.models.media import Media

    kind, value = parse_entity_ref(ref)
    if kind == "system_id":
        return model.system_id == value
    return model.system_id.in_(
        select(Media.system_id).where(Media.public_id == value)
    )
```

Import `select` from `sqlalchemy` at the top of the file.

**Why a subquery and not a join:** `_get_or_404` builds
`db.query(spec.model).filter(ref)`, and callers downstream assume that query
returns detail rows only. A join would change the result shape and break them.

**Why filtering on `public_id` alone is safe here:** the query is already
scoped to one detail table, so it can only match that type's rows — the
`media_type` half of `uq_media_type_public_id` is implied by the table being
queried.

- [ ] **Step 4:** Point `app/routers/_factory.py:_get_or_404` at it:

```python
        try:
            ref = media_entity_ref_filter(spec.model, str(entry_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found")
```

Leave the eight non-media routers (`person.py`, `studio.py`, `publisher.py`,
`character.py`, `collection.py`, `franchise.py`, `series.py`,
`watch_order.py`) calling `entity_ref_filter`. A test in Step 1 proves one of
them still works.
- [ ] **Step 5:** Migration dropping `public_id` and its per-table unique
  constraint from the nine detail tables. **The per-table sequences stay** —
  `media.public_id` is still fed by `<table>_public_id_seq`, so existing ids and
  URLs do not change.
- [ ] **Step 6:** Full suite plus a manual check of one detail page on :5173.
- [ ] **Step 7:** Prepare the commit `refactor(media): resolve public_id through the supertable` and ask.

### Task 23: Keep Backup and Pull working

**Files:**
- Modify: `app/services/pipelines/tabs.py`
- Modify: `app/utils/data_control_utils.py`
- Modify: `tests/api/test_data_control_pull_tab.py`
- Create: `tests/api/test_media_tab_roundtrip.py`

**Interfaces:**
- Consumes: everything Tasks 20–22 dropped from the detail tables.
- Produces: a `Media` sheet tab. Step 4 extends the tab registry further; this
  task only keeps the existing workflow alive.

**Why this is in Step 0 and not Step 4.** `format_model_for_sheet` walks
`__table__.columns` in declaration order, so a tab's columns *are* its model's
columns. Tasks 20–22 drop `cover_image_file`, `franchise_id`, `series_id` and
`public_id` from all nine detail tables — which silently narrows all nine tabs
and drops those values out of the backup. `docs/switching-environments.md` makes
Sheets the only path data takes between the company and home machines, so a
Step 0 that ships without this strands the workflow until Step 4 lands.

- [ ] **Step 1: Write the failing round-trip test**

**Verify these symbols before writing the test** — an earlier draft of this plan
got both wrong:
- the by-name tab lookup is `TAB_BY_NAME` (`app/services/pipelines/tabs.py:145`),
  **not** `TAB_REGISTRY`
- `format_model_for_sheet` lives in `app/utils/formatter.py:39`, **not** in
  `app/utils/data_control_utils.py` (which holds only `log_data_control` and
  `log_deleted_record`)
- `SheetTab` already has `drop_columns` and `extra_columns`
  (`tabs.py:25-40`). Use `extra_columns` for the human-readable name — do
  **not** invent a `readonly_columns` field.

```python
# tests/api/test_media_tab_roundtrip.py
"""
Backup then Pull All must reproduce an entry exactly, including the four
columns that moved to `media`. Without the Media tab those values leave the
database and never come back.
"""

import pytest

from app import models
from app.services.pipelines.tabs import TAB_BY_NAME
from app.utils.formatter import format_model_for_sheet


@pytest.fixture
def db(db_session):
    return db_session


def test_media_tab_carries_the_moved_columns(db, sample_franchise):
    assert "Media" in TAB_BY_NAME, "no Media tab is registered"

    a = models.Anime(anime_name_cn="轉存測試", franchise_id=sample_franchise.system_id)
    db.add(a)
    db.commit()

    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    header = [c.name for c in models.Media.__table__.columns]
    row = format_model_for_sheet(m)

    for column in ("public_id", "display_name", "cover_image_file",
                   "franchise_id", "series_id", "media_type"):
        assert column in header, f"Media tab does not carry {column}"
    assert row[header.index("display_name")] == "轉存測試"


def test_media_tabs_carry_a_readable_display_name(db):
    """
    A human reads these tabs during an environment switch. The nine media tabs
    lost their name-bearing identity columns to `media`, so each appends
    display_name via extra_columns. It is written on Backup and ignored on Pull.
    """
    extras = dict(TAB_BY_NAME["Anime"].extra_columns)
    assert "display_name" in extras


def test_pull_ignores_a_header_that_is_not_a_column_on_the_model(db):
    """
    display_name is on the Anime tab but is NOT a column of Anime. pull.py
    keeps any parser key whose header appeared in the sheet and then calls
    Model(**payload), so without a guard this raises
    TypeError: 'display_name' is an invalid keyword argument for Anime.
    """
    from app.services.pipelines.pull import drop_non_columns

    payload = {"anime_name_cn": "測試", "display_name": "測試", "bogus": 1}
    assert drop_non_columns(models.Anime, payload) == {"anime_name_cn": "測試"}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_media_tab_roundtrip.py -v`
Expected: FAIL with `KeyError: 'Media'`.

- [ ] **Step 3: Register the `Media` tab**

Add a `Media` entry to the registry in `app/services/pipelines/tabs.py`,
following the shape of an existing tab (read the `Content Label` entry first —
it is the closest analogue, being a table with no detail page of its own).

- [ ] **Step 4: Append `display_name` to the nine media tabs and guard Pull**

Add it through the existing `extra_columns` mechanism, the same way `Media
Source` appends an option's `(category, value)`:

```python
    extra_columns=(
        ("display_name", lambda row, db: row.media.display_name if row.media else ""),
    ),
```

Then add the guard in `app/services/pipelines/pull.py`, because `pull.py` keeps
any parser key whose header appeared in the sheet and then calls
`Model(**payload)`:

```python
def drop_non_columns(model, payload: dict) -> dict:
    """
    Keep only keys that are real columns on `model`.

    A tab may carry columns for a human reader that are not the model's own -
    display_name is derived and lives on `media`. Without this, Pull passes it
    to Model(**payload) and TypeErrors the whole tab.
    """
    columns = {c.name for c in model.__table__.columns}
    return {k: v for k, v in payload.items() if k in columns}
```

**Call it in exactly one place: on `clean_header_dict` immediately before the
UPSERT branch at `app/services/pipelines/pull.py:985`.**

```python
        clean_header_dict = drop_non_columns(Model, clean_header_dict)

        # UPSERT LOGIC
        if existing is not None:
```

Not inside the `else:` arm. The branch has two arms and both consume the same
dict, but they fail differently:

- `pull.py:994` — `Model(**clean_header_dict)` raises `TypeError` and aborts the
  whole tab.
- `pull.py:989` — `setattr(existing, key, value)` raises **nothing**. SQLAlchemy
  lets you set any attribute on a mapped instance, so a stale header silently
  becomes a plain Python attribute that is never persisted. The row appears to
  update and does not.

Guarding only the insert arm therefore fixes the loud failure and leaves the
quiet one. There is no second construction site — the auto-created franchises
and series come from `resolve_*_parent_hierarchy`, which builds rows from
explicit keyword arguments and never sees `clean_header_dict`.

Add a test for the UPDATE path specifically; it is what pins the call site:

```python
def test_a_stale_header_is_dropped_on_the_update_path_too(db):
    """
    The UPDATE arm setattr()s every key. An unknown one does not raise - it
    silently becomes a non-persisted attribute - so only a guard placed before
    the UPSERT branch catches it.
    """
    a = models.Anime(anime_name_cn="更新測試")
    db.add(a)
    db.commit()

    cleaned = drop_non_columns(models.Anime, {"anime_name_cn": "改名", "display_name": "X"})
    for key, value in cleaned.items():
        setattr(a, key, value)
    db.commit()

    assert a.anime_name_cn == "改名"
    assert "display_name" not in cleaned
```

**This guard is required in Step 0, not Step 4.** Step 4 needs the same guard
for the personal columns leaving the models in Step 1, but Step 0 is what first
puts a non-column header on a media tab, so it lands here and Step 4 inherits
it.

- [ ] **Step 5: Pin the restore ordering**

`media` must be pulled **before** any of the nine media tabs, or their FK to
`media` rejects every row. Add the ordering to the registry explicitly and add
a test asserting `Media` precedes all nine.

- [ ] **Step 6: Run the pipeline tests and the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_media_tab_roundtrip.py tests/api/test_data_control_pull_tab.py -v
venv/Scripts/python.exe -m pytest -q
```
Expected: all PASS.

- [ ] **Step 7: Do a real round trip before committing**

Run Backup from `/system`, then Pull All, then
`venv/Scripts/python.exe -m pytest tests/api/test_display_name_drift.py -v`.
Expected: no drift, no row loss. **This is the one task in the plan where a
green test suite is not sufficient evidence — the sheet is the only copy of the
data.**

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/pipelines/tabs.py app/utils/data_control_utils.py \
        tests/api/test_media_tab_roundtrip.py \
        tests/api/test_data_control_pull_tab.py docs/data-actions.md \
        docs/PROGRESS.md
```
Proposed message: `feat(sheets): add the Media tab so Backup survives the column move`
**Ask before running `git commit`.**

---

### Task 24: Documentation

**Files:**
- Modify: `docs/data-model.md`, `docs/architecture.md`, `docs/testing.md`,
  `docs/PROGRESS.md`, `docs/roadmap.md`

- [ ] **Step 1:** Add a `media` section to `docs/data-model.md`, rewrite
  "Cross-table references without foreign keys" to cover only the three tables
  that still have them (`note`, `meme`, `plan_next`), and bump `Last verified`.
- [ ] **Step 2:** Record the promotion rule in `docs/data-model.md` so a future
  reader knows what may join `media`.
- [ ] **Step 3:** Note in `docs/roadmap.md` that Step 0 shipped.
- [ ] **Step 4:** Delete this plan's table from `docs/PROGRESS.md`.
- [ ] **Step 5:** Prepare the commit `docs: record the media supertable` and ask.

---

## Definition of done

- Nine detail tables each have exactly one `media` row per entry, verified by
  the row-count assertion in each migration and by
  `test_no_stored_display_name_has_drifted`.
- `DELETE FROM media WHERE system_id = …` removes the detail row and every link
  row, with no service code involved.
- `DELETE FROM anime WHERE …` removes the `media` row, via trigger.
- `grep -rn "entry_id" app/ --include=*.py` returns hits only in `note.py`,
  `meme.py` and `plan_next.py`.
- `SELECT * FROM media WHERE display_name ILIKE '%…%'` returns matches across
  all nine types.
- All four checks green; `alembic heads` shows one head.
- No user-visible behaviour changed.
