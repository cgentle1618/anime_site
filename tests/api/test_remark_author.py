"""
`remark` is personal-scope, and it is also the one section read through a
class-level column_property (app/models/__init__.py) that cannot know who is
asking. Until that read path is replaced, one remark per OWNER is enforced by
the database, so a second user's remark is refused rather than shown to the
first user.

These tests pin that boundary so it is a decision, not a surprise.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.domain import upsert_remark


@pytest.fixture
def db(db_session):
    return db_session


def test_upsert_remark_records_its_author(db, sample_anime, admin_user):
    upsert_remark(db, "anime", sample_anime.system_id, "備註", admin_user.id)
    db.commit()

    row = (
        db.query(models.Note)
        .filter_by(media_id=sample_anime.system_id, section="remark")
        .one()
    )
    assert row.author_id == admin_user.id


def test_a_second_users_remark_on_the_same_owner_is_refused(
    db, sample_anime, admin_user
):
    """
    The documented boundary. One remark per owner, site-wide, until the
    deferred authorization work replaces the `remark` column_property with a
    per-viewer read. A refused write is the conservative failure; showing one
    user's private remark to another is not.
    """
    role_id = db.query(models.Role.system_id).first()[0]
    erin = models.User(
        id=uuid.uuid4(), username="erin", hashed_password="x", role_id=role_id
    )
    db.add(erin)
    db.commit()

    upsert_remark(db, "anime", sample_anime.system_id, "admin 的備註", admin_user.id)
    db.commit()

    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section="remark",
            content="erin 的備註",
            author_id=erin.id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_remark_is_declared_personal_in_the_registry(db):
    from app.utils import note_sections as ns

    assert ns.section_by_key("remark").scope == ns.SCOPE_PERSONAL
