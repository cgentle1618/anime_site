"""
Unit tests for the relation kind registry.

Pure data, no database — mirrors tests/unit/test_watch_order_resolver.py in
spirit but needs no fixtures.
"""

from app.utils.relation_kinds import (
    ACCEPTED_INPUT_KINDS,
    INPUT_ONLY_KINDS,
    RELATION_FAMILIES,
    RELATION_KEYS,
    RELATION_KINDS,
)


def test_eight_stored_kinds():
    assert set(RELATION_KEYS) == {
        "sequel",
        "alternative",
        "renew",
        "directors_cut",
        "extended",
        "side_story",
        "spin_off",
        "adaptation",
    }


def test_every_kind_declares_a_label_and_inverse_label():
    for key, kind in RELATION_KINDS.items():
        assert kind.key == key, f"{key} disagrees with its registry key"
        assert kind.label.strip(), f"{key} has a blank label"
        assert kind.inverse_label.strip(), f"{key} has a blank inverse_label"


def test_every_family_is_known():
    for kind in RELATION_KINDS.values():
        assert kind.family in RELATION_FAMILIES


def test_symmetric_is_true_exactly_when_label_equals_inverse_label():
    for kind in RELATION_KINDS.values():
        assert kind.symmetric == (kind.label == kind.inverse_label)


def test_only_alternative_is_symmetric():
    symmetric = {k for k, v in RELATION_KINDS.items() if v.symmetric}
    assert symmetric == {"alternative"}


def test_labels_are_unique():
    labels = [k.label for k in RELATION_KINDS.values()]
    assert len(labels) == len(set(labels))


def test_prequel_is_input_only_and_maps_to_sequel():
    assert INPUT_ONLY_KINDS == {"prequel": "sequel"}
    assert "prequel" not in RELATION_KINDS
    assert "prequel" in ACCEPTED_INPUT_KINDS


def test_accepted_input_kinds_covers_the_nine_user_facing_choices():
    assert len(ACCEPTED_INPUT_KINDS) == 9
    assert set(RELATION_KEYS).issubset(set(ACCEPTED_INPUT_KINDS))
