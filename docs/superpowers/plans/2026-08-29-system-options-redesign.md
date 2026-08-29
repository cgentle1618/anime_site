# System Options Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `system_options` table into three homes — closed enums in code, open vocabularies with a scope mechanism, and `person`/`studio` entities — and replace all 22 comma-joined name columns with the `media_credit` and `media_tag` link tables.

**Architecture:** Vocabularies come first as pure code modules (`credit_roles.py`), then the five new tables land empty, then one data migration fills them from the string columns and drops those columns, then the API/pipeline/frontend surfaces move over. Both link tables use the FK-less `(media_type, entry_id)` endpoint contract that `media_relation` and `watch_order_item` already use, resolved through `MEDIA_TABLES`.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, Alembic, pytest; React + Vite + Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-29-system-options-redesign-design.md`

## Global Constraints

- **Media type keys are hyphenated**, not underscored: `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`. These are the exact keys in `MEDIA_TABLES` (`app/utils/media_resolver.py:50`). **The spec writes them with underscores; the hyphenated form is correct and wins.** Do not introduce a second spelling.
- Scope keys for `person_role.scope` are `anime` and `non_anime` only. Scope keys for `system_option_scope.scope` are the eight media type keys above.
- Physical table names differ from media type keys — resolve models through `MEDIA_TABLES[key].model`, never by guessing a table name.
- Backend lives under `app/`. Dev server: `uvicorn app.main:app --reload --reload-dir app`.
- Tests run with the project venv: `venv/Scripts/python.exe -m pytest`. API tests require the `anime_site_test` PostgreSQL database (see `tests/api/conftest.py`).
- **After any frontend change run `cd frontend && npm run build`** — port 8000 serves the prebuilt `frontend_dist/` bundle and will otherwise serve stale code.
- Other Claude Code sessions may be editing this branch. Stage only the files named in each task's commit step. Never use `git add -A`.
- **Never change an enum's values while moving it.** Several lists differ between `frontend/src/config/fieldOptions.js` and `docs/options.md` (e.g. `FRANCHISE_EXPECTATIONS` has a `Highest` the docs omit; `FranchiseType` in `app/utils/constants.py` uses `Anime` where the docs say `ACG`). Copy values verbatim and record discrepancies in Task 24; reconciling them is not this project's job.

---

## File Structure

**New backend files**

| File | Responsibility |
|---|---|
| `app/utils/credit_roles.py` | `CREDIT_ROLES`, `TAG_FIELDS`, and the maps from credit role → person role and tag field → option category. Pure data, no DB. |
| `app/utils/name_normalize.py` | One function: fold a name to a comparison key (whitespace, full/half-width). Used by migration, extraction and the duplicate check. |
| `app/models/staff.py` | `Person`, `PersonRole`, `Studio` ORM models. |
| `app/models/media_credit.py` | `MediaCredit`, `MediaTag` ORM models. |
| `app/schemas/staff.py` | Pydantic schemas for person/studio/credits. |
| `app/routers/constants.py` | Read-only Tier 1 enum endpoint. |
| `app/routers/person.py` | Person CRUD, scoped list, merge. |
| `app/routers/studio.py` | Studio CRUD. |
| `app/routers/credits.py` | Read/replace one entry's credits and tags. |
| `app/services/domain/credits.py` | Resolve names → entity ids, replace an entry's link rows, serialize links back to comma-joined names for Sheets. |

**Modified backend files**

`app/models/system.py` (SystemOption reshaped), `app/models/{anime,anime_movie,movie,tv_show,cartoon,manga,novel,comic}.py` (drop columns), `app/routers/options.py`, `app/services/domain/options_extraction.py` (rewritten), `app/services/pipelines/{backup,fill,pull}.py`, `app/services/domain/checking.py`, `app/utils/formatter.py`, `app/utils/constants.py`, `app/main.py`.

**Modified frontend files**

`frontend/src/config/fieldOptions.js`, `frontend/src/config/weekdays.js`, `frontend/src/config/formFields/fieldMeta.js`, the eight `*AddTab.jsx` / Modify equivalents that name an `optionsCategory`, and `frontend/src/pages/add-tabs/OptionsAddTab.jsx`.

---

# Phase 1 — Vocabularies (no schema change)

### Task 1: Credit role and tag field vocabulary

The single source of truth for what a credit or tag row may say. Pure data and pure functions so every later task can import it without a cycle. Shaped like `app/utils/relation_kinds.py`, which it deliberately mirrors.

**Files:**
- Create: `app/utils/credit_roles.py`
- Test: `tests/unit/test_credit_roles.py`

**Interfaces:**
- Consumes: `MEDIA_TYPE_KEYS` from `app/utils/media_resolver.py`.
- Produces:
  - `CreditRole` frozen dataclass: `key: str`, `label: str`, `target: str` (`"person"` | `"studio"`), `person_role: Optional[str]`, `media_types: tuple[str, ...]`
  - `CREDIT_ROLES: dict[str, CreditRole]`
  - `CREDIT_ROLE_KEYS: tuple[str, ...]`
  - `PERSON_ROLES: tuple[str, ...]`
  - `TagField` frozen dataclass: `key: str`, `label: str`, `category: str`, `media_types: tuple[str, ...]`
  - `TAG_FIELDS: dict[str, TagField]`, `TAG_FIELD_KEYS: tuple[str, ...]`
  - `director_scope_for(media_type: str) -> str` — `"anime"` for `anime`/`anime-movie`, else `"non_anime"`
  - `credit_roles_for(media_type: str) -> tuple[CreditRole, ...]`
  - `tag_fields_for(media_type: str) -> tuple[TagField, ...]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_credit_roles.py`:

```python
"""Unit tests for the credit role / tag field vocabulary."""

import pytest

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils import credit_roles as cr


def test_every_credit_role_targets_person_or_studio():
    for role in cr.CREDIT_ROLES.values():
        assert role.target in ("person", "studio"), role.key


def test_studio_role_implies_no_person_role():
    assert cr.CREDIT_ROLES["studio"].person_role is None


def test_person_roles_all_come_from_credit_roles():
    implied = {r.person_role for r in cr.CREDIT_ROLES.values() if r.person_role}
    assert implied == set(cr.PERSON_ROLES)


def test_two_manga_author_credits_share_one_person_role():
    assert cr.CREDIT_ROLES["manga_author_plot"].person_role == "manga_author"
    assert cr.CREDIT_ROLES["manga_author_draw"].person_role == "manga_author"


def test_every_media_type_named_by_a_role_is_a_known_key():
    for role in cr.CREDIT_ROLES.values():
        for mt in role.media_types:
            assert mt in MEDIA_TYPE_KEYS, f"{role.key}: {mt}"
    for field in cr.TAG_FIELDS.values():
        for mt in field.media_types:
            assert mt in MEDIA_TYPE_KEYS, f"{field.key}: {mt}"


def test_director_credit_covers_three_media_types():
    assert set(cr.CREDIT_ROLES["director"].media_types) == {
        "anime",
        "anime-movie",
        "movie",
    }


@pytest.mark.parametrize(
    "media_type,expected",
    [
        ("anime", "anime"),
        ("anime-movie", "anime"),
        ("movie", "non_anime"),
        ("tv-show", "non_anime"),
    ],
)
def test_director_scope_follows_media_type(media_type, expected):
    assert cr.director_scope_for(media_type) == expected


def test_credit_roles_for_anime():
    keys = {r.key for r in cr.credit_roles_for("anime")}
    assert keys == {"studio", "director", "producer", "composer"}


def test_tag_fields_for_comic():
    keys = {f.key for f in cr.tag_fields_for("comic")}
    assert keys == {
        "publisher_tw",
        "comic_publisher",
        "comic_imprint",
        "comic_continuity",
        "comic_era",
        "comic_event",
    }


def test_publisher_tw_is_one_category_across_four_media_types():
    field = cr.TAG_FIELDS["publisher_tw"]
    assert field.category == "Publisher / Distributor TW"
    assert set(field.media_types) == {"anime", "manga", "novel", "comic"}


def test_official_source_is_one_category_across_three_media_types():
    field = cr.TAG_FIELDS["source_official"]
    assert field.category == "Official Source"
    assert set(field.media_types) == {"tv-show", "cartoon", "movie"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_credit_roles.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.credit_roles'`

- [ ] **Step 3: Write the implementation**

Create `app/utils/credit_roles.py`:

```python
"""
The vocabulary of `media_credit.role` and `media_tag.field`.

Deliberately shaped like app/utils/relation_kinds.py and MEDIA_TABLES in
app/utils/media_resolver.py: a frozen dataclass per entry, a dict keyed by the
value stored in the column, and a tuple of keys for validation.

Credit roles and person roles are two vocabularies on purpose. Two credits can
imply one role: 原作 (manga_author_plot) and 作画 (manga_author_draw) are
distinct credits that share a single dropdown, exactly as the old single
"Manga Author" option category behaved.

Director scope is never stored on the credit. It is derived from the media type
on write and recorded on person_role, so a director can be offered in the anime
dropdown before their first credit exists.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CreditRole:
    """One role a person or studio can be credited in."""

    # Value stored in media_credit.role.
    key: str
    # Human label for the form and the docs.
    label: str
    # Which entity table the credit points at: "person" or "studio".
    target: str
    # The person_role this credit implies, or None for studio credits.
    person_role: Optional[str]
    # Media type keys (hyphenated, from MEDIA_TABLES) that may use this role.
    media_types: tuple[str, ...]


CREDIT_ROLES: dict[str, CreditRole] = {
    "studio": CreditRole(
        "studio", "Studio", "studio", None, ("anime", "anime-movie")
    ),
    "director": CreditRole(
        "director", "Director", "person", "director",
        ("anime", "anime-movie", "movie"),
    ),
    "producer": CreditRole(
        "producer", "Producer", "person", "producer", ("anime",)
    ),
    "composer": CreditRole(
        "composer", "Music / Composer", "person", "composer", ("anime",)
    ),
    "manga_author_plot": CreditRole(
        "manga_author_plot", "原作", "person", "manga_author", ("manga",)
    ),
    "manga_author_draw": CreditRole(
        "manga_author_draw", "作画", "person", "manga_author", ("manga",)
    ),
    "novel_author": CreditRole(
        "novel_author", "Author", "person", "novel_author", ("novel",)
    ),
    "novel_illustrator": CreditRole(
        "novel_illustrator", "Illustrator", "person", "novel_illustrator",
        ("novel",),
    ),
    "comic_writer": CreditRole(
        "comic_writer", "Writer", "person", "comic_writer", ("comic",)
    ),
    "comic_artist": CreditRole(
        "comic_artist", "Artist", "person", "comic_artist", ("comic",)
    ),
}

CREDIT_ROLE_KEYS: tuple[str, ...] = tuple(CREDIT_ROLES.keys())

PERSON_ROLES: tuple[str, ...] = tuple(
    dict.fromkeys(
        role.person_role
        for role in CREDIT_ROLES.values()
        if role.person_role is not None
    )
)

# Only "director" is scoped. Every other person_role means the same thing
# everywhere, and stores scope=NULL.
SCOPED_PERSON_ROLES: frozenset[str] = frozenset({"director"})

DIRECTOR_ANIME_MEDIA_TYPES: frozenset[str] = frozenset({"anime", "anime-movie"})


@dataclass(frozen=True)
class TagField:
    """One vocabulary-backed field on a media entry."""

    # Value stored in media_tag.field.
    key: str
    label: str
    # system_option.category the values are drawn from.
    category: str
    media_types: tuple[str, ...]


TAG_FIELDS: dict[str, TagField] = {
    "genre_main": TagField(
        "genre_main", "Genre Main", "Genre Main", ("anime",)
    ),
    "genre_sub": TagField("genre_sub", "Genre Sub", "Genre Sub", ("anime",)),
    "source_official": TagField(
        "source_official", "Official Source", "Official Source",
        ("tv-show", "cartoon", "movie"),
    ),
    "publisher_tw": TagField(
        "publisher_tw", "Publisher / Distributor TW",
        "Publisher / Distributor TW",
        ("anime", "manga", "novel", "comic"),
    ),
    "comic_publisher": TagField(
        "comic_publisher", "Publisher", "Comic Publisher", ("comic",)
    ),
    "comic_imprint": TagField(
        "comic_imprint", "Imprint", "Comic Imprint", ("comic",)
    ),
    "comic_continuity": TagField(
        "comic_continuity", "Continuity", "Comic Continuity", ("comic",)
    ),
    "comic_era": TagField("comic_era", "Era", "Comic Era", ("comic",)),
    "comic_event": TagField("comic_event", "Events", "Comic Event", ("comic",)),
}

TAG_FIELD_KEYS: tuple[str, ...] = tuple(TAG_FIELDS.keys())

# Categories that exist as vocabularies but back no entry column - they drive
# list-page filters only, so no TagField names them.
FILTER_ONLY_CATEGORIES: tuple[str, ...] = ("Franchise for Filter",)

OPTION_CATEGORIES: tuple[str, ...] = tuple(
    dict.fromkeys(
        [f.category for f in TAG_FIELDS.values()] + list(FILTER_ONLY_CATEGORIES)
    )
)


def director_scope_for(media_type: str) -> str:
    """Which director dropdown a credit on this media type belongs to."""
    return "anime" if media_type in DIRECTOR_ANIME_MEDIA_TYPES else "non_anime"


def credit_roles_for(media_type: str) -> tuple[CreditRole, ...]:
    """Every credit role usable on entries of this media type."""
    return tuple(r for r in CREDIT_ROLES.values() if media_type in r.media_types)


def tag_fields_for(media_type: str) -> tuple[TagField, ...]:
    """Every vocabulary-backed field on entries of this media type."""
    return tuple(f for f in TAG_FIELDS.values() if media_type in f.media_types)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_credit_roles.py -v`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add app/utils/credit_roles.py tests/unit/test_credit_roles.py
git commit -m "feat(credits): add the credit role and tag field vocabulary"
```

---

### Task 2: Name normalization helper

Migration, extraction and the duplicate check all need the same answer to "are these two names the same person?". One function, one place.

**Files:**
- Create: `app/utils/name_normalize.py`
- Test: `tests/unit/test_name_normalize.py`

**Interfaces:**
- Consumes: nothing (stdlib `unicodedata` only).
- Produces: `normalize_name(raw: str) -> str`, `split_names(raw: Optional[str]) -> list[str]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_name_normalize.py`:

```python
"""Unit tests for name normalization and comma splitting."""

import pytest

from app.utils.name_normalize import normalize_name, split_names


def test_trims_and_collapses_whitespace():
    assert normalize_name("  新海 誠  ") == normalize_name("新海誠")


def test_folds_full_width_to_half_width():
    assert normalize_name("ＭＡＰＰＡ") == normalize_name("MAPPA")


def test_case_insensitive():
    assert normalize_name("Mappa") == normalize_name("MAPPA")


def test_distinct_names_stay_distinct():
    assert normalize_name("新海誠") != normalize_name("宮崎駿")


def test_split_names_splits_and_trims():
    assert split_names("A, B ,C") == ["A", "B", "C"]


def test_split_names_drops_empty_fragments():
    assert split_names("A,,  ,B") == ["A", "B"]


def test_split_names_dedupes_on_normalized_key_keeping_first_spelling():
    assert split_names("新海 誠, 新海誠") == ["新海 誠"]


@pytest.mark.parametrize("raw", [None, "", "   ", ","])
def test_split_names_of_nothing_is_empty(raw):
    assert split_names(raw) == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_name_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.name_normalize'`

- [ ] **Step 3: Write the implementation**

Create `app/utils/name_normalize.py`:

```python
"""
Comparison keys for entity names.

Two spellings of one studio or one director must collapse to one row. The data
that exists today was typed by hand over years, so it differs by trailing
spaces, by an interior space that is sometimes there and sometimes not, and by
full-width Latin characters pasted from Japanese sources.

normalize_name produces a key used ONLY for comparison. The original spelling is
always what gets stored - the key never reaches the database.
"""

import re
import unicodedata
from typing import Optional

_WHITESPACE = re.compile(r"\s+")


def normalize_name(raw: str) -> str:
    """Fold a name to a key that ignores width, case and interior whitespace."""
    # NFKC maps full-width Latin/digits onto their half-width forms.
    folded = unicodedata.normalize("NFKC", raw)
    return _WHITESPACE.sub("", folded).casefold()


def split_names(raw: Optional[str]) -> list[str]:
    """
    Split a comma-joined name column into individual names.

    Empty fragments are dropped and duplicates are removed on the normalized
    key, keeping the first spelling seen so the stored value stays the one the
    column already had.
    """
    if not raw:
        return []

    out: list[str] = []
    seen: set[str] = set()
    for fragment in str(raw).split(","):
        name = fragment.strip()
        if not name:
            continue
        key = normalize_name(name)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_name_normalize.py -v`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add app/utils/name_normalize.py tests/unit/test_name_normalize.py
git commit -m "feat(credits): add name normalization for entity dedupe"
```

---

### Task 3: Tier 1 constants endpoint

Closed enums stay in code, but the frontend currently keeps its own copies in `fieldOptions.js` and `weekdays.js`. This task makes Python the source and serves it. **Copy every list verbatim** — see the Global Constraint on not changing values.

**Files:**
- Modify: `app/utils/constants.py`
- Create: `app/routers/constants.py`
- Modify: `app/main.py` (register the router)
- Test: `tests/api/test_constants_endpoint.py`

**Interfaces:**
- Consumes: `ITEM_IMPORTANCE` from `app/services/domain/watch_order.py`, `RELATION_KINDS` from `app/utils/relation_kinds.py`.
- Produces: `GET /api/constants` returning `dict[str, list[str]]`, and these new names in `app/utils/constants.py`: `MY_RATINGS`, `FRANCHISE_EXPECTATIONS`, `IS_MAIN`, `MOVIE_TYPES`, `TV_REGIONS`, `MANGA_REGIONS`, `NOVEL_REGIONS`, `NOVEL_TYPES`, `COMIC_TYPES`, `MANGA_SERIALIZATION_STATUSES`, `NOVEL_SERIALIZATION_STATUSES`, `WEEKDAYS`, `CARTOON_AIRING_TYPES`, `MUSIC_STATUSES`, `SEIYUU_STATUSES` — each a `tuple[str, ...]`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_constants_endpoint.py`:

```python
"""The Tier 1 closed-enum endpoint."""

from app.utils import constants as c


def test_endpoint_is_public(client):
    assert client.get("/api/constants").status_code == 200


def test_serves_watching_statuses_in_declaration_order(client):
    body = client.get("/api/constants").json()
    assert body["watching_status"] == [s.value for s in c.WatchStatus]


def test_serves_my_ratings(client):
    body = client.get("/api/constants").json()
    assert body["my_rating"] == ["S", "A+", "A", "B", "C", "D", "E", "F"]


def test_serves_weekdays_monday_first(client):
    body = client.get("/api/constants").json()
    assert body["day_of_week"][0] == "Monday"
    assert len(body["day_of_week"]) == 7


def test_serves_watch_order_importance(client):
    from app.services.domain.watch_order import ITEM_IMPORTANCE

    body = client.get("/api/constants").json()
    assert body["watch_order_importance"] == list(ITEM_IMPORTANCE)


def test_every_value_is_a_list_of_strings(client):
    body = client.get("/api/constants").json()
    assert body
    for key, values in body.items():
        assert isinstance(values, list), key
        assert all(isinstance(v, str) for v in values), key


def test_dub_preference_is_gone(client):
    body = client.get("/api/constants").json()
    assert "dub_preference" not in body
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_constants_endpoint.py -v`
Expected: FAIL — all 404, no such route.

- [ ] **Step 3: Add the missing enums to `app/utils/constants.py`**

Append to `app/utils/constants.py`, copying values verbatim from `frontend/src/config/fieldOptions.js` and `frontend/src/config/weekdays.js`:

```python
# ---------------------------------------------------------------------------
# Tier 1 closed enums that had no Python home. Values are copied verbatim from
# frontend/src/config/fieldOptions.js and weekdays.js, which were the source
# until app/routers/constants.py took over. Do not "fix" a value here: several
# differ from docs/options.md, and reconciling them is deliberately out of
# scope for the options redesign.
# ---------------------------------------------------------------------------

MY_RATINGS: tuple[str, ...] = ("S", "A+", "A", "B", "C", "D", "E", "F")

FRANCHISE_EXPECTATIONS: tuple[str, ...] = ("Highest", "High", "Medium", "Low")

# Formerly the "Main / Spinoff" system option category.
IS_MAIN: tuple[str, ...] = ("本傳", "外傳", "前傳", "後傳", "總集篇")

MOVIE_TYPES: tuple[str, ...] = ("Reality", "Animation")

# Formerly the "Region (TV Show)" / "Region (Manga)" option categories.
TV_REGIONS: tuple[str, ...] = ("歐美劇", "韓劇", "日劇", "陸劇", "台劇", "動畫")
MANGA_REGIONS: tuple[str, ...] = ("日漫", "韓漫", "國漫", "台漫", "其他")
NOVEL_REGIONS: tuple[str, ...] = ("JP", "CN", "TW", "KR", "Western")

NOVEL_TYPES: tuple[str, ...] = ("Light Novel", "Novel", "Web", "Other")
COMIC_TYPES: tuple[str, ...] = ("Ongoing", "Limited", "One-Shot", "Annual")

MANGA_SERIALIZATION_STATUSES: tuple[str, ...] = ("連載中", "停更", "腰斬", "完結")
NOVEL_SERIALIZATION_STATUSES: tuple[str, ...] = (
    "連載中",
    "停更",
    "腰斬",
    "完結",
    "未出",
)

CARTOON_AIRING_TYPES: tuple[str, ...] = ("TV", "Movie", "OVA", "Special")

WEEKDAYS: tuple[str, ...] = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)

MUSIC_STATUSES: tuple[str, ...] = ("Need", "Pending", "Done")
SEIYUU_STATUSES: tuple[str, ...] = ("Need", "Done")
```

- [ ] **Step 4: Write the router**

Create `app/routers/constants.py`:

```python
"""
Read-only endpoint for Tier 1 closed enums.

These are the values business logic branches on - "Not Yet Aired" makes Fill
skip mal_rating, "完結" gates the novel volume checks - so they live in code and
are never editable rows. The endpoint exists so the frontend stops keeping a
second copy of each list; see docs/options.md for the canonical documentation.
"""

from fastapi import APIRouter

from app.utils import constants as c
from app.services.domain.watch_order import ITEM_IMPORTANCE

router = APIRouter(prefix="/api/constants", tags=["Constants"])


def _values(enum_cls) -> list[str]:
    return [member.value for member in enum_cls]


@router.get("", summary="Get All Closed Enums")
@router.get("/", include_in_schema=False)
def get_constants() -> dict[str, list[str]]:
    """Every Tier 1 enum, keyed by snake_case field name."""
    return {
        "watching_status": _values(c.WatchStatus),
        "reading_status": _values(c.ReadStatus),
        "airing_status": _values(c.AiringStatus),
        "anime_airing_type": _values(c.AnimeAiringType),
        "cartoon_airing_type": list(c.CARTOON_AIRING_TYPES),
        "franchise_type": _values(c.FranchiseType),
        "franchise_expectation": list(c.FRANCHISE_EXPECTATIONS),
        "my_rating": list(c.MY_RATINGS),
        "is_main": list(c.IS_MAIN),
        "movie_type": list(c.MOVIE_TYPES),
        "tv_region": list(c.TV_REGIONS),
        "manga_region": list(c.MANGA_REGIONS),
        "novel_region": list(c.NOVEL_REGIONS),
        "novel_type": list(c.NOVEL_TYPES),
        "comic_type": list(c.COMIC_TYPES),
        "manga_serialization_status": list(c.MANGA_SERIALIZATION_STATUSES),
        "novel_serialization_status": list(c.NOVEL_SERIALIZATION_STATUSES),
        "day_of_week": list(c.WEEKDAYS),
        "music_status": list(c.MUSIC_STATUSES),
        "seiyuu_status": list(c.SEIYUU_STATUSES),
        "watch_order_importance": list(ITEM_IMPORTANCE),
    }
```

Register it in `app/main.py` beside the other routers:

```python
from app.routers import constants  # add to the existing router imports

app.include_router(constants.router)  # add beside app.include_router(options.router)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_constants_endpoint.py -v`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add app/utils/constants.py app/routers/constants.py app/main.py tests/api/test_constants_endpoint.py
git commit -m "feat(constants): serve Tier 1 closed enums from one endpoint"
```

---

# Phase 2 — New tables

### Task 4: Reshape `system_option` and add scopes

`system_options` becomes `system_option` with a UUID PK, a real unique constraint, `sort_order` and `remark`, plus a `system_option_scope` child table.

**Files:**
- Modify: `app/models/system.py` (replace the `SystemOption` class)
- Modify: `app/models/__init__.py` (export `SystemOptionScope`)
- Create: `alembic/versions/so1p2t3i4o5n_reshape_system_option.py`
- Test: `tests/api/test_system_option_model.py`

**Interfaces:**
- Consumes: `OPTION_CATEGORIES` from `app/utils/credit_roles.py`.
- Produces: `models.SystemOption` with `system_id`, `category`, `value`, `sort_order`, `remark`, `scopes` relationship; `models.SystemOptionScope` with `option_id`, `scope`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_system_option_model.py`:

```python
"""The reshaped system_option table."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_option_gets_a_uuid_primary_key(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()
    assert opt.system_id is not None


def test_category_and_value_are_unique_together(db_session):
    db_session.add(models.SystemOption(category="Genre Main", value="Action"))
    db_session.commit()
    db_session.add(models.SystemOption(category="Genre Main", value="Action"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_same_value_in_two_categories_is_allowed(db_session):
    db_session.add(models.SystemOption(category="Genre Main", value="Action"))
    db_session.add(models.SystemOption(category="Genre Sub", value="Action"))
    db_session.commit()


def test_sort_order_defaults_to_zero(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()
    assert opt.sort_order == 0


def test_scopes_cascade_when_the_option_is_deleted(db_session):
    opt = models.SystemOption(category="Official Source", value="Netflix")
    db_session.add(opt)
    db_session.commit()
    db_session.add(
        models.SystemOptionScope(option_id=opt.system_id, scope="tv-show")
    )
    db_session.commit()

    db_session.delete(opt)
    db_session.commit()
    assert db_session.query(models.SystemOptionScope).count() == 0


def test_one_scope_cannot_be_recorded_twice(db_session):
    opt = models.SystemOption(category="Official Source", value="Netflix")
    db_session.add(opt)
    db_session.commit()
    db_session.add(
        models.SystemOptionScope(option_id=opt.system_id, scope="tv-show")
    )
    db_session.commit()
    db_session.add(
        models.SystemOptionScope(option_id=opt.system_id, scope="tv-show")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_system_option_model.py -v`
Expected: FAIL — `SystemOption` has no `value` / `system_id`; `SystemOptionScope` does not exist.

- [ ] **Step 3: Replace the model**

In `app/models/system.py`, replace the `SystemOption` class with:

```python
class SystemOption(Base):
    """
    One value in an open vocabulary - Tier 2 of the options design.

    Only values no code branches on live here. Anything the business logic
    compares against (airing status, watching status, my rating) is a Python
    constant in app/utils/constants.py instead, served read-only by
    app/routers/constants.py, so it cannot be renamed out from under the logic.
    """

    __tablename__ = "system_option"
    __table_args__ = (
        UniqueConstraint("category", "value", name="uq_system_option_value"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    category = Column(String, nullable=False, index=True)
    value = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    scopes = relationship(
        "SystemOptionScope",
        back_populates="option",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SystemOptionScope(Base):
    """
    Which media types a vocabulary value is offered in.

    Replaces the old habit of duplicating a category per consumer - "TV Show
    Official Source" plus "Cartoon Official Source" for one vocabulary. A value
    with no scope rows is offered everywhere.
    """

    __tablename__ = "system_option_scope"
    __table_args__ = (
        UniqueConstraint("option_id", "scope", name="uq_system_option_scope"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of MEDIA_TYPE_KEYS (hyphenated) from app/utils/media_resolver.py.
    scope = Column(String, nullable=False)

    option = relationship("SystemOption", back_populates="scopes")
```

Add `UniqueConstraint` to the `sqlalchemy` import at the top of the file, and export `SystemOptionScope` from `app/models/__init__.py` alongside `SystemOption`.

- [ ] **Step 4: Write the migration**

Create `alembic/versions/so1p2t3i4o5n_reshape_system_option.py`. It renames the table, adds the UUID key while keeping the old integer id available for the data migration in Task 10, and creates the scope table:

```python
"""Reshape system_options into system_option + system_option_scope.

Revision ID: so1p2t3i4o5n
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "so1p2t3i4o5n"
down_revision = None  # set to the current head when writing this file
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("system_options", "system_option")
    op.alter_column("system_option", "option_value", new_column_name="value")

    op.add_column(
        "system_option",
        sa.Column("system_id", UUID(as_uuid=True), nullable=True),
    )
    op.execute("UPDATE system_option SET system_id = gen_random_uuid()")
    op.alter_column("system_option", "system_id", nullable=False)

    op.add_column(
        "system_option",
        sa.Column(
            "sort_order", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column("system_option", sa.Column("remark", sa.Text(), nullable=True))
    op.add_column(
        "system_option", sa.Column("created_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "system_option", sa.Column("updated_at", sa.DateTime(), nullable=True)
    )

    # Collapse duplicates the old table allowed before the constraint can exist.
    op.execute(
        """
        DELETE FROM system_option a
        USING system_option b
        WHERE a.id > b.id
          AND a.category = b.category
          AND a.value = b.value
        """
    )

    op.drop_constraint("system_options_pkey", "system_option", type_="primary")
    op.create_primary_key("system_option_pkey", "system_option", ["system_id"])
    op.create_index("ix_system_option_system_id", "system_option", ["system_id"])
    op.create_unique_constraint(
        "uq_system_option_value", "system_option", ["category", "value"]
    )

    op.create_table(
        "system_option_scope",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "option_id",
            UUID(as_uuid=True),
            sa.ForeignKey("system_option.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scope", sa.String(), nullable=False),
        sa.UniqueConstraint("option_id", "scope", name="uq_system_option_scope"),
    )
    op.create_index(
        "ix_system_option_scope_option_id", "system_option_scope", ["option_id"]
    )

    # The old integer id stays for now: Task 10's data migration maps entry
    # strings onto these rows and drops it at the end of Task 12.


def downgrade() -> None:
    op.drop_table("system_option_scope")
    op.drop_constraint("uq_system_option_value", "system_option", type_="unique")
    op.drop_index("ix_system_option_system_id", "system_option")
    op.drop_constraint("system_option_pkey", "system_option", type_="primary")
    op.create_primary_key("system_options_pkey", "system_option", ["id"])
    op.drop_column("system_option", "updated_at")
    op.drop_column("system_option", "created_at")
    op.drop_column("system_option", "remark")
    op.drop_column("system_option", "sort_order")
    op.drop_column("system_option", "system_id")
    op.alter_column("system_option", "value", new_column_name="option_value")
    op.rename_table("system_option", "system_options")
```

Set `down_revision` to the output of `venv/Scripts/python.exe -m alembic heads` before running anything.

- [ ] **Step 5: Run the migration and the test**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m pytest tests/api/test_system_option_model.py -v`
Expected: PASS (6 tests)

- [ ] **Step 6: Fix the callers that still say `option_value`**

`app/schemas/system.py`, `app/routers/options.py`, `app/services/domain/options_extraction.py` and `app/utils/formatter.py` all reference `option_value` and `SystemOption.id`. Options and extraction are rewritten in Tasks 16 and 18; for now make only the mechanical rename so the suite runs:

Run: `venv/Scripts/python.exe -m pytest tests/ -x -q`
Expected: PASS. Fix any remaining `option_value` / `.id` reference the failures point at.

- [ ] **Step 7: Commit**

```bash
git add app/models/system.py app/models/__init__.py app/schemas/system.py app/routers/options.py app/services/domain/options_extraction.py app/utils/formatter.py alembic/versions/so1p2t3i4o5n_reshape_system_option.py tests/api/test_system_option_model.py
git commit -m "feat(options): reshape system_option with a UUID key, uniqueness and scopes"
```

---

### Task 5: `person` and `person_role` tables

**Files:**
- Create: `app/models/staff.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/p1e2r3s4o5n6_add_person_and_studio.py`
- Test: `tests/api/test_person_model.py`

**Interfaces:**
- Consumes: `PERSON_ROLES`, `SCOPED_PERSON_ROLES` from `app/utils/credit_roles.py`.
- Produces: `models.Person` (`system_id`, `name_native`, `name_en`, `name_cn`, `gender`, `my_rating`, `photo_file`, `remark`, `roles`), `models.PersonRole` (`person_id`, `role`, `scope`).

> This task creates `studio` in the same migration file (Task 6 adds its model and tests) because both tables are referenced by `media_credit` in Task 7 and one migration is easier to roll back than two.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_person_model.py`:

```python
"""The person and person_role tables."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_person_needs_only_a_native_name(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    assert p.system_id is not None
    assert p.name_en is None
    assert p.gender is None


def test_gender_lives_on_the_person_not_a_seiyuu_extension(db_session):
    p = models.Person(name_native="花澤香菜", gender="Female")
    db_session.add(p)
    db_session.commit()
    assert p.gender == "Female"


def test_native_name_and_english_name_are_unique_together(db_session):
    db_session.add(models.Person(name_native="新海誠", name_en="Makoto Shinkai"))
    db_session.commit()
    db_session.add(models.Person(name_native="新海誠", name_en="Makoto Shinkai"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_a_person_can_hold_two_roles(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    db_session.add_all(
        [
            models.PersonRole(person_id=p.system_id, role="director", scope="anime"),
            models.PersonRole(person_id=p.system_id, role="composer", scope=None),
        ]
    )
    db_session.commit()
    assert len(p.roles) == 2


def test_a_director_can_be_scoped_both_ways(db_session):
    p = models.Person(name_native="宮崎駿")
    db_session.add(p)
    db_session.commit()
    db_session.add_all(
        [
            models.PersonRole(person_id=p.system_id, role="director", scope="anime"),
            models.PersonRole(
                person_id=p.system_id, role="director", scope="non_anime"
            ),
        ]
    )
    db_session.commit()
    assert {r.scope for r in p.roles} == {"anime", "non_anime"}


def test_one_role_scope_pair_cannot_repeat(db_session):
    p = models.Person(name_native="宮崎駿")
    db_session.add(p)
    db_session.commit()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role="director", scope="anime")
    )
    db_session.commit()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role="director", scope="anime")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_roles_cascade_when_the_person_is_deleted(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role="director", scope="anime")
    )
    db_session.commit()

    db_session.delete(p)
    db_session.commit()
    assert db_session.query(models.PersonRole).count() == 0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_model.py -v`
Expected: FAIL — `models` has no attribute `Person`.

- [ ] **Step 3: Write the models**

Create `app/models/staff.py`:

```python
"""Staff entity ORM models: people and studios."""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now


class Person(Base):
    """
    One human credited on a media entry.

    gender is on the base rather than on a seiyuu extension table: only seiyuu
    have it filled today, but gender is a fact about the person, not about the
    role, and putting it on an extension would encode a data-entry habit into
    the schema. No role extension table exists yet - one is added when a role
    earns several columns that are genuinely meaningless elsewhere.
    """

    __tablename__ = "person"
    __table_args__ = (
        UniqueConstraint("name_native", "name_en", name="uq_person_name"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name_native = Column(String, nullable=False, index=True)
    name_en = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    # One of constants.MY_RATINGS.
    my_rating = Column(String, nullable=True)
    # GCS object key, same convention as the media tables' cover_image_file.
    photo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    roles = relationship(
        "PersonRole",
        back_populates="person",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PersonRole(Base):
    """
    Which dropdowns a person appears in.

    Explicit rather than derived from credits: a director added today must be
    offered in the anime director dropdown before their first credit exists.
    Only "director" is scoped (anime / non_anime); every other role means the
    same thing everywhere and stores scope = NULL.
    """

    __tablename__ = "person_role"
    __table_args__ = (
        UniqueConstraint("person_id", "role", "scope", name="uq_person_role"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("person.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of credit_roles.PERSON_ROLES.
    role = Column(String, nullable=False, index=True)
    # "anime" | "non_anime" for director; NULL for every other role.
    scope = Column(String, nullable=True)

    person = relationship("Person", back_populates="roles")


class Studio(Base):
    """
    One anime production studio.

    Publishers and distributors are deliberately NOT here - they need no
    profile, so they stay a single "Publisher / Distributor TW" vocabulary in
    system_option, which is what fixes the old three-way split across
    "Distributor TW", "Manga Publisher TW" and "Novel Publisher TW".
    """

    __tablename__ = "studio"
    __table_args__ = (
        UniqueConstraint("name_native", "name_en", name="uq_studio_name"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name_native = Column(String, nullable=False, index=True)
    name_en = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    my_rating = Column(String, nullable=True)
    logo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
```

Export `Person`, `PersonRole` and `Studio` from `app/models/__init__.py`.

- [ ] **Step 4: Write the migration**

Create `alembic/versions/p1e2r3s4o5n6_add_person_and_studio.py` with `down_revision = "so1p2t3i4o5n"`, creating `person`, `person_role` and `studio` exactly as the models declare them (three `op.create_table` calls, the two unique constraints per table, indexes on `person.name_native`, `studio.name_native`, `person_role.person_id` and `person_role.role`). `downgrade()` drops the three tables in reverse order.

- [ ] **Step 5: Run the migration and the test**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m pytest tests/api/test_person_model.py -v`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add app/models/staff.py app/models/__init__.py alembic/versions/p1e2r3s4o5n6_add_person_and_studio.py tests/api/test_person_model.py
git commit -m "feat(staff): add the person, person_role and studio tables"
```

---

### Task 6: `studio` model tests

The table and model landed in Task 5; this task proves the studio side behaves and is the gate for the entity tier being complete.

**Files:**
- Test: `tests/api/test_studio_model.py`

**Interfaces:**
- Consumes: `models.Studio` from Task 5.
- Produces: nothing new.

- [ ] **Step 1: Write the test**

Create `tests/api/test_studio_model.py`:

```python
"""The studio table."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_studio_needs_only_a_native_name(db_session):
    s = models.Studio(name_native="MAPPA")
    db_session.add(s)
    db_session.commit()
    assert s.system_id is not None


def test_studio_names_are_unique_together(db_session):
    db_session.add(models.Studio(name_native="MAPPA", name_en="MAPPA"))
    db_session.commit()
    db_session.add(models.Studio(name_native="MAPPA", name_en="MAPPA"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_carries_a_rating_and_a_logo(db_session):
    s = models.Studio(name_native="京都アニメーション", my_rating="S", logo_file="k.png")
    db_session.add(s)
    db_session.commit()
    assert (s.my_rating, s.logo_file) == ("S", "k.png")


def test_studio_has_no_role_table():
    assert not hasattr(models.Studio, "roles")
```

- [ ] **Step 2: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_model.py -v`
Expected: PASS (4 tests) — the model already exists from Task 5.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_studio_model.py
git commit -m "test(staff): cover the studio model"
```

---

### Task 7: `media_credit` and `media_tag` tables

**Files:**
- Create: `app/models/media_credit.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/c1r2e3d4i5t6_add_media_credit_and_tag.py`
- Test: `tests/api/test_media_credit_model.py`

**Interfaces:**
- Consumes: `models.Person`, `models.Studio`, `models.SystemOption`.
- Produces: `models.MediaCredit` (`system_id`, `media_type`, `entry_id`, `role`, `person_id`, `studio_id`, `position`, `remark`), `models.MediaTag` (`system_id`, `media_type`, `entry_id`, `field`, `option_id`, `position`).

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_media_credit_model.py`:

```python
"""The media_credit and media_tag link tables."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def person(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    return p


@pytest.fixture
def studio(db_session):
    s = models.Studio(name_native="MAPPA")
    db_session.add(s)
    db_session.commit()
    return s


def test_a_credit_points_at_a_person(db_session, person):
    c = models.MediaCredit(
        media_type="anime",
        entry_id=uuid.uuid4(),
        role="director",
        person_id=person.system_id,
    )
    db_session.add(c)
    db_session.commit()
    assert c.position == 0


def test_a_credit_points_at_a_studio(db_session, studio):
    c = models.MediaCredit(
        media_type="anime",
        entry_id=uuid.uuid4(),
        role="studio",
        studio_id=studio.system_id,
    )
    db_session.add(c)
    db_session.commit()
    assert c.system_id is not None


def test_a_credit_cannot_point_at_both(db_session, person, studio):
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=person.system_id,
            studio_id=studio.system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_a_credit_cannot_point_at_neither(db_session):
    db_session.add(
        models.MediaCredit(
            media_type="anime", entry_id=uuid.uuid4(), role="director"
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_the_same_person_cannot_hold_one_role_on_one_entry_twice(
    db_session, person
):
    entry_id = uuid.uuid4()
    for _ in range(2):
        db_session.add(
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=person.system_id,
            )
        )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_one_person_can_hold_two_roles_on_one_entry(db_session, person):
    entry_id = uuid.uuid4()
    db_session.add_all(
        [
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=person.system_id,
            ),
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="composer",
                person_id=person.system_id,
            ),
        ]
    )
    db_session.commit()
    assert db_session.query(models.MediaCredit).count() == 2


def test_position_preserves_the_original_comma_order(db_session):
    entry_id = uuid.uuid4()
    for i, name in enumerate(["A", "B", "C"]):
        p = models.Person(name_native=name)
        db_session.add(p)
        db_session.commit()
        db_session.add(
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=p.system_id,
                position=i,
            )
        )
    db_session.commit()

    rows = (
        db_session.query(models.MediaCredit)
        .filter_by(entry_id=entry_id)
        .order_by(models.MediaCredit.position)
        .all()
    )
    assert [r.position for r in rows] == [0, 1, 2]


def test_deleting_a_person_cascades_their_credits(db_session, person):
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=person.system_id,
        )
    )
    db_session.commit()

    db_session.delete(person)
    db_session.commit()
    assert db_session.query(models.MediaCredit).count() == 0


def test_a_tag_points_at_an_option(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()

    t = models.MediaTag(
        media_type="anime",
        entry_id=uuid.uuid4(),
        field="genre_main",
        option_id=opt.system_id,
    )
    db_session.add(t)
    db_session.commit()
    assert t.position == 0


def test_deleting_an_option_cascades_its_tags(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()
    db_session.add(
        models.MediaTag(
            media_type="anime",
            entry_id=uuid.uuid4(),
            field="genre_main",
            option_id=opt.system_id,
        )
    )
    db_session.commit()

    db_session.delete(opt)
    db_session.commit()
    assert db_session.query(models.MediaTag).count() == 0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_media_credit_model.py -v`
Expected: FAIL — `models` has no attribute `MediaCredit`.

- [ ] **Step 3: Write the models**

Create `app/models/media_credit.py`:

```python
"""Link tables joining a media entry to the entities and vocabulary it uses."""

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

from app.database import Base, get_taipei_now


class MediaCredit(Base):
    """
    One person or studio credited on one media entry.

    The entry endpoint is a FK-less (media_type, entry_id) pair, the same
    contract media_relation and watch_order_item use: no single foreign key can
    span the eight media tables, so the pair is resolved at read time through
    MEDIA_TABLES in app/utils/media_resolver.py.

    Exactly one of person_id / studio_id is set, enforced by a CHECK rather
    than by convention, because both the migration and the Fill pipeline write
    these rows without going through the API.

    position carries the order the names had in the comma-joined column this
    table replaced, so "Studio A, Studio B" still reads in that order.
    """

    __tablename__ = "media_credit"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(person_id, studio_id) = 1",
            name="ck_media_credit_one_target",
        ),
        UniqueConstraint(
            "media_type",
            "entry_id",
            "role",
            "person_id",
            "studio_id",
            name="uq_media_credit_row",
        ),
        Index("ix_media_credit_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # One of MEDIA_TYPE_KEYS (hyphenated).
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    # One of credit_roles.CREDIT_ROLE_KEYS.
    role = Column(String, nullable=False, index=True)
    person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("person.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    studio_id = Column(
        UUID(as_uuid=True),
        ForeignKey("studio.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    position = Column(Integer, nullable=False, default=0, server_default="0")
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)


class MediaTag(Base):
    """
    One vocabulary value attached to one media entry.

    `field` rather than `category` because one category can serve several
    fields - "Publisher / Distributor TW" backs publisher_tw on four media
    types - while one field always maps to exactly one category. The
    field -> category map lives in app/utils/credit_roles.py.
    """

    __tablename__ = "media_tag"
    __table_args__ = (
        UniqueConstraint(
            "media_type", "entry_id", "field", "option_id", name="uq_media_tag_row"
        ),
        Index("ix_media_tag_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    # One of credit_roles.TAG_FIELD_KEYS.
    field = Column(String, nullable=False, index=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
```

Export `MediaCredit` and `MediaTag` from `app/models/__init__.py`.

> `num_nonnulls` is a PostgreSQL built-in; no extension is needed.

- [ ] **Step 4: Write the migration**

Create `alembic/versions/c1r2e3d4i5t6_add_media_credit_and_tag.py` with `down_revision = "p1e2r3s4o5n6"`, creating both tables with the constraints and indexes the models declare. `downgrade()` drops `media_tag` then `media_credit`.

- [ ] **Step 5: Run the migration and the test**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m pytest tests/api/test_media_credit_model.py -v`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add app/models/media_credit.py app/models/__init__.py alembic/versions/c1r2e3d4i5t6_add_media_credit_and_tag.py tests/api/test_media_credit_model.py
git commit -m "feat(credits): add the media_credit and media_tag link tables"
```

---

# Phase 3 — Data migration

### Task 8: Credit resolution service

The one place that turns a name into an entity row and an entity row back into a name. Used by the migration, the API, Fill/Pull and the Sheets serializer, so it must exist before any of them.

**Files:**
- Create: `app/services/domain/credits.py`
- Test: `tests/api/test_credits_service.py`

**Interfaces:**
- Consumes: `credit_roles`, `name_normalize`, `models`.
- Produces:
  - `resolve_person(db, name: str, *, role: str, scope: Optional[str]) -> models.Person` — finds by normalized name or creates; ensures the `person_role` row exists
  - `resolve_studio(db, name: str) -> models.Studio`
  - `resolve_option(db, category: str, value: str, *, scope: Optional[str] = None) -> models.SystemOption`
  - `replace_credits(db, media_type: str, entry_id: UUID, role: str, names: list[str]) -> None`
  - `replace_tags(db, media_type: str, entry_id: UUID, field: str, values: list[str]) -> None`
  - `credit_names(db, media_type: str, entry_id: UUID, role: str) -> list[str]`
  - `tag_values(db, media_type: str, entry_id: UUID, field: str) -> list[str]`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_credits_service.py`:

```python
"""Name <-> entity resolution and link replacement."""

import uuid

from app import models
from app.services.domain import credits as svc


def test_resolve_person_creates_once_and_reuses(db_session):
    a = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    b = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert a.system_id == b.system_id
    assert db_session.query(models.Person).count() == 1


def test_resolve_person_matches_across_spelling_variants(db_session):
    a = svc.resolve_person(db_session, "新海 誠", role="director", scope="anime")
    b = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert a.system_id == b.system_id


def test_resolve_person_keeps_the_first_spelling(db_session):
    svc.resolve_person(db_session, "新海 誠", role="director", scope="anime")
    p = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert p.name_native == "新海 誠"


def test_resolve_person_records_the_role(db_session):
    p = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert [(r.role, r.scope) for r in p.roles] == [("director", "anime")]


def test_resolve_person_adds_a_second_scope_without_duplicating_the_person(
    db_session,
):
    svc.resolve_person(db_session, "宮崎駿", role="director", scope="anime")
    p = svc.resolve_person(db_session, "宮崎駿", role="director", scope="non_anime")
    assert db_session.query(models.Person).count() == 1
    assert {r.scope for r in p.roles} == {"anime", "non_anime"}


def test_resolve_studio_creates_once(db_session):
    a = svc.resolve_studio(db_session, "MAPPA")
    b = svc.resolve_studio(db_session, "ＭＡＰＰＡ")
    assert a.system_id == b.system_id


def test_resolve_option_creates_within_a_category(db_session):
    a = svc.resolve_option(db_session, "Genre Main", "Action")
    b = svc.resolve_option(db_session, "Genre Sub", "Action")
    assert a.system_id != b.system_id


def test_resolve_option_records_a_scope(db_session):
    o = svc.resolve_option(
        db_session, "Official Source", "Netflix", scope="tv-show"
    )
    assert [s.scope for s in o.scopes] == ["tv-show"]


def test_replace_credits_writes_rows_in_order(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == ["A", "B"]


def test_replace_credits_is_idempotent(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    assert db_session.query(models.MediaCredit).count() == 2


def test_replace_credits_removes_names_no_longer_listed(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["B"])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == ["B"]


def test_replace_credits_leaves_other_roles_alone(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A"])
    svc.replace_credits(db_session, "anime", entry_id, "director", ["D"])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == ["A"]


def test_replace_credits_with_an_empty_list_clears_the_role(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", [])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == []


def test_replace_credits_does_not_delete_the_person_itself(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "director", ["D"])
    svc.replace_credits(db_session, "anime", entry_id, "director", [])
    assert db_session.query(models.Person).count() == 1


def test_replace_tags_round_trips(db_session):
    entry_id = uuid.uuid4()
    svc.replace_tags(db_session, "anime", entry_id, "genre_main", ["Action", "SF"])
    assert svc.tag_values(db_session, "anime", entry_id, "genre_main") == [
        "Action",
        "SF",
    ]


def test_director_scope_follows_the_media_type(db_session):
    svc.replace_credits(db_session, "movie", uuid.uuid4(), "director", ["Nolan"])
    p = db_session.query(models.Person).one()
    assert [r.scope for r in p.roles] == ["non_anime"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.domain.credits'`

- [ ] **Step 3: Write the service**

Create `app/services/domain/credits.py`:

```python
"""
Resolve names to entities and replace an entry's link rows.

Every writer goes through here: the data migration, the credits API, Fill/Pull
and the Sheets restore. That is the point - an entity name arriving from Tenrai
must land on the same row as the one typed into the Add form, and matching on
the normalized key is what makes that true.

replace_* is a whole-set replace rather than an add: the entry forms submit
every value for a field at once, so a diff against what is stored is the only
way "the user removed one name" can be expressed.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.utils.credit_roles import CREDIT_ROLES, TAG_FIELDS, director_scope_for
from app.utils.name_normalize import normalize_name, split_names

logger = logging.getLogger(__name__)


def _find_by_name(db: Session, model, name: str):
    """Find an entity whose stored name normalizes to the same key."""
    key = normalize_name(name)
    for row in db.query(model).all():
        if normalize_name(row.name_native) == key:
            return row
        if row.name_en and normalize_name(row.name_en) == key:
            return row
    return None


def resolve_person(
    db: Session, name: str, *, role: str, scope: Optional[str] = None
) -> models.Person:
    """Find or create the person, and make sure they hold the given role."""
    person = _find_by_name(db, models.Person, name)
    if person is None:
        person = models.Person(name_native=name.strip())
        db.add(person)
        db.flush()

    held = {(r.role, r.scope) for r in person.roles}
    if (role, scope) not in held:
        db.add(
            models.PersonRole(person_id=person.system_id, role=role, scope=scope)
        )
        db.flush()
        db.refresh(person)
    return person


def resolve_studio(db: Session, name: str) -> models.Studio:
    """Find or create the studio."""
    studio = _find_by_name(db, models.Studio, name)
    if studio is None:
        studio = models.Studio(name_native=name.strip())
        db.add(studio)
        db.flush()
    return studio


def resolve_option(
    db: Session, category: str, value: str, *, scope: Optional[str] = None
) -> models.SystemOption:
    """Find or create the vocabulary value, and record the scope it is used in."""
    key = normalize_name(value)
    option = next(
        (
            o
            for o in db.query(models.SystemOption).filter_by(category=category).all()
            if normalize_name(o.value) == key
        ),
        None,
    )
    if option is None:
        option = models.SystemOption(category=category, value=value.strip())
        db.add(option)
        db.flush()

    if scope and scope not in {s.scope for s in option.scopes}:
        db.add(
            models.SystemOptionScope(option_id=option.system_id, scope=scope)
        )
        db.flush()
        db.refresh(option)
    return option


def replace_credits(
    db: Session, media_type: str, entry_id: UUID, role: str, names: list[str]
) -> None:
    """Make the entry's credits for one role exactly `names`, in that order."""
    spec = CREDIT_ROLES[role]

    db.query(models.MediaCredit).filter_by(
        media_type=media_type, entry_id=entry_id, role=role
    ).delete(synchronize_session=False)

    for position, name in enumerate(names):
        if spec.target == "studio":
            target = resolve_studio(db, name)
            row = models.MediaCredit(
                media_type=media_type,
                entry_id=entry_id,
                role=role,
                studio_id=target.system_id,
                position=position,
            )
        else:
            scope = (
                director_scope_for(media_type)
                if spec.person_role == "director"
                else None
            )
            target = resolve_person(
                db, name, role=spec.person_role, scope=scope
            )
            row = models.MediaCredit(
                media_type=media_type,
                entry_id=entry_id,
                role=role,
                person_id=target.system_id,
                position=position,
            )
        db.add(row)
    db.flush()


def replace_tags(
    db: Session, media_type: str, entry_id: UUID, field: str, values: list[str]
) -> None:
    """Make the entry's tags for one field exactly `values`, in that order."""
    spec = TAG_FIELDS[field]

    db.query(models.MediaTag).filter_by(
        media_type=media_type, entry_id=entry_id, field=field
    ).delete(synchronize_session=False)

    for position, value in enumerate(values):
        option = resolve_option(db, spec.category, value, scope=media_type)
        db.add(
            models.MediaTag(
                media_type=media_type,
                entry_id=entry_id,
                field=field,
                option_id=option.system_id,
                position=position,
            )
        )
    db.flush()


def credit_names(
    db: Session, media_type: str, entry_id: UUID, role: str
) -> list[str]:
    """The entry's credited names for one role, in stored order."""
    rows = (
        db.query(models.MediaCredit)
        .filter_by(media_type=media_type, entry_id=entry_id, role=role)
        .order_by(models.MediaCredit.position)
        .all()
    )
    out = []
    for row in rows:
        if row.person_id:
            entity = db.get(models.Person, row.person_id)
        else:
            entity = db.get(models.Studio, row.studio_id)
        if entity is not None:
            out.append(entity.name_native)
    return out


def tag_values(
    db: Session, media_type: str, entry_id: UUID, field: str
) -> list[str]:
    """The entry's vocabulary values for one field, in stored order."""
    rows = (
        db.query(models.MediaTag)
        .filter_by(media_type=media_type, entry_id=entry_id, field=field)
        .order_by(models.MediaTag.position)
        .all()
    )
    out = []
    for row in rows:
        option = db.get(models.SystemOption, row.option_id)
        if option is not None:
            out.append(option.value)
    return out


def credits_to_sheet_value(
    db: Session, media_type: str, entry_id: UUID, role: str
) -> str:
    """Comma-joined names, the shape the entry sheet columns keep."""
    return ", ".join(credit_names(db, media_type, entry_id, role))


def tags_to_sheet_value(
    db: Session, media_type: str, entry_id: UUID, field: str
) -> str:
    """Comma-joined values, the shape the entry sheet columns keep."""
    return ", ".join(tag_values(db, media_type, entry_id, field))


def names_from_sheet_value(raw: Optional[str]) -> list[str]:
    """Split one comma-joined sheet cell back into names."""
    return split_names(raw)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_service.py -v`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/credits.py tests/api/test_credits_service.py
git commit -m "feat(credits): add name resolution and link replacement service"
```

---

### Task 9: Data migration — fill the link tables

Reads the 22 string columns, writes `media_credit`, `media_tag`, `person`, `person_role`, `studio` and `system_option` rows, merges the duplicated categories, and prints a report of anything it could not place. **Does not drop any column** — Task 10 does that, so this one is re-runnable and reversible.

**Files:**
- Create: `alembic/versions/m1i2g3r4a5t6_backfill_credits_and_tags.py`
- Test: `tests/api/test_credit_backfill.py`

**Interfaces:**
- Consumes: `app.services.domain.credits`, `app.utils.credit_roles`, `app.utils.name_normalize`.
- Produces: `backfill_credits(db) -> dict` in `app/services/domain/credits.py`, returning `{"credits": int, "tags": int, "people": int, "studios": int, "options": int, "unplaced": list[dict]}`.

**Column → role/field map** (this is the whole job; hyphenated media type keys):

| media_type | column | target |
|---|---|---|
| `anime` | `studio` | credit `studio` |
| `anime` | `director` | credit `director` |
| `anime` | `producer` | credit `producer` |
| `anime` | `music` | credit `composer` |
| `anime` | `distributor_tw` | tag `publisher_tw` |
| `anime` | `genre_main` | tag `genre_main` |
| `anime` | `genre_sub` | tag `genre_sub` |
| `anime-movie` | `studio` | credit `studio` |
| `anime-movie` | `director` | credit `director` |
| `movie` | `director` | credit `director` |
| `tv-show` | `source_official` | tag `source_official` |
| `cartoon` | `source_official` | tag `source_official` |
| `manga` | `author_plot` | credit `manga_author_plot` |
| `manga` | `author_draw` | credit `manga_author_draw` |
| `manga` | `publisher_tw` | tag `publisher_tw` |
| `novel` | `author` | credit `novel_author` |
| `novel` | `illustrator` | credit `novel_illustrator` |
| `novel` | `publisher_tw` | tag `publisher_tw` |
| `comic` | `writer` | credit `comic_writer` |
| `comic` | `artist` | credit `comic_artist` |
| `comic` | `publisher` | tag `comic_publisher` |
| `comic` | `imprint` | tag `comic_imprint` |
| `comic` | `continuity` | tag `comic_continuity` |
| `comic` | `era` | tag `comic_era` |
| `comic` | `events` | tag `comic_event` |
| `comic` | `publisher_tw` | tag `publisher_tw` |

`manga.anime_studio` is **absent on purpose** — it points at the adaptation, not at a credit of the manga.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_credit_backfill.py`:

```python
"""The one-time backfill from string columns into link tables."""

from app import models
from app.services.domain.credits import backfill_credits, credit_names, tag_values


def _anime(db_session, **kwargs):
    a = models.Anime(name_cn="測試", **kwargs)
    db_session.add(a)
    db_session.commit()
    return a


def test_splits_a_comma_joined_column_into_rows(db_session):
    a = _anime(db_session, studio="MAPPA, WIT STUDIO")
    backfill_credits(db_session)
    assert credit_names(db_session, "anime", a.system_id, "studio") == [
        "MAPPA",
        "WIT STUDIO",
    ]


def test_two_entries_sharing_a_studio_produce_one_studio_row(db_session):
    _anime(db_session, studio="MAPPA")
    _anime(db_session, studio="MAPPA")
    backfill_credits(db_session)
    assert db_session.query(models.Studio).count() == 1


def test_spelling_variants_collapse_to_one_person(db_session):
    _anime(db_session, director="新海 誠")
    _anime(db_session, director="新海誠")
    backfill_credits(db_session)
    assert db_session.query(models.Person).count() == 1


def test_anime_directors_get_the_anime_scope(db_session):
    _anime(db_session, director="新海誠")
    backfill_credits(db_session)
    role = db_session.query(models.PersonRole).one()
    assert (role.role, role.scope) == ("director", "anime")


def test_movie_directors_get_the_non_anime_scope(db_session):
    m = models.Movies(name_cn="全面啟動", director="Christopher Nolan")
    db_session.add(m)
    db_session.commit()
    backfill_credits(db_session)
    role = db_session.query(models.PersonRole).one()
    assert (role.role, role.scope) == ("director", "non_anime")


def test_genres_become_tags_not_credits(db_session):
    a = _anime(db_session, genre_main="Action, SF")
    backfill_credits(db_session)
    assert tag_values(db_session, "anime", a.system_id, "genre_main") == [
        "Action",
        "SF",
    ]
    assert db_session.query(models.MediaCredit).count() == 0


def test_distributor_tw_and_manga_publisher_tw_merge_into_one_category(
    db_session,
):
    _anime(db_session, distributor_tw="東立")
    mg = models.Manga(name_cn="測試漫畫", publisher_tw="東立")
    db_session.add(mg)
    db_session.commit()

    backfill_credits(db_session)
    options = db_session.query(models.SystemOption).filter_by(
        category="Publisher / Distributor TW"
    ).all()
    assert len(options) == 1
    assert {s.scope for s in options[0].scopes} == {"anime", "manga"}


def test_official_source_merges_across_tv_show_and_cartoon(db_session):
    db_session.add(models.TVShows(name_cn="A", source_official="Netflix"))
    db_session.add(models.Cartoon(name_cn="B", source_official="Netflix"))
    db_session.commit()

    backfill_credits(db_session)
    options = db_session.query(models.SystemOption).filter_by(
        category="Official Source"
    ).all()
    assert len(options) == 1
    assert {s.scope for s in options[0].scopes} == {"tv-show", "cartoon"}


def test_manga_anime_studio_is_not_migrated(db_session):
    mg = models.Manga(name_cn="測試漫畫", anime_studio="MAPPA")
    db_session.add(mg)
    db_session.commit()
    backfill_credits(db_session)
    assert db_session.query(models.MediaCredit).count() == 0


def test_running_twice_changes_nothing(db_session):
    _anime(db_session, studio="MAPPA, WIT STUDIO", director="新海誠")
    first = backfill_credits(db_session)
    second = backfill_credits(db_session)
    assert db_session.query(models.MediaCredit).count() == 3
    assert first["credits"] == second["credits"]


def test_unplaced_values_are_reported_not_guessed(db_session):
    a = _anime(db_session, studio="MAPPA, , ,")
    report = backfill_credits(db_session)
    assert credit_names(db_session, "anime", a.system_id, "studio") == ["MAPPA"]
    assert any(u["column"] == "studio" for u in report["unplaced"])


def test_report_counts_what_it_created(db_session):
    _anime(db_session, studio="MAPPA", genre_main="Action")
    report = backfill_credits(db_session)
    assert report["studios"] == 1
    assert report["credits"] == 1
    assert report["tags"] == 1
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credit_backfill.py -v`
Expected: FAIL — `ImportError: cannot import name 'backfill_credits'`

- [ ] **Step 3: Add the backfill to `app/services/domain/credits.py`**

Append:

```python
# ---------------------------------------------------------------------------
# One-time backfill from the comma-joined string columns.
#
# Lives here rather than inside the Alembic revision so it can be tested with
# the normal fixtures and re-run by hand if a restore brings old data back. It
# is idempotent: replace_* is a whole-set replace, so a second run rewrites the
# same rows.
# ---------------------------------------------------------------------------

# (media_type, column, kind, key) - kind is "credit" or "tag".
# manga.anime_studio is deliberately absent: it points at the adaptation's
# studio, not at a credit of the manga. See the spec's Out of Scope section.
BACKFILL_MAP: tuple[tuple[str, str, str, str], ...] = (
    ("anime", "studio", "credit", "studio"),
    ("anime", "director", "credit", "director"),
    ("anime", "producer", "credit", "producer"),
    ("anime", "music", "credit", "composer"),
    ("anime", "distributor_tw", "tag", "publisher_tw"),
    ("anime", "genre_main", "tag", "genre_main"),
    ("anime", "genre_sub", "tag", "genre_sub"),
    ("anime-movie", "studio", "credit", "studio"),
    ("anime-movie", "director", "credit", "director"),
    ("movie", "director", "credit", "director"),
    ("tv-show", "source_official", "tag", "source_official"),
    ("cartoon", "source_official", "tag", "source_official"),
    ("manga", "author_plot", "credit", "manga_author_plot"),
    ("manga", "author_draw", "credit", "manga_author_draw"),
    ("manga", "publisher_tw", "tag", "publisher_tw"),
    ("novel", "author", "credit", "novel_author"),
    ("novel", "illustrator", "credit", "novel_illustrator"),
    ("novel", "publisher_tw", "tag", "publisher_tw"),
    ("comic", "writer", "credit", "comic_writer"),
    ("comic", "artist", "credit", "comic_artist"),
    ("comic", "publisher", "tag", "comic_publisher"),
    ("comic", "imprint", "tag", "comic_imprint"),
    ("comic", "continuity", "tag", "comic_continuity"),
    ("comic", "era", "tag", "comic_era"),
    ("comic", "events", "tag", "comic_event"),
    ("comic", "publisher_tw", "tag", "publisher_tw"),
)


def backfill_credits(db: Session) -> dict:
    """
    Fill media_credit and media_tag from the legacy string columns.

    Returns counts plus an `unplaced` list. Nothing is guessed: a fragment that
    is empty after trimming, or a value that survives normalization as an empty
    key, is reported with its owner id and original column so it can be placed
    by hand - the posture note_backfill_rows took with 回顧/其他.
    """
    from app.utils.media_resolver import MEDIA_TABLES

    unplaced: list[dict] = []
    credits_written = tags_written = 0

    for media_type, column, kind, key in BACKFILL_MAP:
        model = MEDIA_TABLES[media_type].model
        if not hasattr(model, column):
            continue

        for entry in db.query(model).all():
            raw = getattr(entry, column, None)
            if not raw:
                continue

            names = split_names(raw)
            dropped = [f for f in str(raw).split(",") if f.strip() == ""]
            if dropped:
                unplaced.append(
                    {
                        "media_type": media_type,
                        "entry_id": str(entry.system_id),
                        "column": column,
                        "raw": raw,
                        "reason": "empty fragment",
                    }
                )
            if not names:
                continue

            if kind == "credit":
                replace_credits(db, media_type, entry.system_id, key, names)
                credits_written += len(names)
            else:
                replace_tags(db, media_type, entry.system_id, key, names)
                tags_written += len(names)

    db.commit()

    report = {
        "credits": credits_written,
        "tags": tags_written,
        "people": db.query(models.Person).count(),
        "studios": db.query(models.Studio).count(),
        "options": db.query(models.SystemOption).count(),
        "unplaced": unplaced,
    }
    logger.info(
        "backfill_credits: %s credits, %s tags, %s unplaced",
        credits_written,
        tags_written,
        len(unplaced),
    )
    return report
```

- [ ] **Step 4: Write the migration that calls it**

Create `alembic/versions/m1i2g3r4a5t6_backfill_credits_and_tags.py` with `down_revision = "c1r2e3d4i5t6"`:

```python
"""Backfill media_credit and media_tag from the legacy string columns.

Revision ID: m1i2g3r4a5t6
"""

import logging

from alembic import op
from sqlalchemy.orm import Session

revision = "m1i2g3r4a5t6"
down_revision = "c1r2e3d4i5t6"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    from app.services.domain.credits import backfill_credits

    session = Session(bind=op.get_bind())
    report = backfill_credits(session)
    logger.info("Credit backfill: %s", {k: v for k, v in report.items() if k != "unplaced"})
    for row in report["unplaced"]:
        logger.warning("Unplaced value: %s", row)


def downgrade() -> None:
    # The string columns still exist at this revision, so the link rows can
    # simply be discarded; Task 10's revision is what makes them the only copy.
    op.execute("DELETE FROM media_tag")
    op.execute("DELETE FROM media_credit")
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credit_backfill.py -v`
Expected: PASS (12 tests)

- [ ] **Step 6: Run the migration against the dev database and read the report**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Expected: log lines with the counts, plus one warning per unplaced value. **Read them.** If the unplaced list is long, stop and report before continuing to Task 10 — that is the signal that real data needs manual placement first.

- [ ] **Step 7: Commit**

```bash
git add app/services/domain/credits.py alembic/versions/m1i2g3r4a5t6_backfill_credits_and_tags.py tests/api/test_credit_backfill.py
git commit -m "feat(credits): backfill link tables from the legacy string columns"
```

---

### Task 10: Drop the 22 string columns

Separate from Task 9 so the backfill can be verified against real data before the old copy disappears.

**Files:**
- Modify: `app/models/{anime,anime_movie,movie,tv_show,cartoon,manga,novel,comic}.py`
- Modify: `app/schemas/{anime,anime_movie,movie,tv_show,cartoon,manga,novel,comic}.py`
- Create: `alembic/versions/d1r2o3p4c5o6l_drop_legacy_credit_columns.py`
- Test: `tests/api/test_legacy_columns_gone.py`

**Interfaces:**
- Consumes: the backfill from Task 9 having run.
- Produces: nothing new. Removes `Anime.studio`, `Anime.director`, `Anime.producer`, `Anime.music`, `Anime.distributor_tw`, `Anime.genre_main`, `Anime.genre_sub`, `AnimeMovies.studio`, `AnimeMovies.director`, `Movies.director`, `TVShows.source_official`, `Cartoon.source_official`, `Manga.author_plot`, `Manga.author_draw`, `Manga.publisher_tw`, `Novel.author`, `Novel.illustrator`, `Novel.publisher_tw`, `Comic.writer`, `Comic.artist`, `Comic.publisher`, `Comic.imprint`, `Comic.continuity`, `Comic.era`, `Comic.events`, `Comic.publisher_tw`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_legacy_columns_gone.py`:

```python
"""The legacy comma-joined columns are gone and their data is in link tables."""

import pytest

from app import models

REMOVED = [
    (models.Anime, "studio"),
    (models.Anime, "director"),
    (models.Anime, "producer"),
    (models.Anime, "music"),
    (models.Anime, "distributor_tw"),
    (models.Anime, "genre_main"),
    (models.Anime, "genre_sub"),
    (models.AnimeMovies, "studio"),
    (models.AnimeMovies, "director"),
    (models.Movies, "director"),
    (models.TVShows, "source_official"),
    (models.Cartoon, "source_official"),
    (models.Manga, "author_plot"),
    (models.Manga, "author_draw"),
    (models.Manga, "publisher_tw"),
    (models.Novel, "author"),
    (models.Novel, "illustrator"),
    (models.Novel, "publisher_tw"),
    (models.Comic, "writer"),
    (models.Comic, "artist"),
    (models.Comic, "publisher"),
    (models.Comic, "imprint"),
    (models.Comic, "continuity"),
    (models.Comic, "era"),
    (models.Comic, "events"),
    (models.Comic, "publisher_tw"),
]


@pytest.mark.parametrize("model,column", REMOVED)
def test_column_is_gone(model, column):
    assert column not in model.__table__.columns


def test_seiyuu_status_survived():
    # anime.seiyuu is a Need/Done status column, not a cast list.
    assert "seiyuu" in models.Anime.__table__.columns


def test_manga_anime_studio_survived():
    # Points at the adaptation, not at a credit of the manga.
    assert "anime_studio" in models.Manga.__table__.columns
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_legacy_columns_gone.py -v`
Expected: FAIL — 26 parametrized cases fail, the two survivors pass.

- [ ] **Step 3: Remove the columns from the models and schemas**

Delete each `Column(...)` line listed above from the eight model files, and the matching field from each Pydantic schema in `app/schemas/`. Leave `anime.seiyuu` and `manga.anime_studio` alone.

- [ ] **Step 4: Write the migration**

Create `alembic/versions/d1r2o3p4c5o6l_drop_legacy_credit_columns.py` with `down_revision = "m1i2g3r4a5t6"`. `upgrade()` is 26 `op.drop_column` calls plus `op.drop_column("system_option", "id")` — the legacy integer key the Task 4 migration kept for the backfill. `downgrade()` re-adds every column as `sa.String(), nullable=True`, and re-adds `system_option.id` as a nullable integer; the values are not restored, which the docstring must say plainly.

- [ ] **Step 5: Run the migration and the whole suite**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m pytest tests/ -q`
Expected: `test_legacy_columns_gone.py` passes. Other suites will fail where they still reference a dropped field — those are fixed in Tasks 11–15. Record which files fail; do not fix them here.

- [ ] **Step 6: Commit**

```bash
git add app/models/ app/schemas/ alembic/versions/d1r2o3p4c5o6l_drop_legacy_credit_columns.py tests/api/test_legacy_columns_gone.py
git commit -m "feat(credits): drop the legacy comma-joined credit and tag columns"
```

---

# Phase 4 — API

### Task 11: Options router rework

**Files:**
- Modify: `app/routers/options.py`
- Modify: `app/schemas/system.py`
- Test: `tests/api/test_options_router.py`

**Interfaces:**
- Consumes: `OPTION_CATEGORIES` from `credit_roles`, `resolve_option` from `credits`.
- Produces: `SystemOptionCreate` (`category`, `value`, `sort_order=0`, `remark=None`, `scopes: list[str] = []`), `SystemOptionResponse` (adds `system_id: UUID`, `scopes: list[str]`). Endpoints: `GET /api/options/?scope=`, `GET /api/options/{category}?scope=`, `POST`, `PUT /{system_id}`, `DELETE /{system_id}`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_options_router.py`:

```python
"""The reworked options router."""

from app import models


def test_create_returns_the_new_uuid(admin_client):
    r = admin_client.post(
        "/api/options/", json={"category": "Genre Main", "value": "Action"}
    )
    assert r.status_code == 200
    assert r.json()["system_id"]


def test_create_rejects_an_exact_duplicate(admin_client):
    body = {"category": "Genre Main", "value": "Action"}
    admin_client.post("/api/options/", json=body)
    assert admin_client.post("/api/options/", json=body).status_code == 400


def test_create_records_scopes(admin_client):
    r = admin_client.post(
        "/api/options/",
        json={
            "category": "Official Source",
            "value": "Netflix",
            "scopes": ["tv-show", "cartoon"],
        },
    )
    assert sorted(r.json()["scopes"]) == ["cartoon", "tv-show"]


def test_reading_a_category_filters_by_scope(client, admin_client):
    admin_client.post(
        "/api/options/",
        json={"category": "Official Source", "value": "Netflix", "scopes": ["tv-show"]},
    )
    admin_client.post(
        "/api/options/",
        json={"category": "Official Source", "value": "Disney+", "scopes": ["cartoon"]},
    )
    values = [
        o["value"]
        for o in client.get("/api/options/Official Source?scope=tv-show").json()
    ]
    assert values == ["Netflix"]


def test_an_unscoped_value_is_offered_everywhere(client, admin_client):
    admin_client.post(
        "/api/options/", json={"category": "Official Source", "value": "官網"}
    )
    values = [
        o["value"]
        for o in client.get("/api/options/Official Source?scope=cartoon").json()
    ]
    assert "官網" in values


def test_results_come_back_in_sort_order_then_value(client, admin_client):
    admin_client.post(
        "/api/options/",
        json={"category": "Genre Main", "value": "Zombie", "sort_order": 1},
    )
    admin_client.post(
        "/api/options/",
        json={"category": "Genre Main", "value": "Action", "sort_order": 2},
    )
    values = [o["value"] for o in client.get("/api/options/Genre Main").json()]
    assert values == ["Zombie", "Action"]


def test_update_replaces_the_scope_set(admin_client):
    created = admin_client.post(
        "/api/options/",
        json={"category": "Official Source", "value": "Netflix", "scopes": ["tv-show"]},
    ).json()
    r = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={
            "category": "Official Source",
            "value": "Netflix",
            "scopes": ["cartoon"],
        },
    )
    assert r.json()["scopes"] == ["cartoon"]


def test_delete_cascades_the_tags(admin_client, db_session):
    created = admin_client.post(
        "/api/options/", json={"category": "Genre Main", "value": "Action"}
    ).json()
    import uuid

    db_session.add(
        models.MediaTag(
            media_type="anime",
            entry_id=uuid.uuid4(),
            field="genre_main",
            option_id=created["system_id"],
        )
    )
    db_session.commit()

    assert admin_client.delete(f"/api/options/{created['system_id']}").status_code == 200
    assert db_session.query(models.MediaTag).count() == 0


def test_writes_require_admin(client):
    r = client.post("/api/options/", json={"category": "Genre Main", "value": "X"})
    assert r.status_code in (401, 403)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_options_router.py -v`
Expected: FAIL — the schemas still use `option_value`, no `scope` query parameter exists.

- [ ] **Step 3: Update the schemas**

In `app/schemas/system.py`, replace the three `SystemOption*` classes:

```python
class SystemOptionBase(BaseModel):
    category: str
    value: str
    sort_order: int = 0
    remark: Optional[str] = None


class SystemOptionCreate(SystemOptionBase):
    # Media type keys (hyphenated) this value is offered in. Empty = everywhere.
    scopes: list[str] = []


class SystemOptionResponse(SystemOptionBase):
    system_id: UUID
    scopes: list[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("scopes", mode="before")
    @classmethod
    def _flatten_scopes(cls, v):
        # ORM gives SystemOptionScope rows; the API contract is plain strings.
        if v and not isinstance(v[0], str):
            return [s.scope for s in v]
        return v
```

Add `UUID`, `Optional` and `field_validator` to the imports.

- [ ] **Step 4: Update the router**

In `app/routers/options.py`: rename every `option_value` reference to `value` and every `SystemOption.id` to `SystemOption.system_id`; add `scope: Optional[str] = Query(default=None)` to both read endpoints, filtering with

```python
    if scope:
        query = query.filter(
            or_(
                ~models.SystemOption.scopes.any(),
                models.SystemOption.scopes.any(
                    models.SystemOptionScope.scope == scope
                ),
            )
        )
```

order by `sort_order` then `value`; and on create/update replace the option's `scopes` collection with `SystemOptionScope` rows built from the payload. Return the created/updated row so the response carries `system_id`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_options_router.py -v`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add app/routers/options.py app/schemas/system.py tests/api/test_options_router.py
git commit -m "feat(options): scope-aware reads, sort order and UUID keys"
```

---

### Task 12: Person router, with merge

**Files:**
- Create: `app/routers/person.py`, `app/schemas/staff.py`
- Modify: `app/main.py`
- Test: `tests/api/test_person_router.py`

**Interfaces:**
- Consumes: `models.Person`, `models.PersonRole`, `models.MediaCredit`, `PERSON_ROLES`.
- Produces: `PersonCreate` (`name_native`, `name_en`, `name_cn`, `gender`, `my_rating`, `photo_file`, `remark`, `roles: list[PersonRoleIn]`), `PersonRoleIn` (`role: str`, `scope: Optional[str]`), `PersonResponse` (adds `system_id`, `credit_count: int`). Endpoints: `GET /api/person/?role=&scope=`, `GET /{system_id}`, `POST /`, `PUT /{system_id}`, `DELETE /{system_id}`, `POST /{system_id}/merge`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_person_router.py`:

```python
"""The person router."""

import uuid

from app import models


def _create(admin_client, name, roles):
    return admin_client.post(
        "/api/person/", json={"name_native": name, "roles": roles}
    ).json()


def test_create_and_read_back(admin_client, client):
    created = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    r = client.get(f"/api/person/{created['system_id']}")
    assert r.json()["name_native"] == "新海誠"


def test_list_filters_by_role_and_scope(admin_client, client):
    _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    _create(admin_client, "Nolan", [{"role": "director", "scope": "non_anime"}])

    names = [
        p["name_native"]
        for p in client.get("/api/person/?role=director&scope=anime").json()
    ]
    assert names == ["新海誠"]


def test_a_person_scoped_both_ways_appears_in_both_lists(admin_client, client):
    _create(
        admin_client,
        "宮崎駿",
        [
            {"role": "director", "scope": "anime"},
            {"role": "director", "scope": "non_anime"},
        ],
    )
    for scope in ("anime", "non_anime"):
        names = [
            p["name_native"]
            for p in client.get(f"/api/person/?role=director&scope={scope}").json()
        ]
        assert names == ["宮崎駿"]


def test_unfiltered_list_returns_everyone(admin_client, client):
    _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    _create(admin_client, "花澤香菜", [{"role": "seiyuu", "scope": None}])
    assert len(client.get("/api/person/").json()) == 2


def test_response_carries_a_credit_count(admin_client, client, db_session):
    created = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=created["system_id"],
        )
    )
    db_session.commit()
    assert client.get(f"/api/person/{created['system_id']}").json()["credit_count"] == 1


def test_delete_cascades_the_credits(admin_client, db_session):
    created = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=created["system_id"],
        )
    )
    db_session.commit()

    assert admin_client.delete(f"/api/person/{created['system_id']}").status_code == 200
    assert db_session.query(models.MediaCredit).count() == 0


def test_merge_repoints_credits_onto_the_survivor(admin_client, db_session):
    keep = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    drop = _create(admin_client, "新海 誠 ", [{"role": "director", "scope": "anime"}])
    entry_id = uuid.uuid4()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=entry_id,
            role="director",
            person_id=drop["system_id"],
        )
    )
    db_session.commit()

    r = admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert r.status_code == 200
    assert db_session.query(models.Person).count() == 1
    credit = db_session.query(models.MediaCredit).one()
    assert str(credit.person_id) == keep["system_id"]


def test_merge_does_not_duplicate_a_credit_both_already_had(
    admin_client, db_session
):
    keep = _create(admin_client, "A", [{"role": "director", "scope": "anime"}])
    drop = _create(admin_client, "B", [{"role": "director", "scope": "anime"}])
    entry_id = uuid.uuid4()
    for pid in (keep["system_id"], drop["system_id"]):
        db_session.add(
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=pid,
            )
        )
    db_session.commit()

    admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert db_session.query(models.MediaCredit).count() == 1


def test_merge_unions_the_roles(admin_client, db_session):
    keep = _create(admin_client, "A", [{"role": "director", "scope": "anime"}])
    drop = _create(admin_client, "B", [{"role": "composer", "scope": None}])
    admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    person = db_session.get(models.Person, uuid.UUID(keep["system_id"]))
    assert {r.role for r in person.roles} == {"director", "composer"}


def test_merge_into_itself_is_rejected(admin_client):
    keep = _create(admin_client, "A", [{"role": "director", "scope": "anime"}])
    r = admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": keep["system_id"]},
    )
    assert r.status_code == 400


def test_writes_require_admin(client):
    assert client.post("/api/person/", json={"name_native": "X"}).status_code in (
        401,
        403,
    )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_router.py -v`
Expected: FAIL — all 404.

- [ ] **Step 3: Write the schemas and the router**

Create `app/schemas/staff.py` with `PersonRoleIn`, `PersonCreate`, `PersonResponse`, `StudioCreate`, `StudioResponse`, `MergeRequest` (`source_id: UUID`) as described in Interfaces.

Create `app/routers/person.py`. The list endpoint joins `PersonRole` when `role` is given:

```python
    query = db.query(models.Person)
    if role:
        query = query.join(models.PersonRole)
        query = query.filter(models.PersonRole.role == role)
        if scope:
            query = query.filter(models.PersonRole.scope == scope)
    return query.order_by(models.Person.name_native).distinct().all()
```

Merge repoints then deletes, skipping rows the survivor already has:

```python
@router.post("/{system_id}/merge", summary="Merge Another Person Into This One")
def merge_person(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Repoint every credit and role from `source_id` onto this person, then delete
    the source. This - not delete - is the fix for a duplicate: deleting cascades
    the credits away, so merging is the only way to keep them.
    """
    if system_id == payload.source_id:
        raise HTTPException(status_code=400, detail="Cannot merge a person into itself.")

    keep = db.get(models.Person, system_id)
    drop = db.get(models.Person, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    held = {
        (c.media_type, c.entry_id, c.role)
        for c in db.query(models.MediaCredit).filter_by(person_id=system_id).all()
    }
    moved = 0
    for credit in (
        db.query(models.MediaCredit).filter_by(person_id=payload.source_id).all()
    ):
        if (credit.media_type, credit.entry_id, credit.role) in held:
            db.delete(credit)
            continue
        credit.person_id = system_id
        moved += 1

    keep_roles = {(r.role, r.scope) for r in keep.roles}
    for role_row in list(drop.roles):
        if (role_row.role, role_row.scope) not in keep_roles:
            db.add(
                models.PersonRole(
                    person_id=system_id, role=role_row.role, scope=role_row.scope
                )
            )

    db.delete(drop)
    db.commit()
    return {"status": "success", "credits_moved": moved}
```

Register the router in `app/main.py`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_router.py -v`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add app/routers/person.py app/schemas/staff.py app/main.py tests/api/test_person_router.py
git commit -m "feat(staff): add the person router with scoped reads and merge"
```

---

### Task 13: Studio router

**Files:**
- Create: `app/routers/studio.py`
- Modify: `app/main.py`
- Test: `tests/api/test_studio_router.py`

**Interfaces:**
- Consumes: `models.Studio`, `schemas.StudioCreate`/`StudioResponse` from Task 12.
- Produces: `GET /api/studio/`, `GET /{system_id}`, `POST /`, `PUT /{system_id}`, `DELETE /{system_id}`, `POST /{system_id}/merge`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_studio_router.py`:

```python
"""The studio router."""

import uuid

from app import models


def test_create_and_list(admin_client, client):
    admin_client.post("/api/studio/", json={"name_native": "MAPPA"})
    assert [s["name_native"] for s in client.get("/api/studio/").json()] == ["MAPPA"]


def test_list_is_sorted_by_native_name(admin_client, client):
    admin_client.post("/api/studio/", json={"name_native": "WIT STUDIO"})
    admin_client.post("/api/studio/", json={"name_native": "MAPPA"})
    assert [s["name_native"] for s in client.get("/api/studio/").json()] == [
        "MAPPA",
        "WIT STUDIO",
    ]


def test_update_changes_the_rating(admin_client):
    created = admin_client.post(
        "/api/studio/", json={"name_native": "MAPPA"}
    ).json()
    r = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={"name_native": "MAPPA", "my_rating": "S"},
    )
    assert r.json()["my_rating"] == "S"


def test_renaming_a_studio_changes_every_entry_that_credits_it(
    admin_client, client, db_session
):
    created = admin_client.post(
        "/api/studio/", json={"name_native": "MAPPA"}
    ).json()
    entry_id = uuid.uuid4()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=entry_id,
            role="studio",
            studio_id=created["system_id"],
        )
    )
    db_session.commit()

    admin_client.put(
        f"/api/studio/{created['system_id']}", json={"name_native": "MAPPA Inc."}
    )
    from app.services.domain.credits import credit_names

    assert credit_names(db_session, "anime", entry_id, "studio") == ["MAPPA Inc."]


def test_delete_cascades_the_credits(admin_client, db_session):
    created = admin_client.post(
        "/api/studio/", json={"name_native": "MAPPA"}
    ).json()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="studio",
            studio_id=created["system_id"],
        )
    )
    db_session.commit()

    admin_client.delete(f"/api/studio/{created['system_id']}")
    assert db_session.query(models.MediaCredit).count() == 0


def test_writes_require_admin(client):
    assert client.post("/api/studio/", json={"name_native": "X"}).status_code in (
        401,
        403,
    )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_router.py -v`
Expected: FAIL — all 404.

- [ ] **Step 3: Write the router**

Create `app/routers/studio.py` mirroring `app/routers/person.py` without the role filter, and with merge repointing `media_credit.studio_id`. Register it in `app/main.py`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_router.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/routers/studio.py app/main.py tests/api/test_studio_router.py
git commit -m "feat(staff): add the studio router"
```

---

### Task 14: Credits router — read and replace one entry's links

**Files:**
- Create: `app/routers/credits.py`
- Modify: `app/main.py`
- Test: `tests/api/test_credits_router.py`

**Interfaces:**
- Consumes: `credits` service, `MEDIA_TABLES`, `credit_roles_for`, `tag_fields_for`.
- Produces: `GET /api/credits/{media_type}/{entry_id}` → `{"credits": {role: [name]}, "tags": {field: [value]}}`; `PUT` with the same body, replacing every role and field named in it.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_credits_router.py`:

```python
"""Reading and replacing an entry's credits and tags in one call."""

from app import models


def _anime(db_session):
    a = models.Anime(name_cn="測試")
    db_session.add(a)
    db_session.commit()
    return a


def test_read_returns_empty_maps_for_a_bare_entry(client, db_session):
    a = _anime(db_session)
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body == {"credits": {}, "tags": {}}


def test_replace_then_read_round_trips(admin_client, client, db_session):
    a = _anime(db_session)
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={
            "credits": {"studio": ["MAPPA"], "director": ["新海誠"]},
            "tags": {"genre_main": ["Action"]},
        },
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert body["tags"]["genre_main"] == ["Action"]


def test_replace_only_touches_the_roles_named(admin_client, client, db_session):
    a = _anime(db_session)
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"studio": ["MAPPA"], "director": ["新海誠"]}, "tags": {}},
    )
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"director": []}, "tags": {}},
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert "director" not in body["credits"]


def test_a_role_the_media_type_does_not_have_is_rejected(admin_client, db_session):
    a = _anime(db_session)
    r = admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"comic_writer": ["X"]}, "tags": {}},
    )
    assert r.status_code == 400


def test_an_unknown_media_type_is_rejected(client):
    import uuid

    assert client.get(f"/api/credits/nope/{uuid.uuid4()}").status_code == 400


def test_a_missing_entry_is_a_404(client):
    import uuid

    assert client.get(f"/api/credits/anime/{uuid.uuid4()}").status_code == 404


def test_writes_require_admin(client, db_session):
    a = _anime(db_session)
    r = client.put(
        f"/api/credits/anime/{a.system_id}", json={"credits": {}, "tags": {}}
    )
    assert r.status_code in (401, 403)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_router.py -v`
Expected: FAIL — all 404.

- [ ] **Step 3: Write the router**

Create `app/routers/credits.py`. Validate `media_type` against `MEDIA_TABLES`, load the entry through `MEDIA_TABLES[media_type].model` and 404 if absent, reject any role not in `credit_roles_for(media_type)` or field not in `tag_fields_for(media_type)` with a 400 naming the offender, then call `replace_credits` / `replace_tags` per key and `db.commit()`. The read endpoint returns only roles and fields that actually have rows, so an entry with nothing returns two empty maps. Register in `app/main.py`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_router.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add app/routers/credits.py app/main.py tests/api/test_credits_router.py
git commit -m "feat(credits): add the per-entry credits and tags endpoint"
```

---

# Phase 5 — Pipelines

### Task 15: Rewrite options extraction

Six near-identical functions become one table-driven pass. This is where the `TV Official Source` / `TV Show Official Source` mismatch dies.

**Files:**
- Rewrite: `app/services/domain/options_extraction.py`
- Modify: `app/services/domain/__init__.py`, and any caller in `app/routers/data_control.py`
- Test: `tests/api/test_options_extraction.py` (replaces `tests/api/test_comic_options_extraction.py`)

**Interfaces:**
- Consumes: `BACKFILL_MAP` and `backfill_credits` from `app.services.domain.credits`.
- Produces: `extract_system_options(db) -> dict` — one function replacing the six `extract_system_options_from_*`. Keep thin per-type wrappers only if `data_control.py` calls them by name; otherwise delete them.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_options_extraction.py`:

```python
"""The rewritten, table-driven option extraction."""

from app import models
from app.services.domain.options_extraction import extract_system_options


def test_extraction_is_one_function_now():
    import app.services.domain.options_extraction as m

    assert not [n for n in dir(m) if n.startswith("extract_system_options_from_")]


def test_extraction_creates_no_duplicate_options(db_session):
    a = models.Anime(name_cn="測試")
    db_session.add(a)
    db_session.commit()
    from app.services.domain.credits import replace_tags

    replace_tags(db_session, "anime", a.system_id, "genre_main", ["Action"])
    db_session.commit()

    extract_system_options(db_session)
    extract_system_options(db_session)
    assert db_session.query(models.SystemOption).filter_by(
        category="Genre Main", value="Action"
    ).count() == 1


def test_extraction_records_the_scope_a_value_is_used_in(db_session):
    show = models.TVShows(name_cn="A")
    db_session.add(show)
    db_session.commit()
    from app.services.domain.credits import replace_tags

    replace_tags(db_session, "tv-show", show.system_id, "source_official", ["Netflix"])
    db_session.commit()

    extract_system_options(db_session)
    opt = db_session.query(models.SystemOption).filter_by(
        category="Official Source", value="Netflix"
    ).one()
    assert [s.scope for s in opt.scopes] == ["tv-show"]


def test_the_old_tv_official_source_category_is_never_written(db_session):
    extract_system_options(db_session)
    assert (
        db_session.query(models.SystemOption)
        .filter_by(category="TV Official Source")
        .count()
        == 0
    )


def test_extraction_reports_counts(db_session):
    report = extract_system_options(db_session)
    assert set(report) >= {"status", "message"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_options_extraction.py -v`
Expected: FAIL — `ImportError: cannot import name 'extract_system_options'`

- [ ] **Step 3: Rewrite the module**

Replace the whole body of `app/services/domain/options_extraction.py`:

```python
"""
Reconcile the option vocabulary with what entries actually reference.

Before the options redesign this was six near-identical functions, one per
media type, each with its own hand-maintained category map. Two of those maps
disagreed with the frontend about a category name ("TV Official Source" vs
"TV Show Official Source"), so extracted values landed in a category no
dropdown read. There is now one map - credit_roles.TAG_FIELDS - and one pass
over it, so that class of drift cannot recur.

Since media_tag holds a foreign key, a tag row cannot name a value that does
not exist. What this pass still does is make sure every referenced value
carries a scope row for the media type referencing it, so scoped dropdowns
offer it.
"""

import logging

from sqlalchemy.orm import Session

from app import models
from app.utils.credit_roles import TAG_FIELDS

logger = logging.getLogger(__name__)


def extract_system_options(db: Session) -> dict:
    """Ensure every referenced option carries a scope row for its media type."""
    added = 0
    for tag in db.query(models.MediaTag).all():
        spec = TAG_FIELDS.get(tag.field)
        if spec is None:
            continue
        option = db.get(models.SystemOption, tag.option_id)
        if option is None:
            continue
        if tag.media_type not in {s.scope for s in option.scopes}:
            db.add(
                models.SystemOptionScope(
                    option_id=option.system_id, scope=tag.media_type
                )
            )
            added += 1

    if added:
        db.commit()

    logger.info("extract_system_options: added %s scope rows.", added)
    return {
        "status": "success",
        "message": f"Added {added} missing option scope rows.",
    }
```

Update `app/services/domain/__init__.py` and every caller (`app/routers/data_control.py`) to the single function name. Delete `tests/api/test_comic_options_extraction.py`, whose subject no longer exists.

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_options_extraction.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/options_extraction.py app/services/domain/__init__.py app/routers/data_control.py tests/api/test_options_extraction.py
git rm tests/api/test_comic_options_extraction.py
git commit -m "refactor(options): one table-driven extraction pass, one category map"
```

---

### Task 16: Fill and Pull resolve names to entities

**Files:**
- Modify: `app/services/pipelines/fill.py`, `app/services/pipelines/pull.py`
- Test: `tests/api/test_fill_credit_resolution.py`

**Interfaces:**
- Consumes: `replace_credits`, `replace_tags`, `split_names` from Task 8.
- Produces: no new names — the pipelines stop assigning to dropped columns and call the service instead.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_fill_credit_resolution.py`:

```python
"""Fill and Pull write link rows, not strings."""

from app import models
from app.services.domain.credits import credit_names


def test_a_fetched_studio_name_lands_on_a_studio_row(db_session):
    a = models.Anime(name_cn="測試")
    db_session.add(a)
    db_session.commit()

    from app.services.domain.credits import replace_credits

    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA"])
    db_session.commit()

    assert db_session.query(models.Studio).count() == 1
    assert credit_names(db_session, "anime", a.system_id, "studio") == ["MAPPA"]


def test_a_fetched_name_reuses_an_existing_studio(db_session):
    db_session.add(models.Studio(name_native="MAPPA"))
    db_session.commit()

    a = models.Anime(name_cn="測試")
    db_session.add(a)
    db_session.commit()

    from app.services.domain.credits import replace_credits

    replace_credits(db_session, "anime", a.system_id, "studio", ["ＭＡＰＰＡ"])
    db_session.commit()
    assert db_session.query(models.Studio).count() == 1


def test_no_pipeline_module_still_assigns_a_dropped_column():
    import inspect

    from app.services.pipelines import fill, pull

    for module in (fill, pull):
        source = inspect.getsource(module)
        for dropped in (".studio =", ".director =", ".genre_main ="):
            assert dropped not in source, f"{module.__name__} still sets {dropped}"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_fill_credit_resolution.py -v`
Expected: FAIL on the third test — the pipelines still assign dropped columns.

- [ ] **Step 3: Update the pipelines**

In `fill.py` and `pull.py`, wherever a fetched value was assigned to one of the dropped columns, call the service instead:

```python
from app.services.domain.credits import replace_credits, replace_tags
from app.utils.name_normalize import split_names

# was: entry.studio = ", ".join(studios)
replace_credits(db, media_type, entry.system_id, "studio", split_names(raw_studio))
```

Search for every dropped column name in both files and convert each one. Run the suite after each file rather than at the end.

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_fill_credit_resolution.py tests/api/ -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/pipelines/fill.py app/services/pipelines/pull.py tests/api/test_fill_credit_resolution.py
git commit -m "feat(credits): resolve fetched names to person and studio rows"
```

---

### Task 17: Sheets backup and restore

Entry tabs keep their comma-joined name columns; the entity tables get tabs of their own.

**Files:**
- Modify: `app/services/pipelines/backup.py`, `app/utils/formatter.py`
- Test: `tests/api/test_credits_sheets.py`

**Interfaces:**
- Consumes: `credits_to_sheet_value`, `tags_to_sheet_value`, `names_from_sheet_value` from Task 8.
- Produces: new tabs `Person`, `Person Role`, `Studio`, `System Options` (reshaped), `System Option Scope`; entry-tab serialization unchanged in shape.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_credits_sheets.py`:

```python
"""Backup keeps the sheet shape; restore rebuilds the links."""

from app import models
from app.services.domain.credits import credit_names, replace_credits
from app.utils.formatter import format_anime_for_sheet, parse_anime_from_sheet


def test_backup_writes_credits_as_a_comma_joined_column(db_session):
    a = models.Anime(name_cn="測試")
    db_session.add(a)
    db_session.commit()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT"])
    db_session.commit()

    row = format_anime_for_sheet(a, db=db_session)
    assert row["studio"] == "MAPPA, WIT"


def test_backup_of_an_uncredited_entry_writes_an_empty_cell(db_session):
    a = models.Anime(name_cn="測試")
    db_session.add(a)
    db_session.commit()
    assert format_anime_for_sheet(a, db=db_session)["studio"] == ""


def test_restore_rebuilds_the_links_from_the_same_cell(db_session):
    parsed = parse_anime_from_sheet({"name_cn": "測試", "studio": "MAPPA, WIT"})
    assert parsed["credits"]["studio"] == ["MAPPA", "WIT"]


def test_restore_round_trips_a_full_entry(db_session):
    a = models.Anime(name_cn="測試")
    db_session.add(a)
    db_session.commit()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT"])
    db_session.commit()

    row = format_anime_for_sheet(a, db=db_session)
    parsed = parse_anime_from_sheet(row)

    b = models.Anime(name_cn="測試2")
    db_session.add(b)
    db_session.commit()
    replace_credits(db_session, "anime", b.system_id, "studio", parsed["credits"]["studio"])
    db_session.commit()

    assert credit_names(db_session, "anime", b.system_id, "studio") == ["MAPPA", "WIT"]


def test_person_gets_its_own_tab():
    from app.services.pipelines import backup
    import inspect

    assert '"Person"' in inspect.getsource(backup)
    assert '"Studio"' in inspect.getsource(backup)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_sheets.py -v`
Expected: FAIL — the formatter no longer has a `studio` column to read.

- [ ] **Step 3: Update the formatter**

The `format_*_for_sheet` functions gain a `db` keyword so they can read link rows, and their credit/tag columns are produced by the service rather than by attribute access:

```python
def format_anime_for_sheet(entry, *, db) -> dict:
    row = {...}  # unchanged non-credit columns
    for role in credit_roles_for("anime"):
        row[LEGACY_SHEET_COLUMN[role.key]] = credits_to_sheet_value(
            db, "anime", entry.system_id, role.key
        )
    for field in tag_fields_for("anime"):
        row[LEGACY_SHEET_COLUMN[field.key]] = tags_to_sheet_value(
            db, "anime", entry.system_id, field.key
        )
    return row
```

Add `LEGACY_SHEET_COLUMN` to `app/utils/credit_roles.py` mapping each role/field key onto the sheet header it has always used, so existing spreadsheets keep working:

```python
# The sheet header each role/field has always been written under. The sheets
# predate this design and must keep reading the same; only what is behind the
# column changed.
LEGACY_SHEET_COLUMN: dict[str, str] = {
    "studio": "studio",
    "director": "director",
    "producer": "producer",
    "composer": "music",
    "manga_author_plot": "author_plot",
    "manga_author_draw": "author_draw",
    "novel_author": "author",
    "novel_illustrator": "illustrator",
    "comic_writer": "writer",
    "comic_artist": "artist",
    "genre_main": "genre_main",
    "genre_sub": "genre_sub",
    "source_official": "source_official",
    "publisher_tw": "publisher_tw",
    "comic_publisher": "publisher",
    "comic_imprint": "imprint",
    "comic_continuity": "continuity",
    "comic_era": "era",
    "comic_event": "events",
}
```

Note `anime.distributor_tw` was the one exception — it wrote under `distributor_tw`, not `publisher_tw`. Handle it by keying `LEGACY_SHEET_COLUMN` per `(media_type, key)` where they differ, or accept the header rename and say so in Task 18's docs update. **Pick one and record the choice in the commit message.**

`parse_*_from_sheet` returns the credit/tag names under a `"credits"` / `"tags"` sub-dict rather than as flat columns, and the restore path calls `replace_credits` / `replace_tags` after the entry row exists.

- [ ] **Step 4: Add the new tabs to backup**

In `app/services/pipelines/backup.py`, add a `bulk_overwrite_sheet` block for `Person`, `Person Role`, `Studio` and `System Option Scope` beside the existing `System Options` block, following the same `format_model_for_sheet` pattern. Restore reads entity tabs **before** entry tabs.

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_sheets.py tests/api/ -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/services/pipelines/backup.py app/utils/formatter.py app/utils/credit_roles.py tests/api/test_credits_sheets.py
git commit -m "feat(credits): keep sheet columns while backing links up to their own tabs"
```

---

### Task 18: Duplicate-entity check

Makes the duplicates the migration created findable, which is what makes merge usable.

**Files:**
- Modify: `app/services/domain/checking.py`
- Test: `tests/api/test_duplicate_entity_check.py`

**Interfaces:**
- Consumes: `normalize_name`.
- Produces: `find_duplicate_entities(db) -> list[dict]` with keys `kind` (`"person"` | `"studio"`), `key`, `ids`, `names`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_duplicate_entity_check.py`:

```python
"""Finding entities that differ only by spelling."""

from app import models
from app.services.domain.checking import find_duplicate_entities


def test_no_duplicates_is_an_empty_list(db_session):
    db_session.add(models.Person(name_native="新海誠"))
    db_session.commit()
    assert find_duplicate_entities(db_session) == []


def test_interior_whitespace_variants_are_flagged(db_session):
    db_session.add_all(
        [models.Person(name_native="新海誠"), models.Person(name_native="新海 誠")]
    )
    db_session.commit()
    found = find_duplicate_entities(db_session)
    assert len(found) == 1
    assert sorted(found[0]["names"]) == sorted(["新海誠", "新海 誠"])


def test_full_width_variants_are_flagged(db_session):
    db_session.add_all(
        [models.Studio(name_native="MAPPA"), models.Studio(name_native="ＭＡＰＰＡ")]
    )
    db_session.commit()
    found = find_duplicate_entities(db_session)
    assert found[0]["kind"] == "studio"


def test_a_person_and_a_studio_sharing_a_name_are_not_duplicates(db_session):
    db_session.add(models.Person(name_native="Ghibli"))
    db_session.add(models.Studio(name_native="Ghibli"))
    db_session.commit()
    assert find_duplicate_entities(db_session) == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_duplicate_entity_check.py -v`
Expected: FAIL — `ImportError: cannot import name 'find_duplicate_entities'`

- [ ] **Step 3: Add the check**

Append to `app/services/domain/checking.py`:

```python
def find_duplicate_entities(db: Session) -> list[dict]:
    """
    Entities whose names collapse to one normalization key.

    The backfill created these deliberately rather than guessing that two
    spellings meant one person. Deleting one would cascade its credits away, so
    the fix is POST /api/person/{id}/merge - this check is what makes the pairs
    findable in the first place.
    """
    from app.utils.name_normalize import normalize_name

    found: list[dict] = []
    for kind, model in (("person", models.Person), ("studio", models.Studio)):
        buckets: dict[str, list] = {}
        for row in db.query(model).all():
            buckets.setdefault(normalize_name(row.name_native), []).append(row)
        for key, rows in buckets.items():
            if len(rows) > 1:
                found.append(
                    {
                        "kind": kind,
                        "key": key,
                        "ids": [str(r.system_id) for r in rows],
                        "names": [r.name_native for r in rows],
                    }
                )
    return found
```

Wire it into the existing checking report the same way its neighbours are.

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_duplicate_entity_check.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/checking.py tests/api/test_duplicate_entity_check.py
git commit -m "feat(checking): flag people and studios that differ only by spelling"
```

---

# Phase 6 — Frontend

### Task 19: Constants from the API

**Files:**
- Modify: `frontend/src/config/fieldOptions.js`, `frontend/src/config/weekdays.js`
- Create: `frontend/src/config/useConstants.js`

**Interfaces:**
- Consumes: `GET /api/constants` from Task 3.
- Produces: `useConstants()` hook returning the enum map, and `CONSTANTS_FALLBACK` — the current hardcoded lists, kept as the value rendered before the fetch resolves.

- [ ] **Step 1: Write the fetch module**

Create `frontend/src/config/useConstants.js`:

```javascript
// Tier 1 closed enums, fetched once from /api/constants.
//
// These lists used to live in fieldOptions.js and weekdays.js, which meant two
// copies of every status list - one in Python that the business logic branched
// on, one in JS that the dropdowns rendered. Python is now the source; the
// fallback below is what renders during the first paint, not a second source
// of truth.

import { useEffect, useState } from "react";

import * as FALLBACK from "./fieldOptions";

let cache = null;

export function useConstants() {
  const [constants, setConstants] = useState(cache);

  useEffect(() => {
    if (cache) return;
    fetch("/api/constants")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          cache = data;
          setConstants(data);
        }
      })
      .catch(() => {
        /* fall back to the bundled copy */
      });
  }, []);

  return constants ?? FALLBACK.CONSTANTS_FALLBACK;
}
```

- [ ] **Step 2: Add the fallback export**

In `frontend/src/config/fieldOptions.js`, add at the bottom, reusing the existing arrays so there is still only one literal per list:

```javascript
// Shape-matched to GET /api/constants. Rendered only until the fetch resolves.
export const CONSTANTS_FALLBACK = {
  watching_status: WATCHING_STATUSES,
  reading_status: READING_STATUSES,
  airing_status: AIRING_STATUSES,
  anime_airing_type: ANIME_AIRING_TYPES,
  cartoon_airing_type: CARTOON_AIRING_TYPES,
  franchise_type: FRANCHISE_TYPES,
  franchise_expectation: FRANCHISE_EXPECTATIONS,
  my_rating: MY_RATINGS,
  is_main: IS_MAIN,
  movie_type: MOVIE_TYPES,
  tv_region: TV_REGIONS,
  manga_region: MANGA_REGIONS,
  novel_region: NOVEL_REGIONS,
  novel_type: NOVEL_TYPES,
  comic_type: COMIC_TYPES,
  manga_serialization_status: MANGA_SERIALIZATION_STATUSES,
  novel_serialization_status: NOVEL_SERIALIZATION_STATUSES,
  day_of_week: WEEKDAYS,
  music_status: MUSIC_STATUSES,
  seiyuu_status: SEIYUU_STATUSES,
};
```

Import `WEEKDAYS` from `./weekdays`, and add `MUSIC_STATUSES` / `SEIYUU_STATUSES` if they are not already there.

- [ ] **Step 3: Build and check**

Run: `cd frontend && npm run build`
Then load `http://localhost:8000/admin/add` and confirm the status dropdowns still populate.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/config/useConstants.js frontend/src/config/fieldOptions.js frontend/src/config/weekdays.js
git commit -m "feat(frontend): fetch closed enums from /api/constants"
```

---

### Task 20: Field sources — options, people, studios

**Files:**
- Modify: `frontend/src/config/formFields/fieldMeta.js`
- Modify: the `*AddTab.jsx` / Modify equivalents that read `optionsCategory`
- Modify: `frontend/src/pages/add-tabs/OptionsAddTab.jsx`

**Interfaces:**
- Consumes: `/api/options?scope=`, `/api/person?role=&scope=`, `/api/studio`.
- Produces: `optionsCategory` replaced by `source: {kind, category?, role?, scope?}`, and a `getSourceValues(allSources, source)` helper replacing `getOptions(allOptions, category)`.

- [ ] **Step 1: Rewrite the field descriptors**

In `fieldMeta.js`, replace each `optionsCategory: "X"` with a `source` object. The full mapping:

```javascript
// Where a tags control gets its suggestions. `kind` selects the endpoint:
//   option -> /api/options/{category}?scope=
//   person -> /api/person?role=&scope=
//   studio -> /api/studio
// Splitting these is the point of the redesign: a director is an entity with a
// profile, a genre is a vocabulary value.
studio:           { source: { kind: "studio" } },
director:         { source: { kind: "person", role: "director", scope: "anime" } },
producer:         { source: { kind: "person", role: "producer" } },
music:            { source: { kind: "person", role: "composer" } },
genre_main:       { source: { kind: "option", category: "Genre Main" } },
genre_sub:        { source: { kind: "option", category: "Genre Sub" } },
distributor_tw:   { source: { kind: "option", category: "Publisher / Distributor TW", scope: "anime" } },
author_plot:      { source: { kind: "person", role: "manga_author" } },
author_draw:      { source: { kind: "person", role: "manga_author" } },
anime_studio:     { source: { kind: "studio" } },
publisher_tw:     { source: { kind: "option", category: "Publisher / Distributor TW", scope: "manga" } },
author:           { source: { kind: "person", role: "novel_author" } },
illustrator:      { source: { kind: "person", role: "novel_illustrator" } },
writer:           { source: { kind: "person", role: "comic_writer" } },
artist:           { source: { kind: "person", role: "comic_artist" } },
continuity:       { source: { kind: "option", category: "Comic Continuity", scope: "comic" } },
era:              { source: { kind: "option", category: "Comic Era", scope: "comic" } },
events:           { source: { kind: "option", category: "Comic Event", scope: "comic" } },
publisher:        { source: { kind: "option", category: "Comic Publisher", scope: "comic" } },
imprint:          { source: { kind: "option", category: "Comic Imprint", scope: "comic" } },
source_official:  { source: { kind: "option", category: "Official Source" } },
```

`publisher_tw` appears on manga, novel and comic — give each its own `scope`. The movie director field uses `scope: "non_anime"`.

`anime_studio` keeps its column (it was not migrated) but reads its suggestions from `/api/studio`, so the same names appear.

- [ ] **Step 2: Update the consumers**

Replace `getOptions(allOptions, "Category")` with `getSourceValues(sources, meta.source)` in every Add/Modify tab that used it. The Add and Modify pages already collect unseen values before submit — point that create-if-missing code at `/api/person` or `/api/studio` when `source.kind` is not `option`.

- [ ] **Step 3: Rewrite the Options admin tab**

`OptionsAddTab.jsx` gains three sub-tabs — Options / People / Studios — with the datalist of category names replaced by `OPTION_CATEGORIES` fetched from `/api/options/`. People and Studios get name/rating/photo/remark fields and, for people, a role + scope picker.

- [ ] **Step 4: Build and verify both ports**

Run: `cd frontend && npm run build`
Check `http://localhost:5173` and `http://localhost:8000`: open the Anime Add form and confirm the Director dropdown lists only anime directors, the Movie Add form lists only non-anime directors, and Studio suggestions come from `/api/studio`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/config/formFields/fieldMeta.js frontend/src/pages/add-tabs/ frontend/src/pages/admin/
git commit -m "feat(frontend): point tag controls at options, people and studios"
```

---

# Phase 7 — Documentation

### Task 21: Update the docs

**Files:**
- Modify: `docs/options.md`, `docs/database-schema.md`, `docs/api.md`, `docs/business-logic.md`, `docs/admin-forms.md`, `docs/integrations.md`

- [ ] **Step 1: Restructure `docs/options.md`**

- Introduce the three tiers at the top, with the rule that decides them: *does code branch on the exact value?*
- Tier 1 keeps its existing value tables and gains a line saying they are Python constants served by `GET /api/constants`.
- **Delete the `Dub Preference` section entirely.**
- Move `Main / Spinoff` and both `Region` sections into Tier 1.
- Replace the "System Options Categories" table with the ten Tier 2 categories and their scopes.
- Add a "Became entities" section listing the categories that are now `person` / `studio` rows, pointing at `docs/database-schema.md`.
- Record the value discrepancies found but deliberately not fixed: `FRANCHISE_EXPECTATIONS` includes `Highest` where the docs listed four values without it, and `FranchiseType` uses `Anime` in `constants.py` where the docs say `ACG`.

- [ ] **Step 2: Update the other five docs**

- `database-schema.md`: `person`, `person_role`, `studio`, `media_credit`, `media_tag`, reshaped `system_option`, `system_option_scope`; and the 22 removed columns.
- `api.md`: `/api/constants`, `/api/person`, `/api/studio`, `/api/credits`, and the options router's `scope` parameter.
- `business-logic.md`: the rewritten extraction pass, the backfill, the merge operation, the duplicate check.
- `admin-forms.md`: `source` descriptors, the three Options sub-tabs, create-if-missing now creating entities.
- `integrations.md`: new backup tabs, restore ordering (entities before entries), and Fill/Pull resolving names to entities.

- [ ] **Step 3: Commit**

```bash
git add docs/options.md docs/database-schema.md docs/api.md docs/business-logic.md docs/admin-forms.md docs/integrations.md
git commit -m "docs(options): document the three-tier options design"
```

---

## Self-Review Notes

**Spec coverage.** Tier 1 → Task 3, 19. Tier 2 and the scope mechanism → Tasks 1, 4, 11. `person`/`person_role` → Task 5. `studio` → Tasks 5, 6, 13. `media_credit`/`media_tag` → Task 7. `CREDIT_ROLES` → Task 1. Column removal → Task 10. Migration and its report → Task 9. Cascade delete → Tasks 7, 12, 13. Merge → Task 12. API → Tasks 3, 11, 12, 13, 14. Pipelines → Tasks 15, 16, 17, 18. Admin frontend → Tasks 19, 20. Testing → distributed. Docs → Task 21. Character/`character_voice` and `manga.anime_studio` are Out of Scope in the spec and have no task, deliberately.

**Two things the executor must decide and record:**

1. **`anime.distributor_tw`'s sheet header** (Task 17, Step 3). Every other field keeps its header; this one's field key is `publisher_tw` while its sheet column has always been `distributor_tw`. Either key `LEGACY_SHEET_COLUMN` per `(media_type, field)` or rename the header and note it in `docs/integrations.md`.
2. **`down_revision` values.** Task 4's migration must point at the current head, which the concurrent Plan Next work may have moved. Run `alembic heads` before writing it.

**Ordering constraint.** Task 10 drops columns that Tasks 11–20 stop referencing. The suite is red between Task 10 and Task 16; that is expected and Task 10's Step 5 says to record which files fail rather than fix them early.
