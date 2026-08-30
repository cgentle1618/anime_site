# Options & Enum Values

Valid values for enumerated fields across the application. These drive frontend dropdowns, backend filtering, and business logic.

Fields marked _(future)_ are planned but not yet in the database schema.

## Table of Contents

- [The Three Tiers](#the-three-tiers)
- [Value Discrepancies (Preserved, Not Resolved)](#value-discrepancies-preserved-not-resolved)
- [Watching Status](#watching-status)
- [Watching Status Filter Options](#watching-status-filter-options)
- [Reading Status](#reading-status)
- [Airing Type](#airing-type)
- [Airing Status](#airing-status)
- [Day of Week](#day-of-week)
- [Franchise Type](#franchise-type)
- [My Rating](#my-rating)
- [Franchise Expectation](#franchise-expectation)
- [Music Status](#music-status)
- [Seiyuu Status](#seiyuu-status)
- [Movie Type](#movie-type)
- [Comic Type](#comic-type)
- [Main / Spinoff](#main--spinoff)
- [Region (TV Show)](#region-tv-show)
- [Region (Manga)](#region-manga)
- [Serialization Status](#serialization-status)
- [Watch Order Step Importance](#watch-order-step-importance)
- [Media Relation Kinds](#media-relation-kinds)
- [Size Groups](#size-groups)
- [Note Section Kinds](#note-section-kinds)
- [Became Entities (Tier 3)](#became-entities-tier-3)
- [Franchise — Special Entries](#franchise--special-entries)
- [Franchise for Filter — Example Values](#franchise-for-filter--example-values)
- [Fields to Fill by Entry Type](#fields-to-fill-by-entry-type)

---

## The Three Tiers

Every dynamic choice list used to be one row in a single `system_options`
table — a dropdown suggestion list, not a constraint. The 2026-08-29 options
redesign replaced it with three homes, sorted by one question: **does code
branch on the exact value?**

### Tier 1 — Closed enums (code, not database)

Values the business logic compares against. `Not Yet Aired` makes Fill skip
`mal_rating`/`mal_rank`; the watching-status filter groups `Completed` with
`Completed (解說)`; `完結` gates the novel volume/chapter checks. If an admin
could rename or delete these, logic would break silently and no migration
would catch it.

**They are Python constants in `app/utils/constants.py`, served read-only by
`GET /api/constants`** (see `docs/api.md`) so the frontend stops keeping a
second copy of each list. This document remains their canonical reference —
every section below a Tier 1 enum documents its real, current values.

| Enum | Note |
|---|---|
| Watching Status / Reading Status | |
| Airing Status | |
| Airing Type (anime, cartoon) | |
| Franchise Type | |
| My Rating | Reused by `person.my_rating` and `studio.my_rating` |
| Franchise Expectation | |
| Movie Type | |
| Serialization Status | Manga and Novel now have **separate** value lists — see below |
| Music Status / Seiyuu Status | |
| Day of Week | |
| Watch Order Step Importance | |
| Note Section Kinds | |
| Media Relation Kinds | Already code-side in `app/utils/relation_kinds.py` |
| **Main / Spinoff** | Moved here from `system_options` |
| **Region** (TV Show, Manga) | Moved here from `system_options` |

`Dub Preference` is **dropped entirely** — it was used nowhere (no service,
no form, no column ever read it) and existed only in this document. It is
not in `system_options`, not a Tier 1 constant, and not a column anywhere.

### Tier 2 — Open vocabularies (`system_option`)

Values only humans read. Nothing in the code compares against them, so they
are safe to add, rename and reorder at will. They live in the `system_option`
/ `system_option_scope` tables — see `docs/database-schema.md`.

Old per-consumer duplication (`TV Show Official Source` / `Cartoon Official
Source`, `Region (TV Show)` / `Region (Manga)`, TW distributors split three
ways) is replaced by **one vocabulary per category, with each value carrying
the scopes it is offered in**. A value with no scope rows is offered
everywhere. A dropdown asks the `/api/options` endpoint for
`?category=Official Source&scope=cartoon`.

**Scopes are admin-managed data, never derived from usage (Ruling R27).**
Writing a tag used to stamp the entry's media type onto the value as a scope.
That meant assigning an unscoped value to one entry silently narrowed it to
that media type everywhere else — add `Disney+` under `Official Source`, use
it on one TV show, and it disappears from the Cartoon dropdown with nothing to
explain why. `replace_tags` no longer does this, for the same reason person
`director` scope is explicit rather than derived from credits: a value must be
offerable before its first use, and one save must not be able to un-offer it.

Scopes are therefore set and repaired by hand, in the Options tab of the Add
and Modify admin pages (`ScopePicker`), and validated against the hyphenated
media type keys on write. Two passes still touch them, both ADDITIVE so
neither can narrow: the one-time `backfill_credits` seeding, and
`extract_system_options`, the deliberate reconcile action Calculate runs.

| Category | Scopes | Replaces |
|---|---|---|
| `Genre Main` | — (anime only field) | `Genre Main` |
| `Genre Sub` | — (anime only field) | `Genre Sub` |
| `Label` | `anime` | new in 2026-08 — 標籤 Label, viewing-experience tags (會跳OP, 吃飯不宜觀看, 很多福利); seeded by `l1a2b3e4l5o6`, extended through the Options Add page |
| `Official Source` | `tv-show`, `cartoon`, `movie` | `TV Show Official Source` + `Cartoon Official Source` + the mismatched `TV Official Source` the code actually wrote — all one vocabulary now |
| `Franchise for Filter` | `movie`, `tv-show` | `Movie Franchise for Filter` + a TV show equivalent |
| `Publisher / Distributor TW` | `anime`, `manga`, `novel`, `comic` | `Distributor TW` + `Manga Publisher TW` + `Novel Publisher TW` |
| `Comic Publisher` | `comic` | `Comic Publisher` |
| `Comic Imprint` | `comic` | `Comic Imprint` |
| `Comic Continuity` | `comic` | `Comic Continuity` |
| `Comic Era` | `comic` | `Comic Era` |
| `Comic Event` | `comic` | `Comic Event` |

**`Franchise for Filter` has no frontend consumer today** — same gap the old
`Movie Franchise for Filter` / TV show equivalent had (nothing in
`fieldMeta.js` reads it). It exists as a vocabulary and is filter-only (see
`FILTER_ONLY_CATEGORIES` in `app/utils/credit_roles.py`), not a
`media_tag`-backed entry field.

Comic Era, Continuity and Event carry more structure in principle (a date
range, an ordering) but are treated as plain vocabularies for now. If they
earn columns later they graduate to Tier 3 the way `person`/`studio` did.

### Tier 3 — Entities (`person`, `studio`)

Categories that named a person or a studio became real entity tables instead
of vocabulary rows — directors and seiyuu need multilingual names, a rating,
a photo and a remark; a flat `(category, value)` string could not hold any
of it. See [Became Entities](#became-entities-tier-3) below for the mapping
from old category to new role, and `docs/database-schema.md` for the
`person` / `person_role` / `studio` / `media_credit` schema.

**`character` and `character_voice` were designed but not built.** The
design spec lays out both tables (franchise-scoped cast profiles, and
seiyuu casting with a language dimension for dubs), but neither exists yet —
they touch no existing column and are deferred to a follow-up spec.
`anime.seiyuu` is unrelated either way: it always was, and still is, a
`Need`/`Done` status column tracking whether the seiyuu work has been done
for an entry, never a cast list.

---

## Value Discrepancies (Preserved, Not Resolved)

The redesign's plan forbade changing any enum's values while moving it
between homes, so a few disagreements already present in the code were
carried over rather than silently "fixed" by picking a side. Two of them are
genuine two-sided splits — the app itself is inconsistent — and are recorded
here rather than resolved:

- **`franchise_type`.** `app/utils/constants.py`'s `FranchiseType` Enum class
  has `Anime` and lacks `Anime Movie`. The `FRANCHISE_TYPES` tuple —
  what `GET /api/constants` actually serves, because it matches what the
  frontend dropdown shows — has `Anime Movie` and lacks `Anime`. Both
  include `ACG`. See the [Franchise Type](#franchise-type) table below for
  the tuple's real values; the `Enum` class stays backend-internal.
- **`anime_airing_type`.** `AnimeAiringType` (the Enum class) has six values
  (`TV`, `ONA`, `OVA`, `OAD`, `Special`, `Movie`); `ANIME_AIRING_TYPES` (what
  `/api/constants` serves) carries a trailing `Other` the Enum class lacks.

Two more were simple documentation gaps — a single ground truth in code that
this file had drifted from — and **are** fixed below to match the code:

- **Serialization Status.** This file previously listed one shared 5-value
  table (including `未出`, labelled "novel only"). In code, Manga and Novel
  have always had **separate, different-length** tuples:
  `MANGA_SERIALIZATION_STATUSES` (4 values, no `未出`) and
  `NOVEL_SERIALIZATION_STATUSES` (8 values). See the
  [Serialization Status](#serialization-status) section below, now split in
  two.
- **Franchise Expectation.** `FRANCHISE_EXPECTATIONS` in code has always
  included `Highest` above `High`/`Medium`/`Low`; this file listed only the
  three lower values. See the updated table below.

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
| `Completed (解說)` |         |
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
| `Completed`   | Completed, Completed (解說)               |
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
| `Completed (解說)`|         |
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
| `Other`   | Served by `/api/constants` (`ANIME_AIRING_TYPES`); absent from the `AnimeAiringType` Enum class — see [Value Discrepancies](#value-discrepancies-preserved-not-resolved) |

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
| `Canceled`        |         |
| `Rumored`         |         |

---

## Day of Week

Fields: `anime.broadcast_day`, `anime.my_watch_day` — Default: `null`

Stored as plain strings; the closed value list lives in `WEEKDAYS`
(`app/utils/constants.py`, served at `/api/constants` as `day_of_week`) and
drives both dropdowns in the Anime Add/Modify forms. There is no backend
enum or validator.

| Value       | Default |
| ----------- | ------- |
| `null`      | Yes     |
| `Monday`    |         |
| `Tuesday`   |         |
| `Wednesday` |         |
| `Thursday`  |         |
| `Friday`    |         |
| `Saturday`  |         |
| `Sunday`    |         |

Related field `anime.broadcast_time` is a Postgres `TIME` column (no timezone), exchanged over the API as `"HH:MM:SS"`.

---

## Franchise Type

Field: `franchise.franchise_type` — Default: `null`

The values below are `FRANCHISE_TYPES` — what `/api/constants` actually
serves and what the frontend dropdown shows. See
[Value Discrepancies](#value-discrepancies-preserved-not-resolved): the
backend-internal `FranchiseType` Enum class differs (`Anime` instead of
`Anime Movie`).

| Value         | Default |
| ------------- | ------- |
| `null`        | Yes     |
| `ACG`         |         |
| `Anime Movie` |         |
| `Movie`       |         |
| `TV`          |         |
| `Cartoon`     |         |
| `Comic`       |         |
| `Novel`       |         |

---

## My Rating

Field: `anime.my_rating`, `franchise.my_rating`, `seasonal.my_rating`,
**`person.my_rating`, `studio.my_rating`** — Default: `null`

The Tier 3 entity tables reuse this same enum rather than defining their own.

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

`FRANCHISE_EXPECTATIONS` in code has always included `Highest`; this table
previously omitted it — see
[Value Discrepancies](#value-discrepancies-preserved-not-resolved).

| Value     | Default |
| --------- | ------- |
| `Highest` |         |
| `High`    |         |
| `Medium`  |         |
| `Low`     | Yes     |

---

## Music Status

Field: `note.status` — Default: `null`

The `op`, `ed`, `insert_songs` and `ost` note sections (anime only). These
were the `anime.op` / `anime.ed` / `anime.insert_ost` columns until revision
`m1u2s3i4c5t6` moved them onto note rows, so the status is now per song rather
than per entry. `insert_songs` is `episode_name_links`-shaped rather than
`music_track`-shaped, but it tracks a song the same way, so it offers the same
values. `note.status` exists for this dropdown alone.

| Value     | Default |
| --------- | ------- |
| `null`    | Yes     |
| `Need`    |         |
| `Pending` |         |
| `Done`    |         |

---

## Seiyuu Status

Field: `anime.seiyuu` — Default: `null`

**Untouched by the options redesign.** This is a `Need`/`Done` status column
tracking whether the seiyuu casting work has been done for an entry — not a
cast list, and not related to the `seiyuu` `person_role` / `media_credit`
concept the redesign did not build (see
[Became Entities](#became-entities-tier-3)).

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

## Comic Type

Field: `comic.comic_type` — Default: `null`

| Value      | Default |
| ---------- | ------- |
| `null`     | Yes     |
| `Ongoing`  |         |
| `Limited`  |         |
| `One-Shot` |         |
| `Annual`   |         |

---

## Main / Spinoff

Fields: `anime.is_main`, `movies.is_main`, `tv_shows.is_main`,
`cartoons.is_main`, `manga.is_main`, `novel.is_main` — Default: `null`

**Moved into Tier 1** from the old `Main / Spinoff` `system_options`
category — code elsewhere (duplicate detection, listing display) treats this
as a closed set, so it now lives in `IS_MAIN` (`app/utils/constants.py`,
served at `/api/constants` as `is_main`) rather than an editable vocabulary.
`comic.is_main_entry` is a separate `Boolean` column, not this string enum.

| Value    | Default |
| -------- | ------- |
| `null`   | Yes     |
| `本傳`   |         |
| `外傳`   |         |
| `前傳`   |         |
| `後傳`   |         |
| `總集篇` |         |

---

## Region (TV Show)

Field: `tv_shows.region` — Default: `null`

**Moved into Tier 1** from the old `system_options` category of the same
name — now `TV_REGIONS` in `app/utils/constants.py`, served at
`/api/constants` as `tv_region`.

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

Field: `manga.region` — Default: `null`

**Moved into Tier 1** from the old `system_options` category of the same
name — now `MANGA_REGIONS` in `app/utils/constants.py`, served at
`/api/constants` as `manga_region`.

| Value  | Default |
| ------ | ------- |
| `null` | Yes     |
| `日漫` |         |
| `韓漫` |         |
| `國漫` |         |
| `台漫` |         |
| `其他` |         |

`novel.region` has its own tuple, `NOVEL_REGIONS` (`"JP"`, `"CN"`, `"TW"`,
`"KR"`, `"Western"`, served as `novel_region`) — it was never a
`system_options` category and so was not part of this move; it is documented
under the `novel` table in `docs/database-schema.md`.

---

## Serialization Status

Manga and Novel have **separate, different-length** value lists — a single
shared table here previously undercounted the Novel side; see
[Value Discrepancies](#value-discrepancies-preserved-not-resolved).

### Manga

Field: `manga.serialization_status` — Default: `null`. `MANGA_SERIALIZATION_STATUSES`.

| Value    | Default | Notes                          |
| -------- | ------- | ------------------------------- |
| `null`   | Yes     |                                 |
| `連載中` |         | Currently serializing           |
| `停更`   |         | On hiatus                       |
| `腰斬`   |         | Cancelled / axed                |
| `完結`   |         | Completed                       |

### Novel

Field: `novel.serialization_status` — Default: `null`. `NOVEL_SERIALIZATION_STATUSES`.

| Value                  | Default | Notes                           |
| ----------------------- | ------- | -------------------------------- |
| `null`                  | Yes     |                                  |
| `連載中`                |         | Currently serializing            |
| `連載中 (不穩定)`       |         | Serializing, irregular schedule  |
| `連載中 (有生之年)`     |         | Serializing, "in my lifetime" (very irregular) |
| `停更`                  |         | On hiatus                        |
| `完結`                  |         | Completed                        |
| `腰斬`                  |         | Cancelled / axed                 |
| `可能更多`               |         | Nominally complete but may continue |
| `未出`                  |         | Not yet published                |

`comic.serialization_status` reuses the Manga/Novel idiom but has no
dedicated tuple of its own in `app/utils/constants.py` — see
`docs/database-schema.md`.

---

## Watch Order Step Importance

Field: `watch_order_item.importance` — Default: `Normal`

One rung per step, never two — which is why this is a single column rather than
a set of booleans. Unrelated to `watch_order_list.list_type`, which also has a
`Recommended` value: that ranks whole orders, this ranks steps within one. The API rejects any other value; the Google Sheets parser
instead coerces an unrecognized cell to `Normal`, so one bad cell cannot fail a
whole restore.

| Value         | Default | Notes                                                                      |
| ------------- | ------- | --------------------------------------------------------------------------- |
| `Essential`   |         | Carries the story; the guide badges it and can show these alone            |
| `Recommended` |         | Worth watching but not load-bearing; badged, and kept by "Hide optional"   |
| `Normal`      | Yes     | An ordinary step — no badge                                                |
| `Optional`    |         | Skippable / filler; the guide dims the row and can hide it                 |

Generated (built-in) orders have no `watch_order_item` rows behind them, so
every step of one is `Normal`.

---

## Media Relation Kinds

The vocabulary of `media_relation.relation_type`, defined in
`app/utils/relation_kinds.py` and served at `GET /api/media-relation/kinds`.

Eleven labels appear in the admin dropdown; ten are stored. `Prequel` is
accepted on write and recorded as a `sequel` row with the endpoints swapped, so
one fact is always one row.

| Label          | Stored as       | Inverse label | Family      |
| -------------- | --------------- | ------------- | ----------- |
| Sequel         | `sequel`        | Prequel       | timeline    |
| Prequel        | `sequel` (swapped) | Sequel     | timeline    |
| Alternative    | `alternative`   | Alternative   | equivalence |
| Corresponding  | `corresponding` | Corresponding | equivalence |
| Renew          | `renew`         | Original      | equivalence |
| Director's Cut | `directors_cut` | Original      | equivalence |
| Extended       | `extended`      | Original      | equivalence |
| Side Story     | `side_story`    | Parent Story  | branch      |
| Spin-off       | `spin_off`      | Main Story    | branch      |
| Setting        | `setting`       | Main Story    | branch      |
| Adaptation     | `adaptation`    | Source        | derivation  |

Families group the rows on the admin page and on each detail page's Related
Entries card: `timeline`, `equivalence`, `branch`, `derivation`.

Only `alternative` and `corresponding` are symmetric. Every other kind is
directional, and the label shown always describes the entry at the *far* end of
the link.

`Alternative` and `Corresponding` differ by how far the work moved. An
alternative is *essentially* the same entry — a dub, a re-release, the same
story told again. A corresponding entry is *fundamentally* the same story told
differently: the Fate/stay night routes, where Unlimited Blade Works and
Heaven's Feel cover one war from another perspective. Neither is the origin of
the other, so three routes are three peer rows rather than a hub.

Both are also **transitive**: with `A-corresponding-B` and `B-corresponding-C`
stored, A, B and C all correspond to each other.

Chains cross the two kinds, and a chain is only as strong as its **weakest
link**. `A-alternative-B` with `B-corresponding-C` makes A and C
*corresponding*, never alternative — the Corresponding hop cannot carry the
stronger claim that A and C are essentially the same work. Alternative is the
stronger of the two, and where more than one route reaches an entry the
strongest one it can support is the one reported. Taking the weakest link
rather than, say, the first hop is also what makes the pair read the same from
both ends.

The closure is expanded on the **media entry page only**. `GET /for-entry`
returns the inferred rows with `derived: true`, a null `system_id` and a `via`
naming the neighbour the chain arrived through; the card renders that as
"· via <name>". `GET /graph` keeps returning stored rows alone, so the
relations canvas stays a few lines rather than a mesh of n(n-1)/2 saying one
thing.

---

## Size Groups

The vocabulary of `franchise.size_group_derived` / `size_group_manual` /
`series.size_group_derived` / `size_group_manual` (bucket keys) and of
`plan_next.scope` (planning scopes), defined in
`app/utils/plan_next_kinds.py` and served at `GET /api/plan-next/kinds`, so the
admin dropdowns and the Plan page tabs keep no second copy. Mirrored for the
frontend in `frontend/src/config/planNextGroups.js`.

A bucket is a standing property of a franchise or series — "2 Seasons" whether
or not anything is currently queued — not a property of a `plan_next` row. See
business-logic.md for how a bucket is derived and how an entry inherits one.

**Scopes** (`plan_next.scope`): `entry`, `series`, `franchise`.

**Plan Kind** (`plan_next.kind`): `next` | `rewatch`. `plan_next` holds two
independent Plan-page queues distinguished by this column — "Watch Next" (what
is queued to watch or read) and "To Rewatch" (what is marked to watch or read
again). A row's scope permissions depend on **both** its kind and its media
type: `ALLOWED_SCOPES` in `app/utils/plan_next_kinds.py` is keyed by kind
first, then media type, because which tiers a type may be planned at is not
the same question as which tiers it may be rewatched at — anime and cartoon
are queued one season/entry at a time but rewatched as a whole franchise, and
novels are reread at every tier though only ever queued one book at a time.

**Scope permissions — kind `next` ("Watch Next").** Entry is universal; the
two grouping tiers are opt-in because anime movies, manga and novels are
tracked one entry at a time, and comic has no franchise-level planning:

| Media type    | Entry | Series | Franchise |
| ------------- | :---: | :----: | :-------: |
| `anime`       | yes   | yes    | yes       |
| `movie`       | yes   | yes    | yes       |
| `tv-show`     | yes   | yes    | yes       |
| `cartoon`     | yes   | yes    | yes       |
| `comic`       | yes   | yes    | —         |
| `anime-movie` | yes   | —      | —         |
| `manga`       | yes   | —      | —         |
| `novel`       | yes   | —      | —         |

**Scope permissions — kind `rewatch` ("To Rewatch" / "To Reread").** Deliberately
different from the `next` map above: anime and cartoon are rewatched at
franchise scope only (they have **no** entry-level rewatch field at all), and
novel gains series and franchise scope that it does not have for `next`.
Franchise and series have no schema field for this — group-level marks are
read and written directly through `/api/plan-next/` with `scope=franchise` /
`scope=series`, not through an entry-style boolean:

| Media type    | Entry | Series | Franchise |
| ------------- | :---: | :----: | :-------: |
| `anime`       | —     | —      | yes       |
| `movie`       | yes   | yes    | yes       |
| `tv-show`     | yes   | yes    | yes       |
| `cartoon`     | —     | —      | yes       |
| `comic`       | yes   | yes    | —         |
| `anime-movie` | yes   | —      | —         |
| `manga`       | yes   | —      | —         |
| `novel`       | yes   | yes    | yes       |

The six entry-level `yes` cells above (`anime-movie`, `movie`, `tv-show`,
`manga`, `novel`, `comic`) are backed by virtual `to_rewatch` (movie types) /
`to_reread` (reading types) API fields over `plan_next`; see
database-schema.md. `anime` and `cartoon` have no such field — they are
rewatched at franchise scope only.

**Bucket vocabularies.** Keys are hyphenated media types, matching
`app/utils/media_resolver.py`. `anime-movie`, `manga` and `novel` have **no**
vocabulary — entry scope only, so no bucket ever applies to them.

| Media type          | Key            | Label          |
| ------------------- | -------------- | -------------- |
| `anime`              | `12ep`         | 12 EP          |
| `anime`              | `24ep`         | 24 EP          |
| `anime`              | `30ep_plus`    | 30+ EP         |
| `tv-show`, `cartoon` | `1season`      | 1 Season       |
| `tv-show`, `cartoon` | `2season`      | 2 Seasons      |
| `tv-show`, `cartoon` | `3season_plus` | 3+ Seasons     |
| `movie`              | `standalone`   | Standalone     |
| `movie`              | `2_3movies`    | 2-3 Movies     |
| `movie`              | `4movies_plus` | 4+ Movies      |
| `comic`              | `1_3`          | 1-3 Issues     |
| `comic`              | `4_10`         | 4-10 Issues    |
| `comic`              | `11_plus`      | 11+ Issues     |

The `anime` vocabulary existed before this table (as the now-removed
`franchise.watch_next_group` string) but was hardcoded across three frontend
files and undocumented; all four vocabularies now live in one backend module
and one frontend module, and here.

---

## Note Section Kinds

Field: `note.kind` — Default: `null`

A dropdown only where the section declares one. `kinds` is a property of the
section in `app/utils/note_sections.py`, and the API rejects a value the
section does not list, so this vocabulary is enforced rather than advisory.

### `op_ed_changes` (OP/ED 變動)

Anime, TV Show and Cartoon. Which OP/ED a given episode did something unusual with.

| Value     | Default | Notes                          |
| --------- | ------- | ------------------------------ |
| `變化OP`  |         | The OP changed for this episode |
| `變化ED`  |         | The ED changed for this episode |
| `無OP`    |         | No OP this episode              |
| `無ED`    |         | No ED this episode              |
| `特殊OP`  |         | A one-off special OP            |
| `特殊ED`  |         | A one-off special ED            |

### `op` / `ed` / `ost` (音樂 Music)

Anime only. Which cut of a theme song a row is about. The one dropdown with a
default: a new row starts on `normal`, so the type alone never makes a row
worth storing — it needs a name, a status, a link or a remark as well.

`insert_songs` deliberately has **no** type: an insert song is whatever cut
plays in that episode, so "which version" has no answer separate from the
episode itself.

| Value                   | Default | Notes                                    |
| ----------------------- | ------- | ----------------------------------------- |
| `normal`                | Yes     | The standard version                     |
| `different version`     |         | A reworked cut of the same song          |
| `all inclusive version` |         | The full version covering every variant  |

### `highlights` / `highlight_episodes` (神回/神片段)

Anime (`highlights`), plus TV Show and Cartoon (`highlight_episodes`). The
stored data distinguishes a great episode from a great moment inside one and a
great arc across several, so these sections carry a dropdown.

| Value    | Default | Notes                                  |
| -------- | ------- | --------------------------------------- |
| `神回`   |         | A standout single episode              |
| `神片段` |         | A standout moment within an episode     |
| `神篇章` |         | A standout arc spanning several episodes |

Manga also uses `highlight_episodes`, but with **no** dropdown: its highlights
are always 神回, which is why the section is labelled that on manga. `novel`'s
`highlight_passages` has no kind either.

### Retired: `回顧` and `其他`

The old `特殊變動` list mixed several unrelated ideas under one "type" field.
The notes restructure split it into `op_ed_changes` and `extended_episodes`
(加長). `回顧` (recap) and `其他` (other) belong to neither, so they are **not**
in either vocabulary and cannot be entered.

They were not silently dropped: the `note_backfill_rows` migration logs every
row carrying one, with its owner id and content, and leaves it for manual
placement.

---

## Became Entities (Tier 3)

These old `system_options` categories named a person or a studio and are now
rows in the `person` / `studio` tables instead — see `docs/database-schema.md`
for `person`, `person_role`, `studio` and `media_credit`, and
`docs/api.md` for `/api/person` and `/api/studio`.

| Old category(ies)                                       | New home                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Studio`                                                   | `studio` rows, credited via `media_credit` role `studio`                    |
| `Director`                                                 | `person` rows holding `person_role` `director` (scoped `anime` / `non_anime`) |
| `Producer`                                                  | `person` rows holding `person_role` `producer`                              |
| `Music / Composer`                                          | `person` rows holding `person_role` `composer`                              |
| `Manga Author`                                              | `person` rows holding `person_role` `manga_author` — two credit roles (`manga_author_plot` 原作, `manga_author_draw` 作画) can both imply it |
| `Novel Author`                                              | `person` rows holding `person_role` `novel_author`                          |
| `Novel Illustrator`                                         | `person` rows holding `person_role` `novel_illustrator`                     |
| `Comic Writer`                                              | `person` rows holding `person_role` `comic_writer`                          |
| `Comic Artist`                                              | `person` rows holding `person_role` `comic_artist`                          |

**No role extension tables were built.** With `gender` living on the `person`
base table (a fact about the person, not the role), no role has a column of
its own today. If a role later earns several columns genuinely meaningless
elsewhere (e.g. seiyuu gaining an agency and a debut year), a
`person_seiyuu`-style extension table is added then.

**`character` and `character_voice` were designed but not built** — see
[Tier 3](#tier-3--entities-person-studio) above.

---

## Franchise — Special Entries

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

## Franchise for Filter — Example Values

Seed values for the merged Tier 2 `Franchise for Filter` vocabulary (see
[The Three Tiers](#the-three-tiers)), which replaces the old separate `Movie
Franchise for Filter` / TV show equivalent lists below. As before, nothing in
`fieldMeta.js` currently reads this category — it is filter-only and has no
Add/Modify form field.

### Movie (`scope=movie`)

| 獨立電影 / 影集 |
| Disney |
| Marvel |
| Christopher Nolan |

### TV Show (`scope=tv-show`)

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
| `release_date`     |                                               |
| `release_season`   |                                               |
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
| `release_date`         |       |
| `end_date`             |       |
| `mal_rating`           |       |
| `mal_rank`             |       |
| `cover_image_file`     |       |

### Novel

| Field                  | Notes                                           |
| ---------------------- | ----------------------------------------------- |
| `serialization_status` |                                                 |
| `release_date`         |                                                 |
| `end_date`             |                                                 |
| `mal_rating`           |                                                 |
| `mal_rank`             |                                                 |
| `vol_total_original`   | Skipped if `serialization_status` is not `完結` |
| `ch_total`             | Skipped if `serialization_status` is not `完結` |
| `cover_image_file`     |                                                 |

---

## `content_label` is not a fourth tier

`content_label` looks like a Tier 2 open vocabulary — admin-managed rows, a key
and a display label — and it is deliberately a separate table rather than a
`system_option` category.

`system_option` values describe a work. `content_label` values decide **who may
see** one. Two consequences follow:

- The Fill and backfill pipelines write `system_option` and `media_tag`. If
  access control lived there, a pipeline run could silently change who can see
  an entry, and a tag cleanup could open one up.
- Renaming a `system_option` value is a content edit. Renaming a
  `content_label` key would void every `label.<key>` grant that names it, which
  is why `PATCH /api/content-labels/{id}` deliberately does not accept `key`.

The permission a label produces (`label.<key>`) is the one *dynamic* member of
the permission catalog — see `docs/database-schema.md`. Everything else in that
catalog is a Python constant, for exactly the reason this document gives for
Tier 1.
