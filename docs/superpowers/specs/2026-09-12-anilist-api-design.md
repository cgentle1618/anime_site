# AniList integration — score and rankings for anime, manga and novels — design

Status: awaiting review
Date: 2026-09-12
Branch: feat/anilist-api

## Why

`anilist_rating` exists on four tables — `app/models/anime.py:84`,
`app/models/anime_movie.py:78`, `app/models/manga.py:81`,
`app/models/novel.py:91` — is round-tripped through the sheet
(`app/utils/formatter.py:545,572,711,753`), has a form field in all four Add
tabs, and is rendered by `ScoreBlock.jsx` as the third figure beside MAL score
and MAL rank.

Nothing writes it. It is hand-typed, and on the live database it is filled on
**0 of 1192 rows**. The field is built and unused.

AniList publishes the score and the rankings that would fill it, over a public
GraphQL API that needs no key, and it accepts MAL ids directly — so the 1066
entries that already carry a `mal_id` (anime 792, anime movies 32, manga 194,
novel 48) can be looked up without a second identifier column.

## Scope

In scope, three values per entry across `anime`, `anime_movies`, `manga` and
`novel`:

| Column | AniList source | State |
| --- | --- | --- |
| `anilist_rating` | `averageScore` | exists, retyped |
| `anilist_rank` | `rankings[type=RATED, allTime=true].rank` | new |
| `anilist_popularity_rank` | `rankings[type=POPULAR, allTime=true].rank` | new |

Plus `siteUrl` written as a `media_source` reference row with value `AniList`,
the way `_write_tenrai_reference_rows` (`app/services/domain/autofill.py:60`)
writes Official Site and Twitter.

Out of scope:

- **Every other media type.** AniList covers anime and manga only. Movie, TV
  show, cartoon, comic and game are untouched.
- **AniList as a metadata fallback.** Status, dates, episode and chapter counts
  stay Tenrai's. A second mapper per media type doubles the surface for fields
  MAL already supplies, and Tenrai's coverage of this collection is good.
- **`popularity` (the raw user count), `favourites`, `trending`.** Returned by
  the same query at no extra cost and deliberately not stored — two rank
  columns were chosen over a count, matching how MAL models popularity.
- **`bannerImage`.** AniList is the only source that has one and there is no
  column to put it in.
- **A new pipeline.** AniList rides the existing Fill and Replace runs.

## The API

`POST https://graphql.anilist.co`, no auth, no key, no `.env` entry.

`Media(idMal: $idMal, type: ANIME|MANGA)` resolves a MAL id directly. Light
novels live in AniList's manga database under `type: MANGA` and are
distinguished by `format: NOVEL`, so novel and manga use the same query.

### The rate limit is not the documented one

AniList documents 90 requests/minute. The live API returns
`X-RateLimit-Limit: 30`, and has done for a long stretch. Probed 2026-09-12.

The throttle therefore **reads `X-RateLimit-Limit` and `X-RateLimit-Remaining`
off each response** and adapts, rather than hard-coding a constant the way
`TenraiRateLimiter.DEFAULT_LIMITS` does. It starts pessimistic at 30/minute. A
constant here would be wrong in whichever direction the limit next moves.

### Batching is what makes this affordable

At 30/minute, one request per entry costs **~36 minutes** across 1066 entries —
added to a Fill All or Replace All that takes ~10 minutes today.

`Page(perPage: 50) { media(idMal_in: [...], type: ...) { ... } }` returns up to
50 records in one request. The same 1066 entries cost **22 requests, under a
minute**. This is the reason the design carries a cache at all.

### The query

```graphql
query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: $type) {
      idMal
      siteUrl
      averageScore
      rankings { rank type allTime }
    }
  }
}
```

`idMal` is selected so results can be keyed back to entries — the response
order is not the request order.

## Module layout

Two new modules, matching the shape every other integration here uses:

- **`app/services/integrations/anilist.py`** — HTTP, throttle, and the per-run
  cache. Knows nothing about models.
- **`app/utils/anilist_utils.py`** — pure mapping, including the rankings
  selection rule. No network, no session, unit-testable alone.

The per-run cache lives in `anilist.py` beside the throttle, mirroring
`steam.py`'s owned-games cache, which is the existing precedent for
run-scoped state in an integration module.

## Mapping

### rankings is a list, not a scalar

`rankings` returns RATED and POPULAR at three scopes — all-time, year, and
season. Fullmetal Alchemist: Brotherhood returns six entries. Only the two
`allTime: true` rows are stored:

```python
def _all_time_rank(rankings, kind):
    for r in rankings or []:
        if r.get("allTime") and r.get("type") == kind:
            return r.get("rank")
    return None
```

All-time rankings are not confined to the top of the chart — a mid-tier 2018 TV
anime returns `#177 RATED / #211 POPULAR`, and Spice & Wolf's light novel
`#15 / #9`. They are absent on stubs.

### Column types

All three are `Integer`. `averageScore` is an integer 0–100 and a rank is a
position; neither is text.

This deliberately does **not** copy `mal_rank`, which is a `String`
(`app/models/anime.py:83`) and is stringified on the way in
(`app/utils/tenrai_utils.py:176`). That shape is not a reason to repeat it.
Retyping `anilist_rating` from `String` to `Integer` is free *now*, because the
column holds no data on any row; after the first Fill run it would be a data
migration.

Consequence for the sheet round-trip: the four `parse_from_sheet(...)` calls
become `int`, not `str`.

## Fetch flow

### Priming, via the `pre_run` hook that already exists

`PipelineSpec.pre_run` (`app/services/pipelines/runner.py:49`) runs once at the
start of a Fill or a Replace, before any entry is queued, and is not called by
the single-entry write hooks. It exists for exactly this: run-scoped state that
must not outlive the run. Steam uses it to drop its library cache
(`app/services/pipelines/specs.py:109`).

Each of the four specs gains:

```python
pre_run=lambda db: prime_anilist_cache(db, Anime, "ANIME")
```

which selects that model's non-null `mal_id`s, fetches them 50 at a time, and
fills the cache keyed by `(mal_id, type)`. The cache is reset at the start of
the same call, so a run never reads a previous run's scores.

### The cost this accepts

`pre_run` fires **before entry selection**, so a Fill run that touches three
anime still primes all 792 — 16 requests, about 32 seconds.

This is the one place the design is visibly worse than per-entry fetching, and
it is accepted knowingly. Making the prime proportional to the run would mean
moving `pre_run` after selection in the shared runner, which changes the
contract Steam already depends on. 32 seconds does not justify that.

### Writing

Each `autofill_*_from_mal` gains a sibling `autofill_*_from_anilist(entry, db)`
that reads the cache, never the network, and writes the three columns plus the
source row. The specs call both in sequence, the way `_fill_game` calls IGDB
then Steam (`app/services/pipelines/specs.py:102`).

### manga and novel need a session

`autofill_manga_from_mal(e, force_replace_ratings=True)` and
`autofill_novel_from_mal(...)` are called **without `db`**
(`app/services/pipelines/specs.py:198,230`), which is why manga and novel get
no `media_source` reference rows today while anime does. The AniList link needs
a session, so both call sites gain `db=db`.

## Write rules

All three columns are **overwrite** — the same rule as `mal_rating`,
`mal_rank` and `imdb_rating`. A score and a rank drift; that is what Replace is
for. This takes the catalog's overwrite set from nine fields to twelve.

The source row is **if-absent**, matching `_TENRAI_LINKS`
(`app/services/integrations/catalog.py:219`).

### They must not enter `*_FIELDS_TO_FILL`

`anilist_rank` is legitimately null for obscure entries — a light novel probed
on 2026-09-12 returned `averageScore: None` and no rankings at all. Listing a
permanently-null column in `ANIME_FIELDS_TO_FILL` would mark those entries
"needs Fill" on **every** run and re-request them forever.

That is the trap already recorded in the comments above `ANIME_FIELDS_TO_FILL`
and `MOVIE_FIELDS_TO_FILL` (`app/utils/utils.py:44`, `:78`), which is what
dropping `official_link` from the list was about.

So `fill_eligible` is unchanged on all four specs. AniList rides along on
entries the run had already selected, and a bulk Replace — which selects on
`mal_id` or `mal_link` being present, not on any column being null — is what
refreshes the whole collection.

## Error handling

A miss is normal, not a failure:

- **No match.** AniList returns HTTP 200 with the id simply absent from the
  `Page.media` array. The cache records a miss; the autofill writes nothing.
- **A stub match.** An `idMal` can resolve to a near-empty AniList record —
  one light-novel id returned `averageScore: None, popularity: 19`, no
  rankings. Indistinguishable from a real match at the protocol level, so the
  guard is per-value, not per-response.
- **The guard.** A `None` never overwrites an existing value, even under
  `force_replace_ratings`. Same shape as the Steam progress guard
  (`autofill_game_from_steam`), and the reason Replace cannot blank a column.
- **429 or network failure.** Logged; the batch is skipped; every entry in it
  keeps its current values and the run continues. AniList is additive — no
  entry is worse off for the API being down, so a failure never fails a run.
- **GraphQL errors.** A 200 can carry an `errors` array. Treated as a failed
  batch, not as data.

## Testing

Pure mapping (`tests/`, no network):

- all-time RATED and POPULAR both present → both scalars
- rankings present but all-time absent (year/season only) → both `None`
- `rankings: []` and `averageScore: None` → all three `None`, the stub case
- response ordering differs from request ordering → keyed correctly by `idMal`

Cache:

- 120 ids issue 3 requests, not 120
- an id absent from the response is a recorded miss, not a repeated fetch
- `prime_anilist_cache` clears before filling, so run two cannot read run one

Write behaviour — **refusal side, with the fixture that makes it bite.** Per
the standing rule, a test asserting "does not overwrite" passes vacuously if
the entry had nothing to overwrite:

- an entry with `anilist_rating = 77` and an AniList response of `None` keeps
  77 — the entry **must be seeded with 77**, or the assertion proves nothing
- the mirror case with the same fixture: a response of `82` replaces 77, so a
  green proves the guard did the refusing and not an inert code path

Catalog: `tests/api/test_external_api_catalog.py` checks source keys against
the client modules and column names against the models, so it fails until the
`anilist` service and the new `Write` entries exist. No new test needed; it is
already the guard.

## Documentation

- `docs/external-apis.md` — a new service section, the mapping rules, and the
  30-vs-90 rate-limit note.
- `docs/data-model.md` — three columns on four tables.
- `docs/data-actions.md` — AniList as a second source inside the anime, anime
  movie, manga and novel Fill/Replace pipelines.
- `docs/roadmap.md` — a Done entry when the work lands.

## Files touched

Backend: one migration; `app/services/integrations/anilist.py` (new);
`app/utils/anilist_utils.py` (new); `app/services/domain/autofill.py`;
`app/services/pipelines/specs.py`; `app/services/integrations/catalog.py`;
`app/utils/formatter.py`; four models; four schemas.

Frontend: `ScoreBlock.jsx` — five figures, `MAL score / MAL rank / AniList /
AniList rank / AniList popularity`, wrapping on narrow screens;
`formFactories.js`; `formFields/fieldMeta.js`; `payloads.js`; four Add tabs.

## What this spec is unsure about

Recorded now, so that marking it shipped can say whether it was right:

- **The five-figure `ScoreBlock`.** Five numerals in one row is asserted to
  wrap acceptably and has not been looked at. If it reads as crowded, the fix
  is a layout decision, not a data one — the columns stay.
- **`pre_run` priming the whole table.** Justified above at 32 seconds for
  anime. If Fill All's wall-clock turns out to be dominated by four primes
  rather than by the entries, the assumption was wrong and the hook ordering
  is worth revisiting after all.
