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
| `/library/collection`     | `CollectionLibrary`                                | Public     |
| `/library/franchise`      | `FranchiseLibrary`                                 | Public     |
| `/library/movie`          | `LibraryMovie`                                     | Public     |
| `/future-releases`        | `FutureReleases`                                   | Public     |
| `/anime/:system_id`       | `Anime`                                            | Public     |
| `/anime-movie/:system_id` | `AnimeMovie`                                       | Public     |
| `/movie/:system_id`       | `Movie`                                            | Public     |
| `/collection/:system_id`  | `Collection` → `CollectionPage` (umbrella hub)     | Public     |
| `/franchise/:system_id`   | `Franchise` → `FranchisePage` (unified tabbed hub) | Public     |
| `/series/:system_id`      | `Series` → `SeriesPage` (unified tabbed hub)       | Public     |
| `/watch-order/:system_id` | `WatchOrder` → `WatchOrderPage`                    | Public     |
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
| `/quote`                  | `Quotes`                                           | Public     |
| `/meme`                   | `Memes`                                            | Public     |
| `/under-development`      | `UnderDevelopment`                                 | Public     |
| `/system`                 | `Admin`                                            | Admin only |
| `/data-history`           | `DataHistory`                                      | Admin only |
| `/review-queue`           | `ReviewQueue`                                      | Admin only |
| `/add`                    | `Add`                                              | Admin only |
| `/modify`                 | `Modify`                                           | Admin only |
| `/delete`                 | `Delete`                                           | Admin only |
| `/defaults`               | `FormDefaults`                                     | Admin only |
| `/watch-orders`           | `WatchOrders`                                      | Admin only |
| `/relations`              | `Relations`                                        | Admin only |

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
  - Reality _(franchise_type="TV or Movie" only)_ → Collection Library, Franchise Library, TV Show Library, Movie Library
  - Cartoon → Cartoon Library
  - More → Plan, Statistics, Completions, Future Release, Seasonal
  - Admin dropdown (admin only) → Control Center (/system), Data History, Review Queue (/review-queue), Add Entry, Modify Entry, Delete Entry, Form Defaults (/defaults)
- **Universal search bar** — debounced, client-side filtering; caches full DB on first query; scope selector: All, Collection, Franchise, Series, Anime, Anime Movie, Movie, TV Show, Cartoon, Seasonal. Results grouped by kind and shown as suggestion entries.
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
- `GET /api/announcements/`

**Announcement division** (topmost) — the "Announcement & Notes" board, rendered by `AnnouncementBoard.jsx`. Notes come from `GET /api/announcements/` (public) and are stored as `announcement:<title>` rows in `system_configs`; admins manage them from the Admin page (`/system`). The query is deliberately excluded from the page's combined loading/error state so a failed board never blocks the dashboard. Each note card clamps its body and has an expand button that opens `AnnouncementModal.jsx` fullscreen. With no notes the division still renders, showing a dashed "No Announcement & Notes" empty state and a `0 Posted` count.

**Schedule division** — two weekly Sunday→Saturday schedules rendered by `WeeklySchedule.jsx`. Column order comes from `SCHEDULE_DAYS` (`frontend/src/config/weekdays.js`), which is Sunday-first so the index matches `Date.getDay()`; today's column is highlighted. Day columns are fixed-width and scroll horizontally so titles have room.

- **My Watch Schedule** (first): entries where `airing_status === "Airing"` and `my_watch_day` is set, bucketed by `my_watch_day`. Name only, sorted alphabetically.
- **Broadcast Schedule** (second): entries where `airing_status === "Airing"` and `broadcast_day` is set, bucketed by `broadcast_day`. Shows `broadcast_time` (trimmed to `HH:MM`) above the name, sorted by time ascending with missing times last.
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
- **`AnimeNotes`** (`frontend/src/pages/detail/AnimeNotes.jsx`) — the notes tab, a thin wrapper over the shared `NotesTemplate`; always rendered at the bottom. Sections come from `GET /api/notes/sections`, rows from `GET /api/notes`, and each edit writes one row via `/api/notes` rather than re-saving the whole entry.

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
- **`AnimeMovieNotes`** (`frontend/src/pages/detail/AnimeMovieNotes.jsx`) — the notes tab, a thin wrapper over the shared `NotesTemplate`; always rendered at the bottom. Sections come from `GET /api/notes/sections`, rows from `GET /api/notes`, and each edit writes one row via `/api/notes` rather than re-saving the whole entry.

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
- **`MovieNotes`** (`frontend/src/pages/detail/MovieNotes.jsx`) — the notes tab, a thin wrapper over the shared `NotesTemplate`; always rendered at the bottom. Sections come from `GET /api/notes/sections`, rows from `GET /api/notes`, and each edit writes one row via `/api/notes` rather than re-saving the whole entry.

Admin writes use `PATCH /api/movies/:system_id`.

---

### TV Show Detail (`/tv-show/:system_id`)

**File:** `frontend/src/pages/detail/TV.jsx`

Full detail page for a single TV show entry.

**Data loaded:**

- `GET /api/tv-shows/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`
- `GET /api/media-relation/for-entry?media_type=tv-show&entry_id=:system_id` — feeds the Related Entries card

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
- **`TVShowNotes`** (`frontend/src/pages/detail/TVShowNotes.jsx`) — the notes tab, a thin wrapper over the shared `NotesTemplate`; always rendered at the bottom. Sections come from `GET /api/notes/sections`, rows from `GET /api/notes`, and each edit writes one row via `/api/notes` rather than re-saving the whole entry.

Admin writes use `PATCH /api/tv-shows/:system_id`.

---

### Cartoon Detail (`/cartoon/:system_id`)

**File:** `frontend/src/pages/detail/Cartoon.jsx`

Full detail page for a single cartoon entry.

**Data loaded:**

- `GET /api/cartoon/:system_id`
- `GET /api/franchise/`
- `GET /api/series/`
- `GET /api/media-relation/for-entry?media_type=cartoon&entry_id=:system_id` — feeds the Related Entries card

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
- **`CartoonNotes`** (`frontend/src/pages/detail/CartoonNotes.jsx`) — the notes tab, a thin wrapper over the shared `NotesTemplate`; always rendered at the bottom. Sections come from `GET /api/notes/sections`, rows from `GET /api/notes`, and each edit writes one row via `/api/notes` rather than re-saving the whole entry.

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
- **`MangaNotes`** (`frontend/src/pages/detail/MangaNotes.jsx`) — the notes tab, a thin wrapper over the shared `NotesTemplate`; always rendered at the bottom. Sections come from `GET /api/notes/sections`, rows from `GET /api/notes`, and each edit writes one row via `/api/notes` rather than re-saving the whole entry.

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
- **`NovelNotes`** (`frontend/src/pages/detail/NovelNotes.jsx`) — the notes tab, a thin
  wrapper over the shared `NotesTemplate`; always rendered at the bottom. Sections come
  from `GET /api/notes/sections`, rows from `GET /api/notes`, and each edit writes one row
  via `/api/notes` rather than re-saving the whole entry.

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

A **Watch Order** tab is always present, regardless of type flags: the tab body
(`components/tracker/WatchOrderSection.jsx`) loads the franchise's orders itself
and reports when there are none, which is exactly when an admin needs the entry
point. It renders the read-only `<WatchOrderGuide>` with a selector across
orders, an "Open full page" link to `/watch-order/:id`, and, for admins, an
"Edit" link to `/watch-orders`. Editing is never embedded here.

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
   - Badges: My Rating, Franchise Expectation, Watch Next Group (ACG only), To Rewatch (ACG only), parent Collection (links to `/collection/:id`, shown only when `collection_id` is set), Total Entries count
   - Completion block: `completed / total` across all entry types; watchable entries (anime, anime movies, movies, TV shows, cartoons) use `watching_status === "Completed"`; readable entries (manga, novel) uses `reading_status === "Completed"`
   - Admin controls: Overall Rating select, Expectation select, Watch Next Group select (ACG only), To Rewatch checkbox (ACG only) — all save via `PATCH /api/franchise/:system_id`
   - Remark: 3-row textarea at the bottom of the hero (admin editable, saves on blur via `PATCH /api/franchise/:system_id`); hidden for guests when empty. When the text overflows the three rows a "Show all" button opens `RemarkModal`. Same treatment as the Collection Hub.
4. Series card: clickable series name badges — links to `/series/:system_id`
5. Tab bar, in two labelled groups (see below)
6. Tab content sections (one rendered at a time)

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

Default active tab: first tab in the above order that has entries; the Extras tabs below take over when the franchise has no entries at all.

**Tab groups:** the bar is split so it is clear which selector filters media entries and which does not.

| Group  | Tabs                                                       | Notes                                                                        |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Media  | Anime, Anime Movies, Manga, Novel, Movies, TV Shows, Cartoons | Picks which entries the list below shows; each carries an entry count pill. Group is omitted when the franchise has no entries. |
| Extras | Watch Order, Notes                                         | Material owned by the franchise itself, not an entry filter; always present, no count pill. Memes are a section *inside* Notes — the registry gives `memes` to every owner, so they are not a tab of their own. |

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

### Series Hub (`/series/:system_id`)

**Files:** `frontend/src/pages/detail/Series.jsx` (thin wrapper) → `frontend/src/pages/detail/SeriesPage.jsx` (unified hub)

`Series.jsx` renders `SeriesPage` unconditionally, mirroring `Franchise.jsx`. Series has no type field, so unlike the Franchise Hub, media tabs are gated purely on whether each entry list is non-empty — there are no type flags to derive.

**Data loaded** (one `Promise.all` on mount):

- `GET /api/series/:system_id`
- `GET /api/franchise/:franchise_id` for the parent franchise badge — skipped when `franchise_id` is null
- `GET /api/anime/?series_id=:system_id`
- `GET /api/movies/?series_id=:system_id`
- `GET /api/tv-shows/?series_id=:system_id`
- `GET /api/cartoon/?series_id=:system_id`
- `GET /api/manga/?series_id=:system_id`
- `GET /api/novel/?series_id=:system_id`

Six entry lists, not seven: `anime_movies` has no `series_id` column, so an anime movie can only ever be reached through its franchise, never through a series.

**Layout:**

1. Breadcrumb → `/library/franchise` → parent franchise (when present) → series name
2. Admin toolbar: Quick Edit button → `/modify?id=:system_id`
3. Hero card:
   - "Series" tag (no type badge — series has no type)
   - Main title: Series Name CN (fallback: EN → Alt → Roman → JP)
   - Sub-titles: EN / JP / Romaji / Alt — each hidden if same as main title
   - Badges: My Rating, Series Expectation, parent Franchise (links to `/franchise/:id`, shown only when `franchise_id` is set), To Rewatch, Total Entries count
   - Completion block: `completed / total` across all six entry types; watchable entries (anime, movies, TV shows, cartoons) use `watching_status === "Completed"`; readable entries (manga, novel) use `reading_status === "Completed"`
   - Admin controls: Overall Rating select, Expectation select, To Rewatch checkbox — all save via `PATCH /api/series/:system_id`
   - Remark: 3-row textarea at the bottom of the hero (admin editable, saves on blur); hidden for guests when empty. A "Show all" button opens `RemarkModal` when the text overflows the three rows. Same treatment as the Franchise Hub.
   - No Watch Next Group control — that column does not exist on `series`.
4. Tab bar, in two labelled groups (see below)
5. Tab content sections (one rendered at a time)

**Tabs:** media tabs appear only when their entry list is non-empty (no type flags to combine with, unlike Franchise); Watch Order and Notes are always offered.

| Group  | Tabs                                                     | Notes                                                                                                    |
| ------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Media  | Anime, Manga, Novel, Movies, TV Shows, Cartoons            | Shown only when its list is non-empty; each carries an entry count pill. No Anime Movies tab — anime movies have no `series_id`. Group is omitted when the series has no entries. |
| Extras | Watch Order, Notes                                         | Always present, no count pill. Watch Order renders `components/tracker/WatchOrderSection.jsx` with `seriesId={system_id}`. Notes renders `SeriesNotes`, which resolves owners via `TIER_TABLES`. |

Sort, filter, and card behavior per media tab mirror the Franchise Hub's tabs exactly, with one omission: the per-tab "Group by Series" toggle is dropped everywhere, since it is meaningless inside a single series.

Admin writes use `PATCH /api/series/:system_id`.

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

### Collection Library (`/library/collection`)

**File:** `frontend/src/pages/library/CollectionLibrary.jsx`

Grid library of Collections — the optional umbrella tier above Franchise (Marvel, Type-Moon, …). Simpler than the Franchise Library: there is **no type filter**, because a collection has no type, and no table view.

**Data loaded:** `/api/collection/`, `/api/franchise/` (to group members and count them), plus all seven media lists (needed only to resolve cover images).

**Cover rule:** `cover_franchise_id` names a *member franchise*, whose own cover logic then resolves the image; otherwise the first member franchise (by sort name) that yields a real cover; otherwise the placeholder. Implemented by `getCollectionCover` in `frontend/src/lib/covers.js`.

**Card:** `CollectionCard.jsx` — rating badge, member count badge, display name, "N franchises", expectation badge. Links to `/collection/:system_id`.

**Toolbar:** search across all five name fields; sort by Title / My Rating / Expectation.

> The Franchise Library is deliberately unaffected by this page — it stays flat and complete, listing every franchise whether or not it belongs to a collection.

---

### Collection Hub (`/collection/:system_id`)

**File:** `frontend/src/pages/detail/CollectionPage.jsx` (wrapped by `detail/Collection.jsx`)

Lists the franchises belonging to one collection. Intentionally far simpler than the Franchise Hub — a collection groups franchises, not media entries, so there are no per-type tabs, status filters, or statistics.

**Data loaded:** `/api/collection/{id}`, `/api/franchise/?collection_id={id}` (members), plus the seven media lists for member cover resolution.

**Layout:** breadcrumb → hero (title, alternative names, rating + expectation badges, member count, remark) → member grid.

**Admin controls:** inline `my_rating` and `collection_expectation` selects and a remark textarea, all saving via `PATCH /api/collection/{id}`; plus a Quick Edit link to `/modify?id=`.

**Members** are rendered with the existing `FranchiseCard`, so clicking one lands on the unchanged `/franchise/:system_id`.

**Watch Order** appears as a section below the member grid rather than a tab —
this page has no tab bar — rendered by the same `WatchOrderSection` the
Franchise Hub uses, scoped by `collection_id`.

**Notes** follow it as another section, rendered by `CollectionNotes` over the
shared `NotesTemplate` with `ownerType="collection"`. Memes live inside it: the
registry gives `memes` to all eleven owners (eight media types plus series,
franchise and collection — comic included, even though it has no notes page of
its own yet), so the notes section renders them alongside the rest rather than
the page mounting a second copy.

---

### Watch Order (`/watch-order/:system_id`)

**File:** `frontend/src/pages/detail/WatchOrderPage.jsx` (wrapped by `detail/WatchOrder.jsx`)

The shareable full-page view of one watch order — the same guide the Franchise
and Collection pages embed, given more room.

**Data loaded:** `GET /api/watch-order/lists/{id}` (items already resolved to
display data), then, once that lands, the owner via `/api/franchise/{id}` or
`/api/collection/{id}` and the owner's other orders via
`/api/watch-order/lists?franchise_id=` — both after the guide rather than
blocking it.

**Layout:** back-link to the owner → title with `list_type` and Default badges
and a step count → `<WatchOrderGuide roomy>` → "Other orders for …" links.

**Steps** show a position badge, poster, title, episode-range label (`Ep 1–10`),
an Essential or Optional badge, the media type, the entry's watch/read status,
and the per-step note; each links to the entry's detail page. An
All / Hide optional / Essentials only filter appears when any step is marked
either way — each option is offered only when it has something to act on — and
filtering renumbers the visible rows rather than leaving gaps. A step whose entry was deleted renders as a muted
"Entry no longer exists" row instead of disappearing.

Admins get an "Edit this order" link to `/watch-orders`; nothing on this page writes.

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
   - One 3x3 grid for each franchise: ACG, Movie, TV Show, Cartoon, Novel, and Comic.
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

### Quotes (`/quote`)

Every quote and meme in the library, grouped by the media entry it came from.

**Loads:** `GET /api/quote/grouped` through `useApiQuery`, with the filter state
passed as query params — filtering happens server-side so the grouped shape and
each group's entry header stay intact (narrowing in the browser would leave
empty groups behind).

**Filter bar:** kind (all / quotes / memes), media type, General, Favorites,
Needs review (admin only), and a text search over the quote text, translation,
speaker, and original source.

**Body:** one card per entry — cover thumbnail plus a `display_name` linking to
that entry's detail page — followed by its quotes. Each quote row shows the text
large and italic, then a muted meta line: speaker, "quoting …" when
`original_source` is set, episode, language, kind/general/favorite/needs-review
badges, tags, and a link pill.

**Per-quote actions:** copy text (everyone), copy image (local only, when
`image_file` is set), and — for admins — favorite toggle, inline edit, delete.

**Missing entries:** a group whose `entry_id` no longer resolves renders under a
muted "Unlinked / deleted entry" header at the bottom of the list rather than
disappearing, so the dangling row stays visible and fixable.

**Images are local-only.** `getQuoteImageUrl` returns `null` off localhost
because Cloud Run's filesystem is ephemeral, so both the image and its copy
button are absent in production.

---

### Memes (`/meme`)

Every meme in the library, grouped by its owner — a media entry, or a whole
series, franchise or collection.

**Loads:** `GET /api/meme/grouped`. Shares its shell with `/quote` —
`components/layout/GroupedEntryPage.jsx` renders the header, filter bar, and
per-entry cards for both; only the row component and the filters differ.

**Filter bar:** owner type (a ten-value select, split into Media Entry and
Grouping Tier groups), Favorites, and a text search over the meme's lines. No
General or tag filters — a meme has neither field.

**Owner headers:** entry owners show their cover; tier owners have no cover
column, so they show an icon tile (sitemap / layers / boxes) plus a label pill
naming the kind. A series owner renders as plain text rather than a link, since
Series has no page.

**Body:** the image first when set (a meme has at most one, so its position is
not stored), then its text. A meme whose text is also a quote carries a badge
showing the quote's speaker.

**Per-meme actions:** copy text (all lines joined), copy image (local only), and
— for admins — favorite toggle, inline edit, delete.

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

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/novel/`, `/api/comic/`, `/api/form-defaults/`

The per-field defaults noted below are the **built-in** values from
`frontend/src/config/formFactories.js`. Any of them can be overridden per media type
on [Form Defaults](#form-defaults-defaults); what a tab actually opens with is the
factory value with the admin's overrides layered on top.

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

#### Add New Comic Entry Tab

Includes auto-fill from existing entry search bar (searches Comic Name EN/CN/Alt only — comic has no Roman/JP name field).

> Comic has no detail page, notes page or library page yet — `Comic.jsx`,
> `ComicNotes.jsx` and `LibraryComic.jsx` do not exist. There is no nav link,
> no universal-search entry, and no `MediaCard` for comic either. Admin Add /
> Modify / Delete are the only **entry-level** surfaces that exist for comic
> today — the Comic *franchise* type is already surfaced elsewhere (the
> Franchise Library's type filter, the Favorite Franchise 3×3 grid) — so a
> created comic entry itself is reachable only by editing it back on `/modify`.

- **Titles & Naming:** Franchise (ComboBox + auto-create modal, filtered to `franchise_type` including `Comic`), Series (ComboBox + auto-create modal), Comic Name EN (primary), then Comic Name CN / Alt — **EN leads**, the only entry type that does not lead with CN
- **Titles & Naming (cont.):** Volume Label (free text, e.g. "Vol. 5 (2018)"), Comic Type dropdown
- **Classification:** Continuity, Era (both free-typed ComboBoxes over a system-option category), Events (multi-select, "Marvel events this run is part of")
- **Status:** Serialization Status dropdown, Reading Status dropdown (default: Might Read), My Rating dropdown
- **Progress:** Issues Finished, Total Issues — comic tracks **issues**, not episodes/chapters/volumes
- **Credits:** Writer (multi-select), Artist (multi-select), Publisher, Imprint, Publisher TW (all free-typed ComboBoxes), Release Year, End Year
- **Relational & Timeline:** Read Order, Main Entry checkbox (`is_main_entry` — a boolean checkbox, unlike Novel's Main/Spinoff string select)
- **Sources:** Other Sources (Add Source button, `{name: url}` pairs)
- **Flags:** Read Next checkbox, To Reread checkbox
- **Notes & Other:** Cover Image File, Remark
- **No MAL/AniList fields, no Scores section, no `progress_display`** — comics are manual-entry, with no external metadata source to enrich from
- `POST /api/comic/`; unlike Anime, Manga and Movie, nothing runs after submit — there is no enrichment pipeline for comic
- Free-typed values in Writer, Artist, Publisher, Imprint, Continuity, Era, Events and Publisher TW are checked against existing system options and auto-created (`POST /api/options/`) before the entry is submitted, under categories `Comic Writer`, `Comic Artist`, `Comic Publisher`, `Comic Imprint`, `Comic Continuity`, `Comic Era`, `Comic Event`, plus the shared `Distributor TW` for Publisher TW

---

### Modify (`/modify`)

**File:** `frontend/src/pages/admin/Modify.jsx`

Search-then-edit pattern. Shows most recently modified entry at top. Supports `?id=:uuid` deep-link.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/novel/`, `/api/comic/`

Supports `?id=:uuid&type=movie` deep-link from Movie detail page Quick Edit button.

#### Modify Anime Entry Tab (default)

- Search bar (Franchise + Series + Entry names); results grouped by franchise/series, shown as Search Suggestion
- Recently Modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block (grouped by series), then full edit form
- Form mirrors Add Anime tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and **`AnimeNotes`** — the shared notes tab (see the detail page).

Writes: `PATCH /api/anime/:id`; Jikan enrichment via `POST /api/data-control/replace/anime/:id`

#### Modify Anime Movie Entry Tab

- Search bar; recently modified entries: Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block, then full edit form
- Form mirrors Add Anime Movie tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and **`AnimeMovieNotes`** — the shared notes tab (see the detail page).

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
- **`MovieNotes`** (`frontend/src/pages/detail/MovieNotes.jsx`) — the shared notes tab (see the detail page); always rendered at the bottom.
- Save Changes Button

Writes: `PUT /api/movies/:id` (triggers `execute_replace_single_movie` automatically)

#### Modify TV Show Entry Tab

- Search bar; recently modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: System ID (immutable), Other Entries in franchise block grouped by series — show entry name CN with fallback (hidden for 獨立電影/影集, Disney, Marvel franchises), Entry Name CN with fallback (immutable), then full edit form
- Form sections: Titles & Naming, Status & Progress, Classification & Production, Relational & Timeline, Source & Links, Notes & Other (Cover Image + Remark)
- **`TVShowNotes`** (`frontend/src/pages/detail/TVShowNotes.jsx`) — the shared notes tab (see the detail page); always rendered at the bottom.
- Save Changes Button

Writes: `PATCH /api/tv-shows/:id`

#### Modify Cartoon Entry Tab

- Search bar; recently modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: System ID (immutable), Other Entries in franchise block grouped by series — show entry name CN with fallback, Entry Name CN with fallback (immutable), then full edit form
- Form sections: Titles & Naming, Status & Progress, Classification & Production, Relational & Timeline, Source & Links, Notes & Other (Cover Image + Remark)
- **`CartoonNotes`** (`frontend/src/pages/detail/CartoonNotes.jsx`) — the shared notes tab (see the detail page); always rendered at the bottom.
- Save Changes Button

Writes: `PATCH /api/cartoon/:id`

#### Modify Manga Entry Tab

- Search bar (Franchise + Series + Entry names); results grouped by franchise/series, shown as Search Suggestion
- Recently Modified entries: Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block (grouped by series), then full edit form
- Form mirrors Add Manga tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and **`MangaNotes`** — the shared notes tab (see the detail page).

Writes: `PATCH /api/manga/:id`

#### Modify Novel Entry Tab

- Search bar (searches all languages including Alt); recently modified entries: Entry Name CN with fallback, Franchise Name CN with fallback
- Recently Modified entries: Novel Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: System ID (immutable), Other Entries in franchise block (grouped by series) — show entry name CN with fallback, Entry Name CN with fallback (immutable), then full edit form
- Form mirrors Add Novel tab, plus System ID (immutable), Entry Name CN with fallback (immutable), **`NovelNotes`** — the shared notes tab (see the detail page), and Save Changes Button

Writes: `PATCH /api/novel/:id`

#### Modify Comic Entry Tab

- Search bar (matches Comic Name EN/CN/Alt); results grouped by franchise/series, shown as Search Suggestion
- After selecting: a sibling ribbon shows other comic entries in that franchise, grouped by series, then full edit form
- Form mirrors Add Comic tab, plus System ID (immutable)
- **No structured notes section** — every other Modify tab mounts a shared notes editor (e.g. `NovelNotes`, `MangaNotes`); the comic tab does not, because `ComicNotes.jsx` does not exist yet
- Franchise/Series auto-create modals work the same as Add (names from Comic Name EN/CN/Alt, `franchise_type = Comic`)
- Free-typed Writer/Artist/Publisher/Imprint/Continuity/Era/Events/Publisher TW values are auto-created as system options on save, same as Add

Writes: `PATCH /api/comic/:id`

#### Modify Fav 3×3 Tab

**File:** `frontend/src/pages/modify-tabs/Fav3x3ModifyTab.jsx`

- No search/edit pattern — renders full grid view immediately on tab open; bypasses discovery and editor views
- Displays all 6 franchise grids: ACG, Novel, Movie, TV Show, Cartoon, Comic (matching Statistics page layout)
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

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/novel/`, `/api/comic/`

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

#### Delete Comic Entry Tab

- Search bar (matches Comic Name EN/CN/Alt) → **Search Suggestion for Deletion** (reusable)
- After selecting: cover thumbnail, Comic Name, Volume Label, Comic Type, Publisher, Reading Status, `issue_fin / issue_total` issue progress, Franchise / Series, Remark, System ID, Delete button
- If only entry in series: offer to delete series or keep it (counted across anime, manga, novel and comic — the series-capable tier; cartoon, TV show and movie are not counted)
- If only entry in franchise: offer to delete franchise or keep it (counted across anime, anime movie, TV show, cartoon, manga, novel and comic)

Deletes: `DELETE /api/comic/:id`

---

### Form Defaults (`/defaults`)

**File:** `frontend/src/pages/admin/FormDefaults.jsx`

Configures what the Add form starts with, and what auto-fill copies, per media type.
Eleven tabs (every Add tab except System Options), all rendered by a **single** generic
component — `pages/defaults-tabs/DefaultsTab.jsx` — because the layout is driven by the
field registry rather than hand-written per-type markup.

**Data loaded:** `GET /api/form-defaults/`, `GET /api/options/`

Each tab lists every field of that media type's form, grouped into sections
(Names, Relations, Classification, Status, Progress, …), with three columns per row:

| Column          | Behavior                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------- |
| Label + key     | Human label from the registry, plus the raw field key underneath                              |
| Default value   | The same control type the Add form uses. Un-overridden fields show `built-in: <value>` ghost text; a `↺` button appears once a field is overridden and clears it |
| Auto-fill       | Checkbox controlling whether auto-fill copies this field. Per-section select-all / none       |

**Footer (sticky):** count of overridden and auto-filled fields, an unsaved-changes
indicator, **Reset tab to built-in** (`DELETE`, behind a confirm), and **Save** (`PUT`,
disabled unless dirty). Unsaved tabs are marked with an amber dot in the tab bar.

**Behavior notes:**

- Drafts are held per tab, so switching tabs never discards edits. A `beforeunload`
  guard fires while anything is unsaved.
- Only overridden fields are saved — the stored payload is sparse.
- Fields with no meaningful default (`franchise_id`, `series_id`, `source_other`,
  `cover_image_file`, the per-volume novel name lists) show "No default for this field"
  but still expose the auto-fill checkbox where that makes sense.
- Saving while `/add` is already open does not hot-update it; Add re-reads the config on
  its next mount.

---

### Relations (`/relations`)

**File:** `frontend/src/pages/admin/Relations.jsx`

Where media relations are curated. Nothing derives them, and the detail pages
only read them.

**Data loaded:** `GET /api/media-relation/kinds` (the dropdown vocabulary),
`/api/franchise/` and `/api/collection/` at `limit=2000` for the scope picker,
then per scope `GET /api/watch-order/candidates` (reused — it already flattens
a franchise or collection's entries across all eight media tables),
`GET /api/media-relation/?franchise_id=` for the left pane's count badges, and
`GET /api/media-relation/graph?franchise_id=` for the canvas.

**Scope is a browsing lens, not ownership.** Unlike a watch order, a relation
belongs to no tier — it links two entries. Collection works as the wider lens
for free, since it sits strictly above Franchise, and that is where most
cross-franchise relations live.

**Left pane (unchanged):** a Franchise / Collection toggle, a typeahead over
that tier, a text filter, then the scope's entries grouped by media type. Each
row badges how many relations touch it, counting **both** endpoints — an entry
with only inbound relations still has relations. Clicking an entry focuses that
node on the canvas.

**Right pane:** a `@xyflow/react` graph canvas — `RelationGraph.jsx` —
replacing the old per-entry relation list. Every scope entry is a node
(`RelationNode.jsx`), laid out left-to-right by `@dagrejs/dagre`
(`lib/relationLayout.js`); a relation reaching outside the scope pulls in a
"ghost" node for its far endpoint. Dragging from a node's handle and dropping
on another node, or on empty canvas (which opens a global cross-media search
for the far entry), opens `ConnectPopup.jsx` reading "A is the *kind* of B" —
nothing is written until Confirm, Escape cancels, and a 409 duplicate/self
relation leaves the popup open showing the server's message. Clicking an edge
opens `EdgeInspector.jsx` (change kind, edit remark on blur, delete behind a
confirm naming both entries). Clicking a node opens `NodePanel.jsx` (cover,
name, its relation list, an isolate toggle, a link to the entry's detail page).
Clicking a ghost node switches the page's scope to that node's franchise.

---

### Watch Orders (`/watch-orders`)

**File:** `frontend/src/pages/admin/WatchOrders.jsx`

Where watch orders are built. The Franchise and Collection pages only read them.

**Data loaded:** `GET /api/watch-order/lists` (all orders), `/api/franchise/`,
`/api/series/` and `/api/collection/` for the owner names. All three tiers are
indexed together, so a series-owned order resolves to its series name instead
of falling through the franchise/collection split.

**Left pane — owner first.** Persistent across every state: one search bar, a
**Show built-in** checkbox (built-in orders are hidden by default — with two
per franchise and two per series they would otherwise bury the hand-built
orders this page exists for), and a **Backfill built-in orders** action that
creates them for every owner that lacks them. Series-owned built-in orders have
no page of their own yet; they are reachable through the API and this list.

**The search bar** follows the nav's universal search: a scope select — `All`,
`Collection`, `Franchise`, `Series`, `Order` — beside the text box, since you
rarely know in advance whether a half-remembered name belongs to an owner or to
an order. `All` spans both; the rest narrow to one kind. Below it the pane is in
one of two states:

- **Owners and orders (no owner picked, or the box has text).** Owner rows
  sectioned by tier, widest first — Collection, then Franchise, then Series,
  each under its own pill and count, empty tiers omitted — followed by an
  **Order** section of matching orders, grouped by owner because two orders can
  share a name. With the box empty, the owner sections list only the owners that
  have orders and no orders are shown; typing widens the owners to every name
  and brings in the order matches. Scope `Order` with an empty box is the
  exception: it lists every order, which is what this page showed before the
  rewrite. Opening an order also scopes to its owner, so clearing the search
  leaves you where that order lives.
- **Scoped (an owner picked, box empty).** A header with the owner name, tier
  pill, a back arrow, and a **+ New order** button, followed by that owner's
  orders. The scope lives in the URL as `?owner=<tier>:<id>`, so a reload or a
  shared link lands on the same owner. Creating happens here and nowhere else:
  the form takes only a name and a type, since the owner is already fixed.
  Typing in the search bar overrides this view; clearing the box returns to it.

Scoping and searching filter the lists already in memory — no extra
requests. Each order row opens the editor, links out to the public
page, duplicates the order, or deletes it behind a confirm. Duplicating
(`POST /lists/{id}/duplicate`) selects the copy straight away and takes no
confirm — the undo is deleting the copy. It is also the only way to edit a
built-in order's steps: the copy is hand-built, with the generated steps
written out as real ones.

**Right pane:** `components/tracker/WatchOrderEditor.jsx` for the selected order:

- Name, type (Custom / Chronological / Release / Recommended), note, and a
  "Show this order first" checkbox — each saving via `PATCH /lists/{id}`.
- An entry picker fed by `GET /api/watch-order/candidates`, one request covering
  every media type of the owner (a collection resolves to its member franchises
  first). The same entry may be added repeatedly — that is how a split run is
  written.
- Per-step episode range, Optional checkbox, and note. Text and number inputs
  commit on blur, not per keystroke. Movie, anime-movie, manga and novel
  steps cover their entry whole, so those get no range inputs at all.
- Reorder by drag or by up/down buttons; both commit through
  `PUT /lists/{id}/reorder`, which renumbers positions 1..N. The reorder is
  applied locally first so a dragged row does not snap back mid-request.

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
