# Novel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Novel as a fully supported media type — database model, CRUD API, all business-logic pipelines (Fill, Replace, Backup, Pull), and all frontend pages (Detail, Library, Admin forms, Nav, FranchisePage).

**Architecture:** Novel mirrors Manga with key divergences: Float progress fields (vol_total_original/tw, arc_total/fin, ch_total/fin), `progress_display` for per-entry tracker selection, `release_year`/`end_year` as Integer, auto-franchise with `franchise_type="Novel"`, and a more complex `mark_novel_completed` that takes maximums across multiple totals. No `derive_related` step (unlike manga). MAL data is fetched via the same `fetch_jikan_manga_data` used for manga, mapped through a new `map_jikan_to_novel_data`.

**Tech Stack:** FastAPI, SQLAlchemy (PostgreSQL), Alembic, Pydantic v2, React + Vite, Tailwind CSS v4, Jikan v4 API, GCS.

---

## Known Spec Gaps & Decisions

| #   | Gap / Clarification                                                                                 | Decision (confirmed)                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Novel franchise tab needed its own flag independent of `hasACGFull`.                                | **Done in code.** Added `hasNovel = types.includes("Novel") \|\| types.includes("ACG")` in `FranchisePage.jsx`. Manga tab stays `hasACGFull` (ACG only). Novel tab uses `hasNovel`. Docs updated.                     |
| 2   | No float math validators needed for novel.                                                          | **Dropped.** No `validate_novel_float_math`, no `apply_validate_novel_*_math`, no `novel_post_processing` in this plan. `utils/utils.py` only gets `NOVEL_FIELDS_TO_FILL`.                                            |
| 3   | `has_missing_values_novel` purpose: only for entries that can be filled from MAL.                   | Entries without `mal_link` return `False` from `has_missing_values_novel` — they are not "missing" in any actionable sense. The fill queue gate uses `m.mal_link is not None` (not `m.mal_id`).                       |
| 4   | `mark_novel_completed` is separate from `mark_reading_completed`.                                   | `mark_novel_completed` is its own function. `mark_reading_completed` is manga-only (will be renamed `mark_manga_completed` in a future cleanup). Not triggered automatically — only via router `POST /:id/complete`.  |
| 5   | `novel_name_each_cn`/`novel_name_each_en` are used in Novel detail page, Add page, and Modify page. | Include in model/schema and all three pages. Example format: `{"1": "最後帝國", "2": "昇華之井"}`. Rendered/edited via **Belonging Novels Card**. Docs updated in database-schema.md, pages.md, reusable-elements.md. |
| 6   | No `derive_related_novel` and no `novel_post_processing`.                                           | `apply_single_replace_novel` only calls `apply_extract_mal_id_manga_novel` + `autofill_novel_from_mal`. No post-processing step, no auto-complete check, no derive step — in either single or bulk paths.             |

---

## File Map

| File                                                | Action | Purpose                                                         |
| --------------------------------------------------- | ------ | --------------------------------------------------------------- |
| `models.py`                                         | Modify | Add `Novel` SQLAlchemy class                                    |
| `schemas.py`                                        | Modify | Add `NovelBase/Create/Update/Response/SheetSync`                |
| `alembic/versions/`                                 | Create | Migration for `novel` table                                     |
| `routers/novel.py`                                  | Create | CRUD router                                                     |
| `main.py`                                           | Modify | Import and register novel router                                |
| `utils/jikan_utils.py`                              | Modify | Add `map_jikan_to_novel_data`                                   |
| `utils/formatter.py`                                | Modify | Add `parse_novel_from_sheet`                                    |
| `utils/utils.py`                                    | Modify | Add `NOVEL_FIELDS_TO_FILL`                                      |
| `services/other_logics.py`                          | Modify | Add novel logic functions (no post_processing, no validators)   |
| `services/calculation.py`                           | Modify | Add `run_sync_novel`, update `run_sync`                         |
| `services/data_control.py`                          | Modify | Add novel pipelines; update fill_all, replace_all, backup, pull |
| `frontend/src/components/NovelCard.jsx`             | Create | Novel entry grid card                                           |
| `frontend/src/pages/NovelNotes.jsx`                 | Create | Novel structured notes editor (16 sections)                     |
| `frontend/src/pages/Novel.jsx`                      | Create | Novel detail page (includes Belonging Novels Card)              |
| `frontend/src/pages/LibraryNovel.jsx`               | Create | Novel library page                                              |
| `frontend/src/pages/add-tabs/NovelAddTab.jsx`       | Create | Add form tab                                                    |
| `frontend/src/pages/modify-tabs/NovelModifyTab.jsx` | Create | Modify form tab                                                 |
| `frontend/src/pages/Add.jsx`                        | Modify | Add Novel tab                                                   |
| `frontend/src/pages/Modify.jsx`                     | Modify | Add Novel tab                                                   |
| `frontend/src/pages/Delete.jsx`                     | Modify | Add Novel delete tab                                            |
| `frontend/src/pages/FranchisePage.jsx`              | Modify | Novel tab content render (**state/flag/fetch already done**)    |
| `frontend/src/App.jsx`                              | Modify | Add novel routes                                                |
| `frontend/src/components/Nav.jsx`                   | Modify | Add novel library link                                          |
| `frontend/src/pages/Statistics.jsx`                 | Modify | Add novel statistics row                                        |
| `frontend/src/pages/Search.jsx`                     | Modify | Include novels in search results                                |
| `frontend/src/pages/Index.jsx`                      | Modify | Novel recent entries section                                    |
| `frontend/src/pages/Admin.jsx`                      | Modify | Wire novel data control actions                                 |
| `frontend/src/pages/DataHistory.jsx`                | Modify | Novel tab in data history                                       |

---

## Phase 1: Database & Backend Foundation

---

### Task 1: SQLAlchemy Novel Model

**Files:**

- Modify: `models.py` (after line 660, before `# SYSTEM & CONFIGURATION MODELS`)

- [ ] **Step 1: Add the Novel class to models.py**

Insert after the `Manga` class (after line 660, before the `# SYSTEM & CONFIGURATION MODELS` comment):

```python
class Novel(Base, NameFallbackMixin):
    """Light novel, web novel, and book entries."""

    __tablename__ = "novel"
    _name_fields = [
        "novel_name_en",
        "novel_name_cn",
        "novel_name_roman",
        "novel_name_jp",
        "novel_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    novel_name_en = Column(String, nullable=True)
    novel_name_cn = Column(String, nullable=True)
    novel_name_roman = Column(String, nullable=True)
    novel_name_jp = Column(String, nullable=True)
    novel_name_alt = Column(String, nullable=True)
    novel_name_each_cn = Column(JSONB, default=None, nullable=True)
    novel_name_each_en = Column(JSONB, default=None, nullable=True)

    region = Column(String, nullable=True)
    type = Column(String, nullable=True)
    version = Column(String, nullable=True)
    is_main = Column(String, nullable=True)
    serialization_status = Column(String, nullable=True)
    reading_status = Column(String, nullable=False, default="Might Read")

    vol_total_original = Column(Float, nullable=True)
    vol_total_tw = Column(Float, nullable=True)
    vol_fin = Column(Float, nullable=False, default=0)
    arc_total = Column(Float, nullable=True)
    arc_fin = Column(Float, nullable=False, default=0)
    ch_total = Column(Float, nullable=True)
    ch_fin = Column(Float, nullable=False, default=0)
    progress_display = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    anilist_rating = Column(String, nullable=True)

    author = Column(String, nullable=True)
    illustrator = Column(String, nullable=True)
    release_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    publisher_tw = Column(String, nullable=True)

    prequel_id = Column(UUID(as_uuid=True), nullable=True)
    sequel_id = Column(UUID(as_uuid=True), nullable=True)
    is_main_entry = Column(Boolean, nullable=True)
    read_order = Column(Float, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)

    source_other = Column(JSONB, default=None, nullable=True)

    read_next = Column(Boolean, nullable=True)
    to_reread = Column(Boolean, default=False, nullable=True)
    remark = Column(Text, nullable=True)
    notes = Column(JSONB, nullable=True)
    cover_image_file = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.novel_name_cn),
            ("EN", self.novel_name_en),
            ("Alt", self.novel_name_alt),
            ("roman", self.novel_name_roman),
            ("JP", self.novel_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
```

- [ ] **Step 2: Verify JSONB and Integer imports are present**

At the top of `models.py`, confirm (or add) `Integer` in the SQLAlchemy Column imports:

```python
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
```

- [ ] **Step 3: Commit**

```bash
git add models.py
git commit -m "feat(novel): add Novel SQLAlchemy model"
```

---

### Task 2: Pydantic Schemas

**Files:**

- Modify: `schemas.py` (after line 617, before `# SYSTEM CONFIG & SEASONAL SCHEMAS`)

- [ ] **Step 1: Add NovelBase and derived schemas**

Insert after `MangaSheetSync` (after line 617):

```python
class NovelBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    novel_name_en: Optional[str] = None
    novel_name_cn: Optional[str] = None
    novel_name_roman: Optional[str] = None
    novel_name_jp: Optional[str] = None
    novel_name_alt: Optional[str] = None
    novel_name_each_cn: Optional[dict] = None
    novel_name_each_en: Optional[dict] = None

    region: Optional[str] = None
    type: Optional[str] = None
    version: Optional[str] = None
    is_main: Optional[str] = None
    serialization_status: Optional[str] = None
    reading_status: str = "Might Read"

    vol_total_original: Optional[float] = None
    vol_total_tw: Optional[float] = None
    vol_fin: float = 0
    arc_total: Optional[float] = None
    arc_fin: float = 0
    ch_total: Optional[float] = None
    ch_fin: float = 0
    progress_display: Optional[str] = None

    my_rating: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[str] = None

    author: Optional[str] = None
    illustrator: Optional[str] = None
    release_year: Optional[int] = None
    end_year: Optional[int] = None
    publisher_tw: Optional[str] = None

    prequel_id: Optional[UUID] = None
    sequel_id: Optional[UUID] = None
    is_main_entry: Optional[bool] = None
    read_order: Optional[float] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None

    source_other: Optional[dict] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    remark: Optional[str] = None
    notes: Optional[dict] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None


class NovelCreate(NovelBase):
    pass


class NovelUpdate(NovelBase):
    pass


class NovelResponse(NovelBase):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.novel_name_cn,
            self.novel_name_en,
            self.novel_name_alt,
            self.novel_name_roman,
            self.novel_name_jp,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class NovelSheetSync(NovelCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
```

- [ ] **Step 2: Commit**

```bash
git add schemas.py
git commit -m "feat(novel): add Novel Pydantic schemas"
```

---

### Task 3: Alembic Migration

**Files:**

- Create: `alembic/versions/<auto-generated>.py`

- [ ] **Step 1: Generate the migration**

```bash
alembic revision --autogenerate -m "add novel table"
```

Expected: Alembic detects the new `novel` table and generates `CREATE TABLE novel (...)`.

- [ ] **Step 2: Apply the migration**

```bash
alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade ... -> ..., add novel table`

- [ ] **Step 3: Verify the table was created**

```bash
# Connect to psql and check
docker exec -it <postgres_container> psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\d novel"
```

Expected: Column list including `system_id`, `novel_name_cn`, `vol_total_original`, etc.

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/
git commit -m "feat(novel): add alembic migration for novel table"
```

---

### Task 4: Novel Router

**Files:**

- Create: `routers/novel.py`

- [ ] **Step 1: Create routers/novel.py**

```python
"""
routers/novel.py
Handles all API endpoints related to Novel entries.
Thin controller layer — all heavy logic delegated to services.
"""

import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import or_

from dependencies import get_db, get_current_admin
from database import get_taipei_now
import models
import schemas

from services.image_manager import delete_cover_image
from services.other_logics import resolve_novel_parent_hierarchy, mark_novel_completed
from services.data_control import execute_replace_single_novel
from utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/novel", tags=["Novel Management"])


# ==========================================
# PUBLIC READ OPERATIONS
# ==========================================


@router.get("/", response_model=List[schemas.NovelResponse], summary="Get All Novels")
def get_all_novels(
    franchise_id: Optional[str] = None,
    series_id: Optional[str] = None,
    reading_status: Optional[str] = None,
    serialization_status: Optional[str] = None,
    to_reread: Optional[bool] = None,
    search_query: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Novel)

    if franchise_id:
        query = query.filter(models.Novel.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Novel.series_id == series_id)
    if reading_status:
        query = query.filter(models.Novel.reading_status == reading_status)
    if serialization_status:
        query = query.filter(models.Novel.serialization_status == serialization_status)
    if to_reread is not None:
        query = query.filter(models.Novel.to_reread == to_reread)
    if search_query:
        q = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Novel.novel_name_cn.ilike(q),
                models.Novel.novel_name_en.ilike(q),
                models.Novel.novel_name_roman.ilike(q),
                models.Novel.novel_name_jp.ilike(q),
                models.Novel.novel_name_alt.ilike(q),
            )
        )

    return query.order_by(models.Novel.created_at.desc()).all()


@router.get(
    "/{novel_id}", response_model=schemas.NovelResponse, summary="Get Novel by ID"
)
def get_novel_by_id(novel_id: str, db: Session = Depends(get_db)):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")
    return entry


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post(
    "/",
    response_model=schemas.NovelResponse,
    status_code=201,
    summary="Create Novel",
)
async def create_novel(
    data: schemas.NovelCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    new_entry = models.Novel(**data.model_dump())
    new_entry.system_id = uuid.uuid4()

    new_entry.franchise_id, new_entry.series_id = resolve_novel_parent_hierarchy(
        db,
        new_entry.franchise_id,
        new_entry.series_id,
        {
            "en": new_entry.novel_name_en,
            "cn": new_entry.novel_name_cn,
            "roman": new_entry.novel_name_roman,
            "jp": new_entry.novel_name_jp,
            "alt": new_entry.novel_name_alt,
        },
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    await execute_replace_single_novel(
        db, str(new_entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(new_entry)

    return new_entry


@router.put(
    "/{novel_id}",
    response_model=schemas.NovelResponse,
    summary="Update Novel",
)
async def update_novel(
    novel_id: str,
    data: schemas.NovelUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    if data.reading_status == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.franchise_id, entry.series_id = resolve_novel_parent_hierarchy(
        db,
        entry.franchise_id,
        entry.series_id,
        {
            "en": entry.novel_name_en,
            "cn": entry.novel_name_cn,
            "roman": entry.novel_name_roman,
            "jp": entry.novel_name_jp,
            "alt": entry.novel_name_alt,
        },
    )

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)

    await execute_replace_single_novel(
        db, str(entry.system_id), action_type="Auto", log_action=False
    )
    db.refresh(entry)

    return entry


@router.patch(
    "/{novel_id}",
    response_model=schemas.NovelResponse,
    summary="Patch Novel",
)
async def patch_novel(
    novel_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    for key, value in payload.items():
        if hasattr(entry, key):
            setattr(entry, key, value)

    if payload.get("reading_status") == "Completed" and entry.completed_at is None:
        entry.completed_at = get_taipei_now()

    entry.updated_at = get_taipei_now()
    db.commit()
    db.refresh(entry)
    return entry


@router.post(
    "/{novel_id}/complete",
    response_model=schemas.NovelResponse,
    summary="Mark Novel Entry as Completed",
)
def complete_novel_entry(
    novel_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a novel entry."""
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    mark_novel_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{novel_id}", summary="Delete Novel")
def delete_novel(
    novel_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    entry = db.query(models.Novel).filter(models.Novel.system_id == novel_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Novel entry not found.")

    if entry.cover_image_file:
        delete_cover_image(novel_id)
    log_deleted_record(db, entry, "Novel")
    db.delete(entry)
    db.commit()
    return {"status": "success", "message": "Novel entry deleted successfully."}
```

- [ ] **Step 2: Commit**

```bash
git add routers/novel.py
git commit -m "feat(novel): add novel CRUD router"
```

---

### Task 5: Register Novel Router in main.py

**Files:**

- Modify: `main.py`

- [ ] **Step 1: Import novel router**

In `main.py` around lines 20–34, add `novel` to the router imports:

```python
from routers import (
    auth,
    options,
    franchise,
    series,
    anime,
    anime_movie,
    cartoon,
    movie,
    tv_show,
    manga,
    novel,         # <-- add this
    seasonal,
    data_control,
    system,
)
```

- [ ] **Step 2: Include the router**

Find where `app.include_router(manga.router)` is called and add the novel router immediately after:

```python
app.include_router(manga.router)
app.include_router(novel.router)    # <-- add this
```

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "feat(novel): register novel router in main.py"
```

---

## Phase 2: Utils & Helper Functions

---

### Task 6: Jikan Utils — map_jikan_to_novel_data

**Files:**

- Modify: `utils/jikan_utils.py` (after `map_jikan_to_manga_data`, after line 271)

- [ ] **Step 1: Add map_jikan_to_novel_data**

Insert after `map_jikan_to_manga_data` (after line 271):

```python
def map_jikan_to_novel_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transforms raw Jikan manga data dict into a flat dict for the Novel model."""
    _STATUS_MAP = {
        "Finished": "完結",
        "Publishing": "連載中",
        "On Hiatus": "停更",
        "Discontinued": "腰斬",
        "Not yet published": "未出",
    }

    status_raw = raw_data.get("status")
    serialization_status = _STATUS_MAP.get(status_raw) if status_raw else None

    published = raw_data.get("published", {}) or {}
    from_date = published.get("from")
    to_date = published.get("to")

    release_year = None
    end_year = None
    if from_date:
        try:
            release_year = int(from_date[:4])
        except Exception:
            pass
    if to_date:
        try:
            end_year = int(to_date[:4])
        except Exception:
            pass

    raw_rank = raw_data.get("rank")
    mal_rank = str(raw_rank) if raw_rank is not None else None

    images = raw_data.get("images", {})
    cover_image_url = (
        images.get("webp", {}).get("large_image_url")
        or images.get("jpg", {}).get("large_image_url")
        or images.get("jpg", {}).get("image_url")
    )

    volumes_raw = raw_data.get("volumes")
    vol_total_original = float(volumes_raw) if volumes_raw is not None else None

    chapters_raw = raw_data.get("chapters")
    ch_total = float(chapters_raw) if chapters_raw is not None else None

    return {
        "serialization_status": serialization_status,
        "release_year": release_year,
        "end_year": end_year,
        "mal_rating": raw_data.get("score"),
        "mal_rank": mal_rank,
        "vol_total_original": vol_total_original,
        "ch_total": ch_total,
        "cover_image_url": cover_image_url,
    }
```

- [ ] **Step 2: Commit**

```bash
git add utils/jikan_utils.py
git commit -m "feat(novel): add map_jikan_to_novel_data"
```

---

### Task 7: Sheet Parser — parse_novel_from_sheet

**Files:**

- Modify: `utils/formatter.py` (after `parse_manga_from_sheet`, after line 446)

- [ ] **Step 1: Add parse_novel_from_sheet**

Insert after `parse_manga_from_sheet` (after line 446):

```python
def parse_novel_from_sheet(raw: dict) -> dict:
    """
    Parses a raw dictionary from the Novel sheet into typed data ready for the Database.
    franchise_id, series_id, prequel_id, sequel_id may be a UUID or a raw string name.
    """
    return {
        "system_id": parse_from_sheet(raw.get("system_id"), UUID),
        "franchise_id": parse_from_sheet(raw.get("franchise_id"), UUID),
        "series_id": parse_from_sheet(raw.get("series_id"), UUID),
        "novel_name_en": parse_from_sheet(raw.get("novel_name_en"), str),
        "novel_name_cn": parse_from_sheet(raw.get("novel_name_cn"), str),
        "novel_name_roman": parse_from_sheet(raw.get("novel_name_roman"), str),
        "novel_name_jp": parse_from_sheet(raw.get("novel_name_jp"), str),
        "novel_name_alt": parse_from_sheet(raw.get("novel_name_alt"), str),
        "novel_name_each_cn": _safe_json(raw.get("novel_name_each_cn")),
        "novel_name_each_en": _safe_json(raw.get("novel_name_each_en")),
        "region": parse_from_sheet(raw.get("region"), str),
        "type": parse_from_sheet(raw.get("type"), str),
        "version": parse_from_sheet(raw.get("version"), str),
        "is_main": parse_from_sheet(raw.get("is_main"), str),
        "serialization_status": parse_from_sheet(raw.get("serialization_status"), str),
        "reading_status": parse_from_sheet(raw.get("reading_status"), str)
        or "Might Read",
        "vol_total_original": parse_from_sheet(raw.get("vol_total_original"), float),
        "vol_total_tw": parse_from_sheet(raw.get("vol_total_tw"), float),
        "vol_fin": parse_from_sheet(raw.get("vol_fin"), float) or 0.0,
        "arc_total": parse_from_sheet(raw.get("arc_total"), float),
        "arc_fin": parse_from_sheet(raw.get("arc_fin"), float) or 0.0,
        "ch_total": parse_from_sheet(raw.get("ch_total"), float),
        "ch_fin": parse_from_sheet(raw.get("ch_fin"), float) or 0.0,
        "progress_display": parse_from_sheet(raw.get("progress_display"), str),
        "my_rating": parse_from_sheet(raw.get("my_rating"), str),
        "mal_rating": parse_from_sheet(raw.get("mal_rating"), float),
        "mal_rank": parse_from_sheet(raw.get("mal_rank"), str),
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), str),
        "author": parse_from_sheet(raw.get("author"), str),
        "illustrator": parse_from_sheet(raw.get("illustrator"), str),
        "release_year": parse_from_sheet(raw.get("release_year"), int),
        "end_year": parse_from_sheet(raw.get("end_year"), int),
        "publisher_tw": parse_from_sheet(raw.get("publisher_tw"), str),
        "prequel_id": parse_from_sheet(raw.get("prequel_id"), UUID),
        "sequel_id": parse_from_sheet(raw.get("sequel_id"), UUID),
        "is_main_entry": parse_from_sheet(raw.get("is_main_entry"), bool),
        "read_order": parse_from_sheet(raw.get("read_order"), float),
        "mal_id": parse_from_sheet(raw.get("mal_id"), int),
        "mal_link": parse_from_sheet(raw.get("mal_link"), str),
        "anilist_link": parse_from_sheet(raw.get("anilist_link"), str),
        "source_other": _safe_json(raw.get("source_other")),
        "read_next": parse_from_sheet(raw.get("read_next"), bool),
        "to_reread": parse_from_sheet(raw.get("to_reread"), bool),
        "remark": parse_from_sheet(raw.get("remark"), str),
        "notes": _safe_json(raw.get("notes")),
        "cover_image_file": parse_from_sheet(raw.get("cover_image_file"), str),
        "completed_at": parse_from_sheet(raw.get("completed_at"), datetime),
        "created_at": parse_from_sheet(raw.get("created_at"), datetime),
        "updated_at": parse_from_sheet(raw.get("updated_at"), datetime),
    }
```

- [ ] **Step 2: Commit**

```bash
git add utils/formatter.py
git commit -m "feat(novel): add parse_novel_from_sheet"
```

---

### Task 8: Utils Constants

**Files:**

- Modify: `utils/utils.py` (after `MANGA_FIELDS_TO_FILL`, after line 103)

- [ ] **Step 1: Add NOVEL_FIELDS_TO_FILL**

Insert after `MANGA_FIELDS_TO_FILL` (after line 103):

```python
NOVEL_FIELDS_TO_FILL = [
    "serialization_status",
    "release_year",
    "end_year",
    "mal_rating",
    "mal_rank",
    "cover_image_file",
]
```

No float validators are added — novel has no post-processing math validation step.

- [ ] **Step 2: Commit**

```bash
git add utils/utils.py
git commit -m "feat(novel): add NOVEL_FIELDS_TO_FILL"
```

---

## Phase 3: Business Logic (services/other_logics.py)

---

### Task 9: Novel Service Functions

**Files:**

- Modify: `services/other_logics.py`

All novel functions go in a new `# NOVEL` section. They should be added before the `# SYSTEM & CONFIGURATION MODELS` block equivalent in services. The best insertion point is after `derive_related_manga` (after line 2920) and before `# COMPOSITE LOGICS`.

There are several sub-steps since many functions need to be added.

- [ ] **Step 1: Add imports**

Verify `Novel` is importable from `models`. At the top of `other_logics.py`, within the model imports block, add:

```python
from models import (
    ...,
    Novel,   # add to existing tuple
)
```

Also add to the utils imports:

```python
from utils.utils import (
    ...,
    NOVEL_FIELDS_TO_FILL,
)
from utils.jikan_utils import (
    ...,
    map_jikan_to_novel_data,
)
```

- [ ] **Step 2: Add resolve_novel_parent_hierarchy**

Insert after `resolve_manga_parent_hierarchy` (around line 606):

```python
def resolve_novel_parent_hierarchy(
    db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]
) -> Tuple[Any, Any]:
    """
    Ensures valid franchise_id and series_id UUIDs for a Novel entry.
    Franchise: valid UUID pass-through; null/string → search by name across all name fields;
    not found → auto-create with franchise_type="Novel".
    Series: non-string pass-through; non-empty string → search by name; not found → set null.
    Returns (final_franchise_id, final_series_id).
    """
    if franchise_id and not isinstance(franchise_id, str):
        final_franchise_id = franchise_id
    else:
        valid_names = set()
        for lang_key in ["en", "cn", "roman", "jp", "alt"]:
            name_val = names.get(lang_key)
            if name_val and str(name_val).strip():
                valid_names.add(str(name_val).strip())

        search_conditions = []
        for name_str in valid_names:
            search_conditions.extend(
                [
                    Franchise.franchise_name_en.ilike(name_str),
                    Franchise.franchise_name_cn.ilike(name_str),
                    Franchise.franchise_name_roman.ilike(name_str),
                    Franchise.franchise_name_jp.ilike(name_str),
                    Franchise.franchise_name_alt.ilike(name_str),
                ]
            )

        existing = None
        if search_conditions:
            existing = db.query(Franchise).filter(or_(*search_conditions)).first()

        if existing:
            final_franchise_id = existing.system_id
            logger.info(
                f"Auto-resolved existing Franchise for Novel: {final_franchise_id}"
            )
        else:
            new_fran = Franchise(
                system_id=str(uuid.uuid4()),
                franchise_type="Novel",
                franchise_name_en=names.get("en"),
                franchise_name_cn=names.get("cn"),
                franchise_name_roman=names.get("roman"),
                franchise_name_jp=names.get("jp"),
                franchise_name_alt=names.get("alt"),
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
            )
            db.add(new_fran)
            db.flush()
            final_franchise_id = new_fran.system_id
            logger.info(
                f"Auto-created missing Franchise for Novel: {final_franchise_id}"
            )

    final_series_id = series_id
    if isinstance(series_id, str):
        if series_id.strip():
            series_obj = (
                db.query(Series)
                .filter(
                    or_(
                        Series.series_name_en == series_id,
                        Series.series_name_cn == series_id,
                        Series.series_name_alt == series_id,
                    )
                )
                .first()
            )
            final_series_id = series_obj.system_id if series_obj else None
        else:
            final_series_id = None

    return final_franchise_id, final_series_id
```

- [ ] **Step 3: Add has_missing_values_novel**

Insert after `has_missing_values_manga` (around line 732):

```python
def has_missing_values_novel(novel: "Novel") -> bool:
    """
    Returns True if any required fill field is blank.
    Special case: vol_total_original and ch_total are only required when serialization_status == "完結".
    Gate: if mal_link is null, returns False (skip entirely — no MAL data source available).
    """
    if novel.mal_link is None:
        return False

    for field in NOVEL_FIELDS_TO_FILL:
        val = getattr(novel, field, None)
        if val is None or str(val).strip() == "":
            return True

    if novel.serialization_status == "完結":
        if novel.vol_total_original is None and novel.ch_total is None:
            return True

    return False
```

- [ ] **Step 4: Add autofill_novel_from_mal**

Insert after `autofill_manga_from_mal` (around line 2157):

```python
def autofill_novel_from_mal(novel: "Novel", force_replace_ratings: bool = True) -> None:
    """
    Enriches a single Novel entry with Jikan API data. Does not commit — caller is responsible.
    Fill-only: serialization_status, release_year, end_year.
    vol_total_original and ch_total are filled only when serialization_status == "完結".
    Ratings always replaced when force_replace_ratings=True.
    """
    mal_id = novel.mal_id
    if not mal_id:
        return

    try:
        raw_data = fetch_jikan_manga_data(mal_id)
        if not raw_data:
            return

        j_data = map_jikan_to_novel_data(raw_data)

        if novel.serialization_status is None:
            novel.serialization_status = j_data.get("serialization_status")
        if novel.release_year is None:
            novel.release_year = j_data.get("release_year")
        if novel.end_year is None:
            novel.end_year = j_data.get("end_year")

        if novel.serialization_status == "完結":
            if novel.vol_total_original is None:
                novel.vol_total_original = j_data.get("vol_total_original")
            if novel.ch_total is None:
                novel.ch_total = j_data.get("ch_total")

        if force_replace_ratings or novel.mal_rating is None:
            novel.mal_rating = j_data.get("mal_rating") or novel.mal_rating
        if force_replace_ratings or novel.mal_rank is None:
            raw_rank = j_data.get("mal_rank")
            novel.mal_rank = str(raw_rank) if raw_rank else novel.mal_rank

        if not novel.cover_image_file and j_data.get("cover_image_url"):
            filename = download_cover_image(
                j_data.get("cover_image_url"), str(novel.system_id)
            )
            if filename:
                novel.cover_image_file = filename

    except Exception as e:
        logger.error(
            f"MAL Autofill failed for Novel ID {novel.system_id} (MAL {mal_id}): {e}"
        )
```

- [ ] **Step 5: Add mark_novel_completed**

Insert after `mark_reading_completed` (around line 2394):

```python
def mark_novel_completed(entry: "Novel") -> None:
    """Sets a novel entry to a fully finished reading state."""
    entry.serialization_status = "完結"
    entry.reading_status = "Completed"

    # vol: set all three to the max of the three
    vol_vals = [
        v for v in [entry.vol_total_original, entry.vol_total_tw, entry.vol_fin]
        if v is not None
    ]
    if vol_vals:
        vol_max = max(vol_vals)
        entry.vol_fin = vol_max
        if entry.vol_total_original is not None:
            entry.vol_total_original = vol_max
        if entry.vol_total_tw is not None:
            entry.vol_total_tw = vol_max

    # arc: set both to max of the two
    arc_vals = [v for v in [entry.arc_total, entry.arc_fin] if v is not None]
    if arc_vals:
        arc_max = max(arc_vals)
        entry.arc_fin = arc_max
        if entry.arc_total is not None:
            entry.arc_total = arc_max

    # ch: set both to max of the two
    ch_vals = [v for v in [entry.ch_total, entry.ch_fin] if v is not None]
    if ch_vals:
        ch_max = max(ch_vals)
        entry.ch_fin = ch_max
        if entry.ch_total is not None:
            entry.ch_total = ch_max
```

- [ ] **Step 6: Add apply_single_replace_novel**

Insert after `apply_single_replace_manga` (around line 2483):

```python
def apply_single_replace_novel(db: Session, novel: "Novel", bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Novel entry.
    No post_processing and no derive_related — novel has neither.
    """
    apply_extract_mal_id_manga_novel(novel)
    autofill_novel_from_mal(novel, force_replace_ratings=True)
```

- [ ] **Step 7: Add \_NOVEL_OPTION_FIELD_MAP and extract_system_options_from_novel**

Insert after `extract_system_options_from_manga` (around line 2792):

```python
_NOVEL_OPTION_FIELD_MAP = {
    "Novel Author": "author",
    "Novel Illustrator": "illustrator",
    "Novel Publisher TW": "publisher_tw",
}


def extract_system_options_from_novel(db: Session) -> dict:
    """
    Scans all Novel entries for values in author, illustrator, publisher_tw.
    Any value not already in SystemOption is created.
    """
    existing: dict[str, set] = {}
    for opt in db.query(SystemOption).all():
        existing.setdefault(opt.category, set()).add(opt.option_value.strip())

    novels = db.query(Novel).all()
    new_options = []

    for category, field in _NOVEL_OPTION_FIELD_MAP.items():
        for novel in novels:
            raw = getattr(novel, field, None)
            if not raw:
                continue
            for val in (v.strip() for v in str(raw).split(",") if v.strip()):
                if val not in existing.get(category, set()):
                    new_options.append(
                        SystemOption(category=category, option_value=val)
                    )
                    existing.setdefault(category, set()).add(val)

    if new_options:
        db.add_all(new_options)
        db.commit()
        logger.info(
            f"extract_system_options_from_novel: created {len(new_options)} missing options."
        )

    return {
        "status": "success",
        "message": f"Scanned {len(novels)} entries, created {len(new_options)} missing system options.",
    }
```

- [ ] **Step 8: Commit**

```bash
git add services/other_logics.py
git commit -m "feat(novel): add all novel service functions in other_logics.py"
```

---

## Phase 4: Data Control Pipelines

---

### Task 10: run_sync_novel in calculation.py

**Files:**

- Modify: `services/calculation.py`

- [ ] **Step 1: Import Novel functions**

At the top of `calculation.py`, add to existing imports from `other_logics`:

```python
from services.other_logics import (
    ...,
    extract_system_options_from_novel,
)
```

- [ ] **Step 2: Add run_sync_novel and update run_sync**

Insert `run_sync_novel` after `run_sync_manga` (around line 414):

```python
def run_sync_novel(db: Session) -> dict:
    extract_system_options_from_novel(db)
    return {
        "status": "success",
        "message": "System options extracted from novel.",
    }
```

Find `run_sync` and add `run_sync_novel` to its call list after `run_sync_manga`:

```python
def run_sync(db: Session) -> dict:
    run_sync_anime(db)
    run_sync_anime_movie(db)
    run_sync_tv_show(db)
    run_sync_cartoon(db)
    run_sync_manga(db)
    run_sync_novel(db)    # <-- add this
    return {"status": "success", "message": "Sync complete."}
```

- [ ] **Step 3: Commit**

```bash
git add services/calculation.py
git commit -m "feat(novel): add run_sync_novel and update run_sync"
```

---

### Task 11: Novel Pipeline Functions in data_control.py

**Files:**

- Modify: `services/data_control.py`

Add the three novel pipeline functions. Insert them after `execute_replace_manga` (after line 1933).

- [ ] **Step 1: Import Novel model and novel functions**

At the top of `data_control.py`, add to imports:

```python
from models import (
    ...,
    Novel,
)
from services.other_logics import (
    ...,
    has_missing_values_novel,
    autofill_novel_from_mal,
    apply_single_replace_novel,
    novel_post_processing,
)
from services.calculation import (
    ...,
    run_sync_novel,
)
```

- [ ] **Step 2: Add execute_fill_novel**

Insert after `execute_replace_manga` (after line 1933):

```python
async def execute_fill_novel(
    db: Session,
    request: Request,
    action_specific: str = "Fill Novel",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE) for 'Fill Novel'. Supports graceful frontend abort."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_novels = db.query(Novel).all()
        for novel in all_novels:
            apply_extract_mal_id_manga_novel(novel)
        db.commit()

        # Gate: skip entries with no mal_link (no source to fill from)
        queue_to_process = [
            n for n in all_novels
            if n.mal_link is not None and has_missing_values_novel(n)
        ]
        total_in_queue = len(queue_to_process)

        if total_in_queue > 0:
            for index, novel in enumerate(queue_to_process, start=1):
                if await request.is_disconnected():
                    raise asyncio.CancelledError()

                name = novel.display_name or "Unknown Novel"
                yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

                try:
                    autofill_novel_from_mal(novel, force_replace_ratings=True)
                    db.commit()
                    processed_count += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"MAL Autofill failed for {name}: {e}")

                await asyncio.sleep(1)
        else:
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'No entries need filling. Running post-processing...', 'processed': 0, 'total': 0})}\n\n"

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Running post-processing...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"

        for novel in all_novels:
            if await request.is_disconnected():
                raise asyncio.CancelledError()
            try:
                novel_post_processing(novel, db)
            except Exception as e:
                logger.warning(f"Post-processing failed for {novel.display_name}: {e}")

        db.commit()

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_novel(db)

        if log_action:
            log_data_control(
                db,
                "Fill",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete.', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Aborted",
            rows_updated=processed_count,
        )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        log_data_control(
            db,
            "Fill",
            action_specific,
            action_type,
            "Failed",
            rows_updated=processed_count,
            error_message=str(e),
        )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
```

- [ ] **Step 3: Add execute_replace_single_novel**

Insert after `execute_fill_novel`:

```python
async def execute_replace_single_novel(
    db: Session,
    novel_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Fetches Jikan data for a single Novel entry, runs post-processing, and syncs."""
    logger.info(f"Starting Single Replace Pipeline for Novel ID: {novel_id}")
    action_specific = "Replace for single novel entry"

    try:
        novel = db.query(Novel).filter(Novel.system_id == novel_id).first()
        if not novel:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Failed",
                    error_message="Novel not found 404",
                )
            return {
                "status": "error",
                "message": "Novel entry not found",
                "status_code": 404,
            }

        apply_single_replace_novel(db, novel, bulk=False)
        db.commit()

        run_sync_novel(db)

        if log_action:
            log_data_control(
                db, "Replace", action_specific, action_type, "Success", rows_updated=1
            )

        return {
            "status": "success",
            "message": f"Successfully updated {novel.display_name}.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Single Replace Novel Error: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e), "status_code": 500}
```

- [ ] **Step 4: Add execute_replace_novel**

Insert after `execute_replace_single_novel`:

```python
async def execute_replace_novel(
    db: Session,
    request: Request,
    action_specific: str = "Replace Novel",
    action_type: str = "Manual",
    log_action: bool = True,
):
    """Async Generator (SSE). Replace all novel entries with Jikan data."""
    logger.info(f"Starting {action_specific} Pipeline...")

    processed_count = 0
    total_in_queue = 0

    try:
        all_novels = (
            db.query(Novel)
            .filter(or_(Novel.mal_id.isnot(None), Novel.mal_link.isnot(None)))
            .all()
        )
        total_in_queue = len(all_novels)

        if total_in_queue == 0:
            if log_action:
                log_data_control(
                    db,
                    "Replace",
                    action_specific,
                    action_type,
                    "Success",
                    rows_updated=0,
                )
            yield f"data: {json.dumps({'status': 'info', 'message': 'No novel entries found to replace', 'total': 0, 'processed': 0})}\n\n"
            return

        for index, novel in enumerate(all_novels, start=1):
            if await request.is_disconnected():
                raise asyncio.CancelledError()

            name = novel.display_name or "Unknown Novel"
            yield f"data: {json.dumps({'status': 'processing', 'current_entry': name, 'processed': index, 'total': total_in_queue})}\n\n"

            try:
                apply_single_replace_novel(db, novel, bulk=True)
                db.commit()
                processed_count += 1
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to replace {name}: {e}")

            await asyncio.sleep(1)

        yield f"data: {json.dumps({'status': 'processing', 'current_entry': 'Syncing system options...', 'processed': total_in_queue, 'total': total_in_queue})}\n\n"
        run_sync_novel(db)

        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Success",
                rows_updated=processed_count,
            )

        yield f"data: {json.dumps({'status': 'success', 'message': f'{action_specific} complete', 'total': total_in_queue, 'processed': processed_count})}\n\n"

    except asyncio.CancelledError:
        db.rollback()
        logger.info(f"Client disconnected. Aborting {action_specific}.")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Aborted",
                rows_updated=processed_count,
            )
        return

    except Exception as e:
        db.rollback()
        logger.error(f"{action_specific} Pipeline crashed: {e}")
        if log_action:
            log_data_control(
                db,
                "Replace",
                action_specific,
                action_type,
                "Failed",
                rows_updated=processed_count,
                error_message=str(e),
            )
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
```

- [ ] **Step 5: Commit**

```bash
git add services/data_control.py
git commit -m "feat(novel): add execute_fill_novel, execute_replace_single_novel, execute_replace_novel"
```

---

### Task 12: Update Existing Pipelines in data_control.py

**Files:**

- Modify: `services/data_control.py`

- [ ] **Step 1: Update execute_fill_all — add Fill Novel after Fill Manga**

Find the `# Fill Manga` block (around line 905) and add a Fill Novel block immediately after (before the `if sub_errors:` check, around line 920):

```python
        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Fill Novel
        async for message in execute_fill_novel(
            db,
            request,
            action_specific="Fill Novel",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Fill Novel failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()
```

- [ ] **Step 2: Update execute_replace_all — add Replace Novel after Replace Manga**

Find the `# Replace Manga` block (around line 2049) and add a Replace Novel block immediately after (before the `if await request.is_disconnected():` that precedes `if sub_errors:`):

```python
        if await request.is_disconnected():
            raise asyncio.CancelledError()

        # Replace Novel
        async for message in execute_replace_novel(
            db,
            request,
            action_specific="Replace Novel",
            action_type=action_type,
            log_action=False,
        ):
            if message.startswith("data: "):
                data = json.loads(message[6:])
                if data.get("status") == "success":
                    total_processed_across_all += data.get("processed", 0)
                elif data.get("status") == "error":
                    sub_errors.append(data.get("message", "Replace Novel failed"))
            yield message

        if await request.is_disconnected():
            raise asyncio.CancelledError()
```

- [ ] **Step 3: Update execute_backup — add Novel tab after Manga**

Find the manga backup block (around line 164) and add a novel block immediately after:

```python
        novel_entries = db.query(Novel).all()
        novel_headers = [c.name for c in Novel.__table__.columns]
        novel_matrix = [novel_headers] + [
            format_model_for_sheet(n) for n in novel_entries
        ]
        bulk_overwrite_sheet("Novel", novel_matrix)
```

- [ ] **Step 4: Update execute_pull_specific — add Novel to MODEL_MAP and PARSER_MAP**

Add `Novel` import to the imports at top of file if not yet present.

In `execute_pull_specific`, find `MODEL_MAP` (around line 2138) and add `"Novel": Novel`:

```python
    MODEL_MAP = {
        ...
        "Manga": Manga,
        "Novel": Novel,    # <-- add this
        ...
    }
```

Add `parse_novel_from_sheet` import, then in `PARSER_MAP` add:

```python
    PARSER_MAP = {
        ...
        "Manga": parse_manga_from_sheet,
        "Novel": parse_novel_from_sheet,    # <-- add this
        ...
    }
```

Then add the hierarchy resolution block for Novel, inserted after the Manga elif block (around line 2231):

```python
        elif tab_name == "Novel" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("novel_name_en"),
                "cn": clean_header_dict.get("novel_name_cn"),
                "roman": clean_header_dict.get("novel_name_roman"),
                "jp": clean_header_dict.get("novel_name_jp"),
                "alt": clean_header_dict.get("novel_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_novel_parent_hierarchy(db, fid, sid, name_fields)
            )
```

- [ ] **Step 5: Update execute_pull_all — add "Novel" to tabs_in_order**

Find `tabs_in_order` (around line 2550) and add `"Novel"` after `"Manga"`:

```python
    tabs_in_order = [
        "System Options",
        "Franchise",
        "Series",
        "Anime",
        "Anime Movies",
        "Movies",
        "TV Shows",
        "Cartoons",
        "Manga",
        "Novel",       # <-- add this
        "Seasonal",
    ]
```

- [ ] **Step 6: Commit**

```bash
git add services/data_control.py
git commit -m "feat(novel): update all existing pipelines to include novel"
```

---

## Phase 5: Frontend — New Files

---

### Task 13: NovelCard Component

**Files:**

- Create: `frontend/src/components/NovelCard.jsx`

This card supports `progress_display` to select which tracker to show.

- [ ] **Step 1: Create NovelCard.jsx**

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../utils/anime";

const READING_BUTTON_CONFIG = {
  "Might Read": {
    symbol: "+",
    cls: "bg-gray-50 text-gray-400 border-gray-200",
    target: "Plan to Read",
  },
  "Plan to Read": {
    symbol: "…",
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    target: "Might Read",
  },
  "Active Reading": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Read",
  },
  "Passive Reading": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Read",
  },
  Paused: {
    symbol: "~",
    cls: "bg-yellow-50 text-yellow-600 border-yellow-200",
    target: "Might Read",
  },
  Completed: {
    symbol: "✓",
    cls: "bg-blue-50 text-blue-600 border-blue-200",
    target: "Might Read",
  },
  "Temp Dropped": {
    symbol: "✕",
    cls: "bg-red-50 text-red-500 border-red-200",
    target: "Might Read",
  },
  Dropped: {
    symbol: "✕",
    cls: "bg-red-50 text-red-600 border-red-200",
    target: "Might Read",
  },
  "Won't Read": {
    symbol: "✕",
    cls: "bg-red-50 text-red-400 border-red-200",
    target: "Might Read",
  },
};

function getBtnConfig(status) {
  return READING_BUTTON_CONFIG[status] || READING_BUTTON_CONFIG["Might Read"];
}

export default function NovelCard({ novel, isAdmin: isAdminProp, onUpdated }) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();

  const title =
    novel.novel_name_cn ||
    novel.novel_name_en ||
    novel.novel_name_roman ||
    novel.novel_name_jp ||
    novel.novel_name_alt ||
    "Unknown Title";

  const imageUrl = getCoverUrl(novel.cover_image_file);
  const btnConfig = getBtnConfig(novel.reading_status);

  // Determine which progress tracker to show based on progress_display
  const pd = novel.progress_display;
  const showVolTw = pd === "vol_tw";
  const showVolOrig = pd === "vol_original";
  const showArcCh = pd === "arc_ch";
  const showCh = pd === "ch" || (!pd && novel.ch_total != null);

  async function handleStatusToggle(e) {
    e.stopPropagation();
    const target = btnConfig.target;
    try {
      const res = await fetch(`/api/novel/${novel.system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading_status: target }),
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        showToast("success", `Status → ${target}`);
        onUpdated?.(updated);
      } else {
        showToast("error", "Update failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  }

  function renderProgress() {
    if (showVolTw) {
      const fin = novel.vol_fin ?? 0;
      const total = novel.vol_total_tw != null ? novel.vol_total_tw : "?";
      return (
        <>
          <span className="font-mono">
            {fin} / {total}
          </span>
          <span className="text-[9px] text-gray-400 ml-0.5">VOL TW</span>
        </>
      );
    }
    if (showVolOrig) {
      const fin = novel.vol_fin ?? 0;
      const total =
        novel.vol_total_original != null ? novel.vol_total_original : "?";
      return (
        <>
          <span className="font-mono">
            {fin} / {total}
          </span>
          <span className="text-[9px] text-gray-400 ml-0.5">VOL</span>
        </>
      );
    }
    if (showArcCh) {
      return (
        <span className="font-mono text-[10px]">
          {novel.arc_fin ?? 0}/{novel.arc_total ?? "?"} ARC &nbsp;
          {novel.ch_fin ?? 0}/{novel.ch_total ?? "?"} CH
        </span>
      );
    }
    // default: ch
    const fin = novel.ch_fin ?? 0;
    const total = novel.ch_total != null ? novel.ch_total : "?";
    return (
      <>
        <span className="font-mono">
          {fin} / {total}
        </span>
        <span className="text-[9px] text-gray-400 ml-0.5">CH</span>
      </>
    );
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full cursor-pointer relative group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      onClick={() => navigate(`/novel/${novel.system_id}`)}
    >
      {/* Poster */}
      <div className="w-full aspect-[3/4] bg-gray-100 relative overflow-hidden">
        {novel.my_rating && (
          <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-br-lg z-10 flex items-center shadow-sm">
            <i className="fas fa-star text-[8px] mr-1"></i>
            {novel.my_rating}
          </div>
        )}
        {novel.region && (
          <div className="absolute top-1 right-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-[9px] font-bold backdrop-blur-sm shadow-sm z-10 border border-white/20">
            {novel.region}
          </div>
        )}
        <img
          src={imageUrl}
          alt="Cover"
          className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col flex-1 relative z-20 bg-white">
        <h3
          className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight mb-1.5"
          title={title}
        >
          {title}
        </h3>
        <div className="text-[10px] text-gray-500 font-medium mb-1 flex items-center justify-between gap-1">
          <span className="truncate pr-1">
            {novel.release_year || "?"}
            {novel.end_year && novel.end_year !== novel.release_year
              ? ` – ${novel.end_year}`
              : ""}
          </span>
          {novel.mal_rating && (
            <span className="shrink-0 flex items-center gap-0.5 text-blue-600 font-bold">
              <i className="fas fa-star text-[8px]"></i>
              {novel.mal_rating}
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2.5">
          <div className="flex items-center gap-1 text-[11px] font-bold text-gray-700 tracking-tight">
            {renderProgress()}
          </div>
          {showAdmin ? (
            <button
              onClick={handleStatusToggle}
              className={`w-6 h-6 flex items-center justify-center rounded-md border shadow-sm transition-colors font-bold text-[13px] leading-none ${btnConfig.cls}`}
              title={`${novel.reading_status || "Might Read"} → ${btnConfig.target}`}
            >
              {btnConfig.symbol}
            </button>
          ) : novel.reading_status ? (
            <div
              className="text-[9px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[65px] truncate"
              title={novel.reading_status}
            >
              {novel.reading_status}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/NovelCard.jsx
git commit -m "feat(novel): add NovelCard component"
```

---

### Task 14: NovelNotes Component

**Files:**

- Create: `frontend/src/pages/NovelNotes.jsx`

The Novel Notes component renders the structured JSONB `notes` field. Model this after `MangaNotes.jsx`.

- [ ] **Step 1: Read MangaNotes.jsx for the exact pattern**

```bash
cat frontend/src/pages/MangaNotes.jsx
```

- [ ] **Step 2: Create NovelNotes.jsx**

Use the same section-rendering pattern as `MangaNotes.jsx` but reference `/api/novel/:id` instead of `/api/manga/:id`. The component signature and props are identical — replace all `manga` references with `novel` and update section labels per the Novel Notes spec in `reusable-elements.md` (16 sections, as defined there).

```jsx
// frontend/src/pages/NovelNotes.jsx
// Pattern: identical to MangaNotes.jsx — replace manga→novel, /api/manga→/api/novel,
// and use the novel-specific section list from reusable-elements.md.
```

The exact section list for novel notes can be found in `docs/reusable-elements.md`. Read it before filling in the sections array.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/NovelNotes.jsx
git commit -m "feat(novel): add NovelNotes component"
```

---

### Task 15: Novel Detail Page (Novel.jsx)

**Files:**

- Create: `frontend/src/pages/Novel.jsx`

Model after `Manga.jsx`. Key differences:

- URL: `/novel/:novelId`, API: `/api/novel/:id`
- Admin controls: Edit (→ `/modify?id=:id&type=novel`), Mark Completed (`POST /api/novel/:id/complete`), Autofill & Update (`execute_replace_single_novel` via `POST /api/data-control/replace/single-novel`)
- Sources Card: MAL link, AniList link, `source_other`
- My Tracker Block: reading_status, my_rating, vol/arc/ch trackers based on `progress_display`, read_next, to_reread
- Information Card: region, type, is_main, serialization_status, release_year, end_year, vol_total_original, vol_total_tw, arc_total, ch_total
- Production Card: author, illustrator, publisher_tw
- **Belonging Novels Card**: renders `novel_name_each_cn` and `novel_name_each_en` as two side-by-side sections of key-value pairs (e.g. `[1]: 最後帝國`). Admin: add/delete/reorder pairs inline; saves via `PATCH /api/novel/:id`. Placed between Remarks and Notes Card.
- Tags: region, type, serialization_status

- [ ] **Step 1: Read Manga.jsx for the structural pattern**

```bash
cat frontend/src/pages/Manga.jsx
```

- [ ] **Step 2: Create Novel.jsx**

Follow the exact structure of `Manga.jsx`, replacing:

- `manga` → `novel`, `Manga` → `Novel`
- `/api/manga` → `/api/novel`
- Name fields: `novel_name_cn`, `novel_name_en`, `novel_name_roman`, `novel_name_jp`, `novel_name_alt`
- Progress: render based on `progress_display` (vol_tw / vol_original / arc_ch / ch)
- Production: `author`, `illustrator`, `publisher_tw` (not `author_plot`/`author_draw`/`distributor_tw`)
- No `derive_related`, no `watch_order`
- Autofill endpoint: `POST /api/data-control/replace/single-novel` with body `{ novel_id: id }`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Novel.jsx
git commit -m "feat(novel): add Novel detail page"
```

---

### Task 16: Novel Library Page (LibraryNovel.jsx)

**Files:**

- Create: `frontend/src/pages/LibraryNovel.jsx`

Model after `LibraryManga.jsx`. Key differences:

- Filters: Serialization Status, Reading Status, Region, Type
- Sorts: Title, My Rating, MAL Rating, Release Year, Ending Year
- Grid uses `NovelCard`, table view shows novel-specific columns
- API: `GET /api/novel/`

- [ ] **Step 1: Read LibraryManga.jsx for structure**

```bash
cat frontend/src/pages/LibraryManga.jsx
```

- [ ] **Step 2: Create LibraryNovel.jsx**

Follow `LibraryManga.jsx` structure, replacing manga-specific fields with novel-specific:

- Filter options for `serialization_status`: `"完結"`, `"連載中"`, `"連載中 (不穩定)"`, `"連載中 (有生之年)"`, `"停更"`, `"可能更多"`, `"未出"`, null
- Filter options for `region`: `"JP"`, `"CN"`, `"TW"`, `"KR"`, `"Western"`, null
- Filter options for `type`: `"Light Novel"`, `"Novel"`, `"Web"`, `"Other"`, null
- Grid uses `<NovelCard>`, import from `../components/NovelCard`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LibraryNovel.jsx
git commit -m "feat(novel): add LibraryNovel page"
```

---

## Phase 6: Frontend — Admin Forms

---

### Task 17: Add Novel Tab

**Files:**

- Create: `frontend/src/pages/add-tabs/NovelAddTab.jsx`
- Modify: `frontend/src/pages/Add.jsx`

- [ ] **Step 1: Create NovelAddTab.jsx**

Model after `MangaAddTab.jsx`. Key field differences:

- Name fields: `novel_name_cn`, `novel_name_en`, `novel_name_roman`, `novel_name_jp`, `novel_name_alt`
- Added fields (not in manga): `type` (dropdown: Light Novel/Novel/Web/Other), `author`, `illustrator`
- Removed fields (manga-specific): `author_plot`, `author_draw`, `anime_studio`, `serialization_platform`, `distributor_tw`
- Default for `is_main` (Main/Spinoff): `"本傳"`
- Franchise: searches ACG franchises (not Novel-type, the franchise search is by all types for ACG — per spec `franchise_type = "Novel"` is set on auto-create, not on search filter)
- Prefill applies: Franchise, Series, all Novel Name fields, Type, Region, is_main (Main/Spinoff), Author, Illustrator
- **Relational & Timeline section**: includes `novel_name_each_cn` and `novel_name_each_en` as dynamic key-value pair lists. Each pair: key (string, may be non-numeric) + value (book name). User can add, delete, and reorder. Stored as JSON object on submit: `{"1": "最後帝國", "2": "昇華之井"}`.
- On submit: calls `POST /api/novel/` which triggers `execute_replace_single_novel`

```jsx
// frontend/src/pages/add-tabs/NovelAddTab.jsx
// Pattern: copy MangaAddTab.jsx, replace field names per above, add type dropdown,
// replace author_plot/author_draw with author/illustrator.
```

- [ ] **Step 2: Update Add.jsx**

Add novel tab support following the same pattern as the manga tab:

1. Import `NovelAddTab` from `./add-tabs/NovelAddTab`.
2. Add novel state variables (form state for all Novel fields, autofill query/results).
3. Add novel fetch on mount (`GET /api/novel/`).
4. Add `applyNovelAutofill(n)` function.
5. Add `handleNovelSubmit()` that calls `POST /api/novel/`.
6. Add Novel tab button in the tab bar.
7. Render `<NovelAddTab>` when novel tab is active.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/add-tabs/NovelAddTab.jsx frontend/src/pages/Add.jsx
git commit -m "feat(novel): add Novel tab to Add page"
```

---

### Task 18: Modify Novel Tab

**Files:**

- Create: `frontend/src/pages/modify-tabs/NovelModifyTab.jsx`
- Modify: `frontend/src/pages/Modify.jsx`

- [ ] **Step 1: Create NovelModifyTab.jsx**

Model after `MangaModifyTab.jsx`. Same field set as NovelAddTab plus:

- Sibling ribbon: when a franchise is selected, shows all other novel entries in that franchise grouped by series
- Deep-link support: `/modify?id=:uuid&type=novel` pre-selects and opens the novel editor
- **Relational & Timeline section**: same `novel_name_each_cn`/`novel_name_each_en` key-value pair lists as Add tab, pre-populated from the loaded entry
- **Structured Notes section**: 16 editable sections — Remark, 優點, 缺點, 優缺點, 大眾評價, 我的評價, 神片段, 解析, 巧思, Foreshadowing, 對稱, 改編, Resources, Unread, Questions, 名言/梗/迷因

- [ ] **Step 2: Update Modify.jsx**

Add novel modify support following the manga modify pattern:

1. Import `NovelModifyTab`.
2. Handle `type=novel` in the query params for deep-link support.
3. Add novel state variables and fetch (`GET /api/novel/`).
4. Add `handleNovelModifySubmit()` that calls `PUT /api/novel/:id`.
5. Add Novel tab button and render `<NovelModifyTab>` when active.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/modify-tabs/NovelModifyTab.jsx frontend/src/pages/Modify.jsx
git commit -m "feat(novel): add Novel tab to Modify page"
```

---

### Task 19: Delete Novel Tab

**Files:**

- Modify: `frontend/src/pages/Delete.jsx`

- [ ] **Step 1: Add Novel delete tab to Delete.jsx**

Following the manga delete tab pattern:

1. Add `novelResults` state, fetch `GET /api/novel/?search_query=...`
2. Display: cover thumbnail, novel_name_cn/en, serialization_status, reading_status, franchise name, system_id, Delete button
3. Confirmation modal: if the novel is the only entry in its franchise (no other entries), offer to delete orphaned Franchise Hub
4. Delete: `DELETE /api/novel/:id`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Delete.jsx
git commit -m "feat(novel): add Novel tab to Delete page"
```

---

## Phase 7: Frontend — Navigation & Existing Pages

---

### Task 20: App.jsx and Nav.jsx

**Files:**

- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Nav.jsx`

- [ ] **Step 1: Add novel routes to App.jsx**

Import `Novel` and `LibraryNovel`, then add routes:

```jsx
import Novel from "./pages/Novel";
import LibraryNovel from "./pages/LibraryNovel";

// Inside the router, after manga routes:
<Route path="/novel/:novelId" element={<Novel />} />
<Route path="/library/novel" element={<LibraryNovel />} />
```

- [ ] **Step 2: Add novel library link to Nav.jsx**

Find where the manga library link is rendered in `Nav.jsx` and add a novel link immediately after:

```jsx
<NavLink to="/library/novel">Novel</NavLink>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Nav.jsx
git commit -m "feat(novel): add novel routes and nav link"
```

---

### Task 21: FranchisePage, Search, Statistics, Index, Admin, DataHistory

**Files:**

- Modify: `frontend/src/pages/FranchisePage.jsx`
- Modify: `frontend/src/pages/Search.jsx`
- Modify: `frontend/src/pages/Statistics.jsx`
- Modify: `frontend/src/pages/Index.jsx`
- Modify: `frontend/src/pages/Admin.jsx`
- Modify: `frontend/src/pages/DataHistory.jsx`

- [ ] **Step 1: FranchisePage.jsx — render Novel tab content**

**State, flag, and fetch are already done** (committed earlier in the novel branch):

- `novelList` state + fetch from `GET /api/novel/?franchise_id=:id` ✓
- `hasNovel = types.includes("Novel") || types.includes("ACG")` ✓ (separate from `hasACGFull`)
- Novel tab entry in tabs array using `hasNovel` ✓
- `handleNovelUpdated` callback ✓

**Remaining work**: import `NovelCard` and render the tab content panel:

```jsx
import NovelCard from "../components/NovelCard";

// Inside the Novel tab panel (conditional on activeTab === "Novel"):
<div className="...grid...">
  {novelList.map((n) => (
    <NovelCard key={n.system_id} novel={n} onUpdated={handleNovelUpdated} />
  ))}
</div>;
```

Also add sort/filter/group-by controls using `novelSort`, `novelFilters`, `novelGroupBySeries` state (follow the manga tab panel pattern exactly).

- [ ] **Step 2: Search.jsx — include novels in results**

Find where manga search results are handled and add a parallel novel search:

- Fetch `GET /api/novel/?search_query=:q`
- Display novel results in a "Novel" section with `<NovelCard>` or a search result row

- [ ] **Step 3: Statistics.jsx — add novel statistics row**

Find where manga statistics are displayed and add a novel row:

- Fetch `GET /api/novel/`
- Count by reading_status and serialization_status
- Display alongside manga stats

- [ ] **Step 4: Index.jsx — add recent novels section**

Add a "Recent Novels" section (fetch `GET /api/novel/` ordered by created_at, take first 5):

```jsx
// Fetch and display like the manga recent entries section
// Use <NovelCard> or a simpler inline display
```

- [ ] **Step 5: Admin.jsx — wire novel data control actions**

Find where manga Fill/Replace buttons are defined in Admin.jsx and add parallel Novel buttons:

- Fill Novel button: calls the Fill Novel SSE endpoint
- Replace Novel button: calls the Replace Novel SSE endpoint
- Follow the same SSE streaming pattern as manga

- [ ] **Step 6: DataHistory.jsx — add novel tab or include in history view**

Follow the existing manga pattern to include novel entries in the data history log view if filtered by type.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/FranchisePage.jsx frontend/src/pages/Search.jsx \
         frontend/src/pages/Statistics.jsx frontend/src/pages/Index.jsx \
         frontend/src/pages/Admin.jsx frontend/src/pages/DataHistory.jsx
git commit -m "feat(novel): update FranchisePage, Search, Statistics, Index, Admin, DataHistory for novel"
```

---

## Self-Review: Spec Coverage Check

| Spec Requirement                                                                           | Task    |
| ------------------------------------------------------------------------------------------ | ------- |
| Novel SQLAlchemy model with all columns                                                    | Task 1  |
| Novel Pydantic schemas (Base/Create/Update/Response/SheetSync)                             | Task 2  |
| Database migration                                                                         | Task 3  |
| CRUD router with GET/POST/PUT/PATCH/complete/DELETE                                        | Task 4  |
| Router registered in main.py                                                               | Task 5  |
| `map_jikan_to_novel_data` (maps volumes→vol_total_original as Float, adds "未出")          | Task 6  |
| `parse_novel_from_sheet` (Float for progress, Integer for release_year/end_year)           | Task 7  |
| `NOVEL_FIELDS_TO_FILL` (no float validators per Gap #2)                                    | Task 8  |
| `resolve_novel_parent_hierarchy` (franchise_type="Novel" on auto-create)                   | Task 9  |
| `has_missing_values_novel` (skip if mal_link is null; vol/ch only when 完結)               | Task 9  |
| `autofill_novel_from_mal` (fill-only status/year/vol/ch; always replace ratings)           | Task 9  |
| `mark_novel_completed` (max-of-three vol, max-of-two arc, max-of-two ch)                   | Task 9  |
| `apply_single_replace_novel` (no derive_related)                                           | Task 9  |
| `novel_post_processing` — **dropped** (no float validators, no auto-complete; Gap #2 & #6) | N/A     |
| `extract_system_options_from_novel` (Novel Author, Novel Illustrator, Novel Publisher TW)  | Task 9  |
| `run_sync_novel`, `run_sync` updated                                                       | Task 10 |
| `execute_fill_novel` (SSE, skip-if-no-mal_link gate)                                       | Task 11 |
| `execute_replace_single_novel` (non-SSE)                                                   | Task 11 |
| `execute_replace_novel` (SSE, no derive_related)                                           | Task 11 |
| `execute_fill_all` updated (Fill Novel after Fill Manga)                                   | Task 12 |
| `execute_replace_all` updated (Replace Novel after Replace Manga)                          | Task 12 |
| `execute_backup` updated (Novel tab after Manga)                                           | Task 12 |
| `execute_pull_specific` / `execute_pull_all` updated                                       | Task 12 |
| NovelCard with progress_display logic                                                      | Task 13 |
| NovelNotes component                                                                       | Task 14 |
| Novel detail page (Novel.jsx)                                                              | Task 15 |
| LibraryNovel with filters/sorts                                                            | Task 16 |
| Add Novel tab                                                                              | Task 17 |
| Modify Novel tab                                                                           | Task 18 |
| Delete Novel tab                                                                           | Task 19 |
| App.jsx routes, Nav.jsx link                                                               | Task 20 |
| FranchisePage (Novel tab content render; state/flag/fetch already done per Gap #1)         | Task 21 |
| Search, Statistics, Index, Admin, DataHistory                                              | Task 21 |
