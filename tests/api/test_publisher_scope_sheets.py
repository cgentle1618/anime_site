"""
`publisher_scope` round-trips through Google Sheets.

Sheets is how this project's data travels between the owner's two machines
(see docs/switching-environments.md): Backup writes DB -> sheet, Pull All
writes sheet -> DB. A publisher's scope set is what decides which pickers
offer it, and zero rows means offered NOWHERE - so a scope lost on the way
out makes a publisher invisible everywhere.

Most scopes used to survive by luck: Pull applies each entry's `publisher`
credits through `replace_credits`, which re-adds the scope additively. What
did not survive was a scope with no credit behind it - `bilibili` and
`Crunchyroll`, hand-seeded with `anime` and credited nowhere, and any scope an
admin set through the Publisher Modify tab ahead of the first credit. The
`Publisher Scope` tab, modelled on `Person Role`, is what carries them.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import TAB_NAMES

PUBLISHER_HEADERS = ["system_id", "name_en", "name_cn", "name_jp", "name_alt"]
SCOPE_HEADERS = ["id", "publisher_id", "scope"]


@pytest.fixture
def sheets(monkeypatch):
    """Feed execute_pull_specific fake tabs, keyed by tab name."""

    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


@pytest.fixture
def backup_tabs(monkeypatch):
    """Run Backup against the test DB and return {tab name: matrix}."""

    def _run(db):
        written = {}
        monkeypatch.setattr(
            backup,
            "bulk_overwrite_sheet",
            lambda tab, matrix: written.__setitem__(tab, matrix) or True,
        )
        backup.execute_backup(db)
        return written

    return _run


def _publisher(db, **names):
    row = models.Publisher(system_id=uuid.uuid4(), **names)
    db.add(row)
    db.flush()
    return row


# --- The tab exists at all -------------------------------------------------


def test_publisher_scope_restores_after_publisher_and_before_the_media_tabs():
    """publisher_id is a real FK, and credits re-add scopes on the entry tabs."""
    assert TAB_NAMES.index("Publisher") < TAB_NAMES.index("Publisher Scope")
    assert TAB_NAMES.index("Publisher Scope") < TAB_NAMES.index("Anime")


# --- The round trip --------------------------------------------------------


def test_scopes_of_an_uncredited_publisher_survive_backup_then_pull(
    db_session, backup_tabs, sheets
):
    """
    The case `replace_credits` cannot rescue: no credit anywhere, so nothing
    on any entry tab would re-add these rows. bilibili and Crunchyroll are
    exactly this shape.
    """
    pub = _publisher(db_session, name_en="bilibili")
    db_session.add_all(
        [
            models.PublisherScope(publisher_id=pub.system_id, scope="anime"),
            models.PublisherScope(publisher_id=pub.system_id, scope="manga"),
        ]
    )
    db_session.flush()

    written = backup_tabs(db_session)

    # The other machine's database: the publisher is there, its scopes are not.
    db_session.query(models.PublisherScope).delete()
    db_session.flush()

    sheets({tab: written[tab] for tab in ("Publisher", "Publisher Scope")})
    result = pull.execute_pull_specific(
        db_session, "Publisher Scope", log_action=False
    )

    assert result["status"] == "success"
    restored = {
        s.scope
        for s in db_session.query(models.PublisherScope)
        .filter_by(publisher_id=pub.system_id)
        .all()
    }
    assert restored == {"anime", "manga"}


def test_pulling_the_same_sheet_twice_does_not_duplicate_scope_rows(
    db_session, backup_tabs, sheets
):
    """uq_publisher_scope would roll the whole tab back on a second Pull."""
    pub = _publisher(db_session, name_cn="木棉花")
    db_session.add(models.PublisherScope(publisher_id=pub.system_id, scope="anime"))
    db_session.flush()

    written = backup_tabs(db_session)
    sheets({tab: written[tab] for tab in ("Publisher", "Publisher Scope")})

    for _ in range(2):
        result = pull.execute_pull_specific(
            db_session, "Publisher Scope", log_action=False
        )
        assert result["status"] == "success"

    rows = (
        db_session.query(models.PublisherScope)
        .filter_by(publisher_id=pub.system_id)
        .all()
    )
    assert len(rows) == 1


def test_a_publisher_with_no_scopes_round_trips_as_no_scopes(
    db_session, backup_tabs, sheets
):
    """Zero rows means offered nowhere, and must stay that way."""
    pub = _publisher(db_session, name_en="Nowhere Media")

    written = backup_tabs(db_session)
    assert len(written["Publisher Scope"]) == 1  # header only
    sheets({tab: written[tab] for tab in ("Publisher", "Publisher Scope")})

    pull.execute_pull_specific(db_session, "Publisher Scope", log_action=False)

    assert (
        db_session.query(models.PublisherScope)
        .filter_by(publisher_id=pub.system_id)
        .count()
        == 0
    )


# --- Across two databases that minted different publisher uuids ------------


def test_scope_row_follows_the_publisher_by_name_not_by_foreign_uuid(
    db_session, sheets
):
    """
    `publisher` is a derived-identity tab (see pull.DERIVED_IDENTITY_KEYS):
    the migration minted a different system_id in each database. A scope row
    citing the sheet's uuid must be remapped through the Publisher tab, or the
    FK violation it raises rolls the whole tab back.
    """
    local = _publisher(db_session, name_en="Sega")
    sheet_uuid = str(uuid.uuid4())

    sheets(
        {
            "Publisher": [PUBLISHER_HEADERS, [sheet_uuid, "Sega", "", "", ""]],
            # id=1 names an unrelated local row; only (publisher_id, scope) is
            # identity here.
            "Publisher Scope": [SCOPE_HEADERS, ["1", sheet_uuid, "game"]],
        }
    )

    result = pull.execute_pull_specific(
        db_session, "Publisher Scope", log_action=False
    )

    assert result["status"] == "success"
    rows = db_session.query(models.PublisherScope).all()
    assert len(rows) == 1
    assert rows[0].publisher_id == local.system_id
    assert rows[0].scope == "game"
