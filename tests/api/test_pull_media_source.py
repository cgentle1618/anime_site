"""
A Media Source row survives backup -> pull with a different local uuid.

media_source mints its own system_id but cites its entry by (media_type,
entry_id) - identical in every database - and its option by (category, value)
rather than by option_id, which is database-local (system_option is itself a
DERIVED_IDENTITY tab). DERIVED_IDENTITY_KEYS["Media Source"] therefore
includes option_id: it is resolved from the sheet's option_category/
option_value into a LOCAL option_id before the natural-key match runs, so two
"main" rows on the same entry that point at different platforms (both with
name=NULL) are correctly treated as two different rows, not a collision.
"""

import uuid

from app import models
from app.services.pipelines import pull

MEDIA_SOURCE_HEADERS = [
    "system_id",
    "media_type",
    "entry_id",
    "kind",
    "bucket",
    "option_category",
    "option_value",
    "name",
    "available",
    "url",
    "position",
    "created_at",
]


def test_pulling_the_same_row_twice_does_not_duplicate(db_session, sample_anime):
    from app.services.pipelines.pull import _match_by_natural_key

    payload = {
        "media_type": "anime",
        "entry_id": sample_anime.system_id,
        "kind": "access",
        "bucket": "other",
        "option_id": None,
        "name": "Site",
    }
    db_session.add(models.MediaSource(**payload))
    db_session.commit()

    # A second machine's export carries a different system_id for the same row.
    match = _match_by_natural_key(db_session, "Media Source", dict(payload))
    assert match is not None
    assert match.name == "Site"


def test_a_partial_key_never_matches(db_session, sample_anime):
    from app.services.pipelines.pull import _match_by_natural_key

    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="other",
            name="Site",
        )
    )
    db_session.commit()

    assert _match_by_natural_key(db_session, "Media Source", {"media_type": "anime"}) is None


def test_two_options_on_the_same_entry_do_not_collide(db_session, sample_anime):
    """Two 'main' rows citing different platforms both have name=NULL; only
    option_id (added to the natural key) tells them apart."""
    from app.services.pipelines.pull import _match_by_natural_key

    netflix = models.SystemOption(category="Platform", value="Netflix", sort_order=1)
    crunchyroll = models.SystemOption(category="Platform", value="Crunchyroll", sort_order=2)
    db_session.add_all([netflix, crunchyroll])
    db_session.flush()

    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="main",
            option_id=netflix.system_id,
        )
    )
    db_session.commit()

    same_entry_different_option = {
        "media_type": "anime",
        "entry_id": sample_anime.system_id,
        "kind": "access",
        "bucket": "main",
        "option_id": crunchyroll.system_id,
        "name": None,
    }
    assert _match_by_natural_key(db_session, "Media Source", same_entry_different_option) is None

    same_row = {
        "media_type": "anime",
        "entry_id": sample_anime.system_id,
        "kind": "access",
        "bucket": "main",
        "option_id": netflix.system_id,
        "name": None,
    }
    assert _match_by_natural_key(db_session, "Media Source", same_row) is not None


def test_full_pull_resolves_option_category_and_value_into_a_local_option_id(
    db_session, sample_anime, monkeypatch
):
    """End-to-end through execute_pull_specific: the sheet never carries a raw
    option_id (it is database-local), only the option's category and value."""
    netflix = models.SystemOption(category="Platform", value="Netflix", sort_order=1)
    db_session.add(netflix)
    db_session.commit()

    row = [
        str(uuid.uuid4()),
        "anime",
        str(sample_anime.system_id),
        "access",
        "main",
        "Platform",
        "Netflix",
        "",
        "TRUE",
        "https://netflix.test",
        "1",
        "",
    ]
    monkeypatch.setattr(
        pull, "get_all_raw_rows", lambda tab: [MEDIA_SOURCE_HEADERS, row]
    )

    result = pull.execute_pull_specific(db_session, "Media Source", log_action=False)

    assert result["status"] == "success"
    sources = db_session.query(models.MediaSource).all()
    assert len(sources) == 1
    assert sources[0].option_id == netflix.system_id
    assert sources[0].name is None
    assert sources[0].available is True


def test_an_unresolvable_option_skips_its_row_not_the_whole_tab(
    db_session, sample_anime, monkeypatch
):
    """
    A platform renamed on one machine must not fail the other machine's pull.
    Leaving option_id NULL on a `main` row violates
    ck_media_source_one_target and rolls the entire tab back, so the row is
    logged and skipped - exactly what the Series-FK branch above it does.
    """
    netflix = models.SystemOption(category="Platform", value="Netflix", sort_order=1)
    db_session.add(netflix)
    db_session.commit()

    good = [
        str(uuid.uuid4()),
        "anime",
        str(sample_anime.system_id),
        "access",
        "main",
        "Platform",
        "Netflix",
        "",
        "TRUE",
        "https://netflix.test",
        "1",
        "",
    ]
    bad = [
        str(uuid.uuid4()),
        "anime",
        str(sample_anime.system_id),
        "access",
        "main",
        "Platform",
        "SomePlatformThisDatabaseHasNeverHeardOf",
        "",
        "",
        "https://unknown.test",
        "0",
        "",
    ]
    monkeypatch.setattr(
        pull, "get_all_raw_rows", lambda tab: [MEDIA_SOURCE_HEADERS, good, bad]
    )

    result = pull.execute_pull_specific(db_session, "Media Source", log_action=False)

    assert result["status"] == "success"
    sources = db_session.query(models.MediaSource).all()
    assert len(sources) == 1
    assert sources[0].option_id == netflix.system_id
