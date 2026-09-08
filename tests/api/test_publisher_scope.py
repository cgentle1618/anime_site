"""
publisher_scope: which media types a publisher is offered on.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_a_publisher_holds_scopes(db):
    pub = models.Publisher(name_en="Aniplex")
    db.add(pub)
    db.flush()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="anime"))
    db.commit()
    db.refresh(pub)
    assert [s.scope for s in pub.scopes] == ["anime"]


def test_the_same_scope_cannot_be_held_twice(db):
    pub = models.Publisher(name_en="Kadokawa")
    db.add(pub)
    db.flush()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="manga"))
    db.commit()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="manga"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_deleting_the_publisher_cascades_its_scopes(db):
    pub = models.Publisher(name_en="Muse")
    db.add(pub)
    db.flush()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="anime"))
    db.commit()
    db.delete(pub)
    db.commit()
    assert db.query(models.PublisherScope).count() == 0


def test_resolve_publisher_adds_the_scope_additively(db):
    from app.services.domain.credits import resolve_publisher

    first = resolve_publisher(db, "Bandai Namco", scope="game")
    db.commit()
    again = resolve_publisher(db, "Bandai Namco", scope="anime")
    db.commit()

    assert again.system_id == first.system_id
    # Additive: the game scope survives the anime one being added.
    assert sorted(s.scope for s in again.scopes) == ["anime", "game"]


def test_resolve_publisher_does_not_duplicate_a_held_scope(db):
    from app.services.domain.credits import resolve_publisher

    resolve_publisher(db, "Muse", scope="anime")
    db.commit()
    pub = resolve_publisher(db, "Muse", scope="anime")
    db.commit()
    assert [s.scope for s in pub.scopes] == ["anime"]


def test_the_list_endpoint_filters_by_scope(admin_client):
    admin_client.post("/api/publisher/",
                      json={"name_en": "Anime Only", "scopes": ["anime"]})
    admin_client.post("/api/publisher/",
                      json={"name_en": "Game Only", "scopes": ["game"]})

    names = [
        p["name_en"]
        for p in admin_client.get("/api/publisher/?scope=anime").json()
    ]
    assert names == ["Anime Only"]


def test_an_illegal_scope_is_rejected(admin_client):
    res = admin_client.post("/api/publisher/",
                            json={"name_en": "Nope", "scopes": ["tv-show"]})
    assert res.status_code == 422


def test_update_replaces_the_whole_scope_set(admin_client):
    created = admin_client.post(
        "/api/publisher/",
        json={"name_en": "Shifty", "scopes": ["anime", "manga"]},
    ).json()
    res = admin_client.put(
        f"/api/publisher/{created['system_id']}",
        json={"name_en": "Shifty", "scopes": ["novel"]},
    )
    assert res.json()["scopes"] == ["novel"]


def test_merge_unions_the_scopes(admin_client):
    keep = admin_client.post(
        "/api/publisher/", json={"name_en": "Keep", "scopes": ["anime"]}
    ).json()
    drop = admin_client.post(
        "/api/publisher/", json={"name_en": "Drop", "scopes": ["manga"]}
    ).json()
    admin_client.post(
        f"/api/publisher/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )

    survivor = admin_client.get(f"/api/publisher/{keep['system_id']}").json()
    assert sorted(survivor["scopes"]) == ["anime", "manga"]


def test_the_response_validates_straight_from_the_orm_row(db):
    """
    /api/search hands the ORM publisher to the response model rather than
    building it field by field, the way PersonRoleIn's from_attributes note
    records. `scopes` is list[str], so the rows must coerce to their values.
    """
    from app import schemas

    pub = models.Publisher(name_en="Sega")
    db.add(pub)
    db.flush()
    db.add(models.PublisherScope(publisher_id=pub.system_id, scope="game"))
    db.commit()
    db.refresh(pub)

    assert schemas.PublisherResponse.model_validate(pub).scopes == ["game"]
