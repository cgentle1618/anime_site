"""
Open Library JSON to novel fields.

Year precision is deliberate, and matches what Comic Vine already does
(start_year -> a bare-year release_date, fill-only). The stored id names the
entry's anchor book, so nothing here maps end_date, volume counts or
serialization status: one book cannot know them for a trilogy.
"""

from datetime import date

from app.utils.openlibrary_utils import (
    _earliest_edition_year,
    map_openlibrary_to_novel_data,
)


def raw(work=None, editions=None, authors=None):
    return {
        "work": work if work is not None else {"title": "The Final Empire", "covers": [14658160]},
        "editions": editions if editions is not None else [{"publish_date": "2006"}],
        "authors": authors if authors is not None else [{"name": "Brandon Sanderson"}],
    }


class TestEarliestEditionYear:
    def test_takes_the_minimum_across_editions(self):
        editions = [
            {"publish_date": "July 2015"},
            {"publish_date": "2006"},
            {"publish_date": "March 1, 2011"},
        ]
        assert _earliest_edition_year(editions) == 2006

    def test_ignores_an_edition_with_no_parseable_year(self):
        editions = [{"publish_date": "n.d."}, {"publish_date": "1998"}]
        assert _earliest_edition_year(editions) == 1998

    def test_ignores_a_year_beyond_next_year(self):
        far_future = str(date.today().year + 5)
        editions = [{"publish_date": far_future}, {"publish_date": "2001"}]
        assert _earliest_edition_year(editions) == 2001

    def test_returns_none_for_no_editions(self):
        assert _earliest_edition_year([]) is None
        assert _earliest_edition_year(None) is None

    def test_returns_none_when_no_edition_has_a_year(self):
        assert _earliest_edition_year([{"publish_date": "unknown"}, {}]) is None


class TestMapOpenlibraryToNovelData:
    def test_maps_all_three_fields(self):
        mapped = map_openlibrary_to_novel_data(raw())
        assert mapped["release_date"] == "2006"
        assert mapped["author"] == "Brandon Sanderson"
        assert mapped["cover_image_url"] == (
            "https://covers.openlibrary.org/b/id/14658160-L.jpg"
        )

    def test_joins_multiple_authors(self):
        mapped = map_openlibrary_to_novel_data(
            raw(authors=[{"name": "Kugane Maruyama"}, {"name": "so-bin"}])
        )
        assert mapped["author"] == "Kugane Maruyama, so-bin"

    def test_skips_the_minus_one_cover_sentinel(self):
        mapped = map_openlibrary_to_novel_data(
            raw(work={"title": "Mistborn", "covers": [-1, 11329782]})
        )
        assert mapped["cover_image_url"] == (
            "https://covers.openlibrary.org/b/id/11329782-L.jpg"
        )

    def test_returns_no_cover_when_every_id_is_the_sentinel(self):
        mapped = map_openlibrary_to_novel_data(raw(work={"title": "X", "covers": [-1]}))
        assert mapped["cover_image_url"] is None

    def test_returns_no_cover_when_covers_is_absent(self):
        mapped = map_openlibrary_to_novel_data(raw(work={"title": "X"}))
        assert mapped["cover_image_url"] is None

    def test_returns_no_author_when_authors_is_empty(self):
        assert map_openlibrary_to_novel_data(raw(authors=[]))["author"] is None

    def test_ignores_an_author_record_with_a_blank_name(self):
        mapped = map_openlibrary_to_novel_data(
            raw(authors=[{"name": "  "}, {"name": "Andy Weir"}])
        )
        assert mapped["author"] == "Andy Weir"

    def test_returns_no_release_date_when_editions_were_not_fetched(self):
        assert map_openlibrary_to_novel_data(raw(editions=[]))["release_date"] is None

    def test_handles_none_and_empty_input(self):
        for value in (None, {}):
            mapped = map_openlibrary_to_novel_data(value)
            assert mapped == {
                "release_date": None,
                "author": None,
                "cover_image_url": None,
            }

    def test_never_maps_fields_the_anchor_book_cannot_know(self):
        mapped = map_openlibrary_to_novel_data(raw())
        for forbidden in (
            "end_date",
            "vol_total_original",
            "ch_total",
            "serialization_status",
            "novel_name_en",
        ):
            assert forbidden not in mapped
