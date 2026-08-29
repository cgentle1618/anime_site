"""The person router."""

import uuid

from app import models


def _create(admin_client, name, roles):
    return admin_client.post(
        "/api/person/", json={"name_native": name, "roles": roles}
    ).json()


def test_create_and_read_back(admin_client, client):
    created = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    r = client.get(f"/api/person/{created['system_id']}")
    assert r.json()["name_native"] == "新海誠"


def test_list_filters_by_role_and_scope(admin_client, client):
    _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    _create(admin_client, "Nolan", [{"role": "director", "scope": "non_anime"}])

    names = [
        p["name_native"]
        for p in client.get("/api/person/?role=director&scope=anime").json()
    ]
    assert names == ["新海誠"]


def test_a_person_scoped_both_ways_appears_in_both_lists(admin_client, client):
    _create(
        admin_client,
        "宮崎駿",
        [
            {"role": "director", "scope": "anime"},
            {"role": "director", "scope": "non_anime"},
        ],
    )
    for scope in ("anime", "non_anime"):
        names = [
            p["name_native"]
            for p in client.get(f"/api/person/?role=director&scope={scope}").json()
        ]
        assert names == ["宮崎駿"]


def test_unfiltered_list_returns_everyone(admin_client, client):
    _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    # "seiyuu" is deliberately NOT a person role: anime.seiyuu is still a
    # plain string column on the entry and no credit role implies it, so
    # PersonRoleIn now rejects it. Use a real unscoped role instead.
    _create(admin_client, "澤野弘之", [{"role": "composer", "scope": None}])
    assert len(client.get("/api/person/").json()) == 2


def test_response_carries_a_credit_count(admin_client, client, db_session):
    created = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=created["system_id"],
        )
    )
    db_session.commit()
    assert client.get(f"/api/person/{created['system_id']}").json()["credit_count"] == 1


def test_delete_cascades_the_credits(admin_client, db_session):
    created = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=created["system_id"],
        )
    )
    db_session.commit()

    assert admin_client.delete(f"/api/person/{created['system_id']}").status_code == 200
    assert db_session.query(models.MediaCredit).count() == 0


def test_merge_repoints_credits_onto_the_survivor(admin_client, db_session):
    # Two names that do NOT normalize to the same key - POST /api/person now
    # dedupes on that key, so a same-key "duplicate" can no longer be created
    # through the API at all. Merge exists for the duplicates normalization
    # cannot catch: the same human entered under two different spellings.
    keep = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    drop = _create(
        admin_client, "Makoto Shinkai", [{"role": "director", "scope": "anime"}]
    )
    entry_id = uuid.uuid4()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=entry_id,
            role="director",
            person_id=drop["system_id"],
        )
    )
    db_session.commit()

    r = admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert r.status_code == 200
    assert db_session.query(models.Person).count() == 1
    credit = db_session.query(models.MediaCredit).one()
    assert str(credit.person_id) == keep["system_id"]


def test_merge_does_not_duplicate_a_credit_both_already_had(
    admin_client, db_session
):
    keep = _create(admin_client, "A", [{"role": "director", "scope": "anime"}])
    drop = _create(admin_client, "B", [{"role": "director", "scope": "anime"}])
    entry_id = uuid.uuid4()
    for pid in (keep["system_id"], drop["system_id"]):
        db_session.add(
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=pid,
            )
        )
    db_session.commit()

    admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    assert db_session.query(models.MediaCredit).count() == 1


def test_merge_unions_the_roles(admin_client, db_session):
    keep = _create(admin_client, "A", [{"role": "director", "scope": "anime"}])
    drop = _create(admin_client, "B", [{"role": "composer", "scope": None}])
    admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": drop["system_id"]},
    )
    person = db_session.get(models.Person, uuid.UUID(keep["system_id"]))
    assert {r.role for r in person.roles} == {"director", "composer"}


def test_merge_into_itself_is_rejected(admin_client):
    keep = _create(admin_client, "A", [{"role": "director", "scope": "anime"}])
    r = admin_client.post(
        f"/api/person/{keep['system_id']}/merge",
        json={"source_id": keep["system_id"]},
    )
    assert r.status_code == 400


def test_writes_require_admin(client):
    assert client.post("/api/person/", json={"name_native": "X"}).status_code in (
        401,
        403,
    )


def test_an_unknown_person_role_is_rejected(admin_client):
    """
    The frontend is now a routine writer of role strings (ensureSourceValues
    POSTs one whenever a typed name is missing from a suggestion list), so a
    typo in a fieldMeta.js descriptor would otherwise create a person holding
    a role no dropdown ever queries.
    """
    r = admin_client.post(
        "/api/person/",
        json={"name_native": "誰か", "roles": [{"role": "drector", "scope": None}]},
    )
    assert r.status_code == 422


def test_an_unknown_person_role_scope_is_rejected(admin_client):
    """Role scope is anime / non_anime - never a hyphenated media type key."""
    r = admin_client.post(
        "/api/person/",
        json={
            "name_native": "誰か",
            "roles": [{"role": "director", "scope": "anime-movie"}],
        },
    )
    assert r.status_code == 422


def test_an_empty_scope_string_is_stored_as_null(admin_client, db_session):
    created = admin_client.post(
        "/api/person/",
        json={"name_native": "澤野弘之", "roles": [{"role": "composer", "scope": ""}]},
    ).json()
    role = (
        db_session.query(models.PersonRole)
        .filter_by(person_id=created["system_id"])
        .one()
    )
    assert role.scope is None
