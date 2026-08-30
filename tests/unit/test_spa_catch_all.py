"""The SPA catch-all must never serve files outside frontend_dist."""

import pytest
from fastapi.testclient import TestClient

from app import main as main_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>spa</html>", encoding="utf-8")
    (dist / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("SECRET", encoding="utf-8")
    monkeypatch.setattr(main_module, "FRONTEND_DIST", dist)
    # No lifespan: the catch-all needs no database.
    return TestClient(main_module.app)


def test_serves_built_asset(client):
    assert client.get("/app.js").text == "console.log(1)"


def test_unknown_route_falls_back_to_index(client):
    assert client.get("/library/anime").text == "<html>spa</html>"


@pytest.mark.parametrize("path", ["/..%2Fsecret.txt", "/%2E%2E%2Fsecret.txt", "/..%5Csecret.txt"])
def test_traversal_never_leaves_dist(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert "SECRET" not in response.text
    assert response.text == "<html>spa</html>"
