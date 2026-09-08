# Studio as a Public Entity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the `studio` table around four optional name fields with a per-row display choice, and give studios a public library page, a public detail page, links from the entries that credit them, and full admin CRUD under a new "Entity" tab group.

**Architecture:** `studio` already exists and is credited through the polymorphic `media_credit` link table; nothing public reads it. We change the table's naming shape in one Alembic revision, extend the single name resolver (`app/services/domain/credits.py:_find_by_name`) that every writer funnels through, add the reverse lookup (studio → entries) the detail page needs with RBAC applied by the existing `filter_visible_pairs`, then build two public pages following the `FranchiseLibrary` / detail-page precedents and a third admin tab group.

**Tech Stack:** FastAPI + SQLAlchemy + PostgreSQL 15+ (Python 3.13), Alembic, pytest; React + Vite, TanStack Query, Tailwind CSS v4 semantic tokens, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-04-studio-entity-design.md`

## Global Constraints

- **Commits require the user's approval.** `CLAUDE.md` overrides the default "just commit" step: never commit automatically after finishing a task. Show a one-line commit message, wait for approval, then commit. Every "Commit" step below means *propose and wait*.
- **Stage specific files only.** Other Claude Code sessions may be editing this branch. Never `git add -A` or `git commit -a`. Re-read the diff of each file you stage and confirm every hunk is yours. If a file has mixed changes, stop and ask.
- **Never revert another session's work.** No `git checkout --`, `git restore`, `git stash`, or `git reset` on shared files. If an edit fails to match, re-read the file — it changed under you.
- **Single Alembic head.** Current head is `o1r2p3h4a5n6`. The one new revision in this plan must set `down_revision = "o1r2p3h4a5n6"`.
- **Four gates stay green** (CI runs all four before deploying):
  - `venv/Scripts/python.exe -m pytest -q` (api tests need the `anime_site_test` database)
  - `venv/Scripts/ruff.exe check .`
  - `cd frontend && npm run test:run`
  - `cd frontend && npm run lint`
- **Test first.** Write the failing test before the bugfix or behaviour change, and run it to see it fail for the right reason.
- **Frontend rebuild.** After any frontend change run `cd frontend && npm run build`, which writes `frontend_dist/` for uvicorn on :8000. A change that works on :5173 but not :8000 is a stale build.
- **No hard-coded grey utilities.** Use semantic tokens (`bg-surface`, `text-text-muted`, `border-border`, …). `frontend/src/theme-tokens.test.js` fails the build on `slate-*`/`gray-*`.
- **Allowed `display_name_field` values:** exactly `"en"`, `"cn"`, `"jp"`, `"alt"`, or `NULL`.
- **Display-name fallback order:** chosen field → `en` → `cn` → `jp` → `alt` → `""`. Identical on backend and frontend.
- **Media-type key spelling:** the data layer uses hyphens (`anime-movie`, `tv-show`). `MEDIA_TABLES` in `app/utils/media_resolver.py` is the source of truth.

---

## File Structure

**Backend — created**
- `alembic/versions/s1t2u3d4i5o6_reshape_studio_names.py` — the one migration.

**Backend — modified**
- `app/models/staff.py` — `Studio`: four name columns, `display_name_field`, six profile columns, `NameFallbackMixin`, `names_dict`, `display_name`.
- `app/services/domain/credits.py` — `_find_by_name` (4 fields), `resolve_studio`, `credit_names`, `attach_link_fields`.
- `app/schemas/staff.py` — `StudioBase` fields + "at least one name" validator; `StudioResponse.display_name`.
- `app/schemas/link_fields.py` — `studio_refs` on the anime and anime-movie mixins.
- `app/routers/studio.py` — `_to_response` for the new shape; `GET /{system_id}/entries`; list sorted by display name.

**Backend — tests**
- `tests/api/test_studio_model.py`, `tests/api/test_studio_router.py`, `tests/api/test_person_studio_uniqueness.py` — existing files, updated off `name_native`.
- `tests/api/test_studio_entries.py` — new, the reverse lookup and its RBAC.
- `tests/api/test_credits_service.py`, `tests/api/test_credits_sheets.py` — updated for `credit_names` returning a display name.

**Frontend — created**
- `frontend/src/pages/library/StudioLibrary.jsx` + `StudioLibrary.test.jsx`
- `frontend/src/pages/detail/Studio.jsx`
- `frontend/src/pages/add-tabs/StudioAddTab.jsx`
- `frontend/src/pages/modify-tabs/StudioModifyTab.jsx`

**Frontend — modified**
- `frontend/src/lib/naming.js` + `naming.test.js` — `displayStudioName`, `STUDIO_NAME_FIELDS`.
- `frontend/src/api/endpoints.js` — `studio.entries`.
- `frontend/src/App.jsx` — two lazy routes.
- `frontend/src/config/adminTabs.js` — the `entity` group and `studio` tab.
- `frontend/src/components/forms/OptionSubTabBar.jsx` — drop the `studios` sub-tab.
- `frontend/src/pages/admin/Add.jsx`, `Modify.jsx`, `Delete.jsx` — the studio branch.
- `frontend/src/pages/add-tabs/OptionsAddTab.jsx` — remove `StudioForm`.
- `frontend/src/pages/detail/Anime.jsx`, `AnimeMovie.jsx` — linked studio chips.
- `frontend/src/components/layout/Nav.jsx` — the Studio library link.

**Docs — modified**
- `docs/data-model.md`, `docs/api.md`, `docs/business-rules.md`, `docs/frontend/pages.md`, `docs/frontend/admin-pages.md`, `docs/roadmap.md`.

---

### Task 1: Reshape the `studio` table

**Files:**
- Modify: `app/models/staff.py:111-140`
- Create: `alembic/versions/s1t2u3d4i5o6_reshape_studio_names.py`
- Test: `tests/api/test_studio_model.py` (rewrite), `tests/api/test_person_studio_uniqueness.py` (update)

**Interfaces:**
- Consumes: nothing.
- Produces: `models.Studio` with columns `name_en`, `name_cn`, `name_jp`, `name_alt`, `display_name_field`, `founded_date`, `defunct_date`, `country`, `website_url`, `mal_id`, `mal_link`. `name_native` no longer exists. Constraints named `uq_studio_name`, `ck_studio_has_a_name`, `ck_studio_founded_date`, `ck_studio_defunct_date`.

Background the implementer needs: three of the four name columns are NULL on a typical row, and Postgres treats two NULLs as distinct by default — so a plain `UNIQUE` across them would be **inert**, silently allowing duplicates. `postgresql_nulls_not_distinct=True` is what makes it real. The same trap is documented on `uq_person_name` and `uq_media_credit_row`.

- [ ] **Step 1: Write the failing test**

Replace the body of `tests/api/test_studio_model.py`:

```python
"""The studio table."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_studio_needs_only_one_name(db_session):
    s = models.Studio(name_jp="京都アニメーション")
    db_session.add(s)
    db_session.commit()
    assert s.system_id is not None


def test_studio_with_no_name_at_all_is_rejected(db_session):
    db_session.add(models.Studio())
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_names_are_unique_together(db_session):
    db_session.add(models.Studio(name_en="MAPPA"))
    db_session.commit()
    db_session.add(models.Studio(name_en="MAPPA"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_carries_the_profile_columns(db_session):
    s = models.Studio(
        name_en="Kyoto Animation",
        name_jp="京都アニメーション",
        name_cn="京都動畫",
        name_alt="KyoAni",
        display_name_field="alt",
        my_rating="S",
        logo_file="k.png",
        founded_date="1985-11",
        country="Japan",
        website_url="https://www.kyotoanimation.co.jp/",
        mal_id=2,
    )
    db_session.add(s)
    db_session.commit()
    assert (s.country, s.founded_date, s.mal_id) == ("Japan", "1985-11", 2)


def test_founded_date_must_be_truncated_iso(db_session):
    db_session.add(models.Studio(name_en="Bad Date", founded_date="Nov 1985"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_has_no_role_table():
    assert not hasattr(models.Studio, "roles")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_model.py -v`
Expected: FAIL — `TypeError: 'name_jp' is an invalid keyword argument for Studio`.

- [ ] **Step 3: Reshape the model**

In `app/models/staff.py`, replace the `Studio` class's `__table_args__` and name columns. Import `CheckConstraint` from `sqlalchemy` and `NameFallbackMixin` from `app.models.base`:

```python
class Studio(Base, NameFallbackMixin):
    """
    One anime production studio.

    Publishers and distributors are deliberately NOT here - they need no
    profile, so they stay a single "Publisher / Distributor TW" vocabulary in
    system_option.

    All four names are nullable and at least one must be set: a studio is
    known by whichever names it is known by, and requiring a specific one
    would force a made-up value. display_name_field picks the one to show;
    see the display_name property for the fallback when it is NULL.
    """

    __tablename__ = "studio"
    __table_args__ = (
        # NULLS NOT DISTINCT: three of the four name columns are NULL on a
        # typical row, and Postgres treats two NULLs as distinct by default -
        # without this the constraint is INERT and duplicates commit cleanly.
        # Same lesson as uq_person_name and uq_media_credit_row.
        UniqueConstraint(
            "name_en",
            "name_cn",
            "name_jp",
            "name_alt",
            name="uq_studio_name",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_studio_has_a_name",
        ),
        CheckConstraint(
            r"founded_date IS NULL OR founded_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_studio_founded_date",
        ),
        CheckConstraint(
            r"defunct_date IS NULL OR defunct_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_studio_defunct_date",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name_en = Column(String, nullable=True, index=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    my_rating = Column(String, nullable=True)
    logo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    # Truncated ISO-8601, the format owned by app/utils/release_date.py.
    founded_date = Column(String, nullable=True)
    defunct_date = Column(String, nullable=True)
    country = Column(String, nullable=True)
    website_url = Column(String, nullable=True)
    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
```

- [ ] **Step 4: Write the migration**

Create `alembic/versions/s1t2u3d4i5o6_reshape_studio_names.py`:

```python
"""Reshape studio names into four optional fields with a display choice.

name_native held a single required name. Verified against the production
data on 2026-09-04: of 77 rows, 72 are pure Latin/romanised names and 5
carry an embedded CJK name in parentheses, so every value is an English
name and name_native -> name_en is lossless. The five composite names stay
intact; splitting them is admin data cleanup, not migration logic.

Revision ID: s1t2u3d4i5o6
Revises: o1r2p3h4a5n6
"""

import sqlalchemy as sa
from alembic import op

revision = "s1t2u3d4i5o6"
down_revision = "o1r2p3h4a5n6"
branch_labels = None
depends_on = None

ISO = r"^\d{4}(-\d{2}(-\d{2})?)?$"


def upgrade() -> None:
    for name, column in [
        ("name_cn", sa.Column("name_cn", sa.String(), nullable=True)),
        ("name_jp", sa.Column("name_jp", sa.String(), nullable=True)),
        ("name_alt", sa.Column("name_alt", sa.String(), nullable=True)),
        ("display_name_field", sa.Column("display_name_field", sa.String(), nullable=True)),
        ("founded_date", sa.Column("founded_date", sa.String(), nullable=True)),
        ("defunct_date", sa.Column("defunct_date", sa.String(), nullable=True)),
        ("country", sa.Column("country", sa.String(), nullable=True)),
        ("website_url", sa.Column("website_url", sa.String(), nullable=True)),
        ("mal_id", sa.Column("mal_id", sa.Integer(), nullable=True)),
        ("mal_link", sa.Column("mal_link", sa.String(), nullable=True)),
    ]:
        op.add_column("studio", column)

    # name_en already exists and is NULL on every row, so nothing is lost.
    op.execute("UPDATE studio SET name_en = name_native WHERE name_en IS NULL")

    op.drop_constraint("uq_studio_name", "studio", type_="unique")
    op.drop_column("studio", "name_native")

    op.create_index("ix_studio_name_en", "studio", ["name_en"])
    op.create_unique_constraint(
        "uq_studio_name",
        "studio",
        ["name_en", "name_cn", "name_jp", "name_alt"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_check_constraint(
        "ck_studio_has_a_name",
        "studio",
        "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
    )
    op.create_check_constraint(
        "ck_studio_founded_date", "studio", f"founded_date IS NULL OR founded_date ~ '{ISO}'"
    )
    op.create_check_constraint(
        "ck_studio_defunct_date", "studio", f"defunct_date IS NULL OR defunct_date ~ '{ISO}'"
    )


def downgrade() -> None:
    op.drop_constraint("ck_studio_defunct_date", "studio", type_="check")
    op.drop_constraint("ck_studio_founded_date", "studio", type_="check")
    op.drop_constraint("ck_studio_has_a_name", "studio", type_="check")
    op.drop_constraint("uq_studio_name", "studio", type_="unique")
    op.drop_index("ix_studio_name_en", table_name="studio")

    op.add_column("studio", sa.Column("name_native", sa.String(), nullable=True))
    op.execute(
        "UPDATE studio SET name_native = "
        "COALESCE(name_en, name_cn, name_jp, name_alt)"
    )
    op.alter_column("studio", "name_native", nullable=False)
    op.create_index("ix_studio_name_native", "studio", ["name_native"])

    for column in [
        "mal_link", "mal_id", "website_url", "country",
        "defunct_date", "founded_date", "display_name_field",
        "name_alt", "name_jp", "name_cn",
    ]:
        op.drop_column("studio", column)

    op.create_unique_constraint(
        "uq_studio_name",
        "studio",
        ["name_native", "name_en"],
        postgresql_nulls_not_distinct=True,
    )
```

- [ ] **Step 5: Apply it and confirm a single head**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Then: `venv/Scripts/python.exe -m alembic heads`
Expected: exactly one line, `s1t2u3d4i5o6 (head)`.

Then confirm the backfill on real data:

Run: `venv/Scripts/python.exe -c "from app.database import SessionLocal; from app import models; db=SessionLocal(); print(db.query(models.Studio).count(), db.query(models.Studio).filter(models.Studio.name_en.is_(None)).count())"`
Expected: `77 0` — every row has an English name, none was lost.

- [ ] **Step 6: Round-trip the downgrade**

Run: `venv/Scripts/python.exe -m alembic downgrade -1` then `venv/Scripts/python.exe -m alembic upgrade head`
Expected: both succeed with no error, and the count check in Step 5 still prints `77 0`.

- [ ] **Step 7: Update the uniqueness test**

`tests/api/test_person_studio_uniqueness.py` constructs studios with `name_native`. Read it, and change every `models.Studio(name_native=X)` to `models.Studio(name_en=X)`; where a test asserts that two studios differing only in `name_en` collide, it now needs them to differ in one of the four columns to *not* collide.

- [ ] **Step 8: Run the model tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_model.py tests/api/test_person_studio_uniqueness.py -v`
Expected: PASS. Other studio tests still fail — Tasks 2 and 3 fix them.

- [ ] **Step 9: Propose the commit** (wait for approval before running)

```bash
git add app/models/staff.py alembic/versions/s1t2u3d4i5o6_reshape_studio_names.py tests/api/test_studio_model.py tests/api/test_person_studio_uniqueness.py
git commit -m "feat(studio): four optional name fields and profile columns"
```

---

### Task 2: Display name, and the resolver every writer funnels through

**Files:**
- Modify: `app/models/staff.py` (add two properties to `Studio`), `app/services/domain/credits.py:34-90,225-243`
- Test: `tests/api/test_studio_model.py` (append), `tests/api/test_credits_service.py`

**Interfaces:**
- Consumes: `models.Studio` from Task 1.
- Produces: `Studio.display_name -> str`, `Studio.names_dict -> dict`, `_find_by_name` matching all four studio name fields, `credit_names` returning a studio's `display_name`.

This is the sharp edge of the whole change. `_find_by_name` is how a studio name arriving from Tenrai lands on the same row as one typed into the Add form. Four writers reach it — the data migration, the credits API, Fill/Pull, and the Sheets restore — and only one is the API. A miss creates a duplicate row and splits a studio's credits silently.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_studio_model.py`:

```python
def test_display_name_honours_the_chosen_field(db_session):
    s = models.Studio(
        name_en="Kyoto Animation", name_alt="KyoAni", display_name_field="alt"
    )
    assert s.display_name == "KyoAni"


def test_display_name_falls_back_when_the_chosen_field_is_empty(db_session):
    s = models.Studio(name_en="Kyoto Animation", display_name_field="alt")
    assert s.display_name == "Kyoto Animation"


def test_display_name_falls_back_en_cn_jp_alt_when_unchosen(db_session):
    assert models.Studio(name_cn="京都動畫", name_jp="京アニ").display_name == "京都動畫"
    assert models.Studio(name_jp="京アニ").display_name == "京アニ"
    assert models.Studio(name_alt="KyoAni").display_name == "KyoAni"
```

Append to `tests/api/test_credits_service.py`:

```python
def test_find_studio_matches_a_japanese_name(db_session):
    from app.services.domain.credits import find_studio

    db_session.add(models.Studio(name_en="Kyoto Animation", name_jp="京都アニメーション"))
    db_session.commit()
    assert find_studio(db_session, "京都アニメーション").name_en == "Kyoto Animation"


def test_find_studio_matches_an_alt_name(db_session):
    from app.services.domain.credits import find_studio

    db_session.add(models.Studio(name_en="Kyoto Animation", name_alt="KyoAni"))
    db_session.commit()
    assert find_studio(db_session, "kyoani").name_en == "Kyoto Animation"


def test_a_credited_display_name_resolves_back_to_the_same_row(db_session):
    """The Sheets round trip: backup writes display_name, restore resolves it."""
    import uuid

    from app.services.domain.credits import credit_names, resolve_studio

    studio = models.Studio(
        name_en="Kyoto Animation", name_alt="KyoAni", display_name_field="alt"
    )
    db_session.add(studio)
    db_session.flush()
    entry_id = uuid.uuid4()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=entry_id,
            role="studio",
            studio_id=studio.system_id,
        )
    )
    db_session.commit()

    written = credit_names(db_session, "anime", entry_id, "studio")
    assert written == ["KyoAni"]
    assert resolve_studio(db_session, written[0]).system_id == studio.system_id
```

- [ ] **Step 2: Run them and watch them fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_model.py tests/api/test_credits_service.py -v -k "display_name or find_studio or resolves_back"`
Expected: FAIL — `AttributeError: 'Studio' object has no attribute 'display_name'`, and the `find_studio` cases return `None`.

- [ ] **Step 3: Add the properties**

Append inside `Studio` in `app/models/staff.py`:

```python
    # Which column each display_name_field value names.
    _DISPLAY_FIELDS = {
        "en": "name_en", "cn": "name_cn", "jp": "name_jp", "alt": "name_alt",
    }

    @property
    def names_dict(self) -> dict:
        """Every name variation, for resolution and for the detail page."""
        return {
            "en": self.name_en,
            "cn": self.name_cn,
            "jp": self.name_jp,
            "alt": self.name_alt,
        }

    @property
    def display_name(self) -> str:
        """
        The name to show. Unlike every media model, whose fallback chain is
        hard-coded per type, a studio's choice is DATA: display_name_field
        names the winner. The chain below is only the fallback for when that
        is NULL or names an empty column.
        """
        chosen = self._DISPLAY_FIELDS.get(self.display_name_field or "")
        if chosen:
            value = getattr(self, chosen)
            if value and value.strip():
                return value.strip()
        sequence = [
            ("EN", self.name_en),
            ("CN", self.name_cn),
            ("JP", self.name_jp),
            ("Alt", self.name_alt),
        ]
        return self.get_fallback_name(sequence, "EN")
```

- [ ] **Step 4: Extend the resolver**

In `app/services/domain/credits.py`, `_find_by_name` currently hard-codes `row.name_native` and `row.name_en`. Make it read the model's declared name fields instead, so `Person` and `Studio` each match on everything they have:

```python
def _find_by_name(db: Session, model, name: str):
    """
    Find an entity whose stored name normalizes to the same key.

    Fields come from the model's _name_fields, so a studio matches on any of
    its four names - a Japanese name from Tenrai and an English one typed
    into the Add form must land on the same row, or the studio's credits
    split in two.

    Linear scan over the whole table in Python rather than a SQL filter -
    normalize_name folds width/case/whitespace in ways SQL can't express
    portably, and these tables are small enough that this stays cheap.
    """
    key = normalize_name(name)
    fields = getattr(model, "_name_fields", None) or ["name_native", "name_en"]
    for row in db.query(model).all():
        for field in fields:
            value = getattr(row, field, None)
            if value and normalize_name(value) == key:
                return row
    return None
```

Confirm `Person._name_fields` lists its name columns; if it is empty, set it to `["name_native", "name_en", "name_cn"]` so person behaviour is unchanged.

Then change `resolve_studio` to construct on the new column:

```python
def resolve_studio(db: Session, name: str) -> models.Studio:
    """Find or create the studio. A new one is created under its English name."""
    studio = _find_by_name(db, models.Studio, name)
    if studio is None:
        studio = models.Studio(name_en=name.strip())
        db.add(studio)
        db.flush()
    return studio
```

And in `credit_names`, replace `out.append(entity.name_native)` with:

```python
        if entity is not None:
            # A studio's shown name is its own choice; a person's is still
            # name_native. This value reaches the anime payload, the admin
            # form and the Sheets column - all three read the same string.
            out.append(
                entity.display_name if row.studio_id else entity.name_native
            )
```

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_model.py tests/api/test_credits_service.py tests/api/test_credits_sheets.py tests/api/test_credit_backfill.py tests/api/test_fill_credit_resolution.py -v`
Expected: PASS. If `test_credits_sheets.py` or `test_credit_backfill.py` fail, they are asserting on `name_native` — update those assertions to the new columns; do **not** change the production code to satisfy a stale test without reading why it existed.

- [ ] **Step 6: Propose the commit** (wait for approval)

```bash
git add app/models/staff.py app/services/domain/credits.py tests/api/test_studio_model.py tests/api/test_credits_service.py
git commit -m "feat(studio): per-row display name and four-field name resolution"
```

---

### Task 3: Studio schemas and the router's existing endpoints

**Files:**
- Modify: `app/schemas/staff.py:79-101`, `app/routers/studio.py:29-81`
- Test: `tests/api/test_studio_router.py`

**Interfaces:**
- Consumes: `Studio.display_name` from Task 2.
- Produces: `StudioResponse` carrying `name_en/cn/jp/alt`, `display_name_field`, `display_name`, the six profile fields and `credit_count`. `POST`/`PUT /api/studio/` reject a payload with no name (422).

- [ ] **Step 1: Write the failing tests**

Rewrite the `name_native` usages in `tests/api/test_studio_router.py` and add:

```python
def test_create_rejects_a_studio_with_no_name(admin_client):
    assert admin_client.post("/api/studio/", json={"my_rating": "S"}).status_code == 422


def test_response_carries_the_display_name(admin_client):
    created = admin_client.post(
        "/api/studio/",
        json={"name_en": "Kyoto Animation", "name_alt": "KyoAni",
              "display_name_field": "alt"},
    ).json()
    assert created["display_name"] == "KyoAni"


def test_list_is_sorted_by_display_name(admin_client, client):
    admin_client.post("/api/studio/", json={"name_en": "WIT STUDIO"})
    admin_client.post("/api/studio/", json={"name_en": "MAPPA"})
    names = [s["display_name"] for s in client.get("/api/studio/").json()]
    assert names == ["MAPPA", "WIT STUDIO"]


def test_profile_columns_round_trip(admin_client):
    created = admin_client.post("/api/studio/", json={"name_en": "MAPPA"}).json()
    r = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={"name_en": "MAPPA", "country": "Japan", "founded_date": "2011-06",
              "website_url": "https://mappa.co.jp", "mal_id": 569},
    )
    assert r.json()["country"] == "Japan"
    assert r.json()["founded_date"] == "2011-06"
```

- [ ] **Step 2: Run and watch fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_router.py -v`
Expected: FAIL — the POST returns 422 for a body with no `name_native`, and `display_name` is missing from the response.

- [ ] **Step 3: Update the schemas**

In `app/schemas/staff.py`, replace `StudioBase` and `StudioResponse`:

```python
class StudioBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    my_rating: Optional[str] = None
    logo_file: Optional[str] = None
    remark: Optional[str] = None
    founded_date: Optional[str] = None
    defunct_date: Optional[str] = None
    country: Optional[str] = None
    website_url: Optional[str] = None
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None

    @model_validator(mode="after")
    def at_least_one_name(self):
        """
        Mirrors ck_studio_has_a_name, so a nameless studio is a 422 from the
        API rather than a 500 surfacing the database's IntegrityError.
        """
        if not any(
            (self.name_en, self.name_cn, self.name_jp, self.name_alt)
        ):
            raise ValueError("A studio needs at least one name.")
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


class StudioResponse(StudioBase):
    system_id: UUID
    display_name: str = ""
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)
```

Add `model_validator` to the `pydantic` import at the top of the file.

- [ ] **Step 4: Update the router**

In `app/routers/studio.py`, `_to_response` restates every field by hand. Replace the construction with the new shape, adding `display_name=studio.display_name` and the six profile fields alongside the four names. Then change the list ordering — `order_by(models.Studio.name_native)` no longer exists, and display name is a Python property, so sort after loading:

```python
    studios = db.query(models.Studio).all()
    studios.sort(key=lambda s: s.display_name.casefold())
```

Update `create_studio`'s find-or-create to look up on whichever name the payload carries:

```python
    first_name = next(
        n for n in (payload.name_en, payload.name_cn, payload.name_jp, payload.name_alt)
        if n
    )
    studio = find_studio(db, first_name)
```

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_router.py -v`
Expected: PASS.

- [ ] **Step 6: Full backend gate**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: both clean. Any remaining failure names a file still using `name_native` — fix that file.

- [ ] **Step 7: Propose the commit** (wait for approval)

```bash
git add app/schemas/staff.py app/routers/studio.py tests/api/test_studio_router.py
git commit -m "feat(studio): serve the new name shape and validate at the API"
```

---

### Task 4: `GET /api/studio/{system_id}/entries`

**Files:**
- Modify: `app/routers/studio.py` (new endpoint after `get_studio_by_id`)
- Test: `tests/api/test_studio_entries.py` (create)

**Interfaces:**
- Consumes: `filter_visible_pairs(db, viewer, pairs) -> set[tuple[str, UUID]]` from `app/services/rbac/enforcement.py:97`; `MEDIA_TABLES` from `app/utils/media_resolver.py`.
- Produces: `GET /api/studio/{system_id}/entries` returning
  `{"groups": [{"media_type": str, "label": str, "nav_path": str｜None, "entries": [{"system_id": str, "display_name": str, "cover_image_file": str｜None, "release_date": str｜None}]}]}`,
  groups ordered as `MEDIA_TABLES` is, entries newest-first by release date.

RBAC is the point of this endpoint, not an afterthought. `_to_response` already runs `filter_visible_pairs` for `credit_count`; this endpoint makes the same call for the entries themselves, so the count and the list can never disagree.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_studio_entries.py`:

```python
"""The entries credited to a studio, and who may see them."""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import label_perm
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import HIDDEN_NAME, make_viewer


@pytest.fixture
def mappa(db_session):
    studio = models.Studio(name_en="MAPPA")
    db_session.add(studio)
    db_session.flush()
    return studio


def credit(db_session, studio, media_type, entry_id):
    db_session.add(
        models.MediaCredit(
            media_type=media_type,
            entry_id=entry_id,
            role="studio",
            studio_id=studio.system_id,
        )
    )
    db_session.commit()


def test_lists_the_entries_credited_to_the_studio(
    admin_client, db_session, mappa, sample_anime
):
    credit(db_session, mappa, "anime", sample_anime.system_id)
    body = admin_client.get(f"/api/studio/{mappa.system_id}/entries").json()
    assert body["groups"][0]["media_type"] == "anime"
    assert body["groups"][0]["entries"][0]["system_id"] == str(sample_anime.system_id)


def test_a_studio_with_no_credits_returns_no_groups(admin_client, mappa):
    body = admin_client.get(f"/api/studio/{mappa.system_id}/entries").json()
    assert body["groups"] == []


def test_unknown_studio_is_404(admin_client):
    r = admin_client.get(f"/api/studio/{uuid.uuid4()}/entries")
    assert r.status_code == 404


def test_a_labelled_entry_is_hidden_from_a_viewer_without_the_permission(
    client, db_session, mappa, hidden_anime, nsfw_label
):
    credit(db_session, mappa, "anime", hidden_anime.system_id)
    make_viewer(db_session, client, "plain", default_guest_permissions())
    r = client.get(f"/api/studio/{mappa.system_id}/entries")
    # Assert on the whole body, not parsed fields: a title can leak through a
    # key this test does not model.
    assert HIDDEN_NAME not in r.text
    assert r.json()["groups"] == []


def test_the_same_entry_is_visible_to_a_viewer_holding_the_label(
    client, db_session, mappa, hidden_anime, nsfw_label
):
    credit(db_session, mappa, "anime", hidden_anime.system_id)
    make_viewer(
        db_session,
        client,
        "labelled",
        list(default_guest_permissions()) + [label_perm(nsfw_label.key)],
    )
    assert HIDDEN_NAME in client.get(f"/api/studio/{mappa.system_id}/entries").text
```

If `sample_anime` is not an existing fixture in `tests/conftest.py`, add a local fixture in this file building a `models.Anime` the way `tests/api/test_visibility.py:hidden_anime` does, but without the label.

- [ ] **Step 2: Run and watch fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_entries.py -v`
Expected: FAIL with 404 on every case — the route does not exist.

- [ ] **Step 3: Implement the endpoint**

Add to `app/routers/studio.py`, in the public-read section:

```python
@router.get("/{system_id}/entries", summary="Entries Credited to This Studio")
def get_studio_entries(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The entries this studio is credited on, grouped by media type.

    The reverse of GET /api/credits/{media_type}/{entry_id}. Visibility runs
    through the same filter_visible_pairs call _to_response uses for
    credit_count, so the number on the card and the list on the page can
    never disagree. A studio carries no content label of its own, so one
    whose every credit is hidden answers with empty groups, not a 404 - the
    studio is not the secret, its credits are.
    """
    studio = db.get(models.Studio, system_id)
    if studio is None:
        raise HTTPException(status_code=404, detail="Studio not found.")

    rows = (
        db.query(models.MediaCredit.media_type, models.MediaCredit.entry_id)
        .filter(models.MediaCredit.studio_id == system_id)
        .all()
    )
    visible = filter_visible_pairs(
        db, viewer, [(mt, eid) for mt, eid in rows if mt and eid]
    )

    groups = []
    for media_type, ref in MEDIA_TABLES.items():
        ids = [eid for mt, eid in visible if mt == media_type]
        if not ids:
            continue
        entries = (
            db.query(ref.model).filter(ref.model.system_id.in_(ids)).all()
        )
        payload = [
            {
                "system_id": str(entry.system_id),
                "display_name": entry.display_name,
                "cover_image_file": getattr(entry, "cover_image_file", None),
                "release_date": primary_release_value(media_type, entry),
            }
            for entry in entries
        ]
        # Newest first; an undated entry sorts last, as UNDATED does elsewhere.
        payload.sort(key=lambda e: e["release_date"] or "", reverse=True)
        groups.append(
            {
                "media_type": media_type,
                "label": ref.label,
                "nav_path": ref.nav_path,
                "entries": payload,
            }
        )
    return {"groups": groups}
```

Add the imports: `from app.utils.media_resolver import MEDIA_TABLES`. For `primary_release_value`, check `app/utils/release_date.py` for an existing helper that reads `RELEASE_PRIORITY[media_type]` off an entry — that module owns the format and already maps media type to its release columns. If no such helper is exported, add one there (not in the router):

```python
def primary_release_value(media_type: str, entry) -> Optional[str]:
    """The entry's most meaningful release date, per RELEASE_PRIORITY."""
    for column in RELEASE_PRIORITY.get(media_type, ()):
        value = getattr(entry, column, None)
        if value:
            return value
    return None
```

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_studio_entries.py -v`
Expected: PASS, all six.

- [ ] **Step 5: Propose the commit** (wait for approval)

```bash
git add app/routers/studio.py app/utils/release_date.py tests/api/test_studio_entries.py
git commit -m "feat(studio): endpoint for the entries a studio is credited on"
```

---

### Task 5: `studio_refs` on the anime and anime-movie payloads

**Files:**
- Modify: `app/schemas/link_fields.py:26-40`, `app/services/domain/credits.py` (`attach_link_fields`)
- Test: `tests/api/test_credits_router.py` or `tests/unit/test_link_fields_schema.py`

**Interfaces:**
- Consumes: `Studio.display_name` (Task 2).
- Produces: `studio_refs: list[{"system_id": str, "display_name": str}]` on `AnimeResponse` and `AnimeMovieResponse`, ordered by `media_credit.position`.

The existing `studio` key is a comma-joined string with **no ids**, which is why the detail page cannot link today. `studio` stays exactly as it is — it is the legacy column name and the Sheets contract. `studio_refs` is added beside it.

Note `tests/unit/test_link_fields_schema.py` asserts these classes stay in step with `credit_roles.sheet_column_for`. Read it before editing: `studio_refs` is not a sheet column, so that test needs to know to skip it.

- [ ] **Step 1: Write the failing test**

Add to `tests/api/test_credits_router.py`:

```python
def test_anime_payload_carries_linkable_studio_refs(
    admin_client, db_session, sample_anime
):
    studio = models.Studio(name_en="MAPPA")
    db_session.add(studio)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=sample_anime.system_id,
            role="studio",
            studio_id=studio.system_id,
            position=0,
        )
    )
    db_session.commit()

    body = admin_client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert body["studio"] == "MAPPA"          # legacy string, unchanged
    assert body["studio_refs"] == [
        {"system_id": str(studio.system_id), "display_name": "MAPPA"}
    ]
```

- [ ] **Step 2: Run and watch fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_router.py -v -k studio_refs`
Expected: FAIL — `KeyError: 'studio_refs'`.

- [ ] **Step 3: Add the field**

In `app/schemas/link_fields.py`:

```python
class StudioRef(BaseModel):
    """A studio a page can link to. The `studio` string beside it has no ids."""

    system_id: UUID
    display_name: str


class AnimeLinkFields(BaseModel):
    studio: Optional[str] = None
    studio_refs: list[StudioRef] = []
    director: Optional[str] = None
    # ... the remaining fields unchanged
```

Add the same `studio_refs` line to `AnimeMovieLinkFields`. Import `UUID` and `BaseModel` as needed.

- [ ] **Step 4: Populate it**

In `attach_link_fields` in `app/services/domain/credits.py`, wherever the studio role's comma-joined string is set, also set the refs. It already batches over a whole list (`app/routers/_factory.py:114`), so build the refs from the same credit rows already loaded — do **not** issue a query per entry, which would be an N+1 on every library page.

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_credits_router.py tests/unit/test_link_fields_schema.py -v`
Expected: PASS.

- [ ] **Step 6: Check for the N+1**

Run the anime library list endpoint against the dev database and confirm the query count did not scale with the number of entries — e.g. log `echo=True` on the engine for one request, or time `GET /api/anime/?limit=2000` before and after. Expected: no per-entry studio query.

- [ ] **Step 7: Propose the commit** (wait for approval)

```bash
git add app/schemas/link_fields.py app/services/domain/credits.py tests/api/test_credits_router.py
git commit -m "feat(studio): carry linkable studio refs on anime payloads"
```

---

### Task 6: The frontend display-name helper

**Files:**
- Modify: `frontend/src/lib/naming.js`, `frontend/src/api/endpoints.js`
- Test: `frontend/src/lib/naming.test.js` (create if absent)

**Interfaces:**
- Produces: `displayStudioName(studio) -> string`, `STUDIO_NAME_FIELDS` (an array of `{key, label, field}` for rendering the other names), `endpoints.studio.entries(id)`.

The backend already sends `display_name`, so this helper is the fallback for the one place that does not have it — a form previewing an unsaved studio. Keep the two implementations in lockstep; that is the same division of labour `Anime.display_name` and `getDisplayName` already have.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/naming.test.js` (or append if it exists):

```javascript
import { describe, expect, it } from "vitest";
import { displayStudioName } from "./naming";

describe("displayStudioName", () => {
  it("honours the chosen field", () => {
    expect(
      displayStudioName({
        name_en: "Kyoto Animation",
        name_alt: "KyoAni",
        display_name_field: "alt",
      }),
    ).toBe("KyoAni");
  });

  it("falls back when the chosen field is empty", () => {
    expect(
      displayStudioName({ name_en: "Kyoto Animation", display_name_field: "alt" }),
    ).toBe("Kyoto Animation");
  });

  it("falls back en -> cn -> jp -> alt when unchosen", () => {
    expect(displayStudioName({ name_cn: "京都動畫", name_jp: "京アニ" })).toBe("京都動畫");
    expect(displayStudioName({ name_jp: "京アニ" })).toBe("京アニ");
    expect(displayStudioName({ name_alt: "KyoAni" })).toBe("KyoAni");
  });

  it("returns an empty string for a studio with no names", () => {
    expect(displayStudioName({})).toBe("");
    expect(displayStudioName(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `cd frontend && npx vitest run src/lib/naming.test.js`
Expected: FAIL — `displayStudioName is not a function`.

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/naming.js`:

```javascript
// Studio names. Unlike the media types above, whose fallback chain is fixed
// per type, a studio picks its own display field - display_name_field is
// data. This mirrors Studio.display_name on the backend; change both or
// neither.
export const STUDIO_NAME_FIELDS = [
  { key: "en", label: "English", field: "name_en" },
  { key: "cn", label: "Chinese", field: "name_cn" },
  { key: "jp", label: "Japanese", field: "name_jp" },
  { key: "alt", label: "Alternative", field: "name_alt" },
];

export function displayStudioName(studio) {
  if (!studio) return "";
  const chosen = STUDIO_NAME_FIELDS.find(
    (f) => f.key === studio.display_name_field,
  );
  if (chosen && studio[chosen.field]?.trim()) return studio[chosen.field].trim();
  for (const { field } of STUDIO_NAME_FIELDS) {
    if (studio[field]?.trim()) return studio[field].trim();
  }
  return "";
}
```

Add to the `studio` block in `frontend/src/api/endpoints.js`:

```javascript
    entries: (id) => `/api/studio/${id}/entries`,
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/lib/naming.test.js`
Expected: PASS, all four.

- [ ] **Step 5: Propose the commit** (wait for approval)

```bash
git add frontend/src/lib/naming.js frontend/src/lib/naming.test.js frontend/src/api/endpoints.js
git commit -m "feat(studio): frontend display-name helper and entries endpoint"
```

---

### Task 7: The public studio library page

**Files:**
- Create: `frontend/src/pages/library/StudioLibrary.jsx`, `frontend/src/pages/library/StudioLibrary.test.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/components/layout/Nav.jsx`

**Interfaces:**
- Consumes: `displayStudioName`, `STUDIO_NAME_FIELDS` (Task 6); `GET /api/studio/` returning `display_name`, `credit_count`, `logo_file`, `my_rating` (Task 3).
- Produces: the route `/library/studio`.

Follow `CollectionLibrary.jsx` and `FranchiseLibrary.jsx`: they sit at `/library/collection` and `/library/franchise` as standalone components, deliberately outside the `LIBRARY_CONFIGS` media-type machinery, because they are not media types. Neither is a studio. Read `CollectionLibrary.jsx` first and match its structure, loading states and card layout rather than inventing a new one.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/library/StudioLibrary.test.jsx`. Mock `fetch` to return three studios and assert:

```javascript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudioLibrary from "./StudioLibrary";

const STUDIOS = [
  { system_id: "1", name_en: "MAPPA", display_name: "MAPPA", credit_count: 12 },
  { system_id: "2", name_en: "Kyoto Animation", name_alt: "KyoAni",
    display_name_field: "alt", display_name: "KyoAni", credit_count: 30 },
  { system_id: "3", name_jp: "京都アニメーション", display_name: "京都アニメーション",
    credit_count: 1 },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(STUDIOS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StudioLibrary />
    </MemoryRouter>,
  );
}

describe("StudioLibrary", () => {
  it("lists every studio by its display name", async () => {
    renderPage();
    expect(await screen.findByText("KyoAni")).toBeInTheDocument();
    expect(screen.getByText("MAPPA")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    await userEvent.type(screen.getByRole("searchbox"), "Kyoto Animation");
    await waitFor(() => {
      expect(screen.getByText("KyoAni")).toBeInTheDocument();
      expect(screen.queryByText("MAPPA")).not.toBeInTheDocument();
    });
  });

  it("links each studio to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /KyoAni/ })).toHaveAttribute(
      "href",
      "/studio/2",
    );
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `cd frontend && npx vitest run src/pages/library/StudioLibrary.test.jsx`
Expected: FAIL — cannot resolve `./StudioLibrary`.

- [ ] **Step 3: Build the page**

Create `frontend/src/pages/library/StudioLibrary.jsx`. Requirements:

- Fetch `/api/studio/` with `credentials: "include"`, holding `loading` and `error` state, as `CollectionLibrary` does.
- A search box (`type="search"`, so `getByRole("searchbox")` finds it) matching case-insensitively against **all four** name fields via `STUDIO_NAME_FIELDS`, not just the displayed one — a viewer searching "Kyoto Animation" must find a studio displaying "KyoAni".
- Sort control: name (default, `localeCompare` on the display name), credit count desc, rating (use the existing `getRatingWeight` from `utils/media`).
- A card per studio: logo via `getCoverUrl(studio.logo_file)` from `lib/covers` with the `FALLBACK_SVG` fallback, the display name, and the credit count. The whole card is a `<Link to={`/studio/${studio.system_id}`}>`.
- Semantic tokens only — `bg-surface`, `text-text-muted`, `border-border`. No `slate-*`/`gray-*`, or `theme-tokens.test.js` fails the build.
- An empty state when the search matches nothing.

- [ ] **Step 4: Wire the route and nav**

In `frontend/src/App.jsx`, beside the existing `/library/collection` and `/library/franchise` routes:

```javascript
const StudioLibrary = lazy(() => import("./pages/library/StudioLibrary"));
```
```javascript
                <Route path="/library/studio" element={<StudioLibrary />} />
```

Add a Studio link to the catalog drawer in `frontend/src/components/layout/Nav.jsx`, next to the franchise and collection library links. Match the surrounding markup exactly.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/pages/library/StudioLibrary.test.jsx`
Expected: PASS, all three.

- [ ] **Step 6: Build and check both ports**

Run: `cd frontend && npm run build`
Then load `/library/studio` on :5173 **and** :8000 and confirm the page renders on both. A change that works only on :5173 is a stale build.

- [ ] **Step 7: Propose the commit** (wait for approval)

```bash
git add frontend/src/pages/library/StudioLibrary.jsx frontend/src/pages/library/StudioLibrary.test.jsx frontend/src/App.jsx frontend/src/components/layout/Nav.jsx
git commit -m "feat(studio): public studio library page"
```

---

### Task 8: The public studio detail page

**Files:**
- Create: `frontend/src/pages/detail/Studio.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/studio/{id}` and `endpoints.studio.entries(id)` (Tasks 3–4, 6).
- Produces: the route `/studio/:system_id`.

Read an existing detail page first — `frontend/src/pages/detail/Franchise.jsx` is the closest shape (a profile header plus grouped member entries) — and match its layout primitives, loading and 404 handling rather than inventing new ones.

- [ ] **Step 1: Build the page**

Create `frontend/src/pages/detail/Studio.jsx`:

- Read `system_id` from `useParams`, fetch the studio and its entries. A 404 on the studio renders the same not-found state other detail pages use.
- Header: logo via `getCoverUrl(studio.logo_file)`, the `display_name` as the heading, and beneath it the other three names labelled by `STUDIO_NAME_FIELDS` — skip any that are empty or that are the displayed one.
- A facts block: rating, country, founded–defunct (render as `founded – defunct`, `since founded` when there is no defunct date, and omit the row entirely when both are empty), website as an external link, MAL link when `mal_link` is set, and the remark.
- Credited entries: one section per group from the endpoint, each headed by the group's `label`, rendering entries as the existing `MediaCard` (read its props before using it) linking to `${nav_path}/${system_id}`.
- Empty groups: when `groups` is `[]`, show "No credited entries" rather than an empty page. Note this legitimately happens for a viewer whose permissions hide every credit — it is not an error state, so do not render it as one.
- Semantic tokens only.

- [ ] **Step 2: Wire the route**

In `frontend/src/App.jsx`, beside the other detail routes:

```javascript
const Studio = lazy(() => import("./pages/detail/Studio"));
```
```javascript
                <Route path="/studio/:system_id" element={<Studio />} />
```

- [ ] **Step 3: Verify against the real app**

Run: `cd frontend && npm run build`, then open a studio from `/library/studio` on :8000.
Expected: the profile renders, and the credited anime appear grouped under "Anime". Confirm at least one studio with credits (MAPPA or Kyoto Animation in the dev data) shows its entries.

- [ ] **Step 4: Check it as a guest**

Log out and open the same studio.
Expected: the page renders; entries the guest may not see are absent, and the credit count matches the number of entries listed.

- [ ] **Step 5: Run the frontend gates**

Run: `cd frontend && npm run test:run && npm run lint`
Expected: both clean.

- [ ] **Step 6: Propose the commit** (wait for approval)

```bash
git add frontend/src/pages/detail/Studio.jsx frontend/src/App.jsx
git commit -m "feat(studio): public studio detail page"
```

---

### Task 9: Link to studios from the entries that credit them

**Files:**
- Modify: `frontend/src/pages/detail/Anime.jsx:406`, `frontend/src/pages/detail/AnimeMovie.jsx`
- Test: an existing detail-page test, or a new `frontend/src/pages/detail/Anime.test.jsx`

**Interfaces:**
- Consumes: `studio_refs` (Task 5), the `/studio/:system_id` route (Task 8).

`Anime.jsx:406` currently renders `{ label: "Studio", value: anime.studio }` — a comma-joined string with no ids, which is exactly why it cannot link today.

- [ ] **Step 1: Write the failing test**

Assert that an anime whose payload carries `studio_refs` renders a link to `/studio/<id>` labelled with the studio's display name, and that an anime with an empty `studio_refs` still renders the plain `studio` string (older payloads and entries whose studio was never resolved must not blank out).

- [ ] **Step 2: Run and watch fail**

Run: `cd frontend && npx vitest run src/pages/detail/Anime.test.jsx`
Expected: FAIL — no link is rendered.

- [ ] **Step 3: Render linked chips**

Replace the flat value with chips built from `anime.studio_refs`, each a `<Link to={`/studio/${ref.system_id}`}>` showing `ref.display_name`. When `studio_refs` is empty or absent, fall back to rendering `anime.studio` as plain text exactly as today. Apply the same change in `AnimeMovie.jsx`.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/pages/detail/`
Expected: PASS.

- [ ] **Step 5: Verify in the app**

Run: `cd frontend && npm run build`, open an anime with a studio on :8000, click the studio.
Expected: it navigates to that studio's detail page, which lists this anime back.

- [ ] **Step 6: Propose the commit** (wait for approval)

```bash
git add frontend/src/pages/detail/Anime.jsx frontend/src/pages/detail/AnimeMovie.jsx frontend/src/pages/detail/Anime.test.jsx
git commit -m "feat(studio): link studios from anime and anime movie pages"
```

---

### Task 10: The Entity admin group, and moving the studio Add form into it

**Files:**
- Modify: `frontend/src/config/adminTabs.js`, `frontend/src/components/forms/OptionSubTabBar.jsx`, `frontend/src/pages/add-tabs/OptionsAddTab.jsx:190-243`, `frontend/src/pages/admin/Add.jsx:152,946-1050,2341+`
- Create: `frontend/src/pages/add-tabs/StudioAddTab.jsx`
- Test: `frontend/src/lib/optionCategoryGroups.test.js` or a new `frontend/src/config/adminTabs.test.js`

**Interfaces:**
- Produces: `TAB_GROUPS` containing `entity`; `ADMIN_TABS` containing `{key: "studio", group: "entity"}`; `StudioAddTab` as a component taking `{studioForm, usf}`.

The studio editor exists today in an odd place: `OPTION_SUB_TABS` puts "Studios" under System Option on the Add page. It **moves** into the new Entity group — leaving it would mean two ways to create a studio. "People" stays under System Option until the person work lands and follows it.

`Add.jsx` is ~2500 lines and shared with other sessions. Stage hunks, not the file, and re-read before committing.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/config/adminTabs.test.js`:

```javascript
import { describe, expect, it } from "vitest";
import { ADMIN_TABS, FORM_TABS, TAB_GROUPS, groupOf } from "./adminTabs";

describe("admin tab groups", () => {
  it("offers an Entity group beside Entries and Structure", () => {
    expect(TAB_GROUPS.map((g) => g.key)).toEqual([
      "entries",
      "structure",
      "entity",
    ]);
  });

  it("puts Studio in the Entity group", () => {
    expect(groupOf(ADMIN_TABS, "studio")).toBe("entity");
  });

  it("keeps Studio out of the form-defaults tabs", () => {
    // A studio is not a media entry and has no default field values,
    // like options / quote / meme.
    expect(FORM_TABS.map((t) => t.key)).not.toContain("studio");
  });
});
```

Add to `frontend/src/lib/optionCategoryGroups.test.js` (or wherever `OPTION_SUB_TABS` is covered):

```javascript
it("no longer offers Studios under System Option", () => {
  expect(OPTION_SUB_TABS.map((t) => t.key)).not.toContain("studios");
});
```

- [ ] **Step 2: Run and watch fail**

Run: `cd frontend && npx vitest run src/config/adminTabs.test.js`
Expected: FAIL — `TAB_GROUPS` has two entries and no `studio` tab exists.

- [ ] **Step 3: Add the group and tab**

In `frontend/src/config/adminTabs.js`:

```javascript
export const TAB_GROUPS = [
  { key: "entries", icon: "fa-photo-film", label: "Entries" },
  { key: "structure", icon: "fa-sitemap", label: "Structure" },
  // Entities are credited ON entries rather than being entries: a studio
  // today, people (director, author, seiyuu) when person gets its pages.
  { key: "entity", icon: "fa-industry", label: "Entity" },
];
```

Append to `ADMIN_TABS`:

```javascript
  {
    key: "studio",
    group: "entity",
    icon: "fa-industry",
    label: "Studio",
  },
```

Extend the `FORM_TABS` exclusion list to `["options", "quote", "meme", "studio"]`, and update its docstring to say why studio is excluded.

- [ ] **Step 4: Move the form**

Cut `StudioForm` out of `frontend/src/pages/add-tabs/OptionsAddTab.jsx:190-243` into a new `frontend/src/pages/add-tabs/StudioAddTab.jsx` as the default export, and extend it to the full field set: the four names, a `display_name_field` select (options: Default (English), English, Chinese, Japanese, Alternative), rating, logo file, country, `ReleaseDateInput` for founded and defunct, website, MAL id and link, and remark. Mark none of the four names `required`; instead disable submit while all four are empty, with a hint reading "A studio needs at least one name."

Remove the `studios` entry from `OPTION_SUB_TABS` in `OptionSubTabBar.jsx` and update its header comment, which currently explains that Add offers four sub-tabs.

In `Add.jsx`: change `emptyStudio()` to the new field set, drop the `optionsSubTab === "studios"` branch at line 947, add `activeTab === "studio"` to the submit switch calling `submitStudio()`, rewrite `submitStudio` (lines 1025-1049) to validate "at least one name" and POST the full payload with `|| null` for every empty field, and render `<StudioAddTab studioForm={studioForm} usf={usf} />` under `activeTab === "studio"`.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/config/adminTabs.test.js src/lib/optionCategoryGroups.test.js`
Expected: PASS.

- [ ] **Step 6: Verify in the app**

Run: `cd frontend && npm run build`, open `/system` → Add → Entity → Studio on :8000. Create a studio with only a Japanese name.
Expected: it saves, and appears on `/library/studio` displaying that Japanese name. Confirm the System Option tab no longer shows a Studios sub-tab.

- [ ] **Step 7: Re-read the diff, then propose the commit** (wait for approval)

```bash
git diff frontend/src/pages/admin/Add.jsx
```
Confirm every hunk is yours before staging. If `Add.jsx` carries another session's changes, stop and ask.

```bash
git add frontend/src/config/adminTabs.js frontend/src/config/adminTabs.test.js frontend/src/components/forms/OptionSubTabBar.jsx frontend/src/pages/add-tabs/StudioAddTab.jsx frontend/src/pages/add-tabs/OptionsAddTab.jsx frontend/src/pages/admin/Add.jsx
git commit -m "feat(admin): Entity tab group with the studio Add form"
```

---

### Task 11: Studio Modify and Delete

**Files:**
- Create: `frontend/src/pages/modify-tabs/StudioModifyTab.jsx`
- Modify: `frontend/src/pages/admin/Modify.jsx`, `frontend/src/pages/admin/Delete.jsx`

**Interfaces:**
- Consumes: `endpoints.studio.list/detail/update/remove/merge`; `StudioAddTab`'s field set (Task 10).

Without this task the six new columns can never be filled in, and the detail page ships empty. Read how `Modify.jsx` handles a non-media tab (the collection or franchise branch) and follow it: pick an existing row, load it into the form, PUT it back.

- [ ] **Step 1: Build the Modify tab**

Create `frontend/src/pages/modify-tabs/StudioModifyTab.jsx`: a picker listing studios by display name (searchable across all four names, reusing `displayStudioName`), and on selection the same field set as `StudioAddTab` loaded from `GET /api/studio/{id}`, saved with `PUT`. Share the field markup with `StudioAddTab` rather than copying it — export the fields component from `StudioAddTab.jsx` and use it in both.

Wire `activeTab === "studio"` into `Modify.jsx`'s tab rendering and its save switch.

- [ ] **Step 2: Build the Delete branch**

In `Delete.jsx`, add the studio branch: list studios with their credit counts, and on delete show a confirmation that says plainly that `media_credit.studio_id` is `ON DELETE CASCADE`, so deleting destroys this studio's credit history — and that for a duplicate the right action is **merge**, not delete. Offer merge in the same place: pick the studio to merge in, and `POST /api/studio/{keep}/merge` with `{source_id}`.

Do not trigger a JavaScript `confirm()` dialog — use the in-page confirmation pattern the other Delete branches use.

- [ ] **Step 3: Verify the round trip**

Run: `cd frontend && npm run build`, then on :8000: Modify a studio to set country, founded date, website and `display_name_field`; confirm `/library/studio` and the detail page both reflect the new display name and the new facts.

- [ ] **Step 4: Verify the merge**

Create a duplicate studio, credit it on an anime, then merge it into the original.
Expected: the anime now credits the surviving studio, the duplicate is gone, and the surviving studio's detail page lists that anime. This is the behaviour `POST /{id}/merge` already implements and `tests/api/test_studio_router.py` already covers — you are verifying the UI reaches it correctly.

- [ ] **Step 5: Run the frontend gates**

Run: `cd frontend && npm run test:run && npm run lint`
Expected: both clean.

- [ ] **Step 6: Re-read the diffs, then propose the commit** (wait for approval)

```bash
git add frontend/src/pages/modify-tabs/StudioModifyTab.jsx frontend/src/pages/admin/Modify.jsx frontend/src/pages/admin/Delete.jsx frontend/src/pages/add-tabs/StudioAddTab.jsx
git commit -m "feat(admin): studio Modify and Delete under the Entity group"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/data-model.md`, `docs/api.md`, `docs/business-rules.md`, `docs/frontend/pages.md`, `docs/frontend/admin-pages.md`, `docs/roadmap.md`

`CLAUDE.md`: when you change behaviour, update the matching doc in the same change and bump its `Last verified` line. Docs describe the code as it is — write what shipped, not what was planned.

- [ ] **Step 1: Update each doc**

- `docs/data-model.md` — the reshaped `studio` table, all four constraints, and why `NULLS NOT DISTINCT` is load-bearing.
- `docs/api.md` — `GET /api/studio/{id}/entries` with its response shape; the changed studio payloads; `studio_refs` on anime and anime-movie.
- `docs/business-rules.md` — display-name resolution for studios is data (`display_name_field`), not a hard-coded chain, and the fallback order.
- `docs/frontend/pages.md` — `/library/studio` and `/studio/:system_id`.
- `docs/frontend/admin-pages.md` — the Entity group, the studio Add/Modify/Delete tabs, and that Studios moved out of the System Option sub-tabs.
- `docs/roadmap.md` — add a "Done" row dated with the commit date; rewrite the deferred line "Public person and studio pages deferred" to cover **person only**, since the studio half is now shipped.

- [ ] **Step 2: Bump every `Last verified` line**

Each edited doc carries a `Last verified` line. Set it to the current date and the commit hash the docs land on.

- [ ] **Step 3: Full gate, all four**

```
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run
cd frontend && npm run lint
```
Expected: four clean runs. Report the actual output — do not claim green without seeing it.

- [ ] **Step 4: Propose the commit** (wait for approval)

```bash
git add docs/data-model.md docs/api.md docs/business-rules.md docs/frontend/pages.md docs/frontend/admin-pages.md docs/roadmap.md
git commit -m "docs(studio): record the studio entity pages and schema"
```

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| Decision A, Schema, Migration, Backfill | 1 |
| Decision C, resolver, `credit_names` | 2 |
| Schemas, existing endpoints | 3 |
| `GET /{id}/entries` | 4 |
| `studio_refs` | 5 |
| Frontend display helper | 6 |
| `/library/studio` | 7 |
| `/studio/:system_id` | 8 |
| Links from entries | 9 |
| Entity admin group, Add, the move out of option sub-tabs | 10 |
| Modify, Delete, merge | 11 |
| Documentation | 12 |
| Decision B (`country` a plain String) | 1 (column), 10–11 (editing) |
| Testing section | distributed across 1–11 |

**Naming consistency** — checked across tasks: `display_name_field` (never `display_field`); `displayStudioName` (never `getStudioName`); `STUDIO_NAME_FIELDS`; constraint names `uq_studio_name`, `ck_studio_has_a_name`, `ck_studio_founded_date`, `ck_studio_defunct_date`; endpoint `GET /api/studio/{system_id}/entries` returning `{"groups": [...]}`; `studio_refs` entries are `{system_id, display_name}`; migration revision `s1t2u3d4i5o6` on `down_revision = "o1r2p3h4a5n6"`.

**Known soft spots** — flagged rather than hidden:
- Task 4 Step 3 depends on a release-date helper that may not be exported today; the step says to check `app/utils/release_date.py` and add it **there** rather than in the router.
- Task 4's test imports `HIDDEN_NAME` and `make_viewer` from `tests/api/test_visibility.py` and assumes a `sample_anime` fixture; the step says what to do if it does not exist.
- Task 5 Step 4 does not quote `attach_link_fields`, because its current body was not read in full during planning. Read it before editing, and preserve its batching.
- Tasks 8, 9 and 11 describe UI structure rather than quoting complete components: each says which existing page to read and match. Inventing a new layout there would be the error.
