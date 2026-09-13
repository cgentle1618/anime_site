"""
media.display_name is denormalized. This is the test that catches it going
stale - the one new class of bug the supertable introduces.
"""

import pytest

from app import models
from app.services.domain.display_name import compute_display_name
from app.utils.media_resolver import MEDIA_TABLES


@pytest.fixture
def db(db_session):
    return db_session


def test_renaming_an_entry_updates_its_media_display_name(db, admin_client):
    a = models.Anime(anime_name_cn="舊名")
    db.add(a)
    db.commit()

    r = admin_client.patch(f"/api/anime/{a.system_id}", json={"anime_name_cn": "新名"})
    assert r.status_code == 200

    db.expire_all()
    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    assert m.display_name == "新名"


def test_no_stored_display_name_has_drifted(db):
    """Walks every entry in the database. Catches a backfill that got it wrong."""
    drifted = []
    for key, ref in MEDIA_TABLES.items():
        for entry in db.query(ref.model).all():
            m = db.query(models.Media).filter_by(system_id=entry.system_id).first()
            if m is None:
                drifted.append(f"{key} {entry.system_id}: no media row")
                continue
            try:
                expected = compute_display_name(entry)
            except ValueError:
                continue  # unnamed entries get the migration's placeholder
            if m.display_name != expected:
                drifted.append(
                    f"{key} {entry.system_id}: stored {m.display_name!r} "
                    f"!= computed {expected!r}"
                )
    assert not drifted, "\n".join(drifted)
