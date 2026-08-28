"""Unit tests for sort_items_by_section — the watch order section tier's ordering rule.

The rule: sections order among themselves by `position`; steps order within a
section by the step's own `position`; steps with no section read ahead of every
section. The function touches no database, so plain stubs are enough.
"""

import uuid

from app.services.domain.watch_order import sort_items_by_section


class _Item:
    def __init__(self, name, position, section_id=None):
        self.name = name
        self.position = position
        self.section_id = section_id


class _Section:
    def __init__(self, system_id, position):
        self.system_id = system_id
        self.position = position


def _names(items):
    return [i.name for i in items]


class TestBackwardCompatibility:
    def test_a_list_with_no_sections_orders_by_position_alone(self):
        # The load-bearing case: every list authored before the tier existed.
        items = [_Item("c", 3.0), _Item("a", 1.0), _Item("b", 2.0)]
        assert _names(sort_items_by_section(items, [])) == ["a", "b", "c"]

    def test_an_empty_list_stays_empty(self):
        assert sort_items_by_section([], []) == []


class TestSectionOrdering:
    def test_sections_order_by_their_own_position_not_the_items(self):
        a, b = uuid.uuid4(), uuid.uuid4()
        sections = [_Section(b, 2.0), _Section(a, 1.0)]
        # b1 has the lowest item position but belongs to the later section.
        items = [_Item("b1", 1.0, b), _Item("a1", 5.0, a)]
        assert _names(sort_items_by_section(items, sections)) == ["a1", "b1"]

    def test_items_order_by_position_within_their_section(self):
        a = uuid.uuid4()
        sections = [_Section(a, 1.0)]
        items = [_Item("a3", 3.0, a), _Item("a1", 1.0, a), _Item("a2", 2.0, a)]
        assert _names(sort_items_by_section(items, sections)) == ["a1", "a2", "a3"]

    def test_ungrouped_items_read_ahead_of_every_section(self):
        a = uuid.uuid4()
        sections = [_Section(a, 1.0)]
        items = [_Item("in_section", 1.0, a), _Item("loose", 99.0)]
        assert _names(sort_items_by_section(items, sections)) == [
            "loose",
            "in_section",
        ]

    def test_two_sections_sharing_a_position_keep_the_given_order(self):
        first, second = uuid.uuid4(), uuid.uuid4()
        sections = [_Section(first, 1.0), _Section(second, 1.0)]
        items = [_Item("second", 1.0, second), _Item("first", 1.0, first)]
        assert _names(sort_items_by_section(items, sections)) == ["first", "second"]


class TestNullHandling:
    def test_a_section_with_no_position_sorts_after_positioned_ones(self):
        positioned, unpositioned = uuid.uuid4(), uuid.uuid4()
        sections = [_Section(unpositioned, None), _Section(positioned, 1.0)]
        items = [_Item("unpos", 1.0, unpositioned), _Item("pos", 1.0, positioned)]
        assert _names(sort_items_by_section(items, sections)) == ["pos", "unpos"]

    def test_an_item_with_no_position_sorts_last_within_its_section(self):
        a = uuid.uuid4()
        sections = [_Section(a, 1.0)]
        items = [_Item("none", None, a), _Item("first", 1.0, a)]
        assert _names(sort_items_by_section(items, sections)) == ["first", "none"]

    def test_a_zero_position_section_is_not_treated_as_missing(self):
        # Guards the `or 0.0` idiom: 0.0 is a real position, not absence.
        zero, one = uuid.uuid4(), uuid.uuid4()
        sections = [_Section(one, 1.0), _Section(zero, 0.0)]
        items = [_Item("one", 1.0, one), _Item("zero", 1.0, zero)]
        assert _names(sort_items_by_section(items, sections)) == ["zero", "one"]


class TestMisfiledSteps:
    def test_a_step_naming_another_lists_section_reads_as_ungrouped(self):
        # Only a hand-edited Sheets restore produces this. It must stay visible
        # so the admin can see and fix it — never be dropped from the guide.
        a = uuid.uuid4()
        sections = [_Section(a, 1.0)]
        items = [_Item("misfiled", 5.0, uuid.uuid4()), _Item("ok", 1.0, a)]
        assert _names(sort_items_by_section(items, sections)) == ["misfiled", "ok"]

    def test_no_step_is_ever_dropped(self):
        a = uuid.uuid4()
        sections = [_Section(a, 1.0)]
        items = [
            _Item("x", 1.0, a),
            _Item("y", None),
            _Item("z", 2.0, uuid.uuid4()),
        ]
        assert len(sort_items_by_section(items, sections)) == 3
