# Authorization redesign — design (DRAFT, brainstorm in progress)

Status: **DONE.** Every phase has shipped: 0, A, A.1, B, C and D. The last
task, the mode switcher control, landed 2026-09-12 in `3ec6a0f`. Brainstormed on
2026-09-10 (home), stopped at an environment switch, resumed and finished
2026-09-11 (company). All six sections are written and approved, and the last
open decision (14, pipelines and the object axis) was settled on 2026-09-11 —
see "Decision 14 in detail". Phase B shipped on 2026-09-12 carrying decisions 12, 13 and 14; Phase D
shipped the same day, 10 of its 11 tasks. `docs/PROGRESS.md` carries the live
status and the handover note for the one remaining task.

Read first: [authorization.md](../../authorization.md#what-the-redesign-inherits)
— the four gates that already exist, the rules not to break, and the lessons
from making the system multi-user.

> **Naming note (2026-09-11).** What this document called a *view mode* through
> its first three sections is now an **access mode**. The rename is not
> cosmetic: once a mode governs what you may rate and edit as well as what you
> may read (decision 9), "view" would actively mislead a reader into assuming
> writes bypass it — which is the precise assumption that produces the
> vulnerability class in "Defects this redesign must fix" below.

## The problem

The site knows two kinds of visitor with any real power: `guest` and `admin`,
and `admin` is one permission guarding **89** route dependencies across **27**
routers (counted 2026-09-11) while the `admin` role is `is_superuser=True` and
therefore holds every permission implicitly — including every content label.
One person owns the installation and uses the `admin` account for everything.

Wanted instead:

- **admin** — the owner's account. Everything, including authorization.
- **super** — everything except authorization; the shape a second person takes.
- **user** — an ordinary account: own list, own personal notes.
- **guest** — unchanged.

and, orthogonally, **access modes** on an account — four are seeded
(`unrestricted`, `borderline`, `normal`, `safe`) and an admin may create more —
chosen per session. An account holds one role and one *or more* access modes.

## Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | Is `admin` a separate login or a capability of the super account? | **REVISED 2026-09-11: `admin` is a superset.** It holds `admin.authz` *and* both `manage.*` permissions, and stays the owner's daily account. `super` is "admin minus the ability to change who may do what", and is the shape a second person takes. The original decision — a break-glass admin that could not touch the catalogue — was rejected as more friction than the risk warranted: it put a password prompt in the middle of any task that turned out to need both axes. The consequence accepted with it: the account in daily use can regrant itself anything, so a compromised daily session is a total compromise |
| 2 | What differs between the access modes? | **RESTATED 2026-09-11.** A mode never changes which *kinds* of operation an account may perform — it never removes `manage.catalog` or `self.list`. It changes **which objects those operations can reach**. It scopes two vocabularies: content labels (whether an entry exists for you at all) and field groups (which columns of a reachable entry you see). The earlier wording, "sight only, never writes", was wrong in its second half — see decision 9 |
| 3 | How is a mode switched? | **Free toggle, re-auth to widen.** Narrowing is instant; widening asks for the password again. So a browser left logged in at `safe` is actually safe |
| 4 | Who has modes? | **General — any account may hold several, including the admin account.** A newly created account holds **`safe` only**, by default |
| 5 | Structure for the access-mode axis | **Its own tables** (option B of three). **AMENDED 2026-09-11:** five tables, not three, because a mode carries field groups as well as labels — see section 2. Two *typed* link tables rather than one generic `access_mode_grant(permission text)`: neither has a column in which `manage.catalog` or `admin.authz` could be stored, so "a mode scopes objects, it never grants powers" stays a schema guarantee rather than a review rule. The role machinery keeps its current meaning and all its guards |
| 6 | What access mode does a logged-out guest resolve to? | **A real mode, flagged `is_guest_default`**, seeded on `safe`. Rejected: hardcoding guests to the empty set, which would make the anonymous policy the one access decision in this codebase that is not data an admin edits. Rejected: resolving the literal key `safe`, which silently republishes to the internet whenever you edit that mode for yourself. A partial unique index enforces at-most-one flagged mode; the resolver falls back to the **empty set** when none is flagged, so the failure mode is closed |
| 7 | Which mode does a session start in? | **The account's chosen default** (`is_default` on `user_access_mode`). You just typed your password to log in, so landing wide is not a new grant. Rejected: always landing narrowest, which would make the widening prompt routine — and a prompt typed through by reflex has stopped being a control |
| 8 | Can a per-account adjustment ADD to a mode, or only remove? | **Only remove — a mode is a ceiling.** An account's reach is always a subset of its mode's. So a mode name on the user list is a trustworthy upper bound, and widening a mode later reaches everyone not explicitly narrowed. To let one person reach more, assign a wider mode and deny the specific items (or create a mode, if it is policy you will reuse) |
| 9 | Does a mode bind writes, or only reads? | **NEW 2026-09-11: writes follow reads, against the ACTIVE mode.** If `GET` answers 404 for you, every write to that id answers 404 too. Rejected: binding writes to the account's *ceiling* (the union of its modes), which would have the server 404 a `GET` and then accept a `PUT` for that same id. The industry precedent is uniform — Postgres RLS applies one `USING` clause to `SELECT` and `UPDATE` alike; AWS session policies and OAuth scopes narrow a session for every operation, not just reads; OWASP ranks the inverse as API1:2023, Broken Object Level Authorization. The same guard also enforces `media_type.*`, because `entry_visible` already checks both and calling it is less work than not |
| 10 | May a pipeline rewrite authorization data? | **NO — three tabs need `admin.authz`.** Pull All restores `Users` (including each account's role), `Content Label` and `Media Content Label`. Since the sheet is editable by anyone with Google access, a `super` could type `admin` into the Users tab and Pull themselves a promotion — escalation without ever holding `admin.authz`. Decided 2026-09-11: those three tabs are **skipped and reported** when the caller lacks `admin.authz`; every other tab restores as normal, and `super` keeps both Backup and Pull All. Rejected: requiring `admin.authz` for the whole pipeline, which would stop a helper restoring the catalogue after a bad import and remove most of the reason `manage.pipelines` is a separate permission. Note the direction: **Backup** (local → sheet) is not an escalation path and is unrestricted; only **Pull** (sheet → local) writes authorization data into the live database |
| 11 | Does `field_group.personal_notes` gate anything real? | **YES — the question was stale, and is closed 2026-09-11.** It was recorded as gating "a query parameter and nothing on any response". It gates a response: the group declares `note_sections=("personal_reviews",)` (`field_groups.py:134-140`) and `gated_note_sections` (`field_gate.py:118-131`) withholds that section from every row the viewer did not author. The label "Personal Reviews" names the section it actually gates, so that half of the complaint is answered too. Step 5 made this true and nobody struck the row. The one live remnant is whether the group should also cover `remark`, which is decision 12's business |
| 12 | How does `remark` become per-viewer? | **In Phase B, and in ONE commit.** `remark` is a class-level `column_property` (`app/models/__init__.py:113-133`), and a scalar subquery cannot know who is asking, so it cannot filter on `note.author_id`. Two changes must land together: serve `remark` from a per-request read filtered by author, and relax `ix_note_one_remark_per_owner` (`m5b1notefks`) from per-owner to per-owner-per-author. Doing only the second is worse than doing neither — today a second account's remark is refused loudly by the database, and after a half-fix it would be accepted and then invisible, which is a data-loss shape rather than a limitation. Folded into Phase B rather than run as its own task because a per-viewer read is exactly what Phase B is already building |
| 13 | 401, 403 or 404? | **Two answers, and 403 disappears.** `401` means *you may not do this kind of thing* — a capability failure, matching what `require_permission` already returns and the one error shape the SPA knows. `404` means *this object is not yours to see* — the object axis, and the same not-found message a genuinely absent row gets. All five 403s live in `note.py`: lines 178 and 183 (lacking `self.personal_notes` or the catalogue write) become 401; lines 195, 199 and 285 (somebody else's note, and "that user's notes are not public") become 404, because a 403 confirms the row exists exactly as surely as a 200 does — the argument Phase C spent nine commits on. Decided 2026-09-11; not yet implemented |
| 14 | What does the object axis mean for `manage.pipelines`? | **DECIDED 2026-09-11: unscoped, and only runnable from an unscoped session.** A pipeline rewrites entries with no visibility test: Pull All overwrites every table, Replace All streams every entry's `display_name`, and Replace-one (`data_control.py:105-112`) answers 404 for a missing entry but 200 with its title for a hidden one. The permission is therefore declared **unscoped on the object axis** — a pipeline sees and rewrites everything, and its blast radius equals `admin.authz`. What stops that being merely a trust assertion is a session-level rule: **the pipeline routes require the active mode to be unscoped**, meaning it carries every `content_label` row and every `FIELD_GROUP_KEYS` entry. Computed, never a named mode, so adding a label later cannot silently widen the set that qualifies. Rejected: **B, scope the runner** — the sheet holds exactly one version of the data and Backup overwrites every tab, so a per-viewer filter would have a Backup run from a narrowed session write a *partial* sheet over the complete one and a Pull All restore a partial database, turning an information leak into silent data loss. Rejected: **C, leave it undeclared**, the status quo that let the Replace-one route go unnoticed. Rejected: the original A's grant-time rule ("never paired with a restricted mode"), which is awkward against an account that holds several modes and switches per session, and which a later grant could violate without any request being made. See "Decision 14 in detail" below |

### The shape those decisions imply

**Two axes, and they answer different questions.** The **role** answers *what
kinds of operation may this account perform* — read, edit the catalogue, run a
pipeline, change authorization. The **access mode** answers *which objects can
those operations reach* in this session. They must not be one knob: if they
were, dropping to `safe` would also drop the `admin` grant, contradicting
decision 2.

**Object-scoping vocabulary leaves the role axis entirely.** `label.<key>` and
`field_group.<key>` stop being grantable to a role and become exclusively what
an access mode carries. This is what makes "the admin account can sit in
`safe`" work at all, and it is the single largest change to the existing model.
Every viewer — guest included — therefore resolves an access mode as well as a
role.

Field groups *must* move, not merely may: permission resolution is a union, and
a union can only add. If `field_group.sources_restricted` stayed grantable on a
role, no mode could ever take it away, and the narrow tiers would be
unbuildable.

**Effective access = (the role's permissions) applied to (the active mode's
object set).** The two sides are disjoint by construction — the role axis holds
`admin.*`, `manage.*`, `media_type.*` and `self.*`; the mode axis holds labels
and field groups. Neither can express the other.

**`media_type.*` stays on the role axis**, the one arguable boundary. "May I
see Games" is object-shaped, but it says what an account is *for* rather than
how careful this session is being, and it is the axis the existing open item
about guests and Games already lives on. Note that decision 9 makes it *also*
enforced on writes, which it is not today.

## Defects this redesign must fix

Found while designing, both exploitable independent of any of this. They are
listed here so the implementation plan carries them as tasks rather than
discovering them again.

**1. `PUT /me/list/{media_id}` performs no object-level check. FIXED 2026-09-11 (Phase 0).** `me_list.py`'s
`_media_or_404` (line 56) resolves the entry with a bare
`db.get(models.Media, media_id)` and never calls `entry_visible`. Any account
holding `self.list` can therefore set a status, rating and progress on an entry
it cannot see — one carrying a label it lacks, or a Game when it holds no
`media_type.game` — provided it knows the uuid. This is OWASP API1:2023 exactly,
and decision 9 is the rule that closes it. `read_my_list_row` on the same router
needs the same guard; it returns only the caller's own row, but it still
confirms whether a `media_id` exists.

**2. Reads are otherwise genuinely enforced**, and this was verified rather than
assumed: the detail route 404s at `_factory.py:79` with a message deliberately
identical to a real not-found, list queries carry the anti-join, and
`search.py`, `profile.py`, `quote.py`, `note.py`, `casting.py`, `credits.py`
and `media_relation.py` all guard. The gate is not frontend hiding.

**3. One part of the field-group gate is cosmetic by design, and must stay
documented as such.** Real columns are stripped from a *copy* of the response
(nulling the live ORM instance would flush the blank to disk), note sections
are filtered in `note.py`, source buckets are filtered before the response is
composed — all server-side. But `ui_block` is presentation only, and
`field_groups.py` says so outright: *"This is presentation, never a gate."*
`system_info` withholds its timestamps for real and hides the spine id
cosmetically, because that id is the page's own URL.

## Section 1 — the capability axis (APPROVED 2026-09-11)

`admin` splits into three named permissions, drawn on the routers that exist:

| Permission | Guards | admin | super | user | guest |
|---|---|:-:|:-:|:-:|:-:|
| `admin.authz` | `roles.py`, `users.py`, `content_labels.py`, and the new access-mode routes | yes | — | — | — |
| `manage.catalog` | everything else currently admin-gated: entry CRUD via `_factory.py`, the three tiers, person/studio/publisher/character/casting, credits, options, relations, watch orders, announcements, quotes/memes, catalogue notes, `constants`, `form_defaults` | yes | yes | — | — |
| `manage.pipelines` | `system.py`, `data_control.py` — Backup, Pull All, Fill, Replace, Calculate | yes | yes | — | — |

Splitting pipelines out of catalogue is nearly free — two routers, one
dependency each — and buys a real distinction: a helper account can fix a typo
on an entry without being able to overwrite the entire database with a Pull
All. That blast radius is not hypothetical; a Pull All silently rolled back a
whole tab on 2026-09-11 (`709f9f00`).

`user` holds `self.*` plus reads; `guest` holds reads. Both unchanged.

### `is_superuser` survives, narrowed

The 2026-09-10 draft retired `is_superuser` outright, because an implicit
"holds every permission" defeats decision 4 — an admin could never sit in
`safe`. Decision 1's reversal makes a narrower change correct instead.

`is_superuser` keeps meaning **"holds every capability permission"**. It is
read at 22 sites across 8 files (counted 2026-09-11), and almost all of them
stay exactly as they are: 6 short-circuits in `enforcement.py`, plus
`field_gate.py`, the two domain services (`media_relation.py:330`,
`watch_order.py:212`), `note.py:168`'s author-or-superuser check, `roles.py`,
`users.py`, `seed.py` and `auth.py:105`.

What changes is that **`label.<key>` and `field_group.<key>` stop being
permissions at all**. They leave the role axis (decision 5), so
`is_superuser`'s short-circuit cannot reach them by construction — the axis
independence decision 2 asks for becomes a property of the schema rather than a
rule a reviewer has to remember.

The real edits are `hidden_label_ids`, `field_gate._withheld` and the
`entry_visible` / `filter_visible_pairs` short-circuits, which must consult the
active mode instead of `viewer.is_superuser`. Roughly 4 sites rather than 22.

### Consequences named

- The SPA's `is_admin` flag from `/api/auth/me` has to become something finer.
  Section 4 settles how. This is the same code that closes carried-in question 2.
- `plan_next.py` has three writes still gated on `get_current_admin` that are
  per-user data (lines 145, 195, 224 — verified 2026-09-11; each already takes
  `get_current_user_id` alongside). They drop the admin gate: a small bug fix
  riding along.

## Section 2 — the access-mode axis (APPROVED 2026-09-11)

### Schema

```sql
access_mode              system_id · key · label · description · sort_order
                         is_system · is_guest_default · created_at · updated_at
  UNIQUE (key)
  UNIQUE INDEX ix_one_guest_default_access_mode ON ((true)) WHERE is_guest_default

access_mode_label        system_id · mode_id → access_mode · label_id → content_label
  UNIQUE (mode_id, label_id)                 both FKs ON DELETE CASCADE

access_mode_field_group  system_id · mode_id → access_mode · field_group_key
  UNIQUE (mode_id, field_group_key)          key validated against FIELD_GROUP_KEYS

user_access_mode         system_id · user_id → users · mode_id → access_mode · is_default
  UNIQUE (user_id, mode_id)                  both FKs ON DELETE CASCADE
  UNIQUE INDEX ix_one_default_mode_per_user ON (user_id) WHERE is_default

user_access_mode_denial  system_id · user_access_mode_id → user_access_mode
                         label_id → content_label NULL · field_group_key NULL
  CHECK (exactly one of label_id / field_group_key is set)
  UNIQUE (user_access_mode_id, label_id)
  UNIQUE (user_access_mode_id, field_group_key)
```

`sort_order` is UI-only. Decision 3's widening test is a set comparison, so
nothing in enforcement needs modes ranked — which matters, because with
per-account denials the modes are genuinely not a total order.

The `CHECK (exactly one of ...)` mirrors the constraint already on `note`'s
four owner columns. `is_default` living *on* `user_access_mode` means an
account's landing mode is necessarily one it holds; it cannot drift out of the
granted set. Denials hang off the grant row, not the user, so revoking a mode
cascades that account's adjustments to it away with it.

### The model in one line

An account holds **one role** and **one or more access modes**. Each (account,
mode) pair may be narrowed independently. Exactly one held mode is active per
session; `is_default` picks where a fresh login lands.

> user 1 is a `super`; holds `unrestricted` (minus `hentai_image`) and
> `normal`; lands in `normal` at login.

**Effective object set** = mode's labels − denials, and mode's field groups −
denials. Subtraction only (decision 8), so an account is always a subset of its
mode.

### Seeded modes

All four carry `is_system` and cannot be deleted; an admin may create more, the
way `roles.py` already allows for roles. Label and field-group assignments are
data, editable on the admin page — only these rows are seeded.

| key | labels | field groups |
|---|---|---|
| `unrestricted` | every label | all five |
| `borderline` | `nsfw` | all five |
| `normal` | — | all five |
| `safe` (`is_guest_default`) | — | all except `sources_restricted` |

`safe` is today's guest exactly: `GUEST_WITHHELD_FIELD_GROUPS` already withholds
`sources_restricted` and nothing else. The top three tiers differ only in which
*entries* are reachable; the step down to `safe` is the one that changes what a
reachable entry shows.

Note that `safe` therefore keeps `personal_notes` (decided 2026-09-11), so the
public site shows personal reviews — unchanged from today, and tangled with
carried-in question 1, which observes that this field group gates a query
parameter and nothing on any response.

Finer labels need no schema work: `hentai_video` / `hentai_image` are rows an
admin adds to `content_label`, and every mode and gate picks them up.

### Modes versus denials

Two ways to express the same result, worth telling apart:

- **A new mode** is policy applied more than once — named, assignable to
  several people, editable in one place.
- **A denial** is an exception for one person — nothing to name or maintain.

Rule of thumb: applying the same denial to a third account means it wanted to
be a mode.

### Enforcement

`hidden_label_ids` (`enforcement.py:27`) stops asking
`viewer.has(label_perm(key))` and stops short-circuiting on `is_superuser`; it
returns the labels the active mode does not carry. All five consumers —
`apply_entry_visibility`, `apply_media_visibility` and the rest — are untouched,
because the list they receive means the same thing. `field_gate._withheld`
changes the same way and loses the same short-circuit.

**Writes call the same guard** (decision 9). `entry_visible` already tests both
the media-type permission and the label set, so the write paths simply call it
and 404 on false, with the same not-found message the read paths use. The
paths that need it: `me_list.py`'s two handlers (the defect above), and an
audit of every other route taking a client-supplied entry id.

Resolution is fail-closed at every step, matching `role_for_user`'s existing
"least access, not most" rule. The exact order is in section 3.

### Migration cost

Near zero on the label side. There are currently **zero** `label.*` rows in
`role_permission`, on **zero** labelled entries (checked 2026-09-11) — the label
gate is fully built and entirely inert, so the axis is being defined before it
was ever used in anger. `field_group.*` grants *do* exist on the seeded roles
and move to the mode axis. `content_labels.py` is unchanged; labels stay
admin-managed under `admin.authz`.

## Section 3 — session and switching (APPROVED 2026-09-11)

### The claim names a choice, not a grant

The token payload gains `mode` beside `sub`, carrying the mode's **uuid** — not
its key, so renaming a mode does not invalidate live sessions. It records
*which* of the account's modes is selected. Whether the account may still use
it is resolved from the database on every request, exactly as the role already
is: today's `role` claim is decorative, and `resolver.py` says so ("nothing
reads it for authorization"). So revoking a mode or ticking a new denial takes
effect on the viewer's next request, even with a live cookie — for reads and,
under decision 9, for writes.

### Resolution order, fail-closed

```
token.mode  ->  still granted to this user?
                  yes -> effective = mode's sets - this pair's denials
                  no  -> effective = EMPTY SET
no token    ->  the is_guest_default mode, or EMPTY SET if none flagged
```

The fallback for a revoked mode is the **empty set, not the account's default
mode**. This corrects the 2026-09-10 draft, which said "fall back to the
narrowest they hold": narrowest is not well-defined once modes are deliberately
unordered (decision 5), and falling back to `is_default` could *widen* a
session — sitting in `safe` when an admin revokes `safe` would hand the viewer
`unrestricted` with no password. The empty set is the only fallback that cannot
widen.

### Switching

`POST /api/auth/access-mode` with `{mode_id, password?}`:

```
effective(target) subset-of effective(current session)  ->  reissue immediately
otherwise                                               ->  password required
```

A set comparison per decision 3 — no ordering needed, which is what lets it
survive per-account denials. Narrowing is free; adding even one label or field
group asks for the password. The second case answers 401 with a
`requires_password` marker so the SPA prompts rather than guesses.

### The reissued cookie keeps the original `exp`

If switching minted a fresh 24-hour token, toggling `safe` -> `normal` ->
`safe` would be an unlimited session-extension oracle, and the flat 24-hour
lifetime (an open auth item, with no refresh or revocation) would stop meaning
anything. The new token copies the old token's `exp`; the cookie's `max_age`
is the remaining seconds.

### Guests do not switch

No account, so no granted modes and no denials to resolve. A guest gets the
guest-default mode and nothing else; wanting more means logging in.

## Section 4 — enforcement and the SPA (APPROVED 2026-09-11)

### `/api/auth/me` keeps its contract; only the server's source changes

It goes on publishing `field_group.*` entries in `permissions` — but computed
from the **active mode minus denials** instead of the role's grants. Every
`has("field_group.system_info")` already written in the SPA keeps working
untouched. Labels stay out of the payload, as they are today; they scope whole
entries server-side and the browser never needs them.

It gains the mode surface the switcher needs: the active mode, and the list of
modes this account holds, each flagged with whether switching to it would
require the password (the subset test from section 3, computed server-side so
the SPA never has to model the rule).

### `is_admin` is redefined rather than migrated

```
is_admin  :=  viewer.has("manage.catalog")      # was: has("admin")
```

`isAdmin` has **394 uses across 77 files** (counted 2026-09-11), and they
overwhelmingly mean "may this person edit the catalogue?" — they gate edit
buttons, notes editors and tracker controls. Redefining the alias this way
leaves almost all 394 correct for free, and correctly *adds* the edit surface
for a `super` account, which is carried-in question 2 solved as a side effect.
Only the genuinely authorization screens — `Roles.jsx`, the users page,
`ContentLabels.jsx` and the new access-mode page — switch to
`has("admin.authz")`. A handful of files rather than 77.

### The safety move: delete `label_perm()` and `field_group_perm()`

Once object-scoping leaves the role axis, any call site still asking
`viewer.has(field_group_perm(k))` would silently answer `True` for a superuser —
a wrong answer no test would obviously catch. Removing the helpers turns every
stale call into an import error. A break that stops the build beats a behaviour
that quietly changes. `roles.py /catalog` stops offering both families as
grantable.

### `Viewer` and the cache

`Viewer` gains `mode_id`, `mode_key`, `visible_label_ids` and `field_groups`.
`permissions` keeps meaning the *role's* capability set and `has()` is
unchanged. `GUEST_FALLBACK` gains empty object sets, which is already the
fail-closed answer.

`cache.py` today memoises `role_id -> frozenset[str]`, cleared wholesale by
`bump()`. Adding the user to that key would make it unbounded in accounts and
destroy the sharing that makes it worth having. Instead, two dicts:

- `_MODE_CACHE[mode_id]` — the mode's labels and field groups, shared by
  everyone holding it, hot.
- `_DENIAL_CACHE[user_access_mode_id]` — that pair's denials, usually empty.

Both cleared by the existing `bump()`, which every grant-changing write already
calls, so the new mode and denial writes simply call it too. The single-process
assumption in that module's docstring is unchanged.

## Section 5 — admin UI and migration (APPROVED 2026-09-11)

### The access-mode page

New `/access-modes` (`AccessModes.jsx`) and `app/routers/access_modes.py`, both
shaped on `Roles.jsx` / `roles.py` — list on the left, the selected mode's
grants as checkboxes on the right, a create form, delete refused when
`is_system`. Routes mirror roles: `GET /`, `GET /catalog`, `POST /`,
`PATCH /{id}`, `PUT /{id}/grants`, `DELETE /{id}`, all under `admin.authz`.

Two differences from the roles page:

- Checkboxes come in **two labelled groups** (Content Labels, Field Groups) fed
  by `/catalog`, the way `roles.py` already serves its permission families.
- **Guest default is a radio across modes, not a checkbox on one.** The partial
  unique index permits at most one, and a radio is the control that cannot
  express otherwise. The server still validates; the UI simply cannot ask for
  the invalid thing.

### The per-account panel

Extends **`Users.jsx`** rather than adding a page — it is per-account, and that
is where role assignment already lives. For the selected account: which modes
they hold, a radio for the login default among those held, and under each held
mode its items rendered as **the mode's own list with tick-to-deny**.

That rendering is the point. Decision 8 says denials only subtract; showing the
mode's items and letting you untick them makes the UI structurally incapable of
expressing something outside the ceiling. The rule becomes visible rather than a
server error discovered by hitting it.

One endpoint, `PUT /api/users/{id}/access-modes`, replaces the whole set —
grants, default and denials — in a single payload. Matches
`PUT /roles/{id}/permissions`'s replace-the-set precedent: one write, one
`bump()`, no partial states.

### The migration

Ordered so the owner is never locked out, in one revision:

1. Create the five tables.
2. Seed the four modes and their label/field-group rows; flag `safe` as guest
   default.
3. Mint `admin.authz`, `manage.catalog`, `manage.pipelines`; grant all three to
   the `admin` role, the two `manage.*` to a newly seeded `super` role.
4. Grant **every existing account all four modes, defaulting to
   `unrestricted`** — so nothing changes visibly on the day it lands. For the
   owner's `admin` account that is the faithful mapping of today's
   `is_superuser`, which sees everything.
5. *Only then* delete the `field_group.*` and `label.*` rows from
   `role_permission`.

Steps 3 and 5 must not be reordered: the new grants have to exist before the old
ones are removed, or there is a window in which the admin role holds neither.
Alembic runs on container start before uvicorn serves, so a half-applied state is
never exposed to a request — but the ordering still matters for a failed
migration someone has to resume by hand.

New accounts get `safe` only (decision 4). That is runtime code in `users.py`'s
create handler, not migration.

**Downgrade loses denials.** Dropping the tables cannot reconstruct per-account
adjustments. The revision docstring says so rather than leaving it to be
discovered.

### The seed is a frozen snapshot, not an ORM import

The migration seeds through Core SQL with its column list written out
literally:

```python
mode_table = sa.table("access_mode", sa.column("key"), sa.column("label"), ...)
op.bulk_insert(mode_table, [...])
```

A separate runtime `ensure_access_mode_seed` — importing `app.models`,
idempotent, called from the lifespan — covers the `create_all` path, because
`tests/api/conftest.py` builds the schema directly and never runs Alembic. That
is the same reason `seed.py` is called from two places today.

What is deliberately **not** copied from `seed.py` is its ORM import inside the
migration. A migration that queries `app.models` emits `SELECT` over every
column the model declares *today*, so the day a later revision adds a column,
this migration starts asking for a column that does not exist yet when run from
an empty database, and a recipe that worked for a year breaks untouched. That is
not hypothetical here: `docs/PROGRESS.md` records `alembic upgrade head` from an
empty database already failing at `86982d71c2f1` for exactly this reason, and a
second instance blocked the home machine on 2026-09-07.

The cost is one duplicated column list. These are brand-new tables with no
history to preserve, so this is the cheapest possible moment to establish the
durable pattern — and it chips at that open item rather than adding a third
instance to it.

## Section 6 — testing (APPROVED 2026-09-11)

### Fixtures

`tests/api/conftest.py` already carries the two-account shape the multi-user
work left behind: `admin_user` / `admin_client`, `plain_user` / `user_client`,
and an autouse `_clear_permission_cache`. Add `super_user` / `super_client`, a
`mode(key)` and `grant_mode(user, mode, denials=...)` pair, and
`labelled_entry(label_key)`.

**`_clear_permission_cache` must also clear `_MODE_CACHE` and
`_DENIAL_CACHE`.** If it does not, mode state leaks between tests and the
failures are random and order-dependent — the likeliest source of a day lost to
mystery flakes.

### The matrix

**1 - Capability.** `super` can PUT an entry but is refused `POST /roles`;
`admin` does both; `user` does neither. An account holding `manage.catalog` but
not `manage.pipelines` is refused Backup and Pull All, so section 1's split is
asserted rather than assumed. Plus a regression for the `plan_next.py` fix: a
plain user can write their own plan rows.

**2 - Read scoping.** An `nsfw`-labelled entry 404s on detail in `safe` and
returns 200 in `borderline`; it is absent from list, search, profile and
community aggregates. `sources_restricted` is missing from the response body in
`safe` and present in `normal`.

**3 - Write scoping.** Entirely new; no coverage exists today.
`PUT /me/list/{id}` on a labelled entry 404s in `safe`; on a Game it 404s for an
account without `media_type.game` — the regression test for the live defect.
Each asserts **404 with the standard not-found message, never 403**:
indistinguishability is the property being protected, and a 403 leaks the
entry's existence as surely as a 200 would.

**4 - Denials.** An account holding `unrestricted` minus `hentai_image` sees
`nsfw` entries and 404s on the `hentai_image` one. Revoking the mode grant
cascades its denials away. The server refuses a payload naming an item the mode
does not carry, so decision 8 is enforced and not merely rendered.

**5 - Switching.** Narrowing: 200, no password. Widening bare: 401 with
`requires_password`. Widening with a wrong password: 401. With the right one:
200. Switching to an ungranted mode: refused. And **decode both tokens and
assert `exp` is identical** — nothing else catches the session-extension oracle,
and it is invisible to manual testing.

**6 - Fail-closed resolution.** Delete the grant row while the cookie is live:
the next request resolves the **empty set, not the account's default mode**,
asserted by a previously-visible labelled entry now 404ing. No mode flagged
guest-default: a guest sees nothing labelled. Two flagged: the partial unique
index raises.

**7 - Axis independence.** An `is_superuser` account sitting in `safe` does
**not** see a labelled entry. This is the test that proves the redesign did what
it set out to do; it would have failed in the old model, where `is_superuser`
short-circuited everything.

**8 - Seeding and migration.** A `create_all` database holds all four modes
after the lifespan seed. The migration leaves every existing account with four
modes and an `unrestricted` default, and zero `field_group.*` / `label.*` rows
in `role_permission`. The frozen-snapshot migration runs clean **from an empty
database**, guarding the defect class section 5 avoids.

**9 - Pipelines and the object axis** (decision 14). An account holding
`manage.pipelines` is refused Backup, Pull All, Fill, Replace All and
Replace-one while its active mode lacks any label or any field group, and
accepted while the mode carries both sets in full. The refusal is a
**capability answer (401), not 404** — the route's existence is not a secret,
and the caller is being told to widen, which is a thing they can act on.
Two edges that are the whole point of "computed, never a named mode": adding a
new `content_label` row makes a previously-qualifying mode stop qualifying, and
a *custom* mode carrying every label and field group qualifies even though it
is not `unrestricted`. Plus the oracle regression: Replace-one on a hidden
entry is unreachable, because reaching the route at all means nothing is
hidden.

**10 - Remark and status codes** (decisions 12 and 13). Two accounts each hold
a remark on the same owner — the relaxed index accepts the second write, and
each viewer reads back their own, which is the pair of assertions that has to
fail if either half of decision 12 lands alone. And `note.py` answers 401 where
it answered 403 for a capability failure, 404 where it answered 403 for
somebody else's note.

### Expected breakage is signal

28 test files touch `is_admin`, `field_group` or `is_superuser` (counted
2026-09-11). Redefining `is_admin` and moving field groups off the role axis
will break some of them. Each break should be re-pointed at the new model, never
silenced — a test that asserted the old model is exactly what should fail here.

On the frontend the redefinition keeps most of the 394 `isAdmin` sites correct,
but the Roles and Users page tests need the new endpoints mocked.

## Decision 14 in detail — pipelines and the object axis (DECIDED 2026-09-11)

Section 2's post-audit correction 5 parked this as the thing that had to be
answered before Phase B seeded its schema. This is the answer.

### The rule

`manage.pipelines` is **unscoped on the object axis**. Neither the runner nor
any pipeline route filters by content label, field group or `media_type.*`; a
Backup writes every row and a Pull All restores every row, whoever ran it.

That is a deliberate grant of reach, so it is paired with a restriction on
*when* it may be exercised:

> Every route on `data_control.py` and `system.py` additionally requires the
> session's **active mode to be unscoped** — to carry every row in
> `content_label` and every key in `FIELD_GROUP_KEYS`.

The test is **computed, never a named mode**. Comparing against the key
`unrestricted` would silently widen the qualifying set the day someone edits
that mode, and would break the moment an admin creates their own equivalent;
comparing against the two full sets cannot. A mode that happens to hold
everything qualifies; `unrestricted` after somebody unticks `hentai_image` does
not.

Both routers already carry `Depends(require_manage_pipelines)` at router level
(`data_control.py:45`, `system.py:24`), so this is one more dependency in one
more place, not a sweep.

### It does not contradict decision 2

Decision 2 says a mode "never changes which *kinds* of operation an account may
perform". At a glance this rule does exactly that — sit in `safe` and Backup is
refused. The reconciliation is not a special case, and it matters enough to
write down, because a reader who takes it as one will be tempted to "fix" it
later:

A pipeline's object set is **every entry**, declared and not negotiable. The
mode still only decides which objects the operation reaches; it is the
*operation* that refuses to run against a subset, because a partial Backup or a
partial Pull is not a smaller version of the job, it is a corrupt one. So the
test is the same subset comparison decision 3 uses for switching — `required ⊆
effective` — with `required` fixed at everything. The permission is untouched;
`viewer.has(PERM_MANAGE_PIPELINES)` answers the same in `safe` as in
`unrestricted`.

Every other operation in the system has a per-object set and so narrows
gracefully. Pipelines are the one kind that cannot, which is why they are the
one kind that refuses.

### What it buys

- **Decision 4 survives.** The admin account may still sit in `safe`. Running a
  pipeline from there means widening first, which decision 3 already prices at
  a password. The narrow session stays genuinely narrow, and the widening
  prompt is not routine — it fires when you reach for a wholesale rewrite,
  which is exactly when a prompt is worth reading.
- **The Replace-one oracle closes with no separate fix.** The write-binding
  audit's item 5 (`POST /api/data-control/replace/{key}/{entry_id}`) leaks an
  entry's existence and `display_name` to a caller who cannot see it. For a
  caller in an unscoped session there is no such entry, so the oracle has no
  domain. The audit recorded this route as belonging to decision 14 rather than
  to Phase C; it does, and it is paid for here.
- **Coherence inside the subsystem.** The audit's objection to gating
  Replace-one alone was that `Replace All` next to it would stay ungated. Under
  this rule both are gated the same way, at the same place, by the same test.

### What it does not cover, stated plainly

The rule constrains the *session*, not the *data*. An operator in an unscoped
session can still rewrite anything — that is the point of calling the
permission unscoped. Decision 10 already removed the one path that was an
escalation rather than merely broad reach: Pull All skips the `Users`,
`Content Label` and `Media Content Label` tabs for a caller without
`admin.authz` (shipped, `a4b9d554`). So a `super` can restore the catalogue in
full and still cannot Pull themselves a promotion or re-label an entry out of
somebody's reach.

The residual that remains, and belongs in `docs/authorization.md` as a named
one: a `super` holding `manage.pipelines` can read every entry's title through
a Replace All stream while sitting in a session that qualifies — which is not a
leak, because qualifying *means* the mode already reaches every label.

### The internal write hook is untouched

`run_replace_single` is also the registry's `write_hook` behind entry
create/update (`registry.py:209` and seven siblings, via
`replace.py::execute_replace_single_*`). That call path is in-process and
carries no HTTP dependency, and Phase C already made every route that reaches
it resolve the entry through `entry_visible` first. Only the HTTP route gains
the gate.

## Implementation shape

This is too large for one plan. The phases below are separable, and every one
of them is behaviour-neutral for the owner's account on the day it lands, which
is the property that makes the sequence safe to stop halfway.

**Phase 0 — the object-level hole. DONE 2026-09-11.** `me_list.py`'s two
handlers now resolve through `entry_visible` and 404 with the not-found message.
Five tests in `tests/api/test_visibility.py` under "Writes"; no existing test
regressed, which is itself the useful signal — nothing in the suite depended on
being able to write an entry it could not see.

**Phase A — the capability axis. DONE 2026-09-11.** Minted `admin.authz`,
`manage.catalog` and `manage.pipelines`; seeded the `super` role
(`is_system`, not `is_superuser`); re-gated roles/users/content_labels and
system/data_control, then 20 catalogue routers (73 call sites) onto the new
dependencies; dropped the three `plan_next.py` admin gates; redefined
`is_admin` to mean `manage.catalog` and split the SPA's route guard
accordingly; deleted the bare `admin` permission and `get_current_admin`
last, so a missed router became an `ImportError` rather than a silent grant.
No new tables. Neutral for `admin`, which held every new permission via
`is_superuser` throughout. A real bug surfaced and was fixed along the way:
`get_current_admin` returned a `dict`, the new dependencies return a
`Viewer`, and `users.py`'s self-delete guard read `admin.get("sub")` — so
from the roles/users swap until the fix it raised `AttributeError` instead
of firing.

**Phase B — the access-mode axis. DONE 2026-09-12** (sections 2-4, plus
decisions 12, 13 and 14). Twelve plan tasks, all green at every commit:
`1b8f9b72` the five tables and the four seeded modes, `27944bcd` the migration
plus the two caches and per-request resolution, `e18bac6e` the pivot (both
gates read the active mode; the `is_superuser` short-circuits removed, the
`viewer is None` half kept), `f0c54815` `label_perm()` / `field_group_perm()`
deleted, `bf385643` `/api/auth/me` serving field groups from the mode,
`3c509dfd` the decision-14 pipeline gate, `a6bcf57e` decision 13's status
codes, `6f7d5dec` decision 12's per-viewer `remark`. Migrations
`n1a1accessmode` and `n1a2remarkauthor`.

**Three things this spec got wrong, corrected in the implementation and worth
carrying into Phase D's plan:**

1. **"`safe` is today's guest exactly" was false on the live database.**
   Section 2 asserted that `GUEST_WITHHELD_FIELD_GROUPS` withheld
   `sources_restricted` and nothing else, and the post-Phase-A audit counted
   twelve `field_group.*` grants across three roles. There were **eight**, in
   three different subsets — guest and user held `{credits, system_info}`,
   super held those plus `{personal_notes, sources_other}` — because
   `ensure_rbac_seed` tops up only a role holding *nothing*, so groups added
   to `FIELD_GROUPS` after a role was first seeded never reached it. Seeding
   `safe` from the stated default would have published the other-sources list
   and other people's personal reviews to every logged-out visitor. Both the
   seeder and the migration now **derive** `safe` from what the guest role
   actually holds. The spec's own rule ("a task that names an endpoint, a
   field value or a type should have had that value checked, not recalled")
   applies to a spec's own counts as much as to a plan's.
2. **Decision 13's line list mis-assigned line 199.** "Editing a catalogue
   note requires the `manage.catalog` permission" is a *capability* failure
   and answers **401**, not the 404 the table gave it. 404 there would claim
   the note does not exist, which is a different and false statement. The rule
   in decision 13 was right; one of its five applications was not.
3. **Section 5's migration step 3 and the grant rule needed a runtime
   counterpart.** `grant_all_modes_to_existing_accounts` had to run from the
   lifespan as well as the migration: on a database built by `create_all`
   rather than Alembic, the seeded admin held no mode and would have logged in
   to an empty site.

**What Phase B deliberately did NOT do**, all of it Phase D: the mode switcher
and its subset test, the preserved `exp` on a reissued cookie, the
`/access-modes` page, the per-account panel, `PUT /api/users/{id}/access-modes`,
and the rule that a new account gets `safe` only.

**Phase A.1 — the pipeline/authorization boundary. DONE 2026-09-11**
(`a4b9d554`), decision 10. Marked
`Users`, `Content Label` and `Media Content Label` in
`app/services/pipelines/tabs.py` as requiring `admin.authz`, and have the Pull
runner skip and report them for a caller without it. Independent of B, C and D
— it needs only Phase A's permissions, which have shipped — so it can go at any
time. Small: `tabs.py` is already a per-tab registry and `unresolved_refs` is
already the skip-and-report channel.

**Phase C — write binding. DONE 2026-09-11** (`31837f52`), decision 9. The
write paths call the same guard. Phase 0 is a subset of this and a down
payment on it. `_factory.py::_get_or_404`'s `viewer` parameter lost its
default (that default was the defect — `entry_visible` returns `True` for a
`None` viewer), closing 36 call sites in one edit; `casting`, `credits`,
`quote`, `meme`, `note`, `media_relation` and `watch_order` writes now resolve
through `entry_visible` too, each keeping the answer shape its own route
already used for missing. Two derived-type defects found on the way and
fixed: `quote.py` and `note.py` both paired a client-supplied id with a
*stored* `media_type`/`owner_type`, which are `column_property`/derived
values rather than authoritative — both now resolve the type from the
incoming id. `docs/roadmap.md` has the full record, including what was
deliberately left open.

**Phase D — the surfaces. DONE 2026-09-12** (sections 3 and 5), 10 of 11
tasks: `ac4c7baf` /me publishes held modes with a server-computed
`requires_password`; `6fa9d13f` the switch endpoint, with the reissued cookie
keeping the original `exp` and its max_age the REMAINING seconds; `c91931bb`
the `/access-modes` router; `b5f0612a` per-account assignment and
new-account-gets-`safe`; `2753bf68` the admin page; `384bbdd4` the per-account
panel; `acb747a` docs; `61f19d1` carried-in question 6 and the two-surface
mismatch. No migration - Phase B's schema was complete.

**Task 9, the switcher control, landed last** (`3ec6a0f`) once the `Nav.jsx`
lock cleared. It was blocked for most of the phase, and the plan's rule was to
stop rather than relocate it - a switcher living outside the site chrome
because of a scheduling accident would have been a design decision made by a
merge conflict. Holding that line cost one component late and saved a
permanent wrong answer. Its contract is in `docs/authorization.md`.

**One thing this section got wrong**, worth keeping for the next plan written
from a spec: it said "until this ships, modes ... can only be changed in the
database - which is why it is last rather than first". That ordering was right
but the reason was incomplete. What actually made Phase D safe to do last is
that Phase B was behaviour-neutral on the day it landed; had it not been, the
absence of a UI would have been urgent rather than merely inconvenient.

Testing (section 6) is not a phase; each phase carries the slice of the matrix
it makes true, written first.

## Post-Phase-A audit of sections 2-6 (2026-09-11)

Checked against the code Phase A left behind, so the Phase B plan argues from
verified ground rather than from what was true on 2026-09-10.

**Still accurate, verified:** `hidden_label_ids` is at `enforcement.py:27`;
`field_gate._withheld` exists; `GUEST_WITHHELD_FIELD_GROUPS` is still exactly
`{"sources_restricted"}`; `label_perm()` and `field_group_perm()` both still
exist for Phase B to delete; `cache.py` is still `dict[UUID, frozenset[str]]`
keyed on role id alone; the login token is still
`{"sub": username, "role": ...}` with the role claim decorative.

**Five corrections:**

1. **Section 4's `is_admin` redefinition is DONE**, not proposed. Phase A
   shipped it (`c71ad497`): `/api/auth/me` returns
   `viewer.has(PERM_MANAGE_CATALOG)`, and the SPA route block is split 12
   (`manage.catalog`) + 3 (`admin.authz`). The SPA *nav* needed the same split
   and did not get it until `da4f23b6` — `navigation.js` calls `has("admin")`
   directly and so was untouched by redefining `is_admin`. Phase B must
   remember that the nav is a second, independent surface.

2. **Section 5's migration step 3 is DONE.** Minting the three permissions and
   seeding `super` happened in Phase A with **no Alembic revision at all** —
   `ensure_rbac_seed` runs from the lifespan and is idempotent. Phase B's
   migration therefore covers only: create the five tables, seed the modes,
   grant every existing account all four, and remove the `field_group.*` /
   `label.*` rows. There are now **four** seeded roles, not three.

3. **Section 2's label-side migration claim still holds, and the field-group
   side grew.** Still zero `label.*` grants on zero labelled entries (2 labels
   defined, unused). But `field_group.*` grants now number **12 across three
   roles** — guest, user and super — because `default_super_permissions()`
   derives from the user set. Phase B moves all twelve.

4. **Section 6 needs `super_user` / `super_client` fixtures, and there is now
   duplication to clean up.** `tests/api/conftest.py` has `admin_user`,
   `admin_client`, `plain_user`, `user_client` — no super pair. Phase A's tests
   therefore built a super account inline in **five** separate files
   (`test_authz_router_gates`, `test_capability_dependencies`,
   `test_catalog_router_gates`, `test_me_is_admin`, `test_pipeline_router_gates`).
   Phase B should extract the shared fixture and re-point those five.

5. **The parked policy question now bites harder.** `manage.pipelines` allows
   Pull All, which restores the Users and Content Label tabs and can rewrite
   role assignments and labels from the sheet. In Phase A that was an oddity.
   In Phase B, content labels become the **entire basis of the access-mode
   axis**, so a pipeline run can silently re-label every entry and move what
   each mode can reach — without holding `admin.authz`. This needs an answer
   before Phase B's schema is seeded, not after. **Answered 2026-09-11** by
   decision 14 and its detail section: the permission is unscoped, the routes
   require an unscoped active mode, and decision 10 (shipped, `a4b9d554`)
   already stops a Pull restoring the three authorization tabs without
   `admin.authz`.

## The write-binding audit (2026-09-11) — decision 9's scope

Section 2's enforcement note asked for "an audit of every other route taking a
client-supplied entry id", and `docs/PROGRESS.md` carried it as open question 1
gating Phase C. This is the answer, read off the code rather than recalled.
Every line below names the route and the line the claim came from.

**The shape of the gap.** Reads are guarded and writes are not, almost
everywhere, and the two sit in the same file: `casting.py` GETs through
`entry_visible` at line 71 and PUTs through `_resolve_entry` at line 48, which
only asks whether the row exists. Phase A made this reachable rather than
theoretical — the capability axis is now independent of the object axis, so an
account can hold `manage.catalog` while lacking `media_type.game` or carrying a
hidden label. Before Phase A, every catalogue writer was `is_superuser` and
`entry_visible` short-circuited to True for them.

**1. The largest surface is a default argument.** `_factory.py`'s `_get_or_404`
(line 65) takes `viewer=None` and calls `entry_visible` at line 79 — and
`enforcement.py:120` returns True for a `None` viewer. The detail GET passes
`viewer` (line 246); all four write routes do not: PUT (311), PATCH (354),
`POST /{entry_id}/complete` (390) and DELETE (419). That is 4 routes × 9 media
types, gated only by `manage.catalog`. `/complete` is the sharpest of the four:
it resolves the entry with no visibility test and then writes a
`user_media_list` row for the caller — the same write Phase 0 just closed on
`PUT /me/list/{media_id}`, reachable by a second door.

**2. Six routers repeat it verbatim**, each guarding its read and not its write:

| Router | Guarded read | Unguarded writes |
|---|---|---|
| `casting.py` | GET, line 71 | PUT `/{media_type}/{entry_id}` (77) |
| `credits.py` | GET, line 57 | PUT `/{media_type}/{entry_id}` (75) |
| `media_relation.py` | GET, line 191 | POST (317), PATCH (364), DELETE `/scope` (424), DELETE `/{system_id}` (501) |
| `quote.py` | GET, line 252 | POST (264), PUT (294), PATCH (317), DELETE (339) |
| `meme.py` | (same `owner_type`/`owner_id` shape) | POST (320), PUT (363), PATCH (402), DELETE (443) |
| `note.py` | GET, line 237 | POST (298), PATCH `/reorder` (332), PATCH (369), DELETE (425) |

`note.py`'s POST is the one reachable without `manage.catalog`: a personal-scope
note is written under `self.personal_notes`, with `owner_type` and `owner_id`
straight from the payload and no visibility test — the same class of defect as
Phase 0's, one permission over. Its PATCH is worth separate care because it may
*move* a note to a new owner (line 410), so the check has to run against the
incoming owner, not the stored one.

**3. `watch_order.py`'s writes are unguarded; its reads are not.** No
visibility call appears anywhere in the router, which reads as a total gap and
is not one — the read filtering lives a layer down, in
`services/domain/watch_order.py`: `resolve_items` (199) drops hidden steps via
`drop_hidden_rows` and `list_candidate_entries` (260) applies
`apply_entry_visibility` to the picker. (This corrects the first form of this
audit, which claimed the file had no visibility handling at all; it was read
off the router alone.) The writes genuinely have none. Items name
`(media_type, entry_id)` and are written at POST `/lists/{id}/items` (1137),
PUT (1182), PATCH (1211) and DELETE (1238), with `_validate_entry` (132) asking
only whether the row exists. Lists and sections own grouping tiers, which carry
no labels, so they are clean on the label axis; their *items* are not.

**4. Two validators are existence oracles.** `media_relation._validate_endpoint`
(78) and `watch_order._validate_entry` (132) answer 400 "Referenced entry does
not exist" for a missing entry and 201 for a hidden one. Whatever Phase C does
must make those two answers identical, exactly as the 404 paths are
indistinguishable today — otherwise closing the write and leaving the validator
keeps the oracle.

**Clean, checked, not to be touched:** `seasonal.py`'s PATCH (79) takes no entry
id and is keyed on `user_id`; `me_list.py` and `plan_next.py` are Phase 0 and
`a4b9d554`; `announcements.py`, `options.py`, `system.py`, `users.py`,
`roles.py`, `account.py` and `form_defaults.py` take no entry id at all.

**Accepted, not a Phase C task:** `content_labels.py`'s PUT
`/entry/{media_type}/{entry_id}` (167) writes labels onto an entry it never
tests for visibility, but it is gated by `admin.authz` — the permission that
defines the label axis — and a holder can grant itself any label anyway.
`franchise.py` stores `cover_entry_id` unvalidated (99); the consequence is a
cover image, and it is recorded here rather than fixed.

**5. One route this audit missed, found by the final whole-branch review.**
POST `/api/data-control/replace/{key}/{entry_id}` (`data_control.py:105-112`,
registered for nine media types) takes a client-supplied entry id, is gated by
`require_manage_pipelines` alone and never calls `entry_visible`. Its runner
(`services/pipelines/runner.py:284-297`) answers 404 "<label> entry not found"
for a missing entry and 200 "Successfully updated <display_name>." for a hidden
one — a write, an existence oracle and a title leak in one answer. The audit
above missed it because it was walked router by router over the files that
carry entry CRUD, and `data_control.py` registers its routes in a loop over
`PIPELINES` rather than declaring handlers, so no `entry_id` path parameter
reads as one at a glance. It was caught by the final review of the branch, not
by this audit: the route inventory above is therefore *not* a proof of
completeness, and should not be cited as one.

It is recorded rather than guarded, deliberately. Gating the per-entry Replace
while `Replace All` in the same router stays ungated would enforce the object
axis incoherently inside one subsystem, and the coherent answer is the policy
question section 2's post-audit correction 5 already parks: `manage.pipelines`
can rewrite content labels and role assignments wholesale through Pull All, so
what the object axis means for a pipeline needs answering before Phase B seeds
its schema. This route belongs to that question, not to Phase C.

**Resolved 2026-09-11 by decision 14.** Both this route and `Replace All` are
gated together, by requiring an unscoped active mode on every pipeline route.
The oracle closes because a qualifying caller has no hidden entries — no
special-case handling of this handler is needed, and the incoherence the
paragraph above objected to does not arise.

**What this makes Phase C.** Not "add a guard to a few handlers": 30-odd routes
across eight files, plus one default argument whose fix (`_get_or_404` passing
`viewer` from the four write routes) closes 36 of them in one edit. The tests
are section 6's matrix row 3, which today has no coverage at all.

## Open questions carried in

From `docs/PROGRESS.md`, unchanged — the redesign is expected to settle these:

1. `field_group.personal_notes` gates a query parameter and nothing on any
   response, and is still labelled "Personal Reviews".
2. No SPA surface for a non-admin: notes editors and tracker controls are
   `isAdmin`-only, so the `user` role is usable but not useful. Section 4's
   `is_admin` redefinition lands in the same code.
3. One remark per owner, site-wide.
4. Note writes answer 403; every other gate answers 401 or 404.
