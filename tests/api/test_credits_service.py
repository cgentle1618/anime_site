"""Name <-> entity resolution and link replacement."""

import uuid

from app import models
from app.services.domain import credits as svc


def test_resolve_person_creates_once_and_reuses(db_session):
    a = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    b = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert a.system_id == b.system_id
    assert db_session.query(models.Person).count() == 1


def test_resolve_person_matches_across_spelling_variants(db_session):
    a = svc.resolve_person(db_session, "新海 誠", role="director", scope="anime")
    b = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert a.system_id == b.system_id


def test_resolve_person_keeps_the_first_spelling(db_session):
    svc.resolve_person(db_session, "新海 誠", role="director", scope="anime")
    p = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert p.name_native == "新海 誠"


def test_resolve_person_records_the_role(db_session):
    p = svc.resolve_person(db_session, "新海誠", role="director", scope="anime")
    assert [(r.role, r.scope) for r in p.roles] == [("director", "anime")]


def test_resolve_person_adds_a_second_scope_without_duplicating_the_person(
    db_session,
):
    svc.resolve_person(db_session, "宮崎駿", role="director", scope="anime")
    p = svc.resolve_person(db_session, "宮崎駿", role="director", scope="non_anime")
    assert db_session.query(models.Person).count() == 1
    assert {r.scope for r in p.roles} == {"anime", "non_anime"}


def test_resolve_studio_creates_once(db_session):
    a = svc.resolve_studio(db_session, "MAPPA")
    b = svc.resolve_studio(db_session, "ＭＡＰＰＡ")
    assert a.system_id == b.system_id


def test_resolve_option_creates_within_a_category(db_session):
    a = svc.resolve_option(db_session, "Genre Main", "Action")
    b = svc.resolve_option(db_session, "Genre Sub", "Action")
    assert a.system_id != b.system_id


def test_resolve_option_records_a_scope(db_session):
    o = svc.resolve_option(
        db_session, "Official Source", "Netflix", scope="tv-show"
    )
    assert [s.scope for s in o.scopes] == ["tv-show"]


def test_replace_credits_writes_rows_in_order(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == ["A", "B"]


def test_replace_credits_is_idempotent(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    assert db_session.query(models.MediaCredit).count() == 2


def test_replace_credits_removes_names_no_longer_listed(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A", "B"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["B"])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == ["B"]


def test_replace_credits_leaves_other_roles_alone(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A"])
    svc.replace_credits(db_session, "anime", entry_id, "director", ["D"])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == ["A"]


def test_replace_credits_with_an_empty_list_clears_the_role(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "studio", ["A"])
    svc.replace_credits(db_session, "anime", entry_id, "studio", [])
    assert svc.credit_names(db_session, "anime", entry_id, "studio") == []


def test_replace_credits_does_not_delete_the_person_itself(db_session):
    entry_id = uuid.uuid4()
    svc.replace_credits(db_session, "anime", entry_id, "director", ["D"])
    svc.replace_credits(db_session, "anime", entry_id, "director", [])
    assert db_session.query(models.Person).count() == 1


def test_replace_tags_round_trips(db_session):
    entry_id = uuid.uuid4()
    svc.replace_tags(db_session, "anime", entry_id, "genre_main", ["Action", "SF"])
    assert svc.tag_values(db_session, "anime", entry_id, "genre_main") == [
        "Action",
        "SF",
    ]


def test_director_scope_follows_the_media_type(db_session):
    svc.replace_credits(db_session, "movie", uuid.uuid4(), "director", ["Nolan"])
    p = db_session.query(models.Person).one()
    assert [r.scope for r in p.roles] == ["non_anime"]
