# Current Plan

## Comic Data Enrichment via Comic Vine

### Context

`comic` is the only media type with no external data source. `execute_fill_comic`
(`app/services/pipelines/fill.py:785`) states outright that "Comics are manual-entry, so
there is nothing to fetch" and only runs `run_sync_comic(db)` for derivation. Every field —
including `cover_image_file` — is populated by hand.

The goal is to fetch comic metadata from an external API, with **cover images as the
primary requirement**.

### API Evaluation

| API | Verdict | Reason |
| --- | --- | --- |
| **Comic Vine** | **Chosen** | ~80,000 volumes across all publishers. The `volume` resource maps 1:1 to a "one numbered run" entry and carries an `image` field directly on the volume. Free key tied to a GameSpot account. |
| Marvel Comics API | Rejected — dead | Marvel shut the public comic API down around Nov 2025; confirmed out of commission as of mid-2026. Not a viable option regardless of the Marvel-focused collection. |
| Metron | Fallback only | Better rate limits (20/min, 5,000/day) and HTTP Basic auth, but **`series` carries no image field** — covers live on issues, so every cover needs a second first-issue fetch. Smaller catalogue. |
| GCD / League of Comic Geeks | Rejected | No public API. |

Comic Vine wins on the one requirement that matters most: the cover is on the same object
as the run metadata, so one request per entry fills the row and the image together.

### Field Mapping

Comic Vine `volume` detail response → `comic` columns:

| Comic Vine field | `comic` column |
| --- | --- |
| `name` | `comic_name_en` |
| `start_year` | `release_year`, and `volume_label` as `"(2018)"` |
| `publisher.name` | `publisher` |
| `count_of_issues` | `issue_total` |
| `person_credits` filtered to writer roles | `writer` |
| `person_credits` filtered to penciler/artist roles | `artist` |
| `image.original_url` | → `download_cover_image()` → `cover_image_file` |
| `deck` / `description` | not mapped (no column) |

Not available from the volume object:

- `end_year` — stays manual. The volume's `last_issue` carries only id/name/issue_number,
  no cover date, so deriving the end year would cost a second request per entry. Dropped
  from the mapping rather than paid for.
- `imprint`, `continuity`, `era`, `events`, `comic_type`, `publisher_tw` — stay manual;
  these are collection-specific classifications Comic Vine does not model.

### Integration Design

Mirrors the existing TMDB/OMDb pattern so no new idiom is introduced.

1. **`app/services/integrations/comicvine.py`** — same skeleton as `tmdb.py`: a
   sliding-window rate limiter, `tenacity` retry on transient failures, module-level
   logger. Reads `settings.comicvine_api_key`. Sends an explicit `User-Agent`; Comic Vine
   blocks default client agents.
2. **Config** — add `comicvine_api_key: Optional[str] = None` to `app/config.py`, plus
   entries in `.env.example` and the env-var table in `CLAUDE.md`.
3. **Migration** — Alembic revision adding `comicvine_id` (Integer) and `comicvine_link`
   (String) to `comic`, matching the `mal_id` / `mal_link` idiom on `manga`.
   **ID-first, not name-search**: volume titles collide constantly ("Avengers" has dozens
   of volumes), so a stored ID is the only reliable handle — the same reason TMDB keys off
   the IMDb ID rather than a title.
4. **`execute_fill_comic`** — rewrite to actually fetch. For each entry that has a
   `comicvine_id` and at least one blank target field: fetch the volume, fill blanks only
   (never overwrite user-entered values), download the cover through the existing
   `download_cover_image()`, then run `run_sync_comic(db)` as it does today. Keep the SSE
   progress-yield shape used by the other fill functions.
5. **Search endpoint (optional)** — `GET /api/comic/search-comicvine?q=` so the Add form
   can look up a volume by name and drop the ID in, instead of pasting URLs by hand.

### Rate Limiting Note

Comic Vine allows roughly **200 requests/hour**, far tighter than TMDB's 40/10s. A full
backfill of a large library will not complete in one run. The limiter must be
correspondingly conservative, and `execute_fill_comic` should report how many entries were
left unfilled rather than stalling on the cap.

### Status

**Implemented.** All five steps done, plus the admin form field needed to enter a link.

| Step | Where |
| --- | --- |
| Mapper | `app/utils/comicvine_utils.py` |
| HTTP client | `app/services/integrations/comicvine.py` |
| Config | `app/config.py`, `.env.example`, `CLAUDE.md` |
| Migration | `alembic/versions/cv1d2e3f4a5b_add_comicvine_fields_to_comic.py` |
| Autofill | `autofill_comic_from_comicvine` in `app/services/domain/autofill.py` |
| Fill gate | `has_missing_values_comic` / `COMIC_FIELDS_TO_FILL` |
| Link → ID | `apply_extract_comicvine_id` in `app/services/domain/derivation.py` |
| Pipeline | `execute_fill_comic` in `app/services/pipelines/fill.py` |
| Search endpoint | `GET /api/comic/search-comicvine?q=` (admin only) |
| Sheet round-trip | `parse_comic_from_sheet` in `app/utils/formatter.py` |
| Admin form | Comic Vine Link field on the Comic Add/Modify tabs |

Tests: `tests/unit/test_comicvine_utils.py` (28), `test_comic_fill_gate.py` (14),
`test_comic_autofill.py` (9), plus two added to `test_formatter_comic.py`.

**Remaining before first use:**

1. Set `COMICVINE_API_KEY` in `.env` — sign in at comicvine.gamespot.com and copy the key
   shown on `/api/`.
2. Run `alembic upgrade head`. Note the local dev DB is currently stamped at
   `l1o2c3a4t5o6` while already carrying the `comic` table, so the chain fails before
   reaching this revision — that drift predates this work and needs resolving first.
3. Paste a Comic Vine volume URL onto each entry, then run Fill Comic.
