"""
Tests for relation normalization and both-direction reads.

Needs a database for the read helpers, so it lives under tests/api/.
"""

import uuid

from app import models
from app.services.domain.media_relation import (
    find_duplicate,
    normalize_relation,
    relations_for_entry,
)


# ---------------------------------------------------------------------------
# normalize_relation — pure
# ---------------------------------------------------------------------------


def test_a_stored_kind_passes_through_unchanged():
    a, b = uuid.uuid4(), uuid.uuid4()
    assert normalize_relation("anime", a, "sequel", "movie", b) == (
        "anime", a, "sequel", "movie", b,
    )


def test_prequel_becomes_a_swapped_sequel():
    a, b = uuid.uuid4(), uuid.uuid4()
    # "B's prequel is A" is stored as "A is the sequel of B".
    assert normalize_relation("anime", b, "prequel", "manga", a) == (
        "manga", a, "sequel", "anime", b,
    )


def test_alternative_sorts_its_endpoints_so_both_orders_agree():
    a, b = uuid.uuid4(), uuid.uuid4()
    forward = normalize_relation("anime", a, "alternative", "movie", b)
    reverse = normalize_relation("movie", b, "alternative", "anime", a)
    assert forward == reverse


def test_a_directional_equivalence_kind_keeps_its_direction():
    a, b = uuid.uuid4(), uuid.uuid4()
    forward = normalize_relation("movie", a, "directors_cut", "movie", b)
    reverse = normalize_relation("movie", b, "directors_cut", "movie", a)
    assert forward != reverse


# ---------------------------------------------------------------------------
# find_duplicate
# ---------------------------------------------------------------------------


def test_find_duplicate_sees_an_existing_identical_row(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=a,
            relation_type="sequel",
            to_type="movie", to_id=b,
        )
    )
    db_session.flush()

    assert find_duplicate(db_session, "anime", a, "sequel", "movie", b) is not None
    assert find_duplicate(db_session, "anime", a, "side_story", "movie", b) is None


def test_find_duplicate_can_exclude_the_row_being_edited(db_session):
    a, b = uuid.uuid4(), uuid.uuid4()
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime", from_id=a,
        relation_type="sequel",
        to_type="movie", to_id=b,
    )
    db_session.add(row)
    db_session.flush()

    assert find_duplicate(
        db_session, "anime", a, "sequel", "movie", b, exclude_id=row.system_id
    ) is None


# ---------------------------------------------------------------------------
# relations_for_entry — both directions, correct label on each
# ---------------------------------------------------------------------------


def test_forward_and_reverse_rows_get_the_right_label(
    db_session, sample_franchise, sample_anime
):
    other = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Second Season",
    )
    db_session.add(other)
    db_session.flush()

    # `other` is the sequel of `sample_anime`.
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=other.system_id,
            relation_type="sequel",
            to_type="anime", to_id=sample_anime.system_id,
        )
    )
    db_session.flush()

    # Read from the `from` side. `other` IS the sequel, so the entry at the
    # far end - sample_anime - is its Prequel, and the label describes that
    # far entry.
    forward = relations_for_entry(db_session, "anime", other.system_id)
    assert len(forward) == 1
    assert forward[0]["label"] == "Prequel"
    assert forward[0]["direction"] == "forward"
    assert forward[0]["family"] == "timeline"
    assert forward[0]["other"]["entry_id"] == sample_anime.system_id
    assert forward[0]["other"]["missing"] is False

    # Read from the `to` side: the far entry is the sequel.
    reverse = relations_for_entry(db_session, "anime", sample_anime.system_id)
    assert len(reverse) == 1
    assert reverse[0]["label"] == "Sequel"
    assert reverse[0]["direction"] == "reverse"
    assert reverse[0]["other"]["entry_id"] == other.system_id


def test_a_symmetric_relation_reads_the_same_from_both_sides(
    db_session, sample_anime, sample_franchise
):
    movie = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Compilation Movie",
    )
    db_session.add(movie)
    db_session.flush()

    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=sample_anime.system_id,
            relation_type="alternative",
            to_type="movie", to_id=movie.system_id,
        )
    )
    db_session.flush()

    from_anime = relations_for_entry(db_session, "anime", sample_anime.system_id)
    from_movie = relations_for_entry(db_session, "movie", movie.system_id)
    assert from_anime[0]["label"] == "Alternative"
    assert from_movie[0]["label"] == "Alternative"


def test_a_deleted_target_resolves_to_missing(db_session, sample_anime):
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=sample_anime.system_id,
            relation_type="adaptation",
            to_type="manga", to_id=uuid.uuid4(),  # never existed
        )
    )
    db_session.flush()

    rows = relations_for_entry(db_session, "anime", sample_anime.system_id)
    assert len(rows) == 1
    assert rows[0]["other"]["missing"] is True
    assert rows[0]["other"]["display_name"] is None
    # sample_anime is the adaptation, so the entry it adapts is the Source.
    assert rows[0]["label"] == "Source"
