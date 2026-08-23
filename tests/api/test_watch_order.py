"""
API integration tests for /api/watch-order endpoints.

Watch Orders are named, ordered, cross-media-type viewing guides owned by a
Franchise or a Collection.
Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_anime_movie(db_session, sample_franchise):
    m = models.AnimeMovies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_movie_name_en="Test Anime Movie",
        watching_status="Completed",
    )
    db_session.add(m)
    db_session.flush()
    return m


@pytest.fixture
def sample_list(db_session, sample_franchise):
    lst = models.WatchOrderList(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        list_name="Chronological",
        list_type="Chronological",
        is_default=True,
    )
    db_session.add(lst)
    db_session.flush()
    return lst


@pytest.fixture
def sample_items(db_session, sample_list, sample_anime, sample_anime_movie):
    """A three-step split run: anime ep 1-10 -> movie -> anime ep 11-12."""
    items = [
        models.WatchOrderItem(
            system_id=uuid.uuid4(),
            list_id=sample_list.system_id,
            position=1.0,
            media_type="anime",
            entry_id=sample_anime.system_id,
            ep_start=1,
            ep_end=10,
        ),
        models.WatchOrderItem(
            system_id=uuid.uuid4(),
            list_id=sample_list.system_id,
            position=2.0,
            media_type="anime-movie",
            entry_id=sample_anime_movie.system_id,
            importance="Optional",
            note="Optional side story",
        ),
        models.WatchOrderItem(
            system_id=uuid.uuid4(),
            list_id=sample_list.system_id,
            position=3.0,
            media_type="anime",
            entry_id=sample_anime.system_id,
            ep_start=11,
            ep_end=12,
        ),
    ]
    db_session.add_all(items)
    db_session.flush()
    return items


@pytest.fixture
def orderable_franchise(db_session, sample_franchise, sample_anime):
    """
    sample_franchise plus a second entry. A release order is refused below two
    entries, so every test that creates one needs this rather than a lone anime.
    """
    db_session.add(
        models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Second Entry",
            airing_type="TV",
            watching_status="Might Watch",
            release_year="2005",
        )
    )
    db_session.flush()
    return sample_franchise


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


class TestGetWatchOrderLists:
    def test_returns_200_and_list(self, client, sample_list):
        response = client.get("/api/watch-order/lists")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_created_list_appears(self, client, sample_list):
        ids = [row["system_id"] for row in client.get("/api/watch-order/lists").json()]
        assert str(sample_list.system_id) in ids

    def test_franchise_filter_matches(self, client, sample_list, sample_franchise):
        response = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        )
        assert len(response.json()) == 1

    def test_franchise_filter_excludes_other_owners(self, client, sample_list):
        response = client.get(f"/api/watch-order/lists?franchise_id={uuid.uuid4()}")
        assert response.json() == []

    def test_item_count_is_reported(self, client, sample_list, sample_items):
        response = client.get("/api/watch-order/lists")
        row = next(
            r for r in response.json() if r["system_id"] == str(sample_list.system_id)
        )
        assert row["item_count"] == 3


class TestGetWatchOrderDetail:
    def test_nonexistent_id_returns_404(self, client):
        assert client.get(f"/api/watch-order/lists/{uuid.uuid4()}").status_code == 404

    def test_items_come_back_in_position_order(self, client, sample_list, sample_items):
        data = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()
        assert [i["position"] for i in data["items"]] == [1.0, 2.0, 3.0]

    def test_items_are_resolved_to_display_data(
        self, client, sample_list, sample_items, sample_anime
    ):
        data = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()
        first = data["items"][0]
        assert first["missing"] is False
        assert first["display_name"] == "Test Anime"
        assert first["status"] == "Completed"
        assert first["total_episodes"] == 12

    def test_same_entry_can_appear_twice_with_different_ranges(
        self, client, sample_list, sample_items, sample_anime
    ):
        """The split-run case: A ep 1-10 -> B -> A ep 11-12."""
        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        anime_steps = [i for i in items if i["entry_id"] == str(sample_anime.system_id)]
        assert len(anime_steps) == 2
        assert (anime_steps[0]["ep_start"], anime_steps[0]["ep_end"]) == (1, 10)
        assert (anime_steps[1]["ep_start"], anime_steps[1]["ep_end"]) == (11, 12)

    def test_ep_special_is_resolved_onto_the_step(
        self, client, db_session, sample_franchise, sample_list
    ):
        """ep_special 0 is a real episode number, not an absent value."""
        anime = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Episode Zero",
            airing_type="Special",
            watching_status="Completed",
            ep_special=0,
        )
        db_session.add(anime)
        db_session.flush()
        db_session.add(
            models.WatchOrderItem(
                system_id=uuid.uuid4(),
                list_id=sample_list.system_id,
                position=1.0,
                media_type="anime",
                entry_id=anime.system_id,
            )
        )
        db_session.flush()

        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        assert items[0]["ep_special"] == 0

    def test_importance_and_note_survive(self, client, sample_list, sample_items):
        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        assert items[1]["importance"] == "Optional"
        assert items[1]["note"] == "Optional side story"
        # An unmarked step reads back as Normal, not as null.
        assert items[0]["importance"] == "Normal"

    def test_dangling_entry_is_flagged_not_dropped(
        self, client, db_session, sample_list
    ):
        db_session.add(
            models.WatchOrderItem(
                system_id=uuid.uuid4(),
                list_id=sample_list.system_id,
                position=1.0,
                media_type="anime",
                entry_id=uuid.uuid4(),
            )
        )
        db_session.flush()

        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        assert len(items) == 1
        assert items[0]["missing"] is True
        assert items[0]["display_name"] is None


class TestMediaScope:
    """
    media_types says whether an order is single-type or cross-type. Derived
    from the items, never stored, so it cannot fall out of step with them.
    """

    def test_empty_order_has_no_types(self, client, sample_list):
        rows = client.get("/api/watch-order/lists").json()
        assert rows[0]["media_types"] == []

    def test_single_type_order(self, client, db_session, sample_list, sample_anime):
        db_session.add_all(
            [
                models.WatchOrderItem(
                    system_id=uuid.uuid4(),
                    list_id=sample_list.system_id,
                    position=float(i),
                    media_type="anime",
                    entry_id=sample_anime.system_id,
                )
                for i in (1, 2)
            ]
        )
        db_session.flush()

        rows = client.get("/api/watch-order/lists").json()
        assert rows[0]["media_types"] == ["anime"]
        assert rows[0]["item_count"] == 2

    def test_cross_type_order(self, client, sample_list, sample_items):
        """sample_items mixes anime and anime-movie."""
        rows = client.get("/api/watch-order/lists").json()
        assert rows[0]["media_types"] == ["anime", "anime-movie"]

    def test_order_is_canonical_not_insertion_order(
        self, client, db_session, sample_list, sample_anime, sample_anime_movie
    ):
        """The movie is added first, but anime still leads the list."""
        db_session.add_all(
            [
                models.WatchOrderItem(
                    system_id=uuid.uuid4(),
                    list_id=sample_list.system_id,
                    position=1.0,
                    media_type="anime-movie",
                    entry_id=sample_anime_movie.system_id,
                ),
                models.WatchOrderItem(
                    system_id=uuid.uuid4(),
                    list_id=sample_list.system_id,
                    position=2.0,
                    media_type="anime",
                    entry_id=sample_anime.system_id,
                ),
            ]
        )
        db_session.flush()

        rows = client.get("/api/watch-order/lists").json()
        assert rows[0]["media_types"] == ["anime", "anime-movie"]

    def test_detail_endpoint_agrees_with_the_listing(
        self, client, sample_list, sample_items
    ):
        listed = client.get("/api/watch-order/lists").json()[0]
        detail = client.get(
            f"/api/watch-order/lists/{sample_list.system_id}"
        ).json()
        assert detail["media_types"] == listed["media_types"]
        assert detail["item_count"] == listed["item_count"]

    def test_removing_the_last_item_of_a_type_narrows_the_scope(
        self, admin_client, sample_list, sample_items
    ):
        movie_step = next(i for i in sample_items if i.media_type == "anime-movie")
        admin_client.delete(f"/api/watch-order/items/{movie_step.system_id}")

        rows = admin_client.get("/api/watch-order/lists").json()
        assert rows[0]["media_types"] == ["anime"]


class TestReleaseOrder:
    """
    A generated release order stores the list row but not its steps: they are
    computed from release dates on every read, so entries added later appear on
    their own and nothing may be written against them.
    """

    def _create(self, admin_client, franchise):
        return admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={franchise.system_id}"
        ).json()

    def test_created_list_is_marked_generated(self, admin_client, orderable_franchise):
        data = self._create(admin_client, orderable_franchise)
        assert data["auto_source"] == "release"
        assert data["list_type"] == "Release"

    def test_creation_is_idempotent(self, admin_client, orderable_franchise):
        first = self._create(admin_client, orderable_franchise)
        second = self._create(admin_client, orderable_franchise)
        assert first["system_id"] == second["system_id"]

    def test_guest_cannot_create(self, client, sample_franchise):
        response = client.post(
            f"/api/watch-order/lists/release?franchise_id={sample_franchise.system_id}"
        )
        assert response.status_code == 401

    def test_steps_are_generated_without_stored_items(
        self, admin_client, db_session, orderable_franchise
    ):
        created = self._create(admin_client, orderable_franchise)
        detail = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()

        assert detail["item_count"] >= 1
        assert any(i["display_name"] == "Test Anime" for i in detail["items"])
        # Nothing was written to the item table.
        assert (
            db_session.query(models.WatchOrderItem)
            .filter(models.WatchOrderItem.list_id == created["system_id"])
            .count()
            == 0
        )

    def test_a_later_entry_appears_on_its_own(
        self, admin_client, db_session, orderable_franchise
    ):
        created = self._create(admin_client, orderable_franchise)
        before = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()["item_count"]

        db_session.add(
            models.Anime(
                system_id=uuid.uuid4(),
                franchise_id=orderable_franchise.system_id,
                anime_name_en="Added Later",
                airing_type="TV",
                watching_status="Might Watch",
                release_year="2030",
            )
        )
        db_session.flush()

        after = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()
        assert after["item_count"] == before + 1
        assert any(i["display_name"] == "Added Later" for i in after["items"])

    def test_steps_are_ordered_by_release_date(
        self, admin_client, db_session, sample_franchise
    ):
        for name, year, month in [
            ("Third", "2020", "MAR"),
            ("First", "2001", "JAN"),
            ("Second", "2020", "JAN"),
        ]:
            db_session.add(
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    anime_name_en=name,
                    airing_type="TV",
                    watching_status="Might Watch",
                    release_year=year,
                    release_month=month,
                )
            )
        db_session.flush()

        created = self._create(admin_client, sample_franchise)
        items = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()["items"]
        assert [i["display_name"] for i in items] == ["First", "Second", "Third"]

    def test_undated_entries_sink_to_the_bottom(
        self, admin_client, db_session, sample_franchise
    ):
        db_session.add_all(
            [
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    anime_name_en="No date",
                    airing_type="TV",
                    watching_status="Might Watch",
                ),
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    anime_name_en="Dated",
                    airing_type="TV",
                    watching_status="Might Watch",
                    release_year="1999",
                ),
            ]
        )
        db_session.flush()

        created = self._create(admin_client, sample_franchise)
        names = [
            i["display_name"]
            for i in admin_client.get(
                f"/api/watch-order/lists/{created['system_id']}"
            ).json()["items"]
        ]
        assert names.index("Dated") < names.index("No date")

    def test_listing_reports_the_generated_step_count(
        self, admin_client, client, orderable_franchise
    ):
        """
        Regression: the listing counted stored items, so a generated list showed
        "0 steps" in the selector while its steps rendered fine below.
        """
        created = self._create(admin_client, orderable_franchise)
        detail = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()

        listed = next(
            r
            for r in client.get("/api/watch-order/lists").json()
            if r["system_id"] == created["system_id"]
        )
        assert listed["item_count"] == detail["item_count"]
        assert listed["item_count"] > 0
        assert listed["media_types"] == detail["media_types"]

    def test_create_response_already_reports_the_count(
        self, admin_client, orderable_franchise
    ):
        created = self._create(admin_client, orderable_franchise)
        assert created["item_count"] > 0
        assert created["media_types"] == ["anime"]

    def test_positions_are_renumbered_from_one(
        self, admin_client, orderable_franchise
    ):
        created = self._create(admin_client, orderable_franchise)
        items = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()["items"]
        assert [i["position"] for i in items] == [
            float(n) for n in range(1, len(items) + 1)
        ]


class TestGeneratedListIsReadOnly:
    """Steps are generated, so every item write must be refused."""

    @pytest.fixture
    def release_list(self, admin_client, orderable_franchise):
        return admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={orderable_franchise.system_id}"
        ).json()

    def test_cannot_add_a_step(self, admin_client, release_list, sample_anime):
        response = admin_client.post(
            f"/api/watch-order/lists/{release_list['system_id']}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code == 400

    def test_cannot_reorder(self, admin_client, release_list):
        response = admin_client.put(
            f"/api/watch-order/lists/{release_list['system_id']}/reorder",
            json={"item_ids": []},
        )
        assert response.status_code == 400

    def test_note_and_flags_remain_editable(self, admin_client, release_list):
        """These are what the admin actually edits; only steps are off limits."""
        response = admin_client.patch(
            f"/api/watch-order/lists/{release_list['system_id']}",
            json={"remark": "the canonical order", "is_most_recommended": True},
        )
        assert response.status_code == 200
        assert response.json()["remark"] == "the canonical order"
        assert response.json()["is_most_recommended"] is True

    def test_can_be_deleted(self, admin_client, release_list):
        response = admin_client.delete(
            f"/api/watch-order/lists/{release_list['system_id']}"
        )
        assert response.status_code == 200


class TestAutoFilter:
    """Generated lists must not bury hand-built ones in cross-owner views."""

    @pytest.fixture
    def both(self, admin_client, orderable_franchise, sample_list):
        admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={orderable_franchise.system_id}"
        )
        return True

    def test_default_returns_both(self, client, both):
        assert len(client.get("/api/watch-order/lists").json()) == 2

    def test_exclude_hides_generated(self, client, both):
        rows = client.get("/api/watch-order/lists?auto=exclude").json()
        assert [r["auto_source"] for r in rows] == [None]

    def test_only_shows_generated(self, client, both):
        rows = client.get("/api/watch-order/lists?auto=only").json()
        assert [r["auto_source"] for r in rows] == ["release"]


class TestSingleWorkFranchisesGetNoOrder:
    """
    A franchise holding one work - a single movie, TV series or novel - has
    nothing to order, so it is refused rather than given an order of one step.
    """

    def test_single_entry_franchise_is_refused(
        self, admin_client, sample_franchise, sample_anime
    ):
        response = admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={sample_franchise.system_id}"
        )
        assert response.status_code == 400
        assert "at least" in response.json()["detail"]

    def test_empty_franchise_is_refused(self, admin_client, db_session):
        bare = models.Franchise(
            system_id=uuid.uuid4(),
            franchise_type="Movie",
            franchise_name_en="Standalone Movie",
        )
        db_session.add(bare)
        db_session.flush()

        response = admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={bare.system_id}"
        )
        assert response.status_code == 400

    def test_two_entries_are_enough(self, admin_client, orderable_franchise):
        response = admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={orderable_franchise.system_id}"
        )
        assert response.status_code in (200, 201)

    def test_backfill_skips_them_and_reports_it(
        self, admin_client, sample_franchise, sample_anime
    ):
        data = admin_client.post("/api/watch-order/lists/release/backfill").json()
        assert data["skipped_too_small"] >= 1

    def test_backfill_creates_for_big_enough_owners(
        self, admin_client, client, orderable_franchise
    ):
        admin_client.post("/api/watch-order/lists/release/backfill")
        rows = client.get("/api/watch-order/lists?auto=only").json()
        assert any(
            r["franchise_id"] == str(orderable_franchise.system_id) for r in rows
        )

    def test_backfill_is_repeatable(self, admin_client, orderable_franchise):
        first = admin_client.post("/api/watch-order/lists/release/backfill").json()
        second = admin_client.post("/api/watch-order/lists/release/backfill").json()
        assert first["created"] >= 1
        assert second["created"] == 0


class TestAnimeOnlyBuiltIn:
    """The anime-only variant sits alongside the cross-type one."""

    @pytest.fixture
    def mixed_franchise(self, db_session, sample_franchise, sample_anime):
        """Two anime and a manga, so the two kinds differ in size."""
        db_session.add_all(
            [
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    anime_name_en="Second Anime",
                    airing_type="TV",
                    watching_status="Might Watch",
                    release_year="2005",
                ),
                models.Manga(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    manga_name_en="A Manga",
                    reading_status="Might Read",
                    release_year="2003",
                ),
            ]
        )
        db_session.flush()
        return sample_franchise

    def test_both_kinds_can_coexist(self, admin_client, mixed_franchise):
        cross = admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={mixed_franchise.system_id}"
        ).json()
        anime = admin_client.post(
            "/api/watch-order/lists/release"
            f"?franchise_id={mixed_franchise.system_id}&anime_only=true"
        ).json()

        assert cross["system_id"] != anime["system_id"]
        assert cross["auto_source"] == "release"
        assert anime["auto_source"] == "release-anime"

    def test_anime_only_excludes_other_types(self, admin_client, mixed_franchise):
        created = admin_client.post(
            "/api/watch-order/lists/release"
            f"?franchise_id={mixed_franchise.system_id}&anime_only=true"
        ).json()
        detail = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()

        assert detail["media_types"] == ["anime"]
        assert {i["media_type"] for i in detail["items"]} == {"anime"}

    def test_cross_type_keeps_everything(self, admin_client, mixed_franchise):
        created = admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={mixed_franchise.system_id}"
        ).json()
        detail = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()
        assert set(detail["media_types"]) == {"anime", "manga"}

    def test_listing_counts_each_kind_separately(
        self, admin_client, client, mixed_franchise
    ):
        admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={mixed_franchise.system_id}"
        )
        admin_client.post(
            "/api/watch-order/lists/release"
            f"?franchise_id={mixed_franchise.system_id}&anime_only=true"
        )
        rows = client.get("/api/watch-order/lists?auto=only").json()
        by_source = {r["auto_source"]: r for r in rows}
        assert by_source["release"]["item_count"] == 3
        assert by_source["release-anime"]["item_count"] == 2

    def test_anime_only_refused_without_enough_anime(
        self, admin_client, db_session, sample_franchise, sample_anime
    ):
        """One anime plus two manga is enough cross-type, not anime-only."""
        db_session.add_all(
            [
                models.Manga(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    manga_name_en=f"Manga {n}",
                    reading_status="Might Read",
                )
                for n in (1, 2)
            ]
        )
        db_session.flush()

        assert (
            admin_client.post(
                f"/api/watch-order/lists/release?franchise_id={sample_franchise.system_id}"
            ).status_code
            in (200, 201)
        )
        assert (
            admin_client.post(
                "/api/watch-order/lists/release"
                f"?franchise_id={sample_franchise.system_id}&anime_only=true"
            ).status_code
            == 400
        )


class TestSeriesOwnedBuiltIn:
    """Series are the middle tier and get built-in orders of their own."""

    @pytest.fixture
    def stocked_series(self, db_session, sample_franchise, sample_series):
        db_session.add_all(
            [
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    series_id=sample_series.system_id,
                    anime_name_en=f"Series Anime {n}",
                    airing_type="TV",
                    watching_status="Might Watch",
                    release_year=year,
                )
                for n, year in ((1, "2010"), (2, "2012"))
            ]
        )
        db_session.flush()
        return sample_series

    def test_series_can_own_an_order(self, admin_client, stocked_series):
        created = admin_client.post(
            f"/api/watch-order/lists/release?series_id={stocked_series.system_id}"
        ).json()
        assert created["series_id"] == str(stocked_series.system_id)
        assert created["franchise_id"] is None
        assert created["collection_id"] is None

    def test_steps_are_scoped_to_the_series(
        self, admin_client, db_session, sample_franchise, stocked_series
    ):
        """An entry in the same franchise but no series must not appear."""
        db_session.add(
            models.Anime(
                system_id=uuid.uuid4(),
                franchise_id=sample_franchise.system_id,
                anime_name_en="Outside The Series",
                airing_type="TV",
                watching_status="Might Watch",
                release_year="2011",
            )
        )
        db_session.flush()

        created = admin_client.post(
            f"/api/watch-order/lists/release?series_id={stocked_series.system_id}"
        ).json()
        detail = admin_client.get(
            f"/api/watch-order/lists/{created['system_id']}"
        ).json()

        names = [i["display_name"] for i in detail["items"]]
        assert "Outside The Series" not in names
        assert len(names) == 2

    def test_listing_filters_by_series(self, admin_client, client, stocked_series):
        admin_client.post(
            f"/api/watch-order/lists/release?series_id={stocked_series.system_id}"
        )
        rows = client.get(
            f"/api/watch-order/lists?series_id={stocked_series.system_id}"
        ).json()
        assert len(rows) == 1

    def test_two_owners_still_rejected(
        self, admin_client, sample_franchise, stocked_series
    ):
        response = admin_client.post(
            "/api/watch-order/lists/release"
            f"?franchise_id={sample_franchise.system_id}"
            f"&series_id={stocked_series.system_id}"
        )
        assert response.status_code == 400

    def test_series_anime_only_variant(self, admin_client, stocked_series):
        created = admin_client.post(
            "/api/watch-order/lists/release"
            f"?series_id={stocked_series.system_id}&anime_only=true"
        ).json()
        assert created["auto_source"] == "release-anime"
        assert created["item_count"] == 2


class TestCollectionOptOut:
    """A collection can opt its members out of built-in orders entirely."""

    @pytest.fixture
    def opted_out(self, db_session, sample_collection, sample_collected_franchise):
        sample_collection.no_built_in_orders = True
        db_session.add_all(
            [
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_collected_franchise.system_id,
                    anime_name_en=f"Disney-ish {n}",
                    airing_type="TV",
                    watching_status="Might Watch",
                    release_year="200%d" % n,
                )
                for n in (1, 2)
            ]
        )
        db_session.flush()
        return sample_collected_franchise

    def test_member_franchise_is_refused(self, admin_client, opted_out):
        response = admin_client.post(
            f"/api/watch-order/lists/release?franchise_id={opted_out.system_id}"
        )
        assert response.status_code == 400
        assert "opts out" in response.json()["detail"]

    def test_backfill_skips_and_reports_them(self, admin_client, opted_out):
        data = admin_client.post("/api/watch-order/lists/release/backfill").json()
        assert data["skipped_opted_out"] >= 1

    def test_backfill_creates_nothing_for_that_franchise(
        self, admin_client, client, opted_out
    ):
        admin_client.post("/api/watch-order/lists/release/backfill")
        rows = client.get("/api/watch-order/lists?auto=only").json()
        assert all(r["franchise_id"] != str(opted_out.system_id) for r in rows)

    def test_a_normal_collection_still_gets_one(
        self, admin_client, client, db_session, sample_collection,
        sample_collected_franchise,
    ):
        sample_collection.no_built_in_orders = False
        db_session.add_all(
            [
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_collected_franchise.system_id,
                    anime_name_en=f"Fine {n}",
                    airing_type="TV",
                    watching_status="Might Watch",
                )
                for n in (1, 2)
            ]
        )
        db_session.flush()

        admin_client.post("/api/watch-order/lists/release/backfill")
        rows = client.get("/api/watch-order/lists?auto=only").json()
        assert any(r["collection_id"] == str(sample_collection.system_id) for r in rows)


class TestCandidates:
    def test_franchise_candidates_span_media_types(
        self, client, sample_franchise, sample_anime, sample_anime_movie
    ):
        data = client.get(
            f"/api/watch-order/candidates?franchise_id={sample_franchise.system_id}"
        ).json()
        by_type = {c["media_type"] for c in data}
        assert {"anime", "anime-movie"} <= by_type
        assert any(c["display_name"] == "Test Anime" for c in data)

    def test_collection_candidates_come_from_member_franchises(
        self, client, db_session, sample_collection, sample_collected_franchise
    ):
        db_session.add(
            models.Anime(
                system_id=uuid.uuid4(),
                franchise_id=sample_collected_franchise.system_id,
                anime_name_en="Collected Anime",
                airing_type="TV",
                watching_status="Completed",
            )
        )
        db_session.flush()

        data = client.get(
            f"/api/watch-order/candidates?collection_id={sample_collection.system_id}"
        ).json()
        assert [c["display_name"] for c in data] == ["Collected Anime"]

    def test_candidate_carries_the_fields_a_row_needs(
        self, client, sample_franchise, sample_anime
    ):
        """
        The editor appends a picked candidate straight into its local list, so
        the payload must match the resolver's shape - a missing field would
        render the new row blank until a reload.
        """
        data = client.get(
            f"/api/watch-order/candidates?franchise_id={sample_franchise.system_id}"
        ).json()
        anime = next(c for c in data if c["media_type"] == "anime")
        assert anime["display_name"] == "Test Anime"
        assert anime["status"] == "Completed"
        assert anime["total_episodes"] == 12
        assert anime["franchise_id"] == str(sample_franchise.system_id)

    def test_candidate_carries_ep_special(
        self, client, db_session, sample_franchise
    ):
        db_session.add(
            models.Anime(
                system_id=uuid.uuid4(),
                franchise_id=sample_franchise.system_id,
                anime_name_en="Special Episode",
                airing_type="Special",
                watching_status="Completed",
                ep_special=14.5,
            )
        )
        db_session.flush()

        data = client.get(
            f"/api/watch-order/candidates?franchise_id={sample_franchise.system_id}"
        ).json()
        special = next(c for c in data if c["display_name"] == "Special Episode")
        assert special["ep_special"] == 14.5

    def test_candidates_exclude_other_franchises(
        self, client, sample_anime, sample_franchise
    ):
        data = client.get(
            f"/api/watch-order/candidates?franchise_id={uuid.uuid4()}"
        ).json()
        assert data == []

    def test_no_owner_is_rejected(self, client):
        assert client.get("/api/watch-order/candidates").status_code == 400

    def test_two_owners_are_rejected(
        self, client, sample_franchise, sample_collection
    ):
        response = client.get(
            "/api/watch-order/candidates"
            f"?franchise_id={sample_franchise.system_id}"
            f"&collection_id={sample_collection.system_id}"
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# List writes
# ---------------------------------------------------------------------------


class TestCreateWatchOrderList:
    def test_admin_can_create(self, admin_client, sample_franchise):
        response = admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "Release Order",
            },
        )
        assert response.status_code in (200, 201)
        assert response.json()["list_name"] == "Release Order"

    def test_guest_cannot_create(self, client, sample_franchise):
        response = client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "Nope",
            },
        )
        assert response.status_code == 401

    def test_collection_owned_list_is_allowed(self, admin_client, sample_collection):
        response = admin_client.post(
            "/api/watch-order/lists",
            json={
                "collection_id": str(sample_collection.system_id),
                "list_name": "Full Chronology",
            },
        )
        assert response.status_code in (200, 201)

    def test_no_owner_is_rejected(self, admin_client):
        response = admin_client.post(
            "/api/watch-order/lists", json={"list_name": "Ownerless"}
        )
        assert response.status_code == 400

    def test_two_owners_is_rejected(
        self, admin_client, sample_franchise, sample_collection
    ):
        response = admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "collection_id": str(sample_collection.system_id),
                "list_name": "Both",
            },
        )
        assert response.status_code == 400

    def test_type_chosen_at_creation_is_kept(self, admin_client, sample_franchise):
        """The create form now picks the type up front, not only the editor."""
        data = admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "By release",
                "list_type": "Release",
            },
        ).json()
        assert data["list_type"] == "Release"

    def test_type_defaults_to_custom(self, admin_client, sample_franchise):
        data = admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "No type given",
            },
        ).json()
        assert data["list_type"] == "Custom"

    def test_create_persists_every_field(self, admin_client, sample_franchise):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "list_name": "Everything",
            "list_type": "Recommended",
            "is_default": True,
            "sort_index": 2.5,
            "remark": "start here",
        }
        data = admin_client.post("/api/watch-order/lists", json=payload).json()
        for key, expected in payload.items():
            assert data[key] == expected

    def test_new_default_clears_the_previous_default(
        self, admin_client, client, sample_list, sample_franchise
    ):
        """Only one list per owner may be the default."""
        admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "New Default",
                "is_default": True,
            },
        )
        rows = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        ).json()
        assert [r["is_default"] for r in rows].count(True) == 1


class TestMostRecommended:
    """
    Independent of is_default: several orders can be recommended, and this
    marks the single one to follow.
    """

    def _make(self, admin_client, franchise, name, **flags):
        return admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(franchise.system_id),
                "list_name": name,
                **flags,
            },
        ).json()

    def test_flag_persists(self, admin_client, sample_franchise):
        data = self._make(
            admin_client, sample_franchise, "Chrono", is_most_recommended=True
        )
        assert data["is_most_recommended"] is True

    def test_defaults_to_false(self, admin_client, sample_franchise):
        data = self._make(admin_client, sample_franchise, "Plain")
        assert data["is_most_recommended"] is False

    def test_only_one_per_owner(self, admin_client, client, sample_franchise):
        self._make(admin_client, sample_franchise, "First", is_most_recommended=True)
        self._make(admin_client, sample_franchise, "Second", is_most_recommended=True)

        rows = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        ).json()
        winners = [r for r in rows if r["is_most_recommended"]]
        assert len(winners) == 1
        assert winners[0]["list_name"] == "Second"

    def test_another_owner_keeps_its_own(
        self, admin_client, client, sample_franchise, sample_collection
    ):
        """The rule is per owner, not global."""
        self._make(admin_client, sample_franchise, "Franchise one", is_most_recommended=True)
        admin_client.post(
            "/api/watch-order/lists",
            json={
                "collection_id": str(sample_collection.system_id),
                "list_name": "Collection one",
                "is_most_recommended": True,
            },
        )
        rows = client.get("/api/watch-order/lists").json()
        assert len([r for r in rows if r["is_most_recommended"]]) == 2

    def test_independent_of_is_default(
        self, admin_client, client, sample_franchise
    ):
        """Release opens first while Chronological is the endorsed one."""
        self._make(admin_client, sample_franchise, "Release", is_default=True)
        self._make(
            admin_client, sample_franchise, "Chronological", is_most_recommended=True
        )

        rows = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        ).json()
        by_name = {r["list_name"]: r for r in rows}
        assert by_name["Release"]["is_default"] is True
        assert by_name["Release"]["is_most_recommended"] is False
        assert by_name["Chronological"]["is_most_recommended"] is True
        assert by_name["Chronological"]["is_default"] is False

    def test_most_recommended_sorts_ahead_of_default(
        self, admin_client, client, sample_franchise
    ):
        self._make(admin_client, sample_franchise, "Release", is_default=True)
        self._make(
            admin_client, sample_franchise, "Chronological", is_most_recommended=True
        )

        rows = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        ).json()
        assert rows[0]["list_name"] == "Chronological"

    def test_patch_can_move_the_flag(
        self, admin_client, client, sample_franchise
    ):
        first = self._make(
            admin_client, sample_franchise, "First", is_most_recommended=True
        )
        second = self._make(admin_client, sample_franchise, "Second")

        admin_client.patch(
            f"/api/watch-order/lists/{second['system_id']}",
            json={"is_most_recommended": True},
        )

        rows = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        ).json()
        by_id = {r["system_id"]: r for r in rows}
        assert by_id[second["system_id"]]["is_most_recommended"] is True
        assert by_id[first["system_id"]]["is_most_recommended"] is False


class TestUpdateWatchOrderList:
    def test_admin_can_patch(self, admin_client, sample_list):
        response = admin_client.patch(
            f"/api/watch-order/lists/{sample_list.system_id}",
            json={"remark": "watch the movie last"},
        )
        assert response.status_code == 200
        assert response.json()["remark"] == "watch the movie last"

    def test_guest_cannot_patch(self, client, sample_list):
        response = client.patch(
            f"/api/watch-order/lists/{sample_list.system_id}", json={"remark": "no"}
        )
        assert response.status_code == 401

    def test_put_updates_name(self, admin_client, sample_list, sample_franchise):
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "Renamed",
            },
        )
        assert response.json()["list_name"] == "Renamed"

    def test_nonexistent_returns_404(self, admin_client):
        response = admin_client.patch(
            f"/api/watch-order/lists/{uuid.uuid4()}", json={"remark": "x"}
        )
        assert response.status_code == 404


class TestDeleteWatchOrderList:
    def test_admin_can_delete(self, admin_client, sample_list):
        response = admin_client.delete(
            f"/api/watch-order/lists/{sample_list.system_id}"
        )
        assert response.status_code == 200

    def test_guest_cannot_delete(self, client, sample_list):
        assert (
            client.delete(f"/api/watch-order/lists/{sample_list.system_id}").status_code
            == 401
        )

    def test_delete_cascades_to_items(
        self, admin_client, db_session, sample_list, sample_items
    ):
        admin_client.delete(f"/api/watch-order/lists/{sample_list.system_id}")
        remaining = (
            db_session.query(models.WatchOrderItem)
            .filter(models.WatchOrderItem.list_id == sample_list.system_id)
            .count()
        )
        assert remaining == 0

    def test_delete_leaves_the_media_entry_alone(
        self, admin_client, db_session, sample_list, sample_items, sample_anime
    ):
        admin_client.delete(f"/api/watch-order/lists/{sample_list.system_id}")
        assert (
            db_session.query(models.Anime)
            .filter(models.Anime.system_id == sample_anime.system_id)
            .first()
            is not None
        )


# ---------------------------------------------------------------------------
# Item writes
# ---------------------------------------------------------------------------


class TestCreateWatchOrderItem:
    def test_admin_can_add_item(self, admin_client, sample_list, sample_anime):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code in (200, 201)
        assert response.json()["media_type"] == "anime"

    def test_guest_cannot_add_item(self, client, sample_list, sample_anime):
        response = client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code == 401

    def test_item_appends_past_the_highest_position(
        self, admin_client, sample_list, sample_items, sample_anime
    ):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.json()["position"] == 4.0

    def test_explicit_position_slots_between_items(
        self, admin_client, sample_list, sample_items, sample_anime
    ):
        """Float positions let an item be inserted without renumbering."""
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={
                "media_type": "anime",
                "entry_id": str(sample_anime.system_id),
                "position": 1.5,
            },
        )
        assert response.json()["position"] == 1.5

    def test_unknown_media_type_is_rejected(
        self, admin_client, sample_list, sample_anime
    ):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "podcast", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code == 400

    def test_nonexistent_entry_is_rejected(self, admin_client, sample_list):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(uuid.uuid4())},
        )
        assert response.status_code == 400

    def test_unknown_list_returns_404(self, admin_client, sample_anime):
        response = admin_client.post(
            f"/api/watch-order/lists/{uuid.uuid4()}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code == 404


class TestUpdateWatchOrderItem:
    def test_patch_updates_episode_range(self, admin_client, sample_items):
        item = sample_items[0]
        response = admin_client.patch(
            f"/api/watch-order/items/{item.system_id}",
            json={"ep_start": 1, "ep_end": 8},
        )
        assert response.status_code == 200
        assert (response.json()["ep_start"], response.json()["ep_end"]) == (1, 8)

    def test_patch_sets_importance(self, admin_client, sample_items):
        response = admin_client.patch(
            f"/api/watch-order/items/{sample_items[0].system_id}",
            json={"importance": "Essential"},
        )
        assert response.json()["importance"] == "Essential"

    def test_patch_rejects_unknown_importance(self, admin_client, sample_items):
        """The API refuses junk where the Sheets parser would coerce it."""
        response = admin_client.patch(
            f"/api/watch-order/items/{sample_items[0].system_id}",
            json={"importance": "Critical"},
        )
        assert response.status_code == 400

    def test_guest_cannot_patch(self, client, sample_items):
        response = client.patch(
            f"/api/watch-order/items/{sample_items[0].system_id}",
            json={"note": "no"},
        )
        assert response.status_code == 401

    def test_nonexistent_item_returns_404(self, admin_client):
        response = admin_client.patch(
            f"/api/watch-order/items/{uuid.uuid4()}", json={"note": "x"}
        )
        assert response.status_code == 404


class TestDeleteWatchOrderItem:
    def test_admin_can_delete_item(self, admin_client, sample_list, sample_items):
        admin_client.delete(f"/api/watch-order/items/{sample_items[1].system_id}")
        data = admin_client.get(
            f"/api/watch-order/lists/{sample_list.system_id}"
        ).json()
        assert len(data["items"]) == 2

    def test_guest_cannot_delete_item(self, client, sample_items):
        response = client.delete(
            f"/api/watch-order/items/{sample_items[0].system_id}"
        )
        assert response.status_code == 401


class TestReorder:
    def test_renumbers_positions_to_1_to_n(
        self, admin_client, sample_list, sample_items
    ):
        reversed_ids = [str(i.system_id) for i in reversed(sample_items)]
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": reversed_ids},
        )
        assert response.status_code == 200
        items = response.json()["items"]
        assert [i["position"] for i in items] == [1.0, 2.0, 3.0]
        assert [i["system_id"] for i in items] == reversed_ids

    def test_partial_payload_is_rejected(
        self, admin_client, sample_list, sample_items
    ):
        """A partial payload would silently leave stale positions behind."""
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [str(sample_items[0].system_id)]},
        )
        assert response.status_code == 400

    def test_duplicate_ids_are_rejected(self, admin_client, sample_list, sample_items):
        dupe = str(sample_items[0].system_id)
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [dupe, dupe, str(sample_items[1].system_id)]},
        )
        assert response.status_code == 400

    def test_foreign_item_is_rejected(self, admin_client, sample_list, sample_items):
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [str(uuid.uuid4()) for _ in sample_items]},
        )
        assert response.status_code == 400

    def test_guest_cannot_reorder(self, client, sample_list, sample_items):
        response = client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [str(i.system_id) for i in sample_items]},
        )
        assert response.status_code == 401
