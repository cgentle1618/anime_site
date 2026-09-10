"""
Every note has an author, whatever its scope.

author_id, not a nullable user_id: what differs between a catalogue note and a
personal one is who it is FILTERED for, not whether somebody wrote it. This
also gives provenance on catalogue notes, which nothing recorded before.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_note_table_has_a_not_null_author_id(db):
    col = models.Note.__table__.c["author_id"]
    assert col.nullable is False


def test_a_note_created_through_the_api_records_its_author(
    db, admin_client, sample_anime, admin_user
):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "好看",
        },
    )
    assert r.status_code == 201
    note = db.query(models.Note).filter_by(system_id=r.json()["system_id"]).one()
    assert note.author_id == admin_user.id


def test_a_note_without_an_author_is_rejected(db, sample_anime):
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="advantages",
            content="無作者",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_a_user_deletes_their_notes(db, sample_anime):
    user = models.User(
        id=uuid.uuid4(),
        username="cascade-victim",
        hashed_password="x",
        role_id=db.query(models.Role.system_id).first()[0],
    )
    db.add(user)
    db.commit()

    note = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="advantages",
        content="會被連帶刪除",
        author_id=user.id,
    )
    db.add(note)
    db.commit()
    note_id = note.system_id

    db.execute(text("DELETE FROM users WHERE id = :i"), {"i": user.id})
    db.commit()

    assert db.query(models.Note).filter_by(system_id=note_id).first() is None


def test_every_existing_note_has_an_author(db):
    """The backfill: no row may be left behind by the migration."""
    orphans = db.execute(
        text("SELECT COUNT(*) FROM note WHERE author_id IS NULL")
    ).scalar_one()
    assert orphans == 0
