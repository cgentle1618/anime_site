# Person Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two person-role vocabularies into one list of five media-type-scoped types, reshape person names to match studio, and give people full admin CRUD plus public pages.

**Architecture:** `app/utils/credit_roles.py` becomes the single vocabulary; `media_credit.role` and `person_role.role` store the same five keys and the 原作/作畫/Writer/Artist labels are derived from `(role, media_type)`. `person_role.scope` becomes a NOT NULL media-type key, so a person's dropdown visibility is the union of explicit rows and auto-scoping on write can never narrow anyone. Two Alembic revisions carry the data; the frontend gains an Entity → Person admin tab and public library/detail pages.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL 17, Python 3.13, pytest · React 19, Vite, Tailwind v4, TanStack Query, vitest

**Spec:** [docs/superpowers/specs/2026-09-04-person-entity-design.md](../specs/2026-09-04-person-entity-design.md)

## Global Constraints

- **Python 3.13**, backend lives under `app/`. Run as `uvicorn app.main:app`.
- **Four gates must stay green** and CI runs all of them before deploy:
  `venv/Scripts/python.exe -m pytest -q`, `venv/Scripts/ruff.exe check .`,
  `cd frontend && npm run test:run`, `cd frontend && npm run lint`.
- **TDD is mandatory** (`CLAUDE.md`): a failing test precedes every behaviour
  change and every bug fix.
- **After any frontend change run `cd frontend && npm run build`** — :5173 hot
  reloads but :8000 serves the prebuilt `frontend_dist/`.
- **Never stage another session's hunks.** Other Claude Code sessions edit this
  branch concurrently. No `git add -A`, no `git commit -a`, no `git checkout --`,
  no `git restore/stash/reset` on shared files. Stage only the files each task
  names, and re-read the diff before committing.
- **Media-type keys are hyphenated** in the data layer: `anime`, `anime-movie`,
  `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`
  (`app/utils/media_resolver.py`). The registry uses underscores for router
  filenames only. Everything in this plan uses the hyphenated keys.
- **Semantic colour tokens only** in frontend styling (`bg-surface`,
  `text-text-muted`, …). Hard-coded grey utilities fail
  `src/theme-tokens.test.js`.
- **Alembic must end on a single head.** ⚠️ At plan time `alembic heads`
  reports **three**: `f6a7b8c9d0e1`, `s1t2u3d4i5o6` (the studio session's), and
  `wo_flat_order`. That is pre-existing and belongs to other sessions — do not
  fix it here, but chain both new revisions after `s1t2u3d4i5o6` and raise the
  multi-head state with the user before any deploy.
- **The studio session has already landed** commit `9c44a94`, which generalized
  `_find_by_name` to read `model._name_fields` and added `NameFallbackMixin` to
  `Person`. Several steps below are smaller because of it. Their schemas
  (`StudioBase.name_native`) are still mid-flight; do not touch them.

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `alembic/versions/p1e2r3s4o5n6_collapse_person_roles.py` | Revision 1: rewrite `media_credit.role`, rebuild `person_role`, `scope` NOT NULL |
| `alembic/versions/p7n8a9m10e11_reshape_person_names.py` | Revision 2: four name columns, distribute `name_native` |
| `tests/unit/test_person_role_collapse.py` | Guards on revision 1's pure mapping |
| `tests/unit/test_person_name_slots.py` | Guards on `name_slot_for` and revision 2 |
| `tests/api/test_person_entries.py` | `/entries` reverse lookup + RBAC |
| `frontend/src/components/forms/PersonSubTabBar.jsx` | The five type sub-tabs, shared by Add/Modify/Delete |
| `frontend/src/components/forms/PersonForm.jsx` | The person editor, extracted from `Add.jsx` |
| `frontend/src/pages/library/PersonLibrary.jsx` | `/library/person` |
| `frontend/src/pages/detail/Person.jsx` | `/person/:system_id` |

**Modified (principal):** `app/utils/credit_roles.py`, `app/utils/name_normalize.py`, `app/models/staff.py`, `app/schemas/staff.py`, `app/services/domain/credits.py`, `app/routers/person.py`, `frontend/src/config/formFields/fieldMeta.js`, `frontend/src/config/adminTabs.js`, `frontend/src/components/forms/OptionSubTabBar.jsx`, `frontend/src/pages/admin/{Add,Modify,Delete,SystemOptions}.jsx`, `frontend/src/lib/naming.js`, `frontend/src/App.jsx`.

**Task order is load-bearing.** Tasks 3 and 4 each pair a model change with the migration that makes the dev database match it, so the tree is runnable at every commit. Do not split them.

**Test fixtures you must write.** `tests/api/conftest.py` provides only `test_engine`, `db_session`, `admin_client` and the RBAC seed — and it builds the schema with `Base.metadata.create_all`, so **API tests never run Alembic**. The migrations are therefore covered by the `tests/unit/` guards plus the manual dev-DB verification steps in Tasks 3 and 4, not by the API suite. Every other fixture named in this plan is new; add each to `tests/api/conftest.py` as you reach the task that first uses it:

| Fixture | What it must yield | First used |
|---|---|---|
| `client` | An unauthenticated `TestClient`, the guest counterpart to `admin_client` | Task 5 |
| `restricted_client` | A client whose viewer role lacks the content label used in the test (see `tests/api/test_field_gating.py` for how an existing test builds one) | Task 6 |
| `manga_entry` | One committed `models.Manga` with no credits | Task 2 |
| `manga_with_credits` | A manga with one `author` and one `illustrator` credit | Task 5 |
| `manga_with_two_authors` | A manga with two `author` credits at `position` 0 and 1, named "First Author" and "Second Author" | Task 5 |
| `three_manga_with_credits` | Three manga, each with credits, for the N+1 query-count assertion | Task 5 |
| `anime_with_studio` | One anime with a `studio` credit and no person credits | Task 5 |
| `person_with_credits` | A person holding `(author, manga)` with at least one credit | Task 6 |
| `person_with_labelled_credit` | A person whose only credit is on a content-labelled entry | Task 6 |

---

### Task 1: `name_slot_for()` — one owner of the name-slot rule

The migration is not the only writer of a new person; `resolve_person` mints one
whenever Fill/Pull, a Sheets restore or a typed dropdown value names somebody
unknown. Both must agree on which name column a name belongs in, so the rule
lives once. It goes beside `normalize_name` because it is the same kind of
thing: a pure decision about a name string, with no database in it.

**Files:**
- Modify: `app/utils/name_normalize.py`
- Test: `tests/unit/test_person_name_slots.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `name_slot_for(name: str, *, role: str, scope: str, novel_type: str | None = None) -> str` returning `"en" | "cn" | "jp"`. Used by Task 4 (`resolve_person`) and Task 4's migration.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_person_name_slots.py
"""
Which name column a person's name lands in.

The rule is shared by the reshape migration and by resolve_person, so it is
tested here once rather than in each. See the design spec's
"One owner of the rule" section for why it is shaped this way.
"""

import pytest

from app.utils.name_normalize import name_slot_for


@pytest.mark.parametrize(
    "name,role,scope,novel_type,expected",
    [
        # No CJK anywhere -> en, whatever the role.
        ("Ryan Coogler", "director", "movie", None, "en"),
        ("Evan Call", "composer", "anime", None, "en"),
        ("Abel Gongora", "director", "anime", None, "en"),
        # CJK anime-side staff -> cn.
        ("渡部高志", "director", "anime", None, "cn"),
        ("荒木哲郎", "director", "anime-movie", None, "cn"),
        ("伊藤智彥", "producer", "anime", None, "cn"),
        ("梶浦由記", "composer", "anime", None, "cn"),
        # CJK author of a plain novel -> cn; of a light/web novel -> jp.
        ("金庸", "author", "novel", "Novel", "cn"),
        ("金庸", "author", "novel", "Other", "cn"),
        ("金庸", "author", "novel", None, "jp"),
        ("鴨志田一", "author", "novel", "Light Novel", "jp"),
        ("鴨志田一", "author", "novel", "Web", "jp"),
        # Every other CJK -> jp.
        ("諫山創", "author", "manga", None, "jp"),
        ("えれっと", "illustrator", "novel", None, "jp"),
        ("藍本松", "illustrator", "manga", None, "jp"),
        ("北条司", "director", "movie", None, "jp"),
    ],
)
def test_name_slot_for(name, role, scope, novel_type, expected):
    assert name_slot_for(name, role=role, scope=scope, novel_type=novel_type) == expected


def test_never_returns_alt():
    """
    name_alt is the slot an admin uses for a name that is genuinely none of
    the three. A writer guessing its way into it would make that meaning
    useless, so no input may produce it.
    """
    cases = [
        ("Ryan Coogler", "director", "movie"),
        ("諫山創", "author", "manga"),
        ("渡部高志", "director", "anime"),
    ]
    for name, role, scope in cases:
        assert name_slot_for(name, role=role, scope=scope) in {"en", "cn", "jp"}


def test_mixed_script_name_is_not_latin():
    """A name with any CJK is not an English name, even mostly-Latin ones."""
    assert name_slot_for("Studio五組", role="author", scope="manga") == "jp"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_person_name_slots.py -q`
Expected: FAIL — `ImportError: cannot import name 'name_slot_for'`

- [ ] **Step 3: Write minimal implementation**

Append to `app/utils/name_normalize.py` (and add `Optional` to the existing
`typing` import if it is not already there — it is):

```python
# Han, Hiragana, Katakana and the CJK extension blocks. A name containing any
# of these is not an English name, so the "en" slot is out even for a mostly
# Latin string like "Studio五組".
_CJK = re.compile(r"[぀-ヿ㐀-䶿一-鿿豈-﫿]")

# Novel types whose authors this collection records in Japanese rather than in
# Chinese-rendered kanji. Values are app/models/novel.py's `type` column.
_JP_NOVEL_TYPES = frozenset({"Light Novel", "Web"})

# Roles whose CJK names this collection records in Chinese-rendered kanji.
_CN_ROLE_SCOPES = frozenset(
    {("director", "anime"), ("director", "anime-movie"), ("producer", "anime"),
     ("composer", "anime")}
)


def name_slot_for(
    name: str,
    *,
    role: str,
    scope: str,
    novel_type: Optional[str] = None,
) -> str:
    """
    Which of person's name columns a name belongs in: "en", "cn" or "jp".

    Anime staff and translated literary novelists are recorded in this
    collection as Chinese-rendered kanji; manga, comic and light-novel
    creators are recorded in Japanese. Latin names are English. The rule is
    shared by the reshape migration and by resolve_person so that a name
    cannot land in one column during the migration and another the next day.

    `novel_type` is only knowable where a join to `novel` exists — the
    migration passes it, resolve_person cannot and passes None. None therefore
    means "assume light novel", which is the majority of this collection's
    novels (55 Light Novel/Web against 43 that are not).

    Never returns "alt": that slot's meaning is "a name that is none of these
    three", which only a human can assert.
    """
    if not _CJK.search(name or ""):
        return "en"
    if (role, scope) in _CN_ROLE_SCOPES:
        return "cn"
    if role == "author" and scope == "novel":
        return "jp" if novel_type is None or novel_type in _JP_NOVEL_TYPES else "cn"
    return "jp"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_person_name_slots.py -q`
Expected: PASS (18 passed)

Then: `venv/Scripts/ruff.exe check app/utils/name_normalize.py`
Expected: no findings

- [ ] **Step 5: Commit**

```bash
git add app/utils/name_normalize.py tests/unit/test_person_name_slots.py
git commit -m "feat(person): name_slot_for, the shared name-column rule"
```

---

### Task 2: Collapse the role vocabulary

The two vocabularies become one. This is the atomic breaking change: every
reader of `CREDIT_ROLES` moves in the same commit, because a tree with half of
them moved does not run. No database change here — Task 3 carries that.

**Files:**
- Modify: `app/utils/credit_roles.py`
- Modify: `app/services/domain/credits.py` — `_find_by_name:34` (Decision E) and `replace_credits:~126`. Per the ownership split agreed with the studio session, do **not** touch `resolve_studio`, `credit_names`, `link_values_for_entries` or `attach_link_fields` in this task.
- Modify: `app/schemas/staff.py:10-52`
- Test: `tests/unit/test_credit_roles.py` (rewrite — it already exists and several of its 14 tests assert the old two-vocabulary design), `tests/api/test_credits_service.py` (extend)

**The vocabulary tests go in `tests/unit/`, not `tests/api/`.** `credit_label`,
`legal_scopes` and the sheet-header guard are pure functions over a dict; they
need no database. That is better placement on its own merits, and it means this
task's main gate runs without the `anime_site_test` lock the two sessions are
serialising on.

**Interfaces:**
- Consumes: nothing.
- Produces: `CREDIT_ROLES` keyed `studio | director | producer | composer | author | illustrator`; `PERSON_ROLES = ("director","producer","composer","author","illustrator")`; `credit_label(role: str, media_type: str) -> str`; `legal_scopes(role: str) -> tuple[str, ...]`; `AmbiguousNameError`. Removed: `director_scope_for`, `SCOPED_PERSON_ROLES`, `DIRECTOR_ANIME_MEDIA_TYPES`, `CreditRole.person_role`, `PERSON_ROLE_SCOPES`.
- Note: `CreditRole`'s positional order becomes `(key, label, target, media_types)` — one field shorter. The studio session confirmed it reads only `.target` and `.media_types` and constructs none positionally, so its `studio` entry is unaffected.

- [ ] **Step 1: Write the failing test**

Add to `tests/api/test_credits_sheets.py`. The sheet-header assertion is the
single most important test in this plan — renaming role keys without renaming
`LEGACY_SHEET_COLUMN`'s keys in lockstep would silently change the Backup
columns for manga, novel and comic.

```python
from app.utils.credit_roles import (
    CREDIT_ROLES,
    credit_label,
    credit_roles_for,
    legal_scopes,
    sheet_column_for,
)

# Every (media_type, role) pair that has ever had a legacy sheet header, and
# the header it must keep producing. Written out rather than derived from
# LEGACY_SHEET_COLUMN so that a wrong edit to that dict cannot make this test
# agree with it.
EXPECTED_HEADERS = {
    ("anime", "studio"): "studio",
    ("anime", "director"): "director",
    ("anime", "producer"): "producer",
    ("anime", "composer"): "music",
    ("anime-movie", "studio"): "studio",
    ("anime-movie", "director"): "director",
    ("movie", "director"): "director",
    ("manga", "author"): "author_plot",
    ("manga", "illustrator"): "author_draw",
    ("novel", "author"): "author",
    ("novel", "illustrator"): "illustrator",
    ("comic", "author"): "writer",
    ("comic", "illustrator"): "artist",
}


def test_sheet_headers_survive_the_role_collapse():
    for (media_type, role), header in EXPECTED_HEADERS.items():
        assert sheet_column_for(media_type, role) == header


def test_every_credit_role_has_a_label_per_media_type():
    for role in CREDIT_ROLES.values():
        for media_type in role.media_types:
            assert credit_label(role.key, media_type)


def test_derived_labels():
    assert credit_label("author", "manga") == "原作"
    assert credit_label("illustrator", "manga") == "作畫"
    assert credit_label("author", "novel") == "Author"
    assert credit_label("illustrator", "novel") == "Illustrator"
    assert credit_label("author", "comic") == "Writer"
    assert credit_label("illustrator", "comic") == "Artist"
    assert credit_label("director", "movie") == "Director"
    assert credit_label("composer", "anime") == "Music / Composer"


def test_legal_scopes_match_media_types():
    assert legal_scopes("director") == ("anime", "anime-movie", "movie")
    assert legal_scopes("composer") == ("anime",)
    assert legal_scopes("author") == ("manga", "novel", "comic")
    assert legal_scopes("illustrator") == ("manga", "novel", "comic")


def test_no_media_type_uses_a_collapsed_role_twice():
    """
    The collapse is only safe because manga's 原作/作畫 land on DIFFERENT
    roles. If a future media type ever used one role for two credits,
    uq_media_credit_row would start rejecting legitimate rows.
    """
    for media_type in ("anime", "anime-movie", "movie", "manga", "novel", "comic"):
        keys = [r.key for r in credit_roles_for(media_type)]
        assert len(keys) == len(set(keys))
```

And to `tests/api/test_credits_service.py`:

```python
from app.utils.credit_roles import PERSON_ROLES


def test_replace_credits_scopes_by_media_type(db_session, manga_entry):
    from app.services.domain.credits import replace_credits
    from app import models

    replace_credits(db_session, "manga", manga_entry.system_id, "author", ["諫山創"])
    db_session.flush()

    row = db_session.query(models.PersonRole).one()
    assert (row.role, row.scope) == ("author", "manga")


def test_person_roles_are_the_five(db_session):
    assert set(PERSON_ROLES) == {
        "director", "producer", "composer", "author", "illustrator"
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_sheets.py tests/api/test_credits_service.py -q`
Expected: FAIL — `ImportError: cannot import name 'credit_label'`

- [ ] **Step 3: Rewrite the vocabulary**

Replace the `CREDIT_ROLES` block and everything down to `director_scope_for` in
`app/utils/credit_roles.py`:

```python
@dataclass(frozen=True)
class CreditRole:
    """One role a person or studio can be credited in."""

    # Value stored in media_credit.role AND, for people, in person_role.role.
    # One vocabulary: see the design spec's Decision A. Before the collapse
    # these were two, and 原作/作画 were separate credit keys implying one
    # person role.
    key: str
    # Human label, used wherever the media type does not override it below.
    label: str
    # Which entity table the credit points at: "person" or "studio".
    target: str
    # Media type keys (hyphenated, from MEDIA_TABLES) that may use this role.
    # For a person role this doubles as the set of legal person_role.scope
    # values - the scope IS the media type.
    media_types: tuple[str, ...]


CREDIT_ROLES: dict[str, CreditRole] = {
    "studio": CreditRole("studio", "Studio", "studio", ("anime", "anime-movie")),
    "director": CreditRole(
        "director", "Director", "person", ("anime", "anime-movie", "movie")
    ),
    "producer": CreditRole("producer", "Producer", "person", ("anime",)),
    "composer": CreditRole("composer", "Music / Composer", "person", ("anime",)),
    "author": CreditRole("author", "Author", "person", ("manga", "novel", "comic")),
    "illustrator": CreditRole(
        "illustrator", "Illustrator", "person", ("manga", "novel", "comic")
    ),
}

CREDIT_ROLE_KEYS: tuple[str, ...] = tuple(CREDIT_ROLES.keys())

PERSON_ROLES: tuple[str, ...] = tuple(
    key for key, role in CREDIT_ROLES.items() if role.target == "person"
)

# Labels that differ by media type. The same person type is called 原作 on a
# manga, Author on a novel and Writer on a comic - one vocabulary, three
# reader-facing words. Anything absent falls back to CreditRole.label.
_LABEL_OVERRIDES: dict[tuple[str, str], str] = {
    ("author", "manga"): "原作",
    ("illustrator", "manga"): "作畫",
    ("author", "comic"): "Writer",
    ("illustrator", "comic"): "Artist",
}


def credit_label(role: str, media_type: str) -> str:
    """What this credit is called on this media type."""
    return _LABEL_OVERRIDES.get((role, media_type)) or CREDIT_ROLES[role].label


def legal_scopes(role: str) -> tuple[str, ...]:
    """The media types a person may hold this role in."""
    return CREDIT_ROLES[role].media_types
```

Delete `SCOPED_PERSON_ROLES`, `DIRECTOR_ANIME_MEDIA_TYPES` and
`director_scope_for` entirely, and update the module docstring: the paragraph
explaining that credit roles and person roles are two vocabularies, and the one
about director scope being derived, are both now false.

Rename the six `LEGACY_SHEET_COLUMN` keys, leaving every header value alone:

```python
    ("manga", "author"): "author_plot",
    ("manga", "illustrator"): "author_draw",
    ("novel", "author"): "author",
    ("novel", "illustrator"): "illustrator",
    ("comic", "author"): "writer",
    ("comic", "illustrator"): "artist",
```

- [ ] **Step 4: Move the readers**

In `app/services/domain/credits.py`, `replace_credits` loses its scope
derivation — the scope is the media type:

```python
        else:
            target = resolve_person(db, name, role=role, scope=media_type)
```

Delete the `scope = (director_scope_for(media_type) if ... else None)` block and
drop `director_scope_for` from the import list at the top of the file.

In `app/schemas/staff.py`, delete `PERSON_ROLE_SCOPES` and its comment, make
`scope` required, and validate the pair rather than each field alone — a
per-field validator cannot see the role, so it could never reject
`(composer, manga)`:

```python
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.utils.credit_roles import PERSON_ROLES, legal_scopes


class PersonRoleIn(BaseModel):
    """
    One role a person is offered under, in one media type.

    Validated rather than free text because the frontend is a routine writer
    of these strings: one typo'd `source.role` in a fieldMeta.js descriptor
    would otherwise mint a person holding a role no dropdown queries, invisible
    until someone wonders why a name they just typed is never suggested.

    scope is required. Every person_role row carries one - see the design
    spec's Decision B for why there is no "offered everywhere" state.
    """

    role: str
    scope: str

    @field_validator("role")
    @classmethod
    def _known_role(cls, v: str) -> str:
        if v not in PERSON_ROLES:
            raise ValueError(
                f"'{v}' is not a person role. Expected one of: "
                + ", ".join(PERSON_ROLES)
            )
        return v

    @model_validator(mode="after")
    def _scope_is_legal_for_role(self):
        allowed = legal_scopes(self.role)
        if self.scope not in allowed:
            raise ValueError(
                f"'{self.scope}' is not a scope for the {self.role} role. "
                "Expected one of: " + ", ".join(allowed)
            )
        return self
```

- [ ] **Step 5: Run the full backend suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: the new tests PASS. Other suites will fail wherever they hard-code an
old role key (`test_credit_backfill.py`, `test_person_router.py`,
`test_fill_credit_resolution.py`, `test_media_credit_model.py` are the likely
ones). Update each failing fixture to the collapsed keys — `manga_author_plot`
→ `author` with `scope="manga"`, `novel_illustrator` → `illustrator` with
`scope="novel"`, `director`/`non_anime` → `director`/`movie`. These are
mechanical renames in test data, not behaviour changes; if a test asserts
something that is genuinely no longer true, stop and raise it rather than
weakening the assertion.

Then: `venv/Scripts/ruff.exe check .`
Expected: no findings.

- [ ] **Step 6: Commit**

```bash
git add app/utils/credit_roles.py app/services/domain/credits.py \
        app/schemas/staff.py tests/api/test_credits_sheets.py \
        tests/api/test_credits_service.py
# plus each test file the rename touched, named individually
git commit -m "feat(person): one role vocabulary of five, labels derived per media type"
```

---

### Task 3: Revision 1 — collapse the stored roles

The migration and the `scope` NOT NULL model change ship together so the dev
database matches the models at this commit.

**Files:**
- Create: `alembic/versions/p1e2r3s4o5n6_collapse_person_roles.py`
- Modify: `app/models/staff.py` (`PersonRole`, ~line 72-108)
- Test: `tests/unit/test_person_role_collapse.py` (create)

**Interfaces:**
- Consumes: `PERSON_ROLES`, `legal_scopes` (Task 2).
- Produces: module constants `CREDIT_ROLE_RENAMES: dict[str, str]` and `ROLE_SCOPE_EXPANSION: dict[tuple[str, str | None], tuple[tuple[str, str], ...]]` on the migration module, loadable by path.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_person_role_collapse.py
"""
Guards on migration p1e2r3s4o5n6, which collapses the two role vocabularies.

The migration file is loaded by path: importlib.import_module on
"alembic.versions..." resolves to the installed alembic package, which has no
versions submodule (same reason as tests/unit/test_release_date_migration.py).
"""

import importlib.util
import pathlib

from app.utils.credit_roles import PERSON_ROLES, legal_scopes

_spec = importlib.util.spec_from_file_location(
    "p1e2r3s4o5n6_collapse_person_roles",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/p1e2r3s4o5n6_collapse_person_roles.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_every_rename_target_is_a_live_role():
    for target in migration.CREDIT_ROLE_RENAMES.values():
        assert target in PERSON_ROLES


def test_no_old_credit_role_key_survives():
    """The six retired keys must all be named, or rows keep a dead role."""
    assert set(migration.CREDIT_ROLE_RENAMES) == {
        "manga_author_plot",
        "manga_author_draw",
        "novel_author",
        "novel_illustrator",
        "comic_writer",
        "comic_artist",
    }


def test_manga_pair_lands_on_different_roles():
    """
    The collapse is only safe because 原作 and 作畫 do not merge. If they did,
    uq_media_credit_row would reject a manga written and drawn by one person.
    """
    assert (
        migration.CREDIT_ROLE_RENAMES["manga_author_plot"]
        != migration.CREDIT_ROLE_RENAMES["manga_author_draw"]
    )


def test_every_expanded_scope_is_legal_for_its_role():
    for pairs in migration.ROLE_SCOPE_EXPANSION.values():
        for role, scope in pairs:
            assert scope in legal_scopes(role), f"{role} cannot be scoped {scope}"


def test_director_anime_expands_to_both_anime_types():
    """
    The old `anime` director scope served the anime AND anime-movie dropdowns
    via the deleted DIRECTOR_ANIME_MEDIA_TYPES. Expanding to only one would
    silently empty the other.
    """
    assert migration.ROLE_SCOPE_EXPANSION[("director", "anime")] == (
        ("director", "anime"),
        ("director", "anime-movie"),
    )


def test_manga_author_is_derived_not_expanded():
    """
    manga_author backs both dropdowns, so it cannot be a static expansion —
    it must be split from each person's actual credits.
    """
    assert ("manga_author", None) not in migration.ROLE_SCOPE_EXPANSION
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_person_role_collapse.py -q`
Expected: FAIL — `FileNotFoundError` on the migration path

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/p1e2r3s4o5n6_collapse_person_roles.py
"""Collapse the two role vocabularies into one, scoped by media type.

Revision ID: p1e2r3s4o5n6
Revises: s1t2u3d4i5o6
Create Date: 2026-09-04

media_credit.role and person_role.role become the same five person keys plus
studio. person_role.scope becomes NOT NULL and holds a media-type key; the
anime/non_anime vocabulary is gone.

manga_author is the only row that cannot be renamed, because it backs BOTH the
原作 and 作畫 dropdowns. It is split from each person's actual credits rather
than guessed: verified on 2026-09-04 against 121 holders, every one of whom has
at least one manga credit, so the derivation is total.

The downgrade is deliberately lossy: collapsing (author, manga) and
(illustrator, manga) back onto one manga_author row discards the split, and
(director, anime) + (director, anime-movie) back onto one `anime` row discards
nothing but cannot tell an expanded row from a hand-added one. The downgrade
exists to unblock a bad deploy, not to round-trip data.
"""

from alembic import op
import sqlalchemy as sa

revision = "p1e2r3s4o5n6"
down_revision = "s1t2u3d4i5o6"
branch_labels = None
depends_on = None


# media_credit.role: a straight value rewrite. Verified row counts on
# 2026-09-04: 129 + 126 + 80 + 31 + 6 + 0 = 372 rows.
CREDIT_ROLE_RENAMES: dict[str, str] = {
    "manga_author_plot": "author",
    "manga_author_draw": "illustrator",
    "novel_author": "author",
    "novel_illustrator": "illustrator",
    "comic_writer": "author",
    "comic_artist": "illustrator",
}

# person_role: every (old role, old scope) that maps statically onto one or
# more (new role, new scope) pairs. manga_author is absent on purpose - see
# _split_manga_authors.
ROLE_SCOPE_EXPANSION: dict[tuple, tuple] = {
    ("director", "anime"): (("director", "anime"), ("director", "anime-movie")),
    ("director", "non_anime"): (("director", "movie"),),
    ("producer", None): (("producer", "anime"),),
    ("composer", None): (("composer", "anime"),),
    ("novel_author", None): (("author", "novel"),),
    ("novel_illustrator", None): (("illustrator", "novel"),),
    ("comic_writer", None): (("author", "comic"),),
    ("comic_artist", None): (("illustrator", "comic"),),
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Rewrite media_credit.role. Order matters not at all: the six source
    #    keys and the two target keys are disjoint sets.
    for old, new in CREDIT_ROLE_RENAMES.items():
        conn.execute(
            sa.text("UPDATE media_credit SET role = :new WHERE role = :old"),
            {"new": new, "old": old},
        )

    # 2. Rebuild person_role into a temporary table, then swap. Building the
    #    new set separately keeps the derivation readable and means a partial
    #    failure leaves the old rows untouched.
    conn.execute(
        sa.text(
            "CREATE TEMP TABLE person_role_new "
            "(person_id uuid NOT NULL, role text NOT NULL, scope text NOT NULL)"
        )
    )

    for (old_role, old_scope), pairs in ROLE_SCOPE_EXPANSION.items():
        for new_role, new_scope in pairs:
            conn.execute(
                sa.text(
                    "INSERT INTO person_role_new (person_id, role, scope) "
                    "SELECT person_id, :new_role, :new_scope FROM person_role "
                    "WHERE role = :old_role AND scope IS NOT DISTINCT FROM :old_scope"
                ),
                {
                    "new_role": new_role,
                    "new_scope": new_scope,
                    "old_role": old_role,
                    "old_scope": old_scope,
                },
            )

    # 3. Split manga_author from the credits each holder actually has.
    #    media_credit.role has already been rewritten above, so the credit
    #    roles to match on are the NEW keys.
    for credit_role, person_role in (("author", "author"), ("illustrator", "illustrator")):
        conn.execute(
            sa.text(
                "INSERT INTO person_role_new (person_id, role, scope) "
                "SELECT DISTINCT pr.person_id, :person_role, 'manga' "
                "FROM person_role pr "
                "JOIN media_credit mc ON mc.person_id = pr.person_id "
                "WHERE pr.role = 'manga_author' "
                "  AND mc.media_type = 'manga' AND mc.role = :credit_role"
            ),
            {"person_role": person_role, "credit_role": credit_role},
        )

    # 4. Swap, de-duplicating: a person can reach the same (role, scope) by
    #    two routes once director's two anime scopes exist.
    conn.execute(sa.text("DELETE FROM person_role"))
    conn.execute(
        sa.text(
            "INSERT INTO person_role (person_id, role, scope) "
            "SELECT DISTINCT person_id, role, scope FROM person_role_new"
        )
    )
    conn.execute(sa.text("DROP TABLE person_role_new"))

    # 5. Tighten the column and the constraint. NULLS NOT DISTINCT is no
    #    longer needed: there is no nullable column left in the key.
    op.alter_column("person_role", "scope", nullable=False)
    op.drop_constraint("uq_person_role", "person_role", type_="unique")
    op.create_unique_constraint(
        "uq_person_role", "person_role", ["person_id", "role", "scope"]
    )


def downgrade() -> None:
    conn = op.get_bind()

    op.drop_constraint("uq_person_role", "person_role", type_="unique")
    op.alter_column("person_role", "scope", nullable=True)

    # Roles first, before the scopes they are keyed by are rewritten.
    conn.execute(
        sa.text(
            "UPDATE person_role SET role = 'manga_author', scope = NULL "
            "WHERE role IN ('author', 'illustrator') AND scope = 'manga'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET role = 'novel_author', scope = NULL "
            "WHERE role = 'author' AND scope = 'novel'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET role = 'novel_illustrator', scope = NULL "
            "WHERE role = 'illustrator' AND scope = 'novel'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET role = 'comic_writer', scope = NULL "
            "WHERE role = 'author' AND scope = 'comic'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET role = 'comic_artist', scope = NULL "
            "WHERE role = 'illustrator' AND scope = 'comic'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET scope = 'anime' "
            "WHERE role = 'director' AND scope IN ('anime', 'anime-movie')"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET scope = 'non_anime' "
            "WHERE role = 'director' AND scope = 'movie'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET scope = NULL WHERE role IN ('producer', 'composer')"
        )
    )
    # The expansions and the manga split both create duplicates on the way back.
    conn.execute(
        sa.text(
            "DELETE FROM person_role a USING person_role b "
            "WHERE a.id > b.id AND a.person_id = b.person_id "
            "AND a.role = b.role AND a.scope IS NOT DISTINCT FROM b.scope"
        )
    )

    op.create_unique_constraint(
        "uq_person_role",
        "person_role",
        ["person_id", "role", "scope"],
        postgresql_nulls_not_distinct=True,
    )

    for old, new in CREDIT_ROLE_RENAMES.items():
        # Reversing the many-to-one rename needs the media type to disambiguate.
        media_type = {"manga_author_plot": "manga", "manga_author_draw": "manga",
                      "novel_author": "novel", "novel_illustrator": "novel",
                      "comic_writer": "comic", "comic_artist": "comic"}[old]
        conn.execute(
            sa.text(
                "UPDATE media_credit SET role = :old "
                "WHERE role = :new AND media_type = :media_type"
            ),
            {"old": old, "new": new, "media_type": media_type},
        )
```

- [ ] **Step 4: Update the model**

In `app/models/staff.py`, `PersonRole` — replace the class docstring, the
`__table_args__` comment and the two column comments:

```python
class PersonRole(Base):
    """
    Which dropdowns a person appears in, per media type.

    Explicit rather than derived from credits: a director added today must be
    offered in the anime director dropdown before their first credit exists.

    Every row carries a scope, and a person's visibility is the union of their
    rows. There is deliberately no unscoped "offered everywhere" state - unlike
    system_option_scope, where zero rows means everywhere. Person credits ARE
    auto-scoped on write, and under an "everywhere" rule the first scope row
    would silently narrow the person, which is exactly the trap Ruling R27
    removed from tags. With no "everywhere" state to collapse, auto-scoping is
    purely additive and the trap cannot occur.
    """

    __tablename__ = "person_role"
    __table_args__ = (
        UniqueConstraint("person_id", "role", "scope", name="uq_person_role"),
    )

    ...
    # One of credit_roles.PERSON_ROLES.
    role = Column(String, nullable=False, index=True)
    # A hyphenated media-type key, and one of legal_scopes(role).
    scope = Column(String, nullable=False)
```

- [ ] **Step 5: Run tests and the migration**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_person_role_collapse.py -q`
Expected: PASS (6 passed)

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green

Apply to the dev database and verify the counts the spec predicts:

```bash
alembic upgrade head
venv/Scripts/python.exe -c "
from app.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()
print(db.execute(text('select role, scope, count(*) from person_role group by 1,2 order by 1,2')).fetchall())
print(db.execute(text('select count(*) from person_role')).scalar())
"
```

Expected: 791 rows total; `('director','anime',138)`, `('director','anime-movie',138)`,
`('director','movie',204)`, `('author','manga',109)`, `('illustrator','manga',110)`,
`('author','novel',54)`, `('illustrator','novel',29)`, `('author','comic',3)`,
`('producer','anime',1)`, `('composer','anime',5)`.

**If any count differs, stop and report it** — the migration is derived from
measured data, so a mismatch means the data moved or the derivation is wrong.

- [ ] **Step 6: Commit**

```bash
git add alembic/versions/p1e2r3s4o5n6_collapse_person_roles.py \
        app/models/staff.py tests/unit/test_person_role_collapse.py
git commit -m "feat(person): migrate roles to the collapsed media-type-scoped vocabulary"
```

---

### Task 4: Person names — model, resolver and Revision 2

Person takes the shape Studio took in `9c44a94`. Model, code and migration ship
together for the same reason as Task 3.

**Files:**
- Modify: `app/models/staff.py` (`Person`, lines 22-70)
- Modify: `app/schemas/staff.py` (`PersonBase`, `PersonResponse`)
- Modify: `app/services/domain/credits.py:74` (`resolve_person`), `:252` (`credit_names`), `:629` (the batch name map)
- Modify: `app/routers/person.py:32-56` (`_to_response`)
- Create: `alembic/versions/p7n8a9m10e11_reshape_person_names.py`
- Test: `tests/api/test_person_model.py`, `tests/unit/test_person_name_slots.py` (extend)

**Interfaces:**
- Consumes: `name_slot_for` (Task 1).
- Produces: `Person.display_name -> str`, `Person.names_dict`, `Person._name_fields = ["name_en","name_cn","name_jp","name_alt"]`; `PersonResponse.display_name`.

- [ ] **Step 1: Write the failing test**

Add to `tests/api/test_person_model.py`:

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_display_name_honours_the_chosen_field(db_session):
    p = models.Person(name_en="Ryan Coogler", name_cn="瑞恩·庫格勒",
                      display_name_field="cn")
    db_session.add(p)
    db_session.flush()
    assert p.display_name == "瑞恩·庫格勒"


def test_display_name_falls_back_when_the_chosen_field_is_empty(db_session):
    p = models.Person(name_jp="諫山創", display_name_field="cn")
    db_session.add(p)
    db_session.flush()
    assert p.display_name == "諫山創"


def test_display_name_falls_back_in_order_when_unset(db_session):
    p = models.Person(name_cn="渡部高志", name_jp="渡部高志")
    db_session.add(p)
    db_session.flush()
    assert p.display_name == "渡部高志"


def test_a_person_needs_at_least_one_name(db_session):
    db_session.add(models.Person(gender="F"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_api_rejects_a_nameless_person(admin_client):
    r = admin_client.post("/api/person/", json={"roles": []})
    assert r.status_code == 422
```

Add to `tests/api/test_credits_service.py`:

```python
def test_resolve_person_uses_the_shared_name_slot_rule(db_session):
    from app.services.domain.credits import resolve_person

    latin = resolve_person(db_session, "Jon Favreau", role="director", scope="movie")
    assert latin.name_en == "Jon Favreau" and latin.name_jp is None

    cjk_anime = resolve_person(db_session, "渡部高志", role="director", scope="anime")
    assert cjk_anime.name_cn == "渡部高志"

    cjk_manga = resolve_person(db_session, "諫山創", role="author", scope="manga")
    assert cjk_manga.name_jp == "諫山創"

    # And never name_alt, whichever route created them.
    for p in (latin, cjk_anime, cjk_manga):
        assert p.name_alt is None


def test_a_person_name_round_trips_through_sheets(db_session, manga_entry):
    """
    credit_names feeds the Sheets backup column; the restore resolves that
    string back through _find_by_name. A display name must land on the same
    row it came from, whichever column holds it.
    """
    from app.services.domain.credits import (
        credit_names,
        replace_credits,
        resolve_person,
    )

    replace_credits(db_session, "manga", manga_entry.system_id, "author", ["諫山創"])
    db_session.flush()

    written = credit_names(db_session, "manga", manga_entry.system_id, "author")
    assert written == ["諫山創"]

    same = resolve_person(db_session, written[0], role="author", scope="manga")
    assert db_session.query(models.Person).count() == 1
    assert same.system_id is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_model.py tests/api/test_credits_service.py -q`
Expected: FAIL — `TypeError: 'name_jp' is an invalid keyword argument for Person`

- [ ] **Step 3: Reshape the model**

In `app/models/staff.py`, mirror what `Studio` already does (lines 116-210) —
read that class and follow it exactly rather than inventing a second shape:

```python
class Person(Base, NameFallbackMixin):
    """
    One human credited on a media entry.

    gender is on the base rather than on a seiyuu extension table: only seiyuu
    have it filled today, but gender is a fact about the person, not about the
    role, and putting it on an extension would encode a data-entry habit into
    the schema. No role extension table exists yet - one is added when a role
    earns several columns that are genuinely meaningless elsewhere.

    All four names are nullable and at least one must be set, matching Studio:
    a person is known by whichever names they are known by, and requiring a
    specific one would force a made-up value. Which column a name lands in when
    a writer other than the admin form creates the row is decided by
    name_slot_for in app/utils/name_normalize.py.
    """

    __tablename__ = "person"
    __table_args__ = (
        # NULLS NOT DISTINCT: three of the four name columns are NULL on a
        # typical row, and Postgres treats two NULLs as distinct by default -
        # without this the constraint is INERT and duplicates commit cleanly.
        # Same lesson as uq_studio_name and uq_media_credit_row.
        UniqueConstraint(
            "name_en", "name_cn", "name_jp", "name_alt",
            name="uq_person_name",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_person_has_a_name",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name_en = Column(String, nullable=True, index=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    # ... my_rating, photo_file, remark, created_at, updated_at unchanged
```

Copy `Studio`'s `_DISPLAY_FIELDS`, `names_dict` and `display_name` members
verbatim — the resolution order is the same (`en -> cn -> jp -> alt`).

- [ ] **Step 4: Move the readers**

`app/services/domain/credits.py`:

```python
# resolve_person, replacing `models.Person(name_native=name.strip())`
    if person is None:
        stripped = name.strip()
        slot = name_slot_for(stripped, role=role, scope=scope)
        person = models.Person(**{f"name_{slot}": stripped})
        db.add(person)
        db.flush()
```

Import `name_slot_for` alongside `normalize_name` and `split_names`.

At line ~252, `credit_names` currently reads
`entity.display_name if row.studio_id else entity.name_native`. Both branches
are now `display_name`, so the conditional and its comment go:

```python
            out.append(entity.display_name)
```

At line ~629, the batch name map in `attach_link_fields` builds
`{p.system_id: p.name_native}`. It becomes `{p.system_id: p.display_name}`
(the studio map beside it is the studio session's to change, if they have not
already — re-read before editing).

`app/schemas/staff.py`: `PersonBase` swaps `name_native: str` /
`name_en` / `name_cn` for the four optionals plus `display_name_field`, with a
model validator so the API answers 422 rather than surfacing a 500 from the
CHECK. `PersonResponse` gains `display_name: str`. Copy `StudioBase`'s
validator if the studio session has landed it; otherwise:

```python
    @model_validator(mode="after")
    def _at_least_one_name(self):
        if not any((self.name_en, self.name_cn, self.name_jp, self.name_alt)):
            raise ValueError("A person needs at least one name.")
        return self
```

`app/routers/person.py`: `_to_response` passes the four names,
`display_name_field` and `display_name` through.

- [ ] **Step 5: Write Revision 2**

```python
# alembic/versions/p7n8a9m10e11_reshape_person_names.py
"""Reshape person names to match studio: four nullable names.

Revision ID: p7n8a9m10e11
Revises: p1e2r3s4o5n6
Create Date: 2026-09-04

name_en and name_cn are NULL on all 554 rows today, so nothing is overwritten.
Unlike studios - where name_native -> name_en was correct for all 77 - people
are mixed: 336 CJK, 218 Latin (measured 2026-09-04). name_slot_for owns the
distribution rule; it is called here with novel_type from a join, which is the
only place that column is knowable.

Expected distribution: 218 en / 167 cn / 169 jp.
"""

from alembic import op
import sqlalchemy as sa

from app.utils.name_normalize import name_slot_for

revision = "p7n8a9m10e11"
down_revision = "p1e2r3s4o5n6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column("person", sa.Column("name_jp", sa.String(), nullable=True))
    op.add_column("person", sa.Column("name_alt", sa.String(), nullable=True))
    op.add_column("person", sa.Column("display_name_field", sa.String(), nullable=True))

    # One row per person with the role/scope/novel_type context the rule needs.
    # A person may hold several roles; the first by role name is used, which is
    # deterministic and - verified on 2026-09-04 - never ambiguous: no person in
    # the cn bucket also holds a jp-bucket credit. The 3 people who author both
    # a plain and a light novel resolve to cn, which is the intended tiebreak.
    rows = conn.execute(
        sa.text(
            "SELECT p.system_id, p.name_native, pr.role, pr.scope, n.type "
            "FROM person p "
            "LEFT JOIN person_role pr ON pr.person_id = p.system_id "
            "LEFT JOIN media_credit mc ON mc.person_id = p.system_id "
            "  AND mc.role = pr.role AND mc.media_type = pr.scope "
            "LEFT JOIN novel n ON n.system_id = mc.entry_id AND mc.media_type = 'novel' "
            "ORDER BY p.system_id, "
            "  CASE WHEN n.type IS NOT NULL AND n.type NOT IN ('Light Novel','Web') "
            "       THEN 0 ELSE 1 END, pr.role"
        )
    ).fetchall()

    seen = set()
    for system_id, name_native, role, scope, novel_type in rows:
        if system_id in seen:
            continue
        seen.add(system_id)
        slot = name_slot_for(
            name_native or "", role=role or "", scope=scope or "", novel_type=novel_type
        )
        conn.execute(
            sa.text(f"UPDATE person SET name_{slot} = :n WHERE system_id = :i"),
            {"n": name_native, "i": system_id},
        )

    op.drop_constraint("uq_person_name", "person", type_="unique")
    op.drop_column("person", "name_native")
    op.create_unique_constraint(
        "uq_person_name",
        "person",
        ["name_en", "name_cn", "name_jp", "name_alt"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_check_constraint(
        "ck_person_has_a_name",
        "person",
        "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
    )


def downgrade() -> None:
    conn = op.get_bind()
    op.drop_constraint("ck_person_has_a_name", "person", type_="check")
    op.drop_constraint("uq_person_name", "person", type_="unique")
    op.add_column("person", sa.Column("name_native", sa.String(), nullable=True))
    conn.execute(
        sa.text(
            "UPDATE person SET name_native = "
            "COALESCE(name_cn, name_jp, name_en, name_alt)"
        )
    )
    op.alter_column("person", "name_native", nullable=False)
    op.drop_column("person", "display_name_field")
    op.drop_column("person", "name_alt")
    op.drop_column("person", "name_jp")
    op.create_unique_constraint(
        "uq_person_name", "person", ["name_native", "name_en"],
        postgresql_nulls_not_distinct=True,
    )
```

- [ ] **Step 6: Run tests and verify the distribution**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green

```bash
alembic upgrade head
venv/Scripts/python.exe -c "
from app.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()
print(db.execute(text('''select count(*) filter (where name_en is not null) en,
  count(*) filter (where name_cn is not null) cn,
  count(*) filter (where name_jp is not null) jp,
  count(*) filter (where name_alt is not null) alt from person''')).fetchone())
"
```

Expected: `(218, 167, 169, 0)`. **A different split means stop and report** —
the rule was measured, not guessed.

- [ ] **Step 7: Commit**

```bash
git add app/models/staff.py app/schemas/staff.py \
        app/services/domain/credits.py app/routers/person.py \
        alembic/versions/p7n8a9m10e11_reshape_person_names.py \
        tests/api/test_person_model.py tests/api/test_credits_service.py
git commit -m "feat(person): four name columns with a per-row display choice"
```

---

### Task 5: `credit_refs` on media responses

Today a detail page gets `director` as a comma-joined string with no ids, so it
cannot link anywhere. This adds ids and the per-media-type label beside the
legacy strings, which stay exactly as they are — they are the Sheets contract.

**Files:**
- Modify: `app/services/domain/credits.py` — `link_values_for_entries:588`, `attach_link_fields:673`
- Modify: the eight media response schemas under `app/schemas/`
- Test: `tests/api/test_entry_link_fields.py`

**Interfaces:**
- Consumes: `credit_label` (Task 2), `Person.display_name` (Task 4).
- Produces: `person_refs_for_entries(db, media_type, entry_ids) -> dict[UUID, dict[str, list[dict]]]`; the attribute `entry.credit_refs` set in place by `attach_link_fields`, with `{system_id, display_name, label}` per ref.

**Read first:** `attach_link_fields` does **not** return dicts — it sets
attributes on ORM entries in place (`setattr(entry, attr, ...)`), and the
response schema then reads them like any other attribute. The batched data
comes from `link_values_for_entries`, which returns
`{entry_id: {role_or_field_key: [name, ...]}}` — names only, no ids. So this
task adds a second batched loader rather than widening the existing one, whose
return type is consumed elsewhere.

- [ ] **Step 1: Write the failing test**

```python
def test_credit_refs_carry_ids_and_derived_labels(client, manga_with_credits):
    r = client.get(f"/api/manga/{manga_with_credits.system_id}")
    body = r.json()

    assert body["author_plot"] == "諫山創"          # legacy string unchanged
    refs = body["credit_refs"]["author"]
    assert refs[0]["display_name"] == "諫山創"
    assert refs[0]["label"] == "原作"
    assert refs[0]["system_id"]

    assert body["credit_refs"]["illustrator"][0]["label"] == "作畫"


def test_credit_refs_keep_stored_order(client, db_session, manga_with_two_authors):
    """
    media_credit.position carries the order the names had in the comma-joined
    column this table replaced, so "A, B" must still read in that order.
    """
    body = client.get(f"/api/manga/{manga_with_two_authors.system_id}").json()
    assert [r["display_name"] for r in body["credit_refs"]["author"]] == [
        "First Author",
        "Second Author",
    ]


def test_a_list_endpoint_serves_refs_without_an_n_plus_1(
    client, db_session, three_manga_with_credits
):
    """
    attach_link_fields exists to batch; a per-row loader would reintroduce the
    N+1 it was written to remove. The query COUNT is asserted, not just that
    the field is present - presence passes just as happily with an N+1 behind
    it.
    """
    from sqlalchemy import event

    seen = []

    def count(*_args, **_kwargs):
        seen.append(1)

    engine = db_session.get_bind()

    def queries_for(url):
        seen.clear()
        event.listen(engine, "before_cursor_execute", count)
        try:
            body = client.get(url).json()
        finally:
            event.remove(engine, "before_cursor_execute", count)
        return len(seen), body

    two, body = queries_for("/api/manga/?limit=2")
    assert all("credit_refs" in e for e in body)

    three, _ = queries_for("/api/manga/?limit=3")
    assert three == two, "query count grew with the row count"


def test_studio_credits_are_not_in_credit_refs(client, anime_with_studio):
    """
    credit_refs is people only. Studios are the studio session's studio_refs,
    a bare list because studio is a single role.
    """
    body = client.get(f"/api/anime/{anime_with_studio.system_id}").json()
    assert "studio" not in body.get("credit_refs", {})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_entry_link_fields.py -q`
Expected: FAIL — `KeyError: 'credit_refs'`

- [ ] **Step 3: Implement**

Add a batched loader beside `link_values_for_entries`, leaving that function's
return type alone — it is consumed by the Sheets backup and the admin forms,
which want names and nothing else:

```python
def person_refs_for_entries(
    db: Session, media_type: str, entry_ids: list[UUID]
) -> dict[UUID, dict[str, list[dict]]]:
    """
    Every person credit for a batch of entries, with ids and labels.

    Two queries regardless of batch size, matching link_values_for_entries
    beside it. Separate from that function because its callers - the Sheets
    backup and the admin forms - want the comma-joined names and would have to
    ignore the ids.

    Studios are deliberately absent: they are a single role and the studio
    session serves them as a bare `studio_refs` list.
    """
    if not entry_ids:
        return {}

    rows = (
        db.query(models.MediaCredit)
        .filter(
            models.MediaCredit.media_type == media_type,
            models.MediaCredit.entry_id.in_(entry_ids),
            models.MediaCredit.person_id.isnot(None),
        )
        .order_by(models.MediaCredit.position)
        .all()
    )
    if not rows:
        return {}

    people = {
        p.system_id: p
        for p in db.query(models.Person)
        .filter(models.Person.system_id.in_({r.person_id for r in rows}))
        .all()
    }

    out: dict[UUID, dict[str, list[dict]]] = {}
    for row in rows:
        person = people.get(row.person_id)
        if person is None:
            continue
        out.setdefault(row.entry_id, {}).setdefault(row.role, []).append(
            {
                "system_id": str(person.system_id),
                "display_name": person.display_name,
                "label": credit_label(row.role, media_type),
            }
        )
    return out
```

Then set it in `attach_link_fields`, which already has the id list:

```python
    refs = person_refs_for_entries(db, media_type, [e.system_id for e in rows])
    for entry in rows:
        setattr(entry, "credit_refs", refs.get(entry.system_id, {}))
```

Note this runs **before** the existing `if not spec: return` guard, or move
that guard, so an entry type with no legacy link fields still gets refs.

Finally, each media response schema needs the attribute declared, or Pydantic
drops it. Follow whatever the studio session did for `studio_refs`; if they
have not landed, add to each of the eight media response schemas:

```python
    credit_refs: dict[str, list[dict]] = {}
```

- [ ] **Step 4: Run tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_entry_link_fields.py -q`
Expected: PASS

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/credits.py tests/api/test_entry_link_fields.py
git commit -m "feat(person): credit_refs with ids and per-media-type labels"
```

---

### Task 6: `/entries` reverse lookup and the delete guard

**Files:**
- Modify: `app/routers/person.py`
- Modify: `frontend/src/api/endpoints.js:134-142`
- Test: `tests/api/test_person_entries.py` (create), `tests/api/test_person_router.py`

**Interfaces:**
- Consumes: `filter_visible_pairs`, `MEDIA_TABLES`, `credit_label`.
- Produces: `GET /api/person/{id}/entries` → `{groups: [{media_type, label, entries: [...]}]}`; `DELETE /api/person/{id}?credits=N`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_person_entries.py
"""
The entries a person is credited on, with RBAC applied.

Mirrors the studio endpoint. A person carries no content label of their own,
so a person whose every credit is hidden returns empty groups, not a 404 -
the same treatment credit_count already gives in _to_response.
"""


def test_entries_are_grouped_by_media_type(client, person_with_credits):
    body = client.get(f"/api/person/{person_with_credits.system_id}/entries").json()
    manga = next(g for g in body["groups"] if g["media_type"] == "manga")
    assert manga["label"] == "原作"
    assert manga["entries"][0]["display_name"]
    assert "cover_image_file" in manga["entries"][0]


def test_a_labelled_entry_is_hidden_from_a_restricted_viewer(
    restricted_client, person_with_labelled_credit
):
    body = restricted_client.get(
        f"/api/person/{person_with_labelled_credit.system_id}/entries"
    ).json()
    assert all(not g["entries"] for g in body["groups"])


def test_a_superuser_sees_the_labelled_entry(admin_client, person_with_labelled_credit):
    body = admin_client.get(
        f"/api/person/{person_with_labelled_credit.system_id}/entries"
    ).json()
    assert any(g["entries"] for g in body["groups"])


def test_all_credits_hidden_is_empty_not_404(restricted_client, person_with_labelled_credit):
    r = restricted_client.get(
        f"/api/person/{person_with_labelled_credit.system_id}/entries"
    )
    assert r.status_code == 200


def test_delete_rejects_a_stale_credit_count(admin_client, person_with_credits):
    r = admin_client.delete(f"/api/person/{person_with_credits.system_id}?credits=99")
    assert r.status_code == 409
    assert "credits" in r.json()["detail"].lower()


def test_delete_accepts_the_current_credit_count(admin_client, person_with_credits, db_session):
    from app import models

    n = (db_session.query(models.MediaCredit)
         .filter_by(person_id=person_with_credits.system_id).count())
    r = admin_client.delete(f"/api/person/{person_with_credits.system_id}?credits={n}")
    assert r.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_entries.py -q`
Expected: FAIL — 405 on the unknown route

- [ ] **Step 3: Implement**

Read `app/routers/studio.py`'s `/entries` if the studio session has landed it
and follow it exactly; otherwise add to `app/routers/person.py`, **above** the
`/{system_id}` route (that route parses its path as a UUID, so a later
declaration would 422 — the same trap `/role-counts` already documents):

```python
@router.get("/{system_id}/entries", summary="Entries This Person Is Credited On")
def get_person_entries(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The entries this person is credited on, grouped by media type.

    RBAC is correct by construction: hidden entries are absent, exactly as
    _to_response already treats them for credit_count. A person whose every
    credit is hidden returns empty groups rather than 404 - the person carries
    no content label of their own, so their existence is not the secret.
    """
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    rows = (
        db.query(models.MediaCredit)
        .filter(models.MediaCredit.person_id == system_id)
        .order_by(models.MediaCredit.position)
        .all()
    )
    visible = set(
        filter_visible_pairs(
            db, viewer, [(r.media_type, r.entry_id) for r in rows if r.media_type]
        )
    )

    groups: dict[tuple[str, str], list] = {}
    for row in rows:
        key = (row.media_type, row.role)
        groups.setdefault(key, [])
        if (row.media_type, row.entry_id) not in visible:
            continue
        model = MEDIA_TABLES[row.media_type]
        entry = db.get(model, row.entry_id)
        if entry is None:
            continue
        groups[key].append(
            {
                "system_id": str(entry.system_id),
                "display_name": entry.display_name,
                "cover_image_file": getattr(entry, "cover_image_file", None),
                "release_date": getattr(entry, "release_date", None),
            }
        )

    return {
        "groups": [
            {
                "media_type": media_type,
                "role": role,
                "label": credit_label(role, media_type),
                "entries": entries,
            }
            for (media_type, role), entries in groups.items()
        ]
    }
```

And the delete guard:

```python
@router.delete("/{system_id}", summary="Delete Person")
def delete_person(
    system_id: UUID,
    credits: int = Query(..., description="Credit count the admin confirmed"),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """
    Permanently deletes a person. Their credits cascade away with them.

    `credits` is the count the UI showed in its confirmation. If it no longer
    matches, the request is rejected: the admin agreed to destroy a specific
    amount of credit history, and a count that moved underneath them is not
    what they agreed to. Merge remains the correct fix for a duplicate.
    """
    person = db.get(models.Person, system_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    actual = (
        db.query(models.MediaCredit).filter_by(person_id=system_id).count()
    )
    if actual != credits:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This person now has {actual} credits, not {credits}. "
                "Reload and confirm again."
            ),
        )

    db.delete(person)
    db.commit()
    return {"status": "success", "message": "Person deleted successfully."}
```

Add these imports at the top of `app/routers/person.py`:
`from app.utils.credit_roles import PERSON_ROLES, credit_label` and
`from app.utils.media_resolver import MEDIA_TABLES` (`Query` is already
imported from fastapi).

`GET /` needs **no change**: it already applies `scope` when given, and with no
unscoped rows left that filter is now exact. A query without `scope` means
"holds this role in any media type", which is what the admin list wants and
what no dropdown asks for — say so in the docstring, since the old behaviour
("scope only matters for director") is what a reader will assume.

Add `entries: (id) => \`/api/person/${id}/entries\`` to `endpoints.js` and give
`remove` the count: `remove: (id, credits) => \`/api/person/${id}?credits=${credits}\``.
Every existing `remove` caller must pass the count, so grep for
`endpoints.person.remove` before moving on.

- [ ] **Step 4: Run tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_person_entries.py tests/api/test_person_router.py -q`
Expected: PASS. Existing delete tests will need the new query parameter.

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`

- [ ] **Step 5: Commit**

```bash
git add app/routers/person.py frontend/src/api/endpoints.js \
        tests/api/test_person_entries.py tests/api/test_person_router.py
git commit -m "feat(person): entries reverse lookup and a guarded delete"
```

---

### Task 7: Frontend config catches up to the vocabulary

Pure config. Nothing renders differently yet, but every dropdown starts asking
for the right `{role, scope}` pair.

**Files:**
- Modify: `frontend/src/config/formFields/fieldMeta.js` (lines 151, 307, 313, 322, 372, 465, 471, 558, 564, 634, 640)
- Modify: `frontend/src/pages/admin/SystemOptions.jsx:26-57` (`BECAME_ENTITIES`)
- Modify: `frontend/src/lib/ensureSourceValues.js`
- Test: `frontend/src/config/fieldOptions.test.js`, `frontend/src/lib/ensureSourceValues.test.js`

**Interfaces:**
- Consumes: the collapsed vocabulary (Task 2).
- Produces: ten `source: {kind: "person", role, scope}` descriptors, every one with a scope.

- [ ] **Step 1: Write the failing test**

The exports are `COMMON_FIELD_META`, `TYPE_FIELD_META` and the derived
`PERSON_SOURCES` — there is no single `FIELD_META` object, so the test walks
both groups the way `collectPersonSources` does.

```js
// frontend/src/config/fieldOptions.test.js
import { describe, expect, it } from "vitest";
import {
  COMMON_FIELD_META,
  PERSON_SOURCES,
  TYPE_FIELD_META,
} from "./formFields/fieldMeta";

const LEGAL = {
  director: ["anime", "anime-movie", "movie"],
  producer: ["anime"],
  composer: ["anime"],
  author: ["manga", "novel", "comic"],
  illustrator: ["manga", "novel", "comic"],
};

function everyMeta() {
  return [COMMON_FIELD_META, ...Object.values(TYPE_FIELD_META)].flatMap((g) =>
    Object.values(g),
  );
}

describe("person field sources", () => {
  it("every person source names a role and a scope", () => {
    for (const meta of everyMeta()) {
      if (meta.source?.kind !== "person") continue;
      expect(meta.source.role, JSON.stringify(meta.source)).toBeTruthy();
      expect(meta.source.scope, JSON.stringify(meta.source)).toBeTruthy();
    }
  });

  it("every scope is legal for its role", () => {
    for (const meta of everyMeta()) {
      if (meta.source?.kind !== "person") continue;
      expect(LEGAL[meta.source.role]).toContain(meta.source.scope);
    }
  });

  it("no retired role key survives", () => {
    const retired = ["manga_author", "novel_author", "novel_illustrator",
                     "comic_writer", "comic_artist", "non_anime"];
    const json = JSON.stringify([COMMON_FIELD_META, TYPE_FIELD_META]);
    for (const key of retired) expect(json).not.toContain(`"${key}"`);
  });

  it("asks for ten distinct role/scope pairs", () => {
    const keys = PERSON_SOURCES.map((s) => `${s.role}|${s.scope}`);
    expect(new Set(keys).size).toBe(10);
    expect(keys).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/config/fieldOptions.test.js`
Expected: FAIL — retired keys present

- [ ] **Step 3: Update the descriptors**

| field (line) | was | becomes |
|---|---|---|
| anime director (151) | `director` / `anime` | unchanged |
| anime producer (307) | `producer` / — | `producer` / `anime` |
| anime music (313) | `composer` / — | `composer` / `anime` |
| anime-movie director (322 area) | `director` / `anime` | `director` / `anime-movie` |
| movie director (372) | `director` / `non_anime` | `director` / `movie` |
| manga 原作 (465) | `manga_author` / — | `author` / `manga` |
| manga 作畫 (471) | `manga_author` / — | `illustrator` / `manga` |
| novel author (558) | `novel_author` / — | `author` / `novel` |
| novel illustrator (564) | `novel_illustrator` / — | `illustrator` / `novel` |
| comic writer (634) | `comic_writer` / — | `author` / `comic` |
| comic artist (640) | `comic_artist` / — | `illustrator` / `comic` |

Also update the comment block at line 137 (`person -> /api/person?role=&scope=`)
to say the scope is always present, and the block at 724 that explains the
pair deduplication — the count is now ten.

Rewrite `BECAME_ENTITIES` in `SystemOptions.jsx`: `Manga Author` now maps to two
roles rather than one, and `Novel Author`, `Comic Writer` and `Comic Artist`
name role keys that no longer exist. Their `detail` strings need rewriting too —
"two credit roles imply it: 原作 and 作画" is no longer how it works, and the
director row's "scoped anime / non_anime on person_role" is now
"scoped by media type on person_role".

In `ensureSourceValues.js`, the POST body must now send a scope with the role.

- [ ] **Step 4: Run frontend gates**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all pass. The build matters — :8000 serves the prebuilt bundle.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/config/formFields/fieldMeta.js \
        frontend/src/config/fieldOptions.test.js \
        frontend/src/pages/admin/SystemOptions.jsx \
        frontend/src/lib/ensureSourceValues.js \
        frontend/src/lib/ensureSourceValues.test.js
git commit -m "feat(person): point every dropdown at a role and a media-type scope"
```

---

### Task 8: Entity → Person admin tab

**Files:**
- Modify: `frontend/src/config/adminTabs.js`
- Create: `frontend/src/components/forms/PersonSubTabBar.jsx`
- Create: `frontend/src/components/forms/PersonForm.jsx`
- Modify: `frontend/src/components/forms/OptionSubTabBar.jsx`
- Modify: `frontend/src/pages/admin/Add.jsx` (the person block, ~1025-1049), `Modify.jsx`, `Delete.jsx`
- Test: `frontend/src/components/forms/PersonSubTabBar.test.jsx` (create)

**Interfaces:**
- Consumes: `/api/person` endpoints (Task 6), `legal_scopes` semantics (Task 2).
- Produces: `PERSON_SUB_TABS` (five entries), `<PersonForm person roles onChange />`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/forms/PersonSubTabBar.test.jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PersonSubTabBar, { PERSON_SUB_TABS } from "./PersonSubTabBar";

describe("PersonSubTabBar", () => {
  it("offers exactly the five person types", () => {
    expect(PERSON_SUB_TABS.map((t) => t.key)).toEqual([
      "director", "producer", "composer", "author", "illustrator",
    ]);
  });

  it("labels composer as it reads in the forms", () => {
    expect(PERSON_SUB_TABS.find((t) => t.key === "composer").label)
      .toBe("Music / Composer");
  });

  it("marks the active tab and calls back on select", async () => {
    const onSelect = vi.fn();
    render(<PersonSubTabBar active="author" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /Author/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/forms/PersonSubTabBar.test.jsx`
Expected: FAIL — cannot resolve `./PersonSubTabBar`

- [ ] **Step 3: Build the sub-tab bar**

```jsx
// frontend/src/components/forms/PersonSubTabBar.jsx
// The five person types, shared by the admin Add / Modify / Delete pages so
// the three cannot drift apart — the same job OptionSubTabBar does for the
// System Option tab.
//
// The sub-tab filters WHICH PEOPLE ARE LISTED and preselects the type for a
// new person. It deliberately does not scope the form: a person is one row and
// may hold several types, so PersonForm always shows their full role x scope
// matrix.
export const PERSON_SUB_TABS = [
  { key: "director", label: "Director", icon: "fa-clapperboard" },
  { key: "producer", label: "Producer", icon: "fa-briefcase" },
  { key: "composer", label: "Music / Composer", icon: "fa-music" },
  { key: "author", label: "Author", icon: "fa-pen-nib" },
  { key: "illustrator", label: "Illustrator", icon: "fa-paintbrush" },
];

export default function PersonSubTabBar({ active, onSelect }) {
  return (
    <div className="flex gap-1 border-b border-border mb-4">
      {PERSON_SUB_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          className={`px-4 py-2 text-sm font-bold flex items-center gap-2 border-b-2 -mb-px transition ${
            active === t.key
              ? "border-brand text-brand"
              : "border-transparent text-text-faint hover:text-text-muted"
          }`}
        >
          <i className={`fas ${t.icon}`}></i>
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build `PersonForm` and wire the three pages**

Extract the existing `PersonForm` out of `Add.jsx` (~line 101) into
`components/forms/PersonForm.jsx` so Add, Modify and Delete share one editor.
The role matrix is the new part — today's form has a single role select and a
free-text scope:

```jsx
// frontend/src/components/forms/PersonForm.jsx
// The person editor, shared by the admin Add / Modify / Delete pages.
//
// Lifted out of Add.jsx, where only that page could reach it, and extended
// with the role x scope matrix. A person is ONE row that may hold several
// types, so this form always shows every type they hold — the Person tab's
// sub-tab filters the list and preselects a type for a new person, but it
// never narrows what the form edits.
import { Field } from "./FormField";
import ScopePicker from "./ScopePicker";
import { PERSON_SUB_TABS } from "./PersonSubTabBar";

const NAME_FIELDS = [
  ["name_en", "Name (EN)"],
  ["name_cn", "Name (CN)"],
  ["name_jp", "Name (JP)"],
  ["name_alt", "Name (Alt)"],
];

export default function PersonForm({ form, setForm, legalScopes }) {
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function setRoleScopes(role, scopes) {
    setForm((f) => {
      const others = (f.roles || []).filter((r) => r.role !== role);
      return { ...f, roles: [...others, ...scopes.map((s) => ({ role, scope: s }))] };
    });
  }

  const held = new Set((form.roles || []).map((r) => r.role));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {NAME_FIELDS.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className="w-full rounded border border-border bg-surface px-2 py-1"
              value={form[key] || ""}
              onChange={(e) => upd(key, e.target.value)}
            />
          </Field>
        ))}
      </div>

      <Field
        label="Display name"
        hint="Which name to show. Automatic falls back en → cn → jp → alt."
      >
        <select
          className="w-full rounded border border-border bg-surface px-2 py-1"
          value={form.display_name_field || ""}
          onChange={(e) => upd("display_name_field", e.target.value || null)}
        >
          <option value="">Automatic (en → cn → jp → alt)</option>
          {NAME_FIELDS.map(([key, label]) => (
            <option key={key} value={key.replace("name_", "")}>{label}</option>
          ))}
        </select>
      </Field>

      {/* One ScopePicker per type. Every row a person holds carries a scope;
          clearing every scope for a type removes the type. */}
      {PERSON_SUB_TABS.map((t) => (
        <div key={t.key} className="rounded border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={held.has(t.key)}
              onChange={(e) =>
                setRoleScopes(t.key, e.target.checked ? [legalScopes[t.key][0]] : [])
              }
            />
            {t.label}
          </label>
          {held.has(t.key) && (
            <ScopePicker
              scopes={(form.roles || [])
                .filter((r) => r.role === t.key)
                .map((r) => r.scope)}
              setScopes={(next) =>
                setRoleScopes(
                  t.key,
                  typeof next === "function"
                    ? next((form.roles || [])
                        .filter((r) => r.role === t.key)
                        .map((r) => r.scope))
                    : next,
                )
              }
              mediaTypes={legalScopes[t.key]}
            />
          )}
        </div>
      ))}

      {/* gender, my_rating, photo_file and remark carry over unchanged from
          the block being extracted out of Add.jsx. */}
    </div>
  );
}
```

`legalScopes` is `{director: [...], producer: [...], ...}`. Serve it from
`/api/constants` (add it there from `CREDIT_ROLES`) rather than hard-coding it
in the frontend, so the two vocabularies cannot drift — that is the same
mistake `OptionsAddTab.jsx` documents in its own header comment about the
person-role list.

`adminTabs.js`: add `{ key: "person", group: "entity", icon: "fa-user", label: "Person" }`.
The `entity` group itself comes from the studio session — **if `TAB_GROUPS` does
not yet contain it, add it** as
`{ key: "entity", icon: "fa-industry", label: "Entity" }` and expect a conflict
when their work lands; re-read before staging. Exclude `person` from `FORM_TABS`
like `options`, `quote` and `meme`: a person is not a media entry and has no
default field values.

`OptionSubTabBar.jsx`: delete the `people` entry. If `studios` is also gone by
then, `OPTION_SUB_TABS` and `OPTION_VALUE_SUB_TABS` are identical and collapse
into one exported constant — remove the comment explaining the split, since
there is no longer one.

`Delete.jsx`: the person branch shows the live credit count from
`GET /api/person/{id}`, requires confirmation, sends
`?credits=<count>`, and states that merge is the correct fix for a duplicate.

- [ ] **Step 5: Run frontend gates**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

Then check both ports by hand: add a person under Entity → Person → Author with
scope `manga`, confirm they appear in the manga 原作 dropdown and **not** in the
novel Author dropdown.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/config/adminTabs.js \
        frontend/src/components/forms/PersonSubTabBar.jsx \
        frontend/src/components/forms/PersonSubTabBar.test.jsx \
        frontend/src/components/forms/PersonForm.jsx \
        frontend/src/components/forms/OptionSubTabBar.jsx \
        frontend/src/pages/admin/Add.jsx \
        frontend/src/pages/admin/Modify.jsx \
        frontend/src/pages/admin/Delete.jsx
git commit -m "feat(person): Entity > Person admin tab with a sub-tab per type"
```

---

### Task 9: Public person pages

**Files:**
- Create: `frontend/src/pages/library/PersonLibrary.jsx`, `frontend/src/pages/detail/Person.jsx`
- Modify: `frontend/src/lib/naming.js`, `frontend/src/App.jsx`, `frontend/src/components/layout/Nav.jsx`
- Modify: the six detail pages that render credits as flat text
- Test: `frontend/src/lib/naming.test.js`, `frontend/src/pages/library/PersonLibrary.test.jsx` (create)

**Interfaces:**
- Consumes: `/api/person`, `/api/person/{id}/entries` (Task 6), `credit_refs` (Task 5).
- Produces: `displayPersonName(person) -> string`; routes `/library/person`, `/person/:system_id`.

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/lib/naming.test.js — add to the existing file
import { displayPersonName } from "./naming";

describe("displayPersonName", () => {
  it("honours display_name_field", () => {
    expect(displayPersonName({
      name_en: "Ryan Coogler", name_cn: "瑞恩·庫格勒", display_name_field: "cn",
    })).toBe("瑞恩·庫格勒");
  });

  it("falls back when the chosen field is empty", () => {
    expect(displayPersonName({ name_jp: "諫山創", display_name_field: "cn" }))
      .toBe("諫山創");
  });

  it("falls back en -> cn -> jp -> alt when unset", () => {
    expect(displayPersonName({ name_cn: "渡部高志", name_jp: "x" })).toBe("渡部高志");
    expect(displayPersonName({ name_alt: "only" })).toBe("only");
  });

  it("returns an empty string for a nameless person", () => {
    expect(displayPersonName({})).toBe("");
  });
});
```

```jsx
// frontend/src/pages/library/PersonLibrary.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonLibrary from "./PersonLibrary";

const PEOPLE = [
  { system_id: "1", name_en: "Jon Favreau", credit_count: 3 },
  { system_id: "2", name_cn: "渡部高志", credit_count: 8 },
  { system_id: "3", name_jp: "諫山創", credit_count: 1 },
  { system_id: "4", name_alt: "Pen Name", credit_count: 0 },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(PEOPLE) })),
  );
});

describe("PersonLibrary", () => {
  it("searches across all four name fields", async () => {
    const user = userEvent.setup();
    render(<PersonLibrary />);
    await waitFor(() => expect(screen.getByText("Jon Favreau")).toBeInTheDocument());

    const box = screen.getByRole("searchbox");
    for (const [term, kept] of [
      ["Favreau", "Jon Favreau"],
      ["渡部", "渡部高志"],
      ["諫山", "諫山創"],
      ["Pen", "Pen Name"],
    ]) {
      await user.clear(box);
      await user.type(box, term);
      await waitFor(() => expect(screen.getByText(kept)).toBeInTheDocument());
      expect(screen.queryAllByRole("link")).toHaveLength(1);
    }
  });

  it("sorts by credit count", async () => {
    const user = userEvent.setup();
    render(<PersonLibrary />);
    await waitFor(() => expect(screen.getByText("渡部高志")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/sort/i), "credits");
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards[0]).toContain("渡部高志");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/naming.test.js`
Expected: FAIL — `displayPersonName is not a function`

- [ ] **Step 3: Implement**

`naming.js` — mirror the backend property exactly. If the studio session has
landed `displayStudioName`, the two are the same function over a different field
list; factor the shared part rather than copying it:

```js
const PERSON_NAME_ORDER = ["name_en", "name_cn", "name_jp", "name_alt"];
const FIELD_BY_KEY = { en: "name_en", cn: "name_cn", jp: "name_jp", alt: "name_alt" };

export function displayPersonName(person) {
  if (!person) return "";
  const chosen = FIELD_BY_KEY[person.display_name_field || ""];
  if (chosen && person[chosen]?.trim()) return person[chosen].trim();
  for (const f of PERSON_NAME_ORDER) {
    if (person[f]?.trim()) return person[f].trim();
  }
  return "";
}
```

`PersonLibrary.jsx` — follow `StudioLibrary.jsx`, or `FranchiseLibrary.jsx` if
studio's has not landed. Both sit outside the `LIBRARY_CONFIGS` media-type
machinery because they are not media types, and neither is a person. Cards with
photo, display name and credit count; a type filter driven by
`PERSON_SUB_TABS`; search across all four names; sort by name, credit count or
rating.

`Person.jsx` — photo, display name with the other names beneath (as
`getNamingFields` renders them today), rating, gender, remark, then the
`/entries` groups as `MediaCard`s under their derived label heading.

`App.jsx` — both routes lazy-loaded, matching the existing route-level code
splitting. `Nav.jsx` — a Person entry in the catalog drawer beside Studio. Note
the Nav mobile panel still uses `slate-*` utilities (known debt); do not add
more, use tokens.

The six detail pages render `credit_refs` as linked chips where they render flat
text today: `Anime.jsx` (director, producer, music), `AnimeMovie.jsx` and
`Movie.jsx` (director), `Manga.jsx`, `Novel.jsx`, `Comic.jsx` (author,
illustrator). The label comes from the ref, not from the page.

- [ ] **Step 4: Run frontend gates**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

Then check `/library/person` and one `/person/:id` on both :5173 and :8000, in
light and dark mode.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/library/PersonLibrary.jsx \
        frontend/src/pages/library/PersonLibrary.test.jsx \
        frontend/src/pages/detail/Person.jsx frontend/src/lib/naming.js \
        frontend/src/lib/naming.test.js frontend/src/App.jsx \
        frontend/src/components/layout/Nav.jsx \
        frontend/src/pages/detail/Anime.jsx frontend/src/pages/detail/AnimeMovie.jsx \
        frontend/src/pages/detail/Movie.jsx frontend/src/pages/detail/Manga.jsx \
        frontend/src/pages/detail/Novel.jsx frontend/src/pages/detail/Comic.jsx
git commit -m "feat(person): public person library and detail pages"
```

---

### Task 10: Documentation

`CLAUDE.md` requires the matching doc to change with the behaviour, each with
its `Last verified` line bumped. This is a task, not an afterthought.

**Files:**
- Modify: `docs/systems/credits-and-tags.md`, `docs/data-model.md`, `docs/options.md`, `docs/api.md`, `docs/business-rules.md`, `docs/frontend/pages.md`, `docs/frontend/admin-pages.md`, `docs/frontend/components.md`, `docs/notes/migrations-history.md`, `docs/roadmap.md`

- [ ] **Step 1: Rewrite `docs/systems/credits-and-tags.md`**

The largest edit. Its `CREDIT_ROLES` and `TAG_FIELDS` tables, the "two
vocabularies on purpose" rationale, the director-scope paragraph and the
`LEGACY_SHEET_COLUMN` section all describe the old design. Replace with: one
vocabulary of five, labels derived per media type, scope as a NOT NULL
media-type key, and the retired keys listed so a reader of old data knows what
they were.

- [ ] **Step 2: Update the rest**

- `data-model.md` — both reshaped tables and their constraints.
- `options.md` — why person scope and option scope differ (spec Decision B).
  This is the doc that stops the next reader "fixing" the inconsistency.
- `api.md` — `/entries`, the `?credits=` delete guard, `credit_refs`.
- `business-rules.md` — labels derived from `(role, media_type)`.
- `frontend/pages.md`, `frontend/admin-pages.md`, `frontend/components.md` —
  the public pages, the Entity → Person tab, `PersonSubTabBar`.
- `notes/migrations-history.md` — both revisions.
- `roadmap.md` — add this work to "Done" (newest first). Remove the "Public
  person and studio pages deferred" debt line **only if** the studio session's
  half has also landed; otherwise leave their half. Do not rewrite the plan
  sections.

- [ ] **Step 3: Bump every `Last verified` line you touched**

- [ ] **Step 4: Run all four gates one final time**

```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(person): one role vocabulary, media-type scopes, entity pages"
```

---

## Handoff notes

- **Ask before pushing.** `CLAUDE.md`: never commit or push automatically after
  finishing; the user approves. This plan's per-task commits are the intended
  granularity, but confirm before the first one.
- **The multi-head Alembic state is pre-existing and not yours to fix.** Raise
  it; do not merge other sessions' revisions.
- **Files shared with the studio session:** `app/models/staff.py`,
  `app/services/domain/credits.py`, `app/schemas/staff.py`,
  `frontend/src/config/adminTabs.js`, `frontend/src/lib/naming.js`,
  `frontend/src/pages/admin/Add.jsx`. Re-read before every edit; if an edit
  fails to match, the file moved under you.
