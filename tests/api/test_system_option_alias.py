"""
What an external source calls a vocabulary value.

The third sibling of system_option_scope ("in which media types") and
system_option_usage ("for what"). Unlike those two, absence of alias rows does
NOT mean "matches everything" - an alias is a lookup, not a filter.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.routers.options import resolve_option_alias


@pytest.fixture
def genre_option(db_session):
    option = models.SystemOption(category="Game Genre", value="角色扮演")
    db_session.add(option)
    db_session.flush()
    db_session.add(
        models.SystemOptionAlias(
            option_id=option.system_id, source="igdb", value="Role-playing (RPG)"
        )
    )
    db_session.commit()
    return option


def test_alias_resolves_to_the_chinese_value(db_session, genre_option):
    found = resolve_option_alias(db_session, "Game Genre", "igdb", "Role-playing (RPG)")
    assert found is not None
    assert found.value == "角色扮演"


def test_an_unknown_alias_resolves_to_none(db_session, genre_option):
    assert resolve_option_alias(db_session, "Game Genre", "igdb", "Roguelite") is None


def test_alias_lookup_is_scoped_to_its_category(db_session, genre_option):
    """The same English string may mean different things in two vocabularies."""
    assert (
        resolve_option_alias(db_session, "Game Theme", "igdb", "Role-playing (RPG)")
        is None
    )


def test_one_option_may_carry_several_aliases(db_session, genre_option):
    db_session.add(
        models.SystemOptionAlias(
            option_id=genre_option.system_id, source="igdb", value="RPG"
        )
    )
    db_session.commit()
    assert len(genre_option.aliases) == 2


def test_a_duplicate_alias_is_rejected(db_session, genre_option):
    db_session.add(
        models.SystemOptionAlias(
            option_id=genre_option.system_id, source="igdb", value="Role-playing (RPG)"
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_deleting_the_option_deletes_its_aliases(db_session, genre_option):
    db_session.delete(genre_option)
    db_session.commit()
    assert db_session.query(models.SystemOptionAlias).count() == 0


def test_aliases_round_trip_through_the_options_api(admin_client, db_session):
    created = admin_client.post(
        "/api/options/",
        json={
            "category": "Game Mode",
            "value": "單人",
            "scopes": ["game"],
            "aliases": [{"source": "igdb", "value": "Single player"}],
        },
    ).json()
    assert created["aliases"] == [{"source": "igdb", "value": "Single player"}]

    updated = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={
            "category": "Game Mode",
            "value": "單人",
            "scopes": ["game"],
            "aliases": [{"source": "igdb", "value": "Singleplayer"}],
        },
    ).json()
    assert updated["aliases"] == [{"source": "igdb", "value": "Singleplayer"}]
