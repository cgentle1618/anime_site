# Publisher / Distributor as one entity role — design

Status: awaiting review
Date: 2026-09-07
Branch: modify

## Why

The `publisher` entity shipped on 2026-09-06 alongside the Games work, but it
shipped *beside* the old vocabulary rather than replacing it.
`docs/roadmap.md` records the debt:

> The `publisher_tw` tag rows on anime, manga, novel and comic are still
> `system_option` values in the `Publisher / Distributor TW` vocabulary, not
> `publisher` entities — the entity ships alongside them rather than replacing
> them, so the same distributor can exist twice, once as an option and once as
> a publisher row.

So 木棉花 can be a `system_option` on an anime and a `publisher` row on a game
at the same time, with no link between them. This work collapses that: every
publisher and distributor becomes one entity, credited through one role.

Everything the entity needs on the public side already exists — `/api/publisher`,
`/library/publisher`, `/publisher/:system_id`, the nav-search bucket
(`NavSearch.jsx:28`) and the `/search` Publishers section. They are empty of
anime, manga, novel and comic today only because no credit points at them. This
migration is what fills them; no new page is built.

## Scope

In scope:

1. Widen the `publisher` credit role to six media types, labelled per type —
   **Distributor TW** on anime and anime-movie, **Publisher** elsewhere
   (Decision B).
2. Retire the `publisher_tw` and `comic_publisher` tag fields and their two
   `system_option` categories.
3. Convert every existing tag row into a `publisher` credit, creating the
   entities from a curated name map.
4. Add a `publisher_scope` table so a publisher is offered only on the media
   types it belongs to, mirroring `PersonRole` (Decision F).
5. Move the four entry forms from an option dropdown to the entity picker, and
   the five detail pages onto `PublisherLinks`.
6. Give anime-movie a distributor field it never had.

Out of scope:

- `comic_imprint`, `comic_continuity`, `comic_era` and `comic_event` stay tag
  fields. An imprint is arguably a sub-entity of a publisher, which the flat
  `publisher` table cannot express; that is a separate design.
- No MAL or IGDB enrichment of publisher rows. MAL has no record of a
  Taiwanese distributor, which is why `Publisher` carries no external-id
  columns at all.
- Collapsing a company that legitimately exists as both a studio and a
  publisher (Bandai Namco, Kadokawa) stays two unlinked rows. That is the
  ruling `Studio`'s docstring already records, and nothing here disturbs it.

## Decisions taken

### Decision A — one role, not two

A TW licensor (木棉花) and an original publisher (Marvel) are recorded through
the same `publisher` role, labelled **Publisher / Distributor** everywhere.

The alternative — a separate `distributor_tw` role — was considered and
rejected by the owner: a distributor on an anime is *the same kind of fact* as
a publisher on a novel, namely the company that put the work in front of a
Taiwanese reader. Splitting them would put one company's anime and manga
credits in two vocabularies, the same trap the `studio` role's docstring warns
against for game developers.

The cost is accepted and stated plainly: a comic that has both an original
publisher and a TW licensor shows them in one undifferentiated list, and
`/publisher/:id` cannot say *why* an entry is credited. No data expresses that
distinction today (see Decision C), so nothing is lost by not modelling it.

### Decision B — one role, but never the words "Publisher / Distributor"

**Revised 2026-09-07 by the owner.** An earlier draft of this decision said the
role would read "Publisher / Distributor" on every type. It will not. That
string is the name of the *concept*, useful in this document and in the code;
it is not a label any reader should ever see.

The role is one role (Decision A), but its label varies by media type through
the mechanism that already exists for exactly this — `_LABEL_OVERRIDES` and
`credit_label(role, media_type)` in `app/utils/credit_roles.py`, which is
already what makes one `author` role read 原作 on a manga, Author on a novel
and Writer on a comic:

**Labels set by the owner 2026-09-07.** Every reader-facing label is CJK,
matching the site's other CJK labels (原作, 作畫, 標籤 Label) and replacing
today's inconsistent English mix:

| media type | label | today |
|---|---|---|
| anime | 台灣代理商 | 台灣代理 |
| anime-movie | 台灣代理商 | *(no row)* |
| manga | 台灣出版商 | Publisher TW |
| novel | 台灣出版商 | Publisher (TW) |
| comic | 出版商 | Publisher (TW) |
| game | 發行商 | Publisher |

The distinction the labels draw is real and worth stating: 台灣代理商 and
台灣出版商 both name a **Taiwanese** licensor, while a comic's publisher is
Marvel — the work's *original* publisher, not a TW party — so comic reads
出版商 without the 台灣. Game reads 發行商, the word for a games publisher.

`CreditRole.label` stays **"Publisher"** as the non-reader-facing default, and
`_LABEL_OVERRIDES` carries an entry for all six types. Nothing falls through
to the default in a rendered page; it survives only as the value admin
tooling shows when no media type is in hand.

This is the same shape as Decision A rather than a retreat from it. One role
means one entity, one library page, one search bucket and one credit table; the
label is a reader-facing word, and a word that means "the company that put this
in front of you" is legitimately different for a licensed anime and a published
novel. Nothing in the data model splits.

One label in the table is an **assumption, not an instruction**: the owner gave
台灣代理商, 台灣出版商 and 發行商 explicitly, but said nothing about comic.
出版商 is inferred from the fact that a comic's publisher is Marvel rather than
a TW licensor, so neither TW label fits. Overridable by a one-line change.

The sheet headers are unaffected — `distributor_tw` and `publisher_tw` stay
exactly as they are (see the table under Vocabulary changes). These labels are
reader-facing only.

### Decision F — publishers carry media-type scope, like people

**Added 2026-09-07 by the owner.** A publisher gets an explicit media-type
scope, mirroring `PersonRole` (`app/models/staff.py`).

The reason is the one `PersonRole`'s docstring already gives: scope cannot be
derived from credits, because a distributor added today must appear in the
anime picker *before* its first credit exists. Without it, every one of the 31
migrated rows would be offered on every one of the six types — a games
publisher suggested as an anime distributor, and 木棉花 suggested on a game.

Where the shape differs from `PersonRole`: that table keys on
`(person_id, role, scope)` because a person holds several roles. A publisher
holds exactly one, so the table keys on `(publisher_id, scope)` and carries no
`role` column. Adding one "for symmetry" would encode a column whose value is
the constant `'publisher'` on every row.

Everything else is inherited deliberately, including the two rules
`PersonRole`'s docstring argues for:

- **No unscoped "offered everywhere" state.** Zero rows means offered nowhere,
  not everywhere. This is the opposite of `system_option_scope`, and it is what
  makes the next rule safe.
- **Auto-scoping on write is additive.** Crediting a publisher on a manga adds
  the `manga` scope row if absent, and never removes another. Under an
  "everywhere" rule the first scope row would silently *narrow* the publisher —
  the trap Ruling R27 removed from tags.

The migration seeds scope from the data it converts: a publisher gets exactly
the scopes of the entries it is credited on. So the 30 TW distributors come out
scoped to whichever of anime/manga/novel they actually appear on, Marvel Comics
to `comic`, and the two existing game publishers to `game`. Nothing is offered
anywhere it was not already used.

### Decision C — comic `publisher_tw` is discarded, not migrated

Comic is the only type carrying both vocabularies, so a merge rule seemed
necessary. It is not: measured against the dev database on 2026-09-07, comic
has **0** `publisher_tw` rows. The column was defined and never used.

The `publisher_tw` header therefore leaves the Comic tab entirely rather than
being merged into `publisher`. The backfill still asserts the count is zero and
**reports and skips** any row it finds, rather than silently dropping it — a
restore from an older sheet is the one way such a row could appear.

### Decision D — entities come from a curated name map

A `Publisher` has four nullable name columns, and the 31 values are mixed:
pure Latin (`Aniplex`), pure CJK (`尖端`), and Latin+CJK in one string
(`Muse木棉花`, `曼迪 Mightymedia`). The existing `name_slot_for` rule puts
anything containing CJK wholly into one column, which would leave ~5 rows
displaying as a mashed string.

An automatic split at the script boundary was rejected: it guesses, and it
guesses wrong on `bilibili (GoodShow)` (all Latin, nothing to split) and
arguably on `羚邦 Ani-One`. `app/utils/name_normalize.py` states the rule this
codebase follows — *"Nothing is guessed"* — and `name_slot_for` never returns
`alt` for the same reason.

So the map below is data, written once and reviewed by a human. Values absent
from it fall back to `name_slot_for`.

### Decision E — a split row keeps its old spelling in `name_alt`

Splitting `Muse木棉花` into two columns changes what the sheet says. The anime
tab's `distributor_tw` column is written from the credit's **display name**, so
after the next Backup it reads `木棉花` where it used to read `Muse木棉花`.

That is fine going forward, and dangerous going backward: the sheet as it
stands *today* still holds `Muse木棉花`, and a Pull All from it would ask
`find_publisher` for a string that matches none of the four name columns — and
mint a second entity beside the one this migration just made. The same trap
waits in any older sheet version, and in the other machine's copy until it is
re-backed-up.

So the four split rows keep the original option string verbatim in `name_alt`.
`find_publisher` matches on any of the four names (`Publisher._name_fields`),
so both the old spelling and the new one resolve to the one row. `name_alt`
means "a name that is none of the other three" — which is exactly what a
historical mashed spelling is, and asserting it is a human's call, which is
why the map and not `name_slot_for` supplies it.

**As finalised by the owner, this holds for two of the four split rows, not
all four.** `Muse木棉花` keeps its pre-migration spelling in `name_cn` and
`羚邦 Ani-One` carries `羚邦` in `name_alt`, so both still resolve. But
`Proware普威爾` and `曼迪 Mightymedia` keep their mashed spelling in no column,
so a Pull from a sheet backed up **before** this migration mints a second row
for those two.

The mitigation is procedural rather than structural: run Backup immediately
after the migration, so no stale sheet is ever the newest version. That is
already the rule in `docs/switching-environments.md` — this just makes it
load-bearing for two rows. If a duplicate does appear, the fix is the merge
endpoint, which repoints the credits before deleting the loser.

## The name map

31 rows: the 30 `Publisher / Distributor TW` values plus the single
`Comic Publisher` value. `display_name_field` is set explicitly, because the
default fallback chain starts at EN and would otherwise display a TW
distributor by its Latin half.

`name_alt` is filled **only** on the four rows the map splits, and it holds the
original option string verbatim. That is not decoration — see Decision E.

| Option value | name_en | name_cn | name_alt | display |
|---|---|---|---|---|
| `Aniplex` | Aniplex | — | — | en |
| `ANIPLUS` | ANIPLUS | — | — | en |
| `bilibili` | bilibili | — | — | en |
| `bilibili (GoodShow)` | bilibili (GoodShow) | — | — | en |
| `Crunchyroll` | Crunchyroll | — | — | en |
| `Disney` | Disney | — | — | en |
| `Muse木棉花` | Muse | Muse木棉花 |  | cn |
| `NETFLIX` | NETFLIX | — | — | en |
| `Proware普威爾` | Proware | 普威爾 |  | cn |
| `三貝多` | — | 三貝多 | — | cn |
| `六六喜喜` | — | 六六喜喜 | — | cn |
| `台灣角川` | — | 台灣角川 | — | cn |
| `回歸線娛樂` | — | 回歸線娛樂 | — | cn |
| `天光` | — | 天光 | — | cn |
| `奇幻基地` | — | 奇幻基地 | — | cn |
| `尖端` | — | 尖端 | — | cn |
| `提恩傳媒` | — | 提恩傳媒 | — | cn |
| `曼迪 Mightymedia` | Mightymedia | 曼迪 |  | cn |
| `杰外` | — | 杰外 | — | cn |
| `東方出版社` | — | 東方出版社 | — | cn |
| `東映` | — | 東映 | — | cn |
| `東立` | — | 東立 | — | cn |
| `東販` | — | 東販 | — | cn |
| `皇冠文化` | — | 皇冠文化 | — | cn |
| `羚邦 Ani-One` | Ani-One | 羚邦 | 羚邦 | cn |
| `角川` | — | 角川 | — | cn |
| `車庫娛樂` | — | 車庫娛樂 | — | cn |
| `遠流` | — | 遠流 | — | cn |
| `青文` | — | 青文 | — | cn |
| `飛燕文創` | — | 飛燕文創 | — | cn |
| `Marvel Comics` | Marvel Comics | — | — | en |

Three rows for the reviewer to confirm before the migration runs:

- **`東映`** is Toei, a Japanese company recorded here in kanji. It is placed in
  `name_cn` to match the TW-facing vocabulary it came from, not `name_jp`. No
  `name_en` is invented for it.
- **`角川`** and **`台灣角川`** are separate rows, as they are separate option
  values today. They are Kadokawa and its Taiwanese arm; merging them is a
  judgement the migration will not make on its own.
- **`bilibili`** and **`bilibili (GoodShow)`** likewise stay two rows.

### Decision G — three values have no data behind them

**Added 2026-09-07, after the dry run.** Three of the 31 vocabulary values are
defined options that **no entry is tagged with**: `bilibili`, `Crunchyroll` and
`bilibili (GoodShow)`. The backfill converts data, not vocabulary, so it
creates no entity for a value with zero tag rows — the dry run produced 30
entities, not 33.

The owner's call: **seed `bilibili` and `Crunchyroll`; drop
`bilibili (GoodShow)`.** Final count 32.

The two seeded rows get no credits, and therefore would get no scope rows —
which under Decision F's rule means "offered nowhere", making them invisible in
every picker and defeating the point of seeding them. So they are seeded with
the `anime` scope: both are anime streaming distributors, and anime is the only
media type either has ever plausibly applied to in this collection. **This is
an inference, not an instruction** — and it is cheap to correct, because the
scope pills added in Task 7 let an admin change it in the UI.

Neither existing publisher entity (`FromSoftware`, `Bandai Namco
Entertainment`) collides with any of the 31, so every value with data behind it
is created. The
backfill still routes every value through `find_publisher` first, so a rerun
after a restore reuses rather than duplicates.

## Vocabulary changes

`app/utils/credit_roles.py`:

```python
"publisher": CreditRole(
    "publisher", "Publisher", "publisher",
    ("anime", "anime-movie", "manga", "novel", "comic", "game"),
),
```

and, per Decision B, an override for every one of the six types — no rendered
page falls through to the default:

```python
_LABEL_OVERRIDES = {
    ...
    ("publisher", "anime"): "台灣代理商",
    ("publisher", "anime-movie"): "台灣代理商",
    ("publisher", "manga"): "台灣出版商",
    ("publisher", "novel"): "台灣出版商",
    ("publisher", "comic"): "出版商",
    ("publisher", "game"): "發行商",
}
```

`TAG_FIELDS["publisher_tw"]` and `TAG_FIELDS["comic_publisher"]` are deleted.
`OPTION_CATEGORIES` derives from `TAG_FIELDS`, so both categories disappear
from it without a second edit.

`LEGACY_SHEET_COLUMN` — every tab keeps the header it has today; only what sits
behind the header changes, which is exactly what `sheet_column_for` exists for:

| pair | header |
|---|---|
| `("anime", "publisher")` | `distributor_tw` |
| `("anime-movie", "publisher")` | `distributor_tw` *(new column on that tab)* |
| `("manga", "publisher")` | `publisher_tw` |
| `("novel", "publisher")` | `publisher_tw` |
| `("comic", "publisher")` | `publisher` |
| `("game", "publisher")` | `publisher` *(unchanged)* |

The `("comic", "publisher_tw")` and `("comic", "comic_publisher")` entries are
removed, and the `publisher_tw` header leaves the Comic tab.

## Schema — `publisher_scope`

Modelled on `PersonRole` (`app/models/staff.py:131-169`) and its migration
`p1e2r3s4o5n6_add_person_and_studio.py:40-53`, minus the `role` column per
Decision F:

```python
class PublisherScope(Base):
    __tablename__ = "publisher_scope"
    __table_args__ = (
        UniqueConstraint("publisher_id", "scope", name="uq_publisher_scope"),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    publisher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("publisher.system_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # A hyphenated media-type key, one of legal_scopes("publisher").
    scope = Column(String, nullable=False)
```

A plain `UniqueConstraint`, not `NULLS NOT DISTINCT`: `scope` is NOT NULL, so
no nullable column is left in the key for Postgres to treat as distinct from
itself. This is the same reasoning `uq_person_role` carries at
`app/models/staff.py:154`, and the reason it needed the opposite treatment
before `r0l1c2o3l4p5_collapse_person_roles.py:147` made scope NOT NULL.

`Publisher.scopes` gets the relationship `Person.roles` has
(`staff.py:87-92`): `cascade="all, delete-orphan", passive_deletes=True`.

## Backend — scope plumbing

Each item mirrors a `person` counterpart, named here so the plan can point at
a working example rather than re-derive one.

| Concern | Person today | Publisher after |
|---|---|---|
| Response shape | `PersonResponse.roles: List[PersonRoleIn]` (`schemas/staff.py:130`) | `PublisherResponse.scopes: List[str]` — no `role` to pair, so a bare list |
| Validation | `PersonRoleIn._scope_is_legal_for_role` (`schemas/staff.py:46-59`) | a validator against `legal_scopes("publisher")` |
| List filter | `GET /api/person/?role=&scope=` (`routers/person.py:86-113`) | `GET /api/publisher/?scope=` |
| Legal values | `GET /api/person/role-scopes` (`routers/person.py:142-160`) | not needed — one role, so `legal_scopes("publisher")` is a constant the frontend can hold |
| Create | additive insert (`routers/person.py:375-384`) | same |
| Update | full replace (`routers/person.py:409-421`) | same |
| Merge | unions both sides' rows (`routers/person.py:511-518`) | same — a merge must not narrow the survivor |
| Auto-scope on write | `resolve_person(..., role=, scope=)` (`credits.py:119-138`), called from `replace_credits:226` | `resolve_publisher` gains a `scope` param and the same additive insert; it is reached through the `_RESOLVERS` / `_TARGET_COLUMNS` dispatch at `credits.py:199-208` |

Two comments become false and are corrected in the same change: the
"Shaped after Studio" line in `Publisher`'s docstring (`staff.py:284`) and
`frontend/src/lib/sources.js:3-4,28`, which currently states that neither
studios nor publishers have a role/scope concept.

`Studio` stays unscoped. That is deliberate and unchanged — this design gives
scope to publishers because a distributor list that offers 木棉花 on a game is
wrong in a way a studio list is not.

## Migration

A `backfill_publishers(db)` in `app/services/domain/credits.py`, beside the
existing `backfill_credits`, invoked from an Alembic revision. It lives in the
service rather than inside the revision for the reason the existing backfill
states: it can then be tested with the normal fixtures and re-run by hand when
a restore brings old data back.

Order matters — the `system_option` delete cascades to `media_tag`:

1. Resolve each of the 31 values through `find_publisher`; create from the map
   on a miss.
2. Every `media_tag` row with `field IN ('publisher_tw', 'comic_publisher')`
   becomes a `media_credit` with `role='publisher'`, carrying `position`
   across so a comma-joined order survives.
3. Seed `publisher_scope` from the credits just written: one row per distinct
   media type each publisher is credited on (Decision F). The two pre-existing
   game publishers get their `game` scope seeded here too, since they have
   credits but no scope rows today.
4. Delete those `media_tag` rows.
5. Delete the `system_option` rows in the two retired categories.

Idempotent: `replace_credits` is a whole-set replace, so a second run rewrites
the same rows. Precedent for retiring a category:
`alembic/versions/o1r2p3h4a5n6_retire_orphan_option_categories.py`.

Expected volume, measured 2026-09-07: 333 anime + 37 manga + 51 novel
`publisher_tw` rows and 99 `comic_publisher` rows become 520 credits across 31
entities.

Nothing is guessed. A value that is empty after trimming, or that normalises to
an empty key, is reported with its owner id and original column — the same
`unplaced` contract `backfill_credits` already returns.

## Backend

`app/schemas/link_fields.py` — `publisher_refs: list[PublisherRef]` joins
`studio_refs` on `AnimeLinkFields`, `AnimeMovieLinkFields`,
`MangaLinkFields`, `NovelLinkFields` and `ComicLinkFields`. The flat string
stays beside it, mirroring how `studio` and `studio_refs` already coexist:
the string is what the sheet reads, the refs are what the page reads.
`AnimeMovieLinkFields` gains `distributor_tw`; `ComicLinkFields` loses
`publisher_tw`.

`app/services/domain/autofill.py:575` — Comic Vine's publisher stops writing a
`comic_publisher` tag and calls `resolve_publisher` instead.

`app/services/domain/checking.py:241` and `app/utils/utils.py:142` name
`publisher_tw` in their "manual classification, do not overwrite from Comic
Vine" exclusion lists; both move to the credit role's key.

The `Publisher` Sheets tab already restores before every media tab, so Pull
needs no reordering.

## Frontend

The four entry forms swap the option dropdown for the entity picker they
already use for Studio — `ensureSourceValues` POSTs a typed-in name to
`/api/publisher`, whose find-or-create `POST` exists for exactly this.
Touched: `config/formFields/fieldMeta.js` (lines 325, 530, 613, 704, 715),
`config/formFactories.js` (205, 248, 286), `lib/payloads.js`,
`config/fieldOptions.js` (273-274), `lib/optionsPageGroups.js` (109, 122),
and the `Anime`, `Manga`, `Novel` and `Comic` add/modify tabs.

`frontend/src/lib/sources.js` moves publishers off the flat-list branch
(lines 33-34, 46-47) onto a per-scope fetch, the way `PERSON_SOURCES` fans out
by `{role, scope}` at lines 30-55. Simpler than the person case: one role, so
the key is the media type alone. The Publisher Add/Modify tabs gain a scope
selector — the `PersonRoleMatrix` shape (`PersonAddTab.jsx:49-121`) reduced to
a single row of media-type pills, since there is no role axis to cross it with.

The five detail pages move onto the entity-ref path Game already uses. Three
corrections to what an earlier draft of this section assumed, all found by
reading the code:

- **`PublisherLinks.jsx` is dead code.** Nothing imports it. The live path is
  `publisherValue`, exported from `StudioLinks.jsx:45-49`, which renders
  `<StudioLinks refs={refs} base="/publisher" />`. `Game.jsx` imports it from
  there. This change deletes `PublisherLinks.jsx` rather than adopting it —
  adding a second label mechanism to a duplicate component is how the two
  drift apart.
- **`PublisherRef` carries no `label` field.** Only `PersonRef` has one
  (`schemas/link_fields.py:54-64`), populated from `credit_label` at
  `credits.py:844`. `StudioRef` and `PublisherRef` are `system_id` +
  `display_name` only (`link_fields.py:40-51`), and `Game.jsx:535` therefore
  hard-codes the word "Publisher". Decision B needs the label to travel, so
  `PublisherRef` gains `label: str`, populated at `credits.py:876-879` exactly
  as `PersonRef`'s is.
- **The current labels are already inconsistent**, which is why hard-coding a
  sixth variant is not an option: `Anime.jsx:462` reads 台灣代理,
  `Manga.jsx:747` "Publisher TW", `Novel.jsx:614` and `Comic.jsx:450`
  "Publisher (TW)", `Game.jsx:535` "Publisher". After this change all five read
  `refs[0].label` with a literal fallback, the way
  `creditLabel(item, role, fallback)` (`PersonLinks.jsx:57-59`) already works
  for Director and Composer — so `_LABEL_OVERRIDES` alone governs every page.

`AnimeMovie.jsx` has no publisher row at all today and gains one.
`wants_publisher_refs` at `credits.py:864-866` is already derived from
`credit_roles_for(media_type)`, so widening the role's `media_types` switches
the refs on for all six types with no edit there. (`wants_studio_refs` beside
it is hard-coded to the anime pair; untouched.)

`/library/publisher`, the nav search bar and the `/search` Publishers section
then fill up with no work at all.

**To confirm during implementation:** any list-page filter keyed on the
`Publisher / Distributor TW` vocabulary must start reading credits rather than
tags. `fieldOptions.js:273` suggests one exists on the anime library.

## Testing

Failing test first, per the project rule. `pytest`, `ruff`, `vitest` and
`eslint` all stay green.

- The vocabulary: `publisher` covers six media types, and neither retired tag
  field is in `TAG_FIELD_KEYS` or `OPTION_CATEGORIES`.
- Decision B's labels: `credit_label("publisher", mt)` returns "Distributor TW"
  for anime and anime-movie and "Publisher" for the other four, and the string
  "Publisher / Distributor" appears in no reader-facing output.
- Decision F's scope: zero scope rows means offered nowhere; crediting a
  publisher on a new media type adds that scope row and removes none; the
  picker on each of the six types offers only in-scope publishers; and the
  migration seeds each publisher exactly the scopes its credits imply.
- The backfill against fixtures: tag rows become credits, `position` survives,
  entities are reused not duplicated on a rerun, and a value absent from the
  map falls back to `name_slot_for`.
- Decision C's guard: a comic `publisher_tw` row is reported and skipped, never
  dropped.
- Decision E's guard: `find_publisher("Muse木棉花")` returns the migrated row,
  so a Pull from a pre-migration sheet resolves instead of minting a duplicate.
  Run for all four split rows.
- `sheet_column_for` returns the right header for all six pairs, and the Comic
  tab no longer emits `publisher_tw`.
- The RBAC field gate after the tag-to-credit move.
- vitest: the picker swap on the four forms, the scope pills on the Publisher
  Add/Modify tabs, `publisherValue` rendering a linked ref on all five detail
  pages under the label the backend supplies, and the existing
  `noLegacySourceFields` guard.

Backend scope tests port directly from `tests/api/test_person_router.py`:
`test_list_filters_by_role_and_scope:20`,
`test_a_scope_illegal_for_the_role_is_rejected:184`,
`test_a_scopeless_role_is_rejected:212` and `test_merge_unions_the_roles:143`
all have a publisher counterpart.

## Documentation

Updated in the same change, each with its `Last verified` line bumped:
`docs/data-model.md` (a `publisher_scope` section beside `person_role`'s at
lines 657-679, and the `publisher` table section at 685+ which currently
records the no-scope ruling), `docs/systems/credits-and-tags.md` (the entity
table at line 29, `resolve_*` at 195-199, the `/api/publisher` endpoint table,
and the admin-UI description at 296-297), `docs/options.md`,
`docs/entry-types.md`, `docs/data-actions.md`, `docs/business-rules.md`,
`docs/api.md`, `docs/frontend/pages.md`. `docs/roadmap.md` line 91's known-debt entry is
removed and the work recorded as shipped; `docs/PROGRESS.md` loses its
"Migrate `publisher_tw` tag rows into the publisher entity" open item.

`app/models/staff.py` carries two stale docstrings that this work falsifies:
`Studio`'s ("that vocabulary still backs publisher_tw on anime, manga, novel
and comic until a later migration converts those rows") and the same claim in
`credit_roles.py`'s module docstring. Both are corrected here — this *is* the
later migration.

## Risks

- **Sheet round-trip.** The headers are unchanged, but what writes them moves
  from `media_tag` to `media_credit`. A Backup → Pull All cycle on a scratch
  database is the check, before the migration touches the real one.
- **Entity duplication on restore.** Pull creates a publisher it cannot find by
  name, so a split row must still answer to its pre-migration spelling.
  Decision E covers this by keeping that spelling in `name_alt`; the test that
  a Pull of the string `Muse木棉花` resolves to the existing row rather than
  minting a second one is the explicit guard, and it is the single most
  important test in this change.
- **The other machine's sheet.** Per `docs/switching-environments.md` the sheet
  holds exactly one version of the data. This migration must run on the machine
  with the newer data, followed by a Backup, before the other machine pulls.
  Decision E means a stale pull degrades to a no-op rather than to duplicates,
  but the ordering rule still applies.
- **The one-role merge is one-way.** Once a comic's Marvel and TW credits sit
  in one role, no column records which was which. Accepted under Decision A,
  and cost-free today under Decision C.
