"""
The User Media List tab - every user's list rows.

Identified by username + (media_type, public_id) rather than by the raw
user_id / media_id uuids, because a human reads this tab during an environment
switch (docs/switching-environments.md) and two uuid columns beside thirteen
numbers are unreadable. Both natural keys are exact: users.username is UNIQUE
and uq_media_type_public_id covers (media_type, public_id) on media.

system_id is dropped as well: it is minted per database (step 1's backfill
uses gen_random_uuid()), so the sheet's value names nothing here - the tab is
in DERIVED_IDENTITY_MINTED_PK for the same reason.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_BY_NAME
from app.utils.formatter import format_model_for_sheet


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


# The tab's shape and its place in the restore order are pinned elsewhere:
# tests/services/test_user_media_list_tab.py (Step 1's, drop_columns and
# extra_columns) and tests/api/test_sheet_restore_order.py (Step 4's, the
# Users -> Media -> User Media List chain). What is here is the Backup row
# and the whole Pull path.


def test_the_backup_row_names_its_user_and_its_entry(db):
    tab = TAB_BY_NAME["User Media List"]
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    user = models.User(
        username="kana",
        hashed_password="!",
        role_id=role.system_id,
        list_is_public=False,
    )
    anime = models.Anime(anime_name_cn="葬送的芙莉蓮")
    db.add_all([user, anime])
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()
    row = models.UserMediaList(
        user_id=user.id,
        media_id=media.system_id,
        status="Watching",
        my_rating="9.5",
        ep_fin=11,
    )
    db.add(row)
    db.flush()

    kept = [
        c.name
        for c in models.UserMediaList.__table__.columns
        if c.name not in tab.drop_columns
    ]
    headers = kept + [name for name, _fn in tab.extra_columns]
    values = format_model_for_sheet(row, columns=kept) + [
        fn(row, db) for _name, fn in tab.extra_columns
    ]
    cells = dict(zip(headers, values))

    assert "user_id" not in cells
    assert "media_id" not in cells
    assert cells["username"] == "kana"
    assert cells["media_type"] == "anime"
    assert cells["public_id"] == media.public_id
    assert cells["status"] == "Watching"
    assert cells["my_rating"] == "9.5"
    assert cells["ep_fin"] == "11"


# ---------------------------------------------------------------------------
# Pull side
# ---------------------------------------------------------------------------

UML_HEADERS = [
    "status", "my_rating", "completed_at", "my_watch_day",
    "ep_fin", "vol_fin", "vol_fin_page", "ch_fin", "arc_fin",
    "ch_fin_in_arc", "progress_display", "issue_fin",
    "created_at", "updated_at",
    "media_type", "public_id", "username",
]


@pytest.fixture
def two_users(db):
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    a = models.User(username="cg1618", hashed_password="!",
                    role_id=role.system_id, list_is_public=False)
    b = models.User(username="kana", hashed_password="!",
                    role_id=role.system_id, list_is_public=True)
    db.add_all([a, b])
    db.flush()
    return a, b


def _blank(**cells):
    """One UML_HEADERS-shaped row, empty except for the named cells."""
    return [str(cells.get(h, "")) for h in UML_HEADERS]


def test_a_row_resolves_its_user_and_entry_from_readable_columns(
    db, sheets, two_users
):
    cg, _kana = two_users
    anime = models.Anime(anime_name_cn="測試")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(
                status="Completed", my_rating="9.5", ep_fin="28",
                username="cg1618", media_type="anime",
                public_id=str(media.public_id),
            ),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    row = db.query(models.UserMediaList).one()
    assert row.user_id == cg.id
    assert row.media_id == media.system_id
    assert row.status == "Completed"
    assert row.ep_fin == 28


def test_two_users_on_the_same_entry_stay_two_rows(db, sheets, two_users):
    cg, kana = two_users
    anime = models.Anime(anime_name_cn="測試二")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(status="Completed", my_rating="9.5", ep_fin="28",
                   username="cg1618", media_type="anime",
                   public_id=str(media.public_id)),
            _blank(status="Watching", ep_fin="11", username="kana",
                   media_type="anime", public_id=str(media.public_id)),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    rows = {r.user_id: r for r in db.query(models.UserMediaList).all()}
    assert set(rows) == {cg.id, kana.id}
    assert rows[cg.id].status == "Completed"
    assert rows[kana.id].status == "Watching"
    assert rows[kana.id].ep_fin == 11


def test_a_row_this_database_already_holds_updates_in_place(
    db, sheets, two_users
):
    """
    uq_user_media is (user_id, media_id) and system_id is minted per database
    by step 1's backfill. A sheet row for a list row this database already
    holds must UPDATE it - a blind INSERT collides and rolls the whole tab
    back, losing every user's list.
    """
    cg, _kana = two_users
    anime = models.Anime(anime_name_cn="測試三")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()
    existing = models.UserMediaList(
        user_id=cg.id, media_id=media.system_id, status="Watching", ep_fin=3
    )
    db.add(existing)
    db.flush()
    local_id = existing.system_id

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(status="Completed", ep_fin="28", username="cg1618",
                   media_type="anime", public_id=str(media.public_id)),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    rows = db.query(models.UserMediaList).all()
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].status == "Completed"
    assert rows[0].ep_fin == 28


def test_an_unknown_username_skips_the_row_and_reports_it(db, sheets):
    anime = models.Anime(anime_name_cn="測試四")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(status="Watching", username="nobody", media_type="anime",
                   public_id=str(media.public_id)),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.UserMediaList).count() == 0
    assert any("nobody" in ref for ref in result["unresolved_refs"])


def test_an_unknown_entry_skips_the_row_and_reports_it(db, sheets, two_users):
    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(status="Watching", username="cg1618", media_type="anime",
                   public_id="999999"),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.UserMediaList).count() == 0
    assert any("999999" in ref for ref in result["unresolved_refs"])


def test_a_blank_timestamp_still_inserts(db, sheets, two_users):
    """created_at/updated_at are NOT NULL; a header present but blank parses
    to None, which would fail the insert without an INSERT-only stamp."""
    anime = models.Anime(anime_name_cn="測試五")
    db.add(anime)
    db.flush()
    media = db.query(models.Media).filter_by(system_id=anime.system_id).one()

    sheets({
        "User Media List": [
            UML_HEADERS,
            _blank(status="Watching", username="cg1618", media_type="anime",
                   public_id=str(media.public_id)),
        ]
    })

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    row = db.query(models.UserMediaList).one()
    assert row.created_at is not None
    assert row.updated_at is not None
