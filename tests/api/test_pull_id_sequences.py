"""
Tabs restored with the sheet's own integer PK must leave their sequence sane.

Postgres does not advance a sequence when an INSERT supplies the id
explicitly. Restoring into a fresh instance therefore leaves person_role
holding ids 1..N while person_role_id_seq still sits at 1, and the first save
that lets the sequence pick a value dies on
`duplicate key value violates unique constraint "person_role_pkey"` - over and
over, because the sequence only creeps forward one collision at a time.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import pull


@pytest.fixture
def sheet(monkeypatch):
    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


def _rewind(db_session, sequence):
    """
    Put the sequence back where a freshly created database leaves it.

    Sequences are non-transactional, so a resync from an earlier test in the
    same session survives this test's rollback and would make the assertion
    below pass even with the fix removed.
    """
    db_session.execute(text(f"SELECT setval('{sequence}', 1, false)"))


def test_person_role_sequence_is_resynced_after_a_restore(db_session, sheet):
    _rewind(db_session, "person_role_id_seq")
    person = models.Person(name_jp="新海誠")
    db_session.add(person)
    db_session.flush()

    sheet(
        ["id", "person_id", "role", "scope"],
        [
            # Ids 1..N are exactly what a restore into a fresh instance brings.
            ["1", str(person.system_id), "director", "anime"],
            # A real scope, not "": person_role.scope is NOT NULL now, so a
            # sheet row with an empty scope fails the restore. Backups taken
            # after the role collapse always carry one - and a backup taken
            # BEFORE it cannot be restored anyway, because its role names are
            # the retired vocabulary.
            ["2", str(person.system_id), "producer", "anime"],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Person Role", log_action=False)
    assert result["status"] == "success"

    # The next role saved from the Add form lets the sequence choose the id.
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="composer", scope="anime")
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.PersonRole).all()}
    assert {1, 2} <= ids
    assert len(ids) == 3, "the sequence handed out an id that already existed"


def test_system_option_scope_sequence_is_resynced_after_a_restore(db_session, sheet):
    _rewind(db_session, "system_option_scope_id_seq")
    option = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(option)
    db_session.flush()

    sheet(
        ["id", "option_id", "scope"],
        [["1", str(option.system_id), "anime"]],
    )
    result = pull.execute_pull_specific(
        db_session, "System Option Scope", log_action=False
    )
    assert result["status"] == "success"

    db_session.add(
        models.SystemOptionScope(option_id=option.system_id, scope="comic")
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.SystemOptionScope).all()}
    assert 1 in ids
    assert len(ids) == 2, "the sequence handed out an id that already existed"


def test_system_option_usage_sequence_is_resynced_after_a_restore(db_session, sheet):
    _rewind(db_session, "system_option_usage_id_seq")
    option = models.SystemOption(category="Platform", value="Fox")
    db_session.add(option)
    db_session.flush()

    sheet(
        ["id", "option_id", "usage"],
        [["1", str(option.system_id), "origin"]],
    )
    result = pull.execute_pull_specific(
        db_session, "System Option Usage", log_action=False
    )
    assert result["status"] == "success"

    db_session.add(
        models.SystemOptionUsage(option_id=option.system_id, usage="access")
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.SystemOptionUsage).all()}
    assert 1 in ids
    assert len(ids) == 2, "the sequence handed out an id that already existed"
