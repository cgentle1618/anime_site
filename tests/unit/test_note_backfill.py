"""Unit tests for the notes backfill helpers."""

import importlib.util
import pathlib

spec = importlib.util.spec_from_file_location(
    "backfill",
    pathlib.Path(__file__).parents[2] / "alembic/versions/note_backfill_rows.py",
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def rows(section, value):
    return mod._rows_from_value(section, value)


def test_bare_string_becomes_one_row():
    got = rows("remark", "重看第三次")
    assert got == [
        {"section": "remark", "content": "重看第三次", "locator": None,
         "kind": None, "title": None, "links": None, "sort_index": 0.0}
    ]


def test_string_list_becomes_one_row_each_in_order():
    got = rows("advantages", ["敘事結構精巧", "配樂與畫面高度契合"])
    assert [r["content"] for r in got] == ["敘事結構精巧", "配樂與畫面高度契合"]
    assert [r["sort_index"] for r in got] == [0.0, 1.0]


def test_desc_links_maps_to_content_and_links():
    got = rows("analysis", [{"description": "契約制度", "links": ["https://a"]}])
    assert got[0]["content"] == "契約制度"
    assert got[0]["links"] == ["https://a"]


def test_name_link_single_link_widens_to_a_list():
    got = rows("resources", [{"name": "官方設定集", "link": "https://a"}])
    assert got[0]["title"] == "官方設定集"
    assert got[0]["links"] == ["https://a"]
    assert got[0]["content"] is None


def test_name_link_with_blank_link_stores_no_links():
    got = rows("resources", [{"name": "官方設定集", "link": ""}])
    assert got[0]["links"] is None


def test_episode_entry_plural_key():
    got = rows("highlights", [{"episodes": "ep 10", "type": "", "description": "揭露"}])
    assert got[0]["locator"] == "ep 10"
    assert got[0]["kind"] is None
    assert got[0]["content"] == "揭露"


def test_episode_type_desc_singular_key():
    got = rows(
        "highlight_episodes",
        [{"episode": "ep 3", "type": "", "description": "翻轉"}],
    )
    assert got[0]["locator"] == "ep 3"
    assert got[0]["content"] == "翻轉"


def test_episode_comments_object_map_expands():
    got = rows("episode_comments", {"ep 10": "最痛", "ep 3": "翻轉"})
    # Ordered by natural sort of the episode, not by dict key order.
    assert [r["locator"] for r in got] == ["ep 3", "ep 10"]
    assert [r["sort_index"] for r in got] == [0.0, 1.0]


def test_empty_values_produce_no_rows():
    assert rows("advantages", None) == []
    assert rows("advantages", []) == []
    assert rows("advantages", ["", "   "]) == []
    assert rows("remark", "") == []


def test_split_extended_episodes():
    got = mod._split_special(
        [{"episodes": "ep 12", "type": "加長", "description": "加長五分鐘"}]
    )
    assert got.rows[0]["section"] == "extended_episodes"
    assert got.rows[0]["kind"] is None
    assert got.unplaced == []


def test_split_op_ed_normalizes_special_spelling():
    got = mod._split_special(
        [{"episode": "ep 5", "type": "特別OP", "description": "換OP"}]
    )
    assert got.rows[0]["section"] == "op_ed_changes"
    assert got.rows[0]["kind"] == "特殊OP"


def test_split_reports_unplaced_kinds_instead_of_dropping():
    got = mod._split_special(
        [{"episode": "ep 7", "type": "回顧", "description": "總集篇"}]
    )
    assert got.rows == []
    assert got.unplaced == [{"episode": "ep 7", "type": "回顧", "description": "總集篇"}]


def test_episode_sort_key_is_numeric_not_lexical():
    eps = ["ep 10", "ep 2", "ep 1"]
    assert sorted(eps, key=mod._episode_sort_key) == ["ep 1", "ep 2", "ep 10"]


def test_episode_sort_key_handles_no_digits():
    # Must not raise; non-numeric episodes sort after numeric ones.
    assert mod._episode_sort_key("OVA") > mod._episode_sort_key("ep 99")


def test_row_with_only_a_kind_is_not_dropped():
    # An item carrying nothing but `type` used to fail the emptiness check
    # and vanish; `kind` must count as usable content like the other fields.
    got = rows("op_ed_changes", [{"episode": "", "type": "變化OP", "description": ""}])
    assert len(got) == 1
    assert got[0]["kind"] == "變化OP"
    assert got[0]["content"] is None


def test_non_str_non_dict_item_is_reported_not_silently_discarded():
    dropped = []
    got = mod._rows_from_value("advantages", [42, "真正的優點"], dropped)
    assert [r["content"] for r in got] == ["真正的優點"]
    assert dropped == [42]


def test_all_none_dict_item_is_reported_not_silently_discarded():
    dropped = []
    got = mod._rows_from_value("resources", [{"name": "", "link": ""}], dropped)
    assert got == []
    assert dropped == [{"name": "", "link": ""}]


def test_blank_string_item_is_not_reported_as_dropped():
    # A blank bare string is a normal empty entry (see
    # test_empty_values_produce_no_rows), not a malformed one.
    dropped = []
    got = mod._rows_from_value("advantages", ["", "   "], dropped)
    assert got == []
    assert dropped == []


def test_empty_episode_comment_pair_is_reported_not_silently_discarded():
    dropped = []
    got = mod._rows_from_value("episode_comments", {"": "", "ep 1": "有料"}, dropped)
    assert [r["locator"] for r in got] == ["ep 1"]
    assert dropped == [{"": ""}]


def test_insert_params_are_stamped_with_backfill_stamp_not_now():
    row = {
        "section": "remark", "locator": None, "kind": None, "title": None,
        "content": "重看第三次", "links": None, "sort_index": 0.0,
    }
    params = mod._insert_params("anime", 7, row)
    assert params["created_at"] == mod.BACKFILL_STAMP
    assert params["updated_at"] == mod.BACKFILL_STAMP
    assert params["owner_type"] == "anime"
    assert params["owner_id"] == "7"


def test_downgrade_deletes_only_rows_created_at_the_backfill_stamp():
    # downgrade() must scope its DELETE to BACKFILL_STAMP, not delete
    # unconditionally - otherwise a user's own notes, created through the
    # note API after this migration ran, would be destroyed by a downgrade.
    import inspect

    source = inspect.getsource(mod.downgrade)
    assert "BACKFILL_STAMP" in source
    assert "DELETE FROM note" in source
    assert "WHERE created_at = :stamp" in source
