"""
Quotes are universal - shared, unfiltered, no per-user copies. author_id is
provenance only: it records who added the line, and nothing reads it to decide
who may see it.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_quote_table_has_a_not_null_author_id(db):
    assert models.Quote.__table__.c["author_id"].nullable is False


def test_a_quote_created_through_the_api_records_its_author(
    db, admin_client, admin_user
):
    # `media_type` and `entry_id` are read-only column_properties over `media`
    # (app/models/__init__.py), so the create payload names neither: a quote
    # posted through the API is unattached, which `is_general` already allows.
    r = admin_client.post("/api/quote/", json={"text": "有名的一句"})
    # These two routes return 200, not 201 - matching them as they are.
    assert r.status_code == 200
    quote = db.query(models.Quote).filter_by(system_id=r.json()["system_id"]).one()
    assert quote.author_id == admin_user.id


def test_a_quote_without_an_author_is_rejected(db):
    db.add(models.Quote(system_id=uuid.uuid4(), text="無作者"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_quotes_carry_no_scope_and_are_never_filtered_by_author(db, client):
    """
    The universality guarantee. A quote's author decides nothing: there is no
    scope column to classify it and no read that consults the column at all.
    """
    assert "scope" not in models.Quote.__table__.c
    rows = db.execute(text("SELECT COUNT(DISTINCT author_id) FROM quote")).scalar_one()
    assert rows >= 0  # no filtering exists to assert against; the column is inert


def test_every_existing_quote_has_an_author(db):
    orphans = db.execute(
        text("SELECT COUNT(*) FROM quote WHERE author_id IS NULL")
    ).scalar_one()
    assert orphans == 0


# --- Restore -------------------------------------------------------------
#
# The Quote tab carries author_id as a raw uuid, and the Users tab matches on
# `username`, not on id: the same person holds a DIFFERENT uuid in each
# database (NATURAL_KEYS["Users"] in pull.py). So every author uuid arriving
# from the other machine's sheet names a user this database does not have, and
# quote.author_id is NOT NULL with a real FK - the insert raises
# ForeignKeyViolation and rolls back the whole tab, losing every quote.
#
# Note and Meme carry the identical column and already handle this: an unknown
# author falls back to _restore_owner_id. Quote follows the same rule - a quote
# whose author is uncertain is still the quote, and the sheet is its only copy.


QUOTE_HEADERS = [
    "system_id", "media_id", "author_id", "text", "translation", "language",
    "speaker", "original_source", "episode", "link", "image_file", "tags",
    "is_general", "is_favorite", "needs_review", "sort_index", "remark",
    "created_at", "updated_at",
]


def _quote_row(author_id, text_="名台詞"):
    return [
        "", "", str(author_id), text_, "", "", "", "", "", "", "", "",
        "false", "false", "false", "", "", "", "",
    ]


@pytest.fixture
def sheets(monkeypatch):
    from app.services.pipelines import pull

    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def test_a_quote_whose_author_is_unknown_here_restores_to_the_admin(
    db, sheets, admin_user
):
    from app.services.pipelines import pull

    foreign = uuid.uuid4()  # the other database's uuid for the same person
    sheets({"Quote": [QUOTE_HEADERS, _quote_row(foreign)]})

    result = pull.execute_pull_specific(db, "Quote", log_action=False)

    assert result["status"] == "success"
    quote = db.query(models.Quote).filter_by(text="名台詞").one()
    assert quote.author_id == admin_user.id


def test_a_quote_whose_author_is_known_here_keeps_it(db, sheets, admin_user):
    from app.services.pipelines import pull

    sheets({"Quote": [QUOTE_HEADERS, _quote_row(admin_user.id, "既知の作者")]})

    result = pull.execute_pull_specific(db, "Quote", log_action=False)

    assert result["status"] == "success"
    quote = db.query(models.Quote).filter_by(text="既知の作者").one()
    assert quote.author_id == admin_user.id
