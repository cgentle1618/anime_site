# Step 1 — `user_media_list` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the personal columns off all nine media tables into one
`user_media_list` table keyed by `(user_id, media_id)`, so a second person's
opinion of a work has somewhere to go that is not a second copy of the work.

**Architecture:** Three phases, in order.

**Expand** creates `user_media_list`, backfills it from the nine detail tables
assigning every existing row to the admin user, and teaches `Viewer` who it is.
The detail tables keep every column they have, so nothing reads the new table
yet and no behaviour can change.

**Convert** builds the machinery — attach-on-read, split-on-write, join-on-filter
— behind a per-type opt-in flag `MediaTypeSpec.list_backed`, then flips one media
type at a time. Each type's flip and each type's `DROP COLUMN` land in the same
commit, so a personal column is never writable in two places at once. This is the
same discipline Step 0's contract phase used, and for the same reason: the
detail column and the list column are the same fact, and a window where both are
writable is a window where they disagree.

**Confine** finishes the job the schema started. `game_copy` gains `user_id`,
`novel_unit.my_rating` becomes `user_novel_unit_rating`, and the Fill / Replace /
Pull pipelines and their autofill hooks stop writing personal fields entirely —
enforced by a test, because a pipeline that can silently change someone's
`watching_status` is a data-loss bug the moment there are two users.

**The response schemas do not change.** `AnimeResponse.watching_status` still
exists and still carries a string; it is populated from the joined list row
instead of from a column. That is what makes this whole step invisible to the
SPA: **no frontend file is edited in this plan.**

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL 17, pytest, ruff;
React + Vite, TanStack Query, Tailwind v4, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-multi-user-catalog-design.md`
(Step 1 row of the Sub-projects table, and the `user_media_list` section).

**Runs after:** `docs/superpowers/plans/2026-09-08-step0-media-supertable.md`.
Task 1 consumes its interface contract. Do not start this plan until Step 0's
Definition of Done holds.

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
  in `frontend/`: `npm run test:run`, `npm run lint`. No task in this plan edits
  a frontend file, so `npm run build` is not needed; if a task ends up editing
  one anyway, run the build before claiming it done.
- **Migrations must never import `app.models`.** `docs/PROGRESS.md` records this
  as an open, unfixed defect class: a data migration that queries live ORM
  models SELECTs every column the model currently declares, so it breaks the
  moment a later migration adds one. Every backfill in this plan is **raw SQL
  via `op.execute`**, with column lists spelled out. No exceptions, and that
  includes looking the admin user up — `sa.text("SELECT id FROM users …")` on
  the connection, never `db.query(models.User)`.
- **One Alembic head.** Each task that adds a migration sets `down_revision` to
  the previous task's revision id. Run `venv/Scripts/python.exe -m alembic heads`
  before committing and confirm exactly one.
- **`alembic upgrade head` from an empty database is already broken** at
  `86982d71c2f1` (`docs/PROGRESS.md`, open item). Test migrations against a
  database restored from a Backup, not a fresh one, and do not treat that
  pre-existing failure as caused by this plan.
- **Give this session its own test database.** Concurrent sessions poison a
  shared `anime_site_test`. Export `POSTGRES_DB=anime_site_test_step1` before
  running pytest and record it in the `docs/PROGRESS.md` Environment table.
- **The session fixture is `db_session`, not `db`.** House convention for a
  short alias is a three-line module-local fixture, as in
  `tests/api/test_rewatch_entry_flags.py:15-17`:

```python
@pytest.fixture
def db(db_session):
    return db_session
```

- **Media-type keys are hyphenated in the data layer** (`anime-movie`,
  `tv-show`) and underscored only in router filenames and `MEDIA_REGISTRY` keys.
  Every `media_type` value written in this plan is hyphenated, matching
  `MEDIA_TABLES` and `spec.owner_type`. When in doubt use `spec.owner_type`,
  never `spec.key`.
- **Update the matching doc in the same change** and bump its `Last verified`
  line. This plan touches `docs/data-model.md`, `docs/data-actions.md`,
  `docs/business-rules.md` and `docs/api.md`.
- **Claim the task in `docs/PROGRESS.md`** (`wip <who>`) before starting; set it
  to `done <sha>` in the same commit as the work.
- **Back up before the first migration.** `/system` → Backup. These migrations
  drop columns holding years of personal ratings and progress; the sheet is the
  only copy, and Task 22 is what teaches the sheet to carry them again.

## Interface contract

Names every later task and every later plan (Steps 2–5) depends on. Do not
rename.

### Consumed from Step 0

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

Because `media.system_id` **is** the detail row's existing UUID, every
`user_media_list.media_id` in this plan is written as the detail row's
`system_id`, unchanged. No id is minted or translated anywhere in the backfill.

### Produced by this plan

```python
# app/models/user_media_list.py
class UserMediaList(Base):
    __tablename__ = "user_media_list"
    system_id: UUID       # PK
    user_id: UUID         # FK users.id ON DELETE CASCADE
    media_id: UUID        # FK media.system_id ON DELETE CASCADE
    status: str           # NOT NULL
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
```

Constraint and index names, used verbatim by the shape test in Task 1:

- `uq_user_media` — `UNIQUE (user_id, media_id)`
- `ix_user_media_list_user_status` — `INDEX (user_id, status)`
- `ix_user_media_list_media` — `INDEX (media_id)`

```python
# app/services/domain/user_list.py
LIST_FIELDS: dict[str, tuple[str, ...]]    # media_type -> payload keys living on the list row
STATUS_FIELD: dict[str, str]               # media_type -> "watching_status" | "reading_status" | "playing_status"
DEFAULT_STATUS: dict[str, str]             # media_type -> the NOT NULL default

def acting_user_id(db, viewer) -> UUID: ...
def list_row(db, user_id, media_id): ...
def ensure_list_row(db, user_id, media_id, media_type): ...
def attach_list_fields(db, media_type, entries, user_id) -> None: ...
def split_list_payload(media_type, payload) -> tuple[dict, dict]: ...
def apply_list_payload(row, list_payload, media_type) -> None: ...
def join_list(query, model, user_id): ...
```

```python
# app/services/domain/completion.py  — the per-user split
def mark_tv_catalog(entry) -> None: ...
def mark_tv_list(row, entry) -> None: ...
def mark_movie_catalog(entry) -> None: ...
def mark_movie_list(row, entry) -> None: ...
def mark_reading_catalog(entry) -> None: ...
def mark_reading_list(row, entry) -> None: ...
def mark_novel_catalog(entry) -> None: ...
def mark_novel_list(row, entry) -> None: ...
def mark_comic_catalog(entry) -> None: ...
def mark_comic_list(row, entry) -> None: ...
def mark_game_catalog(entry) -> None: ...
def mark_game_list(row, entry) -> None: ...
```

### Per-type facts

Every column below was read off the model file, not off the spec. Where the
spec and the code disagree the code wins, and the disagreements are called out
in "Where the spec was wrong" at the foot of this plan.

| Task | Table | `media_type` (hyphenated) | Registry key | Status column | Personal columns dropped | Revision id |
|---|---|---|---|---|---|---|
| 9 | `anime` | `anime` | `anime` | `watching_status` | `watching_status`, `my_rating`, `ep_fin`, `my_watch_day`, `completed_at` | `m1b1anime` |
| 10 | `anime_movies` | `anime-movie` | `anime_movie` | `watching_status` | `watching_status`, `my_rating`, `completed_at` | `m1b2animemovie` |
| 11 | `movies` | `movie` | `movie` | `watching_status` | `watching_status`, `my_rating`, `completed_at` | `m1b3movie` |
| 12 | `tv_shows` | `tv-show` | `tv_show` | `watching_status` | `watching_status`, `ep_fin`, `my_rating`, `completed_at` | `m1b4tvshow` |
| 13 | `cartoons` | `cartoon` | `cartoon` | `watching_status` | `watching_status`, `ep_fin`, `my_rating`, `completed_at` | `m1b5cartoon` |
| 14 | `manga` | `manga` | `manga` | `reading_status` | `reading_status`, `vol_fin`, `vol_fin_page`, `ch_fin`, `my_rating`, `completed_at` | `m1b6manga` |
| 15 | `novel` | `novel` | `novel` | `reading_status` | `reading_status`, `vol_fin`, `arc_fin`, `ch_fin`, `ch_fin_in_arc`, `progress_display`, `my_rating`, `completed_at` | `m1b7novel` |
| 16 | `comic` | `comic` | `comic` | `reading_status` | `issue_fin`, `reading_status`, `my_rating`, `completed_at` | `m1b8comic` |
| 17 | `games` | `game` | `game` | `playing_status` | `playing_status`, `my_rating`, `completed_at` | `m1b9game` |

`DEFAULT_STATUS` is `"Might Watch"` for the five watching types, `"Might Read"`
for manga / novel / comic, `"Might Play"` for game — copied from each model's
`default=` and from `pull.py:956-971`.

**Nullability of the source columns matters for the backfill.** On the detail
tables the three status columns are `NOT NULL`, so `status` is always present
and the `NOT NULL` on `user_media_list.status` can never be violated. But
`manga.vol_fin`, `manga.vol_fin_page`, `manga.ch_fin`, `novel.vol_fin`,
`novel.arc_fin`, `novel.ch_fin`, `novel.ch_fin_in_arc` and `comic.issue_fin` are
**`NOT NULL DEFAULT 0`**, while `anime.ep_fin`, `tv_shows.ep_fin` and
`cartoons.ep_fin` are **nullable with a Python-side default of 0**. On
`user_media_list` all of them are nullable, so the backfill copies the value as
it stands and a stored `0` stays `0` — it is not converted to `NULL`, because
"read zero chapters" and "never opened it" are the same thing today and
inventing a distinction during a migration would be a data change dressed up as
a move.

**Type widening in the backfill.** `manga.vol_fin` and `manga.ch_fin` are
`Integer` in the model; `user_media_list.vol_fin` and `ch_fin` are `Float`,
because `novel` counts in halves. PostgreSQL widens `integer` to `double
precision` implicitly on `INSERT … SELECT`, so no cast is written. The reverse
direction is the problem, and each downgrade below therefore rounds explicitly.

### Who the viewer is, before Step 2 exists

`Viewer` (`app/services/rbac/resolver.py:29-40`) carries a `username` but no
user id, so nothing can currently join "the viewer's list row". Task 4 adds
`Viewer.user_id`.

Until Step 2 ships real accounts, **`acting_user_id` falls back to the admin
user** for a guest or an unresolvable viewer. That is deliberate and it is what
keeps this step invisible: today's site has exactly one person's data, a
logged-out visitor sees it, and after this step a logged-out visitor still sees
it because they resolve to the same list. Step 2 replaces the fallback with
`None` and a public/private check; until then the fallback is the behaviour
contract, and Task 4's test pins it.

---

# Phase A — Expand

Nothing in this phase changes behaviour. `user_media_list` is written but never
read, and every detail table still holds its own personal columns.

### Task 1: The `user_media_list` model and its table

**Files:**
- Create: `app/models/user_media_list.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/m1a1umlist_create_user_media_list.py`
- Create: `tests/unit/test_user_media_list_model.py`

**Interfaces:**
- Consumes: `models.Media` (Step 0 Task 1), `models.User`
  (`app/models/system.py:251`).
- Produces: `models.UserMediaList` exactly as the interface contract spells it.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_user_media_list_model.py
"""The user_media_list table's shape. Pure metadata - no database."""

from app import models


def test_user_media_list_has_exactly_the_contracted_columns():
    cols = {c.name for c in models.UserMediaList.__table__.columns}
    assert cols == {
        "system_id", "user_id", "media_id", "status",
        "my_rating", "completed_at", "my_watch_day",
        "ep_fin", "vol_fin", "vol_fin_page", "ch_fin",
        "arc_fin", "ch_fin_in_arc", "progress_display", "issue_fin",
        "created_at", "updated_at",
    }


def test_the_three_identity_columns_are_not_nullable():
    t = models.UserMediaList.__table__
    assert t.c.user_id.nullable is False
    assert t.c.media_id.nullable is False
    assert t.c.status.nullable is False


def test_every_progress_column_is_nullable():
    """A game row leaves almost all of them null; that is the accepted shape."""
    t = models.UserMediaList.__table__
    for name in (
        "my_rating", "completed_at", "my_watch_day", "ep_fin", "vol_fin",
        "vol_fin_page", "ch_fin", "arc_fin", "ch_fin_in_arc",
        "progress_display", "issue_fin",
    ):
        assert t.c[name].nullable is True, name


def test_the_unique_constraint_and_both_indexes_are_named():
    t = models.UserMediaList.__table__
    assert "uq_user_media" in {c.name for c in t.constraints if c.name}
    index_names = {i.name for i in t.indexes}
    assert "ix_user_media_list_user_status" in index_names
    assert "ix_user_media_list_media" in index_names


def test_both_foreign_keys_cascade():
    t = models.UserMediaList.__table__
    targets = {
        list(fk.columns)[0].name: (fk.elements[0].target_fullname, fk.ondelete)
        for fk in t.foreign_key_constraints
    }
    assert targets["user_id"] == ("users.id", "CASCADE")
    assert targets["media_id"] == ("media.system_id", "CASCADE")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_user_media_list_model.py -v`
Expected: FAIL with `AttributeError: module 'app.models' has no attribute 'UserMediaList'`

- [ ] **Step 3: Write the model**

```python
# app/models/user_media_list.py
"""
One person's relationship with one media entry.

The whole point of the multi-user design: `anime` says what Frieren is, this
says what *you* did with it. One row per (user, media). Every column here was
on a detail table before Step 1 and is on none of them after.

The table is wide and null-heavy on purpose. A manga row leaves ep_fin and
issue_fin null; a game row leaves almost everything null. The alternative -
nine per-type list tables - turns "this user's list, all types, sorted by
rating" into a nine-way UNION ALL that grows with every media type added. One
wide table with real foreign keys is the better finished system, and the design
doc records the trade so it is not relitigated.

`status` is one column standing behind watching_status / reading_status /
playing_status. The vocabulary is still per-type and still comes from
system_option, so "Might Watch" stays invalid for a game; what is shared is the
column, not the values.
"""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class UserMediaList(Base):
    """One user's list row for one media entry."""

    __tablename__ = "user_media_list"
    __table_args__ = (
        UniqueConstraint("user_id", "media_id", name="uq_user_media"),
        # The list page's own query: one user, filtered by status.
        Index("ix_user_media_list_user_status", "user_id", "status"),
        # The detail page's community aggregate: one media, every user.
        Index("ix_user_media_list_media", "media_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # A real foreign key, not the (media_type, entry_id) pair the older link
    # tables use. This is the highest-row-count table in the system and a
    # deleted entry must not strand every user's record of it.
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=False,
    )

    status = Column(String, nullable=False)
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    my_watch_day = Column(String, nullable=True)          # anime only

    ep_fin = Column(Integer, nullable=True)               # anime, tv-show, cartoon
    # Float, not Integer: novel counts half volumes and half chapters. Manga's
    # integer values widen into it without a cast.
    vol_fin = Column(Float, nullable=True)                # manga, novel
    vol_fin_page = Column(Integer, nullable=True)         # manga
    ch_fin = Column(Float, nullable=True)                 # manga, novel
    arc_fin = Column(Float, nullable=True)                # novel
    ch_fin_in_arc = Column(Float, nullable=True)          # novel
    progress_display = Column(String, nullable=True)      # novel
    issue_fin = Column(Integer, nullable=True)            # comic

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
```

- [ ] **Step 4: Export it**

In `app/models/__init__.py`, in the same shape as its neighbours:

```python
from app.models.user_media_list import UserMediaList
```

and add `"UserMediaList"` to `__all__`.

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1a1umlist_create_user_media_list.py
"""Create user_media_list, empty and unreferenced.

Revision ID: m1a1umlist
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m1a1umlist"
# Step 0's last migration is the m0d1-series revision that drops public_id
# from the nine detail tables (Step 0, Task 22). Read the exact id with
# `venv/Scripts/python.exe -m alembic heads` and write it here.
down_revision: Union[str, Sequence[str], None] = "<Step 0 head, read from alembic heads>"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_media_list",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("my_watch_day", sa.String(), nullable=True),
        sa.Column("ep_fin", sa.Integer(), nullable=True),
        sa.Column("vol_fin", sa.Float(), nullable=True),
        sa.Column("vol_fin_page", sa.Integer(), nullable=True),
        sa.Column("ch_fin", sa.Float(), nullable=True),
        sa.Column("arc_fin", sa.Float(), nullable=True),
        sa.Column("ch_fin_in_arc", sa.Float(), nullable=True),
        sa.Column("progress_display", sa.String(), nullable=True),
        sa.Column("issue_fin", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_user_media_list_user", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["media_id"], ["media.system_id"],
            name="fk_user_media_list_media", ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "media_id", name="uq_user_media"),
    )
    op.create_index("ix_user_media_list_system_id", "user_media_list", ["system_id"])
    op.create_index(
        "ix_user_media_list_user_status", "user_media_list", ["user_id", "status"]
    )
    op.create_index("ix_user_media_list_media", "user_media_list", ["media_id"])


def downgrade() -> None:
    op.drop_index("ix_user_media_list_media", table_name="user_media_list")
    op.drop_index("ix_user_media_list_user_status", table_name="user_media_list")
    op.drop_index("ix_user_media_list_system_id", table_name="user_media_list")
    op.drop_table("user_media_list")
```

- [ ] **Step 6: Apply and verify**

```
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/unit/test_user_media_list_model.py -v
```
Expected: the migration applies; `alembic heads` prints exactly one head; all
five tests PASS.

- [ ] **Step 7: Run the full backend suite**

Run `venv/Scripts/python.exe -m pytest -q`, then `venv/Scripts/ruff.exe check .`
Expected: no new failures. The table is empty and nothing references it.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/models/user_media_list.py app/models/__init__.py \
        alembic/versions/m1a1umlist_create_user_media_list.py \
        tests/unit/test_user_media_list_model.py docs/PROGRESS.md
```
Proposed message: `feat(list): add user_media_list, empty and unreferenced`
**Ask before running `git commit`.**

---

### Task 2: `app/services/domain/user_list.py` — the whole list vocabulary, unwired

**Files:**
- Create: `app/services/domain/user_list.py`
- Modify: `app/services/domain/__init__.py`
- Create: `tests/unit/test_user_list_vocabulary.py`

**Interfaces:**
- Consumes: `models.UserMediaList` (Task 1).
- Produces: `LIST_FIELDS`, `STATUS_FIELD`, `DEFAULT_STATUS`,
  `split_list_payload`, `apply_list_payload`, `list_row`, `ensure_list_row`,
  `attach_list_fields`, `join_list`. Nothing calls them yet.

The three status columns collapse into one, so every caller needs a table
saying which payload key means `status` for which type, and which keys live on
the list row at all. That table is the single source of truth for Tasks 5–17
and it is written once, here, with unit tests, before any router touches it.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_user_list_vocabulary.py
"""LIST_FIELDS / STATUS_FIELD / split_list_payload. Pure functions, no DB."""

import pytest

from app.services.domain.user_list import (
    DEFAULT_STATUS,
    LIST_FIELDS,
    STATUS_FIELD,
    split_list_payload,
)


def test_all_nine_hyphenated_media_types_are_present():
    expected = {
        "anime", "anime-movie", "movie", "tv-show", "cartoon",
        "manga", "novel", "comic", "game",
    }
    assert set(LIST_FIELDS) == expected
    assert set(STATUS_FIELD) == expected
    assert set(DEFAULT_STATUS) == expected


@pytest.mark.parametrize(
    "media_type, status_field, default",
    [
        ("anime", "watching_status", "Might Watch"),
        ("anime-movie", "watching_status", "Might Watch"),
        ("movie", "watching_status", "Might Watch"),
        ("tv-show", "watching_status", "Might Watch"),
        ("cartoon", "watching_status", "Might Watch"),
        ("manga", "reading_status", "Might Read"),
        ("novel", "reading_status", "Might Read"),
        ("comic", "reading_status", "Might Read"),
        ("game", "playing_status", "Might Play"),
    ],
)
def test_status_field_and_default_per_type(media_type, status_field, default):
    assert STATUS_FIELD[media_type] == status_field
    assert DEFAULT_STATUS[media_type] == default


@pytest.mark.parametrize(
    "media_type, expected",
    [
        ("anime", ("watching_status", "my_rating", "ep_fin", "my_watch_day", "completed_at")),
        ("anime-movie", ("watching_status", "my_rating", "completed_at")),
        ("movie", ("watching_status", "my_rating", "completed_at")),
        ("tv-show", ("watching_status", "my_rating", "ep_fin", "completed_at")),
        ("cartoon", ("watching_status", "my_rating", "ep_fin", "completed_at")),
        ("manga", ("reading_status", "my_rating", "vol_fin", "vol_fin_page",
                   "ch_fin", "completed_at")),
        ("novel", ("reading_status", "my_rating", "vol_fin", "arc_fin", "ch_fin",
                   "ch_fin_in_arc", "progress_display", "completed_at")),
        ("comic", ("reading_status", "my_rating", "issue_fin", "completed_at")),
        ("game", ("playing_status", "my_rating", "completed_at")),
    ],
)
def test_list_fields_per_type(media_type, expected):
    assert set(LIST_FIELDS[media_type]) == set(expected)


def test_every_list_field_except_the_status_alias_is_a_real_column():
    from app import models

    columns = set(models.UserMediaList.__table__.columns.keys())
    for media_type, fields in LIST_FIELDS.items():
        for field in fields:
            if field == STATUS_FIELD[media_type]:
                continue
            assert field in columns, f"{media_type}.{field}"


def test_split_list_payload_separates_the_two_kinds_of_fact():
    payload = {
        "anime_name_cn": "葬送的芙莉蓮",
        "ep_total": 28,
        "watching_status": "Completed",
        "my_rating": "9.5",
        "ep_fin": 28,
    }
    catalog, personal = split_list_payload("anime", payload)
    assert catalog == {"anime_name_cn": "葬送的芙莉蓮", "ep_total": 28}
    assert personal == {
        "watching_status": "Completed", "my_rating": "9.5", "ep_fin": 28,
    }


def test_split_list_payload_leaves_the_input_untouched():
    payload = {"ep_total": 12, "my_rating": "8"}
    split_list_payload("anime", payload)
    assert payload == {"ep_total": 12, "my_rating": "8"}


def test_split_list_payload_keeps_a_types_own_keys_only():
    """ep_fin is a movie's nothing: it must stay in the catalogue half so the
    normal unknown-column error fires instead of being silently swallowed."""
    catalog, personal = split_list_payload("movie", {"ep_fin": 3, "my_rating": "7"})
    assert catalog == {"ep_fin": 3}
    assert personal == {"my_rating": "7"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_user_list_vocabulary.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.domain.user_list'`

- [ ] **Step 3: Write the service**

```python
# app/services/domain/user_list.py
"""
Reading and writing one user's list row.

Step 1 moved the personal columns off the nine detail tables into
user_media_list. The response schemas did not change - AnimeResponse still
declares watching_status, my_rating and ep_fin - so something has to put those
values back on the ORM instance before it is serialized, and take them back off
a write payload before it is applied to the detail model. That is this module.

The three status columns collapse into one `status`, so every function here is
keyed by the hyphenated media type: STATUS_FIELD says which payload key means
`status` for this type, LIST_FIELDS says which keys live on the list row at
all. Nothing else in the codebase may hard-code that mapping.
"""

import uuid
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.database import get_taipei_now

# Which payload key carries the status, per hyphenated media type.
STATUS_FIELD: dict[str, str] = {
    "anime": "watching_status",
    "anime-movie": "watching_status",
    "movie": "watching_status",
    "tv-show": "watching_status",
    "cartoon": "watching_status",
    "manga": "reading_status",
    "novel": "reading_status",
    "comic": "reading_status",
    "game": "playing_status",
}

# The NOT NULL default each detail column carried before it moved. Copied from
# the models and from pull.py's insert defaults; a new list row starts here.
DEFAULT_STATUS: dict[str, str] = {
    "anime": "Might Watch",
    "anime-movie": "Might Watch",
    "movie": "Might Watch",
    "tv-show": "Might Watch",
    "cartoon": "Might Watch",
    "manga": "Might Read",
    "novel": "Might Read",
    "comic": "Might Read",
    "game": "Might Play",
}

# Every payload key that lives on the list row, per type. The status key is
# included and is translated to `status` on the way in and back on the way out.
LIST_FIELDS: dict[str, tuple[str, ...]] = {
    "anime": ("watching_status", "my_rating", "ep_fin", "my_watch_day", "completed_at"),
    "anime-movie": ("watching_status", "my_rating", "completed_at"),
    "movie": ("watching_status", "my_rating", "completed_at"),
    "tv-show": ("watching_status", "my_rating", "ep_fin", "completed_at"),
    "cartoon": ("watching_status", "my_rating", "ep_fin", "completed_at"),
    "manga": (
        "reading_status", "my_rating", "vol_fin", "vol_fin_page", "ch_fin",
        "completed_at",
    ),
    "novel": (
        "reading_status", "my_rating", "vol_fin", "arc_fin", "ch_fin",
        "ch_fin_in_arc", "progress_display", "completed_at",
    ),
    "comic": ("reading_status", "my_rating", "issue_fin", "completed_at"),
    "game": ("playing_status", "my_rating", "completed_at"),
}


def acting_user_id(db: Session, viewer) -> Optional[UUID]:
    """
    Whose list the request reads and writes.

    Until Step 2 ships real accounts there is exactly one person's data and a
    logged-out visitor sees it, so an unresolved viewer falls back to the admin
    user rather than to nothing. Removing that fallback IS Step 2; keeping it
    here is what makes Step 1 invisible to the SPA and to a guest.
    """
    if viewer is not None and getattr(viewer, "user_id", None) is not None:
        return viewer.user_id
    admin = (
        db.query(models.User)
        .join(models.Role, models.User.role_id == models.Role.system_id)
        .filter(models.Role.name == "admin")
        .order_by(models.User.username)
        .first()
    )
    return admin.id if admin is not None else None


def list_row(db: Session, user_id: Optional[UUID], media_id: UUID):
    """One user's row for one entry, or None. Never creates."""
    if user_id is None:
        return None
    return (
        db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.user_id == user_id,
            models.UserMediaList.media_id == media_id,
        )
        .first()
    )


def ensure_list_row(db: Session, user_id: UUID, media_id: UUID, media_type: str):
    """
    The user's row for this entry, created at the type's default status if it
    does not exist. Added to the session but not committed - the caller owns
    the transaction, exactly as upsert_remark does.
    """
    row = list_row(db, user_id, media_id)
    if row is not None:
        return row
    row = models.UserMediaList(
        system_id=uuid.uuid4(),
        user_id=user_id,
        media_id=media_id,
        status=DEFAULT_STATUS[media_type],
    )
    db.add(row)
    db.flush()
    return row


def _rows_by_media(db: Session, user_id: Optional[UUID], media_ids: list[UUID]) -> dict:
    """One query for a whole page of entries, never one per entry."""
    if user_id is None or not media_ids:
        return {}
    rows = (
        db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.user_id == user_id,
            models.UserMediaList.media_id.in_(media_ids),
        )
        .all()
    )
    return {row.media_id: row for row in rows}


def attach_list_fields(db: Session, media_type: str, entries, user_id) -> None:
    """
    Put the viewer's personal values back on the ORM instances before they are
    serialized.

    The response schema reads from attributes and the columns are gone, so the
    values have to be set on the object - the same trick attach_plan_flag uses
    for its virtual flags. A plain instance attribute is enough; SQLAlchemy
    does not manage it.

    An entry the viewer has no list row for gets the type's default status and
    None for everything else, which is exactly what the detail row used to
    hold for an untouched entry.
    """
    if isinstance(entries, Iterable) and not hasattr(entries, "system_id"):
        items = list(entries)
    else:
        items = [entries]
    if not items:
        return
    rows = _rows_by_media(db, user_id, [e.system_id for e in items])
    status_field = STATUS_FIELD[media_type]
    fields = LIST_FIELDS[media_type]
    for entry in items:
        row = rows.get(entry.system_id)
        for field in fields:
            if field == status_field:
                value = row.status if row is not None else DEFAULT_STATUS[media_type]
            else:
                value = getattr(row, field) if row is not None else None
            setattr(entry, field, value)


def split_list_payload(media_type: str, payload: dict) -> tuple[dict, dict]:
    """
    Split a write payload into (catalogue keys, personal keys).

    A key this type does not own stays in the catalogue half deliberately: it
    then hits the model the way it always did and raises the usual unknown-
    column error, instead of being silently dropped into a list row that has
    no meaning for it.
    """
    fields = set(LIST_FIELDS[media_type])
    catalog = {k: v for k, v in payload.items() if k not in fields}
    personal = {k: v for k, v in payload.items() if k in fields}
    return catalog, personal


def apply_list_payload(row, personal: dict, media_type: str) -> None:
    """Apply a personal payload to a list row, translating the status key."""
    status_field = STATUS_FIELD[media_type]
    for key, value in personal.items():
        if key == status_field:
            # A status is NOT NULL; a payload explicitly clearing it falls
            # back to the type's default rather than failing at COMMIT.
            row.status = value if value is not None else DEFAULT_STATUS[media_type]
        else:
            setattr(row, key, value)
    row.updated_at = get_taipei_now()


def join_list(query, model, user_id: Optional[UUID]):
    """
    Outer-join the viewer's list rows onto a media query so a filter or an
    order_by can name a personal column.

    OUTER, not inner: an entry the viewer has never touched has no row and
    must still appear in the catalogue listing. Filters that compare against a
    status therefore have to allow for NULL - see _factory's list_entries.
    """
    if user_id is None:
        return query
    return query.outerjoin(
        models.UserMediaList,
        (models.UserMediaList.media_id == model.system_id)
        & (models.UserMediaList.user_id == user_id),
    )
```

- [ ] **Step 4: Export the names**

In `app/services/domain/__init__.py`, alongside the existing re-exports:

```python
from app.services.domain.user_list import (
    DEFAULT_STATUS,
    LIST_FIELDS,
    STATUS_FIELD,
    acting_user_id,
    apply_list_payload,
    attach_list_fields,
    ensure_list_row,
    join_list,
    list_row,
    split_list_payload,
)
```

and add each name to `__all__`.

- [ ] **Step 5: Run the test green**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_user_list_vocabulary.py -v`
Expected: all cases PASS.

- [ ] **Step 6: Run the checks**

```
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
```
Expected: clean; no new failures. Nothing imports the new module yet except the
test.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/domain/user_list.py app/services/domain/__init__.py \
        tests/unit/test_user_list_vocabulary.py docs/PROGRESS.md
```
Proposed message: `feat(list): add the user_list service, the single mapping from personal fields to list rows`
**Ask before running `git commit`.**

---

### Task 3: The backfill — every existing row becomes the admin's list row

**Files:**
- Create: `alembic/versions/m1a2umbackfill_backfill_user_media_list.py`
- Create: `tests/services/test_user_media_list_backfill.py`

**Interfaces:**
- Consumes: `user_media_list` (Task 1), `media` and its nine backfilled rows
  (Step 0), `users`.
- Produces: one `user_media_list` row per existing entry, owned by the admin.

**This migration imports nothing from `app.models`.** Every statement is raw
SQL through `op.execute`, with the column list spelled out, and the admin id is
read with `sa.text` on the connection. `docs/PROGRESS.md` records why: a data
migration that queries live ORM models SELECTs every column the model currently
declares, so it breaks the moment a later migration adds one.

**It runs before any column is dropped**, so if it is wrong the detail tables
still hold the truth and it can be re-run after a `DELETE FROM user_media_list`.
The nine `DROP COLUMN` migrations in Phase B are the point of no return.

- [ ] **Step 1: Write the failing test**

This one asserts on data the migration produced, so it runs against the real
dev database rather than the test schema. Guard it so it skips when the table
is empty, which is the case in CI and in a fresh test database.

```python
# tests/services/test_user_media_list_backfill.py
"""
The step-1 backfill, checked against whatever database the suite is pointed at.

Skips when user_media_list is empty: CI and a freshly reset test schema have no
migrated data to check, and a green run there would be meaningless rather than
reassuring. Run it against the dev database right after `alembic upgrade head`.
"""

import pytest
from sqlalchemy import create_engine, text

from app.database import SQLALCHEMY_DATABASE_URL

NINE = [
    ("anime", "watching_status"),
    ("anime_movies", "watching_status"),
    ("movies", "watching_status"),
    ("tv_shows", "watching_status"),
    ("cartoons", "watching_status"),
    ("manga", "reading_status"),
    ("novel", "reading_status"),
    ("comic", "reading_status"),
    ("games", "playing_status"),
]


@pytest.fixture(scope="module")
def conn():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as c:
        total = c.execute(text("SELECT count(*) FROM user_media_list")).scalar_one()
        if total == 0:
            pytest.skip("user_media_list is empty; nothing was backfilled here")
        yield c


def test_every_media_row_has_exactly_one_list_row(conn):
    media_count = conn.execute(text("SELECT count(*) FROM media")).scalar_one()
    list_count = conn.execute(text("SELECT count(*) FROM user_media_list")).scalar_one()
    assert list_count == media_count


def test_the_unique_constraint_holds(conn):
    dupes = conn.execute(
        text(
            "SELECT count(*) FROM ("
            "  SELECT user_id, media_id FROM user_media_list"
            "  GROUP BY user_id, media_id HAVING count(*) > 1"
            ") d"
        )
    ).scalar_one()
    assert dupes == 0


def test_every_list_row_belongs_to_the_admin(conn):
    others = conn.execute(
        text(
            "SELECT count(*) FROM user_media_list l "
            "JOIN users u ON u.id = l.user_id "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name <> 'admin'"
        )
    ).scalar_one()
    assert others == 0


def test_no_list_row_has_a_null_or_blank_status(conn):
    bad = conn.execute(
        text(
            "SELECT count(*) FROM user_media_list "
            "WHERE status IS NULL OR btrim(status) = ''"
        )
    ).scalar_one()
    assert bad == 0
```

- [ ] **Step 2: Run it and see it skip or fail**

Run: `venv/Scripts/python.exe -m pytest tests/services/test_user_media_list_backfill.py -v`
Expected before the migration: every test SKIPS (`user_media_list` is empty).
That skip is the red state for this task — it is the migration that makes the
assertions run at all.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m1a2umbackfill_backfill_user_media_list.py
"""Backfill user_media_list from the nine detail tables, all to the admin.

Raw SQL only. Importing app.models here would SELECT every column those models
declare today and break the moment a later migration adds one - the open defect
class recorded in docs/PROGRESS.md.

Revision ID: m1a2umbackfill
Revises: m1a1umlist
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1a2umbackfill"
down_revision: Union[str, Sequence[str], None] = "m1a1umlist"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, status column, extra target columns, extra source expressions).
# The four always-present columns - status, my_rating, completed_at and the
# timestamps - are written for every type; these are the per-type additions.
BACKFILL = [
    ("anime", "watching_status", "my_watch_day, ep_fin", "my_watch_day, ep_fin"),
    ("anime_movies", "watching_status", "", ""),
    ("movies", "watching_status", "", ""),
    ("tv_shows", "watching_status", "ep_fin", "ep_fin"),
    ("cartoons", "watching_status", "ep_fin", "ep_fin"),
    ("manga", "reading_status", "vol_fin, vol_fin_page, ch_fin",
     "vol_fin, vol_fin_page, ch_fin"),
    ("novel", "reading_status",
     "vol_fin, arc_fin, ch_fin, ch_fin_in_arc, progress_display",
     "vol_fin, arc_fin, ch_fin, ch_fin_in_arc, progress_display"),
    ("comic", "reading_status", "issue_fin", "issue_fin"),
    ("games", "playing_status", "", ""),
]


def upgrade() -> None:
    conn = op.get_bind()

    # The lowest-numbered admin by username, so the choice is deterministic on
    # a database that somehow has two. A database with no admin cannot be
    # backfilled and must fail loudly rather than silently skip everyone's data.
    admin_id = conn.execute(
        sa.text(
            "SELECT u.id FROM users u "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name = 'admin' ORDER BY u.username LIMIT 1"
        )
    ).scalar()
    if admin_id is None:
        raise RuntimeError(
            "No admin user found; user_media_list cannot be backfilled. "
            "Create the admin account first, then re-run this migration."
        )

    for table, status_col, extra_targets, extra_sources in BACKFILL:
        targets = "system_id, user_id, media_id, status, my_rating, completed_at"
        sources = f"gen_random_uuid(), :uid, system_id, {status_col}, my_rating, completed_at"
        if extra_targets:
            targets = f"{targets}, {extra_targets}"
            sources = f"{sources}, {extra_sources}"
        targets = f"{targets}, created_at, updated_at"
        sources = f"{sources}, COALESCE(created_at, now()), COALESCE(updated_at, now())"
        conn.execute(
            sa.text(
                f"INSERT INTO user_media_list ({targets}) "
                f"SELECT {sources} FROM {table}"
            ).bindparams(uid=admin_id)
        )

    # Every entry must have got exactly one row. A mismatch means a detail
    # table gained or lost rows between Step 0's media backfill and this one,
    # and continuing would silently lose somebody's ratings.
    media_count = conn.execute(sa.text("SELECT count(*) FROM media")).scalar_one()
    list_count = conn.execute(
        sa.text("SELECT count(*) FROM user_media_list")
    ).scalar_one()
    if media_count != list_count:
        raise RuntimeError(
            f"user_media_list backfill wrote {list_count} rows for "
            f"{media_count} media rows; refusing to continue."
        )


def downgrade() -> None:
    # The detail columns still exist at this revision - nothing has been
    # dropped yet - so the rows are pure duplication and can simply go.
    op.execute("DELETE FROM user_media_list")
```

- [ ] **Step 4: Apply it against a database with data**

```
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
```
Expected: applies without raising; exactly one head.

- [ ] **Step 5: Run the backfill test green against the dev database**

Run: `venv/Scripts/python.exe -m pytest tests/services/test_user_media_list_backfill.py -v`
Expected: four tests PASS (no longer skipped).

- [ ] **Step 6: Spot-check one entry by hand**

Pick an anime you know the rating of and compare both sides:

```sql
SELECT a.anime_name_cn, a.watching_status, a.my_rating, a.ep_fin,
       l.status, l.my_rating, l.ep_fin
FROM anime a JOIN user_media_list l ON l.media_id = a.system_id
ORDER BY a.updated_at DESC LIMIT 5;
```
Expected: the three pairs match on every row.

- [ ] **Step 7: Exercise the downgrade and re-upgrade**

```
venv/Scripts/python.exe -m alembic downgrade -1
venv/Scripts/python.exe -m alembic upgrade head
```
Expected: the row count comes back to the same number both times.

- [ ] **Step 8: Run the checks**

```
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
```
Expected: no new failures.

- [ ] **Step 9: Prepare the commit and ask**

```bash
git add alembic/versions/m1a2umbackfill_backfill_user_media_list.py \
        tests/services/test_user_media_list_backfill.py docs/PROGRESS.md
```
Proposed message: `feat(list): backfill user_media_list from the nine detail tables, all to the admin`
**Ask before running `git commit`.**

---

### Task 4: `Viewer.user_id`

**Files:**
- Modify: `app/services/rbac/resolver.py`
- Create: `tests/api/test_viewer_user_id.py`

**Interfaces:**
- Consumes: `models.User`.
- Produces: `Viewer.user_id: Optional[UUID]`, set for a resolved login and
  `None` for a guest. `acting_user_id` (Task 2) already reads it.

`Viewer` carries a `username` and no id, so nothing can join "this viewer's
list row" without a second query per request. One field fixes that, and the
resolver already has the `User` row in hand at
`app/services/rbac/resolver.py:84-90`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_viewer_user_id.py
"""Viewer carries the resolved user's id, so a list row can be joined."""

import uuid

import pytest
from fastapi import Request

from app import models
from app.services.rbac.resolver import resolve_viewer
from app.services.domain.user_list import acting_user_id
from app.services.security import create_access_token, get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


def _request(token=None) -> Request:
    headers = []
    if token is not None:
        headers.append((b"cookie", f"access_token=Bearer {token}".encode()))
    return Request({"type": "http", "headers": headers, "method": "GET", "path": "/"})


@pytest.fixture
def an_admin(db):
    user = models.User(
        id=uuid.uuid4(),
        username="viewer_id_admin",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "admin"),
    )
    db.add(user)
    db.flush()
    return user


def test_a_logged_in_viewer_carries_its_user_id(db, an_admin):
    token = create_access_token({"sub": "viewer_id_admin", "role": "admin"})
    viewer = resolve_viewer(_request(token), db)
    assert viewer.user_id == an_admin.id


def test_a_guest_viewer_has_no_user_id(db):
    viewer = resolve_viewer(_request(), db)
    assert viewer.user_id is None


def test_acting_user_id_falls_back_to_the_admin_for_a_guest(db, an_admin):
    """Until step 2, a guest reads the admin's list - that is what keeps this
    step invisible on the public pages."""
    viewer = resolve_viewer(_request(), db)
    assert acting_user_id(db, viewer) == an_admin.id
```

- [ ] **Step 2: Run it and see it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_viewer_user_id.py -v`
Expected: FAIL with `AttributeError: 'Viewer' object has no attribute 'user_id'`

- [ ] **Step 3: Add the field**

In `app/services/rbac/resolver.py`, inside the `Viewer` dataclass, after
`username`:

```python
    # The resolved user's id, so a request can join their user_media_list row
    # without a second lookup. None for a guest - see user_list.acting_user_id
    # for what a guest reads until step 2 ships accounts.
    user_id: Optional[UUID] = None
```

`GUEST_FALLBACK` needs no change: `user_id` defaults to `None`. In
`resolve_viewer`, add one keyword to the constructed `Viewer`:

```python
        return Viewer(
            username=user.username if user else None,
            user_id=user.id if user else None,
            role_id=role.system_id,
            role_name=role.name,
            is_superuser=bool(role.is_superuser),
            permissions=cache.permissions_for(db, role.system_id),
            token_payload=payload,
        )
```

`Viewer` is `frozen=True` and every other field is keyword-passed at both
construction sites, so a defaulted field added after `username` is safe. Check
`GUEST_FALLBACK` still constructs by keyword before moving on.

- [ ] **Step 4: Run the test green**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_viewer_user_id.py -v`
Expected: three tests PASS.

- [ ] **Step 5: Run the checks**

```
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
```
Expected: no new failures. Nothing reads `user_id` outside the new test yet.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/services/rbac/resolver.py tests/api/test_viewer_user_id.py \
        docs/PROGRESS.md
```
Proposed message: `feat(rbac): carry the resolved user's id on Viewer`
**Ask before running `git commit`.**

---

# Phase B — Convert, one media type at a time

Tasks 5–7 build the machinery behind an opt-in flag, `MediaTypeSpec.list_backed`,
which starts `False` for all nine types. Nothing changes until Task 9 sets it on
`anime`. Tasks 9–17 flip one type each and drop that type's columns **in the
same commit**, so a personal column is never writable in two places at once.

The flag exists because the alternative is a nine-table migration with the
routers, the pipelines and the completion services all attached, which is
exactly where the spec says this goes wrong.

### Task 5: `list_backed` and the read path

**Files:**
- Modify: `app/registry.py`
- Modify: `app/routers/_factory.py`
- Create: `tests/api/test_list_backed_reads.py`

**Interfaces:**
- Consumes: `attach_list_fields`, `acting_user_id`, `join_list`, `LIST_FIELDS`,
  `STATUS_FIELD` (Task 2); `Viewer.user_id` (Task 4).
- Produces: `MediaTypeSpec.list_backed: bool = False`; a `_factory` read path
  that serves personal fields from the list row for any type where it is True.

Two read paths need it. `get_one` serializes one entry; `list_entries`
serializes a page **and** applies `spec.list_filters`, which today resolves
every filter name against `spec.model.__table__.columns`
(`app/routers/_factory.py:135-141`). Five of the nine types name a status
column in `list_filters` — `anime_movie`, `movie`, `tv_show`, `cartoon`,
`manga`, `novel`, `comic` and `game` all do; only `anime` does not — so a
filter that stops resolving is an immediate 500 on the type's list page.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_list_backed_reads.py
"""
Reads served from user_media_list.

Parametrised over nothing yet: anime is the only list-backed type until Task 9,
and these tests are what Task 9 turns green. They are written here so the
machinery lands red-first, as the project rule requires.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def anime_with_list_row(db, admin_client, sample_franchise):
    """One anime plus the acting user's list row saying Completed / 9.5 / 28."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="List Backed Sentinel",
        airing_type="TV",
        ep_total=28,
    )
    db.add(entry)
    db.flush()
    user_id = acting_user_id(db, None)
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=user_id,
            media_id=entry.system_id,
            status="Completed",
            my_rating="9.5",
            ep_fin=28,
            my_watch_day="Friday",
        )
    )
    db.flush()
    return entry


def test_get_one_serves_the_personal_fields_from_the_list_row(
    admin_client, anime_with_list_row
):
    body = admin_client.get(f"/api/anime/{anime_with_list_row.system_id}").json()
    assert body["watching_status"] == "Completed"
    assert body["my_rating"] == "9.5"
    assert body["ep_fin"] == 28
    assert body["my_watch_day"] == "Friday"


def test_an_entry_with_no_list_row_reads_as_the_type_default(
    admin_client, db, sample_franchise
):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Untouched Sentinel",
        airing_type="TV",
    )
    db.add(entry)
    db.flush()
    body = admin_client.get(f"/api/anime/{entry.system_id}").json()
    assert body["watching_status"] == "Might Watch"
    assert body["my_rating"] is None
    assert body["ep_fin"] is None


def test_the_list_endpoint_serves_the_personal_fields_too(
    admin_client, anime_with_list_row
):
    rows = admin_client.get("/api/anime/?limit=2000").json()
    found = [r for r in rows if r["system_id"] == str(anime_with_list_row.system_id)]
    assert len(found) == 1
    assert found[0]["watching_status"] == "Completed"
    assert found[0]["my_rating"] == "9.5"


def test_a_status_filter_matches_through_the_joined_list_row(
    admin_client, db, sample_franchise, anime_with_list_row
):
    other = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Watching Sentinel",
        airing_type="TV",
    )
    db.add(other)
    db.flush()
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=acting_user_id(db, None),
            media_id=other.system_id,
            status="Active Watching",
        )
    )
    db.flush()

    rows = admin_client.get("/api/anime/?watching_status=Completed&limit=2000").json()
    ids = {r["system_id"] for r in rows}
    assert str(anime_with_list_row.system_id) in ids
    assert str(other.system_id) not in ids


def test_a_status_filter_matching_the_default_finds_rowless_entries(
    admin_client, db, sample_franchise
):
    """An entry nobody has touched has no list row, and "Might Watch" is what
    it used to read as. The OUTER join plus a NULL branch is what keeps that
    true; an inner join would make the entry vanish from its own list page."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Rowless Sentinel",
        airing_type="TV",
    )
    db.add(entry)
    db.flush()
    rows = admin_client.get("/api/anime/?watching_status=Might Watch&limit=2000").json()
    assert str(entry.system_id) in {r["system_id"] for r in rows}
```

- [ ] **Step 2: Run it and see it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_list_backed_reads.py -v`
Expected: the first, second and third tests fail on the personal values (the
detail columns still answer, and the fixtures never wrote them), and the two
filter tests fail because nothing joins the list row. Record which failed and
why before moving on — Task 9 is what turns them green.

- [ ] **Step 3: Add the flag to `MediaTypeSpec`**

In `app/registry.py`, in the dataclass, after `has_series`:

```python
    # True once this type's personal columns have moved to user_media_list.
    # Set per type by the Phase B task that drops that type's columns; the
    # flag and the DROP COLUMN migration land in the same commit, so a
    # personal column is never writable in two places at once.
    list_backed: bool = False
```

Do not set it True for any type in this task.

- [ ] **Step 4: Teach `_factory` to read through the list row**

In `app/routers/_factory.py`, import the service:

```python
from app.services.domain.user_list import (
    DEFAULT_STATUS,
    LIST_FIELDS,
    STATUS_FIELD,
    acting_user_id,
    attach_list_fields,
    join_list,
)
from app.models import UserMediaList
```

Extend `_finish` so a list-backed type gets its personal values attached, and
give it the viewer's id:

```python
    def _finish(db: Session, entry, viewer=None):
        if spec.list_backed:
            attach_list_fields(
                db, spec.owner_type, entry, acting_user_id(db, viewer)
            )
        attach_plan_flag(db, spec.owner_type, entry)
        attach_link_fields(db, spec.owner_type, entry)
        attach_sources(db, spec.owner_type, entry, viewer)
        return entry
```

In `list_entries`, replace the filter loop so personal fields resolve against
the joined list row. The current loop is:

```python
        columns = spec.model.__table__.columns
        for field in spec.list_filters:
            raw = request.query_params.get(field)
            if raw is None:
                continue
            value = raw.lower() in ("true", "1", "yes") if isinstance(columns[field].type, Boolean) else raw
            query = query.filter(getattr(spec.model, field) == value)
```

It becomes:

```python
        user_id = acting_user_id(db, viewer) if spec.list_backed else None
        personal = set(LIST_FIELDS[spec.owner_type]) if spec.list_backed else set()
        if personal & set(spec.list_filters) or spec.list_backed:
            query = join_list(query, spec.model, user_id)
        columns = spec.model.__table__.columns
        for field in spec.list_filters:
            raw = request.query_params.get(field)
            if raw is None:
                continue
            if field in personal:
                if field == STATUS_FIELD[spec.owner_type]:
                    # An entry with no list row reads as the type's default,
                    # so filtering ON that default must also return the rows
                    # that have no row at all - the OUTER join's NULL side.
                    condition = UserMediaList.status == raw
                    if raw == DEFAULT_STATUS[spec.owner_type]:
                        condition = or_(condition, UserMediaList.status.is_(None))
                    query = query.filter(condition)
                else:
                    query = query.filter(getattr(UserMediaList, field) == raw)
                continue
            value = raw.lower() in ("true", "1", "yes") if isinstance(columns[field].type, Boolean) else raw
            query = query.filter(getattr(spec.model, field) == value)
```

Then attach the personal values to the page before it is gated. After the
existing `attach_sources(db, spec.owner_type, entries, viewer)` line:

```python
        if spec.list_backed:
            attach_list_fields(db, spec.owner_type, entries, user_id)
```

`attach_list_fields` issues one `IN` query for the whole page, so this adds one
query per request, not one per entry.

- [ ] **Step 5: Verify nothing moved yet**

```
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures, and `tests/api/test_list_backed_reads.py` still fails
exactly as in Step 2 — `list_backed` is False everywhere, so every branch added
above is dead code for now. That is the point: the machinery lands separately
from the flip.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/registry.py app/routers/_factory.py \
        tests/api/test_list_backed_reads.py docs/PROGRESS.md
```
Proposed message: `feat(list): read personal fields through user_media_list, behind a per-type flag`
**Ask before running `git commit`.**

Because the four checks must be green before any commit, add this module-level
marker to `tests/api/test_list_backed_reads.py` **in this task**, directly under
the module docstring:

```python
pytestmark = pytest.mark.xfail(
    strict=True,
    reason="anime is not list_backed until Task 9; this module is its acceptance test",
)
```

`strict=True` means the suite fails the moment the tests start passing, which is
what makes Task 9 remove the marker rather than forget it.

---

### Task 6: The write path — create, update, patch

**Files:**
- Modify: `app/routers/_factory.py`
- Create: `tests/api/test_list_backed_writes.py`

**Interfaces:**
- Consumes: `split_list_payload`, `apply_list_payload`, `ensure_list_row`,
  `acting_user_id`, `STATUS_FIELD` (Task 2); `spec.list_backed` (Task 5).
- Produces: a `_factory` write path that routes personal keys into the acting
  user's list row for any type where `list_backed` is True.

Three endpoints write columns — `create`, `update`, `patch` — and all three
currently apply the whole payload to the detail model. `update` and `patch`
also call `apply_completion_timestamp(entry, payload.get(spec.status_field))`
(`app/routers/_factory.py:226` and `:258`), which sets `entry.completed_at`;
that has to move to the list row too, because `completed_at` is personal.

The payload key names do not change. The SPA keeps sending `watching_status`
and keeps getting it back; only the table underneath moves.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_list_backed_writes.py
"""
Writes routed into user_media_list.

Marked xfail until Task 9 flips `anime` to list_backed; Task 9 removes the
marker. See tests/api/test_list_backed_reads.py for the read half.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id

pytestmark = pytest.mark.xfail(
    strict=True,
    reason="anime is not list_backed until Task 9; this module is its acceptance test",
)


@pytest.fixture
def db(db_session):
    return db_session


def _list_row(db, media_id):
    return (
        db.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == media_id)
        .one_or_none()
    )


def test_create_writes_the_personal_fields_to_a_list_row(admin_client, db):
    response = admin_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Created Sentinel",
            "airing_type": "TV",
            "ep_total": 12,
            "watching_status": "Active Watching",
            "my_rating": "8",
            "ep_fin": 6,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["watching_status"] == "Active Watching"
    assert body["my_rating"] == "8"
    assert body["ep_fin"] == 6

    row = _list_row(db, uuid.UUID(body["system_id"]))
    assert row is not None
    assert row.status == "Active Watching"
    assert row.my_rating == "8"
    assert row.ep_fin == 6
    assert row.user_id == acting_user_id(db, None)


def test_create_with_no_personal_fields_still_makes_a_default_row(admin_client, db):
    response = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Bare Sentinel", "airing_type": "TV"}
    )
    assert response.status_code == 201, response.text
    row = _list_row(db, uuid.UUID(response.json()["system_id"]))
    assert row is not None
    assert row.status == "Might Watch"


def test_the_catalogue_columns_still_land_on_the_detail_table(admin_client, db):
    response = admin_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Split Sentinel",
            "airing_type": "TV",
            "ep_total": 24,
            "my_rating": "7",
        },
    )
    entry = db.get(models.Anime, uuid.UUID(response.json()["system_id"]))
    assert entry.ep_total == 24
    assert entry.anime_name_en == "Split Sentinel"


def test_patch_updates_the_list_row_not_the_entry(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Patched Sentinel", "airing_type": "TV"}
    ).json()
    response = admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"my_rating": "6", "ep_fin": 3}
    )
    assert response.status_code == 200, response.text
    assert response.json()["my_rating"] == "6"

    row = _list_row(db, uuid.UUID(created["system_id"]))
    assert row.my_rating == "6"
    assert row.ep_fin == 3


def test_put_updates_the_list_row(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Put Sentinel", "airing_type": "TV"}
    ).json()
    response = admin_client.put(
        f"/api/anime/{created['system_id']}",
        json={
            "anime_name_en": "Put Sentinel",
            "airing_type": "TV",
            "watching_status": "Completed",
            "my_rating": "10",
        },
    )
    assert response.status_code == 200, response.text
    row = _list_row(db, uuid.UUID(created["system_id"]))
    assert row.status == "Completed"
    assert row.my_rating == "10"


def test_reaching_completed_stamps_completed_at_on_the_list_row(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Stamp Sentinel", "airing_type": "TV"}
    ).json()
    admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"watching_status": "Completed"}
    )
    row = _list_row(db, uuid.UUID(created["system_id"]))
    assert row.status == "Completed"
    assert row.completed_at is not None


def test_completed_at_is_stamped_once_and_not_refreshed(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Once Sentinel", "airing_type": "TV"}
    ).json()
    admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"watching_status": "Completed"}
    )
    first = _list_row(db, uuid.UUID(created["system_id"])).completed_at
    admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"watching_status": "Completed"}
    )
    assert _list_row(db, uuid.UUID(created["system_id"])).completed_at == first
```

- [ ] **Step 2: Run it and see it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_list_backed_writes.py -v`
Expected: every test XFAILs (the module marker). Remove the marker locally for
one run to see the real failures — `models.UserMediaList` rows are never
created — then put it back before committing.

- [ ] **Step 3: Add a list-aware completion stamp**

`apply_completion_timestamp` in `app/services/domain/completion.py` takes an
entry and sets `entry.completed_at`. Add its list-row sibling in the same file,
directly beneath it, rather than overloading the existing one — the old one is
still used by every type that has not flipped yet:

```python
def apply_list_completion_timestamp(row, status_value: Optional[str]) -> None:
    """
    Sets the list row's completed_at the first time this user reaches a
    Completed status. The per-user twin of apply_completion_timestamp: when
    two people finish the same anime on different days, two different dates
    are the correct answer and one shared column cannot hold them.
    """
    if status_value in COMPLETED_WATCH_STATUSES and row.completed_at is None:
        row.completed_at = get_taipei_now()
```

Export it from `app/services/domain/__init__.py` alongside
`apply_completion_timestamp`.

- [ ] **Step 4: Route the write payloads**

In `app/routers/_factory.py`, import what is needed:

```python
from app.services.domain import apply_list_completion_timestamp
from app.services.domain.user_list import (
    STATUS_FIELD,
    acting_user_id,
    apply_list_payload,
    ensure_list_row,
    split_list_payload,
)
```

Add one helper inside `make_media_router`, next to `_pop_nested`:

```python
    def _write_list(db: Session, entry, personal: dict, viewer) -> None:
        """Apply the personal half of a payload to the acting user's row.

        Called for every write on a list_backed type, including one with an
        empty personal half: a brand-new entry needs its default-status row to
        exist so the detail page has something to read and to edit.
        """
        user_id = acting_user_id(db, viewer)
        if user_id is None:
            return
        row = ensure_list_row(db, user_id, entry.system_id, spec.owner_type)
        apply_list_payload(row, personal, spec.owner_type)
        apply_list_completion_timestamp(
            row, personal.get(STATUS_FIELD[spec.owner_type])
        )
```

In `create`, split the payload before the model is built. The current lines are:

```python
        payload, remark, has_remark = pop_remark(data.model_dump())
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        nested = _pop_nested(payload)
        entry = spec.model(**payload)
```

They become:

```python
        payload, remark, has_remark = pop_remark(data.model_dump())
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        nested = _pop_nested(payload)
        personal = {}
        if spec.list_backed:
            payload, personal = split_list_payload(spec.owner_type, payload)
        entry = spec.model(**payload)
```

and, after `db.add(entry)` and the `db.flush()` that follows it — the list row
needs `entry.system_id` and its FK needs the `media` row Step 0's pre-commit
hook writes, so this must come after `spec.pre_commit_hook`:

```python
        if spec.pre_commit_hook:
            spec.pre_commit_hook(db, entry)
        if spec.list_backed:
            db.flush()
            _write_list(db, entry, personal, viewer)
        db.commit()
```

In `update`, split before the `setattr` loop and drop the old stamp call:

```python
        payload, remark, has_remark = pop_remark(data.model_dump(exclude_unset=True))
        payload, plan_flags = pop_plan_flag(spec.owner_type, payload)
        nested = _pop_nested(payload)
        personal = {}
        if spec.list_backed:
            payload, personal = split_list_payload(spec.owner_type, payload)
        for key, value in payload.items():
            setattr(entry, key, value)
```

and where `apply_completion_timestamp(entry, payload.get(spec.status_field))`
stands today:

```python
        if spec.list_backed:
            _write_list(db, entry, personal, viewer)
        else:
            apply_completion_timestamp(entry, payload.get(spec.status_field))
```

In `patch`, the same two edits, around `apply_column_patch(entry, payload)`:

```python
        personal = {}
        if spec.list_backed:
            payload, personal = split_list_payload(spec.owner_type, payload)
        apply_column_patch(entry, payload)
```

and:

```python
        if spec.list_backed:
            _write_list(db, entry, personal, viewer)
        else:
            apply_completion_timestamp(entry, payload.get(spec.status_field))
```

Both `update` and `patch` end by calling `_finish`, which re-attaches the
personal values from the row just written, so the response still carries them.

- [ ] **Step 5: Verify nothing moved yet**

```
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures; the two new modules XFAIL. Every branch added here
is dead code while `list_backed` is False.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/routers/_factory.py app/services/domain/completion.py \
        app/services/domain/__init__.py \
        tests/api/test_list_backed_writes.py docs/PROGRESS.md
```
Proposed message: `feat(list): route personal write payloads into the acting user's list row`
**Ask before running `git commit`.**

---

### Task 7: The completion services become per-user

**Files:**
- Modify: `app/services/domain/completion.py`
- Modify: `app/services/domain/__init__.py`
- Modify: `app/services/domain/post_processing.py`
- Modify: `app/registry.py`
- Modify: `app/routers/_factory.py`
- Create: `tests/unit/test_completion_split.py`

**Interfaces:**
- Consumes: `ensure_list_row`, `acting_user_id` (Task 2); `spec.list_backed`
  (Task 5).
- Produces: the twelve `mark_*_catalog` / `mark_*_list` functions named in the
  interface contract, plus `MediaTypeSpec.mark_completed_list`.

**The reason this is its own task:** every `mark_*` helper today mutates both
kinds of fact in one function. `mark_tv_completed`
(`app/services/domain/completion.py:75-84`) writes `watching_status` **and**
`airing_status`; `mark_reading_completed` writes `reading_status`, `ch_fin`,
`vol_fin`, `vol_fin_page` **and** `serialization_status`, `ch_total`,
`vol_total`; `mark_novel_completed` and `mark_comic_completed` do the same with
their own totals. `airing_status`, `serialization_status` and every `*_total`
are catalogue facts about the work. `watching_status` and every `*_fin` are one
person's progress. Split at that seam and each half has exactly one home.

**And it is a live bug the moment a second user exists.** These helpers are
called from `post_processing`, which Fill and Replace and Calculate all run
(`app/services/pipelines/specs.py:131,151,172,184,200` and
`app/services/calculation.py:419-442`). A pipeline run would otherwise mark
*your* anime Completed because *my* episode count reached the total.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_completion_split.py
"""
mark_* splits into a catalogue half and a list half.

Pure objects: the catalogue halves take an entry, the list halves take a row
and an entry. No session, no database.
"""

import pytest

from app.models import Anime, Comic, Manga, Movies, UserMediaList
from app.services.domain.completion import (
    mark_comic_catalog,
    mark_comic_list,
    mark_movie_catalog,
    mark_movie_list,
    mark_reading_catalog,
    mark_reading_list,
    mark_tv_catalog,
    mark_tv_list,
)


@pytest.fixture
def row():
    return UserMediaList(status="Might Watch")


def test_mark_tv_catalog_touches_only_catalogue_columns():
    entry = Anime(ep_total=12, airing_status="Currently Airing")
    mark_tv_catalog(entry)
    assert entry.airing_status == "Finished Airing"
    assert entry.ep_total == 12


def test_mark_tv_list_sets_status_and_progress(row):
    entry = Anime(ep_total=12)
    mark_tv_list(row, entry)
    assert row.status == "Completed"
    assert row.ep_fin == 12


def test_mark_tv_list_leaves_ep_fin_alone_when_the_total_is_unknown(row):
    entry = Anime(ep_total=None)
    row.ep_fin = 4
    mark_tv_list(row, entry)
    assert row.status == "Completed"
    assert row.ep_fin == 4


def test_mark_movie_halves():
    entry = Movies(airing_status="Not Yet Aired")
    mark_movie_catalog(entry)
    assert entry.airing_status == "Finished Airing"

    r = UserMediaList(status="Might Watch")
    mark_movie_list(r, entry)
    assert r.status == "Completed"


def test_mark_reading_catalog_closes_the_serialization_but_no_progress():
    entry = Manga(serialization_status="連載中", ch_total=100, vol_total=10)
    mark_reading_catalog(entry)
    assert entry.serialization_status == "完結"
    assert entry.ch_total == 100
    assert entry.vol_total == 10


def test_mark_reading_catalog_keeps_a_cancelled_serialization():
    entry = Manga(serialization_status="腰斬")
    mark_reading_catalog(entry)
    assert entry.serialization_status == "腰斬"


def test_mark_reading_list_fills_progress_from_the_totals():
    entry = Manga(ch_total=100, vol_total=10)
    r = UserMediaList(status="Might Read")
    mark_reading_list(r, entry)
    assert r.status == "Completed"
    assert r.ch_fin == 100
    assert r.vol_fin == 10
    assert r.vol_fin_page == 0


def test_mark_comic_halves():
    entry = Comic(serialization_status="連載中", issue_total=6)
    mark_comic_catalog(entry)
    assert entry.serialization_status == "完結"
    assert entry.issue_total == 6

    r = UserMediaList(status="Might Read")
    mark_comic_list(r, entry)
    assert r.status == "Completed"
    assert r.issue_fin == 6


def test_no_catalog_half_writes_a_status_or_a_fin_column():
    """The seam, asserted directly: a catalogue half must not touch personal
    fields even when the entry model still declares them."""
    entry = Manga(serialization_status="連載中", ch_total=100, vol_total=10)
    mark_reading_catalog(entry)
    assert getattr(entry, "reading_status", None) in (None, "Might Read")
```

- [ ] **Step 2: Run it and see it fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_completion_split.py -v`
Expected: FAIL with `ImportError: cannot import name 'mark_tv_catalog'`

- [ ] **Step 3: Write the twelve halves**

In `app/services/domain/completion.py`, add these beside the existing
`mark_*_completed` functions. **The originals stay** — the six types that have
not flipped yet still call them, and Task 18 deletes them once nothing does.

```python
def mark_tv_catalog(entry) -> None:
    """The catalogue half of finishing an anime, TV show or cartoon: the work
    has finished airing. Nothing here is one person's opinion."""
    entry.airing_status = "Finished Airing"


def mark_tv_list(row, entry) -> None:
    """The personal half: I finished it, and I saw every episode there is."""
    row.status = "Completed"
    if getattr(entry, "ep_total", None) is not None:
        row.ep_fin = entry.ep_total


def mark_movie_catalog(entry) -> None:
    entry.airing_status = "Finished Airing"


def mark_movie_list(row, entry) -> None:
    row.status = "Completed"


def mark_reading_catalog(entry) -> None:
    """Manga's catalogue half. A cancelled serialization stays cancelled -
    finishing what exists does not make 腰斬 into 完結."""
    if entry.serialization_status != "腰斬":
        entry.serialization_status = "完結"


def mark_reading_list(row, entry) -> None:
    row.status = "Completed"
    if entry.ch_total:
        row.ch_fin = entry.ch_total
    if entry.vol_total:
        row.vol_fin = entry.vol_total
    row.vol_fin_page = 0


def mark_comic_catalog(entry) -> None:
    entry.serialization_status = "完結"
    issue_vals = [v for v in [entry.issue_total] if v is not None]
    if issue_vals:
        entry.issue_total = max(issue_vals)


def mark_comic_list(row, entry) -> None:
    row.status = "Completed"
    issue_vals = [v for v in [entry.issue_total, row.issue_fin] if v is not None]
    if issue_vals:
        row.issue_fin = max(issue_vals)


def mark_game_catalog(entry) -> None:
    """A game has no catalogue-side notion of being finished. completion_level,
    the three all_* flags and the achievement pair are independent axes only
    the player knows, so nothing is set here - the function exists so the
    registry can name a catalogue half for every type."""
    return None


def mark_game_list(row, entry) -> None:
    row.status = "Completed"
```

Novel's split is longer, because `mark_novel_completed` reconciles volume and
arc totals across both kinds of fact. Write it out in full:

```python
def mark_novel_catalog(entry) -> None:
    """
    Novel's catalogue half: the serialization is finished, and the three
    volume totals agree on the largest figure any of them holds.

    vol_fin is NOT read here even though the original mark_novel_completed
    took the max across it as well - it is one reader's progress and cannot
    be allowed to set the work's published length.
    """
    entry.serialization_status = "完結"

    vol_vals = [
        v for v in [entry.vol_total_original, entry.vol_total_tw] if v is not None
    ]
    if vol_vals:
        vol_max = max(vol_vals)
        if entry.vol_total_original is not None:
            entry.vol_total_original = vol_max
        if entry.vol_total_tw is not None:
            entry.vol_total_tw = vol_max

    arcs = [u for u in (getattr(entry, "units", None) or []) if u.unit_kind == "arc"]
    if arcs:
        entry.arc_total = float(len(arcs))
        entry.ch_total = float(sum(float(u.ch_count or 0) for u in arcs))


def mark_novel_list(row, entry) -> None:
    """
    Novel's personal half: read to the end of whatever the catalogue says
    exists.

    Arc-structured novels close every recorded arc and take the derived
    chapter count; a flat novel takes the larger of its own ch_fin and the
    work's ch_total, which is what the original did.
    """
    row.status = "Completed"

    vol_vals = [
        v
        for v in [entry.vol_total_original, entry.vol_total_tw, row.vol_fin]
        if v is not None
    ]
    if vol_vals:
        row.vol_fin = max(vol_vals)

    arcs = [u for u in (getattr(entry, "units", None) or []) if u.unit_kind == "arc"]
    row.ch_fin_in_arc = 0
    if arcs:
        row.arc_fin = float(len(arcs))
        row.ch_fin = float(sum(float(u.ch_count or 0) for u in arcs))
        return

    arc_vals = [v for v in [entry.arc_total, row.arc_fin] if v is not None]
    if arc_vals:
        row.arc_fin = max(arc_vals)
    ch_vals = [v for v in [entry.ch_total, row.ch_fin] if v is not None]
    if ch_vals:
        row.ch_fin = max(ch_vals)
```

Export all twelve from `app/services/domain/__init__.py` and add them to
`__all__`.

- [ ] **Step 4: Add `mark_completed_list` to the registry**

In `app/registry.py`, in `MediaTypeSpec`, beside `mark_completed`:

```python
    # (row, entry) -> None. The personal half of mark_completed, used by the
    # /complete endpoint once this type is list_backed. Kept beside its
    # catalogue twin so a type can never declare one without the other.
    mark_completed_list: Optional[Callable] = None
```

Import the twelve new names and set both callables on every one of the nine
specs — `mark_completed=mark_tv_catalog, mark_completed_list=mark_tv_list` for
anime, tv_show and cartoon; `mark_movie_catalog` / `mark_movie_list` for
anime_movie and movie; `mark_reading_*` for manga; `mark_novel_*` for novel;
`mark_comic_*` for comic; `mark_game_*` for game.

**Careful:** while a type is not yet `list_backed`, `mark_completed` must stay
the *old* combined helper, or its `/complete` endpoint silently stops setting a
status. So in this task set `mark_completed_list` on all nine and leave
`mark_completed` pointing at the existing `mark_*_completed` functions. Each
Phase B task then repoints its own type's `mark_completed` at the catalogue
half in the same commit that flips the flag.

- [ ] **Step 5: Teach `/complete` about the two halves**

In `app/routers/_factory.py`, the `complete` endpoint currently reads:

```python
        entry = _get_or_404(db, entry_id)
        spec.mark_completed(entry)
        if entry.completed_at is None:
            entry.completed_at = get_taipei_now()
        entry.updated_at = get_taipei_now()
```

It becomes:

```python
        entry = _get_or_404(db, entry_id)
        spec.mark_completed(entry)
        if spec.list_backed:
            user_id = acting_user_id(db, None)
            if user_id is not None:
                row = ensure_list_row(
                    db, user_id, entry.system_id, spec.owner_type
                )
                spec.mark_completed_list(row, entry)
                if row.completed_at is None:
                    row.completed_at = get_taipei_now()
                row.updated_at = get_taipei_now()
        elif entry.completed_at is None:
            entry.completed_at = get_taipei_now()
        entry.updated_at = get_taipei_now()
```

- [ ] **Step 6: Confine `post_processing` to the catalogue half**

`app/services/domain/post_processing.py` is pipeline code. Every
`mark_*_completed(x)` call in it becomes the catalogue half, and every
`check_is_*_completed(x)` guard that reads a personal column has to go with it —
a pipeline may not decide that *somebody* finished something.

Replace `anime_post_processing`'s completion block:

```python
def anime_post_processing(anime: Anime, db: Session) -> None:
    apply_validate_episode_math(anime)
    apply_check_baha(db, anime, "anime")

    # No completion check here any more. Whether an entry is finished is one
    # person's fact and lives on their user_media_list row; a pipeline that
    # decided it would be silently rewriting somebody's list. What a pipeline
    # may still say is that the WORK has finished airing, and only when the
    # source it fetched from says so - which autofill already writes.

    if (
        anime.release_season is None
        and anime.release_date is not None
        and anime.airing_type == "TV"
    ):
        apply_calculate_seasonal_from_month(anime)

    if anime.season_part is None:
        apply_extract_season_from_title(anime)
        derive_season_1_anime(anime, db)
```

Do the same to `anime_movie_post_processing`, `tv_show_post_processing`,
`cartoon_post_processing` and `manga_post_processing`: delete the
`check_is_*_completed(...) and ... not in COMPLETED_*_STATUSES` block and its
`mark_*` call, keeping every other line. The now-unused imports of
`check_is_movie_completed`, `check_is_reading_completed`,
`check_is_tv_completed`, `mark_movie_completed`, `mark_reading_completed`,
`mark_tv_completed` and `COMPLETED_READ_STATUSES` / `COMPLETED_WATCH_STATUSES`
come out of the file's import block — `ruff check .` will name them.

`apply_validate_episode_math`, `apply_validate_vol_math` and
`apply_validate_ch_math` also write personal columns (`ep_fin`, `vol_fin`,
`ch_fin`) and stay in place **only** until Tasks 14 and 21, which is where they are
confined. Leave them alone here so this task stays one idea.

- [ ] **Step 7: Run the tests**

```
venv/Scripts/python.exe -m pytest tests/unit/test_completion_split.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: the new module passes. Existing tests that assert a pipeline marks an
entry Completed will now fail — that is the behaviour change this task makes on
purpose. Update each such test to assert the catalogue half only, and name them
in the commit message. Search for them with:

```
venv/Scripts/python.exe -m pytest -q -k "post_processing or completed"
```

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/domain/completion.py app/services/domain/__init__.py \
        app/services/domain/post_processing.py app/registry.py \
        app/routers/_factory.py tests/unit/test_completion_split.py \
        docs/PROGRESS.md
```
Add each pipeline test you had to update, by exact path. Proposed message:
`refactor(completion): split mark_* into a catalogue half and a per-user half`
**Ask before running `git commit`.**

---

### Task 8: The seasonal counters stop reading `anime.watching_status`

**Files:**
- Modify: `app/services/domain/seasonal.py`
- Create: `tests/api/test_seasonal_counts_from_list.py`

**Interfaces:**
- Consumes: `models.UserMediaList` (Task 1), the backfilled rows (Task 3),
  `acting_user_id` (Task 2).
- Produces: `sync_seasonal_counts` reading status from the admin's list rows.

**This task must land before Task 9.** `sync_seasonal_counts`
(`app/services/domain/seasonal.py:108-114`) reads `anime.watching_status` at
four sites to compute `entry_planned`, `entry_completed`, `entry_watching` and
`entry_dropped`. Task 9 drops that column, and the function would raise on its
next run — which is every Fill and every Replace of anime, via
`run_sync_anime` in `app/services/pipelines/specs.py:139,145,148`.

**Scope check first.** `create_missing_seasonal` in the same module reads only
`release_season` and `release_date`, both of which stay on `anime`, so it needs
no change. Confirm that before editing:

```
grep -n "watching_status\|my_rating\|ep_fin\|completed_at" app/services/domain/seasonal.py
```
Expected: hits only inside `sync_seasonal_counts`. If anything else appears,
fix it in this task and say so in the commit.

**Scoped to the admin, deliberately.** Step 1 has exactly one user, so "the
seasonal counts" and "the admin's seasonal counts" are the same numbers, and
saying admin is the honest version. `seasonal` keeps its `seasonal` primary key
here; Step 3 widens this same function across every user and changes the key to
`(user_id, seasonal)`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_seasonal_counts_from_list.py
"""
Seasonal counters read the admin's user_media_list rows, not anime columns.

Written before the column is dropped, so it starts red against the current
implementation, which counts from anime.watching_status.
"""

import uuid

import pytest

from app import models
from app.services.domain.seasonal import sync_seasonal_counts
from app.services.domain.user_list import acting_user_id


@pytest.fixture
def db(db_session):
    return db_session


def _anime(db, franchise, name, season, year):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
        airing_type="TV",
        release_season=season,
        release_date=f"{year}-10-01",
    )
    db.add(entry)
    db.flush()
    return entry


def _list_row(db, media_id, status):
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=acting_user_id(db, None),
            media_id=media_id,
            status=status,
        )
    )
    db.flush()


@pytest.fixture
def one_season(db, admin_client, sample_franchise):
    """FAL 2023 with one entry in each of the four counted buckets, plus one
    the counters must ignore because no list row exists for it."""
    season = models.Seasonal(seasonal="FAL 2023")
    db.add(season)
    db.flush()

    for name, status in [
        ("Seasonal Completed", "Completed"),
        ("Seasonal Planned", "Plan to Watch"),
        ("Seasonal Watching", "Active Watching"),
        ("Seasonal Dropped", "Dropped"),
    ]:
        entry = _anime(db, sample_franchise, name, "FAL", 2023)
        _list_row(db, entry.system_id, status)

    _anime(db, sample_franchise, "Seasonal Untouched", "FAL", 2023)
    return season


def test_counts_come_from_the_admins_list_rows(db, one_season):
    sync_seasonal_counts(db)
    db.refresh(one_season)
    assert one_season.entry_completed == 1
    assert one_season.entry_planned == 1
    assert one_season.entry_watching == 1
    assert one_season.entry_dropped == 1


def test_an_entry_with_no_list_row_counts_in_no_bucket(db, one_season):
    """"Might Watch" is in none of the four sets, and neither is a missing
    row, so the untouched entry must move no counter."""
    sync_seasonal_counts(db)
    db.refresh(one_season)
    total = (
        one_season.entry_completed
        + one_season.entry_planned
        + one_season.entry_watching
        + one_season.entry_dropped
    )
    assert total == 4


def test_another_users_row_does_not_leak_into_the_admins_counts(
    db, one_season, sample_franchise
):
    """Pins the scoping before step 2 makes it reachable: a second user's
    Completed row must not raise the admin's completed count."""
    from app.services.security import get_password_hash
    from tests.api.conftest import role_id_for

    other = models.User(
        id=uuid.uuid4(),
        username="seasonal_other",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "guest"),
    )
    db.add(other)
    db.flush()
    entry = _anime(db, sample_franchise, "Seasonal Other User", "FAL", 2023)
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=other.id,
            media_id=entry.system_id,
            status="Completed",
        )
    )
    db.flush()

    sync_seasonal_counts(db)
    db.refresh(one_season)
    assert one_season.entry_completed == 1


def test_sync_is_idempotent(db, one_season):
    sync_seasonal_counts(db)
    sync_seasonal_counts(db)
    db.refresh(one_season)
    assert one_season.entry_completed == 1
    assert one_season.entry_watching == 1
```

- [ ] **Step 2: Run it and see it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_seasonal_counts_from_list.py -v`
Expected: the first, second and fourth tests FAIL with every counter at 0 — the
fixtures write list rows and never touch `anime.watching_status`, which is what
the current implementation counts. The third test passes vacuously for now;
keep it, it is what pins the scoping once the rewrite lands.

- [ ] **Step 3: Rewrite `sync_seasonal_counts`**

Replace the whole function in `app/services/domain/seasonal.py`:

```python
def sync_seasonal_counts(db: Session) -> None:
    """
    Recomputes entry_planned, entry_completed, entry_watching and entry_dropped
    for every Seasonal from the admin's user_media_list rows. Always overwrites
    existing counts. Only anime with airing_type in TV, ONA, Movie, Special
    count.

    Planned  = Plan to Watch | Watch When Airs
    Watching = Active Watching | Passive Watching | Paused
    Dropped  = Temp Dropped | Dropped

    Scoped to the admin because step 1 has exactly one user and these counts
    are that person's, not the catalogue's - an entry nobody has touched has
    no list row and belongs in no bucket. Step 3 widens this across users and
    moves the primary key to (user_id, seasonal).
    """
    seasonals = db.query(Seasonal).all()
    if not seasonals:
        return

    seasonal_map = {s.seasonal: s for s in seasonals}

    for s in seasonals:
        s.entry_planned = 0
        s.entry_completed = 0
        s.entry_watching = 0
        s.entry_dropped = 0

    user_id = acting_user_id(db, None)
    if user_id is None:
        db.commit()
        return

    # An INNER join: an entry with no list row is in none of the four sets,
    # which is the same answer the old code gave for "Might Watch".
    rows = (
        db.query(
            Anime.release_season,
            Anime.release_date,
            UserMediaList.status,
        )
        .join(UserMediaList, UserMediaList.media_id == Anime.system_id)
        .filter(
            UserMediaList.user_id == user_id,
            Anime.release_season.isnot(None),
            Anime.release_date.isnot(None),
            Anime.airing_type.in_(list(_SEASONAL_AIRING_TYPES)),
        )
        .all()
    )

    for release_season, release_date, status in rows:
        s = seasonal_map.get(f"{release_season} {str(release_date)[:4]}")
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

Add the two imports at the top of the module:

```python
from app.models import Anime, Seasonal, UserMediaList
from app.services.domain.user_list import acting_user_id
```

Check for an import cycle: `user_list` imports `app.models` and
`app.database` only, and `seasonal` is imported by
`app/services/domain/__init__.py`, so importing `user_list` from `seasonal`
must not go through the package `__init__`. Import the module path directly, as
written above, not `from app.services.domain import acting_user_id`.

- [ ] **Step 4: Run it green**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_seasonal_counts_from_list.py -v`
Expected: all five tests PASS.

- [ ] **Step 5: Check the real numbers did not move**

Against the dev database, before and after:

```sql
SELECT seasonal, entry_planned, entry_completed, entry_watching, entry_dropped
FROM seasonal ORDER BY seasonal;
```
Run `/system` → Calculate (which calls `run_sync_anime`) and compare. Expected:
identical, because the backfill copied every `watching_status` verbatim into
the admin's rows. Any difference is a backfill bug and stops this task.

- [ ] **Step 6: Run the checks**

```
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/domain/seasonal.py \
        tests/api/test_seasonal_counts_from_list.py docs/PROGRESS.md
```
Proposed message: `refactor(seasonal): count from the admin's list rows, not anime.watching_status`
**Ask before running `git commit`.**

---

### Task 9: Flip `anime` — the pattern the other eight follow

**Files:**
- Modify: `app/registry.py`
- Modify: `app/models/anime.py`
- Create: `alembic/versions/m1b1anime_drop_anime_personal.py`
- Modify: `tests/api/test_list_backed_reads.py`
- Modify: `tests/api/test_list_backed_writes.py`

**Interfaces:**
- Consumes: everything Tasks 1–8 built.
- Produces: `anime` with no personal columns; `MEDIA_REGISTRY["anime"]` with
  `list_backed=True` and `mark_completed=mark_tv_catalog`.

The five columns dropped, verified against `app/models/anime.py:76,84,88,98,102`:
`watching_status`, `ep_fin`, `my_rating`, `my_watch_day`, `completed_at`.

`anime` is the type with the most personal columns and the only one carrying
`my_watch_day`, so if the machinery is wrong anywhere it is wrong here. It also
has `list_filters=("franchise_id", "series_id")` — no status filter — so its
list page cannot mask a filter-join bug; `test_list_backed_reads.py` covers
that by passing `?watching_status=` explicitly even though the registry does
not declare it. **Add `"watching_status"` to anime's `list_filters` in this
task** so the parameter is declared rather than silently ignored.

- [ ] **Step 1: Un-xfail the two acceptance modules**

Delete the `pytestmark = pytest.mark.xfail(...)` block from both
`tests/api/test_list_backed_reads.py` and
`tests/api/test_list_backed_writes.py`.

- [ ] **Step 2: Run them and see them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_list_backed_reads.py tests/api/test_list_backed_writes.py -v`
Expected: FAIL — `list_backed` is still False for anime, so the reads serve the
detail columns and the writes never make a list row.

- [ ] **Step 3: Flip the registry**

In `app/registry.py`, in the `"anime"` spec:

```python
        status_field="watching_status",
        list_filters=("franchise_id", "series_id", "watching_status"),
        ...
        mark_completed=mark_tv_catalog,
        mark_completed_list=mark_tv_list,
        list_backed=True,
```

`mark_completed` moves from `mark_tv_completed` to `mark_tv_catalog` **in this
commit**, because from here on the personal half of finishing an anime lives on
the list row and `mark_tv_completed` would try to set a column that no longer
exists. `tv_show` and `cartoon` still point at `mark_tv_completed` and stay
there until Tasks 12 and 13.

- [ ] **Step 4: Drop the columns from the model**

In `app/models/anime.py`, delete these five lines and nothing else:

```python
    watching_status = Column(String, nullable=False, default="Might Watch")
    ep_fin = Column(Integer, nullable=True, default=0)
    my_rating = Column(String, nullable=True)
    my_watch_day = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

`created_at` and `updated_at` stay — they are catalogue timestamps, and
`user_media_list` has its own pair. The schemas in `app/schemas/anime.py`
change **not at all**: `AnimeBase` keeps declaring all five fields and they are
now filled by `attach_list_fields`. `AnimeResponse.cum_ep_fin` keeps working
for the same reason — it reads `self.ep_fin`, which the attach put there.

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1b1anime_drop_anime_personal.py
"""Drop anime's five personal columns; user_media_list holds them now.

Revision ID: m1b1anime
Revises: m1a2umbackfill
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b1anime"
down_revision: Union[str, Sequence[str], None] = "m1a2umbackfill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Refuse to drop columns whose values were never copied. m1a2umbackfill
    # ran before this and should have written one row per anime; if it did
    # not, dropping now destroys the only copy.
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM anime a "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = a.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} anime rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("anime", "watching_status")
    op.drop_column("anime", "ep_fin")
    op.drop_column("anime", "my_rating")
    op.drop_column("anime", "my_watch_day")
    op.drop_column("anime", "completed_at")


def downgrade() -> None:
    op.add_column("anime", sa.Column("watching_status", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("ep_fin", sa.Integer(), nullable=True))
    op.add_column("anime", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("my_watch_day", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("completed_at", sa.DateTime(), nullable=True))

    # Restore from the admin's rows. ep_fin narrows from double precision back
    # to integer, so it is rounded rather than truncated by the implicit cast.
    op.execute(
        """
        UPDATE anime a SET
            watching_status = l.status,
            ep_fin = l.ep_fin,
            my_rating = l.my_rating,
            my_watch_day = l.my_watch_day,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = a.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE anime SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("anime", "watching_status", nullable=False)
```

- [ ] **Step 6: Apply and run the acceptance tests**

```
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_list_backed_reads.py tests/api/test_list_backed_writes.py -v
```
Expected: one head; every test in both modules PASSES.

- [ ] **Step 7: Run the whole suite and fix the fallout**

Run: `venv/Scripts/python.exe -m pytest -q`

Expect real breakage here, all of it in fixtures and assertions that set
`watching_status=` / `ep_fin=` on `models.Anime(...)` directly. The one in
`tests/api/conftest.py:sample_anime` is the biggest — it passes
`watching_status="Completed", ep_total=12, ep_fin=12`. Change it to keep
`ep_total` on the model and write the personal pair to a list row:

```python
@pytest.fixture
def sample_anime(db_session, sample_franchise):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Test Anime",
        airing_type="TV",
        airing_status="Finished Airing",
        ep_total=12,
    )
    db_session.add(a)
    db_session.flush()
    db_session.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=acting_user_id(db_session, None),
            media_id=a.system_id,
            status="Completed",
            ep_fin=12,
        )
    )
    db_session.flush()
    return a
```

Find every other one with:

```
grep -rn "watching_status\|my_watch_day" tests/ --include=*.py
```
and fix each the same way. Do not delete an assertion to make it pass — if a
test asserted an anime is Completed, it must still assert that, through the
list row or through the API response.

- [ ] **Step 8: Check the app by hand**

`cd frontend && npm run dev`, open an anime detail page on :5173, and check
that status, rating, episode progress and watch day all render and all save.
Then check the anime list page filters by status. No frontend file changed, so
nothing needs rebuilding.

- [ ] **Step 9: Run the checks**

```
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint
```
Expected: all four green.

- [ ] **Step 10: Prepare the commit and ask**

```bash
git add app/registry.py app/models/anime.py \
        alembic/versions/m1b1anime_drop_anime_personal.py \
        tests/api/test_list_backed_reads.py tests/api/test_list_backed_writes.py \
        tests/api/conftest.py docs/PROGRESS.md
```
Add every other test file you had to fix, by exact path. Proposed message:
`refactor(anime): move the personal columns to user_media_list`
**Ask before running `git commit`.**

---

### The shape of Tasks 10–17

Each of the eight remaining types gets its own task below, with its own column
list, its own migration and its own test — written out rather than referred
back to, because the implementer may be reading tasks out of order and because
no two of these types have the same columns.

Every one of them has the same ten steps:

1. Add the type's row to the parametrised acceptance test in
   `tests/api/test_list_backed_types.py` (created in Task 10).
2. Run it and see it fail.
3. Flip the registry: `list_backed=True`, `mark_completed` to the catalogue
   half, `mark_completed_list` to the list half, and add the status field to
   `list_filters` if it is not already there.
4. Delete the personal columns from the model file.
5. Write the migration, with the same "refuse to drop what was not backfilled"
   guard and a `downgrade` that restores from the admin's rows.
6. `alembic upgrade head`, then `alembic heads` — exactly one.
7. Run the type's acceptance case green.
8. Run `pytest -q` and fix the fixtures that set the dropped columns.
9. Run all four checks.
10. Prepare the commit `refactor(<type>): move the personal columns to user_media_list` and ask.

### Task 10: `anime_movies`

**Files:**
- Modify: `app/registry.py`, `app/models/anime_movie.py`
- Create: `alembic/versions/m1b2animemovie_drop_anime_movie_personal.py`
- Create: `tests/api/test_list_backed_types.py`

Columns dropped, from `app/models/anime_movie.py:77,78,94`:
`watching_status`, `my_rating`, `completed_at`. There is no `ep_fin` — an anime
movie has no episodes. `list_filters` already contains `watching_status`, so
Task 5's filter branch is exercised the moment the flag flips.

- [ ] **Step 1: Create the parametrised acceptance test with its first row**

```python
# tests/api/test_list_backed_types.py
"""
One acceptance case per media type, added by that type's task.

Each row asserts the same three things: a read serves the personal fields from
the list row, a write lands in the list row, and the entry's own catalogue
column is untouched. Anime has its own richer pair of modules
(test_list_backed_reads.py / test_list_backed_writes.py) because it carries
the most personal columns; these are the ports.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import DEFAULT_STATUS, acting_user_id


@pytest.fixture
def db(db_session):
    return db_session


# route base -> (model, name column, media_type, status key, a valid status,
#                catalogue column, catalogue value)
CASES = {
    "/api/anime-movie": (
        models.AnimeMovies, "anime_movie_name_en", "anime-movie",
        "watching_status", "Completed", "length_min", 120,
    ),
}


@pytest.mark.parametrize("base", list(CASES))
def test_create_writes_personal_fields_to_the_list_row(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    payload = {name_col: "Typed Sentinel", status_key: status,
               "my_rating": "A", cat_col: cat_val}
    response = admin_client.post(f"{base}/", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body[status_key] == status
    assert body["my_rating"] == "A"

    row = (
        db.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == uuid.UUID(body["system_id"]))
        .one()
    )
    assert row.status == status
    assert row.my_rating == "A"
    assert row.user_id == acting_user_id(db, None)


@pytest.mark.parametrize("base", list(CASES))
def test_the_catalogue_column_stays_on_the_detail_table(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    response = admin_client.post(
        f"{base}/", json={name_col: "Catalogue Sentinel", cat_col: cat_val}
    )
    assert response.status_code == 201, response.text
    entry = db.get(model, uuid.UUID(response.json()["system_id"]))
    assert getattr(entry, cat_col) == cat_val
    assert not hasattr(entry, "my_rating")


@pytest.mark.parametrize("base", list(CASES))
def test_an_entry_with_no_list_row_reads_as_the_type_default(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    entry = model(system_id=uuid.uuid4())
    setattr(entry, name_col, "Default Sentinel")
    db.add(entry)
    db.flush()
    body = admin_client.get(f"{base}/{entry.system_id}").json()
    assert body[status_key] == DEFAULT_STATUS[media_type]
    assert body["my_rating"] is None


@pytest.mark.parametrize("base", list(CASES))
def test_patch_updates_the_list_row(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    created = admin_client.post(f"{base}/", json={name_col: "Patch Sentinel"}).json()
    response = admin_client.patch(
        f"{base}/{created['system_id']}", json={"my_rating": "B", status_key: status}
    )
    assert response.status_code == 200, response.text
    row = (
        db.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == uuid.UUID(created["system_id"]))
        .one()
    )
    assert row.my_rating == "B"
    assert row.status == status
```

`my_rating` values here are letter grades — `constants.MY_RATINGS` is
`("S", "A+", "A", "B", "C", "D", "E", "F")`, stored as a String. Never write a
numeric rating into a test, and never sort or average one in SQL.

- [ ] **Step 2: Run it and see it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_list_backed_types.py -v`
Expected: FAIL — no `user_media_list` row is created; the values land on
`anime_movies`.

- [ ] **Step 3: Flip the registry**

In `app/registry.py`, in the `"anime_movie"` spec:

```python
        mark_completed=mark_movie_catalog,
        mark_completed_list=mark_movie_list,
        list_backed=True,
```

`list_filters` already reads `("franchise_id", "watching_status")` and needs no
change.

- [ ] **Step 4: Drop the columns from the model**

In `app/models/anime_movie.py`, delete exactly these three lines:

```python
    watching_status = Column(String, nullable=False, default="Might Watch")
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1b2animemovie_drop_anime_movie_personal.py
"""Drop anime_movies' personal columns.

Revision ID: m1b2animemovie
Revises: m1b1anime
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b2animemovie"
down_revision: Union[str, Sequence[str], None] = "m1b1anime"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM anime_movies a "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = a.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} anime_movies rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("anime_movies", "watching_status")
    op.drop_column("anime_movies", "my_rating")
    op.drop_column("anime_movies", "completed_at")


def downgrade() -> None:
    op.add_column(
        "anime_movies", sa.Column("watching_status", sa.String(), nullable=True)
    )
    op.add_column("anime_movies", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column(
        "anime_movies", sa.Column("completed_at", sa.DateTime(), nullable=True)
    )
    op.execute(
        """
        UPDATE anime_movies a SET
            watching_status = l.status,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = a.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE anime_movies SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("anime_movies", "watching_status", nullable=False)
```

- [ ] **Steps 6–10:** apply the migration, confirm one head, run the acceptance
case green, run `pytest -q` and fix the fixtures `grep -rn "watching_status"
tests/ --include=*.py` still names for anime movies, run all four checks, then:

```bash
git add app/registry.py app/models/anime_movie.py \
        alembic/versions/m1b2animemovie_drop_anime_movie_personal.py \
        tests/api/test_list_backed_types.py docs/PROGRESS.md
```
Proposed message: `refactor(anime-movie): move the personal columns to user_media_list`
**Ask before running `git commit`.**

---

### Task 11: `movies`

**Files:**
- Modify: `app/registry.py`, `app/models/movie.py`, `tests/api/test_list_backed_types.py`
- Create: `alembic/versions/m1b3movie_drop_movie_personal.py`

Columns dropped, from `app/models/movie.py:69,70,85`: `watching_status`,
`my_rating`, `completed_at`. `movies` has no `ep_fin`.

- [ ] **Step 1: Add the case**

In `tests/api/test_list_backed_types.py`, add to `CASES`:

```python
    "/api/movies": (
        models.Movies, "movie_name_en", "movie",
        "watching_status", "Completed", "length_min", 148,
    ),
```

- [ ] **Step 2:** Run it; the four movie cases fail.
- [ ] **Step 3:** In `app/registry.py`, the `"movie"` spec gains
  `mark_completed=mark_movie_catalog`, `mark_completed_list=mark_movie_list`,
  `list_backed=True`. `list_filters` already names `watching_status`.
- [ ] **Step 4:** In `app/models/movie.py` delete exactly:

```python
    watching_status = Column(String, nullable=False, default="Might Watch")
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1b3movie_drop_movie_personal.py
"""Drop movies' personal columns.

Revision ID: m1b3movie
Revises: m1b2animemovie
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b3movie"
down_revision: Union[str, Sequence[str], None] = "m1b2animemovie"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM movies m "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = m.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} movies rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("movies", "watching_status")
    op.drop_column("movies", "my_rating")
    op.drop_column("movies", "completed_at")


def downgrade() -> None:
    op.add_column("movies", sa.Column("watching_status", sa.String(), nullable=True))
    op.add_column("movies", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("movies", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE movies m SET
            watching_status = l.status,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = m.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE movies SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("movies", "watching_status", nullable=False)
```

- [ ] **Steps 6–10:** as in Task 10, then:

```bash
git add app/registry.py app/models/movie.py \
        alembic/versions/m1b3movie_drop_movie_personal.py \
        tests/api/test_list_backed_types.py docs/PROGRESS.md
```
Proposed message: `refactor(movie): move the personal columns to user_media_list`
**Ask before running `git commit`.**

---

### Task 12: `tv_shows`

**Files:**
- Modify: `app/registry.py`, `app/models/tv_show.py`, `tests/api/test_list_backed_types.py`
- Create: `alembic/versions/m1b4tvshow_drop_tv_show_personal.py`

Columns dropped, from `app/models/tv_show.py:67,71,73,83`: `watching_status`,
`ep_fin`, `my_rating`, `completed_at`.

- [ ] **Step 1: Add the case**

```python
    "/api/tv-shows": (
        models.TVShows, "tv_name_en", "tv-show",
        "watching_status", "Completed", "ep_total", 10,
    ),
```

The name column is `tv_name_en`, not `tv_show_name_en` — `app/models/tv_show.py:60`.

- [ ] **Step 2:** Run it; the four tv-show cases fail.
- [ ] **Step 3:** `"tv_show"` spec gains `mark_completed=mark_tv_catalog`,
  `mark_completed_list=mark_tv_list`, `list_backed=True`. `list_filters`
  already names `watching_status`.
- [ ] **Step 4:** In `app/models/tv_show.py` delete exactly:

```python
    watching_status = Column(String, nullable=False, default="Might Watch")
    ep_fin = Column(Integer, nullable=True, default=0)
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1b4tvshow_drop_tv_show_personal.py
"""Drop tv_shows' personal columns.

Revision ID: m1b4tvshow
Revises: m1b3movie
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b4tvshow"
down_revision: Union[str, Sequence[str], None] = "m1b3movie"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM tv_shows t "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = t.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} tv_shows rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("tv_shows", "watching_status")
    op.drop_column("tv_shows", "ep_fin")
    op.drop_column("tv_shows", "my_rating")
    op.drop_column("tv_shows", "completed_at")


def downgrade() -> None:
    op.add_column("tv_shows", sa.Column("watching_status", sa.String(), nullable=True))
    op.add_column("tv_shows", sa.Column("ep_fin", sa.Integer(), nullable=True))
    op.add_column("tv_shows", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("tv_shows", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE tv_shows t SET
            watching_status = l.status,
            ep_fin = l.ep_fin,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = t.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE tv_shows SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("tv_shows", "watching_status", nullable=False)
```

- [ ] **Steps 6–10:** as in Task 10, then:

```bash
git add app/registry.py app/models/tv_show.py \
        alembic/versions/m1b4tvshow_drop_tv_show_personal.py \
        tests/api/test_list_backed_types.py docs/PROGRESS.md
```
Proposed message: `refactor(tv-show): move the personal columns to user_media_list`
**Ask before running `git commit`.**

---

### Task 13: `cartoons`

**Files:**
- Modify: `app/registry.py`, `app/models/cartoon.py`, `tests/api/test_list_backed_types.py`
- Create: `alembic/versions/m1b5cartoon_drop_cartoon_personal.py`

Columns dropped, from `app/models/cartoon.py:67,71,74,84`: `watching_status`,
`ep_fin`, `my_rating`, `completed_at`.

- [ ] **Step 1: Add the case**

```python
    "/api/cartoon": (
        models.Cartoon, "cartoon_name_en", "cartoon",
        "watching_status", "Completed", "ep_total", 26,
    ),
```

- [ ] **Step 2:** Run it; the four cartoon cases fail.
- [ ] **Step 3:** `"cartoon"` spec gains `mark_completed=mark_tv_catalog`,
  `mark_completed_list=mark_tv_list`, `list_backed=True`. `list_filters`
  already names `watching_status`.
- [ ] **Step 4:** In `app/models/cartoon.py` delete exactly:

```python
    watching_status = Column(String, nullable=False, default="Might Watch")
    ep_fin = Column(Integer, nullable=True, default=0)
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1b5cartoon_drop_cartoon_personal.py
"""Drop cartoons' personal columns.

Revision ID: m1b5cartoon
Revises: m1b4tvshow
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b5cartoon"
down_revision: Union[str, Sequence[str], None] = "m1b4tvshow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM cartoons c "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = c.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} cartoons rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("cartoons", "watching_status")
    op.drop_column("cartoons", "ep_fin")
    op.drop_column("cartoons", "my_rating")
    op.drop_column("cartoons", "completed_at")


def downgrade() -> None:
    op.add_column("cartoons", sa.Column("watching_status", sa.String(), nullable=True))
    op.add_column("cartoons", sa.Column("ep_fin", sa.Integer(), nullable=True))
    op.add_column("cartoons", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("cartoons", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE cartoons c SET
            watching_status = l.status,
            ep_fin = l.ep_fin,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = c.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE cartoons SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("cartoons", "watching_status", nullable=False)
```

- [ ] **Steps 6–10:** as in Task 10, then:

```bash
git add app/registry.py app/models/cartoon.py \
        alembic/versions/m1b5cartoon_drop_cartoon_personal.py \
        tests/api/test_list_backed_types.py docs/PROGRESS.md
```
Proposed message: `refactor(cartoon): move the personal columns to user_media_list`
**Ask before running `git commit`.**

---

### Task 14: `manga`

**Files:**
- Modify: `app/registry.py`, `app/models/manga.py`,
  `app/services/domain/checking.py`, `tests/api/test_list_backed_types.py`
- Create: `alembic/versions/m1b6manga_drop_manga_personal.py`

Columns dropped, from `app/models/manga.py:80,83,84,86,88,103`:
`reading_status`, `vol_fin`, `vol_fin_page`, `ch_fin`, `my_rating`,
`completed_at`. The three progress counters are `Integer NOT NULL DEFAULT 0` on
`manga` and nullable `Float` / `Integer` on `user_media_list`; the backfill in
Task 3 copied their values including the zeros.

**`checking.py` breaks here.** `apply_validate_vol_math`
(`app/services/domain/checking.py:57-64`) and `apply_validate_ch_math`
(`:67-74`) both read and write `manga.vol_fin` / `manga.ch_fin`, and
`manga_post_processing` calls them on every Fill and Replace. Confine them in
this task: each keeps clamping the **total** and stops touching the `*_fin`
half.

- [ ] **Step 1: Add the case**

```python
    "/api/manga": (
        models.Manga, "manga_name_en", "manga",
        "reading_status", "Completed", "ch_total", 150,
    ),
```

- [ ] **Step 2:** Run it; the four manga cases fail.

- [ ] **Step 3: Confine the two validators — write their test first**

```python
# appended to tests/unit/test_completion_split.py
def test_vol_math_no_longer_touches_progress():
    """vol_fin is one reader's position and lives on their list row; a
    pipeline clamping it would be editing somebody's list."""
    from app.models import Manga
    from app.services.domain.checking import apply_validate_vol_math

    entry = Manga(vol_total=-3)
    apply_validate_vol_math(entry)
    assert entry.vol_total in (0, None)
    assert not hasattr(entry, "vol_fin")


def test_ch_math_no_longer_touches_progress():
    from app.models import Manga
    from app.services.domain.checking import apply_validate_ch_math

    entry = Manga(ch_total=-9)
    apply_validate_ch_math(entry)
    assert entry.ch_total in (0, None)
    assert not hasattr(entry, "ch_fin")
```

Then rewrite both functions in `app/services/domain/checking.py`:

```python
def apply_validate_vol_math(manga) -> bool:
    """
    Clamps vol_total to a sane value. Returns True if it changed.

    vol_fin used to be clamped alongside it, back when both lived on this row.
    It is now on user_media_list and belongs to whoever is reading, so this
    function - which runs inside Fill and Replace - may not touch it.
    """
    safe_total, _ = validate_vol_math(manga.vol_total, None)
    if manga.vol_total != safe_total:
        manga.vol_total = safe_total
        return True
    return False


def apply_validate_ch_math(manga) -> bool:
    """Clamps ch_total. See apply_validate_vol_math for why ch_fin is gone."""
    safe_total, _ = validate_ch_math(manga.ch_total, None)
    if manga.ch_total != safe_total:
        manga.ch_total = safe_total
        return True
    return False
```

Read `validate_vol_math` and `validate_ch_math` in `app/utils/` before writing
this: if either raises on a `None` second argument, pass `0` instead and say so
in the commit.

- [ ] **Step 4:** `"manga"` spec gains `mark_completed=mark_reading_catalog`,
  `mark_completed_list=mark_reading_list`, `list_backed=True`. `list_filters`
  already names `reading_status`.

- [ ] **Step 5:** In `app/models/manga.py` delete exactly:

```python
    reading_status = Column(String, nullable=False, default="Might Read")
    vol_fin = Column(Integer, nullable=False, default=0)
    vol_fin_page = Column(Integer, nullable=False, default=0)
    ch_fin = Column(Integer, nullable=False, default=0)
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

Also delete `check_is_reading_completed` from
`app/services/domain/completion.py` and its export — it reads `entry.ch_fin`
and `entry.vol_fin` and has no caller left after Task 7 removed the one in
`manga_post_processing`. `ruff check .` will confirm.

- [ ] **Step 6: Write the migration**

```python
# alembic/versions/m1b6manga_drop_manga_personal.py
"""Drop manga's personal columns.

Revision ID: m1b6manga
Revises: m1b5cartoon
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b6manga"
down_revision: Union[str, Sequence[str], None] = "m1b5cartoon"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM manga m "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = m.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} manga rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("manga", "reading_status")
    op.drop_column("manga", "vol_fin")
    op.drop_column("manga", "vol_fin_page")
    op.drop_column("manga", "ch_fin")
    op.drop_column("manga", "my_rating")
    op.drop_column("manga", "completed_at")


def downgrade() -> None:
    op.add_column("manga", sa.Column("reading_status", sa.String(), nullable=True))
    op.add_column("manga", sa.Column("vol_fin", sa.Integer(), nullable=True))
    op.add_column("manga", sa.Column("vol_fin_page", sa.Integer(), nullable=True))
    op.add_column("manga", sa.Column("ch_fin", sa.Integer(), nullable=True))
    op.add_column("manga", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("manga", sa.Column("completed_at", sa.DateTime(), nullable=True))
    # vol_fin and ch_fin narrow from double precision back to integer, so they
    # are rounded explicitly rather than left to an implicit truncating cast.
    op.execute(
        """
        UPDATE manga m SET
            reading_status = l.status,
            vol_fin = round(l.vol_fin)::integer,
            vol_fin_page = l.vol_fin_page,
            ch_fin = round(l.ch_fin)::integer,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = m.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE manga SET reading_status = COALESCE(reading_status, 'Might Read'), "
        "vol_fin = COALESCE(vol_fin, 0), "
        "vol_fin_page = COALESCE(vol_fin_page, 0), "
        "ch_fin = COALESCE(ch_fin, 0)"
    )
    op.alter_column("manga", "reading_status", nullable=False)
    op.alter_column("manga", "vol_fin", nullable=False)
    op.alter_column("manga", "vol_fin_page", nullable=False)
    op.alter_column("manga", "ch_fin", nullable=False)
```

- [ ] **Steps 7–10:** apply, confirm one head, run the acceptance case green,
run `pytest -q` and fix fixtures, run all four checks, then:

```bash
git add app/registry.py app/models/manga.py app/services/domain/checking.py \
        app/services/domain/completion.py app/services/domain/__init__.py \
        alembic/versions/m1b6manga_drop_manga_personal.py \
        tests/api/test_list_backed_types.py tests/unit/test_completion_split.py \
        docs/PROGRESS.md
```
Proposed message: `refactor(manga): move the personal columns to user_media_list`
**Ask before running `git commit`.**

---

### Task 15: `novel`

**Files:**
- Modify: `app/registry.py`, `app/models/novel.py`,
  `app/services/domain/novel_units.py`, `app/services/calculation.py`,
  `tests/api/test_list_backed_types.py`
- Create: `alembic/versions/m1b7novel_drop_novel_personal.py`
- Create: `tests/unit/test_derive_novel_progress_split.py`

Columns dropped, from `app/models/novel.py:85,89,91,93,96,97,99,121`:
`reading_status`, `vol_fin`, `arc_fin`, `ch_fin`, `ch_fin_in_arc`,
`progress_display`, `my_rating`, `completed_at`. Novel is the widest of the
nine and the only one where a derivation spans both kinds of fact.

**`derive_novel_progress` has to split.** As written
(`app/services/domain/novel_units.py:66-104`) it sets `arc_total` and
`ch_total` — facts about the work, derived from its arc rows — *and* `arc_fin`,
`ch_fin_in_arc`, `ch_fin` — one reader's position. `clear_chapter_columns`
(`:52-63`) does the same across both. It is called from the registry's
`progress_hook` on every novel write and from `app/services/calculation.py:542`.

- [ ] **Step 1: Write the derivation's failing test**

```python
# tests/unit/test_derive_novel_progress_split.py
"""
derive_novel_progress splits into a catalogue half and a per-user half.

The arithmetic is unchanged - normalize_arc_progress still does the folding -
but arc_total and ch_total are the work's, while arc_fin, ch_fin_in_arc and
ch_fin are the reader's and live on their list row.
"""

from app.models import Novel, NovelUnit, UserMediaList
from app.services.domain.novel_units import (
    derive_novel_catalog,
    derive_novel_list,
)


def _novel_with_arcs(*counts):
    entry = Novel(type="Web Novel")
    entry.units = [
        NovelUnit(unit_kind="arc", position=float(i + 1), ch_count=float(c))
        for i, c in enumerate(counts)
    ]
    return entry


def test_catalog_half_sets_the_totals_only():
    entry = _novel_with_arcs(10, 20, 30)
    derive_novel_catalog(entry)
    assert entry.arc_total == 3.0
    assert entry.ch_total == 60.0


def test_list_half_folds_an_overflowing_cursor_into_the_next_arc():
    entry = _novel_with_arcs(10, 20, 30)
    row = UserMediaList(status="Active Reading", arc_fin=0, ch_fin_in_arc=25)
    derive_novel_list(row, entry)
    assert row.arc_fin == 1.0
    assert row.ch_fin_in_arc == 15.0
    assert row.ch_fin == 25.0


def test_list_half_borrows_downward_on_a_negative_cursor():
    entry = _novel_with_arcs(10, 20, 30)
    row = UserMediaList(status="Active Reading", arc_fin=2, ch_fin_in_arc=-5)
    derive_novel_list(row, entry)
    assert row.arc_fin == 1.0
    assert row.ch_fin_in_arc == 15.0


def test_a_novel_with_no_arcs_only_zeroes_the_in_arc_cursor():
    entry = Novel(type="Web Novel")
    entry.units = []
    row = UserMediaList(status="Active Reading", ch_fin=42, ch_fin_in_arc=7)
    derive_novel_list(row, entry)
    assert row.ch_fin_in_arc == 0
    assert row.ch_fin == 42


def test_a_volume_only_type_clears_both_halves():
    entry = Novel(type="Light Novel", arc_total=3, ch_total=90)
    entry.units = []
    row = UserMediaList(status="Active Reading", arc_fin=2, ch_fin=50, ch_fin_in_arc=3)
    derive_novel_catalog(entry)
    derive_novel_list(row, entry)
    assert entry.arc_total is None
    assert entry.ch_total is None
    assert row.arc_fin == 0
    assert row.ch_fin == 0
    assert row.ch_fin_in_arc == 0


def test_both_halves_are_idempotent():
    entry = _novel_with_arcs(10, 20)
    row = UserMediaList(status="Active Reading", arc_fin=1, ch_fin_in_arc=5)
    derive_novel_catalog(entry)
    derive_novel_list(row, entry)
    first = (entry.arc_total, entry.ch_total, row.arc_fin, row.ch_fin_in_arc, row.ch_fin)
    derive_novel_catalog(entry)
    derive_novel_list(row, entry)
    assert (entry.arc_total, entry.ch_total, row.arc_fin, row.ch_fin_in_arc, row.ch_fin) == first
```

Confirm `NOVEL_VOLUME_ONLY_TYPES` contains `"Light Novel"` before relying on it
— `grep -n "NOVEL_VOLUME_ONLY_TYPES" -A 5 app/utils/constants.py` — and use a
value that is actually in the set.

- [ ] **Step 2:** Run it; it fails on the two missing imports.

- [ ] **Step 3: Split the derivation**

In `app/services/domain/novel_units.py`, replace `clear_chapter_columns` and
`derive_novel_progress` with four functions. `normalize_arc_progress`,
`_num` and `unit_display_key` are unchanged.

```python
def clear_chapter_catalog(entry) -> None:
    """
    Blank the work's chapter and arc totals on a volume-only novel.

    A Light Novel or a Novel is counted in volumes, so these carry no meaning
    for it. Both are nullable, so both go to None.
    """
    entry.arc_total = None
    entry.ch_total = None


def clear_chapter_list(row) -> None:
    """The reader's half of the same clear: the counters go to 0, not None -
    they are a position, and position zero is where you are before you start."""
    row.arc_fin = 0
    row.ch_fin = 0
    row.ch_fin_in_arc = 0


def derive_novel_catalog(entry) -> None:
    """
    Recompute the work's arc_total and ch_total from its arc rows.

    Decision B: only arcs are authoritative. Volume rows are optional
    enrichment, so vol_total_original / vol_total_tw are never touched here.
    The type gates all of it - a volume-only type is cleared outright and
    never derives, even when arc rows are present, which a Pull can carry in.

    Pure: no session, no queries, and idempotent, because it is called from
    every write path and from Calculate.
    """
    if getattr(entry, "type", None) in NOVEL_VOLUME_ONLY_TYPES:
        clear_chapter_catalog(entry)
        return

    arcs = sorted(
        (u for u in (entry.units or []) if u.unit_kind == "arc"),
        key=lambda u: _num(u.position),
    )
    if not arcs:
        return

    counts = [_num(u.ch_count) for u in arcs]
    entry.arc_total = float(len(arcs))
    entry.ch_total = float(sum(counts))


def derive_novel_list(row, entry) -> None:
    """
    Recompute one reader's arc_fin, ch_fin_in_arc and ch_fin from the work's
    arc rows and their own cursor.

    The arithmetic is exactly what derive_novel_progress did; what changed is
    where the answer is written. Two people reading the same web novel fold
    their own cursors through the same arc widths and land in different
    places, which is the whole point.
    """
    if getattr(entry, "type", None) in NOVEL_VOLUME_ONLY_TYPES:
        clear_chapter_list(row)
        return

    arcs = sorted(
        (u for u in (entry.units or []) if u.unit_kind == "arc"),
        key=lambda u: _num(u.position),
    )
    if not arcs:
        row.ch_fin_in_arc = 0
        return

    counts = [_num(u.ch_count) for u in arcs]
    fin, ch = normalize_arc_progress(counts, row.arc_fin, row.ch_fin_in_arc)
    row.arc_fin = float(fin)
    row.ch_fin_in_arc = float(ch)
    row.ch_fin = float(sum(counts[:fin]) + ch)
```

Delete `derive_novel_progress` and `clear_chapter_columns` and their exports
from `app/services/domain/__init__.py`; export the four new names.

- [ ] **Step 4: Rewire the two callers**

`app/registry.py`'s novel spec currently declares
`progress_hook=lambda db, entry: derive_novel_progress(entry)`. The hook runs
inside create, update **and** patch, after columns and nested collections are
applied, and it now needs the list row. Change the signature to take the row:

```python
        progress_hook=lambda db, entry: derive_novel_catalog(entry),
```

and, in `app/routers/_factory.py`'s `_write_list`, run the list half after the
payload is applied — it must see the new cursor:

```python
        if spec.progress_hook_list is not None:
            spec.progress_hook_list(row, entry)
```

with a matching field on `MediaTypeSpec`:

```python
    # (row, entry) -> None, run after a list payload is applied. Only novel
    # uses it; it is the per-user twin of progress_hook.
    progress_hook_list: Optional[Callable] = None
```

set on the novel spec as
`progress_hook_list=lambda row, entry: derive_novel_list(row, entry)`.

`app/services/calculation.py:542` calls `derive_novel_progress(entry)` inside a
loop over novels. It becomes two calls — the catalogue half on the entry, and
the list half on the admin's row if there is one:

```python
    for entry in novels:
        derive_novel_catalog(entry)
        row = list_row(db, acting_user_id(db, None), entry.system_id)
        if row is not None:
            derive_novel_list(row, entry)
```

Read the surrounding lines before editing; keep whatever commit and logging the
loop already does.

- [ ] **Step 5: Add the acceptance case**

```python
    "/api/novel": (
        models.Novel, "novel_name_en", "novel",
        "reading_status", "Completed", "vol_total_original", 12,
    ),
```

Confirm `vol_total_original` exists on `app/models/novel.py` before using it;
if the column is named differently, use the real name and say so in the commit.

- [ ] **Step 6:** `"novel"` spec gains `mark_completed=mark_novel_catalog`,
  `mark_completed_list=mark_novel_list`, `list_backed=True`. `list_filters`
  already names `reading_status`.

- [ ] **Step 7:** In `app/models/novel.py` delete exactly:

```python
    reading_status = Column(String, nullable=False, default="Might Read")
    vol_fin = Column(Float, nullable=False, default=0)
    arc_fin = Column(Float, nullable=False, default=0)
    ch_fin = Column(Float, nullable=False, default=0)
    ch_fin_in_arc = Column(Float, nullable=False, default=0)
    progress_display = Column(String, nullable=True)
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

Keep the comment lines that sit between them; delete only the eight `Column`
assignments. `novel_unit.my_rating` is a **different** column and is handled in
Task 20 — do not touch it here.

- [ ] **Step 8: Write the migration**

```python
# alembic/versions/m1b7novel_drop_novel_personal.py
"""Drop novel's personal columns.

Revision ID: m1b7novel
Revises: m1b6manga
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b7novel"
down_revision: Union[str, Sequence[str], None] = "m1b6manga"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM novel n "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = n.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} novel rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("novel", "reading_status")
    op.drop_column("novel", "vol_fin")
    op.drop_column("novel", "arc_fin")
    op.drop_column("novel", "ch_fin")
    op.drop_column("novel", "ch_fin_in_arc")
    op.drop_column("novel", "progress_display")
    op.drop_column("novel", "my_rating")
    op.drop_column("novel", "completed_at")


def downgrade() -> None:
    op.add_column("novel", sa.Column("reading_status", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("vol_fin", sa.Float(), nullable=True))
    op.add_column("novel", sa.Column("arc_fin", sa.Float(), nullable=True))
    op.add_column("novel", sa.Column("ch_fin", sa.Float(), nullable=True))
    op.add_column("novel", sa.Column("ch_fin_in_arc", sa.Float(), nullable=True))
    op.add_column("novel", sa.Column("progress_display", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("completed_at", sa.DateTime(), nullable=True))
    # Every one of these is double precision on both sides, so no rounding.
    op.execute(
        """
        UPDATE novel n SET
            reading_status = l.status,
            vol_fin = l.vol_fin,
            arc_fin = l.arc_fin,
            ch_fin = l.ch_fin,
            ch_fin_in_arc = l.ch_fin_in_arc,
            progress_display = l.progress_display,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = n.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE novel SET reading_status = COALESCE(reading_status, 'Might Read'), "
        "vol_fin = COALESCE(vol_fin, 0), arc_fin = COALESCE(arc_fin, 0), "
        "ch_fin = COALESCE(ch_fin, 0), ch_fin_in_arc = COALESCE(ch_fin_in_arc, 0)"
    )
    op.alter_column("novel", "reading_status", nullable=False)
    op.alter_column("novel", "vol_fin", nullable=False)
    op.alter_column("novel", "arc_fin", nullable=False)
    op.alter_column("novel", "ch_fin", nullable=False)
    op.alter_column("novel", "ch_fin_in_arc", nullable=False)
```

- [ ] **Step 9:** Apply, confirm one head, run
`tests/unit/test_derive_novel_progress_split.py` and the novel acceptance case
green, run `pytest -q` and fix fixtures, run all four checks. Novel's tracker is
the most intricate UI in the app: open a Web novel with arc rows on :5173 and
step the chapter cursor forward past an arc boundary and back, checking the
two-stage display still folds correctly.

- [ ] **Step 10: Prepare the commit and ask**

```bash
git add app/registry.py app/models/novel.py \
        app/services/domain/novel_units.py app/services/domain/__init__.py \
        app/services/calculation.py app/routers/_factory.py \
        alembic/versions/m1b7novel_drop_novel_personal.py \
        tests/api/test_list_backed_types.py \
        tests/unit/test_derive_novel_progress_split.py docs/PROGRESS.md
```
Proposed message: `refactor(novel): move the personal columns and the reader's half of the derivation to user_media_list`
**Ask before running `git commit`.**

---

### Task 16: `comic`

**Files:**
- Modify: `app/registry.py`, `app/models/comic.py`, `tests/api/test_list_backed_types.py`
- Create: `alembic/versions/m1b8comic_drop_comic_personal.py`

Columns dropped, from `app/models/comic.py:84,86,89,99`: `issue_fin`,
`reading_status`, `my_rating`, `completed_at`. `read_order` stays — it is the
comic's position in a reading order, a catalogue fact.

- [ ] **Step 1: Add the case**

```python
    "/api/comic": (
        models.Comic, "comic_name_en", "comic",
        "reading_status", "Completed", "issue_total", 6,
    ),
```

- [ ] **Step 2:** Run it; the four comic cases fail.
- [ ] **Step 3:** `"comic"` spec gains `mark_completed=mark_comic_catalog`,
  `mark_completed_list=mark_comic_list`, `list_backed=True`. `list_filters`
  already names `reading_status`.
- [ ] **Step 4:** In `app/models/comic.py` delete exactly:

```python
    issue_fin = Column(Integer, nullable=False, default=0)
    reading_status = Column(String, nullable=False, default="Might Read")
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1b8comic_drop_comic_personal.py
"""Drop comic's personal columns.

Revision ID: m1b8comic
Revises: m1b7novel
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b8comic"
down_revision: Union[str, Sequence[str], None] = "m1b7novel"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM comic c "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = c.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} comic rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("comic", "issue_fin")
    op.drop_column("comic", "reading_status")
    op.drop_column("comic", "my_rating")
    op.drop_column("comic", "completed_at")


def downgrade() -> None:
    op.add_column("comic", sa.Column("issue_fin", sa.Integer(), nullable=True))
    op.add_column("comic", sa.Column("reading_status", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE comic c SET
            issue_fin = l.issue_fin,
            reading_status = l.status,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = c.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE comic SET reading_status = COALESCE(reading_status, 'Might Read'), "
        "issue_fin = COALESCE(issue_fin, 0)"
    )
    op.alter_column("comic", "reading_status", nullable=False)
    op.alter_column("comic", "issue_fin", nullable=False)
```

- [ ] **Steps 6–10:** as in Task 10. `tests/api/conftest.py:sample_comic` sets
`reading_status="Completed", issue_fin=6` and must be rewritten the way
`sample_anime` was in Task 9 — `issue_total` stays on the model, the pair moves
to a list row. Then:

```bash
git add app/registry.py app/models/comic.py \
        alembic/versions/m1b8comic_drop_comic_personal.py \
        tests/api/test_list_backed_types.py tests/api/conftest.py docs/PROGRESS.md
```
Proposed message: `refactor(comic): move the personal columns to user_media_list`
**Ask before running `git commit`.**

---

### Task 17: `games`

**Files:**
- Modify: `app/registry.py`, `app/models/game.py`, `tests/api/test_list_backed_types.py`
- Create: `alembic/versions/m1b9game_drop_game_personal.py`

Columns dropped, from `app/models/game.py:106,153,163`: `playing_status`,
`my_rating`, `completed_at`.

**Only those three.** `games` carries a further nine columns that are arguably
personal — `completion_level`, `all_endings`, `all_achievements`,
`all_collected`, `steam_progress_sync`, `achievements_earned`,
`achievements_total`, `hours_played`, `current_patch` — and the spec's Step 1
row does not name any of them. They stay on `games` in this step; see "Where
the spec was wrong" for why that is a real gap and what has to happen to it.
Do not widen the scope here.

- [ ] **Step 1: Add the case**

```python
    "/api/game": (
        models.Game, "game_name_en", "game",
        "playing_status", "Completed", "hltb_main", 24.5,
    ),
```

- [ ] **Step 2:** Run it; the four game cases fail.
- [ ] **Step 3:** `"game"` spec gains `mark_completed=mark_game_catalog`,
  `mark_completed_list=mark_game_list`, `list_backed=True`. `list_filters`
  already names `playing_status`.
- [ ] **Step 4:** In `app/models/game.py` delete exactly:

```python
    playing_status = Column(String, nullable=False, default="Might Play")
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
```

Leave every comment around them in place — they explain `completion_level` and
the three `all_*` flags, which are staying.

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1b9game_drop_game_personal.py
"""Drop games' personal status, rating and completion date.

The nine other personal-looking game columns - completion_level, the three
all_* flags, the achievement pair, hours_played, steam_progress_sync and
current_patch - deliberately stay. They are outside the spec's step 1 scope
and moving them is its own change.

Revision ID: m1b9game
Revises: m1b8comic
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m1b9game"
down_revision: Union[str, Sequence[str], None] = "m1b8comic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM games g "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = g.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} games rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("games", "playing_status")
    op.drop_column("games", "my_rating")
    op.drop_column("games", "completed_at")


def downgrade() -> None:
    op.add_column("games", sa.Column("playing_status", sa.String(), nullable=True))
    op.add_column("games", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("games", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE games g SET
            playing_status = l.status,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = g.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE games SET playing_status = 'Might Play' WHERE playing_status IS NULL"
    )
    op.alter_column("games", "playing_status", nullable=False)
```

- [ ] **Steps 6–10:** as in Task 10, then:

```bash
git add app/registry.py app/models/game.py \
        alembic/versions/m1b9game_drop_game_personal.py \
        tests/api/test_list_backed_types.py docs/PROGRESS.md
```
Proposed message: `refactor(game): move playing_status, my_rating and completed_at to user_media_list`
**Ask before running `git commit`.**

---

### Task 18: Remove the flag and the dead helpers

**Files:**
- Modify: `app/registry.py`, `app/routers/_factory.py`,
  `app/services/domain/completion.py`, `app/services/domain/__init__.py`
- Create: `tests/unit/test_every_type_is_list_backed.py`

All nine types are list-backed, so the flag has done its job and every
`if spec.list_backed:` branch is now unconditional. Leaving it would leave a
second, untested code path that quietly becomes wrong.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_every_type_is_list_backed.py
"""No media type keeps its personal columns after step 1."""

from app import models
from app.registry import MEDIA_REGISTRY
from app.services.domain.user_list import LIST_FIELDS, STATUS_FIELD

PERSONAL = {
    "watching_status", "reading_status", "playing_status", "my_rating",
    "ep_fin", "vol_fin", "vol_fin_page", "ch_fin", "arc_fin",
    "ch_fin_in_arc", "progress_display", "issue_fin", "my_watch_day",
    "completed_at",
}


def test_no_detail_model_declares_a_personal_column():
    for key, spec in MEDIA_REGISTRY.items():
        columns = set(spec.model.__table__.columns.keys())
        assert not (columns & PERSONAL), f"{key}: {columns & PERSONAL}"


def test_the_list_backed_flag_is_gone():
    """Once every type is list-backed the flag is dead weight and a second,
    untested branch through the router factory."""
    from app.registry import MediaTypeSpec

    assert not hasattr(MediaTypeSpec, "list_backed")


def test_every_spec_declares_both_completion_halves():
    for key, spec in MEDIA_REGISTRY.items():
        assert spec.mark_completed is not None, key
        assert spec.mark_completed_list is not None, key


def test_every_specs_status_field_matches_the_service_table():
    for spec in MEDIA_REGISTRY.values():
        assert spec.status_field == STATUS_FIELD[spec.owner_type]
        assert spec.status_field in LIST_FIELDS[spec.owner_type]


def test_user_media_list_is_the_only_home_for_a_status():
    assert "status" in models.UserMediaList.__table__.columns
```

- [ ] **Step 2:** Run it; `test_the_list_backed_flag_is_gone` fails.

- [ ] **Step 3:** Delete `list_backed` from `MediaTypeSpec` and from all nine
specs. In `app/routers/_factory.py`, remove every `if spec.list_backed:` guard
and unindent its body; delete the `else: apply_completion_timestamp(...)`
branches in `update` and `patch` and the `elif entry.completed_at is None`
branch in `complete`.

- [ ] **Step 4:** Delete the six now-unused originals from
`app/services/domain/completion.py` — `mark_tv_completed`,
`mark_movie_completed`, `mark_reading_completed`, `mark_novel_completed`,
`mark_comic_completed`, `mark_game_completed` — plus `check_is_tv_completed`,
`check_is_movie_completed` and `apply_completion_timestamp`, and their
`__init__.py` exports. Run `grep -rn "mark_tv_completed\|apply_completion_timestamp" app/ tests/`
first and fix any remaining caller rather than deleting past it.

- [ ] **Step 5:** Run all four checks; all green.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/registry.py app/routers/_factory.py \
        app/services/domain/completion.py app/services/domain/__init__.py \
        tests/unit/test_every_type_is_list_backed.py docs/PROGRESS.md
```
Proposed message: `refactor(list): drop the list_backed flag; all nine types are list-backed`
**Ask before running `git commit`.**

---

# Phase C — Confine

The schema is done; the write paths that used to reach into it are not.

### Task 19: `game_copy` gains `user_id`

**Files:**
- Modify: `app/models/game_copy.py`
- Modify: `app/services/domain/game_copies.py`
- Modify: `app/registry.py` (the `_game_ownership` filter)
- Create: `alembic/versions/m1c1gamecopy_add_user_id.py`
- Create: `tests/api/test_game_copy_is_personal.py`

**Interfaces:**
- Consumes: `acting_user_id` (Task 2).
- Produces: `game_copy.user_id` NOT NULL, and `uq_game_copy_row` widened to
  include it.

A `game_copy` row records "which storefront do I own this on, what did I pay,
when did I buy it" (`app/models/game_copy.py:21-34`). That is a purchase
record, and two people own different copies of the same game. It stays a
per-type table — its six columns mean nothing for the other eight media types —
and gains an owner.

`uq_game_copy_row` is `UNIQUE (game_id, storefront, copy_format)` today. With
two owners that is wrong: we can both own Hollow Knight, Digital, on Steam. It
becomes `UNIQUE (user_id, game_id, storefront, copy_format)`.

`_game_ownership` in `app/registry.py:107-121` builds an `EXISTS` over
`game_copy` for `?ownership=Owned`, and must scope it to the acting user or one
person's purchases start filtering another's list.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_game_copy_is_personal.py
"""A game copy belongs to whoever bought it."""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def a_game(db, admin_client):
    response = admin_client.post("/api/game/", json={"game_name_en": "Copy Sentinel"})
    assert response.status_code == 201, response.text
    return uuid.UUID(response.json()["system_id"])


def test_a_copy_written_through_the_router_belongs_to_the_acting_user(
    db, admin_client, a_game
):
    response = admin_client.patch(
        f"/api/game/{a_game}",
        json={"copies": [{"storefront": "Steam", "ownership": "Owned",
                          "copy_format": "Digital"}]},
    )
    assert response.status_code == 200, response.text
    copy = db.query(models.GameCopy).filter(models.GameCopy.game_id == a_game).one()
    assert copy.user_id == acting_user_id(db, None)


def test_two_users_may_own_the_same_edition_of_the_same_game(db, a_game):
    other = models.User(
        id=uuid.uuid4(),
        username="copy_other",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "guest"),
    )
    db.add(other)
    db.flush()
    for user_id in (acting_user_id(db, None), other.id):
        db.add(
            models.GameCopy(
                system_id=uuid.uuid4(),
                user_id=user_id,
                game_id=a_game,
                storefront="Steam",
                copy_format="Digital",
                ownership="Owned",
            )
        )
    db.flush()
    assert db.query(models.GameCopy).filter(
        models.GameCopy.game_id == a_game
    ).count() == 2


def test_the_ownership_filter_sees_only_the_acting_users_copies(
    db, admin_client, a_game
):
    other = models.User(
        id=uuid.uuid4(),
        username="copy_filter_other",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "guest"),
    )
    db.add(other)
    db.flush()
    db.add(
        models.GameCopy(
            system_id=uuid.uuid4(),
            user_id=other.id,
            game_id=a_game,
            storefront="GOG",
            copy_format="Digital",
            ownership="Owned",
        )
    )
    db.flush()

    rows = admin_client.get("/api/game/?ownership=Owned&limit=2000").json()
    assert str(a_game) not in {r["system_id"] for r in rows}
```

- [ ] **Step 2:** Run it; the first and third fail (`user_id` does not exist,
and the filter sees everyone's copies).

- [ ] **Step 3: Add the column**

In `app/models/game_copy.py`, after `game_id`:

```python
    # Whose purchase this is. A copy is a purchase record, not a fact about
    # the game, so two people own two rows for the same edition.
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
```

and widen the unique constraint in `__table_args__`:

```python
        UniqueConstraint(
            "user_id", "game_id", "storefront", "copy_format",
            name="uq_game_copy_row",
        ),
```

- [ ] **Step 4: Set it on write, and scope the filter**

In `app/services/domain/game_copies.py`, the writer that `write_game_copies`
calls builds `GameCopy(...)` rows. Read the function first, then set
`user_id=acting_user_id(db, viewer)` on every row it constructs, and scope the
delete-and-replace it does to that user's rows only — a whole-set replace must
not delete somebody else's purchases. If the writer's signature does not
already receive the viewer, note that `nested_collections` writers are called
as `spec.nested_collections[key](db, entry, value, viewer)`
(`app/routers/_factory.py:_write_nested`), so the viewer is available.

In `app/registry.py`, `_game_ownership` becomes:

```python
def _game_ownership(query, params, user_id=None):
    """?ownership=Owned -> games this user has at least one copy row for.

    Ownership is derived from the copy rows rather than stored, and a copy row
    belongs to whoever bought it, so the EXISTS is scoped by user.
    """
    wanted = params.get("ownership")
    if not wanted:
        return query
    conditions = [
        models.GameCopy.game_id == models.Game.system_id,
        models.GameCopy.ownership == wanted,
    ]
    if user_id is not None:
        conditions.append(models.GameCopy.user_id == user_id)
    return query.filter(exists().where(*conditions))
```

`extra_filters` is called as `spec.extra_filters(query, request.query_params)`
in `list_entries`. Add the third argument at that call site and give
`_anime_airing_season` the same defaulted third parameter so both signatures
match:

```python
        if spec.extra_filters:
            query = spec.extra_filters(query, request.query_params, user_id)
```

- [ ] **Step 5: Write the migration**

```python
# alembic/versions/m1c1gamecopy_add_user_id.py
"""game_copy belongs to a user.

Revision ID: m1c1gamecopy
Revises: m1b9game
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m1c1gamecopy"
down_revision: Union[str, Sequence[str], None] = "m1b9game"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    admin_id = conn.execute(
        sa.text(
            "SELECT u.id FROM users u "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name = 'admin' ORDER BY u.username LIMIT 1"
        )
    ).scalar()
    if admin_id is None:
        raise RuntimeError("No admin user found; game_copy cannot be assigned an owner.")

    op.add_column(
        "game_copy",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    conn.execute(
        sa.text("UPDATE game_copy SET user_id = :uid").bindparams(uid=admin_id)
    )
    op.alter_column("game_copy", "user_id", nullable=False)
    op.create_index("ix_game_copy_user", "game_copy", ["user_id"])
    op.create_foreign_key(
        "fk_game_copy_user", "game_copy", "users",
        ["user_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_constraint("uq_game_copy_row", "game_copy", type_="unique")
    op.create_unique_constraint(
        "uq_game_copy_row", "game_copy",
        ["user_id", "game_id", "storefront", "copy_format"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_game_copy_row", "game_copy", type_="unique")
    # Two users' copies of the same edition would now collide, so keep the
    # admin's and drop the rest before the narrow constraint goes back on.
    conn = op.get_bind()
    admin_id = conn.execute(
        sa.text(
            "SELECT u.id FROM users u "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name = 'admin' ORDER BY u.username LIMIT 1"
        )
    ).scalar()
    if admin_id is not None:
        conn.execute(
            sa.text("DELETE FROM game_copy WHERE user_id <> :uid").bindparams(
                uid=admin_id
            )
        )
    op.create_unique_constraint(
        "uq_game_copy_row", "game_copy", ["game_id", "storefront", "copy_format"]
    )
    op.drop_constraint("fk_game_copy_user", "game_copy", type_="foreignkey")
    op.drop_index("ix_game_copy_user", table_name="game_copy")
    op.drop_column("game_copy", "user_id")
```

- [ ] **Step 6:** Apply, confirm one head, run the new module green, run
`pytest -q` and all four checks.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/models/game_copy.py app/services/domain/game_copies.py \
        app/registry.py app/routers/_factory.py \
        alembic/versions/m1c1gamecopy_add_user_id.py \
        tests/api/test_game_copy_is_personal.py docs/PROGRESS.md
```
Proposed message: `feat(game): a game copy belongs to the user who bought it`
**Ask before running `git commit`.**

---

### Task 20: `novel_unit.my_rating` becomes `user_novel_unit_rating`

**Files:**
- Create: `app/models/user_novel_unit_rating.py`
- Modify: `app/models/__init__.py`, `app/models/novel.py`
- Modify: `app/services/domain/novel_unit_writer.py`, `app/schemas/novel.py`
- Modify: `app/utils/formatter.py`
- Create: `alembic/versions/m1c2unitrating_user_novel_unit_rating.py`
- Create: `tests/api/test_novel_unit_rating_is_personal.py`

`novel_unit.my_rating` (`app/models/novel.py:191`) is one reader's opinion of
one volume or arc. It cannot go on `user_media_list` — that table is keyed by
`media_id` and a unit is not a media entry — so it gets its own thin join
table, exactly as the spec's `user_media_list` section says.

```python
# app/models/user_novel_unit_rating.py
"""One reader's rating of one novel unit.

novel_unit.my_rating was a per-unit personal rating on a shared row. It cannot
live on user_media_list, which is keyed by media_id, because a unit is a part
of an entry rather than an entry. A two-column join table is the smallest thing
that is correct.
"""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class UserNovelUnitRating(Base):
    __tablename__ = "user_novel_unit_rating"
    __table_args__ = (
        UniqueConstraint("user_id", "unit_id", name="uq_user_novel_unit"),
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
    unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("novel_unit.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of constants.MY_RATINGS - a letter grade, not a number.
    my_rating = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
```

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_novel_unit_rating_is_personal.py
"""A unit rating belongs to the reader, not to the unit."""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def novel_with_arcs(admin_client):
    response = admin_client.post(
        "/api/novel/",
        json={
            "novel_name_en": "Unit Rating Sentinel",
            "type": "Web Novel",
            "units": [
                {"unit_kind": "arc", "position": 1, "name_en": "Arc One",
                 "ch_count": 10, "my_rating": "A"},
                {"unit_kind": "arc", "position": 2, "name_en": "Arc Two",
                 "ch_count": 12},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_the_unit_row_carries_no_rating_column(db, novel_with_arcs):
    unit = db.query(models.NovelUnit).filter(
        models.NovelUnit.name_en == "Arc One"
    ).one()
    assert not hasattr(unit, "my_rating")


def test_the_rating_lands_in_the_readers_own_row(db, novel_with_arcs):
    unit = db.query(models.NovelUnit).filter(
        models.NovelUnit.name_en == "Arc One"
    ).one()
    rating = db.query(models.UserNovelUnitRating).filter(
        models.UserNovelUnitRating.unit_id == unit.system_id
    ).one()
    assert rating.my_rating == "A"
    assert rating.user_id == acting_user_id(db, None)


def test_the_response_still_carries_my_rating_on_each_unit(novel_with_arcs):
    by_name = {u["name_en"]: u for u in novel_with_arcs["units"]}
    assert by_name["Arc One"]["my_rating"] == "A"
    assert by_name["Arc Two"]["my_rating"] is None


def test_deleting_the_unit_removes_the_rating(db, admin_client, novel_with_arcs):
    unit = db.query(models.NovelUnit).filter(
        models.NovelUnit.name_en == "Arc One"
    ).one()
    unit_id = unit.system_id
    db.delete(unit)
    db.commit()
    assert db.query(models.UserNovelUnitRating).filter(
        models.UserNovelUnitRating.unit_id == unit_id
    ).first() is None
```

- [ ] **Step 2:** Run it; every case fails.

- [ ] **Step 3:** Write the model, export it from `app/models/__init__.py`, and
delete `my_rating` from `NovelUnit` in `app/models/novel.py` (the column at
`:191` plus the two comment lines directly above it that describe it).

- [ ] **Step 4:** In `app/services/domain/novel_unit_writer.py`, pop
`my_rating` out of each incoming unit dict before the `NovelUnit` row is built,
and upsert a `UserNovelUnitRating` for `acting_user_id(db, viewer)` after the
unit is flushed. Read the writer first — it is a whole-set replace, so deleting
a unit must leave the ratings to cascade rather than orphan. On the read side,
attach `my_rating` back onto each unit the way `attach_list_fields` does, so
`app/schemas/novel.py`'s unit schema needs no change.

- [ ] **Step 5:** `app/utils/formatter.py:745` parses `my_rating` on the Novel
Unit sheet tab. Leave the parser alone but drop `my_rating` from the tab's
column set — the value now travels in Task 22's `User Media List` sibling tab.
Read `app/services/pipelines/tabs.py` for the Novel Unit entry and add
`drop_columns=("my_rating",)` if the header is derived from the model, or
remove the key from the parser if it is spelled out.

- [ ] **Step 6: Write the migration**

```python
# alembic/versions/m1c2unitrating_user_novel_unit_rating.py
"""Move novel_unit.my_rating into user_novel_unit_rating.

Revision ID: m1c2unitrating
Revises: m1c1gamecopy
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m1c2unitrating"
down_revision: Union[str, Sequence[str], None] = "m1c1gamecopy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    admin_id = conn.execute(
        sa.text(
            "SELECT u.id FROM users u "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name = 'admin' ORDER BY u.username LIMIT 1"
        )
    ).scalar()
    if admin_id is None:
        raise RuntimeError("No admin user found; unit ratings cannot be assigned.")

    op.create_table(
        "user_novel_unit_rating",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_user_novel_unit_rating_user", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["unit_id"], ["novel_unit.system_id"],
            name="fk_user_novel_unit_rating_unit", ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "unit_id", name="uq_user_novel_unit"),
    )
    op.create_index(
        "ix_user_novel_unit_rating_system_id", "user_novel_unit_rating", ["system_id"]
    )
    op.create_index(
        "ix_user_novel_unit_rating_user", "user_novel_unit_rating", ["user_id"]
    )
    op.create_index(
        "ix_user_novel_unit_rating_unit", "user_novel_unit_rating", ["unit_id"]
    )

    # Only units that actually carry a rating; a null one is nothing to move.
    conn.execute(
        sa.text(
            "INSERT INTO user_novel_unit_rating "
            "(system_id, user_id, unit_id, my_rating, created_at, updated_at) "
            "SELECT gen_random_uuid(), :uid, system_id, my_rating, "
            "       COALESCE(created_at, now()), COALESCE(updated_at, now()) "
            "FROM novel_unit WHERE my_rating IS NOT NULL"
        ).bindparams(uid=admin_id)
    )

    op.drop_column("novel_unit", "my_rating")


def downgrade() -> None:
    op.add_column("novel_unit", sa.Column("my_rating", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE novel_unit n SET my_rating = r.my_rating
        FROM user_novel_unit_rating r
        JOIN users u ON u.id = r.user_id
        JOIN role ro ON ro.system_id = u.role_id
        WHERE r.unit_id = n.system_id AND ro.name = 'admin'
        """
    )
    op.drop_index("ix_user_novel_unit_rating_unit", table_name="user_novel_unit_rating")
    op.drop_index("ix_user_novel_unit_rating_user", table_name="user_novel_unit_rating")
    op.drop_index(
        "ix_user_novel_unit_rating_system_id", table_name="user_novel_unit_rating"
    )
    op.drop_table("user_novel_unit_rating")
```

- [ ] **Step 7:** Apply, confirm one head, run the new module green, run
`pytest -q` and all four checks. Open a Web novel's unit editor on :5173 and
set an arc rating; it must save and come back.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/models/user_novel_unit_rating.py app/models/__init__.py \
        app/models/novel.py app/services/domain/novel_unit_writer.py \
        app/services/pipelines/tabs.py app/utils/formatter.py \
        alembic/versions/m1c2unitrating_user_novel_unit_rating.py \
        tests/api/test_novel_unit_rating_is_personal.py docs/PROGRESS.md
```
Proposed message: `feat(novel): a unit rating belongs to the reader`
**Ask before running `git commit`.**

---

### Task 21: Confine the pipelines, and prove it with a test

**Files:**
- Modify: `app/services/pipelines/pull.py`
- Modify: `app/utils/formatter.py`
- Modify: `app/services/domain/checking.py` (only if Task 14 left anything)
- Create: `tests/services/test_pipelines_write_no_personal_columns.py`

**Interfaces:**
- Consumes: `LIST_FIELDS` and `models.UserMediaList` (Tasks 1–2).
- Produces: a guard test that fails the build if any pipeline write path names
  a `user_media_list` column.

**This is the task the spec singles out.** Fill, Replace, Pull and the autofill
hooks wrote catalogue and personal columns in the same statement. A pipeline
that can silently change a user's `watching_status` is a data-loss bug once
there is more than one user, and the models no longer stop it — a pipeline that
sets an attribute the model does not declare fails loudly on a `Model(**dict)`
but silently on a `setattr`, and `pull.py` uses `setattr`
(`app/services/pipelines/pull.py:987`).

Most of the confinement already happened: Task 7 took the `mark_*` calls out of
`post_processing`, Task 14 confined the two manga validators, Task 15 split the
novel derivation. What is left is Pull's own defaults and the sheet parsers.

- [ ] **Step 1: Write the guard test**

```python
# tests/services/test_pipelines_write_no_personal_columns.py
"""
No pipeline write path may name a user_media_list column.

Static, not behavioural: this reads the pipeline modules' source and fails on
the mention. A behavioural test would need one case per pipeline per column,
and would still miss the next one somebody adds. The blunt version is the one
that keeps working.

Whitelisted mentions are listed explicitly with a reason. Adding to that list
is a decision, which is the point of making it a literal.
"""

import ast
import pathlib

import pytest

from app.services.domain.user_list import LIST_FIELDS

ROOT = pathlib.Path(__file__).resolve().parents[2]

# Every payload key that lives on a list row, from the one table that defines
# them. Derived, so a column added to user_media_list is guarded from day one.
PERSONAL = {field for fields in LIST_FIELDS.values() for field in fields}

PIPELINE_FILES = [
    "app/services/pipelines/fill.py",
    "app/services/pipelines/replace.py",
    "app/services/pipelines/pull.py",
    "app/services/pipelines/specs.py",
    "app/services/pipelines/runner.py",
    "app/services/domain/post_processing.py",
    "app/services/domain/autofill.py",
    "app/services/domain/checking.py",
]

# name -> why it is allowed to appear. Empty at the start; add a line and a
# reason if a genuine catalogue use of one of these names turns up.
ALLOWED: dict[str, str] = {}


def _identifiers(path: pathlib.Path) -> set[str]:
    """Every attribute name, keyword argument and string literal in the file."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            found.add(node.attr)
        elif isinstance(node, ast.keyword) and node.arg:
            found.add(node.arg)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            found.add(node.value)
        elif isinstance(node, ast.Name):
            found.add(node.id)
    return found


@pytest.mark.parametrize("relative", PIPELINE_FILES)
def test_no_pipeline_file_names_a_personal_column(relative):
    path = ROOT / relative
    if not path.exists():
        pytest.skip(f"{relative} does not exist")
    named = _identifiers(path) & PERSONAL
    named -= set(ALLOWED)
    assert not named, (
        f"{relative} names personal column(s) {sorted(named)}. A pipeline may "
        "not write anyone's list row; move the write to a list-aware service "
        "or, if this is a genuine catalogue use, add it to ALLOWED with a reason."
    )


def test_no_sheet_parser_for_a_media_tab_parses_a_personal_column():
    """The nine media tabs carry catalogue columns only; the personal values
    travel in the User Media List tab."""
    import inspect

    from app.utils import formatter

    parsers = [
        formatter.parse_anime_from_sheet,
        formatter.parse_anime_movie_from_sheet,
        formatter.parse_movie_from_sheet,
        formatter.parse_tv_show_from_sheet,
        formatter.parse_cartoon_from_sheet,
        formatter.parse_manga_from_sheet,
        formatter.parse_novel_from_sheet,
        formatter.parse_comic_from_sheet,
        formatter.parse_game_from_sheet,
    ]
    for parser in parsers:
        source = inspect.getsource(parser)
        named = {name for name in PERSONAL if f'"{name}"' in source}
        assert not named, f"{parser.__name__} parses {sorted(named)}"


def test_the_guard_actually_has_teeth():
    """A canary: if PERSONAL ever comes back empty the two tests above pass
    vacuously and guard nothing."""
    assert len(PERSONAL) >= 12
    assert "watching_status" in PERSONAL
    assert "my_rating" in PERSONAL
```

- [ ] **Step 2: Run it and see what it catches**

Run: `venv/Scripts/python.exe -m pytest tests/services/test_pipelines_write_no_personal_columns.py -v`
Expected: `pull.py` fails on `watching_status` / `playing_status` /
`reading_status` (its insert defaults at `:956-971`), and the nine parser cases
fail. Write down the full list before fixing anything — it is the task's real
scope.

- [ ] **Step 3: Strip Pull's status defaults**

In `app/services/pipelines/pull.py`, the INSERT-only sanitisation block sets a
default status for the media tabs. The status column is gone from those models,
so those lines would now `setattr` a nonexistent attribute. Delete the three
status lines and keep the timestamp lines, which are still real columns:

```python
        if existing is None:
            # Blank airing_status / airing_type stay NULL: "" is in no
            # vocabulary and defeats every `airing_type in {...}` check.
            #
            # The watching/reading/playing status defaults that used to live
            # here are gone: status is on user_media_list now, and Pull
            # restoring a media tab must not touch anybody's list. The User
            # Media List tab carries them, and a new row without one gets its
            # default from user_list.DEFAULT_STATUS when the list row is made.
            if tab_name in (
                "Anime", "Movies", "Anime Movie", "TV Shows", "Cartoons",
                "Game", "Manga",
            ):
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
            elif tab_name in ("Collection", "Franchise", "Series"):
                ...
```

Read the surrounding branch before editing — Novel and Comic were not in the
original list and adding them is a change; if they need timestamps too, say so
in the commit rather than folding it in silently.

- [ ] **Step 4: Strip the parsers**

In `app/utils/formatter.py`, delete the personal keys from each of the nine
media parsers. Exactly which, per parser:

- `parse_anime_from_sheet` (`:424`): `watching_status`, `ep_fin`, `my_rating`,
  `my_watch_day`, `completed_at`
- `parse_anime_movie_from_sheet` (`:477`): `watching_status`, `my_rating`,
  `completed_at`
- `parse_movie_from_sheet` (`:517`): `watching_status`, `my_rating`,
  `completed_at`
- `parse_tv_show_from_sheet` (`:558`): `watching_status`, `ep_fin`,
  `my_rating`, `completed_at`
- `parse_cartoon_from_sheet` (`:592`): `watching_status`, `ep_fin`,
  `my_rating`, `completed_at`
- `parse_manga_from_sheet` (`:627`): `reading_status`, `vol_fin`,
  `vol_fin_page`, `ch_fin`, `my_rating`, `completed_at`
- `parse_novel_from_sheet` (`:672`): `reading_status`, `vol_fin`, `arc_fin`,
  `ch_fin`, `ch_fin_in_arc`, `progress_display`, `my_rating`, `completed_at`
- `parse_comic_from_sheet` (`:751`): `issue_fin`, `reading_status`,
  `my_rating`, `completed_at`
- `parse_game_from_sheet` (`:797`): `playing_status`, `my_rating`,
  `completed_at`

**Do not touch** `parse_franchise_from_sheet`, `parse_collection_from_sheet`,
`parse_series_from_sheet`, `parse_person_from_sheet`,
`parse_character_from_sheet`, `parse_studio_from_sheet`,
`parse_publisher_from_sheet` or `parse_seasonal_from_sheet`. They each have a
`my_rating` of their own on a grouping tier or an entity, which this step does
not move — the tiers stay shared and admin-curated by design. The guard test
lists only the nine media parsers for exactly that reason.

- [ ] **Step 5: Run the guard green**

```
venv/Scripts/python.exe -m pytest tests/services/test_pipelines_write_no_personal_columns.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: all green. If `pull.py` still trips the guard on a name used for
something unrelated, add it to `ALLOWED` **with a written reason** rather than
weakening the check.

- [ ] **Step 6: Run a real Fill against one entry**

Start the app, pick one anime with a `mal_id`, note its status and rating, run
`/system` → Fill for anime, and check that the catalogue fields updated and the
list row did not move. This is the one behaviour the whole task exists to
protect and a static test cannot prove it.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/pipelines/pull.py app/utils/formatter.py \
        tests/services/test_pipelines_write_no_personal_columns.py \
        docs/PROGRESS.md
```
Proposed message: `refactor(pipelines): confine Fill, Replace and Pull to catalogue columns`
**Ask before running `git commit`.**

---

### Task 22: The `User Media List` sheet tab

**Files:**
- Modify: `app/services/pipelines/tabs.py`
- Modify: `app/utils/formatter.py`
- Modify: `app/services/pipelines/pull.py`
- Create: `tests/services/test_user_media_list_tab.py`

**Why this belongs to Step 1 and not to Step 4.** Task 21 just took the
personal columns off the nine media tabs, and the spec puts the new tabs in
Step 4. Between the two, a Backup would write no ratings and no progress
anywhere, and a Pull All on the other machine would restore an empty list.
`CLAUDE.md` is explicit that the sheet is how data travels between the company
and home machines and that it holds exactly one version of the data. Leaving
that broken across a step boundary loses real data on the next environment
switch. Step 4 still does the rest — a `Media` tab, a `Users` tab, the
denormalized `display_name` column on each media tab — but the list has to
round-trip now.

**Identify the entry by `media_type` + `public_id`, and the user by
`username`.** Not by `system_id`: the sheet's uuids belong to whichever
database last ran a Backup, and `public_id` is the stable per-type number the
URLs already use. There is exactly one user in Step 1, so `username` resolves
unambiguously.

- [ ] **Step 1: Write the failing test**

```python
# tests/services/test_user_media_list_tab.py
"""The User Media List tab round-trips a list row."""

import pytest

from app.services.pipelines.tabs import SHEET_TABS
from app.utils import formatter


def test_the_tab_is_registered_after_every_media_tab():
    """Restore order is strict: the entries a list row points at must exist
    before the list row is inserted."""
    names = [t.name for t in SHEET_TABS]
    assert "User Media List" in names
    index = names.index("User Media List")
    for media_tab in (
        "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons",
        "Manga", "Novel", "Comic", "Game",
    ):
        assert names.index(media_tab) < index, media_tab


def test_the_parser_reads_the_natural_key_and_every_progress_column():
    row = {
        "media_type": "anime",
        "public_id": "412",
        "username": "admin",
        "status": "Completed",
        "my_rating": "S",
        "ep_fin": "28",
        "my_watch_day": "Friday",
        "vol_fin": "3.5",
        "issue_fin": "6",
        "completed_at": "2024-03-22 00:00:00",
    }
    parsed = formatter.parse_user_media_list_from_sheet(row)
    assert parsed["media_type"] == "anime"
    assert parsed["public_id"] == 412
    assert parsed["username"] == "admin"
    assert parsed["status"] == "Completed"
    assert parsed["my_rating"] == "S"
    assert parsed["ep_fin"] == 28
    assert parsed["vol_fin"] == 3.5
    assert parsed["issue_fin"] == 6


def test_the_parser_leaves_a_blank_progress_column_null():
    parsed = formatter.parse_user_media_list_from_sheet(
        {"media_type": "game", "public_id": "77", "username": "admin",
         "status": "Might Play", "ep_fin": "", "my_rating": ""}
    )
    assert parsed["ep_fin"] is None
    assert parsed["my_rating"] is None


@pytest.mark.parametrize("missing", ["media_type", "public_id", "username"])
def test_a_row_missing_part_of_its_key_is_refused(missing):
    row = {"media_type": "anime", "public_id": "1", "username": "admin",
           "status": "Completed"}
    row.pop(missing)
    with pytest.raises((KeyError, ValueError)):
        formatter.parse_user_media_list_from_sheet(row)
```

- [ ] **Step 2:** Run it; the parser does not exist and the tab is not
registered.

- [ ] **Step 3: Write the parser**

In `app/utils/formatter.py`, beside the other parsers:

```python
def parse_user_media_list_from_sheet(raw: dict) -> dict:
    """
    One user's list row, keyed naturally rather than by uuid.

    media_type + public_id identifies the entry and username identifies the
    person, because the sheet's uuids belong to whichever database last ran a
    Backup while public_id is stable and is already in the URLs. Pull resolves
    both to real ids before writing; a row whose key is incomplete is refused
    rather than guessed at.
    """
    media_type = parse_from_sheet(raw.get("media_type"), str)
    public_id = parse_from_sheet(raw.get("public_id"), int)
    username = parse_from_sheet(raw.get("username"), str)
    if not media_type or public_id is None or not username:
        raise ValueError(
            "User Media List row needs media_type, public_id and username; "
            f"got {media_type!r}, {public_id!r}, {username!r}"
        )
    return {
        "media_type": media_type,
        "public_id": public_id,
        "username": username,
        "status": parse_from_sheet(raw.get("status"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
        "my_watch_day": parse_from_sheet(raw.get("my_watch_day"), str),
        "ep_fin": parse_from_sheet(raw.get("ep_fin"), int),
        "vol_fin": parse_from_sheet(raw.get("vol_fin"), float),
        "vol_fin_page": parse_from_sheet(raw.get("vol_fin_page"), int),
        "ch_fin": parse_from_sheet(raw.get("ch_fin"), float),
        "arc_fin": parse_from_sheet(raw.get("arc_fin"), float),
        "ch_fin_in_arc": parse_from_sheet(raw.get("ch_fin_in_arc"), float),
        "progress_display": parse_from_sheet(raw.get("progress_display"), str),
        "issue_fin": parse_from_sheet(raw.get("issue_fin"), int),
    }
```

- [ ] **Step 4: Register the tab**

In `app/services/pipelines/tabs.py`, add the entry **after all nine media
tabs** — the module docstring states the order is the restore order and is
strict, and a list row points at an entry and at a user:

```python
    # Personal list rows. After every media tab: media_id resolves through
    # media_type + public_id, and user_id through username, so both must
    # already be restored. Backup drops the three database-local ids and
    # writes the natural key in their place.
    SheetTab(
        "User Media List",
        models.UserMediaList,
        f.parse_user_media_list_from_sheet,
        drop_columns=("system_id", "user_id", "media_id"),
        extra_columns=(
            ("media_type", _list_row_media_type),
            ("public_id", _list_row_public_id),
            ("username", _list_row_username),
        ),
    ),
```

with the three resolvers above `SHEET_TABS`, in the shape of the existing
`_option_category` / `_option_value` helpers:

```python
def _list_row_media(row: Any, db: Session) -> Optional["models.Media"]:
    return db.get(models.Media, row.media_id)


def _list_row_media_type(row: Any, db: Session) -> Optional[str]:
    media = _list_row_media(row, db)
    return media.media_type if media else None


def _list_row_public_id(row: Any, db: Session) -> Optional[int]:
    media = _list_row_media(row, db)
    return media.public_id if media else None


def _list_row_username(row: Any, db: Session) -> Optional[str]:
    user = db.get(models.User, row.user_id)
    return user.username if user else None
```

- [ ] **Step 5: Teach Pull to resolve the natural key**

`pull.py` upserts by primary key. A `User Media List` row has none in the
sheet, so it needs the same treatment `DERIVED_IDENTITY_KEYS` gives the other
naturally-keyed tabs (`app/services/pipelines/pull.py:935-947`). Add a branch
in `_match_by_natural_key` for the tab that resolves
`(media_type, public_id) -> media.system_id` and `username -> users.id`, sets
`media_id` and `user_id` on the payload, drops the three key columns, and
returns the existing `UserMediaList` row for that pair if there is one. A row
whose entry or user cannot be resolved is skipped with a logged warning, not
inserted with a null FK — the FK would reject it anyway and take the whole
restore with it.

- [ ] **Step 6: Round-trip it for real**

Run `/system` → Backup, open the sheet, confirm the `User Media List` tab has
one row per entry with the right ratings and that the nine media tabs no longer
carry personal columns. Then, on a scratch database, run Pull All and confirm
the list comes back. **Do this on a scratch database, not the dev one** — Pull
All overwrites every table.

- [ ] **Step 7:** Run all four checks.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/pipelines/tabs.py app/services/pipelines/pull.py \
        app/utils/formatter.py tests/services/test_user_media_list_tab.py \
        docs/PROGRESS.md
```
Proposed message: `feat(sheets): carry the personal list in its own User Media List tab`
**Ask before running `git commit`.**

---

### Task 23: Documentation

**Files:**
- Modify: `docs/data-model.md`, `docs/data-actions.md`,
  `docs/business-rules.md`, `docs/api.md`, `docs/roadmap.md`,
  `docs/PROGRESS.md`

- [ ] **Step 1:** In `docs/data-model.md`, add the `user_media_list` and
  `user_novel_unit_rating` sections, remove the personal columns from all nine
  media-table descriptions, note `game_copy.user_id`, and record the accepted
  trade (one wide null-heavy table over nine per-type ones) so it is not
  relitigated. Bump `Last verified`.

- [ ] **Step 2:** In `docs/data-actions.md`, document that Fill, Replace, Pull
  and the autofill hooks write catalogue columns only, that the rule is
  enforced by `tests/services/test_pipelines_write_no_personal_columns.py`, and
  that the restore order now requires `users` and every media tab to land
  before `User Media List`. Bump `Last verified`.

- [ ] **Step 3:** In `docs/business-rules.md`, rewrite the completion rules:
  finishing is now two facts — the work finished airing or serialising
  (catalogue) and a person finished it (their list row) — and a pipeline may
  only assert the first. Note that `seasonal` counters are the admin's until
  Step 3. Bump `Last verified`.

- [ ] **Step 4:** In `docs/api.md`, note that the nine media endpoints still
  serve and accept the same personal field names, now backed by
  `user_media_list` and resolved for the acting user, and that an entry with no
  list row reads as the type's default status. Bump `Last verified`.

- [ ] **Step 5:** In `docs/roadmap.md`, record that Step 1 shipped and what it
  leaves for Steps 2–5, including the nine game columns Task 17 did not move.

- [ ] **Step 6:** Delete this plan's table from `docs/PROGRESS.md` and remove
  the `anime_site_test_step1` row from the Environment table if the database is
  dropped.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add docs/data-model.md docs/data-actions.md docs/business-rules.md \
        docs/api.md docs/roadmap.md docs/PROGRESS.md
```
Proposed message: `docs: record user_media_list and the catalogue/personal split`
**Ask before running `git commit`.**

---

## Definition of done

- No detail model declares a personal column, asserted by
  `tests/unit/test_every_type_is_list_backed.py`.
- `SELECT count(*) FROM user_media_list` equals `SELECT count(*) FROM media`,
  and every row belongs to the admin.
- The nine detail pages and the nine list pages behave exactly as they did
  before this plan: same statuses, same ratings, same progress, same filters.
  No frontend file changed.
- `DELETE FROM media WHERE system_id = …` still removes the list row, via the
  `media_id` cascade; `DELETE FROM users WHERE id = …` removes that user's
  whole list and nothing else.
- No pipeline write path names a `user_media_list` column
  (`tests/services/test_pipelines_write_no_personal_columns.py`).
- Backup writes a `User Media List` tab and Pull All restores it.
- `venv/Scripts/python.exe -m alembic heads` shows exactly one head; the chain
  runs `m1a1umlist → m1a2umbackfill → m1b1anime → m1b2animemovie → m1b3movie →
  m1b4tvshow → m1b5cartoon → m1b6manga → m1b7novel → m1b8comic → m1b9game →
  m1c1gamecopy → m1c2unitrating`.
- All four checks green.

## What Steps 2–5 inherit

- `Viewer.user_id` (Task 4) is the field Steps 2, 3 and 5 all filter on.
  Step 2 replaces `acting_user_id`'s admin fallback with a real
  `None`-plus-visibility check; nothing else about it changes.
- `user_media_list` is ready for a second user the day accounts exist. Step 2
  adds no schema.
- `sync_seasonal_counts` (Task 8) is written scoped to one user, so Step 3
  widens the same function and moves `seasonal`'s primary key to
  `(user_id, seasonal)`.
- The `User Media List` tab (Task 22) already carries a `username`, so Step 4
  adds the `Media` and `Users` tabs beside it rather than reshaping it.
- `LIST_FIELDS` / `STATUS_FIELD` in `app/services/domain/user_list.py` are the
  one place the personal vocabulary lives. Step 5's note scoping follows the
  same pattern in `app/utils/note_sections.py`.

## Where the spec was wrong about the code

Read against the models before writing this plan. The spec's Step 1 row and its
`user_media_list` section are right about the shape; these are the places the
code does not match the description.

1. **`tv_shows`, `movies`, `cartoons` and `comic` have three name columns, not
   five,** and TV's are `tv_name_en` / `tv_name_cn` / `tv_name_alt` — not
   `tv_show_name_*`. Step 0's Tasks 4–11 table says `tv_show_name_cn/_en/
   _roman/_jp/_alt`; that is wrong and Step 0's own instruction to confirm
   against `_name_fields` is what catches it. Called out here because Task 12
   of this plan uses `tv_name_en` and a reader coming from Step 0 will expect
   otherwise.

2. **`manga.vol_fin`, `vol_fin_page` and `ch_fin` are `Integer`, not `Float`,**
   and all three are `NOT NULL DEFAULT 0`. The spec types `vol_fin` and
   `ch_fin` as `Float` on `user_media_list`, which is right for novel and a
   widening for manga; the downgrades in Tasks 14 must therefore round
   explicitly. The spec does not mention the direction problem.

3. **`novel`'s five progress columns are `NOT NULL DEFAULT 0` too**, as is
   `comic.issue_fin`. On `user_media_list` they are all nullable. The backfill
   copies the zeros rather than converting them to NULL; the spec is silent and
   converting would be a data change dressed up as a move.

4. **`Viewer` has no `user_id`.** The spec's central query
   (`LEFT JOIN user_media_list l ON … AND l.user_id = :viewer`) cannot be
   written against the current `Viewer`, even though `resolve_viewer` already
   loads the `User` row. Task 4 adds it. Steps 2, 3 and 5 all depend on it.

5. **`my_rating` is a letter grade, not a number.** `constants.MY_RATINGS` is
   `("S", "A+", "A", "B", "C", "D", "E", "F")`, stored as `String`. The spec's
   worked example shows `9.5` and its community-aggregate query does
   `ROUND(AVG(l.my_rating::numeric), 2)` — that raises on the first row, and
   `ORDER BY my_rating DESC` puts `A+` above `A` and `S` last. Any ordering or
   averaging needs a letter-to-points mapping. Nothing in this plan sorts or
   averages a rating; Step 2's community aggregate must not ship without one.

6. **`mark_*_completed` writes catalogue columns as well as personal ones.**
   The spec says only that the completion services "become per-user: they take
   a `user_id` and write a list row". They cannot simply move:
   `mark_tv_completed` also sets `airing_status`, and `mark_reading_completed`
   also sets `serialization_status`, `ch_total` and `vol_total`. Each has to be
   split at the seam, which is Task 7 and is most of a task on its own.

7. **`derive_novel_progress` writes both kinds of fact,** setting `arc_total`
   and `ch_total` (catalogue) beside `arc_fin`, `ch_fin_in_arc` and `ch_fin`
   (personal). The spec names it as something that "becomes per-user"; it
   splits in two, which is Task 15.

8. **`apply_validate_episode_math`, `apply_validate_vol_math` and
   `apply_validate_ch_math` are pipeline code that writes `ep_fin`, `vol_fin`
   and `ch_fin`.** The spec's pipeline paragraph does not name them, and the
   guard test it asks for would have failed on them. Tasks 14 and 21 confine
   them.

9. **`sync_seasonal_counts` reads `anime.watching_status` at four sites**
   (`app/services/domain/seasonal.py:108-114`) and would raise on every Fill
   and Replace of anime the moment the column is dropped. The spec assigns
   `seasonal` to Step 3, but the repair cannot wait for it. Task 8.
   (`create_missing_seasonal` in the same module reads only `release_season`
   and `release_date` and is unaffected.)

10. **`games` carries nine further personal columns the spec does not name:**
    `completion_level`, `all_endings`, `all_achievements`, `all_collected`,
    `steam_progress_sync`, `achievements_earned`, `achievements_total`,
    `hours_played`, `current_patch`. Every one of them is a fact about a
    player, not about the game — `hours_played` most obviously. This plan
    leaves them on `games` because they are outside the Step 1 scope the spec
    defines, but that is a real gap: after Step 2 two players share one
    `hours_played`. It needs its own change, and `docs/roadmap.md` should say
    so (Task 23, Step 5).

11. **The Sheets gap between Step 1 and Step 4.** The spec puts the new tabs in
    Step 4, but Step 1 is what takes the personal columns off the nine media
    tabs. Between the two, a Backup writes no ratings at all and the
    two-machine workflow silently loses data on the next switch. Task 22 adds
    the `User Media List` tab in this step for that reason; Step 4 still adds
    `Media` and `Users` and the denormalized `display_name` columns.

12. **`franchise`, `collection`, `series`, `person`, `character`, `studio`,
    `publisher` and `seasonal` each have a `my_rating` of their own.** None of
    them moves in Step 1 — the grouping tiers stay shared and admin-curated by
    decision, and the four entity tables are not media. The guard test in Task
    21 therefore lists the nine media parsers explicitly rather than scanning
    `formatter.py` for the name.
