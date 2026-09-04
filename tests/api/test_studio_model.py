"""The studio table."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_studio_needs_only_one_name(db_session):
    s = models.Studio(name_jp="京都アニメーション")
    db_session.add(s)
    db_session.commit()
    assert s.system_id is not None


def test_studio_with_no_name_at_all_is_rejected(db_session):
    db_session.add(models.Studio())
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_names_are_unique_together(db_session):
    db_session.add(models.Studio(name_en="MAPPA"))
    db_session.commit()
    db_session.add(models.Studio(name_en="MAPPA"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_carries_the_profile_columns(db_session):
    s = models.Studio(
        name_en="Kyoto Animation",
        name_jp="京都アニメーション",
        name_cn="京都動畫",
        name_alt="KyoAni",
        display_name_field="alt",
        my_rating="S",
        logo_file="k.png",
        founded_date="1985-11",
        country="Japan",
        website_url="https://www.kyotoanimation.co.jp/",
        mal_id=2,
    )
    db_session.add(s)
    db_session.commit()
    assert (s.country, s.founded_date, s.mal_id) == ("Japan", "1985-11", 2)


def test_founded_date_must_be_truncated_iso(db_session):
    db_session.add(models.Studio(name_en="Bad Date", founded_date="Nov 1985"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_studio_has_no_role_table():
    assert not hasattr(models.Studio, "roles")
