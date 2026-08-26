# Database Schema

## Table of Contents

- [Hierarchy Overview](#hierarchy-overview)
- [Naming Conventions](#naming-conventions)
- [Core Tables](#core-tables)
  - [collection](#collection)
  - [franchise](#franchise)
  - [series](#series)
- [Media Entry Tables](#media-entry-tables)
  - [anime](#anime)
  - [anime_movies](#anime_movies)
  - [movies](#movies)
  - [tv_shows](#tv_shows)
  - [cartoons](#cartoons)
  - [manga](#manga)
  - [novel](#novel)
  - [comic](#comic)
- [Watch Order Tables](#watch-order-tables)
- [Media Relation Table](#media-relation-table)
  - [watch_order_list](#watch_order_list)
  - [watch_order_item](#watch_order_item)
- [Note Table](#note-table)
  - [note](#note)
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
collection  (optional umbrella above franchise — e.g. Marvel, Type-Moon)
  └── franchise  (top-level hub)
        └── series  (optional grouping layer within a franchise)
              └── single media entry  (granular entry — anime, anime_movies, movies, tv_shows, cartoons, manga, novel, comic)
```

- A media entry (e.g. `anime`, `movies`) always belongs to a `franchise` directly via `franchise_id`.
- A `series` is an optional intermediate grouping; `series_id` may be null on media entries.
- A `collection` is an optional umbrella grouping several distinct franchises under one IP or creator; `collection_id` may be null on `franchise`, and most franchises have none. **No media table references a collection** — media reaches it only through `franchise.collection_id`.
- Collection is deliberately inert: it takes no part in watch-order/prequel-sequel derivation, duplicate detection, or statistics.
- `franchise`, `series`, and all media entry tables use UUID primary keys. `seasonal`, `system_options`, `system_configs`, `users`, `data_control_logs`, and `deleted_record` use integer or string PKs.

---

## Naming Conventions

### Multi-language Name Fields

Core tables and media entry tables follow the same pattern for name fields where applicable:

| Suffix        | Language              |
| ------------- | --------------------- |
| `_name_cn`    | Chinese (Traditional) |
| `_name_en`    | English               |
| `_name_roman` | Romanized (romaji)    |
| `_name_jp`    | Japanese              |
| `_name_alt`   | Alternate / alias     |

**`display_name` fallback order** (via `NameFallbackMixin`): CN → EN → Alt → roman → JP

`movies`, `tv_shows`, and `cartoons` only have CN / EN / Alt (no roman or JP fields).

---

## Core Tables

### `collection`

Optional umbrella tier above Franchise. Groups several distinct franchises that share an IP or creator (e.g. "Marvel" over MCU / X-Men / Spider-Man; "Type-Moon" over Fate/stay night / Tsukihime / Kara no Kyoukai).

| Column                   | Type     | Nullable | Default    | Notes                                                                                          |
| ------------------------ | -------- | -------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `system_id`              | UUID     | No       | `uuid4()`  | Primary key                                                                                    |
| `collection_name_en`     | String   | Yes      | —          |                                                                                                |
| `collection_name_cn`     | String   | Yes      | —          |                                                                                                |
| `collection_name_roman`  | String   | Yes      | —          |                                                                                                |
| `collection_name_jp`     | String   | Yes      | —          |                                                                                                |
| `collection_name_alt`    | String   | Yes      | —          |                                                                                                |
| `my_rating`              | String   | Yes      | —          | Personal rating (S/A+/A/B/C/D/E/F)                                                             |
| `collection_expectation` | String   | Yes      | `"Low"`    | `"Highest"`, `"High"`, `"Medium"`, `"Low"`                                                     |
| `cover_franchise_id`     | UUID     | Yes      | —          | FK → `franchise.system_id` (`ON DELETE SET NULL`). The cover is a **member franchise**, whose own cover logic then resolves the image. Falls back to the first member with a cover. |
| `created_at`             | DateTime | Yes      | Taipei now |                                                                                                |
| `updated_at`             | DateTime | Yes      | Taipei now | Auto-updated on save                                                                           |
| `no_built_in_orders` | Boolean | Yes | Opts every member franchise out of built-in watch orders. Set for 迪士尼, whose members are unrelated standalone works |


**Note:** There is deliberately no `collection_type`, and no roll-up/computed statistics. `remark` is not a column here — see the `note` table below for how it is exposed as a read-only property backed by that table's singleton `remark` row.

**Relationships:** `franchises[]` (one-to-many, via `franchise.collection_id`), `cover_franchise` (many-to-one)

**Circular FK:** `collection.cover_franchise_id` → `franchise` and `franchise.collection_id` → `collection` form a cycle. Both are nullable, and the SQLAlchemy column uses `use_alter=True` so `create_all`/`drop_all` can order the DDL. The Alembic migration creates both tables before adding either constraint.

---

### `franchise`

Top-level media franchise entity. Groups related series and individual entries.

| Column                  | Type     | Nullable | Default    | Notes                                                                                                                                       |
| ----------------------- | -------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `system_id`             | UUID     | No       | `uuid4()`  | Primary key                                                                                                                                 |
| `franchise_type`        | String   | Yes      | —          | `"ACG"`, `"Anime Movie"`, `"TV or Movie"`, `"Cartoon"`, or null                                                                             |
| `franchise_name_en`     | String   | Yes      | —          |                                                                                                                                             |
| `franchise_name_cn`     | String   | Yes      | —          |                                                                                                                                             |
| `franchise_name_roman`  | String   | Yes      | —          |                                                                                                                                             |
| `franchise_name_jp`     | String   | Yes      | —          |                                                                                                                                             |
| `franchise_name_alt`    | String   | Yes      | —          |                                                                                                                                             |
| `my_rating`             | String   | Yes      | —          | Personal rating (S/A+/A/B/C/D/E/F)                                                                                                          |
| `franchise_expectation` | String   | Yes      | `"Low"`    | `"Highest"`, `"High"`, `"Medium"`, `"Low"`                                                                                                  |
| `collection_id`         | UUID     | Yes      | —          | FK → `collection.system_id` (`ON DELETE SET NULL`). Optional umbrella tier; null for most franchises. Deleting a collection leaves members intact and uncollected. Column J in the Franchise sheet tab. |
| `type_slots`            | JSONB    | Yes      | —          | Dict mapping franchise type → slot (1–9) for 3x3 grids (e.g., `{"ACG": 3, "Movie": 5}`)                                                     |
| `cover_entry_id`        | UUID     | Yes      | —          | UUID of any entry (any type) to use as the main cover for the Franchise Library page; no FK constraint                                      |
| `type_covers`           | JSONB    | Yes      | —          | Dict mapping franchise type string → entry UUID; used for per-type covers in 3x3 grids (e.g. `{"ACG": "<uuid>", "TV or Movie": "<uuid>"}` ) |
| `watch_next_group`      | String   | Yes      | —          | `"12ep"`, `"24ep"`, `"30ep_plus"`, or null                                                                                                  |
| `to_rewatch`            | Boolean  | Yes      | `False`    |                                                                                                                                             |
| `created_at`            | DateTime | No       | Taipei now |                                                                                                                                             |
| `updated_at`            | DateTime | No       | Taipei now | Auto-updated on save                                                                                                                        |

`remark` is not a column on `franchise` either — it is the `column_property` described under the `note` table below.

**Column order matters:** `format_model_for_sheet` iterates `__table__.columns`, so the model's declaration order *is* the Google Sheets column order. `collection_id` is declared right after `franchise_expectation` so it lands in column J of the Franchise tab. Reordering model columns needs no migration — physical DB order is unaffected.

**Constraints:** At least one name field must be non-null.

**Relationships:** `series[]` (one-to-many), `collection` (many-to-one, optional)

---

### `series`

Optional intermediate grouping layer within a franchise.

| Column                 | Type     | Nullable | Default    | Notes                                                          |
| ---------------------- | -------- | -------- | ---------- | --------------------------------------------------------------- |
| `system_id`            | UUID     | No       | `uuid4()`  | Primary key                                                    |
| `franchise_id`         | UUID     | Yes      | —          | FK -> `franchise.system_id` SET NULL                           |
| `series_name_en`       | String   | Yes      | —          |                                                                 |
| `series_name_cn`       | String   | Yes      | —          |                                                                 |
| `series_name_roman`    | String   | Yes      | —          |                                                                 |
| `series_name_jp`       | String   | Yes      | —          |                                                                 |
| `series_name_alt`      | String   | Yes      | —          |                                                                 |
| `my_rating`            | String   | Yes      | —          | Personal rating (S/A+/A/B/C/D/E/F)                              |
| `series_expectation`   | String   | Yes      | `"Low"`    | `"Highest"`, `"High"`, `"Medium"`, `"Low"`                      |
| `cover_entry_id`       | UUID     | Yes      | —          | UUID of any entry (any type) to use as the main cover; no FK constraint |
| `to_rewatch`           | Boolean  | Yes      | `False`    |                                                                 |
| `created_at`           | DateTime | No       | Taipei now |                                                                 |
| `updated_at`           | DateTime | No       | Taipei now | Auto-updated on save                                           |

**Column order matters:** `format_model_for_sheet` iterates `__table__.columns`, so the model's declaration order *is* the Google Sheets column order for the Series tab. Reordering model columns needs no migration — physical DB order is unaffected.

**Constraints:** At least one name field must be non-null.

**Relationships:** `franchise` (many-to-one), `animes[]` (one-to-many)

**Note:** `display_name` fallback: CN → EN → Alt → roman → JP. `remark` is not a column here either — see the `note` table below.

---

## Media Entry Tables

### `anime`

The granular anime entry. Covers TV series, OVAs, ONAs, specials, etc.

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

**Constraints:** At least one name field must be non-null.

#### Classification & Status

| Column            | Type    | Nullable | Default         | Notes                                                                              |
| ----------------- | ------- | -------- | --------------- | ---------------------------------------------------------------------------------- |
| `season_part`     | String  | Yes      | —               | Which season and part the entry belongs to, e.g. `"Season 1"`, `"Season 2 Part 2"` |
| `airing_type`     | String  | Yes      | —               | `"TV"`, `"Movie"`, `"ONA"`, `"OVA"`, `"OAD"`, `"Special"`, `"Other"`, null         |
| `airing_status`   | String  | Yes      | —               | `"Not Yet Aired"`, `"Airing"`, `"Finished Airing"`, null                           |
| `watching_status` | String  | No       | `"Might Watch"` | See options.md for all valid values                                                |
| `is_main`         | String  | Yes      | —               | Whether the entry is main story or spinoff; see system_options                     |
| `is_main_entry`   | Boolean | Yes      | —               | Whether this is the main entry among entries linked by an `alternative` relation                       |

#### Episode Tracking

| Column        | Type    | Nullable | Default | Notes                                     |
| ------------- | ------- | -------- | ------- | ----------------------------------------- |
| `ep_previous` | Integer | Yes      | —       | Total episodes of previous seasons/parts  |
| `ep_total`    | Integer | Yes      | —       | Total episodes for this entry             |
| `ep_fin`      | Integer | Yes      | `0`     | Episodes finished; cannot exceed ep_total |
| `ep_special`  | Float   | Yes      | —       | Special episode number (e.g. `0`, `14.5`) |

**Computed fields** (returned in API responses, not stored in DB):

| Field          | Formula                  | Notes                        |
| -------------- | ------------------------ | ---------------------------- |
| `cum_ep_fin`   | `ep_previous + ep_fin`   | Cumulative finished episodes |
| `cum_ep_total` | `ep_previous + ep_total` | Null if `ep_total` is null   |

#### Ratings

| Column           | Type   | Nullable | Notes                                                  |
| ---------------- | ------ | -------- | ------------------------------------------------------ |
| `my_rating`      | String | Yes      | S / A+ / A / B / C / D / E / F                         |
| `mal_rating`     | Float  | Yes      | MAL score; `"N/A"` stored as null                      |
| `mal_rank`       | String | Yes      | MAL rank stored as string (e.g. `"53"`, `"N/A"`)       |
| `anilist_rating` | String | Yes      | AniList score stored as string (e.g. `"9.2"`, `"N/A"`) |

#### Release Info

| Column           | Type   | Nullable | Notes                                 |
| ---------------- | ------ | -------- | ------------------------------------- |
| `release_month`  | String | Yes      | `"JAN"` – `"DEC"`                     |
| `release_season` | String | Yes      | `"WIN"` / `"SPR"` / `"SUM"` / `"FAL"` |
| `release_year`   | String | Yes      | e.g. `"2024"`                         |

#### Broadcast Schedule

| Column           | Type   | Nullable | Notes                                                        |
| ---------------- | ------ | -------- | ------------------------------------------------------------ |
| `broadcast_day`  | String | Yes      | Weekday a new episode updates, e.g. `"Tuesday"`               |
| `broadcast_time` | Time   | Yes      | Time a new episode updates, e.g. `23:00`; no timezone stored |
| `my_watch_day`   | String | Yes      | Weekday I plan to watch the episode, e.g. `"Saturday"`        |

#### Production

| Column           | Type   | Nullable | Notes                             |
| ---------------- | ------ | -------- | --------------------------------- |
| `studio`         | String | Yes      | Multi-selectable, comma-separated |
| `director`       | String | Yes      | Multi-selectable, comma-separated |
| `producer`       | String | Yes      | Multi-selectable, comma-separated |
| `music`          | String | Yes      | Multi-selectable, comma-separated |
| `distributor_tw` | String | Yes      | Multi-selectable, comma-separated |
| `genre_main`     | String | Yes      | Multi-selectable, comma-separated |
| `genre_sub`      | String | Yes      | Multi-selectable, comma-separated |

#### Relational & Ordering

| Column           | Type    | Nullable | Notes                                                                       |
| ---------------- | ------- | -------- | --------------------------------------------------------------------------- |
| `watch_order`    | Float   | Yes      | Explicit chronological watch order within the franchise (e.g. `1.0`, `1.5`) |

#### External Links

| Column          | Type    | Nullable |
| --------------- | ------- | -------- |
| `mal_id`        | Integer | Yes      |
| `mal_link`      | String  | Yes      |
| `anilist_link`  | String  | Yes      |
| `official_link` | String  | Yes      |
| `twitter_link`  | String  | Yes      |

#### Music & Cast

| Column       | Type   | Nullable | Notes                                 |
| ------------ | ------ | -------- | ------------------------------------- |
| `op`         | String | Yes      | `"Need"`, `"Pending"`, `"Done"`, null |
| `ed`         | String | Yes      | `"Need"`, `"Pending"`, `"Done"`, null |
| `insert_ost` | String | Yes      | `"Need"`, `"Pending"`, `"Done"`, null |
| `seiyuu`     | String | Yes      | `"Need"`, `"Done"`, null              |

#### Sources & Streaming

| Column           | Type    | Nullable | Default | Notes                                                                      |
| ---------------- | ------- | -------- | ------- | -------------------------------------------------------------------------- |
| `source_baha`    | Boolean | Yes      | —       | Three-state: `true` = available, `false` = not available, `null` = unknown |
| `baha_link`      | String  | Yes      | —       |                                                                            |
| `source_netflix` | Boolean | Yes      | `False` | Three-state: `true` / `false` / `null`                                     |
| `source_other`   | JSONB   | Yes      | —       | Key-value pairs of source name → URL                                       |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

### `anime_movies`

Standalone anime movie entries (distinct from the `anime` table which covers series/OVA formats).

**Notes:** `release_date_jp` and `release_date_tw` are strings.

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |

#### Names

| Column                   | Type   | Nullable |
| ------------------------ | ------ | -------- |
| `anime_movie_name_en`    | String | Yes      |
| `anime_movie_name_cn`    | String | Yes      |
| `anime_movie_name_roman` | String | Yes      |
| `anime_movie_name_jp`    | String | Yes      |
| `anime_movie_name_alt`   | String | Yes      |

**Constraints:** At least one name field must be non-null.

#### Status

| Column            | Type   | Nullable | Default         | Notes                                                    |
| ----------------- | ------ | -------- | --------------- | -------------------------------------------------------- |
| `airing_status`   | String | Yes      | —               | `"Not Yet Aired"`, `"Airing"`, `"Finished Airing"`, null |
| `watching_status` | String | No       | `"Might Watch"` | See options.md for all valid values                      |
| `my_rating`       | String | Yes      | —               | S / A+ / A / B / C / D / E / F                           |

#### Ratings

| Column           | Type   | Nullable | Notes                                            |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `mal_rating`     | Float  | Yes      | MAL score                                        |
| `mal_rank`       | String | Yes      | MAL rank stored as string (e.g. `"53"`, `"N/A"`) |
| `anilist_rating` | String | Yes      | AniList score stored as string                   |

#### Release & Production

| Column            | Type    | Nullable | Notes                                            |
| ----------------- | ------- | -------- | ------------------------------------------------ |
| `length_min`      | Integer | Yes      | Length of the movie in minutes                   |
| `release_date_jp` | String  | Yes      | Japan release date, e.g. `"JUL 2001"`, `"2001"`  |
| `release_date_tw` | String  | Yes      | Taiwan release date, e.g. `"FEB 2023"`, `"2001"` |
| `studio`          | String  | Yes      | Multi-selectable, comma-separated                |
| `director`        | String  | Yes      | Multi-selectable, comma-separated                |

#### External Links

| Column          | Type    | Nullable |
| --------------- | ------- | -------- |
| `mal_id`        | Integer | Yes      |
| `mal_link`      | String  | Yes      |
| `anilist_link`  | String  | Yes      |
| `official_link` | String  | Yes      |
| `twitter_link`  | String  | Yes      |

#### Sources & Streaming

| Column           | Type    | Nullable | Notes                                                                      |
| ---------------- | ------- | -------- | -------------------------------------------------------------------------- |
| `source_baha`    | Boolean | Yes      | Three-state: `true` = available, `false` = not available, `null` = unknown |
| `baha_link`      | String  | Yes      |                                                                            |
| `source_netflix` | Boolean | Yes      | Three-state: `true` / `false` / `null`; default `False`                    |
| `source_other`   | JSONB   | Yes      | Key-value pairs of source name → URL                                       |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `watch_next`       | Boolean  | Yes      | —                                           |
| `to_rewatch`       | Boolean  | Yes      | `False`                                     |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

### `movies`

Live-action and animated movie entries.

**Notes:** `release_date_us` and `release_date_tw` are strings. `is_main` is a string.

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_id`    | UUID | Yes      | —         | FK -> `series.system_id` SET NULL    |

#### Names

| Column           | Type   | Nullable |
| ---------------- | ------ | -------- |
| `movie_name_en`  | String | Yes      |
| `movie_name_cn`  | String | Yes      |
| `movie_name_alt` | String | Yes      |

**Constraints:** At least one name field must be non-null.

#### Status & Classification

| Column            | Type   | Nullable | Default         | Notes                                                          |
| ----------------- | ------ | -------- | --------------- | -------------------------------------------------------------- |
| `airing_status`   | String | Yes      | —               | `"Not Yet Aired"`, `"Airing"`, `"Finished Airing"`, null       |
| `watching_status` | String | No       | `"Might Watch"` | See options.md for all valid values                            |
| `my_rating`       | String | Yes      | —               | S / A+ / A / B / C / D / E / F                                 |
| `imdb_rating`     | String | Yes      | —               | IMDB score stored as string (e.g. `"9.2"`, `"N/A"`)            |
| `movie_type`      | String | Yes      | —               | `"Reality"`, `"Animation"`, null                               |
| `is_main`         | String | Yes      | —               | Whether the entry is main story or spinoff; see system_options |

#### Release & Production

| Column             | Type    | Nullable | Notes                                            |
| ------------------ | ------- | -------- | ------------------------------------------------ |
| `length_min`       | Integer | Yes      | Length of the movie in minutes                   |
| `release_date_usa` | String  | Yes      | USA release date, e.g. `"JUL 2001"`, `"2001"`    |
| `release_date_tw`  | String  | Yes      | Taiwan release date, e.g. `"FEB 2023"`, `"2001"` |
| `director`         | String  | Yes      | Can be multiple directors                        |

#### Relational & Ordering

| Column           | Type    | Nullable | Notes                                                         |
| ---------------- | ------- | -------- | ------------------------------------------------------------- |
| `watch_order`    | Float   | Yes      | Explicit chronological watch order (e.g. `1.0`, `1.5`, `2.0`) |

#### External Links

| Column      | Type   | Nullable |
| ----------- | ------ | -------- |
| `imdb_id`   | String | Yes      |
| `imdb_link` | String | Yes      |

#### Sources

| Column         | Type  | Nullable | Notes                                |
| -------------- | ----- | -------- | ------------------------------------ |
| `source_other` | JSONB | Yes      | Key-value pairs of source name → URL |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `watch_next`       | Boolean  | Yes      | —                                           |
| `to_rewatch`       | Boolean  | Yes      | `False`                                     |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

### `tv_shows`

Live-action and scripted TV show entries.

**Notes:** `release_date` is a string. `is_main` is a string.

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_id`    | UUID | Yes      | —         | FK -> `series.system_id` SET NULL    |

#### Names

| Column        | Type   | Nullable |
| ------------- | ------ | -------- |
| `tv_name_en`  | String | Yes      |
| `tv_name_cn`  | String | Yes      |
| `tv_name_alt` | String | Yes      |

**Constraints:** At least one name field must be non-null.

#### Classification & Status

| Column            | Type   | Nullable | Default         | Notes                                                          |
| ----------------- | ------ | -------- | --------------- | -------------------------------------------------------------- |
| `region`          | String | Yes      | —               | `"歐美劇"`, `"韓劇"`, `"陸劇"`, `"台劇"`, null                 |
| `season_part`     | String | Yes      | —               | Which season and part, e.g. `"Season 1"`, `"Season 2 Part 2"`  |
| `source_official` | String | Yes      | —               | Name of official streaming source; see system_options          |
| `airing_status`   | String | Yes      | —               | `"Not Yet Aired"`, `"Airing"`, `"Finished Airing"`, null       |
| `watching_status` | String | No       | `"Might Watch"` | See options.md for all valid values                            |
| `is_main`         | String | Yes      | —               | Whether the entry is main story or spinoff; see system_options |

#### Episode Tracking

| Column     | Type    | Nullable | Default | Notes                                     |
| ---------- | ------- | -------- | ------- | ----------------------------------------- |
| `ep_total` | Integer | Yes      | —       | Total episodes for this entry             |
| `ep_fin`   | Integer | Yes      | `0`     | Episodes finished; cannot exceed ep_total |

#### Ratings & Release

| Column         | Type   | Nullable | Notes                                                                                           |
| -------------- | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `my_rating`    | String | Yes      | S / A+ / A / B / C / D / E / F                                                                  |
| `imdb_rating`  | String | Yes      | IMDB score stored as string (e.g. `"9.2"`, `"N/A"`); It is series rating not per-season rating. |
| `release_date` | String | Yes      | Release month + year or year, e.g. `"FEB 2026"`, `"2025"`                                       |

#### Relational & Ordering

| Column           | Type    | Nullable | Notes                                                         |
| ---------------- | ------- | -------- | ------------------------------------------------------------- |
| `watch_order`    | Float   | Yes      | Explicit chronological watch order (e.g. `1.0`, `1.5`, `2.0`) |

#### External Links

| Column      | Type   | Nullable |
| ----------- | ------ | -------- |
| `imdb_id`   | String | Yes      |
| `imdb_link` | String | Yes      |

#### Sources

| Column         | Type  | Nullable | Notes                                |
| -------------- | ----- | -------- | ------------------------------------ |
| `source_other` | JSONB | Yes      | Key-value pairs of source name → URL |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `watch_next`       | Boolean  | Yes      | —                                           |
| `to_rewatch`       | Boolean  | Yes      | `False`                                     |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

### `cartoons`

Western animated TV show entries.

**Notes:** `release_date` is a string. `is_main` is a string.

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_id`    | UUID | Yes      | —         | FK -> `series.system_id` SET NULL    |

#### Names

| Column             | Type   | Nullable |
| ------------------ | ------ | -------- |
| `cartoon_name_en`  | String | Yes      |
| `cartoon_name_cn`  | String | Yes      |
| `cartoon_name_alt` | String | Yes      |

**Constraints:** At least one name field must be non-null.

#### Classification & Status

| Column        | Type   | Nullable | Default | Notes                                                         |
| ------------- | ------ | -------- | ------- | ------------------------------------------------------------- |
| `season_part` | String | Yes      | —       | Which season and part, e.g. `"Season 1"`, `"Season 2 Part 2"` |
| `airing_type` | String | Yes      | —       | `"TV"`, `"Movie"`, `"Other"`, null                            |

| `source_official` | String | Yes | — | Name of official streaming source; see system_options |
| `airing_status` | String | Yes | — | `"Not Yet Aired"`, `"Airing"`, `"Finished Airing"`, null |
| `watching_status` | String | No | `"Might Watch"` | See options.md for all valid values |
| `is_main` | String | Yes | — | Whether the entry is main story or spinoff; see system_options |

#### Episode Tracking

| Column          | Type    | Nullable | Default | Notes                                     |
| --------------- | ------- | -------- | ------- | ----------------------------------------- |
| `ep_total`      | Integer | Yes      | —       | Total episodes for this entry             |
| `ep_fin`        | Integer | Yes      | `0`     | Episodes finished; cannot exceed ep_total |
| `length_ep_min` | Integer | Yes      | —       | Length per episode in minutes             |

#### Ratings & Release

| Column         | Type   | Nullable | Notes                                                     |
| -------------- | ------ | -------- | --------------------------------------------------------- |
| `my_rating`    | String | Yes      | S / A+ / A / B / C / D / E / F                            |
| `release_date` | String | Yes      | Release month + year or year, e.g. `"FEB 2026"`, `"2025"` |

#### Relational & Ordering

| Column           | Type    | Nullable | Notes                                                         |
| ---------------- | ------- | -------- | ------------------------------------------------------------- |
| `watch_order`    | Float   | Yes      | Explicit chronological watch order (e.g. `1.0`, `1.5`, `2.0`) |

#### External Links

| Column      | Type   | Nullable |
| ----------- | ------ | -------- |
| `imdb_id`   | String | Yes      |
| `imdb_link` | String | Yes      |

#### Sources

| Column         | Type  | Nullable | Notes                                |
| -------------- | ----- | -------- | ------------------------------------ |
| `source_other` | JSONB | Yes      | Key-value pairs of source name → URL |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `watch_next`       | Boolean  | Yes      | —                                           |
| `to_rewatch`       | Boolean  | Yes      | `False`                                     |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

### `manga`

Manga, manhwa, and manhua entries.

**Notes:** No `series_id` on this table. `release_year` and `end_year` are strings. `mal_rank` and `anilist_rating` are strings. `is_main` is a string.

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_id`    | UUID | Yes      | —         | FK -> `series.system_id` SET NULL    |

#### Names

| Column             | Type   | Nullable |
| ------------------ | ------ | -------- |
| `manga_name_en`    | String | Yes      |
| `manga_name_cn`    | String | Yes      |
| `manga_name_roman` | String | Yes      |
| `manga_name_jp`    | String | Yes      |
| `manga_name_alt`   | String | Yes      |

**Constraints:** At least one name field must be non-null.

#### Classification & Status

| Column                 | Type   | Nullable | Default        | Notes                                                          |
| ---------------------- | ------ | -------- | -------------- | -------------------------------------------------------------- |
| `region`               | String | Yes      | —              | `"日漫"`, `"韓漫"`, `"國漫"`, `"台漫"`, `"其他"`, null         |
| `is_main`              | String | Yes      | —              | Whether the entry is main story or spinoff; see system_options |
| `serialization_status` | String | Yes      | —              | `"連載中"`, `"停更"`, `"腰斬"`, `"完結"`, null                 |
| `reading_status`       | String | No       | `"Might Read"` | See options.md for all valid values                            |

#### Progress Tracking

| Column         | Type    | Nullable | Default | Notes                                          |
| -------------- | ------- | -------- | ------- | ---------------------------------------------- |
| `vol_total`    | Integer | Yes      | —       | Total volumes                                  |
| `vol_fin`      | Integer | No       | `0`     | Volumes finished                               |
| `vol_fin_page` | Integer | No       | `0`     | Pages finished in the currently reading volume |
| `ch_total`     | Integer | Yes      | —       | Total chapters                                 |
| `ch_fin`       | Integer | No       | `0`     | Chapters finished; cannot exceed ch_total      |

#### Ratings

| Column           | Type   | Nullable | Notes                                            |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `my_rating`      | String | Yes      | S / A+ / A / B / C / D / E / F                   |
| `mal_rating`     | Float  | Yes      | MAL score                                        |
| `mal_rank`       | String | Yes      | MAL rank stored as string (e.g. `"53"`, `"N/A"`) |
| `anilist_rating` | String | Yes      | AniList score stored as string                   |

#### Production & Release

| Column                   | Type   | Nullable | Notes                                                      |
| ------------------------ | ------ | -------- | ---------------------------------------------------------- |
| `author_plot`            | String | Yes      | 原作 — author responsible for plot; see system_options     |
| `author_draw`            | String | Yes      | 作畫 — author responsible for art; see system_options      |
| `release_year`           | String | Yes      | Release year; cannot exceed end_year                       |
| `end_year`               | String | Yes      | Year serialization ended                                   |
| `anime_studio`           | String | Yes      | Anime adaptation studio; multi-selectable, comma-separated |
| `serialization_platform` | String | Yes      | Where the entry is serialized                              |
| `distributor_tw`         | String | Yes      | Taiwan distributor; multi-selectable, comma-separated      |

#### Relational & Ordering

| Column           | Type    | Nullable | Notes                                                        |
| ---------------- | ------- | -------- | ------------------------------------------------------------ |
| `watch_order`    | Float   | Yes      | Explicit chronological read order (e.g. `1.0`, `1.5`, `2.0`) |

#### External Links

| Column         | Type    | Nullable |
| -------------- | ------- | -------- |
| `mal_id`       | Integer | Yes      |
| `mal_link`     | String  | Yes      |
| `anilist_link` | String  | Yes      |

#### Sources

| Column         | Type  | Nullable | Notes                                |
| -------------- | ----- | -------- | ------------------------------------ |
| `source_other` | JSONB | Yes      | Key-value pairs of source name → URL |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `read_next`        | Boolean  | Yes      | —                                           |
| `to_reread`        | Boolean  | Yes      | `False`                                     |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

### `novel`

Light novel and book entries.

**Notes:** `mal_rank` and `anilist_rating` are strings. `is_main` is a string.

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_id`    | UUID | Yes      | —         | FK -> `series.system_id` SET NULL    |

#### Names

| Column               | Type   | Nullable | Notes                                                                                                                                                                                                                                 |
| -------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `novel_name_en`      | String | Yes      |                                                                                                                                                                                                                                       |
| `novel_name_cn`      | String | Yes      |                                                                                                                                                                                                                                       |
| `novel_name_roman`   | String | Yes      |                                                                                                                                                                                                                                       |
| `novel_name_jp`      | String | Yes      |                                                                                                                                                                                                                                       |
| `novel_name_alt`     | String | Yes      |                                                                                                                                                                                                                                       |
| `novel_name_each_cn` | JSONB  | Yes      | Ordered dict of individual CN book names belonging to this novel entry. Key = book number or identifier (string), value = book name. Example: `{"1": "最後帝國", "2": "昇華之井", "3": "永世英雄"}`. Keys may be non-numeric strings. |
| `novel_name_each_en` | JSONB  | Yes      | Same as `novel_name_each_cn` but for EN book names. Keys must match between CN and EN dicts for the same entry.                                                                                                                       |

**Constraints:** At least one name field must be non-null.

#### Classification & Status

| Column                 | Type   | Nullable | Default        | Notes                                                                                                    |
| ---------------------- | ------ | -------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `region`               | String | Yes      | —              | `"JP"`, `"CN"`, `"TW"`, `"KR"`, `"Western"`, null                                                        |
| `type`                 | String | Yes      | —              | `"Light Novel"`, `"Novel"`, `"Web"`, `"Other"`, null                                                     |
| `version`              | String | Yes      | —              | Version of the novel entry, e.g. `"陸版"`                                                                |
| `is_main`              | String | Yes      | —              | Whether the entry is main story or spinoff; see system_options                                           |
| `serialization_status` | String | Yes      | —              | `"完結"`, `"連載中"`, `"連載中 (不穩定)"`, `"連載中 (有生之年)"`, `"停更"`, `"可能更多"`, `"未出"`, null |
| `reading_status`       | String | No       | `"Might Read"` | See options.md for all valid values                                                                      |

#### Progress Tracking

| Column               | Type   | Nullable | Default | Notes                                                                                    |
| -------------------- | ------ | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `vol_total_original` | Float  | Yes      | —       | Total volumes of the entry (original)                                                    |
| `vol_total_tw`       | Float  | Yes      | —       | Total volumes of the entry (Taiwan)                                                      |
| `vol_fin`            | Float  | No       | `0`     | Volumes finished; cannot exceed max(vol_total_original, vol_total_tw)                    |
| `arc_total`          | Float  | Yes      | —       | Total arcs of the entry                                                                  |
| `arc_fin`            | Float  | No       | `0`     | Arcs finished; cannot exceed arc_total                                                   |
| `ch_total`           | Float  | Yes      | —       | Total chapters of the entry                                                              |
| `ch_fin`             | Float  | No       | `0`     | Chapters finished; cannot exceed ch_total                                                |
| `progress_display`   | String | Yes      | —       | `"vol_tw"`, `"vol_original"`, `"arc_ch"`, `"ch"`, null; determines which tracker to show |

#### Ratings

| Column           | Type   | Nullable | Notes                                            |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `my_rating`      | String | Yes      | S / A+ / A / B / C / D / E / F                   |
| `mal_rating`     | Float  | Yes      | MAL score; `"N/A"` stored as null                |
| `mal_rank`       | String | Yes      | MAL rank stored as string (e.g. `"53"`, `"N/A"`) |
| `anilist_rating` | String | Yes      | AniList score stored as string                   |

#### Production & Release

| Column         | Type    | Nullable | Notes                                                            |
| -------------- | ------- | -------- | ---------------------------------------------------------------- |
| `author`       | String  | Yes      | Authors; category in system_options: Novel Author                |
| `illustrator`  | String  | Yes      | Illustrators; category in system_options: Novel Illustrator      |
| `release_year` | Integer | Yes      | Release year of the first book; cannot exceed end_year           |
| `end_year`     | Integer | Yes      | Release year of the last book                                    |
| `publisher_tw` | String  | Yes      | Taiwan publisher; category in system_options: Novel Publisher TW |

#### Relational & Ordering

| Column        | Type   | Nullable | Notes                                                                    |
| ------------- | ------ | -------- | ------------------------------------------------------------------------ |

| `is_main_entry` | Boolean | Yes | Whether this is the main entry among entries linked by an `alternative` relation |
| `read_order` | Float | Yes | Explicit chronological read order (e.g. `1.0`, `1.5`, `2.0`) |

#### External Links

| Column         | Type    | Nullable |
| -------------- | ------- | -------- |
| `mal_id`       | Integer | Yes      |
| `mal_link`     | String  | Yes      |
| `anilist_link` | String  | Yes      |
| `source_other` | JSONB   | Yes      |

#### Misc

| Column             | Type     | Nullable | Notes                                       |
| ------------------ | -------- | -------- | ------------------------------------------- |
| `read_next`        | Boolean  | Yes      | —                                           |
| `to_reread`        | Boolean  | Yes      | —                                           |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

### `comic`

Western comic runs, Marvel-focused. One entry is one numbered run; Marvel
events, storylines and eras are labels carried by a run (`events` / `era`),
never entries of their own.

**Notes:** `display_name` falls back **EN -> CN -> Alt** — every other media
entry type in this project leads with CN, but Western comics are known by
their English titles. Comics are manual-entry: there is no `mal_id` /
`mal_link` / `anilist_*` column and no external metadata fetch (see
business-logic.md).

#### Identity & Hierarchy

| Column         | Type | Nullable | Default   | Notes                                |
| -------------- | ---- | -------- | --------- | ------------------------------------ |
| `system_id`    | UUID | No       | `uuid4()` | Primary key                          |
| `franchise_id` | UUID | Yes      | —         | FK -> `franchise.system_id` SET NULL |
| `series_id`    | UUID | Yes      | —         | FK -> `series.system_id` SET NULL    |

#### Names

| Column           | Type   | Nullable | Notes                                                                                                                                          |
| ---------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `comic_name_en`  | String | Yes      | Leads the `display_name` fallback (EN -> CN -> Alt)                                                                                              |
| `comic_name_cn`  | String | Yes      |                                                                                                                                                     |
| `comic_name_alt` | String | Yes      |                                                                                                                                                     |
| `volume_label`   | String | Yes      | Run designator, e.g. `"Vol. 5"`, `"(2018)"`, `"Legacy"`. Free text, not numeric — Marvel run labels are not consistently numbered.               |

#### Classification & Status

| Column                 | Type    | Nullable | Default        | Notes                                                                                          |
| ----------------------- | ------- | -------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `comic_type`            | String  | Yes      | —              | `Ongoing` / `Limited` / `One-Shot` / `Annual`, null; see options.md                              |
| `publisher`             | String  | Yes      | —              | category in system_options: Comic Publisher                                                      |
| `imprint`               | String  | Yes      | —              | category in system_options: Comic Imprint                                                        |
| `continuity`            | String  | Yes      | —              | category in system_options: Comic Continuity                                                     |
| `era`                   | String  | Yes      | —              | category in system_options: Comic Era                                                            |
| `events`                | String  | Yes      | —              | Comma-joined multi-select, same idiom as `franchise.franchise_type`; category in system_options: Comic Event |
| `serialization_status`  | String  | Yes      | —              | Reuses the existing Serialization Status list — see options.md                                   |
| `reading_status`        | String  | No       | `"Might Read"` | Reuses the existing Reading Status list — see options.md                                         |

#### Progress Tracking

Comic has exactly one progress mode — issues — so, unlike `manga` and
`novel`, there is no `progress_display` column selecting among trackers.

| Column        | Type    | Nullable | Default | Notes               |
| ------------- | ------- | -------- | ------- | -------------------- |
| `issue_total` | Integer | Yes      | —       | Total issues in the run |
| `issue_fin`   | Integer | No       | `0`     | Issues read          |

#### Ratings

| Column      | Type   | Nullable | Notes                           |
| ----------- | ------ | -------- | -------------------------------- |
| `my_rating` | String | Yes      | S / A+ / A / B / C / D / E / F   |

#### Production & Release

| Column         | Type    | Nullable | Notes                                                                                     |
| -------------- | ------- | -------- | --------------------------------------------------------------------------------------------- |
| `writer`       | String  | Yes      | category in system_options: Comic Writer                                                      |
| `artist`       | String  | Yes      | category in system_options: Comic Artist                                                      |
| `release_year` | Integer | Yes      | Release year of the run                                                                       |
| `end_year`     | Integer | Yes      | Release year the run ended                                                                    |
| `publisher_tw` | String  | Yes      | Taiwan publisher; reuses the existing system_options category: Distributor TW (not comic-specific) |

#### Relational & Ordering

| Column          | Type    | Nullable | Notes                                                                             |
| --------------- | ------- | -------- | ------------------------------------------------------------------------------------ |
| `is_main_entry` | Boolean | Yes      | Whether this is the main entry among entries linked by an `alternative` relation     |
| `read_order`    | Float   | Yes      | Explicit chronological read order (e.g. `1.0`, `1.5`, `2.0`)                         |

#### External Links

| Column         | Type  | Nullable | Notes |
| -------------- | ----- | -------- | ----- |
| `source_other` | JSONB | Yes      |       |

#### Misc

| Column             | Type     | Nullable | Default | Notes                                                                                         |
| ------------------ | -------- | -------- | ------- | ------------------------------------------------------------------------------------------------- |
| `read_next`        | Boolean  | Yes      | —       | **No UI yet** — plan pages were out of scope for this backend plan. Created now so adding them later needs no migration. |
| `to_reread`        | Boolean  | Yes      | `false` | Same as `read_next` — **no UI yet**.                                                              |
| `cover_image_file` | String   | Yes      | —       | Filename in GCS bucket: `"<system_id>.jpg"`                                                       |
| `completed_at`     | DateTime | Yes      | —       | When entry was marked completed                                                                   |
| `created_at`       | DateTime | No       | —       | Auto-set on create                                                                                 |
| `updated_at`       | DateTime | No       | —       | Auto-updated on save                                                                               |

`remark` is not a column on this table — see the `note` table further below for how it is exposed as a read-only `column_property`.

---

## Watch Order Tables

Named, ordered, cross-media-type viewing guides. Distinct from the per-entry
`watch_order` Float column on `anime` / `tv_shows` / `cartoons` / `movies` /
`manga`, which numbers entries inside a single table and still drives
prequel/sequel derivation and the sort dropdowns. These tables exist because
that column cannot span media types, cannot hold more than one order per
franchise, and cannot express a guide that splits an entry.

### `watch_order_list`

One named order, owned by exactly one franchise or one collection.

| Column          | Type     | Nullable | Notes                                                                    |
| --------------- | -------- | -------- | ------------------------------------------------------------------------ |
| `system_id`     | UUID     | No       | PK, indexed                                                              |
| `franchise_id`  | UUID     | Yes      | FK → `franchise.system_id`, `ON DELETE CASCADE`, indexed                 |
| `collection_id` | UUID     | Yes      | FK → `collection.system_id`, `ON DELETE CASCADE`, indexed                |
| `series_id`     | UUID     | Yes      | FK → `series.system_id`, `ON DELETE CASCADE`, indexed                    |
| `list_name`     | String   | Yes      | e.g. "Chronological", "Release Order"                                    |
| `list_type`     | String   | Yes      | Custom / Chronological / Release / Recommended; defaults to `"Custom"`   |
| `is_default`    | Boolean  | Yes      | The order shown first; the API clears the flag on the owner's other rows |
| `is_most_recommended` | Boolean | Yes | The single order to follow. Independent of `is_default` and also cleared on the owner's other rows |
| `auto_source`   | String   | Yes      | `NULL` for a hand-built list. `"release"` (cross-type) and `"release-anime"` (anime only) are the **built-in** kinds: steps generated from release dates on every read, no `watch_order_item` rows |
| `sort_index`    | Float    | Yes      | Ordering of several orders within one owner                             |
| `remark`        | Text     | Yes      | The note describing how to read this order                              |
| `created_at`    | DateTime | Yes      | Auto-set on create                                                      |
| `updated_at`    | DateTime | Yes      | Auto-updated on save                                                    |

`is_default` and `is_most_recommended` are separate on purpose: `list_type` may
mark several orders as "Recommended", so a further flag is needed to name the
one to actually follow — and it need not be the one that opens first (Release
order can open first while Chronological is the endorsed one). Both are
one-per-owner, enforced in the router rather than by a constraint, since
"at most one true per owner" is not expressible as a plain `CHECK`.

A list with `auto_source` set stores no items at all: its steps are computed
from the owner's entries each time it is read, so an entry added later appears
without anyone regenerating anything. The item endpoints refuse to write to
such a list; its name, type, note and flags remain ordinary editable columns.

**Check constraint `ck_watch_order_list_single_owner`:** exactly one of
`franchise_id`, `collection_id`, `series_id` is set (a CASE-sum, since a plain
`<>` only expresses two columns). CASCADE rather than SET NULL, because a
nulled owner would leave a row the constraint forbids.

A series-owned order cannot contain anime movies: `anime_movies` is the one
media table without a `series_id` column, so those entries cannot be attributed
to a series at all.

### `watch_order_item`

One step of a guide.

| Column        | Type     | Nullable | Notes                                                                     |
| ------------- | -------- | -------- | ------------------------------------------------------------------------- |
| `system_id`   | UUID     | No       | PK, indexed                                                               |
| `list_id`     | UUID     | No       | FK → `watch_order_list.system_id`, `ON DELETE CASCADE`, indexed           |
| `position`    | Float    | Yes      | `1.0`, `1.5`, `2.0` — a float, so an item slots in without renumbering    |
| `media_type`  | String   | Yes      | `anime` / `anime-movie` / `movie` / `tv-show` / `cartoon` / `manga` / `novel` |
| `entry_id`    | UUID     | Yes      | **No FK** — points at whichever media table `media_type` names, indexed   |
| `ep_start`    | Integer  | Yes      | Both null = the whole entry                                              |
| `ep_end`      | Integer  | Yes      | —                                                                         |
| `importance`  | String   | Yes      | `Essential` / `Recommended` / `Normal` / `Optional`, default `Normal` — one rung per step. `Optional` dims the row; the guide filters on both ends |
| `note`        | Text     | Yes      | Per-step note                                                             |
| `created_at`  | DateTime | Yes      | Auto-set on create                                                        |
| `updated_at`  | DateTime | Yes      | Auto-updated on save                                                      |

- The same `entry_id` may appear at several positions in one list. That is how a
  split run is written: *entry A ep 1–10 → entry B → entry A ep 11–12*.
- No foreign key can span eight tables, so deleting a media entry leaves a
  dangling item. Resolution flags it `missing: true` at read time instead of
  dropping it, so the admin can see and remove the broken step.

---

## Media Relation Table

### `media_relation`

Typed links between two media entries, replacing the old per-entry
`prequel_id` / `sequel_id` / `alternative` columns. Those could hold only one
link each, carried no type discriminator (so a link could never leave its own
table), and excluded `anime_movies` entirely.

| Column          | Type     | Nullable | Notes                                                        |
| --------------- | -------- | -------- | ------------------------------------------------------------ |
| `system_id`     | UUID     | No       | Primary key, indexed                                          |
| `from_type`     | String   | No       | Media type slug, e.g. `anime`, `anime-movie`                  |
| `from_id`       | UUID     | No       | Entry in the table `from_type` names; no FK constraint        |
| `relation_type` | String   | No       | One of the eight stored kinds below                           |
| `to_type`       | String   | No       | Media type slug                                               |
| `to_id`         | UUID     | No       | Entry in the table `to_type` names; no FK constraint          |
| `remark`        | Text     | Yes      | Free text scoping the link, e.g. "covers ep 1-12 only"        |
| `created_at`    | DateTime | Yes      | Defaults to Taipei now                                        |
| `updated_at`    | DateTime | Yes      | Defaults to Taipei now, updated on change                     |

**Constraints and indexes**

- `ck_media_relation_no_self` — an entry cannot relate to itself.
- `uq_media_relation_pair` — unique on
  (`from_type`, `from_id`, `relation_type`, `to_type`, `to_id`).
- `ix_media_relation_from` on (`from_type`, `from_id`) and
  `ix_media_relation_to` on (`to_type`, `to_id`) — both directions are queried
  on every entry read, so neither endpoint can rely on the other's index.
- No foreign keys, by necessity: no single FK spans the eight media tables.
  Both endpoints use the same FK-less `(media_type, entry_id)` contract as
  `watch_order_item`, and a deleted target resolves to `missing: true` rather
  than vanishing.

**Relation kinds**

A row reads `from` → `to`. Nine user-facing labels compress to eight stored
kinds, because Prequel is Sequel read backwards; the API accepts `prequel` and
stores it as a `sequel` row with the endpoints swapped, so one fact is always
one row.

| Stored `relation_type` | Reads as              | Inverse label | Family      |
| ---------------------- | --------------------- | ------------- | ----------- |
| `sequel`               | A is the sequel of B  | Prequel       | timeline    |
| `alternative`          | A is an alternative of B | Alternative (symmetric) | equivalence |
| `renew`                | A is the renew of B   | Original      | equivalence |
| `directors_cut`        | A is the Director's Cut of B | Original | equivalence |
| `extended`             | A is the Extended version of B | Original | equivalence |
| `side_story`           | A is a side story of B | Parent Story | branch      |
| `spin_off`             | A is a spin-off of B  | Main Story    | branch      |
| `adaptation`           | A is an adaptation of B | Source      | derivation  |

The vocabulary lives in `app/utils/relation_kinds.py` and is served over HTTP
at `GET /api/media-relation/kinds`, so the admin dropdown keeps no second copy.

Relations are **hand-curated** on the `/relations` admin page. Nothing derives
them: chaining a franchise by `watch_order` cannot tell a sequel from a side
story.

---

## Quote & Meme Tables

Two sibling tiers drawn from media entries. Together they replace the
`quotes_memes` list that used to live inside each entry's `notes` JSONB column: a JSONB list
could not be filtered, sorted, or searched across the library, which is exactly
what the Quote page needs.

### `quote`

| Column            | Type     | Nullable | Notes                                                                        |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------- |
| `system_id`       | UUID     | No       | PK, indexed                                                                  |
| `media_type`      | String   | Yes      | `anime` / `anime-movie` / `movie` / `tv-show` / `cartoon` / `manga` / `novel`, indexed |
| `entry_id`        | UUID     | Yes      | **No FK** — points at whichever media table `media_type` names, indexed      |
| `text`            | Text     | Yes      | The line, in its original language                                            |
| `translation`     | Text     | Yes      | Translated version                                                            |
| `language`        | String   | Yes      | Language of `text`                                                            |
| `speaker`         | String   | Yes      | Character or person who says it                                               |
| `original_source` | String   | Yes      | What the speaker is quoting *from*, when they are themselves quoting          |
| `episode`         | String   | Yes      | Free text, so `"S2E4"`, `"Ch. 12"` and `"Vol. 3"` all fit one column          |
| `link`            | String   | Yes      | Optional URL                                                                  |
| `image_file`      | String   | Yes      | Bare filename under `static/quotes/`. **Local only** — see below              |
| `tags`            | JSONB    | Yes      | List of strings, drives the Quote page tag filter                             |
| `is_general`      | Boolean  | Yes      | The line works in any conversation ("hi") rather than one scenario            |
| `is_favorite`     | Boolean  | Yes      | Star flag                                                                     |
| `needs_review`    | Boolean  | Yes      | Set on every row imported from the old `notes.quotes_memes` lists             |
| `sort_index`      | Float    | Yes      | Manual ordering within one entry                                              |
| `remark`          | Text     | Yes      | Free-form note                                                                |
| `created_at`      | DateTime | Yes      | Auto-set on create                                                            |
| `updated_at`      | DateTime | Yes      | Auto-updated on save                                                          |

- `entry_id` carries no foreign key for the same reason `watch_order_item` does
  not: no single FK spans eight tables. A deleted entry leaves a dangling quote,
  which read-time resolution flags `missing: true` rather than dropping.
- `media_type` uses the **hyphenated** spelling (`anime-movie`, `tv-show`),
  matching `watch_order_item`. Note this differs from `MEDIA_REGISTRY`'s
  underscore keys, which name router configs rather than column data.
- `image_file` is resolved to `/static/quotes/<file>` and only on localhost.
  Cloud Run's filesystem is ephemeral, so the frontend hides every image control
  in production (`getQuoteImageUrl` returns `null` off localhost).

**Migration `u4v5w6x7y8z9`** creates the table and moves the existing data in
the same revision: each `notes.quotes_memes` item becomes a row
(`description` → `text`, `needs_review = true`), then the key is stripped from
`notes`. The old second field was in practice used for the speaker far more
often than for a URL, so a non-URL value is imported as `speaker`, not `link`.
`downgrade()` folds the rows back into `notes` before dropping the table.

---

### `meme`

A sibling of `quote`, not a variant of it. A quote is one line carrying a
speaker, translation, language and original source; a meme is one text, one
image, or one of each, and carries none of that. A meme can be a single word.

**A meme's owner is wider than a quote's.** A quote is said in a specific work,
so it is always tied to one media entry. A running gag often spans a whole
franchise instead, so a meme's owner may be a media entry *or* a series,
franchise, or collection — eleven `owner_type` values against the quote's eight.
That is why the pair is named `owner_*` rather than `media_type`/`entry_id`.

| Column        | Type     | Nullable | Notes                                                                        |
| ------------- | -------- | -------- | ---------------------------------------------------------------------------- |
| `system_id`   | UUID     | No       | PK, indexed                                                                  |
| `owner_type`  | String   | Yes      | **Eleven** values: the eight media types plus `series` / `franchise` / `collection`, indexed |
| `owner_id`    | UUID     | Yes      | **No FK** — points at whichever of the eleven tables `owner_type` names, indexed |
| `text`        | Text     | Yes      | The meme itself — one text, never a list. Can be a single word               |
| `image_file`  | String   | Yes      | Bare filename under `static/quotes/`. **At most one**, local only            |
| `quote_id`    | UUID     | Yes      | FK → `quote.system_id`, `ON DELETE SET NULL`, **UNIQUE**, indexed            |
| `episode`     | String   | Yes      | Free text                                                                     |
| `link`        | String   | Yes      | Optional URL                                                                  |
| `is_favorite` | Boolean  | Yes      | Star flag                                                                     |
| `sort_index`  | Float    | Yes      | Manual ordering within one entry                                              |
| `remark`      | Text     | Yes      | Free-form note                                                                |
| `created_at`  | DateTime | Yes      | Auto-set on create                                                            |
| `updated_at`  | DateTime | Yes      | Auto-updated on save                                                          |

A meme is **one text and/or one image** — text-only, image-only, or both. Three
plain columns, no list:

- **`quote_id` marks the text as also being a Quote** — there is no separate
  flag. A meme need not link a quote at all.
- **Both meme/quote rules are database constraints**, because the link is a real
  column rather than a value inside JSONB:
  - `ON DELETE SET NULL` — deleting a quote nulls the link and leaves the meme's
    text intact, rather than leaving a dangling id the reader has to flag.
  - `UNIQUE` — a quote belongs to at most one meme. Postgres permits many NULLs,
    so any number of memes may link none.
  The router only pre-checks these to return a helpful 400 naming the meme that
  already owns the quote; the constraints are the actual guarantee.
- **At most one image**, guaranteed by there being a single column. Its position
  is not stored — it always renders above the text.
- Resolution goes through `OWNER_TABLES` in `app/utils/media_resolver.py`,
  which is `MEDIA_TABLES` plus the three tiers. Passing the map in is what
  keeps the wider set out of `quote` and `watch_order_item`, which must stay
  entry-only. Series has no page of its own, so a series-owned meme resolves
  to a name but no link; the tiers have no cover column either, so the UI
  badges them with an icon instead.
- Quote membership is exposed on the quote side as a derived `meme_id` on
  `QuoteResolved`, computed by reverse lookup — there is no column to keep in
  sync.

**Migration `w6x7y8z9a0b1`** creates this table and drops `quote.kind` plus its
`ck_quote_kind` constraint. No data moved: every existing row was `kind='quote'`.

**Migration `y8z9a0b1c2d3`** renames `media_type`/`entry_id` to
`owner_type`/`owner_id` (and their indexes) to widen the owner. Its downgrade
deletes tier-owned memes, which have no representation in the entry-only shape.

**Migration `z9a0b1c2d3e4`** collapses the `content` JSONB list into the plain
`text` and `quote_id` columns, then adds the FK and UNIQUE constraints the list
shape made impossible. Existing rows were single-line; the upgrade joins any
multi-line row with newlines rather than losing text, and the downgrade folds
the text back into a one-element list.

---

## Note Table

### `note`

One row is **one item** of structured commentary: one bullet, one linked
resource, one episode comment. Replaces the `notes` JSONB column that used to
sit on each of the seven media tables — a blob could not be validated, queried
across the library, or edited a bullet at a time, and its shape lived in seven
frontend config files rather than in the backend.

**Its owner is as wide as `meme`'s.** Notes were entry-only as JSONB; the table
extends them to the three grouping tiers, so an owner may be a media entry *or*
a series, franchise, or collection — the same eleven `owner_type` values.

| Column       | Type     | Nullable | Notes                                                                        |
| ------------ | -------- | -------- | ---------------------------------------------------------------------------- |
| `system_id`  | UUID     | No       | PK, indexed                                                                  |
| `owner_type` | String   | Yes      | **Eleven** values: the eight media types plus `series` / `franchise` / `collection`, indexed |
| `owner_id`   | UUID     | Yes      | **No FK** — points at whichever of the eleven tables `owner_type` names, indexed |
| `section`    | String   | Yes      | Names an entry in `NOTE_SECTIONS`; that entry declares the shape, indexed    |
| `locator`    | String   | Yes      | Where in the work the item points: an episode, chapter, scene, timestamp, or the source a question came from. Free text, so `"ep 3"`, `"ep 3-5"`, `"ch 12"` and `"1:14:20"` all fit one column. The section supplies the label (`locator_placeholder`) and whether it is required (`locator_required`) |
| `kind`       | String   | Yes      | Only populated where the section declares `kinds` for this owner type — `highlight_episodes` has them on tv-show/cartoon but not manga |
| `title`      | String   | Yes      | The name half of a `name_links` item, and the song name of an `episode_name_links` one |
| `content`    | Text     | Yes      | The body text                                                                 |
| `links`      | JSONB    | Yes      | List of URLs — a list even where the old shape held one                      |
| `sort_index` | Float    | Yes      | Manual ordering within one `(owner, section)`                                |
| `created_at` | DateTime | Yes      | Auto-set on create                                                            |
| `updated_at` | DateTime | Yes      | Auto-updated on save                                                          |

- **The section registry is the schema.** `app/utils/note_sections.py` declares
  each section's shape, label, applicable owners, dropdown values and ordering.
  The columns above are the union of every shape; columns a shape does not name
  stay null. This is one table on purpose: adding a section costs a registry
  entry and no migration, and adding a new *shape* costs one nullable column.
- **Six stored shapes**, plus one that is not stored: `text` (content),
  `text_links` (content, links, optional locator), `text_or_link` (content
  XOR one link), `episode_text` (locator, content, and kind where declared),
  `name_links` (title, links), and `episode_name_links` (locator, title,
  content, links). `text_or_link` — used only by
  `public_reviews` — reuses the same two columns as `text_links` but rejects a
  row holding both: a public review is either what someone said or a pointer to
  where they said it. `episode_name_links` — used only by `insert_songs` —
  is the one shape naming all four content columns, because an insert song is
  a named thing that plays at a place and can be linked to; no existing shape
  could say all four.
  `external` sections — `quotes` and `memes` — are backed by their own tables
  and never by a `note` row; the registry lists them so the page can render
  them in order alongside the rest.
- **One locator column, not one per medium.** `locator` was called `episode`
  until it had to hold scenes and timestamps too. A column per medium
  (`episode`, `chapter`, `scene`, `timestamp`) would be null in almost every
  row and would cost a migration each time a new medium arrives, so the value
  and its label are separated the way a citation separates a locator from the
  kind of locator: the string lives here, the label and requiredness live in
  the section registry. `parse_note_from_sheet` still accepts the old
  `episode` header so a spreadsheet backed up before the rename still Pulls.
- `owner_id` carries no foreign key for the same reason `meme.owner_id` does
  not: no single FK spans eleven tables. A deleted owner leaves rows that
  `app/utils/media_resolver.py` flags as missing rather than silently dropping.
- `owner_type` uses the **hyphenated** spelling (`anime-movie`, `tv-show`),
  matching `meme` and `watch_order_item`.
- Index `ix_note_owner_section` on `(owner_type, owner_id, section)` covers the
  only read path the notes page uses.
- **`remark` is a section, not a column, on the eleven owner tables.** Each of
  `collection`, `franchise`, `series`, `anime`, `anime_movies`, `movies`,
  `tv_shows`, `cartoons`, `manga`, `novel`, and `comic` exposes `remark` as a
  read-only SQLAlchemy `column_property` — a correlated subquery against this
  table for the row where `section = 'remark'` — declared at the bottom of
  `app/models/__init__.py`. It reads like a plain column everywhere a
  response schema or a template touches it, but there is nothing to migrate
  on the owner table when a remark is added, edited, or cleared. Writes still
  go through the owner's own endpoint (Add, Modify, and the hub's Remark
  Modal all send `remark` as a string there); the router pops it out of the
  payload and upserts or deletes the underlying note row, so an empty or
  whitespace-only remark deletes the row rather than storing a blank one.
  Because the form and the notes page both ultimately write the same row,
  last write wins between them.
- Partial unique index `ix_note_one_remark_per_owner` on
  `(owner_type, owner_id) WHERE section = 'remark'` enforces that a `remark`
  column_property has at most one row to resolve. Without it, a duplicate
  remark row would make the scalar subquery raise on every read of that
  owner rather than fail only the write that created the duplicate.
- Column declaration order is also the Google Sheets column order, because
  `format_model_for_sheet` walks `__table__.columns` in declaration order.
- Deleting a note is audited through `log_deleted_record(db, note, "Note")`,
  which stands a truncated `content` in for the name a note does not have.

**Migration `note_add_table`** creates the table and its index. No data moves.

**Migration `note_backfill_rows`** converts the existing JSONB blobs into rows,
leaving the `notes` columns in place so the change is reversible.

**Migration `note_drop_jsonb`** drops the seven `notes` columns once nothing
reads them. It is the point of no return, and is applied deliberately rather
than as part of a routine `upgrade head`.

---

## System & Configuration Tables

### `system_options`

Dynamic dropdown/choice list values used in frontend forms. Editable via the admin Options page. Uses `ON CONFLICT` to handle duplicate values on upsert.

| Column         | Type    | Nullable | Notes                                                                           |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `id`           | Integer | No       | Auto-increment PK                                                               |
| `category`     | String  | No       | Composite unique with `option_value`. Groups options by field.                  |
| `option_value` | String  | No       | Composite unique with `category`. One of the options for the specific category. |

**Known categories:**

| Category                    | Used by                                           |
| --------------------------- | ------------------------------------------------- |
| `Studio`                    | `anime.studio`, `anime_movies.studio`, `cartoons` |
| `台灣代理 (Anime)`          | `anime.distributor_tw`                            |
| `台灣代理 (Manga)`          | `manga.distributor_tw`                            |
| `Director`                  | `anime.director`, `anime_movies.director`         |
| `Producer`                  | `anime.producer`                                  |
| `Music / Composer`          | `anime.music`                                     |
| `Manga Author`              | `manga.author_plot`, `manga.author_draw`          |
| `Genre Main`                | `anime.genre_main`                                |
| `Genre Sub`                 | `anime.genre_sub`                                 |
| `Official Source (TV)`      | `tv_shows.source_official`                        |
| `Official Source (Cartoon)` | `cartoons.source_official`                        |
| `Movie Franchise (Filter)`  | Filter option for movies page                     |
| `Main / Spinoff`            | `anime.is_main`, `movies.is_main`, etc.           |
| `Dub Preference`            | Preference settings                               |
| `Novel Author`              | `novel.author`                                    |
| `Novel Illustrator`         | `novel.illustrator`                               |
| `Novel Publisher TW`        | `novel.publisher_tw`                              |
| `Comic Publisher`           | `comic.publisher`                                 |
| `Comic Imprint`             | `comic.imprint`                                   |
| `Comic Continuity`          | `comic.continuity`                                |
| `Comic Era`                 | `comic.era`                                       |
| `Comic Event`                | `comic.events`                                    |
| `Comic Writer`              | `comic.writer`                                    |
| `Comic Artist`              | `comic.artist`                                    |
| `Distributor TW`            | also reused by `comic.publisher_tw` (in addition to its existing use) |

---

### `system_configs`

Persistent global application settings stored as key-value pairs.

| Column         | Type    | Nullable | Notes             |
| -------------- | ------- | -------- | ----------------- |
| `id`           | Integer | No       | Auto-increment PK |
| `config_key`   | String  | No       | Unique, indexed   |
| `config_value` | String  | No       |                   |

**Known keys:**

| Key                          | Example Value                    | Purpose                                                          |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `current_season`             | `"2025 SPR"`                     | Drives current-season highlighting in the UI                     |
| `announcement:<title>`       | the note body                    | One dashboard announcement per row (`/api/announcements`)        |
| `form_defaults:<media_type>` | JSON `{version, defaults, autofill}` | Add-form defaults + auto-fill field set (`/api/form-defaults`) |

Two features namespace themselves with a key prefix rather than taking their own
table. Anything scanning this table with `LIKE` must use its own prefix — a bare
scan will pick up rows belonging to the other features.

`form_defaults:<media_type>` holds a **sparse** override map: only fields the admin
actually changed are present, so the frontend's built-in factory values remain the
baseline. See [api.md](api.md#form-defaults--apiform-defaults) for the payload shape.

---

### `seasonal`

Aggregated metrics per airing season. One row per season string. Only counts `anime` entries with `airing_type` of `"TV"`, `"ONA"`, `"Movie"`, or `"Special"`.

| Column          | Type    | Nullable | Default | Notes                                                             |
| --------------- | ------- | -------- | ------- | ----------------------------------------------------------------- |
| `seasonal`      | String  | No       | —       | Primary key. Format: `"SSS YYYY"` e.g. `"WIN 2025"`, `"FAL 2026"` |
| `my_rating`     | String  | Yes      | —       | Personal season-level rating                                      |
| `entry_planned` | Integer | No       | `0`     | Count of completed entries this season                            |

| `entry_completed` | Integer | No | `0` | Count of completed entries this season |
| `entry_watching` | Integer | No | `0` | Count of currently watching entries |
| `entry_dropped` | Integer | No | `0` | Count of dropped entries |

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

| Column            | Type     | Nullable | Notes                                                                                  |
| ----------------- | -------- | -------- | -------------------------------------------------------------------------------------- |
| `id`              | Integer  | No       | Auto-increment PK                                                                      |
| `action_main`     | String   | No       | `"Fill"`, `"Replace"`, `"Backup"`, `"Pull"`, `"Calculate"`                             |
| `action_specific` | String   | No       | e.g. `"Fill All"`, `"Fill Anime"`, `"Replace All"`, `"Pull Franchise"`, `"Pull Anime"` |
| `type`            | String   | No       | `"Manual"` or `"Auto"`                                                                 |
| `status`          | String   | No       | `"Success"`, `"Failed"`, `"Aborted"`                                                   |
| `rows_added`      | Integer  | No       | Default `0`                                                                            |
| `rows_updated`    | Integer  | No       | Default `0`                                                                            |
| `rows_deleted`    | Integer  | No       | Default `0`                                                                            |
| `error_message`   | Text     | Yes      | Populated on failure                                                                   |
| `details_json`    | Text     | Yes      | Optional JSON with run details                                                         |
| `timestamp`       | DateTime | No       | Taipei now                                                                             |

---

### `deleted_record`

Tombstone log. Captures key metadata at the moment of deletion for audit display.

| Column           | Type     | Nullable | Notes                                                                            |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `id`             | Integer  | No       | Auto-increment PK                                                                |
| `type`           | String   | No       | `"Franchise"`, `"Series"`, `"Anime"`, `"System Options"`, etc.                   |
| `franchise_type` | String   | Yes      | Franchise type value; populated for Franchise entries                            |
| `franchise_cn`   | String   | Yes      | Parent franchise CN name with fallback; populated for Series and media entries   |
| `series_cn`      | String   | Yes      | Parent series CN name with fallback; populated for media entries only            |
| `category`       | String   | Yes      | Option category; populated for System Options only                               |
| `name_cn`        | String   | Yes      | Entry CN name with fallback; `option_value` for System Options                   |
| `name_en`        | String   | Yes      | Entry EN name with fallback; null if CN was a fallback or type is System Options |
| `timestamp`      | DateTime | No       | Taipei now                                                                       |
