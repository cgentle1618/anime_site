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
- [Franchise Type](#franchise-type)
- [My Rating](#my-rating)
- [Franchise Expectation](#franchise-expectation)
- [Music Status](#music-status)
- [Seiyuu Status](#seiyuu-status)
- [Movie Type](#movie-type)
- [Region (TV Show)](#region-tv-show)
- [Region (Manga)](#region-manga)
- [Serialization Status](#serialization-status)
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
| `Completed`   | Completed                                 |
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

Fields: `anime.op`, `anime.ed`, `anime.insert_ost` — Default: `null`

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
| `release_month`    |                                               |
| `release_season`   |                                               |
| `release_year`     |                                               |
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
| `release_year`         |       |
| `end_year`             |       |
| `mal_rating`           |       |
| `mal_rank`             |       |
| `cover_image_file`     |       |

### Novel

| Field                  | Notes                                           |
| ---------------------- | ----------------------------------------------- |
| `serialization_status` |                                                 |
| `release_year`         |                                                 |
| `end_year`             |                                                 |
| `mal_rating`           |                                                 |
| `mal_rank`             |                                                 |
| `vol_total_original`   | Skipped if `serialization_status` is not `完結` |
| `ch_total`             | Skipped if `serialization_status` is not `完結` |
| `cover_image_file`     |                                                 |
