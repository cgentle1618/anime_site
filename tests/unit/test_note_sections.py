"""Unit tests for the notes section registry."""

import pytest

from app.utils.media_resolver import OWNER_TABLES
from app.utils import note_sections as ns


def test_every_section_has_a_known_shape():
    valid = {
        ns.SHAPE_TEXT,
        ns.SHAPE_TEXT_LINKS,
        ns.SHAPE_TEXT_OR_LINK,
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


def test_highlight_kinds_cover_episode_moment_and_arc():
    assert ns.HIGHLIGHT_KINDS == ("神回", "神片段", "神篇章")
    assert ns.section_by_key("highlights").kinds == ns.HIGHLIGHT_KINDS


def test_kinds_for_gives_tv_and_cartoon_a_highlight_dropdown():
    sec = ns.section_by_key("highlight_episodes")
    assert ns.kinds_for(sec, "tv-show") == ns.HIGHLIGHT_KINDS
    assert ns.kinds_for(sec, "cartoon") == ns.HIGHLIGHT_KINDS
    # Manga highlights are always 神回, so a chooser there would have one choice.
    assert ns.kinds_for(sec, "manga") == ()


def test_kinds_for_falls_back_to_the_section_default():
    assert ns.kinds_for(ns.section_by_key("highlights"), "anime") == ns.HIGHLIGHT_KINDS
    assert ns.kinds_for(ns.section_by_key("extended_episodes"), "anime") == ()


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
        "questions",
        "quotes",
        "memes",
    ]


def test_collection_gets_the_narrow_set():
    keys = [s.key for s in ns.sections_for("collection")]
    # Registry order, not the order the spec's prose happens to list them in:
    # `questions` sits after `resources` in NOTE_SECTIONS.
    assert keys == [
        "remark",
        "advantages",
        "disadvantages",
        "double_edged",
        "public_reviews",
        "personal_reviews",
        "analysis",
        "resources",
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


def test_locator_for_falls_back_to_default():
    sec = ns.section_by_key("highlight_episodes")
    assert ns.locator_for(sec, "manga") == "Chapter(s), e.g. ch 6"
    assert ns.locator_for(sec, "tv-show") == "Episode(s), e.g. ep 3"


def test_locator_for_is_none_without_one():
    assert ns.locator_for(ns.section_by_key("remark"), "anime") is None


def test_episode_anchored_text_links_offer_an_episode():
    """
    foreshadowing/symmetry/cinematography are frequently episode-anchored, so
    the text_links episode input must actually render for them.
    """
    for key in ("foreshadowing", "symmetry", "cinematography"):
        assert ns.section_by_key(key).locator_placeholder


def test_desc_required_is_per_owner():
    sec = ns.section_by_key("adaptation")
    assert "anime" in sec.desc_required
    assert "tv-show" not in sec.desc_required


def test_labels_use_ascii_solidus():
    for sec in ns.NOTE_SECTIONS:
        assert "／" not in sec.label
        for value in sec.labels.values():
            assert "／" not in value


def test_public_reviews_takes_text_or_a_link():
    # A public review is either something someone said or a pointer to where
    # they said it, never both in one row.
    sec = ns.section_by_key("public_reviews")
    assert sec.shape == ns.SHAPE_TEXT_OR_LINK
    assert ns.SHAPE_TEXT_OR_LINK in ns.STORED_SHAPES


def test_public_reviews_is_the_only_text_or_link_section():
    keys = [s.key for s in ns.NOTE_SECTIONS if s.shape == ns.SHAPE_TEXT_OR_LINK]
    assert keys == ["public_reviews"]


def test_personal_reviews_stays_plain_text():
    assert ns.section_by_key("personal_reviews").shape == ns.SHAPE_TEXT


def test_episode_comments_is_text_links_with_an_episode_field():
    # A comment on an episode carries a body and any number of sources, and
    # still has to say which episode it is about.
    sec = ns.section_by_key("episode_comments")
    assert sec.shape == ns.SHAPE_TEXT_LINKS
    assert ns.locator_for(sec, "anime") == "Episode, e.g. ep 1"
    assert sec.owners == ("anime", "tv-show", "cartoon")


def test_unread_is_gone():
    # Unread was Resources with a different name: same shape, same owners, and
    # nothing in the row said which list it belonged to. Its rows moved to
    # `resources`, so the key must not come back.
    assert ns.section_by_key("unread") is None
    assert "unread" not in {s.key for s in ns.NOTE_SECTIONS}


# --- locator ----------------------------------------------------------------
# The field is not an episode: it may be a scene, a chapter, a timestamp or the
# source of a question. One free-text column, labelled and required per section.


def test_locator_for_labels_the_field_per_section_and_owner():
    assert (
        ns.locator_for(ns.section_by_key("episode_comments"), "anime")
        == "Episode, e.g. ep 1"
    )
    # Manga counts chapters, not episodes.
    assert (
        ns.locator_for(ns.section_by_key("highlight_episodes"), "manga")
        == "Chapter(s), e.g. ch 6"
    )
    # A section with no anchor at all offers no field.
    assert ns.locator_for(ns.section_by_key("advantages"), "anime") is None


def test_sections_that_are_meaningless_without_an_anchor_require_one():
    required = {s.key for s in ns.NOTE_SECTIONS if s.locator_required}
    assert required == {
        "episode_comments",
        "highlights",
        "highlight_episodes",
        "op_ed_changes",
        "extended_episodes",
    }


def test_locator_stays_optional_where_the_work_may_have_no_anchor():
    # These reach movies and the series/franchise tiers, where there is often
    # nothing to point at.
    for key in ("cinematography", "foreshadowing", "symmetry"):
        assert not ns.section_by_key(key).locator_required
