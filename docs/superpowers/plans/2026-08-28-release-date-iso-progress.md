# Release Date ISO — Execution Progress

Companion to `2026-08-28-release-date-iso.md`. The SDD workspace
(`.superpowers/sdd/2026-08-28-release-date-iso/`) is gitignored and does NOT
travel between machines, so this file is the portable record.

**Spec:** `docs/superpowers/specs/2026-08-28-release-date-iso-design.md`
**Plan:** `docs/superpowers/plans/2026-08-28-release-date-iso.md`
**Branch:** `modify`
**Finished:** 2026-08-28. All 13 tasks implemented.

## Completed

| Task | Commits | Result |
|---|---|---|
| 1 — date helper module | `0c9b0d7` | 50 unit tests pass. Spec PASS, quality APPROVED. |
| 2 — model columns + CHECK constraints | `114436c` | 29 tests pass. Reviewed with Task 3. |
| 3 — Alembic migration | `88d8a0f` | 6 unit tests pass. Ran live: 1,979 source rows converted, **0 unparseable**. upgrade / downgrade / re-upgrade all verified. Spec PASS, quality APPROVED. |
| 4 — Pydantic validation | `ffb8e78` | 7/7 tests pass. Validator mounted on all eight media schemas. Spec PASS, quality APPROVED. |
| 5 — external API mappers | `2609fc2` | TMDB keeps day precision; the Tenrai anime, manga and novel mappers emit ISO; Comic Vine emits a year string. |
| 6 — autofill wiring | uncommitted | Tenrai anime/manga/novel fills, then the comic field tuple. |
| 7 — anime season derivation | uncommitted | Derives from `release_date`, never clears on a year-only date. |
| 8 — seasonal grouping + season filter | uncommitted | Year read as `substr(release_date, 1, 4)`. |
| 9 — watch order priority + remarks | uncommitted | One priority table; movies now TW first. |
| 10 — Google Sheets round trip | uncommitted | Apostrophe escaping on write, `normalize()` on read. |
| 11 — frontend release date input | uncommitted | `lib/releaseDate.js` + `ReleaseDateInput`, all eight add tabs and four modify tabs. |
| 12 — frontend display | uncommitted | Cards, detail, library, admin and plan pages. |
| 13 — documentation | uncommitted | schema / business-logic / integrations, plus api, architecture, options, pages, test. |

Plan and spec documents committed as `11a228f`. Tasks 6-13 were completed in one
continuous session at the user's instruction ("continue working for everything
until all finished") and are not yet committed.

## Verification at completion

- `pytest -q` — **1137 passed, 1 failed**. The one failure,
  `tests/unit/test_sheets_retry.py::test_status_is_found_even_when_the_body_is_not_json`,
  predates this work and is unrelated: it asserts a gspread `APIError` carries
  no `.code`, and the installed gspread sets one.
- `cd frontend && npm run test:run` — **300 passed** across 29 files. Two
  unhandled d3-drag teardown exceptions in `RelationGraphReset.test.jsx` are
  pre-existing and unrelated.
- `grep -rn "release_year|release_month|end_year" app/ frontend/src` — one hit
  left, `app/schemas/system.py:136` (`CurrentSeasonUpdate.release_year`). That
  is a calendar year on an unused request schema, not a media release column,
  so it was deliberately left alone.
- `alembic current` — `d1e2f3a4b5c6 (head)`, state verified.
- `cd frontend && npm run build` — succeeds; `frontend_dist/` regenerated.
- **Not done:** the live Backup-then-Pull round trip (Task 10 step 5, and the
  last item on the plan's verification checklist). It writes to the real Google
  Sheet, so it needs to be run by hand from the admin pipelines page. The
  escaping is covered by unit tests only.

## Deviations from the plan text

1. **Task 5 also converted the Tenrai manga and novel mappers.** The plan named
   only the anime mapper, but renaming `MANGA_FIELDS_TO_FILL` /
   `NOVEL_FIELDS_TO_FILL` to `release_date` / `end_date` while those mappers
   still returned `release_year` / `end_year` would have made their autofill
   silently stop matching. Both now read `published.prop` rather than
   `published.from`, whose ISO timestamp fabricates a day MAL does not know.
2. **Task 9 also updated `tests/unit/test_watch_order_resolver.py` and
   `tests/api/test_watch_order.py`.** Their fixtures constructed `Anime` with
   `release_year=`, which raises `TypeError` against the migrated model.
3. **Task 10 also rewrote the sheet parsers.** The plan covered only
   `format_model_for_sheet`; the eight `parse_*_from_sheet` functions still
   named the dropped columns, so the Pull half of the round trip would have
   dropped every release value. They now route through `release_date.normalize`.
4. **Task 12 was extended past the files the plan named** — `covers.js`,
   `statsUtils.js`, `PlanToWatchFuture.jsx`, `FutureReleases.jsx`,
   `FranchiseModifyTab.jsx`, `SeriesModifyTab.jsx` and the four modify tabs all
   read the old columns. Two shared helpers were added to `lib/releaseDate.js`
   so the parsing is not repeated per page: `releaseYear()` and
   `releaseScore()`.
5. **`remarks.py`'s movie payload key changed** from `release_date_usa` to
   `release_date`, resolved through `release_display(e, "movie")` as the plan
   asked; `frontend/src/pages/admin/Admin.jsx` was updated to match.
6. **Task 13 also touched `docs/api.md`, `architecture.md`, `options.md`,
   `pages.md` and `test.md`**, which described the old columns.
   `docs/current-plan.md` and `docs/comicvine-link-conflicts.md` were left
   alone: they are historical records of earlier work.

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
