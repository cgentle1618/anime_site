# Steam integration — prices, Metacritic and personal progress for games — design

Status: awaiting review
Date: 2026-09-06
Branch: modify

## Why

IGDB is the only source wired up for `games`. It fills release date, link,
HowLongToBeat times, cover, studio/publisher credits, the four tag families and
`base_game_id` (`app/services/domain/autofill.py:629`). Everything it does is
fill-only, which is why the game pipeline has no bulk Replace at all
(`app/services/pipelines/specs.py:229`).

That leaves a block of columns that exist on the model and are never written by
anything:

- `steam_appid`, `steam_link` — declared at `app/models/game.py:134` and inert.
- `price_original_us/jp/tw`, `price_current_us/jp/tw` — six columns, hand-typed.
- `achievements_total`, `achievements_earned`, `hours_played`.
- `metacritic_score` — added in migration `gm1e2t3a4c5` alongside
  `metacritic_user_score`, both currently hand-typed.

Steam covers all of them except `metacritic_user_score`. Two of its endpoints
need no key or account at all, and its three storefront regions are exactly the
three the price columns already model.

## Scope

In scope, as two milestones:

**Phase 1 — the identifier.** No Steam call is possible without an appid, so
this lands and is verified on real data first.

1. `GAME_FIELDS` requests IGDB's `external_games`; the mapper yields
   `steam_appid` and a canonical `steam_link`.
2. `extract_steam_appid` + `apply_extract_steam_appid`, so a hand-typed
   `steam_link` wins over IGDB.
3. `apply_extract_game_ids` runs both extractors for the game pipeline.

**Phase 2 — the source.**

4. A Steam client and mapper built to the shared client shape.
5. `autofill_game_from_steam`, writing columns only — no tags, no credits.
6. `steam_progress_sync`, a new tristate column locking the progress writes.
7. Game gains a bulk Replace, its first.

Out of scope:

- `metacritic_user_score`. Steam does not publish it; it stays hand-typed.
- Steam genres/categories as tags. IGDB already owns the game vocabulary
  through the alias layer and a second vocabulary would fight it.
- Steam images. IGDB's cover is already written and is the better art.
- Company enrichment (logos, countries). Still open, still not this change.

## Milestone 1 — the identifier

### IGDB carries the appid already

`GAME_FIELDS` (`app/services/integrations/igdb.py:52`) gains
`external_games.category,external_games.uid`. The Steam row is `category = 1`
and its `uid` is the appid as a string.

**Open question to settle first, in code, not in prose:** IGDB has been
migrating `external_games` from the legacy `category` enum toward
`external_game_source`. Before writing the mapper, probe the live API for a
known game and record which spelling returns the Steam row today. If both work,
request both and prefer whichever is populated. This is the single factual
unknown in the design and it is cheap to resolve.

`map_igdb_to_game_data` gains two outputs:

| IGDB field | Mapped key | Column | Rule |
|---|---|---|---|
| `external_games` where Steam | `steam_appid` | `games.steam_appid` | fill-only |
| derived from the appid | `steam_link` | `games.steam_link` | fill-only |

The link is synthesised as `https://store.steampowered.com/app/<appid>/`
rather than read from `websites`, so its shape is ours and is stable.

### A hand-typed link wins

New `app/utils/steam_utils.py`:

```python
STEAM_APPID_PATTERN = re.compile(r"store\.steampowered\.com/app/(\d+)")

def extract_steam_appid(url: Optional[str]) -> Optional[int]: ...
```

`apply_extract_steam_appid` in `app/services/domain/derivation.py` mirrors
`apply_extract_igdb_id` (line 112) exactly, including its rule that an
unparseable link leaves any existing id untouched.

### Both extractors run

`PipelineSpec.extract_id` is a single callable, so the game spec moves to
`apply_extract_game_ids`, which runs the IGDB extractor then the Steam one.
`apply_extract_novel_ids` is the existing precedent for a two-extractor type.

### Ordering within one Fill pass

For a game entered with only an IGDB link, a single Fill run does the whole
job, in this order:

1. `extract_id` — IGDB id from the pasted link; no Steam link yet, so the Steam
   extractor writes nothing.
2. `autofill_game_from_igdb` — fetches the IGDB record and writes
   `steam_appid` + `steam_link`.
3. `autofill_game_from_steam` — reads the `steam_appid` just written.

No second run is required. A game with no Steam presence at all simply never
gets an appid, and step 3 returns immediately. That is an ordinary outcome for
console-only entries, not an error, and is never logged as one.

## Milestone 2 — the source

### Module layout

Client and mapping are split exactly as IGDB splits them.

| File | Responsibility |
|---|---|
| `app/services/integrations/steam.py` | HTTP only: throttle, retry, timeout |
| `app/utils/steam_utils.py` | pure mapping, no I/O; also Phase 1's extractor |
| `app/services/domain/autofill.py` | `autofill_game_from_steam(game, db)`, no commit |

### Two hosts, two auth stories

| Host | Auth | Used for |
|---|---|---|
| `store.steampowered.com/api/appdetails` | **none** | prices, Metacritic, achievement total |
| `api.steampowered.com` | `steam_api_key` + `steam_id` | playtime, achievements earned |

`settings.steam_api_key` and `settings.steam_id` are new, both
`Optional[str]`, added to `app/config.py` and `.env.example`.

This split is deliberate and gives graceful degradation: **the storefront half
needs no configuration whatsoever.** A missing key, a missing steamid or a
private profile skips only the progress phase, logs one warning per run, and
leaves prices and Metacritic filling normally.

### Requests per game

`appdetails` returns `metacritic`, `achievements` and `price_overview` in one
response, so the non-price payload rides along with `cc=us` and the other two
regions are price-only.

| Call | Count |
|---|---|
| `appdetails?cc=us` | 1 (prices + metacritic + achievement total) |
| `appdetails?cc=jp`, `cc=tw` | 2 (prices only) |
| `GetPlayerAchievements` | 1 |
| `GetOwnedGames` | **once per run**, not per game |

Four requests per game. `GetOwnedGames` returns the entire library with
`playtime_forever` in a single response, so it is fetched once at the start of
a run and cached in memory keyed by appid; playtime therefore costs nothing
per entry.

### Throttling

The storefront's unofficial ceiling is ~200 requests per 5 minutes per IP.
At three calls per game that is ~66 games per 5 minutes, so **Steam, not IGDB,
sets the pace of Fill Game** — a 300-game backfill runs on the order of 20-25
minutes.

- A sliding-window `SteamStoreRateLimiter` inside the client is the guard, in
  the shape of `IGDBRateLimiter` (`igdb.py:64`).
- `STEAM_PAUSE` in `specs.py` is the polite spacing, not the guard.
- A `budget` hook, as Comic Vine has, stops a Fill All that exhausts the
  window and reports the remainder rather than blocking on it.

### Mapping

Columns only. Steam writes no tag and no credit, and so never touches the alias
layer — nothing here can produce an untranslated term.

| Steam field | Column | Rule | Note |
|---|---|---|---|
| `metacritic.score` | `metacritic_score` | overwrite | 0-100 int, the column's own scale |
| — | `metacritic_user_score` | never | not published by Steam; hand-typed |
| `price_overview.initial` | `price_original_{us,jp,tw}` | fill-only | list price |
| `price_overview.final` | `price_current_{us,jp,tw}` | overwrite | the number a sale moves |
| `achievements.total` | `achievements_total` | fill-only | absent for many games |
| `playtime_forever` | `hours_played` | overwrite, guarded | minutes / 60 |
| unlocked count | `achievements_earned` | overwrite, guarded | |
| `name`, `short_description` | none | never | name is identity; no summary column, as with IGDB |
| `genres`, `categories` | none | never | IGDB owns the game vocabulary |

**Currency.** Steam returns an integer with two implied decimals *regardless of
currency*, yen included. The conversion into the `Numeric(10, 2)` columns is
therefore a uniform divide by 100.

**Verified** against the live storefront on 2026-09-06 with app 1245620:
USD `5999` → $59.99, JPY `902000` → ¥9,020, TWD `179000` → NT$1,790. Yen
having no minor unit in the real world made this the most plausible place for
the API to be irregular; it is not.

`map_steam_to_game_data` asserts the returned `currency` matches the currency
expected for the requested `cc` (USD / JPY / TWD) and drops the region's prices
with a warning on a mismatch, so a silent region redirect cannot write a US
price into `price_current_jp`.

**Absent prices are normal.** A free or unreleased game has no `price_overview`
at all. The price columns stay null and `is_free` is recorded in the log line,
so a null price is explainable rather than mysterious.

### `steam_progress_sync`

A nullable Boolean on `games`, built as a straight copy of `all_achievements`.

| Value | Meaning |
|---|---|
| NULL / true | Steam is the authority for this entry's progress |
| false | Steam never writes `hours_played` or `achievements_earned` |

It governs the two progress columns and nothing else — prices and Metacritic
ignore it entirely. It exists for the game you own on Steam but played
elsewhere: 200 hours on PS5, 2 on Steam, and without the lock a Replace run
would overwrite 200 with 2.

Touches, following `all_achievements`: `app/models/game.py`,
`app/schemas/game.py`, `app/utils/constants.py`, `app/utils/formatter.py`,
`frontend/src/config/formFactories.js`,
`frontend/src/config/formFields/fieldMeta.js`, `frontend/src/lib/payloads.js`,
`frontend/src/pages/add-tabs/GameAddTab.jsx`,
`frontend/src/pages/admin/Modify.jsx`, `frontend/src/pages/detail/Game.jsx`,
one migration, and a new column on the Game sheet tab.

### The two guards

Every progress write passes both, in order:

```
steam_progress_sync is False   -> skip both columns entirely
value is 0 or None             -> skip that column
otherwise                      -> overwrite
```

The zero guard is the safety net for entries not yet flagged: a game owned but
never launched on Steam reports `playtime_forever = 0`, and without the guard
the first run would wipe a hand-typed figure before the admin ever had reason
to set the lock.

### Eligibility

`GAME_FIELDS_TO_FILL` is **not** extended. Adding price or Metacritic columns
to the missing-values test would leave every free, unrated or
achievement-less game eligible forever — the same trap that keeps the genre
tags out of it (`docs/external-apis.md:364`).

Instead the Steam phase runs when the entry has an appid and Steam has written
nothing at all to it:

```python
def has_missing_values_game_steam(e) -> bool:
    return (
        e.steam_appid is not None
        and e.metacritic_score is None
        and e.price_original_us is None
        and e.achievements_total is None
    )
```

**How this composes with the existing gate.** `fill_eligible` for game is
currently `e.igdb_id is not None and has_missing_values_game(e)`, and that
single expression gates the whole entry. It becomes an OR:

```python
fill_eligible=lambda db, e: (
    (e.igdb_id is not None and has_missing_values_game(e))
    or has_missing_values_game_steam(e)
)
```

so a game whose IGDB columns are already complete still qualifies when only its
Steam columns are empty. `_fill_game` then always calls both autofills in
order, and each guards only on its own id being present:
`autofill_game_from_igdb` returns early without an `igdb_id`, and
`autofill_game_from_steam` returns early without a `steam_appid`. Neither
checks whether its own columns are already complete, so an entry admitted
*solely* by the Steam clause (IGDB columns full, Steam columns empty) still
spends `autofill_game_from_igdb`'s two IGDB requests before Steam's three run
— five requests, not three, for that entry.

A free, unrated, achievement-less game with complete IGDB data therefore
retries on each Fill All run at a cost of five requests, not three. That set
is small and bounded, and the alternative — gating `_fill_game`'s IGDB call on
`has_missing_values_game`, or a `steam_checked_at` column — was rejected:
`has_missing_values_game` reads columns only, so gating on it would also skip
the credit, tag and Steam-pair writes that legitimately still run once the
columns are full but credits are absent.

Refreshing is Replace's job, not Fill's.

### Game gains a Replace

Its first. `replace_select` is every game with a `steam_appid`; `replace` runs
the Steam half only, since nothing in an IGDB record drifts — the reasoning
already recorded in the game spec's comment stays true of IGDB and is now
false of the type as a whole.

Fill and Replace call the same `autofill_game_from_steam` with no behavioural
flag, differing only in *selection*, which keeps the invariant the catalog
module documents. Overwrite fields overwrite in both, exactly as
`force_replace_ratings=True` already applies on anime's Fill.

`in_replace_all` becomes True; `fill_only` stays False.

## Write-rule consequence

`price_current_us/jp/tw`, `metacritic_score`, `hours_played` and
`achievements_earned` join `mal_rating`, `mal_rank` and `imdb_rating` as
overwrite fields. The "exactly three are overwritten on every run" claim in
`app/services/integrations/catalog.py` and in `docs/external-apis.md` becomes
seven and must be corrected in the same change.

The game `Coverage` block moves from `combination="single"` to `"merged"`,
with a second `SourceBlock` for `steam`.

## Error handling

Per-entry, never aborting a run, matching every other integration: a 404 on a
delisted app, a private profile, an absent key, a null `price_overview` and a
missing `metacritic` block all log and continue to the next entry.

Exhausting the request window is the one thing that ends a run early, and it
does so cleanly rather than by exception: the `budget` callable returns False
once the sliding window has no capacity, and the runner stops and reports the
remaining entries — the Comic Vine behaviour. `RateLimitExceeded` remains the
client's last-resort guard for the case where the storefront rejects a request
the limiter believed was within budget; it is caught per entry like any other
fetch failure.

## Testing

TDD throughout: the failing test precedes the code. All HTTP is mocked; no test
touches the network.

**`steam_utils`**
- appid extraction: canonical URL, trailing-slug URL, junk, empty, `None`.
- the divide-by-100 conversion, including a **JPY** case.
- currency mismatch drops that region's prices and warns.
- free game: no `price_overview` leaves prices null.
- missing `metacritic` / `achievements` blocks are handled as ordinary.

**`autofill_game_from_steam`**
- each write rule from the mapping table.
- `steam_progress_sync=False` blocks both progress columns.
- `playtime_forever=0` leaves a hand-typed `hours_played` intact.
- a real value overwrites a hand-typed one.
- no appid: returns before issuing any HTTP call at all.

**Phase 1**
- `map_igdb_to_game_data` yields appid and canonical link from an
  `external_games` payload, and yields neither when the Steam row is absent.
- a hand-typed `steam_link` beats IGDB's value.

**Existing guards** — `tests/api/test_external_api_catalog.py` already checks
catalog keys against `PIPELINES` and column names against the model, so the new
`SourceBlock` is covered for free once written.

**Frontend** — `payloads.test.js` for the new tristate; the theme-token test
already gates the build.

## Documentation

Updated in the same change, each with its `Last verified` line bumped:

- `docs/external-apis.md` — a new service section, and the three-overwritten-
  fields correction.
- `docs/data-model.md` — `steam_progress_sync`, and the Steam columns ceasing
  to be hand-only.
- `docs/entry-types.md`, `docs/business-rules.md` §5 (the new ID-from-link
  rule).
- `docs/data-actions.md` — game gains a Replace.
- `app/services/integrations/catalog.py` — the merged game coverage block.
