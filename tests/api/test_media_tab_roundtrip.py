"""
Backup then Pull All must reproduce an entry exactly, including the four
columns that move to `media` in Phase C. Without the Media tab those values
leave the database and never come back.
"""

import pytest

from app import models
from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES
from app.utils.formatter import format_model_for_sheet


@pytest.fixture
def db(db_session):
    return db_session


def test_media_tab_carries_the_moved_columns(db, sample_franchise):
    assert "Media" in TAB_BY_NAME, "no Media tab is registered"

    a = models.Anime(anime_name_cn="轉存測試", franchise_id=sample_franchise.system_id)
    db.add(a)
    db.commit()

    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    header = [c.name for c in models.Media.__table__.columns]
    row = format_model_for_sheet(m)

    for column in ("public_id", "display_name", "cover_image_file",
                   "franchise_id", "series_id", "media_type"):
        assert column in header, f"Media tab does not carry {column}"
    assert row[header.index("display_name")] == "轉存測試"


def test_media_tabs_carry_a_readable_display_name(db):
    """
    A human reads these tabs during an environment switch. The nine media tabs
    lose their name-bearing identity columns to `media` in Phase C, so each
    appends display_name via extra_columns. It is written on Backup and ignored
    on Pull.
    """
    extras = dict(TAB_BY_NAME["Anime"].extra_columns)
    assert "display_name" in extras


def test_pull_ignores_a_header_that_is_not_a_column_on_the_model(db):
    """
    display_name is on the Anime tab but is NOT a column of Anime. pull.py
    keeps any parser key whose header appeared in the sheet and then calls
    Model(**payload), so without a guard this raises
    TypeError: 'display_name' is an invalid keyword argument for Anime.
    """
    from app.services.pipelines.pull import drop_non_columns

    payload = {"anime_name_cn": "測試", "display_name": "測試", "bogus": 1}
    assert drop_non_columns(models.Anime, payload) == {"anime_name_cn": "測試"}


def test_a_stale_header_is_dropped_on_the_update_path_too(db):
    """
    The UPDATE arm setattr()s every key. An unknown one does not raise - it
    silently becomes a non-persisted attribute - so only a guard placed before
    the UPSERT branch catches it.
    """
    from app.services.pipelines.pull import drop_non_columns

    a = models.Anime(anime_name_cn="更新測試")
    db.add(a)
    db.commit()

    cleaned = drop_non_columns(
        models.Anime, {"anime_name_cn": "改名", "display_name": "X"}
    )
    for key, value in cleaned.items():
        setattr(a, key, value)
    db.commit()

    assert a.anime_name_cn == "改名"
    assert "display_name" not in cleaned


def test_media_is_restored_before_every_media_tab():
    """
    Each entry table FKs (system_id, media_type) up to `media`. The constraint
    is deferred, but Pull commits tab by tab, so a media tab restored before
    Media would fail at its own commit.
    """
    media_at = TAB_NAMES.index("Media")
    for tab in TAB_BY_NAME.values():
        if tab.media_type is not None:
            assert media_at < TAB_NAMES.index(tab.name), (
                f"Media must precede {tab.name}"
            )


def test_pulling_media_before_an_entry_does_not_collide(db, sample_franchise):
    """
    Media is restored first, so by the time the Anime tab inserts its rows the
    parent already exists. The insert-side sync must therefore upsert, not
    collide on the primary key.
    """
    import uuid

    sid = uuid.uuid4()
    db.add(
        models.Media(
            system_id=sid,
            media_type="anime",
            public_id=987654,
            display_name="先到的 media",
            franchise_id=sample_franchise.system_id,
        )
    )
    db.flush()

    # The Anime tab, restored second, carries the same system_id.
    db.add(models.Anime(system_id=sid, anime_name_cn="後到的 anime"))
    db.commit()

    m = db.query(models.Media).filter_by(system_id=sid).one()
    # The detail row is the producer of the shared columns, so it wins.
    assert m.display_name == "後到的 anime"
