# Reusable Elements

Design-level components used across multiple pages. Items marked _(future)_ are planned but not yet implemented.

## Table of Contents

- [Universal Bar](#universal-bar)
- [Reusable Entry (Table Row)](#reusable-entry-table-row)
- [Search Suggestion Entry](#search-suggestion-entry)
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
- [Other](#other)

---

## Universal Bar

Present on every page. Contains:

**Navigation — Page Dropdowns:**

| Dropdown             | Items                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ACG                  | Anime Library, Anime Movie Library, Manga Library _(future)_, Novel Library _(future)_, Seiyuu Library _(future)_                                      |
| Reality              | Franchise Library, Movie Library (`/library/movie`), TV Show Library _(future)_, Cartoon Library _(future)_                                            |
| More                 | Statistics, Future Release, Seasonal                                                                                                                   |
| Admin _(admin only)_ | Control Center (/system), Data History (/data-history), Review Queue (/review-queue), Add Entry (/add), Modify Entry (/modify), Delete Entry (/delete) |

**Other controls:**

- Website logo — navigates to Dashboard
- Search bar — see [Search Suggestion Entry](#search-suggestion-entry) for result format
  - Scope selector (implemented): All (default), Franchise, Series, Anime, Seasonal
  - Scope selector _(future)_: Anime Movie, Manga, Novel, Movie, TV Show, Cartoon, Studio, Seiyuu
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

## Search Suggestion Entry

Compact entries shown in the universal search bar dropdown.

### Seasonal Entry

Seasonal Name (e.g. WIN 2026)

### Franchise Entry

Franchise Name CN (fallback) · Franchise Type

### Anime Entry

Name CN (fallback) · Airing Type

### Anime Movie Entry

Name CN (fallback) · Release Date (fallback: release_date_jp → release_date_tw)

### Movie Entry

Name CN (fallback) · Movie Type

### TV Show Entry

Name CN (fallback) · TV Show Region

### Cartoon Entry

Name CN (fallback) · Cartoon Official Source

### Manga Entry _(future)_

Name CN (fallback) · Manga Region

### Novel Entry _(future)_ / Studio Entry _(future)_ / Seiyuu Entry _(future)_

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

Main Title: Movie Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Release Date (fallback: release_date_us → release_date_tw)

### TV Show

Main Title: TV Show Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Season Part

### Cartoon

Main Title: Cartoon Name CN (fallback) · Sub Title: Franchise Name CN (fallback) · Season Part

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

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Airing Type · Watching Status Tags · Remark field in notes column · System ID

### Anime Movie

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Airing Status · Watching Status Tags · Remark field in notes column · System ID

### Movie

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Movie Type · Airing Status · Watching Status Tags · Remark field in notes column · System ID

### TV Show

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Season Part · Airing Status · Watching Status Tags · Remark field in notes column · System ID

### Cartoon

Name CN · Name EN · Name Alt · Franchise Name CN (fallback) · Series Name CN (fallback) · Season Part · Airing Status · Watching Status Tags · Remark field in notes column · System ID

### Manga _(future)_

Name CN (fallback) · Name EN (fallback) · Name JP (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Manga Region · Reading Status

---

## Entry Card

Poster-style cards used in grid views. Each entry type has multiple type variants for different contexts.

---

### Franchise Entry Card

- Poster (cover image of latest belonging entry; fallback to image cover if `cover_anime_id` is null)
- Franchise Rating
- Franchise Name CN (fallback)
- Franchise Type
- Franchise Expectation

---

### Anime Entry Card

**First Type** — used on Dashboard, Seasonal pages

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Airing Type · Bahamut / Netflix / Other source icons · Progress % bar · Ep Watched / Ep Total (cumulative) · +/- episode controls _(admin)_ · direct ep edit _(admin)_ · Edit button → Modify page _(admin)_

**Second Type** — used on Franchise pages, Library grid, Search page

- Poster · My Rating (hidden if null) · Airing Type · Bahamut icon · Name CN (fallback) · Release Season (fallback) · MAL Rating (hidden if null) · Ep Watched / Ep Total · + button _(admin)_

**Third Type** — used on Future Release page

- Poster · Franchise Expectation · Airing Type · Name CN (fallback) · Bahamut icon · Watching Status Dropdown (options: Might Watch, Plan to Watch, Watch When Airs; always shows current status if outside those options) · Mark as Airing button _(admin)_

---

### Anime Movie Entry Card

- Poster · My Rating (hidden if null) · MAL Rating (hidden if null) · Name CN (fallback) · Length (Hr + Min) · Release Year JP · Bahamut icon · + button _(admin)_

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

**First Type** — used on Dashboard

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Progress % bar (own ep count, not cumulative) · Ep Watched / Ep Total (cumulative ep watched / ep total if applicable, e.g. 3/11 (69/77)) · +/- episode controls _(admin)_ · direct ep edit _(admin)_ · Edit button → Modify page _(admin)_

**Second Type** — used on Library, Franchise page, Search page

- Poster · My Rating (hidden if null) · Name CN (fallback) · Release Date (fallback) · IMDB Rating (hidden if null) · Ep Watched / Ep Total · + button _(admin)_

**Third Type** — used on Future Release page

- Poster · Franchise Expectation · Release Date (fallback) · Name CN (fallback) · Watching Status Dropdown (options: Might Watch, Plan to Watch, Watch When Airs; always shows current status if outside those options) · Mark as Airing button _(admin)_

---

### Cartoon Entry Card

**First Type** — used on Dashboard

- Poster · My Rating (hidden if null) · Name CN (fallback) · Franchise Name CN (fallback) · Airing Status · Progress % bar (own ep count, not cumulative) · Ep Watched / Ep Total (cumulative ep watched / ep total if applicable, e.g. 3/11 (69/77)) · +/- episode controls _(admin)_ · direct ep edit _(admin)_ · Edit button → Modify page _(admin)_

**Second Type** — used on Library, Franchise page, Search page

- Poster · My Rating (hidden if null) · Name CN (fallback) · Release Date (fallback) · IMDB Rating (hidden if null) · Ep Watched / Ep Total · + button _(admin)_

**Third Type** — used on Future Release page

- Poster · Franchise Expectation · Release Date (fallback) · Name CN (fallback) · Watching Status Dropdown (options: Might Watch, Plan to Watch, Watch When Airs; always shows current status if outside those options) · Mark as Airing button _(admin)_

---

### Manga Entry Card _(future)_

**First Type** — used on Dashboard

- Poster · Manga Name CN · Franchise Name CN (fallback) · My Rating (hidden if null) · Manga Region · Serialization Status · Progress % bar · Ch Watched / Ch Total OR Volumes Read + Pages / Volumes Total (only one shown; Ch default) · +/- controls _(admin)_ · direct edit _(admin)_ · Edit button _(admin)_

**Second Type** — used on Franchise page, Library, Search page

- Poster · My Rating · MAL Rating · Name CN (fallback) · Manga Region · Release Year–End Year (fallback TBD / open-ended) · Ch Watched / Ch Total OR Volumes Read + Pages / Volumes Total · + button _(admin)_

> Note: Ch/Volume display toggle — only one shows at a time; Ch Watched / Ch Total is default.

---

### Novel Entry Card _(future)_

**First Type** — used on Dashboard

- Poster · Novel Name CN · Franchise Name CN (fallback) · My Rating (hidden if null) · Serialization Status · Progress % bar · Ch / Volume progress with edit controls _(admin)_ · Edit button _(admin)_

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

Sets the entry's `airing_status` to "Airing".

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
  - Categories: S, A+, A, B, C, D, E, F, Unrated
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
- Entry Entry Name JP
- Entry Entry Name Romaji
- Entry Alt Name

### Movie Naming Card

**File:** `frontend/src/components/MovieNamingCard.jsx`

Movie / TV Show / Cartoon Naming Card

- Entry CN Name
- Entry EN Name
- Entry Alt Name

### Score Block (includes Last Updated Time)

Anime / Anime Movie / Manga Score Block

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

TV Show / Cartoon Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback
- Release Year

Manga Related Entries Card, show the following for each entry:

- Poster
- Name CN with fallback

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

TV Show / Cartoon My Tracker Block

- Ep Watched / Ep Total
  - +, - button for episode progress control (admin only)
  - directly modify ep watched (admin only)
- Watching Status (editable for admin only)
- My Rating (editable for admin only)

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
- Airing Status, Release Date (Month Year)

Manga Information Card

- Serialization Status, Serialization Place, Manga Distributor TW
- Release Year, End Year
- Volume Total, Ch Total

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
- Anime Studio

### Notes Card

The information is broken down into multiple fields from the `notes` JSONB column in the database. Each notes card is a self-contained component that manages its own section state and saves via a callback.

**Anime Notes Card** — `frontend/src/pages/AnimeNotes.jsx`

- Remark
- 優點 Advantages
- 缺點 Disadvantages
- 優缺點 (similar to double-edged sword)
- 大眾評價 Public Reviews
- 我的評價 Personal Reviews
- 神回/神片段 Highlights
- 解析 Analysis
- 分鏡/演出/巧思
- Foreshadowing
- 對稱 Symmetry
- 特殊變動 Special Changes
- 改編 Adaptation
- Resources
- Unread
- Questions
- 名言/梗/迷因 Quotes & Memes

Used on: Anime Detail page, Modify Anime tab.

**Anime Movie Notes Card** — `frontend/src/pages/AnimeMovieNotes.jsx`

- Remark
- 優點 Advantages
- 缺點 Disadvantages
- 優缺點 (similar to double-edged sword)
- 大眾評價 Public Reviews
- 我的評價 Personal Reviews
- 解析 Analysis
- 分鏡/演出/巧思
- Foreshadowing
- 對稱 Symmetry
- 改編 Adaptation
- Resources
- Unread
- Questions
- 名言/梗/迷因 Quotes & Memes

Used on: Anime Movie Detail page, Modify Anime Movie tab.

**Movie Notes Card** — `frontend/src/pages/MovieNotes.jsx`

Stores data in `movies.notes` JSONB column.

- Remark
- 優點 Advantages
- 缺點 Disadvantages
- 優缺點 (similar to double-edged sword)
- 大眾評價 Public Reviews
- 我的評價 Personal Reviews
- 解析 Analysis
- Resources
- Unread
- Questions
- 名言/梗/迷因 Quotes & Memes

Used on: Movie Detail page, Modify Movie tab.

TV Show Notes Card

- Remark
- 優點 Advantages
- 缺點 Disadvantages
- 優缺點 (similar to double-edged sword)
- 大眾評價 Public Reviews
- 我的評價 Personal Reviews
- 神回/神片段
- 解析 Analysis
- Resources
- Unread
- Questions
- 名言/梗/迷因 Quotes & Memes

Cartoon Notes Card

- Remark
- 優點 Advantages
- 缺點 Disadvantages
- 優缺點 (similar to double-edged sword)
- 大眾評價 Public Reviews
- 我的評價 Personal Reviews
- 神回/神片段 Highlights
- 解析 Analysis
- Resources
- Unread
- Questions
- 名言/梗/迷因 Quotes & Memes

Manga Notes Card

- Remark
- 優點 Advantages
- 缺點 Disadvantages
- 優缺點 (similar to double-edged sword)
- 大眾評價 Public Reviews
- 我的評價 Personal Reviews
- 神回
- 解析 Analysis
- 分鏡/演出/巧思
- Foreshadowing
- 對稱 Symmetry
- Resources
- Unread
- Questions
- 名言/梗/迷因 Quotes & Memes

Here is the description for all sub fields in notes:

- 優點:
  - list of items
- 缺點:
  - list of items
- 優缺點
  - list of items
- 大眾評價
  - list of items
- 我的評價
  - list of items
- 神回/神片段
  - list of lists ([episode(s), type, description])
- 解析
  - list of dictionaries ({description(optional): links})
- 分鏡/演出/巧思
  - list of dictionaries ({description(optional): links})
- Foreshadowing
  - list of dictionaries ({description(optional): links})
- 對稱
  - list of dictionaries ({description(optional): links})
- 特殊變動 (加長/ OP,ED)
  - list of lists ([episode(s), type, description])
  - There will be dropdown for type
  - e.g. [ep 6, 變化ED, 聲優表 (男女主名字)]
- 改編
  - list of dictionaries ({description: links(optional)})
- Resources
  - list of dictionaries ([name(optional): link])
- Unread:
  - list of dictionaries ([name(optional): link])
- Questions
  - list of items
- 名言/梗/迷因
  - list of dictionaries ({description: link(optional)})

---

## Form Shared Elements

Shared components and utilities used across Add and Modify pages.

### Form Styling Constants (`FormField.jsx`)

`inputCls` and `selectCls` — Tailwind class strings for text inputs and select dropdowns respectively. Exported from `FormField.jsx` and imported wherever consistent form styling is needed.

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

## Other

### Series Information Pop Up Entry

Each entry displays the series name CN with fallback and is clickable. On click, a pop-up shows:

- Series name CN
- Series name EN
- Series name Alt
- Series remark (if not null)
