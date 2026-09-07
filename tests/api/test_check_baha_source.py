"""
Check's Bahamut rule writes the media_source row, not the retired column.

The rule has always been "a Bahamut link means the entry is available on
Bahamut, unless someone already said otherwise". Since the media_source
change the link and the verdict live on the entry's `main` access row, so the
rule has to be applied there - the old source_baha / baha_link columns were
read by nothing and have been dropped.
"""

import pytest

from app import models
from app.services.domain.checking import apply_check_baha
from app.utils.source_fields import BAHAMUT_VALUE, PLATFORM_CATEGORY


@pytest.fixture
def bahamut(db_session):
    option = models.SystemOption(category=PLATFORM_CATEGORY, value=BAHAMUT_VALUE)
    db_session.add(option)
    db_session.flush()
    return option


def _row(db_session, entry, option, **kwargs):
    row = models.MediaSource(
        media_type="anime",
        entry_id=entry.system_id,
        kind="access",
        bucket="main",
        option_id=option.system_id,
        **kwargs,
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_a_bahamut_row_with_a_url_becomes_available(
    db_session, sample_anime, bahamut
):
    row = _row(db_session, sample_anime, bahamut, url="https://ani.gamer.com.tw/1")

    apply_check_baha(db_session, sample_anime, "anime")
    db_session.flush()

    assert row.available is True


def test_an_existing_verdict_is_not_overwritten(db_session, sample_anime, bahamut):
    row = _row(
        db_session,
        sample_anime,
        bahamut,
        url="https://ani.gamer.com.tw/1",
        available=False,
    )

    apply_check_baha(db_session, sample_anime, "anime")
    db_session.flush()

    assert row.available is False


def test_a_row_without_a_url_is_left_alone(db_session, sample_anime, bahamut):
    row = _row(db_session, sample_anime, bahamut)

    apply_check_baha(db_session, sample_anime, "anime")
    db_session.flush()

    assert row.available is None


def test_no_bahamut_row_is_not_an_error(db_session, sample_anime):
    apply_check_baha(db_session, sample_anime, "anime")


def test_another_platform_is_untouched(db_session, sample_anime):
    option = models.SystemOption(category=PLATFORM_CATEGORY, value="Netflix")
    db_session.add(option)
    db_session.flush()
    row = _row(db_session, sample_anime, option, url="https://netflix.test/1")

    apply_check_baha(db_session, sample_anime, "anime")
    db_session.flush()

    assert row.available is None

