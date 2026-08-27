# Media Relations — Design

Date: 2026-08-23
Status: Approved (design); not yet planned or implemented

## Problem

Relations between media entries are stored today as fixed per-entry columns:

| field | where | shape |
| --- | --- | --- |
| `prequel_id` / `sequel_id` | anime, cartoon, manga, movie, novel, tv_show | single nullable UUID, no FK, no type discriminator |
| `alternative` | anime, novel only | String, comma-joined `[id1], [id2]` |
| `derive_related` | anime, cartoon, manga, movie, tv_show (not novel) | Boolean opt-out for derivation |

This cannot express what the collection actually contains:

1. **No cross-media-type links.** A bare UUID carries no table discriminator, so a
   prequel is implicitly same-table. An anime whose prequel is an anime movie, or
   whose source is a manga, has nowhere to record it. Anime Movie has no relation
   columns at all and cannot participate.
2. **No branching.** One prequel and one sequel per entry. A franchise that splits,
   or an entry with several alternatives, does not fit.
3. **Only three kinds.** Side stories, spin-offs, adaptations, and the several
   flavours of "alternative version" (renew, director's cut, extended) get forced
   into prequel/sequel or lost.
4. **`alternative` is inert.** It is written by the sheet formatter and read by
   nothing. It is stringly typed and unparsed.
5. **Auto-derivation guesses.** `derive_prequel_sequel_*` chains every entry in a
   franchise by `watch_order`, which mislabels an OVA as the next entry's prequel.

## Solution

One polymorphic `media_relation` table, one row per relation, with the inverse
direction derived at read time from a registry of relation kinds. This follows
the precedent already set by `watch_order_item`, which stores FK-less
`(media_type, entry_id)` pairs resolved through `app/utils/media_resolver.py`.

Relations become hand-curated on a new admin page. Auto-derivation is retired.

### Rejected alternatives

- **Two mirrored rows per relation** (A→Sequel→B *and* B→Prequel→A). Reads get
  simpler, but every write and delete must maintain the twin and any bug leaves a
  half-relation. Doubles the backup sheet.
- **A `relations` JSONB column per table.** No reverse lookup without scanning all
  seven tables, nothing queryable, no clean sheet backup — reintroducing exactly
  what commit `c81d849` removed by dropping the notes JSONB column.

## Data model

### `media_relation`

New model in `app/models/media_relation.py`.

| column | type | notes |
| --- | --- | --- |
| `system_id` | UUID PK | `default=uuid.uuid4`, indexed |
| `from_type` | String | a `MEDIA_TABLES` key |
| `from_id` | UUID | FK-less, same contract as `watch_order_item.entry_id` |
| `relation_type` | String | a `RELATION_KINDS` key |
| `to_type` | String | a `MEDIA_TABLES` key |
| `to_id` | UUID | FK-less |
| `remark` | Text | free text, e.g. "covers ep 1-12 only" |
| `created_at` / `updated_at` | DateTime | `get_taipei_now`, matching every other model |

Constraints and indexes:

- `CheckConstraint` — no self-relation: NOT (`from_type` = `to_type` AND `from_id` = `to_id`).
- Unique index on (`from_type`, `from_id`, `relation_type`, `to_type`, `to_id`).
- Index on (`from_type`, `from_id`); index on (`to_type`, `to_id`). Both directions
  are queried on every entry read.
- No foreign keys, by necessity — no single FK spans seven tables. A deleted
  target resolves to `missing=True` through the existing resolver rather than
  vanishing, so a dangling link stays visible and fixable in the UI.

### Relation kinds

Nine user-facing labels compress to **eight stored kinds**, because Prequel is
Sequel read backwards. Storing both directions as distinct kinds would let one
fact exist as two rows that no unique index could catch, so the API normalizes
direction on write.

| stored `relation_type` | reads as `from` → `to` | inverse label shown on `to` | family |
| --- | --- | --- | --- |
| `sequel` | A is the sequel of B | Prequel | timeline |
| `alternative` | A is an alternative of B | Alternative (symmetric) | equivalence |
| `renew` | A is the renew of B | Original | equivalence |
| `directors_cut` | A is the Director's Cut of B | Original | equivalence |
| `extended` | A is the Extended version of B | Original | equivalence |
| `side_story` | A is a side story of B | Parent Story | branch |
| `spin_off` | A is a spin-off of B | Main Story | branch |
| `adaptation` | A is an adaptation of B | Source | derivation |

Consequences:

- Picking "Prequel" on B's page and choosing A stores one row `A —sequel→ B`.
  B's page renders "Prequel: A"; A's page renders "Sequel: B".
- An anime equal to two compilation movies is two rows:
  `movie1 —alternative→ anime` and `movie2 —alternative→ anime`.
- For the symmetric `alternative`, the service sorts the two `(type, id)` pairs
  before writing, so A-alt-B and B-alt-A collapse to one row that the unique
  index rejects as a duplicate.

### `RELATION_KINDS` registry

New module `app/utils/relation_kinds.py`, deliberately mirroring `MEDIA_TABLES`
in `app/utils/media_resolver.py` so both cross-table maps read the same way.

```python
@dataclass(frozen=True)
class RelationKind:
    key: str            # stored in relation_type
    label: str          # "Director's Cut"
    inverse_label: str  # "Original"
    family: str         # "timeline" | "equivalence" | "branch" | "derivation"
    symmetric: bool     # True only for `alternative`
```

This is the single source of truth for the API dropdown, the docs table, and the
inverse rendering. The frontend reads it over HTTP rather than keeping a copy.

### Columns dropped

- `prequel_id`, `sequel_id` — from all 6 uniform tables.
- `derive_related` — from the 5 that have it (anime, cartoon, manga, movie,
  tv_show); novel never had it.
- `alternative` — from anime and novel.

`is_main_entry` (anime, novel) is **unchanged and out of scope** — it flags which
entry represents a group in listings, which is a display concern, not a relation.

The new table starts **empty**. No existing values are migrated: prequel/sequel
were largely auto-derived by the logic being retired, and relations are to be
re-curated by hand on the new page.

## API

New router `app/routers/media_relation.py`, mounted at `/api/media-relation` in
`app/main.py`. Writes are admin-gated with `Depends(get_current_admin)`; reads
stay guest-visible, matching watch orders.

| method | path | purpose |
| --- | --- | --- |
| `GET` | `/kinds` | The registry as JSON — key, label, inverse label, family, symmetric. |
| `GET` | `/for-entry?media_type=&entry_id=` | Every relation touching this entry, both directions, each resolved through `media_resolver` to name/cover/nav path and flipped to the correct label. |
| `GET` | `/?franchise_id=` or `?collection_id=` | Every relation among a scope's entries, so the left pane's count badges cost one request rather than N. |
| `POST` | `/` | Create. Takes the direction as typed and normalizes before writing. |

The `POST` body carries the relation as the admin typed it, including the
user-facing `prequel` kind that has no stored form:

```json
{
  "from_type": "anime", "from_id": "…",
  "kind": "prequel",
  "to_type": "anime-movie", "to_id": "…",
  "remark": null
}
```

Normalization on write: `kind: "prequel"` is stored as the row
`to → sequel → from` (the endpoints swap); a symmetric `alternative` sorts its
two `(type, id)` pairs; every other kind stores as given.
| `PATCH` | `/{system_id}` | Edit `relation_type` / `remark`, re-normalizing if the kind changes. |
| `DELETE` | `/{system_id}` | Remove. |

Validation, mirroring the helpers already in `app/routers/watch_order.py`:

- `_validate_entry` (reused as-is) — both endpoints must resolve to a real row in
  the table their `media_type` names.
- `_validate_kind` — `relation_type` must be a `RELATION_KINDS` key; same shape as
  the existing `_validate_importance`.
- Self-relation and duplicate both return **409** with a message naming the
  existing row, not a 500 surfaced from the constraint.

Schemas in `app/schemas/media_relation.py`: `MediaRelationCreate`,
`MediaRelationUpdate`, `MediaRelationOut` (carrying the resolved other endpoint
plus the direction-correct label).

Normalization and both-direction read logic live in
`app/services/domain/media_relation.py`, keeping the router thin — the same split
as `app/services/domain/watch_order.py` behind its router.

Frontend endpoints go in a `mediaRelation` block in
`frontend/src/api/endpoints.js`, alongside `watchOrder`.

## Admin page

Route `/relations` → `frontend/src/pages/admin/Relations.jsx`, registered in
`App.jsx` inside the admin-gated block next to `/watch-orders`, and linked from
both admin spots in `Nav.jsx` (icon `fas fa-diagram-project`). Same
`grid-cols-[20rem_1fr]` two-pane shell and header block as `WatchOrders.jsx`.

A relation is not owned by any tier — it links two entries. The franchise or
collection picker is therefore a **browsing lens**, not ownership. Collection
works as a wider lens for free, since `Collection` sits strictly above
`Franchise` and entries reach it via `Franchise.collection_id`; cross-franchise
relations (a Marvel spin-off, a Type-Moon adaptation) usually live inside one
collection.

### Left pane — find the entry

- Franchise / Collection toggle, reusing the segmented-control markup from
  `NewOrderForm` in `WatchOrders.jsx`, then a `ComboBox` over that tier with the
  same `searchText` treatment that makes every name variant typeable.
- The scope's entries from the existing `GET /api/watch-order/candidates`,
  grouped by media type. Under collection scope, entries group by franchise
  first, then media type.
- Each row carries a count badge of existing relations, sourced from the single
  scope-wide `GET /api/media-relation/?franchise_id=`.
- A text filter over the list, matching the existing search input.

### Right pane — edit that entry's relations

- `GET /for-entry` supplies every relation touching the entry, already flipped to
  the correct side. Rows group by family: Timeline, Equivalence, Branch,
  Derivation.
- A row reads "Prequel — Fate/Zero" with the target's cover thumbnail, a
  media-type badge, an inline `remark`, and a delete button.
- A row whose target returned `missing=True` renders red with its dangling id:
  deletable, not clickable.
- **Add relation**: a kind `<select>` built from `GET /kinds`, listing all nine
  user-facing labels including Prequel (the flip to a stored `sequel` row happens
  server-side), plus a target `ComboBox` scoped to the current franchise or
  collection with a "search all media" checkbox that widens it globally.
- Every write refreshes both panes and reports through `useToast`, matching the
  `busy` / `showToast` pattern used throughout the watch-orders page. Deletes
  confirm via `window.confirm` naming both endpoints; entries are never touched.

### Out of scope

Rendering relations on the public detail pages (`Anime.jsx` and friends).
Relations stay admin-visible for now. `/for-entry` is already the right shape to
feed a detail-page section later without changes.

## Migration

One Alembic revision:

1. Create `media_relation` with its check constraint, unique index, and two
   lookup indexes.
2. Drop `prequel_id` and `sequel_id` from all 6 uniform tables; `derive_related`
   from the 5 that have it; `alternative` from anime and novel.

No backfill. Downgrade re-adds the four columns as nullable and drops the table;
the dropped column data is not recoverable by downgrade, so run the Backup
pipeline before `alembic upgrade head`.

## Pipelines

**Derivation retired.** Delete `derive_prequel_sequel_anime` / `_tv_show` /
`_cartoon` / `_manga` from `app/services/domain/derivation.py`, their four call
sites and imports in `app/services/domain/post_processing.py`, and
`_TV_SPECIAL_FRANCHISE_NAMES` if nothing else uses it. The Calculate pipeline
message in `app/services/calculation.py:392` loses its prequel/sequel clause.
Watch-order and `ep_previous` derivation are untouched.

**Sheets round trip**, following the Watch Order List/Item precedent exactly:

- `app/services/pipelines/backup.py` gains a
  `bulk_overwrite_sheet("Media Relation", …)` block using `format_model_for_sheet`.
- `app/services/pipelines/pull.py` registers `"Media Relation": MediaRelation` and
  `parse_media_relation_from_sheet`.
- `app/utils/formatter.py` gains that parser and loses the dropped columns from
  the anime and novel parse maps (around lines 330 and 616) and everywhere else
  the four columns appear.

## Frontend cleanup

The dropped columns come out of:

- `frontend/src/config/formFactories.js` (6 occurrences of the pair)
- `frontend/src/config/formFields/fieldMeta.js`
- `frontend/src/lib/payloads.js`
- the "Prequel ID" / "Sequel ID" / `derive_related` fields in all six
  `frontend/src/pages/add-tabs/*AddTab.jsx` files and their Modify counterparts

This is the bulk of the mechanical work.

## Documentation

- `docs/database-schema.md` — new table; edit the 6 column tables.
- `docs/business-logic.md` — remove the prequel/sequel derivation section; add the
  normalization rules.
- `docs/options.md` — the nine relation kinds.
- `docs/api.md` — the new router.
- `docs/pages.md` and `docs/admin-forms.md` — the new page.
- `docs/integrations.md` — the new sheet tab.

## Tests

Mirroring the existing watch-order trio:

- `tests/unit/test_relation_kinds.py` — every kind declares a non-empty
  `inverse_label` and a family drawn from the four known values; `symmetric` is
  True only where `label == inverse_label`; the registry's nine user-facing
  labels are unique.
- `tests/unit/test_formatter_media_relation.py` — sheet parse/format round trip.
- `tests/api/test_media_relation.py` — normalization (posting Prequel stores a
  `sequel` row; A-alt-B followed by B-alt-A is a 409, not a second row),
  self-relation 409, unknown kind 422, `/for-entry` returning both directions with
  correct labels, and a dangling target resolving to `missing`.

## Sequencing

Two commits:

1. Schema, backend, pipelines, tests.
2. Admin page, frontend cleanup, `npm run build`.

Nothing user-facing breaks between them: the columns being dropped are already
invisible to readers.
