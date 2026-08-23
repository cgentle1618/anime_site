"""
Database-level tests for the media_relation table.

Lives under tests/api/ rather than tests/unit/ because it needs a real
PostgreSQL session to exercise the constraints. Requires the anime_site_test
DB — see tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def _relation(from_id, to_id, relation_type="sequel"):
    return models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=from_id,
        relation_type=relation_type,
        to_type="anime-movie",
        to_id=to_id,
    )


def test_can_store_a_cross_media_type_relation(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    row = _relation(a, b)
    db_session.add(row)
    db_session.flush()

    stored = db_session.query(models.MediaRelation).one()
    assert stored.from_type == "anime"
    assert stored.to_type == "anime-movie"
    assert stored.relation_type == "sequel"
    # Timestamps default like every other model in the project.
    assert stored.created_at is not None


def test_self_relation_is_rejected(db_session):
    same = uuid.uuid4()
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=same,
        relation_type="alternative",
        to_type="anime",
        to_id=same,
    )
    db_session.add(row)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_different_entry_of_the_same_type_is_allowed(db_session):
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=uuid.uuid4(),
        relation_type="alternative",
        to_type="anime",
        to_id=uuid.uuid4(),
    )
    db_session.add(row)
    db_session.flush()
    assert db_session.query(models.MediaRelation).count() == 1


def test_the_identical_pair_and_kind_cannot_be_stored_twice(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    db_session.add(_relation(a, b))
    db_session.flush()
    db_session.add(_relation(a, b))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_the_same_pair_under_a_different_kind_is_allowed(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    db_session.add(_relation(a, b, "sequel"))
    db_session.add(_relation(a, b, "side_story"))
    db_session.flush()
    assert db_session.query(models.MediaRelation).count() == 2
