"""
The kind column on plan_next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text
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
    # The NOT NULL constraint still stands. This has to go through raw SQL:
    # once the column carries a server default, SQLAlchemy omits it from the
    # INSERT whether the attribute is unset OR explicitly set to None, so the
    # ORM cannot express "write a NULL here" at all.
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO plan_next "
                "(system_id, kind, media_type, scope, target_id) "
                "VALUES (:sid, NULL, 'movie', 'entry', :tid)"
            ),
            {"sid": uuid.uuid4(), "tid": uuid.uuid4()},
        )
        db_session.commit()
    db_session.rollback()


def test_omitted_kind_defaults_to_next(db_session):
    # An OMITTED kind is filled by the server default rather than failing.
    # This is the exact shape pull.py builds when restoring a "Plan Next" tab
    # backed up before the kind column existed: the sheet has no such header,
    # pull drops parsed keys the header lacked, and the row arrives with kind
    # unset. Every row in such a tab predates rewatch, so "next" is correct.
    row = models.PlanNext(
        scope="entry", media_type="movie", target_id=uuid.uuid4()
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    assert row.kind == "next"
