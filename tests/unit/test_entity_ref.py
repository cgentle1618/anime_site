"""Parsing the id in a detail-page URL: a public_id integer or a UUID."""

import uuid

import pytest

from app import models
from app.utils.entity_ref import entity_ref_filter, parse_entity_ref


def test_a_plain_integer_is_a_public_id():
    assert parse_entity_ref("47") == ("public_id", 47)


def test_a_uuid_is_a_system_id():
    raw = "3f8b0c2a-9d1e-4c7b-a0f2-1d4e7f905b3c"
    kind, value = parse_entity_ref(raw)
    assert kind == "system_id"
    assert value == uuid.UUID(raw)


@pytest.mark.parametrize("bad", ["", "  ", "abc", "-1", "0", "1.5", "47x", "1e3"])
def test_junk_is_rejected(bad):
    """A public_id is a positive integer; anything else must 404, not 500."""
    with pytest.raises(ValueError):
        parse_entity_ref(bad)


def test_filter_targets_public_id_for_an_integer():
    clause = entity_ref_filter(models.Anime, "47")
    assert "public_id" in str(clause)


def test_filter_targets_system_id_for_a_uuid():
    clause = entity_ref_filter(models.Anime, "3f8b0c2a-9d1e-4c7b-a0f2-1d4e7f905b3c")
    assert "system_id" in str(clause)
