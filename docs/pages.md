# Pages Documentation

React SPA served by FastAPI's catch-all route. All routing is client-side via React Router v6 (`BrowserRouter` + `Routes`). Non-API paths return `frontend_dist/index.html`. Data is fetched via native `fetch()` in `useEffect` hooks (TanStack Query is wired up but not actively used for queries yet).

---

## Route Map

| Path | Component | Access |
|---|---|---|
| `/` | `Index` | Public |
| `/login` | `Login` | Public |
| `/search` | `Search` | Public |
| `/library/anime` | `LibraryAnime` | Public |
| `/library/franchise` | `FranchiseLibrary` | Public |
| `/future-releases` | `FutureReleases` | Public |
| `/anime/:system_id` | `Anime` | Public |
| `/franchise/:system_id` | `FranchiseAcg` | Public |
| `/seasonal` | `SeasonalOverall` | Public |
| `/seasonal/:seasonal_id` | `SeasonalDetail` | Public |
| `/statistics` | `Statistics` | Public |
| `/under-development` | `UnderDevelopment` | Public |
| `/system` | `Admin` | Admin only |
| `/add` | `Add` | Admin only |
| `/modify` | `Modify` | Admin only |
| `/delete` | `Delete` | Admin only |

Admin routes are wrapped by `ProtectedRoute`, which redirects unauthenticated users to `/login?next=<path>`.

---

## Universal Layout

**File:** `frontend/src/components/Layout.jsx`

Shell rendered for every route. Contains:
- `<Nav>` — sticky top navigation bar
- `<Outlet>` — page content
- Footer with copyright and version
- `<Toast>` — global toast display
- Scroll-to-top button

### Navigation Bar (`Nav.jsx`)

- **Logo** — navigates to dashboard (`/`)
- **Page navigation dropdowns:**
  - Library → Anime Library, Franchise Library (others redirect to `/under-development`)
  - More → Statistics, Future Releases, Seasonal Overall, Seasonal Detail
  - Admin dropdown (admin only) → Admin, Add, Modify, Delete
- **Universal search bar** — debounced, client-side filtering; caches full DB on first query; supports scope selector (All / Seasonal / Franchise / Anime — others show under-development stub). Results grouped by kind and shown as suggestion entries.
- **Backup button** (admin only) — triggers `POST /api/data-control/backup`
- **Login / Logout button**

---

## Entry Cards

Three variants of the anime entry card are used across pages. Card variant selection is per-page and documented in each page section below.

### `DashboardCard` (First Type)
**File:** `frontend/src/components/DashboardCard.jsx`

Wide horizontal card used on dashboard and seasonal pages.
- Cover image, title (CN with fallback), franchise name, watching status, airing type/status badges
- Episode progress bar + Ep Watched / Ep Total display
- Admin: inline +/- episode controls and direct-edit input

### `AnimeCard` (Second Type)
**File:** `frontend/src/components/AnimeCard.jsx`

Poster-style card (3:4 ratio) used on library, franchise, and search pages.
- Poster image, title (CN with fallback), franchise name
- My Rating badge (hidden if null), MAL score
- Airing status + airing type badges
- Bahamut / Netflix / other source icons
- Progress % indicator + Ep Watched / Ep Total
- Admin: inline status toggle button, edit (pencil) button linking to Modify page

### `AnimeCardThird` (Third Type)
**File:** Defined inline in `frontend/src/pages/FutureReleases.jsx`

Compact card used on Future Releases.
- Poster image, title (CN with fallback), airing type, Bahamut icon, total episodes
- Admin: watching-status selector and "Mark as Airing" button

---

## Pages

### Dashboard (`/`)
**File:** `frontend/src/pages/Index.jsx`

Current progress page. Shows all actively tracked media.

**Data loaded:**
- `GET /api/anime/`
- `GET /api/franchise/`

**Layout:**

**Watching division** (Anime · TV Show · Cartoon) — three sub-sections: Active Watching / Passive Watching / Paused.
- All entries are sorted globally by franchise name (CN → EN fallback) then `watch_order`, then divided by `watching_status`.
- Within each sub-section, entries are further grouped by type (Anime / TV Show / Cartoon) and sorted by `my_rating` within each type group.
- Each anime entry uses **DashboardCard (First Type)**.
- Admin: inline episode progress editing via `PATCH /api/anime/:system_id`.

**Reading division** (Manga · Novel · Comics) — rendered with an under-development placeholder. No data loaded for this division yet.

---

### Login (`/login`)
**File:** `frontend/src/pages/Login.jsx`

Simple username/password form.

**Data loaded:**
- `POST /api/auth/login` (form-urlencoded)

On success, calls `refetchAuth()` and navigates to `?next` param or `/system`.

---

### Anime Detail (`/anime/:system_id`)
**File:** `frontend/src/pages/Anime.jsx`

Full detail page for a single anime entry.

**Data loaded:**
- `GET /api/anime/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`
- `GET /api/anime/` (for prequel/sequel linking)

**Layout (left column):**
- Anime poster
- Navigation buttons: Bahamut, Netflix, Official Website, Twitter, MAL, AniList, Other Source (shown when applicable)

**Layout (right column):**
- Airing status, airing type
- Anime Name CN (with fallback); Anime Name EN (hidden if CN used fallback)
- Franchise link (navigates to `/franchise/:id`)
- Series name (click to show popup with series info)
- MAL Score, MAL Rank, AniList Score, Last Updated Time

**My Tracker section:**
- Ep Watched / Ep Total + cumulative count if applicable
- Watching Status (admin editable)
- My Rating (admin editable)
- Admin: +/- episode controls, direct edit input

**Related Entries section:**
- Watch Order, Prequel, Alternatives, Sequel — each shown as mini card (poster + name CN + airing type)
- Alternatives can be multiple; prequel/sequel are singular

**Detail cards:**
- Naming Card: Alt Name, JP Name, Roman Name
- Information Card: Season/Part, Airing Type, Airing Status, Release Season, Release Date, Total Ep (+ cumulative), Genre Main, Genre Sub
- Production Card: Studio, Distributor TW, Director, Producer, Music/Composer
- Characters & Cast Card (TBD)
- Music Card (admin editable): OP, ED, Insert/OST dropdowns — rendered in `AnimeNotes`
- Notes and Remarks Card (admin editable) — rendered in `AnimeNotes`

**Admin controls block:**
- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → `POST /api/data-control/replace/anime/:system_id`

Admin writes use `PATCH /api/anime/:system_id`.

**Sub-component:** `AnimeNotes` (`frontend/src/pages/AnimeNotes.jsx`) — structured notes editor with 17 sections; saves via callback to parent which PATCHes `notes` field.

---

### Franchise Hub (`/franchise/:system_id`)
**File:** `frontend/src/pages/FranchiseAcg.jsx`

Hub page for an ACG franchise (Anime, Anime Movie, Manga, Novel types).

**Data loaded:**
- `GET /api/franchise/:system_id`
- `GET /api/series/?franchise_id=:system_id`
- `GET /api/anime/?franchise_id=:system_id`

**Layout:**
- Franchise Name CN (with fallback), EN, Roman, JP, Alt (each hidden if CN used that name as fallback)
- `favorite_3x3_slot` display
- My Franchise Rating (admin editable)
- My Franchise Expectations (admin editable)
- Completion percentage bar (total entries)
- Notes and Remarks (admin editable)

**Sort options:** Title (default) / Release Date / My Rating / MAL Rating / Watch Order
- Watch Order sort applies to anime only; other types sort by title. Entries without watch_order go to bottom of anime section.

**Anime entry filter:** Airing Type / Airing Status / Watching Status / 巴哈 (source_baha)

**Anime Entry Section** (sticky header, grouped by Series) — each card uses **AnimeCard (Second Type)**

**Manga Entry Section** (sticky header) — TBD stub

**Novel Entry Section** — TBD

Admin edit: `PATCH /api/franchise/:system_id` for rating, expectation, watch_next group, to_rewatch flag, remarks.

---

### Anime Library (`/library/anime`)
**File:** `frontend/src/pages/LibraryAnime.jsx`

Full anime library with client-side filtering via `useMemo`.

**Data loaded:**
- `GET /api/anime/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**
- Filter search: by anime title, franchise title, series title, release season (e.g. WIN 2026), release date, release year, genre_main/genre_sub. Case/punctuation/space insensitive.
- Advanced filters (collapsible): Airing Type, Airing Status, Watching Status, 巴哈
- Sort by: Title (default) / My Rating / MAL Rating / Release Date (new to old, TBD first)
- Grid/Table view toggle

**Grid view** — each card uses **AnimeCard (Second Type)**

**Table view** — compact sticky-header table with columns: Franchise, Anime Name CN, Anime Name EN (fallback: Roman), Anime Name Alt, Airing Type, Season/Part, Airing Status, Ep Finished/Total, My Rating, MAL Rating, Studio, Bahamut icon, + button (admin status toggle)

Admin: inline quick-status toggle via `PATCH /api/anime/:system_id`.

---

### Franchise Library (`/library/franchise`)
**File:** `frontend/src/pages/FranchiseLibrary.jsx`

Franchise grid library.

**Data loaded:**
- `GET /api/franchise/`
- `GET /api/anime/`

Cover image derived from the most-recently-released anime with a cover in each franchise, or overridden by `cover_anime_id`.

**Library bar:**
- Filter search: by franchise title
- Filter by franchise type: ACG / Anime Movie / TV or Movie / Cartoon / Other
- Sort by: Title (default) / My Rating / Expectation
- Grid/Table view toggle (Table shows "Under Development")

Each card navigates to `/franchise/:system_id`.

---

### Seasonal Overall (`/seasonal`)
**File:** `frontend/src/pages/SeasonalOverall.jsx`

Two-tab seasonal view.

**Data loaded:**
- `GET /api/seasonal/current-season`
- `GET /api/seasonal/`
- `GET /api/franchise/`
- `GET /api/anime/?airing_season=:current` and `?airing_season=:next`

**Current Season tab:**
- **This Season block** — Seasonal Name, Total/Completed entry counts, completion bar, Seasonal Rating (admin editable), anime grid sorted by: Watching Status order (Completed → Watching → Planned → Might Watch → Dropped), then My Rating, then Franchise Expectation. Each card uses **DashboardCard (First Type)**.
- **Next Season block** — same structure, sorted by: Watch When Airs → Plan to Watch → Might Watch → Other → Won't Watch, then My Rating, then Franchise Expectation.
- Rating distribution bar charts (My Rating, MAL Rating)

**All Seasons tab:**
- Year/season matrix (new to old) with navigation links to `/seasonal/:id`
- Current season highlighted; unavailable seasons greyed out

Admin: `PATCH /api/seasonal/:id` for rating; `PATCH /api/anime/:id` for episode progress.

---

### Seasonal Detail (`/seasonal/:seasonal_id`)
**File:** `frontend/src/pages/SeasonalDetail.jsx`

Detailed view for one season.

**Data loaded:**
- `GET /api/seasonal/:seasonal_id`
- `GET /api/anime/?airing_season=:seasonal_id`
- `GET /api/franchise/`

**Layout:**
- Seasonal Name, Total/Completed counts, completion bar
- Seasonal Rating (admin editable)
- Prev/Next navigation arrows
- My Rating and MAL Rating distribution bar charts
- Anime sections grouped by status: Completed / Watching / Planned / Might Watch / Dropped — each uses **DashboardCard (First Type)**

Admin: `PATCH /api/seasonal/:id` for rating; `PATCH /api/anime/:id` for episode progress.

---

### Statistics (`/statistics`)
**File:** `frontend/src/pages/Statistics.jsx`

Multi-section statistics dashboard.

**Data loaded:**
- `GET /api/franchise/`
- `GET /api/anime/`
- `GET /api/seasonal/`
- `GET /api/seasonal/current-season`

**Sections:**
1. **Favorite ACG Franchise 3×3 Grid** — franchises with `favorite_3x3_slot` 1–9, shown as poster grid
2. **Rating Distribution** — horizontal bar charts for My Rating (franchise-level), MAL Rating (anime-level), Seasonal Rating
3. **Anime Seasonal Overview** — paginated table (12 per page, new to old) showing: Release Season, My Seasonal Rating, # Completed, # Watching, # Dropped
4. **Watch Next** — tabbed franchise grid grouped by 12ep / 24ep / 30ep+. Anime tab live; other tabs TBD.
5. **To Rewatch** — tabbed franchise grid. Anime tab live; other tabs TBD.
6. **Recent Completions** — paginated list (10 per page) of completed anime sorted by `completed_at`, grouped by TV / Movie / ONA / Others. Shows: Anime Name CN, Franchise Name CN, My Rating, Completed Date. Other media type tabs TBD.

---

### Future Releases (`/future-releases`)
**File:** `frontend/src/pages/FutureReleases.jsx`

Upcoming anime (`airing_status === "Not Yet Aired"`).

**Data loaded:**
- `GET /api/anime/`
- `GET /api/franchise/`
- `GET /api/system/config/current_season`

**Filter chips:** All / TV / ONA / Movie / Other (OVA, OAD, Special, null)

**Grouping/Sort:** By release season old-to-new, then by Watching Status (Watch When Airs → Plan to Watch → Might Watch), then by Franchise Expectation.
- Entries with release season grouped first; release-year-only entries second; TBD last.

Each entry uses **AnimeCardThird (Third Type)**. Admin: inline watching-status selector and "Mark as Airing" button (PATCHes airing_status; entry removed from list immediately).

Tabs for Anime Movie, Movie, TV Show future releases — TBD.

---

### Search (`/search`)
**File:** `frontend/src/pages/Search.jsx`

Reads `?q` and `?scope` query params. Client-side filtering over full data fetched upfront.

**Data loaded (conditional on scope):**

| Scope | Fetches |
|---|---|
| `all` | franchise, anime, series, seasonal |
| `franchise` | franchise only |
| `anime` | franchise + anime |
| `series` | series only |
| `seasonal` | seasonal only |

**Layout:**
- "Showing results for `<input>`"
- Filter by Franchise (pill chips showing Franchise Name CN with fallback)
- **Franchise Hub Section** — Franchise Name CN + EN (hidden if CN used fallback) + Franchise Type
- **Anime Entry Section** — split by Airing Type TV/ONA / Movie / Other; each entry uses **AnimeCard (Second Type)**
- **Manga Entry Section** — TBD stub
- **Anime Movie, Movie, TV Show, Cartoon Sections** — TBD stubs

---

### Under Development (`/under-development`)
**File:** `frontend/src/pages/UnderDevelopment.jsx`

Placeholder page with under-construction notice, Go Back button, and Return to Dashboard button.

---

## Admin-Only Pages

All admin pages redirect to `/login?next=<path>` if not authenticated (enforced by `ProtectedRoute`).

---

### System Admin (`/system`)
**File:** `frontend/src/pages/Admin.jsx`

**Sections:**

**Set Current Season:**
- Displays current season value from `GET /api/system/config/current_season`
- Season dropdown + year input + Confirm Set button → `POST /api/system/config/current_season`

**Data Control Actions:**
- Fill: Fill All / Fill Anime — streaming SSE via `POST /api/data-control/fill/all` or `/fill/anime`
- Replace: Replace All / Replace Anime — streaming SSE via `POST /api/data-control/replace/all` or `/replace/anime`
- Pull from Sheets: Pull All / Pull Specific → `POST /api/data-control/pull[/:type]`
- Backup (Push) → `POST /api/data-control/backup`

**Calculate & Fix:**
- Calculate All → `POST /api/data-control/calculate/all`
- Find Duplicates → `GET /api/data-control/check/duplicates`
- Check & Download Covers (multi-step): `GET /api/data-control/calculate/check-cover-image` → `POST /api/data-control/calculate/download-missing-covers` → `POST /api/data-control/calculate/set-cover-image-fields` → `DELETE /api/data-control/calculate/delete-orphaned-covers`

**Data Control Log:**
- Paginated table of all pipeline runs from `GET /api/system/logs`
- Each row shows: Action Type, Action Time, Status (Success/Fail), Metrics (Added/Modified/Deleted)
- Per-row delete: `DELETE /api/system/logs/:id`; Clear old: `DELETE /api/system/logs`

**Database Record History:**
- Modified Franchise — shows: Modified Time, Franchise Type, Franchise Name CN
- Modified Anime — shows: Modified Time, Anime Name CN, Airing Type, Airing Status, Watching Status
- Recently Added Franchise — shows: Added Time, Franchise Type, Franchise Name CN
- Recently Added Entry — shows: Added Time, Entry Type, Entry Name CN, Airing Type, Season/Part
- All sourced from full local fetches of `GET /api/anime/`, `GET /api/franchise/`, `GET /api/series/` (no dedicated history endpoints)

**Recently Deleted Records:**
- Paginated table from `GET /api/system/deleted`
- Each row: Deleted Time, Entry Type, Name CN, Name EN, Additional Info (franchise type / parent franchise / parent series / option category)
- Per-row delete and clear-old buttons

---

### Add (`/add`)
**File:** `frontend/src/pages/Add.jsx`

Multi-tab form for creating new records. Shows most recently added entry at top as quick reference.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`

**Tabs (currently implemented: Anime, Franchise, Series, System Option):**

**Add New Anime Entry Tab:**
- Titles & Naming: Franchise Name (ComboBox with auto-create modal), Series Name (ComboBox with auto-create modal), EN/CN/Roman/JP/Alt names, Season dropdown, Part dropdown
- Status & Progress: Airing Status, Watching Status, Total Ep of Previous Entries, Total Ep, Episode Finished, My Rating, MAL Rating/Rank, AniList Rating
- Classification: Airing Type (default: TV), Main/Spinoff (default: 本傳), Genre Main (multi-select), Genre Sub (multi-select)
- Production: Release Season/Month/Year, Studio, Distributor TW, Director, Producer, Music/Composer (all multi-selectable dropdowns)
- Relational & Timeline: Prequel ID, Sequel ID, Alternative ID, Watch Order
- Source & Links: MAL ID/Link, AniList Link, Official Website, Twitter, 巴哈 (source_baha), 巴哈 Link, Netflix (source_netflix), Other Source Name/Link
- Notes & Other: Music Status, Seiyuu, Remark
- Duplicate detection modal, Jikan enrichment after submit via `POST /api/data-control/replace/anime/:id`

**Add New Franchise Tab:** EN/CN/Roman/JP/Alt names, Franchise Type, My Rating, Franchise Expectation, favorite_3x3_slot, Remark

**Add New Series Tab:** Franchise Name, Series Name EN/CN/Alt

**Add New System Option Tab:** Category dropdown, one or more option_value inputs, "More Entries" / "Append Entry" buttons

**Planned tabs (TBD):** Anime Movie, Movie, TV Show, Cartoon, Manga, Novel

---

### Modify (`/modify`)
**File:** `frontend/src/pages/Modify.jsx`

Search-then-edit pattern. Shows most recently modified entry at top. Supports `?id=:uuid` deep-link.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`

**Tabs (currently implemented: Anime, Franchise, Series, System Option):**

Each tab has:
- Recently modified items as quick-access cards
- Search bar (searches Franchise + Series + Entry names; results grouped by franchise/series, sorted by franchise then entry name; shown as Search Suggestion Entry)
- After selecting, shows all sibling entries in same franchise (scrollable), then the full edit form
- Form fields mirror Add page plus System ID display (immutable)
- Update Button; Anime tab also triggers Jikan enrichment via `POST /api/data-control/replace/anime/:id`

**Planned tabs (TBD):** Anime Movie, Movie, TV Show, Cartoon, Manga, Novel

Writes use:
- `PATCH /api/anime/:id`, `PATCH /api/franchise/:id`, `PATCH /api/series/:id`, `PATCH /api/options/:id`
- `POST /api/franchise/` and `POST /api/series/` for on-the-fly creation during save

---

### Delete (`/delete`)
**File:** `frontend/src/pages/Delete.jsx`

Search-then-delete pattern. Shows most recently deleted entry at top.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`

**Tabs (currently implemented: Anime, Franchise, Series, System Option):**

**Anime / Franchise / Series tabs:**
- Search bar with results shown as Search Suggestion Entry
- After selecting, shows Entry Info for Deletion + Delete button
- Cascade options:
  - If only entry of a series: offer to delete the series or keep it
  - If only entry of a franchise: offer to delete the franchise or keep it
  - Shows count of all entry types belonging to series/franchise (e.g. Anime: 6, Manga: 1)

**System Option tab:**
- Category dropdown → all options shown with per-row Delete button (no confirmation needed)

**Planned tabs (TBD):** Anime Movie, Movie, TV Show, Cartoon, Manga, Novel

Deletes use:
- `DELETE /api/anime/:id`, `DELETE /api/franchise/:id`, `DELETE /api/series/:id`, `DELETE /api/options/:id`

---

## Reusable Components Summary

| File | Used By | Purpose |
|---|---|---|
| `components/Layout.jsx` | All pages | Shell: Nav + Outlet + Toast + scroll-to-top |
| `components/Nav.jsx` | All pages | Top navigation, universal search, backup button |
| `components/DashboardCard.jsx` | Index, SeasonalOverall, SeasonalDetail | Wide card (First Type) for active-tracking view |
| `components/AnimeCard.jsx` | LibraryAnime, Search, FranchiseAcg | Poster card (Second Type) for library/grid views |
| `components/ProtectedRoute.jsx` | Admin, Add, Modify, Delete | Auth guard; redirects to login if not admin |
| `components/ComboBox.jsx` | Add, Modify | Searchable single-select with "create new" mode |
| `components/MultiSelect.jsx` | Add, Modify | Multi-value field for genres, studios, etc. |
| `components/Toast.jsx` | All pages (via Layout) | Global toast notifications |
| `contexts/AuthContext.jsx` | All pages | Provides `isAdmin` and `refetchAuth` via `GET /api/auth/me` |
| `hooks/useToast.jsx` | All pages | Context + hook for showing toasts |

---

## TBD / Under Development

The following items are planned but not yet implemented:

- **Library pages:** Anime Movie Library, Movie Library, TV Show Library, Cartoon Library, Manga Library, Novel Library, Studio Library, Seiyuu Library
- **Entry detail pages:** Anime Movie, Movie, TV Show, Cartoon, Manga, Novel, Studio
- **Franchise pages:** Reality Franchise (Movies/TV Shows with series), Cartoon Franchise
- **Dashboard:** Manga, Novel, TV Show, Cartoon reading/watching sections
- **Search:** Manga, Anime Movie, Movie, TV Show, Cartoon result sections
- **Future Releases:** Anime Movie, Movie, TV Show tabs
- **Statistics:** Watch Next / To Rewatch / Recent Completions for all non-anime tabs
- **Add/Modify/Delete:** Anime Movie, Movie, TV Show, Cartoon, Manga, Novel tabs
- **Admin:** Deletion History "Other Section"
- **Entry cards:** TV Show, Cartoon, Manga, Novel, Movie, Anime Movie card components
- **Characters & Cast card** on all entry detail pages
