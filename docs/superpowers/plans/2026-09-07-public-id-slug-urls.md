# Public ID + Slug URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bare-UUID detail-page URLs with `/<type>/<public_id>/<slug>`, where `public_id` is a stored per-type sequential integer and the slug is derived, decorative, and self-healing.

**Architecture:** Each of 17 entity tables gains a `public_id INTEGER NOT NULL UNIQUE` column fed by a per-table Postgres sequence, so every insert path gets one for free. The API keeps speaking UUIDs everywhere; only the single-entry GET learns to accept an integer, via one shared resolver. The frontend routes on `publicId`, fetches by it, and uses the returned `system_id` for every subsequent call — so the ~1,260 existing `system_id` references in the SPA are untouched.

**Tech Stack:** SQLAlchemy 2 + Alembic + PostgreSQL, FastAPI, pytest; React + React Router + Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-public-id-slug-urls-design.md`

## Global Constraints

- **17 entity tables are in scope**, referred to throughout as THE SEVENTEEN:

  | Model | Table | Sequence name |
  |---|---|---|
  | `models.Anime` | `anime` | `anime_public_id_seq` |
  | `models.AnimeMovies` | `anime_movies` | `anime_movies_public_id_seq` |
  | `models.Movies` | `movies` | `movies_public_id_seq` |
  | `models.TVShows` | `tv_shows` | `tv_shows_public_id_seq` |
  | `models.Cartoon` | `cartoons` | `cartoons_public_id_seq` |
  | `models.Manga` | `manga` | `manga_public_id_seq` |
  | `models.Novel` | `novel` | `novel_public_id_seq` |
  | `models.Comic` | `comic` | `comic_public_id_seq` |
  | `models.Game` | `games` | `games_public_id_seq` |
  | `models.Collection` | `collection` | `collection_public_id_seq` |
  | `models.Franchise` | `franchise` | `franchise_public_id_seq` |
  | `models.Series` | `series` | `series_public_id_seq` |
  | `models.Person` | `person` | `person_public_id_seq` |
  | `models.Studio` | `studio` | `studio_public_id_seq` |
  | `models.Publisher` | `publisher` | `publisher_public_id_seq` |
  | `models.Character` | `character` | `character_public_id_seq` |
  | `models.WatchOrderList` | `watch_order_list` | `watch_order_list_public_id_seq` |

  Note `cartoons` and `games` and `movies` and `tv_shows` are plural table names; `anime`, `manga`, `novel`, `comic`, `collection`, `franchise`, `series`, `person`, `studio`, `publisher`, `character` are singular. Copy them from this table, do not guess.

- **`public_id` is never added to an RBAC field group.** It is needed to build a link to a page the viewer is already allowed to see. The gate in `app/services/rbac/field_gate.py` only strips columns explicitly listed in a group, so doing nothing is correct.
- **`public_id` rides in the Google Sheet.** It must NOT be added to any `drop_columns` in `app/services/pipelines/tabs.py`. An id that regenerated on Pull would silently change every URL when work moves between the company and home machines.
- **Tests build the schema with `Base.metadata.create_all`** (`tests/api/conftest.py:60`), not Alembic. This is why the sequence must be declared on the model with SQLAlchemy's `Sequence`, not only in the migration — otherwise the test database has a column with no default and every insert fails.
- **No back-compat for browser URLs.** A bare-UUID SPA URL is expected to 404 after this change. The API path params still accept a UUID, because internal callers use them.
- **Another session may be adding Alembic migrations concurrently.** Do not hardcode `down_revision` from this document — run `venv/Scripts/python.exe -m alembic heads` at implementation time and chain off whatever it reports (it was `pb2m3i4g5r8` when this plan was written).
- **Concurrent sessions:** stage only the exact files each task names. Never `git add -A`, never stage a directory pathspec. Run tests first, then `git add <exact files> && git commit` in one step.
- **Progress:** claim each task in `docs/PROGRESS.md` as `wip publicid-N` before starting and set it to `done <sha>` in the same commit as the work.

## Parallelisation

```
Task 1 (models + migration) ─┐
Task 2 (resolver util)       ├─> Task 4 (schemas) ─┐
Task 3 (frontend lib)        ┘                     ├─> Task 9 (routes + pages) ─> Task 10 (link sites) ─> Task 11 (docs)
                               Task 5 (factory)  ──┤
                               Task 6 (routers)  ──┤
                               Task 7 (parsers)  ──┤
                               Task 8 (setval)   ──┘
```

- **Tasks 1, 2 and 3 may run in parallel** — they touch disjoint files.
- **Tasks 4, 5, 6, 7, 8 may run in parallel** once Task 1 and Task 2 have landed.
- **Task 10 may be split across parallel workers** by directory; it names its own split.
- Everything else is sequential.

---

### Task 1: `public_id` column on all seventeen models + migration

**Files:**
- Modify: `app/models/anime.py`, `app/models/anime_movie.py`, `app/models/movie.py`, `app/models/tv_show.py`, `app/models/cartoon.py`, `app/models/manga.py`, `app/models/novel.py`, `app/models/comic.py`, `app/models/game.py`, `app/models/collection.py`, `app/models/franchise.py` (two classes), `app/models/staff.py` (three classes), `app/models/character.py` (one class), `app/models/watch_order.py` (one class)
- Create: `alembic/versions/pid1a2b3c4d5_add_public_id.py`
- Test: `tests/api/test_public_id.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `<Model>.public_id` — an `int` attribute on each of THE SEVENTEEN, unique within its table, assigned on insert without the caller supplying it.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_public_id.py`:

```python
"""public_id: the short, per-table sequential id that appears in SPA URLs."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models

# (model, kwargs sufficient to insert a bare row)
SEVENTEEN = [
    (models.Anime, {"anime_name_en": "PID Anime"}),
    (models.AnimeMovies, {"anime_movie_name_en": "PID Anime Movie"}),
    (models.Movies, {"movie_name_en": "PID Movie"}),
    (models.TVShows, {"tv_name_en": "PID TV"}),
    (models.Cartoon, {"cartoon_name_en": "PID Cartoon"}),
    (models.Manga, {"manga_name_en": "PID Manga"}),
    (models.Novel, {"novel_name_en": "PID Novel"}),
    (models.Comic, {"comic_name_en": "PID Comic"}),
    (models.Game, {"game_name_en": "PID Game"}),
    (models.Collection, {"collection_name_en": "PID Collection"}),
    (models.Franchise, {"franchise_name_en": "PID Franchise"}),
    (models.Series, {"series_name_en": "PID Series"}),
    (models.Person, {"name_en": "PID Person"}),
    (models.Studio, {"name_en": "PID Studio"}),
    (models.Publisher, {"name_en": "PID Publisher"}),
    (models.Character, {"name_en": "PID Character"}),
    (models.WatchOrderList, {"list_name": "PID Order"}),
]


@pytest.mark.parametrize("model,kwargs", SEVENTEEN, ids=lambda v: getattr(v, "__name__", ""))
def test_public_id_is_assigned_on_insert(db_session, model, kwargs):
    """An insert that never mentions public_id still gets one."""
    row = model(**kwargs)
    db_session.add(row)
    db_session.flush()
    assert isinstance(row.public_id, int)
    assert row.public_id > 0


@pytest.mark.parametrize("model,kwargs", SEVENTEEN, ids=lambda v: getattr(v, "__name__", ""))
def test_public_id_increases_and_is_unique(db_session, model, kwargs):
    first = model(**kwargs)
    second = model(**kwargs)
    db_session.add_all([first, second])
    db_session.flush()
    assert second.public_id > first.public_id


def test_public_id_rejects_a_duplicate(db_session):
    """The unique index is the guard that makes the id safe to put in a URL."""
    first = models.Anime(anime_name_en="PID Dup A")
    db_session.add(first)
    db_session.flush()

    second = models.Anime(anime_name_en="PID Dup B", public_id=first.public_id)
    db_session.add(second)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id.py -q`
Expected: FAIL — every test errors with `TypeError: 'public_id' is an invalid keyword argument` or `AttributeError`.

(If `db_session` is not the fixture name in `tests/api/conftest.py`, read that file and use the session fixture it actually provides. Do not invent a new fixture.)

- [ ] **Step 3: Add the column to each model**

In every model file, add `Integer` and `Sequence` to the existing `from sqlalchemy import ...` line if not already imported, then add this column immediately **after** the `system_id` column, substituting the sequence name from the THE SEVENTEEN table:

```python
    # Short, stable, per-table id that appears in SPA URLs
    # (/anime/47/fullmetal-alchemist-brotherhood). The UUID stays the join key
    # and never leaves the API; this is the only id a human ever sees. Backed by
    # a sequence rather than a Python default so that every insert path - the
    # Add forms, Pull, Replace, a test fixture - gets one without knowing the
    # column exists.
    public_id = Column(
        Integer, Sequence("anime_public_id_seq"), nullable=False, unique=True
    )
```

Repeat for all seventeen classes. `app/models/franchise.py` needs it on both `Franchise` and `Series`; `app/models/staff.py` on `Person`, `Studio` and `Publisher` (NOT on `PersonRole` or `PublisherScope`); `app/models/character.py` only on `Character` (NOT `CharacterCasting`); `app/models/watch_order.py` only on `WatchOrderList` (NOT `WatchOrderItem` or `WatchOrderSection`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id.py -q`
Expected: PASS, 35 tests.

The test database is rebuilt from the models by `create_all`, so no migration is needed for the tests to go green. The migration in the next step is what makes the change work on a real database.

- [ ] **Step 5: Write the migration**

Find the current head first:

```bash
venv/Scripts/python.exe -m alembic heads
```

Create `alembic/versions/pid1a2b3c4d5_add_public_id.py`, putting the reported head in `down_revision`:

```python
"""Add public_id to every entity with a detail page.

The SPA used to address detail pages by raw UUID. public_id is the short,
per-table sequential id that replaces it in the URL; the UUID stays the join
key. Backfilled in creation order so the numbering matches the order entries
were added, and is reproducible if this ever has to be rerun from scratch.
"""

from alembic import op
import sqlalchemy as sa

revision = "pid1a2b3c4d5"
down_revision = "pb2m3i4g5r8"  # replace with the output of `alembic heads`
branch_labels = None
depends_on = None

TABLES = (
    "anime",
    "anime_movies",
    "movies",
    "tv_shows",
    "cartoons",
    "manga",
    "novel",
    "comic",
    "games",
    "collection",
    "franchise",
    "series",
    "person",
    "studio",
    "publisher",
    "character",
    "watch_order_list",
)


def upgrade():
    for table in TABLES:
        seq = f"{table}_public_id_seq"
        # 1. Nullable first: the table already has rows with no value.
        op.add_column(table, sa.Column("public_id", sa.Integer(), nullable=True))
        # 2. Backfill in creation order. created_at is nullable on the entity
        #    tables, so NULLS LAST keeps stamp-less rows at the end instead of
        #    at the front, and system_id breaks ties so the result is stable.
        op.execute(
            f"""
            WITH numbered AS (
                SELECT system_id,
                       ROW_NUMBER() OVER (
                           ORDER BY created_at ASC NULLS LAST, system_id ASC
                       ) AS rn
                  FROM "{table}"
            )
            UPDATE "{table}" AS t
               SET public_id = numbered.rn
              FROM numbered
             WHERE t.system_id = numbered.system_id
            """
        )
        # 3. Sequence, positioned past the backfill. COALESCE covers an empty
        #    table, where max() is NULL and setval would fail.
        op.execute(f'CREATE SEQUENCE "{seq}"')
        op.execute(
            f'SELECT setval(\'"{seq}"\', COALESCE((SELECT MAX(public_id) FROM "{table}"), 0) + 1, false)'
        )
        op.execute(f'ALTER TABLE "{table}" ALTER COLUMN public_id SET DEFAULT nextval(\'"{seq}"\')')
        # 4. Lock it down.
        op.alter_column(table, "public_id", nullable=False)
        op.create_unique_constraint(f"uq_{table}_public_id", table, ["public_id"])


def downgrade():
    for table in TABLES:
        op.drop_constraint(f"uq_{table}_public_id", table, type_="unique")
        op.drop_column(table, "public_id")
        op.execute(f'DROP SEQUENCE IF EXISTS "{table}_public_id_seq"')
```

- [ ] **Step 6: Run the migration against the dev database**

```bash
venv/Scripts/python.exe -m alembic upgrade head
```

Expected: completes with no error, and `alembic heads` reports a single head `pid1a2b3c4d5`.

Then confirm the backfill and the sequence agree — replace `<user>`/`<db>` with your local values from `.env`:

```bash
psql -U postgres -d anime_site -c "SELECT min(public_id), max(public_id), count(*), count(DISTINCT public_id) FROM anime;"
psql -U postgres -d anime_site -c "SELECT last_value FROM anime_public_id_seq;"
```

Expected: `min = 1`, `max = count = count(DISTINCT public_id)` (contiguous, no duplicates), and `last_value > max`.

- [ ] **Step 7: Run the full backend suite and lint**

```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```

Expected: both green. A failure here is almost certainly a fixture that inserts a row with an explicit `public_id`, or a model file missing the `Integer`/`Sequence` import.

- [ ] **Step 8: Commit**

```bash
git add tests/api/test_public_id.py alembic/versions/pid1a2b3c4d5_add_public_id.py app/models/anime.py app/models/anime_movie.py app/models/movie.py app/models/tv_show.py app/models/cartoon.py app/models/manga.py app/models/novel.py app/models/comic.py app/models/game.py app/models/collection.py app/models/franchise.py app/models/staff.py app/models/character.py app/models/watch_order.py docs/PROGRESS.md
git commit -m "feat(urls): add public_id to every entity with a detail page"
```

---

### Task 2: Shared entity-reference resolver

**Files:**
- Create: `app/utils/entity_ref.py`
- Test: `tests/unit/test_entity_ref.py`

**Interfaces:**
- Consumes: `<Model>.public_id` from Task 1.
- Produces:
  - `parse_entity_ref(ref: str) -> tuple[str, object]` — returns `("public_id", int)` or `("system_id", UUID)`; raises `ValueError` for anything else.
  - `entity_ref_filter(model, ref: str)` — returns a SQLAlchemy boolean clause matching that row, e.g. `model.public_id == 47`. Raises `ValueError` for an unparseable ref.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_entity_ref.py`:

```python
"""Parsing the id in a detail-page URL: a public_id integer or a UUID."""

import uuid

import pytest

from app.utils.entity_ref import entity_ref_filter, parse_entity_ref
from app import models


def test_a_plain_integer_is_a_public_id():
    assert parse_entity_ref("47") == ("public_id", 47)


def test_a_uuid_is_a_system_id():
    raw = "3f8b0c2a-9d1e-4c7b-a0f2-1d4e7f905b3c"
    kind, value = parse_entity_ref(raw)
    assert kind == "system_id"
    assert value == uuid.UUID(raw)


@pytest.mark.parametrize("bad", ["", "  ", "abc", "-1", "0", "1.5", "47x", "1e3"])
def test_junk_is_rejected(bad):
    """A public_id is a positive integer; anything else must 404, not 500."""
    with pytest.raises(ValueError):
        parse_entity_ref(bad)


def test_filter_targets_public_id_for_an_integer():
    clause = entity_ref_filter(models.Anime, "47")
    assert "public_id" in str(clause)


def test_filter_targets_system_id_for_a_uuid():
    clause = entity_ref_filter(models.Anime, "3f8b0c2a-9d1e-4c7b-a0f2-1d4e7f905b3c")
    assert "system_id" in str(clause)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_entity_ref.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.entity_ref'`.

- [ ] **Step 3: Write the implementation**

Create `app/utils/entity_ref.py`:

```python
"""
Resolving the id segment of a detail-page URL.

The SPA addresses detail pages by public_id (/anime/47/...), but every internal
caller still holds a UUID, and the same endpoint serves both. One parser decides
which it is, so the seventeen routers cannot drift apart in what they accept.

A public_id is a positive decimal integer with no sign, no separators and no
exponent - deliberately stricter than int(), which happily reads " 47 " and
"+47" and would let two spellings of the same URL exist.
"""

import re
import uuid

_POSITIVE_INT = re.compile(r"^[1-9][0-9]*$")


def parse_entity_ref(ref: str) -> tuple[str, object]:
    """('public_id', int) or ('system_id', UUID). Raises ValueError otherwise."""
    if not isinstance(ref, str):
        raise ValueError("entity reference must be a string")
    if _POSITIVE_INT.match(ref):
        return "public_id", int(ref)
    try:
        return "system_id", uuid.UUID(ref)
    except (ValueError, AttributeError, TypeError):
        raise ValueError(f"not a public_id or a system_id: {ref!r}")


def entity_ref_filter(model, ref: str):
    """A SQLAlchemy clause selecting the row this reference names."""
    kind, value = parse_entity_ref(ref)
    return getattr(model, kind) == value
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_entity_ref.py -q`
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint and commit**

```bash
venv/Scripts/ruff.exe check app/utils/entity_ref.py tests/unit/test_entity_ref.py
git add app/utils/entity_ref.py tests/unit/test_entity_ref.py docs/PROGRESS.md
git commit -m "feat(urls): add the public_id / system_id reference parser"
```

---

### Task 3: Frontend slug and path helpers

**Files:**
- Create: `frontend/src/lib/entityPath.js`
- Test: `frontend/src/lib/entityPath.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `slugify(text: string) -> string` — ASCII slug, `""` when nothing survives.
  - `entitySlug(type: string, entity: object) -> string` — the Latin-first slug for an entity, `""` if it has no Latin name.
  - `entityPath(type: string, entity: object) -> string` — `/anime/47/slug`, or `/anime/47` with no slug, or `""` when `entity` has no `public_id`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/entityPath.test.js`:

```js
import { describe, expect, it } from "vitest";
import { entityPath, entitySlug, slugify } from "./entityPath";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Fullmetal Alchemist: Brotherhood")).toBe(
      "fullmetal-alchemist-brotherhood",
    );
  });

  it("folds accents to ASCII", () => {
    expect(slugify("Pokémon Café")).toBe("pokemon-cafe");
  });

  it("collapses runs of punctuation and trims the edges", () => {
    expect(slugify("  --K-On!!  ")).toBe("k-on");
  });

  it("returns empty for text with no Latin characters", () => {
    expect(slugify("钢之炼金术师")).toBe("");
  });

  it("truncates long titles at a hyphen boundary", () => {
    const long = "the melancholy of haruhi suzumiya the disappearance edition";
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("-")).toBe(false);
    expect(long.startsWith(out)).toBe(true);
  });

  it("survives null and undefined", () => {
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
});

describe("entitySlug", () => {
  it("prefers the English name over the Chinese one", () => {
    const anime = {
      anime_name_cn: "钢之炼金术师",
      anime_name_en: "Fullmetal Alchemist",
    };
    expect(entitySlug("anime", anime)).toBe("fullmetal-alchemist");
  });

  it("falls back to roman, then alt", () => {
    expect(entitySlug("anime", { anime_name_roman: "Hagane no Renkinjutsushi" })).toBe(
      "hagane-no-renkinjutsushi",
    );
    expect(entitySlug("anime", { anime_name_alt: "FMA" })).toBe("fma");
  });

  it("is empty when only a Chinese name exists", () => {
    expect(entitySlug("anime", { anime_name_cn: "钢之炼金术师" })).toBe("");
  });

  it("knows the irregular prefixes", () => {
    expect(entitySlug("anime-movie", { anime_movie_name_en: "Your Name" })).toBe("your-name");
    expect(entitySlug("tv-show", { tv_name_en: "Breaking Bad" })).toBe("breaking-bad");
  });

  it("uses the bare name columns for entity types", () => {
    expect(entitySlug("person", { name_en: "Hiroshi Kamiya" })).toBe("hiroshi-kamiya");
    expect(entitySlug("studio", { name_en: "Studio Bones" })).toBe("studio-bones");
  });

  it("uses list_name for a watch order", () => {
    expect(entitySlug("watch-order", { list_name: "Release Order" })).toBe("release-order");
  });
});

describe("entityPath", () => {
  it("builds id and slug", () => {
    const anime = { public_id: 47, anime_name_en: "Fullmetal Alchemist" };
    expect(entityPath("anime", anime)).toBe("/anime/47/fullmetal-alchemist");
  });

  it("omits the slug when there is no Latin name", () => {
    expect(entityPath("anime", { public_id: 93, anime_name_cn: "钢之炼金术师" })).toBe(
      "/anime/93",
    );
  });

  it("returns empty when the entity has no public_id, so callers can skip the link", () => {
    expect(entityPath("anime", { anime_name_en: "Nameless" })).toBe("");
    expect(entityPath("anime", null)).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/entityPath.test.js`
Expected: FAIL — cannot resolve `./entityPath`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/entityPath.js`:

```js
// Frontend: the one place that knows the shape of a detail-page URL.
//
// URLs are /<type>/<public_id>/<slug>. The slug is decorative - the router and
// the API both ignore it - so it can be derived on the fly and never goes
// stale when a title is edited.
//
// The slug deliberately does NOT use getDisplayName(), which leads with the
// Chinese name for every type but comic. A CJK slug percent-encodes to mush
// the moment it is copied out of the address bar, so the URL prefers Latin
// script and simply omits the slug when there is none. The UI still shows the
// CN name everywhere else.

const MAX_SLUG_LENGTH = 60;

// Route type -> name-column prefix. Mirrors getDisplayName in ./naming.js;
// only anime-movie and tv-show are irregular.
function namePrefix(type) {
  if (type === "anime-movie") return "anime_movie";
  if (type === "tv-show") return "tv";
  return type;
}

export function slugify(text) {
  if (!text) return "";
  const ascii = String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining marks left behind by NFKD
    .replace(/[^\x20-\x7E]/g, " "); // anything still non-ASCII, incl. CJK
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-$/, "");
}

export function entitySlug(type, entity) {
  if (!entity) return "";
  const prefix = namePrefix(type);
  const candidates = [
    entity[`${prefix}_name_en`],
    entity[`${prefix}_name_roman`],
    entity[`${prefix}_name_alt`],
    entity.name_en, // person, studio, publisher, character
    entity.name_alt,
    entity.list_name, // watch order
  ];
  for (const candidate of candidates) {
    const slug = slugify(candidate);
    if (slug) return slug;
  }
  return "";
}

export function entityPath(type, entity) {
  if (!entity || entity.public_id == null) return "";
  const slug = entitySlug(type, entity);
  return slug ? `/${type}/${entity.public_id}/${slug}` : `/${type}/${entity.public_id}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/entityPath.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/lib/entityPath.js frontend/src/lib/entityPath.test.js docs/PROGRESS.md
git commit -m "feat(urls): add the slug and detail-path helpers"
```

---

### Task 4: `public_id` on the response schemas

**Files:**
- Modify: `app/schemas/anime.py`, `app/schemas/anime_movie.py`, `app/schemas/movie.py`, `app/schemas/tv_show.py`, `app/schemas/cartoon.py`, `app/schemas/manga.py`, `app/schemas/novel.py`, `app/schemas/comic.py`, `app/schemas/game.py`, `app/schemas/collection.py`, `app/schemas/franchise.py`, `app/schemas/staff.py`, `app/schemas/character.py`, `app/schemas/watch_order.py`
- Test: `tests/api/test_public_id_api.py`

**Interfaces:**
- Consumes: `<Model>.public_id` from Task 1.
- Produces: `public_id: int` on `AnimeResponse`, `AnimeMovieResponse`, `MovieResponse`, `TVShowResponse`, `CartoonResponse`, `MangaResponse`, `NovelResponse`, `ComicResponse`, `GameResponse`, `CollectionResponse`, `FranchiseResponse`, `SeriesResponse`, `PersonResponse`, `StudioResponse`, `PublisherResponse`, `CharacterResponse`, `WatchOrderListResponse`.

Read each file to confirm the exact response-class name before editing; the list above is the expected set but the file is the authority.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_public_id_api.py`:

```python
"""public_id must reach the client: without it no link can be built."""

import pytest

# (api path segment, factory-fixture kwargs) for one representative per family.
LIST_ENDPOINTS = [
    "/api/anime/",
    "/api/collection/",
    "/api/franchise/",
    "/api/person/",
    "/api/studio/",
    "/api/character/",
]


@pytest.mark.parametrize("path", LIST_ENDPOINTS)
def test_list_endpoints_expose_public_id(client, seeded_entities, path):
    response = client.get(path)
    assert response.status_code == 200
    rows = response.json()
    assert rows, f"{path} returned no rows; the seed fixture did not cover it"
    for row in rows:
        assert isinstance(row["public_id"], int)


def test_public_id_survives_the_narrowest_role(client, guest_client, seeded_entities):
    """RBAC gates fields by explicit group; public_id is in none, so a guest
    still gets the id needed to link to a page they may open."""
    response = guest_client.get("/api/anime/")
    assert response.status_code == 200
    for row in response.json():
        assert isinstance(row["public_id"], int)
```

Before running this, read `tests/api/conftest.py` and use the fixture names it actually defines for an authenticated client, a guest client, and seeded data. If no seeding fixture exists that covers these endpoints, create the rows inline in the test with the session fixture instead of inventing a fixture — the assertion that matters is `public_id` in the payload.

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_api.py -q`
Expected: FAIL with `KeyError: 'public_id'` — the column exists but the response schema drops it.

- [ ] **Step 3: Add the field to each response schema**

Beside the existing `system_id` line in each response class:

```python
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_api.py -q`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: green. A `ValidationError` about a missing `public_id` means a test builds a response schema from a dict rather than an ORM row — add `public_id` to that fixture's dict.

- [ ] **Step 6: Commit**

```bash
git add tests/api/test_public_id_api.py app/schemas/anime.py app/schemas/anime_movie.py app/schemas/movie.py app/schemas/tv_show.py app/schemas/cartoon.py app/schemas/manga.py app/schemas/novel.py app/schemas/comic.py app/schemas/game.py app/schemas/collection.py app/schemas/franchise.py app/schemas/staff.py app/schemas/character.py app/schemas/watch_order.py docs/PROGRESS.md
git commit -m "feat(urls): expose public_id on the entity responses"
```

---

### Task 5: The media router factory resolves a public_id

**Files:**
- Modify: `app/routers/_factory.py:43-50`
- Test: `tests/api/test_public_id_lookup.py`

**Interfaces:**
- Consumes: `entity_ref_filter` from Task 2.
- Produces: `GET /api/<media type>/{ref}` accepting either a `public_id` integer or a `system_id` UUID, for all nine media types.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_public_id_lookup.py`:

```python
"""Fetching a detail page by the id that appears in its URL."""

import pytest

MEDIA_PATHS = [
    "/api/anime",
    "/api/anime-movie",
    "/api/movie",
    "/api/tv-show",
    "/api/cartoon",
    "/api/manga",
    "/api/novel",
    "/api/comic",
    "/api/game",
]


@pytest.mark.parametrize("base", MEDIA_PATHS)
def test_fetch_by_public_id_matches_fetch_by_system_id(client, media_entry_for, base):
    entry = media_entry_for(base)
    by_uuid = client.get(f"{base}/{entry['system_id']}")
    by_public = client.get(f"{base}/{entry['public_id']}")
    assert by_uuid.status_code == 200
    assert by_public.status_code == 200
    assert by_public.json()["system_id"] == by_uuid.json()["system_id"]


@pytest.mark.parametrize("base", MEDIA_PATHS)
def test_unknown_public_id_is_a_404(client, base):
    assert client.get(f"{base}/99999999").status_code == 404


@pytest.mark.parametrize("base", MEDIA_PATHS)
def test_junk_ref_is_a_404_not_a_500(client, base):
    """A hand-mangled URL must not reach the database layer."""
    assert client.get(f"{base}/not-an-id").status_code == 404


def test_hidden_entry_404s_by_public_id_with_the_same_message(
    client, guest_client, labelled_hidden_anime
):
    """A hidden entry must be indistinguishable from one that never existed,
    whichever id is used - otherwise public_id becomes an existence oracle."""
    hidden = labelled_hidden_anime
    missing = guest_client.get("/api/anime/99999999")
    hidden_response = guest_client.get(f"/api/anime/{hidden['public_id']}")
    assert hidden_response.status_code == 404
    assert hidden_response.json()["detail"] == missing.json()["detail"]
```

`media_entry_for` and `labelled_hidden_anime` are fixtures this task must add to `tests/api/conftest.py` if they do not already exist. `media_entry_for(base)` creates one entry of the type that `base` serves and returns its response dict; `labelled_hidden_anime` creates an anime carrying a content label the guest role cannot see. Read `tests/api/test_field_gating.py` and `tests/api/test_media_type_gating.py` first — they already build hidden entries and the pattern should be copied, not reinvented.

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_lookup.py -q`
Expected: FAIL — fetching by `public_id` 404s, because `_get_or_404` compares the integer against `system_id`.

- [ ] **Step 3: Change `_get_or_404`**

In `app/routers/_factory.py`, replace the body of `_get_or_404`:

```python
    def _get_or_404(db: Session, entry_id: str, viewer=None):
        # The SPA addresses entries by public_id (/anime/47/...); internal
        # callers still hold UUIDs. One parser decides which this is, and a
        # reference that is neither is a 404, never a 500 - a hand-mangled URL
        # must not reach the database layer.
        try:
            ref = entity_ref_filter(spec.model, str(entry_id))
        except ValueError:
            raise HTTPException(status_code=404, detail=not_found)
        entry = db.query(spec.model).filter(ref).first()
        if not entry:
            raise HTTPException(status_code=404, detail=not_found)
        # Same message either way: a hidden entry must be indistinguishable
        # from one that was never there.
        if not entry_visible(db, viewer, spec.owner_type, entry.system_id):
            raise HTTPException(status_code=404, detail=not_found)
        return entry
```

and add the import beside the other `app.utils` import:

```python
from app.utils.entity_ref import entity_ref_filter
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_lookup.py -q`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: green. Watch `tests/api/test_media_crud.py` and `tests/api/test_anime_via_factory.py` in particular — they exercise this function hardest.

- [ ] **Step 6: Commit**

```bash
git add app/routers/_factory.py tests/api/test_public_id_lookup.py tests/api/conftest.py docs/PROGRESS.md
git commit -m "feat(urls): resolve media entries by public_id"
```

---

### Task 6: The eight hand-written routers resolve a public_id

**Files:**
- Modify: `app/routers/collection.py:68-82`, `app/routers/franchise.py` (the `/{system_id}` GET), `app/routers/series.py:65+`, `app/routers/studio.py:83-95`, `app/routers/publisher.py:101+`, `app/routers/person.py:142+`, `app/routers/character.py:70+`, `app/routers/watch_order.py` (the single-list GET)
- Test: `tests/api/test_public_id_lookup_entities.py`

**Interfaces:**
- Consumes: `entity_ref_filter` from Task 2.
- Produces: `GET /api/collection/{ref}`, `/api/franchise/{ref}`, `/api/series/{ref}`, `/api/studio/{ref}`, `/api/publisher/{ref}`, `/api/person/{ref}`, `/api/character/{ref}` and the watch-order list GET, each accepting a `public_id` integer or a `system_id` UUID.

**Important:** several of these type the path parameter as `UUID`, so FastAPI rejects `47` with a 422 before the handler runs. Every one of them must change the annotation to `str` and resolve explicitly. The nested `/{system_id}/entries` routes are NOT in scope — the SPA calls those with the UUID it got back from the detail fetch, and they keep their `UUID` annotation.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_public_id_lookup_entities.py`:

```python
"""The non-media detail endpoints accept the same two id forms."""

import pytest

ENTITY_PATHS = [
    "/api/collection",
    "/api/franchise",
    "/api/series",
    "/api/studio",
    "/api/publisher",
    "/api/person",
    "/api/character",
]


@pytest.mark.parametrize("base", ENTITY_PATHS)
def test_fetch_by_public_id_matches_fetch_by_system_id(client, entity_for, base):
    entity = entity_for(base)
    by_uuid = client.get(f"{base}/{entity['system_id']}")
    by_public = client.get(f"{base}/{entity['public_id']}")
    assert by_uuid.status_code == 200
    assert by_public.status_code == 200
    assert by_public.json()["system_id"] == by_uuid.json()["system_id"]


@pytest.mark.parametrize("base", ENTITY_PATHS)
def test_unknown_public_id_is_a_404(client, base):
    assert client.get(f"{base}/99999999").status_code == 404


@pytest.mark.parametrize("base", ENTITY_PATHS)
def test_junk_ref_is_a_404_not_a_422(client, base):
    """These endpoints used to annotate the param as UUID, which 422s. A
    detail URL that does not resolve is a missing page, not a bad request."""
    assert client.get(f"{base}/not-an-id").status_code == 404
```

`entity_for(base)` is a fixture this task adds to `tests/api/conftest.py`: it creates one row of the type that `base` serves and returns the response dict. Add the watch-order case to this file too once you have read `app/routers/watch_order.py` and know the exact list path (it is under `/api/watch-order/lists/{...}`, not `/api/watch-order/{...}`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_lookup_entities.py -q`
Expected: FAIL — 404 or 422 when fetching by `public_id`.

- [ ] **Step 3: Change each handler**

The pattern, shown for `app/routers/collection.py`:

```python
def get_collection_by_id(system_id: str, db: Session = Depends(get_db)):
    """Retrieves a single collection by its public_id or its UUID."""
    try:
        ref = entity_ref_filter(models.Collection, system_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Collection not found.")
    db_collection = db.query(models.Collection).filter(ref).first()
    if not db_collection:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return db_collection
```

For the handlers that currently use `db.get(models.Studio, system_id)` (studio, and any other using `db.get`), the equivalent is:

```python
def get_studio_by_id(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single studio by its public_id or its UUID."""
    try:
        ref = entity_ref_filter(models.Studio, system_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Studio not found.")
    studio = db.query(models.Studio).filter(ref).first()
    if studio is None:
        raise HTTPException(status_code=404, detail="Studio not found.")
    return _to_response(db, studio, viewer)
```

Add `from app.utils.entity_ref import entity_ref_filter` to each file. Keep each router's existing 404 message verbatim — the tests elsewhere assert on them.

Leave the parameter *named* `system_id` so no caller or test breaks on a keyword; only its annotation and meaning widen.

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_lookup_entities.py -q`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: green. `tests/api/test_collection.py`, `test_franchise.py`, `test_character_router.py` and `test_casting_router.py` cover these routers.

- [ ] **Step 6: Commit**

```bash
git add app/routers/collection.py app/routers/franchise.py app/routers/series.py app/routers/studio.py app/routers/publisher.py app/routers/person.py app/routers/character.py app/routers/watch_order.py tests/api/test_public_id_lookup_entities.py tests/api/conftest.py docs/PROGRESS.md
git commit -m "feat(urls): resolve entity detail endpoints by public_id"
```

---

### Task 7: `public_id` survives the Google Sheets round trip

**Files:**
- Modify: `app/utils/formatter.py` (the seventeen `parse_*_from_sheet` functions)
- Test: `tests/api/test_public_id_sheets.py`

**Interfaces:**
- Consumes: `<Model>.public_id` from Task 1.
- Produces: `parse_*_from_sheet` emitting `public_id` when the sheet has the column, and omitting the key entirely when it does not.

The parsers to touch: `parse_anime_from_sheet`, `parse_anime_movie_from_sheet`, `parse_movie_from_sheet`, `parse_tv_show_from_sheet`, `parse_cartoon_from_sheet`, `parse_manga_from_sheet`, `parse_novel_from_sheet`, `parse_comic_from_sheet`, `parse_game_from_sheet`, `parse_collection_from_sheet`, `parse_franchise_from_sheet`, `parse_series_from_sheet`, `parse_person_from_sheet`, `parse_studio_from_sheet`, `parse_publisher_from_sheet`, `parse_character_from_sheet`, `parse_watch_order_list_from_sheet`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_public_id_sheets.py`:

```python
"""public_id must ride in the sheet.

An id regenerated on Pull would silently change every URL when work moves
between the company and home machines, so the column is backed up like any
other and restored unchanged.
"""

from app.services.pipelines.tabs import SHEET_TABS, TAB_PARSERS

PUBLIC_ID_TABS = {
    "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons", "Manga",
    "Novel", "Comic", "Game", "Collection", "Franchise", "Series",
    "Person", "Studio", "Publisher", "Character", "Watch Order List",
}


def test_public_id_is_never_dropped_from_a_tab():
    """drop_columns is how a column is kept out of the sheet; public_id must
    not be in any of them."""
    for tab in SHEET_TABS:
        assert "public_id" not in (tab.drop_columns or ()), tab.name


def test_every_public_id_tab_has_the_column_in_its_backup_header():
    """Backup derives headers from __table__.columns, so this is really a
    check that the column landed on the model."""
    by_name = {tab.name: tab for tab in SHEET_TABS}
    for name in PUBLIC_ID_TABS:
        tab = by_name[name]
        columns = {c.name for c in tab.model.__table__.columns}
        assert "public_id" in columns, name


def test_parsers_carry_public_id_through():
    for name in PUBLIC_ID_TABS:
        parser = TAB_PARSERS[name]
        parsed = parser({"public_id": "47"})
        assert parsed.get("public_id") == 47, name


def test_parsers_omit_public_id_when_the_sheet_predates_the_column():
    """A sheet written before this change has no public_id column. Restoring
    it must fall through to the sequence default, not write a NULL."""
    for name in PUBLIC_ID_TABS:
        parser = TAB_PARSERS[name]
        parsed = parser({})
        assert "public_id" not in parsed, name
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_sheets.py -q`
Expected: `test_parsers_carry_public_id_through` FAILS — the parsers are explicit whitelists and drop the key.

- [ ] **Step 3: Add a shared emitter and use it in each parser**

At the top of the parser section of `app/utils/formatter.py`:

```python
def _public_id_from_sheet(raw: dict) -> dict:
    """
    Emitted only when the sheet actually has the column.

    A sheet written before public_id existed has no such column; emitting the
    key anyway would set public_id = None and fail the NOT NULL constraint,
    where omitting it lets the table's sequence supply one. The same reason
    the collection parser guards no_built_in_orders.
    """
    if "public_id" not in raw:
        return {}
    value = parse_from_sheet(raw.get("public_id"), int)
    return {"public_id": value} if value is not None else {}
```

Then in each of the seventeen parsers, after the `parsed = {...}` literal and before the return:

```python
    parsed.update(_public_id_from_sheet(raw))
```

Follow whatever each function already does — several build `parsed` then conditionally update it, so append to that existing block rather than restructuring the function.

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_sheets.py -q`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: green. `tests/api/test_data_control_pull_tab.py` and `tests/api/test_credits_sheets.py` are the closest neighbours.

- [ ] **Step 6: Commit**

```bash
git add app/utils/formatter.py tests/api/test_public_id_sheets.py docs/PROGRESS.md
git commit -m "feat(urls): carry public_id through the sheet round trip"
```

---

### Task 8: Pull advances each sequence past the restored ids

**Files:**
- Modify: `app/services/pipelines/pull.py` (after each tab's rows are written)
- Test: `tests/api/test_public_id_sequence_reset.py`

**Interfaces:**
- Consumes: `<Model>.public_id` from Task 1, the parsers from Task 7.
- Produces: `resync_public_id_sequence(db, model) -> None` in `app/services/pipelines/pull.py`, called once per restored tab whose model has a `public_id`.

This is the failure that bites a week later rather than at restore time: after a Pull the sequence still sits wherever the local database left it, so the *next* entry added fails on the unique index with a message that says nothing about Pull.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_public_id_sequence_reset.py`:

```python
"""After a Pull, the next insert must not collide with a restored public_id."""

from app import models
from app.services.pipelines.pull import resync_public_id_sequence


def test_insert_after_a_higher_restored_id_does_not_collide(db_session):
    """Simulates the shape of a Pull: rows arrive carrying their own ids,
    above whatever the local sequence had reached."""
    restored = models.Anime(anime_name_en="PID Restored", public_id=9000)
    db_session.add(restored)
    db_session.flush()

    resync_public_id_sequence(db_session, models.Anime)

    fresh = models.Anime(anime_name_en="PID Fresh")
    db_session.add(fresh)
    db_session.flush()
    assert fresh.public_id > 9000


def test_resync_is_safe_on_an_empty_table(db_session):
    """setval on max(NULL) would error; an empty table must be a no-op."""
    db_session.query(models.WatchOrderList).delete()
    db_session.flush()
    resync_public_id_sequence(db_session, models.WatchOrderList)

    row = models.WatchOrderList(list_name="PID First")
    db_session.add(row)
    db_session.flush()
    assert row.public_id > 0


def test_resync_ignores_a_model_without_public_id(db_session):
    """Pull walks every tab; the ones with no public_id must not error."""
    resync_public_id_sequence(db_session, models.MediaRelation)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_sequence_reset.py -q`
Expected: FAIL — `ImportError: cannot import name 'resync_public_id_sequence'`.

- [ ] **Step 3: Write the implementation**

Add to `app/services/pipelines/pull.py`:

```python
from sqlalchemy import text


def resync_public_id_sequence(db, model) -> None:
    """
    Move a table's public_id sequence past the ids the restore just wrote.

    Pull inserts rows carrying their own public_id from the sheet, which the
    sequence knows nothing about. Left alone it keeps handing out values the
    restore already used, and the failure surfaces later - on the next entry
    an admin adds - as a unique-constraint error that says nothing about Pull.

    A no-op for tables with no public_id, because Pull walks every tab.
    """
    column = model.__table__.columns.get("public_id")
    if column is None:
        return
    table = model.__table__.name
    sequence = f"{table}_public_id_seq"
    # COALESCE covers an empty table: max() is NULL there and setval would
    # fail. is_called=false makes the next nextval return exactly this value.
    db.execute(
        text(
            f'SELECT setval(\'"{sequence}"\','
            f' COALESCE((SELECT MAX(public_id) FROM "{table}"), 0) + 1, false)'
        )
    )
```

Then call it once per tab in the Pull loop, after that tab's rows are committed and before moving to the next tab. Read the loop first and place the call where the tab's writes are known to be flushed — a `setval` run before the rows land would read a stale maximum.

- [ ] **Step 4: Run the test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_public_id_sequence_reset.py -q`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add app/services/pipelines/pull.py tests/api/test_public_id_sequence_reset.py docs/PROGRESS.md
git commit -m "fix(pull): advance public_id sequences past restored ids"
```

---

### Task 9: Routes and detail pages read `publicId`

**Files:**
- Modify: `frontend/src/App.jsx:126-145`
- Create: `frontend/src/hooks/useCanonicalPath.js`
- Modify: `frontend/src/pages/detail/Anime.jsx`, `AnimeMovie.jsx`, `Movie.jsx`, `TV.jsx`, `Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx`, `Game.jsx`, `CollectionPage.jsx`, `FranchisePage.jsx`, `SeriesPage.jsx`, `Studio.jsx`, `Publisher.jsx`, `Person.jsx`, `Character.jsx`, `WatchOrder.jsx`
- Test: `frontend/src/hooks/useCanonicalPath.test.jsx`

**Interfaces:**
- Consumes: `entityPath` from Task 3; `public_id` in API responses from Task 4; `public_id` lookup from Tasks 5 and 6.
- Produces: `useCanonicalPath(type, entity)` — a hook that rewrites the address bar to the canonical path once the entity loads.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useCanonicalPath.test.jsx`:

```jsx
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useCanonicalPath } from "./useCanonicalPath";

function Probe({ entity, seen }) {
  useCanonicalPath("anime", entity);
  const location = useLocation();
  seen.current = location.pathname;
  return null;
}

function renderAt(path, entity) {
  const seen = { current: null };
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/anime/:publicId/:slug?" element={<Probe entity={entity} seen={seen} />} />
      </Routes>
    </MemoryRouter>,
  );
  return seen;
}

const ANIME = { public_id: 47, anime_name_en: "Fullmetal Alchemist" };

describe("useCanonicalPath", () => {
  it("adds the slug when the URL has none", () => {
    const seen = renderAt("/anime/47", ANIME);
    expect(seen.current).toBe("/anime/47/fullmetal-alchemist");
  });

  it("replaces a stale slug after a rename", () => {
    const seen = renderAt("/anime/47/old-title", ANIME);
    expect(seen.current).toBe("/anime/47/fullmetal-alchemist");
  });

  it("leaves an already-canonical path alone", () => {
    const seen = renderAt("/anime/47/fullmetal-alchemist", ANIME);
    expect(seen.current).toBe("/anime/47/fullmetal-alchemist");
  });

  it("does nothing while the entity is still loading", () => {
    const seen = renderAt("/anime/47", null);
    expect(seen.current).toBe("/anime/47");
  });

  it("does nothing for an entity with no Latin name", () => {
    const seen = renderAt("/anime/93", { public_id: 93, anime_name_cn: "钢之炼金术师" });
    expect(seen.current).toBe("/anime/93");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/useCanonicalPath.test.jsx`
Expected: FAIL — cannot resolve `./useCanonicalPath`.

- [ ] **Step 3: Write the hook**

Create `frontend/src/hooks/useCanonicalPath.js`:

```js
// Frontend: keeps the address bar showing the canonical /type/id/slug path.
//
// The slug is decorative and never read, so a stale one after a rename is
// harmless - but it should not stay in the bar. replaceState rather than
// navigate: this is a cosmetic correction, not a navigation, and it must not
// add a history entry the back button has to walk through.
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { entityPath } from "../lib/entityPath";

export function useCanonicalPath(type, entity) {
  const location = useLocation();
  const navigate = useNavigate();
  const canonical = entityPath(type, entity);

  useEffect(() => {
    if (!canonical) return;
    if (location.pathname === canonical) return;
    navigate(canonical + location.search + location.hash, { replace: true });
  }, [canonical, location.pathname, location.search, location.hash, navigate]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/useCanonicalPath.test.jsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Widen the routes**

In `frontend/src/App.jsx`, give every detail route an optional slug segment and rename the param. For example:

```jsx
<Route path="/anime/:publicId/:slug?" element={<Anime />} />
<Route path="/anime-movie/:publicId/:slug?" element={<AnimeMovie />} />
<Route path="/movie/:publicId/:slug?" element={<Movie />} />
<Route path="/tv-show/:publicId/:slug?" element={<TV />} />
<Route path="/cartoon/:publicId/:slug?" element={<Cartoon />} />
<Route path="/manga/:publicId/:slug?" element={<Manga />} />
<Route path="/novel/:publicId/:slug?" element={<Novel />} />
<Route path="/comic/:publicId/:slug?" element={<Comic />} />
<Route path="/game/:publicId/:slug?" element={<Game />} />
<Route path="/collection/:publicId/:slug?" element={<Collection />} />
<Route path="/franchise/:publicId/:slug?" element={<Franchise />} />
<Route path="/series/:publicId/:slug?" element={<Series />} />
<Route path="/studio/:publicId/:slug?" element={<Studio />} />
<Route path="/publisher/:publicId/:slug?" element={<Publisher />} />
<Route path="/person/:publicId/:slug?" element={<Person />} />
<Route path="/character/:publicId/:slug?" element={<Character />} />
<Route path="/watch-order/:publicId/:slug?" element={<WatchOrder />} />
```

Leave `/seasonal/:seasonal_id` and every non-detail route exactly as they are.

- [ ] **Step 6: Point each detail page at the new param**

In each of the seventeen detail pages, replace

```jsx
  const { system_id } = useParams();
```

with

```jsx
  const { publicId } = useParams();
```

then rename only the uses that feed the *initial fetch* — the `useMediaItem(type, system_id)` call and the matching `useMediaCacheUpdate(type, system_id)` call. Every other `system_id` in the file already reads from the loaded entity (`anime?.system_id`, `entry.system_id`) and must be left alone: the API still speaks UUIDs for everything except this one lookup.

Add the canonicalisation next to the existing query, e.g. in `Anime.jsx`:

```jsx
  const animeQuery = useMediaItem("anime", publicId);
  useCanonicalPath("anime", animeQuery.data);
```

with `import { useCanonicalPath } from "../../hooks/useCanonicalPath";` beside the other hook imports. Use the route segment as the type string — `"anime-movie"`, `"tv-show"`, `"watch-order"` — so it matches both `MEDIA_CONFIG` and the URL.

- [ ] **Step 7: Run the frontend suite and build**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

Expected: all green. The build is required — `:8000` serves the prebuilt bundle from `frontend_dist/` and will otherwise still be routing on UUIDs.

- [ ] **Step 8: Check it by hand**

Start the app (`dev.ps1`, or uvicorn plus vite), open the library, click into an anime, and confirm:
- the address bar reads `/anime/<n>/<slug>`;
- pasting `/anime/<n>` alone loads the page and the slug appears;
- pasting `/anime/<n>/nonsense-slug` loads the page and the slug is corrected;
- the browser back button leaves the detail page in one press, not two.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.jsx frontend/src/hooks/useCanonicalPath.js frontend/src/hooks/useCanonicalPath.test.jsx frontend/src/pages/detail/Anime.jsx frontend/src/pages/detail/AnimeMovie.jsx frontend/src/pages/detail/Movie.jsx frontend/src/pages/detail/TV.jsx frontend/src/pages/detail/Cartoon.jsx frontend/src/pages/detail/Manga.jsx frontend/src/pages/detail/Novel.jsx frontend/src/pages/detail/Comic.jsx frontend/src/pages/detail/Game.jsx frontend/src/pages/detail/CollectionPage.jsx frontend/src/pages/detail/FranchisePage.jsx frontend/src/pages/detail/SeriesPage.jsx frontend/src/pages/detail/Studio.jsx frontend/src/pages/detail/Publisher.jsx frontend/src/pages/detail/Person.jsx frontend/src/pages/detail/Character.jsx frontend/src/pages/detail/WatchOrder.jsx docs/PROGRESS.md
git commit -m "feat(urls): route detail pages on public_id with a canonical slug"
```

(Adjust the file list to the pages that actually exist — read `frontend/src/pages/detail/` first. Name every file; never stage the directory.)

---

### Task 10: Every link site goes through `entityPath`

**Files:**
- Modify: every file containing an inline detail-page link. Find them with:

```bash
grep -rn "to={\`/\(anime\|anime-movie\|movie\|tv-show\|cartoon\|manga\|novel\|comic\|game\|collection\|franchise\|series\|studio\|publisher\|person\|character\|watch-order\)/" frontend/src
grep -rn "navigate(\`/\(anime\|anime-movie\|movie\|tv-show\|cartoon\|manga\|novel\|comic\|game\|collection\|franchise\|series\|studio\|publisher\|person\|character\|watch-order\)/" frontend/src
```

- Test: `frontend/src/lib/noUuidLinks.test.js`

**Interfaces:**
- Consumes: `entityPath` from Task 3.
- Produces: no new interface; removes the inline URL construction.

**This task splits cleanly across parallel workers** by directory, since the files are disjoint:
- Worker A: `frontend/src/components/cards/`, `frontend/src/components/info/`
- Worker B: `frontend/src/components/tracker/`, `frontend/src/components/relations/`, `frontend/src/components/layout/`
- Worker C: `frontend/src/pages/detail/`
- Worker D: `frontend/src/pages/` (everything else) and `frontend/src/hooks/`

Each worker runs the same steps on its own directory and commits only its own files. Write the guard test (Step 1) once, before the split.

- [ ] **Step 1: Write the failing guard test**

Create `frontend/src/lib/noUuidLinks.test.js`, modelled on the existing `frontend/src/lib/noLegacySourceFields.test.js` (read it first for the file-walking idiom this repo already uses):

```js
// Detail-page URLs are built in exactly one place. An inline
// `/type/${x.system_id}` link now 404s, because bare-UUID URLs no longer
// route - so this guard fails the build rather than shipping a dead link.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DETAIL_TYPES = [
  "anime-movie", "anime", "tv-show", "watch-order", "movie", "cartoon",
  "manga", "novel", "comic", "game", "collection", "franchise", "series",
  "studio", "publisher", "person", "character",
];

const PATTERN = new RegExp(
  "[\"'`]/(" + DETAIL_TYPES.join("|") + ")/\\$\\{",
);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("detail-page links", () => {
  it("are never built inline", () => {
    const offenders = [];
    for (const file of walk(path.resolve(__dirname, ".."))) {
      if (file.endsWith(path.join("lib", "entityPath.js"))) continue;
      const source = fs.readFileSync(file, "utf8");
      source.split("\n").forEach((line, i) => {
        if (PATTERN.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/noUuidLinks.test.js`
Expected: FAIL, listing roughly forty offending lines. That list is the work for this task.

- [ ] **Step 3: Replace each inline link**

Mechanical, one shape:

```jsx
// before
<Link to={`/person/${person.system_id}`} className={linkCls}>

// after
<Link to={entityPath("person", person)} className={linkCls}>
```

with `import { entityPath } from "../../lib/entityPath";` (adjust the depth per file).

Two things to watch:

- **The object must carry `public_id` and a name field.** Some link sites only have an id in hand — e.g. `` to={`/watch-order/${selectedId}`} `` in `WatchOrderSection.jsx:351`, and the `row.character_id` / `row.person_id` links on the detail pages. For those, find the full object in the data already loaded on that page and pass it. If none is available, that call site needs the list query it already runs to supply the object; do not fabricate `{ public_id: id }`, because the slug would silently disappear.
- **`entityPath` returns `""` when there is no `public_id`.** Render the plain text instead of a dead link in that case rather than emitting `to=""`.

- [ ] **Step 4: Run the guard test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/noUuidLinks.test.js`
Expected: PASS, offenders empty.

- [ ] **Step 5: Run the frontend suite and build**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

Expected: all green.

- [ ] **Step 6: Check it by hand**

Click through: library card → detail; detail → franchise; detail → series; detail → cast member; detail → studio; detail → publisher; a watch-order guide; the global nav search results. Every destination must load, and no address bar may show a UUID.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/noUuidLinks.test.js <the exact files this worker changed> docs/PROGRESS.md
git commit -m "refactor(urls): build every detail link through entityPath"
```

---

### Task 11: Documentation

**Files:**
- Modify: `docs/data-model.md`, `docs/api.md`, `docs/frontend/components.md`, `docs/data-actions.md`, `docs/roadmap.md`, `docs/PROGRESS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: `docs/data-model.md`**

In the "Primary key" note near line 81, record that every entity with a detail page also carries `public_id INTEGER NOT NULL UNIQUE`, fed by a per-table sequence, that it is the only id shown to a user, and that it rides in the sheet so it stays stable across the company and home databases. Add the `public_id` row to each of the seventeen column tables.

- [ ] **Step 2: `docs/api.md`**

Record that the single-entry GET on each of the seventeen entity endpoints accepts either a `public_id` integer or a `system_id` UUID, that everything else — writes, credits, relations, covers — still takes a UUID, and that an unresolvable reference is a 404 rather than a 422.

- [ ] **Step 3: `docs/frontend/components.md`**

Record the URL scheme `/<type>/<public_id>/<slug>`, that `entityPath` is the only place allowed to build one (guarded by `src/lib/noUuidLinks.test.js`), that the slug is Latin-first and omitted for CN-only entries, and that `useCanonicalPath` corrects a stale slug via `replace`. Add a line to the "adding a media type" checklist: give the model a `public_id`, add it to the response schema, and link through `entityPath`.

- [ ] **Step 4: `docs/data-actions.md`**

Record that Backup writes `public_id` on the seventeen tabs, that Pull restores it unchanged, and that Pull re-runs `setval` on each sequence afterwards — with the reason: without it the next entry an admin adds fails on the unique index.

- [ ] **Step 5: Bump every `Last verified` line you touched**

Set them to the date the work lands.

- [ ] **Step 6: `docs/roadmap.md` and `docs/PROGRESS.md`**

Add the shipped feature to the roadmap's progress section. Delete this plan's table from `PROGRESS.md` — the roadmap keeps the record.

- [ ] **Step 7: Commit**

```bash
git add docs/data-model.md docs/api.md docs/frontend/components.md docs/data-actions.md docs/roadmap.md docs/PROGRESS.md
git commit -m "docs: record the public_id + slug URL scheme"
```

---

## Post-implementation: the machine handover

This change alters the sheet's shape, so the first switch between machines needs care. Say this to the user rather than doing it for them:

1. On the machine where the work landed: `alembic upgrade head`, then run **Backup** from `/system`. The sheet now carries `public_id` on seventeen tabs.
2. On the other machine: `git pull`, `alembic upgrade head` (this backfills that database's own ids), then **Pull All**. The restored ids overwrite the backfilled ones, so both databases end up agreeing.
3. Until step 2 has run, the two databases number entries independently and a URL copied from one will point at a different entry on the other.
