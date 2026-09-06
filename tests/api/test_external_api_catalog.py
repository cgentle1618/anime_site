"""
The external-API coverage catalog and the endpoint that serves it.

The catalog is hand-authored - the fill/overwrite rules live in imperative
code inside app/services/domain/autofill.py and cannot be derived. What CAN
be checked is that it has not drifted away from the things it describes, so
every test below is a drift guard: media keys against PIPELINES, column names
against the model, pipeline flags against the spec, source keys against the
client modules.
"""

import importlib

import pytest
from sqlalchemy import inspect as sa_inspect

from app.services.integrations.catalog import (
    COLUMN_TARGETS,
    EXTERNAL_APIS,
    SERVICES,
    WRITE_RULES,
    catalog_payload,
)
from app.services.pipelines.specs import PIPELINES


def _writes(coverage):
    for block in coverage.sources:
        for write in block.writes:
            yield block, write


# ---------------------------------------------------------------------------
# Catalog integrity
# ---------------------------------------------------------------------------


def test_every_media_key_is_a_real_pipeline():
    for coverage in EXTERNAL_APIS:
        assert coverage.key in PIPELINES, coverage.key


def test_every_pipeline_is_covered():
    """A new media type must not silently miss the page."""
    assert {c.key for c in EXTERNAL_APIS} == set(PIPELINES)


@pytest.mark.parametrize("coverage", EXTERNAL_APIS, ids=lambda c: c.key)
def test_column_writes_name_real_columns(coverage):
    columns = {c.key for c in sa_inspect(PIPELINES[coverage.key].model).columns}
    for _block, write in _writes(coverage):
        if write.target in COLUMN_TARGETS:
            assert write.field in columns, f"{coverage.key}.{write.field}"


@pytest.mark.parametrize("coverage", EXTERNAL_APIS, ids=lambda c: c.key)
def test_keyed_by_names_a_real_column(coverage):
    columns = {c.key for c in sa_inspect(PIPELINES[coverage.key].model).columns}
    assert coverage.keyed_by in columns, coverage.key


@pytest.mark.parametrize("coverage", EXTERNAL_APIS, ids=lambda c: c.key)
def test_every_write_rule_is_declared(coverage):
    for _block, write in _writes(coverage):
        assert write.rule in WRITE_RULES, write.rule


@pytest.mark.parametrize("coverage", EXTERNAL_APIS, ids=lambda c: c.key)
def test_every_source_block_names_a_known_service(coverage):
    for block, _write in _writes(coverage):
        assert block.source in SERVICES, block.source


def test_every_service_client_module_imports():
    for key, service in SERVICES.items():
        assert importlib.import_module(service.module), key


def test_a_multi_source_media_type_declares_how_they_combine():
    movie = next(c for c in EXTERNAL_APIS if c.key == "movie")
    assert len(movie.sources) > 1
    assert movie.combination == "merged"

    novel = next(c for c in EXTERNAL_APIS if c.key == "novel")
    assert novel.combination == "either-or"


# ---------------------------------------------------------------------------
# The flags the page shows must be READ off the spec, never re-typed
# ---------------------------------------------------------------------------


def test_pipeline_flags_are_derived_from_the_spec():
    for entry in catalog_payload()["media"]:
        spec = PIPELINES[entry["key"]]
        assert entry["in_fill_all"] is spec.in_fill_all
        assert entry["has_bulk_replace"] is (spec.replace_select is not None)
        assert entry["fill_only"] is spec.fill_only
        assert entry["budget_limited"] is (spec.budget is not None)
        assert entry["label"] == spec.label


def test_comic_and_game_have_no_bulk_replace():
    by_key = {e["key"]: e for e in catalog_payload()["media"]}
    assert by_key["comic"]["has_bulk_replace"] is False
    assert by_key["game"]["has_bulk_replace"] is False
    assert by_key["studio"]["fill_only"] is True
    assert by_key["comic"]["in_fill_all"] is False


# ---------------------------------------------------------------------------
# The rules themselves - the answer to "what is filled, what is replaced"
# ---------------------------------------------------------------------------


def _rule_for(key, source, field):
    coverage = next(c for c in EXTERNAL_APIS if c.key == key)
    block = next(b for b in coverage.sources if b.source == source)
    return next(w for w in block.writes if w.field == field).rule


def test_mal_ratings_are_the_overwritten_fields():
    assert _rule_for("anime", "tenrai", "mal_rating") == "overwrite"
    assert _rule_for("anime", "tenrai", "mal_rank") == "overwrite"
    assert _rule_for("anime", "tenrai", "release_date") == "fill-only"


def test_imdb_rating_is_overwritten_and_comes_from_omdb():
    assert _rule_for("movie", "omdb", "imdb_rating") == "overwrite"


def test_only_ratings_are_ever_overwritten():
    """The whole overwrite list, so a new one cannot slip in unnoticed."""
    overwritten = {
        write.field
        for coverage in EXTERNAL_APIS
        for _b, write in _writes(coverage)
        if write.rule == "overwrite"
    }
    assert overwritten == {"mal_rating", "mal_rank", "imdb_rating"}


def test_studio_is_fill_only_everywhere():
    studio = next(c for c in EXTERNAL_APIS if c.key == "studio")
    assert all(w.rule != "overwrite" for _b, w in _writes(studio))


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


def test_endpoint_requires_admin(client):
    assert client.get("/api/constants/external-apis").status_code == 401


def test_endpoint_serves_the_catalog(admin_client):
    body = admin_client.get("/api/constants/external-apis").json()
    assert {e["key"] for e in body["media"]} == set(PIPELINES)
    assert body["services"]
    assert body["rules"]


def test_endpoint_payload_is_json_serialisable(admin_client):
    body = admin_client.get("/api/constants/external-apis").json()
    anime = next(e for e in body["media"] if e["key"] == "anime")
    tenrai = next(b for b in anime["sources"] if b["source"] == "tenrai")
    fields = {w["field"]: w["rule"] for w in tenrai["writes"]}
    assert fields["mal_rating"] == "overwrite"
    assert fields["airing_type"] == "fill-only"
