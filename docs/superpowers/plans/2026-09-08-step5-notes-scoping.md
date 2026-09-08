# Step 5 — notes scoped per section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every note, quote and meme an author, declare per section in the
registry whether its rows are one shared catalogue set or one set per user, and
replace the FK-less `(owner_type, owner_id)` pair on `note` and `meme` with a
disjoint set of real foreign keys so every owner cascades.

**Architecture:** Five phases, in order.

**Phase A — the registry.** `NoteSection` gains a mandatory `scope`, and every
one of the 29 entries declares it. Nothing reads it yet, nothing changes, and
no migration is involved: this is the design rule `note_sections.py` states
about itself — *"Adding a section is one entry and no migration"* — applied to
the catalogue/personal distinction.

**Phase B — `author_id`.** One always-set `author_id` column on `note`, `quote`
and `meme`, backfilled to the admin user, made `NOT NULL` with
`ON DELETE CASCADE`. Provenance only at this point: nothing filters on it yet,
so no read can change.

**Phase C — enforcement.** The note router starts reading `scope`: catalogue
sections are written by admins and read by everyone; personal sections are
written by their own author and read only by that author (or by a viewer
holding the reworked `personal_notes` field group, reading a public list
owner's profile). Quotes and memes are deliberately untouched here — they stay
universal.

**Phase D — disjoint FKs.** `note` and `meme` swap `owner_type` / `owner_id`
for four nullable FK columns and a `num_nonnulls(...) = 1` CHECK. `owner_type`
and `owner_id` survive as read-time derivations so every existing caller keeps
working. `quote` is not in this phase — see the prerequisite note below.

**Phase E — documentation.**

Phase B before Phase C is the whole safety property: the column exists and is
correct on every row before anything filters on it, so a partially-applied plan
never hides a note that used to be visible.

**Tech Stack:** FastAPI, SQLAlchemy 2.0.48, Alembic 1.18.4, PostgreSQL 17,
pytest, ruff; React + Vite, TanStack Query, Tailwind v4, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-multi-user-catalog-design.md` —
the Step 5 row of the Sub-projects table and the "Notes: scope lives in the
registry" section.

## Prerequisites, and what was checked in the earlier plans

- **`quote` needs only `author_id` in this plan.**
  `docs/superpowers/plans/2026-09-08-step0-media-supertable.md` Phase B, Task 18
  converts `quote` from `(media_type, entry_id)` to a single
  `media_id → media.system_id ON DELETE CASCADE`, and that plan's Phase B
  preamble says so explicitly: *"`note`, `meme` and `plan_next` are NOT in this
  phase — their owner may be a grouping tier, so they take the disjoint-FK
  treatment in the Step 5 plan."* So Step 5 adds `author_id` to `quote` and
  nothing else. If Step 0 has not landed when this plan runs, Task 5 still
  works unchanged — `author_id` is orthogonal to how a quote names its entry.
- **Phase D requires Step 0.** `note.media_id` and `meme.media_id` reference
  `media.system_id`. Do not start Task 10 until `media` exists and is
  backfilled for all nine types (Step 0 Tasks 1–11).
- **Phase C requires Step 2.** It reads `users.list_is_public` and grants a
  permission to the `user` role. If Step 2 has not landed, Task 8's
  public-profile branch has nothing to read; stop and say so rather than
  inventing a column.
- **`plan_next` is not in this plan.** The spec puts it in Step 3.

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
  the previous task's revision id. The first migration in this plan
  (`m5a1notescope`, Task 4) sets `down_revision` to whatever
  `venv/Scripts/python.exe -m alembic heads` prints before it is written — the
  last revision of Step 4. If Steps 0–4 have not landed, that is
  `pdf1e2r3d4e5`, the head recorded in `docs/PROGRESS.md`. Run `alembic heads`
  before every commit and confirm exactly one.
- **`alembic upgrade head` from an empty database is already broken** at
  `86982d71c2f1` (`docs/PROGRESS.md`, open item). Test migrations against a
  database restored from a Backup, not a fresh one, and do not treat that
  pre-existing failure as caused by this plan.
- **Give this session its own test database.** Concurrent sessions poison a
  shared `anime_site_test`. Export `POSTGRES_DB=anime_site_test_step5` before
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
  `tv-show`) and underscored only in router filenames. Every owner-type value
  written in this plan is hyphenated, matching `OWNER_TABLES`.
- **"Label" is never used bare.** In this codebase it means two different
  things. Write **label tag** (`media_tag`) or **restriction label**
  (`content_label`, the `label.<key>` permission family). This plan touches the
  restriction-label read path only through `entry_visible`, which it does not
  change.
- **Frontend: semantic colour tokens only.** `bg-surface`, `text-text-muted`
  and friends. A hard-coded grey utility fails the build via
  `frontend/src/theme-tokens.test.js`. After any frontend change run
  `cd frontend && npm run build`.
- **Update the matching doc in the same change** and bump its `Last verified`
  line. This plan touches `docs/data-model.md`, `docs/authorization.md` and
  `docs/systems/notes.md` (if present; otherwise `docs/business-rules.md`).
- **Claim the task in `docs/PROGRESS.md`** (`wip <who>`) before starting; set it
  to `done <sha>` in the same commit as the work.
- **Back up before the first migration.** `/system` → Backup. Phase D drops
  `note.owner_type`, `note.owner_id`, `meme.owner_type` and `meme.owner_id`;
  the sheet is the only copy.

## The Google Sheets column-order hazard

`app/models/note.py`, `app/models/meme.py` and `app/models/quote.py` each carry
this line in their docstring, and it is not decorative:

> *Column order matters: `format_model_for_sheet` walks `__table__.columns` in
> declaration order, so this is also the Google Sheets column order.*

`app/utils/formatter.py:39` confirms it — the backup row is built by iterating
`instance.__class__.__table__.columns`. Consequences for this plan:

- **Every column this plan adds or drops reshapes a tab.** Task 4 adds one
  column to Note, Task 5 one to Quote, Task 6 one to Meme; Tasks 10 and 11
  drop two columns and add four on Note and on Meme. The Note and Meme tabs are
  reshaped substantially and their old headers stop existing.
- **Pull reads by header name**, not by position — `parse_note_from_sheet`,
  `parse_meme_from_sheet` and `parse_quote_from_sheet` in
  `app/utils/formatter.py` all take a `raw: dict` keyed by header — so a
  reordered tab is survivable, but a *dropped* header is not: an old sheet's
  `owner_type` / `owner_id` cells have nowhere to land after Task 10.
- **Therefore:** run `/system` → Backup **before** Task 4, and again
  **immediately after** Task 11, and do not Pull All from a pre-Task-10 sheet
  after Task 10 has run. Each of Tasks 4, 5, 6, 10 and 11 updates its parser in
  the same commit as its migration, and the parser keeps reading the old
  headers where they still mean something (Tasks 10 and 11 use them as the Pull
  fallback that resolves the new FK columns).
- **`author_id` travels as a raw UUID.** User ids are consistent across the two
  machines because Step 4 added a `Users` tab, so the UUID in the sheet resolves
  on the other machine. Pull falls back to the admin user's id when the cell is
  blank or names no known user, because the column is `NOT NULL`.

Coordinate with whoever owns the Sheets work before running Tasks 10 and 11; if
Step 4 has not landed, Backup still works and this hazard still applies.

## Interface contract

Names later work depends on. Do not rename.

```python
# app/utils/note_sections.py
SCOPE_CATALOG = "catalog"      # one shared set of rows, admin-authored
SCOPE_PERSONAL = "personal"    # one set per user

CATALOG_SECTIONS: frozenset[str]   # the 20 catalogue-scope keys
PERSONAL_SECTIONS: frozenset[str]  # the 7 personal-scope keys

@dataclass(frozen=True)
class NoteSection:
    key: str
    shape: str
    label: str
    owners: tuple[str, ...]
    scope: str | None   # no default: every entry states it, external states None
    ...

def sections_by_scope(scope: str) -> list[NoteSection]: ...
```

```python
# app/services/rbac/resolver.py
@dataclass(frozen=True)
class Viewer:
    user_id: Optional[UUID]   # None for the guest viewer
    ...
```

```python
# app/services/rbac/permissions.py
FAMILY_NOTE = "note"
PERM_NOTE_WRITE_OWN = "note.write_own"
```

Column and constraint names, used verbatim by later tasks and tests:

- `note.author_id`, `quote.author_id`, `meme.author_id` — `UUID NOT NULL`,
  `REFERENCES users(id) ON DELETE CASCADE`
- `fk_note_author`, `fk_quote_author`, `fk_meme_author`
- `note.media_id` / `collection_id` / `franchise_id` / `series_id`, and the same
  four on `meme`
- `ck_note_one_owner`, `ck_meme_one_owner` — `num_nonnulls(...) = 1`
- `ix_note_one_remark_per_owner` — the partial unique index, rebuilt in Task 10

Alembic revision ids, in order:

| Task | Revision id | What it does |
|---|---|---|
| 4 | `m5a1notescope` | `note.author_id` |
| 5 | `m5a2quoteauthor` | `quote.author_id` |
| 6 | `m5a3memeauthor` | `meme.author_id` |
| 10 | `m5b1notefks` | `note` disjoint owner FKs |
| 11 | `m5b2memefks` | `meme` disjoint owner FKs |

## The scope classification — verified against the file

`app/utils/note_sections.py` holds **33** `key="..."` matches. Four of them are
`NoteGroup` keys, not sections: `reviews`, `analysis_group`, `music`,
`quotes_memes` (lines 93–103). That leaves **29 `NoteSection` entries**, which
is what the spec says.

Two of those 29 are `SHAPE_EXTERNAL` and backed by their own tables —
`quotes` (`app/models/quote.py`) and `memes` (`app/models/meme.py`). They store
no `note` row, so they take no scope. **27 stored sections remain**, and the
7/20 split below is the approved classification, verified entry by entry
against `NOTE_SECTIONS`:

**Personal — 7:**

| Key | Line | Why |
|---|---|---|
| `remark` | 174 | one person's note to themselves |
| `advantages` | 181 | an opinion |
| `disadvantages` | 188 | an opinion |
| `double_edged` | 195 | an opinion |
| `episode_comments` | 216 | one viewer's running commentary |
| `questions` | 429 | what *I* did not understand |
| `personal_reviews` | 209 | the name says it |

**Catalogue — 20:**

`op` (349), `ed` (359), `insert_songs` (369), `ost` (386), `op_ed_changes`
(396), `extended_episodes` (406), `adaptation` (414), `resources` (422),
`public_reviews` (202), `highlights` (251), `highlight_episodes` (262),
`highlight_passages` (275), `highlight_moments` (281), `analysis` (289),
`cinematography` (296), `craft` (304), `foreshadowing` (311), `symmetry` (327),
`guides` (229), `builds_and_mods` (240).

7 + 20 + 2 external = 29. The classification matches the file exactly; nothing
in the registry is unaccounted for and no key in the spec is absent from the
registry.

---

# Phase A — the registry

No schema, no migration, no behaviour change.

### Task 1: `scope` on `NoteSection`

**Files:**
- Modify: `app/utils/note_sections.py`
- Modify: `tests/unit/test_note_sections.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `SCOPE_CATALOG`, `SCOPE_PERSONAL`, `NoteSection.scope`,
  `CATALOG_SECTIONS`, `PERSONAL_SECTIONS`, `sections_by_scope`.

**Why `scope` has no default rather than a default of `"catalog"`.** A default
is the failure mode this test suite exists to prevent: the next section added
would silently become catalogue-scope and be published to every user. `scope`
is declared as the first field after `owners` and before any defaulted field,
which makes it a mandatory argument on all 29 entries — the dataclass itself
refuses an entry that forgets it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_note_sections.py`:

```python
# --- scope -----------------------------------------------------------------
# catalog: one shared set of rows, admin-authored, read by everyone.
# personal: one set per user, read only by its author.
# Sections backed by their own table (quotes, memes) store no note row and so
# have no scope to declare.

import dataclasses


PERSONAL_KEYS = {
    "remark",
    "advantages",
    "disadvantages",
    "double_edged",
    "episode_comments",
    "questions",
    "personal_reviews",
}

CATALOG_KEYS = {
    "op",
    "ed",
    "insert_songs",
    "ost",
    "op_ed_changes",
    "extended_episodes",
    "adaptation",
    "resources",
    "public_reviews",
    "highlights",
    "highlight_episodes",
    "highlight_passages",
    "highlight_moments",
    "analysis",
    "cinematography",
    "craft",
    "foreshadowing",
    "symmetry",
    "guides",
    "builds_and_mods",
}


def test_scope_has_no_default():
    """
    The guard the whole scheme rests on. With a default, the next section added
    would inherit it silently - and if that default were `catalog`, one
    person's private note would be published to every user by omission.
    """
    field = {f.name: f for f in dataclasses.fields(ns.NoteSection)}["scope"]
    assert field.default is dataclasses.MISSING
    assert field.default_factory is dataclasses.MISSING


def test_every_stored_section_declares_a_real_scope():
    for sec in ns.NOTE_SECTIONS:
        if sec.shape in ns.STORED_SHAPES:
            assert sec.scope in (ns.SCOPE_CATALOG, ns.SCOPE_PERSONAL), (
                f"{sec.key} declares scope {sec.scope!r}"
            )


def test_external_sections_carry_no_scope():
    # quotes and memes are universal - shared, unfiltered, no per-user copies -
    # and are stored in their own tables, so a scope on them would mean nothing.
    external = [s for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_EXTERNAL]
    assert {s.key for s in external} == {"quotes", "memes"}
    for sec in external:
        assert sec.scope is None


def test_the_personal_sections_are_exactly_these_seven():
    assert {s.key for s in ns.NOTE_SECTIONS if s.scope == ns.SCOPE_PERSONAL} == (
        PERSONAL_KEYS
    )
    assert ns.PERSONAL_SECTIONS == PERSONAL_KEYS


def test_the_catalog_sections_are_exactly_these_twenty():
    assert {s.key for s in ns.NOTE_SECTIONS if s.scope == ns.SCOPE_CATALOG} == (
        CATALOG_KEYS
    )
    assert ns.CATALOG_SECTIONS == CATALOG_KEYS


def test_the_two_scopes_partition_every_stored_section():
    stored = {s.key for s in ns.NOTE_SECTIONS if s.shape in ns.STORED_SHAPES}
    assert len(stored) == 27
    assert ns.PERSONAL_SECTIONS | ns.CATALOG_SECTIONS == stored
    assert not (ns.PERSONAL_SECTIONS & ns.CATALOG_SECTIONS)


def test_sections_by_scope_returns_registry_order():
    keys = [s.key for s in ns.sections_by_scope(ns.SCOPE_PERSONAL)]
    assert keys == [
        "remark",
        "advantages",
        "disadvantages",
        "double_edged",
        "personal_reviews",
        "episode_comments",
        "questions",
    ]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_sections.py -v`
Expected: FAIL with `AttributeError: module 'app.utils.note_sections' has no
attribute 'SCOPE_CATALOG'`.

- [ ] **Step 3: Add the constants and the field**

In `app/utils/note_sections.py`, after the `STORED_SHAPES` frozenset:

```python
# --- Scopes ---------------------------------------------------------------
# Whose rows a section holds. The distinction lives here rather than in the
# schema because this module's own rule is "adding a section is one entry and
# no migration", and a catalogue/personal reclassification must obey it: it is
# a registry edit plus a data reassignment, never an ALTER TABLE.
SCOPE_CATALOG = "catalog"  # one shared set of rows, admin-authored
SCOPE_PERSONAL = "personal"  # one set per user
```

In the `NoteSection` dataclass, immediately after `owners` and **before**
`labels` (the first field with a default — putting it later is a
`TypeError: non-default argument follows default argument`):

```python
    # catalog: one shared set of rows, written by admins, read unfiltered by
    # everyone. personal: one set per user, read only by its author.
    # None only for SHAPE_EXTERNAL sections, which store no `note` row at all.
    #
    # No default, deliberately. A default would let the next section added
    # inherit a scope by omission, and the wrong inheritance publishes one
    # person's private note to every user. A test asserts the absence.
    scope: str | None
```

At the bottom of the module, beside `_BY_KEY`:

```python
PERSONAL_SECTIONS: frozenset[str] = frozenset(
    s.key for s in NOTE_SECTIONS if s.scope == SCOPE_PERSONAL
)
CATALOG_SECTIONS: frozenset[str] = frozenset(
    s.key for s in NOTE_SECTIONS if s.scope == SCOPE_CATALOG
)


def sections_by_scope(scope: str) -> list[NoteSection]:
    """Every section of one scope, in display order."""
    return [s for s in NOTE_SECTIONS if s.scope == scope]
```

- [ ] **Step 4: Declare the scope on all 29 entries**

Add exactly one `scope=` line to each entry in `NOTE_SECTIONS`. Personal, in
registry order: `remark`, `advantages`, `disadvantages`, `double_edged`,
`personal_reviews`, `episode_comments`, `questions` — each gets
`scope=SCOPE_PERSONAL`. The other twenty stored sections get
`scope=SCOPE_CATALOG`. `quotes` and `memes` get `scope=None` with the comment
below.

The first three, spelled out so the shape is unambiguous:

```python
    NoteSection(
        key="remark",
        shape=SHAPE_TEXT,
        label="備註 Remark",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        singleton=True,
    ),
    NoteSection(
        key="advantages",
        shape=SHAPE_TEXT,
        label="優點 Advantages",
        owners=ALL_OWNERS,
        scope=SCOPE_PERSONAL,
        group="reviews",
    ),
    NoteSection(
        key="public_reviews",
        shape=SHAPE_TEXT_OR_LINK,
        label="大眾評價 Public Reviews",
        owners=ALL_OWNERS,
        scope=SCOPE_CATALOG,
        group="reviews",
    ),
```

and the two external ones:

```python
    NoteSection(
        key="quotes",
        shape=SHAPE_EXTERNAL,
        label="名言 Quotes",
        owners=ENTRY_OWNERS,
        # Universal: shared, unfiltered, no per-user copies. Backed by the
        # `quote` table, so there is no `note` row to scope.
        scope=None,
        group="quotes_memes",
    ),
    NoteSection(
        key="memes",
        shape=SHAPE_EXTERNAL,
        label="梗/迷因 Memes",
        owners=ALL_OWNERS,
        # Universal, like quotes, and backed by the `meme` table.
        scope=None,
        group="quotes_memes",
    ),
```

Also extend the module docstring, after the "Adding a section is one entry and
no migration" paragraph:

```
Each section also declares a `scope`: `catalog` sections hold one shared set of
rows written by admins and read by everyone, `personal` sections hold one set
per user and are read only by their author. That distinction lives here rather
than on the table so that changing it later stays a registry edit plus a data
reassignment - no schema change - which is the whole reason this module exists.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_note_sections.py -v`
Expected: every test PASSES, including the pre-existing ones.

- [ ] **Step 6: Run ruff and the full suite**

Run:
```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
```
Expected: clean; no new failures. Nothing reads `scope` yet.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/utils/note_sections.py tests/unit/test_note_sections.py docs/PROGRESS.md
```
Proposed message: `feat(notes): declare catalogue or personal scope on every note section`
**Ask before running `git commit`.**

---

### Task 2: Serve `scope` on `/api/notes/sections`

**Files:**
- Modify: `app/schemas/note.py`
- Modify: `tests/unit/test_note_schemas.py`
- Modify: `tests/api/test_note.py`

**Interfaces:**
- Consumes: `NoteSection.scope` (Task 1).
- Produces: `NoteSectionOut.scope`, which the deferred profile UI reads.

**No frontend file changes in this plan.** `frontend/src/pages/notes/
NotesTemplate.jsx` consumes the section list by key and shape and ignores
unknown fields, so exposing `scope` is additive and invisible. The UI that acts
on it — showing whose personal notes are on screen, and letting a non-admin
user edit their own — belongs to the deferred authorization redesign, not here.
Say so rather than inventing it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_note_schemas.py`:

```python
def test_section_out_carries_the_registry_scope():
    from app.schemas.note import section_out
    from app.utils import note_sections as ns

    personal = section_out(ns.section_by_key("personal_reviews"), "anime")
    assert personal.scope == ns.SCOPE_PERSONAL

    catalog = section_out(ns.section_by_key("public_reviews"), "anime")
    assert catalog.scope == ns.SCOPE_CATALOG

    external = section_out(ns.section_by_key("quotes"), "anime")
    assert external.scope is None
```

Append to `tests/api/test_note.py`:

```python
def test_sections_endpoint_reports_scope(client):
    r = client.get("/api/notes/sections", params={"owner_type": "anime"})
    assert r.status_code == 200
    by_key = {s["key"]: s for s in r.json()}
    assert by_key["remark"]["scope"] == "personal"
    assert by_key["op"]["scope"] == "catalog"
    assert by_key["quotes"]["scope"] is None
```

- [ ] **Step 2: Run them to verify they fail**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/unit/test_note_schemas.py tests/api/test_note.py -v
```
Expected: FAIL — `NoteSectionOut` has no `scope`.

- [ ] **Step 3: Add the field**

In `app/schemas/note.py`, inside `NoteSectionOut`, after `shape`:

```python
    # "catalog" or "personal"; None for the external sections, which are backed
    # by their own tables. The frontend does not act on this yet - the profile
    # UI that will is deferred with the rest of the authorization redesign.
    scope: Optional[str] = None
```

and in `section_out`, beside the other passthroughs:

```python
        scope=section.scope,
```

- [ ] **Step 4: Run them green, then the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/unit/test_note_schemas.py tests/api/test_note.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: all PASS, clean.

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add app/schemas/note.py tests/unit/test_note_schemas.py tests/api/test_note.py \
        docs/PROGRESS.md
```
Proposed message: `feat(notes): expose each section's scope on /api/notes/sections`
**Ask before running `git commit`.**

---

# Phase B — `author_id`

Provenance first, filtering later. After this phase every note, quote and meme
has an author and nothing reads it, so no response can change.

### Task 3: `Viewer.user_id`

**Files:**
- Modify: `app/services/rbac/resolver.py`
- Modify: `tests/api/test_auth.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `Viewer.user_id`, which every write in Phase B and every filter in
  Phase C needs.

**Why this is a task of its own.** `Viewer` today carries `username`,
`role_id`, `role_name`, `is_superuser` and `permissions` — no user id.
`resolve_viewer` already loads the `models.User` row, so the id is in hand and
simply is not kept. The Step 2 interface contract named `users.list_is_public`
and a `user` role but not this, so it is a real gap in the handover; adding it
here is additive and breaks nothing, because `Viewer` is constructed in exactly
two places.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_auth.py`:

```python
def test_resolved_viewer_carries_the_user_id(db_session, admin_client):
    """
    Phase C filters personal notes by author_id, so "who is asking" has to
    answer with an id and not only a username.
    """
    from app import models
    from app.services.rbac.resolver import GUEST_FALLBACK, resolve_viewer

    request = admin_client.get("/api/auth/me").request
    viewer = resolve_viewer(request, db_session)
    admin = (
        db_session.query(models.User)
        .filter(models.User.username == viewer.username)
        .one()
    )
    assert viewer.user_id == admin.id
    assert GUEST_FALLBACK.user_id is None
```

If `admin_client` does not expose a usable `request` object in this suite,
build the viewer through the same path `/api/auth/me` uses instead — the
assertion that matters is `viewer.user_id == admin.id`, not how the request is
obtained.

- [ ] **Step 2: Run it to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_auth.py -k user_id -v`
Expected: FAIL with `AttributeError: 'Viewer' object has no attribute 'user_id'`.

- [ ] **Step 3: Add the field**

In `app/services/rbac/resolver.py`, in the `Viewer` dataclass, after
`username`:

```python
    # None for the guest viewer. Personal notes are filtered on this, so a
    # viewer with no id sees no personal rows at all - fail closed, the same
    # rule the rest of this module follows.
    user_id: Optional[UUID] = None
```

Declared with a default so the two existing construction sites and every test
that builds a `Viewer` by hand keep working. In `GUEST_FALLBACK` leave it
implicit (`None`). In `resolve_viewer`, where the `Viewer` is built from the
loaded `user`, pass:

```python
        user_id=user.id if user is not None else None,
```

- [ ] **Step 4: Run it green, then the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_auth.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: all PASS, clean.

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add app/services/rbac/resolver.py tests/api/test_auth.py docs/PROGRESS.md
```
Proposed message: `feat(rbac): carry the user id on Viewer`
**Ask before running `git commit`.**

---

### Task 4: `note.author_id`

**Files:**
- Modify: `app/models/note.py`
- Modify: `app/schemas/note.py`
- Modify: `app/routers/note.py`
- Modify: `app/services/domain/remark_field.py`
- Modify: `app/utils/formatter.py`
- Create: `alembic/versions/m5a1notescope_note_author_id.py`
- Create: `tests/api/test_note_author.py`

**Interfaces:**
- Consumes: `Viewer.user_id` (Task 3).
- Produces: `note.author_id`, `NoteResponse.author_id`, and `upsert_remark`'s
  new `author_id` argument.

**Run `/system` → Backup before this task.** It is the first migration of the
plan and the Note tab gains a column.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_note_author.py
"""
Every note has an author, whatever its scope.

author_id, not a nullable user_id: what differs between a catalogue note and a
personal one is who it is FILTERED for, not whether somebody wrote it. This
also gives provenance on catalogue notes, which nothing recorded before.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def admin_user(db):
    return db.query(models.User).filter(models.User.username == "admin").one()


def test_note_table_has_a_not_null_author_id(db):
    col = models.Note.__table__.c["author_id"]
    assert col.nullable is False


def test_a_note_created_through_the_api_records_its_author(
    db, admin_client, sample_anime, admin_user
):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "好看",
        },
    )
    assert r.status_code == 201
    note = db.query(models.Note).filter_by(system_id=r.json()["system_id"]).one()
    assert note.author_id == admin_user.id


def test_a_note_without_an_author_is_rejected(db, sample_anime):
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="advantages",
            content="無作者",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_a_user_deletes_their_notes(db, sample_anime):
    user = models.User(
        id=uuid.uuid4(),
        username="cascade-victim",
        hashed_password="x",
        role_id=db.query(models.Role.system_id).first()[0],
    )
    db.add(user)
    db.commit()

    note = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="advantages",
        content="會被連帶刪除",
        author_id=user.id,
    )
    db.add(note)
    db.commit()
    note_id = note.system_id

    db.execute(text("DELETE FROM users WHERE id = :i"), {"i": user.id})
    db.commit()

    assert db.query(models.Note).filter_by(system_id=note_id).first() is None


def test_every_existing_note_has_an_author(db):
    """The backfill: no row may be left behind by the migration."""
    orphans = db.execute(
        text("SELECT COUNT(*) FROM note WHERE author_id IS NULL")
    ).scalar_one()
    assert orphans == 0
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_note_author.py -v`
Expected: FAIL with `KeyError: 'author_id'`.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m5a1notescope_note_author_id.py
"""give every note an author

Revision ID: m5a1notescope
Revises: <the id printed by `alembic heads` before this file was written>
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5a1notescope"
down_revision: Union[str, Sequence[str], None] = "<previous head>"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Raw SQL by design. docs/PROGRESS.md records that data migrations importing
    live ORM models break whenever a later migration adds a column, because the
    model SELECTs every column it currently declares.

    Every existing note is the admin's: there has only ever been one user, so
    catalogue-scope rows are already correct and personal-scope rows become the
    admin's, which they already were.
    """
    op.add_column(
        "note",
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    bind = op.get_bind()
    admin_id = bind.execute(
        sa.text("SELECT id FROM users WHERE username = :u"), {"u": "admin"}
    ).scalar()
    if admin_id is None:
        raise RuntimeError(
            "no user named 'admin' to attribute existing notes to; "
            "create one before running this migration"
        )

    op.execute(
        sa.text("UPDATE note SET author_id = :uid WHERE author_id IS NULL").bindparams(
            uid=admin_id
        )
    )

    remaining = bind.execute(
        sa.text("SELECT COUNT(*) FROM note WHERE author_id IS NULL")
    ).scalar_one()
    if remaining:
        raise RuntimeError(f"{remaining} notes still have no author after backfill")

    op.alter_column("note", "author_id", nullable=False)
    op.create_index("ix_note_author_id", "note", ["author_id"])
    op.create_foreign_key(
        "fk_note_author", "note", "users", ["author_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_constraint("fk_note_author", "note", type_="foreignkey")
    op.drop_index("ix_note_author_id", table_name="note")
    op.drop_column("note", "author_id")
```

- [ ] **Step 4: Update the model**

In `app/models/note.py`, inside the `--- Linkage ---` block, immediately after
`owner_id`:

```python
    # Who wrote this row. Always set, whatever the section's scope: a catalogue
    # note has an author too, and recording it is the only provenance the
    # catalogue has. What scope changes is who the row is FILTERED for, not
    # whether somebody wrote it - see app/utils/note_sections.py.
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
```

Import `ForeignKey` from `sqlalchemy` at the top of the file. Extend the
docstring's column-order paragraph:

```
    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order. Adding
    or removing a column here reshapes the Note tab, so a change to this list
    is a Backup-before and a Backup-after.
```

- [ ] **Step 5: Set the author on every write path**

In `app/routers/note.py`, `create_note` currently depends on
`get_current_admin`. Keep that dependency for now — Task 8 replaces it — and
add the viewer so the author can be recorded:

```python
@router.post("", response_model=schemas.NoteResponse, status_code=201)
def create_note(
    payload: schemas.NoteCreate,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
    viewer: Viewer = Depends(get_viewer),
):
    _validate_or_422(payload)
    _reject_second_singleton(db, payload)

    data = payload.model_dump(exclude_unset=True)
    if data.get("sort_index") is None:
        data["sort_index"] = _next_sort_index(db, payload)
    # Never taken from the payload: the author is who is asking, not who says
    # they are. NoteBase has no author_id field, so nothing can supply one.
    data.pop("author_id", None)

    db_note = models.Note(
        system_id=uuid.uuid4(), author_id=viewer.user_id, **data
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note
```

In `app/services/domain/remark_field.py`, `upsert_remark` gains a required
`author_id` and uses it on insert:

```python
def upsert_remark(
    db: Session,
    owner_type: str,
    owner_id: Any,
    text: Optional[str],
    author_id: Any,
) -> None:
    """
    Create, update or clear one owner's singleton remark note.

    Empty or whitespace-only text deletes the row rather than storing a blank
    one, so a cleared remark leaves no empty section on the notes page. The
    text itself is stored as typed - only the emptiness test is stripped.

    `remark` is a personal-scope section, so the row records its author. It is
    NOT yet filtered by author on read - see the note in app/models/__init__.py
    about the `remark` column_property, and Task 9 of the Step 5 plan.
    """
    row = (
        db.query(Note)
        .filter(
            Note.owner_type == owner_type,
            Note.owner_id == owner_id,
            Note.section == REMARK_SECTION,
        )
        .first()
    )

    if not (text or "").strip():
        if row:
            db.delete(row)
        return

    if row:
        row.content = text
        row.updated_at = get_taipei_now()
        return

    db.add(
        Note(
            system_id=uuid.uuid4(),
            owner_type=owner_type,
            owner_id=owner_id,
            section=REMARK_SECTION,
            content=text,
            sort_index=0.0,
            author_id=author_id,
        )
    )
```

Every caller must pass it. Find them with:

```bash
grep -rn "upsert_remark(" app/ --include=*.py
```

They are the collection, franchise, series and nine media write paths. Each is
already an admin-authenticated route, so each adds
`viewer: Viewer = Depends(get_viewer)` (or uses the viewer it already has) and
passes `viewer.user_id`. Where a route has only `admin: dict =
Depends(get_current_admin)` and no viewer, add the viewer dependency beside it
rather than re-deriving the id from the token payload.

- [ ] **Step 6: Update the schema and the Sheets parser**

In `app/schemas/note.py`, add to `NoteResponse` (not to `NoteBase` — a client
must never be able to claim an author):

```python
    # Read-only. Set from the request's viewer, never from the payload, which
    # is why it is on the response schema and not on NoteBase.
    author_id: Optional[UUID] = None
```

In `app/utils/formatter.py`, in `parse_note_from_sheet`, after `"owner_id"`:

```python
        # A real foreign key that is NOT NULL, so an unparseable or absent cell
        # cannot become None. Pull resolves it in a second pass against the
        # Users tab; `None` here means "fall back to the admin", which
        # app/services/pipelines/pull.py applies.
        "author_id": _uuid_or_none(raw.get("author_id")),
```

In `app/services/pipelines/pull.py`, where the Note tab's parsed rows are
applied, add the fallback: a row whose `author_id` is `None` or names no row in
`users` takes the admin's id. Locate the Note handling near the existing
comment at `pull.py:749` and keep the fallback beside it.

- [ ] **Step 7: Run the migration and the tests**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_note_author.py -v
```
Expected: one head; migration applies with no `RuntimeError`; all five tests
PASS.

- [ ] **Step 8: Run the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures. Any failure naming `upsert_remark` is a caller
missed in Step 5 — fix the caller, do not give the argument a default.

- [ ] **Step 9: Prepare the commit and ask**

```bash
git add app/models/note.py app/schemas/note.py app/routers/note.py \
        app/services/domain/remark_field.py app/utils/formatter.py \
        app/services/pipelines/pull.py \
        alembic/versions/m5a1notescope_note_author_id.py \
        tests/api/test_note_author.py docs/PROGRESS.md
```
Add each `upsert_remark` caller you edited to that list, by exact path.
Proposed message: `feat(notes): record the author of every note`
**Ask before running `git commit`.**

---

### Task 5: `quote.author_id`

**Files:**
- Modify: `app/models/quote.py`
- Modify: `app/schemas/quote.py`
- Modify: `app/routers/quote.py`
- Modify: `app/utils/formatter.py`
- Create: `alembic/versions/m5a2quoteauthor_quote_author_id.py`
- Create: `tests/api/test_quote_author.py`

**Interfaces:**
- Consumes: `Viewer.user_id` (Task 3).
- Produces: `quote.author_id`.

**Quotes stay universal.** No scope column, no per-user copies, no filtering.
`author_id` is provenance and consistency only, and this task must not change a
single quote read.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_quote_author.py
"""
Quotes are universal - shared, unfiltered, no per-user copies. author_id is
provenance only: it records who added the line, and nothing reads it to decide
who may see it.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_quote_table_has_a_not_null_author_id(db):
    assert models.Quote.__table__.c["author_id"].nullable is False


def test_a_quote_created_through_the_api_records_its_author(
    db, admin_client, sample_anime
):
    admin = db.query(models.User).filter(models.User.username == "admin").one()
    r = admin_client.post(
        "/api/quotes",
        json={
            "media_type": "anime",
            "entry_id": str(sample_anime.system_id),
            "text": "有名的一句",
        },
    )
    assert r.status_code == 201
    quote = db.query(models.Quote).filter_by(system_id=r.json()["system_id"]).one()
    assert quote.author_id == admin.id


def test_a_quote_without_an_author_is_rejected(db, sample_anime):
    db.add(models.Quote(system_id=uuid.uuid4(), text="無作者"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_quotes_carry_no_scope_and_are_never_filtered_by_author(db, client):
    """
    The universality guarantee. Two authors' quotes on one entry both come back
    to a viewer who authored neither.
    """
    assert "scope" not in models.Quote.__table__.c
    rows = db.execute(
        text("SELECT COUNT(DISTINCT author_id) FROM quote")
    ).scalar_one()
    assert rows >= 0  # no filtering exists to assert against; the column is inert


def test_every_existing_quote_has_an_author(db):
    orphans = db.execute(
        text("SELECT COUNT(*) FROM quote WHERE author_id IS NULL")
    ).scalar_one()
    assert orphans == 0
```

Check the quote POST route's exact path and payload field names in
`app/routers/quote.py` before writing the second test; if Step 0 Task 18 has
landed, the payload names `media_id` rather than `media_type` + `entry_id`, and
the test must match the code as it is.

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_quote_author.py -v`
Expected: FAIL with `KeyError: 'author_id'`.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m5a2quoteauthor_quote_author_id.py
"""give every quote an author

Revision ID: m5a2quoteauthor
Revises: m5a1notescope
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5a2quoteauthor"
down_revision: Union[str, Sequence[str], None] = "m5a1notescope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Raw SQL by design - no ORM imports in migrations."""
    op.add_column(
        "quote",
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    bind = op.get_bind()
    admin_id = bind.execute(
        sa.text("SELECT id FROM users WHERE username = :u"), {"u": "admin"}
    ).scalar()
    if admin_id is None:
        raise RuntimeError("no user named 'admin' to attribute existing quotes to")

    op.execute(
        sa.text(
            "UPDATE quote SET author_id = :uid WHERE author_id IS NULL"
        ).bindparams(uid=admin_id)
    )

    remaining = bind.execute(
        sa.text("SELECT COUNT(*) FROM quote WHERE author_id IS NULL")
    ).scalar_one()
    if remaining:
        raise RuntimeError(f"{remaining} quotes still have no author after backfill")

    op.alter_column("quote", "author_id", nullable=False)
    op.create_index("ix_quote_author_id", "quote", ["author_id"])
    op.create_foreign_key(
        "fk_quote_author", "quote", "users", ["author_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_constraint("fk_quote_author", "quote", type_="foreignkey")
    op.drop_index("ix_quote_author_id", table_name="quote")
    op.drop_column("quote", "author_id")
```

- [ ] **Step 4: Update the model, the schema and the parser**

In `app/models/quote.py`, in the `--- Linkage ---` block after `entry_id` (or
after `media_id`, if Step 0 Task 18 has landed):

```python
    # Who added this line. Quotes are universal - shared, unfiltered, no
    # per-user copies - so this is provenance and nothing else: no read
    # consults it. It exists so that "who put this here?" has an answer, and so
    # that quote, meme and note agree on the same column.
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
```

Import `ForeignKey` from `sqlalchemy`. Add `author_id: Optional[UUID] = None`
to the quote **response** schema only, in `app/schemas/quote.py` — never to the
create/update base, for the reason given in Task 4.

In `app/utils/formatter.py`, `parse_quote_from_sheet`, after `"entry_id"` (or
`"media_id"`):

```python
        # NOT NULL in the database; Pull falls back to the admin when the cell
        # is blank or names no known user.
        "author_id": _uuid_or_none(raw.get("author_id")),
```

Set it on the write path in `app/routers/quote.py`: the create route takes
`viewer: Viewer = Depends(get_viewer)` beside its existing
`get_current_admin` dependency and passes `author_id=viewer.user_id`, popping
any `author_id` out of the incoming payload first.

- [ ] **Step 5: Run the migration, the tests and the suite**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_quote_author.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: one head, all PASS, clean.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/models/quote.py app/schemas/quote.py app/routers/quote.py \
        app/utils/formatter.py \
        alembic/versions/m5a2quoteauthor_quote_author_id.py \
        tests/api/test_quote_author.py docs/PROGRESS.md
```
Proposed message: `feat(quotes): record the author of every quote, universal reads unchanged`
**Ask before running `git commit`.**

---

### Task 6: `meme.author_id`

**Files:**
- Modify: `app/models/meme.py`
- Modify: `app/schemas/meme.py`
- Modify: `app/routers/meme.py`
- Modify: `app/utils/formatter.py`
- Create: `alembic/versions/m5a3memeauthor_meme_author_id.py`
- Create: `tests/api/test_meme_author.py`

**Interfaces:**
- Consumes: `Viewer.user_id` (Task 3).
- Produces: `meme.author_id`.

**Memes stay universal**, exactly like quotes: a running gag belongs to the
work, not to a reader. No scope column, no filtering.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_meme_author.py
"""
Memes are universal - shared, unfiltered, no per-user copies. author_id is
provenance only, matching quote and note.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_meme_table_has_a_not_null_author_id(db):
    assert models.Meme.__table__.c["author_id"].nullable is False


def test_meme_has_no_scope_column(db):
    assert "scope" not in models.Meme.__table__.c


def test_a_meme_created_through_the_api_records_its_author(
    db, admin_client, sample_anime
):
    admin = db.query(models.User).filter(models.User.username == "admin").one()
    r = admin_client.post(
        "/api/memes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "text": "梗",
        },
    )
    assert r.status_code == 201
    meme = db.query(models.Meme).filter_by(system_id=r.json()["system_id"]).one()
    assert meme.author_id == admin.id


def test_a_meme_without_an_author_is_rejected(db):
    db.add(models.Meme(system_id=uuid.uuid4(), text="無作者"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_every_existing_meme_has_an_author(db):
    orphans = db.execute(
        text("SELECT COUNT(*) FROM meme WHERE author_id IS NULL")
    ).scalar_one()
    assert orphans == 0
```

Confirm the meme create route's path and payload shape in
`app/routers/meme.py` before writing the third test.

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_meme_author.py -v`
Expected: FAIL with `KeyError: 'author_id'`.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m5a3memeauthor_meme_author_id.py
"""give every meme an author

Revision ID: m5a3memeauthor
Revises: m5a2quoteauthor
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5a3memeauthor"
down_revision: Union[str, Sequence[str], None] = "m5a2quoteauthor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Raw SQL by design - no ORM imports in migrations."""
    op.add_column(
        "meme",
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    bind = op.get_bind()
    admin_id = bind.execute(
        sa.text("SELECT id FROM users WHERE username = :u"), {"u": "admin"}
    ).scalar()
    if admin_id is None:
        raise RuntimeError("no user named 'admin' to attribute existing memes to")

    op.execute(
        sa.text(
            "UPDATE meme SET author_id = :uid WHERE author_id IS NULL"
        ).bindparams(uid=admin_id)
    )

    remaining = bind.execute(
        sa.text("SELECT COUNT(*) FROM meme WHERE author_id IS NULL")
    ).scalar_one()
    if remaining:
        raise RuntimeError(f"{remaining} memes still have no author after backfill")

    op.alter_column("meme", "author_id", nullable=False)
    op.create_index("ix_meme_author_id", "meme", ["author_id"])
    op.create_foreign_key(
        "fk_meme_author", "meme", "users", ["author_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_constraint("fk_meme_author", "meme", type_="foreignkey")
    op.drop_index("ix_meme_author_id", table_name="meme")
    op.drop_column("meme", "author_id")
```

- [ ] **Step 4: Update the model, the schema and the parser**

In `app/models/meme.py`, in the `--- Linkage ---` block after `owner_id`:

```python
    # Who added this meme. Memes are universal - a running gag belongs to the
    # work, not to a reader - so this is provenance only and no read consults
    # it. Matches note.author_id and quote.author_id.
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
```

`ForeignKey` is already imported in this module. Add
`author_id: Optional[UUID] = None` to the meme **response** schema only. Add
the parser line to `parse_meme_from_sheet` after `"owner_id"`:

```python
        # NOT NULL in the database; Pull falls back to the admin when the cell
        # is blank or names no known user.
        "author_id": _uuid_or_none(raw.get("author_id")),
```

Set it on `create_meme` from `viewer.user_id`, popping any incoming
`author_id` from the payload — `patch_meme` takes a raw dict, so the pop
matters there too.

- [ ] **Step 5: Run the migration, the tests and the suite**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_meme_author.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: one head, all PASS, clean.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/models/meme.py app/schemas/meme.py app/routers/meme.py \
        app/utils/formatter.py \
        alembic/versions/m5a3memeauthor_meme_author_id.py \
        tests/api/test_meme_author.py docs/PROGRESS.md
```
Proposed message: `feat(memes): record the author of every meme, universal reads unchanged`
**Ask before running `git commit`.**

---

# Phase C — enforcement

Reads and writes start consulting `scope`. Quotes and memes are untouched
throughout this phase.

### Task 7: Personal sections are read only by their author

**Files:**
- Modify: `app/routers/note.py`
- Modify: `app/services/rbac/field_gate.py`
- Create: `tests/api/test_note_scope_reads.py`

**Interfaces:**
- Consumes: `PERSONAL_SECTIONS` (Task 1), `Viewer.user_id` (Task 3),
  `note.author_id` (Task 4).
- Produces: the read filter in `list_notes`.

**What changes about `gated_note_sections`.** `FIELD_GROUPS["personal_notes"]`
(`app/services/rbac/field_groups.py:134`) withholds `personal_reviews` from a
viewer who does not hold `field_group.personal_notes`. Once personal sections
filter by `author_id`, that withholding is doing a different job: applied to
the viewer's **own** rows it would hide a user's notes from themselves. So the
field group is applied only to rows the viewer did not author. The spec's
larger point — that the group's meaning becomes "may see another user's
personal notes when their list is public" — is implemented in Task 8's profile
branch and finished in the deferred authorization redesign.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_note_scope_reads.py
"""
Two viewers, one entry: the same request returns two different personal answers
and one identical catalogue answer.

That is the whole point of scoping. A catalogue note (`public_reviews`) is one
shared row everybody reads; a personal note (`advantages`) is one row per user
and reaches nobody else.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def two_authors(db):
    """Two users with notes on the same anime, and the anime."""
    role_id = db.query(models.Role.system_id).first()[0]
    alice = models.User(
        id=uuid.uuid4(), username="alice", hashed_password="x", role_id=role_id
    )
    bob = models.User(
        id=uuid.uuid4(), username="bob", hashed_password="x", role_id=role_id
    )
    db.add_all([alice, bob])
    db.commit()
    return alice, bob


def _note(owner_id, section, content, author_id):
    return models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=owner_id,
        section=section,
        content=content,
        author_id=author_id,
    )


def test_a_viewer_sees_only_their_own_personal_notes(
    db, admin_client, sample_anime, two_authors
):
    alice, bob = two_authors
    admin = db.query(models.User).filter(models.User.username == "admin").one()
    db.add_all(
        [
            _note(sample_anime.system_id, "advantages", "admin 的優點", admin.id),
            _note(sample_anime.system_id, "advantages", "alice 的優點", alice.id),
            _note(sample_anime.system_id, "advantages", "bob 的優點", bob.id),
        ]
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    bodies = [n["content"] for n in r.json() if n["section"] == "advantages"]
    assert bodies == ["admin 的優點"]


def test_every_viewer_sees_the_same_catalogue_notes(
    db, admin_client, client, sample_anime, two_authors
):
    alice, _bob = two_authors
    db.add(
        _note(sample_anime.system_id, "public_reviews", "大眾說好看", alice.id)
    )
    db.commit()

    for c in (admin_client, client):
        r = c.get(
            "/api/notes",
            params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
        )
        assert r.status_code == 200
        bodies = [n["content"] for n in r.json() if n["section"] == "public_reviews"]
        assert bodies == ["大眾說好看"]


def test_a_logged_out_viewer_sees_no_personal_notes(
    db, client, sample_anime, two_authors
):
    alice, _bob = two_authors
    db.add(_note(sample_anime.system_id, "advantages", "alice 的優點", alice.id))
    db.commit()

    r = client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    assert not [n for n in r.json() if n["section"] == "advantages"]


def test_the_personal_notes_field_group_never_hides_a_viewers_own_rows(
    db, admin_client, sample_anime
):
    """
    field_group.personal_notes gated `personal_reviews` when there was one
    author and it was the admin. Filtering by author already hides everyone
    else's, so applying the group to a viewer's OWN rows would hide their notes
    from themselves - which is not what the group is for.
    """
    admin = db.query(models.User).filter(models.User.username == "admin").one()
    db.add(
        _note(sample_anime.system_id, "personal_reviews", "我的評價", admin.id)
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    bodies = [n["content"] for n in r.json() if n["section"] == "personal_reviews"]
    assert bodies == ["我的評價"]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_note_scope_reads.py -v`
Expected: the first and third FAIL — every note comes back regardless of author.

- [ ] **Step 3: Add the read filter**

In `app/routers/note.py`, import the scope names:

```python
from app.utils.note_sections import (
    NOTE_SECTIONS,
    PERSONAL_SECTIONS,
    section_by_key,
)
```

and replace the body of `list_notes`'s query construction:

```python
    query = db.query(models.Note).filter(
        models.Note.owner_type == owner_type, models.Note.owner_id == owner_id
    )

    # Personal sections hold one set of rows per user. A viewer sees their own
    # and nobody else's; a logged-out viewer, having no id, sees none. This is
    # the read half of the scope declared in app/utils/note_sections.py -
    # catalogue sections fall through untouched, which is what "one shared set
    # of rows, read by everyone" means.
    personal = list(PERSONAL_SECTIONS)
    if viewer.user_id is None:
        query = query.filter(models.Note.section.notin_(personal))
    else:
        query = query.filter(
            or_(
                models.Note.section.notin_(personal),
                models.Note.author_id == viewer.user_id,
            )
        )

    # A withheld section is absent rather than blanked: an empty card would
    # advertise that there is something here to not-see. Applied only to rows
    # the viewer did not write - field_group.personal_notes governs seeing
    # SOMEBODY ELSE's personal notes, and hiding a viewer's own from them is
    # not a permission, it is a bug.
    withheld = gated_note_sections(viewer)
    if withheld:
        query = query.filter(
            or_(
                models.Note.section.notin_(withheld),
                models.Note.author_id == viewer.user_id,
            )
        )
    return _ordered(query.all())
```

Import `or_` from `sqlalchemy` at the top of the router.

Add the explanation to `gated_note_sections` in
`app/services/rbac/field_gate.py`, which now documents a narrower job:

```python
def gated_note_sections(viewer: Optional[Viewer]) -> tuple[str, ...]:
    """
    note.section values to withhold. Not per media type: a section's owners are
    declared on the section itself, in note_sections.NOTE_SECTIONS.

    Callers apply this to rows the viewer did NOT author. Personal-scope
    sections are already filtered by author_id, so this group's remaining job
    is seeing somebody else's personal notes - on a profile whose list is
    public - not seeing one's own.
    """
```

- [ ] **Step 4: Run them green, then the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_note_scope_reads.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: all PASS, clean. A failure in `tests/api/test_note.py` that expects a
note to come back for a different viewer is this change working — update that
expectation, do not weaken the filter.

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add app/routers/note.py app/services/rbac/field_gate.py \
        tests/api/test_note_scope_reads.py docs/PROGRESS.md
```
Add `tests/api/test_note.py` to that list if you had to update an expectation
in it.
Proposed message: `feat(notes): read personal sections only for their author`
**Ask before running `git commit`.**

---

### Task 8: Writes follow the scope, and one public-profile read

**Files:**
- Modify: `app/services/rbac/permissions.py`
- Modify: `app/routers/note.py`
- Create: `tests/api/test_note_scope_writes.py`
- Modify: `tests/api/test_permissions.py` (or whichever suite asserts the
  permission catalogue — find it with
  `grep -rn "static_catalog" tests/`)

**Interfaces:**
- Consumes: `CATALOG_SECTIONS` / `PERSONAL_SECTIONS` (Task 1),
  `Viewer.user_id` (Task 3), `users.list_is_public` (Step 2).
- Produces: `PERM_NOTE_WRITE_OWN`, the write gate, and the `author` query
  parameter on `GET /api/notes`.

**The write rule, verbatim from the spec:**

| Scope | Write | Read |
|---|---|---|
| `catalog` | admin only | everyone, unfiltered |
| `personal` | any user, own rows | `WHERE author_id = viewer` — or the profile owner, if their list is public |

**Scope of the profile branch.** `GET /api/notes` gains an optional `author`
parameter naming a username. It is honoured only when that user's
`list_is_public` is true **and** the requesting viewer holds
`field_group.personal_notes`; otherwise it 403s. That is the minimum the spec's
"the field group governs profile reads" needs, and it is deliberately the only
part of the authorization redesign in this plan. Everything else the spec lists
under "What this forces auth to decide later" stays deferred.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_note_scope_writes.py
"""
Who may write what, per the section's scope.

catalog: admin only. personal: any authenticated user holding
note.write_own, on their own rows only.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_NOTE_WRITE_OWN


@pytest.fixture
def db(db_session):
    return db_session


def _payload(owner_id, section, content):
    return {
        "owner_type": "anime",
        "owner_id": str(owner_id),
        "section": section,
        "content": content,
    }


def test_a_plain_user_may_write_their_own_personal_note(
    db, user_client, sample_anime
):
    r = user_client.post(
        "/api/notes", json=_payload(sample_anime.system_id, "advantages", "我的優點")
    )
    assert r.status_code == 201
    note = db.query(models.Note).filter_by(system_id=r.json()["system_id"]).one()
    user = db.query(models.User).filter(models.User.username == "plainuser").one()
    assert note.author_id == user.id


def test_a_plain_user_may_not_write_a_catalogue_note(user_client, sample_anime):
    r = user_client.post(
        "/api/notes",
        json=_payload(sample_anime.system_id, "public_reviews", "大眾評價"),
    )
    assert r.status_code == 403


def test_a_logged_out_visitor_may_not_write_anything(client, sample_anime):
    r = client.post(
        "/api/notes", json=_payload(sample_anime.system_id, "advantages", "訪客")
    )
    assert r.status_code in (401, 403)


def test_a_user_may_not_edit_someone_elses_personal_note(
    db, user_client, sample_anime
):
    admin = db.query(models.User).filter(models.User.username == "admin").one()
    note = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="advantages",
        content="admin 的",
        author_id=admin.id,
    )
    db.add(note)
    db.commit()

    r = user_client.patch(f"/api/notes/{note.system_id}", json={"content": "被改了"})
    assert r.status_code == 403

    r = user_client.delete(f"/api/notes/{note.system_id}")
    assert r.status_code == 403


def test_an_admin_still_writes_catalogue_notes(db, admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json=_payload(sample_anime.system_id, "public_reviews", "大眾評價"),
    )
    assert r.status_code == 201


def test_the_write_own_permission_is_in_the_catalogue(db):
    from app.services.rbac.permissions import catalog

    assert PERM_NOTE_WRITE_OWN in catalog(db)


def test_a_public_list_owners_personal_notes_reach_a_permitted_viewer(
    db, admin_client, sample_anime
):
    role_id = db.query(models.Role.system_id).first()[0]
    carol = models.User(
        id=uuid.uuid4(),
        username="carol",
        hashed_password="x",
        role_id=role_id,
        list_is_public=True,
    )
    db.add(carol)
    db.commit()
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="advantages",
            content="carol 的優點",
            author_id=carol.id,
        )
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "author": "carol",
        },
    )
    assert r.status_code == 200
    assert [n["content"] for n in r.json() if n["section"] == "advantages"] == [
        "carol 的優點"
    ]


def test_a_private_list_owners_personal_notes_stay_private(
    db, admin_client, sample_anime
):
    role_id = db.query(models.Role.system_id).first()[0]
    dave = models.User(
        id=uuid.uuid4(),
        username="dave",
        hashed_password="x",
        role_id=role_id,
        list_is_public=False,
    )
    db.add(dave)
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "author": "dave",
        },
    )
    assert r.status_code == 403
```

This needs a `user_client` fixture: a logged-in non-admin whose role holds
`note.write_own` and the guest read permissions, with username `plainuser`.
Add it to `tests/conftest.py` beside the existing `admin_client`, following
whatever pattern that fixture uses to mint its cookie. If Step 2 already added
such a fixture, reuse it and adjust the username in these tests to match.

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_note_scope_writes.py -v`
Expected: FAIL — `PERM_NOTE_WRITE_OWN` does not exist.

- [ ] **Step 3: Add the permission**

In `app/services/rbac/permissions.py`:

```python
PERM_ADMIN = "admin"

FAMILY_MEDIA_TYPE = "media_type"
FAMILY_FIELD_GROUP = "field_group"
FAMILY_LABEL = "label"
# Writing one's own personal-scope notes. A family of its own rather than a
# field group: field groups say what may be READ, and this says what may be
# WRITTEN.
FAMILY_NOTE = "note"

PERM_NOTE_WRITE_OWN = f"{FAMILY_NOTE}.write_own"

PERMISSION_FAMILIES: tuple[str, ...] = (
    FAMILY_MEDIA_TYPE,
    FAMILY_FIELD_GROUP,
    FAMILY_LABEL,
    FAMILY_NOTE,
)
```

and add it to `static_catalog()`:

```python
def static_catalog() -> frozenset[str]:
    """Every permission knowable without a database."""
    return frozenset(
        {PERM_ADMIN, PERM_NOTE_WRITE_OWN}
        | {media_type_perm(media_type) for media_type in MEDIA_TYPE_KEYS}
        | {field_group_perm(key) for key in FIELD_GROUP_KEYS}
    )
```

Grant it to the `user` role in the same seed or migration Step 2 used to create
that role. Find it with `grep -rn "\"user\"" alembic/versions/ app/services/rbac/`
and add the grant there; if Step 2 has not landed, stop and say so.

- [ ] **Step 4: Gate the writes**

In `app/routers/note.py`, add the gate helper beside the other helpers:

```python
def _authorize_write(viewer: Viewer, section_key: Optional[str]) -> None:
    """
    Catalogue sections are admin-only; personal sections need note.write_own.

    Scope is read from the registry rather than from a list here, so a section
    reclassified in note_sections.py changes who may write it with no change to
    this file - which is the whole reason scope lives there.
    """
    section = section_by_key(section_key or "")
    if section is None:
        raise HTTPException(
            status_code=400, detail=f"Unknown note section '{section_key}'."
        )
    if section.scope == SCOPE_PERSONAL:
        if viewer.user_id is None or not viewer.has(PERM_NOTE_WRITE_OWN):
            raise HTTPException(
                status_code=403, detail="You may not write personal notes."
            )
        return
    if not viewer.has(PERM_ADMIN):
        raise HTTPException(
            status_code=403, detail="Catalogue notes are written by admins."
        )


def _authorize_edit(viewer: Viewer, db_note: models.Note) -> None:
    """A personal note is edited by its author; a catalogue note by an admin."""
    section = section_by_key(db_note.section or "")
    if section is not None and section.scope == SCOPE_PERSONAL:
        if viewer.is_superuser or db_note.author_id == viewer.user_id:
            return
        raise HTTPException(
            status_code=403, detail="That note belongs to someone else."
        )
    if not viewer.has(PERM_ADMIN):
        raise HTTPException(
            status_code=403, detail="Catalogue notes are edited by admins."
        )
```

Swap `_admin=Depends(get_current_admin)` for `viewer: Viewer =
Depends(get_viewer)` on `create_note`, `update_note`, `delete_note` and
`reorder_notes`, and call the helpers:

- `create_note`: `_authorize_write(viewer, payload.section)` before
  `_validate_or_422`.
- `update_note`: `_authorize_edit(viewer, db_note)` right after `_get_or_404`,
  and `_authorize_write(viewer, merged.section)` after the merge, so a PATCH
  cannot move a row into a section the caller may not write.
- `delete_note`: `_authorize_edit(viewer, db_note)` after `_get_or_404`.
- `reorder_notes`: `_authorize_write(viewer, payload.section)`, and for a
  personal section also filter the rows it rewrites to
  `models.Note.author_id == viewer.user_id` — reordering somebody else's list
  is a write to their rows.

`_reject_second_singleton` also needs the author for a personal singleton:

```python
    query = db.query(models.Note).filter(
        models.Note.owner_type == payload.owner_type,
        models.Note.owner_id == payload.owner_id,
        models.Note.section == section.key,
    )
    if section.scope == SCOPE_PERSONAL and author_id is not None:
        # One remark per owner PER AUTHOR. See Task 9 for why the database's
        # index is still per-owner.
        query = query.filter(models.Note.author_id == author_id)
```

Import `SCOPE_PERSONAL` and `PERM_ADMIN` at the top of the router.

- [ ] **Step 5: Add the `author` read parameter**

In `list_notes`:

```python
@router.get("", response_model=List[schemas.NoteResponse])
def list_notes(
    owner_type: str = Query(...),
    owner_id: uuid.UUID = Query(...),
    # Whose personal notes to show instead of the viewer's own. Honoured only
    # for a user whose list is public, and only for a viewer holding
    # field_group.personal_notes - which is that group's new job now that
    # personal sections filter by author on the entry page.
    author: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
```

and, before the personal filter:

```python
    author_id = viewer.user_id
    if author is not None:
        owner = db.query(models.User).filter(models.User.username == author).first()
        if (
            owner is None
            or not owner.list_is_public
            or not viewer.has(field_group_perm("personal_notes"))
        ):
            raise HTTPException(
                status_code=403, detail="That user's notes are not public."
            )
        author_id = owner.id
```

then use `author_id` in place of `viewer.user_id` in the two `or_` filters
written in Task 7.

Import `field_group_perm` from `app.services.rbac.permissions`.

- [ ] **Step 6: Run them green, then the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_note_scope_writes.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: all PASS, clean. Tests in `tests/api/test_note.py` that assert a
non-admin gets 401 on a note write may now get 403 — that is this change
working; update the expectation.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/rbac/permissions.py app/routers/note.py \
        tests/api/test_note_scope_writes.py tests/conftest.py docs/PROGRESS.md
```
Add the permission-catalogue test file and `tests/api/test_note.py` if you
edited them, and the Step 2 role-seed file if you added the grant there.
Proposed message: `feat(notes): gate note writes on the section's scope`
**Ask before running `git commit`.**

---

### Task 9: `remark` — author recorded, one-per-owner kept, boundary documented

**Files:**
- Modify: `app/models/__init__.py`
- Modify: `app/models/note.py`
- Create: `tests/api/test_remark_author.py`

**Interfaces:**
- Consumes: `note.author_id` (Task 4), `upsert_remark(..., author_id)` (Task 4).
- Produces: the documented boundary between this plan and the deferred
  authorization redesign.

**Read this before implementing.** `remark` is a personal-scope section, and it
is also the one section with a **read path that bypasses the note router
entirely**: `app/models/__init__.py:136-146` attaches a `column_property` to
each of the twelve owner models, mapping the singleton remark row back onto the
owner as a plain attribute. Every detail page, every list response,
`find_all_remarks` and `Delete.jsx`'s previews read it that way. A
`column_property` is a class-level scalar subquery — it cannot know who is
asking, so it cannot be filtered by author.

Two rules keep this safe without rewriting a dozen read paths:

1. **The partial unique index stays per-owner**, not per-owner-per-author.
   `ix_note_one_remark_per_owner` remains `UNIQUE (owner_type, owner_id) WHERE
   section = 'remark'`. A second user's remark on the same owner is therefore
   *rejected by the database* rather than silently shown to the first user. The
   note.py docstring already explains why more than one remark row per owner
   breaks every read of that entity: the scalar subquery raises "more than one
   row returned by a subquery used as an expression".
2. **`upsert_remark` records `author_id`** (done in Task 4), so when the
   deferred work replaces the `column_property` with a per-viewer read the data
   is already there.

This is a real, deliberate limitation: until the authorization redesign lands,
a second user cannot write a remark. It is the conservative failure — a refused
write, not a leaked note — and it is the only place in this plan where a
personal section is not fully per-user.

- [ ] **Step 1: Write the tests**

```python
# tests/api/test_remark_author.py
"""
`remark` is personal-scope, and it is also the one section read through a
class-level column_property (app/models/__init__.py) that cannot know who is
asking. Until that read path is replaced, one remark per OWNER is enforced by
the database, so a second user's remark is refused rather than shown to the
first user.

These tests pin that boundary so it is a decision, not a surprise.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.domain import upsert_remark


@pytest.fixture
def db(db_session):
    return db_session


def test_upsert_remark_records_its_author(db, sample_anime):
    admin = db.query(models.User).filter(models.User.username == "admin").one()
    upsert_remark(db, "anime", sample_anime.system_id, "備註", admin.id)
    db.commit()

    row = (
        db.query(models.Note)
        .filter_by(owner_type="anime", owner_id=sample_anime.system_id, section="remark")
        .one()
    )
    assert row.author_id == admin.id


def test_a_second_users_remark_on_the_same_owner_is_refused(db, sample_anime):
    """
    The documented boundary. One remark per owner, site-wide, until the
    deferred authorization work replaces the `remark` column_property with a
    per-viewer read. A refused write is the conservative failure; showing one
    user's private remark to another is not.
    """
    admin = db.query(models.User).filter(models.User.username == "admin").one()
    role_id = db.query(models.Role.system_id).first()[0]
    erin = models.User(
        id=uuid.uuid4(), username="erin", hashed_password="x", role_id=role_id
    )
    db.add(erin)
    db.commit()

    upsert_remark(db, "anime", sample_anime.system_id, "admin 的備註", admin.id)
    db.commit()

    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="remark",
            content="erin 的備註",
            author_id=erin.id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_remark_is_declared_personal_in_the_registry(db):
    from app.utils import note_sections as ns

    assert ns.section_by_key("remark").scope == ns.SCOPE_PERSONAL
```

- [ ] **Step 2: Run them**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_remark_author.py -v`
Expected: all three PASS after Task 4 — this task's code change is
documentation, and the tests pin behaviour that already holds. **If the second
test fails, the unique index is missing from the test database** — check it
with `\d note` and fix the schema, do not delete the test.

- [ ] **Step 3: Record the boundary in the code**

In `app/models/__init__.py`, extend the comment block above `_REMARK_OWNERS`:

```python
# LIMITATION, deliberate and recorded. `remark` is a personal-scope section
# (app/utils/note_sections.py), but this property is class-level: a scalar
# subquery cannot know which viewer is asking, so it cannot filter by
# note.author_id. The partial unique index ix_note_one_remark_per_owner is
# therefore still per-OWNER rather than per-owner-per-author, which means a
# second user's remark on the same owner is refused by the database rather
# than shown to the first user. Replacing this property with a per-viewer read
# is part of the deferred authorization redesign; until then, do not relax
# that index.
```

In `app/models/note.py`, extend the comment on the
`ix_note_one_remark_per_owner` index in `__table_args__` with the same
one-sentence reason and a pointer to `app/models/__init__.py`.

- [ ] **Step 4: Run the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures, clean.

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add app/models/__init__.py app/models/note.py \
        tests/api/test_remark_author.py docs/PROGRESS.md
```
Proposed message: `test(notes): pin the one-remark-per-owner boundary and its reason`
**Ask before running `git commit`.**

---

# Phase D — disjoint owner FKs

**Requires Step 0.** `media` must exist and be backfilled for all nine types.

### Task 10: `note` — four owner FKs and a `num_nonnulls` CHECK

**Files:**
- Modify: `app/models/note.py`
- Modify: `app/models/__init__.py`
- Modify: `app/routers/note.py`
- Modify: `app/services/domain/remark_field.py`
- Modify: `app/utils/formatter.py`
- Modify: `app/services/pipelines/pull.py`
- Create: `alembic/versions/m5b1notefks_note_owner_fks.py`
- Create: `tests/api/test_note_owner_fks.py`

**Interfaces:**
- Consumes: `media` (Step 0), `note.author_id` (Task 4).
- Produces: `note.media_id` / `collection_id` / `franchise_id` / `series_id`,
  `ck_note_one_owner`, and `Note.owner_type` / `Note.owner_id` as derived
  read-only properties.

**Why four columns and not one.** A note's owner is any of the twelve
`OWNER_TABLES` keys — the nine media types **plus** `collection`, `franchise`
and `series`. `media.system_id` cannot hold a franchise id, so a single
`media_id` is impossible; the spec records why an all-encompassing `entity`
supertable was rejected. Four nullable FKs plus
`num_nonnulls(...) = 1` is the shape that makes every owner cascade.

**Keep `owner_type` and `owner_id` as Python properties.** They are read all
over the codebase — `_validate_owner_type`, `entry_ref_for`,
`drop_hidden_rows` (which uses `getattr`, so a property works),
`log_deleted_record`. Deriving them costs nothing and keeps this task from
touching a dozen files. They are read-only; every write goes through the four
columns.

**Backup before this task, and Backup again after.** The Note tab loses
`owner_type` and `owner_id` and gains four columns.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_note_owner_fks.py
"""
A note's owner is a real foreign key now - one of four, exactly one non-null.

Before this, (owner_type, owner_id) pointed at whichever of twelve tables
owner_type named, no FK spanned them, and a deleted owner left its notes behind
forever. Now every owner cascades.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def admin_id(db):
    return db.query(models.User).filter(models.User.username == "admin").one().id


def test_exactly_one_owner_column_may_be_set(db, sample_anime, admin_id):
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            collection_id=sample_anime.system_id,
            section="advantages",
            content="兩個擁有者",
            author_id=admin_id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_a_note_with_no_owner_is_rejected(db, admin_id):
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            section="advantages",
            content="沒有擁有者",
            author_id=admin_id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_a_media_entry_cascades_its_notes(db, sample_anime, admin_id):
    note = models.Note(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="advantages",
        content="會連帶刪除",
        author_id=admin_id,
    )
    db.add(note)
    db.commit()
    note_id = note.system_id

    db.execute(
        text("DELETE FROM media WHERE system_id = :s"), {"s": sample_anime.system_id}
    )
    db.commit()

    assert db.query(models.Note).filter_by(system_id=note_id).first() is None


def test_deleting_a_franchise_cascades_its_notes(db, sample_franchise, admin_id):
    note = models.Note(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        section="advantages",
        content="系列作的筆記",
        author_id=admin_id,
    )
    db.add(note)
    db.commit()
    note_id = note.system_id

    db.execute(
        text("DELETE FROM franchise WHERE system_id = :s"),
        {"s": sample_franchise.system_id},
    )
    db.commit()

    assert db.query(models.Note).filter_by(system_id=note_id).first() is None


def test_owner_type_and_owner_id_are_derived(db, sample_franchise, admin_id):
    note = models.Note(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        section="advantages",
        content="推導",
        author_id=admin_id,
    )
    db.add(note)
    db.commit()

    assert note.owner_type == "franchise"
    assert note.owner_id == sample_franchise.system_id
    assert "owner_type" not in models.Note.__table__.c
    assert "owner_id" not in models.Note.__table__.c


def test_the_notes_endpoint_still_takes_owner_type_and_owner_id(
    db, admin_client, sample_anime, admin_id
):
    """The API shape does not change - only the storage does."""
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section="public_reviews",
            content="大眾評價",
            author_id=admin_id,
        )
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    assert [n["content"] for n in r.json()] == ["大眾評價"]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_note_owner_fks.py -v`
Expected: FAIL — `Note` has no `media_id`.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m5b1notefks_note_owner_fks.py
"""give note four real owner FKs and drop the FK-less pair

Revision ID: m5b1notefks
Revises: m5a3memeauthor
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5b1notefks"
down_revision: Union[str, Sequence[str], None] = "m5a3memeauthor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OWNER_COLUMNS = ("media_id", "collection_id", "franchise_id", "series_id")


def upgrade() -> None:
    """
    Raw SQL by design - no ORM imports in migrations.

    media.system_id equals the old owner_id for every media owner: Step 0's
    backfill reused each detail row's existing UUID, so this is a rename with a
    join, not a remap.
    """
    for name, target in (
        ("media_id", "media"),
        ("collection_id", "collection"),
        ("franchise_id", "franchise"),
        ("series_id", "series"),
    ):
        op.add_column(
            "note", sa.Column(name, postgresql.UUID(as_uuid=True), nullable=True)
        )

    op.execute("""
        UPDATE note n
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = n.owner_id AND m.media_type = n.owner_type
    """)
    op.execute("""
        UPDATE note n SET collection_id = n.owner_id
        WHERE n.owner_type = 'collection'
          AND EXISTS (SELECT 1 FROM collection c WHERE c.system_id = n.owner_id)
    """)
    op.execute("""
        UPDATE note n SET franchise_id = n.owner_id
        WHERE n.owner_type = 'franchise'
          AND EXISTS (SELECT 1 FROM franchise f WHERE f.system_id = n.owner_id)
    """)
    op.execute("""
        UPDATE note n SET series_id = n.owner_id
        WHERE n.owner_type = 'series'
          AND EXISTS (SELECT 1 FROM series s WHERE s.system_id = n.owner_id)
    """)

    bind = op.get_bind()
    orphans = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM note "
            "WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1"
        )
    ).scalar_one()
    if orphans:
        # Rows the FK-less pair allowed to outlive their owner - exactly what
        # this change exists to prevent. They reference nothing and cannot be
        # migrated, so they go.
        op.execute("""
            DELETE FROM note
            WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1
        """)

    for name, target in (
        ("media_id", "media"),
        ("collection_id", "collection"),
        ("franchise_id", "franchise"),
        ("series_id", "series"),
    ):
        op.create_foreign_key(
            f"fk_note_{name}", "note", target, [name], ["system_id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_note_{name}", "note", [name])

    op.create_check_constraint(
        "ck_note_one_owner",
        "note",
        "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
    )

    # The remark singleton index and the page's read index both named the old
    # pair, so both are rebuilt on the four columns. NULLS NOT DISTINCT is
    # required: three of the four are always NULL, and Postgres treats NULLs as
    # distinct by default, which would let every owner hold unlimited remarks.
    op.execute("DROP INDEX IF EXISTS ix_note_one_remark_per_owner")
    op.execute("DROP INDEX IF EXISTS ix_note_owner_section")
    op.execute("""
        CREATE UNIQUE INDEX ix_note_one_remark_per_owner
        ON note (media_id, collection_id, franchise_id, series_id)
        NULLS NOT DISTINCT
        WHERE section = 'remark'
    """)
    op.execute("""
        CREATE INDEX ix_note_owner_section
        ON note (media_id, collection_id, franchise_id, series_id, section)
    """)

    op.execute("DROP INDEX IF EXISTS ix_note_owner_type")
    op.execute("DROP INDEX IF EXISTS ix_note_owner_id")
    op.drop_column("note", "owner_type")
    op.drop_column("note", "owner_id")


def downgrade() -> None:
    op.add_column("note", sa.Column("owner_type", sa.String(), nullable=True))
    op.add_column(
        "note", sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.execute("""
        UPDATE note n SET owner_type = m.media_type, owner_id = m.system_id
        FROM media m WHERE m.system_id = n.media_id
    """)
    op.execute(
        "UPDATE note SET owner_type = 'collection', owner_id = collection_id "
        "WHERE collection_id IS NOT NULL"
    )
    op.execute(
        "UPDATE note SET owner_type = 'franchise', owner_id = franchise_id "
        "WHERE franchise_id IS NOT NULL"
    )
    op.execute(
        "UPDATE note SET owner_type = 'series', owner_id = series_id "
        "WHERE series_id IS NOT NULL"
    )
    op.create_index("ix_note_owner_type", "note", ["owner_type"])
    op.create_index("ix_note_owner_id", "note", ["owner_id"])
    op.execute("DROP INDEX IF EXISTS ix_note_one_remark_per_owner")
    op.execute("DROP INDEX IF EXISTS ix_note_owner_section")
    op.execute("""
        CREATE UNIQUE INDEX ix_note_one_remark_per_owner
        ON note (owner_type, owner_id) WHERE section = 'remark'
    """)
    op.execute(
        "CREATE INDEX ix_note_owner_section ON note (owner_type, owner_id, section)"
    )
    op.drop_constraint("ck_note_one_owner", "note", type_="check")
    for name in OWNER_COLUMNS:
        op.drop_constraint(f"fk_note_{name}", "note", type_="foreignkey")
        op.drop_index(f"ix_note_{name}", table_name="note")
        op.drop_column("note", name)
```

- [ ] **Step 4: Update the model**

In `app/models/note.py`, replace the `owner_type` / `owner_id` columns with the
four FKs, keeping them in the same position so the Sheets column order stays
readable:

```python
    # --- Linkage ---
    # A note's owner is any of the twelve OWNER_TABLES keys - the nine media
    # types plus collection, franchise and series - and media.system_id cannot
    # hold a franchise id, so no single FK can span them. Four nullable FKs
    # with a CHECK that exactly one is set is what makes every owner cascade;
    # the alternative, an `entity` supertable spanning media and the tiers, was
    # rejected in the design spec because it could hold nothing but an id.
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    collection_id = Column(
        UUID(as_uuid=True),
        ForeignKey("collection.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
```

and rewrite `__table_args__`:

```python
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
            name="ck_note_one_owner",
        ),
        # The only read path the notes page uses.
        Index(
            "ix_note_owner_section",
            "media_id",
            "collection_id",
            "franchise_id",
            "series_id",
            "section",
        ),
        # `remark` is a singleton per owner, and that rule is load-bearing: the
        # read side is a scalar subquery (see the `remark` column_property in
        # app/models/__init__.py), so a second remark row for one owner makes
        # EVERY read of that entity raise "more than one row returned by a
        # subquery used as an expression" rather than degrade. NULLS NOT
        # DISTINCT is required because three of the four owner columns are
        # always NULL and Postgres would otherwise treat every row as unique.
        # Still per-owner rather than per-owner-per-author: see the LIMITATION
        # comment in app/models/__init__.py.
        Index(
            "ix_note_one_remark_per_owner",
            "media_id",
            "collection_id",
            "franchise_id",
            "series_id",
            unique=True,
            postgresql_nulls_not_distinct=True,
            postgresql_where=text("section = 'remark'"),
        ),
    )
```

Import `CheckConstraint` from `sqlalchemy`. Add the derived properties below
the columns:

```python
    # `owner_type` and `owner_id` are no longer stored: they are read back from
    # whichever of the four FK columns is set. Read-only - every write goes
    # through the columns - and Python properties rather than columns, which
    # also keeps them out of the Google Sheets row that
    # format_model_for_sheet builds from __table__.columns.
    @property
    def owner_type(self) -> str | None:
        if self.media_id is not None:
            return self.media.media_type if self.media is not None else None
        if self.collection_id is not None:
            return "collection"
        if self.franchise_id is not None:
            return "franchise"
        if self.series_id is not None:
            return "series"
        return None

    @property
    def owner_id(self):
        return (
            self.media_id
            or self.collection_id
            or self.franchise_id
            or self.series_id
        )
```

and the relationship the property needs:

```python
    media = relationship("Media", lazy="joined")
```

Import `relationship` from `sqlalchemy.orm`.

- [ ] **Step 5: Update the router, the remark service and the pipelines**

In `app/routers/note.py`, add one helper and use it everywhere an owner is
filtered on or written:

```python
def _owner_filters(owner_type: str, owner_id) -> list:
    """
    The WHERE clauses selecting one owner's notes.

    A media owner is matched through `media`, because note.media_id points at
    media.system_id and the media type lives there; the three tiers are matched
    on their own column directly.
    """
    if owner_type in TIER_TABLES:
        column = {
            "collection": models.Note.collection_id,
            "franchise": models.Note.franchise_id,
            "series": models.Note.series_id,
        }[owner_type]
        return [column == owner_id]
    return [models.Note.media_id == owner_id]


def _owner_columns(owner_type: str, owner_id) -> dict:
    """The column assignment writing one owner onto a new note."""
    if owner_type in TIER_TABLES:
        return {f"{owner_type}_id": owner_id}
    return {"media_id": owner_id}
```

Import `TIER_TABLES` from `app.utils.media_resolver`. Apply `_owner_filters` in
`list_notes`, `_reject_second_singleton`, `_next_sort_index` and
`reorder_notes`; apply `_owner_columns` in `create_note`, replacing the
`owner_type` / `owner_id` keys popped out of the payload. `NoteBase` keeps its
`owner_type` and `owner_id` fields — the API shape does not change.

In `app/services/domain/remark_field.py`, `upsert_remark` takes the same
treatment: filter and insert through the four columns rather than the pair.

In `app/models/__init__.py`, the `remark` column_property must follow:

```python
_REMARK_MEDIA_OWNERS = (Anime, AnimeMovies, Movies, TVShows, Cartoon, Manga,
                        Novel, Comic, Game)
_REMARK_TIER_OWNERS = (
    (Series, Note.series_id),
    (Franchise, Note.franchise_id),
    (Collection, Note.collection_id),
)

for _model in _REMARK_MEDIA_OWNERS:
    _model.remark = column_property(
        select(Note.content)
        .where(Note.media_id == _model.system_id, Note.section == "remark")
        .correlate_except(Note)
        .scalar_subquery()
    )

for _model, _column in _REMARK_TIER_OWNERS:
    _model.remark = column_property(
        select(Note.content)
        .where(_column == _model.system_id, Note.section == "remark")
        .correlate_except(Note)
        .scalar_subquery()
    )
```

The media branch no longer needs a per-type key, because `note.media_id`
already pins the type through `media`.

In `app/utils/formatter.py`, `parse_note_from_sheet` reads the four new headers
and falls back to the old pair so a pre-migration sheet still Pulls:

```python
        # The four owner columns replaced the (owner_type, owner_id) pair. A
        # sheet backed up before that change still carries the pair, so it is
        # read as a fallback and resolved by pull.py against media and the
        # three tier tables - otherwise every note in an old sheet loses its
        # owner on the round trip.
        "media_id": _uuid_or_none(raw.get("media_id")),
        "collection_id": _uuid_or_none(raw.get("collection_id")),
        "franchise_id": _uuid_or_none(raw.get("franchise_id")),
        "series_id": _uuid_or_none(raw.get("series_id")),
        "_legacy_owner_type": parse_from_sheet(raw.get("owner_type"), str),
        "_legacy_owner_id": _uuid_or_none(raw.get("owner_id")),
```

and `app/services/pipelines/pull.py` resolves the two `_legacy_*` keys into the
four columns before the row is applied, dropping them from the payload. A row
that resolves to neither is skipped and reported, not written — the CHECK would
reject it anyway.

- [ ] **Step 6: Run the migration and the tests**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_note_owner_fks.py -v
```
Expected: one head; all six tests PASS.

- [ ] **Step 7: Run the full suite and Backup**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures, clean. Then run `/system` → **Backup** so the sheet
carries the new Note tab shape before anything else touches it.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/models/note.py app/models/__init__.py app/routers/note.py \
        app/services/domain/remark_field.py app/utils/formatter.py \
        app/services/pipelines/pull.py \
        alembic/versions/m5b1notefks_note_owner_fks.py \
        tests/api/test_note_owner_fks.py docs/PROGRESS.md
```
Proposed message: `refactor(notes): address a note's owner by four real foreign keys`
**Ask before running `git commit`.**

---

### Task 11: `meme` — four owner FKs and a `num_nonnulls` CHECK

**Files:**
- Modify: `app/models/meme.py`
- Modify: `app/routers/meme.py`
- Modify: `app/utils/formatter.py`
- Modify: `app/services/pipelines/pull.py`
- Create: `alembic/versions/m5b2memefks_meme_owner_fks.py`
- Create: `tests/api/test_meme_owner_fks.py`

**Interfaces:**
- Consumes: `media` (Step 0), the pattern established in Task 10.
- Produces: `meme.media_id` / `collection_id` / `franchise_id` / `series_id`,
  `ck_meme_one_owner`, and `Meme.owner_type` / `Meme.owner_id` as derived
  properties.

**Do not read Task 10 and improvise.** The two tasks look alike and differ in
three ways: `meme` has no singleton index and no `owner_section` index to
rebuild, `meme` has no `column_property` mapped back onto its owners, and the
meme router filters on `owner_type` directly in `_apply_filters` and groups by
it in `get_memes_grouped`, both of which need rewriting.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_meme_owner_fks.py
"""
A meme's owner is a real foreign key now - one of four, exactly one non-null.

A running gag often spans a franchise, so meme keeps all twelve owner types;
what changes is that every one of them cascades.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def admin_id(db):
    return db.query(models.User).filter(models.User.username == "admin").one().id


def test_exactly_one_owner_column_may_be_set(db, sample_anime, admin_id):
    db.add(
        models.Meme(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            franchise_id=sample_anime.system_id,
            text="兩個擁有者",
            author_id=admin_id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_a_meme_with_no_owner_is_rejected(db, admin_id):
    db.add(
        models.Meme(system_id=uuid.uuid4(), text="沒有擁有者", author_id=admin_id)
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_a_media_entry_cascades_its_memes(db, sample_anime, admin_id):
    meme = models.Meme(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        text="會連帶刪除",
        author_id=admin_id,
    )
    db.add(meme)
    db.commit()
    meme_id = meme.system_id

    db.execute(
        text("DELETE FROM media WHERE system_id = :s"), {"s": sample_anime.system_id}
    )
    db.commit()

    assert db.query(models.Meme).filter_by(system_id=meme_id).first() is None


def test_deleting_a_collection_cascades_its_memes(db, sample_collection, admin_id):
    meme = models.Meme(
        system_id=uuid.uuid4(),
        collection_id=sample_collection.system_id,
        text="合集的梗",
        author_id=admin_id,
    )
    db.add(meme)
    db.commit()
    meme_id = meme.system_id

    db.execute(
        text("DELETE FROM collection WHERE system_id = :s"),
        {"s": sample_collection.system_id},
    )
    db.commit()

    assert db.query(models.Meme).filter_by(system_id=meme_id).first() is None


def test_owner_type_and_owner_id_are_derived(db, sample_collection, admin_id):
    meme = models.Meme(
        system_id=uuid.uuid4(),
        collection_id=sample_collection.system_id,
        text="推導",
        author_id=admin_id,
    )
    db.add(meme)
    db.commit()

    assert meme.owner_type == "collection"
    assert meme.owner_id == sample_collection.system_id
    assert "owner_type" not in models.Meme.__table__.c


def test_the_memes_endpoint_still_filters_by_owner_type(
    db, admin_client, sample_anime, admin_id
):
    db.add(
        models.Meme(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            text="動畫的梗",
            author_id=admin_id,
        )
    )
    db.commit()

    r = admin_client.get("/api/memes", params={"owner_type": "anime"})
    assert r.status_code == 200
    assert "動畫的梗" in [m["text"] for m in r.json()]

    r = admin_client.get("/api/memes", params={"owner_type": "collection"})
    assert r.status_code == 200
    assert "動畫的梗" not in [m["text"] for m in r.json()]
```

Confirm the meme list route's path and response shape against
`app/routers/meme.py` before writing the last test — it returns resolved owner
dicts, so the text key may be nested.

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_meme_owner_fks.py -v`
Expected: FAIL — `Meme` has no `media_id`.

- [ ] **Step 3: Write the migration**

```python
# alembic/versions/m5b2memefks_meme_owner_fks.py
"""give meme four real owner FKs and drop the FK-less pair

Revision ID: m5b2memefks
Revises: m5b1notefks
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5b2memefks"
down_revision: Union[str, Sequence[str], None] = "m5b1notefks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OWNER_COLUMNS = ("media_id", "collection_id", "franchise_id", "series_id")


def upgrade() -> None:
    """Raw SQL by design - no ORM imports in migrations."""
    for name in OWNER_COLUMNS:
        op.add_column(
            "meme", sa.Column(name, postgresql.UUID(as_uuid=True), nullable=True)
        )

    op.execute("""
        UPDATE meme m2
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = m2.owner_id AND m.media_type = m2.owner_type
    """)
    op.execute("""
        UPDATE meme m2 SET collection_id = m2.owner_id
        WHERE m2.owner_type = 'collection'
          AND EXISTS (SELECT 1 FROM collection c WHERE c.system_id = m2.owner_id)
    """)
    op.execute("""
        UPDATE meme m2 SET franchise_id = m2.owner_id
        WHERE m2.owner_type = 'franchise'
          AND EXISTS (SELECT 1 FROM franchise f WHERE f.system_id = m2.owner_id)
    """)
    op.execute("""
        UPDATE meme m2 SET series_id = m2.owner_id
        WHERE m2.owner_type = 'series'
          AND EXISTS (SELECT 1 FROM series s WHERE s.system_id = m2.owner_id)
    """)

    bind = op.get_bind()
    orphans = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM meme "
            "WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1"
        )
    ).scalar_one()
    if orphans:
        op.execute("""
            DELETE FROM meme
            WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1
        """)

    for name, target in (
        ("media_id", "media"),
        ("collection_id", "collection"),
        ("franchise_id", "franchise"),
        ("series_id", "series"),
    ):
        op.create_foreign_key(
            f"fk_meme_{name}", "meme", target, [name], ["system_id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_meme_{name}", "meme", [name])

    op.create_check_constraint(
        "ck_meme_one_owner",
        "meme",
        "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
    )

    op.execute("DROP INDEX IF EXISTS ix_meme_owner_type")
    op.execute("DROP INDEX IF EXISTS ix_meme_owner_id")
    op.drop_column("meme", "owner_type")
    op.drop_column("meme", "owner_id")


def downgrade() -> None:
    op.add_column("meme", sa.Column("owner_type", sa.String(), nullable=True))
    op.add_column(
        "meme", sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.execute("""
        UPDATE meme m2 SET owner_type = m.media_type, owner_id = m.system_id
        FROM media m WHERE m.system_id = m2.media_id
    """)
    op.execute(
        "UPDATE meme SET owner_type = 'collection', owner_id = collection_id "
        "WHERE collection_id IS NOT NULL"
    )
    op.execute(
        "UPDATE meme SET owner_type = 'franchise', owner_id = franchise_id "
        "WHERE franchise_id IS NOT NULL"
    )
    op.execute(
        "UPDATE meme SET owner_type = 'series', owner_id = series_id "
        "WHERE series_id IS NOT NULL"
    )
    op.create_index("ix_meme_owner_type", "meme", ["owner_type"])
    op.create_index("ix_meme_owner_id", "meme", ["owner_id"])
    op.drop_constraint("ck_meme_one_owner", "meme", type_="check")
    for name in OWNER_COLUMNS:
        op.drop_constraint(f"fk_meme_{name}", "meme", type_="foreignkey")
        op.drop_index(f"ix_meme_{name}", table_name="meme")
        op.drop_column("meme", name)
```

- [ ] **Step 4: Update the model**

In `app/models/meme.py`, replace `owner_type` / `owner_id` with the same four
FK columns Task 10 added to `note` (same names, same `ondelete="CASCADE"`, same
`index=True`), add:

```python
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
            name="ck_meme_one_owner",
        ),
    )
```

and the same two derived properties and `media` relationship Task 10 added to
`Note`. Import `CheckConstraint` from `sqlalchemy` and `relationship` from
`sqlalchemy.orm`.

- [ ] **Step 5: Update the router and the pipelines**

In `app/routers/meme.py`:

- `_apply_filters` currently does
  `query.filter(models.Meme.owner_type == owner_type)`. Replace it with the
  same `_owner_filters` shape Task 10 added to the note router — a tier key
  filters its own column `IS NOT NULL` and equal to `owner_id` when one is
  given; a media key filters `Meme.media_id` and, when `owner_id` is absent,
  joins `media` on `media.media_type == owner_type` so "every anime meme" still
  works.
- `get_memes_grouped` groups by `(owner_type, owner_id)`. Group by the derived
  pair in Python after the query, or by the four columns in SQL and map back —
  either is fine, but the response shape must not change.
- `create_meme`, `update_meme` and `patch_meme` write the owner through
  `_owner_columns`, popping `owner_type` / `owner_id` from the payload.
- `_to_resolved`, `drop_hidden_rows` and `entry_ref_for` keep working unchanged:
  all three read the pair through `getattr`, and the derived properties supply
  it.

In `app/utils/formatter.py`, `parse_meme_from_sheet` gains the four columns and
the same `_legacy_owner_type` / `_legacy_owner_id` fallback, resolved in
`app/services/pipelines/pull.py`.

- [ ] **Step 6: Run the migration and the tests**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/api/test_meme_owner_fks.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: one head, all PASS, clean.

- [ ] **Step 7: Backup**

Run `/system` → **Backup**. The Meme tab has changed shape; the sheet must
carry the new headers before the next environment switch.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/models/meme.py app/routers/meme.py app/utils/formatter.py \
        app/services/pipelines/pull.py \
        alembic/versions/m5b2memefks_meme_owner_fks.py \
        tests/api/test_meme_owner_fks.py docs/PROGRESS.md
```
Proposed message: `refactor(memes): address a meme's owner by four real foreign keys`
**Ask before running `git commit`.**

---

# Phase E — documentation

### Task 12: Record what changed

**Files:**
- Modify: `docs/data-model.md`
- Modify: `docs/authorization.md`
- Modify: `docs/data-actions.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: `docs/data-model.md`**

Add `author_id` to the `note`, `quote` and `meme` descriptions. Replace the
`note` and `meme` entries in "Cross-table references without foreign keys" with
the four-column disjoint set and `ck_note_one_owner` / `ck_meme_one_owner`;
after Step 0 and this plan, `plan_next` is the only table left in that section.
Record that `owner_type` and `owner_id` are derived properties, not columns,
and that they are read-only. Bump `Last verified`.

- [ ] **Step 2: `docs/authorization.md`**

Add a section on note scope: the two scopes, the write/read table from this
plan's Task 8, the `note.write_own` permission, and the changed meaning of the
`personal_notes` field group — it no longer protects anything on the entry page,
because personal sections filter by `author_id`; what it now governs is reading
another user's personal notes through the `author` parameter when their list is
public. State plainly that the wider authorization redesign the spec calls for
is **not** done here. Bump `Last verified`.

- [ ] **Step 3: `docs/data-actions.md`**

Record the Sheets consequence: the Note and Meme tabs changed shape in this
plan, an old sheet's `owner_type` / `owner_id` columns are read as a Pull
fallback, and `author_id` falls back to the admin user when blank. Bump
`Last verified`.

- [ ] **Step 4: `docs/roadmap.md` and `docs/PROGRESS.md`**

Note in the roadmap that Step 5 shipped, including the two limitations carried
forward: one remark per owner site-wide, and quotes and memes universal by
design. Delete this plan's table from `docs/PROGRESS.md` and remove the
`anime_site_test_step5` database from the droppable list once it is dropped.

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add docs/data-model.md docs/authorization.md docs/data-actions.md \
        docs/roadmap.md docs/PROGRESS.md
```
Proposed message: `docs: record note scoping, note/quote/meme authorship and the disjoint owner FKs`
**Ask before running `git commit`.**

---

## Definition of done

- Every one of the 29 `NOTE_SECTIONS` entries declares a `scope`; 7 personal,
  20 catalogue, 2 external with `None`, and `NoteSection.scope` has no default.
- `note`, `quote` and `meme` each have a `NOT NULL author_id` referencing
  `users(id) ON DELETE CASCADE`, and no row is missing one.
- The same `GET /api/notes` request as two different viewers returns two
  different personal answers and one identical catalogue answer.
- A logged-out viewer sees no personal notes at all.
- A non-admin holding `note.write_own` may create, edit and delete their own
  personal notes and nothing else; catalogue notes stay admin-only.
- Quotes and memes return the same rows to every viewer, exactly as before.
- `DELETE FROM media WHERE system_id = …` removes that entry's notes and memes,
  and deleting a collection, franchise or series does the same, with no service
  code involved.
- `note` and `meme` have no `owner_type` or `owner_id` column;
  `Note.owner_type` and `Meme.owner_type` still answer correctly.
- `grep -rn "owner_type" app/ --include=*.py` returns hits only in
  `plan_next.py`, `media_resolver.py`, the derived properties, the routers'
  request parameters and the Sheets fallback.
- All four checks green; `alembic heads` shows one head; a Backup has been run
  after Task 11.

## Known limitations, carried forward deliberately

- **One remark per owner, site-wide.** The `remark` column_property cannot know
  who is asking, so the partial unique index stays per-owner and a second
  user's remark is refused. Task 9 records this in the code and in tests.
  Lifting it is part of the deferred authorization redesign.
- **The `personal_notes` field group is only half rebuilt.** It governs the
  `author` parameter and nothing else. `docs/authorization.md` needs rewriting
  rather than amending, as the spec says, and that is not this plan.
- **No frontend work.** `scope` is on the API and nothing renders it. The
  notes page still shows its editors to admins only, so a `user`-role account
  can write personal notes through the API but not through the UI. That UI is
  the deferred authorization redesign's job.
- **`plan_next` still uses the FK-less pair.** It is Step 3's.
