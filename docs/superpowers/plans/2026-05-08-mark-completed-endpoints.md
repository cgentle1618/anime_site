# Mark Completed Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace frontend-side field construction in "Mark Completed" buttons with dedicated `POST /{id}/complete` backend endpoints that call the existing `mark_*_completed` service functions.

**Architecture:** One new endpoint per router (6 total) delegates to the existing `mark_tv_completed`, `mark_movie_completed`, or `mark_reading_completed` functions in `services/other_logics.py`. Frontend buttons become a single `fetch` POST with no payload — no field logic in the UI.

**Tech Stack:** FastAPI, SQLAlchemy, React (fetch API), pytest (API integration tests with PostgreSQL)

---

## File Map

| File | Change |
|---|---|
| `routers/anime.py` | Add `POST /{system_id}/complete` |
| `routers/anime_movie.py` | Add `POST /{system_id}/complete` |
| `routers/tv_show.py` | Add `POST /{system_id}/complete` |
| `routers/cartoon.py` | Add `POST /{system_id}/complete` |
| `routers/movie.py` | Add `POST /{system_id}/complete` |
| `routers/manga.py` | Add `POST /{manga_id}/complete` |
| `tests/api/test_complete_endpoints.py` | New — API integration tests for all 6 endpoints |
| `frontend/src/pages/Anime.jsx` | Replace Mark Completed onClick |
| `frontend/src/pages/AnimeMovie.jsx` | Replace Mark Completed onClick |
| `frontend/src/pages/TV.jsx` | Replace Mark Completed onClick |
| `frontend/src/pages/Cartoon.jsx` | Replace Mark Completed onClick |
| `frontend/src/pages/Movie.jsx` | Replace Mark Completed onClick |
| `frontend/src/pages/Manga.jsx` | Replace Mark Completed onClick |

---

## Task 1: Add `/complete` endpoint to `routers/anime.py`

**Files:**
- Modify: `routers/anime.py`

### Context

`routers/anime.py` already imports from `services.other_logics`. The import block at the top currently reads:

```python
from services.other_logics import (
    create_missing_seasonal,
    derive_ep_previous_anime,
    apply_single_replace_anime,
    resolve_anime_parent_hierarchy,
)
```

The endpoint must be placed after the existing `PATCH /{system_id}` and before `DELETE /{system_id}`.

- [ ] **Step 1: Add `mark_tv_completed` to the import**

In `routers/anime.py`, update the `services.other_logics` import to add `mark_tv_completed`:

```python
from services.other_logics import (
    create_missing_seasonal,
    derive_ep_previous_anime,
    apply_single_replace_anime,
    resolve_anime_parent_hierarchy,
    mark_tv_completed,
)
```

- [ ] **Step 2: Add the endpoint**

Insert the following after the `patch_anime_entry` function (around line 225) and before `delete_anime_entry`:

```python
@router.post(
    "/{system_id}/complete",
    response_model=schemas.AnimeResponse,
    summary="Mark Anime Entry as Completed",
)
def complete_anime_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for an anime entry using the standard mark_tv_completed logic."""
    db_anime = (
        db.query(models.Anime).filter(models.Anime.system_id == system_id).first()
    )
    if not db_anime:
        raise HTTPException(status_code=404, detail="Anime entry not found.")

    mark_tv_completed(db_anime)

    if db_anime.completed_at is None:
        db_anime.completed_at = get_taipei_now()
    db_anime.updated_at = get_taipei_now()

    db.commit()
    db.refresh(db_anime)
    return db_anime
```

---

## Task 2: Add `/complete` endpoint to `routers/anime_movie.py`

**Files:**
- Modify: `routers/anime_movie.py`

### Context

`routers/anime_movie.py` prefix is `/api/anime-movie`. The existing imports are at the top of the file. The PATCH handler is `patch_anime_movie`. Uses `models.AnimeMovies` (note the plural) and `schemas.AnimeMovieResponse`.

- [ ] **Step 1: Add `mark_movie_completed` to imports**

In `routers/anime_movie.py`, find the existing `from services.other_logics import ...` line (or add one if absent). Add `mark_movie_completed`:

```python
from services.other_logics import mark_movie_completed
```

- [ ] **Step 2: Add the endpoint**

Insert after `patch_anime_movie` and before `delete_anime_movie`:

```python
@router.post(
    "/{system_id}/complete",
    response_model=schemas.AnimeMovieResponse,
    summary="Mark Anime Movie Entry as Completed",
)
def complete_anime_movie_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for an anime movie entry."""
    entry = (
        db.query(models.AnimeMovies)
        .filter(models.AnimeMovies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Anime movie entry not found.")

    mark_movie_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry
```

---

## Task 3: Add `/complete` endpoint to `routers/tv_show.py`

**Files:**
- Modify: `routers/tv_show.py`

### Context

`routers/tv_show.py` prefix is `/api/tv-shows`. Uses `models.TVShows` and `schemas.TVShowResponse`. Path parameter is `system_id`.

- [ ] **Step 1: Add `mark_tv_completed` to imports**

In `routers/tv_show.py`, add to or create the `services.other_logics` import:

```python
from services.other_logics import mark_tv_completed
```

- [ ] **Step 2: Add the endpoint**

Insert after the existing PATCH handler and before the DELETE handler:

```python
@router.post(
    "/{system_id}/complete",
    response_model=schemas.TVShowResponse,
    summary="Mark TV Show Entry as Completed",
)
def complete_tv_show_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a TV show entry."""
    entry = (
        db.query(models.TVShows)
        .filter(models.TVShows.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="TV show entry not found.")

    mark_tv_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry
```

---

## Task 4: Add `/complete` endpoint to `routers/cartoon.py`

**Files:**
- Modify: `routers/cartoon.py`

### Context

`routers/cartoon.py` prefix is `/api/cartoon`. Uses `models.Cartoon` and `schemas.CartoonResponse`. Path parameter is `system_id`.

- [ ] **Step 1: Add `mark_tv_completed` to imports**

In `routers/cartoon.py`, add to or create the `services.other_logics` import:

```python
from services.other_logics import mark_tv_completed
```

- [ ] **Step 2: Add the endpoint**

Insert after the existing PATCH handler and before the DELETE handler:

```python
@router.post(
    "/{system_id}/complete",
    response_model=schemas.CartoonResponse,
    summary="Mark Cartoon Entry as Completed",
)
def complete_cartoon_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a cartoon entry."""
    entry = (
        db.query(models.Cartoon)
        .filter(models.Cartoon.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Cartoon entry not found.")

    mark_tv_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry
```

---

## Task 5: Add `/complete` endpoint to `routers/movie.py`

**Files:**
- Modify: `routers/movie.py`

### Context

`routers/movie.py` prefix is `/api/movies`. Uses `models.Movies` and `schemas.MovieResponse`. Path parameter is `system_id`.

- [ ] **Step 1: Add `mark_movie_completed` to imports**

In `routers/movie.py`, add to or create the `services.other_logics` import:

```python
from services.other_logics import mark_movie_completed
```

- [ ] **Step 2: Add the endpoint**

Insert after the existing PATCH handler and before the DELETE handler:

```python
@router.post(
    "/{system_id}/complete",
    response_model=schemas.MovieResponse,
    summary="Mark Movie Entry as Completed",
)
def complete_movie_entry(
    system_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a movie entry."""
    entry = (
        db.query(models.Movies)
        .filter(models.Movies.system_id == system_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Movie entry not found.")

    mark_movie_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry
```

---

## Task 6: Add `/complete` endpoint to `routers/manga.py`

**Files:**
- Modify: `routers/manga.py`

### Context

`routers/manga.py` prefix is `/api/manga`. Uses `models.Manga` and `schemas.MangaResponse`. Path parameter is `manga_id` (consistent with other endpoints in this router). The existing import line is:

```python
from services.other_logics import resolve_manga_parent_hierarchy
```

- [ ] **Step 1: Add `mark_reading_completed` to imports**

In `routers/manga.py`, update the `services.other_logics` import:

```python
from services.other_logics import resolve_manga_parent_hierarchy, mark_reading_completed
```

- [ ] **Step 2: Add the endpoint**

Insert after the existing `patch_manga` function and before `delete_manga`:

```python
@router.post(
    "/{manga_id}/complete",
    response_model=schemas.MangaResponse,
    summary="Mark Manga Entry as Completed",
)
def complete_manga_entry(
    manga_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Sets all completion fields for a manga entry (status, ch_fin, vol_fin, vol_fin_page, serialization_status)."""
    entry = db.query(models.Manga).filter(models.Manga.system_id == manga_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Manga entry not found.")

    mark_reading_completed(entry)

    if entry.completed_at is None:
        entry.completed_at = get_taipei_now()
    entry.updated_at = get_taipei_now()

    db.commit()
    db.refresh(entry)
    return entry
```

---

## Task 7: Write API integration tests

**Files:**
- Create: `tests/api/test_complete_endpoints.py`

### Context

Tests follow the pattern in `tests/api/test_franchise.py`. Use `admin_client` for auth-protected endpoints and `client` for 401 checks. The `db_session` is injected via `admin_client`/`client` fixtures from `tests/api/conftest.py`. Each test is wrapped in a rolled-back transaction — no cleanup needed.

`sample_anime` is already defined in `tests/api/conftest.py` (franchise_id required, watching_status="Completed", ep_total=12). You need to add fixtures for the other media types. Add them directly in this test file (not in conftest) since they're only needed here.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_complete_endpoints.py`:

```python
"""
API integration tests for POST /{id}/complete endpoints.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid
import pytest
import models


# ---------------------------------------------------------------------------
# Additional fixtures (not in conftest — only needed here)
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_anime_movie(db_session, sample_franchise):
    entry = models.AnimeMovies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_movie_name_en="Test Anime Movie",
        watching_status="Watching",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_tv_show(db_session, sample_franchise):
    entry = models.TVShows(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        tv_name_en="Test TV Show",
        watching_status="Watching",
        airing_status="Finished Airing",
        ep_total=10,
        ep_fin=5,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_cartoon(db_session, sample_franchise):
    entry = models.Cartoon(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        cartoon_name_en="Test Cartoon",
        watching_status="Watching",
        airing_status="Finished Airing",
        ep_total=8,
        ep_fin=3,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_movie(db_session, sample_franchise):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Test Movie",
        watching_status="Watching",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_manga(db_session, sample_franchise):
    entry = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Test Manga",
        reading_status="Reading",
        serialization_status="連載中",
        ch_total=50,
        ch_fin=20,
        vol_total=5,
        vol_fin=2,
        vol_fin_page=100,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


# ---------------------------------------------------------------------------
# Anime /complete
# ---------------------------------------------------------------------------

class TestCompleteAnime:
    def test_admin_can_mark_completed(self, admin_client, sample_anime):
        response = admin_client.post(f"/api/anime/{sample_anime.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, db_session, sample_franchise):
        entry = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Incomplete Anime",
            airing_type="TV",
            airing_status="Finished Airing",
            watching_status="Watching",
            ep_total=24,
            ep_fin=10,
        )
        db_session.add(entry)
        db_session.flush()
        response = admin_client.post(f"/api/anime/{entry.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 24

    def test_guest_cannot_mark_completed(self, client, sample_anime):
        response = client.post(f"/api/anime/{sample_anime.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/anime/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Anime Movie /complete
# ---------------------------------------------------------------------------

class TestCompleteAnimeMovie:
    def test_admin_can_mark_completed(self, admin_client, sample_anime_movie):
        response = admin_client.post(f"/api/anime-movie/{sample_anime_movie.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_guest_cannot_mark_completed(self, client, sample_anime_movie):
        response = client.post(f"/api/anime-movie/{sample_anime_movie.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/anime-movie/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# TV Show /complete
# ---------------------------------------------------------------------------

class TestCompleteTVShow:
    def test_admin_can_mark_completed(self, admin_client, sample_tv_show):
        response = admin_client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, sample_tv_show):
        response = admin_client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 10

    def test_guest_cannot_mark_completed(self, client, sample_tv_show):
        response = client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/tv-shows/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Cartoon /complete
# ---------------------------------------------------------------------------

class TestCompleteCartoon:
    def test_admin_can_mark_completed(self, admin_client, sample_cartoon):
        response = admin_client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, sample_cartoon):
        response = admin_client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 8

    def test_guest_cannot_mark_completed(self, client, sample_cartoon):
        response = client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/cartoon/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Movie /complete
# ---------------------------------------------------------------------------

class TestCompleteMovie:
    def test_admin_can_mark_completed(self, admin_client, sample_movie):
        response = admin_client.post(f"/api/movies/{sample_movie.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_guest_cannot_mark_completed(self, client, sample_movie):
        response = client.post(f"/api/movies/{sample_movie.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/movies/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Manga /complete
# ---------------------------------------------------------------------------

class TestCompleteManga:
    def test_admin_can_mark_completed(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["reading_status"] == "Completed"

    def test_ch_fin_set_to_ch_total(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["ch_fin"] == 50

    def test_vol_fin_set_to_vol_total(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["vol_fin"] == 5

    def test_vol_fin_page_set_to_zero(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["vol_fin_page"] == 0

    def test_serialization_status_set_to_completed(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["serialization_status"] == "完結"

    def test_serialization_status_not_changed_for_cancelled(self, admin_client, db_session, sample_franchise):
        cancelled = models.Manga(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            manga_name_en="Cancelled Manga",
            reading_status="Reading",
            serialization_status="腰斬",
        )
        db_session.add(cancelled)
        db_session.flush()
        response = admin_client.post(f"/api/manga/{cancelled.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["serialization_status"] == "腰斬"

    def test_guest_cannot_mark_completed(self, client, sample_manga):
        response = client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/manga/{uuid.uuid4()}/complete")
        assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail (endpoints not yet implemented)**

```bash
venv/Scripts/python -m pytest tests/api/test_complete_endpoints.py -v
```

Expected: All tests FAIL with 404 or 405 (routes don't exist yet).

- [ ] **Step 3: Implement Tasks 1–6 (the 6 backend endpoints)**

Complete Tasks 1 through 6 above.

- [ ] **Step 4: Run tests to verify they pass**

```bash
venv/Scripts/python -m pytest tests/api/test_complete_endpoints.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
venv/Scripts/python -m pytest tests/ -v
```

Expected: All previously passing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add routers/anime.py routers/anime_movie.py routers/tv_show.py routers/cartoon.py routers/movie.py routers/manga.py tests/api/test_complete_endpoints.py
git commit -m "feat(api): add POST /{id}/complete endpoints for all media types"
```

---

## Task 8: Update frontend — Anime.jsx

**Files:**
- Modify: `frontend/src/pages/Anime.jsx`

### Context

The current "Mark Completed" button `onClick` in `Anime.jsx` is (around line 260):

```jsx
onClick={() =>
  performUpdate(
    {
      watching_status: "Completed",
      airing_status: "Finished Airing",
      ep_fin: anime.ep_total ? parseInt(anime.ep_total) : epFin,
    },
    "Marked as Completed!",
  )
}
```

Replace this with a direct `fetch` POST. The page uses `system_id` from `useParams()` and has `showToast` and `load` in scope.

- [ ] **Step 1: Replace the onClick handler**

Find the button (search for `"Marked as Completed!"` in the file) and replace its `onClick`:

```jsx
onClick={async () => {
  if (!isAdmin) return;
  try {
    const res = await fetch(`/api/anime/${system_id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Request failed");
    showToast("success", "Marked as Completed!");
    await load();
  } catch {
    showToast("error", "Update failed");
  }
}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Anime.jsx
git commit -m "feat(frontend): use /complete endpoint in Anime Mark Completed button"
```

---

## Task 9: Update frontend — AnimeMovie.jsx

**Files:**
- Modify: `frontend/src/pages/AnimeMovie.jsx`

### Context

Current `onClick` in `AnimeMovie.jsx` (search for `"Marked as Completed!"`):

```jsx
onClick={() =>
  performUpdate(
    {
      watching_status: "Completed",
      airing_status: "Finished Airing",
    },
    "Marked as Completed!",
  )
}
```

- [ ] **Step 1: Replace the onClick handler**

```jsx
onClick={async () => {
  if (!isAdmin) return;
  try {
    const res = await fetch(`/api/anime-movie/${system_id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Request failed");
    showToast("success", "Marked as Completed!");
    await load();
  } catch {
    showToast("error", "Update failed");
  }
}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AnimeMovie.jsx
git commit -m "feat(frontend): use /complete endpoint in AnimeMovie Mark Completed button"
```

---

## Task 10: Update frontend — TV.jsx

**Files:**
- Modify: `frontend/src/pages/TV.jsx`

### Context

Current `onClick` in `TV.jsx` (search for `"Marked as Completed!"`):

```jsx
onClick={() =>
  performPatch(
    {
      watching_status: "Completed",
      airing_status: "Finished Airing",
      ep_fin: show.ep_total ? parseInt(show.ep_total) : epFin,
    },
    "Marked as Completed!",
  )
}
```

- [ ] **Step 1: Replace the onClick handler**

```jsx
onClick={async () => {
  if (!isAdmin) return;
  try {
    const res = await fetch(`/api/tv-shows/${system_id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Request failed");
    showToast("success", "Marked as Completed!");
    await load();
  } catch {
    showToast("error", "Update failed");
  }
}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/TV.jsx
git commit -m "feat(frontend): use /complete endpoint in TV Mark Completed button"
```

---

## Task 11: Update frontend — Cartoon.jsx

**Files:**
- Modify: `frontend/src/pages/Cartoon.jsx`

### Context

Current `onClick` in `Cartoon.jsx` (search for `"Marked as Completed!"`):

```jsx
onClick={() =>
  performPatch(
    {
      watching_status: "Completed",
      airing_status: "Finished Airing",
      ep_fin: cartoon.ep_total ? parseInt(cartoon.ep_total) : epFin,
    },
    "Marked as Completed!",
  )
}
```

- [ ] **Step 1: Replace the onClick handler**

```jsx
onClick={async () => {
  if (!isAdmin) return;
  try {
    const res = await fetch(`/api/cartoon/${system_id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Request failed");
    showToast("success", "Marked as Completed!");
    await load();
  } catch {
    showToast("error", "Update failed");
  }
}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Cartoon.jsx
git commit -m "feat(frontend): use /complete endpoint in Cartoon Mark Completed button"
```

---

## Task 12: Update frontend — Movie.jsx

**Files:**
- Modify: `frontend/src/pages/Movie.jsx`

### Context

Current `onClick` in `Movie.jsx` (search for `"Marked as Completed!"`):

```jsx
onClick={() =>
  performPatch(
    {
      watching_status: "Completed",
      airing_status: "Finished Airing",
    },
    "Marked as Completed!",
  )
}
```

- [ ] **Step 1: Replace the onClick handler**

```jsx
onClick={async () => {
  if (!isAdmin) return;
  try {
    const res = await fetch(`/api/movies/${system_id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Request failed");
    showToast("success", "Marked as Completed!");
    await load();
  } catch {
    showToast("error", "Update failed");
  }
}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Movie.jsx
git commit -m "feat(frontend): use /complete endpoint in Movie Mark Completed button"
```

---

## Task 13: Update frontend — Manga.jsx

**Files:**
- Modify: `frontend/src/pages/Manga.jsx`

### Context

Current `onClick` in `Manga.jsx` (search for `"Marked as Completed!"`):

```jsx
onClick={() =>
  performPatch(
    { reading_status: "Completed" },
    "Marked as Completed!",
  )
}
```

This is the page with the correctness bug — previously only `reading_status` was sent, missing chapter/volume/serialization updates.

- [ ] **Step 1: Replace the onClick handler**

```jsx
onClick={async () => {
  if (!isAdmin) return;
  try {
    const res = await fetch(`/api/manga/${system_id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Request failed");
    showToast("success", "Marked as Completed!");
    await load();
  } catch {
    showToast("error", "Update failed");
  }
}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Manga.jsx
git commit -m "feat(frontend): use /complete endpoint in Manga Mark Completed button (fixes ch/vol/serialization bug)"
```
