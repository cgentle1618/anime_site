"""Unit tests for note schema validation against the registry."""

import uuid

import pytest

from app.schemas.note import NoteCreate, section_out, validate_note_payload
from app.utils.note_sections import section_by_key


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
    # No registry section can currently reach the episode_text emptiness check:
    # every one of them either requires a locator or requires content, and one
    # of those fires first. The row is still rejected, which is what matters
    # here; the check stays as the guard for a future section that demands
    # neither.
    with pytest.raises(ValueError):
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


def test_question_may_name_its_source():
    validate_note_payload(
        _payload(section="questions", locator="ep 3", content="為何不直接說？")
    )


def test_question_needs_no_source():
    validate_note_payload(
        _payload(section="questions", locator=None, content="為何不直接說？")
    )


def test_question_with_only_a_source_is_rejected():
    # The reverse of the locator_required sections: here the body is the point.
    with pytest.raises(ValueError, match="requires content"):
        validate_note_payload(
            _payload(section="questions", locator="ep 3", content=None)
        )


def test_insert_song_may_carry_episode_name_description_and_links():
    validate_note_payload(
        _payload(
            section="insert_songs",
            locator="ep 12",
            title="Kanashimi wo Yasashisa ni",
            content="Plays over the rooftop scene.",
            links=["https://youtu.be/abc"],
        )
    )


def test_insert_song_may_carry_only_an_episode_and_a_name():
    # The optional three are genuinely optional: an episode plus a title is a
    # complete note. The generic "content or links" rule would reject it.
    validate_note_payload(
        _payload(section="insert_songs", locator="ep 12", title="Shiroi Kumo", content=None)
    )


def test_insert_song_may_carry_only_an_episode():
    # A remembered scene often comes before the song's title does.
    validate_note_payload(_payload(section="insert_songs", locator="ep 12", content=None))


def test_insert_song_carries_a_tracking_status():
    # The section absorbed the music_track `insert` section, so it tracks a song
    # the same Need/Pending/Done way OP, ED and OST do.
    validate_note_payload(
        _payload(section="insert_songs", locator="ep 12", status="Need", content=None)
    )
    with pytest.raises(ValueError, match="not a valid status"):
        validate_note_payload(
            _payload(section="insert_songs", locator="ep 12", status="Someday")
        )


def test_insert_song_takes_no_type():
    # An insert song is whatever cut plays in that episode, so "which version"
    # has no answer separate from the episode itself.
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            _payload(section="insert_songs", locator="ep 12", kind="normal")
        )


def test_insert_song_without_an_episode_rejected():
    with pytest.raises(ValueError, match="requires a locator"):
        validate_note_payload(
            _payload(section="insert_songs", title="Shiroi Kumo", content=None)
        )


def test_insert_song_rejected_for_non_anime_owners():
    for owner in ("tv-show", "cartoon", "anime-movie", "series"):
        with pytest.raises(ValueError, match="does not apply"):
            validate_note_payload(
                _payload(owner_type=owner, section="insert_songs", locator="ep 12")
            )


def test_section_out_exposes_the_insert_song_contract():
    from app.schemas.note import section_out
    from app.utils.note_sections import section_by_key

    out = section_out(section_by_key("insert_songs"), "anime")
    assert out.shape == "episode_name_links"
    assert out.label == "插入曲 Insert Song"
    assert out.group == "music"
    assert out.locator_required
    assert out.locator_placeholder == "Episode(s), e.g. ep 3"
    # One dropdown, not two: the status the frontend renders, and no type.
    assert out.statuses == ["Need", "Pending", "Done"]
    assert out.kinds == []
    assert out.default_kind is None
    assert not out.desc_required


def test_the_music_track_insert_section_is_no_longer_a_section():
    with pytest.raises(ValueError, match="Unknown note section"):
        validate_note_payload(_payload(section="insert", content="anything"))


# --- music_track shape ----------------------------------------------------


def _music(**kw):
    base = dict(section="op", kind="normal", status="Need", content=None)
    base.update(kw)
    return _payload(**base)


def test_music_row_with_only_a_status_passes():
    # "I still need the OP" is a real note before the song has a name.
    validate_note_payload(_music())


def test_music_row_with_only_a_title_passes():
    validate_note_payload(_music(status=None, title="紅蓮華"))


def test_music_row_with_only_the_default_type_is_empty():
    # kind is prefilled, so it cannot be what makes a row worth storing.
    with pytest.raises(ValueError, match="is empty"):
        validate_note_payload(_music(status=None))


def test_music_row_rejects_an_unknown_status():
    with pytest.raises(ValueError, match="not a valid status"):
        validate_note_payload(_music(status="Someday"))


def test_music_row_rejects_an_unknown_type():
    with pytest.raises(ValueError, match="not a valid kind"):
        validate_note_payload(_music(kind="acoustic"))


def test_music_row_takes_one_link():
    validate_note_payload(_music(links=["https://youtu.be/a"]))
    with pytest.raises(ValueError, match="one link per note"):
        validate_note_payload(
            _music(links=["https://youtu.be/a", "https://youtu.be/b"])
        )


def test_music_sections_are_anime_only():
    with pytest.raises(ValueError, match="does not apply"):
        validate_note_payload(_music(owner_type="tv-show"))


def test_a_non_music_section_takes_no_status():
    with pytest.raises(ValueError, match="takes no status"):
        validate_note_payload(_payload(status="Done"))


def test_section_out_carries_the_group_and_both_dropdowns():
    out = section_out(section_by_key("ost"), "anime")
    assert out.group == "music"
    assert out.group_label == "音樂 Music"
    assert out.group_icon == "fa-music"
    assert out.default_kind == "normal"
    assert out.statuses == ["Need", "Pending", "Done"]


def test_an_ungrouped_section_reports_no_group():
    out = section_out(section_by_key("adaptation"), "anime")
    assert out.group is None and out.group_label is None
    assert out.standalone is False
    assert out.statuses == []


def test_section_out_carries_standalone():
    # Resources renders as its own top-level card, so the page needs to be told
    # to lift it out of the Notes card even though it names no group.
    out = section_out(section_by_key("resources"), "anime")
    assert out.standalone is True
    assert out.group is None
