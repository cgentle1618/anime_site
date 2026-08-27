# Series Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Series tier up to Franchise's structural level — eight new columns, full admin forms, and a real detail page at `/series/:system_id`.

**Architecture:** Series already has full CRUD (`app/routers/series.py`), and every entry list endpoint already accepts `?series_id=`. So the backend work is almost entirely declarative: widen the model, widen the Pydantic schemas, widen the sheet parser. The frontend work is a new `SeriesPage.jsx` modelled on `FranchisePage.jsx`, plus retiring `SeriesModal.jsx` in favour of links.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + PostgreSQL; React 19 + Vite + Tailwind v4; pytest (backend), vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-08-23-series-structure-design.md`

## Global Constraints

- **Concurrent sessions.** Other Claude Code sessions edit this working tree on this branch. Never `git add -A` or `git commit -a`. Stage only the exact files each task names. Re-read a file if an edit fails to match. Never run `git checkout --`, `git restore`, `git stash`, or `git reset`. `docs/database-schema.md` in particular was already modified by another session at plan time — check its diff before staging it.
- **Do not commit or push without the user's explicit approval.** Each task's commit step shows the message; run it only when the user says so.
- **Backend tests must use the venv Python:** `venv/Scripts/python -m pytest ...`. System Python will not work.
- **API tests need PostgreSQL** on the `anime_site_test` database (`docker-compose up -d`; `createdb -U postgres anime_site_test` once).
- **`anime_movie` has no `series_id` column.** It is excluded from every series query, dropdown, and tab in this plan. Do not add it.
- **Column declaration order in `app/models/franchise.py` is the Google Sheets column order** — `format_model_for_sheet` iterates `__table__.columns`. Declare the new columns in exactly the positions this plan specifies.
- **Excluded from Series, deliberately:** `franchise_type`, `collection_id`, `type_covers`, `type_slots`, `watch_next_group`. Do not add them.
- **Phase 2 is out of scope:** Search, a Series Library page, and Statistics are deferred. Do not touch `Search.jsx`, `pages/library/`, or `StatsFranchiseSummary.jsx`.

---

### Task 1: Series model columns + migration

**Files:**
- Modify: `app/models/franchise.py:87-125` (the `Series` class)
- Create: `alembic/versions/s1e2r3i4e5s6_expand_series_columns.py`
- Test: `tests/unit/test_series_model.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `models.Series` with columns `series_name_roman`, `series_name_jp`, `my_rating`, `series_expectation`, `cover_entry_id`, `to_rewatch`, `created_at`, `updated_at`; `Series.display_name -> str`; `Series.names_dict -> dict` with keys `en`, `cn`, `roman`, `jp`, `alt`; `Series._name_fields` listing all five name columns.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_series_model.py`:

```python
"""
Unit tests for the expanded Series model.

Pure model tests - no database session needed, since display_name,
names_dict and _name_fields are all computed from instance attributes.
"""

from app.models.franchise import Series


class TestSeriesDisplayName:
    """Fallback order mirrors Franchise: CN -> EN -> Alt -> roman -> JP."""

    def test_prefers_cn(self):
        s = Series(series_name_cn="中文", series_name_en="English")
        assert s.display_name == "中文"

    def test_falls_back_to_en(self):
        s = Series(series_name_en="English", series_name_alt="Alt")
        assert s.display_name == "English"

    def test_falls_back_to_alt(self):
        s = Series(series_name_alt="Alt", series_name_roman="Roman")
        assert s.display_name == "Alt"

    def test_falls_back_to_roman(self):
        s = Series(series_name_roman="Roman", series_name_jp="日本語")
        assert s.display_name == "Roman"

    def test_falls_back_to_jp(self):
        s = Series(series_name_jp="日本語")
        assert s.display_name == "日本語"

    def test_all_empty_returns_empty_string(self):
        assert Series().display_name == ""


class TestSeriesNamesDict:
    def test_carries_all_five_names(self):
        s = Series(
            series_name_en="EN",
            series_name_cn="CN",
            series_name_roman="Roman",
            series_name_jp="JP",
            series_name_alt="Alt",
        )
        assert s.names_dict == {
            "en": "EN",
            "cn": "CN",
            "roman": "Roman",
            "jp": "JP",
            "alt": "Alt",
        }


class TestSeriesNameFields:
    def test_covers_all_five_name_columns(self):
        assert Series._name_fields == [
            "series_name_en",
            "series_name_cn",
            "series_name_roman",
            "series_name_jp",
            "series_name_alt",
        ]

    def test_get_all_names_includes_roman_and_jp(self):
        s = Series(series_name_roman="Roman", series_name_jp="JP")
        assert s.get_all_names() == {"roman", "jp"}


class TestSeriesNewColumns:
    def test_expected_columns_exist(self):
        cols = set(Series.__table__.columns.keys())
        for name in (
            "series_name_roman",
            "series_name_jp",
            "my_rating",
            "series_expectation",
            "cover_entry_id",
            "to_rewatch",
            "created_at",
            "updated_at",
        ):
            assert name in cols

    def test_excluded_franchise_columns_are_absent(self):
        cols = set(Series.__table__.columns.keys())
        for name in (
            "franchise_type",
            "collection_id",
            "type_covers",
            "type_slots",
            "watch_next_group",
        ):
            assert name not in cols

    def test_sheet_column_order(self):
        """Declaration order IS the Google Sheets column order for the Series tab."""
        assert [c.name for c in Series.__table__.columns] == [
            "system_id",
            "franchise_id",
            "series_name_en",
            "series_name_cn",
            "series_name_roman",
            "series_name_jp",
            "series_name_alt",
            "my_rating",
            "series_expectation",
            "cover_entry_id",
            "to_rewatch",
            "remark",
            "created_at",
            "updated_at",
        ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/unit/test_series_model.py -v`
Expected: FAIL — `test_falls_back_to_roman`, `test_expected_columns_exist`, `test_sheet_column_order` and the `names_dict` / `_name_fields` tests all fail, because those columns and keys do not exist yet.

- [ ] **Step 3: Replace the `Series` class body**

In `app/models/franchise.py`, replace the whole `Series` class with:

```python
class Series(Base, NameFallbackMixin):
    """
    Intermediate grouping layer. Links individual entries to a parent Franchise.

    Mirrors Franchise's shape without its type/collection concepts: a series has
    no type of its own, and Collection is an umbrella over franchises, not series.
    """

    __tablename__ = "series"
    _name_fields = [
        "series_name_en",
        "series_name_cn",
        "series_name_roman",
        "series_name_jp",
        "series_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    series_name_en = Column(String, nullable=True)
    series_name_cn = Column(String, nullable=True)
    series_name_roman = Column(String, nullable=True)
    series_name_jp = Column(String, nullable=True)
    series_name_alt = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    series_expectation = Column(String, default="Low")
    # Any entry UUID, any type. No FK: no single constraint can span the six
    # entry tables a series may hold. Mirrors Franchise.cover_entry_id.
    cover_entry_id = Column(UUID(as_uuid=True), nullable=True)
    to_rewatch = Column(Boolean, default=False, nullable=True)
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    franchise = relationship("Franchise", back_populates="series")
    animes = relationship("Anime", back_populates="series")

    @property
    def names_dict(self) -> dict:
        return {
            "en": self.series_name_en,
            "cn": self.series_name_cn,
            "roman": self.series_name_roman,
            "jp": self.series_name_jp,
            "alt": self.series_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.series_name_cn),
            ("EN", self.series_name_en),
            ("Alt", self.series_name_alt),
            ("roman", self.series_name_roman),
            ("JP", self.series_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
```

The imports at the top of the file already cover `Boolean`, `DateTime`, `Text`, and `get_taipei_now` — `Franchise` uses all of them. No import changes needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/unit/test_series_model.py -v`
Expected: PASS — all tests green.

- [ ] **Step 5: Write the migration**

Create `alembic/versions/s1e2r3i4e5s6_expand_series_columns.py`:

```python
"""expand series with franchise-style columns

Revision ID: s1e2r3i4e5s6
Revises: note_drop_jsonb
Create Date: 2026-08-23 12:00:00.000000

Brings Series up to Franchise's shape: two more name fields, rating,
expectation, a cover pointer, a rewatch flag, and timestamps. Deliberately
omits franchise_type, collection_id, type_covers, type_slots and
watch_next_group - see the design doc for why each is excluded.

Server defaults are set on to_rewatch and the timestamps so existing rows
backfill rather than staying NULL. Physical column order does not match the
model's declaration order after this runs; that is fine, since the Sheets
column order is derived from the model, not from the database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 's1e2r3i4e5s6'
down_revision: Union[str, Sequence[str], None] = 'note_drop_jsonb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('series', sa.Column('series_name_roman', sa.String(), nullable=True))
    op.add_column('series', sa.Column('series_name_jp', sa.String(), nullable=True))
    op.add_column('series', sa.Column('my_rating', sa.String(), nullable=True))
    op.add_column('series', sa.Column('series_expectation', sa.String(), nullable=True, server_default='Low'))
    op.add_column('series', sa.Column('cover_entry_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('series', sa.Column('to_rewatch', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column('series', sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()))
    op.add_column('series', sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_column('series', 'updated_at')
    op.drop_column('series', 'created_at')
    op.drop_column('series', 'to_rewatch')
    op.drop_column('series', 'cover_entry_id')
    op.drop_column('series', 'series_expectation')
    op.drop_column('series', 'my_rating')
    op.drop_column('series', 'series_name_jp')
    op.drop_column('series', 'series_name_roman')
```

- [ ] **Step 6: Verify the migration applies and reverses**

Run:
```bash
alembic upgrade head
alembic downgrade -1
alembic upgrade head
```
Expected: three clean runs, no errors. After the final `upgrade head`, confirm the columns exist:
```bash
venv/Scripts/python -c "from app.database import engine; from sqlalchemy import inspect; print(sorted(c['name'] for c in inspect(engine).get_columns('series')))"
```
Expected: the list includes `cover_entry_id`, `created_at`, `my_rating`, `series_expectation`, `series_name_jp`, `series_name_roman`, `to_rewatch`, `updated_at`.

- [ ] **Step 7: Confirm nothing else broke**

Run: `venv/Scripts/python -m pytest tests/unit/ -v`
Expected: PASS — all unit tests green, including the pre-existing ones.

- [ ] **Step 8: Commit (only after user approval)**

```bash
git add app/models/franchise.py alembic/versions/s1e2r3i4e5s6_expand_series_columns.py tests/unit/test_series_model.py
git commit -m "feat(series): expand the model with franchise-style columns"
```

---

### Task 2: Schemas + series API tests

**Files:**
- Modify: `app/schemas/franchise.py:48-70` (`SeriesBase`, `SeriesResponse`, `SeriesSheetSync`)
- Test: `tests/api/test_series.py` (create)

**Interfaces:**
- Consumes: `models.Series` columns from Task 1.
- Produces: `SeriesBase` with fields `franchise_id`, `series_name_en`, `series_name_cn`, `series_name_roman`, `series_name_jp`, `series_name_alt`, `my_rating`, `series_expectation`, `cover_entry_id`, `to_rewatch`, `remark`. `SeriesResponse` adds `system_id`, `created_at`, `updated_at`. These field names are the exact JSON keys the frontend tasks send and read.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_series.py`:

```python
"""
API integration tests for /api/series endpoints.

Tests public reads and admin-protected writes, plus the franchise-style
fields added alongside the Series hub page.
Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid
import pytest


class TestGetAllSeries:
    def test_returns_200_and_list(self, client, sample_series):
        response = client.get("/api/series/")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_created_series_appears_in_list(self, client, sample_series):
        response = client.get("/api/series/")
        ids = [s["system_id"] for s in response.json()]
        assert str(sample_series.system_id) in ids


class TestGetSeriesById:
    def test_existing_id_returns_200(self, client, sample_series):
        response = client.get(f"/api/series/{sample_series.system_id}")
        assert response.status_code == 200
        assert response.json()["series_name_en"] == "Test Series"

    def test_nonexistent_id_returns_404(self, client):
        response = client.get(f"/api/series/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_response_carries_timestamps(self, client, sample_series):
        data = client.get(f"/api/series/{sample_series.system_id}").json()
        assert data["created_at"] is not None
        assert data["updated_at"] is not None


class TestCreateSeries:
    def test_admin_can_create_with_new_fields(self, admin_client, sample_franchise):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "New Series",
            "series_name_cn": "新系列",
            "series_name_roman": "Shin Series",
            "series_name_jp": "新シリーズ",
            "series_name_alt": "NS",
            "my_rating": "A",
            "series_expectation": "High",
            "to_rewatch": True,
            "remark": "a remark",
        }
        response = admin_client.post("/api/series/", json=payload)
        assert response.status_code in (200, 201)
        data = response.json()
        assert data["series_name_roman"] == "Shin Series"
        assert data["series_name_jp"] == "新シリーズ"
        assert data["my_rating"] == "A"
        assert data["series_expectation"] == "High"
        assert data["to_rewatch"] is True
        assert data["remark"] == "a remark"

    def test_expectation_defaults_to_low(self, admin_client, sample_franchise):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "Defaulted",
        }
        response = admin_client.post("/api/series/", json=payload)
        assert response.json()["series_expectation"] == "Low"

    def test_cover_entry_id_round_trips(self, admin_client, sample_franchise, sample_anime):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "Covered",
            "cover_entry_id": str(sample_anime.system_id),
        }
        response = admin_client.post("/api/series/", json=payload)
        assert response.json()["cover_entry_id"] == str(sample_anime.system_id)

    def test_guest_cannot_create(self, client, sample_franchise):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "Unauthorized",
        }
        response = client.post("/api/series/", json=payload)
        assert response.status_code == 401


class TestPatchSeries:
    def test_admin_can_patch_single_field(self, admin_client, sample_series):
        response = admin_client.patch(
            f"/api/series/{sample_series.system_id}", json={"my_rating": "S"}
        )
        assert response.status_code == 200
        assert response.json()["my_rating"] == "S"

    def test_patch_leaves_other_fields_intact(self, admin_client, sample_series):
        admin_client.patch(
            f"/api/series/{sample_series.system_id}", json={"my_rating": "S"}
        )
        data = admin_client.get(f"/api/series/{sample_series.system_id}").json()
        assert data["series_name_en"] == "Test Series"

    def test_guest_cannot_patch(self, client, sample_series):
        response = client.patch(
            f"/api/series/{sample_series.system_id}", json={"my_rating": "S"}
        )
        assert response.status_code == 401


class TestSeriesEntryFiltering:
    """The Series hub page loads its entries with ?series_id=."""

    def test_anime_list_filters_by_series_id(self, client, db_session, sample_series, sample_anime):
        sample_anime.series_id = sample_series.system_id
        db_session.flush()
        response = client.get(f"/api/anime/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        ids = [a["system_id"] for a in response.json()]
        assert str(sample_anime.system_id) in ids

    def test_anime_list_excludes_other_series(self, client, sample_series, sample_anime):
        """sample_anime has no series_id, so it must not appear."""
        response = client.get(f"/api/anime/?series_id={sample_series.system_id}")
        ids = [a["system_id"] for a in response.json()]
        assert str(sample_anime.system_id) not in ids

    @pytest.mark.parametrize("route", ["movies", "tv-shows", "cartoon", "manga", "novel"])
    def test_other_entry_routes_accept_series_id(self, client, sample_series, route):
        response = client.get(f"/api/{route}/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        assert response.json() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/api/test_series.py -v`
Expected: FAIL — the create/patch tests fail because `SeriesBase` drops the unknown fields, and `test_response_carries_timestamps` fails with a `KeyError` since `SeriesResponse` has no timestamps.

- [ ] **Step 3: Widen the schemas**

In `app/schemas/franchise.py`, replace the three series schema classes:

```python
class SeriesBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_name_en: Optional[str] = None
    series_name_cn: Optional[str] = None
    series_name_roman: Optional[str] = None
    series_name_jp: Optional[str] = None
    series_name_alt: Optional[str] = None
    my_rating: Optional[str] = None
    series_expectation: Optional[str] = "Low"
    cover_entry_id: Optional[UUID] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(SeriesBase):
    pass


class SeriesResponse(SeriesBase):
    system_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

And further down, replace `SeriesSheetSync`:

```python
class SeriesSheetSync(SeriesCreate):
    """Schema for Google Sheets Series Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
```

`app/routers/series.py` needs no change: `create_series` does `models.Series(**series_in.model_dump())` and `update_series`/`patch_series` apply `model_dump(exclude_unset=True)`, so both pick the new fields up automatically.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/api/test_series.py -v`
Expected: PASS — all tests green.

- [ ] **Step 5: Confirm the franchise suite still passes**

Run: `venv/Scripts/python -m pytest tests/api/ -v`
Expected: PASS — no regressions, especially in `test_franchise.py` and `test_media_crud.py`.

- [ ] **Step 6: Commit (only after user approval)**

```bash
git add app/schemas/franchise.py tests/api/test_series.py
git commit -m "feat(series): expose the new series fields through the API schemas"
```

---

### Task 3: Series sheet parser

**Files:**
- Modify: `app/utils/formatter.py:275-288` (`parse_series_from_sheet`)
- Test: `tests/unit/test_formatter_series.py` (create)

**Interfaces:**
- Consumes: the column names from Task 1.
- Produces: `parse_series_from_sheet(raw: dict) -> dict` returning all fourteen series columns.

**Note:** this task also fixes a live bug. `parse_series_from_sheet` currently omits `remark` entirely, so every Pull of the Series tab silently wipes it — the same class of bug the comment at `formatter.py:216` describes for franchise.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_formatter_series.py`:

```python
"""
Unit tests for parse_series_from_sheet in app/utils/formatter.py.

Covers the eight fields added with the Series hub page, plus `remark`,
which the parser used to drop - meaning every Pull of the Series tab
silently wiped it.
"""

import uuid
from datetime import datetime

from app.utils.formatter import parse_series_from_sheet


class TestSeriesRemarkNoLongerDropped:
    def test_remark_key_is_emitted(self):
        assert "remark" in parse_series_from_sheet({})

    def test_remark_value_is_parsed(self):
        parsed = parse_series_from_sheet({"remark": "a note"})
        assert parsed["remark"] == "a note"


class TestSeriesNewFields:
    def test_all_new_keys_are_emitted(self):
        parsed = parse_series_from_sheet({})
        for key in (
            "series_name_roman",
            "series_name_jp",
            "my_rating",
            "series_expectation",
            "cover_entry_id",
            "to_rewatch",
            "created_at",
            "updated_at",
        ):
            assert key in parsed

    def test_names_are_parsed(self):
        parsed = parse_series_from_sheet(
            {"series_name_roman": "Roman", "series_name_jp": "日本語"}
        )
        assert parsed["series_name_roman"] == "Roman"
        assert parsed["series_name_jp"] == "日本語"

    def test_rating_and_expectation_are_parsed(self):
        parsed = parse_series_from_sheet(
            {"my_rating": "A+", "series_expectation": "High"}
        )
        assert parsed["my_rating"] == "A+"
        assert parsed["series_expectation"] == "High"

    def test_to_rewatch_is_parsed_as_bool(self):
        assert parse_series_from_sheet({"to_rewatch": "TRUE"})["to_rewatch"] is True

    def test_cover_entry_id_parses_a_uuid(self):
        val = uuid.uuid4()
        parsed = parse_series_from_sheet({"cover_entry_id": str(val)})
        assert parsed["cover_entry_id"] == val

    def test_cover_entry_id_rejects_a_non_uuid(self):
        """Unlike franchise_id there is no name-resolution step, so junk must not reach the DB."""
        assert parse_series_from_sheet({"cover_entry_id": "Not A UUID"})["cover_entry_id"] is None

    def test_timestamps_are_parsed(self):
        parsed = parse_series_from_sheet({"created_at": "2026-08-23 10:00:00"})
        assert isinstance(parsed["created_at"], datetime)


class TestSeriesBlankCells:
    def test_blank_cells_become_none(self):
        raw = {k: "" for k in (
            "series_name_en", "series_name_cn", "series_name_roman",
            "series_name_jp", "series_name_alt", "my_rating",
            "series_expectation", "cover_entry_id", "remark",
        )}
        parsed = parse_series_from_sheet(raw)
        for key in raw:
            assert parsed[key] is None


class TestSeriesFranchiseIdStillResolvable:
    def test_name_string_is_preserved_for_later_resolution(self):
        """pull.py resolves a franchise name to a UUID; the parser must not discard it."""
        parsed = parse_series_from_sheet({"franchise_id": "Marvel"})
        assert parsed["franchise_id"] == "Marvel"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/Scripts/python -m pytest tests/unit/test_formatter_series.py -v`
Expected: FAIL — every test in `TestSeriesRemarkNoLongerDropped` and `TestSeriesNewFields` fails on a missing key.

- [ ] **Step 3: Widen the parser**

In `app/utils/formatter.py`, replace `parse_series_from_sheet` with:

```python
def parse_series_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Series sheet into typed data ready for the Database.
    Note: franchise_id could be a UUID or a raw String name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(
            raw.get("franchise_id"), UUID
        ),  # Might be string, handled in the pull pipeline
        "series_name_en": parse_from_sheet(raw.get("series_name_en"), str),
        "series_name_cn": parse_from_sheet(raw.get("series_name_cn"), str),
        "series_name_roman": parse_from_sheet(raw.get("series_name_roman"), str),
        "series_name_jp": parse_from_sheet(raw.get("series_name_jp"), str),
        "series_name_alt": parse_from_sheet(raw.get("series_name_alt"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "series_expectation": parse_from_sheet(raw.get("series_expectation"), str),
        # Must be a real UUID: unlike franchise_id there is no name-resolution
        # step for this column, so a junk cell would hit the DB.
        "cover_entry_id": _uuid_or_none(raw.get("cover_entry_id")),
        "to_rewatch": parse_from_sheet(raw.get("to_rewatch"), bool),
        # Previously omitted, so every Pull of the Series tab silently wiped it.
        "remark": parse_from_sheet(raw.get("remark"), str),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
```

`_uuid_or_none`, `parse_from_sheet`, `UUID` and `datetime` are all already imported in this module — `parse_franchise_from_sheet` and `parse_collection_from_sheet` use every one of them.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/Scripts/python -m pytest tests/unit/test_formatter_series.py -v`
Expected: PASS — all tests green.

- [ ] **Step 5: Confirm the other formatter suites still pass**

Run: `venv/Scripts/python -m pytest tests/unit/ -v`
Expected: PASS — `test_formatter_collection.py`, `test_formatter_note.py` and `test_formatter_watch_order.py` all still green.

- [ ] **Step 6: Commit (only after user approval)**

```bash
git add app/utils/formatter.py tests/unit/test_formatter_series.py
git commit -m "feat(series): parse the new series columns from the sheet, and stop dropping remark"
```

---

### Task 4: Admin add/modify forms

**Files:**
- Modify: `frontend/src/config/formFactories.js:320-327` (`defaultSeries`)
- Modify: `frontend/src/pages/add-tabs/SeriesAddTab.jsx` (whole file)
- Modify: `frontend/src/pages/modify-tabs/SeriesModifyTab.jsx` (whole file)
- Modify: `frontend/src/pages/admin/Add.jsx:704-737` (`submitSeries`)
- Modify: `frontend/src/pages/admin/Modify.jsx:169-179` (`seriesToForm`) and `:984-994` (the series PATCH body)

**Interfaces:**
- Consumes: the `SeriesBase` JSON field names from Task 2.
- Produces: `defaultSeries()` returning `{franchise_id, franchise_text, series_name_en, series_name_cn, series_name_roman, series_name_jp, series_name_alt, my_rating, series_expectation, cover_entry_id, to_rewatch, remark}`. `SeriesModifyTab` gains props `allAnime`, `allMovies`, `allTvShows`, `allCartoons`, `allMangas`, `allNovels`, `editingItem` on top of its existing `sf`, `us`, `franchiseItems`, `franchiseCollections`.

- [ ] **Step 1: Widen `defaultSeries`**

In `frontend/src/config/formFactories.js`, replace `defaultSeries`:

```javascript
export const defaultSeries = () => ({
  franchise_id: null,
  franchise_text: "",
  series_name_en: "",
  series_name_cn: "",
  series_name_roman: "",
  series_name_jp: "",
  series_name_alt: "",
  my_rating: "",
  series_expectation: "Low",
  cover_entry_id: null,
  to_rewatch: false,
  remark: "",
});
```

- [ ] **Step 2: Rewrite `SeriesAddTab.jsx`**

Replace the whole file with:

```jsx
// Frontend: add tab page file for SeriesAddTab.
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";

export { defaultSeries } from "../../config/formFactories";

export default function SeriesAddTab({
  sf,
  us,
  franchiseItems,
  franchiseCollections,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
      <Field label="Parent Franchise" required>
        <ComboBox
          items={franchiseItems}
          selectedId={sf.franchise_id}
          inputText={sf.franchise_text}
          onSelect={(id, label) => {
            us("franchise_id", id);
            us("franchise_text", label);
          }}
          onType={(text) => {
            us("franchise_text", text);
            us("franchise_id", null);
          }}
          onClear={() => {
            us("franchise_id", null);
            us("franchise_text", "");
          }}
          placeholder="Search existing franchises..."
        />
        <CollectionNote
          franchiseId={sf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series Name EN">
        <input
          className={inputCls}
          value={sf.series_name_en}
          onChange={(e) => us("series_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Series Name CN">
          <input
            className={inputCls}
            value={sf.series_name_cn}
            onChange={(e) => us("series_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Series Name roman">
          <input
            className={inputCls}
            value={sf.series_name_roman}
            onChange={(e) => us("series_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Series Name JP">
          <input
            className={inputCls}
            value={sf.series_name_jp}
            onChange={(e) => us("series_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Series Name Alt">
          <input
            className={inputCls}
            value={sf.series_name_alt}
            onChange={(e) => us("series_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={sf.my_rating}
            onChange={(e) => us("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expectation">
          <select
            className={selectCls}
            value={sf.series_expectation}
            onChange={(e) => us("series_expectation", e.target.value)}
          >
            <option value="">—</option>
            {["Highest", "High", "Medium", "Low"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {/*
        No Main Cover control here: a series that does not exist yet has no
        entries to choose from. It lives on the Modify tab only, exactly as
        franchise does.
      */}
      <Field label="To Rewatch">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!sf.to_rewatch}
            onChange={(e) => us("to_rewatch", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Mark this series for rewatch
          </span>
        </label>
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={sf.remark}
          onChange={(e) => us("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `SeriesModifyTab.jsx`**

Replace the whole file with the version below. It is the Add tab plus the Main Cover dropdown, whose entry-gathering mirrors `FranchiseModifyTab.jsx:20-77`.

```jsx
// Frontend: modify tab page file for SeriesModifyTab.
import { getDisplayName } from "../../utils/media";
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";

function getEntryYear(e) {
  if (e.release_year != null) return parseInt(e.release_year, 10) || 0;
  const d =
    e.release_date_jp ||
    e.release_date_tw ||
    e.release_date_usa ||
    e.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

export default function SeriesModifyTab({
  sf,
  us,
  franchiseItems,
  franchiseCollections,
  allAnime,
  allMovies,
  allTvShows,
  allCartoons,
  allMangas,
  allNovels,
  editingItem,
}) {
  const seriesId = editingItem?.system_id;

  // anime_movies is absent on purpose: that table has no series_id column, so
  // no anime movie can ever belong to a series.
  const seriesEntries = [
    ...(allAnime || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "anime" })),
    ...(allMovies || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "movie" })),
    ...(allTvShows || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "tv-show" })),
    ...(allCartoons || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "cartoon" })),
    ...(allMangas || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "manga" })),
    ...(allNovels || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "novel" })),
  ].sort((a, b) => getEntryYear(b) - getEntryYear(a));

  function entryOptionLabel(e) {
    const name = getDisplayName(e, e._type);
    const yr =
      e.release_year ||
      (e.release_date_jp || e.release_date_usa || e.release_date || "")
        .toString()
        .slice(0, 4);
    return `${name}${yr ? ` (${yr})` : ""} [${e._type}]`;
  }

  return (
    <>
      <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
      <Field label="Parent Franchise" required>
        <ComboBox
          items={franchiseItems}
          selectedId={sf.franchise_id}
          inputText={sf.franchise_text}
          onSelect={(id, label) => {
            us("franchise_id", id);
            us("franchise_text", label);
          }}
          onType={(text) => {
            us("franchise_text", text);
            us("franchise_id", null);
          }}
          onClear={() => {
            us("franchise_id", null);
            us("franchise_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={sf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series Name EN">
        <input
          className={inputCls}
          value={sf.series_name_en}
          onChange={(e) => us("series_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Series Name CN">
          <input
            className={inputCls}
            value={sf.series_name_cn}
            onChange={(e) => us("series_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Series Name roman">
          <input
            className={inputCls}
            value={sf.series_name_roman}
            onChange={(e) => us("series_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Series Name JP">
          <input
            className={inputCls}
            value={sf.series_name_jp}
            onChange={(e) => us("series_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Series Name Alt">
          <input
            className={inputCls}
            value={sf.series_name_alt}
            onChange={(e) => us("series_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={sf.my_rating}
            onChange={(e) => us("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expectation">
          <select
            className={selectCls}
            value={sf.series_expectation}
            onChange={(e) => us("series_expectation", e.target.value)}
          >
            <option value="">—</option>
            {["Highest", "High", "Medium", "Low"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SectionHeader icon="fa-image" title="Cover Images" />
      <Field
        label="Main Cover"
        hint="Series hub cover — leave blank to auto-pick latest entry with cover"
      >
        <select
          className={selectCls}
          value={sf.cover_entry_id || ""}
          onChange={(e) => us("cover_entry_id", e.target.value || null)}
        >
          <option value="">— Auto (latest with cover) —</option>
          {seriesEntries.map((e) => (
            <option key={e.system_id} value={e.system_id}>
              {entryOptionLabel(e)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="To Rewatch">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!sf.to_rewatch}
            onChange={(e) => us("to_rewatch", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Mark this series for rewatch
          </span>
        </label>
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={sf.remark}
          onChange={(e) => us("remark", e.target.value)}
        />
      </Field>
    </>
  );
}
```

- [ ] **Step 4: Pass the new props where `SeriesModifyTab` is rendered**

In `frontend/src/pages/admin/Modify.jsx`, in the `{editingType === "series" && (` block (around line 2920), replace the `<SeriesModifyTab ... />` element with:

```jsx
              <SeriesModifyTab
                franchiseCollections={franchiseCollections}
                sf={sf}
                us={us}
                franchiseItems={franchiseItems}
                allAnime={allAnime}
                allMovies={allMovies}
                allTvShows={allTvShows}
                allCartoons={allCartoons}
                allMangas={allMangas}
                allNovels={allNovels}
                editingItem={editingItem}
              />
```

Those state variables already exist in this component — `<FranchiseModifyTab />` a few lines above receives the same set. `allAnimeMovies` is deliberately **not** passed: `anime_movies` has no `series_id` column.

- [ ] **Step 5: Widen `seriesToForm`**

In `frontend/src/pages/admin/Modify.jsx`, replace `seriesToForm`:

```javascript
function seriesToForm(s, allFranchises) {
  const f = allFranchises.find((x) => x.system_id === s.franchise_id);
  return {
    franchise_id: s.franchise_id || null,
    franchise_text: f ? getDisplayName(f, "franchise") : "",
    series_name_en: s.series_name_en || "",
    series_name_cn: s.series_name_cn || "",
    series_name_roman: s.series_name_roman || "",
    series_name_jp: s.series_name_jp || "",
    series_name_alt: s.series_name_alt || "",
    my_rating: s.my_rating || "",
    series_expectation: s.series_expectation || "",
    cover_entry_id: s.cover_entry_id ?? null,
    to_rewatch: s.to_rewatch ?? false,
    remark: s.remark || "",
  };
}
```

- [ ] **Step 6: Widen the series PATCH body**

In `frontend/src/pages/admin/Modify.jsx`, in the `fetch(`/api/series/${editingItem.system_id}`, ...)` call, replace the `JSON.stringify({...})` body with:

```javascript
      body: JSON.stringify({
        franchise_id: franchiseId,
        series_name_en: sf.series_name_en || null,
        series_name_cn: sf.series_name_cn || null,
        series_name_roman: sf.series_name_roman || null,
        series_name_jp: sf.series_name_jp || null,
        series_name_alt: sf.series_name_alt || null,
        my_rating: sf.my_rating || null,
        series_expectation: sf.series_expectation || null,
        cover_entry_id: sf.cover_entry_id || null,
        to_rewatch: !!sf.to_rewatch,
        remark: sf.remark || null,
      }),
```

- [ ] **Step 7: Widen `submitSeries` in `Add.jsx`**

In `frontend/src/pages/admin/Add.jsx`, replace the body of `submitSeries` down to the closing of the `fetch` call:

```javascript
  async function submitSeries() {
    if (
      !sf.series_name_en &&
      !sf.series_name_cn &&
      !sf.series_name_alt &&
      !sf.series_name_roman &&
      !sf.series_name_jp
    ) {
      showToast("warning", "At least one Series Name must be provided.");
      return;
    }
    if (!sf.franchise_id) {
      showToast("warning", "An existing Franchise must be selected.");
      return;
    }

    const res = await fetch("/api/series/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_id: sf.franchise_id,
        series_name_en: sf.series_name_en || null,
        series_name_cn: sf.series_name_cn || null,
        series_name_roman: sf.series_name_roman || null,
        series_name_jp: sf.series_name_jp || null,
        series_name_alt: sf.series_name_alt || null,
        my_rating: sf.my_rating || null,
        series_expectation: sf.series_expectation || null,
        to_rewatch: !!sf.to_rewatch,
        remark: sf.remark || null,
      }),
      credentials: "include",
    });
```

Leave the rest of the function (the `if (res.ok)` block) exactly as it is.

Do **not** touch the other `fetch("/api/series/", ...)` calls in `Add.jsx` — those are the inline "create a series from an entry form" flows, which only ever supply the three names they can infer from the entry.

- [ ] **Step 8: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors. A missing import of `selectCls` or `getDisplayName` shows up here.

- [ ] **Step 9: Verify by hand**

Start the app (`uvicorn app.main:app --reload` and `cd frontend && npm run dev`), then:
1. Go to `/add`, Series tab. Confirm three sections render, and that there is **no** Main Cover dropdown.
2. Create a series with a roman name, a JP name, rating `A`, expectation `High`, To Rewatch checked, and a remark.
3. Go to `/modify`, find that series. Confirm every field round-trips with the values you set.
4. Confirm the Modify tab shows a Main Cover dropdown listing that series' entries, with anime movies absent.

- [ ] **Step 10: Commit (only after user approval)**

```bash
git add frontend/src/config/formFactories.js frontend/src/pages/add-tabs/SeriesAddTab.jsx frontend/src/pages/modify-tabs/SeriesModifyTab.jsx frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx
git commit -m "feat(series): expose the new series fields in the add and modify forms"
```

---

### Task 5: Watch Order support for a series owner

**Files:**
- Modify: `frontend/src/components/tracker/WatchOrderSection.jsx:17,31-32,50,85-86`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `<WatchOrderSection franchiseId collectionId seriesId />` — Task 6 mounts it with `seriesId`.

The backend already supports this: `GET /api/watch-order/lists` accepts `series_id` (`app/routers/watch_order.py:398`), `_validate_owner` accepts a `series_id` owner (`:67-73`), and `WatchOrderList.series_id` exists with a CHECK that exactly one owner is set (`app/models/watch_order.py:39-41`). Only the component is missing the prop.

- [ ] **Step 1: Add the prop and thread it through**

In `frontend/src/components/tracker/WatchOrderSection.jsx`:

1. Line 17 — change the signature to:
```javascript
export default function WatchOrderSection({ franchiseId, collectionId, seriesId }) {
```

2. In the `loadLists` fetch (around line 31), add `series_id` to the `buildUrl` params object so it reads:
```javascript
      buildUrl(endpoints.watchOrder.lists(), {
        franchise_id: franchiseId,
        collection_id: collectionId,
        series_id: seriesId,
      }),
```

3. Line 50 — add `seriesId` to the `useCallback` dependency array: `}, [franchiseId, collectionId, seriesId]);`

4. In the create-list payload (around line 85), add `series_id: seriesId,` alongside the existing `franchise_id` / `collection_id` keys.

Leave line 193's `isAdmin && franchiseId && !hasAnimeRelease` gate alone — that button is franchise-specific and should stay hidden on a series.

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Verify no regression on the franchise page**

With the app running, open any franchise detail page and click its Watch Order tab. Expected: the tab behaves exactly as before — `seriesId` is `undefined` there, and `buildUrl` omits undefined params.

- [ ] **Step 4: Commit (only after user approval)**

```bash
git add frontend/src/components/tracker/WatchOrderSection.jsx
git commit -m "feat(watch-order): let WatchOrderSection take a series owner"
```

---

### Task 6: The Series detail page

**Files:**
- Create: `frontend/src/pages/detail/Series.jsx`
- Create: `frontend/src/pages/detail/SeriesPage.jsx`
- Modify: `frontend/src/pages/detail/SeriesNotes.jsx:1-9` (stale comment)
- Modify: `frontend/src/App.jsx` (imports + one route)
- Modify: `frontend/src/config/mediaRegistry.js:13` (`navPath`)

**Interfaces:**
- Consumes: `SeriesResponse` fields from Task 2; `<WatchOrderSection seriesId />` from Task 5.
- Produces: the route `/series/:system_id`, which Task 7's links target.

**Reference implementation:** `frontend/src/pages/detail/FranchisePage.jsx`. This task is a port of it. Read that file before starting.

- [ ] **Step 1: Set the nav path**

In `frontend/src/config/mediaRegistry.js`, change line 13's `navPath: null` to `navPath: "/series"`:

```javascript
  series:        { statusField: null,              apiEndpoint: "/api/series",      navPath: "/series",       statusType: null    },
```

Four consumers already read `navPath` and no-op when it is null, so this alone makes series clickable in `MediaCard.jsx:611`, `GroupedEntryPage.jsx:137`, `WatchOrderGuide.jsx:145` and `WeeklySchedule.jsx:26`.

- [ ] **Step 2: Create the thin wrapper**

Create `frontend/src/pages/detail/Series.jsx`, mirroring `Franchise.jsx`:

```jsx
// Frontend: page component file for Series.
import SeriesPage from "./SeriesPage";

export default function Series() {
  return <SeriesPage />;
}
```

- [ ] **Step 3: Create `SeriesPage.jsx`**

Port `FranchisePage.jsx` with the deltas below. Copy its helper functions (`getWatchingGroup`, `animeDateScore`, `movieDateScore`, `tvDateScore`, `SectionHeader`, `TabButton`, `EmptyState`, `WATCHING_STATUS_GROUPS`, `GRID_CLS`) verbatim — `animeMovieDateScore` is not needed.

**Deltas from `FranchisePage.jsx`:**

| Area | Franchise | Series |
| --- | --- | --- |
| Route param | `/franchise/:system_id` | `/series/:system_id` |
| Detail fetch | `endpoints.resource("franchise").detail(system_id)` | `endpoints.resource("series").detail(system_id)` |
| Entry fetches | 7 lists filtered by `franchise_id` | 6 lists filtered by `series_id` — **no anime-movie** |
| Sibling fetch | series list by `franchise_id` | none |
| Parent fetch | collection by `franchise.collection_id` | franchise by `series.franchise_id` |
| Type gating | `hasACG`, `hasMovie`, … from `franchise_type` | none — gate tabs on list length only |
| `extraTabs` | `["Watch Order", "Notes"]` | `["Watch Order", "Notes"]` — unchanged |
| Watch Order | `<WatchOrderSection franchiseId={system_id} />` | `<WatchOrderSection seriesId={system_id} />` |
| Notes | `<FranchiseNotes franchise={franchise} isAdmin={isAdmin} />` | `<SeriesNotes series={series} isAdmin={isAdmin} />` |
| Group-by-series toggles | `animeGroupBySeries` etc. | **omit entirely** — meaningless inside one series |
| Series modal | `SeriesModal` + `selectedSeries` state | **omit entirely** |
| Hero badges | rating, expectation, collection link, watch-next, to-rewatch | rating, expectation, **franchise link**, to-rewatch |
| PATCH target | `/api/franchise/{id}` | `/api/series/{id}` |

**The data load.** Replace the `Promise.all` block with:

```jsx
        const [sRes, aRes, mRes, tvRes, cRes, mgRes, nvRes] = await Promise.all([
          fetch(endpoints.resource("series").detail(system_id), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("anime").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("movie").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("tv-show").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("cartoon").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("manga").list(), { series_id: system_id }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("novel").list(), { series_id: system_id }), {
            credentials: "include",
          }),
        ]);
```

There is deliberately no anime-movie fetch: `anime_movies` has no `series_id` column.

**The parent franchise.** Mirror `FranchisePage.jsx:424`'s parent-collection fetch, keyed on the series instead:

```jsx
  const [parentFranchise, setParentFranchise] = useState(null);

  useEffect(() => {
    const fid = series?.franchise_id;
    if (!fid) {
      setParentFranchise(null);
      return;
    }
    fetch(endpoints.resource("franchise").detail(fid), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setParentFranchise)
      .catch(() => setParentFranchise(null));
  }, [series?.franchise_id]);
```

**The tabs.** No type gating — length alone:

```jsx
  const mediaTabs = useMemo(() => {
    if (!series) return [];
    return [
      animeList.length && "Anime",
      mangaList.length && "Manga",
      novelList.length && "Novel",
      movieList.length && "Movies",
      tvShowList.length && "TV Shows",
      cartoonList.length && "Cartoons",
    ].filter(Boolean);
  }, [series, animeList, mangaList, novelList, movieList, tvShowList, cartoonList]);

  // Always offered, and never dependent on the entry lists: each section
  // reports whether it holds anything, and an admin needs the entry point
  // precisely when it is still empty.
  const extraTabs = useMemo(
    () => (series ? ["Watch Order", "Notes"] : []),
    [series],
  );

  const tabs = useMemo(() => [...mediaTabs, ...extraTabs], [mediaTabs, extraTabs]);
```

**The titles.** Mirror `FranchisePage.jsx:971-984`:

```jsx
  const mainTitle =
    series.series_name_cn ||
    series.series_name_en ||
    series.series_name_alt ||
    series.series_name_roman ||
    series.series_name_jp ||
    "Unknown Series";

  const subTitles = [
    { label: "EN", value: series.series_name_en },
    { label: "JP", value: series.series_name_jp },
    { label: "Romaji", value: series.series_name_roman },
    { label: "Alt", value: series.series_name_alt },
  ].filter(({ value }) => value && value !== mainTitle);
```

**The breadcrumb.** Franchise's leads with the Franchise Library; series has no library yet (Phase 2), so lead with the parent franchise:

```jsx
      <nav className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
        <Link to="/library/franchise" className="hover:text-brand font-medium">
          <i className="fas fa-sitemap mr-1"></i>Franchise Library
        </Link>
        <span>/</span>
        {parentFranchise && (
          <>
            <Link
              to={`/franchise/${parentFranchise.system_id}`}
              className="hover:text-brand font-medium"
            >
              <i className="fas fa-sitemap mr-1"></i>
              {getDisplayName(parentFranchise, "franchise")}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="font-bold text-gray-800 truncate">{mainTitle}</span>
      </nav>
```

**The hero badge row.** Same shape as `FranchisePage.jsx:1048-1093`, with the collection link swapped for a franchise link and the watch-next pill dropped:

```jsx
            <div className="flex flex-wrap gap-2 mt-4">
              {series.my_rating && (
                <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-star mr-1"></i>
                  {series.my_rating}
                </span>
              )}
              {series.series_expectation && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  {series.series_expectation} Expectation
                </span>
              )}
              {/*
                A link rather than a status pill: the franchise is somewhere to
                go, so it carries the indigo tone the admin toolbar uses for
                navigation instead of a flat badge colour.
              */}
              {parentFranchise && (
                <Link
                  to={`/franchise/${parentFranchise.system_id}`}
                  className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full text-xs font-bold hover:bg-indigo-100 transition"
                >
                  <i className="fas fa-sitemap mr-1"></i>
                  {getDisplayName(parentFranchise, "franchise")}
                </Link>
              )}
              {series.to_rewatch && (
                <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-redo mr-1"></i>To Rewatch
                </span>
              )}
              <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-bold">
                {totalEntries} Total Entries
              </span>
            </div>
```

The eyebrow above the title (`FranchisePage.jsx:1029-1032` renders `franchise.franchise_type || "Franchise"`) becomes a fixed label, since series has no type:

```jsx
            <div className="text-[10px] font-black text-brand uppercase tracking-widest mb-2">
              <i className="fas fa-layer-group mr-1"></i>
              Series
            </div>
```

**Inline admin edits.** Port `saveField` and `saveRemark` from `FranchisePage.jsx:450-473`, changing only the endpoint to `endpoints.resource("series").patch(system_id)` and the setter to `setSeries`. Port the rating / expectation / to-rewatch controls and the `RemarkModal` usage as-is, minus the Watch Next Group `<select>`.

**Empty state.** Change the copy at the bottom to `"No entries found for this series."`.

- [ ] **Step 4: Un-stale the notes wrapper comment**

In `frontend/src/pages/detail/SeriesNotes.jsx`, replace the header comment (it currently says the component is not mounted anywhere) with:

```jsx
// Frontend: the Notes tab for a series. A series-level note is the same row
// shape as an entry's - only owner_type differs - so this is the same
// component with a different owner.
```

Leave the component body untouched.

- [ ] **Step 5: Register the route**

In `frontend/src/App.jsx`:

1. Add `import Series from "./pages/detail/Series";` beside the existing `Franchise` import.
2. Add the route directly after the franchise route (line 108):
```jsx
                <Route path="/series/:system_id" element={<Series />} />
```

- [ ] **Step 6: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Verify by hand**

With the app running:
1. Open `/data-history`, click a Series row's link. Expected: it now lands on a real page instead of a blank route.
2. On the series page, confirm the hero shows the name stack, the rating/expectation badges, the parent-franchise link, and the entry count.
3. Confirm the tab strip shows only media tabs whose lists are non-empty, and that **no Anime Movies tab** appears.
4. Confirm Watch Order and Notes tabs are always present and both load.
5. As admin, change the rating inline and reload. Expected: it persisted.
6. Click the parent-franchise badge. Expected: it navigates to that franchise's page.

- [ ] **Step 8: Commit (only after user approval)**

```bash
git add frontend/src/pages/detail/Series.jsx frontend/src/pages/detail/SeriesPage.jsx frontend/src/pages/detail/SeriesNotes.jsx frontend/src/App.jsx frontend/src/config/mediaRegistry.js
git commit -m "feat(series): add the series hub page at /series/:system_id"
```

---

### Task 7: Retire SeriesModal in favour of links

**Files:**
- Modify: `frontend/src/pages/detail/Anime.jsx:14,44,469,662-667`
- Modify: `frontend/src/pages/detail/Movie.jsx:11,49,336,539-544`
- Modify: `frontend/src/pages/detail/TV.jsx:12,41,425,559-564`
- Modify: `frontend/src/pages/detail/Cartoon.jsx:12,41,423,570-575`
- Modify: `frontend/src/pages/detail/Manga.jsx:12,312,700,858-863`
- Modify: `frontend/src/pages/detail/Novel.jsx:13,145,447,634-639`
- Modify: `frontend/src/pages/detail/FranchisePage.jsx:16,181-182,1255,2316-2322`
- Delete: `frontend/src/components/modals/SeriesModal.jsx`

**Interfaces:**
- Consumes: the `/series/:system_id` route from Task 6.
- Produces: nothing later tasks depend on.

Line numbers will have shifted from Tasks 4-6. Locate each edit by searching for `SeriesModal` and `showSeriesModal` rather than trusting the numbers.

- [ ] **Step 1: Convert the six entry detail pages**

For each of `Anime.jsx`, `Movie.jsx`, `TV.jsx`, `Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`:

1. Delete the `import SeriesModal from "../../components/modals/SeriesModal";` line.
2. Delete the `const [showSeriesModal, setShowSeriesModal] = useState(false);` line.
3. In the Franchise / Series bar, replace the `<button onClick={() => setShowSeriesModal(true)} ...>` element with a `<Link>` carrying the same classes. In `Anime.jsx` the result is:

```jsx
                {series ? (
                  <span>
                    <i className="fas fa-layer-group text-purple-400/50 mr-1.5"></i>
                    <Link
                      to={`/series/${series.system_id}`}
                      className="font-medium text-purple-600 hover:text-purple-800 hover:underline transition"
                    >
                      {seriesName}
                    </Link>
                  </span>
                ) : (
```

The `bg-transparent border-none cursor-pointer p-0` classes existed only to strip button chrome, so drop them. The other five files have the same markup with their own `seriesName` variable — apply the identical change.

4. Delete the whole `{showSeriesModal && series && (<SeriesModal ... />)}` block near the bottom of the render.
5. Confirm `Link` is imported from `react-router-dom` in that file. All six already import it for the franchise link directly beside this one, but check rather than assume.

- [ ] **Step 2: Convert `FranchisePage.jsx`**

1. Delete the `import SeriesModal from "../../components/modals/SeriesModal";` line.
2. Delete the `const [selectedSeries, setSelectedSeries] = useState(null);` and `const [showSeriesModal, setShowSeriesModal] = useState(false);` lines.
3. Find the click handler that calls `setShowSeriesModal(true)` (it sits inside a group header that also calls `setSelectedSeries(...)`). Replace that clickable element with a `<Link to={`/series/${group.series.system_id}`}>` — read the surrounding code to get the correct variable holding the series object, since the group header shape varies by media type.
4. Delete the `{showSeriesModal && selectedSeries && (<SeriesModal ... />)}` block near the bottom of the render.

- [ ] **Step 3: Delete the modal**

```bash
git rm frontend/src/components/modals/SeriesModal.jsx
```

- [ ] **Step 4: Verify no references remain**

Run: `cd frontend && grep -rn "SeriesModal\|showSeriesModal\|selectedSeries" src/`
Expected: no output. Any hit is a leftover import, a dangling state variable, or an unconverted render block.

- [ ] **Step 5: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds. An unresolved `SeriesModal` import fails here.

- [ ] **Step 6: Verify by hand**

With the app running:
1. Open an anime entry that belongs to a series. Click the purple series name in the Franchise / Series bar. Expected: navigates to `/series/<id>`, no modal.
2. Repeat on a movie, TV show, cartoon, manga and novel entry that each belong to a series.
3. Open a franchise page with a media tab grouped by series. Click a series group header. Expected: navigates to that series' page.

- [ ] **Step 7: Commit (only after user approval)**

```bash
git add frontend/src/pages/detail/Anime.jsx frontend/src/pages/detail/Movie.jsx frontend/src/pages/detail/TV.jsx frontend/src/pages/detail/Cartoon.jsx frontend/src/pages/detail/Manga.jsx frontend/src/pages/detail/Novel.jsx frontend/src/pages/detail/FranchisePage.jsx frontend/src/components/modals/SeriesModal.jsx
git commit -m "refactor(series): link to the series page instead of opening a modal"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/database-schema.md:134-158` (the `series` section)
- Modify: `docs/pages.md`
- Modify: `docs/api.md`
- Modify: `docs/admin-forms.md`
- Modify: `docs/reusable-elements.md`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: nothing.

**Warning:** `docs/database-schema.md` was already modified by another Claude Code session at plan time. Run `git diff docs/database-schema.md` first and confirm every hunk you stage is yours. If it contains another session's work, say so and ask how to proceed rather than committing the mix.

- [ ] **Step 1: Update the series table in `database-schema.md`**

Replace the `### \`series\`` section's table with the fourteen columns from Task 1, in declaration order, matching the franchise table's formatting. Then update the three notes below it, which are now wrong:

- **Constraints:** still "At least one name field must be non-null", but delete "No `created_at` or `updated_at`" — it now has both.
- **Note:** delete "Series has no `roman` or `jp` name fields" and change the fallback to `CN → EN → Alt → roman → JP`.
- Add a **Column order matters** note mirroring franchise's, since the Series sheet tab is now derived the same way.

- [ ] **Step 2: Update `pages.md`**

Add a Series hub page entry beside the Franchise one: route `/series/:system_id`, what it loads (series detail, parent franchise, six entry lists by `series_id`, no anime movies), and its tabs (media tabs gated on list length; Watch Order and Notes always shown).

- [ ] **Step 3: Update `api.md`**

Update the `/api/series` request-body and response-model rows to list the widened `SeriesBase` / `SeriesResponse` fields.

- [ ] **Step 4: Update `admin-forms.md`**

Update the Series add/modify description: three sections, and Main Cover on Modify only because a new series has no entries yet.

- [ ] **Step 5: Update `reusable-elements.md`**

Remove the `SeriesModal` entry. Update the `WatchOrderSection` entry to note its third owner prop, `seriesId`.

- [ ] **Step 6: Run the full test suite**

Run:
```bash
venv/Scripts/python -m pytest tests/ -v
cd frontend && npm run test:run && npm run build
```
Expected: all backend tests pass, all frontend tests pass, build succeeds.

- [ ] **Step 7: Commit (only after user approval)**

```bash
git add docs/database-schema.md docs/pages.md docs/api.md docs/admin-forms.md docs/reusable-elements.md
git commit -m "docs(series): document the expanded series model, hub page, and forms"
```

---

## Deferred to Phase 2

Not in this plan, per the spec: series in Search results, a `/library/series` page with a `SeriesCard`, and a series block in Statistics. Each is an isolated follow-up once this lands.
