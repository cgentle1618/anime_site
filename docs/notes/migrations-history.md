# Migrations history

Last verified: 2026-09-04 (commit 601ceb8)

## What this is for

A one-line account of every Alembic revision in `alembic/versions/`, in chain
order (first applied at the top, current head at the bottom). Use it to
answer "when did column X appear / disappear, and what happened to the data
in it?" without opening 74 files. The **Data migration** column says what the
revision did to existing rows; "schema only" means it added, dropped or
renamed structure and touched no data. Revision ids are the `revision`
strings, not the file names, though the two usually share a prefix.

Run `alembic history` for the authoritative chain; if it disagrees with this
table, the chain wins.

## Chain

| # | Revision | Change | Data migration |
|---|---|---|---|
| 1 | `86982d71c2f1` | Initial migration: replaces unique constraints on `seasonal.seasonal` and `system_configs.config_key` with unique indexes (each step wrapped in try/except so re-runs are harmless) | schema only |
| 2 | `3dac0093a689` | `franchise.cover_anime_id` FK → `anime` (ON DELETE SET NULL) | schema only |
| 3 | `e53735cf60dc` | `anime.completed_at` | schema only |
| 4 | `e20cf35a6d03` | `franchise.watch_next_group` | schema only |
| 5 | `ed0b5635fbf5` | `franchise.to_rewatch` | schema only |
| 6 | `a1b2c3d4e5f6` | `anime.is_main_entry` | schema only |
| 7 | `b2c3d4e5f6a7` | `anime.notes` JSONB | schema only |
| 8 | `f1a2b3c4d5e6` | `series.remark` | schema only |
| 9 | `c3d4e5f6a7b8` | `anime.derive_related` | schema only |
| 10 | `d4e5f6a7b8c9` | Rename `anime_name_romanji` → `anime_name_roman`, `franchise_name_romanji` → `franchise_name_roman` | schema only (rename) |
| 11 | `e5f6a7b8c9d0` | Redesign `deleted_record`: add `name_cn/name_en/franchise_cn/series_cn/category`, drop `franchise/series/anime_cn/anime_en/airing_type` | schema only — old values in the dropped columns were not carried over |
| 12 | `f6a7b8c9d0e1` | `deleted_record.franchise_type` | schema only |
| 13 | `b1423952d9af` | `anime.source_other` VARCHAR → JSONB; drop `anime.source_other_link` | in-place type cast of existing values |
| 14 | `a07b5b312234` | "create anime movie model" — empty `upgrade()`; the `anime_movies` table already existed (created by `create_all`) and this only stamps the revision | none |
| 15 | `12e2e03e7728` | Drop `anime.source_other_link`; `anime_movies.source_other` → JSONB (`::jsonb`), drop `anime_movies.source_other_link` | in-place cast |
| 16 | `fbc168649b9d` | `seasonal.entry_planned` | schema only |
| 17 | `g5h6i7j8k9l0` | `anime_movies.notes` JSONB | schema only |
| 18 | `h6i7j8k9l0m1` | "create movies table" — empty `upgrade()`; table already existed, revision stamped only | none |
| 19 | `676cfee02ccc` | `movies.notes` JSONB | schema only |
| 20 | `i7j8k9l0m1n2` | `movies.imdb_id` INTEGER → VARCHAR via raw `ALTER TABLE` | in-place cast |
| 21 | `6909a0163ef5` | Create `tv_shows` (+ indexes) | schema only |
| 22 | `c78fa567ff9a` | `tv_shows.notes` JSONB | schema only |
| 23 | `j8k9l0m1n2o3` | `tv_shows.source_other` → JSONB; drop `tv_shows.source_other_link` | in-place cast |
| 24 | `8ebb04663811` | `anime_movies.watch_next`, `anime_movies.to_rewatch` | schema only |
| 25 | `4badc000f3c6` | Create `cartoons` (with `imdb_rating`) | schema only |
| 26 | `7ec2ef0fced2` | Create `manga` | schema only |
| 27 | `df0d6478d558` | Create `novel` | schema only |
| 28 | `5236445b7c91` | `novel.alternative` | schema only |
| 29 | `a3b4c5d6e7f8` | `novel.novel_name_each_cn/_en` shape change | rewrites JSONB objects `{key: name}` into arrays of `{"key", "name"}` objects (only rows whose value is still an object) |
| 30 | `k9l0m1n2o3p4` | `franchise.cover_anime_id` → `cover_entry_id` (FK dropped, plain UUID); add `franchise.type_covers` JSONB | rename only |
| 31 | `26086324ca82` | `manga.distributor_tw` → `manga.publisher_tw` | rename only |
| 32 | `l0m1n2o3p4q5` | `franchise.type_slots` JSONB | copies `favorite_3x3_slot` into `type_slots` under the `"ACG"` key |
| 33 | `289f134d3bea` | Drop `franchise.favorite_3x3_slot` | schema only (value already moved by #32) |
| 34 | `r1s2t3u4v5w6` | Broadcast-schedule columns on `anime` | schema only |
| 35 | `s2t3u4v5w6x7` | Create `collection`; `franchise.collection_id` FK; `collection.cover_franchise_id` FK | schema only |
| 36 | `t3u4v5w6x7y8` | Create `watch_order_list`, `watch_order_item` | schema only |
| 37 | `u4v5w6x7y8z9` | Create `quote` | walks every media table's `notes->'quotes_memes'` list, inserts one `quote` row per item (skipping empties), then strips the `quotes_memes` key from the JSONB |
| 38 | `v5w6x7y8z9a0` | `watch_order_list.is_most_recommended` | sets `false` on all existing rows (NULL would be ambiguous) |
| 39 | `w6x7y8z9a0b1` | Create `meme`; drop `quote.kind` and its check constraint | schema only |
| 40 | `x7y8z9a0b1c2` | `watch_order_list.auto_source` | schema only |
| 41 | `y8z9a0b1c2d3` | `meme.media_type/entry_id` → `owner_type/owner_id` (owner may now be any tier); indexes renamed | rename only |
| 42 | `z9a0b1c2d3e4` | Meme content collapses to `text` + `quote_id` (FK → quote, SET NULL, unique); drop `meme.content` JSONB | joins the old `content` array's lines into `text` and lifts the first quote reference into `quote_id` before dropping the column |
| 43 | `wo_series_owner` | `watch_order_list.series_id` FK; single-owner CHECK widened to three columns; `collection.no_built_in_orders` | sets `no_built_in_orders = false` on existing collections |
| 44 | `note_add_table` | Create `note` (+ `ix_note_owner_section`) | schema only |
| 45 | `wo_item_importance` | `watch_order_item.importance` replaces `is_optional` | `is_optional IS TRUE` → `'Optional'`, everything else (incl. NULL) → `'Normal'`; then drops the flag |
| 46 | `note_backfill_rows` | Backfill `note` from the seven media tables' `notes` JSONB | expands every section into rows (splits `special_*` into op/ed changes + extended episodes, maps `episode_comments` objects, normalises `name_link` to a link list, skips already-migrated quote sections); every inserted row is stamped `2026-08-23 00:00:00` so downgrade can delete exactly these rows; unmappable items are logged |
| 47 | `note_drop_jsonb` | Drop `notes` JSONB from the seven media tables | schema only (data already moved by #46) |
| 48 | `s1e2r3i4e5s6` | Franchise-style columns on `series` (names, cover_entry_id, stats…) | schema only |
| 49 | `media_relation_add` | Create `media_relation` (+ from/to indexes) | schema only — table starts empty, derived prequel/sequel values were deliberately not migrated |
| 50 | `media_relation_drop_legacy` | Drop legacy `prequel_id`/`sequel_id`/`alternative`/`derive_related` columns from the media tables | schema only |
| 51 | `r1e2m3a4r5k6` | Fold each owner table's `remark` column into the `remark` note section; drop the columns; add a partial unique index on `(owner_type, owner_id) WHERE section = 'remark'` | first collapses duplicate remark notes (oldest wins, extras' text appended), then appends the column text under an `original remark:` label where a note exists, or inserts a new unlabelled note where none does |
| 52 | `n1o2t3e4u5n6` | Retire the `unread` note section | relabels `unread` rows as `resources`, placing them after the owner's existing resources by `sort_index` |
| 53 | `l1o2c3a4t5o6` | `note.episode` → `note.locator` | rename only |
| 54 | `a0b1c2d3e4f5` | Create `comic` | schema only |
| 55 | `drop_entry_watch_order` | Drop the per-entry `watch_order` column from the media tables | schema only |
| 56 | `cv1d2e3f4a5b` | `comic.comicvine_id`, `comic.comicvine_link` | schema only |
| 57 | `m1u2s3i4c5t6` | `note.status`; fold `anime.op/ed/insert_ost` into music note rows; drop those columns | inserts one note per non-blank column value (idempotent via NOT EXISTS), with the old text stored in `status` |
| 58 | `i1n2s3e4r5t6` | Retire the `insert` music section in favour of `insert_songs` | deletes `note` rows with `section = 'insert'` |
| 59 | `ws1e2c3t4i5n` | Create `watch_order_section`; `watch_order_item.section_id` FK | schema only |
| 60 | `wo_flat_order` | Flatten reading order into `watch_order_item.position` | per list, renumbers items 1..n in the old (unfiled first, then section-by-section) order and re-anchors each section's `position` in the item stream |
| 61 | `d1e2f3a4b5c6` | Truncated ISO-8601 release dates: `anime.release_date` replaces `release_year`+`release_month`; year columns on other tables renamed/retyped to String; CHECK `^\d{4}(-\d{2}(-\d{2})?)?$` on every release column | merges anime year+month; rewrites every existing value through the shared parser; unparseable values are logged and left NULL; constraints applied only after all rows are canonical |
| 62 | `b872c435410b` | Create `plan_next`; `size_group_derived`/`size_group_manual` JSONB on `franchise` and `series`; drop the seven entry `watch_next` booleans and `franchise.watch_next_group` | inserts an entry-scope row per `watch_next IS TRUE`; inserts franchise-scope anime rows from `watch_next_group` and carries the old bucket into `size_group_manual->'anime'` |
| 63 | `9b0bcb763e8c` | `plan_next.kind`; unique key widened to include kind; index swapped; drop nine `to_rewatch`/`to_reread` booleans | existing rows get `kind = 'next'`; inserts `rewatch` rows per flagged entry (cartoon entry flags discarded) and per (group, media type actually held by child entries) for flagged franchises/series |
| 64 | `0ac5add00888` | `server_default='next'` on `plan_next.kind` | schema only |
| 65 | `so1p2t3i4o5n` | `system_options` → `system_option` (`value`, `system_id` UUID PK, `remark`, sort/flags); create `system_option_scope` | assigns a UUID to every row, deletes duplicate (category, value) rows keeping the lowest id, then swaps the primary key; legacy integer `id` kept nullable for #68 |
| 66 | `p1e2r3s4o5n6` | Create `person`, `person_role`, `studio` | schema only |
| 67 | `c1r2e3d4i5t6` | Create `media_credit`, `media_tag` link tables | schema only |
| 68 | `m1i2g3r4a5t6` | Backfill credits and tags | parses the legacy comma-joined credit/tag string columns on every media table into `person`/`studio`/`media_credit`/`media_tag` rows via the app's backfill service; prints an "unplaced" report instead of guessing |
| 69 | `d1r2o3p4c5o6l` | Drop the legacy credit/tag string columns from all eight media tables and `system_option.id` | verifies the backfill first (logs mismatches) — no data rewritten |
| 70 | `n1u2l3l4s5n6d` | `uq_person_name`, `uq_studio_name`, `uq_person_role` recreated as `UNIQUE NULLS NOT DISTINCT` (raw SQL) | merges duplicate persons/studios into the oldest row, repoints `media_credit` and `person_role`, dedupes the resulting credit/role rows, deletes the losers |
| 71 | `r1b2a3c4c5o6` | Create `role`, `role_permission`; `users.role_id` FK | seeds the roles first, then sets each user's `role_id` by matching the old `users.role` string by name, falling back to `guest` |
| 72 | `c1o2n3t4e5n6` | Create `content_label`, `media_content_label` | schema only |
| 73 | `d1r2o3p4r5o6` | `users.role_id` NOT NULL; drop the `users.role` string | any user still without a role_id is set to `guest` |
| 74 | `l1a2b3e4l5o6` | Seed the `"Label"` system-option category | inserts `會跳OP`, `吃飯不宜觀看`, `很多福利` with `anime` scope, each guarded by `WHERE NOT EXISTS` so hand-added duplicates do not abort the migration |
| 75 | `s1t2u3d4i5o6` | Reshape `studio` to four optional names plus the profile columns | `name_native` → `name_en` (lossless over the 77 rows), adds `name_jp`, `name_alt`, `display_name_field`, `founded_date`, `defunct_date`, `country`, `website_url`, `mal_id`, `mal_link`; recreates `uq_studio_name` over all four names with NULLS NOT DISTINCT plus three CHECKs |
| 76 | `r0l1c2o3l4p5` | Collapse the person-role vocabulary to five media-type-scoped types | rewrites `media_credit.role` (372 rows: `manga_author_plot` → `author`, `comic_artist` → `illustrator`, …), rebuilds `person_role` onto the new keys with a hyphenated media-type `scope`, then makes `scope` NOT NULL. **A Sheets backup taken before this revision can no longer be restored directly** — its `Person Role` tab has empty scopes and retired role names; `alembic downgrade s1t2u3d4i5o6`, Pull, then upgrade again (verified to round-trip 791 → 555 → 791 rows exactly) |
| 77 | `p7n8a9m10e11` | Reshape `person` to match `studio` | adds `name_jp`, `name_alt`, `display_name_field`; distributes the 554 `name_native` values through `name_slot_for` (218 en / 165 cn / 171 jp — every row verified to land where the rule says); drops `name_native`; recreates `uq_person_name` over all four names with NULLS NOT DISTINCT plus `ck_person_has_a_name`. The downgrade rebuilds `name_native` from `COALESCE(name_cn, name_jp, name_en, name_alt)` |

## Patterns worth knowing

- **Stamp-only revisions** (#14, #18): the dev server's `create_all` had
  already created the table, so the migration is empty. See the local DB
  notes in `setup-local.md` for why `create_all` and Alembic race.
- **Move data, then drop** is done as two revisions when the moved data is
  large or risky (#32→#33, #46→#47, #65/#68→#69) so a failed step leaves the
  source intact.
- **Idempotent inserts** (`WHERE NOT EXISTS`) are used wherever a partial
  upgrade could be re-run (#57, #74) and wherever a live admin may have
  created the same row by hand (#74).
- **Reports over guesses**: the credit backfill (#68) and the column drop (#69)
  print unplaced/mismatched values instead of inventing links; the release-date
  rewrite (#61) logs unparseable values and leaves them NULL.
