"""
One ambiguous credit name must not destroy a whole restore.

`credits._find_by_name` raises AmbiguousNameError when a sheet cell names an
entity that matches two stored rows - deliberately, because picking one
silently attaches an entry's credits to the wrong studio. Nothing caught it,
so the raise escaped the row loop, escaped `execute_pull_specific`, and
`execute_pull_all` reported "Full Pull Pipeline crashed" on the FIRST
collision, leaving every later tab unpulled.

The collision is a data problem an admin fixes with the merge endpoint, and
they can only merge what they know about. Aborting on the first one turns a
one-pass cleanup into one re-run per duplicate, so the pull now skips the
ambiguous link, keeps the rest of the row, and reports every collision it saw.

The two names below differ as strings but normalize to the same key, which is
what a real duplicate looks like: studio's unique constraint covers the four
name columns, so two rows cannot hold the identical string.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

from app import models
from app.services.domain.credits import credit_names
from app.services.pipelines import pull


def _duplicate_studio(db):
    """Two studio rows whose names normalize to the same key."""
    keep = models.Studio(name_en="Studio Bind", name_jp="スタジオバインド")
    stub = models.Studio(name_en="StudioBind")
    db.add_all([keep, stub])
    db.commit()
    return keep, stub


def test_an_ambiguous_credit_name_does_not_abort_the_tab(db_session, monkeypatch):
    _duplicate_studio(db_session)
    headers = ["anime_name_cn", "studio"]
    rows = [["無職轉生", "Studio Bind"], ["進擊的巨人", "WIT"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    # The run survives, and the row AFTER the collision still pulls.
    assert result["status"] == "success"
    later = db_session.query(models.Anime).filter_by(anime_name_cn="進擊的巨人").one()
    assert credit_names(db_session, "anime", later.system_id, "studio") == ["WIT"]


def test_the_row_itself_still_pulls_when_only_its_credit_is_ambiguous(
    db_session, monkeypatch
):
    _duplicate_studio(db_session)
    headers = ["anime_name_cn", "studio"]
    rows = [["無職轉生", "Studio Bind"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    pull.execute_pull_specific(db_session, "Anime", log_action=False)

    # The scalar columns are not collateral damage - only the link is skipped,
    # and it is left unset rather than guessed at.
    entry = db_session.query(models.Anime).filter_by(anime_name_cn="無職轉生").one()
    assert credit_names(db_session, "anime", entry.system_id, "studio") == []


def test_every_collision_is_reported_not_just_the_first(db_session, monkeypatch):
    _duplicate_studio(db_session)
    keep = models.Studio(name_en="Kyoto Animation")
    stub = models.Studio(name_en="KyotoAnimation")
    db_session.add_all([keep, stub])
    db_session.commit()

    headers = ["anime_name_cn", "studio"]
    rows = [["無職轉生", "Studio Bind"], ["冰菓", "Kyoto Animation"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    # An admin merges duplicates from this list, so a list of one would mean
    # one re-run per duplicate - the thing this change exists to prevent.
    conflicts = " | ".join(result["credit_conflicts"])
    assert "Studio Bind" in conflicts
    assert "Kyoto Animation" in conflicts
    assert len(result["credit_conflicts"]) == 2


def test_a_clean_tab_reports_no_conflicts(db_session, monkeypatch):
    headers = ["anime_name_cn", "studio"]
    rows = [["進擊的巨人", "WIT"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["credit_conflicts"] == []


# ---------------------------------------------------------------------------
# The full run: every tab pulled, every collision reported at the end
# ---------------------------------------------------------------------------


def test_pull_all_finishes_every_tab_and_reports_the_collisions(
    db_session, monkeypatch
):
    """The whole point of the change: 45 duplicates used to mean 45 aborted
    runs. One run must now surface all of them, so one merge pass clears the
    lot."""
    _duplicate_studio(db_session)

    def _tab(tab_name):
        if tab_name == "Anime":
            return [["anime_name_cn", "studio"], ["無職轉生", "Studio Bind"]]
        if tab_name == "Manga":
            return [["manga_name_cn", "manga_name_en"], ["進擊的巨人", "AoT"]]
        return []

    monkeypatch.setattr(pull, "get_all_raw_rows", _tab)

    result = pull.execute_pull_all(db_session, action_type="Manual")

    # Manga is pulled AFTER Anime, so it proves the run did not stop at the
    # collision - the old behaviour never reached it.
    assert db_session.query(models.Manga).filter_by(manga_name_cn="進擊的巨人").count() == 1
    conflicts = " | ".join(result["credit_conflicts"])
    assert "Studio Bind" in conflicts


def test_pull_all_reports_no_conflicts_on_a_clean_restore(db_session, monkeypatch):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [])

    result = pull.execute_pull_all(db_session, action_type="Manual")

    assert result["credit_conflicts"] == []
    assert result["status"] == "success"


def test_the_audit_row_names_the_duplicate_so_an_admin_can_merge_it(
    db_session, monkeypatch
):
    """The admin page shows one generic toast and reloads the log table, so
    this row is the only place the skipped links reach a human."""
    _duplicate_studio(db_session)

    def _tab(tab_name):
        if tab_name == "Anime":
            return [["anime_name_cn", "studio"], ["無職轉生", "Studio Bind"]]
        return []

    monkeypatch.setattr(pull, "get_all_raw_rows", _tab)

    pull.execute_pull_all(db_session, action_type="Manual")

    row = (
        db_session.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == "Pull All")
        .order_by(models.DataControlLog.id.desc())
        .first()
    )
    assert row.status == "Failed"
    assert "Studio Bind" in row.error_message
    assert "Merge the duplicate" in row.error_message
