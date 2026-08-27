# Media Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed `prequel_id` / `sequel_id` / `alternative` columns with one polymorphic `media_relation` table covering nine relation kinds across all seven media tables, curated on a new admin page at `/relations`.

**Architecture:** One row per relation, storing an FK-less `(from_type, from_id)` → `(to_type, to_id)` pair plus a `relation_type`, exactly as `watch_order_item` already stores cross-table entry references. The inverse direction is derived at read time from a `RELATION_KINDS` registry rather than stored, so one fact is always one row. Auto-derivation from `watch_order` is retired; relations become hand-curated.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, Alembic, pytest, React + Vite, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-08-23-media-relations-design.md`

## Global Constraints

- **The plan and spec are NOT committed.** `docs/superpowers/plans/2026-08-23-media-relations.md` and `docs/superpowers/specs/2026-08-23-media-relations-design.md` must never appear in a `git add`. Every commit step below stages named source files only.
- **Never use `git add -A` or `git commit -a`.** Other Claude Code sessions edit this same working tree on this same branch. Stage only the exact files a task names, and re-read the diff of each before staging. If a file you need contains changes you did not make, stop and report rather than committing the mix.
- **Never commit without the user's approval.** Each task's commit step is written out for when approval comes; show the one-line message and wait.
- **Media type keys** are the hyphenated slugs already used by `MEDIA_TABLES` in `app/utils/media_resolver.py`: `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`. These are *not* the underscore keys in `app/registry.py`.
- **Physical table names** differ from the slugs: `anime`, `anime_movies`, `movies`, `tv_shows`, `cartoons`, `manga`, `novel`.
- **The eight stored kinds** are exactly: `sequel`, `alternative`, `renew`, `directors_cut`, `extended`, `side_story`, `spin_off`, `adaptation`. `prequel` is accepted on write but **never stored** — it becomes a `sequel` row with the endpoints swapped.
- **The four families** are exactly: `timeline`, `equivalence`, `branch`, `derivation`.
- **Tests need PostgreSQL running** (`docker-compose up -d`) and the `anime_site_test` database. See `tests/api/conftest.py`.
- **After any frontend change run `cd frontend && npm run build`** before claiming it works — `:5173` serves source, `:8000` serves `frontend_dist/`.

---

### Task 1: Relation kinds registry

The vocabulary, with no database or HTTP involved. Everything downstream reads it, so it lands first and alone.

**Files:**
- Create: `app/utils/relation_kinds.py`
- Test: `tests/unit/test_relation_kinds.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `RelationKind` dataclass (fields `key: str`, `label: str`, `inverse_label: str`, `family: str`, `symmetric: bool = False`); `RELATION_KINDS: dict[str, RelationKind]`; `RELATION_KEYS: tuple[str, ...]`; `RELATION_FAMILIES: tuple[str, ...]`; `INPUT_ONLY_KINDS: dict[str, str]`; `ACCEPTED_INPUT_KINDS: tuple[str, ...]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_relation_kinds.py`:

```python
"""
Unit tests for the relation kind registry.

Pure data, no database — mirrors tests/unit/test_watch_order_resolver.py in
spirit but needs no fixtures.
"""

from app.utils.relation_kinds import (
    ACCEPTED_INPUT_KINDS,
    INPUT_ONLY_KINDS,
    RELATION_FAMILIES,
    RELATION_KEYS,
    RELATION_KINDS,
)


def test_eight_stored_kinds():
    assert set(RELATION_KEYS) == {
        "sequel",
        "alternative",
        "renew",
        "directors_cut",
        "extended",
        "side_story",
        "spin_off",
        "adaptation",
    }


def test_every_kind_declares_a_label_and_inverse_label():
    for key, kind in RELATION_KINDS.items():
        assert kind.key == key, f"{key} disagrees with its registry key"
        assert kind.label.strip(), f"{key} has a blank label"
        assert kind.inverse_label.strip(), f"{key} has a blank inverse_label"


def test_every_family_is_known():
    for kind in RELATION_KINDS.values():
        assert kind.family in RELATION_FAMILIES


def test_symmetric_is_true_exactly_when_label_equals_inverse_label():
    for kind in RELATION_KINDS.values():
        assert kind.symmetric == (kind.label == kind.inverse_label)


def test_only_alternative_is_symmetric():
    symmetric = {k for k, v in RELATION_KINDS.items() if v.symmetric}
    assert symmetric == {"alternative"}


def test_labels_are_unique():
    labels = [k.label for k in RELATION_KINDS.values()]
    assert len(labels) == len(set(labels))


def test_prequel_is_input_only_and_maps_to_sequel():
    assert INPUT_ONLY_KINDS == {"prequel": "sequel"}
    assert "prequel" not in RELATION_KINDS
    assert "prequel" in ACCEPTED_INPUT_KINDS


def test_accepted_input_kinds_covers_the_nine_user_facing_choices():
    assert len(ACCEPTED_INPUT_KINDS) == 9
    assert set(RELATION_KEYS).issubset(set(ACCEPTED_INPUT_KINDS))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_relation_kinds.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.relation_kinds'`

- [ ] **Step 3: Write the implementation**

Create `app/utils/relation_kinds.py`:

```python
"""
The vocabulary of `media_relation.relation_type`.

Nine user-facing labels compress to eight stored kinds, because Prequel is
Sequel read backwards. Storing both directions as distinct kinds would let one
fact exist as two rows that no unique index could catch, so `prequel` is
accepted on write and immediately normalized into a `sequel` row with the two
endpoints swapped.

Deliberately shaped like MEDIA_TABLES in app/utils/media_resolver.py: a frozen
dataclass per entry, a dict keyed by the value stored in the column, and a tuple
of keys for validation. Both are registries for cross-table facts and read the
same way on purpose.

This module is the single source of truth for the admin dropdown, the docs
table, and the inverse rendering. The frontend fetches it over HTTP
(GET /api/media-relation/kinds) rather than keeping a second copy.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RelationKind:
    """One relation kind, read as `from` → `to`."""

    # Value stored in media_relation.relation_type.
    key: str
    # How the relation reads on the `from` entry's page.
    label: str
    # How the same row reads on the `to` entry's page. Equal to `label` only
    # for a symmetric kind.
    inverse_label: str
    # One of RELATION_FAMILIES — how the admin page groups the rows.
    family: str
    # True when the relation means the same thing in both directions, which is
    # what lets the service sort the two endpoints before writing so that
    # A-alt-B and B-alt-A collapse to one row.
    symmetric: bool = False


RELATION_FAMILIES: tuple[str, ...] = (
    "timeline",
    "equivalence",
    "branch",
    "derivation",
)


RELATION_KINDS: dict[str, RelationKind] = {
    "sequel": RelationKind(
        "sequel", "Sequel", "Prequel", "timeline"
    ),
    "alternative": RelationKind(
        "alternative", "Alternative", "Alternative", "equivalence", symmetric=True
    ),
    # Renew, Director's Cut and Extended are all directional flavours of
    # "another version of the same work", so they share one inverse: whatever
    # they point at is the Original.
    "renew": RelationKind(
        "renew", "Renew", "Original", "equivalence"
    ),
    "directors_cut": RelationKind(
        "directors_cut", "Director's Cut", "Original", "equivalence"
    ),
    "extended": RelationKind(
        "extended", "Extended", "Original", "equivalence"
    ),
    "side_story": RelationKind(
        "side_story", "Side Story", "Parent Story", "branch"
    ),
    "spin_off": RelationKind(
        "spin_off", "Spin-off", "Main Story", "branch"
    ),
    "adaptation": RelationKind(
        "adaptation", "Adaptation", "Source", "derivation"
    ),
}


RELATION_KEYS: tuple[str, ...] = tuple(RELATION_KINDS)

# The one kind the API accepts but never stores. Picking "Prequel" for B and
# choosing A writes the row A —sequel→ B.
INPUT_ONLY_KINDS: dict[str, str] = {"prequel": "sequel"}

# What POST /api/media-relation and PATCH will accept as `kind`: the eight
# stored kinds plus `prequel`, which is the nine choices the dropdown offers.
ACCEPTED_INPUT_KINDS: tuple[str, ...] = RELATION_KEYS + tuple(INPUT_ONLY_KINDS)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/unit/test_relation_kinds.py -v`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit (after user approval)**

```bash
git add app/utils/relation_kinds.py tests/unit/test_relation_kinds.py
git commit -m "feat(relations): add the relation kind registry"
```

---

### Task 2: The `media_relation` model and its table

The table itself, plus the Alembic revision that creates it. Nothing drops yet — this revision is purely additive so it can be applied and verified before anything is removed.

**Files:**
- Create: `app/models/media_relation.py`
- Create: `alembic/versions/media_relation_add.py`
- Modify: `app/models/__init__.py`
- Test: `tests/api/test_media_relation_model.py`

**Interfaces:**
- Consumes: `RELATION_KEYS` from Task 1 (used only in the docstring/comment, not as a DB constraint — the vocabulary is enforced in the API layer, matching how `ITEM_IMPORTANCE` is enforced for watch order items).
- Produces: `models.MediaRelation` with columns `system_id`, `from_type`, `from_id`, `relation_type`, `to_type`, `to_id`, `remark`, `created_at`, `updated_at`; the check constraint `ck_media_relation_no_self`; the unique constraint `uq_media_relation_pair`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_media_relation_model.py`:

```python
"""
Database-level tests for the media_relation table.

Lives under tests/api/ rather than tests/unit/ because it needs a real
PostgreSQL session to exercise the constraints. Requires the anime_site_test
DB — see tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def _relation(from_id, to_id, relation_type="sequel"):
    return models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=from_id,
        relation_type=relation_type,
        to_type="anime-movie",
        to_id=to_id,
    )


def test_can_store_a_cross_media_type_relation(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    row = _relation(a, b)
    db_session.add(row)
    db_session.flush()

    stored = db_session.query(models.MediaRelation).one()
    assert stored.from_type == "anime"
    assert stored.to_type == "anime-movie"
    assert stored.relation_type == "sequel"
    # Timestamps default like every other model in the project.
    assert stored.created_at is not None


def test_self_relation_is_rejected(db_session):
    same = uuid.uuid4()
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=same,
        relation_type="alternative",
        to_type="anime",
        to_id=same,
    )
    db_session.add(row)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_different_entry_of_the_same_type_is_allowed(db_session):
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=uuid.uuid4(),
        relation_type="alternative",
        to_type="anime",
        to_id=uuid.uuid4(),
    )
    db_session.add(row)
    db_session.flush()
    assert db_session.query(models.MediaRelation).count() == 1


def test_the_identical_pair_and_kind_cannot_be_stored_twice(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    db_session.add(_relation(a, b))
    db_session.flush()
    db_session.add(_relation(a, b))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_the_same_pair_under_a_different_kind_is_allowed(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    db_session.add(_relation(a, b, "sequel"))
    db_session.add(_relation(a, b, "side_story"))
    db_session.flush()
    assert db_session.query(models.MediaRelation).count() == 2
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/api/test_media_relation_model.py -v`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'MediaRelation'`

- [ ] **Step 3: Write the model**

Create `app/models/media_relation.py`:

```python
"""Media Relation ORM model — typed, cross-media-type links between two entries."""

import uuid
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class MediaRelation(Base):
    """
    One typed link between two media entries, stored once and read both ways.

    Both endpoints are deliberately FK-less (media_type, entry_id) pairs, the
    same contract `watch_order_item` uses: no single foreign key can span the
    seven media tables. A deleted entry therefore leaves a dangling endpoint,
    which the read-time resolver flags as missing rather than silently dropping,
    so it stays visible and fixable in the admin page.

    Direction matters. The row reads `from` → `to`: with relation_type
    "sequel", `from` is the sequel of `to`. The reverse label ("Prequel") is
    derived at read time from RELATION_KINDS, never stored — otherwise one fact
    could exist as two rows that no unique constraint could catch.

    Replaces the prequel_id / sequel_id / alternative columns, which could hold
    only one link each, carried no type discriminator (so a link could never
    leave its own table), and excluded anime_movies entirely.
    """

    __tablename__ = "media_relation"
    __table_args__ = (
        # An entry cannot relate to itself. Caught here as well as in the
        # router so a bad row can never be written by Pull either.
        CheckConstraint(
            "NOT (from_type = to_type AND from_id = to_id)",
            name="ck_media_relation_no_self",
        ),
        # One fact, one row. The service normalizes direction before writing —
        # `prequel` becomes a swapped `sequel`, and a symmetric `alternative`
        # sorts its two endpoints — so that this constraint actually catches
        # the duplicate a user would otherwise create from the other side.
        UniqueConstraint(
            "from_type",
            "from_id",
            "relation_type",
            "to_type",
            "to_id",
            name="uq_media_relation_pair",
        ),
        # Both directions are queried on every entry read, so neither endpoint
        # can rely on the other's index.
        Index("ix_media_relation_from", "from_type", "from_id"),
        Index("ix_media_relation_to", "to_type", "to_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    from_type = Column(String, nullable=False)
    from_id = Column(UUID(as_uuid=True), nullable=False)

    # One of RELATION_KINDS in app/utils/relation_kinds.py. Not a DB enum: the
    # vocabulary is validated in the API layer, the same choice already made
    # for watch_order_item.importance, so adding a kind needs no migration.
    relation_type = Column(String, nullable=False)

    to_type = Column(String, nullable=False)
    to_id = Column(UUID(as_uuid=True), nullable=False)

    # Free text scoping the link, e.g. "covers ep 1-12 only".
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
```

- [ ] **Step 4: Register the model**

In `app/models/__init__.py`, add the import after the `watch_order` line:

```python
from app.models.watch_order import WatchOrderList, WatchOrderItem
from app.models.media_relation import MediaRelation
```

and add `"MediaRelation",` to `__all__` directly after `"WatchOrderItem",`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pytest tests/api/test_media_relation_model.py -v`
Expected: PASS, 5 tests. (The session fixture rebuilds the schema from the models, so no migration is needed for tests to see the table.)

- [ ] **Step 6: Write the Alembic revision**

Find the current head first:

Run: `alembic heads`

Create `alembic/versions/media_relation_add.py`, setting `down_revision` to whatever `alembic heads` printed:

```python
"""create the media_relation table

Revision ID: media_relation_add
Revises: note_drop_jsonb
Create Date: 2026-08-23 00:00:00.000000

Purely additive: the legacy prequel_id / sequel_id / alternative columns are
dropped in a later revision, once no code reads them. That split means this one
can be applied and verified against real data on its own.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'media_relation_add'
# Replace with the output of `alembic heads` if it is not note_drop_jsonb.
down_revision: Union[str, Sequence[str], None] = 'note_drop_jsonb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "media_relation",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_type", sa.String(), nullable=False),
        sa.Column("from_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("relation_type", sa.String(), nullable=False),
        sa.Column("to_type", sa.String(), nullable=False),
        sa.Column("to_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.CheckConstraint(
            "NOT (from_type = to_type AND from_id = to_id)",
            name="ck_media_relation_no_self",
        ),
        sa.UniqueConstraint(
            "from_type",
            "from_id",
            "relation_type",
            "to_type",
            "to_id",
            name="uq_media_relation_pair",
        ),
    )
    op.create_index(
        "ix_media_relation_system_id", "media_relation", ["system_id"]
    )
    op.create_index(
        "ix_media_relation_from", "media_relation", ["from_type", "from_id"]
    )
    op.create_index(
        "ix_media_relation_to", "media_relation", ["to_type", "to_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_media_relation_to", table_name="media_relation")
    op.drop_index("ix_media_relation_from", table_name="media_relation")
    op.drop_index("ix_media_relation_system_id", table_name="media_relation")
    op.drop_table("media_relation")
```

- [ ] **Step 7: Apply and verify the migration round-trips**

```bash
alembic upgrade head
alembic downgrade -1
alembic upgrade head
```

Expected: all three succeed with no error. Confirm the table exists:

```bash
psql -U postgres -d anime_site -c "\d media_relation"
```

Expected: the nine columns, the two named constraints, and three indexes.

- [ ] **Step 8: Commit (after user approval)**

```bash
git add app/models/media_relation.py app/models/__init__.py alembic/versions/media_relation_add.py tests/api/test_media_relation_model.py
git commit -m "feat(relations): add the media_relation table"
```

---

### Task 3: Normalization and read service

The two pieces of real logic: turning a typed-in direction into the stored one, and reading a single entry's relations from both sides with the correct label on each.

**Files:**
- Create: `app/services/domain/media_relation.py`
- Test: `tests/api/test_media_relation_service.py`

**Interfaces:**
- Consumes: `RELATION_KINDS`, `INPUT_ONLY_KINDS`, `ACCEPTED_INPUT_KINDS` (Task 1); `models.MediaRelation` (Task 2); `resolve_entries`, `entry_ref_for`, `MEDIA_TABLES` from `app/utils/media_resolver.py`.
- Produces:
  - `normalize_relation(from_type, from_id, kind, to_type, to_id) -> tuple[str, UUID, str, str, UUID]` returning `(from_type, from_id, relation_type, to_type, to_id)` in stored form.
  - `find_duplicate(db, from_type, from_id, relation_type, to_type, to_id, exclude_id=None) -> Optional[MediaRelation]`.
  - `relations_for_entry(db, media_type, entry_id) -> List[dict]`.
  - `entry_exists(db, media_type, entry_id) -> bool` re-exported from `app.services.domain.watch_order`.

  There is deliberately no per-entry count helper: the admin page's badges are tallied client-side from the one scope-wide listing it already fetches, so a second server-side counter would be dead code.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_media_relation_service.py`:

```python
"""
Tests for relation normalization and both-direction reads.

Needs a database for the read helpers, so it lives under tests/api/.
"""

import uuid

from app import models
from app.services.domain.media_relation import (
    find_duplicate,
    normalize_relation,
    relations_for_entry,
)


# ---------------------------------------------------------------------------
# normalize_relation — pure
# ---------------------------------------------------------------------------


def test_a_stored_kind_passes_through_unchanged():
    a, b = uuid.uuid4(), uuid.uuid4()
    assert normalize_relation("anime", a, "sequel", "movie", b) == (
        "anime", a, "sequel", "movie", b,
    )


def test_prequel_becomes_a_swapped_sequel():
    a, b = uuid.uuid4(), uuid.uuid4()
    # "B's prequel is A" is stored as "A is the sequel of B".
    assert normalize_relation("anime", b, "prequel", "manga", a) == (
        "manga", a, "sequel", "anime", b,
    )


def test_alternative_sorts_its_endpoints_so_both_orders_agree():
    a, b = uuid.uuid4(), uuid.uuid4()
    forward = normalize_relation("anime", a, "alternative", "movie", b)
    reverse = normalize_relation("movie", b, "alternative", "anime", a)
    assert forward == reverse


def test_a_directional_equivalence_kind_keeps_its_direction():
    a, b = uuid.uuid4(), uuid.uuid4()
    forward = normalize_relation("movie", a, "directors_cut", "movie", b)
    reverse = normalize_relation("movie", b, "directors_cut", "movie", a)
    assert forward != reverse


# ---------------------------------------------------------------------------
# find_duplicate
# ---------------------------------------------------------------------------


def test_find_duplicate_sees_an_existing_identical_row(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=a,
            relation_type="sequel",
            to_type="movie", to_id=b,
        )
    )
    db_session.flush()

    assert find_duplicate(db_session, "anime", a, "sequel", "movie", b) is not None
    assert find_duplicate(db_session, "anime", a, "side_story", "movie", b) is None


def test_find_duplicate_can_exclude_the_row_being_edited(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime", from_id=a,
        relation_type="sequel",
        to_type="movie", to_id=b,
    )
    db_session.add(row)
    db_session.flush()

    assert find_duplicate(
        db_session, "anime", a, "sequel", "movie", b, exclude_id=row.system_id
    ) is None


# ---------------------------------------------------------------------------
# relations_for_entry — both directions, correct label on each
# ---------------------------------------------------------------------------


def test_forward_and_reverse_rows_get_the_right_label(
    db_session, sample_franchise, sample_anime
):
    other = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Second Season",
    )
    db_session.add(other)
    db_session.flush()

    # `other` is the sequel of `sample_anime`.
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=other.system_id,
            relation_type="sequel",
            to_type="anime", to_id=sample_anime.system_id,
        )
    )
    db_session.flush()

    # Read from the `from` side: it IS the sequel.
    forward = relations_for_entry(db_session, "anime", other.system_id)
    assert len(forward) == 1
    assert forward[0]["label"] == "Sequel"
    assert forward[0]["direction"] == "forward"
    assert forward[0]["family"] == "timeline"
    assert forward[0]["other"]["entry_id"] == sample_anime.system_id
    assert forward[0]["other"]["missing"] is False

    # Read from the `to` side: the same row reads as a Prequel.
    reverse = relations_for_entry(db_session, "anime", sample_anime.system_id)
    assert len(reverse) == 1
    assert reverse[0]["label"] == "Prequel"
    assert reverse[0]["direction"] == "reverse"
    assert reverse[0]["other"]["entry_id"] == other.system_id


def test_a_symmetric_relation_reads_the_same_from_both_sides(
    db_session, sample_anime, sample_franchise
):
    movie = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Compilation Movie",
    )
    db_session.add(movie)
    db_session.flush()

    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=sample_anime.system_id,
            relation_type="alternative",
            to_type="movie", to_id=movie.system_id,
        )
    )
    db_session.flush()

    from_anime = relations_for_entry(db_session, "anime", sample_anime.system_id)
    from_movie = relations_for_entry(db_session, "movie", movie.system_id)
    assert from_anime[0]["label"] == "Alternative"
    assert from_movie[0]["label"] == "Alternative"


def test_a_deleted_target_resolves_to_missing(db_session, sample_anime):
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=sample_anime.system_id,
            relation_type="adaptation",
            to_type="manga", to_id=uuid.uuid4(),  # never existed
        )
    )
    db_session.flush()

    rows = relations_for_entry(db_session, "anime", sample_anime.system_id)
    assert len(rows) == 1
    assert rows[0]["other"]["missing"] is True
    assert rows[0]["other"]["display_name"] is None
    assert rows[0]["label"] == "Adaptation"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/api/test_media_relation_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.domain.media_relation'`

If instead it fails on a missing `sample_franchise` / `sample_anime` fixture, check `tests/api/conftest.py` for the actual names and adjust the test — do not invent new fixtures.

- [ ] **Step 3: Write the implementation**

Create `app/services/domain/media_relation.py`:

```python
"""
Media relation normalization and resolution.

Two jobs. First, turning the direction an admin typed into the one direction
that gets stored, so that one fact is always one row and the unique constraint
can actually catch a duplicate entered from the other side. Second, reading one
entry's relations from both endpoints and labelling each row for the side it is
being read from.

Resolution happens here rather than in the page because a relation may point at
any of the seven media tables and across franchises, so the frontend has no
reason to already hold the referenced entry.
"""

from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models import MediaRelation
from app.services.domain.watch_order import entry_exists  # noqa: F401 (re-export)
from app.utils.media_resolver import entry_ref_for, resolve_entries
from app.utils.relation_kinds import INPUT_ONLY_KINDS, RELATION_KINDS


Endpoint = Tuple[str, UUID]


def normalize_relation(
    from_type: str,
    from_id: UUID,
    kind: str,
    to_type: str,
    to_id: UUID,
) -> Tuple[str, UUID, str, str, UUID]:
    """
    Turns a typed-in relation into its stored form.

    Two rewrites can happen:

    1. `prequel` is not a stored kind. "B's prequel is A" is the same fact as
       "A is the sequel of B", so the kind becomes `sequel` and the endpoints
       swap.
    2. A symmetric kind means the same thing both ways, so its endpoints are
       sorted. Without this, A-alt-B and B-alt-A would be two rows the unique
       constraint could not see as duplicates.

    Every other kind is directional and stored exactly as given: which of two
    movies is the Director's Cut is the point of the relation.
    """
    if kind in INPUT_ONLY_KINDS:
        kind = INPUT_ONLY_KINDS[kind]
        from_type, from_id, to_type, to_id = to_type, to_id, from_type, from_id

    if RELATION_KINDS[kind].symmetric:
        if (to_type, str(to_id)) < (from_type, str(from_id)):
            from_type, from_id, to_type, to_id = to_type, to_id, from_type, from_id

    return from_type, from_id, kind, to_type, to_id


def find_duplicate(
    db: Session,
    from_type: str,
    from_id: UUID,
    relation_type: str,
    to_type: str,
    to_id: UUID,
    exclude_id: Optional[UUID] = None,
) -> Optional[MediaRelation]:
    """
    The existing row this one would collide with, if any.

    Checked before insert so the API can answer 409 with a useful message
    instead of letting uq_media_relation_pair surface as a 500. Arguments must
    already be normalized. `exclude_id` lets PATCH ignore the row being edited.
    """
    query = db.query(MediaRelation).filter(
        MediaRelation.from_type == from_type,
        MediaRelation.from_id == from_id,
        MediaRelation.relation_type == relation_type,
        MediaRelation.to_type == to_type,
        MediaRelation.to_id == to_id,
    )
    if exclude_id is not None:
        query = query.filter(MediaRelation.system_id != exclude_id)
    return query.first()


def _touching(media_type: str, entry_id: UUID):
    """The filter matching rows with this entry at either endpoint."""
    return or_(
        and_(
            MediaRelation.from_type == media_type,
            MediaRelation.from_id == entry_id,
        ),
        and_(
            MediaRelation.to_type == media_type,
            MediaRelation.to_id == entry_id,
        ),
    )


def relations_for_entry(
    db: Session, media_type: str, entry_id: UUID
) -> List[Dict[str, Any]]:
    """
    Every relation touching this entry, from both endpoints, each labelled for
    the side it is being read from.

    A row where this entry is `from` reads with the kind's label; one where it
    is `to` reads with its inverse label. `other` is always the entry at the
    far end, resolved to display data or flagged missing.
    """
    rows = (
        db.query(MediaRelation)
        .filter(_touching(media_type, entry_id))
        .order_by(MediaRelation.created_at)
        .all()
    )

    # One batched resolve for every far endpoint, so a heavily linked entry
    # never degrades into an N+1.
    others: List[Endpoint] = []
    forwards: List[bool] = []
    for row in rows:
        forward = row.from_type == media_type and row.from_id == entry_id
        forwards.append(forward)
        others.append(
            (row.to_type, row.to_id) if forward else (row.from_type, row.from_id)
        )

    resolved = resolve_entries(db, others)

    payload: List[Dict[str, Any]] = []
    for row, forward, other in zip(rows, forwards, others):
        kind = RELATION_KINDS.get(row.relation_type)
        ref = entry_ref_for(resolved, other[0], other[1])
        payload.append(
            {
                "system_id": row.system_id,
                "relation_type": row.relation_type,
                # What this row reads as from the entry being viewed.
                "label": (
                    (kind.label if forward else kind.inverse_label)
                    if kind
                    # A kind restored from a sheet written by a newer version
                    # shows its raw key rather than blanking the row.
                    else row.relation_type
                ),
                "family": kind.family if kind else "derivation",
                "direction": "forward" if forward else "reverse",
                "remark": row.remark,
                "other": {
                    "media_type": ref.media_type,
                    "entry_id": ref.entry_id,
                    "missing": ref.missing,
                    "display_name": ref.display_name,
                    "label": ref.label,
                    "cover_image_file": ref.cover_image_file,
                    "franchise_id": ref.franchise_id,
                    "nav_path": ref.nav_path,
                },
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )
    return payload
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/api/test_media_relation_service.py -v`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite for regressions**

Run: `pytest tests/unit tests/api -q`
Expected: no new failures.

- [ ] **Step 6: Commit (after user approval)**

```bash
git add app/services/domain/media_relation.py tests/api/test_media_relation_service.py
git commit -m "feat(relations): add relation normalization and both-direction reads"
```

---

### Task 4: Schemas and router

The HTTP surface. Reads public, writes admin-only, matching watch orders.

**Files:**
- Create: `app/schemas/media_relation.py`
- Create: `app/routers/media_relation.py`
- Modify: `app/schemas/__init__.py`
- Modify: `app/main.py:22` (the `from app.routers import (...)` block) and after `app/main.py:151`
- Test: `tests/api/test_media_relation.py`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `/api/media-relation` with `GET /kinds`, `GET /for-entry`, `GET /`, `POST /`, `PATCH /{system_id}`, `DELETE /{system_id}`; schemas `MediaRelationCreate`, `MediaRelationUpdate`, `MediaRelationResponse`, `MediaRelationResolved`, `RelationKindResponse`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_media_relation.py`:

```python
"""
API integration tests for /api/media-relation.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def second_anime(db_session, sample_franchise):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Second Season",
    )
    db_session.add(a)
    db_session.flush()
    return a


@pytest.fixture
def sample_manga_entry(db_session, sample_franchise):
    m = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Source Manga",
    )
    db_session.add(m)
    db_session.flush()
    return m


# ---------------------------------------------------------------------------
# Kinds
# ---------------------------------------------------------------------------


def test_kinds_lists_the_nine_user_facing_choices(client):
    res = client.get("/api/media-relation/kinds")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 9
    keys = {k["key"] for k in body}
    assert "prequel" in keys
    prequel = next(k for k in body if k["key"] == "prequel")
    assert prequel["label"] == "Prequel"
    assert prequel["stored_as"] == "sequel"
    sequel = next(k for k in body if k["key"] == "sequel")
    assert sequel["inverse_label"] == "Prequel"
    assert sequel["family"] == "timeline"


# ---------------------------------------------------------------------------
# Create + normalization
# ---------------------------------------------------------------------------


def test_creating_a_prequel_stores_a_swapped_sequel_row(
    admin_client, db_session, sample_anime, second_anime
):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(second_anime.system_id),
            "kind": "prequel",
            "to_type": "anime",
            "to_id": str(sample_anime.system_id),
        },
    )
    assert res.status_code == 201, res.text

    row = db_session.query(models.MediaRelation).one()
    assert row.relation_type == "sequel"
    # The endpoints swapped: sample_anime is the sequel of second_anime.
    assert row.from_id == sample_anime.system_id
    assert row.to_id == second_anime.system_id


def test_creating_a_cross_media_type_adaptation(
    admin_client, sample_anime, sample_manga_entry
):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(sample_anime.system_id),
            "kind": "adaptation",
            "to_type": "manga",
            "to_id": str(sample_manga_entry.system_id),
            "remark": "anime adapts vols 1-7",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["relation_type"] == "adaptation"


def test_the_same_alternative_entered_from_either_side_is_one_row(
    admin_client, db_session, sample_anime, second_anime
):
    first = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "alternative",
            "to_type": "anime", "to_id": str(second_anime.system_id),
        },
    )
    assert first.status_code == 201

    second = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "alternative",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )
    assert second.status_code == 409
    assert "already" in second.json()["detail"].lower()
    assert db_session.query(models.MediaRelation).count() == 1


def test_self_relation_is_refused(admin_client, sample_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "alternative",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )
    assert res.status_code == 409
    assert "itself" in res.json()["detail"].lower()


def test_an_unknown_kind_is_refused(admin_client, sample_anime, second_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "nemesis",
            "to_type": "anime", "to_id": str(second_anime.system_id),
        },
    )
    assert res.status_code == 400
    assert "nemesis" in res.json()["detail"]


def test_an_unknown_media_type_is_refused(admin_client, sample_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "sequel",
            "to_type": "podcast", "to_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 400


def test_a_nonexistent_entry_is_refused(admin_client, sample_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 400


def test_creating_requires_admin(client, sample_anime, second_anime):
    res = client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(second_anime.system_id),
        },
    )
    assert res.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


def test_for_entry_returns_both_directions_with_correct_labels(
    admin_client, client, sample_anime, second_anime
):
    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )

    forward = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(second_anime.system_id)},
    ).json()
    assert forward[0]["label"] == "Sequel"

    reverse = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
    ).json()
    assert reverse[0]["label"] == "Prequel"
    assert reverse[0]["other"]["display_name"] == second_anime.display_name


def test_for_entry_is_public(client, sample_anime):
    res = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
    )
    assert res.status_code == 200
    assert res.json() == []


def test_scope_listing_returns_relations_within_a_franchise(
    admin_client, client, sample_franchise, sample_anime, second_anime
):
    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )
    res = client.get(
        "/api/media-relation/",
        params={"franchise_id": str(sample_franchise.system_id)},
    )
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_scope_listing_requires_exactly_one_scope(client):
    assert client.get("/api/media-relation/").status_code == 400


# ---------------------------------------------------------------------------
# Update + delete
# ---------------------------------------------------------------------------


def test_patching_the_kind_renormalizes(
    admin_client, db_session, sample_anime, second_anime
):
    created = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    ).json()

    res = admin_client.patch(
        f"/api/media-relation/{created['system_id']}",
        json={"kind": "prequel"},
    )
    assert res.status_code == 200

    db_session.expire_all()
    row = db_session.query(models.MediaRelation).one()
    # Still a sequel row, but now pointing the other way.
    assert row.relation_type == "sequel"
    assert row.from_id == sample_anime.system_id
    assert row.to_id == second_anime.system_id


def test_patching_only_the_remark_leaves_direction_alone(
    admin_client, db_session, sample_anime, second_anime
):
    created = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    ).json()

    res = admin_client.patch(
        f"/api/media-relation/{created['system_id']}",
        json={"remark": "picks up right after"},
    )
    assert res.status_code == 200
    assert res.json()["remark"] == "picks up right after"

    db_session.expire_all()
    row = db_session.query(models.MediaRelation).one()
    assert row.from_id == second_anime.system_id


def test_deleting_removes_the_row(
    admin_client, db_session, sample_anime, second_anime
):
    created = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    ).json()

    res = admin_client.delete(f"/api/media-relation/{created['system_id']}")
    assert res.status_code == 200
    assert db_session.query(models.MediaRelation).count() == 0


def test_deleting_an_unknown_id_is_404(admin_client):
    assert admin_client.delete(
        f"/api/media-relation/{uuid.uuid4()}"
    ).status_code == 404
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/api/test_media_relation.py -v`
Expected: FAIL — every test 404s, because the router is not mounted.

Check the client fixture names in `tests/api/conftest.py` first (`client` / `admin_client` are what `test_watch_order.py` uses); if they differ, adjust the test to the real names rather than adding fixtures.

- [ ] **Step 3: Write the schemas**

Create `app/schemas/media_relation.py`:

```python
"""Media Relation request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RelationKindResponse(BaseModel):
    """One choice in the admin dropdown.

    `stored_as` differs from `key` only for `prequel`, which is recorded as a
    swapped `sequel` row; the UI does not need to care, but showing it keeps
    the API self-describing.
    """

    key: str
    label: str
    inverse_label: str
    family: str
    symmetric: bool
    stored_as: str


class MediaRelationCreate(BaseModel):
    """A relation as the admin typed it, before normalization.

    `kind` accepts the nine user-facing choices, including `prequel`, which is
    never stored under that name.
    """

    from_type: str
    from_id: UUID
    kind: str
    to_type: str
    to_id: UUID
    remark: Optional[str] = None


class MediaRelationUpdate(BaseModel):
    """Only the kind and the remark are editable.

    Repointing a relation at a different entry means deleting it and adding the
    right one, which keeps this endpoint from having to re-validate endpoints.
    """

    kind: Optional[str] = None
    remark: Optional[str] = None


class MediaRelationResponse(BaseModel):
    """A stored row, exactly as it sits in the table."""

    system_id: UUID
    from_type: str
    from_id: UUID
    relation_type: str
    to_type: str
    to_id: UUID
    remark: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RelationOtherEndpoint(BaseModel):
    """The entry at the far end, resolved for display.

    `missing` is True when the id no longer exists — endpoints are FK-less, so
    a dangling link stays visible rather than disappearing.
    """

    media_type: Optional[str] = None
    entry_id: Optional[UUID] = None
    missing: bool = True
    display_name: Optional[str] = None
    # The media type's human label, e.g. "Anime Movie".
    label: Optional[str] = None
    cover_image_file: Optional[str] = None
    franchise_id: Optional[UUID] = None
    nav_path: Optional[str] = None


class MediaRelationResolved(BaseModel):
    """A relation as read from one particular entry's point of view."""

    system_id: UUID
    relation_type: str
    # The kind's label, or its inverse label when this entry is the `to` side.
    label: str
    family: str
    # "forward" when the viewed entry is `from`, "reverse" when it is `to`.
    direction: str
    remark: Optional[str] = None
    other: RelationOtherEndpoint
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
```

In `app/schemas/__init__.py`, add after the `watch_order` import block (which ends at line 111):

```python
from app.schemas.media_relation import (
    RelationKindResponse,
    MediaRelationCreate,
    MediaRelationUpdate,
    MediaRelationResponse,
    RelationOtherEndpoint,
    MediaRelationResolved,
)
```

and add the same six names to `__all__` after `"WatchOrderItemSheetSync",`.

- [ ] **Step 4: Write the router**

Create `app/routers/media_relation.py`:

```python
"""
routers/media_relation.py
Handles Media Relations - typed, cross-media-type links between two entries.

Reads are public (a relation is ordinary catalogue data); every write is
admin-only, matching watch orders.

Replaces the prequel_id / sequel_id / alternative columns. Nothing here derives
relations automatically: they are curated on the /relations admin page.
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app import schemas
from app.dependencies import get_current_admin, get_db
from app.services.domain.media_relation import (
    entry_exists,
    find_duplicate,
    normalize_relation,
    relations_for_entry,
)
from app.services.domain.watch_order import list_candidate_entries
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.relation_kinds import (
    ACCEPTED_INPUT_KINDS,
    INPUT_ONLY_KINDS,
    RELATION_KINDS,
)
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/media-relation", tags=["Media Relation"])


# ==========================================
# HELPERS
# ==========================================


def _get_relation_or_404(db: Session, system_id: str) -> models.MediaRelation:
    row = (
        db.query(models.MediaRelation)
        .filter(models.MediaRelation.system_id == system_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Relation not found.")
    return row


def _validate_kind(value: str) -> None:
    """
    Rejects a kind outside the nine the dropdown offers.

    Refused rather than coerced: unlike a blank importance cell from Sheets,
    a bad kind from the editor is a bug worth surfacing.
    """
    if value not in ACCEPTED_INPUT_KINDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown relation kind '{value}'. "
                f"Expected one of: {', '.join(ACCEPTED_INPUT_KINDS)}."
            ),
        )


def _validate_endpoint(db: Session, media_type: str, entry_id) -> None:
    """Rejects an endpoint pointing at an unknown table or a missing row."""
    if media_type not in MEDIA_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media type '{media_type}'."
        )
    if entry_id is None or not entry_exists(db, media_type, entry_id):
        raise HTTPException(
            status_code=400, detail="Referenced entry does not exist."
        )


def _reject_self_and_duplicate(
    db: Session,
    from_type: str,
    from_id,
    relation_type: str,
    to_type: str,
    to_id,
    exclude_id=None,
) -> None:
    """
    Mirrors the two table constraints so a bad payload returns 409, not a 500.

    Arguments must already be normalized, which is what makes the duplicate
    check catch the same relation entered from the other side.
    """
    if from_type == to_type and from_id == to_id:
        raise HTTPException(
            status_code=409, detail="An entry cannot relate to itself."
        )
    existing = find_duplicate(
        db, from_type, from_id, relation_type, to_type, to_id, exclude_id
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "That relation already exists "
                f"(id {existing.system_id}), possibly entered from the other side."
            ),
        )


# ==========================================
# PUBLIC READS
# ==========================================


@router.get(
    "/kinds",
    response_model=List[schemas.RelationKindResponse],
    summary="List Relation Kinds",
)
def get_relation_kinds():
    """
    The vocabulary, so the admin dropdown has exactly one source of truth.

    Returns the eight stored kinds plus `prequel`, which the create endpoint
    accepts and records as a swapped `sequel` row.
    """
    payload = [
        {
            "key": kind.key,
            "label": kind.label,
            "inverse_label": kind.inverse_label,
            "family": kind.family,
            "symmetric": kind.symmetric,
            "stored_as": kind.key,
        }
        for kind in RELATION_KINDS.values()
    ]
    for input_key, stored_key in INPUT_ONLY_KINDS.items():
        stored = RELATION_KINDS[stored_key]
        payload.append(
            {
                "key": input_key,
                "label": stored.inverse_label,
                "inverse_label": stored.label,
                "family": stored.family,
                "symmetric": False,
                "stored_as": stored_key,
            }
        )
    return payload


@router.get(
    "/for-entry",
    response_model=List[schemas.MediaRelationResolved],
    summary="Get One Entry's Relations",
)
def get_relations_for_entry(
    media_type: str = Query(...),
    entry_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Every relation touching this entry, from both endpoints, already labelled
    for the side being viewed.

    Resolution is server-side because a relation may point at any of the seven
    media tables and across franchises, so the page has no reason to hold the
    referenced entry already.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media type '{media_type}'."
        )
    return relations_for_entry(db, media_type, uuid.UUID(entry_id))


@router.get(
    "",
    response_model=List[schemas.MediaRelationResponse],
    summary="List Relations In A Scope",
)
@router.get(
    "/",
    response_model=List[schemas.MediaRelationResponse],
    include_in_schema=False,
)
def list_relations_in_scope(
    franchise_id: Optional[str] = None,
    collection_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Every relation with at least one endpoint among a scope's entries.

    One request backs the admin page's per-entry count badges, instead of one
    /for-entry call per row. A collection resolves to its member franchises
    first, exactly as the watch order candidates endpoint does.
    """
    if bool(franchise_id) == bool(collection_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of franchise_id or collection_id.",
        )

    if franchise_id:
        franchise_ids = [franchise_id]
    else:
        franchise_ids = [
            row[0]
            for row in db.query(models.Franchise.system_id)
            .filter(models.Franchise.collection_id == collection_id)
            .all()
        ]

    entry_ids = [
        c["entry_id"] for c in list_candidate_entries(db, franchise_ids)
    ]
    if not entry_ids:
        return []

    return (
        db.query(models.MediaRelation)
        .filter(
            or_(
                models.MediaRelation.from_id.in_(entry_ids),
                models.MediaRelation.to_id.in_(entry_ids),
            )
        )
        .all()
    )


# ==========================================
# PROTECTED WRITES (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.MediaRelationResponse,
    status_code=201,
    summary="Create Relation",
)
def create_relation(
    payload: schemas.MediaRelationCreate,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """
    Stores one relation, normalizing the direction the admin typed.

    A `prequel` becomes a swapped `sequel`; a symmetric `alternative` has its
    endpoints sorted. Both rewrites exist so one fact is one row.
    """
    _validate_kind(payload.kind)
    _validate_endpoint(db, payload.from_type, payload.from_id)
    _validate_endpoint(db, payload.to_type, payload.to_id)

    from_type, from_id, relation_type, to_type, to_id = normalize_relation(
        payload.from_type,
        payload.from_id,
        payload.kind,
        payload.to_type,
        payload.to_id,
    )
    _reject_self_and_duplicate(
        db, from_type, from_id, relation_type, to_type, to_id
    )

    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type=from_type,
        from_id=from_id,
        relation_type=relation_type,
        to_type=to_type,
        to_id=to_id,
        remark=payload.remark,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch(
    "/{system_id}",
    response_model=schemas.MediaRelationResponse,
    summary="Update Relation",
)
def update_relation(
    system_id: str,
    payload: schemas.MediaRelationUpdate,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """
    Edits the kind or the remark.

    Changing the kind re-runs normalization, so switching Sequel to Prequel
    flips the stored endpoints rather than inventing an unstorable kind.
    """
    row = _get_relation_or_404(db, system_id)

    if payload.kind is not None:
        _validate_kind(payload.kind)
        from_type, from_id, relation_type, to_type, to_id = normalize_relation(
            row.from_type, row.from_id, payload.kind, row.to_type, row.to_id
        )
        _reject_self_and_duplicate(
            db,
            from_type,
            from_id,
            relation_type,
            to_type,
            to_id,
            exclude_id=row.system_id,
        )
        row.from_type, row.from_id = from_type, from_id
        row.relation_type = relation_type
        row.to_type, row.to_id = to_type, to_id

    if payload.remark is not None:
        row.remark = payload.remark

    db.commit()
    db.refresh(row)
    return row


@router.delete("/{system_id}", summary="Delete Relation")
def delete_relation(
    system_id: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """Removes one relation. The two entries themselves are untouched."""
    row = _get_relation_or_404(db, system_id)
    # Signature is (db, entry, entry_type), and it deliberately does not
    # commit — the delete below commits both together, as watch_order.py:904
    # does.
    log_deleted_record(db, row, "Media Relation")
    db.delete(row)
    db.commit()
    return {"status": "success", "message": "Relation deleted."}
```

- [ ] **Step 5: Mount the router**

In `app/main.py`, add `media_relation` to the `from app.routers import (...)` block at line 22, keeping the existing ordering style, then add after line 151 (`app.include_router(watch_order.router)`):

```python
app.include_router(media_relation.router)
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pytest tests/api/test_media_relation.py -v`
Expected: PASS, 17 tests.

- [ ] **Step 7: Run the whole suite**

Run: `pytest tests/unit tests/api -q`
Expected: no new failures.

- [ ] **Step 8: Commit (after user approval)**

```bash
git add app/schemas/media_relation.py app/schemas/__init__.py app/routers/media_relation.py app/main.py tests/api/test_media_relation.py
git commit -m "feat(relations): add the media relation API"
```

---

### Task 5: Google Sheets round trip

The new table needs its own tab, like Watch Order List and Watch Order Item have.

**Files:**
- Modify: `app/utils/formatter.py` (add a parser next to `parse_watch_order_item_from_sheet`, around line 174-200)
- Modify: `app/services/pipelines/backup.py` (imports at line ~24; a new block after the Watch Order Item block that ends around line 211)
- Modify: `app/services/pipelines/pull.py` (imports at line ~24 and ~47; `MODEL_MAP` around line 128; `PARSER_MAP` around line 148)
- Test: `tests/unit/test_formatter_media_relation.py`

**Interfaces:**
- Consumes: `models.MediaRelation` (Task 2).
- Produces: `parse_media_relation_from_sheet(raw: dict) -> dict`; the `"Media Relation"` sheet tab.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_formatter_media_relation.py`:

```python
"""
Unit tests for the Media Relation sheet parser.

Mirrors tests/unit/test_formatter_watch_order.py. Pure parsing — no database.
"""

import uuid

from app.utils.formatter import parse_media_relation_from_sheet


def test_parses_a_full_row():
    system_id, from_id, to_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    parsed = parse_media_relation_from_sheet(
        {
            "system_id": str(system_id),
            "from_type": "anime",
            "from_id": str(from_id),
            "relation_type": "sequel",
            "to_type": "anime-movie",
            "to_id": str(to_id),
            "remark": "covers ep 1-12 only",
            "created_at": "2026-08-23 10:00:00",
            "updated_at": "2026-08-23 10:00:00",
        }
    )
    assert parsed["system_id"] == system_id
    assert parsed["from_id"] == from_id
    assert parsed["to_id"] == to_id
    assert parsed["from_type"] == "anime"
    assert parsed["to_type"] == "anime-movie"
    assert parsed["relation_type"] == "sequel"
    assert parsed["remark"] == "covers ep 1-12 only"


def test_blank_cells_become_none():
    parsed = parse_media_relation_from_sheet(
        {
            "system_id": "",
            "from_type": "",
            "from_id": "",
            "relation_type": "",
            "to_type": "",
            "to_id": "",
            "remark": "",
        }
    )
    assert parsed["from_id"] is None
    assert parsed["to_id"] is None
    assert parsed["remark"] is None


def test_an_unparseable_endpoint_id_becomes_none_rather_than_raising():
    # Endpoints are FK-less, so a junk cell must not fail the whole Pull; the
    # row simply shows up in the admin page as a missing endpoint.
    parsed = parse_media_relation_from_sheet(
        {"from_id": "not-a-uuid", "to_id": "also-not-a-uuid"}
    )
    assert parsed["from_id"] is None
    assert parsed["to_id"] is None


def test_an_unknown_relation_type_is_preserved_not_coerced():
    # Unlike importance, which coerces to "Normal", a kind is preserved so a
    # sheet written by a newer version restores losslessly.
    parsed = parse_media_relation_from_sheet({"relation_type": "future_kind"})
    assert parsed["relation_type"] == "future_kind"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_formatter_media_relation.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_media_relation_from_sheet'`

- [ ] **Step 3: Add the parser**

In `app/utils/formatter.py`, directly after `parse_watch_order_item_from_sheet` (which ends around line 199), add:

```python
def parse_media_relation_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Media Relation sheet into typed data
    ready for the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "from_type": parse_from_sheet(raw.get("from_type"), str),
        # Neither endpoint has a foreign key - each points at whichever media
        # table its *_type names - so an unparseable cell becomes None and the
        # row shows up in the admin page as a missing endpoint rather than
        # failing the whole Pull.
        "from_id": _uuid_or_none(raw.get("from_id")),
        # Preserved as written, not coerced: a kind added in a newer version
        # must survive a round trip through an older one.
        "relation_type": parse_from_sheet(raw.get("relation_type"), str),
        "to_type": parse_from_sheet(raw.get("to_type"), str),
        "to_id": _uuid_or_none(raw.get("to_id")),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/unit/test_formatter_media_relation.py -v`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire up Backup**

In `app/services/pipelines/backup.py`, add `MediaRelation` to the model imports at line ~24, then add this block immediately after the Watch Order Item block (which ends around line 211, before the Quote block):

```python
        # Relations come after every media tab for the same reason quotes do:
        # both endpoints are FK-less (media_type, entry_id) pairs, so on
        # restore the rows they point at must already exist.
        media_relations = db.query(MediaRelation).all()
        media_relation_headers = [
            c.name for c in MediaRelation.__table__.columns
        ]
        media_relation_matrix = [media_relation_headers] + [
            format_model_for_sheet(r) for r in media_relations
        ]
        bulk_overwrite_sheet("Media Relation", media_relation_matrix)
```

- [ ] **Step 6: Wire up Pull**

In `app/services/pipelines/pull.py`:
- add `MediaRelation` to the model imports at line ~24;
- add `parse_media_relation_from_sheet` to the formatter imports at line ~47;
- add `"Media Relation": MediaRelation,` to `MODEL_MAP` after the `"Watch Order Item"` line;
- add `"Media Relation": parse_media_relation_from_sheet,` to `PARSER_MAP` after its `"Watch Order Item"` line.

- [ ] **Step 7: Verify both pipelines still import**

Run: `python -c "from app.services.pipelines import backup, pull; print('ok')"`
Expected: `ok`

Run: `pytest tests/unit tests/api -q`
Expected: no new failures.

- [ ] **Step 8: Create the sheet tab**

Add a tab named exactly `Media Relation` to the spreadsheet at `GOOGLE_SHEET_ID`. Backup writes headers on its first run, so the tab may be created empty.

- [ ] **Step 9: Commit (after user approval)**

```bash
git add app/utils/formatter.py app/services/pipelines/backup.py app/services/pipelines/pull.py tests/unit/test_formatter_media_relation.py
git commit -m "feat(relations): back up and restore media relations via Sheets"
```

---

### Task 6: Retire prequel/sequel derivation

The auto-chaining that guessed relations from `watch_order` goes away. Its output was never trusted enough to migrate, and once Side Story and Spin-off exist it mislabels an OVA as the next entry's prequel.

**Files:**
- Modify: `app/services/domain/derivation.py:294-440` (delete four functions and, if unreferenced, `_TV_SPECIAL_FRANCHISE_NAMES`)
- Modify: `app/services/domain/post_processing.py:71-74` (imports), `:247-300` (four call sites)
- Modify: `app/services/calculation.py:392`
- Test: existing suite must stay green.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This is a deletion.

- [ ] **Step 1: Find every reference before deleting**

Run: `grep -rn "derive_prequel_sequel\|_TV_SPECIAL_FRANCHISE_NAMES" app tests`

Write down every hit. If a test asserts on derivation behaviour, that test is deleted with the feature — but read it first to be sure it is not also covering watch-order derivation, which stays.

- [ ] **Step 2: Delete the four derivation functions**

In `app/services/domain/derivation.py`, delete `derive_prequel_sequel_anime`, `derive_prequel_sequel_tv_show`, `derive_prequel_sequel_cartoon`, and `derive_prequel_sequel_manga` in full.

Delete `_TV_SPECIAL_FRANCHISE_NAMES` **only if** the grep from Step 1 shows it is used nowhere else — `derive_watch_order_tv_show` may well need it.

Leave the module docstring's first line accurate: change

```python
"""Field derivation: watch order, ep_previous, prequel/sequel, season, id/season extraction."""
```

to

```python
"""Field derivation: watch order, ep_previous, season, id/season extraction.

Prequel/sequel are no longer derived. They moved to the `media_relation` table,
where they are curated by hand: chaining a franchise by watch_order cannot tell
a sequel from a side story, and guessed wrong often enough to be worth losing.
"""
```

- [ ] **Step 3: Remove the call sites**

In `app/services/domain/post_processing.py`, delete the four names from the import block at lines 71-74, and delete each `derive_prequel_sequel_*(db, fid)` call (around lines 258, 274, 290, and in the manga function around line 296).

Update the affected docstrings so they no longer promise prequel/sequel — e.g. `"""Derives watch order, ep_previous, and prequel/sequel for all acg franchises."""` becomes `"""Derives watch order and ep_previous for all acg franchises."""`.

If removing the call leaves a function whose only job was prequel/sequel derivation for manga (around line 296), delete that function and its caller too — check with grep before removing.

- [ ] **Step 4: Update the Calculate pipeline message**

In `app/services/calculation.py:392`, change:

```python
        "message": "Derived watch order, ep_previous, and prequel/sequel for all franchises.",
```

to:

```python
        "message": "Derived watch order and ep_previous for all franchises.",
```

- [ ] **Step 5: Verify nothing references the deleted names**

Run: `grep -rn "derive_prequel_sequel" app tests`
Expected: no output.

Run: `python -c "from app.services import calculation; from app.services.domain import post_processing; print('ok')"`
Expected: `ok`

- [ ] **Step 6: Run the whole suite**

Run: `pytest tests/unit tests/api -q`
Expected: no new failures. If a deleted test was the only coverage of `post_processing`'s ACG path, confirm the remaining watch-order assertions still run.

- [ ] **Step 7: Commit (after user approval)**

```bash
git add app/services/domain/derivation.py app/services/domain/post_processing.py app/services/calculation.py
git commit -m "refactor(relations): retire prequel/sequel derivation"
```

(If a test file was deleted, add it to the same `git add` with `git rm`.)

---

### Task 7: Remove the legacy fields from the frontend

The frontend stops sending `prequel_id`, `sequel_id`, `alternative`, and `derive_related` **before** the backend drops them, so no request is ever left carrying a field the API no longer knows.

**Files:**
- Modify: `frontend/src/config/formFactories.js:50-51, 124-125, 156-157, 189-190, 233-234, 279-280`
- Modify: `frontend/src/config/formFields/fieldMeta.js:86-88`
- Modify: `frontend/src/lib/payloads.js:99-100`
- Modify: `frontend/src/pages/add-tabs/AnimeAddTab.jsx:531-545, 578-582`, and the same "Prequel ID" / "Sequel ID" / `derive_related` fields in `CartoonAddTab.jsx`, `MangaAddTab.jsx`, `MovieAddTab.jsx`, `TvShowAddTab.jsx`, `NovelAddTab.jsx`
- Modify: `frontend/src/pages/modify-tabs/AnimeModifyTab.jsx`, `CartoonModifyTab.jsx`, `MangaModifyTab.jsx`, `MovieModifyTab.jsx`, `TvShowModifyTab.jsx`, `NovelModifyTab.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This is a deletion.

- [ ] **Step 1: Enumerate every reference**

Run:

```bash
grep -rn "prequel_id\|sequel_id\|alternative\|derive_related" frontend/src
```

Work from that list. Two cautions:
- `alternative` also appears in **name** fields (`franchise_name_alt`, `anime_name_alt` and similar). Only remove the standalone `alternative` relation field — never a `*_name_alt`.
- `is_main_entry` stays. It is not part of this change.

- [ ] **Step 2: Remove the form-state defaults**

In `frontend/src/config/formFactories.js`, delete the `prequel_id: null,` / `sequel_id: null,` pairs at all six sites, plus any `alternative: null,` and `derive_related: null,` in the same factories.

- [ ] **Step 3: Remove the field metadata**

In `frontend/src/config/formFields/fieldMeta.js`, delete lines 86-88 — the comment and both entries:

```js
  // Derived by the prequel/sequel pipeline — never a default, never copied.
  prequel_id: { hidden: true, defaultable: false, autofillable: false },
  sequel_id: { hidden: true, defaultable: false, autofillable: false },
```

plus any `alternative` / `derive_related` entries the grep found in the same file.

- [ ] **Step 4: Remove them from the outgoing payload**

In `frontend/src/lib/payloads.js`, delete lines 99-100:

```js
    prequel_id: af.prequel_id || null,
    sequel_id: af.sequel_id || null,
```

and any `alternative` / `derive_related` lines the grep found alongside.

- [ ] **Step 5: Remove the form inputs**

In each of the six `*AddTab.jsx` files and their Modify counterparts, delete the whole `<Field label="Prequel ID" …>` and `<Field label="Sequel ID" …>` blocks, the `derive_related` field (its hint reads "Set to No to skip prequel/sequel derivation"), and any `alternative` relation field.

For `AnimeAddTab.jsx` that is lines 531-545 and the block around 578-582; the other files' line numbers are in the Step 1 grep output.

- [ ] **Step 6: Verify no references remain**

Run:

```bash
grep -rn "prequel_id\|sequel_id\|derive_related" frontend/src
```

Expected: no output.

Run:

```bash
grep -rn "\balternative\b" frontend/src
```

Expected: no output, or only genuine non-relation uses. Inspect each remaining hit.

- [ ] **Step 7: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no unresolved-reference errors.

- [ ] **Step 8: Smoke-test the forms**

With `uvicorn app.main:app --reload` running, open `http://localhost:8000/add`, and check each media type's tab renders with no console errors and no leftover empty field slots. Submit one Add and one Modify to confirm the payload is accepted.

- [ ] **Step 9: Commit (after user approval)**

```bash
git add frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/pages/add-tabs frontend/src/pages/modify-tabs
git commit -m "refactor(relations): drop the legacy relation fields from the forms"
```

Re-read the diff of the two directories before staging: other sessions may have unrelated in-progress edits in those files. If so, stage the specific files you touched instead of the directory.

---

### Task 8: Drop the legacy columns

Now that nothing reads or writes them, the columns go.

**Files:**
- Modify: `app/models/anime.py:90-92`, `app/models/cartoon.py:61-62`, `app/models/manga.py:78-79`, `app/models/movie.py:58-59`, `app/models/novel.py:82-84`, `app/models/tv_show.py:60-61` (plus each `derive_related` line)
- Modify: `app/schemas/anime.py:59-61`, `app/schemas/cartoon.py:34-35`, `app/schemas/manga.py:45-46`, `app/schemas/movie.py:31-32`, `app/schemas/novel.py:56-58`, `app/schemas/tv_show.py:33-34`
- Modify: `app/utils/formatter.py:330-331, 616-617` and every other parse map carrying the four keys
- Create: `alembic/versions/media_relation_drop_legacy.py`
- Test: existing suite must stay green.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Enumerate every backend reference**

Run:

```bash
grep -rn "prequel_id\|sequel_id\|derive_related" app tests
grep -rn "\"alternative\"\|'alternative'\|\balternative\b" app tests
```

For the second grep, keep only the standalone relation field. `is_main_entry` and every `*_name_alt` stay.

- [ ] **Step 2: Remove the columns from the models**

Delete these lines:

- `app/models/anime.py` — `prequel_id`, `sequel_id`, `alternative`, `derive_related`
- `app/models/cartoon.py` — `prequel_id`, `sequel_id`, `derive_related`
- `app/models/manga.py` — `prequel_id`, `sequel_id`, `derive_related`
- `app/models/movie.py` — `prequel_id`, `sequel_id`, `derive_related`
- `app/models/tv_show.py` — `prequel_id`, `sequel_id`, `derive_related`
- `app/models/novel.py` — `prequel_id`, `sequel_id`, `alternative` (novel has no `derive_related`)

Keep `is_main_entry` on `anime.py:61` and `novel.py:85`.

- [ ] **Step 3: Remove them from the schemas**

Delete the matching `Optional[...]` fields from the six schema files listed above, keeping `is_main_entry`.

- [ ] **Step 4: Remove them from the sheet parsers**

In `app/utils/formatter.py`, delete the four keys from every parse map that carries them — including `"alternative": parse_from_sheet(raw.get("alternative"), str),` at lines 330 and 616. Keep the adjacent `is_main_entry` lines.

- [ ] **Step 5: Verify nothing references them**

Run:

```bash
grep -rn "prequel_id\|sequel_id\|derive_related" app tests
```

Expected: no output.

Run: `python -c "from app.main import app; print('ok')"`
Expected: `ok`

- [ ] **Step 6: Run the whole suite**

Run: `pytest tests/unit tests/api -q`
Expected: no new failures. The session fixture rebuilds the schema from the models, so the dropped columns disappear from the test DB automatically.

- [ ] **Step 7: Write the migration**

Create `alembic/versions/media_relation_drop_legacy.py`:

```python
"""drop the legacy prequel/sequel/alternative columns

Revision ID: media_relation_drop_legacy
Revises: media_relation_add
Create Date: 2026-08-23 00:00:00.000000

Relations moved to the `media_relation` table. Nothing is backfilled: the
prequel/sequel values were largely produced by the derivation retired alongside
this change, and were never trusted enough to carry forward.

Downgrade restores the columns EMPTY. Run the Backup pipeline before upgrading
if the old values matter.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'media_relation_drop_legacy'
down_revision: Union[str, Sequence[str], None] = 'media_relation_add'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# anime_movies is absent throughout: it never had relation columns, which is
# exactly one of the limitations media_relation removes.
PAIR_TABLES = ("anime", "cartoons", "manga", "movies", "novel", "tv_shows")
# Novel never had derive_related.
DERIVE_TABLES = ("anime", "cartoons", "manga", "movies", "tv_shows")
ALTERNATIVE_TABLES = ("anime", "novel")


def upgrade() -> None:
    for table in PAIR_TABLES:
        op.drop_column(table, "prequel_id")
        op.drop_column(table, "sequel_id")
    for table in DERIVE_TABLES:
        op.drop_column(table, "derive_related")
    for table in ALTERNATIVE_TABLES:
        op.drop_column(table, "alternative")


def downgrade() -> None:
    """Restore the columns, empty. Their content is not folded back."""
    for table in PAIR_TABLES:
        op.add_column(
            table,
            sa.Column("prequel_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.add_column(
            table,
            sa.Column("sequel_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
    for table in DERIVE_TABLES:
        op.add_column(
            table, sa.Column("derive_related", sa.Boolean(), nullable=True)
        )
    for table in ALTERNATIVE_TABLES:
        op.add_column(table, sa.Column("alternative", sa.String(), nullable=True))
```

- [ ] **Step 8: Back up, then apply**

Run the Backup pipeline from the admin UI first — this migration is lossy.

```bash
alembic upgrade head
alembic downgrade -1
alembic upgrade head
```

Expected: all three succeed. Verify:

```bash
psql -U postgres -d anime_site -c "\d anime" | grep -E "prequel|sequel|derive_related|alternative"
```

Expected: no output.

- [ ] **Step 9: Commit (after user approval)**

```bash
git add app/models/anime.py app/models/cartoon.py app/models/manga.py app/models/movie.py app/models/novel.py app/models/tv_show.py app/schemas/anime.py app/schemas/cartoon.py app/schemas/manga.py app/schemas/movie.py app/schemas/novel.py app/schemas/tv_show.py app/utils/formatter.py alembic/versions/media_relation_drop_legacy.py
git commit -m "feat(relations): drop the legacy prequel/sequel/alternative columns"
```

---

### Task 9: The `/relations` admin page

**Files:**
- Modify: `frontend/src/api/endpoints.js:61-77` (add a `mediaRelation` block after `watchOrder`)
- Create: `frontend/src/pages/admin/Relations.jsx`
- Modify: `frontend/src/App.jsx` (import near line 51; route inside the `<ProtectedRoute />` block after line 134)
- Modify: `frontend/src/components/layout/Nav.jsx:479-482` and `:868-877`

**Interfaces:**
- Consumes: the API from Task 4; `ComboBox` from `frontend/src/components/forms/ComboBox.jsx` (props: `items: [{id, label}]`, `selectedId`, `onSelect(id, label)`, `onClear`, `placeholder`); `useToast` from `frontend/src/hooks/useToast`; `getDisplayName` from `frontend/src/utils/media`.
- Produces: the `/relations` route.

- [ ] **Step 1: Add the endpoints**

In `frontend/src/api/endpoints.js`, after the `watchOrder` block (ends line 77), add:

```js
  mediaRelation: {
    kinds: () => "/api/media-relation/kinds",
    forEntry: () => "/api/media-relation/for-entry",
    inScope: () => "/api/media-relation/",
    create: () => "/api/media-relation/",
    patch: (id) => `/api/media-relation/${id}`,
    remove: (id) => `/api/media-relation/${id}`,
  },
```

- [ ] **Step 2: Write the page**

Create `frontend/src/pages/admin/Relations.jsx`:

```jsx
// Frontend: admin page for curating media relations.
//
// Left: pick a franchise or collection, then one of its entries. Right: that
// entry's relations, from both directions, plus the form that adds one.
//
// The franchise/collection picker is a browsing lens, not ownership: unlike a
// watch order, a relation belongs to no tier - it links two entries. Collection
// works as the wider lens because it sits strictly above Franchise, which is
// also where most cross-franchise relations live.
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import { getDisplayName } from "../../utils/media";
import ComboBox from "../../components/forms/ComboBox";

// Mirrors RELATION_FAMILIES in app/utils/relation_kinds.py. Only the display
// order and headings live here; the kinds themselves come from the API.
const FAMILY_ORDER = ["timeline", "equivalence", "branch", "derivation"];
const FAMILY_LABELS = {
  timeline: "Timeline",
  equivalence: "Equivalence",
  branch: "Branch",
  derivation: "Derivation",
};

function AddRelationForm({ kinds, candidates, onCreate, busy }) {
  // Prequel first: adding "what came before" is the commonest edit, and the
  // API stores it as a swapped sequel row.
  const [kind, setKind] = useState("prequel");
  const [targetKey, setTargetKey] = useState(null);
  const [remark, setRemark] = useState("");

  // Candidates are keyed by "type:id" because entry_id alone is ambiguous -
  // each media table has its own system_id space.
  const items = useMemo(
    () =>
      candidates.map((c) => ({
        id: `${c.media_type}:${c.entry_id}`,
        label: c.display_name,
        searchText: (c.search_names || []).join(" "),
      })),
    [candidates]
  );

  function submit(e) {
    e.preventDefault();
    if (!targetKey) return;
    const [toType, toId] = targetKey.split(":");
    onCreate({ kind, to_type: toType, to_id: toId, remark: remark.trim() || null });
    setTargetKey(null);
    setRemark("");
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50"
    >
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
        Add relation
      </p>

      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {kinds.map((k) => (
          <option key={k.key} value={k.key}>
            This entry is the {k.label} of…
          </option>
        ))}
      </select>

      <ComboBox
        items={items}
        selectedId={targetKey}
        onSelect={(id) => setTargetKey(id)}
        onClear={() => setTargetKey(null)}
        placeholder="Search entries in this scope…"
      />

      <input
        type="text"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="Remark (optional)"
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <button
        type="submit"
        disabled={busy || !targetKey}
        className="rounded-lg bg-brand px-3 py-2 text-xs font-black text-white disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}

export default function Relations() {
  const { showToast } = useToast();

  const [scopeType, setScopeType] = useState("franchise");
  const [scopeId, setScopeId] = useState(null);
  const [owners, setOwners] = useState({ franchises: [], collections: [] });

  const [kinds, setKinds] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [counts, setCounts] = useState({});
  const [selected, setSelected] = useState(null); // {media_type, entry_id}
  const [relations, setRelations] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // The vocabulary and the owner lists never change while the page is open.
  useEffect(() => {
    fetch(endpoints.mediaRelation.kinds(), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setKinds);

    // limit=2000 (the endpoint's ceiling), not the default 500: there are
    // already ~600 franchises, and a truncated list would silently hide owners
    // from the picker. Same reasoning as WatchOrders.jsx:175-178.
    Promise.all([
      fetch(buildUrl(endpoints.resource("franchise").list(), { limit: 2000 }), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
      fetch(buildUrl(endpoints.resource("collection").list(), { limit: 2000 }), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([franchises, collections]) =>
      setOwners({ franchises, collections })
    );
  }, []);

  const ownerItems = useMemo(() => {
    const source =
      scopeType === "franchise" ? owners.franchises : owners.collections;
    const prefix = scopeType === "franchise" ? "franchise" : "collection";
    return source.map((o) => ({
      id: o.system_id,
      label: getDisplayName(o, scopeType),
      searchText: [
        o[`${prefix}_name_cn`],
        o[`${prefix}_name_en`],
        o[`${prefix}_name_alt`],
        o[`${prefix}_name_roman`],
        o[`${prefix}_name_jp`],
      ]
        .filter(Boolean)
        .join(" "),
    }));
  }, [owners, scopeType]);

  // One entries request and one relations request per scope, never per row.
  const loadScope = useCallback(async () => {
    if (!scopeId) {
      setCandidates([]);
      setCounts({});
      return;
    }
    const scopeParam =
      scopeType === "franchise"
        ? { franchise_id: scopeId }
        : { collection_id: scopeId };

    const [entries, rows] = await Promise.all([
      fetch(buildUrl(endpoints.watchOrder.candidates(), scopeParam), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
      fetch(buildUrl(endpoints.mediaRelation.inScope(), scopeParam), {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : [])),
    ]);

    setCandidates(entries);

    // Count both endpoints: an entry with only inbound relations still has
    // relations, and the badge would otherwise read zero.
    const tally = {};
    for (const row of rows) {
      for (const key of [
        `${row.from_type}:${row.from_id}`,
        `${row.to_type}:${row.to_id}`,
      ]) {
        tally[key] = (tally[key] || 0) + 1;
      }
    }
    setCounts(tally);
  }, [scopeId, scopeType]);

  useEffect(() => {
    loadScope();
  }, [loadScope]);

  const loadRelations = useCallback(async () => {
    if (!selected) {
      setRelations([]);
      return;
    }
    const res = await fetch(
      buildUrl(endpoints.mediaRelation.forEntry(), {
        media_type: selected.media_type,
        entry_id: selected.entry_id,
      }),
      { credentials: "include" }
    );
    setRelations(res.ok ? await res.json() : []);
  }, [selected]);

  useEffect(() => {
    loadRelations();
  }, [loadRelations]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((c) =>
      (c.search_names || [c.display_name || ""])
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [candidates, query]);

  const grouped = useMemo(() => {
    const buckets = new Map();
    for (const c of visible) {
      if (!buckets.has(c.media_type)) buckets.set(c.media_type, []);
      buckets.get(c.media_type).push(c);
    }
    return [...buckets.entries()];
  }, [visible]);

  const byFamily = useMemo(() => {
    const buckets = {};
    for (const r of relations) {
      (buckets[r.family] = buckets[r.family] || []).push(r);
    }
    return buckets;
  }, [relations]);

  function switchScope(type) {
    if (type === scopeType) return;
    setScopeType(type);
    // The previous pick belongs to the other tier and cannot carry over.
    setScopeId(null);
    setSelected(null);
  }

  async function createRelation({ kind, to_type, to_id, remark }) {
    setBusy(true);
    try {
      const res = await fetch(endpoints.mediaRelation.create(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_type: selected.media_type,
          from_id: selected.entry_id,
          kind,
          to_type,
          to_id,
          remark,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || res.statusText);
      }
      await Promise.all([loadRelations(), loadScope()]);
      showToast("success", "Relation added.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRelation(row) {
    const other = row.other.display_name || "a missing entry";
    if (!window.confirm(`Remove the "${row.label}" link to ${other}? The entries themselves are not touched.`))
      return;

    setBusy(true);
    try {
      const res = await fetch(endpoints.mediaRelation.remove(row.system_id), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.statusText);
      await Promise.all([loadRelations(), loadScope()]);
      showToast("success", "Relation removed.");
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedEntry = candidates.find(
    (c) =>
      selected &&
      c.media_type === selected.media_type &&
      c.entry_id === selected.entry_id
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
          <i className="fas fa-diagram-project text-brand"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Relations
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            Prequels, alternatives, side stories and adaptations across every
            media type
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
        {/* Left: pick a scope, then an entry */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 p-0.5 rounded-lg bg-gray-200/70">
            {[
              ["franchise", "Franchise"],
              ["collection", "Collection"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchScope(value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-black transition-colors ${
                  scopeType === value
                    ? "bg-white text-brand shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <ComboBox
            items={ownerItems}
            selectedId={scopeId}
            onSelect={(id) => {
              setScopeId(id);
              setSelected(null);
            }}
            onClear={() => {
              setScopeId(null);
              setSelected(null);
            }}
            placeholder={`Search ${scopeType}s…`}
          />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter entries…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />

          {!scopeId ? (
            <p className="text-center py-8 text-sm font-medium text-gray-400">
              Pick a {scopeType} to begin.
            </p>
          ) : grouped.length === 0 ? (
            <p className="text-center py-8 text-sm font-medium text-gray-400">
              No entries in this {scopeType}.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map(([mediaType, rows]) => (
                <div key={mediaType}>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    {mediaType}
                  </p>
                  <div className="flex flex-col gap-1">
                    {rows.map((c) => {
                      const key = `${c.media_type}:${c.entry_id}`;
                      const active =
                        selected &&
                        selected.media_type === c.media_type &&
                        selected.entry_id === c.entry_id;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setSelected({
                              media_type: c.media_type,
                              entry_id: c.entry_id,
                            })
                          }
                          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors ${
                            active
                              ? "bg-brand/10 text-brand"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <span className="truncate">{c.display_name}</span>
                          {counts[key] ? (
                            <span className="shrink-0 rounded-full bg-gray-200 px-2 text-[10px] font-black text-gray-600">
                              {counts[key]}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: the selected entry's relations */}
        <div className="flex flex-col gap-4">
          {!selected ? (
            <p className="py-16 text-center text-sm font-medium text-gray-400">
              Select an entry to see and edit its relations.
            </p>
          ) : (
            <>
              <h2 className="text-lg font-black text-gray-900">
                {selectedEntry?.display_name || "Selected entry"}
              </h2>

              <AddRelationForm
                kinds={kinds}
                candidates={candidates.filter(
                  (c) =>
                    !(
                      c.media_type === selected.media_type &&
                      c.entry_id === selected.entry_id
                    )
                )}
                onCreate={createRelation}
                busy={busy}
              />

              {relations.length === 0 ? (
                <p className="text-sm font-medium text-gray-400">
                  No relations yet.
                </p>
              ) : (
                FAMILY_ORDER.filter((f) => byFamily[f]).map((family) => (
                  <div key={family}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                      {FAMILY_LABELS[family]}
                    </p>
                    <div className="flex flex-col gap-1">
                      {byFamily[family].map((row) => (
                        <div
                          key={row.system_id}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                            row.other.missing
                              ? "border-red-200 bg-red-50"
                              : "border-gray-200"
                          }`}
                        >
                          <span className="shrink-0 text-xs font-black text-brand">
                            {row.label}
                          </span>
                          <span className="truncate text-sm font-bold text-gray-800">
                            {row.other.missing
                              ? `Missing entry ${row.other.entry_id}`
                              : row.other.display_name}
                          </span>
                          {row.other.label ? (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 text-[10px] font-black text-gray-500">
                              {row.other.label}
                            </span>
                          ) : null}
                          {row.remark ? (
                            <span className="truncate text-xs font-medium text-gray-400">
                              {row.remark}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => deleteRelation(row)}
                            disabled={busy}
                            className="ml-auto shrink-0 text-xs font-bold text-gray-400 hover:text-red-500 disabled:opacity-40"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

`useToast` is imported from `../../hooks/useToast` and destructured as `const { showToast } = useToast()`, called as `showToast("success" | "error", message)` — the same shape `WatchOrders.jsx:145` uses.

- [ ] **Step 3: Register the route**

In `frontend/src/App.jsx`, add the import near line 51:

```jsx
import Relations from "./pages/admin/Relations";
```

and the route inside the `<ProtectedRoute />` block, after line 134:

```jsx
                  <Route path="/relations" element={<Relations />} />
```

- [ ] **Step 4: Add the nav links**

In `frontend/src/components/layout/Nav.jsx`, after the desktop Watch Orders link (lines 479-482):

```jsx
                    {isAdmin && (
                      <NavLink to="/relations" icon="fas fa-diagram-project">
                        Relations
                      </NavLink>
                    )}
```

and after the mobile one (lines 868-877):

```jsx
                {isAdmin && (
                  <Link
                    to="/relations"
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-sm font-bold text-gray-700 hover:text-brand"
                  >
                    Relations
                  </Link>
                )}
```

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Verify the page end to end**

With `uvicorn app.main:app --reload` running and logged in as admin, open `http://localhost:8000/relations` and confirm:

1. The Franchise/Collection toggle switches the picker and clears the selection.
2. Picking a franchise lists its entries grouped by media type.
3. Selecting an entry shows an empty relations panel and the add form.
4. Adding "This entry is the Prequel of…" against another entry succeeds, and the row appears under **Timeline** reading **Prequel**.
5. Selecting the *other* entry shows the same relation reading **Sequel**.
6. Both entries now show a count badge of 1 in the left pane.
7. Adding the identical relation again shows the 409 message as an error toast, and no second row appears.
8. Switching to Collection scope lists entries across the member franchises.
9. Deleting a relation removes it from both entries.

Check the browser console is clean throughout.

- [ ] **Step 7: Commit (after user approval)**

```bash
git add frontend/src/api/endpoints.js frontend/src/pages/admin/Relations.jsx frontend/src/App.jsx frontend/src/components/layout/Nav.jsx
git commit -m "feat(relations): add the /relations admin page"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/database-schema.md` (the new table; the six entry tables at lines ~250-252, 430-431, 517-518, 605-606, 708-709, 816-820; the note at line ~45 and ~852)
- Modify: `docs/business-logic.md`
- Modify: `docs/options.md`
- Modify: `docs/api.md`
- Modify: `docs/pages.md`
- Modify: `docs/admin-forms.md`
- Modify: `docs/integrations.md`

**Interfaces:**
- Consumes: everything built above.
- Produces: nothing code-facing.

- [ ] **Step 1: Update `docs/database-schema.md`**

Delete the `prequel_id` / `sequel_id` rows from all six entry tables, the `alternative` rows from anime (line ~252) and novel (line ~818), and every `derive_related` row. Keep `is_main_entry`, but reword its description from "Whether this is the main entry among its alternative entries" to reference `media_relation`'s `alternative` kind.

Add a `media_relation` section next to the Watch Order tables, documenting all nine columns, the two named constraints, the two lookup indexes, and the eight stored kinds with their inverse labels and families — copy the table from the spec.

Update the line ~45 note ("Collection is deliberately inert: it takes no part in watch-order/prequel-sequel derivation…") since prequel/sequel derivation no longer exists, and the line ~852 note about the per-entry `watch_order` column driving prequel/sequel derivation.

- [ ] **Step 2: Update `docs/business-logic.md`**

Remove the prequel/sequel derivation rules. Add a Media Relations section covering: relations are hand-curated, never derived; one row per fact; `prequel` normalizes to a swapped `sequel`; symmetric `alternative` sorts its endpoints so either entry order yields the same row; endpoints are FK-less and a deleted target reads as missing.

- [ ] **Step 3: Update `docs/options.md`**

Add the relation kinds as an options table: the nine user-facing labels, which eight are stored, each one's inverse label and family.

- [ ] **Step 4: Update `docs/api.md`**

Add the Media Relation router: all six endpoints, their auth requirement (reads public, writes admin), parameters, request bodies, and response models. Note the 409s for self-relation and duplicate.

- [ ] **Step 5: Update `docs/pages.md` and `docs/admin-forms.md`**

`pages.md`: add `/relations` — what it loads (`/kinds`, `/candidates`, `/`, `/for-entry`) and its two-pane structure.

`admin-forms.md`: note that the Add/Modify tabs no longer carry Prequel ID, Sequel ID, `alternative`, or `derive_related`, and that relations are now edited on `/relations` instead.

- [ ] **Step 6: Update `docs/integrations.md`**

Add the `Media Relation` sheet tab to the Backup/Pull tab list, noting it is written after every media tab because both endpoints are FK-less.

- [ ] **Step 7: Check for stale references**

Run: `grep -rni "prequel\|sequel\|derive_related" docs/*.md`

Every remaining hit should describe the new table, not the old columns. Fix any that do not. (`docs/superpowers/` is excluded — the plan and spec are not committed.)

- [ ] **Step 8: Commit (after user approval)**

```bash
git add docs/database-schema.md docs/business-logic.md docs/options.md docs/api.md docs/pages.md docs/admin-forms.md docs/integrations.md
git commit -m "docs(relations): document the media_relation table and /relations page"
```

---

## Final verification

- [ ] Run the full suite: `pytest tests/unit tests/api -q` — all green.
- [ ] `alembic upgrade head` from a clean database succeeds.
- [ ] `cd frontend && npm run build` succeeds.
- [ ] `/relations` works on **both** `:5173` and `:8000` — if it works on one only, suspect a stale build before suspecting the code.
- [ ] Run Backup, confirm the `Media Relation` tab fills, then run Pull for that tab and confirm the rows restore.
- [ ] Run Calculate and confirm its message no longer mentions prequel/sequel and no error is raised.
- [ ] Confirm `git status` shows **no** changes under `docs/superpowers/` staged or committed.
