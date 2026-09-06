# Games Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `game` as the ninth media type on the backend — `games` and `game_copy` tables, a third `PlayStatus` vocabulary, a `system_option_alias` table, a new note shape, and full Sheets round-trip — with every entry hand-enterable through the API and no external integration.

**Architecture:** `games` is a uniform media type driven by `MEDIA_REGISTRY` + `app/routers/_factory.py`, exactly like `comic`. Its one structural novelty is `game_copy`, a child table written through the factory's `nested_collections` hook (the `write_novel_units` pattern). Ownership is derived from copy rows rather than stored, and surfaced through the registry's `extra_filters` hook.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy, Alembic, PostgreSQL 17, pytest.

**Spec:** `docs/superpowers/specs/2026-09-06-games-media-type-design.md`

**Depends on:** `docs/superpowers/plans/2026-09-06-publisher-entity.md` — Task 10 uses the `publisher` credit role. Every other task is independent of it.

## Global Constraints

- **Own test database, always.** Concurrent agents share `anime_site_test` and re-migrate each other's schema mid-run, producing large, varying, meaningless failure counts. Before your first test run: `CREATE DATABASE anime_site_test_<suffix>` against the `postgres` database. Then run every command as `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest ...`. `DROP DATABASE` when the plan is done. `POSTGRES_DB` is a `setdefault` in `tests/conftest.py`, so no file edit is needed.
- **Never `git add -A`, never stage a directory pathspec.** Other agents and sessions edit this working tree. Stage the exact files each Commit step names, and stage-and-commit in one command with no gap.
- **TDD.** Every task writes a failing test, runs it to see it fail, implements, re-runs. Do not write implementation first.
- **Media-type key is `"game"`** — the same string in `MEDIA_TABLES` (hyphenated data layer) and `MEDIA_REGISTRY` (underscore router layer), because it has no separator. Route is `/api/game` (singular).
- **Status value strings are exact:** `"Might Play"`, `"Plan to Play"`, `"Play When Released"`, `"Active Playing"`, `"Passive Playing"`, `"Paused"`, `"Completed"`, `"Temp Dropped"`, `"Dropped"`, `"Won't Play"`.
- **`tests/api/conftest.py` builds the schema with `Base.metadata.create_all`, never Alembic.** A broken migration therefore passes the whole suite. Task 16 verifies the migration explicitly against a scratch database.
- Lint with `venv/Scripts/ruff.exe check .` before each commit.

---

### Task 1: Vocabulary constants

**Files:**
- Modify: `app/utils/constants.py`
- Test: `tests/unit/test_game_constants.py` (create)

**Interfaces:**
- Produces: `PlayStatus` (str Enum), `COMPLETED_PLAY_STATUSES: frozenset`, `GAME_TYPES`, `COMPLETION_LEVELS`, `GAME_RELEASE_STATUSES`, `GAME_STOREFRONTS`, `GAME_OWNERSHIP_KINDS`, `GAME_COPY_FORMATS`, `GAME_ACQUISITION_KINDS` (all `tuple[str, ...]`), `FranchiseType.GAME`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_game_constants.py
"""The game vocabularies, and the one cross-vocabulary fact they rely on."""

from app.utils import constants as c


def test_play_status_values():
    assert [s.value for s in c.PlayStatus] == [
        "Might Play",
        "Plan to Play",
        "Play When Released",
        "Active Playing",
        "Passive Playing",
        "Paused",
        "Completed",
        "Temp Dropped",
        "Dropped",
        "Won't Play",
    ]


def test_completed_play_statuses_holds_completed():
    assert c.PlayStatus.COMPLETED in c.COMPLETED_PLAY_STATUSES


def test_a_completed_game_gets_a_completion_timestamp():
    """
    apply_completion_timestamp tests membership in COMPLETED_WATCH_STATUSES,
    which is a frozenset of WatchStatus members. PlayStatus.COMPLETED shares
    the *value* "Completed", and the str mixin's hash is what the frozenset
    uses - so a game reaches the same branch with no change to completion.py.
    Pinned here because it is load-bearing and non-obvious.
    """
    assert c.PlayStatus.COMPLETED.value in c.COMPLETED_WATCH_STATUSES


def test_game_vocabularies():
    assert c.GAME_TYPES == ("Base Game", "DLC", "Expansion", "Bundle")
    assert c.COMPLETION_LEVELS == (
        "Main Story",
        "Main + Extras",
        "Post-game",
        "Completionist",
    )
    assert c.GAME_RELEASE_STATUSES == (
        "Released",
        "Early Access",
        "Announced",
        "Delayed",
        "Cancelled",
    )
    assert c.GAME_OWNERSHIP_KINDS == (
        "Owned",
        "Wishlist",
        "Subscription",
        "Free",
        "Not Owned",
    )
    assert c.GAME_COPY_FORMATS == ("Digital", "Physical")
    assert c.GAME_ACQUISITION_KINDS == (
        "Bought",
        "Gifted",
        "Free",
        "Bundled",
        "Subscription",
    )
    assert "Steam" in c.GAME_STOREFRONTS


def test_franchise_type_has_game():
    assert c.FranchiseType.GAME.value == "Game"
    assert "Game" in c.FRANCHISE_TYPES
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_constants.py -v`
Expected: FAIL — `AttributeError: module 'app.utils.constants' has no attribute 'PlayStatus'`

- [ ] **Step 3: Implement**

Add after the `ReadStatus` enum and its completed set in `app/utils/constants.py`:

```python
class PlayStatus(str, Enum):
    MIGHT_PLAY = "Might Play"
    PLAN_TO_PLAY = "Plan to Play"
    # The analogue of WatchStatus.WATCH_WHEN_AIRS, and more load-bearing here:
    # a pre-ordered or wishlisted unreleased title is a normal state in a
    # collection organised by purchasable.
    PLAY_WHEN_RELEASED = "Play When Released"
    ACTIVE_PLAYING = "Active Playing"
    PASSIVE_PLAYING = "Passive Playing"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    TEMP_DROPPED = "Temp Dropped"
    DROPPED = "Dropped"
    WONT_PLAY = "Won't Play"


# There is no games analogue of "Completed (解說)", so this holds one value.
# Declared anyway, so it reads beside COMPLETED_WATCH_STATUSES and so a second
# completed-ish status later is a one-line change rather than a new concept.
COMPLETED_PLAY_STATUSES = frozenset({PlayStatus.COMPLETED})
```

Add `GAME = "Game"` to `FranchiseType`, append `"Game"` to the `FRANCHISE_TYPES` tuple, and add the vocabulary tuples beside the other Tier-1 lists:

```python
GAME_TYPES = ("Base Game", "DLC", "Expansion", "Bundle")

# How deep a finish went. Deliberately a ladder of content depth only: whether
# every ending was seen (games.all_endings) and how many achievements were
# earned (games.achievements_*) are separate axes, because they move
# independently of this one. Speedrun and glitch categories are out of scope.
COMPLETION_LEVELS = ("Main Story", "Main + Extras", "Post-game", "Completionist")

GAME_RELEASE_STATUSES = (
    "Released",
    "Early Access",
    "Announced",
    "Delayed",
    "Cancelled",
)

GAME_STOREFRONTS = (
    "Steam",
    "Nintendo eShop",
    "PlayStation Store",
    "Xbox Store",
    "GOG",
    "Epic Games Store",
    "Physical",
    "Other",
)
GAME_OWNERSHIP_KINDS = ("Owned", "Wishlist", "Subscription", "Free", "Not Owned")
GAME_COPY_FORMATS = ("Digital", "Physical")
GAME_ACQUISITION_KINDS = ("Bought", "Gifted", "Free", "Bundled", "Subscription")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_constants.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add app/utils/constants.py tests/unit/test_game_constants.py && git commit -m "feat(game): PlayStatus and the game vocabularies"
```

---

### Task 2: The `games` and `game_copy` models

**Files:**
- Create: `app/models/game.py`, `app/models/game_copy.py`
- Modify: `app/models/__init__.py`, `app/utils/release_date.py`
- Test: `tests/unit/test_game_model.py` (create)

**Interfaces:**
- Consumes: `PlayStatus` from Task 1.
- Produces: `models.Game`, `models.GameCopy`. `Game` exposes `system_id`, `franchise_id`, `series_id`, `base_game_id`, the five name columns, `display_name`, `names_dict`, `remark` (column_property), `cover_image_file`, `completed_at`. `GameCopy` exposes `game_id`, `storefront`, `ownership`, `copy_format`, `acquisition`, `price_paid`, `price_currency`, `acquired_date`, `remark`, `position`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_game_model.py
"""The games and game_copy tables: constraints, name fallback, date CHECKs."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_display_name_falls_back_cn_first():
    game = models.Game(game_name_en="Elden Ring", game_name_cn="艾爾登法環")
    assert game.display_name == "艾爾登法環"
    assert models.Game(game_name_en="Hades").display_name == "Hades"


def test_names_dict_covers_all_five():
    game = models.Game(game_name_en="Nier", game_name_jp="ニーア")
    assert set(game.names_dict) == {"en", "cn", "roman", "jp", "alt"}
    assert game.names_dict["jp"] == "ニーア"


def test_playing_status_defaults_to_might_play(db_session):
    game = models.Game(game_name_en="Default Test")
    db_session.add(game)
    db_session.flush()
    assert game.playing_status == "Might Play"


def test_a_base_game_may_not_have_a_parent(db_session):
    parent = models.Game(game_name_en="Parent")
    db_session.add(parent)
    db_session.flush()
    db_session.add(
        models.Game(
            game_name_en="Bad", game_type="Base Game", base_game_id=parent.system_id
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_a_dlc_may_have_a_parent(db_session):
    parent = models.Game(game_name_en="Base")
    db_session.add(parent)
    db_session.flush()
    dlc = models.Game(
        game_name_en="DLC", game_type="DLC", base_game_id=parent.system_id
    )
    db_session.add(dlc)
    db_session.commit()
    assert dlc.base_game_id == parent.system_id


def test_a_dlc_without_a_parent_is_allowed(db_session):
    """Deliberate: a DLC is often entered before its base game."""
    db_session.add(models.Game(game_name_en="Orphan DLC", game_type="DLC"))
    db_session.commit()


def test_a_game_may_not_be_its_own_parent(db_session):
    game_id = uuid.uuid4()
    db_session.add(
        models.Game(system_id=game_id, game_name_en="Self", base_game_id=game_id)
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_release_date_must_be_iso(db_session):
    db_session.add(models.Game(game_name_en="Bad Date", release_date="Feb 2022"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_one_game_may_hold_two_copies_on_different_formats(db_session):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()
    db_session.add_all(
        [
            models.GameCopy(
                game_id=game.system_id, storefront="Steam", copy_format="Digital"
            ),
            models.GameCopy(
                game_id=game.system_id,
                storefront="Steam",
                copy_format="Physical",
            ),
        ]
    )
    db_session.commit()


def test_a_duplicate_copy_row_is_rejected(db_session):
    game = models.Game(game_name_en="Dup")
    db_session.add(game)
    db_session.flush()
    db_session.add_all(
        [
            models.GameCopy(
                game_id=game.system_id, storefront="Steam", copy_format="Digital"
            ),
            models.GameCopy(
                game_id=game.system_id, storefront="Steam", copy_format="Digital"
            ),
        ]
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_deleting_a_game_deletes_its_copies(db_session):
    game = models.Game(game_name_en="Cascade")
    db_session.add(game)
    db_session.flush()
    db_session.add(models.GameCopy(game_id=game.system_id, storefront="GOG"))
    db_session.commit()
    db_session.delete(game)
    db_session.commit()
    assert db_session.query(models.GameCopy).count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_model.py -v`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'Game'`

- [ ] **Step 3: Implement**

Create `app/models/game.py`:

```python
"""Game ORM model."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Game(Base, NameFallbackMixin):
    """
    One purchasable: a base game, a DLC, an expansion or a bundle.

    The unit is the purchasable rather than the work, because that is how a
    game collection is actually acquired - a DLC is bought, played and
    finished separately from its base game. A DLC is a row here with a
    base_game_id, not a row in a second table: it shares nearly every column
    with a base game and differs mainly in having a parent.

    base_game_id is deliberately nullable even for a DLC. A DLC is often
    entered before its base game exists, and a link filled in later is
    friendlier than a write that fails on entry order.
    """

    __tablename__ = "games"
    __table_args__ = (
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_games_release_date_iso",
        ),
        CheckConstraint(
            "game_type <> 'Base Game' OR base_game_id IS NULL",
            name="ck_games_base_no_parent",
        ),
        CheckConstraint(
            "base_game_id IS NULL OR base_game_id <> system_id",
            name="ck_games_not_self_parent",
        ),
    )

    _name_fields = [
        "game_name_en",
        "game_name_cn",
        "game_name_roman",
        "game_name_jp",
        "game_name_alt",
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

    game_name_en = Column(String, nullable=True)
    game_name_cn = Column(String, nullable=True)
    game_name_roman = Column(String, nullable=True)
    game_name_jp = Column(String, nullable=True)
    game_name_alt = Column(String, nullable=True)

    game_type = Column(String, nullable=True)
    # Self-reference. SET NULL rather than CASCADE: deleting a base game must
    # not silently delete the DLC rows that were bought separately.
    base_game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("games.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    playing_status = Column(String, nullable=False, default="Might Play")
    # How deep the finish went. Independent of playing_status: "Active Playing"
    # plus "Main Story" is the ordinary state of having rolled credits and
    # still playing for achievements.
    completion_level = Column(String, nullable=True)
    # Tristate, and orthogonal to completion_level: every ending can be seen on
    # a main-story-only run, and missed on a Completionist one.
    all_endings = Column(Boolean, nullable=True)
    achievements_earned = Column(Integer, nullable=True)
    achievements_total = Column(Integer, nullable=True)

    release_status = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    # What is installed, not what changed in it: "1.6.1", "Update 7".
    current_patch = Column(String, nullable=True)

    hours_played = Column(Float, nullable=True)
    # The three public time-to-beat tiers. Sourced from IGDB, not from
    # HowLongToBeat, which publishes no official API.
    hltb_main = Column(Float, nullable=True)
    hltb_main_extra = Column(Float, nullable=True)
    hltb_completionist = Column(Float, nullable=True)

    # The game's market prices. What *I* paid is per-copy, on game_copy.
    price_original_us = Column(Numeric(10, 2), nullable=True)
    price_original_jp = Column(Numeric(10, 2), nullable=True)
    price_original_tw = Column(Numeric(10, 2), nullable=True)
    price_current_us = Column(Numeric(10, 2), nullable=True)
    price_current_jp = Column(Numeric(10, 2), nullable=True)
    price_current_tw = Column(Numeric(10, 2), nullable=True)

    my_rating = Column(String, nullable=True)
    cover_image_file = Column(String, nullable=True)

    igdb_id = Column(Integer, nullable=True)
    igdb_link = Column(String, nullable=True)
    # Reserved for the deferred Steam sync so it needs no migration of its own.
    # Nothing reads or writes these yet.
    steam_appid = Column(Integer, nullable=True)
    steam_link = Column(String, nullable=True)

    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def names_dict(self) -> dict:
        return {
            "en": self.game_name_en,
            "cn": self.game_name_cn,
            "roman": self.game_name_roman,
            "jp": self.game_name_jp,
            "alt": self.game_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.game_name_cn),
            ("EN", self.game_name_en),
            ("Alt", self.game_name_alt),
            ("Roman", self.game_name_roman),
            ("JP", self.game_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
```

Create `app/models/game_copy.py`:

```python
"""One copy of a game that I own, want, or have access to."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class GameCopy(Base):
    """
    One purchase (or wish, or subscription entitlement) of one game.

    Deliberately NOT a media_source row. "Where can I watch this" and "which
    storefront do I own this on" look alike at one field, but this carries six
    - ownership, format, acquisition, price paid, currency, date - and at that
    size it is a purchase record, not a source. Putting it on media_source
    would mean six columns meaning nothing for the other eight media types.

    game_id is a real foreign key rather than the (media_type, entry_id) pair
    the polymorphic tables use: because a DLC is a `games` row, one FK covers
    game and DLC purchases identically.
    """

    __tablename__ = "game_copy"
    __table_args__ = (
        # One game can be Digital-on-Steam and Physical-on-Switch without
        # colliding; buying the same edition on the same store twice cannot.
        UniqueConstraint(
            "game_id", "storefront", "copy_format", name="uq_game_copy_row"
        ),
        CheckConstraint(
            r"acquired_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_game_copy_acquired_date_iso",
        ),
        Index("ix_game_copy_game", "game_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("games.system_id", ondelete="CASCADE"),
        nullable=False,
    )

    storefront = Column(String, nullable=True)
    ownership = Column(String, nullable=True)
    copy_format = Column(String, nullable=True)
    acquisition = Column(String, nullable=True)
    price_paid = Column(Numeric(10, 2), nullable=True)
    price_currency = Column(String, nullable=True)
    acquired_date = Column(String, nullable=True)
    remark = Column(String, nullable=True)

    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
```

In `app/models/__init__.py`: import `Game` and `GameCopy`, add both to `__all__`, and add `(Game, "game")` to the `_REMARK_OWNERS` tuple so `Game.remark` exists.

In `app/utils/release_date.py`, add to `DATE_COLUMNS`:

```python
    "games": ("release_date",),
    "game_copy": ("acquired_date",),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_model.py tests/unit/test_release_date_models.py -v`
Expected: PASS. `test_release_date_models.py` is parametrized over `DATE_COLUMNS` and now covers `games`; if it fails, the CHECK constraint name does not match `ck_games_release_date_iso`.

- [ ] **Step 5: Commit**

```bash
git add app/models/game.py app/models/game_copy.py app/models/__init__.py app/utils/release_date.py tests/unit/test_game_model.py && git commit -m "feat(game): games and game_copy models"
```

---

### Task 3: `system_option_alias`

**Files:**
- Modify: `app/models/system.py`, `app/models/__init__.py`, `app/schemas/system.py`, `app/routers/options.py`
- Test: `tests/api/test_system_option_alias.py` (create)

**Interfaces:**
- Produces: `models.SystemOptionAlias(option_id, source, value)`; `SystemOption.aliases` relationship; `SystemOptionCreate.aliases: list[dict]`; `resolve_option_alias(db, category, source, value) -> Optional[models.SystemOption]` in `app/routers/options.py`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_system_option_alias.py
"""
What an external source calls a vocabulary value.

The third sibling of system_option_scope ("in which media types") and
system_option_usage ("for what"). Unlike those two, absence of alias rows does
NOT mean "matches everything" - an alias is a lookup, not a filter.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.routers.options import resolve_option_alias


@pytest.fixture
def genre_option(db_session):
    option = models.SystemOption(category="Game Genre", value="角色扮演")
    db_session.add(option)
    db_session.flush()
    db_session.add(
        models.SystemOptionAlias(
            option_id=option.system_id, source="igdb", value="Role-playing (RPG)"
        )
    )
    db_session.commit()
    return option


def test_alias_resolves_to_the_chinese_value(db_session, genre_option):
    found = resolve_option_alias(db_session, "Game Genre", "igdb", "Role-playing (RPG)")
    assert found is not None
    assert found.value == "角色扮演"


def test_an_unknown_alias_resolves_to_none(db_session, genre_option):
    assert resolve_option_alias(db_session, "Game Genre", "igdb", "Roguelite") is None


def test_alias_lookup_is_scoped_to_its_category(db_session, genre_option):
    """The same English string may mean different things in two vocabularies."""
    assert resolve_option_alias(db_session, "Game Theme", "igdb", "Role-playing (RPG)") is None


def test_one_option_may_carry_several_aliases(db_session, genre_option):
    db_session.add(
        models.SystemOptionAlias(
            option_id=genre_option.system_id, source="igdb", value="RPG"
        )
    )
    db_session.commit()
    assert len(genre_option.aliases) == 2


def test_a_duplicate_alias_is_rejected(db_session, genre_option):
    db_session.add(
        models.SystemOptionAlias(
            option_id=genre_option.system_id, source="igdb", value="Role-playing (RPG)"
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_deleting_the_option_deletes_its_aliases(db_session, genre_option):
    db_session.delete(genre_option)
    db_session.commit()
    assert db_session.query(models.SystemOptionAlias).count() == 0


def test_aliases_round_trip_through_the_options_api(admin_client, db_session):
    created = admin_client.post(
        "/api/options/",
        json={
            "category": "Game Mode",
            "value": "單人",
            "scopes": ["game"],
            "aliases": [{"source": "igdb", "value": "Single player"}],
        },
    ).json()
    assert created["aliases"] == [{"source": "igdb", "value": "Single player"}]

    updated = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={
            "category": "Game Mode",
            "value": "單人",
            "scopes": ["game"],
            "aliases": [{"source": "igdb", "value": "Singleplayer"}],
        },
    ).json()
    assert updated["aliases"] == [{"source": "igdb", "value": "Singleplayer"}]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_system_option_alias.py -v`
Expected: FAIL — `ImportError: cannot import name 'resolve_option_alias'`

- [ ] **Step 3: Implement**

In `app/models/system.py`, after `SystemOptionUsage`:

```python
class SystemOptionAlias(Base):
    """
    What an external source calls this vocabulary value.

    The third sibling of SystemOptionScope ("in which media types") and
    SystemOptionUsage ("for what"): this answers "what does IGDB call it".
    Values are stored in Chinese; an external API's English is a wire format,
    resolved through here on the way in.

    Unlike its two siblings, absence is NOT permissive. A value with no scope
    rows is offered everywhere; a value with no alias rows simply cannot be
    resolved from an external string, which is why this is read by an explicit
    lookup rather than by _filter_by_child.
    """

    __tablename__ = "system_option_alias"
    __table_args__ = (
        UniqueConstraint(
            "option_id", "source", "value", name="uq_system_option_alias"
        ),
        Index("ix_system_option_alias_lookup", "source", "value"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "igdb" now; "steam" when the Steam sync lands.
    source = Column(String, nullable=False)
    value = Column(String, nullable=False)

    option = relationship("SystemOption", back_populates="aliases")
```

Add `Index` to that module's SQLAlchemy imports, and on `SystemOption`:

```python
    aliases = relationship(
        "SystemOptionAlias",
        back_populates="option",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
```

Export `SystemOptionAlias` from `app/models/__init__.py` (import block and `__all__`).

In `app/schemas/system.py`, add an alias model and wire it into create/response:

```python
class SystemOptionAliasIO(BaseModel):
    source: str
    value: str
```

On `SystemOptionCreate`: `aliases: list[SystemOptionAliasIO] = []`.
On `SystemOptionResponse`: `aliases: list[SystemOptionAliasIO] = []` plus a `mode="before"` flattener mirroring `_flatten_scopes`, mapping ORM rows to `{"source": ..., "value": ...}`.

In `app/routers/options.py` add the lookup and the write paths:

```python
def resolve_option_alias(db: Session, category: str, source: str, value: str):
    """
    The option one external source's string names, or None.

    Scoped by category on purpose: the same English word can name a genre in
    one vocabulary and a theme in another, and an unscoped match would import
    it into the wrong one.
    """
    return (
        db.query(models.SystemOption)
        .join(models.SystemOptionAlias)
        .filter(
            models.SystemOption.category == category,
            models.SystemOptionAlias.source == source,
            models.SystemOptionAlias.value == value,
        )
        .first()
    )
```

In `add_system_option`, alongside the scopes/usages construction:

```python
    new_option.aliases = [
        models.SystemOptionAlias(source=a.source, value=a.value)
        for a in payload.aliases
    ]
```

In `update_system_option`, follow the existing delete-then-insert idiom exactly — assigning the collection emits INSERTs before DELETEs in one flush and trips the unique constraint:

```python
        db.query(models.SystemOptionAlias).filter_by(option_id=option_id).delete(
            synchronize_session=False
        )
        for alias in payload.aliases:
            db.add(
                models.SystemOptionAlias(
                    option_id=option_id, source=alias.source, value=alias.value
                )
            )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_system_option_alias.py tests/api/test_options_router.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models/system.py app/models/__init__.py app/schemas/system.py app/routers/options.py tests/api/test_system_option_alias.py && git commit -m "feat(options): system_option_alias for external vocabulary mapping"
```

---

### Task 4: The `name_entries` note shape and the game sections

**Files:**
- Modify: `app/models/note.py`, `app/utils/note_sections.py`, `app/schemas/note.py`
- Test: `tests/unit/test_note_sections.py`, `tests/unit/test_note_schemas.py`, `tests/unit/test_game_note_sections.py` (create)

**Interfaces:**
- Produces: `SHAPE_NAME_ENTRIES = "name_entries"`; `note.entries` JSONB column; sections `guides`, `resources`, `highlight_moments`; `episode_comments` widened to `game`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_game_note_sections.py
"""The game note sections and the name_entries shape."""

import pytest
from pydantic import ValidationError

from app.schemas.note import NoteCreate
from app.utils import note_sections as ns


def test_name_entries_is_a_stored_shape():
    assert ns.SHAPE_NAME_ENTRIES == "name_entries"
    assert ns.SHAPE_NAME_ENTRIES in ns.STORED_SHAPES


def test_game_sections_exist_with_the_right_shapes():
    by_key = {s.key: s for s in ns.NOTE_SECTIONS}
    assert by_key["guides"].shape == ns.SHAPE_NAME_ENTRIES
    assert by_key["resources"].shape == ns.SHAPE_NAME_ENTRIES
    assert by_key["resources"].kinds == ("Build", "Mod", "Tool")
    assert by_key["highlight_moments"].shape == ns.SHAPE_EPISODE_TEXT
    for key in ("guides", "resources", "highlight_moments"):
        assert "game" in by_key[key].owners


def test_part_reviews_reuse_episode_comments_with_a_game_label():
    section = next(s for s in ns.NOTE_SECTIONS if s.key == "episode_comments")
    assert "game" in section.owners
    assert section.labels["game"] == "各章評論 Part Reviews"
    assert section.locator_placeholders["game"] == "Chapter / Part, e.g. Ch 3"


def test_a_name_entries_note_needs_a_title_or_an_entry():
    with pytest.raises(ValidationError):
        NoteCreate(owner_type="game", owner_id=None, section="guides")


def test_a_name_entries_note_accepts_mixed_text_and_link_entries():
    note = NoteCreate(
        owner_type="game",
        owner_id=None,
        section="guides",
        title="Malenia",
        entries=[
            {"type": "text", "value": "Learn the waterfowl dodge"},
            {"type": "link", "value": "https://example.com", "label": "Phase 2"},
        ],
    )
    assert len(note.entries) == 2
    assert note.entries[0]["type"] == "text"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_note_sections.py -v`
Expected: FAIL — `AttributeError: module 'app.utils.note_sections' has no attribute 'SHAPE_NAME_ENTRIES'`

- [ ] **Step 3: Implement**

In `app/models/note.py`, after `links`:

```python
    # A list of mixed items for the name_entries shape: each is
    # {"type": "text"|"link", "value": str, "label": str|None}, in array order.
    # Distinct from `links`, which is a plain list of URL strings for seven
    # other sections - one column meaning two things is how subtle bugs start.
    entries = Column(JSONB, nullable=True)
```

In `app/utils/note_sections.py` add the shape constant beside the others, add it to `STORED_SHAPES`, widen `episode_comments`, and add the three sections:

```python
SHAPE_NAME_ENTRIES = "name_entries"  # title, entries
```

On the existing `episode_comments` entry, add `"game"` to `owners` and:

```python
        labels={"game": "各章評論 Part Reviews"},
        locator_placeholders={"game": "Chapter / Part, e.g. Ch 3"},
```

New sections (place `guides`/`resources` after the reviews group, `highlight_moments` beside the other highlight sections):

```python
    NoteSection(
        key="guides",
        shape=SHAPE_NAME_ENTRIES,
        label="攻略 Guides",
        owners=("game",),
    ),
    NoteSection(
        key="resources",
        shape=SHAPE_NAME_ENTRIES,
        label="資源 Resources",
        owners=("game",),
        # Builds, mods and tools took the same shape once guides became
        # name_entries, so they are one section with a kind rather than three
        # near-identical ones. Guides stays separate: it is filled for nearly
        # every game, these are not.
        kinds=("Build", "Mod", "Tool"),
    ),
    NoteSection(
        key="highlight_moments",
        locator_required=True,
        shape=SHAPE_EPISODE_TEXT,
        label="神場景 Highlights",
        owners=("game",),
        locator_placeholder="Chapter / Boss, e.g. Ch 3",
    ),
```

In `app/schemas/note.py`: import `SHAPE_NAME_ENTRIES`, add `entries: Optional[list[dict]] = None` to the note payload model, carry it through `section_out`/read models, and add the emptiness branch to `validate_note_payload` before the final `elif`:

```python
    elif section.shape == SHAPE_NAME_ENTRIES:
        # A named bookmark with neither a name nor a single entry is nothing.
        if not (payload.title or "").strip() and not payload.entries:
            raise ValueError(f"Section '{section.key}' needs a name or an entry.")
```

Extend the shape enumeration in `tests/unit/test_note_sections.py` to include `SHAPE_NAME_ENTRIES`.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_note_sections.py tests/unit/test_note_sections.py tests/unit/test_note_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models/note.py app/utils/note_sections.py app/schemas/note.py tests/unit/test_game_note_sections.py tests/unit/test_note_sections.py && git commit -m "feat(notes): name_entries shape and the game note sections"
```

---

### Task 5: Game schemas

**Files:**
- Create: `app/schemas/game.py`
- Modify: `app/schemas/__init__.py`, `app/schemas/link_fields.py`
- Test: `tests/unit/test_game_schemas.py` (create)

**Interfaces:**
- Consumes: `models.Game` (Task 2).
- Produces: `GameBase`, `GameCreate`, `GameUpdate`, `GameResponse`, `GameSheetSync`, `GameCopyIO`; `GameLinkFields` registered in `LINK_FIELD_MIXINS`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_game_schemas.py
"""Game request/response schemas."""

import uuid

import pytest
from pydantic import ValidationError

from app import schemas


def test_defaults():
    game = schemas.GameCreate(game_name_en="Hades")
    assert game.playing_status == "Might Play"
    assert game.copies is None  # not supplied != cleared


def test_release_date_is_normalised():
    assert schemas.GameCreate(
        game_name_en="X", release_date="MAR 2022"
    ).release_date == "2022-03"


def test_a_bad_release_date_is_rejected():
    with pytest.raises(ValidationError):
        schemas.GameCreate(game_name_en="X", release_date="sometime")


def test_copies_accept_the_full_copy_shape():
    game = schemas.GameCreate(
        game_name_en="Hades",
        copies=[
            {
                "storefront": "Steam",
                "ownership": "Owned",
                "copy_format": "Digital",
                "acquisition": "Bought",
                "price_paid": "24.99",
                "price_currency": "USD",
                "acquired_date": "2024-11-03",
            }
        ],
    )
    assert game.copies[0].storefront == "Steam"


def test_response_display_name_leads_with_cn():
    resp = schemas.GameResponse(
        system_id=uuid.uuid4(), game_name_en="Elden Ring", game_name_cn="艾爾登法環"
    )
    assert resp.display_name == "艾爾登法環"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_schemas.py -v`
Expected: FAIL — `AttributeError: module 'app.schemas' has no attribute 'GameCreate'`

- [ ] **Step 3: Implement**

Create `app/schemas/game.py` modelled on `app/schemas/comic.py`. `GameBase` declares every column as `Optional[...] = None` except `playing_status: str = "Might Play"`, uses `release_date_validator("release_date")`, and declares `remark: Optional[str] = None`. `GameCopyIO` carries `system_id: Optional[UUID]` plus the nine copy columns, with `price_paid: Optional[Decimal]`. `GameCreate`/`GameUpdate` inherit `GameBase, SourceWriteFields` and add `copies: Optional[list[GameCopyIO]] = None` — `None` means "not supplied", `[]` means "clear them", the same contract `write_novel_units` uses. `GameResponse(GameBase, GameLinkFields)` adds `system_id`, `copies: list[GameCopyIO] = []`, `ownership: Optional[str] = None` (the derived field), timestamps, `model_config = ConfigDict(from_attributes=True)` and a `@computed_field display_name` with the CN-first fallback. `GameSheetSync(GameCreate)` adds the two timestamps.

In `app/schemas/link_fields.py` add:

```python
class GameLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    studio_refs: list[StudioRef] = []
    publisher_refs: list[PublisherRef] = []
    studio: Optional[str] = None
    publisher: Optional[str] = None
    director: Optional[str] = None
    composer: Optional[str] = None
    game_genre: Optional[str] = None
    game_theme: Optional[str] = None
    game_mode: Optional[str] = None
    combat_mode: Optional[str] = None
    label: Optional[str] = None
```

and register it in `LINK_FIELD_MIXINS` under `"game"`. `PublisherRef` comes from the publisher plan; until that lands, omit `publisher_refs`/`publisher` and add them in Task 10.

Export all new names from `app/schemas/__init__.py` (import block and `__all__`).

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_schemas.py tests/unit/test_link_fields_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/schemas/game.py app/schemas/__init__.py app/schemas/link_fields.py tests/unit/test_game_schemas.py && git commit -m "feat(game): request and response schemas"
```

---

### Task 6: Domain functions — hierarchy, completion, copies, ownership filter

**Files:**
- Create: `app/services/domain/game_copies.py`
- Modify: `app/services/domain/hierarchy.py`, `app/services/domain/completion.py`, `app/services/domain/__init__.py`
- Test: `tests/api/test_game_domain.py` (create)

**Interfaces:**
- Produces: `resolve_game_parent_hierarchy(db, franchise_id, series_id, names) -> tuple`, `mark_game_completed(entry) -> None`, `write_game_copies(db, entry, copies, viewer=None) -> None`, `derive_game_ownership(entry) -> Optional[str]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_game_domain.py
"""Hierarchy stamping, completion, and the game_copy nested writer."""

import uuid

from app import models
from app.services.domain import (
    derive_game_ownership,
    mark_game_completed,
    write_game_copies,
)


def test_an_auto_created_franchise_is_stamped_game(admin_client, db_session):
    admin_client.post(
        "/api/game/", json={"game_name_en": "Hollow Knight", "franchise_text": "Hollow Knight"}
    )
    franchise = (
        db_session.query(models.Franchise)
        .filter(models.Franchise.franchise_name_en == "Hollow Knight")
        .first()
    )
    assert franchise is not None
    assert franchise.franchise_type == "Game"


def test_mark_completed_sets_status_and_leaves_depth_alone():
    game = models.Game(
        game_name_en="X", playing_status="Active Playing", completion_level="Main Story"
    )
    mark_game_completed(game)
    assert game.playing_status == "Completed"
    # Only the user knows how deep the finish went.
    assert game.completion_level == "Main Story"


def test_write_game_copies_inserts_updates_and_deletes(db_session):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()

    write_game_copies(db_session, game, [{"storefront": "Steam", "ownership": "Owned"}])
    db_session.flush()
    row = db_session.query(models.GameCopy).one()
    assert row.ownership == "Owned"

    write_game_copies(
        db_session,
        game,
        [{"system_id": row.system_id, "storefront": "Steam", "ownership": "Wishlist"}],
    )
    db_session.flush()
    assert db_session.query(models.GameCopy).one().ownership == "Wishlist"

    write_game_copies(db_session, game, [])
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 0


def test_none_means_not_supplied_and_leaves_copies_alone(db_session):
    game = models.Game(game_name_en="Hades")
    db_session.add(game)
    db_session.flush()
    write_game_copies(db_session, game, [{"storefront": "GOG"}])
    db_session.flush()
    write_game_copies(db_session, game, None)
    db_session.flush()
    assert db_session.query(models.GameCopy).count() == 1


def test_ownership_is_owned_when_any_copy_is(db_session):
    game = models.Game(game_name_en="Multi")
    db_session.add(game)
    db_session.flush()
    write_game_copies(
        db_session,
        game,
        [
            {"storefront": "Nintendo eShop", "ownership": "Wishlist"},
            {"storefront": "Steam", "ownership": "Owned"},
        ],
    )
    db_session.flush()
    db_session.refresh(game)
    assert derive_game_ownership(game) == "Owned"


def test_ownership_is_none_without_copies(db_session):
    game = models.Game(game_name_en="Bare")
    db_session.add(game)
    db_session.flush()
    assert derive_game_ownership(game) is None


def test_the_list_endpoint_filters_on_derived_ownership(admin_client):
    owned = admin_client.post(
        "/api/game/",
        json={
            "game_name_en": "Owned Game",
            "copies": [{"storefront": "Steam", "ownership": "Owned"}],
        },
    ).json()
    admin_client.post(
        "/api/game/",
        json={
            "game_name_en": "Wanted Game",
            "copies": [{"storefront": "Steam", "ownership": "Wishlist"}],
        },
    )
    ids = [e["system_id"] for e in admin_client.get("/api/game/?ownership=Owned").json()]
    assert owned["system_id"] in ids
    assert len(ids) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_domain.py -v`
Expected: FAIL — `ImportError: cannot import name 'mark_game_completed'`

- [ ] **Step 3: Implement**

In `app/services/domain/hierarchy.py`, add `"game": FranchiseType.GAME` to `FRANCHISE_TYPE_FOR` (it is indexed unguarded, so a missing key is a `KeyError` at create time), and add the generated resolver beside its siblings:

```python
resolve_game_parent_hierarchy = _entry_resolver("game")
```

In `app/services/domain/completion.py`:

```python
def mark_game_completed(entry) -> None:
    """
    Sets a game to Completed without touching how deep the finish went.

    completion_level, all_endings and the achievement pair are three
    independent axes and only the user knows their values, so unlike the
    watch/read helpers this sets no progress numbers.
    """
    entry.playing_status = "Completed"
```

Create `app/services/domain/game_copies.py` modelled on `app/services/domain/novel_unit_writer.py`: reconcile by `system_id` (coercing a `str` id to `UUID`, as PATCH payloads are raw dicts), insert rows without one, delete rows the payload omits, `return` early on `None`, and finish with `db.flush(); db.refresh(entry)`. Fields written: `storefront`, `ownership`, `copy_format`, `acquisition`, `price_paid`, `price_currency`, `acquired_date`, `remark`, `position`.

In the same module:

```python
def derive_game_ownership(entry) -> Optional[str]:
    """
    One word for "do I have this", derived rather than stored.

    Owned wins over everything, then Subscription, then Free, then Wishlist.
    Nothing to keep in sync: the copy rows are the only truth.
    """
    kinds = {c.ownership for c in (entry.copies or []) if c.ownership}
    for kind in ("Owned", "Subscription", "Free", "Wishlist", "Not Owned"):
        if kind in kinds:
            return kind
    return None
```

Add a `copies` relationship on `Game` (`cascade="all, delete-orphan"`, `passive_deletes=True`, `order_by=GameCopy.position`) so the factory's `selectinload` preload applies and `derive_game_ownership` can read it.

Export all four names from `app/services/domain/__init__.py`.

- [ ] **Step 4: Run test to verify it passes**

The `?ownership=` test also needs Task 7's registry entry; run this task's non-endpoint tests now and the full file at the end of Task 7.

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_domain.py -v -k "not endpoint and not auto_created"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/game_copies.py app/services/domain/hierarchy.py app/services/domain/completion.py app/services/domain/__init__.py app/models/game.py tests/api/test_game_domain.py && git commit -m "feat(game): hierarchy, completion and the game_copy writer"
```

---

### Task 7: Media resolver, registry spec and router

**Files:**
- Create: `app/routers/game.py`
- Modify: `app/utils/media_resolver.py`, `app/registry.py`, `app/main.py`, `app/utils/data_control_utils.py`
- Test: `tests/api/test_media_crud.py`, `tests/api/test_game_domain.py`

**Interfaces:**
- Consumes: Tasks 2, 5, 6.
- Produces: `MEDIA_TABLES["game"]`, `MEDIA_REGISTRY["game"]`, `/api/game` CRUD.

- [ ] **Step 1: Write the failing test**

Add `game` to the parametrized `CASES` list in `tests/api/test_media_crud.py`:

```python
    ("game", "game_name_en", "playing_status", models.Game, "Game"),
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_media_crud.py -v -k game`
Expected: FAIL — 404 on `/api/game/`

- [ ] **Step 3: Implement**

`app/utils/media_resolver.py`, in `MEDIA_TABLES`:

```python
    "game": MediaRef("game", "Game", models.Game, "/game"),
```

`app/registry.py`, a `"game"` entry with: `owner_type="game"`, `label="Game"`, `route="game"`, the three schemas, `status_field="playing_status"`, `list_filters=("franchise_id", "series_id", "playing_status", "release_status", "game_type")`, `hierarchy_names` and `search_fields` over the five name columns, `resolve_hierarchy=resolve_game_parent_hierarchy`, `mark_completed=mark_game_completed`, `write_hook=execute_replace_single_game` (Task 9), `nested_collections={"copies": write_game_copies, "sources": media_sources_writer("game")}`, and:

```python
def _game_ownership(query, params):
    """?ownership=Owned -> games with at least one copy row saying so."""
    wanted = params.get("ownership")
    if not wanted:
        return query
    return query.filter(
        models.GameCopy.query.session.query(models.GameCopy)
        .filter(
            models.GameCopy.game_id == models.Game.system_id,
            models.GameCopy.ownership == wanted,
        )
        .exists()
    )
```

Use `sqlalchemy.exists()` directly rather than the session accessor above:

```python
from sqlalchemy import exists

def _game_ownership(query, params):
    wanted = params.get("ownership")
    if not wanted:
        return query
    return query.filter(
        exists().where(
            models.GameCopy.game_id == models.Game.system_id,
            models.GameCopy.ownership == wanted,
        )
    )
```

Create `app/routers/game.py`:

```python
from app.registry import MEDIA_REGISTRY
from app.routers._factory import make_media_router

router = make_media_router(MEDIA_REGISTRY["game"])
```

Register in `app/main.py`: add `game` to the `from app.routers import (...)` block alphabetically and `app.include_router(game.router)` in the media-entry block, before the SPA catch-all.

In `app/utils/data_control_utils.py`, add the `game` branch to `log_deleted_record`'s name extraction (CN-first, matching `Game.display_name`), which `test_media_crud.py::test_delete_removes_and_logs` asserts.

**Delete the `_PENDING_MEDIA_TYPES` allowlist** in `tests/unit/test_credit_roles.py`, along with the `or mt in _PENDING_MEDIA_TYPES` clause in `test_every_media_type_named_by_a_role_is_a_known_key`. The publisher plan added it because the `publisher` credit role names `"game"` before `MEDIA_TABLES` registers it — a real ordering conflict between the two plans. This task is what registers it, so the escape hatch closes here. Leaving it in would let a genuine typo through under that one name, which is exactly what the guard exists to catch.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_media_crud.py tests/api/test_game_domain.py tests/unit/test_media_resolver.py -v`
Expected: PASS. `tests/api/test_sheet_tabs.py` and `tests/api/test_pipeline_runner.py` will now FAIL — that is expected and is fixed by Tasks 8 and 9.

- [ ] **Step 5: Commit**

```bash
git add app/utils/media_resolver.py app/registry.py app/routers/game.py app/main.py app/utils/data_control_utils.py tests/api/test_media_crud.py && git commit -m "feat(game): registry spec and /api/game router"
```

---

### Task 8: Sheet tabs and parsers

**Files:**
- Modify: `app/services/pipelines/tabs.py`, `app/utils/formatter.py`, `app/services/pipelines/pull.py`
- Test: `tests/unit/test_formatter_game.py` (create), `tests/api/test_sheet_tabs.py`

**Interfaces:**
- Produces: `SheetTab("Game", ...)`, `SheetTab("Game Copy", ...)`, `SheetTab("System Option Alias", ...)`; `parse_game_from_sheet`, `parse_game_copy_from_sheet`, `parse_system_option_alias_from_sheet`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_formatter_game.py
"""Sheet parsers for the game tabs."""

from app.utils.formatter import (
    parse_game_copy_from_sheet,
    parse_game_from_sheet,
    parse_system_option_alias_from_sheet,
)


def test_blank_cells_become_none_and_defaults_apply():
    parsed = parse_game_from_sheet({"game_name_en": "Hades", "playing_status": ""})
    assert parsed["playing_status"] == "Might Play"
    assert parsed["hours_played"] is None
    assert parsed["game_name_cn"] is None


def test_release_date_is_normalised():
    assert parse_game_from_sheet({"release_date": "MAR 2022"})["release_date"] == "2022-03"


def test_a_franchise_name_survives_as_a_string_for_the_resolver():
    parsed = parse_game_from_sheet({"franchise_id": "Souls"})
    assert parsed["franchise_id"] == "Souls"


def test_numeric_columns_are_typed():
    parsed = parse_game_from_sheet(
        {"hours_played": "32.5", "achievements_earned": "12", "price_current_us": "19.99"}
    )
    assert parsed["hours_played"] == 32.5
    assert parsed["achievements_earned"] == 12


def test_game_copy_parses_its_fk_strictly():
    assert parse_game_copy_from_sheet({"game_id": "not-a-uuid"})["game_id"] is None


def test_alias_parses_its_three_columns():
    parsed = parse_system_option_alias_from_sheet(
        {"id": "3", "option_id": "not-a-uuid", "source": "igdb", "value": "RPG"}
    )
    assert parsed == {"id": 3, "option_id": None, "source": "igdb", "value": "RPG"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_formatter_game.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_game_from_sheet'`

- [ ] **Step 3: Implement**

Add the three parsers to `app/utils/formatter.py`, following `parse_comic_from_sheet` exactly: one `parse_from_sheet(raw.get(col), type)` per model column in declaration order, `release_date.normalize(...)` on the date columns, `or "Might Play"` on `playing_status`, lenient `UUID` parsing for `franchise_id`/`series_id`/`base_game_id` (so a name survives for the resolver) and strict `_uuid_or_none` for `game_copy.game_id` and `system_option_alias.option_id`.

In `app/services/pipelines/tabs.py`:

```python
    SheetTab("System Option Alias", models.SystemOptionAlias, f.parse_system_option_alias_from_sheet),
```
immediately after `System Option Usage`, and after the `Comic` tab:

```python
    SheetTab("Game", models.Game, f.parse_game_from_sheet, "game"),
    # After Game: game_id is a real FK, so the parent rows must exist first.
    SheetTab("Game Copy", models.GameCopy, f.parse_game_copy_from_sheet),
```

In `app/services/pipelines/pull.py`:
- `DERIVED_IDENTITY_KEYS`: `"System Option Alias": ("option_id", "source", "value")`.
- `DERIVED_IDENTITY_PARENTS`: `"System Option Alias": ("option_id", "System Options")`.
- `DERIVED_IDENTITY_MINTED_PK`: add `"System Option Alias"` — it has an autoincrement integer PK, and without this the sheet's `id=1` retargets an unrelated local row.
- The per-tab hierarchy `elif` chain: an `elif tab_name == "Game"` branch calling `resolve_game_parent_hierarchy`.
- The INSERT-only default sanitisation block: `playing_status` defaulting for the `Game` tab.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_formatter_game.py tests/api/test_sheet_tabs.py tests/api/test_pull_derived_identity.py -v`
Expected: PASS, including `test_every_media_type_has_a_tab_and_vice_versa`.

- [ ] **Step 5: Commit**

```bash
git add app/services/pipelines/tabs.py app/utils/formatter.py app/services/pipelines/pull.py tests/unit/test_formatter_game.py && git commit -m "feat(game): Sheets tabs and parsers for game, game copy and option alias"
```

---

### Task 9: Pipeline spec (no external fetch yet)

**Files:**
- Modify: `app/services/pipelines/specs.py`, `app/services/pipelines/fill.py`, `app/services/pipelines/replace.py`, `app/services/pipelines/__init__.py`
- Test: `tests/api/test_pipeline_runner.py`

**Interfaces:**
- Produces: `PIPELINES["game"]`, `execute_fill_game`, `execute_replace_single_game`.

Note: `app/routers/data_control.py` builds Fill/Replace routes from `PIPELINES` with `getattr(module, f"execute_fill_{key}")` and raises `AttributeError` **at import time** if either function is missing. Both names must exist in this commit.

- [ ] **Step 1: Write the failing test**

Add `"game"` to the hard-coded key lists in `tests/api/test_pipeline_runner.py` (around lines 91-100), and add:

```python
def test_game_is_registered_but_fetches_nothing_yet():
    """
    Games need a spec the moment "game" enters MEDIA_TABLES, because
    test_sheet_tabs and the data-control route builder both require one. IGDB
    lands in its own plan; until then nothing is fill-eligible, which is
    deliberate and not a bug.
    """
    from app.services.pipelines.specs import PIPELINES

    spec = PIPELINES["game"]
    assert spec.fill_eligible(None, None) is False
    assert spec.replace is None
    assert spec.in_fill_all is False
    assert spec.in_replace_all is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_pipeline_runner.py -v`
Expected: FAIL — `KeyError: 'game'`

- [ ] **Step 3: Implement**

In `app/services/pipelines/specs.py`:

```python
    "game": PipelineSpec(
        key="game", label="Game", model=Game,
        # IGDB lands in its own plan. Until it does nothing is eligible, so a
        # Fill run reports "No entries need filling" rather than failing. The
        # spec exists now because MEDIA_TABLES membership requires it: both
        # test_sheet_tabs and the data-control route builder assume one.
        extract_id=None,
        fill_eligible=lambda db, e: False,
        fill=lambda db, e: None,
        in_fill_all=False,
        replace_select=None,
        replace=None,
        in_replace_all=False,
    ),
```

Add `execute_fill_game = _bind("game")` to `fill.py`, `execute_replace_single_game = _single("game")` to `replace.py`, and both to `app/services/pipelines/__init__.py` (imports and `__all__`).

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_pipeline_runner.py tests/api/test_data_control_routes.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/pipelines/specs.py app/services/pipelines/fill.py app/services/pipelines/replace.py app/services/pipelines/__init__.py tests/api/test_pipeline_runner.py && git commit -m "feat(game): pipeline spec with no external fetch yet"
```

---

### Task 10: Credit roles, tag fields and relation kinds

**Files:**
- Modify: `app/utils/credit_roles.py`, `app/utils/relation_kinds.py`, `app/utils/plan_next_kinds.py`
- Test: `tests/unit/test_credit_roles.py`, `tests/unit/test_relation_kinds.py`, `tests/unit/test_game_vocabulary_wiring.py` (create)

**Depends on:** the publisher plan, for the `publisher` credit role.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_game_vocabulary_wiring.py
"""Games in the credit, tag, relation and plan registries."""

from app.utils import credit_roles as cr
from app.utils import plan_next_kinds as pnk
from app.utils import relation_kinds as rk


def test_a_games_developer_is_its_studio():
    """No `developer` role: `studio` already names the company that made it."""
    assert "game" in cr.CREDIT_ROLES["studio"].media_types
    assert "developer" not in cr.CREDIT_ROLES


def test_person_roles_on_games_are_director_and_composer_only():
    person_roles = {
        key
        for key, role in cr.CREDIT_ROLES.items()
        if role.target == "person" and "game" in role.media_types
    }
    assert person_roles == {"director", "composer"}


def test_game_tag_fields():
    fields = {f.key: f for f in cr.tag_fields_for("game")}
    assert set(fields) == {
        "game_genre",
        "game_theme",
        "game_mode",
        "combat_mode",
        "label",
    }
    assert fields["game_genre"].category == "Game Genre"
    assert fields["combat_mode"].category == "Combat Mode"


def test_label_is_still_offered_to_anime():
    assert "anime" in cr.TAG_FIELDS["label"].media_types


def test_remake_and_remaster_point_at_an_original():
    for key in ("remake", "remaster"):
        assert rk.RELATION_KINDS[key].inverse_label == "Original"
        assert rk.RELATION_KINDS[key].family == "equivalence"


def test_game_plan_scopes_and_flags():
    assert pnk.ALLOWED_SCOPES["next"]["game"] == frozenset(
        {"entry", "series", "franchise"}
    )
    assert pnk.ALLOWED_SCOPES["rewatch"]["game"] == frozenset(
        {"entry", "series", "franchise"}
    )
    assert pnk.PLAN_FLAG_FIELDS["game"] == (("play_next", "next"), ("to_replay", "rewatch"))


def test_games_have_no_size_buckets():
    assert "game" not in pnk.SIZE_THRESHOLDS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_vocabulary_wiring.py -v`
Expected: FAIL — `KeyError: 'game'`

- [ ] **Step 3: Implement**

In `app/utils/credit_roles.py`: add `"game"` to `studio`, `director` and `composer` `media_types`; add `"game"` to the `label` `TagField`; add four `TagField` entries (`game_genre` → `Game Genre`, `game_theme` → `Game Theme`, `game_mode` → `Game Mode`, `combat_mode` → `Combat Mode`, all `media_types=("game",)`); add the `game` rows to `sheet_column_for`'s map.

In `app/utils/relation_kinds.py`, beside `renew`:

```python
    # A remake rebuilds the work; a remaster reissues it. Both are directional
    # versions of the same game, so they share Renew's inverse: what they
    # point at is the Original.
    "remake": RelationKind("remake", "Remake", "Original", "equivalence"),
    "remaster": RelationKind("remaster", "Remaster", "Original", "equivalence"),
```

In `app/utils/plan_next_kinds.py`: add `"game": frozenset({"entry", "series", "franchise"})` to both `ALLOWED_SCOPES` maps and `"game": (("play_next", "next"), ("to_replay", "rewatch"))` to `PLAN_FLAG_FIELDS`. Add no `SIZE_THRESHOLDS` entry.

Widen the closed-set assertion in `tests/unit/test_credit_roles.py:85` to include `"publisher"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_game_vocabulary_wiring.py tests/unit/test_credit_roles.py tests/unit/test_relation_kinds.py tests/api/test_plan_next_routes.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/credit_roles.py app/utils/relation_kinds.py app/utils/plan_next_kinds.py tests/unit/test_game_vocabulary_wiring.py tests/unit/test_credit_roles.py && git commit -m "feat(game): credit roles, tag fields, relation kinds and plan scopes"
```

---

### Task 11: The migration and the seeded vocabulary

**Files:**
- Create: `alembic/versions/g1a2m3e4s5_add_games.py`
- Test: `tests/api/test_game_seed_vocabulary.py` (create)

**Interfaces:**
- Consumes: every model from Tasks 2, 3, 4.
- Produces: revision `g1a2m3e4s5`, down_revision `dc1o2l3s4d5` (verify with `venv/Scripts/alembic.exe heads` — another session may have added a head since).

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_game_seed_vocabulary.py
"""
The seeded game vocabulary.

Scope rows are the load-bearing part. SystemOptionScope's docstring says a
value with no scope rows is offered EVERYWHERE, so an unscoped 角色扮演 would
appear in anime's genre picker - the exact failure Ruling R27 was written
about. The leak is silent, so it is asserted directly.
"""

from app import models

GAME_CATEGORIES = ("Game Genre", "Game Theme", "Game Mode", "Combat Mode")


def test_every_seeded_game_value_is_scoped_to_game(db_session):
    options = (
        db_session.query(models.SystemOption)
        .filter(models.SystemOption.category.in_(GAME_CATEGORIES))
        .all()
    )
    assert options, "no game vocabulary seeded"
    for option in options:
        scopes = {s.scope for s in option.scopes}
        assert scopes == {"game"}, f"{option.category}/{option.value} scoped {scopes}"


def test_seeded_values_are_chinese_and_igdb_english_is_an_alias(db_session):
    rpg = (
        db_session.query(models.SystemOption)
        .filter_by(category="Game Genre", value="角色扮演")
        .one()
    )
    assert {(a.source, a.value) for a in rpg.aliases} == {("igdb", "Role-playing (RPG)")}


def test_combat_mode_has_no_igdb_aliases(db_session):
    """PvE/PvP is not an IGDB field; those values are hand-entered."""
    for option in (
        db_session.query(models.SystemOption).filter_by(category="Combat Mode").all()
    ):
        assert option.aliases == []


def test_game_reference_sources_are_seeded_and_scoped(db_session):
    """
    SteamDB, Bahamut and HowLongToBeat are display-only links, so they are
    media_source reference rows drawn from this vocabulary - not columns.
    """
    values = {
        o.value
        for o in db_session.query(models.SystemOption)
        .filter_by(category="Reference Source")
        .all()
        if any(s.scope == "game" for s in o.scopes)
    }
    assert {"SteamDB", "Bahamut", "HowLongToBeat"} <= values


def test_game_access_platforms_are_usable_as_access_rows(db_session):
    """
    A Platform value with no `watch` usage row never reaches the access
    picker - it would only be offered as an origin tag.
    """
    game_pass = (
        db_session.query(models.SystemOption)
        .filter_by(category="Platform", value="Game Pass")
        .one()
    )
    assert {s.scope for s in game_pass.scopes} == {"game"}
    assert "watch" in {u.usage for u in game_pass.usages}
```

Note: `tests/api/conftest.py` builds the schema with `create_all` and never runs Alembic, so this test needs the seed applied through a fixture that calls the migration's seed helper. Extract the seed data into `app/utils/game_vocabulary.py` as `GAME_VOCABULARY: dict[str, tuple[tuple[str, tuple[str, ...]], ...]]` (category → ((chinese_value, (igdb_aliases...)), ...)) and a `seed_game_vocabulary(db)` function; the migration calls it and so does an autouse fixture in this test file. That keeps the data in one place and testable without Alembic.

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_seed_vocabulary.py -v`
Expected: FAIL — `ModuleNotFoundError: app.utils.game_vocabulary`

- [ ] **Step 3: Implement**

Create `app/utils/game_vocabulary.py` holding `GAME_VOCABULARY` and `seed_game_vocabulary(db)`. Chinese values with their IGDB English aliases, at minimum:

- **Game Genre** (IGDB `genres`): 角色扮演/Role-playing (RPG), 動作/Hack and slash/Beat 'em up, 射擊/Shooter, 平台/Platform, 解謎/Puzzle, 策略/Strategy, 回合制策略/Turn-based strategy (TBS), 即時戰略/Real Time Strategy (RTS), 戰術/Tactical, 冒險/Adventure, 模擬/Simulator, 競速/Racing, 運動/Sport, 格鬥/Fighting, 音樂/Music, 益智問答/Quiz/Trivia, 卡牌與桌遊/Card & Board Game, 視覺小說/Visual Novel, 大逃殺/Battle Royale, 街機/Arcade, 獨立/Indie, 點擊冒險/Point-and-click, MOBA/MOBA.
- **Game Theme** (IGDB `themes`): 動作/Action, 奇幻/Fantasy, 科幻/Science fiction, 恐怖/Horror, 生存/Survival, 歷史/Historical, 潛行/Stealth, 喜劇/Comedy, 商業/Business, 劇情/Drama, 非虛構/Non-fiction, 沙盒/Sandbox, 教育/Educational, 兒童/Kids, 開放世界/Open world, 戰爭/Warfare, 派對/Party, 4X/4X (explore, expand, exploit, and exterminate), 神秘/Mystery, 浪漫/Romance.
- **Game Mode** (IGDB `game_modes`): 單人/Single player, 多人/Multiplayer, 合作/Co-operative, 分割畫面/Split screen, 大型多人線上/Massively Multiplayer Online (MMO).
- **Combat Mode**: PvE, PvP — no aliases.

Two **existing** `media_source` vocabularies also gain `game`-scoped values, so
the Sources card has something to offer on a game (spec Decisions E and I).
These are ordinary `SystemOption` rows in categories that already exist, each
with a `SystemOptionScope` row for `game`, seeded by the same helper:

- **`Reference Source`**: SteamDB, Bahamut, HowLongToBeat, Official, Wiki,
  Fandom — display-only links. The documented rule is that a link a pipeline
  fetches on is a column (`igdb_link`, `steam_link`) and a link only ever
  displayed is a `media_source` row.
- **`Platform`**: Game Pass, PlayStation Plus, GeForce Now, Browser — `access`
  rows, i.e. *where a game can be played*. Deliberately not storefronts: which
  copies were bought lives in `game_copy`. These also need a
  `SystemOptionUsage` row of `watch` so they reach the access picker rather
  than only the origin tag fields.

Create the migration `alembic/versions/g1a2m3e4s5_add_games.py` with a reasoning docstring in house style. `upgrade()` creates `games`, `game_copy`, `system_option_alias`, adds `note.entries`, and calls `seed_game_vocabulary` through a bound session. `downgrade()` drops the three tables and the column, and deletes the seeded rows by category.

- [ ] **Step 4: Run test to verify it passes and the migration actually runs**

```bash
POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_seed_vocabulary.py -v
```

Then verify the migration itself — the suite never runs Alembic, so this is the only check that it works:

```bash
createdb anime_site_migrate_<suffix>
POSTGRES_DB=anime_site_migrate_<suffix> venv/Scripts/alembic.exe upgrade head
POSTGRES_DB=anime_site_migrate_<suffix> venv/Scripts/alembic.exe downgrade -1
POSTGRES_DB=anime_site_migrate_<suffix> venv/Scripts/alembic.exe upgrade head
dropdb anime_site_migrate_<suffix>
```

Expected: all four commands succeed; `alembic heads` reports exactly one head.

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/g1a2m3e4s5_add_games.py app/utils/game_vocabulary.py tests/api/test_game_seed_vocabulary.py && git commit -m "feat(game): migration and seeded Chinese game vocabulary"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/entry-types.md`, `docs/data-model.md`, `docs/options.md`, `docs/business-rules.md`, `docs/systems/notes.md`, `docs/data-actions.md`, `docs/api.md`, `docs/roadmap.md`

- [ ] **Step 1: Update the docs**

Each gets its `Last verified` line bumped to 2026-09-06:

- `entry-types.md` — a ninth column across all four capability matrices; a `game` row in the media-type table; `FRANCHISE_TYPE_FOR` gains `game → Game`.
- `data-model.md` — `games`, `game_copy`, `system_option_alias` sections; `note.entries`; `MEDIA_TABLES` list updated.
- `options.md` — `PlayStatus`, the six game vocabularies, the four tag fields, `studio`/`director`/`composer` widened, the two new relation kinds, the new note sections and shape.
- `business-rules.md` — the three completion axes and their independence; derived ownership.
- `systems/notes.md` — the `name_entries` shape and its `entries` column.
- `data-actions.md` — the three new tabs and their restore position; the game pipeline spec fetching nothing yet.
- `api.md` — `/api/game`, the `?ownership=` filter.
- `roadmap.md` — a Done row for this change; Deferred entries for the Steam sync, IGDB company enrichment, the play-order system and game size buckets.

- [ ] **Step 2: Run the full suite and lint**

```bash
POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```

Expected: all pass. If a failure looks unrelated and mass-scale, confirm you are on your own database before investigating.

- [ ] **Step 3: Commit**

```bash
git add docs/entry-types.md docs/data-model.md docs/options.md docs/business-rules.md docs/systems/notes.md docs/data-actions.md docs/api.md docs/roadmap.md && git commit -m "docs(game): record the ninth media type"
```

---

## Done when

- `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest -q` is green.
- `venv/Scripts/ruff.exe check .` is clean.
- `alembic upgrade head` then `downgrade -1` then `upgrade head` all succeed on a scratch database, and `alembic heads` shows one head.
- A game can be created, listed, filtered by `?ownership=Owned`, patched, completed and deleted through `/api/game`, with copies round-tripping.
- Backup writes the Game, Game Copy and System Option Alias tabs, and Pull restores them.
