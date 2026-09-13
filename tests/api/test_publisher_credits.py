"""
Credits against a third entity target.

app/services/domain/credits.py used to read
`if spec.target == "studio": ... else: <person>`, so `else` MEANT person. A
publisher role reaching that branch would silently create a Person row - the
failure this file exists to prevent.
"""

from app import models
from app.services.domain.credits import credit_names, replace_credits
from app.utils import credit_roles as cr


def test_the_role_targets_the_publisher_table():
    assert cr.CREDIT_ROLES["publisher"].target == "publisher"


def test_target_is_a_three_value_axis():
    assert {r.target for r in cr.CREDIT_ROLES.values()} == {
        "person",
        "studio",
        "publisher",
    }


def test_person_roles_still_exclude_the_two_company_targets():
    assert "publisher" not in cr.PERSON_ROLES
    assert "studio" not in cr.PERSON_ROLES


def _game_id(db_session, name="Elden Ring"):
    """media_credit.media_id is a real FK, so the entry has to exist."""
    g = models.Game(game_name_en=name)
    db_session.add(g)
    db_session.flush()
    return g.system_id


def test_replacing_a_publisher_credit_creates_a_publisher_not_a_person(db_session):
    entry_id = _game_id(db_session)
    replace_credits(db_session, "game", entry_id, "publisher", ["Bandai Namco"])
    db_session.flush()

    assert db_session.query(models.Publisher).count() == 1
    assert db_session.query(models.Person).count() == 0
    assert credit_names(db_session, entry_id, "publisher") == ["Bandai Namco"]


def test_renaming_a_publisher_changes_every_entry_that_credits_it(db_session):
    entry_id = _game_id(db_session)
    replace_credits(db_session, "game", entry_id, "publisher", ["Bandai"])
    db_session.flush()
    publisher = db_session.query(models.Publisher).one()
    publisher.name_en = "Bandai Namco"
    db_session.flush()
    assert credit_names(db_session, entry_id, "publisher") == ["Bandai Namco"]


def test_a_studio_and_a_publisher_of_the_same_name_are_separate_rows(db_session):
    entry_id = _game_id(db_session)
    replace_credits(db_session, "game", entry_id, "studio", ["Bandai Namco"])
    replace_credits(db_session, "game", entry_id, "publisher", ["Bandai Namco"])
    db_session.flush()
    assert db_session.query(models.Studio).count() == 1
    assert db_session.query(models.Publisher).count() == 1
