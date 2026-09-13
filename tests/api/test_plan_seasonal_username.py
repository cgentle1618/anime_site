"""
Plan Next and Seasonal carry whose rows they are.

Step 3 made both tables per-user but left their tabs with no user column, so
Pull stamped every restored row to the `admin` account (`_restore_owner_id`).
That is correct while one person's database is the only thing the sheet holds
and wrong the moment a second account owns rows: their plans and their season
ratings come back as the admin's, and the admin's own rows are overwritten by
theirs. This is the column.

The fallback stays for a sheet written before Step 4, which carries no
`username` header at all - a restore from it must still work, and everything
in it did belong to one account. WHICH account changed on 2026-09-12: it is
the installation owner, which is a flag on the user row and falls back to the
first NON-root account, not to `admin`. An administrative account holds
no library, so inheriting a legacy sheet's rows is the one thing it must not
do.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import TAB_BY_NAME


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


@pytest.fixture
def two_users(db):
    """
    The `admin` account and one other.

    `admin` is fetched rather than created: app/main.py's lifespan mints it and
    COMMITS, so once any earlier test in the session has started the app it is
    already there, and a second insert trips ix_users_username. That is also
    exactly the production situation these tests are about - the account
    _restore_owner_id falls back to is the one the lifespan made.
    """
    admin_role = db.query(models.Role).filter(models.Role.name == "admin").one()
    user_role = db.query(models.Role).filter(models.Role.name == "user").one()
    a = db.query(models.User).filter(models.User.username == "admin").first()
    if a is None:
        a = models.User(username="admin", hashed_password="!",
                        role_id=admin_role.system_id, list_is_public=False)
        db.add(a)
    b = models.User(username="kana", hashed_password="!",
                    role_id=user_role.system_id, list_is_public=True)
    db.add(b)
    db.flush()
    return a, b


def test_both_tabs_carry_a_username_column():
    for name in ("Plan Next", "Seasonal"):
        tab = TAB_BY_NAME[name]
        assert "user_id" in tab.drop_columns
        assert "username" in [n for n, _fn in tab.extra_columns], name


SEASONAL_HEADERS = [
    "seasonal", "my_rating", "entry_planned", "entry_completed",
    "entry_watching", "entry_dropped", "username",
]


def test_a_seasonal_row_is_restored_to_the_user_it_names(db, sheets, two_users):
    _admin, kana = two_users
    sheets({
        "Seasonal": [
            SEASONAL_HEADERS,
            ["WIN 2026", "A", "0", "0", "0", "0", "kana"],
        ]
    })

    result = pull.execute_pull_specific(db, "Seasonal", log_action=False)

    assert result["status"] == "success"
    row = db.query(models.Seasonal).one()
    assert row.user_id == kana.id
    assert row.my_rating == "A"


def test_two_users_keep_their_own_rating_for_one_season(db, sheets, two_users):
    admin, kana = two_users
    sheets({
        "Seasonal": [
            SEASONAL_HEADERS,
            ["WIN 2026", "A", "0", "0", "0", "0", "admin"],
            ["WIN 2026", "C", "0", "0", "0", "0", "kana"],
        ]
    })

    result = pull.execute_pull_specific(db, "Seasonal", log_action=False)

    assert result["status"] == "success"
    rows = {r.user_id: r.my_rating for r in db.query(models.Seasonal).all()}
    assert rows == {admin.id: "A", kana.id: "C"}


def test_a_seasonal_sheet_with_no_username_column_still_restores(
    db, sheets, two_users
):
    """A sheet written before Step 4. Everything in it belonged to one
    account, and _restore_owner_id names the installation owner.

    THAT IS `kana`, NOT `admin`, since 2026-09-12: nobody holds the flag in
    this fixture, and the first fallback is the alphabetically-first
    NON-root account. An administrative account does not inherit a
    legacy sheet's rows just because it sorts first - which is the whole
    point of the change, and the reason a restore is where it shows up.
    """
    _admin, kana = two_users
    sheets({
        "Seasonal": [
            SEASONAL_HEADERS[:-1],
            ["WIN 2026", "A", "0", "0", "0", "0"],
        ]
    })

    result = pull.execute_pull_specific(db, "Seasonal", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.Seasonal).one().user_id == kana.id


def test_an_unknown_username_skips_the_seasonal_row_and_reports_it(
    db, sheets, two_users
):
    sheets({
        "Seasonal": [
            SEASONAL_HEADERS,
            ["WIN 2026", "A", "0", "0", "0", "0", "nobody"],
        ]
    })

    result = pull.execute_pull_specific(db, "Seasonal", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.Seasonal).count() == 0
    assert any("nobody" in ref for ref in result["unresolved_refs"])


PLAN_HEADERS = [
    "system_id", "kind", "media_type", "remark", "created_at",
    "scope", "target_id", "username",
]


def _plan_row(target_id, username, kind="Watch Next", remark=""):
    return ["", kind, "anime", remark, "", "entry", str(target_id), username]


def test_a_plan_row_is_restored_to_the_user_it_names(db, sheets, two_users):
    _admin, kana = two_users
    anime = models.Anime(anime_name_cn="計畫")
    db.add(anime)
    db.flush()

    sheets({"Plan Next": [PLAN_HEADERS, _plan_row(anime.system_id, "kana")]})

    result = pull.execute_pull_specific(db, "Plan Next", log_action=False)

    assert result["status"] == "success"
    row = db.query(models.PlanNext).one()
    assert row.user_id == kana.id
    assert row.media_id == anime.system_id


def test_two_users_plan_the_same_entry_as_two_rows(db, sheets, two_users):
    admin, kana = two_users
    anime = models.Anime(anime_name_cn="計畫二")
    db.add(anime)
    db.flush()

    sheets({
        "Plan Next": [
            PLAN_HEADERS,
            _plan_row(anime.system_id, "admin"),
            _plan_row(anime.system_id, "kana"),
        ]
    })

    result = pull.execute_pull_specific(db, "Plan Next", log_action=False)

    assert result["status"] == "success"
    owners = {r.user_id for r in db.query(models.PlanNext).all()}
    assert owners == {admin.id, kana.id}


def test_a_plan_sheet_with_no_username_column_still_restores(
    db, sheets, two_users
):
    """The Plan Next half of the fallback. `kana`, not `admin` - see the
    Seasonal test above for why an administrative account no longer inherits a
    legacy sheet's rows."""
    _admin, kana = two_users
    anime = models.Anime(anime_name_cn="計畫三")
    db.add(anime)
    db.flush()

    sheets({
        "Plan Next": [
            PLAN_HEADERS[:-1],
            _plan_row(anime.system_id, "")[:-1],
        ]
    })

    result = pull.execute_pull_specific(db, "Plan Next", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.PlanNext).one().user_id == kana.id


def test_an_unknown_username_skips_the_plan_row_and_reports_it(
    db, sheets, two_users
):
    anime = models.Anime(anime_name_cn="計畫四")
    db.add(anime)
    db.flush()

    sheets({"Plan Next": [PLAN_HEADERS, _plan_row(anime.system_id, "nobody")]})

    result = pull.execute_pull_specific(db, "Plan Next", log_action=False)

    assert result["status"] == "success"
    assert db.query(models.PlanNext).count() == 0
    assert any("nobody" in ref for ref in result["unresolved_refs"])
