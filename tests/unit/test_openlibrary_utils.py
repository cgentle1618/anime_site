"""
Open Library work-id extraction.

A wrong id is worse than no id, so anything that is not a *work* URL returns
None rather than a best guess: an edition URL (OL...M), an author URL (OL...A)
and a bare id all fail closed. This mirrors extract_comicvine_id, which rejects
4000- issue URLs instead of storing them.
"""

import types

from app.services.domain import apply_extract_novel_ids, apply_extract_openlibrary_id
from app.utils.openlibrary_utils import extract_openlibrary_id


def make_novel(**kwargs):
    defaults = dict(
        openlibrary_id=None,
        openlibrary_link="https://openlibrary.org/works/OL5738148W/The_Final_Empire",
        mal_id=None,
        mal_link=None,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


class TestExtractOpenlibraryId:
    def test_extracts_from_a_work_url_with_a_slug(self):
        assert (
            extract_openlibrary_id(
                "https://openlibrary.org/works/OL5738148W/The_Final_Empire"
            )
            == "OL5738148W"
        )

    def test_extracts_from_a_bare_work_url(self):
        assert extract_openlibrary_id("https://openlibrary.org/works/OL468431W") == "OL468431W"

    def test_rejects_an_edition_url(self):
        assert extract_openlibrary_id("https://openlibrary.org/books/OL7353617M") is None

    def test_rejects_an_author_url(self):
        assert extract_openlibrary_id("https://openlibrary.org/authors/OL1394865A") is None

    def test_rejects_a_bare_id(self):
        assert extract_openlibrary_id("OL5738148W") is None

    def test_rejects_empty_and_none(self):
        assert extract_openlibrary_id("") is None
        assert extract_openlibrary_id(None) is None


class TestApplyExtractOpenlibraryId:
    def test_writes_the_id_parsed_from_the_link(self):
        novel = make_novel()
        assert apply_extract_openlibrary_id(novel) is True
        assert novel.openlibrary_id == "OL5738148W"

    def test_returns_false_when_the_link_is_missing(self):
        novel = make_novel(openlibrary_link=None)
        assert apply_extract_openlibrary_id(novel) is False
        assert novel.openlibrary_id is None

    def test_does_not_clobber_an_existing_id_when_the_link_is_unparseable(self):
        novel = make_novel(openlibrary_id="OL5738148W", openlibrary_link="not a url")
        assert apply_extract_openlibrary_id(novel) is False
        assert novel.openlibrary_id == "OL5738148W"


class TestApplyExtractNovelIds:
    def test_runs_both_extractors_when_both_links_are_present(self):
        novel = make_novel(mal_link="https://myanimelist.net/manga/23390/")
        assert apply_extract_novel_ids(novel) is True
        assert novel.mal_id == 23390
        assert novel.openlibrary_id == "OL5738148W"

    def test_extracts_open_library_even_when_mal_is_absent(self):
        novel = make_novel(mal_link=None)
        assert apply_extract_novel_ids(novel) is True
        assert novel.openlibrary_id == "OL5738148W"

    def test_extracts_mal_even_when_open_library_is_absent(self):
        novel = make_novel(
            openlibrary_link=None, mal_link="https://myanimelist.net/manga/23390/"
        )
        assert apply_extract_novel_ids(novel) is True
        assert novel.mal_id == 23390

    def test_returns_false_when_neither_link_is_present(self):
        novel = make_novel(openlibrary_link=None, mal_link=None)
        assert apply_extract_novel_ids(novel) is False
