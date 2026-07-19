# Mark Completed Endpoints — Design Spec

**Date:** 2026-05-08

## Problem

The "Mark Completed" button on each entry detail page currently patches fields directly from the frontend. This has two issues:

1. **Duplicated business logic** — the backend already has `mark_tv_completed`, `mark_movie_completed`, and `mark_reading_completed` in `app/services/other_logics.py`. The frontend is re-implementing those rules inline.
2. **Manga correctness bug** — the Manga page only sends `{ reading_status: "Completed" }`, missing `ch_fin`, `vol_fin`, `vol_fin_page`, and `serialization_status` updates that the backend function applies.

## Approach

Add a dedicated `POST /{id}/complete` endpoint to each of the 6 affected routers. The frontend "Mark Completed" button calls this endpoint instead of manually constructing a PATCH payload.

## Backend

### New endpoints (one per router)

| Router | Endpoint | Auth |
|---|---|---|
| `app/routers/anime.py` | `POST /api/anime/{system_id}/complete` | Admin |
| `app/routers/anime_movie.py` | `POST /api/anime-movie/{system_id}/complete` | Admin |
| `app/routers/tv_show.py` | `POST /api/tv-shows/{system_id}/complete` | Admin |
| `app/routers/cartoon.py` | `POST /api/cartoon/{system_id}/complete` | Admin |
| `app/routers/movie.py` | `POST /api/movies/{system_id}/complete` | Admin |
| `app/routers/manga.py` | `POST /api/manga/{manga_id}/complete` | Admin |

### Endpoint logic (same pattern for all six)

1. Fetch entry by ID; return 404 if not found.
2. Call the appropriate `mark_*_completed(entry)` function from `app/services/other_logics.py`.
3. Set `entry.completed_at = get_taipei_now()` if `completed_at` is currently `None`.
4. Set `entry.updated_at = get_taipei_now()`.
5. Commit, refresh, and return the updated entry using the existing response schema.

### Backend function mapping

| Router | Logic function |
|---|---|
| anime | `mark_tv_completed` |
| anime_movie | `mark_movie_completed` |
| tv_show | `mark_tv_completed` |
| cartoon | `mark_tv_completed` |
| movie | `mark_movie_completed` |
| manga | `mark_reading_completed` |

### Response

Returns the full updated entry using the same `*Response` schema as the existing `PATCH` endpoint for that router.

## Frontend

### Affected pages

`Anime.jsx`, `AnimeMovie.jsx`, `TV.jsx`, `Cartoon.jsx`, `Movie.jsx`, `Manga.jsx`

### Change per page

Replace the `performUpdate` / `performPatch` call in the "Mark Completed" `onClick` handler with a direct `fetch` POST to the new endpoint, then call `load()` to refresh the page state.

The inline field payloads (e.g., `{ watching_status: "Completed", airing_status: "Finished Airing", ep_fin: ... }`) are removed entirely — the backend owns that logic now.

### API path reference

Each page already knows its entry's ID (used in existing PATCH calls), so no new state is needed.

| Page | POST URL |
|---|---|
| `Anime.jsx` | `/api/anime/{system_id}/complete` |
| `AnimeMovie.jsx` | `/api/anime-movie/{system_id}/complete` |
| `TV.jsx` | `/api/tv-shows/{system_id}/complete` |
| `Cartoon.jsx` | `/api/cartoon/{system_id}/complete` |
| `Movie.jsx` | `/api/movies/{system_id}/complete` |
| `Manga.jsx` | `/api/manga/{manga_id}/complete` |

## Out of scope

- No changes to the auto-complete detection logic (the existing calls to `mark_*_completed` inside `apply_single_*` functions remain as-is).
- No changes to the PATCH endpoints.
- No new response schemas — reuse existing ones.
