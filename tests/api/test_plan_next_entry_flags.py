"""
The entry-level watch_next / read_next flags are virtual fields over plan_next.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models
from app.services.domain.plan_next import (
    entry_flag,
    planned_entry_ids,
    set_entry_flag,
)


def test_setting_the_flag_creates_a_row(db_session, sample_anime):
    set_entry_flag(db_session, "anime", sample_anime.system_id, True)
    db_session.flush()

    row = db_session.query(models.PlanNext).one()
    assert row.scope == "entry"
    assert row.media_type == "anime"
    assert row.target_id == sample_anime.system_id


def test_setting_the_flag_twice_creates_one_row(db_session, sample_anime):
    set_entry_flag(db_session, "anime", sample_anime.system_id, True)
    db_session.flush()
    set_entry_flag(db_session, "anime", sample_anime.system_id, True)
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 1


def test_clearing_the_flag_deletes_the_row(db_session, sample_anime):
    set_entry_flag(db_session, "anime", sample_anime.system_id, True)
    db_session.flush()
    set_entry_flag(db_session, "anime", sample_anime.system_id, False)
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 0


def test_clearing_an_unset_flag_is_a_no_op(db_session, sample_anime):
    set_entry_flag(db_session, "anime", sample_anime.system_id, False)
    db_session.flush()
    assert db_session.query(models.PlanNext).count() == 0


def test_entry_flag_reads_back(db_session, sample_anime):
    assert entry_flag(db_session, "anime", sample_anime.system_id) is False
    set_entry_flag(db_session, "anime", sample_anime.system_id, True)
    db_session.flush()
    assert entry_flag(db_session, "anime", sample_anime.system_id) is True


def test_planned_entry_ids_is_scoped_to_one_media_type(
    db_session, sample_anime, sample_franchise
):
    movie = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="A Movie",
    )
    db_session.add(movie)
    db_session.flush()

    set_entry_flag(db_session, "anime", sample_anime.system_id, True)
    set_entry_flag(db_session, "movie", movie.system_id, True)
    db_session.flush()

    assert planned_entry_ids(db_session, "anime") == {sample_anime.system_id}
    assert planned_entry_ids(db_session, "movie") == {movie.system_id}


def test_a_group_scope_row_is_not_an_entry_flag(db_session, sample_franchise):
    db_session.add(
        models.PlanNext(
            system_id=uuid.uuid4(),
            media_type="anime",
            scope="franchise",
            target_id=sample_franchise.system_id,
            kind="next",
        )
    )
    db_session.flush()
    assert planned_entry_ids(db_session, "anime") == set()


def test_anime_detail_round_trips_watch_next(admin_client, sample_anime):
    res = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"watch_next": True}
    )
    assert res.status_code == 200

    got = admin_client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert got["watch_next"] is True


def test_comic_detail_round_trips_read_next(admin_client, sample_comic):
    res = admin_client.put(
        f"/api/comic/{sample_comic.system_id}", json={"read_next": True}
    )
    assert res.status_code == 200
    got = admin_client.get(f"/api/comic/{sample_comic.system_id}").json()
    assert got["read_next"] is True


# ---------------------------------------------------------------------------
# End-to-end no-op contract: an update that omits the flag key must leave the
# plan_next row untouched. These go through the real HTTP router rather than
# set_entry_flag directly, because PUT and PATCH reach pop_plan_flag through
# two different payload-building paths (model_dump(exclude_unset=True) vs a
# raw request dict) and both need covering independently.
# ---------------------------------------------------------------------------


def test_put_omitting_watch_next_leaves_it_true(db_session, admin_client, sample_anime):
    res = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"watch_next": True}
    )
    assert res.status_code == 200

    # Omits watch_next entirely; only touches an unrelated field.
    res = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"anime_name_en": "Renamed"}
    )
    assert res.status_code == 200
    assert res.json()["watch_next"] is True

    got = admin_client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert got["watch_next"] is True
    assert db_session.query(models.PlanNext).count() == 1


def test_patch_omitting_watch_next_leaves_it_true(db_session, admin_client, sample_anime):
    res = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"watch_next": True}
    )
    assert res.status_code == 200

    # PATCH takes a raw dict body, not a schema with exclude_unset - a
    # separate code path into pop_plan_flag from PUT's.
    res = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"anime_name_en": "Renamed Again"}
    )
    assert res.status_code == 200
    assert res.json()["watch_next"] is True

    got = admin_client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert got["watch_next"] is True
    assert db_session.query(models.PlanNext).count() == 1


def test_put_omitting_read_next_leaves_it_true(db_session, admin_client, sample_comic):
    res = admin_client.put(
        f"/api/comic/{sample_comic.system_id}", json={"read_next": True}
    )
    assert res.status_code == 200

    res = admin_client.put(
        f"/api/comic/{sample_comic.system_id}", json={"comic_name_en": "Renamed"}
    )
    assert res.status_code == 200
    assert res.json()["read_next"] is True

    got = admin_client.get(f"/api/comic/{sample_comic.system_id}").json()
    assert got["read_next"] is True
    assert db_session.query(models.PlanNext).count() == 1


def test_patch_omitting_read_next_leaves_it_true(db_session, admin_client, sample_comic):
    res = admin_client.put(
        f"/api/comic/{sample_comic.system_id}", json={"read_next": True}
    )
    assert res.status_code == 200

    res = admin_client.patch(
        f"/api/comic/{sample_comic.system_id}", json={"comic_name_en": "Renamed Again"}
    )
    assert res.status_code == 200
    assert res.json()["read_next"] is True

    got = admin_client.get(f"/api/comic/{sample_comic.system_id}").json()
    assert got["read_next"] is True
    assert db_session.query(models.PlanNext).count() == 1


def test_put_explicit_false_deletes_the_row_end_to_end_anime(
    db_session, admin_client, sample_anime
):
    res = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"watch_next": True}
    )
    assert res.status_code == 200
    assert db_session.query(models.PlanNext).count() == 1

    res = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"watch_next": False}
    )
    assert res.status_code == 200
    assert res.json()["watch_next"] is False

    got = admin_client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert got["watch_next"] is False
    assert db_session.query(models.PlanNext).count() == 0


def test_put_explicit_false_deletes_the_row_end_to_end_comic(
    db_session, admin_client, sample_comic
):
    res = admin_client.put(
        f"/api/comic/{sample_comic.system_id}", json={"read_next": True}
    )
    assert res.status_code == 200
    assert db_session.query(models.PlanNext).count() == 1

    res = admin_client.put(
        f"/api/comic/{sample_comic.system_id}", json={"read_next": False}
    )
    assert res.status_code == 200
    assert res.json()["read_next"] is False

    got = admin_client.get(f"/api/comic/{sample_comic.system_id}").json()
    assert got["read_next"] is False
    assert db_session.query(models.PlanNext).count() == 0
