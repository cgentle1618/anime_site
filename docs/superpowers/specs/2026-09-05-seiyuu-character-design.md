# Seiyuu and Character — design

Status: approved for planning
Date: 2026-09-05
Branch: modify

## Why

**There is no way to record who voices whom.** `anime.seiyuu` is a `Need`/`Done`
to-do flag and has never been a cast list — `docs/options.md` says so outright.
The nav already carries a `Seiyuu` item marked `dev: true`
(`frontend/src/config/navigation.js`), and `person.gender` was put on the base
table specifically for the seiyuu case; its docstring says as much. The feature
has been anticipated in three places and built in none.

**The deferred design is stale.** `docs/systems/credits-and-tags.md` carries a
"Deferred: `character` / `character_voice`" section from the 2026-08-29
system-options redesign: a `character` owned by a franchise, and a
`character_voice` linking it to a person with a `language` and an optional
per-entry override. That shape was never built and is no longer what we want —
see [Decisions](#decisions) for the three points where this design departs from
it deliberately.

**A seiyuu cannot be a flat credit.** Every other person role answers "who
worked on this entry". A seiyuu answers "who voiced *this character* in this
entry", and the character is not optional to the fact. That single difference
drives the whole design.

## Scope

In scope:

1. `seiyuu` as a sixth person role in the one credit vocabulary, scoped to
   `anime` and `anime-movie`, with a new `credited_via` axis recording that its
   rows live outside `media_credit`.
2. A `character` table shaped like `person`, as a full public entity.
3. A `character_casting` table: one character, in one entry, optionally voiced
   by one person, with its own role, order, photo and remark.
4. `/api/character` and `/api/casting` routers.
5. Repairs to three existing person behaviours that break silently once a
   person's work can live outside `media_credit`.
6. A cast editor in the anime, anime movie, manga and novel Add/Modify forms,
   and a Cast section on those four detail pages.
7. Character library and detail pages, Entity → Character admin forms, and
   `/library/seiyuu`.
8. Google Sheets backup/restore for both new tables.

Out of scope, deliberately:

- **Tenrai cast auto-fill.** `/anime/{mal_id}/characters` is the Jikan-shaped
  endpoint that would fill a cast automatically, but its existence on Tenrai v1
  is **unverified** and it needs duplicate-resolution rules of its own (which
  "Yuki" is this?). The manual editor should be working and trusted first. A
  later spec owns this.
- **A `language` column / dub casts.** See [Decision D](#decision-d--no-language-column).
- **A `field_group` gating cast per role.** Cast rows follow entry visibility
  through the existing `filter_visible_pairs` path. Making cast gateable the way
  Restricted Sources is would be a later, additive change.
- **Characters on the four non-ACG types** (movie, tv-show, cartoon, comic).
  A scope widening later, not a reshape.
- **`anime.seiyuu`.** The `Need`/`Done` flag is untouched. `docs/options.md`
  gains a line making the distinction explicit now that a real seiyuu concept
  exists alongside it.

## Decisions

### Decision A — the cast list has exactly one home

Two shapes were considered.

*Two independent records:* `media_credit` rows with `role="seiyuu"` say "this
person is in this anime", and `character_casting` separately says "this person
voices Ichika". Rejected: two sources of truth for one fact. Adding a casting
would not add the seiyuu to the anime's cast, and the two can silently disagree.

*One record, derived list (chosen):* `character_casting` is the only cast
record. An anime's seiyuu list is derived by walking its castings. `person_role`
still gains a `seiyuu` row per person, so a seiyuu appears in dropdowns and on
`/library/seiyuu`, but **no `media_credit` row with `role="seiyuu"` ever
exists**.

This matches how the data behaves — a seiyuu is in an anime *because* they voice
someone in it — and it is the only shape where "who is in this anime" has one
answer.

### Decision B — `seiyuu` stays in the one vocabulary, with a `credited_via` axis

`app/utils/credit_roles.py` is documented as ONE vocabulary, where "the key a
credit stores IS the person role it implies", and `PERSON_ROLES` is derived from
it. Decision A breaks that: the person needs the role, but no credit row carries
it.

Rejected — *split the lists*, making `PERSON_ROLES` its own tuple. This
reintroduces exactly the two-lists-that-drift problem the 2026-09-04 collapse
removed, and every `CREDIT_ROLES[role]` lookup in the person router would need a
guard.

Rejected — *derive seiyuu-ness from casting rows*, with no `person_role` change
at all. This fails the case `PersonRole`'s docstring exists for: a seiyuu added
today must appear in the cast dropdown *before* their first casting exists.

Chosen — `CreditRole` gains `credited_via: str = "media_credit"`, and `seiyuu`
declares `credited_via="character_casting"`. One vocabulary, one new axis, and
"this role's credits are stored elsewhere" becomes a fact the code states rather
than one a reader infers.

### Decision C — a character has no owner; it links to many entries

The 2026-08-29 design gave `character` a nullable `franchise_id`. Rejected: a
character appears in several entries that need not share a franchise, and
ownership cannot express that. `character` is a top-level row and
`character_casting` is the many-to-many, exactly as `media_credit` is for people.

### Decision D — no `language` column

The 2026-08-29 design carried `language` on `character_voice`, so a JP seiyuu and
a CN or EN dub actor could coexist. Rejected for now: the column would read
"Japanese" on every row until the day a dub is entered, and it complicates the
unique key. Dubs are a later widening, and adding the column then is additive.

### Decision E — casting is per entry, with no default

Rejected — *default plus override*, where a NULL entry means "her usual seiyuu"
and a filled one overrides it. Every read would have to resolve override-then-
default, and "who voices her here" would have two possible answers.

Chosen — the casting row IS the record. Ichika in season 1 and Ichika in the
movie are two rows, each naming its own seiyuu. Recasts are free, no resolution
logic exists, and an entry's cast is one query.

### Decision F — the table is `character_casting`, not `character_appearance`

"Appearance" reads two ways — "appears in this anime" and "how she looks" — and
the moment the row carries a `photo_file`, the second reading wins. This is the
same ambiguity `CLAUDE.md` already tracks for the word "label".
`character_casting` says what the row is: this character, in this entry, voiced
by this person, looking like this.

### Decision G — character names carry no unique constraint

`uq_person_name` and `uq_studio_name` work because a human's or a company's full
name is nearly unique. Character names are not — "Yuki" and "Ichika" recur
across unrelated works — and under Decision C there is no owning franchise to
scope a constraint to. So `character` has `ck_character_has_a_name` (at least
one name) and **no uniqueness constraint**. Duplicates are caught by the
existing spelling-variant check on create, and fixed by merge afterwards.

This is a real divergence from the two sibling tables and must be commented as
one, or a future reader will "restore" the missing constraint.

**Consequence: `POST /api/character` must NOT be find-or-create.** `POST
/api/person` is, and safely — `find_person` matches on the normalized name
(`app/utils/name_normalize.py`), and two spellings of one director really are
one human. Applying the same rule to characters would silently unify the Yuki of
one work with the unrelated Yuki of another, which is precisely the collision
Decision G accepts as normal. So the character endpoint is a **plain create**,
and disambiguation moves to the UI: the cast editor's character combobox lists
existing matches *with the entries they already appear in*, and minting a new
row requires the explicit "Create new character named X" choice. The seiyuu
combobox in the same editor keeps find-or-create, because it targets `person`.

### Decision H — deleting a seiyuu must not delete the character's casting

`media_credit.person_id` is `ON DELETE CASCADE`, which is right: the credit *is*
the person's link to the work. A casting is not — it is the *character's* link to
the work, which happens to name a seiyuu. `character_casting.person_id` is
therefore **`ON DELETE SET NULL`**, and `character_id` is `ON DELETE CASCADE`.
The one table diverges from the sibling it otherwise copies; comment it.

## Data model

### `character`

Same shape as `person`, deliberately, so the two read alike. Uses
`NameFallbackMixin` and sets `_name_fields` for name matching.

| Column | Type | Null | Notes |
|---|---|---|---|
| `system_id` | UUID | no | PK, indexed |
| `name_en` | String | yes | indexed |
| `name_cn` | String | yes | |
| `name_jp` | String | yes | |
| `name_alt` | String | yes | |
| `display_name_field` | String | yes | `en`/`cn`/`jp`/`alt`, or NULL for the fallback chain |
| `gender` | String | yes | |
| `my_rating` | String | yes | one of `MY_RATINGS` |
| `photo_file` | String | yes | GCS object key — the canonical portrait |
| `remark` | Text | yes | |
| `created_at`, `updated_at` | DateTime | no | `get_taipei_now` |

Constraints: `ck_character_has_a_name` — `num_nonnulls(name_en, name_cn,
name_jp, name_alt) >= 1`. **No unique constraint** (Decision G).

### `character_casting`

| Column | Type | Null | Notes |
|---|---|---|---|
| `system_id` | UUID | no | PK, indexed |
| `character_id` | UUID | no | FK → `character.system_id`, `ON DELETE CASCADE`, indexed |
| `media_type` | String | no | hyphenated key; one of `anime`, `anime-movie`, `manga`, `novel` |
| `entry_id` | UUID | no | the FK-less pair, same contract as `media_credit` |
| `person_id` | UUID | yes | FK → `person.system_id`, **`ON DELETE SET NULL`**, indexed |
| `role` | String | yes | one of `CHARACTER_ROLES` |
| `position` | Integer | no | default 0, server_default "0" |
| `photo_file` | String | yes | GCS key — this character *in this entry* |
| `remark` | Text | yes | |
| `created_at` | DateTime | no | |

Constraints and indexes:

- `uq_character_casting (character_id, media_type, entry_id)` — one casting per
  character per entry, which is what Decision E buys. No `NULLS NOT DISTINCT`
  needed: all three columns are NOT NULL.
- `ix_character_casting_entry (media_type, entry_id)` — the cast-list query.
- `ck_casting_voice_scope`: `person_id IS NULL OR media_type IN ('anime',
  'anime-movie')`. This makes both scope decisions — characters reach the four
  ACG types, seiyuu reach two — a database fact rather than a convention.

`photo_file` resolves at read time: the casting's own value if set, otherwise
`character.photo_file`. Same shape as `display_name_field`, where the row states
its choice and a fallback covers the NULL.

### Migration

**One Alembic revision, creating two tables. Nothing existing is altered.**

`person_role.role` is a plain `Column(String, nullable=False, index=True)` — no
database enum, no CHECK listing legal values; validation lives in
`PersonRoleIn._known_role` against `PERSON_ROLES`. So `seiyuu` becomes a legal
person role with **no migration at all**. This is why the seiyuu half of the
feature is vocabulary-only.

## Vocabulary

`app/utils/credit_roles.py`:

```python
@dataclass(frozen=True)
class CreditRole:
    ...
    # Where this role's credits are STORED. "media_credit" for the six roles
    # whose rows live there; "character_casting" for seiyuu, whose casting is a
    # character-first fact and cannot be a flat person link. See Decision A.
    credited_via: str = "media_credit"

"seiyuu": CreditRole(
    "seiyuu", "Seiyuu 聲優", "person", ("anime", "anime-movie"),
    credited_via="character_casting",
),
```

`PERSON_ROLES` keeps deriving from `target == "person"`, so `person_role`
validation, `/api/person/role-scopes`, `/role-counts` and the admin role × scope
matrix pick seiyuu up with no further change.

`credit_roles_for()` gains a `credited_via == "media_credit"` filter, so the
credits router and the sheet link-column builder do not start asking for seiyuu
rows that will never exist there. **Every `CREDIT_ROLES` / `CREDIT_ROLE_KEYS`
call site must be audited for the same assumption** — the one filter is not
assumed to catch them all.

`CHARACTER_ROLES = ("Main", "Supporting")` joins the fixed vocabularies in
`app/routers/constants.py`.

## API

### `/api/character`

Mirrors `/api/person` almost line for line:

| Endpoint | Notes |
|---|---|
| `GET /` | list, with `?name=` search |
| `GET /{system_id}` | one character |
| `GET /{system_id}/entries` | grouped by media type, each naming the seiyuu |
| `POST /` | **plain create, NOT find-or-create** — unlike `POST /api/person`. See the consequence note in [Decision G](#decision-g--character-names-carry-no-unique-constraint) |
| `PUT /{system_id}` | full update |
| `DELETE /{system_id}?castings=N` | the same count-guard concurrency check as `DELETE /api/person?credits=N`: a count that moved underneath the admin is a 409 |
| `POST /{system_id}/merge` | repoint castings, delete the loser — the correct fix for a duplicate, since delete cascades castings away |

### `/api/casting/{media_type}/{entry_id}`

Shaped after `/api/credits`: `GET` returns the entry's cast ordered by
`position`; `PUT` replaces it wholesale, matching how the Add/Modify forms
already submit.

It deliberately does **not** fold into `/api/credits`. That payload is
`Dict[str, List[str]]` — bare names — and a cast row is a character plus a
seiyuu plus role, position, photo and remark. Forcing it in would break the
simpler contract for every other role.

Both routers filter through the existing `entry_visible` / `filter_visible_pairs`
path, exactly as credits do.

### Three existing behaviours that break silently

Each of these would otherwise ship as a bug, and each gets a failing test first.

1. **`PersonResponse.credit_count` counts `media_credit` rows only.** A seiyuu
   with fifty castings and no other credits would read **0 credits** on their
   card. It must count casting rows too, through the same `filter_visible_pairs`
   call, so the card and the page cannot disagree.
2. **`GET /api/person/{id}/entries` walks `media_credit`.** A pure seiyuu's page
   would be **empty**. It needs a casting-derived group, labelled with the
   character voiced.
3. **`DELETE /api/person?credits=N`** guards on a count that would now be
   missing the castings the admin is about to orphan. Under Decision H those
   castings survive with `person_id` NULL rather than vanishing, so the count
   the admin confirms must say so.

### Cast on entry payloads

Cast is fetched separately via `/api/casting/...` on the detail page; **no
`cast_refs` is attached to the entry payload** alongside `credit_refs`.
`credit_refs` carries a query-count guard test precisely because it rides every
list payload; a cast list is long, needed on exactly one page, and would make
every library list pay for it.

## Frontend

### The cast editor is a table, not a dropdown

Every existing credit field is a multi-value combobox declared in
`fieldMeta.js` as `source: { kind: "person", role, scope }`. Seiyuu cannot use
that shape. Instead of a `fieldMeta` entry, a new `CastEditor` component goes
into the anime, anime movie, manga and novel Add/Modify tabs: one row per
character, with a character combobox, a seiyuu combobox, a Main/Supporting
select, a photo slot, a remark, and drag-to-reorder writing `position`.

The two comboboxes behave **differently**, and deliberately so (Decision G):

- The **seiyuu** combobox find-or-creates through the existing
  `ensureSourceValues.js` path — typing a known seiyuu's name reuses them
  rather than splitting their castings.
- The **character** combobox does not. It lists existing matches together with
  the entries they already appear in, so the admin can tell one Yuki from
  another, and minting a row requires the explicit "Create new character named
  X" choice.

On **manga and novel** the editor renders **without the seiyuu column**,
mirroring `ck_casting_voice_scope` so the UI cannot offer what the database will
reject.

### Pages

| Page | Mirrors |
|---|---|
| `/library/character` | `PersonLibrary.jsx` |
| `/character/:system_id` | `detail/Person.jsx` — castings grouped by media type, each naming the seiyuu |
| `/library/seiyuu` | `PersonLibrary.jsx` with `?role=seiyuu` — not a new page type |
| Entity → Character Add/Modify/Delete | the Person admin forms + `PersonSubTabBar` |

Neither new library route goes through `LIBRARY_CONFIGS` — that map is media
types only, and Person and Studio already sit outside it as their own routes.

`navigation.js`: the `Seiyuu` item loses `dev: true` and gains
`to: "/library/seiyuu"`; a `Character` item joins **Entities** beside Studio and
Person.

`/library/seiyuu` lists people holding the role whether or not they have been
cast, so an uncast seiyuu shows with zero entries. This is intended — it is the
case `PersonRole`'s docstring exists for.

### Detail pages

`Anime.jsx`, `AnimeMovie.jsx`, `Manga.jsx` and `Novel.jsx` gain a Cast section
fetching `/api/casting/...`, each row linking the character to `/character/:id`
and the seiyuu to `/person/:id`, showing the casting photo with the character
portrait as fallback.

Semantic colour tokens only — `src/theme-tokens.test.js` fails the build on
hard-coded greys — and `cd frontend && npm run build` after, per `CLAUDE.md`.

## Pipelines and sheets

Two new `SheetTab` entries in `app/services/pipelines/tabs.py`, and **order
matters**: it is the restore order and it is strict.

- `Character` sits with the other entity tabs, **before** the media tabs, beside
  Person and Studio.
- `Character Casting` sits **after** every media tab, since it points at entries
  through the FK-less pair, like Media Source and the relation tabs.

Two new parsers in `app/utils/formatter.py`. This is what carries the feature
across the company ↔ home switch (`docs/switching-environments.md`), so it is
not optional.

## Testing

Failing test first for every behaviour change, per `CLAUDE.md`.

Backend:

- `tests/unit/test_credit_roles.py` — `credited_via` defaults, and
  `credit_roles_for()` still excludes seiyuu on anime and anime-movie.
- `tests/services/test_character_model.py` — `ck_character_has_a_name`, the
  `display_name` fallback chain, and that no unique constraint rejects two
  same-named characters (Decision G, asserted so a future "fix" fails loudly).
- `tests/services/test_character_casting_model.py` — `uq_character_casting`,
  `ck_casting_voice_scope` rejecting a seiyuu on a manga casting, `SET NULL` on
  person delete and `CASCADE` on character delete (Decision H).
- `tests/api/test_character_router.py` — that two POSTs of the same name create
  **two** characters (the API-level half of Decision G, so a future "make this
  find-or-create like person" fails loudly), merge, and the `?castings=N` 409
  guard.
- `tests/api/test_casting_router.py` — GET/PUT wholesale replace, visibility.
- Three regressions: `credit_count` including castings,
  `/api/person/{id}/entries` returning a seiyuu group, and the person delete
  guard counting castings.
- `tests/services/test_credits_sheets.py` — round-trip for both new tabs.

Frontend: `CastEditor` (including the seiyuu column absent on manga/novel),
`CharacterLibrary`, `detail/Character`, and `/library/seiyuu` resolving to
`PersonLibrary` with the role filter.

`pytest`, `ruff`, `vitest` and `eslint` all green — CI runs all four before
deploying.

## Docs to update in the same change

Per `CLAUDE.md`, with `Last verified` bumped on each:

- `docs/data-model.md` — two new tables.
- `docs/options.md` — the `seiyuu` role, and an explicit line that
  `anime.seiyuu` remains an unrelated `Need`/`Done` flag.
- `docs/systems/credits-and-tags.md` — the "Deferred: `character` /
  `character_voice`" section is replaced by what was built, and by the three
  points where it diverged (Decisions C, D, F).
- `docs/api.md`, `docs/frontend/pages.md`, `docs/frontend/components.md`.
- `docs/roadmap.md` — progress in its own section; the plan itself unmodified.

## Phasing

One spec, three phases. Each ends at a green test suite.

1. **Vocabulary and data.** `credited_via` + the `seiyuu` role, both tables and
   the migration, both routers, and the three repairs under
   [Three existing behaviours that break silently](#three-existing-behaviours-that-break-silently).
2. **Editing.** `CastEditor` in the four Add/Modify tabs, and the Cast section on
   the four detail pages.
3. **Browsing.** Character library and detail pages, Entity → Character admin
   forms, `/library/seiyuu`, and the `navigation.js` change.

Tenrai cast auto-fill is a separate spec, after phase 3.

## Open question for implementation

`/anime/{mal_id}/characters` on Tenrai v1 is **unverified**. Confirm with one
cheap call before any later spec designs auto-fill on top of it. Nothing in this
spec depends on the answer.
