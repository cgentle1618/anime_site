"""
A Pulled Anime row with blank status cells must get valid vocabulary values.

The INSERT sanitizer wrote "Haven't Started" (not a WatchStatus) and "" for
airing_status / airing_type, and "" defeats every `airing_type in {...}` check
downstream (seasonal counts, ep_previous, size groups).

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.domain.user_list import attach_list_fields, installation_owner_id
from app.services.pipelines import pull
from app.utils.constants import WatchStatus


@pytest.fixture
def sheet(monkeypatch):
    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


def test_blank_anime_statuses_insert_as_valid_values(db_session, sheet, admin_user):
    sheet(["anime_name_en"], [["Frieren"]])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["rows_added"] == 1, result
    anime = db_session.query(models.Anime).filter_by(anime_name_en="Frieren").one()
    # Status left `anime` in step 1; read it the way the app does.
    attach_list_fields(db_session, "anime", anime, installation_owner_id(db_session))
    assert anime.watching_status == "Might Watch"
    assert anime.watching_status in {s.value for s in WatchStatus}
    # Unknown is NULL, never an empty string that no vocabulary contains.
    assert anime.airing_status is None
    assert anime.airing_type is None
