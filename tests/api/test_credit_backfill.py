"""
The backfill that fills media_credit/media_tag from the legacy string columns.

`backfill_credits` runs inside a migration, on a database that still carries
the legacy columns. It must therefore read those columns the same way
`verify_backfill_lossless` does - straight from the database - because by the
time this module is importable the ORM models no longer define them (Task 10
deletes the Column(...) definitions). Reading through the model would make the
backfill a silent no-op and leave the very next migration's safety gate with
nothing to verify against.

Like the verification tests, this adds the legacy column back onto the test
database with raw DDL inside the per-test transaction.
"""

import uuid

from sqlalchemy import text

from app import models
from app.services.domain.credits import (
    backfill_credits,
    credit_names,
    tag_values,
    verify_backfill_lossless,
)


def _add_legacy_column(db_session, table, column):
    db_session.execute(text(f'ALTER TABLE {table} ADD COLUMN "{column}" VARCHAR'))


def _set_legacy(db_session, table, column, entry_id, raw_value):
    db_session.execute(
        text(f'UPDATE {table} SET "{column}" = :v WHERE system_id = :id'),
        {"v": raw_value, "id": entry_id},
    )


def test_backfill_writes_credits_from_a_legacy_column(db_session):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_cn="測試")
    db_session.add(a)
    db_session.flush()
    _add_legacy_column(db_session, "anime", "studio")
    _set_legacy(db_session, "anime", "studio", a.system_id, "MAPPA, WIT STUDIO")

    report = backfill_credits(db_session)

    assert report["credits"] >= 2
    assert report["studios"] >= 2
    assert set(credit_names(db_session, "anime", a.system_id, "studio")) == {
        "MAPPA",
        "WIT STUDIO",
    }


def test_backfill_writes_tags_from_a_legacy_column(db_session):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_cn="測試")
    db_session.add(a)
    db_session.flush()
    _add_legacy_column(db_session, "anime", "genre_main")
    _set_legacy(db_session, "anime", "genre_main", a.system_id, "奇幻, 冒險")

    report = backfill_credits(db_session)

    assert report["tags"] >= 2
    assert set(tag_values(db_session, "anime", a.system_id, "genre_main")) == {
        "奇幻",
        "冒險",
    }


def test_backfill_leaves_the_drop_gate_with_nothing_to_report(db_session):
    """The two halves must agree: what backfill writes is what verify checks."""
    a = models.Anime(system_id=uuid.uuid4(), anime_name_cn="測試")
    db_session.add(a)
    db_session.flush()
    _add_legacy_column(db_session, "anime", "studio")
    _set_legacy(db_session, "anime", "studio", a.system_id, "MAPPA, WIT STUDIO")

    backfill_credits(db_session)
    report = verify_backfill_lossless(db_session)

    assert report["checked"] >= 1
    assert report["mismatches"] == []
