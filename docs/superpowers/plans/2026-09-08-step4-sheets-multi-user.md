# Step 4 — Google Sheets for multiple users — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user's data survive a machine switch. After Steps 0–3 the
database holds a shared catalogue, a `users` table with real accounts and a
`user_media_list` table holding everybody's list rows — and the Google Sheet,
which `docs/switching-environments.md` makes the *only* path data takes between
the company machine and the home machine, carries none of the last two. A
Backup taken today and a Pull All run tomorrow would restore the catalogue and
silently drop every user and every list row.

**Architecture:** Four phases. **A — Users** adds the `Users` tab: a tab that
carries who exists and what role they hold, and deliberately does *not* carry
the password hash (Task 1 states the tradeoff and the decision). **B — User
Media List** adds the per-user list rows, identified by `media_type` +
`public_id` and by `username` rather than by raw UUIDs, so the sheet stays
human-readable during a switch. **C — The narrowed media tabs** handles the
fallout of Step 1 dropping the personal columns off the nine detail models:
`format_model_for_sheet` walks `__table__.columns`, so those tabs narrow the
moment Step 1 lands, and the *old* sheet still has the old headers waiting to
be pulled back in. **D — Ordering, round trip, docs** turns the restore order
into a tested contract and proves the whole thing with a two-user Backup → Pull
All cycle.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL 17, pytest, ruff;
React + Vite, TanStack Query, Tailwind v4, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-multi-user-catalog-design.md`
(the Step 4 row of "Sub-projects", and the "Google Sheets" section under "What
else has to change").

---

## Handoff from Step 0 — what this plan does NOT build

Three things a reader would expect to find here are **already delivered by Step
0**, in `docs/superpowers/plans/2026-09-08-step0-media-supertable.md` Task 23
("Keep Backup and Pull working"). They moved there because Step 0's contract
phase (its Tasks 20–22) drops `public_id`, `cover_image_file`, `franchise_id`
and `series_id` off the nine detail models — and since
`format_model_for_sheet` walks `__table__.columns` in declaration order, those
four columns vanish from all nine Sheets tabs the instant Step 0 lands. A Step 0
that shipped without them would strand the two-machine workflow until Step 4.

Treat all five as **existing preconditions**:

| Precondition | Delivered by |
|---|---|
| A `Media` tab in `SHEET_TABS`, carrying `system_id`, `media_type`, `public_id`, `display_name`, `cover_image_file`, `franchise_id`, `series_id`, timestamps | Step 0 Task 23 Step 3 |
| A read-only denormalised `display_name` column on each of the nine media tabs — delivered as an `extra_columns` entry, so Backup writes it and it is not a model column | Step 0 Task 23 Step 4 |
| `pull.drop_non_columns(model, payload)`, applied so a header that is not a real column on the tab's model never reaches the row | Step 0 Task 23 Step 4 |
| `Media` ordered before the nine media tabs, with a test | Step 0 Task 23 Step 5 |
| `tests/api/test_media_tab_roundtrip.py` | Step 0 Task 23 Step 1 |

`drop_non_columns` is Step 0's because Step 0 is what first puts a non-column
header on a media tab — the denormalised `display_name`. Step 4 does not
introduce it; Task 7 **verifies** it and proves it covers the second wave of
non-column headers, the personal columns Step 1 moves out.

```python
# app/services/pipelines/pull.py, added by Step 0 Task 23
def drop_non_columns(model, payload: dict) -> dict:
    """Keep only keys that are real columns on `model`."""
    columns = {c.name for c in model.__table__.columns}
    return {k: v for k, v in payload.items() if k in columns}
```

**Where it is called, and how many places.** The Pull path constructs a model in
exactly **one** place — `Model(**clean_header_dict)` at
`app/services/pipelines/pull.py:994`, inside the UPSERT branch of
`execute_pull_specific`. There is no second construction site: the auto-created
franchises and series come from `resolve_*_parent_hierarchy` in
`app/services/domain/`, which build their rows from explicit keyword arguments
rather than from a sheet payload, and never see `clean_header_dict`.

There is, however, a **sibling** that shares the same payload and needs the same
filter: the UPDATE branch's `setattr` loop at `pull.py:989`. An unknown key
there does not raise — SQLAlchemy lets you set any attribute on a mapped
instance — it silently sets a plain Python attribute that is never persisted, so
a stale header is a quiet no-op on an UPDATE and a `TypeError` that aborts the
whole tab on an INSERT. Both read `clean_header_dict`, so the correct placement
is **one** call applied to `clean_header_dict` immediately before the
`if existing is not None:` UPSERT branch (i.e. before `pull.py:985`), which
covers construction and mutation together. Step 0 should say "one call site,
before the UPSERT branch", not "before every construction".

**Verify before starting:**

```bash
venv/Scripts/python.exe -c "from app.services.pipelines.pull import drop_non_columns; from app.services.pipelines.tabs import TAB_BY_NAME; print('Media' in TAB_BY_NAME); print([n for n, _ in TAB_BY_NAME['Anime'].extra_columns])"
```

Expected: `drop_non_columns` imports, `Media` is present, and `display_name` is
among the `Anime` tab's extra columns. If any of the three is missing,
**Step 0 Task 23 is not done — finish it first.**

---

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
  moment a later migration adds one. Any backfill is **raw SQL via
  `op.execute`**, with column lists spelled out. No exceptions.
- **This step needs no migration.** Step 4 is pipeline code: the `users`,
  `media` and `user_media_list` tables all exist by the end of Step 2, and
  nothing here changes a column. If a task turns out to need one anyway, its
  revision id is **`m4a1sheets`** and its `down_revision` is the head Step 3
  left behind. Run `venv/Scripts/python.exe -m alembic heads` before committing
  and confirm exactly one.
- **`alembic upgrade head` from an empty database is already broken** at
  `86982d71c2f1` (`docs/PROGRESS.md`, open item). Do not treat that
  pre-existing failure as caused by this plan.
- **Give this session its own test database.** Concurrent sessions poison a
  shared `anime_site_test`. Export `POSTGRES_DB=anime_site_test_step4` before
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
  `tv-show`) and underscored only in router filenames. The sheet tab for the
  `anime_movies` table is named **`Anime Movie`** (singular). Every tab name
  lives in `app/services/pipelines/tabs.py` and nowhere else.
- **Model column order IS sheet column order.** `format_model_for_sheet` walks
  `instance.__class__.__table__.columns` in declaration order. Reordering a
  model reorders its tab. Never reorder a model in this step.
- **Back up before touching Pull.** `/system` → Backup, and keep a `pg_dump`.
  Every task here can, if wrong, write bad rows into the one copy of the data
  that travels between machines.
- **Update the matching doc in the same change** and bump its `Last verified`
  line. This plan touches `docs/data-actions.md` throughout.
- **Claim the task in `docs/PROGRESS.md`** (`wip <who>`) before starting; set it
  to `done <sha>` in the same commit as the work.

---

## Interface contract from earlier steps

Names this plan depends on and must not rename.

```python
# Step 0 — app/models/media.py
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
# Step 1 — app/models/user_media_list.py
class UserMediaList(Base):
    __tablename__ = "user_media_list"
    system_id: UUID          # PK, minted per database
    user_id: UUID            # FK users.id
    media_id: UUID           # FK media.system_id
    status: str
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
    # UniqueConstraint("user_id", "media_id", name="uq_user_media")
```

```python
# Step 2 — app/models/system.py, class User (its existing columns plus one)
#   id, username, hashed_password, role_id, list_is_public
# and a `user` role alongside `guest` and `admin`.
```

Names **this** plan produces, used by later tasks in it:

- `SheetTab` gains nothing new; `drop_columns` and `extra_columns` already
  carry everything Step 4 needs.
- `app/services/security.py`: `UNUSABLE_PASSWORD_HASH` and
  `is_unusable_password_hash(value) -> bool`.
- `app/utils/formatter.py`: `parse_user_from_sheet`,
  `parse_user_media_list_from_sheet`.
- `execute_pull_specific` / `execute_pull_all` return an extra
  `unresolved_refs: list[str]`.
- Tab names, verbatim: **`Users`**, **`User Media List`**.

---

## The restore-order contract

This is the heart of the step. Steps 0–2 added real foreign keys where there
were none, so an out-of-order restore that used to produce quiet orphans now
raises a `ForeignKeyViolation` that rolls back the whole tab.

```
Users            ->  before  User Media List   (user_media_list.user_id FK)
Media            ->  before  User Media List   (user_media_list.media_id FK)
Media            ->  before  the nine media tabs   (Step 0: detail.system_id FK)
Collection -> Franchise -> Series -> Media       (media.franchise_id / series_id)
```

Positions in `SHEET_TABS` after this plan:

| Position | Tab | Why there |
|---|---|---|
| 1 (first) | `Users` | Nothing points at it, and Steps 3 and 5 add `user_id` to `plan_next`, `seasonal`, `note`, `meme` and `quote`. Putting it first now means those steps move nothing. Its `role_id` needs no tab of its own: `ensure_rbac_seed` creates the roles on every machine at startup and in `tests/api/conftest.py` |
| … | (unchanged) | `System Options` … `Series` |
| after `Series`, before `Anime` | `Media` | **Step 0** put it here |
| … | (unchanged) | the nine media tabs, `Novel Unit`, `Game Copy` |
| immediately after `Game Copy` | `User Media List` | After `Media` and after `Users`, both by a wide margin. Grouped with the per-entry tabs so a human reading the sheet finds it next to the catalogue it annotates |
| … | (unchanged) | `Watch Order List` … `Seasonal` |

Task 9 turns this table into a test.

---

# Phase A — the `Users` tab

### Task 1: `hashed_password` does not travel — the decision, and the unusable-hash contract

**Files:**
- Modify: `app/services/security.py`
- Create: `tests/unit/test_unusable_password.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `UNUSABLE_PASSWORD_HASH` and `is_unusable_password_hash()`, both
  used by Task 3's Pull path.

**The decision, and why.** `users.hashed_password` holds a bcrypt hash
(`app/services/security.py:get_password_hash`). Two options, both real:

| | Hash travels in the sheet | Hash does not travel |
|---|---|---|
| **For** | A user restored on the other machine can log in immediately, with no admin action. The two machines stay genuinely interchangeable | A bcrypt hash of a short or reused password is offline-crackable; the sheet is a Google Doc reached by a service account whose `credentials.json` sits on two developer laptops, and it already leaves the database's trust boundary on every Backup. Once the design is multi-user the hashes are **other people's** credentials, not the admin's to export |
| **Against** | Every Backup writes every account's credential material into a document with a share link. The spec's own auth notes say the deferred hardening "is not tolerable once other people have passwords in this database" | A restored user cannot log in until an admin sets their password on that machine |

**Decision: the hash does not travel.** The `Users` tab drops the column
entirely. What Sheets exists for is *data* — and the data is the list rows,
which survive intact because the `users` row itself (and therefore
`user_media_list.user_id`) restores. What is lost is a credential, which is
re-establishable in ten seconds through `PUT /api/users/{id}` on the arriving
machine, by the one person entitled to set it. Accounts are invite-only and few
(spec: "Admin creates users; no public registration"), so the cost is bounded
and one-off per user per machine; the risk on the other side is unbounded and
permanent, because a sheet, once leaked, cannot be un-leaked.

A user Pull creates therefore gets an **unusable** hash — not a blank (the
column is `nullable=False`), and not a known constant like `"changeme"`, which
would be a password anyone reading this file could use.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_unusable_password.py
"""
A user restored from the Google Sheet has no password.

hashed_password deliberately does not travel in the sheet (see the Users tab
in app/services/pipelines/tabs.py), so Pull mints an account nobody can log
into until an admin sets a real password. The marker must be a value NO input
can ever verify against - a known placeholder string would be a password
printed in the source tree.

Pure Python, no database.
"""

from app.services.security import (
    UNUSABLE_PASSWORD_HASH,
    get_password_hash,
    is_unusable_password_hash,
    verify_password,
)


def test_the_marker_is_recognised():
    assert is_unusable_password_hash(UNUSABLE_PASSWORD_HASH) is True


def test_a_real_hash_is_not_the_marker():
    assert is_unusable_password_hash(get_password_hash("hunter2")) is False


def test_nothing_verifies_against_the_marker():
    for attempt in ["", " ", "!", UNUSABLE_PASSWORD_HASH, "admin", "hunter2"]:
        assert verify_password(attempt, UNUSABLE_PASSWORD_HASH) is False


def test_the_marker_is_not_a_valid_bcrypt_hash():
    """Belt and braces: even if verify_password stopped catching, bcrypt
    cannot parse this as a salt, so it can never report a match."""
    assert not UNUSABLE_PASSWORD_HASH.startswith("$2")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_unusable_password.py -v`
Expected: FAIL with `ImportError: cannot import name 'UNUSABLE_PASSWORD_HASH'`

- [ ] **Step 3: Write the implementation**

In `app/services/security.py`, above `get_password_hash`:

```python
# The hash stored for an account that has no password on this machine.
#
# users.hashed_password does NOT travel in the Google Sheet: it is credential
# material for other people's accounts, and a Backup writes the sheet outside
# this database's trust boundary. Pull therefore restores the account and
# stamps this marker, and an admin sets a real password through
# PUT /api/users/{id} on the arriving machine.
#
# "!" is not a bcrypt hash and cannot be produced by get_password_hash (every
# bcrypt hash starts "$2"), so no input can ever verify against it: checkpw
# raises on the malformed salt and verify_password returns False. Django uses
# the same leading "!" convention for the same reason.
UNUSABLE_PASSWORD_HASH = "!"


def is_unusable_password_hash(value: str | None) -> bool:
    """True when this account cannot be logged into until a password is set."""
    return not value or value.startswith("!")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_unusable_password.py -v`
Expected: all four PASS.

- [ ] **Step 5: Run ruff and the unit tier**

Run:
```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest tests/unit -q
```
Expected: clean; no new failures.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/services/security.py tests/unit/test_unusable_password.py docs/PROGRESS.md
```
Proposed message: `feat(auth): add an unusable-password marker for accounts restored from Sheets`
**Ask before running `git commit`.**

---

### Task 2: The `Users` tab — Backup side

**Files:**
- Modify: `app/services/pipelines/tabs.py`
- Modify: `app/utils/formatter.py`
- Create: `tests/api/test_users_sheet.py`

**Interfaces:**
- Consumes: `models.User` with `list_is_public` (Step 2); `models.Role`.
- Produces: the tab named **`Users`**, and `formatter.parse_user_from_sheet`.
  Task 3 adds its Pull path.

**Why `role_id` is dropped and `role` travels instead.** `role.system_id` is
minted per database — `ensure_rbac_seed` creates the `guest`, `admin` and
`user` rows at startup on each machine and in `tests/api/conftest.py`, so the
same three roles hold three different UUIDs on the company machine and the home
machine. A raw `role_id` in the sheet is therefore a dangling reference on the
other side, and `users.role_id` is `nullable=False` with
`ondelete="RESTRICT"` — the violation would roll the whole tab back. This is
exactly the problem `Media Source` already solves for `option_id`: drop the
database-local id, carry the natural key beside it, resolve it on the way in.
`role` is not a real column on `User` either (it is a read-only
`column_property` over `role.name`, mapped at the bottom of
`app/models/__init__.py`), so `format_model_for_sheet` — which walks
`__table__.columns` — never emits it. It has to be an `extra_columns` entry.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_users_sheet.py
"""
The Users tab.

Accounts have to travel or a machine switch strands every user's list: the
list rows point at users.id with a real FK, so a user_media_list restore into
a database that has never heard of that user fails on the foreign key and
rolls the whole tab back.

Two columns deliberately do NOT travel:
  * hashed_password - credential material for other people's accounts, and the
    sheet leaves this database's trust boundary on every Backup.
  * role_id - role.system_id is minted per database by ensure_rbac_seed, so
    the sheet's value is a dangling reference on the other machine. The role
    NAME travels in its place, the way Media Source carries an option's
    (category, value) instead of its option_id.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES
from app.utils.formatter import format_model_for_sheet


@pytest.fixture
def db(db_session):
    return db_session


def test_the_users_tab_is_registered_first():
    assert "Users" in TAB_NAMES
    # Nothing points at users, and Steps 3 and 5 add user_id to plan_next,
    # seasonal, note, meme and quote. First now means nothing moves later.
    assert TAB_NAMES.index("Users") == 0


def test_the_tab_drops_the_password_and_the_local_role_id():
    tab = TAB_BY_NAME["Users"]
    assert "hashed_password" in tab.drop_columns
    assert "role_id" in tab.drop_columns


def test_the_tab_carries_the_role_name_instead():
    tab = TAB_BY_NAME["Users"]
    assert [name for name, _fn in tab.extra_columns] == ["role"]


def test_the_backup_row_holds_the_username_role_and_visibility(db):
    tab = TAB_BY_NAME["Users"]
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    user = models.User(
        username="kana",
        hashed_password="$2b$12$notarealhashatallnotarealhashatallnotarealha",
        role_id=role.system_id,
        list_is_public=True,
    )
    db.add(user)
    db.flush()

    kept = [
        c.name
        for c in models.User.__table__.columns
        if c.name not in tab.drop_columns
    ]
    headers = kept + [name for name, _fn in tab.extra_columns]
    values = format_model_for_sheet(user, columns=kept) + [
        fn(user, db) for _name, fn in tab.extra_columns
    ]
    row = dict(zip(headers, values))

    assert "hashed_password" not in row
    assert "role_id" not in row
    assert row["username"] == "kana"
    assert row["role"] == "admin"
    assert row["list_is_public"] == "TRUE"
    assert row["id"] == str(user.id)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_users_sheet.py -v`
Expected: FAIL with `KeyError: 'Users'`

- [ ] **Step 3: Write the parser**

In `app/utils/formatter.py`, beside `parse_content_label_from_sheet`:

```python
def parse_user_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Users sheet into typed data ready for the
    Database.

    Neither `hashed_password` nor `role_id` is emitted, because neither is in
    the sheet: the password is credential material that deliberately does not
    travel (pull.py stamps UNUSABLE_PASSWORD_HASH on a fresh account instead),
    and role_id is minted per database - the role NAME travels as an extra
    column and pull.py resolves it locally.

    `username` is the identity, not `id`: the admin account is minted by
    app/main.py's lifespan on every machine, so the same person holds a
    different uuid on each - see pull.py's DERIVED_IDENTITY_KEYS.

    list_is_public is coerced rather than left None: the column is NOT NULL,
    and a blank cell means "not public", not "unknown".
    """
    is_public = parse_from_sheet(raw.get("list_is_public"), bool)
    return {
        "id": parse_from_sheet(raw.get("id"), UUID),
        "username": parse_from_sheet(raw.get("username"), str),
        "list_is_public": bool(is_public),
    }
```

- [ ] **Step 4: Register the tab**

In `app/services/pipelines/tabs.py`, add the role resolver beside
`_option_category` / `_option_value`:

```python
def _user_role_name(row: Any, db: Session) -> Optional[str]:
    """
    The NAME of the role a user holds.

    role.system_id is minted per database by ensure_rbac_seed, so the raw
    role_id would be a dangling reference on the other machine - and
    users.role_id is NOT NULL with ondelete="RESTRICT", so the violation would
    roll the whole tab back. Same shape as Media Source's option columns.
    """
    if row.role_id is None:
        return None
    role = db.get(models.Role, row.role_id)
    return role.name if role else None
```

and make `Users` the **first** entry of `SHEET_TABS`, above `System Options`:

```python
SHEET_TABS: tuple[SheetTab, ...] = (
    # Accounts first. Nothing in the sheet points at users, and every
    # per-user tab does: user_media_list.user_id is a real FK, and steps 3
    # and 5 add user_id to plan_next, seasonal, note, meme and quote. The
    # roles a user cites need no tab of their own - ensure_rbac_seed creates
    # guest/admin/user on every machine at startup.
    #
    # hashed_password is dropped ON PURPOSE and is the one column in the whole
    # registry that does not round-trip: it is credential material for other
    # people's accounts, and a Backup writes the sheet outside this database's
    # trust boundary. Pull stamps UNUSABLE_PASSWORD_HASH on an account it
    # creates; an admin sets the real password on the arriving machine.
    SheetTab(
        "Users",
        models.User,
        f.parse_user_from_sheet,
        drop_columns=("hashed_password", "role_id"),
        extra_columns=(("role", _user_role_name),),
    ),
    # Vocabulary next; scopes point at options via option_id.
    SheetTab("System Options", models.SystemOption, f.parse_system_option_from_sheet),
    # ... every other entry stays exactly where it is ...
)
```

- [ ] **Step 5: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_users_sheet.py -v`
Expected: all four PASS.

- [ ] **Step 6: Run the pipeline tests and the full suite**

Run:
```bash
venv/Scripts/python.exe -m pytest tests/api/test_backup_failure.py tests/api/test_media_tab_roundtrip.py -v
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures. Backup now writes a `Users` tab; Pull still has no
path for it, which Task 3 adds — an unpulled tab is inert, not broken.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/pipelines/tabs.py app/utils/formatter.py \
        tests/api/test_users_sheet.py docs/PROGRESS.md
```
Proposed message: `feat(sheets): back up accounts on a Users tab, without the password hash`
**Ask before running `git commit`.**

---

### Task 3: The `Users` tab — Pull side

**Files:**
- Modify: `app/services/pipelines/pull.py`
- Modify: `tests/api/test_users_sheet.py`

**Interfaces:**
- Consumes: the `Users` tab (Task 2); `UNUSABLE_PASSWORD_HASH` (Task 1).
- Produces: a restorable `Users` tab. Task 5's `User Media List` resolution
  depends on the users existing locally.

**Three things Pull needs that no other tab needs at once:**

1. **`pk_field` is `id`, not `system_id`.** `pull.py` picks the PK column from
   a hardcoded list; `users.id` is a UUID named `id`, so `Users` joins that
   list. It must **not** join `DERIVED_IDENTITY_MINTED_PK` — that set is for
   *autoincrement integer* PKs, where the sheet's `id = 1` names a real but
   unrelated local row. A UUID that misses is merely unknown, so trying it
   first is free and correctly follows a username *renamed* in the sheet back
   to the row that already holds it.
2. **`username` is the natural key.** `app/main.py`'s lifespan mints the
   `admin` account on every machine, so the same person has two different
   UUIDs. Without a natural-key match, a Pull would try to INSERT a second
   `admin` and collide with `users.username`'s UNIQUE index, rolling the tab
   back.
3. **`role` and `hashed_password` are INSERT-only concerns.** Resolve the role
   name to a local `role_id`; stamp `UNUSABLE_PASSWORD_HASH` — but only on an
   INSERT. An UPDATE must never touch an existing account's password, or every
   Pull All would lock the admin out of their own machine.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_users_sheet.py`:

```python
import uuid

from app.services.pipelines import pull
from app.services.security import UNUSABLE_PASSWORD_HASH, get_password_hash

USER_HEADERS = ["id", "username", "list_is_public", "role"]


@pytest.fixture
def sheets(monkeypatch):
    """Feed execute_pull_specific fake tabs, keyed by tab name."""

    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def test_a_new_user_arrives_with_an_unusable_password(db, sheets):
    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "kana", "TRUE", "user"]]})

    result = pull.execute_pull_specific(db, "Users", log_action=False)

    assert result["status"] == "success"
    kana = db.query(models.User).filter_by(username="kana").one()
    assert kana.hashed_password == UNUSABLE_PASSWORD_HASH
    assert kana.list_is_public is True
    assert kana.role_ref.name == "user"


def test_a_foreign_uuid_updates_the_local_account_by_username(db, sheets):
    """
    app/main.py mints the admin account on every machine, so the same person
    holds a different uuid here and there. Honouring the sheet's uuid would
    INSERT a second 'cg1618' and collide with users.username's UNIQUE index,
    rolling the whole tab back.
    """
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    local = models.User(
        username="cg1618",
        hashed_password=get_password_hash("real-password"),
        role_id=role.system_id,
        list_is_public=False,
    )
    db.add(local)
    db.flush()
    local_id = local.id

    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "cg1618", "TRUE", "admin"]]})

    result = pull.execute_pull_specific(db, "Users", log_action=False)

    assert result["status"] == "success"
    rows = db.query(models.User).filter_by(username="cg1618").all()
    assert len(rows) == 1
    assert rows[0].id == local_id
    assert rows[0].list_is_public is True


def test_a_pull_never_overwrites_an_existing_password(db, sheets):
    """The admin must still be able to log into their own machine after a
    Pull All. An UPDATE touching hashed_password would lock them out."""
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    kept = get_password_hash("real-password")
    db.add(
        models.User(
            username="cg1618",
            hashed_password=kept,
            role_id=role.system_id,
            list_is_public=False,
        )
    )
    db.flush()

    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "cg1618", "TRUE", "admin"]]})
    pull.execute_pull_specific(db, "Users", log_action=False)

    stored = db.query(models.User).filter_by(username="cg1618").one()
    assert stored.hashed_password == kept


def test_an_unknown_role_name_skips_the_row(db, sheets):
    """role_id is NOT NULL with ondelete=RESTRICT: inserting without one fails
    the whole tab, so one bad row must not cost every other account."""
    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "ghost", "FALSE", "wizard"]]})

    result = pull.execute_pull_specific(db, "Users", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.User).filter_by(username="ghost").first() is None
    assert any("wizard" in ref for ref in result["unresolved_refs"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_users_sheet.py -v`
Expected: the four new tests FAIL — on `KeyError: 'unresolved_refs'` and on the
row never being inserted.

- [ ] **Step 3: Add the natural key and the PK field**

In `app/services/pipelines/pull.py`, add to `DERIVED_IDENTITY_KEYS`, at the top
of the dict beside `System Options`:

```python
    # The admin account is minted by app/main.py's lifespan on every machine,
    # so the same person holds a different uuid here and there. username is
    # UNIQUE and is what actually identifies them across databases. NOT in
    # DERIVED_IDENTITY_MINTED_PK: that set is for autoincrement integer keys,
    # where the sheet's id names an unrelated local row. A uuid that misses is
    # merely unknown, so trying it first is free and correctly follows a
    # username RENAMED in the sheet to the row that already holds it.
    "Users": ("username",),  # users.username is UNIQUE
```

and add `"Users"` to the `pk_field = "id"` branch:

```python
        if tab_name in (
            "System Configs",
            "Person Role",
            "Publisher Scope",
            "System Option Scope",
            "System Option Usage",
            # users.id is a UUID, but it is spelled `id`, not `system_id`.
            "Users",
        ):
            pk_field = "id"
```

- [ ] **Step 4: Add the `unresolved_refs` channel**

`execute_pull_specific` already collects `credit_conflicts` and
`created_entities` this way. Add a third list next to them:

```python
    # References the sheet names that this database cannot resolve - an
    # unknown role, an unknown username, an entry no media row matches. The
    # row is skipped rather than allowed to fail the whole tab, but a skipped
    # row is LOST DATA on a restore, so it is reported rather than only
    # logged. Task 6 folds these into the Pull All audit row.
    unresolved_refs: list[str] = []
```

and add it to the function's success return:

```python
    return {
        "status": "success",
        "processed": processed,
        "rows_added": rows_added,
        "rows_updated": rows_updated,
        "credit_conflicts": credit_conflicts,
        "created_entities": created_entities,
        "unresolved_refs": unresolved_refs,
    }
```

- [ ] **Step 5: Resolve the role and stamp the password**

In the parent-resolution part of `execute_pull_specific`, after the
`Media Source` option block and before the `pk_field` selection, add:

```python
        # The Users tab carries the role NAME, not role_id: role.system_id is
        # minted per database by ensure_rbac_seed. Resolve it locally.
        # role_id is NOT NULL with ondelete="RESTRICT", so a row with no
        # resolvable role cannot be stored at all - skip it and report, the
        # way an unresolvable series FK above is handled.
        if tab_name == "Users":
            role_name = parse_from_sheet(raw_header_dict.get("role"), str)
            role = None
            if role_name:
                role = db.query(Role).filter(Role.name == role_name).first()
            if role is None:
                logger.warning(
                    "Could not resolve role %r for user %r on the Users tab. "
                    "Skipping row.",
                    role_name,
                    clean_header_dict.get("username"),
                )
                unresolved_refs.append(
                    f"Users: role {role_name!r} for user "
                    f"{clean_header_dict.get('username')!r} is unknown here"
                )
                continue
            clean_header_dict["role_id"] = role.system_id
```

Add `Role` to the `from app.models import (...)` block at the top of
`pull.py`, keeping the list alphabetical, and add:

```python
from app.services.security import UNUSABLE_PASSWORD_HASH
```

Then in the INSERT-only defaults block (`if existing is None:`), add a branch:

```python
            elif tab_name == "Users":
                # hashed_password does not travel (see tabs.py). A restored
                # account gets a hash nothing can verify against; an admin
                # sets a real password through PUT /api/users/{id} here.
                # INSERT-only by construction: an UPDATE that touched this
                # would lock the admin out of their own machine on every
                # Pull All.
                clean_header_dict["hashed_password"] = UNUSABLE_PASSWORD_HASH
```

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_users_sheet.py -v`
Expected: all eight PASS.

- [ ] **Step 7: Run the full suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures. Other callers of `execute_pull_specific` read the
result by key and ignore extras, so `unresolved_refs` breaks nothing yet.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/pipelines/pull.py tests/api/test_users_sheet.py docs/PROGRESS.md
```
Proposed message: `feat(sheets): restore accounts by username, with an unusable password`
**Ask before running `git commit`.**

---

# Phase B — the `User Media List` tab

### Task 4: The `User Media List` tab — Backup side

**Files:**
- Modify: `app/services/pipelines/tabs.py`
- Modify: `app/utils/formatter.py`
- Create: `tests/api/test_user_media_list_sheet.py`

**Interfaces:**
- Consumes: `models.UserMediaList` (Step 1), `models.Media` (Step 0),
  `models.User`.
- Produces: the tab named **`User Media List`**, and
  `formatter.parse_user_media_list_from_sheet`. Task 5 adds its Pull path.

**Why both foreign keys are dropped.** `user_id` could not travel raw for the
reason Task 2 gives. `media_id` *could* — `media.system_id` is the detail row's
existing UUID and is identical in both databases — but a tab of two UUID
columns beside thirteen numbers is unreadable, and the spec is explicit that a
human browses these tabs during an environment switch. So the tab carries
`username`, `media_type` and `public_id`: three cells anybody can read, and
three cells that identify the row exactly (`uq_media_type_public_id` on `media`,
`users.username` UNIQUE).

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_user_media_list_sheet.py
"""
The User Media List tab - every user's list rows.

Identified by username + (media_type, public_id) rather than by the raw
user_id / media_id uuids, because a human reads this tab during an environment
switch (docs/switching-environments.md) and two uuid columns beside thirteen
numbers are unreadable. Both natural keys are exact: users.username is UNIQUE
and uq_media_type_public_id covers (media_type, public_id) on media.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES
from app.utils.formatter import format_model_for_sheet


@pytest.fixture
def db(db_session):
    return db_session


def test_the_tab_is_registered_after_users_and_media():
    assert "User Media List" in TAB_NAMES
    # user_media_list.user_id and .media_id are both real FKs since steps 1
    # and 2. Out of order, the restore fails on the foreign key and rolls the
    # whole tab back - every user's list, lost.
    assert TAB_NAMES.index("Users") < TAB_NAMES.index("User Media List")
    assert TAB_NAMES.index("Media") < TAB_NAMES.index("User Media List")


def test_the_tab_drops_both_uuid_pointers_for_readable_ones():
    tab = TAB_BY_NAME["User Media List"]
    assert "user_id" in tab.drop_columns
    assert "media_id" in tab.drop_columns
    assert [name for name, _fn in tab.extra_columns] == [
        "username",
        "media_type",
        "public_id",
    ]


def test_the_backup_row_names_its_user_and_its_entry(db):
    tab = TAB_BY_NAME["User Media List"]
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    user = models.User(
        username="kana",
        hashed_password="!",
        role_id=role.system_id,
        list_is_public=False,
    )
    anime = models.Anime(anime_name_cn="葬送的芙莉蓮")
    db.add_all([user, anime])
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()
    row = models.UserMediaList(
        user_id=user.id,
        media_id=media.system_id,
        status="Watching",
        my_rating="9.5",
        ep_fin=11,
    )
    db.add(row)
    db.flush()

    kept = [
        c.name
        for c in models.UserMediaList.__table__.columns
        if c.name not in tab.drop_columns
    ]
    headers = kept + [name for name, _fn in tab.extra_columns]
    values = format_model_for_sheet(row, columns=kept) + [
        fn(row, db) for _name, fn in tab.extra_columns
    ]
    cells = dict(zip(headers, values))

    assert "user_id" not in cells
    assert "media_id" not in cells
    assert cells["username"] == "kana"
    assert cells["media_type"] == "anime"
    assert cells["public_id"] == media.public_id
    assert cells["status"] == "Watching"
    assert cells["my_rating"] == "9.5"
    assert cells["ep_fin"] == "11"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_user_media_list_sheet.py -v`
Expected: FAIL with `KeyError: 'User Media List'`

- [ ] **Step 3: Write the parser**

In `app/utils/formatter.py`:

```python
def parse_user_media_list_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the User Media List sheet into typed data
    ready for the Database.

    Neither user_id nor media_id is emitted, because neither is in the sheet:
    the row cites its user by `username` and its entry by
    (`media_type`, `public_id`), and pull.py resolves both into local uuids
    before the row is stored. That keeps the tab readable by a human during an
    environment switch, which is the whole reason the sheet exists.

    system_id is minted per database (step 1's backfill uses
    gen_random_uuid()), so the identity is the uq_user_media pair - see
    pull.py's DERIVED_IDENTITY_KEYS.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
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
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
```

- [ ] **Step 4: Register the tab**

In `app/services/pipelines/tabs.py`, add the three resolvers beside
`_user_role_name`:

```python
def _list_username(row: Any, db: Session) -> Optional[str]:
    """The username of the user whose list row this is."""
    if row.user_id is None:
        return None
    user = db.get(models.User, row.user_id)
    return user.username if user else None


def _list_media_type(row: Any, db: Session) -> Optional[str]:
    """The hyphenated media_type of the entry this row annotates."""
    if row.media_id is None:
        return None
    media = db.get(models.Media, row.media_id)
    return media.media_type if media else None


def _list_public_id(row: Any, db: Session) -> Optional[int]:
    """
    The entry's public_id. Paired with media_type it is exact -
    uq_media_type_public_id - and unlike the raw media_id uuid a human reading
    the sheet during an environment switch can match it to the Media tab.
    """
    if row.media_id is None:
        return None
    media = db.get(models.Media, row.media_id)
    return media.public_id if media else None
```

`db.get` is an identity-map lookup, so a list of a thousand rows spread across a
few hundred entries costs a few hundred queries at most and repeats none of
them. `Media Source` already resolves its option this way, per row.

Then insert the tab **immediately after `Game Copy`** and before
`Watch Order List`:

```python
    # After Game Copy: every media tab, and therefore Media, has landed.
    # After Users, at the very top. Both are REAL foreign keys since steps 1
    # and 2, so out of order this tab does not produce orphans any more - it
    # raises a ForeignKeyViolation and rolls back every user's list.
    #
    # user_id and media_id are dropped for readable columns: a human browses
    # this tab during an environment switch (docs/switching-environments.md),
    # and username + (media_type, public_id) identify the row exactly.
    SheetTab(
        "User Media List",
        models.UserMediaList,
        f.parse_user_media_list_from_sheet,
        drop_columns=("user_id", "media_id"),
        extra_columns=(
            ("username", _list_username),
            ("media_type", _list_media_type),
            ("public_id", _list_public_id),
        ),
    ),
```

- [ ] **Step 5: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_user_media_list_sheet.py -v`
Expected: all three PASS.

- [ ] **Step 6: Run the full suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/pipelines/tabs.py app/utils/formatter.py \
        tests/api/test_user_media_list_sheet.py docs/PROGRESS.md
```
Proposed message: `feat(sheets): back up every user's list rows on a readable User Media List tab`
**Ask before running `git commit`.**

---

### Task 5: The `User Media List` tab — Pull side

**Files:**
- Modify: `app/services/pipelines/pull.py`
- Modify: `tests/api/test_user_media_list_sheet.py`

**Interfaces:**
- Consumes: the `User Media List` tab (Task 4); `unresolved_refs` (Task 3); the
  `Users` Pull path (Task 3).
- Produces: a restorable per-user list. This is the task the whole step exists
  for.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_user_media_list_sheet.py`:

```python
import uuid

from app.services.pipelines import pull

UML_HEADERS = [
    "system_id", "status", "my_rating", "completed_at", "my_watch_day",
    "ep_fin", "vol_fin", "vol_fin_page", "ch_fin", "arc_fin",
    "ch_fin_in_arc", "progress_display", "issue_fin",
    "created_at", "updated_at",
    "username", "media_type", "public_id",
]


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


@pytest.fixture
def two_users(db):
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    a = models.User(username="cg1618", hashed_password="!",
                    role_id=role.system_id, list_is_public=False)
    b = models.User(username="kana", hashed_password="!",
                    role_id=role.system_id, list_is_public=True)
    db.add_all([a, b])
    db.flush()
    return a, b


def _blank(**cells):
    """One UML_HEADERS-shaped row, empty except for the named cells."""
    return [str(cells.get(h, "")) for h in UML_HEADERS]


def test_a_row_resolves_its_user_and_entry_from_readable_columns(
    db, sheets, two_users
):
    cg, _kana = two_users
    anime = models.Anime(anime_name_cn="測試")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(
                system_id=str(uuid.uuid4()), status="Completed", my_rating="9.5",
                ep_fin="28", username="cg1618", media_type="anime",
                public_id=str(media.public_id),
            ),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    row = db.query(models.UserMediaList).one()
    assert row.user_id == cg.id
    assert row.media_id == media.system_id
    assert row.status == "Completed"
    assert row.ep_fin == 28


def test_two_users_on_the_same_entry_stay_two_rows(db, sheets, two_users):
    cg, kana = two_users
    anime = models.Anime(anime_name_cn="測試二")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(system_id=str(uuid.uuid4()), status="Completed",
                   my_rating="9.5", ep_fin="28", username="cg1618",
                   media_type="anime", public_id=str(media.public_id)),
            _blank(system_id=str(uuid.uuid4()), status="Watching",
                   ep_fin="11", username="kana",
                   media_type="anime", public_id=str(media.public_id)),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    rows = {r.user_id: r for r in db.query(models.UserMediaList).all()}
    assert set(rows) == {cg.id, kana.id}
    assert rows[cg.id].status == "Completed"
    assert rows[kana.id].status == "Watching"
    assert rows[kana.id].ep_fin == 11


def test_a_foreign_row_uuid_updates_in_place_instead_of_colliding(
    db, sheets, two_users
):
    """
    uq_user_media is (user_id, media_id) and system_id is minted per database
    by step 1's backfill. A sheet row carrying an unknown system_id for a list
    row this database already holds must UPDATE it - a blind INSERT collides
    and rolls the whole tab back, losing every user's list.
    """
    cg, _kana = two_users
    anime = models.Anime(anime_name_cn="測試三")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()
    existing = models.UserMediaList(
        user_id=cg.id, media_id=media.system_id, status="Watching", ep_fin=3
    )
    db.add(existing)
    db.flush()
    local_id = existing.system_id

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(system_id=str(uuid.uuid4()), status="Completed",
                   ep_fin="28", username="cg1618", media_type="anime",
                   public_id=str(media.public_id)),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    rows = db.query(models.UserMediaList).all()
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].status == "Completed"
    assert rows[0].ep_fin == 28


def test_an_unknown_username_skips_the_row_and_reports_it(db, sheets):
    anime = models.Anime(anime_name_cn="測試四")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(system_id=str(uuid.uuid4()), status="Watching",
                   username="nobody", media_type="anime",
                   public_id=str(media.public_id)),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.UserMediaList).count() == 0
    assert any("nobody" in ref for ref in result["unresolved_refs"])


def test_an_unknown_entry_skips_the_row_and_reports_it(db, sheets, two_users):
    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(system_id=str(uuid.uuid4()), status="Watching",
                   username="cg1618", media_type="anime", public_id="999999"),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.UserMediaList).count() == 0
    assert any("999999" in ref for ref in result["unresolved_refs"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_user_media_list_sheet.py -v`
Expected: the five new tests FAIL — no row is ever inserted, because `user_id`
and `media_id` are never set and both are `nullable=False`.

- [ ] **Step 3: Add the natural key**

In `pull.py`, add to `DERIVED_IDENTITY_KEYS`:

```python
    # Mints its own uuid (step 1's backfill uses gen_random_uuid()) but the
    # pair it points at is the same everywhere once resolved. Both columns are
    # turned into LOCAL uuids by the username / (media_type, public_id)
    # resolution below, before this match runs, so they compare the ordinary
    # way - the same arrangement Media Source has with option_id.
    "User Media List": ("user_id", "media_id"),  # uq_user_media
```

- [ ] **Step 4: Resolve the user and the entry**

In `execute_pull_specific`, immediately after the `Users` role block from Task 3
and before the `pk_field` selection:

```python
        # The User Media List tab cites its user by username and its entry by
        # (media_type, public_id) - readable columns, not raw uuids. Resolve
        # both into local uuids here, before the natural-key match below,
        # which keys on exactly those two columns.
        #
        # Both are NOT NULL foreign keys since steps 1 and 2, so an
        # unresolvable reference cannot be stored at all. Skip the row and
        # report it: skipping loses one person's opinion of one entry, while
        # letting it through loses every row on the tab when the commit
        # fails. `unresolved_refs` is what stops the loss being silent.
        if tab_name == "User Media List":
            username = parse_from_sheet(raw_header_dict.get("username"), str)
            list_media_type = parse_from_sheet(raw_header_dict.get("media_type"), str)
            list_public_id = parse_from_sheet(raw_header_dict.get("public_id"), int)

            owner = (
                db.query(User).filter(User.username == username).first()
                if username
                else None
            )
            if owner is None:
                logger.warning(
                    "Could not resolve user %r for the User Media List tab. "
                    "Skipping row.",
                    username,
                )
                unresolved_refs.append(
                    f"User Media List: user {username!r} is unknown here"
                )
                continue

            target = None
            if list_media_type and list_public_id is not None:
                target = (
                    db.query(Media)
                    .filter(
                        Media.media_type == list_media_type,
                        Media.public_id == list_public_id,
                    )
                    .first()
                )
            if target is None:
                logger.warning(
                    "Could not resolve entry (%s, %s) for the User Media List "
                    "tab. Skipping row.",
                    list_media_type,
                    list_public_id,
                )
                unresolved_refs.append(
                    f"User Media List: entry ({list_media_type}, "
                    f"{list_public_id}) is unknown here, for user {username!r}"
                )
                continue

            clean_header_dict["user_id"] = owner.id
            clean_header_dict["media_id"] = target.system_id
```

Add `Media` and `User` to the `from app.models import (...)` block at the top of
`pull.py`, keeping the list alphabetical.

- [ ] **Step 5: Add the INSERT-only timestamps**

`user_media_list.created_at` / `updated_at` are Python-side defaults, so an
INSERT without them is fine — but a sheet that carries the headers with blank
cells would set them to `None`. Add to the INSERT-only defaults block, beside
the `Users` branch:

```python
            elif tab_name == "User Media List":
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
```

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_user_media_list_sheet.py -v`
Expected: all eight PASS.

- [ ] **Step 7: Run the full suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add app/services/pipelines/pull.py tests/api/test_user_media_list_sheet.py \
        docs/PROGRESS.md
```
Proposed message: `feat(sheets): restore list rows by username and (media_type, public_id)`
**Ask before running `git commit`.**

---

### Task 6: Report unresolved references in the Pull All audit row

**Files:**
- Modify: `app/services/pipelines/pull.py`
- Create: `tests/api/test_pull_all_unresolved.py`

**Interfaces:**
- Consumes: `unresolved_refs` from `execute_pull_specific` (Tasks 3 and 5).
- Produces: the same list on `execute_pull_all`'s result and in its
  `DataControlLog` row.

A skipped row is lost data. The admin page shows a generic toast and reloads the
log table, so the audit row is the only place a skip actually reaches a human —
exactly the reasoning `credit_conflicts` already carries in `execute_pull_all`.
This task gives `unresolved_refs` the same treatment.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_pull_all_unresolved.py
"""
A row Pull could not resolve is LOST DATA on a restore, so it has to reach a
human. The admin page shows a generic toast and reloads the log table, so the
Pull All audit row is the only place it can.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import json
import uuid

import pytest

from app import models
from app.services.pipelines import pull

USER_HEADERS = ["id", "username", "list_is_public", "role"]


@pytest.fixture
def db(db_session):
    return db_session


def test_pull_all_logs_the_unresolved_references(db, monkeypatch):
    def fake_rows(tab):
        if tab == "Users":
            return [USER_HEADERS, [str(uuid.uuid4()), "ghost", "FALSE", "wizard"]]
        return []

    monkeypatch.setattr(pull, "get_all_raw_rows", fake_rows)

    result = pull.execute_pull_all(db, action_type="Manual")

    assert any("wizard" in ref for ref in result["unresolved_refs"])

    log = (
        db.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == "Pull All")
        .order_by(models.DataControlLog.id.desc())
        .first()
    )
    assert log is not None
    assert log.status == "Failed"
    assert "unresolved" in (log.error_message or "").lower()
    assert "wizard" in json.dumps(json.loads(log.details_json))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_pull_all_unresolved.py -v`
Expected: FAIL with `KeyError: 'unresolved_refs'`

- [ ] **Step 3: Aggregate and report**

In `execute_pull_all`, beside the `credit_conflicts` / `created_entities`
lists:

```python
    # References no local row matched - an unknown role, username or entry.
    # Each one is a row that did NOT restore, so it is reported the way an
    # ambiguous credit is: the run still succeeds (the other rows landed), and
    # the audit row is red so the gap is visible.
    unresolved_refs: list[str] = []
```

in the per-tab loop, beside the other two `extend` calls:

```python
            unresolved_refs.extend(res.get("unresolved_refs", []))
```

and a block immediately **before** the `if credit_conflicts:` block, mirroring
its shape:

```python
    if unresolved_refs:
        summary = (
            f"Full Pull Pipeline completed with {len(unresolved_refs)} "
            "unresolved reference(s); those rows did not restore. Fix the "
            "sheet or restore the missing parent, then pull again: "
            + "; ".join(unresolved_refs)
        )
        logger.error(summary)
        log_data_control(
            db,
            "Pull",
            "Pull All",
            action_type,
            "Failed",
            rows_added=total_added,
            rows_updated=total_updated,
            error_message=summary,
            details_json=json.dumps(
                {"pulled": results, "unresolved_refs": unresolved_refs}
            ),
        )
        return {
            "status": "success",
            "details": results,
            "credit_conflicts": credit_conflicts,
            "created_entities": created_entities,
            "unresolved_refs": unresolved_refs,
        }
```

Add `"unresolved_refs": unresolved_refs` to **every** other `return` of
`execute_pull_all`, including the final success return, so callers can read the
key unconditionally.

- [ ] **Step 4: Run the test**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_pull_all_unresolved.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/services/pipelines/pull.py tests/api/test_pull_all_unresolved.py \
        docs/PROGRESS.md
```
Proposed message: `feat(sheets): report rows a Pull could not resolve in the audit row`
**Ask before running `git commit`.**

---

# Phase C — the narrowed media tabs

Step 1 drops `watching_status` / `reading_status` / `playing_status`,
`my_rating`, `completed_at`, `my_watch_day` and the `*_fin` progress family off
the nine detail models. Because `format_model_for_sheet` walks
`__table__.columns`, the nine tabs narrow by themselves on the next Backup —
that half needs no work. The half that *does* is Pull: the sheet sitting in
Google Drive right now still has those headers, and the parsers still emit those
keys. Step 0's `drop_non_columns` already stops that being fatal — Task 7
proves it and makes an unexpected drop visible, Task 8 removes the dead code
behind it.

### Task 7: Verify `drop_non_columns` covers the personal columns, and report what it drops

**Files:**
- Modify: `app/services/pipelines/pull.py`
- Create: `tests/api/test_pull_ignores_stale_columns.py`

**Interfaces:**
- Consumes: `pull.drop_non_columns` (Step 0 Task 23) — **already exists, do not
  write it again**.
- Produces: proof that it covers Step 1's column move, plus the reporting that
  stops a dropped column being silent.

**The bug this covers.** `execute_pull_specific` keeps every parser key that
appeared in the sheet's header row, then calls `Model(**clean_header_dict)` at
`pull.py:994` (and `setattr`s the same dict at `pull.py:989`). A sheet backed up
before Step 1 has a `watching_status` header; the parser still emits
`watching_status`; the key survives the header filter; and
`Anime(**{..., "watching_status": "Completed"})` raises
`TypeError: 'watching_status' is an invalid keyword argument for Anime` — which
aborts the entire `Anime` tab. The first Pull All after Step 1 is *exactly* that
situation, on nine tabs at once.

Step 0 already installed the guard, for its own non-column header
(`display_name`). **This task adds no guard.** It does two things:

1. **Verifies** the existing `drop_non_columns` call covers the second wave —
   the personal columns Step 1 moves out — with a test that pulls a pre-Step-1
   sheet into a post-Step-1 `Anime`. If Step 0 placed the call in only one of
   the two branches, this task moves it to before the UPSERT branch so it covers
   both.
2. **Reports** what it dropped. Step 0's version is silent, which is right for a
   column the sheet is *expected* to carry (`display_name`, written by Backup on
   purpose) and wrong for one that means "this sheet predates a migration" or
   "this header is a typo that has been discarding a real value". Task 3's
   `unresolved_refs` channel is where it goes, one entry per column per tab, not
   per row.

`drop_non_columns` runs **after** the credit/tag pops, so the legacy credit
headers are already gone and are not reported here.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_pull_ignores_stale_columns.py
"""
A sheet written by an older version of the app must still pull.

Step 1 moved the personal columns (watching_status, my_rating, ep_fin, ...)
off the nine detail models and into user_media_list, so the sheet in Google
Drive carries headers the models no longer have. Without a guard the parser
still emits those keys, the header filter keeps them, and Anime(**payload)
raises TypeError - aborting the WHOLE tab. The first Pull All after step 1
hits that on nine tabs at once.

The guard itself (pull.drop_non_columns) is step 0's, installed there for the
denormalised display_name column. These tests pin that it also covers step 1's
column move, and that a drop is reported rather than silent.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def test_the_guard_from_step_0_covers_the_personal_columns():
    """Unit-level. drop_non_columns is step 0's; this pins that step 1's
    column move falls inside what it already covers."""
    payload = {
        "anime_name_cn": "測試",
        "ep_total": 28,
        "display_name": "測試",      # step 0's denormalised column
        "watching_status": "Completed",  # step 1 moved this out
        "ep_fin": 28,                    # and this
    }
    kept = pull.drop_non_columns(models.Anime, payload)
    assert set(kept) == {"anime_name_cn", "ep_total"}


def test_a_personal_column_left_in_the_sheet_is_ignored(db, sheets):
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "ep_total", "watching_status", "ep_fin"],
            [str(uuid.uuid4()), "陳舊表頭", "28", "Completed", "28"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    anime = db.query(models.Anime).filter_by(anime_name_cn="陳舊表頭").one()
    assert anime.ep_total == 28
    assert not hasattr(anime, "watching_status")


def test_a_stale_column_on_an_UPDATE_is_dropped_too(db, sheets):
    """
    The UPDATE branch setattr()s the same payload the INSERT branch splats.
    An unknown key there does NOT raise - SQLAlchemy lets you set any
    attribute on a mapped instance - it silently sets a plain Python attribute
    that is never persisted. Quiet, but still a payload the guard must have
    cleaned, which is why the call sits before the UPSERT branch and not
    inside one arm of it.
    """
    existing = models.Anime(anime_name_cn="更新", ep_total=12)
    db.add(existing)
    db.flush()

    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "ep_total", "watching_status"],
            [str(existing.system_id), "更新", "24", "Completed"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    db.refresh(existing)
    assert existing.ep_total == 24
    assert not hasattr(existing, "watching_status")


def test_the_dropped_columns_are_reported_not_silent(db, sheets):
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "watching_status"],
            [str(uuid.uuid4()), "回報", "Completed"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    assert any("watching_status" in ref for ref in result["unresolved_refs"])


def test_the_expected_denormalised_column_is_not_reported(db, sheets):
    """
    display_name is on the sheet ON PURPOSE - step 0 writes it so a human can
    read the tab during an environment switch. Reporting it every Pull would
    train the reader to ignore the report, so it is dropped silently and only
    the unexpected columns are named.
    """
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "display_name"],
            [str(uuid.uuid4()), "不回報", "不回報"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    assert not any("display_name" in ref for ref in result["unresolved_refs"])


def test_a_current_column_is_still_stored(db, sheets):
    """The guard must not eat real columns."""
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "ep_total"],
            [str(uuid.uuid4()), "正常", "12"],
        ]
    })

    pull.execute_pull_specific(db, "Anime", log_action=False)

    stored = db.query(models.Anime).filter_by(anime_name_cn="正常").one()
    assert stored.ep_total == 12
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_pull_ignores_stale_columns.py -v`
Expected: `test_the_guard_from_step_0_covers_the_personal_columns`,
`test_a_personal_column_left_in_the_sheet_is_ignored`,
`test_a_stale_column_on_an_UPDATE_is_dropped_too`,
`test_a_current_column_is_still_stored` and
`test_the_expected_denormalised_column_is_not_reported` should already **PASS**
on Step 0's guard — they are the verification half of this task, and a failure
in any of them means Step 0's `drop_non_columns` call is misplaced (see Step 3).
`test_the_dropped_columns_are_reported_not_silent` must **FAIL** with
`KeyError: 'unresolved_refs'` or an empty list: Step 0's guard is silent.

If the first two pass vacuously because `watching_status` is still a real column
on `Anime`, **this task is being done too early — land Step 1 first.**

- [ ] **Step 3: Confirm the guard's placement, and move it if need be**

Read the call site Step 0 added. It must apply to `clean_header_dict`
**immediately before the UPSERT branch** — that is, before
`if existing is not None:` — so that the `setattr` loop and the
`Model(**clean_header_dict)` construction both work from a cleaned payload:

```python
        # Anything that is not a real column on this tab's model, gone.
        #
        # The sheet outlives the schema: a Backup taken before a migration
        # keeps its old headers until the next Backup overwrites them, and the
        # parsers still emit the matching keys. Step 0 added this for the
        # denormalised display_name it writes on purpose; step 1's move of the
        # personal columns (watching_status, my_rating, ep_fin, ...) off the
        # nine detail models is the second wave, and without the guard
        # Model(**payload) raises TypeError and aborts the WHOLE tab - on nine
        # tabs at once, on the first Pull All after step 1.
        #
        # Placed before the UPSERT branch rather than beside the construction,
        # because the UPDATE arm setattr()s the same dict: an unknown key
        # there does not raise, it silently sets a plain Python attribute that
        # is never persisted. One call covers both arms.
        clean_header_dict = drop_non_columns(Model, clean_header_dict)
```

Do not duplicate the call. If Step 0 put it inside the `else:` arm beside
`Model(**...)`, move it up to here; the four verification tests are what tell
you which of the two it is.

- [ ] **Step 3b: Make an unexpected drop visible**

Step 0's guard is silent, which is correct for `display_name` and wrong for a
column that means "this sheet predates a migration" or "this header is a typo".
Report the difference, in the same place, using Task 3's channel:

```python
        # Reported, not silent - but only the UNEXPECTED ones. A column the
        # tab writes on purpose (the denormalised display_name) comes back on
        # every Pull, and naming it every time would train the reader to
        # ignore the report. Everything else is either a sheet awaiting its
        # next Backup or a typo'd header that has been quietly discarding a
        # real value, and both are worth a line. One entry per column, not
        # per row.
        expected_extras = {name for name, _fn in tab.extra_columns}
        for key in before_guard:
            if key in clean_header_dict or key in expected_extras:
                continue
            message = f"{tab_name}: column {key!r} is not on this model any more"
            if message not in unresolved_refs:
                unresolved_refs.append(message)
```

`before_guard` is the key set captured on the line above the
`drop_non_columns` call (`before_guard = set(clean_header_dict)`), and `tab` is
`TAB_BY_NAME[tab_name]` — add `from app.services.pipelines.tabs import TAB_BY_NAME`
to the existing `tabs` import block at the top of `pull.py`.

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_pull_ignores_stale_columns.py -v`
Expected: all six PASS.

- [ ] **Step 5: Run the full suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures. Watch `tests/api/test_media_tab_roundtrip.py` (Step
0's, which exercises the same guard), `tests/api/test_credits_sheets.py` and
`tests/api/test_content_label_sheets.py` — the last two exercise the
pop-and-apply ordering the guard sits behind.

- [ ] **Step 6: Prepare the commit and ask**

```bash
git add app/services/pipelines/pull.py \
        tests/api/test_pull_ignores_stale_columns.py docs/PROGRESS.md
```
Proposed message: `test(sheets): pin drop_non_columns over step 1's column move, and report unexpected drops`
**Ask before running `git commit`.**

---

### Task 8: Retire the personal-column write paths in Pull

**Files:**
- Modify: `app/services/pipelines/pull.py`
- Modify: `app/utils/formatter.py`
- Create: `tests/api/test_pipelines_write_no_personal_columns.py`

**Interfaces:**
- Consumes: Step 1's column drop; `drop_non_columns`, verified in Task 7.
- Produces: the spec's promised test — "no pipeline write path names a
  `user_media_list` column".

Task 7 proves a stale header is *harmless*. This task makes it *absent*: the
INSERT-only defaults in `pull.py` still say
`clean_header_dict["watching_status"] = "Might Watch"`, which is now dead code
that `drop_non_columns` strips again a few lines later — and the nine parsers
still emit keys
nothing consumes. Both are removed here, and a test stops them coming back. A
pipeline that can write a personal column is a data-loss bug once there is more
than one user: Fill and Replace run as the admin and would silently overwrite
somebody else's `watching_status`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_pipelines_write_no_personal_columns.py
"""
No pipeline may write a personal column.

Fill, Replace and Pull run as the admin. Once user_media_list exists, a
pipeline that writes watching_status or ep_fin is not merely wrong, it
silently overwrites another user's opinion of an entry - the spec calls this
out as a data-loss bug. Catalogue columns only.

Metadata and source text; no database needed for the parser half.
"""

import inspect

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import MEDIA_TYPE_FOR_TAB, TAB_PARSERS

PERSONAL_COLUMNS = frozenset(
    {c.name for c in models.UserMediaList.__table__.columns}
    - {"system_id", "user_id", "media_id", "created_at", "updated_at"}
) | {"watching_status", "reading_status", "playing_status"}


def test_no_media_tab_parser_emits_a_personal_column():
    offenders = []
    for tab_name in MEDIA_TYPE_FOR_TAB:
        emitted = set(TAB_PARSERS[tab_name]({}))
        for column in sorted(emitted & PERSONAL_COLUMNS):
            offenders.append(f"{tab_name}: parser still emits {column!r}")
    assert not offenders, "\n".join(offenders)


def test_no_media_model_still_declares_a_personal_column():
    from app.utils.media_resolver import MEDIA_TABLES

    offenders = []
    for key, ref in MEDIA_TABLES.items():
        cols = {c.name for c in ref.model.__table__.columns}
        for column in sorted(cols & PERSONAL_COLUMNS):
            offenders.append(f"{key}: model still declares {column!r}")
    assert not offenders, "\n".join(offenders)


def test_pull_sets_no_personal_default():
    source = inspect.getsource(pull.execute_pull_specific)
    for column in sorted(PERSONAL_COLUMNS):
        assert f'"{column}"' not in source, (
            f"pull.py still names the personal column {column!r}; personal "
            "data belongs to the User Media List tab"
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_pipelines_write_no_personal_columns.py -v`
Expected: `test_no_media_tab_parser_emits_a_personal_column` and
`test_pull_sets_no_personal_default` FAIL, naming the offenders.

- [ ] **Step 3: Remove the dead defaults**

In `execute_pull_specific`'s INSERT-only defaults block, the three status
defaults go and the timestamp defaults stay:

```python
        if existing is None:
            # Blank airing_status / airing_type stay NULL: "" is in no
            # vocabulary and defeats every `airing_type in {...}` check.
            #
            # The watching_status / reading_status / playing_status defaults
            # that used to live here are gone: step 1 moved those columns to
            # user_media_list, and a status default belongs with the row that
            # owns it. The User Media List tab carries its own.
            if tab_name in (
                "Anime", "Movies", "Anime Movie", "TV Shows", "Cartoons",
                "Manga", "Novel", "Comic", "Game",
            ):
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
            elif tab_name == "Users":
                clean_header_dict["hashed_password"] = UNUSABLE_PASSWORD_HASH
            elif tab_name == "User Media List":
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
            elif tab_name in ("Collection", "Franchise", "Series"):
                # created_at/updated_at are non-nullable on these models, so a
                # tier tab that never carried them still needs a stamp to
                # insert at all.
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
```

- [ ] **Step 4: Stop the parsers emitting personal keys**

In `app/utils/formatter.py`, delete the personal keys from the nine media
parsers. Find them with:

```bash
grep -n "watching_status\|reading_status\|playing_status\|my_rating\|my_watch_day\|completed_at\|ep_fin\|vol_fin\|ch_fin\|arc_fin\|issue_fin\|progress_display" app/utils/formatter.py
```

Delete only the lines inside `parse_anime_from_sheet`,
`parse_anime_movie_from_sheet`, `parse_movie_from_sheet`,
`parse_tv_show_from_sheet`, `parse_cartoon_from_sheet`,
`parse_manga_from_sheet`, `parse_novel_from_sheet`, `parse_comic_from_sheet`
and `parse_game_from_sheet`. **Leave `parse_user_media_list_from_sheet`
alone** — that is where those keys belong now. Add a line to each of the nine
docstrings:

```python
    Personal columns (status, my_rating, the *_fin family) are NOT parsed
    here: step 1 moved them to user_media_list, and they travel on the
    User Media List tab.
```

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_pipelines_write_no_personal_columns.py -v`
Expected: all three PASS.

- [ ] **Step 6: Run the full suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures.

- [ ] **Step 7: Prepare the commit and ask**

```bash
git add app/services/pipelines/pull.py app/utils/formatter.py \
        tests/api/test_pipelines_write_no_personal_columns.py docs/PROGRESS.md
```
Proposed message: `refactor(sheets): confine the media tabs to catalogue columns`
**Ask before running `git commit`.**

---

# Phase D — ordering, round trip, docs

### Task 9: The restore-order contract

**Files:**
- Modify: `app/services/pipelines/tabs.py` (module docstring only)
- Create: `tests/api/test_sheet_restore_order.py`

**Interfaces:**
- Consumes: every tab registered in Tasks 2 and 4.
- Produces: the tested ordering contract `docs/data-actions.md` documents in
  Task 11.

**Why this stops being advisory.** Before Steps 0–2 an out-of-order restore
produced quiet orphans: `media_credit` and friends addressed their entry by an
FK-less `(media_type, entry_id)` pair, so a row could reference an entry that
had not landed yet and simply sit there pointing at nothing. Steps 0–2 replaced
those pairs with real foreign keys, so the same mistake now raises a
`ForeignKeyViolation` at the tab's commit and rolls back **every row on that
tab**. Loud is better, but only if the order is pinned by something other than
the reviewer's memory.

- [ ] **Step 1: Write the test**

```python
# tests/api/test_sheet_restore_order.py
"""
SHEET_TABS order is the RESTORE order, and it is a contract now.

Steps 0-2 replaced the FK-less (media_type, entry_id) pairs with real foreign
keys. An out-of-order restore used to leave quiet orphans; it now raises a
ForeignKeyViolation at the tab's commit and rolls back every row on that tab.
For User Media List that is every user's entire list.

Metadata only; no database.
"""

from app.services.pipelines.tabs import TAB_NAMES

MEDIA_TABS = [
    "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons",
    "Manga", "Novel", "Comic", "Game",
]


def _at(name):
    assert name in TAB_NAMES, f"no {name!r} tab is registered"
    return TAB_NAMES.index(name)


def test_users_is_first():
    # Nothing points at users, and steps 3 and 5 add user_id to plan_next,
    # seasonal, note, meme and quote. First now means nothing moves later.
    assert _at("Users") == 0


def test_media_precedes_every_media_tab():
    # step 0: each detail table's system_id is an FK to media.system_id.
    for tab in MEDIA_TABS:
        assert _at("Media") < _at(tab), f"Media must precede {tab}"


def test_the_tiers_precede_media():
    # media.franchise_id and media.series_id are real FKs.
    assert _at("Collection") < _at("Franchise") < _at("Series") < _at("Media")


def test_user_media_list_follows_both_of_its_parents():
    # user_media_list.user_id -> users.id, .media_id -> media.system_id.
    assert _at("Users") < _at("User Media List")
    assert _at("Media") < _at("User Media List")


def test_user_media_list_follows_every_media_tab():
    """
    Not required by a foreign key - Media alone satisfies those - but a list
    row is meaningless without the entry it annotates, and a human reading the
    sheet during an environment switch expects it beside the catalogue.
    """
    for tab in MEDIA_TABS:
        assert _at(tab) < _at("User Media List")


def test_the_registry_has_no_duplicate_names():
    assert len(set(TAB_NAMES)) == len(TAB_NAMES)
```

- [ ] **Step 2: Run it**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_sheet_restore_order.py -v`
Expected: all six PASS if Tasks 2 and 4 placed the tabs correctly. **If one
fails, move the tab — do not weaken the test.**

- [ ] **Step 3: Restate the contract in the module docstring**

Replace the ordering paragraph at the top of `app/services/pipelines/tabs.py`:

```python
"""
The one registry of Google Sheets tabs.

Backup writes tabs and Pull restores them from this list, so the tab name,
the model, the parser and the restore order are declared exactly once. They
used to live in three hand-maintained places (Backup's 26 blocks, Pull's
MODEL_MAP/PARSER_MAP, Pull's order list) that had already drifted.

Order is the RESTORE order and is STRICT. It used to be strict by convention:
most references were FK-less (media_type, entry_id) pairs, so an out-of-order
restore produced quiet orphans. Steps 0-2 of the multi-user work replaced
those with real foreign keys, so the same mistake now raises a
ForeignKeyViolation at the tab's commit and rolls back every row on that tab.

The chains that must hold, all pinned by tests/api/test_sheet_restore_order.py:

    Users            -> User Media List      (user_media_list.user_id)
    Media            -> User Media List      (user_media_list.media_id)
    Media            -> the nine media tabs  (detail.system_id -> media)
    Collection -> Franchise -> Series -> Media
    Watch Order List -> Section -> Item
    Person / Studio / Publisher / Character / Content Label -> the media tabs

Users is first because nothing points at it and steps 3 and 5 add user_id to
plan_next, seasonal, note, meme and quote.
"""
```

- [ ] **Step 4: Run the full suite and ruff**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```
Expected: no new failures.

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add app/services/pipelines/tabs.py tests/api/test_sheet_restore_order.py \
        docs/PROGRESS.md
```
Proposed message: `test(sheets): pin the restore order as a contract`
**Ask before running `git commit`.**

---

### Task 10: The two-user round trip

**Files:**
- Create: `tests/api/test_multi_user_sheet_roundtrip.py`

**Interfaces:**
- Consumes: everything Tasks 1–9 built.
- Produces: the evidence that a machine switch does not lose data.

**This is the task the step is judged on.** `docs/switching-environments.md`
makes the sheet the only path data takes between the company machine and the
home machine, and states the rule plainly: *"The sheet holds exactly one version
of the data: Backup overwrites every tab, Pull All overwrites every table."* If
Backup → Pull All is not the identity function on this data, the next machine
switch loses somebody's list.

The test drives the real `execute_backup` and the real `execute_pull_all`
against an in-memory workbook: `bulk_overwrite_sheet` writes into a dict and
`get_all_raw_rows` reads out of the same dict, so every tab round-trips through
the same code an admin's Backup does.

- [ ] **Step 1: Write the test**

```python
# tests/api/test_multi_user_sheet_roundtrip.py
"""
Backup then Pull All must reproduce the database exactly, for two users.

docs/switching-environments.md makes Google Sheets the ONLY path data takes
between the company machine and the home machine, and Pull All overwrites
every table. If this cycle is not the identity function, the next machine
switch loses somebody's list - and there is no second copy.

Drives the real execute_backup and execute_pull_all against an in-memory
workbook, so every tab travels through the same code an admin's Backup does.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def workbook(monkeypatch):
    """One dict standing in for the spreadsheet. Backup writes it, Pull reads it."""
    sheet: dict[str, list[list]] = {}

    def _write(tab_name, matrix):
        if not matrix:
            raise ValueError("refusing to blank a tab")
        sheet[tab_name] = [list(row) for row in matrix]
        return True

    def _read(tab_name):
        return sheet.get(tab_name, [])

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", _write)
    monkeypatch.setattr(pull, "get_all_raw_rows", _read)
    return sheet


@pytest.fixture
def two_users_with_lists(db):
    """Two users, three entries across three media types, four list rows."""
    admin_role = db.query(models.Role).filter(models.Role.name == "admin").one()
    cg = models.User(username="cg1618", hashed_password="$2b$12$x" * 4,
                     role_id=admin_role.system_id, list_is_public=False)
    kana = models.User(username="kana", hashed_password="$2b$12$y" * 4,
                       role_id=admin_role.system_id, list_is_public=True)
    frieren = models.Anime(anime_name_cn="葬送的芙莉蓮", anime_name_en="Frieren")
    csm = models.Manga(manga_name_cn="鏈鋸人", manga_name_en="Chainsaw Man")
    hk = models.Game(game_name_en="Hollow Knight")
    db.add_all([cg, kana, frieren, csm, hk])
    db.commit()

    def media_of(entry):
        return db.query(models.Media).filter_by(system_id=entry.system_id).one()

    db.add_all([
        models.UserMediaList(user_id=cg.id, media_id=media_of(frieren).system_id,
                             status="Completed", my_rating="9.5", ep_fin=28),
        models.UserMediaList(user_id=kana.id, media_id=media_of(frieren).system_id,
                             status="Watching", ep_fin=11),
        models.UserMediaList(user_id=cg.id, media_id=media_of(csm).system_id,
                             status="Reading", my_rating="8.0",
                             vol_fin=14.0, ch_fin=152.0),
        models.UserMediaList(user_id=kana.id, media_id=media_of(hk).system_id,
                             status="Might Play"),
    ])
    db.commit()
    return cg, kana


def _snapshot(db):
    """The data this step is responsible for, as comparable plain values."""
    users = {
        u.username: (u.role_ref.name, u.list_is_public)
        for u in db.query(models.User).all()
    }
    lists = {}
    for row in db.query(models.UserMediaList).all():
        user = db.get(models.User, row.user_id)
        media = db.get(models.Media, row.media_id)
        lists[(user.username, media.media_type, media.public_id)] = (
            row.status, row.my_rating, row.ep_fin, row.vol_fin,
            row.ch_fin, row.issue_fin, row.my_watch_day, row.completed_at,
        )
    return users, lists


def test_backup_then_pull_all_reproduces_two_users_lists(
    db, workbook, two_users_with_lists
):
    before_users, before_lists = _snapshot(db)
    assert len(before_users) >= 2
    assert len(before_lists) == 4

    backup.execute_backup(db, action_type="Manual")
    assert "Users" in workbook
    assert "User Media List" in workbook
    assert "Media" in workbook

    # Wipe exactly what the sheet is now responsible for, the way a Pull All
    # onto the other machine finds it: no list rows, no non-admin accounts.
    db.execute(text("DELETE FROM user_media_list"))
    db.execute(text("DELETE FROM users WHERE username <> 'admin'"))
    db.commit()
    assert db.query(models.UserMediaList).count() == 0

    result = pull.execute_pull_all(db, action_type="Manual")
    assert result["status"] == "success"
    assert result["unresolved_refs"] == []

    after_users, after_lists = _snapshot(db)
    assert after_users == before_users
    assert after_lists == before_lists


def test_the_restored_accounts_cannot_be_logged_into(
    db, workbook, two_users_with_lists
):
    """
    The password deliberately does not travel. A restored account must be
    unusable rather than carry a guessable placeholder - and the list rows
    must survive regardless, which is the point of the tradeoff.
    """
    from app.services.security import is_unusable_password_hash, verify_password

    backup.execute_backup(db, action_type="Manual")
    db.execute(text("DELETE FROM user_media_list"))
    db.execute(text("DELETE FROM users WHERE username <> 'admin'"))
    db.commit()

    pull.execute_pull_all(db, action_type="Manual")

    kana = db.query(models.User).filter_by(username="kana").one()
    assert is_unusable_password_hash(kana.hashed_password)
    assert verify_password("", kana.hashed_password) is False
    assert db.query(models.UserMediaList).filter_by(user_id=kana.id).count() == 2


def test_a_second_pull_all_changes_nothing(db, workbook, two_users_with_lists):
    """Idempotence. A Pull All that duplicated rows would double every list on
    the second run, and uq_user_media would abort the tab."""
    backup.execute_backup(db, action_type="Manual")
    pull.execute_pull_all(db, action_type="Manual")
    once = _snapshot(db)

    pull.execute_pull_all(db, action_type="Manual")

    assert _snapshot(db) == once
    assert db.query(models.UserMediaList).count() == 4
```

- [ ] **Step 2: Run it**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_multi_user_sheet_roundtrip.py -v`
Expected: all three PASS. A failure here names the exact column or row that does
not survive — fix the tab, never the assertion.

- [ ] **Step 3: Run the whole suite and all four checks**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint
```
Expected: all four green. (No frontend file changes in this step, but CI runs
all four on every push.)

- [ ] **Step 4: Do a real round trip before committing**

A green suite is **not** sufficient evidence for this task; the in-memory
workbook is not Google Sheets. With a `pg_dump` taken first:

1. `/system` → **Backup**.
2. Open the spreadsheet and confirm the `Users` tab has no `hashed_password`
   column, has a `role` column, and that `User Media List` reads as `username` /
   `media_type` / `public_id` beside the progress numbers.
3. `/system` → **Pull All**.
4. Check the admin log: the `Pull All` row should be `Success` with no
   unresolved references, and you must still be logged in.
5. `venv/Scripts/python.exe -m pytest tests/api/test_display_name_drift.py -v`

- [ ] **Step 5: Prepare the commit and ask**

```bash
git add tests/api/test_multi_user_sheet_roundtrip.py docs/PROGRESS.md
```
Proposed message: `test(sheets): prove Backup then Pull All round-trips two users' lists`
**Ask before running `git commit`.**

---

### Task 11: Documentation

**Files:**
- Modify: `docs/data-actions.md`
- Modify: `docs/switching-environments.md`
- Modify: `docs/authentication.md`
- Modify: `docs/roadmap.md`, `docs/PROGRESS.md`

- [ ] **Step 1: Update the tab table in `docs/data-actions.md` §2**

`Users` becomes 1, `Media` sits where Step 0 put it (after `Series`), and
`User Media List` follows `Game Copy` — so every subsequent number shifts. Do
not hand-patch a few rows; regenerate the table body from the registry and paste
it in. Write this two-line script to the scratchpad and run it:

```python
# scratch_tab_table.py
from app.services.pipelines.tabs import SHEET_TABS

for i, t in enumerate(SHEET_TABS, 1):
    key = f"`{t.media_type}`" if t.media_type else ""
    print(f"| {i} | `{t.name}` | `{t.model.__name__}` | {key} |")
```

Run: `venv/Scripts/python.exe scratch_tab_table.py`, paste the output over the
table body, then delete the script.

- [ ] **Step 2: Add the ordering contract to `docs/data-actions.md` §2**

Replace the existing "Its order is the **restore** order and is strict" line
with a subsection `### 2.1 The restore-order contract`, holding: the six chains
from the `tabs.py` docstring; the sentence that the strictness changed character
in Steps 0–2 (quiet orphans became a `ForeignKeyViolation` that rolls back the
whole tab); and a pointer to `tests/api/test_sheet_restore_order.py` as the
enforcement.

- [ ] **Step 3: Document the two new tabs in `docs/data-actions.md` §2**

Under the existing per-tab notes, add:

> **`Users`** carries `id`, `username`, `list_is_public` and `role`.
> `hashed_password` and `role_id` are dropped. `role_id` because
> `role.system_id` is minted per database by `ensure_rbac_seed`, so the role
> **name** travels instead and Pull resolves it locally — the same arrangement
> `Media Source` has with `option_id`. `hashed_password` because it is
> credential material for other people's accounts and a Backup writes the sheet
> outside this database's trust boundary; Pull stamps `UNUSABLE_PASSWORD_HASH`
> on an account it creates and **never** touches an existing account's hash. The
> identity is `username` (UNIQUE), not `id`: the lifespan mints the `admin`
> account on every machine, so the same person holds a different uuid here and
> there.
>
> **`User Media List`** carries every user's list rows. `user_id` and `media_id`
> are dropped for `username`, `media_type` and `public_id` — both pairs are
> exact (`users.username` UNIQUE, `uq_media_type_public_id`), and a human reads
> this tab during an environment switch. Its natural key is
> `(user_id, media_id)` = `uq_user_media`, compared after both have been
> resolved to local uuids. A reference that resolves to nothing skips the row
> and lands in `unresolved_refs`.

- [ ] **Step 4: Document `unresolved_refs` in `docs/data-actions.md` §3.1/§3.2**

Add it to the §3.1 return-dict description (including the stale-column guard
that also reports through it) and to the §3.2 outcome table: every tab pulled
but some references unresolved → master row `Failed` with `error_message`
`"Full Pull Pipeline completed with N unresolved reference(s)…"` and
`details_json` `{"pulled": …, "unresolved_refs": […]}`, response still
`{"status": "success"}`. Bump `Last verified`.

- [ ] **Step 5: Add the password caveat to `docs/switching-environments.md`**

In the **After switching in** checklist, after the Pull All step:

> **Passwords do not travel.** The `Users` tab carries who exists and what role
> they hold, but not the password hash — it is credential material and the sheet
> leaves this database's trust boundary on every Backup. An account Pull created
> on this machine cannot be logged into until an admin sets a password on it at
> `/users`. Your own admin account is unaffected: Pull never overwrites an
> existing account's password.

Bump `Last verified`.

- [ ] **Step 6: Cross-reference from `docs/authentication.md`**

One line beside the password-hashing section, pointing at
`UNUSABLE_PASSWORD_HASH` and `is_unusable_password_hash`, and saying where
accounts with one come from. Bump `Last verified`.

- [ ] **Step 7: Record the step**

Note in `docs/roadmap.md` that Step 4 shipped, and delete this plan's table from
`docs/PROGRESS.md`.

- [ ] **Step 8: Prepare the commit and ask**

```bash
git add docs/data-actions.md docs/switching-environments.md \
        docs/authentication.md docs/roadmap.md docs/PROGRESS.md
```
Proposed message: `docs: record the Users and User Media List tabs and the restore-order contract`
**Ask before running `git commit`.**

---

## Definition of done

- `SHEET_TABS` holds `Users` first and `User Media List` after `Game Copy`,
  with `tests/api/test_sheet_restore_order.py` green.
- A Backup writes a `Users` tab with no `hashed_password` and no `role_id`
  column, and a `User Media List` tab whose user and entry are readable without
  opening the database.
- `test_backup_then_pull_all_reproduces_two_users_lists` passes: two users,
  three entries, four list rows, restored exactly.
- A second consecutive Pull All changes nothing
  (`test_a_second_pull_all_changes_nothing`).
- A Pull never changes an existing account's password; an account it creates
  cannot be logged into.
- A sheet still carrying the pre-Step-1 personal headers pulls cleanly on both
  the INSERT and the UPDATE path, and names the stale columns in
  `unresolved_refs` instead of aborting the tab — while `display_name`, which
  the tab writes on purpose, is dropped silently.
- `venv/Scripts/python.exe -m pytest tests/api/test_pipelines_write_no_personal_columns.py -q`
  is green: no media parser, model or Pull default names a `user_media_list`
  column.
- A row Pull could not resolve appears in the `Pull All` audit row, red, with
  the reference named.
- All four checks green; `alembic heads` shows one head.
- A real Backup → Pull All cycle done by hand on the live database, with the
  admin still logged in afterwards.
