"""Game request/response schemas."""

import uuid

import pytest
from pydantic import ValidationError

from app import schemas


def test_defaults():
    game = schemas.GameCreate(game_name_en="Hades")
    assert game.playing_status == "Might Play"
    assert game.copies is None  # not supplied != cleared


def test_release_date_is_normalised():
    assert (
        schemas.GameCreate(game_name_en="X", release_date="MAR 2022").release_date
        == "2022-03"
    )


def test_a_bad_release_date_is_rejected():
    with pytest.raises(ValidationError):
        schemas.GameCreate(game_name_en="X", release_date="sometime")


def test_copies_accept_the_full_copy_shape():
    game = schemas.GameCreate(
        game_name_en="Hades",
        copies=[
            {
                "storefront": "Steam",
                "ownership": "Owned",
                "copy_format": "Digital",
                "acquisition": "Bought",
                "price_paid": "24.99",
                "price_currency": "USD",
                "acquired_date": "2024-11-03",
            }
        ],
    )
    assert game.copies[0].storefront == "Steam"


def test_response_display_name_leads_with_cn():
    resp = schemas.GameResponse(
        system_id=uuid.uuid4(), game_name_en="Elden Ring", game_name_cn="艾爾登法環"
    )
    assert resp.display_name == "艾爾登法環"
