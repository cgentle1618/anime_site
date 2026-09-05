# Admin Pages

Last verified: 2026-09-05 (commit aad5a3e)

**What this is for.** Every route behind `ProtectedRoute` (permission `admin`)
in `frontend/src/App.jsx`: what each page loads, what it lets an admin do, and
the rules that are easy to get wrong (cascade deletes, enrichment, form
defaults). Public pages are in [pages.md](pages.md); the shared data layer,
theming and component catalog are in [components.md](components.md); the
server side of every action is in [../api.md](../api.md) and
[../data-actions.md](../data-actions.md).

All admin routes are lazy chunks (loaded on first navigation) and sit under
the `Admin` nav section, which only renders when `useAuth().has("admin")`.

| Route | File | Purpose |
|---|---|---|
| `/system` | `pages/admin/Admin.jsx` | Control Center: pipelines, announcements, review modals |
| `/data-history` | `pages/admin/DataHistory.jsx` | Data-control logs and deleted-record audit |
| `/review-queue` | `pages/admin/ReviewQueue.jsx` | Remarks and duplicate clusters to act on |
| `/add` | `pages/admin/Add.jsx` + `pages/add-tabs/*` | Create entries, groups, options, quotes, memes |
| `/modify` | `pages/admin/Modify.jsx` + `pages/modify-tabs/*` | Edit an existing row (deep link `?id=`) |
| `/delete` | `pages/admin/Delete.jsx` | Delete with cascade / orphan handling |
| `/defaults` | `pages/admin/FormDefaults.jsx` + `pages/defaults-tabs/DefaultsTab.jsx` | Per-type form defaults |
| `/watch-orders` | `pages/admin/WatchOrders.jsx` | Watch-order lists editor |
| `/relations` | `pages/admin/Relations.jsx` | Relations canvas |
| `/options` | `pages/admin/SystemOptions.jsx` | Read-only view of the three option tiers |
| `/roles`, `/users`, `/content-labels` | `pages/admin/{Roles,Users,ContentLabels}.jsx` | RBAC administration |

---

## /system — Control Center (`Admin.jsx`)

- **Pipelines.** Buttons start `POST /api/data-control/fill/<type>`,
  `/replace/<type>`, `/fill/all`, `/replace/all` as Server-Sent Event streams
  (`startStream`). The reader parses `data: {...}` events (`processing`,
  `success`, `error`) into a status line and toasts on completion; **Stop**
  aborts the fetch via an `AbortController`, and the page aborts any running
  stream on unmount. Only one stream runs at a time.
- **Sync actions.** Backup, Pull All, Pull `<tab>`, Calculate All and the
  cover-image maintenance endpoints are plain JSON calls with a busy state.
- **Announcements.** Create / edit / delete the dashboard board
  (`/api/announcements/`; title is the identifier — see api.md).
- **Current season.** Reads and writes `/api/system/config/current_season`
  (`"SPR 2025"` shape; not validated server-side).
- **Remarks / Duplicates modals.** The same views as the Review Queue, opened
  in place. (The Remarks modal's media-type tab list must include every type;
  `ReviewQueue.jsx` is the reference copy.)

## /data-history (`DataHistory.jsx`)

Lists `data_control_logs` (`GET /api/system/logs`) and `deleted_record`
(`GET /api/system/deleted`), each with a per-row delete
(`DELETE /api/system/logs/{id}`, `/deleted/{id}`). Deleted-record rows link
back to the owning franchise/series where the ids still exist.

## /review-queue (`ReviewQueue.jsx`)

- **Remarks section** — `GET /api/data-control/check/remarks`: every entry
  whose remark note is non-empty, grouped by media type, with the remark
  editable in place through `RemarkModal` (PATCH on the entry; the remark is a
  note section, see [../systems/notes.md](../systems/notes.md)).
- **Duplicates section** — `GET /api/data-control/check/duplicates`: clusters
  per type (see `find_all_duplicates` in
  [../business-rules.md](../business-rules.md)) with links to Modify/Delete.

## /add (`Add.jsx`)

A two-level tab bar (`config/adminTabs.js`): **Entries** (anime, anime movie,
movie, TV show, cartoon, manga, novel, comic), **Structure** (collection,
franchise, series, quote, meme, system option) and **Entity** (studio,
person). Each
tab is a form component in `pages/add-tabs/`; the page owns the state objects,
submit handlers and the shared modals.

The **Entity** group holds things that are credited *on* entries rather than
being entries: studios, and the people credited as director, producer,
composer, author or illustrator. Both were sub-tabs of System Options and both
moved out once each became a public entity with pages of its own. They are in
`FORM_TABS`: an entity is not a media entry, but each has an Add form whose
starting values are configurable on `/defaults`. Only options, quote and meme
are excluded — those three have no factory in `config/formFactories.js`.

**Data loaded on mount.** Every list the forms need for ComboBoxes and
duplicate hints — franchises, series, collections, options and all eight
media lists — each with `limit=2000`.

**Form defaults.** A fresh form comes from `freshForm(type)`
(`config/formFactories.js`) merged with the admin's saved defaults
(`hooks/useFormDefaults.js`, `/api/form-defaults/<type>`).

**Autofill search box (anime, anime movie, movie, TV show, cartoon, manga,
novel, comic).** Typing filters the loaded list client-side; picking a row
copies its fields into the form (`lib/autofill.js`, driven by
`config/formFields/fieldMeta.js`). Nothing is fetched from external APIs at
this point.

**Franchise / series pickers.** `ComboBox` over the loaded lists; "create new"
opens `FranchiseCreateModal` / `CreateNewEntityModal`, which POST the group
and select it. `ComboBox.onSelect` receives `(id, label)`.

**Submit.** Validation (at least one name) → `POST` the entry
(`api/endpoints.js resource(type).create()`) → `PUT /api/credits/<type>/<id>`
with the credit/tag fields (`saveCredits`) → `PUT /api/content-labels/entry/…`
if labels were picked → for **anime and anime movie only**, enrichment via
`lib/enrich.js` (`POST /api/data-control/replace/<type>/<id>` then re-read the
entry). The toast says "appended and enriched" only when enrichment
succeeded; otherwise "Saved. Enrichment failed - run Replace later." Movie
and TV Show toasts never claim enrichment (they are not enriched on Add).
Content labels reset only after a successful submit; a validation
early-return or a failed POST keeps the selection. Network failures surface
as an error toast.

**Person tab (Entity).** `PersonAddTab.jsx`. A `PersonSubTabBar` of the five
types (Director, Producer, Music / Composer, Author, Illustrator) sits above
the form: it preselects the type a new person is being added as, and never
narrows what the form edits. `PersonFields` holds the four name fields with a
"Display name" select, the **role × scope matrix**, and gender, rating, photo
key and remark. Ticking a type selects its first legal media type, because a
scopeless role is a 422; the legal types per role come from
`GET /api/person/role-scopes`, so the form cannot offer a pair the API
rejects. Submit is blocked until at least one name is filled, matching
`ck_person_has_a_name`. `POST /api/person/` is find-or-create, like studio.
`PersonFields` is exported so the Modify tab renders the same inputs.

**Options tab.** Two sub-tabs (`OptionSubTabBar`, shared with Modify and
Delete): **Options** and **Tags**, both creating system options (category +
value + scopes). They are the same form posting to the same endpoint; only the
categories the Category box suggests differ (`TAG_CATEGORIES`, see
[../options.md](../options.md)). All three pages now show the same two, so the
Add-only `OPTION_VALUE_SUB_TABS` variant is gone. People and studios are
**not** here — each has its own Entity tab.

**Studio tab (Entity).** `StudioAddTab.jsx`. Four name fields (English,
Chinese, Japanese, Alternative) with a "Display name" select naming which one
to show, plus a rating select over the shared `MY_RATINGS` vocabulary
(S…F, the same one entries use), logo key, country, founded/defunct dates
(`ReleaseDateInput`, so partial precision is allowed), website, MAL id/link
and remark. Submit is blocked client-side until at least one name is filled,
matching `ck_studio_has_a_name` and the schema's 422. `POST /api/studio/` is
find-or-create: posting a name that already exists returns the existing
studio rather than splitting its credits, and leaves its metadata untouched.
`StudioFields` is exported from this file so the Modify tab renders the exact
same inputs.

**Quote / Meme tabs.** `QuoteForm` / `MemeForm` with `QuoteEntryPicker` /
`MemeOwnerPicker` — see [../systems/quotes-memes.md](../systems/quotes-memes.md).

## /modify (`Modify.jsx`)

Same tab bar and the same per-type forms (`pages/modify-tabs/*`), plus
**Fav 3x3** (`Fav3x3ModifyTab.jsx`: the per-type favourite grids stored in
`franchise.type_slots`).

- **Finding a row.** A search box over the loaded list, or a deep link
  `/modify?id=<system_id>[&type=<type>]` used by the dashboard cards and
  detail-page "Quick Edit" buttons. The deep-link effect runs once on mount.
- **Opening a row** seeds the form (`<type>ToForm(...)`), then loads its
  credits/tags (`GET /api/credits/<type>/<id>`) and content labels. A late
  credits response for a row that is no longer open is ignored (request
  counter), and the label picker clears the previous selection before
  fetching, so a slow or failed fetch can never save one entry's credits or
  labels onto another.
- **Save.** `PUT` the entry → `saveCredits` → labels → for **anime, anime
  movie, cartoon and manga**, enrichment via `lib/enrich.js`; the page then
  shows the *enriched* row (not the pre-enrichment one) and warns if
  enrichment failed. Other types save without enrichment.
- **Franchise / Series tabs** also expose the plan-next / rewatch toggles
  (`PlanKindToggles`) and size-group overrides (`SizeGroupControls`).
- **Studio tab (Entity).** `StudioModifyTab.jsx` bypasses the search / open /
  save machinery above, which is shaped around media entries and the grouping
  tiers: it owns its own `useQuery` over `/api/studio/`, its own picker and
  its own `PUT /api/studio/{id}`, rendering `StudioFields` from the Add tab.
  The picker **lists every studio up front** in a grid of display names, the
  way the System Option tab lists a category's values — an admin does not have
  to already know a name to reach the record. The search box filters that grid
  in place over **all four** name fields, not just the one
  `display_name_field` points at, so a studio configured to display its
  English name is still findable by its Japanese one. Opening a studio whose
  `country` is unset seeds the field with **Japan** — the overwhelmingly
  common case here — so saving without touching it records Japan.
- **Person tab (Entity).** `PersonModifyTab.jsx`, self-contained the same way
  over `/api/person/`. A `PersonSubTabBar` picks the role — the analogue of
  the option tab's category — and every person holding it is listed in the
  same grid of display names, filtered in place by the same all-four-names
  search. Above that search sits a row of **scope chips** — the role's legal
  media types, from `/api/person/role-scopes` — which narrow the grid to the
  people holding the role in one of the ticked scopes; the match is OR, so a
  director scoped to `anime` alone still shows under {anime, anime-movie}.
  None ticked means any scope, switching sub-tab clears them, and a role with
  a single legal scope (producer, composer) gets no chip row. The filtering is
  client-side over the `roles` each listed person already carries, not the
  endpoint's single-valued `?scope=`. The form then edits the person's whole
  record, every type they hold and not just the sub-tab's one, because `PUT` replaces the role set
  wholesale.

## /delete (`Delete.jsx`)

Loads every list with `limit=2000` (the API default of 500 would silently
truncate the search and the checks below). For a selected row it shows a
confirmation modal with the consequences:

| Deleting | What is offered |
|---|---|
| Collection | Never cascades; member franchises become uncollected. |
| Franchise | **Cascade** (checkbox): deletes every series and every media entry of *every* type under it (`deleteChildren("franchise_id", id)`), or leaves them with `franchise_id = NULL` if unchecked. |
| Series | Cascade over every media type holding that `series_id`. |
| Any media entry | **Orphan series** offer when it is the last entry of any type in its series; **orphan franchise** offer when it is the last entry of any type in the franchise and the franchise has no (remaining) series. |

Counts are computed across all eight media types (`entriesIn`,
`standaloneEntriesIn`). Deletion order is children first, then the row, then
any orphaned parents the admin ticked. Every delete goes through the type's
`DELETE` endpoint, which also removes cover images, plan rows, credit links and
writes a `deleted_record`.

**Person tab (Entity).** A `PersonSubTabBar` filters the picker to the people
holding one type, then the selected person's whole record is edited through
`PersonFields` — every type they hold, not just the sub-tab's one, because
`PUT` replaces the role set wholesale. The picker searches all four name
columns, not just the displayed one. The panel mirrors the studio one below:
credit count, a warning that `media_credit.person_id` is `ON DELETE CASCADE`,
**Merge Into Another Person** offered before Delete, and the confirmed credit
count sent as `?credits=N` so a count that moved while the dialog was open
comes back as a 409 rather than a silent over-deletion.

**Studio tab (Entity).** A picker over `/api/studio/` showing each studio's
display name, id and credit count, then a warning that says exactly what
deleting costs: `media_credit.studio_id` is `ON DELETE CASCADE`, so deleting
destroys this studio's *n* credits on every entry linked to it. The panel
therefore offers **Merge Into Another Studio** beside Delete — merge
(`POST /api/studio/{keep}/merge` with the selected studio as `source_id`)
repoints the credits onto the survivor first, and is the correct fix for a
duplicate. Delete itself is two-step (confirm, then execute) and writes no
`deleted_record`.

## /defaults (`FormDefaults.jsx`)

One tab per `FORM_TABS` entry (`DefaultsTab.jsx`) — every media type, the
three grouping tiers, and the three Entity tabs. Fields come from
`config/formFields/fieldMeta.js` (label, control, option source, `coerce`
rule); values are stored per type via `/api/form-defaults/<type>` and applied
by `useFormDefaults` when an Add form is created. "Reset" deletes the stored
defaults for that type. Note `coerce: "tristate"` is implemented but unused
by any field.

The Entity tabs (studio, person, character) are defaults-only: their Add forms
have no "auto-fill from an existing record" search, so every one of their
fields is `autofillable: false` and `DefaultsTab` drops the auto-fill column
for them entirely.

## /watch-orders (`WatchOrders.jsx`)

Lists every watch-order list (`GET /api/watch-order/lists`, with the
`auto=exclude|only` filter for generated Release Orders), opens
`WatchOrderEditor` for items, sections and reordering, and can duplicate or
delete lists. Details in [../systems/watch-orders.md](../systems/watch-orders.md).

## /relations (`Relations.jsx`)

Picks a lens (franchise, collection or series) and renders `RelationGraph`
(`GET /api/media-relation/graph`), with drag-to-connect, the edge inspector,
undo and scope reset. Details in [../systems/relations.md](../systems/relations.md).

## /options (`SystemOptions.jsx`)

Read-only: Tier 1 enums from `/api/constants`, Tier 2 options grouped by
category with their scopes, Tier 3 people and studios. Editing happens on
Add/Modify (Options tab) — see [../options.md](../options.md).

Tier 1 is not one alphabetical wall: `lib/enumGroups.js` sorts the served keys
into named groups (Airing Type holds anime + cartoon, Region holds tv + manga +
novel, and so on), with everything unclaimed under a final **Other**. A group
whose keys the endpoint no longer serves in pairs is demoted into Other rather
than printed as a heading over one card, and the left-hand section index nests
the same two levels, so index and page can never disagree. Grouping is
presentation only — nothing reads it but this page.

## /roles, /users, /content-labels

- **Roles** — create roles, replace their permission set from the catalog
  (`/api/roles/catalog`); the guest role can never receive `admin` (409).
- **Users** — create users with a role, change role, delete; the last
  administrator and your own account are protected.
- **Content Labels** — the label vocabulary; deleting a label immediately
  re-exposes every entry that carried only that label.

Rules and enforcement are in [../authorization.md](../authorization.md). These
three pages have one-click deletes with no confirm dialog.
