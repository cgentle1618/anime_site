# Options & Enum Values

Valid values for enumerated fields across the application. These drive frontend dropdowns, backend filtering, and business logic.

Fields marked _(future)_ are planned but not yet in the database schema.

## Table of Contents

- [System Options Categories](#system-options-categories)
- [Watching Status](#watching-status)
- [Watching Status Filter Options](#watching-status-filter-options)
- [Reading Status](#reading-status)
- [Airing Type](#airing-type)
- [Airing Status](#airing-status)
- [Day of Week](#day-of-week)
- [Franchise Type](#franchise-type)
- [My Rating](#my-rating)
- [Franchise Expectation](#franchise-expectation)
- [Music Status](#music-status)
- [Seiyuu Status](#seiyuu-status)
- [Movie Type](#movie-type)
- [Comic Type](#comic-type)
- [Region (TV Show)](#region-tv-show)
- [Region (Manga)](#region-manga)
- [Serialization Status](#serialization-status)
- [Watch Order Step Importance](#watch-order-step-importance)
- [Size Groups](#size-groups)
- [Note Section Kinds](#note-section-kinds)
- [Franchise — Special Entries](#franchise--special-entries)
- [Fields to Fill by Entry Type](#fields-to-fill-by-entry-type)

---

## System Options Categories

These categories are stored in the `system_options` table and power dynamic dropdowns in the frontend. Values are user-managed via the admin Options page and auto-extracted from anime entries by `extract_system_options`.

| Category                     | Notes                          |
| ---------------------------- | ------------------------------ |
| `Studio`                     |                                |
| `Distributor TW`             |                                |
| `Director`                   | referring to director in anime |
| `Producer`                   |                                |
| `Music / Composer`           |                                |
| `Manga Author`               |                                |
| `Genre Main`                 |                                |
| `Genre Sub`                  |                                |
| `TV Show Official Source`    |                                |
| `Cartoon Official Source`    |                                |
| `Movie Franchise for Filter` |                                |
| `Main / Spinoff`             |                                |
| `Dub Preference`             |                                |
| `Comic Publisher`            |                                |
| `Comic Imprint`               |                                |
| `Comic Continuity`            |                                |
| `Comic Era`                    |                                |
| `Comic Event`                  |                                |
| `Comic Writer`                 |                                |
| `Comic Artist`                 |                                |

Comic also reuses the existing `Distributor TW` category above (mapped to
`comic.publisher_tw`), and reuses the Reading Status and Serialization Status
option lists below rather than defining its own.

---

## Watching Status

Field: `anime.watching_status` — Default: `Might Watch`

| Value              | Default |
| ------------------ | ------- |
| `Might Watch`      | Yes     |
| `Plan to Watch`    |         |
| `Watch When Airs`  |         |
| `Active Watching`  |         |
| `Passive Watching` |         |
| `Paused`           |         |
| `Completed`        |         |
| `Completed (解說)` |         |
| `Temp Dropped`     |         |
| `Dropped`          |         |
| `Won't Watch`      |         |

---

## Watching Status Filter Options

Used in UI filters only — not a database field.

| Filter Value  | Includes                                  |
| ------------- | ----------------------------------------- |
| `Might Watch` | Might Watch                               |
| `Planned`     | Plan to Watch, Watch When Airs            |
| `Watching`    | Active Watching, Passive Watching, Paused |
| `Completed`   | Completed, Completed (解說)               |
| `Dropped`     | Temp Dropped, Dropped, Won't Watch        |

---

## Reading Status

Field: `reading_status` _(future)_ — Default: `Might Read`

| Value             | Default |
| ----------------- | ------- |
| `Might Read`      | Yes     |
| `Plan to Read`    |         |
| `Active Reading`  |         |
| `Passive Reading` |         |
| `Paused`          |         |
| `Completed`       |         |
| `Completed (解說)`|         |
| `Temp Dropped`    |         |
| `Dropped`         |         |
| `Won't Read`      |         |

---

## Airing Type

### Anime Airing Type

Field: `anime.airing_type` — Default: `null`

| Value     | Default |
| --------- | ------- |
| `null`    | Yes     |
| `TV`      |         |
| `Movie`   |         |
| `ONA`     |         |
| `OVA`     |         |
| `OAD`     |         |
| `Special` |         |
| `Other`   |         |

---

### Cartoon Airing Type

Field: `cartoon.airing_type` — Default: `TV`

| Value   | Default |
| ------- | ------- |
| `null`  |         |
| `TV`    | Yes     |
| `Movie` |         |
| `Other` |         |

---

## Airing Status

Field: `anime.airing_status` — Default: `Not Yet Aired`

| Value             | Default |
| ----------------- | ------- |
| `Not Yet Aired`   | Yes     |
| `Airing`          |         |
| `Finished Airing` |         |
| `Canceled`        |         |
| `Rumored`         |         |

---

## Day of Week

Fields: `anime.broadcast_day`, `anime.my_watch_day` — Default: `null`

Stored as plain strings; the closed value list lives in `frontend/src/config/weekdays.js` (`WEEKDAYS`) and drives both dropdowns in the Anime Add/Modify forms. There is no backend enum or validator.

| Value       | Default |
| ----------- | ------- |
| `null`      | Yes     |
| `Monday`    |         |
| `Tuesday`   |         |
| `Wednesday` |         |
| `Thursday`  |         |
| `Friday`    |         |
| `Saturday`  |         |
| `Sunday`    |         |

Related field `anime.broadcast_time` is a Postgres `TIME` column (no timezone), exchanged over the API as `"HH:MM:SS"`.

---

## Franchise Type

Field: `franchise.franchise_type` — Default: `null`

| Value         | Default |
| ------------- | ------- |
| `null`        | Yes     |
| `ACG`         |         |
| `Anime Movie` |         |
| `Movie`       |         |
| `TV`          |         |
| `Cartoon`     |         |
| `Comic`       |         |
| `Novel`       |         |

---

## My Rating

Field: `anime.my_rating`, `franchise.my_rating`, `seasonal.my_rating` — Default: `null`

| Value  | Default |
| ------ | ------- |
| `null` | Yes     |
| `S`    |         |
| `A+`   |         |
| `A`    |         |
| `B`    |         |
| `C`    |         |
| `D`    |         |
| `E`    |         |
| `F`    |         |

---

## Franchise Expectation

Field: `franchise.franchise_expectation` — Default: `Low`

| Value    | Default |
| -------- | ------- |
| `Low`    | Yes     |
| `Medium` |         |
| `High`   |         |

---

## Music Status

Field: `note.status` — Default: `null`

The `op`, `ed`, `insert_songs` and `ost` note sections (anime only). These
were the `anime.op` / `anime.ed` / `anime.insert_ost` columns until revision
`m1u2s3i4c5t6` moved them onto note rows, so the status is now per song rather
than per entry. `insert_songs` is `episode_name_links`-shaped rather than
`music_track`-shaped, but it tracks a song the same way, so it offers the same
values. `note.status` exists for this dropdown alone.

| Value     | Default |
| --------- | ------- |
| `null`    | Yes     |
| `Need`    |         |
| `Pending` |         |
| `Done`    |         |

---

## Seiyuu Status

Field: `anime.seiyuu` — Default: `null`

| Value  | Default |
| ------ | ------- |
| `null` | Yes     |
| `Need` |         |
| `Done` |         |

---

## Movie Type

Field: `movie_type` _(future)_ — Default: `null`

| Value       | Default |
| ----------- | ------- |
| `null`      | Yes     |
| `Reality`   |         |
| `Animation` |         |

---

## Comic Type

Field: `comic.comic_type` — Default: `null`

| Value      | Default |
| ---------- | ------- |
| `null`     | Yes     |
| `Ongoing`  |         |
| `Limited`  |         |
| `One-Shot` |         |
| `Annual`   |         |

---

## Region (TV Show)

Field: `region` for TV show entries _(future)_ — Default: `null`

| Value    | Default |
| -------- | ------- |
| `null`   | Yes     |
| `歐美劇` |         |
| `韓劇`   |         |
| `日劇`   |         |
| `陸劇`   |         |
| `台劇`   |         |
| `動畫`   |         |

---

## Region (Manga)

Field: `region` for manga entries _(future)_ — Default: `null`

| Value  | Default |
| ------ | ------- |
| `null` | Yes     |
| `日漫` |         |
| `韓漫` |         |
| `國漫` |         |
| `台漫` |         |
| `其他` |         |

---

## Serialization Status

Field: `serialization_status` _(future)_ — Default: `null`

| Value    | Default | Notes                          |
| -------- | ------- | ------------------------------ |
| `null`   | Yes     |                                |
| `連載中` |         | Currently serializing          |
| `停更`   |         | On hiatus                      |
| `腰斬`   |         | Cancelled / axed               |
| `完結`   |         | Completed                      |
| `未出`   |         | Not yet published (novel only) |

---

## Watch Order Step Importance

Field: `watch_order_item.importance` — Default: `Normal`

One rung per step, never two — which is why this is a single column rather than
a set of booleans. Unrelated to `watch_order_list.list_type`, which also has a
`Recommended` value: that ranks whole orders, this ranks steps within one. The API rejects any other value; the Google Sheets parser
instead coerces an unrecognized cell to `Normal`, so one bad cell cannot fail a
whole restore.

| Value         | Default | Notes                                                                      |
| ------------- | ------- | -------------------------------------------------------------------------- |
| `Essential`   |         | Carries the story; the guide badges it and can show these alone            |
| `Recommended` |         | Worth watching but not load-bearing; badged, and kept by "Hide optional"   |
| `Normal`      | Yes     | An ordinary step — no badge                                                |
| `Optional`    |         | Skippable / filler; the guide dims the row and can hide it                 |

Generated (built-in) orders have no `watch_order_item` rows behind them, so
every step of one is `Normal`.

---

## Media Relation Kinds

The vocabulary of `media_relation.relation_type`, defined in
`app/utils/relation_kinds.py` and served at `GET /api/media-relation/kinds`.

Eleven labels appear in the admin dropdown; ten are stored. `Prequel` is
accepted on write and recorded as a `sequel` row with the endpoints swapped, so
one fact is always one row.

| Label          | Stored as       | Inverse label | Family      |
| -------------- | --------------- | ------------- | ----------- |
| Sequel         | `sequel`        | Prequel       | timeline    |
| Prequel        | `sequel` (swapped) | Sequel     | timeline    |
| Alternative    | `alternative`   | Alternative   | equivalence |
| Corresponding  | `corresponding` | Corresponding | equivalence |
| Renew          | `renew`         | Original      | equivalence |
| Director's Cut | `directors_cut` | Original      | equivalence |
| Extended       | `extended`      | Original      | equivalence |
| Side Story     | `side_story`    | Parent Story  | branch      |
| Spin-off       | `spin_off`      | Main Story    | branch      |
| Setting        | `setting`       | Main Story    | branch      |
| Adaptation     | `adaptation`    | Source        | derivation  |

Families group the rows on the admin page and on each detail page's Related
Entries card: `timeline`, `equivalence`, `branch`, `derivation`.

Only `alternative` and `corresponding` are symmetric. Every other kind is
directional, and the label shown always describes the entry at the *far* end of
the link.

`Alternative` and `Corresponding` differ by how far the work moved. An
alternative is *essentially* the same entry — a dub, a re-release, the same
story told again. A corresponding entry is *fundamentally* the same story told
differently: the Fate/stay night routes, where Unlimited Blade Works and
Heaven's Feel cover one war from another perspective. Neither is the origin of
the other, so three routes are three peer rows rather than a hub.

Both are also **transitive**: with `A-corresponding-B` and `B-corresponding-C`
stored, A, B and C all correspond to each other.

Chains cross the two kinds, and a chain is only as strong as its **weakest
link**. `A-alternative-B` with `B-corresponding-C` makes A and C
*corresponding*, never alternative — the Corresponding hop cannot carry the
stronger claim that A and C are essentially the same work. Alternative is the
stronger of the two, and where more than one route reaches an entry the
strongest one it can support is the one reported. Taking the weakest link
rather than, say, the first hop is also what makes the pair read the same from
both ends.

The closure is expanded on the **media entry page only**. `GET /for-entry`
returns the inferred rows with `derived: true`, a null `system_id` and a `via`
naming the neighbour the chain arrived through; the card renders that as
"· via <name>". `GET /graph` keeps returning stored rows alone, so the
relations canvas stays a few lines rather than a mesh of n(n-1)/2 saying one
thing.

---

## Size Groups

The vocabulary of `franchise.size_group_derived` / `size_group_manual` /
`series.size_group_derived` / `size_group_manual` (bucket keys) and of
`plan_next.scope` (planning scopes), defined in
`app/utils/plan_next_kinds.py` and served at `GET /api/plan-next/kinds`, so the
admin dropdowns and the Plan page tabs keep no second copy. Mirrored for the
frontend in `frontend/src/config/planNextGroups.js`.

A bucket is a standing property of a franchise or series — "2 Seasons" whether
or not anything is currently queued — not a property of a `plan_next` row. See
business-logic.md for how a bucket is derived and how an entry inherits one.

**Scopes** (`plan_next.scope`): `entry`, `series`, `franchise`.

**Plan Kind** (`plan_next.kind`): `next` | `rewatch`. `plan_next` holds two
independent Plan-page queues distinguished by this column — "Watch Next" (what
is queued to watch or read) and "To Rewatch" (what is marked to watch or read
again). A row's scope permissions depend on **both** its kind and its media
type: `ALLOWED_SCOPES` in `app/utils/plan_next_kinds.py` is keyed by kind
first, then media type, because which tiers a type may be planned at is not
the same question as which tiers it may be rewatched at — anime and cartoon
are queued one season/entry at a time but rewatched as a whole franchise, and
novels are reread at every tier though only ever queued one book at a time.

**Scope permissions — kind `next` ("Watch Next").** Entry is universal; the
two grouping tiers are opt-in because anime movies, manga and novels are
tracked one entry at a time, and comic has no franchise-level planning:

| Media type    | Entry | Series | Franchise |
| ------------- | :---: | :----: | :-------: |
| `anime`       | yes   | yes    | yes       |
| `movie`       | yes   | yes    | yes       |
| `tv-show`     | yes   | yes    | yes       |
| `cartoon`     | yes   | yes    | yes       |
| `comic`       | yes   | yes    | —         |
| `anime-movie` | yes   | —      | —         |
| `manga`       | yes   | —      | —         |
| `novel`       | yes   | —      | —         |

**Scope permissions — kind `rewatch` ("To Rewatch" / "To Reread").** Deliberately
different from the `next` map above: anime and cartoon are rewatched at
franchise scope only (they have **no** entry-level rewatch field at all), and
novel gains series and franchise scope that it does not have for `next`.
Franchise and series have no schema field for this — group-level marks are
read and written directly through `/api/plan-next/` with `scope=franchise` /
`scope=series`, not through an entry-style boolean:

| Media type    | Entry | Series | Franchise |
| ------------- | :---: | :----: | :-------: |
| `anime`       | —     | —      | yes       |
| `movie`       | yes   | yes    | yes       |
| `tv-show`     | yes   | yes    | yes       |
| `cartoon`     | —     | —      | yes       |
| `comic`       | yes   | yes    | —         |
| `anime-movie` | yes   | —      | —         |
| `manga`       | yes   | —      | —         |
| `novel`       | yes   | yes    | yes       |

The six entry-level `yes` cells above (`anime-movie`, `movie`, `tv-show`,
`manga`, `novel`, `comic`) are backed by virtual `to_rewatch` (movie types) /
`to_reread` (reading types) API fields over `plan_next`; see
database-schema.md. `anime` and `cartoon` have no such field — they are
rewatched at franchise scope only.

**Bucket vocabularies.** Keys are hyphenated media types, matching
`app/utils/media_resolver.py`. `anime-movie`, `manga` and `novel` have **no**
vocabulary — entry scope only, so no bucket ever applies to them.

| Media type          | Key            | Label          |
| ------------------- | -------------- | -------------- |
| `anime`              | `12ep`         | 12 EP          |
| `anime`              | `24ep`         | 24 EP          |
| `anime`              | `30ep_plus`    | 30+ EP         |
| `tv-show`, `cartoon` | `1season`      | 1 Season       |
| `tv-show`, `cartoon` | `2season`      | 2 Seasons      |
| `tv-show`, `cartoon` | `3season_plus` | 3+ Seasons     |
| `movie`              | `standalone`   | Standalone     |
| `movie`              | `2_3movies`    | 2-3 Movies     |
| `movie`              | `4movies_plus` | 4+ Movies      |
| `comic`              | `1_3`          | 1-3 Issues     |
| `comic`              | `4_10`         | 4-10 Issues    |
| `comic`              | `11_plus`      | 11+ Issues     |

The `anime` vocabulary existed before this table (as the now-removed
`franchise.watch_next_group` string) but was hardcoded across three frontend
files and undocumented; all four vocabularies now live in one backend module
and one frontend module, and here.

---

## Note Section Kinds

Field: `note.kind` — Default: `null`

A dropdown only where the section declares one. `kinds` is a property of the
section in `app/utils/note_sections.py`, and the API rejects a value the
section does not list, so this vocabulary is enforced rather than advisory.

### `op_ed_changes` (OP/ED 變動)

Anime, TV Show and Cartoon. Which OP/ED a given episode did something unusual with.

| Value     | Default | Notes                          |
| --------- | ------- | ------------------------------ |
| `變化OP`  |         | The OP changed for this episode |
| `變化ED`  |         | The ED changed for this episode |
| `無OP`    |         | No OP this episode              |
| `無ED`    |         | No ED this episode              |
| `特殊OP`  |         | A one-off special OP            |
| `特殊ED`  |         | A one-off special ED            |

### `op` / `ed` / `ost` (音樂 Music)

Anime only. Which cut of a theme song a row is about. The one dropdown with a
default: a new row starts on `normal`, so the type alone never makes a row
worth storing — it needs a name, a status, a link or a remark as well.

`insert_songs` deliberately has **no** type: an insert song is whatever cut
plays in that episode, so "which version" has no answer separate from the
episode itself.

| Value                   | Default | Notes                                    |
| ----------------------- | ------- | ---------------------------------------- |
| `normal`                | Yes     | The standard version                     |
| `different version`     |         | A reworked cut of the same song          |
| `all inclusive version` |         | The full version covering every variant  |

### `highlights` / `highlight_episodes` (神回/神片段)

Anime (`highlights`), plus TV Show and Cartoon (`highlight_episodes`). The
stored data distinguishes a great episode from a great moment inside one and a
great arc across several, so these sections carry a dropdown.

| Value    | Default | Notes                                  |
| -------- | ------- | -------------------------------------- |
| `神回`   |         | A standout single episode              |
| `神片段` |         | A standout moment within an episode     |
| `神篇章` |         | A standout arc spanning several episodes |

Manga also uses `highlight_episodes`, but with **no** dropdown: its highlights
are always 神回, which is why the section is labelled that on manga. `novel`'s
`highlight_passages` has no kind either.

### Retired: `回顧` and `其他`

The old `特殊變動` list mixed several unrelated ideas under one "type" field.
The notes restructure split it into `op_ed_changes` and `extended_episodes`
(加長). `回顧` (recap) and `其他` (other) belong to neither, so they are **not**
in either vocabulary and cannot be entered.

They were not silently dropped: the `note_backfill_rows` migration logs every
row carrying one, with its owner id and content, and leaves it for manual
placement.

---

## Special Franchises

Predefined franchise names used as grouping hubs within each `franchise_type`. These are not enum values — they are specific database entries.

### ACG

| Franchise Name |
| -------------- |
| 藤本樹         |

### Anime Movie

| Franchise Name |
| -------------- |
| 原創動畫電影   |
| 改編動畫電影   |
| 新海誠         |
| 吉卜力         |

## Movie

| Franchise Name    |
| ----------------- |
| 獨立電影          |
| Marvel            |
| Disney            |
| Christopher Nolan |
| 周星馳            |

### TV

| Franchise Name |
| -------------- |
| 獨立影集       |
| Marvel         |
| Disney         |

---

## Movie Franchise for Filter Options

| 獨立電影 / 影集 |
| Disney |
| Marvel |
| Christopher Nolan |

---

## TV Show Franchise for Filter Options

| 獨立電影 / 影集 |
| Disney |
| Marvel |
| The Game of Thrones |

---

## Fields to Fill by Entry Type

Required metadata fields that should be populated for each entry type. Used by `has_missing_values_anime()` to determine Fill eligibility.

### Anime (TV / Movie / ONA / OVA / Special)

| Field              | Notes                                         |
| ------------------ | --------------------------------------------- |
| `airing_type`      |                                               |
| `airing_status`    |                                               |
| `release_date`     |                                               |
| `release_season`   |                                               |
| `mal_rating`       | Skipped if `airing_status` is `Not Yet Aired` |
| `mal_rank`         | Skipped if `airing_status` is `Not Yet Aired` |
| `ep_total`         |                                               |
| `official_link`    |                                               |
| `twitter_link`     |                                               |
| `cover_image_file` |                                               |

### Anime Movie

| Field              | Notes |
| ------------------ | ----- |
| `airing_status`    |       |
| `release_date_jp`  |       |
| `mal_rating`       |       |
| `mal_rank`         |       |
| `ep_total`         |       |
| `official_link`    |       |
| `twitter_link`     |       |
| `cover_image_file` |       |

### Movie

| Field              | Notes |
| ------------------ | ----- |
| `length_min`       |       |
| `director`         |       |
| `airing_status`    |       |
| `release_date_usa` |       |
| `imdb_rating`      |       |
| `ep_total`         |       |
| `cover_image_file` |       |

### TV Show

| Field              | Notes |
| ------------------ | ----- |
| `airing_status`    |       |
| `release_date`     |       |
| `imdb_rating`      |       |
| `ep_total`         |       |
| `cover_image_file` |       |

### Cartoon (Movie airing type)

| Field              | Notes                                               |
| ------------------ | --------------------------------------------------- |
| `airing_status`    |                                                     |
| `release_date`     | Mapped from `release_date_usa` in TMDB movie output |
| `imdb_rating`      |                                                     |
| `cover_image_file` |                                                     |

### Cartoon (TV airing type)

| Field              | Notes |
| ------------------ | ----- |
| `airing_status`    |       |
| `release_date`     |       |
| `imdb_rating`      |       |
| `ep_total`         |       |
| `cover_image_file` |       |

### Manga

| Field                  | Notes |
| ---------------------- | ----- |
| `serialization_status` |       |
| `release_date`         |       |
| `end_date`             |       |
| `mal_rating`           |       |
| `mal_rank`             |       |
| `cover_image_file`     |       |

### Novel

| Field                  | Notes                                           |
| ---------------------- | ----------------------------------------------- |
| `serialization_status` |                                                 |
| `release_date`         |                                                 |
| `end_date`             |                                                 |
| `mal_rating`           |                                                 |
| `mal_rank`             |                                                 |
| `vol_total_original`   | Skipped if `serialization_status` is not `完結` |
| `ch_total`             | Skipped if `serialization_status` is not `完結` |
| `cover_image_file`     |                                                 |
