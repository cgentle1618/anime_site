# Reusable Elements

Design-level components used across multiple pages. Items marked _(future)_ are planned but not yet implemented.

## Table of Contents

- [Universal Bar](#universal-bar)
- [Reusable Entry (Table Row)](#reusable-entry-table-row)
- [Search Suggestion Entry](#search-suggestion-entry)
- [Entry Info for Deletion](#entry-info-for-deletion)
- [Entry Card](#entry-card)
- [+ Button](#-button)
- [Entry Detail Elements](#entry-detail-elements)
- [Other](#other)

---

## Universal Bar

Present on every page. Contains:

**Navigation — Page Dropdowns:**

| Dropdown              | Items                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Library               | Franchise Library, Anime Library, Anime Movie Library, Manga Library, Novel Library, TV Show Library, Movie Library, Cartoon Library |
| Production _(future)_ | Studio Library, Seiyuu Library                                                                                                       |
| More                  | Statistics, Future Release, Seasonal Overall                                                                                         |
| Admin _(admin only)_  | System Page, Data History Page, Review Page, Add Page, Modify Page, Delete Page                                                      |

**Other controls:**

- Website logo — navigates to Dashboard
- Search bar — see [Search Suggestion Entry](#search-suggestion-entry) for result format
  - Scope selector: All (default), Seasonal, Franchise, Anime, Anime Movie, Manga, Novel, Movie, TV Show, Cartoon, Studio _(future)_, Seiyuu _(future)_
  - Results grouped by kind when searching All; ordered: Seasonal → Franchise → Anime → Anime Movie → Manga → Novel → Movie → TV Show → Cartoon
  - Search is case-insensitive, punctuation-insensitive, space-insensitive; supports Alt Name search
  - Each result uses Search Suggestion Entry First Type
- Backup button _(admin only)_ — triggers Backup pipeline
- Login / Logout button

**Footer:** Copyright, Version

---

## Reusable Entry (Table Row)

Compact rows used in list views (library table view, franchise pages, etc.).

### Anime Entry

Name CN (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Airing Type · Release Season (fallback: Release Date → Release Year) · Total Ep · My Rating · Completed Time (`updated_at`)

### Anime Movie Entry

Name CN (fallback) · Franchise Name CN (fallback) · Director · Length (Hr + Min) · Release Date JP (fallback: Release Year TW) · My Rating · Completed Time

### Movie Entry _(future)_

Name CN (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Director · Length (Hr + Min) · Release Date TW (fallback: Release Year US) · My Rating · Completed Time

### TV Show Entry _(future)_

Name CN (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · TV Show Region · TV Show Official Source · Release Date · My Rating · Completed Time

### Cartoon Entry _(future)_

Name CN (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Cartoon Airing Type · Cartoon Official Source · Release Date · My Rating · Completed Time

---

## Search Suggestion Entry

Compact entries shown in the universal search bar dropdown and on the Search page.

**Two display types for most entry kinds:**

- **First Type** — shown in search bar dropdown
- **Second Type** — shown on the Search page results (adds Watching/Reading Status)

### Seasonal Entry

Seasonal Name (e.g. WIN 2026)

### Franchise Entry

Franchise Name CN (fallback) · Franchise Name EN (hidden if CN used fallback) · Franchise Type

### Anime Entry

First Type: Name CN (fallback) · Franchise Name CN (fallback) · Airing Type
Second Type: + Watching Status

### Anime Movie Entry

First Type: Name CN (fallback) · Franchise Name CN (fallback) · Airing Type
Second Type: + Watching Status

### Movie Entry _(future)_

First Type: Name CN (fallback) · Franchise Name CN (fallback) · Movie Type
Second Type: + Watching Status

### TV Show Entry _(future)_

First Type: Name CN (fallback) · Franchise Name CN (fallback) · TV Show Region
Second Type: + Watching Status

### Cartoon Entry _(future)_

First Type: Name CN (fallback) · Franchise Name CN (fallback) · Cartoon Airing Type
Second Type: + Watching Status

### Manga Entry _(future)_

First Type: Name CN (fallback) · Franchise Name CN (fallback) · Manga Region
Second Type: + Reading Status

### Novel Entry _(future)_ / Studio Entry _(future)_ / Seiyuu Entry _(future)_

TBD

---

## Entry Info for Deletion

Shown on the Delete page after selecting an entry. Confirms identity before deletion.

### Seasonal

Seasonal Name (e.g. WIN 2026)

### Franchise

Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Type

### Series

Name CN (fallback) · Name EN (fallback) · Name Alt (fallback)

### Anime

Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Airing Type · Watching Status

### Anime Movie

Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Airing Type · Watching Status

### Movie _(future)_

Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Movie Type · Watching Status

### TV Show _(future)_

Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · TV Show Region · Watching Status

### Cartoon _(future)_

Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Cartoon Airing Type · Watching Status

### Manga _(future)_

Name CN (fallback) · Name EN (fallback) · Name JP (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Manga Region · Reading Status

---

## Entry Card

Poster-style cards used in grid views. Each entry type has multiple type variants for different contexts.

---

### Anime Entry Card

**First Type** — used on Dashboard, Seasonal pages

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Airing Type · Bahamut / Netflix / Other source icons · Progress % bar · Ep Watched / Ep Total (cumulative) · +/- episode controls _(admin)_ · direct ep edit _(admin)_ · Edit button → Modify page _(admin)_

**Second Type** — used on Franchise pages, Library grid, Search page

- Poster · My Rating · MAL Rating · Name CN (fallback) · Airing Type · Release Season (fallback) · Bahamut icon · Ep Watched / Ep Total · + button _(admin)_

**Third Type** — used on Future Release page

- Poster · Name CN (fallback) · Airing Type · Bahamut icon · Ep Total · + button _(admin)_

---

### Anime Movie Entry Card

- Poster · My Rating · MAL Rating · Name CN (fallback) · Length (Hr + Min) · Release Year JP · Bahamut icon · + button _(admin)_

---

### Movie Entry Card _(future)_

- Poster · My Rating · IMDB Rating · Name CN (fallback) · Length (Hr + Min) · Release Year TW (fallback) · + button _(admin)_

---

### TV Show Entry Card _(future)_

**First Type** — used on Dashboard

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Progress % bar · Ep Watched / Ep Total · +/- controls _(admin)_ · direct ep edit _(admin)_ · Edit button _(admin)_

**Second Type** — used on Library, Franchise page, Search page

- Poster · My Rating · IMDB Rating · Name CN (fallback) · Season Part · Airing Status · Ep Watched / Ep Total · + button _(admin)_

---

### Cartoon Entry Card _(future)_

**First Type** — used on Dashboard

- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Cartoon Airing Type · Progress % bar · Ep Watched / Ep Total · +/- controls _(admin)_ · direct ep edit _(admin)_ · Edit button _(admin)_

**Second Type** — used on Franchise page, Library, Search page

- Poster · Name CN (fallback) · My Rating · Season Part · Cartoon Airing Type · Airing Status · Ep Watched / Ep Total · + button _(admin)_

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

## Entry Detail Elements

The reusable elements used in the entry detail pages.

### Naming Card

Anime / Anime Movie / Manga / Novel Naming Card

- Entry CN Name
- Entry EN Name
- Entry Entry Name JP
- Entry Entry Name Romaji
- Entry Alt Name

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

The information is broken down into multiple fields from the notes column in the database.

Anime Notes Card

- Remark
- 優點 Advantages
- 缺點 Disadvantages
- 優缺點 (similar to double-edged sword)
- 大眾評價 Public Reviews
- 我的評價 Personal Reviews
- 神回/神片段
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

Anime Movie Notes Card

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

Movie Notes Card

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
- 神回/神片段
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

## Other

### Series Information Pop Up Entry

Each entry displays the series name CN with fallback and is clickable. On click, a pop-up shows:

- Series name CN
- Series name EN
- Series name Alt
- Series remark (if not null)
