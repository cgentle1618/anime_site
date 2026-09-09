"""CN-first display name derivation, shared by media backfills and writes."""

import pytest

from app import models
from app.services.domain.display_name import compute_display_name


def test_prefers_cn():
    a = models.Anime(anime_name_cn="葬送的芙莉蓮", anime_name_en="Frieren")
    assert compute_display_name(a) == "葬送的芙莉蓮"


def test_falls_back_when_cn_missing():
    a = models.Anime(anime_name_cn=None, anime_name_en="Frieren")
    assert compute_display_name(a) == "Frieren"


def test_treats_whitespace_only_as_missing():
    a = models.Anime(anime_name_cn="   ", anime_name_en="Frieren")
    assert compute_display_name(a) == "Frieren"


def test_raises_when_every_name_is_empty():
    a = models.Anime()
    with pytest.raises(ValueError, match="no name"):
        compute_display_name(a)


@pytest.mark.parametrize(
    "model, kwargs, expected",
    [
        (models.Manga, {"manga_name_cn": "鏈鋸人"}, "鏈鋸人"),
        (models.Movies, {"movie_name_en": "Fight Club"}, "Fight Club"),
        (models.Game, {"game_name_en": "Hollow Knight"}, "Hollow Knight"),
    ],
)
def test_works_for_every_media_model(model, kwargs, expected):
    assert compute_display_name(model(**kwargs)) == expected
