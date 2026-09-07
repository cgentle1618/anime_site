# Seiyuu and Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who voices which character in which anime, by adding a `seiyuu` person role and two new tables — `character` and `character_casting`.

**Architecture:** A seiyuu needs **no schema change** — it is a `person` row plus a `person_role` row, and `person_role.role` is an unconstrained String validated only in Python. What is new is the link from a seiyuu to a work, which is character-first: `character_casting` holds one character, in one entry, optionally voiced by one person. An entry's cast list is derived from it; no `media_credit` row with `role="seiyuu"` ever exists.

**Tech Stack:** FastAPI + SQLAlchemy + PostgreSQL (Python 3.13), Alembic, React + Vite, Tailwind v4, pytest / ruff / vitest / eslint.

**Spec:** `docs/superpowers/specs/2026-09-05-seiyuu-character-design.md` — read it before Task 1. Every "Decision X" reference below points into it.

## Global Constraints

- **Concurrent sessions.** Other Claude Code sessions edit this same working tree on this same branch. Never `git add -A` or `git commit -a`; stage only the files your task names. Never revert, stash, or `git checkout --` a file you did not write. If an edit fails to match, re-read the file — it changed under you.
- **`app/utils/credit_roles.py` is actively being edited by another session.** Re-read it immediately before Task 1.
- **Alembic head.** The head was `st1a2g3s4` when this plan was written. Run `venv/Scripts/alembic.exe heads` at execution time and use whatever it reports as `down_revision` — a concurrent session may have added a revision. Single head must be preserved.
- **Test DB.** API tests need the `anime_site_test` PostgreSQL database. Backend commands run through `venv/Scripts/python.exe`.
- **Frontend builds.** After ANY frontend change run `cd frontend && npm run build`. `:5173` is the Vite dev server; `:8000` serves the prebuilt `frontend_dist/`. A change missing on one port only means a stale build.
- **Colour tokens.** Semantic tokens only (`bg-surface`, `text-text-muted`). `src/theme-tokens.test.js` fails the build on hard-coded grey utilities.
- **Media-type keys.** The registry uses underscores (`anime_movie`); the data layer uses hyphens (`anime-movie`). `character_casting.media_type` stores the **hyphenated** form.
- **Four keeps-green commands:** `venv/Scripts/python.exe -m pytest -q`, `venv/Scripts/ruff.exe check .`, `cd frontend && npm run test:run`, `cd frontend && npm run lint`. CI runs all four.
- **Never commit without the user's approval.** Each task's commit step prepares the commit message; the orchestrator asks before running it.
- **Vocabulary:** `seiyuu` scope is `anime` + `anime-movie`. `character_casting.media_type` may additionally be `manga` or `novel`, but only with `person_id` NULL.
- **Do NOT add a `cast_refs` to entry payloads.** `credit_refs` rides every list payload and carries a query-count guard test for exactly that reason; a cast list is long and needed on one page. Cast is always fetched separately through `/api/casting/...`. If you find yourself adding it to `app/schemas/link_fields.py`, stop.

---

## File Structure

**Backend — create:**

| File | Responsibility |
|---|---|
| `app/models/character.py` | `Character` and `CharacterCasting` ORM models |
| `app/schemas/character.py` | Character + casting request/response schemas |
| `app/routers/character.py` | CRUD, merge, delete-guard, reverse lookup |
| `app/routers/casting.py` | An entry's cast: GET + wholesale PUT |
| `app/services/domain/casting.py` | Cast read/write helpers shared by both routers |
| `alembic/versions/<rev>_add_character_tables.py` | One revision, two tables |

**Backend — modify:** `app/utils/credit_roles.py`, `app/routers/constants.py`, `app/models/__init__.py`, `app/schemas/__init__.py`, `app/main.py`, `app/routers/person.py`, `app/utils/formatter.py`, `app/services/pipelines/tabs.py`.

**Frontend — create:** `src/components/forms/CastEditor.jsx`, `src/pages/library/CharacterLibrary.jsx`, `src/pages/detail/Character.jsx`, plus their tests.

**Frontend — modify:** `src/api/endpoints.js`, `src/App.jsx`, `src/config/navigation.js`, `src/config/adminTabs.js`, the four Add/Modify tabs, the four detail pages.

---

## Phase 1 — Vocabulary and data

### Task 1: The `seiyuu` role and the `credited_via` axis

**Files:**
- Modify: `app/utils/credit_roles.py`
- Modify: `app/routers/constants.py`
- Test: `tests/unit/test_credit_roles.py`

**Interfaces:**
- Produces: `CreditRole.credited_via: str` (default `"media_credit"`); `CREDIT_ROLES["seiyuu"]`; `PERSON_ROLES` now length 6 including `"seiyuu"`; `credit_roles_for(media_type)` returns only `credited_via == "media_credit"` roles; `CHARACTER_ROLES: tuple[str, ...] = ("Main", "Supporting")`.

- [ ] **Step 1: Re-read the file first**

Another session is editing `app/utils/credit_roles.py`. Read it in full before editing. It should already contain `original_source`, `exclusive_source` and `serialization_platform` tag fields — leave every one of them alone.

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/test_credit_roles.py`:

```python
from app.utils.credit_roles import (
    CREDIT_ROLES,
    PERSON_ROLES,
    credit_roles_for,
    legal_scopes,
)


def test_seiyuu_is_a_person_role_scoped_to_the_two_anime_types():
    assert "seiyuu" in PERSON_ROLES
    assert CREDIT_ROLES["seiyuu"].target == "person"
    assert legal_scopes("seiyuu") == ("anime", "anime-movie")


def test_seiyuu_credits_are_not_stored_in_media_credit():
    """
    Decision A: the cast list has exactly one home, character_casting. If
    credit_roles_for() started returning seiyuu, /api/credits would ask for
    media_credit rows that never exist and the entry forms would grow a
    phantom Seiyuu dropdown.
    """
    assert CREDIT_ROLES["seiyuu"].credited_via == "character_casting"
    for media_type in ("anime", "anime-movie"):
        assert "seiyuu" not in {r.key for r in credit_roles_for(media_type)}


def test_every_other_role_still_stores_credits_in_media_credit():
    for key, role in CREDIT_ROLES.items():
        if key != "seiyuu":
            assert role.credited_via == "media_credit"


def test_director_is_still_returned_for_anime():
    """Guards the credit_roles_for() filter against over-filtering."""
    assert "director" in {r.key for r in credit_roles_for("anime")}
    assert "studio" in {r.key for r in credit_roles_for("anime")}
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_credit_roles.py -v`
Expected: FAIL — `KeyError: 'seiyuu'` and `AttributeError: credited_via`.

- [ ] **Step 4: Add the field and the role**

In `app/utils/credit_roles.py`, add the field to the dataclass (last, because it has a default):

```python
@dataclass(frozen=True)
class CreditRole:
    """One role a person or studio can be credited in."""

    key: str
    label: str
    target: str
    media_types: tuple[str, ...]
    # Where this role's credits are STORED. "media_credit" for the six roles
    # whose rows live there; "character_casting" for seiyuu, whose casting is
    # a character-first fact - who voiced WHOM - and so cannot be a flat
    # person->entry link. See the design spec's Decision A and B.
    credited_via: str = "media_credit"
```

Add to `CREDIT_ROLES`, after `"composer"`:

```python
    # Stored in character_casting, NOT media_credit: a seiyuu reaches an anime
    # through the character they voice. credit_roles_for() filters this out for
    # exactly that reason.
    "seiyuu": CreditRole(
        "seiyuu", "Seiyuu 聲優", "person", ("anime", "anime-movie"),
        credited_via="character_casting",
    ),
```

Replace `credit_roles_for`:

```python
def credit_roles_for(media_type: str) -> tuple[CreditRole, ...]:
    """
    Every credit role usable on entries of this media type whose rows live in
    `media_credit`.

    The credited_via filter is not cosmetic: /api/credits and the sheet
    link-column builder both walk this, and seiyuu has no media_credit rows to
    find. A seiyuu's work is read through /api/casting instead.
    """
    return tuple(
        r
        for r in CREDIT_ROLES.values()
        if media_type in r.media_types and r.credited_via == "media_credit"
    )
```

Update the module docstring: it says "the same five person keys plus `studio`". Change to six person keys and add a sentence that `seiyuu` is the one whose rows live elsewhere.

- [ ] **Step 5: Audit every other call site**

Run: `venv/Scripts/python.exe -c "import app.main"` then
`grep -rn "CREDIT_ROLES\|CREDIT_ROLE_KEYS\|PERSON_ROLES\|credit_roles_for" app/ --include=*.py`

For each hit, decide whether it means "roles stored in media_credit" (must exclude seiyuu) or "roles a person can hold" (must include it). `PERSON_ROLES` uses — `person.py` role-counts, `PersonRoleIn._known_role`, `/role-scopes` — are all the second kind and are correct unchanged. Record any hit you changed in the commit message.

- [ ] **Step 6: Add `CHARACTER_ROLES`**

In `app/routers/constants.py`, beside the other fixed vocabularies:

```python
# What a character is to the work, from MAL's own two-way split. Nullable on
# character_casting: an admin entering a cast by hand need not classify.
CHARACTER_ROLES: tuple[str, ...] = ("Main", "Supporting")
```

Expose it on the constants endpoint the same way its neighbours are — read the file and follow the existing pattern exactly.

- [ ] **Step 7: Run the tests and the linter**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_credit_roles.py tests/api/test_credits_router.py tests/api/test_person_router.py -q`
Expected: PASS. The credits-router tests are the regression guard on the `credit_roles_for` filter.

Run: `venv/Scripts/ruff.exe check .` — expected clean.

- [ ] **Step 8: Commit**

```bash
git add app/utils/credit_roles.py app/routers/constants.py tests/unit/test_credit_roles.py
git commit -m "feat(seiyuu): seiyuu person role with a credited_via axis"
```

---

### Task 2: The `character` and `character_casting` tables

**Files:**
- Create: `app/models/character.py`
- Create: `alembic/versions/<rev>_add_character_tables.py`
- Modify: `app/models/__init__.py`
- Test: `tests/services/test_character_model.py`, `tests/services/test_character_casting_model.py`

**Interfaces:**
- Consumes: `CHARACTER_ROLES` from Task 1.
- Produces: `models.Character` (with `.display_name`, `.names_dict`, `._name_fields`), `models.CharacterCasting`. Constraint names other tasks assert on: `ck_character_has_a_name`, `uq_character_casting`, `ck_casting_voice_scope`, `ix_character_casting_entry`.

- [ ] **Step 1: Write the failing model tests**

Create `tests/services/test_character_model.py`. Mirror the fixtures in the existing `tests/services/test_person_model.py` — read it first and copy its session setup exactly.

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_display_name_uses_the_chosen_field(db_session):
    c = models.Character(name_en="Ichika", name_jp="一花", display_name_field="jp")
    db_session.add(c)
    db_session.flush()
    assert c.display_name == "一花"


def test_display_name_falls_back_when_the_chosen_field_is_empty(db_session):
    c = models.Character(name_en="Ichika", display_name_field="jp")
    db_session.add(c)
    db_session.flush()
    assert c.display_name == "Ichika"


def test_a_character_needs_at_least_one_name(db_session):
    db_session.add(models.Character(gender="Female"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_two_unrelated_characters_may_share_a_name(db_session):
    """
    Decision G. Character names are NOT unique - 'Yuki' recurs across unrelated
    works and there is no owning franchise to scope a constraint to. This test
    exists so that anyone 'restoring' a uq_character_name to match uq_person_name
    fails loudly instead of silently merging two people's favourite characters.
    """
    db_session.add(models.Character(name_en="Yuki"))
    db_session.add(models.Character(name_en="Yuki"))
    db_session.flush()
    assert db_session.query(models.Character).filter_by(name_en="Yuki").count() == 2
```

- [ ] **Step 2: Write the failing casting tests**

Create `tests/services/test_character_casting_model.py`. It needs a real anime and a real person; copy the entry/person fixture pattern from `tests/services/test_media_credit_model.py`.

```python
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_one_casting_per_character_per_entry(db_session, anime, character):
    for _ in range(2):
        db_session.add(
            models.CharacterCasting(
                character_id=character.system_id,
                media_type="anime",
                entry_id=anime.system_id,
            )
        )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_manga_casting_cannot_name_a_seiyuu(db_session, manga, character, person):
    """
    ck_casting_voice_scope. Characters reach the four ACG types; seiyuu reach
    only anime and anime-movie. Nobody voices anyone in a manga.
    """
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="manga",
            entry_id=manga.system_id,
            person_id=person.system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_manga_casting_without_a_seiyuu_is_fine(db_session, manga, character):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="manga",
            entry_id=manga.system_id,
        )
    )
    db_session.flush()


def test_deleting_the_seiyuu_keeps_the_casting(db_session, anime, character, person):
    """
    Decision H. media_credit CASCADEs on person delete because the credit IS
    the person's link to the work. A casting is the CHARACTER's link to the
    work, so deleting the seiyuu must not delete Ichika from the anime.
    """
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type="anime",
        entry_id=anime.system_id,
        person_id=person.system_id,
    )
    db_session.add(casting)
    db_session.commit()

    db_session.delete(person)
    db_session.commit()
    db_session.expire_all()

    survivor = db_session.get(models.CharacterCasting, casting.system_id)
    assert survivor is not None
    assert survivor.person_id is None


def test_deleting_the_character_removes_the_casting(db_session, anime, character):
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type="anime",
        entry_id=anime.system_id,
    )
    db_session.add(casting)
    db_session.commit()
    casting_id = casting.system_id

    db_session.delete(character)
    db_session.commit()

    assert db_session.get(models.CharacterCasting, casting_id) is None
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/services/test_character_model.py tests/services/test_character_casting_model.py -v`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'Character'`.

- [ ] **Step 4: Write the models**

Create `app/models/character.py`:

```python
"""Character entity ORM models: characters and their per-entry castings."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Character(Base, NameFallbackMixin):
    """
    One fictional character, shared across every entry they appear in.

    Shaped like Person deliberately, with ONE deviation: there is no unique
    constraint over the names. uq_person_name works because a human's full
    name is nearly unique; character names are not - "Yuki" and "Ichika" recur
    across unrelated works - and a character has no owning franchise to scope
    a constraint to, so any uniqueness rule here would refuse legitimate rows.
    Duplicates are found by the name-match search the cast editor runs and
    fixed by the merge endpoint. Do not "restore" a constraint to match the
    siblings; test_two_unrelated_characters_may_share_a_name will stop you.
    See the design spec's Decision G.
    """

    __tablename__ = "character"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_has_a_name",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name_en = Column(String, nullable=True, index=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    # One of constants.MY_RATINGS.
    my_rating = Column(String, nullable=True)
    # GCS object key. The canonical portrait; a casting may override it with
    # its own photo_file for how the character looks in that entry.
    photo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    castings = relationship(
        "CharacterCasting",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    _DISPLAY_FIELDS = {
        "en": "name_en", "cn": "name_cn", "jp": "name_jp", "alt": "name_alt",
    }

    @property
    def names_dict(self) -> dict:
        """Every name variation, for resolution and for the detail page."""
        return {
            "en": self.name_en,
            "cn": self.name_cn,
            "jp": self.name_jp,
            "alt": self.name_alt,
        }

    @property
    def display_name(self) -> str:
        """
        The name to show. Like Person and Studio, the choice is DATA:
        display_name_field names the winner, and the chain below is only the
        fallback for when that is NULL or names an empty column.
        """
        chosen = self._DISPLAY_FIELDS.get(self.display_name_field or "")
        if chosen:
            value = getattr(self, chosen)
            if value and value.strip():
                return value.strip()
        sequence = [
            ("EN", self.name_en),
            ("CN", self.name_cn),
            ("JP", self.name_jp),
            ("Alt", self.name_alt),
        ]
        return self.get_fallback_name(sequence, "EN")


class CharacterCasting(Base):
    """
    One character, in one entry, optionally voiced by one person.

    THE cast record - there is no second one. No media_credit row with
    role="seiyuu" exists anywhere, because a seiyuu reaches an anime through
    the character they voice; deriving the entry's seiyuu list from these rows
    is what keeps "who is in this anime" to a single answer. See Decision A.

    The entry endpoint is a FK-less (media_type, entry_id) pair, the same
    contract media_credit and media_relation use.

    person_id is ON DELETE SET NULL, NOT CASCADE like media_credit.person_id.
    A credit IS the person's link to the work and dies with them; a casting is
    the CHARACTER's link to the work and merely names a seiyuu, so deleting a
    seiyuu must not delete the character from the anime. See Decision H.
    """

    __tablename__ = "character_casting"
    __table_args__ = (
        # One casting per character per entry - the whole point of recording
        # casting per appearance rather than per character. No NULLS NOT
        # DISTINCT needed here, unlike uq_person_name: all three columns are
        # NOT NULL, so Postgres has no NULL to treat as distinct from itself.
        UniqueConstraint(
            "character_id", "media_type", "entry_id", name="uq_character_casting"
        ),
        # Characters reach the four ACG types; seiyuu reach only two of them.
        # Enforced here rather than by convention because the Fill pipeline and
        # any future migration write these rows without going through the API.
        CheckConstraint(
            "person_id IS NULL OR media_type IN ('anime', 'anime-movie')",
            name="ck_casting_voice_scope",
        ),
        Index("ix_character_casting_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("character.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of "anime", "anime-movie", "manga", "novel" (hyphenated keys).
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("person.system_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # One of constants.CHARACTER_ROLES.
    role = Column(String, nullable=True)
    position = Column(Integer, nullable=False, default=0, server_default="0")
    # GCS key: this character AS SHE APPEARS in this entry. NULL falls back to
    # character.photo_file at read time.
    photo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)

    character = relationship("Character", back_populates="castings")
```

In `app/models/__init__.py`, add `from app.models.character import Character, CharacterCasting` in alphabetical position (after `cartoon`), and add both names to `__all__` if the file declares one.

- [ ] **Step 5: Write the migration**

Run `venv/Scripts/alembic.exe heads` and use the reported head as `down_revision`. Do **not** autogenerate — write it by hand so the CHECK constraints are exact:

```python
"""Add the character and character_casting tables.

Revision ID: c1h2a3r4a5c6
Revises: <the head alembic reports>
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "c1h2a3r4a5c6"
down_revision = "<the head alembic reports>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "character",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("name_jp", sa.String(), nullable=True),
        sa.Column("name_alt", sa.String(), nullable=True),
        sa.Column("display_name_field", sa.String(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("photo_file", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_has_a_name",
        ),
    )
    op.create_index("ix_character_system_id", "character", ["system_id"])
    op.create_index("ix_character_name_en", "character", ["name_en"])

    op.create_table(
        "character_casting",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "character_id",
            UUID(as_uuid=True),
            sa.ForeignKey("character.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "person_id",
            UUID(as_uuid=True),
            sa.ForeignKey("person.system_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("photo_file", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "character_id", "media_type", "entry_id", name="uq_character_casting"
        ),
        sa.CheckConstraint(
            "person_id IS NULL OR media_type IN ('anime', 'anime-movie')",
            name="ck_casting_voice_scope",
        ),
    )
    op.create_index(
        "ix_character_casting_system_id", "character_casting", ["system_id"]
    )
    op.create_index(
        "ix_character_casting_character_id", "character_casting", ["character_id"]
    )
    op.create_index(
        "ix_character_casting_person_id", "character_casting", ["person_id"]
    )
    op.create_index(
        "ix_character_casting_entry", "character_casting", ["media_type", "entry_id"]
    )


def downgrade() -> None:
    op.drop_table("character_casting")
    op.drop_table("character")
```

Note: `character` is a reserved-ish word in some dialects but is a legal unquoted table name in PostgreSQL; SQLAlchemy quotes it where needed. Do not rename it.

- [ ] **Step 6: Apply the migration and run the tests**

Run: `venv/Scripts/alembic.exe upgrade head`
Then: `venv/Scripts/alembic.exe heads` — expected: exactly one head.
Then: `venv/Scripts/python.exe -m pytest tests/services/test_character_model.py tests/services/test_character_casting_model.py -v`
Expected: PASS.

Verify the downgrade works before trusting it: `venv/Scripts/alembic.exe downgrade -1` then `upgrade head`.

- [ ] **Step 7: Full suite + lint**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: green. A new table must not disturb anything.

- [ ] **Step 8: Commit**

```bash
git add app/models/character.py app/models/__init__.py \
  alembic/versions/c1h2a3r4a5c6_add_character_tables.py \
  tests/services/test_character_model.py \
  tests/services/test_character_casting_model.py
git commit -m "feat(character): character and character_casting tables"
```

---

### Task 3: Character schemas and the `/api/character` router

**Files:**
- Create: `app/schemas/character.py`, `app/routers/character.py`
- Modify: `app/schemas/__init__.py`, `app/main.py`
- Test: `tests/api/test_character_router.py`

**Interfaces:**
- Consumes: `models.Character`, `models.CharacterCasting` (Task 2).
- Produces: `schemas.CharacterCreate`, `CharacterUpdate`, `CharacterResponse` (fields: `system_id`, the four names, `display_name_field`, `display_name`, `gender`, `my_rating`, `photo_file`, `remark`, `casting_count: int`). Routes: `GET /api/character/`, `GET /api/character/{id}`, `GET /api/character/{id}/entries`, `POST /api/character/`, `PUT /api/character/{id}`, `DELETE /api/character/{id}?castings=N`, `POST /api/character/{id}/merge`.

- [ ] **Step 1: Read the mirror first**

Read `app/routers/person.py` and `app/schemas/staff.py` end to end. This router is that router with three deliberate differences, listed in Step 3. Follow its structure, its section-comment banners and its docstring density.

- [ ] **Step 2: Write the failing API tests**

Create `tests/api/test_character_router.py`, copying the client/admin fixtures from `tests/api/test_person_router.py`.

```python
def test_create_character(admin_client):
    r = admin_client.post("/api/character/", json={"name_en": "Ichika"})
    assert r.status_code == 200
    assert r.json()["display_name"] == "Ichika"


def test_a_nameless_character_is_a_422_not_a_500(admin_client):
    r = admin_client.post("/api/character/", json={"gender": "Female"})
    assert r.status_code == 422


def test_two_posts_of_one_name_create_two_characters(admin_client):
    """
    Decision G. POST /api/person is find-or-create because two spellings of one
    director are one human. Characters are the opposite: the Yuki of one work
    and the Yuki of another are different people, and quietly returning the
    first would fuse two casts. Disambiguation belongs in the cast editor's
    combobox, not in a silent server-side match.
    """
    first = admin_client.post("/api/character/", json={"name_en": "Yuki"}).json()
    second = admin_client.post("/api/character/", json={"name_en": "Yuki"}).json()
    assert first["system_id"] != second["system_id"]


def test_delete_rejects_a_stale_casting_count(admin_client, character_with_castings):
    """
    The admin agreed to destroy a specific amount of casting history. A count
    that moved underneath them - another session casting this character while
    the dialog was open - is not what they agreed to.
    """
    r = admin_client.delete(f"/api/character/{character_with_castings.system_id}?castings=99")
    assert r.status_code == 409


def test_delete_succeeds_with_the_right_count(admin_client, character_with_castings):
    r = admin_client.delete(f"/api/character/{character_with_castings.system_id}?castings=1")
    assert r.status_code == 200


def test_merge_repoints_castings_and_deletes_the_loser(
    admin_client, character, duplicate_character, anime
):
    r = admin_client.post(
        f"/api/character/{character.system_id}/merge",
        json={"source_id": str(duplicate_character.system_id)},
    )
    assert r.status_code == 200
    assert r.json()["castings_moved"] == 1
    assert admin_client.get(
        f"/api/character/{duplicate_character.system_id}"
    ).status_code == 404


def test_guest_cannot_create_a_character(client):
    assert client.post("/api/character/", json={"name_en": "Ichika"}).status_code == 401
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_router.py -v`
Expected: FAIL — 404 on every route.

- [ ] **Step 4: Write the schemas**

Create `app/schemas/character.py`, modelled on `PersonBase`/`PersonUpdate`/`PersonResponse` in `app/schemas/staff.py`. `CharacterCreate` takes **no** unslotted `name` field and **no** `roles` — a character holds no roles, and there is no find-or-create path that would need name slotting. Include the `_display_field_is_known` and `_at_least_one_name` validators, mirroring `ck_character_has_a_name` so a nameless character is a 422 rather than a 500 surfacing IntegrityError. `CharacterResponse` carries `casting_count: int = 0`, not `credit_count`.

Export all three from `app/schemas/__init__.py` following the existing style.

- [ ] **Step 5: Write the router**

Create `app/routers/character.py` mirroring `app/routers/person.py`, with these three differences — comment each one where it occurs:

1. **`POST /` is a plain create, not find-or-create.** Do not call any `find_*` helper. Comment it with the Decision G reasoning from the test above.
2. **`casting_count`** replaces `credit_count`, counting `CharacterCasting` rows and passing them through `filter_visible_pairs(db, viewer, [(mt, eid), ...])` exactly as `person._to_response` does, so the card and the page cannot disagree.
3. **`DELETE ?castings=N`** replaces `?credits=N`, and `merge` returns `{"status": "success", "castings_moved": N}`.

`GET /{system_id}/entries` mirrors `get_person_entries`: group by `media_type`, resolve entries through `MEDIA_TABLES`, filter with `filter_visible_pairs`, sort newest-first with undated last via `primary_release_value`, and additionally put the seiyuu's `display_name` and `system_id` on each entry so the character page can link to them. Keep the "group exists even when empty" behaviour and its comment — a character carries no content label of their own.

Register in `app/main.py`: `from app.routers import character` in the import block, and `app.include_router(character.router)` beside `person`.

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_character_router.py -v`
Expected: PASS.

- [ ] **Step 7: Full suite + lint, then commit**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`

```bash
git add app/schemas/character.py app/schemas/__init__.py app/routers/character.py \
  app/main.py tests/api/test_character_router.py
git commit -m "feat(character): /api/character CRUD, merge and reverse lookup"
```

---

### Task 4: The `/api/casting` router

**Files:**
- Create: `app/services/domain/casting.py`, `app/routers/casting.py`
- Modify: `app/main.py`, `app/services/domain/__init__.py`
- Test: `tests/api/test_casting_router.py`

**Interfaces:**
- Consumes: `models.CharacterCasting`, `models.Character`, `models.Person`.
- Produces: `casting_rows(db, media_type, entry_id) -> list[dict]` and `replace_casting(db, media_type, entry_id, rows) -> None` in `app/services/domain/casting.py`; routes `GET|PUT /api/casting/{media_type}/{entry_id}`.

The response row shape, which Tasks 8 and 10 both consume:

```json
{
  "system_id": "...",
  "character_id": "...",
  "character_name": "Ichika",
  "person_id": "...",
  "person_name": "Hanazawa Kana",
  "role": "Main",
  "position": 0,
  "photo_file": "characters/abc.jpg",
  "remark": null
}
```

`photo_file` is already resolved: the casting's own value, or the character's if that is NULL.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_casting_router.py`:

```python
def test_get_returns_an_empty_cast_for_a_bare_anime(client, anime):
    r = client.get(f"/api/casting/anime/{anime.system_id}")
    assert r.status_code == 200
    assert r.json()["cast"] == []


def test_put_replaces_the_whole_cast(admin_client, anime, character, person):
    body = {"cast": [{
        "character_id": str(character.system_id),
        "person_id": str(person.system_id),
        "role": "Main",
        "position": 0,
    }]}
    assert admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body).status_code == 200

    rows = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert len(rows) == 1
    assert rows[0]["character_name"] == character.display_name
    assert rows[0]["person_name"] == person.display_name

    assert admin_client.put(
        f"/api/casting/anime/{anime.system_id}", json={"cast": []}
    ).status_code == 200
    assert admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"] == []


def test_cast_is_ordered_by_position(admin_client, anime, character, second_character):
    body = {"cast": [
        {"character_id": str(second_character.system_id), "position": 1},
        {"character_id": str(character.system_id), "position": 0},
    ]}
    admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body)
    rows = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [r["character_id"] for r in rows] == [
        str(character.system_id), str(second_character.system_id)
    ]


def test_a_seiyuu_on_a_manga_casting_is_rejected(admin_client, manga, character, person):
    """ck_casting_voice_scope, surfaced as a 422 rather than a 500."""
    body = {"cast": [{
        "character_id": str(character.system_id),
        "person_id": str(person.system_id),
    }]}
    r = admin_client.put(f"/api/casting/manga/{manga.system_id}", json=body)
    assert r.status_code == 422


def test_photo_falls_back_to_the_character_portrait(admin_client, anime, character):
    """The casting shows how she looks in THIS entry; absent that, her portrait."""
    body = {"cast": [{"character_id": str(character.system_id)}]}
    admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body)
    row = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"][0]
    assert row["photo_file"] == character.photo_file


def test_an_unknown_media_type_is_a_400(client, anime):
    assert client.get(f"/api/casting/nonsense/{anime.system_id}").status_code == 400


def test_a_hidden_entry_answers_404(client, hidden_anime):
    """
    A cast names the people on an entry, and a 200 confirms it exists, so a
    hidden entry has to answer exactly as an absent one does.
    """
    assert client.get(f"/api/casting/anime/{hidden_anime.system_id}").status_code == 404


def test_guest_cannot_replace_a_cast(client, anime):
    assert client.put(f"/api/casting/anime/{anime.system_id}", json={"cast": []}).status_code == 401
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_casting_router.py -v`
Expected: FAIL — 404 on every route.

- [ ] **Step 3: Write the service**

Create `app/services/domain/casting.py` with `casting_rows` and `replace_casting`. Requirements:

- `casting_rows` loads castings for the pair ordered by `position`, then bulk-loads the referenced characters and people in **two** queries — not one per row. Resolve `photo_file` with the character fallback here, so both the router and any future reader get it right once.
- `replace_casting` deletes the entry's existing castings and inserts the payload rows in order, assigning `position` from list index when the payload omits it. Validate `media_type` against the four ACG keys and `person_id is None or media_type in ("anime", "anime-movie")` **in Python**, raising a 422-mapped error, so the CHECK constraint is a backstop rather than the user-facing message.
- Validate `role` against `CHARACTER_ROLES` when present.

Export from `app/services/domain/__init__.py` following the existing style.

- [ ] **Step 4: Write the router**

Create `app/routers/casting.py`, modelled on `app/routers/credits.py` — same `_resolve_entry` shape (unknown media type → 400 before anything else, so it is not a KeyError), same `entry_visible` 404 treatment, `get_current_admin` on PUT. Register in `app/main.py` beside `credits`.

Its module docstring must say why this is not part of `/api/credits`: that payload is `Dict[str, List[str]]`, bare names, and a cast row carries a character, a seiyuu, a role, a position, a photo and a remark.

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_casting_router.py -v`
Expected: PASS.

- [ ] **Step 6: Full suite + lint, then commit**

```bash
git add app/services/domain/casting.py app/services/domain/__init__.py \
  app/routers/casting.py app/main.py tests/api/test_casting_router.py
git commit -m "feat(casting): /api/casting read and wholesale replace per entry"
```

---

### Task 5: Repair the three person behaviours that assume `media_credit`

**Files:**
- Modify: `app/routers/person.py`
- Test: `tests/api/test_person_router.py`, `tests/api/test_person_entries.py`

**Interfaces:**
- Consumes: `casting_rows` (Task 4), `models.CharacterCasting`.
- Produces: no new names. `PersonResponse.credit_count` now includes castings; `/api/person/{id}/entries` gains groups with `"role": "seiyuu"`; `DELETE /api/person/{id}?credits=N` counts castings in `N`.

Each of these is a bug that ships silently if skipped: a seiyuu is a person whose entire body of work lives outside `media_credit`.

- [ ] **Step 1: Write the three failing tests**

Add to `tests/api/test_person_router.py`:

```python
def test_credit_count_includes_castings(client, seiyuu_with_one_casting):
    """
    A seiyuu with fifty castings and no other credits would otherwise read
    "0 credits" on their card, because credit_count only ever walked
    media_credit and a seiyuu has no rows there. See Decision A.
    """
    r = client.get(f"/api/person/{seiyuu_with_one_casting.system_id}")
    assert r.json()["credit_count"] == 1


def test_person_delete_guard_counts_castings(admin_client, seiyuu_with_one_casting):
    stale = admin_client.delete(
        f"/api/person/{seiyuu_with_one_casting.system_id}?credits=0"
    )
    assert stale.status_code == 409
    ok = admin_client.delete(
        f"/api/person/{seiyuu_with_one_casting.system_id}?credits=1"
    )
    assert ok.status_code == 200
```

Add to `tests/api/test_person_entries.py`:

```python
def test_a_seiyuus_entries_come_from_castings(client, seiyuu_with_one_casting, anime):
    """A pure seiyuu's page would otherwise be empty: /entries walked only
    media_credit, where a seiyuu has nothing."""
    groups = client.get(
        f"/api/person/{seiyuu_with_one_casting.system_id}/entries"
    ).json()["groups"]
    seiyuu_groups = [g for g in groups if g["role"] == "seiyuu"]
    assert len(seiyuu_groups) == 1
    group = seiyuu_groups[0]
    assert group["media_type"] == "anime"
    assert group["label"] == "Seiyuu 聲優"
    assert [e["system_id"] for e in group["entries"]] == [str(anime.system_id)]
    # The character voiced is the point of a seiyuu credit; without it the
    # group says only "was in this anime", which is what Decision A rejected.
    assert group["entries"][0]["character_name"]


def test_a_hidden_entry_is_filtered_from_a_seiyuus_groups(
    client, seiyuu_with_hidden_casting
):
    groups = client.get(
        f"/api/person/{seiyuu_with_hidden_casting.system_id}/entries"
    ).json()["groups"]
    for group in groups:
        assert group["entries"] == []
```

Add a `seiyuu_with_one_casting` fixture: a `Person` with a `PersonRole(role="seiyuu", scope="anime")` and one `CharacterCasting` pointing at an anime.

- [ ] **Step 2: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_router.py tests/api/test_person_entries.py -v`
Expected: FAIL — `credit_count == 0`, empty groups, and a 409 on the correct count.

- [ ] **Step 3: Fix `_to_response`**

In `app/routers/person.py`, extend the credit-row query to union casting rows before `filter_visible_pairs`:

```python
    casting_rows = (
        db.query(models.CharacterCasting.media_type, models.CharacterCasting.entry_id)
        .filter(models.CharacterCasting.person_id == person.system_id)
        .all()
    )
```

Combine both lists into the single `filter_visible_pairs` call so the count still runs one visibility pass. Update the existing comment to say the count spans both stores, and why.

- [ ] **Step 4: Fix `get_person_entries`**

After the `media_credit` groups are built, add casting-derived groups keyed `(media_type, "seiyuu")`. Reuse the same `filter_visible_pairs` set, the same `MEDIA_TABLES` bulk load, the same newest-first sort with undated last, and the same "the group exists even when every entry is hidden" rule. Each entry dict gains `character_name` and `character_id` alongside the existing keys. The label comes from `credit_label("seiyuu", media_type)`.

- [ ] **Step 5: Fix the delete guard**

In `delete_person`, add the casting count to `actual` before comparing with `credits`. Update the docstring: under Decision H those castings are **not** destroyed — `person_id` is set to NULL and the character keeps their place in the anime — so the message must not claim the credits are lost. Say what actually happens.

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_router.py tests/api/test_person_entries.py -v`
Expected: PASS.

- [ ] **Step 7: Full suite + lint, then commit**

```bash
git add app/routers/person.py tests/api/test_person_router.py tests/api/test_person_entries.py
git commit -m "fix(person): count and list castings, not just media_credit rows"
```

---

### Task 6: Google Sheets backup and restore

**Files:**
- Modify: `app/utils/formatter.py`, `app/services/pipelines/tabs.py`
- Test: `tests/services/test_credits_sheets.py`

**Interfaces:**
- Consumes: `models.Character`, `models.CharacterCasting`.
- Produces: `parse_character_from_sheet(raw) -> dict`, `parse_character_casting_from_sheet(raw) -> dict`; two `SheetTab` entries named `"Character"` and `"Character Casting"`.

This is what carries the feature across the company ↔ home switch (`docs/switching-environments.md`). Without it a Pull All silently wipes every character.

- [ ] **Step 1: Write the failing round-trip test**

Add to `tests/services/test_credits_sheets.py`, following the round-trip pattern already there for Person:

```python
from app.services.pipelines.tabs import SHEET_TABS


def test_both_character_tabs_are_registered():
    names = [t.name for t in SHEET_TABS]
    assert "Character" in names
    assert "Character Casting" in names


def test_character_restores_before_every_media_tab():
    """
    SHEET_TABS is the RESTORE order and it is strict. Character sits with the
    other entity tabs so castings can point at it; Character Casting sits after
    every media tab because it reaches entries by the FK-less pair.
    """
    names = [t.name for t in SHEET_TABS]
    assert names.index("Character") < names.index("Anime")
    assert names.index("Character Casting") > names.index("Novel")


def test_character_round_trips_through_the_sheet(db_session, character):
    raw = {
        "system_id": str(character.system_id),
        "name_en": "Ichika",
        "name_jp": "一花",
        "display_name_field": "jp",
        "gender": "Female",
        "my_rating": "",
        "photo_file": "",
        "remark": "",
        "created_at": "",
        "updated_at": "",
    }
    parsed = f.parse_character_from_sheet(raw)
    assert parsed["name_jp"] == "一花"
    assert parsed["display_name_field"] == "jp"
    assert parsed["my_rating"] is None


def test_casting_round_trips_through_the_sheet(anime, character, person):
    raw = {
        "system_id": str(uuid.uuid4()),
        "character_id": str(character.system_id),
        "media_type": "anime",
        "entry_id": str(anime.system_id),
        "person_id": str(person.system_id),
        "role": "Main",
        "position": "0",
        "photo_file": "",
        "remark": "",
        "created_at": "",
    }
    parsed = f.parse_character_casting_from_sheet(raw)
    assert parsed["media_type"] == "anime"
    assert parsed["position"] == 0
    assert parsed["person_id"] is not None


def test_a_castings_empty_person_round_trips_as_none(anime, character):
    """A manga casting has no seiyuu; an empty cell must not become a bad UUID."""
    raw = {
        "system_id": str(uuid.uuid4()),
        "character_id": str(character.system_id),
        "media_type": "manga",
        "entry_id": str(anime.system_id),
        "person_id": "",
        "role": "",
        "position": "0",
        "photo_file": "",
        "remark": "",
        "created_at": "",
    }
    assert f.parse_character_casting_from_sheet(raw)["person_id"] is None
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/services/test_credits_sheets.py -v`
Expected: FAIL — `AttributeError: parse_character_from_sheet`.

- [ ] **Step 3: Write the parsers**

In `app/utils/formatter.py`, beside `parse_person_from_sheet`:

```python
def parse_character_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Character sheet into typed data ready for
    the Database.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "name_en": parse_from_sheet(raw.get("name_en"), str),
        "name_cn": parse_from_sheet(raw.get("name_cn"), str),
        "name_jp": parse_from_sheet(raw.get("name_jp"), str),
        "name_alt": parse_from_sheet(raw.get("name_alt"), str),
        "display_name_field": parse_from_sheet(raw.get("display_name_field"), str),
        "gender": parse_from_sheet(raw.get("gender"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "photo_file": parse_from_sheet(raw.get("photo_file"), str),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }


def parse_character_casting_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Character Casting sheet into typed data
    ready for the Database. The Character, Person and every media tab restore
    before this one (see SHEET_TABS), so character_id, person_id and entry_id
    all round-trip as plain UUIDs with no name-resolution step.

    person_id is blank on every manga and novel row - nobody voices anyone in
    a manga - so it goes through _uuid_or_none rather than a strict parse.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "character_id": _uuid_or_none(raw.get("character_id")),
        "media_type": parse_from_sheet(raw.get("media_type"), str),
        "entry_id": _uuid_or_none(raw.get("entry_id")),
        "person_id": _uuid_or_none(raw.get("person_id")),
        "role": parse_from_sheet(raw.get("role"), str),
        "position": parse_from_sheet(raw.get("position"), int),
        "photo_file": parse_from_sheet(raw.get("photo_file"), str),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
    }
```

- [ ] **Step 4: Register the tabs, in the right places**

In `app/services/pipelines/tabs.py`, add `Character` to the entity block beside Person and Studio:

```python
    SheetTab("Character", models.Character, f.parse_character_from_sheet),
```

and `Character Casting` **after every media tab**, with the other pair-addressed tabs:

```python
    # After every media tab: a casting reaches its entry by the FK-less
    # (media_type, entry_id) pair, so each entry must already exist.
    SheetTab(
        "Character Casting",
        models.CharacterCasting,
        f.parse_character_casting_from_sheet,
    ),
```

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/services/test_credits_sheets.py -v`
Expected: PASS.

- [ ] **Step 6: Verify against the real sheet**

This is the step that catches a wrong tab name. Start the app, sign in as admin, go to `/system`, run **Backup**, and confirm two new tabs appear with headers matching the parser keys. Then run **Pull All** and confirm no errors and no data loss. **Back up from the machine with the newer data first** — the sheet holds exactly one version.

- [ ] **Step 7: Full suite + lint, then commit**

```bash
git add app/utils/formatter.py app/services/pipelines/tabs.py tests/services/test_credits_sheets.py
git commit -m "feat(sheets): Character and Character Casting backup tabs"
```

---

## Phase 2 — Editing

### Task 7: Frontend API surface

**Files:**
- Modify: `frontend/src/api/endpoints.js`
- Create: `frontend/src/hooks/useCasting.js`
- Test: `frontend/src/api/endpoints.test.js` if one exists; otherwise assert through Task 8's tests.

**Interfaces:**
- Produces: `endpoints.character` (`list`, `detail`, `create`, `update`, `remove(id, castings)`, `merge`, `entries`) and `endpoints.casting` (`get(mediaType, entryId)`, `replace(mediaType, entryId)`); hooks `useCasting(mediaType, entryId)` and `useReplaceCasting()`.

- [ ] **Step 1: Add the endpoints**

In `frontend/src/api/endpoints.js`, beside the `person` block (currently around line 134), following its exact style:

```javascript
  character: {
    list: (qs = "") => `/api/character/${qs ? `?${qs}` : ""}`,
    detail: (id) => `/api/character/${id}`,
    create: () => "/api/character/",
    update: (id) => `/api/character/${id}`,
    remove: (id, castings) => `/api/character/${id}?castings=${castings}`,
    merge: (id) => `/api/character/${id}/merge`,
    entries: (id) => `/api/character/${id}/entries`,
  },
  casting: {
    get: (mediaType, entryId) => `/api/casting/${mediaType}/${entryId}`,
    replace: (mediaType, entryId) => `/api/casting/${mediaType}/${entryId}`,
  },
```

- [ ] **Step 2: Add the hooks**

Create `frontend/src/hooks/useCasting.js` following the TanStack Query patterns already used by the person hooks — read the nearest existing hook file first and match its query-key convention, its `enabled` guard and its invalidation on mutate. `useReplaceCasting` must invalidate the casting query for that `(mediaType, entryId)` on success.

- [ ] **Step 3: Lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/endpoints.js frontend/src/hooks/useCasting.js
git commit -m "feat(frontend): character and casting API surface"
```

---

### Task 8: The `CastEditor` component

**Files:**
- Create: `frontend/src/components/forms/CastEditor.jsx`, `frontend/src/components/forms/CastEditor.test.jsx`

**Interfaces:**
- Consumes: `endpoints.casting`, `endpoints.character`, `useCasting`/`useReplaceCasting` (Task 7); the row shape from Task 4.
- Produces: `<CastEditor mediaType={string} value={rows} onChange={(rows) => void} />` — a controlled component. Its parent owns the rows and submits them; the editor never calls the API to save.

The editor is a **table**, not a combobox. Every other credit field is a multi-value combobox declared in `fieldMeta.js` as `source: { kind: "person", role, scope }`; a cast row cannot use that shape because it carries a character *and* a seiyuu *and* role, position, photo and remark.

- [ ] **Step 1: Write the failing component tests**

Read `frontend/src/components/forms/NovelUnitsEditor.jsx` and its test first — it is the closest existing thing to this component: a controlled, row-based editor with add/remove/reorder, already written to this codebase's conventions. Follow its prop contract and its test style rather than inventing new ones.

Create `frontend/src/components/forms/CastEditor.test.jsx`.

```javascript
it("renders one row per cast member", () => { /* two rows in, two rows rendered */ });

it("hides the seiyuu column on manga", () => {
  // ck_casting_voice_scope: nobody voices anyone in a manga, so the UI must
  // not offer what the database will reject.
  render(<CastEditor mediaType="manga" value={[row]} onChange={vi.fn()} />);
  expect(screen.queryByLabelText(/seiyuu/i)).not.toBeInTheDocument();
});

it("shows the seiyuu column on anime and anime-movie", () => { /* both present */ });

it("renumbers position after a row is removed", () => {
  // onChange is called with positions 0,1 - not 0,2 - or the saved order
  // silently develops gaps.
});

it("requires an explicit choice before minting a character with an existing name", async () => {
  // Decision G: typing "Yuki" when a Yuki exists must offer the existing one
  // first, with "Create new character named Yuki" as a separate, deliberate
  // option. Silently reusing would fuse two unrelated casts; silently minting
  // would split one.
});

it("shows which entries an existing character already appears in", () => {
  // How the admin tells one Yuki from another.
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm run test:run -- CastEditor`
Expected: FAIL — module not found.

- [ ] **Step 3: Build the component**

One row per character with: a character combobox, a seiyuu combobox (omitted when `mediaType` is `manga` or `novel`), a Main/Supporting select fed from the `CHARACTER_ROLES` constant, a photo slot, a remark field, a remove button, and drag-to-reorder that writes `position` from the row index.

The two comboboxes behave **differently**, and deliberately (Decision G):

- **Seiyuu** find-or-creates through the existing `ensureSourceValues.js` path — read that file and reuse it. Typing a known seiyuu's name reuses that person rather than splitting their castings.
- **Character** does not. It searches `endpoints.character.list` by name, lists matches together with the entries each already appears in, and mints a row only through an explicit "Create new character named X" option.

Semantic colour tokens only.

- [ ] **Step 4: Run the tests, lint, build**

Run: `cd frontend && npm run test:run -- CastEditor && npm run lint && npm run build`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/forms/CastEditor.jsx frontend/src/components/forms/CastEditor.test.jsx
git commit -m "feat(frontend): CastEditor, a per-entry cast table"
```

---

### Task 9: Wire `CastEditor` into the four Add/Modify tabs

**Files:**
- Modify: `frontend/src/pages/add-tabs/AnimeAddTab.jsx`, `AnimeMovieAddTab.jsx`, `MangaAddTab.jsx`, `NovelAddTab.jsx`
- Modify: `frontend/src/pages/modify-tabs/AnimeModifyTab.jsx`, `AnimeMovieModifyTab.jsx`, `MangaModifyTab.jsx`, `NovelModifyTab.jsx`

**Interfaces:**
- Consumes: `<CastEditor>` (Task 8), `useCasting`/`useReplaceCasting` (Task 7).

- [ ] **Step 1: Read one add tab and one modify tab first**

Read `AnimeAddTab.jsx` and `AnimeModifyTab.jsx` in full. Note how they hold form state (`af`, `ua`) and how they submit — cast is saved by a **separate** `PUT /api/casting/...` call after the entry itself is saved, because casting is not part of the entry payload.

- [ ] **Step 2: Add the section to each tab**

Place a Cast section after the Credits fields. Modify tabs load the existing cast via `useCasting`; Add tabs start empty and PUT the cast once the new entry's `system_id` comes back from the create call.

The existing `Seiyuu` field in `AnimeAddTab.jsx` (~line 730) and `AnimeModifyTab.jsx` (~line 640) is the `anime.seiyuu` **Need/Done to-do flag** and is **unrelated**. Leave it exactly as it is. Label the new section "Cast" so the two do not read as the same thing.

- [ ] **Step 3: Verify in the running app**

Start the app, add a cast to an anime, save, reload, confirm it persisted. Then do the same on a manga and confirm no seiyuu column appears.

- [ ] **Step 4: Tests, lint, build, commit**

Run: `cd frontend && npm run test:run && npm run lint && npm run build`

```bash
git add frontend/src/pages/add-tabs/AnimeAddTab.jsx \
  frontend/src/pages/add-tabs/AnimeMovieAddTab.jsx \
  frontend/src/pages/add-tabs/MangaAddTab.jsx \
  frontend/src/pages/add-tabs/NovelAddTab.jsx \
  frontend/src/pages/modify-tabs/AnimeModifyTab.jsx \
  frontend/src/pages/modify-tabs/AnimeMovieModifyTab.jsx \
  frontend/src/pages/modify-tabs/MangaModifyTab.jsx \
  frontend/src/pages/modify-tabs/NovelModifyTab.jsx
git commit -m "feat(frontend): cast editing on the four ACG add and modify tabs"
```

---

### Task 10: The Cast section on the four detail pages

**Files:**
- Modify: `frontend/src/pages/detail/Anime.jsx`, `AnimeMovie.jsx`, `Manga.jsx`, `Novel.jsx`
- Test: `frontend/src/pages/detail/Anime.test.jsx` (create if absent, following `Novel.test.jsx`)

- [ ] **Step 1: Write the failing test**

```javascript
it("renders the cast with links to the character and the seiyuu", () => {
  // character -> /character/:id, seiyuu -> /person/:id
});

it("falls back to the character portrait when the casting has no photo", () => {});

it("renders no cast section when the entry has an empty cast", () => {});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npm run test:run -- Anime`

- [ ] **Step 3: Add the section**

Fetch via `useCasting(mediaType, systemId)`. Each row links the character to `/character/:id` and the seiyuu to `/person/:id`, shows the resolved `photo_file` (the server already applied the fallback), and groups Main before Supporting. Follow the existing credit-row markup on the same page so it reads as one design. Semantic tokens only.

- [ ] **Step 4: Tests, lint, build, commit**

```bash
git add frontend/src/pages/detail/Anime.jsx \
  frontend/src/pages/detail/AnimeMovie.jsx \
  frontend/src/pages/detail/Manga.jsx \
  frontend/src/pages/detail/Novel.jsx \
  frontend/src/pages/detail/Anime.test.jsx
git commit -m "feat(frontend): cast section on the four ACG detail pages"
```

---

## Phase 3 — Browsing

### Task 11: `/library/character`

**Files:**
- Create: `frontend/src/pages/library/CharacterLibrary.jsx`, `CharacterLibrary.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Read the mirror**

Read `frontend/src/pages/library/PersonLibrary.jsx` and `PersonLibrary.test.jsx` in full. This page is that page over `endpoints.character.list`, showing `casting_count` where Person shows `credit_count`.

It does **not** go through `LIBRARY_CONFIGS` — that map is media types only, and `PersonLibrary` and `StudioLibrary` already sit outside it as their own routes.

- [ ] **Step 2: Write the failing test, mirroring `PersonLibrary.test.jsx`**

- [ ] **Step 3: Build the page**

- [ ] **Step 4: Add the route**

In `frontend/src/App.jsx`, beside line 102, lazily imported like its neighbours:

```javascript
const CharacterLibrary = lazy(() => import("./pages/library/CharacterLibrary"));
...
<Route path="/library/character" element={<CharacterLibrary />} />
```

It must come **before** `<Route path="/library/:type" ... />`, exactly as `/library/person` does, or the media-type route swallows it.

- [ ] **Step 5: Tests, lint, build, commit**

```bash
git add frontend/src/pages/library/CharacterLibrary.jsx \
  frontend/src/pages/library/CharacterLibrary.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): character library page"
```

---

### Task 12: `/character/:system_id`

**Files:**
- Create: `frontend/src/pages/detail/Character.jsx`, `Character.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Read the mirror**

Read `frontend/src/pages/detail/Person.jsx` and `Studio.test.jsx`. This page is Person's over `endpoints.character.entries`, with one addition: every entry row also names the **seiyuu** who voiced her there, linking to `/person/:id`.

- [ ] **Step 2: Write the failing test**

```javascript
it("groups entries by media type and names the seiyuu in each", () => {});
it("renders an empty group rather than hiding it when every entry is hidden", () => {
  // A character carries no content label of their own; hiding the group would
  // say she has no such appearances at all.
});
```

- [ ] **Step 3: Build the page, add the route beside line 120**

```javascript
<Route path="/character/:system_id" element={<Character />} />
```

- [ ] **Step 4: Tests, lint, build, commit**

```bash
git add frontend/src/pages/detail/Character.jsx \
  frontend/src/pages/detail/Character.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): character detail page"
```

---

### Task 13: Entity → Character admin forms

**Files:**
- Create: `frontend/src/pages/add-tabs/CharacterAddTab.jsx`, `frontend/src/pages/modify-tabs/CharacterModifyTab.jsx`
- Modify: `frontend/src/config/adminTabs.js`, `frontend/src/pages/admin/Add.jsx`, `Modify.jsx`, `Delete.jsx`

- [ ] **Step 1: Read the mirror**

Read `frontend/src/config/adminTabs.js` (the `TAB_GROUPS.entity` block), `frontend/src/pages/add-tabs/PersonAddTab.jsx` and `frontend/src/pages/modify-tabs/PersonModifyTab.jsx`. The two new tabs are those two files over `endpoints.character`, minus the role × scope matrix — a character holds no roles — and minus `PersonSubTabBar`, which exists to split people by role.

- [ ] **Step 2: Add Character to the Entity group, with create / edit / delete forms**

The delete confirmation must show `casting_count` and pass it as `?castings=N`, mirroring how the Person delete passes `?credits=N`. A count that moved underneath the admin comes back as a 409 — surface that message rather than swallowing it.

- [ ] **Step 3: Verify in the running app**

Create a character, edit it, merge a duplicate into it, delete it. Confirm the 409 path by leaving the dialog open while adding a casting elsewhere.

- [ ] **Step 4: Tests, lint, build, commit**

```bash
git add frontend/src/config/adminTabs.js \
  frontend/src/pages/admin/Add.jsx \
  frontend/src/pages/admin/Modify.jsx \
  frontend/src/pages/admin/Delete.jsx \
  frontend/src/pages/add-tabs/CharacterAddTab.jsx \
  frontend/src/pages/modify-tabs/CharacterModifyTab.jsx
git commit -m "feat(admin): Entity -> Character add, modify and delete"
```

---

### Task 14: `/library/seiyuu` and navigation

**Files:**
- Modify: `frontend/src/config/navigation.js`, `frontend/src/App.jsx`
- Test: `frontend/src/pages/library/PersonLibrary.test.jsx`

**`/library/seiyuu` is not a new page type.** It is `PersonLibrary` with `?role=seiyuu`, because `GET /api/person/?role=seiyuu` already filters exactly that way.

- [ ] **Step 1: Write the failing test**

```javascript
it("filters to seiyuu when rendered at /library/seiyuu", () => {
  // Asserts the role query param reaches the endpoint.
});

it("lists a seiyuu who has never been cast", () => {
  // Intended: person_role exists so a seiyuu appears in the cast dropdown
  // BEFORE their first casting. They show with zero entries until then.
});
```

- [ ] **Step 2: Make `PersonLibrary` accept a role filter**

Add an optional `role` prop defaulting to none, passed into the list query. `/library/person` keeps its current unfiltered behaviour.

- [ ] **Step 3: Add the route and fix the nav**

`App.jsx`, before the `:type` route:

```javascript
<Route path="/library/seiyuu" element={<PersonLibrary role="seiyuu" />} />
```

`navigation.js` line ~83 — replace the dev stub:

```javascript
          {
            label: "Seiyuu",
            icon: "fas fa-microphone",
            to: "/library/seiyuu",
          },
```

and add a `Character` item to the **Entities** group beside Studio and Person, following that group's exact item shape.

- [ ] **Step 4: Tests, lint, build, commit**

```bash
git add frontend/src/config/navigation.js frontend/src/App.jsx \
  frontend/src/pages/library/PersonLibrary.jsx \
  frontend/src/pages/library/PersonLibrary.test.jsx
git commit -m "feat(frontend): /library/seiyuu and character navigation"
```

---

### Task 15: Documentation

**Files:**
- Modify: `docs/data-model.md`, `docs/options.md`, `docs/systems/credits-and-tags.md`, `docs/api.md`, `docs/frontend/pages.md`, `docs/frontend/components.md`, `docs/roadmap.md`

Per `CLAUDE.md`, docs change in the same work as the behaviour, with `Last verified` bumped on every file touched.

- [ ] **Step 1: `docs/data-model.md`**

Add both tables with full column lists. Note explicitly: no unique constraint on character names (Decision G, with the reason), and `person_id` is `ON DELETE SET NULL` unlike `media_credit`'s CASCADE (Decision H).

- [ ] **Step 2: `docs/options.md`**

Add the `seiyuu` person role to the role table. Update the existing line near 481 that says `character` / `character_voice` "were designed but not built" — they are built now, under different names. **Keep and strengthen** the sentence that `anime.seiyuu` is a `Need`/`Done` to-do status and unrelated; it matters more now that a real seiyuu concept exists.

- [ ] **Step 3: `docs/systems/credits-and-tags.md`**

Replace the "Deferred: `character` / `character_voice`" section with what was built, and record the three deliberate divergences: no franchise owner (Decision C), no `language` column (Decision D), and the `character_casting` name (Decision F). Add the new migration to the migrations table and the new tests to the Tests list.

- [ ] **Step 4: `docs/api.md`**

Document `/api/character` and `/api/casting`. State that `POST /api/character` is **not** find-or-create, unlike `POST /api/person`, and why.

- [ ] **Step 5: `docs/frontend/pages.md` and `components.md`**

Update the Library nav row (line ~66) — Seiyuu is no longer `dev: true`, and Character joins Entities. Remove Seiyuu from the `dev: true` list at line ~554. Add `CastEditor` to components.

- [ ] **Step 6: `docs/roadmap.md`**

Add a dated row in the same style as the 2026-09-04 person row. Update progress **in its own section**; do not modify the plan itself.

- [ ] **Step 7: Commit**

```bash
git add docs/data-model.md docs/options.md docs/systems/credits-and-tags.md \
  docs/api.md docs/frontend/pages.md docs/frontend/components.md docs/roadmap.md
git commit -m "docs: seiyuu role, character and character_casting"
```

---

## Final verification

- [ ] `venv/Scripts/python.exe -m pytest -q` — green
- [ ] `venv/Scripts/ruff.exe check .` — clean
- [ ] `cd frontend && npm run test:run` — green
- [ ] `cd frontend && npm run lint` — clean
- [ ] `cd frontend && npm run build` — succeeds
- [ ] `venv/Scripts/alembic.exe heads` — exactly one head
- [ ] Backup then Pull All round-trips both new tabs with no data loss
- [ ] Manual: cast an anime, view it on the detail page, follow both links, find the seiyuu at `/library/seiyuu`

## Deferred to a later spec

Tenrai cast auto-fill from `/anime/{mal_id}/characters`. **That endpoint's existence on Tenrai v1 is unverified** — confirm with one cheap call before designing on top of it. It also needs duplicate-resolution rules of its own, which is why the manual editor ships first.
