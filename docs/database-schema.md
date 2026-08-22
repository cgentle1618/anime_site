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
- [Watch Order Tables](#watch-order-tables)
  - [watch_order_list](#watch_order_list)
  - [watch_order_item](#watch_order_item)
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
              └── single media entry  (granular entry — anime, anime_movies, movies, tv_shows, cartoons, manga, novel)
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

`series`, `movies`, `tv_shows`, and `cartoons` only have CN / EN / Alt (no roman or JP fields).

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
| `remark`                 | Text     | Yes      | —          |                                                                                                |
| `created_at`             | DateTime | Yes      | Taipei now |                                                                                                |
| `updated_at`             | DateTime | Yes      | Taipei now | Auto-updated on save                                                                           |

**Note:** There is deliberately no `collection_type`, and no roll-up/computed statistics.

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
| `remark`                | Text     | Yes      | —          |                                                                                                                                             |
| `created_at`            | DateTime | No       | Taipei now |                                                                                                                                             |
| `updated_at`            | DateTime | No       | Taipei now | Auto-updated on save                                                                                                                        |

**Column order matters:** `format_model_for_sheet` iterates `__table__.columns`, so the model's declaration order *is* the Google Sheets column order. `collection_id` is declared right after `franchise_expectation` so it lands in column J of the Franchise tab. Reordering model columns needs no migration — physical DB order is unaffected.

**Constraints:** At least one name field must be non-null.

**Relationships:** `series[]` (one-to-many), `collection` (many-to-one, optional)

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

**Constraints:** At least one name field must be non-null. No `created_at` or `updated_at`.

**Relationships:** `franchise` (many-to-one), `animes[]` (one-to-many)

**Note:** Series has no `roman` or `jp` name fields. `display_name` fallback: CN → EN → Alt.

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
| `is_main_entry`   | Boolean | Yes      | —               | Whether this is the main entry among its alternative entries                       |

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
| `derive_related` | Boolean | Yes      | Three-state: `true` = force-derive, `false` = skip derive, `null` = auto    |
| `prequel_id`     | UUID    | Yes      | `system_id` of the prequel entry; no FK constraint                          |
| `sequel_id`      | UUID    | Yes      | `system_id` of the sequel entry; no FK constraint                           |
| `alternative`    | String  | Yes      | Comma-separated `system_id`s of alternative entries, e.g. `[id1], [id2]`    |
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
| `remark`           | Text     | Yes      | Temporary free-form notes                   |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

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
| `remark`           | Text     | Yes      | Temporary free-form notes                   |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

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
| `derive_related` | Boolean | Yes      | Three-state: `true` = force, `false` = skip, `null` = auto    |
| `prequel_id`     | UUID    | Yes      | `system_id` of the prequel entry; no FK constraint            |
| `sequel_id`      | UUID    | Yes      | `system_id` of the sequel entry; no FK constraint             |
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
| `remark`           | Text     | Yes      | Temporary free-form notes                   |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

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
| `derive_related` | Boolean | Yes      | Three-state: `true` = force, `false` = skip, `null` = auto    |
| `prequel_id`     | UUID    | Yes      | `system_id` of the prequel entry; no FK constraint            |
| `sequel_id`      | UUID    | Yes      | `system_id` of the sequel entry; no FK constraint             |
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
| `remark`           | Text     | Yes      | Temporary free-form notes                   |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

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
| `derive_related` | Boolean | Yes      | Three-state: `true` = force, `false` = skip, `null` = auto    |
| `prequel_id`     | UUID    | Yes      | `system_id` of the prequel entry; no FK constraint            |
| `sequel_id`      | UUID    | Yes      | `system_id` of the sequel entry; no FK constraint             |
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
| `remark`           | Text     | Yes      | Temporary free-form notes                   |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

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
| `derive_related` | Boolean | Yes      | Three-state: `true` = force, `false` = skip, `null` = auto   |
| `prequel_id`     | UUID    | Yes      | `system_id` of the prequel entry; no FK constraint           |
| `sequel_id`      | UUID    | Yes      | `system_id` of the sequel entry; no FK constraint            |
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
| `remark`           | Text     | Yes      | Temporary free-form notes                   |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

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
| `prequel_id`  | UUID   | Yes      | `system_id` of the prequel entry; no FK constraint                       |
| `sequel_id`   | UUID   | Yes      | `system_id` of the sequel entry; no FK constraint                        |
| `alternative` | String | Yes      | Comma-separated `system_id`s of alternative entries, e.g. `[id1], [id2]` |

| `is_main_entry` | Boolean | Yes | Whether this is the main entry among its alternative entries |
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
| `remark`           | Text     | Yes      | Temporary free-form notes                   |
| `notes`            | JSONB    | Yes      | Structured notes (key-value)                |
| `cover_image_file` | String   | Yes      | Filename in GCS bucket: `"<system_id>.jpg"` |
| `completed_at`     | DateTime | Yes      | When entry was marked completed             |
| `created_at`       | DateTime | No       | Auto-set on create                          |
| `updated_at`       | DateTime | No       | Auto-updated on save                        |

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
| `list_name`     | String   | Yes      | e.g. "Chronological", "Release Order"                                    |
| `list_type`     | String   | Yes      | Custom / Chronological / Release / Recommended; defaults to `"Custom"`   |
| `is_default`    | Boolean  | Yes      | The order shown first; the API clears the flag on the owner's other rows |
| `sort_index`    | Float    | Yes      | Ordering of several orders within one owner                             |
| `remark`        | Text     | Yes      | The note describing how to read this order                              |
| `created_at`    | DateTime | Yes      | Auto-set on create                                                      |
| `updated_at`    | DateTime | Yes      | Auto-updated on save                                                    |

**Check constraint `ck_watch_order_list_single_owner`:**
`(franchise_id IS NULL) <> (collection_id IS NULL)` — exactly one owner. CASCADE
rather than SET NULL, because a nulled owner would leave a row the constraint
forbids.

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
| `is_optional` | Boolean  | Yes      | Skippable/filler; the guide dims it and offers a "hide optional" toggle   |
| `note`        | Text     | Yes      | Per-step note                                                             |
| `created_at`  | DateTime | Yes      | Auto-set on create                                                        |
| `updated_at`  | DateTime | Yes      | Auto-updated on save                                                      |

- The same `entry_id` may appear at several positions in one list. That is how a
  split run is written: *entry A ep 1–10 → entry B → entry A ep 11–12*.
- No foreign key can span seven tables, so deleting a media entry leaves a
  dangling item. Resolution flags it `missing: true` at read time instead of
  dropping it, so the admin can see and remove the broken step.

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
