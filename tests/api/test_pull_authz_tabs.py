"""
A pipeline may not rewrite authorization data.

Pull restores the sheet into the live database, and three of its tabs carry
authorization: `Users` (including each account's role name), `Content Label`
(which labels exist) and `Media Content Label` (which entries carry them). The
sheet is an ordinary Google Sheet, editable by anyone with access to it - so
without this gate a `super` account, holding `manage.pipelines` but not
`admin.authz`, could type `admin` into the Users tab's role column, run Pull
All, and be promoted. Escalation through the back door of a pipeline.

So those three tabs need `admin.authz`. A caller without it still runs Pull
All and still restores the whole catalogue; the three are skipped and reported
through `unresolved_refs`, the same channel an unknown username already uses.

Backup is deliberately NOT gated: it writes local -> sheet and cannot change
this database. Only Pull writes authorization data inward.

Decision 10 in docs/superpowers/specs/2026-09-10-authorization-redesign-design.md.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.tabs import AUTHZ_TABS, TAB_BY_NAME

USERS_HEADERS = ["id", "username", "list_is_public", "created_at", "role"]
LABEL_HEADERS = ["system_id", "key", "label", "description", "sort_order",
                 "created_at", "updated_at"]


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: tabs.get(tab, [])
        )

    return _install


def test_exactly_three_tabs_are_authorization_bearing():
    """
    Named explicitly rather than derived: adding a fourth is a policy decision,
    and this test is where someone has to make it deliberately.
    """
    assert AUTHZ_TABS == {"Users", "Content Label", "Media Content Label"}
    for name in AUTHZ_TABS:
        assert TAB_BY_NAME[name].requires_authz is True, name


def test_every_other_tab_is_unrestricted():
    unrestricted = [
        tab.name for tab in TAB_BY_NAME.values() if not tab.requires_authz
    ]
    assert "Anime" in unrestricted
    assert "Quote" in unrestricted
    assert "User Media List" in unrestricted
    assert not (set(unrestricted) & AUTHZ_TABS)


def test_a_caller_without_authz_cannot_pull_the_users_tab(db, sheets):
    """The escalation this gate exists to stop: a role named in the sheet."""
    sheets({"Users": [USERS_HEADERS, ["", "smuggled", "false", "", "admin"]]})

    result = pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=False
    )

    assert result["status"] == "skipped"
    assert (
        db.query(models.User).filter(models.User.username == "smuggled").count()
        == 0
    )


def test_a_caller_with_authz_pulls_the_users_tab_normally(db, sheets):
    sheets({"Users": [USERS_HEADERS, ["", "invited", "false", "", "user"]]})

    result = pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=True
    )

    assert result["status"] == "success"
    assert (
        db.query(models.User).filter(models.User.username == "invited").count()
        == 1
    )


def test_a_caller_without_authz_cannot_pull_content_labels(db, sheets):
    sheets({
        "Content Label": [
            LABEL_HEADERS,
            ["", "smuggled_label", "Smuggled", "", "0", "", ""],
        ]
    })

    result = pull.execute_pull_specific(
        db, "Content Label", log_action=False, may_restore_authz=False
    )

    assert result["status"] == "skipped"
    assert (
        db.query(models.ContentLabel)
        .filter(models.ContentLabel.key == "smuggled_label")
        .count()
        == 0
    )


def test_the_default_is_closed(db, sheets):
    """
    Omitting the flag must NOT grant the permission. Least access, not most -
    the same rule role_for_user follows when a role row has vanished.
    """
    sheets({"Users": [USERS_HEADERS, ["", "defaulted", "false", "", "admin"]]})

    result = pull.execute_pull_specific(db, "Users", log_action=False)

    assert result["status"] == "skipped"
    assert (
        db.query(models.User).filter(models.User.username == "defaulted").count()
        == 0
    )


def test_an_unrestricted_tab_is_unaffected_by_the_flag(db, sheets):
    """A super must still restore the catalogue in full."""
    sheets({
        "Collection": [
            ["system_id", "collection_name_en", "collection_name_cn"],
            ["", "Pulled Collection", ""],
        ]
    })

    result = pull.execute_pull_specific(
        db, "Collection", log_action=False, may_restore_authz=False
    )

    assert result["status"] == "success"
    assert (
        db.query(models.Collection)
        .filter(models.Collection.collection_name_en == "Pulled Collection")
        .count()
        == 1
    )


def test_pull_all_without_authz_skips_the_three_and_reports_them(db, sheets):
    """
    The run still succeeds - the catalogue landed - and the skipped tabs are
    named in unresolved_refs, so the audit row is red and the gap is visible
    rather than silent.
    """
    sheets({
        "Users": [USERS_HEADERS, ["", "smuggled2", "false", "", "admin"]],
        "Collection": [
            ["system_id", "collection_name_en", "collection_name_cn"],
            ["", "Bulk Collection", ""],
        ],
    })

    result = pull.execute_pull_all(db, may_restore_authz=False)

    # Success, NOT failure: a policy skip is the gate working as intended, and
    # for an account without admin.authz it would happen on every single run.
    # A permanently red audit row teaches people to ignore red - the same
    # reasoning created_entities already follows in execute_pull_all.
    assert result["status"] == "success"
    assert not result["unresolved_refs"]

    skipped = " ".join(result.get("skipped_tabs") or [])
    for name in AUTHZ_TABS:
        assert name in skipped, f"{name} not reported as skipped"
    assert "admin.authz" in skipped

    assert (
        db.query(models.User).filter(models.User.username == "smuggled2").count()
        == 0
    )
    assert (
        db.query(models.Collection)
        .filter(models.Collection.collection_name_en == "Bulk Collection")
        .count()
        == 1
    )


def test_pull_all_with_authz_restores_the_three(db, sheets):
    sheets({"Users": [USERS_HEADERS, ["", "invited2", "false", "", "user"]]})

    result = pull.execute_pull_all(db, may_restore_authz=True)

    assert not result.get("skipped_tabs")
    assert (
        db.query(models.User).filter(models.User.username == "invited2").count()
        == 1
    )


def test_the_skipped_row_names_the_permission_a_human_would_need(db, sheets):
    """A report that does not say what is missing sends someone to the source."""
    sheets({"Users": [USERS_HEADERS]})

    result = pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=False
    )

    message = result.get("message", "")
    assert "admin.authz" in message
    assert "Users" in message
