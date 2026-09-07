# IGDB Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill game metadata from IGDB — names, summary, release date, cover, genres/themes/modes, developer and publisher credits, time-to-beat, and `parent_game` → `base_game_id` for DLC — replacing the deliberate no-op stub the games backend shipped.

**Architecture:** A synchronous `requests` client in the house style (`tenacity` retry, module-level rate limiter, per-status ladder), with one thing no existing integration has: a **refreshed OAuth bearer token** from Twitch client credentials rather than a static key. Mapping lives in `app/utils/igdb_utils.py`, the write in `app/services/domain/autofill.py`, and the loop in the existing pipeline runner.

**Tech Stack:** Python 3.13, `requests`, `tenacity`, pytest with `monkeypatch`-ed HTTP.

**Spec:** `docs/superpowers/specs/2026-09-06-games-media-type-design.md` — Decisions D, F, G, L.

**Depends on:** `2026-09-06-games-backend.md` (the `games` table, the stub `PIPELINES["game"]`, `system_option_alias` and the seeded vocabulary) and `2026-09-06-publisher-entity.md` (the `publisher` credit role).

## Global Constraints

- **Own test database.** `CREATE DATABASE anime_site_test_<suffix>`, prefix every pytest run with `POSTGRES_DB=anime_site_test_<suffix>`, drop it when done.
- **Never `git add -A`, never stage a directory pathspec.**
- **TDD**, and **no live HTTP in tests, ever.** Patch `requests.get`/`requests.post` on the client module's own `requests` attribute, and patch the rate limiter's `wait_if_needed` to a no-op so tests never sleep.
- **`@lru_cache` on `get_settings()`** means monkeypatching env vars after import does not re-read them. Set credentials by patching `app.config.settings` attributes directly in tests.
- **Fill is fill-only.** Nothing already set by the user is overwritten — including `game_name_en`, which is often a deliberate shorthand and is never touched.
- **Failures are swallowed and logged**, never raised: `fill` runs inside the pipeline loop, and one bad entry must not end a run.
- **Two facts to verify against live IGDB documentation before writing code**, rather than trusting this plan: the exact time-to-beat endpoint name (it has been renamed between API versions) and whether its values are seconds or hours. Task 3 has an explicit verification step.
- Lint with `venv/Scripts/ruff.exe check .` before each commit.

---

### Task 1: Settings

**Files:**
- Modify: `app/config.py`, `.env.example`
- Test: `tests/unit/test_igdb_settings.py` (create)

**Interfaces:**
- Produces: `settings.igdb_client_id`, `settings.igdb_client_secret`, both `Optional[str] = None`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_igdb_settings.py
"""IGDB credentials are optional, like every other API key."""

from pathlib import Path

from app.config import Settings


def test_credentials_default_to_none():
    """
    An unset key degrades to a logged no-op rather than a boot failure -
    validate_production() deliberately does not check API keys.
    """
    settings = Settings(_env_file=None)
    assert settings.igdb_client_id is None
    assert settings.igdb_client_secret is None


def test_env_example_documents_both():
    text = Path(".env.example").read_text(encoding="utf-8")
    assert "IGDB_CLIENT_ID=" in text
    assert "IGDB_CLIENT_SECRET=" in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_igdb_settings.py -v`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'igdb_client_id'`

- [ ] **Step 3: Implement**

In `app/config.py`, after `comicvine_api_key`:

```python
    # IGDB needs two: a Twitch client id and secret, exchanged for a bearer
    # token that expires. Every other integration here uses a static key.
    igdb_client_id: Optional[str] = None
    igdb_client_secret: Optional[str] = None
```

In `.env.example`, in the External metadata APIs block:

```
# IGDB: game metadata, cover, genres, companies, time-to-beat.
# Free: register an application at dev.twitch.tv/console/apps - IGDB
# authenticates with Twitch client credentials, not an IGDB-specific key.
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_igdb_settings.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/config.py .env.example tests/unit/test_igdb_settings.py && git commit -m "feat(igdb): client id and secret settings"
```

---

### Task 2: The IGDB client

**Files:**
- Create: `app/services/integrations/igdb.py`
- Test: `tests/unit/test_igdb_client.py` (create)

**Interfaces:**
- Produces: `igdb_rate_limiter`, `RateLimitExceeded`, `fetch_igdb_game(igdb_id: int) -> Optional[dict]`, `search_igdb_games(query: str, limit: int = 10) -> list[dict]`, `_get_token() -> Optional[str]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_igdb_client.py
"""
The IGDB client: OAuth token caching, failure classification, throttling.

requests is patched throughout - the suite makes no live calls.
"""

import time

import pytest
import requests

from app.services.integrations import igdb


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


GAME = {
    "id": 1029,
    "name": "Elden Ring",
    "first_release_date": 1645747200,
    "genres": [{"name": "Role-playing (RPG)"}],
}


@pytest.fixture(autouse=True)
def credentials(monkeypatch):
    monkeypatch.setattr(igdb.settings, "igdb_client_id", "cid")
    monkeypatch.setattr(igdb.settings, "igdb_client_secret", "secret")
    monkeypatch.setattr(igdb.igdb_rate_limiter, "wait_if_needed", lambda: None)
    igdb._TOKEN_CACHE.clear()


@pytest.fixture
def transport(monkeypatch):
    """Records every POST, serving a token for Twitch and data for IGDB."""
    calls = {"token": 0, "data": []}

    def fake_post(url, **kwargs):
        if "id.twitch.tv" in url:
            calls["token"] += 1
            return FakeResponse(200, {"access_token": "tok", "expires_in": 3600})
        calls["data"].append((url, kwargs.get("data"), kwargs.get("headers")))
        return FakeResponse(200, [GAME])

    monkeypatch.setattr(igdb.requests, "post", fake_post)
    return calls


class TestToken:
    def test_the_token_is_fetched_once_and_reused(self, transport):
        igdb.fetch_igdb_game(1029)
        igdb.fetch_igdb_game(1029)
        assert transport["token"] == 1

    def test_an_expired_token_is_refetched(self, transport, monkeypatch):
        igdb.fetch_igdb_game(1029)
        igdb._TOKEN_CACHE["expires_at"] = time.time() - 1
        igdb.fetch_igdb_game(1029)
        assert transport["token"] == 2

    def test_both_credentials_travel_on_every_data_request(self, transport):
        igdb.fetch_igdb_game(1029)
        _url, _body, headers = transport["data"][0]
        assert headers["Client-ID"] == "cid"
        assert headers["Authorization"] == "Bearer tok"

    def test_missing_credentials_degrade_to_none_without_calling_out(
        self, monkeypatch
    ):
        monkeypatch.setattr(igdb.settings, "igdb_client_id", None)

        def explode(*a, **k):
            raise AssertionError("must not call out without credentials")

        monkeypatch.setattr(igdb.requests, "post", explode)
        assert igdb.fetch_igdb_game(1029) is None


class TestFetch:
    def test_returns_the_first_result(self, transport):
        assert igdb.fetch_igdb_game(1029)["name"] == "Elden Ring"

    def test_a_missing_id_returns_none_without_a_request(self, transport):
        assert igdb.fetch_igdb_game(None) is None
        assert transport["data"] == []

    def test_an_empty_result_list_is_none(self, monkeypatch, transport):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(200, []),
        )
        assert igdb.fetch_igdb_game(1029) is None

    def test_a_429_raises_so_tenacity_backs_off(self, monkeypatch):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(429),
        )
        with pytest.raises(igdb.RateLimitExceeded):
            igdb._request("games", "fields name;", context="test")

    def test_a_500_returns_none_without_retrying(self, monkeypatch):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(503),
        )
        assert igdb._request("games", "fields name;", context="test") is None

    def test_a_timeout_is_set_on_every_call(self, monkeypatch):
        seen = {}

        def fake_post(url, **kwargs):
            seen[url] = kwargs.get("timeout")
            if "twitch" in url:
                return FakeResponse(200, {"access_token": "t", "expires_in": 99})
            return FakeResponse(200, [GAME])

        monkeypatch.setattr(igdb.requests, "post", fake_post)
        igdb.fetch_igdb_game(1029)
        assert all(t == 15 for t in seen.values())


class TestSearch:
    def test_an_empty_query_returns_an_empty_list(self, transport):
        assert igdb.search_igdb_games("   ") == []
        assert transport["data"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_igdb_client.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.integrations.igdb`

- [ ] **Step 3: Implement**

Create `app/services/integrations/igdb.py` following the Comic Vine / Tenrai house rules — `requests`, `timeout=15`, a local `RateLimitExceeded`, a module-level limiter singleton, `@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=10), retry=(retry_if_exception_type(requests.exceptions.RequestException) | retry_if_exception_type(RateLimitExceeded)), reraise=False)`, and a per-status ladder (401 → log + `None`; 404 → log + `None`; 429 → raise; `>= 500` → log + `None` with no retry).

Three things differ from the existing clients and deserve comments in the module docstring:

1. **IGDB queries are POSTs with an APIcalypse body**, not GETs with query params.
2. **Auth is a refreshed OAuth bearer token**, not a static key. Cache it in a module-level `_TOKEN_CACHE = {}` holding `token` and `expires_at`, refresh when within ~60 s of expiry, and fail closed to `None` when either credential is unset.
3. **The rate limit is 4 requests/second**, which is Tenrai's shape rather than Comic Vine's hourly quota — so use a sliding-window limiter like `TenraiRateLimiter` and do **not** give the pipeline spec a `budget`.

`fetch_igdb_game` requests exactly the fields the mapper reads (`name`, `summary`, `first_release_date`, `cover.url`, `genres.name`, `themes.name`, `game_modes.name`, `involved_companies.company.name`, `involved_companies.developer`, `involved_companies.publisher`, `parent_game`, `url`), and returns the first result or `None`.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_igdb_client.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/integrations/igdb.py tests/unit/test_igdb_client.py && git commit -m "feat(igdb): API client with Twitch OAuth token caching"
```

---

### Task 3: Time-to-beat, and the mapper

**Files:**
- Create: `app/utils/igdb_utils.py`
- Modify: `app/services/integrations/igdb.py`
- Test: `tests/unit/test_igdb_utils.py` (create)

**Interfaces:**
- Produces: `map_igdb_to_game_data(raw: dict) -> dict`, `extract_igdb_id(url: str) -> Optional[int]`, `fetch_igdb_time_to_beat(igdb_id: int) -> Optional[dict]`.

- [ ] **Step 1: Verify the time-to-beat endpoint against live documentation**

Before writing code, check the current IGDB API reference for the time-to-beat resource: its **endpoint name** (it has been renamed between API versions) and whether `hastily` / `normally` / `completely` are **seconds or hours**. Record what you find in the module docstring with the date you checked. Do not carry this plan's assumption into the code unverified — a units mistake here silently stores 162000 in `hltb_main`.

- [ ] **Step 2: Write the failing test**

```python
# tests/unit/test_igdb_utils.py
"""Mapping IGDB's payload onto game columns."""

from app.utils.igdb_utils import extract_igdb_id, map_igdb_to_game_data

RAW = {
    "id": 1029,
    "name": "Elden Ring",
    "summary": "A vast world.",
    # 2022-02-25 UTC
    "first_release_date": 1645747200,
    "url": "https://www.igdb.com/games/elden-ring",
    "cover": {"url": "//images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg"},
    "genres": [{"name": "Role-playing (RPG)"}],
    "themes": [{"name": "Fantasy"}, {"name": "Open world"}],
    "game_modes": [{"name": "Single player"}, {"name": "Multiplayer"}],
    "involved_companies": [
        {"company": {"name": "FromSoftware"}, "developer": True, "publisher": False},
        {"company": {"name": "Bandai Namco"}, "developer": False, "publisher": True},
        {"company": {"name": "A Porter"}, "developer": False, "publisher": False},
    ],
    "parent_game": 1029,
}


def test_release_date_is_a_truncated_iso_day():
    assert map_igdb_to_game_data(RAW)["release_date"] == "2022-02-25"


def test_cover_url_is_upgraded_from_thumb_and_given_a_scheme():
    url = map_igdb_to_game_data(RAW)["cover_image_url"]
    assert url.startswith("https://")
    assert "t_thumb" not in url


def test_developers_and_publishers_are_separated():
    mapped = map_igdb_to_game_data(RAW)
    assert mapped["developers"] == ["FromSoftware"]
    assert mapped["publishers"] == ["Bandai Namco"]


def test_a_company_that_is_neither_is_dropped():
    """porting and supporting companies are not credits we keep."""
    assert "A Porter" not in map_igdb_to_game_data(RAW)["developers"]


def test_vocabularies_come_through_as_raw_english_for_the_alias_layer():
    mapped = map_igdb_to_game_data(RAW)
    assert mapped["genres"] == ["Role-playing (RPG)"]
    assert mapped["themes"] == ["Fantasy", "Open world"]
    assert mapped["game_modes"] == ["Single player", "Multiplayer"]


def test_parent_game_is_carried_for_dlc_resolution():
    assert map_igdb_to_game_data(RAW)["parent_igdb_id"] == 1029


def test_missing_keys_map_to_none_and_empty_lists():
    mapped = map_igdb_to_game_data({"id": 5, "name": "Bare"})
    assert mapped["release_date"] is None
    assert mapped["cover_image_url"] is None
    assert mapped["developers"] == []
    assert mapped["genres"] == []


def test_extract_igdb_id_from_a_slug_url():
    assert extract_igdb_id("https://www.igdb.com/games/elden-ring") is None, (
        "a slug URL carries no numeric id"
    )
    assert extract_igdb_id("https://api.igdb.com/v4/games/1029") == 1029
    assert extract_igdb_id(None) is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_igdb_utils.py -v`
Expected: FAIL — `ModuleNotFoundError: app.utils.igdb_utils`

- [ ] **Step 4: Implement**

Create `app/utils/igdb_utils.py` with `map_igdb_to_game_data` returning a plain dict: `release_date` (Unix seconds → truncated ISO day via `app/utils/release_date`), `summary`, `cover_image_url` (IGDB returns a protocol-relative `//` URL sized `t_thumb`; prepend `https:` and swap the size segment for a large one), `developers`/`publishers` (partitioned on the two booleans, dropping companies that are neither), `genres`/`themes`/`game_modes` as **raw English** — translation is the alias layer's job, not the mapper's — and `parent_igdb_id`. Add `extract_igdb_id(url)` beside the other id extractors.

Add `fetch_igdb_time_to_beat(igdb_id)` to the client, using the endpoint and units confirmed in Step 1, returning a dict keyed `hltb_main` / `hltb_main_extra` / `hltb_completionist` in **hours**.

- [ ] **Step 5: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_igdb_utils.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/utils/igdb_utils.py app/services/integrations/igdb.py tests/unit/test_igdb_utils.py && git commit -m "feat(igdb): payload mapper and time-to-beat"
```

---

### Task 4: The autofill write

**Files:**
- Modify: `app/services/domain/autofill.py`, `app/services/domain/checking.py`, `app/utils/utils.py`, `app/services/domain/derivation.py`
- Test: `tests/api/test_game_autofill.py` (create)

**Interfaces:**
- Produces: `autofill_game_from_igdb(game, db) -> None`, `has_missing_values_game(game) -> bool`, `apply_extract_igdb_id(game) -> bool`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_game_autofill.py
"""
autofill_game_from_igdb: fill-only semantics, alias translation, DLC parenting.

The IGDB fetch and the cover download are both patched out - these tests lock
down behaviour, not the network layer.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_game_from_igdb
from app.services.domain.credits import credit_names, tag_values
from app.utils.game_vocabulary import seed_game_vocabulary

MAPPED = {
    "summary": "A vast world.",
    "release_date": "2022-02-25",
    "cover_image_url": "https://images.igdb.com/big.jpg",
    "developers": ["FromSoftware"],
    "publishers": ["Bandai Namco"],
    "genres": ["Role-playing (RPG)"],
    "themes": ["Fantasy"],
    "game_modes": ["Single player"],
    "parent_igdb_id": None,
}


@pytest.fixture(autouse=True)
def vocabulary(db_session):
    seed_game_vocabulary(db_session)
    db_session.flush()


@pytest.fixture
def patched(monkeypatch):
    calls = {"download": []}
    monkeypatch.setattr(
        autofill_module, "fetch_igdb_game", lambda igdb_id: {"id": igdb_id}
    )
    monkeypatch.setattr(autofill_module, "map_igdb_to_game_data", lambda raw: dict(MAPPED))
    monkeypatch.setattr(
        autofill_module,
        "fetch_igdb_time_to_beat",
        lambda igdb_id: {"hltb_main": 55.0, "hltb_main_extra": 100.0, "hltb_completionist": 133.0},
    )
    monkeypatch.setattr(
        autofill_module,
        "download_cover_image",
        lambda url, sid: calls["download"].append(url) or "stored.jpg",
    )
    return calls


def make_game(db_session, **kwargs):
    defaults = dict(system_id=uuid.uuid4(), game_name_en="Elden Ring", igdb_id=1029)
    defaults.update(kwargs)
    game = models.Game(**defaults)
    db_session.add(game)
    db_session.flush()
    return game


def test_fills_every_blank_column(db_session, patched):
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert game.release_date == "2022-02-25"
    assert game.hltb_main == 55.0
    assert game.cover_image_file == "stored.jpg"


def test_does_not_overwrite_what_the_user_typed(db_session, patched):
    game = make_game(db_session, release_date="2022", hltb_main=40.0)
    autofill_game_from_igdb(game, db_session)
    assert game.release_date == "2022"
    assert game.hltb_main == 40.0


def test_never_touches_the_english_name(db_session, patched):
    game = make_game(db_session, game_name_en="ER (shorthand)")
    autofill_game_from_igdb(game, db_session)
    assert game.game_name_en == "ER (shorthand)"


def test_igdb_english_is_translated_through_the_alias_table(db_session, patched):
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert tag_values(db_session, "game", game.system_id, "game_genre") == ["角色扮演"]
    assert tag_values(db_session, "game", game.system_id, "game_theme") == ["奇幻"]


def test_an_unmatched_igdb_value_is_skipped_not_stored_raw(db_session, patched, caplog):
    """A new IGDB genre must surface as a gap to fill, never as English data."""
    patched_map = dict(MAPPED, genres=["Roguelite"])
    import app.services.domain.autofill as m

    m.map_igdb_to_game_data = lambda raw: dict(patched_map)
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert tag_values(db_session, "game", game.system_id, "game_genre") == []
    assert "Roguelite" in caplog.text


def test_developer_becomes_a_studio_and_publisher_a_publisher(db_session, patched):
    game = make_game(db_session)
    autofill_game_from_igdb(game, db_session)
    assert credit_names(db_session, "game", game.system_id, "studio") == ["FromSoftware"]
    assert credit_names(db_session, "game", game.system_id, "publisher") == ["Bandai Namco"]


def test_a_dlc_is_linked_to_a_base_game_already_in_the_database(db_session, patched):
    base = make_game(db_session, game_name_en="Elden Ring", igdb_id=1029)
    import app.services.domain.autofill as m

    m.map_igdb_to_game_data = lambda raw: dict(MAPPED, parent_igdb_id=1029)
    dlc = make_game(db_session, game_name_en="Shadow of the Erdtree", igdb_id=2000, game_type="DLC")
    autofill_game_from_igdb(dlc, db_session)
    assert dlc.base_game_id == base.system_id


def test_an_unknown_parent_leaves_base_game_id_null(db_session, patched):
    import app.services.domain.autofill as m

    m.map_igdb_to_game_data = lambda raw: dict(MAPPED, parent_igdb_id=999999)
    dlc = make_game(db_session, igdb_id=2000, game_type="DLC")
    autofill_game_from_igdb(dlc, db_session)
    assert dlc.base_game_id is None


def test_does_nothing_without_an_igdb_id(db_session, patched):
    game = make_game(db_session, igdb_id=None)
    autofill_game_from_igdb(game, db_session)
    assert game.release_date is None


def test_swallows_fetch_errors_so_one_bad_entry_cannot_abort_a_run(
    db_session, monkeypatch, patched
):
    def boom(_id):
        raise RuntimeError("IGDB is down")

    monkeypatch.setattr(autofill_module, "fetch_igdb_game", boom)
    autofill_game_from_igdb(make_game(db_session), db_session)  # must not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_autofill.py -v`
Expected: FAIL — `ImportError: cannot import name 'autofill_game_from_igdb'`

- [ ] **Step 3: Implement**

Add `autofill_game_from_igdb(game, db)` to `app/services/domain/autofill.py`, modelled on `autofill_comic_from_comicvine`: fetch, map, write each blank column only, then credits, then tags, then the cover last (so a download failure cannot cost the cheap columns), all inside one `try` that logs and swallows.

Two game-specific pieces:

```python
        # IGDB speaks English; the vocabulary is Chinese. An unmatched value is
        # LOGGED, never stored raw and never dropped silently - a new IGDB
        # genre should surface as a gap to fill in the Options admin page.
        for field, category, values in (
            ("game_genre", "Game Genre", g_data.get("genres")),
            ("game_theme", "Game Theme", g_data.get("themes")),
            ("game_mode", "Game Mode", g_data.get("game_modes")),
        ):
            if tag_values(db, "game", game.system_id, field):
                continue
            resolved = []
            for english in values or []:
                option = resolve_option_alias(db, category, "igdb", english)
                if option is None:
                    logger.warning(
                        "IGDB %s '%s' has no alias row; skipped for game %s",
                        category, english, game.system_id,
                    )
                    continue
                resolved.append(option.value)
            if resolved:
                replace_tags(db, "game", game.system_id, field, resolved)
```

```python
        # parent_game is why IGDB was chosen over RAWG: it resolves the DLC
        # link automatically. A parent not yet in the database leaves the
        # column null - the user can fill it in later, which is exactly why
        # base_game_id is nullable for a DLC.
        parent_igdb_id = g_data.get("parent_igdb_id")
        if game.base_game_id is None and parent_igdb_id:
            parent = (
                db.query(Game)
                .filter(Game.igdb_id == parent_igdb_id, Game.system_id != game.system_id)
                .first()
            )
            if parent is not None:
                game.base_game_id = parent.system_id
```

Add `has_missing_values_game(game)` to `app/services/domain/checking.py` with `GAME_FIELDS_TO_FILL` in `app/utils/utils.py`, and `apply_extract_igdb_id(game)` to `app/services/domain/derivation.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_autofill.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/domain/autofill.py app/services/domain/checking.py app/services/domain/derivation.py app/utils/utils.py tests/api/test_game_autofill.py && git commit -m "feat(igdb): fill-only autofill with alias translation and DLC parenting"
```

---

### Task 5: Replace the stub pipeline spec

**Files:**
- Modify: `app/services/pipelines/specs.py`
- Test: `tests/api/test_pipeline_runner.py`, `tests/api/test_game_fill_gate.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_game_fill_gate.py
"""Which games Fill picks up."""

import uuid

from app import models
from app.services.pipelines.specs import PIPELINES


def eligible(db, game):
    return PIPELINES["game"].fill_eligible(db, game)


def test_a_game_with_no_igdb_id_is_skipped(db_session):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Manual")
    assert eligible(db_session, game) is False


def test_a_fully_filled_game_is_skipped(db_session):
    game = models.Game(
        system_id=uuid.uuid4(),
        game_name_en="Done",
        igdb_id=1,
        igdb_link="https://igdb/1",
        release_date="2022-02-25",
        cover_image_file="x.jpg",
        hltb_main=55.0,
        hltb_main_extra=100.0,
        hltb_completionist=133.0,
    )
    assert eligible(db_session, game) is False


def test_a_linked_game_missing_a_column_is_eligible(db_session):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Partial", igdb_id=1)
    assert eligible(db_session, game) is True
```

Update the stub assertion in `tests/api/test_pipeline_runner.py` — `spec.fill_eligible(None, None) is False` no longer holds — replacing it with the real-spec expectations (`in_fill_all` is `True`, `fill_sleep` is set).

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_fill_gate.py -v`
Expected: FAIL — the stub returns `False` for everything

- [ ] **Step 3: Implement**

Replace the stub in `app/services/pipelines/specs.py`:

```python
    "game": PipelineSpec(
        key="game", label="Game", model=Game,
        extract_id=apply_extract_igdb_id,
        fill_eligible=lambda db, e: e.igdb_id is not None and has_missing_values_game(e),
        fill=lambda db, e: autofill_game_from_igdb(e, db),
        # 4 requests/second. A sliding-window limiter inside the client already
        # enforces it, so this is the polite spacing, not the guard - and there
        # is no `budget`: unlike Comic Vine's 200/hour there is no quota to
        # exhaust mid-run.
        fill_sleep=IGDB_PAUSE,
        fill_after=(("Syncing system options...", run_sync_game),),
        # No bulk Replace: an IGDB record carries no score or rank that drifts,
        # so a re-fetch would only rewrite what Fill already wrote - the same
        # reasoning as Studio's fill_only.
        replace_select=None,
        replace=None,
        single_after=(run_sync_game,),
        in_replace_all=False,
    ),
```

with `IGDB_PAUSE = 0.25` beside the other pause constants, and `run_sync_game` in `app/services/calculation.py` if the other types have one.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_fill_gate.py tests/api/test_pipeline_runner.py tests/api/test_data_control_routes.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/pipelines/specs.py tests/api/test_game_fill_gate.py tests/api/test_pipeline_runner.py && git commit -m "feat(igdb): real Fill pipeline for games"
```

---

### Task 6: The admin search endpoint and form autofill

**Files:**
- Modify: `app/routers/game.py`, `frontend/src/pages/add-tabs/GameAddTab.jsx`, `frontend/src/pages/admin/Add.jsx`, `frontend/src/api/endpoints.js`
- Test: `tests/api/test_game_search_igdb.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_game_search_igdb.py
"""The admin's IGDB picker, so an entry can be linked before Fill runs."""

from app.routers import game as game_router


def test_search_requires_admin(client):
    assert client.get("/api/game/search-igdb?q=elden").status_code == 401


def test_search_returns_the_client_results(admin_client, monkeypatch):
    monkeypatch.setattr(
        game_router, "search_igdb_games", lambda q, limit: [{"id": 1029, "name": "Elden Ring"}]
    )
    body = admin_client.get("/api/game/search-igdb?q=elden").json()
    assert body[0]["name"] == "Elden Ring"


def test_an_empty_query_is_a_422(admin_client):
    assert admin_client.get("/api/game/search-igdb?q=").status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_search_igdb.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Implement**

`app/routers/game.py` gains a literal route, declared **before** the factory routes are merged in — the factory registers `GET /{system_id}`, which would otherwise swallow the literal path. This is exactly the shape `app/routers/comic.py` uses:

```python
router = APIRouter(tags=["Game"])


@router.get("/api/game/search-igdb")
def search_igdb(
    q: str = Query(..., min_length=1, description="Game name to search for"),
    limit: int = Query(10, ge=1, le=50),
    admin: dict = Depends(get_current_admin),
) -> List[Dict[str, Any]]:
    return search_igdb_games(q, limit)


router.include_router(make_media_router(MEDIA_REGISTRY["game"]))
```

Frontend: add `searchIgdb` to the game endpoints, and give `GameAddTab.jsx` the autofill search box the comic tab has — a debounced query, a result dropdown, and an `applyGameAutofill` handler in `Add.jsx` that sets `igdb_link`/`igdb_id` and any blank names.

- [ ] **Step 4: Run tests and build**

```bash
POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_game_search_igdb.py -v
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/routers/game.py frontend/src/pages/add-tabs/GameAddTab.jsx frontend/src/pages/admin/Add.jsx frontend/src/api/endpoints.js tests/api/test_game_search_igdb.py && git commit -m "feat(igdb): admin search endpoint and form autofill"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/external-apis.md`, `docs/data-actions.md`, `docs/setup-local.md`, `docs/deployment-gcp.md`, `docs/roadmap.md`

- [ ] **Step 1: Update the docs**

Bump every `Last verified` line.

- `external-apis.md` — IGDB: what it fills, the Twitch OAuth flow and why it differs from every other client here, the 4/sec limit, the verified time-to-beat endpoint and units, and the explicit note that **HowLongToBeat has no official API** and is not called.
- `data-actions.md` — Fill Game; no bulk Replace and why; the alias translation step and the logged-gap behaviour.
- `setup-local.md`, `deployment-gcp.md` — `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET`, and that they come from a Twitch developer application.
- `roadmap.md` — a Done row; keep the Steam sync, Steam Storefront and IGDB company enrichment rows in Deferred.

- [ ] **Step 2: Verify everything**

```bash
POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add docs/external-apis.md docs/data-actions.md docs/setup-local.md docs/deployment-gcp.md docs/roadmap.md && git commit -m "docs(igdb): record the IGDB integration"
```

---

## Done when

- `pytest`, `ruff`, `vitest` and `eslint` are green, and `npm run build` has run.
- No test makes a live HTTP call.
- Fill Game populates a linked game's blank columns, translates IGDB English to the Chinese vocabulary, credits the developer as a Studio and the publisher as a Publisher, downloads the cover, and links a DLC to a base game already present.
- An unmatched IGDB vocabulary value is logged and skipped — never stored as English.
- A missing or invalid credential degrades to a logged no-op, never a 500 or a boot failure.
