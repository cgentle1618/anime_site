"""
A meme's owner is a real foreign key now - one of four, exactly one non-null.

A running gag often spans a franchise, so meme keeps all twelve owner types;
what changes is that every one of them cascades.
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
        models.Meme(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            franchise_id=sample_franchise.system_id,
            text="兩個擁有者",
            author_id=admin_id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_a_meme_with_no_owner_is_rejected(db, admin_id):
    db.add(models.Meme(system_id=uuid.uuid4(), text="沒有擁有者", author_id=admin_id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_deleting_a_media_entry_cascades_its_memes(db, sample_anime, admin_id):
    meme = models.Meme(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        text="會連帶刪除",
        author_id=admin_id,
    )
    db.add(meme)
    db.commit()
    meme_id = meme.system_id

    db.execute(
        text("DELETE FROM media WHERE system_id = :s"), {"s": sample_anime.system_id}
    )
    db.commit()

    assert db.query(models.Meme).filter_by(system_id=meme_id).first() is None


def test_deleting_a_collection_cascades_its_memes(db, sample_collection, admin_id):
    meme = models.Meme(
        system_id=uuid.uuid4(),
        collection_id=sample_collection.system_id,
        text="合集的梗",
        author_id=admin_id,
    )
    db.add(meme)
    db.commit()
    meme_id = meme.system_id

    db.execute(
        text("DELETE FROM collection WHERE system_id = :s"),
        {"s": sample_collection.system_id},
    )
    db.commit()

    assert db.query(models.Meme).filter_by(system_id=meme_id).first() is None


def test_owner_type_and_owner_id_are_derived(db, sample_collection, admin_id):
    meme = models.Meme(
        system_id=uuid.uuid4(),
        collection_id=sample_collection.system_id,
        text="推導",
        author_id=admin_id,
    )
    db.add(meme)
    db.commit()

    assert meme.owner_type == "collection"
    assert meme.owner_id == sample_collection.system_id
    assert "owner_type" not in models.Meme.__table__.c


def test_the_memes_endpoint_still_filters_by_owner_type(
    db, admin_client, sample_anime, admin_id
):
    db.add(
        models.Meme(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            text="動畫的梗",
            author_id=admin_id,
        )
    )
    db.commit()

    r = admin_client.get("/api/meme/", params={"owner_type": "anime"})
    assert r.status_code == 200
    assert "動畫的梗" in [m["text"] for m in r.json()]

    r = admin_client.get("/api/meme/", params={"owner_type": "collection"})
    assert r.status_code == 200
    assert "動畫的梗" not in [m["text"] for m in r.json()]


def test_the_grouped_endpoint_still_buckets_by_owner(
    db, admin_client, sample_anime, admin_id
):
    db.add(
        models.Meme(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            text="分組的梗",
            author_id=admin_id,
        )
    )
    db.commit()

    r = admin_client.get("/api/meme/grouped")
    assert r.status_code == 200
    groups = [g for g in r.json() if g["owner_id"] == str(sample_anime.system_id)]
    assert len(groups) == 1
    assert groups[0]["owner_type"] == "anime"
    assert "分組的梗" in [m["text"] for m in groups[0]["memes"]]
