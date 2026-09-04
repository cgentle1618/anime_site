# Studio as a public entity — design

Status: approved for planning
Date: 2026-09-04
Branch: modify

## Why

`studio` already exists as a real table with real credits behind it
(`app/models/staff.py:111`, `app/models/media_credit.py`), but nothing public
reads it. `docs/roadmap.md` records the gap under "Deferred / known debt":

> Public person and studio pages deferred; only admin and pickers read the
> routers — no route in `frontend/src/App.jsx`

This work closes that gap for studios, and reshapes the studio table's naming
while we are in there. Person (director and the other credited roles) follows
later and reuses whatever genuinely repeats; nothing here is abstracted ahead
of that second case.

## Scope

In scope:

1. Reshape `studio`: four nullable name fields with an "at least one" CHECK, a
   per-row display-name choice, and six new profile columns.
2. A reverse lookup — the entries credited to a studio — with RBAC applied.
3. Public studio library page and studio detail page.
4. Links to a studio from the anime and anime-movie detail pages.
5. A new "Entity" admin group with full Add / Modify / Delete for studios.

Out of scope, deliberately:

- Person pages and the person half of the Entity group. A later change.
- Fill/Pull enrichment of studios. `mal_id` / `mal_link` columns are added so
  the door is open, but no pipeline work is done.
- Splitting the five existing studio names that carry an embedded CJK name
  (see "Backfill"). Manual data cleanup, not migration logic.
- A country vocabulary in `system_option`. See "Decision B".

## Decisions taken

### Decision A — four plain nullable name columns

`name_native` (NOT NULL) is replaced by `name_en`, `name_cn`, `name_jp`,
`name_alt`, all nullable, with a CHECK that at least one is set.

Rejected: keeping `name_native` as a derived cache of the display name. It
would leave the unique constraint and resolver untouched, but the migration
and Fill/Pull both write around the API, so the cache would go stale exactly
where it matters.

Rejected: a `studio_name` alias table. The most honest model — it is what
`_find_by_name` already pretends is true — but it diverges from every other
name-bearing table in the repo and complicates every form, for four fields.

Chosen because it is the shape the media tables already use
(`anime_name_en/cn/roman/jp/alt`), so `person` inherits a familiar pattern.

### Decision B — `country` is a plain String column

Nothing in the repo has a country vocabulary today. `system_option` is
documented as holding "values no code branches on", which country qualifies
as, but `media_tag` keys on `(media_type, entry_id)` and a studio is not a
media entry — backing country with options would need a new link table or a
direct FK. More machinery than the field warrants now. A plain column can be
promoted later without breaking readers.

### Decision C — display name is chosen per studio row

`display_name_field` holds `'en' | 'cn' | 'jp' | 'alt'`, or NULL.

Resolution order: the chosen field; then, if it is NULL or that field is
empty, `en -> cn -> jp -> alt`; then `""`.

This is new behaviour for the repo. Every existing display name is a
hard-coded chain (`Anime.display_name` does CN -> EN -> Alt -> roman -> JP;
`Comic` leads with EN; `naming.js:getDisplayName` mirrors both). Studio is the
first entity where the choice is data, not code.

## Schema

```
studio
  system_id           UUID PK
  name_en             String, null, indexed
  name_cn             String, null
  name_jp             String, null
  name_alt            String, null
  display_name_field  String, null      -- 'en'|'cn'|'jp'|'alt'; NULL -> fallback
  my_rating           String, null      -- unchanged, one of constants.MY_RATINGS
  logo_file           String, null      -- unchanged, GCS key
  remark              Text, null        -- unchanged
  founded_date        String, null      -- truncated ISO-8601
  defunct_date        String, null      -- truncated ISO-8601
  country             String, null
  website_url         String, null
  mal_id              Integer, null
  mal_link            String, null
  created_at / updated_at               -- unchanged

  CHECK  num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1
  UNIQUE (name_en, name_cn, name_jp, name_alt) NULLS NOT DISTINCT
  CHECK  founded_date matches the truncated ISO-8601 pattern
  CHECK  defunct_date matches the truncated ISO-8601 pattern
```

`NULLS NOT DISTINCT` is required, not decorative: three of the four name
columns are NULL on a typical row, and Postgres treats two NULLs as distinct
by default, so the plain constraint would be inert. This is the same lesson
`uq_person_name` and `uq_media_credit_row` already carry in their comments.

`founded_date` / `defunct_date` reuse `app/utils/release_date.py`, the single
owner of the truncated ISO-8601 format, so partial precision, lexicographic
ordering and Sheets round-tripping come for free. The CHECK mirrors
`RELEASE_DATE_PATTERN`, as every release column's does.

`mal_id` / `mal_link` match the convention at `app/models/anime.py:87-88`.

## Migration

One Alembic revision, single head.

Upgrade:

1. Add every new column, nullable, no constraints.
2. `UPDATE studio SET name_en = name_native`.
3. Drop `uq_studio_name`, drop `name_native`.
4. Add the 4-column UNIQUE, the `num_nonnulls` CHECK and the two date CHECKs.

Downgrade: add `name_native` nullable, backfill it with
`COALESCE(name_en, name_cn, name_jp, name_alt)`, set NOT NULL, restore
`uq_studio_name`, drop the new columns and constraints.

### Backfill

Verified against the local `anime_site` database on 2026-09-04: 77 studio rows
(the `name_native` comment in `staff.py` says 74 and is stale). 72 are pure
Latin/romanised — `A-1 Pictures`, `CloverWorks`, `BONES`, `Brain's Base`. The
other five carry an embedded CJK name:

    Doga Kobo (動畫工房)         Shin-Ei Animation (新銳動畫)
    Studio Gokumi (Studio五組)   Gekkou 月虹
    Shuka 朱夏

`name_native -> name_en` is therefore correct and lossless for all 77. The
five composite names stay intact in `name_en`; splitting them into
`name_en` + `name_cn` is an admin task once the Modify tab exists, not
migration logic. `name_en` is NULL on every existing row today, so nothing is
overwritten.

## Backend

### Model

`Studio` gains `NameFallbackMixin` (`app/models/base.py`), a `names_dict`
property and a `display_name` property implementing Decision C. This matches
every media model, so nothing new has to be learned to read it.

### The resolver — the load-bearing change

`_find_by_name` (`app/services/domain/credits.py:34`) currently compares
`normalize_name` against `name_native` and `name_en`. It extends to all four
name fields. This function is how a studio name arriving from Tenrai lands on
the same row as one typed into the Add form; the data migration, the credits
API, Fill/Pull and the Sheets restore all resolve through it.

Two more call sites break on the dropped column and must move to the new
fields in the same change:

- `resolve_studio` constructs `models.Studio(name_native=name.strip())`
  (`credits.py:86`) -> `name_en=`.
- `credit_names` returns `entity.name_native` for both Person and Studio
  (`credits.py:242`) -> `display_name` for a Studio, `name_native` still for a
  Person.

`credit_names` is not internal: it feeds the comma-joined `studio` string on
every anime response, the admin forms via `creditsResponseToForm`, and the
Google Sheets backup columns. Because the extended `_find_by_name` scans all
four fields, a display name written to Sheets still resolves back to the same
row on restore, whichever field it came from. A test asserts that round trip.

### Schemas

`StudioBase` gains the new fields; `name_native: str` becomes the four
optionals plus a model validator enforcing "at least one is set", so the API
answers 422 rather than surfacing a 500 from the CHECK. `StudioResponse`
gains `display_name` so no client re-implements Decision C.

### New endpoint — `GET /api/studio/{system_id}/entries`

The reverse lookup does not exist today; `GET /api/credits/{media_type}/{entry_id}`
only goes entry -> credits.

Reads `media_credit` where `studio_id` matches, passes the
`(media_type, entry_id)` pairs through `filter_visible_pairs`
(`app/services/rbac/enforcement.py:97`) in one batched query — the same call
`_to_response` already makes for `credit_count` — resolves the survivors
through `MEDIA_TABLES` for the model, label and `nav_path`, and returns them
grouped by media type with `display_name`, cover file and release date.

RBAC is correct by construction: a hidden entry is absent, exactly as
`credit_count` already treats it. A studio the viewer may see whose every
credit is hidden returns empty groups, not a 404 — the studio itself carries
no content label.

### `studio_refs`

`attach_link_fields` gains `studio_refs: [{system_id, display_name}]` on the
anime and anime-movie responses. The existing `studio` key stays exactly as
it is — it is the legacy column name and the Sheets contract.

This is what makes the link possible at all: today's `studio` value is
comma-joined names with no ids. `attach_link_fields` already batches over a
whole list (`app/routers/_factory.py:114`), so this adds no N+1.

## Frontend

### Pages

- `/library/studio` -> `pages/library/StudioLibrary.jsx`. Follows the
  `CollectionLibrary` / `FranchiseLibrary` precedent: those already sit at
  `/library/collection` and `/library/franchise` as standalone components,
  outside the `LIBRARY_CONFIGS` media-type machinery, because they are not
  media types. Neither is a studio. Grid of cards with logo, display name and
  credit count; search across all four name fields; sort by name, credit count
  or rating.
- `/studio/:system_id` -> `pages/detail/Studio.jsx`. Logo, display name with
  the other three names listed beneath (as `getNamingFields` renders them
  today), rating, country, founded–defunct, website, MAL link, remark, then
  the credited entries from the new endpoint, grouped by media type, as
  `MediaCard`s.
- Both lazy-loaded in `App.jsx`, matching the route-level code splitting
  already applied to the other non-index pages.

### Links and nav

- `pages/detail/Anime.jsx:406` renders `{ label: "Studio", value: anime.studio }`
  as flat text. It becomes linked chips driven by `studio_refs`. Same change in
  `AnimeMovie.jsx`.
- A Studio entry in the Nav catalog drawer, alongside the franchise and
  collection libraries.
- One `displayStudioName()` in `frontend/src/lib/naming.js` mirroring the
  backend property — the same division of labour as `Anime.display_name` and
  `getDisplayName` today.

### Admin — a new Entity group

`frontend/src/config/adminTabs.js` renders a two-level bar: pick a group, then
a tab within it. It gains a third group.

- `TAB_GROUPS` gains `{ key: "entity", icon: "fa-industry", label: "Entity" }`,
  parallel to Entries and Structure. Person joins this group later — that is
  why it is a group and not one more tab.
- `ADMIN_TABS` gains `{ key: "studio", group: "entity", label: "Studio" }`,
  excluded from `FORM_TABS` like `options` / `quote` / `meme`, since a studio
  is not a media entry and has no default field values.
- Add, Modify and Delete each get a studio branch covering all four names,
  `display_name_field`, rating, logo, country, founded/defunct (via the
  existing `ReleaseDateInput`), website, MAL and remark.
- The Delete tab warns that `media_credit.studio_id` is `ON DELETE CASCADE`,
  so deleting destroys credit history, and points at the existing
  `POST /api/studio/{id}/merge` as the correct fix for a duplicate.

The studio editor already exists in an odd place: `OPTION_SUB_TABS` in
`components/forms/OptionSubTabBar.jsx` puts "Studios" under System Option on
the Add page (`Add.jsx:1025-1049`). It **moves** into the Entity group;
leaving it would mean two ways to create a studio. "People" stays where it is
until the person work lands and follows it.

## Testing

Failing test first, per `CLAUDE.md`. `pytest`, `ruff`, `vitest` and `eslint`
all stay green.

Backend:

- The CHECK rejects a studio with all four names NULL; the API returns 422 for
  the same payload.
- `display_name` honours `display_name_field`; falls back when the chosen
  field is empty; falls back en -> cn -> jp -> alt when it is NULL.
- `_find_by_name` matches a name stored in `name_jp` and in `name_alt`, not
  only `name_en`.
- `credit_names` returns a studio's display name, and that name resolves back
  to the same row through `resolve_studio` — the Sheets round trip.
- `GET /{id}/entries` hides a content-labelled entry from a restricted viewer
  and shows it to a superuser; a studio whose every credit is hidden returns
  empty groups rather than 404.
- Migration upgrade and downgrade round-trip the existing rows.

Frontend:

- `StudioLibrary` search matches on each of the four name fields; sorts hold.
- `displayStudioName` agrees with the backend rules, including the fallbacks.
- The anime detail page renders a studio link from `studio_refs`.

## Documentation

Updated in the same change, each with its `Last verified` line bumped:

- `docs/data-model.md` — the reshaped table and its constraints.
- `docs/api.md` — the new endpoint and the changed studio payloads.
- `docs/frontend/pages.md` and `docs/frontend/admin-pages.md` — the two public
  pages and the Entity group.
- `docs/business-rules.md` — display-name resolution as data rather than code.
- `docs/roadmap.md` — the studio half moves off "Deferred / known debt" into
  "Done"; the line is rewritten to cover person only.

## Risks

- **The resolver is the sharp edge.** `_find_by_name` is reached by four
  writers, only one of which is the API. A miss creates a duplicate studio row
  and splits its credits silently. The test that a name round-trips through
  Sheets is the guard.
- **Concurrent sessions.** Per `CLAUDE.md`, other Claude Code sessions may be
  editing this branch. `Add.jsx` is large and shared; stage specific hunks and
  re-read before committing.
- **`credit_names` has three consumers.** Changing what it returns for a
  studio changes the anime payload, the admin form and the Sheets column at
  once. All three are covered above; none should change shape, only source.
