"""Unit tests for find_duplicate_game.

Same stub-session shape as test_comic_duplicates: the finder's only database
access is one `db.query(Game).filter(...).all()`.
"""

import uuid

from app.models.game import Game
from app.services.domain.duplicates import find_duplicate_game


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


def _game(**kwargs):
    kwargs.setdefault("system_id", uuid.uuid4())
    kwargs.setdefault("franchise_id", FRANCHISE)
    kwargs.setdefault("series_id", SERIES)
    kwargs.setdefault("game_type", "Base Game")
    return Game(**kwargs)


def _ids(clusters):
    return [sorted(str(row["system_id"]) for row in cluster) for cluster in clusters]


def test_no_duplicates_returns_empty():
    rows = [_game(game_name_en="Hades"), _game(game_name_en="Hollow Knight")]
    assert find_duplicate_game(_StubSession(rows)) == []


def test_shared_name_is_a_duplicate():
    a = _game(game_name_en="Elden Ring")
    b = _game(game_name_en="elden ring")
    clusters = find_duplicate_game(_StubSession([a, b]))
    assert _ids(clusters) == [sorted([str(a.system_id), str(b.system_id)])]


def test_a_dlc_never_collides_with_its_base_game():
    # The reason game_type is part of the key: an expansion shares the
    # franchise and usually the name stem of the game it extends.
    rows = [
        _game(game_name_en="Elden Ring", game_type="Base Game"),
        _game(game_name_en="Elden Ring", game_type="DLC"),
    ]
    assert find_duplicate_game(_StubSession(rows)) == []


def test_different_series_are_not_compared():
    rows = [
        _game(game_name_en="Persona", series_id=uuid.uuid4()),
        _game(game_name_en="Persona", series_id=uuid.uuid4()),
    ]
    assert find_duplicate_game(_StubSession(rows)) == []


def test_cluster_payload_carries_the_game_columns():
    a = _game(game_name_en="Nier", game_name_cn="尼爾")
    b = _game(game_name_en="Nier")
    [cluster] = find_duplicate_game(_StubSession([a, b]))
    row = next(r for r in cluster if r["system_id"] == str(a.system_id))
    assert row["game_name_en"] == "Nier"
    assert row["game_name_cn"] == "尼爾"
    assert row["game_type"] == "Base Game"
    assert row["franchise_id"] == str(FRANCHISE)
    assert row["series_id"] == str(SERIES)
