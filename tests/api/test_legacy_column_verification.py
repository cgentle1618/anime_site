"""
The safety gate the legacy-column-drop migration runs before it drops anything.

`verify_backfill_lossless` compares each legacy column's raw values against
what the link tables now say, as sets of normalized names, and reports any
entry where the link tables are missing a name the legacy column had.

By the time this test runs, `app.models.Anime` no longer defines a `studio`
column (Task 10 removes it), so a legacy value can't be seeded through the
ORM. The test adds the column back onto the test database directly with raw
DDL inside the per-test transaction, which rolls back afterward like any
other test data.
"""

import uuid

from sqlalchemy import text

from app import models
from app.services.domain.credits import (
    replace_credits,
    verify_backfill_lossless,
)


def _seed_legacy_studio_column(db_session, entry_id, raw_value):
    db_session.execute(text("ALTER TABLE anime ADD COLUMN studio VARCHAR"))
    db_session.execute(
        text("UPDATE anime SET studio = :v WHERE system_id = :id"),
        {"v": raw_value, "id": entry_id},
    )


def test_verify_passes_when_every_legacy_name_is_linked(db_session):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_cn="測試")
    db_session.add(a)
    db_session.flush()
    _seed_legacy_studio_column(db_session, a.system_id, "MAPPA, WIT STUDIO")
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT STUDIO"])
    db_session.commit()

    report = verify_backfill_lossless(db_session)

    assert report["checked"] >= 1
    assert report["mismatches"] == []


def test_verify_reports_a_name_missing_from_the_link_tables(db_session):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_cn="測試")
    db_session.add(a)
    db_session.flush()
    _seed_legacy_studio_column(db_session, a.system_id, "MAPPA, WIT STUDIO")
    # Only one of the two legacy names made it into the link table.
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA"])
    db_session.commit()

    report = verify_backfill_lossless(db_session)

    assert report["checked"] >= 1
    assert len(report["mismatches"]) == 1
    mismatch = report["mismatches"][0]
    assert mismatch["media_type"] == "anime"
    assert mismatch["entry_id"] == str(a.system_id)
    assert mismatch["column"] == "studio"
    assert "witstudio" in mismatch["missing"]


def test_extra_link_names_are_not_a_mismatch(db_session):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_cn="測試")
    db_session.add(a)
    db_session.flush()
    _seed_legacy_studio_column(db_session, a.system_id, "MAPPA")
    # Link table holds more than the legacy column ever did.
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT STUDIO"])
    db_session.commit()

    report = verify_backfill_lossless(db_session)

    assert report["mismatches"] == []
