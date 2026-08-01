# Pages Documentation

React SPA served by FastAPI's catch-all route. All routing is client-side via React Router v6 (`BrowserRouter` + `Routes`). Non-API paths return `frontend_dist/index.html`. Data is fetched via native `fetch()` in `useEffect` hooks (TanStack Query is wired up but not actively used for queries yet).

---

## Route Map

| Path                      | Component                                          | Access     |
| ------------------------- | -------------------------------------------------- | ---------- |
| `/`                       | `Index`                                            | Public     |
| `/login`                  | `Login`                                            | Public     |
| `/search`                 | `Search`                                           | Public     |
| `/library/anime`          | `LibraryAnime`                                     | Public     |
| `/library/anime-movie`    | `LibraryAnimeMovie`                                | Public     |
| `/library/franchise`      | `FranchiseLibrary`                                 | Public     |
| `/library/movie`          | `LibraryMovie`                                     | Public     |
| `/future-releases`        | `FutureReleases`                                   | Public     |
| `/anime/:system_id`       | `Anime`                                            | Public     |
| `/anime-movie/:system_id` | `AnimeMovie`                                       | Public     |
| `/movie/:system_id`       | `Movie`                                            | Public     |
| `/franchise/:system_id`   | `Franchise` → `FranchisePage` (unified tabbed hub) | Public     |
| `/tv-show/:system_id`     | `TV`                                               | Public     |
| `/library/tv-show`        | `LibraryTV`                                        | Public     |
| `/cartoon/:system_id`     | `Cartoon`                                          | Public     |
| `/library/cartoon`        | `LibraryCartoon`                                   | Public     |
| `/novel/:system_id`       | `Novel`                                            | Public     |
| `/library/novel`          | `LibraryNovel`                                     | Public     |
| `/seasonal`               | `SeasonalOverall`                                  | Public     |
| `/seasonal/:seasonal_id`  | `SeasonalDetail`                                   | Public     |
| `/plan`                   | `Plan`                                             | Public     |
| `/statistics`             | `Statistics`                                       | Public     |
| `/completions`            | `Completions`                                      | Public     |
| `/under-development`      | `UnderDevelopment`                                 | Public     |
| `/system`                 | `Admin`                                            | Admin only |
| `/data-history`           | `DataHistory`                                      | Admin only |
| `/review-queue`           | `ReviewQueue`                                      | Admin only |
| `/add`                    | `Add`                                              | Admin only |
| `/modify`                 | `Modify`                                           | Admin only |
| `/delete`                 | `Delete`                                           | Admin only |

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
  - ACG → Anime, Anime Movie, Manga, Novel (dev), Seiyuu (dev)
  - Reality _(franchise_type="TV or Movie" only)_ → Franchise Library, TV Show Library, Movie Library
  - Cartoon → Cartoon Library
  - More → Plan, Statistics, Completions, Future Release, Seasonal
  - Admin dropdown (admin only) → Control Center (/system), Data History, Review Queue (/review-queue), Add Entry, Modify Entry, Delete Entry
- **Universal search bar** — debounced, client-side filtering; caches full DB on first query; scope selector: All, Franchise, Series, Anime, Anime Movie, Movie, TV Show, Cartoon, Seasonal. Results grouped by kind and shown as suggestion entries.
- **Backup button** (admin only) — triggers `POST /api/data-control/backup`
- **Login / Logout button**

---

## Entry Cards

Card variants are defined in `reusable-elements.md`. Quick reference:

| Canonical Name           | Code File                  | Used By                                                       |
| ------------------------ | -------------------------- | ------------------------------------------------------------- |
| Anime Entry Card 1       | `DashboardCard.jsx`        | Dashboard, Seasonal Overall, Seasonal Detail                  |
| Anime Entry Card 2       | `AnimeCard.jsx`            | Anime Library, Franchise Hub (Anime tab), Search              |
| Anime Entry Card 3       | `AnimeCardFuture.jsx`      | Future Releases (Anime tab)                                   |
| Anime Movie Entry Card 1 | `AnimeMovieCard.jsx`       | Franchise Hub (Anime Movies tab), Anime Movie Library, Search |
| Anime Movie Entry Card 2 | `AnimeMovieCardFuture.jsx` | Future Releases (Anime Movie tab)                             |
| Movie Entry Card 1       | `MovieCard.jsx`            | Franchise Hub (Movies tab), Movie Library, Search             |
| Movie Entry Card 2       | `MovieCardFuture.jsx`      | Future Releases (Movie tab)                                   |
| TV Show Entry Card 1     | `DashboardCard.jsx`        | Dashboard                                                     |
| TV Show Entry Card 2     | `TVCard.jsx`               | Franchise Hub (TV Shows tab), TV Show Library, Search         |
| TV Show Entry Card 3     | `TVCardFuture.jsx`         | Future Releases (TV Show tab)                                 |
| Cartoon Entry Card 1     | `DashboardCard.jsx`        | Dashboard                                                     |
| Cartoon Entry Card 2     | `CartoonCard.jsx`          | Franchise Hub (Cartoons tab), Cartoon Library, Search         |
| Cartoon Entry Card 3     | `CartoonCardFuture.jsx`    | Future Releases (Cartoons tab)                                |
| Manga Entry Card 1       | `DashboardCard.jsx`        | Dashboard                                                     |
| Manga Entry Card 2       | `MangaCard.jsx`            | Franchise Hub (Manga tab), Manga Library, Search              |
| Manga Entry Card 3       | `MangaCardFuture.jsx`      | Future Releases (Manga tab)                                   |
| Novel Entry Card 1       | `DashboardCard.jsx`        | Dashboard                                                     |
| Novel Entry Card 2       | `NovelCard.jsx`            | Franchise Hub (Novel tab), Novel Library, Search              |

| Franchise Entry Card | | Franchise Library |

Full card specs are in `reusable-elements.md`.

---

## Pages

### Dashboard (`/`)

**File:** `frontend/src/pages/public/Index.jsx`

Current progress page. Shows all actively tracked media.

**Data loaded:**

- `GET /api/anime/`
- `GET /api/franchise/`
- `GET /api/tv-shows/`
- `GET /api/cartoon/`

**Schedule division** (topmost) — two weekly Sunday→Saturday schedules rendered by `WeeklySchedule.jsx`. Column order comes from `SCHEDULE_DAYS` (`frontend/src/config/weekdays.js`), which is Sunday-first so the index matches `Date.getDay()`; today's column is highlighted. Day columns are fixed-width and scroll horizontally so titles have room.

- **Broadcast Schedule**: entries where `airing_status === "Airing"` and `broadcast_day` is set, bucketed by `broadcast_day`. Shows `broadcast_time` (trimmed to `HH:MM`) above the name, sorted by time ascending with missing times last.
- **My Watch Schedule**: entries where `airing_status === "Airing"` and `my_watch_day` is set, bucketed by `my_watch_day`. Name only, sorted alphabetically.
- Entries show the display name (CN priority, via `getDisplayName`) and link to the entry's detail page. Each entry carries a `_media_type` tag (a `MEDIA_CONFIG` key) that resolves both the name prefix and the detail route, so other media types can join by being appended to `scheduleSources` in `Index.jsx`. Anime is the only source today.
- `WeeklySchedule` props: `dayField` selects the bucketing column, and the optional `timeField` turns on the time display and time-based sort.

**Watching division** (Anime · TV Show · Cartoon) — three sub-sections: Active Watching / Passive Watching / Paused.

- All entries sorted globally by franchise name (CN → EN fallback) then `watch_order`, then divided by `watching_status`.
- Within each sub-section, entries grouped by type (Anime / TV Show / Cartoon) and sorted by `my_rating` within each type group.
- All entry types rendered via **Anime Entry Card 1** (`DashboardCard.jsx`) using the `_ui_type` tag
- Admin: inline episode progress editing — `PATCH /api/anime/:id` / `PATCH /api/tv-shows/:id` / `PATCH /api/cartoon/:id` depending on entry type

**Reading division** (Manga · Novel) — rendered with an under-development placeholder. No data loaded for this division yet.

- Manga entries: **Manga Entry Card 1**
- Novel entries: **Novel Entry Card 1**

---

### Login (`/login`)

**File:** `frontend/src/pages/public/Login.jsx`

Simple username/password form.

**Data loaded:**

- `POST /api/auth/login` (form-urlencoded)

On success, calls `refetchAuth()` and navigates to `?next` param or `/system`.

---

### Anime Detail (`/anime/:system_id`)

**File:** `frontend/src/pages/detail/Anime.jsx`

Full detail page for a single anime entry.

**Data loaded:**

- `GET /api/anime/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`
- `GET /api/anime/` (for prequel/sequel linking)

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → `POST /api/data-control/replace/anime/:system_id`

**Layout (left column):**

- Anime poster
- **Sources Card** (reusable) — Bahamut, Netflix, Official Website, Twitter, MAL, AniList, Other Source buttons
- Watch Order
- **Related Entries Card** (reusable) — Watch Order, Prequel, Alternatives, Sequel as mini cards (poster + name CN + airing type)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status, Airing Type
- Main Title: Anime Name CN (with fallback)
- Sub Title: Anime Name EN (hidden if CN used fallback or is null)
- From Franchise: Franchise Name CN with fallback (navigates to `/franchise/:id`)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- **Score Block** (reusable): MAL Score, MAL Rank, AniList Score, Last Updated Time

**My Tracker section** — uses **My Tracker Block** (reusable):

- Ep Watched / Ep Total + cumulative count if applicable
- Watching Status (admin editable)
- My Rating (admin editable)
- Admin: +/- episode controls, direct edit input

**Detail cards:**

- **Naming Card** (reusable): Alt Name, JP Name, Roman Name
- **Information Card** (reusable): Season/Part, Airing Type, Airing Status, Release Season, Release Date, Total Ep (+ cumulative), Genre Main, Genre Sub
- **Production Card** (reusable): Studio, Distributor TW, Director, Producer, Music/Composer
- Characters & Cast Card (TBD)
- Music Card (admin editable): OP, ED, Insert/OST dropdowns
- Remarks — shown when not null
- **`AnimeNotes`** (`frontend/src/pages/detail/AnimeNotes.jsx`) — structured notes editor with 17 sections; always rendered at the bottom; saves via `PATCH /api/anime/:id` with `notes` field.

Admin writes use `PATCH /api/anime/:system_id`.

---

### Anime Movie Detail (`/anime-movie/:system_id`)

**File:** `frontend/src/pages/detail/AnimeMovie.jsx`

Full detail page for a single anime movie entry.

**Data loaded:**

- `GET /api/anime-movie/:system_id`
- `GET /api/franchise/`

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → `POST /api/data-control/replace/anime-movie/:system_id`

**Layout (left column):**

- Anime Movie poster
- **Sources Card** (reusable)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status
- Main Title: Anime Movie Name CN (with fallback)
- Sub Title: Anime Movie Name EN (hidden if CN used fallback or is null)
- From Franchise: Franchise Name CN with fallback (with navigation)
- **Score Block** (reusable): includes Last Updated Time

**Detail sections:**

- **My Tracker Block** (inline — no episode tracking): Watching Status, My Rating, Watch Next checkbox, To Rewatch checkbox
- **Naming Card** (reusable): CN, EN, Alt, JP, Roman
- **Information Card** (reusable): Airing Status, Length, Release Date JP, Release Date TW
- **Production Card** (reusable): Studio, Director
- Characters & Cast Card (TBD placeholder — "Under Development")
- Remarks — shown when not null (admin editable via blur)
- **`AnimeMovieNotes`** (`frontend/src/pages/detail/AnimeMovieNotes.jsx`) — structured notes editor with 15 sections; always rendered at the bottom; saves via `PATCH /api/anime-movie/:id` with `notes` field.

---

### Movie Detail (`/movie/:system_id`)

**File:** `frontend/src/pages/detail/Movie.jsx`

Full detail page for a single movie entry.

**Data loaded:**

- `GET /api/movies/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id&type=movie`
- Mark Completed button — PATCHes `watching_status: "Completed"` and `airing_status: "Finished Airing"`
- Autofill & Update button → `POST /api/data-control/replace/movie/:system_id`

**Layout (left column):**

- Movie poster (with My Rating badge top-left)
- **Sources Card** (reusable) — `source_other` and `imdb_link`; no Bahamut, no Netflix
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status, Movie Type
- Main Title: Movie Name CN (with fallback to EN → Alt)
- Sub Title: Movie Name EN (shown only when CN is the main title)
- From Franchise: Franchise Name CN with fallback (navigates to `/franchise/:id`)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- IMDb Score block (replaces Score Block — shows `imdb_rating` and Last Updated time)

**My Tracker section** (inline — no episode tracking):

- Watching Status dropdown (admin editable) — `PATCH /api/movies/:id`
- My Rating dropdown (admin editable) — `PATCH /api/movies/:id`
- Watch Next checkbox (admin editable) — `PATCH /api/movies/:id`
- To Rewatch checkbox (admin editable) — `PATCH /api/movies/:id`

**Detail cards:**

- **Movie Naming Card** (reusable): CN, EN, Alt
- **Information Card** (reusable): 本傳/外傳 (is_main), Airing Status, Length, Director, Release Date TW, Release Date USA
- Remarks — shown when `remark` is not null (admin editable via blur)
- **`MovieNotes`** (`frontend/src/pages/detail/MovieNotes.jsx`) — structured notes editor with 11 sections; always rendered at the bottom; saves via `PATCH /api/movies/:id` with `notes` field.

Admin writes use `PATCH /api/movies/:system_id`.

---

### TV Show Detail (`/tv-show/:system_id`)

**File:** `frontend/src/pages/detail/TV.jsx`

Full detail page for a single TV show entry.

**Data loaded:**

- `GET /api/tv-shows/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`
- `GET /api/tv-shows/:prequel_id` and `GET /api/tv-shows/:sequel_id` (when set)

**Admin Controls Block** (admin only):

- Quick Edit button → `/modify?id=:system_id&type=tv-show`
- Mark Completed button — PATCHes `watching_status: "Completed"`, `airing_status: "Finished Airing"`, `ep_fin: ep_total`
- Autofill & Update button → `POST /api/data-control/replace/tv-show/:system_id`

**Layout (left column):**

- TV Show poster (with My Rating badge top-left)
- **Sources Card** (reusable) — Official Source, IMDb Link, Other Sources
- Watch Order (shown when not null)
- **Related Entries Card** (inline) — Prequel / Sequel mini cards (poster + name CN fallback + season_part)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status, Season Part, Region
- Main Title: TV Show Name CN (fallback: EN → Alt)
- Sub Title: TV Show Name EN (hidden if same as main title)
- From Franchise: Franchise Name CN with fallback (navigates to `/franchise/:id`)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- IMDb Score block (shows `imdb_rating` and Last Updated time)

**My Tracker section** — uses **My Tracker Block** (reusable):

- Ep Watched / Ep Total
  - +/- buttons and direct edit for Ep Watched (admin only)
- Watching Status dropdown (admin editable)
- My Rating dropdown (admin editable)
- Watch Next checkbox (admin editable)
- To Rewatch checkbox (admin editable)

**Detail cards:**

- **TV Show Naming Card** (reusable): CN, EN, Alt
- **Information Card** (reusable): 本傳/外傳, Season Part, Total Ep, Official Source, Airing Status, Release Date
- Remarks — shown when not null (admin editable on blur)
- **`TVShowNotes`** (`frontend/src/pages/detail/TVShowNotes.jsx`) — structured notes editor with 12 sections; always rendered at the bottom; saves via `PATCH /api/tv-shows/:id` with `notes` field.

Admin writes use `PATCH /api/tv-shows/:system_id`.

---

### Cartoon Detail (`/cartoon/:system_id`)

**File:** `frontend/src/pages/detail/Cartoon.jsx`

Full detail page for a single cartoon entry.

**Data loaded:**

- `GET /api/cartoon/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`
- `GET /api/cartoon/:prequel_id` and `GET /api/cartoon/:sequel_id` (when set)

**Admin Controls Block** (admin only):

- Quick Edit button → `/modify?id=:system_id&type=cartoon`
- Mark Completed button — PATCHes `watching_status: "Completed"`, `airing_status: "Finished Airing"`, `ep_fin: ep_total`
- Autofill & Update button → `POST /api/data-control/replace/cartoon/:system_id`

**Layout (left column):**

- Cartoon poster (with My Rating badge top-left)
- **Sources Card** (reusable) — Official Source, IMDb Link, Other Sources
- Watch Order (shown when not null)
- **Related Entries Card** (inline) — Prequel / Sequel mini cards (poster + name CN fallback + season_part)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Type, Airing Status
- Main Title: Cartoon Name CN (fallback: EN → Alt)
- Sub Title: Cartoon Name EN (hidden if same as main title)
- From Franchise: Franchise Name CN with fallback (navigates to `/franchise/:id`)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- IMDb Score block (shows `imdb_rating` and Last Updated time)

**My Tracker section** — uses **My Tracker Block** (reusable):

- Ep Watched / Ep Total
  - +/- buttons and direct edit for Ep Watched (admin only)
- Watching Status dropdown (admin editable)
- My Rating dropdown (admin editable)
- Watch Next checkbox (admin editable)
- To Rewatch checkbox (admin editable)

**Detail cards:**

- **Cartoon Naming Card** (reusable): CN, EN, Alt
- **Information Card** (reusable): 本傳/外傳, Season Part, Airing Type, Airing Status, Length Per Ep (min), Official Source, Release Date, Total Ep
- Remarks — shown when not null (admin editable on blur)
- **`CartoonNotes`** (`frontend/src/pages/detail/CartoonNotes.jsx`) — structured notes editor with 12 sections; always rendered at the bottom; saves via `PATCH /api/cartoon/:id` with `notes` field.

Admin writes use `PATCH /api/cartoon/:system_id`.

---

### Manga Detail

**File:** `frontend/src/pages/detail/Manga.jsx` (TBD)

Full detail page for a single manga entry.

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → executes Replace for single manga entry

**Layout (left column):**

- Manga poster
- **Sources Card** (reusable)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Manga Region, Serialization Status
- Main Title: Manga Name CN (with fallback)
- Sub Title: Manga Name EN (hidden if CN used fallback or is null)
- From Franchise: Franchise Name CN with fallback (navigates to franchise page)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- **Score Block** (reusable): includes Last Updated Time

**Detail sections:**

- **My Tracker Block** (reusable)
- **Naming Card** (reusable)
- **Information Card** (reusable)
- **Production Card** (reusable)
- Remarks — shown when not null
- **`MangaNotes`** (`frontend/src/pages/detail/MangaNotes.jsx`) — structured notes editor with 15 sections; always rendered at the bottom; saves via `PATCH /api/manga/:id` with `notes` field.

---

### Novel Detail (`/novel/:system_id`)

**File:** `frontend/src/pages/detail/Novel.jsx`

Full detail page for a single novel entry.

**Data loaded:**

- `GET /api/novel/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → executes Replace for single novel entry

**Layout (left column):**

- Novel poster
- **Sources Card** (reusable)
- Read Order
- **Related Entries Card** (reusable)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Novel Region, Novel Type, Serialization Status
- Main Title: Novel Name CN (with fallback)
- Sub Title: Novel Name EN (hidden if CN used fallback or is null)
- From Franchise: Franchise Name CN with fallback (navigates to franchise page)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- **Score Block** (reusable): includes Last Updated Time

**Detail sections:**

- **My Tracker Block** (reusable)
- **Naming Card** (reusable)
- **Information Card** (reusable)
- **Production Card** (reusable)
- Remarks — shown when `remark` is not null
- **Belonging Novels Card** (reusable) — editable for admin only; renders `novel_name_each_cn` and `novel_name_each_en`
- **Notes Card** (reusable) — editable for admin only

Admin writes use `PATCH /api/novel/:system_id`.

---

### Franchise Hub (`/franchise/:system_id`)

**Files:** `frontend/src/pages/detail/Franchise.jsx` (thin wrapper) → `frontend/src/pages/detail/FranchisePage.jsx` (unified hub)

`Franchise.jsx` renders `FranchisePage` unconditionally. `FranchisePage` fetches all data and derives which content sections to show from the parsed `franchise_type` field. `franchise_type` may be a comma-separated list (e.g., `"ACG, Cartoon"`), enabling a franchise to span multiple type categories.

**Type flags** (derived via `parseTypes(franchise.franchise_type)`):

| Flag         | True when `franchise_type` includes… | Controls                    |
| ------------ | ------------------------------------ | --------------------------- |
| `hasACG`     | `"ACG"` or `"Anime"`                 | Anime tab, Anime Movies tab |
| `hasACGFull` | `"ACG"`                              | Manga tab                   |
| `hasNovel`   | `"Novel"` or `"ACG"`                 | Novel tab                   |
| `hasTvMovie` | `"TV or Movie"`                      | Movies tab, TV Shows tab    |
| `hasCartoon` | `"Cartoon"`                          | Cartoons tab                |

**Data loaded** (all in parallel on mount):

- `GET /api/franchise/:system_id`
- `GET /api/series/?franchise_id=:system_id`
- `GET /api/anime/?franchise_id=:system_id`
- `GET /api/anime-movie/?franchise_id=:system_id`
- `GET /api/movies/?franchise_id=:system_id`
- `GET /api/tv-shows/?franchise_id=:system_id`
- `GET /api/cartoon/?franchise_id=:system_id`
- `GET /api/manga/?franchise_id=:system_id`
- `GET /api/novel/?franchise_id=:system_id`

**Layout:**

1. Breadcrumb → `/library/franchise`
2. Admin toolbar: Quick Edit button → `/modify?id=:system_id`
3. Hero card:
   - Franchise type badge (raw `franchise_type` string)
   - Main title: Franchise Name CN (fallback: EN → Alt → Roman → JP)
   - Sub-titles: EN / JP / Romaji / Alt — each hidden if same as main title
   - Badges: My Rating, Franchise Expectation, Watch Next Group (ACG only), To Rewatch (ACG only), Total Entries count
   - Completion block: `completed / total` across all entry types; watchable entries (anime, anime movies, movies, TV shows, cartoons) use `watching_status === "Completed"`; readable entries (manga, novel) uses `reading_status === "Completed"`
   - Admin controls: Overall Rating select, Expectation select, Watch Next Group select (ACG only), To Rewatch checkbox (ACG only) — all save via `PATCH /api/franchise/:system_id`
4. Series card: clickable series name badges — opens SeriesModal
5. Notes & Overview card: remark textarea (admin editable on blur) — saves via `PATCH /api/franchise/:system_id`
6. Tab bar (hidden when only 1 tab): tab label + entry count badge per tab
7. Tab content sections (one rendered at a time)

**Tabs** (a tab appears only when its type flag is `true` AND it has at least one entry):

| Tab          | Requires     | Entries list     |
| ------------ | ------------ | ---------------- |
| Anime        | `hasACG`     | `animeList`      |
| Anime Movies | `hasACG`     | `animeMovieList` |
| Manga        | `hasACGFull` | `mangaList`      |
| Novel        | `hasNovel`   | `novelList`      |
| Movies       | `hasTvMovie` | `movieList`      |
| TV Shows     | `hasTvMovie` | `tvShowList`     |
| Cartoons     | `hasCartoon` | `cartoonList`    |

Default active tab: first tab in the above order that has entries. When `tabs.length === 1`, the tab bar is hidden and content is shown directly.

**Anime tab:**

- Sort: Watch Order / Title / Release Date (default) / My Rating / MAL Rating
  - Watch Order: entries without `watch_order` go to bottom; shows `#N` badge and "main" badge when `is_main_entry`
- Filters: Airing Type (TV / Movie / ONA / OVA / Special), Airing Status (Airing / Finished Airing / Not Yet Aired), Watching Status (Planned / Watching / Completed / Dropped / Might Watch), Baha Only checkbox
- Group by Series toggle (default on)
- Cards: **Anime Entry Card 2** (`AnimeCard.jsx`)

**Anime Movies tab:**

- Sort: Release Date (default, uses `release_date_jp` with `release_date_tw` fallback) / Title / My Rating / MAL Rating
- No filters
- Cards: **Anime Movie Entry Card** (`AnimeMovieCard.jsx`)

**Manga tab:**

- Sort: Title (default) / My Rating / MAL Rating / Release Year / End Year
- Filters: Serialization Status (連載中 / 完結 / 腰斬 / 停更), Reading Status (Planned / Reading / Completed / Dropped / Might Read), Region (日漫 / 韓漫 / 國漫 / 台漫 / 其他)
- Group by Series toggle (default off)
- Cards: **Manga Entry Card 2** (`MangaCard.jsx`)

**Novel tab:**

- Sort: Release Year (default) / Title / My Rating / MAL Rating
- Filters: Reading Status (use Reading Status Filter Options), Region (Novel Region)
- Group by Series toggle (default on)
- Cards: **Novel Entry Card 2** (`NovelCard.jsx`)

**Movies tab:**

- Sort: Release Date (default, uses `release_date_usa` with `release_date_tw` fallback) / Title / My Rating / IMDb Rating
- Filters: Airing Status (Finished Airing / Not Yet Aired), Watching Status (Planned / Watching / Completed / Dropped / Might Watch)
- Group by Series toggle (default on)
- Cards: **Movie Entry Card** (`MovieCard.jsx`)

**TV Shows tab:**

- Sort: Release Date (default) / Title / My Rating / IMDb Rating
- Filters: Airing Status (Airing / Finished Airing / Not Yet Aired), Watching Status (Planned / Watching / Completed / Dropped / Might Watch)
- Group by Series toggle (default on)
- Cards: **TV Show Entry Card 2** (`TVCard.jsx`)

**Cartoons tab:**

- Sort: Release Date (default, old to new) / Title / My Rating / IMDb Rating
- Filters: Airing Type (dynamic, derived from actual cartoon entries), Airing Status (Finished Airing / Airing / Not Yet Aired), Watching Status (Planned / Watching / Completed / Dropped / Might Watch)
- Group by Series toggle (default on)
- Cards: **Cartoon Entry Card 2** (`CartoonCard.jsx`)

Admin writes use `PATCH /api/franchise/:system_id`.

---

### Anime Library (`/library/anime`)

**File:** `frontend/src/pages/library/LibraryAnime.jsx`

Full anime library with client-side filtering via `useMemo`.

**Data loaded:**

- `GET /api/anime/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by anime title, franchise title, series title, release season (e.g. WIN 2026), release date, release year, genre_main/genre_sub. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / MAL Rating / Release Date (new to old, TBD first)
- Advanced filters (collapsible): Airing Type, Airing Status, Watching Status, 巴哈
- Grid/Table view toggle

**Grid view** — each entry: **Anime Entry Card 2**

**Table view** — sticky-header table columns: Franchise Name CN (fallback), Anime Name CN, Anime Name EN (fallback: Roman), Airing Type, Season/Part, Airing Status, Ep Finished/Total, My Rating, MAL Rating, Studio, Bahamut icon, + button (admin status toggle)

Admin: inline quick-status toggle via `PATCH /api/anime/:system_id`.

---

### Anime Movie Library (`/library/anime-movie`)

**File:** `frontend/src/pages/library/LibraryAnimeMovie.jsx`

**Data loaded:**

- `GET /api/anime-movie/`
- `GET /api/franchise/`

**Library bar:**

- Filter search: by Franchise Title, Anime Movie Title, Release Year JP. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / MAL Rating / Release Date JP (new to old, TBD first)
- Advanced filters (collapsible): Airing Status, Watching Status, 巴哈
- Grid/Table view toggle

**Grid view** — each entry: **Anime Movie Entry Card 1**

**Table view** — columns: Franchise Name (fallback), Anime Movie Name CN, Anime Movie Name EN (fallback: Roman), Airing Status, My Rating, MAL Rating, Studio, Director, Bahamut icon, + button (admin only), Watch Next (admin only), To Rewatch (admin only)

---

### Franchise Library (`/library/franchise`)

**File:** `frontend/src/pages/library/FranchiseLibrary.jsx`

Franchise grid library.

**Data loaded:**

- `GET /api/franchise/`
- `GET /api/anime/`
- `GET /api/anime-movie/`
- `GET /api/movies/`
- `GET /api/tv-shows/`
- `GET /api/cartoon/`

Cover image derived from the most-recently-released entry (across all media types) with a cover in each franchise, or overridden by `cover_anime_id`.

**Library bar:**

- Filter search: by franchise title
- Advanced filters (collapsible): Franchise Type (ACG / Anime Movie / TV or Movie / Cartoon / Other)
- Sort by: Title (default) / My Rating / Expectation
- Grid/Table view toggle (Table: TBD)

Each entry: **Franchise Entry Card** — navigates to `/franchise/:system_id`.

---

### Movie Library (`/library/movie`)

**File:** `frontend/src/pages/library/LibraryMovie.jsx`

**Data loaded:**

- `GET /api/movies/`
- `GET /api/franchise/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Movie Title (CN/EN/Alt), Director, Release Date USA. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / IMDb Rating / Release Date USA (year, new to old)
- Advanced filters (collapsible): Airing Status, Movie Type, Watching Status (grouped: Watching / Planned / Completed / Dropped / Might Watch)
- Grid/Table view toggle

**Grid view** — each entry: **Movie Entry Card** (`MovieCard.jsx`)

**Table view** — columns: Franchise Name (fallback), Movie Name CN, Movie Name EN (sub-line), Airing Status, My Rating, IMDb Rating, Director, Release Date USA, Watch status (status badge for guests; toggle button for admin), Watch Next (admin only), To Rewatch (admin only)

Admin: inline quick-status toggle via `PATCH /api/movies/:system_id`.

---

### TV Show Library (`/library/tv-show`)

**File:** `frontend/src/pages/library/LibraryTV.jsx`

**Data loaded:**

- `GET /api/tv-shows/`
- `GET /api/franchise/`

**Library bar (always visible):**

- Filter search: by TV Show Name (CN/EN/Alt), Franchise Name, Season Part, Region. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / IMDb Rating / Release Date (new to old)
- Advanced filters (collapsible): Airing Status, Region (dynamic from entries), Watching Status (grouped: Watching / Planned / Completed / Dropped / Might Watch)
- Grid/Table view toggle

**Grid view** — each entry: **TV Show Entry Card 2** (`TVCard.jsx`)

**Table view** — columns: Franchise Name CN (fallback), Title CN (with EN sub-line), Season Part, Airing Status, Ep Fin/Total, My Rating, IMDb Rating, Watch (status badge for guests; toggle button for admin), Watch Next (admin only), To Rewatch (admin only)

Admin: inline status toggle via `PATCH /api/tv-shows/:system_id`.

---

### Cartoon Library (`/library/cartoon`)

**File:** `frontend/src/pages/library/LibraryCartoon.jsx`

**Data loaded:**

- `GET /api/cartoon/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Series Title, Cartoon Name (CN/EN/Alt), Release Year (parsed from `release_date`). Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / IMDb Rating / Release Date (new to old)
- Advanced filters (collapsible): Airing Status, Airing Type (dynamic), Official Source (dynamic), Watching Status (grouped: Watching / Planned / Completed / Dropped / Might Watch)
- Grid/Table view toggle

**Grid view** — each entry: **Cartoon Entry Card 2** (`CartoonCard.jsx`)

**Table view** — columns: Franchise Name CN (fallback), Cartoon Name CN, Cartoon Name EN, Airing Type, Season Part, Airing Status, Ep Fin/Total, Official Source, My Rating, IMDb Rating, Watch (status badge for guests; toggle button for admin)

Admin: inline status toggle via `PATCH /api/cartoon/:system_id`.

---

### Manga Library

**File:** `frontend/src/pages/library/LibraryManga.jsx`

**Data loaded:**

- `GET /api/manga/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Series Title, Manga Title, Release Year. Case/punctuation/space insensitive.
- Advanced filters (collapsible): Serialization Status, Reading Status (Reading Status Filter Options), Region
- Sort by: Title (default) / My Rating / MAL Rating / Release Date (new to old; TBD first) / Ending Date (new to old; TBD first)

**Grid view** — each entry: **Manga Entry Card 2**

**Table view** — columns: Franchise Name CN (fallback), Manga Name CN, Manga Name EN (fallback: Roman), Serialization Status, Ch Finished / Ch Total, Vol Finished / Vol Total, My Rating, MAL Rating, Bahamut icon, + button (admin only), Read Next (admin only), To Reread (admin only)

---

### Novel Library (`/library/novel`)

**File:** `frontend/src/pages/library/LibraryNovel.jsx`

**Data loaded:**

- `GET /api/novel/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Series Title, Novel Title, Release Year. Case/punctuation/space insensitive.
- Advanced filters (collapsible): Serialization Status, Reading Status (Reading Status Filter Options), Region, Type
- Sort by: Title (default) / My Rating / MAL Rating / Release Year (new to old; TBD first) / Ending Year (new to old; TBD first)
- Grid/Table view toggle

**Grid view** — each entry: **Novel Entry Card 2**

**Table view** — columns: Franchise Name CN (fallback), Novel Name CN, Novel Name EN (fallback: Roman), Novel Type, Serialization Status, Vol Finished / Vol Total TW; Vol Total Original, Arc Finished / Arc Total, Ch Finished / Ch Total, My Rating, MAL Rating, + button (admin only, Reading Type), Read Next (admin only), To Reread (admin only)

---

### Seasonal Overall (`/seasonal`)

**File:** `frontend/src/pages/public/SeasonalOverall.jsx`

Two-tab seasonal view.

**Data loaded:**

- `GET /api/seasonal/current-season`
- `GET /api/seasonal/`
- `GET /api/franchise/`
- `GET /api/anime/?airing_season=:current` and `?airing_season=:next`

**Current Season tab:**

- Seasonal Information Block: Seasonal Name, Total/Planned (Plan to Watch + Watch When Airs)/Watching/Completed entry counts, completion bar, Seasonal Rating (admin editable)
- **Rating Distribution Block** (reusable)
- Anime entries sorted by: Watching Status (Completed → Watching → Planned → Might Watch → Dropped), then My Rating, then Franchise Expectation
- Each card: **Anime Entry Card 1**

**Next Season tab:**

- Seasonal Information Block: Seasonal Name, Total/Planned/Watching/Completed entry counts
- Anime entries sorted by: Watch When Airs → Plan to Watch → Might Watch → Other → Won't Watch, then My Rating, then Franchise Expectation
- Each card: **Anime Entry Card 1**

**All Seasons tab:**

- Year/season matrix (new to old); each row = 1 year with 4 season entries
- Navigation links to `/seasonal/:id`
- Current season highlighted; unavailable seasons greyed out

Admin: `PATCH /api/seasonal/:id` for rating; `PATCH /api/anime/:id` for episode progress.

---

### Seasonal Detail (`/seasonal/:seasonal_id`)

**File:** `frontend/src/pages/public/SeasonalDetail.jsx`

Detailed view for one season.

**Data loaded:**

- `GET /api/seasonal/:seasonal_id`
- `GET /api/anime/?airing_season=:seasonal_id`
- `GET /api/franchise/`

**Layout:**

- Seasonal Information Block: Seasonal Name, Total/Planned/Watching/Completed counts, completion bar, Seasonal Rating (admin editable), Prev/Next navigation arrows
- My Rating and MAL Rating distribution bar charts
- Anime entries sorted by Watching Status (Completed → Watching → Planned → Might Watch → Dropped), then My Rating, then Franchise Expectation — each entry: **Anime Entry Card 1**

Admin: `PATCH /api/seasonal/:id` for rating; `PATCH /api/anime/:id` for episode progress.

---

### Plan (`/plan`)

**File:** `frontend/src/pages/public/Plan.jsx`

Planning dashboard for tracking what to watch or read next.

**Data loaded:**

- `GET /api/franchise/`
- `GET /api/anime/`
- `GET /api/anime-movie/`
- `GET /api/movies/`
- `GET /api/tv-shows/`
- `GET /api/cartoon/`
- `GET /api/manga/`
- `GET /api/novel/`

**Sections:**

1. **Watch Next** (`frontend/src/pages/plan/PlanWatchNext.jsx`) — tabbed franchise/entry grid:
   - Anime tab: grouped by 12ep / 24ep / 30ep+; shows poster, Franchise Name CN with fallback, Franchise Expectation
   - Anime Movie tab: grouped by 吉卜力 / 新海誠 / 原創動畫電影 / 改編動畫電影 / 其他; shows poster, Anime Movie Name CN with fallback
   - Movie tab: grouped by Franchise with the order of Disney, Marvel, all other franchises; shows poster, Movie Name CN with fallback
   - TV Show tab: grouped by Franchise with the order of Disney, Marvel, all other franchises; shows poster, TV Show Name CN with fallback
   - Cartoon tab: grouped by Official Source (Cartoon Network, Disney, Nickelodeon, Adult Swim, FOX, HBO, Comedy Central, Other); shows poster, Cartoon Name CN with fallback
   - Manga tab: grouped by Serialization Status (完結, 連載中, 腰斬, 停更, null); shows poster, Manga Name CN with fallback
   - Novel tab: grouped by Serialization Status (完結, 連載中, 連載中 (不穩定) & 連載中 (有生之年), 其他); shows poster, Novel Name CN with fallback
   - Note: Anime tab uses franchise entries; other media types use the media entry directly

2. **To Rewatch** (`frontend/src/pages/plan/PlanToRewatch.jsx`) — tabbed grid:
   - Anime tab: sorted by Franchise Name EN; shows poster, Franchise Name CN with fallback, Franchise Rating
   - Anime Movie tab: sorted by Anime Movie Name EN; shows poster, Anime Movie Name CN with fallback, My Rating
   - Movie tab: sorted by Movie Name EN; shows poster, Movie Name CN with fallback, My Rating
   - TV Show tab: sorted by TV Show Name EN; shows poster, TV Show Name CN with fallback, My Rating
   - Cartoon tab: sorted by Cartoon Name EN; shows poster, Cartoon Name CN with fallback, My Rating
   - Manga tab: sorted by Manga Name EN; shows poster, Manga Name CN with fallback, My Rating
   - Novel tab: sorted by Novel Name EN; shows poster, Novel Name CN with fallback, My Rating

3. **Plan to Watch for Future Releases** (`frontend/src/pages/plan/PlanToWatchFuture.jsx`) — two-tab view of upcoming planned entries:
   - **Watch When Airs tab**: all Anime, Anime Movie, Movie, TV Show, Cartoon entries where `watching_status === "Watch When Airs"`, grouped by release year (ascending; TBD last), sorted within each year by media type order (Anime → Anime Movie → Movie → TV Show → Cartoon) then by name EN. Renders type-specific future release card per entry.
   - **Plan to Watch tab**: same structure but filtered to `watching_status === "Plan to Watch"` AND `airing_status === "Not Yet Aired"` (future releases only). Anime entries additionally require their season key ≥ the current season key (fetched from `GET /api/system/config/current_season`) to exclude stale past-season entries.
   - Manga and Novel are excluded (they use `reading_status`, not `watching_status`, and have no future release card).
   - Release year extraction per type: Anime uses `release_year`; Anime Movie uses first 4 chars of `release_date_jp` or `release_date_tw`; Movie uses `release_date_usa` or `release_date_tw`; TV Show and Cartoon use first 4 chars of `release_date`.
   - Cards used: `AnimeCardFuture`, `AnimeMovieCardFuture`, `MovieCardFuture`, `TVCardFuture`, `CartoonCardFuture`. Cards are interactive — admins can change `watching_status` via dropdown; changing status triggers a full data reload.

---

### Statistics (`/statistics`)

**File:** `frontend/src/pages/public/Statistics.jsx`

Multi-section statistics dashboard.

**Data loaded:**

- `GET /api/franchise/`
- `GET /api/anime/`
- `GET /api/anime-movie/`
- `GET /api/movies/`
- `GET /api/seasonal/`
- `GET /api/seasonal/current-season`

**Sections:**

1. **Favorite Franchise 3×3 Grid** — franchises with `favorite_3x3_slot` 1–9; shows poster, Franchise Name CN with fallback, Franchise Rating
   - One 3x3 grid for each franchise: ACG, Movie, TV Show, Cartoon, and Novel.
   - Note that we don't have the grid for Anime Movie

2. **Rating Distribution** — horizontal bar charts:
   - My Rating for ACG Franchise (S / A+ / A / B / C / D / E / F / Unrated)
   - MAL Rating for all anime entries (9+ / 8.7+ / 8.5+ / 8.2+ / 7.7+ / 7+ / 4+ / <4)
   - Seasonal Rating (S / A+ / A / B / C / D / E / F / Unrated)
   - Each chart shows amount and percentage per category

3. **Anime Seasonal Overview** — paginated table (12 per page, new to old; highlights current season with "Current" tag):
   - Release Season, My Seasonal Rating, # Completed, # Planned, # Watching, # Dropped

---

### Completions (`/completions`)

**File:** `frontend/src/pages/public/Completions.jsx`

All completed entries, paginated by media type.

**Data loaded:**

- `GET /api/franchise/`
- `GET /api/anime/`
- `GET /api/anime-movie/`
- `GET /api/movies/`
- `GET /api/tv-shows/`
- `GET /api/cartoon/`
- `GET /api/manga/`
- `GET /api/novel/`

**Content** — tabbed paginated list (10 per page) via `StatsCompletions` component:

- Anime tab: grouped by Airing Type (TV / Movie / ONA / Others); shows Anime Name CN with fallback, Franchise Name CN with fallback, My Rating, Completed Date
- Anime Movie tab: grouped by 吉卜力 / 新海誠 / 原創動畫電影 / 改編動畫電影 / 其他; shows Anime Movie Name CN with fallback, Name EN (hidden if CN used fallback), My Rating, Completed Date
- Movie tab: grouped by Franchise with the order of Disney, Marvel, all other franchises; shows Movie Name CN with fallback, Name EN (hidden if CN used fallback), My Rating, Completed Date
- TV Show tab: grouped by Franchise with the order of Disney, Marvel, all other franchises; shows TV Show Name CN with fallback, Name EN (hidden if CN used fallback), My Rating, Completed Date
- Cartoon tab: grouped by Official Source with the order Cartoon Network, Disney, Nickelodeon, Adult Swim, FOX, HBO, Others; shows Cartoon Name CN with fallback, Name EN (hidden if CN used fallback), Airing Type, My Rating, Completed Date
- Manga tab: grouped by Manga Region (日漫, 韓漫, 國漫, 台漫, Others); shows Manga Name CN with fallback, Franchise Name CN with fallback, My Rating, Completed Date
- Novel tab: grouped by Novel Type (Light Novel / Novel / Web / Others); shows Novel Name CN with fallback, Franchise Name CN with fallback, My Rating, Completed Date

---

### Future Releases (`/future-releases`)

**File:** `frontend/src/pages/public/FutureReleases.jsx`

Upcoming entries by release timeline. No future release page planned for Manga or Novel.

**Data loaded (on tab switch — lazy):**

- Anime tab: `GET /api/anime/`, `GET /api/franchise/`, `GET /api/system/config/current_season` (on mount)
- Anime Movie tab: `GET /api/anime-movie/` (lazy, on first tab open) — filtered client-side to `airing_status = "Not Yet Aired"`
- Movie tab: `GET /api/movies/?airing_status=Not+Yet+Aired` (lazy, on first tab open) — further filtered to entries with `release_date_usa` or `release_date_tw`
- TV Show tab: `GET /api/tv-shows/` (lazy, on first tab open) — filtered client-side to `airing_status = "Not Yet Aired"` or `"Airing"`
- Cartoon tab: `GET /api/cartoon/` (lazy, on first tab open) — filtered client-side to `airing_status = "Not Yet Aired"`

**Anime Future Release Tab** (default):

- Filter chips: TV / ONA / Movie / Others (OVA, OAD, Special, null)
- Group and sort by release season old-to-new, then Watching Status (Watch When Airs → Plan to Watch → Might Watch), then Franchise Expectation
  - Entries with release season first; release-year-only entries second; TBD last
- Each entry: **Anime Entry Card 3**
- Admin: inline watching-status selector, "Mark as Airing" button (PATCHes `airing_status`; entry removed from list immediately)

**Anime Movie Future Release Tab:**

- Grouped by release year JP, sorted by release date JP (old to new), then title
- Each entry: **Anime Movie Entry Card 2**

**Movie Future Release Tab:**

- Lazy-loaded from `GET /api/movies/?airing_status=Not+Yet+Aired`; further filtered to entries with `release_date_usa` or `release_date_tw` set
- Grouped by release year (parsed from `release_date_usa`, fallback `release_date_tw`), sorted by year old to new; TBD last
- Each entry: **Movie Entry Card 2** (`MovieCard.jsx`)

**TV Show Future Release Tab:**

- Flat grid (no grouping, no filter chips), sorted by `release_date` ascending (nulls last)
- Includes both "Not Yet Aired" and "Airing" entries
- Each entry: **TV Show Entry Card 3** (`TVCardFuture.jsx`)

**Cartoon Future Release Tab:**

- Grouped by release year (parsed from `release_date`), sorted within year by `release_date` ascending; TBD last
- Each entry: **Cartoon Entry Card 3** (`CartoonCardFuture.jsx`)

---

### Search (`/search`)

**File:** `frontend/src/pages/public/Search.jsx`

Reads `?q` and `?scope` query params. Client-side filtering over full data fetched upfront.

**Data loaded (conditional on scope):**

| Scope         | Fetches                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `all`         | franchise, anime, anime-movie, movie, tv-show, cartoon, novel, series, seasonal |
| `franchise`   | franchise only                                                                  |
| `anime`       | franchise + anime                                                               |
| `anime-movie` | anime-movie only                                                                |
| `movie`       | movies only                                                                     |
| `tv-show`     | tv-shows only                                                                   |
| `cartoon`     | cartoon only                                                                    |
| `novel`       | novel only                                                                      |
| `series`      | series only                                                                     |
| `seasonal`    | seasonal only                                                                   |

**Layout:**

- "Showing results for `<input>`"
- Filter by Franchise (pill chips showing Franchise Name CN with fallback) — filters franchise, series, and anime results
- **Seasonal Section** — **Search Result Seasonal Entry** (reusable)
- **Franchise Hub Section** — **Search Result Franchise Entry** (reusable): Franchise Name CN + EN (hidden if CN used fallback) + Franchise Type
- **Series Hub Section** — **Search Result Series Entry** (reusable)
- **Anime Entry Section** — split by Airing Type: TV/ONA / Movie / Other; each entry: **Anime Entry Card 2**
- **Anime Movie Entry Section** — each entry: **Anime Movie Entry Card 1** (`AnimeMovieCard.jsx`)
- **Movie Entry Section** — each entry: **Movie Entry Card** (`MovieCard.jsx`)
- **TV Show Entry Section** — each entry: **TV Show Entry Card 2** (`TVCard.jsx`)
- **Cartoon Entry Section** — each entry: **Cartoon Entry Card 2** (`CartoonCard.jsx`)
- **Novel Entry Section** — each entry: **Novel Entry Card 2** (`NovelCard.jsx`)

---

### Under Development (`/under-development`)

**File:** `frontend/src/pages/public/UnderDevelopment.jsx`

Placeholder page with under-construction notice and Go Back button.

---

## Admin-Only Pages

All admin pages redirect to `/login?next=<path>` if not authenticated (enforced by `ProtectedRoute`).

---

### System Admin (`/system`)

**File:** `frontend/src/pages/admin/Admin.jsx`

**Navigation buttons:** Data History / Review Queue / New Entry (Add) / Edit Entry (Modify) / Delete Entry (Delete)

**Set Current Season:**

- Displays current season value from `GET /api/system/config/current_season`
- Season dropdown + year input + Confirm Set button → `POST /api/system/config/current_season`

**Main Data Control Action Block:**

- Fill: Fill All / Fill Anime / Fill Anime Movie / Fill Movie / Fill TV Show / Fill Cartoon / Fill Manga / Fill Novel — streaming SSE via `/fill/all`, `/fill/anime`, `/fill/anime-movie`, `/fill/movie`, `/fill/tv-show`, `/fill/cartoon`, `/fill/manga`, `/fill/novel`
- Replace: Replace All / Replace Anime / Replace Anime Movie / Replace Movie / Replace TV Show / Replace Cartoon / Replace Manga / Replace Novel — streaming SSE via `/replace/all`, `/replace/anime`, `/replace/anime-movie`, `/replace/movie`, `/replace/tv-show`, `/replace/cartoon`, `/replace/manga`, `/replace/novel`
- Pull from Sheets: Pull All / Pull Specific (System Options / Franchise / Series / Anime / Anime Movies / Cartoons / Manga / Novel / Movies / TV Shows / Seasonal) → `POST /api/data-control/pull` or `POST /api/data-control/pull/:tab_name`
- Backup (Push) → `POST /api/data-control/backup`

**Calculate & Fix Block:**

- Calculate All → `POST /api/data-control/calculate/all`
- Find Duplicates → `GET /api/data-control/check/duplicates`
- With Remarks → `GET /api/data-control/check/remarks` → opens modal with tabs: Anime / Anime Movie / Movie / TV Show / Cartoon / Manga / Novel. Each tab lists entries where `remark IS NOT NULL AND remark != ''`, ordered by `updated_at` desc. Columns per tab:
  - Anime: Name CN, Name EN, Type (`airing_type`), Watching (`watching_status`), Remark
  - Anime Movie: Name CN, Name EN, Watching (`watching_status`), Remark
  - Movie: Name CN, Name EN, Release Date (`release_date_usa`), Watching (`watching_status`), Remark
  - TV Show: Name CN, Name EN, Season (`season_part`), Watching (`watching_status`), Remark
  - Cartoon: Name CN, Name EN, Type (`airing_type`), Watching (`watching_status`), Remark
  - Manga: Name CN, Name EN, Is Main (`is_main`), Reading (`reading_status`), Remark
  - Novel: Name CN, Name EN, Is Main (`is_main`), Reading (`reading_status`), Remark
  - Rows are clickable and navigate to the entry detail page
- Check & Download Covers (multi-step): `GET /api/data-control/calculate/check-cover-image` → `POST .../download-missing-covers` → `POST .../set-cover-image-fields` → `DELETE .../delete-orphaned-covers`

**Recent Data Control Log:**

- Clear Old button (keeps most recent 10 logs); Refresh button
- Shows all data control actions from `GET /api/system/logs`
- Per row: Action Type (main + sub, e.g. Replace / Replace All), Trigger Type (Manual / Auto), Action Time, Status (Success / Aborted / Fail), Metrics (Added / Modified / Deleted)
- Per-row delete: `DELETE /api/system/logs/:id`

---

### Data History (`/data-history`)

**File:** `frontend/src/pages/admin/DataHistory.jsx`

**Refresh Button**

**Modified Franchise Section:**

- Modified Time, Franchise Type (ACG / Anime Movie / TV or Movie / Cartoon / null), Franchise Name CN with fallback

**Modified Anime Section:**

- Modified Time, Anime Name CN with fallback, Airing Type, Airing Status, Watching Status

**Recently Added Franchise Section:**

- Added Time, Franchise Type, Franchise Name CN with fallback

**Recently Added Media Entry Section:**

- Added Time, Entry Type (Anime, Series), Entry Name CN with fallback, Airing Type (Anime only), Season/Part (Anime only)

**Deletion History Section** (from `GET /api/system/deleted`):

- Deleted Time, Entry Type (which table), Name CN with fallback (for system option: option_value), Name EN (null if CN used fallback or is system option), Additional Info:
  - Franchise entry: franchise type
  - Series entry: franchise name CN with fallback
  - Media entry (except anime movie): franchise name CN with fallback + series name CN with fallback
  - Anime Movie entry: franchise name CN with fallback
  - System option entry: category

All sourced from `GET /api/anime/`, `GET /api/franchise/`, `GET /api/series/`, `GET /api/system/deleted`.

---

### Review Queue (`/review-queue`)

**File:** `frontend/src/pages/admin/ReviewQueue.jsx`

Admin review queue for entries requiring attention.

**Entries With Remarks Section:**

- Find Remarks button → `GET /api/data-control/check/remarks` → tabbed result table: Anime / Anime Movie / Movie / TV Show / Cartoon / Manga / Novel. Columns per tab:
  - Anime: Name CN, Name EN, Type (`airing_type`), Watching (`watching_status`), Remark
  - Anime Movie: Name CN, Name EN, Watching (`watching_status`), Remark
  - Movie: Name CN, Name EN, Release Date (`release_date_usa`), Watching (`watching_status`), Remark
  - TV Show: Name CN, Name EN, Season (`season_part`), Watching (`watching_status`), Remark
  - Cartoon: Name CN, Name EN, Type (`airing_type`), Watching (`watching_status`), Remark
  - Manga: Name CN, Name EN, Is Main (`is_main`), Reading (`reading_status`), Remark
  - Novel: Name CN, Name EN, Is Main (`is_main`), Reading (`reading_status`), Remark
  - Rows are clickable and navigate to the entry detail page

**Potential Duplicates Section:**

- Find Duplicates button → result table with tabs: Franchise / Series / Anime / Anime Movie / Movie / TV Show / Cartoon / Manga / Novel / System Options

---

### Add (`/add`)

**File:** `frontend/src/pages/admin/Add.jsx`

Multi-tab form for creating new records. Shows most recently added entry at top.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/novel/`

#### Add New Anime Entry Tab (default)

Includes auto-fill from existing entry search bar (searches all languages including Alt).

- **Titles & Naming:** Franchise (ComboBox + auto-create modal), Series (ComboBox + auto-create modal), Anime Name EN/CN/Roman/JP/Alt, Season, Part
- **Status & Progress:** Airing Status (default: Not Yet Aired), Watching Status (default: Might Watch), My Rating, Total Ep of Previous Entries, Total Ep, Episode Finished, Ep Special Number, MAL Rating/Rank, AniList Rating
- **Classification:** Airing Type, Main/Spinoff (default: 本傳), Genre Main (multi-select, show all on click), Genre Sub (multi-select, show all on click)
- **Production:** Release Season/Month/Year, Studio, Distributor TW, Director, Producer, Music/Composer (all multi-selectable)
- **Relational & Timeline:** Prequel ID, Sequel ID, Alternative IDs (comma-separated), Is Main Entry checkbox, Watch Order, Derive Related dropdown
- **Source & Links:** MAL ID/Link, AniList Link, Official Website, Twitter
- **Source Availability:** Baha dropdown (shows as 巴哈姆特動畫瘋), Baha Link, Netflix dropdown, Add Source button (other sources as `{name: link}`)
- **Notes & Other:** Music Status (OP/ED/Insert/OST), Seiyuu, Cover Image File, Remark
- Duplicate detection modal; Jikan enrichment after submit via `POST /api/data-control/replace/anime/:id`

#### Add New Anime Movie Entry Tab

- **Titles & Naming:** Franchise (ComboBox), Anime Movie Name EN/CN/Roman/JP/Alt
- **Status & Progress:** Airing Status (default: Not Yet Aired), Watching Status (default: Might Watch), My Rating, Watch Next checkbox, To Rewatch checkbox, MAL Rating/Rank, AniList Rating
- **Production:** Length (Min), Release Date JP (Month + Year), Release Date TW (Month + Year), Studio (multi-selectable), Director (multi-selectable)
- **Source & Links:** MAL ID/Link, AniList Link, Official Website, Twitter
- **Source Availability:** Baha dropdown, Baha Link, Netflix dropdown, Add Source button
- **Notes & Other:** Cover Image File, Remark

#### Add New Franchise Tab

- **Titles & Naming:** Franchise Name EN/CN/Roman/JP/Alt
- **Other Information:** Franchise Type, My Rating, Franchise Expectation, favorite_3x3_slot, Remark

#### Add New Series Tab

Parent Franchise, Series Name EN/CN/Alt, Remark

#### Add New System Option Tab

Category dropdown, Option Values field, "More Entries" button (batch add), Append Entry button

#### Add New Movie Entry Tab

- **Titles & Naming:** Franchise (ComboBox, filtered to `franchise_type = "TV or Movie"`), Series (ComboBox + auto-create modal, filtered by selected franchise), Movie Name EN (primary), Movie Name CN, Movie Name Alt
- **Status & Classification:** Airing Status (default: Not Yet Aired), Watching Status (default: Might Watch), Movie Type (Reality / Animation), My Rating, Watch Next checkbox, To Rewatch checkbox, IMDB Rating
- **Release & Production:** Release Date USA, Release Date TW, Length (Min), Director
- **IMDb & Sources:** IMDb ID (numeric), IMDb Link, Other Sources (name → URL pairs)
- **Cover & Notes:** Cover Image File, Remark
- Duplicate detection modal; IMDb enrichment triggered automatically by `POST /api/movies/` (which calls `execute_replace_single_movie` internally)

#### Add New TV Show Entry Tab

- **Titles & Naming:** Franchise (ComboBox), Series (ComboBox), TV Show Name EN/CN/Alt, Season dropdown, Part dropdown
- **Status & Progress:** Airing Status dropdown, Watching Status dropdown, Total Episode, Episode Finished, My Rating dropdown, Watch Next checkbox, To Rewatch checkbox, IMDB Rating
- **Classification & Production:** TV Show Region dropdown, TV Show Official Source, Main/Spinoff dropdown, Release Date
- **Relational & Timeline:** Prequel ID, Sequel ID, Watch Order, Derive Related dropdown
- **Source & Links:** IMDB ID, IMDB Link, Other Source
- **Notes & Other:** Cover Image File, Remark

#### Add New Cartoon Entry Tab

- **Titles & Naming:** Franchise (ComboBox), Series (ComboBox), Cartoon Name EN/CN/Alt, Season dropdown, Part dropdown
- **Status & Progress:** Airing Status dropdown, Watching Status dropdown, Total Episode, Episode Finished, My Rating dropdown, Watch Next checkbox, To Rewatch checkbox, IMDB Rating
- **Classification & Production:** Cartoon Official Source, Cartoon Airing Type dropdown, Main/Spinoff dropdown, Release Date
- **Relational & Timeline:** Prequel ID, Sequel ID, Watch Order, Derive Related dropdown
- **Source & Links:** IMDB ID, IMDB Link, Other Source
- **Notes & Other:** Cover Image File, Remark

#### Add New Manga Entry Tab

Includes auto-fill from existing entry search bar (searches all languages including Alt).

- **Titles & Naming:** Franchise (ComboBox + auto-create modal), Series (ComboBox + auto-create modal), Manga Name EN/CN/Roman/JP/Alt
- **Status & Progress:** Serialization Status, Reading Status (default: Might Read), My Rating, Total Volume, Volume Finished, Pages Read for Current Volume
  , Total Chapter, Chapter Finished, MAL Rating/Rank, AniList Rating
- **Classification:** Manga Region, Main/Spinoff (default: 本傳)
- **Production:** 原作 (Author Plot dropdown), 作畫 (Author Draw dropdown), Release Year, Ending Year, Studio, Serialization Platform, Distributor TW (all multi-selectable)
- **Relational & Timeline:** Prequel ID, Sequel ID, Is Main Entry checkbox, Watch Order, Derive Related dropdown
- **Source & Links:** MAL ID/Link, AniList Link, Official Website, Twitter, Add Source button (other sources as `{name: link}`)
- **Notes & Other:** Cover Image File, Remark
- Duplicate detection modal; Jikan enrichment after submit via `POST /api/data-control/replace/manga/:id`

#### Add New Novel Entry Tab

Includes auto-fill from existing entry search bar (searches all languages including Alt).

- **Titles & Naming:** Franchise (ComboBox + auto-create modal), Series (ComboBox + auto-create modal), Novel Name EN/CN/Roman/JP/Alt
- **Classification:** Novel Region dropdown, Novel Type dropdown, Main/Spinoff dropdown (default: 本傳), Version
- **Status & Progress:** Serialization Status dropdown, Reading Status dropdown (default: Might Read), Volumes Total Original, Volumes Total TW, Volumes Read, Arc Total, Arc Read, Ch Total, Ch Read, My Rating dropdown, MAL Rating, MAL Rank, AniList Rating, Read Next checkbox, To Reread checkbox
- **Production:** Author searchable dropdown (multi-selectable), Illustrator searchable dropdown (multi-selectable), Release Year, Ending Year, Publisher TW dropdown
- **Relational & Timeline:** Prequel ID, Sequel ID, Alternative IDs, Is Main Entry checkbox, Read Order
- **Source & Links:** MAL ID, MAL Link, AniList Link, Add Source button (other sources as `{name: link}`)
- **Notes & Other:** Cover Image File, Remark

---

### Modify (`/modify`)

**File:** `frontend/src/pages/admin/Modify.jsx`

Search-then-edit pattern. Shows most recently modified entry at top. Supports `?id=:uuid` deep-link.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/novel/`

Supports `?id=:uuid&type=movie` deep-link from Movie detail page Quick Edit button.

#### Modify Anime Entry Tab (default)

- Search bar (Franchise + Series + Entry names); results grouped by franchise/series, shown as Search Suggestion
- Recently Modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block (grouped by series), then full edit form
- Form mirrors Add Anime tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and **`AnimeNotes`** — structured notes editor with 17 sections.

Writes: `PATCH /api/anime/:id`; Jikan enrichment via `POST /api/data-control/replace/anime/:id`

#### Modify Anime Movie Entry Tab

- Search bar; recently modified entries: Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block, then full edit form
- Form mirrors Add Anime Movie tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and **`AnimeMovieNotes`** — structured notes editor with 15 sections.

Writes: `PATCH /api/anime-movie/:id`

#### Modify Franchise Tab

- Search bar (franchise name); recently modified entries: Franchise Type, Franchise Name CN with fallback
- Form: System ID (immutable), Franchise Name EN/CN/Roman/JP/Alt, Franchise Type, My Rating, Franchise Expectation, favorite_3x3_slot, Remark

Writes: `PATCH /api/franchise/:id`

#### Modify Series Tab

- Search bar (entry name); recently modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other series entries (show series name CN with fallback)
- Form: System ID (immutable), Parent Franchise, Series Name EN/CN/Alt, Remark

Writes: `PATCH /api/series/:id`

#### Modify System Option Tab

Category dropdown → all options for that category; select one to show: Option ID (immutable), Category (immutable), Option Value. Save Changes button.

Writes: `PATCH /api/options/:id`

#### Modify Movie Entry Tab

- Search bar (searches Movie Name EN/CN/Alt); recently modified entries shown by `updated_at` desc
- After selecting: Other Entries in franchise block (grouped by series) — show Movie Name CN with fallback; hidden for 獨立電影, 影集, Disney, Marvel franchises
- Full edit form — same fields as Add Movie tab (includes Series ComboBox + auto-create modal)
- Franchise ComboBox filtered to `franchise_type = "TV or Movie"`
- **`MovieNotes`** (`frontend/src/pages/detail/MovieNotes.jsx`) — structured notes editor with 11 sections; always rendered at the bottom.
- Save Changes Button

Writes: `PUT /api/movies/:id` (triggers `execute_replace_single_movie` automatically)

#### Modify TV Show Entry Tab

- Search bar; recently modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: System ID (immutable), Other Entries in franchise block grouped by series — show entry name CN with fallback (hidden for 獨立電影/影集, Disney, Marvel franchises), Entry Name CN with fallback (immutable), then full edit form
- Form sections: Titles & Naming, Status & Progress, Classification & Production, Relational & Timeline, Source & Links, Notes & Other (Cover Image + Remark)
- **`TVShowNotes`** (`frontend/src/pages/detail/TVShowNotes.jsx`) — structured notes editor with 12 sections; always rendered at the bottom.
- Save Changes Button

Writes: `PATCH /api/tv-shows/:id`

#### Modify Cartoon Entry Tab

- Search bar; recently modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: System ID (immutable), Other Entries in franchise block grouped by series — show entry name CN with fallback, Entry Name CN with fallback (immutable), then full edit form
- Form sections: Titles & Naming, Status & Progress, Classification & Production, Relational & Timeline, Source & Links, Notes & Other (Cover Image + Remark)
- **`CartoonNotes`** (`frontend/src/pages/detail/CartoonNotes.jsx`) — structured notes editor with 12 sections; always rendered at the bottom.
- Save Changes Button

Writes: `PATCH /api/cartoon/:id`

#### Modify Manga Entry Tab

- Search bar (Franchise + Series + Entry names); results grouped by franchise/series, shown as Search Suggestion
- Recently Modified entries: Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block (grouped by series), then full edit form
- Form mirrors Add Manga tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and **`MangaNotes`** — structured notes editor with 15 sections.

Writes: `PATCH /api/manga/:id`

#### Modify Novel Entry Tab

- Search bar (searches all languages including Alt); recently modified entries: Entry Name CN with fallback, Franchise Name CN with fallback
- Recently Modified entries: Novel Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: System ID (immutable), Other Entries in franchise block (grouped by series) — show entry name CN with fallback, Entry Name CN with fallback (immutable), then full edit form
- Form mirrors Add Novel tab, plus System ID (immutable), Entry Name CN with fallback (immutable), **`NovelNotes`** — structured notes editor with 15 sections, and Save Changes Button

Writes: `PATCH /api/novel/:id`

#### Modify Fav 3×3 Tab

**File:** `frontend/src/pages/modify-tabs/Fav3x3ModifyTab.jsx`

- No search/edit pattern — renders full grid view immediately on tab open; bypasses discovery and editor views
- Displays all 5 franchise grids: ACG, Novel, Movie, TV Show, Cartoon (matching Statistics page layout)
- Each grid section has two panels:
  - **Left (3×3 visual grid):** Each slot (1–9) shows the assigned franchise's cover image + name overlay + a dropdown below to change the assignment. Dropdown is filtered to franchises of the matching type (sorted by display name). Selecting a franchise removes it from any other slot in the same grid (a franchise can only hold one slot per type).
  - **Right (ranked list):** Slots 1–9 listed in order. Each row shows a drag handle (⠿), slot number, small cover thumbnail, and franchise display name. Rows are draggable via HTML5 DnD — dropping one row onto another swaps their slot assignments. Both panels stay in sync.
- "Save Grid" button appears per grid section only when changes are pending (dirty state).
- On save: detects which franchises' `type_slots` changed, fires `PATCH /api/franchise/:id` for all affected in parallel, then updates local franchise state.
- Franchise type "Anime Movie" is excluded — no 3×3 grid exists for it.

---

### Delete (`/delete`)

**File:** `frontend/src/pages/admin/Delete.jsx`

Search-then-delete pattern. Shows most recently deleted entry at top.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/novel/`

#### Delete Anime Entry Tab (default)

- Search bar → **Search Suggestion for Deletion** (reusable)
- After selecting: **Anime Entry Info for Deletion** (reusable) + Delete button
- If only entry in series: offer to delete series or keep it (show series name CN with fallback + entry counts per media type)
- If only entry in franchise: offer to delete franchise or keep it (show franchise name CN with fallback + entry counts per media type)

Deletes: `DELETE /api/anime/:id`

#### Delete Anime Movie Entry Tab

- Search bar → **Search Suggestion for Deletion** (reusable)
- After selecting: **Anime Movie Entry Info for Deletion** (reusable) + Delete button
- If only entry in franchise: offer to delete franchise or keep it (show franchise name CN with fallback + entry counts per media type)

Deletes: `DELETE /api/anime-movie/:id`

#### Delete Franchise Tab

- Search bar → **Search Suggestion for Deletion** (reusable)
- After selecting: **Franchise Entry Info for Deletion** (reusable) + Delete button

Deletes: `DELETE /api/franchise/:id`

#### Delete Series Tab

- Search bar (results grouped by franchise) → **Search Suggestion for Deletion** (reusable)
- After selecting: **Series Entry Info for Deletion** (reusable) + Delete button

Deletes: `DELETE /api/series/:id`

#### Delete System Option Tab

Category dropdown → all options shown; per-row Delete button (no confirmation needed)

Deletes: `DELETE /api/options/:id`

#### Delete Movie Entry Tab

- Search bar → **Search Suggestion for Deletion** (reusable)
- After selecting: cover thumbnail, Movie Name CN/EN, Airing Status, Watching Status, Franchise name, System ID, Delete button
- If only movie entry in franchise (no anime, no anime movies, no other movies, no series): offer to also delete the orphaned Franchise Hub

Deletes: `DELETE /api/movies/:id`

#### Delete TV Show Entry Tab

- Search bar → **Search Suggestion for Deletion** (reusable)
- After selecting: **TV Show Entry Info for Deletion** (reusable) + Delete button
- If only entry in series: offer to delete series or keep it (show series name CN with fallback + entry counts per media type)
- If only entry in franchise: offer to delete franchise or keep it (show franchise name CN with fallback + entry counts per media type)

Deletes: `DELETE /api/tv-shows/:id`

#### Delete Cartoon Entry Tab

- Search bar → **Search Suggestion for Deletion** (reusable)
- After selecting: **Cartoon Entry Info for Deletion** (reusable) + Delete button
- If only entry in series: offer to delete series or keep it (show series name CN with fallback + entry counts per media type)
- If only entry in franchise: offer to delete franchise or keep it (show franchise name CN with fallback + entry counts per media type)

Deletes: `DELETE /api/cartoon/:id`

#### Delete Manga Entry Tab

- Search bar → **Search Suggestion for Deletion** (reusable)
- After selecting: **Manga Entry Info for Deletion** (reusable) + Delete button
- If only entry in series: offer to delete series or keep it (show series name CN with fallback + entry counts per media type)
- If only entry in franchise: offer to delete franchise or keep it (show franchise name CN with fallback + entry counts per media type)

Deletes: `DELETE /api/manga/:id`

#### Delete Novel Entry Tab

- Search bar (searches all novel name fields including Alt) → **Search Suggestion for Deletion** (reusable)
- After selecting: **Novel Entry Info for Deletion** (reusable) + Delete button
- If only entry in series: offer to delete series or keep it (show series name CN with fallback + entry counts per media type)
- If only entry in franchise: offer to delete franchise or keep it (show franchise name CN with fallback + entry counts per media type)

Deletes: `DELETE /api/novel/:id`

---

## Reusable Components Summary

| File                            | Used By                                | Purpose                                                     |
| ------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| `components/Layout.jsx`         | All pages                              | Shell: Nav + Outlet + Toast + scroll-to-top                 |
| `components/Nav.jsx`            | All pages                              | Top navigation, universal search, backup button             |
| `components/DashboardCard.jsx`  | Index, SeasonalOverall, SeasonalDetail | Anime Entry Card 1 — wide card for active-tracking view     |
| `components/AnimeCard.jsx`      | LibraryAnime, Search, FranchiseAcg     | Anime Entry Card 2 — poster card for library/grid views     |
| `components/ProtectedRoute.jsx` | Admin, Add, Modify, Delete             | Auth guard; redirects to login if not admin                 |
| `components/ComboBox.jsx`       | Add, Modify                            | Searchable single-select with "create new" mode             |
| `components/MultiSelect.jsx`    | Add, Modify                            | Multi-value field for genres, studios, etc.                 |
| `components/Toast.jsx`          | All pages (via Layout)                 | Global toast notifications                                  |
| `contexts/AuthContext.jsx`      | All pages                              | Provides `isAdmin` and `refetchAuth` via `GET /api/auth/me` |
| `hooks/useToast.jsx`            | All pages                              | Context + hook for showing toasts                           |

For all reusable UI blocks (entry cards, info blocks, Score Block, My Tracker Block, etc.) see `reusable-elements.md`.

---

## TBD / Under Development

**Library pages:** Seiyuu Library (table-only)

**Entry detail pages:** Studio (pages are specified but not yet implemented)

**Dashboard:** Reading section (Manga · Novel) rendered with under-development placeholder; filter UI

**Search:** TV Show, Cartoon sections; Studio/Seiyuu sections (possible)

**Future Releases:** Overall tab (not planned)

**Admin:** Data History page split from System page

**Entry cards:** Novel Entry Card 1/2 (specified but not yet implemented)

**Reusable blocks:** Novel-specific blocks listed in `reusable-elements.md` (specified but not yet implemented); Rating Distribution Block, Search Result entries for Novel, deletion info blocks for Novel
