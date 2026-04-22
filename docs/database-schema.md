# Database Schema

## Table of Contents

- [Hierarchy Overview](#hierarchy-overview)
- [Naming Conventions](#naming-conventions)
- [Core Tables](#core-tables)
  - [franchise](#franchise)
  - [series](#series)
  - [anime](#anime)
- [System & Configuration Tables](#system--configuration-tables)
  - [system_options](#system_options)
  - [system_configs](#system_configs)
  - [seasonal](#seasonal)
  - [users](#users)
- [Audit & Logging Tables](#audit--logging-tables)
  - [data_control_logs](#data_control_logs)
  - [deleted_record](#deleted_record)

---

## Hierarchy Overview

```
franchise  (top-level hub)
  └── series  (optional grouping layer within a franchise)
        └── single media entry  (granular entry — anime, cartoon, movie, manga, etc.)
```

- An `anime` always belongs to a `franchise` directly via `franchise_id`.
- A `series` is an optional intermediate grouping; `anime.series_id` may be null.
- `franchise`, `series`, and `anime` use UUID primary keys. `seasonal`, `system_options`, `system_configs`, `users`, `data_control_logs`, and `deleted_record` use integer or string PKs.

---

## Naming Conventions

### Multi-language Name Fields

All three core tables follow the same pattern for name fields:

| Suffix        | Language              |
| ------------- | --------------------- |
| `_name_cn`    | Chinese (Traditional) |
| `_name_en`    | English               |
| `_name_roman` | Romanized (romaji)    |
| `_name_jp`    | Japanese              |
| `_name_alt`   | Alternate / alias     |

**`display_name` fallback order** (via `NameFallbackMixin`): CN → EN → Alt → roman → JP

`series` only has CN / EN / Alt (no roman or JP fields).

---

## Core Tables

### `franchise`

Top-level media franchise entity. Groups related series and individual entries.

| Column                  | Type     | Nullable | Default    | Notes                              |
| ----------------------- | -------- | -------- | ---------- | ---------------------------------- |
| `system_id`             | UUID     | No       | `uuid4()`  | Primary key                        |
| `franchise_type`        | String   | Yes      | —          | e.g. "Anime", "Cartoon", "Game"    |
| `franchise_name_en`     | String   | Yes      | —          |                                    |
| `franchise_name_cn`     | String   | Yes      | —          |                                    |
| `franchise_name_roman`  | String   | Yes      | —          |                                    |
| `franchise_name_jp`     | String   | Yes      | —          |                                    |
| `franchise_name_alt`    | String   | Yes      | —          |                                    |
| `my_rating`             | String   | Yes      | —          | Personal rating (S/A+/A/B/C/D/E/F) |
| `franchise_expectation` | String   | Yes      | `"Low"`    |                                    |
| `favorite_3x3_slot`     | Integer  | Yes      | —          | 1–9 slot for 3x3 grid              |
| `cover_anime_id`        | UUID     | Yes      | —          | FK -> `anime.system_id` SET NULL   |
| `watch_next_group`      | String   | Yes      | —          |                                    |
| `to_rewatch`            | Boolean  | Yes      | `False`    |                                    |
| `remark`                | Text     | Yes      | —          |                                    |
| `created_at`            | DateTime | No       | Taipei now |                                    |
| `updated_at`            | DateTime | No       | Taipei now | Auto-updated on save               |

**Relationships:** `series[]` (one-to-many), `animes[]` (one-to-many via `franchise_id`)

---

### `series`

Optional intermediate grouping layer within a franchise.

| Column            | Type   | Nullable | Default   | Notes                                |
| ----------------- | ------ | -------- | --------- | ------------------------------------ |
| `system_id`       | UUID   | No       | `uuid4()` | Primary key                          |
| `franchise_id`    | UUID   | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_name_en`  | String | Yes      | —         |                                      |
| `series_name_cn`  | String | Yes      | —         |                                      |
| `series_name_alt` | String | Yes      | —         |                                      |
| `remark`          | Text   | Yes      | —         |                                      |

**Relationships:** `franchise` (many-to-one), `animes[]` (one-to-many)

**Note:** Series has no `roman` or `jp` name fields. `display_name` fallback: CN → EN → Alt.

---

### `anime`

The granular media entry. Covers anime, cartoons, OVAs, movies, specials, etc.

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_id`    | UUID | Yes      | —         | FK -> `series.system_id` SET NULL    |

#### Names

| Column             | Type   | Nullable |
| ------------------ | ------ | -------- |
| `anime_name_en`    | String | Yes      |
| `anime_name_cn`    | String | Yes      |
| `anime_name_roman` | String | Yes      |
| `anime_name_jp`    | String | Yes      |
| `anime_name_alt`   | String | Yes      |

#### Classification & Status

| Column            | Type    | Nullable | Default         | Notes                                                  |
| ----------------- | ------- | -------- | --------------- | ------------------------------------------------------ |
| `season_part`     | String  | Yes      | —               | Airing season, e.g. `"2024 WIN"`, `"2025 SPR"`         |
| `airing_type`     | String  | Yes      | —               | `"TV"`, `"ONA"`, `"OVA"`, `"Movie"`, `"Special"`, etc. |
| `airing_status`   | String  | Yes      | —               | `"Airing"`, `"Finished"`, `"Not Yet Aired"`            |
| `watching_status` | String  | No       | `"Might Watch"` | See options.md for all valid values                    |
| `is_main`         | String  | Yes      | —               | Legacy field                                           |
| `is_main_entry`   | Boolean | Yes      | —               | Whether this is the main entry for its `season_part`   |

#### Episode Tracking

| Column        | Type    | Nullable | Default | Notes                                    |
| ------------- | ------- | -------- | ------- | ---------------------------------------- |
| `ep_previous` | Integer | Yes      | —       | Cumulative episodes from prior seasons   |
| `ep_total`    | Integer | Yes      | —       | Total episodes for this entry            |
| `ep_fin`      | Integer | Yes      | `0`     | Episodes finished for this entry         |
| `ep_special`  | Float   | Yes      | —       | Special episode number (e.g. `0`, `0.5`) |

**Computed fields** (returned in API responses, not stored in DB):

| Field          | Formula                  | Notes                        |
| -------------- | ------------------------ | ---------------------------- |
| `cum_ep_fin`   | `ep_previous + ep_fin`   | Cumulative finished episodes |
| `cum_ep_total` | `ep_previous + ep_total` | Null if `ep_total` is null   |

#### Ratings

| Column           | Type   | Nullable | Notes                          |
| ---------------- | ------ | -------- | ------------------------------ |
| `my_rating`      | String | Yes      | S / A+ / A / B / C / D / E / F |
| `mal_rating`     | Float  | Yes      | MAL score 0.0–10.0             |
| `mal_rank`       | String | Yes      | MAL rank stored as string      |
| `anilist_rating` | String | Yes      | AniList score                  |

#### Release Info

| Column           | Type   | Nullable | Notes                                 |
| ---------------- | ------ | -------- | ------------------------------------- |
| `release_month`  | String | Yes      | e.g. `"Jan"`, `"Apr"`                 |
| `release_season` | String | Yes      | `"WIN"` / `"SPR"` / `"SUM"` / `"FAL"` |
| `release_year`   | String | Yes      | e.g. `"2024"`                         |

#### Production

| Column           | Type   | Nullable |
| ---------------- | ------ | -------- |
| `studio`         | String | Yes      |
| `director`       | String | Yes      |
| `producer`       | String | Yes      |
| `music`          | String | Yes      |
| `distributor_tw` | String | Yes      |
| `genre_main`     | String | Yes      |
| `genre_sub`      | String | Yes      |

#### Relational & Ordering

| Column           | Type    | Nullable | Notes                                                                    |
| ---------------- | ------- | -------- | ------------------------------------------------------------------------ |
| `derive_related` | Boolean | Yes      | Three-state: `true` = force-derive, `false` = skip derive, `null` = auto |
| `prequel_id`     | UUID    | Yes      | UUID of the prequel anime entry; no FK constraint                        |
| `sequel_id`      | UUID    | Yes      | UUID of the sequel anime entry; no FK constraint                         |
| `alternative`    | String  | Yes      | Notes about alternative versions                                         |
| `watch_order`    | Float   | Yes      | Derived watch order position within the franchise                        |

#### External Links

| Column          | Type    | Nullable |
| --------------- | ------- | -------- |
| `mal_id`        | Integer | Yes      |
| `mal_link`      | String  | Yes      |
| `anilist_link`  | String  | Yes      |
| `official_link` | String  | Yes      |
| `twitter_link`  | String  | Yes      |

#### Music & Cast

| Column       | Type   | Nullable |
| ------------ | ------ | -------- |
| `op`         | String | Yes      |
| `ed`         | String | Yes      |
| `insert_ost` | String | Yes      |
| `seiyuu`     | String | Yes      |

#### Sources & Streaming

| Column              | Type    | Nullable | Default | Notes                                                                      |
| ------------------- | ------- | -------- | ------- | -------------------------------------------------------------------------- |
| `source_baha`       | Boolean | Yes      | `None`  | Three-state: `true` = available, `false` = not available, `null` = unknown |
| `baha_link`         | String  | Yes      | —       |                                                                            |
| `source_netflix`    | Boolean | Yes      | `False` | Three-state: `true` / `false` / `null`                                     |
| `source_other`      | String  | Yes      | `None`  | Name of other streaming source                                             |
| `source_other_link` | String  | Yes      | —       |                                                                            |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `remark`           | Text     | Yes      | Free-form notes                             |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

---

## System & Configuration Tables

### `system_options`

Dynamic dropdown/choice list values used in frontend forms. Editable via the admin Options page.

| Column         | Type    | Nullable | Notes                                                                       |
| -------------- | ------- | -------- | --------------------------------------------------------------------------- |
| `id`           | Integer | No       | Auto-increment PK                                                           |
| `category`     | String  | No       | Indexed. Groups options by field, e.g. `"airing_type"`, `"watching_status"` |
| `option_value` | String  | No       | The selectable value                                                        |

---

### `system_configs`

Persistent global application settings stored as key-value pairs.

| Column         | Type    | Nullable | Notes             |
| -------------- | ------- | -------- | ----------------- |
| `id`           | Integer | No       | Auto-increment PK |
| `config_key`   | String  | No       | Unique, indexed   |
| `config_value` | String  | No       |                   |

**Known keys:**

| Key              | Example Value | Purpose                                      |
| ---------------- | ------------- | -------------------------------------------- |
| `current_season` | `"2025 SPR"`  | Drives current-season highlighting in the UI |

---

### `seasonal`

Aggregated metrics per airing season. One row per season string.

| Column            | Type    | Nullable | Default | Notes                                               |
| ----------------- | ------- | -------- | ------- | --------------------------------------------------- |
| `seasonal`        | String  | No       | —       | Primary key. Format: `"YYYY SSS"` e.g. `"2025 SPR"` |
| `my_rating`       | String  | Yes      | —       | Personal season-level rating                        |
| `entry_completed` | Integer | No       | `0`     | Count of completed entries this season              |
| `entry_watching`  | Integer | No       | `0`     | Count of currently watching entries                 |
| `entry_dropped`   | Integer | No       | `0`     | Count of dropped entries                            |

**Note:** Rows are auto-created by `create_missing_seasonal()` and counts synced by `sync_seasonal_counts()` during Calculate All.

---

### `users`

Admin user accounts. Role determines read-only vs. full access.

| Column            | Type   | Nullable | Default   | Notes                  |
| ----------------- | ------ | -------- | --------- | ---------------------- |
| `id`              | UUID   | No       | `uuid4()` | Primary key            |
| `username`        | String | No       | —         | Unique, indexed        |
| `hashed_password` | String | No       | —         | bcrypt hash            |
| `role`            | String | No       | `"guest"` | `"admin"` or `"guest"` |

---

## Audit & Logging Tables

### `data_control_logs`

Audit trail for data pipeline runs (Backup, Pull, Fill, Replace, Calculate).

| Column            | Type     | Nullable | Notes                                                      |
| ----------------- | -------- | -------- | ---------------------------------------------------------- |
| `id`              | Integer  | No       | Auto-increment PK                                          |
| `action_main`     | String   | No       | `"Fill"`, `"Replace"`, `"Backup"`, `"Pull"`, `"Calculate"` |
| `action_specific` | String   | No       | e.g. `"All"`, `"Anime"`, tab name                          |
| `type`            | String   | No       | `"Manual"` or `"Auto"`                                     |
| `status`          | String   | No       | `"Success"`, `"Failed"`, `"Aborted"`                       |
| `rows_added`      | Integer  | No       | Default `0`                                                |
| `rows_updated`    | Integer  | No       | Default `0`                                                |
| `rows_deleted`    | Integer  | No       | Default `0`                                                |
| `error_message`   | Text     | Yes      | Populated on failure                                       |
| `details_json`    | Text     | Yes      | Optional JSON with run details                             |
| `timestamp`       | DateTime | No       | Taipei now                                                 |

---

### `deleted_record`

Tombstone log. Captures key metadata at the moment of deletion for audit display.

| Column           | Type     | Nullable | Notes                                                                            |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `id`             | Integer  | No       | Auto-increment PK                                                                |
| `type`           | String   | No       | `"Franchise"`, `"Series"`, `"Anime"`, `"System Options"`                         |
| `name_cn`        | String   | Yes      | Entry CN name with fallback; `option_value` for System Options                   |
| `name_en`        | String   | Yes      | Entry EN name with fallback; null if CN was a fallback or type is System Options |
| `franchise_cn`   | String   | Yes      | Parent franchise CN; populated for Series and Anime                              |
| `franchise_type` | String   | Yes      | Franchise type value; populated for Franchise entries                            |
| `series_cn`      | String   | Yes      | Parent series CN; populated for Anime entries only                               |
| `category`       | String   | Yes      | Option category; populated for System Options only                               |
| `timestamp`      | DateTime | No       | Taipei now                                                                       |
