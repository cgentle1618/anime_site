# Worked example: autofilling two seasons of one TV show

Last verified: 2026-08-30 (commit 4339702)

## What this is for

This note walks `autofill_tv_show_from_imdb` (`app/services/domain/autofill.py`) through two `tv_shows` rows that share one IMDb ID but represent different seasons. It shows why the show-level TMDB response is not enough and why a third TMDB call — the season endpoint — is made for every TV entry. The service reference (endpoints, keys, limits, mappings) is in [../external-apis.md](../external-apis.md); the columns are in [../data-model.md](../data-model.md).

## Setup: two rows, same show

*Succession* has two rows in `tv_shows`. Values in this note that are not from the code (IDs, dates, ratings) are illustrative.

| Column | Entry A | Entry B |
|---|---|---|
| `system_id` | `uuid-A` | `uuid-B` |
| `tv_name_en` | `"Succession"` | `"Succession"` |
| `season_part` | `"Season 1"` | `"Season 2"` |
| `imdb_id` | `"tt7660850"` | `"tt7660850"` |
| `release_date` | `None` | `None` |
| `ep_total` | `None` | `None` |
| `airing_status` | `None` | `None` |
| `imdb_rating` | `None` | `None` |
| `cover_image_file` | `None` | `None` |

Both rows carry the same `imdb_id` (a `"tt…"` string, see `extract_imdb_id`). Each is autofilled independently.

## Entry A — Season 1

### Step 1 — `fetch_imdb_data("tt7660850")`

`app/services/integrations/imdb.py` runs two independent fetches (each in its own `try`, so one failing does not stop the other):

1. `fetch_tmdb_data` — two TMDB calls:
   - `GET /3/find/tt7660850?external_source=imdb_id` → `tmdb_id = 71446`, `media_type = "tv"`
   - `GET /3/tv/71446` → show-level data, roughly:
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
     `seasons[]` holds summaries only — no individual episode air dates.
2. `fetch_omdb_data` — `GET http://www.omdbapi.com/?i=tt7660850` → `{ "imdbRating": "8.8", … }`

Result: `{"tmdb_raw": <show>, "omdb_raw": <omdb>}`.

### Step 2 — `_parse_season_number("Season 1")` → `1`

Regex `Season\s+(\d+)` in `app/utils/imdb_utils.py`; anything that does not match defaults to `1`.

### Step 3 — `fetch_tmdb_tv_season_data(71446, 1)`

`GET /3/tv/71446/season/1` → season-level data:

```json
{
  "air_date": "2018-06-03",
  "poster_path": "/season1-poster.jpg",
  "episodes": [
    { "episode_number": 1, "air_date": "2018-06-03" },
    { "episode_number": 2, "air_date": "2018-06-10" },
    …
    { "episode_number": 10, "air_date": "2018-08-05" }
  ]
}
```

This is the call Step 1 cannot replace: the show-level `seasons[]` says `episode_count: 10` but not when each episode aired.

### Step 4 — `map_imdb_to_tv_show_data(tmdb_raw, tmdb_season_raw, omdb_raw)`

1. `map_tmdb_to_tv_show_data(tmdb_season_raw)`:
   - `release_date` = `"2018-06-03"` (`_convert_tmdb_date` keeps the full ISO date)
   - `ep_total` = `10` (`len(episodes)`)
   - `cover_image_url` = `"https://image.tmdb.org/t/p/w500/season1-poster.jpg"`
   - `_season_air_date` = `"2018-06-03"`, `_episodes` = the list above (private keys)
2. `cover_image_url` is set, so the show-level `poster_path` fallback is skipped.
3. `map_omdb_to_tv_data(omdb_raw)`: `imdb_rating` = `"8.8"`.

Merged dict:

```python
{
    "release_date": "2018-06-03",
    "ep_total": 10,
    "cover_image_url": "https://image.tmdb.org/t/p/w500/season1-poster.jpg",
    "imdb_rating": "8.8",
    "_season_air_date": "2018-06-03",
    "_episodes": [...],
}
```

### Step 5 — apply to Entry A

| Column | Rule | Result |
|---|---|---|
| `release_date` | fill-only | `None` → `"2018-06-03"` |
| `ep_total` | fill-only, and only when the fetched value is non-zero | `None` → `10` |
| `imdb_rating` | overwrite whenever fetched value is not `None` | `"8.8"` |
| `airing_status` | fill-only, derived by `_derive_tv_season_airing_status("2018-06-03", episodes)` | season air date ≤ today, every episode dated ≤ today → `"Finished Airing"` |
| `cover_image_file` | fill-only; `download_cover_image(url, "uuid-A")` | `"uuid-A.jpg"` |

## Entry B — Season 2

- **Step 1** is identical: same IMDb ID, so the same show-level TMDB response and the same OMDb rating (`"8.8"` is a show-level number).
- **Step 2**: `_parse_season_number("Season 2")` → `2`.
- **Step 3**: `GET /3/tv/71446/season/2` — a different endpoint from Entry A — returns `air_date: "2019-08-11"`, `/season2-poster.jpg`, and ten episodes dated `2019-08-11` … `2019-10-13`.
- **Step 4**: `release_date = "2019-08-11"`, `ep_total = 10`, a different poster URL, `imdb_rating = "8.8"`.
- **Step 5**:

| Column | Result |
|---|---|
| `release_date` | `"2019-08-11"` |
| `ep_total` | `10` |
| `airing_status` | `"Finished Airing"` |
| `imdb_rating` | `"8.8"` |
| `cover_image_file` | `"uuid-B.jpg"` |

## Why the season fetch cannot be skipped

`_derive_tv_season_airing_status` needs per-episode air dates to tell `"Airing"` from `"Finished Airing"`: a season whose air date is in the past can still be mid-run. Only the season endpoint carries that.

| Needed | In show-level `seasons[]`? | In `/season/{n}`? |
|---|---|---|
| Season air date | yes (`air_date`) | yes (`air_date`) |
| Episode count | yes (`episode_count`) | yes (`len(episodes)`) |
| Season-specific poster | yes (`poster_path`) | yes (`poster_path`) |
| Per-episode air dates | no | yes (`episodes[].air_date`) |

The derivation rules, for reference: season `air_date` in the future → `"Not Yet Aired"`; no episodes, an episode without a date, or an episode dated in the future → `"Airing"`; otherwise `"Finished Airing"`; an unparseable season date → `None` (column left untouched).

## Cost and failure notes

- A TV entry costs four external requests (Find, TV details, season, OMDb); a movie costs three.
- If `fetch_tmdb_data` returns `None` (not found, key missing, or five failed attempts), no season call is made and only `imdb_rating` can still be written from OMDb.
- Any exception inside the function — including tenacity's `RetryError` — is caught and logged; the row is left as it was.
