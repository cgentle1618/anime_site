"""
Unit tests for autofill_comic_from_comicvine.

The Comic Vine fetch and the cover download are both patched out — these tests
lock down the fill-only semantics (never overwrite what the admin typed) rather
than the network layer.
"""

import types
import pytest

from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_comic_from_comicvine


VOLUME_RESULT = {
    "id": 2127,
    "name": "The Amazing Spider-Man",
    "start_year": "1963",
    "count_of_issues": 441,
    "publisher": {"name": "Marvel"},
    "person_credits": [
        {"name": "Stan Lee", "role": "writer"},
        {"name": "Steve Ditko", "role": "penciler"},
    ],
    "image": {"original_url": "https://cv.example/original.jpg"},
}


def make_comic(**kwargs):
    """A Comic-like object with every fillable field blank."""
    defaults = dict(
        system_id="11111111-1111-1111-1111-111111111111",
        comicvine_id=2127,
        comic_name_en=None,
        volume_label=None,
        publisher=None,
        writer=None,
        artist=None,
        release_year=None,
        issue_total=None,
        cover_image_file=None,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


@pytest.fixture
def patched(monkeypatch):
    """Patches the fetch and the cover download; records the download calls."""
    calls = {"fetch": [], "download": []}

    def fake_fetch(volume_id):
        calls["fetch"].append(volume_id)
        return VOLUME_RESULT

    def fake_download(url, system_id):
        calls["download"].append((url, system_id))
        return "downloaded.jpg"

    monkeypatch.setattr(autofill_module, "fetch_comicvine_volume", fake_fetch)
    monkeypatch.setattr(autofill_module, "download_cover_image", fake_download)
    return calls


class TestAutofillComicFromComicvine:
    def test_fills_every_blank_field(self, patched):
        comic = make_comic()
        autofill_comic_from_comicvine(comic)

        assert comic.publisher == "Marvel"
        assert comic.writer == "Stan Lee"
        assert comic.artist == "Steve Ditko"
        assert comic.release_year == 1963
        assert comic.issue_total == 441
        assert comic.volume_label == "(1963)"
        assert comic.cover_image_file == "downloaded.jpg"

    def test_does_not_overwrite_admin_entered_values(self, patched):
        comic = make_comic(
            publisher="Marvel UK",
            writer="J. M. DeMatteis",
            volume_label="Legacy",
            release_year=1999,
        )
        autofill_comic_from_comicvine(comic)

        assert comic.publisher == "Marvel UK"
        assert comic.writer == "J. M. DeMatteis"
        assert comic.volume_label == "Legacy"
        assert comic.release_year == 1999
        # Blank fields are still filled.
        assert comic.artist == "Steve Ditko"

    def test_does_not_overwrite_an_existing_cover(self, patched):
        comic = make_comic(cover_image_file="my-own-scan.jpg")
        autofill_comic_from_comicvine(comic)

        assert comic.cover_image_file == "my-own-scan.jpg"
        assert patched["download"] == []

    def test_never_touches_the_english_name(self, patched):
        """
        comic_name_en is the entry's identity and often a deliberate shorthand;
        Comic Vine's canonical title must not replace it.
        """
        comic = make_comic(comic_name_en="ASM")
        autofill_comic_from_comicvine(comic)
        assert comic.comic_name_en == "ASM"

    def test_does_nothing_without_a_comicvine_id(self, patched):
        comic = make_comic(comicvine_id=None)
        autofill_comic_from_comicvine(comic)

        assert patched["fetch"] == []
        assert comic.publisher is None

    def test_leaves_entry_untouched_when_the_volume_is_not_found(self, monkeypatch):
        monkeypatch.setattr(autofill_module, "fetch_comicvine_volume", lambda vid: None)
        comic = make_comic()
        autofill_comic_from_comicvine(comic)
        assert comic.publisher is None

    def test_swallows_fetch_errors_so_one_bad_entry_cannot_abort_a_run(self, monkeypatch):
        def boom(volume_id):
            raise RuntimeError("connection reset")

        monkeypatch.setattr(autofill_module, "fetch_comicvine_volume", boom)
        comic = make_comic()

        autofill_comic_from_comicvine(comic)  # must not raise
        assert comic.publisher is None

    def test_skips_the_cover_when_comicvine_has_only_a_placeholder(self, monkeypatch):
        result = dict(VOLUME_RESULT)
        result["image"] = {"original_url": "https://cv.example/img/blank.png"}
        monkeypatch.setattr(autofill_module, "fetch_comicvine_volume", lambda vid: result)

        downloads = []
        monkeypatch.setattr(
            autofill_module,
            "download_cover_image",
            lambda url, sid: downloads.append(url) or "x.jpg",
        )

        comic = make_comic()
        autofill_comic_from_comicvine(comic)

        assert downloads == []
        assert comic.cover_image_file is None

    def test_leaves_cover_blank_when_the_download_fails(self, monkeypatch):
        monkeypatch.setattr(autofill_module, "fetch_comicvine_volume", lambda vid: VOLUME_RESULT)
        monkeypatch.setattr(autofill_module, "download_cover_image", lambda url, sid: None)

        comic = make_comic()
        autofill_comic_from_comicvine(comic)
        assert comic.cover_image_file is None
