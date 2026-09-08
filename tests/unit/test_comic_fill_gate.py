"""
Unit tests for the Comic Vine fill gate and link→ID derivation.

Covers apply_extract_comicvine_id (which turns a pasted URL into a stored ID).

Uses SimpleNamespace to create mock Comic objects — no DB required.
"""

import types

from app.services.domain import (
    apply_extract_comicvine_id,
)


def make_comic(**kwargs):
    """Returns a Comic-like object with a Comic Vine link."""
    defaults = dict(
        comicvine_id=2127,
        comicvine_link="https://comicvine.gamespot.com/the-amazing-spider-man/4050-2127/",
        comic_name_en="The Amazing Spider-Man",
        volume_label="(1963)",
        release_date="1963",
        issue_total=441,
        cover_image_file="abc123.jpg",
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# apply_extract_comicvine_id
# ---------------------------------------------------------------------------

class TestApplyExtractComicvineId:
    def test_writes_the_id_parsed_from_the_link(self):
        comic = make_comic(comicvine_id=None)
        assert apply_extract_comicvine_id(comic) is True
        assert comic.comicvine_id == 2127

    def test_returns_false_and_leaves_id_alone_when_link_is_missing(self):
        comic = make_comic(comicvine_id=None, comicvine_link=None)
        assert apply_extract_comicvine_id(comic) is False
        assert comic.comicvine_id is None

    def test_returns_false_for_a_link_that_is_not_a_volume_url(self):
        comic = make_comic(comicvine_id=None, comicvine_link="https://comicvine.gamespot.com/x/4000-999/")
        assert apply_extract_comicvine_id(comic) is False
        assert comic.comicvine_id is None

    def test_does_not_clobber_an_existing_id_when_the_link_is_unparseable(self):
        comic = make_comic(comicvine_id=2127, comicvine_link="not a url")
        assert apply_extract_comicvine_id(comic) is False
        assert comic.comicvine_id == 2127
