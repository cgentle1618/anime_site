"""
The kind column on plan_next.

Every row needs a user and a real owner row now (Step 3): the owner is a
foreign key, so these tests plan actual franchises rather than loose uuids.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


def _franchise(db, name="Kind Test Franchise"):
    f = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type="Anime",
        franchise_name_en=name,
    )
    db.add(f)
    db.flush()
    return f


def _row(db, owner, kind, media_type="anime", franchise=None):
    row = models.PlanNext(
        user_id=owner.id,
        kind=kind,
        media_type=media_type,
        franchise_id=(franchise or _franchise(db, f"F {uuid.uuid4()}")).system_id,
    )
    db.add(row)
    db.commit()
    return row


def test_kind_is_stored(db_session, admin_user):
    row = _row(db_session, admin_user, "rewatch")
    db_session.refresh(row)
    assert row.kind == "rewatch"


def test_same_target_under_both_kinds_is_allowed(db_session, admin_user):
    # A franchise can be both queued and marked for rewatch.
    target = _franchise(db_session)
    _row(db_session, admin_user, "next", franchise=target)
    _row(db_session, admin_user, "rewatch", franchise=target)
    assert (
        db_session.query(models.PlanNext)
        .filter_by(franchise_id=target.system_id)
        .count()
        == 2
    )


def test_duplicate_within_one_kind_is_rejected(db_session, admin_user):
    target = _franchise(db_session)
    _row(db_session, admin_user, "rewatch", franchise=target)
    with pytest.raises(IntegrityError):
        _row(db_session, admin_user, "rewatch", franchise=target)
    db_session.rollback()


def test_kind_is_not_nullable(db_session, admin_user):
    # The NOT NULL constraint still stands. This has to go through raw SQL:
    # once the column carries a server default, SQLAlchemy omits it from the
    # INSERT whether the attribute is unset OR explicitly set to None, so the
    # ORM cannot express "write a NULL here" at all.
    target = _franchise(db_session)
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO plan_next "
                "(system_id, user_id, kind, media_type, franchise_id) "
                "VALUES (:sid, :uid, NULL, 'movie', :fid)"
            ),
            {"sid": uuid.uuid4(), "uid": admin_user.id, "fid": target.system_id},
        )
        db_session.commit()
    db_session.rollback()


def test_omitted_kind_defaults_to_next(db_session, admin_user):
    # An OMITTED kind is filled by the server default rather than failing.
    # This is the exact shape pull.py builds when restoring a "Plan Next" tab
    # backed up before the kind column existed: the sheet has no such header,
    # pull drops parsed keys the header lacked, and the row arrives with kind
    # unset. Every row in such a tab predates rewatch, so "next" is correct.
    row = models.PlanNext(
        user_id=admin_user.id,
        media_type="movie",
        franchise_id=_franchise(db_session).system_id,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    assert row.kind == "next"
