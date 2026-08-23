"""
The System Configs tab carries announcements and admin form defaults.

`config_key` is UNIQUE, so an id-less sheet row whose key already exists
locally must update that row rather than insert a duplicate - a blind INSERT
raises IntegrityError at commit and rolls back the ENTIRE tab.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import pull


HEADERS = ["id", "config_key", "config_value"]


@pytest.fixture
def sheet(monkeypatch):
    """Feed execute_pull_specific a fake System Configs tab."""

    def _install(rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [HEADERS] + rows)

    return _install


def _config(db_session, key):
    return (
        db_session.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key == key)
        .all()
    )


def test_pull_inserts_new_configs(db_session, sheet):
    sheet([["", "announcement__hello", "world"]])

    result = pull.execute_pull_specific(db_session, "System Configs", log_action=False)

    assert result["status"] == "success"
    rows = _config(db_session, "announcement__hello")
    assert len(rows) == 1
    assert rows[0].config_value == "world"


def test_pull_updates_an_existing_key_instead_of_duplicating(db_session, sheet):
    local = models.SystemConfigs(config_key="form_default__anime", config_value="old")
    db_session.add(local)
    db_session.flush()
    local_id = local.id

    # An id-less row for a key that already exists locally.
    sheet([["", "form_default__anime", "new"]])

    result = pull.execute_pull_specific(db_session, "System Configs", log_action=False)

    assert result["status"] == "success"
    rows = _config(db_session, "form_default__anime")
    assert len(rows) == 1
    assert rows[0].id == local_id
    assert rows[0].config_value == "new"
