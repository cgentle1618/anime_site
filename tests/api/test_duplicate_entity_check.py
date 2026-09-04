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
        [models.Studio(name_en="MAPPA"), models.Studio(name_en="ＭＡＰＰＡ")]
    )
    db_session.commit()
    found = find_duplicate_entities(db_session)
    assert found[0]["kind"] == "studio"


def test_a_person_and_a_studio_sharing_a_name_are_not_duplicates(db_session):
    db_session.add(models.Person(name_native="Ghibli"))
    db_session.add(models.Studio(name_en="Ghibli"))
    db_session.commit()
    assert find_duplicate_entities(db_session) == []


def test_name_en_only_collision_is_flagged(db_session):
    db_session.add_all(
        [
            models.Person(name_native="宮崎駿", name_en="Hayao Miyazaki"),
            models.Person(name_native="宮﨑駿", name_en="Hayao Miyazaki"),
        ]
    )
    db_session.commit()
    found = find_duplicate_entities(db_session)
    assert len(found) == 1
    assert sorted(found[0]["names"]) == sorted(["宮崎駿", "宮﨑駿"])


def test_null_name_en_does_not_collapse_distinct_people(db_session):
    db_session.add_all(
        [
            models.Person(name_native="新海誠", name_en=None),
            models.Person(name_native="宮崎駿", name_en=None),
            models.Person(name_native="細田守", name_en=None),
        ]
    )
    db_session.commit()
    assert find_duplicate_entities(db_session) == []


def test_transitive_closure_across_fields_forms_one_cluster(db_session):
    # A and B share name_native; B and C share name_en. A and C share neither
    # field directly, so only union-find (not naive per-field grouping) puts
    # all three in one cluster.
    db_session.add_all(
        [
            models.Person(name_native="田中太郎", name_en="Taro A"),
            models.Person(name_native="田中太郎 ", name_en="Taro B"),
            models.Person(name_native="Someone Else", name_en="Taro B"),
        ]
    )
    db_session.commit()
    found = find_duplicate_entities(db_session)
    assert len(found) == 1
    assert len(found[0]["ids"]) == 3
