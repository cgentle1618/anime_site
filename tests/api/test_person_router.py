"""The person router."""

import uuid

from app import models


def _create(admin_client, name, roles):
    return admin_client.post(
        "/api/person/", json={"name": name, "roles": roles}
    ).json()


def test_create_and_read_back(admin_client, client):
    created = _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    r = client.get(f"/api/person/{created['system_id']}")
    assert r.json()["display_name"] == "新海誠"


def test_list_filters_by_role_and_scope(admin_client, client):
    _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    _create(admin_client, "Nolan", [{"role": "director", "scope": "movie"}])

    names = [
        p["display_name"]
        for p in client.get("/api/person/?role=director&scope=anime").json()
    ]
    assert names == ["新海誠"]


def test_a_person_scoped_both_ways_appears_in_both_lists(admin_client, client):
    _create(
        admin_client,
        "宮崎駿",
        [
            {"role": "director", "scope": "anime"},
            {"role": "director", "scope": "movie"},
        ],
    )
    for scope in ("anime", "movie"):
        names = [
            p["display_name"]
            for p in client.get(f"/api/person/?role=director&scope={scope}").json()
        ]
        assert names == ["宮崎駿"]


def test_unfiltered_list_returns_everyone(admin_client, client):
    _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    # "seiyuu" is deliberately NOT a person role: anime.seiyuu is still a
    # plain string column on the entry and no credit role implies it, so
    # PersonRoleIn now rejects it. Use a real unscoped role instead.
    _create(admin_client, "澤野弘之", [{"role": "composer", "scope": "anime"}])
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
    drop = _create(admin_client, "B", [{"role": "composer", "scope": "anime"}])
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
    assert client.post("/api/person/", json={"name": "X"}).status_code in (
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
        json={"name": "誰か", "roles": [{"role": "drector", "scope": "anime"}]},
    )
    assert r.status_code == 422


def test_a_scope_illegal_for_the_role_is_rejected(admin_client):
    """
    Scope is a hyphenated media-type key, and legality is PER ROLE: `manga` is
    a real media type but a composer is never credited on one. This is the
    check a per-field validator could not make, because it cannot see the role.
    """
    r = admin_client.post(
        "/api/person/",
        json={
            "name": "誰か",
            "roles": [{"role": "composer", "scope": "manga"}],
        },
    )
    assert r.status_code == 422


def test_a_media_type_scope_is_accepted_for_a_role_that_uses_it(admin_client):
    """anime-movie was rejected before the collapse; it is now the point."""
    r = admin_client.post(
        "/api/person/",
        json={
            "name": "誰か",
            "roles": [{"role": "director", "scope": "anime-movie"}],
        },
    )
    assert r.status_code == 200


def test_a_scopeless_role_is_rejected(admin_client):
    """
    Every person_role row carries a scope - there is no "offered everywhere"
    state. An empty scope used to be stored as NULL and meant exactly that.
    """
    for bad in ("", None):
        r = admin_client.post(
            "/api/person/",
            json={
                "name": "澤野弘之",
                "roles": [{"role": "composer", "scope": bad}],
            },
        )
        assert r.status_code == 422, bad


# ---------------------------------------------------------------------------
# GET /api/person/role-counts - the Tier 3 summary the read-only System
# Options page renders. It exists so that page can show "Director: 88"
# without downloading every person row just to read a list length.
# ---------------------------------------------------------------------------


def test_role_counts_covers_every_person_role_including_the_empty_ones(client):
    from app.utils.credit_roles import PERSON_ROLES

    counts = client.get("/api/person/role-counts").json()
    assert set(counts) == set(PERSON_ROLES)
    assert all(v == 0 for v in counts.values())


def test_role_counts_tallies_people_per_role(admin_client, client):
    _create(admin_client, "新海誠", [{"role": "director", "scope": "anime"}])
    _create(admin_client, "Nolan", [{"role": "director", "scope": "movie"}])
    _create(admin_client, "澤野弘之", [{"role": "composer", "scope": "anime"}])

    counts = client.get("/api/person/role-counts").json()
    assert counts["director"] == 2
    assert counts["composer"] == 1
    assert counts["producer"] == 0


def test_role_counts_counts_a_doubly_scoped_person_once(admin_client, client):
    """A director scoped both ways has two person_role rows, but is one person."""
    _create(
        admin_client,
        "宮崎駿",
        [
            {"role": "director", "scope": "anime"},
            {"role": "director", "scope": "movie"},
        ],
    )
    assert client.get("/api/person/role-counts").json()["director"] == 1


def test_role_counts_is_not_swallowed_by_the_uuid_detail_route(client):
    """'role-counts' must not be parsed as a person system_id."""
    assert client.get("/api/person/role-counts").status_code == 200
