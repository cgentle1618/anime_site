# Options and Vocabularies

Last verified: 2026-09-07

## What this is for

Every dropdown, status, kind and category in the app draws from a fixed list
of values somewhere. This page is the one place that lists them all and says
where each list lives. Lists sit in one of three tiers, chosen by a single
question: **does code branch on the exact value?** If yes, the list is a Python
constant (Tier 1) and an admin cannot rename it. If no, it is a row in
`system_option` (Tier 2) that an admin edits freely. If the "value" is really a
person or a studio with a name, a rating and a photo, it is an entity table
(Tier 3). A final section lists fixed numbers and field lists that are not
vocabularies but are equally hard-coded. Column types and nullability are in
[data-model.md](data-model.md); the rules that consume these values are in
[business-rules.md](business-rules.md). Values below are quoted verbatim from
code.

## Table of contents

- [The three tiers](#the-three-tiers)
- [Tier 1: closed enums in code](#tier-1-closed-enums-in-code)
  - [`app/utils/constants.py`](#apputilsconstantspy)
  - [Novel unit kinds](#novel-unit-kinds-apputilsconstantspy)
  - [Relation kinds](#relation-kinds-apputilsrelation_kindspy)
  - [Note sections](#note-sections-apputilsnote_sectionspy)
  - [Plan-next vocabulary](#plan-next-vocabulary-apputilsplan_next_kindspy)
  - [Credit roles and tag fields](#credit-roles-and-tag-fields-apputilscredit_rolespy)
  - [Watch-order built-ins](#watch-order-built-ins-appservicesdomainwatch_orderpy)
  - [RBAC permissions and field groups](#rbac-permissions-and-field-groups)
  - [Media type and owner keys](#media-type-and-owner-keys-apputilsmedia_resolverpy)
- [Tier 2: system options](#tier-2-system-options)
- [Tier 3: people, studios and publishers](#tier-3-people-studios-and-publishers)
- [Fixed constants](#fixed-constants)
- [Frontend copies of backend vocabulary](#frontend-copies-of-backend-vocabulary)
- [Known discrepancies](#known-discrepancies)

---

## The three tiers

| Tier | Lives in | Who changes it | Read by the frontend via | Examples |
|---|---|---|---|---|
| 1 | Python constants and registries under `app/utils/`, `app/services/domain/`, `app/services/rbac/` | a code change | `GET /api/constants`, `GET /api/media-relation/kinds`, `GET /api/plan-next/kinds`, `/api/auth/me` (permissions) | `"Not Yet Aired"`, `"完結"`, `sequel`, `12ep`, `field_group.credits` |
| 2 | `system_option` + `system_option_scope` tables | an admin, through the Options tab of Add / Modify | `GET /api/options[/{category}]?scope=` | `Genre Main` = `Action`, `Platform` = `Disney+` |
| 3 | `person`, `person_role`, `studio`, linked through `media_credit` | an admin, through `/api/person` and `/api/studio` | the credits endpoints | a director with JP/EN names and a rating |

The reason Tier 1 is code: `"Not Yet Aired"` makes Fill skip `mal_rating`,
`"完結"` gates the novel volume checks, `Completed (解說)` must count as
completed everywhere `Completed` does. If an admin could rename any of these,
the logic would break silently and no migration would notice. Tier 2 values
are only ever read by humans, so renaming one is a content edit and nothing
more. `content_label` looks like Tier 2 but is deliberately its own table,
because its values decide **who may see** an entry rather than describe one;
see [authorization.md](authorization.md).

---

## Tier 1: closed enums in code

### `app/utils/constants.py`

Served by `GET /api/constants` under the key in the last column. Two
`Enum` classes (`FranchiseType`, `AnimeAiringType`) are **not** what the
endpoint serves; the tuples beside them are, because the frontend dropdown
diverged from the Enum long ago and reconciling them is out of scope (the
file's own comment calls this Ruling R10). See
[Known discrepancies](#known-discrepancies).

| Name | Values (in order) | Used by | `/api/constants` key |
|---|---|---|---|
| `WatchStatus` (Enum) | `Might Watch`, `Plan to Watch`, `Watch When Airs`, `Active Watching`, `Passive Watching`, `Paused`, `Completed`, `Completed (解說)`, `Temp Dropped`, `Dropped`, `Won't Watch` | `watching_status` on anime, anime_movies, movies, tv_shows, cartoons | `watching_status` |
| `ReadStatus` (Enum) | `Might Read`, `Plan to Read`, `Active Reading`, `Passive Reading`, `Paused`, `Completed`, `Completed (解說)`, `Temp Dropped`, `Dropped`, `Won't Read` | `reading_status` on manga, novel, comic | `reading_status` |
| `COMPLETED_WATCH_STATUSES` | `{Completed, Completed (解說)}` | completion checks (`Completed (解說)` = finished via a summary/commentary video; counts as completed everywhere) | not served |
| `COMPLETED_READ_STATUSES` | `{Completed, Completed (解說)}` | same, for reading types | not served |
| `PlayStatus` (Enum) | `Might Play`, `Plan to Play`, `Play When Released`, `Active Playing`, `Passive Playing`, `Play Anytime`, `Paused`, `Completed`, `Temp Dropped`, `Dropped`, `Won't Play` | `playing_status` on games. `Play When Released` is `Watch When Airs`'s analogue and more load-bearing here: a pre-ordered or wishlisted unreleased title is an ordinary state in a collection organised by purchasable. `Play Anytime` covers titles with nothing to resume and nothing to finish - sandbox (Minecraft), live-service (Valorant) and roguelike (Slay the Spire) alike, because what differs between those three is the game, not the state | `playing_status` |
| `COMPLETED_PLAY_STATUSES` | `{Completed}` | completion checks for games. One value: there is no games analogue of `Completed (解說)`. Declared anyway so it reads beside its two siblings | not served |
| `AiringStatus` (Enum) | `Not Yet Aired`, `Airing`, `Finished Airing`, `Canceled`, `Rumored` | `airing_status` (business logic compares string literals, the Enum itself is only served) | `airing_status` |
| `AnimeAiringType` (Enum) | `TV`, `ONA`, `OVA`, `OAD`, `Special`, `Movie` | backend-internal only | not served |
| `ANIME_AIRING_TYPES` | `TV`, `Movie`, `ONA`, `OVA`, `OAD`, `Special`, `Other` | `anime.airing_type` dropdown | `anime_airing_type` |
| `CARTOON_AIRING_TYPES` | `TV`, `Movie`, `OVA`, `Special` | `cartoons.airing_type` dropdown (Fill only handles `TV` and `Movie`, see business-rules.md section 17) | `cartoon_airing_type` |
| `FranchiseType` (Enum) | `Anime`, `Movie`, `TV`, `Cartoon`, `Comic`, `ACG`, `Novel`, `Game` | backend-internal only | not served |
| `FRANCHISE_TYPES` | `ACG`, `Anime Movie`, `TV`, `Movie`, `Cartoon`, `Comic`, `Novel`, `Game` | `franchise.franchise_type` dropdown | `franchise_type` |
| `FRANCHISE_EXPECTATIONS` | `Highest`, `High`, `Medium`, `Low` | `franchise.franchise_expectation` | `franchise_expectation` |
| `MY_RATINGS` | `S`, `A+`, `A`, `B`, `C`, `D`, `E`, `F` | `my_rating` on entries, franchise, seasonal, person, studio | `my_rating` |
| `IS_MAIN` | `本傳`, `外傳`, `前傳`, `後傳`, `總集篇` | `is_main` on anime, movies, tv_shows, cartoons, manga, novel (formerly the `Main / Spinoff` system-option category; `comic.is_main_entry` is a Boolean, not this) | `is_main` |
| `MOVIE_TYPES` | `Reality`, `Animation` | movie type | `movie_type` |
| `TV_REGIONS` | `歐美劇`, `韓劇`, `日劇`, `陸劇`, `台劇`, `動畫` | `tv_shows.region` (formerly `Region (TV Show)` option category) | `tv_region` |
| `MANGA_REGIONS` | `日漫`, `韓漫`, `國漫`, `台漫`, `其他` | `manga.region` (formerly `Region (Manga)` option category) | `manga_region` |
| `NOVEL_REGIONS` | `JP`, `CN`, `TW`, `KR`, `Western` | `novel.region` | `novel_region` |
| `NOVEL_TYPES` | `Light Novel`, `Novel`, `Web`, `Other` | `novel.novel_type`; also the Plan page novel grouping | `novel_type` |
| `COMIC_TYPES` | `Ongoing`, `Limited`, `One-Shot`, `Annual` | `comic.comic_type` | `comic_type` |
| `GAME_TYPES` | `Base Game`, `DLC`, `Expansion`, `Bundle` | `games.game_type`; `Base Game` is the value `ck_games_base_no_parent` names | `game_type` |
| `COMPLETION_LEVELS` | `Main Story`, `Main + Extras`, `Post-game`, `Completionist` | `games.completion_level`. A ladder of **content depth only** - every ending seen and achievements earned are separate columns, because they move independently of this | `completion_level` |
| `GAME_RELEASE_STATUSES` | `Rumored`, `Unreleased`, `Early Access`, `Released`, `Ongoing`, `Discontinued`, `Cancelled` | `games.release_status` | `game_release_status` |
| `GAME_STOREFRONTS` | `Steam`, `Nintendo eShop`, `PlayStation Store`, `Xbox Store`, `GOG`, `Epic Games Store`, `Physical`, `Other` | `game_copy.storefront` | `game_storefront` |
| `GAME_OWNERSHIP_KINDS` | `Owned`, `Wishlist`, `Subscription`, `Free`, `Not Owned` | `game_copy.ownership`; also the precedence order `derive_game_ownership` reads | `game_ownership` |
| `GAME_COPY_FORMATS` | `Digital`, `Physical` | `game_copy.copy_format` | `game_copy_format` |
| `GAME_ACQUISITION_KINDS` | `Bought`, `Gifted`, `Free`, `Bundled`, `Subscription` | `game_copy.acquisition` | `game_acquisition` |
| `MANGA_SERIALIZATION_STATUSES` | `連載中`, `停更`, `腰斬`, `完結` | `manga.serialization_status` | `manga_serialization_status` |
| `NOVEL_SERIALIZATION_STATUSES` | `連載中`, `連載中 (不穩定)`, `連載中 (有生之年)`, `停更`, `完結`, `腰斬`, `可能更多`, `未出` | `novel.serialization_status`; `完結` gates the volume/chapter checks | `novel_serialization_status` |
| `WEEKDAYS` | `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday` | `anime.broadcast_day`, `anime.my_watch_day` (plain strings, no validator) | `day_of_week` |
| `MUSIC_STATUSES` | `Need`, `Pending`, `Done` | `note.status` on the `op`, `ed`, `insert_songs`, `ost` sections | `music_status` |
| `SEIYUU_STATUSES` | `Need`, `Done` | `anime.seiyuu` (a to-do status, not a cast list) | `seiyuu_status` |

`anime.seiyuu` and the `seiyuu` **person role** below are unrelated, and the
name collision is worth flagging: `anime.seiyuu` is a `Need`/`Done` to-do flag
with no list of who voices whom. The real seiyuu concept is elsewhere
(`character`,
`character_casting` - see [data-model.md](data-model.md#people-studios-and-links)
and [systems/credits-and-tags.md](systems/credits-and-tags.md)), do not read
one as evidence for the other: an anime can show `seiyuu: Done` while having
zero castings, and vice versa.

**All eight game lists reach `/api/constants`.** `get_constants()`
(`app/routers/constants.py`) returns `playing_status`, `game_type`,
`completion_level`, `game_release_status`, `game_storefront`,
`game_ownership`, `game_copy_format` and `game_acquisition`. The four
`game_copy` vocabularies are prefixed `game_` because the column name alone
(storefront, ownership, acquisition) would not say which table it belongs to
in one flat map. Two derived keys widened automatically when the games backend
landed: `franchise_type` now carries `Game`, and `media_type` carries `game`,
because both are built from lists that grew.

Only `playing_status` is wired into the frontend fallback map, though. It is
the one game list in `CONSTANTS_FALLBACK` in
`frontend/src/config/fieldOptions.js`, so it is the one `applyConstants()`
overwrites from the endpoint; `GAME_TYPES`, `COMPLETION_LEVELS`,
`GAME_RELEASE_STATUSES` and the four `game_copy` arrays are still
hand-maintained literals in that file, kept matching `constants.py` by hand.

`/api/constants` also serves four keys from other modules:
`watch_order_importance` ([below](#watch-order-built-ins-appservicesdomainwatch_orderpy)),
`person_role` and `option_categories`
([below](#credit-roles-and-tag-fields-apputilscredit_rolespy)) and
`media_type` ([below](#media-type-and-owner-keys-apputilsmedia_resolverpy)).

Retired: `Dub Preference` (never existed in code) and the old `Main / Spinoff`,
`Region (TV Show)`, `Region (Manga)` option categories (now `IS_MAIN`,
`TV_REGIONS`, `MANGA_REGIONS`).

### Novel unit kinds (`app/utils/constants.py`)

Not served by `/api/constants` - `novel_unit.unit_kind` and the per-type
offering are hand-maintained in the frontend the way `planNextGroups.js`
mirrors `plan_next_kinds.py` (see
[Frontend copies of backend vocabulary](#frontend-copies-of-backend-vocabulary)).
Tier 1 because code branches on the exact values: which kinds the
`NovelUnitsEditor` offers for a given `novel.type`, and which counter pair
the tracker renders.

| Name | Values | Used by |
|---|---|---|
| `NOVEL_UNIT_KINDS` | `volume`, `arc`, `story`, `chapter` | the closed set every `novel_unit.unit_kind` and `NovelUnitWrite.unit_kind` (Pydantic `Literal`) must be one of; also `ck_novel_unit_kind` |
| `NOVEL_UNIT_KINDS_BY_TYPE` | `Light Novel` -> `(volume,)`; `Novel` -> `(volume,)`; `Web` -> `(arc,)`; `Other` -> `(volume, story, chapter)` | which kinds `NovelUnitsEditor` offers for the novel's `type`; mirrored in `frontend/src/lib/novelUnits.js` as `NOVEL_UNIT_KINDS_BY_TYPE` and pinned to this map by `frontend/src/config/novelUnitKinds.test.js` |
| `NOVEL_UNIT_KEY_PREFIX` | `volume` -> `Vol`, `arc` -> `Arc`, `story` -> `Story`, `chapter` -> `Ch` | the generated display key (`unit_display_key` / `unitDisplayKey`) when a unit has no explicit `unit_key`, e.g. `"Vol 1"` |

Only `arc` rows are authoritative for progress derivation (Decision B in the
design doc): a `volume`, `story` or `chapter` row is display-only enrichment.
See [business-rules.md](business-rules.md) for the rollover and derivation
rules this feeds.

Decision F only relabelled a column, it did not rename it: `novel.vol_total_original`
keeps its column name, but its form label (`fieldMeta.js`,
`NovelAddTab.jsx`/`NovelModifyTab.jsx`) reads "Total Volumes (JP/KR)" to make
the JP/KR-vs-TW pairing with `vol_total_tw` ("Total Volumes (TW)") explicit.

### Relation kinds (`app/utils/relation_kinds.py`)

The vocabulary of `media_relation.relation_type`, served at
`GET /api/media-relation/kinds`. Twelve stored kinds; `prequel` is accepted on
write (`INPUT_ONLY_KINDS = {"prequel": "sequel"}`) and stored as a `sequel`
row with the endpoints swapped. How chains and inverses are read is in
[business-rules.md section 13](business-rules.md#13-media-relations-media_relationpy-apputilsrelation_kindspy)
and [systems/relations.md](systems/relations.md).

`RELATION_FAMILIES`: `timeline`, `equivalence`, `branch`, `derivation`.

`remake` and `remaster` arrived with games (a remake rebuilds the work, a
remaster reissues it) and share `renew`'s inverse label, `Original`. Neither
is media-type-scoped - relation kinds never are - so both are offered on
every type.

| Key | Label | Inverse label | Family | Symmetric | Transitive |
|---|---|---|---|:-:|:-:|
| `sequel` | Sequel | Prequel | `timeline` | | |
| `alternative` | Alternative | Alternative | `equivalence` | yes | yes |
| `corresponding` | Corresponding | Corresponding | `equivalence` | yes | yes |
| `renew` | Renew | Original | `equivalence` | | |
| `directors_cut` | Director's Cut | Original | `equivalence` | | |
| `extended` | Extended | Original | `equivalence` | | |
| `remake` | Remake | Original | `equivalence` | | |
| `remaster` | Remaster | Original | `equivalence` | | |
| `side_story` | Side Story | Parent Story | `branch` | | |
| `spin_off` | Spin-off | Main Story | `branch` | | |
| `setting` | Setting | Main Story | `branch` | | |
| `adaptation` | Adaptation | Source | `derivation` | | |

### Note sections (`app/utils/note_sections.py`)

The registry of what a `note` row may be. Full behaviour is in
[systems/notes.md](systems/notes.md); this lists only the vocabularies.

**Shapes**: `text`, `text_links`, `text_or_link`, `episode_text`,
`name_links`, `name_entries`, `episode_name_links`, `music_track` (the eight
`STORED_SHAPES`) plus `external` (quotes and memes, which live in their own
tables). `name_entries` is the newest: a title plus one ordered `entries`
array whose items are each a line of text or a labelled link. `name_links`
can only hold URLs and `text_links` has no title, so neither could say
"here is my Malenia plan: two notes and a video".

**Groups** (`NOTE_GROUPS`, the collapsible cards):

| Key | Label |
|---|---|
| `reviews` | 評論 Reviews and Comments |
| `analysis_group` | 解析 Analysis and Cinematography |
| `music` | 音樂 Music |
| `quotes_memes` | 名言/梗 Quotes and Memes |

**Sections** (`NOTE_SECTIONS`, in display order). "All" means every media
type plus `series`, `franchise`, `collection`; "Entries" means the nine
media types only.

| Key | Shape | Label | Owners | Group | Kinds / statuses |
|---|---|---|---|---|---|
| `remark` | text | 備註 Remark | All | | singleton |
| `advantages` | text | 優點 Advantages | All | reviews | |
| `disadvantages` | text | 缺點 Disadvantages | All | reviews | |
| `double_edged` | text | 優缺點 | All | reviews | |
| `public_reviews` | text_or_link | 大眾評價 Public Reviews | All | reviews | |
| `personal_reviews` | text | 我的評價 Personal Reviews | All | reviews | gated by field group `personal_notes` |
| `episode_comments` | text_links | 各集評論 Episode Comments (game: 各章評論 Part Reviews) | anime, tv-show, cartoon, game | reviews | locator required; game's placeholder is "Chapter / Part" |
| `highlights` | episode_text | 神回/神片段 Highlights | anime | | kinds `HIGHLIGHT_KINDS` |
| `highlight_episodes` | episode_text | 神回/神片段 (manga: 神回) | tv-show, cartoon, manga | | kinds `HIGHLIGHT_KINDS` for tv-show and cartoon only |
| `highlight_passages` | text | 神片段 | novel | | |
| `highlight_moments` | episode_text | 神場景 Highlights | game | | locator required, placeholder "Chapter / Boss" |
| `guides` | name_entries | 攻略 Guides | game | | |
| `builds_and_mods` | name_entries | 配裝/模組 Builds & Mods | game | | kinds `Build`, `Mod`, `Tool` |
| `analysis` | text_links | 解析 Analysis | All | analysis_group | |
| `cinematography` | text_links | 分鏡/演出/巧思 | anime, anime-movie, tv-show, cartoon, manga, series | analysis_group | |
| `craft` | text_links | 巧思 | novel | analysis_group | |
| `foreshadowing` | text_links | Foreshadowing | anime, anime-movie, tv-show, cartoon, manga, novel, series, franchise | analysis_group | |
| `symmetry` | text_links | 對稱 Symmetry | same as foreshadowing | analysis_group | |
| `op` | music_track | OP | anime | music | kinds `MUSIC_TYPES`, default `normal`; statuses `MUSIC_STATUSES` |
| `ed` | music_track | ED | anime | music | same as `op` |
| `insert_songs` | episode_name_links | 插入曲 Insert Song | anime | music | statuses `MUSIC_STATUSES`; no kinds |
| `ost` | music_track | OST | anime | music | same as `op` |
| `op_ed_changes` | episode_text | OP/ED 變動 | anime, tv-show, cartoon | music | kinds `OP_ED_KINDS` |
| `extended_episodes` | episode_text | 加長 | anime, tv-show, cartoon | | |
| `adaptation` | text_links | 改編 Adaptation | anime, anime-movie, tv-show, cartoon, novel, series, franchise | | description required on anime, anime-movie, novel |
| `resources` | name_links | Resources | All | standalone | |
| `questions` | episode_text | Questions | All | standalone | description required everywhere |
| `quotes` | external | 名言 Quotes | Entries | quotes_memes | |
| `memes` | external | 梗/迷因 Memes | All | quotes_memes | |

Kind vocabularies:

| Constant | Values |
|---|---|
| `OP_ED_KINDS` | `變化OP`, `變化ED`, `無OP`, `無ED`, `特殊OP`, `特殊ED` |
| `MUSIC_TYPES` | `normal`, `different version`, `all inclusive version` |
| `MUSIC_STATUSES` | `Need`, `Pending`, `Done` (same values as `constants.MUSIC_STATUSES`) |
| `HIGHLIGHT_KINDS` | `神回`, `神片段`, `神篇章` |

**`builds_and_mods` is deliberately not called `resources`.** A site-wide
`resources` section already exists (`name_links`, all owners), and games
inherit it for plain bookmarks; reusing the key would have shadowed it, and
a second card also labelled "Resources" would be unreadable - hence a
distinct key *and* a distinct label. Builds, mods and tools are one section
with a `kind` rather than three near-identical ones, because they took the
same shape once guides became `name_entries`; `guides` stays separate
because it is filled for nearly every game and these are not.

The API rejects a kind the section does not list. The old `特殊變動` values
`回顧` and `其他` belong to no section and cannot be entered.

### Plan-next vocabulary (`app/utils/plan_next_kinds.py`)

The vocabulary of `plan_next.kind` / `plan_next.scope` and the size buckets
stored in `franchise.size_group_*` / `series.size_group_*`. Served at
`GET /api/plan-next/kinds` (which the frontend does not call, see
[Frontend copies](#frontend-copies-of-backend-vocabulary)). Thresholds and
derivation are in
[business-rules.md section 7](business-rules.md#7-size-groups-size_grouppy-plan_nextpy-plan_next_kindspy);
the page is in [systems/plan-next.md](systems/plan-next.md).

`KINDS`: `next`, `rewatch`. `SCOPES`: `entry`, `series`, `franchise`.

`ALLOWED_SCOPES`, keyed by kind then media type:

| Media type | `next` | `rewatch` |
|---|---|---|
| `anime` | entry, series, franchise | franchise |
| `anime-movie` | entry | entry |
| `movie` | entry, series, franchise | entry, series, franchise |
| `tv-show` | entry, series, franchise | entry, series, franchise |
| `cartoon` | entry, series, franchise | franchise |
| `manga` | entry | entry |
| `novel` | entry | entry, series, franchise |
| `comic` | entry, series | entry, series |
| `game` | entry, series, franchise | entry, series, franchise |

`PLAN_FLAG_FIELDS` (the virtual API fields that front `plan_next` at entry
scope): `watch_next` on anime, anime-movie, movie, tv-show, cartoon;
`to_rewatch` on anime-movie, movie, tv-show; `read_next` and `to_reread` on
manga, novel, comic; `play_next` and `to_replay` on game. Anime and cartoon
have no entry-level rewatch field.

Naming a field here is only half the wiring: the router factory sets it on
every listed entry, but pydantic drops a field the response schema does not
declare, **silently**. `GameBase` therefore declares `play_next` and
`to_replay` outright, the same failure mode the link-field tripwire
(`tests/unit/test_link_fields_schema.py`) guards against.

`SIZE_GROUPS` (key and label, from `SIZE_THRESHOLDS` and `_LABELS`):

| Media type | Keys |
|---|---|
| `anime` | `12ep` "12 EP", `24ep` "24 EP", `30ep_plus` "30+ EP" |
| `tv-show`, `cartoon` | `1season` "1 Season", `2season` "2 Seasons", `3season_plus` "3+ Seasons" |
| `movie` | `standalone` "Standalone", `2_3movies` "2-3 Movies", `4movies_plus` "4+ Movies" |
| `comic` | `1_3` "1-3 Issues", `4_10` "4-10 Issues", `11_plus` "11+ Issues" |

`anime-movie`, `manga`, `novel` and `game` have no bucket vocabulary. Games
are deliberately unbucketed for now: length is hours, not a count of
episodes or issues, and no threshold was agreed - see
[roadmap.md](roadmap.md#deferred--known-debt).

### Credit roles and tag fields (`app/utils/credit_roles.py`)

`CREDIT_ROLES` is the vocabulary of `media_credit.role`, and since the collapse
it is also the vocabulary of `person_role.role` - one list, not two.

| Key | Label | Target | Media types |
|---|---|---|---|
| `studio` | Studio | studio | anime, anime-movie, game |
| `publisher` | Publisher | publisher | game |
| `director` | Director | person | anime, anime-movie, movie, game |
| `producer` | Producer | person | anime |
| `composer` | Music / Composer | person | anime, game |
| `author` | Author | person | manga, novel, comic |
| `illustrator` | Illustrator | person | manga, novel, comic |
| `seiyuu` | Seiyuu 聲優 | person | anime, anime-movie |

`PERSON_ROLES` (derived, served as `/api/constants` `person_role`): `director`,
`producer`, `composer`, `author`, `illustrator`, `seiyuu` - `CREDIT_ROLES`
filtered to `target == "person"`, which excludes both company keys.

**`target` is a three-value axis**: `"person"`, `"studio"` or `"publisher"`,
the last pointing at the `publisher` table (see
[data-model.md](data-model.md#publisher)) rather than at a `system_option`
vocabulary. Every reader dispatches on all three explicitly - a two-way branch
whose `else` means "person" mints a `Person` row for a publisher credit.

**A game's developer *is* its studio.** `studio` widened to `game` rather
than a new `developer` role: one company that made the work is the same fact
the anime role records, and a separate key would split one studio's anime and
game credits across two vocabularies. `director` and `composer` widened the
same way. `publisher` covers all six types that credit one (anime,
anime-movie, manga, novel, comic, game) for the same reason - see below.

**There is no `publisher_tw` or `comic_publisher` vocabulary.** A publisher is
an entity with a page, not a tag: every such value is a `publisher` credit on
`media_credit`. `publisher` is now the last of the vocabularies that named an outside **company** rather
than a fact about the work; the remaining comic vocabularies (`comic_imprint`,
`comic_continuity`, `comic_era`, `comic_event`) stay tag fields, because an
imprint is arguably a sub-entity of a publisher and the flat `publisher` table
cannot express that.

**One role, six reader-facing words.** `credit_label("publisher", media_type)`
returns 台灣代理商 on anime and anime-movie, 台灣出版商 on manga and novel,
出版商 on comic (a comic's publisher is Marvel - the work's *original*
publisher, not a TW licensor) and 發行商 on game. All six types have an
override, so the role's own `"Publisher"` label is never rendered; it survives
only for admin tooling holding no media type. "Publisher / Distributor" names
the concept in code and never reaches a reader.

**Publishers are scoped, and studios are not.** `publisher_scope`
(see [data-model.md](data-model.md#publisher_scope)) is `person_role`'s idea
without the `role` column: zero rows means offered *nowhere*, and
`resolve_publisher(db, name, scope=)` adds scope rows additively on write. It
exists because a distributor list that offers 木棉花 on a game is wrong in a
way a studio list is not. `system_option_scope`'s opposite rule (zero rows =
everywhere) is what makes the two tables read differently.

`seiyuu` is the one row whose credits are **not** stored in `media_credit`:
`CreditRole` carries a `credited_via` field, `"media_credit"` for the other
five and `"character_casting"` for `seiyuu`, and `credit_roles_for(media_type)`
filters to `credited_via == "media_credit"` so `/api/credits` and the sheet
link-column builder never go looking for seiyuu rows there. A seiyuu still
gets a `person_role` row (so they appear in dropdowns and on
`/library/seiyuu` before their first casting exists), but their actual work is
read through `/api/casting`, keyed off `character_casting` - see
[systems/credits-and-tags.md](systems/credits-and-tags.md).

The reader-facing word is **derived, not stored**:
`credit_label(role, media_type)` reads 原作 / Author / Writer for `author` on
manga / novel / comic and 作畫 / Illustrator / Artist for `illustrator`. One
vocabulary, several words.

**Person scope is not option scope.** Every `person_role` row carries a
NOT NULL media-type scope and a person is offered in the union of their rows;
there is no "offered everywhere" state. A `system_option` with **zero**
`system_option_scope` rows, by contrast, IS offered everywhere. The asymmetry
is deliberate, not an oversight to tidy up: person credits are auto-scoped on
write, so an "everywhere" state would let the first credit silently narrow the
person - exactly the trap Ruling R27 removed from tags, where using an unscoped
"Disney+" on one TV show hid it from the Cartoon dropdown. Option values are
not auto-scoped, so their "everywhere" state is safe. `legal_scopes(role)` says
which media types a role may be scoped to; `GET /api/person/role-scopes` serves
the map to the admin form.

`TAG_FIELDS` is the vocabulary of `media_tag.field`; each field reads one
Tier 2 category:

| Key | Label | Tier 2 category | Media types |
|---|---|---|---|
| `genre_main` | Genre Main | `Genre Main` | anime |
| `genre_sub` | Genre Sub | `Genre Sub` | anime |
| `label` | 標籤 Label | `Label` | anime, game |
| `quality` | Quality 品質 | `Quality` | anime |
| `original_source` | Original Source | `Platform` | tv-show, cartoon, movie |
| `exclusive_source` | Exclusive Source | `Platform` | anime, anime-movie |
| `serialization_platform` | Serialization Platform | `Serialization Platform` | manga, novel |
| `comic_imprint` | Imprint | `Comic Imprint` | comic |
| `comic_continuity` | Continuity | `Comic Continuity` | comic |
| `comic_era` | Era | `Comic Era` | comic |
| `comic_event` | Events | `Comic Event` | comic |
| `game_genre` | Genre | `Game Genre` | game |
| `game_theme` | Theme | `Game Theme` | game |
| `game_mode` | Mode | `Game Mode` | game |
| `combat_mode` | Combat Mode | `Combat Mode` | game |
| `game_platform` | Platform | `Game Platform` | game |

The five game fields mirror IGDB's own four fields plus one that is not an
IGDB field: genre, theme, mode and platform carry `system_option_alias` rows
against source `igdb`, while combat mode (PvE / PvP) is hand-entered and
alias-free. None of the five has a `LEGACY_SHEET_COLUMN` entry - **`LEGACY_SHEET_COLUMN`
has no `game` rows at all**, by design: games never had legacy comma-joined
columns, so every game credit and tag surfaces under its own key, in the API
and in the sheet alike.

`original_source` replaced `source_official` (renamed, not added — same
category rename `Official Source` → `Platform`, since the vocabulary now also
serves `media_source` access rows) and gained `movie` as a third media type
during the media-sources change, which also added `exclusive_source` and
widened `serialization_platform` from a real `manga.serialization_platform`
column (dropped) to a shared `TagField` over `manga` and `novel`. See
[data-model.md](data-model.md#manga) and
[data-model.md](data-model.md#media_source). The RESPONSE attribute for
`original_source` is not always its own key: `tv-show` and `cartoon` kept the
legacy sheet header `source_official` (`LEGACY_SHEET_COLUMN`), while `movie`
(new to the field, so nothing legacy to keep) surfaces it as
`original_source` — see the response-attribute note in
[data-model.md](data-model.md#virtual-fields-on-media-entries).

`TAG_CATEGORIES` (served as `/api/constants` `tag_categories`): `Genre Main`,
`Genre Sub`, `Label`, `Quality` — the subset of the categories below that the
admin Add / Modify / Delete pages offer under their **Tags** sub-tab instead
of **Options**. The split is navigation only: both sub-tabs are the same form
over the same `system_option` rows, and nothing in the data or the API marks
a category as a tag. The list is written out, not derived — these four happen
to be exactly the anime-only tag fields today, but what puts a category here
is that its values read as tags *on* the work, while `Platform` and the
Comic vocabularies name an outside party. A new anime-only category is therefore not automatically a tag.

`FILTER_ONLY_CATEGORIES`: `Franchise for Filter` and `Reference Source` (Tier
2 categories with no `TagField` behind them — `Reference Source` instead
backs `media_source` `kind='reference'` rows directly, resolved by
`option_id` the same way `main`-bucket access rows are, never through
`media_tag`). `OPTION_CATEGORIES` = the categories above plus these two,
served as `/api/constants` `option_categories` and unioned with the
categories present in the stored options to build the category picker on the
Add and Modify pages. Without it a declared category holding no values yet
could not be picked at all, so the first value of a new tag field had nowhere
to go — and since that picker is now closed (`OptionCategorySelect`, no typing
a name in), declaring one here is the only way an admin brings a new category
into existence through the UI. A Pull still writes whatever categories the
sheet holds. Delete's picker unions nothing: it lists the categories that have
rows, because an empty one has nothing to delete.

`LEGACY_SHEET_COLUMN` maps each `(media_type, key)` to the Google
Sheets header it has always used (e.g. `("anime", "composer")` -> `music`,
`("anime", "publisher")` -> `distributor_tw`, `("manga", "publisher")` ->
`publisher_tw`). The five `publisher` pairs replaced the four `publisher_tw`
tag pairs and comic's `comic_publisher` pair when those vocabularies retired,
so every tab kept the header it already had; anime-movie's `distributor_tw` is
the one new column.

### Watch-order built-ins (`app/services/domain/watch_order.py`)

| Name | Values |
|---|---|
| `ITEM_IMPORTANCE` | `Essential`, `Recommended`, `Normal`, `Optional` (served as `/api/constants` `watch_order_importance`) |
| `DEFAULT_IMPORTANCE` | `Normal`; `normalize_importance` coerces anything unrecognised (NULL, a bad Sheets cell) to it |
| `MEDIA_TYPE_MODELS` / `VALID_WATCH_ORDER_MEDIA_TYPES` | the eight hyphenated media types — **`game` is not among them**: this map is hand-written, not derived from `MEDIA_TABLES`, so a game cannot be a watch-order step |
| `_STATUS_FIELDS` | `watching_status` for anime, anime-movie, movie, tv-show, cartoon; `reading_status` for manga, novel, comic |
| `_TOTAL_FIELDS` | `ep_total` (anime, tv-show, cartoon), `ch_total` (manga, novel), `issue_total` (comic); movies and anime movies have none |

Generated release orders have no `watch_order_item` rows, so every step of
one is `Normal`. See [systems/watch-orders.md](systems/watch-orders.md).

### RBAC permissions and field groups

`app/services/rbac/permissions.py` declares the permission vocabulary; only
grants (`role_permission` rows) are stored. A name is `<family>.<key>`, except
the bare `admin`, which implies everything.

| Constant | Value |
|---|---|
| `PERMISSION_FAMILIES` | `media_type`, `field_group`, `label` |
| `media_type.<key>` | one per hyphenated media type key, e.g. `media_type.tv-show` |
| `field_group.<key>` | one per `FIELD_GROUP_KEYS` entry |
| `label.<key>` | one per `content_label.key` row; the only family computed from the database at request time |

`app/services/rbac/field_groups.py` (`FIELD_GROUPS`):

| Key | Label | Gates |
|---|---|---|
| `sources_other` | Other Sources | `media_source` rows with `bucket='other'`, every media type; UI block `info.SourcesCard.other` |
| `sources_restricted` | Restricted Sources | `media_source` rows with `bucket='restricted'`, every media type; UI block `info.SourcesCard.restricted`. Excluded from `default_guest_permissions()` via `GUEST_WITHHELD_FIELD_GROUPS` (`app/services/rbac/seed.py`) — a fresh guest role does not hold it |
| `personal_notes` | Personal Reviews | note section `personal_reviews`; UI block `notes.reviews.personal` |
| `system_info` | System Info | UI block `detail.SystemInfo` only (frontend-only, no column) |
| `credits` | Credits | every credit-kind link field per media type, derived from `CREDIT_ROLES`; also `studio_refs` (types with a `studio` role) and `publisher_refs` (types with a `publisher` role); UI block `info.CreditsCard` |

See [authorization.md](authorization.md) for roles, enforcement and content
labels.

### Media type and owner keys (`app/utils/media_resolver.py`)

`MEDIA_TYPE_KEYS` (hyphenated, stored in `media_relation`, `watch_order_item`,
`plan_next`, `media_credit`, `media_tag`, `system_option_scope`; served as
`/api/constants` `media_type`): `anime`, `anime-movie`, `movie`, `tv-show`,
`cartoon`, `manga`, `novel`, `comic`, `game`. `OWNER_TYPE_KEYS` adds the grouping
tiers `series`, `franchise`, `collection` for note and meme owners.

---

## Tier 2: system options

An open vocabulary: values only humans read. Tables `system_option`,
`system_option_scope`, `system_option_usage` and `system_option_alias` are
described in
[data-model.md](data-model.md#vocabulary-and-configuration); models are in
`app/models/system.py`; the router is `app/routers/options.py`.

**Categories.** The category string is free text on the API
(`SystemOptionCreate.category: str`), but the ones anything reads are the
seventeen in `OPTION_CATEGORIES`:

| Category | Offered in (scopes) | Read by |
|---|---|---|
| `Genre Main` | anime | tag field `genre_main` |
| `Genre Sub` | anime | tag field `genre_sub` |
| `Label` | anime | tag field `label` (標籤: viewing-experience tags such as 會跳OP; seeded with three values by migration `l1a2b3e4l5o6`) |
| `Quality` | anime | tag field `quality` (品質: production-quality tags; ships with no values, an admin adds them through the Options Add page) |
| `Platform` | varies per value | tag fields `original_source` (tv-show, cartoon, movie) and `exclusive_source` (anime, anime-movie), **and** `media_source` `kind='access', bucket='main'` rows on every media type. Renamed from `Official Source` (merged the old `TV Show Official Source` / `Cartoon Official Source`); serves two different questions, split by the `usage` axis below |
| `Reference Source` | varies per value | `media_source` `kind='reference', bucket='main'` rows only — no `TagField`, in `FILTER_ONLY_CATEGORIES`. Gained `SteamDB`, `HowLongToBeat` and `Metacritic` for games, and `Official site` gained a `game` scope; `Wikipedia` and `Fandom wiki` are unscoped and so already reach games |
| `Serialization Platform` | manga, novel | tag field `serialization_platform`; seeded from the old free-text `manga.serialization_platform` column values |
| `Comic Imprint` | comic | tag field `comic_imprint` |
| `Comic Continuity` | comic | tag field `comic_continuity` |
| `Comic Era` | comic | tag field `comic_era` |
| `Comic Event` | comic | tag field `comic_event` |
| `Game Genre` | game | tag field `game_genre`; 23 Chinese values seeded by `g1a2m3e4s5`, each with an IGDB alias |
| `Game Theme` | game | tag field `game_theme`; 20 seeded values, each with an IGDB alias |
| `Game Mode` | game | tag field `game_mode`; 5 seeded values, each with an IGDB alias |
| `Combat Mode` | game | tag field `combat_mode`; `PvE` and `PvP`, seeded **without** aliases - it is not an IGDB field |
| `Game Platform` | game | tag field `game_platform`; `PlayStation`, `Nintendo`, `Xbox`, `PC`, `Mobile`, `Browser` - each folding a whole IGDB console generation in through its aliases. Brand names, so English rather than Chinese |
| `Franchise for Filter` | movie, tv-show | nothing today; filter-only, no form field |

**The game vocabulary is seeded from code, not inline SQL.**
`app/utils/game_vocabulary.py` holds `GAME_VOCABULARY` (the five tag
categories above, Chinese values with their IGDB aliases - `Game Platform`
excepted, whose values are brand names), `GAME_REFERENCE_SOURCES` (`SteamDB`,
`HowLongToBeat`, `Metacritic`) and `GAME_SHARED_REFERENCE_SOURCES`
(`Official site` - a value the seed does not own, which only gains a `game`
scope). **Games seed no `Platform` values at all**: where a game can be
*played* is the `game_platform` tag, and which copy was owned is `game_copy`,
so a game has no `media_source` access row and the Sources editor hides that
group for games. `seed_game_vocabulary`
is called by migration `g1a2m3e4s5` **and** by the test fixtures, which is why
the data lives outside the revision file: the suite builds its schema with
`create_all` and never runs Alembic, so a seed buried in a revision could not
be tested at all. It is idempotent on every row.

**The seed refuses to scope a value it did not create.** A `system_option`
with no scope rows is offered *everywhere*, so adding a `game` scope to an
already-shared unscoped value (`Wikipedia`, `Fandom wiki`) would **narrow**
it to games and silently remove it from every other media type's picker.
`_ensure_scope` therefore returns early for a value it did not create that
carries no scopes. Those values already reach games precisely by being
unscoped.

**The `usage` axis (`system_option_usage`, model `SystemOptionUsage`)**
narrows `Platform` further, orthogonally to scope: scope says *which media
types* a value is offered on, usage says *for what*. A value with no usage
rows serves both; `usage='origin'` values (Fox, ABC, The CW, and the same
growing set of broadcast-only networks for TV and cartoons) are filtered out
of every `media_source` access-row picker but still offered on
`original_source`/`exclusive_source`; `usage='watch'` restricts the reverse
way. `resolve_option`/the options router read it exactly like `scope` — see
[data-model.md](data-model.md#system_option_usage). Round-tripped through the
`System Option Usage` tab — see [data-actions.md](data-actions.md) — so a
`usage` row set on one machine reaches the other via Backup/Pull.

**The `alias` axis (`system_option_alias`, model `SystemOptionAlias`)** is the
third sibling: scope says *which media types*, usage says *for what*, alias
says *what an external source calls it*. Values are stored in Chinese because
that is what the pickers show, so IGDB's English is a wire format resolved on
the way in by `resolve_option_alias(db, category, source, value)` — matched
within one category, since the same English word can name a genre in one
vocabulary and a theme in another. **Absence is not permissive here**: a value
with no alias rows is not "matched by everything", it simply cannot be
resolved from an external string. `source` must be one of `ALIAS_SOURCES` in
`app/utils/source_fields.py` — `igdb` only. The Steam sync that landed
alongside IGDB writes columns only (prices, Metacritic score, playtime,
achievements) with no tags or credits, so it never resolves a vocabulary
value and `ALIAS_SOURCES` gained no `steam` entry for it; validated for the
same reason scopes are, since a typo'd source saves happily and then never
matches. Duplicate `(source, value)` pairs are dropped in the
validator, because the writes insert these rows directly and a repeat would
trip `uq_system_option_alias`. Round-tripped through the `System Option Alias`
tab; carried on `SystemOptionCreate`/`SystemOptionResponse` as `{source,
value}` pairs, which `PUT` replaces wholesale like scopes and usages.

**Only four categories may carry aliases**: `Game Genre`, `Game Theme`,
`Game Mode` and `Game Platform` — exactly the four IGDB fields
`autofill_game_from_igdb` resolves — listed in `ALIAS_CATEGORIES`
(`app/utils/source_fields.py`). An alias on any other category is a 422. The
list is code rather than an admin setting because an alias is only useful where
a pipeline asks for one; opening a category means teaching a pipeline to read
it. Left open, an admin could attach `Shooter` to a `Genre Main` row and watch
it do nothing forever, with nothing to say why.

`Game Platform` is the many-to-one one: its values are brand names, and a whole
console generation folds into each (`PlayStation 4` and `PlayStation 5` both
become `PlayStation`). `game_vocabulary.py` seeds its rows, and they are
editable by hand — a new console generation is exactly the case where waiting
for a code change would be silly. `Combat Mode` is the game category with **no**
aliases: PvE / PvP is a hand-made classification IGDB does not model.

**Deleting a conversion** removes only the external name, never the value it
points at. There is no alias endpoint, so it is a `PUT` of the option without
that row (`optionWithoutAlias` in `frontend/src/components/forms/AliasPicker.jsx`),
matched on the `(source, value)` pair. Once gone, a Fill run meeting that name
logs it as unmatched and skips it.

Aliases are read on **`/aliases`** (Alias Conversion) and edited under
**System → Alias** on Add / Modify. See
[frontend/admin-pages.md](frontend/admin-pages.md).

**How scopes work.** One vocabulary per category; each value carries the
media types it is offered in as `system_option_scope` rows. A value with
**no** scope rows is offered everywhere. Reads filter with
`GET /api/options?scope=cartoon` or `GET /api/options/{category}?scope=cartoon`,
which returns values that are unscoped *or* scoped to that key. Results are
ordered by `category`, `sort_order`, `value`. Scopes must be one of
`MEDIA_TYPE_KEYS` (validated in `app/schemas/system.py`, duplicates dropped).

**Writes.** `POST /api/options/`, `PUT /api/options/{id}`,
`DELETE /api/options/{id}` are admin-only. Add and update reject an exact
`(category, value)` duplicate (`uq_system_option_value`); update replaces the
scope, usage and alias lists wholesale with the ones in the payload; delete logs a tombstone to
`deleted_record` under type `System Options` and cascades to the scope rows.
Admins edit scopes under System → System Option on Add / Modify
(`frontend/src/components/forms/ScopePicker.jsx`, used by `OptionsAddTab.jsx`),
alongside `UsagePicker.jsx` and `AliasPicker.jsx`.

**Scopes are admin data, never derived from usage.** Saving a tag no longer
stamps the entry's media type onto the value: doing so meant using an unscoped
`Disney+` on one TV show silently removed it from the Cartoon dropdown. The
only automated pass that touches scopes is `extract_system_options`
(`app/services/domain/options_extraction.py`), and it is **purely additive**:
it walks every `media_tag`, and for each `(option_id, media_type)` pair with no
scope row it inserts one. It never removes a row, skips tags whose `field` is
not in `TAG_FIELDS` or whose option no longer exists, and reads the existing
pairs once up front so two entries sharing a genre cannot insert a duplicate.
It runs at the end of every `run_sync_<type>` in `app/services/calculation.py`
(so Calculate All calls it seven times) and after credit backfill.

**Retired categories.** `system_option` is a free-text `category` column and
the Options page lists whatever distinct values it holds, so every superseded
vocabulary stayed on screen long after its successor took over. Migration
`o1r2p3h4a5n6` deletes the thirteen that nothing reads: `Distributor TW`,
`Manga Publisher TW` and `Novel Publisher TW` (merged into
`Publisher / Distributor TW`); `TV Official Source` and
`Cartoon Official Source` (merged into `Official Source` — since renamed to
`Platform` by the later media-sources migration `st1a2g3s4`, described
above); and `Director`,
`Studio`, `Manga Author`, `Novel Author`, `Novel Illustrator`, `Comic Writer`,
`Music / Composer` and `Producer`, which are Tier 3 entities now. Three values
existed only in a retired category and were moved first: `bilibili` into
`Publisher / Distributor TW` scoped `anime` (distinct from
`bilibili (GoodShow)`), `FX` into `Official Source` scoped `tv-show` (distinct
from `Fox`), and the studio names `Gonzo`, `Project No.9` and `SANZIGEN`,
which became `studio` rows. Both FKs into `system_option` are
`ON DELETE CASCADE`, so the delete skips any option a `media_tag` still points
at rather than taking entry data with it — the drop list is guarded in
`tests/unit/test_retire_orphan_option_categories.py`, which fails if a live
category is ever named in it.

`Publisher / Distributor TW` and `Comic Publisher` are on the drop list too:
their rows are `publisher` credits now. `bilibili` among them is a `publisher`
entity, seeded with the `anime` scope even though no entry credits it, since a
scope row is cheap and a missing one is invisible.


## Tier 3: people, studios and publishers

Categories that named a person, a studio or a publisher are entity rows, not vocabulary
strings, because a director needs multilingual names, a rating, a photo and
a remark. See [systems/credits-and-tags.md](systems/credits-and-tags.md) for
the full system and [data-model.md](data-model.md#people-studios-and-links)
for the `person`, `person_role`, `studio`, `publisher`, `publisher_scope` and
`media_credit` tables.

Keyed by the LIVE role, with the old categories that folded into it - the same
shape as `TIER3_ROWS` in `frontend/src/pages/admin/SystemOptions.jsx`, whose
comment asks that the two be kept in step. Seven rows: five person roles plus
`studio` and `publisher`.

| Old option categories | New home | Notes |
|---|---|---|
| `Studio` | `studio` | credited via `media_credit` role `studio` |
| `Publisher / Distributor TW` · `Comic Publisher` | `publisher` | credited via `media_credit` role `publisher`, offered per media type through `publisher_scope`. One role, four labels: 台灣代理商 on anime and anime-movie, 台灣出版商 on manga and novel, 出版商 on comic, 發行商 on game |
| `Director` | `person`, role `director` | scoped by media type on `person_role`: anime, anime-movie, movie |
| `Producer` | `person`, role `producer` | scoped anime |
| `Music / Composer` | `person`, role `composer` | scoped anime |
| `Manga Author` · `Novel Author` · `Comic Writer` | `person`, role `author` | one role, three labels: 原作 on a manga, Author on a novel, Writer on a comic |
| `Manga Author` · `Novel Illustrator` · `Comic Artist` | `person`, role `illustrator` | 作畫 on a manga, Illustrator on a novel, Artist on a comic. `Manga Author` covered this half too, before the split |

`person.my_rating`, `studio.my_rating` and `publisher.my_rating` reuse
`MY_RATINGS`, and so does the
new `character.my_rating`. A `character` / `character_voice` shape was once
designed but not built (see the old "Deferred" note this replaced in
[systems/credits-and-tags.md](systems/credits-and-tags.md)); the feature that
was actually built uses different names and a different shape - `character`
and `character_casting` (migration `c1h2a3r4a5c6`) - and diverges from that
old design in three deliberate ways detailed there. `anime.seiyuu` remains a
`Need`/`Done` to-do status, unrelated to the `seiyuu` person role above - see
the note under `SEIYUU_STATUSES` [above](#apputilsconstantspy).

---

## Fixed constants

Numbers and field lists that are hard-coded but are not dropdown vocabularies.

**Fields Fill considers "missing"** (`app/utils/utils.py`; used by the
`has_missing_values_<type>` checks in
[business-rules.md section 5](business-rules.md#5-missing-value-checks-that-drive-fill-checkingpy-utilspy)).
Column fields and link fields are listed separately because credits and tags
are no longer columns.

| Constant | Fields |
|---|---|
| `ANIME_FIELDS_TO_FILL` | `airing_type`, `airing_status`, `release_date`, `release_season`, `mal_rating`, `mal_rank`, `ep_total`, `cover_image_file` (`official_link`/`twitter_link` were dropped columns and are deliberately not listed — Fill writes them as `media_source` reference rows now) |
| `ANIME_MOVIE_FIELDS_TO_FILL` | `airing_status`, `release_date_jp`, `mal_rating`, `mal_rank`, `cover_image_file` (same `official_link`/`twitter_link` exclusion) |
| `MOVIE_FIELDS_TO_FILL` | `length_min`, `airing_status`, `release_date_usa`, `imdb_rating`, `cover_image_file` |
| `MOVIE_LINK_FIELDS_TO_FILL` | `("credit", "director")` |
| `TV_SHOW_FIELDS_TO_FILL` | `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file` |
| `CARTOON_TV_FIELDS_TO_FILL` | `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file` |
| `CARTOON_MOVIE_FIELDS_TO_FILL` | `airing_status`, `release_date`, `imdb_rating`, `cover_image_file` |
| `MANGA_FIELDS_TO_FILL` | `serialization_status`, `release_date`, `end_date`, `mal_rating`, `mal_rank`, `cover_image_file` |
| `NOVEL_FIELDS_TO_FILL` | `serialization_status`, `release_date`, `end_date`, `mal_rating`, `mal_rank`, `cover_image_file` |
| `COMIC_FIELDS_TO_FILL` | `release_date`, `issue_total`, `cover_image_file` |
| `COMIC_LINK_FIELDS_TO_FILL` | `("credit", "author")`, `("credit", "illustrator")`, `("credit", "publisher")` |

`MONTH_MAP` (`JAN` -> `01` ... `DEC` -> `12`) is also in `utils.py` but is
unused (business-rules.md section 17).

**Release-date column priority** (`RELEASE_PRIORITY`, `app/utils/release_date.py`;
first column with a value represents the entry):

| Media type | Columns, in order |
|---|---|
| `anime-movie` | `release_date_jp`, `release_date_tw` |
| `movie` | `release_date_tw`, `release_date_usa` |
| all others | `release_date` |

**Size thresholds** (`SIZE_THRESHOLDS` / `SIZE_MEASURE`, `plan_next_kinds.py`;
upper bound inclusive, `None` = everything above):

| Media type | Measure | Bands |
|---|---|---|
| `anime` | `sum_ep_total` | 12 -> `12ep`, 24 -> `24ep`, None -> `30ep_plus` |
| `tv-show`, `cartoon` | `count` | 1 -> `1season`, 2 -> `2season`, None -> `3season_plus` |
| `movie` | `count` | 1 -> `standalone`, 3 -> `2_3movies`, None -> `4movies_plus` |
| `comic` | `sum_issue_total` | 3 -> `1_3`, 10 -> `4_10`, None -> `11_plus` |

**Weekdays.** `WEEKDAYS` above (Monday-first) is the dropdown list;
`frontend/src/config/weekdays.js` also exports `SCHEDULE_DAYS` (Sunday-first,
so the index matches `Date.prototype.getDay()`) for the dashboard schedule.

**Expectation sort weight.** `EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 }`
exists only in the frontend, defined three times: in
`frontend/src/pages/library/CollectionLibrary.jsx` and
`frontend/src/pages/library/FranchiseLibrary.jsx` (unknown -> 4) and in the
Plan page sort described in [systems/plan-next.md](systems/plan-next.md)
(unknown -> 99). There is no Python equivalent.

**External API rate limits** (sliding-window limiters in
`app/services/integrations/`; details in [external-apis.md](external-apis.md)):

| Service | Limiter | Limit |
|---|---|---|
| Tenrai (MAL) | `TenraiRateLimiter.DEFAULT_LIMITS = ((4, 1), (120, 60))` | 4 requests / 1 s **and** 120 requests / 60 s |
| TMDB | `TMDbRateLimiter(max_requests=40, time_window=10)` | 40 / 10 s |
| OMDb | `OMDbRateLimiter(max_requests=1000, time_window=86400)` | 1000 / day |
| Comic Vine | `ComicVineRateLimiter(max_requests=200, time_window=3600)` | 200 / hour |

**Pipeline pauses** (`app/services/pipelines/specs.py`): `MAL_PAUSE = 1` and
`COMICVINE_PAUSE = 1` seconds, used as `fill_sleep` / `replace_sleep` between
entries in bulk Fill and Replace for the Tenrai-backed types (anime,
anime-movie, manga, novel) and comic.

---

## Frontend copies of backend vocabulary

| Frontend file | What it copies | Kept in sync how |
|---|---|---|
| `frontend/src/config/fieldOptions.js` | every `/api/constants` list (`WATCHING_STATUSES`, `FRANCHISE_TYPES`, `PERSON_ROLES`, `MEDIA_TYPES`, ...) plus `CONSTANTS_FALLBACK` | a pre-fetch **fallback only**. `frontend/src/config/useConstants.js` fetches `/api/constants` once and `applyConstants()` overwrites each array's contents in place, so every Add/Modify `<select>` shows API values after the first paint. `App.jsx` calls the hook at the root to force that re-render. |
| `frontend/src/config/weekdays.js` | `WEEKDAYS` | same in-place overwrite via `day_of_week` |
| `frontend/src/config/planNextGroups.js` | `SIZE_GROUPS`, `ALLOWED_SCOPES`, `KINDS` from `plan_next_kinds.py` | **hand-maintained**; `GET /api/plan-next/kinds` is not called. `planNext.test.js` guards `ALLOWED_SCOPES`/`KINDS` against drift; `SIZE_GROUPS` has no guard. It also adds two frontend-only groupings: manga by `serialization_status` (`完結`, `連載中`, `腰斬`, `停更`, ungrouped label `其他`) and novel by `novel_type` (`Web` relabelled "Web Novel", then `Light Novel`, `Novel`, `Other`). |
| `frontend/src/utils/planNext.js` | `COMIC_BANDS` (a copy of the comic `SIZE_THRESHOLDS`) | hand-maintained |
| `frontend/src/config/statusGroups.js` | `COMPLETED_STATUSES`; `WATCHING_STATUS_GROUP` / `READING_STATUS_GROUP` filter buckets (`Might Watch`/`Might Read`, `Planned`, `Watching`/`Reading`, `Completed`, `Dropped`); `STATUS_PICKER_GROUP` / `groupStatusOptions()` picker groups (`Not Released`, `On-Going`, `Done`) | hand-maintained; both groupings exist only in the frontend. The picker groups are a **display aid only** - `components/ui/StatusOptions.jsx` renders them as `<optgroup>`s in every Add/Modify and detail-page status `<select>`, and nothing filters, sorts or counts by them. A status the map does not know still renders, ungrouped, at the end of the list. |
| `frontend/src/components/tracker/WatchOrderEditor.jsx` | `ITEM_IMPORTANCE` | hand-maintained mirror |
| `fieldOptions.js` extras | `PROGRESS_DISPLAY_OPTIONS` - two entries, `""` (label "— Default (VOL JP/KR) —") and `vol_tw` (label "VOL TW (Taiwan Volumes)"): `novel.type` drives structure, so the only genuine choice left is JP/KR volumes vs TW volumes. A novel holding any other stored value (`ch`, `vol_original`, `arc_ch`) has it appended back by `withLegacyProgressDisplay()` as a selectable "(legacy)" entry rather than silently reverting to the default. Also `RELEASE_SEASONS` (`WIN`, `SPR`, `SUM`, `FAL`), `RELEASE_MONTHS`, `SEASON_NUMS` (1-10), `PART_NUMS` (1-7), `TRISTATE` (`"true"`, `"false"`) | frontend-only vocabularies with no backend list |

Relation kinds and note sections are **not** copied: the frontend fetches
`/api/media-relation/kinds` and the note registry over HTTP.

---

## Known discrepancies

Carried over on purpose; do not "fix" one side without reconciling both.

- **Franchise type.** `FranchiseType` Enum has `Anime` and no `Anime Movie`;
  `FRANCHISE_TYPES` (served, shown in the dropdown) has `Anime Movie` and no
  `Anime`.
- **Anime airing type.** `AnimeAiringType` Enum lacks the trailing `Other`
  that `ANIME_AIRING_TYPES` (served) carries.
- **Cartoon airing type.** The dropdown offers `TV`, `Movie`, `OVA`, `Special`,
  but Fill only fetches `TV` and `Movie` (business-rules.md section 17).
- **`MUSIC_STATUSES`** is defined twice with identical values, in
  `constants.py` and `note_sections.py`.
- **Option categories are free text.** `SystemOptionCreate.category` accepts
  any string and the Options page lists whatever the table holds, so a typo
  creates a category rather than being rejected. `OPTION_CATEGORIES` is what
  the dropdowns read, not what the page shows.
- **`EXPECTATION_WEIGHT`** is defined three times in the frontend with two
  different unknown-value fallbacks (4 vs 99).
