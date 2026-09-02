"""
Pull across two databases that each minted their own UUIDs.

`system_option`, `person` and `studio` have no identity in the spreadsheet's
source data - they are DERIVED, minted row by row by the credit backfill and
by `extract_system_options`. Two databases that run that migration produce the
same natural keys under completely different `system_id`s. Pull resolved a row
by `system_id` alone, so every one of the sheet's rows missed and became an
INSERT, which then collided with the natural-key UNIQUE constraint the same
logical row already occupied (`uq_system_option_value`, `uq_person_name`,
`uq_studio_name`) and rolled back the whole tab.

The parent tabs must therefore fall back to the natural key and keep the LOCAL
uuid, and the tabs that point at them by raw uuid (`System Option Scope`,
`Person Role`) must be remapped through the parent's own sheet tab.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull

OPTION_HEADERS = ["system_id", "category", "value", "sort_order", "remark"]
PERSON_HEADERS = ["system_id", "name_native", "name_en", "name_cn", "gender"]
STUDIO_HEADERS = ["system_id", "name_native", "name_en", "name_cn", "my_rating"]
SCOPE_HEADERS = ["id", "option_id", "scope"]
ROLE_HEADERS = ["id", "person_id", "role", "scope"]


@pytest.fixture
def sheets(monkeypatch):
    """Feed execute_pull_specific fake tabs, keyed by tab name."""

    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


# --- The three derived-identity parent tabs --------------------------------


def test_option_with_a_foreign_uuid_updates_the_local_row(db_session, sheets):
    local = models.SystemOption(
        system_id=uuid.uuid4(), category="Studio", value="MAPPA", sort_order=0
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    # Same (category, value), under a uuid this database has never seen.
    sheets(
        {
            "System Options": [
                OPTION_HEADERS,
                [str(uuid.uuid4()), "Studio", "MAPPA", "7", "note"],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "System Options", log_action=False)

    assert result["status"] == "success"
    rows = (
        db_session.query(models.SystemOption)
        .filter_by(category="Studio", value="MAPPA")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].sort_order == 7


def test_person_with_a_foreign_uuid_updates_the_local_row(db_session, sheets):
    local = models.Person(system_id=uuid.uuid4(), name_native="新房昭之")
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheets(
        {
            "Person": [
                PERSON_HEADERS,
                [str(uuid.uuid4()), "新房昭之", "", "新房昭之", "Male"],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Person", log_action=False)

    assert result["status"] == "success"
    rows = db_session.query(models.Person).filter_by(name_native="新房昭之").all()
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].gender == "Male"


def test_studio_with_a_foreign_uuid_updates_the_local_row(db_session, sheets):
    local = models.Studio(system_id=uuid.uuid4(), name_native="シャフト")
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheets(
        {
            "Studio": [
                STUDIO_HEADERS,
                [str(uuid.uuid4()), "シャフト", "", "沙夫特", "A"],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Studio", log_action=False)

    assert result["status"] == "success"
    rows = db_session.query(models.Studio).filter_by(name_native="シャフト").all()
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].my_rating == "A"


def test_a_different_name_en_is_a_different_studio(db_session, sheets):
    """
    The boundary of the natural key, stated on purpose.

    uq_studio_name is (name_native, name_en), so a sheet row that fills in a
    name_en the local row does not have is a DIFFERENT key and inserts rather
    than merging. Matching on name_native alone instead would silently fuse two
    studios that merely share a native name. Both the live Person and Studio
    tabs carry an empty name_en on every row today, so nothing hits this path;
    it is recorded here so a future change to the constraint has to face it.
    """
    db_session.add(models.Studio(system_id=uuid.uuid4(), name_native="シャフト"))
    db_session.flush()

    sheets(
        {
            "Studio": [
                STUDIO_HEADERS,
                [str(uuid.uuid4()), "シャフト", "SHAFT", "", ""],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Studio", log_action=False)

    assert result["status"] == "success"
    rows = db_session.query(models.Studio).filter_by(name_native="シャフト").all()
    assert len(rows) == 2


def test_a_genuinely_new_option_still_inserts(db_session, sheets):
    """The natural-key fallback must not turn new rows into no-ops."""
    sheet_uuid = str(uuid.uuid4())
    sheets(
        {
            "System Options": [
                OPTION_HEADERS,
                [sheet_uuid, "Studio", "Kyoto Animation", "0", ""],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "System Options", log_action=False)

    assert result["status"] == "success"
    rows = (
        db_session.query(models.SystemOption)
        .filter_by(category="Studio", value="Kyoto Animation")
        .all()
    )
    assert len(rows) == 1
    # Nothing local to reconcile against, so the sheet's uuid is adopted.
    assert str(rows[0].system_id) == sheet_uuid


# --- The two child tabs that cite a parent by raw uuid ---------------------


def test_scope_row_is_remapped_onto_the_local_option(db_session, sheets):
    local = models.SystemOption(
        system_id=uuid.uuid4(), category="Studio", value="MAPPA", sort_order=0
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheet_option_uuid = str(uuid.uuid4())
    sheets(
        {
            "System Options": [
                OPTION_HEADERS,
                [sheet_option_uuid, "Studio", "MAPPA", "0", ""],
            ],
            "System Option Scope": [SCOPE_HEADERS, ["", sheet_option_uuid, "anime"]],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "System Option Scope", log_action=False
    )

    assert result["status"] == "success"
    scopes = db_session.query(models.SystemOptionScope).all()
    assert len(scopes) == 1
    assert scopes[0].option_id == local_id
    assert scopes[0].scope == "anime"


def test_person_role_row_is_remapped_onto_the_local_person(db_session, sheets):
    local = models.Person(system_id=uuid.uuid4(), name_native="新房昭之")
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheet_person_uuid = str(uuid.uuid4())
    sheets(
        {
            "Person": [
                PERSON_HEADERS,
                [sheet_person_uuid, "新房昭之", "", "新房昭之", "Male"],
            ],
            "Person Role": [ROLE_HEADERS, ["", sheet_person_uuid, "director", "anime"]],
        }
    )

    result = pull.execute_pull_specific(db_session, "Person Role", log_action=False)

    assert result["status"] == "success"
    roles = db_session.query(models.PersonRole).all()
    assert len(roles) == 1
    assert roles[0].person_id == local_id
    assert roles[0].role == "director"


def test_scope_row_ignores_the_sheets_integer_id(db_session, sheets):
    """
    `system_option_scope.id` is autoincrement, so it is minted per database
    too: the sheet's id=1 names a DIFFERENT row here. Honouring it updates
    that unrelated row's option_id and collides with uq_system_option_scope.
    These rows are identified by (option_id, scope), never by the sheet's id.
    """
    local = models.SystemOption(
        system_id=uuid.uuid4(), category="Studio", value="MAPPA", sort_order=0
    )
    db_session.add(local)
    db_session.flush()
    db_session.add(models.SystemOptionScope(option_id=local.system_id, scope="anime"))
    db_session.flush()

    sheet_option_uuid = str(uuid.uuid4())
    sheets(
        {
            "System Options": [
                OPTION_HEADERS,
                [sheet_option_uuid, "Studio", "MAPPA", "0", ""],
            ],
            # id=1 belongs to a different row in this database.
            "System Option Scope": [SCOPE_HEADERS, ["1", sheet_option_uuid, "anime"]],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "System Option Scope", log_action=False
    )

    assert result["status"] == "success"
    scopes = db_session.query(models.SystemOptionScope).all()
    assert len(scopes) == 1
    assert scopes[0].option_id == local.system_id


def test_a_new_scope_for_a_known_option_still_inserts(db_session, sheets):
    """Ignoring the sheet's id must not collapse distinct scopes into one."""
    local = models.SystemOption(
        system_id=uuid.uuid4(), category="Studio", value="MAPPA", sort_order=0
    )
    db_session.add(local)
    db_session.flush()
    db_session.add(models.SystemOptionScope(option_id=local.system_id, scope="anime"))
    db_session.flush()

    sheet_option_uuid = str(uuid.uuid4())
    sheets(
        {
            "System Options": [
                OPTION_HEADERS,
                [sheet_option_uuid, "Studio", "MAPPA", "0", ""],
            ],
            "System Option Scope": [SCOPE_HEADERS, ["1", sheet_option_uuid, "manga"]],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "System Option Scope", log_action=False
    )

    assert result["status"] == "success"
    scopes = db_session.query(models.SystemOptionScope).all()
    assert {s.scope for s in scopes} == {"anime", "manga"}


def test_person_role_ignores_the_sheets_integer_id(db_session, sheets):
    local = models.Person(system_id=uuid.uuid4(), name_native="新房昭之")
    db_session.add(local)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=local.system_id, role="director", scope="anime")
    )
    db_session.flush()

    sheet_person_uuid = str(uuid.uuid4())
    sheets(
        {
            "Person": [
                PERSON_HEADERS,
                [sheet_person_uuid, "新房昭之", "", "新房昭之", "Male"],
            ],
            "Person Role": [ROLE_HEADERS, ["1", sheet_person_uuid, "director", "anime"]],
        }
    )

    result = pull.execute_pull_specific(db_session, "Person Role", log_action=False)

    assert result["status"] == "success"
    roles = db_session.query(models.PersonRole).all()
    assert len(roles) == 1
    assert roles[0].person_id == local.system_id


# --- Rows minted per database that cite STABLE entry ids -------------------
#
# media_relation and plan_next carry uuids of their own that each database
# minted (plan_next's came from the rewatch migration), but the entry ids they
# point AT come from the sheet and are the same everywhere. So only the row's
# own identity needs reconciling - there is no parent uuid to translate.

RELATION_HEADERS = [
    "system_id", "from_type", "from_id", "relation_type", "to_type", "to_id", "remark",
]
PLAN_HEADERS = ["system_id", "kind", "media_type", "scope", "target_id", "remark"]


def test_relation_with_a_foreign_uuid_updates_the_local_row(db_session, sheets):
    from_id, to_id = uuid.uuid4(), uuid.uuid4()
    local = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="tv-show",
        from_id=from_id,
        relation_type="sequel",
        to_type="tv-show",
        to_id=to_id,
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheets(
        {
            "Media Relation": [
                RELATION_HEADERS,
                [
                    str(uuid.uuid4()), "tv-show", str(from_id), "sequel",
                    "tv-show", str(to_id), "covers ep 1-12",
                ],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Media Relation", log_action=False)

    assert result["status"] == "success"
    rows = db_session.query(models.MediaRelation).all()
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].remark == "covers ep 1-12"


def test_plan_next_with_a_foreign_uuid_updates_the_local_row(db_session, sheets):
    target = uuid.uuid4()
    local = models.PlanNext(
        system_id=uuid.uuid4(),
        kind="next",
        media_type="movie",
        scope="entry",
        target_id=target,
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheets(
        {
            "Plan Next": [
                PLAN_HEADERS,
                [str(uuid.uuid4()), "next", "movie", "entry", str(target), "soon"],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Plan Next", log_action=False)

    assert result["status"] == "success"
    rows = db_session.query(models.PlanNext).all()
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].remark == "soon"


def test_a_different_kind_is_a_different_plan_row(db_session, sheets):
    """kind is part of the key: queued and rewatch coexist for one target."""
    target = uuid.uuid4()
    db_session.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            kind="next",
            media_type="movie",
            scope="entry",
            target_id=target,
        )
    )
    db_session.flush()

    sheets(
        {
            "Plan Next": [
                PLAN_HEADERS,
                [str(uuid.uuid4()), "rewatch", "movie", "entry", str(target), ""],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Plan Next", log_action=False)

    assert result["status"] == "success"
    assert {r.kind for r in db_session.query(models.PlanNext).all()} == {
        "next",
        "rewatch",
    }


def test_scope_row_for_an_unknown_option_is_skipped_not_crashed(db_session, sheets):
    """A dangling parent reference drops the row, like every other FK miss."""
    orphan = str(uuid.uuid4())
    sheets(
        {
            "System Options": [OPTION_HEADERS],
            "System Option Scope": [SCOPE_HEADERS, ["", orphan, "anime"]],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "System Option Scope", log_action=False
    )

    assert result["status"] == "success"
    assert db_session.query(models.SystemOptionScope).count() == 0
