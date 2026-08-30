# Admin Pages

Last verified: 2026-08-30 (commit 4339702)

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
movie, TV show, cartoon, manga, novel, comic, quote, meme) and **Structure**
(collection, franchise, series, options). Each tab is a form component in
`pages/add-tabs/`; the page owns the state objects, submit handlers and the
shared modals.

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

**Options tab.** Creates system options (category + value + scopes), people
(with roles/scopes) and studios — see
[../systems/credits-and-tags.md](../systems/credits-and-tags.md).

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

## /defaults (`FormDefaults.jsx`)

One tab per media type (`DefaultsTab.jsx`). Fields come from
`config/formFields/fieldMeta.js` (label, control, option source, `coerce`
rule); values are stored per type via `/api/form-defaults/<type>` and applied
by `useFormDefaults` when an Add form is created. "Reset" deletes the stored
defaults for that type. Note `coerce: "tristate"` is implemented but unused
by any field.

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

## /roles, /users, /content-labels

- **Roles** — create roles, replace their permission set from the catalog
  (`/api/roles/catalog`); the guest role can never receive `admin` (409).
- **Users** — create users with a role, change role, delete; the last
  administrator and your own account are protected.
- **Content Labels** — the label vocabulary; deleting a label immediately
  re-exposes every entry that carried only that label.

Rules and enforcement are in [../authorization.md](../authorization.md). These
three pages have one-click deletes with no confirm dialog.
