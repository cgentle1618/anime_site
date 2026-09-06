# Games as a media type — design

Status: draft, awaiting review
Date: 2026-09-06
Branch: modify

## Why

**Games are the first media type that is neither watched nor read.** Every one
of the eight existing types stores `watching_status` or `reading_status`, and
the frontend mirrors that as `statusType: "watch" | "read"`. A game is played.
That third axis is the single most cross-cutting thing this change introduces,
and it is deliberate: calling a game "Might Watch" would be the kind of small
lie the rest of the schema has consistently refused to tell.

**The unit of a game collection is a purchasable, not a work.** A base game and
its DLC are bought separately, played separately, and finished separately. One
entry per purchasable is the shape that matches how the collection is actually
acquired — and it is why a game needs a parent link that no other media type
has.

**Progress is not a count.** There are no episodes, chapters or issues. What
exists for every game regardless of genre is hours, and what exists for the ones
worth finishing is a notion of *how deeply* they were finished. Neither fits the
`x_fin` / `x_total` pattern the other seven types share.

**Ownership is per-storefront.** The same game can be owned on Steam, wishlisted
on the eShop, and available through a subscription — three different answers to
"do I have this" for one entry. No existing table records that.

**A game's publisher needs a profile.** `Studio`'s docstring currently rules
publishers out of the entity layer — "they need no profile, so they stay a
single 'Publisher / Distributor TW' vocabulary in `system_option`". Games are
where that stops holding: a publisher is a first-class fact about a game, not a
distribution footnote. See [Decision K](#decision-k--publisher-becomes-an-entity).

## Scope

In scope:

1. A `games` table as the ninth media type, with `game_type` and a
   self-referencing `base_game_id` so a DLC points at its base game.
2. `PlayStatus` as a third status vocabulary, and `statusType: "play"` threaded
   through the frontend helpers that today branch on watch/read.
3. Completion modelled on three independent axes: a `completion_level` ladder,
   an `all_endings` flag, and an achievement count pair.
4. A `game_copy` child table: one row per copy owned, carrying storefront,
   ownership, format, acquisition, price paid and date.
5. A **`publisher` entity** — table, router, library page, detail page and admin
   Add/Modify/Delete forms — plus a `publisher` credit role, used by games now.
6. An IGDB integration (Twitch client-credentials OAuth) with Fill and Replace
   pipelines, including `parent_game` → `base_game_id` resolution for DLC and
   `involved_companies` → studio and publisher credits.
7. Credit and tag registry changes: `studio` widened to game (a game's developer
   *is* its studio), `director` and `composer` widened, four new tag fields, and
   the existing `label` tag field widened.
8. A **`system_option_alias`** table — the third sibling of `system_option_scope`
   and `system_option_usage` — so IGDB's English vocabulary resolves to Chinese
   option values, plus a seeded, `game`-scoped Chinese vocabulary for genre,
   theme, mode and combat mode.
9. `remake` and `remaster` relation kinds.
10. A new `SHAPE_NAME_ENTRIES` note shape plus game-specific note sections.
11. Google Sheets backup/restore for `games`, `game_copy`, `publisher` and
    `system_option_alias`.
12. The full frontend surface for games: library, detail, add/modify/delete,
    plan, statistics, search and nav.

Out of scope, deliberately:

- **Migrating the existing `publisher_tw` tag rows** on anime, manga, novel and
  comic into the new `publisher` entity. The entity is built here and used by
  games; the four existing media types keep their `publisher_tw` tag until a
  later spec migrates them. See [Deferred work](#deferred-work).
- **Steam Web API playtime sync and owned-library seeding.** The columns
  (`steam_appid`, `steam_link`) are reserved by this change so the follow-up
  needs no migration, but no Steam code ships here.
- **A play-order system** parallel to the watch-order system. Games get
  `media_relation` (which covers remakes and remasters) but no ordered lists.
  There is deliberately no `play_order` column: adding one now would prejudge a
  system we have not designed.
- **Character casting.** Games get `media_credit` and `media_tag` like every
  other type, but no `character_casting` rows.
  See [Decision F](#decision-f--credits-and-what-igdb-can-actually-fill).
- **IGDB company enrichment** (logo, country, founding date for game studios and
  publishers). Fill creates or links rows by name only; a publisher's `logo_file`
  is uploaded by hand until then.
- **Size buckets** (`SIZE_THRESHOLDS`). Every existing bucket keys off a count;
  a game bucket would key off `hltb_main` hours, which is a different shape.
- **Price history** and **patch history**. `price_current_*` is a snapshot
  overwritten by Fill; `current_patch` is one string.

## Decisions

### Decision A — one `games` table, not two

A DLC is a `games` row with `game_type = "DLC"` and a `base_game_id`, not a row
in a second table.

The Anime / Anime Movie split exists because those are genuinely different
metadata shapes from different sources. A game and its DLC share nearly every
column — platform, storefront, price, playtime, completion, developer — and
differ mainly in *having a parent*. A self-FK inside one table buys the parent
link without a second copy of the router, schema, library, detail page, sheet
tab and pipeline.

It also keeps the cross-table discriminator space small: `MEDIA_TABLES` gains
one key, not two, so notes, quotes, memes, relations, plan-next, tags, credits
and content labels each gain one value rather than a pair.

The payoff shows up again in `game_copy`: because a DLC is a `games` row,
`game_copy.game_id` is a plain foreign key that covers game and DLC purchases
identically, with no `(media_type, entry_id)` pair.

**Not enforced:** that a DLC must have a parent. `base_game_id` stays nullable
because a DLC is often entered before its base game, and a write that fails on
ordering is worse than a link filled in later.

### Decision B — `PlayStatus` is a third vocabulary

```
Might Play · Plan to Play · Play When Released · Active Playing ·
Passive Playing · Paused · Completed · Temp Dropped · Dropped · Won't Play
```

Shaped after `WatchStatus`, including the `Play When Released` rung — the
analogue of `Watch When Airs`, and more load-bearing here than there, because
pre-ordered and wishlisted unreleased titles are a normal state in a
purchase-based collection.

`Completed (解說)` has no games analogue and is omitted.
`COMPLETED_PLAY_STATUSES` is a frozenset holding `Completed` alone, declared
anyway so it matches `COMPLETED_WATCH_STATUSES` / `COMPLETED_READ_STATUSES` and
so a second completed-ish value later is a one-line change.

Plan flags are `play_next` and `to_replay`.

### Decision C — completion is three axes, not one dropdown

An early draft had one `completion_level` with six values. It was three
questions in a trench coat, and the ordering between them was incoherent.

| Field | Type | Values |
|---|---|---|
| `completion_level` | String | `Main Story` · `Main + Extras` · `Post-game` · `Completionist` |
| `all_endings` | Boolean, nullable | true / false / unknown |
| `achievements_earned` / `achievements_total` | Integer | a count |

- **`completion_level` is a genuine ladder** now that the other two are out of
  it, so statistics can sort and bucket on its index.
- **`all_endings` is orthogonal.** Every ending can be seen on a main-story-only
  run of a short visual novel, and missed entirely on a Completionist run of a
  game whose endings are mutually exclusive per save.
- **Achievements are a count, not a rung.** They move independently, they give a
  real percentage bar, and they are the one completion fact a future Steam sync
  can fill automatically. `Completionist` (in-game 100%) and full achievements
  routinely disagree, so collapsing them would lose information.

Speedrun and glitch-based completion categories are deliberately absent.

`completion_level` is independent of `playing_status`: `Active Playing` +
`Main Story` is the legitimate and common state of having rolled credits and
still playing. `mark_game_completed` sets `playing_status = "Completed"` and
leaves all four completion fields alone — only the user knows the depth.

### Decision D — playtime is the progress unit

`hours_played` (Float) is what the tracker and cover rule show. It is the one
number that exists for every game regardless of genre.

Estimates come as three columns matching the three public tiers:
`hltb_main`, `hltb_main_extra`, `hltb_completionist`.

**These are not fetched from HowLongToBeat.** HowLongToBeat publishes no
official API; what circulates is an undocumented internal search endpoint that
community libraries wrap and that breaks when the site changes. IGDB — the API
this design already depends on — exposes a time-to-beat resource whose
*hastily / normally / completely* values are the same three tiers. The numbers
come from IGDB; HowLongToBeat survives only as a link, stored as a
`media_source` reference row.

*Implementation note:* IGDB has renamed this resource between API versions.
Verify the current endpoint name and its units (seconds vs hours) against live
IGDB documentation during implementation rather than trusting the shape
recorded here.

### Decision E — ownership lives in `game_copy`, not `media_source`

An earlier draft put ownership on `media_source`, on the reasoning that "where
can I watch this" and "which storefront do I own this on" are the same question,
and that `media_source.available` is already a per-row tristate meaningful only
on main access rows.

That held while ownership was one field. It stopped holding at six —
`ownership`, `acquired_date`, `copy_format`, `acquisition`, `price_paid`,
`price_currency`. At that size it is not a source, it is a purchase record that
happens to be keyed by storefront, and putting it on a table shared by nine
media types would mean six columns that mean nothing for eight of them.

So `game_copy` is its own table with a real foreign key, and `media_source` is
**unchanged** — no new column on it at all.

Games still use `media_source` for what it is actually for. Its `reference`
rows hold the databases and wikis (Decision I), and its `access` rows hold
*where a game can be played* under a "Where to Play" heading — a Game Pass or
cloud-streaming entitlement is exactly the "can I get at this right now"
question `available` already answers for streaming. What `media_source` does
**not** hold is which copies were bought, for how much, in what format: that is
`game_copy`, and the split is where-can-I-play versus what-do-I-own.

Entry-level ownership is **derived**, not stored: a virtual field that is
`Owned` when any copy row is, filtered in list queries through the registry's
`extra_filters` hook with an `EXISTS` subquery — the same escape hatch
`_anime_airing_season` already uses for a non-equality filter. Nothing to keep
in sync, nothing to drift.

### Decision F — credits, and what IGDB can actually fill

IGDB returns `involved_companies` (a company plus `developer` / `publisher` /
`porting` / `supporting` booleans). It has **no crew or staff data at all** — no
directors, no composers, no writers, and no people endpoint to fetch them from.
The credit design follows that split honestly:

| Role | Target | Change | IGDB fills it? |
|---|---|---|---|
| `studio` | `studio` | widened to `game` | **yes** — `involved_companies.developer` |
| `publisher` | `publisher` | **new role, new target** | **yes** — `involved_companies.publisher` |
| `director` | `person` | widened to `game` | no — hand-entered |
| `composer` | `person` | widened to `game` | no — hand-entered |

**A game's developer is its studio.** No `developer` role is added; `studio`
already targets the `Studio` entity and means exactly this.

`author`, `illustrator`, `producer` and `seiyuu` are **not** extended to games.
Person credits stay to the two that are worth hand-entering.

Character casting is not enabled. `ck_casting_voice_scope` and
`SEIYUU_MEDIA_TYPES` stay as they are. Games would be a plausible future member,
but IGDB will not populate it, so every row would be hand-entered — a large
surface to add to an already large change. Widening it later is a one-line
constraint change plus a `SEIYUU_MEDIA_TYPES` entry.

### Decision G — player type and genre are tags, not columns

Four tag fields, all `media_tag` fields backed by Tier-2 vocabulary categories,
plus one widening:

| Tag field | Category | Values | IGDB fills it? |
|---|---|---|---|
| `game_genre` | Game Genre | RPG, Shooter, Platform, Strategy… | **yes** — `genres` |
| `game_theme` | Game Theme | Fantasy, Horror, Open world, Survival… | **yes** — `themes` |
| `game_mode` | Game Mode | Single-player · Multiplayer · Co-op · Split Screen · MMO | **yes** — `game_modes` |
| `combat_mode` | Combat Mode | PvE · PvP | no — hand-entered |
| `label` | Label (existing) | widened from anime-only to games | no — your own tags |

Multi-value is what makes the awkward cases disappear: Minecraft is
`{Single-player, Multiplayer}` and needs no "Both" value; PvPvE is `{PvE, PvP}`
and needs no compound value.

`game_genre` and `game_theme` are two fields rather than one because IGDB draws
the same line — `genres` is mechanical, `themes` is thematic. Neither is folded
into anime's `genre_main`, whose vocabulary is scoped to anime under Ruling R27;
games get their own fields the way `comic` got its own five.

The stored values are **Chinese**, and IGDB's English is resolved to them at
Fill time — see [Decision L](#decision-l--vocabulary-is-chinese-igdb-english-is-an-alias).

### Decision H — patch is one column

`current_patch` (String, nullable): `"1.6.1"`, `"Update 7"`. What version is
installed, not what changed in it. No history table, no per-patch notes.

### Decision I — display-only links are `media_source` rows

`docs/business-rules.md` already draws this line: a link that is only ever
displayed is a `media_source` row; a link a pipeline fetches on is a column.

- **Columns:** `igdb_id` / `igdb_link` (Fill fetches on these),
  `steam_appid` / `steam_link` (reserved; the deferred Steam sync will fetch on
  them).
- **`media_source` reference rows:** SteamDB, Bahamut, HowLongToBeat, official
  site, wiki, fandom.

### Decision J — a new note shape for guides

`note` has `title`, `content` and `links`, where `links` is documented as a list
of URL strings. A game guide is a name plus an ordered run of items, each of
which is *either* a note or a link — a shape none of those columns hold.

`app/utils/note_sections.py` anticipates this case outright: "Adding a section
is one entry and no migration. Adding a new *shape* is rare and costs one
nullable column on `note`."

So: **`SHAPE_NAME_ENTRIES`**, using `title` plus a new nullable JSONB column
`note.entries`:

```json
[
  {"type": "text", "value": "Bleed build; learn the waterfowl dodge"},
  {"type": "link", "value": "https://...", "label": "Phase 2 timing"},
  {"type": "text", "value": "Second phase heals off your hits"}
]
```

Order is array order. The rejected alternative was widening `links` to hold
these richer objects: no migration, but `links` would then mean plain URL
strings in seven sections and objects in two, and every reader — schema layer,
sheet formatter, three frontend renderers — would have to know which. One
nullable column is the cheaper mistake.

### Decision K — publisher becomes an entity

`Studio`'s docstring states the current ruling plainly: *"Publishers and
distributors are deliberately NOT here — they need no profile, so they stay a
single 'Publisher / Distributor TW' vocabulary in `system_option`."* Today
`publisher_tw` is a `TAG_FIELDS` entry over anime, manga, novel and comic, with
no page, logo, facts or detail route.

Games reverse that. A publisher is a first-class fact about a game — it belongs
in the credit layer beside the studio, not in a distribution vocabulary. **That
docstring must be corrected in this change**, not left contradicting the code.

**A separate `publisher` table, not a reuse of `Studio`.** The considered
alternative was a `publisher` credit role pointing at the existing `Studio`
entity, giving one company row per company. Its real advantage is that companies
which both develop and publish — Bandai Namco, Kadokawa, Aniplex — would exist
once rather than twice. Its cost is that the great majority of
publisher/distributor values are Taiwanese distributors (木棉花, 曼迪) that never
developed anything and are not studios in any meaningful sense; putting them on
`/library/studio` would make that page mean something vaguer than it does now.
The duplicate-row cost is accepted, and it is narrow: a handful of companies
will exist as an unlinked `Studio` row and `Publisher` row.

**This widens `CreditRole.target`, and that is not only registry data — it is a
schema change.** `media_credit` today holds two nullable entity FKs guarded by
`CheckConstraint("num_nonnulls(person_id, studio_id) = 1")`
(`app/models/media_credit.py:41`), with the same pair inside `uq_media_credit_row`
(`:54`). A third target therefore requires:

- a `publisher_id` column, FK → `publisher.system_id` `ON DELETE CASCADE`,
  matching `studio_id`'s cascade;
- the CHECK widened to `num_nonnulls(person_id, studio_id, publisher_id) = 1`;
- `publisher_id` added to `uq_media_credit_row`.

The code sites that branch on the axis, each needing a third case:

| Site | Why it breaks |
|---|---|
| `app/services/domain/credits.py:191` | `if spec.target == "studio": … else:` — `else` **means person**, so a publisher role would silently create a `Person` |
| `credits.py:288-290` | reads a credit back as Person-or-Studio |
| `credits.py:662-682`, `:704-706` | batched entity lookup and value building |
| `credits.py:791-801` | `studio_refs` construction — needs a parallel `publisher_refs` |
| `app/services/domain/search.py:240-244` | `_CREDIT_OWNER_COLUMN` map |
| `app/services/domain/checking.py:311` | duplicate-entity check tuple |
| `app/services/rbac/field_groups.py:110`, `field_gate.py:93` | ref-list field gating |
| `app/schemas/link_fields.py:64-65, 79-80` | payload ref lists |
| `app/services/pipelines/pull.py:93` | derived-identity map for sheet restore |
| `tests/unit/test_credit_roles.py:85` | asserts `role.target in ("person", "studio")` — a closed set that must be widened |

`PERSON_ROLES` is derived as `target == "person"` and so keeps its value, but the
reasoning behind it changes: it now excludes two targets rather than one.

This is the second-most cross-cutting part of the change after
`statusType: "play"`.

**One inherited gap to fix rather than copy:** deleting a studio does **not**
call `delete_cover_image` — that cleanup exists only for media entries
(`app/routers/_factory.py:31`, `app/services/calculation.py:278`). `Publisher`
must not inherit the leak; its delete path calls `delete_cover_image`.

**The four existing media types are not migrated here.** `publisher_tw` stays a
tag field on anime, manga, novel and comic until a later spec converts those
rows into `publisher` entities and `media_credit` rows. Games use the entity
from day one; nothing else changes shape. That keeps a data migration over four
live media types out of an already large change.

### Decision L — vocabulary is Chinese, IGDB English is an alias

The values stored in `system_option` and shown in the UI are **Chinese**:
`角色扮演`, not `Role-playing (RPG)`. IGDB's English strings are a wire format,
not vocabulary.

`system_option` has nowhere to keep a foreign name — `category`, `value`,
`sort_order`, `remark` and nothing else — and no genre mapping exists anywhere
in `app/` today. So this is new machinery, and it takes the shape the schema
already has for exactly this kind of side-fact:

| Table | Answers |
|---|---|
| `system_option_scope` | in which media types is this value offered |
| `system_option_usage` | for what is this value used |
| **`system_option_alias`** | **what does an external source call this value** |

All three are the same shape — `option_id` plus one string, unique together —
so a reader who knows the first two understands the third on sight.

Fill resolves `IGDB genre → alias row → option value`. An IGDB value with no
alias row is **logged, not silently dropped**: a new IGDB genre should surface
as a gap to fill in the Options admin page, not vanish. Adding or retranslating
a mapping is a data edit, with no deploy.

The rejected alternative was a Python dict in the IGDB client. The lists are
small (~23 genres, ~22 themes, ~6 modes) and stable, so it would have worked —
but retranslating would need a deploy, and the same table serves the deferred
Steam integration by changing `source`.

**Scope rows are mandatory, not optional.** `SystemOptionScope`'s docstring
says "A value with no scope rows is offered everywhere". Every seeded game
value therefore gets a `scope = "game"` row. Without it 角色扮演 leaks into
anime's genre picker — the exact failure Ruling R27 was written about, where an
unscoped "Disney+" on one TV show hid it from the Cartoon dropdown. This is a
seeding requirement, and it gets a test.

## Data model

### `games`

Model `Game` (`app/models/game.py`), `NameFallbackMixin`, name fallback
CN → EN → Alt → roman → JP.

| Column | Type | Null | Default | Notes |
|---|---|:-:|---|---|
| `system_id` | UUID | no | uuid4 | PK |
| `franchise_id` | UUID FK → `franchise` `SET NULL` | yes | | |
| `series_id` | UUID FK → `series` `SET NULL` | yes | | |
| `game_name_cn` / `_en` / `_roman` / `_jp` / `_alt` | String | yes | | full five; Japanese games need roman/jp |
| `game_type` | String | yes | | `Base Game` · `DLC` · `Expansion` · `Bundle` |
| `base_game_id` | UUID FK → `games.system_id` `SET NULL` | yes | | null on base games |
| `playing_status` | String | **no** | `"Might Play"` | `PlayStatus` |
| `completion_level` | String | yes | | `COMPLETION_LEVELS` |
| `all_endings` | Boolean | yes | | tristate |
| `achievements_earned` / `achievements_total` | Integer | yes | | |
| `release_status` | String | yes | | `Released` · `Early Access` · `Announced` · `Delayed` · `Cancelled` |
| `release_date` | String | yes | | ISO, `ck_games_release_date_iso` |
| `current_patch` | String | yes | | |
| `hours_played` | Float | yes | | |
| `hltb_main` / `hltb_main_extra` / `hltb_completionist` | Float | yes | | hours, from IGDB |
| `price_original_us` / `_jp` / `_tw` | Numeric(10,2) | yes | | MSRP |
| `price_current_us` / `_jp` / `_tw` | Numeric(10,2) | yes | | snapshot, overwritten by Fill |
| `my_rating` | String | yes | | S..F |
| `cover_image_file` | String | yes | | GCS object key, same column and convention as every other entry table; written by `image_manager` |
| `igdb_id` | Integer | yes | | derived from `igdb_link` |
| `igdb_link` | String | yes | | |
| `steam_appid` / `steam_link` | Integer / String | yes | | reserved, unused this change |
| `created_at` / `updated_at` | DateTime | | | |

Constraints:

- `ck_games_release_date_iso` — the ISO regex every other entry table carries.
- `ck_games_base_no_parent` — `game_type <> 'Base Game' OR base_game_id IS NULL`.
- `ck_games_not_self_parent` — `base_game_id IS NULL OR base_game_id <> system_id`.

Virtual / relationship fields: `franchise`, `series`, `base_game`, `dlcs`,
`remark`, `display_name`, `names_dict`, `play_next`, `to_replay`, `ownership`
(derived from `game_copy`), credit/tag link fields, `sources`, `copies`.

Deliberately absent: `is_main_entry`, `play_order`.

### `game_copy`

Model `GameCopy` (`app/models/game_copy.py`). One row per copy owned or wanted.

| Column | Type | Null | Notes |
|---|---|:-:|---|
| `system_id` | UUID | no | PK |
| `game_id` | UUID FK → `games.system_id` `CASCADE` | no | a real FK — see [Decision A](#decision-a--one-games-table-not-two) |
| `storefront` | String | yes | Steam · Nintendo eShop · PSN · Xbox · GOG · Epic · Physical · Other |
| `ownership` | String | yes | `Owned` · `Wishlist` · `Subscription` · `Free` · `Not Owned` |
| `copy_format` | String | yes | `Digital` · `Physical` |
| `acquisition` | String | yes | `Bought` · `Gifted` · `Free` · `Bundled` · `Subscription` |
| `price_paid` | Numeric(10,2) | yes | what was actually paid |
| `price_currency` | String | yes | USD · JPY · TWD … |
| `acquired_date` | String | yes | ISO, same CHECK idiom as `release_date` |
| `remark` | String | yes | |
| `position` | Integer | no | default 0, drag-to-reorder |
| `created_at` | DateTime | | |

`uq_game_copy_row` UNIQUE (`game_id`, `storefront`, `copy_format`) — so one game
can be Digital-on-Steam *and* Physical-on-Switch without collision.
Index `ix_game_copy_game` (`game_id`).

Note the deliberate split: `price_paid` is what *you* paid for *this copy*;
`games.price_original_*` / `price_current_*` are the game's market prices.

### `publisher`

Model `Publisher`, shaped after `Studio` (`app/models/staff.py`) so the two
entities read the same way — same name columns, same fallback, same constraint
idioms.

| Column | Type | Notes |
|---|---|---|
| `system_id` | UUID | PK |
| `name_en` / `name_cn` / `name_jp` / `name_alt` | String | all nullable, at least one required |
| `display_name_field` | String | `"en"` / `"cn"` / `"jp"` / `"alt"`, or NULL for the fallback chain |
| `my_rating` | String | |
| `logo_file` | String | GCS object key, handled by `image_manager` exactly as `studio.logo_file` is. Named `logo_file` rather than `cover_image_file` so the two entity tables agree; `Studio`'s own comment already ties that name to the media tables' convention. |
| `remark` | Text | |
| `founded_date` / `defunct_date` | String | truncated ISO |
| `country` | String | |
| `website_url` | String | |

Constraints mirroring `studio`: `uq_publisher_name` UNIQUE over the four name
columns with `postgresql_nulls_not_distinct=True` (without it the constraint is
inert — the lesson already recorded on `uq_studio_name`), `ck_publisher_has_a_name`
(`num_nonnulls(...) >= 1`), and the two ISO date CHECKs.

### `system_option_alias`

Model `SystemOptionAlias` (`app/models/system.py`), declared beside
`SystemOptionScope` and `SystemOptionUsage` and shaped identically.

| Column | Type | Null | Notes |
|---|---|:-:|---|
| `id` | Integer | no | autoincrement PK, like its two siblings |
| `option_id` | UUID FK → `system_option.system_id` `CASCADE` | no | indexed |
| `source` | String | no | `"igdb"` now; `"steam"` later |
| `value` | String | no | what that source calls it, e.g. `"Role-playing (RPG)"` |

`uq_system_option_alias` UNIQUE (`option_id`, `source`, `value`) — one option may
carry several aliases from one source. Lookup is by (`source`, `value`), so an
index on that pair supports the Fill path.

### `note.entries`

One new nullable JSONB column. See
[Decision J](#decision-j--a-new-note-shape-for-guides).

### Seeded vocabulary

The migration seeds four categories, each value with a `scope = "game"` row and,
where IGDB has a counterpart, one `igdb` alias row:

| Category | Source | Alias rows |
|---|---|---|
| `Game Genre` | IGDB `genres` (~23) | yes |
| `Game Theme` | IGDB `themes` (~22) | yes |
| `Game Mode` | IGDB `game_modes` (~6) | yes |
| `Combat Mode` | PvE · PvP | no — not an IGDB field |

Values are Chinese; the English strings live only in the alias rows.

### Vocabulary (`app/utils/constants.py`)

`PlayStatus`, `COMPLETED_PLAY_STATUSES`, `GAME_TYPES`, `COMPLETION_LEVELS`,
`GAME_RELEASE_STATUSES`, `GAME_STOREFRONTS`, `GAME_OWNERSHIP_KINDS`,
`GAME_COPY_FORMATS`, `GAME_ACQUISITION_KINDS`, plus `FranchiseType.GAME =
"Game"` and `"Game"` appended to the `FRANCHISE_TYPES` tuple.

### Cover images

No new machinery. `app/services/integrations/image_manager.py` stores, checks
and deletes images by `system_id` against GCS (or local storage in dev), and
both new tables use it unchanged:

| Table | Column | Filled by |
|---|---|---|
| `games` | `cover_image_file` | IGDB `cover` at Fill time, or uploaded by hand |
| `publisher` | `logo_file` | uploaded by hand — IGDB company logos are deferred |

Two consequences of a ninth media type that are easy to miss:

- **`franchise.type_covers`** is a per-media-type cover choice held as JSONB, so
  it gains a `game` key with no migration — but the franchise cover picker must
  offer game entries, and `franchise.cover_entry_id` / `series.cover_entry_id`
  are FK-less UUIDs over the entry tables, so their resolution must learn the
  ninth table.
- **Every cover consumer** — `frontend/src/lib/covers.js`, plan-next rows,
  quote and meme rows, relation nodes and graph nodes — resolves
  `cover_image_file` through the media-type maps, so they follow automatically
  once `"game"` is in `MEDIA_TABLES`. `publisher` is an entity, not an entry, so
  it stays outside those paths exactly as `studio` does.

## Notes sections

Free from `ALL_OWNERS`: `remark` (singleton), `advantages`, `disadvantages`,
`double_edged`, `public_reviews`, `personal_reviews`, `analysis`.

Widened to games:

| Section | Change |
|---|---|
| `episode_comments` | Games added to `owners`, with `labels["game"] = "各章評論 Part Reviews"` and `locator_placeholders["game"] = "Chapter / Part, e.g. Ch 3"`. This is the "part review" section; it reuses the existing key rather than adding a near-identical one, following the per-owner override pattern `highlight_episodes` already uses for manga. |

New sections:

| Key | Shape | Label | Notes |
|---|---|---|---|
| `guides` | `name_entries` | 攻略 Guides | Walkthroughs, boss strategies |
| `resources` | `name_entries` + kinds | 資源 Resources | kinds: `Build` · `Mod` · `Tool` |
| `highlight_moments` | `episode_text` + locator | 神場景 Highlights | locator "Chapter / Boss, e.g. Ch 3" |

`guides` and `resources` were three sections in an earlier draft (guides,
builds, mods). Once all three took the same shape, keeping them apart would have
been the drift the registry docstring warns about, so builds and mods collapsed
into `resources` with a kind dropdown. `guides` stays separate because it is
filled for nearly every game.

No music sections.

## Backend wiring

New files: `app/models/game.py`, `app/models/game_copy.py`,
`app/schemas/game.py`, `app/schemas/publisher.py`,
`app/routers/publisher.py`, `app/services/integrations/igdb.py`,
`app/services/domain/game_copies.py` (the `nested_collections` writer, modelled
on `write_novel_units`). `Publisher` joins `Studio` in `app/models/staff.py`.

`MEDIA_REGISTRY["game"]`:

| Field | Value |
|---|---|
| `owner_type` | `"game"` |
| `route` | `"game"` — singular, matching the newer `cartoon` / `manga` / `novel` / `comic` rather than the older `movies` / `tv-shows` |
| `status_field` | `"playing_status"` |
| `list_filters` | `franchise_id`, `series_id`, `playing_status`, `release_status`, `game_type` |
| `search_fields` | the five name columns |
| `hierarchy_names` | the five name columns |
| `mark_completed` | `mark_game_completed` |
| `write_hook` | `execute_replace_single_game` |
| `nested_collections` | `{"copies": write_game_copies, "sources": media_sources_writer("game")}` |
| `extra_filters` | `_game_ownership` (`EXISTS` over `game_copy`) |
| `has_series` | `True` |

Registries touched, each additively:

| File | Change |
|---|---|
| `app/utils/media_resolver.py` | `"game"` in `MEDIA_TABLES`, hence `OWNER_TABLES` |
| `app/utils/constants.py` | the vocabulary above |
| `app/utils/credit_roles.py` | `studio` widened to game; new `publisher` role with `target="publisher"`; `director` and `composer` widened; `CreditRole.target` docstring and every branch on it widened to three values; four new `TAG_FIELDS`; `label` widened |
| `app/utils/plan_next_kinds.py` | `game` in both `ALLOWED_SCOPES` maps (`entry`, `series`, `franchise`); `play_next` / `to_replay` in `PLAN_FLAG_FIELDS`; no `SIZE_THRESHOLDS` entry |
| `app/utils/relation_kinds.py` | `remake`, `remaster` — inverse `"Original"`, equivalence family. Kinds are validated in the API layer, not a DB enum, so **no migration** |
| `app/utils/note_sections.py` | `SHAPE_NAME_ENTRIES`, the three new sections, the `episode_comments` widening |
| `app/models/staff.py` | `Publisher`; the `Studio` docstring's "publishers are deliberately NOT here" paragraph corrected |
| `app/models/system.py` | `SystemOptionAlias`, beside its two siblings, plus the `aliases` relationship on `SystemOption` |
| `app/models/media_credit.py` | `publisher_id` FK; `num_nonnulls(person_id, studio_id, publisher_id) = 1`; `publisher_id` in `uq_media_credit_row` |
| `app/services/domain/credits.py` | the third target case in `replace_credits`, `credit_names`, `_link_rows_and_lookups`, `_values_from_rows`, and `publisher_refs` beside `studio_refs` |
| `app/services/domain/hierarchy.py` | `FRANCHISE_TYPE_FOR["game"] = FranchiseType.GAME` |
| `app/services/pipelines/tabs.py` | `SheetTab("System Option Alias", …)` immediately after System Option Usage (it FKs into `system_option`); `SheetTab("Publisher", …)` beside Studio (before every media tab — credits resolve against it); `SheetTab("Game", …, media_type="game")` after Series; `SheetTab("Game Copy", …)` after it. Restore order is strict and `game_copy` FKs into `games` |
| `app/services/pipelines/specs.py` | Fill / Replace spec for game |
| `app/utils/formatter.py` | `parse_game_from_sheet`, `parse_game_copy_from_sheet`, `parse_publisher_from_sheet`, `parse_system_option_alias_from_sheet` |
| `app/routers/options.py` + the Options admin page | alias rows editable beside scope and usage rows |
| `app/config.py`, `.env.example` | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` |

One Alembic migration covers `games`, `game_copy`, `publisher`,
`system_option_alias`, `note.entries`, the `media_credit.publisher_id` column
with its widened CHECK and unique constraint, and the seeded game vocabulary.

### IGDB integration

Twitch client-credentials OAuth: POST to the Twitch token endpoint with client
id and secret, cache the bearer token until expiry, send it alongside the client
id on every IGDB call. This is the one real difference from the existing
integrations, which all use static keys or a service account — the token
**refreshes**, so the client owns expiry handling. Rate limit is 4 requests per
second.

Fill populates: names, summary, first release date, cover art, `genres` →
`game_genre`, `themes` → `game_theme`, `game_modes` → `game_mode`,
`involved_companies` → `studio` and `publisher` credits (creating or linking
entity rows by name, no logo or facts), the time-to-beat tiers → `hltb_*`, and
`parent_game` → `base_game_id` for DLC. That last one is why IGDB was chosen
over RAWG: it resolves the parent link this design introduced, automatically.

Every tag value goes through `system_option_alias` on the way in — IGDB English
resolves to a Chinese option value, and an unmatched IGDB string is logged as a
gap rather than dropped. See
[Decision L](#decision-l--vocabulary-is-chinese-igdb-english-is-an-alias).

What Fill **cannot** populate, by design of the source: `combat_mode`, `label`,
`director`, `composer`, and every `game_copy` field.

## Frontend

Per the checklist in `docs/frontend/components.md`:

1. `config/mediaRegistry.js` — `game`: `apiEndpoint: "/api/game"`,
   `navPath: "/game"`, `statusField: "playing_status"`, `statusType: "play"`.
2. `config/namingConfigs.js` (cn, en, roman, jp, alt), `mediaTypeColors.js`,
   `statusGroups.js` — a new play group.
3. `pages/library/configs/game.jsx` + registration in `configs/index.js`.
4. `pages/detail/Game.jsx`, `GameNotes.jsx`, two routes in `App.jsx`.
5. `pages/add-tabs/GameAddTab.jsx`, `pages/modify-tabs/GameModifyTab.jsx`,
   entries in `config/adminTabs.js`, `formFactories.js`,
   `formFields/fieldMeta.js`, and the `Add.jsx` / `Modify.jsx` handlers.
6. `Delete.jsx` `MEDIA_KEYS`, `pages/plan/usePlanData.js`,
   `pages/statistics/useStatisticsData.js`, `Index.jsx`, `NavSearch.jsx` scopes
   and quotas, `navigation.js`.

Publisher gets the same entity surface Studio has: `/library/publisher`,
`/publisher/:system_id`, an Entity → Publisher sub-tab on Add / Modify / Delete,
and a picker in the game forms. `info/StudioLinks.jsx` gains a publisher
counterpart (or is generalised over the two targets).

New components:

- **`GameCopiesEditor`** — controlled the way `NovelUnitsEditor` is (the parent
  owns `value`, every change goes through `onChange`). One row per copy:
  storefront, ownership, format, acquisition, price + currency, acquired date,
  remark, drag-to-reorder writing `position`.
- **`NameEntriesEditor`** — the `name_entries` note shape: a title plus an
  ordered list where each item is a text box or a labelled URL, with add /
  remove / reorder and a per-item type toggle.

Tracker block: a **Playtime** row (`32.5 h / ~45 h`, estimate from `hltb_main`)
and, when `achievements_total` is set, an **Achievements** row with a real
percentage bar. Cover rule shows playtime.

Hand-maintained mirrors that must move in the same change or they drift:
`planNextGroups.js` (scopes and kinds) and `fieldOptions.js` (the new
vocabularies).

**The two riskiest threads**, both because they widen an axis the codebase
currently treats as binary:

1. `statusType: "play"` — everything branching on watch vs read (status groups,
   completion helpers, the Plan page's flag pairs, statistics groupings) gains a
   third case.
2. `CreditRole.target` — everything branching on person vs studio gains a third
   case.

Stragglers in both will surface during implementation rather than from reading
the code.

## Testing

Following the project rule that a failing test precedes each behaviour change:

- **Backend:** CRUD for `games` through the factory router; the two CHECK
  constraints; `game_copy` nested-collection writes and the unique constraint;
  the derived `ownership` virtual field and its `extra_filters` query; hierarchy
  auto-creation stamping `FranchiseType.GAME`; `mark_game_completed` leaving the
  completion fields untouched; `publisher` CRUD plus the inert-constraint
  regression that `uq_studio_name` already documents (two rows differing only in
  NULLs must collide); credits resolving against a third target; the `remake` /
  `remaster` relation kinds and their inverses; the new note shape
  round-tripping through schemas; Backup and Pull round-tripping all four new
  tables; IGDB Fill against recorded fixtures, with the OAuth token refresh
  mocked.
- **Vocabulary, specifically:** every seeded game value carries a
  `scope = "game"` row, asserted directly — the leak it prevents is silent and
  would otherwise only show up as 角色扮演 in an anime dropdown; alias lookup
  resolving IGDB English to the Chinese value; and an unmatched IGDB string
  being logged rather than dropped or stored raw.
- **Frontend:** `theme-tokens.test.js` must stay green on the new pages;
  `planNext.test.js` extended to cover the game scopes; library config, form
  factory and the two new editors get component tests.
- `pytest`, `ruff`, `vitest` and `eslint` all green, and
  `cd frontend && npm run build` run so `:8000` matches `:5173`.

## Documentation

Updated in the same change, each with its `Last verified` line bumped:
`docs/entry-types.md` (the capability matrix gains a ninth column),
`docs/data-model.md` (four tables, one column), `docs/options.md` (the new
vocabularies, credit roles, tag fields and the alias table), `docs/systems/`
options coverage, `docs/business-rules.md` (completion
axes, derived ownership), `docs/systems/credits-and-tags.md` (the third credit
target and the publisher entity), `docs/external-apis.md` (IGDB),
`docs/data-actions.md` (the new tabs and pipeline), `docs/api.md`,
`docs/frontend/components.md`, `docs/frontend/pages.md`,
`docs/frontend/admin-pages.md`, `docs/authorization.md` if a field group is
added, and `docs/roadmap.md`.

## Deferred work

Recorded in `docs/roadmap.md` as follow-ups, not built here:

1. **Migrate `publisher_tw` into the `publisher` entity** for anime, manga,
   novel and comic — converting existing `media_tag` rows into `Publisher` rows
   and `media_credit` rows, then retiring the tag field. Its own spec, because
   it touches four media types' live data.
2. **Steam Web API integration** — `GetOwnedGames` (`playtime_forever`, in
   minutes) to fill `hours_played`, `GetPlayerAchievements` to fill the
   achievement pair, and owned-library seeding. Needs `STEAM_API_KEY` and a
   SteamID64, and a public profile. One design question is already known: with
   one entry per game and multi-platform play, a sync must not overwrite
   `hours_played` outright — it needs either a separate `steam_hours` column
   feeding a total, or an explicit "Steam is authoritative for this entry" flag.
   Its vocabulary mapping needs no new machinery: `system_option_alias` rows
   with `source = "steam"`.
3. **Steam Storefront API** (`appdetails`, keyless) for cover art, pricing and
   the DLC list. Undocumented and unversioned, so a supplement to IGDB, never a
   dependency.
4. **IGDB company enrichment** — logos, countries and founding dates for game
   studios and publishers, which Tenrai/MAL cannot supply.
5. **A play-order system** parallel to watch orders.
6. **Size buckets** for games, keyed off `hltb_main` hours.
7. **Character casting for games**, if the manual entry cost ever looks worth it.
