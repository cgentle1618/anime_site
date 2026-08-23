"""Unit tests for the notes section registry."""

import pytest

from app.utils.media_resolver import OWNER_TABLES
from app.utils import note_sections as ns


def test_every_section_has_a_known_shape():
    valid = {
        ns.SHAPE_TEXT,
        ns.SHAPE_TEXT_LINKS,
        ns.SHAPE_EPISODE_TEXT,
        ns.SHAPE_NAME_LINKS,
        ns.SHAPE_EXTERNAL,
    }
    for sec in ns.NOTE_SECTIONS:
        assert sec.shape in valid, f"{sec.key} has unknown shape {sec.shape}"


def test_section_keys_are_unique():
    keys = [s.key for s in ns.NOTE_SECTIONS]
    assert len(keys) == len(set(keys))


def test_every_owner_is_a_real_owner_table():
    for sec in ns.NOTE_SECTIONS:
        for owner in sec.owners:
            assert owner in OWNER_TABLES, f"{sec.key} names unknown owner {owner}"


def test_only_remark_is_singleton():
    singletons = [s.key for s in ns.NOTE_SECTIONS if s.singleton]
    assert singletons == ["remark"]


def test_only_declared_sections_have_kinds():
    with_kinds = [s.key for s in ns.NOTE_SECTIONS if s.kinds]
    assert with_kinds == ["highlights", "op_ed_changes"]


def test_op_ed_kinds_exclude_retired_values():
    sec = ns.section_by_key("op_ed_changes")
    assert "回顧" not in sec.kinds
    assert "其他" not in sec.kinds
    assert "加長" not in sec.kinds
    assert "特別OP" not in sec.kinds  # normalized to 特殊OP


def test_retired_sections_are_gone():
    assert ns.section_by_key("special_changes") is None
    assert ns.section_by_key("special_episodes") is None


def test_anime_sections_in_registry_order():
    keys = [s.key for s in ns.sections_for("anime")]
    assert keys == [
        "remark",
        "advantages",
        "disadvantages",
        "double_edged",
        "public_reviews",
        "personal_reviews",
        "episode_comments",
        "highlights",
        "analysis",
        "cinematography",
        "foreshadowing",
        "symmetry",
        "op_ed_changes",
        "extended_episodes",
        "adaptation",
        "resources",
        "unread",
        "questions",
        "quotes",
        "memes",
    ]


def test_collection_gets_the_narrow_set():
    keys = [s.key for s in ns.sections_for("collection")]
    # Registry order, not the order the spec's prose happens to list them in:
    # `questions` sits after `unread` in NOTE_SECTIONS.
    assert keys == [
        "remark",
        "public_reviews",
        "personal_reviews",
        "analysis",
        "resources",
        "unread",
        "questions",
        "memes",
    ]


def test_franchise_is_series_minus_cinematography():
    series = {s.key for s in ns.sections_for("series")}
    franchise = {s.key for s in ns.sections_for("franchise")}
    assert series - franchise == {"cinematography"}


def test_episode_sections_never_reach_the_tiers():
    episode_keys = {
        s.key for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_EPISODE_TEXT
    }
    for tier in ("series", "franchise", "collection"):
        assert not episode_keys & {s.key for s in ns.sections_for(tier)}


def test_quotes_stay_entry_only():
    assert ns.section_by_key("quotes").owners == ns.ENTRY_OWNERS


def test_memes_span_every_owner():
    assert set(ns.section_by_key("memes").owners) == set(OWNER_TABLES)


def test_label_for_falls_back_to_default():
    sec = ns.section_by_key("highlight_episodes")
    assert ns.label_for(sec, "manga") == "神回"
    assert ns.label_for(sec, "tv-show") == "神回/神片段"


def test_desc_required_is_per_owner():
    sec = ns.section_by_key("adaptation")
    assert "anime" in sec.desc_required
    assert "tv-show" not in sec.desc_required


def test_labels_use_ascii_solidus():
    for sec in ns.NOTE_SECTIONS:
        assert "／" not in sec.label
        for value in sec.labels.values():
            assert "／" not in value
