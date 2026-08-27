# Remark Column → Remark Note Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the `remark` Text column from the ten note owners and make the singleton `remark` row in `note` its only storage, merging any text that exists in both places.

**Architecture:** Reads keep working through a read-only SQLAlchemy `column_property` on each model that selects the note row, so every response schema, detail page and check query is untouched. Writes are intercepted in the six owner routers, which pop `remark` off the payload and upsert the note row. One Alembic revision merges the existing data and drops the columns.

**Tech Stack:** FastAPI, SQLAlchemy 2.x (`column_property`, `scalar_subquery`), Alembic, PostgreSQL 17, pytest.

**Spec:** `docs/superpowers/specs/2026-08-23-remark-column-to-note-section-design.md`

## Global Constraints

- The ten owners, as `(physical table, owner_type)` — these exact strings are used in the models, the routers and the migration:

  | table | owner_type |
  | --- | --- |
  | `anime` | `anime` |
  | `anime_movies` | `anime-movie` |
  | `movies` | `movie` |
  | `tv_shows` | `tv-show` |
  | `cartoons` | `cartoon` |
  | `manga` | `manga` |
  | `novel` | `novel` |
  | `series` | `series` |
  | `franchise` | `franchise` |
  | `collection` | `collection` |

  `owner_type` values come from `OWNER_TABLES` in `app/utils/media_resolver.py` and are hyphenated. `MEDIA_REGISTRY` in `app/registry.py` keys the same types with underscores (`tv_show`). Never use one where the other belongs.
- The `remark` columns on `quote`, `meme`, `watch_order_list` and `media_relation` are those entities' own fields. **Do not touch them**, and do not touch `parse_quote_from_sheet`, `parse_meme_from_sheet`, `parse_watch_order_list_from_sheet` or `parse_media_relation_from_sheet`.
- The merge label is exactly `original remark:` on its own line, preceded by a blank line. Only applied when a note row already exists.
- Empty or whitespace-only remark text means *no row*, not a row with blank content.
- API tests need PostgreSQL running and the `anime_site_test` database (see `tests/api/conftest.py`). Run tests with `venv/Scripts/python.exe -m pytest`.
- Other Claude Code sessions may be editing this working tree. Stage only the files each task names; never `git add -A`.

---

### Task 1: The `remark_field` write-through service

The one piece of new logic: splitting `remark` out of a write payload and landing it on the note row. Nothing calls it yet, so the suite stays green.

**Files:**
- Create: `app/services/domain/remark_field.py`
- Modify: `app/services/domain/__init__.py`
- Test: `tests/unit/test_remark_field.py` (create), `tests/api/test_remark_field.py` (create)

**Interfaces:**
- Consumes: `app.models.Note`, `app.database.get_taipei_now`
- Produces:
  - `pop_remark(data: dict) -> tuple[dict, str | None, bool]` — returns `(payload_without_remark, value, was_present)`
  - `upsert_remark(db: Session, owner_type: str, owner_id, text: str | None) -> None`
  - `REMARK_SECTION: str = "remark"`

- [ ] **Step 1: Write the failing pure-function tests**

Create `tests/unit/test_remark_field.py`:

```python
"""Unit tests for the remark write-through helpers."""

from app.services.domain.remark_field import pop_remark


def test_pop_remark_splits_the_value_out():
    rest, value, present = pop_remark({"anime_name_en": "X", "remark": "重看第三次"})
    assert rest == {"anime_name_en": "X"}
    assert value == "重看第三次"
    assert present is True


def test_pop_remark_reports_an_absent_key():
    rest, value, present = pop_remark({"anime_name_en": "X"})
    assert rest == {"anime_name_en": "X"}
    assert value is None
    assert present is False


def test_pop_remark_distinguishes_an_explicit_none_from_absence():
    # A PUT that clears the remark sends null; a PATCH that never mentions it
    # sends nothing. They must not be the same thing.
    _, value, present = pop_remark({"remark": None})
    assert value is None
    assert present is True


def test_pop_remark_does_not_mutate_its_input():
    original = {"remark": "x", "manga_name_en": "Y"}
    pop_remark(original)
    assert original == {"remark": "x", "manga_name_en": "Y"}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_remark_field.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.domain.remark_field'`

- [ ] **Step 3: Write the module**

Create `app/services/domain/remark_field.py`:

```python
"""
Write-through for the `remark` field.

`remark` is no longer a column on the ten owner tables: it is the singleton
`remark` row in `note`. The Add form, the Modify form and the hub RemarkModal
still post a plain `remark` string to the owner's own endpoint, so every write
path pops it out of the payload and lands it here instead.

Reads go the other way, through the `remark` column_property attached in
app/models/__init__.py. That property is read-only by construction, which is
why assigning to it must never be attempted.
"""

import uuid
from typing import Any, Optional, Tuple

from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import Note

REMARK_SECTION = "remark"


def pop_remark(data: dict) -> Tuple[dict, Optional[str], bool]:
    """
    Split `remark` out of a write payload.

    Returns the payload without it, its value, and whether the key was present
    at all. The third value matters: a PATCH that never mentions `remark` must
    leave the note row alone, while a PUT that sends null must clear it.
    """
    if "remark" not in data:
        return data, None, False
    rest = {k: v for k, v in data.items() if k != "remark"}
    return rest, data["remark"], True


def upsert_remark(
    db: Session, owner_type: str, owner_id: Any, text: Optional[str]
) -> None:
    """
    Create, update or clear one owner's singleton remark note.

    Empty or whitespace-only text deletes the row rather than storing a blank
    one, so a cleared remark leaves no empty section on the notes page. The
    text itself is stored as typed - only the emptiness test is stripped.
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
        )
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_remark_field.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Write the failing database tests**

Create `tests/api/test_remark_field.py`:

```python
"""
Database tests for the remark write-through.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models
from app.services.domain.remark_field import upsert_remark


def _rows(db_session, owner_type, owner_id):
    return (
        db_session.query(models.Note)
        .filter(
            models.Note.owner_type == owner_type,
            models.Note.owner_id == owner_id,
            models.Note.section == "remark",
        )
        .all()
    )


def test_upsert_creates_the_singleton_row(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, "重看第三次")
    db_session.flush()

    rows = _rows(db_session, "anime", sample_anime.system_id)
    assert len(rows) == 1
    assert rows[0].content == "重看第三次"
    assert rows[0].sort_index == 0.0


def test_upsert_updates_rather_than_duplicating(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, "first")
    db_session.flush()
    upsert_remark(db_session, "anime", sample_anime.system_id, "second")
    db_session.flush()

    rows = _rows(db_session, "anime", sample_anime.system_id)
    assert len(rows) == 1
    assert rows[0].content == "second"


def test_upsert_with_empty_text_deletes_the_row(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, "gone soon")
    db_session.flush()
    upsert_remark(db_session, "anime", sample_anime.system_id, "   ")
    db_session.flush()

    assert _rows(db_session, "anime", sample_anime.system_id) == []


def test_upsert_with_empty_text_and_no_row_is_a_no_op(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, None)
    db_session.flush()

    assert _rows(db_session, "anime", sample_anime.system_id) == []


def test_upsert_stores_the_text_as_typed(db_session, sample_franchise):
    # Only the emptiness check strips; internal and trailing shape is the
    # user's, not ours.
    upsert_remark(db_session, "franchise", sample_franchise.system_id, "line 1\n\nline 2\n")
    db_session.flush()

    rows = _rows(db_session, "franchise", sample_franchise.system_id)
    assert rows[0].content == "line 1\n\nline 2\n"


def test_upsert_keeps_owners_apart(db_session, sample_anime, sample_franchise):
    upsert_remark(db_session, "anime", sample_anime.system_id, "on the anime")
    upsert_remark(db_session, "franchise", sample_franchise.system_id, "on the franchise")
    db_session.flush()

    assert _rows(db_session, "anime", sample_anime.system_id)[0].content == "on the anime"
    assert (
        _rows(db_session, "franchise", sample_franchise.system_id)[0].content
        == "on the franchise"
    )


def test_upsert_leaves_other_sections_alone(db_session, sample_anime):
    other = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="advantages",
        content="敘事結構精巧",
        sort_index=0.0,
    )
    db_session.add(other)
    db_session.flush()

    upsert_remark(db_session, "anime", sample_anime.system_id, "")
    db_session.flush()

    assert db_session.query(models.Note).filter(
        models.Note.section == "advantages"
    ).count() == 1
```

- [ ] **Step 6: Run the database tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_remark_field.py -v`
Expected: PASS (7 passed). The module from Step 3 already satisfies them; if PostgreSQL is not running, start it before continuing rather than skipping.

- [ ] **Step 7: Export the helpers from the domain package**

In `app/services/domain/__init__.py`, next to the existing `remarks` import at line 52:

```python
from app.services.domain.remark_field import (
    REMARK_SECTION,
    pop_remark,
    upsert_remark,
)
```

and add `"REMARK_SECTION"`, `"pop_remark"`, `"upsert_remark"` to `__all__` beside the existing `"find_all_remarks"` entry.

- [ ] **Step 8: Run the full unit suite**

Run: `venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS except the pre-existing `test_jikan_utils.py::TestMapJikanToAnimeData::test_full_response_mapped_correctly` failure (`release_year` is None), which is unrelated to this work and was failing before it started.

- [ ] **Step 9: Commit**

```bash
git add app/services/domain/remark_field.py app/services/domain/__init__.py tests/unit/test_remark_field.py tests/api/test_remark_field.py
git commit -m "feat(remark): add the remark note write-through helpers"
```

---

### Task 2: Swap the storage — models, routers, sheet parsers

The whole storage swap lands in one commit. It cannot be split: the moment the `remark` Column becomes a `column_property`, every write path that assigns to it raises, and the moment writes stop touching the column, reads that still come from it go blank. Test fixtures build the schema from the models (`Base.metadata.create_all` in `tests/api/conftest.py`), so the test database follows the models immediately — no migration is involved in the test run.

**Files:**
- Modify: `app/models/anime.py:106`, `app/models/anime_movie.py:77`, `app/models/movie.py:66`, `app/models/tv_show.py:68`, `app/models/cartoon.py:69`, `app/models/manga.py:87`, `app/models/novel.py:93`, `app/models/franchise.py:62` and `:126`, `app/models/collection.py:67` — delete the `remark` Column
- Modify: `app/models/__init__.py` — attach the ten `column_property` declarations
- Modify: `app/registry.py:38-57` (add `owner_type` to `MediaTypeSpec`) and its five spec entries
- Modify: `app/routers/_factory.py`, `app/routers/anime.py`, `app/routers/anime_movie.py`, `app/routers/franchise.py`, `app/routers/series.py`, `app/routers/collection.py`
- Modify: `app/utils/formatter.py` lines 248, 283, 321, 382, 424, 460, 497, 535, 587, 643 — delete the ten `"remark"` parser entries
- Test: `tests/api/test_remark_writethrough.py` (create), `tests/unit/test_formatter_collection.py:88-99`, `tests/unit/test_formatter_series.py:16-20`

**Interfaces:**
- Consumes: `pop_remark`, `upsert_remark`, `REMARK_SECTION` from Task 1
- Produces: `MediaTypeSpec.owner_type: str` — the hyphenated `OWNER_TABLES` key for each factory-built type; `<Model>.remark` as a read-only mapped attribute on all ten models

- [ ] **Step 1: Write the failing write-through API tests**

Create `tests/api/test_remark_writethrough.py`:

```python
"""
The remark field is stored as a note row, not a column, but every surface that
wrote it before still writes it the same way.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


def _remark_rows(db_session, owner_type, owner_id):
    return (
        db_session.query(models.Note)
        .filter(
            models.Note.owner_type == owner_type,
            models.Note.owner_id == owner_id,
            models.Note.section == "remark",
        )
        .all()
    )


def test_patching_an_anime_remark_creates_one_note_row(
    admin_client, db_session, sample_anime
):
    res = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "重看第三次"}
    )
    assert res.status_code == 200
    assert res.json()["remark"] == "重看第三次"
    assert len(_remark_rows(db_session, "anime", sample_anime.system_id)) == 1


def test_patching_without_remark_leaves_the_note_alone(
    admin_client, db_session, sample_anime
):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "keep me"}
    )
    res = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"ep_fin": 5}
    )
    assert res.status_code == 200
    assert res.json()["remark"] == "keep me"


def test_patching_an_empty_remark_clears_the_note(
    admin_client, db_session, sample_anime
):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "temporary"}
    )
    res = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": ""}
    )
    assert res.status_code == 200
    assert res.json()["remark"] is None
    assert _remark_rows(db_session, "anime", sample_anime.system_id) == []


def test_a_notes_page_edit_shows_up_on_the_entry(
    admin_client, db_session, sample_anime
):
    # The notes page posts to /api/notes; the entry response must read the
    # same row back.
    res = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "remark",
            "content": "written on the notes page",
        },
    )
    assert res.status_code == 201

    entry = admin_client.get(f"/api/anime/{sample_anime.system_id}")
    assert entry.json()["remark"] == "written on the notes page"


def test_creating_a_movie_with_a_remark_makes_exactly_one_row(
    admin_client, db_session, sample_franchise
):
    res = admin_client.post(
        "/api/movies",
        json={
            "movie_name_en": "Remarked Movie",
            "franchise_id": str(sample_franchise.system_id),
            "remark": "from the Add form",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["remark"] == "from the Add form"
    assert len(_remark_rows(db_session, "movie", uuid.UUID(body["system_id"]))) == 1


def test_creating_a_collection_with_a_remark_makes_exactly_one_row(
    admin_client, db_session
):
    res = admin_client.post(
        "/api/collection",
        json={"collection_name_en": "Remarked Collection", "remark": "hub remark"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["remark"] == "hub remark"
    assert len(_remark_rows(db_session, "collection", uuid.UUID(body["system_id"]))) == 1


def test_the_review_queue_still_finds_remarks(admin_client, db_session, sample_anime):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "needs a rewatch"}
    )
    res = admin_client.get("/api/data-control/check/remarks")
    assert res.status_code == 200
    remarks = [e["remark"] for e in res.json()["anime"]]
    assert "needs a rewatch" in remarks


def test_the_entry_list_carries_the_remark(admin_client, db_session, sample_anime):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "on the list too"}
    )
    res = admin_client.get("/api/anime/")
    assert res.status_code == 200
    got = [e for e in res.json() if e["system_id"] == str(sample_anime.system_id)]
    assert got and got[0]["remark"] == "on the list too"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_remark_writethrough.py -v`
Expected: FAIL. `test_a_notes_page_edit_shows_up_on_the_entry` fails with `assert None == 'written on the notes page'` — the entry reads the column, which the notes API never touches. That is the exact bug this task closes.

- [ ] **Step 3: Delete the ten `remark` Column declarations**

Remove this single line from each model file (`app/models/franchise.py` has two, one in `Franchise` at line 62 and one in `Series` at line 126 — remove both):

```python
    remark = Column(Text, nullable=True)
```

Files: `anime.py`, `anime_movie.py`, `movie.py`, `tv_show.py`, `cartoon.py`, `manga.py`, `novel.py`, `franchise.py` (×2), `collection.py`.

Do not remove the `Text` import from those modules without checking whether other columns still use it.

- [ ] **Step 4: Attach the read-only properties**

At the end of `app/models/__init__.py`, after the `__all__` list:

```python
# ---------------------------------------------------------------------------
# `remark`, read side
# ---------------------------------------------------------------------------
# `remark` used to be a Text column on each of these ten tables. It is now the
# singleton `remark` row in `note`, and this maps it back onto every owner so
# the response schemas, the ten detail pages, Delete.jsx's previews and
# find_all_remarks keep reading a plain attribute.
#
# Read-only by construction: assigning to it raises, which is deliberate. Every
# write goes through app.services.domain.remark_field.upsert_remark. Attached
# here, after all models are imported, so the ten declarations sit together and
# no model module has to import Note.
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import column_property  # noqa: E402

_REMARK_OWNERS = (
    (Anime, "anime"),
    (AnimeMovies, "anime-movie"),
    (Movies, "movie"),
    (TVShows, "tv-show"),
    (Cartoon, "cartoon"),
    (Manga, "manga"),
    (Novel, "novel"),
    (Series, "series"),
    (Franchise, "franchise"),
    (Collection, "collection"),
)

for _model, _owner_type in _REMARK_OWNERS:
    _model.remark = column_property(
        select(Note.content)
        .where(
            Note.owner_type == _owner_type,
            Note.owner_id == _model.system_id,
            Note.section == "remark",
        )
        .correlate_except(Note)
        .scalar_subquery()
    )
```

- [ ] **Step 5: Give the registry an owner_type**

In `app/registry.py`, add a field to `MediaTypeSpec` after `key` (line 41):

```python
    # The hyphenated OWNER_TABLES key, which differs from `key` for tv_show.
    # Notes and remarks are addressed by this, never by `key`.
    owner_type: str
```

Then add it to all five spec entries: `owner_type="movie"`, `owner_type="tv-show"`, `owner_type="cartoon"`, `owner_type="manga"`, `owner_type="novel"`.

- [ ] **Step 6: Add a guard test for the mapping**

Append to `tests/unit/test_media_resolver.py`:

```python
def test_every_registry_spec_names_a_real_owner_type():
    from app.registry import MEDIA_REGISTRY
    from app.utils.media_resolver import OWNER_TABLES

    for key, spec in MEDIA_REGISTRY.items():
        assert spec.owner_type in OWNER_TABLES, (
            f"{key} declares owner_type {spec.owner_type!r}, which is not an owner"
        )
```

- [ ] **Step 7: Route the factory's writes through the note row**

In `app/routers/_factory.py`, import at the top:

```python
from app.services.domain import pop_remark, upsert_remark
```

In `create` (line 66), replace `entry = spec.model(**data.model_dump())` with:

```python
        payload, remark, has_remark = pop_remark(data.model_dump())
        entry = spec.model(**payload)
```

and after the final `db.refresh(entry)`, before `return entry`:

```python
        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)
            db.commit()
            db.refresh(entry)
```

In `update` (line 85), replace the loop header:

```python
        payload, remark, has_remark = pop_remark(data.model_dump(exclude_unset=True))
        for key, value in payload.items():
            setattr(entry, key, value)
        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)
```

In `patch` (line 108):

```python
        payload, remark, has_remark = pop_remark(payload)
        for key, value in payload.items():
            if hasattr(entry, key):
                setattr(entry, key, value)
        if has_remark:
            upsert_remark(db, spec.owner_type, entry.system_id, remark)
```

The `hasattr` guard in `patch` is why popping first is mandatory: `hasattr` is True for a `column_property`, so `setattr` would be reached and would raise.

- [ ] **Step 8: Do the same in the five hand-written routers**

Each gets `from app.services.domain import pop_remark, upsert_remark` at the top, and the three handlers get the same treatment with that router's own owner_type and entry variable:

`app/routers/anime.py` — owner_type `"anime"`, entry `new_anime` / `db_anime`:

```python
# create_anime_entry (line 118)
payload, remark, has_remark = pop_remark(anime_in.model_dump())
new_anime = models.Anime(**payload)
# ...and after the final db.refresh(new_anime):
if has_remark:
    upsert_remark(db, "anime", new_anime.system_id, remark)
    db.commit()
    db.refresh(new_anime)

# update_anime_entry (line 166)
update_data, remark, has_remark = pop_remark(anime_in.model_dump(exclude_unset=True))
for key, value in update_data.items():
    setattr(db_anime, key, value)
if has_remark:
    upsert_remark(db, "anime", db_anime.system_id, remark)

# patch_anime_entry (line 215)
payload, remark, has_remark = pop_remark(payload)
for key, value in payload.items():
    if hasattr(db_anime, key):
        setattr(db_anime, key, value)
if has_remark:
    upsert_remark(db, "anime", db_anime.system_id, remark)
```

`app/routers/anime_movie.py` — owner_type `"anime-movie"`, entry `new_entry` / `entry`, at lines 97, 129 and 165.

`app/routers/franchise.py` — owner_type `"franchise"`, entry `db_franchise`, at lines 102, 141 and 172. Its create builds from `data = payload.model_dump(exclude_unset=True)`, so pop from `data` and upsert after the commit that gives the row its id.

`app/routers/series.py` — owner_type `"series"`, entry `new_series` / `db_series`, at lines 99, 129 and 161.

`app/routers/collection.py` — owner_type `"collection"`, entry `db_collection`, at lines 100, 141 and 174. Same create shape as franchise.

In every create, the upsert must run **after** the entry has been flushed or committed, because the note row stores the owner's `system_id`.

- [ ] **Step 9: Strip remark from the ten sheet parsers**

In `app/utils/formatter.py`, delete this line from each of the ten owner parsers — lines 248, 283, 321, 382, 424, 460, 497, 535, 587 and 643:

```python
        "remark": parse_from_sheet(raw.get("remark"), str),
```

This is required, not cosmetic: `app/services/pipelines/pull.py:619` does `Model(**clean_header_dict)` and line 615 does `setattr(existing, key, value)`, either of which raises once `remark` is read-only.

**Leave lines 168, 219, 702 and 730 alone** — those are `watch_order_list`, `media_relation`, `quote` and `meme`, which keep their own remark columns.

- [ ] **Step 10: Update the two formatter tests that assert the old behaviour**

In `tests/unit/test_formatter_collection.py`, the case at lines 88-99 feeds `"remark": "note"` and asserts `parsed["remark"] == "note"`. Replace that assertion with:

```python
        # remark is no longer a collection column: it lives in the Note tab.
        assert "remark" not in parsed
```

In `tests/unit/test_formatter_series.py`, replace `test_remark_key_is_emitted` and `test_remark_value_is_parsed` (lines 16-20) with:

```python
    def test_remark_key_is_not_emitted(self):
        # Series remarks are note rows now, so the Series tab has no such
        # column and the parser must not invent one - pull.py would try to
        # assign it to a read-only attribute.
        assert "remark" not in parse_series_from_sheet({"remark": "ignored"})
```

Update the module docstring at line 4, which currently says the tests cover "plus `remark`".

- [ ] **Step 11: Run the new tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_remark_writethrough.py -v`
Expected: PASS (8 passed)

- [ ] **Step 12: Run the whole suite**

Run: `venv/Scripts/python.exe -m pytest -q`
Expected: PASS except the pre-existing `test_jikan_utils.py` `release_year` failure. Pay attention to `tests/api/test_collection.py:77` and `tests/api/test_series.py:54-64` — both POST a remark and assert the response echoes it, and they are now end-to-end proof of the write-through. If either fails, the create handler is upserting before the row has an id.

- [ ] **Step 13: Commit**

```bash
git add app/models/ app/registry.py app/routers/_factory.py app/routers/anime.py app/routers/anime_movie.py app/routers/franchise.py app/routers/series.py app/routers/collection.py app/utils/formatter.py tests/api/test_remark_writethrough.py tests/unit/test_formatter_collection.py tests/unit/test_formatter_series.py tests/unit/test_media_resolver.py
git commit -m "feat(remark): store remark as a note row instead of a column"
```

---

### Task 3: The migration

Moves the live data and drops the columns. Nothing in the test suite runs migrations — `tests/api/conftest.py` builds the schema with `create_all` — so this task is verified by hand against the local PostgreSQL 17 development database.

**Files:**
- Create: `alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (raw SQL only, no app imports — migrations must stay frozen while app code moves)
- Produces: revision id `r1e2m3a4r5k6_remark_column_to_note`, `down_revision = "media_relation_drop_legacy"` (the current head)

- [ ] **Step 1: Write the revision**

Create `alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py`:

```python
"""fold the remark column into the remark note section

Revision ID: r1e2m3a4r5k6_remark_column_to_note
Revises: media_relation_drop_legacy
Create Date: 2026-08-23 00:00:00.000000

`remark` lived in two places at once: a Text column on each of the ten owner
tables, and the singleton `remark` row in `note`. Text written on the notes
page and text written in the Modify form landed in different places and no view
showed both. This merges them into the note row and drops the columns.

Where an owner has both, the column's text is appended under an
`original remark:` label so it can be reconciled by hand afterwards. Where only
the column has text, it becomes the note content unlabelled.

Downgrade restores the columns and copies the note content back, then deletes
every remark note row. It is deliberately asymmetric: a merged remark returns
as one blob, label included. A pre-migration Google Sheets backup will NOT
restore this data either - the ten media tabs lose their remark column here, so
this revision is the authority for the move.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "r1e2m3a4r5k6_remark_column_to_note"
down_revision: Union[str, Sequence[str], None] = "media_relation_drop_legacy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (physical table, owner_type). owner_type is the hyphenated OWNER_TABLES key
# from app/utils/media_resolver.py, spelled out rather than imported: a
# migration must not move when app code does.
OWNERS = (
    ("anime", "anime"),
    ("anime_movies", "anime-movie"),
    ("movies", "movie"),
    ("tv_shows", "tv-show"),
    ("cartoons", "cartoon"),
    ("manga", "manga"),
    ("novel", "novel"),
    ("series", "series"),
    ("franchise", "franchise"),
    ("collection", "collection"),
)


def upgrade() -> None:
    # 0. Fold away any pre-existing duplicate remark notes, oldest row wins.
    #    The notes API rejects a second singleton, but the Pull pipeline inserts
    #    Note rows straight from the sheet with no such guard, so duplicates are
    #    possible in live data. They must go before the unique index below, and
    #    before the per-table merge, which would otherwise append the column's
    #    text to every duplicate.
    op.execute(
        """
        WITH ordered AS (
            SELECT system_id, owner_type, owner_id, content,
                   row_number() OVER (PARTITION BY owner_type, owner_id
                                      ORDER BY created_at, system_id) AS rn
              FROM note
             WHERE section = 'remark'
        ),
        survivors AS (SELECT * FROM ordered WHERE rn = 1),
        extras AS (
            SELECT owner_type, owner_id,
                   string_agg(content, E'

' ORDER BY rn) AS extra
              FROM ordered
             WHERE rn > 1
             GROUP BY owner_type, owner_id
        )
        UPDATE note n
           SET content = COALESCE(n.content, '') || E'

' || e.extra,
               updated_at = now()
          FROM survivors s, extras e
         WHERE n.system_id = s.system_id
           AND s.owner_type = e.owner_type
           AND s.owner_id = e.owner_id
        """
    )
    op.execute(
        """
        DELETE FROM note
         WHERE system_id IN (
            SELECT system_id FROM (
                SELECT system_id,
                       row_number() OVER (PARTITION BY owner_type, owner_id
                                          ORDER BY created_at, system_id) AS rn
                  FROM note
                 WHERE section = 'remark'
            ) ranked
            WHERE rn > 1
         )
        """
    )

    for table, owner_type in OWNERS:
        # 1. Owners that already have a remark note: append the column's text
        #    under a label. Runs first; step 2's NOT EXISTS then skips these.
        op.execute(
            f"""
            UPDATE note n
               SET content = COALESCE(n.content, '')
                             || E'\\n\\noriginal remark:\\n'
                             || t.remark,
                   updated_at = now()
              FROM {table} t
             WHERE n.owner_type = '{owner_type}'
               AND n.owner_id = t.system_id
               AND n.section = 'remark'
               AND t.remark IS NOT NULL
               AND btrim(t.remark) <> ''
            """
        )

        # 2. Owners with no remark note yet: the column's text becomes one,
        #    unlabelled - there is nothing to distinguish it from.
        op.execute(
            f"""
            INSERT INTO note (system_id, owner_type, owner_id, section,
                              content, sort_index, created_at, updated_at)
            SELECT gen_random_uuid(), '{owner_type}', t.system_id, 'remark',
                   t.remark, 0, now(), now()
              FROM {table} t
             WHERE t.remark IS NOT NULL
               AND btrim(t.remark) <> ''
               AND NOT EXISTS (
                   SELECT 1 FROM note n
                    WHERE n.owner_type = '{owner_type}'
                      AND n.owner_id = t.system_id
                      AND n.section = 'remark'
               )
            """
        )

        op.execute(f"ALTER TABLE {table} DROP COLUMN remark")

    # A second remark row for one owner would make the read-side scalar
    # subquery in app/models/__init__.py raise "more than one row returned by a
    # subquery used as an expression" on EVERY read of that entity - the detail
    # page, the list page and check/remarks all break rather than degrade. The
    # singleton rule was only advisory before; now it is load-bearing, so the
    # database enforces it.
    op.execute(
        "CREATE UNIQUE INDEX ix_note_one_remark_per_owner "
        "ON note (owner_type, owner_id) WHERE section = 'remark'"
    )


def downgrade() -> None:
    """Restore the columns from the note rows, then drop those rows."""
    op.execute("DROP INDEX IF EXISTS ix_note_one_remark_per_owner")
    for table, owner_type in OWNERS:
        op.execute(f"ALTER TABLE {table} ADD COLUMN remark TEXT")
        op.execute(
            f"""
            UPDATE {table} t
               SET remark = n.content
              FROM note n
             WHERE n.owner_type = '{owner_type}'
               AND n.owner_id = t.system_id
               AND n.section = 'remark'
            """
        )
        op.execute(
            f"DELETE FROM note WHERE owner_type = '{owner_type}' "
            "AND section = 'remark'"
        )
```

`gen_random_uuid()` is built into PostgreSQL 13+, so no extension is needed on either the local DB or Cloud SQL.

- [ ] **Step 2: Seed a both-populated row on the local development database**

The dev DB still has the columns at this point (the model change in Task 2 leaves them unmapped, not dropped). Seed one owner with text in both places, using an anime that already exists:

```bash
psql -U postgres -d anime_site_db -c "UPDATE anime SET remark = 'column text' WHERE system_id = (SELECT system_id FROM anime LIMIT 1);"
psql -U postgres -d anime_site_db -c "INSERT INTO note (system_id, owner_type, owner_id, section, content, sort_index, created_at, updated_at) SELECT gen_random_uuid(), 'anime', system_id, 'remark', 'note text', 0, now(), now() FROM anime WHERE remark = 'column text';"
```

- [ ] **Step 3: Run the migration**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Expected: no errors.

- [ ] **Step 4: Verify the merge and the drop**

```bash
psql -U postgres -d anime_site_db -c "SELECT content FROM note WHERE section = 'remark' AND content LIKE '%original remark%';"
psql -U postgres -d anime_site_db -c "\d anime"
```

Expected: the first prints exactly

```
note text

original remark:
column text
```

and the second shows no `remark` column. Spot-check `\d franchise` and `\d collection` too.

- [ ] **Step 4b: Verify the singleton index exists and bites**

```bash
psql -U postgres -d anime_site_db -c "\di ix_note_one_remark_per_owner"
psql -U postgres -d anime_site_db -c "INSERT INTO note (system_id, owner_type, owner_id, section, content, sort_index, created_at, updated_at) SELECT gen_random_uuid(), 'anime', owner_id, 'remark', 'duplicate', 0, now(), now() FROM note WHERE section = 'remark' AND owner_type = 'anime' LIMIT 1;"
```

Expected: the index is listed, and the INSERT is REJECTED with a unique-violation error. A successful insert means the index is missing and the read path is unprotected.

- [ ] **Step 5: Verify the downgrade round-trips**

```bash
venv/Scripts/python.exe -m alembic downgrade -1
psql -U postgres -d anime_site_db -c "\d anime"
psql -U postgres -d anime_site_db -c "SELECT count(*) FROM note WHERE section = 'remark';"
```

Expected: the `remark` column is back on `anime` holding the merged blob, and the remark note count is 0.

- [ ] **Step 6: Upgrade again and leave the DB on head**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Expected: no errors, columns gone again.

- [ ] **Step 7: Start the app and confirm it reads**

```bash
uvicorn app.main:app --reload
```

Open `http://localhost:8000/api/anime/` and confirm the seeded entry's `remark` shows the merged text. This is the first end-to-end proof that the `column_property` reads a real dropped-column database rather than a `create_all` test schema.

- [ ] **Step 8: Commit**

```bash
git add alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py
git commit -m "feat(remark): migrate the remark columns into note rows and drop them"
```

---

### Task 4: Documentation

**Files:**
- Modify: `docs/database-schema.md`, `docs/business-logic.md`, `docs/reusable-elements.md`, `docs/admin-forms.md`

- [ ] **Step 1: Find every place the docs describe remark as a column**

Run: `grep -rn "remark" docs/*.md`

- [ ] **Step 2: Rewrite those passages**

Three facts to land, wherever the docs currently say otherwise:

1. `remark` is not a column on any of the ten owner tables. It is the singleton `remark` row in `note`, exposed on each model as a read-only `column_property`.
2. The Add form, the Modify form and the hub `RemarkModal` still send `remark` on the owner's own endpoint; the routers write it through to the note row. Two surfaces edit one row and last write wins.
3. The ten Google Sheets media/tier tabs no longer carry a remark column. Remarks back up and restore through the `Note` tab.

`docs/common-points-of-confusion` material in `CLAUDE.md` says "Remark column is different from remark field in notes column" — that distinction is now gone. Flag it to the user rather than editing `CLAUDE.md` unasked.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(remark): describe remark as a note row rather than a column"
```

---

## Notes on what is deliberately NOT here

- **No frontend task.** No file under `frontend/src/` changes: `fieldMeta`, `formFactories`, `payloads.js`, the twenty add/modify tabs, the ten detail pages, `RemarkModal`, `ReviewQueue` and `Delete.jsx` all keep working through the write-through. Since nothing changes there, `npm run build` is not required — but a click through one hub page, one detail page, the Modify form and the review queue is worth doing after Task 3.
- **No unit test for the merge string.** The spec listed one, but the merge is SQL inside the revision, and a Python helper duplicating it would test the copy rather than the thing that runs. Task 3 Step 4 asserts the exact merged text against a real database instead.
