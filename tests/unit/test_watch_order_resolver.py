"""
Unit tests for the Watch Order entry resolver.

resolve_items turns FK-less (media_type, entry_id) pairs into display data.
No database: the Session and the query chain are stubbed, which also lets the
batching guarantee be asserted directly.
"""

import uuid
from types import SimpleNamespace

import pytest

from app.services.domain.watch_order import (
    MEDIA_TYPE_MODELS,
    VALID_WATCH_ORDER_MEDIA_TYPES,
    resolve_items,
)


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._rows


class FakeSession:
    """
    Records every query() call so tests can assert the number of round trips.
    Returns whichever stub rows were registered for the queried model.
    """

    def __init__(self, rows_by_model=None):
        self.rows_by_model = rows_by_model or {}
        self.queried_models = []

    def query(self, model):
        self.queried_models.append(model)
        return FakeQuery(self.rows_by_model.get(model, []))


def make_item(media_type, entry_id, **overrides):
    data = {
        "system_id": uuid.uuid4(),
        "list_id": uuid.uuid4(),
        "position": 1.0,
        "media_type": media_type,
        "entry_id": entry_id,
        "ep_start": None,
        "ep_end": None,
        "is_optional": False,
        "note": None,
        "created_at": None,
        "updated_at": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def make_anime(entry_id, name="Some Anime", ep_total=12):
    return SimpleNamespace(
        system_id=entry_id,
        display_name=name,
        cover_image_file="cover.jpg",
        franchise_id=uuid.uuid4(),
        watching_status="Completed",
        ep_total=ep_total,
    )


def make_manga(entry_id, name="Some Manga", ch_total=100):
    return SimpleNamespace(
        system_id=entry_id,
        display_name=name,
        cover_image_file="manga.jpg",
        franchise_id=uuid.uuid4(),
        reading_status="Reading",
        ch_total=ch_total,
    )


def make_movie(entry_id, name="Some Movie"):
    return SimpleNamespace(
        system_id=entry_id,
        display_name=name,
        cover_image_file="movie.jpg",
        franchise_id=uuid.uuid4(),
        watching_status="Completed",
    )


class TestMediaTypeMap:
    def test_covers_the_seven_media_types(self):
        assert VALID_WATCH_ORDER_MEDIA_TYPES == {
            "anime",
            "anime-movie",
            "movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        }

    def test_every_slug_maps_to_a_model(self):
        assert all(model is not None for model in MEDIA_TYPE_MODELS.values())


class TestResolveItems:
    def test_empty_input_returns_empty_list(self):
        assert resolve_items(FakeSession(), []) == []

    def test_resolved_item_carries_display_data(self):
        entry_id = uuid.uuid4()
        anime = make_anime(entry_id, name="Fate/Zero")
        db = FakeSession({MEDIA_TYPE_MODELS["anime"]: [anime]})

        result = resolve_items(db, [make_item("anime", entry_id)])[0]

        assert result["missing"] is False
        assert result["display_name"] == "Fate/Zero"
        assert result["cover_image_file"] == "cover.jpg"
        assert result["status"] == "Completed"
        assert result["total_episodes"] == 12

    def test_item_fields_are_preserved(self):
        entry_id = uuid.uuid4()
        db = FakeSession({MEDIA_TYPE_MODELS["anime"]: [make_anime(entry_id)]})
        item = make_item(
            "anime", entry_id, ep_start=1, ep_end=10, is_optional=True, note="skip recap"
        )

        result = resolve_items(db, [item])[0]

        assert result["ep_start"] == 1
        assert result["ep_end"] == 10
        assert result["is_optional"] is True
        assert result["note"] == "skip recap"

    def test_reading_status_is_used_for_manga(self):
        entry_id = uuid.uuid4()
        db = FakeSession({MEDIA_TYPE_MODELS["manga"]: [make_manga(entry_id)]})

        result = resolve_items(db, [make_item("manga", entry_id)])[0]

        assert result["status"] == "Reading"
        assert result["total_episodes"] == 100

    def test_types_without_a_unit_count_report_none(self):
        """Movies have neither episodes nor chapters to range over."""
        entry_id = uuid.uuid4()
        db = FakeSession({MEDIA_TYPE_MODELS["movie"]: [make_movie(entry_id)]})

        result = resolve_items(db, [make_item("movie", entry_id)])[0]

        assert result["total_episodes"] is None
        assert result["status"] == "Completed"

    def test_float_total_is_coerced_to_int(self):
        """novel.ch_total is a Float column; the schema wants an int."""
        entry_id = uuid.uuid4()
        novel = SimpleNamespace(
            system_id=entry_id,
            display_name="Some Novel",
            cover_image_file=None,
            franchise_id=uuid.uuid4(),
            reading_status="Might Read",
            ch_total=120.0,
        )
        db = FakeSession({MEDIA_TYPE_MODELS["novel"]: [novel]})

        result = resolve_items(db, [make_item("novel", entry_id)])[0]

        assert result["total_episodes"] == 120
        assert isinstance(result["total_episodes"], int)

    def test_mixed_media_types_all_resolve(self):
        anime_id, manga_id, movie_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        db = FakeSession(
            {
                MEDIA_TYPE_MODELS["anime"]: [make_anime(anime_id, "A")],
                MEDIA_TYPE_MODELS["manga"]: [make_manga(manga_id, "M")],
                MEDIA_TYPE_MODELS["movie"]: [make_movie(movie_id, "V")],
            }
        )
        items = [
            make_item("anime", anime_id),
            make_item("manga", manga_id),
            make_item("movie", movie_id),
        ]

        names = [r["display_name"] for r in resolve_items(db, items)]

        assert names == ["A", "M", "V"]

    def test_one_query_per_media_type_not_per_item(self):
        """A long guide must not turn into an N+1."""
        anime_ids = [uuid.uuid4() for _ in range(20)]
        db = FakeSession(
            {MEDIA_TYPE_MODELS["anime"]: [make_anime(i) for i in anime_ids]}
        )

        resolve_items(db, [make_item("anime", i) for i in anime_ids])

        assert len(db.queried_models) == 1

    def test_repeated_entry_costs_one_query_and_resolves_every_time(self):
        """The split-run case: the same entry appears at several positions."""
        entry_id = uuid.uuid4()
        db = FakeSession({MEDIA_TYPE_MODELS["anime"]: [make_anime(entry_id, "A")]})
        items = [
            make_item("anime", entry_id, position=1.0, ep_start=1, ep_end=10),
            make_item("anime", entry_id, position=3.0, ep_start=11, ep_end=12),
        ]

        results = resolve_items(db, items)

        assert len(db.queried_models) == 1
        assert [r["display_name"] for r in results] == ["A", "A"]

    def test_order_of_input_is_preserved(self):
        ids = [uuid.uuid4() for _ in range(3)]
        db = FakeSession(
            {
                MEDIA_TYPE_MODELS["anime"]: [
                    make_anime(ids[0], "first"),
                    make_anime(ids[1], "second"),
                    make_anime(ids[2], "third"),
                ]
            }
        )
        items = [make_item("anime", i) for i in ids]

        assert [r["display_name"] for r in resolve_items(db, items)] == [
            "first",
            "second",
            "third",
        ]


class TestMissingEntries:
    def test_deleted_entry_is_flagged_not_dropped(self):
        db = FakeSession({MEDIA_TYPE_MODELS["anime"]: []})

        results = resolve_items(db, [make_item("anime", uuid.uuid4())])

        assert len(results) == 1
        assert results[0]["missing"] is True
        assert results[0]["display_name"] is None

    def test_unknown_media_type_is_flagged_without_querying(self):
        db = FakeSession()

        results = resolve_items(db, [make_item("podcast", uuid.uuid4())])

        assert results[0]["missing"] is True
        assert db.queried_models == []

    def test_null_entry_id_is_flagged_without_querying(self):
        db = FakeSession()

        results = resolve_items(db, [make_item("anime", None)])

        assert results[0]["missing"] is True
        assert db.queried_models == []

    def test_missing_and_present_items_coexist(self):
        present = uuid.uuid4()
        db = FakeSession({MEDIA_TYPE_MODELS["anime"]: [make_anime(present, "here")]})
        items = [make_item("anime", present), make_item("anime", uuid.uuid4())]

        results = resolve_items(db, items)

        assert [r["missing"] for r in results] == [False, True]
        assert results[0]["display_name"] == "here"
