"""
API test fixtures.

Requires PostgreSQL to be running (docker-compose up -d).
Uses the 'anime_site_test' database (set in tests/conftest.py).

Setup: createdb -U postgres anime_site_test  (run once)
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import SQLALCHEMY_DATABASE_URL, Base
from app.dependencies import get_db
from app.main import app
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed import ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


def role_id_for(db, name):
    """
    users.role is a read-only mapping over role.name since migration C, so a
    fixture assigns role_id. The roles themselves are seeded once per session
    in test_engine.
    """
    from app import models

    role = db.query(models.Role).filter(models.Role.name == name).first()
    assert role is not None, f"role {name!r} not seeded"
    return role.system_id


# ---------------------------------------------------------------------------
# Database setup — one engine for the entire test session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def test_engine():
    # Safety guard: never run a destructive schema reset against a non-test DB.
    db_name = SQLALCHEMY_DATABASE_URL.rsplit("/", 1)[-1].split("?")[0]
    assert "test" in db_name, f"Refusing to reset non-test database: {db_name!r}"

    engine = create_engine(SQLALCHEMY_DATABASE_URL)

    # Start from a guaranteed-clean schema. create_all never ALTERs existing
    # tables, so stale tables from an earlier run (columns since renamed/dropped
    # by migrations) would otherwise linger and break tests. A full schema reset
    # is the only reliable way to rebuild from the current models.
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))

    Base.metadata.create_all(bind=engine)

    # The roles migration A seeds. conftest never runs Alembic, so they are
    # created here instead - once, committed, session-wide. Doing it here
    # rather than per test keeps the lifespan's own idempotent seed to a
    # SELECT, and stops it contending with an open test transaction.
    seeding = sessionmaker(bind=engine)()
    ensure_rbac_seed(seeding)
    seeding.commit()
    seeding.close()

    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clear_permission_cache():
    """
    The role -> permissions cache is process-global and outlives a test's
    rolled-back transaction, so a stale entry would leak grants between tests.
    """
    rbac_cache.bump()
    yield
    rbac_cache.bump()


@pytest.fixture(scope="function")
def db_session(test_engine):
    """
    Yields a DB session wrapped in a transaction that rolls back after each test.
    Ensures full test isolation without needing to rebuild tables.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    # create_savepoint: session.commit()/rollback() inside the app act on a
    # SAVEPOINT, exactly as they act on a real transaction in production,
    # while the outer transaction still discards everything at teardown.
    # Without it a rollback in the code under test unwinds the whole outer
    # transaction and every row the test set up disappears mid-request.
    TestingSessionLocal = sessionmaker(
        bind=connection, join_transaction_mode="create_savepoint"
    )
    session = TestingSessionLocal()

    yield session

    session.close()
    if transaction.is_active:
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
        role_id=role_id_for(db_session, "admin"),
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
def sample_collection(db_session):
    c = models.Collection(
        system_id=uuid.uuid4(),
        collection_name_en="Test Collection",
        collection_name_cn="測試合集",
    )
    db_session.add(c)
    db_session.flush()
    return c


@pytest.fixture
def sample_collected_franchise(db_session, sample_collection):
    """A franchise that belongs to sample_collection."""
    f = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type="Anime",
        franchise_name_en="Collected Franchise",
        collection_id=sample_collection.system_id,
    )
    db_session.add(f)
    db_session.flush()
    return f


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


@pytest.fixture
def anime(sample_anime):
    """Alias for sample_anime, matching the character/casting test briefs."""
    return sample_anime


@pytest.fixture
def manga(manga_entry):
    """Alias for manga_entry, matching the character/casting test briefs."""
    return manga_entry


@pytest.fixture
def person(db_session):
    p = models.Person(system_id=uuid.uuid4(), name_en="Test Person")
    db_session.add(p)
    db_session.flush()
    return p


@pytest.fixture
def character(db_session):
    # photo_file is set to a real value (not None) so any test asserting the
    # casting-router photo fallback actually exercises the fallback branch,
    # rather than trivially matching None on both sides.
    c = models.Character(
        system_id=uuid.uuid4(), name_en="Ichika", photo_file="characters/ichika.jpg"
    )
    db_session.add(c)
    db_session.flush()
    return c


@pytest.fixture
def duplicate_character(db_session, anime):
    """A second character row, cast on the same anime, standing in for a
    duplicate the merge endpoint should fold into `character`."""
    c = models.Character(system_id=uuid.uuid4(), name_en="Ichika (dup)")
    db_session.add(c)
    db_session.flush()
    db_session.add(
        models.CharacterCasting(
            character_id=c.system_id,
            media_type="anime",
            entry_id=anime.system_id,
        )
    )
    db_session.commit()
    return c


@pytest.fixture
def character_with_castings(db_session, character, anime):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=anime.system_id,
        )
    )
    db_session.commit()
    return character


@pytest.fixture
def seiyuu_with_one_casting(db_session, anime, character):
    """
    A Person holding PersonRole(role="seiyuu", scope="anime"), cast as
    `character` on `anime`. A seiyuu's work lives in character_casting, not
    media_credit, so this is the fixture the person-router bug-fix tests need
    - person_with_credits (media_credit-backed) cannot exercise that path.
    """
    person = models.Person(system_id=uuid.uuid4(), name_en="Test Seiyuu")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="seiyuu", scope="anime")
    )
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=anime.system_id,
            person_id=person.system_id,
        )
    )
    db_session.commit()
    return person


@pytest.fixture
def manga_entry(db_session, sample_franchise):
    """One committed manga with no credits, for the credit-resolution tests."""
    m = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Test Manga",
    )
    db_session.add(m)
    db_session.flush()
    return m


@pytest.fixture
def manga_with_credits(db_session, manga_entry):
    """A manga with one author and one illustrator credit."""
    from app.services.domain import credits as credits_service

    credits_service.replace_credits(
        db_session, "manga", manga_entry.system_id, "author", ["諫山創"]
    )
    credits_service.replace_credits(
        db_session, "manga", manga_entry.system_id, "illustrator", ["小山宙哉"]
    )
    db_session.flush()
    return manga_entry


@pytest.fixture
def manga_with_two_authors(db_session, manga_entry):
    """Two author credits at position 0 and 1, to pin the stored order."""
    from app.services.domain import credits as credits_service

    credits_service.replace_credits(
        db_session,
        "manga",
        manga_entry.system_id,
        "author",
        ["First Author", "Second Author"],
    )
    db_session.flush()
    return manga_entry


@pytest.fixture
def three_manga_with_credits(db_session, sample_franchise):
    """Three credited manga, for the N+1 query-count assertion."""
    from app.services.domain import credits as credits_service

    made = []
    for index in range(3):
        m = models.Manga(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            manga_name_en=f"Counted Manga {index}",
        )
        db_session.add(m)
        db_session.flush()
        credits_service.replace_credits(
            db_session, "manga", m.system_id, "author", [f"Author {index}"]
        )
        made.append(m)
    db_session.flush()
    return made


@pytest.fixture
def anime_with_studio(db_session, sample_franchise):
    """One anime carrying a studio credit and no person credits."""
    from app.services.domain import credits as credits_service

    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Studio Only",
    )
    db_session.add(a)
    db_session.flush()
    credits_service.replace_credits(
        db_session, "anime", a.system_id, "studio", ["MAPPA"]
    )
    db_session.flush()
    return a


@pytest.fixture
def sample_comic(db_session, sample_franchise):
    c = models.Comic(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        comic_name_en="Test Comic",
        reading_status="Completed",
        issue_total=6,
        issue_fin=6,
    )
    db_session.add(c)
    db_session.flush()
    return c
