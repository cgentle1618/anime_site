# Series Structure — Design

**Date:** 2026-08-23
**Status:** Approved, ready for planning

## Goal

Bring the Series tier up to the structural level of Franchise: a richer data model,
full admin forms, and a real detail page at `/series/:system_id`. Series is currently
the only tier with no hub page — `Franchise` and `Collection` both have one, and
`SeriesNotes.jsx` was written in anticipation of this work but has never been mounted.

Series will resemble Franchise, not duplicate it. Three franchise concepts are
deliberately excluded (see "Excluded fields").

## Scope

**Phase 1 (this project):** data model, schemas, admin forms, detail page, navigation.

**Phase 2 (deferred, not part of this plan):** Search results, a Series Library page,
and Statistics. Each is an isolated follow-up.

---

## 1. Data model

`Series` lives in `app/models/franchise.py` alongside `Franchise`. Eight columns are
added. Declaration order matters: `format_model_for_sheet` iterates
`__table__.columns`, so the model's declaration order *is* the Google Sheets column
order for the Series tab.

Final column order:

| Column | Type | Nullable | Default | Status |
| --- | --- | --- | --- | --- |
| `system_id` | UUID | No | `uuid4()` | existing |
| `franchise_id` | UUID | Yes | — | existing, FK → `franchise.system_id` SET NULL |
| `series_name_en` | String | Yes | — | existing |
| `series_name_cn` | String | Yes | — | existing |
| `series_name_roman` | String | Yes | — | **new** |
| `series_name_jp` | String | Yes | — | **new** |
| `series_name_alt` | String | Yes | — | existing |
| `my_rating` | String | Yes | — | **new** — S/A+/A/B/C/D/E/F |
| `series_expectation` | String | Yes | `"Low"` | **new** — Highest/High/Medium/Low |
| `cover_entry_id` | UUID | Yes | — | **new** — any entry UUID, no FK constraint |
| `to_rewatch` | Boolean | Yes | `False` | **new** |
| `remark` | Text | Yes | — | existing |
| `created_at` | DateTime | No | Taipei now | **new** |
| `updated_at` | DateTime | No | Taipei now, `onupdate` | **new** |

The new name columns sit between `series_name_cn` and `series_name_alt` to match
franchise's en → cn → roman → jp → alt ordering.

### Name handling

`_name_fields` extends to all five name columns. This widens `get_all_names()`
(`app/models/base.py:30`), which is used for duplicate matching — series will now also
match on roman and JP names.

`display_name` gains the two new entries and keeps the franchise fallback order:

```
CN → EN → Alt → roman → JP
```

`names_dict` gains `roman` and `jp` keys. This is safe: the only consumer,
`resolve_series_parent_hierarchy` (`app/services/domain/hierarchy.py:51`), reads it via
`.get()` and iterates `names.values()`. It is also a small improvement — series→franchise
auto-matching starts checking roman/JP names, and an auto-created parent franchise
inherits `franchise_name_roman` / `franchise_name_jp`.

### Excluded fields

| Field | Why not |
| --- | --- |
| `franchise_type` | Series has no type concept. |
| `collection_id` | Collection is an umbrella over franchises, not series. |
| `type_covers` | A dict keyed *by franchise type* (`{"ACG": uuid}`). With no series type there is no key to map on, so it collapses into `cover_entry_id`. |
| `type_slots` | Serves only the Favorite 3×3 grid (`Fav3x3ModifyTab.jsx`), a franchise-level curation feature with no series equivalent. |
| `watch_next_group` | Its only consumer is `PlanWatchNext.jsx`, which buckets franchises on the Plan page. Adding it to series is meaningful only if that page should list series too. Deferred. |

### Relationships

None added. `Series` declares only `animes`, and `Franchise` likewise declares only
`series` + `animes`. Neither detail page uses ORM relationships — both fetch per-type
over the API. Adding `movies` / `tv_shows` / `cartoons` / `mangas` / `novels`
back-populations would be unused weight.

### Migration

One Alembic revision, `down_revision = "note_drop_jsonb"` (current head). Eight
`op.add_column` calls on `series`, all nullable, plus server defaults for `to_rewatch`
and the two timestamps so existing rows backfill. No data migration.

Reordering the model's column declarations needs no migration — physical DB column
order is unaffected.

### Google Sheets

Self-managing. `backup.py:139` builds the Series header row from
`Series.__table__.columns`, and `parse_series_from_sheet` (`app/utils/formatter.py:275`)
reads by header *name*, not position. The next Backup widens the Series tab
automatically. The parser gains the eight new fields with the same
`parse_from_sheet(raw.get(...), type)` treatment franchise uses.

---

## 2. API & schemas

The router needs no changes. `create_series` builds
`models.Series(**series_in.model_dump())` and `update_series` applies
`model_dump(exclude_unset=True)` — both generic.

`app/schemas/franchise.py`:

- `SeriesBase` gains `series_name_roman`, `series_name_jp`, `my_rating`,
  `series_expectation` (default `"Low"`), `cover_entry_id`, `to_rewatch`.
- `SeriesResponse` gains `created_at` and `updated_at`.
- `SeriesSheetSync` gains the timestamps, mirroring `FranchiseSheetSync`.

Entry-list filtering already works everywhere the page needs it: `anime.py:46` declares
`series_id` explicitly, and `registry.py` includes `series_id` in `list_filters` for
movie, tv_show, cartoon, manga, and novel. `anime_movie` has no `series_id` column by
design and is excluded throughout.

---

## 3. Admin forms

`SeriesAddTab.jsx` and `SeriesModifyTab.jsx` are near-identical 77-line twins with a
single `SectionHeader`. Both move to franchise's three-section layout:

| Section | Fields |
| --- | --- |
| Titles & Naming | Parent Franchise combo, Series Name EN, then a 2-col grid: CN / roman / JP / Alt |
| Other Information | My Rating, Expectation — 2-col, same option lists as franchise |
| Cover Images | Main Cover (Modify only), To Rewatch, Remark |

**Main Cover appears on Modify only.** A newly created series has no entries, so the
dropdown would be empty — this matches franchise, where `FranchiseModifyTab.jsx` builds
the options and `FranchiseAddTab.jsx` does not.

The dropdown reuses `FranchiseModifyTab.jsx:44-70`'s pattern: build a combined entry
list from the already-loaded `allAnime` / `allMovies` / `allTvShows` / `allCartoons` /
`allMangas` / `allNovels` props, filtered by `series_id === editingItem.system_id`,
tagged with `_type`, sorted newest-first via `getEntryYear`. `allAnimeMovies` is
excluded. The blank option is `— Auto (latest with cover) —`.

Supporting edits:

- `formFactories.js:320` — `defaultSeries()` gains the six new keys.
- `Modify.jsx` — series prefill and submit payload gain the six fields.
- `Add.jsx` — series submit payload gains the five non-cover fields.

Not touched: `app/routers/series.py`, `_factory.py`, `Delete.jsx`.

---

## 4. Series detail page

### Files & route

- `App.jsx` — `<Route path="/series/:system_id" element={<Series />} />`, placed
  beside the franchise route.
- `pages/detail/Series.jsx` — thin wrapper, mirroring `Franchise.jsx`.
- `pages/detail/SeriesPage.jsx` — the page.

This also fixes the dead link at `DataHistory.jsx:318`, which already points at
`/series/${s.system_id}`.

### Data load

One `Promise.all`, mirroring `FranchisePage.jsx:246-268`:

- `GET /api/series/{id}`
- `GET /api/franchise/{franchise_id}` for the parent badge (skipped when null)
- six entry lists filtered by `?series_id=` — anime, movie, tv-show, cartoon, manga, novel

No anime-movie fetch.

### Hero

Mirrors franchise's hero:

- Cover from `cover_entry_id`, falling back to the newest entry that has a cover.
- Name stack from `display_name` plus a secondary name.
- Inline-editable My Rating, Expectation, and To Rewatch, saved through
  `PATCH /api/series/{id}` — the same `saveField` shape as `FranchisePage.jsx:450`.
- Clipped remark with a modal, reusing franchise's remark pattern.

One deliberate difference: franchise shows a **collection** badge; series shows a
**parent franchise** badge linking to `/franchise/:id`.

No Watch Next Group control, since the column is excluded.

### Tabs

Franchise gates media tabs on `franchise_type` *and* list length
(`FranchisePage.jsx:330-339`). Series has no type, so gating is purely on list length:

- **Media tabs:** Anime, Manga, Novel, Movies, TV Shows, Cartoons — each shown only
  when its list is non-empty.
- **Always-on tabs:** Watch Order, Notes — always offered, matching franchise's
  `extraTabs` reasoning: an admin needs the entry point precisely when the section is
  still empty.

There is no Anime Movies tab.

All three always-on tabs already work server-side:

- `WatchOrder` has a `series_id` column with a CHECK that exactly one of
  `franchise_id` / `series_id` is set (`app/models/watch_order.py:39-41`), and
  `GET /api/watch-order/lists` already accepts `series_id`
  (`app/routers/watch_order.py:398`). The one gap is frontend:
  `WatchOrderSection.jsx:17` takes only `franchiseId` / `collectionId` and needs a
  `seriesId` prop threaded through its list fetch and its create payload.
- `note` resolves owners through `TIER_TABLES`, which includes series
  (`app/utils/media_resolver.py:77`).
- `SeriesNotes.jsx` mounts as a one-line change — its header comment states it was
  written for exactly this moment. Its stale "Not yet mounted anywhere" note gets
  removed.

### Dropped from the franchise version

The per-tab group-by-series toggles (`animeGroupBySeries`, `movGroupBySeries`,
`tvGroupBySeries`, `cartoonGroupBySeries`, `mangaGroupBySeries`, `novelGroupBySeries`)
are meaningless inside a single series and are omitted. Sort and filter controls stay.

---

## 5. Navigation

`mediaRegistry.js:13` — set `series.navPath` from `null` to `"/series"`. Four consumers
already read `navPath` and no-op when it is null, so they start linking to series with
no further edits: `MediaCard.jsx:611`, `GroupedEntryPage.jsx:137`,
`WatchOrderGuide.jsx:145`, `WeeklySchedule.jsx:26`.

### SeriesModal is retired

`components/modals/SeriesModal.jsx` is deleted. Its seven consumers become links,
matching how franchise is already a `<Link>` directly beside the series button
(`Anime.jsx:451`):

- `Anime.jsx`, `Movie.jsx`, `TV.jsx`, `Cartoon.jsx`, `Manga.jsx`, `Novel.jsx` — the
  purple series button in the Franchise / Series bar becomes
  `<Link to={`/series/${series.system_id}`}>`, keeping its existing styling. The
  `showSeriesModal` state and import are removed from each.
- `FranchisePage.jsx` — the series click at line 1255 becomes a link; the
  `selectedSeries` / `showSeriesModal` state and the render block at line 2316 are
  removed.

---

## 6. Testing

No series API tests exist today — `tests/api/` has `test_franchise.py` but nothing for
series.

- **New `tests/api/test_series.py`**, modeled on `test_franchise.py`: create with the
  new fields round-trips; PATCH of a single field leaves the others intact;
  `series_expectation` defaults to `"Low"`; `created_at` / `updated_at` are present and
  `updated_at` advances on write; `display_name` follows CN → EN → Alt → roman → JP;
  `names_dict` carries roman/jp into franchise auto-resolution.
- **Sheets round-trip:** a unit test that `parse_series_from_sheet` handles all eight
  new fields, including blank cells.
- **Regression:** confirm no remaining import of `SeriesModal` after deletion.

---

## Files touched

**Backend**

- `app/models/franchise.py` — `Series` columns, `_name_fields`, `display_name`, `names_dict`
- `app/schemas/franchise.py` — `SeriesBase`, `SeriesResponse`, `SeriesSheetSync`
- `app/utils/formatter.py` — `parse_series_from_sheet`
- `alembic/versions/<new>.py` — eight columns on `series`
- `tests/api/test_series.py` — new

**Frontend**

- `App.jsx` — route
- `pages/detail/Series.jsx` — new
- `pages/detail/SeriesPage.jsx` — new
- `pages/detail/SeriesNotes.jsx` — remove stale comment
- `pages/add-tabs/SeriesAddTab.jsx`, `pages/modify-tabs/SeriesModifyTab.jsx`
- `pages/admin/Add.jsx`, `pages/admin/Modify.jsx` — series payloads
- `config/formFactories.js` — `defaultSeries`
- `config/mediaRegistry.js` — `navPath`
- `pages/detail/{Anime,Movie,TV,Cartoon,Manga,Novel}.jsx` — modal → link
- `pages/detail/FranchisePage.jsx` — modal → link
- `components/tracker/WatchOrderSection.jsx` — add `seriesId` prop
- `components/modals/SeriesModal.jsx` — deleted

**Docs**

- `docs/database-schema.md` — series table, constraints, and the "no roman/jp,
  no timestamps" notes
- `docs/pages.md`, `docs/admin-forms.md`, `docs/api.md`, `docs/reusable-elements.md`
  (SeriesModal removal)
