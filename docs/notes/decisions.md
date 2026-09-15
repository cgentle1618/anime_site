# Design decisions

Last verified: 2026-09-15

## What this is for

A dated log of the choices that shaped the code and, where it matters, the alternatives that were rejected. Read it before proposing a change that "obviously" simplifies something: the odds are the simpler shape was considered and turned down for a reason listed here. Each entry names the spec that produced it; the spec files themselves have been retired, so the date and name are the only attribution that remains.

## 2026-05

### Mark Completed endpoints (spec: 2026-05-08 mark-completed)

- Dedicated `POST /{id}/complete` on each router instead of the frontend PATCHing individual fields; the backend owns the completion rules.
- Fixed a manga bug where the frontend path forgot `ch_fin`, `vol_fin` and serialization updates.
- `completed_at` is set only when it is `None`.
- Endpoints reuse the existing `*Response` schemas.
- Auto-complete detection inside `apply_single_*` is untouched.

### Session expiry redirect (spec: 2026-05-09 session-expiry) — not implemented

- Proposed a centralised `apiFetch` that does a full-page redirect to `/login?next=` on 401 (excluding `/api/auth/login`) with credentials implicit.
- Abandoned. `fetchJson` throws and nothing redirects.

### Plan page (spec: 2026-05-14 plan-page)

- Watch Next and To Rewatch moved off Statistics to a dedicated public Plan page.
- Components were renamed, not rewritten; `statsUtils` is shared.
- `usePlanData` mirrors `useStatisticsData`.

## 2026-08

### Series structure (spec: 2026-08-23 series-structure)

- The series hub resembles the franchise hub without duplicating it: no `franchise_type`, no `collection_id`, no `type_covers` (a `cover_entry_id` instead), no `type_slots`, no `watch_next_group`, no new ORM relationships.
- Column declaration order equals sheet order.
- Main Cover is set only on Modify.
- Tabs are gated on list length; Watch Order and Notes are always on.
- `SeriesModal` retired.
- Anime movie is excluded (it has no `series_id`).

### Media relations (spec: 2026-08-23 media-relations)

- One polymorphic `media_relation` table replaces `prequel_id`, `sequel_id`, `alternative` and `derive_related`.
- FK-less `(media_type, entry_id)` pairs; a missing endpoint is served with `missing=True`.
- Rejected: mirrored rows, and per-table JSONB.
- A prequel is stored as a swapped sequel.
- Symmetric kinds sort their endpoints.
- The `RELATION_KINDS` registry is served over HTTP.
- 409 on self-relation or duplicate.
- The table started empty; derived values were not migrated.
- `is_main_entry` unchanged.
- The franchise/collection picker is a lens, not ownership.
- Reads are public, writes admin.

### Notes restructure (spec: 2026-08-23 notes-restructure)

- One polymorphic `note` table plus a backend section registry replaces the notes JSONB column. Rejected: table-per-shape, and JSONB with a backend schema.
- Registry in `app/utils/note_sections.py`.
- `text_links` carry an optional episode.
- Similar keys across types are kept distinct on purpose.
- Highlights got kinds; `special_*` split into `op_ed_changes` and `extended_episodes`.
- Episode-anchored sections stop at entry level; quotes are entry-only, memes are on all owners.
- Violations return 422; the migration logged unmappable values.
- Notes are edited only on the notes page.

### Remark as a note section (spec: 2026-08-23 remark-to-note)

- The `remark` column collapsed into the `remark` note section; the read path is a read-only `column_property`, so schemas and Sheets were untouched; remark leaves the entry sheets and lives in the Note tab.
- `pop_remark` distinguishes absent from empty; empty text deletes the row; last write wins.
- The migration merged existing text under an "original remark:" label; parsers drop remark.
- Accepted the correlated-subquery cost.

### Relations graph (spec: 2026-08-25 relations-graph)

- A canvas replaces the text list. Rejected: a second tab, a full-bleed overlay, persisted positions, hand-rolled SVG, Cytoscape.
- `@xyflow/react` + dagre, with a dedicated `/graph` endpoint.
- Ghosts are laid out like nodes; unconnected entries sit in a tray.
- Edges carry `label` and `inverse_label`; nodes are keyed `"type:id"`.
- Equivalence groups contract via union-find; branch and derivation edges get lower weight.
- Positions are stable across writes.
- The confirm popup is a sentence with a swap control; timeline edges have no chip, equivalence edges no arrowhead.
- Layout functions are pure.

### Comic entry (spec: 2026-08-26 comic-entry)

- Comics are runs; events and eras are labels, not entries.
- Modelled on Novel with Western-shaped columns; display order EN → CN → Alt; events comma-joined.
- `read_next` / `to_reread` columns were created early.
- Registered through the factory registry.
- No fill queue originally; `progress_display` dropped; an external API was deferred and then adopted (Comic Vine).

### Comic parity (spec: 2026-08-28 comic-feature-parity)

- Scope came from an audit of every file naming manga but not comic.
- Issue ranges are allowed in watch orders.
- The empty-Notes-card fix is general, not comic-specific.
- Duplicates are keyed on `comicvine_id` plus names.

### Release dates (spec: 2026-08-28 iso-release-dates)

- Truncated ISO strings. Rejected: DATE plus a precision column, and free text.
- A CHECK constraint per column; one helper module owns parse, validate, normalize and display.
- Multi-region columns kept; movie flips to TW-first.
- A year-only value leaves `release_season` untouched; anime year is the first four characters.
- Sheets get an apostrophe prefix (rejected RAW mode).
- Unparseable rows were logged and left NULL.

### Plan next (spec: 2026-08-29 plan-next)

- One `plan_next` table replaces `watch_next`, `read_next` and `watch_next_group`; row existence is the boolean.
- FK-less `(scope, media_type, target_id)`; rejected three nullable FKs. `media_type` is stored for entry scope too, and a franchise may appear once per type.
- `size_group_derived` and `size_group_manual` JSONB; manual wins per key.
- Comic buckets 1-3 / 4-10 / 11+ came from real data (35/35/29).
- An entry's bucket inherits series → franchise, except comic on `issue_total`; anime sums `ep_total`.
- Scope is validated in the API; virtual `watch_next` / `read_next` fields are kept.
- Reads public, writes admin.
- Both JSONB fields must be in the parsers with a round-trip test; the Plan page is config-driven.

### Rewatch levels (spec: 2026-08-29 rewatch-levels)

- `plan_next` gains `kind`. Rejected: a second table, JSONB on tiers, renaming `plan_next`.
- The per-type scope map differs from Watch Next (anime and cartoon are franchise-only).
- `kind` is validated in the API; requests default to `"next"` (a server default was added later).
- Nine `to_rewatch` / `to_reread` columns dropped; the cartoon entry flag discarded.
- The backfill reads child entries, not `franchise_type`.
- Plan page sections by scope with a shared toggle control; Calculate untouched.

### System options redesign (spec: 2026-08-29 system-options)

- Three tiers decided by "does code branch on the exact value?". Tier 1 stays in `constants.py` (Main/Spinoff and Region moved there; Dub Preference dropped).
- One vocabulary with explicit scopes: a value with no scopes is offered everywhere; person scope is explicit, not derived.
- Gender lives on the person base; `studio` means anime studios only.
- `media_credit` and `media_tag` are FK-less; `media_tag.field`, not `category`.
- Credit roles and person roles are separate.
- Everything becomes a link row; no nullable FKs on entries.
- The migration reports rather than guesses; delete cascades, merge handles duplicates.
- `/api/constants` is read-only.
- Entry sheets keep comma-joined columns generated from the links.
- `manga.anime_studio` is out of scope (belongs in relations); `character` belongs to franchise (deferred).

### View authorization (spec: 2026-08-29 view-authorization)

- RBAC, not tiers. Permissions are a code registry; grants live in the DB.
- Labels on entries never name roles; a dedicated `media_content_label` table (not `media_tag`, which the pipelines write).
- The admin role is `is_superuser`.
- The JWT carries `sub` only; permissions are resolved per request and cached by role id.
- Day-one behaviour-identical guest seed; `resolve_viewer` never raises and fails closed to guest.
- 401, not 403.
- One helper wires the media-type and label gates; a `NOT EXISTS` anti-join in SQL.
- Hidden means missing (404); hidden resolver pairs are dropped.
- Pre-existing unauthenticated `data_control` and `system` GETs were closed.
- Accepted residuals: seasonal counts, empty hubs, static covers.
- Field gating works on a copy, never `setattr` on live ORM rows; a field-group registry with a drift test.
- `PUT /permissions` replaces the whole set.
- The label picker is rendered once in Add and Modify.
- `ensure_rbac_seed` is idempotent and runs from both the migration and lifespan.
- `users.role` was kept, then dropped and re-exposed via `column_property`.
- Visibility tests assert on `response.text`.

## 2026-09

### Media sources (spec: 2026-09-04 media-sources)

- **The rule that decides column versus row:** a link the system *acts on* is a
  column; a link that is only ever *displayed* is a `media_source` row.
- By that rule `mal_link`, `imdb_link`, `comicvine_link` and their `*_id`
  partners stay columns — `derivation.py` parses ids out of them, the Fill
  pipeline keys on them, and `checking.py` and `calculation.py` gate on their
  presence. `official_link` and `twitter_link` become rows: `autofill.py` writes
  them and nothing reads them. `anilist_link` was read and written nowhere at
  all.
- **Rejected: dragging the id-bearing links through the polymorphic table** so
  everything lives in one place. The Fill pipeline would then have to find its
  own key through a join, which is strictly worse than a column.
- The Sources card composing from two places is accepted, because the split is
  principled rather than historical — and `SourcesCard` already did exactly
  that.

### Novel units (spec: 2026-09-04 novel-units)

- **One `novel_unit` table with a kind discriminator**, not separate
  `novel_volume` / `novel_arc` tables. "Other" spans volume, story and chapter,
  so separate tables would mean three tabs, three editors and per-type branching
  in every layer.
- **Rejected: structured JSONB on the novel row.** It keeps the single-row
  Sheets round trip and is the established local pattern, but Postgres enforces
  nothing inside it, every edit rewrites the whole array so two concurrent edits
  to different volumes lose one silently, and adding a field means a hand-written
  document rewrite rather than a migration.
- **Unit rows are optional for volumes and authoritative for arcs**, and the
  asymmetry is deliberate. Listing volumes is enrichment, so the denominator
  stays `vol_total_original` / `vol_total_tw` and `vol_fin` may legitimately
  exceed the number of volume rows. An arc row carries `ch_count`, which lives
  nowhere else, so when arc rows exist `arc_total` and `ch_total` derive from
  them; with no arc rows a web novel falls back to the flat `ch_fin` / `ch_total`
  pair.
- **The reading cursor lives on the novel, not on the units.** `arc_fin` counts
  *fully finished* arcs, so the arc being read is `arc_fin + 1` and
  `ch_fin_in_arc` is the position within it. Rollover is normalised server-side
  on write, so the Sheets restore path and a hand-edited sheet get the same
  guarantee as the UI. Rejected: a `finished` boolean or per-unit `ch_fin`, which
  would express non-linear reading that does not happen.
- **Carry stops at the last recorded arc.** If `arc_fin` equals the arc count,
  `ch_fin_in_arc` is left as it stands rather than clamped — an ongoing web novel
  is read into an arc nobody has recorded yet, and clamping would discard that
  progress silently.
- **Derived columns stay stored.** `arc_total`, `ch_total` and absolute `ch_fin`
  are recomputed on every write but remain real columns, because `_TOTAL_FIELDS`,
  `mark_novel_completed`, the dashboard cards and the Plan page already read
  them. This follows the existing `run_sync_*` idiom rather than inventing a
  second one.
- **A unit's name is a key plus a title, per language** — `unit_key`, `name_cn`,
  `name_en`, all optional. One row holding both languages fixes by construction
  the drift bug that two positional JSONB lists had. Fallback is display-time
  only: an empty `unit_key` renders a generated one from kind and position.
- **`vol_total_original` is relabelled, not renamed.** Renaming it would move a
  Sheets header, and headers are the restore contract —
  `credit_roles.LEGACY_SHEET_COLUMN` exists precisely because they must not move.
  Only the label changes, to "Total Volumes (JP/KR)".
- **`progress_display` narrows but stays a stored column**, so an entry that
  wants to override still can and the migration is a no-op for existing rows.

### Studio entity (spec: 2026-09-04 studio-entity)

- **Four plain nullable name columns** — `name_en`, `name_cn`, `name_jp`,
  `name_alt` — with a CHECK that at least one is set, replacing a NOT NULL
  `name_native`. Chosen because it is the shape the media tables already use.
- **Rejected: keeping `name_native` as a derived cache** of the display name. It
  would leave the unique constraint and resolver untouched, but the migration and
  Fill/Pull both write around the API, so the cache would go stale exactly where
  it matters.
- **Rejected: a `studio_name` alias table.** The most honest model — it is what
  `_find_by_name` already pretends is true — but it diverges from every other
  name-bearing table and complicates every form, for four fields.
- **`country` is a plain String column.** `system_option` holds values no code
  branches on, which country qualifies as, but `media_tag` keys on
  `(media_type, entry_id)` and a studio is not a media entry, so options would
  need a new link table. A plain column can be promoted later without breaking
  readers.
- **The display name is chosen per row**, not by a hard-coded chain:
  `display_name_field` holds `en | cn | jp | alt` or NULL, resolving to the
  chosen field, then `en → cn → jp → alt`, then `""`. This is the first entity in
  the repo where the choice is data rather than code — every other display name
  is a chain written into the model.

### Person entity (spec: 2026-09-04 person-entity)

- **One role vocabulary of five**, with `CREDIT_ROLES` and `PERSON_ROLES`
  collapsed into the same list: `director`, `producer`, `composer`, `author`,
  `illustrator`. `studio` stays a credit role with no person role. The six labels
  that vary by media type are **derived, not stored** — `author` renders 原作 /
  Author / Writer and `illustrator` renders 作畫 / Illustrator / Artist.
- **Rejected: keeping `media_credit.role` on its own vocabulary** and mapping it
  onto `(person_role, scope)` in code. It avoids migrating credit rows, but the
  two-vocabulary split that this change exists to remove would survive in the
  stored data and every reader would need the map.
- **Every `person_role` row carries a scope, and `scope` is NOT NULL.** There is
  deliberately no unscoped "offered everywhere" state, which is the opposite of
  `system_option_scope` — and the difference is the whole point. Under "zero means
  everywhere", the *first* scope row flips a value's meaning from all media types
  to one, which is the bug ruling R27 had to ban auto-scoping for tags to avoid.
  Person credits *are* auto-scoped, so copying the tag rule would rebuild that
  bug; removing the "everywhere" state makes auto-scoping purely additive and the
  trap structurally impossible rather than merely mitigated.
- The cost is two similarly-named `scope` columns meaning different things, paid
  for with a comment on `PersonRole` and a warning in the UI.
- **A credit write sets both role and scope.** Crediting 原作 on a manga gives the
  person `(author, manga)`, so a director arriving through Fill or Pull appears in
  the dropdown without an admin visiting a form. `director_scope_for()` and
  `DIRECTOR_ANIME_MEDIA_TYPES` were deleted: the scope *is* the media type.
- **An ambiguous name raises rather than picking a winner.** `_find_by_name`
  returns None on zero matches, the row on one, and **raises on two or more**.
  `resolve_person` is find-or-create and runs on every automated write path, so a
  false match silently attaches one person's credits to another; with names spread
  across four columns, two people holding 高橋 in different columns are two legal
  rows. Rejected: narrowing which columns are searched — the Sheets round trip
  requires a display name written from any of the four to resolve back, so the fix
  belongs at the ambiguity, not the width. Raising turns a silent wrong match into
  a visible per-row failure naming both candidates, which the pipelines already
  report and the duplicate-check page already exists to resolve. `Studio` inherits
  the same behaviour through the same function.

### Novel fill from Open Library (spec: 2026-09-05 novel-openlibrary-fill)

- **The stored id is an anchor book, not the entry.** One entry may cover several
  books and no books API has an identifier for "the trilogy as one thing", so the
  work id names book 1. Fill writes only what is true of the whole entry when read
  off the anchor — `release_date`, `cover_image_file`, the author credit — and
  **refuses** what the anchor cannot know: `end_date`, `vol_total_original`,
  `serialization_status`.
- **Rejected: searching by title and merging the result set.** Fuzzy matching
  across editions, box sets, audiobooks and reprints picks the wrong record
  silently, and a live probe found Open Library's title search unreliable even
  when the book exists.
- **Open Library over Google Books.** Google wins on publisher and page count,
  neither of which is written here; against that it needs a new API key whose
  keyless quota is *already exhausted* from this IP (verified: HTTP 429), and its
  volume ids are edition-specific where Open Library work ids survive reprints.
- **The date comes from the earliest edition, not the obvious field.** A live
  probe found `work.first_publish_date` unpopulated on every work checked, and
  earliest-edition-year beat `search.first_publish_year` (Gatsby 1925 vs 1920)
  and never lost.
- **Year precision is not a compromise.** Comic Vine already writes
  year-precision `release_date` fill-only, and `ck_novel_release_date_iso`
  already accepts a bare year.
- **Fetch only what is missing** — 1 to 3 calls driven by flags, where every
  other client in the repo fetches unconditionally. The reason is payload:
  `editions.json?limit=1000` returned 1000 entries for one book, and because
  writes are fill-only an entry that already has a `release_date` can never use
  that response.
- **`covers` uses `-1` as a "no cover" sentinel**, so an unfiltered `covers[0]`
  eventually downloads a 404.
- **MAL wins when both ids are present.** Tenrai returns strictly more, so
  `mal_link` takes precedence and Open Library fills only where MAL is absent —
  keeping novel's fill path a routing choice rather than an orchestration like
  `imdb.py`'s TMDB + OMDb merge.
- **Per-volume ids were rejected for v1, not ruled out.** Putting a book id on
  each `novel_unit` row is the *correct* model and would reuse the units
  machinery, but it costs a column, N calls per entry, a fill path for child rows
  that nothing else has, and a link field per volume — for the minority entry
  shape. The two are additive: the anchor stays the entry-level date and cover
  source even after volumes gain their own ids.

### Seiyuu and characters (spec: 2026-09-05 seiyuu-character)

- **The cast list has exactly one home.** `character_casting` is the only cast
  record, and an anime's seiyuu list is *derived* by walking its castings. **No
  `media_credit` row with `role="seiyuu"` ever exists.** Rejected: keeping both,
  which gives one fact two sources of truth that can silently disagree — adding a
  casting would not add the seiyuu to the anime's cast.
- **`seiyuu` stays in the one vocabulary, with a new `credited_via` axis.**
  `CreditRole` gains `credited_via`, and `seiyuu` declares
  `credited_via="character_casting"`. Rejected: splitting `PERSON_ROLES` into its
  own tuple, which rebuilds the two-lists-that-drift problem the 2026-09-04
  collapse removed. Rejected: deriving seiyuu-ness from casting rows with no
  `person_role` change, which fails the case `PersonRole` exists for — a seiyuu
  added today must appear in the dropdown before their first casting exists.
- **A character has no owner and links to many entries.** An earlier design gave
  `character` a nullable `franchise_id`; rejected because a character appears in
  entries that need not share a franchise.
- **No `language` column** on castings. It would read "Japanese" on every row
  until the day a dub is entered, and complicate the unique key. Dubs are a later
  widening and adding the column then is additive.
- **Casting is per entry with no default.** Rejected: a NULL entry meaning "her
  usual seiyuu" with overrides — every read would resolve override-then-default
  and "who voices her here" would have two answers. The casting row *is* the
  record, so recasts are free.
- **The table is `character_casting`, not `character_appearance`.** "Appearance"
  reads two ways, and the moment the row carries a `photo_file` the wrong reading
  wins — the same ambiguity `CLAUDE.md` tracks for the word "label".
- **Character names carry no unique constraint**, unlike `person` and `studio`.
  A human's or company's full name is nearly unique; "Yuki" and "Ichika" recur
  across unrelated works, and with no owning franchise there is nothing to scope a
  constraint to. This is a real divergence from the two sibling tables and is
  commented as one, or a future reader will "restore" the missing constraint.
- **Consequence: `POST /api/character` is a plain create, not find-or-create.**
  `POST /api/person` is find-or-create and safely so, because two spellings of one
  director really are one human. The same rule on characters would unify the Yuki
  of one work with the unrelated Yuki of another — exactly the collision the
  missing constraint accepts as normal. Disambiguation moves to the UI: the
  combobox lists existing matches *with the entries they appear in*, and minting a
  new row takes an explicit choice.
- **Deleting a seiyuu must not delete the character's casting.**
  `media_credit.person_id` is `ON DELETE CASCADE` because the credit *is* the
  person's link to the work; a casting is the *character's* link, so
  `character_casting.person_id` is **`ON DELETE SET NULL`** while `character_id`
  cascades.

### Games as a media type (spec: 2026-09-06 games-media-type)

- **One `games` table, not two.** A DLC is a `games` row with
  `game_type = "DLC"` and a self-FK `base_game_id`. The Anime / Anime Movie
  split exists because those are different metadata shapes from different
  sources; a game and its DLC share nearly every column and differ mainly in
  having a parent. It also keeps the cross-table discriminator space small —
  `MEDIA_TABLES` gains one key rather than a pair, so notes, quotes, relations,
  tags and credits each gain one value. **`base_game_id` stays nullable**: a DLC
  is often entered before its base game, and a write that fails on ordering is
  worse than a link filled in later.
- **Completion is three axes, not one dropdown.** An early draft had a single
  six-value `completion_level`; it was three questions in a trench coat with
  incoherent ordering. Now `completion_level` is a genuine ladder that statistics
  can sort on, `all_endings` is orthogonal (every ending can be seen on a
  main-story run, or missed on a Completionist one), and achievements are a
  **count**, because they move independently and in-game 100% and full
  achievements routinely disagree.
- `completion_level` is independent of `playing_status`: *Active Playing* +
  *Main Story* is the common state of having rolled credits and still playing.
  `mark_game_completed` sets the status and leaves all four completion fields
  alone — only the user knows the depth.
- **Ownership lives in `game_copy`, not `media_source`.** An earlier draft put
  it on `media_source`, reasoning that "where can I watch this" and "which
  storefront do I own this on" are one question. That held at one field and broke
  at six — at that size it is a purchase record, and putting it on a table shared
  by nine media types means six columns meaningless for eight of them.
  `media_source` is **unchanged**, and the split is *where can I play* versus
  *what do I own*. Entry-level ownership is **derived** through the registry's
  `extra_filters` hook with an `EXISTS` subquery, so there is nothing to keep in
  sync.
- **Playtime is the progress unit**, being the one number every game has.
  Estimates are three columns matching the three public tiers — and they come
  from **IGDB, not HowLongToBeat**, which publishes no official API; what
  circulates is an undocumented internal endpoint that breaks when the site
  changes. HowLongToBeat survives as a `media_source` link.
- **IGDB has no crew or staff data at all** — no directors, composers or
  writers, and no people endpoint. The credit design follows that honestly: a
  game's **developer is its `studio`** (no new `developer` role), `publisher` is a
  new role and new target, and `director` and `composer` are widened but
  hand-entered. `author`, `illustrator`, `producer` and `seiyuu` are not extended
  to games.
- **Player type and genre are tags, not columns**, and multi-value is what makes
  the awkward cases vanish: Minecraft is `{Single-player, Multiplayer}` and needs
  no "Both", PvPvE is `{PvE, PvP}` and needs no compound value. `game_genre` and
  `game_theme` stay separate because IGDB draws the same line — mechanical versus
  thematic.
- **A new note shape, `SHAPE_NAME_ENTRIES`, on a nullable JSONB `note.entries`.**
  A guide is a name plus an ordered run of items that are each either a note or a
  link, which none of `title` / `content` / `links` holds. Rejected: widening
  `links` to hold richer objects — no migration, but `links` would then mean
  plain URLs in seven sections and objects in two, and every reader would have to
  know which.
- **Publisher becomes an entity, with a separate `publisher` table rather than
  reusing `Studio`.** Reuse would give companies that both develop and publish
  one row instead of two, but most publisher values are Taiwanese distributors
  that never developed anything, and putting them on `/library/studio` would make
  that page mean something vaguer. The duplicate-row cost is accepted and narrow.
  This is a **schema** change, not just registry data: `media_credit` guarded
  `num_nonnulls(person_id, studio_id) = 1`, so a third target needs a column, a
  widened CHECK, a widened unique constraint, and a third case at roughly ten
  code sites — one of which (`credits.py`) had `if target == "studio": … else:`
  where `else` **means person**, so a publisher role would silently have created
  a `Person`.
- **One inherited gap was fixed rather than copied:** deleting a studio does not
  call `delete_cover_image` — that cleanup exists only for media entries.
  `Publisher` does not inherit the leak.
- **Vocabulary is Chinese; IGDB's English is an alias.** A new
  `system_option_alias` table answers "what does an external source call this
  value", taking the same shape as `system_option_scope` and
  `system_option_usage` so a reader who knows those understands it on sight. An
  IGDB value with no alias row is **logged, not silently dropped** — a new genre
  should surface as a gap in the Options page, not vanish. Rejected: a Python
  dict in the client, which would have worked but needs a deploy to retranslate.
- **Scope rows are mandatory when seeding game vocabulary.** A value with no
  scope rows is offered *everywhere*, so without them 角色扮演 leaks into anime's
  genre picker — the exact failure ruling R27 was written about. This is a
  seeding requirement with a test.

### Steam integration (spec: 2026-09-06 steam-integration)

- **The appid comes from IGDB**, which already carries it in `external_games`
  where the Steam row is `category = 1`. The link is **synthesised** from the
  appid rather than read from `websites`, so its shape is ours and stable.
- **A hand-typed link wins**, via an extractor mirroring the IGDB one, including
  its rule that an unparseable link leaves an existing id untouched. The game
  spec runs both extractors, as novel already does.
- **One Fill pass does the whole job** for a game entered with only an IGDB
  link: extract the IGDB id, fetch the IGDB record which writes `steam_appid`,
  then run the Steam phase which reads the appid just written. A game with no
  Steam presence never gets an appid and the phase returns immediately — an
  ordinary outcome for console-only entries, never logged as an error.
- **Two hosts, two auth stories, and the split is deliberate.** The storefront
  (`appdetails`) needs **no configuration whatsoever** and serves prices,
  Metacritic and the achievement total; the Web API needs a key and a steamid for
  playtime and achievements earned. A missing key, missing steamid or private
  profile skips only the progress phase with one warning and leaves prices
  filling normally.
- **`GetOwnedGames` is fetched once per run, not per game** — it returns the
  whole library with `playtime_forever` in one response, so playtime costs
  nothing per entry.
- **Steam, not IGDB, sets the pace of Fill Game.** The storefront's unofficial
  ceiling is ~200 requests per 5 minutes per IP, so at three calls per game a
  300-game backfill runs 20-25 minutes. A sliding-window limiter is the guard and
  a `budget` hook stops a Fill All cleanly rather than blocking.
- **`steam_progress_sync` is a per-entry lock** for the game owned on Steam but
  played elsewhere — 200 hours on PS5, 2 on Steam, which a Replace would
  otherwise overwrite. It governs the two progress columns and nothing else.
- **Two guards on every progress write**, in order: the lock, then **skip on 0 or
  None**. The zero guard is the safety net for entries not yet flagged — a game
  owned but never launched reports `playtime_forever = 0`, and without it the
  first run would wipe a hand-typed figure before anyone had reason to set the
  lock.
- **`GAME_FIELDS_TO_FILL` is deliberately not extended.** Adding price or
  Metacritic to the missing-values test would leave every free, unrated or
  achievement-less game eligible forever — the same trap that keeps the genre
  tags out of it. Eligibility is instead "has an appid and Steam has written
  nothing at all".
- **Consequence worth tracking:** four more columns become overwrite-on-every-run
  fields, so the "exactly three are overwritten" claim in `catalog.py` and
  `external-apis.md` became seven and had to be corrected in the same change.

### Public ids and slug URLs (spec: 2026-09-07 public-id-slug-urls)

- **`/<type>/<public_id>/<slug>`** — a stored per-type sequential integer, with
  the slug decorative and lookup on the id alone. This is the standard shape when
  the primary key is a UUID, and what every comparable catalogue does: MyAnimeList,
  TMDB, IMDb.
- **Rejected: a truncated UUID.** It needs no migration but reads as a UUID that
  got cut off, which is exactly what the change exists to remove.
- **Rejected: a random short code.** Those are the convention where the URL *is*
  the access control — unlisted videos, share links. Here RBAC and content labels
  decide visibility, and `_get_or_404` already returns an identical 404 for a
  hidden entry and a nonexistent one, so enumeration reveals nothing the library
  page does not.
- **The accepted cost:** `public_id` leaks collection size and creation order,
  which for a personal collection shown to friends is not a secret worth uglier
  URLs. Deletions leave permanent gaps; ids are never reused.
- **No back-compatibility.** Bare-UUID browser URLs stop working.
- The slug derives from a **Latin-first** name chain, independent of the CN-first
  display name.

### Publisher entity migration (spec: 2026-09-07 publisher-entity-migration)

- **One role, not two.** A TW licensor (木棉花) and an original publisher
  (Marvel) share the `publisher` role. Rejected: a separate `distributor_tw`
  role — a distributor on an anime is the same *kind* of fact as a publisher on a
  novel, and splitting them would put one company's anime and manga credits in two
  vocabularies. The accepted cost, stated plainly: a comic with both an original
  publisher and a TW licensor shows them in one undifferentiated list, and
  `/publisher/:id` cannot say *why* an entry is credited. No data expresses that
  distinction today, so nothing is lost.
- **One role, but the words "Publisher / Distributor" are never shown.** That
  string names the concept, not a reader-facing label. The label varies by media
  type through the `_LABEL_OVERRIDES` mechanism that already makes one `author`
  role read 原作 / Author / Writer: 台灣代理商 for anime, 台灣出版商 for manga and
  novel, 出版商 for comic, 發行商 for game. The distinction is real — the first two
  name a *Taiwanese* licensor, while a comic's publisher is Marvel, the work's
  original publisher.
- **Publishers carry media-type scope, like people**, for the reason
  `PersonRole` already gives: scope cannot be derived from credits, because a
  distributor added today must appear in the anime picker before its first credit
  exists. Without it all 31 migrated rows would be offered on all six types — a
  games publisher suggested as an anime distributor.
- The table keys on `(publisher_id, scope)` with **no `role` column**, because a
  publisher holds exactly one role; adding one "for symmetry" would encode a
  constant. It inherits the two rules `PersonRole` argues for: **no unscoped
  "offered everywhere" state**, and **auto-scoping that is purely additive**.
- **Comic's `publisher_tw` was discarded, not migrated** — measured against the
  database, comic had **0** such rows; the column was defined and never used. The
  backfill still asserts the count is zero and **reports and skips** any row it
  finds, because a restore from an older sheet is the one way one could appear.
- **Entities come from a curated name map, not an automatic split.** The 31
  values mix pure Latin, pure CJK and Latin+CJK in one string (`Muse木棉花`), and
  the existing rule would leave several displaying as a mashed string. An
  automatic split at the script boundary was rejected because it guesses — and
  guesses wrong on `bilibili (GoodShow)`. `name_normalize.py` states the rule this
  codebase follows: *nothing is guessed*.
- **A split row keeps its old spelling so an old sheet still resolves.**
  Splitting `Muse木棉花` changes what the anime tab's column says, which is fine
  forward and dangerous backward: a Pull from a sheet backed up *before* the
  migration asks `find_publisher` for a string matching none of the four columns
  and mints a duplicate. **This holds for only two of the four split rows** —
  `Proware普威爾` and `曼迪 Mightymedia` keep their mashed spelling nowhere, so the
  mitigation for those two is procedural: Backup immediately after the migration,
  so no stale sheet is ever the newest version.
- **Three vocabulary values had no data behind them.** The backfill converts data,
  not vocabulary, so it created 30 entities rather than 33. `bilibili` and
  `Crunchyroll` were seeded anyway and given the `anime` scope — without a scope
  they would be "offered nowhere", defeating the point of seeding them. That scope
  is an **inference, not an instruction**, and correctable in the UI.

### Multi-user catalogue (spec: 2026-09-08 multi-user-catalog)

- **The catalogue is shared; the list is per user.** One `anime` row for
  Frieren, with per-user rows beside it. A new **`media` supertable** holds one
  row per entry across the nine types, carrying identity *plus shared catalogue
  fields* — `display_name`, `cover_image_file`, `franchise_id`, `series_id`,
  `public_id`, timestamps. Detail tables keep every type-specific column and
  their PK becomes an FK to `media`.
- **One `user_media_list` table** with a real FK, holding the superset of
  progress columns. It is wide and null-heavy, and that is accepted rather than
  relitigated.
- **Grouping tiers and watch orders stay shared and admin-curated** — one
  canonical order per series. **Quotes and memes stay universal**, shared and
  unfiltered with no per-user copies. `plan_next` and `seasonal` go per user.
- **Accounts are invite-only and catalogue writes are admin-only.** No public
  registration, no user-contributed entries, no moderation queue, no edit
  history, and no social features.
- **Notes are scoped per section in the registry** — catalogue or personal —
  rather than per note or per user.
- **Rollout is step 0 (identity) first, then phased by media type**, so the
  supertable lands before anything depends on it.
- **Authorization was deliberately deferred**, not settled here. The cookie's
  `secure` flag, the fail-fast on a default `JWT_SECRET_KEY`, session lifetime
  and the `personal_notes` field group were all explicitly left to a later
  design — which became the 2026-09-10 authorization redesign below.

**Sharp edges recorded at design time, all of which held:**

- **Deleting from a detail table orphans the `media` row.** `DELETE FROM anime`
  cascades downward to nothing and leaves the parent behind; the cascade only
  works deleting from `media`. This inverts the natural habit and **no constraint
  catches it** — mitigated by an `AFTER DELETE` trigger per detail table plus a
  test.
- **Eighteen constraints must stay in sync** — nine composite
  `(system_id, media_type)` FKs and nine `CHECK (media_type = '…')` — and
  **Alembic's autogenerate will not write them**. Adding a tenth media type means
  getting them right again, hence the drift test.
- **`display_name` can go stale.** The single new bug class the supertable
  introduces.
- **`media` will attract fields it should not have**, mitigated only by the
  promotion rule and by reviewers applying it.
- **`media_resolver.py` does not dissolve.** `TIER_TABLES` survives to render
  "this note belongs to franchise X". What dies is `(media_type, entry_id)` as a
  *storage* pattern, not as a concept.

### Authorization redesign (spec: 2026-09-10 authorization-redesign)

Supersedes the object half of the 2026-08-29 view-authorization entry above.
The gates as they behave now are `authorization.md`; what follows is why.

- **Two axes that answer different questions.** The **role** answers *what kinds
  of operation may this account perform*; the **access mode** answers *which
  objects can those operations reach in this session*. They must not be one knob:
  if they were, dropping to `safe` would also drop the `admin` grant.
- **Object-scoping vocabulary leaves the role axis entirely.** `label.<key>` and
  `field_group.<key>` stop being grantable to a role and become exclusively what
  a mode carries. Field groups *must* move rather than merely may: **permission
  resolution is a union, and a union can only add** — if `field_group.*` stayed
  grantable on a role, no mode could ever take it away and the narrow tiers would
  be unbuildable.
- **`admin` is a superset, not a break-glass account.** It holds `admin.authz`
  *and* both `manage.*` permissions and stays the daily account; `super` is
  "admin minus the ability to change who may do what". The original break-glass
  design was rejected as more friction than the risk warranted — it put a password
  prompt in the middle of any task that turned out to need both axes. **The
  consequence is accepted and stated:** the account in daily use can regrant
  itself anything, so a compromised daily session is a total compromise.
- **A mode never changes which *kinds* of operation an account may perform** — it
  never removes `manage.catalog` or `self.list`. It scopes two vocabularies:
  content labels (whether an entry exists for you at all) and field groups (which
  columns of a reachable entry you see). An earlier wording, "sight only, never
  writes", was wrong in its second half.
- **Narrowing is instant; widening asks for the password again.** So a browser
  left logged in at `safe` is actually safe. A session starts in the account's
  *chosen default*, not the narrowest — you just typed your password, so landing
  wide is not a new grant, and always landing narrow would make the widening
  prompt routine, at which point a prompt typed through by reflex has stopped
  being a control.
- **A per-account adjustment can only remove; a mode is a ceiling.** So a mode
  name on the user list is a trustworthy upper bound, and widening a mode later
  reaches everyone not explicitly narrowed.
- **Two *typed* link tables, not one generic `access_mode_grant(permission
  text)`.** Neither has a column in which `manage.catalog` or `admin.authz` could
  be stored, so "a mode scopes objects, it never grants powers" is a schema
  guarantee rather than a review rule.
- **Writes follow reads, against the ACTIVE mode.** If `GET` answers 404 for
  you, every write to that id answers 404 too. Rejected: binding writes to the
  account's *ceiling*, which would have the server 404 a `GET` and then accept a
  `PUT` for the same id. The precedent is uniform — Postgres RLS applies one
  `USING` clause to `SELECT` and `UPDATE` alike, and OWASP ranks the inverse as
  API1:2023, Broken Object Level Authorization.
- **401 and 404, and 403 disappears.** `401` means *you may not do this kind of
  thing*; `404` means *this object is not yours to see*, and is the same message a
  genuinely absent row gets — **because a 403 confirms the row exists exactly as
  surely as a 200 does.**
- **Three Sheets tabs need `admin.authz`.** Pull All restores `Users` (including
  each account's role), `Content Label` and `Media Content Label`, and the sheet
  is editable by anyone with Google access — so a `super` could type `admin` into
  the Users tab and Pull themselves a promotion without ever holding
  `admin.authz`. Those three tabs are skipped and reported; every other tab
  restores normally. Rejected: requiring `admin.authz` for the whole pipeline,
  which would stop a helper restoring the catalogue after a bad import. **Note the
  direction:** Backup (local → sheet) is not an escalation path and is
  unrestricted; only Pull writes authorization data into the live database.
- **`manage.pipelines` is unscoped on the object axis, and only runnable from an
  unscoped session.** A pipeline rewrites entries with no visibility test, so its
  blast radius equals `admin.authz`. What stops that being a bare trust assertion
  is a session-level rule: the pipeline routes require the active mode to carry
  *every* content label and *every* field group — **computed, never a named
  mode**, so adding a label later cannot silently widen the qualifying set.
  Rejected: scoping the runner — the sheet holds exactly one version of the data
  and Backup overwrites every tab, so a Backup from a narrowed session would write
  a *partial* sheet over the complete one, turning an information leak into silent
  data loss.
- **`media_type.*` stays on the role axis**, the one arguable boundary. "May I
  see Games" is object-shaped, but it says what an account is *for* rather than how
  careful this session is being.
- **The guest mode is `safe`, resolved by key, and this reversed a decision.**
  The spec first put an `is_guest_default` flag on the mode, rejecting a literal
  key lookup because editing `safe` for yourself would silently republish to the
  internet. That rejection was the mistake, and it is worth keeping as a worked
  example of a design argument that did not survive contact with the seed: the
  objection was *equally true of the flag*, because the seeder flags `safe` and
  nobody ever moved it. The flag defended a scenario that does not occur, and
  charged for it in the one that does — a column an admin can edit is a column a
  Pull All, a migration or a hand-edit can move to `unrestricted`, publishing
  every labelled entry to the anonymous internet while looking like a successful
  restore. **The live risk is unchanged either way and is stated rather than
  designed around:** widening `safe` widens what the internet sees, immediately.
- A logged-out visitor gets **no mode switcher at all**, not a disabled one —
  `held_modes()` returns `[]` without an account, so other modes are never
  advertised to anonymous visitors.
- **`remark` becoming per-viewer had to land in one commit.** It is a class-level
  `column_property` and a scalar subquery cannot know who is asking, so serving it
  per-author and relaxing the one-remark-per-owner index had to happen together.
  Doing only the second is **worse than doing neither**: today a second account's
  remark is refused loudly by the database, and after a half-fix it would be
  accepted and then invisible — a data-loss shape rather than a limitation.

### Clean orphaned data (spec: 2026-09-11 clean-orphaned-data)

- **The sheet is allowed to be ahead of the database, and there is no freshness
  gate.** The obvious rule — "back up first, so the sheet reflects local truth" —
  is exactly backwards here: in the workflow that creates the garbage, the sheet
  is *deliberately* ahead, because the machine that performed the deletion wrote
  it. Running Backup first would re-write the local garbage into the sheet and
  destroy the only evidence the diff has.
- The cost is that a row created locally since the last Backup looks identical to
  an orphan. Handled in the review UI rather than by refusing to run: the report
  carries the last Backup timestamp and each candidate's `created_at`, and
  post-Backup rows are excluded from select-all and marked.
- **Tiers and entries only.** Vocabulary and entity tabs are excluded because
  deleting a `system_option` or a `person` does not remove a row the user
  reviewed — it silently rewrites every entry citing it through `ON DELETE
  CASCADE`. An orphaned option is clutter; an orphaned entry is divergence, and
  only the second is reviewable one row at a time. Authorization tabs are excluded
  for a second, independent reason: a delete path into `Users` would let a sheet
  edit remove an account.
- **A candidate must miss on EVERY identity the sheet carries; any single hit
  spares it.** `(media_type, public_id)` is the load-bearing one, and it is
  **stronger than a name match** — Backup writes `public_id` on every entity tab
  and Pull restores it unchanged, which is what keeps the two machines agreeing on
  the ids in URLs. So a rename on one machine does **not** make an entry look
  orphaned, which a names-only rule would have got wrong.
- **The asymmetry is deliberate:** a false negative keeps one piece of garbage for
  one more round, which costs nothing; a false positive deletes a real entry and
  everything cascading from it.
- **An identity rule borrowed from an upsert path must be re-derived before it
  gates a delete.** This design originally copied `pull.py`'s id-less matching
  rule because it was the identity rule the codebase already had for these tabs.
  It was sound where it came from and would have destroyed data here — an entry
  renamed on the other machine misses on every name. Worth generalising beyond
  this feature: a rule that is safe for *upsert* is not automatically safe for
  *delete*, because the failure directions are opposite.
- **Prefixes must be read, not guessed.** The tier prefixes are not uniform
  (`collection_`, `franchise_`, `series_`) and the entry ones are worse —
  `tv_name_en`, not `tv_show_name_en` — which is a second reason entries are
  matched on the `Media` tab rather than on their detail tabs.

### Admin holds no user data (spec: 2026-09-12 admin-holds-no-user-data)

- **The installation owner is a flag on the user row**, with a partial unique
  index so at most one account holds it. Rejected: an env var — per-machine, so
  the two databases could silently disagree about who owns the collection, exactly
  the drift the Sheets round trip exists to prevent. Rejected: a heuristic over
  roles, ambiguous the moment a third account exists.
- The flag rides the Sheets `Users` tab so both machines agree after a
  Backup/Pull cycle — and `parse_user_from_sheet` is an **explicit projection, not
  a column sweep**, so the column has to be named there or it will not travel.
- **The fallback never hard-fails**: alphabetically-first non-superuser account,
  else the first account. `user_media_list.user_id` is NOT NULL and a restore has
  to file its rows somewhere.
- **`self.*` is ownership, not privilege, so the superuser short-circuit does not
  cover it.** "May do anything to the system" and "has a personal library" are
  different claims, and conflating them is what put user data on the admin
  account. Expressed as one condition in the permission model rather than as
  refusals scattered through the write routes — **a rule spelled out in twenty
  routers is a rule that will be missing from the twenty-first.**
- **Authorship is not ownership, and `author_id` records who wrote the row, not
  who owns it.** Reassigning those is editing a record of authorship. They were
  moved anyway so the rule is verifiable by counting — sound here because the
  owner is both accounts, and explicitly noted as not generalising. **`admin` will
  author catalogue rows again**, because quotes, memes and catalogue notes are
  `manage.catalog` writes; "zero rows" is permanent for ownership and
  true-as-of-today for authorship.

**What this spec got wrong**, kept because a spec amended only forward teaches
nothing:

- **It under-counted the blast radius by a factor of nine.** It reasoned
  carefully about three routers and said nothing about tests — yet the change
  touched fourteen test files, nine of them because they had been written to
  drive personal endpoints as `admin_client`. The tests encoded the very
  assumption being removed, so "a rule expressed in one condition" was true of the
  source and false of the work. **A spec that sizes a change by counting
  production call sites will do this every time.**
- **A test had been asserting the bug**, in a file whose docstring called it "the
  whole point of the `user` role". Generalisable: when a rule is removed, grep the
  *test names* for the rule's old wording and read them as claims rather than
  labels.
- **Two doc claims were wrong before the work started** and were found only by
  grepping — `api.md` said plan-next writes "stay admin-only", which they never
  were, and three places in `authorization.md` said a superuser "holds every
  permission implicitly". The spec did not budget for the doc sweep, and the sweep
  is where both were caught.

### AniList scores (spec: 2026-09-12 anilist-api)

- The cache is read **in preference to** the network, not instead of it — but
  the spec's phrasing undersold a real gap. `run_replace_single` never calls
  `pre_run`, so every one-entry Replace was one on-demand fetch away from writing
  nothing at all if the fallback had been omitted. Nothing shipped broken, but it
  is a **hook contract** (`pre_run` not firing for a single-entry write) that this
  feature was the first to trip.
- **The overwrite-set count needed conscious widening, not just updating.** The
  count lives in prose in `external-apis.md`, not in a constant, so the tripwire
  test had to be hand-edited with the three new column names. A spec that only says
  "nine fields becomes twelve" reads as if the test would just pass. It would not
  have — **nothing catches a hand-maintained list falling out of sync except a
  person reading the diff.**
- **Real-API verification surfaced no surprise, which is recorded because an
  unsure section that is never resolved teaches nothing.** A live Fill against 40
  anime and 10 manga ids matched 100% of the collection by `idMal`, and roughly a
  third of scored entries carried no all-time rank — confirming "absence is
  normal" on real data rather than on two probed examples.

### Game guides, story and todo notes (spec: 2026-09-12 game-guides-story-todo)

- **"There is no frontend code change" was right for the wrong reason.** The spec
  asserted every shape already had a renderer, and it did — but `systems/notes.md`
  claimed the opposite in two places, and the spec was written without checking
  either. Both doc claims were stale, so **the conclusion held by luck**. Had the
  docs been right, this would have shipped eleven sections rendering null and a
  Sheets round trip that ate their contents. The check that settled it happened
  three tasks too late.
- **The section list was incomplete** — fourteen entries, with `builds_and_mods`'s
  Mod and Tool rows having nowhere to go. Caught while drafting rather than while
  specifying; a migration written from the section list alone would have stranded
  them.
- **The spec was silent on which test database its tests take**, which is where
  the only real hazard lived: `tests/api/conftest.py` runs `DROP SCHEMA public
  CASCADE` on whatever `POSTGRES_DB` resolves to. **A spec for work done during a
  multi-session run should name its database.**
- The one load-bearing claim verified against the code *before* being written
  down — that `sort_index` is per-section — is the only one nothing later revised.

### Image upload (spec: 2026-09-12 image-upload)

- **A two-table media library, not a per-row file path**: an `image` blob table
  and a polymorphic `image_attachment` join, which is the shape ActiveStorage,
  WordPress and Django all land on. Today the path *is* the identity
  (`anime/<id>.jpg`), which makes one image per row a structural limit rather than
  a choice — and would have caused a concrete bug: **replacing an image would
  serve the old one from browser cache, because the URL does not change.**
  Content-addressed storage means a replaced image is a new key, so that bug is
  never written.
- **`owner_id` is deliberately not a foreign key** — there is no single table to
  point at — and the cost is accepted knowingly: nothing in the database stops an
  attachment outliving its owner. The `unused` filter and the orphan tooling find
  those. The alternative, ten nullable FK columns, is worse in every other
  respect.
- **The re-encode to JPEG is the security control, not a format preference.**
  Validation is ordered, each step assuming the last passed, and the size cap is
  checked **before the body is read** — `Content-Length` is a claim from the
  client and cannot be the only check.
- **Uploaded images never travel through Backup or Pull**, and
  `bulk_download_missing_covers` must skip them — `uploaded_by` is how an upload
  is distinguished from a download.

**What this spec got wrong:**

- **The cross-format dedup claim was wrong and impossible.** It claimed the same
  picture arriving once as PNG and once as JPEG would dedup to one row. It cannot:
  JPEG is lossy, so it decodes to different pixels than the PNG it came from, and
  re-encoding two different pixel buffers cannot produce identical bytes. The real
  contract is that **identical pixels dedup and "the same picture" does not.**
- **The storage root it implied was overruled during implementation.** The spec
  never stated the root explicitly, and the plan built from it assumed
  `static/covers/library/` so that `getCoverUrl` would need no change. Uploaded
  images are library images, not covers, and do not belong in the cover tree — so
  the root is `static/` directly, and both URL helpers gained a `library/` branch
  rather than resolving it for free. **A spec that leaves a path implicit invites
  the plan to infer the convenient one.**
- **It never listed `meme` as an attachable owner**, despite "Quote and meme
  images" naming the problem in its own opening paragraph. The omission shipped as
  a 400 on every meme attach and was caught after a task landed, not before.

### Production deployment (spec: 2026-09-13 production-deployment)

The media tracker runs on `homelab`, an HP ProDesk 600 G4 mini, behind a
Cloudflare Tunnel at `media.cg1618.com`. Operating detail lives in
[deploy/README.md](../../deploy/README.md); the machine is
[deployment-selfhost.md](../deployment-selfhost.md). What follows is why the
shape is what it is.

- **The box builds its own image** from a git checkout — `git pull` then
  `docker compose up -d --build`. Rejected: `docker save | ssh docker load`,
  which pushes ~1 GB per deploy over the box's worst link and leaves it unable
  to rebuild itself. Deferred: building in CI and pulling from GHCR, which is
  the conventional answer but would make every pull request build a multi-stage
  image to serve a box one person deploys by hand. Three constraints keep that
  switch to about two lines: no environment-specific values in the image, no
  build args, and an explicit `image:` name beside `build:`.
- **The tunnel is locally-managed, with its ingress in git.** Rejected: a
  dashboard token, which is what Cloudflare recommends and is simpler to set
  up. Which hostnames are publicly reachable is a security decision with
  written reasoning, and in a dashboard the decision is separated from it.
- **The tunnel id lives in `.env`, not in the committed `config.yml`.** The
  design put it in the config; that file then could not be written until the
  tunnel existed. Passing it on the command line makes the ingress map static
  and committable first.
- **`docker-compose.prod.yml` sits at the repository root.** The design put it
  in `deploy/`, reasoning that a second compose file at the root would collide
  with the development one. That was wrong — they collide only on a shared
  *filename*, and Compose never auto-loads this name. What is not wrong is the
  consequence: Compose takes its project directory from the compose file's own
  location and loads `.env` from there, so under `deploy/` every `${...}`
  interpolated to an empty string and the database came up with a blank
  password, while `env_file:` kept working and the app looked fine.
  `tests/unit/test_prod_compose.py` fails if it moves back.
- **Data arrives by `pg_dump`, never through the Sheets pipeline.** Rejected:
  Pull All from the development sheet. Sheets is built for moving data between
  the two dev machines and is lossy where that is safe — it re-resolves
  database-local ids and skips authorization tabs without `admin.authz`. More
  importantly the sheet holds exactly one version of the data, so a third
  participant turns a two-way handover into a three-way sync with no merge.
- **Production has its own sheet, `App Database`, and never reads the
  development one.** Backup overwrites every tab, so the configuration in which
  production knows the dev sheet's id is the one that could destroy the dev
  backup; it should not exist. A new empty spreadsheet is enough —
  `get_google_sheet_tab` creates each tab on first Backup. The spreadsheet
  *name* is cosmetic (`open_by_key` is the only way the app opens one); the tab
  names are not, and `tabs.py` matches them exactly.
- **The restore happens with only the `db` service running, and both passwords
  are rotated afterwards.** `app/main.py` calls `create_all` at import, so an
  app container started against an empty database creates every table and makes
  `pg_restore` collide. And the dump carries the development password hashes
  while admin seeding is skipped when the account exists — the startup log line
  `[System] Admin account verified.` is that branch — so `ADMIN_PASSWORD` is
  never consulted and production would otherwise run on development
  credentials.
- **`restart: unless-stopped`, a `pg_isready` healthcheck on `db`, and
  deliberately none on `app`.** `unless-stopped` rather than `always` so a
  deliberate `docker compose stop` survives a daemon restart. No app
  healthcheck because the catch-all route serves the SPA for any path, so a
  check against `/` passes with the database down — a healthcheck that lies is
  worse than none.
- **No service publishes a port.** The tunnel is the only ingress; `psql` from
  a laptop goes over SSH. There is no open port to misconfigure.
- **`COMPOSE_PROJECT_NAME=media`, and no `container_name:` anywhere.** The
  project name decides the volume, and therefore which database the stack sees;
  a checkout moved or cloned under another name would otherwise come up on a
  new empty volume while the real data sat in the old one. Container names are
  derived from it rather than hardcoded, so there is one place a name is
  written. The dev machines pin `anime_site` for the same reason and must keep
  it.
- **Every deploy dumps before it pulls, and rollback rebuilds.** A bad
  migration is the only deploy failure with nothing to recover from:
  `entrypoint.sh` runs `alembic upgrade head` on every start, and `downgrade`
  is not a restore — reversing a dropped column recreates it empty. Rollback is
  three steps, and the third must be `up -d --build`: `git checkout` reverts
  the source, but the code the container runs is baked into the image and plain
  `up -d` reuses it. Rejected: taking migrations out of `entrypoint.sh`, which
  is the textbook separation but makes every deploy two commands with a window
  where code and schema disagree.
- **The tunnel needs two credential files.** Cloudflare's image runs as
  `nonroot` 65532, so the 600 file `cloudflared tunnel create` writes as the
  invoking user is unreadable to the container. Two copies of one secret, each
  owned by its consumer, each still 600. Rejected: `chmod 644`, which widens a
  secret to every user on the box; and `user:` in compose, which bakes a
  host-specific uid into a committed file.
- **The unused Ethernet interface is `optional: true` in netplan.** Without it
  `systemd-networkd-wait-online` blocks on a cable that is not there for its
  full two-minute timeout, then fails, and `docker.service` waits behind it.
  Startup went 2 min 18 s → 23.6 s and `systemctl --failed` went from one
  permanent failure to empty — the second mattering more, because a box that
  always shows a failure teaches you to skim past the command you would use to
  find a real one.

**What the design got wrong**, recorded because a design that is only ever
amended forward teaches nothing about its own reasoning: the compose file's
location, the tunnel id's home, and the rollback procedure were all wrong in
the written design and were corrected by running them. Two of the three failed
*silently* — a blank database password behind a working-looking app, and a
rollback that restored old data under new code while the site stayed up and the
row counts came back correct. Both were found by comparing something concrete
against something else, not by reading.

### Off-box backups (spec: 2026-09-14 offbox-backups)

Four host-side scripts on `homelab`, scheduled by systemd timers and alerted
through Healthchecks.io, give the database and the uploaded-image tree a copy
off the box. Detail lives in [deployment-selfhost.md](../deployment-selfhost.md#backups);
this is why the shape is what it is.

- **R2 as the backup target, not the primary store.** Local disk stays the
  source of truth for every read the application does; R2 only ever receives
  copies. `deployment-selfhost.md` cited this decision as living here before
  it actually did — this entry is what makes that citation true.
- **Uploaded images stay on local disk rather than moving to object storage.**
  A backup script that copies ordinary files with `rclone sync` needs no
  application code and works even when the app is broken — which is exactly
  when a restore is needed.
- **Host-side scripts, not an app pipeline**, for the same reason: the backup
  has to work when the app is unhealthy, and a broken app is the case that
  actually matters. `sheets.sh` is the one job that does call into the app
  (`execute_backup`), because Sheets access lives entirely behind that
  pipeline; the database dump and the file syncs do not.
- **The stamp is written INSIDE the dump**, as a row in its own `backup`
  schema, rather than as a JSON file uploaded beside it. Rejected: the
  sidecar-file shape, because a fresh metadata file pairs happily with a stale
  dump and the freshness check passes on data that proves nothing.
- **`source_tables` is read from `pg_tables`** — what production actually had
  at dump time — rather than compared against the SQLAlchemy models. Detects a
  partial dump from the dump's own contents and needs no healthy app
  container to check against.
- **The verify drill's throwaway database runs with `--network none`**,
  rather than as a scratch database inside the live `db` container. Rejected:
  the scratch-database-in-production-container shape, where only a correctly
  set shell variable stands between a drill restore and `--clean` against the
  real data. `--network none` makes the throwaway incapable of reaching
  production by construction, not by convention.
- **One restore implementation, `restore.sh`, with two callers** — the weekly
  drill and a human in a disaster — differing only in their guards, never in
  their logic. A disaster procedure verified by different code from what
  actually runs it is verified by nothing; running the drill against
  `restore.sh` every week proves the 2 a.m. path works, not a description of
  it.
- **Row counts are reported in the drill's success ping, not asserted.** They
  are read just before `pg_dump` takes its snapshot, so a write landing in
  that gap would fail the drill for a reason that has nothing to do with
  backup correctness. A backup system that cries wolf gets ignored, which is
  its own kind of silent failure.
- **`static/covers/` syncs weekly, `static/library/` nightly**, split by
  recoverability on a metered link. A stale cover is re-fetchable from the
  metadata APIs; an uploaded image is not recoverable from anywhere else.
  283 MB of covers is worth spending deliberately, not at whatever hour a
  timer happens to fire — `install.sh` leaves `media-covers.timer` disabled
  until the first sync is run by hand.
- **The Google Sheets Backup is scheduled and automatic, and deliberately
  unverified.** This reverses an earlier decision to leave Sheets manual, on
  the reasoning that a scheduled Backup removes the human gate that used to
  catch a bad write before it overwrote every tab. The R2 dump is the backup
  of record and is restore-verified weekly; the sheet is a current,
  independent second copy whose only check is that the pipeline reported
  success. That asymmetry is deliberate, not an oversight, and is stated
  explicitly in `deployment-selfhost.md` so it cannot become a false belief.
- **A dead-man's switch (Healthchecks.io) rather than an error reporter.** A
  job that runs and fails can report its own failure on the way out; a job
  that never runs at all — box off, hotspot down, timer disabled — executes
  nothing and can report nothing about itself. Only something outside the box
  can notice an absence.
- **Healthchecks' OnCalendar schedule type, not Simple.** Simple measures its
  deadline from the last ping, so a catch-up run fired late by
  `Persistent=true` after an outage pushes the next deadline later, and every
  subsequent late run pushes it later again — the alarm drifts away from the
  schedule it exists to guard. OnCalendar anchors to the wall clock instead:
  04:00 is expected at 04:00 regardless of what happened the day before.
- **`media-sheets.service` and `media-verify.service` declare
  `After=media-backup.service` with no `Requires=`.** The shared `flock` in
  `lib.sh` is a pure mutex — it serialises the four jobs but does not order
  them. Without `After=`, `Persistent=true` firing every missed timer
  simultaneously at boot could let Sheets overwrite every tab before the
  night's dump had run, or let the drill verify against a dump not yet
  finished. `Requires=` was rejected: it would fail Sheets and the drill
  outright on any night the dump job fails, which are meant to be independent
  failure domains reporting to independent alerts.
- **Backup secrets live in `~/anime_site/.env.backup`, not `.env`.**
  `docker-compose.prod.yml` gives the `app` service `env_file: .env`, so
  anything placed there is injected into the running web application —
  including, for these variables, write credentials for the very bucket
  holding the application's own backups.
