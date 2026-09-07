"""The character table."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_display_name_uses_the_chosen_field(db_session):
    c = models.Character(name_en="Ichika", name_jp="一花", display_name_field="jp")
    db_session.add(c)
    db_session.flush()
    assert c.display_name == "一花"


def test_display_name_falls_back_when_the_chosen_field_is_empty(db_session):
    c = models.Character(name_en="Ichika", display_name_field="jp")
    db_session.add(c)
    db_session.flush()
    assert c.display_name == "Ichika"


def test_a_character_needs_at_least_one_name(db_session):
    db_session.add(models.Character(gender="Female"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_two_unrelated_characters_may_share_a_name(db_session):
    """
    Decision G. Character names are NOT unique - 'Yuki' recurs across unrelated
    works and there is no owning franchise to scope a constraint to. This test
    exists so that anyone 'restoring' a uq_character_name to match uq_person_name
    fails loudly instead of silently merging two people's favourite characters.
    """
    db_session.add(models.Character(name_en="Yuki"))
    db_session.add(models.Character(name_en="Yuki"))
    db_session.flush()
    assert db_session.query(models.Character).filter_by(name_en="Yuki").count() == 2
