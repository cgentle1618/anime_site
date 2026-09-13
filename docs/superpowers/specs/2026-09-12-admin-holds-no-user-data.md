# The admin account holds no user data

Status: **SHIPPED 2026-09-12**, one commit. Migration `o1a1ownerflag`, applied to the home `anime_site_db` the same day; the company machine is listed as an open item in `docs/PROGRESS.md`. The record is
`docs/roadmap.md`; this file is kept for the reasoning and for the
section below.

## The problem

Every personal row in this installation belongs to `admin`: 2081
`user_media_list`, 1817 `note`, 96 `seasonal`, 88 `game_copy`, 84 `plan_next`,
24 `meme`, 11 `quote`. The second account, `cg1618` (role `super`), owns
nothing but its four access-mode holdings.

That is an artefact of the database having held one person when the personal
tables were added, not a decision. The owner's decision, taken today: **`admin`
is for management and does not carry a personal library.** Separation of
duties - an administrative account administers; end-user state lives on an
end-user account.

## Why a data migration alone is not enough

`installation_owner_id()` (`app/services/domain/user_list.py:116`) answers
"whose rows does a pipeline write when nobody is logged in", and it answers it
with the literal string `'admin'`. Three pipelines depend on it:

- Pull All files restored `Game Copy` rows under it unconditionally, ignoring
  the sheet's own `user_id` (`pipelines/pull.py:800`).
- Pull All falls back to it for `Plan Next`, `Seasonal`, `Note`, `Meme` and
  `Quote` rows whose owner does not resolve locally (`pull.py:755`, `:790`).
- Calculate derives novel reading progress onto its list row
  (`services/calculation.py:548`).

So moving the rows without changing that function means the next Pull All
refills `admin` and the next Calculate writes progress to an empty list. The
pointer has to move with the data.

## Decisions

### 1. The installation owner is a flag on the user row, not a name in code

`users.is_installation_owner`, boolean, NOT NULL, default false, with a
partial unique index so at most one account can hold it.

Rejected: an env var (per-machine, so the company and home databases can
silently disagree about who owns the collection - exactly the drift the Sheets
round trip exists to prevent), and a heuristic over roles (implicit, and
ambiguous the moment a third account exists).

The flag rides the Sheets `Users` tab, so both machines agree after a
Backup/Pull cycle. `parse_user_from_sheet` is an explicit projection, not a
column sweep, so the column has to be named there or it will not travel -
this is the kind of omission that is invisible until the other machine pulls.

The fallback, for a database where nobody holds the flag (a fresh install, an
older sheet): the alphabetically-first account whose role is not superuser,
else the first account. Never a hard failure - `user_media_list.user_id` is
NOT NULL and a restore has to file its rows somewhere.

### 2. `self.*` is ownership, not privilege, so superuser does not grant it

`Viewer.has()` short-circuits on `is_superuser`, which is the only reason
`admin` passes `self.list` and `self.personal_notes` today. That conflation is
what put the data there.

"May do anything to the system" and "has a personal library" are different
claims. The rule: **the superuser short-circuit does not cover the `self`
family.** One condition, expressed in the permission model rather than as
refusals scattered through the write routes - a rule spelled out in twenty
routers is a rule that will be missing from the twenty-first.

What it buys for free: the API refuses through the existing
`require_permission` 401, and the SPA hides the personal navigation, because
`navigation.js` and `App.jsx`'s `ProtectedRoute` both already ask `self.list`
(Phase D question 6 paired them). `AuthContext.jsx`'s `has()` mirrors the
server's short-circuit and must mirror this too, or the two surfaces disagree
again.

### 3. The `self` gate has to be applied where it is currently missing

`plan_next` and `seasonal` are gated by `get_current_user_id` alone - any
logged-in account, no permission test. Without closing that, `admin` still
queues plan-next entries and rates seasons and the rule leaks.

Game copies have no route of their own: they are a nested field on the Game
entry write, which is gated by `manage.catalog`. The nested list is skipped
for a viewer who cannot own rows, which is the guard
`write_game_copies` already applies when `acting_user_id` is None - extended
from "nobody is acting" to "the actor may not own personal rows". The SPA
hides the editor, so the guard is belt-and-braces rather than the only stop.

### 4. Authorship is not ownership, and both move anyway

`quote.author_id`, `meme.author_id` and `note.author_id` record **who wrote
the row**, not who owns it - `models/note.py:87-89` says so explicitly, and
scope changes who a note is filtered for, not whose it is. Reassigning them is
editing a record of authorship.

The owner chose to move them regardless, so that `admin` ends at zero rows and
the rule is verifiable by counting. That is sound here because the owner is
both accounts. It does not generalise, and the migration should say so.

**`admin` will author catalogue rows again.** Quotes, memes and
catalogue-scope notes are `manage.catalog` writes; an admin doing its job
creates them. "Zero rows" is permanent for ownership and true-as-of-today for
authorship. This is correct, not a gap.

## What this spec got wrong

**It under-counted the blast radius by a factor of nine.** The spec reasons
carefully about `installation_owner_id`, `Viewer.has()` and three routers, and
says nothing about tests - yet the change touched **fourteen test files**, and
nine of them not because of a bug but because they had been written to drive
personal endpoints as `admin_client`. That is not incidental: the tests
encoded the very assumption being removed, so "a rule expressed in one
condition" was true of the source and false of the work. A spec that sizes a
change by counting the production call sites will do this every time.

**`test_an_admin_is_not_blocked` had been asserting the bug**, in a file whose
docstring called it "the whole point of the `user` role". Nothing in the spec
predicted that inverting a rule means finding the test that pinned the old one
and reading its name as a claim rather than as a label. Worth generalising:
when a rule is removed, grep the test names for the rule's old wording.

**The one prediction that held** was decision 1's insistence that
`parse_user_from_sheet` is an explicit projection. It reads as a fussy detail
in a spec about authorization, and it is the only place where getting it wrong
would have been invisible on the machine making the change and visible only
after the *other* machine pulled - which is to say, the only place in this
change where the feedback loop is days long rather than seconds.

**Two claims in the docs were wrong before this work started and were only
found by grepping.** `docs/api.md` said plan-next's writes "stay admin-only,
matching media relations and watch orders" - they never were - and three
places in `docs/authorization.md` said a superuser "holds every permission
implicitly", which this change made false in all three at once. The spec did
not budget for the doc sweep, and the sweep is where both were caught.
