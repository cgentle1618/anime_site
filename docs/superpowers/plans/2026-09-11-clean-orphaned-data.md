# Clean Orphaned Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reviewed Data Control action that finds local rows the Google Sheet no longer mentions and deletes the ones an admin ticks, so that entries deleted on one machine stop surviving forever on the other.

**Architecture:** A new read-only service `app/services/pipelines/clean.py` diffs 13 in-scope sheet tabs against the local database and returns candidates with their cascade blast radius. Two routes on the existing `/api/data-control` router expose it: `clean/scan` (read-only) and `clean/apply` (re-scans, then deletes only ids still judged candidates). A new admin page renders the review with nothing pre-selected.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL 17, pytest; React + Vite + TanStack Query + Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-clean-orphaned-data-design.md`

**Status: SHIPPED 2026-09-12.** All eight tasks done.
T1 `17afb33e` · T2 `d8646700` · T3 `4720b29b` · T4 `5497d214` · T5 `52788b84` · T6 `6eaaa53f` · T7 `c360ecfa` · T8 is the docs commit.

The plan's three "read it, don't trust it" warnings all fired, and two more
like them turned up (`details_json` is TEXT, `quote.media_id` is SET NULL).
Tasks 2 and 3 diverge from what is written below because the code said so;
the spec records both corrections.

## Global Constraints

- **Session label `clean-session`.** Claim each task as `wip clean-session` in `docs/PROGRESS.md` before starting it; set it to `done <sha>` in the same commit as the work.
- **Test database is `anime_site_test_clean`.** Every pytest and alembic call is prefixed `POSTGRES_DB=anime_site_test_clean`.
- **One pytest at a time across all sessions.** Take the cross-session lock (CLAUDE.md, "Coordinated multi-session runs") around every run:
  ```bash
  LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
  until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
  POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest -q; rc=$?
  rmdir "$LOCK"; exit $rc
  ```
  A lock directory older than 25 minutes is stale: `rmdir` it and tell the coordinator.
- **The full backend suite runs before every commit**, not at checkpoints. It takes ~5.5 minutes. A `-k` run cannot see a test three directories away that the change invalidated.
- **Staging:** explicit file paths only, never a directory pathspec, stage and commit in one step. For `docs/PROGRESS.md` use `git add -p` and stage only your own hunks — four sessions write that file and it has been swept twice.
- **No migration.** This feature adds no schema change. If a task appears to need one, stop: something has been misread.
- **Never touch `anime_site_db`.**
- **Tokens are never minted by hand in tests.** Use `admin_client`, `super_client`, or `mode_client(...)` from `tests/api/conftest.py`. A token with no `mode` claim resolves the empty object set and 401s for reasons unrelated to the code under test.
- **Python is `venv/Scripts/python.exe`.** There is no system `python` on PATH.

---

### Task 1: The scan service — tab reading and its two refusals

**Files:**
- Create: `app/services/pipelines/clean.py`
- Test: `tests/services/test_clean_scan.py`

**Interfaces:**
- Consumes: `get_all_raw_rows` and `SheetsUnavailableError` from `app/services/integrations/sheets.py`; `SHEET_TABS` from `app/services/pipelines/tabs.py`.
- Produces:
  - `CLEAN_TABS: tuple[str, ...]` — the 13 in-scope tab names in scan order.
  - `class CleanAborted(RuntimeError)` — raised when the sheet cannot be trusted.
  - `read_tab(tab_name: str) -> list[list[str]]` — raises `CleanAborted`.

  `clean.py` must do `from app.services.integrations.sheets import get_all_raw_rows` so that tests can `monkeypatch.setattr(clean, "get_all_raw_rows", ...)`, which is the established pattern (`tests/api/test_credits_sheets.py:182`).

- [ ] **Step 1: Write the failing test**

```python
# tests/services/test_clean_scan.py
import pytest

from app.services.integrations.sheets import SheetsUnavailableError
from app.services.pipelines import clean


def test_clean_tabs_are_the_thirteen_in_scope():
    assert clean.CLEAN_TABS == (
        "Collection", "Franchise", "Series", "Media",
        "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons",
        "Manga", "Novel", "Comic", "Game",
    )


def test_read_tab_aborts_when_sheets_is_unavailable(monkeypatch):
    def boom(tab):
        raise SheetsUnavailableError("quota")

    monkeypatch.setattr(clean, "get_all_raw_rows", boom)
    with pytest.raises(clean.CleanAborted) as exc:
        clean.read_tab("Anime")
    assert "Anime" in str(exc.value)


def test_read_tab_aborts_on_a_tab_with_fewer_than_two_rows(monkeypatch):
    # An empty tab means "delete this whole table". Backup refuses to WRITE
    # one, so reading one back means something upstream is wrong.
    monkeypatch.setattr(clean, "get_all_raw_rows", lambda tab: [["system_id"]])
    with pytest.raises(clean.CleanAborted):
        clean.read_tab("Anime")


def test_read_tab_returns_rows_when_the_tab_is_healthy(monkeypatch):
    rows = [["system_id"], ["abc"]]
    monkeypatch.setattr(clean, "get_all_raw_rows", lambda tab: rows)
    assert clean.read_tab("Anime") == rows
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_scan.py -q
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.pipelines.clean'`.

(No lock needed for a single-file run that touches no database. Take the lock only for full-suite runs.)

- [ ] **Step 3: Write the minimal implementation**

```python
# app/services/pipelines/clean.py
"""
Find local rows the Google Sheet no longer mentions, and delete the ones an
admin ticks.

Pull is upsert-only, so an entry deleted on one machine survives every Pull All
on the other. This is the action that makes deletions propagate.

Read pull.py's identity rules before changing anything here: the two must agree
about what makes two rows the same row, and test_clean_matches_pull_identity
pins them together.
"""

from app.services.integrations.sheets import (
    SheetsUnavailableError,
    get_all_raw_rows,
)

# The 13 tabs in scope, in scan order: tiers, then the entry spine, then the
# nine detail tabs. Vocabulary, entity, authorization and per-user tabs are
# deliberately absent - Decision 2 in the spec.
CLEAN_TABS: tuple[str, ...] = (
    "Collection",
    "Franchise",
    "Series",
    "Media",
    "Anime",
    "Anime Movie",
    "Movies",
    "TV Shows",
    "Cartoons",
    "Manga",
    "Novel",
    "Comic",
    "Game",
)


class CleanAborted(RuntimeError):
    """
    The sheet cannot be trusted as the authority for a DELETE, so the whole
    run stops.

    Pull's policy for both of these conditions is to continue and report, which
    is right for an upsert and catastrophic here: an unreadable tab is
    indistinguishable from "everything in it is orphaned", and an empty tab
    means "delete this entire table".
    """


def read_tab(tab_name: str) -> list[list[str]]:
    """The tab's raw rows, or CleanAborted. Never an empty or partial read."""
    try:
        rows = get_all_raw_rows(tab_name)
    except SheetsUnavailableError as exc:
        raise CleanAborted(
            f"Could not read the '{tab_name}' tab, so the scan cannot tell "
            f"orphaned rows from unread ones: {exc}"
        ) from exc
    if len(rows) < 2:
        raise CleanAborted(
            f"The '{tab_name}' tab has no data rows. Backup refuses to write "
            "an empty tab, so this means the sheet is wrong, not that the "
            "table should be emptied."
        )
    return rows
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_scan.py -q
```
Expected: PASS, 4 passed.

- [ ] **Step 5: Lint, full suite, then commit**

```bash
venv/Scripts/ruff.exe check app/services/pipelines/clean.py tests/services/test_clean_scan.py
```
Then the full suite under the lock (Global Constraints). Then, in one step:

```bash
git add app/services/pipelines/clean.py tests/services/test_clean_scan.py && git commit -m "feat(clean): read the in-scope tabs, and refuse a sheet that cannot be trusted"
```

---

### Task 2: Sheet identity indexes and the candidate rule

**Files:**
- Modify: `app/services/pipelines/clean.py`
- Test: `tests/services/test_clean_scan.py`

**Interfaces:**
- Consumes: `read_tab`, `CLEAN_TABS` from Task 1.
- Produces:
  - `class SheetIndex` with fields `ids: set[str]`, `pairs: set[tuple[str, str]]`, `names: set[str]`.
  - `index_tab(rows: list[list[str]]) -> SheetIndex` — matches columns **by header name**, never by position (Backup appends link columns after the plain ones, so positions move).
  - `is_orphan_media(row, index: SheetIndex) -> bool`.

  Values are compared as **strings, stripped, case-sensitive**; `public_id` is an int locally and text in the sheet, so both sides go through `str(...).strip()`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/services/test_clean_scan.py
from types import SimpleNamespace


def _media(system_id, media_type, public_id, display_name):
    return SimpleNamespace(
        system_id=system_id,
        media_type=media_type,
        public_id=public_id,
        display_name=display_name,
    )


HEADERS = ["system_id", "media_type", "public_id", "display_name"]


def test_index_tab_reads_columns_by_header_name_not_position():
    rows = [
        ["display_name", "public_id", "media_type", "system_id"],
        ["Cowboy Bebop", "12", "anime", "uuid-1"],
    ]
    idx = clean.index_tab(rows)
    assert idx.ids == {"uuid-1"}
    assert idx.pairs == {("anime", "12")}
    assert idx.names == {"Cowboy Bebop"}


def test_row_present_by_system_id_is_not_an_orphan():
    idx = clean.index_tab([HEADERS, ["uuid-1", "anime", "12", "Cowboy Bebop"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is False


def test_renamed_entry_is_spared_by_the_public_id_pair():
    # The sheet knows it as uuid-9/"Bebop"; locally it is uuid-1/"Cowboy Bebop".
    # (media_type, public_id) round-trips across machines, so this is the same
    # entry and must NOT be deleted.
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "12", "Bebop"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is False


def test_reidentified_entry_is_spared_by_display_name():
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "77", "Cowboy Bebop"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is False


def test_public_id_pair_is_scoped_by_media_type():
    # anime #12 in the sheet must not spare manga #12 locally.
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "12", "Something"]])
    assert clean.is_orphan_media(_media("uuid-1", "manga", 12, "Other"), idx) is True


def test_row_missing_on_every_identity_is_an_orphan():
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "77", "Something Else"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is True
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_scan.py -q
```
Expected: FAIL — `AttributeError: module 'app.services.pipelines.clean' has no attribute 'index_tab'`.

- [ ] **Step 3: Write the minimal implementation**

```python
# add to app/services/pipelines/clean.py
from dataclasses import dataclass, field


def _s(value) -> str:
    """One spelling for both sides. public_id is an int locally, text in the
    sheet; a bare == between those is always False."""
    return "" if value is None else str(value).strip()


@dataclass(frozen=True)
class SheetIndex:
    """Every identity one tab's rows carry, as lookup sets."""

    ids: set[str] = field(default_factory=set)
    pairs: set[tuple[str, str]] = field(default_factory=set)
    names: set[str] = field(default_factory=set)


def index_tab(rows: list[list[str]]) -> SheetIndex:
    """
    Index a tab BY HEADER NAME.

    Never by position: Backup appends the credit and tag link columns after the
    plain ones, so a column's index moves whenever a media type gains a role.
    Pull matches by header name for the same reason.
    """
    headers = [_s(h) for h in rows[0]]
    col = {name: i for i, name in enumerate(headers)}

    def cell(row: list[str], name: str) -> str:
        i = col.get(name)
        return _s(row[i]) if i is not None and i < len(row) else ""

    ids: set[str] = set()
    pairs: set[tuple[str, str]] = set()
    names: set[str] = set()
    for row in rows[1:]:
        if not any(_s(c) for c in row):
            continue
        if sid := cell(row, "system_id"):
            ids.add(sid)
        mtype, pid = cell(row, "media_type"), cell(row, "public_id")
        if mtype and pid:
            pairs.add((mtype, pid))
        if name := cell(row, "display_name"):
            names.add(name)
    return SheetIndex(ids=ids, pairs=pairs, names=names)


def is_orphan_media(row, index: SheetIndex) -> bool:
    """
    True only when the sheet knows this media row by NONE of its identities.

    Any single hit spares it. A false negative keeps one piece of garbage for
    one more round; a false positive deletes a real entry and everything
    cascading from it - so the rule is deliberately reluctant.
    """
    if _s(row.system_id) in index.ids:
        return False
    if (_s(row.media_type), _s(row.public_id)) in index.pairs:
        return False
    if _s(row.display_name) and _s(row.display_name) in index.names:
        return False
    return True
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_scan.py -q
```
Expected: PASS, 10 passed.

- [ ] **Step 5: Lint, full suite, then commit**

```bash
venv/Scripts/ruff.exe check app/services/pipelines/clean.py tests/services/test_clean_scan.py
```
Full suite under the lock, then:

```bash
git add app/services/pipelines/clean.py tests/services/test_clean_scan.py && git commit -m "feat(clean): index a tab by header name, and spare a row any identity matches"
```

---

### Task 3: Blast radius

**Files:**
- Modify: `app/services/pipelines/clean.py`
- Test: `tests/services/test_clean_blast_radius.py`

**Interfaces:**
- Consumes: `SheetIndex` from Task 2.
- Produces: `blast_radius(db, media_row) -> dict[str, int]` with keys `credits`, `tags`, `sources`, `content_labels`, `notes`, `memes`, `quotes`, `list_rows`.

  `list_rows` is counted and reported separately because it is the one class of collateral belonging to somebody other than the operator.

- [ ] **Step 1: Write the failing test**

```python
# tests/services/test_clean_blast_radius.py
from app.services.pipelines import clean


def test_blast_radius_counts_what_the_cascade_will_take(db_session, anime_entry_with_credits):
    media_row, expected = anime_entry_with_credits
    counts = clean.blast_radius(db_session, media_row)
    assert counts["credits"] == expected["credits"]
    assert counts["list_rows"] == expected["list_rows"]


def test_blast_radius_is_zero_for_a_bare_entry(db_session, bare_anime_entry):
    counts = clean.blast_radius(db_session, bare_anime_entry)
    assert counts == {
        "credits": 0, "tags": 0, "sources": 0, "content_labels": 0,
        "notes": 0, "memes": 0, "quotes": 0, "list_rows": 0,
    }
```

Both fixtures are new and go in `tests/services/conftest.py`. `bare_anime_entry` inserts one `Media` row plus its `Anime` detail row and returns the `Media`. `anime_entry_with_credits` does the same and adds two `MediaCredit` rows and one `UserMediaList` row, returning `(media_row, {"credits": 2, "list_rows": 1})`. Copy the insert shapes from `tests/services/test_user_media_list_tab.py`, which already builds these rows.

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_blast_radius.py -q
```
Expected: FAIL — `AttributeError: ... has no attribute 'blast_radius'`.

- [ ] **Step 3: Write the minimal implementation**

```python
# add to app/services/pipelines/clean.py
from app import models


def blast_radius(db, media_row) -> dict[str, int]:
    """
    What deleting this media row will take with it.

    Every count below is a real ON DELETE CASCADE on media.system_id, so these
    rows go whether or not anyone looked at them. Ticking a box must never
    remove something the operator was not shown - that is the whole reason this
    is computed before the delete rather than reported after it.
    """
    mid = media_row.system_id

    def n(model, column="media_id") -> int:
        return db.query(model).filter(getattr(model, column) == mid).count()

    return {
        "credits": n(models.MediaCredit),
        "tags": n(models.MediaTag),
        "sources": n(models.MediaSource),
        "content_labels": n(models.MediaContentLabel),
        "notes": n(models.Note),
        "memes": n(models.Meme),
        "quotes": n(models.Quote),
        # Somebody else's status, rating and progress. Counted apart from the
        # rest because it is the only collateral that is not the operator's.
        "list_rows": n(models.UserMediaList),
    }
```

**Before writing this, verify each column name.** `media_credit`, `media_source` and `media_content_label` FK on `media.system_id`, but the attribute may be `media_id` or `entry_id` per model, and `Quote` is FK-less `(media_type, entry_id)` (`app/utils/media_resolver.py`). Read each model and adjust the `n(...)` calls; do not assume the uniform `media_id`.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_blast_radius.py -q
```
Expected: PASS, 2 passed.

- [ ] **Step 5: Lint, full suite, then commit**

```bash
git add app/services/pipelines/clean.py tests/services/conftest.py tests/services/test_clean_blast_radius.py && git commit -m "feat(clean): count what the cascade will take before offering the delete"
```

---

### Task 4: `scan_orphans` — the whole-database diff

**Files:**
- Modify: `app/services/pipelines/clean.py`
- Test: `tests/services/test_clean_scan.py`

**Interfaces:**
- Consumes: `read_tab`, `index_tab`, `is_orphan_media`, `blast_radius`.
- Produces:
  - `scan_orphans(db) -> dict` shaped `{"tabs": {tab: [candidate]}, "totals": {"candidates": int, "list_rows": int}, "last_backup_at": str | None, "anomalies": [str]}`.
  - A candidate is `{"tab", "system_id", "public_id", "media_type", "display_name", "name_en", "name_cn", "created_at", "updated_at", "blast_radius", "children"}`.

  `last_backup_at` is the `timestamp` of the newest `DataControlLog` row with `action_main == "Backup"` and `status == "Success"`, ISO-formatted, or `None`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/services/test_clean_scan.py
def test_scan_reports_a_media_row_the_sheet_has_forgotten(
    db_session, bare_anime_entry, fake_sheet
):
    fake_sheet(media_rows=[], anime_rows=[])          # the entry is gone from the sheet
    report = clean.scan_orphans(db_session)
    ids = [c["system_id"] for c in report["tabs"]["Media"]]
    assert str(bare_anime_entry.system_id) in ids
    assert report["totals"]["candidates"] >= 1


def test_scan_reports_nothing_when_the_sheet_still_has_the_entry(
    db_session, bare_anime_entry, fake_sheet
):
    fake_sheet(media_rows=[bare_anime_entry], anime_rows=[bare_anime_entry])
    report = clean.scan_orphans(db_session)
    assert report["tabs"]["Media"] == []


def test_scan_aborts_entirely_when_one_tab_is_unreadable(db_session, fake_sheet):
    # Not "skip that tab and report it" - a partial read is indistinguishable
    # from "everything in the unread tabs is orphaned".
    fake_sheet(unreadable={"Movies"})
    with pytest.raises(clean.CleanAborted):
        clean.scan_orphans(db_session)


def test_scan_carries_the_last_successful_backup_timestamp(
    db_session, bare_anime_entry, fake_sheet, backup_log_row
):
    fake_sheet(media_rows=[bare_anime_entry], anime_rows=[bare_anime_entry])
    report = clean.scan_orphans(db_session)
    assert report["last_backup_at"] == backup_log_row.timestamp.isoformat()
```

`fake_sheet` is a new fixture in `tests/services/conftest.py`: it builds a full 13-tab dict of header+row matrices (every tab must have at least 2 rows or Task 1 aborts), monkeypatches `clean.get_all_raw_rows` to serve it, and accepts `unreadable={...}` to make named tabs raise `SheetsUnavailableError`. `backup_log_row` inserts one successful `Backup` `DataControlLog` row and returns it.

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_scan.py -q
```
Expected: FAIL — `AttributeError: ... has no attribute 'scan_orphans'`.

- [ ] **Step 3: Write the minimal implementation**

```python
# add to app/services/pipelines/clean.py
from app.utils.media_resolver import MEDIA_TABLES

# Tier tab -> (model, column prefix). The prefixes are NOT uniform and are read
# from the models, not guessed.
TIER_TABS: dict[str, tuple[type, str]] = {
    "Collection": (models.Collection, "collection"),
    "Franchise": (models.Franchise, "franchise"),
    "Series": (models.Series, "series"),
}


def _last_backup_at(db) -> str | None:
    row = (
        db.query(models.DataControlLog)
        .filter(
            models.DataControlLog.action_main == "Backup",
            models.DataControlLog.status == "Success",
        )
        .order_by(models.DataControlLog.timestamp.desc())
        .first()
    )
    return row.timestamp.isoformat() if row else None


def scan_orphans(db) -> dict:
    """
    Every local row the sheet no longer mentions, with what deleting it costs.

    Read-only. Raises CleanAborted rather than returning a partial answer: a
    half-read sheet and a deleted database look identical from here.
    """
    indexes = {tab: index_tab(read_tab(tab)) for tab in CLEAN_TABS}

    tabs: dict[str, list[dict]] = {tab: [] for tab in CLEAN_TABS}
    anomalies: list[str] = []

    # Entries, found on Media and enriched from the detail tab (Decision 3a).
    for media_row in db.query(models.Media).all():
        if not is_orphan_media(media_row, indexes["Media"]):
            continue
        ref = MEDIA_TABLES.get(media_row.media_type)
        detail = (
            db.query(ref.model).filter(ref.model.system_id == media_row.system_id).first()
            if ref
            else None
        )
        tabs["Media"].append(_candidate(db, "Media", media_row, detail))

    # A detail row whose media parent is gone should be impossible - the FK is
    # ON DELETE CASCADE - so it is reported as an anomaly, never deleted here.
    for key, ref in MEDIA_TABLES.items():
        orphaned = (
            db.query(ref.model)
            .outerjoin(models.Media, models.Media.system_id == ref.model.system_id)
            .filter(models.Media.system_id.is_(None))
            .count()
        )
        if orphaned:
            anomalies.append(
                f"{ref.label}: {orphaned} detail row(s) have no media parent; "
                "the FK should have made that impossible"
            )

    for tab, (model, prefix) in TIER_TABS.items():
        for row in db.query(model).all():
            if _is_orphan_tier(row, prefix, indexes[tab]):
                tabs[tab].append(_candidate(db, tab, row, None, prefix=prefix))

    return {
        "tabs": tabs,
        "totals": {
            "candidates": sum(len(v) for v in tabs.values()),
            "list_rows": sum(
                c["blast_radius"].get("list_rows", 0)
                for v in tabs.values()
                for c in v
            ),
        },
        "last_backup_at": _last_backup_at(db),
        "anomalies": anomalies,
    }
```

Write `_is_orphan_tier(row, prefix, index)` (same reluctance as `is_orphan_media`: miss on `system_id`, on `public_id`, and on both `<prefix>_name_en` and `<prefix>_name_cn`) and `_candidate(db, tab, row, detail, prefix=None)` (assembles the dict in **Interfaces**; `blast_radius` only applies to a `Media` row, so a tier candidate gets `{}` and a `children` count of its direct children instead).

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_scan.py tests/services/test_clean_blast_radius.py -q
```
Expected: PASS.

- [ ] **Step 5: Lint, full suite, then commit**

```bash
git add app/services/pipelines/clean.py tests/services/conftest.py tests/services/test_clean_scan.py && git commit -m "feat(clean): diff the whole database against the sheet"
```

---

### Task 5: `apply_clean` — re-scan, delete, audit

**Files:**
- Modify: `app/services/pipelines/clean.py`
- Test: `tests/services/test_clean_apply.py`

**Interfaces:**
- Consumes: `scan_orphans`; `log_deleted_record` and `log_data_control` from `app/utils/data_control_utils.py`.
- Produces: `apply_clean(db, items: list[dict]) -> dict` returning `{"deleted": int, "per_tab": {tab: int}, "skipped": [{"tab", "system_id", "reason"}]}`. Each `item` is `{"tab": str, "system_id": str}`.

- [ ] **Step 1: Write the failing test**

```python
# tests/services/test_clean_apply.py
from app import models
from app.services.pipelines import clean


def test_apply_deletes_the_media_row_and_cascades_the_detail(
    db_session, bare_anime_entry, fake_sheet
):
    fake_sheet(media_rows=[], anime_rows=[])
    sid = bare_anime_entry.system_id
    result = clean.apply_clean(db_session, [{"tab": "Media", "system_id": str(sid)}])
    assert result["deleted"] == 1
    assert db_session.query(models.Media).filter(models.Media.system_id == sid).first() is None
    assert db_session.query(models.Anime).filter(models.Anime.system_id == sid).first() is None


def test_apply_skips_an_id_the_rescan_no_longer_considers_a_candidate(
    db_session, bare_anime_entry, fake_sheet
):
    # The client asks to delete a row that IS in the sheet. The set deleted
    # must be a subset of the set the server itself judged orphaned.
    fake_sheet(media_rows=[bare_anime_entry], anime_rows=[bare_anime_entry])
    sid = bare_anime_entry.system_id
    result = clean.apply_clean(db_session, [{"tab": "Media", "system_id": str(sid)}])
    assert result["deleted"] == 0
    assert result["skipped"][0]["reason"]
    assert db_session.query(models.Media).filter(models.Media.system_id == sid).first() is not None


def test_apply_writes_a_deleted_record_and_an_audit_row(
    db_session, bare_anime_entry, fake_sheet
):
    fake_sheet(media_rows=[], anime_rows=[])
    clean.apply_clean(db_session, [{"tab": "Media", "system_id": str(bare_anime_entry.system_id)}])
    assert db_session.query(models.DeletedRecord).count() == 1
    log = (
        db_session.query(models.DataControlLog)
        .filter(models.DataControlLog.action_main == "Clean")
        .one()
    )
    assert log.action_specific == "Clean Orphans"
    assert log.rows_deleted == 1


def test_apply_is_a_no_op_when_the_sheet_is_unavailable(db_session, bare_anime_entry, fake_sheet):
    fake_sheet(unreadable={"Media"})
    sid = bare_anime_entry.system_id
    try:
        clean.apply_clean(db_session, [{"tab": "Media", "system_id": str(sid)}])
    except clean.CleanAborted:
        pass
    assert db_session.query(models.Media).filter(models.Media.system_id == sid).first() is not None
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_apply.py -q
```
Expected: FAIL — `AttributeError: ... has no attribute 'apply_clean'`.

- [ ] **Step 3: Write the minimal implementation**

```python
# add to app/services/pipelines/clean.py
from app.utils.data_control_utils import log_data_control, log_deleted_record

# Child-first. franchise_id / series_id / collection_id are ON DELETE SET NULL,
# so a child that was NOT ticked survives its deleted parent as an
# orphaned-but-alive row rather than being destroyed.
_DELETE_ORDER = ("Media", "Series", "Franchise", "Collection")


def apply_clean(db, items: list[dict]) -> dict:
    """
    Delete the named rows, but only those the server itself still judges
    orphaned.

    The re-scan is the safety property: the set deleted is always a subset of
    the set reviewed. It also means a Sheets outage makes this a no-op, because
    scan_orphans raises rather than returning an empty answer.
    """
    report = scan_orphans(db)
    candidates = {
        (tab, c["system_id"]): c
        for tab, rows in report["tabs"].items()
        for c in rows
    }

    per_tab: dict[str, int] = {}
    skipped: list[dict] = []
    deleted = 0

    for tab in _DELETE_ORDER:
        for item in [i for i in items if i.get("tab") == tab]:
            key = (tab, str(item.get("system_id")))
            if key not in candidates:
                skipped.append({
                    "tab": tab,
                    "system_id": item.get("system_id"),
                    "reason": "no longer an orphan at apply time; nothing deleted",
                })
                continue
            row, entry_type = _row_and_type(db, tab, key[1])
            if row is None:
                skipped.append({
                    "tab": tab, "system_id": key[1], "reason": "already gone",
                })
                continue
            log_deleted_record(db, _detail_or(db, tab, row), entry_type)
            db.delete(row)
            deleted += 1
            per_tab[tab] = per_tab.get(tab, 0) + 1

    db.commit()
    log_data_control(
        db,
        action_main="Clean",
        action_specific="Clean Orphans",
        action_type="Manual",
        status="Success",
        rows_deleted=deleted,
        details_json=per_tab,
    )
    return {"deleted": deleted, "per_tab": per_tab, "skipped": skipped}
```

Write `_row_and_type(db, tab, system_id)` (for `Media`, load the `Media` row and derive the entry type label from `MEDIA_TABLES[row.media_type].label`, which is what `log_deleted_record`'s branches are keyed on; for a tier tab, load from `TIER_TABS`) and `_detail_or(db, tab, row)` (for `Media`, the detail row — `log_deleted_record` reads `<prefix>_name_*` off the detail, not off `media`; for a tier, `row` itself).

**Check `log_data_control`'s real signature** in `app/utils/data_control_utils.py` before writing this — it commits on its own, which is why it is called after `db.commit()` rather than before.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/services/test_clean_apply.py -q
```
Expected: PASS, 4 passed.

- [ ] **Step 5: Lint, full suite, then commit**

```bash
git add app/services/pipelines/clean.py tests/services/test_clean_apply.py && git commit -m "feat(clean): delete only what the re-scan still calls an orphan"
```

---

### Task 6: The two routes

**Files:**
- Modify: `app/routers/data_control.py`
- Test: `tests/api/test_clean_routes.py`

**Interfaces:**
- Consumes: `scan_orphans`, `apply_clean`, `CleanAborted`.
- Produces: `GET /api/data-control/clean/scan`; `POST /api/data-control/clean/apply` with body `{"items": [{"tab", "system_id"}]}`.

  Both inherit the router's `require_manage_pipelines` **and** `require_unscoped_mode`. Declare them **before** any parameterised sibling so `/clean/scan` is never captured by `/{key}`-style routes — the file already orders literals first for `/fill/all` and `/pull`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_clean_routes.py
def test_scan_returns_the_report(admin_client, bare_anime_entry, fake_sheet):
    fake_sheet(media_rows=[], anime_rows=[])
    res = admin_client.get("/api/data-control/clean/scan")
    assert res.status_code == 200
    assert "tabs" in res.json() and "last_backup_at" in res.json()


def test_scan_is_503_when_the_sheet_cannot_be_read(admin_client, fake_sheet):
    fake_sheet(unreadable={"Media"})
    assert admin_client.get("/api/data-control/clean/scan").status_code == 503


def test_apply_deletes_only_the_named_ids(admin_client, two_orphan_entries, fake_sheet):
    first, second = two_orphan_entries
    fake_sheet(media_rows=[], anime_rows=[])
    res = admin_client.post(
        "/api/data-control/clean/apply",
        json={"items": [{"tab": "Media", "system_id": str(first.system_id)}]},
    )
    assert res.status_code == 200
    assert res.json()["deleted"] == 1


def test_a_narrowed_session_is_refused_both_routes(mode_client):
    # Decision 9: the report names every orphan, so it is an unrestricted read
    # of the whole catalogue, and apply deletes by system_id.
    narrowed = mode_client("normal")
    assert narrowed.get("/api/data-control/clean/scan").status_code == 401
    assert narrowed.post(
        "/api/data-control/clean/apply", json={"items": []}
    ).status_code == 401
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/api/test_clean_routes.py -q
```
Expected: FAIL — 404 on both routes.

- [ ] **Step 3: Write the minimal implementation**

```python
# app/routers/data_control.py - with the other literal routes, before any
# parameterised sibling.
from app.services.pipelines.clean import CleanAborted, apply_clean, scan_orphans


class CleanItem(BaseModel):
    tab: str
    system_id: str


class CleanApplyBody(BaseModel):
    items: list[CleanItem]


@router.get("/clean/scan")
def clean_scan(db: Session = Depends(get_db)):
    """Every local row the sheet no longer mentions. Read-only; logs nothing."""
    try:
        return JSONResponse(content=scan_orphans(db))
    except CleanAborted as exc:
        # 503, not 500: the sheet is unavailable or untrustworthy, the request
        # was fine, and retrying later is the right advice.
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/clean/apply")
def clean_apply(body: CleanApplyBody, db: Session = Depends(get_db)):
    """Delete the ticked rows, minus any the re-scan no longer calls orphaned."""
    try:
        return JSONResponse(content=apply_clean(db, [i.model_dump() for i in body.items]))
    except CleanAborted as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
POSTGRES_DB=anime_site_test_clean venv/Scripts/python.exe -m pytest tests/api/test_clean_routes.py -q
```
Expected: PASS, 4 passed.

- [ ] **Step 5: Lint, full suite, then commit**

```bash
git add app/routers/data_control.py tests/api/test_clean_routes.py && git commit -m "feat(clean): expose scan and apply on the data-control router"
```

---

### Task 7: The review page

**Files:**
- Create: `frontend/src/pages/admin/CleanOrphans.jsx`
- Create: `frontend/src/pages/admin/CleanOrphans.test.jsx`
- Modify: `frontend/src/api/endpoints.js` (the `dataControl` block, near `checkDuplicates` at :262)
- Modify: `frontend/src/App.jsx` (route), `frontend/src/pages/admin/Admin.jsx` (one button)

**Interfaces:**
- Consumes: `GET /clean/scan`, `POST /clean/apply`.
- Produces: `endpoints.dataControl.cleanScan()` and `.cleanApply()`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/admin/CleanOrphans.test.jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CleanOrphans from "./CleanOrphans";

const report = {
  last_backup_at: "2026-09-10T10:00:00",
  totals: { candidates: 2, list_rows: 1 },
  anomalies: [],
  tabs: {
    Media: [
      { tab: "Media", system_id: "a", display_name: "Old Show",
        created_at: "2026-09-01T00:00:00", blast_radius: { list_rows: 1 } },
      { tab: "Media", system_id: "b", display_name: "Added Today",
        created_at: "2026-09-11T00:00:00", blast_radius: { list_rows: 0 } },
    ],
  },
};

describe("CleanOrphans", () => {
  it("starts with nothing selected", () => {
    render(<CleanOrphans report={report} />);
    screen.getAllByRole("checkbox").forEach((b) => expect(b.checked).toBe(false));
  });

  it("select-all skips rows created after the last backup", async () => {
    render(<CleanOrphans report={report} />);
    await screen.getByTestId("select-all-Media").click();
    expect(screen.getByTestId("row-a").checked).toBe(true);
    expect(screen.getByTestId("row-b").checked).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test:run -- CleanOrphans`
Expected: FAIL — cannot resolve `./CleanOrphans`.

- [ ] **Step 3: Write the component**

A presentational `CleanOrphans({ report })` plus a container that fetches. Requirements, all pinned by the tests above or by the spec:

- `useState` set of selected `system_id`s, initially empty.
- `newerThanBackup(candidate)` = `new Date(c.created_at) > new Date(report.last_backup_at)`; `last_backup_at === null` makes it `false`.
- Per-tab `select-all` with `data-testid={"select-all-" + tab}` adds only candidates where `!newerThanBackup(c)`.
- Each row checkbox carries `data-testid={"row-" + c.system_id}`.
- A row that is `newerThanBackup` renders a visible warning marker and stays tickable by hand.
- The last-Backup timestamp renders at the top; when `last_backup_at` is null, say so plainly rather than rendering an empty slot.
- Semantic colour tokens only (`bg-surface`, `text-text-muted`, …). A hard-coded grey utility fails `src/theme-tokens.test.js` and the build.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm run test:run -- CleanOrphans && npm run lint`
Expected: PASS.

- [ ] **Step 5: Build, then commit**

`npm run build` is **required** — `:8000` serves the prebuilt `frontend_dist/`, and skipping it makes the change appear missing on one port only.

```bash
cd frontend && npm run build
```
Then, from the repo root, in one step:

```bash
git add frontend/src/pages/admin/CleanOrphans.jsx frontend/src/pages/admin/CleanOrphans.test.jsx frontend/src/api/endpoints.js frontend/src/App.jsx frontend/src/pages/admin/Admin.jsx && git commit -m "feat(clean): review page, nothing selected by default"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/data-actions.md`, `docs/api.md`, `docs/roadmap.md`, `docs/PROGRESS.md`, `app/utils/media_resolver.py`, `docs/superpowers/specs/2026-09-11-clean-orphaned-data-design.md`

- [ ] **Step 1: Write the new Clean section in `docs/data-actions.md`**

Insert after §8 ("Check duplicates / remarks"), renumber the sections that follow (§9 audit log, §10 SSE shapes, §11 route table) and their cross-references. Cover: what Clean is for, the two refusals and why Pull's policy is the wrong one here, the identity rule, that deletion targets `media`, the blast radius, and the re-scan. Add the `app/services/pipelines/clean.py` row to the code map table at the top. Add both routes to the §11 route table.

- [ ] **Step 2: Fix the two stale lines found on the way**

In `docs/data-actions.md`, the line "All routes are admin-only: the router is declared with `dependencies=[Depends(get_current_admin)]`" is wrong — it is `require_manage_pipelines` plus `require_unscoped_mode` (`3c509dfd`). In `app/utils/media_resolver.py:5`, "eight media entry tables" is nine (`game`). Bump the `Last verified` line on every doc touched.

- [ ] **Step 3: Roadmap and progress**

Add a **Done** entry to `docs/roadmap.md`, newest first, in the house style: what changed, why it was done this way, what was deliberately not done (vocabulary and entity tabs; no freshness gate; no automatic run), and the defects found on the way (the two stale doc lines). Delete this plan's task table from `docs/PROGRESS.md` and mark the spec's phase done with its sha.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run test:run && npm run lint`, and the full backend suite under the lock. All four green.

- [ ] **Step 5: Commit**

```bash
git add docs/data-actions.md docs/api.md docs/roadmap.md app/utils/media_resolver.py docs/superpowers/specs/2026-09-11-clean-orphaned-data-design.md && git commit -m "docs(clean): document the clean action, and fix two stale lines"
```

`docs/PROGRESS.md` is staged separately with `git add -p` (own hunks only).

---

## Self-Review

**Spec coverage.** Decision 1 → Task 7 (`newerThanBackup`, select-all exclusion). Decision 2 → Task 1 (`CLEAN_TABS`). Decisions 3/3a → Task 2 and Task 4. Decision 4 → Task 5 (`_row_and_type`, cascade test). Decision 5 → Task 3. Decision 6 → Task 1, re-asserted in Tasks 4 and 5. Decision 7 → Tasks 5 and 6. Decision 8 → Task 7. Decision 9 → Task 6 (`mode_client("normal")`). Decision 10 → Task 5. Decision 11 → Global Constraints. All covered.

**Known gaps, deliberate.** Two things in the spec are *not* yet pinned by a task and must be added when reached rather than skipped: the guard test asserting Clean's identity rule agrees with `pull.py`'s for the same tabs (belongs in Task 2, and needs `DERIVED_IDENTITY_KEYS` read first), and the tier `children` count that the report shows for a `Franchise` or `Collection` with surviving children (belongs in Task 4's `_candidate`).

**Type consistency.** `scan_orphans` returns `tabs`/`totals`/`last_backup_at`/`anomalies` in Tasks 4, 5, 6 and 7 alike. `apply_clean` returns `deleted`/`per_tab`/`skipped` in Tasks 5 and 6. Candidate keys `system_id`, `display_name`, `created_at`, `blast_radius` are spelled the same in Tasks 4 and 7. `CleanAborted` is raised in Task 1 and caught in Task 6.

**Three places the plan tells the implementer to read rather than trust it**, because these are exactly the shapes that have produced defects here: the FK column names in Task 3, `log_data_control`'s signature in Task 5, and `log_deleted_record`'s entry-type labels in Task 5.
