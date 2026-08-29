"""
API integration tests for /api/auth endpoints.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from app import models
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def user_in_db(db_session):
    user = models.User(
        id=uuid.uuid4(),
        username="testuser",
        hashed_password=get_password_hash("correct_password"),
        role_id=role_id_for(db_session, "admin"),
    )
    db_session.add(user)
    db_session.flush()
    return user


class TestLogin:
    def test_valid_credentials_return_200(self, client, user_in_db):
        response = client.post(
            "/api/auth/login",
            data={"username": "testuser", "password": "correct_password"},
        )
        assert response.status_code == 200
        assert response.json()["role"] == "admin"

    def test_valid_login_sets_cookie(self, client, user_in_db):
        response = client.post(
            "/api/auth/login",
            data={"username": "testuser", "password": "correct_password"},
        )
        assert "access_token" in response.cookies

    def test_wrong_password_returns_401(self, client, user_in_db):
        response = client.post(
            "/api/auth/login",
            data={"username": "testuser", "password": "wrong_password"},
        )
        assert response.status_code == 401

    def test_unknown_user_returns_401(self, client):
        response = client.post(
            "/api/auth/login",
            data={"username": "nobody", "password": "anything"},
        )
        assert response.status_code == 401

    def test_missing_username_returns_422(self, client):
        response = client.post("/api/auth/login", data={"password": "only_pass"})
        assert response.status_code == 422


class TestGetMe:
    def test_with_valid_cookie_returns_admin_true(self, admin_client):
        response = admin_client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["is_admin"] is True
        assert data["username"] == "testadmin"

    def test_without_cookie_returns_admin_false(self, client):
        response = client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["is_admin"] is False
        assert data["username"] is None

    def test_with_bad_cookie_returns_admin_false(self, client):
        client.cookies.set("access_token", "Bearer not.a.real.token")
        response = client.get("/api/auth/me")
        assert response.status_code == 200
        assert response.json()["is_admin"] is False


class TestLogout:
    def test_logout_returns_200(self, admin_client):
        response = admin_client.post("/api/auth/logout")
        assert response.status_code == 200

    def test_logout_clears_cookie(self, admin_client):
        response = admin_client.post("/api/auth/logout")
        # Assert the server's actual contract: it instructs the client to expire
        # the auth cookie (Max-Age=0 / past expiry). We check the response header
        # rather than re-reading /me, because the test client's cookie jar does
        # not drop a manually-injected cookie on an expiring Set-Cookie.
        set_cookie = response.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie
        assert "max-age=0" in set_cookie.lower() or "expires=" in set_cookie.lower()
