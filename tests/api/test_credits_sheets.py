"""
Backup keeps the sheet shape while credits/tags move to their own tables.

The 22 comma-joined string columns Task 10 dropped (studio, director, genre_main,
...) are gone from the entry models, so `format_model_for_sheet` - which walks
`instance.__class__.__table__.columns` - no longer emits them at all. Rather than
inventing a per-model `format_*_for_sheet` function, backup.py appends the same
legacy-named columns back onto each entry tab generically, via
`credits.sheet_link_headers`/`sheet_link_values`, reading media_credit/media_tag
instead of an attribute. They land at the END of the row - fine, because Pull
matches by header NAME, never by position.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

from app import models
from app.services.domain.credits import (
    credit_names,
    replace_credits,
    replace_tags,
    sheet_link_headers,
    sheet_link_values,
    tag_values,
)
from app.services.pipelines import backup, pull
from app.utils.formatter import format_model_for_sheet, parse_anime_from_sheet

# ---------------------------------------------------------------------------
# credits.sheet_link_headers / sheet_link_values
# ---------------------------------------------------------------------------


def test_sheet_link_headers_and_values_stay_aligned(db_session):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT"])
    db_session.commit()

    headers = sheet_link_headers("anime")
    values = sheet_link_values(db_session, "anime", a)

    assert len(headers) == len(values)
    assert "studio" in headers
    assert values[headers.index("studio")] == "MAPPA, WIT"


def test_anime_publisher_tw_keeps_its_historic_distributor_tw_header(db_session):
    """anime.publisher_tw is the one field whose legacy header differs from its
    key - it always wrote under `distributor_tw`, not `publisher_tw`."""
    headers = sheet_link_headers("anime")
    assert "distributor_tw" in headers
    assert "publisher_tw" not in headers


def test_manga_publisher_tw_keeps_its_own_name_as_the_header(db_session):
    """Unlike anime, manga/novel/comic wrote publisher_tw under its own name."""
    headers = sheet_link_headers("manga")
    assert "publisher_tw" in headers


def test_an_uncredited_entry_produces_empty_cells(db_session):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()

    values = sheet_link_values(db_session, "anime", a)

    assert all(v == "" for v in values)


# ---------------------------------------------------------------------------
# backup.py: the new columns land at the end of the existing entry tabs
# ---------------------------------------------------------------------------


def test_backup_appends_credit_columns_after_the_plain_anime_columns(
    db_session, monkeypatch
):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT"])
    replace_tags(db_session, "anime", a.system_id, "genre_main", ["Action"])
    db_session.commit()

    written = {}
    monkeypatch.setattr(
        backup, "bulk_overwrite_sheet", lambda tab, matrix: written.__setitem__(tab, matrix)
    )

    backup.execute_backup(db_session)

    anime_matrix = written["Anime"]
    headers = anime_matrix[0]
    plain_headers = [c.name for c in models.Anime.__table__.columns]

    # Every original column is still there, in the same order, untouched.
    assert headers[: len(plain_headers)] == plain_headers
    # The link columns are appended after them under their legacy names.
    assert "studio" in headers[len(plain_headers):]
    assert "genre_main" in headers[len(plain_headers):]

    row = dict(zip(headers, anime_matrix[1]))
    assert row["studio"] == "MAPPA, WIT"
    assert row["genre_main"] == "Action"


def test_person_studio_and_scope_get_their_own_tabs():
    from app.services.pipelines.tabs import TAB_NAMES

    # Backup and Pull both iterate this registry, so a tab listed here is
    # written and restored; entity tabs must precede the media tabs.
    for tab in ("Person", "Person Role", "Studio", "System Option Scope"):
        assert tab in TAB_NAMES
        assert TAB_NAMES.index(tab) < TAB_NAMES.index("Anime")


# ---------------------------------------------------------------------------
# formatter.py: parse_anime_from_sheet still emits the flat legacy key
# ---------------------------------------------------------------------------


def test_parse_anime_from_sheet_still_returns_a_flat_studio_key():
    parsed = parse_anime_from_sheet({"anime_name_cn": "測試", "studio": "MAPPA, WIT"})
    assert parsed["studio"] == "MAPPA, WIT"
    assert "credits" not in parsed


# ---------------------------------------------------------------------------
# pull.py: the flat key gets popped and applied via replace_credits/replace_tags
# ---------------------------------------------------------------------------


def test_restore_rebuilds_credits_from_the_same_cell(db_session, monkeypatch):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT"])
    db_session.commit()

    headers = [c.name for c in models.Anime.__table__.columns] + sheet_link_headers(
        "anime"
    )
    row = format_model_for_sheet(a) + sheet_link_values(db_session, "anime", a)
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers, row])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert credit_names(db_session, "anime", a.system_id, "studio") == ["MAPPA", "WIT"]


def test_restore_of_a_new_entry_creates_its_credits(db_session, monkeypatch):
    headers = ["anime_name_cn", "studio", "genre_main"]
    rows = [["新番", "MAPPA, WIT", "Action, Comedy"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert result["rows_added"] == 1
    fresh = (
        db_session.query(models.Anime).filter_by(anime_name_cn="新番").one()
    )
    assert credit_names(db_session, "anime", fresh.system_id, "studio") == [
        "MAPPA",
        "WIT",
    ]
    assert tag_values(db_session, "anime", fresh.system_id, "genre_main") == [
        "Action",
        "Comedy",
    ]


def test_a_blank_credit_cell_clears_existing_credits(db_session, monkeypatch):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA"])
    db_session.commit()

    # The column is present, the cell is just empty -> an intentional clear,
    # the same rule the header-filter safeguard uses for plain columns.
    headers = ["system_id", "anime_name_cn", "studio"]
    rows = [[str(a.system_id), "測試", ""]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert credit_names(db_session, "anime", a.system_id, "studio") == []


def test_a_header_row_missing_the_credit_column_does_not_wipe_it(db_session, monkeypatch):
    """A sheet backed up before this task must not silently blank credits on
    the first Pull after upgrading - the same "narrow header" safety net that
    protects every other column."""
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA"])
    db_session.commit()

    headers = ["system_id", "anime_name_cn"]
    rows = [[str(a.system_id), "測試"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert credit_names(db_session, "anime", a.system_id, "studio") == ["MAPPA"]


def test_movie_source_official_restores_under_its_own_new_header(db_session, monkeypatch):
    """movie/source_official never had a legacy string column, so it is a
    brand-new column rather than a renamed one - it uses its own key as the
    header, appended at the end like every other link column."""
    headers = ["movie_name_cn", "source_official"]
    rows = [["新電影", "Netflix"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "Movies", log_action=False)

    assert result["status"] == "success"
    fresh = db_session.query(models.Movies).filter_by(movie_name_cn="新電影").one()
    assert tag_values(db_session, "movie", fresh.system_id, "source_official") == [
        "Netflix"
    ]


# ---------------------------------------------------------------------------
# pull.py: System Options pk_field must be 'system_id', not the dropped 'id'
# ---------------------------------------------------------------------------


def test_repull_of_an_existing_system_option_updates_it_in_place(db_session, monkeypatch):
    """
    SystemOption's primary key moved from 'id' to 'system_id' (Task 4), and
    the 'id' column was later dropped outright (Task 10). pull.py's pk_field
    for the "System Options" tab must follow that move, or clean_header_dict
    never carries a usable pk_value, every re-Pull takes the INSERT branch,
    and - now that uq_system_option_value (category, value) exists - the
    second INSERT of the same option raises IntegrityError instead of merely
    duplicating.
    """
    option = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(option)
    db_session.commit()

    headers = ["system_id", "category", "value", "sort_order", "remark"]
    rows = [[str(option.system_id), "Genre Main", "Action", "5", "updated"]]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    result = pull.execute_pull_specific(db_session, "System Options", log_action=False)

    assert result["status"] == "success"
    assert result["rows_updated"] == 1
    assert result["rows_added"] == 0

    remaining = (
        db_session.query(models.SystemOption)
        .filter_by(category="Genre Main", value="Action")
        .all()
    )
    assert len(remaining) == 1
    assert remaining[0].system_id == option.system_id
    assert remaining[0].sort_order == 5
    assert remaining[0].remark == "updated"
