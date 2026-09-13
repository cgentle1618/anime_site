"""
Memes are universal - shared, unfiltered, no per-user copies. author_id is
provenance only, matching quote and note.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_meme_table_has_a_not_null_author_id(db):
    assert models.Meme.__table__.c["author_id"].nullable is False


def test_meme_has_no_scope_column(db):
    assert "scope" not in models.Meme.__table__.c


def test_a_meme_created_through_the_api_records_its_author(
    db, admin_client, sample_anime, admin_user
):
    r = admin_client.post(
        "/api/meme/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "text": "梗",
        },
    )
    # These two routes return 200, not 201 - matching them as they are.
    assert r.status_code == 200
    meme = db.query(models.Meme).filter_by(system_id=r.json()["system_id"]).one()
    assert meme.author_id == admin_user.id


def test_a_meme_created_through_the_api_ignores_a_claimed_author(
    db, admin_client, sample_anime, admin_user
):
    """The author is who is asking, never who the payload says."""
    r = admin_client.post(
        "/api/meme/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "text": "冒名",
            "author_id": str(uuid.uuid4()),
        },
    )
    # These two routes return 200, not 201 - matching them as they are.
    assert r.status_code == 200
    meme = db.query(models.Meme).filter_by(system_id=r.json()["system_id"]).one()
    assert meme.author_id == admin_user.id


def test_a_meme_without_an_author_is_rejected(db):
    db.add(models.Meme(system_id=uuid.uuid4(), text="無作者"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_every_existing_meme_has_an_author(db):
    orphans = db.execute(
        text("SELECT COUNT(*) FROM meme WHERE author_id IS NULL")
    ).scalar_one()
    assert orphans == 0
