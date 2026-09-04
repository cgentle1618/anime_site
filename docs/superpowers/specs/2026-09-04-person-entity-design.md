# Person as a public entity — design

Status: approved for planning
Date: 2026-09-04
Branch: modify

## Why

Two problems, one change.

**The vocabulary is split in two.** `app/utils/credit_roles.py` holds
`CREDIT_ROLES` (what `media_credit.role` stores) and `PERSON_ROLES` (which
dropdown a person appears in), and they do not agree: `manga_author_plot` and
`manga_author_draw` are two credits that imply one person role, while
`novel_author` and `comic_writer` are two person roles that mean the same
thing. The scope vocabularies disagree too — `person_role.scope` is
`anime`/`non_anime` for director and NULL for everything else, while
`system_option_scope.scope` is media-type keys. `ScopePicker.jsx` carries a
comment warning readers not to confuse the two.

**People have no admin UI and no public pages.** There is a create-only
`PersonForm` buried in the System Option sub-tabs on the Add page
(`Add.jsx`, `OptionSubTabBar.jsx`); Modify and Delete deliberately omit it.
`docs/roadmap.md` records the public half under "Deferred / known debt":

> Public person and studio pages deferred; only admin and pickers read the
> routers — no route in `frontend/src/App.jsx`

The studio half of that line is being closed in parallel by
[2026-09-04-studio-entity-design.md](2026-09-04-studio-entity-design.md),
which created the Entity admin group and said Person would follow it. This is
that follow-up, plus the vocabulary collapse.

## Scope

In scope:

1. Collapse the two role vocabularies into one list of five person types,
   with the display label derived from `(role, media_type)`.
2. Make `person_role.scope` NOT NULL and media-type keyed; delete the
   `anime`/`non_anime` vocabulary.
3. Rewrite `media_credit.role` to the collapsed vocabulary.
4. Reshape `person` names to match `studio`: four nullable names, a per-row
   display choice, an "at least one" CHECK.
5. Add / Modify / Delete for people under Entity → Person, with a sub-tab per
   person type.
6. Public person library and detail pages, with a reverse lookup for the
   entries a person is credited on.

Out of scope, deliberately:

- Anything under `studio`. A concurrent session owns that table, its
  migration and its admin tab. This design consumes their contract
  (`NameFallbackMixin`, `display_name`, `TAB_GROUPS.entity`) and changes none
  of it.
- Fill/Pull enrichment of people. No `mal_id` column is added; unlike studios
  there is no pipeline candidate today, and the studio spec's own columns are
  there without pipeline work behind them.
- `character` / `character_voice`. Still deferred, still noted in
  `data-model.md`. `person.gender` continues to exist for the seiyuu case it
  anticipates.
- Splitting the CJK names that the migration lands in the wrong slot. Manual
  admin cleanup once the Modify tab exists, not migration logic — the same
  call the studio spec made for its five composite studio names.

## Decisions taken

### Decision A — one role vocabulary of five

`CREDIT_ROLES` and `PERSON_ROLES` become the same list. `studio` remains a
credit role with no person role, exactly as today.

| key | label | legal scopes (`media_types`) |
|---|---|---|
| `director` | Director | `anime`, `anime-movie`, `movie` |
| `producer` | Producer | `anime` |
| `composer` | Music / Composer | `anime` |
| `author` | *derived* | `manga`, `novel`, `comic` |
| `illustrator` | *derived* | `manga`, `novel`, `comic` |

The six labels that vary by media type are derived, not stored:

| role | manga | novel | comic |
|---|---|---|---|
| `author` | 原作 | Author | Writer |
| `illustrator` | 作畫 | Illustrator | Artist |

`作畫` is the traditional form, matching the site's other CJK labels
(`標籤 Label`, `Quality 品質`). It replaces the `作画` currently stored as
`CREDIT_ROLES["manga_author_draw"].label`.

Rejected: keeping `media_credit.role` on its own vocabulary and mapping it
onto `(person_role, scope)` in code. No migration of credit rows, but the
two-vocabulary split — the thing this change exists to remove — would survive
in the stored data, and every reader would need the map.

No collision is created. Each media type uses each collapsed role at most
once: manga's 原作/作畫 become `author`/`illustrator`, and so do novel's and
comic's pairs.

### Decision B — every `person_role` row carries a scope

`person_role.scope` becomes NOT NULL. A person's visibility in a dropdown is
the plain union of their explicit `(role, scope)` rows. There is no unscoped
"offered everywhere" state.

This deliberately differs from `system_option_scope`, where zero scope rows
means offered everywhere. The difference is the point. Ruling R27 had to ban
auto-scoping for tags precisely because, under "zero means everywhere", the
*first* scope row flips a value's meaning from "all media types" to "only this
one" — crediting an unscoped "Disney+" on one TV show silently removed it from
the Cartoon dropdown.

Person credits *are* auto-scoped (Decision C), so copying the tag rule would
rebuild that bug. Removing the "everywhere" state makes auto-scoping purely
additive: crediting an author on a manga adds `(author, manga)` and can never
take anything away, because there is no "all" state left to collapse. The trap
is not mitigated, it is structurally impossible.

Two facts make this fit people better than tags anyway:

- The legal scopes per role are already bounded by `CreditRole.media_types`.
  "Offered everywhere" is not even meaningful for a person: an `author` scoped
  `anime` names a credit that does not exist.
- The checkboxes then always show the literal truth, with no empty-means-all
  special case to explain in the UI.

Cost: two similarly-named `scope` columns now mean different things. This is
paid for with a comment on `PersonRole`, a line in `options.md`, and an
extension of the warning `ScopePicker.jsx` already carries.

### Decision C — a credit write sets both role and scope

`resolve_person` continues to attach the role a credit implies, and now
attaches the entry's media type as the scope. Crediting 原作 on a manga gives
the person `(author, manga)`.

Kept because `person_role` exists to solve exactly this: a director fetched by
Fill/Pull must appear in the director dropdown without an admin visiting a
form. Safe because of Decision B.

`director_scope_for()` and `DIRECTOR_ANIME_MEDIA_TYPES` are deleted. The scope
*is* the media type; there is nothing left to derive.

### Decision D — person names match studio names

`name_native` (NOT NULL) / `name_en` / `name_cn` are replaced by `name_en`,
`name_cn`, `name_jp`, `name_alt`, all nullable, with a CHECK that at least one
is set, plus `display_name_field` and `NameFallbackMixin`.

This is the studio spec's Decision A applied to the table it named as the
inheritor of the pattern. The alternatives it rejected — a derived
`name_native` cache, a separate alias table — are rejected here for the same
reasons.

## Schema

```
person
  system_id           UUID PK
  name_en             String, null, indexed
  name_cn             String, null
  name_jp             String, null
  name_alt            String, null
  display_name_field  String, null      -- 'en'|'cn'|'jp'|'alt'; NULL -> fallback
  gender              String, null      -- unchanged
  my_rating           String, null      -- unchanged, one of constants.MY_RATINGS
  photo_file          String, null      -- unchanged, GCS key
  remark              Text, null        -- unchanged
  created_at / updated_at               -- unchanged

  CHECK  num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1
  UNIQUE (name_en, name_cn, name_jp, name_alt) NULLS NOT DISTINCT

person_role
  id                  Integer PK
  person_id           UUID FK -> person, ON DELETE CASCADE
  role                String NOT NULL   -- one of PERSON_ROLES (five)
  scope               String NOT NULL   -- one of MEDIA_TYPE_KEYS  (was nullable)

  UNIQUE (person_id, role, scope)       -- NULLS NOT DISTINCT no longer needed

media_credit
  role                String NOT NULL   -- values rewritten; column unchanged
```

`NULLS NOT DISTINCT` stays load-bearing on `uq_person_name` for the same
reason the studio spec gives: three of the four name columns are NULL on a
typical row. It is *dropped* from `uq_person_role`, which no longer has a
nullable column — the comment explaining why it was needed goes with it.

## Migration

Two Alembic revisions in one change, chained after the studio session's
`s1t2u3d4i5o6` to keep a single head. Split because they answer to different
concerns and one is far riskier than the other:

1. `..._collapse_person_roles` — the vocabulary (Decisions A–C).
2. `..._reshape_person_names` — the names (Decision D).

All counts below were verified against the local `anime_site_db` on
2026-09-04: **554 people, 555 `person_role` rows, 1,409 `media_credit` rows.**

### Revision 1 — vocabulary

`media_credit.role`, a straight value rewrite (372 rows):

| from | to | rows |
|---|---|---|
| `manga_author_plot` | `author` | 129 |
| `manga_author_draw` | `illustrator` | 126 |
| `novel_author` | `author` | 80 |
| `novel_illustrator` | `illustrator` | 31 |
| `comic_writer` | `author` | 6 |
| `comic_artist` | `illustrator` | 0 |

`director` (548), `producer` (2), `composer` (5) and `studio` (482) are
untouched. `uq_media_credit_row` cannot be violated: within a media type the
two collapsing credits always land on *different* roles, so even a manga drawn
and written by one person stays two distinct rows.

`person_role`, a rebuild. `manga_author` is the only hard case — it backs both
the 原作 and 作畫 dropdowns today and must split. It is **derived from actual
credits, not guessed**, and the data says that is total:

- 121 `manga_author` holders, **0 of them without a manga credit**
- 109 have a `manga_author_plot` credit → `(author, manga)`
- 110 have a `manga_author_draw` credit → `(illustrator, manga)`
- 98 have both → both rows

No fallback rule is needed. The rest are mechanical:

| from (role, scope) | to | rows in → out |
|---|---|---|
| `director`, `anime` | `(director, anime)` + `(director, anime-movie)` | 138 → 276 |
| `director`, `non_anime` | `(director, movie)` | 204 → 204 |
| `producer`, NULL | `(producer, anime)` | 1 → 1 |
| `composer`, NULL | `(composer, anime)` | 5 → 5 |
| `manga_author`, NULL | derived split, above | 121 → 219 |
| `novel_author`, NULL | `(author, novel)` | 54 → 54 |
| `novel_illustrator`, NULL | `(illustrator, novel)` | 29 → 29 |
| `comic_writer`, NULL | `(author, comic)` | 3 → 3 |

`comic_artist` has zero role rows and zero credits, so nothing moves.
555 rows → 791. Expanding `director`/`anime` to both anime media types
preserves what that dropdown already served, via the now-deleted
`DIRECTOR_ANIME_MEDIA_TYPES`.

Then `ALTER COLUMN scope SET NOT NULL` and swap the unique constraint.

Downgrade reverses it, mapping `(author, manga)` and `(illustrator, manga)`
back onto a single `manga_author` row and `(director, anime|anime-movie)` back
onto one `anime` row. It is lossy in the same way the upgrade is
information-adding, and the docstring says so.

### Revision 2 — names

Add the four name columns and `display_name_field` nullable; distribute
`name_native`; drop `uq_person_name` and `name_native`; add the new UNIQUE and
CHECK.

`name_en` and `name_cn` are NULL on all 554 rows today, so nothing is
overwritten. Unlike studios — where `name_native → name_en` was correct and
lossless for all 77 — people are mixed: **336 CJK, 218 Latin.** The
distribution rule, and the counts it produces:

| bucket | rule | rows |
|---|---|---|
| `name_en` | name contains no CJK | 218 |
| `name_cn` | CJK **and** credited as director on `anime`/`anime-movie`, or as `producer`, or as `composer`, or as an author of a novel whose `novel.type` is not `Light Novel` or `Web` | 167 |
| `name_jp` | every other CJK name | 169 |

This tracks something real in the collection rather than guessing at
orthography: anime staff and translated literary novelists are recorded in
Chinese-rendered kanji, while manga, comic and light-novel creators are
recorded in Japanese. The buckets bear that out — CN takes 渡部高志, 荒木哲郎,
伊藤智彥; JP takes えれっと, 諫山創, 鴨志田一.

The rule is verified total and near-unambiguous:

- **0** CJK people have no credits, so every row is classified.
- **0** people in the CN bucket also hold a manga, comic, novel-illustrator or
  live-action-director credit, so no precedence rule is needed between them.
- **3** people author both a plain novel and a Light Novel/Web novel. CN wins,
  because they match an affirmative CN condition. Three rows, fixable by hand
  in the Modify tab.

Being in the wrong slot is cheap: `_find_by_name` scans all four name fields
and `display_name` falls back through all four, so **resolution and display
are identical whichever slot a name lands in**. Only the label is at stake.

### One owner of the rule: `name_slot_for()`

The migration is not the only writer of a new person. `resolve_person` mints
one whenever Fill/Pull, the Sheets restore or a typed dropdown value names
somebody unknown, and it would be incoherent for a name to land in `name_en`
during the migration and somewhere else the next day.

So the rule lives once, in `app/utils/name_normalize.py` beside
`normalize_name`:

```python
name_slot_for(name, *, role, scope, novel_type=None) -> "en" | "cn" | "jp"
```

- no CJK in `name` → `"en"`
- `(director, anime|anime-movie)`, `producer`, `composer` → `"cn"`
- `(author, novel)` and `novel_type` not in `{"Light Novel", "Web"}` → `"cn"`
- otherwise → `"jp"`

The migration calls it with `novel_type` from a join, which is where the
Light Novel/Web distinction is knowable. `resolve_person` has the role and the
media type but not the novel's type, so it passes `novel_type=None`, and the
rule as written sends a CJK novel author to `"jp"`. That is the right default
for this collection: 55 novels are Light Novel or Web against 43 that are not.

A person created from the admin form never reaches this — the form has four
labelled name fields and the admin fills the right one.

`name_alt` is deliberately never chosen automatically. It is the slot an admin
uses for a name that is genuinely none of the three, and a writer guessing its
way into it would make that meaning useless.

Downgrade adds `name_native` nullable, backfills
`COALESCE(name_cn, name_jp, name_en, name_alt)`, sets NOT NULL, restores the
old constraint and drops the new columns.

## Backend

### `app/utils/credit_roles.py`

`CREDIT_ROLES` shrinks to six entries (five person roles plus `studio`).
`CreditRole.person_role` is dropped — it is now the key itself for every
person role, and `None` only for `studio`. `PERSON_ROLES` derives as before.

`SCOPED_PERSON_ROLES`, `DIRECTOR_ANIME_MEDIA_TYPES` and `director_scope_for()`
are deleted: every role is scoped, and the scope is the media type.

New `credit_label(role, media_type) -> str`, backed by a small
`{(role, media_type): label}` override map falling back to `CreditRole.label`.
This is the single owner of 原作 / 作畫 / Writer / Artist.

`LEGACY_SHEET_COLUMN` needs only its keys renamed —
`("manga", "manga_author_plot")` becomes `("manga", "author")`, and so on. It
already keys on `(media_type, key)`, which is exactly the shape this collapse
needs, so **every sheet header is byte-identical after the change**. A test
asserts that.

### `app/services/domain/credits.py`

- `_find_by_name` extends to all four person name fields, as it must already
  do for Studio. This is the load-bearing function: the data migration, the
  credits API, Fill/Pull and the Sheets restore all resolve through it.
- `resolve_person(db, name, *, role, scope)` — `scope` becomes required and is
  the entry's media type. A newly created person's name goes into the slot
  `name_slot_for()` picks (below), not into a fixed column.
- `replace_credits` drops its `director_scope_for` branch and passes
  `media_type` as the scope for every person role.
- `credit_names` returns `display_name` for a Person, matching the change the
  studio session is making for Studio in the same function.

### `app/routers/person.py`

- `GET /?role=&scope=` filters strictly. With no unscoped rows left, a query
  without `scope` means "holds this role anywhere", which is what the admin
  list wants and no dropdown asks for.
- `POST /` stays find-or-create for the reason its docstring already gives
  (`ensureSourceValues.js` posts here for role-filtered lists). Role entries
  in the payload now require a scope.
- `PUT /{id}` continues to replace the whole role set.
- `DELETE /{id}` takes `?credits=N`; if `N` does not match the current credit
  count the request is rejected with 409. The confirmation the admin saw is
  then the deletion that happens, rather than a count that moved underneath
  them. Cascade behaviour itself is unchanged.
- `POST /{id}/merge` unchanged; it already unions role rows, which stays
  correct when those rows are always scoped.
- New `GET /{id}/entries`, mirroring the studio endpoint exactly: reads
  `media_credit` by `person_id`, passes the `(media_type, entry_id)` pairs
  through `filter_visible_pairs` in one batched query, resolves survivors
  through `MEDIA_TABLES`, returns them grouped by media type with
  `display_name`, cover file, release date and the derived credit label. A
  person whose every credit is hidden returns empty groups, not 404 — a person
  carries no content label of their own.

### `app/schemas/staff.py`

`PersonBase` gains the four names, `display_name_field` and a model validator
enforcing "at least one name", so the API answers 422 rather than surfacing a
500 from the CHECK. `PersonResponse` gains `display_name` and `names_dict` so
no client re-implements the fallback.

`PERSON_ROLE_SCOPES` — the module-level constant holding `anime`/`non_anime`,
with the comment insisting it is deliberately *not* the media-type keys — is
deleted. `PersonRoleIn.scope` becomes required, and its validator tightens
from "is a known scope" to "is a legal scope **for this role**", using
`CreditRole.media_types`. That catches `(composer, manga)`, which the old
per-field validator could not see. It runs as a model validator, since it
needs both fields.

### `app/routers/_factory.py`

`attach_link_fields` gains `credit_refs` on every media response:

```json
"credit_refs": {
  "author":      [{"system_id": "...", "display_name": "...", "label": "原作"}],
  "illustrator": [{"system_id": "...", "display_name": "...", "label": "作畫"}]
}
```

Keyed by role, with the label already derived for the entry's media type, so
no client re-implements Decision A. The existing flat comma-joined strings
(`director`, `author_plot`, …) stay exactly as they are — they are the legacy
column names and the Sheets contract. `attach_link_fields` already batches
over a whole list, so this adds no N+1.

This differs from the studio session's `studio_refs`, which is a bare list
because `studio` is a single role. The two coexist; unifying them is not worth
a cross-session dependency and can be done later if it ever grates.

## Frontend

### Admin — Entity → Person

`TAB_GROUPS` already gains `entity` from the studio session. `ADMIN_TABS`
gains `{ key: "person", group: "entity", label: "Person" }`, excluded from
`FORM_TABS` like `studio`, since a person is not a media entry.

Inside the Person tab, a sub-tab bar of the five types, built the way
`OptionSubTabBar` is — one exported constant shared by Add, Modify and Delete
so the three cannot drift:

    Director | Producer | Music / Composer | Author | Illustrator

The sub-tab does two things: it filters **which people are listed**, and it
preselects the type for a new person. It does **not** scope the form — a
person is one row and may hold several types, so the form always shows their
full role × scope matrix. A `ScopePicker` per held role offers only that
role's legal media types, read from the constants endpoint rather than
hard-coded.

Delete shows the live credit count — "3 credits will be removed" — sends it
back as `?credits=3`, and points at merge as the correct fix for a duplicate.

The People sub-tab **moves out** of `OPTION_SUB_TABS`, leaving `options` and
`tags`, so there is one way to create a person. This follows the studio spec's
identical move for Studios; `OPTION_SUB_TABS` and `OPTION_VALUE_SUB_TABS`
collapse into one list and the comment explaining the split goes away.

`SystemOptions.jsx` keeps its read-only Tier 3 panel, but its
`BECAME_ENTITIES` map is rewritten: five of its rows name role keys
(`manga_author`, `novel_author`, `comic_writer`, `comic_artist`) that no
longer exist.

### Public

- `/library/person` → `pages/library/PersonLibrary.jsx`, following
  `StudioLibrary` and the `CollectionLibrary` / `FranchiseLibrary` precedent
  for non-media-type libraries. Cards with photo, display name, credit count;
  search across all four names; filter by type; sort by name, credit count or
  rating.
- `/person/:system_id` → `pages/detail/Person.jsx`. Photo, display name with
  the other names beneath, rating, gender, remark, then the credited entries
  from `/entries`, grouped by media type, as `MediaCard`s with their derived
  credit label.
- Both lazy-loaded in `App.jsx`; a Person entry in the Nav catalog drawer
  beside Studio.
- Detail pages render `credit_refs` as linked chips: anime (director,
  producer, music), anime-movie and movie (director), manga, novel and comic
  (author, illustrator). Today these are flat text.
- One `displayPersonName()` in `lib/naming.js` mirroring the backend property,
  the same division of labour the studio spec sets up.

### `fieldMeta.js`

The ten person-sourced fields move to the collapsed pairs:

| field | was | becomes |
|---|---|---|
| anime director | `director` / `anime` | unchanged |
| anime-movie director | `director` / `anime` | `director` / `anime-movie` |
| movie director | `director` / `non_anime` | `director` / `movie` |
| anime producer | `producer` / — | `producer` / `anime` |
| anime music | `composer` / — | `composer` / `anime` |
| manga 原作 | `manga_author` / — | `author` / `manga` |
| manga 作畫 | `manga_author` / — | `illustrator` / `manga` |
| novel author | `novel_author` / — | `author` / `novel` |
| novel illustrator | `novel_illustrator` / — | `illustrator` / `novel` |
| comic writer | `comic_writer` / — | `author` / `comic` |
| comic artist | `comic_artist` / — | `illustrator` / `comic` |

`sources.js` needs no change — it already fetches one request per distinct
`{role, scope}` pair. The pair count rises from 7 to 10.

## Testing

Failing test first, per `CLAUDE.md`. `pytest`, `ruff`, `vitest` and `eslint`
all stay green.

Backend:

- Revision 1 upgrade splits a `manga_author` who holds only a plot credit into
  `(author, manga)` alone, one who holds only a draw credit into
  `(illustrator, manga)` alone, and one holding both into both rows.
- Revision 1 expands `director`/`anime` into two rows and `non_anime` into
  `(director, movie)`; downgrade round-trips.
- `person_role.scope` NOT NULL rejects an unscoped insert.
- `name_slot_for` returns `en` for a Latin name, `cn` for a CJK anime
  director, `cn` for a CJK author of a plain novel, `jp` for the same author
  when the novel is a Light Novel, and `jp` for a CJK manga author — and
  never `alt`.
- Revision 2 distributes real-shaped rows through `name_slot_for`, and
  `resolve_person` puts a newly minted CJK manga author in the same slot the
  migration would have.
- `PersonRoleIn` rejects `(composer, manga)` as an illegal scope for the role.
- `credit_label` returns 原作 for `(author, manga)`, `Writer` for
  `(author, comic)`, `Director` for `(director, movie)`.
- **Every `sheet_column_for` result is unchanged** across the rename — the
  regression this whole collapse most easily causes.
- A name written to Sheets from `credit_names` resolves back to the same
  person through `resolve_person`.
- `resolve_person` on a manga credit yields `(author, manga)` and does not
  touch any other scope the person holds.
- `GET /{id}/entries` hides a content-labelled entry from a restricted viewer,
  shows it to a superuser, and returns empty groups rather than 404 when every
  credit is hidden.
- `DELETE` with a stale `?credits=` value is rejected with 409.

Frontend:

- `PersonLibrary` search matches each of the four name fields.
- `displayPersonName` agrees with the backend fallback, including when
  `display_name_field` names an empty column.
- The manga detail page labels its two person chips 原作 and 作畫.
- The person sub-tab bar filters the list without narrowing the form's role
  matrix.

## Documentation

Updated in the same change, each with its `Last verified` line bumped:

- `docs/systems/credits-and-tags.md` — the largest edit. One vocabulary, the
  scope rule, the label derivation, the retired `LEGACY_SHEET_COLUMN` keys.
- `docs/data-model.md` — both reshaped tables and their constraints.
- `docs/options.md` — why person scope and option scope differ (Decision B).
- `docs/api.md` — the new endpoint, the `DELETE` guard, `credit_refs`.
- `docs/business-rules.md` — labels derived from `(role, media_type)`.
- `docs/frontend/pages.md`, `docs/frontend/admin-pages.md`,
  `docs/frontend/components.md` — the public pages and the Person tab.
- `docs/notes/migrations-history.md` — the two revisions.
- `docs/roadmap.md` — the "public person and studio pages deferred" line is
  removed once both halves land; this work moves to "Done".

## Risks

- **Concurrent session.** The studio session owns `app/models/staff.py`,
  `app/services/domain/credits.py`, `frontend/src/config/adminTabs.js` and
  `Add.jsx` right now, and its migration `s1t2u3d4i5o6` is uncommitted. Both
  revisions here must chain after it to keep a single head, and per `CLAUDE.md`
  only this work's own hunks may be staged. `_find_by_name` and `credit_names`
  are edited by *both* designs; whichever lands second must re-read rather than
  reapply.
- **The resolver is the sharp edge**, as the studio spec says. A miss creates a
  duplicate person and silently splits their credits. The Sheets round-trip
  test is the guard.
- **The sheet headers are the quiet regression.** Renaming role keys without
  renaming `LEGACY_SHEET_COLUMN`'s keys in lockstep would change Backup
  columns for manga, novel and comic. Covered by a test that asserts the full
  header set.
- **Revision 1 is not cleanly reversible.** Collapsing 原作/作畫 into one
  `manga_author` row on downgrade discards the split. Acceptable — the
  downgrade exists to unblock a bad deploy, not to round-trip data — but it is
  stated in the revision docstring rather than discovered.
- **`gender` now has no scoped role that uses it.** It stays for the deferred
  `character_voice` work; the model comment already explains this and is not
  weakened by the collapse.
