"""NovelUnit model shape — columns, constraints, ordering, kind vocabulary."""

from app import models
from app.utils.constants import NOVEL_UNIT_KINDS, NOVEL_UNIT_KINDS_BY_TYPE


def test_novel_unit_columns():
    """my_rating is deliberately absent: it is one reader's opinion of one
    unit and moved to user_novel_unit_rating in step 1."""
    cols = {c.name for c in models.NovelUnit.__table__.columns}
    assert cols == {
        "system_id",
        "novel_id",
        "unit_kind",
        "position",
        "unit_key",
        "name_cn",
        "name_en",
        "remark",
        "ch_count",
        # Per-unit grade on the MY_RATINGS scale; nothing derives from it.
        "created_at",
        "updated_at",
    }


def test_novel_unit_fk_cascades():
    fk = list(models.NovelUnit.__table__.c.novel_id.foreign_keys)[0]
    assert fk.column.table.name == "novel"
    assert fk.ondelete == "CASCADE"


def test_novel_unit_check_constraints():
    names = {c.name for c in models.NovelUnit.__table__.constraints if c.name}
    assert "ck_novel_unit_kind" in names
    assert "ck_novel_unit_ch_count_arc_only" in names


def test_the_two_stage_cursor_lives_on_the_list_row_and_the_json_lists_are_gone():
    """ch_fin_in_arc was added to `novel` by nv1u2n3i4t5s and moved to
    user_media_list by m1b7novel: it is one reader's position in the arc they
    are on, not a fact about the work. It still has to exist somewhere."""
    cols = {c.name for c in models.Novel.__table__.columns}
    assert "ch_fin_in_arc" not in cols
    assert "ch_fin_in_arc" in {
        c.name for c in models.UserMediaList.__table__.columns
    }
    assert "novel_name_each_cn" not in cols
    assert "novel_name_each_en" not in cols


def test_kind_vocabulary():
    assert NOVEL_UNIT_KINDS == ("volume", "arc", "story", "chapter")
    assert NOVEL_UNIT_KINDS_BY_TYPE == {
        "Light Novel": ("volume",),
        "Novel": ("volume",),
        "Web": ("arc",),
        "Other": ("volume", "story", "chapter"),
    }
    # Every offered kind must be a real kind.
    for kinds in NOVEL_UNIT_KINDS_BY_TYPE.values():
        assert set(kinds) <= set(NOVEL_UNIT_KINDS)
