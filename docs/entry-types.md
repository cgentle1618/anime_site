# Entry types and grouping tiers

Last verified: 2026-09-05

## What this is for

Everything in the tracker is either a **media entry** (one anime season, one movie, one comic run...) or a **grouping tier** that holds entries together. This page explains what each tier is for, what each of the eight media types is for, and then lays out — in one matrix — what each media type does and does not support (status vocabulary, progress unit, external source, plan/rewatch scopes, size buckets, notes, pipelines, duplicate rule). Column-by-column table schemas live in [data-model.md](data-model.md); derivation and checking rules live in [business-rules.md](business-rules.md). This page links to them rather than repeating them.

## The grouping tiers

The hierarchy is `Collection → Franchise → Series → entry`. Only Franchise is (nearly) mandatory; the other two are optional.

| Tier | Table | What it is for | Type? | Parent | Detail route |
|---|---|---|---|---|---|
| Collection | `collection` | Optional umbrella over several *distinct* franchises that share an IP or creator (the model docstring's examples: "Marvel" over MCU / X-Men / Spider-Man, "Type-Moon" over Fate/stay night / Tsukihime / Kara no Kyoukai). "Deliberately inert: no derivation, no duplicate detection, no stats." Entries never point at a collection directly — only through `Franchise.collection_id`. | no | — | `/collection/:system_id` |
| Franchise | `franchise` | "Top-level media franchise entity. Groups related series and individual entries." Every entry resolves to a franchise; if a form or sheet row names one that does not exist, it is **auto-created** (see below). | `franchise_type` | `collection_id` (nullable, `ON DELETE SET NULL`) | `/franchise/:system_id` |
| Series | `series` | "Intermediate grouping layer. Links individual entries to a parent Franchise." A series has **no type** and **no `collection_id`**; it is a deliberate sub-grouping and is **never auto-created** (an unknown series name resolves to `None` with a warning). `anime_movies` has no `series_id` column at all. | no | `franchise_id` | `/series/:system_id` (no library page) |

Library pages exist for collection (`/library/collection`) and franchise (`/library/franchise`); series has none.

### `franchise_type` values

Two lists exist on purpose (see the comment above `FRANCHISE_TYPES` in `app/utils/constants.py`, Ruling R10 of the options redesign):

| Where | Values |
|---|---|
| `FranchiseType` enum (backend logic, auto-creation) | `"Anime"`, `"Movie"`, `"TV"`, `"Cartoon"`, `"Comic"`, `"ACG"`, `"Novel"` |
| `FRANCHISE_TYPES` tuple (what `/api/constants` serves to the dropdown) | `"ACG"`, `"Anime Movie"`, `"TV"`, `"Movie"`, `"Cartoon"`, `"Comic"`, `"Novel"` |

A franchise may carry a comma-separated list of types; duplicate detection buckets it under each one.

### Auto-created franchise type per media (`FRANCHISE_TYPE_FOR`, `app/services/domain/hierarchy.py`)

| Media / owner key | Stamped `franchise_type` |
|---|---|
| `"anime"` | `FranchiseType.ANIME` (`"Anime"`) |
| `"anime-movie"` | `FranchiseType.ANIME` (`"Anime"`) |
| `"series"` | `FranchiseType.ANIME` (`"Anime"`) |
| `"movie"` | `FranchiseType.MOVIE` (`"Movie"`) |
| `"tv-show"` | `FranchiseType.TV` (`"TV"`) |
| `"cartoon"` | `FranchiseType.CARTOON` (`"Cartoon"`) |
| `"manga"` | `FranchiseType.ACG` (`"ACG"`) |
| `"novel"` | `FranchiseType.NOVEL` (`"Novel"`) |
| `"comic"` | `FranchiseType.COMIC` (`"Comic"`) |

Resolution rule (module docstring): a UUID passes through; a non-empty string is looked up case-insensitively across all five franchise name columns; a blank cell falls back to the entry's own titles; nothing found creates a franchise with the type above and whatever names were available.

## The eight media types

Media-type keys are the hyphenated values in `MEDIA_TABLES` (`app/utils/media_resolver.py`); they are what `plan_next`, `media_relation`, `watch_order_item`, `note`, `quote` and `meme` store as a discriminator. Router/registry names use underscores (`anime_movie`, `tv_show`).

| Key | Table | Model docstring / purpose |
|---|---|---|
| `anime` | `anime` | One Japanese animation entry per season/cour or per OVA/special/movie-format release. `airing_type` is one of `"TV"`, `"ONA"`, `"OVA"`, `"OAD"`, `"Special"`, `"Movie"` (enum) — the dropdown adds `"Other"`. |
| `anime-movie` | `anime_movies` | A theatrical anime film tracked in its **own table**, with MAL metadata and no series link. |
| `movie` | `movies` | "Live-action and animated movie entries." `movie_type` is `"Reality"` or `"Animation"`. |
| `tv-show` | `tv_shows` | "Live-action and scripted TV show entries." One entry per season (`season_part`). |
| `cartoon` | `cartoons` | "Western animated TV show entries." `airing_type` is one of `"TV"`, `"Movie"`, `"OVA"`, `"Special"`. |
| `manga` | `manga` | "Manga, manhwa, and manhua entries." |
| `novel` | `novel` | "Light novel, web novel, and book entries." `novel_type` is `"Light Novel"`, `"Novel"`, `"Web"` or `"Other"`. |
| `comic` | `comic` | "Western comic runs, Marvel-focused. One entry is one numbered run." `comic_type` is `"Ongoing"`, `"Limited"`, `"One-Shot"` or `"Annual"`. |

All eight are implemented with their own router under `app/routers/` and their own detail page in `frontend/src/App.jsx`. (CLAUDE.md still says Novel is "not implemented yet"; the code disagrees.)

### Novel unit structure (`novel_unit`, `NOVEL_UNIT_KINDS_BY_TYPE`)

A novel is not one flat progress counter — it optionally holds `novel_unit`
child rows (volume / arc / story / chapter), and `novel.type` decides which
kinds the editor (`NovelUnitsEditor`) offers:

| `novel.type` | Kinds offered | Structure |
|---|---|---|
| `Light Novel` | `volume` | Volumes only, for display (subtitles, per-volume remarks). Progress is tracked flat via `vol_fin` / `vol_total_original` / `vol_total_tw` — volume rows never feed those columns (Decision B). Counts **nothing else**: see "Volume-only types" below. |
| `Novel` | `volume` | Same as Light Novel. |
| `Web` | `arc` | Two-stage progress: `arc_fin` (arcs fully finished) and `ch_fin_in_arc` (chapters into the current arc). `arc_total`, `ch_total` and `ch_fin` are derived from the arc rows' `ch_count` on every write — see `app/services/domain/novel_units.py` and [business-rules.md](business-rules.md). |
| `Other` | `volume`, `story`, `chapter` | Free-form structure for entries that fit neither pattern (e.g. a short-story collection); `story` and `chapter` rows are display-only, the same as `volume`. |

### Which counter a novel shows

`progress_display` picks the counter; the dropdown that sets it is built per
entry by `progressDisplayOptions(novel)` (`frontend/src/lib/novelUnits.js`),
never from a flat list, so a novel is only ever offered a counter it can
actually render:

| `novel.type` | Offered | Not offered |
|---|---|---|
| `Light Novel`, `Novel` | Default, `vol_original`, `vol_tw` | every chapter and arc counter |
| `Web` | Default, `ch` — plus `arc` and `arc_ch` **once the entry has arc rows** | every volume counter |
| `Other`, unset | Default, `vol_original`, `vol_tw`, `ch` | the arc counters (only Web holds arc rows) |

The five counters render as:

| Value | Tracker row | Cover rule |
|---|---|---|
| `vol_original` / `vol_tw` | `Volumes`, editable | `Volumes 3 / 11 · 27%` |
| `ch` | `Chapters`, editable — **read-only when the novel has arc rows**, because `ch_fin` is derived from them and an edit here would be overwritten on the next save | `Chapters 21 / 87 · 24%` |
| `arc` | `Arcs`: `arc 7 / 8 · 倒吊人` — the arc being read, its name, and the arc count. Stepping closes or reopens a whole arc and resets `ch_fin_in_arc` | `Arcs 6 / 8 · 75%` (arcs *finished*) |
| `arc_ch` | `Arc / Chapter`, the two-stage stepper | `Chapters`, the derived absolute pair |

`countsVolumes()` is the volume-side counterpart of `countsChapters()`, and
the two are deliberately asymmetric. Chapters on a light novel are
*meaningless*, so the server clears them. Volumes on a web novel are merely
*not the counter in use* — a web novel can get a print run later — so for
`Web` the columns are kept untouched and only hidden: no Volumes tracker row,
no volume inputs in the Add and Modify forms. Change the type back and the
numbers are still there.

An override the type cannot render is ignored. `effectiveProgressDisplay()`
falls back to the derived mode when the stored value is not in that entry's
option list — a `Web` row still holding `vol_tw` after a type change or a
Pull, say. The select still *shows* the stored value (appended by
`withLegacyProgressDisplay`, labelled `(legacy)`) so it is visible rather
than silently swapped, but nothing renders a row for it.

### Volume-only types

A type whose only allowed kind is `volume` — `Light Novel` and `Novel` — counts
volumes and nothing else. Its `arc_total`, `ch_total`, `arc_fin`, `ch_fin` and
`ch_fin_in_arc` are not empty, they are *meaningless*, so nothing renders or
edits them: no chapter row in `NovelTrackerBlock`, no chapter total on the
cover rule (it counts volumes instead), and no arc/chapter inputs in the Add
and Modify forms.

The rule is enforced where the data is, not only in the UI.
`derive_novel_progress()` clears those five columns for these types on every
write path — the forms, the tracker's inline PATCH, Pull, Fill and Calculate —
so a value cannot come back in through any of them, including a sheet that
still carries one. Arc rows arriving from a Pull are ignored for derivation and
deleted by the migration; the editor cannot create them.

The type list is `NOVEL_VOLUME_ONLY_TYPES` (`app/utils/constants.py`), derived
from `NOVEL_UNIT_KINDS_BY_TYPE` rather than typed a second time, and mirrored
in `frontend/src/lib/novelUnits.js` as `countsChapters()`. An unset or
unrecognised type is *not* volume-only: it keeps its chapter pair, on both
sides. Migration `v1o2l3o4n5l6` cleared the historical values once — it is not
reversible, since nothing else records what `ch_total` was.

Only `arc` rows are authoritative for derivation; every other kind is
enrichment shown on the detail page via `display_key` (`unit_display_key` /
`unitDisplayKey`: an explicit `unit_key`, or a generated `"Vol 1"`/`"Arc 2"`
style label). Vocabulary source and drift guard: [options.md](options.md#novel-unit-kinds-apputilsconstantspy).

## Common points of confusion (from CLAUDE.md)

- **Anime Movie is not the same as Anime with `airing_type` "Movie".** Anime Movie has its own table `anime_movies`; an anime with `airing_type = "Movie"` lives in `anime`. "Anime Movie" almost always means the `anime_movies` rows.
- **"Reality franchise"** means a franchise whose type is "TV or Movie".
- **"Group"** usually means the grouping tiers collectively — collection, franchise, series — as opposed to individual media entries.

## Capability matrix

### Status, names, progress, source

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` |
|---|---|---|---|---|---|---|---|---|
| Status column | `watching_status` | `watching_status` | `watching_status` | `watching_status` | `watching_status` | `reading_status` | `reading_status` | `reading_status` |
| Status vocabulary | `WatchStatus` | `WatchStatus` | `WatchStatus` | `WatchStatus` | `WatchStatus` | `ReadStatus` | `ReadStatus` | `ReadStatus` |
| Default status | `"Might Watch"` | `"Might Watch"` | `"Might Watch"` | `"Might Watch"` | `"Might Watch"` | `"Might Read"` | `"Might Read"` | `"Might Read"` |
| Display-name fallback (model `display_name`) | CN → EN → Alt → roman → JP | CN → EN → Alt → roman → JP | CN → EN → Alt | CN → EN → Alt | CN → EN → Alt | CN → EN → Alt → roman → JP | CN → EN → Alt → roman → JP | **EN → CN → Alt** |
| Name order in `NAMING_CONFIGS` (frontend) | cn, en, roman, jp, alt | cn, en, roman, jp, alt | cn, en, alt | cn, en, alt | cn, en, alt | cn, en, roman, jp, alt | cn, en, roman, jp, alt | en, cn, alt |
| Progress columns | `ep_fin` / `ep_total` (+ `ep_previous`, `ep_special`) | — (one sitting) | — (one sitting) | `ep_fin` / `ep_total` | `ep_fin` / `ep_total` | `ch_fin` / `ch_total`, `vol_fin` / `vol_total`, `vol_fin_page` | `ch_fin` / `ch_total` / `ch_fin_in_arc` (derived from `novel_unit` arc rows; cleared outright on `Light Novel` and `Novel`), `vol_fin` / `vol_total_original` / `vol_total_tw` (never derived), `arc_fin` / `arc_total`, `progress_display`, `units` | `issue_fin` / `issue_total` |
| Other status column | `airing_status` | `airing_status` | `airing_status` | `airing_status` | `airing_status` | `serialization_status` | `serialization_status` | `serialization_status` |
| External id / link | `mal_id` / `mal_link` (Tenrai) | `mal_id` / `mal_link` (Tenrai) | `imdb_id` / `imdb_link` (TMDB + OMDb) | `imdb_id` / `imdb_link` (TMDB + OMDb) | `imdb_id` / `imdb_link` (TMDB + OMDb) | `mal_id` / `mal_link` (Tenrai) | `mal_id` / `mal_link` (Tenrai) | `comicvine_id` / `comicvine_link` (Comic Vine) |
| Sources card heading | Where to Watch | Where to Watch | Where to Watch | Where to Watch | Where to Watch | Where to Read | Where to Read | Where to Read |
| Access `main` platforms | baha, netflix, disney_plus, prime, bilibili, crunchyroll | (same as anime) + Cinema | netflix, disney_plus, prime, hbomax, apple_tv | netflix, disney_plus, prime, hbomax, apple_tv | netflix, disney_plus, prime, hbomax, apple_tv | none | none | none |
| Reference `main` sources | official, twitter, anilist, wiki, fandom, keyframe_staff | (same as anime) | wiki | wiki | wiki | twitter, anilist, wiki, fandom | twitter, anilist, wiki, fandom | official, wiki, fandom |
| Origin/exclusivity tag field | `exclusive_source` (single) | `exclusive_source` (single) | `original_source` (multi) | `original_source` (multi) | `original_source` (multi) | `serialization_platform` (multi) | `serialization_platform` (multi) | — |

Every type also gets `other` and `restricted` free-form access/reference
buckets on `media_source`, gated by the `sources_other` / `sources_restricted`
field groups. Table and column detail: [data-model.md](data-model.md#media_source);
authorization: [authorization.md](authorization.md); the rule that decides
column vs. `media_source` row: [business-rules.md](business-rules.md).

Status values themselves are listed in [options.md](options.md). The frontend `MEDIA_CONFIG` (`frontend/src/config/mediaRegistry.js`) mirrors the status column as `statusField` and `statusType: "watch" | "read"`.

### Pages

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` |
|---|---|---|---|---|---|---|---|---|
| Library page | `/library/anime` | `/library/anime-movie` | `/library/movie` | `/library/tv-show` | `/library/cartoon` | `/library/manga` | `/library/novel` | `/library/comic` |
| Detail route | `/anime/:system_id` | `/anime-movie/:system_id` | `/movie/:system_id` | `/tv-show/:system_id` | `/cartoon/:system_id` | `/manga/:system_id` | `/novel/:system_id` | `/comic/:system_id` |
| API base (`MEDIA_CONFIG.apiEndpoint`) | `/api/anime` | `/api/anime-movie` | `/api/movies` | `/api/tv-shows` | `/api/cartoon` | `/api/manga` | `/api/novel` | `/api/comic` |
| Dashboard card on `/` (`Index.jsx`) | `DashboardCard` | none | none | `DashboardCard` | `DashboardCard` | `DashboardCard` (reading section) | `NovelDashboardCard` | `ComicDashboardCard` |

`/library/:type` is one page (`frontend/src/pages/library/Library.jsx`) that picks a config from `LIBRARY_CONFIGS` (`frontend/src/pages/library/configs/index.js`), which has exactly these eight keys. The dashboard loads `anime`, `franchise`, `tv-show`, `cartoon`, `manga`, `novel` and `comic` lists; movies and anime movies never appear on it.

### Plan-next, rewatch, size buckets (`app/utils/plan_next_kinds.py`)

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` |
|---|---|---|---|---|---|---|---|---|
| `ALLOWED_SCOPES["next"]` | `entry`, `series`, `franchise` | `entry` | `entry`, `series`, `franchise` | `entry`, `series`, `franchise` | `entry`, `series`, `franchise` | `entry` | `entry` | `entry`, `series` |
| `ALLOWED_SCOPES["rewatch"]` | `franchise` | `entry` | `entry`, `series`, `franchise` | `entry`, `series`, `franchise` | `franchise` | `entry` | `entry`, `series`, `franchise` | `entry`, `series` |
| Virtual plan flags (`PLAN_FLAG_FIELDS`) | `watch_next` | `watch_next`, `to_rewatch` | `watch_next`, `to_rewatch` | `watch_next`, `to_rewatch` | `watch_next` | `read_next`, `to_reread` | `read_next`, `to_reread` | `read_next`, `to_reread` |
| Size buckets (`SIZE_THRESHOLDS`) | `12ep` (≤12), `24ep` (≤24), `30ep_plus` | none | `standalone` (1), `2_3movies` (≤3), `4movies_plus` | `1season`, `2season`, `3season_plus` | `1season`, `2season`, `3season_plus` | none | none | `1_3` (≤3), `4_10` (≤10), `11_plus` |
| Measured against (`SIZE_MEASURE`) | `sum_ep_total` | — | `count` | `count` | `count` | — | — | `sum_issue_total` |
| Where the bucket lives | series/franchise maps | — | series/franchise maps | series/franchise maps | series/franchise maps | — | — | **the entry's own `issue_total`** |

Why the two scope maps differ (module comment): "anime is queued one season at a time but rewatched as a whole franchise, and novels are reread at every tier though they are only ever queued one book at a time." A type has an entry-level rewatch flag if and only if `"entry"` is in its rewatch scopes (asserted at import).

Buckets are stored on franchise and series as two JSONB maps keyed by media type (`size_group_derived`, written by Calculate; `size_group_manual`, written by the admin and never touched by Calculate); manual wins. An entry's bucket is resolved at display time from its series, then its franchise — except comic, which buckets on its own `issue_total` (`app/services/domain/size_group.py`). Details and the Plan page: [systems/plan-next.md](systems/plan-next.md).

### Watch-order range unit (`frontend/src/components/tracker/WatchOrderGuide.jsx`)

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` |
|---|---|---|---|---|---|---|---|---|
| From/to range offered (`supportsEpisodeRange`) | yes | no | no | yes | yes | no | no | yes |
| Unit label (`RANGE_UNITS`, default `"Ep"`) | `Ep` | — | — | `Ep` | `Ep` | `Ch` | `Ch` | `#` |

`WHOLE_ONLY_TYPES = {"movie", "anime-movie", "manga", "novel"}`: those steps always cover the work whole. An unknown or null `media_type` keeps the range inputs. (The test file is `frontend/src/components/tracker/watchOrderRange.test.js`; there is no `frontend/src/utils/watchOrderRange.js`.) See [systems/watch-orders.md](systems/watch-orders.md).

### Fill / Replace pipelines (`app/services/pipelines/specs.py`)

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` |
|---|---|---|---|---|---|---|---|---|
| Id extractor | `apply_extract_mal_id_anime` | `apply_extract_mal_id_anime` | `apply_extract_imdb_id` | `apply_extract_imdb_id` | `apply_extract_imdb_id` | `apply_extract_mal_id_manga_novel` | `apply_extract_novel_ids` (`apply_extract_mal_id_manga_novel` then `apply_extract_openlibrary_id`) | `apply_extract_comicvine_id` |
| Fill eligible when | `mal_id` set and missing values | `mal_id` set and missing values | missing values | missing values | `airing_type` in `{"Movie", "TV"}` and missing values | `mal_id` set and missing values | `mal_link` set and missing MAL values, **or** `mal_link` unset and `openlibrary_id` set and missing Open Library values | `comicvine_id` set and missing values |
| Fill function | `autofill_anime_from_mal` | `autofill_anime_movie_from_mal` | `autofill_movie_from_imdb` | `autofill_tv_show_from_imdb` | `autofill_cartoon_from_imdb` | `autofill_manga_from_mal` | `autofill_novel_from_mal` / `autofill_novel_from_openlibrary` (routed on `mal_link`) | `autofill_comic_from_comicvine` |
| Pause between calls | `MAL_PAUSE` (1 s) | 1 s | none | none | none | 1 s | 1 s | `COMICVINE_PAUSE` (1 s) + hourly budget |
| After Fill | derive `ep_previous`, `run_sync_anime` | `run_sync_anime_movie` | — | `run_sync_tv_show` | `run_sync_cartoon` | `run_sync_manga` | `run_sync_novel` | `run_sync_comic` |
| Bulk Replace selects | rows with `mal_id` or `mal_link` | rows with `mal_id` or `mal_link` | rows with `imdb_id` or `imdb_link` | rows with `imdb_id` or `imdb_link` | TV/Movie rows with `imdb_id` or `imdb_link` | rows with `mal_id` or `mal_link` | rows with `mal_id` or `mal_link` | **no bulk Replace** (`replace=None`) |
| In Fill All / Replace All | yes / yes | yes / yes | yes / yes | yes / yes | yes / yes | yes / yes | yes / yes | **no / no** (`in_fill_all=False`, `in_replace_all=False`) |

End-to-end pipeline behaviour: [data-actions.md](data-actions.md); the external services: [external-apis.md](external-apis.md).

### Duplicate rule key (`app/services/domain/duplicates.py`)

Every finder is the same rule: rows that agree exactly on the key **and** share at least one name (case-insensitive, via `get_all_names`) are duplicates, transitively.

| Finder | Key | Extra match |
|---|---|---|
| franchise | `franchise_type` (each comma-separated token separately) | — |
| series | `franchise_id` | — |
| `anime` | `franchise_id`, `series_id`, `airing_type`, `season_part` (lower-cased), `is_main`, `ep_special` | — |
| `anime-movie` | `franchise_id` | — |
| `movie` | `franchise_id`, `series_id` | — |
| `tv-show` | `franchise_id`, `series_id`, `season_part` (lower-cased), `is_main` | — |
| `cartoon` | `franchise_id`, `series_id`, `season_part` (lower-cased), `is_main` | — |
| `manga` | `franchise_id`, `series_id`, `is_main` | — |
| `novel` | `franchise_id`, `series_id`, `is_main` | — |
| `comic` | `franchise_id`, `series_id`, `is_main_entry` | a shared name **or** the same non-null `comicvine_id` |

All entry finders except anime skip rows whose `franchise_id` is null. Report keys in `find_all_duplicates` use underscores (`anime_movie`, `tv_show`). The rule text is in [business-rules.md](business-rules.md).

### Notes sections (`app/utils/note_sections.py`)

Sections whose `owners` is `ALL_OWNERS` (all eight types plus `series`, `franchise`, `collection`): `remark`, `advantages`, `disadvantages`, `double_edged`, `public_reviews`, `personal_reviews`, `analysis`, `resources`, `questions`, `memes`. `quotes` is `ENTRY_OWNERS` (the eight media types only). The type-specific sections:

| Section key | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` | series / franchise |
|---|---|---|---|---|---|---|---|---|---|
| `episode_comments` | x | | | x | x | | | | |
| `highlights` (kinds `神回`/`神片段`/`神篇章`) | x | | | | | | | | |
| `highlight_episodes` | | | | x (kinds) | x (kinds) | x (label `神回`, locator "Chapter(s)") | | | |
| `highlight_passages` | | | | | | | x | | |
| `cinematography` (`分鏡/演出/巧思`) | x | x | | x | x | x | | | series |
| `craft` (`巧思`) | | | | | | | x | | |
| `foreshadowing` | x | x | | x | x | x | x | | both |
| `symmetry` | x | x | | x | x | x | x | | both |
| `op`, `ed`, `insert_songs`, `ost` | x | | | | | | | | |
| `op_ed_changes` | x | | | x | x | | | | |
| `extended_episodes` (`加長`) | x | | | x | x | | | | |
| `adaptation` | x (desc required) | x (desc required) | | x | x | | x (desc required) | | both |

Movie and comic get only the shared sections. Shapes, groups and validation: [systems/notes.md](systems/notes.md).
