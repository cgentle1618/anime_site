# Frontend Components, Data Layer and Theming

Last verified: 2026-08-31 (commit 4339702, plus uncommitted archive-look changes)

**What this is for.** The building blocks under `frontend/src/` that pages are
assembled from: how data is fetched and cached, how auth and theme reach
components, the colour tokens that make light and dark mode work, the config
tables, the shared components by folder, the `lib/` utilities, and a checklist
for adding a media type. Page-by-page behaviour is in [pages.md](pages.md) and
[admin-pages.md](admin-pages.md).

## Directory layout

```
src/
  main.jsx            React root; the single QueryClient
  App.jsx             providers (Theme → Auth → Toast → Router) and routes
  index.css           Tailwind v4 import, theme tokens, light/dark palettes
  api/                client.js (fetchJson), endpoints.js (every URL)
  hooks/              react-query and UI hooks
  contexts/           AuthContext, ThemeContext
  config/             registries and vocab tables (see "Config catalog")
  lib/                pure helpers (naming, dates, layout, payloads…)
  utils/              media.js barrel, planNext.js, statsUtils.js
  components/         cards, hub, layout, forms, modals, plan, relations, tracker, info, charts
  pages/              public, detail, library (+configs), admin, add-tabs, modify-tabs,
                      defaults-tabs, notes (+sections), plan, statistics
  theme-tokens.test.js  guard against hard-coded greys
```

## Data layer

| Piece | What it does |
|---|---|
| `api/client.js` `fetchJson(url, init)` | `fetch` with `credentials: "include"`; parses JSON; **throws** on `!res.ok` with the server `detail`. There is no automatic redirect on 401 — a stale session surfaces as a thrown error. |
| `api/endpoints.js` | The only place URLs are spelled. `resource(type)` gives `list/detail/create/update/patch/remove/complete` for every `MEDIA_CONFIG` key; named groups for auth, options, roles, users, contentLabels, seasonal, announcements, watchOrder, mediaRelation, formDefaults, person, studio, credits, system, quotes, memes, dataControl. |
| `hooks/useApiQuery(key, url, {params})` | `useQuery` wrapper; key becomes `[...key, params]` when params exist. |
| `hooks/useMediaList(type, {params})` | List query keyed `["media-list", type, params]`; `LIST_OPTIONS = { params: { limit: 2000 } }` is the full-table convention. |
| `hooks/useMediaItem(type, id)` | Detail query keyed by `mediaItemQueryKey`. |
| `hooks/useMediaCacheUpdate(type, id)` | `setMediaItem`, `fetchMediaItem`, `invalidateMedia` for optimistic detail updates. |
| `hooks/useStatusToggle(type)` | PATCHes one field and writes through to both the item and every `["media-list", type]` cache entry (it maps over lists, which is why the plan-next query must live under its own key). |
| `hooks/useLibraryState` | Search/filter/sort/view state for `LibraryLayout`; nothing is persisted. |
| `hooks/useFormDefaults` | Loads and applies `/api/form-defaults/<type>` to a fresh form (`resolveDefaults`, `coerceToShape`). |
| `hooks/useGlobalMediaSearch(query)` | Debounced `/api/search/?q=&limit=10`, flattened to entry hits for pickers. |
| `pages/plan/usePlanData` | The Plan page's ten lists plus `["plan-next"]`. |

Query defaults (`main.jsx`): `staleTime` 30 s, `retry` 1, no refetch on window
focus. Query keys in use: `["media-list", type(, params)]`, media item keys,
`["plan-next"]`, `["quotes-grouped"]`, `["memes-grouped"]`, `["announcements"]`,
`["api","search",{q,scope}]`.

Two data idioms still coexist: react-query hooks (libraries, detail pages,
statistics, plan, quotes/memes, search) and raw `fetch` in `useEffect`
(hub pages, Collection/Franchise libraries, seasonal pages, most admin
pages). Writes in the raw-fetch pages update local state only, so a status
toggled inside a hub does not update the library cache until it goes stale.

## Contexts

- **`AuthContext`** — `GET /api/auth/me` on mount; exposes `isAdmin`,
  `username`, `role`, `isSuperuser`, `permissions`, `loading`, `has(permission)`
  (superuser short-circuit) and `refetchAuth()`. `ProtectedRoute` and the nav
  gate on `has("admin")`; page controls gate on `isAdmin`.
- **`ThemeContext`** — `theme` (`"light"|"dark"`, what is on screen),
  `preference` (`"light"|"dark"|"system"`), `setTheme`, `toggle`. The choice is
  stored in `localStorage["cg1618:theme"]`; `"system"` follows
  `prefers-color-scheme` live. Its only DOM effect is
  `<html data-theme="…">`. `index.html` stamps the same attribute before the
  first paint (no flash). `useThemeOrLight()` returns `"light"` when no
  provider is mounted (leaf components rendered in isolation, e.g. the
  relations canvas).

## Theming: light and dark mode

Colours are **semantic tokens** defined in `src/index.css` as Tailwind v4
`@theme` entries that reference runtime variables. Components use the token
utilities; the palette flips by `data-theme`. Light values equal the greys the
app used before tokens existed.

| Token (utility) | Role | Light | Dark |
|---|---|---|---|
| `canvas` (`bg-canvas`) | page background | `#f9fafb` | `#0b0f19` |
| `surface` | cards, tables, panels | `#ffffff` | `#111827` |
| `surface-2` | inset, hover, stripes, sticky sub-headers | `#f3f4f6` | `#1f2937` |
| `surface-3` | pressed / active pills | `#e5e7eb` | `#374151` |
| `text` | primary text | `#111827` | `#f3f4f6` |
| `text-muted` | secondary text | `#4b5563` | `#9ca3af` |
| `text-faint` | placeholders, icons, "None" | `#9ca3af` | `#6b7280` |
| `border` / `border-strong` | hairlines / inputs | `#e5e7eb` / `#d1d5db` | `#1f2937` / `#374151` |
| `brand`, `brand-hover`, `brand-soft` | accent | `#2563eb`, `#1d4ed8`, 6 % tint | same, 12 % tint |
| `ink`, `ink-text` | the nav bar (dark in both themes) | `#0f172a`, white | `#020617`, `#f8fafc` |
| `danger`, `success`, `warning`, `info` | state hues; tint with `/15` etc. | fixed | fixed |

Mapping used when converting existing markup (and the rule for new code):

| Old utility | Use instead |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-gray-50` | `bg-canvas` on sticky headers that mask scroll-under; `bg-surface-2` elsewhere |
| `bg-gray-100` / `bg-gray-200` | `bg-surface-2` / `bg-surface-3` |
| `text-gray-900`, `-800` | `text-text` |
| `text-gray-700`, `-600` | `text-text-muted` |
| `text-gray-500`, `-400` | `text-text-faint` (`-300` → `text-text-faint/60`) |
| `border-gray-50/100/200` | `border-border`; `border-gray-300` → `border-border-strong` |
| `bg-brand/5` | `bg-brand-soft` |
| `bg-green-50 text-green-600 border-green-200` and similar tints | keep the hue; prefer `bg-success/15 text-success` for new code |

`src/theme-tokens.test.js` scans `src/` and fails on any
`(bg|text|border|divide|ring|placeholder)-(gray|slate|zinc|neutral)-N`
outside the allowlist: `Nav.jsx` / `NavSearch.jsx` (they sit on the ink
surface) and `bg-gray-900/800/700` (deliberate dark overlays over cover art).
The relations canvas passes `colorMode={theme}` to ReactFlow. `--font-sans`
is Noto Sans TC / Roboto, `--font-mono` Fira Code.

## Config catalog (`src/config/`)

| File | Holds |
|---|---|
| `mediaRegistry.js` | `MEDIA_CONFIG`: per type `statusField`, `apiEndpoint`, `navPath`, `statusType` (incl. collection/franchise/series). Source for `endpoints.resource`. |
| `navigation.js` | `NAV_SECTIONS` (Library mega-panel, Track, Insights, Admin with `requires: "admin"`), `activeItem`, `visibleSections`. |
| `statusGroups.js` | `WATCHING_STATUS_GROUP`, `READING_STATUS_GROUP`, `AIRING_STATUS_CLS`. |
| `planNextGroups.js` | Size buckets and labels — a hand-kept copy of `app/utils/plan_next_kinds.py`; keep them in sync. |
| `fieldOptions.js` + `useConstants.js` | Fallback enum arrays, overwritten in place by `/api/constants` once on mount. |
| `formFactories.js` | `freshForm(type)` defaults per form. |
| `formFields/fieldMeta.js`, `formFields/index.js` | Field metadata (label, control, option source, coerce) for defaults and autofill. |
| `mediaTypeColors.js`, `namingConfigs.js`, `adminTabs.js`, `weekdays.js`, `broadcastTimes.js` | Media-type chip classes (one ink chip for every type — colour never encodes a category); name-field order per type; the Add/Modify tab bar; schedule constants. |

## Shared components by folder

- **`components/layout`** — `Layout` (canvas shell: Nav, outlet, footer, toast,
  scroll buttons), `Nav` + `NavSearch`, `ProtectedRoute`, `Toast`,
  `MediaLoadingState`, `LibraryLayout` (search / sort / filters / grid-table
  scaffold), `libraryColumns.jsx` (column and sort factories:
  `franchiseColumn`, `airingStatusColumn`, `myRatingColumn`, `malRatingColumn`,
  `imdbRatingColumn`, `watchButtonColumn`, `readButtonColumn`,
  `planFlagColumn`, `myRatingSort`, `malRatingSort`, `imdbRatingSort`),
  `GroupedEntryPage`, `CollapsibleCardGrid`, `CollapsiblePillRow`,
  `AdminTabBar`, `FittedName`, `TierBadge`.
- **`components/hub`** — `HubChrome` (`HubShell`, `GRID_CLS`, `Crumbs`,
  `AdminStrip`, `HeroCover`, `Field`, `HubTabs`, `Section`, `SELECT_CLS`,
  `pillCls`) and `HubStates`: the franchise/series/collection hub chrome in
  the archive look.
- **`components/cards`** — `MediaCard` (one card for all eight types,
  `variant="future"`), `FranchiseCard`, `CollectionCard`.
- **`components/tracker`** — `DashboardCard`, `NovelDashboardCard`,
  `ComicDashboardCard`, `MyTrackerCard`, `WeeklySchedule`, `RelationsSection`,
  `WatchOrderSection`, `WatchOrderGuide`, `WatchOrderEditor`.
- **`components/info`** — `InfoCard` (+`InfoRow`), `NamingCard`, `ScoreBlock`,
  `SourcesCard`, `RatingDistributionBlock`, `AnnouncementBoard`.
- **`components/forms`** — `FormField`, `ComboBox` (`onSelect(id, label)`),
  `MultiSelect`, `ReleaseDateInput`, `ScopePicker`, `ContentLabelPicker`,
  `DefaultValueControl`, `BelongingNovelsEditor`, `QuoteForm`,
  `QuoteEntryPicker`, `MemeForm`, `MemeOwnerPicker`.
- **`components/modals`** — `AnnouncementModal`, `RemarkModal`,
  `MarkAiringModal`, `CreateNewEntityModal`, `FranchiseCreateModal`.
- **`components/plan`** — `PlanKindToggles`, `SizeGroupControls`.
- **`components/relations`** — `RelationGraph`, `RelationNode`, `FanEdge`,
  `ConnectPopup`, `EdgeInspector`, `NodePanel`, `RelationForm`,
  `RelationTypeFilter`.
- **`components/charts`** — `BarChart` (div-based, vertical).
- **`pages/notes/sections`** — one component per note shape (`TextSection`,
  `TextLinksSection`, `EpisodeTextSection`, `NameLinksSection`,
  `EpisodeNameLinksSection`, `MusicTrackSection`, `QuoteSection`,
  `MemeSection`, `TextOrLinkSection`) plus `ui.jsx` chrome.

## `lib/` utilities

| File | Purpose |
|---|---|
| `naming.js` | `getDisplayName`, `getSortName`, `cleanString`, name-field lists |
| `releaseDate.js` | `releaseYear`, `releaseScore` for truncated-ISO dates |
| `formatters.js` | `getSourceValues` and display formatters |
| `payloads.js` | form state → request body for anime / anime movie |
| `autofill.js`, `ensureSourceValues.js` | fill a form from a picked row; keep option sources consistent |
| `covers.js` | `getCoverUrl`, `FALLBACK_SVG` (local `/static/covers` vs GCS) |
| `status.js` | status button configs (`getStatusButtonConfig`, `getReadingButtonConfig`) |
| `sources.js` | source/link helpers for `SourcesCard` |
| `enrich.js` | `enrichEntry(type, id)`: POST replace, re-read the entry, `null` on failure |
| `relationLayout.js`, `relationHandles.js`, `relationUndo.js` | pure graph layout (union-find contraction, dagre), handle geometry, undo stack |
| `textFit.js` | width measurement for `FittedName` |
| `clipboardImage.js` | copy an image to the clipboard (quotes/memes) |

## Testing conventions

Vitest + Testing Library under `src/**/*.test.{js,jsx}` (setup in
`src/test-setup.js`). Components that read a context need its provider in
the test (`ThemeProvider` for `Nav`, `ToastProvider` + `AuthProvider` for
`LibraryLayout`). Prefer `fireEvent.click` for ReactFlow nodes (d3-drag reads
`event.view`, which jsdom leaves null on user-event's mousedown). Run with
`npm run test:run`; `npm run lint` must report 0 errors.

## Adding a media type on the frontend

1. `config/mediaRegistry.js` — add the key (hyphenated), `apiEndpoint`, `navPath`, `statusField`.
2. `config/namingConfigs.js`, `mediaTypeColors.js`, `statusGroups.js` if it needs its own name order, chip key or status group.
3. `pages/library/configs/<type>.jsx` + register in `configs/index.js` — filters, sorts, columns (reuse `libraryColumns`).
4. `pages/detail/<Type>.jsx` (+ `<Type>Notes.jsx`) and the two routes in `App.jsx`; note sections in `app/utils/note_sections.py`.
5. `pages/add-tabs/<Type>AddTab.jsx`, `pages/modify-tabs/<Type>ModifyTab.jsx`, entries in `config/adminTabs.js`, `formFactories.js`, `formFields/fieldMeta.js`, and the submit/save handlers in `Add.jsx` / `Modify.jsx`.
6. `Delete.jsx` `MEDIA_KEYS`, `pages/plan/usePlanData.js`, `pages/statistics/useStatisticsData.js`, `Index.jsx` divisions, `NavSearch.jsx` scopes and quotas, `navigation.js`.
7. Backend first: registry spec, pipeline spec, sheet tab — see [../entry-types.md](../entry-types.md).
