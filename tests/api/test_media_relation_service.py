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


# ---------------------------------------------------------------------------
# relations_for_entry — the transitive closure over peer kinds
# ---------------------------------------------------------------------------


def _anime(db_session, franchise, name):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
    )
    db_session.add(a)
    db_session.flush()
    return a


def _link(db_session, kind, left, right):
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime", from_id=left.system_id,
            relation_type=kind,
            to_type="anime", to_id=right.system_id,
        )
    )
    db_session.flush()


def _by_name(rows):
    return {r["other"]["display_name"]: r for r in rows}


def test_a_corresponding_chain_makes_all_three_routes_peers(
    db_session, sample_franchise
):
    # The Fate/stay night case. Two stored rows - F/SN-UBW and UBW-HF - and
    # every one of the three pages has to list the other two.
    fsn = _anime(db_session, sample_franchise, "Fate/stay night")
    ubw = _anime(db_session, sample_franchise, "Unlimited Blade Works")
    hf = _anime(db_session, sample_franchise, "Heavens Feel")
    _link(db_session, "corresponding", fsn, ubw)
    _link(db_session, "corresponding", ubw, hf)

    for entry in (fsn, ubw, hf):
        rows = relations_for_entry(db_session, "anime", entry.system_id)
        assert len(rows) == 2, f"{entry.anime_name_en} sees {len(rows)}"
        assert all(r["relation_type"] == "corresponding" for r in rows)
        assert all(r["label"] == "Corresponding" for r in rows)
        assert all(r["family"] == "equivalence" for r in rows)

    # Only F/SN and HF are the pair no row names, so only they are derived.
    ubw_rows = relations_for_entry(db_session, "anime", ubw.system_id)
    assert [r["derived"] for r in ubw_rows] == [False, False]

    fsn_rows = _by_name(relations_for_entry(db_session, "anime", fsn.system_id))
    assert fsn_rows["Unlimited Blade Works"]["derived"] is False
    assert fsn_rows["Heavens Feel"]["derived"] is True
    # The chain arrived through UBW, which is what the page can say.
    assert fsn_rows["Heavens Feel"]["via"] == "Unlimited Blade Works"
    assert fsn_rows["Heavens Feel"]["system_id"] is None


def test_a_stored_row_is_never_reported_as_derived(db_session, sample_franchise):
    # All three pairs stored explicitly: the closure must add nothing, and must
    # not shadow a real row with a derived duplicate.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    _link(db_session, "corresponding", a, b)
    _link(db_session, "corresponding", b, c)
    _link(db_session, "corresponding", a, c)

    rows = relations_for_entry(db_session, "anime", a.system_id)
    assert len(rows) == 2
    assert all(r["derived"] is False for r in rows)
    assert all(r["system_id"] is not None for r in rows)


def test_the_closure_carries_along_a_longer_chain(db_session, sample_franchise):
    # A-B-C-D stored as three rows. A's page sees all three others, and D is
    # reached through C rather than through the row A was written with.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    d = _anime(db_session, sample_franchise, "D")
    _link(db_session, "corresponding", a, b)
    _link(db_session, "corresponding", b, c)
    _link(db_session, "corresponding", c, d)

    rows = _by_name(relations_for_entry(db_session, "anime", a.system_id))
    assert set(rows) == {"B", "C", "D"}
    assert rows["B"]["derived"] is False
    assert rows["C"]["via"] == "B"
    assert rows["D"]["via"] == "C"


def test_a_cycle_terminates(db_session, sample_franchise):
    # A-B, B-C, C-A. Every hop revisits an entry already seen, so a closure
    # without a visited set would never return.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    _link(db_session, "corresponding", a, b)
    _link(db_session, "corresponding", b, c)
    _link(db_session, "corresponding", c, a)

    rows = relations_for_entry(db_session, "anime", a.system_id)
    assert len(rows) == 2
    assert all(r["derived"] is False for r in rows)


def test_the_closure_never_reports_the_viewed_entry_itself(
    db_session, sample_franchise
):
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    _link(db_session, "corresponding", a, b)
    _link(db_session, "corresponding", b, c)

    for entry in (a, b, c):
        rows = relations_for_entry(db_session, "anime", entry.system_id)
        assert all(
            r["other"]["entry_id"] != entry.system_id for r in rows
        ), "an entry corresponded to itself"


def test_a_mixed_chain_resolves_to_its_weakest_link(db_session, sample_franchise):
    # A-alt-B and B-corr-C. A and C are related, but only as far as the weaker
    # hop allows: crossing a Corresponding link cannot leave A claiming C is
    # essentially the same work, only that it is the same story told
    # differently. The stored rows keep their own kinds either way.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    _link(db_session, "alternative", a, b)
    _link(db_session, "corresponding", b, c)

    a_rows = _by_name(relations_for_entry(db_session, "anime", a.system_id))
    assert set(a_rows) == {"B", "C"}
    assert a_rows["B"]["relation_type"] == "alternative"
    assert a_rows["B"]["derived"] is False
    assert a_rows["C"]["relation_type"] == "corresponding"
    assert a_rows["C"]["label"] == "Corresponding"
    assert a_rows["C"]["derived"] is True
    assert a_rows["C"]["via"] == "B"

    # And it reads the same standing at the other end, which is the point of
    # taking the weakest link rather than the first hop.
    c_rows = _by_name(relations_for_entry(db_session, "anime", c.system_id))
    assert c_rows["A"]["relation_type"] == "corresponding"
    assert c_rows["A"]["via"] == "B"

    b_rows = _by_name(relations_for_entry(db_session, "anime", b.system_id))
    assert set(b_rows) == {"A", "C"}
    assert all(r["derived"] is False for r in b_rows.values())


def test_a_stronger_route_wins_over_a_weaker_one(db_session, sample_franchise):
    # A-alt-B-alt-D, and also A-corr-C-corr-D. D is reachable both ways, and
    # the all-Alternative route supports the stronger claim, so that is the one
    # reported - a walk that took whichever path it found first would not.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    d = _anime(db_session, sample_franchise, "D")
    _link(db_session, "corresponding", a, c)
    _link(db_session, "corresponding", c, d)
    _link(db_session, "alternative", a, b)
    _link(db_session, "alternative", b, d)

    rows = _by_name(relations_for_entry(db_session, "anime", a.system_id))
    assert rows["D"]["relation_type"] == "alternative"
    assert rows["D"]["via"] == "B"


def test_alternative_closes_over_a_chain_too(db_session, sample_franchise):
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    _link(db_session, "alternative", a, b)
    _link(db_session, "alternative", b, c)

    rows = _by_name(relations_for_entry(db_session, "anime", a.system_id))
    assert set(rows) == {"B", "C"}
    assert rows["C"]["derived"] is True
    assert rows["C"]["label"] == "Alternative"


def test_a_directional_kind_does_not_chain(db_session, sample_franchise):
    # A is the sequel of B, B is the sequel of C. A is not the sequel of C,
    # and nothing may claim it is.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    _link(db_session, "sequel", a, b)
    _link(db_session, "sequel", b, c)

    rows = _by_name(relations_for_entry(db_session, "anime", a.system_id))
    assert set(rows) == {"B"}


def test_derived_rows_come_after_the_stored_ones(db_session, sample_franchise):
    # The detail page sorts by family and leaves order alone within it, so the
    # rows an admin actually wrote have to arrive first.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    c = _anime(db_session, sample_franchise, "C")
    _link(db_session, "corresponding", a, b)
    _link(db_session, "corresponding", b, c)

    rows = relations_for_entry(db_session, "anime", a.system_id)
    assert [r["derived"] for r in rows] == [False, True]


def test_an_unrelated_chain_elsewhere_is_not_pulled_in(
    db_session, sample_franchise
):
    # The closure loads every transitive row in the table, so it has to start
    # from the viewed entry rather than sweep up whatever it fetched.
    a = _anime(db_session, sample_franchise, "A")
    b = _anime(db_session, sample_franchise, "B")
    x = _anime(db_session, sample_franchise, "X")
    y = _anime(db_session, sample_franchise, "Y")
    _link(db_session, "corresponding", a, b)
    _link(db_session, "corresponding", x, y)

    rows = _by_name(relations_for_entry(db_session, "anime", a.system_id))
    assert set(rows) == {"B"}
