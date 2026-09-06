# External APIs

Last verified: 2026-09-06

## What this is for

The app never asks you to type metadata that a public database already knows. Eight outside services feed it: **Tenrai** (a mirror of MyAnimeList) fills anime, anime movies, manga, novels and studios; **TMDB** plus **OMDb** fill movies, TV shows and cartoons from an IMDb ID; **Comic Vine** fills comics; **Open Library** fills novels that have no MAL entry; **IGDB** fills games; **Google Sheets** is the human-readable backup and restore source; and **Google Cloud Storage** holds every cover image in production. This page says, for each service, where the code lives, what it sends, how it protects itself (throttle, retry, timeout), and exactly which database columns it writes. How those calls are strung into the Fill / Replace / Backup / Pull actions is in [data-actions.md](data-actions.md); the columns themselves are in [data-model.md](data-model.md); the "does this entry still need filling" tests and the ID-from-link rules are in [business-rules.md](business-rules.md) sections 2 and 5.

**In the app**: the same coverage — every field each service writes, and whether it fills or replaces it — is served to admins at `GET /api/constants/external-apis` and rendered on the read-only **External APIs** page (`/external-apis`). That catalog lives in `app/services/integrations/catalog.py`; it is hand-authored against this document and the autofill code, and `tests/api/test_external_api_catalog.py` guards it from drifting (media keys against `PIPELINES`, column names against the model). This page keeps the mapping rules — how MAL's `aired.string` becomes a date, how a placeholder cover is spotted — that the catalog does not carry.

A note on names: the MAL client used to be called "Jikan". Any `jikan` still lurking in code or tests is a leftover — the live client is Tenrai v1.

## Table of contents

- [At a glance](#at-a-glance)
- [Shared behaviour](#shared-behaviour)
- [Tenrai (MyAnimeList)](#tenrai-myanimelist)
- [TMDB](#tmdb)
- [OMDb](#omdb)
- [IMDb orchestration (TMDB + OMDb together)](#imdb-orchestration-tmdb--omdb-together)
- [Comic Vine](#comic-vine)
- [Open Library](#open-library)
- [IGDB](#igdb)
- [Google Sheets](#google-sheets)
- [Google Cloud Storage (cover images)](#google-cloud-storage-cover-images)
- [Which pipeline calls which service](#which-pipeline-calls-which-service)
- [Known rough edges](#known-rough-edges)

## At a glance

| Service | Base URL | Key / env var (`app/config.py`) | Client file | Mapper file | Feeds |
|---|---|---|---|---|---|
| Tenrai v1 | `https://api.tenrai.org/v1` | none | `app/services/integrations/tenrai.py` | `app/utils/tenrai_utils.py` | `anime`, `anime_movies`, `manga`, `novel`, `studio` |
| TMDB | `https://api.themoviedb.org/3` | `settings.tmdb_api_key` ← `TMDB_API_KEY` | `app/services/integrations/tmdb.py` | `app/utils/tmdb_utils.py` | `movies`, `tv_shows`, `cartoons` |
| OMDb | `http://www.omdbapi.com` | `settings.omdb_api_key` ← `OMDB_API_KEY` | `app/services/integrations/omdb.py` | `app/utils/omdb_utils.py` | `imdb_rating` on the three above |
| Comic Vine | `https://comicvine.gamespot.com/api` | `settings.comicvine_api_key` ← `COMICVINE_API_KEY` | `app/services/integrations/comicvine.py` | `app/utils/comicvine_utils.py` | `comic` |
| Open Library | `https://openlibrary.org` | none | `app/services/integrations/openlibrary.py` | `app/utils/openlibrary_utils.py` | `novel` (no MAL link) |
| IGDB | `https://api.igdb.com/v4` (token from `https://id.twitch.tv/oauth2/token`) | `settings.igdb_client_id` ← `IGDB_CLIENT_ID` **and** `settings.igdb_client_secret` ← `IGDB_CLIENT_SECRET` | `app/services/integrations/igdb.py` | `app/utils/igdb_utils.py` | `games` |
| Google Sheets | via `gspread` | `settings.google_sheet_id` ← `GOOGLE_SHEET_ID`; `settings.google_credentials_json` ← `GOOGLE_CREDENTIALS_JSON` (falls back to a local `credentials.json`) | `app/services/integrations/sheets.py` | `app/utils/formatter.py` | Backup / Pull |
| Google Cloud Storage | via `google-cloud-storage` | `settings.bucket_name` ← `GCP_BUCKET_NAME` (defaults to `cg1618-anime-covers` on Cloud Run only) | `app/services/integrations/image_manager.py`, `app/utils/gcp_utils.py` | — | cover images |

A missing key is never fatal: each client logs `"<NAME> environment variable is not set."` and returns `None` (or `[]`), so a Fill run simply fills nothing from that source. Open Library is the exception in a different direction: it has no key at all, so this failure mode does not apply to it — see [Open Library](#open-library).

## Shared behaviour

The metadata clients (Tenrai, TMDB, OMDb, Comic Vine, Open Library, IGDB) are built the same way. IGDB is the one that departs from the shape in two places, both called out in its own section: it POSTs an APIcalypse body instead of GETting query params, and it carries a refreshed OAuth bearer token instead of a static key.

| Concern | Behaviour |
|---|---|
| HTTP library | `requests`, synchronous, `timeout=15` seconds on every call (also on the cover-image download in `image_manager.py`). |
| Rate limiter | One module-level instance per service (`tenrai_rate_limiter`, `tmdb_rate_limiter`, `omdb_rate_limiter`, `comicvine_rate_limiter`, `openlibrary_rate_limiter`, `igdb_rate_limiter`). Each is a sliding window of request timestamps kept **in memory, per process** — it resets on restart, and two uvicorn workers or two Cloud Run instances do not share it. `wait_if_needed()` sleeps before a request when the window is full. |
| Retry | `tenacity` decorator: `stop_after_attempt(5)`, `wait_exponential(multiplier=1, min=2, max=10)`, retried only on `requests.exceptions.RequestException` (network / timeout) and the client's own `RateLimitExceeded` (raised on HTTP 429, plus 420 for Comic Vine). `reraise=False`. |
| Not retried | HTTP 404 → warning, returns `None`. HTTP 5xx → warning `"… skipping retries"`, returns `None`. OMDb and Comic Vine also return `None` on 401 (bad key); IGDB's 401 additionally **clears the cached token** so the next call refetches one. |
| When the 5 attempts run out | Because `reraise=False`, tenacity raises its own `tenacity.RetryError`. Every `autofill_*` function in `app/services/domain/autofill.py` wraps its whole body in `try: … except Exception as e: logger.error(...)`, so the `RetryError` is **swallowed**: the entry is left untouched, an error line is logged, and the pipeline moves on as if the entry had simply had nothing to fetch. Nothing in the UI distinguishes "no data" from "the network was down five times in a row". |

## Tenrai (MyAnimeList)

Tenrai v1 is a public read-only mirror of MyAnimeList. No key is needed.

| Item | Value |
|---|---|
| Endpoints | `GET /anime/{mal_id}/full` (`fetch_tenrai_anime_data`, used for anime **and** anime movies), `GET /manga/{mal_id}/full` (`fetch_tenrai_manga_novel_data`, used for manga **and** novels) and `GET /producers/{mal_id}/full` (`fetch_tenrai_producer_data`, used for studios). The response's `data` object is returned. All three share one `TenraiRateLimiter` budget. |
| User-Agent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0` — MAL's CDN rejects the default `python-requests` agent. |
| Rate limiter | `TenraiRateLimiter`, two windows checked together: `DEFAULT_LIMITS = ((4, 1), (120, 60))` — 4 requests per second **and** 120 per minute. It loops until every window has room. |
| Pipeline pacing | On top of the limiter, `specs.py` sleeps `MAL_PAUSE = 1` second between entries in Fill and Replace. |
| MAL ID source | `mal_id` on the row; `extract_mal_id` / `extract_mal_id_manga_novel` in `app/utils/utils.py` pull it out of `mal_link` with `myanimelist\.net/anime/(\d+)` and `myanimelist\.net/manga/(\d+)`. A studio's URL is `myanimelist.net/anime/producer/<id>/<slug>`, so it needs its own `MAL_PRODUCER_ID_PATTERN` = `myanimelist\.net/anime/producer/(\d+)`, read by `extract_mal_id_producer`. The two patterns cannot poach each other's links: the anime one needs digits straight after `/anime/` and finds the word `producer` instead, and the producer one needs the literal segment. |

### Mapping for `anime` — `map_tenrai_to_anime_data`

| Tenrai field | Column | Rule |
|---|---|---|
| `type` | `airing_type` | Kept if in `ALLOWED_AIRING_TYPES = {"TV", "Movie", "ONA", "OVA", "Special"}`, otherwise `"Other"` (so MAL's `OAD` becomes `"Other"`). |
| `status` | `airing_status` | contains "finished" → `"Finished Airing"`; "currently" → `"Airing"`; "not yet" → `"Not Yet Aired"`; else `None`. |
| `season` | `release_season` | `SEASON_MAP`: winter→`WIN`, spring→`SPR`, summer→`SUM`, fall→`FAL`. |
| `aired.prop.from` + `aired.string` | `release_date` | `_aired_release_date`: `aired.string` decides the precision (`"Jul 6, 2026 …"` → `2026-07-06`; `"Jul 2026 …"` → `2026-07`; `"2026 …"` → `2026`) and `prop.from` supplies the numbers. `aired.from` alone is padded to 1 January and is deliberately not trusted. |
| `score` | `mal_rating` | as-is (float). |
| `rank` | `mal_rank` | stringified. |
| `episodes` | `ep_total` | as-is. |
| `external[]` | `official_link`* | First link whose **`name` contains `"official"`** (case-insensitive). A non-Twitter URL without "official" in its name is ignored. |
| `external[]` | `twitter_link`* | First link whose `url` contains `twitter.com` or `x.com`. |
| `images` | `cover_image_url` | `webp.large_image_url`, else `jpg.large_image_url`, else `jpg.image_url`. |

\* `official_link`/`twitter_link` are keys in the mapper's returned dict, not
entry columns — those columns were dropped by migration `dc1o2l3s4d5`. See
"What autofill actually writes" below for where the values actually land.

### Mapping for `anime_movies` — `map_tenrai_to_anime_movie_data`

Same rules, except the date goes to `release_date_jp` and there is no `release_season`. The mapper also returns `ep_total`, but `autofill_anime_movie_from_mal` never writes it.

### Mapping for `manga` / `novel` — `map_tenrai_to_manga_data`, `map_tenrai_to_novel_data`

| Tenrai field | Column | Rule |
|---|---|---|
| `status` | `serialization_status` | `Finished`→`完結`, `Publishing`→`連載中`, `On Hiatus`→`停更`, `Discontinued`→`腰斬`. Novel additionally maps `Not yet published`→`未出`; for manga that status becomes `None`. |
| `published.prop.from` / `.to` | `release_date` / `end_date` | `_iso_from_prop`: year, year-month, or full date depending on what MAL knows. |
| `score`, `rank` | `mal_rating`, `mal_rank` | as above. |
| `volumes` | manga `vol_total`; novel `vol_total_original` (float) | as-is. |
| `chapters` | `ch_total` (float for novel) | as-is. |
| `images` | `cover_image_url` | same webp → jpg fallback. |

### What autofill actually writes (fill-only vs overwrite)

`autofill_anime_from_mal`, `autofill_anime_movie_from_mal`, `autofill_manga_from_mal`, `autofill_novel_from_mal`:

| Column(s) | Rule |
|---|---|
| `airing_type`, `airing_status`, `release_season`, `release_date` / `release_date_jp`, `ep_total` (anime only), `serialization_status`, `release_date`, `end_date` | **Fill-only** — written only when the column is `None`. |
| Official site / Twitter (anime, anime movie only) | Not columns any more. `_write_tenrai_reference_rows` calls `upsert_main_source(db, media_type, entry.system_id, "reference", value, url)` for each of the two, which is itself fill-only at the row level: it adds a `media_source` `kind='reference', bucket='main'` row only when no such row exists yet for that vocabulary value, and never overwrites or removes one that does (even one with no `url`). |
| `vol_total` / `vol_total_original`, `ch_total` | Fill-only, and **only when `serialization_status == "完結"`** — a running series' totals stay blank. |
| `mal_rating`, `mal_rank` | **Overwritten** when `force_replace_ratings=True` (the default, and what every pipeline passes) and the fetched value is truthy; otherwise fill-only. |
| `cover_image_file` | Downloaded only when the column is empty and the mapper found a URL; see [GCS](#google-cloud-storage-cover-images). |

### Mapping for `studio` — `map_tenrai_to_studio_data`

MAL calls a studio a "producer". The record is a different shape from a title's: a logo, a founding timestamp and a link list, and no score or rank.

| Tenrai field | Column | Rule |
|---|---|---|
| `images.jpg.image_url` | `logo_file` | Downloaded to GCS by `download_cover_image(url, str(system_id))`, same as a cover. Producers have no `webp` block, so there is no fallback chain. |
| `url` | `mal_link` | as-is. |
| `established` | `founded_date` | `_established_date` keeps the leading `YYYY-MM-DD` of the timestamp. Producers carry no `prop` block, so unlike an anime's `aired` there is no way to tell a real day from MAL's padding — a studio MAL knows only the year for is stored as that year's January 1st. |
| `titles[type="Japanese"]` | `name_jp` | `_producer_title`. The `Default` title is not written (it is what the studio is already named here) and the `Synonym` is dropped — it is usually the acronym expanded. |
| `external[]` | `website_url` | `_producer_website`: the first `http(s)` link whose host is not in `SOCIAL_HOSTS` (twitter/x, youtube, instagram, tiktok, facebook). Unlike an anime's `official_link` there is no "Official" name to match on — a studio's site is listed under its own domain. |

Deliberately dropped: `about` (`remark` is the admin's own note, not MAL's blurb), and `favorites` / `count` (no columns).

`autofill_studio_from_mal` is **fill-only for every column**, including `logo_file` — a producer carries nothing that drifts, so there is no force-replace variant and no Replace pipeline. It also swallows and logs every failure, because it runs inside the studio write request: a flaky Tenrai must never turn a save into a 500.

## TMDB

TMDB (The Movie Database) is reached through its **Find** endpoint, so the lookup key is the IMDb ID, not a TMDB ID.

| Item | Value |
|---|---|
| Auth | `api_key` query parameter. |
| Rate limiter | `TMDbRateLimiter`: 40 requests per 10-second window, checked before **every** individual call. |
| Calls per `fetch_tmdb_data(imdb_id)` | 1. `GET /find/{imdb_id}?external_source=imdb_id` → first of `movie_results` else `tv_results`, giving `(tmdb_id, "movie"|"tv")`. 2. `GET /movie/{id}?append_to_response=credits` or `GET /tv/{id}`. The returned dict gets an extra `"_media_type"` key. |
| Season call | `fetch_tmdb_tv_season_data(tmdb_id, season_number)` → `GET /tv/{id}/season/{n}`. Has its own `@retry`. Called by the TV-show and TV-cartoon autofills after `fetch_tmdb_data`, with `season_number` from `_parse_season_number(season_part)` (`Season\s+(\d+)`, default `1`). |
| Retry scope | `@retry` sits on `fetch_tmdb_data` as a whole, so a retry after a failed details call re-runs the Find call too. |
| IMDb ID format | `imdb_id` is stored as the **string** `"tt…"` — `extract_imdb_id` in `app/utils/utils.py` matches `imdb\.com/title/tt(\d+)` and returns `f"tt{digits}"`. There is no integer column and no zero-padding. |
| Dates | `_convert_tmdb_date` → `app.utils.release_date.normalize`, so `"2008-07-18"` is stored as canonical ISO `2008-07-18` (the old `"JUL 2008"` form is gone). |
| Poster | `TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"` + `poster_path`. |

### Mapping — `map_tmdb_to_movie_data` (movie response with credits)

| TMDB field | Mapped key | Written to |
|---|---|---|
| `runtime` | `length_min` | `movies.length_min` (fill-only) |
| `release_date` | `release_date_usa` | `movies.release_date_usa` (fill-only); cartoon-as-movie writes it to `cartoons.release_date` |
| `credits.crew[job == "Director"].name` (first) | `director` | a `media_credit` row with role `director`, via `replace_credits`, **only if the movie has no director credit yet** (`credit_names(...)` empty). `movies` has no `director` column. |
| `poster_path` | `cover_image_url` | cover download |

### Mapping — `map_tmdb_to_tv_show_data` / `map_tmdb_to_cartoon_data` (season response)

| TMDB field | Mapped key | Written to |
|---|---|---|
| `air_date` | `release_date` | `release_date` (fill-only) |
| `len(episodes)` | `ep_total` | `ep_total` (fill-only, and only when non-zero) |
| `poster_path` | `cover_image_url` | cover download; falls back to the **show-level** `poster_path` when the season has none |
| most common `episodes[].runtime` | `length_ep_min` | cartoon only, and **mapped but never written** — `autofill_cartoon_from_imdb` does not set the column, so it stays manual (falls back to show-level `episode_run_time[0]` inside the mapper). See [business-rules.md](business-rules.md) § known gaps. |
| `air_date`, `episodes` | `_season_air_date`, `_episodes` | private; used by `_derive_tv_season_airing_status` |

`airing_status` is **derived**, fill-only: movie / movie-cartoon compare TMDB's `release_date` with today (`<= today` → `"Finished Airing"`, else `"Not Yet Aired"`); TV / TV-cartoon use `_derive_tv_season_airing_status` — future season air date → `"Not Yet Aired"`, any episode missing a date or dated in the future → `"Airing"`, otherwise `"Finished Airing"`. Worked example: [notes/autofill-tv-show-example.md](notes/autofill-tv-show-example.md).

## OMDb

OMDb is called for one thing TMDB does not expose: the IMDb rating.

| Item | Value |
|---|---|
| Endpoint | `GET http://www.omdbapi.com/?i={imdb_id}&apikey={key}` |
| Rate limiter | `OMDbRateLimiter`: 1000 requests per 86400 s — a free-tier daily quota tracker. Because it is in-memory it only counts requests made by this process since it started. |
| Extra failure | A body with `"Response": "False"` (title not found) logs a warning and returns `None`. |
| Mapping | `map_omdb_to_movie_data` / `map_omdb_to_tv_data`: `imdbRating` → `imdb_rating`, stripped string; `"N/A"` → `None`. |
| Write rule | **Overwrite**: every IMDb autofill sets `imdb_rating` whenever the fetched value is not `None`, regardless of what was there. |

## IMDb orchestration (TMDB + OMDb together)

`app/services/integrations/imdb.py` — `fetch_imdb_data(imdb_id)` calls `fetch_tmdb_data` then `fetch_omdb_data`, each in its own `try/except`, so one source failing (including a `RetryError`) does not stop the other. It returns `{"tmdb_raw": …, "omdb_raw": …}` with `None` for whichever failed. `app/utils/imdb_utils.py` then merges: `map_imdb_to_movie_data`, `map_imdb_to_tv_show_data`, `map_imdb_to_cartoon_data` apply the TMDB mapper first and the OMDb mapper last (OMDb wins on the only overlapping key, `imdb_rating`).

Requests per entry: movies make 3 (Find, movie details, OMDb); TV shows and TV cartoons make 4 (plus the season call).

Cartoons route on `airing_type`: `"Movie"` takes the movie path, `"TV"` the season path, anything else is skipped entirely (`specs.py` also excludes them from Fill eligibility and from bulk Replace).

## Comic Vine

A Comic Vine **volume** is one numbered run, which is what one `comic` row is. Titles collide too often to search by name, so the row stores `comicvine_id` and the admin picks the run through a search UI.

| Item | Value |
|---|---|
| Endpoints | `GET /volume/4050-{volume_id}/` (`fetch_comicvine_volume`) and `GET /search/?resources=volume&query=…&limit=…` (`search_comicvine_volumes`, exposed to admins at `GET /api/comic/search-comicvine?q=&limit=`). Both send `format=json` and a `field_list` (`VOLUME_FIELD_LIST`, `SEARCH_FIELD_LIST`) to keep responses small. |
| User-Agent | `COMICVINE_USER_AGENT = "CG1618-Media-Tracker/1.0"` — mandatory; default agents are rejected. |
| ID from link | `extract_comicvine_id` matches `comicvine\.gamespot\.com/[^/]+/4050-(\d+)`. `4050` is the volume prefix; an issue URL (`4000-…`) is rejected rather than stored. |
| Rate limiter | `ComicVineRateLimiter`: 200 requests per 3600 s. It also exposes `has_capacity()`, which `specs.py` wires in as the pipeline `budget` — Fill Comic **stops** when the hour's budget is gone instead of sleeping the rest of the hour. `COMICVINE_PAUSE = 1` second between entries. |
| Extra failure codes | 420 (Comic Vine's own "rate limit exceeded") is treated like 429 and retried. A 200 whose body has `status_code != 1` is an application error: logged, returns `None`. |
| Placeholder covers | Comic Vine returns a stock image instead of omitting `image`. `_pick_cover_url` walks `COVER_URL_KEYS = ("original_url", "super_url", "medium_url")` and returns `None` if the first present URL contains `blank.png` or `image_not_available` (`PLACEHOLDER_IMAGE_MARKERS`). |

### Mapping — `map_comicvine_to_comic_data` and what `autofill_comic_from_comicvine` writes

| Comic Vine field | Mapped key | Written to | Rule |
|---|---|---|---|
| `name` | `comic_name_en` | nothing | Mapped but **never written** — the name is the entry's identity. |
| `start_year` | `volume_label` | `comic.volume_label` | `2018` → `"(2018)"`; fill-only |
| `start_year` | `release_date` | `comic.release_date` | year-precision canonical date, e.g. `1963`; fill-only |
| `count_of_issues` | `issue_total` | `comic.issue_total` | fill-only |
| `publisher.name` | `publisher` | `media_tag` field `comic_publisher` via `replace_tags` | only if the entry has no publisher tag yet |
| `person_credits` with role token `writer` | `writer` | `media_credit` role `author` via `replace_credits` | only if no author credit yet; names comma-joined, deduplicated, matched on whole tokens (`ARTIST_ROLES = ("penciler", "penciller", "artist")`, so `inker` never matches) |
| `person_credits` with penciler / penciller / artist | `artist` | `media_credit` role `illustrator` | same |
| `image` | `cover_image_url` | cover download | fill-only |

`end_date` is deliberately not mapped (it would cost a second request per entry). There is no bulk Replace for comics (`replace=None`, `in_replace_all=False`) and Fill Comic is excluded from Fill All (`in_fill_all=False`) to protect the hourly quota.

## Open Library

Open Library fills `novel` entries that MAL does not catalogue — mainly Western
published books, the `Novel` bucket of `novel.type`. It is the first client in
this app with **no API key at all**: no `_get_api_key`, no 401 branch, and none
of the "environment variable is not set" logging every other client has.
`OPENLIBRARY_USER_AGENT = "CG1618-Media-Tracker/1.0"` is still mandatory —
Open Library throttles generic client agents, the same reason Comic Vine and
Tenrai set one.

An Open Library **work** is one book. A work id (`OL…W`) is distinct from an
**edition** id (`OL…M`, one printing of a work) and an **author** id (`OL…A`).
`novel.openlibrary_id` is a `String`, unlike Comic Vine's `Integer`
`comicvine_id`, because the trailing letter is the only signal that the stored
id names a work and not an edition or an author — storing the bare number
would discard it.

Because one novel entry can span several books (`Mistborn` is one entry and
three novels), the stored work id names the entry's **anchor book** — book 1,
or the only book — not "the entry". This is why the mapping below is narrow:
see [Autofill](#autofill---appservicesdomainautofillpy) further down.

| Item | Value |
|---|---|
| Endpoints | `GET /works/{id}.json` (always), `GET /works/{id}/editions.json?limit=1000` (only when `want_editions`), `GET /authors/{OL…A}.json` (only when `want_authors`, at most 3 authors) — all in `fetch_openlibrary_work(work_id, *, want_editions, want_authors)`. |
| Why conditional | Unlike every other client here, which fetches unconditionally and lets the mapper discard what it does not need, this one takes two keyword-only flags. `editions.json?limit=1000` can return a thousand entries, and every write is fill-only, so an entry that already has a `release_date` can never use that response. The flags drop the steady-state cost to one call per entry. `autofill_novel_from_openlibrary` computes them: `want_editions = not novel.release_date`, `want_authors = not credit_names(db, "novel", ..., "author")`. |
| Rate limiter | `OpenLibraryRateLimiter`: 100 requests per 60 s, the same in-memory sliding-window shape as the others. Open Library publishes no hard quota; this is politeness, not a ceiling they enforce. |
| Pipeline pacing | `OPENLIBRARY_PAUSE` is not separate — novel's `fill_sleep` stays `MAL_PAUSE` (1 s) regardless of which branch ran. |
| Retry / failure | Same shape as every other client: `@retry`, `stop_after_attempt(5)`, `wait_exponential(multiplier=1, min=2, max=10)`, retried on `requests.exceptions.RequestException` and a local `RateLimitExceeded` (HTTP 429). 404 → warning, `None`. 5xx → warning, `None`. |
| Work id source | `openlibrary_id` on the row; `extract_openlibrary_id(url)` in `app/utils/openlibrary_utils.py` pulls it from `openlibrary_link` with `openlibrary\.org/works/(OL\d+W)`. An edition URL, an author URL, a bare id, `""` and `None` all return `None` — never a wrong id, mirroring `extract_comicvine_id`'s rejection of issue URLs. |

### Mapping — `map_openlibrary_to_novel_data`

| Source | Column | Rule |
|---|---|---|
| `editions[].publish_date` | `release_date` | `_earliest_edition_year`: regex `(1[4-9]\d\d\|20\d\d)` over each edition's `publish_date`, minimum year kept, anything after next year discarded, then `app.utils.release_date.normalize`. No editions → `None`. Deliberately **not** `work.first_publish_date` (unpopulated on every work checked) and **not** the search API's `first_publish_year` (wrong on 3 of the 4 entries probed) — the earliest edition year was right on both entries in scope. Written at **year precision**, exactly as Comic Vine's `start_year` already is written to `release_date`. |
| `authors[].name` | `author` credit | comma-joined by the mapper, then split again by `split_names` in the autofill before `replace_credits`. |
| `work.covers` | `cover_image_url` | first entry that is not `-1` → `https://covers.openlibrary.org/b/id/{id}-L.jpg`. Open Library uses `-1` as a "no cover here" sentinel inside the `covers` array rather than omitting the slot; an unfiltered `covers[0]` would eventually download a 404. All `-1` or an absent `covers` → `None`. |

### Autofill — `autofill_novel_from_openlibrary`

Fill-only, and deliberately narrow. It writes exactly three things:
`release_date`, `cover_image_file` (via `download_cover_image`, same as every
other client), and the `author` credit (`replace_credits`, only when the entry
has no `author` credit yet — the same rule TMDB uses for `director`).

It **never** writes `end_date`, `vol_total_original`, `ch_total`,
`serialization_status`, `mal_rating`, `mal_rank`, or any `novel_name_*` column
— all of those are true of the whole multi-book entry, not of the one anchor
book the stored id names, and Open Library has no way to supply them (or, for
the names, no business supplying them at all).

**Replace is deliberately not wired.** `replace_select` for `novel` still only
selects rows with `mal_id`/`mal_link` set, so an Open-Library-only novel is
never picked up by bulk Replace. Every Open Library write here is fill-only,
so there is nothing for Replace to re-fetch that Fill has not already done.

## IGDB

IGDB fills `games`. It is the only integration here whose credentials belong to
a **different company**: IGDB authenticates through Twitch, so the two secrets
come from a developer application registered at
[dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps), not from
igdb.com, and both must be set or the client fails closed to `None` without
calling out.

Three things make `igdb.py` a genuinely different client rather than a copy of
`comicvine.py`, and its module docstring says so:

1. **Queries are POSTs with an APIcalypse body**, not GETs with query params.
   The body is a small DSL — `fields a,b; where id = 5; limit 10;` — sent as
   the raw request body.
2. **Auth is a refreshed OAuth bearer token**, not a static key. `_get_token()`
   POSTs `client_id` / `client_secret` / `grant_type=client_credentials` to
   `https://id.twitch.tv/oauth2/token`, caches `{token, expires_at}` in a
   module-level dict, and refetches only once the token is within
   `TOKEN_EXPIRY_MARGIN` (60 s) of expiry — so a Fill run over 300 games costs
   one Twitch call, not 300. Every IGDB request then sends both
   `Client-ID: <client id>` and `Authorization: Bearer <token>`. No other
   client in this app refreshes anything.
3. **The rate limit is 4 requests/second** — Tenrai's shape, not Comic Vine's
   hourly quota — so `IGDBRateLimiter` is a sliding window and the pipeline
   spec gets **no `budget`**: there is no quota to exhaust part-way through a
   run.

| Item | Value |
|---|---|
| Endpoints | `POST /v4/games` twice over: `fields …; where id = {igdb_id}; limit 1;` (`fetch_igdb_game`) and `search "{term}"; fields …; limit {n};` (`search_igdb_games`, exposed to admins at `GET /api/game/search-igdb?q=&limit=`, `limit` 1–50). Plus `POST /v4/game_time_to_beats` (`fetch_igdb_time_to_beat`). |
| Field lists | `GAME_FIELDS` and `SEARCH_FIELDS` are the contract with `igdb_utils.py`: IGDB returns nothing you do not ask for, so a new mapped field means editing both. |
| ID from link | `extract_igdb_id` matches `api\.igdb\.com/v\d+/games/(\d+)`. A public `www.igdb.com` URL carries only a **slug**, no id, and deliberately yields `None` — a slug URL is a link, not an identifier. `apply_extract_igdb_id` runs it over `igdb_link` on every entry at the start of a Fill run. |
| Search-term safety | An APIcalypse `search` term is a quoted string, so `search_igdb_games` strips every `"` from the query before interpolating it; a stray quote would terminate the term. |
| Failure codes | 401 → clear the token cache, log, return `None`. 404 → warning, `None`. 429 → `RateLimitExceeded`, retried. 5xx → warning, `None`, no retries. Same `@retry(stop_after_attempt(5), wait_exponential(1, 2, 10), reraise=False)` as every other client. |

### Time to beat — verified against the live IGDB reference on 2026-09-06

This is the part that is easy to get wrong, and all three details were checked
against IGDB's published reference:

- The resource is **`game_time_to_beats`**, plural. The singular `time_to_beat`
  resource of earlier API versions **no longer exists**.
- It is filtered on **`game_id`**, not `id` — `id` is the time-to-beat
  record's own primary key, so `where id = <game id>` silently returns the
  wrong row or none.
- `hastily`, `normally` and `completely` are **integers in SECONDS**.
  `fetch_igdb_time_to_beat` divides each by `SECONDS_PER_HOUR = 3600.0` and
  rounds to one decimal before returning `hltb_main` / `hltb_main_extra` /
  `hltb_completionist`, because those columns are hours. Storing them raw
  would put `162000` in `hltb_main`.

Most games have no submissions at all, so `None` here is ordinary and not a
failure. **HowLongToBeat itself is never called**: it publishes no official
API, and these figures — despite the `hltb_*` column names, which predate the
integration — come from IGDB.

### Mapping — `map_igdb_to_game_data`

| IGDB field | Mapped key | Written to | Rule |
|---|---|---|---|
| `name` | `name` | nothing | Mapped but **never written**: `game_name_en` is the entry's identity and often a deliberate shorthand. |
| `summary` | `summary` | nothing | Mapped but **not stored** — `games` has no summary column by design; a synopsis belongs in the entry's notes, written by hand. |
| `first_release_date` | `release_date` | `games.release_date` | Unix seconds read as **UTC** (a local-time read would shift a midnight release by a day), then `app.utils.release_date.normalize`; fill-only |
| `url` | `igdb_link` | `games.igdb_link` | fill-only |
| `cover.url` | `cover_image_url` | cover download | `t_thumb` swapped for `t_cover_big_2x` in the path, protocol-relative `//` prefixed with `https:`; fill-only, and done **last** so a download failure cannot cost the cheap columns |
| `involved_companies` where `developer` | `developers` | `media_credit` role `studio` | only when the entry has no studio credit yet — a game's developer **is** its studio |
| `involved_companies` where `publisher` | `publishers` | `media_credit` role `publisher` | only when the entry has no publisher credit yet |
| `genres.name` / `themes.name` / `game_modes.name` | `genres` / `themes` / `game_modes` | `media_tag` fields `game_genre` / `game_theme` / `game_mode` | raw **English**, translated by the alias layer — see below |
| `platforms.name` | `platforms` | `media_tag` field `game_platform` | raw **English**; the alias rows fold a whole console generation into one family, so `PlayStation 4` and `PlayStation 5` both resolve to `PlayStation` and the duplicate is dropped |
| `parent_game` | `parent_igdb_id` | `games.base_game_id` | a bare IGDB id; resolved against the database by the autofill |

A company that is neither a developer nor a publisher (a porting or supporting
studio) is dropped: it is not a credit this project keeps, and crediting it as
a developer would be wrong.

### Autofill — `autofill_game_from_igdb`

**Fill-only throughout**, and the whole body sits in one
`try: … except Exception as e: logger.error(...)` — the same swallow-and-log
every other autofill does, with the same consequence noted under
[Shared behaviour](#shared-behaviour).

The one rule unique to games is the **alias translation**. IGDB speaks English;
the tag vocabulary is Chinese. Each genre/theme/mode/platform value goes through
`resolve_option_alias(db, category, "igdb", english)`, and a value with **no
`system_option_alias` row is logged and skipped** — never stored raw, never
invented, never dropped silently. A new IGDB genre is supposed to surface as a
gap to fill on the Options admin page.

That choice is why `has_missing_values_game` (`app/services/domain/checking.py`)
reads **columns only** — `GAME_FIELDS_TO_FILL` is `igdb_link`, `release_date`,
`cover_image_file` and the three `hltb_*` columns — and takes no `db` argument.
Including the genre/theme/mode tags would leave a game whose genre has no alias
yet permanently "needs filling", re-requested on every single run.

`parent_game` is why IGDB was chosen over RAWG: when the parent game is already
in the database (matched on `igdb_id`, excluding the row itself), Fill sets
`base_game_id` and the DLC links itself up. A parent not yet entered leaves the
column null, which is exactly why `base_game_id` is nullable even for a DLC.

**No bulk Replace.** `replace_select` and `replace` are `None` and
`in_replace_all=False`, on the same reasoning as Studio's `fill_only`: an IGDB
record carries no score or rank that drifts, so a re-fetch would only rewrite
what Fill already wrote. Games **are** in Fill All, unlike comics — there is no
hourly quota to protect.

## Google Sheets

Sheets is the backup target and restore source. `sheets.py` contains no database logic — it only moves matrices in and out of tabs.

| Item | Value |
|---|---|
| Library | `gspread` (pinned `6.2.1` in `requirements.txt`) with `google-auth`. Scopes: `spreadsheets` and `drive`. |
| Credentials | `settings.google_credentials_json` (a JSON string) → `Credentials.from_service_account_info`; if unset, `Credentials.from_service_account_file("credentials.json")`. |
| Spreadsheet | opened by key from `settings.google_sheet_id`; missing → `ValueError`. |
| Tabs | `get_google_sheet_tab(tab_name)` creates a missing tab with `rows=1000, cols=50`. |
| Read | `get_all_raw_rows(tab_name)` → `worksheet.get_all_values()`. `[]` means an empty tab; an unreadable tab raises `SheetsUnavailableError` so Pull cannot mistake an outage for "no data". |
| Write | `bulk_overwrite_sheet(tab_name, matrix)` refuses an empty matrix, writes the new data at `A1` **first**, then `batch_clear`s the leftover rows/columns beyond it — a failed write leaves the previous backup intact. |

### Error classification and retry (`_execute_with_retry`)

Every gspread call goes through `_execute_with_retry(func, *args, max_retries=3)`. `_status_code` digs the HTTP status out of a gspread `APIError` from `error.response.status_code`, then `error.code`, then the message (`[503]` or `'code': 503`, anchored so a "503" inside ordinary text is not mistaken for a status).

| Status | Treatment |
|---|---|
| 429 (quota) | wait `60 × (attempt + 1)` seconds, up to 3 attempts |
| 500 / 502 / 503 / 504 (`TRANSIENT_STATUS_CODES`) | wait `2 ** (attempt + 1)` seconds, up to 3 attempts |
| anything else | raised immediately — it is about the request, not Google |
| retries exhausted | `SheetsUnavailableError` |

No sleep happens after the final attempt.

### The `USER_ENTERED` apostrophe rule

Backup writes with `value_input_option="USER_ENTERED"`, under which Sheets parses a bare `2024-05-17` into a date cell and `get_all_values` later returns the locale rendering (`5/17/2024`), corrupting every release date on the first backup-then-pull cycle. So `format_model_for_sheet` in `app/utils/formatter.py` prefixes each value in a release-date column (`release_date.DATE_COLUMNS[tablename]`) with a leading apostrophe: `'2024-05-17`. Sheets stores that as text and the apostrophe is not part of the value on read.

What goes in which tab, the tab order, and the credit/tag columns are described in [data-actions.md](data-actions.md).

## Google Cloud Storage (cover images)

Images are stored one per row at `"{owner_type}/{system_id}.jpg"`, and the column that references one (`cover_image_file`, `photo_file`, `logo_file`) holds that whole key, folder included. The owner type is the table the id belongs to - each table has its own id space, so a bare id does not identify a file. `image_manager.cover_key()` is the only place the layout is spelled out, and `COVER_OWNERS` lists the thirteen folders: the nine media types plus `staff`, `character`, `publisher` and `studio`.

| Item | Value |
|---|---|
| Client | `get_gcs_client()` in `app/utils/gcp_utils.py`: on Cloud Run (`settings.is_cloud_run`, i.e. `K_SERVICE` set) → `storage.Client()` with the instance's IAM identity; locally with `GOOGLE_CREDENTIALS_JSON` → service-account credentials; otherwise Application Default Credentials. |
| Bucket vs disk | `get_active_bucket_name()` returns `settings.bucket_name`. When it is `None` (the local default) every function in `image_manager.py` reads and writes `COVER_DIR = "static/covers"` on disk instead; `app/main.py` creates one subdirectory per owner type under it and mounts `/static`. |
| `download_cover_image(url, owner_type, system_id)` | Skips if the object/file already exists; otherwise `requests.get` with the MediaTracker User-Agent and a 15 s timeout, then `upload_from_string(..., content_type="image/jpeg")` or a local write. **No resizing or format conversion** — a WebP from Tenrai is stored under a `.jpg` name as-is. Returns the storage key to record on the row, or `None` on any error (logged). |
| `cover_image_exists(owner_type, id)`, `list_all_cover_images(owner_type=None)`, `delete_cover_image(owner_type, id)` | The checks behind the Calculate-page cover tools (`bulk_check_cover_image`, `bulk_download_missing_covers`, `bulk_delete_orphaned_cover_images` in `app/services/calculation.py`) and the delete-entry background task. All swallow errors and log. `list_all_cover_images` returns keys and ignores anything left at the storage root, so an un-migrated file belongs to no owner and is never matched to a row. |
| Frontend URL | `getCoverUrl(coverFile)` in `frontend/src/lib/covers.js`: on `localhost` → `/static/covers/{key}`, otherwise `https://storage.googleapis.com/cg1618-anime-covers/{key}` (the bucket name is hard-coded there). It concatenates whatever the column holds, so the folder comes along for free; the "convention filename" fallbacks for an entry with no stored key build `{media_type}/{system_id}.jpg` and need the caller to have tagged the entry with its media type (`withMediaType`). |

### Placeholder handling

- **In the app**: there is no placeholder file on disk or in the bucket. When `cover_image_file` is empty or `"N/A"`, `getCoverUrl` returns `FALLBACK_SVG`, an inline grey "No Image" SVG; cards also set `onError` to swap in the same SVG if the real URL 404s.
- **From Comic Vine**: its stock placeholder is filtered out before download (see above), so a comic with no real cover keeps `cover_image_file` empty and shows the app's fallback.
- **From Tenrai / TMDB**: no filtering — whatever URL the mapper finds is downloaded. `bulk_download_missing_covers` only re-fetches anime whose `airing_type` is in `ALLOWED_AIRING_TYPES`.

## Which pipeline calls which service

From `PIPELINES` in `app/services/pipelines/specs.py` (the runner loop itself is in [data-actions.md](data-actions.md)):

| Pipeline key | ID extraction | Fill calls | Pause between entries | Services hit |
|---|---|---|---|---|
| `anime` | `apply_extract_mal_id_anime` | `autofill_anime_from_mal` | `MAL_PAUSE` (1 s) | Tenrai, GCS |
| `anime-movie` | `apply_extract_mal_id_anime` | `autofill_anime_movie_from_mal` | 1 s | Tenrai, GCS |
| `movie` | `apply_extract_imdb_id` | `autofill_movie_from_imdb` | none | TMDB, OMDb, GCS |
| `tv-show` | `apply_extract_imdb_id` | `autofill_tv_show_from_imdb` | none | TMDB (+ season), OMDb, GCS |
| `cartoon` | `apply_extract_imdb_id` | `autofill_cartoon_from_imdb` (only `airing_type` in `{"Movie", "TV"}`) | none | TMDB (+ season for TV), OMDb, GCS |
| `manga` | `apply_extract_mal_id_manga_novel` | `autofill_manga_from_mal` | 1 s | Tenrai, GCS |
| `novel` | `apply_extract_novel_ids` (`apply_extract_mal_id_manga_novel` then `apply_extract_openlibrary_id`) | `autofill_novel_from_mal` when `mal_link` is present, else `autofill_novel_from_openlibrary` | 1 s | Tenrai **or** Open Library, plus GCS |
| `studio` | `apply_extract_mal_id_studio` | `autofill_studio_from_mal`; `fill_only`, so no Replace routes exist | 1 s | Tenrai, GCS |
| `comic` | `apply_extract_comicvine_id` | `autofill_comic_from_comicvine`; stops when `comicvine_rate_limiter.has_capacity()` is false; not in Fill All; no bulk Replace | `COMICVINE_PAUSE` (1 s) | Comic Vine, GCS |
| `game` | `apply_extract_igdb_id` | `autofill_game_from_igdb`; no budget (no hourly quota); in Fill All; no bulk Replace | `IGDB_PAUSE` (0.25 s) | IGDB (+ Twitch for the token), GCS |

Bulk Replace (`_linked(...)`) re-fetches only entries that already have an external id or link, using the same autofill functions with `force_replace_ratings=True`. Backup and Pull use Sheets only; the cover tools on the Calculate page use GCS and, for missing covers, the autofill functions again.

## Known rough edges

Things the code does today that a reader might not expect. None is a documentation error — they are worth knowing before changing the code.

- `RetryError` is swallowed by every autofill, so a total outage looks like "nothing to fill" (see [Shared behaviour](#shared-behaviour)).
- All rate limiters are per-process memory: the OMDb daily count in particular restarts at zero on every deploy. The IGDB **token** cache is per-process too, so N instances mean N Twitch token requests — harmless, since Twitch issues one per client-credentials grant regardless.
- IGDB company enrichment is not built: Fill creates or links `studio` and `publisher` rows **by name only**, so a game company has no logo, country or founding date until someone types one in.
- `fetch_tmdb_data`'s retry wraps both TMDB calls, so a flaky details call costs an extra Find call per attempt.
- `fetch_openlibrary_work`'s `@retry` wraps all three calls (work, editions, authors), so a flaky author call re-runs the work and editions calls too on each attempt — the same shape as the `fetch_tmdb_data` note above.
- The docstring of `_status_code` in `sheets.py` says gspread `5.12.0` is pinned; `requirements.txt` pins `6.2.1`. The function handles both shapes, so behaviour is unaffected.
- `docs/dependencies.md` still lists gspread `5.12.0`.
- MAL's `OAD` type maps to `"Other"` even though the app's own vocabulary has an `OAD` value.
