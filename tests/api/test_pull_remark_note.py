"""
Pulling the Note tab must survive a backup whose remark rows carry system_ids
the local database no longer has.

`remark` is a singleton per owner (ix_note_one_remark_per_owner), and remark
rows were re-keyed by the r1e2m3a4r5k6 migration - so a pre-migration backup,
or a remark cleared and re-typed after a backup, hands Pull a remark row with an
unknown PK for an owner that already has one. Inserting it blindly raises
IntegrityError at commit, which rolls back and fails the ENTIRE tab.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull


NOTE_HEADERS = [
    "system_id",
    "owner_type",
    "owner_id",
    "section",
    "episode",
    "kind",
    "title",
    "content",
    "links",
    "sort_index",
    "created_at",
    "updated_at",
]


def _row(system_id, owner_id, section, content):
    return [
        str(system_id),
        "anime",
        str(owner_id),
        section,
        "",
        "",
        "",
        content,
        "",
        "0",
        "",
        "",
    ]


@pytest.fixture
def sheet(monkeypatch):
    """Feed execute_pull_specific a fake Note tab instead of Google Sheets."""

    def _install(rows):
        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: [NOTE_HEADERS] + rows
        )

    return _install


def _remarks(db_session, owner_id):
    return (
        db_session.query(models.Note)
        .filter(
            models.Note.owner_type == "anime",
            models.Note.owner_id == owner_id,
            models.Note.section == "remark",
        )
        .all()
    )


def test_pull_updates_the_existing_remark_instead_of_inserting_a_second(
    db_session, sample_anime, sheet
):
    owner_id = sample_anime.system_id
    local = models.Note(
        owner_type="anime",
        owner_id=owner_id,
        section="remark",
        content="local text",
        sort_index=0,
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    # The backup's remark row for the same owner carries a stale system_id.
    sheet([_row(uuid.uuid4(), owner_id, "remark", "from the backup")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    rows = _remarks(db_session, owner_id)
    assert len(rows) == 1
    # Updated in place: the local PK survives, the sheet's content lands.
    assert rows[0].system_id == local_id
    assert rows[0].content == "from the backup"


def test_pull_does_not_fail_the_whole_tab_on_a_stale_remark_id(
    db_session, sample_anime, sheet
):
    """The other rows of the tab must still land - the old bug lost them all."""
    owner_id = sample_anime.system_id
    db_session.add(
        models.Note(
            owner_type="anime",
            owner_id=owner_id,
            section="remark",
            content="local text",
            sort_index=0,
        )
    )
    db_session.flush()

    sheet(
        [
            _row(uuid.uuid4(), owner_id, "remark", "from the backup"),
            _row(uuid.uuid4(), owner_id, "overview", "an overview note"),
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    others = (
        db_session.query(models.Note)
        .filter(
            models.Note.owner_type == "anime",
            models.Note.owner_id == owner_id,
            models.Note.section == "overview",
        )
        .all()
    )
    assert len(others) == 1
    assert others[0].content == "an overview note"


def test_pull_still_inserts_a_remark_for_an_owner_that_has_none(
    db_session, sample_anime, sheet
):
    owner_id = sample_anime.system_id
    sheet([_row(uuid.uuid4(), owner_id, "remark", "brand new")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    rows = _remarks(db_session, owner_id)
    assert len(rows) == 1
    assert rows[0].content == "brand new"
