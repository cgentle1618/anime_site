"""
Backup then Pull All must reproduce the database exactly, for two users.

docs/switching-environments.md makes Google Sheets the ONLY path data takes
between the company machine and the home machine, and Pull All overwrites
every table. If this cycle is not the identity function, the next machine
switch loses somebody's list - and there is no second copy.

Drives the real execute_backup and execute_pull_all against an in-memory
workbook, so every tab travels through the same code an admin's Backup does.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def workbook(monkeypatch):
    """One dict standing in for the spreadsheet. Backup writes it, Pull reads it."""
    sheet: dict[str, list[list]] = {}

    def _write(tab_name, matrix):
        if not matrix:
            raise ValueError("refusing to blank a tab")
        sheet[tab_name] = [list(row) for row in matrix]
        return True

    def _read(tab_name):
        return sheet.get(tab_name, [])

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", _write)
    monkeypatch.setattr(pull, "get_all_raw_rows", _read)
    return sheet


@pytest.fixture
def two_users_with_lists(db):
    """Two users, three entries across three media types, four list rows."""
    admin_role = db.query(models.Role).filter(models.Role.name == "admin").one()
    user_role = db.query(models.Role).filter(models.Role.name == "user").one()
    cg = models.User(username="cg1618", hashed_password="$2b$12$x" * 4,
                     role_id=admin_role.system_id, list_is_public=False)
    kana = models.User(username="kana", hashed_password="$2b$12$y" * 4,
                       role_id=user_role.system_id, list_is_public=True)
    frieren = models.Anime(anime_name_cn="葬送的芙莉蓮", anime_name_en="Frieren")
    csm = models.Manga(manga_name_cn="鏈鋸人", manga_name_en="Chainsaw Man")
    hk = models.Game(game_name_en="Hollow Knight")
    db.add_all([cg, kana, frieren, csm, hk])
    db.commit()

    def media_of(entry):
        return db.query(models.Media).filter_by(system_id=entry.system_id).one()

    db.add_all([
        models.UserMediaList(user_id=cg.id, media_id=media_of(frieren).system_id,
                             status="Completed", my_rating="9.5", ep_fin=28),
        models.UserMediaList(user_id=kana.id, media_id=media_of(frieren).system_id,
                             status="Watching", ep_fin=11),
        models.UserMediaList(user_id=cg.id, media_id=media_of(csm).system_id,
                             status="Reading", my_rating="8.0",
                             vol_fin=14.0, ch_fin=152.0),
        models.UserMediaList(user_id=kana.id, media_id=media_of(hk).system_id,
                             status="Might Play"),
    ])
    db.commit()
    return cg, kana


def _snapshot(db):
    """The data this step is responsible for, as comparable plain values."""
    users = {
        u.username: (u.role_ref.name, u.list_is_public)
        for u in db.query(models.User).all()
    }
    lists = {}
    for row in db.query(models.UserMediaList).all():
        user = db.get(models.User, row.user_id)
        media = db.get(models.Media, row.media_id)
        lists[(user.username, media.media_type, media.public_id)] = (
            row.status, row.my_rating, row.ep_fin, row.vol_fin,
            row.ch_fin, row.issue_fin, row.my_watch_day, row.completed_at,
        )
    return users, lists


def _wipe_what_the_sheet_owns(db):
    """What a Pull All onto the other machine would find: no list rows, and
    only the account app/main.py's lifespan mints there."""
    db.execute(text("DELETE FROM user_media_list"))
    db.execute(text("DELETE FROM users WHERE username <> 'admin'"))
    db.commit()


def test_backup_then_pull_all_reproduces_two_users_lists(
    db, workbook, two_users_with_lists
):
    before_users, before_lists = _snapshot(db)
    assert len(before_users) >= 2
    assert len(before_lists) == 4

    backup.execute_backup(db, action_type="Manual")
    assert "Users" in workbook
    assert "User Media List" in workbook
    assert "Media" in workbook

    _wipe_what_the_sheet_owns(db)
    assert db.query(models.UserMediaList).count() == 0

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert result["status"] == "success"
    assert result["unresolved_refs"] == []

    after_users, after_lists = _snapshot(db)
    assert after_users == before_users
    assert after_lists == before_lists


def test_the_users_tab_carries_no_credential_material(db, workbook,
                                                      two_users_with_lists):
    backup.execute_backup(db, action_type="Manual")

    headers = workbook["Users"][0]
    assert "hashed_password" not in headers
    assert "role_id" not in headers
    assert "role" in headers
    body = "".join(str(cell) for row in workbook["Users"][1:] for cell in row)
    assert "$2b$12$" not in body


def test_the_restored_accounts_cannot_be_logged_into(
    db, workbook, two_users_with_lists
):
    """
    The password deliberately does not travel. A restored account must be
    unusable rather than carry a guessable placeholder - and the list rows
    must survive regardless, which is the point of the tradeoff.
    """
    from app.services.security import is_unusable_password_hash, verify_password

    backup.execute_backup(db, action_type="Manual")
    _wipe_what_the_sheet_owns(db)

    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    kana = db.query(models.User).filter_by(username="kana").one()
    assert is_unusable_password_hash(kana.hashed_password)
    assert verify_password("", kana.hashed_password) is False
    assert db.query(models.UserMediaList).filter_by(user_id=kana.id).count() == 2


def test_a_pull_never_changes_an_existing_accounts_password(
    db, workbook, two_users_with_lists
):
    """The admin has to still be able to log into their own machine."""
    cg, _kana = two_users_with_lists
    kept = db.query(models.User).filter_by(username="cg1618").one().hashed_password

    backup.execute_backup(db, action_type="Manual")
    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    stored = db.query(models.User).filter_by(username="cg1618").one()
    assert stored.hashed_password == kept


def test_a_second_pull_all_changes_nothing(db, workbook, two_users_with_lists):
    """Idempotence. A Pull All that duplicated rows would double every list on
    the second run, and uq_user_media would abort the tab."""
    backup.execute_backup(db, action_type="Manual")
    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    once = _snapshot(db)

    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    assert _snapshot(db) == once
    assert db.query(models.UserMediaList).count() == 4


def test_plans_and_seasons_come_back_to_the_user_who_owns_them(
    db, workbook, two_users_with_lists
):
    """
    Step 3 made plan_next and seasonal per-user; Step 4 is what makes the
    sheet say whose they are. Without the username column both come back
    stamped to the admin, so a second account's plans and season ratings
    would silently become the admin's on the next machine switch.
    """
    cg, kana = two_users_with_lists
    frieren = db.query(models.Anime).filter_by(anime_name_en="Frieren").one()
    db.add_all([
        models.PlanNext(user_id=cg.id, kind="Watch Next", media_type="anime",
                        media_id=frieren.system_id),
        models.PlanNext(user_id=kana.id, kind="Watch Next", media_type="anime",
                        media_id=frieren.system_id),
        models.Seasonal(user_id=cg.id, seasonal="WIN 2026", my_rating="A"),
        models.Seasonal(user_id=kana.id, seasonal="WIN 2026", my_rating="C"),
    ])
    db.commit()

    backup.execute_backup(db, action_type="Manual")
    assert "username" in workbook["Plan Next"][0]
    assert "username" in workbook["Seasonal"][0]

    db.execute(text("DELETE FROM plan_next"))
    db.execute(text("DELETE FROM seasonal"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert result["unresolved_refs"] == []

    plans = {
        db.get(models.User, r.user_id).username
        for r in db.query(models.PlanNext).all()
    }
    assert plans == {"cg1618", "kana"}

    seasons = {
        db.get(models.User, r.user_id).username: r.my_rating
        for r in db.query(models.Seasonal).all()
    }
    assert seasons == {"cg1618": "A", "kana": "C"}
