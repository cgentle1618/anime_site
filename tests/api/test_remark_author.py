"""
`remark` is personal-scope, and since decision 12 it is read per viewer:
app.services.domain.remark_field.attach_remark filters by author, and
ix_note_one_remark_per_owner carries author_id.

This file used to pin the OPPOSITE boundary - one remark per owner
site-wide, with a second account's write refused by the database - because
the read was a class-level column_property that could not know who was
asking. That refusal was the conservative failure while it lasted; it is not
the behaviour any more, and the test that asserted it now asserts what
replaced it. tests/api/test_remark_per_viewer.py carries the rest.
"""

import uuid

import pytest

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


def test_a_second_users_remark_on_the_same_owner_is_accepted(
    db, sample_anime, admin_user
):
    """
    The boundary moved, and this is the regression test for the move.

    A second account's remark on the same entry is ACCEPTED now, and each
    author reads back their own. Before decision 12 the second insert raised
    IntegrityError against a per-owner unique index, because the read path was
    a scalar subquery that would otherwise have raised "more than one row
    returned by a subquery used as an expression" on every read of the entity.

    If this ever starts raising again, the index has been narrowed without the
    read being narrowed with it - which is the half-fix that turns a loud
    refusal into an accepted-then-invisible write.
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
    db.commit()

    rows = {
        row.author_id: row.content
        for row in db.query(models.Note).filter(
            models.Note.media_id == sample_anime.system_id,
            models.Note.section == "remark",
        )
    }
    assert rows == {admin_user.id: "admin 的備註", erin.id: "erin 的備註"}


def test_remark_is_declared_personal_in_the_registry(db):
    from app.utils import note_sections as ns

    assert ns.section_by_key("remark").scope == ns.SCOPE_PERSONAL
