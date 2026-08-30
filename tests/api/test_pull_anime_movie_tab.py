"""
The Anime Movie sheet tab is named "Anime Movie" (singular).

Pull registered the tab as "Anime Movies" while its name-resolution and
id-less dedup branches compared against "Anime Movie", so neither ever ran:
a franchise given by name skipped the row, and a re-import duplicated it.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import backup, pull


@pytest.fixture
def sheet(monkeypatch):
    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


def test_the_tab_is_registered_under_its_real_name():
    assert "Anime Movie" in pull.MEDIA_TYPE_FOR_TAB
    assert "Anime Movies" not in pull.MEDIA_TYPE_FOR_TAB
    assert "Anime Movie" in pull.TABS_IN_ORDER


def test_a_franchise_given_by_name_is_resolved_or_created(db_session, sheet):
    sheet(
        ["anime_movie_name_en", "franchise_id"],
        [["Your Name", "Makoto Shinkai Films"]],
    )
    result = pull.execute_pull_specific(db_session, "Anime Movie", log_action=False)
    assert result["status"] == "success", result
    assert result["rows_added"] == 1
    movie = (
        db_session.query(models.AnimeMovies)
        .filter_by(anime_movie_name_en="Your Name")
        .one()
    )
    assert movie.franchise_id is not None
    fran = db_session.get(models.Franchise, movie.franchise_id)
    assert fran.franchise_name_en == "Makoto Shinkai Films"


def test_an_idless_row_matching_by_name_updates_instead_of_duplicating(db_session, sheet):
    existing = models.AnimeMovies(anime_movie_name_en="Your Name", my_rating="A")
    db_session.add(existing)
    db_session.flush()
    sheet(["anime_movie_name_en", "my_rating"], [["Your Name", "S"]])

    result = pull.execute_pull_specific(db_session, "Anime Movie", log_action=False)

    assert result["rows_updated"] == 1
    assert result["rows_added"] == 0
    assert db_session.query(models.AnimeMovies).count() == 1
    db_session.refresh(existing)
    assert existing.my_rating == "S"


def test_backup_writes_the_tab_under_its_real_name(db_session, monkeypatch):
    written = []

    def record(tab, matrix):
        written.append(tab)
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db_session)
    assert "Anime Movie" in written
    assert "Anime Movies" not in written
