# `autofill_tv_show_from_imdb` — Season 1 vs Season 2 Example

This document walks through the full autofill process for two separate TV show entries
that belong to the same show but represent different seasons.

---

## Setup: Two DB Entries, Same Show

The show **Succession** has two entries in `tv_shows`:

| Field              | Entry A        | Entry B        |
| ------------------ | -------------- | -------------- |
| `system_id`        | `uuid-A`       | `uuid-B`       |
| `tv_name_en`       | `"Succession"` | `"Succession"` |
| `season_part`      | `"Season 1"`   | `"Season 2"`   |
| `imdb_id`          | `"tt7660850"`  | `"tt7660850"`  |
| `release_date`     | `None`         | `None`         |
| `ep_total`         | `None`         | `None`         |
| `airing_status`    | `None`         | `None`         |
| `imdb_rating`      | `None`         | `None`         |
| `cover_image_file` | `None`         | `None`         |

Both entries share the same `imdb_id`. Each is autofilled independently.

---

## Entry A — Season 1

### Step 1: `fetch_imdb_data("tt7660850")`

Internally makes two calls:

1. `GET /3/find/tt7660850?external_source=imdb_id`
   - Returns `tmdb_id = 71446`, `media_type = "tv"`

2. `GET /3/tv/71446`
   - Returns show-level data:
     ```json
     {
       "id": 71446,
       "first_air_date": "2018-06-03",
       "poster_path": "/show-poster.jpg",
       "seasons": [
         { "season_number": 1, "episode_count": 10, "air_date": "2018-06-03" },
         { "season_number": 2, "episode_count": 10, "air_date": "2019-08-11" }
       ]
     }
     ```
   - Note: `seasons[]` has summaries only — no individual episode air dates.

`fetch_imdb_data` also calls OMDb in parallel:

- `GET http://www.omdbapi.com/?i=tt7660850`
  - Returns `{ "imdbRating": "8.8" }`

---

### Step 2: `_parse_season_number("Season 1")` → `1`

---

### Step 3: `fetch_tmdb_tv_season_data(71446, 1)`

`GET /3/tv/71446/season/1`

Returns season-level data:

```json
{
  "air_date": "2018-06-03",
  "poster_path": "/season1-poster.jpg",
  "episodes": [
    { "episode_number": 1, "air_date": "2018-06-03" },
    { "episode_number": 2, "air_date": "2018-06-10" },
    ...
    { "episode_number": 10, "air_date": "2018-08-05" }
  ]
}
```

This call is **not possible** using the show-level response from Step 1 — the `seasons[]`
array has `episode_count: 10` but no individual episode air dates.

---

### Step 4: `map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)`

1. Apply `map_tmdb_to_tv_show_data(tmdb_season_raw)`:
   - `release_date` = `"JUN 2018"` (from `air_date: "2018-06-03"`)
   - `ep_total` = `10` (from `len(episodes)`)
   - `cover_image_url` = `"https://image.tmdb.org/t/p/w500/season1-poster.jpg"`
   - `_season_air_date` = `"2018-06-03"` (private, for airing status)
   - `_episodes` = `[...]` (private, full episode list)

2. `cover_image_url` is already set — skip show-level poster fallback.

3. Apply `map_omdb_to_tv_data(omdb_raw)`:
   - `imdb_rating` = `"8.8"`

Final merged dict:

```python
{
    "release_date": "JUN 2018",
    "ep_total": 10,
    "cover_image_url": "https://image.tmdb.org/t/p/w500/season1-poster.jpg",
    "imdb_rating": "8.8",
    "_season_air_date": "2018-06-03",
    "_episodes": [...]
}
```

---

### Step 5: Apply fields to Entry A

**Fill-only** (only set if currently `None`):

- `release_date` `None` → `"JUN 2018"` ✓
- `ep_total` `None` → `10` ✓

**Always overwrite** if fetched value is not `None`:

- `imdb_rating` → `"8.8"` ✓

**Derive `airing_status`** via `_derive_tv_season_airing_status("2018-06-03", episodes)`:

- `"2018-06-03"` ≤ today → not "Not Yet Aired"
- All 10 episodes have `air_date` ≤ today → `"Finished Airing"` ✓

**Cover image**: `cover_image_file` is `None` → download and upload to GCS as `uuid-A.jpg` ✓

**Entry A after autofill:**

| Field              | Value               |
| ------------------ | ------------------- |
| `release_date`     | `"JUN 2018"`        |
| `ep_total`         | `10`                |
| `airing_status`    | `"Finished Airing"` |
| `imdb_rating`      | `"8.8"`             |
| `cover_image_file` | `"uuid-A.jpg"`      |

---

## Entry B — Season 2

### Step 1: `fetch_imdb_data("tt7660850")`

Same IMDb ID — identical show-level TMDB + OMDb responses as Entry A.

`tmdb_id = 71446`, `imdb_rating = "8.8"`

---

### Step 2: `_parse_season_number("Season 2")` → `2`

---

### Step 3: `fetch_tmdb_tv_season_data(71446, 2)`

`GET /3/tv/71446/season/2` — **different endpoint from Entry A**

Returns season-level data:

```json
{
  "air_date": "2019-08-11",
  "poster_path": "/season2-poster.jpg",
  "episodes": [
    { "episode_number": 1, "air_date": "2019-08-11" },
    { "episode_number": 2, "air_date": "2019-08-18" },
    ...
    { "episode_number": 10, "air_date": "2019-10-13" }
  ]
}
```

---

### Step 4: `map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)`

1. Apply `map_tmdb_to_tv_show_data(tmdb_season_raw)`:
   - `release_date` = `"AUG 2019"`
   - `ep_total` = `10`
   - `cover_image_url` = `"https://image.tmdb.org/t/p/w500/season2-poster.jpg"` ← different poster
   - `_season_air_date` = `"2019-08-11"`
   - `_episodes` = `[...]`

2. `cover_image_url` already set — skip fallback.

3. Apply OMDb: `imdb_rating = "8.8"` (same show-level rating)

---

### Step 5: Apply fields to Entry B

- `release_date` `None` → `"AUG 2019"` ✓ (different from Season 1)
- `ep_total` `None` → `10` ✓
- `imdb_rating` → `"8.8"` ✓
- `airing_status`: all episodes ≤ today → `"Finished Airing"` ✓
- Cover image → download and upload as `uuid-B.jpg` ✓

**Entry B after autofill:**

| Field              | Value               |
| ------------------ | ------------------- |
| `release_date`     | `"AUG 2019"`        |
| `ep_total`         | `10`                |
| `airing_status`    | `"Finished Airing"` |
| `imdb_rating`      | `"8.8"`             |
| `cover_image_file` | `"uuid-B.jpg"`      |

---

## Why the Season Fetch Cannot Be Skipped

The show-level `tmdb_raw` contains a `seasons[]` array, but each item is a summary:

```json
{
  "season_number": 1,
  "episode_count": 10,
  "air_date": "2018-06-03",
  "poster_path": "/..."
}
```

`_derive_tv_season_airing_status` needs **individual episode air dates** to distinguish
"Airing" from "Finished Airing". A show can have a past `air_date` but still be mid-season
if some episodes haven't aired yet. That per-episode data only exists in the season endpoint.

| What we need           | Available in `tmdb_raw.seasons[]`? | Available in season endpoint? |
| ---------------------- | ---------------------------------- | ----------------------------- |
| Season air date        | ✓ (`air_date`)                     | ✓ (`air_date`)                |
| Episode count          | ✓ (`episode_count`)                | ✓ (`len(episodes)`)           |
| Season-specific poster | ✓ (`poster_path`)                  | ✓ (`poster_path`)             |
| Per-episode air dates  | ✗                                  | ✓ (`episodes[].air_date`)     |

The season endpoint is required for accurate `airing_status` derivation.
