# Comic Feature Parity Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `comic` to parity with the other media types on the seven cross-cutting features that enumerate types by hand, plus one display bug the audit surfaced.

**Architecture:** Same split the earlier comic passes hit. *Derived* consumers (`MEDIA_REGISTRY`, `MEDIA_TABLES`, `mediaRegistry.js`) already carry comic and need nothing. Every remaining gap is a *hand-written* per-type list or `if` branch that silently omits a type not added to it. Comic mirrors **Manga** here rather than Novel — the surfaces in scope (reading status, serialization status, duplicate detection) are the ones where manga is the closest shape.

**Spec:** `docs/superpowers/specs/2026-08-28-comic-feature-parity-design.md`

**No migration.** Nothing in this plan touches the database.

## Global Constraints

- **After any frontend change, run `cd frontend && npm run build`.** Uvicorn on :8000 serves the prebuilt `frontend_dist/`. `frontend_dist/` is gitignored.
- Frontend tests: `cd frontend && npm run test:run`. Backend tests: `pytest`.
- **`frontend/src/utils/anime.test.js` fails pre-existing** — it imports a `./anime.js` that does not exist. Do not fix it; add no new failures.
- Comic's display name falls back **EN → CN → Alt**, unlike every other type. Any new name-column list must be ordered `comic_name_en, comic_name_cn, comic_name_alt`.
- Comic has **no MAL/AniList fields**. Duplicate detection keys on `comicvine_id`, not `mal_id`.
- Progress is **issues** — `issue_total` / `issue_fin`. Not chapters, not volumes.
- `serialization_status` shares manga's four values; `reading_status` shares `READING_STATUSES`.
- **Concurrent sessions:** other Claude sessions may be editing this tree. Stage only the files a task names. Never `git add -A`, never `checkout --` / `restore` / `stash` / `reset` on shared files. Re-read a file if an edit fails to match.
- **Do not commit.** The user commits after review.

## Already correct — do not touch

- Relations graph (`app/utils/media_resolver.py` `MEDIA_TABLES` includes comic).
- Watch order **backend** (`watch_order.py:41,55,64,257`).
- `FranchisePage.jsx` (44 comic references).
- `watch_order_item.ep_start/ep_end` and `supportsEpisodeRange` — comic already accepts ranges.

## Out of scope

Plan pages (`read_next` / `to_reread` UI). Note-section membership — comic keeps its twelve sections; none added, none removed.

---

## Phase A — unblock finished backends

- [x] **A1.** `WatchOrderGuide.jsx` — add `comic: "Comic"` to `TYPE_LABELS`.
- [x] **A2.** `WatchOrderGuide.jsx` — replace `rangeLabel`'s two-way unit ternary with a map: manga/novel → `Ch`, comic → `#`, default `Ep`.
- [x] **A3.** `WatchOrderEditor.jsx` — add `comic: "Comic"` to its `TYPE_LABELS`, and mention comic in the from/to comment that currently lists only movie/manga/novel as whole-only.
- [x] **A4.** `watchOrderRange.test.js` — assert `supportsEpisodeRange("comic") === true`.
- [x] **A5.** `NotesTemplate.jsx` — render the Notes `GroupCard` only when `flat.length > 0`.
- [x] **A6.** `npm run test:run`, then `npm run build`.

## Phase B — make comics findable

- [x] **B1.** `useGlobalMediaSearch.js` — add `["/api/comic", "comic"]` to `SEARCH_ENDPOINTS`; confirm `getDisplayName` resolves comic (it reads `NAMING_CONFIGS`, which already has comic).
- [x] **B2.** `Search.jsx` — `needsComic` scope flag, `useMediaList("comic")` query, comic in the pending/settled list, `allComics` state, a match block over `comic_name_en/cn/alt`, a result section, and a "Comic" scope chip.
- [x] **B3.** `SeriesPage.jsx` — `comicList` state, fetch by `series_id`, `comicSort` / `comicFilters` mirroring manga's (serialization + reading status), the filtered/sorted memo, `"Comic"` in the section-presence list, and the render block.
- [x] **B4.** `CollectionPage.jsx` — comic fetch, count and section.
- [x] **B5.** `CollectionLibrary.jsx` — comic counted and linked.
- [x] **B6.** `npm run test:run`, then `npm run build`.

## Phase C — parity polish

- [x] **C1.** `useStatisticsData.js` — `comicQuery`, `allComic`, `_type: "comic"` in the combined array, and comic in the returned object.
- [x] **C2.** `statsUtils.js`, `StatsCompletions.jsx`, `Completions.jsx` — comic handling.
- [x] **C3.** `MemeOwnerPicker.jsx`, `QuoteEntryPicker.jsx`, `GroupedEntryPage.jsx` `MEDIA_TYPE_FILTERS` — comic entries.
- [x] **C4.** `app/services/domain/duplicates.py` — `find_duplicate_comic` mirroring `find_duplicate_manga`, keyed on `comicvine_id` plus the three name columns; register under `"comic"` in `find_all_duplicates`.
- [x] **C5.** `app/services/domain/remarks.py` — comic branch in the entry map.
- [x] **C6.** `ReviewQueue.jsx` and `DataHistory.jsx` — comic tab.
- [x] **C7.** Tests: `find_duplicate_comic` in `tests/unit`. Run `pytest` and `npm run test:run`, then `npm run build`.

## Phase D — documentation

- [x] **D1.** Update `docs/pages.md`, `docs/business-logic.md` and `docs/current-plan.md` for the parity pass.
