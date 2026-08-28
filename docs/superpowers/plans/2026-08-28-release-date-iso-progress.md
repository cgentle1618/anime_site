# Release Date ISO — Execution Progress

Companion to `2026-08-28-release-date-iso.md`. The SDD workspace
(`.superpowers/sdd/2026-08-28-release-date-iso/`) is gitignored and does NOT
travel between machines, so this file is the portable record. Read it before
resuming on a different device.

**Spec:** `docs/superpowers/specs/2026-08-28-release-date-iso-design.md`
**Plan:** `docs/superpowers/plans/2026-08-28-release-date-iso.md`
**Branch:** `modify`
**Paused:** 2026-08-28, after Task 4, at the user's request

## Completed

| Task | Commits | Result |
|---|---|---|
| 1 — date helper module | `0c9b0d7` | 50 unit tests pass. Spec PASS, quality APPROVED. |
| 2 — model columns + CHECK constraints | `114436c` | 29 tests pass. Reviewed with Task 3. |
| 3 — Alembic migration | `88d8a0f` | 6 unit tests pass. Ran live: 1,979 source rows converted, **0 unparseable**. upgrade / downgrade / re-upgrade all verified. Spec PASS, quality APPROVED. |
| 4 — Pydantic validation | `ffb8e78` | 7/7 tests pass. Validator mounted on all eight media schemas. Spec PASS, quality APPROVED. |

Plan and spec documents committed as `11a228f`. Branch pushed to origin at
`11a228f`.

## Resume here

**Next action:** Task 5 (external API mappers emit ISO), with review BASE =
`ffb8e78`.

**Remaining:** Tasks 5-13 — external API mappers, autofill wiring, anime
season derivation, seasonal grouping and the season filter, watch-order
priority and remarks, the Google Sheets apostrophe fix, the two frontend
tasks, and documentation.

The per-task briefs for Tasks 5-13 were extracted into the gitignored
workspace and will not exist on the new machine. Regenerate any of them with:

```
bash <superpowers>/skills/subagent-driven-development/scripts/task-brief \
  docs/superpowers/plans/2026-08-28-release-date-iso.md <N>
```

## Tree state at pause — read this first

The database is **already migrated** to the new columns, but the services and
frontend still reference `release_year` / `end_year`. The application is
therefore half-converted and the backend will not work correctly until at
least Task 10 lands.

`pytest -q` is intentionally RED at this commit: roughly **28 failed / 33
errored**, every one a downstream consumer of the old column names, owned by
Tasks 5-10. This is the plan's design, not a defect. Task 12 step 5 is the
gate that re-verifies it green:

```
grep -rn "release_year\|release_month\|end_year" frontend/src app/
```

must return nothing but the migration file.

**A new machine needs its own `alembic upgrade head`** before running the
suite — the migration ran against the original device's local Postgres only.

## Rulings made during execution

1. **Commits allowed inside tasks.** The approved plan describes every task as
   ending in a commit, and the per-task review diffs depend on those commit
   boundaries. Guards: per-file staging only, never `git add -A`, no
   `checkout`/`restore`/`stash`/`reset`. *Cost if wrong:* commits on `modify`
   that must be reset.
2. **No git worktree; work proceeds on `modify`.** CLAUDE.md documents
   concurrent sessions sharing this working tree, and a worktree would break
   that convention. The tree was clean at start. *Cost if wrong:* another
   session's edits interleave with these commits.
3. **Tasks 2 and 3 dispatched as one unit.** Task 2 alone leaves the models
   declaring columns the database lacks, red-failing the whole API suite until
   Task 3 runs. *Cost if wrong:* a larger single review surface.
4. **Accepted two migration deviations from the plan text.** The plan named
   `down_revision = "z9a0b1c2d3e4"`, derived from an alphabetical filename
   listing rather than the revision graph — it is stale. The real head is
   `wo_flat_order`. The plan's revision id `a1b2c3d4e5f6` also collided with an
   existing migration and would have formed a cycle; the migration uses
   `d1e2f3a4b5c6`. Both are defects in the plan, not the implementation, and
   the corrections are proven by a live upgrade/downgrade/re-upgrade. *Cost if
   wrong:* a broken migration chain — disproved by the live run.

Two plan defects were also fixed before execution began: a reference to a
non-existent `admin_headers` pytest fixture (the suite provides `client`,
`admin_client`, `db_session`), and a wrong `Seasonal` import path.

## Deferred minors — hand these to the final whole-branch review

1. **Task 1:** `DATE_COLUMNS["movies"]` orders `(usa, tw)` while
   `RELEASE_PRIORITY["movie"]` orders `(tw, usa)`. Intentional —
   `DATE_COLUMNS` carries no priority meaning — but it can surprise a reader.
2. **Task 3:** `merge_anime_release()` silently discards an unrecognized month
   string when the year is valid: it falls back to `normalize(year)` and
   returns non-None, so `_log_unparseable` never fires. Real impact nil (the
   live run logged zero, and anime only ever stored three-letter
   abbreviations), but it is a gap against the "never silently drop data"
   constraint.
3. **Task 4:** the validator's error message lists the three legal shapes but
   does not mention that integers and the legacy `"JUL 2001"` form are also
   accepted.
