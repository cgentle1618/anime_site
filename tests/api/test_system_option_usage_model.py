"""SystemOptionUsage mirrors SystemOptionScope: a child row per usage."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_usages_cascade_when_the_option_is_deleted(db_session):
    option = models.SystemOption(category="Platform", value="Netflix")
    option.usages = [models.SystemOptionUsage(usage="origin")]
    db_session.add(option)
    db_session.commit()

    db_session.delete(option)
    db_session.commit()

    assert db_session.query(models.SystemOptionUsage).count() == 0


def test_the_same_usage_cannot_be_recorded_twice(db_session):
    option = models.SystemOption(category="Platform", value="Fox")
    option.usages = [
        models.SystemOptionUsage(usage="origin"),
        models.SystemOptionUsage(usage="origin"),
    ]
    db_session.add(option)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_no_usage_rows_means_the_value_serves_both(db_session):
    option = models.SystemOption(category="Platform", value="Disney+")
    db_session.add(option)
    db_session.commit()

    assert option.usages == []
