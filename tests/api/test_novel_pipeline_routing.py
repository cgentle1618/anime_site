"""
Novel fill eligibility and source routing.

Novel is the only media type with two sources. MAL wins whenever it is
available, because Tenrai returns strictly more (serialization status, end
date, volume and chapter totals, ratings); Open Library fills only the entries
MAL does not have.
"""

import uuid

from app import models
from app.services.domain.autofill import autofill_novel_from_openlibrary
from app.services.pipelines.specs import PIPELINES

SPEC = PIPELINES["novel"]


def make_novel(db_session, **kwargs):
    defaults = dict(
        system_id=uuid.uuid4(),
        novel_name_en="Mistborn",
        mal_link=None,
        mal_id=None,
        openlibrary_id=None,
        openlibrary_link=None,
        release_date=None,
        cover_image_file=None,
        serialization_status=None,
        end_date=None,
        mal_rating=None,
        mal_rank=None,
    )
    defaults.update(kwargs)
    novel = models.Novel(**defaults)
    db_session.add(novel)
    db_session.flush()
    return novel


class TestFillEligible:
    def test_an_open_library_novel_with_no_mal_link_is_eligible(self, db_session):
        """The headline change: this was False before Open Library existed."""
        novel = make_novel(db_session, openlibrary_id="OL5738148W")
        assert SPEC.fill_eligible(db_session, novel) is True

    def test_a_novel_with_neither_source_is_not_eligible(self, db_session):
        novel = make_novel(db_session)
        assert SPEC.fill_eligible(db_session, novel) is False

    def test_a_mal_novel_with_gaps_is_still_eligible(self, db_session):
        novel = make_novel(
            db_session, mal_link="https://myanimelist.net/manga/23390/", mal_id=23390
        )
        assert SPEC.fill_eligible(db_session, novel) is True

    def test_a_mal_complete_novel_is_not_eligible_via_open_library(self, db_session):
        """Both ids, MAL fields complete, no author credit. Routing would send
        this to Tenrai, which never writes author credits — so calling it
        eligible would re-request it on every single run, forever."""
        novel = make_novel(
            db_session,
            mal_link="https://myanimelist.net/manga/23390/",
            mal_id=23390,
            openlibrary_id="OL5738148W",
            serialization_status="完結",
            release_date="2006",
            end_date="2011",
            mal_rating=8.5,
            mal_rank="123",
            cover_image_file="cover.jpg",
            vol_total_original=3,
        )
        assert SPEC.fill_eligible(db_session, novel) is False

    def test_an_empty_string_mal_link_agrees_with_routing(self, db_session, monkeypatch):
        """An empty-string mal_link (reachable via direct POST/PATCH, not the UI
        or Sheets) must not disagree with `fill`'s truthiness routing: eligible
        via the wrong branch but routed to Open Library would re-fetch Open
        Library forever, since it can never satisfy the MAL-only fields."""
        called = []
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_openlibrary",
            lambda e, db: called.append("openlibrary"),
        )
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_mal",
            lambda e, force_replace_ratings=True: called.append("mal"),
        )
        novel = make_novel(db_session, mal_link="", openlibrary_id="OL5738148W")
        assert SPEC.fill_eligible(db_session, novel) is True
        PIPELINES["novel"].fill(db_session, novel)
        assert called == ["openlibrary"]


class TestFillRouting:
    def test_routes_to_open_library_when_there_is_no_mal_link(
        self, db_session, monkeypatch
    ):
        called = []
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_openlibrary",
            lambda e, db: called.append("openlibrary"),
        )
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_mal",
            lambda e, force_replace_ratings=True: called.append("mal"),
        )
        novel = make_novel(db_session, openlibrary_id="OL5738148W")
        PIPELINES["novel"].fill(db_session, novel)
        assert called == ["openlibrary"]

    def test_routes_to_mal_when_both_ids_are_present(self, db_session, monkeypatch):
        called = []
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_openlibrary",
            lambda e, db: called.append("openlibrary"),
        )
        monkeypatch.setattr(
            "app.services.pipelines.specs.autofill_novel_from_mal",
            lambda e, force_replace_ratings=True: called.append("mal"),
        )
        novel = make_novel(
            db_session,
            mal_link="https://myanimelist.net/manga/23390/",
            mal_id=23390,
            openlibrary_id="OL5738148W",
        )
        PIPELINES["novel"].fill(db_session, novel)
        assert called == ["mal"]


class TestExtractId:
    def test_the_spec_uses_the_combined_extractor(self, db_session):
        novel = make_novel(
            db_session,
            mal_link="https://myanimelist.net/manga/23390/",
            openlibrary_link="https://openlibrary.org/works/OL5738148W",
        )
        assert SPEC.extract_id(novel) is True
        assert novel.mal_id == 23390
        assert novel.openlibrary_id == "OL5738148W"


class TestFillClosesTheEligibilityLoop:
    def test_a_completed_open_library_fill_is_no_longer_eligible(self, db_session, monkeypatch):
        """Pins the invariant that the gate and the autofill agree: whatever
        Fill judges fillable, one Fill actually completes. Uses mal_link=""
        (not None) because that is the input that actually exercises the
        bug: with the `is not None` guard, an empty-string mal_link routes
        eligibility through the MAL branch, which Open Library's fill can
        never satisfy (it never writes serialization_status, end_date,
        mal_rating or mal_rank) — so the entry stays eligible forever and
        would be re-fetched on every Fill run."""
        work_result = {
            "work": {"title": "The Final Empire", "covers": [14658160]},
            "editions": [{"publish_date": "2006"}, {"publish_date": "July 2015"}],
            "authors": [{"name": "Brandon Sanderson"}],
        }
        monkeypatch.setattr(
            "app.services.domain.autofill.fetch_openlibrary_work",
            lambda work_id, *, want_editions=True, want_authors=True: work_result,
        )
        monkeypatch.setattr(
            "app.services.domain.autofill.download_cover_image",
            lambda url, system_id: "downloaded.jpg",
        )
        novel = make_novel(db_session, mal_link="", openlibrary_id="OL5738148W")
        assert SPEC.fill_eligible(db_session, novel) is True
        autofill_novel_from_openlibrary(novel, db_session)
        assert SPEC.fill_eligible(db_session, novel) is False
