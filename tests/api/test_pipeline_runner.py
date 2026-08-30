"""
The shared Fill / Replace runner and the per-type spec registry.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import json
import uuid

import pytest

from app import models
from app.services.pipelines import fill, replace
from app.services.pipelines.runner import PipelineSpec, run_fill, run_replace, run_replace_single
from app.services.pipelines.specs import FILL_ALL, PIPELINES, REPLACE_ALL
from app.utils.media_resolver import MEDIA_TABLES


@pytest.fixture
def anyio_backend():
    # anyio's pytest plugin would otherwise also parametrize on trio.
    return "asyncio"


class FakeRequest:
    def __init__(self, disconnect_after=None):
        self.calls = 0
        self.disconnect_after = disconnect_after

    async def is_disconnected(self):
        self.calls += 1
        return self.disconnect_after is not None and self.calls > self.disconnect_after


async def events(gen):
    out = []
    async for message in gen:
        assert message.startswith("data: ")
        out.append(json.loads(message[6:]))
    return out


def logs(db, kind):
    return (
        db.query(models.DataControlLog)
        .filter(models.DataControlLog.action_main == kind)
        .order_by(models.DataControlLog.id)
        .all()
    )


def movie_spec(**overrides):
    base = dict(
        key="movie", label="Movie", model=models.Movies,
        extract_id=None,
        fill_eligible=lambda db, e: e.imdb_rating is None,
        fill=lambda db, e: setattr(e, "imdb_rating", "9.0"),
        replace_select=lambda db: db.query(models.Movies).all(),
        replace=lambda db, e, bulk: setattr(e, "imdb_rating", "bulk" if bulk else "single"),
        single_after=(),
    )
    base.update(overrides)
    return PipelineSpec(**base)


@pytest.fixture
def movies(db_session):
    rows = [models.Movies(movie_name_en="A"), models.Movies(movie_name_en="B", imdb_rating="7")]
    db_session.add_all(rows)
    db_session.flush()
    return rows


# ---------------------------------------------------------------- registry


def test_every_media_type_has_a_pipeline_spec():
    assert set(PIPELINES) == set(MEDIA_TABLES)


def test_fill_all_skips_comic_and_replace_all_skips_comic():
    assert [s.key for s in FILL_ALL] == ["anime", "anime-movie", "movie", "tv-show", "cartoon", "manga", "novel"]
    assert [s.key for s in REPLACE_ALL] == [s.key for s in FILL_ALL]


def test_public_entry_points_still_exist():
    for key in ("anime", "anime_movie", "movie", "tv_show", "cartoon", "manga", "novel", "comic"):
        assert callable(getattr(fill, f"execute_fill_{key}"))
        assert callable(getattr(replace, f"execute_replace_single_{key}"))
    for key in ("anime", "anime_movie", "movie", "tv_show", "cartoon", "manga", "novel"):
        assert callable(getattr(replace, f"execute_replace_{key}"))
    assert callable(fill.execute_fill_all) and callable(replace.execute_replace_all)


# -------------------------------------------------------------------- fill


@pytest.mark.anyio
async def test_fill_only_touches_eligible_entries_and_logs_once(db_session, movies):
    out = await events(run_fill(movie_spec(), db_session, FakeRequest()))

    assert out[-1]["status"] == "success"
    assert out[-1]["processed"] == 1 and out[-1]["total"] == 1
    a, b = movies
    db_session.refresh(a)
    db_session.refresh(b)
    assert a.imdb_rating == "9.0" and b.imdb_rating == "7"
    rows = logs(db_session, "Fill")
    assert [r.status for r in rows] == ["Success"]
    assert rows[0].rows_updated == 1


@pytest.mark.anyio
async def test_fill_under_an_orchestrator_writes_no_log_of_its_own(db_session, movies):
    await events(run_fill(movie_spec(), db_session, FakeRequest(), log_action=False))
    assert logs(db_session, "Fill") == []


@pytest.mark.anyio
async def test_one_failing_entry_does_not_end_the_run(db_session, movies):
    def fill(db, e):
        if e.movie_name_en == "A":
            raise RuntimeError("TMDB down")
        e.imdb_rating = "9.0"

    spec = movie_spec(fill_eligible=lambda db, e: True, fill=fill)
    out = await events(run_fill(spec, db_session, FakeRequest()))
    assert out[-1]["status"] == "success"
    assert out[-1]["processed"] == 1 and out[-1]["total"] == 2


@pytest.mark.anyio
async def test_disconnect_aborts_and_logs_aborted(db_session, movies):
    spec = movie_spec(fill_eligible=lambda db, e: True)
    out = await events(run_fill(spec, db_session, FakeRequest(disconnect_after=1)))
    assert all(e["status"] != "success" for e in out)
    assert [r.status for r in logs(db_session, "Fill")] == ["Aborted"]


@pytest.mark.anyio
async def test_exhausted_budget_stops_early_and_says_how_many_are_left(db_session, movies):
    spec = movie_spec(fill_eligible=lambda db, e: True, budget=lambda: False)
    out = await events(run_fill(spec, db_session, FakeRequest()))
    assert out[-1]["status"] == "success"
    assert out[-1]["processed"] == 0
    assert "2 entries skipped" in out[-1]["message"]


@pytest.mark.anyio
async def test_post_process_and_after_steps_run_in_order(db_session, movies):
    seen = []
    spec = movie_spec(
        post_process=lambda e, db: seen.append(("post", e.movie_name_en)),
        fill_after=(("Deriving...", lambda db: seen.append("derive")), ("Syncing...", lambda db: seen.append("sync"))),
    )
    out = await events(run_fill(spec, db_session, FakeRequest()))
    assert seen == [("post", "A"), ("post", "B"), "derive", "sync"]
    assert [e["current_entry"] for e in out if e["status"] == "processing"][-2:] == ["Deriving...", "Syncing..."]


# ----------------------------------------------------------------- replace


@pytest.mark.anyio
async def test_bulk_replace_overwrites_every_selected_entry(db_session, movies):
    out = await events(run_replace(movie_spec(), db_session, FakeRequest()))
    assert out[-1]["status"] == "success" and out[-1]["processed"] == 2
    for m in movies:
        db_session.refresh(m)
        assert m.imdb_rating == "bulk"
    assert [r.status for r in logs(db_session, "Replace")] == ["Success"]


@pytest.mark.anyio
async def test_bulk_replace_with_nothing_linked_is_an_info_event(db_session):
    out = await events(run_replace(movie_spec(), db_session, FakeRequest()))
    assert out == [{"status": "info", "message": "No movie entries found to replace", "total": 0, "processed": 0}]


@pytest.mark.anyio
async def test_single_replace_404_and_success(db_session, movies):
    after = []
    spec = movie_spec(single_after=(lambda db: after.append("sync"),))

    missing = await run_replace_single(spec, db_session, str(uuid.uuid4()))
    assert missing["status_code"] == 404

    ok = await run_replace_single(spec, db_session, str(movies[0].system_id))
    assert ok["status"] == "success"
    db_session.refresh(movies[0])
    assert movies[0].imdb_rating == "single"
    assert after == ["sync"]
    assert [r.status for r in logs(db_session, "Replace")] == ["Failed", "Success"]


@pytest.mark.anyio
async def test_single_replace_reports_a_failure_instead_of_raising(db_session, movies):
    def boom(db, e, bulk):
        raise RuntimeError("Tenrai down")

    result = await run_replace_single(movie_spec(replace=boom), db_session, str(movies[0].system_id))
    assert result["status"] == "error" and result["status_code"] == 500
