"""
A restore that invents an entity must say so.

`resolve_studio` and its siblings are find-or-create, deliberately: the Add
form POSTs a typed name here and a second row would split a studio's credits.
But the same call is reached from an entry tab's `studio` cell during Pull,
where a name matching nothing is far more likely a spelling drift than a new
company - and the mint was silent, reported as a plain success.

That silence is how this database grew 45 duplicate studios: the credit
backfill minted a row per unmatched name in the legacy `anime.studio` text,
they sat unnoticed beside the curated rows for a week, and only surfaced once
normalization folded the two spellings together and Pull All began aborting on
the ambiguity.

Minting is NOT failure - a genuinely new studio typed into a sheet cell should
still be created - so the run stays a success and the names are reported.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import json

from app import models
from app.services.pipelines import pull


def test_a_name_matching_nothing_is_reported_as_created(db_session, monkeypatch):
    headers = ["anime_name_cn", "studio"]
    rows = [["無職轉生", "Studio Bind"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    # The studio really is created - this reports the mint, it does not stop it.
    assert db_session.query(models.Studio).filter_by(name_en="Studio Bind").count() == 1
    assert "Studio Bind" in " | ".join(result["created_entities"])


def test_a_name_that_matches_an_existing_row_is_not_reported(db_session, monkeypatch):
    db_session.add(models.Studio(name_en="Studio Bind"))
    db_session.commit()

    headers = ["anime_name_cn", "studio"]
    # Spelled differently, but normalize_name folds the space away, so this
    # must resolve to the existing row and mint nothing.
    rows = [["無職轉生", "StudioBind"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert db_session.query(models.Studio).count() == 1
    assert result["created_entities"] == []


def test_the_reported_name_says_which_tab_and_role_it_came_from(
    db_session, monkeypatch
):
    headers = ["anime_name_cn", "studio", "director"]
    rows = [["無職轉生", "Studio Bind", "岡本學"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    joined = " | ".join(result["created_entities"])
    # Without the role an admin cannot tell a minted studio from a minted
    # person, and they live in different tables with different merge endpoints.
    assert "studio" in joined
    assert "director" in joined


def test_pull_all_aggregates_the_mints_without_failing_the_run(
    db_session, monkeypatch
):
    def _tab(tab_name):
        if tab_name == "Anime":
            return [["anime_name_cn", "studio"], ["無職轉生", "Studio Bind"]]
        return []

    monkeypatch.setattr(pull, "get_all_raw_rows", _tab)

    result = pull.execute_pull_all(db_session, action_type="Manual")

    assert result["status"] == "success"
    assert "Studio Bind" in " | ".join(result["created_entities"])

    row = (
        db_session.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == "Pull All")
        .order_by(models.DataControlLog.id.desc())
        .first()
    )
    # A new studio is not an error: the run stays green and the names ride in
    # details_json rather than turning the row red.
    assert row.status == "Success"
    assert "Studio Bind" in json.dumps(json.loads(row.details_json))


def test_a_restore_that_invents_nothing_reports_an_empty_list(
    db_session, monkeypatch
):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [])

    result = pull.execute_pull_all(db_session, action_type="Manual")

    assert result["created_entities"] == []
