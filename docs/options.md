# Options and Vocabularies

Last verified: 2026-09-03 (commit df14959, plus the uncommitted Tags sub-tab)

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
  - [Relation kinds](#relation-kinds-apputilsrelation_kindspy)
  - [Note sections](#note-sections-apputilsnote_sectionspy)
  - [Plan-next vocabulary](#plan-next-vocabulary-apputilsplan_next_kindspy)
  - [Credit roles and tag fields](#credit-roles-and-tag-fields-apputilscredit_rolespy)
  - [Watch-order built-ins](#watch-order-built-ins-appservicesdomainwatch_orderpy)
  - [RBAC permissions and field groups](#rbac-permissions-and-field-groups)
  - [Media type and owner keys](#media-type-and-owner-keys-apputilsmedia_resolverpy)
- [Tier 2: system options](#tier-2-system-options)
- [Tier 3: people and studios](#tier-3-people-and-studios)
- [Fixed constants](#fixed-constants)
- [Frontend copies of backend vocabulary](#frontend-copies-of-backend-vocabulary)
- [Known discrepancies](#known-discrepancies)

---

## The three tiers

| Tier | Lives in | Who changes it | Read by the frontend via | Examples |
|---|---|---|---|---|
| 1 | Python constants and registries under `app/utils/`, `app/services/domain/`, `app/services/rbac/` | a code change | `GET /api/constants`, `GET /api/media-relation/kinds`, `GET /api/plan-next/kinds`, `/api/auth/me` (permissions) | `"Not Yet Aired"`, `"完結"`, `sequel`, `12ep`, `field_group.credits` |
| 2 | `system_option` + `system_option_scope` tables | an admin, through the Options tab of Add / Modify | `GET /api/options[/{category}]?scope=` | `Genre Main` = `Action`, `Official Source` = `Disney+` |
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
| `AiringStatus` (Enum) | `Not Yet Aired`, `Airing`, `Finished Airing`, `Canceled`, `Rumored` | `airing_status` (business logic compares string literals, the Enum itself is only served) | `airing_status` |
| `AnimeAiringType` (Enum) | `TV`, `ONA`, `OVA`, `OAD`, `Special`, `Movie` | backend-internal only | not served |
| `ANIME_AIRING_TYPES` | `TV`, `Movie`, `ONA`, `OVA`, `OAD`, `Special`, `Other` | `anime.airing_type` dropdown | `anime_airing_type` |
| `CARTOON_AIRING_TYPES` | `TV`, `Movie`, `OVA`, `Special` | `cartoons.airing_type` dropdown (Fill only handles `TV` and `Movie`, see business-rules.md section 17) | `cartoon_airing_type` |
| `FranchiseType` (Enum) | `Anime`, `Movie`, `TV`, `Cartoon`, `Comic`, `ACG`, `Novel` | backend-internal only | not served |
| `FRANCHISE_TYPES` | `ACG`, `Anime Movie`, `TV`, `Movie`, `Cartoon`, `Comic`, `Novel` | `franchise.franchise_type` dropdown | `franchise_type` |
| `FRANCHISE_EXPECTATIONS` | `Highest`, `High`, `Medium`, `Low` | `franchise.franchise_expectation` | `franchise_expectation` |
| `MY_RATINGS` | `S`, `A+`, `A`, `B`, `C`, `D`, `E`, `F` | `my_rating` on entries, franchise, seasonal, person, studio | `my_rating` |
| `IS_MAIN` | `本傳`, `外傳`, `前傳`, `後傳`, `總集篇` | `is_main` on anime, movies, tv_shows, cartoons, manga, novel (formerly the `Main / Spinoff` system-option category; `comic.is_main_entry` is a Boolean, not this) | `is_main` |
| `MOVIE_TYPES` | `Reality`, `Animation` | movie type | `movie_type` |
| `TV_REGIONS` | `歐美劇`, `韓劇`, `日劇`, `陸劇`, `台劇`, `動畫` | `tv_shows.region` (formerly `Region (TV Show)` option category) | `tv_region` |
| `MANGA_REGIONS` | `日漫`, `韓漫`, `國漫`, `台漫`, `其他` | `manga.region` (formerly `Region (Manga)` option category) | `manga_region` |
| `NOVEL_REGIONS` | `JP`, `CN`, `TW`, `KR`, `Western` | `novel.region` | `novel_region` |
| `NOVEL_TYPES` | `Light Novel`, `Novel`, `Web`, `Other` | `novel.novel_type`; also the Plan page novel grouping | `novel_type` |
| `COMIC_TYPES` | `Ongoing`, `Limited`, `One-Shot`, `Annual` | `comic.comic_type` | `comic_type` |
| `MANGA_SERIALIZATION_STATUSES` | `連載中`, `停更`, `腰斬`, `完結` | `manga.serialization_status` | `manga_serialization_status` |
| `NOVEL_SERIALIZATION_STATUSES` | `連載中`, `連載中 (不穩定)`, `連載中 (有生之年)`, `停更`, `完結`, `腰斬`, `可能更多`, `未出` | `novel.serialization_status`; `完結` gates the volume/chapter checks | `novel_serialization_status` |
| `WEEKDAYS` | `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday` | `anime.broadcast_day`, `anime.my_watch_day` (plain strings, no validator) | `day_of_week` |
| `MUSIC_STATUSES` | `Need`, `Pending`, `Done` | `note.status` on the `op`, `ed`, `insert_songs`, `ost` sections | `music_status` |
| `SEIYUU_STATUSES` | `Need`, `Done` | `anime.seiyuu` (a to-do status, not a cast list) | `seiyuu_status` |

`/api/constants` also serves four keys from other modules:
`watch_order_importance` ([below](#watch-order-built-ins-appservicesdomainwatch_orderpy)),
`person_role` and `option_categories`
([below](#credit-roles-and-tag-fields-apputilscredit_rolespy)) and
`media_type` ([below](#media-type-and-owner-keys-apputilsmedia_resolverpy)).

Retired: `Dub Preference` (never existed in code) and the old `Main / Spinoff`,
`Region (TV Show)`, `Region (Manga)` option categories (now `IS_MAIN`,
`TV_REGIONS`, `MANGA_REGIONS`).

### Relation kinds (`app/utils/relation_kinds.py`)

The vocabulary of `media_relation.relation_type`, served at
`GET /api/media-relation/kinds`. Ten stored kinds; `prequel` is accepted on
write (`INPUT_ONLY_KINDS = {"prequel": "sequel"}`) and stored as a `sequel`
row with the endpoints swapped. How chains and inverses are read is in
[business-rules.md section 13](business-rules.md#13-media-relations-media_relationpy-apputilsrelation_kindspy)
and [systems/relations.md](systems/relations.md).

`RELATION_FAMILIES`: `timeline`, `equivalence`, `branch`, `derivation`.

| Key | Label | Inverse label | Family | Symmetric | Transitive |
|---|---|---|---|:-:|:-:|
| `sequel` | Sequel | Prequel | `timeline` | | |
| `alternative` | Alternative | Alternative | `equivalence` | yes | yes |
| `corresponding` | Corresponding | Corresponding | `equivalence` | yes | yes |
| `renew` | Renew | Original | `equivalence` | | |
| `directors_cut` | Director's Cut | Original | `equivalence` | | |
| `extended` | Extended | Original | `equivalence` | | |
| `side_story` | Side Story | Parent Story | `branch` | | |
| `spin_off` | Spin-off | Main Story | `branch` | | |
| `setting` | Setting | Main Story | `branch` | | |
| `adaptation` | Adaptation | Source | `derivation` | | |

### Note sections (`app/utils/note_sections.py`)

The registry of what a `note` row may be. Full behaviour is in
[systems/notes.md](systems/notes.md); this lists only the vocabularies.

**Shapes**: `text`, `text_links`, `text_or_link`, `episode_text`,
`name_links`, `episode_name_links`, `music_track` (the seven `STORED_SHAPES`)
plus `external` (quotes and memes, which live in their own tables).

**Groups** (`NOTE_GROUPS`, the collapsible cards):

| Key | Label |
|---|---|
| `reviews` | 評論 Reviews and Comments |
| `analysis_group` | 解析 Analysis and Cinematography |
| `music` | 音樂 Music |
| `quotes_memes` | 名言/梗 Quotes and Memes |

**Sections** (`NOTE_SECTIONS`, in display order). "All" means every media
type plus `series`, `franchise`, `collection`; "Entries" means the eight
media types only.

| Key | Shape | Label | Owners | Group | Kinds / statuses |
|---|---|---|---|---|---|
| `remark` | text | 備註 Remark | All | | singleton |
| `advantages` | text | 優點 Advantages | All | reviews | |
| `disadvantages` | text | 缺點 Disadvantages | All | reviews | |
| `double_edged` | text | 優缺點 | All | reviews | |
| `public_reviews` | text_or_link | 大眾評價 Public Reviews | All | reviews | |
| `personal_reviews` | text | 我的評價 Personal Reviews | All | reviews | gated by field group `personal_notes` |
| `episode_comments` | text_links | 各集評論 Episode Comments | anime, tv-show, cartoon | reviews | locator required |
| `highlights` | episode_text | 神回/神片段 Highlights | anime | | kinds `HIGHLIGHT_KINDS` |
| `highlight_episodes` | episode_text | 神回/神片段 (manga: 神回) | tv-show, cartoon, manga | | kinds `HIGHLIGHT_KINDS` for tv-show and cartoon only |
| `highlight_passages` | text | 神片段 | novel | | |
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

`PLAN_FLAG_FIELDS` (the virtual API fields that front `plan_next` at entry
scope): `watch_next` on anime, anime-movie, movie, tv-show, cartoon;
`to_rewatch` on anime-movie, movie, tv-show; `read_next` and `to_reread` on
manga, novel, comic. Anime and cartoon have no entry-level rewatch field.

`SIZE_GROUPS` (key and label, from `SIZE_THRESHOLDS` and `_LABELS`):

| Media type | Keys |
|---|---|
| `anime` | `12ep` "12 EP", `24ep` "24 EP", `30ep_plus` "30+ EP" |
| `tv-show`, `cartoon` | `1season` "1 Season", `2season` "2 Seasons", `3season_plus` "3+ Seasons" |
| `movie` | `standalone` "Standalone", `2_3movies` "2-3 Movies", `4movies_plus` "4+ Movies" |
| `comic` | `1_3` "1-3 Issues", `4_10` "4-10 Issues", `11_plus` "11+ Issues" |

`anime-movie`, `manga` and `novel` have no bucket vocabulary.

### Credit roles and tag fields (`app/utils/credit_roles.py`)

`CREDIT_ROLES` is the vocabulary of `media_credit.role`. Credit roles and
person roles are two lists on purpose: 原作 and 作画 are two credits that both
imply the single `manga_author` person role.

| Key | Label | Target | Person role | Media types |
|---|---|---|---|---|
| `studio` | Studio | studio | | anime, anime-movie |
| `director` | Director | person | `director` | anime, anime-movie, movie |
| `producer` | Producer | person | `producer` | anime |
| `composer` | Music / Composer | person | `composer` | anime |
| `manga_author_plot` | 原作 | person | `manga_author` | manga |
| `manga_author_draw` | 作画 | person | `manga_author` | manga |
| `novel_author` | Author | person | `novel_author` | novel |
| `novel_illustrator` | Illustrator | person | `novel_illustrator` | novel |
| `comic_writer` | Writer | person | `comic_writer` | comic |
| `comic_artist` | Artist | person | `comic_artist` | comic |

`PERSON_ROLES` (derived, in first-seen order, served as `/api/constants`
`person_role`): `director`, `producer`, `composer`, `manga_author`,
`novel_author`, `novel_illustrator`, `comic_writer`, `comic_artist`.
`SCOPED_PERSON_ROLES = {"director"}`: a director's `person_role` carries a
scope of `anime` (credited on anime or anime-movie, `DIRECTOR_ANIME_MEDIA_TYPES`)
or `non_anime`. These scopes are **not** the hyphenated media-type keys.

`TAG_FIELDS` is the vocabulary of `media_tag.field`; each field reads one
Tier 2 category:

| Key | Label | Tier 2 category | Media types |
|---|---|---|---|
| `genre_main` | Genre Main | `Genre Main` | anime |
| `genre_sub` | Genre Sub | `Genre Sub` | anime |
| `label` | 標籤 Label | `Label` | anime |
| `quality` | Quality 品質 | `Quality` | anime |
| `source_official` | Official Source | `Official Source` | tv-show, cartoon, movie |
| `publisher_tw` | Publisher / Distributor TW | `Publisher / Distributor TW` | anime, manga, novel, comic |
| `comic_publisher` | Publisher | `Comic Publisher` | comic |
| `comic_imprint` | Imprint | `Comic Imprint` | comic |
| `comic_continuity` | Continuity | `Comic Continuity` | comic |
| `comic_era` | Era | `Comic Era` | comic |
| `comic_event` | Events | `Comic Event` | comic |

`TAG_CATEGORIES` (served as `/api/constants` `tag_categories`): `Genre Main`,
`Genre Sub`, `Label`, `Quality` — the subset of the categories below that the
admin Add / Modify / Delete pages offer under their **Tags** sub-tab instead
of **Options**. The split is navigation only: both sub-tabs are the same form
over the same `system_option` rows, and nothing in the data or the API marks
a category as a tag. The list is written out, not derived — these four happen
to be exactly the anime-only tag fields today, but what puts a category here
is that its values read as tags *on* the work, while `Official Source`,
`Publisher / Distributor TW` and the Comic vocabularies name an outside
party. A new anime-only category is therefore not automatically a tag.

`FILTER_ONLY_CATEGORIES`: `Franchise for Filter` (a Tier 2 category with no
tag field behind it). `OPTION_CATEGORIES` = the eleven categories above plus
that one, served as `/api/constants` `option_categories` and unioned with the
categories present in the stored options to build the category picker on the
Add and Modify pages. Without it a declared category holding no values yet
could not be picked at all, so the first value of a new tag field had nowhere
to go. `LEGACY_SHEET_COLUMN` maps each `(media_type, key)` to the Google
Sheets header it has always used (e.g. `("anime", "composer")` -> `music`,
`("anime", "publisher_tw")` -> `distributor_tw`).

### Watch-order built-ins (`app/services/domain/watch_order.py`)

| Name | Values |
|---|---|
| `ITEM_IMPORTANCE` | `Essential`, `Recommended`, `Normal`, `Optional` (served as `/api/constants` `watch_order_importance`) |
| `DEFAULT_IMPORTANCE` | `Normal`; `normalize_importance` coerces anything unrecognised (NULL, a bad Sheets cell) to it |
| `MEDIA_TYPE_MODELS` / `VALID_WATCH_ORDER_MEDIA_TYPES` | the eight hyphenated media types |
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
| `PERM_ADMIN` | `admin` |
| `PERMISSION_FAMILIES` | `media_type`, `field_group`, `label` |
| `media_type.<key>` | one per hyphenated media type key, e.g. `media_type.tv-show` |
| `field_group.<key>` | one per `FIELD_GROUP_KEYS` entry |
| `label.<key>` | one per `content_label.key` row; the only family computed from the database at request time |

`app/services/rbac/field_groups.py` (`FIELD_GROUPS`):

| Key | Label | Gates |
|---|---|---|
| `sources_other` | Other Sources | column `source_other` on every media type; UI block `info.SourcesCard.other` |
| `personal_notes` | Personal Reviews | note section `personal_reviews`; UI block `notes.reviews.personal` |
| `system_info` | System Info | UI block `detail.SystemInfo` only (frontend-only, no column) |
| `credits` | Credits | every credit-kind link field per media type, derived from `CREDIT_ROLES`; UI block `info.CreditsCard` |

See [authorization.md](authorization.md) for roles, enforcement and content
labels.

### Media type and owner keys (`app/utils/media_resolver.py`)

`MEDIA_TYPE_KEYS` (hyphenated, stored in `media_relation`, `watch_order_item`,
`plan_next`, `media_credit`, `media_tag`, `system_option_scope`; served as
`/api/constants` `media_type`): `anime`, `anime-movie`, `movie`, `tv-show`,
`cartoon`, `manga`, `novel`, `comic`. `OWNER_TYPE_KEYS` adds the grouping
tiers `series`, `franchise`, `collection` for note and meme owners.

---

## Tier 2: system options

An open vocabulary: values only humans read. Tables `system_option` and
`system_option_scope` are described in
[data-model.md](data-model.md#vocabulary-and-configuration); models are in
`app/models/system.py`; the router is `app/routers/options.py`.

**Categories.** The category string is free text on the API
(`SystemOptionCreate.category: str`), but the ones anything reads are the
twelve in `OPTION_CATEGORIES`:

| Category | Offered in (scopes) | Read by |
|---|---|---|
| `Genre Main` | anime | tag field `genre_main` |
| `Genre Sub` | anime | tag field `genre_sub` |
| `Label` | anime | tag field `label` (標籤: viewing-experience tags such as 會跳OP; seeded with three values by migration `l1a2b3e4l5o6`) |
| `Quality` | anime | tag field `quality` (品質: production-quality tags; ships with no values, an admin adds them through the Options Add page) |
| `Official Source` | tv-show, cartoon, movie | tag field `source_official` (merged the old `TV Show Official Source` / `Cartoon Official Source`) |
| `Publisher / Distributor TW` | anime, manga, novel, comic | tag field `publisher_tw` (merged `Distributor TW`, `Manga Publisher TW`, `Novel Publisher TW`) |
| `Comic Publisher` | comic | tag field `comic_publisher` |
| `Comic Imprint` | comic | tag field `comic_imprint` |
| `Comic Continuity` | comic | tag field `comic_continuity` |
| `Comic Era` | comic | tag field `comic_era` |
| `Comic Event` | comic | tag field `comic_event` |
| `Franchise for Filter` | movie, tv-show | nothing today; filter-only, no form field |

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
scope list wholesale with the one in the payload; delete logs a tombstone to
`deleted_record` under type `System Options` and cascades to the scope rows.
Admins edit scopes in the Options tab of Add / Modify
(`frontend/src/components/forms/ScopePicker.jsx`, used by `OptionsAddTab.jsx`).

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

---

## Tier 3: people and studios

Categories that named a person or a studio are entity rows, not vocabulary
strings, because a director needs multilingual names, a rating, a photo and
a remark. See [systems/credits-and-tags.md](systems/credits-and-tags.md) for
the full system and [data-model.md](data-model.md#people-studios-and-links)
for the `person`, `person_role`, `studio`, `media_credit` tables.

| Old option category | New home |
|---|---|
| `Studio` | `studio` rows, credited via `media_credit` role `studio` |
| `Director` | `person` with `person_role` `director` (scope `anime` / `non_anime`) |
| `Producer` | `person` with `person_role` `producer` |
| `Music / Composer` | `person` with `person_role` `composer` |
| `Manga Author` | `person` with `person_role` `manga_author` (implied by `manga_author_plot` or `manga_author_draw`) |
| `Novel Author` | `person` with `person_role` `novel_author` |
| `Novel Illustrator` | `person` with `person_role` `novel_illustrator` |
| `Comic Writer` | `person` with `person_role` `comic_writer` |
| `Comic Artist` | `person` with `person_role` `comic_artist` |

`person.my_rating` and `studio.my_rating` reuse `MY_RATINGS`. `character` /
`character_voice` tables were designed but not built; `anime.seiyuu` is a
`Need`/`Done` to-do status and unrelated.

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
| `ANIME_FIELDS_TO_FILL` | `airing_type`, `airing_status`, `release_date`, `release_season`, `mal_rating`, `mal_rank`, `ep_total`, `official_link`, `twitter_link`, `cover_image_file` |
| `ANIME_MOVIE_FIELDS_TO_FILL` | `airing_status`, `release_date_jp`, `mal_rating`, `mal_rank`, `official_link`, `twitter_link`, `cover_image_file` |
| `MOVIE_FIELDS_TO_FILL` | `length_min`, `airing_status`, `release_date_usa`, `imdb_rating`, `cover_image_file` |
| `MOVIE_LINK_FIELDS_TO_FILL` | `("credit", "director")` |
| `TV_SHOW_FIELDS_TO_FILL` | `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file` |
| `CARTOON_TV_FIELDS_TO_FILL` | `airing_status`, `release_date`, `imdb_rating`, `ep_total`, `cover_image_file` |
| `CARTOON_MOVIE_FIELDS_TO_FILL` | `airing_status`, `release_date`, `imdb_rating`, `cover_image_file` |
| `MANGA_FIELDS_TO_FILL` | `serialization_status`, `release_date`, `end_date`, `mal_rating`, `mal_rank`, `cover_image_file` |
| `NOVEL_FIELDS_TO_FILL` | `serialization_status`, `release_date`, `end_date`, `mal_rating`, `mal_rank`, `cover_image_file` |
| `COMIC_FIELDS_TO_FILL` | `release_date`, `issue_total`, `cover_image_file` |
| `COMIC_LINK_FIELDS_TO_FILL` | `("credit", "comic_writer")`, `("credit", "comic_artist")`, `("tag", "comic_publisher")` |

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
| `frontend/src/config/statusGroups.js` | `COMPLETED_STATUSES`; `WATCHING_STATUS_GROUP` / `READING_STATUS_GROUP` filter buckets (`Might Watch`/`Might Read`, `Planned`, `Watching`/`Reading`, `Completed`, `Dropped`) | hand-maintained; the grouping exists only in the frontend |
| `frontend/src/components/tracker/WatchOrderEditor.jsx` | `ITEM_IMPORTANCE` | hand-maintained mirror |
| `fieldOptions.js` extras | `PROGRESS_DISPLAY_OPTIONS` (`""`, `ch`, `vol_tw`, `vol_original`, `arc_ch`), `RELEASE_SEASONS` (`WIN`, `SPR`, `SUM`, `FAL`), `RELEASE_MONTHS`, `SEASON_NUMS` (1-10), `PART_NUMS` (1-7), `TRISTATE` (`"true"`, `"false"`) | frontend-only vocabularies with no backend list |

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
- **`EXPECTATION_WEIGHT`** is defined three times in the frontend with two
  different unknown-value fallbacks (4 vs 99).
