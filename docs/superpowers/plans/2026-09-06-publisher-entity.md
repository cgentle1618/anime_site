# Publisher Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote publisher/distributor from a `system_option` vocabulary to a first-class entity with its own table, router, pages and credit role — widening `CreditRole.target` from a two-value to a three-value axis.

**Architecture:** `publisher` is shaped after `studio` (`app/models/staff.py`): four optional names, a data-driven display choice, a profile, a logo. It is reached through a new `publisher` credit role, which requires a third nullable entity FK on `media_credit` and a third branch everywhere the person-vs-studio axis is read.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy, Alembic, PostgreSQL 17, pytest; React + Vite, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-games-media-type-design.md` — Decision K.

**Blocks:** `2026-09-06-games-backend.md` Task 10 (the `publisher` credit role) and Task 5 (`PublisherRef`).

## Global Constraints

- **Own test database, always.** Concurrent agents share `anime_site_test` and re-migrate each other's schema mid-run, producing large, varying, meaningless failure counts. Before your first test run: `CREATE DATABASE anime_site_test_<suffix>` against the `postgres` database, then prefix every pytest command with `POSTGRES_DB=anime_site_test_<suffix>`. `DROP DATABASE` when done.
- **Never `git add -A`, never stage a directory pathspec.** Stage the exact files each Commit step names, and stage-and-commit in one command.
- **TDD.** Failing test first, every task.
- **`media_credit` currently guards two entity FKs** with `CheckConstraint("num_nonnulls(person_id, studio_id) = 1")` and the same pair inside `uq_media_credit_row`. This plan widens both to three.
- **The existing ruling is being reversed.** `Studio`'s docstring says publishers are deliberately not entities and stay a `system_option` vocabulary; `app/utils/credit_roles.py`'s module docstring says the same. Both must be corrected in Task 4, not left contradicting the code.
- **The four existing media types are NOT migrated here.** `publisher_tw` stays a `TAG_FIELDS` entry on anime, manga, novel and comic. Converting those rows is a later spec.
- **After any frontend change run `cd frontend && npm run build`** so `:8000` matches `:5173`.
- Lint with `venv/Scripts/ruff.exe check .` and `cd frontend && npm run lint` before committing.

---

### Task 1: The `publisher` model

**Files:**
- Modify: `app/models/staff.py`, `app/models/__init__.py`
- Test: `tests/api/test_publisher_model.py` (create)

**Interfaces:**
- Produces: `models.Publisher` with `system_id`, `name_en`, `name_cn`, `name_jp`, `name_alt`, `display_name_field`, `my_rating`, `logo_file`, `remark`, `founded_date`, `defunct_date`, `country`, `website_url`, `created_at`, `updated_at`, plus `display_name` and `names_dict` properties.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_publisher_model.py
"""
The publisher table.

Shaped after Studio deliberately: same four name columns, same data-driven
display choice, same constraint idioms. It is a separate table rather than a
Studio role because most publisher/distributor values are distributors that
never developed anything - see the spec's Decision K.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_display_name_falls_back_through_the_chain():
    assert models.Publisher(name_en="Bandai Namco").display_name == "Bandai Namco"
    assert (
        models.Publisher(name_cn="木棉花", name_en="Muse").display_name == "Muse"
    ), "EN leads, matching Studio"


def test_display_name_field_wins_when_set():
    publisher = models.Publisher(
        name_en="Muse", name_cn="木棉花", display_name_field="cn"
    )
    assert publisher.display_name == "木棉花"


def test_a_publisher_with_no_name_at_all_is_rejected(db_session):
    db_session.add(models.Publisher())
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_publisher_names_are_unique_together(db_session):
    db_session.add(models.Publisher(name_en="Kadokawa"))
    db_session.commit()
    db_session.add(models.Publisher(name_en="Kadokawa"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_uniqueness_holds_when_three_of_four_names_are_null(db_session):
    """
    NULLS NOT DISTINCT. Without it the constraint is INERT for the typical row
    - Postgres treats two NULLs as distinct, so duplicates commit cleanly. The
    same lesson is already recorded on uq_studio_name and uq_person_name.
    """
    db_session.add(models.Publisher(name_cn="曼迪"))
    db_session.commit()
    db_session.add(models.Publisher(name_cn="曼迪"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_founded_date_must_be_iso(db_session):
    db_session.add(models.Publisher(name_en="Bad Date", founded_date="1990s"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_publisher_carries_no_mal_columns():
    """MAL knows nothing about game publishers or TW distributors."""
    columns = {c.name for c in models.Publisher.__table__.columns}
    assert "mal_id" not in columns
    assert "mal_link" not in columns
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_publisher_model.py -v`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'Publisher'`

- [ ] **Step 3: Implement**

In `app/models/staff.py`, after `Studio`:

```python
class Publisher(Base, NameFallbackMixin):
    """
    One publisher or distributor: a games publisher, or a TW licensor.

    Shaped after Studio, and deliberately a separate table rather than a
    `publisher` role pointing at Studio. The overlap is real - Bandai Namco
    and Kadokawa both develop and publish, and will exist as two unlinked
    rows - but the bulk of publisher/distributor values are distributors
    (木棉花, 曼迪) that never developed anything, and putting them on
    /library/studio would make that page mean something vaguer than it does.

    Reverses the ruling recorded in Studio's docstring, which said publishers
    need no profile and should stay a system_option vocabulary. Games are
    where that stopped holding: a publisher is a first-class fact about a
    game, not a distribution footnote.

    Carries no MAL columns: MAL has no record of a games publisher or a
    Taiwanese distributor, so there is nothing to autofill from.
    """

    __tablename__ = "publisher"
    __table_args__ = (
        UniqueConstraint(
            "name_en",
            "name_cn",
            "name_jp",
            "name_alt",
            name="uq_publisher_name",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_publisher_has_a_name",
        ),
        CheckConstraint(
            r"founded_date IS NULL OR founded_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_publisher_founded_date",
        ),
        CheckConstraint(
            r"defunct_date IS NULL OR defunct_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_publisher_defunct_date",
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
    display_name_field = Column(String, nullable=True)
    my_rating = Column(String, nullable=True)
    logo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    founded_date = Column(String, nullable=True)
    defunct_date = Column(String, nullable=True)
    country = Column(String, nullable=True)
    website_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    _DISPLAY_FIELDS = {
        "en": "name_en",
        "cn": "name_cn",
        "jp": "name_jp",
        "alt": "name_alt",
    }

    @property
    def names_dict(self) -> dict:
        return {
            "en": self.name_en,
            "cn": self.name_cn,
            "jp": self.name_jp,
            "alt": self.name_alt,
        }

    @property
    def display_name(self) -> str:
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

Also correct the `Studio` docstring paragraph that says publishers are deliberately not here — replace it with a pointer to `Publisher` and the reason for the split.

Export `Publisher` from `app/models/__init__.py` (import block and `__all__`).

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_publisher_model.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add app/models/staff.py app/models/__init__.py tests/api/test_publisher_model.py && git commit -m "feat(publisher): the publisher entity table"
```

---

### Task 2: `media_credit.publisher_id` and the widened constraints

**Files:**
- Modify: `app/models/media_credit.py`
- Test: `tests/api/test_media_credit_model.py`

**Interfaces:**
- Produces: `MediaCredit.publisher_id`; `ck_media_credit_one_target` over three columns; `uq_media_credit_row` including `publisher_id`.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_media_credit_model.py`:

```python
def test_a_credit_may_point_at_a_publisher(db_session):
    publisher = models.Publisher(name_en="Bandai Namco")
    db_session.add(publisher)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            media_type="game",
            entry_id=uuid.uuid4(),
            role="publisher",
            publisher_id=publisher.system_id,
        )
    )
    db_session.commit()


def test_a_credit_may_not_point_at_two_entities_at_once(db_session):
    """
    ck_media_credit_one_target is num_nonnulls(...) = 1 over all three FKs.
    A row naming both a studio and a publisher has no single meaning.
    """
    studio = models.Studio(name_en="FromSoftware")
    publisher = models.Publisher(name_en="Bandai Namco")
    db_session.add_all([studio, publisher])
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            media_type="game",
            entry_id=uuid.uuid4(),
            role="publisher",
            studio_id=studio.system_id,
            publisher_id=publisher.system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_a_credit_must_point_at_something(db_session):
    db_session.add(
        models.MediaCredit(media_type="game", entry_id=uuid.uuid4(), role="publisher")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_deleting_a_publisher_cascades_its_credits(db_session):
    publisher = models.Publisher(name_en="Gone")
    db_session.add(publisher)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            media_type="game",
            entry_id=uuid.uuid4(),
            role="publisher",
            publisher_id=publisher.system_id,
        )
    )
    db_session.commit()
    db_session.delete(publisher)
    db_session.commit()
    assert db_session.query(models.MediaCredit).count() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_media_credit_model.py -v`
Expected: FAIL — `TypeError: 'publisher_id' is an invalid keyword argument for MediaCredit`

- [ ] **Step 3: Implement**

In `app/models/media_credit.py`, add the column beside `studio_id`:

```python
    publisher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("publisher.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
```

Widen the CHECK to `"num_nonnulls(person_id, studio_id, publisher_id) = 1"` (keeping the constraint name `ck_media_credit_one_target`), and add `"publisher_id"` to the `uq_media_credit_row` `UniqueConstraint` column list. Update the class docstring to say the target is one of three entity tables.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_media_credit_model.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models/media_credit.py tests/api/test_media_credit_model.py && git commit -m "feat(publisher): third entity target on media_credit"
```

---

### Task 3: Schemas and `PublisherRef`

**Files:**
- Create: `app/schemas/publisher.py`
- Modify: `app/schemas/__init__.py`, `app/schemas/link_fields.py`
- Test: `tests/unit/test_publisher_schemas.py` (create)

**Interfaces:**
- Produces: `PublisherBase`, `PublisherCreate`, `PublisherUpdate`, `PublisherResponse` (with `display_name: str` and `credit_count: int`), `PublisherRef`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_publisher_schemas.py
"""Publisher request/response schemas."""

import uuid

import pytest
from pydantic import ValidationError

from app import schemas


def test_a_nameless_publisher_is_a_422_not_a_500():
    """Mirrors ck_publisher_has_a_name, so the API rejects it before the DB."""
    with pytest.raises(ValidationError):
        schemas.PublisherCreate()


def test_display_name_field_is_validated():
    with pytest.raises(ValidationError):
        schemas.PublisherCreate(name_en="X", display_name_field="english")
    assert schemas.PublisherCreate(name_en="X", display_name_field="cn")


def test_response_carries_display_name_and_credit_count():
    resp = schemas.PublisherResponse(
        system_id=uuid.uuid4(), name_en="Bandai Namco", display_name="Bandai Namco"
    )
    assert resp.credit_count == 0


def test_publisher_ref_is_id_plus_display_name():
    ref = schemas.PublisherRef(system_id=uuid.uuid4(), display_name="Kadokawa")
    assert ref.display_name == "Kadokawa"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_publisher_schemas.py -v`
Expected: FAIL — `AttributeError: module 'app.schemas' has no attribute 'PublisherCreate'`

- [ ] **Step 3: Implement**

Create `app/schemas/publisher.py` mirroring the `StudioBase` block in `app/schemas/staff.py`: every column `Optional[str] = None` except `system_id`, one `@model_validator(mode="after")` named `at_least_one_name` enforcing both the name requirement and `display_name_field in (None, "en", "cn", "jp", "alt")`, then `PublisherCreate`, `PublisherUpdate`, and `PublisherResponse` adding `system_id: UUID`, `display_name: str = ""`, `credit_count: int = 0`, `model_config = ConfigDict(from_attributes=True)`. No `mal_id`/`mal_link`.

In `app/schemas/link_fields.py`, beside `StudioRef`:

```python
class PublisherRef(BaseModel):
    system_id: UUID
    display_name: str
```

Export everything from `app/schemas/__init__.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_publisher_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/schemas/publisher.py app/schemas/__init__.py app/schemas/link_fields.py tests/unit/test_publisher_schemas.py && git commit -m "feat(publisher): schemas and PublisherRef"
```

---

### Task 4: The `publisher` credit role and the third target branch

**Files:**
- Modify: `app/utils/credit_roles.py`, `app/services/domain/credits.py`, `app/services/domain/search.py`, `app/services/domain/checking.py`, `app/services/rbac/field_groups.py`, `app/services/rbac/field_gate.py`, `app/routers/form_defaults.py`
- Test: `tests/unit/test_credit_roles.py`, `tests/api/test_publisher_credits.py` (create)

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `CREDIT_ROLES["publisher"]` with `target="publisher"`; `replace_credits` / `credit_names` / the ref builders handling a third target.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_publisher_credits.py
"""
Credits against a third entity target.

app/services/domain/credits.py:191 used to read
`if spec.target == "studio": ... else: <person>`, so `else` MEANT person. A
publisher role reaching that branch would silently create a Person row - the
failure this file exists to prevent.
"""

import uuid

from app import models
from app.services.domain.credits import credit_names, replace_credits
from app.utils import credit_roles as cr


def test_the_role_targets_the_publisher_table():
    assert cr.CREDIT_ROLES["publisher"].target == "publisher"


def test_target_is_a_three_value_axis():
    assert {r.target for r in cr.CREDIT_ROLES.values()} == {
        "person",
        "studio",
        "publisher",
    }


def test_person_roles_still_exclude_the_two_company_targets():
    assert "publisher" not in cr.PERSON_ROLES
    assert "studio" not in cr.PERSON_ROLES


def test_replacing_a_publisher_credit_creates_a_publisher_not_a_person(db_session):
    entry_id = uuid.uuid4()
    replace_credits(db_session, "game", entry_id, "publisher", ["Bandai Namco"])
    db_session.flush()

    assert db_session.query(models.Publisher).count() == 1
    assert db_session.query(models.Person).count() == 0
    assert credit_names(db_session, "game", entry_id, "publisher") == ["Bandai Namco"]


def test_renaming_a_publisher_changes_every_entry_that_credits_it(db_session):
    entry_id = uuid.uuid4()
    replace_credits(db_session, "game", entry_id, "publisher", ["Bandai"])
    db_session.flush()
    publisher = db_session.query(models.Publisher).one()
    publisher.name_en = "Bandai Namco"
    db_session.flush()
    assert credit_names(db_session, "game", entry_id, "publisher") == ["Bandai Namco"]


def test_a_studio_and_a_publisher_of_the_same_name_are_separate_rows(db_session):
    entry_id = uuid.uuid4()
    replace_credits(db_session, "game", entry_id, "studio", ["Bandai Namco"])
    replace_credits(db_session, "game", entry_id, "publisher", ["Bandai Namco"])
    db_session.flush()
    assert db_session.query(models.Studio).count() == 1
    assert db_session.query(models.Publisher).count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_publisher_credits.py -v`
Expected: FAIL — `KeyError: 'publisher'`

- [ ] **Step 3: Implement**

In `app/utils/credit_roles.py`:

- Update the module docstring: publishers are now an entity, not a vocabulary. `publisher_tw` remains a `TagField` on anime/manga/novel/comic until a later migration.
- Widen `CreditRole.target`'s comment: `"person"`, `"studio"` or `"publisher"`.
- Add the role:

```python
    "publisher": CreditRole(
        "publisher", "Publisher", "publisher", ("game",)
    ),
```

In `app/services/domain/credits.py`, replace the two-way branch in `replace_credits` with a dispatch table so a fourth target later is a one-line change:

```python
_RESOLVERS = {
    "person": resolve_person,
    "studio": resolve_studio,
    "publisher": resolve_publisher,
}
_TARGET_COLUMNS = {
    "person": "person_id",
    "studio": "studio_id",
    "publisher": "publisher_id",
}
```

and use `_RESOLVERS[spec.target](db, name)` — never an `else` that means person. Add `resolve_publisher` and `find_publisher` beside their studio equivalents. Update `credit_names` (the `person_id`/`studio_id` read-back), `_link_rows_and_lookups` and `_values_from_rows` to cover `publisher_id`, and add `publisher_refs` beside `studio_refs` for media types whose roles include a publisher.

In `app/services/domain/search.py`: add `"publisher": models.MediaCredit.publisher_id` to `_CREDIT_OWNER_COLUMN`, and a `SearchableType(key="publisher", model=models.Publisher, response_schema=schemas.PublisherResponse, ...)` with its `SCOPES` entry.

In `app/services/domain/checking.py`: add `("publisher", Publisher)` to the duplicate-entity loop.

In `app/services/rbac/field_groups.py` and `field_gate.py`: handle `publisher_refs` exactly as `studio_refs`.

In `app/routers/form_defaults.py`: add `"publisher"` to `VALID_MEDIA_TYPES`.

Widen the closed-set assertion at `tests/unit/test_credit_roles.py:85` to `("person", "studio", "publisher")`.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_publisher_credits.py tests/unit/test_credit_roles.py tests/api/test_credits_router.py tests/api/test_credits_service.py tests/api/test_search.py tests/api/test_field_gating.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/credit_roles.py app/services/domain/credits.py app/services/domain/search.py app/services/domain/checking.py app/services/rbac/field_groups.py app/services/rbac/field_gate.py app/routers/form_defaults.py tests/api/test_publisher_credits.py tests/unit/test_credit_roles.py && git commit -m "feat(publisher): publisher credit role and the third target branch"
```

---

### Task 5: The publisher router

**Files:**
- Create: `app/routers/publisher.py`
- Modify: `app/main.py`
- Test: `tests/api/test_publisher_router.py` (create)

**Interfaces:**
- Produces: `GET /api/publisher/`, `GET /api/publisher/{id}`, `GET /api/publisher/{id}/entries`, `POST`, `PUT`, `DELETE`, `POST /api/publisher/{id}/merge`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_publisher_router.py
"""The publisher router. Shaped after app/routers/studio.py."""

import uuid

from app import models


def test_create_and_list(admin_client, client):
    admin_client.post("/api/publisher/", json={"name_en": "Bandai Namco"})
    assert [p["name_en"] for p in client.get("/api/publisher/").json()] == [
        "Bandai Namco"
    ]


def test_creating_an_existing_publisher_returns_the_existing_row(admin_client):
    first = admin_client.post("/api/publisher/", json={"name_en": "Kadokawa"}).json()
    second = admin_client.post("/api/publisher/", json={"name_en": "Kadokawa"}).json()
    assert first["system_id"] == second["system_id"]


def test_a_nameless_publisher_is_rejected(admin_client):
    assert admin_client.post("/api/publisher/", json={}).status_code == 422


def test_listing_is_public_but_writing_is_not(client):
    assert client.get("/api/publisher/").status_code == 200
    assert client.post("/api/publisher/", json={"name_en": "X"}).status_code == 401


def test_detail_404s_for_an_unknown_id(client):
    assert client.get(f"/api/publisher/{uuid.uuid4()}").status_code == 404


def test_list_is_sorted_by_display_name(admin_client, client):
    for name in ("Zen Studios", "Annapurna", "Merge Games"):
        admin_client.post("/api/publisher/", json={"name_en": name})
    names = [p["display_name"] for p in client.get("/api/publisher/").json()]
    assert names == sorted(names, key=str.casefold)


def test_credit_count_reflects_credits(admin_client, db_session):
    created = admin_client.post("/api/publisher/", json={"name_en": "Devolver"}).json()
    db_session.add(
        models.MediaCredit(
            media_type="game",
            entry_id=uuid.uuid4(),
            role="publisher",
            publisher_id=created["system_id"],
        )
    )
    db_session.commit()
    detail = admin_client.get(f"/api/publisher/{created['system_id']}").json()
    assert detail["credit_count"] == 1


def test_delete_removes_the_publisher_and_its_logo(admin_client, monkeypatch):
    """
    Studio's delete path never calls delete_cover_image, so a deleted studio
    leaks its logo. Publisher must not inherit that gap.
    """
    from app.routers import publisher as publisher_router

    deleted = []
    monkeypatch.setattr(
        publisher_router, "delete_cover_image", lambda sid: deleted.append(sid)
    )
    created = admin_client.post(
        "/api/publisher/", json={"name_en": "Doomed", "logo_file": "x.jpg"}
    ).json()
    assert (
        admin_client.delete(f"/api/publisher/{created['system_id']}").status_code == 200
    )
    assert deleted == [created["system_id"]]


def test_merge_moves_credits_and_deletes_the_loser(admin_client, db_session):
    keep = admin_client.post("/api/publisher/", json={"name_en": "Keep"}).json()
    lose = admin_client.post("/api/publisher/", json={"name_en": "Lose"}).json()
    db_session.add(
        models.MediaCredit(
            media_type="game",
            entry_id=uuid.uuid4(),
            role="publisher",
            publisher_id=lose["system_id"],
        )
    )
    db_session.commit()

    result = admin_client.post(
        f"/api/publisher/{keep['system_id']}/merge",
        json={"source_id": lose["system_id"]},
    ).json()
    assert result["credits_moved"] == 1
    assert db_session.get(models.Publisher, uuid.UUID(lose["system_id"])) is None


def test_merging_a_publisher_into_itself_is_a_400(admin_client):
    created = admin_client.post("/api/publisher/", json={"name_en": "Solo"}).json()
    assert (
        admin_client.post(
            f"/api/publisher/{created['system_id']}/merge",
            json={"source_id": created["system_id"]},
        ).status_code
        == 400
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_publisher_router.py -v`
Expected: FAIL — 404 on every route

- [ ] **Step 3: Implement**

Create `app/routers/publisher.py` following `app/routers/studio.py` endpoint for endpoint: `_to_response` computing `credit_count` through `filter_visible_pairs`, a public list sorted in Python by `display_name.casefold()`, a public detail, a public `/entries` grouped through `MEDIA_TABLES`, an admin find-or-create `POST`, an admin full-replace `PUT`, an admin `DELETE`, and an admin `/merge`. Omit the MAL derivation and autofill calls — there is no MAL source for a publisher.

The one deliberate divergence from `studio.py`, in `delete_publisher`:

```python
    # Studio's delete path never does this, so a deleted studio leaks its logo
    # (cleanup exists only for media entries: _factory.py:31, calculation.py:278).
    # Publisher does not inherit that gap.
    delete_cover_image(str(system_id))
```

with `from app.services.integrations.image_manager import delete_cover_image` at module level, so the test can monkeypatch it on this module.

Register in `app/main.py`: add `publisher` to the routers import block alphabetically, and `app.include_router(publisher.router)` beside `studio.router`.

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/api/test_publisher_router.py -v`
Expected: PASS (10 passed)

- [ ] **Step 5: Commit**

```bash
git add app/routers/publisher.py app/main.py tests/api/test_publisher_router.py && git commit -m "feat(publisher): /api/publisher router"
```

---

### Task 6: Sheets round-trip

**Files:**
- Modify: `app/services/pipelines/tabs.py`, `app/utils/formatter.py`, `app/services/pipelines/pull.py`
- Test: `tests/unit/test_formatter_publisher.py` (create), `tests/api/test_sheet_tabs.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_formatter_publisher.py
"""The Publisher sheet parser."""

from app.services.pipelines.tabs import TAB_NAMES
from app.utils.formatter import parse_publisher_from_sheet


def test_parses_every_column():
    parsed = parse_publisher_from_sheet(
        {
            "system_id": "8a7cb6b4-0000-4000-8000-000000000000",
            "name_en": "Bandai Namco",
            "name_cn": "",
            "founded_date": "1955",
            "country": "Japan",
        }
    )
    assert parsed["name_en"] == "Bandai Namco"
    assert parsed["name_cn"] is None
    assert parsed["founded_date"] == "1955"


def test_publisher_restores_before_every_media_tab():
    """Credits resolve against it, so the entity rows must already exist."""
    assert TAB_NAMES.index("Publisher") < TAB_NAMES.index("Anime")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_formatter_publisher.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_publisher_from_sheet'`

- [ ] **Step 3: Implement**

Add `parse_publisher_from_sheet(raw: dict) -> dict` to `app/utils/formatter.py`, mirroring `parse_studio_from_sheet` minus the two MAL columns.

In `app/services/pipelines/tabs.py`, immediately after the `Studio` tab:

```python
    SheetTab("Publisher", models.Publisher, f.parse_publisher_from_sheet),
```

In `app/services/pipelines/pull.py`, add to `DERIVED_IDENTITY_KEYS`:

```python
    "Publisher": ("name_en", "name_cn", "name_jp", "name_alt"),  # uq_publisher_name
```

- [ ] **Step 4: Run test to verify it passes**

Run: `POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest tests/unit/test_formatter_publisher.py tests/api/test_sheet_tabs.py tests/api/test_credits_sheets.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/pipelines/tabs.py app/utils/formatter.py app/services/pipelines/pull.py tests/unit/test_formatter_publisher.py && git commit -m "feat(publisher): Sheets backup and restore"
```

---

### Task 7: Migration

**Files:**
- Create: `alembic/versions/p1u2b3l4i5s6_add_publisher.py`

- [ ] **Step 1: Confirm the current head**

Run: `venv/Scripts/alembic.exe heads`
Expected: a single head. Use it as `down_revision` (`dc1o2l3s4d5` at the time of writing; another session may have added one since).

- [ ] **Step 2: Write the migration**

`upgrade()` creates `publisher` with all four constraints, adds `media_credit.publisher_id` with its FK and index, drops and recreates `ck_media_credit_one_target` with the three-column `num_nonnulls`, and drops and recreates `uq_media_credit_row` including `publisher_id`. `downgrade()` reverses in the opposite order. House style: a reasoning docstring, bare `revision = "..."` attributes.

- [ ] **Step 3: Verify the migration actually runs**

The suite builds its schema with `create_all` and never runs Alembic, so this is the only check:

```bash
createdb anime_site_migrate_<suffix>
POSTGRES_DB=anime_site_migrate_<suffix> venv/Scripts/alembic.exe upgrade head
POSTGRES_DB=anime_site_migrate_<suffix> venv/Scripts/alembic.exe downgrade -1
POSTGRES_DB=anime_site_migrate_<suffix> venv/Scripts/alembic.exe upgrade head
dropdb anime_site_migrate_<suffix>
```

Expected: all succeed; `alembic heads` shows one head.

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/p1u2b3l4i5s6_add_publisher.py && git commit -m "feat(publisher): migration for publisher and media_credit.publisher_id"
```

---

### Task 8: Frontend — library, detail and links

**Files:**
- Create: `frontend/src/pages/library/PublisherLibrary.jsx`, `frontend/src/pages/detail/Publisher.jsx`, `frontend/src/components/info/PublisherLinks.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/api/endpoints.js`, `frontend/src/components/cards/StaffCard.jsx`, `frontend/src/config/navigation.js`
- Test: `frontend/src/pages/library/PublisherLibrary.test.jsx` (create), `frontend/src/config/navigation.test.js`

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/library/PublisherLibrary.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublisherLibrary from "./PublisherLibrary";

const PUBLISHERS = [
  { system_id: "1", name_en: "Bandai Namco", display_name: "Bandai Namco", credit_count: 12 },
  { system_id: "2", name_en: "Muse Communication", name_cn: "木棉花",
    display_name_field: "cn", display_name: "木棉花", credit_count: 30 },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(PUBLISHERS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PublisherLibrary />
    </MemoryRouter>,
  );
}

describe("PublisherLibrary", () => {
  it("lists every publisher by its display name", async () => {
    renderPage();
    expect(await screen.findByText("木棉花")).toBeInTheDocument();
    expect(screen.getByText("Bandai Namco")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("木棉花");
    await userEvent.type(screen.getByRole("searchbox"), "Muse Communication");
    await waitFor(() => {
      expect(screen.getByText("木棉花")).toBeInTheDocument();
      expect(screen.queryByText("Bandai Namco")).not.toBeInTheDocument();
    });
  });

  it("links each publisher to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /木棉花/ })).toHaveAttribute(
      "href",
      "/publisher/2",
    );
  });
});
```

Also extend `frontend/src/config/navigation.test.js` so the Entities column equals `["Studio", "Publisher", "Person", "Character"]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/library/PublisherLibrary.test.jsx`
Expected: FAIL — cannot resolve `./PublisherLibrary`

- [ ] **Step 3: Implement**

- `endpoints.js`: a `publisher` group mirroring `studio` (`list`, `detail`, `create`, `update`, `remove`, `merge`, `entries`).
- `StaffCard.jsx`: a `PublisherCard({ publisher })` named export beside `StudioCard`, `label="Publisher"`, `to={`/publisher/${publisher.system_id}`}`, `imageFile={publisher.logo_file}`.
- `PublisherLibrary.jsx`: copy `StudioLibrary.jsx`, but call `endpoints.publisher.list()` rather than repeating the literal `"/api/studio/"` that file hardcodes — mirroring the inconsistency would spread it.
- `Publisher.jsx`: copy `pages/detail/Studio.jsx`, dropping the MAL row from the `InfoCard` and pointing the breadcrumb at `/library/publisher`.
- `PublisherLinks.jsx`: `PublisherLinks({ refs })` and `publisherValue(item)`, mirroring `StudioLinks.jsx` against `publisher_refs` / `publisher`.
- `App.jsx`: `const PublisherLibrary = lazy(...)` and `const Publisher = lazy(...)`; `<Route path="/library/publisher" .../>` **before** the `/library/:type` catch-all; `<Route path="/publisher/:system_id" .../>` beside the studio one.
- `navigation.js`: a Publisher item in the Entities column, `matches: ["/publisher"]`.

Use only semantic colour tokens — `src/theme-tokens.test.js` fails the build on hard-coded greys.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/library/PublisherLibrary.test.jsx src/config/navigation.test.js src/theme-tokens.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/library/PublisherLibrary.jsx frontend/src/pages/detail/Publisher.jsx frontend/src/components/info/PublisherLinks.jsx frontend/src/components/cards/StaffCard.jsx frontend/src/App.jsx frontend/src/api/endpoints.js frontend/src/config/navigation.js frontend/src/pages/library/PublisherLibrary.test.jsx frontend/src/config/navigation.test.js && git commit -m "feat(publisher): library, detail and nav"
```

---

### Task 9: Frontend — admin Add, Modify and Delete

**Files:**
- Create: `frontend/src/pages/add-tabs/PublisherAddTab.jsx`, `frontend/src/pages/modify-tabs/PublisherModifyTab.jsx`
- Modify: `frontend/src/config/adminTabs.js`, `frontend/src/config/formFactories.js`, `frontend/src/pages/admin/Add.jsx`, `frontend/src/pages/admin/Modify.jsx`, `frontend/src/pages/admin/Delete.jsx`, `frontend/src/lib/sources.js`, `frontend/src/lib/formatters.js`, `frontend/src/lib/ensureSourceValues.js`, `frontend/src/config/formFields/fieldMeta.js`, `frontend/src/components/layout/NavSearch.jsx`
- Test: `frontend/src/config/adminTabs.test.js`, `frontend/src/lib/ensureSourceValues.test.js`, `frontend/src/pages/modify-tabs/PublisherModifyTab.test.jsx` (create)

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/lib/ensureSourceValues.test.js`:

```js
  it("posts a publisher as { name_en }", () => {
    const [url, init] = buildCreateRequest({ kind: "publisher" }, "Devolver");
    expect(url).toBe("/api/publisher/");
    expect(JSON.parse(init.body)).toEqual({ name_en: "Devolver" });
  });
```

Add to `frontend/src/config/adminTabs.test.js`:

```js
  it("puts publisher in the entity group", () => {
    expect(groupOf(ADMIN_TABS, "publisher")).toBe("entity");
  });
```

Create `frontend/src/pages/modify-tabs/PublisherModifyTab.test.jsx` modelled on `StudioModifyTab.test.jsx`: renders the picker, selects a publisher, edits a name, saves, and asserts the `PUT` body.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/lib/ensureSourceValues.test.js src/config/adminTabs.test.js src/pages/modify-tabs/PublisherModifyTab.test.jsx
```
Expected: FAIL

- [ ] **Step 3: Implement**

- `formFactories.js`: `defaultPublisher` (the studio factory minus `mal_id`/`mal_link`) and a `publisher` entry in `FORM_FACTORIES`.
- `PublisherAddTab.jsx`: `export { defaultPublisher }`, a named `PublisherFields({ publisherForm, upf })` and a default `PublisherAddTab` wrapper — the same split `StudioAddTab.jsx` uses so the Modify tab reuses the inputs. Reuse `STUDIO_NAME_FIELDS` from `lib/naming.js` (it is already shared with Person; add a comment noting the third consumer).
- `PublisherModifyTab.jsx`: copy `StudioModifyTab.jsx`, query key `["publishers-admin"]`, no `DEFAULT_STUDIO_COUNTRY` seeding.
- `adminTabs.js`: a `publisher` tab in the `entity` group, after `studio`.
- `Add.jsx`: import, `publisherForm` state, `upf` updater, `resolveDefaults("publisher", fd)`, the `activeTab === "publisher"` submit branch and render branch, and a `submitPublisher()` mirroring `submitStudio()`.
- `Modify.jsx`: import and `{activeTab === "publisher" && <PublisherModifyTab />}`, plus the two `activeTab !== "publisher"` guards that suppress the generic search bar and save footer.
- `Delete.jsx`: a `publisher` tab mirroring the studio block — picker, `credit_count` readout, cascade warning, merge flow — plus the `getDisplayTitle` branch and the `db.publisher` fetch.
- `lib/sources.js`: fetch publishers into the sources bag; `lib/formatters.js`: a `source.kind === "publisher"` branch mapping to `display_name`; `lib/ensureSourceValues.js`: a `publisher` branch posting `{ name_en: value }`.
- `fieldMeta.js`: a `publisher` field descriptor with `control: "tags"`, `source: { kind: "publisher" }`, `group: "Credits"`.
- `NavSearch.jsx`: a `publisher` scope, `TYPE_LABEL`, a quota, and the `navigate('/publisher/...')` arm.

- [ ] **Step 4: Run tests and build**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all pass; `frontend_dist/` rebuilt so `:8000` matches `:5173`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/add-tabs/PublisherAddTab.jsx frontend/src/pages/modify-tabs/PublisherModifyTab.jsx frontend/src/pages/modify-tabs/PublisherModifyTab.test.jsx frontend/src/config/adminTabs.js frontend/src/config/adminTabs.test.js frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx frontend/src/pages/admin/Delete.jsx frontend/src/lib/sources.js frontend/src/lib/formatters.js frontend/src/lib/ensureSourceValues.js frontend/src/lib/ensureSourceValues.test.js frontend/src/components/layout/NavSearch.jsx && git commit -m "feat(publisher): admin add, modify and delete"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/systems/credits-and-tags.md`, `docs/data-model.md`, `docs/options.md`, `docs/api.md`, `docs/frontend/admin-pages.md`, `docs/frontend/pages.md`, `docs/roadmap.md`

- [ ] **Step 1: Update the docs**

Bump every `Last verified` line to 2026-09-06.

- `credits-and-tags.md` — the third credit target; the `publisher` entity; correct the line that says publishers are deliberately not studios.
- `data-model.md` — the `publisher` table; `media_credit.publisher_id` and the widened CHECK and unique constraint.
- `options.md` — the `publisher` credit role; note that `publisher_tw` remains a tag field on the four existing types until a later migration.
- `api.md` — the `/api/publisher` endpoints.
- `frontend/admin-pages.md`, `frontend/pages.md` — the Entity → Publisher tab and the two new pages.
- `roadmap.md` — a Done row; a Deferred row for migrating `publisher_tw` rows on anime/manga/novel/comic into the entity.

- [ ] **Step 2: Run everything**

```bash
POSTGRES_DB=anime_site_test_<suffix> venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add docs/systems/credits-and-tags.md docs/data-model.md docs/options.md docs/api.md docs/frontend/admin-pages.md docs/frontend/pages.md docs/roadmap.md && git commit -m "docs(publisher): record the publisher entity and the third credit target"
```

---

## Done when

- `pytest`, `ruff`, `vitest` and `eslint` are all green, and `npm run build` has run.
- `alembic upgrade head` / `downgrade -1` / `upgrade head` succeed on a scratch database, with one head.
- A publisher can be created, listed, searched, merged and deleted through `/api/publisher`, and its logo is removed on delete.
- A `publisher` credit creates a `Publisher` row, never a `Person`.
- `publisher_tw` still works unchanged on anime, manga, novel and comic.
