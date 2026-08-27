# Comic Frontend Admin Surface (Add / Modify / Delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `comic` media entry type a working admin Add, Modify and Delete surface, so comics can be created, edited and removed from the UI the way every other entry type can.

**Architecture:** The frontend has two kinds of per-type wiring. A handful of *derived* consumers (`endpoints.resource()`, `useFormDefaults`, `buildAutofillPatch`, the status-group maps) read a registry and pick a new type up for free. Everything else is a *hand-written* per-type list or `if` branch, and silently omits a type that is not added to it. This plan adds the registry entries first, then walks the hand-written surfaces one page at a time. Comic mirrors **Novel** everywhere a template is needed — Novel is the most recently added type and uses the current conventions.

**Tech Stack:** React 18, Vite, Tailwind CSS v4, vitest. Native `fetch()` against `/api/comic`.

**Spec:** `docs/superpowers/specs/2026-08-26-comic-media-entry-design.md` (the "Frontend" section)

**Backend prerequisite (already shipped):** `/api/comic` CRUD, the `comic` registry entry, hierarchy resolution, options extraction and Sheets wiring landed in commits `f5f0bfd..615326b`. No backend change is needed by this plan.

## Global Constraints

- Frontend source is `frontend/src`. Run the dev server with `cd frontend && npm run dev` (:5173).
- **After any frontend change, run `cd frontend && npm run build`.** Uvicorn on :8000 serves the prebuilt `frontend_dist/` bundle, which only changes when the build runs. Skipping it produces the classic "works on 5173, not on 8000" symptom. `frontend_dist/` is gitignored and never committed.
- Run frontend tests with `cd frontend && npm run test:run` (one-shot).
- **`frontend/src/utils/anime.test.js` fails on `main`** — it imports a `./anime.js` that does not exist. It is pre-existing and unrelated. Do not fix it; just add no new failures.
- **Comic's display name falls back EN → CN → Alt.** Every other entry type in this app leads with CN. `NAMING_CONFIGS.comic` must therefore be ordered `["comic_name_en", "comic_name_cn", "comic_name_alt"]`. Getting this backwards makes every comic in the UI display its Chinese title first, which is wrong for Western comics.
- **Comic has no romaji or JP name field, and no MAL or AniList fields at all.** Comics are manual-entry. Do not add `mal_id`, `mal_link`, `mal_rating`, `mal_rank`, `anilist_link`, `anilist_rating`, or a "Scores" section. Novel's tab components have all of these — they get dropped, not copied.
- **Comic has no `progress_display` field.** Novel uses it as a user-set progress *mode* selector; comic has exactly one mode, issues. Do not copy it.
- Progress is **issues**: `issue_total` and `issue_fin`. Not volumes, not chapters, not arcs.
- `completed_at` is server-managed. It is not a form field and does not appear in `defaultComic()`, any payload, or `fieldMeta`.
- One comic entry is a numbered **run**. `volume_label` is the free-text run designator (`Vol. 5`, `(2018)`, `Legacy`) — it is not a volume count.
- **`publisher_tw`'s options category is `"Distributor TW"`**, the existing shared category — *not* `"Comic Publisher TW"`. This matches the backend's `_COMIC_OPTION_FIELD_MAP` in `app/services/domain/options_extraction.py`. Every other comic category is prefixed `Comic `: `Comic Publisher`, `Comic Imprint`, `Comic Continuity`, `Comic Era`, `Comic Event`, `Comic Writer`, `Comic Artist`.
- `serialization_status` reuses the existing `MANGA_SERIALIZATION_STATUSES` constant — its four values (`連載中`, `停更`, `腰斬`, `完結`) are already exactly comic's. Do not declare a new constant.
- `reading_status` reuses `READING_STATUSES` and defaults to `"Might Read"`. `my_rating` reuses `MY_RATINGS`.
- `is_main_entry` is a **boolean checkbox**, not Novel's `is_main` string select (`本傳`/`外傳`/…). Comic has no `is_main`.
- **Concurrent sessions:** other Claude sessions may be editing this working tree. Stage only the files each task names. Never `git add -A`, never `git checkout --` / `restore` / `stash` / `reset` on shared files. If a file changed under you between reads, re-read it rather than forcing an edit.
- Commit at the end of each task. Do not push; the user pushes.

## Scope

**In scope:** config registration; `ComicAddTab.jsx` and `ComicModifyTab.jsx`; the comic branches in `Add.jsx`, `Modify.jsx` and `Delete.jsx`; and threading `allComics` into `FranchiseModifyTab`, `SeriesModifyTab` and `Fav3x3ModifyTab` so their pickers and 3x3 cover grids see comics.

**Out of scope, by explicit decision:** the comic detail page, `ComicNotes.jsx`, the library page, nav links, universal search (`useGlobalMediaSearch.js`), `MediaCard`, `GroupedEntryPage`, the tier pages, the meme/quote owner pickers, and Admin.jsx's Data Control Fill/Replace/Pull dropdowns. Also out of scope: `ReviewQueue.jsx`, `DataHistory.jsx`, and the remarks modal. These are separate passes.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `frontend/src/config/mediaRegistry.js` | comic's endpoint/nav/status metadata — the derived source of truth | 1 |
| `frontend/src/config/mediaTypeColors.js` | comic's chip/dot colour | 1 |
| `frontend/src/config/namingConfigs.js` | comic's **EN-first** name field order | 1 |
| `frontend/src/config/adminTabs.js` | the Comic tab in the admin tab bar | 1 |
| `frontend/src/config/fieldOptions.js` | `COMIC_TYPES` | 1 |
| `frontend/src/config/formFactories.js` | `defaultComic()` — the field-key source of truth | 1 |
| `frontend/src/config/formFields/fieldMeta.js` | comic labels/controls/groups + autofill field list | 1 |
| `frontend/src/lib/status.js` | comic joins the reading-button branch | 1 |
| `frontend/src/pages/add-tabs/ComicAddTab.jsx` | presentational Add form | 2 |
| `frontend/src/pages/admin/Add.jsx` | comic state, autofill, `submitComic()`, render | 2 |
| `frontend/src/pages/modify-tabs/ComicModifyTab.jsx` | presentational Modify form | 3 |
| `frontend/src/pages/admin/Modify.jsx` | `comicToForm()`, `saveComic()`, ribbon, render | 3 |
| `frontend/src/pages/admin/Delete.jsx` | comic tab, delete branch, orphan counts | 4 |
| `frontend/src/pages/modify-tabs/FranchiseModifyTab.jsx` | comic in the per-type cover picker | 5 |
| `frontend/src/pages/modify-tabs/SeriesModifyTab.jsx` | comic in the series entry list | 5 |
| `frontend/src/pages/modify-tabs/Fav3x3ModifyTab.jsx` | comic entries in the 3x3 grids | 5 |
| `docs/admin-forms.md`, `docs/pages.md`, `docs/reusable-elements.md` | document the comic admin surface | 6 |

## The comic field set

This table is the contract for Tasks 1–3. Every field key is **identical to its backend column name** — that is the house rule for every existing type. `group` values come from the fixed `GROUP_ORDER` vocabulary in `fieldMeta.js`.

| Field key | Control | Group | Options / notes |
| --- | --- | --- | --- |
| `comic_name_en` | text | Names | primary name — listed first |
| `comic_name_cn` | text | Names | |
| `comic_name_alt` | text | Names | |
| `franchise_id` / `franchise_text` | ComboBox (`allowNew`) | Relations | from `COMMON_FIELD_META` |
| `series_id` / `series_text` | ComboBox (`allowNew`) | Relations | from `COMMON_FIELD_META` |
| `volume_label` | text | Classification | free text run designator |
| `comic_type` | select | Classification | `COMIC_TYPES` |
| `continuity` | tags | Classification | category `Comic Continuity` |
| `era` | tags | Classification | category `Comic Era` |
| `events` | tags (multi) | Classification | category `Comic Event`, comma-joined on submit |
| `serialization_status` | select | Status | `MANGA_SERIALIZATION_STATUSES` |
| `reading_status` | select | Status | `READING_STATUSES`, default `Might Read` |
| `my_rating` | select | Status | `MY_RATINGS` |
| `issue_total` | number | Progress | null means unknown/ongoing |
| `issue_fin` | number | Progress | defaults to 0 |
| `writer` | tags | Credits | category `Comic Writer` |
| `artist` | tags | Credits | category `Comic Artist` |
| `publisher` | tags | Credits | category `Comic Publisher` |
| `imprint` | tags | Credits | category `Comic Imprint` |
| `publisher_tw` | tags | Credits | category **`Distributor TW`** |
| `release_year` | number | Release | from `COMMON_FIELD_META` |
| `end_year` | number | Release | from `COMMON_FIELD_META` |
| `is_main_entry` | checkbox | Derivation | main line vs spinoff |
| `read_order` | number | Derivation | from `COMMON_FIELD_META` |
| `source_other` | repeater | Sources | `[{name, url}]` in the form, object in the payload |
| `read_next` | checkbox | Flags | from `COMMON_FIELD_META` |
| `to_reread` | checkbox | Flags | from `COMMON_FIELD_META` |
| `cover_image_file` | text | Media | from `COMMON_FIELD_META` |
| `remark` | textarea | Notes | from `COMMON_FIELD_META` |

**Ruling on `read_next` / `to_reread`:** the design spec says these get "no UI in this pass". That refers to the Plan-to-Read / Read-Next *pages*, which remain out of scope. They still get form checkboxes here, exactly as Novel has them — the columns exist, `to_reread` is a backend list filter, and omitting the checkboxes would make comic the only type whose flags cannot be set.

---

### Task 1: Config registration

**Files:**
- Modify: `frontend/src/config/mediaRegistry.js`
- Modify: `frontend/src/config/mediaTypeColors.js`
- Modify: `frontend/src/config/namingConfigs.js`
- Modify: `frontend/src/config/adminTabs.js`
- Modify: `frontend/src/config/fieldOptions.js`
- Modify: `frontend/src/config/formFactories.js`
- Modify: `frontend/src/config/formFields/fieldMeta.js`
- Modify: `frontend/src/lib/status.js`
- Test: `frontend/src/api/endpoints.test.js`, `frontend/src/lib/autofill.test.js`

**Interfaces:**
- Produces: `MEDIA_CONFIG.comic`, `NAMING_CONFIGS.comic`, `defaultComic()` exported from `config/formFactories.js`, `FORM_FACTORIES.comic`, `TYPE_FIELD_META.comic`, `BUILTIN_AUTOFILL.comic`, `COMIC_TYPES`. Tasks 2–5 consume all of these.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/api/endpoints.test.js`, add `comic` to the `cases` object in the `resource() endpoints (derived from MEDIA_CONFIG)` describe block, next to the `novel` line:

```js
  comic: "/api/comic",
```

In `frontend/src/lib/autofill.test.js`, add this test next to the existing `"copies the novel field set, including type"` test. Match the surrounding file's helper style — if it uses a `patchFor(source, type)` helper, use it rather than calling `buildAutofillPatch` directly:

```js
  it("copies the comic field set, leading with the EN name", () => {
    const source = {
      comic_name_en: "Amazing Spider-Man",
      comic_name_cn: "蜘蛛人",
      comic_name_alt: "ASM",
      franchise_id: "f-1",
      series_id: "s-1",
      publisher: "Marvel",
      imprint: "Marvel Knights",
      continuity: "Earth-616",
      era: "Modern",
      issue_fin: 74,
    };

    const patch = patchFor(source, "comic");

    expect(patch.comic_name_en).toBe("Amazing Spider-Man");
    expect(patch.comic_name_cn).toBe("蜘蛛人");
    expect(patch.publisher).toBe("Marvel");
    expect(patch.continuity).toBe("Earth-616");
    // Progress is never copied from another entry.
    expect(patch.issue_fin).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm run test:run`
Expected: FAIL — the endpoints case fails because `MEDIA_CONFIG.comic` is undefined, and the autofill test fails because `BUILTIN_AUTOFILL.comic` does not exist.

- [ ] **Step 3: Register the media type**

In `frontend/src/config/mediaRegistry.js`, add after the `novel` line (keep the column alignment of the surrounding literal):

```js
  comic:         { statusField: "reading_status",  apiEndpoint: "/api/comic",       navPath: "/comic",        statusType: "read"  },
```

In `frontend/src/config/mediaTypeColors.js`, add after the `novel` line:

```js
  comic: { chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
```

The file's header comment says "one colour per media type, for anywhere seven types share a view" — change `seven` to `eight`.

In `frontend/src/config/namingConfigs.js`, add after the `novel` block. **Note the EN-first order — this is deliberate and unique to comic:**

```js
  // EN first: Western comics are known by their English titles. Every other
  // type leads with CN.
  comic: ["comic_name_en", "comic_name_cn", "comic_name_alt"],
```

In `frontend/src/config/adminTabs.js`, add to `ADMIN_TABS` after the `novel` entry:

```js
  {
    key: "comic",
    group: "entries",
    icon: "fa-mask",
    label: "Comic Entry",
  },
```

- [ ] **Step 4: Add the type option list**

In `frontend/src/config/fieldOptions.js`, add next to `NOVEL_TYPES`:

```js
export const COMIC_TYPES = ["Ongoing", "Limited", "One-Shot", "Annual"];
```

Do **not** add a comic serialization-status constant. `MANGA_SERIALIZATION_STATUSES` (line 61) is already exactly `["連載中", "停更", "腰斬", "完結"]`, which is comic's list.

- [ ] **Step 5: Add the form factory**

In `frontend/src/config/formFactories.js`, add after `defaultNovel`:

```js
export const defaultComic = () => ({
  comic_name_en: "",
  comic_name_cn: "",
  comic_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  volume_label: "",
  comic_type: "",
  publisher: "",
  imprint: "",
  continuity: "",
  era: "",
  events: [],
  serialization_status: "",
  reading_status: "Might Read",
  issue_total: "",
  issue_fin: "",
  my_rating: "",
  writer: "",
  artist: "",
  release_year: "",
  end_year: "",
  publisher_tw: "",
  is_main_entry: false,
  read_order: "",
  source_other: [],
  read_next: false,
  to_reread: false,
  cover_image_file: "",
  remark: "",
});
```

`events` is an array in the form (the MultiSelect works on arrays) and is comma-joined into a string when the payload is built in Tasks 2 and 3. `completed_at` is deliberately absent — it is server-managed, like `created_at`/`updated_at`, which no `defaultXxx()` factory carries either.

Then add to the `FORM_FACTORIES` object, after the `novel: defaultNovel,` line:

```js
  comic: defaultComic,
```

- [ ] **Step 6: Add the field metadata**

In `frontend/src/config/formFields/fieldMeta.js`, import `COMIC_TYPES` and `MANGA_SERIALIZATION_STATUSES` alongside the existing `config/fieldOptions` imports (`MANGA_SERIALIZATION_STATUSES` may already be imported for the manga block — check before adding a duplicate).

Add this block to `TYPE_FIELD_META`, after the `novel` block:

```js
  comic: {
    // EN leads: Western comics are known by their English titles.
    comic_name_en: { label: "Name (EN)", group: "Names" },
    comic_name_cn: { label: "Name (CN)", group: "Names" },
    comic_name_alt: { label: "Name (Alt)", group: "Names" },
    // The run designator: "Vol. 5", "(2018)", "Legacy". Free text — Marvel
    // run labels are not consistently numbered.
    volume_label: { label: "Volume Label", group: "Classification" },
    comic_type: {
      label: "Comic Type",
      control: "select",
      options: COMIC_TYPES,
      group: "Classification",
    },
    continuity: {
      label: "Continuity",
      control: "tags",
      optionsCategory: "Comic Continuity",
      group: "Classification",
    },
    era: {
      label: "Era",
      control: "tags",
      optionsCategory: "Comic Era",
      group: "Classification",
    },
    events: {
      label: "Events",
      control: "tags",
      optionsCategory: "Comic Event",
      group: "Classification",
    },
    serialization_status: {
      label: "Serialization Status",
      control: "select",
      options: MANGA_SERIALIZATION_STATUSES,
      group: "Status",
    },
    issue_total: {
      label: "Total Issues",
      control: "number",
      group: "Progress",
    },
    issue_fin: {
      label: "Issues Finished",
      control: "number",
      group: "Progress",
    },
    writer: {
      label: "Writer",
      control: "tags",
      optionsCategory: "Comic Writer",
      group: "Credits",
    },
    artist: {
      label: "Artist",
      control: "tags",
      optionsCategory: "Comic Artist",
      group: "Credits",
    },
    publisher: {
      label: "Publisher",
      control: "tags",
      optionsCategory: "Comic Publisher",
      group: "Credits",
    },
    imprint: {
      label: "Imprint",
      control: "tags",
      optionsCategory: "Comic Imprint",
      group: "Credits",
    },
    // Reuses the shared TW distributor category, not a comic-specific one —
    // this matches the backend's _COMIC_OPTION_FIELD_MAP.
    publisher_tw: {
      label: "Publisher TW",
      control: "tags",
      optionsCategory: "Distributor TW",
      group: "Credits",
    },
  },
```

`is_main_entry`, `read_order`, `release_year`, `end_year`, `reading_status`, `my_rating`, `franchise_id`, `series_id`, `source_other`, `read_next`, `to_reread`, `cover_image_file` and `remark` all come from `COMMON_FIELD_META` and need no comic override. Verify that `is_main_entry` is present in `COMMON_FIELD_META` with `control: "checkbox"` — the anime block uses it. If it is only defined under `TYPE_FIELD_META.anime`, copy that definition into comic's block rather than moving anime's.

Then add to `BUILTIN_AUTOFILL`, after the `novel` array:

```js
  comic: [
    "comic_name_en",
    "comic_name_cn",
    "comic_name_alt",
    "franchise_id",
    "series_id",
    "publisher",
    "imprint",
    "continuity",
    "era",
    "comic_type",
  ],
```

- [ ] **Step 7: Join the reading-status branch**

In `frontend/src/lib/status.js`, change `getCardStatusConfig`:

```js
export function getCardStatusConfig(type, status) {
  if (type === "manga" || type === "novel" || type === "comic")
    return getReadingButtonConfig(status);
  return getStatusButtonConfig(status);
}
```

Without this, comic status buttons render with the watching vocabulary ("Watching", "Plan to Watch") instead of the reading one.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd frontend && npm run test:run`
Expected: PASS, including both new cases. The only failure should be the pre-existing `utils/anime.test.js`.

- [ ] **Step 9: Build and commit**

```bash
cd frontend && npm run build && cd ..
git add frontend/src/config/mediaRegistry.js frontend/src/config/mediaTypeColors.js frontend/src/config/namingConfigs.js frontend/src/config/adminTabs.js frontend/src/config/fieldOptions.js frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/status.js frontend/src/api/endpoints.test.js frontend/src/lib/autofill.test.js
git commit -m "feat(comic): register the comic media type in frontend config"
```

---

### Task 2: Comic Add tab

**Files:**
- Create: `frontend/src/pages/add-tabs/ComicAddTab.jsx`
- Modify: `frontend/src/pages/admin/Add.jsx`

**Interfaces:**
- Consumes: `defaultComic` and `FORM_FACTORIES.comic` (Task 1), `BUILTIN_AUTOFILL.comic` (Task 1).
- Produces: a working `POST /api/comic/`. Task 3's `saveComic()` mirrors this task's payload builder exactly — the two must agree field for field.

**Template:** `frontend/src/pages/add-tabs/NovelAddTab.jsx` and `Add.jsx`'s `submitNovel()`. Read both in full before starting. `ComicAddTab.jsx` is **purely presentational** — it holds no state; every piece of state and every handler arrives as a prop from `Add.jsx`. Follow that split exactly.

- [ ] **Step 1: Create the tab component**

Create `frontend/src/pages/add-tabs/ComicAddTab.jsx`, mirroring `NovelAddTab.jsx`'s structure. It must:

- Re-export the factory so `Add.jsx` can `import ComicAddTab, { defaultComic } from "../add-tabs/ComicAddTab"`:
  ```js
  export { defaultComic } from "../../config/formFactories";
  ```
- Import from `config/fieldOptions`: `COMIC_TYPES`, `MANGA_SERIALIZATION_STATUSES`, `MY_RATINGS`, `READING_STATUSES`. Import `ComboBox`, `MultiSelect` and the form primitives (`CollectionNote`, `Field`, `SectionHeader`, `inputCls`, `selectCls`) from the same paths Novel uses, and `getDisplayName`, `getOptions` from `utils/media`.
- Take the same prop shape Novel's tab takes, renamed for comic: the form object, its setter, the autofill query/open/ref/results/apply set, `franchiseCollections`, `allFranchises`, `seriesItemsForComic`, `allOptions`.
- Render these sections, in this order:
  1. **Auto-fill search box** — same markup as Novel's, searching comic names.
  2. **Titles & Naming** — Franchise ComboBox (`allowNew`), Series ComboBox (`allowNew`), then `comic_name_en`, `comic_name_cn`, `comic_name_alt` **in that order**, then `volume_label` and `comic_type` (select, `COMIC_TYPES`).
  3. **Classification** — `continuity`, `era` (each a `ComboBox` with `allowNew` over `getOptions(allOptions, "Comic Continuity" / "Comic Era")`), and `events` (a `MultiSelect` over `getOptions(allOptions, "Comic Event")`, allowing new values).
  4. **Status** — `serialization_status` (select, `MANGA_SERIALIZATION_STATUSES`), `reading_status` (select, `READING_STATUSES`), `my_rating` (select, `MY_RATINGS`).
  5. **Progress** — `issue_fin` and `issue_total`, both `type="number"`. Label them "Issues Finished" and "Total Issues". Put a hint on `issue_total` that blank means unknown or ongoing.
  6. **Credits** — `writer` and `artist` as `MultiSelect` over `"Comic Writer"` / `"Comic Artist"`; `publisher`, `imprint` and `publisher_tw` as `ComboBox` with `allowNew` over `"Comic Publisher"`, `"Comic Imprint"` and `"Distributor TW"`; `release_year` and `end_year` as number fields.
  7. **Relational & Timeline** — `read_order` (number) and `is_main_entry` (checkbox, labelled "Main line entry (not a spinoff)").
  8. **Sources** — the repeatable `source_other` rows, copied from Novel's implementation.
  9. **Flags** — `read_next` and `to_reread` checkboxes.
  10. **Notes & Other** — `cover_image_file` and `remark`.

Do **not** render: a Scores section, any MAL or AniList field, `progress_display`, a Region field, an `is_main` select, per-volume name repeaters, or a `completed_at` control. Novel has several of these; comic has none of them.

- [ ] **Step 2: Wire the state into Add.jsx**

In `frontend/src/pages/admin/Add.jsx`, mirroring every `novel`/`nvf` occurrence:

1. Import: `import ComicAddTab, { defaultComic } from "../add-tabs/ComicAddTab";`
2. State: `allComics`; the autofill trio `comicFillQuery` / `comicFillOpen` / `comicFillRef`; and `const [cmf, setCmf] = useState(defaultComic());`
3. Setter: `const ucm = (k, v) => setCmf((p) => ({ ...p, [k]: v }));`
4. Initial load: add `/api/comic/?limit=2000` to the existing `Promise.all` batch, destructure it as `comics`, `setAllComics(comics)`, and seed defaults with `setCmf(resolveDefaults("comic", fd))`.
5. Add the click-outside `useEffect` for `comicFillRef`, matching the novel one.
6. Add `comicFillResults`, filtering `allComics` on `comic_name_en`, `comic_name_cn` and `comic_name_alt` against `comicFillQuery`.
7. Add `const applyComicAutofill = makeApply(setCmf, "comic", setComicFillQuery, setComicFillOpen);`
8. Add `seriesItemsForComic`, filtering `allSeries` by `cmf.franchise_id`, mapped to the same `{id, label, searchText}` shape Novel's uses.
9. Add `else if (activeTab === "comic") await submitComic();` to the `handleSubmit()` chain.
10. Render `<ComicAddTab ... />` when `activeTab === "comic"`, passing the props the component declares.

- [ ] **Step 3: Write submitComic()**

Add `submitComic()` next to `submitNovel()`. Copy Novel's structure — validation, franchise auto-create modal, series auto-create modal, missing-option auto-create, payload build, POST, success handling — with these comic differences:

- **Validation:** require an EN **or** CN title (`cmf.comic_name_en || cmf.comic_name_cn`), and require a franchise selected or typed. Novel requires CN or EN; comic is the same check over comic's fields.
- **Franchise auto-create:** pass `franchiseType: "Comic"` to the modal and `franchise_type: "Comic"` in the `POST /api/franchise/` body, with `franchise_name_en: cmf.comic_name_en` and `franchise_name_cn: cmf.comic_name_cn`. `"Comic"` is a valid `FranchiseType` — it shipped in commit `1bf8b89`.
- **Missing-option auto-create:** run it over these seven pairs, using the same `POST /api/options/` + refetch pattern Novel uses for its three:
  `writer` → `"Comic Writer"`, `artist` → `"Comic Artist"`, `publisher` → `"Comic Publisher"`, `imprint` → `"Comic Imprint"`, `continuity` → `"Comic Continuity"`, `era` → `"Comic Era"`, `publisher_tw` → `"Distributor TW"`, plus every value in the `events` array → `"Comic Event"`.
- **Payload:**

```js
const payload = {
  comic_name_en: cmf.comic_name_en || null,
  comic_name_cn: cmf.comic_name_cn || null,
  comic_name_alt: cmf.comic_name_alt || null,
  franchise_id: franchiseId || null,
  series_id: seriesId || null,
  volume_label: cmf.volume_label || null,
  comic_type: cmf.comic_type || null,
  publisher: cmf.publisher || null,
  imprint: cmf.imprint || null,
  continuity: cmf.continuity || null,
  era: cmf.era || null,
  // Comma-joined multi-select, the same idiom as franchise.franchise_type.
  events: Array.isArray(cmf.events)
    ? cmf.events.filter(Boolean).join(", ") || null
    : cmf.events || null,
  is_main_entry: cmf.is_main_entry ?? false,
  writer: cmf.writer || null,
  artist: cmf.artist || null,
  release_year: cmf.release_year !== "" ? parseInt(cmf.release_year, 10) : null,
  end_year: cmf.end_year !== "" ? parseInt(cmf.end_year, 10) : null,
  publisher_tw: cmf.publisher_tw || null,
  issue_total: cmf.issue_total !== "" ? parseInt(cmf.issue_total, 10) : null,
  issue_fin: cmf.issue_fin !== "" ? parseInt(cmf.issue_fin, 10) : 0,
  serialization_status: cmf.serialization_status || null,
  reading_status: cmf.reading_status || freshForm("comic").reading_status,
  read_order: cmf.read_order !== "" ? parseFloat(cmf.read_order) : null,
  my_rating: cmf.my_rating || null,
  source_other:
    cmf.source_other && cmf.source_other.length > 0
      ? Object.fromEntries(
          cmf.source_other
            .filter((s) => s.name)
            .map((s) => [s.name, s.url || ""]),
        )
      : null,
  read_next: cmf.read_next ?? false,
  to_reread: cmf.to_reread ?? false,
  cover_image_file: cmf.cover_image_file || null,
  remark: cmf.remark || null,
};
```

Check `submitNovel()`'s actual `source_other` handling before pasting that block and match it — if Novel sends an array, send an array. The rule is "whatever Novel does", because both hit the same JSONB column shape.

- **POST:** `fetch("/api/comic/", { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) })`, matching Novel's exact option set.
- **On success:** `showToast`, `setLastAdded`, `setCmf(freshForm("comic"))`, `setAllComics((prev) => [...prev, created])`.

- [ ] **Step 4: Verify in the browser**

Run `cd frontend && npm run dev`, open the Add page, pick the Comic tab, and create one entry with: an EN name, a franchise name that does not exist yet, a writer, two events, `issue_total` 93 and `issue_fin` 74.

Confirm: the entry saves; the franchise was auto-created with type `Comic`; and the new writer and both events appear in `/api/options/` afterwards. Then reload the page and confirm the entry comes back with its fields intact.

- [ ] **Step 5: Run tests, build, commit**

```bash
cd frontend && npm run test:run && npm run build && cd ..
git add frontend/src/pages/add-tabs/ComicAddTab.jsx frontend/src/pages/admin/Add.jsx
git commit -m "feat(comic): add the comic tab to the admin Add page"
```

---

### Task 3: Comic Modify tab

**Files:**
- Create: `frontend/src/pages/modify-tabs/ComicModifyTab.jsx`
- Modify: `frontend/src/pages/admin/Modify.jsx`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2. `saveComic()`'s payload must match `submitComic()`'s field for field.
- Produces: a working `PATCH /api/comic/{system_id}`.

**Template:** `frontend/src/pages/modify-tabs/NovelModifyTab.jsx`, plus `Modify.jsx`'s `novelToForm()`, `saveNovel()` and `novelRibbonSection`.

**Note on a pre-existing drift:** `NovelModifyTab.jsx` re-declares its own local copies of the option arrays (lines 15–32) instead of importing them from `config/fieldOptions.js`. **Do not replicate that.** `ComicModifyTab.jsx` imports `COMIC_TYPES`, `MANGA_SERIALIZATION_STATUSES`, `READING_STATUSES` and `MY_RATINGS` from `config/fieldOptions` like the Add tab does. Leave Novel's drift alone — fixing it is not this plan's job.

- [ ] **Step 1: Create the tab component**

Create `frontend/src/pages/modify-tabs/ComicModifyTab.jsx`. Same sections, same order, same controls as `ComicAddTab.jsx` from Task 2, with these Modify-specific differences copied from `NovelModifyTab.jsx`:

- Props: `franchiseCollections`, `ccmf`, `ucm`, `allFranchises`, `seriesItemsForComic`, `editingItem`, `ribbonSection`, `allOptions`.
- Render `{ribbonSection}` at the top.
- **No auto-fill search box** — that is an Add-page affordance.
- **No structured-notes section.** Novel's tab ends with `<NovelNotes .../>`; `ComicNotes.jsx` does not exist and is out of scope for this plan. Leave the section out entirely rather than stubbing it.

- [ ] **Step 2: Wire the state into Modify.jsx**

Mirroring every `novel`/`cnvf` occurrence:

1. Import: `import ComicModifyTab from "../modify-tabs/ComicModifyTab";`
2. State: `allComics`, `const [ccmf, setCcmf] = useState({});`, and `const ucm = (k, v) => setCcmf((p) => ({ ...p, [k]: v }));`
3. Initial load: add `/api/comic/?limit=2000` to the batch and `setAllComics(comics)`.
4. Deep-link support: add the `?type=comic&id=...` branch that finds the entry and calls `openEditorWith(cm, "comic", franchises, series)`.
5. `openEditorWith` dispatch: `else if (type === "comic") setCcmf(comicToForm(item, franchises, series));`
6. `handleSave()` dispatch: `else if (editingType === "comic") await saveComic();`
7. `getItemLabel`, the search-results branch and the recent-items branch each get a comic case, matching novel's.
8. `seriesItemsForComic`, keyed off `ccmf.franchise_id`.
9. `comicRibbonSection`, built from `allComics` exactly as `novelRibbonSection` is built from `allNovels`.
10. Render `<ComicModifyTab ... />` when `editingType === "comic"`, and insert `{editingType === "comic" && comicRibbonSection}` where novel's ribbon is inserted.

- [ ] **Step 3: Write comicToForm()**

Add next to `novelToForm()`. It converts an API entry into the form shape — the inverse of the payload builder, so every key in `defaultComic()` must be produced:

```js
function comicToForm(c, allFranchises, seriesList) {
  const f = allFranchises.find((x) => x.system_id === c.franchise_id);
  const s = (seriesList || allSeries).find((x) => x.system_id === c.series_id);
  return {
    comic_name_en: c.comic_name_en || "",
    comic_name_cn: c.comic_name_cn || "",
    comic_name_alt: c.comic_name_alt || "",
    franchise_id: c.franchise_id || null,
    franchise_text: f ? getDisplayName(f, "franchise") : "",
    series_id: c.series_id || null,
    series_text: s ? getDisplayName(s, "series") : "",
    volume_label: c.volume_label || "",
    comic_type: c.comic_type || "",
    publisher: c.publisher || "",
    imprint: c.imprint || "",
    continuity: c.continuity || "",
    era: c.era || "",
    // Stored comma-joined; the MultiSelect works on an array.
    events: c.events
      ? String(c.events)
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [],
    serialization_status: c.serialization_status || "",
    reading_status: c.reading_status || md("comic").reading_status,
    issue_total: c.issue_total ?? "",
    issue_fin: c.issue_fin ?? "",
    my_rating: c.my_rating || "",
    writer: c.writer || "",
    artist: c.artist || "",
    release_year: c.release_year ?? "",
    end_year: c.end_year ?? "",
    publisher_tw: c.publisher_tw || "",
    is_main_entry: c.is_main_entry ?? false,
    read_order: c.read_order ?? "",
    source_other: Array.isArray(c.source_other)
      ? c.source_other
      : Object.entries(c.source_other || {}).map(([name, url]) => ({
          name,
          url: url || "",
        })),
    read_next: c.read_next ?? false,
    to_reread: c.to_reread ?? false,
    cover_image_file: c.cover_image_file || "",
    remark: c.remark || "",
  };
}
```

Confirm the `md(...)` helper's real name in this file before using it — `novelToForm` calls `md("novel").reading_status`, so use whatever that resolves to.

- [ ] **Step 4: Write saveComic()**

Add next to `saveNovel()`. Same structure as `submitComic()` from Task 2 — franchise/series auto-create, the same seven-plus-events option auto-create, the same payload builder reading `ccmf` instead of `cmf` — but:

- `PATCH /api/comic/${editingItem.system_id}` instead of a POST.
- On success: update the entry in `allComics` in place, `setEditingItem(updated)`, and re-derive the form via `setCcmf(comicToForm(updated, allFranchises, allSeries))`.
- Match `saveNovel()`'s null-vs-zero convention for numeric fields — Novel's PATCH builder uses `null` fallbacks where the POST builder uses `0`. Read both before writing, and follow the PATCH one. The single exception is `issue_fin`, which is NOT NULL in the database and must fall back to `0`, never `null`.

- [ ] **Step 5: Verify in the browser**

With the dev server running, open the Modify page, pick the Comic tab, and open the entry created in Task 2. Confirm every field prefills with what was saved — in particular that `events` shows as two separate chips, not one string. Change `issue_fin`, add an event, save, and reload; confirm both changes persisted and that the new event reached `/api/options/`.

Then confirm the franchise ribbon at the top lists the other comics in that franchise, and that clicking one switches the editor to it.

- [ ] **Step 6: Run tests, build, commit**

```bash
cd frontend && npm run test:run && npm run build && cd ..
git add frontend/src/pages/modify-tabs/ComicModifyTab.jsx frontend/src/pages/admin/Modify.jsx
git commit -m "feat(comic): add the comic tab to the admin Modify page"
```

---

### Task 4: Comic Delete tab

**Files:**
- Modify: `frontend/src/pages/admin/Delete.jsx`

**Interfaces:**
- Consumes: `MEDIA_CONFIG.comic` and the `comic` admin tab (Task 1).
- Produces: comic deletion with the orphan-series and orphan-franchise cleanup options the other entry types have.

**Template:** every `novel` occurrence in this file. There are nine distinct sites; the list below is exhaustive.

- [ ] **Step 1: Add the display-title branch**

In `getDisplayTitle()`, add before the fallback. **EN first**, matching comic's display-name rule:

```js
  if (type === "comic")
    return (
      item.comic_name_en ||
      item.comic_name_cn ||
      item.comic_name_alt ||
      "Unknown"
    );
```

- [ ] **Step 2: Add the state and data load**

1. Add `comic: []` to the `db` state initializer, next to `novel: []`.
2. Add `const [selectedComic, setSelectedComic] = useState(null);`
3. In `loadDb()`, add `/api/comic/` to the fetch batch, destructure it, and set it into `db` as `comic: cm`.
4. Add `setSelectedComic(null)` to the tab-switch reset list.

- [ ] **Step 3: Add the delete branch**

In the delete-execution function, add this before the generic fall-through path, mirroring the novel block exactly:

```js
  if (type === "comic") {
    const res = await fetch(`/api/comic/${item.system_id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to delete comic");
    if (orphanSeriesChecked && item.series_id) {
      await fetch(`/api/series/${item.series_id}`, {
        method: "DELETE",
        credentials: "include",
      });
    }
    if (orphanFranchiseChecked && item.franchise_id) {
      await fetch(`/api/franchise/${item.franchise_id}`, {
        method: "DELETE",
        credentials: "include",
      });
    }
    setSelectedComic(null);
    showToast("success", "Deletion successful");
    await loadDb();
    setModal(null);
    return;
  }
```

- [ ] **Step 4: Add comic to the orphan counts**

Four sites, each currently counting novels:

1. The franchise-delete count: add `db.comic.filter((c) => c.franchise_id === fid).length` to the total, and a comic row to the per-type breakdown.
2. The series-delete count: add `db.comic.filter((c) => c.series_id === sid).length` the same way. Comic belongs in the series counts alongside anime, manga and novel — it is a series-bearing type.
3. The orphan-series warning block that reads `db.novel` — add the `db.comic` equivalent.
4. The orphan-franchise warning block that reads `db.novel` — same.

Missing any of these makes the confirmation dialog under-report what a franchise or series deletion will affect, which is how a user loses data they did not know was there.

- [ ] **Step 5: Add the tab render block**

Copy the novel tab block (the one under the `// NOVEL TAB` comment): a search box filtering `db.comic` by the three comic name fields, and a selected-entry detail card. In the detail card show: display name, `volume_label`, `comic_type`, `publisher`, `reading_status`, and `issue_fin` / `issue_total` as `74 / 93 ISSUES`. Wire it to `selectedComic` / `setSelectedComic`.

- [ ] **Step 6: Verify in the browser**

Confirm: the Comic tab lists the entry from Task 2; searching by its EN name finds it; and the delete confirmation names it correctly. Delete a throwaway comic with both orphan checkboxes ticked and confirm its franchise and series went with it. Then create a franchise holding one comic and confirm the franchise-delete dialog reports that comic in its count.

- [ ] **Step 7: Run tests, build, commit**

```bash
cd frontend && npm run test:run && npm run build && cd ..
git add frontend/src/pages/admin/Delete.jsx
git commit -m "feat(comic): add the comic tab to the admin Delete page"
```

---

### Task 5: Comic in the Modify page's structure sub-tabs

**Files:**
- Modify: `frontend/src/pages/modify-tabs/FranchiseModifyTab.jsx`
- Modify: `frontend/src/pages/modify-tabs/SeriesModifyTab.jsx`
- Modify: `frontend/src/pages/modify-tabs/Fav3x3ModifyTab.jsx`
- Modify: `frontend/src/pages/admin/Modify.jsx` (thread the `allComics` prop)

**Interfaces:**
- Consumes: `allComics` from `Modify.jsx` (Task 3).
- Produces: comics visible in the franchise cover picker, the series entry list, and the Fav 3x3 grids.

These three components each take an `allNovels`-style prop per media type and merge them into one list tagged with `_type`. Comic is missing from all three, so a franchise's comics are invisible in its cover picker and a comic can never be chosen for a 3x3 grid. This is the same hand-written-list failure mode that produced real bugs in the backend pass.

- [ ] **Step 1: FranchiseModifyTab**

1. Add `Comic: ["comic"]` to the `TYPE_TO_ENTRY_TYPES` map. Without it, a Comic-type franchise's per-type 3x3 cover picker falls back to showing all franchise entries regardless of type.
2. Add an `allComics` prop.
3. Add `...(allComics || []).map((e) => ({ ...e, _type: "comic" }))` to the combined-entries spread, next to the novel one.
4. Add `allComics` to the dependency array of whichever `useMemo`/`useEffect` builds that list.

- [ ] **Step 2: SeriesModifyTab**

Add the `allComics` prop and the matching `_type: "comic"` spread, mirroring the `allNovels` handling. Add it to the relevant dependency array.

- [ ] **Step 3: Fav3x3ModifyTab**

1. Add the `allComics` prop, the `_type: "comic"` spread, and `allComics` to the dependency array.
2. Add a favourite-franchise row for comic to the hardcoded row list, matching the existing shape: `{ title: "Favorite Comic Franchise", typeKey: "Comic", forType: "Comic" }`.

- [ ] **Step 4: Thread the prop from Modify.jsx**

Pass `allComics={allComics}` to all three components where they are rendered in `Modify.jsx`, next to the existing `allNovels={allNovels}`.

- [ ] **Step 5: Verify in the browser**

Open Modify → Franchise, pick the Comic-type franchise created in Task 2, and confirm its comic entry appears in the cover picker and that the picker is not showing unrelated entry types. Then open the Fav 3x3 tab and confirm a comic can be picked for a grid slot.

- [ ] **Step 6: Run tests, build, commit**

```bash
cd frontend && npm run test:run && npm run build && cd ..
git add frontend/src/pages/modify-tabs/FranchiseModifyTab.jsx frontend/src/pages/modify-tabs/SeriesModifyTab.jsx frontend/src/pages/modify-tabs/Fav3x3ModifyTab.jsx frontend/src/pages/admin/Modify.jsx
git commit -m "feat(comic): show comics in the franchise, series and 3x3 modify tabs"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/admin-forms.md`
- Modify: `docs/pages.md`
- Modify: `docs/reusable-elements.md` (only if it enumerates media types)

**Interfaces:**
- Consumes: everything built in Tasks 1–5. No code changes.

Document what the code actually does, not what this plan says it should. Read the files you are describing before writing.

- [ ] **Step 1: Document the comic admin forms**

In `docs/admin-forms.md`, add a comic section mirroring the novel one: the Add tab's sections and prefill behaviour, the franchise/series auto-create modal flow, the seven system-option categories that auto-create on submit (`Comic Writer`, `Comic Artist`, `Comic Publisher`, `Comic Imprint`, `Comic Continuity`, `Comic Era`, `Comic Event`) plus the shared `Distributor TW`, the Modify tab's prefill, and the Delete tab's orphan-cleanup options.

Call out the three things a reader would otherwise get wrong:
- the EN → CN → Alt naming order, unique to comic;
- `events` is an array in the form and a comma-joined string in the payload;
- comic has no MAL/AniList fields, no Scores section, and no `progress_display`, because comics are manual-entry.

- [ ] **Step 2: Document the pages**

In `docs/pages.md`, add comic to the admin Add/Modify/Delete page descriptions wherever the media types are enumerated. State plainly that the comic **detail**, **notes** and **library** pages do not exist yet and are a separate pass — a reader should not go looking for them.

- [ ] **Step 3: Check for stale counts**

Grep all three docs for phrases like "seven media types", "seven entry types" and "the seven tabs". Comic makes them wrong. Correct every occurrence that describes the current state; leave alone anything that is accurate past-tense history. This exact class of staleness was a review finding in the backend pass — catching it here costs a grep.

- [ ] **Step 4: Commit**

```bash
git add docs/admin-forms.md docs/pages.md docs/reusable-elements.md
git commit -m "docs: describe the comic admin add, modify and delete surface"
```

---

## What This Plan Does Not Cover

Deliberately excluded, each a separate pass: the comic detail page (`Comic.jsx`), `ComicNotes.jsx`, the library page (`LibraryComic.jsx`), `App.jsx` routes, nav links and badges, `useGlobalMediaSearch.js`, `MediaCard.jsx`, `GroupedEntryPage.jsx`, `MemeOwnerPicker.jsx`, `QuoteEntryPicker.jsx`, the three tier pages (`FranchisePage`, `SeriesPage`, `CollectionPage`), Admin.jsx's Data Control Fill/Replace/Pull dropdowns and remarks modal, `ReviewQueue.jsx`, and `DataHistory.jsx`.

Also still open from the backend pass, and worth settling before `ComicNotes.jsx` is written: comic currently inherits only the generic note sections, with no highlight section, while manga has `highlight_episodes` and novel has `highlight_passages`.
