"""
Content labels survive the Google Sheets round trip.

`content_label` and `media_content_label` had no tab at all, so Backup could
not see which entries were restricted and a Pull All on the second machine
restored every entry unlabelled - i.e. visible to every viewer. That is the
one class of missing tab that fails OPEN, so it gets its own test file.

Both tables mint their own `system_id` per database (the labels are typed into
the admin page on each machine), so both are derived-identity tabs: the sheet's
uuid is a hint, the natural key is the identity. `media_content_label.label_id`
additionally cites the OTHER database's label uuid and must be translated
through the `Content Label` tab before it is stored.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_NAMES

LABEL_HEADERS = [
    "system_id",
    "key",
    "label",
    "description",
    "sort_order",
    "created_at",
    "updated_at",
]
MEDIA_LABEL_HEADERS = [
    "system_id",
    "media_type",
    "entry_id",
    "label_id",
    "position",
    "created_at",
]


@pytest.fixture
def sheets(monkeypatch):
    """Feed execute_pull_specific fake tabs, keyed by tab name."""

    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


# --- Registry --------------------------------------------------------------


def test_both_tables_have_a_tab():
    assert "Content Label" in TAB_NAMES
    assert "Media Content Label" in TAB_NAMES


def test_the_link_tab_restores_after_its_label_and_after_the_entries():
    # media_content_label cites a label by uuid and an entry by the FK-less
    # (media_type, entry_id) pair, so both endpoints must already exist.
    assert TAB_NAMES.index("Content Label") < TAB_NAMES.index("Media Content Label")
    assert TAB_NAMES.index("Anime") < TAB_NAMES.index("Media Content Label")
    assert TAB_NAMES.index("Comic") < TAB_NAMES.index("Media Content Label")


# --- Content Label ---------------------------------------------------------


def test_a_label_with_a_foreign_uuid_updates_the_local_row(db_session, sheets):
    """
    `key` is UNIQUE and the uuid is minted per database, so honouring the
    sheet's uuid inserts a second "nsfw" and the collision rolls the whole tab
    back. The key is the identity; the local uuid must survive, because
    media_content_label rows already point at it.
    """
    local = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheets(
        {
            "Content Label": [
                LABEL_HEADERS,
                [str(uuid.uuid4()), "nsfw", "Not safe for work", "adults", "3", "", ""],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Content Label", log_action=False)

    assert result["status"] == "success"
    rows = db_session.query(models.ContentLabel).filter_by(key="nsfw").all()
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].label == "Not safe for work"
    assert rows[0].sort_order == 3


def test_a_label_this_database_has_never_seen_inserts(db_session, sheets):
    sheets(
        {
            "Content Label": [
                LABEL_HEADERS,
                [str(uuid.uuid4()), "gore", "Gore", "", "1", "", ""],
            ]
        }
    )

    result = pull.execute_pull_specific(db_session, "Content Label", log_action=False)

    assert result["status"] == "success"
    assert db_session.query(models.ContentLabel).filter_by(key="gore").count() == 1


# --- Media Content Label ---------------------------------------------------


def test_a_labelling_translates_the_foreign_label_uuid(db_session, sheets):
    """
    The sheet spells label_id the way the OTHER database mints it. Stored
    untranslated it is a dangling FK, and the violation at commit rolls the
    whole tab back - so every restriction on every entry would be lost.
    """
    local_label = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    anime = models.Anime(anime_name_cn="測試")
    db_session.add_all([local_label, anime])
    db_session.flush()

    foreign_label_uuid = str(uuid.uuid4())
    sheets(
        {
            "Content Label": [
                LABEL_HEADERS,
                [foreign_label_uuid, "nsfw", "NSFW", "", "0", "", ""],
            ],
            "Media Content Label": [
                MEDIA_LABEL_HEADERS,
                [
                    str(uuid.uuid4()),
                    "anime",
                    str(anime.system_id),
                    foreign_label_uuid,
                    "0",
                    "",
                ],
            ],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "Media Content Label", log_action=False
    )

    assert result["status"] == "success"
    rows = db_session.query(models.MediaContentLabel).all()
    assert len(rows) == 1
    assert rows[0].label_id == local_label.system_id
    assert rows[0].entry_id == anime.system_id


def test_the_same_labelling_under_a_foreign_row_uuid_updates_in_place(
    db_session, sheets
):
    """
    uq_media_content_label_row is (media_type, entry_id, label_id). A sheet row
    carrying an unknown system_id for a labelling this database already holds
    must update it, not insert a duplicate that collides.
    """
    local_label = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    anime = models.Anime(anime_name_cn="測試二")
    db_session.add_all([local_label, anime])
    db_session.flush()
    existing = models.MediaContentLabel(
        system_id=uuid.uuid4(),
        media_type="anime",
        entry_id=anime.system_id,
        label_id=local_label.system_id,
        position=0,
    )
    db_session.add(existing)
    db_session.flush()
    existing_id = existing.system_id

    sheets(
        {
            "Content Label": [
                LABEL_HEADERS,
                [str(uuid.uuid4()), "nsfw", "NSFW", "", "0", "", ""],
            ],
            "Media Content Label": [
                MEDIA_LABEL_HEADERS,
                [
                    str(uuid.uuid4()),
                    "anime",
                    str(anime.system_id),
                    str(local_label.system_id),
                    "5",
                    "",
                ],
            ],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "Media Content Label", log_action=False
    )

    assert result["status"] == "success"
    rows = db_session.query(models.MediaContentLabel).all()
    assert len(rows) == 1
    assert rows[0].system_id == existing_id
    assert rows[0].position == 5


def test_a_labelling_whose_label_is_unknown_is_skipped_not_fatal(db_session, sheets):
    """
    One unresolvable label must not cost the whole tab: the row is skipped and
    every other labelling still restores. Same treatment as an unresolvable
    series FK or system_option on the Media Source tab.
    """
    local_label = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    anime = models.Anime(anime_name_cn="測試三")
    db_session.add_all([local_label, anime])
    db_session.flush()

    sheets(
        {
            "Content Label": [
                LABEL_HEADERS,
                [str(uuid.uuid4()), "nsfw", "NSFW", "", "0", "", ""],
            ],
            "Media Content Label": [
                MEDIA_LABEL_HEADERS,
                # First row cites a label neither database's sheet describes.
                [str(uuid.uuid4()), "anime", str(anime.system_id),
                 str(uuid.uuid4()), "0", ""],
                [str(uuid.uuid4()), "anime", str(anime.system_id),
                 str(local_label.system_id), "1", ""],
            ],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "Media Content Label", log_action=False
    )

    assert result["status"] == "success"
    rows = db_session.query(models.MediaContentLabel).all()
    assert len(rows) == 1
    assert rows[0].label_id == local_label.system_id
