# Pages Documentation

React SPA served by FastAPI's catch-all route. All routing is client-side via React Router v6 (`BrowserRouter` + `Routes`). Non-API paths return `frontend_dist/index.html`. Data is fetched via native `fetch()` in `useEffect` hooks (TanStack Query is wired up but not actively used for queries yet).

---

## Route Map

| Path                      | Component           | Access     |
| ------------------------- | ------------------- | ---------- |
| `/`                       | `Index`             | Public     |
| `/login`                  | `Login`             | Public     |
| `/search`                 | `Search`            | Public     |
| `/library/anime`          | `LibraryAnime`      | Public     |
| `/library/anime-movie`    | `LibraryAnimeMovie` | Public     |
| `/library/franchise`      | `FranchiseLibrary`  | Public     |
| `/future-releases`        | `FutureReleases`    | Public     |
| `/anime/:system_id`       | `Anime`             | Public     |
| `/anime-movie/:system_id` | `AnimeMovie`        | Public     |
| `/franchise/:system_id`   | `FranchiseAcg`      | Public     |
| `/seasonal`               | `SeasonalOverall`   | Public     |
| `/seasonal/:seasonal_id`  | `SeasonalDetail`    | Public     |
| `/statistics`             | `Statistics`        | Public     |
| `/under-development`      | `UnderDevelopment`  | Public     |
| `/system`                 | `Admin`             | Admin only |
| `/data-history`           | `DataHistory`       | Admin only |
| `/review`                 | `Review`            | Admin only |
| `/add`                    | `Add`               | Admin only |
| `/modify`                 | `Modify`            | Admin only |
| `/delete`                 | `Delete`            | Admin only |

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
  - Library → Anime Library, Anime Movie Library, Franchise Library (others redirect to `/under-development`)
  - More → Statistics, Future Releases, Seasonal Overall, Seasonal Detail
  - Admin dropdown (admin only) → System, Data History, Review, Add, Modify, Delete
- **Universal search bar** — debounced, client-side filtering; caches full DB on first query; supports scope selector (All / Seasonal / Franchise / Anime — others show under-development stub). Results grouped by kind and shown as suggestion entries.
- **Backup button** (admin only) — triggers `POST /api/data-control/backup`
- **Login / Logout button**

---

## Entry Cards

Card variants are defined in `reusable-elements.md`. Quick reference:

| Canonical Name         | Code File                      | Used By                                                                   |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Anime Entry Card 1     | `DashboardCard.jsx`            | Dashboard, Seasonal Overall, Seasonal Detail                              |
| Anime Entry Card 2     | `AnimeCard.jsx`                | Anime Library, Franchise Hub (ACG), Search                                |
| Anime Entry Card 3     | Inline in `FutureReleases.jsx` | Future Releases (Anime tab)                                               |
| Anime Movie Entry Card | TBD                            | ACG Franchise, Anime Movie Library, Search, Future Releases               |
| Movie Entry Card       | TBD                            | Reality Franchise Hub, Movie Library, Search, Future Releases (Movie tab) |
| TV Show Entry Card 2   | TBD                            | Reality Franchise Hub, TV Show Library, Search                            |
| Cartoon Entry Card 2   | TBD                            | Cartoon Franchise Hub, Cartoon Library, Search                            |
| Manga Entry Card 2     | TBD                            | Manga Library, Search                                                     |
| Franchise Entry Card   | TBD                            | Franchise Library                                                         |

Full card specs are in `reusable-elements.md`.

---

## Pages

### Dashboard (`/`)

**File:** `frontend/src/pages/Index.jsx`

Current progress page. Shows all actively tracked media.

**Data loaded:**

- `GET /api/anime/`
- `GET /api/franchise/`

**Filter:** Anime / Manga / Novel / TV Show / Cartoon

**Watching division** (Anime · TV Show · Cartoon) — three sub-sections: Active Watching / Passive Watching / Paused.

- All entries sorted globally by franchise name (CN → EN fallback) then `watch_order`, then divided by `watching_status`.
- Within each sub-section, entries grouped by type and sorted by `my_rating` within each type group.
- Anime entries: **Anime Entry Card 1** (see `reusable-elements.md`)
- TV Show entries: **TV Show Entry Card 1** (TBD)
- Cartoon entries: **Cartoon Entry Card 1** (TBD)
- Admin: inline episode progress editing via `PATCH /api/anime/:system_id`.

**Reading division** (Manga · Novel) — rendered with an under-development placeholder. No data loaded for this division yet.

- Manga entries: **Manga Entry Card 1** (TBD)
- Novel entries: **Novel Entry Card 1** (TBD)

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
- Music Card (admin editable): OP, ED, Insert/OST dropdowns — rendered in `AnimeNotes`
- Remarks — shown when not null
- **Notes Card** (reusable, admin editable) — rendered in `AnimeNotes`

**Sub-component:** `AnimeNotes` (`frontend/src/pages/AnimeNotes.jsx`) — structured notes editor with 17 sections; saves via callback to parent which PATCHes `notes` field.

Admin writes use `PATCH /api/anime/:system_id`.

---

### Anime Movie Detail (`/anime-movie/:system_id`)

**File:** `frontend/src/pages/AnimeMovie.jsx` (TBD)

Full detail page for a single anime movie entry.

**Data loaded:**

- `GET /api/anime-movie/:system_id`
- `GET /api/franchise/`

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button

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

- **My Tracker Block** (reusable)
- **Naming Card** (reusable)
- **Information Card** (reusable)
- **Production Card** (reusable)
- Characters & Cast Card (TBD)
- Remarks — shown when not null
- **Notes Card** (reusable, admin editable)

---

### Movie Detail

**File:** `frontend/src/pages/Movie.jsx` (TBD)

Full detail page for a single movie entry.

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → executes Replace for single movie entry

**Layout (left column):**

- Movie poster
- **Sources Card** (reusable)
- Watch Order
- **Related Entries Card** (reusable)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status
- Main Title: Movie Name CN (with fallback)
- Sub Title: Movie Name EN (hidden if CN used fallback or is null)
- From Franchise: Franchise Name CN with fallback (navigates to franchise page)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)

**Detail sections:**

- **My Tracker Block** (reusable)
- **Naming Card** (reusable)
- **Information Card** (reusable)
- Remarks — shown when not null
- **Notes Card** (reusable, admin editable)

---

### TV Show Detail

**File:** `frontend/src/pages/TVShow.jsx` (TBD)

Full detail page for a single TV show entry.

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → executes Replace for single TV show entry

**Layout (left column):**

- TV Show poster
- **Sources Card** (reusable)
- Watch Order
- **Related Entries Card** (reusable)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status
- Main Title: TV Show Name CN (with fallback)
- Sub Title: TV Show Name EN (hidden if CN used fallback or is null)
- From Franchise: Franchise Name CN with fallback (navigates to franchise page)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- **Score Block** (reusable): includes Last Updated Time

**My Tracker section:**

- Ep Watched / Ep Total
  - +/- buttons for episode progress (admin only)
  - Direct edit input for Ep Watched (admin only)
- Watching Status dropdown (admin editable)
- My Rating dropdown (admin editable)

**Detail sections:**

- **My Tracker Block** (reusable)
- **Naming Card** (reusable)
- **Information Card** (reusable)
- Remarks — shown when not null
- **Notes Card** (reusable, admin editable)

---

### Cartoon Detail

**File:** `frontend/src/pages/Cartoon.jsx` (TBD)

Full detail page for a single cartoon entry.

**Admin Controls Block** (admin only):

- Edit button → `/modify?id=:system_id`
- Mark Completed button
- Autofill & Update button → executes Replace for single cartoon entry

**Layout (left column):**

- Cartoon poster
- **Sources Card** (reusable)
- Watch Order
- **Related Entries Card** (reusable)
- System Info Block (admin only): System ID

**Layout (right column):**

- Tags: Airing Status
- Main Title: Cartoon Name CN (with fallback)
- Sub Title: Cartoon Name EN (hidden if CN used fallback or is null)
- From Franchise: Franchise Name CN with fallback (navigates to franchise page)
- From Series: Series Name CN with fallback — uses **Series Information Pop Up Entry** (reusable)
- **Score Block** (reusable): includes Last Updated Time

**Detail sections:**

- **My Tracker Block** (reusable)
- **Naming Card** (reusable)
- **Information Card** (reusable)
- Remarks — shown when not null
- **Notes Card** (reusable, admin editable)

---

### Manga Detail

**File:** `frontend/src/pages/Manga.jsx` (TBD)

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
- **Notes Card** (reusable, admin editable)

---

### Franchise Hub — ACG (`/franchise/:system_id`)

**File:** `frontend/src/pages/FranchiseAcg.jsx`

Hub page for an ACG franchise (Anime, Anime Movie, Manga, Novel types).

**Data loaded:**

- `GET /api/franchise/:system_id`
- `GET /api/series/?franchise_id=:system_id`
- `GET /api/anime/?franchise_id=:system_id`
- `GET /api/anime-movie/?franchise_id=:system_id` (when applicable)

**Layout:**

- Edit button (admin only) → Modify page
- **Franchise Information Block** (reusable): Franchise Name CN/EN/Roman/JP/Alt (each hidden if CN used that name as fallback), `favorite_3x3_slot`, My Franchise Rating (admin editable), My Franchise Expectations (admin editable), completion percentage bar
- **Belonging Series Block** (reusable)
- **Notes and Remarks Block** (reusable, admin editable)

**Anime Entry Section** (shown when not null):

- Sort By: Release Date (default) / Title / My Rating / MAL Rating / Watch Order
  - Watch Order sort: entries without `watch_order` go to bottom
- Filter: Airing Type / Airing Status / Watching Status / 巴哈
- **Group by Series Button** (reusable)
- Each entry: **Anime Entry Card 2** (see `reusable-elements.md`), grouped by Series

**Anime Movie Entry Section** (shown when not null):

- Sort By: Release Date (default, uses `release_date_jp` with `release_date_tw` fallback) / Title / My Rating / MAL Rating
- Each entry: **Anime Movie Entry Card** (see `reusable-elements.md`)

**Manga Entry Section** (TBD)

**Novel Entry Section** (TBD)

Admin edit: `PATCH /api/franchise/:system_id` for rating, expectation, remarks.

---

### Franchise Hub — Reality

**File:** `frontend/src/pages/FranchiseReality.jsx` (TBD)

Hub for movie/TV show franchises (Movies and TV shows with series).

**Layout:**

- Edit button (admin only) → Modify page
- **Franchise Information Block** (reusable)
- **Belonging Series Block** (reusable)
- **Notes and Remarks Block** (reusable, admin editable)

**Movie Entry Section:**

- Sort By: Release Date (default, uses `release_date_tw` with `release_date_us` fallback) / Title / My Rating / IMDB Rating
- Filter: Airing Status / Watching Status (Watching Status Filter Options)
- **Group by Series Button** (reusable)
- Each entry: **Movie Entry Card** (reusable), grouped by Series

**TV Show Entry Section:**

- Sort By: Release Date (default) / Title / My Rating / IMDB Rating
- Filter: Airing Status / Watching Status (Watching Status Filter Options)
- **Group by Series Button** (reusable)
- Each entry: **TV Show Entry Card** (reusable), grouped by Series

---

### Franchise Hub — Cartoon

**File:** `frontend/src/pages/FranchiseCartoon.jsx` (TBD)

Hub for cartoon franchises.

**Layout:**

- Edit button (admin only) → Modify page
- **Franchise Information Block** (reusable)
- **Belonging Series Block** (reusable)
- **Notes and Remarks Block** (reusable, admin editable)

**Cartoon Entry Section:**

- Sort By: Release Date (default) / Title / My Rating / IMDB Rating
- Filter: Airing Status / Watching Status (Watching Status Filter Options)
- **Group by Series Button** (reusable)
- Each entry: **Cartoon Entry Card 2** (reusable), grouped by Series

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
- Sort by: Title (default) / My Rating / MAL Rating / Release Date (new to old, TBD first)
- Advanced filters (collapsible): Airing Type, Airing Status, Watching Status, 巴哈
- Grid/Table view toggle

**Grid view** — each entry: **Anime Entry Card 2**

**Table view** — sticky-header table columns: Franchise Name CN (fallback), Anime Name CN, Anime Name EN (fallback: Roman), Airing Type, Season/Part, Airing Status, Ep Finished/Total, My Rating, MAL Rating, Studio, Bahamut icon, + button (admin status toggle)

Admin: inline quick-status toggle via `PATCH /api/anime/:system_id`.

---

### Anime Movie Library (`/library/anime-movie`)

**File:** `frontend/src/pages/LibraryAnimeMovie.jsx`

**Data loaded:**

- `GET /api/anime-movie/`
- `GET /api/franchise/`

**Library bar:**

- Filter search: by Franchise Title, Anime Movie Title, Release Year JP. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / MAL Rating / Release Date JP (new to old, TBD first)
- Advanced filters (collapsible): Airing Status, Watching Status, 巴哈
- Grid/Table view toggle

**Grid view** — each entry: **Anime Movie Entry Card**

**Table view** — columns: Franchise Name (fallback), Anime Movie Name CN, Anime Movie Name EN (fallback: Roman), Airing Status, My Rating, MAL Rating, Studio, Director, Bahamut icon, + button (admin only)

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
- Advanced filters (collapsible): Franchise Type (ACG / Anime Movie / TV or Movie / Cartoon / Other)
- Sort by: Title (default) / My Rating / Expectation
- Grid/Table view toggle (Table: TBD)

Each entry: **Franchise Entry Card** — navigates to `/franchise/:system_id`.

---

### Movie Library

**File:** `frontend/src/pages/LibraryMovie.jsx` (TBD)

**Data loaded:**

- `GET /api/movie/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Series Title, Movie Title, Release Year TW, Director. Case/punctuation/space insensitive.
- Advanced filters (collapsible): Airing Status, Watching Status (Watching Status Filter Options)
- Sort by: Title (default) / My Rating / IMDB Rating / Release Date TW with Release Date USA as fallback (new to old; TBD first)
- Grid/Table view toggle

**Grid view** — each entry: **Movie Entry Card**

**Table view** — columns: Franchise Name (fallback), Movie Name CN, Movie Name EN, Main/Spinoff, Airing Status, My Rating, IMDB Rating, Director, Length (Hr + Min), Release Date TW (Month Year), + button (admin only)

---

### TV Show Library

**File:** `frontend/src/pages/LibraryTVShow.jsx` (TBD)

**Data loaded:**

- `GET /api/tv-show/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Series Title, TV Show Entry Title, Release Date. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / IMDB Rating / Release Date (new to old; TBD first)
- Advanced filters (collapsible): TV Show Region, Airing Status, Watching Status (Watching Status Filter Options)
- Grid/Table view toggle

**Grid view** — each entry: **TV Show Entry Card 2**

**Table view** — columns: Franchise Name CN (fallback), TV Show Name CN, TV Show Name EN, Airing Type, Season Part, Airing Status, Ep Finished / Ep Total, Region, My Rating, IMDB Rating, + button (admin only)

---

### Cartoon Library

**File:** `frontend/src/pages/LibraryCartoon.jsx` (TBD)

**Data loaded:**

- `GET /api/cartoon/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Series Title, Cartoon Title, Release Year. Case/punctuation/space insensitive.
- Sort by: Title (default) / My Rating / IMDB Rating / Release Date (new to old; TBD first)
- Advanced filters (collapsible): Official Source, Airing Status, Watching Status (Watching Status Filter Options)
- Grid/Table view toggle

**Grid view** — each entry: **Cartoon Entry Card 2**

**Table view** — columns: Franchise Name CN (fallback), Cartoon Name CN, Cartoon Name EN, Airing Type, Season Part, Airing Status, Ep Finished / Ep Total, Official Source, My Rating, IMDB Rating, + button (admin only)

---

### Manga Library

**File:** `frontend/src/pages/LibraryManga.jsx` (TBD)

**Data loaded:**

- `GET /api/manga/`
- `GET /api/franchise/`
- `GET /api/series/`

**Library bar (always visible):**

- Filter search: by Franchise Title, Series Title, Manga Title, Release Year. Case/punctuation/space insensitive.
- Advanced filters (collapsible): Serialization Status, Reading Status (Reading Status Filter Options), Region
- Sort by: Title (default) / My Rating / MAL Rating / Release Date (new to old; TBD first) / Ending Date (new to old; TBD first)

**Grid view** — each entry: **Manga Entry Card 2**

**Table view** — columns: Franchise Name CN (fallback), Manga Name CN, Manga Name EN (fallback: Roman), Serialization Status, Ch Finished / Ch Total, Vol Finished / Vol Total, My Rating, MAL Rating, Anime Studio, Bahamut icon, + button (admin only)

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

_This Season block:_

- Seasonal Information Block: Seasonal Name, Total/Planned (Plan to Watch + Watch When Airs)/Watching/Completed entry counts, completion bar, Seasonal Rating (admin editable)
- **Rating Distribution Block** (reusable)
- Anime entries sorted by: Watching Status (Completed → Watching → Planned → Might Watch → Dropped), then My Rating, then Franchise Expectation
- Each card: **Anime Entry Card 1**

_Next Season block:_

- Seasonal Information Block: Seasonal Name, Total/Planned entry counts
- Anime entries sorted by: Watch When Airs → Plan to Watch → Might Watch → Other → Won't Watch, then My Rating, then Franchise Expectation
- Each card: **Anime Entry Card 1**

**All Seasons tab:**

- Year/season matrix (new to old); each row = 1 year with 4 season entries
- Navigation links to `/seasonal/:id`
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

- Seasonal Information Block: Seasonal Name, Total/Planned/Watching/Completed counts, completion bar, Seasonal Rating (admin editable), Prev/Next navigation arrows
- My Rating and MAL Rating distribution bar charts
- Anime entries sorted by Watching Status (Completed → Watching → Planned → Might Watch → Dropped), then My Rating, then Franchise Expectation — each entry: **Anime Entry Card 1**

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

1. **Favorite ACG Franchise 3×3 Grid** — franchises with `favorite_3x3_slot` 1–9; shows poster, Franchise Name CN with fallback, Franchise Rating

2. **Rating Distribution** — horizontal bar charts:
   - My Rating for ACG Franchise (S / A+ / A / B / C / D / E / F / Unrated)
   - MAL Rating for all anime entries (9+ / 8.7+ / 8.5+ / 8.2+ / 7.7+ / 7+ / 4+ / <4)
   - Seasonal Rating (S / A+ / A / B / C / D / E / F / Unrated)
   - Each chart shows amount and percentage per category

3. **Anime Seasonal Overview** — paginated table (12 per page, new to old; highlights current season with "Current" tag):
   - Release Season, My Seasonal Rating, # Completed, # Planned, # Watching, # Dropped

4. **Watch Next** — tabbed franchise/entry grid:
   - Anime tab: grouped by 12ep / 24ep / 30ep+; shows poster, Franchise Name CN with fallback, Franchise Expectation (live)
   - Anime Movie tab: grouped by 吉卜力 / 新海誠 / 原創動畫電影 / 改編動畫電影 / 其他; shows poster, Anime Movie Name CN with fallback
   - Movie / TV Show / Cartoon / Manga / Novel tabs (TBD)
   - Note: Anime uses franchise entries; other media types use the media entry directly

5. **To Rewatch** — tabbed grid:
   - Anime tab: sorted by Franchise Name EN; shows poster, Franchise Name CN with fallback, Franchise Rating
   - Anime Movie tab: sorted by Anime Movie Name EN; shows poster, Anime Movie Name CN with fallback, My Rating
   - Movie / TV Show / Cartoon / Manga / Novel tabs (TBD)

6. **Recent Completions** — paginated list (10 per page):
   - Anime tab: grouped by Airing Type (TV / Movie / ONA / Others); shows Anime Name CN with fallback, Franchise Name CN with fallback, My Rating, Completed Date (live)
   - Anime Movie tab: grouped by 吉卜力 / 新海誠 / 原創動畫電影 / 改編動畫電影 / 其他; shows Anime Movie Name CN with fallback, Name EN (hidden if CN used fallback), My Rating, Completed Date
   - Movie / TV Show / Cartoon / Manga / Novel tabs (TBD)

---

### Future Releases (`/future-releases`)

**File:** `frontend/src/pages/FutureReleases.jsx`

Upcoming entries by release timeline. No future release page planned for Manga, Novel, or Cartoon.

**Data loaded:**

- `GET /api/anime/`
- `GET /api/franchise/`
- `GET /api/system/config/current_season`

**Overall Future Release Tab** (TBD)

**Anime Future Release Tab** (default):

- Filter chips: TV / ONA / Movie / Others (OVA, OAD, Special, null)
- Group and sort by release season old-to-new, then Watching Status (Watch When Airs → Plan to Watch → Might Watch), then Franchise Expectation
  - Entries with release season first; release-year-only entries second; TBD last
- Each entry: **Anime Entry Card 3**
- Admin: inline watching-status selector, "Mark as Airing" button (PATCHes `airing_status`; entry removed from list immediately)

**Anime Movie Future Release Tab:**

- Grouped by release year JP, sorted by release date JP (old to new), then title
- Each entry: **Anime Movie Entry Card**

**Movie Future Release Tab** (TBD):

- Sorted by release date TW (old to new), then title
- Filter by Movie Type, Movie Franchise
- Each entry: **Movie Entry Card**

**TV Show Future Release Tab** (TBD):

- Sorted by release date (old to new), then title
- Each entry: **TV Show Entry Card**

---

### Search (`/search`)

**File:** `frontend/src/pages/Search.jsx`

Reads `?q` and `?scope` query params. Client-side filtering over full data fetched upfront.

**Data loaded (conditional on scope):**

| Scope       | Fetches                                         |
| ----------- | ----------------------------------------------- |
| `all`       | franchise, anime, anime-movie, series, seasonal |
| `franchise` | franchise only                                  |
| `anime`     | franchise + anime                               |
| `series`    | series only                                     |
| `seasonal`  | seasonal only                                   |

**Layout:**

- "Showing results for `<input>`"
- Filter by Franchise (pill chips showing Franchise Name CN with fallback) — filters franchise, series, and all media entry results
- **Seasonal Section** — **Search Result Seasonal Entry** (reusable)
- **Franchise Hub Section** — **Search Result Franchise Entry** (reusable): Franchise Name CN + EN (hidden if CN used fallback) + Franchise Type
- **Series Hub Section** — **Search Result Series Entry** (reusable)
- **Anime Entry Section** — split by Airing Type: TV/ONA / Movie / Other (non-TV, non-ONA, non-Movie); each entry: **Anime Entry Card 2**
- **Anime Movie Entry Section** — each entry: **Anime Movie Entry Card**
- **Manga Entry Section**
- **Novel Entry Section** (TBD)
- **Movie Entry Section** — each entry: **Movie Entry Card**
- **TV Show Entry Section** — each entry: **TV Show Entry Card 2**
- **Cartoon Entry Section** — each entry: **Cartoon Entry Card 2**

---

### Under Development (`/under-development`)

**File:** `frontend/src/pages/UnderDevelopment.jsx`

Placeholder page with under-construction notice and Go Back button.

---

## Admin-Only Pages

All admin pages redirect to `/login?next=<path>` if not authenticated (enforced by `ProtectedRoute`).

---

### System Admin (`/system`)

**File:** `frontend/src/pages/Admin.jsx`

**Navigation buttons:** Data History / Review Queue / New Entry (Add) / Edit Entry (Modify) / Delete Entry (Delete)

**Set Current Season:**

- Displays current season value from `GET /api/system/config/current_season`
- Season dropdown + year input + Confirm Set button → `POST /api/system/config/current_season`

**Main Data Control Action Block:**

- Fill: Fill All / Fill Anime — streaming SSE via `POST /api/data-control/fill/all` or `/fill/anime`
- Replace: Replace All / Replace Anime — streaming SSE via `POST /api/data-control/replace/all` or `/replace/anime`
- Pull from Sheets: Pull All / Pull Specific → `POST /api/data-control/pull[/:type]`
- Backup (Push) → `POST /api/data-control/backup`

**Calculate & Fix Block:**

- Calculate All → `POST /api/data-control/calculate/all`
- Find Duplicates → `GET /api/data-control/check/duplicates`
- With Remarks → shows anime entries that have remarks
- Check & Download Covers (multi-step): `GET /api/data-control/calculate/check-cover-image` → `POST .../download-missing-covers` → `POST .../set-cover-image-fields` → `DELETE .../delete-orphaned-covers`

**Recent Data Control Log:**

- Clear Old button (keeps most recent 10 logs); Refresh button
- Shows all data control actions from `GET /api/system/logs`
- Per row: Action Type (main + sub, e.g. Replace / Replace All), Trigger Type (Manual / Auto), Action Time, Status (Success / Aborted / Fail), Metrics (Added / Modified / Deleted)
- Per-row delete: `DELETE /api/system/logs/:id`

---

### Data History (`/data-history`)

**File:** `frontend/src/pages/DataHistory.jsx` (TBD — currently embedded in Admin page)

**Refresh Button**

**Modified Franchise Section:**

- Modified Time, Franchise Type (ACG / Anime Movie / TV or Movie / Cartoon / null), Franchise Name CN with fallback

**Modified Anime Section:**

- Modified Time, Anime Name CN with fallback, Airing Type, Airing Status, Watching Status

**Recently Added Franchise Section:**

- Added Time, Franchise Type, Franchise Name CN with fallback

**Recently Added Media Entry Section:**

- Added Time, Entry Type (Anime, Anime Movie, more TBD), Entry Name CN with fallback, Airing Type, Season/Part

**Deletion History Section** (from `GET /api/system/deleted`):

- Deleted Time, Entry Type (which table), Name CN with fallback (for system option: option_value), Name EN (null if CN used fallback or is system option), Additional Info:
  - Franchise entry: franchise type
  - Series entry: franchise name CN with fallback
  - Anime entry: franchise name CN + series name CN with fallback
  - System option entry: category

All sourced from `GET /api/anime/`, `GET /api/franchise/`, `GET /api/series/`, `GET /api/system/deleted`.

---

### Review (`/review`)

**File:** `frontend/src/pages/Review.jsx` (TBD)

Admin review queue for entries requiring attention.

**Anime with Remarks Section:**

- Find Remarks button → result table

**Potential Duplicates Section:**

- Find Duplicates button → result table with tabs: Franchise / Series / Anime / System Options

---

### Add (`/add`)

**File:** `frontend/src/pages/Add.jsx`

Multi-tab form for creating new records. Shows most recently added entry at top.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`

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
- **Status & Progress:** Airing Status (default: Not Yet Aired), Watching Status (default: Might Watch), My Rating, MAL Rating/Rank, AniList Rating
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

#### Planned Add Tabs (TBD)

Movie, TV Show, Cartoon, Manga, Novel — field details in source spec.

---

### Modify (`/modify`)

**File:** `frontend/src/pages/Modify.jsx`

Search-then-edit pattern. Shows most recently modified entry at top. Supports `?id=:uuid` deep-link.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`

#### Modify Anime Entry Tab (default)

- Search bar (Franchise + Series + Entry names); results grouped by franchise/series, shown as Search Suggestion
- Recently Modified entries: Airing Type, Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block (grouped by series), then full edit form
- Form mirrors Add Anime tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and Structured Notes section:
  - 優點 / 缺點 / 優缺點 / 大眾評價 / 我的評價 / 神回/神片段 / 解析 / 分鏡/演出/巧思 / Foreshadowing / 對稱 / 特殊變動 / 改編 / Resources / Unread / Questions / 名言/梗/迷因

Writes: `PATCH /api/anime/:id`; Jikan enrichment via `POST /api/data-control/replace/anime/:id`

#### Modify Anime Movie Entry Tab

- Search bar; recently modified entries: Entry Name CN with fallback, Franchise Name CN with fallback
- After selecting: Other Entries in franchise block, then full edit form
- Form mirrors Add Anime Movie tab, plus System ID (immutable), Entry Name CN with fallback (immutable), and Structured Notes section:
  - 優點 / 缺點 / 優缺點 / 大眾評價 / 我的評價 / 解析 / 分鏡/演出/巧思 / Foreshadowing / 對稱 / 改編 / Resources / Unread / Questions / 名言/梗/迷因

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

#### Planned Modify Tabs (TBD)

Movie, TV Show, Cartoon, Manga, Novel — field details in source spec.

---

### Delete (`/delete`)

**File:** `frontend/src/pages/Delete.jsx`

Search-then-delete pattern. Shows most recently deleted entry at top.

**Data loaded:** `GET /api/anime/`, `/api/franchise/`, `/api/series/`, `/api/options/`

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

#### Planned Delete Tabs (TBD)

Movie, TV Show, Cartoon, Manga, Novel — same search-then-delete pattern with cascade options for series/franchise deletion.

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

**Library pages:** Novel Library, Seiyuu Library (table-only)

**Entry detail pages:** Movie, TV Show, Cartoon, Manga, Novel, Studio (pages are specified but not yet implemented)

**Franchise pages:** Reality Franchise, Cartoon Franchise (pages are specified but not yet implemented)

**Dashboard:** Manga, Novel, TV Show, Cartoon watching/reading sections; filter UI

**Search:** Manga, Novel result sections; Studio/Seiyuu sections (possible)

**Future Releases:** Overall tab, Movie tab, TV Show tab

**Statistics:** Watch Next / To Rewatch / Recent Completions for Movie, TV Show, Cartoon, Manga, Novel tabs

**Add/Modify/Delete:** Movie, TV Show, Cartoon, Manga, Novel tabs

**Admin:** Data History page split from System page; Review page

**Entry cards:** TV Show Entry Card 1, Cartoon Entry Card 1, Manga Entry Card 1, Novel Entry Card 1, Movie Entry Card, TV Show Entry Card 2, Cartoon Entry Card 2, Manga Entry Card 2, Anime Movie Entry Card, Franchise Entry Card (all TBD)

**Reusable blocks:** All blocks listed in `reusable-elements.md` marked TBD (Franchise Information Block, Belonging Series Block, Notes and Remarks Block, Sources Card, Related Entries Card, Series Information Pop Up Entry, Score Block, My Tracker Block, Rating Distribution Block, Search Result entries, deletion info blocks, etc.)
