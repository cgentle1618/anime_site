# Novel Open Library fill — an anchor-book source for novels MAL does not have — design

Status: awaiting review
Date: 2026-09-05
Branch: modify

## Why

Novel is the only media type whose Fill can be switched off by data. Its
eligibility test is:

```python
fill_eligible=lambda db, e: e.mal_link is not None and has_missing_values_novel(e)
```

(`app/services/pipelines/specs.py:160`, reinforced by the early return at
`app/services/domain/checking.py:197`). A novel with no `mal_link` is not
"filled and up to date" — it is **invisible to Fill entirely**. Nothing in the
UI distinguishes the two.

That is the correct behaviour today, because Tenrai is the only source wired up
and MAL only catalogues Japanese light novels. But `novel.type` spans
`Light Novel`, `Novel`, `Web` and `Other`, and the `Novel` bucket — Western
published books — has no source at all. Every field on those entries is typed
by hand, including the cover.

Open Library closes that gap for exactly that bucket, with no API key.

## Scope

In scope:

1. Two columns on `novel` holding a pasted Open Library **work** URL and the
   work id extracted from it.
2. A keyless Open Library client and mapper, built to the shared client shape.
3. `autofill_novel_from_openlibrary`, writing three things and nothing else:
   `release_date`, `cover_image_file`, and the `author` credit.
4. Per-entry routing in `PIPELINES["novel"]`: `mal_link` → Tenrai as today,
   otherwise `openlibrary_id` → Open Library.
5. Sheets round-trip and the admin form fields for the two new columns.

Out of scope, deliberately:

- **Replace.** `replace_select` stays untouched, so an Open-Library-only novel
  is never selected for bulk Replace. Every write in this design is fill-only,
  so Replace would have nothing to re-fetch that Fill has not already done.
  Revisit when there is a reason to overwrite.
- **Google Books.** See Decision B.
- **Per-volume ids on `novel_unit`.** See Decision C. Cleanly additive later.
- **Publisher.** Novel's only publisher tag is `publisher_tw`, the *Taiwanese*
  publisher; Open Library does not know it. Writing an original publisher would
  need a new `novel_publisher` tag field, which no entry type asks for yet.
- **ISBN, page count, description, subjects.** No columns, and none proposed.
- **A search UI.** Comic Vine has one because its ids are unguessable; an Open
  Library work URL is one browser search away and pastes like `mal_link`.
- **Chinese web novels.** Absent from Open Library (see Probe findings). They
  stay manual, and this design does not pretend otherwise.

## Probe findings

Run live against the API on 2026-09-05; the probe code was throwaway.

With the correct work id supplied — which is what this design does, since the
admin pastes the URL and no title search is ever performed:

| Entry | Truth | `work.first_publish_date` | `search.first_publish_year` | Earliest edition | Author call | Cover |
|---|---|---|---|---|---|---|
| The Great Gatsby | 1925 | absent | 1920 ✗ | **1925 ✓** | ✓ | ✓ |
| Project Hail Mary | 2021 | absent | 2021 ✓ | **2021 ✓** | ✓ | ✓ |
| Mistborn: The Final Empire | 2006 | absent | 2001 ✗ | 2001 ✗ | ✓ | ✓ |
| Overlord vol.1 | 2012 | absent | 2016 ✗ | 2016 ✗ | ✓ | ✓ |

Five facts that shaped the design:

1. **`first_publish_date` is unpopulated** on every work checked. The obvious
   field is not usable; the date must come from the editions list.
2. **Earliest-edition-year beats `first_publish_year`** (Gatsby 1925 vs 1920)
   and never lost. It costs one extra call and is year-precision only.
3. **Both failures are explainable and one is irrelevant.** Overlord is wrong
   because Open Library holds only the English translations, not the 2012
   Japanese original — but Japanese light novels carry `mal_link`, so Tenrai
   claims them and they never reach this code path. Mistborn's 2001 comes from
   a single bad edition record. On the target population — Western books with
   no MAL entry — the probe was 2 for 2.
4. **Chinese web novels are absent.** Searching "Lord of the Mysteries"
   returned an unrelated 1923 detective novel.
5. **`covers` uses `-1` as a "no cover" sentinel** (`OL16044142W` returned
   `[11329782, …, -1, 13302367]`). An unfiltered `covers[0]` will eventually
   download a 404.

Keyless Google Books returned `HTTP 429 — Quota exceeded for quota metric
'Queries' … for consumer 'project_number:624717413613'`: the anonymous quota is
shared and already exhausted from this IP.

## Decisions taken

### Decision A — the stored id is an anchor book, not the entry

One novel entry may cover several books: `Mistborn` is one entry and three
novels. No books API has an identifier for "the Mistborn trilogy as one thing"
— Google Books ids and ISBNs are per-edition, Open Library work ids are
per-book. Any single stored id therefore names **one** book.

This design makes that explicit rather than papering over it. The stored work
id is the entry's **anchor**: book 1, or the only book. Fill writes only the
facts that are true of the whole entry when read off the anchor:

- `release_date` — first publication of book 1 *is* the entry's start date.
- `cover_image_file` — book 1's cover *is* the entry's cover.
- `author` credit — constant across the set.

And it refuses to write the facts the anchor cannot know: `end_date`
(needs the last book), `vol_total_original` (the anchor says 1, the truth is
3), `serialization_status` (no Open Library equivalent).

Rejected: searching by title and merging the result set. Fuzzy matching across
editions, box sets, audiobooks and reprints picks the wrong record silently,
and finding 5 was that Open Library's title search is unreliable even when the
book exists.

### Decision B — Open Library, not Google Books

| | Open Library | Google Books |
|---|---|---|
| `release_date` | earliest edition year — the entry's real start | `publishedDate` of one edition; a Mistborn paperback yields 2015 |
| Key | none | mandatory: the keyless quota is shared and exhausted (HTTP 429, verified) |
| Id stability | work id survives every reprint | volume id is edition-specific |
| Cover | `covers.openlibrary.org/b/id/{id}-L.jpg` | `imageLinks.thumbnail`, small |

Google Books wins on publisher and page count. This design writes neither, so
its advantages are entirely in fields we do not fill, against the cost of a new
`GOOGLE_BOOKS_API_KEY` secret and a hard daily quota.

Open Library's cost is real and accepted: up to three calls per entry instead of
one, and year-precision dates with an occasional wrong year. That is tolerable
because every write is fill-only — a wrong year only ever lands in an empty
column, and the admin can correct it permanently.

### Decision C — anchor now, per-volume ids never ruled out

Rejected for v1: putting a book id on each `novel_unit` volume row, fetching
per unit, and deriving `release_date` = min, `end_date` = max,
`vol_total_original` = count. That is the *correct* model and it would reuse
the units machinery that shipped 2026-09-04.

It is out of scope because it costs a new column on `novel_unit`, N calls per
entry, a fill path for child rows that nothing else in the codebase has, and a
link field per volume in `NovelUnitsEditor` — for an entry shape (multi-book)
that is the minority, and where the anchor already produces the right start
date, author and cover.

The two are additive, not alternatives: the anchor stays the entry-level date
and cover source even after volumes gain their own ids.

### Decision D — year precision, and why that is not a compromise

`release_date` is written as a bare year (`"2006"`). This is the same thing
Comic Vine already does — `start_year` → year-precision `release_date`,
fill-only — so it introduces no new date semantics, and `ck_novel_release_date_iso`
(`^\d{4}(-\d{2}(-\d{2})?)?$`) already accepts it.

### Decision E — fetch only what is missing

Every other client in the repo fetches unconditionally and lets the mapper
discard what it does not need. This one takes flags and makes 1–3 calls.

The reason is payload, not elegance: `editions.json?limit=1000` returned 1000
entries for Gatsby. Because the writes are fill-only, an entry that already has
a `release_date` can never use that response. Making the call conditional drops
the steady-state cost to one call per entry.

The deviation is contained in one function signature and is documented here so
a reader does not mistake it for an oversight.

### Decision F — MAL wins when both ids are present

The two sources never both run on one entry. Tenrai returns strictly more
(`serialization_status`, `end_date`, volume and chapter totals, ratings), so
`mal_link` takes precedence and Open Library fills only where MAL is absent.
This keeps novel's fill path a routing choice, not an orchestration like
`imdb.py`'s TMDB + OMDb merge.

## Schema

Two columns on `novel`, mirroring `comicvine_link` / `comicvine_id`:

| Column | Type | Note |
|---|---|---|
| `openlibrary_link` | `String`, nullable | the pasted work URL |
| `openlibrary_id` | `String`, nullable | `"OL5738148W"` |

`openlibrary_id` is a **String**, unlike `comicvine_id`'s `Integer`, because
the trailing letter is what distinguishes a work (`OL…W`) from an edition
(`OL…M`) or an author (`OL…A`). Storing the integer alone would discard the
only signal that the id names the right kind of thing.

One Alembic revision, single head. No constraint changes.

## Client — `app/services/integrations/openlibrary.py`

Built to the shared shape documented in `docs/external-apis.md`: `requests`,
`timeout=15`, tenacity `stop_after_attempt(5)` with
`wait_exponential(multiplier=1, min=2, max=10)`, retried on
`requests.exceptions.RequestException` and a local `RateLimitExceeded` (HTTP
429). 404 → warning, `None`. 5xx → warning, `None`.

Two differences from its siblings:

- **No API key.** No `_get_api_key`, no 401 branch, and no "environment
  variable is not set" log line. `OPENLIBRARY_USER_AGENT =
  "CG1618-Media-Tracker/1.0"` is mandatory — Open Library throttles generic
  client agents, the same reason Comic Vine and Tenrai set one.
- **Conditional fetching** (Decision E):

```python
fetch_openlibrary_work(work_id, *, want_editions: bool, want_authors: bool)
    -> Optional[dict]   # {"work": …, "editions": [...], "authors": [...]}
```

| Call | When |
|---|---|
| `GET /works/{id}.json` | always — carries `covers` and the author keys |
| `GET /works/{id}/editions.json?limit=1000` | `want_editions` |
| `GET /authors/{OL…A}.json`, at most 3 | `want_authors` |

`OpenLibraryRateLimiter`: a 100-requests-per-60-seconds sliding window, the
same in-memory per-process shape as the others, and inheriting the same known
limitation (it resets on restart and is not shared between instances). Open
Library publishes no hard quota; this is politeness, and `OPENLIBRARY_PAUSE = 1`
in `specs.py` matches `MAL_PAUSE`.

## Mapper — `app/utils/openlibrary_utils.py`

`extract_openlibrary_id(url) -> Optional[str]`

Regex `openlibrary\.org/works/(OL\d+W)`. An edition URL (`/books/OL…M`), an
author URL (`/authors/OL…A`), a bare id, an empty string and `None` all return
`None` — never a wrong id. This mirrors `extract_comicvine_id`, which rejects
`4000-` issue URLs rather than storing them.

`map_openlibrary_to_novel_data(raw) -> dict` returning `release_date`,
`author`, `cover_image_url`:

| Source | Key | Rule |
|---|---|---|
| `editions[].publish_date` | `release_date` | `_earliest_edition_year`: regex `(1[4-9]\d\d\|20\d\d)` over each value, take the min, discard anything after next year, then `app.utils.release_date.normalize`. No editions → `None`. |
| `authors[].name` | `author` | comma-joined, then through the existing `split_names` |
| `work.covers` | `cover_image_url` | first entry that is not `-1` (finding 5) → `https://covers.openlibrary.org/b/id/{id}-L.jpg`. All `-1` or absent → `None`. |

## Autofill — `app/services/domain/autofill.py`

`autofill_novel_from_openlibrary(novel: Novel, db: Session) -> None`. Does not
commit; caller is responsible. Returns immediately when `openlibrary_id` is
falsy. Whole body wrapped in `try / except Exception` with a `logger.error`,
matching every sibling (and inheriting the swallowed-`RetryError` debt already
recorded in `roadmap.md` — this design does not fix it).

| Column | Rule |
|---|---|
| `release_date` | fill-only, year precision |
| `cover_image_file` | fill-only, via `download_cover_image` |
| `author` credit | `replace_credits(db, "novel", id, "author", split_names(…))`, **only when** `credit_names(db, "novel", id, "author")` is empty — identical to the comic writer/artist rule at `autofill.py:481` |
| `end_date`, `vol_total_original`, `ch_total`, `serialization_status`, `mal_rating`, `mal_rank`, every `novel_name_*` | **never touched** (Decision A) |

No `force_replace_ratings` parameter: Open Library has no rating this app
stores. `novel_name_*` is excluded for the same reason Comic Vine never writes
`comic_name_en` — the name is the entry's identity and often a deliberate
shorthand.

The two `want_*` flags are computed here, where the entry is in hand:
`want_editions = not novel.release_date`, `want_authors = not credit_names(…)`.

## Pipeline — `app/services/pipelines/specs.py`

- **`extract_id`** — a new `apply_extract_novel_ids(entry)` in `derivation.py`
  calling `apply_extract_mal_id_manga_novel` then a new
  `apply_extract_openlibrary_id`, returning True if either fired.
  `PipelineSpec.extract_id` takes a single callable, so the two are composed
  rather than listed.
- **`fill_eligible`**:

```python
lambda db, e: (
    (e.mal_link is not None and has_missing_values_novel(e))
    or (
        e.mal_link is None
        and e.openlibrary_id is not None
        and has_missing_values_novel_openlibrary(db, e)
    )
)
```

The `e.mal_link is None` guard on the second branch is load-bearing: eligibility
must match the routing in `fill` exactly. Without it, a novel carrying both ids
whose MAL fields are complete but which has no `author` credit would be reported
eligible, then routed to Tenrai, which does not write author credits — so it
would never become ineligible and would be re-requested on every single run.

- **`fill`** — routes per entry: `mal_link` → `autofill_novel_from_mal` exactly
  as today; else `openlibrary_id` → `autofill_novel_from_openlibrary`
  (Decision F).
- `fill_sleep`, `fill_after`, `single_after`, `post_process` unchanged.
  `replace_select` and `replace` unchanged (Replace is out of scope).

### `has_missing_values_novel_openlibrary(db, novel)` — `checking.py`

True when `release_date` or `cover_image_file` is blank, or when
`_link_missing(db, "novel", novel.system_id, [("credit", "author")])`.

It deliberately does **not** reuse `NOVEL_FIELDS_TO_FILL`, which lists
`serialization_status`, `end_date`, `mal_rating` and `mal_rank` — none of which
Open Library returns. Reusing it would mark every such entry permanently "needs
filling" and re-request it on every run: the exact trap the comment above
`COMIC_FIELDS_TO_FILL` (`app/utils/utils.py:115`) warns about. Two new
constants in `utils.py`:

```python
NOVEL_OPENLIBRARY_FIELDS_TO_FILL = ["release_date", "cover_image_file"]
NOVEL_OPENLIBRARY_LINK_FIELDS_TO_FILL = [("credit", "author")]
```

`has_missing_values_novel` itself is untouched, including its `mal_link` gate —
the gate is now correct rather than limiting, because the OL branch sits beside
it instead of inside it.

## Sheets

`format_model_for_sheet` derives its columns from the model, so Backup picks up
both new columns with no change. Pull needs the two keys added to
`parse_novel_from_sheet` (`app/utils/formatter.py:645`):

```python
"openlibrary_link": parse_from_sheet(raw.get("openlibrary_link"), str),
"openlibrary_id": parse_from_sheet(raw.get("openlibrary_id"), str),
```

Neither is a date column, so the `USER_ENTERED` apostrophe rule does not apply.

## Frontend

The same seven places `comicvine_link` occupies today:

| File | Change |
|---|---|
| `app/schemas/novel.py` | two `Optional[str]` fields |
| `frontend/src/config/formFactories.js` | two empty-string defaults |
| `frontend/src/config/formFields/fieldMeta.js` | labels and help text |
| `frontend/src/pages/add-tabs/NovelAddTab.jsx` | two inputs |
| `frontend/src/pages/admin/Add.jsx` | payload mapping (`\|\| null`) |
| `frontend/src/pages/admin/Modify.jsx` | form hydration and payload mapping |
| `frontend/src/pages/modify-tabs/NovelModifyTab.jsx` | two inputs |

Plus a link row on the novel detail page beside `mal_link` / `anilist_link`.
`openlibrary_id` is derived and shown read-only, as `comicvine_id` is.

Run `cd frontend && npm run build` before calling the frontend done.

## Testing

The failing test to write first, per `CLAUDE.md`:

> **A novel with an `openlibrary_id` and no `mal_link` is Fill-eligible.**
> Today `has_missing_values_novel` returns `False` at `checking.py:197` and the
> entry is invisible to the pipeline.

Then, all with `requests` mocked — no live calls in the suite:

| Area | Cases |
|---|---|
| `extract_openlibrary_id` | work URL → `"OL5738148W"`; edition URL → `None`; author URL → `None`; bare id → `None`; `""` → `None`; `None` → `None` |
| `_earliest_edition_year` | takes the min across editions; discards a year before 1400 and after next year; no editions → `None`; unparseable `publish_date` skipped |
| cover mapping | `-1` sentinel skipped; all-`-1` → `None`; absent `covers` → `None` |
| `autofill_novel_from_openlibrary` | a pre-set `release_date` survives; a pre-set `cover_image_file` survives; an existing `author` credit is not replaced; `end_date` / `vol_total_original` / `serialization_status` untouched; missing id → no call |
| conditional fetch | a populated `release_date` means no editions call; an existing author credit means no author call |
| routing | both ids present → Tenrai runs, Open Library does not |
| client | 404 → `None`; 429 raises `RateLimitExceeded` and is retried; 5xx → `None` |

`pytest`, `ruff`, `vitest` and `eslint` all green before the work is called
done.

## Docs to update

In the same change, each with its `Last verified` line bumped:

- `docs/external-apis.md` — an at-a-glance row, a full Open Library section,
  the "which pipeline calls which service" row for `novel`, and a note in
  Shared behaviour that this client is keyless and fetches conditionally.
- `docs/data-model.md` — the two novel columns.
- `docs/entry-types.md` — the novel Fill row (id extractor and fill function
  are now a pair, not a single value).
- `docs/data-actions.md` — novel Fill now has two branches.
- `docs/roadmap.md` — a Done line.
