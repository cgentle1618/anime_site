"""
apply_single_replace_novel derives BOTH of a novel's external ids.

Replace still re-fetches from MAL only — Open Library is deliberately not wired
into Replace — but the id *derivation* must not skip openlibrary_id. Otherwise a
novel whose Open Library link was pasted just before a Replace comes out of it
with no id, and the next Fill has nothing to key off.

apply_single_replace_novel touches only the entry (its `db` argument is unused),
so these are SimpleNamespace fakes in the no-database tier. The MAL autofill is
patched out — this is about derivation, not the network.
"""

import types

import pytest

from app.services.domain import post_processing

MAL_LINK = "https://myanimelist.net/manga/23390/"
OL_LINK = "https://openlibrary.org/works/OL5738148W"


def make_novel(**kwargs):
    defaults = dict(
        system_id="n1",
        mal_id=None,
        mal_link=None,
        openlibrary_id=None,
        openlibrary_link=OL_LINK,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Replace calls the MAL autofill; nothing here should reach it."""
    monkeypatch.setattr(
        post_processing, "autofill_novel_from_mal", lambda *a, **k: None
    )


class TestApplySingleReplaceNovel:
    def test_derives_the_open_library_id(self):
        novel = make_novel()
        post_processing.apply_single_replace_novel(None, novel)
        assert novel.openlibrary_id == "OL5738148W"

    def test_still_derives_the_mal_id(self):
        novel = make_novel(mal_link=MAL_LINK, openlibrary_link=None)
        post_processing.apply_single_replace_novel(None, novel)
        assert novel.mal_id == 23390

    def test_derives_both_when_both_links_are_present(self):
        novel = make_novel(mal_link=MAL_LINK)
        post_processing.apply_single_replace_novel(None, novel)
        assert novel.mal_id == 23390
        assert novel.openlibrary_id == "OL5738148W"

    def test_an_unparseable_link_leaves_an_existing_id_alone(self):
        novel = make_novel(openlibrary_id="OL999W", openlibrary_link="not a url")
        post_processing.apply_single_replace_novel(None, novel)
        assert novel.openlibrary_id == "OL999W"

    def test_replace_still_refetches_from_mal_only(self, monkeypatch):
        """Deriving the Open Library id must not start fetching from it."""
        calls = []
        monkeypatch.setattr(
            post_processing,
            "autofill_novel_from_mal",
            lambda novel, force_replace_ratings=True: calls.append("mal"),
        )
        post_processing.apply_single_replace_novel(None, make_novel())
        assert calls == ["mal"]
