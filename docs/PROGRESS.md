# Progress

Status only. No prose, no summaries — one line per task, edited in place.

Status values: `todo` · `wip <who>` · `done <sha>` · `blocked <one clause>` · `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

Last updated: 2026-09-06

---

## Games — ninth media type

Spec: `docs/superpowers/specs/2026-09-06-games-media-type-design.md`

### publisher-entity · `docs/superpowers/plans/2026-09-06-publisher-entity.md`

| # | Task | Status |
|---|---|---|
| 1 | publisher model | done `aa84255` |
| 2 | media_credit.publisher_id | done `664dbf4` |
| 3 | schemas + PublisherRef | done `66a3bf3` |
| 4 | publisher credit role, third target | done `c4ad7ef` |
| 5 | /api/publisher router | done `b48c748` |
| 6 | Sheets round-trip | done `dc92828` |
| 7 | migration `p1u2b3l4i5s6` | done `93df481` |
| 8 | library, detail, nav | done `9305169` |
| 9 | admin add/modify/delete | done `8179940` |
| 10 | docs | done `d6c7413` |

### games-backend · `docs/superpowers/plans/2026-09-06-games-backend.md`

| # | Task | Status |
|---|---|---|
| 1 | vocabulary constants | done `ea86ee2` |
| 2 | games + game_copy models | done `10da1cc` |
| 3 | system_option_alias | done `0492c9c` |
| 4 | name_entries shape + note sections | done `7d1cea1` |
| 5 | game schemas | done `666cb94` |
| 6 | domain: hierarchy, completion, copies | done `045fd87` |
| 7 | registry spec + /api/game | done `8fd9e9a` |
| 8 | Sheets tabs + parsers | done `5373d5f` |
| 9 | pipeline spec (stub) | done `ec780a0` |
| 10 | credit roles, tags, relations, plan | done `4cb1162` |
| 11 | migration `g1a2m3e4s5` + seed | done `64fda2d` |
| 12 | docs | done `f49b1bb` |

### games-frontend · `docs/superpowers/plans/2026-09-06-games-frontend.md`

| # | Task | Status |
|---|---|---|
| 1 | playing status vocabulary | done `2a5c164` |
| 2 | registry keys | done `5a4800d` |
| 3 | three-way watch/read/play branches | done `58a4524` |
| 4 | library page config | done `ab0bf35` |
| 5 | detail page + tracker | done `22df112` |
| 6 | copies editor + name_entries section | done `e2c3d65` |
| 7 | admin add/modify | done `e70742a` |
| 8 | plan, stats, search, dashboard (+ publisher `/search` gap) | done `417797b` |
| 9 | build + docs | done `d97d976` (build wip) |

### igdb-integration · `docs/superpowers/plans/2026-09-06-igdb-integration.md`

| # | Task | Status |
|---|---|---|
| 1 | settings | done `5f3a7a5` |
| 2 | client + Twitch OAuth | done `4fbcf11` |
| 3 | mapper + time-to-beat | done `561a135` |
| 4 | autofill | done `7ec951e` |
| 5 | real Fill pipeline | done `3737edd` |
| 6a | search endpoint (backend) | done `e9ed228` |
| 6b | search box (frontend) | done `11e50d7` |
| 7 | docs | done `d97d976` |

### Post-plan gaps

| # | Item | Status |
|---|---|---|
| G1 | `GameResponse.ownership` never populated | done `4a72058` |
| G2 | note `entries` dropped by Pull | done `7411593` |
| G3 | game vocabularies absent from `/api/constants` | done `1bd3193` |
| G4 | game missing from watch-order + duplicate maps | done `866e2a6` |

---

## Open items

| Item | Where | Status |
|---|---|---|
| `alembic upgrade head` from an EMPTY db fails at `86982d71c2f1` | pre-existing, not from this work | todo |
| `delete_studio` never calls `delete_cover_image` (logo leak) | `app/routers/studio.py` | todo |
| Migrate `publisher_tw` tag rows into the publisher entity | anime, manga, novel, comic | todo |
| Steam Web API playtime sync | columns `steam_appid`/`steam_link` reserved | todo |
| Stale Deferred line: "`system_option_usage` has no Sheets tab" | `docs/roadmap.md` | done `d97d976` |
| Stale "not served yet" rows for the game vocabularies | `docs/options.md` | done `d97d976` |
| Series page: no Game tab | `frontend/src/pages/detail/SeriesPage.jsx` | done `2669067` |

### Found by the docs pass, not yet fixed

| Item | Where | Status |
|---|---|---|
| No Game Entry tab documented | `docs/frontend/admin-pages.md` | todo |
| `bulk_download_missing_covers` has no Game branch | `app/services/calculation.py` | todo |
| Games (and comics) absent from cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` | todo |
| No Games tab | `FutureReleases.jsx` | todo |
| 7 game arrays hand-synced, not `/api/constants` fallback; comment stale | `frontend/src/config/fieldOptions.js` | todo |
| Duplicate `--c-scope-game` in the dark block | `frontend/src/index.css` | todo |
| Colour-token table holds pre-archive hexes | `docs/frontend/components.md` | todo |

## Test databases in use

`anime_site_test_pubbe` · `anime_site_test_gameb` · `anime_site_test_gamec` · `anime_site_test_igdb` · `anime_site_test_gamefix` — drop when the work is done.
