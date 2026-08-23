"""
Database tests for the remark write-through.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.domain.remark_field import upsert_remark


def _rows(db_session, owner_type, owner_id):
    return (
        db_session.query(models.Note)
        .filter(
            models.Note.owner_type == owner_type,
            models.Note.owner_id == owner_id,
            models.Note.section == "remark",
        )
        .all()
    )


def test_upsert_creates_the_singleton_row(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, "重看第三次")
    db_session.flush()

    rows = _rows(db_session, "anime", sample_anime.system_id)
    assert len(rows) == 1
    assert rows[0].content == "重看第三次"
    assert rows[0].sort_index == 0.0


def test_upsert_updates_rather_than_duplicating(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, "first")
    db_session.flush()
    upsert_remark(db_session, "anime", sample_anime.system_id, "second")
    db_session.flush()

    rows = _rows(db_session, "anime", sample_anime.system_id)
    assert len(rows) == 1
    assert rows[0].content == "second"


def test_upsert_with_empty_text_deletes_the_row(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, "gone soon")
    db_session.flush()
    upsert_remark(db_session, "anime", sample_anime.system_id, "   ")
    db_session.flush()

    assert _rows(db_session, "anime", sample_anime.system_id) == []


def test_upsert_with_empty_text_and_no_row_is_a_no_op(db_session, sample_anime):
    upsert_remark(db_session, "anime", sample_anime.system_id, None)
    db_session.flush()

    assert _rows(db_session, "anime", sample_anime.system_id) == []


def test_upsert_stores_the_text_as_typed(db_session, sample_franchise):
    # Only the emptiness check strips; internal and trailing shape is the
    # user's, not ours.
    upsert_remark(db_session, "franchise", sample_franchise.system_id, "line 1\n\nline 2\n")
    db_session.flush()

    rows = _rows(db_session, "franchise", sample_franchise.system_id)
    assert rows[0].content == "line 1\n\nline 2\n"


def test_upsert_keeps_owners_apart(db_session, sample_anime, sample_franchise):
    upsert_remark(db_session, "anime", sample_anime.system_id, "on the anime")
    upsert_remark(db_session, "franchise", sample_franchise.system_id, "on the franchise")
    db_session.flush()

    assert _rows(db_session, "anime", sample_anime.system_id)[0].content == "on the anime"
    assert (
        _rows(db_session, "franchise", sample_franchise.system_id)[0].content
        == "on the franchise"
    )


def test_upsert_leaves_other_sections_alone(db_session, sample_anime):
    other = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="advantages",
        content="敘事結構精巧",
        sort_index=0.0,
    )
    db_session.add(other)
    db_session.flush()

    upsert_remark(db_session, "anime", sample_anime.system_id, "")
    db_session.flush()

    assert db_session.query(models.Note).filter(
        models.Note.section == "advantages"
    ).count() == 1


def test_a_second_remark_row_is_rejected_by_the_database(db_session, sample_anime):
    """
    The singleton rule is load-bearing, not advisory: the read side is a scalar
    subquery, so two remark rows for one owner would make every read of that
    anime raise. `ix_note_one_remark_per_owner` is declared on the model as well
    as in revision r1e2m3a4r5k6, so it reaches this create_all-built schema too -
    if that declaration is ever lost, this test fails.
    """
    upsert_remark(db_session, "anime", sample_anime.system_id, "the one remark")
    db_session.flush()

    savepoint = db_session.begin_nested()
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="remark",
            content="a second one",
            sort_index=0.0,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    savepoint.rollback()

    # The session survives, and the original row is untouched.
    rows = _rows(db_session, "anime", sample_anime.system_id)
    assert len(rows) == 1
    assert rows[0].content == "the one remark"


def test_the_index_does_not_constrain_other_sections(db_session, sample_anime):
    """The predicate is `section = 'remark'`; two `advantages` rows are legal."""
    for content in ("first point", "second point"):
        db_session.add(
            models.Note(
                system_id=uuid.uuid4(),
                owner_type="anime",
                owner_id=sample_anime.system_id,
                section="advantages",
                content=content,
                sort_index=0.0,
            )
        )
    db_session.flush()

    assert db_session.query(models.Note).filter(
        models.Note.owner_id == sample_anime.system_id,
        models.Note.section == "advantages",
    ).count() == 2
