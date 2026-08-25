"""Unit tests for note schema validation against the registry."""

import uuid
import pytest

from app.schemas.note import NoteCreate, validate_note_payload


def _payload(**kw):
    base = dict(
        owner_type="anime",
        owner_id=uuid.uuid4(),
        section="advantages",
        content="敘事結構精巧",
    )
    base.update(kw)
    return NoteCreate(**base)


def test_valid_payload_passes():
    validate_note_payload(_payload())


def test_unknown_section_rejected():
    with pytest.raises(ValueError, match="Unknown note section"):
        validate_note_payload(_payload(section="not_a_section"))


def test_unknown_owner_type_rejected():
    with pytest.raises(ValueError, match="Unknown owner_type"):
        validate_note_payload(_payload(owner_type="podcast"))


def test_section_not_applicable_to_owner_rejected():
    # episode_comments is entry-only; a franchise may not have one.
    with pytest.raises(ValueError, match="does not apply"):
        validate_note_payload(
            _payload(owner_type="franchise", section="episode_comments", locator="ep 1")
        )


def test_external_section_rejected():
    # Quotes and memes live in their own tables, never in `note`.
    with pytest.raises(ValueError, match="own table"):
        validate_note_payload(_payload(section="quotes"))


def test_kind_must_be_in_the_dropdown():
    with pytest.raises(ValueError, match="not a valid kind"):
        validate_note_payload(
            _payload(section="op_ed_changes", locator="ep 3", kind="回顧")
        )


def test_kind_from_the_dropdown_accepted():
    validate_note_payload(
        _payload(section="op_ed_changes", locator="ep 3", kind="變化OP")
    )


def test_kind_rejected_where_no_dropdown_declared():
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            _payload(section="extended_episodes", locator="ep 12", kind="加長")
        )


def test_highlight_kind_is_accepted_where_the_owner_has_the_dropdown():
    validate_note_payload(_payload(section="highlights", locator="ep 6", kind="神片段"))
    validate_note_payload(_payload(section="highlights", locator="ep 6", kind="神篇章"))
    validate_note_payload(
        _payload(
            owner_type="tv-show",
            section="highlight_episodes",
            locator="ep 6",
            kind="神片段",
        )
    )


def test_highlight_kind_rejected_for_manga():
    # highlight_episodes offers the dropdown to tv-show and cartoon only.
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            _payload(
                owner_type="manga",
                section="highlight_episodes",
                locator="ch 6",
                kind="神片段",
            )
        )


def test_desc_required_section_rejects_empty_content():
    with pytest.raises(ValueError, match="requires content"):
        validate_note_payload(_payload(section="adaptation", content="   "))


def test_desc_required_does_not_apply_to_other_owners():
    # adaptation is desc_required on anime but not on tv-show, so a row with
    # only a link and no description is valid there.
    validate_note_payload(
        _payload(
            owner_type="tv-show",
            section="adaptation",
            content=None,
            links=["https://example.com/adaptation"],
        )
    )


def test_blank_content_rejected_for_ordinary_text_section():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(_payload(content="  "))


def test_name_links_row_may_have_title_and_no_content():
    validate_note_payload(
        _payload(section="resources", content=None, title="官方設定集",
                 links=["https://example.com/artbook"])
    )


def test_name_links_row_may_have_only_title():
    # name_links shape allows title alone, without content or links
    validate_note_payload(
        _payload(section="resources", content=None, title="官方設定集", links=None)
    )


def test_episode_text_row_may_have_only_a_locator():
    # episode_text shape allows the locator alone, without content
    validate_note_payload(
        _payload(section="extended_episodes", locator="ep 1", content=None)
    )


def test_episode_text_row_without_locator_and_content_rejected():
    # episode_text shape requires either a locator or content. extended_episodes
    # would trip locator_required first, so this uses a section that does not
    # demand one.
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            _payload(section="questions", locator=None, content=None)
        )


def test_blank_text_links_row_rejected():
    # text_links shape (e.g., adaptation) still requires content or links
    # Use tv-show where adaptation is NOT desc_required, so it hits the emptiness check
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            _payload(owner_type="tv-show", section="adaptation", content=None, links=None)
        )


# --- text_or_link (public_reviews) ------------------------------------------
# A public review row is one thing: a quoted opinion, or a link to where the
# opinion lives. Both at once is ambiguous, so the shape rejects it.


def test_text_or_link_row_may_be_text_only():
    validate_note_payload(
        _payload(section="public_reviews", content="評價兩極，節奏被詬病")
    )


def test_text_or_link_row_may_be_link_only():
    validate_note_payload(
        _payload(
            section="public_reviews",
            content=None,
            links=["https://myanimelist.net/reviews/12345"],
        )
    )


def test_text_or_link_row_rejects_text_and_link_together():
    with pytest.raises(ValueError, match="text or a link"):
        validate_note_payload(
            _payload(
                section="public_reviews",
                content="評價兩極",
                links=["https://myanimelist.net/reviews/12345"],
            )
        )


def test_text_or_link_row_rejects_more_than_one_link():
    with pytest.raises(ValueError, match="one link"):
        validate_note_payload(
            _payload(
                section="public_reviews",
                content=None,
                links=["https://a.example/1", "https://b.example/2"],
            )
        )


def test_blank_text_or_link_row_rejected():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            _payload(section="public_reviews", content="  ", links=None)
        )


# --- episode_comments as text_links -----------------------------------------
# An episode comment is a comment plus its sources, so it carries an episode,
# a body and any number of links. The episode alone is not a note.


def test_episode_comment_may_be_episode_and_text():
    validate_note_payload(
        _payload(section="episode_comments", locator="ep 1", content="開場就定調")
    )


def test_episode_comment_may_carry_several_links():
    validate_note_payload(
        _payload(
            section="episode_comments",
            locator="ep 1",
            content=None,
            links=["https://a.example/1", "https://b.example/2"],
        )
    )


def test_episode_comment_may_carry_text_and_links_together():
    validate_note_payload(
        _payload(
            section="episode_comments",
            locator="ep 1",
            content="開場就定調",
            links=["https://a.example/1", "https://b.example/2"],
        )
    )


def test_episode_comment_with_only_an_episode_rejected():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(
            _payload(section="episode_comments", locator="ep 1", content=None)
        )


def test_unread_section_is_rejected():
    # The section is gone; a client still sending it gets a 422 rather than a
    # row no page will ever render.
    with pytest.raises(ValueError, match="Unknown note section"):
        validate_note_payload(_payload(section="unread", title="舊清單"))


# --- locator ----------------------------------------------------------------


def test_locator_required_section_rejects_a_missing_locator():
    # An OP/ED change with no episode says nothing about which OP changed.
    with pytest.raises(ValueError, match="requires"):
        validate_note_payload(
            _payload(section="op_ed_changes", locator=None, content="換成劇中曲")
        )


def test_locator_required_section_rejects_a_blank_locator():
    with pytest.raises(ValueError, match="requires"):
        validate_note_payload(
            _payload(section="episode_comments", locator="   ", content="開場就定調")
        )


def test_locator_required_section_passes_with_one():
    validate_note_payload(
        _payload(section="episode_comments", locator="ep 1", content="開場就定調")
    )


def test_locator_stays_optional_on_sections_that_do_not_demand_it():
    validate_note_payload(
        _payload(section="foreshadowing", locator=None, content="紅圍巾")
    )


def test_section_out_reports_the_locator_contract():
    from app.schemas.note import section_out
    from app.utils.note_sections import section_by_key

    out = section_out(section_by_key("episode_comments"), "anime")
    assert out.locator_placeholder == "Episode, e.g. ep 1"
    assert out.locator_required is True

    out = section_out(section_by_key("foreshadowing"), "anime")
    assert out.locator_required is False
