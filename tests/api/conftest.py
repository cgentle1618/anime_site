"""
API test fixtures.

Requires PostgreSQL to be running (docker-compose up -d).
Uses the 'anime_site_test' database (set in tests/conftest.py).

Setup: createdb -U postgres anime_site_test  (run once)
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from database import SQLALCHEMY_DATABASE_URL, Base
from dependencies import get_db, SECRET_KEY, ALGORITHM
from services.security import get_password_hash, create_access_token
from main import app


# ---------------------------------------------------------------------------
# Database setup — one engine for the entire test session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(test_engine):
    """
    Yields a DB session wrapped in a transaction that rolls back after each test.
    Ensures full test isolation without needing to rebuild tables.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(bind=connection)
    session = TestingSessionLocal()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# ---------------------------------------------------------------------------
# FastAPI test clients
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def client(db_session):
    """Unauthenticated test client with test DB override."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def admin_client(db_session):
    """Authenticated admin test client — sets valid JWT cookie."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Create admin user in the test DB
    admin = models.User(
        id=uuid.uuid4(),
        username="testadmin",
        hashed_password=get_password_hash("testpass"),
        role="admin",
    )
    db_session.add(admin)
    db_session.flush()

    token = create_access_token({"sub": "testadmin", "role": "admin"})

    with TestClient(app) as c:
        c.cookies.set("access_token", f"Bearer {token}")
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Sample data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_franchise(db_session):
    f = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type="Anime",
        franchise_name_en="Test Franchise",
        franchise_name_cn="測試系列",
    )
    db_session.add(f)
    db_session.flush()
    return f


@pytest.fixture
def sample_series(db_session, sample_franchise):
    s = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        series_name_en="Test Series",
    )
    db_session.add(s)
    db_session.flush()
    return s


@pytest.fixture
def sample_anime(db_session, sample_franchise):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Test Anime",
        airing_type="TV",
        airing_status="Finished Airing",
        watching_status="Completed",
        ep_total=12,
        ep_fin=12,
    )
    db_session.add(a)
    db_session.flush()
    return a
