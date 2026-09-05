# Novel Open Library Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give novels that have no MyAnimeList link a working Fill, sourced from Open Library, writing `release_date`, the cover image and the `author` credit.

**Architecture:** A new keyless Open Library client (`app/services/integrations/openlibrary.py`) and mapper (`app/utils/openlibrary_utils.py`) built to the same shape as the existing Comic Vine client. Two new columns on `novel` hold a pasted Open Library **work** URL and the id extracted from it. `PIPELINES["novel"]` gains per-entry routing: an entry with a `mal_link` fills from Tenrai exactly as today; an entry without one but with an `openlibrary_id` fills from Open Library. The two sources never both run on one entry.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy, Alembic, `requests`, `tenacity`, pytest. Frontend: React + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-novel-openlibrary-fill-design.md` — read it before starting. It carries the live-API probe findings that justify several otherwise-arbitrary-looking decisions (year precision, the `-1` cover sentinel, conditional fetching).

## Global Constraints

- **Concurrent sessions.** Other Claude Code sessions may be editing this same working tree on this same branch. Never run `git checkout --`, `git restore`, `git stash` or `git reset`. Never use `git add -A` or `git commit -a`. Stage only the exact files listed in each task's `git add`. Before each commit, re-read the diff of those files and confirm every hunk belongs to this feature. If a file holds changes you did not make, stop and report rather than committing the mix.
- **Alembic single head.** Run `alembic heads` before writing the migration. At planning time the head was `st1a2g3s4`; if it has moved, use the current head as `down_revision`. There must be exactly one head after your revision.
- **All writes are fill-only.** No task may overwrite a value the admin already set. This is the entire safety story of the feature.
- **Never write `end_date`, `vol_total_original`, `ch_total`, `serialization_status`, `mal_rating`, `mal_rank`, or any `novel_name_*` column** from Open Library. One entry can span several books (Mistborn is one entry, three novels); the stored id names only the anchor book, which cannot know these. See Decision A in the spec.
- **`release_date` is written at year precision** as a bare 4-digit string (`"2006"`), always through `app.utils.release_date.normalize`. The `ck_novel_release_date_iso` constraint (`^\d{4}(-\d{2}(-\d{2})?)?$`) accepts it.
- **No live network calls in the test suite.** Patch `requests.get` or the fetch function.
- **Media-type key is `"novel"`** (hyphenated data-layer form) wherever `credit_names` / `replace_credits` / `_link_missing` take a media type.
- **Green gates:** `venv/Scripts/python.exe -m pytest -q`, `venv/Scripts/ruff.exe check .`, and for frontend tasks `cd frontend && npm run test:run && npm run lint`.
- **After any frontend change run `cd frontend && npm run build`** before calling it done, or the change works on :5173 but not :8000.

## Task dependency map

```
Task 1 (columns + migration + sheets)
   ├── Task 2 (id extraction)      ─┐
   ├── Task 5 (autofill)  ← needs 3, 4
   └── Task 8 (frontend)
Task 3 (client)   ─ independent ─┐
Task 4 (mapper)   ─ independent ─┴── Task 5 → Task 6 (fill gate) → Task 7 (pipeline) → Task 9 (docs)
```

Tasks 2, 3 and 4 have no dependency on each other and can be dispatched in parallel once Task 1 is committed. Task 3 and Task 4 do not even need Task 1.

---

### Task 1: Novel columns, migration, schema and Sheets round-trip

**Files:**
- Modify: `app/models/novel.py:93-95` (the `mal_id` / `mal_link` / `anilist_link` block)
- Create: `alembic/versions/ol1b2k3s4_add_openlibrary_to_novel.py`
- Modify: `app/schemas/novel.py:87-89`
- Modify: `app/utils/formatter.py:645` (`parse_novel_from_sheet`)
- Test: `tests/unit/test_novel_openlibrary_columns.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `Novel.openlibrary_link: Optional[str]`, `Novel.openlibrary_id: Optional[str]` (both nullable `String`); the same two names as optional fields on `NovelBase`; the same two keys returned by `parse_novel_from_sheet`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_novel_openlibrary_columns.py`:

```python
"""
The two Open Library columns on novel, and their Sheets round-trip.

openlibrary_id is a String, not an Integer like comicvine_id: the trailing
letter is what distinguishes a work (OL...W) from an edition (OL...M) or an
author (OL...A), so the digits alone would lose the only signal that the id
names the right kind of thing.
"""

import uuid

from app import models
from app.schemas.novel import NovelCreate
from app.utils.formatter import parse_novel_from_sheet


class TestNovelOpenLibraryColumns:
    def test_model_accepts_both_columns(self, db_session):
        novel = models.Novel(
            system_id=uuid.uuid4(),
            novel_name_en="The Final Empire",
            openlibrary_link="https://openlibrary.org/works/OL5738148W/The_Final_Empire",
            openlibrary_id="OL5738148W",
        )
        db_session.add(novel)
        db_session.flush()
        assert novel.openlibrary_id == "OL5738148W"

    def test_columns_default_to_none(self, db_session):
        novel = models.Novel(system_id=uuid.uuid4(), novel_name_en="Untitled")
        db_session.add(novel)
        db_session.flush()
        assert novel.openlibrary_link is None
        assert novel.openlibrary_id is None

    def test_schema_accepts_both_columns(self):
        payload = NovelCreate(
            novel_name_en="The Final Empire",
            openlibrary_link="https://openlibrary.org/works/OL5738148W",
            openlibrary_id="OL5738148W",
        )
        assert payload.openlibrary_id == "OL5738148W"

    def test_schema_defaults_both_to_none(self):
        payload = NovelCreate(novel_name_en="Untitled")
        assert payload.openlibrary_link is None
        assert payload.openlibrary_id is None


class TestParseNovelFromSheet:
    def test_reads_both_columns_from_a_sheet_row(self):
        parsed = parse_novel_from_sheet(
            {
                "novel_name_en": "The Final Empire",
                "openlibrary_link": "https://openlibrary.org/works/OL5738148W",
                "openlibrary_id": "OL5738148W",
            }
        )
        assert parsed["openlibrary_link"] == "https://openlibrary.org/works/OL5738148W"
        assert parsed["openlibrary_id"] == "OL5738148W"

    def test_blank_cells_become_none(self):
        parsed = parse_novel_from_sheet(
            {"novel_name_en": "Untitled", "openlibrary_link": "", "openlibrary_id": ""}
        )
        assert parsed["openlibrary_link"] is None
        assert parsed["openlibrary_id"] is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_novel_openlibrary_columns.py -v`
Expected: FAIL — `TypeError: 'openlibrary_link' is an invalid keyword argument for Novel`.

- [ ] **Step 3: Add the model columns**

In `app/models/novel.py`, immediately after the `anilist_link` line:

```python
    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)
    # An Open Library *work* URL and the OL...W id derived from it. String, not
    # Integer like comicvine_id: the trailing W is what separates a work from an
    # edition (OL...M) or an author (OL...A).
    openlibrary_link = Column(String, nullable=True)
    openlibrary_id = Column(String, nullable=True)
```

- [ ] **Step 4: Confirm the current Alembic head, then write the migration**

Run: `venv/Scripts/python.exe -m alembic heads`
Expected at planning time: `st1a2g3s4 (head)`. Use whatever it actually prints as `down_revision`.

Create `alembic/versions/ol1b2k3s4_add_openlibrary_to_novel.py`:

```python
"""add openlibrary link and id to novel

Revision ID: ol1b2k3s4
Revises: st1a2g3s4
"""

import sqlalchemy as sa
from alembic import op

revision = "ol1b2k3s4"
down_revision = "st1a2g3s4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("novel", sa.Column("openlibrary_link", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("openlibrary_id", sa.String(), nullable=True))


def downgrade():
    op.drop_column("novel", "openlibrary_id")
    op.drop_column("novel", "openlibrary_link")
```

- [ ] **Step 5: Add the schema fields**

In `app/schemas/novel.py`, in `NovelBase`, right after `anilist_link`:

```python
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None
    openlibrary_link: Optional[str] = None
    openlibrary_id: Optional[str] = None
```

- [ ] **Step 6: Add the Sheets parse keys**

In `app/utils/formatter.py`, inside `parse_novel_from_sheet`, beside the other link keys:

```python
        "openlibrary_link": parse_from_sheet(raw.get("openlibrary_link"), str),
        "openlibrary_id": parse_from_sheet(raw.get("openlibrary_id"), str),
```

Neither is a date column, so the `USER_ENTERED` apostrophe rule does not apply and `release_date.DATE_COLUMNS` needs no change. Backup needs no change either — `format_model_for_sheet` derives its columns from the model.

- [ ] **Step 7: Apply the migration and run the tests**

Run:
```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m alembic heads
venv/Scripts/python.exe -m pytest tests/unit/test_novel_openlibrary_columns.py -v
```
Expected: `alembic heads` prints exactly one head (`ol1b2k3s4`); all six tests PASS.

- [ ] **Step 8: Run the full gate**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add app/models/novel.py app/schemas/novel.py app/utils/formatter.py alembic/versions/ol1b2k3s4_add_openlibrary_to_novel.py tests/unit/test_novel_openlibrary_columns.py
git commit -m "feat(novel): openlibrary_link and openlibrary_id columns"
```

---

### Task 2: Work-id extraction from a pasted URL

**Files:**
- Create: `app/utils/openlibrary_utils.py`
- Modify: `app/services/domain/derivation.py` (after `apply_extract_mal_id_manga_novel`, line 58-64)
- Modify: `app/services/domain/__init__.py` (export the two new appliers)
- Test: `tests/unit/test_openlibrary_utils.py`

**Interfaces:**
- Consumes: `Novel.openlibrary_link` / `Novel.openlibrary_id` from Task 1.
- Produces:
  - `extract_openlibrary_id(url: Optional[str]) -> Optional[str]`
  - `apply_extract_openlibrary_id(entry) -> bool`
  - `apply_extract_novel_ids(entry) -> bool` — the single callable `PipelineSpec.extract_id` will use in Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_openlibrary_utils.py`:

```python
"""
Open Library work-id extraction.

A wrong id is worse than no id, so anything that is not a *work* URL returns
None rather than a best guess: an edition URL (OL...M), an author URL (OL...A)
and a bare id all fail closed. This mirrors extract_comicvine_id, which rejects
4000- issue URLs instead of storing them.
"""

import types

from app.services.domain import apply_extract_novel_ids, apply_extract_openlibrary_id
from app.utils.openlibrary_utils import extract_openlibrary_id


def make_novel(**kwargs):
    defaults = dict(
        openlibrary_id=None,
        openlibrary_link="https://openlibrary.org/works/OL5738148W/The_Final_Empire",
        mal_id=None,
        mal_link=None,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


class TestExtractOpenlibraryId:
    def test_extracts_from_a_work_url_with_a_slug(self):
        assert (
            extract_openlibrary_id(
                "https://openlibrary.org/works/OL5738148W/The_Final_Empire"
            )
            == "OL5738148W"
        )

    def test_extracts_from_a_bare_work_url(self):
        assert extract_openlibrary_id("https://openlibrary.org/works/OL468431W") == "OL468431W"

    def test_rejects_an_edition_url(self):
        assert extract_openlibrary_id("https://openlibrary.org/books/OL7353617M") is None

    def test_rejects_an_author_url(self):
        assert extract_openlibrary_id("https://openlibrary.org/authors/OL1394865A") is None

    def test_rejects_a_bare_id(self):
        assert extract_openlibrary_id("OL5738148W") is None

    def test_rejects_empty_and_none(self):
        assert extract_openlibrary_id("") is None
        assert extract_openlibrary_id(None) is None


class TestApplyExtractOpenlibraryId:
    def test_writes_the_id_parsed_from_the_link(self):
        novel = make_novel()
        assert apply_extract_openlibrary_id(novel) is True
        assert novel.openlibrary_id == "OL5738148W"

    def test_returns_false_when_the_link_is_missing(self):
        novel = make_novel(openlibrary_link=None)
        assert apply_extract_openlibrary_id(novel) is False
        assert novel.openlibrary_id is None

    def test_does_not_clobber_an_existing_id_when_the_link_is_unparseable(self):
        novel = make_novel(openlibrary_id="OL5738148W", openlibrary_link="not a url")
        assert apply_extract_openlibrary_id(novel) is False
        assert novel.openlibrary_id == "OL5738148W"


class TestApplyExtractNovelIds:
    def test_runs_both_extractors_when_both_links_are_present(self):
        novel = make_novel(mal_link="https://myanimelist.net/manga/23390/")
        assert apply_extract_novel_ids(novel) is True
        assert novel.mal_id == 23390
        assert novel.openlibrary_id == "OL5738148W"

    def test_extracts_open_library_even_when_mal_is_absent(self):
        novel = make_novel(mal_link=None)
        assert apply_extract_novel_ids(novel) is True
        assert novel.openlibrary_id == "OL5738148W"

    def test_extracts_mal_even_when_open_library_is_absent(self):
        novel = make_novel(
            openlibrary_link=None, mal_link="https://myanimelist.net/manga/23390/"
        )
        assert apply_extract_novel_ids(novel) is True
        assert novel.mal_id == 23390

    def test_returns_false_when_neither_link_is_present(self):
        novel = make_novel(openlibrary_link=None, mal_link=None)
        assert apply_extract_novel_ids(novel) is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_openlibrary_utils.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.openlibrary_utils'`.

- [ ] **Step 3: Create the utils module**

Create `app/utils/openlibrary_utils.py`:

```python
"""
openlibrary_utils.py
Pure transformations of Open Library JSON into the shapes the novel autofill
writes. No HTTP here — the client lives in
app/services/integrations/openlibrary.py.
"""

import re
from typing import Optional

# Only a *work* URL. An edition (/books/OL...M) or an author (/authors/OL...A)
# names the wrong kind of thing, and a wrong id is worse than no id.
OPENLIBRARY_WORK_ID_PATTERN = re.compile(r"openlibrary\.org/works/(OL\d+W)")


def extract_openlibrary_id(url: Optional[str]) -> Optional[str]:
    """
    Extracts the OL...W work id from an Open Library work URL.
    Returns None if the URL is empty, malformed, or points at a non-work resource.
    """
    if not url:
        return None
    match = OPENLIBRARY_WORK_ID_PATTERN.search(url)
    if match:
        return match.group(1)
    return None
```

- [ ] **Step 4: Add the appliers**

In `app/services/domain/derivation.py`, add the `extract_openlibrary_id` import beside the existing extractor imports, then add both functions after `apply_extract_mal_id_manga_novel`:

```python
def apply_extract_openlibrary_id(entry: Novel) -> bool:
    """Extracts the Open Library work ID from openlibrary_link and writes it to
    openlibrary_id. Returns True if set. An unparseable link leaves any existing
    ID untouched — the ID is the fill pipeline's only handle on the entry."""
    work_id = extract_openlibrary_id(entry.openlibrary_link)
    if work_id:
        entry.openlibrary_id = work_id
        return True
    return False


def apply_extract_novel_ids(entry: Novel) -> bool:
    """Novel is the one media type with two possible sources, so both extractors
    run on every entry. Both are called before the `or`, deliberately: a novel
    can carry a MAL link and an Open Library link at once, and short-circuiting
    would silently skip the second."""
    mal_found = apply_extract_mal_id_manga_novel(entry)
    openlibrary_found = apply_extract_openlibrary_id(entry)
    return mal_found or openlibrary_found
```

- [ ] **Step 5: Export them**

In `app/services/domain/__init__.py`, add `apply_extract_openlibrary_id` and `apply_extract_novel_ids` to the `from app.services.domain.derivation import (...)` block and to `__all__`, beside the existing `apply_extract_mal_id_manga_novel` entries.

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_openlibrary_utils.py -v`
Expected: all 13 tests PASS.

- [ ] **Step 7: Run the full gate**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add app/utils/openlibrary_utils.py app/services/domain/derivation.py app/services/domain/__init__.py tests/unit/test_openlibrary_utils.py
git commit -m "feat(novel): extract Open Library work id from a pasted link"
```

---

### Task 3: Open Library HTTP client

**Files:**
- Create: `app/services/integrations/openlibrary.py`
- Modify: `app/services/integrations/__init__.py` (export `fetch_openlibrary_work`, following how `fetch_comicvine_volume` is exported)
- Test: `tests/unit/test_openlibrary_client.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `fetch_openlibrary_work(work_id: str, *, want_editions: bool = True, want_authors: bool = True) -> Optional[dict]` returning `{"work": dict, "editions": list[dict], "authors": list[dict]}`, or `None`.
  - `openlibrary_rate_limiter` (module-level `OpenLibraryRateLimiter`)
  - `RateLimitExceeded` (module-local exception class)

**Why the keyword flags:** every other client in this repo fetches unconditionally. This one does not, because `editions.json?limit=1000` returns up to a thousand entries (Gatsby really does), and fill-only writes mean an entry that already has a `release_date` can never use that response. See Decision E in the spec — do not "simplify" it away.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_openlibrary_client.py`:

```python
"""
The Open Library client: conditional fetching, and the failure classification
shared with the other metadata clients.

requests.get is patched throughout — the suite makes no live calls.
"""

import pytest
import requests

from app.services.integrations import openlibrary as ol


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code}")


WORK = {
    "title": "The Final Empire",
    "covers": [14658160],
    "authors": [{"author": {"key": "/authors/OL1394865A"}}],
}
EDITIONS = {"entries": [{"publish_date": "2006"}, {"publish_date": "July 2015"}]}
AUTHOR = {"name": "Brandon Sanderson"}


@pytest.fixture
def router(monkeypatch):
    """Serves canned payloads by URL and records every path requested."""
    calls = []

    def fake_get(url, headers=None, timeout=None, **kwargs):
        calls.append(url)
        if "/editions.json" in url:
            return FakeResponse(200, EDITIONS)
        if "/authors/" in url:
            return FakeResponse(200, AUTHOR)
        return FakeResponse(200, WORK)

    monkeypatch.setattr(ol.requests, "get", fake_get)
    monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
    return calls


class TestFetchOpenlibraryWork:
    def test_returns_work_editions_and_authors(self, router):
        result = ol.fetch_openlibrary_work("OL5738148W")
        assert result["work"]["title"] == "The Final Empire"
        assert len(result["editions"]) == 2
        assert result["authors"] == [AUTHOR]

    def test_sends_an_identifying_user_agent(self, monkeypatch):
        seen = {}

        def fake_get(url, headers=None, timeout=None, **kwargs):
            seen["headers"] = headers
            seen["timeout"] = timeout
            return FakeResponse(200, WORK)

        monkeypatch.setattr(ol.requests, "get", fake_get)
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        ol.fetch_openlibrary_work("OL5738148W", want_editions=False, want_authors=False)
        assert seen["headers"]["User-Agent"] == ol.OPENLIBRARY_USER_AGENT
        assert seen["timeout"] == 15

    def test_skips_the_editions_call_when_not_wanted(self, router):
        ol.fetch_openlibrary_work("OL5738148W", want_editions=False)
        assert not any("/editions.json" in url for url in router)

    def test_skips_the_author_calls_when_not_wanted(self, router):
        ol.fetch_openlibrary_work("OL5738148W", want_authors=False)
        assert not any("/authors/" in url for url in router)

    def test_makes_exactly_one_call_when_neither_is_wanted(self, router):
        ol.fetch_openlibrary_work("OL5738148W", want_editions=False, want_authors=False)
        assert len(router) == 1

    def test_returns_none_for_a_falsy_work_id(self, router):
        assert ol.fetch_openlibrary_work("") is None
        assert router == []

    def test_returns_none_when_the_work_is_404(self, monkeypatch):
        monkeypatch.setattr(
            ol.requests, "get", lambda *a, **k: FakeResponse(404, {})
        )
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        assert ol.fetch_openlibrary_work("OL5738148W") is None

    def test_returns_none_on_a_server_error_without_retrying(self, monkeypatch):
        calls = []

        def fake_get(*a, **k):
            calls.append(1)
            return FakeResponse(503, {})

        monkeypatch.setattr(ol.requests, "get", fake_get)
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        assert ol.fetch_openlibrary_work("OL5738148W") is None
        assert len(calls) == 1

    def test_a_429_raises_rate_limit_exceeded_from_the_inner_request(self, monkeypatch):
        monkeypatch.setattr(ol.requests, "get", lambda *a, **k: FakeResponse(429, {}))
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        with pytest.raises(ol.RateLimitExceeded):
            ol._request("/works/OL5738148W.json", "work OL5738148W")

    def test_an_author_entry_without_a_key_is_skipped(self, monkeypatch):
        def fake_get(url, headers=None, timeout=None, **kwargs):
            if "/editions.json" in url:
                return FakeResponse(200, EDITIONS)
            return FakeResponse(200, {"title": "X", "covers": [], "authors": [{}]})

        monkeypatch.setattr(ol.requests, "get", fake_get)
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        result = ol.fetch_openlibrary_work("OL5738148W")
        assert result["authors"] == []


class TestOpenLibraryRateLimiter:
    def test_has_capacity_until_the_window_is_full(self):
        limiter = ol.OpenLibraryRateLimiter(max_requests=2, time_window=60)
        assert limiter.has_capacity() is True
        limiter.wait_if_needed()
        limiter.wait_if_needed()
        assert limiter.has_capacity() is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_openlibrary_client.py -v`
Expected: FAIL — `ImportError: cannot import name 'openlibrary'`.

- [ ] **Step 3: Write the client**

Create `app/services/integrations/openlibrary.py`:

```python
"""
openlibrary.py
Handles all HTTP interactions with the Open Library API.
Strictly responsible for fetching raw external JSON data.

An Open Library *work* is one book. A novel entry may span several books
(Mistborn is one entry and three novels), so the stored work id names the
entry's anchor book — see the design spec, Decision A.

No API key: Open Library is open. The User-Agent is not optional, though —
generic client agents get throttled, the same reason Comic Vine and Tenrai
set one.
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

logger = logging.getLogger(__name__)

OPENLIBRARY_BASE_URL = "https://openlibrary.org"
OPENLIBRARY_USER_AGENT = "CG1618-Media-Tracker/1.0"

# The editions list is the only place a first-publication year can be found;
# work.first_publish_date is unpopulated in practice (see the spec's probe).
EDITIONS_LIMIT = 1000
# A book has one or two authors. The cap stops a pathological record from
# costing dozens of requests.
MAX_AUTHOR_CALLS = 3


class OpenLibraryRateLimiter:
    """
    Sliding window rate limiter for Open Library (100 requests per minute).

    Open Library publishes no hard quota; this is politeness, not a ceiling
    they enforce. In-memory and per-process, like every other limiter here:
    it resets on restart and is not shared between instances.
    """

    def __init__(self, max_requests: int = 100, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def _prune(self, now: float) -> None:
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

    def has_capacity(self) -> bool:
        self._prune(time.time())
        return len(self.request_timestamps) < self.max_requests

    def wait_if_needed(self):
        now = time.time()
        self._prune(now)

        if len(self.request_timestamps) >= self.max_requests:
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.warning(
                    f"Open Library Rate Limiter: limit ({self.max_requests}) reached. "
                    f"Pausing for {sleep_time:.2f} seconds."
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


openlibrary_rate_limiter = OpenLibraryRateLimiter()


class RateLimitExceeded(Exception):
    pass


def _request(path: str, context: str) -> Optional[Any]:
    """
    Issues one throttled Open Library request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    openlibrary_rate_limiter.wait_if_needed()

    url = f"{OPENLIBRARY_BASE_URL}{path}"
    headers = {"User-Agent": OPENLIBRARY_USER_AGENT}

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning(f"Open Library rate limit (429) for {context}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning(f"Open Library has no record for {context}.")
            return None

        if response.status_code >= 500:
            logger.warning(
                f"Open Library server error ({response.status_code}) for {context} "
                "— skipping retries."
            )
            return None

        response.raise_for_status()
        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network/Timeout Error connecting to Open Library for {context}: {e}"
        )
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
def fetch_openlibrary_work(
    work_id: str, *, want_editions: bool = True, want_authors: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Fetches one work and, only when asked for, its editions and its authors.

    The flags exist because the caller's writes are fill-only: an entry that
    already has a release_date can never use the editions response, and one
    that already has an author credit can never use the author responses.
    Skipping them drops the steady-state cost to a single request.
    """
    if not work_id:
        return None

    work = _request(f"/works/{work_id}.json", context=f"work {work_id}")
    if not work:
        return None

    editions: List[Dict[str, Any]] = []
    if want_editions:
        payload = _request(
            f"/works/{work_id}/editions.json?limit={EDITIONS_LIMIT}",
            context=f"editions of {work_id}",
        )
        editions = (payload or {}).get("entries") or []

    authors: List[Dict[str, Any]] = []
    if want_authors:
        for entry in (work.get("authors") or [])[:MAX_AUTHOR_CALLS]:
            key = (entry.get("author") or {}).get("key")
            if not key:
                continue
            author = _request(f"{key}.json", context=f"author {key}")
            if author:
                authors.append(author)

    return {"work": work, "editions": editions, "authors": authors}
```

- [ ] **Step 4: Export the fetch function**

In `app/services/integrations/__init__.py`, add `fetch_openlibrary_work` alongside `fetch_comicvine_volume`, matching whatever import/`__all__` style that file already uses.

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_openlibrary_client.py -v`
Expected: all 11 tests PASS.

- [ ] **Step 6: Run the full gate**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/services/integrations/openlibrary.py app/services/integrations/__init__.py tests/unit/test_openlibrary_client.py
git commit -m "feat(openlibrary): keyless client with conditional editions and author fetches"
```

---

### Task 4: Map Open Library JSON to novel fields

**Files:**
- Modify: `app/utils/openlibrary_utils.py` (created in Task 2)
- Test: `tests/unit/test_openlibrary_mapping.py`

**Interfaces:**
- Consumes: the `{"work", "editions", "authors"}` dict shape produced by `fetch_openlibrary_work` (Task 3). This task does not import the client — it works on plain dicts, so it can be built in parallel with Task 3.
- Produces: `map_openlibrary_to_novel_data(raw: Optional[dict]) -> dict` with exactly the keys `release_date`, `author`, `cover_image_url`, each `None` when unavailable.

**Two findings from the live probe drive this task — do not "clean them up":**
1. `work.first_publish_date` is unpopulated in practice. The year must come from the earliest edition. That beat the search API's `first_publish_year` on every entry tested (Gatsby: 1925 vs 1920).
2. `covers` uses `-1` as a "no cover" sentinel. `OL16044142W` returns `[11329782, ..., -1, 13302367]`. An unfiltered `covers[0]` will eventually download a 404.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_openlibrary_mapping.py`:

```python
"""
Open Library JSON to novel fields.

Year precision is deliberate, and matches what Comic Vine already does
(start_year -> a bare-year release_date, fill-only). The stored id names the
entry's anchor book, so nothing here maps end_date, volume counts or
serialization status: one book cannot know them for a trilogy.
"""

from datetime import date

from app.utils.openlibrary_utils import (
    _earliest_edition_year,
    map_openlibrary_to_novel_data,
)


def raw(work=None, editions=None, authors=None):
    return {
        "work": work if work is not None else {"title": "The Final Empire", "covers": [14658160]},
        "editions": editions if editions is not None else [{"publish_date": "2006"}],
        "authors": authors if authors is not None else [{"name": "Brandon Sanderson"}],
    }


class TestEarliestEditionYear:
    def test_takes_the_minimum_across_editions(self):
        editions = [
            {"publish_date": "July 2015"},
            {"publish_date": "2006"},
            {"publish_date": "March 1, 2011"},
        ]
        assert _earliest_edition_year(editions) == 2006

    def test_ignores_an_edition_with_no_parseable_year(self):
        editions = [{"publish_date": "n.d."}, {"publish_date": "1998"}]
        assert _earliest_edition_year(editions) == 1998

    def test_ignores_a_year_beyond_next_year(self):
        far_future = str(date.today().year + 5)
        editions = [{"publish_date": far_future}, {"publish_date": "2001"}]
        assert _earliest_edition_year(editions) == 2001

    def test_returns_none_for_no_editions(self):
        assert _earliest_edition_year([]) is None
        assert _earliest_edition_year(None) is None

    def test_returns_none_when_no_edition_has_a_year(self):
        assert _earliest_edition_year([{"publish_date": "unknown"}, {}]) is None


class TestMapOpenlibraryToNovelData:
    def test_maps_all_three_fields(self):
        mapped = map_openlibrary_to_novel_data(raw())
        assert mapped["release_date"] == "2006"
        assert mapped["author"] == "Brandon Sanderson"
        assert mapped["cover_image_url"] == (
            "https://covers.openlibrary.org/b/id/14658160-L.jpg"
        )

    def test_joins_multiple_authors(self):
        mapped = map_openlibrary_to_novel_data(
            raw(authors=[{"name": "Kugane Maruyama"}, {"name": "so-bin"}])
        )
        assert mapped["author"] == "Kugane Maruyama, so-bin"

    def test_skips_the_minus_one_cover_sentinel(self):
        mapped = map_openlibrary_to_novel_data(
            raw(work={"title": "Mistborn", "covers": [-1, 11329782]})
        )
        assert mapped["cover_image_url"] == (
            "https://covers.openlibrary.org/b/id/11329782-L.jpg"
        )

    def test_returns_no_cover_when_every_id_is_the_sentinel(self):
        mapped = map_openlibrary_to_novel_data(raw(work={"title": "X", "covers": [-1]}))
        assert mapped["cover_image_url"] is None

    def test_returns_no_cover_when_covers_is_absent(self):
        mapped = map_openlibrary_to_novel_data(raw(work={"title": "X"}))
        assert mapped["cover_image_url"] is None

    def test_returns_no_author_when_authors_is_empty(self):
        assert map_openlibrary_to_novel_data(raw(authors=[]))["author"] is None

    def test_ignores_an_author_record_with_a_blank_name(self):
        mapped = map_openlibrary_to_novel_data(
            raw(authors=[{"name": "  "}, {"name": "Andy Weir"}])
        )
        assert mapped["author"] == "Andy Weir"

    def test_returns_no_release_date_when_editions_were_not_fetched(self):
        assert map_openlibrary_to_novel_data(raw(editions=[]))["release_date"] is None

    def test_handles_none_and_empty_input(self):
        for value in (None, {}):
            mapped = map_openlibrary_to_novel_data(value)
            assert mapped == {
                "release_date": None,
                "author": None,
                "cover_image_url": None,
            }

    def test_never_maps_fields_the_anchor_book_cannot_know(self):
        mapped = map_openlibrary_to_novel_data(raw())
        for forbidden in (
            "end_date",
            "vol_total_original",
            "ch_total",
            "serialization_status",
            "novel_name_en",
        ):
            assert forbidden not in mapped
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_openlibrary_mapping.py -v`
Expected: FAIL — `ImportError: cannot import name '_earliest_edition_year'`.

- [ ] **Step 3: Write the mapper**

Append to `app/utils/openlibrary_utils.py` (add `from datetime import date` and `from typing import Any, Dict, List` to the imports, plus `from app.utils.release_date import normalize`):

```python
COVER_URL_TEMPLATE = "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"

# publish_date is free text: "2006", "July 2015", "March 1, 2011", "n.d.".
YEAR_PATTERN = re.compile(r"(1[4-9]\d\d|20\d\d)")


def _earliest_edition_year(editions: Optional[List[Dict[str, Any]]]) -> Optional[int]:
    """
    The earliest year any edition of this work was published.

    work.first_publish_date is the field this should have used, but it is
    unpopulated on real records, so the editions list is the only source. The
    earliest edition beat the search API's first_publish_year on every entry
    tested; see the spec's probe findings.
    """
    ceiling = date.today().year + 1
    years = []
    for edition in editions or []:
        match = YEAR_PATTERN.search(str(edition.get("publish_date") or ""))
        if not match:
            continue
        year = int(match.group(1))
        if year <= ceiling:
            years.append(year)
    return min(years) if years else None


def _pick_cover_url(work: Dict[str, Any]) -> Optional[str]:
    """
    The first real cover id. Open Library writes -1 for "no cover here" rather
    than omitting the slot, and that id 404s when downloaded.
    """
    for cover_id in work.get("covers") or []:
        if isinstance(cover_id, int) and cover_id > 0:
            return COVER_URL_TEMPLATE.format(cover_id=cover_id)
    return None


def map_openlibrary_to_novel_data(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    The three things an anchor book can tell us about the whole entry: when the
    entry starts, who wrote it, and what it looks like.

    Nothing else is mapped. end_date, volume and chapter totals and
    serialization status are true of the *set*, and one book cannot know them —
    see the design spec, Decision A.
    """
    payload = raw or {}
    work = payload.get("work") or {}

    names = [
        (author.get("name") or "").strip()
        for author in payload.get("authors") or []
    ]
    names = [name for name in names if name]

    return {
        "release_date": normalize(_earliest_edition_year(payload.get("editions"))),
        "author": ", ".join(names) or None,
        "cover_image_url": _pick_cover_url(work),
    }
```

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_openlibrary_mapping.py -v`
Expected: all 15 tests PASS. If `test_maps_all_three_fields` fails on `release_date`, check `normalize` — it accepts integer years (its docstring says so, because novel and comic used to store `Integer`), and must return the string `"2006"`.

- [ ] **Step 5: Run the full gate**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/utils/openlibrary_utils.py tests/unit/test_openlibrary_mapping.py
git commit -m "feat(openlibrary): map work JSON to novel release date, author and cover"
```

---

### Task 5: `autofill_novel_from_openlibrary`

**Files:**
- Modify: `app/services/domain/autofill.py` (add after `autofill_novel_from_mal`, which ends at line 250)
- Modify: `app/services/domain/__init__.py` (export it beside `autofill_novel_from_mal`)
- Test: `tests/api/test_novel_openlibrary_autofill.py`

**Interfaces:**
- Consumes: `fetch_openlibrary_work` (Task 3), `map_openlibrary_to_novel_data` (Task 4), `Novel.openlibrary_id` (Task 1).
- Produces: `autofill_novel_from_openlibrary(novel: Novel, db: Session) -> None`. Takes `db` (unlike `autofill_novel_from_mal`) because the author credit lives in `media_credit`, not on the row — the same reason `autofill_comic_from_comicvine` takes it.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_novel_openlibrary_autofill.py`:

```python
"""
Tests for autofill_novel_from_openlibrary.

The fetch and the cover download are both patched out — these lock down the
fill-only semantics (never overwrite what the admin typed) and the anchor-book
contract (never write what one book cannot know about a multi-book entry),
not the network layer. The author credit is a media_credit row, so this needs a
real db_session rather than a SimpleNamespace fake.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_novel_from_openlibrary
from app.services.domain.credits import credit_names, replace_credits

WORK_RESULT = {
    "work": {"title": "The Final Empire", "covers": [14658160]},
    "editions": [{"publish_date": "2006"}, {"publish_date": "July 2015"}],
    "authors": [{"name": "Brandon Sanderson"}],
}


def make_novel(db_session, **kwargs):
    """A real Novel row with every Open-Library-fillable field blank."""
    defaults = dict(
        system_id=uuid.uuid4(),
        novel_name_en="Mistborn",
        openlibrary_id="OL5738148W",
        release_date=None,
        end_date=None,
        vol_total_original=None,
        ch_total=None,
        serialization_status=None,
        cover_image_file=None,
    )
    defaults.update(kwargs)
    novel = models.Novel(**defaults)
    db_session.add(novel)
    db_session.flush()
    return novel


@pytest.fixture
def patched(monkeypatch):
    """Patches the fetch and the cover download; records how each was called."""
    calls = {"fetch": [], "download": []}

    def fake_fetch(work_id, *, want_editions=True, want_authors=True):
        calls["fetch"].append(
            {"work_id": work_id, "want_editions": want_editions, "want_authors": want_authors}
        )
        return WORK_RESULT

    def fake_download(url, system_id):
        calls["download"].append((url, system_id))
        return "downloaded.jpg"

    monkeypatch.setattr(autofill_module, "fetch_openlibrary_work", fake_fetch)
    monkeypatch.setattr(autofill_module, "download_cover_image", fake_download)
    return calls


class TestFillsBlankFields:
    def test_fills_release_date_from_the_earliest_edition(self, db_session, patched):
        novel = make_novel(db_session)
        autofill_novel_from_openlibrary(novel, db_session)
        assert novel.release_date == "2006"

    def test_fills_the_cover(self, db_session, patched):
        novel = make_novel(db_session)
        autofill_novel_from_openlibrary(novel, db_session)
        assert novel.cover_image_file == "downloaded.jpg"
        assert patched["download"][0][0] == (
            "https://covers.openlibrary.org/b/id/14658160-L.jpg"
        )

    def test_creates_the_author_credit(self, db_session, patched):
        novel = make_novel(db_session)
        autofill_novel_from_openlibrary(novel, db_session)
        assert credit_names(db_session, "novel", novel.system_id, "author") == [
            "Brandon Sanderson"
        ]


class TestFillOnly:
    def test_keeps_an_existing_release_date(self, db_session, patched):
        novel = make_novel(db_session, release_date="1999")
        autofill_novel_from_openlibrary(novel, db_session)
        assert novel.release_date == "1999"

    def test_keeps_an_existing_cover(self, db_session, patched):
        novel = make_novel(db_session, cover_image_file="mine.jpg")
        autofill_novel_from_openlibrary(novel, db_session)
        assert novel.cover_image_file == "mine.jpg"
        assert patched["download"] == []

    def test_keeps_an_existing_author_credit(self, db_session, patched):
        novel = make_novel(db_session)
        replace_credits(db_session, "novel", novel.system_id, "author", ["Someone Else"])
        autofill_novel_from_openlibrary(novel, db_session)
        assert credit_names(db_session, "novel", novel.system_id, "author") == [
            "Someone Else"
        ]


class TestAnchorBookContract:
    def test_never_writes_fields_one_book_cannot_know(self, db_session, patched):
        novel = make_novel(db_session)
        autofill_novel_from_openlibrary(novel, db_session)
        assert novel.end_date is None
        assert novel.vol_total_original is None
        assert novel.ch_total is None
        assert novel.serialization_status is None

    def test_never_touches_the_entry_name(self, db_session, patched):
        novel = make_novel(db_session, novel_name_en="Mistborn")
        autofill_novel_from_openlibrary(novel, db_session)
        assert novel.novel_name_en == "Mistborn"


class TestConditionalFetching:
    def test_asks_for_editions_and_authors_when_both_are_missing(self, db_session, patched):
        novel = make_novel(db_session)
        autofill_novel_from_openlibrary(novel, db_session)
        assert patched["fetch"][0]["want_editions"] is True
        assert patched["fetch"][0]["want_authors"] is True

    def test_skips_editions_when_the_release_date_is_already_set(self, db_session, patched):
        novel = make_novel(db_session, release_date="1999")
        autofill_novel_from_openlibrary(novel, db_session)
        assert patched["fetch"][0]["want_editions"] is False

    def test_skips_authors_when_a_credit_already_exists(self, db_session, patched):
        novel = make_novel(db_session)
        replace_credits(db_session, "novel", novel.system_id, "author", ["Someone Else"])
        autofill_novel_from_openlibrary(novel, db_session)
        assert patched["fetch"][0]["want_authors"] is False


class TestFailureHandling:
    def test_does_nothing_without_an_id(self, db_session, patched):
        novel = make_novel(db_session, openlibrary_id=None)
        autofill_novel_from_openlibrary(novel, db_session)
        assert patched["fetch"] == []
        assert novel.release_date is None

    def test_survives_a_fetch_returning_none(self, db_session, monkeypatch):
        monkeypatch.setattr(
            autofill_module, "fetch_openlibrary_work", lambda *a, **k: None
        )
        novel = make_novel(db_session)
        autofill_novel_from_openlibrary(novel, db_session)
        assert novel.release_date is None

    def test_swallows_and_logs_a_fetch_exception(self, db_session, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("network down")

        monkeypatch.setattr(autofill_module, "fetch_openlibrary_work", boom)
        novel = make_novel(db_session)
        autofill_novel_from_openlibrary(novel, db_session)  # must not raise
        assert novel.release_date is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_openlibrary_autofill.py -v`
Expected: FAIL — `ImportError: cannot import name 'autofill_novel_from_openlibrary'`.

- [ ] **Step 3: Write the autofill**

In `app/services/domain/autofill.py`, add to the imports:

```python
from app.services.integrations.openlibrary import fetch_openlibrary_work
from app.utils.openlibrary_utils import map_openlibrary_to_novel_data
```

`credit_names`, `replace_credits`, `split_names` and `download_cover_image` are already imported for the comic autofill — reuse them, do not re-import.

Then add after `autofill_novel_from_mal`:

```python
def autofill_novel_from_openlibrary(novel: Novel, db: Session) -> None:
    """
    Enriches a single Novel entry with Open Library data. Does not commit —
    caller is responsible.

    For novels MAL does not have. Fill-only throughout, and deliberately narrow:
    the stored work id names the entry's *anchor* book, so this writes only what
    is true of the whole entry when read off book one — when it starts, who wrote
    it, what it looks like. end_date, volume and chapter totals and serialization
    status belong to the set, and are never touched.
    """
    work_id = novel.openlibrary_id
    if not work_id:
        return

    try:
        want_editions = not novel.release_date
        want_authors = not credit_names(db, "novel", novel.system_id, "author")

        raw_data = fetch_openlibrary_work(
            work_id, want_editions=want_editions, want_authors=want_authors
        )
        if not raw_data:
            return

        ol_data = map_openlibrary_to_novel_data(raw_data)

        if want_editions and ol_data.get("release_date"):
            novel.release_date = ol_data.get("release_date")

        if want_authors and ol_data.get("author"):
            replace_credits(
                db, "novel", novel.system_id, "author", split_names(ol_data.get("author"))
            )

        if not novel.cover_image_file and ol_data.get("cover_image_url"):
            filename = download_cover_image(
                ol_data.get("cover_image_url"), str(novel.system_id)
            )
            if filename:
                novel.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"Open Library Autofill failed for Novel ID {novel.system_id} "
            f"(Work {work_id}): {e}"
        )
```

- [ ] **Step 4: Export it**

In `app/services/domain/__init__.py`, add `autofill_novel_from_openlibrary` to the `from app.services.domain.autofill import (...)` block and to `__all__`, beside `autofill_novel_from_mal`.

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_openlibrary_autofill.py -v`
Expected: all 14 tests PASS. (These need the `anime_site_test` PostgreSQL database, like every other `tests/api/` file.)

- [ ] **Step 6: Run the full gate**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/services/domain/autofill.py app/services/domain/__init__.py tests/api/test_novel_openlibrary_autofill.py
git commit -m "feat(novel): autofill release date, cover and author from Open Library"
```

---

### Task 6: The Open Library fill gate

**Files:**
- Modify: `app/utils/utils.py` (after `NOVEL_FIELDS_TO_FILL`, which ends at line 113)
- Modify: `app/services/domain/checking.py` (after `has_missing_values_novel`, which ends at line 209)
- Modify: `app/services/domain/__init__.py` (export it)
- Test: `tests/api/test_novel_openlibrary_fill_gate.py`

**Interfaces:**
- Consumes: `_link_missing` (already in `checking.py:127`), `Novel.openlibrary_id` (Task 1).
- Produces:
  - `NOVEL_OPENLIBRARY_FIELDS_TO_FILL: list[str]`
  - `NOVEL_OPENLIBRARY_LINK_FIELDS_TO_FILL: list[tuple[str, str]]`
  - `has_missing_values_novel_openlibrary(db, novel: Novel) -> bool`

**Why this is a second function rather than a wider `has_missing_values_novel`:** `NOVEL_FIELDS_TO_FILL` lists `serialization_status`, `end_date`, `mal_rating` and `mal_rank`. Open Library returns none of them. Reusing that list would leave every Open-Library-sourced entry permanently "needs filling" and re-request it on every run — the exact trap the comment above `COMIC_FIELDS_TO_FILL` (`app/utils/utils.py:115`) warns about. `has_missing_values_novel` itself must not be modified.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_novel_openlibrary_fill_gate.py`:

```python
"""
The Open Library fill gate for novels.

Deliberately narrower than has_missing_values_novel: only the three things
Open Library can actually supply count. Requiring serialization_status or
mal_rating here would mark every such entry permanently incomplete and
re-request it forever.
"""

import uuid

from app import models
from app.services.domain import has_missing_values_novel_openlibrary
from app.services.domain.credits import replace_credits


def make_novel(db_session, **kwargs):
    defaults = dict(
        system_id=uuid.uuid4(),
        novel_name_en="Mistborn",
        openlibrary_id="OL5738148W",
        release_date="2006",
        cover_image_file="cover.jpg",
    )
    defaults.update(kwargs)
    novel = models.Novel(**defaults)
    db_session.add(novel)
    db_session.flush()
    return novel


def complete(db_session, **kwargs):
    """A novel with nothing left for Open Library to fill."""
    novel = make_novel(db_session, **kwargs)
    replace_credits(db_session, "novel", novel.system_id, "author", ["Brandon Sanderson"])
    return novel


class TestHasMissingValuesNovelOpenlibrary:
    def test_false_when_everything_is_present(self, db_session):
        novel = complete(db_session)
        assert has_missing_values_novel_openlibrary(db_session, novel) is False

    def test_true_when_the_release_date_is_missing(self, db_session):
        novel = complete(db_session, release_date=None)
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_true_when_the_cover_is_missing(self, db_session):
        novel = complete(db_session, cover_image_file=None)
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_true_when_the_cover_is_blank_whitespace(self, db_session):
        novel = complete(db_session, cover_image_file="   ")
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_true_when_there_is_no_author_credit(self, db_session):
        novel = make_novel(db_session)
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_ignores_fields_open_library_never_supplies(self, db_session):
        """serialization_status, end_date, mal_rating and mal_rank all blank,
        yet the entry is complete as far as Open Library is concerned."""
        novel = complete(
            db_session,
            serialization_status=None,
            end_date=None,
            mal_rating=None,
            mal_rank=None,
            vol_total_original=None,
            ch_total=None,
        )
        assert has_missing_values_novel_openlibrary(db_session, novel) is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_openlibrary_fill_gate.py -v`
Expected: FAIL — `ImportError: cannot import name 'has_missing_values_novel_openlibrary'`.

- [ ] **Step 3: Add the constants**

In `app/utils/utils.py`, immediately after `NOVEL_FIELDS_TO_FILL`:

```python
# Only what Open Library actually returns for a work. serialization_status,
# end_date, mal_rating and mal_rank are in NOVEL_FIELDS_TO_FILL but have no
# Open Library equivalent, so listing them here would leave every entry
# permanently "needs filling" and re-request it on every run.
NOVEL_OPENLIBRARY_FIELDS_TO_FILL = [
    "release_date",
    "cover_image_file",
]

NOVEL_OPENLIBRARY_LINK_FIELDS_TO_FILL = [("credit", "author")]
```

- [ ] **Step 4: Add the gate**

In `app/services/domain/checking.py`, add both constants to the `from app.utils.utils import (...)` block, then add after `has_missing_values_novel`:

```python
def has_missing_values_novel_openlibrary(db, novel: Novel) -> bool:
    """
    Returns True if anything Open Library can supply is still blank: the
    release date, the cover, or the author credit.

    Narrower than has_missing_values_novel on purpose — see
    NOVEL_OPENLIBRARY_FIELDS_TO_FILL. There is no mal_link gate here: the
    caller decides which source an entry belongs to.
    """
    for field in NOVEL_OPENLIBRARY_FIELDS_TO_FILL:
        val = getattr(novel, field, None)
        if val is None or str(val).strip() == "":
            return True

    return _link_missing(
        db, "novel", novel.system_id, NOVEL_OPENLIBRARY_LINK_FIELDS_TO_FILL
    )
```

- [ ] **Step 5: Export it**

In `app/services/domain/__init__.py`, add `has_missing_values_novel_openlibrary` to the `from app.services.domain.checking import (...)` block and to `__all__`, beside `has_missing_values_novel`.

- [ ] **Step 6: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_openlibrary_fill_gate.py -v`
Expected: all 6 tests PASS.

- [ ] **Step 7: Run the full gate**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green. `has_missing_values_novel` must still behave exactly as before — its own tests prove it.

- [ ] **Step 8: Commit**

```bash
git add app/utils/utils.py app/services/domain/checking.py app/services/domain/__init__.py tests/api/test_novel_openlibrary_fill_gate.py
git commit -m "feat(novel): Open Library fill gate, narrowed to the fields it supplies"
```

---

### Task 7: Wire the novel pipeline

**Files:**
- Modify: `app/services/pipelines/specs.py:156-168` (the `"novel"` `PipelineSpec`) and its import block
- Test: `tests/api/test_novel_pipeline_routing.py`

**Interfaces:**
- Consumes: `apply_extract_novel_ids` (Task 2), `autofill_novel_from_openlibrary` (Task 5), `has_missing_values_novel_openlibrary` (Task 6).
- Produces: a `PIPELINES["novel"]` whose `fill_eligible` and `fill` both route on `mal_link`.

**This task carries the headline behaviour change.** Today `fill_eligible` is `e.mal_link is not None and has_missing_values_novel(e)`, so a novel with no MAL link is not "already filled" — it is invisible to Fill entirely.

**The `e.mal_link is None` guard on the Open Library branch is load-bearing.** Eligibility must match the routing in `fill` exactly. Without it, a novel carrying both ids whose MAL fields are complete but which has no `author` credit would be reported eligible, then routed to Tenrai, which never writes author credits — so it would never become ineligible and would be re-requested on every run.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_novel_pipeline_routing.py`:

```python
"""
Novel fill eligibility and source routing.

Novel is the only media type with two sources. MAL wins whenever it is
available, because Tenrai returns strictly more (serialization status, end
date, volume and chapter totals, ratings); Open Library fills only the entries
MAL does not have.
"""

import uuid

from app import models
from app.services.pipelines.specs import PIPELINES

SPEC = PIPELINES["novel"]


def make_novel(db_session, **kwargs):
    defaults = dict(
        system_id=uuid.uuid4(),
        novel_name_en="Mistborn",
        mal_link=None,
        mal_id=None,
        openlibrary_id=None,
        openlibrary_link=None,
        release_date=None,
        cover_image_file=None,
        serialization_status=None,
        end_date=None,
        mal_rating=None,
        mal_rank=None,
    )
    defaults.update(kwargs)
    novel = models.Novel(**defaults)
    db_session.add(novel)
    db_session.flush()
    return novel


class TestFillEligible:
    def test_an_open_library_novel_with_no_mal_link_is_eligible(self, db_session):
        """The headline change: this was False before Open Library existed."""
        novel = make_novel(db_session, openlibrary_id="OL5738148W")
        assert SPEC.fill_eligible(db_session, novel) is True

    def test_a_novel_with_neither_source_is_not_eligible(self, db_session):
        novel = make_novel(db_session)
        assert SPEC.fill_eligible(db_session, novel) is False

    def test_a_mal_novel_with_gaps_is_still_eligible(self, db_session):
        novel = make_novel(
            db_session, mal_link="https://myanimelist.net/manga/23390/", mal_id=23390
        )
        assert SPEC.fill_eligible(db_session, novel) is True

    def test_a_mal_complete_novel_is_not_eligible_via_open_library(self, db_session):
        """Both ids, MAL fields complete, no author credit. Routing would send
        this to Tenrai, which never writes author credits — so calling it
        eligible would re-request it on every single run, forever."""
        novel = make_novel(
            db_session,
            mal_link="https://myanimelist.net/manga/23390/",
            mal_id=23390,
            openlibrary_id="OL5738148W",
            serialization_status="完結",
            release_date="2006",
            end_date="2011",
            mal_rating=8.5,
            mal_rank="123",
            cover_image_file="cover.jpg",
            vol_total_original=3,
        )
        assert SPEC.fill_eligible(db_session, novel) is False


class TestFillRouting:
    def test_routes_to_open_library_when_there_is_no_mal_link(
        self, db_session, monkeypatch
    ):
        called = []
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_openlibrary",
            lambda e, db: called.append("openlibrary"),
        )
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_mal",
            lambda e, force_replace_ratings=True: called.append("mal"),
        )
        novel = make_novel(db_session, openlibrary_id="OL5738148W")
        PIPELINES["novel"].fill(db_session, novel)
        assert called == ["openlibrary"]

    def test_routes_to_mal_when_both_ids_are_present(self, db_session, monkeypatch):
        called = []
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_openlibrary",
            lambda e, db: called.append("openlibrary"),
        )
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_mal",
            lambda e, force_replace_ratings=True: called.append("mal"),
        )
        novel = make_novel(
            db_session,
            mal_link="https://myanimelist.net/manga/23390/",
            mal_id=23390,
            openlibrary_id="OL5738148W",
        )
        PIPELINES["novel"].fill(db_session, novel)
        assert called == ["mal"]


class TestExtractId:
    def test_the_spec_uses_the_combined_extractor(self, db_session):
        novel = make_novel(
            db_session,
            mal_link="https://myanimelist.net/manga/23390/",
            openlibrary_link="https://openlibrary.org/works/OL5738148W",
        )
        assert SPEC.extract_id(novel) is True
        assert novel.mal_id == 23390
        assert novel.openlibrary_id == "OL5738148W"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_pipeline_routing.py -v`
Expected: FAIL — `test_an_open_library_novel_with_no_mal_link_is_eligible` returns `False`, and the routing tests fail because `specs.py` has no `autofill_novel_from_openlibrary` attribute to patch.

- [ ] **Step 3: Update the imports**

In `app/services/pipelines/specs.py`, add to the existing `from app.services.domain import (...)` block: `apply_extract_novel_ids`, `autofill_novel_from_openlibrary`, `has_missing_values_novel_openlibrary`. Leave `apply_extract_mal_id_manga_novel` imported — `manga` still uses it.

- [ ] **Step 4: Rewrite the novel spec**

Replace the `"novel"` entry in `PIPELINES`:

```python
    "novel": PipelineSpec(
        key="novel", label="Novel", model=Novel,
        # Novel is the one type with two sources, so both extractors run.
        extract_id=apply_extract_novel_ids,
        # A mal_link means Tenrai, which returns strictly more. Open Library
        # covers only the novels MAL does not have. The `mal_link is None`
        # guard on the second branch keeps eligibility identical to the
        # routing below: without it, a MAL-complete novel with no author
        # credit would be eligible forever and never progress.
        fill_eligible=lambda db, e: (
            (e.mal_link is not None and has_missing_values_novel(e))
            or (
                e.mal_link is None
                and e.openlibrary_id is not None
                and has_missing_values_novel_openlibrary(db, e)
            )
        ),
        fill=lambda db, e: (
            autofill_novel_from_mal(e, force_replace_ratings=True)
            if e.mal_link
            else autofill_novel_from_openlibrary(e, db)
        ),
        fill_sleep=MAL_PAUSE,
        fill_after=(("Syncing system options...", run_sync_novel),),
        replace_select=_linked(Novel, Novel.mal_id, Novel.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_novel(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(("Syncing system options...", run_sync_novel),),
        single_after=(run_sync_novel,),
    ),
```

`replace_select` and `replace` are unchanged on purpose: Replace is out of scope, so an Open-Library-only novel is never selected for it. `MAL_PAUSE` is 1 second, which is also the right pace for Open Library, so no second constant is needed.

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_novel_pipeline_routing.py -v`
Expected: all 7 tests PASS.

- [ ] **Step 6: Run the full gate**

Run: `venv/Scripts/python.exe -m pytest -q && venv/Scripts/ruff.exe check .`
Expected: all green. Pay attention to any pre-existing novel Fill test — behaviour for entries **with** a `mal_link` must be byte-identical to before.

- [ ] **Step 7: Commit**

```bash
git add app/services/pipelines/specs.py tests/api/test_novel_pipeline_routing.py
git commit -m "feat(novel): route Fill to Open Library when there is no MAL link"
```

---

### Task 8: Admin form and detail page

**Files:**
- Modify: `frontend/src/config/formFactories.js:223-265` (`defaultNovel`)
- Modify: `frontend/src/config/formFields/fieldMeta.js:517-587` (the `novel` block)
- Modify: `frontend/src/pages/add-tabs/NovelAddTab.jsx:532-547` (beside the MAL Link field)
- Modify: `frontend/src/pages/modify-tabs/NovelModifyTab.jsx:450-465` (beside the MAL Link field)
- Modify: `frontend/src/pages/admin/Add.jsx:1967` (novel payload)
- Modify: `frontend/src/pages/admin/Modify.jsx:764` (hydration) and `:1931` (payload)
- Modify: `frontend/src/components/info/SourcesCard.jsx:53-135`
- Modify: `frontend/src/pages/detail/Novel.jsx:368-372`
- Test: `frontend/src/pages/detail/Novel.test.jsx`

**Interfaces:**
- Consumes: `openlibrary_link` / `openlibrary_id` on the novel API payload (Task 1).
- Produces: `SourcesCard` accepts a new `openLibraryLink` prop.

**Only the link is typed.** `openlibrary_id` is derived by the backend from the link, exactly like `comicvine_id` — do not add an input for it.

**Use group `"Links"`, not `"Sources"`.** `comicvine_link` sits in `"Sources"`, but that field group is RBAC-restricted; `mal_link` and `anilist_link` are in `"Links"`, and the Open Library link belongs with them.

- [ ] **Step 1: Write the failing test**

In `frontend/src/pages/detail/Novel.test.jsx`, add a new `describe` block after the existing "Novel detail page — units" block. The file already provides `BASE_NOVEL`, `mockFetch(novel)` and `mount()` — use them exactly as the existing tests do:

```jsx
describe("Novel detail page — sources", () => {
  it("renders the Open Library link in the Sources card", async () => {
    mockFetch({
      ...BASE_NOVEL,
      openlibrary_link: "https://openlibrary.org/works/OL5738148W",
    });
    mount();
    expect(await screen.findByText("Open Library")).toBeInTheDocument();
  });

  it("renders no Open Library row when the link is absent", async () => {
    mockFetch({ ...BASE_NOVEL, openlibrary_link: null });
    mount();
    await screen.findByRole("heading", { name: "Test Novel" });
    expect(screen.queryByText("Open Library")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/detail/Novel.test.jsx`
Expected: FAIL — "Open Library" is not in the document.

- [ ] **Step 3: Add the SourcesCard prop and row**

In `frontend/src/components/info/SourcesCard.jsx`, add `openLibraryLink` to the destructured props after `anilistLink`, add it to the `hasAny` disjunction, and add the row after the AniList row:

```jsx
      {openLibraryLink && (
        <SourceLink href={openLibraryLink} tag="OL">
          Open Library
        </SourceLink>
      )}
```

- [ ] **Step 4: Pass it from the novel detail page**

In `frontend/src/pages/detail/Novel.jsx`, in the `<SourcesCard>` call:

```jsx
            malLink={novel.mal_link}
            anilistLink={novel.anilist_link}
            openLibraryLink={novel.openlibrary_link}
```

- [ ] **Step 5: Run the detail test**

Run: `cd frontend && npx vitest run src/pages/detail/Novel.test.jsx`
Expected: PASS.

- [ ] **Step 6: Add the form default**

In `frontend/src/config/formFactories.js`, in `defaultNovel`, after `anilist_link: ""`:

```js
  openlibrary_link: "",
```

- [ ] **Step 7: Add the field metadata**

In `frontend/src/config/formFields/fieldMeta.js`, in the `novel` block, after `publisher_tw`:

```js
    // The Fill pipeline reads openlibrary_id, which the backend derives from
    // this link — so the link is the only one the admin ever types. Novels
    // with no MAL link have no other source.
    openlibrary_link: {
      label: "Open Library Link",
      control: "url",
      group: "Links",
    },
```

- [ ] **Step 8: Add the Add-tab input**

In `frontend/src/pages/add-tabs/NovelAddTab.jsx`, after the AniList Link `<Field>`:

```jsx
        <Field label="Open Library Link">
          <input
            className={inputCls}
            type="url"
            value={nvf.openlibrary_link}
            onChange={(e) => unv("openlibrary_link", e.target.value)}
            placeholder="https://openlibrary.org/works/OL..."
          />
        </Field>
```

- [ ] **Step 9: Add the Modify-tab input**

In `frontend/src/pages/modify-tabs/NovelModifyTab.jsx`, after the AniList Link `<Field>`:

```jsx
        <Field label="Open Library Link">
          <input
            className={inputCls}
            type="url"
            value={cnvf.openlibrary_link || ""}
            onChange={(e) => unv("openlibrary_link", e.target.value)}
          />
        </Field>
```

- [ ] **Step 10: Wire the payloads**

In `frontend/src/pages/admin/Add.jsx`, after `anilist_link: nvf.anilist_link || null,`:

```js
      openlibrary_link: nvf.openlibrary_link || null,
```

In `frontend/src/pages/admin/Modify.jsx`, after `anilist_link: n.anilist_link || "",` (hydration, ~line 765):

```js
      openlibrary_link: n.openlibrary_link || "",
```

and after `anilist_link: cnvf.anilist_link || null,` (payload, ~line 1932):

```js
      openlibrary_link: cnvf.openlibrary_link || null,
```

- [ ] **Step 11: Run the frontend gate and build**

Run: `cd frontend && npm run test:run && npm run lint && npm run build`
Expected: tests and lint green, build writes `frontend_dist/`.

- [ ] **Step 12: Verify by hand**

Start the app, open Admin → Modify → a novel, paste `https://openlibrary.org/works/OL5738148W` into Open Library Link, save. Confirm the novel detail page shows an "Open Library" row in the Sources card, and that `openlibrary_id` on the entry becomes `OL5738148W` after a Fill run.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/pages/add-tabs/NovelAddTab.jsx frontend/src/pages/modify-tabs/NovelModifyTab.jsx frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx frontend/src/components/info/SourcesCard.jsx frontend/src/pages/detail/Novel.jsx frontend/src/pages/detail/Novel.test.jsx
git commit -m "feat(novel): Open Library link field and Sources card row"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/external-apis.md`
- Modify: `docs/data-model.md`
- Modify: `docs/entry-types.md`
- Modify: `docs/data-actions.md`
- Modify: `docs/roadmap.md`

Every file gets its `Last verified` line bumped to `2026-09-05` with the commit hash of this work. Docs describe the code as it is — write them from the merged code, not from this plan.

- [ ] **Step 1: `docs/external-apis.md`**

Five edits:
1. Opening paragraph: it says "Six outside services feed it". It is now seven; add Open Library to the sentence, described as filling novels that have no MAL entry.
2. At-a-glance table, a row after Comic Vine: `Open Library | https://openlibrary.org | none | app/services/integrations/openlibrary.py | app/utils/openlibrary_utils.py | novel (no MAL link)`.
3. The line under that table says "A missing key is never fatal". Note that Open Library needs no key at all, so it has no such failure mode.
4. A new `## Open Library` section after Comic Vine, covering: work vs edition vs author ids and why the id is a String; the three endpoints and when each is called (the conditional-fetch table); `OPENLIBRARY_USER_AGENT`; the 100/60 s limiter; `extract_openlibrary_id` and what it rejects; the mapping table (earliest edition year → `release_date`, authors → `author` credit, `covers[0]` skipping `-1` → cover); what `autofill_novel_from_openlibrary` writes and the four things it deliberately never writes; and that Replace is not wired.
5. "Which pipeline calls which service": update the `novel` row to show both branches — `apply_extract_novel_ids`; `autofill_novel_from_mal` when `mal_link` is present, else `autofill_novel_from_openlibrary`; services Tenrai **or** Open Library, plus GCS.

Also add to `## Known rough edges`: the `@retry` on `fetch_openlibrary_work` wraps all three calls, so a flaky author call re-runs the work and editions calls on each attempt — the same shape as the existing `fetch_tmdb_data` note.

- [ ] **Step 2: `docs/data-model.md`**

Add `openlibrary_link` and `openlibrary_id` to the novel table's column list, noting that the id is a String because the `OL…W` suffix distinguishes a work from an edition or an author.

- [ ] **Step 3: `docs/entry-types.md`**

In the per-type Fill table (~line 143-149), the novel column's "Id extractor" becomes `apply_extract_novel_ids` and "Fill function" becomes `autofill_novel_from_mal` / `autofill_novel_from_openlibrary` (routed on `mal_link`).

- [ ] **Step 4: `docs/data-actions.md`**

Note that novel Fill now has two branches and what decides between them, and that novel Replace still covers only MAL-linked entries.

- [ ] **Step 5: `docs/roadmap.md`**

Add a newest-first Done row:

```
| 2026-09-05 | Open Library fill for novels: `openlibrary_link` / `openlibrary_id` on `novel`, a keyless client fetching a work plus (only when needed) its editions and authors, an anchor-book mapper writing year-precision `release_date`, cover and the `author` credit, and per-entry routing in `PIPELINES["novel"]` so novels with no MAL link are Fill-eligible for the first time; Replace, Google Books and per-volume ids deliberately deferred |
```

Leave the "Next" section as it is unless the user has asked otherwise, and do not edit the "Deferred / known debt" table except to confirm its lines are still true.

- [ ] **Step 6: Run the full gate one final time**

Run:
```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all four green.

- [ ] **Step 7: Commit**

```bash
git add docs/external-apis.md docs/data-model.md docs/entry-types.md docs/data-actions.md docs/roadmap.md
git commit -m "docs: Open Library as the seventh external service"
```

---

## Manual verification before calling the feature done

1. Pick a real novel entry with no MAL link (a Western book).
2. Paste its Open Library **work** URL into Open Library Link and save.
3. Run Fill Novel from `/system`.
4. Confirm: `openlibrary_id` was derived; `release_date` is a plausible year; the cover downloaded; an `author` credit appeared and links to a Person page.
5. Run Fill Novel again. Confirm the entry is **no longer eligible** — if it is picked up a second time with nothing to do, the fill gate and the routing have drifted apart, which is the failure mode Task 7 exists to prevent.
6. Confirm an existing MAL-linked novel filled exactly as it did before.
