# Manga Admin Forms — Step 5 Design

**Date:** 2026-05-05  
**Scope:** Add / Modify / Delete admin tabs for Manga entries  
**Files changed:** `frontend/src/pages/Add.jsx`, `Modify.jsx`, `Delete.jsx`  
**Reference pattern:** Cartoon tab (most recent prior implementation)

---

## 1. Add.jsx — Manga Tab

### State additions

| Addition | Purpose |
|---|---|
| `allMangas` state | Feed autofill search |
| `mangaFillQuery / mangaFillOpen / mangaFillRef` | Autofill dropdown state |
| `mgf` form object via `useState(defaultManga())` | Manga form fields |
| `umg(k, v)` updater | `setMgf(p => ({ ...p, [k]: v }))` |

`defaultManga()` factory:

```js
{
  manga_name_cn: "", manga_name_en: "", manga_name_roman: "",
  manga_name_jp: "", manga_name_alt: "",
  franchise_id: null, franchise_text: "",
  series_id: null, series_text: "",
  region: "",
  serialization_status: "",
  reading_status: "Might Read",
  is_main: "本傳",
  vol_total: "", vol_fin: "", vol_fin_page: "",
  ch_total: "", ch_fin: "",
  my_rating: "",
  mal_rating: "", mal_rank: "", anilist_rating: "",
  author_plot: "", author_draw: "",
  release_year: "", end_year: "",
  anime_studio: "", serialization_platform: "", distributor_tw: "",
  derive_related: "",
  prequel_id: null, sequel_id: null, watch_order: "",
  mal_id: "", mal_link: "", anilist_link: "",
  source_other: [],
  read_next: false, to_reread: false,
  cover_image_file: "", remark: "",
}
```

### Data loading

Add `fetch("/api/manga/", { credentials: "include" })` to the existing `Promise.all` in `useEffect`. Store result in `allMangas`.

### Autofill search

`mangaFillResults` — filter `allMangas` by any of the 5 name fields matching `mangaFillQuery`.

`applyMangaAutofill(manga)` — prefills: franchise, series, all 5 name fields, region, is_main. Clears query/open.

### Tab dispatch

Add `else if (activeTab === "manga") await submitManga()` in `handleSubmit`.

Reset: `setMgf(defaultManga())` after successful submit.

### `submitManga()` logic

1. Validate: at least one of CN or EN name is filled; franchise text/id present.
2. If no `franchise_id` and franchise text typed → show `FranchiseCreateModal` (type=`ACG`). Names taken from manga name fields (not the franchise_text typed value). On confirm: `POST /api/franchise/`.
3. If no `series_id` and series text typed → show `CreateNewEntityModal`. On confirm: `POST /api/series/` using manga name fields.
4. Build payload (all fields, numeric casting for integers, boolean for derive_related, source_other as `{name: url}` dict or null).
5. `POST /api/manga/` → on success: show toast, reset form, append to `allMangas`.
   - The replace pipeline (`execute_replace_single_manga`) is auto-triggered server-side on POST.

### Form sections (JSX)

Rendered when `activeTab === "manga"`:

| Section | Fields |
|---|---|
| **Titles & Naming** | Franchise (ComboBox, ACG filter), Series (ComboBox, filtered by franchise), Manga Name CN, Manga Name EN, Manga Name Alt (row), Manga Name Roman, Manga Name JP (row), Region (select), Is Main (select) |
| **Status** | Serialization Status (select: —/連載中/停更/腰斬/完結), Reading Status (select: all 9 values), My Rating (select) |
| **Progress** | Ch Total, Ch Fin (row), Vol Total, Vol Fin, Vol Fin Page (row) |
| **Scores** | MAL Rating, MAL Rank, AniList Rating (row) |
| **Authors & Production** | Author Plot, Author Draw (row), Release Year, End Year (row), Anime Studio, Serialization Platform, Distributor TW (row) |
| **Relational & Timeline** | Derive Related (select Yes/No/—), Prequel ID, Sequel ID (row, UUID inputs), Watch Order (number) |
| **Source & Links** | MAL ID, MAL Link, AniList Link (row), Source Other (name+URL pairs with add/remove) |
| **Flags** | Read Next (checkbox), To Reread (checkbox) |
| **Notes & Other** | Cover Image File, Remark (textarea) |

---

## 2. Modify.jsx — Manga Tab

### State additions

| Addition | Purpose |
|---|---|
| `allMangas` state | List + sibling ribbon + search results |
| `cmgf` form object | Manga modify form |
| `umg(k, v)` updater | Same pattern as `uc` for cartoon |

### `mangaToForm(m, allFranchises, seriesList)`

Maps all manga model fields to form state strings. Mirrors `cartoonToForm`. Handles:
- `derive_related`: boolean → `"true"` / `"false"` / `""`
- `source_other`: object-to-array conversion (`{name, url}` pairs)
- Numeric fields (vol_total, ch_total, etc.): `?? ""` for null safety
- `notes`: `m.notes || {}`

### `openEditorWith` addition

Add `else if (type === "manga") setCmgf(mangaToForm(item, franchises, series))`.

### `getItemLabel` addition

Add `if (type === "manga") return item.manga_name_cn || item.manga_name_en || "Unknown"`.

### Search results addition

When `activeTab === "manga"`: filter `allMangas` by any of 5 name fields matching query.

### Recently Modified section

Add manga to the recently modified list: show `manga_name_cn || manga_name_en || "Unknown"` with franchise fallback, click opens manga editor.

### Deep-link

`urlType === "manga"` → find in `allMangas`, call `openEditorWith(m, "manga", ...)`, set `activeTab("manga")`.

### `saveManga()` logic

1. Same franchise/series modal flow as Add (type=ACG).
2. Build payload from `cmgf` (same field mapping as `submitManga`; include `notes`).
3. `PATCH /api/manga/${editingItem.system_id}`.
4. On success: update `allMangas` list, refresh `cmgf`, call `POST /api/data-control/replace/manga/${updated.system_id}`.
5. Toast success.

### Sibling ribbon (manga)

When `editingType === "manga"` and `cmgf.franchise_id`:
- Filter `allMangas` by `franchise_id === cmgf.franchise_id` and `system_id !== editingItem.system_id`.
- Group by `series_id` (same structure as cartoon ribbon).
- Sort each group by `manga_name_cn || manga_name_en || manga_name_alt`.
- Chips: `manga_name_cn || manga_name_en || manga_name_alt || "Unknown"`.
- Click chip: `openEditor(m, "manga")`.

### Form fields (JSX)

Same sections as Add (all fields present). Additional at bottom:
- **Structured Notes** section: `<MangaNotes manga={{ notes: cmgf.notes, system_id: editingItem?.system_id }} isAdmin={true} onSave={(n) => umg("notes", n)} />`

System ID displayed in the shared form header (line 1705 — already generic, applies to all types).

---

## 3. Delete.jsx — Manga Tab

### TABS array

Add `"manga"` to the `TABS` constant (after `"cartoon"`).

### `getDisplayTitle` addition

```js
if (type === "manga")
  return item.manga_name_cn || item.manga_name_en || item.manga_name_roman ||
         item.manga_name_jp || item.manga_name_alt || "Unknown";
```

### State additions

- `manga: []` in `db` initial state
- `selectedManga` state

### `loadDb` addition

Add `fetch("/api/manga/", { credentials: "include" })` to Promise.all. Store in `db.manga`.

### `executeDelete` addition

```js
if (type === "manga") {
  await fetch(`/api/manga/${item.system_id}`, { method: "DELETE", credentials: "include" });
  if (orphanSeriesChecked && item.series_id)
    await fetch(`/api/series/${item.series_id}`, { method: "DELETE", credentials: "include" });
  if (orphanFranchiseChecked && item.franchise_id)
    await fetch(`/api/franchise/${item.franchise_id}`, { method: "DELETE", credentials: "include" });
  setSelectedManga(null);
  showToast("success", "Deletion successful");
  await loadDb();
  setModal(null);
  return;
}
```

### Manga tab JSX

**SearchBox:** placeholder "Search manga to delete…", items=`db.manga`, type=`"manga"`, onSelect=`setSelectedManga`.  
Search result render: display name (CN fallback) + subtitle (franchise name · reading_status or region).

**Entry info card** (when `selectedManga` is set):
- Cover image (3:4 aspect, fallback SVG)
- Name: `getDisplayTitle(selectedManga, "manga")`
- Secondary: `selectedManga.manga_name_en || "-"`
- Badges: reading_status, region (if set)
- Lines: franchise name, series name (if set), system_id (monospace)
- Buttons: clear (×), Delete (→ `initDelete("manga", selectedManga)`)

### Cascade modal checks

**Orphan series check** (shown when `modal.type === "manga"`):
- Condition: `modal.item.series_id` exists AND `(db.anime.filter(a => a.series_id === modal.item.series_id).length + db.manga.filter(m => m.series_id === modal.item.series_id).length) === 1`
- Checkbox: `orphanSeriesChecked` / `setOrphanSeriesChecked`
- Label: "Last Entry in Series — Delete the orphaned Series too."

**Orphan franchise check** (shown when `modal.type === "manga"`):
- Condition: `modal.item.franchise_id` exists AND the manga is the only entry across all relevant tables in that franchise AND no series exists in that franchise.
- Tables checked: `db.anime`, `db["anime-movie"]`, `db["tv-show"]`, `db.cartoon`, `db.manga` — each filtered by `franchise_id`.
- `db.series` filtered by `franchise_id` must also be 0 (after accounting for the potential series deletion from the series cascade above — use `(db.series.filter(...).length === 0 || orphanSeriesChecked)` to allow franchise delete even if a series would be co-deleted).
- Checkbox: `orphanFranchiseChecked` / `setOrphanFranchiseChecked`
- Label: "Last Entry in Franchise — Delete the orphaned Franchise Hub too."

---

## Cascade Check Logic Details

For the orphan-franchise check with manga, the full condition:

```
modal.type === "manga"
&& modal.item.franchise_id
&& db.anime.filter(a => a.franchise_id === modal.item.franchise_id).length === 0
&& db["anime-movie"].filter(m => m.franchise_id === modal.item.franchise_id).length === 0
&& db["tv-show"].filter(t => t.franchise_id === modal.item.franchise_id).length === 0
&& db.cartoon.filter(c => c.franchise_id === modal.item.franchise_id).length === 0
&& db.manga.filter(m => m.franchise_id === modal.item.franchise_id).length === 1
&& (db.series.filter(s => s.franchise_id === modal.item.franchise_id).length === 0 || orphanSeriesChecked)
```

---

## Not in Scope

- `MangaNotes` component itself (already implemented in Step 4.3)
- API endpoints (already implemented in Steps 1–3)
- Other frontend files (Step 6)
