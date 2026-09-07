# Steam Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `games` prices (US/JP/TW), the Metacritic critic score, achievement counts and personal playtime from Steam, and give the game pipeline its first bulk Replace.

**Architecture:** IGDB learns to return the Steam appid, so every game that has one gets `steam_appid` / `steam_link` for free during the existing Fill. A new keyless storefront client then fills prices, Metacritic and the achievement total, while an optional keyed Web-API client fills personal playtime and achievements earned. Game becomes the first media type with two sources merged into one Fill, and gains a Replace that re-runs the Steam half only.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, `requests` + `tenacity`, pytest, React + Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-steam-integration-design.md`

## Global Constraints

- **Python** is `venv/Scripts/python.exe`. Never bare `python`.
- **Test database:** this plan uses its own scratch DB, `anime_site_test_steam`, because concurrent sessions poison the shared one. Create it once: `createdb -U postgres anime_site_test_steam`. Run api tests as `POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/... -q`. Record the DB in the `docs/PROGRESS.md` "Droppable test dbs" row.
- **`tests/unit/`** must never touch the database or the network. **`tests/api/`** requires PostgreSQL.
- **Patch targets:** autofill tests monkeypatch the name *as imported into* `app.services.domain.autofill`, not the client module. Client tests monkeypatch `steam.requests.get` and stub `steam_store_rate_limiter.wait_if_needed` to a no-op so no test ever sleeps.
- **Retry testing:** never call a `@retry`-decorated public fetcher with a failing response — `wait_exponential(min=2)` makes the suite crawl. Test status-code behaviour against the private `_store_request` / `_web_request` helpers directly.
- **Four gates stay green:** `venv/Scripts/python.exe -m pytest -q`, `venv/Scripts/ruff.exe check .`, `cd frontend && npm run test:run`, `cd frontend && npm run lint`.
- **After any frontend change:** `cd frontend && npm run build`, or the change exists on :5173 but not :8000.
- **Concurrency (CLAUDE.md):** the tree was clean when this plan was written, but other sessions may edit the same files on this branch at any time. Stage only the exact files named in each task — never `git add -A`, never a directory pathspec. Re-read the diff of each file before staging and confirm every hunk is yours.
- **Commits (CLAUDE.md):** every "Commit" step means *prepare the commit, show the one-line message, and ask for approval*. Do not commit unprompted. Commit messages end with the session's Co-Authored-By / Claude-Session trailers.
- **Alembic head is `gm1e2t3a4c5`**, and the dev DB is already there (`alembic current` verified 2026-09-06). The new migration in Task 4 chains from it.
- **Credentials:** `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` are set, so Task 2's live `external_games` probe can run for real. Task 6's JPY check needs no credentials at all — the storefront is keyless. `STEAM_API_KEY` / `STEAM_ID` are unset and are needed only for the personal-progress half; every other Steam column fills without them.
- **Naming, fixed across tasks:** `extract_steam_appid`, `apply_extract_steam_appid`, `apply_extract_game_ids`, `map_steam_to_game_data`, `autofill_game_from_steam`, `apply_single_replace_game`, `has_missing_values_game_steam`, `steam_progress_sync`, `SteamStoreRateLimiter`, `steam_store_rate_limiter`.

---

## File Structure

**Created**
| File | Responsibility |
|---|---|
| `app/utils/steam_utils.py` | Pure: appid extraction + payload→column mapping. No I/O. |
| `app/services/integrations/steam.py` | HTTP only: throttle, retry, timeout, two hosts. |
| `alembic/versions/gs1p2r3o4g5_add_game_steam_progress_sync.py` | The one new column. |
| `tests/unit/test_steam_utils.py` | Extraction + mapping, no DB, no network. |
| `tests/unit/test_steam_client.py` | Transport behaviour with `requests` faked. |
| `tests/api/test_game_steam_autofill.py` | Write rules and guards against a real session. |
| `tests/api/test_game_steam_replace.py` | The new bulk Replace route and selector. |

**Modified**
| File | Change |
|---|---|
| `app/config.py` | `steam_api_key`, `steam_id` |
| `.env.example` | The Steam block |
| `app/services/integrations/igdb.py` | `GAME_FIELDS` gains `external_games` |
| `app/utils/igdb_utils.py` | Mapper yields `steam_appid` / `steam_link` |
| `app/models/game.py` | `steam_progress_sync` column |
| `app/schemas/game.py` | One field on `GameBase` |
| `app/utils/formatter.py` | `parse_game_from_sheet` reads the new column |
| `app/services/domain/derivation.py` | `apply_extract_steam_appid`, `apply_extract_game_ids` |
| `app/services/domain/checking.py` | `has_missing_values_game_steam` |
| `app/services/domain/autofill.py` | `autofill_game_from_steam`; IGDB half writes the appid |
| `app/services/domain/post_processing.py` | `apply_single_replace_game` |
| `app/services/domain/__init__.py` | Export the new names |
| `app/services/pipelines/specs.py` | `STEAM_PAUSE`, OR'd eligibility, Replace wiring |
| `app/services/pipelines/replace.py` | `execute_replace_game = _bulk("game")` — **required or the app will not boot** |
| `app/services/integrations/catalog.py` | `SERVICES["steam"]`, merged game `Coverage` |
| `tests/api/test_external_api_catalog.py` | Update two intentional drift guards |
| `frontend/src/config/formFactories.js`, `formFields/fieldMeta.js`, `lib/payloads.js`, `pages/add-tabs/GameAddTab.jsx`, `pages/admin/Modify.jsx`, `pages/detail/Game.jsx`, `pages/admin/Admin.jsx` | New tristate field; Replace button |
| `frontend/src/lib/payloads.test.js` | Assert the new tristate |
| Docs | `external-apis.md`, `data-model.md`, `entry-types.md`, `business-rules.md`, `data-actions.md`, `PROGRESS.md` |

---

# Milestone 1 — the identifier

### Task 1: `extract_steam_appid`

**Files:**
- Create: `app/utils/steam_utils.py`
- Test: `tests/unit/test_steam_utils.py`

**Interfaces:**
- Produces: `extract_steam_appid(url: Optional[str]) -> Optional[int]`

- [ ] **Step 1: Write the failing test**

`tests/unit/test_steam_utils.py`:

```python
"""Reading a Steam appid out of a store URL."""

from app.utils.steam_utils import extract_steam_appid


def test_a_canonical_store_url_yields_the_appid():
    assert extract_steam_appid("https://store.steampowered.com/app/1245620/") == 1245620


def test_a_url_with_a_trailing_slug_still_yields_the_appid():
    url = "https://store.steampowered.com/app/1245620/ELDEN_RING/"
    assert extract_steam_appid(url) == 1245620


def test_a_community_url_is_not_a_store_url():
    assert extract_steam_appid("https://steamcommunity.com/app/1245620") is None


def test_junk_and_empty_values_yield_none():
    assert extract_steam_appid("not a url") is None
    assert extract_steam_appid("") is None
    assert extract_steam_appid(None) is None
```

- [ ] **Step 2: Run it and watch it fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit/test_steam_utils.py -q
```

Expected: `ModuleNotFoundError: No module named 'app.utils.steam_utils'`.

- [ ] **Step 3: Write the implementation**

`app/utils/steam_utils.py`:

```python
"""
steam_utils.py
Pure helpers for the Steam integration: reading an appid out of a store URL,
and mapping storefront payloads onto game columns. No I/O lives here.
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Only the store host carries an appid we trust. A steamcommunity.com URL uses
# the same /app/<id>/ shape but is a hub link, not the store page the prices
# and Metacritic score come from.
STEAM_APPID_PATTERN = re.compile(r"store\.steampowered\.com/app/(\d+)")


def extract_steam_appid(url: Optional[str]) -> Optional[int]:
    """
    Extracts the numeric appid from a Steam store URL.
    Returns None for an empty value or a non-store URL.
    """
    if not url:
        return None
    match = STEAM_APPID_PATTERN.search(str(url))
    return int(match.group(1)) if match else None


def steam_link_for(appid: int) -> str:
    """The canonical store URL we store, so its shape is ours and is stable."""
    return f"https://store.steampowered.com/app/{appid}/"
```

- [ ] **Step 4: Run it and watch it pass**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit/test_steam_utils.py -q
venv/Scripts/ruff.exe check app/utils/steam_utils.py tests/unit/test_steam_utils.py
```

Expected: 4 passed, ruff clean.

- [ ] **Step 5: Commit (ask first)**

```bash
git add app/utils/steam_utils.py tests/unit/test_steam_utils.py
git commit -m "feat(steam): extract the appid from a store URL"
```

---

### Task 2: IGDB returns the appid

**Files:**
- Modify: `app/services/integrations/igdb.py:52` (`GAME_FIELDS`)
- Modify: `app/utils/igdb_utils.py:103` (`map_igdb_to_game_data`)
- Test: `tests/unit/test_igdb_utils.py`

**Interfaces:**
- Consumes: `steam_link_for` from Task 1.
- Produces: `map_igdb_to_game_data(raw)` gains keys `steam_appid: Optional[int]` and `steam_link: Optional[str]`.

- [ ] **Step 1: Settle the live question first**

The spec's one factual unknown: whether IGDB still serves the Steam row under `external_games.category` (legacy enum, Steam = 1) or only under `external_games.external_game_source`. Credentials are set, so run this for real.

```
venv/Scripts/python.exe -c "from app.services.integrations.igdb import _request; print(_request('external_games', 'fields game,category,external_game_source,uid; where game = 119133; limit 10;', context='probe'))"
```

Record the answer in the mapper's comment. Request both fields in `GAME_FIELDS` regardless — the safe superset costs nothing and survives IGDB finishing the migration. The tests below pass either way.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/test_igdb_utils.py`:

```python
STEAM_ROW = {
    "id": 119133,
    "name": "Elden Ring",
    "external_games": [
        {"category": 1, "uid": "1245620"},
        {"category": 11, "uid": "somexboxid"},
    ],
}


def test_the_steam_appid_is_read_from_external_games():
    assert map_igdb_to_game_data(STEAM_ROW)["steam_appid"] == 1245620


def test_a_canonical_steam_link_is_synthesised_from_the_appid():
    mapped = map_igdb_to_game_data(STEAM_ROW)
    assert mapped["steam_link"] == "https://store.steampowered.com/app/1245620/"


def test_a_game_with_no_steam_row_yields_neither():
    raw = {"id": 5, "external_games": [{"category": 11, "uid": "xbox"}]}
    mapped = map_igdb_to_game_data(raw)
    assert mapped["steam_appid"] is None
    assert mapped["steam_link"] is None


def test_a_game_with_no_external_games_at_all_yields_neither():
    mapped = map_igdb_to_game_data({"id": 5, "name": "Bare"})
    assert mapped["steam_appid"] is None
    assert mapped["steam_link"] is None


def test_a_non_numeric_uid_is_ignored_rather_than_crashing():
    raw = {"id": 5, "external_games": [{"category": 1, "uid": "not-a-number"}]}
    assert map_igdb_to_game_data(raw)["steam_appid"] is None
```

- [ ] **Step 3: Run it and watch it fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit/test_igdb_utils.py -q
```

Expected: `KeyError: 'steam_appid'`.

- [ ] **Step 4: Implement**

In `app/services/integrations/igdb.py`, extend `GAME_FIELDS` (keep `SEARCH_FIELDS` untouched — search does not need it):

```python
GAME_FIELDS = (
    "name,summary,first_release_date,cover.url,genres.name,themes.name,"
    "game_modes.name,platforms.name,involved_companies.company.name,"
    "involved_companies.developer,involved_companies.publisher,parent_game,url,"
    # The Steam appid, which is what the whole Steam integration keys off.
    # Both spellings are requested: `category` is the legacy enum (Steam = 1)
    # and `external_game_source` its replacement. Asking for both is the safe
    # superset while IGDB migrates.
    "external_games.category,external_games.external_game_source,external_games.uid"
)
```

In `app/utils/igdb_utils.py`, add above the mapper:

```python
from app.utils.steam_utils import steam_link_for

# IGDB's external_games category for Steam, in the legacy enum.
IGDB_EXTERNAL_STEAM = 1


def _steam_appid(rows: Optional[List[Dict[str, Any]]]) -> Optional[int]:
    """
    The Steam appid out of IGDB's external_games list.

    Accepts either spelling of the discriminator: `category` is the legacy
    enum, `external_game_source` its replacement. The fallback tests for None
    rather than for absence, because a half-migrated row carries `category`
    as an explicit null beside the populated new field - `.get(a, b)` would
    return that null and drop the row. A uid that is not a plain integer is
    ignored - IGDB carries store slugs for some platforms in the same field.
    """
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        source = row.get("category")
        if source is None:
            source = row.get("external_game_source")
        if source != IGDB_EXTERNAL_STEAM:
            continue
        uid = str(row.get("uid") or "")
        if uid.isdigit():
            return int(uid)
    return None
```

and two keys in the returned dict, after `"parent_igdb_id"`:

```python
        "parent_igdb_id": raw.get("parent_game"),
        "steam_appid": steam_appid,
        "steam_link": steam_link_for(steam_appid) if steam_appid else None,
```

with `steam_appid = _steam_appid(raw.get("external_games"))` computed beside `companies = _companies(raw)` at the top of the function.

- [ ] **Step 5: Run it and watch it pass**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit/test_igdb_utils.py tests/unit/test_igdb_client.py -q
venv/Scripts/ruff.exe check app/utils/igdb_utils.py app/services/integrations/igdb.py
```

- [ ] **Step 6: Commit (ask first)**

```bash
git add app/services/integrations/igdb.py app/utils/igdb_utils.py tests/unit/test_igdb_utils.py
git commit -m "feat(igdb): return the Steam appid from external_games"
```

---

### Task 3: The appid reaches the database

**Files:**
- Modify: `app/services/domain/derivation.py:112` (after `apply_extract_igdb_id`)
- Modify: `app/services/domain/autofill.py:656` (the fill-only column loop)
- Modify: `app/services/pipelines/specs.py:231` (`extract_id`)
- Modify: `app/services/domain/__init__.py`
- Test: `tests/api/test_game_autofill.py`

**Interfaces:**
- Consumes: `extract_steam_appid` (Task 1); `map_igdb_to_game_data`'s new keys (Task 2).
- Produces: `apply_extract_steam_appid(entry) -> bool`, `apply_extract_game_ids(entry) -> bool`.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_game_autofill.py`. Note `MAPPED` in that file is returned by a patched mapper, so the two new keys go in the local payload:

```python
def test_the_steam_appid_and_link_are_written_from_igdb(db_session, patched, monkeypatch):
    monkeypatch.setattr(
        autofill_module,
        "map_igdb_to_game_data",
        lambda raw: dict(
            MAPPED,
            steam_appid=1245620,
            steam_link="https://store.steampowered.com/app/1245620/",
        ),
    )
    game = make_game(db_session, igdb_id=119133)

    autofill_game_from_igdb(game, db_session)

    assert game.steam_appid == 1245620
    assert game.steam_link == "https://store.steampowered.com/app/1245620/"


def test_a_hand_typed_steam_link_is_not_replaced_by_igdb(db_session, patched, monkeypatch):
    """Fill-only: the admin's link is the identity, exactly as igdb_link is."""
    monkeypatch.setattr(
        autofill_module,
        "map_igdb_to_game_data",
        lambda raw: dict(
            MAPPED,
            steam_appid=999,
            steam_link="https://store.steampowered.com/app/999/",
        ),
    )
    game = make_game(
        db_session,
        igdb_id=119133,
        steam_link="https://store.steampowered.com/app/1245620/",
    )

    autofill_game_from_igdb(game, db_session)

    assert game.steam_link == "https://store.steampowered.com/app/1245620/"


def test_a_game_with_no_steam_presence_keeps_null_columns(db_session, patched):
    """MAPPED carries no steam keys, which is the console-only case."""
    game = make_game(db_session, igdb_id=119133)

    autofill_game_from_igdb(game, db_session)

    assert game.steam_appid is None
    assert game.steam_link is None
```

And a derivation test in the same file:

```python
def test_extracting_ids_reads_both_links(db_session):
    from app.services.domain.derivation import apply_extract_game_ids

    game = make_game(
        db_session,
        igdb_link="https://api.igdb.com/v4/games/119133",
        steam_link="https://store.steampowered.com/app/1245620/",
    )

    apply_extract_game_ids(game)

    assert game.igdb_id == 119133
    assert game.steam_appid == 1245620
```

- [ ] **Step 2: Run it and watch it fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_game_autofill.py -q
```

Expected: `ImportError: cannot import name 'apply_extract_game_ids'` and assertion failures on `steam_appid`.

- [ ] **Step 3: Implement the extractors**

In `app/services/domain/derivation.py`, directly after `apply_extract_igdb_id`:

```python
def apply_extract_steam_appid(entry) -> bool:
    """Extracts the numeric Steam appid from steam_link and writes it to
    steam_appid. Returns True if set. An unparseable link leaves any existing
    id untouched - the appid is the Steam pipeline's only handle on the entry,
    and a community or slug URL legitimately carries none."""
    steam_appid = extract_steam_appid(entry.steam_link)
    if steam_appid:
        entry.steam_appid = steam_appid
        return True
    return False


def apply_extract_game_ids(entry) -> bool:
    """Both of a game's external ids. A game can carry an IGDB link, a Steam
    link, or both, and the two sources are independent - so this returns True
    when either extractor did, rather than short-circuiting on the first."""
    igdb = apply_extract_igdb_id(entry)
    steam = apply_extract_steam_appid(entry)
    return igdb or steam
```

with `from app.utils.steam_utils import extract_steam_appid` added to the module's imports.

- [ ] **Step 4: Implement the autofill write**

In `app/services/domain/autofill.py`, inside `autofill_game_from_igdb`, leave the existing loop alone and add a paired write beside it. The appid and the link are one identity, not two independent columns:

```python
        for column in ("release_date", "igdb_link"):
            if not getattr(game, column, None) and g_data.get(column):
                setattr(game, column, g_data[column])

        # The appid and the link are one identity: adopt IGDB's Steam pair
        # only when the entry carries neither. A hand-typed link whose appid
        # is still blank must not be paired with IGDB's appid, which can name
        # a different app entirely - another edition, or a bundle.
        if not game.steam_appid and not game.steam_link and g_data.get("steam_appid"):
            game.steam_appid = g_data["steam_appid"]
            game.steam_link = g_data["steam_link"]
```

In the Fill pipeline `extract_id` runs before `fill`, so a hand-typed link has already populated `steam_appid` by this point; this guard is what protects the single-entry autofill path, which has no such ordering.

- [ ] **Step 5: Wire the pipeline and exports**

`app/services/pipelines/specs.py`, in the game spec: `extract_id=apply_extract_game_ids` (update the import from `app.services.domain`).

`app/services/domain/__init__.py`: add `apply_extract_steam_appid` and `apply_extract_game_ids` to the derivation import block and to `__all__`.

- [ ] **Step 6: Run the tests**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_game_autofill.py tests/api/test_game_fill_gate.py tests/unit -q
venv/Scripts/ruff.exe check .
```

Expected: all pass. `test_game_fill_gate.py` is included because it exercises the pipeline's `extract_id`.

- [ ] **Step 7: Commit (ask first)**

```bash
git add app/services/domain/derivation.py app/services/domain/autofill.py app/services/domain/__init__.py app/services/pipelines/specs.py tests/api/test_game_autofill.py
git commit -m "feat(game): fill steam_appid and steam_link from IGDB"
```

**Milestone 1 is complete and independently useful here.** With IGDB credentials set, a Fill run now populates the two Steam columns and nothing else changes.

---

# Milestone 2 — the Steam source

### Task 4: The `steam_progress_sync` column

**Files:**
- Create: `alembic/versions/gs1p2r3o4g5_add_game_steam_progress_sync.py`
- Modify: `app/models/game.py:103`, `app/schemas/game.py:57`, `app/utils/formatter.py:777`
- Modify: `frontend/src/config/formFactories.js:314`, `frontend/src/config/formFields/fieldMeta.js:793`, `frontend/src/lib/payloads.js:281`, `frontend/src/pages/add-tabs/GameAddTab.jsx:437`, `frontend/src/pages/admin/Modify.jsx:865`, `frontend/src/pages/detail/Game.jsx:452`
- Test: `frontend/src/lib/payloads.test.js:71`

**Interfaces:**
- Produces: `Game.steam_progress_sync` — nullable Boolean; NULL/True means Steam owns this entry's progress, False means it never touches it.

- [ ] **Step 1: Write the failing frontend test**

Extend the existing block in `frontend/src/lib/payloads.test.js`:

```js
// The three completion flags are tristate selects: "" is "unknown", not false.
describe("game completion flags", () => {
  it("sends all three as tristate booleans", () => {
    const payload = gameFieldsPayload({
      all_endings: "true",
      all_achievements: "false",
      all_collected: "",
    });
    expect(payload.all_endings).toBe(true);
    expect(payload.all_achievements).toBe(false);
    expect(payload.all_collected).toBeNull();
  });
});

// Not a completion flag: this one decides whether Steam may write playtime
// and achievements earned over what is already there.
describe("steam progress sync", () => {
  it("sends the lock as a tristate boolean", () => {
    expect(gameFieldsPayload({ steam_progress_sync: "false" }).steam_progress_sync).toBe(false);
    expect(gameFieldsPayload({ steam_progress_sync: "true" }).steam_progress_sync).toBe(true);
    expect(gameFieldsPayload({ steam_progress_sync: "" }).steam_progress_sync).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```
cd frontend && npm run test:run -- payloads
```

Expected: `expected undefined to be false`.

- [ ] **Step 3: Write the migration**

`alembic/versions/gs1p2r3o4g5_add_game_steam_progress_sync.py`:

```python
"""Add games.steam_progress_sync.

Revision ID: gs1p2r3o4g5
Revises: gm1e2t3a4c5

Whether Steam is the authority for this entry's own progress. It exists for
the game owned on Steam but played elsewhere: 200 hours on a console, 2 on
Steam, and without the lock a Replace run would overwrite 200 with 2.

Tristate like the completion flags, and read the same way: NULL means the
question was never asked, and is treated as "yes" because most games carrying
an appid really are played on Steam. Only an explicit False stops the writes.

It governs `hours_played` and `achievements_earned` and nothing else - prices
and the Metacritic score ignore it, since those are facts about the game
rather than about this collection.

Nullable with no backfill: existing rows mean "never asked", which is true.
"""

import sqlalchemy as sa
from alembic import op

revision = "gs1p2r3o4g5"
down_revision = "gm1e2t3a4c5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "games", sa.Column("steam_progress_sync", sa.Boolean(), nullable=True)
    )


def downgrade():
    op.drop_column("games", "steam_progress_sync")
```

- [ ] **Step 4: Add the column everywhere**

`app/models/game.py`, after `all_collected`:

```python
    # Whether Steam may write this entry's progress. Not a completion flag:
    # it is about the source, not about the game. See the migration.
    steam_progress_sync = Column(Boolean, nullable=True)
```

`app/schemas/game.py`, in `GameBase` only (Create/Update/Response inherit it):

```python
    steam_progress_sync: Optional[bool] = None
```

`app/utils/formatter.py`, in `parse_game_from_sheet`:

```python
        "steam_progress_sync": parse_from_sheet(raw.get("steam_progress_sync"), bool),
```

The sheet-write direction needs nothing: `format_model_for_sheet` iterates the model's columns at runtime.

`frontend/src/config/formFactories.js`: `steam_progress_sync: "",`

`frontend/src/config/formFields/fieldMeta.js`:

```js
    // Not a completion flag: it decides whether Steam Fill/Replace may write
    // hours_played and achievements_earned over what is already there.
    steam_progress_sync: {
      label: "Steam Progress Sync",
      control: "select",
      options: TRISTATE,
      coerce: "tristate",
      group: "Status",
    },
```

`frontend/src/lib/payloads.js`: `steam_progress_sync: tri(f.steam_progress_sync),`

`frontend/src/pages/admin/Modify.jsx`: `steam_progress_sync: tri(g.steam_progress_sync),`

`frontend/src/pages/detail/Game.jsx`, a fourth entry in the flags array:

```jsx
                  {
                    label: "Steam Progress Sync",
                    value: yesNo(game.steam_progress_sync),
                  },
```

`frontend/src/pages/add-tabs/GameAddTab.jsx`: add a fourth `<Field>` beside the completion flags and widen the wrapper from `md:grid-cols-3` to `md:grid-cols-4`:

```jsx
        <Field label="Steam Progress Sync" hint="Off: Steam never writes playtime here">
          <select
            className={selectCls}
            value={f.steam_progress_sync}
            onChange={(e) => u("steam_progress_sync", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
```

- [ ] **Step 5: Migrate and verify**

```
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
```

Expected: head is `gs1p2r3o4g5`, single head.

- [ ] **Step 6: Run every gate**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```

- [ ] **Step 7: Commit (ask first)**

```bash
git add alembic/versions/gs1p2r3o4g5_add_game_steam_progress_sync.py app/models/game.py app/schemas/game.py app/utils/formatter.py frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/lib/payloads.test.js frontend/src/pages/add-tabs/GameAddTab.jsx frontend/src/pages/admin/Modify.jsx frontend/src/pages/detail/Game.jsx
git commit -m "feat(game): add the steam_progress_sync lock column"
```

---

### Task 5: The Steam client

**Files:**
- Create: `app/services/integrations/steam.py`
- Modify: `app/config.py:52`, `.env.example:43`
- Test: `tests/unit/test_steam_client.py`

**Interfaces:**
- Produces:
  - `fetch_steam_appdetails(appid: int, cc: str = "us") -> Optional[Dict[str, Any]]`
  - `fetch_owned_games() -> Optional[Dict[int, int]]` — appid → minutes, cached per run
  - `fetch_player_achievements(appid: int) -> Optional[int]` — unlocked count
  - `steam_store_rate_limiter`, `RateLimitExceeded`, `REGIONS`, `EXPECTED_CURRENCY`
  - `reset_owned_games_cache() -> None`

- [ ] **Step 1: Write the failing test**

`tests/unit/test_steam_client.py`:

```python
"""Steam transport: throttling, the two hosts, and how failures degrade."""

import pytest
import requests

from app.services.integrations import steam


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


APPDETAILS = {
    "1245620": {
        "success": True,
        "data": {
            "name": "ELDEN RING",
            "is_free": False,
            "metacritic": {"score": 96},
            "achievements": {"total": 42},
            "price_overview": {"currency": "USD", "initial": 5999, "final": 3599},
        },
    }
}


@pytest.fixture(autouse=True)
def no_throttle_and_no_cache(monkeypatch):
    monkeypatch.setattr(steam.steam_store_rate_limiter, "wait_if_needed", lambda: None)
    steam.reset_owned_games_cache()


class TestAppDetails:
    def test_the_data_block_is_unwrapped_from_the_appid_key(self, monkeypatch):
        monkeypatch.setattr(
            steam.requests, "get", lambda url, **k: FakeResponse(200, APPDETAILS)
        )
        data = steam.fetch_steam_appdetails(1245620)
        assert data["metacritic"]["score"] == 96

    def test_the_region_is_sent_as_cc(self, monkeypatch):
        seen = {}

        def fake_get(url, **kwargs):
            seen.update(kwargs.get("params") or {})
            return FakeResponse(200, APPDETAILS)

        monkeypatch.setattr(steam.requests, "get", fake_get)
        steam.fetch_steam_appdetails(1245620, cc="jp")
        assert seen["cc"] == "jp"

    def test_an_unsuccessful_entry_is_a_none_not_a_crash(self, monkeypatch):
        """A delisted or region-locked app answers success: false."""
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(200, {"1245620": {"success": False}}),
        )
        assert steam.fetch_steam_appdetails(1245620) is None

    def test_a_timeout_is_set_on_every_call(self, monkeypatch):
        seen = {}

        def fake_get(url, **kwargs):
            seen[url] = kwargs.get("timeout")
            return FakeResponse(200, APPDETAILS)

        monkeypatch.setattr(steam.requests, "get", fake_get)
        steam.fetch_steam_appdetails(1245620)
        assert all(t == 15 for t in seen.values())


class TestStoreFailures:
    """Against the private helper, so tenacity's backoff never runs."""

    def test_a_429_raises_so_tenacity_backs_off(self, monkeypatch):
        monkeypatch.setattr(steam.requests, "get", lambda url, **k: FakeResponse(429))
        with pytest.raises(steam.RateLimitExceeded):
            steam._store_request("appdetails", {}, context="test")

    def test_a_500_returns_none_without_retrying(self, monkeypatch):
        monkeypatch.setattr(steam.requests, "get", lambda url, **k: FakeResponse(503))
        assert steam._store_request("appdetails", {}, context="test") is None


class TestWebApi:
    def test_without_credentials_the_progress_calls_are_skipped(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", None)
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")

        def explode(*args, **kwargs):
            raise AssertionError("no HTTP call may go out without credentials")

        monkeypatch.setattr(steam.requests, "get", explode)
        assert steam.fetch_owned_games() is None
        assert steam.fetch_player_achievements(1245620) is None

    def test_owned_games_maps_appid_to_minutes(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(
                200,
                {"response": {"games": [{"appid": 1245620, "playtime_forever": 180}]}},
            ),
        )
        assert steam.fetch_owned_games() == {1245620: 180}

    def test_the_library_is_fetched_once_and_then_cached(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        calls = {"n": 0}

        def fake_get(url, **kwargs):
            calls["n"] += 1
            return FakeResponse(200, {"response": {"games": []}})

        monkeypatch.setattr(steam.requests, "get", fake_get)
        steam.fetch_owned_games()
        steam.fetch_owned_games()
        assert calls["n"] == 1, "a Fill run costs one library call, not one per game"

    def test_a_private_profile_yields_none_rather_than_zero(self, monkeypatch):
        """An empty playerstats block must not read as 'zero achievements'."""
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(200, {"playerstats": {"success": False}}),
        )
        assert steam.fetch_player_achievements(1245620) is None

    def test_unlocked_achievements_are_counted(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(
                200,
                {
                    "playerstats": {
                        "success": True,
                        "achievements": [
                            {"achieved": 1},
                            {"achieved": 0},
                            {"achieved": 1},
                        ],
                    }
                },
            ),
        )
        assert steam.fetch_player_achievements(1245620) == 2


class TestRateLimiter:
    def test_the_window_blocks_the_request_after_the_limit(self):
        limiter = steam.SteamStoreRateLimiter(limits=((2, 300),))
        limiter.request_timestamps = [1000.0, 1001.0]
        # Two in the window already, so a third must wait out the remainder.
        assert limiter._sleep_time(1002.0) > 0

    def test_an_empty_window_never_sleeps(self):
        limiter = steam.SteamStoreRateLimiter(limits=((2, 300),))
        assert limiter._sleep_time(1002.0) == 0
```

- [ ] **Step 2: Run it and watch it fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit/test_steam_client.py -q
```

Expected: `ImportError: cannot import name 'steam'`.

- [ ] **Step 3: Add the settings**

`app/config.py`, in the External metadata APIs block:

```python
    # Steam is two services. The storefront (prices, Metacritic, achievement
    # totals) needs no credential at all; only the personal-progress calls do,
    # and they degrade to a logged no-op when either of these is unset.
    steam_api_key: Optional[str] = None
    steam_id: Optional[str] = None
```

`.env.example`, after the IGDB block:

```
# Steam: game prices (US/JP/TW), Metacritic critic score, achievements.
# The store half needs NO key. These two are only for personal playtime and
# achievements earned: key from steamcommunity.com/dev/apikey, and STEAM_ID is
# your 64-bit id. The profile's game details must be public.
STEAM_API_KEY=
STEAM_ID=
```

- [ ] **Step 4: Write the client**

`app/services/integrations/steam.py`:

```python
"""
steam.py
Handles all HTTP interactions with Steam.

Strictly responsible for fetching raw external JSON. Two things here differ
from every other integration in this package:

1. **It is two services behind one module.** `store.steampowered.com/api` is
   the storefront: no key, no registration, and it carries prices, the
   Metacritic score and the achievement total. `api.steampowered.com` is the
   Web API: it needs a key and a steamid, and it carries this collection's own
   playtime and achievements earned. Either half can work while the other is
   unconfigured, and the storefront half needs no configuration at all.
2. **The storefront is undocumented.** Its ~200 requests per 5 minutes per IP
   is an observed ceiling, not a published one, so the limiter is deliberately
   conservative and the pipeline gets a `budget` - unlike IGDB, a long backfill
   really can run out of window and must stop cleanly rather than block.

`appdetails` returns `metacritic`, `achievements` and `price_overview` in one
response, so the non-price payload rides along with the `cc=us` call and the
other two regions are fetched for their prices alone: three calls per game,
not four.
"""

import logging
import time
from typing import Any, Dict, List, Optional

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings

logger = logging.getLogger(__name__)

STORE_BASE_URL = "https://store.steampowered.com/api"
WEB_API_BASE_URL = "https://api.steampowered.com"

# NOTE: `REGIONS` and `EXPECTED_CURRENCY` live in `app/utils/steam_utils.py`,
# not here. The dependency runs integrations -> utils and never the reverse,
# so that the pure mapping module never drags in requests/tenacity. This
# module does not need them: `fetch_steam_appdetails` takes `cc` as an
# argument, and the currency check belongs to the mapper.

# The library is one response for every game owned, so it is fetched once and
# cached rather than fetched per entry. A typical run therefore costs exactly
# one library request; a run longer than the TTL costs one more and gets
# fresher numbers for it. `reset_owned_games_cache()` is how a pipeline run
# starts clean, which matters in a long-lived uvicorn process where a Replace
# tomorrow must not reuse today's playtime.
OWNED_CACHE_TTL = 300


class SteamStoreRateLimiter:
    """
    Sliding-window throttle for the Steam storefront.

    ~200 requests per 5 minutes per IP, observed rather than documented. Unlike
    IGDB's 4/second this is a window a real backfill can exhaust, which is why
    the game pipeline carries a `budget` that stops the run when it does.
    """

    # (max_requests, time_window_seconds)
    DEFAULT_LIMITS = ((200, 300),)

    def __init__(self, limits=None):
        self.limits = tuple(limits) if limits else self.DEFAULT_LIMITS
        self.max_window = max(window for _, window in self.limits)
        self.request_timestamps: List[float] = []

    def _sleep_time(self, now: float) -> float:
        """Longest wait any window demands before another request may go out."""
        sleep_time = 0.0
        for max_requests, window in self.limits:
            recent = [t for t in self.request_timestamps if now - t < window]
            if len(recent) >= max_requests:
                blocking = recent[len(recent) - max_requests]
                sleep_time = max(sleep_time, window - (now - blocking))
        return sleep_time

    def wait_if_needed(self):
        while True:
            now = time.time()
            self.request_timestamps = [
                t for t in self.request_timestamps if now - t < self.max_window
            ]

            sleep_time = self._sleep_time(now)
            if sleep_time <= 0:
                break

            logger.info(f"Steam Rate Limiter: pausing for {sleep_time:.2f} seconds.")
            time.sleep(sleep_time)

        self.request_timestamps.append(time.time())

    def has_capacity(self) -> bool:
        """The pipeline's `budget`: False once the window is spent."""
        return self._sleep_time(time.time()) <= 0


# Global instance shared across the application
steam_store_rate_limiter = SteamStoreRateLimiter()

# {"games": {appid: minutes}, "fetched_at": float}
_OWNED_CACHE: Dict[str, Any] = {}


class RateLimitExceeded(Exception):
    pass


def reset_owned_games_cache() -> None:
    """Drops the cached library. Called at the start of a pipeline run."""
    _OWNED_CACHE.clear()


def _store_request(path: str, params: Dict[str, Any], context: str) -> Optional[Any]:
    """
    Issues one throttled storefront request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    steam_store_rate_limiter.wait_if_needed()

    try:
        response = requests.get(f"{STORE_BASE_URL}/{path}", params=params, timeout=15)

        if response.status_code == 404:
            logger.warning(f"Steam has no such resource (404) for {context}.")
            return None

        if response.status_code == 429:
            logger.warning(f"Steam rate limit (429) for {context}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                f"Steam server error ({response.status_code}) for {context} — skipping retries."
            )
            return None

        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error(f"Network/Timeout Error connecting to Steam for {context}: {e}")
        raise


def _credentials() -> Optional[tuple]:
    """
    The Web API key and steamid, or None when either is unset. The storefront
    half is unaffected: a missing credential costs only personal progress.
    """
    if not settings.steam_api_key or not settings.steam_id:
        logger.warning(
            "STEAM_API_KEY / STEAM_ID are not both set; Steam playtime and "
            "achievements earned will be skipped."
        )
        return None
    return settings.steam_api_key, settings.steam_id


def _web_request(path: str, params: Dict[str, Any], context: str) -> Optional[Any]:
    """One Web API request. Not throttled: the documented quota is 100k/day."""
    try:
        response = requests.get(f"{WEB_API_BASE_URL}/{path}", params=params, timeout=15)

        if response.status_code in (401, 403):
            logger.warning(
                f"Steam refused the Web API request for {context} "
                f"({response.status_code}) — check the key and that the profile is public."
            )
            return None

        if response.status_code >= 500:
            logger.warning(f"Steam Web API server error for {context}.")
            return None

        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error(f"Network/Timeout Error connecting to the Steam Web API: {e}")
        raise


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_steam_appdetails(appid: int, cc: str = "us") -> Optional[Dict[str, Any]]:
    """
    Fetches one app's storefront record for one country.

    The response is keyed by the appid as a string and carries its own success
    flag; a delisted or region-locked app answers `success: false`, which is an
    ordinary outcome and returns None.
    """
    payload = _store_request(
        "appdetails",
        {"appids": int(appid), "cc": cc, "l": "en"},
        context=f"app {appid} ({cc})",
    )
    if not payload:
        return None

    entry = payload.get(str(appid)) or {}
    if not entry.get("success"):
        logger.info(f"Steam has no storefront record for app {appid} in {cc}.")
        return None

    return entry.get("data")


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
    reraise=False,
)
def fetch_owned_games() -> Optional[Dict[int, int]]:
    """
    Every owned game as {appid: minutes played}, cached for the run.

    One response covers the whole library, so playtime costs one request per
    run rather than one per entry.
    """
    cached = _OWNED_CACHE.get("games")
    if cached is not None and time.time() - _OWNED_CACHE.get("fetched_at", 0) < OWNED_CACHE_TTL:
        return cached

    credentials = _credentials()
    if not credentials:
        return None
    key, steamid = credentials

    payload = _web_request(
        "IPlayerService/GetOwnedGames/v1/",
        {
            "key": key,
            "steamid": steamid,
            "include_played_free_games": 1,
            "format": "json",
        },
        context="owned games",
    )

    games = ((payload or {}).get("response") or {}).get("games")
    if games is None:
        logger.warning(
            "Steam returned no game list — the profile's game details are "
            "probably not public."
        )
        return None

    owned = {
        int(g["appid"]): int(g.get("playtime_forever") or 0)
        for g in games
        if g.get("appid") is not None
    }
    _OWNED_CACHE["games"] = owned
    _OWNED_CACHE["fetched_at"] = time.time()
    return owned


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
    reraise=False,
)
def fetch_player_achievements(appid: int) -> Optional[int]:
    """
    How many of this app's achievements are unlocked, or None when the answer
    is unknowable - no credentials, a private profile, or a game with no
    achievement schema at all. None is not zero, and the caller must not treat
    it as one.
    """
    credentials = _credentials()
    if not credentials:
        return None
    key, steamid = credentials

    payload = _web_request(
        "ISteamUserStats/GetPlayerAchievements/v1/",
        {"key": key, "steamid": steamid, "appid": int(appid), "format": "json"},
        context=f"achievements for app {appid}",
    )

    stats = (payload or {}).get("playerstats") or {}
    if not stats.get("success"):
        return None

    achievements = stats.get("achievements")
    if not achievements:
        return None

    return sum(1 for a in achievements if a.get("achieved"))
```

- [ ] **Step 5: Run it and watch it pass**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit/test_steam_client.py -q
venv/Scripts/ruff.exe check app/services/integrations/steam.py app/config.py tests/unit/test_steam_client.py
```

Expected: 13 passed.

- [ ] **Step 6: Commit (ask first)**

```bash
git add app/services/integrations/steam.py app/config.py .env.example tests/unit/test_steam_client.py
git commit -m "feat(steam): add the storefront and Web API client"
```

---

### Task 6: `map_steam_to_game_data`

**Files:**
- Modify: `app/utils/steam_utils.py`
- Test: `tests/unit/test_steam_utils.py`

**Interfaces:**
- Consumes: `EXPECTED_CURRENCY` from Task 5.
- Produces: `map_steam_to_game_data(payloads: Dict[str, Dict[str, Any]]) -> Dict[str, Any]`, keyed by region code, returning `metacritic_score`, `achievements_total`, `is_free`, and `price_original_{us,jp,tw}` / `price_current_{us,jp,tw}` as `Decimal`.

- [x] **Step 1: Confirm the currency assumption — DONE, no action needed**

Verified against the live storefront (keyless) on 2026-09-06 with app 1245620:
USD `5999` → $59.99, JPY `902000` → ¥9,020, TWD `179000` → NT$1,790.

Two implied decimals in every currency, yen included, so `_price` uses a single divide-by-100 for all three regions. The comment on `PRICE_SCALE` cites these figures.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/test_steam_utils.py`:

```python
from decimal import Decimal

from app.utils.steam_utils import map_steam_to_game_data


def payloads(**overrides):
    """Three regions as fetch_steam_appdetails returns them."""
    base = {
        "us": {
            "is_free": False,
            "metacritic": {"score": 96},
            "achievements": {"total": 42},
            "price_overview": {"currency": "USD", "initial": 5999, "final": 3599},
        },
        "jp": {
            "price_overview": {"currency": "JPY", "initial": 900000, "final": 450000}
        },
        "tw": {
            "price_overview": {"currency": "TWD", "initial": 179000, "final": 89900}
        },
    }
    base.update(overrides)
    return base


class TestPrices:
    def test_two_implied_decimals_are_removed(self):
        mapped = map_steam_to_game_data(payloads())
        assert mapped["price_original_us"] == Decimal("59.99")
        assert mapped["price_current_us"] == Decimal("35.99")

    def test_yen_uses_the_same_divisor(self):
        """Verified against the live storefront: JPY carries the multiplier too."""
        mapped = map_steam_to_game_data(payloads())
        assert mapped["price_original_jp"] == Decimal("9000.00")
        assert mapped["price_current_jp"] == Decimal("4500.00")

    def test_every_region_lands_in_its_own_columns(self):
        mapped = map_steam_to_game_data(payloads())
        assert mapped["price_current_tw"] == Decimal("899.00")

    def test_a_region_answering_in_the_wrong_currency_is_dropped(self):
        """A redirect must not write a US price into the JP column."""
        wrong = {"price_overview": {"currency": "USD", "initial": 5999, "final": 3599}}
        mapped = map_steam_to_game_data(payloads(jp=wrong))
        assert mapped["price_original_jp"] is None
        assert mapped["price_current_jp"] is None
        assert mapped["price_current_us"] == Decimal("35.99")

    def test_a_free_game_has_no_prices_at_all(self):
        free = {"is_free": True, "metacritic": {"score": 80}}
        mapped = map_steam_to_game_data({"us": free})
        assert mapped["is_free"] is True
        assert mapped["price_original_us"] is None
        assert mapped["price_current_us"] is None

    def test_a_missing_region_is_not_an_error(self):
        mapped = map_steam_to_game_data({"us": payloads()["us"]})
        assert mapped["price_current_jp"] is None
        assert mapped["price_current_us"] == Decimal("35.99")


class TestNonPriceFields:
    def test_the_metacritic_critic_score_comes_through(self):
        assert map_steam_to_game_data(payloads())["metacritic_score"] == 96

    def test_the_achievement_total_comes_through(self):
        assert map_steam_to_game_data(payloads())["achievements_total"] == 42

    def test_a_game_with_neither_block_maps_to_none(self):
        mapped = map_steam_to_game_data({"us": {"is_free": False}})
        assert mapped["metacritic_score"] is None
        assert mapped["achievements_total"] is None

    def test_an_empty_payload_set_maps_to_all_none(self):
        mapped = map_steam_to_game_data({})
        assert mapped["metacritic_score"] is None
        assert mapped["price_current_us"] is None
```

- [ ] **Step 3: Run it and watch it fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit/test_steam_utils.py -q
```

Expected: `ImportError: cannot import name 'map_steam_to_game_data'`.

- [ ] **Step 4: Implement**

Append to `app/utils/steam_utils.py`:

```python
from decimal import Decimal
from typing import Any, Dict

from app.services.integrations.steam import EXPECTED_CURRENCY, REGIONS

# Steam returns every price as an integer with two implied decimals, whatever
# the currency: 5,980 yen arrives as 598000. Verified against the live
# storefront for USD, JPY and TWD.
PRICE_SCALE = Decimal(100)


def _price(block: Optional[Dict[str, Any]], key: str, cc: str) -> Optional[Decimal]:
    """
    One price out of a region's price_overview, or None.

    A region answering in the wrong currency has been redirected, and its
    numbers belong to some other storefront - dropped with a warning rather
    than written into this region's column.
    """
    if not block:
        return None

    currency = block.get("currency")
    if currency != EXPECTED_CURRENCY.get(cc):
        logger.warning(
            f"Steam answered {cc} in {currency}, expected "
            f"{EXPECTED_CURRENCY.get(cc)}; dropping that region's prices."
        )
        return None

    value = block.get(key)
    if value is None:
        return None

    return Decimal(int(value)) / PRICE_SCALE


def map_steam_to_game_data(payloads: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Maps the per-region storefront payloads onto the columns Fill writes.

    `payloads` is {country code: the `data` block}, as
    `fetch_steam_appdetails` returns it. A missing region is ordinary - the
    app may not be sold there - and so is a missing `price_overview`, which is
    what a free or unreleased game answers.

    The non-price fields are read from the `us` payload, since `appdetails`
    returns them identically for every region.
    """
    primary = payloads.get("us") or next(iter(payloads.values()), {}) or {}

    metacritic = primary.get("metacritic") or {}
    achievements = primary.get("achievements") or {}

    mapped: Dict[str, Any] = {
        "metacritic_score": metacritic.get("score"),
        "achievements_total": achievements.get("total"),
        "is_free": bool(primary.get("is_free")),
    }

    for cc in REGIONS:
        block = (payloads.get(cc) or {}).get("price_overview")
        mapped[f"price_original_{cc}"] = _price(block, "initial", cc)
        mapped[f"price_current_{cc}"] = _price(block, "final", cc)

    return mapped
```

- [ ] **Step 5: Run it and watch it pass**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/unit -q
venv/Scripts/ruff.exe check app/utils/steam_utils.py tests/unit/test_steam_utils.py
```

- [ ] **Step 6: Commit (ask first)**

```bash
git add app/utils/steam_utils.py tests/unit/test_steam_utils.py
git commit -m "feat(steam): map storefront payloads onto game columns"
```

---

### Task 7: `autofill_game_from_steam`

**Files:**
- Modify: `app/services/domain/autofill.py` (after `autofill_game_from_igdb`)
- Modify: `app/services/domain/checking.py` (beside `has_missing_values_game`)
- Modify: `app/services/domain/__init__.py`
- Test: `tests/api/test_game_steam_autofill.py`

**Interfaces:**
- Consumes: Tasks 4, 5, 6.
- Produces: `autofill_game_from_steam(game: Game, db: Session) -> None`; `has_missing_values_game_steam(entry) -> bool`.

- [ ] **Step 1: Write the failing test**

`tests/api/test_game_steam_autofill.py`:

```python
"""
autofill_game_from_steam: which columns it writes, and the two guards that
stop it overwriting a hand-typed number with a worse one.

The storefront and Web API calls are patched out - these tests lock down
behaviour, not the network layer.
"""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_game_from_steam

MAPPED = {
    "metacritic_score": 96,
    "achievements_total": 42,
    "is_free": False,
    "price_original_us": Decimal("59.99"),
    "price_current_us": Decimal("35.99"),
    "price_original_jp": Decimal("9000.00"),
    "price_current_jp": Decimal("4500.00"),
    "price_original_tw": Decimal("1790.00"),
    "price_current_tw": Decimal("899.00"),
}


def make_game(db_session, **kwargs):
    game = models.Game(
        system_id=str(uuid.uuid4()),
        game_name_en="Test Game",
        playing_status="Might Play",
        **kwargs,
    )
    db_session.add(game)
    db_session.flush()
    return game


@pytest.fixture
def patched(monkeypatch):
    """Storefront answers for all three regions; the library reports 3 hours."""
    calls = {"appdetails": [], "achievements": 0}

    def fake_appdetails(appid, cc="us"):
        calls["appdetails"].append((appid, cc))
        return {"data": "irrelevant, the mapper is patched too"}

    def fake_achievements(appid):
        calls["achievements"] += 1
        return 7

    monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", fake_appdetails)
    monkeypatch.setattr(autofill_module, "map_steam_to_game_data", lambda p: dict(MAPPED))
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {1245620: 180})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", fake_achievements)
    return calls


class TestGating:
    def test_a_game_with_no_appid_makes_no_request_at_all(self, db_session, monkeypatch):
        def explode(*args, **kwargs):
            raise AssertionError("no appid means no Steam call")

        monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", explode)
        game = make_game(db_session)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score is None

    def test_all_three_regions_are_requested(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert [cc for _appid, cc in patched["appdetails"]] == ["us", "jp", "tw"]


class TestFillOnlyColumns:
    def test_the_list_price_is_written_when_empty(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert game.price_original_us == Decimal("59.99")
        assert game.price_original_jp == Decimal("9000.00")

    def test_a_hand_typed_list_price_is_kept(self, db_session, patched):
        game = make_game(
            db_session, steam_appid=1245620, price_original_us=Decimal("49.99")
        )

        autofill_game_from_steam(game, db_session)

        assert game.price_original_us == Decimal("49.99")

    def test_a_hand_typed_achievement_total_is_kept(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, achievements_total=10)

        autofill_game_from_steam(game, db_session)

        assert game.achievements_total == 10


class TestOverwrittenColumns:
    def test_the_current_price_is_rewritten_every_run(self, db_session, patched):
        """This is what Replace is for: a sale moved the number."""
        game = make_game(
            db_session, steam_appid=1245620, price_current_us=Decimal("59.99")
        )

        autofill_game_from_steam(game, db_session)

        assert game.price_current_us == Decimal("35.99")

    def test_the_metacritic_score_is_rewritten(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, metacritic_score=70)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score == 96

    def test_the_metacritic_user_score_is_never_touched(self, db_session, patched):
        """Steam does not publish it; it stays whatever was typed."""
        game = make_game(db_session, steam_appid=1245620, metacritic_user_score=8.4)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_user_score == 8.4


class TestProgressGuards:
    def test_playtime_is_written_in_hours(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 3.0
        assert game.achievements_earned == 7

    def test_playtime_overwrites_a_hand_typed_value(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, hours_played=1.0)

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 3.0

    def test_the_lock_stops_both_progress_writes(self, db_session, patched):
        """Owned on Steam, played on a console: 200 hours must survive."""
        game = make_game(
            db_session,
            steam_appid=1245620,
            hours_played=200.0,
            achievements_earned=30,
            steam_progress_sync=False,
        )

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 200.0
        assert game.achievements_earned == 30

    def test_the_lock_does_not_stop_prices_or_metacritic(self, db_session, patched):
        game = make_game(db_session, steam_appid=1245620, steam_progress_sync=False)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score == 96
        assert game.price_current_us == Decimal("35.99")

    def test_zero_playtime_never_overwrites(self, db_session, monkeypatch, patched):
        """Owned but never launched on Steam. 42 hours were played elsewhere."""
        monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {1245620: 0})
        game = make_game(db_session, steam_appid=1245620, hours_played=42.0)

        autofill_game_from_steam(game, db_session)

        assert game.hours_played == 42.0

    def test_an_unknown_achievement_count_never_overwrites(
        self, db_session, monkeypatch, patched
    ):
        """None is not zero: a private profile must not zero the column."""
        monkeypatch.setattr(
            autofill_module, "fetch_player_achievements", lambda appid: None
        )
        game = make_game(db_session, steam_appid=1245620, achievements_earned=12)

        autofill_game_from_steam(game, db_session)

        assert game.achievements_earned == 12


class TestFailureIsContained:
    def test_a_fetch_error_does_not_propagate(self, db_session, monkeypatch):
        def boom(appid, cc="us"):
            raise RuntimeError("Steam is down")

        monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", boom)
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)  # must not raise

        assert game.metacritic_score is None

    def test_no_storefront_answer_writes_nothing(self, db_session, monkeypatch):
        monkeypatch.setattr(
            autofill_module, "fetch_steam_appdetails", lambda appid, cc="us": None
        )
        game = make_game(db_session, steam_appid=1245620)

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score is None
```

- [ ] **Step 2: Run it and watch it fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_game_steam_autofill.py -q
```

Expected: `ImportError: cannot import name 'autofill_game_from_steam'`.

- [ ] **Step 3: Implement the autofill**

In `app/services/domain/autofill.py`, import at module scope:

```python
from app.services.integrations.steam import (
    REGIONS,
    fetch_owned_games,
    fetch_player_achievements,
    fetch_steam_appdetails,
)
from app.utils.steam_utils import map_steam_to_game_data
```

and add after `autofill_game_from_igdb`:

```python
# Written only when the column is empty.
STEAM_FILL_ONLY_COLUMNS = (
    "price_original_us",
    "price_original_jp",
    "price_original_tw",
    "achievements_total",
)

# Rewritten on every run. These are what the game Replace exists for.
STEAM_OVERWRITE_COLUMNS = (
    "price_current_us",
    "price_current_jp",
    "price_current_tw",
    "metacritic_score",
)


def autofill_game_from_steam(game: Game, db: Session) -> None:
    """
    Enriches a single Game entry with Steam data. Does not commit — the caller
    is responsible.

    Columns only: no tag and no credit, so this never touches the alias layer
    and cannot produce an untranslated term. `metacritic_user_score` is
    deliberately absent — Steam does not publish it.

    Unlike the IGDB half this is not fill-only. The current prices and the
    Metacritic score are rewritten on every run, which is what makes a bulk
    Replace worth having for games.

    The two progress columns pass two guards first. `steam_progress_sync` is
    False for a game owned here but played elsewhere, and stops them outright.
    A zero or unknown value is then skipped even when the lock is open: a game
    owned but never launched on Steam reports 0 minutes, and writing that over
    a hand-typed figure would destroy the only record of it.
    """
    appid = game.steam_appid
    if not appid:
        return

    try:
        payloads = {}
        for cc in REGIONS:
            data = fetch_steam_appdetails(appid, cc=cc)
            if data:
                payloads[cc] = data

        if not payloads:
            return

        s_data = map_steam_to_game_data(payloads)

        for column in STEAM_FILL_ONLY_COLUMNS:
            if getattr(game, column, None) is None and s_data.get(column) is not None:
                setattr(game, column, s_data[column])

        for column in STEAM_OVERWRITE_COLUMNS:
            if s_data.get(column) is not None:
                setattr(game, column, s_data[column])

        if game.steam_progress_sync is False:
            return

        minutes = (fetch_owned_games() or {}).get(appid)
        if minutes:
            game.hours_played = round(minutes / 60, 1)

        earned = fetch_player_achievements(appid)
        if earned:
            game.achievements_earned = earned

    except Exception as e:
        logger.error(f"Steam autofill failed for app {appid}: {e}")
```

- [ ] **Step 4: Implement the eligibility test**

In `app/services/domain/checking.py`, beside `has_missing_values_game`:

```python
def has_missing_values_game_steam(entry) -> bool:
    """
    True when Steam has an appid to work with and has written nothing to this
    entry yet.

    Deliberately not folded into GAME_FIELDS_TO_FILL. A free game has no
    price, an obscure one no Metacritic score, and many have no achievements,
    so testing those columns individually would leave such entries eligible
    for ever. Testing whether Steam has landed *anything* bounds that to the
    genuinely empty case; refreshing what is already there is Replace's job.
    """
    return (
        entry.steam_appid is not None
        and entry.metacritic_score is None
        and entry.price_original_us is None
        and entry.achievements_total is None
    )
```

- [ ] **Step 5: Export**

`app/services/domain/__init__.py`: add `autofill_game_from_steam` and `has_missing_values_game_steam` to the imports and `__all__`.

- [ ] **Step 6: Run it and watch it pass**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_game_steam_autofill.py -q
venv/Scripts/ruff.exe check .
```

Expected: 17 passed.

- [ ] **Step 7: Commit (ask first)**

```bash
git add app/services/domain/autofill.py app/services/domain/checking.py app/services/domain/__init__.py tests/api/test_game_steam_autofill.py
git commit -m "feat(steam): write prices, Metacritic and progress onto games"
```

---

### Task 8: Pipeline wiring and the first game Replace

**Files:**
- Modify: `app/services/domain/post_processing.py`
- Modify: `app/services/pipelines/specs.py:229-239`
- Modify: `app/services/pipelines/replace.py:42`
- Modify: `app/services/domain/__init__.py`
- Test: `tests/api/test_game_steam_replace.py`

**Interfaces:**
- Consumes: Task 7.
- Produces: `apply_single_replace_game(db, game, bulk=False) -> None`; `execute_replace_game`; routes `POST /api/data-control/replace/game` and `/replace/game/{entry_id}`.

> **Do not skip `replace.py`.** `data_control.py` resolves `execute_replace_game` with `getattr` at import time as soon as `replace_select` is not None. Without that line the application fails to start — every test fails, not just this task's.

- [ ] **Step 1: Write the failing test**

`tests/api/test_game_steam_replace.py`:

```python
"""The game pipeline's first bulk Replace: what it selects and what it re-runs."""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.post_processing import apply_single_replace_game
from app.services.pipelines.specs import PIPELINES


def make_game(db_session, **kwargs):
    game = models.Game(
        system_id=str(uuid.uuid4()),
        game_name_en="Test Game",
        playing_status="Might Play",
        **kwargs,
    )
    db_session.add(game)
    db_session.flush()
    return game


@pytest.fixture
def patched(monkeypatch):
    monkeypatch.setattr(
        autofill_module, "fetch_steam_appdetails", lambda appid, cc="us": {"d": 1}
    )
    monkeypatch.setattr(
        autofill_module,
        "map_steam_to_game_data",
        lambda p: {
            "metacritic_score": 96,
            "achievements_total": None,
            "is_free": False,
            "price_original_us": None,
            "price_current_us": Decimal("35.99"),
            "price_original_jp": None,
            "price_current_jp": None,
            "price_original_tw": None,
            "price_current_tw": None,
        },
    )
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", lambda appid: None)


class TestSelection:
    def test_only_games_carrying_a_steam_id_are_selected(self, db_session):
        linked = make_game(db_session, steam_appid=1245620)
        by_link = make_game(
            db_session, steam_link="https://store.steampowered.com/app/570/"
        )
        make_game(db_session, igdb_id=119133)  # IGDB only: not Steam's business

        selected = PIPELINES["game"].replace_select(db_session)
        ids = {g.system_id for g in selected}

        assert linked.system_id in ids
        assert by_link.system_id in ids
        assert len(ids) == 2

    def test_the_pipeline_now_advertises_a_bulk_replace(self):
        assert PIPELINES["game"].replace_select is not None
        assert PIPELINES["game"].replace is not None


class TestSingleReplace:
    def test_it_refreshes_the_volatile_columns(self, db_session, patched):
        game = make_game(
            db_session,
            steam_appid=1245620,
            metacritic_score=70,
            price_current_us=Decimal("59.99"),
        )

        apply_single_replace_game(db_session, game)

        assert game.metacritic_score == 96
        assert game.price_current_us == Decimal("35.99")

    def test_it_derives_the_appid_from_a_link_first(self, db_session, patched):
        """A pasted link is enough; Replace does not need the id typed in."""
        game = make_game(
            db_session, steam_link="https://store.steampowered.com/app/1245620/"
        )

        apply_single_replace_game(db_session, game)

        assert game.steam_appid == 1245620
        assert game.metacritic_score == 96


class TestRoutes:
    def test_the_bulk_route_exists(self, admin_client):
        """It must not 404 - the route is registered from the spec."""
        response = admin_client.post("/api/data-control/replace/game")
        assert response.status_code != 404
```

- [ ] **Step 2: Run it and watch it fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_game_steam_replace.py -q
```

Expected: `ImportError: cannot import name 'apply_single_replace_game'`.

- [ ] **Step 3: Add the single-replace hook**

`app/services/domain/post_processing.py`, beside the other `apply_single_replace_*`:

```python
def apply_single_replace_game(db: Session, game: Game, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Game entry.

    Steam only. IGDB carries nothing that drifts - its half of the game Fill is
    fill-only throughout - so re-fetching it would rewrite exactly what Fill
    already wrote. `bulk` is accepted for signature parity with the other
    media types.
    """
    apply_extract_steam_appid(game)
    autofill_game_from_steam(game, db)
```

with `apply_extract_steam_appid` and `autofill_game_from_steam` imported at the top of the module in the existing style.

- [ ] **Step 4: Add the bulk executor**

`app/services/pipelines/replace.py`, beside `execute_replace_single_game`:

```python
execute_replace_game = _bulk("game")
```

- [ ] **Step 5: Wire the spec**

`app/services/pipelines/specs.py` — add the pause constant beside the others, and a named fill function. A tuple-returning lambda would work here, since the runner ignores the return value, but it reads as a value when it is really two side effects in order:

```python
STEAM_PAUSE = 0.5


def _fill_game(db, entry) -> None:
    """Both of game's sources, in order: IGDB supplies the appid that Steam
    then keys off, so a brand-new entry is complete after one pass."""
    autofill_game_from_igdb(entry, db)
    autofill_game_from_steam(entry, db)


def _start_game_run(db) -> None:
    """
    Drops the cached Steam library so a run reads today's playtime.

    The cache exists so one run costs one library request instead of one per
    game. In a long-lived uvicorn process it would otherwise outlive the run
    that filled it, and a Replace started tomorrow would write yesterday's
    hours.
    """
    reset_owned_games_cache()
```

`_start_game_run` must run at the start of both the Fill and the Replace, before any entry is processed — import `reset_owned_games_cache` from `app.services.integrations.steam`. `PipelineSpec` has `fill_after` / `replace_after` hooks but no "before" hook, so wire it whichever way the runner actually supports: if there is no pre-run hook, call `reset_owned_games_cache()` as the first statement of `apply_single_replace_game` and `_fill_game` guarded so it fires once per run, or add a pre-run hook to `PipelineSpec`. Read `app/services/pipelines/runner.py` and choose; say which you chose and why in the report.

and replace the game spec's Fill gate and Replace block:

```python
    "game": PipelineSpec(
        key="game", label="Game", model=Game,
        extract_id=apply_extract_game_ids,
        # Two sources with independent gates. IGDB's half is fill-only and
        # stops when its columns are full; Steam's runs while it has written
        # nothing at all. Each autofill re-checks its own id, so an entry
        # admitted by one clause never issues the other's requests.
        fill_eligible=lambda db, e: (
            (e.igdb_id is not None and has_missing_values_game(e))
            or has_missing_values_game_steam(e)
        ),
        fill=_fill_game,
        # IGDB paces at 4/second; the Steam storefront's window is far
        # tighter, so it sets the pace of a game run.
        fill_sleep=STEAM_PAUSE,
        fill_after=(("Syncing system options...", run_sync_game),),
        # ~200 requests/5 minutes: stop when the window is gone rather than
        # block, the same bargain Comic Vine makes with its hourly quota.
        budget=steam_store_rate_limiter.has_capacity,
        # Game's first Replace. Steam only - the current prices and the
        # Metacritic score drift, and nothing in an IGDB record does.
        replace_select=_linked(Game, Game.steam_appid, Game.steam_link),
        replace=lambda db, e, bulk: apply_single_replace_game(db, e, bulk=bulk),
        replace_sleep=STEAM_PAUSE,
        replace_after=(("Syncing system options...", run_sync_game),),
        single_after=(run_sync_game,),
    ),
```

Note `in_replace_all` is now left at its default `True`, so game joins Replace All. Update the imports at the top of `specs.py`: `apply_extract_game_ids`, `autofill_game_from_steam`, `has_missing_values_game_steam`, `apply_single_replace_game`, and `steam_store_rate_limiter`.

- [ ] **Step 6: Run it and watch it pass**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_game_steam_replace.py -q
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api -q
venv/Scripts/ruff.exe check .
```

Expected: this task's tests pass; `tests/api/test_external_api_catalog.py::test_comic_and_game_have_no_bulk_replace` now **fails**, which is Task 9's job. Do not patch it here.

- [ ] **Step 7: Commit (ask first)**

```bash
git add app/services/domain/post_processing.py app/services/domain/__init__.py app/services/pipelines/specs.py app/services/pipelines/replace.py tests/api/test_game_steam_replace.py
git commit -m "feat(game): merge Steam into Fill and add the first game Replace"
```

---

### Task 9: The catalog and its drift guards

**Files:**
- Modify: `app/services/integrations/catalog.py`
- Modify: `tests/api/test_external_api_catalog.py:103-108,132-140`
- Modify: `tests/api/test_pipeline_runner.py` — `test_replace_all_skips_comic_and_studio` and `test_game_fills_from_igdb_but_never_bulk_replaces`

**Interfaces:**
- Consumes: Task 8's spec changes (`has_bulk_replace` is derived from them).

**Three drift guards fail after Task 8, not one.** All three assert the old truth "game has no bulk Replace", which Task 8 deliberately makes false. Update all three; do not weaken the code to satisfy them:

| Test | File | Why it fails |
|---|---|---|
| `test_comic_and_game_have_no_bulk_replace` | `test_external_api_catalog.py` | asserts `has_bulk_replace is False` for game |
| `test_replace_all_skips_comic_and_studio` | `test_pipeline_runner.py` | game now joins `REPLACE_ALL` |
| `test_game_fills_from_igdb_but_never_bulk_replaces` | `test_pipeline_runner.py` | its whole premise is now false |

The second and third need renaming as well as rewriting — a test called `..._never_bulk_replaces` that asserts the opposite is worse than no test. Rename to state the new truth, and keep whatever each still usefully guards (Comic and Studio are still excluded from Replace All; game still fills from IGDB).

- [ ] **Step 1: Update the guards to the new truth**

These are intentional drift guards, not breakage. In `tests/api/test_external_api_catalog.py`:

```python
def test_comic_has_no_bulk_replace():
    """Game gained one with the Steam source; Comic still has none."""
    by_key = {e["key"]: e for e in catalog_payload()["media"]}
    assert by_key["comic"]["has_bulk_replace"] is False
    assert by_key["game"]["has_bulk_replace"] is True
    assert by_key["studio"]["fill_only"] is True
    assert by_key["comic"]["in_fill_all"] is False


def test_only_volatile_numbers_are_ever_overwritten():
    """
    The overwrite set is small on purpose: a rating, a rank, a live price and
    this collection's own progress. Everything else is fill-only, so nothing a
    person typed is ever rewritten by a pipeline.
    """
    overwritten = {
        write.field
        for coverage in EXTERNAL_APIS
        for _b, write in _writes(coverage)
        if write.rule == "overwrite"
    }
    assert overwritten == {
        "mal_rating",
        "mal_rank",
        "imdb_rating",
        "metacritic_score",
        "price_current_us",
        "price_current_jp",
        "price_current_tw",
        "hours_played",
        "achievements_earned",
    }
```

- [ ] **Step 2: Run and watch them fail**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_external_api_catalog.py -q
```

Expected: both fail — `has_bulk_replace` is already True from Task 8, but the overwrite set does not yet contain the Steam fields because the catalog has no Steam block.

- [ ] **Step 3: Register the service**

`app/services/integrations/catalog.py`, in `SERVICES`:

```python
    "steam": Service(
        key="steam",
        label="Steam",
        module="app.services.integrations.steam",
        base_url="https://store.steampowered.com/api (+ api.steampowered.com)",
        auth=(
            "none for the storefront; STEAM_API_KEY + STEAM_ID for playtime "
            "and achievements earned"
        ),
        rate_limit="~200 requests / 5 minutes per IP, observed not documented",
        docs_anchor="steam",
    ),
```

`Service` takes exactly these seven fields (`catalog.py:85-94`): `key`, `label`, `module`, `base_url`, `auth`, `rate_limit`, `docs_anchor`. Add the entry after `"igdb"`, which is currently last in the dict.

- [ ] **Step 4: Make game's coverage merged**

Change `combination="single"` to `"merged"`, update `requests_per_entry` and `note`, and add the second `SourceBlock` after the IGDB one:

```python
        requests_per_entry=(
            "6 - the IGDB game and its time-to-beat, three Steam storefronts, "
            "and one achievement call; the Steam library is fetched once a run"
        ),
        note=(
            "Two sources keyed on different columns: IGDB on igdb_id, Steam on "
            "steam_appid, which IGDB itself supplies. The tag writes go "
            "through the alias layer: IGDB speaks English and the vocabulary "
            "is Chinese, and a term with no alias row is logged and skipped, "
            "never stored raw - see the Alias Conversion page. Steam writes "
            "columns only and never touches that layer."
        ),
```

**The Steam pair belongs to IGDB, not to Steam.** `autofill_game_from_steam` only *reads* `steam_appid` as its key; the columns are written by `autofill_game_from_igdb` from IGDB's `external_games`. So add these two to the **IGDB** `SourceBlock`, not the Steam one:

```python
                    Write(
                        "steam_appid",
                        "column",
                        "fill-only",
                        "IGDB's external_games carries the Steam appid, which is "
                        "what the whole Steam source keys off; adopted together "
                        "with the link and only when the entry has neither, so a "
                        "hand-typed link is never paired with IGDB's appid for "
                        "some other edition",
                    ),
                    Write("steam_link", "column", "fill-only"),
```

Then the Steam block itself:

```python
            SourceBlock(
                source="steam",
                writes=(
                    Write(
                        "metacritic_score",
                        "column",
                        "overwrite",
                        "the critic metascore; Steam does not publish the user "
                        "score, so metacritic_user_score stays hand-typed",
                    ),
                    Write(
                        "price_original_us",
                        "column",
                        "fill-only",
                        "the undiscounted list price, not the launch price - a "
                        "permanent price cut is not chased",
                    ),
                    Write("price_original_jp", "column", "fill-only"),
                    Write("price_original_tw", "column", "fill-only"),
                    Write(
                        "price_current_us",
                        "column",
                        "overwrite",
                        "what it costs today; this is what a game Replace is for",
                    ),
                    Write("price_current_jp", "column", "overwrite"),
                    Write("price_current_tw", "column", "overwrite"),
                    Write("achievements_total", "column", "fill-only"),
                    Write(
                        "hours_played",
                        "column",
                        "overwrite",
                        "from the Steam library, in hours; skipped entirely when "
                        "steam_progress_sync is false, and a zero never "
                        "overwrites a hand-typed figure",
                    ),
                    Write(
                        "achievements_earned",
                        "column",
                        "overwrite",
                        "same two guards as hours_played; an unknown count is "
                        "not a zero",
                    ),
                    Write(
                        "metacritic_user_score",
                        "none",
                        "never",
                        "Steam does not publish it",
                    ),
                    Write(
                        "genres",
                        "none",
                        "never",
                        "IGDB already owns the game vocabulary through the "
                        "alias layer; a second one would fight it",
                    ),
                ),
            ),
```

- [ ] **Step 5: Run it and watch it pass**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest tests/api/test_external_api_catalog.py -q
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```

Expected: the whole backend suite is green.

- [ ] **Step 6: Commit (ask first)**

```bash
git add app/services/integrations/catalog.py tests/api/test_external_api_catalog.py
git commit -m "feat(catalog): record Steam as game's second source"
```

---

### Task 10: The Replace button

**Files:**
- Modify: `frontend/src/pages/admin/Admin.jsx:2026-2037`

The list is hardcoded and not driven by the API, so the button does not appear on its own.

- [ ] **Step 1: Add the entry**

```jsx
  { label: "Novel", url: "/api/data-control/replace/novel" },
  // Game replaces against Steam only: the live prices, the Metacritic score
  // and this collection's own playtime. IGDB carries nothing that drifts.
  { label: "Game", url: "/api/data-control/replace/game" },
```

- [ ] **Step 2: Verify in the running app**

```
cd frontend && npm run lint && npm run test:run && npm run build
```

Then start the app and confirm at `/system` that **Replace → Game** appears and streams to completion. Both ports: :5173 is the dev server, :8000 serves the build you just made.

- [ ] **Step 3: Commit (ask first)**

```bash
git add frontend/src/pages/admin/Admin.jsx
git commit -m "feat(system): add the Game Replace action"
```

---

### Task 11: Documentation

**Files:**
- Modify: `docs/external-apis.md`, `docs/data-model.md`, `docs/entry-types.md`, `docs/business-rules.md`, `docs/data-actions.md`, `docs/PROGRESS.md`

- [ ] **Step 1: `docs/external-apis.md`**

- Opening paragraph: eight services becomes nine; Steam fills games alongside IGDB.
- The services table: a Steam row (base URL, `settings.steam_api_key` / `steam_id`, `app/services/integrations/steam.py`, `app/utils/steam_utils.py`, `games`).
- A new Steam section in the house style of the IGDB one at line 273: endpoints, the two hosts, the three-calls-per-game arithmetic, the one-library-call-per-run point, the currency scaling, the mapping table, and the two progress guards.
- **Correct the "exactly three are overwritten" claim** in the opening — it is now nine fields.
- The pipelines table at line 443: game gains a Replace, a `budget`, and `STEAM_PAUSE`.
- Line 453's "IGDB company enrichment is not built" note stays true and stays.

- [ ] **Step 2: The rest**

- `docs/data-model.md`: `steam_progress_sync`; the Steam columns are no longer hand-only.
- `docs/entry-types.md`: game's sources.
- `docs/business-rules.md` §5: the `store.steampowered.com/app/<id>` ID-from-link rule.
- `docs/data-actions.md`: game appears under Replace and Replace All.
- Bump every touched file's `Last verified` line to 2026-09-06.

- [ ] **Step 3: `docs/PROGRESS.md`**

- Add this plan's table with each task's status.
- Mark the existing open item "Steam Web API playtime sync | `steam_appid`/`steam_link` reserved" as done, since this plan is what it was waiting for.
- Add `anime_site_test_steam` to the droppable test dbs row.
- Update the Dev db row to `gs1p2r3o4g5`.
- Record the `external_games` probe's answer, and whether `STEAM_API_KEY` / `STEAM_ID` are still unset (the progress columns stay null until they are).

- [ ] **Step 4: Final gate**

```
POSTGRES_DB=anime_site_test_steam venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```

- [ ] **Step 5: Commit (ask first)**

```bash
git add docs/external-apis.md docs/data-model.md docs/entry-types.md docs/business-rules.md docs/data-actions.md docs/PROGRESS.md
git commit -m "docs: record the Steam integration"
```

---

## Verification checklist

Before calling this done, with real credentials in `.env`:

1. `alembic upgrade head` → `gs1p2r3o4g5`, single head.
2. A game with an IGDB link only: Fill writes `steam_appid`, `steam_link`, prices, Metacritic and the achievement total in one pass.
3. A console-only game: Fill leaves every Steam column null and logs no error.
4. A free game: prices stay null, Metacritic still lands.
5. Set `steam_progress_sync` to No on a cross-platform game, hand-type `hours_played`, run Replace → the figure survives.
6. Replace Game refreshes `price_current_*` after a sale.
7. Backup writes the new column to the Game tab; Pull All reads it back.
