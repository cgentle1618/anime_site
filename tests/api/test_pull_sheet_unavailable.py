"""
A tab that could not be read must be reported as Failed, never as "no data".

A 503 from Google used to be swallowed into `[]` by `get_all_raw_rows`, which
`execute_pull_specific` could not tell apart from an empty tab: it logged
"No data found", wrote a Success audit row, and `execute_pull_all` went on to
report the whole run as a success with the tab silently skipped.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.integrations.sheets import SheetsUnavailableError
from app.services.pipelines import pull


def _outage(tab_name):
    raise SheetsUnavailableError(
        f"Failed to retrieve data from tab '{tab_name}': "
        "APIError: [503]: The service is currently unavailable."
    )


def _logs(db, action_specific):
    return (
        db.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == action_specific)
        .all()
    )


# ---------------------------------------------------------------------------
# A single tab
# ---------------------------------------------------------------------------


def test_unreadable_tab_returns_an_error_not_a_success(db_session, monkeypatch):
    monkeypatch.setattr(pull, "get_all_raw_rows", _outage)

    result = pull.execute_pull_specific(db_session, "System Options", log_action=False)

    assert result["status"] == "error"
    assert result["reason"] == "sheet_unavailable"
    assert "503" in result["message"]


def test_unreadable_tab_is_audited_as_failed(db_session, monkeypatch):
    monkeypatch.setattr(pull, "get_all_raw_rows", _outage)

    pull.execute_pull_specific(db_session, "System Options", log_action=True)

    logged = _logs(db_session, "Pull System Options")
    assert [entry.status for entry in logged] == ["Failed"]
    assert "503" in logged[0].error_message


def test_an_empty_tab_is_still_a_success(db_session, monkeypatch):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [])

    result = pull.execute_pull_specific(db_session, "System Options", log_action=True)

    assert result["status"] == "success"
    assert result["processed"] == 0
    assert [entry.status for entry in _logs(db_session, "Pull System Options")] == [
        "Success"
    ]


# ---------------------------------------------------------------------------
# The full run
# ---------------------------------------------------------------------------


def test_full_pull_finishes_the_other_tabs_then_fails(db_session, monkeypatch):
    """One tab's outage must not cost the other nineteen their restore."""
    pulled = []

    def one_bad_tab(tab_name):
        if tab_name == "System Options":
            _outage(tab_name)
        pulled.append(tab_name)
        return []

    monkeypatch.setattr(pull, "get_all_raw_rows", one_bad_tab)

    with pytest.raises(SheetsUnavailableError, match="System Options"):
        pull.execute_pull_all(db_session)

    assert "Franchise" in pulled
    assert "Comic" in pulled
    assert "System Options" not in pulled

    logged = _logs(db_session, "Pull All")
    assert [entry.status for entry in logged] == ["Failed"]
    assert "System Options" in logged[0].error_message


def test_full_pull_still_reports_success_when_every_tab_reads(db_session, monkeypatch):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [])

    result = pull.execute_pull_all(db_session)

    assert result["status"] == "success"
    assert [entry.status for entry in _logs(db_session, "Pull All")] == ["Success"]
