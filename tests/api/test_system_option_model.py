"""The reshaped system_option table."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_option_gets_a_uuid_primary_key(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()
    assert opt.system_id is not None


def test_category_and_value_are_unique_together(db_session):
    db_session.add(models.SystemOption(category="Genre Main", value="Action"))
    db_session.commit()
    db_session.add(models.SystemOption(category="Genre Main", value="Action"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_same_value_in_two_categories_is_allowed(db_session):
    db_session.add(models.SystemOption(category="Genre Main", value="Action"))
    db_session.add(models.SystemOption(category="Genre Sub", value="Action"))
    db_session.commit()


def test_sort_order_defaults_to_zero(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()
    assert opt.sort_order == 0


def test_scopes_cascade_when_the_option_is_deleted(db_session):
    opt = models.SystemOption(category="Official Source", value="Netflix")
    db_session.add(opt)
    db_session.commit()
    db_session.add(
        models.SystemOptionScope(option_id=opt.system_id, scope="tv-show")
    )
    db_session.commit()

    db_session.delete(opt)
    db_session.commit()
    assert db_session.query(models.SystemOptionScope).count() == 0


def test_one_scope_cannot_be_recorded_twice(db_session):
    opt = models.SystemOption(category="Official Source", value="Netflix")
    db_session.add(opt)
    db_session.commit()
    db_session.add(
        models.SystemOptionScope(option_id=opt.system_id, scope="tv-show")
    )
    db_session.commit()
    db_session.add(
        models.SystemOptionScope(option_id=opt.system_id, scope="tv-show")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
