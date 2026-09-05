# Business Rules

Last verified: 2026-09-05

**What this is for.** This is the catalogue of every rule the backend applies to
data on its own — values it derives, checks it runs, and normalisations it
performs — written for a human who wants to know *why a field changed* without
reading the code. Each section names the function that owns the rule
(`app/services/domain/*.py`, `app/utils/*.py`) so the code can be checked
against the prose. The pipelines that *trigger* these rules (Fill, Replace,
Calculate, Pull) are described in `docs/data-actions.md`; the external sources
they read from are in `docs/external-apis.md`. The code is the truth; where the
older `business-rules.md` disagrees with this file, this file is current.

Type keys used throughout are the hyphenated media-type slugs from
`app/utils/media_resolver.py`: `anime`, `anime-movie`, `movie`, `tv-show`,
`cartoon`, `manga`, `novel`, `comic`.

---

## 1. Release dates (`app/utils/release_date.py`)

Every release-date column stores a **truncated ISO-8601 string** whose length
tells you its precision. There is no companion precision column.

| Stored shape | Meaning              | Example      |
| ------------ | -------------------- | ------------ |
| `YYYY`       | year known           | `2023`       |
| `YYYY-MM`    | year and month known | `2025-11`    |
| `YYYY-MM-DD` | exact date           | `2018-09-01` |

The regex `^\d{4}(-\d{2}(-\d{2})?)?$` is mirrored by a CHECK constraint on every
release column and by `isValidReleaseDate()` in the frontend.

### The four functions

| Function     | What it does                                                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_valid`   | True only for the right shape **and** a real calendar date. `2024-13` matches the regex but fails; so does `2023-02-30`.                                                                                                                                                                             |
| `normalize`  | Converts any value this project has ever stored or received into the canonical form: canonical strings pass through; `"2020.0"` / `2020.0` (a year that went through a spreadsheet or an Integer column) becomes `2020`; legacy `"JUL 2001"` becomes `2001-07`; full ISO dates from TMDB/Tenrai pass through. Anything else (including an ISO-shaped value with a bad month) returns `None` — it is rejected rather than clamped. |
| `sort_key`   | `(year, month, day)` tuple for ordering. Missing precision resolves to the **first** of the period: `2020` sorts as `(2020, 1, 1)`, `2025-11` as `(2025, 11, 1)`. Returns `None` when nothing parses.                                                                                                |
| `display`    | The stored value verbatim (stripped). Deliberately **not** derived from `sort_key`, because that would show an invented `-01-01` day the entry never had.                                                                                                                                             |

### Undated entries sort last

`UNDATED = (9999, 99, 99)`. List sorting substitutes this tuple when `sort_key`
returns `None`, so entries without a date land at the bottom rather than
mixing with the year 1.

### Which column represents the entry — `RELEASE_PRIORITY`

Some tables have more than one release column. Sorting, list display and
airing-status derivation read them in this order and use the first non-empty
one:

| Type          | Columns, most preferred first       |
| ------------- | ----------------------------------- |
| `anime`       | `release_date`                      |
| `anime-movie` | `release_date_jp`, `release_date_tw` |
| `movie`       | `release_date_tw`, `release_date_usa` |
| `tv-show`     | `release_date`                      |
| `cartoon`     | `release_date`                      |
| `manga`       | `release_date`                      |
| `novel`       | `release_date`                      |
| `comic`       | `release_date`                      |

`DATE_COLUMNS` (keyed by `__tablename__`) is the wider list that also includes
run-end columns (`manga.end_date`, `novel.end_date`, `comic.end_date`) and
`movies.release_date_usa`; the Sheets backup formatter uses it to know which
cells to protect with an apostrophe (see `docs/data-actions.md`).

### Season is derived only at month precision

`apply_calculate_seasonal_from_month` (derivation.py) fills `anime.release_season`
from the month of `release_date` **only when**:

1. `release_season` is currently `None`, and
2. `release_date` is at least `YYYY-MM` (length ≥ 7).

A year-only date leaves the season untouched. Autofill writes `release_season`
straight from Tenrai independently of any month, so an anime can legitimately
carry a season with no month — clearing it would destroy real data. Month →
season mapping (`calculate_seasonal_from_month` in utils.py):

| Months      | Season |
| ----------- | ------ |
| Jan–Mar     | `WIN`  |
| Apr–Jun     | `SPR`  |
| Jul–Sep     | `SUM`  |
| Oct–Dec     | `FAL`  |

`anime_post_processing` adds one more gate before calling it: the entry must
have `airing_type == "TV"`. (`sync_seasonal_counts`, section 6, counts ONA /
Movie / Special too — an ONA with a month but no season is never given one here
and therefore is counted in no season.)

---

## 2. ID extraction from links (`derivation.py`, `utils.py`, `comicvine_utils.py`)

Each Fill run starts by re-deriving external IDs from stored links. An
unparseable link never clears an existing ID.

| Function                          | Reads             | Writes         | Pattern                                         |
| --------------------------------- | ----------------- | -------------- | ----------------------------------------------- |
| `apply_extract_mal_id_anime`      | `mal_link`        | `mal_id` (int) | `myanimelist.net/anime/(\d+)`                   |
| `apply_extract_mal_id_manga_novel`| `mal_link`        | `mal_id` (int) | `myanimelist.net/manga/(\d+)`                   |
| `apply_extract_imdb_id`           | `imdb_link`       | `imdb_id` (str)| `imdb.com/title/tt(\d+)` → stored as `"tt…"`   |
| `apply_extract_comicvine_id`      | `comicvine_link`  | `comicvine_id` | `comicvine.gamespot.com/<slug>/4050-(\d+)` — the `4050-` prefix means "volume"; issue (`4000-`) and character (`4005-`) URLs are rejected |

`imdb_id` is a **string** like `tt7660850`, never an integer and never
zero-padded by the app.

### Season / Part from the title

`apply_extract_season_from_title` looks in the English title (`anime_name_en`
or `anime_name_roman` for anime, `tv_name_en`, `cartoon_name_en`) for every
`Season N`, `Part N`, `Cour N` token (case-insensitive), title-cases them and
joins with a space: `"Attack on Titan Season 3 Part 2"` → `"Season 3 Part 2"`.
It only runs when `season_part` is `None`.

### "Season 1" for a lone entry

`derive_season_1_anime` / `derive_season_1_tv_show` / `derive_season_1_cartoon`:
when `season_part` is `None`, the entry has a franchise, and it is the **only**
entry of its kind in that franchise (anime and cartoon: only TV entries count;
TV show: every entry counts), set `season_part = "Season 1"`.

---

## 3. `ep_previous` — cumulative episodes before this season (`derive_ep_previous_anime`)

`ep_previous` is the number of episodes that aired in earlier seasons of the
same run, so that "episode 5 of Season 3" can be shown as an absolute episode
number.

**Eligible entries** (all must hold): same `franchise_id`; `airing_type` is
`TV` or `ONA`; `ep_special` is `NULL`; `season_part` is set.

**Sibling groups.** Eligible entries are partitioned by `series_id`; entries
with no series form their own group. Each group is processed independently.
When a caller passes an explicit `series_id` (the anime write path does), only
that one group is processed; when omitted, every group in the franchise is.

**Ordering inside a group.** Sort key is `(season number, part number)` parsed
from `season_part` with `SEASON_PATTERN` (`season\s*(\d+)`) and `PART_PATTERN`
(`part\s*(\d+)`); a missing number defaults to 1. So `"Season 2"` sorts as
`(2, 1)`, `"Season 2 Part 2"` as `(2, 2)`. **"Cour N" is not read** by this sort
(only by the title extractor), so `"Season 1 Cour 2"` sorts as `(1, 1)` — the
same as `"Season 1"`, and the tie is broken by query order.

**Assignment**, walking the sorted list:

1. Entries whose `ep_previous` is already set are skipped — the rule **only
   fills `None`**, it never repairs a wrong value.
2. `season_part` equal (case-insensitively) to `"season 1"` or
   `"season 1 part 1"` gets `ep_previous = 0`.
3. Anything else that is first in the list stops the walk (`break`).
4. Otherwise `ep_previous = prev.ep_previous + prev.ep_total`, where `prev` is
   the entry just before it in sort order. If `prev.ep_total` is missing/0 or
   `prev.ep_previous` is `None`, the walk **breaks** — every later season in
   that group is left `None` on this run.

**Worked example.** A franchise with `Season 1` (12 ep), `Season 2` (24 ep),
`Season 3` (ep_total unknown), `Season 4` (12 ep):

| Entry    | ep_total | Result                          |
| -------- | -------- | ------------------------------- |
| Season 1 | 12       | 0 (rule 2)                      |
| Season 2 | 24       | 0 + 12 = 12                     |
| Season 3 | None     | 12 + 24 = 36                    |
| Season 4 | 12       | **None** — S3 has no `ep_total`, walk breaks |

Once Season 3's `ep_total` is filled, the next Calculate/Fill sets Season 4 to 36 + N.

**Who calls it.** `derive_ep_previous_all_anime` loops every distinct
`franchise_id` found on the anime table (no franchise-type filter) and commits;
it runs after Fill Anime, Replace Anime, single-entry Replace Anime (non-bulk),
and Calculate All. `prepare_anime_write` (section 12) calls the single-group
form for the entry just written.

---

## 4. Completion rules (`completion.py`)

`COMPLETED_WATCH_STATUSES` and `COMPLETED_READ_STATUSES` are
`{"Completed", "Completed (解說)"}` — the "explained via a summary video" status
counts as completed everywhere.

### Checks

| Function                     | Applies to              | Returns True when                                                                                                              |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `check_is_tv_completed`      | Anime, TV Show, Cartoon | `watching_status` is a completed status, **or** `ep_total > 0` and `ep_fin == ep_total`.                                         |
| `check_is_movie_completed`   | Anime Movie, Movie      | `watching_status` is a completed status. (No episode rule.)                                                                     |
| `check_is_reading_completed` | Manga                   | `serialization_status` is `完結` or `腰斬` **AND** (`ch_total > 0 and ch_fin == ch_total` **or** `vol_total > 0 and vol_fin == vol_total`). |

Note the manga rule: the function's own docstring says "any one is
sufficient", but the code requires **both** the status and a count match. A
manga with `ch_fin == ch_total` but status `連載中` is never auto-completed;
neither is a `完結` manga whose counts do not line up. This is how the code
behaves today; whether it is the intended rule is an open question (see the
review notes), but this file documents the code.

### Mark-completed mutations

Applied by post-processing (section 8) when the check passes and the entry is
not already in a completed status.

| Function                 | Sets                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mark_tv_completed`      | `watching_status = "Completed"`, `airing_status = "Finished Airing"` (always, even if the trigger was a provisional `ep_total`), `ep_fin = ep_total` when `ep_total` is set.                                                                                              |
| `mark_movie_completed`   | `watching_status = "Completed"`, `airing_status = "Finished Airing"`.                                                                                                                                                                                                       |
| `mark_reading_completed` | (manga) `serialization_status = "完結"` unless it is `腰斬`; `reading_status = "Completed"`; `ch_fin = ch_total` and `vol_fin = vol_total` when those totals are truthy; `vol_fin_page = 0`.                                                                                  |
| `mark_novel_completed`   | `serialization_status = "完結"`, `reading_status = "Completed"`; `vol_fin`, `vol_total_original`, `vol_total_tw` all set to the max of whichever are non-null. Arc handling branches on whether the novel has `novel_unit` arc rows: if it does, every arc is closed (`arc_fin = len(arcs)`, `ch_fin_in_arc = 0`) and `derive_novel_progress` recomputes `arc_total`/`ch_total`/`ch_fin` from them, so the totals cannot disagree with the rows; if it has none, the old max-rule applies to `arc_fin`/`arc_total` and `ch_fin`/`ch_total` (whichever are non-null) and `ch_fin_in_arc` is zeroed. **Not called by any post-processing** — used by the novel router's "mark completed" action only. |
| `mark_comic_completed`   | `serialization_status = "完結"`, `reading_status = "Completed"`, `issue_fin`/`issue_total` set to the max of the two. Same: router-only.                                                                                                                                    |

`apply_completion_timestamp(entry, status)` stamps `completed_at` with Taipei
now the first time a write moves an entry into a completed status; it never
overwrites an existing timestamp.

---

## 4a. Novel two-stage progress (`app/services/domain/novel_units.py`)

A novel with `novel_unit` arc rows (`type = "Web"`, or any novel an admin
gave arc rows to) tracks progress in two stages instead of one flat chapter
counter: `arc_fin` counts arcs that are **fully finished**, and
`ch_fin_in_arc` is the chapter position inside the arc currently being read
— the arc at index `arc_fin` (0-based) among the novel's arc rows in
`position` order.

**Derivation** (`derive_novel_progress`, called unconditionally on every
create/update/patch by the router, whether or not the write touched `units`):

- **Volume-only type first** (`type` in `NOVEL_VOLUME_ONLY_TYPES`, i.e.
  `Light Novel` and `Novel`): nothing is derived. `arc_total` and `ch_total`
  go to null, `arc_fin`, `ch_fin` and `ch_fin_in_arc` to `0`, and the volume
  columns are left alone. This branch wins even when arc rows are present —
  the editor cannot create them for these types, but a sheet Pull can, and a
  type that counts volumes has no chapter counter to derive. Because the rule
  lives here rather than in the forms, it also holds for Pull, Fill and
  Calculate.
- With no arc rows: only `ch_fin_in_arc` is zeroed; `arc_total`, `arc_fin`,
  `ch_total`, `ch_fin` are left as stored (flat) values.
- With arc rows: `arc_total = len(arcs)`, `ch_total = sum(ch_count over arcs)`,
  and `ch_fin = sum(ch_count of the arc_fin fully-finished arcs) + ch_fin_in_arc`.
  `arc_fin`/`ch_fin_in_arc` are first passed through the rollover rule below.

**Choosing the counter** (`progressDisplayOptions` / `effectiveProgressDisplay`,
`frontend/src/lib/novelUnits.js` - display only, no server component):
`progress_display` may hold `vol_original`, `vol_tw`, `ch`, `arc` or `arc_ch`,
but the dropdown offers only what the entry can render - volume counters
except on `Web`, chapter counters except on the volume-only types, and the two
arc counters only once the novel actually has arc rows. A stored value outside
that set is ignored for rendering and the derived mode is used instead, so a
`Web` row left holding `vol_tw` by a Pull or a type change cannot draw a
volume row the type does not have.

`arc` steps a whole arc at a time (`wholeArcStep`): `arc_fin` moves by one and
`ch_fin_in_arc` resets to `0`, which keeps `ch_fin` exactly the sum of the
finished arcs. It is clamped at both ends, unlike the chapter rollover below,
which deliberately runs past the last recorded arc.

**Rollover** (`normalize_arc_progress`, mirrored in the frontend as
`arcStep` in `frontend/src/lib/novelUnits.js`): folds an out-of-range
`ch_fin_in_arc` into the right arc after a step.

- *Carry up*: while the current arc (`counts[arc_fin]`) has a known,
  positive `ch_count` and `ch_fin_in_arc >= ch_count`, subtract that arc's
  count from `ch_fin_in_arc` and increment `arc_fin`. An arc with an unknown
  (`None` or `0`) `ch_count` stops the carry — there is no width to
  subtract past it.
- *Carry stops at the last recorded arc, on purpose* (Decision D): an
  ongoing web novel is read into an arc nobody has entered a row for yet, so
  carrying past the last arc would discard real progress. `ch_fin_in_arc` is
  **not** clamped there — a value larger than the last arc's `ch_count` is
  left as-is once `arc_fin` reaches the arc count.
- *Borrow down*: a negative `ch_fin_in_arc` (stepping back past the start of
  the current arc) decrements `arc_fin` and adds the previous arc's
  `ch_count`; a result still negative at `arc_fin == 0` clamps to `0`.

**Worked example** (the anchor case): arc 1 has `ch_count = 100`, arc 2 has
`ch_count = 112`. A cursor of `arc_fin = 1, ch_fin_in_arc = 101` (into arc 2,
101 chapters in) derives `ch_total = 212` and
`ch_fin = 100 (arc 1, fully finished) + 101 = 201` — **not** 101 or 213.

**Display key** (`unit_display_key` / `unitDisplayKey`): a unit's shown
label is its explicit `unit_key` if set, otherwise
`"{NOVEL_UNIT_KEY_PREFIX[unit_kind]} {position}"` (e.g. `"Vol 1"`,
`"Arc 2"`). Generated, never stored; computed server-side as
`NovelUnitResponse.display_key` and previewed client-side before save.

**Decision B — volume/arc asymmetry, deliberate.** Only `arc` rows are
authoritative. `volume`, `story` and `chapter` rows are optional display
enrichment: adding, editing or deleting them never changes `vol_fin`,
`vol_total_original` or `vol_total_tw`, which remain the denominators for
volume-based progress exactly as they were before `novel_unit` existed. The
asymmetry exists because `ch_count` — the one number progress derivation
needs — lives only on arc rows; a volume has no equivalent "width".

---

## 5. Missing-value checks that drive Fill (`checking.py`, `utils.py`)

Fill queues an entry only if `has_missing_values_<type>` says something is
blank. "Blank" means `None` or an empty/whitespace string. The field lists live
in `app/utils/utils.py`.

| Type        | `*_FIELDS_TO_FILL`                                                                                                        | Extra rules                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anime       | `airing_type, airing_status, release_date, release_season, mal_rating, mal_rank, ep_total, cover_image_file` | `Not Yet Aired` entries ignore missing `mal_rating`/`mal_rank`. `ep_previous` is *added* as missing only when it is `None` **and** the entry is TV/ONA with no `ep_special` and a non-blank `season_part` (the same eligibility as section 3). Because Tenrai cannot supply `ep_previous`, an anime whose only gap is that field is re-fetched on every run. `official_link`/`twitter_link` are gone from this list on purpose: Fill now writes them as `media_source` reference rows, and the columns themselves were dropped, so naming a dropped column here would make every anime read as permanently missing. |
| Anime Movie | `airing_status, release_date_jp, mal_rating, mal_rank, cover_image_file`                       | `Not Yet Aired` ignores rating/rank. `ep_total` is **not** required (and autofill never writes it). Same `official_link`/`twitter_link` exclusion as Anime.                                                                                                                                                                                       |
| Movie       | `length_min, airing_status, release_date_usa, imdb_rating, cover_image_file`                                              | Plus `MOVIE_LINK_FIELDS_TO_FILL = [("credit","director")]`: the entry is also missing if it has no `director` credit row in `media_credit`.                                                                                                                                                |
| TV Show     | `airing_status, release_date, imdb_rating, ep_total, cover_image_file`                                                    |                                                                                                                                                                                                                                                                                         |
| Cartoon     | TV: `airing_status, release_date, imdb_rating, ep_total, cover_image_file`; Movie: same minus `ep_total`                   | List chosen by `airing_type == "Movie"`; every other type uses the TV list. The Fill spec additionally requires `airing_type in {TV, Movie}` before queueing.                                                                                                                          |
| Manga       | `serialization_status, release_date, end_date, mal_rating, mal_rank, cover_image_file`                                     | When `serialization_status == "完結"`, also missing if **both** `vol_total` and `ch_total` are `None`. One missing total alone does not trigger a fetch.                                                                                                                                 |
| Novel       | same as manga                                                                                                             | Gate: `mal_link is None` → never missing (nothing to fill from). `完結` rule uses `vol_total_original` and `ch_total`, again only when **both** are `None`.                                                                                                                             |
| Comic       | `release_date, issue_total, cover_image_file`                                                                             | Plus `COMIC_LINK_FIELDS_TO_FILL`: `author` credit, `illustrator` credit, `comic_publisher` tag. Imprint, continuity, era, events, `end_date`, `publisher_tw` are manual and never required — Comic Vine does not model them.                                                          |

The link checks (`_link_missing`) read `media_credit` / `media_tag` through
`credit_names` / `tag_values`; the dropped `director` / `writer` / `artist` /
`publisher` columns are no longer consulted anywhere.

### Episode / volume / chapter math

`apply_validate_episode_math` (anime, TV, cartoon) and `apply_validate_vol_math`
/ `apply_validate_ch_math` (manga) sanitise the pair `(total, fin)`:

- `total` in `(None, "", "?")` → `None` (episodes only accept `"?"`); non-numeric → `None`; negative → 0.
- `fin` in `(None, "")` → 0; non-numeric → 0; negative → 0.
- `fin > total` → `fin = total`.

The episode version is skipped entirely when both values are `None`.

### Bahamut availability

`apply_check_baha` (anime, anime movie): a Bahamut link means the entry is
available on Bahamut. The verdict used to live in the `source_baha` tristate
beside a `baha_link` column; both are dropped now, and the verdict lives on
the entry's Bahamut `main` `access` row in `media_source` instead — if that
row's `url` is set and its `available` is `None`, set `available = True`.
Never overwrites an existing verdict.

---

## 6. Seasonal buckets (`seasonal.py`)

**Key format is `"SSS YYYY"`** — season abbreviation first, then year, one
space: `"SPR 2025"`, `"WIN 2024"`. (Older docs said `"2025 SPR"`; that is wrong.
`system_configs.current_season` is free-form, so an admin typing the old order
would point at a bucket that never matches.)

`create_missing_seasonal` scans anime for distinct `(release_season, first 4
chars of release_date)` pairs where both are non-null and inserts a `Seasonal`
row for each key that does not exist. Commits only if it added something.

`sync_seasonal_counts` zeroes every seasonal's four counters and recounts from
anime that have a season, a date, and `airing_type` in **`{TV, ONA, Movie,
Special}`** (OVA, OAD, Other are excluded):

| Counter           | Statuses                                              |
| ----------------- | ----------------------------------------------------- |
| `entry_completed` | `Completed`, `Completed (解說)`                        |
| `entry_planned`   | `Plan to Watch`, `Watch When Airs`                     |
| `entry_watching`  | `Active Watching`, `Passive Watching`, `Paused`        |
| `entry_dropped`   | `Temp Dropped`, `Dropped`                              |

`Might Watch` and `Won't Watch` are counted nowhere. An anime whose key has no
`Seasonal` row is skipped (run `create_missing_seasonal` first — `run_sync_anime`
does).

---

## 7. Size groups (`size_group.py`, `plan_next.py`, `plan_next_kinds.py`)

A size bucket says how big a commitment a franchise or series is, per media
type. It is stored as two JSONB maps on `franchise` and `series`:

- `size_group_derived` — rewritten by Calculate (`derive_size_groups`), never read for overrides.
- `size_group_manual` — written by the admin, never touched by Calculate.

`effective_bucket(derived, manual, media_type)`: the manual key wins when
present and truthy, else the derived key, else `None`.

### Thresholds (`SIZE_THRESHOLDS` / `SIZE_MEASURE`)

| Type      | Measure                              | Bands (upper bound → key)                          |
| --------- | ------------------------------------ | -------------------------------------------------- |
| `anime`   | sum of `ep_total` over the group     | ≤12 → `12ep`; ≤24 → `24ep`; else `30ep_plus`       |
| `tv-show` | entry count                          | 1 → `1season`; 2 → `2season`; else `3season_plus`  |
| `cartoon` | entry count                          | same as tv-show                                     |
| `movie`   | entry count                          | 1 → `standalone`; 2–3 → `2_3movies`; else `4movies_plus` |
| `comic`   | sum of `issue_total`                 | ≤3 → `1_3`; ≤10 → `4_10`; else `11_plus`           |

`bucket_for` returns `None` for a missing or zero measure — "nothing measured"
is not "small". Anime movie, manga and novel have no bucket vocabulary.

### Derivation (`derive_size_groups`)

For every franchise and every series, build the map `{media_type: bucket}` for
the five bucketed types from the entries whose `franchise_id` / `series_id`
points at the group (a null `ep_total` counts as 0 in the sum). Comic is
**series-only** — it is skipped at franchise tier. The map is written to
`size_group_derived` only if it differs; the function returns how many groups
changed. Runs as the last step of `run_sync` in Calculate All.

Entry-level buckets are never stored: a comic run buckets on its own
`issue_total`; every other entry inherits its series' effective bucket, then its
franchise's (`entry_bucket` implements this but is currently unused by the app —
see section 14).

---

## 8. Per-type post-processing (`post_processing.py`)

Each `*_post_processing(entry, db)` runs on **every** entry of the type after a
Fill's fetch loop, and on every entry during Calculate All (`run_post_processing`
covers anime, anime movie, TV show, cartoon, manga). Novel, Movie and Comic have
no post-processing.

| Type        | Steps, in order                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anime       | validate episode math → `apply_check_baha` → if `check_is_tv_completed` and not already completed, `mark_tv_completed` → if no season, has a date, and `airing_type == "TV"`, `apply_calculate_seasonal_from_month` → if no `season_part`: extract from title, then Season-1 rule |
| Anime Movie | `apply_check_baha` → completion (movie rule)                                                                                                                                                                                                                             |
| TV Show     | validate episode math → completion (tv rule) → if no `season_part`: extract from title, then Season-1 rule                                                                                                                                                              |
| Cartoon     | validate episode math → completion (tv rule) → if no `season_part`: extract from title, then Season-1 rule (TV cartoons only)                                                                                                                                            |
| Manga       | validate vol math → validate ch math → if `check_is_reading_completed` and not already completed, `mark_reading_completed`                                                                                                                                                |

### Single-entry Replace (`apply_single_replace_<type>`)

What one entry goes through on the write hook (after a create/update) and in
bulk Replace:

| Type        | Steps                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anime       | extract MAL id → `autofill_anime_from_mal` → anime post-processing → **if not bulk**, `derive_ep_previous_all_anime` (bulk callers do it once after the loop) |
| Anime Movie | extract MAL id → autofill → anime-movie post-processing                                                                                             |
| Movie       | extract IMDb id → `autofill_movie_from_imdb` (no post-processing)                                                                                    |
| TV Show     | extract IMDb id → autofill → tv-show post-processing                                                                                                 |
| Cartoon     | extract IMDb id → autofill → cartoon post-processing                                                                                                 |
| Manga       | extract MAL id → autofill (ratings forced) → manga post-processing                                                                                    |
| Novel       | extract MAL id → autofill (ratings forced)                                                                                                            |
| Comic       | nothing — no replace function; the write hook only re-syncs system options                                                                           |

The `bulk` parameter is accepted by movie/tv/cartoon/manga/novel for signature
parity and ignored. Fill-only vs overwrite semantics of the autofill functions
are in `docs/external-apis.md`.

---

## 9. Duplicate detection (`duplicates.py`, `app/utils/clustering.py`)

Every finder is the same rule with different parameters: rows that agree
**exactly** on a grouping key and are pairwise related by a looser test are
duplicates, **transitively** (A~B and B~C put A, B, C in one cluster).
`cluster(items, match, key)` is a union-find: items are bucketed by `key`, only
pairs within a bucket are compared with `match`, and clusters of two or more
are returned in first-member order.

The default `match` is "share at least one name": `a.get_all_names() &
b.get_all_names()` is non-empty (case-insensitive, every name column).

| Report key        | Rows considered                        | Exact key                                                                   | Match                                                                                                   |
| ----------------- | -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `franchise`       | all franchises                         | each comma-separated token of `franchise_type` (a franchise is bucketed under every token) | shared name; a franchise appearing in two clusters via two types is collapsed back to distinct franchises |
| `series`          | series with a franchise                | `franchise_id`                                                              | shared name                                                                                             |
| `anime`           | all anime                              | `(franchise_id, series_id, airing_type, season_part lower-stripped, is_main, ep_special)` | shared name                                                                                             |
| `anime_movie`     | with a franchise                       | `franchise_id`                                                              | shared name                                                                                             |
| `movie`           | with a franchise                       | `(franchise_id, series_id)`                                                 | shared name                                                                                             |
| `tv_show`         | with a franchise                       | `(franchise_id, series_id, season_part, is_main)`                           | shared name                                                                                             |
| `cartoon`         | with a franchise                       | `(franchise_id, series_id, season_part, is_main)`                           | shared name                                                                                             |
| `manga`           | with a franchise                       | `(franchise_id, series_id, is_main)`                                        | shared name                                                                                             |
| `novel`           | with a franchise                       | `(franchise_id, series_id, is_main)`                                        | shared name                                                                                             |
| `comic`           | with a franchise                       | `(franchise_id, series_id, is_main_entry)`                                  | shared name **or** same non-null `comicvine_id` (two unfilled rows sharing NULL is not a match)         |
| `system_options`  | all options                            | `(category lower, value lower)`                                             | always — catches `Netflix` vs `netflix`, which the exact UNIQUE cannot                                  |
| `entities`        | persons, studios (scanned separately)  | none                                                                        | any overlap between the two rows' `get_all_names()` sets, normalised (section 10). The fields are the model's `_name_fields`: all four of `name_en` / `name_cn` / `name_jp` / `name_alt`, for a person as for a studio |

Entries with no franchise are ignored by every per-type finder except anime.
Results are returned as `find_all_duplicates(db)` from `GET
/api/data-control/check/duplicates`.

---

## 10. Name normalisation (`app/utils/name_normalize.py`)

`normalize_name(raw)` produces a comparison key **only** — the original
spelling is what gets stored:

1. Unicode NFKC (full-width Latin/digits → half-width),
2. remove **all** whitespace (interior included),
3. `casefold()`.

So `"Ｋｙｏｔｏ Animation "` and `"kyotoanimation"` collide. Used by person /
studio / option resolution when a credit is written, and by the entity
duplicate check.

`split_names(raw)` splits a comma-joined name column, drops empty fragments,
and de-duplicates on the normalised key, keeping the **first** spelling seen.

---

## 10a. Studio display names (`models/staff.py`, `lib/naming.js`)

Every media model resolves its display name through a fallback chain that is
**hard-coded per type**. A studio does not: which name it shows is DATA.

`studio.display_name_field` holds `en` / `cn` / `jp` / `alt` and names the
winning column. `Studio.display_name` returns that column's value when it is
set and non-blank; otherwise it falls back through **EN → CN → JP → Alt**,
returning `""` only if all four are empty, which `ck_studio_has_a_name`
prevents. So `display_name_field` is a preference, not a guarantee: pointing
it at an empty column silently falls back rather than blanking the studio.

The rule exists twice, because the pickers and the studio pages resolve names
in the browser without a round trip: `displayStudioName()` and
`STUDIO_NAME_FIELDS` in `frontend/src/lib/naming.js` mirror it exactly.
**Change both or neither.** `StudioResponse` also carries the server-resolved
`display_name`, which is what list and detail pages actually render; the
helper is for rows that arrive without it.

Two consequences worth knowing:

- `GET /api/studio/` sorts on the resolved `display_name`, case-insensitively,
  so the list order changes when an admin changes a display choice.
- The duplicate check and credit resolution do NOT use `display_name`. They
  compare **every** name a studio has (`get_all_names()`, section 10), so two
  studios cannot hide a collision behind different display choices.

---

## 11. Remark as a note (`remark_field.py`)

`remark` is no longer a column on the owner tables: it is the singleton `note`
row with `section = "remark"` for that owner. Reads go through a read-only
`column_property`; writes:

- `pop_remark(payload)` → `(rest, value, was_present)`. A PATCH that never
  mentions `remark` leaves the note alone; a PUT that sends `null` clears it.
- `upsert_remark(db, owner_type, owner_id, text)`: empty / whitespace-only
  text **deletes** the row (no blank sections on the notes page); otherwise
  update in place (stamping `updated_at`) or insert with `sort_index = 0.0`.
  Text is stored as typed — only the emptiness test is stripped.

`find_all_remarks` (`remarks.py`) lists every entry of every type that has a
non-empty remark, for `GET /api/data-control/check/remarks`.

---

## 12. Hierarchy resolution (`hierarchy.py`)

One rule for every media type (it used to be nine drifting copies). Input is
whatever a form or a sheet row carries in its `franchise_id` / `series_id`
cells.

**Franchise** (`resolve_franchise(db, franchise_id, names, media_type)`):

1. A UUID (anything non-string and truthy) passes through.
2. A non-empty string names the franchise: looked up case-insensitively
   (`ilike`) across all five franchise name columns.
3. A blank cell falls back to the entry's own titles (`en, cn, roman, jp, alt`,
   stripped), looked up the same way.
4. Nothing found and at least one name available → a franchise is **created**
   with those names and a type from `FRANCHISE_TYPE_FOR`. Nothing found and no
   names → `None`.

| Media type                       | Auto-created `franchise_type` |
| -------------------------------- | ----------------------------- |
| anime, anime-movie, series       | `Anime`                       |
| movie                            | `Movie`                       |
| tv-show                          | `TV`                          |
| cartoon                          | `Cartoon`                     |
| manga                            | `ACG`                         |
| novel                            | `Novel`                       |
| comic                            | `Comic`                       |

Note `"Anime"` is not in the `FRANCHISE_TYPES` dropdown tuple (which offers
`ACG`, `Anime Movie`, …), so an auto-created anime franchise is invisible to the
type filter until hand-fixed.

**Series** (`resolve_series`): a UUID passes through; a non-empty string is
looked up case-insensitively across `series_name_en/cn/alt`; not found →
`None` with a warning. **A series is never auto-created.**

`resolve_<type>_parent_hierarchy(db, franchise_id, series_id, names)` bundles
the two; `resolve_anime_movie_parent_hierarchy` is franchise-only (the table has
no `series_id`); `resolve_series_parent_hierarchy` resolves a Series row's
parent franchise from the series' own names.

---

## 13. Media relations (`media_relation.py`, `app/utils/relation_kinds.py`)

Relations are rows in `media_relation` — `from (type, id) —kind→ to (type, id)`
— read as "`from` is the {label} of `to`".

### Stored kinds

| Key             | Label (on `from`) | Inverse label (on `to`) | Family      | Symmetric | Transitive |
| --------------- | ----------------- | ----------------------- | ----------- | --------- | ---------- |
| `sequel`        | Sequel            | Prequel                 | timeline    |           |            |
| `alternative`   | Alternative       | Alternative             | equivalence | yes       | yes        |
| `corresponding` | Corresponding     | Corresponding           | equivalence | yes       | yes        |
| `renew`         | Renew             | Original                | equivalence |           |            |
| `directors_cut` | Director's Cut    | Original                | equivalence |           |            |
| `extended`      | Extended          | Original                | equivalence |           |            |
| `side_story`    | Side Story        | Parent Story            | branch      |           |            |
| `spin_off`      | Spin-off          | Main Story              | branch      |           |            |
| `setting`       | Setting           | Main Story              | branch      |           |            |
| `adaptation`    | Adaptation        | Source                  | derivation  |           |            |

### Normalisation on write (`normalize_relation`)

1. **`prequel` is input-only** (`INPUT_ONLY_KINDS = {"prequel": "sequel"}`).
   "B's prequel is A" is stored as `A —sequel→ B`: the kind becomes `sequel`
   and the endpoints swap.
2. **Symmetric kinds sort their endpoints** by `(type, str(id))` so
   `A-alt-B` and `B-alt-A` are one row and `uq_media_relation_pair` can see
   the duplicate.
3. Every other kind is stored exactly as given — which movie is the
   Director's Cut is the point.

`find_duplicate` is checked before insert so the API answers 409 rather than a
500 from the unique constraint.

### Reading an entry's relations (`relations_for_entry`)

Rows are read from both endpoints. The `label` describes the **far** entry, so
it inverts when the viewed entry is the row's `from` side: if `A —sequel→ B`,
A's page shows B labelled "Prequel", B's page shows A labelled "Sequel".

**Transitive peers.** For the transitive kinds, the page also shows entries
reachable through a chain, marked `derived: true`, `system_id: null`, with
`via` naming the neighbour the chain arrived through. Rules:

- Chains cross kinds, and **a chain is only as strong as its weakest link**:
  `A —alternative— B —corresponding— C` makes A and C *corresponding*, never
  *alternative*.
- `TRANSITIVE_KEYS` is ordered strongest first (`alternative`, then
  `corresponding`). The walk widens the allowed edge set one kind at a time and
  keeps whatever each pass finds first, so an entry first reached on pass *k*
  has kind *k* as its bottleneck. Breadth-first within a pass, so `via` is the
  shortest such chain.
- A stored row always wins over a derived duplicate for the same
  `(kind, endpoint)`.
- Derived rows are appended after stored rows; the canvas (`graph_for_scope`)
  draws stored rows only.

**Visibility.** For a non-superuser viewer, any edge whose far end or `via`
intermediate the viewer may not see is **removed**, not blanked.

---

## 14. Plan flags (`plan_next.py`, `plan_next_kinds.py`)

`watch_next` / `read_next` / `to_rewatch` / `to_reread` are still fields on the
entry schemas, but they are **virtual**: each is backed by a `plan_next` row
`(scope="entry", media_type, target_id, kind)`.

| Field        | Kind      | Types carrying it                                |
| ------------ | --------- | ------------------------------------------------ |
| `watch_next` | `next`    | anime, anime-movie, movie, tv-show, cartoon      |
| `read_next`  | `next`    | manga, novel, comic                              |
| `to_rewatch` | `rewatch` | anime-movie, movie, tv-show                      |
| `to_reread`  | `rewatch` | manga, novel, comic                              |

Anime and cartoon have no entry-level rewatch flag: their rewatch scope is
franchise-only. `ALLOWED_SCOPES[kind][media_type]` is the full matrix
(`GET /api/plan-next/kinds` exposes it; `frontend/src/config/planNextGroups.js`
is a hand-kept copy).

- `pop_plan_flag` splits the flags out of a write payload; only flags actually
  present are acted on, so a PATCH that omits a flag leaves the row alone and
  one that sends `false` deletes it (`set_entry_flag`).
- `attach_plan_flag` puts the values back on the ORM instance before
  serialisation.
- `validate_plan_target` rejects a plan whose scope is not allowed for the
  type or whose target row does not exist.
- `delete_plans_for(scope, target_id)` must be called by every delete path —
  the target is FK-less, so nothing cascades. Same obligation as media
  relations.

---

## 15. Anime write preparation (`anime_write.py`)

Anime is the one type whose external enrichment runs **inside** the request
rather than as a post-commit hook. `prepare_anime_write(db, anime)`:

1. `apply_single_replace_anime(..., force_replace_ratings=False)` — Tenrai
   autofill with ratings only filled, never overwritten — then anime
   post-processing; flush.
2. `derive_ep_previous_anime(db, franchise_id, series_id)` for the entry's own
   sibling group; flush.
3. `create_missing_seasonal(db)` — wrapped so a failure only logs a warning
   and never blocks the write.

The regular types run `execute_replace_single_<type>` after commit instead
(`docs/data-actions.md`, Replace).

---

## 16. System-option scope extraction (`options_extraction.py`)

`extract_system_options` walks every `media_tag` row and inserts a
`system_option_scope (option_id, scope=media_type)` row for any pair that does
not exist. **Purely additive** (Ruling R27): a reconcile may widen where a
value is offered but never narrows it. Tags whose field is not in `TAG_FIELDS`
or whose option no longer exists are skipped. Called by every `run_sync_<type>`
wrapper, so a Fill or Replace of any type triggers a full scan.

---

## 17. Retired or unused rules

Things that exist in the tree but are not wired, or that were removed by
migrations. Each was confirmed by grep on 2026-08-30.

### Defined but never read

| Symbol                                   | Where                                   | Status                                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_AIRING_TYPE_ORDER`                     | `derivation.py`                         | Defined (TV < ONA < Special < OVA < OAD); no reference anywhere. A leftover of the retired watch-order derivation.                                                            |
| `MONTH_MAP`                              | `app/utils/utils.py`                    | `"JAN" → "01"` map; no reference. Superseded by `release_date._MONTH_ABBREVIATIONS`.                                                                                          |
| `entry_bucket`                           | `size_group.py`                         | Pure function for an entry's inherited bucket; no caller in `app/` (tests only). Display-time bucket resolution is done elsewhere.                                            |
| `size_group_keys`                        | `plan_next_kinds.py`                    | No caller.                                                                                                                                                                    |
| `get_entry_franchise_id`                 | `watch_order.py`                        | Exported from `app/services/domain/__init__.py` but never called.                                                                                                             |
| `length_ep_min` mapping for cartoons     | `tmdb_utils.map_tmdb_to_cartoon_data`, `imdb_utils.map_imdb_to_cartoon_data` | The mappers compute the most-common episode runtime (season) with a show-level `episode_run_time` fallback, but `autofill_cartoon_from_imdb` never writes `cartoon.length_ep_min`. The column exists and round-trips through Sheets; it is manual today. |
| `derive_ep_previous_anime(series_id=…)` explicit-series branch | `derivation.py`     | Only `prepare_anime_write` passes a series; every pipeline uses the all-groups form. Still live, just single-caller.                                                          |
| `AiringStatus`, `ReadStatus` enums       | `constants.py`                          | `ReadStatus` feeds `COMPLETED_READ_STATUSES`; `AiringStatus` is only served by `/api/constants`. Business logic compares string literals.                                     |

### Three lists that disagree about cartoon airing types

- `CARTOON_AIRING_TYPES = ("TV", "Movie", "OVA", "Special")` (`constants.py`) is
  what the dropdown offers via `/api/constants`.
- The Fill spec and `autofill_cartoon_from_imdb` accept **only** `TV` and
  `Movie`; an OVA or Special cartoon is never fetched.
- `docs/options.md` still lists `TV / Movie / Other`.

The code rule is: OVA/Special cartoons are storable but never autofilled.

---

## 18. Media sources (`app/services/domain/sources.py`, `app/utils/credit_roles.py`)

Where an entry can be watched, read, or looked up is split across a `media_source`
row (see [data-model.md](data-model.md#media_source)) and, for the small set
of links the app itself consumes, a handful of surviving columns. The split
follows one rule, applied to every link in the codebase:

> **A link the system acts on is a column. A link that is only ever displayed
> is a `media_source` row.**

`mal_link`, `imdb_link`, `comicvine_link` and `openlibrary_link` stay columns
because they are acted on: `derivation.py` extracts an id out of each one,
`autofill.py` fetches on that id, `checking.py` and `calculation.py` gate on
whether the link is present, and Comic Vine's conflict logic reads
`comicvine_id` directly. `official_link`, `twitter_link` and `anilist_link`
became `media_source` reference rows instead — nothing in `app/services/`
ever read them back, only wrote them (`autofill.py`) or displayed them
(`SourcesCard`).

On the RBAC side, gating a `media_source` bucket does much heavier lifting on
the reading types than on the watching ones: a viewer holding neither
`sources_other` nor `sources_restricted` sees a manga's Sources card with
reference links only and **no reading sources at all** (manga and comic have
no `main`-bucket access platforms — see [entry-types.md](entry-types.md)),
where the same role still sees Bahamut and Netflix on an anime. That
asymmetry is the intent of the restricted tier, not an oversight.

See [Known issue](#known-issue-mediacarddashboardcard-match-a-source-by-name-not-by-a-stable-key)
below for a follow-up this design surfaced but did not fix.

### Known issue: `MediaCard`/`DashboardCard` match a source by name, not by a stable key

`frontend/src/components/cards/MediaCard.jsx` and
`frontend/src/components/tracker/DashboardCard.jsx` find the Bahamut / Netflix
badge rows with `s.kind === "access" && s.name === "Bahamut"` (and
`"Netflix"`) — string-matched against the vocabulary's human `value`.
`SourceRef` (`app/schemas/sources.py`) exposes `system_id`, `kind`, `bucket`,
`name`, `available`, `url`, `position` and no stable vocabulary key, so the
frontend has nothing sturdier to match on today. Renaming the `Bahamut` or
`Netflix` `Platform` option on the admin Options page silently drops the
badge on every card, with no error anywhere. The fix is a deliberate
cross-layer API change — adding `option_id` to `SourceRef`, to
`attach_sources`, and to both cards — not a tail-end patch, so it is recorded
here rather than applied inline. Failure mode is a missing badge, not data
loss or a wrong value.

---

## 19. Removed by migrations

| Rule / column                                                    | Migration                                                       | Replaced by                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `prequel_id`, `sequel_id`, `alternative`, `derive_related` columns on every media table, and the prequel/sequel derivation from release order | `media_relation_drop_legacy.py`                                 | `media_relation` rows, hand-curated (section 13). The derivation guessed wrong too often — it could not tell a sequel from a side story. |
| Watch-order derivation (`derive_related_anime` assigning `watch_order`)   | (function removed; `derive_ep_previous_all_anime` is what is left) | `watch_order_list` / `watch_order_section` / `watch_order_item`, curated by hand                 |
| `watch_next` / `read_next` boolean columns; `franchise.watch_next_group`  | `b872c435410b_add_plan_next_table.py`                           | `plan_next` rows with `kind="next"`; `watch_next_group` values were copied into `size_group_manual.anime` |
| `to_rewatch` (franchise, series, anime_movies, movies, tv_shows, cartoons) and `to_reread` (manga, novel, comic) columns | `9b0bcb763e8c_add_plan_next_kind_and_drop_rewatch_.py` | `plan_next` rows with `kind="rewatch"` (section 14)                                             |
| `director` (anime, anime_movies, movies), `writer` / `artist` / `publisher` (comic), `publisher_tw` (manga, novel, comic) text columns | `d1r2o3p4c5o6l_drop_legacy_credit_columns.py`                   | `media_credit` / `media_tag` link rows; Fill checks them through `*_LINK_FIELDS_TO_FILL` (section 5) |
| `remark` columns on `series` and `system_option` (and the other owner tables) | `f1a2b3c4d5e6_add_remark_to_series.py`, `so1p2t3i4o5n_reshape_system_option.py`, `r1e2m3a4r5k6…` | the singleton `note` row with `section="remark"` (section 11)                        |
| `"JUL 2001"` release-date format and integer `release_year` columns       | release-date migration                                          | truncated ISO strings (section 1); `normalize` still accepts the old shapes on read                |
