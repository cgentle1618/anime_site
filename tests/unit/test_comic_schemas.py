"""Schema tests for Comic — defaults, and the EN-first display_name."""

import pytest
from pydantic import ValidationError

from app.schemas.comic import ComicCreate, ComicResponse
from uuid import uuid4


class TestComicCreateDefaults:
    def test_reading_status_defaults_to_might_read(self):
        c = ComicCreate(comic_name_en="Amazing Spider-Man")
        assert c.reading_status == "Might Read"

    def test_issue_fin_defaults_to_zero(self):
        c = ComicCreate(comic_name_en="Amazing Spider-Man")
        assert c.issue_fin == 0

    def test_all_names_optional(self):
        c = ComicCreate()
        assert c.comic_name_en is None

    def test_events_is_a_comma_joined_string(self):
        c = ComicCreate(comic_name_en="ASM", events="Hunted, Sinister War")
        assert c.events == "Hunted, Sinister War"

    def test_rejects_non_integer_issue_total(self):
        with pytest.raises(ValidationError):
            ComicCreate(comic_name_en="ASM", issue_total="not a number")


class TestComicResponseDisplayName:
    def _response(self, **names):
        return ComicResponse(system_id=uuid4(), **names)

    def test_prefers_en(self):
        r = self._response(comic_name_en="Amazing Spider-Man", comic_name_cn="蜘蛛人")
        assert r.display_name == "Amazing Spider-Man"

    def test_falls_back_to_cn(self):
        r = self._response(comic_name_cn="蜘蛛人", comic_name_alt="ASM")
        assert r.display_name == "蜘蛛人"

    def test_falls_back_to_alt(self):
        r = self._response(comic_name_alt="ASM")
        assert r.display_name == "ASM"

    def test_empty_when_no_names(self):
        assert self._response().display_name == ""
