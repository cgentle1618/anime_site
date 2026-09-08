"""
A sheet tab whose header row predates a migration must not wipe the columns it
is missing.

`parse_row_to_dict` builds its dict from the sheet's header row, but every
parser emits its full key set regardless, so an absent column arrived as
`{"col": None}` and the upsert's `setattr` loop nulled a perfectly good DB
value. Two columns (`franchise.collection_id`, `collection.no_built_in_orders`)
carried a hand-written `if "col" in raw:` guard; the other ~400 did not.

The fix filters the parsed dict down to the columns the sheet header actually
had, and applies the INSERT defaults only when inserting.

A blank cell is NOT the same as an absent column: a present-but-empty cell
still means "clear this value" and must still wipe.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull


@pytest.fixture
def sheet(monkeypatch):
    """Feed execute_pull_specific a fake tab with an arbitrary header row."""

    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


# ---------------------------------------------------------------------------
# An absent column leaves the DB value alone
# ---------------------------------------------------------------------------


def test_absent_column_does_not_wipe_an_existing_value(db_session, sheet):
    anime = models.Anime(anime_name_en="Frieren", my_rating="S")
    db_session.add(anime)
    db_session.flush()

    # A header row from before my_rating existed.
    sheet(["system_id", "anime_name_en"], [[str(anime.system_id), "Frieren"]])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert result["rows_updated"] == 1
    db_session.refresh(anime)
    assert anime.my_rating == "S"


def test_blank_cell_still_clears_the_value(db_session, sheet):
    anime = models.Anime(anime_name_en="Frieren", my_rating="S")
    db_session.add(anime)
    db_session.flush()

    # The column IS present, the cell is just empty -> an intentional clear.
    sheet(
        ["system_id", "anime_name_en", "my_rating"],
        [[str(anime.system_id), "Frieren", ""]],
    )

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    db_session.refresh(anime)
    assert anime.my_rating is None


def test_absent_owner_column_does_not_orphan_a_watch_order_list(db_session, sheet):
    """`watch_order_list.series_id` is a post-migration column with no guard."""
    series = models.Series(series_name_en="Monogatari")
    db_session.add(series)
    db_session.flush()

    wol = models.WatchOrderList(series_id=series.system_id, list_name="Release Order")
    db_session.add(wol)
    db_session.flush()

    # A header row from before series_id was added to the table.
    sheet(
        ["system_id", "franchise_id", "collection_id", "list_name"],
        [[str(wol.system_id), "", "", "Release Order"]],
    )

    result = pull.execute_pull_specific(db_session, "Watch Order List", log_action=False)

    assert result["status"] == "success"
    db_session.refresh(wol)
    assert wol.series_id == series.system_id


# ---------------------------------------------------------------------------
# INSERT defaults must not leak onto an UPDATE
# ---------------------------------------------------------------------------


def test_absent_status_column_does_not_reset_an_existing_status(db_session, sheet):
    anime = models.Anime(anime_name_en="Frieren", watching_status="Completed")
    db_session.add(anime)
    db_session.flush()

    sheet(["system_id", "anime_name_en"], [[str(anime.system_id), "Frieren"]])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    db_session.refresh(anime)
    assert anime.watching_status == "Completed"


def test_absent_created_at_does_not_restamp_an_existing_movie(db_session, sheet):
    movie = models.Movies(movie_name_en="Arrival", watching_status="Completed")
    db_session.add(movie)
    db_session.flush()
    original_created_at = movie.created_at

    sheet(["system_id", "movie_name_en"], [[str(movie.system_id), "Arrival"]])

    result = pull.execute_pull_specific(db_session, "Movies", log_action=False)

    assert result["status"] == "success"
    db_session.refresh(movie)
    assert movie.created_at == original_created_at
    assert movie.watching_status == "Completed"


def test_insert_still_gets_its_defaults(db_session, sheet):
    """The defaults exist to make an INSERT valid - inserts must keep them."""
    sheet(["system_id", "anime_name_en"], [["", "Bocchi the Rock!"]])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert result["rows_added"] == 1
    fresh = (
        db_session.query(models.Anime)
        .filter(models.Anime.anime_name_en == "Bocchi the Rock!")
        .one()
    )
    assert fresh.watching_status == "Might Watch"


def test_movie_insert_still_gets_its_timestamps(db_session, sheet):
    sheet(["system_id", "movie_name_en"], [["", "Dune"]])

    result = pull.execute_pull_specific(db_session, "Movies", log_action=False)

    assert result["status"] == "success"
    fresh = (
        db_session.query(models.Movies)
        .filter(models.Movies.movie_name_en == "Dune")
        .one()
    )
    assert fresh.watching_status == "Might Watch"
    assert fresh.created_at is not None
    assert fresh.updated_at is not None


def test_row_with_a_uuid_missing_locally_still_inserts_with_defaults(
    db_session, sheet
):
    """PK present but no local row -> the INSERT branch, so defaults apply."""
    orphan_id = str(uuid.uuid4())
    sheet(["system_id", "anime_name_en"], [[orphan_id, "Sakamoto Days"]])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert result["rows_added"] == 1
    fresh = db_session.query(models.Anime).filter_by(system_id=orphan_id).one()
    assert fresh.watching_status == "Might Watch"
