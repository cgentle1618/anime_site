# Plan: Multiple Franchise Types + Unified Franchise Page

## Context

Currently `franchise_type` is a single string per franchise (e.g., "ACG", "Cartoon"). The goal is to support comma-separated multiple types (e.g., "ACG, Cartoon") for franchises that span multiple media categories. Alongside this, the three separate franchise detail pages (FranchiseAcg, FranchiseReality, FranchiseCartoon) are replaced by one unified `FranchisePage.jsx` with a tabbed UI that renders content sections conditionally based on the parsed types.

No database migration is required — `franchise_type` is already a plain `String` column.

---

## Progress

All 6 steps completed. All files modified/created. Ready for testing and commit.

---

## Step 1 — Backend: `find_duplicate_franchises()` in `services/other_logics.py:889-893`

Expand comma-separated types when building the `by_type` grouping buckets. A franchise typed `"ACG, Cartoon"` will appear in both the `"ACG"` and `"Cartoon"` buckets so it is compared against franchises of either type.

**Replace lines 889–893:**

```python
# CURRENT
by_type: dict[str, list] = {}
for f in franchises:
    ft = (f.franchise_type or "").strip()
    if ft:
        by_type.setdefault(ft, []).append(f)

# NEW
by_type: dict[str, list] = {}
for f in franchises:
    ft_raw = (f.franchise_type or "").strip()
    tokens = [t.strip() for t in ft_raw.split(",") if t.strip()]
    for token in tokens if tokens else ([ft_raw] if ft_raw else []):
        by_type.setdefault(token, []).append(f)
```

---

## Step 2 — Frontend Utility: `parseTypes()` in `frontend/src/utils/anime.js`

Add one export at the end of the file. All downstream consumers use this instead of raw string comparison.

```js
export function parseTypes(franchiseType) {
  if (!franchiseType) return [];
  return franchiseType
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
```

---

## Step 3 — `FranchiseLibrary.jsx`: Multi-type filter matching

**File:** `frontend/src/pages/FranchiseLibrary.jsx`

Import `parseTypes`. Update the type filter block (lines ~159–163) so a franchise with "ACG, Cartoon" matches both the "ACG" and "Cartoon" filter buttons:

```js
// CURRENT
if (filters.franchiseType.size > 0) {
  const ft = f.franchise_type;
  const isOther = !ft || !KNOWN_TYPES.includes(ft);
  const bucket = isOther ? "Other" : ft;
  if (!filters.franchiseType.has(bucket)) return false;
}

// NEW
if (filters.franchiseType.size > 0) {
  const tokens = parseTypes(f.franchise_type);
  const matchesKnown = tokens.some((t) => filters.franchiseType.has(t));
  const isOther =
    tokens.length === 0 || tokens.every((t) => !KNOWN_TYPES.includes(t));
  if (!matchesKnown && !(isOther && filters.franchiseType.has("Other")))
    return false;
}
```

---

## Step 4 — Admin Forms: Checkbox group + ComboBox filter fix

**Files:** `frontend/src/pages/Add.jsx`, `frontend/src/pages/Modify.jsx`

Import `parseTypes` in both files.

### 4a. Franchise type input → checkbox group

Locate the `<Field label="Franchise Type">` block in the franchise form section of each file. Replace the single `<select>` with checkboxes:

```jsx
<Field label="Franchise Type">
  <div className="flex flex-wrap gap-2">
    {["ACG", "Anime Movie", "TV or Movie", "Cartoon"].map((v) => {
      const types = parseTypes(ff.franchise_type);
      const checked = types.includes(v);
      return (
        <label
          key={v}
          className="flex items-center gap-1.5 text-sm font-medium cursor-pointer"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {
              const next = checked
                ? types.filter((t) => t !== v)
                : [...types, v];
              uf("franchise_type", next.join(", "));
            }}
            className="rounded accent-brand"
          />
          {v}
        </label>
      );
    })}
  </div>
</Field>
```

### 4b. ComboBox franchise filters in item forms → `includes()` check

8 substitutions total (4 in each file). Replace exact-match predicates:

```js
// CURRENT patterns (one per item type)
f.franchise_type === "TV or Movie" || !f.franchise_type;
f.franchise_type === "Cartoon" || !f.franchise_type;
f.franchise_type === "ACG" || !f.franchise_type;

// NEW
parseTypes(f.franchise_type).includes("TV or Movie") || !f.franchise_type;
parseTypes(f.franchise_type).includes("Cartoon") || !f.franchise_type;
parseTypes(f.franchise_type).includes("ACG") || !f.franchise_type;
```

Locations:

- `Add.jsx`: ~lines 3045, 3501 (TV or Movie), ~3979 (Cartoon), ~4466 (ACG)
- `Modify.jsx`: ~lines 3620, 4021 (TV or Movie), ~4435 (Cartoon), ~4942 (ACG)

---

## Step 5 — New `FranchisePage.jsx`: Unified Tabbed Detail Page

**Create:** `frontend/src/pages/FranchisePage.jsx`

### Data fetching

Fetch all 8 endpoints in parallel on mount (franchise, series, anime, anime-movie, movies, tv-shows, cartoon, manga). All fetches use `franchise_id={system_id}`.

### Tab derivation (after data loads)

```js
const types = parseTypes(franchise.franchise_type);
const hasACG = types.includes("ACG") || types.includes("Anime");
const hasACGFull = types.includes("ACG"); // Manga tab only for ACG
const hasTvMovie = types.includes("TV or Movie");
const hasCartoon = types.includes("Cartoon");

// Only show tabs that have entries
const tabs = [
  hasACG && animeList.length && "Anime",
  hasACG && animeMovieList.length && "Anime Movies",
  hasACGFull && mangaList.length && "Manga",
  hasTvMovie && movieList.length && "Movies",
  hasTvMovie && tvList.length && "TV Shows",
  hasCartoon && cartoonList.length && "Cartoons",
].filter(Boolean);
```

Default active tab: `tabs[0] ?? null` (state).

### Structure

1. **Hero section** — breadcrumb, admin toolbar, title/badges (same as existing pages). Show Watch Next Group and To Rewatch only when `hasACG`.
2. **Notes / Remarks card** — unchanged from existing pages.
3. **Series card** — unchanged.
4. **Tab bar** — render only if `tabs.length > 1`. Each tab shows label + count badge.
5. **Tab content** — conditional rendering per active tab. Content and state (sort, filters, groupBySeries) copied verbatim from respective existing pages, namespaced to avoid collisions.

### Tab bar component

```jsx
{
  tabs.length > 1 && (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === tab
              ? "border-brand text-brand"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
          <span className="ml-1.5 text-xs font-bold bg-gray-100 px-1.5 py-0.5 rounded-full">
            {getTabCount(tab)}
          </span>
        </button>
      ))}
    </div>
  );
}
```

### State per tab

Mirror existing pages' state declarations with unique prefixes to avoid collision (e.g., `cartoonSort`, `tvFilters`, `mangaGroupBySeries`). Each tab's `useMemo` computations (filteredAndSorted, seriesGroups) are namespaced similarly.

---

## Step 6 — Simplify `Franchise.jsx` Dispatcher

**File:** `frontend/src/pages/Franchise.jsx`

Replace entire file content:

```jsx
import FranchisePage from "./FranchisePage";
export default function Franchise() {
  return <FranchisePage />;
}
```

The three old pages (`FranchiseAcg.jsx`, `FranchiseReality.jsx`, `FranchiseCartoon.jsx`) are left in place and can be deleted in a follow-up cleanup commit.

---

## Files Changed

| File                                      | Change                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| `services/other_logics.py`                | Expand comma-separated types in `find_duplicate_franchises()` |
| `frontend/src/utils/anime.js`             | Add `parseTypes()` export                                     |
| `frontend/src/pages/FranchiseLibrary.jsx` | Multi-type filter matching                                    |
| `frontend/src/pages/Add.jsx`              | Checkbox group; 4 ComboBox filters use `includes()`           |
| `frontend/src/pages/Modify.jsx`           | Same as Add.jsx                                               |
| `frontend/src/pages/FranchisePage.jsx`    | **New** unified tabbed franchise detail page                  |
| `frontend/src/pages/Franchise.jsx`        | Simplified dispatcher pointing to FranchisePage               |

No DB migrations, no new API endpoints, no new backend routes.

---

## Verification

1. **Backend** — Call `find_duplicate_franchises()` with a franchise typed `"ACG, Cartoon"`. Confirm it is compared against both ACG and Cartoon siblings.
2. **Admin forms** — Check "ACG" + "Cartoon" → API payload has `franchise_type: "ACG, Cartoon"`. Load same franchise back → both checkboxes checked.
3. **ComboBox filters** — Adding a Movie shows franchises that include "TV or Movie" as one of their types (not only exact match).
4. **FranchiseLibrary** — A franchise typed `"ACG, Cartoon"` appears under both the "ACG" filter and the "Cartoon" filter.
5. **FranchisePage** — Navigate to:
   - `"ACG"` franchise → Anime / Anime Movies / Manga tabs (only tabs with entries)
   - `"TV or Movie"` franchise → Movies / TV Shows tabs
   - `"Cartoon"` franchise → Cartoons tab
   - `"ACG, Cartoon"` franchise → All relevant tabs from both types
6. **Regression** — All existing single-type franchises render correctly in the new page.
