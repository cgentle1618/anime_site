# Frontend: public pages

Last verified: 2026-09-04 (commit 601ceb8, plus uncommitted archive-look, dashboard type-filter and Quality 品質 changes)

**What this is for.** This is the map of every page a guest can open — which
route renders which file, what data it pulls and under which React Query key,
what sits on the screen from top to bottom, and which controls only appear for
an admin. Read it when a page misbehaves ("where does the dashboard get its
schedule from?"), when you add a page (copy a neighbour's pattern), or when you
change an endpoint (grep the query keys below). Admin routes live in
[admin-pages.md](admin-pages.md); shared components, hooks and theming in
[components.md](components.md).

## Route map

Routing is `react-router-dom` v6 in `frontend/src/App.jsx`. Every route is
nested under `<Layout />` (nav, `<main><Outlet/></main>`, footer, toasts,
scroll buttons). Admin routes sit inside an extra `<ProtectedRoute />` (see
admin-pages.md). Non-API paths on :8000 all return `frontend_dist/index.html`.

**Eager vs lazy.** Pages imported at the top of `App.jsx` ship in the main
bundle; the rest are `lazy(() => import(...))` route chunks fetched on first
navigation, inside one `<Suspense fallback="Loading…">`. The lazy set was
chosen because those pages (admin, the @xyflow relations canvas, statistics)
are a large share of the bundle and never needed on first paint.

| Route | Component (file under `frontend/src/pages/`) | Chunk |
|---|---|---|
| `/` | `Index` — `public/Index.jsx` | eager |
| `/login` | `Login` — `public/Login.jsx` | eager |
| `/search` | `Search` — `public/Search.jsx` | eager |
| `/library/collection` | `CollectionLibrary` — `library/CollectionLibrary.jsx` | eager |
| `/library/franchise` | `FranchiseLibrary` — `library/FranchiseLibrary.jsx` | eager |
| `/library/studio` | `StudioLibrary` — `library/StudioLibrary.jsx` (matched before `/library/:type`) | lazy |
| `/library/person` | `PersonLibrary` — `library/PersonLibrary.jsx` (matched before `/library/:type`) | lazy |
| `/library/:type` | `Library` — `library/Library.jsx` (anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic; anything else redirects to `/under-development`) | eager |
| `/anime/:system_id` … `/comic/:system_id` | `detail/Anime.jsx`, `AnimeMovie.jsx`, `Movie.jsx` (`/movie`), `TV.jsx` (`/tv-show`), `Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx` | eager |
| `/collection/:system_id` | `detail/Collection.jsx` → `CollectionPage.jsx` | eager |
| `/franchise/:system_id` | `detail/Franchise.jsx` → `FranchisePage.jsx` | eager |
| `/series/:system_id` | `detail/Series.jsx` → `SeriesPage.jsx` | eager |
| `/studio/:system_id` | `detail/Studio.jsx` | lazy |
| `/person/:system_id` | `detail/Person.jsx` | lazy |
| `/watch-order/:system_id` | `detail/WatchOrder.jsx` → `WatchOrderPage.jsx` | lazy |
| `/seasonal` | `public/SeasonalOverall.jsx` | lazy |
| `/seasonal/:seasonal_id` | `public/SeasonalDetail.jsx` | lazy |
| `/future-releases` | `public/FutureReleases.jsx` | lazy |
| `/statistics` | `public/Statistics.jsx` | lazy |
| `/completions` | `public/Completions.jsx` | lazy |
| `/plan` | `public/Plan.jsx` | lazy |
| `/quote` | `public/Quotes.jsx` | lazy |
| `/meme` | `public/Memes.jsx` | lazy |
| `/under-development` | `public/UnderDevelopment.jsx` | eager |

`App.jsx` also calls `useConstants()` once: it fetches `/api/constants` and
overwrites the bundled `config/fieldOptions.js` arrays in place so every
`<select>` in the Add/Modify tabs switches from the fallback to API values.

## The navigation model

Both the desktop tab strip and the mobile drawer render from one data file,
`frontend/src/config/navigation.js` (`NAV_SECTIONS`). Nothing in it knows
about styling.

| Section key | Label | Shape | Contents |
|---|---|---|---|
| `library` | Library | mega-panel (`columns`) | **Groups**: Collection `/library/collection`, Franchise `/library/franchise` · **Entities**: Studio `/library/studio` (also matches `/studio`), Person `/library/person` (also matches `/person`) · **ACG**: Anime, Anime Movie, Manga, Novel, Seiyuu (`dev: true`) · **Reality**: TV Show, Movie, Cartoon, Comic |
| `track` | Track | flat `items` | Plan `/plan`, Seasonal `/seasonal`, Future Releases `/future-releases`, Completions `/completions` |
| `insights` | Insights | flat | Statistics `/statistics`, Quotes `/quote`, Memes `/meme` |
| `admin` | Admin | flat, `requires: "admin"` | Control Center `/system`, Data History, Review Queue, System Options ┃ Add, Modify, Delete, Form Defaults ┃ Relations ┃ Users, Roles, Content Labels, Watch Orders |

Each item has `label`, `icon` (Font Awesome class), `to`, optional `matches`
(extra path prefixes that light the tab up — `/anime/123` highlights the Anime
library item; Franchise also owns `/series` and `/watch-order`), `dev` (routes
to `/under-development`) and `divider` (admin menu only). Helpers:
`sectionItems`, `activeItem` / `activeSectionKey` (segment-aware prefix match,
so `/library/anime` does not claim `/library/anime-movie`),
`sectionRequirement` (`adminOnly: true` is the legacy spelling of
`requires: "admin"`) and `visibleSections(sections, has)` — the Admin tab is
gated by `has("admin")` from `useAuth()`.

**`components/layout/Nav.jsx`** renders two rows: an "ink" row (logo → `/`,
`<NavSearch/>`, session controls) and a paper tab strip. Mega-panel behaviour:
click-outside closes, Escape returns focus to the trigger, ArrowUp/Down cycle
links inside `[data-nav-panel]`, any route change closes the panel and the
mobile drawer. Session controls: theme toggle (moon/sun, `useTheme().toggle`,
`aria-pressed`), and for admins an "Admin" badge, **Back up** (POST
`/api/data-control/backup`, toasts "Backup completed successfully" /
"Backup failed") and **Log out** (POST `/api/auth/logout`, then
`refetchAuth()`); guests get **Log in** → `/login?next=<current path>`.

**`components/layout/NavSearch.jsx`** is the universal search box. It
debounces 250 ms, discards stale responses by request id, and calls
`GET /api/search/?q=…&limit=20[&scope=…]`. Scopes: all, collection, franchise,
series, anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic,
seasonal. With scope `all`, `TYPE_QUOTAS` (collection 3, franchise 3, series 3,
anime 10, anime-movie 3, movie 3, tv-show 3, cartoon 5, manga 5, novel 5,
comic 5, seasonal 3) act as first-pass floors that `mergeBuckets` fills in
order then round-robins up to `MAX_RESULTS = 20` (the quotas sum to 51, so
they never all fill). Exact-title matches are lifted to the top. Enter
navigates to `/search?q=…[&scope=…]`; a result click routes to the entry's
page (`/seasonal/<encoded id>` for seasons). Comic display names are EN-first.

**Theme.** `ThemeContext` keeps `light | dark | system` in
`localStorage["cg1618:theme"]` and stamps `<html data-theme>`; `index.html`
stamps the same attribute before first paint. See components.md → Theming.

## Shared page plumbing

| Piece | File | Notes |
|---|---|---|
| `Layout` | `components/layout/Layout.jsx` | `<Nav/>`, `<Outlet/>`, footer, `<Toast/>`, `ScrollButtons` (to-top after 300 px, to-bottom when >300 px from the end) |
| `ProtectedRoute` | `components/layout/ProtectedRoute.jsx` | spinner while `auth.loading`; `has(permission)` (default `"admin"`) → `<Outlet/>`, else `<Navigate to="/login?next=<path+search>" replace/>`. A redirect, not a security boundary — the API enforces. |
| `MediaLoadingState` | `components/layout/MediaLoadingState.jsx` | spinner + `loadingText`, or red error card |
| Toasts | `hooks/useToast.jsx`, `components/layout/Toast.jsx` | `showToast(type, message)`, auto-dismiss 3.5 s, bottom-left stack |
| Data hooks | `hooks/useMediaList` (`["media-list", type, params]`), `useMediaItem` (`["media-item", type, id]`), `useApiQuery`, `useStatusToggle`, `useMediaCacheUpdate` | `LIST_OPTIONS = { params: { limit: 2000 } }` — every library-sized list uses it |

Pages that call `fetch()` directly instead of React Query: the two group
libraries, the three hubs, both seasonal pages, WatchOrderPage,
`RelationsSection` and `NotesTemplate`. Of those, only the hubs, WatchOrderPage,
RelationsSection and NotesTemplate carry a `cancelled` flag so a fast id change
cannot paint stale data.

## Pages

### Index (dashboard) — `/`

File `pages/public/Index.jsx`.

**Data**: `useMediaList` for `anime`, `franchise`, `tv-show`, `cartoon`,
`manga`, `novel`, `comic` (all `LIST_OPTIONS`) and
`useApiQuery(["announcements"], "/api/announcements/")`. Announcements are kept
out of the combined loading/error gate so a failure there never blanks the
dashboard.

**Layout** (an `xl:`-only sticky left TOC, `DashboardTOC`, tracks the active
division with a `scrollY + 140` threshold):

| Anchor | Division | What it shows |
|---|---|---|
| `#announcements` | Announcement & Notes | `AnnouncementBoard` cards (`components/info/AnnouncementBoard.jsx`); a clipped body expands into `AnnouncementModal`. Read-only here; CRUD is on `/system`. |
| `#schedule` | Weekly Schedule | two `WeeklySchedule` blocks: **My Watch Schedule** (`my_watch_day`, anime with `airing_status === "Airing"`) and **Broadcast Schedule** (`broadcast_day` + `broadcast_time`, collapsible, collapsed by default). Only anime feed the schedule today. Sunday-first (`config/weekdays.js`), today highlighted, entries sort by `HH:MM` then name. |
| `#watching` | Watching (Anime · TV Show · Cartoon) | sections `watching-active` Active Watching, `watching-passive` Passive Watching, `watching-paused` Paused, by `watching_status`. Each groups Anime → TV Show → Cartoon, sorted by rating weight (S…F, unrated last), rendering `DashboardCard`. A single-select type filter bar (`TypeFilterBar`: All / Anime / TV Show / Cartoon / Manga / Novel / Comic) sits under the division header; picking a type shows only it across BOTH the Watching and Reading divisions and pins the bar as a sticky header below the division header (sub-section headers stack below it). |
| `#reading` | Reading (Manga · Novel · Comics) | `reading-active`, `reading-passive`, `reading-paused` by `reading_status`. Manga → `DashboardCard`, Novel → `NovelDashboardCard`, Comic → `ComicDashboardCard`. The same `TypeFilterBar` renders here bound to the same shared filter state as Watching. |

**Admin-only controls** (cards read `isAdmin`): a "Quick Edit" pencil
(`/modify?id=…&type=…`; anime omits `type`) and −/input/+ progress steppers.
Guests see a read-only counter.

**Optimistic PATCH handlers.** Each handler patches every
`["media-list", type]` cache with `queryClient.setQueriesData`, fires a raw
`fetch` PATCH, and on failure restores the previous value and toasts
"Network error. Progress reverted.":

| Handler | Endpoint | Body |
|---|---|---|
| `handleEpChange` | `/api/anime/{id}` (also recomputes `cum_ep_fin = ep_previous + ep_fin` locally), `/api/tv-shows/{id}`, `/api/cartoon/{id}` | `{ ep_fin }` |
| `handleChChange` | `/api/manga/{id}` | `{ ch_fin }` |
| `handleNovelProgressChange` | `/api/novel/{id}` | any of `{ vol_fin | ch_fin | arc_fin }` (the card picks by `progress_display`: `vol_tw`, `vol_original`, `arc_ch`, `ch`) |
| `handleComicProgressChange` | `/api/comic/{id}` | `{ issue_fin }` |

Cards cap at the total and toast "Cannot exceed total episodes/volumes/…".

### Search — `/search`

File `pages/public/Search.jsx`. Reads `?q` and `?scope` (default `all`).
`useApiQuery(["api","search"], "/api/search/", { params: { q, scope }, enabled: hasQuery })`
→ effective key `["api","search",{q,scope}]`. The response is
`results.{collection, seasonal, franchise, series, anime, "anime-movie", movie, "tv-show", cartoon, manga, novel, comic}`
plus `related_franchises` (the franchises of the matched anime — used as
filter pills, not name matches). Results are copied into local state so a
card's `onUpdated` can replace a row without a refetch.

Layout: sticky header "Search Results for “q”" + scope pill + a count line
("n collections · n anime · …", non-empty buckets only); then, in order and
only when the scope allows and the bucket is non-empty: **Collections**
(`TierCard` → `/collection/{id}`), **Seasonal** (pill buttons →
`/seasonal/{id}`), a franchise pill row (`CollapsiblePillRow`, "All Results"
+ one per related franchise; filters franchises/series/anime by
`franchise_id`), **Franchises** (`TierCard` labelled "{franchise_type}
Franchise"), **Series**, **Anime** (sub-grouped TV / ONA, Movies, Other by
`airing_type`), **Anime Movies**, **Movies**, **TV Shows**, **Cartoons**,
**Manga**, **Novel**, **Comic** — all `MediaCard` grids. Empty query shows a
"No Search Query" card. Admin-only behaviour comes from `MediaCard` itself.

### Library — `/library/:type`

Files `pages/library/Library.jsx`, `pages/library/configs/index.js` +
`configs/{anime,animeMovie,movie,tvShow,cartoon,manga,novel,comic}.jsx`,
`components/layout/LibraryLayout.jsx`, `components/layout/libraryColumns.jsx`,
`hooks/useLibraryState.js`.

One page, one config per type. `Library.jsx` looks up `LIBRARY_CONFIGS[type]`,
runs `useMediaList(type, LIST_OPTIONS)`, `useMediaList("franchise")` and
(when `config.usesSeries`) `useMediaList("series")`, and hands everything to
`LibraryLayout`. `useLibraryState` holds search text, sort, grid/table view,
the filter panel toggle and the filter values — **none of it is persisted**;
navigating away resets the page. Filtering is entirely client-side over the
≤2000 rows: search (`config.buildSearchString`, normalised by `cleanString`)
→ active `filterDefs` (`match(item, value, franchiseDict, seriesDict)`) →
`sortDefs[currentSort].compare`.

Filter types: `set` (static `options`), `set-dynamic` (options derived from
the data), `set-grouped` (group labels mapped through `WATCHING_STATUS_GROUP`
/ `READING_STATUS_GROUP`), `boolean` (checkbox). Top bar: search, "Sort:"
select, Filters button with an active-count badge, grid/table toggle, result
count. Table rows link to `${config.navPath}/${id}`; table cells receive
`{ franchiseDict, seriesDict, isAdmin, handleStatusToggle }`, and
`handleStatusToggle` goes through `useStatusToggle(type)` with toasts
("Added to Watch/Read Next", "Marked for rewatch/reread", "Status → X").

**Admin-only** in tables: the watch/read status button advances the status on
click (`watchButtonColumn` / `readButtonColumn`, guests see text), and the
plan-flag checkboxes (`planFlagColumn`) are disabled for guests.

| Type | Series? | Filters (key: type) | Sorts | Table columns |
|---|---|---|---|---|
| anime | yes | airingType: set (TV/Movie/ONA/OVA/Special) · airingStatus: set · watchingStatus: set-grouped · bahaOnly: boolean | title (franchise→series→entry), release_date, my_rating, mal_rating | franchise, title, type, season, status, ep (`cum_ep_fin/cum_ep_total`), my, mal, studio, baha, watch |
| anime-movie | no | airingStatus · watchingStatus · bahaOnly | title (en→roman→alt→cn→jp), release_date (jp→tw), my_rating, mal_rating | franchise, title, status, my, mal, studio, director, baha, watch, watch_next, to_rewatch |
| movie | no | airingStatus "Release Status" · movieType (Reality/Animation) · watchingStatus | title, release_date (year of `release_date_usa` only), my_rating, imdb_rating | franchise, title, status, my, imdb, director, release, watch, watch_next, to_rewatch |
| tv-show | no | airingStatus · watchingStatus · region: set-dynamic | title, release_date, my_rating, imdb_rating | franchise, title, season, status, ep, my, imdb, watch, watch_next, to_rewatch |
| cartoon | yes | airingStatus · airingType: set-dynamic · watchingStatus · officialSource: set-dynamic | title, release_date, my_rating, imdb_rating | franchise, title_cn, title_en, type, season, airing, ep, source, my, imdb, watch |
| manga | yes | serializationStatus: set-dynamic · readingStatus: set-grouped · region: set-dynamic | title, release_date, end_date, my_rating, mal_rating | franchise, title_cn, title_en, status, ch, vol, my, mal, read, read_next, to_reread |
| novel | yes | serializationStatus · readingStatus · region · type: set-dynamic | title, release_date, end_date, my_rating, mal_rating | franchise, title_cn, title_en, status, progress (`getNovelProgress`), my, mal, read, read_next, to_reread |
| comic | yes | comicType: set-dynamic · readingStatus · era: set-dynamic · events: set-dynamic (multi-value via `parseTypes`) | title (EN-first), release_date, my_rating | franchise, title_en, title_cn, volume_label, comic_type, era, progress (`issue_fin / issue_total ISS`), my, read, to_reread |

All default to the `title` sort. `Library.test.jsx` pins the eight config
keys, requires more than three table columns and a `my_rating` sort per
config, and checks the unknown-type redirect. Search strings cover every name
field of the entry plus franchise/series names, release date/season (anime
also matches `SPR2024` / `Spring2024`), genres, studio, label, and for comic
the writer and volume label.

### CollectionLibrary — `/library/collection`

File `pages/library/CollectionLibrary.jsx`. Raw `fetch` in one `Promise.all`:
`/api/collection/`, `/api/franchise/` and all eight entry lists
(`/api/anime/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`,
`/api/cartoon/`, `/api/manga/`, `/api/novel/`, `/api/comic/`), each
`?limit=2000`, purely to resolve a cover per collection. Search over the five
collection names; sort `title | my_rating (default) | collection_expectation`.
No filter panel, no table view, no admin controls. Renders `CollectionCard`
with member count.

### FranchiseLibrary — `/library/franchise`

File `pages/library/FranchiseLibrary.jsx`. Raw `fetch` of `/api/franchise/`
and the entry lists **except `/api/comic/`** — so a comic-only franchise never
gets a comic cover fallback and its "Comic" filter category relies solely on
`franchise_type`. Filter panel "Type": Anime, Manga, Novel, Anime Movie,
Movie, TV, Cartoon, Comic, Other (Anime/Manga only count when the type is ACG
*and* the franchise actually has such entries). Sort
`title (default) | my_rating | franchise_expectation`. The grid/table toggle
exists but **table view is a "Table View Under Development" placeholder**.
Grid renders `FranchiseCard`.

### StudioLibrary — `/library/studio`

File `pages/library/StudioLibrary.jsx`. A studio is a public **entity**, not a
media type, so this sits outside `LIBRARY_CONFIGS` as its own component,
alongside `CollectionLibrary` and `FranchiseLibrary`; its route is declared
before `/library/:type` so the generic library page never claims it.

Raw `fetch` of `/api/studio/` alone — the response already carries
`display_name`, `credit_count` and `logo_file`, so no per-studio request and
no entry lists are needed. Search runs over **all four** name fields
(`STUDIO_NAME_FIELDS`), not just the displayed one, so typing "Kyoto
Animation" finds a studio displayed as "KyoAni". Sort
`name (default) | credit_count | my_rating`. No filter panel, no table view,
no admin controls. Each `StudioCard` shows the logo, the display name and the
credit count, and links to `/studio/:system_id`.

### PersonLibrary — `/library/person`

File `pages/library/PersonLibrary.jsx`. Same shape and the same reasoning as
`StudioLibrary` — a person is a public **entity**, not a media type, so it sits
outside `LIBRARY_CONFIGS` with its route declared before `/library/:type`.

Raw `fetch` of `/api/person/` alone: the response carries `display_name`,
`credit_count`, `photo_file` and the `roles` each person holds, which is what
lets the **type filter** (All plus the five `PERSON_SUB_TABS`) run client-side
— one request serves every filter, where a per-type request would refetch on
each click. Search runs over all four name columns (`PERSON_NAME_FIELDS`), not
just the displayed one. Sort `name (default) | credit_count | my_rating`. Each
`PersonCard` shows the photo, display name and credit count, and links to
`/person/:system_id`.

### Person — `/person/:system_id`

File `pages/detail/Person.jsx`. The public profile for one person, built the
same way as the studio page below and for the same reasons: two raw fetches in
one `Promise.all` (`GET /api/person/{id}` and `.../entries`), the profile call
failing is the page's 404 while the entries call failing is not, and nothing on
the page is editable.

Layout: breadcrumb → left column with the photo, rating stamp and an "Other
names" card → right column with the display name, credited-entry count, a
"Profile" `InfoCard` (gender, the types they are offered under, remark), then
one section per group.

The one difference from the studio page: a person may hold several roles, so
`/entries` groups by **(media type, role)** and each heading is the group's
`label` — 原作 on a manga, Writer on a comic — which comes from the endpoint,
not from the page. A group the viewer may see no entries of still renders, with
"Nothing you can see here" inside it. Entry cards are the same local
`CreditCard`, not `MediaCard`, for the reason spelled out below.

### Studio — `/studio/:system_id`

File `pages/detail/Studio.jsx`. The public profile for one studio, built by
hand beside the media detail pages rather than from their shape: a studio has
no franchise, no tracker and no notes.

Two raw fetches in one `Promise.all`: `GET /api/studio/{id}` and
`GET /api/studio/{id}/entries`. The studio call failing is the page's 404
(rendered through `MediaLoadingState`, as the media pages render theirs); the
entries call failing is not, since a profile without its credits is still
worth showing. Nothing on the page is editable, which is why it uses `fetch`
rather than the TanStack hooks the media detail pages need for their admin
controls.

Layout:

1. **Breadcrumb** `/library/studio` → display name.
2. **Left column** — logo with the rating stamp, then an "Other names" card
   listing whichever of the four names is set and is not the one being
   displayed, labelled English / Chinese / Japanese / Alternative.
3. **Right column** — the display name, a credited-entry count, a "Profile"
   `InfoCard` (country; `founded – defunct`, or `Since founded` while the
   studio is still working, and the row is dropped when both are empty;
   website and MAL as external links; remark), then one section per group the
   entries endpoint returned, each entry linking to
   `{nav_path}/{system_id}`.

Empty `groups` renders "No credited entries" as an ordinary empty state, not
an error: that is exactly what a viewer whose permissions hide every one of
this studio's credits sees.

The entry cards are a local `CreditCard`, **not** `MediaCard`. `MediaCard`
resolves its title through `getDisplayName(data, type)` and reads status,
franchise and admin props; the entries endpoint returns four keys
(`system_id`, `display_name`, `cover_image_file`, `release_date`), so
`MediaCard` would render blank titles. A group whose `nav_path` is null
renders the card unlinked.

### Hubs — `/franchise/:id`, `/series/:id`, `/collection/:id`

Files `pages/detail/FranchisePage.jsx`, `SeriesPage.jsx`, `CollectionPage.jsx`
(thin wrappers `Franchise.jsx`, `Series.jsx`, `Collection.jsx`). Chrome comes
from `components/hub/` (`HubShell`, `Crumbs`, `AdminStrip` — the admin-only
dashed strip with the **Quick edit** link `/modify?id=…` —, `HeroCover` with
the spine strip and optional progress rule, `Field`, `HubTabs`, `Section`,
`HubLoading/HubError/HubEmpty/FilterEmpty`).

All three fetch with raw `fetch` in one effect keyed on `system_id` with a
`cancelled` flag; Franchise and Series also `setActiveTab(null)` on id change
so the first available tab is re-picked (Collection keeps "Franchises").

| | FranchisePage | SeriesPage | CollectionPage |
|---|---|---|---|
| Loads | `/api/franchise/{id}`; series, anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic lists `?franchise_id=`; `/api/plan-next/?scope=franchise`; parent collection lazily | `/api/series/{id}`; anime, movie, tv-show, cartoon, manga, novel, comic `?series_id=` (no anime-movie — they have no series); `/api/plan-next/?scope=series&kind=rewatch`; parent franchise | `/api/collection/{id}`; `/api/franchise/?collection_id=`; all eight entry lists (covers only) |
| Hero badges | `TierBadge` with `franchise_type`, names, my_rating, "{x} Expectation", parent collection link, "Plan Next: {type} ({bucket})", "To Rewatch/Reread: {type}", total entries, completion bar | same shape with `series_expectation`, rewatch chips, parent franchise link | names, my_rating, `collection_expectation`, "{n} Franchise(s)" |
| Admin controls | Overall Rating select, Expectation select, **Plan Next** `SizeGroupControls` (per-type checkbox + derived/manual size-group select → PATCH `size_group_manual`), rewatch `PlanKindToggles` | Overall Rating, Expectation, rewatch `PlanKindToggles scope="series"` (no size groups at series level) | Overall Rating, Expectation |
| Remark | textarea (admin editable, guest disabled, shown when admin or non-empty), "Show all" opens `RemarkModal`; saved on blur / modal close via PATCH `{ remark }` | same | same |
| Tabs | "Media" (counted): Anime, Anime Movies, Manga, Novel, Comic, Movies, TV Shows, Cartoons — shown when `franchise_type` allows *and* the list is non-empty; "Extras": Watch Order, Relations, Notes | Media tabs by non-empty list only; same extras | "Members" → Franchises (`FranchiseCard`s); extras Watch Order, Relations, Notes |

Plan toggles call `POST /api/plan-next/` `{ media_type, scope, kind, target_id }`
(409 tolerated) and `DELETE /api/plan-next/target?scope=&media_type=&kind=&target_id=`
(404 tolerated). Media tabs carry a sort select, a group-by-series checkbox
(on by default for anime/comic/movies/tv/cartoons) and filter pills specific to
the type. Extras render `WatchOrderSection` (see below),
`RelationGraph readOnly scopeType=… scopeId=…`, and `{Tier}Notes` with the
`remark` section hidden whenever the hero already shows the remark box.
Franchise cover resolution skips comics.

### Detail pages — `/{type}/:system_id`

Files `pages/detail/Anime.jsx`, `AnimeMovie.jsx`, `Movie.jsx`, `TV.jsx`,
`Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx`.

**Common skeleton.** Data: `useMediaItem(type, id)` mirrored into local
state, `useMediaList("franchise", LIST_OPTIONS)`, `useMediaList("series")`
(not AnimeMovie), and `useMediaCacheUpdate(type, id)` for
`setMediaItem / fetchMediaItem / invalidateMedia`. Every write goes through a
local `performPatch(payload, msg)`: no-op for guests, optimistic merge, PATCH
`endpoints.resource(type).patch(id)`, replace from the response; on failure
toast "Update failed" and refetch.

Top to bottom:

1. **Breadcrumb** `/library/{type}` → title.
2. **Admin toolbar** (`isAdmin`): **Quick Edit** → `/modify?id={id}`;
   **Mark Completed** → `POST {apiEndpoint}/{id}/complete` then refetch;
   **Autofill & Update** → `POST /api/data-control/replace/{type}/{id}`
   with a spinner. Comic has no Autofill (manual-entry type).
3. **Left column**: poster card (my_rating badge, cover, hover progress
   overlay — percent or "{n} ep"), `SourcesCard` (Baha/Netflix/other,
   MAL/AniList/official/Twitter/IMDb links, official source, serialization
   platform), `RelationsSection` (GET
   `/api/media-relation/for-entry?media_type=&entry_id=`, hidden when empty,
   "Related Entries" sorted by relation family; omitted on Comic), and an
   admin-only **System Info** card with the system id.
4. **Right column**: header chips (status / type), h1 title (cn → en →
   roman), h2 subtitle, franchise/series bar linking to the hubs,
   `ScoreBlock` (MAL score/rank, AniList score, last updated) on Anime,
   AnimeMovie, Manga, Novel (Movie has an inline IMDb block; TV/Cartoon/Comic
   none), the tracker, `NamingCard`, `InfoCard "Information"`, `InfoCard
   "Production"` — whose Studio row on Anime and AnimeMovie is built by
   `studioValue()` (`components/info/StudioLinks.jsx`): one link to
   `/studio/{system_id}` per entry in `studio_refs`, falling back to the plain
   comma-joined `studio` string when there are none, which is what a viewer
   without the Credits permission and an entry whose studio never resolved to
   a row both get — a "Cast & Characters — Under Development" placeholder
   (Anime, AnimeMovie only), a remark textarea (blur-saves; rendered only when
   a remark already exists, with the Notes `remark` section hidden so the
   singleton row never has two editors), then `{Type}Notes` →
   `pages/notes/NotesTemplate.jsx`.

**Tracker**: `MyTrackerCard` (`components/tracker/MyTrackerCard.jsx`:
progress stepper with cumulative counts, status select, rating select,
optional Watch/Read Next and To Rewatch/Reread checkboxes; every control is
admin-only) on Anime, TV (`watch_next` + `to_rewatch`), Cartoon
(`watch_next`), Comic (`issue_fin`, `reading_status`, `to_reread`).
AnimeMovie and Movie inline a status/rating/Watch Next/To Rewatch tracker;
Manga uses a local `MangaTrackerBlock` (`ch_fin`, `vol_fin`, `vol_fin_page`,
`read_next`, `to_reread`); Novel uses `components/tracker/NovelTrackerBlock`
(`ch_fin/vol_fin/arc_fin` by `progress_display`).

**Per-type differences**

| Page | Information card | Production card | Extras |
|---|---|---|---|
| Anime | 本傳/外傳, Season Part, Special Episodes, Total Episodes (with cumulative), Airing Type/Status, Release Season, Release Date, Genre main/sub, 標籤 Label, Quality 品質 | Studio, 台灣代理, Director, Producer, Music | remark lives only in Notes (no textarea); Cast placeholder |
| AnimeMovie | Airing Status, Length, Release Date JP/TW | Studio, Director | no series query; Cast placeholder |
| Movie | 本傳/外傳, Airing Status, Length, Director, Release Date TW/USA | — | inline IMDb score block |
| TV | 本傳/外傳, Season, Total Ep, Official Source, Airing Status, Release Date | — | |
| Cartoon | + Airing Type, Length Per Ep (min) | — | |
| Manga | Region, 本傳/外傳, Serialization Status/Platform, Release/End Date, Volume/Chapter Total | 作者 or 原作/作畫, Publisher TW, Anime Studio (card shown only when any value) | Twitter link pulled from `source_other` |
| Novel | Region, Type, Version, 本傳/外傳, Serialization Status, Release/End Date, Vol Total (Original/TW), Arc Total, Chapter Total | Author, Illustrator, Publisher TW (conditional) | **Belonging Novels** card (`BelongingNovelsEditor` for `novel_name_each_cn/en`, Save → PATCH) |
| Comic | Type, Volume Label, Continuity, Era, Main Line, Serialization/Reading Status, Release Year, Issue Total | Writer, Artist, Publisher, Imprint, Publisher TW (conditional) | **Events** card (red pills); no Autofill, no `RelationsSection`, no `ScoreBlock` |

`MarkAiringModal` is not used by any detail page; only `MediaCard` opens it.

**Notes.** Each `pages/detail/*Notes.jsx` is a one-liner around
`NotesTemplate` with `ownerType` = `anime | anime-movie | cartoon | collection
| comic | franchise | manga | movie | novel | series | tv-show`. The template
fetches `/api/notes/sections?owner_type=` and `/api/notes?owner_type=&owner_id=`
(cancellable), renders a "Notes" card for ungrouped sections plus one card per
registry group, and hands `quotes`/`memes` sections to `QuoteSection` /
`MemeSection`. `hideSections` is the only place the frontend names a section
key; see systems/notes.md.

### WatchOrderPage — `/watch-order/:system_id`

File `pages/detail/WatchOrderPage.jsx`. GET `/api/watch-order/lists/{id}`
(404 → "Watch order not found."), then the owner (`/api/franchise/{id}` or
`/api/collection/{id}`) and sibling lists
`/api/watch-order/lists?franchise_id=&collection_id=` (self excluded);
cancellable. Shows owner link, `MediaScopeLine`, list name, badges
(`list_type`, most-recommended, Default, "{n} steps"), an **admin-only** link
to `/watch-orders`, `WatchOrderGuide` (filter all / essentials / no-optional,
section blocks, list remark) and "Other orders for {owner}".

The hub tab uses `components/tracker/WatchOrderSection.jsx`: lists for the
scope, chips for 2–6 lists (select above 6), inline guide capped at 10 steps
with a "see full" link, and an admin-only **Add built-in order** button
(`POST /api/watch-order/lists/release?…`, hidden once a release order exists).
Editing happens only on the admin `/watch-orders` page.

### SeasonalOverall — `/seasonal` · SeasonalDetail — `/seasonal/:seasonal_id`

Files `pages/public/SeasonalOverall.jsx`, `SeasonalDetail.jsx`. Raw fetch.
Overall loads `/api/seasonal/current-season`, `/api/seasonal/`,
`/api/franchise/`, then `/api/anime/?airing_season=` for the current and next
season. Tabs **Current Season** (sections Completed / Watching / Planned /
Might Watch / Dropped with a `RatingDistributionBlock`), **Next Season**
(Watch When Airs / Plan to Watch / Might Watch / Other) and **All Seasons**
(year × WIN/SPR/SUM/FAL table linking `/seasonal/{id}`). Detail loads
`/api/seasonal/{id}`, `/api/anime/?airing_season={id}`, `/api/franchise/`,
with prev/next season arrows. Both render `DashboardCard`s with the same
optimistic `PATCH /api/anime/{id} { ep_fin }`. **Admin-only**: a "Seasonal
Rating" select → `PATCH /api/seasonal/{id} { my_rating }`, plus the hint to
set the current season under Admin → System Config when none is set.

### Statistics — `/statistics` · Completions — `/completions`

Files `pages/public/Statistics.jsx`, `pages/statistics/useStatisticsData.js`,
`StatsFavoriteGrids.jsx`, `StatsFranchiseSummary.jsx`, `StatsCompletions.jsx`,
`pages/public/Completions.jsx`, `components/charts/BarChart.jsx`.

`useStatisticsData` runs `useMediaList` for franchise and all eight entry
types plus `useApiQuery(["api","seasonal"], "/api/seasonal/")` and
`useApiQuery(["api","seasonal","current-season"], "/api/seasonal/current-season")`.
Statistics renders the favourite 3×3 grids (one per `franchise_type`: ACG,
Novel, Movie, TV Show, Cartoon, Comic; edited on `/modify` → Fav3x3) and the
"Rating Distribution" bar-chart cards (my rating per anime franchise, MAL per
anime, seasonal per season, my rating for manga / novel / anime movie / movie
/ TV / cartoon / comic franchises). Completions renders `StatsCompletions`:
one tab per type with paged sub-groups (anime by airing type, anime movie by
studio bucket, movie/TV Disney/Marvel/other, cartoon by network, manga by
region, novel by region, comic dynamic) using `COMPLETED_STATUSES`. No admin
controls on either page.

### FutureReleases — `/future-releases`

File `pages/public/FutureReleases.jsx`. `useMediaList("anime")`,
`useMediaList("franchise")`,
`useApiQuery(["api","system","current-season-config"], "/api/system/config/current_season")`,
and lazily per tab `anime-movie`, `movie` (`{ limit: 2000, airing_status: "Not Yet Aired" }`),
`tv-show`, `cartoon`. Tabs Anime / Anime Movies / Movies / TV Shows / Cartoons.
Anime keeps `Not Yet Aired` from the current season onward, grouped
"Spring 2025" / year / TBD with type chips; anime movies group by release
year; TV also includes "Airing". Cards are `MediaCard` with `isAdmin`;
`onUpdated` patches the `["media-list", type]` caches.

### Plan — `/plan`

Files `pages/public/Plan.jsx`, `pages/plan/usePlanData.js`, `PlanWatchNext.jsx`,
`PlanToRewatch.jsx`, `PlanToWatchFuture.jsx`, `PlanNextCard.jsx`.
`usePlanData` runs ten `useMediaList`s (franchise, series, eight entry types)
and `useQuery({ queryKey: ["plan-next"], queryFn: () => fetchJson("/api/plan-next/") })`
— deliberately not a media-list key. Rows are decorated with a `bucket`
(`utils/planNext.js` `entryBucket`) and a cover for franchise/series scopes.
Sections: **Watch Next** (`PLAN_TABS`, `kind === "next"`, grouped by
`SIZE_GROUPS` with manga's empties under "其他"), **To Rewatch**
(`REWATCH_TABS`, scopes Franchise → Series → Entries via `scopesFor`),
**Plan to Watch for Future Releases** (Watch When Airs / Plan to Watch,
grouped by year, `MediaCard variant="future"`; an update bumps `reloadKey`
which invalidates `["media-list"]` and `["plan-next"]`). Toggling plan flags
happens on hubs, detail pages and Modify, not here. See systems/plan-next.md.

### Quotes — `/quote` · Memes — `/meme`

Files `pages/public/Quotes.jsx`, `Memes.jsx`, shell
`components/layout/GroupedEntryPage.jsx`. Quotes:
`useApiQuery(["quotes-grouped"], "/api/quote/grouped", { params })` with
`media_type`, `is_general`, `is_favorite`, `needs_review` (admin-only
toggle), `search_query`. Memes: `useApiQuery(["memes-grouped"], "/api/meme/grouped", { params })`
with `owner_type`, `is_favorite`, `search_query`. Both group rows under an
owner card (cover or tier icon; "Unlinked / deleted owner" when missing).
Row actions: copy text/image for everyone; **admin-only** favourite toggle,
edit (`QuoteForm` / `MemeForm`, PATCH `/api/quote/{id}` / `/api/meme/{id}`)
and delete, followed by `invalidateQueries` on the grouped key.

### Login — `/login`

File `pages/public/Login.jsx`. Heading "Admin Access". POSTs
`/api/auth/login` as `application/x-www-form-urlencoded` (`username`,
`password`), then `refetchAuth()` and navigates to `?next` when it starts with
`/`, otherwise `/system` (replace). Errors show inline and as a toast.

### UnderDevelopment — `/under-development`

File `pages/public/UnderDevelopment.jsx`. Static card. Targets: unknown
`/library/:type` values, `dev: true` nav items (Seiyuu).

## Known rough edges (as of this commit)

- Comics are skipped in cover resolution on FranchiseLibrary, FranchisePage
  and `usePlanData.allEntriesByFranchise`; CollectionLibrary/CollectionPage do
  include them.
- `SeasonalDetail` refetches on id change without a cancellation flag;
  `SeasonalOverall`, `CollectionLibrary`, `FranchiseLibrary` fetch once.
- `Search.jsx` passes `isAdmin` only to the Manga `MediaCard`s.
- Detail-page Quick Edit for anime omits `&type=`; dashboard cards add it.
- `useStatisticsData` loads TV/cartoon/comic lists Statistics never uses;
  `StatsCompletions` is rendered only by `/completions`.
- Comic sits in the nav's Reality column with the same icon as Novel.
