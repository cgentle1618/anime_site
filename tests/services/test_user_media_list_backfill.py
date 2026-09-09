"""
The step-1 backfill, checked against whatever database the suite is pointed at.

Skips when user_media_list is empty: CI and a freshly reset test schema have no
migrated data to check, and a green run there would be meaningless rather than
reassuring. Run it against the dev database right after `alembic upgrade head`.
"""

import pytest
from sqlalchemy import create_engine, inspect, text

from app.database import SQLALCHEMY_DATABASE_URL

NINE = [
    ("anime", "watching_status"),
    ("anime_movies", "watching_status"),
    ("movies", "watching_status"),
    ("tv_shows", "watching_status"),
    ("cartoons", "watching_status"),
    ("manga", "reading_status"),
    ("novel", "reading_status"),
    ("comic", "reading_status"),
    ("games", "playing_status"),
]


@pytest.fixture(scope="module")
def conn():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as c:
        # A missing table is the same situation as an empty one: this module
        # asks about migrated data, and a test schema only has the table at all
        # if an api test happened to run first and call create_all. Skipping on
        # both keeps the module order-independent instead of erroring in CI.
        if not inspect(engine).has_table("user_media_list"):
            pytest.skip("user_media_list does not exist here; nothing to check")
        total = c.execute(text("SELECT count(*) FROM user_media_list")).scalar_one()
        if total == 0:
            pytest.skip("user_media_list is empty; nothing was backfilled here")
        yield c


def test_every_media_row_has_exactly_one_list_row(conn):
    media_count = conn.execute(text("SELECT count(*) FROM media")).scalar_one()
    list_count = conn.execute(text("SELECT count(*) FROM user_media_list")).scalar_one()
    assert list_count == media_count


def test_the_unique_constraint_holds(conn):
    dupes = conn.execute(
        text(
            "SELECT count(*) FROM ("
            "  SELECT user_id, media_id FROM user_media_list"
            "  GROUP BY user_id, media_id HAVING count(*) > 1"
            ") d"
        )
    ).scalar_one()
    assert dupes == 0


def test_every_list_row_belongs_to_the_admin(conn):
    others = conn.execute(
        text(
            "SELECT count(*) FROM user_media_list l "
            "JOIN users u ON u.id = l.user_id "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name <> 'admin'"
        )
    ).scalar_one()
    assert others == 0


def test_no_list_row_has_a_null_or_blank_status(conn):
    bad = conn.execute(
        text(
            "SELECT count(*) FROM user_media_list "
            "WHERE status IS NULL OR btrim(status) = ''"
        )
    ).scalar_one()
    assert bad == 0
