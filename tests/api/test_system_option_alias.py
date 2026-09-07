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


def test_an_unknown_alias_source_is_rejected(admin_client):
    """
    A typo'd source is the one alias mistake nothing else catches: the row
    saves, and then resolve_option_alias never matches it because Fill asks
    for "igdb". Validated for the same reason scopes and usages are.
    """
    response = admin_client.post(
        "/api/options/",
        json={
            "category": "Game Mode",
            "value": "多人",
            "scopes": ["game"],
            "aliases": [{"source": "IGDB", "value": "Multiplayer"}],
        },
    )
    assert response.status_code == 422
    assert "IGDB" in response.text


def test_duplicate_alias_rows_in_one_payload_are_dropped(admin_client):
    """
    uq_system_option_alias would 500 the whole save. Scopes and usages drop
    their duplicates in the validator; aliases do the same, on the pair.
    """
    created = admin_client.post(
        "/api/options/",
        json={
            "category": "Game Theme",
            "value": "奇幻",
            "scopes": ["game"],
            "aliases": [
                {"source": "igdb", "value": "Fantasy"},
                {"source": "igdb", "value": "Fantasy"},
            ],
        },
    ).json()
    assert created["aliases"] == [{"source": "igdb", "value": "Fantasy"}]


def test_an_alias_on_an_unlisted_category_is_rejected(admin_client):
    """
    Only the categories a pipeline actually reads may carry aliases.

    Nothing asks what Genre Main is called in English, so a row here would sit
    in the table doing nothing forever with no way to tell. Opening a category
    means teaching a pipeline to read it, which is a code change - hence
    ALIAS_CATEGORIES rather than an admin setting.
    """
    response = admin_client.post(
        "/api/options/",
        json={
            "category": "Genre Main",
            "value": "動作",
            "aliases": [{"source": "igdb", "value": "Action"}],
        },
    )
    assert response.status_code == 422
    assert "Genre Main" in response.text


def test_an_unlisted_category_may_still_be_saved_without_aliases(admin_client):
    """The restriction is on the alias rows, not on the category itself."""
    response = admin_client.post(
        "/api/options/",
        json={"category": "Genre Main", "value": "懸疑", "aliases": []},
    )
    assert response.status_code == 200
    assert response.json()["aliases"] == []


def test_game_platform_takes_several_aliases_for_one_value(admin_client):
    """
    Platform is the many-to-one category: a whole console generation folds
    into one brand name, which is exactly why it must be editable - a new
    console should not need a code change.
    """
    created = admin_client.post(
        "/api/options/",
        json={
            "category": "Game Platform",
            "value": "PlayStation",
            "scopes": ["game"],
            "aliases": [
                {"source": "igdb", "value": "PlayStation 4"},
                {"source": "igdb", "value": "PlayStation 5"},
            ],
        },
    ).json()
    assert [a["value"] for a in created["aliases"]] == [
        "PlayStation 4",
        "PlayStation 5",
    ]


def test_combat_mode_carries_no_aliases(admin_client):
    """PvE/PvP is hand-made; IGDB has no field for it."""
    response = admin_client.post(
        "/api/options/",
        json={
            "category": "Combat Mode",
            "value": "PvE",
            "scopes": ["game"],
            "aliases": [{"source": "igdb", "value": "PvE"}],
        },
    )
    assert response.status_code == 422
