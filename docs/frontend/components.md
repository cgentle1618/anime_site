# Frontend Components, Data Layer and Theming

Last verified: 2026-09-13

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
| `hooks/useFormDefaults` | Loads and applies `/api/form-defaults/<type>` to a fresh form (`resolveDefaults`, `coerceToShape`). Repeater defaults (source rows, game copies) arrive as arrays with any `system_id` stripped — a default row is a template that must insert, never update. |
| `hooks/useGlobalMediaSearch(query)` | Debounced `/api/search/?q=&limit=10`, flattened to entry hits for pickers. |
| `pages/plan/usePlanData` | The Plan page's eleven lists (franchise, series and the nine entry types) plus `["plan-next"]`. |

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
  `username`, `role`, `isRoot`, `permissions`, `loading`, `has(permission)`
  (root short-circuit) and `refetchAuth()`. `ProtectedRoute` and the nav
  gate on `has("admin")`; page controls gate on `isAdmin`. `refetchAuth()` is
  *not* how an identity change is applied: sign-in, sign-out and an
  access-mode switch each call `hardNavigate()` (`lib/hardNavigate.js`) and
  load the page again, because the cached answers around them belong to the
  outgoing identity. See `docs/authentication.md`.
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
utilities; the palette flips by `data-theme`.

**The hex values in the table below are the original pre-archive palette and
are no longer what `index.css` holds** — the archive redesign repainted every
token (bone paper, wisteria accent) without changing a single token *name*.
[design-system.md](design-system.md) is authoritative for the values; the table
here is still the right map of which token plays which role, and the conversion
table under it is still the rule for new code.

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
| `mediaRegistry.js` | `MEDIA_CONFIG`: per type `statusField`, `apiEndpoint`, `navPath`, `statusType` (incl. collection/franchise/series). `statusType` is the status axis — `watch`, `read` or, for `game`, `play` (`statusField: "playing_status"`). Source for `endpoints.resource`. |
| `navigation.js` | `NAV_SECTIONS` (Library mega-panel, Track, Insights, then Entry, Note and Admin with `requires: "admin"`), `activeItem`, `visibleSections` (filters rows as well as sections — Insights carries two `requires: "admin"` rows). |
| `statusGroups.js` | `WATCHING_STATUS_GROUP`, `READING_STATUS_GROUP`, `PLAYING_STATUS_GROUP`, `AIRING_STATUS_CLS`; plus the picker groups (`STATUS_PICKER_GROUP`, `groupStatusOptions()`) that `components/ui/StatusOptions.jsx` renders as `<optgroup>`s. Filter buckets and picker groups are separate splits of the same vocabulary — and one `STATUS_PICKER_GROUP` map covers all three status axes, because no value means something different between them (Paused is Paused whether you watch, read or play). |
| `planNextGroups.js` | Size buckets and labels — a hand-kept copy of `app/utils/plan_next_kinds.py`; keep them in sync. `game` has **no** `SIZE_GROUPS` entry (as `anime-movie` has an empty one): there is no count a game groups by, so its Plan tab renders one ungrouped list. Its `ALLOWED_SCOPES` are entry/series/franchise for both `next` and `rewatch`. |
| `fieldOptions.js` + `useConstants.js` | Fallback enum arrays, overwritten in place by `/api/constants` once on mount — but only the arrays listed in `CONSTANTS_FALLBACK`. The seven game vocabularies (`GAME_TYPES`, `COMPLETION_LEVELS`, `GAME_RELEASE_STATUSES`, `GAME_STOREFRONTS`, `GAME_OWNERSHIP_KINDS`, `GAME_COPY_FORMATS`, `GAME_ACQUISITION_KINDS`) are **not** in that map, so they stay hand-maintained literals that must be kept matching `app/utils/constants.py` by hand — even though `/api/constants` does serve all eight game keys now. `PLAYING_STATUSES` is the one game list that is a real fallback. `PRICE_CURRENCIES` is frontend-only: `game_copy.price_currency` is a free string on the backend. |
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
- **`components/cards`** — `MediaCard` (one card for all nine types,
  `variant="future"`; its status button comes from `getCardStatusConfig(type,
  status)`, which dispatches on the watch / read / **play** axis, and its
  progress line for a game is `hours_played` against `hltb_main`, rendered
  only when at least one of the two exists), `FranchiseCard`, `CollectionCard`, and `StaffCard`
  (`PersonCard` / `StudioCard` over one shared body — the person and studio
  libraries and the `/search` staff sections all draw it).
- **`components/tracker`** — `DashboardCard`, `NovelDashboardCard`,
  `NovelTrackerBlock` (the detail-page reading-progress widget; both drive
  the novel two-stage arc/chapter cursor via `arcStep` in `lib/novelUnits.js`),
  `ComicDashboardCard`, `GameDashboardCard`, `DashboardTable`,
  `MyTrackerCard`, `WeeklySchedule`,
  `RelationsSection`, `WatchOrderSection`, `WatchOrderGuide`,
  `WatchOrderEditor`.
  The four dashboard cards take a `view` prop (`"card"` | `"list"`). In
  `"list"` they reuse every derivation above their return and render one
  `<EntryRow>` from `DashboardTable` instead of a tile, so the dashboard's
  list view adds no second data path — a media type that gets its progress
  wrong gets it wrong in both views, which is the point. `DashboardTable`
  defines the five columns (Title, Type, Status, Rating, Progress) exactly
  once; a type writing its own `<td>`s would drift out of alignment with the
  others the first time a column changed. Because the four types measure
  different things, every row carries its unit in the Progress cell
  (`12/28 ep`, `97/364 ch`, `4/12 vol`, `44/144 iss`, `62/55 h`) — the column
  is five honest measurements rather than one dishonest one. There is no
  stepper in list view: a one-line row has nowhere to put a control without
  becoming a card again, so tracking stays in card view and on the entry
  page. The mode is chosen in each division's type-filter bar, is one setting
  for the whole dashboard, and persists per browser through
  `lib/dashboardView.js` (`cg1618:dashboard-view`) — never server-side.
  `MyTrackerCard` renders its −/input/+ stepper **only when the caller passes
  an `onEpChange`**; a game passes none, so its card shows status, rating and
  the To Replay checkbox alone rather than an inert `0 / undefined` counter
  (`statusLabel` and `rewatchLabel` are what relabel it "Playing Status" /
  "To Replay").
  `GameDashboardCard` is a fourth dashboard card rather than a third arm
  inside `DashboardCard`: that file's `isReading` ternaries serve the
  watch/read pair, and a game's bar is read-only playtime against `hltb_main`
  (achievements when the game reports a total and no estimate exists), so
  there is no progress callback to thread through.
- **`components/info`** — `InfoCard` (+`InfoRow`), `NamingCard`, `ScoreBlock`,
  `SourcesCard`, `RatingDistributionBlock`, `AnnouncementBoard`.
  `SourcesCard` reads the entry's `sources` array (server-ordered — access
  rows in `sort_order`/insertion order, never re-sorted client-side), splits
  it into `access`/`reference` sections by `row.kind`, titles the access
  section by media type through `accessHeading(mediaType)` — "Where to Watch",
  "Where to Read", or **"Where to Play"** for a game — and renders the
  column-backed
  `malLink`/`imdbLink`/`comicvineLink`/`openLibraryLink`/`igdbLink` props
  beside the reference rows and the tag-field props (`originalSource`,
  `exclusiveSource`, `serializationPlatform`) as `Tag` chips above them — one
  component composing from both the `media_source` table and the surviving
  columns/tag fields, per the guiding rule in
  [business-rules.md](../business-rules.md#18-media-sources-appservicesdomainsourcespy-apputilscredit_rolespy).
  An `available === false` row still renders (muted, no link) — that state
  means "known not to be there", not "hide this row".
- **`components/forms`** — `FormField`, `ComboBox` (`onSelect(id, label)`),
  `MultiSelect`, `ReleaseDateInput`, `ScopePicker`, `OptionSubTabBar`,
  `OptionCategorySelect`,
  `ContentLabelPicker`, `SourcesEditor` (the one shared editor for every Add
  and Modify tab's `sources` field, replacing eight copy-pasted
  `source_other` editors; produces `access` rows for `main`/`other`/
  `restricted` platform pickers and always-`{kind:"reference", bucket:"main"}`
  rows for the Reference Source dropdown - which never takes a `usage` filter,
  since `usage` is Platform-only; `showAccess={false}` drops the access group
  outright, which is how a game gets a Sources card with references only),
  `DefaultValueControl` (one field's editor on `/defaults`; for the repeater
  fields — `sources` everywhere, `copies` on game — it renders `SourcesEditor`
  and `GameCopiesEditor` themselves, so the default rows are built in the same
  UI that will show them on the Add form), `NovelUnitsEditor` (replaced `BelongingNovelsEditor`
  — edits the `novel_unit` rows the Add/Modify novel tabs send as `units`;
  kind choices come from `kindsForType(novel.type)` in `lib/novelUnits.js`,
  and previews each row's `unitDisplayKey` placeholder before save. The
  two-stage reading cursor stepper (`arcStep`, same module) lives in the
  tracker components below, not here), `QuoteForm`,
  `QuoteEntryPicker`, `MemeForm`, `MemeOwnerPicker`, `GameCopiesEditor`
  (the `game_copy` rows a game's Add/Modify tab sends as `copies`; controlled
  exactly like `NovelUnitsEditor` — the parent owns the array, every add /
  remove / edit / reorder goes out through `onChange` with `position`
  renumbered 1..n, and the array handed in is never mutated), `ImagePicker`
  (an inline "upload or choose from the library" control: upload
  (`POST /api/images`) and attach (`POST /api/images/{id}/attach`) are two
  separate calls made in sequence, since an image can exist in the library
  with no owner. A brand-new quote or meme has no `ownerId` until first
  saved, so attach is silently skipped in that one case — the upload still
  succeeds and hands back a storage key for the form to persist on save; once
  an `ownerId` exists, an attach failure (an unsupported owner type, or the
  content-label 404) is surfaced rather than swallowed. Used today in
  `QuoteForm` and `MemeForm`; the entry, staff and character forms still take
  `cover_image_file`/`photo_file`/`logo_file` as a plain text input).
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
  `MemeSection`, `TextOrLinkSection`, `NameEntriesSection`) plus `ui.jsx`
  chrome. `NameEntriesSection` renders the `name_entries` shape — a titled
  list whose items are each `{type: "text" | "link", value, label}` stored in
  the note's own `entries` column, never in `links` — and offers a kind
  dropdown built from `section.kinds` when the registry declares any. Its
  owners are the eleven game-only sections of the 攻略 group that each hold one
  named thing — `side_quests`, `builds_and_styles`, `skills`, `collectibles`,
  `items`, `weapons_and_gear`, `characters_guide`, `enemies`, `endings`,
  `mods_and_tools` (kinds Mod / Tool, the only one of the eleven with a
  dropdown) and `guide_resources`. `guide_resources` is deliberately **not**
  keyed `resources`, which already exists site-wide.
  `NotesTemplate`'s `SHAPES` map covers all eight stored shapes.

## The access-mode admin pages (`pages/admin/`)

`AccessModes.jsx` and the panel inside `Users.jsx` edit the **object axis** -
which entries and fields a session can reach. Both are shaped on their role
equivalents so the pair read the same way, and both carry one control whose
shape is a guarantee rather than a style choice.

| Control | Shape | Why it cannot be a checkbox / free field |
|---|---|---|
| Guest default (`AccessModes.jsx`) | **no control at all** | A logged-out visitor always resolves the `safe` mode, which is what that mode means rather than something an administrator picks. There is no column to store a choice, so the page offers none; `safe`'s own description carries the fact. |
| Per-account denials (`Users.jsx`) | **the mode's own list, tick-to-deny** | Denials only subtract - an account's reach is always a subset of its mode's - so showing the ceiling and letting you remove from it is structurally incapable of naming something outside it. |
| Login default (`Users.jsx`) | a radio among the modes that account **holds** | It cannot drift out of the granted set, which is the same guarantee the partial unique index gives in the database. |

**`homelessLabelKeys` is exported for its tests**, and is the one piece of
logic on either page that can be wrong in a way nobody would notice. A content
label carried by no mode hides its entries from everyone, the owner included;
the warning computes from the **draft**, so it appears the moment the last
mode carrying a label is unticked - while it can still be reconsidered -
rather than after a save and a reload, by which point it is a record rather
than a warning.

An account holding **no** mode is called out in red on the users table. It
reaches nothing, which is fail-closed and correct and looks exactly like a
broken site.

Both pages sit behind `admin.authz` on **both** SPA permission surfaces -
`App.jsx`'s route gate and `navigation.js` - and the nav link inherits the
admin section's `requires` rather than declaring its own.
`navigation.test.js` asserts that inheritance, because a second declaration
is a second place to keep in step.

## `lib/` utilities

| File | Purpose |
|---|---|
| `naming.js` | `getDisplayName`, `getSortName`, `cleanString`, name-field lists |
| `releaseDate.js` | `releaseYear`, `releaseScore` for truncated-ISO dates |
| `formatters.js` | `getSourceValues(sources, source)` (filters the `fetchAllSources()` bag by category/scope/**usage** for a `ComboBox`) and display formatters |
| `payloads.js` | form state → request body for every media type, including mapping the `SourcesEditor` array into the `sources` write-payload key |
| `autofill.js`, `ensureSourceValues.js` | fill a form from a picked row; keep option sources consistent |
| `covers.js` | `getCoverUrl`, `FALLBACK_SVG` (`/static/covers/<key>` on every host, except a `library/`-prefixed key — an uploaded image — which resolves to `/static/<key>` instead, since the library root is a sibling of `covers/` under `static/`, not part of it. The app serves its own images off local disk, so there is no hostname switch and no bucket URL). `withMediaType` for tagging a fetched list so the convention-filename fallback knows which folder to look in — an untagged entry falls back to the placeholder rather than a broken URL plus the grouping-tier resolvers `getFranchiseCover` / `getSeriesCover` / `getCollectionCover`. `getSeriesCover` takes one flat combined list and its caller must pass **every** entry list the page loaded: a series whose `cover_entry_id` points at a type left out silently falls back to the placeholder. Passing fewer lists than the page loaded is the standing bug here, and it fails silently. Also `isLocalHost` and `getQuoteImageUrl`: quote images live under `static/quotes/`, and a `library/`-prefixed key (an uploaded quote or meme image) resolves the same way `getCoverUrl` resolves one — off the localhost hold, which only ever existed because there was no way to get a file onto the machine at all |
| `status.js` | status button configs (`getStatusButtonConfig`, `getReadingButtonConfig`, `getPlayingButtonConfig`) and `getCardStatusConfig(type, status)`, which picks between them from two `Set`s (`READ_TYPES`, `PLAY_TYPES`) rather than a chain of `||` — a tenth media type is one entry, not another ternary arm |
| `sources.js` | **not** related to `media_source`/`SourcesCard` despite the name — `fetchAllSources()` is the generic `{options, studios, publishers, people}` suggestion bag every Add/Modify dropdown (`ComboBox`, `SourcesEditor` included) draws from. `people` and `publishers` are **maps**, not flat lists: people fan out by `{role, scope}` and publishers by media type, one `/api/publisher/?scope=` request per scope, because a publisher is offered only where its `publisher_scope` rows say — a games publisher must not be suggested as an anime distributor. Studios stay a single flat list; they have no scope concept. Same naming collision as "label" - see [`CLAUDE.md`](../../CLAUDE.md) |
| `enrich.js` | `enrichEntry(type, id)`: POST replace, re-read the entry, `null` on failure |
| `relationLayout.js`, `relationHandles.js`, `relationUndo.js` | pure graph layout (union-find contraction, dagre), handle geometry, undo stack |
| `textFit.js` | width measurement for `FittedName` |
| `clipboardImage.js` | copy an image to the clipboard (quotes/memes) |
| `novelUnits.js` | `NOVEL_UNIT_KINDS_BY_TYPE` (hand-mirrored from `app/utils/constants.py`, pinned by `config/novelUnitKinds.test.js`), `kindsForType`, `unitDisplayKey`, `arcStep` (frontend mirror of `normalize_arc_progress`) |

## Testing conventions

Vitest + Testing Library under `src/**/*.test.{js,jsx}` (setup in
`src/test-setup.js`). Components that read a context need its provider in
the test (`ThemeProvider` for `Nav`, `ToastProvider` + `AuthProvider` for
`LibraryLayout`). Prefer `fireEvent.click` for ReactFlow nodes (d3-drag reads
`event.view`, which jsdom leaves null on user-event's mousedown). Run with
`npm run test:run`; `npm run lint` must report 0 errors.

## Detail-page URLs

Every detail page is addressed `/<type>/<public_id>/<slug>` - `/anime/47/cowboy-bebop`.

- **`public_id`** is the short per-table integer from the API (see
  [../data-model.md](../data-model.md)). The route param is `publicId`; each
  page passes it straight to its initial fetch, and the endpoint accepts it or
  a UUID. **Everything after that lookup still uses the row's own
  `system_id`**, which the pages take off the fetched entity - writes, nested
  `/entries` calls and `franchise_id` / `series_id` / `collection_id` list
  filters all still speak UUIDs. A bare-UUID URL therefore still loads; the
  address bar simply corrects itself.
- **The slug is decorative** - nothing reads it. It is Latin-first
  (`name_en`, then `_roman`, then `_alt`) and **omitted entirely** for an
  entry with only a CJK name, because a CJK slug percent-encodes to mush the
  moment it is copied out of the address bar. Capped at 60 characters on a
  word boundary.
- **`lib/entityPath.js` is the only place allowed to build one.**
  `entityPath(type, entity)` returns `""` when the entity has no `public_id`,
  so a call site must render plain text rather than an empty `to=""`. The
  guard test `src/lib/noUuidLinks.test.js` walks `src/` and fails the build on
  any inline `` `/type/${...}` `` construction.
- **`hooks/useCanonicalPath.js`** rewrites the bar to the canonical path once
  the entity loads - adding a missing slug, replacing a stale one after a
  rename. It uses `navigate(..., { replace: true })`, so the back button still
  leaves the page in one press.

## Adding a media type on the frontend

1. `config/mediaRegistry.js` — add the key (hyphenated), `apiEndpoint`, `navPath`, `statusField`.
2. `config/namingConfigs.js`, `mediaTypeColors.js`, `statusGroups.js` if it needs its own name order, chip key or status group.
3. `pages/library/configs/<type>.jsx` + register in `configs/index.js` — filters, sorts, columns (reuse `libraryColumns`).
4. `pages/detail/<Type>.jsx` (+ `<Type>Notes.jsx`) and the two routes in `App.jsx` (the detail one is `/<type>/:publicId/:slug?`); note sections in `app/utils/note_sections.py`. Give the model a `public_id` and its sequence, add it to the response schema, read the route's `publicId` for the initial fetch only, call `useCanonicalPath(type, data)`, and link to the new type through `entityPath` — the `noUuidLinks` guard fails the build otherwise.
5. `pages/add-tabs/<Type>AddTab.jsx`, `pages/modify-tabs/<Type>ModifyTab.jsx`, entries in `config/adminTabs.js`, `formFactories.js`, `formFields/fieldMeta.js`, `lib/payloads.js`, and the submit/save handlers in `Add.jsx` / `Modify.jsx`. Export the field body from the Add tab and render it from the Modify tab, the way `GameModifyTab` renders `GameAddTab`'s `GameFormBody` and `GameLineageFields` — the comic pair keeps two near-identical files and can drift.
6. `Delete.jsx` `MEDIA_KEYS`, `pages/plan/usePlanData.js`, `pages/statistics/useStatisticsData.js` (+ `StatsCompletions.jsx`, `utils/statsUtils.js`), `Index.jsx` divisions, `Completions.jsx`, `Search.jsx`, `NavSearch.jsx` scopes and quotas, `GroupedEntryPage.jsx` `MEDIA_TYPE_FILTERS`, `navigation.js`, `lib/status.js`, `libraryColumns.jsx`, `planNextGroups.js`, `mediaTypeColors.js`, and `scopeColors.js` plus the three `--c-scope-*` palettes in `index.css`.
7. Backend first: registry spec, pipeline spec, sheet tab — see [../entry-types.md](../entry-types.md).

## Entity components (person, studio and character)

| Component | What it is |
|---|---|
| `forms/PersonSubTabBar.jsx` | The five person types (`PERSON_SUB_TABS`), shared by the admin Modify / Delete pages and by the `/library/person` type filter, so one vocabulary drives all three. It filters a list; the Add page has no list and so no bar, and it never scopes the editor, because a person is one row that may hold several types. |
| `forms/OptionSubTabBar.jsx` | The Options / Tags halves of the System Option tab. People and studios were once entries here. |
| `forms/OptionCategorySelect.jsx` | The Tier 2 category dropdown on all three admin pages — Add's Category field, Modify's and Delete's "select a category" filter. A closed `<select>`, so Add can no longer coin a category by typing one; its `<optgroup>`s come from `groupTier2Categories` (`lib/optionsPageGroups.js`), the same arrangement `/options` reads, and a list yielding one section renders flat. |
| `add-tabs/PersonAddTab.jsx` | Exports `PersonFields` (the editor) and `useRoleScopes` (the legal role → media-type map from `GET /api/person/role-scopes`), both reused by `modify-tabs/PersonModifyTab.jsx`. |
| `info/PersonLinks.jsx` | `creditValue(item, role, legacyValue)` for an InfoCard credit row: links built from `credit_refs` when the entry has them, the legacy comma-joined string when it does not — which is also what a viewer without the Credits permission sees. `creditLabel(item, role, fallback)` takes the heading from the ref, so 原作 / Author / Writer stays owned by `credit_label()` on the backend. |
| `info/StudioLinks.jsx` | The same pair for `studio_refs`, without a role key. Generalised over its detail route rather than copied for the third entity: `StudioLinks` takes a `base` prop (default `/studio`), `studioValue(item)` reads `studio_refs`, and `publisherValue(item)` reads `publisher_refs` with `base="/publisher"`. A game's Production card uses both — Developer through `studioValue` (a developer *is* a studio), the publisher row through `publisherValue`, and the same publisher row now appears on Anime, AnimeMovie, Manga, Novel and Comic. `publisherLabel(item, fallback)` beside them returns `publisher_refs[0].label` — the backend's `credit_label("publisher", media_type)` — so no page hard-codes 台灣代理商 or 發行商; the fallback literal is only reached on an entry with no publisher credited yet. The duplicate `info/PublisherLinks.jsx` was **deleted**: nothing imported it, and a second label mechanism beside this one is how the two drift apart. |
| `forms/PublisherScopePills.jsx` | One row of media-type pills (Anime, Anime Movie, Manga, Novel, Comic, Game) on the Publisher Add and Modify tabs, writing the `scopes` list the POST/PUT body carries. `PersonRoleMatrix`'s shape with no role axis to cross it against — a publisher holds exactly one role. Clicking a held pill removes it; this is the only path that *narrows* a publisher, since credit writes and `POST /api/publisher` are additive. The toggle rebuilds the list in the component's own order rather than appending, so the value posted does not depend on click order. Mirrors `legal_scopes("publisher")` in `app/utils/credit_roles.py`: a seventh media type added there must be added here. |
| `forms/CastEditor.jsx` | The anime/anime-movie/manga/novel Add/Modify cast table. Controlled like `NovelUnitsEditor` — the parent owns `value` and gets every change through `onChange` — and never saves a cast list itself, only searches/creates the two entities its comboboxes reference: a character combobox (debounced `GET /api/character/?name=`, existing matches shown with the entries they already appear in, plus a synthetic "create new character named X" choice — never find-or-create, per Decision G) and a seiyuu combobox (find-or-creates through the existing `ensureSourceValues.js` path, same as every other person field). Renders **without** the seiyuu column on manga/novel (`SEIYUU_MEDIA_TYPES`), mirroring `ck_casting_voice_scope` so the UI cannot offer what the database will reject. One row per casting: character, seiyuu (when shown), a Main/Supporting `role` select, a photo slot, a remark, and drag-to-reorder writing `position`. |
| `hooks/useCasting.js` | TanStack Query hook over `GET /api/casting/{media_type}/{entry_id}`, read by the four ACG detail pages' Cast section. |

Neither entity detail page reuses `MediaCard`: it resolves its title through
`getDisplayName(data, type)` and reads status, franchise and admin props, none
of which the four keys an `/entries` endpoint returns can satisfy — the title
would render blank. Both pages carry a small local card instead.
