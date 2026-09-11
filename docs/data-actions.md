# Data actions (admin Data Control)

Last verified: 2026-09-12 (Clean added: the reviewed diff-and-delete action)

## What this is for

The admin Data Control page is where the whole database gets maintained in bulk: **Backup** copies every table to Google Sheets, **Pull** restores tables from those sheets, **Fill** fetches missing metadata from the external APIs, **Replace** re-fetches metadata and overwrites what is there, **Calculate All** re-runs every derivation, and a few smaller actions maintain cover images and surface duplicates and remarks. This page explains what each action does step by step, what it logs, and the exact routes behind it. It does not repeat table definitions (see [data-model.md](data-model.md)), derivation rules (see [business-rules.md](business-rules.md)) or the external services themselves (see [external-apis.md](external-apis.md)).

Code map:

| File | Owns |
|---|---|
| `app/routers/data_control.py` | every `/api/data-control/...` route |
| `app/services/pipelines/runner.py` | the one Fill / Replace loop (`run_fill`, `run_replace`, `run_replace_single`, `run_all`) and the SSE messages |
| `app/services/pipelines/specs.py` | `PIPELINES` — what varies per media type (`PipelineSpec`) |
| `app/services/pipelines/fill.py`, `replace.py` | named entry points (`execute_fill_anime`, `execute_replace_single_movie`, ...) bound to a spec |
| `app/services/pipelines/tabs.py` | `SHEET_TABS` — the one registry of sheet tabs, in restore order |
| `app/services/pipelines/backup.py` | `execute_backup` |
| `app/services/pipelines/clean.py` | `scan_orphans`, `apply_clean` — the diff against the sheet, and the reviewed delete |
| `app/services/pipelines/pull.py` | `execute_pull_specific`, `execute_pull_all` |
| `app/services/calculation.py` | `run_calculate_all` and the cover-image bulk actions |
| `app/utils/data_control_utils.py` | `log_data_control` (the audit row) and `log_deleted_record` |

All routes need **two** gates, both declared on the router: `Depends(require_manage_pipelines)` (may this account run pipelines at all) and `Depends(require_unscoped_mode)` (may it run one from THIS session). Router level rather than per handler, because most of these routes are registered in a loop over `PIPELINES` and a per-handler gate would miss them silently.

---

## 1. Backup

`execute_backup(db, action_type)` in `backup.py`. Called by `POST /api/data-control/backup` (`action_type="Manual"`) and automatically at the end of Fill All / Replace All (`action_type="Auto"`).

Steps, for each tab in `SHEET_TABS` order (section 2 lists it):

1. `db.query(tab.model).all()` — every row of the table.
2. Headers are the model's column names (`tab.model.__table__.columns`); each row is formatted with `format_model_for_sheet`.
3. If the tab has a `media_type` (the nine entry tabs), the credit and tag link columns are appended **after** the plain columns: `sheet_link_headers(media_type)` gives the legacy header names (studio, director, genre_main, ...) and `sheet_link_rows(db, media_type, rows)` fills them as comma-joined names in a fixed number of queries. Pull matches these by header name, never by position, so appending them is safe.
4. `bulk_overwrite_sheet(tab.name, [headers] + matrix)` (`app/services/integrations/sheets.py`): **write first, trim after**. It updates from `A1` with `USER_ENTERED`, then `batch_clear`s only the cells beyond the new data (rows below, columns to the right). A failed write therefore leaves the previous backup intact rather than a blank tab. An empty matrix raises `ValueError` — Backup refuses to blank a tab.

Outcome:

| Result | Log row | HTTP |
|---|---|---|
| all tabs written | `Backup` / `Backup` / `Success` | 200 `{"status": "success", "message": "All tabs backed up to Google Sheets"}` |
| any exception | `Backup` / `Backup` / `Failed` with `error_message` | the exception is re-raised (500) |

---

## 2. Sheet tab registry (`tabs.py`)

**Pipelines write catalogue columns only.** Fill, Replace, Pull and the
autofill hooks may not touch anybody's `user_media_list` row - status, rating
and progress are one person's, and a pipeline that rewrote them would be
silent data loss the moment there is more than one user. It is silent for a
second reason: a pipeline setting an attribute the model does not declare
raises on `Model(**dict)` but **not** on `setattr`, and Pull upserts with
`setattr`. The rule is enforced statically by
`tests/services/test_pipelines_write_no_personal_columns.py`, which derives
the forbidden names from `LIST_FIELDS` so a new column on `user_media_list` is
guarded from the day it lands. The personal values travel in the **User Media
List** tab instead, and the nine media tabs' parsers no longer emit them.

The restore order follows from that: `users` and every media tab must land
before **User Media List**, because a list row is keyed by `(user_id,
media_id)` and resolves both by natural key. **Game Copy** is restored to the
acting user rather than to whatever `user_id` the sheet carries, since a uuid
in the sheet names whichever database wrote it.

`SHEET_TABS` is the single list Backup writes and Pull restores.

### 2.1 The restore-order contract

Its order is the **restore** order and is **strict**. It used to be strict by
convention: most references were FK-less `(media_type, entry_id)` pairs, so an
out-of-order restore produced quiet orphans that a later pass could fix. Steps
0-2 of the multi-user work replaced those with real foreign keys, so the same
mistake now raises a `ForeignKeyViolation` at the tab's commit and rolls back
**every row on that tab** - for `User Media List`, every user's entire list.

The chains that must hold:

```
Users            ->  before  User Media List   (user_media_list.user_id)
Media            ->  before  User Media List   (user_media_list.media_id)
Media            ->  before  the nine media tabs   (detail.system_id -> media)
Collection -> Franchise -> Series -> Media
Watch Order List -> Watch Order Section -> Watch Order Item
Person / Studio / Publisher / Character / Content Label -> the media tabs
```

`Users` is first because nothing in the sheet points at it, and `Plan Next`,
`Seasonal` and `Game Copy` all carry a NOT NULL `user_id`. The enforcement is
`tests/api/test_sheet_restore_order.py`; move the tab rather than weaken the
test.

### 2.2 The tab list

| # | Tab name | Model | `media_type` key |
|---|---|---|---|
| 1 | `Users` | `User` |  |
| 2 | `System Options` | `SystemOption` |  |
| 3 | `System Option Scope` | `SystemOptionScope` |  |
| 4 | `System Option Usage` | `SystemOptionUsage` |  |
| 5 | `System Option Alias` | `SystemOptionAlias` |  |
| 6 | `Content Label` | `ContentLabel` |  |
| 7 | `Person` | `Person` |  |
| 8 | `Person Role` | `PersonRole` |  |
| 9 | `Studio` | `Studio` |  |
| 10 | `Publisher` | `Publisher` |  |
| 11 | `Publisher Scope` | `PublisherScope` |  |
| 12 | `Character` | `Character` |  |
| 13 | `System Configs` | `SystemConfigs` |  |
| 14 | `Collection` | `Collection` |  |
| 15 | `Franchise` | `Franchise` |  |
| 16 | `Series` | `Series` |  |
| 17 | `Media` | `Media` |  |
| 18 | `Anime` | `Anime` | `anime` |
| 19 | `Anime Movie` | `AnimeMovies` | `anime-movie` |
| 20 | `Movies` | `Movies` | `movie` |
| 21 | `TV Shows` | `TVShows` | `tv-show` |
| 22 | `Cartoons` | `Cartoon` | `cartoon` |
| 23 | `Manga` | `Manga` | `manga` |
| 24 | `Novel` | `Novel` | `novel` |
| 25 | `Novel Unit` | `NovelUnit` |  |
| 26 | `Comic` | `Comic` | `comic` |
| 27 | `Game` | `Game` | `game` |
| 28 | `Game Copy` | `GameCopy` |  |
| 29 | `User Media List` | `UserMediaList` |  |
| 30 | `Watch Order List` | `WatchOrderList` |  |
| 31 | `Watch Order Section` | `WatchOrderSection` |  |
| 32 | `Watch Order Item` | `WatchOrderItem` |  |
| 33 | `Media Relation` | `MediaRelation` |  |
| 34 | `Plan Next` | `PlanNext` |  |
| 35 | `Quote` | `Quote` |  |
| 36 | `Character Casting` | `CharacterCasting` |  |
| 37 | `Meme` | `Meme` |  |
| 38 | `Note` | `Note` |  |
| 39 | `Media Source` | `MediaSource` |  |
| 40 | `Media Content Label` | `MediaContentLabel` |  |
| 41 | `Seasonal` | `Seasonal` |  |

`Media` sits immediately before the nine entry tabs: every entry table has a
composite FK `(system_id, media_type)` up to `media`, and although that FK is
deferred, Pull commits tab by tab, so an entry tab restored first would fail at
its own commit. Each of the nine entry tabs drops its constant `media_type`
column and appends a derived, read-only `display_name` for the human reader;
Pull drops any header that is not a column of the model (`drop_non_columns`).

**`Users`** carries `id`, `username`, `list_is_public` and `role`.
`hashed_password` and `role_id` are dropped. `role_id` because
`role.system_id` is minted per database by `ensure_rbac_seed`, so the role
**name** travels instead and Pull resolves it locally - the same arrangement
`Media Source` has with `option_id`; a role name this database does not know
skips the row and lands in `unresolved_refs`, because `users.role_id` is NOT
NULL with `ondelete="RESTRICT"` and one bad row must not cost every other
account. `hashed_password` because it is credential material for other
people's accounts and a Backup writes the sheet outside this database's trust
boundary; Pull stamps `UNUSABLE_PASSWORD_HASH` on an account it creates and
**never** touches an existing account's hash. The identity is `username`
(UNIQUE), not `id`: the lifespan mints the `admin` account on every machine,
so the same person holds a different uuid here and there.

**`User Media List`** carries every user's list rows. `user_id`, `media_id`
and `system_id` are dropped for `username`, `media_type` and `public_id` -
both pairs are exact (`users.username` UNIQUE, `uq_media_type_public_id`), and
a human reads this tab during an environment switch. Its natural key is
`(user_id, media_id)` = `uq_user_media`, compared after both have been
resolved to local uuids. A reference that resolves to nothing skips the row
and lands in `unresolved_refs`.

**`Plan Next` and `Seasonal`** drop `user_id` for `username` too, for the same
reason. Step 3 made both tables per-user but left their tabs with no user
column, so Pull stamped every restored row to the `admin` account; a second
account's plans and season ratings came back as the admin's. Since Step 4 the
name travels. Pull falls back to `_restore_owner_id` (the `admin` account, or
the alphabetically first user) **only** when the header is absent altogether -
a sheet written before Step 4, everything in which did belong to one person. A
`username` that is present and names nobody skips the row and lands in
`unresolved_refs`, rather than being quietly filed under the admin. `seasonal`'s
primary key **is** the `(user_id, seasonal)` pair, so the user is not
decoration there: without it a Pull updates whichever user's row for that
season happened to be first.

Note the tab for the `anime_movies` table is named `Anime Movie` (singular), while `Movies`, `TV Shows` and `Cartoons` are plural. Derived lookups: `TAB_BY_NAME`, `TAB_NAMES`, `TAB_MODELS`, `TAB_PARSERS`, `MEDIA_TYPE_FOR_TAB` (only the nine entry tabs).

`Media Source` sits after `Note` (both endpoints — the entry, and, when set,
the option — must already exist), and `Media Content Label` after it (both
*its* endpoints — the entry, and the label on the `Content Label` tab — must
already exist too), the two of them before `Seasonal`.

The three tabs games added sit where their foreign keys put them.
`System Option Alias` follows `System Option Usage`, because `option_id` is a
real FK into `system_option` and the parent tab must restore first — the same
position, and the same derived-identity treatment, its two siblings have.
`Game` follows `Comic` at the end of the media tabs, and `Game Copy` follows
`Game`, because `game_copy.game_id` is a real FK too (the `Novel` / `Novel
Unit` pairing repeated). `Game Copy` is not a `media_type` tab: it carries no
credit or tag link columns, since a copy is a purchase record rather than an
entry.

**`source_baha`, `baha_link`, `source_netflix`, `source_other`,
`official_link`, `twitter_link` and `anilist_link` are gone.** Migration
`dc1o2l3s4d5` dropped all seven from every table that had them (`anime`,
`anime_movies`, `manga`, `novel`, `movies`, `tv_shows`, `cartoons`, `comic`),
and `formatter.py` no longer round-trips any of them on any media tab.
`media_source` rows (the `Media Source` tab) are the only mechanism left for
this data, on every read and write path.

**This was a breaking sheet change.** A sheet backed up before the
`Media Source` tab existed has no `media_source` rows and, now that the
columns are dropped, nothing to fall back on. Per
[switching-environments.md](switching-environments.md), Backup and Pull All
carry the *whole* database state each way with no merge — so **on any machine
that has not yet run a Backup since this migration landed, run Backup from
the machine with the newer data before the other machine runs Pull All.**
Pulling an old sheet into the dropped schema silently restores nothing for
sources: the columns it used to fill no longer exist, and an old sheet has no
`Media Source` rows to replace them with.

**`publisher_scope` has its own tab, `Publisher Scope`,** sitting between
`Publisher` and the media tabs exactly as `Person Role` sits after `Person`, and
carrying the same three columns minus the role (`id`, `publisher_id`, `scope`).
It shipped a release *after* the publisher migration itself, closing a gap in
which scopes survived only by luck: Pull applies each entry's `publisher`
credits through `replace_credits`, which calls
`resolve_publisher(..., scope=media_type)` and re-adds the scope row additively,
so a publisher credited on a manga was scoped to manga again on the way in — but
a scope with **no credit behind it** was lost. That is the `anime` scope
hand-seeded onto `bilibili` and `Crunchyroll` (see
[options.md](options.md#tier-2-system-options)), which are credited nowhere, and
any scope an admin sets through the Publisher Modify tab ahead of the first
credit. Since zero scope rows means offered *nowhere*, losing them made those
publishers invisible in every picker. The tab carries them now.

Two consequences of restoring by `(publisher_id, scope)` rather than by the
sheet's integer `id`: a second Pull of the same sheet adds nothing (no
`uq_publisher_scope` collision), and, like every other tab, Pull only upserts —
a scope **removed** on the other machine is not deleted here, so unscope it on
both or delete the row from the admin page.

**A sheet backed up before this tab existed has no `Publisher Scope` rows.**
Pull creates the tab empty and reports success, leaving whatever scopes the
credits re-add — the pre-tab behaviour. Run a Backup from the machine with the
newer data first, as [switching-environments.md](switching-environments.md)
already requires.

**The publisher migration did not change any sheet header.** The `publisher`
credit writes under `distributor_tw` on the Anime and Anime Movie tabs,
`publisher_tw` on Manga and Novel, and `publisher` on Comic and Game — the
headers the retired `publisher_tw` and `comic_publisher` tag fields used, so a
Backup taken after the migration is column-identical to one taken before. Only
what sits behind the header moved, from `media_tag` to `media_credit`. The one
new column is `distributor_tw` on the **Anime Movie** tab, which never carried a
distributor. The Comic tab lost its always-empty `publisher_tw` column. (The
`Publisher Scope` tab above is additional, not a header change: no existing
tab's columns moved for it.)

**One restore hazard, from splitting names.** The migration split four
vocabulary values into `name_en` + `name_cn` (`Muse木棉花`, `Proware普威爾`,
`曼迪 Mightymedia`, `羚邦 Ani-One`), and a Backup taken *after* it writes the
new display name. A Pull from a sheet backed up **before** the migration asks
`find_publisher` for the old mashed spelling: `Muse木棉花` and `羚邦 Ani-One`
still resolve (their pre-migration spelling survives in `name_cn` and
`name_alt` respectively), but `Proware普威爾` and `曼迪 Mightymedia` do not, and
Pull will mint a second entity for each. The mitigation is the rule
[switching-environments.md](switching-environments.md) already states — Backup
immediately after migrating, so no stale sheet is ever the newest version. If a
duplicate does appear, `POST /api/publisher/{id}/merge` repoints the credits
before deleting the loser.

`system_option_usage` has had its own tab since it started drifting between
machines — a `usage` row set through the Options page now round-trips exactly
like its `system_option_scope` sibling. See
[data-model.md](data-model.md#system_option_usage) and
[options.md](options.md#tier-2-system-options).

`content_label` and `media_content_label` have tabs for the same reason, and a
sharper one: they are the only tables whose absence from the sheet fails
**open**. A Pull All on a machine that had never been told which entries carry
`nsfw` restored every one of them unlabelled — visible to every viewer — and
nothing in the run reported a problem. Both tables mint their `system_id` per
database (the labels are typed into the admin page on each machine), so both
are derived-identity tabs: `Content Label` is identified by its unique `key`,
`Media Content Label` by `(media_type, entry_id, label_id)`, and the `label_id`
a sheet carries is translated through the `Content Label` tab before it is
stored — the same treatment `System Option Scope` gets. A labelling whose label
cannot be resolved is skipped with a warning rather than failing the tab.

Still outside the sheet, deliberately: `role` and `role_permission`
(`ensure_rbac_seed` recreates guest, user and admin on any machine, but a role
added or narrowed by hand is per-machine), `data_control_logs` and
`deleted_record`. `users` **is** in the sheet since Step 4, minus its
`hashed_password` - see the per-tab note below.

---

## 3. Pull (restore from Google Sheets)

### 3.1 One tab — `execute_pull_specific(db, tab_name, action_type, log_action)`

Returns a status dict; the router turns `"status": "error"` into an HTTP error.

1. **Unknown tab** → `{"status": "error", "message": "Unknown tab: ..."}` (400, nothing logged).
2. **Read** `get_all_raw_rows(tab_name)`. A `SheetsUnavailableError` (any read failure) logs `Pull {tab}` / `Failed` and returns `{"status": "error", "reason": "sheet_unavailable"}`. An outage is never mistaken for an empty tab.
3. **Empty tab** (fewer than 2 rows) → logs `Success` and returns `processed: 0`.
4. For every non-blank data row:
   - `parse_row_to_dict(headers, row)` then the tab's parser from `TAB_PARSERS`.
   - **Header filter**: keep only keys that were in the sheet's header row. Parsers emit their full key set, so without this a sheet predating a migration would null the new column on every Pull. A blank cell under a present header is kept and still means "clear this value".
   - **Link columns popped**: for entry tabs, each credit role and tag field header (`sheet_column_for(media_type, key)`) is popped out of the dict into `pending_credits` / `pending_tags` — they are no longer real columns on the model.
   - **Parent resolution** (names in the sheet → UUIDs):

     | Tab | How |
     |---|---|
     | `TV Shows`, `Cartoons`, `Manga`, `Novel`, `Comic`, `Movies`, `Game` | `resolve_*_parent_hierarchy(db, franchise, series, name_fields)` — auto-creates the franchise if missing (type `Game` for a game), looks up the series |
     | `Anime Movie` | `resolve_anime_movie_parent_hierarchy(db, franchise, name_fields)` when `franchise_id` is `None` or a string (auto-creates the franchise; no series) |
     | any other tab with a string `franchise_id` | look up `Franchise` by en/cn/jp/alt name; **not found → row skipped** |
     | string `collection_id` | look up `Collection` by any of its five names; not found → set to `None`, row kept (collection is optional) |
     | string `series_id` | look up `Series` by en/cn/alt name; **not found → row skipped** |

   - **Primary key field**: `id` for `System Configs`, `Person Role`, `Publisher Scope`, `System Option Scope`, `System Option Usage` and `Users` (`users.id` is a uuid, but it is spelled `id`); `seasonal` for `Seasonal`; `system_id` for everything else.
   - **Id-less matching**: when the PK cell is blank the row is matched to an existing local row by a natural key so a re-import updates instead of duplicating:

     | Tab | Matched on |
     |---|---|
     | `Franchise` | `franchise_name_en` or `franchise_name_cn` |
     | `Collection` | `collection_name_en` or `collection_name_cn` |
     | `System Configs` | `config_key` (UNIQUE — a blind insert would roll back the whole tab) |
     | `Watch Order List` | `list_name` + `franchise_id` + `collection_id` |
     | `Meme` | whichever owner column is set + `text` |
     | `Note` | whichever owner column is set + `section` + `content` (content may be `None`) |
     | `Quote` | `media_type` + `entry_id` + `text` |
     | `Series` | `series_name_en` or `series_name_cn` |
     | `Anime`, `Anime Movie`, `Movies`, `TV Shows`, `Cartoons`, `Manga` | the type's `*_name_en` or `*_name_cn` |
     | everything else (incl. `Novel`, `Comic`, `Watch Order Item`) | no natural key — an id-less row always inserts |

     If matched, the local PK is used; otherwise the PK key is dropped so the database mints one.
   - **Remark notes**: a `Note` row with `section == "remark"` is retargeted at the owner's existing remark row (the `ix_note_one_remark_per_owner` index allows only one), keeping the local `system_id`.
   - **The Note and Meme tabs changed shape in Step 5.** Both lost `owner_type`
     and `owner_id` and gained `media_id`, `collection_id`, `franchise_id` and
     `series_id` — one of the four is set per row and a CHECK enforces it — and
     all three of `Note`, `Quote` and `Meme` gained `author_id`. Consequences
     for a round trip:
     - **An older sheet still Pulls.** `parse_note_from_sheet` and
       `parse_meme_from_sheet` read the old pair as `_legacy_owner_type` /
       `_legacy_owner_id`, and `_resolve_owner_columns` in `pull.py` turns it
       into the right column against `media` and the three tier tables. A row
       whose owner resolves to nothing is **skipped and reported** in
       `unresolved_refs` rather than written, because the CHECK would reject it.
     - **`author_id` travels as a raw uuid, and for `admin` that uuid is not
       portable.** An account the sheet *inserts* here keeps the uuid it
       carries (`Users` is deliberately absent from `DERIVED_IDENTITY_MINTED_PK`),
       so most authors resolve. `admin` is the exception: `app/main.py`'s
       lifespan mints one on every machine, so the two were never the same row,
       and the `username` match keeps the local id and discards the sheet's —
       permanently, since it re-matches the same way on every Pull. Every row
       the other machine's admin wrote therefore names a user this database
       does not have. That, a blank cell, or any other unknown id falls back to
       the **admin** — the column is `NOT NULL`, and a line whose author is
       uncertain is still the line. The fallback covers `Note`, `Meme` **and
       `Quote`**; it covered only the first two until 2026-09-11, and the
       missing case failed the `Quote` tab's commit with a `ForeignKeyViolation`
       that rolled back every quote in it. So authorship does not round-trip
       for the admin's own rows: a cross-machine restore re-files them under
       the local admin. Harmless while one person writes them; these three tabs
       need a `username` column, the way `Plan Next` has one, before a second
       author matters.
     - **Back up after the change, and do not Pull an older sheet over a newer
       database.** The dropped headers have nowhere to land once the sheet is
       rewritten.
   - **Three tabs need `admin.authz` and are otherwise skipped.** `Users`
     (which carries each account's role name), `Content Label` and
     `Media Content Label` decide *authorization*, not catalogue content — and
     Pull writes the sheet **into** this database. The sheet is an ordinary
     Google Sheet, editable by anyone with access, so without a gate an account
     holding `manage.pipelines` but not `admin.authz` could type `admin` into
     the Users tab's role column, run Pull All, and be promoted. Those three
     are marked `requires_authz=True` in `tabs.py` (`AUTHZ_TABS`) and return
     `status: "skipped"` for a caller without the permission; every other tab
     restores as normal and the skip is reported in `unresolved_refs`, so the
     audit row is red rather than the gap silent. **Backup is deliberately not
     gated** — it writes local → sheet and cannot change this database. The flag
     defaults to **closed**, so a programmatic caller has to ask for the
     permission rather than inherit it. Added 2026-09-11; decision 10 in the
     authorization spec.
   - **Derived identity** (`DERIVED_IDENTITY_KEYS` in `pull.py`): tables hold rows whose identifier is *minted per database* rather than carried by the sheet — the credit backfill, `extract_system_options` and the rewatch→`plan_next` migration all mint as they go. Two databases therefore hold the same logical rows under different ids, and resolving by id alone misses every time; the INSERT that follows collides with the UNIQUE constraint that row already occupies and rolls back the whole tab. So these tabs also match on their natural key, and **keep the local id** (the PK is popped from the payload so the `setattr` loop cannot overwrite it):

     | Tab | Matched on | Sheet PK |
     |---|---|---|
     | `Users` | `username` (`users.username` is UNIQUE) | uuid — tried first |
     | `User Media List` | `user_id` + `media_id` (`uq_user_media`), both resolved from `username` and `(media_type, public_id)` first | uuid — **not carried at all** |
     | `System Options` | `category` + `value` | uuid — tried first |
     | `Person`, `Studio` | `name_en` + `name_cn` + `name_jp` + `name_alt` | uuid — tried first |
     | `Media Relation` | `from_type` + `from_id` + `relation_type` + `to_type` + `to_id` | uuid — tried first |
     | `Plan Next` | `kind` + `scope` + `target_id` + `media_type` | uuid — tried first |
     | `Media Source` | `media_type` + `entry_id` + `kind` + `bucket` + `option_id` + `name` (`uq_media_source_row`) | uuid — tried first |
     | `System Option Scope` | `option_id` + `scope` | integer — **ignored** |
| `System Option Alias` | `option_id` + `source` + `value` | integer — **ignored** |
     | `Person Role` | `person_id` + `role` + `scope` | integer — **ignored** |
     | `Publisher Scope` | `publisher_id` + `scope` (no `role`: a publisher holds exactly one) | integer — **ignored** |

     A uuid that misses is merely unknown, so trying it first costs nothing and lets a value *renamed* in the sheet follow its existing row. The two autoincrement ids are ignored outright: the sheet's `id = 1` names a real but unrelated local row, and honouring it retargets the wrong row.

     `Media Source` needs `option_id` in its own natural key, unlike the other
     FK-less tabs above: two `main`-bucket rows on the same entry for two
     different platforms both have `name = NULL`, so without `option_id` they
     would collide with each other as duplicates on a second Pull. `option_id`
     is resolved to the **local** option id (from the tab's `option_category`/
     `option_value` columns, see below) before this match runs, so the
     comparison is a plain local-to-local uuid check like every other column
     in the key.
   - **Foreign uuid translation** (`DERIVED_IDENTITY_PARENTS`): `System Option Scope.option_id`, `System Option Usage.option_id`, `System Option Alias.option_id`, `Person Role.person_id`, `Publisher Scope.publisher_id` and `Media Content Label.label_id` cite a derived-identity parent by the *other* database's uuid. When that uuid is unknown locally it is translated by reading the parent's own tab and matching each of its rows by natural key. Reading the sheet rather than threading a map through Pull All is what lets a single-tab Pull of a child work on its own. A reference that still cannot be resolved skips the row, like every other FK miss.
   - **`Media Source`'s `option_id` is never written to the sheet as a uuid at all** — `system_option` mints a different id per database, so a raw `option_id` column would not survive the round trip the way `entry_id` does (entry ids *are* identical across databases). The tab instead carries the option's `category` and `value` as two extra string columns, `option_category` and `option_value` (`tabs.py`'s `extra_columns`, resolved by a small helper rather than being real model columns). Before the natural-key match above runs, Pull resolves `(option_category, option_value)` against the **local** `system_option` table and fills in a local `option_id`; when it cannot be resolved (the value does not exist on this machine), `option_id` is left `None`, which then trips `ck_media_source_one_target` and fails the whole tab's Pull — there is no per-row skip-with-warning here the way the neighbouring `Franchise`/`Series` lookups above have, so a Platform value renamed or deleted on one machine can block a `Media Source` Pull on the other until the vocabularies are reconciled.
   - **Target row**: `existing = query(Model).filter(pk == pk_value)` when a PK is present.
   - **INSERT-only defaults** (never applied to an UPDATE, so a sheet that omits a column cannot wipe a good value):

     | Tab | Defaults |
     |---|---|
     | `Anime`, `Movies`, `Anime Movie`, `TV Shows`, `Cartoons`, `Manga`, `Game` | `created_at` / `updated_at = get_taipei_now()` |
     | `Collection`, `Franchise`, `Series` | `created_at` / `updated_at` (non-nullable on these models) |
     | `Users` | `hashed_password = UNUSABLE_PASSWORD_HASH` |

     The `watching_status` / `reading_status` / `playing_status` defaults that
     used to sit here are gone: Step 1 moved those columns to
     `user_media_list`, and a status default belongs with the row that owns
     it. An entry with no list row reads back as `user_list.DEFAULT_STATUS`
     anyway. `Novel` and `Comic` are not in the table at all.

     The `Users` default is INSERT-only *by construction*, not merely by
     convention: an UPDATE that touched `hashed_password` would lock the admin
     out of their own machine on every Pull All.
   - **Upsert**: existing → `setattr` every remaining key (`rows_updated += 1`); otherwise `Model(**dict)` + `db.add` (`rows_added += 1`).
   - **Link columns applied**: after the row exists (a fresh insert is `db.flush()`ed first so `system_id` is real), `replace_credits` / `replace_tags` are called per popped column with `names_from_sheet_value(raw)`.
   - `db.flush()` every 50 rows so newly minted UUIDs are visible to later FK references.
5. **Commit** once per tab. A commit failure rolls back the entire tab, logs `Failed`, returns `{"status": "error"}`.
6. **Sequence resync**: because Postgres does not advance a sequence when ids are supplied explicitly, after restoring `System Configs`, `Person Role`, `Publisher Scope`, `System Option Scope` or `System Option Usage` the matching `*_id_seq` is `setval`'d to `MAX(id) + 1`. `System Options` is deliberately not in this list — its key is a UUID.
6b. **`public_id` resync**: the same hazard, on every tab whose model carries a
   `public_id`. Backup writes `public_id` on all seventeen entity tabs and Pull
   restores it unchanged - that is what keeps the company and home databases
   agreeing on the ids that appear in URLs - so the per-table
   `<table>_public_id_seq` is left wherever the *local* database had it.
   `resync_public_id_sequence(db, Model)` runs after the tab's commit (so
   `MAX()` reads the rows that actually landed) and `setval`s it past them. It
   is a no-op for a model with no `public_id`, because Pull walks every tab.
   Without it nothing fails at restore time; the next entry an admin adds
   fails on the unique index, with a message that says nothing about Pull.

   Restoring `public_id` is also why its unique constraint is `DEFERRABLE
   INITIALLY DEFERRED` (see [data-model.md](data-model.md)): the sheet's ids
   are routinely a *permutation* of the local ones, so mid-restore two rows
   briefly share a value. The whole tab is one transaction, so the check lands
   at COMMIT, by which point the end state is unique again.
7. Log `Pull {tab_name}` / `Success` with `rows_added` / `rows_updated`; return `{"status": "success", "processed", "rows_added", "rows_updated", "rows_skipped", "credit_conflicts", "created_entities", "unresolved_refs"}`.

   **`unresolved_refs`** is the channel for everything the sheet named that
   this database cannot resolve, one line each. A row it names was **skipped**,
   which on a restore is lost data, so it is reported rather than only logged:

   | Source | Line |
   |---|---|
   | `Users` with a role name no local role matches | `Users: role 'wizard' for user 'ghost' is unknown here` |
   | `User Media List` with an unknown `username` | `User Media List: user 'nobody' is unknown here` |
   | `User Media List` with an unknown `(media_type, public_id)` | `User Media List: entry (anime, 999999) is unknown here, for user 'cg1618'` |
   | `Plan Next` / `Seasonal` naming a `username` no local account matches | `Seasonal: user 'nobody' is unknown here` |
   | a header the tab's model no longer has | `Anime: column 'watching_status' is not on this model any more` |

   The last one is the **stale-column guard** reporting itself. `drop_non_columns`
   silently discards any header that is not a column of the model - which is
   right for the ones the tab writes on purpose (the denormalised
   `display_name`, the natural keys standing in for a database-local id, the
   legacy credit and tag headers) and wrong for one that means "this sheet
   predates a migration" or "this header is a typo that has been quietly
   discarding a real value". `unexpected_headers(tab_name, headers)` decides
   which is which, **once per tab from the header row**, so a tab with a
   thousand stale rows writes one line, not a thousand. Without the guard
   itself, `Model(**payload)` would raise `TypeError` and abort the whole tab -
   which is what the first Pull All after Step 1 would have done, on nine tabs
   at once.

### 3.2 Pull All — `execute_pull_all(db, action_type)`

Runs `execute_pull_specific` for every tab in `TABS_IN_ORDER` (= `TAB_NAMES`), each with `action_type="Manual"` and `log_action=True`, so **every tab logs its own row** in addition to the master `Pull All` row.

Skip-unreadable policy: a tab whose result has `reason == "sheet_unavailable"` is recorded in `unread_tabs` and the run **continues**; any other error stops the run (`Exception("Pull failed on tab ...")`).

| Outcome | Master log row | Response |
|---|---|---|
| every tab restored | `Pull` / `Pull All` / `Success`, totals, `details_json` = `{tab: processed}` | 200 `{"status": "success", "details": {...}}` |
| one or more tabs unreadable | `Failed`, `error_message` = `"Full Pull Pipeline incomplete. Tabs not pulled: ..."`, `details_json` = `{"pulled": ..., "unread": ...}` | raises `SheetsUnavailableError` (500) |
| every tab pulled, some references unresolved | `Failed`, `error_message` = `"Full Pull Pipeline completed with N unresolved reference(s); those rows did not restore..."`, `details_json` = `{"pulled": ..., "unresolved_refs": [...], ...}` | 200 `{"status": "success", ..., "unresolved_refs": [...]}` |
| any other error | `Failed` with the message | re-raised (500) |

`unresolved_refs` is checked **before** `credit_conflicts`, and like it the run
is not raised: the caller needs the list to act on, and a raise would replace
it with a generic error. The row is red so the gap is visible on the admin
page, which otherwise shows only a generic toast. Every `execute_pull_all`
return carries the key, empty when there was nothing to report.

---

## 4. Fill (fetch what is missing)

`run_fill(spec, db, request, ...)` in `runner.py` is an SSE generator. What varies per type comes from `PIPELINES[key]` in `specs.py`.

Steps:

1. Load every row of `spec.model`. If the spec has `extract_id`, run it on **every** entry (parse the MAL / IMDb / Comic Vine / IGDB id out of the pasted link) and commit.
2. Queue = entries where `spec.fill_eligible(db, entry)` is true. Empty queue → one progress message `"No entries need filling."`.
3. Per queued entry: check the client is still connected; if `spec.budget` exists and returns `False`, stop and remember how many were left; emit progress with the entry's `display_name`; run `spec.fill` in a worker thread (`run_in_threadpool`, so the event loop and other requests stay alive during the synchronous `requests` calls) and commit. One failing entry is rolled back and logged; the run continues. Then `asyncio.sleep(spec.fill_sleep)` if set.
4. If `spec.post_process` exists, emit `"Running post-processing..."` and run it on **every** entry of the type (not just the queue), then commit.
5. Run each `fill_after` step in order, emitting its message first.
6. Log `Fill` / `Fill {label}` / `Success` with `rows_updated` = entries filled. Final SSE `success` message, with `"N entries skipped - the external API's budget was reached. Run again later to finish."` appended when the budget stopped the loop.

Per type (verbatim from `specs.py`):

| Key | Eligible when | Autofill | Sleep | Post-process (every entry) | After steps (in order) | Budget |
|---|---|---|---|---|---|---|
| `anime` | `mal_id` set and `has_missing_values_anime` | `autofill_anime_from_mal(e, force_replace_ratings=True)` | `MAL_PAUSE` = 1 s | `anime_post_processing` | `"Deriving episode counts..."` → `derive_ep_previous_all_anime`; `"Syncing seasonal data..."` → `run_sync_anime` | — |
| `anime-movie` | `mal_id` set and `has_missing_values_anime_movie` | `autofill_anime_movie_from_mal(e, force_replace_ratings=True)` | 1 s | `anime_movie_post_processing` | `"Syncing system options..."` → `run_sync_anime_movie` | — |
| `movie` | `has_missing_values_movie` | `autofill_movie_from_imdb(e, db)` | 0 | — | — | — |
| `tv-show` | `has_missing_values_tv_show` | `autofill_tv_show_from_imdb(e, db)` | 0 | `tv_show_post_processing` | `"Syncing system options..."` → `run_sync_tv_show` | — |
| `cartoon` | `airing_type in {"Movie", "TV"}` and `has_missing_values_cartoon` | `autofill_cartoon_from_imdb(e, db)` | 0 | `cartoon_post_processing` | `"Syncing system options..."` → `run_sync_cartoon` | — |
| `manga` | `mal_id` set and `has_missing_values_manga` | `autofill_manga_from_mal(e, force_replace_ratings=True)` | 1 s | `manga_post_processing` | `"Syncing system options..."` → `run_sync_manga` | — |
| `novel` | Two branches: `mal_link` set and `has_missing_values_novel`; **or** `mal_link` unset, `openlibrary_id` set, and `has_missing_values_novel_openlibrary(db, e)` | `autofill_novel_from_mal(e, force_replace_ratings=True)` when `mal_link` is set, else `autofill_novel_from_openlibrary(e, db)` | 1 s | — | `"Syncing system options..."` → `run_sync_novel` | — |
| `comic` | `comicvine_id` set and `has_missing_values_comic(db, e)` | `autofill_comic_from_comicvine(e, db)` | `COMICVINE_PAUSE` = 1 s | — | `"Syncing system options..."` → `run_sync_comic` | `comicvine_rate_limiter.has_capacity` |
| `game` | `igdb_id` set and `has_missing_values_game(e)`, **or** `has_missing_values_game_steam(e)` | `autofill_game_from_igdb(e, db)` then `autofill_game_from_steam(e, db)` | `STEAM_PAUSE` = 0.5 s | — | `"Syncing system options..."` → `run_sync_game` | `steam_store_rate_limiter.has_capacity` |
| `studio` | `mal_id` set and `has_missing_values_studio` | `autofill_studio_from_mal(e)` | `MAL_PAUSE` = 1 s | — | — | — |

`extract_id` per type: `apply_extract_mal_id_anime` (anime, anime-movie), `apply_extract_imdb_id` (movie, tv-show, cartoon), `apply_extract_mal_id_manga_novel` (manga), `apply_extract_novel_ids` (novel — runs both `apply_extract_mal_id_manga_novel` and `apply_extract_openlibrary_id`, unconditionally, since one entry can carry both a MAL link and an Open Library link at once), `apply_extract_comicvine_id` (comic), `apply_extract_game_ids` (game — runs both `apply_extract_igdb_id`, from `igdb_link`, and `apply_extract_steam_appid`, from `steam_link`, unconditionally, since a game can carry an IGDB link, a Steam link, or both; a `www.igdb.com` **slug** URL or a `steamcommunity.com` hub link carries no id and leaves any existing one untouched, mirroring `extract_comicvine_id`'s rejection of issue URLs). `apply_extract_mal_id_studio` (studio — a producer URL is `myanimelist.net/anime/producer/<id>/<slug>`, which needs its own pattern; see [external-apis.md](external-apis.md#tenrai-myanimelist)).

**Novel's two Fill sources.** `mal_link` wins when both ids are present — Tenrai returns strictly more (`serialization_status`, `end_date`, volume/chapter totals, ratings) than Open Library ever will. Open Library only ever fills a novel that has no `mal_link`, and it writes only `release_date`, `cover_image_file` and the `author` credit (see [external-apis.md](external-apis.md#open-library)). Bulk Replace for `novel` is untouched by this and still covers only MAL-linked entries — see the Replace row below.

**Game had a spec before it had a source.** `PIPELINES["game"]` shipped with
the games backend as a spec that fetched nothing — registration demands one,
because `MEDIA_TABLES` membership is asserted by `test_sheet_tabs` and by the
data-control route builder, which generates `/api/data-control/fill/game` and
`/replace/game/...` from the registry. Until IGDB landed (its own plan, right
after) `fill_eligible` returned `False` for every row, so a Fill run reported
"No entries need filling" rather than erroring. **That stub is gone**: Fill
Game now calls `autofill_game_from_igdb` then `autofill_game_from_steam`, and
games are in Fill All. **Game also gained a bulk Replace**, its first
(`replace_select = _linked(Game, Game.steam_appid, Game.steam_link)`,
`in_replace_all=True`): it runs the Steam half only, since nothing in an IGDB
record drifts — the same reasoning that makes Studio `fill_only` stays true
of IGDB's own half, and is now false of the type as a whole.

**IGDB's half of Fill Game has no budget guard**, unlike Comic. IGDB's limit
is 4 requests/second with no hourly quota, so the client's sliding-window
limiter paces the run and nothing ever has to abandon it part-way;
`has_missing_values_game` looks only at `GAME_FIELDS_TO_FILL` (`igdb_link`,
`release_date`, `cover_image_file`, `hltb_main`, `hltb_main_extra`,
`hltb_completionist`) — deliberately **not** at the genre/theme/mode tags,
because an IGDB value with no `system_option_alias` row is logged and skipped
rather than stored, so a game with an un-aliased genre would otherwise be
"needs filling" forever. **Steam's half does have a budget guard**: its
storefront allows ~200 requests per 5 minutes per IP, observed rather than
published, so `steam_store_rate_limiter.has_capacity` is wired as the game
spec's `budget` and stops a run cleanly once the window is spent, reporting
the remainder — the same bargain Comic Vine makes with its hourly quota.
`STEAM_PAUSE` (0.5 s) is polite spacing on top of that limiter, not the guard
itself, and it now paces the whole game pipeline since Steam's window is far
tighter than IGDB's. See [external-apis.md](external-apis.md#igdb) and
[external-apis.md](external-apis.md#steam).

**Comic Vine budget stop**: the limiter allows 200 requests per rolling hour. Before each comic, `has_capacity()` is checked; when it is `False` the loop breaks instead of blocking, and the remaining count is reported in the final message. The run still logs `Success`.

**Studio is the only non-media type in the registry.** It fills from MAL's producer endpoint (logo, `mal_link`, `founded_date`, `name_jp`, `website_url` — all fill-only; see [external-apis.md](external-apis.md#mapping-for-studio--map_tenrai_to_studio_data)) and carries `fill_only=True`, so `_register_replace_routes` is skipped for it entirely: there is no bulk or single Replace for a studio, because a producer record holds no score or rank that drifts. The same autofill also runs inside `POST` / `PUT /api/studio` on save, so a studio you enter with a MAL id is filled without visiting this page at all.

**Fill All** (`execute_fill_all` → `run_all("Fill", FILL_ALL, ...)`) runs the specs with `in_fill_all=True` in `PIPELINES` order — anime, anime-movie, movie, tv-show, cartoon, manga, novel, game, studio — and **excludes comic** (`in_fill_all=False`, because its budget is hourly). Then it runs `execute_backup(db, action_type="Auto")` and logs one master row `Fill` / `Fill All`. Sub-pipelines run with `log_action=False` and write no rows of their own. If any sub-pipeline emitted an `error` event, the master row is `Failed` with the joined messages, Backup is skipped, and the stream ends with an `error` event `"Fill All completed with errors: ..."`.

---

## 5. Replace (re-fetch and overwrite)

### 5.1 Bulk — `run_replace(spec, ...)` (SSE)

0. If the spec has `pre_run`, it runs first — game's `_start_game_run` drops the cached Steam owned-games library so the run reads today's playtime rather than a stale in-memory copy (also wired ahead of Fill Game, for the same reason).
1. `spec.replace_select(db)` picks the entries: for most types `_linked(Model, id_col, link_col)` — rows with `mal_id`/`mal_link` (anime, anime-movie, manga, novel), `imdb_id`/`imdb_link` (movie, tv-show), or `steam_appid`/`steam_link` (game) not null. Cartoon additionally requires `airing_type in ["Movie", "TV"]`. Comic has `replace_select=None` — **no bulk Replace** for comics.
2. Zero entries → logs `Success` with `rows_updated=0` and emits an `info` event `"No {type} entries found to replace"`.
3. Per entry: connection check, progress event, `spec.replace(db, entry, bulk=True)` in a worker thread, commit; failure is rolled back and logged, the run continues; then `replace_sleep` (1 s for the four MAL types, 0 for TMDB/OMDb types, `STEAM_PAUSE` = 0.5 s for game).
4. `replace_after` steps: same as the type's `fill_after` for anime (`derive_ep_previous_all_anime`, `run_sync_anime`), anime-movie, tv-show, cartoon, manga, novel; none for movie.
5. Log `Replace` / `Replace {label}` / `Success`, `rows_updated` = replaced count.

`spec.replace` per type: `apply_single_replace_anime(db, e, bulk=bulk)`, `apply_single_replace_anime_movie(db, e)`, `apply_single_replace_movie(db, e, bulk=bulk)`, `apply_single_replace_tv_show(db, e, bulk=bulk)`, `apply_single_replace_cartoon(db, e, bulk=bulk)`, `apply_single_replace_manga(db, e, bulk=bulk)`, `apply_single_replace_novel(db, e, bulk=bulk)`, `apply_single_replace_game(db, e, bulk=bulk)` — Steam only; re-fetches `autofill_game_from_steam`, never `autofill_game_from_igdb`.

**Replace All** (`execute_replace_all` → `run_all("Replace", REPLACE_ALL, ...)`) covers the eight types with `in_replace_all=True` — game included now that it has a bulk Replace — (comic and studio excluded), then Backup (`Auto`), one master row `Replace` / `Replace All`, same error handling as Fill All.

### 5.2 Single entry — `run_replace_single(spec, db, entry_id, ...)`

Returns a status dict, never raises. `action_specific` is `"Replace for single {label} entry"`.

1. Look up `spec.model.system_id == entry_id`; missing → logs `Failed` (`"{label} not found 404"`) and returns `status_code: 404`.
2. If the spec has `replace`, run it with `bulk=False` in a worker thread; commit.
3. Run every `single_after` function: `run_sync_anime` (anime), `run_sync_anime_movie`, `run_sync_cartoon`, `run_sync_manga`, `run_sync_novel`, `run_sync_comic`, `run_sync_game`. Movie and TV Show have none. Comic has no `replace` at all, so its single hook only re-syncs system options.
4. Log `Replace` / `Success` with `rows_updated=1`; return `{"status": "success", "message": "Successfully updated {display_name}."}`. Any exception → rollback, log `Failed`, `status_code: 500`.

**Write hooks.** The same `execute_replace_single_*` functions are the registry's `write_hook` (`app/registry.py`) for movie, tv-show, cartoon, manga, novel, comic and game (`execute_replace_single_game` now calls `apply_single_replace_game`, so a game saved with a `steam_appid` picks up its Steam data immediately, not just on the next Replace run): the CRUD router factory (`app/routers/_factory.py`, `_run_write_hook`) calls them after every create and update with `action_type="Auto"`, `log_action=False`, and swallows failures (the row is already committed; a 500 here made the SPA retry and create duplicates). Anime instead runs `apply_single_replace_anime(db, anime, force_replace_ratings=False)` synchronously **before** commit (`pre_commit_hook`, `app/services/domain/anime_write.py`); anime movie has no hook.

The manual route `POST /replace/{key}/{entry_id}` calls the same function with `action_type="Manual"`, `log_action=False` — so a single Replace never writes a `DataControlLog` row, whichever way it is triggered.

---

## 6. Calculate All

`run_calculate_all(db)` in `app/services/calculation.py`, in this order:

| Step | Function | What it does |
|---|---|---|
| 1 | `run_post_processing` | `anime_post_processing` for every Anime, `anime_movie_post_processing` for every AnimeMovies, `tv_show_post_processing` for every TVShows, `cartoon_post_processing` for every Cartoon, `manga_post_processing` for every Manga; commit after each type. (Movies, Novel and Comic have no post-processing.) |
| 2 | `run_derive_ep_previous` | `derive_ep_previous_all_anime(db)` — anime is the only type with a franchise-wide derived field left |
| 3 | `run_sync` | `run_sync_anime` (`create_missing_seasonal`, `sync_seasonal_counts`, `extract_system_options`), then `run_sync_anime_movie`, `run_sync_tv_show`, `run_sync_cartoon`, `run_sync_manga`, `run_sync_novel`, `run_sync_comic` (each just `extract_system_options`), then `run_sync_size_groups` (`derive_size_groups` + commit) |
| 4 | `bulk_check_cover_image(db)` | runs the cover check; its result is discarded |
| 5 | log | `Calculate` / `Calculate All` / `Manual` / `Success` |

Any exception logs `Failed` with the message and re-raises (500). Response on success: `{"status": "success", "message": "Full calculation complete."}`. Rules behind each step are in [business-rules.md](business-rules.md).

---

## 7. Cover-image maintenance

All in `calculation.py`; storage helpers come from `app/services/integrations/image_manager.py` (`cover_image_exists`, `list_all_cover_images`, `delete_cover_image`). "Storage" means the local filesystem: every image is a file at `static/covers/{owner_type}/{system_id}.jpg`, and every column holds that whole `{owner_type}/{system_id}.jpg` key. The helpers take the owner type alongside the id. All four actions worked against Google Cloud Storage as well until 2026-09-08; that branch is gone with the rest of the GCP deployment, and the actions are otherwise unchanged. None of these write a `DataControlLog` row.

| Function | Route | What it does | Response keys |
|---|---|---|---|
| `bulk_check_cover_image(db, entry_type)` | `GET /calculate/check-cover-image` | Lists entries whose `cover_image_file` is set but whose file is missing in storage. With `entry_type` only Anime rows with that `airing_type` are checked; without it all nine types are. Also embeds `bulk_check_unused_cover_images`: keys in storage referenced by no row, split into `should_use` (the key names an existing row) and `orphaned` (no row owns it). That scan walks every table that owns an image, `COVER_OWNER_TABLES` — the nine media types plus staff, character, publisher and studio, and casting override photos. Leaving a table out of it reported all of its images as orphaned, and the delete action below then deleted them. | `total_checked`, `missing_count`, `missing[]` (`system_id`, `name`, `entry_type`), `entry_type`, `should_use[]`, `should_use_count`, `orphaned[]`, `orphaned_count` |
| `bulk_set_cover_image_fields(db)` | `POST /calculate/set-cover-image-fields` | For every entry (all nine types) with `cover_image_file` null whose file exists in storage, sets `cover_image_file = "{owner_type}/{system_id}.jpg"`. Covers only: the four entity tables in `COVER_OWNER_TABLES` keep their image in `photo_file` / `logo_file` and are skipped. | `updated_count` |
| `bulk_delete_orphaned_cover_images(db)` | `DELETE /calculate/delete-orphaned-covers` | Deletes every `orphaned` key from the check above, splitting the key back into owner type and id. **Blind spot:** `list_all_cover_images` only walks the owner folders, so an image left at the `static/covers/` root belongs to no owner and this action cannot see it. `scripts/migrate_cover_layout.py --prune-orphans --apply` sweeps both kinds. | `deleted_count` |
| `bulk_download_missing_covers(db, system_ids)` | `POST /calculate/download-missing-covers` | For entries with `cover_image_file` set but the file missing (optionally limited to `system_ids`), clears the field and re-runs the type's autofill so the cover is downloaded again (`force_replace_ratings=False` for MAL types). Skipped: Anime whose `airing_type` is not in `ALLOWED_AIRING_TYPES`, Novel without `mal_link`, Comic without `comicvine_id`, Game without `igdb_id`. Game re-fetches through `autofill_game_from_igdb`, which is the only game autofill that downloads a cover — the Steam half writes columns only. One commit at the end. | `message`: `"Downloaded X of Y missing cover images."` plus `"N skipped (no external source on the entry)."` when any were skipped |

---

## 8. Clean (delete rows the sheet has forgotten)

`scan_orphans(db)` and `apply_clean(db, items)` in
`app/services/pipelines/clean.py`. Routes: `GET /api/data-control/clean/scan`
and `POST /api/data-control/clean/apply`.

### 8.1 The problem it exists for

**Pull only ever inserts and updates.** `execute_pull_specific` upserts each
sheet row and nothing in `pull.py` deletes, so a local row the sheet no longer
mentions survives every Pull All, forever. That is the normal consequence of
the two-machine workflow: delete an entry on **home**, Backup, then
`git pull` + Pull All on **company**, and the entry is still there and no
future Pull will remove it. Deletions do not propagate. Clean is what makes
them propagate, under review.

### 8.2 Scope — thirteen tabs

`Collection`, `Franchise`, `Series`, `Media`, and the nine detail tabs
(`Anime`, `Anime Movie`, `Movies`, `TV Shows`, `Cartoons`, `Manga`, `Novel`,
`Comic`, `Game`).

Everything else in `SHEET_TABS` is deliberately out of scope. The vocabulary
and entity tabs (`System Options`, `Person`, `Studio`, `Publisher`,
`Character`) are excluded because deleting one of those rows does not remove a
row the operator reviewed — it silently rewrites every entry citing it through
`ON DELETE CASCADE` on `media_credit` and `media_tag`. An unused option is
clutter; an orphaned entry is divergence, and only the second is a correctness
problem. The authorization tabs are excluded because the sheet is an ordinary
Google Sheet anyone with access can edit, and a delete path into `Users` would
let a sheet edit remove an account. The per-user tabs are excluded because
those rows belong to somebody.

### 8.3 The two refusals

Both abort the **entire run**, not the current tab:

| Condition | Why |
|---|---|
| `SheetsUnavailableError` on any in-scope tab | A partial read is indistinguishable from "everything the unread tabs cover is orphaned". |
| An in-scope tab with fewer than 2 rows | An empty tab means "delete this entire table". `bulk_overwrite_sheet` already refuses to *write* one, so reading one back means the sheet is wrong, not the database. |

Pull's policy for both is to continue and report. That is right for an upsert
and catastrophic for a delete, and it is the single most important difference
between the two pipelines.

### 8.4 What makes a row a candidate

A row is a candidate only when the sheet knows it by **none** of its
identities. Any single hit spares it.

| Group | Identities, all must miss |
|---|---|
| Entries (found on `Media`) | `system_id`; `(media_type, public_id)`; `display_name` |
| Tiers | `system_id`; `public_id`; `<prefix>_name_en`; `<prefix>_name_cn` |

The arms are **not** equally strong and the code says so. `(media_type,
public_id)` is load-bearing: Backup writes `public_id` on every entity tab and
Pull restores it unchanged, which is what keeps the two machines agreeing on
the ids in URLs. `display_name` is weak and *not* independent — it is
denormalized from the detail tables' `*_name_*` columns — so a rename kills
exactly that one arm.

**This rule was originally copied from `pull.py`'s id-less matching and that
would have destroyed data.** An entry renamed on the other machine misses on
`system_id` and on both names, so a names-only rule reads it as orphaned and
cascades away its credits, sources, notes and every user's list rows. In
`pull.py` the same failed match is harmless — the row simply inserts. **Upsert
forgives a bad match; delete does not.** Whenever an identity rule moves from a
read or upsert path to one that deletes, re-derive it from what actually
round-trips between the two databases.

### 8.5 Entries are found on `Media`, deleted on `Media`

Backup writes both the `media` row and its detail row, so an entry deleted
elsewhere vanishes from both; scanning `Media` alone is sufficient and better,
because `Media` carries the portable pair while the nine detail tabs carry nine
irregular name prefixes (`tv_name_en`, not `tv_show_name_en`).

Deletion targets `media.system_id` because the FK runs
`detail.system_id → media.system_id ON DELETE CASCADE`. Deleting the detail row
alone would leave an orphaned `media` row — a fresh orphan made by the orphan
cleaner.

A detail row with **no** `media` parent is reported as an **anomaly**, never as
a candidate: the FK should make it impossible, and Clean is not the right tool
for a corruption it did not cause.

### 8.6 Blast radius — deleted vs detached

Each candidate carries counts of its collateral, computed before anything is
deleted, split by what the database actually does:

| Group | Rows | On delete |
|---|---|---|
| `deleted` | `media_credit`, `media_tag`, `media_source`, `media_content_label`, `note`, `meme`, `user_media_list` | `CASCADE` |
| `detached` | `quote` | `SET NULL` |

**A quote survives its entry.** `quote.media_id` is nullable by design — "a
quote may belong to no entry, either because it was written that way or because
its entry was later deleted". Reporting it as deleted would be false, and the
review screen is the one place where that precision is the entire point.

A tier candidate carries a `children` count instead: `collection_id`,
`franchise_id` and `series_id` are all `SET NULL`, so children survive their
deleted parent orphaned-but-alive.

### 8.7 Apply re-scans

`apply_clean` re-runs the scan and deletes an id only if it is **still** a
candidate; the rest come back in `skipped` with a reason. This is not redundant
with the scan the operator looked at: a stale review page produces a perfectly
successful delete of rows that stopped being orphans in the meantime. The
question is never "did the delete run" but "is what got deleted still the set
that was reviewed". Re-scanning makes the deleted set a subset of the reviewed
set by construction, and makes a Sheets outage a no-op rather than a
catastrophe.

Tiers delete child-first (`Media`, `Series`, `Franchise`, `Collection`).

### 8.8 Logging

One `deleted_record` row per deleted entry via `log_deleted_record`, staged in
the same transaction as the delete so they land or roll back together; then one
`data_control_logs` row — `Clean` / `Clean Orphans` / `Manual` — with
`rows_deleted` and a per-tab `details_json`. `scan` writes nothing; it is
read-only, like `check/duplicates`.

### 8.9 The review screen

`frontend/src/pages/admin/CleanOrphans.jsx`, reachable from Data Control and
from the nav. Nothing is selected on load. Select-all skips rows created since
the last **successful** Backup — those are marked and must be ticked by hand,
because a row made ten minutes ago is indistinguishable from an orphan here.
With no successful Backup ever, every row counts as new and select-all selects
nothing.

There is deliberately **no freshness gate**: in the workflow that creates the
garbage the sheet is *ahead* of the database, so "back up first" would rewrite
the garbage into the sheet and destroy the evidence.

---

## 9. Check duplicates / remarks

| Route | Function | Returns |
|---|---|---|
| `GET /check/duplicates` | `find_all_duplicates(db)` (`app/services/domain/duplicates.py`) | one key per check: `franchise`, `series`, `anime`, `anime_movie`, `cartoon`, `movie`, `tv_show`, `manga`, `novel`, `comic`, `system_options`, `entities` — each a list of duplicate groups (lists of dicts). Matching rules are in [business-rules.md](business-rules.md). |
| `GET /check/remarks` | `find_all_remarks(db)` (`app/services/domain/remarks.py`) | entries with a non-empty `remark`, grouped by media type (`anime`, `anime_movie`, `movie`, `tv_show`, `cartoon`, ...), newest `updated_at` first, each with `system_id`, its name columns, status and `remark`. |

Neither writes a log row.

---

## 10. The audit log (`DataControlLog`)

`log_data_control(db, action_main, action_specific, action_type, status, rows_added=0, rows_updated=0, rows_deleted=0, error_message=None, details_json=None)` inserts one row into `data_control_logs` and commits on its own; a failure to log is itself only logged, never raised.

| Column | Values used |
|---|---|
| `action_main` | `Fill`, `Replace`, `Pull`, `Backup`, `Calculate` |
| `action_specific` | `Fill {label}`, `Fill All`, `Replace {label}`, `Replace All`, `Replace for single {label} entry`, `Pull {tab_name}`, `Pull All`, `Backup`, `Calculate All` |
| `type` | `Manual` (a button on the admin page) or `Auto` (Backup at the end of Fill/Replace All; write hooks) |
| `status` | `Success`, `Aborted`, `Failed` |
| `rows_added` / `rows_updated` | Pull counts; Fill/Replace put the processed count in `rows_updated` |
| `error_message`, `details_json` | failure text; Pull All's per-tab summary |
| `timestamp` | `get_taipei_now()` |

Status meanings:

- **Success** — the pipeline finished. Per-entry failures inside Fill/Replace do not change this; a Comic budget stop is still Success.
- **Aborted** — the SSE client disconnected (`request.is_disconnected()` raised `CancelledError`); the current entry is rolled back and the count so far is recorded. Only Fill / Replace / Fill All / Replace All can be Aborted.
- **Failed** — an exception escaped the pipeline, or (for `*All`) a sub-pipeline reported an error.

Who logs:

| Action | Logs |
|---|---|
| Fill / bulk Replace of one type from its own button | one row (`log_action=True`) |
| Fill All / Replace All | one master row only — sub-pipelines run with `log_action=False`; the Auto Backup inside it logs its own `Backup` row |
| single Replace (route or write hook) | never (`log_action=False` in both callers) |
| Pull of one tab | one row |
| Pull All | one `Pull All` row **plus** one row per tab (tabs run with `log_action=True`) |
| Backup, Calculate All | one row |
| cover maintenance, checks | nothing |

---

## 11. SSE event shapes

Fill, bulk Replace, Fill All and Replace All stream `text/event-stream`; every event is one line `data: {json}\n\n` built by `_sse(**payload)` in `runner.py`.

| `status` | Fields | When |
|---|---|---|
| `processing` | `current_entry`, `processed`, `total` | before each entry (`current_entry` = `display_name` or `"Unknown {label}"`), before post-processing (`"Running post-processing..."`, `total`/`total`), before each after-step (its message), and `"Synchronizing to Google Sheets..."` (1/1) in `*All` |
| `success` | `message`, `total`, `processed` | the pipeline finished; Fill's message may carry the budget note |
| `info` | `message`, `total: 0`, `processed: 0` | bulk Replace found nothing to replace |
| `error` | `message` (plus `total: 1`, `processed` for the `*All` summary) | the pipeline crashed, or a sub-pipeline under `*All` did |

`run_all` re-emits every sub-pipeline event unchanged and reads them itself to add up `processed` and collect `error` messages. Nothing is emitted on Abort — the client is gone.

---

## 12. Route table — `/api/data-control`

All routes require `manage.pipelines` **and** an unscoped access mode (`require_unscoped_mode`), both declared on the router. `{key}` is a pipeline key: the hyphenated media types `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`, plus `studio` (Fill only). Literal routes are declared before parameterised ones so `/fill/all` and `/pull` are never captured by a sibling.

| Method | Path | Params / body | Response | Does |
|---|---|---|---|---|
| POST | `/fill/all` | — | SSE | Fill All (seven media types plus studio, no comic) then Auto Backup |
| POST | `/replace/all` | — | SSE | Replace All (seven types, no comic) then Auto Backup |
| POST | `/fill/{key}` | — | SSE | Fill one type (all nine keys, studio included) |
| POST | `/replace/{key}` | — | SSE | bulk Replace one type; **not registered for `comic`** (`replace_select is None`) or `studio` (`fill_only`) — `game` is registered (Steam only) |
| POST | `/replace/{key}/{entry_id}` | path `entry_id` = `system_id` | JSON `{"status": "success", "message"}`; 404 when the entry is missing, 500 on failure | single Replace (the eight media keys; **not registered for `studio`**) |
| POST | `/backup` | — | JSON `{"status", "message"}`; 500 on failure | Backup every tab |
| POST | `/pull` | — | JSON `{"status": "success", "details": {tab: processed}}`; 500 when any tab was unreadable or failed | Pull All |
| POST | `/pull/manga`, `/pull/novel`, `/pull/comic`, `/pull/cartoon` | — | JSON `{"status", "processed", "rows_added", "rows_updated"}` | shortcut to the `Manga`, `Novel`, `Comic`, `Cartoons` tabs (registered from `MEDIA_TYPE_FOR_TAB` for those four media types only) |
| POST | `/pull/{tab_name}` | path = exact tab name from section 2, URL-encoded (`/pull/Anime`, `/pull/Anime%20Movie`, `/pull/TV%20Shows`) | same as above; 400 `Unknown tab: ...` for anything else | Pull one tab |
| GET | `/clean/scan` | — | JSON `{tabs, totals, last_backup_at, anomalies}`; **503** when the sheet is unreadable or a tab is empty | find rows the sheet no longer mentions; read-only, logs nothing |
| POST | `/clean/apply` | body `{"items": [{"tab", "system_id"}]}` | JSON `{deleted, per_tab, skipped}`; **503** as above, and nothing is deleted | re-scan, then delete only the named ids that are still orphans |
| POST | `/calculate/all` | — | JSON `{"status", "message"}`; 500 on failure | Calculate All |
| GET | `/calculate/check-cover-image` | query `entry_type` (optional, an Anime `airing_type`) | JSON, see section 7 | cover check |
| DELETE | `/calculate/delete-orphaned-covers` | — | `{"status", "deleted_count"}` | delete orphaned cover files |
| POST | `/calculate/set-cover-image-fields` | — | `{"status", "updated_count"}` | link existing files to rows |
| POST | `/calculate/download-missing-covers` | body `{"system_ids": [..]}` (optional; default all) | `{"status", "message"}` | re-download missing covers |
| GET | `/check/duplicates` | — | JSON, see section 8 | duplicate report |
| GET | `/check/remarks` | — | JSON, see section 8 | remark report |

Fill / Replace / Pull routes for media types are generated from `PIPELINES` and `MEDIA_TYPE_FOR_TAB` at import time; adding a type to those registries adds its routes. The generic listing in [api.md](api.md) covers the same paths in the context of every router.
