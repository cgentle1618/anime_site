# Reusable Elements

Design-level components used across multiple pages. Items marked _(future)_ are planned but not yet implemented.

## Table of Contents

- [Universal Bar](#universal-bar)
- [Search Suggestion](#search-suggestion)
- [Search Suggestion for Deletion](#search-suggestion-for-deletion)
- [Search Result Entry](#search-result-entry)
- [Entry Info for Deletion](#entry-info-for-deletion)
- [Entry Card](#entry-card)
- [Franchise Detail Elements](#franchise-detail-elements)
- [+ Button](#-button)
- [Mark as Airing Button](#mark-as-airing-button)
- [Group by Series Button](#group-by-series-button)
- [Icons](#icons)
- [Rating Distribution Block](#rating-distribution-block)
- [Entry Detail Elements](#entry-detail-elements)
- [Form Configuration](#form-configuration)
- [Other](#other)

---

## Universal Bar

Present on every page. Contains:

**Navigation — Page Dropdowns:**

| Dropdown             | Items                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ACG                  | Anime Library, Anime Movie Library, Manga Library, Novel Library, Seiyuu Library _(future)_                                                            |
| Reality ¹            | Franchise Library, TV Show Library (`/library/tv-show`), Movie Library (`/library/movie`)                                                              |
| Cartoon              | Cartoon Library (`/library/cartoon`)                                                                                                                   |
| More                 | Plan, Seasonal, Statistics, Future Release, Completions, Quotes, Memes                                                                                 |
| Admin _(admin only)_ | Control Center (/system), Data History (/data-history), Review Queue (/review-queue), Add Entry (/add), Modify Entry (/modify), Delete Entry (/delete) |

¹ "Reality" is a nav grouping label only. **Reality Franchise** (franchise_type = "TV or Movie") covers Movies and TV Shows. Cartoon franchises use franchise_type = "Cartoon" and route to the unified `FranchisePage.jsx` (via `Franchise.jsx` wrapper) just like all other franchise types — they are not Reality Franchise entries.

**Other controls:**

- Website logo — navigates to Dashboard
- Search bar — see [Search Suggestion Entry](#search-suggestion-entry) for result format
  - Scope selector: All (default), Franchise, Series, Anime, Anime Movie, Movie, TV Show, Cartoon, Seasonal
  - Scope selector _(future)_: Manga, Novel, Studio, Seiyuu
  - Results grouped by kind when searching All; ordered: Seasonal → Franchise → Anime → Anime Movie → Manga → Novel → Movie → TV Show → Cartoon
  - If an entry exactly matches the input (ignoring case, punctuation, and spaces), it is shown at the top regardless of grouping/ordering
  - At most 10 suggestions shown; at most 3 franchise and 3 series suggestions
  - Search is case-insensitive, punctuation-insensitive, space-insensitive; supports Alt Name search
- Admin Status Tag _(admin only)_
- Backup button _(admin only)_ — triggers Backup pipeline
- Login / Logout button
- Scroll to Top button
- Scroll to Bottom button

**Footer:** Copyright, Version

---

## Search Suggestion

Compact entries shown in the universal search bar dropdown.

### Seasonal Entry

Seasonal Name (e.g. WIN 2026)

### Franchise Entry

Franchise Name CN (fallback) · Franchise Type

### Anime Entry

Name CN (fallback) · Airing Type

### Anime Movie Entry

Name CN (fallback) · Release Date with fallback (release_date_jp, release_date_tw)

### Movie Entry

Name CN (fallback) · Movie Type

### TV Show Entry

Name CN (fallback) · TV Show Region

### Cartoon Entry

Name CN (fallback) · Airing Type

### Manga Entry

Name CN (fallback) · Manga Region

### Novel Entry

Novel Name CN with fallback · Novel Type

### Studio Entry _(future)_ / Seiyuu Entry _(future)_

TBD

---

## Search Suggestion for Deletion

Compact entries shown in the Delete page search dropdown, used to select an entry before deletion.

### Franchise

Franchise Name CN (fallback) · Amount of belonging series · Amount of each belonging media entries

### Series

Series Name CN (fallback) · Franchise Name CN (fallback) · Amount of each belonging media entries

### Anime

Anime Name CN (fallback) · Franchise Name CN (fallback) · Airing Type

### Anime Movie

Anime Movie Name CN (fallback) · Franchise Name CN (fallback) · Release Date (fallback: release_date_jp → release_date_tw)

### Movie

Main Title: Movie Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Release Date (fallback: release_date_usa → release_date_tw)

### TV Show

Main Title: TV Show Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Season Part

### Cartoon

Main Title: Cartoon Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Airing Type

### Manga

Main Title: Manga Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Release Year

### Novel

Main Title: Novel Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Novel Type · Release Year

---

## Search Result Entry

Entries shown on the Search page results.

### Franchise

Franchise Type · Franchise Name CN (fallback) · Franchise Name EN (hidden if CN used fallback)

### Series

"Series" indicator label · Series Name CN (fallback) · Series Name EN (hidden if CN used fallback)

### Seasonal

Seasonal Name · Button navigates to Seasonal Detail page

---

## Entry Info for Deletion

Shown on the Delete page after selecting an entry. Confirms identity before deletion.

### Franchise

Name CN · Name EN · Name Alt · Franchise Type · Amount of belonging series · Amount of each belonging media entries · System ID

### Series

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Amount of each belonging media entries · System ID

### Anime

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Airing Type · Watching Status Tags · Remark field · System ID

### Anime Movie

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Airing Status · Watching Status Tags · Remark field · System ID

### Movie

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Movie Type · Airing Status · Watching Status Tags · Remark field · System ID

### TV Show

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Season Part · Airing Status · Watching Status Tags · Remark field · System ID (Note: React code has a redundant legacy check for Airing Type, but TV Shows do not have airing_type in the database; they have Region instead)

### Cartoon

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Season Part · Airing Status · Watching Status Tags · Remark field · System ID

### Manga

Name CN (fallback) · Name EN (fallback) · Name JP (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Manga Region · Reading Status · Remark field · System ID

### Novel

Novel Name CN with fallback · Novel Name EN with fallback · Novel Name JP with fallback · Novel Name Alt with fallback · Franchise Name CN with fallback · Series Name CN with fallback · Novel Region · Novel Type · Reading Status · Remark field · System ID

---

## Entry Card

Poster-style cards used in grid views. Each entry type has multiple type variants for different contexts.

---

### Franchise Entry Card

- Poster (cover image of the entry explicitly selected via `cover_entry_id`; if null, falls back to the cover of the most recently released entry in the franchise)
- Franchise Rating
- Franchise Name CN (fallback)
- Franchise Type
- Franchise Expectation

---

### Anime Entry Card

**First Type** — `frontend/src/components/DashboardCard.jsx` - used on Dashboard, Seasonal pages

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Airing Type · Bahamut / Netflix / Other source icons · Progress % bar · Ep Watched / Ep Total (cumulative) · +/- episode controls _(admin)_ · direct ep edit _(admin)_ · Edit button → Modify page _(admin)_

**Second Type** — used on Franchise pages, Library grid, Search page

- Poster · My Rating (hidden if null) · Airing Type · Bahamut icon · Name CN (fallback) · Release Season (fallback) · MAL Rating (hidden if null) · Ep Watched / Ep Total · + button _(admin)_

**Third Type** — used on Future Release page

- Poster · Franchise Expectation · Airing Type · Name CN (fallback) · Bahamut icon · Watching Status Dropdown (options: Might Watch, Plan to Watch, Watch When Airs; always shows current status if outside those options) · Mark as Airing button _(admin)_

---

### Anime Movie Entry Card

**First Type** — `frontend/src/components/AnimeMovieCard.jsx` — used on Anime Movie Library, Franchise page, Search page

- Poster · My Rating (hidden if null) · MAL Rating (hidden if null) · Name CN (fallback) · Length (Hr + Min) · Release Year JP · Bahamut icon · + button _(admin)_

**Second Type** — `frontend/src/components/AnimeMovieCardFuture.jsx` — used on Future Release page (Anime Movies tab)

- Poster (aspect 3:4)
- Anime Movie Name CN (fallback: EN → Alt → Romaji → JP)
- Length (Hr + min) — hidden if null
- Release Year JP — hidden if null
- Mark as Airing button _(admin only)_ — sets `airing_status` to "Airing" via `PATCH /api/anime-movie/:id`; removes entry from list on success
- Clicking card navigates to `/anime-movie/:system_id`

---

### Movie Entry Card

**First Type** — `frontend/src/components/MovieCard.jsx` — used on Movie Library, Search page

- Poster (aspect 3:4)
- My Rating (hidden if null)
- IMDb Rating (hidden if null or "N/A")
- Movie Name CN (fallback: EN → Alt)
- Length (Hr + min) — hidden if null
- Release Year USA (fallback: TW) — hidden if null
- - button _(admin only)_ — cycles watching status via `PATCH /api/movies/:id`
- Clicking card navigates to `/movie/:system_id`

**Second Type** — `frontend/src/components/MovieCardFuture.jsx` — used on Future Release page (Movie tab)

- Poster (aspect 3:4)
- Movie Name CN (fallback: EN → Alt)
- Length (Hr + min) — hidden if null
- Release Year USA (fallback: TW)
- Mark as Airing button _(admin only)_ — sets `airing_status` to "Airing" via `PATCH /api/movies/:id`; removes entry from list on success
- Clicking card navigates to `/movie/:system_id`

---

### TV Show Entry Card

**First Type** — `frontend/src/components/DashboardCard.jsx` - used on Dashboard

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Progress % bar (own ep count, not cumulative) · Ep Watched / Ep Total (cumulative ep watched / ep total if applicable, e.g. 3/11 (69/77)) · +/- episode controls _(admin)_ · direct ep edit _(admin)_ · Edit button → Modify page _(admin)_

**Second Type** — `frontend/src/components/TVCard.jsx` — used on TV Show Library, Reality Franchise, Search page

- Poster (aspect 3:4)
- My Rating badge top-left (hidden if null)
- IMDb Rating badge top-right (hidden if null or "N/A")
- Region badge bottom-right (hidden if null)
- Name CN (fallback: EN → Alt)
- Season Part + Airing Status (inline, hidden if null)
- Ep Fin / Ep Total
- - button _(admin only)_ — cycles watching status via `PATCH /api/tv-shows/:id`
- Status badge _(guest)_ showing watching_status
- Clicking card navigates to `/tv-show/:system_id`

**Third Type** — `frontend/src/components/TVCardFuture.jsx` — used on Future Release page (TV Show tab)

- Poster (aspect 3:4)
- Name CN (fallback: EN → Alt)
- Region + Release Date (inline; Release Date shown as "TBD" if null)
- Airing Status
- Mark as Airing button _(admin only, shown when `airing_status = "Not Yet Aired"`)_ — sets `airing_status` to "Airing" via `PATCH /api/tv-shows/:id`; removes entry from list on success
- Clicking card navigates to `/tv-show/:system_id`

---

### Cartoon Entry Card

**First Type** — `frontend/src/components/DashboardCard.jsx` - used on Dashboard

- Poster · My Rating (hidden if null) · Name CN (fallback) · Franchise Name CN (fallback) · Airing Type · Airing Status · Progress % bar (own ep count, not cumulative) · Ep Watched / Ep Total (cumulative ep watched / ep total if applicable, e.g. 3/11 (69/77)) · +/- episode controls _(admin)_ · direct ep edit _(admin)_ · Edit button → Modify page _(admin)_

**Second Type** — `frontend/src/components/CartoonCard.jsx` — used on Cartoon Library, Cartoon Franchise, Search page

- Poster (aspect 3:4)
- My Rating badge top-left (hidden if null)
- Airing Type badge top-right (hidden if null)
- Name CN (fallback: EN → Alt)
- Release Date (fallback: "TBD") + IMDb Rating (hidden if null or "N/A") inline
- Ep Fin / Ep Total
- - button _(admin only)_ — cycles watching status via `PATCH /api/cartoon/:id`
- Status badge _(guest)_ showing watching_status
- Clicking card navigates to `/cartoon/:system_id`

**Third Type** — `frontend/src/components/CartoonCardFuture.jsx` — used on Future Release page (Cartoon tab)

- Poster (aspect 3:4)
- Franchise Expectation badge top-left (hidden if null)
- Airing Type badge top-right (hidden if null)
- Name CN (fallback: EN → Alt)
- Release Date (fallback: "TBD")
- Watching Status Dropdown _(admin only)_ — options: Might Watch, Plan to Watch, Watch When Airs; current status shown as disabled option if outside those three — `PATCH /api/cartoon/:id`
- Mark as Airing button _(admin only)_ — sets `airing_status` to "Airing" via `PATCH /api/cartoon/:id`; removes entry from list on success
- Clicking card navigates to `/cartoon/:system_id`

---

### Manga Entry Card

**First Type** — `frontend/src/components/DashboardCard.jsx` - used on Dashboard

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Manga Region · Serialization Status · Progress % bar · Ch Watched / Ch Total · Volumes Read + Pages Read/ Volumes Total · +/- episode controls _(admin)_ · direct vol edit _(admin)_ · direct pages edit _(admin)_· direct ch edit _(admin)_· Edit button → Modify page _(admin)_

**Second Type** — used on Franchise pages, Library grid, Search page

- Poster · My Rating (hidden if null) · Manga Region · Name CN (fallback) · MAL Rating (hidden if null)· Release Year & End Year · Ch Watched / Ch Total · Volumes Read + Pages Read/ Volumes Total · + button _(admin)_

> Note: Ch/Volume display toggle — only one shows at a time; Ch Watched / Ch Total is default.

---

### Novel Entry Card

**First Type** — `frontend/src/components/DashboardCard.jsx` - used on Dashboard

- Poster
- My Rating (hidden if null)
- Novel Name CN with fallback
- From: Franchise Name CN with fallback
- Novel Region
- Serialization Status
- Progress % Done Indicator
  - if `progress_display` is `vol_tw`: percentage = vol_fin / vol_total_tw
  - if `progress_display` is `vol_original`: percentage = vol_fin / vol_total_original
  - if `progress_display` is `arc_ch`: percentage = arc_fin / arc_total
  - if `progress_display` is `ch`: percentage = ch_fin / ch_total
  - if `progress_display` is null: no percentage; show "ongoing" instead
- Progress Tracker
  - `vol_tw`: vol*fin / vol_total_tw (e.g. 1.5 / 13 Vol) · +/- volume control *(admin, rounds to nearest integer)_ · direct edit _(admin)\_
  - `vol_original`: vol*fin / vol_total_original (e.g. 1.5 / 13 Vol) · +/- volume control *(admin, rounds to nearest integer)_ · direct edit _(admin)\_
  - `arc_ch`: arc*fin, ch_fin / arc_total, ch_total (e.g. Arc 9 Ch 13 / Arc ? Ch ?) · +/- chapter control *(admin, rounds to nearest integer)_ · direct edit for arcs and chapters _(admin)\_
  - `ch`: ch*fin / ch_total (e.g. 13 / ? Ch) · +/- chapter control *(admin, rounds to nearest integer)_ · direct edit _(admin)\_
  - null: show with fallback order vol_tw → vol_original → arc_ch → ch
- Edit Button → Modify page _(admin only)_

**Second Type** — `frontend/src/components/NovelCard.jsx` — used on Franchise Hub (Novel tab), Novel Library, Search page

Poster card for grid/library views. Displays:

- Poster (cover image)
- My Rating badge (top-left, hidden if null)
- Region badge (top-right, hidden if null)
- Novel Name CN with fallback
- Novel Type, Serialization Status, Version
- Release Year – End Year (e.g. `2010 – 2015`; omit end year if same as release year)
- MAL Rating (hidden if null)
- Progress tracker row based on `progress_display`:
  - `vol_tw`: `vol_fin / vol_total_tw VOL TW`
  - `vol_original`: `vol_fin / vol_total_original VOL`
  - `arc_ch`: `arc_fin/arc_total ARC  ch_fin/ch_total CH`
  - `ch` (or null with ch_total set): `ch_fin / ch_total CH`
- Reading status + button (admin only)

---

### Belonging Novels Card

**File:** rendered inside `Novel.jsx` (novel detail page). Editable for admin only.

Displays the ordered list of individual book names from `novel_name_each_cn` and `novel_name_each_en`.

**Data source:** `novel.novel_name_each_cn` and `novel.novel_name_each_en` — JSONB columns where each key is a book identifier (string; may be numeric like `"1"` or non-numeric) and the value is the book name.

**Structure:**

Two sections, one per language:

- **Novel Name CN Section** — renders pairs from `novel_name_each_cn`
- **Novel Name EN Section** — renders pairs from `novel_name_each_en`

Within each section:

- Each pair is rendered as `[key]: [name]` (e.g. `1: 最後帝國`)
- Keys may be non-numeric (e.g. `"Prologue"`, `"1"`, `"1.5"`)
- **Admin only** — pairs can be added, deleted, and reordered via drag-and-drop or up/down controls
- Saves via `PATCH /api/novel/:id` with updated `novel_name_each_cn` / `novel_name_each_en`

**Note:** Both sections are shown even if one language is empty, but the section is hidden if the JSONB value is null.

---

## Cover Resolution (`lib/covers.js`)

Shared cover-image helpers. `getCoverUrl` / `FALLBACK_SVG` were already here; the grouping-tier resolvers were extracted from `FranchiseLibrary.jsx` so the Collection library reuses the identical fallback rules rather than duplicating them.

| Export                | Purpose                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `getCoverUrl(file)`   | Local `/static/covers/` path or the GCS bucket URL; placeholder for missing/`"N/A"`.                                             |
| `FALLBACK_SVG`        | Inline "No Image" placeholder.                                                                                                   |
| `getEntryYear(entry)` | Best-effort release year, used to prefer the newest entry as a cover.                                                            |
| `getFranchiseCover(franchise, entriesDict, entriesByFranchise)`   | `cover_entry_id` → newest member entry with a cover → newest member by convention filename → placeholder. |
| `getCollectionCover(collection, memberFranchises, entriesDict, entriesByFranchise)` | `cover_franchise_id` (resolved through `getFranchiseCover`) → first member franchise yielding a real cover → placeholder. |

---

## Franchise Detail Elements

Reusable elements used on the Franchise Detail page.

### Franchise Information Block

- Franchise Type
- Main Title: Franchise Name CN (fallback)
- Sub Titles: Franchise Name EN · Franchise Name JP · Franchise Name Romaji · Franchise Alt Name
- Completion Stats: completion percentage · entries completed / total
- My Franchise Rating _(editable for admin)_
- My Franchise Expectations _(editable for admin)_
- Watch Next Group Status _(editable for admin; ACG franchises only)_
- To Rewatch Status _(editable for admin; ACG franchises only)_

### Belonging Series Block

Shown only when at least one series belongs to the franchise. For each series:

- Series Name CN (fallback), using Series Information Pop Up Entry

### Notes and Remarks Block

- Notes and Remarks _(editable for admin)_

---

## + Button

The status action button shown on entry cards. Displays a symbol reflecting the current status; clicking cycles to the next state.

### Watching Type (Anime, Anime Movie, Movie, TV Show, Cartoon)

| Symbol | Represents                                           | On Click                            |
| ------ | ---------------------------------------------------- | ----------------------------------- |
| `+`    | Might Watch (default)                                | → Plan to Watch, button becomes `…` |
| `…`    | Planned (Plan to Watch, Watch When Airs)             | → Might Watch, button becomes `+`   |
| `~`    | Watching (Active Watching, Passive Watching, Paused) | → Might Watch, button becomes `+`   |
| `✓`    | Completed                                            | → Might Watch, button becomes `+`   |
| `✕`    | Dropped (Temp Dropped, Dropped, Won't Watch)         | → Might Watch, button becomes `+`   |

### Reading Type _(future)_ (Manga, Novel)

| Symbol | Represents                                        | On Click                           |
| ------ | ------------------------------------------------- | ---------------------------------- |
| `+`    | Might Read (default)                              | → Plan to Read, button becomes `…` |
| `…`    | Plan to Read                                      | → Might Read, button becomes `+`   |
| `~`    | Reading (Active Reading, Passive Reading, Paused) | → Might Read, button becomes `+`   |
| `✓`    | Completed                                         | → Might Read, button becomes `+`   |
| `✕`    | Dropped (Temp Dropped, Dropped, Won't Read)       | → Might Read, button becomes `+`   |

The + button is visible and editable to admin only.

---

## Mark as Airing Button

Sets the entry's `airing_status` to "Airing" (Anime, TV Show, Cartoon) or "Finished Airing" (Anime Movie, Movie).

For Anime, TV Show, and Cartoon the button also moves the watching status along, based on its current value:

| Current watching status         | Behavior                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Watch When Airs                 | Set to "Active Watching" together with the airing status — no confirmation                                     |
| Plan to Watch                   | Confirmation modal offering Active Watching / Passive Watching / No Change (cancellable, aborts the whole edit) |
| Anything else                   | Only `airing_status` is changed — no confirmation                                                              |

Anime Movie and Movie never prompt and never touch the watching status.

Both fields are sent in a single `PATCH` to the entry's endpoint.

---

## Group by Series Button

Toggle switch to group entries by series or show them ungrouped.

---

## Icons

### Baha Icon

- Shown if `source_baha` is not null
- Full color with navigation link if available; black and white if no navigation
- Clickable button when navigation is present

### Netflix Icon

- Shown if `source_netflix` is not null

### Other Watch Source Icon

- Shows source name
- Clickable button if navigation link is available
- Each entry in `other_source` gets its own button

---

## Rating Distribution Block

- My Rating Distribution Bar Plot
  - Categories: S, A+, A, B, C, D, E, F (unrated entries not shown)
- MAL Rating Distribution Bar Plot
  - Categories: 9+, 8.7+, 8.5+, 8.2+, 7.7+, 7+, 4+, <4
- For each plot, show the amount and percentage per category.

---

## Entry Detail Elements

The reusable elements used in the entry detail pages.

### Naming Card

**File:** `frontend/src/components/NamingCard.jsx`

Anime / Anime Movie / Manga / Novel Naming Card

- Entry CN Name
- Entry EN Name
- Entry Name JP
- Entry Name Romaji
- Entry Alt Name

### Movie Naming Card

**File:** `frontend/src/components/MovieNamingCard.jsx`

Movie / TV Show / Cartoon Naming Card

- Entry CN Name
- Entry EN Name
- Entry Alt Name

### Score Block (includes Last Updated Time)

Anime / Anime Movie / Manga / Novel Score Block

- MyAnimeList Score, MyAnimeList Rank, AniList Score
- Last Updated Time

Movie / TV Show / Cartoon Score Block

- IMDB Score
- Last Updated Time

### Sources Card

Anime / Anime Movie Sources Card

- Bahamut Button with icon and navigation for those applicable
- Netflix Button with icon for those applicable
- MyAnimeList Link navigation button
- AniList Link navigation button
- Official Website Link navigation button
- Official Twitter Link navigation button
- Other Source Link navigation button

Movie Sources Card

- IMDB Link navigation button
- Other Source Link navigation button

TV Show Sources Card

- TV Show Official Source Icon
- IMDB Link navigation button
- Other Source Link navigation button

Cartoon Sources Card

- Cartoon Official Source Icon
- IMDB Link navigation button
- Other Source Link navigation button

Manga Sources Card

- Serialization Platform
- Official Twitter Link navigation button
- MyAnimeList Link navigation button
- AniList Link navigation button
- Other Source button with navigation

Novel Sources Card

- MyAnimeList Link navigation button
- AniList Link navigation button
- Other Source button with navigation

### Related Entries Card

- Enable navigation for each entry.
- Listing order: prequel, sequel, alternatives

Anime Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback
- Airing Type
- Release Year

Movie Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback
- Release Year US with fallback

TV Show Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback
- Release Year

Cartoon Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback
- Airing Type
- Release Year

Manga Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback
- Release Year

Novel Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback
- Release Year

### My Tracker Block

Anime My Tracker Block

- Ep Watched / Ep Total
  - +, - button for episode progress control (admin only)
  - directly modify ep watched (admin only)
- Cumulative Ep count if applicable
- Watching Status (editable for admin only)
- My Rating (editable for admin only)

Anime Movie / Movie My Tracker Block

- Watching Status (editable for admin only)
- My Rating (editable for admin only)
- Watch Next checkbox (editable for admin only)
- To Rewatch checkbox (editable for admin only)

TV Show / Cartoon My Tracker Block

- Ep Watched / Ep Total
  - +, - button for episode progress control (admin only)
  - directly modify ep watched (admin only)
- Watching Status (editable for admin only)
- My Rating (editable for admin only)
- Watch Next checkbox (editable for admin only)
- To Rewatch checkbox (editable for admin only)

Manga My Tracker Block

- Ch Watched / Ch Total
  - +, - button for chapter progress control (visible to admin only)
  - directly modify chapters read (admin only)
- Volumes Read + Pages Read / Volumes Total
  - e.g. Vol. 1 Page 150 / Vol. 13
  - +, - button for volume progress control (visible to admin only)
  - directly modify volumes read (admin only)
  - directly modify pages read (admin only)
- Reading Status (editable for admin only)
- My Rating (editable for admin only)

Novel My Tracker Block

- Reading Status (editable for admin only)
- My Rating (editable for admin only)
- Volumes Fin / Volumes Total TW; Volumes Total Original
  - e.g. 3.5 / 10; 12 Vol
  - +, - button for volume progress control (visible to admin only; rounds to nearest integer)
  - directly modify volumes read (admin only)
- Arc Fin / Arc Total
  - +, - button for arc progress control (visible to admin only; rounds to nearest integer)
  - directly modify arcs read (admin only)
- Ch Fin / Ch Total
  - +, - button for chapter progress control (visible to admin only; rounds to nearest integer)
  - directly modify chapters read (admin only)
- Read Next checkbox (editable for admin only)
- To Reread checkbox (editable for admin only)
- Note: for each sub tracker, show highlight based on `progress_display`

### Information Card

Anime Information Card

- 本傳 / 外傳 (is_main), Season Part, ep_special, Total Ep (include Cumulative Total Ep if applicable)
  - e.g. for total ep: 12 (36)
- Airing Type, Airing Status, Release Season (Seasonal Year), Release Date (Month Year)
- Genre Main
- Genre Sub

Anime Movie Information Card

- Airing Status, Length (Hr + Min)
- Release Date JP (Month Year), Release Date TW (Month Year)

Movie Information Card

- 本傳 / 外傳 (is_main), Airing Status, Length (Hr + Min)
- Director (not dropdown)
- Release Date TW (Month Year), Release Date USA (Month Year)

TV Show Information Card

- Official Source, 本傳 / 外傳 (is_main), Season Part, Total Ep
- Airing Status, Release Date (Month Year)

Cartoon Information Card

- Official Source, 本傳 / 外傳 (is_main)
- Season Part, Total Ep, Length per Ep (min)
- Airing Type, Airing Status, Release Date (Month Year)

Manga Information Card

- Serialization Status, Serialization Place
- Release Year, End Year
- Volume Total, Ch Total

Novel Information Card

- Novel Region, Novel Type, 本傳 / 外傳 (is_main), Version
- Serialization Status, Release Year, End Year
- Volume Total, Arc Total, Ch Total

### Production Card

Anime Production Card

- Anime Studio, Anime Distributor TW
- Director, Producer
- Music / Composer

Anime Movie Production Card

- Anime Studio
- Director, Producer
- Music / Composer

Manga Production Card

- 作者
  - show if both author_plot and author_draw is the same
- 原作 (author_plot)
  - show if both author_plot and author_draw is not the same
- 作畫 (author_draw)
  - show if both author_plot and author_draw is not the same
- Manga Publisher TW, Anime Studio

Novel Production Card

- Author, Illustrator, Novel Publisher TW

### Notes Page (`pages/notes/NotesTemplate.jsx`)

Structured commentary on any owner. One shared component renders it for all ten
owner types; `pages/detail/*Notes.jsx` are thin wrappers that pass
`ownerType` / `ownerId` / `isAdmin` and nothing else.

**The backend owns the section list.** `NotesTemplate` fetches
`GET /api/notes/sections?owner_type=…` once on mount and renders whatever comes
back, in the order it comes back. The frontend names no section keys and hard-codes
no labels, so the backend can add, drop, relabel or reorder a section — or change
manga's "神回" and `Chapter(s), e.g. ch 6` wording, or hand TV and cartoon the
神回/神片段/神篇章 dropdown manga does not get — with no frontend change.
Rows come from `GET /api/notes?owner_type=…&owner_id=…`; each edit writes a single
row through `/api/notes` rather than re-saving the whole entry, which is the point
of the table replacing the old per-entry `notes` JSONB blob.

**Six shape components**, picked by the `shape` the registry reports:

| Shape          | Component                  | Renders                                                          |
| -------------- | -------------------------- | ----------------------------------------------------------------- |
| `text`         | `TextSection.jsx`          | A list of plain-text items. A `singleton` section (Remark) renders one textarea instead, with a fullscreen overlay sharing the same draft. |
| `text_links`   | `TextLinksSection.jsx`     | Items of description + any number of links, plus an optional locator input shown when the section declares a `locator_placeholder`. |
| `text_or_link` | `TextOrLinkSection.jsx`    | A list where each item is either text or a single link. One input per row; `textOrLink.js`'s `classify` sends the value as `content` or as `links[0]` — an explicit `http(s)://` scheme and nothing else makes a link. |
| `episode_text` | `EpisodeTextSection.jsx`   | Locator-anchored items: locator + content, plus a kind dropdown where the section declares `kinds`. |
| `name_links`   | `NameLinksSection.jsx`     | Named links (Resources) — a title plus any number of URLs. |
| `episode_name_links` | `EpisodeNameLinksSection.jsx` | 插入曲 only: locator + title + description + any number of links. The one shape using all four content columns; only the locator is required. |

Each shape reads only registry-supplied props (`label`, `kinds`,
`locator_placeholder`, `locator_required`, `singleton`, `desc_required`), so a new section of an
existing shape costs one backend registry entry and no frontend work.

**`external` sections are the one documented exception.** `quotes` and `memes`
are backed by their own tables, endpoints and long-lived components, so they
cannot be rendered generically. `EXTERNAL_SHAPES` in `NotesTemplate.jsx` maps
those two keys to `QuoteSection.jsx` (`/api/quote`, editing via the shared
`components/forms/QuoteForm.jsx`) and `MemeSection.jsx` (`/api/meme`, via
`MemeForm.jsx`). Keying off the section *key* rather than minting a shape per
section keeps the exception to that one map: the registry still decides whether
the section exists, where it sits and what it is called, and an external key
with no component degrades to `null`.

- **Quotes are entry-only**; **memes span all ten owners**, because a running gag
  often belongs to a franchise rather than to one episode. The franchise and
  collection pages therefore do *not* mount `MemeSection` themselves — the
  registry gives them `memes`, so the notes section already renders it. Mounting
  it separately is what produced two copies under two different labels.
- A meme's text may name the Quote it also is, so such a quote appears in **both**
  sections — under Quotes with its speaker and translation, and inside its meme
  under Memes. The Quotes section marks it with an "in a meme" badge, derived
  from the `meme_id` the API returns.

**Which sections an owner gets** is a property of the registry
(`app/utils/note_sections.py`), not of this page — see `options.md` for the
vocabulary and `database-schema.md` for the `note` table. Broadly: every owner
has Remark, Advantages, Disadvantages, 優缺點, Public/Personal Reviews,
Analysis, Resources, Questions and Memes; entries and the
series/franchise tiers add Foreshadowing, Symmetry and Adaptation; the
episode-anchored sections (Episode Comments, Highlights, OP/ED 變動, 插入曲, 加長)
belong to the serialized types only, and Quotes to media entries only.

---

## Form Shared Elements

Shared components and utilities used across Add and Modify pages.

### Form Styling Constants (`FormField.jsx`)

`inputCls` and `selectCls` — Tailwind class strings (see actual file for current class values) for text inputs and select dropdowns respectively. Exported from `FormField.jsx` and imported wherever consistent form styling is needed.

### FormField Components (`FormField.jsx`)

- **`Field`** — Wraps a form control with a label, optional required marker (`*`), and optional hint text below.
- **`SectionHeader`** — Renders a section divider with a FontAwesome icon and an uppercase title label.

### FranchiseCreateModal (`FranchiseCreateModal.jsx`)

Modal shown when adding an anime entry with a franchise name that doesn't match any existing franchise. Prompts the user to confirm creation of a new franchise before saving the entry.

Props: `onConfirm(expectation, remark)`, `onCancel`

Used by: Add Page, Modify Page

### CreateNewEntityModal (`CreateNewEntityModal.jsx`)

Generic confirmation modal shown when a ComboBox text input doesn't match any existing entity (Franchise or Series). Informs the user that a new record will be created and asks for confirmation before proceeding.

Props: `entityType` (e.g. "Franchise", "Series"), `text` (the unmatched input), `onConfirm`, `onCancel`

Used by: Add Page, Modify Page

### RemarkModal (`RemarkModal.jsx`)

Full-text view of a hub's `remark`. The hubs that own one clip it to three rows inline and hand the whole thing here rather than letting a long remark push the rest of the page down. Admins get a 16-row autofocused textarea and a "Save & Close" button; guests get read-only `whitespace-pre-wrap` text and "Close". Closing (button, X, or backdrop click) fires `onClose`, which is where the caller saves the draft.

Props: `value`, `isAdmin`, `onChange(value)`, `onClose`

Used by: Franchise Hub, Collection Hub

### Utility: `getOptions` (`utils/anime.js`)

Filters the global options list by category and returns an array of option values.

```js
getOptions(allOptions, category) → string[]
```

### Utility: `buildAnimePayload` (`utils/anime.js`)

Converts the anime form state object into the API request payload. Handles season/part string building, type coercions (int/float/boolean), and source_other object serialization.

```js
buildAnimePayload(af, { franchiseId, seriesId, notes } = {}) → object
```

- `franchiseId` / `seriesId` — resolved entity IDs (may be newly created); override `af.franchise_id` / `af.series_id` when provided.
- `notes` — defaults to `null`; Modify page passes the structured notes object.

---

## Form Configuration

The shared machinery behind the Add / Modify forms and the `/defaults` page. See
[admin-forms.md](admin-forms.md#where-defaults-come-from) for how these fit together.

### `config/formFactories.js`

The nine `defaultX()` blank-form factories (`defaultAnime`, `defaultMovie`, …), plus
`FORM_FACTORIES` keyed by media-type slug. These are the **built-in baseline** for every
form field. They live in `config/` rather than in the add-tab components so the registry
can derive field keys from them without importing page JSX; each add-tab re-exports its
own factory, so existing imports still work.

### `config/fieldOptions.js`

The canonical dropdown vocabularies (`AIRING_STATUSES`, `WATCHING_STATUSES`,
`READING_STATUSES`, `IS_MAIN`, `MY_RATINGS`, the region/type/serialization lists, …),
previously duplicated as inline literals across every add-tab and modify-tab. The
`/defaults` selects must offer exactly the values the Add form can display, which is why
these had to be centralized. Add-tabs import from here; modify-tabs still hold copies.

### `config/formFields/`

`fieldMeta.js` — hand-authored presentation metadata (`label`, `control`, `options` /
`optionsCategory`, `group`, `defaultable`, `autofillable`, `lookup`, `coerce`), split into
`COMMON_FIELD_META` (fields shared across types) and `TYPE_FIELD_META` (per-type). Also
exports `BUILTIN_AUTOFILL` (the default auto-fill field set per type) and `GROUP_ORDER`.

`index.js` — `getFieldRegistry(type)` (all visible fields, in factory order),
`getFieldMap(type)` (same, keyed), `getFieldGroups(type)` (bucketed into sections),
plus `humanize()` and `inferControl()`. Keys always come from the factory, so they cannot
be mistyped, and metadata pointing at a nonexistent field warns in dev.

### `hooks/useFormDefaults.js`

```js
resolveDefaults(type, config) → form object   // built-ins + sparse overrides
autofillFields(type, config)  → string[]      // configured list, or the built-in set
coerceToShape(builtIn, value) → value         // match the factory value's type
fetchFormDefaults()           → Promise<obj>  // never throws; {} on failure
```

`resolveDefaults` is also the sanitization layer — it drops stored keys that no longer
exist on the form, so the backend can validate shape without mirroring ~280 field names.

### `lib/autofill.js`

```js
buildAutofillPatch(source, type, fieldKeys, { allFranchises, allSeries, defaults })
  → partial form object
```

Drives all seven Add-tab auto-fill searches. Handles franchise/series `_id` + `_text`
pair resolution, boolean→tristate coercion for `derive_related`, boolean/array coercion,
and the `autofillFallback: "default"` marker (currently only Movie's `airing_status`).

### `components/forms/DefaultValueControl.jsx`

Renders one field's default-value editor on `/defaults`, switching on the registry's
`control`. `value === undefined` means "not overridden" and shows the built-in as ghost
text. Also exports `describeBuiltIn(field)` for that ghost label.

### `config/adminTabs.js`

`ADMIN_TABS` (the ten Add tabs), `FORM_TABS` (the nine backed by a form factory), and
`withVerb(tabs, verb)`. Shared by Add and Form Defaults so their tab lists can't drift.

---

## Watch Order Elements

### `WatchOrderGuide` (`components/tracker/WatchOrderGuide.jsx`)

Read-only renderer for one watch order's steps, used at two densities: compact
inside the Franchise / Collection page, and `roomy` on `/watch-order/:id`.
Guests see it too, so nothing in it writes.

**Props:** `list` (a `WatchOrderListDetailResponse`), `roomy` (bool).

Each step shows a position badge, poster, title, an episode-range label
(`Ep 1–10`, `Ch 1–40` for manga/novel), an Optional badge, the media type, the
entry's watch/read status pill, and the per-step note, linking to the entry's
detail page via `MEDIA_CONFIG[media_type].navPath`. Anime carrying an
`ep_special` also get an `Ep. Special 14.5` badge — the episode number the
special sits at, not a count. `mediaScope(mediaTypes)` is also exported here and describes an order's scope
from its steps: `{short, full, cross, icon, chips}`, where `short` ("Anime
only", "Cross-type") suits a `<select>` option or a list subtitle. Icons come
from `ADMIN_TABS` rather than a second hand-kept map, so a media type looks the
same here as everywhere else. It returns null for an empty order.

`<MediaScopeLine mediaTypes={...} />` renders that scope as its own uppercase,
icon-led line meant to sit **directly above an order's title**, so what kind of
order it is registers before the name instead of competing with the Custom /
Most recommended badges below it. Cross-type renders blue with one chip per
type; single-type renders grey. `short` renders the compact one-line form
("Anime only") for a row subtitle, where the per-type chips would not fit.

Used by the standalone page and the franchise/collection section above the
order name; by the editor as a tinted band across the top of the panel, since
a form has no title for it to lead; and by the admin list rows in `short` form
on their own line, rather than buried in the grey subtitle.

`specialLabel()` is exported from this file and
reused by the editor's step rows and its entry picker, where a special often
shares its parent's title and the number is the only thing telling two rows
apart; it tests `!= null`, since `0` (第零集) is a real value a
truthiness check would silently drop. Status colors come from
`getCardStatusConfig(type, status)` rather than `getStatusStyle` — reading
statuses have no entry in the watching style map. An
All / Hide optional / Essentials only filter appears when any step carries a
non-`Normal` `importance`, and numbering follows the *visible* rows, so
filtering leaves no gaps. A step whose entry was deleted (`missing: true`) renders
as a muted "Entry no longer exists" row.

### `RelationsSection` (`components/tracker/RelationsSection.jsx`)

The "Related Entries" card on every media detail page. Props: `mediaType`,
`entryId`.

Fetches `GET /api/media-relation/for-entry` and renders the rows grouped by
family, each showing the label for the entry at the far end, its cover, its
media-type badge and its remark. Renders nothing when there are no relations.

One component for all seven media types, because a relation is type-agnostic —
an anime's source may be a manga and its alternative an anime movie. It replaced
the hand-rolled `prequel_id` / `sequel_id` / `alternative` blocks that Anime,
Cartoon, Manga, TV and Novel each carried, which could only ever show same-table
links and only three kinds.

A far endpoint that no longer exists renders red with its dangling id rather
than being dropped, since relation endpoints are FK-less. Editing lives on the
admin `/relations` page; this component never writes.

---

### `WatchOrderSection` (`components/tracker/WatchOrderSection.jsx`)

The Watch Order tab body for a Franchise, Series, or Collection page. Takes
exactly one of `franchiseId` / `seriesId` / `collectionId`, loads that owner's
orders (`GET /api/watch-order/lists?...`), offers a selector when there is more
than one, and hands the selected order to `WatchOrderGuide`. Also renders the
"Open full page" link and, for admins, an "Edit" link to `/watch-orders`.

### `WatchOrderEditor` (`components/tracker/WatchOrderEditor.jsx`)

Admin editor for one order, used by `/watch-orders`. Takes `listId` and an
optional `onListChanged` callback. Deliberately does **not** reuse
`WatchOrderGuide`: an editable row needs inputs where the guide needs links.

Covers order metadata (name, type, note, default flag), an entry picker fed by
`GET /api/watch-order/candidates` — whose rows carry an `Added` badge for an
entry the list already holds, naming the episode ranges
(`Added · Ep 1–10, 11–12`) when the steps carry any, and never claiming the
entry is *fully* covered, since that would mean trusting an `ep_total` that is
often blank, and a "Hide added" toggle in the search row that drops those rows
so only what is left to add remains — per-step episode range / importance
(three buttons rather than a dropdown, so the whole ladder stays visible while
scanning a list of steps) / note, and reordering by drag, up/down buttons, or
typing a step's position into its number box — the third being the only one
that works when the destination is off-screen. A typed position counts in
displayed slots (1..N, the same numbering the reorder endpoint writes), clamps
to the nearest end, and restores itself if it cannot be parsed.
Text and number inputs commit on blur, not per keystroke; reorder commits the full id sequence through
`PUT /lists/{id}/reorder` and is applied locally first so a dragged row does not
snap back mid-request.

**Every write folds the response into local state rather than refetching.** An
earlier version called `loadList()` after each mutation, which flipped `loading`
back on and replaced the whole editor with a one-line spinner — the page
collapsed, the browser jumped to the top, and the entry picker lost whatever was
typed in it. `loadList()` now runs only on mount and to recover from a failed
write. This is why `WatchOrderCandidate` carries `status` and `total_episodes`:
the create response holds no display data, so a newly added row is assembled
from the picked candidate, which is already in the resolver's shape.

---

## Other

### Series Information Pop Up Entry

Each entry displays the series name CN with fallback and is clickable. On click, a pop-up shows:

- Series name CN
- Series name EN
- Series name Alt
- Series remark (if not null)

### Announcement Board

**Files:** `frontend/src/components/info/AnnouncementBoard.jsx`, `frontend/src/components/modals/AnnouncementModal.jsx`

Used by the Dashboard's Announcement division. `AnnouncementBoard` takes `announcements` (`[{title, body}]`) and renders one card per note using the `InfoCard` shell treatment — grey header bar with a `fa-bullhorn` icon and the title, body as plain `whitespace-pre-wrap` text clamped to `max-h-40`. Each header carries an expand button that opens `AnnouncementModal` — a fullscreen (`95vw × 90vh`) panel showing the whole body, closed by the X, the Close button, a backdrop click, or `Escape`.

With an empty list the board renders the dashed "No Announcement & Notes" empty state instead of a grid.
