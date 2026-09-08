"""
A tab that failed to back up must fail the whole Backup, not log Success.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import backup


def test_backup_logs_failed_when_a_tab_cannot_be_written(db_session, monkeypatch):
    def fake_overwrite(tab_name, matrix):
        if tab_name == "Anime":
            raise RuntimeError("quota")
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", fake_overwrite)

    with pytest.raises(RuntimeError):
        backup.execute_backup(db_session)

    log = (
        db_session.query(models.DataControlLog)
        .filter(models.DataControlLog.action_main == "Backup")
        .order_by(models.DataControlLog.id.desc())
        .first()
    )
    assert log is not None
    assert log.status == "Failed"
