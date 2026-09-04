"""
Fill eligibility must read credit/tag links, not dropped columns.

MOVIE_FIELDS_TO_FILL / COMIC_FIELDS_TO_FILL used to name `director`,
`publisher`, `writer`, `artist` - columns that no longer exist since credits
moved to media_credit / media_tag. `getattr(entry, "director", None)` is then
always None, so every movie and every comic was queued on every Fill run.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

from app import models
from app.services.domain.checking import (
    has_missing_values_comic,
    has_missing_values_movie,
)
from app.services.domain.credits import replace_credits, replace_tags


def make_movie(db):
    m = models.Movies(
        movie_name_en="Fight Club",
        length_min=139,
        airing_status="Finished Airing",
        release_date_usa="1999-10-15",
        imdb_rating="8.8",
        cover_image_file="fc.jpg",
    )
    db.add(m)
    db.flush()
    return m


def make_comic(db):
    c = models.Comic(
        comic_name_en="The Amazing Spider-Man",
        comicvine_id=2127,
        release_date="1963",
        issue_total=441,
        cover_image_file="asm.jpg",
    )
    db.add(c)
    db.flush()
    return c


def test_a_complete_movie_with_a_director_credit_needs_no_fill(db_session):
    m = make_movie(db_session)
    replace_credits(db_session, "movie", m.system_id, "director", ["David Fincher"])
    assert has_missing_values_movie(db_session, m) is False


def test_a_movie_without_a_director_credit_needs_a_fill(db_session):
    m = make_movie(db_session)
    assert has_missing_values_movie(db_session, m) is True


def test_a_movie_missing_a_real_column_needs_a_fill(db_session):
    m = make_movie(db_session)
    replace_credits(db_session, "movie", m.system_id, "director", ["David Fincher"])
    m.imdb_rating = None
    assert has_missing_values_movie(db_session, m) is True


def test_a_complete_comic_with_links_needs_no_fill(db_session):
    c = make_comic(db_session)
    replace_credits(db_session, "comic", c.system_id, "author", ["Stan Lee"])
    replace_credits(db_session, "comic", c.system_id, "illustrator", ["Steve Ditko"])
    replace_tags(db_session, "comic", c.system_id, "comic_publisher", ["Marvel"])
    assert has_missing_values_comic(db_session, c) is False


def test_a_comic_without_a_publisher_tag_needs_a_fill(db_session):
    c = make_comic(db_session)
    replace_credits(db_session, "comic", c.system_id, "author", ["Stan Lee"])
    replace_credits(db_session, "comic", c.system_id, "illustrator", ["Steve Ditko"])
    assert has_missing_values_comic(db_session, c) is True


def test_issue_total_of_zero_is_a_real_value_not_a_blank(db_session):
    c = make_comic(db_session)
    c.issue_total = 0
    replace_credits(db_session, "comic", c.system_id, "author", ["Stan Lee"])
    replace_credits(db_session, "comic", c.system_id, "illustrator", ["Steve Ditko"])
    replace_tags(db_session, "comic", c.system_id, "comic_publisher", ["Marvel"])
    assert has_missing_values_comic(db_session, c) is False
