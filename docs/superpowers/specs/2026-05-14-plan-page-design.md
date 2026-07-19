# Plan Page — Design Spec

**Date:** 2026-05-14  
**Status:** Approved

---

## Context

The Statistics page currently hosts two planning-oriented blocks — Watch Next and To Rewatch — alongside chart-heavy stats content (rating distributions, franchise grids, seasonal). These blocks are functionally about *what to watch next*, not statistics, so they feel out of place. Adding a dedicated Plan page gives them a proper home and de-clutters the Statistics page.

---

## Architecture

### New files

```
frontend/src/
├── pages/
│   ├── Plan.jsx                    ← page entry point
│   └── plan/
│       ├── PlanWatchNext.jsx       ← moved + renamed from statistics/StatsWatchNext.jsx
│       ├── PlanToRewatch.jsx       ← moved + renamed from statistics/StatsToRewatch.jsx
│       └── usePlanData.js          ← new data hook
└── utils/
    └── statsUtils.js               ← moved from statistics/statsUtils.js
```

### Modified files

| File | Change |
|---|---|
| `frontend/src/pages/Statistics.jsx` | Remove `<StatsWatchNext>` and `<StatsToRewatch>` imports and JSX |
| `frontend/src/pages/statistics/StatsFavoriteGrids.jsx` | Update statsUtils import path |
| `frontend/src/pages/statistics/StatsWatchNext.jsx` | Deleted |
| `frontend/src/pages/statistics/StatsToRewatch.jsx` | Deleted |
| `frontend/src/App.jsx` | Add `/plan` route |
| `frontend/src/components/Nav.jsx` | Add Plan link under More group (desktop + mobile) |
| `docs/pages.md` | Add Plan page section; remove blocks from Statistics section |

---

## Components

### `Plan.jsx`
- Page shell matching Statistics pattern: `<div className="max-w-screen-xl mx-auto px-4 py-8 space-y-10">`
- Calls `usePlanData()` for loading/error state and data
- Renders `<PlanWatchNext>` then `<PlanToRewatch>`, passing all data as props

### `PlanWatchNext.jsx` (from `StatsWatchNext.jsx`)
- No logic changes — only rename and updated imports (`statsUtils` path)
- 695-line component, 7 media type tabs (anime, anime-movie, movie, tv-show, cartoon, manga, novel)
- Groups anime franchises by `watch_next_group`; filters other types by `watch_next` / `read_next` flags

### `PlanToRewatch.jsx` (from `StatsToRewatch.jsx`)
- No logic changes — only rename and updated imports (`statsUtils` path)
- 514-line component, 7 media type tabs
- Filters by `to_rewatch` / `to_reread` flags; sorts anime alphabetically

### `usePlanData.js`
- Mirrors the non-seasonal portion of `useStatisticsData.js`
- `Promise.all` of 8 endpoints: `/api/franchise/`, `/api/anime/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/manga/`, `/api/novel/`
- Builds `franchiseMap` (system_id → franchise) and `allEntriesByFranchise` (franchise_id → entries[])
- Returns: `{ loading, error, franchises, animeData, animeMovieData, moviesData, tvShowData, cartoonData, mangaData, novelData, franchiseMap, allEntriesByFranchise }`

### `statsUtils.js` (moved to `src/utils/`)
- No logic changes — only path change
- Exports: `getDisplayName(franchise)`, `getCoverForSlot(franchise, allEntriesByFranchise)`
- Used by: `PlanWatchNext.jsx`, `PlanToRewatch.jsx`, `StatsFavoriteGrids.jsx`

---

## Data Flow

```
Plan.jsx
  └── usePlanData()
        └── Promise.all([8 API endpoints])
              ├── builds franchiseMap
              └── builds allEntriesByFranchise
  ├── <PlanWatchNext  franchises animeData ... franchiseMap allEntriesByFranchise />
  └── <PlanToRewatch franchises animeData ... franchiseMap allEntriesByFranchise />
```

`Statistics.jsx` is unchanged in its data fetching — `useStatisticsData.js` keeps all 10 endpoints for its remaining blocks (seasonal, rating distributions, franchise grids).

---

## Navigation

### Desktop (`Nav.jsx` — More dropdown)
Insert `Plan` **before** `Statistics` in the `<DropdownMenu label="More">` items:

```jsx
<NavLink to="/plan" icon="fas fa-clipboard-list">Plan</NavLink>
<NavLink to="/statistics" icon="fas fa-chart-bar">Statistics</NavLink>
<NavLink to="/future-releases" icon="fas fa-calendar-plus">Future Release</NavLink>
<NavLink to="/seasonal" icon="fas fa-leaf">Seasonal</NavLink>
```

### Mobile (`Nav.jsx` — More accordion)
Insert `Plan` link before Statistics link in the `<details>` accordion, using the same `<Link>` pattern as existing entries.

### Route (`App.jsx`)
Add as a public route (no auth guard), matching Statistics pattern:
```jsx
<Route path="/plan" element={<Plan />} />
```

---

## Verification

1. Start dev server (`uvicorn app.main:app --reload` + `cd frontend && npm run dev`)
2. Navigate to Plan page via nav More → Plan
3. Verify Watch Next block loads with all 7 tabs, covers display, anime groups by episode count
4. Verify To Rewatch block loads with all 7 tabs, ratings display
5. Navigate to Statistics page — confirm Watch Next and To Rewatch blocks are gone, all other stats blocks still render
6. Confirm nav ordering: Plan → Statistics → Future Release → Seasonal (both desktop and mobile)
7. Confirm `statsUtils.js` import works for `StatsFavoriteGrids.jsx` (no console errors)
