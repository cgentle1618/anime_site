"""
A note's owner is a real foreign key now - one of four, exactly one non-null.

Before this, (owner_type, owner_id) pointed at whichever of twelve tables
owner_type named, no FK spanned them, and a deleted owner left its notes behind
forever. Now every owner cascades.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def admin_id(admin_user):
    return admin_user.id


def test_exactly_one_owner_column_may_be_set(
    db, sample_anime, sample_franchise, admin_id
):
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            franchise_id=sample_franchise.system_id,
            section="advantages",
            content="兩個擁有者",
            author_id=admin_id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_a_note_with_no_owner_is_rejected(db, admin_id):
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            section="advantages",
            content="沒有擁有者",
            author_id=admin_id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_a_media_entry_cascades_its_notes(db, sample_anime, admin_id):
    note = models.Note(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="advantages",
        content="會連帶刪除",
        author_id=admin_id,
    )
    db.add(note)
    db.commit()
    note_id = note.system_id

    db.execute(
        text("DELETE FROM media WHERE system_id = :s"), {"s": sample_anime.system_id}
    )
    db.commit()

    assert db.query(models.Note).filter_by(system_id=note_id).first() is None


def test_deleting_a_franchise_cascades_its_notes(db, sample_franchise, admin_id):
    note = models.Note(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        section="advantages",
        content="系列作的筆記",
        author_id=admin_id,
    )
    db.add(note)
    db.commit()
    note_id = note.system_id

    db.execute(
        text("DELETE FROM franchise WHERE system_id = :s"),
        {"s": sample_franchise.system_id},
    )
    db.commit()

    assert db.query(models.Note).filter_by(system_id=note_id).first() is None


def test_owner_type_and_owner_id_are_derived(db, sample_franchise, admin_id):
    note = models.Note(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        section="advantages",
        content="推導",
        author_id=admin_id,
    )
    db.add(note)
    db.commit()

    assert note.owner_type == "franchise"
    assert note.owner_id == sample_franchise.system_id
    assert "owner_type" not in models.Note.__table__.c
    assert "owner_id" not in models.Note.__table__.c


def test_the_notes_endpoint_still_takes_owner_type_and_owner_id(
    db, admin_client, sample_anime, admin_id
):
    """The API shape does not change - only the storage does."""
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section="public_reviews",
            content="大眾評價",
            author_id=admin_id,
        )
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    assert [n["content"] for n in r.json()] == ["大眾評價"]
