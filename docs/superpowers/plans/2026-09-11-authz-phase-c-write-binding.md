# Authorization Phase C — write binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every write that takes a client-supplied entry id resolves it through
`entry_visible`, so a write answers exactly what a read would: if GET is a 404
for this viewer, so is the write, with the same message.

**Architecture:** No new tables, no new permission, no new helper. `entry_visible`
(`app/services/rbac/enforcement.py:112`) already tests both halves — the
media-type permission and the label set — and every read path already calls it.
Phase C hands it the viewer the route already holds. The one structural change is
`_factory.py::_get_or_404`, whose `viewer=None` default is what made 36 routes
skip the check silently: it becomes a required argument, so a future write route
that forgets is a `TypeError`, not a silent grant. That is the same
fail-loudly move Phase A made by deleting `get_current_admin`.

**Tech Stack:** FastAPI, SQLAlchemy, pytest. Backend only — no migration, no
frontend change, no `npm run build`.

**Spec:** `docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`
— decision 9, section 2 ("Enforcement"), section 6 matrix row 3 ("Write
scoping"), and "The write-binding audit (2026-09-11)", which is the route
inventory this plan implements.

## Global Constraints

- **Hidden answers exactly as missing, in the shape the route already uses for
  missing.** A 403 confirms the entry exists as surely as a 200 does.
  Concretely: the per-type routes and `casting`/`credits` answer their existing
  404 and message; `note` answers its existing `404 "Owner not found."`;
  `media_relation` and `watch_order` answer their existing
  `400 "Referenced entry does not exist."`. Do not invent a new status or a new
  message anywhere in this phase.
- **Never `403` for a visibility failure.** `note.py` uses 403 for *ownership*
  ("That note belongs to someone else.") and that stays; it is open question 4
  and is out of scope here.
- **Behaviour-neutral for the `admin` account.** `entry_visible` returns True
  for `viewer.is_superuser` (`enforcement.py:120`), so every test that exercises
  a write as `admin_client` must keep passing untouched. A break there is a real
  regression, not a test to re-point.
- **Run the full backend suite before every commit**, never a scoped run:
  `venv/Scripts/python.exe -m pytest -q`. It takes ~5.5 minutes and this plan
  budgets five runs. Never run two pytest processes at once — both trees share
  one `anime_site_test`.
- **Stage files by name, never a directory pathspec**, and stage-and-commit in
  one step. Other sessions are editing this branch.
- `venv/Scripts/ruff.exe check .` must be clean before each commit.
- Every task sets its row in `docs/PROGRESS.md` to `wip phase-c` before starting
  and `done <sha>` in the same commit as the work.

## Files

| File | Responsibility in this phase |
|---|---|
| `app/routers/_factory.py` | `_get_or_404` takes a required `viewer`; the four write routes pass theirs (36 routes closed) |
| `app/routers/casting.py` | `_resolve_entry` takes a viewer; PUT passes it |
| `app/routers/credits.py` | same shape as casting |
| `app/routers/quote.py` | POST/PUT/PATCH/DELETE check the entry the row points at |
| `app/routers/meme.py` | POST/PUT/PATCH/DELETE check the owner the row points at |
| `app/routers/note.py` | POST/PATCH/reorder/DELETE check the owner, PATCH against the *incoming* owner |
| `app/routers/media_relation.py` | `_validate_endpoint` takes a viewer; both endpoints of POST and PATCH |
| `app/routers/watch_order.py` | `_validate_entry` takes a viewer; the four item routes |
| `tests/api/conftest.py` | promote `make_viewer` / `nsfw_label` / `hidden_anime`; add `catalog_writer` |
| `tests/api/test_visibility.py` | loses the three promoted helpers, keeps its Phase 0 tests |
| `tests/api/test_write_binding.py` | **new** — section 6 matrix row 3, one class per router |
| `docs/authorization.md` | the write gate becomes a documented gate, not an inherited defect |
| `docs/PROGRESS.md`, `docs/roadmap.md`, the spec | Phase C recorded and retired |

---

### Task 1: The factory's four write routes

The largest single win: one default argument accounts for 36 of the ~30-odd
routes (4 write routes × 9 media types).

**Files:**
- Modify: `app/routers/_factory.py:65` (`_get_or_404`), `:311`, `:354`, `:390`, `:419`
- Modify: `tests/api/conftest.py` (promote three helpers, add one)
- Modify: `tests/api/test_visibility.py:23-81` (drop the promoted helpers)
- Test: `tests/api/test_write_binding.py` (new)

**Interfaces:**
- Consumes: `entry_visible(db, viewer, media_type, entry_id) -> bool` from
  `app.services.rbac.enforcement`; `Viewer` from `app.services.rbac.resolver`.
- Produces: fixtures every later task uses —
  `make_viewer(db_session, client, username, permissions) -> client` (plain
  function in `tests/api/conftest.py`), fixtures `nsfw_label`, `hidden_anime`
  (an `Anime` named `HIDDEN_NAME` carrying the `nsfw` label), and
  `catalog_writer(username="catwriter", extra=frozenset()) -> client`, a viewer
  holding `default_user_permissions() | {PERM_MANAGE_CATALOG}` and **not**
  `label.nsfw`.

- [ ] **Step 1: Claim the task**

In `docs/PROGRESS.md`, set the Phase C row's Status cell to `wip phase-c`.

- [ ] **Step 2: Promote the shared fixtures into `tests/api/conftest.py`**

Move `make_viewer`, `nsfw_label` and `hidden_anime` out of
`tests/api/test_visibility.py` (lines 23-81) verbatim — same bodies, same
`HIDDEN_NAME = "Zvornik Hidden Sentinel"` constant — and append the new writer
fixture. `tests/api/test_visibility.py` then imports only what it still names
directly:

```python
# tests/api/conftest.py — appended near the other account fixtures

HIDDEN_NAME = "Zvornik Hidden Sentinel"


def make_viewer(db_session, client, username, permissions):
    """Log `client` in as a new user holding exactly `permissions`."""
    role = models.Role(
        system_id=uuid.uuid4(),
        name=f"role-{username}",
        label=username,
        is_system=False,
        is_superuser=False,
    )
    db_session.add(role)
    db_session.flush()
    for permission in permissions:
        db_session.add(
            models.RolePermission(role_id=role.system_id, permission=permission)
        )
    db_session.add(
        models.User(
            id=uuid.uuid4(),
            username=username,
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db_session.flush()
    rbac_cache.bump()

    token = create_access_token({"sub": username, "role": role.name})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


@pytest.fixture
def nsfw_label(db_session):
    label = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    db_session.add(label)
    db_session.flush()
    return label


@pytest.fixture
def hidden_anime(db_session, sample_franchise, nsfw_label, list_row):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en=HIDDEN_NAME,
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Completed")
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    db_session.flush()
    return entry


@pytest.fixture
def catalog_writer(db_session, client):
    """
    A catalogue editor who cannot see the labelled entry.

    This account is the whole point of Phase C. Before Phase A it could not
    exist: every catalogue writer was is_superuser, and entry_visible
    short-circuits to True for those. Phase A made the capability axis
    independent of the object axis, so `manage.catalog` now says nothing about
    which entries you may reach.
    """

    def _make(username="catwriter", extra=frozenset()):
        return make_viewer(
            db_session,
            client,
            username,
            default_user_permissions() | {PERM_MANAGE_CATALOG} | set(extra),
        )

    return _make
```

The imports `tests/api/conftest.py` needs on top of what it already has:

```python
from app.services.rbac.permissions import PERM_MANAGE_CATALOG, label_perm
from app.services.rbac.seed import default_user_permissions
```

In `tests/api/test_visibility.py`, delete the three moved definitions and the
now-unused imports (`get_password_hash`, `create_access_token`, `rbac_cache`
if nothing else in the file uses them — check before deleting), and add
`from tests.api.conftest import HIDDEN_NAME, make_viewer`. `nsfw_label` and
`hidden_anime` resolve as fixtures with no import.

- [ ] **Step 3: Write the failing tests**

```python
# tests/api/test_write_binding.py
"""
Writes follow reads (decision 9).

Phase 0 closed PUT /me/list/{media_id}; the audit in the design doc found the
same hole on every other route taking a client-supplied entry id. These pin the
rule across all of them: if GET answers 404 for this viewer, the write answers
404 too, with the same message - a 403 would confirm the entry exists just as
surely as a 200 would.

The account under test holds manage.catalog and NOT label.nsfw. Before Phase A
that account could not exist, which is why this gap was unreachable until now.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import label_perm
from tests.api.conftest import HIDDEN_NAME


class TestFactoryWrites:
    """The nine per-type routers, generated by app/routers/_factory.py."""

    def test_update_is_indistinguishable_from_missing(
        self, catalog_writer, hidden_anime
    ):
        client = catalog_writer()
        response = client.put(
            f"/api/anime/{hidden_anime.system_id}",
            json={"anime_name_en": "Renamed By Someone Who Cannot See It"},
        )
        assert response.status_code == 404
        assert HIDDEN_NAME not in response.text

    def test_update_does_not_write(self, catalog_writer, hidden_anime, db_session):
        client = catalog_writer()
        client.put(
            f"/api/anime/{hidden_anime.system_id}",
            json={"anime_name_en": "Renamed By Someone Who Cannot See It"},
        )
        db_session.refresh(hidden_anime)
        assert hidden_anime.anime_name_en == HIDDEN_NAME

    def test_patch_is_indistinguishable_from_missing(
        self, catalog_writer, hidden_anime
    ):
        client = catalog_writer()
        response = client.patch(
            f"/api/anime/{hidden_anime.system_id}",
            json={"anime_name_en": "Renamed"},
        )
        assert response.status_code == 404
        assert HIDDEN_NAME not in response.text

    def test_complete_is_indistinguishable_from_missing(
        self, catalog_writer, hidden_anime
    ):
        """The sharpest of the four: it writes a user_media_list row for the
        caller, which is the write Phase 0 closed on /api/me/list."""
        client = catalog_writer()
        response = client.post(f"/api/anime/{hidden_anime.system_id}/complete")
        assert response.status_code == 404
        assert HIDDEN_NAME not in response.text

    def test_complete_leaves_no_list_row_behind(
        self, catalog_writer, hidden_anime, db_session
    ):
        """Counted, not asserted zero: the hidden_anime fixture already gives
        the entry a Completed row on the ACTING admin's list."""
        client = catalog_writer()
        rows = db_session.query(models.UserMediaList).filter(
            models.UserMediaList.media_id == hidden_anime.system_id
        )
        before = rows.count()
        client.post(f"/api/anime/{hidden_anime.system_id}/complete")
        assert rows.count() == before

    def test_delete_is_indistinguishable_from_missing(
        self, catalog_writer, hidden_anime, db_session
    ):
        client = catalog_writer()
        response = client.delete(f"/api/anime/{hidden_anime.system_id}")
        assert response.status_code == 404
        assert (
            db_session.query(models.Anime)
            .filter(models.Anime.system_id == hidden_anime.system_id)
            .first()
            is not None
        )

    def test_the_gate_does_not_block_a_visible_entry(
        self, catalog_writer, sample_anime
    ):
        """The control: an unlabelled entry still writes, so this is a gate and
        not a blanket refusal."""
        client = catalog_writer()
        response = client.put(
            f"/api/anime/{sample_anime.system_id}",
            json={"anime_name_en": "Renamed By Someone Who May"},
        )
        assert response.status_code == 200

    def test_holding_the_label_restores_the_write(
        self, catalog_writer, hidden_anime
    ):
        client = catalog_writer(username="trustedcat", extra={label_perm("nsfw")})
        response = client.put(
            f"/api/anime/{hidden_anime.system_id}",
            json={"anime_name_en": "Renamed By Someone Who May"},
        )
        assert response.status_code == 200

    def test_admin_is_unaffected(self, admin_client, hidden_anime):
        """is_superuser short-circuits entry_visible, so the owner's account
        sees no change on the day this lands."""
        response = admin_client.put(
            f"/api/anime/{hidden_anime.system_id}",
            json={"anime_name_en": HIDDEN_NAME},
        )
        assert response.status_code == 200
```

- [ ] **Step 4: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -v`
Expected: the six hidden-entry tests FAIL (200 where 404 is wanted, and the
rename/list-row assertions fail because the write went through); the three
control tests PASS.

- [ ] **Step 5: Make the viewer required in `_get_or_404`**

`app/routers/_factory.py`, line 65. The default is the defect: `entry_visible`
returns True for a `None` viewer, so every caller that omitted it skipped the
gate silently.

```python
    def _get_or_404(db: Session, entry_id: str, viewer):
        # `viewer` is REQUIRED, with no default. It used to default to None,
        # and enforcement.entry_visible returns True for a None viewer - so the
        # four write routes below, which all omitted it, resolved every entry
        # as visible and never called the gate at all. A required argument
        # makes the next write route that forgets a TypeError instead of a
        # silent grant, the same way Phase A deleted get_current_admin so a
        # missed router became an ImportError.
        try:
            ref = media_entity_ref_filter(spec.model, str(entry_id))
        except ValueError:
            raise HTTPException(status_code=404, detail=not_found)
        entry = db.query(spec.model).filter(ref).first()
        if not entry:
            raise HTTPException(status_code=404, detail=not_found)
        # Same message either way: a hidden entry must be indistinguishable
        # from one that was never there.
        if not entry_visible(db, viewer, spec.owner_type, entry.system_id):
            raise HTTPException(status_code=404, detail=not_found)
        return entry
```

Then pass the viewer at all five call sites. Lines 311 (PUT), 354 (PATCH) and
390 (`/complete`) already declare `viewer: Viewer = Depends(get_viewer)`:

```python
        entry = _get_or_404(db, entry_id, viewer)
```

Line 419 (DELETE) declares only `admin: Viewer = Depends(require_manage_catalog)`.
`require_manage_catalog` returns the `Viewer` and FastAPI caches dependencies
per request, so `admin` IS the viewer — pass it rather than adding a second
dependency:

```python
        entry = _get_or_404(db, entry_id, admin)
```

Line 246 (the detail GET) already passes `viewer`; leave it.

- [ ] **Step 6: Run the new tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -v`
Expected: all PASS.

- [ ] **Step 7: Lint and run the whole suite**

Run: `venv/Scripts/ruff.exe check .` then
`venv/Scripts/python.exe -m pytest -q`.
Expected: ruff clean; pytest green. If a test outside this file fails, read it
before touching it — an existing test that wrote an entry it could not see is
the defect, but an existing test failing *as `admin`* is a regression in this
change.

- [ ] **Step 8: Commit**

Set the Phase C row in `docs/PROGRESS.md` to `wip phase-c (1/5 done)` in the
same commit.

```bash
git add app/routers/_factory.py tests/api/conftest.py tests/api/test_visibility.py tests/api/test_write_binding.py docs/PROGRESS.md
git commit -m "feat(authz): the per-type write routes resolve through entry_visible"
```

---

### Task 2: `casting`, `credits`, `quote`, `meme`

Four routers, one shape: the GET calls `entry_visible` and the writes call a
resolver that only asks whether the row exists.

**Files:**
- Modify: `app/routers/casting.py:48` (`_resolve_entry`), `:77` (PUT)
- Modify: `app/routers/credits.py:33` (`_resolve_entry`), `:75` (PUT)
- Modify: `app/routers/quote.py:264`, `:294`, `:317`, `:339`
- Modify: `app/routers/meme.py:320`, `:363`, `:402`, `:443`
- Test: `tests/api/test_write_binding.py`

**Interfaces:**
- Consumes: `catalog_writer`, `hidden_anime`, `HIDDEN_NAME` from Task 1.
- Produces: `_resolve_entry(db, media_type, entry_id, viewer)` in both
  `casting.py` and `credits.py` — a required fourth argument, same reasoning as
  Task 1.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_write_binding.py — appended


class TestCastingAndCredits:
    def test_replacing_a_cast_is_indistinguishable_from_missing(
        self, catalog_writer, hidden_anime
    ):
        client = catalog_writer()
        response = client.put(
            f"/api/casting/anime/{hidden_anime.system_id}",
            json={"cast": []},
        )
        assert response.status_code == 404
        assert HIDDEN_NAME not in response.text

    def test_replacing_credits_is_indistinguishable_from_missing(
        self, catalog_writer, hidden_anime
    ):
        client = catalog_writer()
        response = client.put(
            f"/api/credits/anime/{hidden_anime.system_id}",
            json={"credits": {}, "tags": {}},
        )
        assert response.status_code == 404
        assert HIDDEN_NAME not in response.text

    def test_credits_still_write_on_a_visible_entry(
        self, catalog_writer, sample_anime
    ):
        client = catalog_writer()
        response = client.put(
            f"/api/credits/anime/{sample_anime.system_id}",
            json={"credits": {}, "tags": {}},
        )
        assert response.status_code == 200


class TestQuoteAndMeme:
    def test_creating_a_quote_on_a_hidden_entry_is_refused(
        self, catalog_writer, hidden_anime, db_session
    ):
        client = catalog_writer()
        before = db_session.query(models.Quote).count()
        response = client.post(
            "/api/quote/",
            json={
                "media_type": "anime",
                "entry_id": str(hidden_anime.system_id),
                "text": "A line from a show I cannot see.",
            },
        )
        assert response.status_code == 404
        assert db_session.query(models.Quote).count() == before

    def test_patching_a_quote_onto_a_hidden_entry_is_refused(
        self, catalog_writer, hidden_anime, sample_anime, db_session
    ):
        """The move case: the check runs against the INCOMING entry, not the
        stored one."""
        quote = models.Quote(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=sample_anime.system_id,
            text="A line from a show I can see.",
        )
        db_session.add(quote)
        db_session.flush()
        client = catalog_writer()
        response = client.patch(
            f"/api/quote/{quote.system_id}",
            json={"entry_id": str(hidden_anime.system_id)},
        )
        assert response.status_code == 404
        db_session.refresh(quote)
        assert quote.entry_id == sample_anime.system_id

    def test_creating_a_meme_on_a_hidden_entry_is_refused(
        self, catalog_writer, hidden_anime, db_session
    ):
        client = catalog_writer()
        before = db_session.query(models.Meme).count()
        response = client.post(
            "/api/meme/",
            json={
                "owner_type": "anime",
                "owner_id": str(hidden_anime.system_id),
                "text": "A meme about a show I cannot see",
            },
        )
        assert response.status_code == 404
        assert db_session.query(models.Meme).count() == before

    def test_a_meme_on_a_grouping_tier_still_writes(
        self, catalog_writer, sample_franchise
    ):
        """A tier carries no labels, so entry_visible has no opinion and the
        write must not be refused by accident."""
        client = catalog_writer()
        response = client.post(
            "/api/meme/",
            json={
                "owner_type": "franchise",
                "owner_id": str(sample_franchise.system_id),
                "text": "A meme about a franchise",
            },
        )
        assert response.status_code in (200, 201)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -k "Casting or Quote" -v`
Expected: the hidden-entry tests FAIL with 200/201; the two controls PASS. If
the meme payload 422s, read `app/schemas/meme.py` for the required fields and
fix the payload — a 422 is a wrong test, not a finding.

- [ ] **Step 3: Thread the viewer through `casting` and `credits`**

Both files, identically. `casting.py:48` and `credits.py:33`:

```python
def _resolve_entry(db: Session, media_type: str, entry_id: UUID, viewer):
    """
    Validate media_type first, so an unknown type is a 400 not a KeyError.

    `viewer` is required and the visibility test is not optional: the GET above
    has asked since the content-label work and the PUT below never did, so a
    holder of manage.catalog lacking the label could rewrite an entry it cannot
    read. Writes follow reads (decision 9), and the 404 message is the one a
    genuinely missing entry gets.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown media type: {media_type}")

    model = MEDIA_TABLES[media_type].model
    entry = db.get(model, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    if not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry
```

Both GET handlers then pass `viewer` and drop their now-duplicated
`entry_visible` block (the one at `casting.py:71` and `credits.py:57`) — the
check has moved into the resolver, so leaving both would run it twice:

```python
    _resolve_entry(db, media_type, entry_id, viewer)
```

Both PUT handlers pass the `admin` Viewer they already hold:

```python
    _resolve_entry(db, media_type, entry_id, admin)
```

- [ ] **Step 4: Gate the quote and meme writes**

`quote.py` — add a helper beside `_validate_media_type` and call it from all
four write handlers:

```python
def _require_visible_entry(db: Session, viewer, media_type, entry_id) -> None:
    """
    A quote names an entry, so writing one reaches that entry.

    Nothing here if the quote names no entry: entry_id is nullable and a
    free-standing quote is legitimate. The 404 message matches _get_or_404's,
    so a hidden entry and an absent quote are one answer.
    """
    if not media_type or not entry_id:
        return
    if not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail="Quote not found.")
```

- `create_quote` (264): after `_validate_media_type`, call
  `_require_visible_entry(db, admin, payload.media_type, payload.entry_id)`.
- `update_quote` (294) and `patch_quote` (317): call it twice — once for the
  stored row (`db_quote.media_type`, `db_quote.entry_id`) and once for the
  incoming values when the payload names them, so neither moving a quote onto a
  hidden entry nor editing one already on it is possible.
- `delete_quote` (339): call it for the stored row.

`meme.py` — the same, against `owner_type` / `owner_id`, with the grouping-tier
carve-out `note.py:237` already documents:

```python
def _require_visible_owner(db: Session, viewer, owner_type, owner_id) -> None:
    """
    An owner may be a grouping tier, which carries no labels - entry_visible
    only has an opinion about the media types, so a tier is left alone.
    """
    if not owner_type or not owner_id or owner_type not in MEDIA_TABLES:
        return
    if not entry_visible(db, viewer, owner_type, owner_id):
        raise HTTPException(status_code=404, detail="Meme not found.")
```

Call it from `create_meme` (320), `update_meme` (363), `patch_meme` (402) and
`delete_meme` (443), checking the stored owner and, where the payload names one,
the incoming owner too. `MEDIA_TABLES` is already imported in both files —
confirm before adding an import.

- [ ] **Step 5: Run the new tests, then the whole suite**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -v`,
then `venv/Scripts/ruff.exe check .`, then
`venv/Scripts/python.exe -m pytest -q`.
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/routers/casting.py app/routers/credits.py app/routers/quote.py app/routers/meme.py tests/api/test_write_binding.py docs/PROGRESS.md
git commit -m "feat(authz): casting, credits, quote and meme writes follow their reads"
```

---

### Task 3: `note` — the one reachable without `manage.catalog`

A personal note is written under `self.personal_notes`, with `owner_type` and
`owner_id` straight from the payload. This is Phase 0's defect one permission
over, so it gets its own task and its own reviewer.

**Files:**
- Modify: `app/routers/note.py:298` (POST), `:332` (reorder), `:369` (PATCH),
  `:425` (DELETE)
- Test: `tests/api/test_write_binding.py`

**Interfaces:**
- Consumes: `make_viewer`, `hidden_anime`, `HIDDEN_NAME` from Task 1;
  `PERM_SELF_PERSONAL_NOTES` and `default_user_permissions` from the app.
- Produces: `_require_visible_owner(db, viewer, owner_type, owner_id)` in
  `note.py`, raising `404 "Owner not found."` — the message its GET already
  uses at line 237.

- [ ] **Step 1: Write the failing tests**

`advantages` is used below because it is `SCOPE_PERSONAL`, `SHAPE_TEXT`,
`ALL_OWNERS` and not a singleton (`app/utils/note_sections.py:204`), so a
`content` string is the whole valid payload. The note router's prefix is
`/api/notes`, plural (`note.py:47`).

These two imports go at the TOP of the file with the others, not here — ruff's
E402 fires on an import after code:

```python
from app.services.rbac.seed import default_user_permissions
from tests.api.conftest import make_viewer
```

```python
# tests/api/test_write_binding.py — appended

# A SCOPE_PERSONAL, SHAPE_TEXT, ALL_OWNERS section that is not a singleton -
# checked in app/utils/note_sections.py:204. "remark" is also personal but is
# singleton=True, which would add a second failure mode to every test here.
PERSONAL_SECTION = "advantages"


class TestNoteWrites:
    """note.py's POST is reachable with self.personal_notes and no catalogue
    permission at all - the same shape as the defect Phase 0 closed."""

    def _note_writer(self, db_session, client, username="notewriter"):
        return make_viewer(
            db_session, client, username, default_user_permissions()
        )

    def test_writing_a_personal_note_on_a_hidden_entry_is_refused(
        self, db_session, client, hidden_anime
    ):
        writer = self._note_writer(db_session, client)
        before = db_session.query(models.Note).count()
        response = writer.post(
            "/api/notes",
            json={
                "owner_type": "anime",
                "owner_id": str(hidden_anime.system_id),
                "section": PERSONAL_SECTION,
                "content": "A thought about a show I cannot see.",
            },
        )
        assert response.status_code == 404
        assert HIDDEN_NAME not in response.text
        assert db_session.query(models.Note).count() == before

    def test_the_refusal_is_404_and_never_403(
        self, db_session, client, hidden_anime
    ):
        """403 is note.py's OWNERSHIP answer and must not be reused here: it
        would confirm the entry exists."""
        writer = self._note_writer(db_session, client)
        response = writer.post(
            "/api/notes",
            json={
                "owner_type": "anime",
                "owner_id": str(hidden_anime.system_id),
                "section": PERSONAL_SECTION,
                "content": "A thought.",
            },
        )
        assert response.status_code != 403

    def test_a_note_on_a_visible_entry_still_writes(
        self, db_session, client, sample_anime
    ):
        writer = self._note_writer(db_session, client, username="goodnotewriter")
        response = writer.post(
            "/api/notes",
            json={
                "owner_type": "anime",
                "owner_id": str(sample_anime.system_id),
                "section": PERSONAL_SECTION,
                "content": "A thought about a show I can see.",
            },
        )
        assert response.status_code == 201

    def test_patching_a_note_onto_a_hidden_entry_is_refused(
        self, db_session, client, sample_anime, hidden_anime
    ):
        """PATCH may move a note to a new owner (note.py:410), so the check has
        to run against the INCOMING owner, not the stored one."""
        writer = self._note_writer(db_session, client, username="movingwriter")
        created = writer.post(
            "/api/notes",
            json={
                "owner_type": "anime",
                "owner_id": str(sample_anime.system_id),
                "section": PERSONAL_SECTION,
                "content": "A thought.",
            },
        ).json()
        response = writer.patch(
            f"/api/notes/{created['system_id']}",
            json={
                "owner_type": "anime",
                "owner_id": str(hidden_anime.system_id),
            },
        )
        assert response.status_code == 404
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -k Note -v`
Expected: the three hidden-owner tests FAIL (201/200 where 404 is wanted); the
visible-entry control PASSES. If the POST 422s, the section key or a required
field is wrong — fix the test.

- [ ] **Step 3: Add the guard**

`note.py`, beside `_validate_owner_type`:

```python
def _require_visible_owner(db: Session, viewer: Viewer, owner_type, owner_id) -> None:
    """
    The write half of the check the read at line 237 already does.

    An owner may be a grouping tier, which carries no labels; entry_visible
    only has an opinion about the media types. 404 and "Owner not found.",
    exactly as the read answers - a 403 here is note.py's answer for writing
    SOMEBODY ELSE's note, and reusing it would confirm this entry exists.
    """
    if owner_type not in MEDIA_TABLES or owner_id is None:
        return
    if not entry_visible(db, viewer, owner_type, owner_id):
        raise HTTPException(status_code=404, detail="Owner not found.")
```

Call it:
- `create_note` (298): after `_validate_or_422(payload)`, against
  `payload.owner_type` / `payload.owner_id`.
- `reorder_notes` (332): after `_authorize_write`, against
  `payload.owner_type` / `payload.owner_id`.
- `update_note` (369): after the `merged` object is built and
  `_authorize_write(viewer, merged.section)` has run — against
  `merged.owner_type` / `merged.owner_id`, which is the *incoming* owner when
  the payload names one and the stored owner when it does not. Placing it there
  covers both cases with one call.
- `delete_note` (425): after `_authorize_edit`, against `db_note.owner_type` /
  `db_note.owner_id`.

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -v`,
then `venv/Scripts/ruff.exe check .`, then
`venv/Scripts/python.exe -m pytest -q`.
Expected: green. `tests/api/test_note*.py` is the file most likely to have a
test that writes a note on an entry its viewer cannot see — read any failure
there rather than silencing it.

- [ ] **Step 5: Commit**

```bash
git add app/routers/note.py tests/api/test_write_binding.py docs/PROGRESS.md
git commit -m "feat(authz): note writes resolve their owner through entry_visible"
```

---

### Task 4: `media_relation` and `watch_order` — and the two oracles

These two share a defect the others do not have: their validators answer
`400 "Referenced entry does not exist."` for a missing entry and `201` for a
hidden one, so closing the write without fixing the validator would leave the
existence oracle standing.

**Files:**
- Modify: `app/routers/media_relation.py:78` (`_validate_endpoint`), `:317`
  (POST), `:364` (PATCH), `:424` (DELETE `/scope`), `:501` (DELETE)
- Modify: `app/routers/watch_order.py:132` (`_validate_entry`), `:1137` (POST
  item), `:1182` (PUT), `:1211` (PATCH), `:1238` (DELETE)
- Test: `tests/api/test_write_binding.py`

**Interfaces:**
- Consumes: `catalog_writer`, `hidden_anime`, `HIDDEN_NAME` from Task 1.
- Produces: `_validate_endpoint(db, media_type, entry_id, viewer)` and
  `_validate_entry(db, media_type, entry_id, viewer)` — a required fourth
  argument on each, both keeping their existing 400 and message.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_write_binding.py — appended


class TestRelationAndWatchOrderWrites:
    def test_relating_to_a_hidden_entry_answers_as_a_missing_one(
        self, catalog_writer, hidden_anime, sample_anime, db_session
    ):
        """400 and the same message a nonexistent entry gets. The status is
        deliberately NOT 404 here: the route already answers 400 for a
        reference it cannot resolve, and a hidden entry must be that answer."""
        client = catalog_writer()
        before = db_session.query(models.MediaRelation).count()
        response = client.post(
            "/api/media-relation/",
            json={
                "from_type": "anime",
                "from_id": str(sample_anime.system_id),
                "kind": "sequel",
                "to_type": "anime",
                "to_id": str(hidden_anime.system_id),
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Referenced entry does not exist."
        assert HIDDEN_NAME not in response.text
        assert db_session.query(models.MediaRelation).count() == before

    def test_a_relation_between_visible_entries_still_writes(
        self, catalog_writer, sample_anime, anime_with_studio
    ):
        """`sequel` is one of ACCEPTED_INPUT_KINDS
        (`app/utils/relation_kinds.py:58`); `anime_with_studio` is a second
        unlabelled anime, so both endpoints are visible."""
        client = catalog_writer()
        response = client.post(
            "/api/media-relation/",
            json={
                "from_type": "anime",
                "from_id": str(sample_anime.system_id),
                "kind": "sequel",
                "to_type": "anime",
                "to_id": str(anime_with_studio.system_id),
            },
        )
        assert response.status_code == 201

    def test_adding_a_hidden_entry_to_a_watch_order_answers_as_missing(
        self, admin_client, catalog_writer, hidden_anime, sample_franchise
    ):
        """The order is created through the API as admin rather than by
        constructing the model, so this test does not encode
        watch_order_list's column shape."""
        order = admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "An order",
            },
        ).json()
        client = catalog_writer()
        response = client.post(
            f"/api/watch-order/lists/{order['system_id']}/items",
            json={
                "media_type": "anime",
                "entry_id": str(hidden_anime.system_id),
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Referenced entry does not exist."
        assert HIDDEN_NAME not in response.text
```

Route prefixes used above, read off the routers rather than recalled:
`/api/media-relation` (`media_relation.py:42`) and `/api/watch-order`
(`watch_order.py:41`). `admin_client` and `catalog_writer` are two different
accounts on the same `client` object underneath, so create the order first and
log the writer in second — never the other way round.

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -k "Relation" -v`
Expected: the two hidden-entry tests FAIL with 201; the control PASSES.

- [ ] **Step 3: Thread the viewer through both validators**

`media_relation.py:78`:

```python
def _validate_endpoint(db: Session, media_type: str, entry_id, viewer) -> None:
    """
    Rejects an endpoint pointing at an unknown table, a missing row, or a row
    this viewer cannot see.

    The third case answers exactly as the second, message included. Answering
    404 here, or a distinct message, would turn this validator into the
    existence oracle the 404 paths are careful not to be: a caller could learn
    that an entry exists by watching which refusal it gets.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media type '{media_type}'."
        )
    if (
        entry_id is None
        or not entry_exists(db, media_type, entry_id)
        or not entry_visible(db, viewer, media_type, entry_id)
    ):
        raise HTTPException(
            status_code=400, detail="Referenced entry does not exist."
        )
```

`watch_order.py:132` takes the same fourth argument and the same combined
condition, keeping its own `VALID_WATCH_ORDER_MEDIA_TYPES` check and its own
message.

Then pass the viewer at every call site. The handlers declare
`admin=Depends(require_manage_catalog)` (untyped in `media_relation.py`, typed
in `watch_order.py`) and that value is the `Viewer`, so pass `admin`:

- `media_relation.create_relation` (317): both `_validate_endpoint` calls.
- `media_relation.update_relation` (364): the PATCH re-normalizes the stored
  endpoints rather than taking new ones, so add one `_validate_endpoint` call
  per stored endpoint (`row.from_type, row.from_id` and `row.to_type,
  row.to_id`) immediately after `_get_relation_or_404`. Editing a relation is
  reaching both of its entries.
- `media_relation.delete_relation` (501) and `reset_scope` (424): same — check
  the stored endpoints of the row(s) being deleted before deleting them.
- `watch_order` item POST (1137), PUT (1182), PATCH (1211): the `_validate_entry`
  call each already makes. DELETE (1238) resolves the item first — check the
  item's stored `(media_type, entry_id)` before deleting it.

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_write_binding.py -v`,
then `venv/Scripts/ruff.exe check .`, then
`venv/Scripts/python.exe -m pytest -q`.
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add app/routers/media_relation.py app/routers/watch_order.py tests/api/test_write_binding.py docs/PROGRESS.md
git commit -m "feat(authz): relation and watch-order writes answer hidden exactly as missing"
```

---

### Task 5: Close the phase in the docs

Three edits, in one commit, as the project's convention requires — this is the
step that has needed chasing every time.

**Files:**
- Modify: `docs/authorization.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/superpowers/specs/2026-09-10-authorization-redesign-design.md`
- Modify: `docs/superpowers/plans/2026-09-11-authz-phase-c-write-binding.md` (this file)

- [ ] **Step 1: `docs/authorization.md`**

The write gate stops being an inherited defect and becomes a documented gate.
State the rule in one line — *a write answers exactly what a read would* — name
`entry_visible` as the single place it is decided, and record the two residuals
this phase deliberately did not close: `content_labels.py`'s PUT (gated by
`admin.authz`, which defines the label axis anyway) and `franchise.cover_entry_id`
(stored unvalidated; the consequence is a cover image). Bump `Last verified`.

- [ ] **Step 2: `docs/roadmap.md`**

A **Done** entry, newest first, in the style of the entries already there: what
changed, why it was done this way (one required argument rather than a guard
per route, because the defect *was* a default argument), what was deliberately
not done (the two residuals; open question 4's 403-vs-404 convention, which this
phase left alone), and any defect found on the way.

- [ ] **Step 3: `docs/PROGRESS.md`**

Set Phase C to `done <sha>`. Leave B and D as they are.

- [ ] **Step 4: The spec and this plan**

In the spec's "Implementation shape", mark Phase C done with its sha, the way
Phase 0, A and A.1 are marked. Note at the top of this plan that it shipped.

- [ ] **Step 5: Commit**

No code changed, so no suite run is needed — but confirm the tree is clean of
other sessions' work before staging.

```bash
git add docs/authorization.md docs/roadmap.md docs/PROGRESS.md docs/superpowers/specs/2026-09-10-authorization-redesign-design.md docs/superpowers/plans/2026-09-11-authz-phase-c-write-binding.md
git commit -m "docs(authz): retire Phase C into the roadmap"
```

---

## What this phase deliberately does not do

- **No frontend change.** The SPA never offered these writes to an account that
  could not see the entry, because it never showed the entry. Nothing to rebuild.
- **No new status code and no new message.** Indistinguishability is the
  property being protected; a new answer is a new oracle.
- **Open question 4 stays open.** `note.py` answers 403 for ownership while
  every other gate answers 401 or 404. Phase C adds no 403 and removes none.
- **`content_labels.py` and `franchise.cover_entry_id` stay as they are**, and
  are recorded in `docs/authorization.md` as accepted residuals rather than
  left unmentioned.
- **Phase B is untouched.** When B swaps what `hidden_label_ids` means, every
  call site added here keeps working, because they call `entry_visible` and its
  consumers do not change. That independence is the reason C is being done first.
