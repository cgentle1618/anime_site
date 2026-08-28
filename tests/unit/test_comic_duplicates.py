"""Unit tests for find_duplicate_comic.

The function only reads through `db.query(Comic).filter(...).all()`, so a stub
session standing in for that one call keeps these tests off PostgreSQL. The
filter argument is evaluated but never applied — the stub returns whatever list
the test handed it, and every fixture below already sets a franchise_id.
"""

import uuid

from app.models.comic import Comic
from app.services.domain.duplicates import find_duplicate_comic


class _StubQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _StubSession:
    def __init__(self, rows):
        self._rows = rows

    def query(self, _model):
        return _StubQuery(self._rows)


FRANCHISE = uuid.uuid4()
SERIES = uuid.uuid4()


def _comic(**kwargs):
    kwargs.setdefault("system_id", uuid.uuid4())
    kwargs.setdefault("franchise_id", FRANCHISE)
    kwargs.setdefault("series_id", SERIES)
    kwargs.setdefault("is_main_entry", True)
    return Comic(**kwargs)


def _ids(clusters):
    return [sorted(str(row["system_id"]) for row in cluster) for cluster in clusters]


class TestFindDuplicateComic:
    def test_no_duplicates_returns_empty(self):
        rows = [
            _comic(comic_name_en="Amazing Spider-Man"),
            _comic(comic_name_en="Daredevil"),
        ]
        assert find_duplicate_comic(_StubSession(rows)) == []

    def test_shared_name_is_a_duplicate(self):
        a = _comic(comic_name_en="Amazing Spider-Man")
        b = _comic(comic_name_en="amazing spider-man")
        clusters = find_duplicate_comic(_StubSession([a, b]))
        assert _ids(clusters) == [sorted([str(a.system_id), str(b.system_id)])]

    def test_shared_comicvine_id_is_a_duplicate_despite_different_names(self):
        # The arm that matters for comics: Marvel run titles collide, so the
        # volume ID is the conclusive handle.
        a = _comic(comic_name_en="Avengers", comicvine_id=42)
        b = _comic(comic_name_en="Avengers (2018)", comicvine_id=42)
        clusters = find_duplicate_comic(_StubSession([a, b]))
        assert _ids(clusters) == [sorted([str(a.system_id), str(b.system_id)])]

    def test_two_unfilled_volume_ids_are_not_a_match(self):
        # A shared NULL is the absence of evidence, not a match.
        rows = [
            _comic(comic_name_en="Avengers", comicvine_id=None),
            _comic(comic_name_en="Thor", comicvine_id=None),
        ]
        assert find_duplicate_comic(_StubSession(rows)) == []

    def test_different_series_are_not_compared(self):
        rows = [
            _comic(comic_name_en="Avengers", series_id=uuid.uuid4()),
            _comic(comic_name_en="Avengers", series_id=uuid.uuid4()),
        ]
        assert find_duplicate_comic(_StubSession(rows)) == []

    def test_different_is_main_entry_are_not_compared(self):
        rows = [
            _comic(comic_name_en="Avengers", is_main_entry=True),
            _comic(comic_name_en="Avengers", is_main_entry=False),
        ]
        assert find_duplicate_comic(_StubSession(rows)) == []

    def test_transitive_closure_merges_a_chain_into_one_cluster(self):
        # a~b by name, b~c by volume ID. All three are one run.
        a = _comic(comic_name_en="Avengers")
        b = _comic(comic_name_en="Avengers", comicvine_id=7)
        c = _comic(comic_name_en="The Avengers", comicvine_id=7)
        clusters = find_duplicate_comic(_StubSession([a, b, c]))
        assert _ids(clusters) == [
            sorted([str(a.system_id), str(b.system_id), str(c.system_id)])
        ]

    def test_cluster_payload_carries_the_comic_columns(self):
        a = _comic(comic_name_en="Avengers", comic_name_cn="復仇者", comicvine_id=7)
        b = _comic(comic_name_en="Avengers", comicvine_id=7)
        [cluster] = find_duplicate_comic(_StubSession([a, b]))
        row = next(r for r in cluster if r["system_id"] == str(a.system_id))
        assert row["comic_name_en"] == "Avengers"
        assert row["comic_name_cn"] == "復仇者"
        assert row["comicvine_id"] == 7
        assert row["is_main_entry"] is True
        assert row["franchise_id"] == str(FRANCHISE)
        assert row["series_id"] == str(SERIES)

    def test_null_series_id_is_reported_as_none(self):
        a = _comic(comic_name_en="Avengers", series_id=None)
        b = _comic(comic_name_en="Avengers", series_id=None)
        [cluster] = find_duplicate_comic(_StubSession([a, b]))
        assert all(row["series_id"] is None for row in cluster)
