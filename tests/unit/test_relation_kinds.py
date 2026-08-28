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
    TRANSITIVE_KEYS,
)


def test_ten_stored_kinds():
    assert set(RELATION_KEYS) == {
        "sequel",
        "alternative",
        "corresponding",
        "renew",
        "directors_cut",
        "extended",
        "side_story",
        "spin_off",
        "setting",
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


def test_only_the_two_peer_kinds_are_symmetric():
    # Both name a pair with no origin between them, which is what lets the
    # service sort the endpoints before writing and collapse A-x-B and B-x-A
    # into one row.
    symmetric = {k for k, v in RELATION_KINDS.items() if v.symmetric}
    assert symmetric == {"alternative", "corresponding"}


def test_corresponding_is_a_symmetric_equivalence_kind():
    # The same work seen from another angle - Unlimited Blade Works beside
    # Heaven's Feel - so it sits with Alternative in equivalence rather than
    # with the branch kinds, and neither route is the other's origin.
    kind = RELATION_KINDS["corresponding"]
    assert kind.family == "equivalence"
    assert kind.symmetric
    assert kind.label == kind.inverse_label == "Corresponding"


def test_only_the_two_peer_kinds_are_transitive():
    # A chain carries only where the kind claims sameness. A sequel of a sequel
    # is not a sequel, and a spin-off of a spin-off is not one either.
    assert set(TRANSITIVE_KEYS) == {"alternative", "corresponding"}


def test_transitive_keys_run_strongest_claim_first():
    # relations_for_entry walks these in order, widening the edge set one kind
    # at a time, so the order is what makes a mixed chain resolve to its
    # weakest link. Alternative asserts more than Corresponding, so it leads.
    assert TRANSITIVE_KEYS.index("alternative") < TRANSITIVE_KEYS.index(
        "corresponding"
    )


def test_transitive_keys_are_derived_from_the_registry():
    assert TRANSITIVE_KEYS == tuple(
        k for k, v in RELATION_KINDS.items() if v.transitive
    )
    assert set(TRANSITIVE_KEYS).issubset(set(RELATION_KEYS))


def test_corresponding_is_distinct_from_alternative():
    # Two kinds, not one relabelled: Alternative is essentially the same work,
    # Corresponding is fundamentally the same story told differently.
    assert RELATION_KINDS["corresponding"] != RELATION_KINDS["alternative"]
    assert RELATION_KINDS["corresponding"].key == "corresponding"


def test_labels_are_unique():
    labels = [k.label for k in RELATION_KINDS.values()]
    assert len(labels) == len(set(labels))


def test_prequel_is_input_only_and_maps_to_sequel():
    assert INPUT_ONLY_KINDS == {"prequel": "sequel"}
    assert "prequel" not in RELATION_KINDS
    assert "prequel" in ACCEPTED_INPUT_KINDS


def test_accepted_input_kinds_covers_the_eleven_user_facing_choices():
    assert len(ACCEPTED_INPUT_KINDS) == 11
    assert set(RELATION_KEYS).issubset(set(ACCEPTED_INPUT_KINDS))


def test_setting_is_a_directional_branch_kind():
    # A 設定集 / art book hangs off the work it documents, the way a spin-off
    # does, and never the other way round - so it sits in branch and is not
    # symmetric.
    setting = RELATION_KINDS["setting"]
    assert setting.family == "branch"
    assert setting.label == "Setting"
    assert setting.inverse_label == "Main Story"
    assert setting.symmetric is False
