"""Unit tests for the watch order part tier's two rules.

Parts do not sort a guide. Reading order is the step's own `position` and
nothing else (`sort_items_by_reading_order`), and a part is drawn around
whichever run of adjacent steps shares a `section_id` - which is only
well-defined while every part's steps stay adjacent (`first_section_break`).

Neither function touches a database, so plain stubs are enough.
"""

import uuid

from app.services.domain.watch_order import (
    first_section_break,
    sort_items_by_reading_order,
)


class _Item:
    def __init__(self, name, position, section_id=None):
        self.name = name
        self.position = position
        self.section_id = section_id


def _names(items):
    return [i.name for i in items]


class TestReadingOrder:
    def test_steps_order_by_position(self):
        items = [_Item("c", 3.0), _Item("a", 1.0), _Item("b", 2.0)]
        assert _names(sort_items_by_reading_order(items)) == ["a", "b", "c"]

    def test_an_empty_list_stays_empty(self):
        assert sort_items_by_reading_order([]) == []

    def test_a_part_does_not_pull_its_steps_out_of_position(self):
        # The rule this tier was rewritten for. Under the retired rule the
        # unfiled step read first no matter its position; now it reads third,
        # sitting between the two parts exactly where its position puts it.
        one, two = uuid.uuid4(), uuid.uuid4()
        items = [
            _Item("part_one_a", 1.0, one),
            _Item("part_one_b", 2.0, one),
            _Item("loose", 3.0),
            _Item("part_two_a", 4.0, two),
        ]
        assert _names(sort_items_by_reading_order(items)) == [
            "part_one_a",
            "part_one_b",
            "loose",
            "part_two_a",
        ]

    def test_an_unfiled_step_can_read_before_every_part(self):
        one = uuid.uuid4()
        items = [_Item("filed", 2.0, one), _Item("loose", 1.0)]
        assert _names(sort_items_by_reading_order(items)) == ["loose", "filed"]

    def test_an_unfiled_step_can_read_after_every_part(self):
        one = uuid.uuid4()
        items = [_Item("loose", 2.0), _Item("filed", 1.0, one)]
        assert _names(sort_items_by_reading_order(items)) == ["filed", "loose"]

    def test_a_step_with_no_position_sorts_last(self):
        items = [_Item("none", None), _Item("first", 1.0)]
        assert _names(sort_items_by_reading_order(items)) == ["first", "none"]

    def test_a_zero_position_is_not_treated_as_missing(self):
        # Guards the `or 0.0` idiom: 0.0 is a real position, not absence.
        items = [_Item("one", 1.0), _Item("zero", 0.0)]
        assert _names(sort_items_by_reading_order(items)) == ["zero", "one"]

    def test_steps_sharing_a_position_keep_the_given_order(self):
        items = [_Item("first", 1.0), _Item("second", 1.0)]
        assert _names(sort_items_by_reading_order(items)) == ["first", "second"]

    def test_no_step_is_ever_dropped(self):
        items = [_Item("x", 1.0, uuid.uuid4()), _Item("y", None), _Item("z", 2.0)]
        assert len(sort_items_by_reading_order(items)) == 3


class TestContiguity:
    def test_an_unbroken_guide_reports_no_break(self):
        one, two = uuid.uuid4(), uuid.uuid4()
        items = [
            _Item("a", 1.0, one),
            _Item("b", 2.0, one),
            _Item("c", 3.0, two),
        ]
        assert first_section_break(items) is None

    def test_an_unfiled_step_between_two_parts_is_not_a_break(self):
        # The position the whole rewrite exists to allow.
        one, two = uuid.uuid4(), uuid.uuid4()
        items = [_Item("a", 1.0, one), _Item("loose", 2.0), _Item("c", 3.0, two)]
        assert first_section_break(items) is None

    def test_a_part_split_by_an_unfiled_step_is_a_break(self):
        one = uuid.uuid4()
        items = [_Item("a", 1.0, one), _Item("loose", 2.0), _Item("b", 3.0, one)]
        assert first_section_break(items) == one

    def test_a_part_split_by_another_part_is_a_break(self):
        one, two = uuid.uuid4(), uuid.uuid4()
        items = [_Item("a", 1.0, one), _Item("c", 2.0, two), _Item("b", 3.0, one)]
        assert first_section_break(items) == one

    def test_the_first_break_is_the_one_reported(self):
        one, two = uuid.uuid4(), uuid.uuid4()
        items = [
            _Item("a", 1.0, one),
            _Item("c", 2.0, two),
            _Item("b", 3.0, one),
            _Item("d", 4.0, two),
        ]
        assert first_section_break(items) == one

    def test_repeated_unfiled_runs_are_never_a_break(self):
        # None is not a part, so unfiled runs may recur as often as they like.
        one, two = uuid.uuid4(), uuid.uuid4()
        items = [
            _Item("loose1", 1.0),
            _Item("a", 2.0, one),
            _Item("loose2", 3.0),
            _Item("c", 4.0, two),
            _Item("loose3", 5.0),
        ]
        assert first_section_break(items) is None

    def test_an_empty_guide_reports_no_break(self):
        assert first_section_break([]) is None

    def test_a_single_step_reports_no_break(self):
        assert first_section_break([_Item("a", 1.0, uuid.uuid4())]) is None
