# Clean orphaned data — design

Last verified: 2026-09-11
Status: design approved (part 1 by the owner; part 2 decided by `clean-session`
under the coordinated multi-session delegation, see Decision 0)

## The problem

Pull only ever inserts and updates. `execute_pull_specific` walks the sheet's
rows and upserts each one; nothing in `pull.py` deletes. A local row the sheet
no longer mentions therefore survives every Pull All, forever.

That is not a theoretical gap. It is the normal consequence of the two-machine
workflow in CLAUDE.md:

1. Delete an entry on the **home** machine.
2. Backup writes the sheet; the entry is gone from it.
3. `git pull` + Pull All on **company**.
4. The entry is still in the company database, and no future Pull will remove
   it. It is invisible to the sheet and immortal locally.

The two databases have silently diverged, and the divergence only grows. The
same happens to a franchise, a series or a collection deleted on one side.

**Deletions do not propagate.** This design adds the action that makes them
propagate, under review.

## What this is not

- Not a change to Pull. Pull stays upsert-only; making it delete would mean any
  sheet read failure or partially-written tab could empty a table. The
  destructive step gets its own route, its own confirmation, and its own audit
  row.
- Not a general "unused row" cleaner. A `system_option` nothing cites, a
  `person` with no credits — those are clutter, not divergence, and deleting
  them rewrites entries that still reference them. Out of scope (Decision 2).
- Not automatic. Nothing here runs on a schedule or at the end of another
  pipeline.

## Scope

Thirteen tabs, from `SHEET_TABS` in `app/services/pipelines/tabs.py`:

| Group | Tabs |
|---|---|
| Tiers | `Collection`, `Franchise`, `Series` |
| Entry spine | `Media` |
| Entry details | `Anime`, `Anime Movie`, `Movies`, `TV Shows`, `Cartoons`, `Manga`, `Novel`, `Comic`, `Game` |

The nine detail tabs are exactly the tabs carrying a `media_type`, which is the
nine keys of `MEDIA_TABLES` in `app/utils/media_resolver.py` (`game` included —
that module's docstring says "eight" and is stale by one; fixed in this change).

Everything else in `SHEET_TABS` is out of scope: the vocabulary tabs
(`System Options` and its scope/usage/alias children), the entity tabs
(`Person`, `Studio`, `Publisher`, `Character`), the authorization tabs
(`Users`, `Content Label`, `Media Content Label`), and the per-user tabs
(`User Media List`, `Plan Next`, `Seasonal`, `Game Copy`).

## Decisions

### Decision 0 — who approved this

Part 1 (the diff semantics) was presented to the owner and approved verbatim.
Part 2 (routes, review flow, UI placement, tests) was presented and then
decided by `clean-session` without waiting, under the exception added to
CLAUDE.md's "## Rule" on 2026-09-11 for the coordinated multi-session run.
Recorded here because that section requires self-made decisions to be written
down. Nothing in part 2 diverges from what was presented to the owner; the
delegation covers proceeding, not changing the design.

### Decision 1 — the sheet is allowed to be ahead of the database

No freshness gate. The action does **not** require a recent Backup and does not
refuse to run when local rows are newer than the sheet.

The obvious-looking rule — "back up first, so the sheet reflects local truth" —
is exactly backwards here. In the workflow that creates the garbage, the sheet
is *deliberately* ahead: it is the machine that performed the deletion which
wrote it. Running Backup first would re-write the local garbage into the sheet
and destroy the only evidence the diff has.

The cost is that a row created locally since the last Backup looks identical to
an orphan. That is handled in the review UI rather than by refusing to run: the
report carries the last successful Backup timestamp and each candidate's
`created_at` / `updated_at`, and the UI excludes post-Backup rows from
select-all and marks them (Decision 8).

### Decision 2 — tiers and entries only

See Scope. Vocabulary and entity tabs are excluded because deleting a
`system_option` or a `person` does not remove a row the user reviewed — it
silently rewrites every entry citing it, through `ON DELETE CASCADE` on
`media_credit` and `media_tag`. An orphaned option is clutter; an orphaned entry
is divergence. Only the second is a correctness problem, and only the second is
reviewable one row at a time.

The authorization tabs are excluded for a second, independent reason: Pull
already gates them behind `admin.authz` (`requires_authz` in `tabs.py`), because
the sheet is an ordinary Google Sheet anyone with access can edit. A delete path
into `Users` would let a sheet edit remove an account.

### Decision 3 — a candidate must miss on EVERY identity the sheet carries

A local row is a deletion candidate only when it misses on all of the
identities available for its tab. Any single hit spares it.

| Tab group | Identities checked, all must miss |
|---|---|
| Entries (found on `Media`) | `system_id`; `(media_type, public_id)`; `display_name` |
| Tiers (`Collection`, `Franchise`, `Series`) | `system_id`; `public_id`; `<prefix>_name_en`; `<prefix>_name_cn` |

`(media_type, public_id)` is the load-bearing one for entries, and it is
**stronger than a name match**: Backup writes `public_id` on every entity tab
and Pull restores it unchanged — that is precisely what keeps the company and
home databases agreeing on the ids that appear in URLs, and it is why the
uniqueness constraint is `DEFERRABLE INITIALLY DEFERRED`. `user_media_list`
already resolves entries across machines by exactly this pair. A rename on one
machine therefore does **not** make an entry look orphaned, which a
names-only rule would have got wrong.

The asymmetry is deliberate: a **false negative** keeps one piece of garbage
for one more round, which costs nothing; a **false positive** deletes a real
entry and everything cascading from it.

The `<prefix>` for tier tabs is not uniform and must be read, not guessed —
`collection_`, `franchise_`, `series_`. The entry prefixes are worse
(`tv_name_en`, not `tv_show_name_en`; see `pull.py:1290`), which is a second
reason entries are matched on `Media` rather than on their detail tabs.

### Decision 3b — an identity rule borrowed from an upsert path must be re-derived before it gates a delete

This design originally copied `pull.py`'s id-less matching rule — `*_name_en`
or `*_name_cn` — because it was the identity rule this codebase already had for
these tabs. It was sound where it came from and would have destroyed data here.

An entry **renamed on the other machine** misses on `system_id` (a different
uuid) and misses on both names (they changed). Under a names-only rule it reads
as orphaned, and the cascade takes its credits, sources, notes, quotes and every
user's list rows. In `pull.py` the same failed match is harmless: the row simply
inserts, and a duplicate is visible and fixable. **Upsert forgives a bad match;
delete does not.**

So: whenever an identity rule moves from a read or upsert path to a path that
deletes, re-derive it from what actually round-trips between the two databases,
rather than inheriting it. Here that is `(media_type, public_id)` — Backup
writes `public_id` on every entity tab and Pull restores it unchanged, which is
the whole reason the two machines agree on the ids that appear in URLs.

The same asymmetry is why Decision 3 spares a row on **any** single hit, and why
Decision 6 aborts rather than continuing per-tab. A false spare leaves a stale
row that is visible and fixable; a false delete is cascading, silent, and
unrecoverable without a dump.

### Decision 3a — entries are found on `Media`, enriched from the detail tab

Backup writes both the `media` row and its detail row, so an entry deleted on
the other machine vanishes from **both** tabs. Scanning `Media` alone is
therefore sufficient, and it is better:

- `Media` carries the portable `(media_type, public_id)` pair and a
  `display_name`; the detail tabs carry nine different, irregular name prefixes.
- One candidate is produced per entry, rather than one from `Media` and a
  duplicate from its detail tab.
- It falls out of Decision 4 — the row produced is already the row deleted.

The detail tab is still read, for two purposes: the candidate's display names
come from it, and a detail row whose `media` parent is absent locally is
reported as a **separate anomaly** (not a deletion candidate) because it should
be impossible — the FK is `ON DELETE CASCADE`.

### Decision 4 — deletion targets `media`, not the detail row

The foreign key runs `detail.system_id → media.system_id ON DELETE CASCADE`
(`app/models/anime.py:40` and the eight siblings). `media` is the parent.

Deleting an `Anime` row alone would leave the `media` row behind — a fresh
orphan created by the orphan cleaner. So candidates are **found** on the detail
tab (that is where the names and the natural key live) and **deleted** on
`media.system_id`, letting the database cascade take the detail row,
`media_credit`, `media_tag`, `media_source`, `media_content_label`, `meme`,
`note`, `quote` and every user's `user_media_list` row.

### Decision 5 — every candidate carries its blast radius

Because Decision 4 means one tick removes far more than one row, each candidate
in the report carries counts of what the cascade would take, computed before
anything is deleted: credits, sources, content labels, notes/memes/quotes, and
**list rows per user**.

Ticking a box must never remove something the operator was not shown. The list-
row count is called out separately because it is the one class of collateral
that belongs to somebody other than the operator.

### Decision 6 — two refusals, both of which would otherwise empty the database

`scan` and `apply` both abort — entirely, not per-tab — when either holds:

| Condition | Why aborting is the only safe answer |
|---|---|
| `SheetsUnavailableError` on any in-scope tab | A partial read is indistinguishable from "everything in the unread tabs is orphaned". Pull's own policy (continue past an unreadable tab, report it) is right for an upsert and catastrophic for a delete. |
| An in-scope tab with fewer than 2 rows | An empty tab means "delete this entire table". `bulk_overwrite_sheet` already refuses to *write* an empty tab (`ValueError`), so reading one back means something upstream is wrong — never that the table should be emptied. |

Pull treats an empty tab as `processed: 0` and moves on. Clean must not: the
same input means "nothing to do" for an upsert and "destroy everything" for a
delete.

### Decision 7 — scan and apply are separate routes, and apply re-scans

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/data-control/clean/scan` | — | `{tabs, totals, last_backup_at}` |
| `POST` | `/api/data-control/clean/apply` | `{items: [{tab, system_id}, …]}` | `{deleted, per_tab, skipped}` |

`apply` re-runs the scan and deletes an id only if that id is **still** a
candidate. Anything else is returned in `skipped` with a reason and left alone.

The alternative — a `dry_run` flag on one route — was rejected because the
destructive call would then not name what it is deleting, so a row added between
preview and apply would be swept without ever having been shown. Re-scanning
costs a second sheet read and buys the guarantee that the set deleted is a
subset of the set reviewed. Decision 6's refusals apply to the re-scan too, so a
Sheets outage makes `apply` a no-op rather than a mass delete.

A staging table (persist candidates, flag approved ones) was also rejected: it
needs a migration and introduces a staleness problem of its own — the stored
candidate list ages exactly like the sheet snapshot it came from.

### Decision 8 — the review UI defaults to nothing selected

New page `frontend/src/pages/admin/CleanOrphans.jsx`, reached from a button on
the Data Control page, with real entries in `api/endpoints.js` and a TanStack
Query hook.

It is a new file rather than another section of `Admin.jsx` because that file is
already 2,333 lines, and the comparable flow in it (`DuplicatesModal`) reaches
for `fetch` with a literal URL instead of `endpoints.js` — a pattern not worth
extending.

Behaviour:

- Last successful Backup timestamp at the top, stated plainly, because
  Decision 1 makes it the piece of context the operator needs most.
- Candidates grouped by tab, each row showing names, `public_id`, timestamps and
  the Decision 5 blast radius.
- **Everything unticked on load.** Select-all is per tab and **skips rows whose
  `created_at` is newer than the last successful Backup**, which are rendered
  with a warning marker. Those rows are still tickable by hand.

### Decision 9 — both routes inherit the unscoped-mode gate

The routes go on the existing `/api/data-control` router, which as of
`3c509dfd` carries two dependencies: `require_manage_pipelines` and
`require_unscoped_mode` (`app/services/rbac/modes.py:203`). Both apply
automatically.

This is correct for Clean, for a reason adjacent to but not the same as
decision 14 in the authorization spec. Decision 14's rationale is the
**write** axis: a pipeline run from a narrowed session would write a partial
sheet over a complete one. Clean's rationale is the **object** axis:

- `clean/scan` returns every orphan **by name**, so the report is an
  unrestricted read of the whole catalogue by construction.
- `clean/apply` deletes by `system_id`.

An operator whose access mode hides entries must be refused both — they would
otherwise read out rows the mode conceals, and delete rows they cannot see.

Note for anyone extending this: the scan runs raw `db.query` in a service
module, not a viewer-filtered query, so a narrowed mode hides nothing *from the
scan itself*. Had the scan been viewer-filtered, hidden rows would have dropped
out of the local set and been silently **spared**, not over-reported. The gate is
what makes the question moot; do not remove it on the theory that the service is
unfiltered anyway.

### Decision 10 — audit trail reuses the existing machinery

- One `deleted_record` row per deleted entry via `log_deleted_record`
  (`app/utils/data_control_utils.py:55`), which already has branches for
  `Collection`, `Franchise`, `Series` and all nine entry types — the full scope
  of this design, with nothing to add.
- One `data_control_logs` row per `apply`: `action_main="Clean"`,
  `action_specific="Clean Orphans"`, `type="Manual"`, `rows_deleted`, and a
  per-tab `details_json`.
- `log_deleted_record` deliberately does not commit; the router commits, so the
  audit rows and the deletions land or roll back together.
- `scan` writes no log row — it is read-only, like `check/duplicates`.

### Decision 11 — no migration

The scan is read-only and `apply` deletes through foreign keys that already
exist. No schema change, so no new alembic head and no contention with
`n1a1accessmode`.

## Architecture

New module `app/services/pipelines/clean.py`, alongside `pull.py`:

```
scan_orphans(db) -> CleanReport
    for each of the 13 in-scope tabs, in SHEET_TABS order:
        rows = get_all_raw_rows(tab.name)        # Decision 6 refusals
        sheet_ids, sheet_names = index(rows)
        for local in db.query(tab.model):
            if local.system_id not in sheet_ids
               and not names_match(local, sheet_names):   # Decision 3
                yield candidate(local, blast_radius(db, local))   # Decision 5

apply_clean(db, items) -> CleanResult
    report = scan_orphans(db)                    # Decision 7 re-scan
    for item in items:
        if item not in report: skip(reason)
        else: log_deleted_record(...); delete media/tier row   # Decisions 4, 10
    commit once
```

It does **not** reuse `execute_pull_specific`. That function's job is writing;
threading a "don't write" flag through 1,800 lines to borrow its matching is how
`pull.py` would rot. The natural-key rules it needs are small enough to state
directly, and the two are pinned to each other by a test (see below).

Deletion order is **child-first**: entries, then `Series`, then `Franchise`,
then `Collection`. `franchise_id` / `series_id` / `collection_id` are
`ON DELETE SET NULL`, so a child that was *not* ticked survives its deleted
parent as an orphaned-but-alive row rather than being destroyed. The report
states this explicitly for any tier candidate that still has children.

## Testing

Backend, with a faked sheet reader, on `anime_site_test_clean`:

- an unreadable tab aborts the whole scan (not just that tab)
- a tab with fewer than 2 rows aborts
- a local row whose id is absent but whose `*_name_en` matches is **not** a
  candidate (Decision 3)
- a local row missing on both keys **is** a candidate
- deleting an entry removes the `media` parent and cascades the detail row
  (Decision 4)
- the blast-radius counts match what the cascade actually removes
- `apply` deletes only the named ids
- `apply` skips an id the re-scan no longer considers a candidate (Decision 7)
- `deleted_record` and `data_control_logs` rows both land, in the same
  transaction
- tier deletion runs child-first and leaves unticked children alive
- `mode_client("normal")` gets 401 on both routes (Decision 9)
- a guard test asserting the natural-key rule here matches the one `pull.py`
  uses for the same tabs, so the two cannot drift apart silently

Tests use conftest's `admin_client` / `super_client` / `mode_client`; tokens are
never minted by hand — one with no `mode` claim resolves the empty object set
and 401s for a reason unrelated to the code under test.

Frontend (vitest): nothing ticked on load; select-all skips post-Backup rows;
apply posts exactly the ticked ids.

## Documentation

In the same change: a new section in `docs/data-actions.md` (renumbering what
follows) and its code map row; `docs/api.md` for the two routes;
`docs/roadmap.md` Done entry. Two stale lines fixed on the way:
`docs/data-actions.md` says the data-control router is gated by
`get_current_admin` (it is `require_manage_pipelines` plus
`require_unscoped_mode`), and `app/utils/media_resolver.py:5` says "eight media
entry tables" when there are nine.
