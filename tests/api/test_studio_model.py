"""The studio table."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_studio_needs_only_a_native_name(db_session):
    s = models.Studio(name_native="MAPPA")
    db_session.add(s)
    db_session.commit()
    assert s.system_id is not None


def test_studio_names_are_unique_together(db_session):
    db_session.add(models.Studio(name_native="MAPPA", name_en="MAPPA"))
    db_session.commit()
    db_session.add(models.Studio(name_native="MAPPA", name_en="MAPPA"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_carries_a_rating_and_a_logo(db_session):
    s = models.Studio(name_native="京都アニメーション", my_rating="S", logo_file="k.png")
    db_session.add(s)
    db_session.commit()
    assert (s.my_rating, s.logo_file) == ("S", "k.png")


def test_studio_has_no_role_table():
    assert not hasattr(models.Studio, "roles")
