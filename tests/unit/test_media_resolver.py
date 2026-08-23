"""
Unit tests for the shared cross-media-type entry resolver.

resolve_entries turns FK-less (media_type, entry_id) pairs into display data.
No database: the Session and the query chain are stubbed, which also lets the
batching guarantee be asserted directly.
"""

import uuid
from types import SimpleNamespace

from app import models
from app.utils.media_resolver import (
    MEDIA_TABLES,
    MEDIA_TYPE_KEYS,
    entry_ref_for,
    resolve_entries,
)


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._rows


class FakeSession:
    """Records every query() call so tests can assert the number of round trips."""

    def __init__(self, rows_by_model=None):
        self.rows_by_model = rows_by_model or {}
        self.queried_models = []

    def query(self, model):
        self.queried_models.append(model)
        return FakeQuery(self.rows_by_model.get(model, []))


def make_entry(entry_id, name="Some Entry"):
    return SimpleNamespace(
        system_id=entry_id,
        display_name=name,
        cover_image_file="cover.jpg",
        franchise_id=uuid.uuid4(),
    )


class TestMediaTables:
    def test_covers_all_seven_media_types(self):
        assert set(MEDIA_TYPE_KEYS) == {
            "anime",
            "anime-movie",
            "movie",
            "tv-show",
            "cartoon",
            "manga",
            "novel",
        }

    def test_uses_hyphenated_spelling(self):
        # The stored media_type must match watch_order_item's spelling, since
        # both columns hold the same discriminator values.
        assert "anime_movie" not in MEDIA_TABLES
        assert "tv_show" not in MEDIA_TABLES

    def test_nav_path_matches_frontend_routes(self):
        assert MEDIA_TABLES["anime-movie"].nav_path == "/anime-movie"
        assert MEDIA_TABLES["tv-show"].nav_path == "/tv-show"


class TestResolveEntries:
    def test_resolves_display_data(self):
        entry_id = uuid.uuid4()
        entry = make_entry(entry_id, "Cowboy Bebop")
        db = FakeSession({models.Anime: [entry]})

        resolved = resolve_entries(db, [("anime", entry_id)])
        ref = entry_ref_for(resolved, "anime", entry_id)

        assert ref.missing is False
        assert ref.display_name == "Cowboy Bebop"
        assert ref.cover_image_file == "cover.jpg"
        assert ref.nav_path == f"/anime/{entry_id}"

    def test_one_query_per_table_not_per_pair(self):
        ids = [uuid.uuid4() for _ in range(5)]
        db = FakeSession({models.Anime: [make_entry(i) for i in ids]})

        resolve_entries(db, [("anime", i) for i in ids])

        # Five pairs, one table, one round trip.
        assert db.queried_models == [models.Anime]

    def test_queries_only_the_tables_actually_referenced(self):
        anime_id, manga_id = uuid.uuid4(), uuid.uuid4()
        db = FakeSession(
            {
                models.Anime: [make_entry(anime_id)],
                models.Manga: [make_entry(manga_id)],
            }
        )

        resolve_entries(db, [("anime", anime_id), ("manga", manga_id)])

        assert set(db.queried_models) == {models.Anime, models.Manga}
        assert len(db.queried_models) == 2

    def test_deleted_entry_is_missing_not_dropped(self):
        db = FakeSession({models.Anime: []})
        gone = uuid.uuid4()

        resolved = resolve_entries(db, [("anime", gone)])
        ref = entry_ref_for(resolved, "anime", gone)

        assert ref.missing is True
        assert ref.display_name is None
        assert ref.entry_id == gone

    def test_unknown_media_type_is_not_queried(self):
        db = FakeSession()

        resolved = resolve_entries(db, [("bogus-type", uuid.uuid4())])

        assert resolved == {}
        assert db.queried_models == []

    def test_null_pairs_are_skipped(self):
        db = FakeSession()

        resolve_entries(db, [(None, None), ("anime", None), (None, uuid.uuid4())])

        assert db.queried_models == []

    def test_duplicate_pairs_are_deduplicated(self):
        entry_id = uuid.uuid4()
        db = FakeSession({models.Anime: [make_entry(entry_id)]})

        resolve_entries(db, [("anime", entry_id)] * 4)

        assert db.queried_models == [models.Anime]


class TestEntryRefPayload:
    def test_as_dict_matches_the_resolved_schema_fields(self):
        entry_id = uuid.uuid4()
        db = FakeSession({models.Anime: [make_entry(entry_id, "Steins;Gate")]})
        ref = entry_ref_for(resolve_entries(db, [("anime", entry_id)]), "anime", entry_id)

        payload = ref.as_dict()

        # These keys are spread straight into QuoteResolved, so a rename here
        # would silently break the API response shape.
        assert set(payload) == {
            "missing",
            "entry_display_name",
            "cover_image_file",
            "franchise_id",
            "entry_nav_path",
        }
        assert payload["entry_display_name"] == "Steins;Gate"

    def test_missing_ref_still_produces_the_full_payload(self):
        ref = entry_ref_for({}, "anime", uuid.uuid4())
        payload = ref.as_dict()

        assert payload["missing"] is True
        assert payload["entry_display_name"] is None
        assert payload["entry_nav_path"] is None


def test_every_registry_spec_names_a_real_owner_type():
    from app.registry import MEDIA_REGISTRY
    from app.utils.media_resolver import OWNER_TABLES

    for key, spec in MEDIA_REGISTRY.items():
        assert spec.owner_type in OWNER_TABLES, (
            f"{key} declares owner_type {spec.owner_type!r}, which is not an owner"
        )
