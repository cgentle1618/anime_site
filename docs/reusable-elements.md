# Reusable Elements

Design-level components used across multiple pages. Items marked *(future)* are planned but not yet implemented.

## Table of Contents

- [Universal Bar](#universal-bar)
- [Reusable Entry (Table Row)](#reusable-entry-table-row)
- [Search Suggestion Entry](#search-suggestion-entry)
- [Entry Info for Deletion](#entry-info-for-deletion)
- [Entry Card](#entry-card)
- [+ Button](#-button)

---

## Universal Bar

Present on every page. Contains:

**Navigation — Page Dropdowns:**

| Dropdown | Items |
|---|---|
| Library | Anime Library, Anime Movie Library, Manga Library, Novel Library, TV Show Library, Movie Library, Cartoon Library |
| Production *(future)* | Studio Library, Seiyuu Library |
| More | Statistics, Future Release, Seasonal Overall, Seasonal Detail |
| Admin *(admin only)* | Admin Page, Add Page, Modify Page, Delete Page |

**Other controls:**
- Website logo — navigates to Dashboard
- Search bar — see [Search Suggestion Entry](#search-suggestion-entry) for result format
  - Scope selector: All (default), Seasonal, Franchise, Anime, Anime Movie, Manga, Novel, Movie, TV Show, Cartoon, Studio *(future)*, Seiyuu *(future)*
  - Results grouped by kind when searching All; ordered: Seasonal → Franchise → Anime → Anime Movie → Manga → Novel → Movie → TV Show → Cartoon
  - Search is case-insensitive, punctuation-insensitive, space-insensitive; supports Alt Name search
  - Each result uses Search Suggestion Entry First Type
- Backup button *(admin only)* — triggers Backup pipeline
- Login / Logout button

**Footer:** Copyright, Version

---

## Reusable Entry (Table Row)

Compact rows used in list views (library table view, franchise pages, etc.).

### Anime Entry
Name CN (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Airing Type · Release Season (fallback: Release Date → Release Year) · Total Ep · My Rating · Completed Time (`updated_at`)

### Anime Movie Entry
Name CN (fallback) · Franchise Name CN (fallback) · Director · Length (Hr + Min) · Release Date JP (fallback: Release Year TW) · My Rating · Completed Time

### Movie Entry *(future)*
Name CN (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Director · Length (Hr + Min) · Release Date TW (fallback: Release Year US) · My Rating · Completed Time

### TV Show Entry *(future)*
Name CN (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · TV Show Region · TV Show Official Source · Release Date · My Rating · Completed Time

### Cartoon Entry *(future)*
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

### Movie Entry *(future)*
First Type: Name CN (fallback) · Franchise Name CN (fallback) · Movie Type
Second Type: + Watching Status

### TV Show Entry *(future)*
First Type: Name CN (fallback) · Franchise Name CN (fallback) · TV Show Region
Second Type: + Watching Status

### Cartoon Entry *(future)*
First Type: Name CN (fallback) · Franchise Name CN (fallback) · Cartoon Airing Type
Second Type: + Watching Status

### Manga Entry *(future)*
First Type: Name CN (fallback) · Franchise Name CN (fallback) · Manga Region
Second Type: + Reading Status

### Novel Entry *(future)* / Studio Entry *(future)* / Seiyuu Entry *(future)*
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

### Movie *(future)*
Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Movie Type · Watching Status

### TV Show *(future)*
Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · TV Show Region · Watching Status

### Cartoon *(future)*
Name CN (fallback) · Name EN (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Cartoon Airing Type · Watching Status

### Manga *(future)*
Name CN (fallback) · Name EN (fallback) · Name JP (fallback) · Name Alt (fallback) · Franchise Name CN (fallback) · Series Name CN (fallback) · Manga Region · Reading Status

---

## Entry Card

Poster-style cards used in grid views. Each entry type has multiple type variants for different contexts.

---

### Anime Entry Card

**First Type** — used on Dashboard, Seasonal pages
- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Airing Type · Bahamut / Netflix / Other source icons · Progress % bar · Ep Watched / Ep Total (cumulative) · +/- episode controls *(admin)* · direct ep edit *(admin)* · Edit button → Modify page *(admin)*

**Second Type** — used on Franchise pages, Library grid, Search page
- Poster · My Rating · MAL Rating · Name CN (fallback) · Airing Type · Release Season (fallback) · Bahamut icon · Ep Watched / Ep Total · + button *(admin)*

**Third Type** — used on Future Release page
- Poster · Name CN (fallback) · Airing Type · Bahamut icon · Ep Total · + button *(admin)*

---

### Anime Movie Entry Card
- Poster · My Rating · MAL Rating · Name CN (fallback) · Length (Hr + Min) · Release Year JP · Bahamut icon · + button *(admin)*

---

### Movie Entry Card *(future)*
- Poster · My Rating · IMDB Rating · Name CN (fallback) · Length (Hr + Min) · Release Year TW (fallback) · + button *(admin)*

---

### TV Show Entry Card *(future)*

**First Type** — used on Dashboard
- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Airing Status · Progress % bar · Ep Watched / Ep Total · +/- controls *(admin)* · direct ep edit *(admin)* · Edit button *(admin)*

**Second Type** — used on Library, Franchise page, Search page
- Poster · My Rating · IMDB Rating · Name CN (fallback) · Season Part · Airing Status · Ep Watched / Ep Total · + button *(admin)*

---

### Cartoon Entry Card *(future)*

**First Type** — used on Dashboard
- Poster · Name CN (fallback) · Franchise Name CN (fallback) · My Rating (hidden if null) · Cartoon Airing Type · Progress % bar · Ep Watched / Ep Total · +/- controls *(admin)* · direct ep edit *(admin)* · Edit button *(admin)*

**Second Type** — used on Franchise page, Library, Search page
- Poster · Name CN (fallback) · My Rating · Season Part · Cartoon Airing Type · Airing Status · Ep Watched / Ep Total · + button *(admin)*

---

### Manga Entry Card *(future)*

**First Type** — used on Dashboard
- Poster · Manga Name CN · Franchise Name CN (fallback) · My Rating (hidden if null) · Manga Region · Serialization Status · Progress % bar · Ch Watched / Ch Total OR Volumes Read + Pages / Volumes Total (only one shown; Ch default) · +/- controls *(admin)* · direct edit *(admin)* · Edit button *(admin)*

**Second Type** — used on Franchise page, Library, Search page
- Poster · My Rating · MAL Rating · Name CN (fallback) · Manga Region · Release Year–End Year (fallback TBD / open-ended) · Ch Watched / Ch Total OR Volumes Read + Pages / Volumes Total · + button *(admin)*

> Note: Ch/Volume display toggle — only one shows at a time; Ch Watched / Ch Total is default.

---

### Novel Entry Card *(future)*

**First Type** — used on Dashboard
- Poster · Novel Name CN · Franchise Name CN (fallback) · My Rating (hidden if null) · Serialization Status · Progress % bar · Ch / Volume progress with edit controls *(admin)* · Edit button *(admin)*

---

## + Button

The status action button shown on entry cards. Displays a symbol reflecting the current status; clicking cycles to the next state.

### Watching Type (Anime, Anime Movie, Movie, TV Show, Cartoon)

| Symbol | Represents | On Click |
|---|---|---|
| `+` | Might Watch (default) | → Plan to Watch, button becomes `…` |
| `…` | Planned (Plan to Watch, Watch When Airs) | → Might Watch, button becomes `+` |
| `~` | Watching (Active Watching, Passive Watching, Paused) | → Might Watch, button becomes `+` |
| `✓` | Completed | → Might Watch, button becomes `+` |
| `✕` | Dropped (Temp Dropped, Dropped, Won't Watch) | → Might Watch, button becomes `+` |

### Reading Type *(future)* (Manga, Novel)

| Symbol | Represents | On Click |
|---|---|---|
| `+` | Might Read (default) | → Plan to Read, button becomes `…` |
| `…` | Plan to Read | → Might Read, button becomes `+` |
| `~` | Reading (Active Reading, Passive Reading, Paused) | → Might Read, button becomes `+` |
| `✓` | Completed | → Might Read, button becomes `+` |
| `✕` | Dropped (Temp Dropped, Dropped, Won't Read) | → Might Read, button becomes `+` |

The + button is visible and editable to admin only.
