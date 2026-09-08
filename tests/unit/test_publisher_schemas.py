"""Publisher request/response schemas."""

import uuid

import pytest
from pydantic import ValidationError

from app import schemas


def test_a_nameless_publisher_is_a_422_not_a_500():
    """Mirrors ck_publisher_has_a_name, so the API rejects it before the DB."""
    with pytest.raises(ValidationError):
        schemas.PublisherCreate()


def test_display_name_field_is_validated():
    with pytest.raises(ValidationError):
        schemas.PublisherCreate(name_en="X", display_name_field="english")
    assert schemas.PublisherCreate(name_en="X", display_name_field="cn")


def test_response_carries_display_name_and_credit_count():
    resp = schemas.PublisherResponse(
        system_id=uuid.uuid4(),
        public_id=1,
        name_en="Bandai Namco",
        display_name="Bandai Namco",
    )
    assert resp.credit_count == 0


def test_publisher_ref_is_id_plus_display_name_and_label():
    ref = schemas.PublisherRef(
        system_id=uuid.uuid4(),
        public_id=12,
        display_name="Kadokawa",
        label="Publisher",
    )
    assert ref.display_name == "Kadokawa"
    # The page links by public_id, so a ref without one is not linkable.
    assert ref.public_id == 12
    # The label is required: a ref that reached a page without one would leave
    # the heading to be guessed from the media type at the far end.
    assert ref.label == "Publisher"
