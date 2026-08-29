"""Finding entities that differ only by spelling."""

from app import models
from app.services.domain.checking import find_duplicate_entities


def test_no_duplicates_is_an_empty_list(db_session):
    db_session.add(models.Person(name_native="新海誠"))
    db_session.commit()
    assert find_duplicate_entities(db_session) == []


def test_interior_whitespace_variants_are_flagged(db_session):
    db_session.add_all(
        [models.Person(name_native="新海誠"), models.Person(name_native="新海 誠")]
    )
    db_session.commit()
    found = find_duplicate_entities(db_session)
    assert len(found) == 1
    assert sorted(found[0]["names"]) == sorted(["新海誠", "新海 誠"])


def test_full_width_variants_are_flagged(db_session):
    db_session.add_all(
        [models.Studio(name_native="MAPPA"), models.Studio(name_native="ＭＡＰＰＡ")]
    )
    db_session.commit()
    found = find_duplicate_entities(db_session)
    assert found[0]["kind"] == "studio"


def test_a_person_and_a_studio_sharing_a_name_are_not_duplicates(db_session):
    db_session.add(models.Person(name_native="Ghibli"))
    db_session.add(models.Studio(name_native="Ghibli"))
    db_session.commit()
    assert find_duplicate_entities(db_session) == []
