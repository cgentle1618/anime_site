"""
The publisher table.

Shaped after Studio deliberately: same four name columns, same data-driven
display choice, same constraint idioms. It is a separate table rather than a
Studio role because most publisher/distributor values are distributors that
never developed anything - see the spec's Decision K.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_display_name_falls_back_through_the_chain():
    assert models.Publisher(name_en="Bandai Namco").display_name == "Bandai Namco"
    assert (
        models.Publisher(name_cn="木棉花", name_en="Muse").display_name == "Muse"
    ), "EN leads, matching Studio"


def test_display_name_field_wins_when_set():
    publisher = models.Publisher(
        name_en="Muse", name_cn="木棉花", display_name_field="cn"
    )
    assert publisher.display_name == "木棉花"


def test_a_publisher_with_no_name_at_all_is_rejected(db_session):
    db_session.add(models.Publisher())
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_publisher_names_are_unique_together(db_session):
    db_session.add(models.Publisher(name_en="Kadokawa"))
    db_session.commit()
    db_session.add(models.Publisher(name_en="Kadokawa"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_uniqueness_holds_when_three_of_four_names_are_null(db_session):
    """
    NULLS NOT DISTINCT. Without it the constraint is INERT for the typical row
    - Postgres treats two NULLs as distinct, so duplicates commit cleanly. The
    same lesson is already recorded on uq_studio_name and uq_person_name.
    """
    db_session.add(models.Publisher(name_cn="曼迪"))
    db_session.commit()
    db_session.add(models.Publisher(name_cn="曼迪"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_founded_date_must_be_iso(db_session):
    db_session.add(models.Publisher(name_en="Bad Date", founded_date="1990s"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_publisher_carries_no_mal_columns():
    """MAL knows nothing about game publishers or TW distributors."""
    columns = {c.name for c in models.Publisher.__table__.columns}
    assert "mal_id" not in columns
    assert "mal_link" not in columns
