# Plan Next — Design Spec

**Date:** 2026-08-29
**Status:** Approved (pending implementation plan)

---

## Context

"Watch Next" / "Read Next" is stored three different ways today:

| Scope | Today |
|---|---|
| Entry | `watch_next` Bool on `anime_movie`, `movie`, `tv_show`, `cartoon`; `read_next` Bool on `manga`, `novel`, `comic` |
| Series | nothing |
| Franchise | `watch_next_group` String (`"12ep"` / `"24ep"` / `"30ep_plus"`), anime-only in practice |
| Anime entry | nothing — anime has no `watch_next` column at all |

Three problems follow from that shape:

1. **Series cannot participate.** `series` is one table shared by every media type, so a boolean column there would have to be `anime_next`, `movie_next`, `tv_show_next`, … — one column per type on a table that deliberately has no type of its own.
2. **The franchise bucket cannot be per-type.** `watch_next_group` is one string column, so a franchise holding both anime and TV show entries can only be bucketed one way.
3. **Anime entries cannot be marked at all**, and comic is missing from the Plan page entirely.

This spec replaces all of it with one `plan_next` table plus a per-type bucket map on the two grouping tiers.

### Target scopes by media type

| Media type | Entry | Series | Franchise |
|---|:--:|:--:|:--:|
| anime | yes | yes | yes |
| movie | yes | yes | yes |
| tv_show | yes | yes | yes |
| cartoon | yes | yes | yes |
| comic | yes | yes | — |
| anime_movie | yes | — | — |
| manga | yes | — | — |
| novel | yes | — | — |

### Out of scope

`to_rewatch` / `to_reread` has the same shape and the same limitations, but is not touched by this work. If it is migrated later it should reuse this table's design rather than inventing a second one.

---

## Data Model

### New table: `plan_next`

```
plan_next
  system_id    UUID    PK, default uuid4, indexed
  media_type   String  NOT NULL   -- anime | anime_movie | movie | tv_show | cartoon | manga | novel | comic
  scope        String  NOT NULL   -- entry | series | franchise
  target_id    UUID    NOT NULL   -- entry id, series.system_id, or franchise.system_id
  remark       Text    NULL
  created_at   DateTime
  updated_at   DateTime

  UNIQUE (scope, target_id, media_type)   -- uq_plan_next_target
  INDEX  (media_type, scope)              -- ix_plan_next_type_scope
```

**The row's existence is the boolean.** There is no `is_next` column; un-marking deletes the row.

**The target is an FK-less `(scope, media_type, target_id)` triple**, the same contract `media_relation` and `watch_order_item` already use, because no single foreign key can span the eight entry tables plus `series` and `franchise`. Resolution at read time goes through the existing `OWNER_TABLES` map in `app/utils/media_resolver.py`, which already covers exactly this target space and already surfaces a deleted target as `missing=True` rather than dropping the row — so a dangling reference stays visible and fixable in the admin UI instead of vanishing.

*Alternative considered and rejected:* `watch_order_list`'s pattern of three nullable FK columns plus a single-owner `CheckConstraint`. It buys real `ON DELETE CASCADE` for the two grouping tiers, but splits one concept across four columns and makes the uniqueness constraint awkward to express. The uniform triple wins on clarity; the cost is that franchise and series delete paths must clean up `plan_next` rows, the same obligation `media_relation` already carries.

**`media_type` is stored even for `scope='entry'`,** where it is technically derivable from which table holds the id. It is the tab discriminator on the Plan page, and storing it keeps one uniform key across all three scopes.

**A franchise may legitimately appear twice** — once per media type — e.g. an anime row and a tv_show row for the same franchise. This should be rare, but the constraint permits it deliberately so that mixed-type franchises and corrupted data stay representable rather than being silently collapsed.

### Bucket storage: `franchise` and `series`

The bucket is a standing property of the group, not of the plan row — a series *is* "2 season" whether or not it is currently planned. Because it must also vary per media type, it is a JSONB map, matching the shape `franchise.type_covers` / `type_slots` already use:

```
size_group_derived  JSONB NULL   -- {"anime": "24ep", "tv_show": "2season"}   <- Calculate writes
size_group_manual   JSONB NULL   -- {"anime": "12ep"}                          <- the admin writes
```

Both columns are added to **both** `franchise` and `series`.

**Effective bucket** for a group and media type: `size_group_manual[type]` if the key is present, else `size_group_derived[type]`, else none.

Two fields rather than one field plus an "is overridden" flag: Calculate rewrites `size_group_derived` freely and can never stomp a manual edit, and clearing an override is just removing a key.

### Bucket vocabularies

| Media type | Buckets |
|---|---|
| anime | `12ep`, `24ep`, `30ep_plus` |
| tv_show, cartoon | `1season`, `2season`, `3season_plus` |
| movie | `standalone`, `2_3movies`, `4movies_plus` |
| comic | `1_3`, `4_10`, `11_plus` |
| anime_movie, manga, novel | none — entry scope only, so no bucket applies |

The anime vocabulary exists today but is hardcoded in three frontend files and absent from `docs/options.md`. All four vocabularies move into `options.md` and into a single shared frontend module.

The comic boundaries were chosen against the real collection (99 comics, all with a non-null `issue_total`): `1-3` / `4-10` / `11+` splits it 35 / 35 / 29.

### Bucket resolution for an entry

An entry's bucket is **never stored**. It is resolved at display time:

- **Comic entries** bucket on their **own** `issue_total`. Comic is the sole exception to the inheritance rule, because an individual comic run has a meaningful issue count of its own.
- **All other entries** read the effective bucket of their `series_id`, falling back to their `franchise_id`, falling back to none.

---

## API

### New router: `app/routers/plan_next.py`

Modeled on `media_relation.py`: reads are public (planning state is ordinary catalogue data), every write is admin-only via `Depends(get_current_admin)`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/plan-next/` | public | All rows; optional `?media_type=` and `?scope=` filters. One call feeds the whole Plan page. |
| `POST` | `/api/plan-next/` | admin | Create one row. Validates the scope/type pair, rejects duplicates (409) and non-existent targets (404). |
| `DELETE` | `/api/plan-next/{system_id}` | admin | Delete by row id. Logs via `log_deleted_record`. |
| `DELETE` | `/api/plan-next/target` | admin | Delete by `(scope, media_type, target_id)`, so a toggle needs no row id. |

### New module: `app/utils/plan_next_kinds.py`

Mirrors `app/utils/relation_kinds.py`. Exports the scope vocabulary, the bucket vocabularies, and `ALLOWED_SCOPES: dict[media_type, set[scope]]` encoding the scope table above. Validation is API-layer, not a DB enum — the same choice `watch_order_item.importance` and `media_relation.relation_type` already make, so extending it needs no migration.

### Entry schemas keep `watch_next` / `read_next`

The fields survive on the entry create/update and read schemas as **virtual fields backed by the table**:

- On write, `true` upserts a `plan_next` row for that entry, `false` deletes it.
- On read, the flag is computed from `plan_next`.

This keeps the Add tabs, Modify tabs, entry detail pages, library filters, `formFactories.js`, `fieldMeta.js`, and `payloads.js` working unchanged — the bulk of the 35 frontend files that reference these fields today. `anime` gains `watch_next` for the first time.

*Accepted cost:* a column and a row look identical from the API. `database-schema.md` and `business-logic.md` must state plainly that `plan_next` is the single source of truth and that these fields are a compatibility surface.

---

## Pipelines

### Calculate — bucket derivation

New `run_sync_size_groups(db)` in `app/services/calculation.py`, called from `run_sync()`. It rewrites `size_group_derived` on every series and franchise and **never** touches `size_group_manual`.

| Media type | Derived from the group's entries of that type |
|---|---|
| anime | sum of `ep_total` -> `12ep` (<=12) / `24ep` (13-24) / `30ep_plus` (>=25) |
| tv_show, cartoon | count of entries -> `1season` (1) / `2season` (2) / `3season_plus` (>=3) |
| movie | count of entries -> `standalone` (1) / `2_3movies` (2-3) / `4movies_plus` (>=4) |
| comic | **series only** — sum of `issue_total` -> `1_3` (<=3) / `4_10` (4-10) / `11_plus` (>=11). No franchise-level comic bucket is derived: comic has no franchise scope, and comic entries self-bucket rather than inheriting, so the value would never be read. |
| anime_movie, manga, novel | not derived — no vocabulary |

A group with no entries of a given type gets no key for that type. Entries with a null count contribute 0 to a sum and still count toward a count.

The anime rule sums rather than taking a max or a count: a series of two 12-episode seasons reads as `24ep`, matching how the commitment is actually planned.

### Sheets — one new tab

`plan_next` becomes a **"Plan Next"** tab, registered exactly where "Media Relation" already is:

- `app/services/pipelines/backup.py` — a `bulk_overwrite_sheet("Plan Next", ...)` block
- `app/services/pipelines/pull.py` — `MODEL_MAP` and `PARSER_MAP` entries
- `app/utils/formatter.py` — new `parse_plan_next_from_sheet`

`size_group_derived` and `size_group_manual` ride along on the existing **Franchise** and **Series** tabs, parsed with `_safe_json`, the same treatment `type_covers` and `type_slots` get.

> **Regression risk, called out deliberately.** `business-logic.md:1548` records that `parse_franchise_from_sheet` once omitted `type_covers`, `type_slots`, `watch_next_group` and `cover_entry_id`, so every Pull of the Franchise tab silently wiped them. Both new JSONB fields must be added to `parse_franchise_from_sheet` **and** `parse_series_from_sheet` in the same change, with a round-trip test.

### Migration

One Alembic revision, in this order:

1. Create `plan_next` with its constraint and index.
2. Add `size_group_derived` and `size_group_manual` to `franchise` and `series`.
3. Backfill:
   - one entry-scope row per entry where `watch_next` / `read_next` is true, with the matching `media_type`;
   - one franchise-scope row with `media_type='anime'` per franchise with a non-null `watch_next_group`, and that value written to `franchise.size_group_manual` as `{"anime": <value>}`.
4. Drop `watch_next` from `anime_movie`, `movie`, `tv_show`, `cartoon`; `read_next` from `manga`, `novel`, `comic`; `watch_next_group` from `franchise`.

Downgrade reverses steps 4 to 1, accepting known loss: series-scope rows, non-anime buckets, and remarks have nowhere to go in the old shape.

---

## Frontend

### Group-level UI (new)

`FranchiseModifyTab.jsx`, `SeriesModifyTab.jsx`, and the inline-edit block in `FranchisePage.jsx` each gain, per applicable media type:

- a **next** toggle (creates/deletes the `plan_next` row), and
- a **bucket override** dropdown writing `size_group_manual[type]`; blank means "use derived", with the derived value shown as the placeholder so the effective value is always visible.

The hardcoded `12ep/24ep/30ep_plus` `<select>` at `FranchisePage.jsx:1196-1198` and the matching one in `FranchiseModifyTab.jsx:305-307` are replaced by a shared `frontend/src/config/planNextGroups.js` exporting the vocabularies and their labels.

### Plan page rewrite

`frontend/src/pages/plan/PlanWatchNext.jsx` is 695 lines of seven near-identical blocks, each re-implementing filter -> group -> sort -> render for one media type. With a uniform table behind it this collapses to one config-driven render path: a tab list, a bucket vocabulary per type, and one card component.

- **Comic is added as the eighth tab** — it is absent from the Plan page today, and is essentially free once the loop is uniform.
- Within a tab, rows group by effective bucket, with an **Ungrouped** section for anything unbucketable.
- Sorting keeps the existing `EXPECTATION_WEIGHT` order (`Highest` -> `Low`).
- Entry cards keep the look they have today. Franchise and series cards carry an explicit tier label so the three scopes are distinguishable at a glance.

`usePlanData.js` gains `/api/plan-next/` and `/api/comic/`, growing its `Promise.all` from 8 endpoints to 10.

The bucket-resolution helper (entry -> series -> franchise, with the comic exception) lives in `frontend/src/utils/planNext.js` so it is unit-testable independently of the render.

---

## Testing

**Backend**

- `(scope, target_id, media_type)` uniqueness is enforced; the same franchise under two media types is permitted.
- Scope legality: a franchise-scope `manga` row and a series-scope `novel` row are both rejected.
- A `POST` naming a non-existent target 404s; a row whose target is later deleted resolves as `missing`.
- Each derivation rule at its boundaries: anime 12/13 and 24/25, tv_show/cartoon 2/3, movie 1/2 and 3/4, comic 3/4 and 10/11.
- `size_group_manual` overrides `size_group_derived` per key, and Calculate does not clobber a manual value.
- Entry inheritance resolves through series, falls back to franchise, and yields none when neither has the key.
- A comic entry buckets on its own `issue_total` and ignores its series' bucket.
- Entry `watch_next` / `read_next` round-trips through the virtual field to a `plan_next` row and back.

**Pipelines**

- Backup then Pull round-trip of the Franchise and Series tabs preserves `size_group_derived` and `size_group_manual` (guards the `business-logic.md:1548` regression).
- Backup then Pull round-trip of the Plan Next tab preserves all rows.

**Frontend**

- `planNext.js` bucket resolution, including the comic exception and the ungrouped case.

---

## Documentation

| File | Change |
|---|---|
| `database-schema.md` | New `plan_next` table; four new JSONB columns; eight dropped columns; note that the entry flags are a virtual compatibility surface |
| `options.md` | All four bucket vocabularies (none are documented today) |
| `business-logic.md` | Derivation rules, manual-override precedence, entry inheritance and the comic exception |
| `api.md` | The `/api/plan-next/` router |
| `pages.md` | Plan page rewrite; comic tab added |
| `admin-forms.md` | Group-level next toggle and bucket override on the franchise and series forms |
| `integrations.md` | The "Plan Next" Sheets tab |
