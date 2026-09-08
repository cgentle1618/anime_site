"""Seasonal grouping reads the year out of release_date."""

from app.models import Anime, Seasonal
from app.services.domain.seasonal import create_missing_seasonal


def test_seasonal_entries_are_created_from_release_date(db_session):
    db_session.add(
        Anime(anime_name_en="Test A", release_season="WIN", release_date="2026-01")
    )
    db_session.add(
        Anime(anime_name_en="Test B", release_season="SUM", release_date="2025")
    )
    db_session.commit()

    create_missing_seasonal(db_session)

    created = {s.seasonal for s in db_session.query(Seasonal).all()}
    assert "WIN 2026" in created
    assert "SUM 2025" in created


def test_an_anime_with_no_release_date_creates_no_seasonal(db_session):
    db_session.add(
        Anime(anime_name_en="Test C", release_season="WIN", release_date=None)
    )
    db_session.commit()

    create_missing_seasonal(db_session)

    assert not [
        s for s in db_session.query(Seasonal).all() if s.seasonal.endswith("None")
    ]


def test_the_airing_season_filter_matches_on_the_year_prefix(client, db_session):
    db_session.add(
        Anime(
            anime_name_en="Filter Me",
            release_season="WIN",
            release_date="2026-01-15",
        )
    )
    db_session.commit()

    response = client.get("/api/anime/?airing_season=WIN 2026")
    assert response.status_code == 200
    assert any(a["anime_name_en"] == "Filter Me" for a in response.json())
