# Media Sources — Design

**Status:** approved design, not yet implemented
**Date:** 2026-09-04
**Last verified:** 2026-09-04

## Problem

"Source" means four unrelated things in the codebase today, and each media type
implements a different subset of them.

| Mechanism | Where | Types |
|---|---|---|
| Dedicated boolean + link columns | `source_baha` / `baha_link` / `source_netflix` | anime, anime-movie |
| Free-form JSONB map | `source_other` (`{name: url}`) | all 8 |
| Tag field over a vocabulary | `source_official` (`TagField`) | movie, tv-show, cartoon |
| Free-text string, no vocabulary | `serialization_platform` | manga |

Plus external-database links (`mal_link`, `anilist_link`, `imdb_link`,
`comicvine_link`, `official_link`, `twitter_link`) that `SourcesCard` renders in
the same flat list even though they answer a different question.

Consequences we are fixing:

- Adding a platform costs a migration, a `fieldMeta` entry, a `formFactories`
  default, a `payloads.js` mapping, a sheet column and a `SourcesCard` prop —
  multiplied by every media type that wants it.
- `source_other` has no vocabulary, so "Netflix" and "netflix" are different
  sources and nothing links them.
- `source_other` is a `dict` in the DB and API but a `[{name, url}]` array in the
  forms; a duplicate name silently drops a row.
- Each of the 8 `*AddTab.jsx` files carries its own copy-pasted ~50-line
  `source_other` editor.
- Manga and Novel string-match Twitter out of `source_other` by
  `k.toLowerCase() === "twitter"` (`Manga.jsx:394`), so `X` or `Twitter (JP)`
  behaves differently from `Twitter`.
- `movie` declares `source_official` but never passes it to `SourcesCard`
  (`Movie.jsx:263`) — invisible.
- `comic` never passes `comicvine_link` to `SourcesCard` (`Comic.jsx:289`) —
  invisible.
- `manga` renders `serialization_platform` twice (`Manga.jsx:524` and `:630`).
- There is exactly one gate (`sources_other`); there is no second, more
  restricted tier.

## Guiding rule

> **A link the system acts on is a column. A link that is only ever displayed is
> a `media_source` row.**

Verified against the code, this splits cleanly:

| Link | Who touches it | Verdict |
|---|---|---|
| `mal_link`, `imdb_link`, `comicvine_link` | `derivation.py:51` parses the ID out; `autofill.py` fetches on that ID; `checking.py:197` and `calculation.py:354` gate on presence; ComicVine has conflict logic | **stays a column** |
| `mal_id`, `imdb_id`, `comicvine_id` | Fill pipeline keys | **stays a column** |
| `official_link`, `twitter_link` | write target of `autofill.py:74-77` only; never read | **becomes a row** |
| `anilist_link` | not read or written anywhere in `app/services/` | **becomes a row** |

Dragging the ID-bearing links through a polymorphic table so the Fill pipeline
can find its own key would be strictly worse. The Sources card composing from two
places is acceptable because the split is principled rather than historical —
and `SourcesCard` already does exactly that today.

## Data model

### New table: `media_source`

Follows the `media_credit` / `media_tag` idiom — many named things attached to
any entry, drawn from a vocabulary managed on the admin Options page, composed
onto the entry at read time.

| Column | Type | Notes |
|---|---|---|
| `system_id` | UUID pk | `default=uuid.uuid4`, indexed |
| `media_type` | String, not null | hyphenated media type key (`app/utils/media_resolver.py`) |
| `entry_id` | UUID, not null | FK-less pair with `media_type` |
| `kind` | String, not null | `access` \| `reference` |
| `bucket` | String, not null | `main` \| `other` \| `restricted` |
| `option_id` | UUID, nullable | FK → `system_option.system_id`, `ondelete="CASCADE"`. Set on `main` rows |
| `name` | String, nullable | free text. Set on `other` / `restricted` rows |
| `available` | Boolean, nullable | tristate. **`main` access rows only** |
| `url` | String, nullable | |
| `position` | Integer, not null, `server_default="0"` | |
| `created_at` | DateTime | `default=get_taipei_now` |

```python
__table_args__ = (
    CheckConstraint(
        "num_nonnulls(option_id, name) = 1", name="ck_media_source_one_target"
    ),
    UniqueConstraint(
        "media_type", "entry_id", "kind", "bucket", "option_id", "name",
        name="uq_media_source_row", postgresql_nulls_not_distinct=True,
    ),
    Index("ix_media_source_entry", "media_type", "entry_id"),
)
```

Naming and shape copy `media_credit` exactly (`app/models/media_credit.py:21-83`):
the polymorphic pair is `media_type` + `entry_id` (not `owner_type`/`owner_id`,
which is the `MediaTypeSpec` attribute); the ordering column is `position`; and
the mutually exclusive targets are enforced by `num_nonnulls(...) = 1` the same
way `media_credit` separates `person_id` from `studio_id`.

`main` rows point at the vocabulary through `option_id` rather than storing a
string, matching `media_tag.option_id`. That gives referential integrity and
makes renaming a platform propagate everywhere.

`kind` is `access`, not `watch`, so the same column serves viewing and reading
types. The card picks its heading from the media type — **Where to Watch** for
anime / anime-movie / movie / tv-show / cartoon, **Where to Read** for manga /
novel / comic.

`available` carries the old `source_baha` tristate: `True` available, `False`
not, NULL unknown. `checking.py:229` (sets it `True` when a link is present)
moves across intact. It stays NULL on `reference` rows — a wiki page either has
a URL or it does not — and on `other` / `restricted` rows, which are name + url
only, exactly today's `source_other` shape.

### New table: `system_option_usage`

Mirrors `SystemOptionScope` exactly — same shape, same cascade, and the admin
Options page reuses the scope-picker UI.

| Column | Type |
|---|---|
| `id` | Integer pk |
| `option_id` | FK → `system_option.system_id`, cascade |
| `usage` | String — `watch` \| `origin`. No rows = both |

Needed because `Platform` is one vocabulary serving both the access rows and the
origin tag fields, and some values are origin-only. Cinema is not origin-only (a
film in theatres is watchable there), but Fox, ABC and The CW are, and that set
grows — NBC, CBS, AMC, FX for TV; Nickelodeon, Adult Swim, Cartoon Network for
cartoons. Those must never appear in a watch-source picker.

The alternative — separate `Watch Platform` and `Original Source` categories —
means maintaining "Disney+" in two lists that will drift in spelling.

### Vocabularies

Two `system_option` categories. Per-media-type scoping is free: `SystemOptionScope`
already exists for exactly this, and its docstring calls out replacing the old
`TV Show Official Source` + `Cartoon Official Source` duplication.

**`Platform`** — serves `media_source` access rows, `original_source` and
`exclusive_source`.

| value | usage | scope |
|---|---|---|
| Netflix | both | — |
| Disney+ | both | — |
| Prime Video | both | — |
| Apple TV+ | both | movie, tv-show, cartoon |
| HBO Max | both | movie, tv-show, cartoon |
| Cinema | both | movie, anime-movie |
| Crunchyroll | both | anime, anime-movie |
| Bahamut | both | anime, anime-movie |
| Bilibili | both | anime, anime-movie |
| Fox | origin | tv-show, cartoon |
| ABC | origin | tv-show |
| The CW | origin | tv-show |
| Nickelodeon | origin | cartoon |
| Adult Swim | origin | cartoon |
| Cartoon Network | origin | cartoon |
| Other | origin | cartoon |

`Cartoon Network` is stored as the bare value with `remark` = "now part of
HBO Max". The parenthetical does not go in `value`: `(category, value)` is the
unique key and the string is what every entry points at, so a future rename
would break them all.

`Other` on cartoon is deliberate and is **not** the same as blank — blank means
not recorded, `Other` means recorded as something not in the list.

**`Reference Source`** — serves `media_source` reference rows.

| value | scope |
|---|---|
| Wikipedia | — (every type) |
| Fandom wiki | — (every type) |
| Official site | anime, anime-movie, comic |
| Twitter | anime, anime-movie, manga, novel |
| AniList | anime, anime-movie, manga, novel |
| KeyFrame Staff List | anime, anime-movie |

MyAnimeList / IMDb / Comic Vine are **not** in this vocabulary — they are
column-backed and always rendered.

**`Serialization Platform`** — magazines and web-novel sites, scoped `manga`
and/or `novel` per value. Seeded from the existing free-text
`manga.serialization_platform` values so nothing is lost; duplicates get cleaned
up on the Options page afterwards.

### Tag fields

Three `TagField`s in `app/utils/credit_roles.py`, all scoped via
`SystemOptionScope`, all rendered in the Sources card.

| Field | Vocabulary | Scope | Cardinality | Question it answers |
|---|---|---|---|---|
| `original_source` | `Platform` | movie, tv-show, cartoon | multi | Where did it **first** appear? |
| `exclusive_source` | `Platform` | anime, anime-movie | **single** | Which platform carries it **exclusively**? Blank = not exclusive |
| `serialization_platform` | `Serialization Platform` | manga, novel | multi, optional | Which magazine / site serialised it? |

`original_source` and `exclusive_source` are deliberately two fields, not one.
Fox / ABC / The CW are unambiguously "first aired on" and say nothing about
exclusivity; "exclusive to Netflix" says nothing about being first. One field
would carry a label that lies on five of the eight types.

Cardinality follows from the semantics rather than being an arbitrary split: you
cannot be exclusive to two platforms, but a film can open in cinemas and on
Netflix the same day.

`original_source` replaces today's `source_official` (see Migration).

## Per-type design

Every type gets `other` and `restricted` access buckets. Only the rows below
differ.

The `platform_key` column in these tables is shorthand for the `system_option`
row a `main` row points at through `option_id`; the stored value is the option's
human `value` string (`Disney+`, `Prime Video`), following every other vocabulary
in the codebase.

### Anime / Anime Movie

Columns retained: `mal_id`, `mal_link`.

| kind | bucket | platform_key |
|---|---|---|
| access | main | `baha`, `netflix`, `disney_plus`, `prime`, `bilibili`, `crunchyroll` |
| reference | main | `official`, `twitter`, `anilist`, `wiki`, `fandom`, `keyframe_staff` |

Tag field: `exclusive_source` — Netflix, Disney+, Prime Video, Crunchyroll,
Bilibili. Anime Movie adds Cinema.

`keyframe_staff` is anime and anime-movie only.

### Movie

Columns retained: `imdb_id`, `imdb_link`.

| kind | bucket | platform_key |
|---|---|---|
| access | main | `netflix`, `disney_plus`, `prime`, `hbomax`, `apple_tv` |
| reference | main | `wiki` |

Tag field: `original_source` — Cinema, Netflix, Disney+, Prime Video, HBO Max,
Apple TV+.

### TV Show

Columns retained: `imdb_id`, `imdb_link`.

| kind | bucket | platform_key |
|---|---|---|
| access | main | `netflix`, `disney_plus`, `prime`, `hbomax`, `apple_tv` |
| reference | main | `wiki` |

Tag field: `original_source` — Netflix, Disney+, Prime Video, Apple TV+, HBO Max,
Fox, ABC, The CW.

### Cartoon

Columns retained: `imdb_id`, `imdb_link`.

| kind | bucket | platform_key |
|---|---|---|
| access | main | `netflix`, `disney_plus`, `prime`, `hbomax`, `apple_tv` |
| reference | main | `wiki` |

Tag field: `original_source` — Netflix, Disney+, Prime Video, Apple TV+, HBO Max,
Nickelodeon, Adult Swim, Cartoon Network, Fox, Other.

### Manga

Columns retained: `mal_id`, `mal_link`.

| kind | bucket | platform_key |
|---|---|---|
| access | main | **none** |
| reference | main | `twitter`, `anilist`, `wiki`, `fandom` |

Tag field: `serialization_platform`.

No official site. No named reading platforms — every reading source lives in the
two gated buckets.

### Novel

Columns retained: `mal_id`, `mal_link`.

Identical to Manga. `serialization_platform` is a **new column** on the `novel`
table; it starts empty, with web-novel sites scoped `novel` in the vocabulary.

### Comic

Columns retained: `comicvine_id`, `comicvine_link`.

| kind | bucket | platform_key |
|---|---|---|
| access | main | **none** |
| reference | main | `official`, `wiki`, `fandom` |

No origin field. The five comic tag fields (`comic_publisher`, `comic_imprint`,
`comic_continuity`, `comic_era`, `comic_event`) are credits, not sources, and are
untouched.

## Authorization

Two field groups in `app/services/rbac/field_groups.py`:

| key | label | gates |
|---|---|---|
| `sources_other` | Other Sources | `bucket='other'` rows on every type |
| `sources_restricted` | **Restricted Sources** | `bucket='restricted'` rows on every type |

`sources_other` keeps its key so existing role grants survive; only what it
points at changes, from the `source_other` column to the `other` bucket.

`FieldGroup` currently supports four storage flavours — `columns`, `link_fields`,
`note_sections`, `ui_block`. `media_source` rows are a fifth. Add:

```python
# Buckets in media_source.bucket to filter out of the composed source list.
source_buckets: tuple[str, ...] = ()
```

Gating happens server-side where the rows are attached, alongside the existing
`credit_refs` handling — never in the frontend. `tests/unit/test_field_groups.py`
asserts every declared name still exists and must be extended to cover the new
flavour.

Consequence worth stating: on the reading types the gate does much heavier
lifting. A viewer holding neither group sees a manga's Sources card with
reference links only and **no reading sources at all**, where the same role
would still see Bahamut and Netflix on an anime. That is the intent of the
restricted tier.

## Ordering

`main` rows render in `system_option.sort_order` — set once on the Options page,
consistent site-wide, zero per-entry work. `other` and `restricted` rows render
in insertion order via `media_source.sort_order`, which therefore only ever
carries a value for the two free-form buckets.

This replaces the hardcoded prop order in `SourcesCard.jsx`.

## Google Sheets

`tabs.py` already has the precedent: `Media Relation`, `Plan Next`, `Quote` and
`Note` are FK-less `(media_type, entry_id)` child tables backed up as their own
tabs and restored after every media tab; `System Option Scope` is already a child
tab of `System Options`. Two new tabs slot into `SHEET_TABS` with no new
machinery.

| Position in `SHEET_TABS` | Tab | Why there |
|---|---|---|
| after `System Option Scope` | `System Option Usage` | child of System Options |
| after `Note` | `Media Source` | FK-less pair; both endpoints must exist |

Sheet headers are derived, not declared — `backup.py:33` is
`[c.name for c in tab.model.__table__.columns]` — so the tab's columns follow the
model for free.

**`option_id` is not written to the sheet as a UUID.** `system_option` mints a
different `system_id` in each database, so a raw `option_id` would not survive
the round trip. The tab carries the option's `category` and `value` strings
instead, resolved back through `resolve_option` on Pull — the same treatment
credits and tags already get (`pull.py:835-840`). Entry IDs *are* identical
across databases, so `entry_id` round-trips as a plain UUID.

**Pull identity.** `media_source` mints its own `system_id`, so it needs an entry
in `DERIVED_IDENTITY_KEYS` (`pull.py:88`) or a Pull on the second machine inserts
duplicates instead of matching. The natural key is the unique constraint:
`("media_type", "entry_id", "kind", "bucket", "option_id", "name")`. It does
**not** belong in `DERIVED_IDENTITY_MINTED_PK`.

Note that Pull upserts and never deletes (`pull.py:812-824`). A source deleted on
one machine is not deleted on the other by a Pull. This is pre-existing behaviour
for every table, not something this change introduces.

Removed from the eight media tabs and from `formatter.py`: `source_baha`,
`baha_link`, `source_netflix`, `source_other`, `official_link`, `twitter_link`,
`anilist_link`.

**This is a breaking sheet change.** Backup rewrites every tab, so after
deploying, Backup must run from the machine with the newer data *before* the
other machine pulls. An old sheet pulled into the new schema silently drops every
source. Per `docs/switching-environments.md` this is the "both databases moved"
situation, where there is no merge — the rollout order matters.

## Migration

### Row migration, per type

| Today | Becomes |
|---|---|
| `source_baha` | access row `baha`, `available` |
| `baha_link` | access row `baha`, `url` |
| `source_netflix` | access row `netflix`, `available` |
| `official_link` | reference row `official` |
| `twitter_link` | reference row `twitter` |
| `anilist_link` | reference row `anilist` |
| `source_other` keys matching `twitter` (manga, novel) | reference row `twitter` |
| `source_other`, everything else | access rows, `bucket='other'` |

New and empty at migration time: `netflix.url` on anime (no such column today),
every `restricted` row, and the new platform rows (`disney_plus`, `prime`,
`bilibili`, `crunchyroll`, `hbomax`, `apple_tv`, `wiki`, `fandom`,
`keyframe_staff`).

### `source_official` → `original_source` rename

| File | Change |
|---|---|
| `app/utils/credit_roles.py:107` | `TAG_FIELDS` key + category |
| `app/utils/credit_roles.py:180-181` | `LEGACY_SHEET_COLUMN` entries |
| `app/services/domain/credits.py:405-406` | link-field wiring |
| `app/schemas/link_fields.py:78-90` | three schema classes |
| `app/utils/formatter.py:504,533,565` | sheet parse keys |
| `frontend/src/pages/detail/{TV,Cartoon,Movie}.jsx` | prop rename; **wire up Movie** |
| Alembic | `system_option` rows `category='Official Source'` → `'Platform'`, deduped against existing Platform rows; scopes preserved |
| Alembic | value `Disney` → `Disney+` |

The category name lives in data, not just code, so without the data migration
every existing Options row is orphaned.

**Open at implementation time:** splitting the existing `Official Source` rows
into `usage='origin'` vs both requires eyeballing the real row list. Do not guess
this in the migration script — dump the live values first.

### Cleanups this change absorbs

- Delete the Twitter string-match in `Manga.jsx:394` and its Novel twin.
- Delete the duplicate `serialization_platform` render at `Manga.jsx:630`.
- Render `comicvine_link` on the Comic page.
- Render `original_source` on the Movie page.
- Replace the 8 copy-pasted `source_other` editors in `*AddTab.jsx` with one
  shared component.

### Integration points that are easy to miss

| Place | Why |
|---|---|
| `delete_links_for` (`credits.py:249`, called at `_factory.py:266`) | `media_source` is FK-less, so nothing cascades. Deleting an entry must delete its sources or they orphan. |
| `spec.nested_collections` (`_factory.py:83-96`) | The existing hook for writing child rows from a POST/PATCH payload — `write_novel_units` already uses it. `sources` registers here on all 8 specs; no new write machinery. |
| `attach_link_fields` seam (`_factory.py:79`, `:134`) | `attach_sources` goes beside it, and the viewer is in scope at both. Bucket filtering is *partial* (drop `restricted`, keep `other`), so it happens at attach time — `gate()` needs no change. |
| `SystemOptionResponse` (`app/schemas/system.py:56`) | The whole options table is fetched once and filtered client-side (`lib/sources.js`), so `usages` must be in the response or the client cannot filter on it. |
| `options.py:203-207` | Scope updates are bulk-DELETE-then-INSERT, deliberately (see the comment at `:188-202`). `usages` must copy that exactly or hit the same unique-constraint 500. |

## Testing

Per `CLAUDE.md`, a failing test comes before each behaviour change; `pytest`,
`ruff`, `vitest` and `eslint` must stay green.

| Area | Test |
|---|---|
| Migration | round-trip: seed the old columns, migrate, assert the rows; assert no source is lost |
| RBAC | a viewer without `sources_other` sees no `other` rows; without `sources_restricted` no `restricted` rows; a superuser sees all — asserted on the **response copy**, and that nothing is flushed to disk |
| Vocabulary scoping | a `Platform` value scoped `anime` is absent from movie's picker |
| Usage flag | a value with `usage='origin'` is absent from every access picker |
| Cardinality | `exclusive_source` rejects a second value |
| Sheets | backup → pull round-trip preserves every `media_source` row |
| Field groups | `tests/unit/test_field_groups.py` extended for `source_buckets` |
| Frontend | `SourcesCard` renders access and reference sections; ordering follows vocabulary `sort_order` |

## Docs to update in the same change

`docs/data-model.md`, `docs/options.md`, `docs/authorization.md`,
`docs/entry-types.md`, `docs/data-actions.md`, `docs/frontend/components.md`,
`docs/business-rules.md`, `docs/api.md` — each with its `Last verified` line
bumped.

## Deliberately out of scope

- Any change to the credit vocabularies (`publisher_tw`, the five comic fields).
- Any change to `mal_id` / `imdb_id` / `comicvine_id` handling.
- An admin editor for field groups — `FIELD_GROUPS` is code-defined by design;
  `/roles` grants them.
