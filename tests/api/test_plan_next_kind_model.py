"""
The kind column on plan_next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def _row(db, kind, scope="franchise", media_type="anime", target_id=None):
    row = models.PlanNext(
        kind=kind,
        scope=scope,
        media_type=media_type,
        target_id=target_id or uuid.uuid4(),
    )
    db.add(row)
    db.commit()
    return row


def test_kind_is_stored(db_session):
    row = _row(db_session, "rewatch")
    db_session.refresh(row)
    assert row.kind == "rewatch"


def test_same_target_under_both_kinds_is_allowed(db_session):
    # A franchise can be both queued and marked for rewatch.
    target = uuid.uuid4()
    _row(db_session, "next", target_id=target)
    _row(db_session, "rewatch", target_id=target)
    assert db_session.query(models.PlanNext).filter_by(target_id=target).count() == 2


def test_duplicate_within_one_kind_is_rejected(db_session):
    target = uuid.uuid4()
    _row(db_session, "rewatch", target_id=target)
    with pytest.raises(IntegrityError):
        _row(db_session, "rewatch", target_id=target)
    db_session.rollback()


def test_kind_is_not_nullable(db_session):
    row = models.PlanNext(
        scope="entry", media_type="movie", target_id=uuid.uuid4()
    )
    db_session.add(row)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
