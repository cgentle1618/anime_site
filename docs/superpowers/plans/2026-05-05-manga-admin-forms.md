# Manga Admin Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Manga entry tabs to the Add, Modify, and Delete admin pages, following the Cartoon tab as the reference pattern.

**Architecture:** Manga forms mirror the Cartoon implementation: `defaultManga` factory → `mgf`/`cmgf` state → `submitManga`/`saveManga` functions → JSX tab. Delete adds orphan-series cascade (new vs Cartoon). All changes are additive to existing large files; no file is created.

**Tech Stack:** React, Tailwind CSS v4, FastAPI `/api/manga/` endpoints (already implemented in Steps 1–3).

**Spec:** `docs/superpowers/specs/2026-05-05-manga-admin-forms-design.md`

---

## File Map

| File | Change |
|---|---|
| `frontend/src/pages/Add.jsx` | Add `defaultManga`, state, fetch, autofill, `submitManga`, manga tab JSX, tabDef |
| `frontend/src/pages/Modify.jsx` | Add `allMangas`, `cmgf`/`umg`, `mangaToForm`, `saveManga`, sibling ribbon, manga form JSX, tabDef |
| `frontend/src/pages/Delete.jsx` | Add manga to TABS, `db`, `loadDb`, `executeDelete`, tab JSX, cascade modal checks |

---

## Task 1: Add.jsx — State, Data Loading, and Autofill Helpers

**Files:**
- Modify: `frontend/src/pages/Add.jsx`

- [ ] **Step 1.1 — Add `defaultManga` factory after `defaultCartoon` (after line 227)**

```js
const defaultManga = () => ({
  manga_name_cn: "",
  manga_name_en: "",
  manga_name_roman: "",
  manga_name_jp: "",
  manga_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  region: "",
  serialization_status: "",
  reading_status: "Might Read",
  is_main: "本傳",
  vol_total: "",
  vol_fin: "",
  vol_fin_page: "",
  ch_total: "",
  ch_fin: "",
  my_rating: "",
  mal_rating: "",
  mal_rank: "",
  anilist_rating: "",
  author_plot: "",
  author_draw: "",
  release_year: "",
  end_year: "",
  anime_studio: "",
  serialization_platform: "",
  distributor_tw: "",
  derive_related: "",
  prequel_id: null,
  sequel_id: null,
  watch_order: "",
  mal_id: "",
  mal_link: "",
  anilist_link: "",
  source_other: [],
  read_next: false,
  to_reread: false,
  cover_image_file: "",
  remark: "",
});
```

- [ ] **Step 1.2 — Add `allMangas` state after `allCartoons` (line 239)**

```js
const [allMangas, setAllMangas] = useState([]);
```

- [ ] **Step 1.3 — Add manga autofill states after the `tvFillRef` block (after line 264)**

```js
// Manga auto-fill search
const [mangaFillQuery, setMangaFillQuery] = useState("");
const [mangaFillOpen, setMangaFillOpen] = useState(false);
const mangaFillRef = useRef(null);
```

- [ ] **Step 1.4 — Add `mgf` form state and `umg` updater after `cf`/`uc` (after line 288)**

```js
const [mgf, setMgf] = useState(defaultManga());
```

```js
const umg = (k, v) => setMgf((p) => ({ ...p, [k]: v }));
```

- [ ] **Step 1.5 — Add manga fetch to the `Promise.all` in `useEffect` (line ~302)**

Replace:
```js
const [aRes, fRes, sRes, oRes, amRes, mvRes, tvRes, cRes] =
  await Promise.all([
    fetch("/api/anime/", { credentials: "include" }),
    fetch("/api/franchise/", { credentials: "include" }),
    fetch("/api/series/", { credentials: "include" }),
    fetch("/api/options/", { credentials: "include" }),
    fetch("/api/anime-movie/", { credentials: "include" }),
    fetch("/api/movies/", { credentials: "include" }),
    fetch("/api/tv-shows/", { credentials: "include" }),
    fetch("/api/cartoon/", { credentials: "include" }),
  ]);
const [
  anime,
  franchises,
  series,
  options,
  animeMovies,
  movies,
  tvShows,
  cartoons,
] = await Promise.all([
  aRes.json(),
  fRes.json(),
  sRes.json(),
  oRes.json(),
  amRes.json(),
  mvRes.json(),
  tvRes.json(),
  cRes.json(),
]);
setAllAnime(anime);
setAllFranchises(franchises);
setAllSeries(series);
setAllOptions(options);
setAllAnimeMovies(animeMovies);
setAllMovies(movies);
setAllTvShows(tvShows);
setAllCartoons(cartoons);
```

With:
```js
const [aRes, fRes, sRes, oRes, amRes, mvRes, tvRes, cRes, mgRes] =
  await Promise.all([
    fetch("/api/anime/", { credentials: "include" }),
    fetch("/api/franchise/", { credentials: "include" }),
    fetch("/api/series/", { credentials: "include" }),
    fetch("/api/options/", { credentials: "include" }),
    fetch("/api/anime-movie/", { credentials: "include" }),
    fetch("/api/movies/", { credentials: "include" }),
    fetch("/api/tv-shows/", { credentials: "include" }),
    fetch("/api/cartoon/", { credentials: "include" }),
    fetch("/api/manga/", { credentials: "include" }),
  ]);
const [
  anime,
  franchises,
  series,
  options,
  animeMovies,
  movies,
  tvShows,
  cartoons,
  mangas,
] = await Promise.all([
  aRes.json(),
  fRes.json(),
  sRes.json(),
  oRes.json(),
  amRes.json(),
  mvRes.json(),
  tvRes.json(),
  cRes.json(),
  mgRes.json(),
]);
setAllAnime(anime);
setAllFranchises(franchises);
setAllSeries(series);
setAllOptions(options);
setAllAnimeMovies(animeMovies);
setAllMovies(movies);
setAllTvShows(tvShows);
setAllCartoons(cartoons);
setAllMangas(mangas);
```

- [ ] **Step 1.6 — Add manga click-outside `useEffect` after the existing tvFillRef one (after line 374)**

```js
useEffect(() => {
  function handleClick(e) {
    if (mangaFillRef.current && !mangaFillRef.current.contains(e.target))
      setMangaFillOpen(false);
  }
  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, []);
```

- [ ] **Step 1.7 — Add `mangaFillResults` after `cartoonFillResults` (after line 399)**

```js
const mangaFillResults = mangaFillQuery
  ? allMangas
      .filter((m) =>
        [
          m.manga_name_cn,
          m.manga_name_en,
          m.manga_name_roman,
          m.manga_name_jp,
          m.manga_name_alt,
        ].some(
          (n) => n && cleanString(n).includes(cleanString(mangaFillQuery)),
        ),
      )
      .slice(0, 10)
  : [];
```

- [ ] **Step 1.8 — Add `applyMangaAutofill` after `applyCartoonAutofill` (after line 448)**

```js
function applyMangaAutofill(manga) {
  const f = allFranchises.find((x) => x.system_id === manga.franchise_id);
  const s = allSeries.find((x) => x.system_id === manga.series_id);
  setMgf((p) => ({
    ...p,
    manga_name_cn: manga.manga_name_cn || "",
    manga_name_en: manga.manga_name_en || "",
    manga_name_roman: manga.manga_name_roman || "",
    manga_name_jp: manga.manga_name_jp || "",
    manga_name_alt: manga.manga_name_alt || "",
    franchise_id: manga.franchise_id || null,
    franchise_text: f ? getDisplayName(f, "franchise") : "",
    series_id: manga.series_id || null,
    series_text: s ? getDisplayName(s, "series") : "",
    region: manga.region || "",
    is_main: manga.is_main || "",
  }));
  setMangaFillQuery("");
  setMangaFillOpen(false);
  showToast("success", "Auto-filled fields from existing entry.");
}
```

- [ ] **Step 1.9 — Add manga to `handleSubmit` dispatch (after line 527)**

```js
else if (activeTab === "manga") await submitManga();
```

- [ ] **Step 1.10 — Add `seriesItemsForManga` after `seriesItemsForCartoon` (after line 1466)**

```js
const seriesItemsForManga = (
  mgf.franchise_id
    ? allSeries.filter((s) => s.franchise_id === mgf.franchise_id)
    : allSeries
).map((s) => ({
  id: s.system_id,
  label: getDisplayName(s, "series"),
  searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
    .filter(Boolean)
    .join(" "),
}));
```

- [ ] **Step 1.11 — Add manga entry to `tabDefs` after the cartoon entry (line ~1488)**

```js
{ key: "manga", icon: "fa-book", label: "Add Manga Entry" },
```

- [ ] **Step 1.12 — Commit**

```bash
git add frontend/src/pages/Add.jsx
git commit -m "feat(add): add manga state, data loading, autofill helpers"
```

---

## Task 2: Add.jsx — `submitManga` Function

**Files:**
- Modify: `frontend/src/pages/Add.jsx`

- [ ] **Step 2.1 — Add `submitManga` after `submitCartoon` (after line ~1406)**

```js
async function submitManga() {
  if (!mgf.manga_name_cn && !mgf.manga_name_en) {
    showToast("error", "Please provide at least a CN or EN title.");
    return;
  }
  if (!mgf.franchise_id && !mgf.franchise_text.trim()) {
    showToast("warning", "A Franchise must be selected or created.");
    return;
  }

  let franchiseId = mgf.franchise_id;
  if (!franchiseId && mgf.franchise_text.trim()) {
    const result = await new Promise((resolve) => {
      setFranchiseCreateModal({
        franchiseType: "ACG",
        onConfirm: (expectation, remark) => {
          setFranchiseCreateModal(null);
          resolve({ confirmed: true, expectation, remark });
        },
        onCancel: () => {
          setFranchiseCreateModal(null);
          resolve({ confirmed: false });
        },
      });
    });
    if (!result.confirmed) return;
    const res = await fetch("/api/franchise/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_name_en: mgf.manga_name_en || null,
        franchise_name_cn: mgf.manga_name_cn || null,
        franchise_name_roman: mgf.manga_name_roman || null,
        franchise_name_jp: mgf.manga_name_jp || null,
        franchise_name_alt: mgf.manga_name_alt || null,
        franchise_type: "ACG",
        franchise_expectation: result.expectation,
        remark: result.remark || null,
      }),
      credentials: "include",
    });
    if (!res.ok) {
      showToast("error", "Failed to create franchise");
      return;
    }
    const nf = await res.json();
    franchiseId = nf.system_id;
    setAllFranchises((prev) => [...prev, nf]);
  }

  let seriesId = mgf.series_id;
  if (!seriesId && mgf.series_text.trim()) {
    const confirmed = await new Promise((resolve) => {
      setCreateModal({
        entityType: "Series",
        text: mgf.series_text,
        onConfirm: () => {
          setCreateModal(null);
          resolve(true);
        },
        onCancel: () => {
          setCreateModal(null);
          resolve(false);
        },
      });
    });
    if (!confirmed) return;
    const sRes = await fetch("/api/series/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_id: franchiseId,
        series_name_en: mgf.manga_name_en || null,
        series_name_cn: mgf.manga_name_cn || null,
        series_name_alt: mgf.manga_name_alt || null,
      }),
      credentials: "include",
    });
    if (!sRes.ok) {
      showToast("error", "Failed to create series");
      return;
    }
    const ns = await sRes.json();
    seriesId = ns.system_id;
    setAllSeries((prev) => [...prev, ns]);
  }

  const payload = {
    manga_name_cn: mgf.manga_name_cn || null,
    manga_name_en: mgf.manga_name_en || null,
    manga_name_roman: mgf.manga_name_roman || null,
    manga_name_jp: mgf.manga_name_jp || null,
    manga_name_alt: mgf.manga_name_alt || null,
    franchise_id: franchiseId || null,
    series_id: seriesId || null,
    region: mgf.region || null,
    serialization_status: mgf.serialization_status || null,
    reading_status: mgf.reading_status || "Might Read",
    is_main: mgf.is_main || null,
    vol_total: mgf.vol_total !== "" ? parseInt(mgf.vol_total) : null,
    vol_fin: mgf.vol_fin !== "" ? parseInt(mgf.vol_fin) : null,
    vol_fin_page: mgf.vol_fin_page !== "" ? parseInt(mgf.vol_fin_page) : null,
    ch_total: mgf.ch_total !== "" ? parseInt(mgf.ch_total) : null,
    ch_fin: mgf.ch_fin !== "" ? parseInt(mgf.ch_fin) : null,
    my_rating: mgf.my_rating || null,
    mal_rating: mgf.mal_rating !== "" ? parseFloat(mgf.mal_rating) : null,
    mal_rank: mgf.mal_rank !== "" ? parseInt(mgf.mal_rank) : null,
    anilist_rating:
      mgf.anilist_rating !== "" ? parseFloat(mgf.anilist_rating) : null,
    author_plot: mgf.author_plot || null,
    author_draw: mgf.author_draw || null,
    release_year:
      mgf.release_year !== "" ? parseInt(mgf.release_year) : null,
    end_year: mgf.end_year !== "" ? parseInt(mgf.end_year) : null,
    anime_studio: mgf.anime_studio || null,
    serialization_platform: mgf.serialization_platform || null,
    distributor_tw: mgf.distributor_tw || null,
    derive_related:
      mgf.derive_related === "true"
        ? true
        : mgf.derive_related === "false"
          ? false
          : null,
    prequel_id: mgf.prequel_id || null,
    sequel_id: mgf.sequel_id || null,
    watch_order:
      mgf.watch_order !== "" ? parseFloat(mgf.watch_order) : null,
    mal_id: mgf.mal_id !== "" ? parseInt(mgf.mal_id) : null,
    mal_link: mgf.mal_link || null,
    anilist_link: mgf.anilist_link || null,
    source_other:
      mgf.source_other.filter((e) => e.name.trim()).length > 0
        ? Object.fromEntries(
            mgf.source_other
              .filter((e) => e.name.trim())
              .map((e) => [e.name.trim(), e.url.trim()]),
          )
        : null,
    read_next: mgf.read_next ?? false,
    to_reread: mgf.to_reread ?? false,
    cover_image_file: mgf.cover_image_file || null,
    remark: mgf.remark || null,
  };

  const res = await fetch("/api/manga/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(
      "error",
      err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
    );
    return;
  }
  const created = await res.json();
  window.scrollTo(0, 0);
  showToast("success", "Manga appended successfully.");
  setLastAdded(created.manga_name_cn || created.manga_name_en || "New Manga");
  setMgf(defaultManga());
  setAllMangas((prev) => [...prev, created]);
}
```

- [ ] **Step 2.2 — Commit**

```bash
git add frontend/src/pages/Add.jsx
git commit -m "feat(add): add submitManga function"
```

---

## Task 3: Add.jsx — Manga Tab JSX

**Files:**
- Modify: `frontend/src/pages/Add.jsx`

- [ ] **Step 3.1 — Add manga tab JSX block after the cartoon tab closing `)}` (after line ~4112)**

Insert after `{/* ═══ FRANCHISE TAB ═══ */}` comment (i.e., between the end of cartoon JSX and the start of franchise JSX):

```jsx
{/* ═══ MANGA TAB ═══ */}
{activeTab === "manga" && (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
    {/* Auto-fill search */}
    <div ref={mangaFillRef} className="relative mb-4">
      <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
        <i className="fas fa-magic text-brand text-sm"></i>
        <input
          type="text"
          value={mangaFillQuery}
          onChange={(e) => {
            setMangaFillQuery(e.target.value);
            setMangaFillOpen(true);
          }}
          onFocus={() => setMangaFillOpen(true)}
          placeholder="Auto-fill from existing entry — type a name to search..."
          className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
          autoComplete="off"
        />
        {mangaFillQuery && (
          <button
            type="button"
            onClick={() => {
              setMangaFillQuery("");
              setMangaFillOpen(false);
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        )}
      </div>
      {mangaFillOpen && mangaFillResults.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {mangaFillResults.map((m) => {
            const f = allFranchises.find(
              (x) => x.system_id === m.franchise_id,
            );
            return (
              <button
                key={m.system_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyMangaAutofill(m)}
                className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center gap-2">
                  {m.region && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                      {m.region}
                    </span>
                  )}
                  <span className="text-sm font-bold text-gray-800">
                    {m.manga_name_cn || m.manga_name_en}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {f ? getDisplayName(f, "franchise") : "Standalone"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>

    <SectionHeader icon="fa-book" title="Titles & Naming" />
    <Field label="Franchise">
      <ComboBox
        items={allFranchises
          .filter((f) => f.franchise_type === "ACG" || !f.franchise_type)
          .map((f) => ({
            id: f.system_id,
            label: getDisplayName(f, "franchise"),
            searchText: [
              f.franchise_name_cn,
              f.franchise_name_en,
              f.franchise_name_jp,
              f.franchise_name_roman,
              f.franchise_name_alt,
            ]
              .filter(Boolean)
              .join(" "),
          }))}
        selectedId={mgf.franchise_id}
        inputText={mgf.franchise_text}
        onSelect={(id, label) => {
          umg("franchise_id", id);
          umg("franchise_text", label);
          umg("series_id", null);
          umg("series_text", "");
        }}
        onType={(text) => {
          umg("franchise_text", text);
          umg("franchise_id", null);
          umg("series_id", null);
          umg("series_text", "");
        }}
        onClear={() => {
          umg("franchise_id", null);
          umg("franchise_text", "");
          umg("series_id", null);
          umg("series_text", "");
        }}
        placeholder="Search or type new franchise..."
        allowNew
      />
    </Field>
    <Field label="Series">
      <ComboBox
        items={seriesItemsForManga}
        selectedId={mgf.series_id}
        inputText={mgf.series_text}
        onSelect={(id, label) => {
          umg("series_id", id);
          umg("series_text", label);
        }}
        onType={(text) => {
          umg("series_text", text);
          umg("series_id", null);
        }}
        onClear={() => {
          umg("series_id", null);
          umg("series_text", "");
        }}
        placeholder="Search or type new series..."
        allowNew
      />
    </Field>
    <Field label="Manga Name CN">
      <input
        className={inputCls}
        value={mgf.manga_name_cn}
        onChange={(e) => umg("manga_name_cn", e.target.value)}
        placeholder="Chinese title"
      />
    </Field>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Manga Name EN">
        <input
          className={inputCls}
          value={mgf.manga_name_en}
          onChange={(e) => umg("manga_name_en", e.target.value)}
          placeholder="English title"
        />
      </Field>
      <Field label="Manga Name Alt">
        <input
          className={inputCls}
          value={mgf.manga_name_alt}
          onChange={(e) => umg("manga_name_alt", e.target.value)}
          placeholder="Alternative title"
        />
      </Field>
      <Field label="Manga Name Roman">
        <input
          className={inputCls}
          value={mgf.manga_name_roman}
          onChange={(e) => umg("manga_name_roman", e.target.value)}
          placeholder="Romanized title"
        />
      </Field>
      <Field label="Manga Name JP">
        <input
          className={inputCls}
          value={mgf.manga_name_jp}
          onChange={(e) => umg("manga_name_jp", e.target.value)}
          placeholder="Japanese title"
        />
      </Field>
    </div>

    <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Field label="Region">
        <select
          className={selectCls}
          value={mgf.region}
          onChange={(e) => umg("region", e.target.value)}
        >
          <option value="">—</option>
          {["日漫", "韓漫", "國漫", "台漫", "其他"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Is Main">
        <select
          className={selectCls}
          value={mgf.is_main}
          onChange={(e) => umg("is_main", e.target.value)}
        >
          <option value="">—</option>
          {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Serialization Status">
        <select
          className={selectCls}
          value={mgf.serialization_status}
          onChange={(e) => umg("serialization_status", e.target.value)}
        >
          <option value="">—</option>
          {["連載中", "停更", "腰斬", "完結"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Reading Status">
        <select
          className={selectCls}
          value={mgf.reading_status}
          onChange={(e) => umg("reading_status", e.target.value)}
        >
          {[
            "Might Read",
            "Plan to Read",
            "Active Reading",
            "Passive Reading",
            "Paused",
            "Completed",
            "Temp Dropped",
            "Dropped",
            "Won't Read",
          ].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="My Rating">
        <select
          className={selectCls}
          value={mgf.my_rating}
          onChange={(e) => umg("my_rating", e.target.value)}
        >
          <option value="">—</option>
          {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
    </div>

    <SectionHeader icon="fa-book-open" title="Progress" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Chapters Total">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={mgf.ch_total}
          onChange={(e) => umg("ch_total", e.target.value)}
          placeholder="0"
        />
      </Field>
      <Field label="Chapters Finished">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={mgf.ch_fin}
          onChange={(e) => umg("ch_fin", e.target.value)}
          placeholder="0"
        />
      </Field>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Field label="Volumes Total">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={mgf.vol_total}
          onChange={(e) => umg("vol_total", e.target.value)}
          placeholder="0"
        />
      </Field>
      <Field label="Volumes Finished">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={mgf.vol_fin}
          onChange={(e) => umg("vol_fin", e.target.value)}
          placeholder="0"
        />
      </Field>
      <Field label="Last Vol Page" hint="Pages read in current volume">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={mgf.vol_fin_page}
          onChange={(e) => umg("vol_fin_page", e.target.value)}
          placeholder="0"
        />
      </Field>
    </div>
    <div className="flex flex-wrap gap-6 mt-2">
      <Field label="Read Next">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!mgf.read_next}
            onChange={(e) => umg("read_next", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Add to Read Next list
          </span>
        </label>
      </Field>
      <Field label="To Reread">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!mgf.to_reread}
            onChange={(e) => umg("to_reread", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Mark for reread
          </span>
        </label>
      </Field>
    </div>

    <SectionHeader icon="fa-star" title="Scores" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Field label="MAL Rating" hint="e.g. 8.45">
        <input
          className={inputCls}
          type="number"
          step="0.01"
          value={mgf.mal_rating}
          onChange={(e) => umg("mal_rating", e.target.value)}
          placeholder="8.45"
        />
      </Field>
      <Field label="MAL Rank">
        <input
          className={inputCls}
          type="number"
          value={mgf.mal_rank}
          onChange={(e) => umg("mal_rank", e.target.value)}
          placeholder="1000"
        />
      </Field>
      <Field label="AniList Rating" hint="e.g. 84">
        <input
          className={inputCls}
          type="number"
          step="0.1"
          value={mgf.anilist_rating}
          onChange={(e) => umg("anilist_rating", e.target.value)}
          placeholder="84"
        />
      </Field>
    </div>

    <SectionHeader icon="fa-pen-nib" title="Authors & Production" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Author (Plot)">
        <input
          className={inputCls}
          value={mgf.author_plot}
          onChange={(e) => umg("author_plot", e.target.value)}
          placeholder="Story writer"
        />
      </Field>
      <Field label="Author (Art)">
        <input
          className={inputCls}
          value={mgf.author_draw}
          onChange={(e) => umg("author_draw", e.target.value)}
          placeholder="Illustrator"
        />
      </Field>
      <Field label="Release Year">
        <input
          className={inputCls}
          type="number"
          value={mgf.release_year}
          onChange={(e) => umg("release_year", e.target.value)}
          placeholder="2020"
        />
      </Field>
      <Field label="End Year">
        <input
          className={inputCls}
          type="number"
          value={mgf.end_year}
          onChange={(e) => umg("end_year", e.target.value)}
          placeholder="2024"
        />
      </Field>
      <Field label="Anime Studio">
        <input
          className={inputCls}
          value={mgf.anime_studio}
          onChange={(e) => umg("anime_studio", e.target.value)}
          placeholder="e.g. MAPPA"
        />
      </Field>
      <Field label="Serialization Platform">
        <input
          className={inputCls}
          value={mgf.serialization_platform}
          onChange={(e) => umg("serialization_platform", e.target.value)}
          placeholder="e.g. Jump"
        />
      </Field>
      <Field label="Distributor TW">
        <input
          className={inputCls}
          value={mgf.distributor_tw}
          onChange={(e) => umg("distributor_tw", e.target.value)}
          placeholder="Taiwan distributor"
        />
      </Field>
    </div>

    <SectionHeader icon="fa-random" title="Relational & Timeline" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Prequel ID" hint="UUID of prequel entry">
        <input
          className={inputCls + " font-mono text-xs"}
          value={mgf.prequel_id || ""}
          onChange={(e) => umg("prequel_id", e.target.value || null)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </Field>
      <Field label="Sequel ID" hint="UUID of sequel entry">
        <input
          className={inputCls + " font-mono text-xs"}
          value={mgf.sequel_id || ""}
          onChange={(e) => umg("sequel_id", e.target.value || null)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </Field>
      <Field label="Read Order" hint="e.g. 1, 1.5, 2">
        <input
          className={inputCls}
          type="number"
          step="any"
          value={mgf.watch_order}
          onChange={(e) => umg("watch_order", e.target.value)}
          placeholder="e.g. 1, 1.5, 2"
        />
      </Field>
      <Field
        label="Derive Related"
        hint="Set to No to skip prequel/sequel derivation"
      >
        <select
          className={selectCls}
          value={mgf.derive_related}
          onChange={(e) => umg("derive_related", e.target.value)}
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </Field>
    </div>

    <SectionHeader icon="fa-link" title="Source & Links" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="MAL ID" hint="Numeric MAL manga ID">
        <input
          className={inputCls}
          type="number"
          value={mgf.mal_id}
          onChange={(e) => umg("mal_id", e.target.value)}
          placeholder="12345"
        />
      </Field>
      <Field label="MAL Link">
        <input
          className={inputCls}
          type="url"
          value={mgf.mal_link}
          onChange={(e) => umg("mal_link", e.target.value)}
          placeholder="https://myanimelist.net/manga/..."
        />
      </Field>
      <Field label="AniList Link">
        <input
          className={inputCls}
          type="url"
          value={mgf.anilist_link}
          onChange={(e) => umg("anilist_link", e.target.value)}
          placeholder="https://anilist.co/manga/..."
        />
      </Field>
      <div className="md:col-span-2">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Other Sources
        </label>
        <div className="space-y-2">
          {mgf.source_other.map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={entry.name}
                onChange={(e) =>
                  umg(
                    "source_other",
                    mgf.source_other.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                className={inputCls}
                type="url"
                placeholder="https://... (optional)"
                value={entry.url}
                onChange={(e) =>
                  umg(
                    "source_other",
                    mgf.source_other.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-red-400 hover:text-red-600 px-1 shrink-0"
                onClick={() =>
                  umg(
                    "source_other",
                    mgf.source_other.filter((_, j) => j !== i),
                  )
                }
              >
                <i className="fas fa-times" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-brand hover:underline mt-1"
            onClick={() =>
              umg("source_other", [
                ...mgf.source_other,
                { name: "", url: "" },
              ])
            }
          >
            + Add Source
          </button>
        </div>
      </div>
    </div>

    <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
    <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
      <input
        className={inputCls}
        value={mgf.cover_image_file}
        onChange={(e) => umg("cover_image_file", e.target.value)}
        placeholder="5114.jpg"
      />
    </Field>
    <Field label="Remark">
      <textarea
        className={inputCls}
        rows={3}
        value={mgf.remark}
        onChange={(e) => umg("remark", e.target.value)}
        placeholder="Private notes..."
      />
    </Field>
  </div>
)}
```

- [ ] **Step 3.2 — Verify in browser**

Run `cd frontend && npm run dev`. Navigate to `/add`, click "Add Manga Entry" tab. Confirm:
- All form sections render
- Autofill search finds manga entries and prefills fields
- Franchise combobox filters to ACG type
- Submit with at least CN name + franchise creates the entry (check network tab for 200 from `/api/manga/`)
- Franchise Generation modal appears if franchise text was typed but not selected

- [ ] **Step 3.3 — Commit**

```bash
git add frontend/src/pages/Add.jsx
git commit -m "feat(add): add manga tab JSX (5.1)"
```

---

## Task 4: Modify.jsx — State, Data Loading, Helpers, tabDefs

**Files:**
- Modify: `frontend/src/pages/Modify.jsx`

- [ ] **Step 4.1 — Add `MangaNotes` import after `CartoonNotes` (line 17)**

```js
import MangaNotes from "./MangaNotes";
```

- [ ] **Step 4.2 — Add `allMangas` state after `allCartoons` (line 211)**

```js
const [allMangas, setAllMangas] = useState([]);
```

- [ ] **Step 4.3 — Add `cmgf` form state and `umg` updater after `cmf`/`uc` (lines 234–243)**

After `const [cmf, setCmf] = useState({});` add:
```js
const [cmgf, setCmgf] = useState({});
```

After `const uc = (k, v) => setCmf((p) => ({ ...p, [k]: v }));` add:
```js
const umg = (k, v) => setCmgf((p) => ({ ...p, [k]: v }));
```

- [ ] **Step 4.4 — Add manga fetch to `useEffect` Promise.all (line ~257)**

Replace the destructuring block starting at line 248 with:
```js
const [aRes, fRes, sRes, oRes, amRes, mvRes, tvRes, ctRes, mgRes] =
  await Promise.all([
    fetch("/api/anime/", { credentials: "include" }),
    fetch("/api/franchise/", { credentials: "include" }),
    fetch("/api/series/", { credentials: "include" }),
    fetch("/api/options/", { credentials: "include" }),
    fetch("/api/anime-movie/", { credentials: "include" }),
    fetch("/api/movies/", { credentials: "include" }),
    fetch("/api/tv-shows/", { credentials: "include" }),
    fetch("/api/cartoon/", { credentials: "include" }),
    fetch("/api/manga/", { credentials: "include" }),
  ]);
const [
  anime,
  franchises,
  series,
  options,
  animeMovies,
  movies,
  tvShows,
  cartoons,
  mangas,
] = await Promise.all([
  aRes.json(),
  fRes.json(),
  sRes.json(),
  oRes.json(),
  amRes.json(),
  mvRes.json(),
  tvRes.json(),
  ctRes.json(),
  mgRes.json(),
]);
setAllAnime(anime);
setAllFranchises(franchises);
setAllSeries(series);
setAllOptions(options);
setAllAnimeMovies(animeMovies);
setAllMovies(movies);
setAllTvShows(tvShows);
setAllCartoons(cartoons);
setAllMangas(mangas);
```

- [ ] **Step 4.5 — Add manga deep-link handling after the cartoon deep-link block (after line 296)**

```js
if (urlType === "manga") {
  const mg = mangas.find((x) => x.system_id === urlId);
  if (mg) {
    openEditorWith(mg, "manga", franchises, series);
    setActiveTab("manga");
    return;
  }
}
```

- [ ] **Step 4.6 — Add `mangaToForm` function after `cartoonToForm` (after line ~495)**

```js
function mangaToForm(m, allFranchises, seriesList) {
  const f = allFranchises.find((x) => x.system_id === m.franchise_id);
  const s = (seriesList || allSeries).find(
    (x) => x.system_id === m.series_id,
  );
  return {
    manga_name_cn: m.manga_name_cn || "",
    manga_name_en: m.manga_name_en || "",
    manga_name_roman: m.manga_name_roman || "",
    manga_name_jp: m.manga_name_jp || "",
    manga_name_alt: m.manga_name_alt || "",
    franchise_id: m.franchise_id || null,
    franchise_text: f ? getDisplayName(f, "franchise") : "",
    series_id: m.series_id || null,
    series_text: s ? getDisplayName(s, "series") : "",
    region: m.region || "",
    serialization_status: m.serialization_status || "",
    reading_status: m.reading_status || "Might Read",
    is_main: m.is_main || "",
    vol_total: m.vol_total ?? "",
    vol_fin: m.vol_fin ?? "",
    vol_fin_page: m.vol_fin_page ?? "",
    ch_total: m.ch_total ?? "",
    ch_fin: m.ch_fin ?? "",
    my_rating: m.my_rating || "",
    mal_rating: m.mal_rating ?? "",
    mal_rank: m.mal_rank ?? "",
    anilist_rating: m.anilist_rating ?? "",
    author_plot: m.author_plot || "",
    author_draw: m.author_draw || "",
    release_year: m.release_year ?? "",
    end_year: m.end_year ?? "",
    anime_studio: m.anime_studio || "",
    serialization_platform: m.serialization_platform || "",
    distributor_tw: m.distributor_tw || "",
    derive_related:
      m.derive_related === true
        ? "true"
        : m.derive_related === false
          ? "false"
          : "",
    prequel_id: m.prequel_id || null,
    sequel_id: m.sequel_id || null,
    watch_order: m.watch_order ?? "",
    mal_id: m.mal_id ?? "",
    mal_link: m.mal_link || "",
    anilist_link: m.anilist_link || "",
    source_other: Array.isArray(m.source_other)
      ? m.source_other
      : Object.entries(m.source_other || {}).map(([name, url]) => ({
          name,
          url: url || "",
        })),
    read_next: m.read_next ?? false,
    to_reread: m.to_reread ?? false,
    cover_image_file: m.cover_image_file || "",
    remark: m.remark || "",
    notes: m.notes || {},
  };
}
```

- [ ] **Step 4.7 — Add manga to `openEditorWith` (after line 509)**

```js
else if (type === "manga")
  setCmgf(mangaToForm(item, franchises, series));
```

- [ ] **Step 4.8 — Add manga to `handleSave` dispatch (after line 536)**

```js
else if (editingType === "manga") await saveManga();
```

- [ ] **Step 4.9 — Add manga to `getItemLabel` (after line ~1287)**

```js
if (type === "manga")
  return (
    m.manga_name_cn ||
    m.manga_name_en ||
    m.manga_name_alt ||
    "Unknown"
  );
```

Note: the parameter variable name is `item` in `getItemLabel`. Use `item` not `m`:
```js
if (type === "manga")
  return (
    item.manga_name_cn ||
    item.manga_name_en ||
    item.manga_name_alt ||
    "Unknown"
  );
```

- [ ] **Step 4.10 — Add manga to `searchResults` (before the `return allOptions` line, ~line 1362)**

```js
if (activeTab === "manga")
  return allMangas
    .filter((m) =>
      [
        m.manga_name_cn,
        m.manga_name_en,
        m.manga_name_roman,
        m.manga_name_jp,
        m.manga_name_alt,
      ].some((n) => n && cleanString(n).includes(q)),
    )
    .slice(0, 10);
```

- [ ] **Step 4.11 — Add manga to `recentItems` (after the cartoon case, ~line 1383)**

```js
if (activeTab === "manga")
  return [...allMangas].sort(sort).slice(0, 12);
```

- [ ] **Step 4.12 — Add `seriesItemsForManga` after `seriesItemsForCartoon` (~line 1485)**

```js
const seriesItemsForManga = (
  cmgf.franchise_id
    ? allSeries.filter((s) => s.franchise_id === cmgf.franchise_id)
    : allSeries
).map((s) => ({
  id: s.system_id,
  label: getDisplayName(s, "series"),
  searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
    .filter(Boolean)
    .join(" "),
}));
```

- [ ] **Step 4.13 — Add manga to `tabDefs` after the cartoon entry (~line 1501)**

```js
{ key: "manga", icon: "fa-book", label: "Modify Manga Entry" },
```

- [ ] **Step 4.14 — Add manga `sub` to the search dropdown subtitle computation (~line 1569)**

The existing ternary chain ends with `""`. Extend it so manga also shows franchise name. Find this block:

```js
const sub =
  activeTab === "anime" || activeTab === "anime-movie"
    ? allFranchises.find(
        (f) => f.system_id === item.franchise_id,
      )?.franchise_name_cn || "Standalone"
    : activeTab === "series"
      ? allFranchises.find(
          (f) => f.system_id === item.franchise_id,
        )?.franchise_name_cn || ""
      : "";
```

Replace with:
```js
const sub =
  activeTab === "anime" || activeTab === "anime-movie"
    ? allFranchises.find(
        (f) => f.system_id === item.franchise_id,
      )?.franchise_name_cn || "Standalone"
    : activeTab === "series" || activeTab === "manga"
      ? allFranchises.find(
          (f) => f.system_id === item.franchise_id,
        )?.franchise_name_cn || ""
      : "";
```

This same `sub` pattern appears twice: once in the search dropdown (line ~1568) and once in the recently modified section (line ~1642). Apply to both.

- [ ] **Step 4.15 — Commit**

```bash
git add frontend/src/pages/Modify.jsx
git commit -m "feat(modify): add manga state, data loading, helpers, tabDef"
```

---

## Task 5: Modify.jsx — `saveManga` Function

**Files:**
- Modify: `frontend/src/pages/Modify.jsx`

- [ ] **Step 5.1 — Add `saveManga` after `saveCartoon` (~after line 1263)**

```js
async function saveManga() {
  let franchiseId = cmgf.franchise_id;
  if (!franchiseId && (cmgf.franchise_text || "").trim()) {
    const result = await new Promise((resolve) => {
      setFranchiseCreateModal({
        franchiseType: "ACG",
        onConfirm: (exp, rem) => {
          setFranchiseCreateModal(null);
          resolve({ confirmed: true, expectation: exp, remark: rem });
        },
        onCancel: () => {
          setFranchiseCreateModal(null);
          resolve({ confirmed: false });
        },
      });
    });
    if (!result.confirmed) return;
    const res = await fetch("/api/franchise/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_name_en: cmgf.manga_name_en || null,
        franchise_name_cn: cmgf.manga_name_cn || null,
        franchise_name_roman: cmgf.manga_name_roman || null,
        franchise_name_jp: cmgf.manga_name_jp || null,
        franchise_name_alt: cmgf.manga_name_alt || null,
        franchise_type: "ACG",
        franchise_expectation: result.expectation,
        remark: result.remark || null,
      }),
      credentials: "include",
    });
    if (!res.ok) {
      showToast("error", "Failed to create franchise");
      return;
    }
    const nf = await res.json();
    franchiseId = nf.system_id;
    setAllFranchises((prev) => [...prev, nf]);
  }

  let seriesId = cmgf.series_id;
  if (!seriesId && (cmgf.series_text || "").trim()) {
    const confirmed = await new Promise((resolve) => {
      setCreateModal({
        entityType: "Series",
        text: cmgf.series_text,
        onConfirm: () => {
          setCreateModal(null);
          resolve(true);
        },
        onCancel: () => {
          setCreateModal(null);
          resolve(false);
        },
      });
    });
    if (!confirmed) return;
    const sRes = await fetch("/api/series/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_id: franchiseId,
        series_name_en: cmgf.manga_name_en || null,
        series_name_cn: cmgf.manga_name_cn || null,
        series_name_alt: cmgf.manga_name_alt || null,
      }),
      credentials: "include",
    });
    if (!sRes.ok) {
      showToast("error", "Failed to create series");
      return;
    }
    const ns = await sRes.json();
    seriesId = ns.system_id;
    setAllSeries((prev) => [...prev, ns]);
  }

  const payload = {
    manga_name_cn: cmgf.manga_name_cn || null,
    manga_name_en: cmgf.manga_name_en || null,
    manga_name_roman: cmgf.manga_name_roman || null,
    manga_name_jp: cmgf.manga_name_jp || null,
    manga_name_alt: cmgf.manga_name_alt || null,
    franchise_id: franchiseId || null,
    series_id: seriesId || null,
    region: cmgf.region || null,
    serialization_status: cmgf.serialization_status || null,
    reading_status: cmgf.reading_status || "Might Read",
    is_main: cmgf.is_main || null,
    vol_total: cmgf.vol_total !== "" ? parseInt(cmgf.vol_total) : null,
    vol_fin: cmgf.vol_fin !== "" ? parseInt(cmgf.vol_fin) : null,
    vol_fin_page:
      cmgf.vol_fin_page !== "" ? parseInt(cmgf.vol_fin_page) : null,
    ch_total: cmgf.ch_total !== "" ? parseInt(cmgf.ch_total) : null,
    ch_fin: cmgf.ch_fin !== "" ? parseInt(cmgf.ch_fin) : null,
    my_rating: cmgf.my_rating || null,
    mal_rating:
      cmgf.mal_rating !== "" ? parseFloat(cmgf.mal_rating) : null,
    mal_rank: cmgf.mal_rank !== "" ? parseInt(cmgf.mal_rank) : null,
    anilist_rating:
      cmgf.anilist_rating !== "" ? parseFloat(cmgf.anilist_rating) : null,
    author_plot: cmgf.author_plot || null,
    author_draw: cmgf.author_draw || null,
    release_year:
      cmgf.release_year !== "" ? parseInt(cmgf.release_year) : null,
    end_year: cmgf.end_year !== "" ? parseInt(cmgf.end_year) : null,
    anime_studio: cmgf.anime_studio || null,
    serialization_platform: cmgf.serialization_platform || null,
    distributor_tw: cmgf.distributor_tw || null,
    derive_related:
      cmgf.derive_related === "true"
        ? true
        : cmgf.derive_related === "false"
          ? false
          : null,
    prequel_id: cmgf.prequel_id || null,
    sequel_id: cmgf.sequel_id || null,
    watch_order:
      cmgf.watch_order !== "" ? parseFloat(cmgf.watch_order) : null,
    mal_id: cmgf.mal_id !== "" ? parseInt(cmgf.mal_id) : null,
    mal_link: cmgf.mal_link || null,
    anilist_link: cmgf.anilist_link || null,
    source_other:
      (cmgf.source_other || []).filter((e) => e.name.trim()).length > 0
        ? Object.fromEntries(
            (cmgf.source_other || [])
              .filter((e) => e.name.trim())
              .map((e) => [e.name.trim(), e.url.trim()]),
          )
        : null,
    read_next: cmgf.read_next ?? false,
    to_reread: cmgf.to_reread ?? false,
    cover_image_file: cmgf.cover_image_file || null,
    remark: cmgf.remark || null,
    notes: Object.keys(cmgf.notes || {}).length > 0 ? cmgf.notes : null,
  };

  const res = await fetch(`/api/manga/${editingItem.system_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(
      "error",
      err.detail ? JSON.stringify(err.detail) : "Update failed",
    );
    return;
  }
  const updated = await res.json();
  setAllMangas((prev) =>
    prev.map((m) => (m.system_id === updated.system_id ? updated : m)),
  );
  setEditingItem(updated);
  setCmgf(mangaToForm(updated, allFranchises, allSeries));
  await fetch(`/api/data-control/replace/manga/${updated.system_id}`, {
    method: "POST",
    credentials: "include",
  });
  window.scrollTo(0, 0);
  showToast("success", "Update and enrichment successful.");
}
```

- [ ] **Step 5.2 — Commit**

```bash
git add frontend/src/pages/Modify.jsx
git commit -m "feat(modify): add saveManga function"
```

---

## Task 6: Modify.jsx — Sibling Ribbon + Form JSX

**Files:**
- Modify: `frontend/src/pages/Modify.jsx`

- [ ] **Step 6.1 — Add manga sibling ribbon block after the cartoon ribbon block (~after line 1995)**

The cartoon ribbon ends with `})()}`. Insert after that closing, before `<div className="bg-white rounded-2xl ...">`:

```jsx
{editingType === "manga" &&
  (() => {
    const mangaRibbon = cmgf.franchise_id
      ? allMangas.filter(
          (m) =>
            m.franchise_id === cmgf.franchise_id &&
            m.system_id !== editingItem?.system_id,
        )
      : [];
    if (!mangaRibbon.length) return null;
    const bySeries = {};
    const noSeries = [];
    for (const m of mangaRibbon) {
      if (m.series_id) {
        (bySeries[m.series_id] = bySeries[m.series_id] || []).push(m);
      } else noSeries.push(m);
    }
    const sortByName = (x, y) =>
      (x.manga_name_cn || x.manga_name_en || x.manga_name_alt || "").localeCompare(
        y.manga_name_cn || y.manga_name_en || y.manga_name_alt || "",
      );
    Object.values(bySeries).forEach((arr) => arr.sort(sortByName));
    noSeries.sort(sortByName);
    const renderChip = (m) => (
      <button
        key={m.system_id}
        type="button"
        onClick={() => openEditor(m, "manga")}
        className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 hover:border-brand hover:text-brand transition"
      >
        {m.manga_name_cn || m.manga_name_en || m.manga_name_alt || "Unknown"}
      </button>
    );
    return (
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Other entries in this franchise
        </p>
        {Object.entries(bySeries).map(([sid, entries]) => {
          const s = allSeries.find((x) => x.system_id === sid);
          return (
            <div key={sid}>
              <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
                {s ? getDisplayName(s, "series") : "Series"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {entries.map(renderChip)}
              </div>
            </div>
          );
        })}
        {noSeries.length > 0 && (
          <div>
            {Object.keys(bySeries).length > 0 && (
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                No Series
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {noSeries.map(renderChip)}
            </div>
          </div>
        )}
      </div>
    );
  })()}
```

- [ ] **Step 6.2 — Add manga form JSX after the cartoon form JSX closing `</>` (~after line 4575)**

Insert after `{/* ── OPTIONS EDITOR ── */}` comment start:

```jsx
{/* ── MANGA EDITOR ── */}
{editingType === "manga" && (
  <>
    <SectionHeader icon="fa-book" title="Titles & Naming" />
    <Field label="Franchise">
      <ComboBox
        items={allFranchises
          .filter((f) => f.franchise_type === "ACG" || !f.franchise_type)
          .map((f) => ({
            id: f.system_id,
            label: getDisplayName(f, "franchise"),
            searchText: [
              f.franchise_name_cn,
              f.franchise_name_en,
              f.franchise_name_jp,
              f.franchise_name_roman,
              f.franchise_name_alt,
            ]
              .filter(Boolean)
              .join(" "),
          }))}
        selectedId={cmgf.franchise_id}
        inputText={cmgf.franchise_text || ""}
        onSelect={(id, label) => {
          umg("franchise_id", id);
          umg("franchise_text", label);
          umg("series_id", null);
          umg("series_text", "");
        }}
        onType={(text) => {
          umg("franchise_text", text);
          umg("franchise_id", null);
          umg("series_id", null);
          umg("series_text", "");
        }}
        onClear={() => {
          umg("franchise_id", null);
          umg("franchise_text", "");
          umg("series_id", null);
          umg("series_text", "");
        }}
        placeholder="Search franchise..."
        allowNew
      />
    </Field>
    <Field label="Series">
      <ComboBox
        items={seriesItemsForManga}
        selectedId={cmgf.series_id}
        inputText={cmgf.series_text || ""}
        onSelect={(id, label) => {
          umg("series_id", id);
          umg("series_text", label);
        }}
        onType={(text) => {
          umg("series_text", text);
          umg("series_id", null);
        }}
        onClear={() => {
          umg("series_id", null);
          umg("series_text", "");
        }}
        placeholder="Search or type new series..."
        allowNew
      />
    </Field>
    <Field label="Manga Name CN">
      <input
        className={inputCls}
        value={cmgf.manga_name_cn || ""}
        onChange={(e) => umg("manga_name_cn", e.target.value)}
      />
    </Field>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Manga Name EN">
        <input
          className={inputCls}
          value={cmgf.manga_name_en || ""}
          onChange={(e) => umg("manga_name_en", e.target.value)}
        />
      </Field>
      <Field label="Manga Name Alt">
        <input
          className={inputCls}
          value={cmgf.manga_name_alt || ""}
          onChange={(e) => umg("manga_name_alt", e.target.value)}
        />
      </Field>
      <Field label="Manga Name Roman">
        <input
          className={inputCls}
          value={cmgf.manga_name_roman || ""}
          onChange={(e) => umg("manga_name_roman", e.target.value)}
        />
      </Field>
      <Field label="Manga Name JP">
        <input
          className={inputCls}
          value={cmgf.manga_name_jp || ""}
          onChange={(e) => umg("manga_name_jp", e.target.value)}
        />
      </Field>
    </div>

    <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Field label="Region">
        <select
          className={selectCls}
          value={cmgf.region || ""}
          onChange={(e) => umg("region", e.target.value)}
        >
          <option value="">—</option>
          {["日漫", "韓漫", "國漫", "台漫", "其他"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Is Main">
        <select
          className={selectCls}
          value={cmgf.is_main || ""}
          onChange={(e) => umg("is_main", e.target.value)}
        >
          <option value="">—</option>
          {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Serialization Status">
        <select
          className={selectCls}
          value={cmgf.serialization_status || ""}
          onChange={(e) => umg("serialization_status", e.target.value)}
        >
          <option value="">—</option>
          {["連載中", "停更", "腰斬", "完結"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Reading Status">
        <select
          className={selectCls}
          value={cmgf.reading_status || "Might Read"}
          onChange={(e) => umg("reading_status", e.target.value)}
        >
          {[
            "Might Read",
            "Plan to Read",
            "Active Reading",
            "Passive Reading",
            "Paused",
            "Completed",
            "Temp Dropped",
            "Dropped",
            "Won't Read",
          ].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="My Rating">
        <select
          className={selectCls}
          value={cmgf.my_rating || ""}
          onChange={(e) => umg("my_rating", e.target.value)}
        >
          <option value="">—</option>
          {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
    </div>

    <SectionHeader icon="fa-book-open" title="Progress" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Chapters Total">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={cmgf.ch_total ?? ""}
          onChange={(e) => umg("ch_total", e.target.value)}
        />
      </Field>
      <Field label="Chapters Finished">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={cmgf.ch_fin ?? ""}
          onChange={(e) => umg("ch_fin", e.target.value)}
        />
      </Field>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Field label="Volumes Total">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={cmgf.vol_total ?? ""}
          onChange={(e) => umg("vol_total", e.target.value)}
        />
      </Field>
      <Field label="Volumes Finished">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={cmgf.vol_fin ?? ""}
          onChange={(e) => umg("vol_fin", e.target.value)}
        />
      </Field>
      <Field label="Last Vol Page">
        <input
          className={inputCls}
          type="number"
          min="0"
          value={cmgf.vol_fin_page ?? ""}
          onChange={(e) => umg("vol_fin_page", e.target.value)}
        />
      </Field>
    </div>
    <div className="flex flex-wrap gap-6 mt-2">
      <Field label="Read Next">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!cmgf.read_next}
            onChange={(e) => umg("read_next", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Add to Read Next list
          </span>
        </label>
      </Field>
      <Field label="To Reread">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!cmgf.to_reread}
            onChange={(e) => umg("to_reread", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Mark for reread
          </span>
        </label>
      </Field>
    </div>

    <SectionHeader icon="fa-star" title="Scores" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Field label="MAL Rating" hint="e.g. 8.45">
        <input
          className={inputCls}
          type="number"
          step="0.01"
          value={cmgf.mal_rating ?? ""}
          onChange={(e) => umg("mal_rating", e.target.value)}
        />
      </Field>
      <Field label="MAL Rank">
        <input
          className={inputCls}
          type="number"
          value={cmgf.mal_rank ?? ""}
          onChange={(e) => umg("mal_rank", e.target.value)}
        />
      </Field>
      <Field label="AniList Rating" hint="e.g. 84">
        <input
          className={inputCls}
          type="number"
          step="0.1"
          value={cmgf.anilist_rating ?? ""}
          onChange={(e) => umg("anilist_rating", e.target.value)}
        />
      </Field>
    </div>

    <SectionHeader icon="fa-pen-nib" title="Authors & Production" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Author (Plot)">
        <input
          className={inputCls}
          value={cmgf.author_plot || ""}
          onChange={(e) => umg("author_plot", e.target.value)}
        />
      </Field>
      <Field label="Author (Art)">
        <input
          className={inputCls}
          value={cmgf.author_draw || ""}
          onChange={(e) => umg("author_draw", e.target.value)}
        />
      </Field>
      <Field label="Release Year">
        <input
          className={inputCls}
          type="number"
          value={cmgf.release_year ?? ""}
          onChange={(e) => umg("release_year", e.target.value)}
        />
      </Field>
      <Field label="End Year">
        <input
          className={inputCls}
          type="number"
          value={cmgf.end_year ?? ""}
          onChange={(e) => umg("end_year", e.target.value)}
        />
      </Field>
      <Field label="Anime Studio">
        <input
          className={inputCls}
          value={cmgf.anime_studio || ""}
          onChange={(e) => umg("anime_studio", e.target.value)}
        />
      </Field>
      <Field label="Serialization Platform">
        <input
          className={inputCls}
          value={cmgf.serialization_platform || ""}
          onChange={(e) => umg("serialization_platform", e.target.value)}
        />
      </Field>
      <Field label="Distributor TW">
        <input
          className={inputCls}
          value={cmgf.distributor_tw || ""}
          onChange={(e) => umg("distributor_tw", e.target.value)}
        />
      </Field>
    </div>

    <SectionHeader icon="fa-random" title="Relational & Timeline" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Prequel ID" hint="UUID of prequel entry">
        <input
          className={inputCls + " font-mono text-xs"}
          value={cmgf.prequel_id || ""}
          onChange={(e) => umg("prequel_id", e.target.value || null)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </Field>
      <Field label="Sequel ID" hint="UUID of sequel entry">
        <input
          className={inputCls + " font-mono text-xs"}
          value={cmgf.sequel_id || ""}
          onChange={(e) => umg("sequel_id", e.target.value || null)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </Field>
      <Field label="Read Order" hint="e.g. 1, 1.5, 2">
        <input
          className={inputCls}
          type="number"
          step="any"
          value={cmgf.watch_order ?? ""}
          onChange={(e) => umg("watch_order", e.target.value)}
        />
      </Field>
      <Field
        label="Derive Related"
        hint="Set to No to skip prequel/sequel derivation"
      >
        <select
          className={selectCls}
          value={cmgf.derive_related || ""}
          onChange={(e) => umg("derive_related", e.target.value)}
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </Field>
    </div>

    <SectionHeader icon="fa-link" title="Source & Links" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="MAL ID">
        <input
          className={inputCls}
          type="number"
          value={cmgf.mal_id ?? ""}
          onChange={(e) => umg("mal_id", e.target.value)}
        />
      </Field>
      <Field label="MAL Link">
        <input
          className={inputCls}
          type="url"
          value={cmgf.mal_link || ""}
          onChange={(e) => umg("mal_link", e.target.value)}
          placeholder="https://myanimelist.net/manga/..."
        />
      </Field>
      <Field label="AniList Link">
        <input
          className={inputCls}
          type="url"
          value={cmgf.anilist_link || ""}
          onChange={(e) => umg("anilist_link", e.target.value)}
          placeholder="https://anilist.co/manga/..."
        />
      </Field>
      <div className="md:col-span-2">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Other Sources
        </label>
        <div className="space-y-2">
          {(cmgf.source_other || []).map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={entry.name}
                onChange={(e) =>
                  umg(
                    "source_other",
                    (cmgf.source_other || []).map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                className={inputCls}
                type="url"
                placeholder="https://... (optional)"
                value={entry.url}
                onChange={(e) =>
                  umg(
                    "source_other",
                    (cmgf.source_other || []).map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-red-400 hover:text-red-600 px-1 shrink-0"
                onClick={() =>
                  umg(
                    "source_other",
                    (cmgf.source_other || []).filter((_, j) => j !== i),
                  )
                }
              >
                <i className="fas fa-times" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-brand hover:underline mt-1"
            onClick={() =>
              umg("source_other", [
                ...(cmgf.source_other || []),
                { name: "", url: "" },
              ])
            }
          >
            + Add Source
          </button>
        </div>
      </div>
    </div>

    <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
    <Field label="Cover Image File" hint="e.g. 5114.jpg">
      <input
        className={inputCls}
        value={cmgf.cover_image_file || ""}
        onChange={(e) => umg("cover_image_file", e.target.value)}
      />
    </Field>
    <Field label="Remark">
      <textarea
        className={inputCls}
        rows={3}
        value={cmgf.remark || ""}
        onChange={(e) => umg("remark", e.target.value)}
      />
    </Field>
    <SectionHeader icon="fa-book-open" title="Structured Notes" />
    <MangaNotes
      manga={{
        notes: cmgf.notes,
        system_id: editingItem?.system_id,
      }}
      isAdmin={true}
      onSave={(updatedNotes) => umg("notes", updatedNotes)}
    />
  </>
)}
```

- [ ] **Step 6.3 — Verify in browser**

Navigate to `/modify`, select "Modify Manga Entry" tab. Confirm:
- Recently modified manga entries appear
- Search finds manga by any name field; subtitle shows franchise name
- Selecting an entry opens the full form with all fields populated
- Sibling ribbon appears when franchise has other manga entries
- MangaNotes renders
- Save button sends PATCH and triggers replace pipeline (check network tab)
- Deep-link `/modify?id=<uuid>&type=manga` opens correct entry

- [ ] **Step 6.4 — Commit**

```bash
git add frontend/src/pages/Modify.jsx
git commit -m "feat(modify): add manga sibling ribbon and form JSX (5.2)"
```

---

## Task 7: Delete.jsx — All Changes

**Files:**
- Modify: `frontend/src/pages/Delete.jsx`

- [ ] **Step 7.1 — Add "manga" to `TABS` (line 5)**

```js
const TABS = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "franchise",
  "series",
  "options",
];
```

- [ ] **Step 7.2 — Add manga case to `getDisplayTitle` (after the cartoon case, ~line 50)**

```js
if (type === "manga")
  return (
    item.manga_name_cn ||
    item.manga_name_en ||
    item.manga_name_roman ||
    item.manga_name_jp ||
    item.manga_name_alt ||
    "Unknown"
  );
```

- [ ] **Step 7.3 — Add `manga` to `db` initial state (~line 138)**

```js
manga: [],
```

- [ ] **Step 7.4 — Add `selectedManga` state (~line 150)**

```js
const [selectedManga, setSelectedManga] = useState(null);
```

- [ ] **Step 7.5 — Add manga fetch to `loadDb` (~line 172)**

Add `fetch("/api/manga/", { credentials: "include" }),` to the Promise.all, `mg` to the destructure, `mgRes.json()` to the json-all, and `manga: mg` to the setDb call:

```js
const [aRes, fRes, sRes, oRes, amRes, mRes, tvRes, ctRes, mgRes] =
  await Promise.all([
    fetch("/api/anime/", { credentials: "include" }),
    fetch("/api/franchise/", { credentials: "include" }),
    fetch("/api/series/", { credentials: "include" }),
    fetch("/api/options/", { credentials: "include" }),
    fetch("/api/anime-movie/", { credentials: "include" }),
    fetch("/api/movies/", { credentials: "include" }),
    fetch("/api/tv-shows/", { credentials: "include" }),
    fetch("/api/cartoon/", { credentials: "include" }),
    fetch("/api/manga/", { credentials: "include" }),
  ]);
const [a, f, s, o, am, mv, tv, ct, mg] = await Promise.all([
  aRes.json(),
  fRes.json(),
  sRes.json(),
  oRes.json(),
  amRes.json(),
  mRes.json(),
  tvRes.json(),
  ctRes.json(),
  mgRes.json(),
]);
setDb({
  anime: a,
  "anime-movie": am,
  movie: mv,
  "tv-show": tv,
  cartoon: ct,
  manga: mg,
  franchise: f,
  series: s,
  options: o,
});
```

- [ ] **Step 7.6 — Add manga case to `executeDelete` (after cartoon case, ~line 370)**

```js
if (type === "manga") {
  const res = await fetch(`/api/manga/${item.system_id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete manga");
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
  setSelectedManga(null);
  showToast("success", "Deletion successful");
  await loadDb();
  setModal(null);
  return;
}
```

- [ ] **Step 7.7 — Add manga tab JSX (after the cartoon tab closing `)}`, ~line 890)**

```jsx
{/* MANGA TAB */}
{tab === "manga" && (
  <div className="space-y-4">
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <SearchBox
        placeholder="Search manga to delete..."
        items={db.manga}
        type="manga"
        onSelect={setSelectedManga}
        renderItem={(item) => (
          <div>
            <div className="font-bold text-gray-800 text-sm">
              {getDisplayTitle(item, "manga")}
            </div>
            <div className="text-[11px] text-gray-500">
              {getFranchiseTitle(item.franchise_id)} ·{" "}
              {item.reading_status || item.region || "Unknown"}
            </div>
          </div>
        )}
      />
    </div>

    {selectedManga && (
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
        <div className="flex items-start gap-4">
          <img
            src={getCoverUrl(selectedManga.cover_image_file)}
            className="w-16 h-24 object-cover rounded-lg shadow-sm shrink-0"
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
            alt=""
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-gray-900 text-base truncate">
              {getDisplayTitle(selectedManga, "manga")}
            </h3>
            <p className="text-sm text-gray-500">
              {selectedManga.manga_name_en || "-"}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedManga.reading_status && (
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                  {selectedManga.reading_status}
                </span>
              )}
              {selectedManga.region && (
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">
                  {selectedManga.region}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {getFranchiseTitle(selectedManga.franchise_id)}
              {selectedManga.series_id &&
                ` · ${getSeriesTitle(selectedManga.series_id)}`}
            </p>
            <p className="text-xs font-mono text-gray-400">
              {selectedManga.system_id}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedManga(null)}
              className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
            >
              <i className="fas fa-times"></i>
            </button>
            <button
              onClick={() => initDelete("manga", selectedManga)}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
            >
              <i className="fas fa-trash-alt"></i> Delete
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 7.8 — Add manga cascade modal checks in the confirmation modal (after the cartoon orphan franchise block, ~after line 1406)**

```jsx
{/* Orphan series warning (manga) */}
{modal.type === "manga" &&
  modal.item.series_id &&
  db.anime.filter((a) => a.series_id === modal.item.series_id).length +
    db.manga.filter((m) => m.series_id === modal.item.series_id).length ===
    1 && (
    <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
      <input
        type="checkbox"
        checked={orphanSeriesChecked}
        onChange={(e) => setOrphanSeriesChecked(e.target.checked)}
        className="mt-0.5 rounded border-orange-400 w-4 h-4"
      />
      <div>
        <div className="text-xs font-bold text-orange-800">
          <i className="fas fa-layer-group mr-1"></i> Last Entry in Series
        </div>
        <div className="text-xs text-orange-700 mt-0.5">
          Delete the orphaned Series too.
        </div>
      </div>
    </label>
  )}

{/* Orphan franchise warning (manga) */}
{modal.type === "manga" &&
  modal.item.franchise_id &&
  db.anime.filter(
    (a) => a.franchise_id === modal.item.franchise_id,
  ).length === 0 &&
  db["anime-movie"].filter(
    (m) => m.franchise_id === modal.item.franchise_id,
  ).length === 0 &&
  db["tv-show"].filter(
    (t) => t.franchise_id === modal.item.franchise_id,
  ).length === 0 &&
  db.cartoon.filter(
    (c) => c.franchise_id === modal.item.franchise_id,
  ).length === 0 &&
  db.manga.filter(
    (m) => m.franchise_id === modal.item.franchise_id,
  ).length === 1 &&
  (db.series.filter(
    (s) => s.franchise_id === modal.item.franchise_id,
  ).length === 0 ||
    orphanSeriesChecked) && (
    <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3 cursor-pointer">
      <input
        type="checkbox"
        checked={orphanFranchiseChecked}
        onChange={(e) => setOrphanFranchiseChecked(e.target.checked)}
        className="mt-0.5 rounded border-orange-400 w-4 h-4"
      />
      <div>
        <div className="text-xs font-bold text-orange-800">
          <i className="fas fa-link mr-1"></i> Last Entry in Franchise
        </div>
        <div className="text-xs text-orange-700 mt-0.5">
          Delete the orphaned Franchise Hub too.
        </div>
      </div>
    </label>
  )}
```

- [ ] **Step 7.9 — Verify in browser**

Navigate to `/delete`, select "manga" tab. Confirm:
- Search returns manga entries; subtitle shows franchise · reading_status
- Selecting entry shows info card with cover image, names, badges, franchise/series, system_id
- Delete button opens confirmation modal
- If manga is sole entry in its series, orphan-series checkbox appears
- If manga is sole entry in its franchise (no other types, no orphan series or series checkbox checked), orphan-franchise checkbox appears
- Confirming deletes entry from the list; toasts success

- [ ] **Step 7.10 — Commit**

```bash
git add frontend/src/pages/Delete.jsx
git commit -m "feat(delete): add manga tab with cascade delete (5.3)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| 5.1 Add tab — prefill from existing | Task 1 (applyMangaAutofill), Task 3 (autofill JSX) |
| 5.1 Add tab — Franchise ACG, required | Task 2 (submitManga validation + franchise modal) |
| 5.1 Add tab — Series optional | Task 2 (series modal) |
| 5.1 Add tab — Reading Status default Might Read | Task 1 (defaultManga) |
| 5.1 Add tab — Is Main default 本傳 | Task 1 (defaultManga) |
| 5.1 Add tab — all manga fields | Task 3 (full JSX) |
| 5.1 On submit → franchise modal → series modal → POST | Task 2 (submitManga) |
| 5.2 Modify tab — search bar suggestion style | Task 4 (searchResults, sub label) |
| 5.2 Modify tab — recently modified | Task 4 (recentItems) |
| 5.2 Modify tab — sibling ribbon | Task 6 (ribbon JSX) |
| 5.2 Modify tab — full edit form | Task 6 (form JSX) |
| 5.2 Modify tab — System ID immutable | Shared header already shows system_id (line 1705) — no extra work |
| 5.2 Modify tab — MangaNotes | Task 6 (form JSX bottom) |
| 5.2 On submit → PATCH → replace | Task 5 (saveManga) |
| 5.2 Deep-link ?id=&type=manga | Task 4 (urlType === "manga") |
| 5.3 Delete tab — search with franchise/status subtitle | Task 7 (SearchBox renderItem) |
| 5.3 Delete tab — entry info card | Task 7 (selectedManga JSX) |
| 5.3 Cascade — orphan series if last entry (all types) | Task 7 (cascade checks) |
| 5.3 Cascade — orphan franchise if last entry | Task 7 (cascade checks) |
| 5.3 DELETE /api/manga/:id | Task 7 (executeDelete) |

All requirements covered. No gaps.
