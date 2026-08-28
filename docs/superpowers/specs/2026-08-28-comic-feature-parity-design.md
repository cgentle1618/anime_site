# Comic Feature Parity — Design

**Date:** 2026-08-28
**Status:** Approved for implementation

## Context

`comic` landed as a full media type: CRUD via `MEDIA_REGISTRY` (`app/registry.py:157`),
a detail page, notes page, library page, add/modify tabs, dashboard card, Comic Vine
fill, and cover sync. What it did not get is the cross-cutting features that enumerate
media types by hand.

An audit — every file mentioning `manga` but not `comic`, each hit verified — found the
gaps below. Two subsystems were checked and are **already correct**, so they are out of
scope:

- **Relations graph.** Driven by `MEDIA_TABLES` in `app/utils/media_resolver.py:58`,
  which includes comic.
- **Watch order backend.** `MEDIA_TYPE_MODELS`, `_STATUS_FIELDS`, `_TOTAL_FIELDS`
  (→ `issue_total`) and the `release_year` sort key all carry comic
  (`app/services/domain/watch_order.py:41,55,64,257`).
- **Franchise page.** `FranchisePage.jsx` already handles comic (44 references).

## Goals

Bring comic to parity on the seven features the audit found missing, plus one display
bug the audit surfaced. Out of scope: the plan pages (`read_next` / `to_reread` still
have no UI, deliberately deferred).

## Decisions

### Issue ranges on watch order steps

A comic step **supports an issue range** (`Issues 1–12`), not whole-run-only.

This costs nothing structurally. `watch_order_item.ep_start` / `ep_end` are generic
`Integer` columns, and `supportsEpisodeRange` is a *blocklist*:

```js
const WHOLE_ONLY_TYPES = new Set(["movie", "anime-movie", "manga", "novel"]);
export const supportsEpisodeRange = (mediaType) => !WHOLE_ONLY_TYPES.has(mediaType);
```

Comic is not in that set, so the from/to inputs already render and already persist. No
migration and no schema change is required. The only work is the display unit: the guide
hardcodes `Ch` for manga/novel and `Ep` otherwise, and comic wants `#`.

### The empty Notes card

Comic is in `ALL_OWNERS`, so it already owns twelve note sections. Of those, exactly one
— `remark` — is ungrouped, and `NotesTemplate` builds its "Notes" card from the ungrouped
set. `Comic.jsx:509` passes `hideSections={comic.remark ? ["remark"] : []}` to avoid two
editors on one screen, which empties that set entirely and leaves a bare **Notes** card
rendering beside Reviews and Analysis.

The fix is general rather than comic-specific: render the Notes card only when it has at
least one section. Any owner type whose ungrouped set is fully hidden benefits.

No note sections are added or removed. Comic keeps the twelve it has.

## Scope

### Phase A — unblock finished backends

| Item | Change |
| --- | --- |
| Watch order labels | `comic: "Comic"` in `TYPE_LABELS` (`WatchOrderGuide.jsx`, `WatchOrderEditor.jsx`) |
| Watch order unit | `rangeLabel` unit switch: manga/novel → `Ch`, comic → `#`, else `Ep` |
| Empty Notes card | `NotesTemplate.jsx` renders the Notes `GroupCard` only when `flat.length > 0` |

### Phase B — make comics findable

| Item | Change |
| --- | --- |
| Nav search | `["/api/comic", "comic"]` in `SEARCH_ENDPOINTS`; comic branch in `getDisplayName` |
| Search page | `needsComic` scope, `useMediaList("comic")`, result block, scope chip |
| Series page | Comic list state, fetch by `series_id`, sort/filter mirroring manga, section-presence entry |
| Collection page | Same, at its smaller scale |
| Collection library | Comic counted and linked |

### Phase C — parity polish

| Item | Change |
| --- | --- |
| Statistics | `comicQuery` in `useStatisticsData.js`; comic in `statsUtils.js`, `StatsCompletions.jsx`, `Completions.jsx` |
| Meme / Quote | Comic in `MemeOwnerPicker`, `QuoteEntryPicker`, `MEDIA_TYPE_FILTERS` |
| Duplicates | `find_duplicate_comic` keyed on `comicvine_id` + three name columns; registered in `find_all_duplicates` |
| Remarks | Comic branch in `remarks.py` |
| Review queue | Comic tab in `ReviewQueue.jsx`, `DataHistory.jsx` |

## Non-goals

- Plan pages (`read_next`, `to_reread`). The columns exist; the UI stays deferred.
- New or removed note sections.
- Any change to the Comic Vine integration.
- Any database migration. Nothing in this work needs one.

## Testing

- **Vitest** — `supportsEpisodeRange` and the comic unit label; the Notes-card
  render condition.
- **Pytest** — `find_duplicate_comic`, following the existing duplicate-detection
  tests in `tests/unit`.
- `cd frontend && npm run build` after each phase, per CLAUDE.md, so :8000 does not
  serve a stale bundle.
