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
            _payload(owner_type="franchise", section="episode_comments", episode="ep 1")
        )


def test_external_section_rejected():
    # Quotes and memes live in their own tables, never in `note`.
    with pytest.raises(ValueError, match="own table"):
        validate_note_payload(_payload(section="quotes"))


def test_kind_must_be_in_the_dropdown():
    with pytest.raises(ValueError, match="not a valid kind"):
        validate_note_payload(
            _payload(section="op_ed_changes", episode="ep 3", kind="回顧")
        )


def test_kind_from_the_dropdown_accepted():
    validate_note_payload(
        _payload(section="op_ed_changes", episode="ep 3", kind="變化OP")
    )


def test_kind_rejected_where_no_dropdown_declared():
    with pytest.raises(ValueError, match="takes no kind"):
        validate_note_payload(
            _payload(section="extended_episodes", episode="ep 12", kind="加長")
        )


def test_desc_required_section_rejects_empty_content():
    with pytest.raises(ValueError, match="requires content"):
        validate_note_payload(_payload(section="adaptation", content="   "))


def test_desc_required_does_not_apply_to_other_owners():
    # adaptation is desc_required on anime but not on tv_show.
    validate_note_payload(
        _payload(owner_type="tv-show", section="adaptation", content=None)
    )


def test_blank_content_rejected_for_ordinary_text_section():
    with pytest.raises(ValueError, match="empty"):
        validate_note_payload(_payload(content="  "))


def test_name_links_row_may_have_title_and_no_content():
    validate_note_payload(
        _payload(section="resources", content=None, title="官方設定集",
                 links=["https://example.com/artbook"])
    )
