# Image upload — design

Last verified: 2026-09-13
Status: **SHIPPED** — `ab822576..873148a7` on `feat/image-upload`. Design
approved by the owner in four sections (data model, endpoints, UI,
testing/sequencing) on 2026-09-12. Branch `feat/image-upload`, worktree
`../anime_site_image_upload`, database `anime_site_image_upload`.

## The problem

Every image this application holds arrived by **download from somebody else's
server**. `download_cover_image` in `app/services/integrations/image_manager.py`
takes a URL, fetches the bytes and writes them to
`static/covers/<owner_type>/<system_id>.jpg`. There is no `UploadFile` anywhere
in `app/` and no multipart endpoint. An image that MAL, TMDB, OMDb, Comic Vine
or Open Library does not have is an image this application cannot have.

That gap shows up in three places today:

1. **Entries no external API covers.** A niche novel, a self-published comic, a
   personal collection entry — the entry exists, the cover does not, and
   `download-missing-covers` will never find one.
2. **Wrong or ugly covers.** When MAL's art is a poor choice there is no way to
   replace it. The file is keyed by system id, so the only "fix" available is
   to overwrite it on disk by hand.
3. **Quote and meme images, which were built assuming uploads existed.**
   `quote.image_file` takes a bare filename resolved against `static/quotes/`,
   and `QuoteForm.jsx` / `MemeForm.jsx` hide the image controls off localhost
   because there is no way to get a file there except copying it into the
   folder yourself. `app/main.py` creates `static/quotes/` and says so in a
   comment: "a deliberate hold to revisit".

## What this is not

- **Not a sync mechanism.** Uploaded images do not travel between the company
  and home machines. See Decision 4 — this is an explicit decision, not an
  oversight, and the UI names the resulting state rather than trying to repair
  it.
- **Not a replacement for the download pipelines.** `download-missing-covers`
  and the autofill paths stay exactly as they are. Upload is an additional
  source, not a substitute.
- **Not the full expand/contract.** This work is phase 1 only: the new tables
  become the truth, and `cover_image_file` is kept written-through so that
  every existing reader — Sheets, the formatters, the frontend — is untouched.
  Phases 2 and 3 are scheduled on the roadmap, not done here. See Decision 3.
- **Not object storage.** Files stay on local disk under `static/`, as they are
  now. Self-hosting may revisit this; nothing here forecloses it, because
  `image.storage_key` is the only place a path is spelled out.

## Decisions

### Decision 1 — a two-table media library, not a per-row file path

The industry-standard shape for this is Rails ActiveStorage's, and WordPress
and Django land in the same place: a **blob** table holding one row per stored
file, and a **polymorphic attachment** table joining blobs to the records that
use them.

**`image`** — one row per stored file:

| Column | Notes |
|---|---|
| `system_id` | UUID PK, as every table here uses |
| `storage_key` | `library/<checksum>.jpg`. The only spelled-out path |
| `checksum` | sha256 of the **normalized** bytes. Unique — this is the dedup |
| `original_filename` | What the uploader called it. Display and search only |
| `byte_size`, `width`, `height` | Recorded at upload; drives the grid and the "too small" warning |
| `uploaded_by` | FK to the user. Also how an upload is distinguished from a download — see Decision 5 |
| `uploaded_at` | |

**`image_attachment`** — the polymorphic join:

| Column | Notes |
|---|---|
| `image_id` | FK, `ON DELETE CASCADE` |
| `owner_type` | A plain string (`anime`, `anime-movie`, `staff`, `quote`). A new owner type costs a string, not a migration |
| `owner_id` | UUID. Deliberately **not** a FK — no single table to point at |
| `role` | `cover`, `portrait`, `quote`. What this image is *for* |
| `position` | For the future multi-image case; always 0 today |

Unique on `(owner_type, owner_id, role, position)`.

**Why this and not the cheaper option.** Today the path *is* the identity:
`anime/<id>.jpg`. That makes one image per row a structural limit rather than a
choice, makes a new owner type a code change in `COVER_OWNERS`, and — the
concrete bug it would have caused — makes **replacing** an image serve the old
one from browser cache, because the URL does not change. Content-addressed
storage means a replaced image is a new key, so that bug is never written.

`owner_id` not being a foreign key is a real cost, accepted knowingly: nothing
in the database stops an attachment outliving its owner. The `unused` filter on
the manager page and the existing orphan tooling are what find those. The
alternative — ten nullable FK columns — is worse in every other respect.

### Decision 2 — normalize to JPEG on the way in, with a thumbnail

Accept PNG, WebP and JPEG. Re-encode every upload to JPEG, capped at 2000px on
the long edge, and generate a 400px thumbnail for the manager grid.

**The re-encode is the security control, not a format preference.** Validation
runs in this order, each step assuming the last one passed:

1. **Size cap before the body is read.** `Content-Length` is checked first, then
   a streaming cap while reading — `Content-Length` is a claim from the client
   and cannot be the only check. New setting `MAX_IMAGE_UPLOAD_MB` in
   `app/config.py`, default 10.
2. **Sniff the bytes.** `Image.open` + `verify()` decides what the file is. The
   filename extension and the multipart `Content-Type` are both attacker-
   controlled and are used for nothing.
3. **Re-encode.** This strips EXIF (including GPS coordinates, which a phone
   screenshot carries) and cannot preserve a payload hidden in a container
   segment the decoder skipped.
4. **Checksum the normalized bytes**, not the upload. Because the re-encode is
   deterministic, one file uploaded twice is one `image` row, and so is one set
   of pixels arriving in two lossless containers (PNG and lossless WebP).

   **Correction, found while implementing.** This section first claimed that
   the same picture arriving once as PNG and once as JPEG dedups to a single
   row. It does not, and cannot: a JPEG is lossy, so it decodes to different
   pixels than the PNG it was made from — a flat `(200, 30, 30)` comes back
   `(202, 30, 30)` — and re-encoding two different pixel buffers cannot yield
   identical bytes. Content addressing dedups identical *pixels*, never
   "the same picture"; nothing short of perceptual hashing does the latter, and
   that is not in scope. `test_a_lossy_jpeg_source_does_not_dedup_against_its_png_original`
   pins the real behaviour so the claim cannot come back.

This adds **Pillow** to `requirements.txt` — the first image library in the
backend. There is no reasonable alternative for step 3.

### Decision 3 — expand/contract, and this work is the expand

`cover_image_file` exists on ten tables and is read by the formatters, the
Sheets pipelines, the download actions, the orphan checks and most of the
frontend. Replacing it in one change would touch all of them at once.

The standard migration for this is **Parallel Change (expand/contract)**:

1. **Expand — this work.** Add the tables, backfill from the existing columns,
   and **dual-write**: every path that sets a cover writes both the attachment
   and `cover_image_file`. Nothing reads the new tables except the new page.
   Behaviour-neutral for every existing reader.
2. **Migrate readers — later.** Move the formatters, the pipelines, the orphan
   checks and the frontend onto attachments, one reader at a time.
3. **Contract — later.** Drop `cover_image_file`.

**What makes phase 1 honest rather than a permanent fudge is that phase 3 is
written down.** A dual-write nobody plans to end is how a codebase acquires two
parallel systems forever.

**Phase 3 has a gate that is not code.** `cover_image_file` is a **Google
Sheets column** — `app/utils/formatter.py` reads it at ten call sites, and the
sheet holds exactly one version of the data. Dropping the column changes the
backup format on the only channel by which the two machines exchange data. So
phase 3 is gated on a Sheets migration story and may reasonably sit longer than
an expand/contract usually would. Recorded on the roadmap with that reason
attached, so a later reader does not mistake the delay for neglect.

**The backfill keeps each legacy image's existing `<owner_type>/<system_id>`
path rather than re-keying it to a checksum.** Re-keying would disclose
nothing new: `system_id` is a required field on every entity response schema,
belongs to no field group, and so is never stripped by `field_gate.py` —
every detail page already fires `GET /api/community/<system_id>` and the id
is visible regardless of what the image's filename is. Re-keying legacy
covers to content-addressed paths is out of scope for the expand phase; it is
a phase 2/3 concern, if it is done at all.

### Decision 4 — uploaded images never travel through Backup or Pull

Decided by the owner. Sheets carries the *reference*, never the bytes, and
nothing here changes that.

The consequence is specific and must be designed for rather than papered over:
a downloaded cover survives a machine switch because
`bulk_download_missing_covers` can re-fetch it from MAL. **An uploaded image
cannot be re-fetched by anything.** After a switch, every uploaded image on the
other machine is a reference with no bytes.

So "missing" becomes a **normal state**, not corruption:

- The manager page has a `missing` filter that names it plainly.
- Nothing offers to "repair" it by nulling the reference.
- `getCoverUrl`'s existing `FALLBACK_SVG` already renders it harmlessly.

### Decision 5 — `bulk_download_missing_covers` must skip uploaded images

This is the defect the feature introduces into existing code, and the reason
`image.uploaded_by` exists rather than just the bytes.

`bulk_download_missing_covers` in `app/services/calculation.py` collects rows
whose file is absent, sets `cover_image_file = None`, and calls the autofill to
re-fetch from MAL. Against a downloaded cover that is correct and idempotent.
Against an **uploaded** image on a machine that does not have the file — which
Decision 4 guarantees will happen — it **destroys the only reference to a file
no API can supply**, and reports success.

The guard: a row whose `cover` attachment points at an `image` with
`uploaded_by` set is skipped and counted separately. A failing test for this is
written **first**.

### Decision 6 — `manage.catalog`, and the content-label gate too

Uploading and attaching are catalog editing, so the gate is
`require_manage_catalog` from `app/services/rbac/resolver.py` — the dependency
`announcements.py` and `casting.py` already use. The destructive bulk
operations stay behind `manage.pipelines` with the other data actions.

**The permission check is not sufficient on its own.** `_resolve_entry` in
`app/routers/casting.py` documents the trap: a holder of `manage.catalog` who
lacks an entry's restriction label could otherwise write to an entry it cannot
read. Attaching a cover is a write. So `attach` calls `entry_visible` and
returns the same 404 a genuinely missing entry gets.

Per CLAUDE.md: **the refusal test needs a non-empty label fixture or it passes
vacuously.** A fresh test database has no content labels, so the gate has
nothing to refuse and the test is green from day one, through the change that
breaks it, forever. The fixture that makes it bite is load-bearing and looks
like decoration. The mirror case — same fixture, viewer holding the label,
attach succeeds — is asserted alongside it, so a green proves the gate did the
refusing rather than something incidental.

### Decision 7 — `owner_type` is validated against the registry

Media types come from `MEDIA_TABLES` so the hyphen/underscore split stays in
one place; the entity owners are declared beside them.

Note the real shape rather than the uniform one: `COVER_OWNERS` in
`image_manager.py` is `MEDIA_TYPE_KEYS` **plus four hand-listed tables**
(`staff`, `character`, `publisher`, `studio`), and the media keys are
hyphenated (`anime-movie`) while the registry's router keys are not
(`anime_movie`). `quote` is in neither set and is added by this work.

## Endpoints

A new `app/routers/images.py` at `/api/images`, all behind
`require_manage_catalog`.

| Route | Behaviour |
|---|---|
| `POST /api/images` | multipart upload → validate → normalize → store → return the `image` row. **Upload attaches nothing** |
| `GET /api/images` | the library, paginated. `?unused=true`, `?missing=true`, `?duplicates=true`, `?q=` on original filename |
| `POST /api/images/{id}/attach` | body `{owner_type, owner_id, role}`. Idempotent per `(owner, role)` — re-attaching replaces |
| `DELETE /api/images/{id}/attach/{attachment_id}` | detach; the file stays in the library |
| `DELETE /api/images/{id}` | delete file and attachments. Refuses while attached unless `?force=true` |

Upload and attach are separate calls because they are separate concerns: an
image can be uploaded to the library with no owner in mind, and an existing
image can be attached to a second owner without re-uploading. The picker widget
simply makes both calls in sequence.

## UI

**`/images`** — `frontend/src/pages/admin/Images.jsx`, in the `manage.catalog`
nav group beside Add and Modify.

- Thumbnail grid, paginated, with a multi-file drop zone. Each tile shows what
  it is attached to, or "unused".
- Three filters answering the three real questions: **unused** (attached to
  nothing), **missing** (a row points at a file not on this disk — see Decision
  4), **duplicates** (same checksum; should always be empty once dedup works,
  and exists to prove it).

**`<ImagePicker>`** — replaces the filename text input on the entry, staff,
character, quote and meme forms. Shows the current thumbnail, an *Upload*
button and a *Choose from library* modal. This retires the off-localhost hold
in `QuoteForm.jsx` and `MemeForm.jsx` and the matching comment in
`app/main.py`.

**Both surfaces register in two places.** `App.jsx`'s `<ProtectedRoute
permission="manage.catalog">` block **and**
`frontend/src/config/navigation.js`, which calls `has()` separately. These are
independent permission surfaces; changing one half-ships the page.

Colours come from the semantic tokens. `src/theme-tokens.test.js` fails the
build on a hard-coded grey.

## Testing

- **Upload validation** — a zip renamed `.jpg` is rejected at the sniff step;
  an oversized file is rejected without being read into memory; EXIF is absent
  after re-encode; one file uploaded twice yields one `image` row, as do the same pixels in
  two lossless containers — and a lossy JPEG of the same picture deliberately
  does not.
- **The label gate** — refusal *and* its mirror, both with the non-empty label
  fixture of Decision 6.
- **The dual-write invariant** — after attach, `cover_image_file` and the
  attachment agree. This protects the entire premise of phase 1.
- **`bulk_download_missing_covers` skips uploads** — Decision 5, written first
  and failing.
- **Frontend** — vitest on `<ImagePicker>`; `npm run build` after any change.

The backend suite is ~5.5 minutes and a backend change needs at least two runs,
so this is a multi-session feature. One pytest at a time across every tree,
under the lock; this tree's database is `anime_site_image_upload`.

## Sequencing

Four commits on `feat/image-upload`, each independently revertable. One branch,
one PR — not a stack.

1. Migration, models, `image_service` (storage, checksum, normalize). No routes.
2. The router, validation, the label gate, the Decision 5 guard.
3. Backfill migration and dual-write from the existing cover paths.
4. Frontend: the page, the picker, route and nav registration, `npm run build`.

## Open questions

None blocking. The one deliberately deferred item is **how uploaded images
eventually survive a machine switch** — Decision 4 settles that they do not
today, and self-hosting (`docs/deployment-selfhost.md`) is where a single
runtime makes the question disappear rather than needing an answer.

## Post-mortem: what this spec got wrong

Three things, found during implementation rather than review:

1. **Decision 2's cross-format dedup claim was wrong and impossible.** The
   original text claimed the same picture arriving once as PNG and once as
   JPEG would dedup to one row. It cannot: JPEG is lossy, so it decodes to
   different pixels than the PNG it came from, and re-encoding two different
   pixel buffers cannot produce identical bytes. Corrected in place in
   Decision 2 above; the real contract is that identical pixels dedup and
   "the same picture" does not.
2. **The storage root this spec implied — under `static/covers/` so
   `getCoverUrl` needed no change — was overruled by the owner during
   implementation.** Nothing here stated the root explicitly, but the plan
   built from this spec assumed `static/covers/library/` on exactly that
   reasoning, and the owner rejected it: uploaded images are library images,
   not covers, and do not belong in the cover tree. The root is `static/`
   directly (`storage_key` values are unchanged, `library/<checksum>.jpg`),
   and `getCoverUrl` / `getQuoteImageUrl` both gained a `library/` branch
   rather than resolving it for free.
3. **Decision 7 and the endpoints section never listed `meme` as an
   attachable owner**, despite "Quote and meme images" naming the problem
   this feature solves in the opening paragraph. The omission shipped as a
   400 on every meme attach and was caught and fixed after Task 4 landed,
   not before.
