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
from app.services.domain.user_list import acting_user_id, attach_list_fields
from app.services.pipelines import pull


@pytest.fixture
def sheet(monkeypatch):
    """Feed execute_pull_specific a fake tab with an arbitrary header row."""

    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


def effective_status(db, entry, media_type="anime"):
    """What a reader sees for an entry whose status lives on the list row.

    The personal columns are gone from these tables, so asserting on the
    column is not an option; this is the same call the read path makes.
    """
    attach_list_fields(db, media_type, entry, acting_user_id(db, None))
    return entry.watching_status


# ---------------------------------------------------------------------------
# An absent column leaves the DB value alone
# ---------------------------------------------------------------------------


def test_absent_column_does_not_wipe_an_existing_value(db_session, sheet):
    anime = models.Anime(anime_name_en="Frieren", mal_rank="S")
    db_session.add(anime)
    db_session.flush()

    # A header row from before mal_rank existed.
    sheet(["system_id", "anime_name_en"], [[str(anime.system_id), "Frieren"]])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    assert result["rows_updated"] == 1
    db_session.refresh(anime)
    assert anime.mal_rank == "S"


def test_blank_cell_still_clears_the_value(db_session, sheet):
    anime = models.Anime(anime_name_en="Frieren", mal_rank="S")
    db_session.add(anime)
    db_session.flush()

    # The column IS present, the cell is just empty -> an intentional clear.
    sheet(
        ["system_id", "anime_name_en", "mal_rank"],
        [[str(anime.system_id), "Frieren", ""]],
    )

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    db_session.refresh(anime)
    assert anime.mal_rank is None


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


def test_pulling_anime_does_not_reset_the_status_on_the_list_row(
    db_session, sheet, list_row
):
    """The Anime tab no longer carries a status; `User Media List` does.

    The INSERT sanitizer still injects a "Might Watch" default for the Anime
    tab, and drop_non_columns discards it because the column is gone. This
    pins that it stays discarded rather than finding its way to the list row.
    """
    anime = models.Anime(anime_name_en="Frieren")
    db_session.add(anime)
    db_session.flush()
    list_row(anime, status="Completed")

    sheet(["system_id", "anime_name_en"], [[str(anime.system_id), "Frieren"]])

    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    db_session.refresh(anime)
    assert effective_status(db_session, anime) == "Completed"


def test_absent_created_at_does_not_restamp_an_existing_movie(
    db_session, sheet, list_row
):
    movie = models.Movies(movie_name_en="Arrival")
    db_session.add(movie)
    db_session.flush()
    list_row(movie, status="Completed")
    original_created_at = movie.created_at

    sheet(["system_id", "movie_name_en"], [[str(movie.system_id), "Arrival"]])

    result = pull.execute_pull_specific(db_session, "Movies", log_action=False)

    assert result["status"] == "success"
    db_session.refresh(movie)
    assert movie.created_at == original_created_at
    assert effective_status(db_session, movie, "movie") == "Completed"


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
    # No list row is made by a catalogue pull, and an entry without one reads
    # back as the type's default - the same value the old column defaulted to.
    assert effective_status(db_session, fresh) == "Might Watch"


def test_movie_insert_still_gets_its_timestamps(db_session, sheet):
    sheet(["system_id", "movie_name_en"], [["", "Dune"]])

    result = pull.execute_pull_specific(db_session, "Movies", log_action=False)

    assert result["status"] == "success"
    fresh = (
        db_session.query(models.Movies)
        .filter(models.Movies.movie_name_en == "Dune")
        .one()
    )
    assert effective_status(db_session, fresh, "movie") == "Might Watch"
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
    assert effective_status(db_session, fresh) == "Might Watch"
