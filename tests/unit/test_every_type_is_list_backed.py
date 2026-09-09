"""No media type keeps its personal columns after step 1."""

from app import models
from app.registry import MEDIA_REGISTRY
from app.services.domain.user_list import LIST_FIELDS, STATUS_FIELD

PERSONAL = {
    "watching_status", "reading_status", "playing_status", "my_rating",
    "ep_fin", "vol_fin", "vol_fin_page", "ch_fin", "arc_fin",
    "ch_fin_in_arc", "progress_display", "issue_fin", "my_watch_day",
    "completed_at",
}


def test_no_detail_model_declares_a_personal_column():
    for key, spec in MEDIA_REGISTRY.items():
        columns = set(spec.model.__table__.columns.keys())
        assert not (columns & PERSONAL), f"{key}: {columns & PERSONAL}"


def test_the_list_backed_flag_is_gone():
    """Once every type is list-backed the flag is dead weight and a second,
    untested branch through the router factory."""
    from app.registry import MediaTypeSpec

    assert not hasattr(MediaTypeSpec, "list_backed")


def test_every_spec_declares_both_completion_halves():
    for key, spec in MEDIA_REGISTRY.items():
        assert spec.mark_completed is not None, key
        assert spec.mark_completed_list is not None, key


def test_every_specs_status_field_matches_the_service_table():
    for spec in MEDIA_REGISTRY.values():
        assert spec.status_field == STATUS_FIELD[spec.owner_type]
        assert spec.status_field in LIST_FIELDS[spec.owner_type]


def test_user_media_list_is_the_only_home_for_a_status():
    assert "status" in models.UserMediaList.__table__.columns
