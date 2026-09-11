"""
A row Pull could not resolve is LOST DATA on a restore, so it has to reach a
human. The admin page shows a generic toast and reloads the log table, so the
Pull All audit row is the only place it can.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import json
import uuid

import pytest

from app import models
from app.services.pipelines import pull

USER_HEADERS = ["id", "username", "list_is_public", "role"]


@pytest.fixture
def db(db_session):
    return db_session


def test_pull_all_logs_the_unresolved_references(db, monkeypatch):
    def fake_rows(tab):
        if tab == "Users":
            return [USER_HEADERS, [str(uuid.uuid4()), "ghost", "FALSE", "wizard"]]
        return []

    monkeypatch.setattr(pull, "get_all_raw_rows", fake_rows)

    # may_restore_authz=True: this suite is about the unresolved-reference
    # machinery, which it exercises through the Users tab - a tab Pull now
    # skips without admin.authz. The gate itself is covered by
    # tests/api/test_pull_authz_tabs.py.
    result = pull.execute_pull_all(
        db, action_type="Manual", may_restore_authz=True
    )

    assert any("wizard" in ref for ref in result["unresolved_refs"])

    log = (
        db.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == "Pull All")
        .order_by(models.DataControlLog.id.desc())
        .first()
    )
    assert log is not None
    assert log.status == "Failed"
    assert "unresolved" in (log.error_message or "").lower()
    assert "wizard" in json.dumps(json.loads(log.details_json))


def test_a_clean_pull_all_reports_an_empty_list(db, monkeypatch):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [])

    # may_restore_authz=True: this suite is about the unresolved-reference
    # machinery, which it exercises through the Users tab - a tab Pull now
    # skips without admin.authz. The gate itself is covered by
    # tests/api/test_pull_authz_tabs.py.
    result = pull.execute_pull_all(
        db, action_type="Manual", may_restore_authz=True
    )

    assert result["unresolved_refs"] == []
