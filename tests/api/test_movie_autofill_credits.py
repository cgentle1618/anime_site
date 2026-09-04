"""
Tests for autofill_movie_from_imdb's director-writing behavior.

This is the exact function and the exact bug (R21) task 16 exists to fix:
`movie.director = ...` silently created a dead Python attribute since
Movies.director is a dropped column. The fix routes the fetched name through
replace_credits instead. These tests exercise the real function end to end
(fetch and cover-download patched out, mapping left real) and assert on the
actual credit names/scope, not just a count, so a wrong role/media_type/scope
or an inverted fill-only gate would fail here.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_movie_from_imdb
from app.services.domain.credits import credit_names, replace_credits

TMDB_RAW = {
    "id": 550,
    "release_date": "1999-10-15",
    "credits": {
        "crew": [
            {"name": "David Fincher", "job": "Director"},
            {"name": "Jane Producer", "job": "Producer"},
        ]
    },
}

OMDB_RAW = {}


def make_movie(db_session, **kwargs):
    defaults = dict(
        system_id=uuid.uuid4(),
        movie_name_en="Fight Club",
        imdb_id="tt0137523",
        length_min=None,
        release_date_usa=None,
        cover_image_file=None,
    )
    defaults.update(kwargs)
    movie = models.Movies(**defaults)
    db_session.add(movie)
    db_session.flush()
    return movie


@pytest.fixture
def patched(monkeypatch):
    """Patches the fetch and the cover download; leaves the real mapper in place."""
    calls = {"fetch": [], "download": []}

    def fake_fetch(imdb_id):
        calls["fetch"].append(imdb_id)
        return {"tmdb_raw": TMDB_RAW, "omdb_raw": OMDB_RAW}

    def fake_download(url, system_id):
        calls["download"].append((url, system_id))
        return "downloaded.jpg"

    monkeypatch.setattr(autofill_module, "fetch_imdb_data", fake_fetch)
    monkeypatch.setattr(autofill_module, "download_cover_image", fake_download)
    return calls


class TestAutofillMovieDirectorCredits:
    def test_a_movie_with_no_director_gets_one_written_from_the_fetch(
        self, db_session, patched
    ):
        movie = make_movie(db_session)
        assert credit_names(db_session, "movie", movie.system_id, "director") == []

        autofill_movie_from_imdb(movie, db_session)

        assert credit_names(db_session, "movie", movie.system_id, "director") == [
            "David Fincher"
        ]

    def test_a_movie_with_an_existing_director_is_left_untouched(
        self, db_session, patched
    ):
        movie = make_movie(db_session)
        replace_credits(
            db_session, "movie", movie.system_id, "director", ["Someone Else"]
        )
        db_session.flush()

        autofill_movie_from_imdb(movie, db_session)

        assert credit_names(db_session, "movie", movie.system_id, "director") == [
            "Someone Else"
        ]

    def test_the_created_director_holds_the_movie_scope(self, db_session, patched):
        """
        Movie is not an anime media type, so the director person row must be
        recorded with scope="movie" - that's what makes them show up in
        the non-anime director dropdown rather than the anime one.
        """
        movie = make_movie(db_session)
        autofill_movie_from_imdb(movie, db_session)

        person = (
            db_session.query(models.Person)
            .filter_by(name_native="David Fincher")
            .one()
        )
        roles = {(r.role, r.scope) for r in person.roles}
        assert ("director", "movie") in roles
