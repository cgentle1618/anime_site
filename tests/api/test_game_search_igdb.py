"""The admin's IGDB picker, so an entry can be linked before Fill runs."""

from app.routers import game as game_router


def test_search_requires_admin(client):
    assert client.get("/api/game/search-igdb?q=elden").status_code == 401


def test_search_returns_the_client_results(admin_client, monkeypatch):
    monkeypatch.setattr(
        game_router,
        "search_igdb_games",
        lambda q, limit: [{"id": 1029, "name": "Elden Ring"}],
    )
    body = admin_client.get("/api/game/search-igdb?q=elden").json()
    assert body[0]["name"] == "Elden Ring"


def test_an_empty_query_is_a_422(admin_client):
    assert admin_client.get("/api/game/search-igdb?q=").status_code == 422
