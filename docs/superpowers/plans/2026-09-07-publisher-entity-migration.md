# Publisher / Distributor entity migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the `publisher_tw` and `comic_publisher` `system_option`
vocabularies, converting every value into a `publisher` entity credited
through one `publisher` role that is labelled per media type, and give
publishers an explicit media-type scope.

**Architecture:** The `publisher` table, `/api/publisher`,
`/library/publisher`, `/publisher/:system_id`, the nav-search bucket and the
`/search` Publishers section all already exist — they were built for Games and
are simply empty for the other types. This plan does not build a page. It
widens one `CreditRole`, moves ~520 `media_tag` rows onto `media_credit`,
creates 31 entities from a reviewed name map, adds a `publisher_scope` table
modelled on `person_role`, and rewires four admin forms and five detail pages
onto the entity path Game already uses.

Tasks are ordered so the tree is green after every one. Everything additive
lands first (scope table, `PublisherRef.label`), then the role widens, then
the data moves, and only then are the tag fields deleted — so at no point does
a read path reference a vocabulary that no longer exists.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, pytest, ruff; React
+ Vite, TanStack Query, Tailwind v4, vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-07-publisher-entity-migration-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Never commit or push automatically.** `CLAUDE.md` is explicit: finish the
  task, run the checks, show the owner a one-line commit message, and commit
  only after approval. Each task's final step is written as "prepare and ask",
  not "commit".
- **Stage only the exact files named in the task.** Other Claude Code sessions
  may be editing the same branch. Never `git add -A`, never `git commit -a`,
  and **never stage a directory pathspec** (`git add docs/` sweeps another
  session's work). Name every path. Stage and commit in one step with no gap.
- **Write the failing test first.** Every behaviour change in this plan starts
  with a red test.
- **Four checks stay green** before any commit is offered:
  `venv/Scripts/python.exe -m pytest -q`, `venv/Scripts/ruff.exe check .`,
  and in `frontend/`: `npm run test:run`, `npm run lint`.
- **After any frontend change, run `cd frontend && npm run build`** before
  claiming it works — :8000 serves the prebuilt bundle, :5173 does not.
- **`alembic upgrade head` before any Pull**, always.
- **Update the matching doc in the same change** and bump its `Last verified`
  line.
- **Claim the task in `docs/PROGRESS.md`** (`wip <who>`) before starting and
  set it to `done <sha>` in the same commit as the work.
- Media-type keys are **hyphenated** in the data layer (`anime-movie`,
  `tv-show`) and underscored only in router filenames. Every scope value and
  every `media_credit.media_type` in this plan is hyphenated.
- The label string **"Publisher / Distributor"** names the concept in code
  comments and in the spec. It must never reach a reader-facing surface.

### Test fixtures — corrected 2026-09-07 after Task 1

Task 1's implementer found that the fixtures this plan originally assumed do
not exist. Use these, which do (`tests/api/conftest.py`):

- **There is no `db` fixture.** The session fixture is `db_session`. The house
  convention is a three-line module-local alias, as in
  `tests/api/test_rewatch_entry_flags.py:15-17`. Put this at the top of each
  new test file that wants the short name:

```python
@pytest.fixture
def db(db_session):
    """Local alias — the convention in test_rewatch_entry_flags.py:15."""
    return db_session
```

- **There is no `admin_headers` fixture.** Authentication is cookie-based, via
  the `admin_client` fixture (`conftest.py:155`) — an already-authenticated
  `TestClient`. So `client.post(url, json=..., headers=admin_headers)` becomes
  `admin_client.post(url, json=...)`; unauthenticated reads use `client`.
- **There are no `make_*` entry factories.** Use the existing entry fixtures —
  `sample_anime` / `anime` (`conftest.py:238,255`), `manga_entry` (`:345`),
  `sample_comic` (`:430`) — or build an entry inline from `sample_franchise`
  the way `sample_comic` does. Every media model defaults its NOT NULL status
  column, so a name plus `franchise_id` is enough.
- **API tests need `anime_site_test`**, built from the models via `create_all`,
  never through Alembic. Do **not** point them at `anime_site_test_pubmig`;
  that database is only Task 5's dry-run copy of the real data.

### Reviewer decisions — settled 2026-09-07

- **The name map is the owner's own final version.** Task 5's
  `PUBLISHER_NAME_MAP` transcribes the spec's table **verbatim**. Do not
  "correct" it while implementing: `Muse木棉花` deliberately carries the mashed
  string in `name_cn` with no `name_alt`, and `羚邦 Ani-One` carries `羚邦` in
  both `name_cn` and `name_alt`. If a row looks wrong, raise it — do not edit
  it.
- **Labels are set** (Decision B). Five of the six came from the owner
  directly; **comic's 出版商 is an inference** (a comic's publisher is Marvel,
  not a TW licensor, so neither TW label fits) and is the one label the owner
  may still want changed.

### Scratch database

API tests need a Postgres database. Use `anime_site_test_pubmig` for this
plan and add it to the droppable list in `docs/PROGRESS.md`'s Environment
table (Task 10).

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `alembic/versions/<rev>_add_publisher_scope.py` | Creates `publisher_scope`. Schema only. |
| `alembic/versions/<rev>_publisher_entity_migration.py` | Calls `backfill_publishers`; retires the two option categories. Data only. |
| `tests/api/test_publisher_scope.py` | Scope table, validation, list filter, merge union, additive auto-scope. |
| `tests/unit/test_publisher_backfill.py` | The tag→credit conversion, the name map, idempotence, the round-trip guard. |
| `frontend/src/components/forms/PublisherScopePills.jsx` | The media-type pill row for the Publisher Add/Modify tabs. |
| `frontend/src/components/forms/PublisherScopePills.test.jsx` | Its vitest cover. |

**Modified (principal):** `app/utils/credit_roles.py`, `app/models/staff.py`,
`app/schemas/publisher.py`, `app/schemas/link_fields.py`,
`app/routers/publisher.py`, `app/services/domain/credits.py`,
`app/services/domain/autofill.py`, `app/utils/formatter.py`,
`frontend/src/lib/sources.js`, `frontend/src/config/formFields/fieldMeta.js`,
`frontend/src/config/formFactories.js`, `frontend/src/lib/payloads.js`,
the four add-tabs, the two publisher tabs, five detail pages.

**Deleted:** `frontend/src/components/info/PublisherLinks.jsx` (dead code —
nothing imports it; the live path is `publisherValue` from `StudioLinks.jsx`).

---

## Task 1: The `publisher_scope` table

Purely additive. Nothing reads it yet, so the tree stays green.

**Files:**
- Modify: `app/models/staff.py` (add `PublisherScope`; add `scopes`
  relationship to `Publisher` beside `logo_file`)
- Modify: `app/models/__init__.py` (export `PublisherScope`)
- Create: `alembic/versions/<rev>_add_publisher_scope.py`
- Test: `tests/api/test_publisher_scope.py`

**Interfaces:**
- Produces: `models.PublisherScope` with columns `id`, `publisher_id`,
  `scope`; `Publisher.scopes -> list[PublisherScope]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_publisher_scope.py
import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_a_publisher_holds_scopes(db):
    pub = models.Publisher(name_en="Aniplex")
    db.add(pub)
    db.flush()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="anime"))
    db.commit()
    db.refresh(pub)
    assert [s.scope for s in pub.scopes] == ["anime"]


def test_the_same_scope_cannot_be_held_twice(db):
    pub = models.Publisher(name_en="Kadokawa")
    db.add(pub)
    db.flush()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="manga"))
    db.commit()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="manga"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_deleting_the_publisher_cascades_its_scopes(db):
    pub = models.Publisher(name_en="Muse")
    db.add(pub)
    db.flush()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="anime"))
    db.commit()
    db.delete(pub)
    db.commit()
    assert db.query(models.PublisherScope).count() == 0
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_publisher_scope.py -q`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'PublisherScope'`

- [ ] **Step 3: Add the model**

In `app/models/staff.py`, after the `Publisher` class:

```python
class PublisherScope(Base):
    """
    Which media types a publisher is offered on.

    Explicit rather than derived from credits, for the reason PersonRole's
    docstring gives: a distributor added today must appear in the anime picker
    before its first credit exists.

    Unlike person_role there is no `role` column. A publisher holds exactly one
    role, `publisher`, so a column whose value is that constant on every row
    would encode nothing. The key is (publisher_id, scope) alone.

    As with PersonRole there is deliberately NO unscoped "offered everywhere"
    state: zero rows means offered nowhere. That is the opposite of
    system_option_scope, and it is what makes auto-scoping on write purely
    additive - under an "everywhere" rule the first scope row would silently
    NARROW the publisher, the trap Ruling R27 removed from tags.
    """

    __tablename__ = "publisher_scope"
    __table_args__ = (
        # A plain unique constraint, not NULLS NOT DISTINCT: scope is NOT NULL,
        # so no nullable column is left in the key for Postgres to treat as
        # distinct from itself. uq_person_role needed the opposite treatment
        # only while its scope column was still nullable.
        UniqueConstraint("publisher_id", "scope", name="uq_publisher_scope"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    publisher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("publisher.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A hyphenated media-type key, and one of legal_scopes("publisher").
    scope = Column(String, nullable=False)

    publisher = relationship("Publisher", back_populates="scopes")
```

And inside `Publisher`, beside the other attributes:

```python
    scopes = relationship(
        "PublisherScope",
        back_populates="publisher",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
```

Export it from `app/models/__init__.py` alongside `PersonRole`.

- [ ] **Step 4: Generate and inspect the migration**

Run: `venv/Scripts/python.exe -m alembic revision --autogenerate -m "add publisher_scope"`

Open the generated file and confirm it creates only `publisher_scope` with
`uq_publisher_scope` and the FK's `ondelete="CASCADE"`. Autogenerate does not
always emit `ondelete`; add it by hand if missing. Delete any unrelated
operations it invented.

- [ ] **Step 5: Apply it and run the tests**

Run: `venv/Scripts/python.exe -m alembic upgrade head`
Run: `venv/Scripts/python.exe -m pytest tests/api/test_publisher_scope.py -q`
Expected: 3 passed.

Then the full gate: `venv/Scripts/python.exe -m pytest -q` and
`venv/Scripts/ruff.exe check .`

- [ ] **Step 6: Prepare the commit and ask**

Show the owner:
`feat(publisher): add publisher_scope table`

```bash
git add app/models/staff.py app/models/__init__.py \
        alembic/versions/<rev>_add_publisher_scope.py \
        tests/api/test_publisher_scope.py && git commit -m "..."
```

---

## Task 2: Scope plumbing — schema, resolver, router

Still additive: the role is not yet widened, so only game publishers are
affected, and they gain a `scopes` field that starts empty.

**Files:**
- Modify: `app/schemas/publisher.py`
- Modify: `app/services/domain/credits.py:151-158` (`resolve_publisher`),
  `:199-230` (`_RESOLVERS` dispatch inside `replace_credits`)
- Modify: `app/routers/publisher.py` (`_to_response`, list filter, create,
  update, merge)
- Test: `tests/api/test_publisher_scope.py` (append)

**Interfaces:**
- Consumes: `models.PublisherScope` (Task 1).
- Produces:
  - `resolve_publisher(db, name, *, scope: Optional[str] = None) -> models.Publisher`
  - `PublisherResponse.scopes: list[str]`
  - `PublisherCreate.scopes` / `PublisherUpdate.scopes: list[str]`
  - `GET /api/publisher/?scope=<media-type>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_publisher_scope.py`:

```python
def test_resolve_publisher_adds_the_scope_additively(db):
    from app.services.domain.credits import resolve_publisher

    first = resolve_publisher(db, "Bandai Namco", scope="game")
    db.commit()
    again = resolve_publisher(db, "Bandai Namco", scope="anime")
    db.commit()

    assert again.system_id == first.system_id
    # Additive: the game scope survives the anime one being added.
    assert sorted(s.scope for s in again.scopes) == ["anime", "game"]


def test_resolve_publisher_does_not_duplicate_a_held_scope(db):
    from app.services.domain.credits import resolve_publisher

    resolve_publisher(db, "Muse", scope="anime")
    db.commit()
    pub = resolve_publisher(db, "Muse", scope="anime")
    db.commit()
    assert [s.scope for s in pub.scopes] == ["anime"]


def test_the_list_endpoint_filters_by_scope(admin_client):
    admin_client.post("/api/publisher/",
                      json={"name_en": "Anime Only", "scopes": ["anime"]})
    admin_client.post("/api/publisher/",
                      json={"name_en": "Game Only", "scopes": ["game"]})

    names = [
        p["name_en"]
        for p in admin_client.get("/api/publisher/?scope=anime").json()
    ]
    assert names == ["Anime Only"]


def test_an_illegal_scope_is_rejected(admin_client):
    res = admin_client.post("/api/publisher/",
                            json={"name_en": "Nope", "scopes": ["tv-show"]})
    assert res.status_code == 422


def test_update_replaces_the_whole_scope_set(admin_client):
    created = admin_client.post(
        "/api/publisher/",
        json={"name_en": "Shifty", "scopes": ["anime", "manga"]},
    ).json()
    res = admin_client.put(
        f"/api/publisher/{created['system_id']}",
        json={"name_en": "Shifty", "scopes": ["novel"]},
    )
    assert res.json()["scopes"] == ["novel"]


def test_merge_unions_the_scopes(admin_client):
    keep = admin_client.post(
        "/api/publisher/", json={"name_en": "Keep", "scopes": ["anime"]}
    ).json()
    drop = admin_client.post(
        "/api/publisher/", json={"name_en": "Drop", "scopes": ["manga"]}
    ).json()
    admin_client.post(
        f"/api/publisher/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )

    survivor = admin_client.get(f"/api/publisher/{keep['system_id']}").json()
    assert sorted(survivor["scopes"]) == ["anime", "manga"]
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_publisher_scope.py -q`
Expected: FAIL — `resolve_publisher() got an unexpected keyword argument 'scope'`
and 422s on the unknown `scopes` field.

- [ ] **Step 3: Widen `resolve_publisher`**

`app/services/domain/credits.py`, replacing lines 151-158:

```python
def resolve_publisher(
    db: Session, name: str, *, scope: Optional[str] = None
) -> models.Publisher:
    """
    Find or create the publisher, under its English name when new, and make
    sure it is offered on this media type.

    The scope half mirrors resolve_person: additive, never subtractive, so
    crediting a publisher on a manga can only widen where it is offered. Safe
    precisely because zero scope rows means "offered nowhere" - see
    PublisherScope's docstring.
    """
    publisher = _find_by_name(db, models.Publisher, name)
    if publisher is None:
        publisher = models.Publisher(name_en=name.strip())
        db.add(publisher)
        db.flush()

    if scope and scope not in {s.scope for s in publisher.scopes}:
        db.add(
            models.PublisherScope(publisher_id=publisher.system_id, scope=scope)
        )
        db.flush()
        db.refresh(publisher)
    return publisher
```

- [ ] **Step 4: Pass the scope through `replace_credits`**

In `replace_credits`, the `else` branch currently calls
`_RESOLVERS[spec.target](db, name)` with no keyword. Both non-person resolvers
now differ, so make the dispatch explicit rather than adding a second
special case beside the person one:

```python
    for position, name in enumerate(names):
        if spec.target == "person":
            # The scope is the media type - nothing left to derive.
            target = resolve_person(db, name, role=role, scope=media_type)
        elif spec.target == "publisher":
            # Same rule, same reason: a publisher is offered where it is used.
            target = resolve_publisher(db, name, scope=media_type)
        else:
            target = _RESOLVERS[spec.target](db, name)
```

Leave `_RESOLVERS` and `_TARGET_COLUMNS` in place — `_TARGET_COLUMNS` is still
what picks the FK, and `_RESOLVERS` still serves studio.

- [ ] **Step 5: Add `scopes` to the schemas**

`app/schemas/publisher.py`:

```python
from app.utils.credit_roles import legal_scopes


class PublisherBase(BaseModel):
    ...
    website_url: Optional[str] = None
    # Which media types this publisher is offered on. A bare list, not the
    # {role, scope} pairs PersonRoleIn carries: a publisher holds exactly one
    # role, so there is no second axis to name.
    scopes: list[str] = []

    @model_validator(mode="after")
    def at_least_one_name(self):
        ...
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        legal = legal_scopes("publisher")
        for scope in self.scopes:
            if scope not in legal:
                raise ValueError(
                    f"{scope} is not a media type a publisher may be offered on."
                )
        return self
```

`PublisherResponse` inherits `scopes` from the base; no extra field needed.

- [ ] **Step 6: Wire the router**

`app/routers/publisher.py`:

- `_to_response`: add `scopes=sorted(s.scope for s in publisher.scopes)`.
- `get_all_publishers`: add `scope: Optional[str] = Query(default=None)`, and
  when set, filter with a join:

```python
    query = db.query(models.Publisher)
    if scope:
        query = query.join(models.PublisherScope).filter(
            models.PublisherScope.scope == scope
        )
    publishers = query.all()
```

- `create_publisher`: `models.Publisher(**payload.model_dump())` now receives
  a `scopes` key the model cannot take. Pop it first, then insert the rows
  additively — the same shape `person.py:375-384` uses:

```python
    data = payload.model_dump()
    wanted = data.pop("scopes", [])
    publisher = find_publisher(db, first_name)
    if publisher is None:
        publisher = models.Publisher(**data)
        db.add(publisher)
        db.flush()

    # Additive, like POST /api/person: a create for a publisher that already
    # exists is routine (ensureSourceValues posts every typed name), and it
    # must not narrow the scopes the existing row holds.
    held = {s.scope for s in publisher.scopes}
    for scope in wanted:
        if scope not in held:
            db.add(
                models.PublisherScope(
                    publisher_id=publisher.system_id, scope=scope
                )
            )
    db.commit()
    db.refresh(publisher)
```

- `update_publisher`: full replace, like `person.py:409-421` — delete the
  existing rows, insert the deduped submitted set, and never `setattr` the
  `scopes` key onto the model:

```python
    data = payload.model_dump()
    wanted = list(dict.fromkeys(data.pop("scopes", [])))
    for key, value in data.items():
        setattr(publisher, key, value)

    db.query(models.PublisherScope).filter_by(
        publisher_id=system_id
    ).delete(synchronize_session=False)
    for scope in wanted:
        db.add(models.PublisherScope(publisher_id=system_id, scope=scope))
```

- `merge_publisher`: union the scopes onto the survivor before deleting the
  loser, mirroring `person.py:511-518` — a merge must never narrow:

```python
    held_scopes = {s.scope for s in keep.scopes}
    for scope_row in drop.scopes:
        if scope_row.scope not in held_scopes:
            db.add(
                models.PublisherScope(
                    publisher_id=system_id, scope=scope_row.scope
                )
            )
```

- [ ] **Step 7: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_publisher_scope.py -q`
Expected: all pass.

Then `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`

- [ ] **Step 8: Prepare the commit and ask**

`feat(publisher): scope publishers by media type, like people`

---

## Task 3: `PublisherRef` carries its label

Additive. Game's detail page keeps rendering its hard-coded "Publisher" until
Task 8; this only makes the label available.

**Files:**
- Modify: `app/schemas/link_fields.py:47-51` (`PublisherRef`)
- Modify: `app/services/domain/credits.py:876-879` (ref construction)
- Test: `tests/api/test_link_fields.py` (append; create it if absent)

**Interfaces:**
- Produces: `PublisherRef(system_id, display_name, label)`.

**Caution, learned in Task 2.** `app/services/domain/search.py:185` hands the
**ORM** `Publisher` object straight to `PublisherResponse` (through
`field_gate.gate`, which returns its payload unchanged when nothing is
withheld). So any field added to a publisher schema is validated against an
ORM attribute, not a dict — which is how Task 2's `scopes: list[str]` arrived
as a list of `PublisherScope` rows and raised `string_type`. Task 2 fixed it
with a `field_validator(mode="before")` in `app/schemas/publisher.py:34-47`.
`PublisherRef` is built by hand in `attach_link_fields`, not from an ORM row,
so `label` is not exposed to the same hazard — but check `/api/search` still
answers 200 before you call this task done.

- [ ] **Step 1: Write the failing test**

```python
def test_publisher_refs_carry_the_media_types_label(db, sample_franchise):
    from app import models
    from app.services.domain.credits import (
        attach_link_fields,
        replace_credits,
    )

    game = models.Game(
        game_name_en="Elden Ring", franchise_id=sample_franchise.system_id
    )
    db.add(game)
    db.flush()
    replace_credits(db, "game", game.system_id, "publisher", ["Bandai Namco"])
    db.commit()

    attach_link_fields(db, "game", [game])
    assert game.publisher_refs[0].label == "發行商"
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `venv/Scripts/python.exe -m pytest tests/api/test_link_fields.py -k publisher_refs_carry -q`
Expected: FAIL — `AttributeError: 'PublisherRef' object has no attribute 'label'`

- [ ] **Step 3: Add the field**

`app/schemas/link_fields.py`:

```python
class PublisherRef(BaseModel):
    """
    A publisher a page can link to.

    Shaped like StudioRef plus PersonRef's `label`: one publisher role reads
    台灣代理商 on an anime and 發行商 on a game, so the page can
    render the heading without knowing the vocabulary. credit_label() in
    app/utils/credit_roles.py owns that mapping. StudioRef needs no label -
    a studio is a studio on both types that credit one.
    """

    system_id: UUID
    display_name: str
    label: str
```

- [ ] **Step 4: Populate it**

`app/services/domain/credits.py`, in `attach_link_fields`:

```python
            publisher_refs_by_entry.setdefault(row.entry_id, []).append(
                PublisherRef(
                    system_id=publisher.system_id,
                    display_name=publisher.display_name,
                    label=credit_label(row.role, media_type),
                )
            )
```

`credit_label` is already imported in this module (it builds `PersonRef` at
line 844).

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`
Expected: green. If a serialization test asserts `PublisherRef`'s exact shape,
update it to include `label`.

- [ ] **Step 6: Prepare the commit and ask**

`feat(publisher): give PublisherRef the per-media-type label`

---

## Task 4: Widen the role and label it per type

After this task, entries of all six types can hold `publisher` credits and
`publisher_refs` switch on — but the `publisher_tw` tag field still exists and
still holds the live data. Both coexist for exactly one task.

**Files:**
- Modify: `app/utils/credit_roles.py:68-72` (`CREDIT_ROLES["publisher"]`),
  `:104-109` (`_LABEL_OVERRIDES`), `:14-20` (module docstring)
- Test: `tests/unit/test_credit_roles.py`

**Interfaces:**
- Produces: `credit_label("publisher", mt)`; `legal_scopes("publisher")`
  returning the six hyphenated keys.

- [ ] **Step 1: Write the failing test**

```python
def test_publisher_is_offered_on_six_media_types():
    from app.utils.credit_roles import legal_scopes

    assert set(legal_scopes("publisher")) == {
        "anime", "anime-movie", "manga", "novel", "comic", "game",
    }


def test_every_media_type_labels_its_publisher_row_in_chinese():
    from app.utils.credit_roles import credit_label

    assert credit_label("publisher", "anime") == "台灣代理商"
    assert credit_label("publisher", "anime-movie") == "台灣代理商"
    assert credit_label("publisher", "manga") == "台灣出版商"
    assert credit_label("publisher", "novel") == "台灣出版商"
    assert credit_label("publisher", "comic") == "出版商"
    assert credit_label("publisher", "game") == "發行商"


def test_the_concept_name_never_reaches_a_label():
    """"Publisher / Distributor" names the concept in code, never a reader."""
    from app.utils.credit_roles import CREDIT_ROLES, _LABEL_OVERRIDES

    labels = [r.label for r in CREDIT_ROLES.values()] + list(
        _LABEL_OVERRIDES.values()
    )
    assert not any("/" in label and "Distributor" in label for label in labels)
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_credit_roles.py -q`
Expected: FAIL — `legal_scopes("publisher")` returns `("game",)`.

- [ ] **Step 3: Widen the role**

```python
    # One role for every company that puts a work in front of a reader: a
    # games publisher, a TW licensor, a comic's original publisher. The LABEL
    # varies by media type (see _LABEL_OVERRIDES) but the vocabulary does not,
    # so one company's game and manga credits stay on one entity.
    "publisher": CreditRole(
        "publisher", "Publisher", "publisher",
        ("anime", "anime-movie", "manga", "novel", "comic", "game"),
    ),
```

And in `_LABEL_OVERRIDES` — an entry for every one of the six types, so no
rendered page falls through to `CreditRole.label`:

```python
    # One role, six reader-facing words. 台灣代理商 and 台灣出版商 both name a
    # TAIWANESE licensor; a comic's publisher is Marvel - the work's original
    # publisher, not a TW party - so it reads 出版商 without the 台灣. 發行商
    # is the word for a games publisher. The role's own label, "Publisher",
    # is never rendered; it survives for admin tooling holding no media type.
    ("publisher", "anime"): "台灣代理商",
    ("publisher", "anime-movie"): "台灣代理商",
    ("publisher", "manga"): "台灣出版商",
    ("publisher", "novel"): "台灣出版商",
    ("publisher", "comic"): "出版商",
    ("publisher", "game"): "發行商",
```

Correct the module docstring at lines 14-20: it currently says the four
existing types "keep publisher_tw as a TagField until a later migration
converts those rows". This is that migration.

- [ ] **Step 4: Make true the three places that anticipated this task**

Tasks 2 and 3 could not assert the real labels or the real scope list, so each
left a marker saying this task changes it. Find and update all three:

- `tests/api/test_entry_link_fields.py:249-269` —
  `test_publisher_refs_carry_the_media_types_label` asserts the base label
  `"Publisher"` with a docstring saying Task 4 makes it **發行商**. Change the
  expectation and drop the caveat.
- `app/schemas/link_fields.py:47-61` — `PublisherRef`'s docstring was softened
  because the per-type labels were not yet true. They are now; restore the
  plain statement that one role reads 台灣代理商 on an anime and 發行商 on a
  game.
- `app/utils/credit_roles.py` module docstring (lines 14-20) — already covered
  in Step 3.

- [ ] **Step 5: Delete Task 2's temporary fixture**

Task 2 needed two legal scopes before this task existed, so it added a
`publisher_scopes_widened` fixture to `tests/api/test_publisher_scope.py` that
`monkeypatch.setitem`s `CREDIT_ROLES["publisher"]` with a widened
`media_types`. This task makes that real. **Delete the fixture and every
`publisher_scopes_widened` argument that uses it**, then confirm those tests
still pass against the genuinely widened role — that is the proof this task
worked. `test_an_illegal_scope_is_rejected` uses `"tv-show"`, which stays
illegal, and never used the fixture.

- [ ] **Step 5: Run the tests**

Run: `venv/Scripts/python.exe -m pytest -q`

Expect fallout in tests that assert a media type's credit-role set or its
sheet columns — `credit_roles_for("anime")` now includes `publisher`, and
`wants_publisher_refs` is now true for five more types. Update those
assertions; they are recording the old vocabulary, not a defect.

Then `venv/Scripts/ruff.exe check .`

- [ ] **Step 6: Prepare the commit and ask**

`feat(publisher): widen the publisher role to six media types`

---

## Task 5: The one-time conversion

**Do not run against the real database until the owner has answered open
decision 1** (see Reviewer decisions above).

**Files:**
- Modify: `app/services/domain/credits.py` (add `PUBLISHER_NAME_MAP` and
  `backfill_publishers` beside `backfill_credits`)
- Create: `alembic/versions/<rev>_publisher_entity_migration.py`
- Test: `tests/unit/test_publisher_backfill.py`

**Interfaces:**
- Consumes: `resolve_publisher(db, name, *, scope)` (Task 2), the widened role
  (Task 4).
- Produces: `backfill_publishers(db) -> dict` with keys `credits`, `entities`,
  `scopes`, `skipped`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/unit/test_publisher_backfill.py
from app import models
from app.services.domain.credits import backfill_publishers, find_publisher


def _tag(db, media_type, entry_id, field, value, category):
    option = models.SystemOption(category=category, value=value)
    db.add(option)
    db.flush()
    db.add(models.MediaTag(media_type=media_type, entry_id=entry_id,
                           field=field, option_id=option.system_id, position=0))
    db.flush()


def test_a_tag_row_becomes_a_publisher_credit(db, sample_anime):
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Muse木棉花",
         "Publisher / Distributor TW")
    db.commit()

    report = backfill_publishers(db)

    credit = db.query(models.MediaCredit).filter_by(
        media_type="anime", entry_id=anime.system_id, role="publisher"
    ).one()
    assert credit.publisher_id is not None
    assert report["credits"] == 1
    assert db.query(models.MediaTag).filter_by(field="publisher_tw").count() == 0


def test_the_name_map_splits_a_mixed_name(db, sample_anime):
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Muse木棉花",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)

    pub = find_publisher(db, "木棉花")
    assert pub.name_en == "Muse"
    assert pub.name_cn == "木棉花"
    assert pub.display_name == "木棉花"


def test_the_old_spelling_still_resolves(db, sample_anime):
    """
    Decision E: a Pull from a pre-migration sheet must not mint a twin.

    Holds for "Muse木棉花" because the owner's map keeps that exact spelling in
    name_cn. It does NOT hold for "Proware普威爾" or "曼迪 Mightymedia", whose
    map rows keep neither the mashed spelling nor an alt - asserted below so
    the gap is recorded rather than discovered during a restore.
    """
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Muse木棉花",
         "Publisher / Distributor TW")
    db.commit()
    backfill_publishers(db)

    assert find_publisher(db, "Muse木棉花") is not None
    assert db.query(models.Publisher).count() == 1


def test_a_split_row_without_an_alt_does_not_answer_to_its_old_spelling(
    db, sample_anime
):
    """Records the known gap - see PUBLISHER_NAME_MAP's round-trip note."""
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Proware普威爾",
         "Publisher / Distributor TW")
    db.commit()
    backfill_publishers(db)

    assert find_publisher(db, "普威爾") is not None
    assert find_publisher(db, "Proware普威爾") is None


def test_scope_is_seeded_from_the_credits(db, sample_anime, manga_entry):
    anime = sample_anime
    manga = manga_entry
    _tag(db, "anime", anime.system_id, "publisher_tw", "角川",
         "Publisher / Distributor TW")
    _tag(db, "manga", manga.system_id, "publisher_tw", "角川",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)

    pub = find_publisher(db, "角川")
    assert sorted(s.scope for s in pub.scopes) == ["anime", "manga"]


def test_it_is_idempotent(db, sample_anime):
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "尖端",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)
    backfill_publishers(db)

    assert db.query(models.Publisher).count() == 1
    assert db.query(models.MediaCredit).filter_by(role="publisher").count() == 1


def test_an_existing_publisher_is_reused_not_duplicated(db, sample_anime):
    db.add(models.Publisher(name_en="Aniplex"))
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Aniplex",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)

    assert db.query(models.Publisher).count() == 1


def test_a_comic_publisher_tw_row_is_reported_not_dropped(db, sample_comic):
    """Decision C: the column is empty in reality; if it isn't, say so."""
    comic = sample_comic
    _tag(db, "comic", comic.system_id, "publisher_tw", "曼迪 Mightymedia",
         "Publisher / Distributor TW")
    db.commit()

    report = backfill_publishers(db)

    assert report["skipped"] and report["skipped"][0]["media_type"] == "comic"
    assert db.query(models.MediaTag).filter_by(
        media_type="comic", field="publisher_tw"
    ).count() == 1
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_publisher_backfill.py -q`
Expected: FAIL — `ImportError: cannot import name 'backfill_publishers'`

- [ ] **Step 3: Write the name map and the backfill**

In `app/services/domain/credits.py`, after `BACKFILL_MAP`. The map is the
spec's reviewed table; `alt` holds the pre-migration spelling on the four rows
this splits, so `find_publisher` answers to both (Decision E).

```python
# The 31 vocabulary values this migration turns into entities: the 30
# "Publisher / Distributor TW" options plus the single "Comic Publisher" one.
#
# Data, not a heuristic. A script-boundary split guesses, and guesses wrong on
# "bilibili (GoodShow)"; name_normalize.py's rule for this codebase is that
# nothing is guessed, which is also why name_slot_for never returns "alt".
# Here a human asserts it - this table is the owner's own final version,
# transcribed verbatim from the spec. See the spec's Decision D and E.
#
# Round-trip note (Decision E): find_publisher matches on ANY of the four
# names, so a value whose pre-migration spelling survives in some column still
# resolves when an older sheet is pulled. "Muse木棉花" keeps that spelling in
# name_cn and is safe. "Proware普威爾" and "曼迪 Mightymedia" do NOT keep
# theirs anywhere, so a Pull from a sheet backed up before this migration will
# create a second row for those two; re-Backup right after migrating, and see
# the Risks section of the spec.
#
# A value absent from this map falls back to name_slot_for.
PUBLISHER_NAME_MAP: dict[str, dict[str, str]] = {
    "Aniplex": {"en": "Aniplex", "display": "en"},
    "ANIPLUS": {"en": "ANIPLUS", "display": "en"},
    "bilibili": {"en": "bilibili", "display": "en"},
    "bilibili (GoodShow)": {"en": "bilibili (GoodShow)", "display": "en"},
    "Crunchyroll": {"en": "Crunchyroll", "display": "en"},
    "Disney": {"en": "Disney", "display": "en"},
    "Muse木棉花": {"en": "Muse", "cn": "Muse木棉花", "display": "cn"},
    "NETFLIX": {"en": "NETFLIX", "display": "en"},
    "Proware普威爾": {"en": "Proware", "cn": "普威爾", "display": "cn"},
    "三貝多": {"cn": "三貝多", "display": "cn"},
    "六六喜喜": {"cn": "六六喜喜", "display": "cn"},
    "台灣角川": {"cn": "台灣角川", "display": "cn"},
    "回歸線娛樂": {"cn": "回歸線娛樂", "display": "cn"},
    "天光": {"cn": "天光", "display": "cn"},
    "奇幻基地": {"cn": "奇幻基地", "display": "cn"},
    "尖端": {"cn": "尖端", "display": "cn"},
    "提恩傳媒": {"cn": "提恩傳媒", "display": "cn"},
    "曼迪 Mightymedia": {"en": "Mightymedia", "cn": "曼迪", "display": "cn"},
    "杰外": {"cn": "杰外", "display": "cn"},
    "東方出版社": {"cn": "東方出版社", "display": "cn"},
    # Toei, recorded here in kanji. Placed in cn to match the TW-facing
    # vocabulary it came from; no English name is invented for it.
    "東映": {"cn": "東映", "display": "cn"},
    "東立": {"cn": "東立", "display": "cn"},
    "東販": {"cn": "東販", "display": "cn"},
    "皇冠文化": {"cn": "皇冠文化", "display": "cn"},
    "羚邦 Ani-One": {
        "en": "Ani-One", "cn": "羚邦", "alt": "羚邦", "display": "cn",
    },
    # Kadokawa and its Taiwanese arm stay two rows, as they are two options
    # today. Merging them is a judgement this migration will not make.
    "角川": {"cn": "角川", "display": "cn"},
    "車庫娛樂": {"cn": "車庫娛樂", "display": "cn"},
    "遠流": {"cn": "遠流", "display": "cn"},
    "青文": {"cn": "青文", "display": "cn"},
    "飛燕文創": {"cn": "飛燕文創", "display": "cn"},
    "Marvel Comics": {"en": "Marvel Comics", "display": "en"},
}

# The two vocabularies this migration retires, and the tag fields they backed.
_RETIRED_TAG_FIELDS = ("publisher_tw", "comic_publisher")
_RETIRED_CATEGORIES = ("Publisher / Distributor TW", "Comic Publisher")


def _publisher_from_map(db: Session, value: str) -> models.Publisher:
    """The entity for one vocabulary value, reusing an existing row on a match."""
    entry = PUBLISHER_NAME_MAP.get(value)
    names = [entry[k] for k in ("en", "cn", "jp", "alt") if entry and entry.get(k)]
    for candidate in names or [value]:
        existing = find_publisher(db, candidate)
        if existing is not None:
            return existing

    if entry is None:
        # Not in the reviewed map: fall back to the shared slot rule rather
        # than guessing a split. resolve_publisher would put it in name_en
        # unconditionally, which is wrong for a CJK name.
        slot = name_slot_for(value.strip(), role="publisher", scope="")
        publisher = models.Publisher(**{f"name_{slot}": value.strip()})
    else:
        publisher = models.Publisher(
            name_en=entry.get("en"),
            name_cn=entry.get("cn"),
            name_jp=entry.get("jp"),
            name_alt=entry.get("alt"),
            display_name_field=entry.get("display"),
        )
    db.add(publisher)
    db.flush()
    return publisher


def backfill_publishers(db: Session) -> dict:
    """
    Turn every publisher_tw / comic_publisher tag row into a publisher credit.

    Lives here rather than in the Alembic revision for the same reason
    backfill_credits does: it can be tested with the normal fixtures and re-run
    by hand when a restore brings old data back.

    Idempotent. A second run finds every entity by name, writes the same
    credits under uq_media_credit_row, and finds no tag rows left to convert.

    Nothing is guessed and nothing is silently dropped: a comic publisher_tw
    row - which does not exist in the live data, see the spec's Decision C -
    is reported in `skipped` and left where it is.
    """
    credits_written = 0
    skipped: list[dict] = []
    scoped: set[tuple] = set()

    rows = (
        db.query(models.MediaTag, models.SystemOption)
        .join(
            models.SystemOption,
            models.MediaTag.option_id == models.SystemOption.system_id,
        )
        .filter(models.MediaTag.field.in_(_RETIRED_TAG_FIELDS))
        .order_by(models.MediaTag.position)
        .all()
    )

    for tag, option in rows:
        if tag.media_type == "comic" and tag.field == "publisher_tw":
            # Decision C: expected to be unreachable. Report, never drop.
            skipped.append(
                {
                    "media_type": tag.media_type,
                    "entry_id": str(tag.entry_id),
                    "field": tag.field,
                    "value": option.value,
                    "reason": "comic publisher_tw is retired, not migrated",
                }
            )
            continue

        publisher = _publisher_from_map(db, option.value)
        exists = (
            db.query(models.MediaCredit)
            .filter_by(
                media_type=tag.media_type,
                entry_id=tag.entry_id,
                role="publisher",
                publisher_id=publisher.system_id,
            )
            .first()
        )
        if exists is None:
            db.add(
                models.MediaCredit(
                    media_type=tag.media_type,
                    entry_id=tag.entry_id,
                    role="publisher",
                    publisher_id=publisher.system_id,
                    position=tag.position,
                )
            )
            credits_written += 1

        scoped.add((publisher.system_id, tag.media_type))
        db.delete(tag)

    db.flush()

    # Seed scope from what the data actually uses - the same one-time,
    # derived-from-usage pass backfill_credits ends with for option scopes.
    # Also covers the game publishers that predate this table.
    for publisher_id, media_type in scoped | {
        (c.publisher_id, c.media_type)
        for c in db.query(models.MediaCredit)
        .filter(models.MediaCredit.role == "publisher")
        .all()
    }:
        held = {
            s.scope
            for s in db.query(models.PublisherScope)
            .filter_by(publisher_id=publisher_id)
            .all()
        }
        if media_type not in held:
            db.add(
                models.PublisherScope(
                    publisher_id=publisher_id, scope=media_type
                )
            )

    db.flush()
    db.query(models.SystemOption).filter(
        models.SystemOption.category.in_(_RETIRED_CATEGORIES)
    ).delete(synchronize_session=False)
    db.commit()

    report = {
        "credits": credits_written,
        "entities": db.query(models.Publisher).count(),
        "scopes": db.query(models.PublisherScope).count(),
        "skipped": skipped,
    }
    logger.info(
        "backfill_publishers: %s credits, %s entities, %s skipped",
        credits_written,
        report["entities"],
        len(skipped),
    )
    return report
```

`name_slot_for` is already imported in this module (`resolve_person` uses it).

- [ ] **Step 4: Run the tests**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_publisher_backfill.py -q`
Expected: all pass.

- [ ] **Step 5: Write the Alembic revision**

```python
"""Convert publisher_tw / comic_publisher into publisher entities."""


def upgrade() -> None:
    from sqlalchemy.orm import Session

    from app.services.domain.credits import backfill_publishers

    bind = op.get_bind()
    session = Session(bind=bind)
    report = backfill_publishers(session)
    print(
        f"backfill_publishers: {report['credits']} credits, "
        f"{report['entities']} entities, {report['scopes']} scopes, "
        f"{len(report['skipped'])} skipped"
    )
    if report["skipped"]:
        # Decision C says these cannot exist in the live data. If one does,
        # the operator must see it - the row is left in place, not dropped.
        for row in report["skipped"]:
            print(f"  SKIPPED {row}")


def downgrade() -> None:
    raise NotImplementedError(
        "One-way: the tag rows and their vocabulary are gone. Restore from "
        "the pre-migration dump named in docs/PROGRESS.md."
    )
```

- [ ] **Step 6: Dry-run against a scratch database, not the dev one**

```bash
createdb anime_site_test_pubmig
pg_dump anime_site | psql anime_site_test_pubmig
```

Point `DATABASE_URL` at the scratch copy, run `alembic upgrade head`, and
check the printed report reads roughly **520 credits, 33 entities, 0 skipped**
(31 new + the 2 game publishers). Then spot-check in `psql`:

```sql
SELECT p.name_cn, p.name_en, count(*) FROM media_credit c
  JOIN publisher p ON p.system_id = c.publisher_id
 WHERE c.role = 'publisher' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10;
SELECT count(*) FROM system_option
 WHERE category IN ('Publisher / Distributor TW', 'Comic Publisher');  -- 0
```

- [ ] **Step 7: Prepare the commit and ask**

`feat(publisher): convert publisher_tw and comic_publisher into entities`

---

## Task 6: Retire the tag fields

The data is gone from `media_tag`, so the vocabulary can go from the code.

**The coexistence window ends here — read this first.** From Task 4 until this
task lands, the credit and the tag both exist, and Task 4 deliberately did
*not* add the `LEGACY_SHEET_COLUMN` pairs early: doing so would make
`sheet_link_headers("anime")` emit `distributor_tw` **twice**, and since
restore matches by header name, the empty credit column could shadow and blank
the live tag column on a Backup → Pull. So during the window the credit rides
under its own `publisher` key, adding one empty column to the Anime, Manga and
Novel tabs. This task removes that column by mapping the credit onto the
legacy header, and the sheet ends the migration shaped exactly as it started.

Comic is the unavoidable exception: `sheet_column_for("comic", "publisher")`
falls back to `publisher`, which is already `comic_publisher`'s legacy header,
so the Comic tab carries a duplicate header for the length of the window.
**Do not run Backup + Pull All on the Comic tab between Task 4 and this task.**

Task 4 also had to do part of this task's `link_fields.py` work to stay green —
`publisher` and `publisher_refs` are already on `AnimeLinkFields`,
`AnimeMovieLinkFields`, `MangaLinkFields` and `NovelLinkFields`, and
`publisher_refs` on `ComicLinkFields`. What remains here is
`AnimeMovieLinkFields.distributor_tw` and deleting `ComicLinkFields.publisher_tw`.

**Files:**
- Modify: `app/utils/credit_roles.py` (delete both `TAG_FIELDS` entries;
  update `LEGACY_SHEET_COLUMN`)
- Modify: `app/schemas/link_fields.py` (`AnimeMovieLinkFields` gains
  `distributor_tw`; `ComicLinkFields` loses `publisher_tw`)
- Modify: `app/utils/formatter.py` (the four `parse_from_sheet` sites)
- Modify: `app/services/domain/autofill.py:575-577`
- Modify: `app/services/domain/checking.py:241`, `app/utils/utils.py:142`
- Modify: `app/models/staff.py` (`Studio` and `Publisher` docstrings)
- Test: `tests/unit/test_credit_roles.py`, `tests/api/test_sheet_columns.py`

- [ ] **Step 1: Write the failing test**

```python
def test_the_retired_vocabularies_are_gone():
    from app.utils.credit_roles import OPTION_CATEGORIES, TAG_FIELD_KEYS

    assert "publisher_tw" not in TAG_FIELD_KEYS
    assert "comic_publisher" not in TAG_FIELD_KEYS
    assert "Publisher / Distributor TW" not in OPTION_CATEGORIES
    assert "Comic Publisher" not in OPTION_CATEGORIES


def test_each_type_keeps_the_sheet_header_it_has_always_used():
    from app.utils.credit_roles import sheet_column_for

    assert sheet_column_for("anime", "publisher") == "distributor_tw"
    assert sheet_column_for("anime-movie", "publisher") == "distributor_tw"
    assert sheet_column_for("manga", "publisher") == "publisher_tw"
    assert sheet_column_for("novel", "publisher") == "publisher_tw"
    assert sheet_column_for("comic", "publisher") == "publisher"
    assert sheet_column_for("game", "publisher") == "publisher"
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `venv/Scripts/python.exe -m pytest tests/unit/test_credit_roles.py -q`

- [ ] **Step 3: Make the edits**

Delete `TAG_FIELDS["publisher_tw"]` and `TAG_FIELDS["comic_publisher"]`.
`OPTION_CATEGORIES` derives from `TAG_FIELDS`, so both categories leave it
with no second edit.

In `LEGACY_SHEET_COLUMN`, remove the four `publisher_tw` pairs and the
`("comic", "comic_publisher")` pair, and add:

```python
    ("anime", "publisher"): "distributor_tw",
    ("anime-movie", "publisher"): "distributor_tw",
    ("manga", "publisher"): "publisher_tw",
    ("novel", "publisher"): "publisher_tw",
    ("comic", "publisher"): "publisher",
```

`("game", "publisher")` already falls through to its own key.

In `app/schemas/link_fields.py`: add `distributor_tw: Optional[str] = None`
and `publisher_refs: list[PublisherRef] = []` to `AnimeMovieLinkFields`; add
`publisher_refs` to `AnimeLinkFields`, `MangaLinkFields`, `NovelLinkFields`
and `ComicLinkFields`; delete `ComicLinkFields.publisher_tw`.

In `app/utils/formatter.py`, add the `distributor_tw` parse to the anime-movie
formatter beside the anime one at line 434, and leave the other three
(`publisher_tw` at 624/672, `publisher` at 735) reading the same headers.

In `app/services/domain/autofill.py:575-577`, Comic Vine's publisher becomes a
credit rather than a tag:

```python
        if not credit_names(db, "comic", comic.system_id, "publisher"):
            replace_credits(
                db, "comic", comic.system_id, "publisher",
                split_names(cv_data.get("publisher")),
            )
```

In `checking.py:241` and `utils.py:142`, the exclusion lists naming
`publisher_tw` now name the credit role's key.

Correct `Studio`'s docstring (`staff.py:176-183`) — it claims publishers stay
a `system_option` vocabulary until a later migration — and `Publisher`'s
"Shaped after Studio" line, now that publishers carry scope and studios do not.

- [ ] **Step 4: Run the full suite**

Run: `venv/Scripts/python.exe -m pytest -q` and `venv/Scripts/ruff.exe check .`

- [ ] **Step 5: Verify the sheet round-trip on the scratch database**

With `DATABASE_URL` on `anime_site_test_pubmig`, run Backup from `/system`,
then Pull All, then confirm the entity count is unchanged:

```sql
SELECT count(*) FROM publisher;                              -- still 33
SELECT count(*) FROM media_credit WHERE role = 'publisher';  -- still ~520
```

A rise in either means `find_publisher` missed a name on the way back in —
check that the four split rows kept their `name_alt`.

- [ ] **Step 6: Prepare the commit and ask**

`refactor(publisher): retire the publisher_tw and comic_publisher vocabularies`

---

## Task 7: Admin forms — entity picker and scope pills

**Files:**
- Create: `frontend/src/components/forms/PublisherScopePills.jsx` + test
- Modify: `frontend/src/config/formFields/fieldMeta.js` (lines 325, 530, 613,
  704, 715), `frontend/src/config/formFactories.js` (205, 248, 286),
  `frontend/src/lib/payloads.js`, `frontend/src/config/fieldOptions.js`
  (273-274), `frontend/src/lib/optionsPageGroups.js` (109, 122)
- Modify: the Anime / Manga / Novel / Comic add-tabs and the Publisher
  Add/Modify tabs

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/forms/PublisherScopePills.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublisherScopePills from "./PublisherScopePills";

describe("PublisherScopePills", () => {
  it("renders one pill per media type a publisher may be offered on", () => {
    render(<PublisherScopePills scopes={[]} setScopes={() => {}} />);
    ["Anime", "Anime Movie", "Manga", "Novel", "Comic", "Game"].forEach((l) =>
      expect(screen.getByRole("button", { name: l })).toBeInTheDocument(),
    );
  });

  it("adds a scope without removing the ones already held", () => {
    const setScopes = vi.fn();
    render(<PublisherScopePills scopes={["anime"]} setScopes={setScopes} />);
    fireEvent.click(screen.getByRole("button", { name: "Manga" }));
    expect(setScopes).toHaveBeenCalledWith(["anime", "manga"]);
  });

  it("removes a held scope when its pill is clicked again", () => {
    const setScopes = vi.fn();
    render(<PublisherScopePills scopes={["anime", "manga"]} setScopes={setScopes} />);
    fireEvent.click(screen.getByRole("button", { name: "Anime" }));
    expect(setScopes).toHaveBeenCalledWith(["manga"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/components/forms/PublisherScopePills.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Model it on `PersonRoleMatrix` (`PersonAddTab.jsx:49-121`) reduced to one row —
there is no role axis to cross the media types with. Use semantic colour
tokens only (`bg-surface`, `text-text-muted`, `border-border`); a hard-coded
grey utility fails `src/theme-tokens.test.js` and the build with it.

```jsx
// The six media types a publisher may be credited on. Mirrors
// legal_scopes("publisher") in app/utils/credit_roles.py; a seventh type
// added there must be added here.
const PUBLISHER_SCOPES = [
  { key: "anime", label: "Anime" },
  { key: "anime-movie", label: "Anime Movie" },
  { key: "manga", label: "Manga" },
  { key: "novel", label: "Novel" },
  { key: "comic", label: "Comic" },
  { key: "game", label: "Game" },
];

export default function PublisherScopePills({ scopes, setScopes }) {
  const toggle = (key) =>
    setScopes(
      scopes.includes(key)
        ? scopes.filter((s) => s !== key)
        : PUBLISHER_SCOPES.filter(
            (s) => s.key === key || scopes.includes(s.key),
          ).map((s) => s.key),
    );

  return (
    <div className="flex flex-wrap gap-2">
      {PUBLISHER_SCOPES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => toggle(s.key)}
          className={
            scopes.includes(s.key)
              ? "rounded-full border border-accent bg-accent/10 px-3 py-1 text-sm text-accent"
              : "rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-muted"
          }
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

Note the toggle keeps `PUBLISHER_SCOPES` order rather than appending, so the
value posted is stable regardless of click order — the test above asserts
`["anime", "manga"]`, not `["manga", "anime"]`.

- [ ] **Step 4: Swap the four forms onto the entity picker**

In `fieldMeta.js`, each `publisher_tw` / comic `publisher` descriptor changes
from `source: { kind: "option", category: "Publisher / Distributor TW" }` to
the publisher-entity kind the Game form already uses, scoped to that media
type. Remove both categories from `fieldOptions.js:273-274` and
`optionsPageGroups.js:109,122`, and update `payloads.js`'s per-type key map so
the four types post `publisher` rather than `publisher_tw`.

Mount `PublisherScopePills` in `PublisherAddTab.jsx` and `PublisherModifyTab.jsx`,
wiring `scopes` into the POST/PUT body added in Task 2.

- [ ] **Step 5: Run the frontend gate and build**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

Both `optionCategoryGroups.test.js` and `optionsPageGroups.test.js` assert the
old category lists; update them — they record the retired vocabulary.

- [ ] **Step 6: Prepare the commit and ask**

`feat(publisher): pick publishers as entities and edit their scopes`

---

## Task 8: Detail pages read the backend's label

**Files:**
- Delete: `frontend/src/components/info/PublisherLinks.jsx`
- Modify: `frontend/src/components/info/StudioLinks.jsx:45-49`
- Modify: `frontend/src/pages/detail/Anime.jsx:462`,
  `AnimeMovie.jsx:461`, `Manga.jsx:747`, `Novel.jsx:613-614`,
  `Comic.jsx:449-450`, `Game.jsx:531-536`
- Test: `frontend/src/components/info/StudioLinks.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
it("labels a publisher row from the ref the backend supplied", () => {
  const anime = {
    publisher_refs: [
      { system_id: "abc", display_name: "木棉花", label: "台灣代理商" },
    ],
  };
  expect(publisherLabel(anime, "台灣代理商")).toBe("台灣代理商");
});

it("falls back to the literal when an entry has no publisher refs", () => {
  expect(publisherLabel({ publisher_refs: [] }, "發行商")).toBe("發行商");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/components/info/StudioLinks.test.jsx`

- [ ] **Step 3: Add the label reader**

In `StudioLinks.jsx`, beside `publisherValue`, mirroring
`creditLabel(item, role, fallback)` at `PersonLinks.jsx:57-59`:

```js
/**
 * What this media type calls its publisher row. One publisher role reads
 * 台灣代理商 on an anime and 發行商 on a game; the backend owns
 * that mapping (credit_label in app/utils/credit_roles.py) and ships it on
 * every PublisherRef, so no page hard-codes a variant. The fallback covers an
 * entry with no publisher credited yet.
 */
export function publisherLabel(item, fallback) {
  return item?.publisher_refs?.[0]?.label || fallback;
}
```

- [ ] **Step 4: Point the five pages at it**

Each page's publisher row becomes, for example on `Anime.jsx:462`:

```js
...(anime.distributor_tw || anime.publisher_refs?.length
  ? [{
      label: publisherLabel(anime, "台灣代理商"),
      value: publisherValue(anime),
    }]
  : []),
```

`Manga.jsx`, `Novel.jsx` and `Comic.jsx` take the same shape with a
their own fallback (台灣出版商 for manga and novel, 出版商 for comic) and their
own entry variable; `Game.jsx:535` swaps its bare literal for
`publisherLabel(game, "發行商")`; `AnimeMovie.jsx` gains
the row it never had, beside its Studio row at line 461.

Delete `PublisherLinks.jsx`. Confirm nothing imports it first:

```bash
grep -rn "PublisherLinks" frontend/src
```

- [ ] **Step 5: Run the frontend gate and build**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

- [ ] **Step 6: Check it in the running app**

Start the app, open one anime, one manga and one game detail page, and confirm
the anime reads **台灣代理商**, the manga **台灣出版商**, the game **發行商**, and that each name
links to `/publisher/:system_id`. Then open `/library/publisher` and the nav
search bar and confirm the migrated publishers appear.

- [ ] **Step 7: Prepare the commit and ask**

`feat(publisher): link publishers from every detail page under its own label`

---

## Task 9: Scoped suggestion fetch

**Files:**
- Modify: `frontend/src/lib/sources.js` (header comment, lines 33-34, 46-47)
- Test: `frontend/src/lib/sources.test.js` (create if absent)

- [ ] **Step 1: Write the failing test**

```js
it("fetches publishers once per media type that credits one", async () => {
  const calls = [];
  global.fetch = vi.fn((url) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, json: async () => [] });
  });

  await fetchAllSources();

  expect(calls.filter((u) => u.includes("/api/publisher"))).toEqual(
    expect.arrayContaining([expect.stringContaining("scope=anime")]),
  );
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/lib/sources.test.js`

- [ ] **Step 3: Fan out by scope**

Replace the flat publisher fetch with one request per distinct publisher scope
used in `fieldMeta.js`, keyed by media type. Correct the file's header comment
and the `fetchAllSources` docstring — both currently state that neither
studios nor publishers have a role/scope concept. Studios still do not;
publishers now do.

- [ ] **Step 4: Run the frontend gate and build**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

- [ ] **Step 5: Prepare the commit and ask**

`feat(publisher): fetch publisher suggestions scoped to the media type`

---

## Task 10: Documentation

**Files:**
- Modify: `docs/data-model.md` (a `publisher_scope` section beside
  `person_role`'s at 657-679; the `publisher` section at 685+, which records
  the now-reversed no-scope ruling; the TOC at line 23)
- Modify: `docs/systems/credits-and-tags.md` (entity table line 29,
  `resolve_*` at 195-199, the `/api/publisher` endpoint table, admin UI at
  296-297, migration history at 311-319)
- Modify: `docs/options.md`, `docs/entry-types.md`, `docs/data-actions.md`,
  `docs/business-rules.md`, `docs/api.md`, `docs/frontend/pages.md`
- Modify: `docs/roadmap.md` (delete the line-91 known-debt entry; add the
  shipped row), `docs/PROGRESS.md` (drop the open item; add
  `anime_site_test_pubmig` to the droppable list)

- [ ] **Step 1: Make the edits**

Bump every touched file's `Last verified` line to the date of the change.

The roadmap's shipped row should record what this reversed: publishers were
deliberately shipped *beside* the `publisher_tw` vocabulary on 2026-09-06 and
have now replaced it, with the label split per media type and scope added to
the entity that Studio still does not have.

- [ ] **Step 2: Check nothing stale survives**

```bash
grep -rn "publisher_tw\|comic_publisher\|Publisher / Distributor TW" docs/ app/ frontend/src/
```

Every remaining hit should be either a sheet header (`distributor_tw`,
`publisher_tw` as a *column name*), a migration file, or a historical note in
`docs/notes/migrations-history.md`. A live code path referencing the retired
vocabulary is a bug.

- [ ] **Step 3: Prepare the commit and ask**

`docs: record the publisher entity migration`

---

## Self-review

Checked against the spec:

- Decisions A, B, C, D, E, F each have a task — B in Task 4 and 8, C in Task
  5's `skipped` guard, D and E in Task 5's `PUBLISHER_NAME_MAP`, F in Tasks 1,
  2, 7 and 9.
- Every spec section maps to a task: vocabulary → 4 and 6, `publisher_scope`
  schema → 1, backend plumbing → 2 and 3, migration → 5, backend cleanup → 6,
  frontend → 7, 8 and 9, testing → distributed, documentation → 10.
- Names used consistently across tasks: `backfill_publishers`,
  `PUBLISHER_NAME_MAP`, `PublisherScope`, `publisherLabel`, `publisherValue`,
  `resolve_publisher(db, name, *, scope)`, `PublisherResponse.scopes`.
- One spec item is deliberately carried as a task step rather than a task: the
  list-page filter keyed on the retired vocabulary. Task 7 Step 4 removes the
  category from `fieldOptions.js`, and Task 10 Step 2's grep is the net that
  catches it if a filter still reads it.
