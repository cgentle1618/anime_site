"""
Unit tests for the Comic Vine fill gate and link→ID derivation.

Covers has_missing_values_comic (which entries the Fill Comic pipeline picks up)
and apply_extract_comicvine_id (which turns a pasted URL into a stored ID).

Uses SimpleNamespace to create mock Comic objects — no DB required.
"""

import types
import pytest
from app.services.domain import (
    has_missing_values_comic,
    apply_extract_comicvine_id,
)


def make_comic(**kwargs):
    """Returns a fully-populated Comic-like object that passes has_missing_values_comic."""
    defaults = dict(
        comicvine_id=2127,
        comicvine_link="https://comicvine.gamespot.com/the-amazing-spider-man/4050-2127/",
        comic_name_en="The Amazing Spider-Man",
        volume_label="(1963)",
        publisher="Marvel",
        writer="Stan Lee",
        artist="Steve Ditko",
        release_year=1963,
        issue_total=441,
        cover_image_file="abc123.jpg",
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# has_missing_values_comic
# ---------------------------------------------------------------------------

class TestHasMissingValuesComic:
    def test_fully_populated_comic_needs_no_fill(self):
        assert has_missing_values_comic(make_comic()) is False

    @pytest.mark.parametrize("field", [
        "publisher",
        "writer",
        "artist",
        "release_year",
        "issue_total",
        "cover_image_file",
    ])
    def test_any_blank_fill_field_triggers_a_fill(self, field):
        assert has_missing_values_comic(make_comic(**{field: None})) is True

    def test_empty_string_counts_as_blank(self):
        assert has_missing_values_comic(make_comic(publisher="   ")) is True

    def test_manual_only_fields_do_not_trigger_a_fill(self):
        """
        Comic Vine models none of these, so requiring them would make every
        entry permanently 'needs filling' and re-request it on every run.
        """
        comic = make_comic()
        for field in ("imprint", "continuity", "era", "events", "end_year", "publisher_tw"):
            setattr(comic, field, None)
        assert has_missing_values_comic(comic) is False

    def test_issue_total_of_zero_is_a_real_value_not_a_blank(self):
        assert has_missing_values_comic(make_comic(issue_total=0)) is False


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
