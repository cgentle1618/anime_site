"""Games in the credit, tag, relation and plan registries."""

from app.utils import credit_roles as cr
from app.utils import plan_next_kinds as pnk
from app.utils import relation_kinds as rk


def test_a_games_developer_is_its_studio():
    """No `developer` role: `studio` already names the company that made it."""
    assert "game" in cr.CREDIT_ROLES["studio"].media_types
    assert "developer" not in cr.CREDIT_ROLES


def test_person_roles_on_games_are_director_and_composer_only():
    person_roles = {
        key
        for key, role in cr.CREDIT_ROLES.items()
        if role.target == "person" and "game" in role.media_types
    }
    assert person_roles == {"director", "composer"}


def test_game_tag_fields():
    fields = {f.key: f for f in cr.tag_fields_for("game")}
    assert set(fields) == {
        "game_genre",
        "game_theme",
        "game_mode",
        "combat_mode",
        "game_platform",
        "label",
    }
    assert fields["game_genre"].category == "Game Genre"
    assert fields["combat_mode"].category == "Combat Mode"
    assert fields["game_platform"].category == "Game Platform"


def test_label_is_still_offered_to_anime():
    assert "anime" in cr.TAG_FIELDS["label"].media_types


def test_remake_and_remaster_point_at_an_original():
    for key in ("remake", "remaster"):
        assert rk.RELATION_KINDS[key].inverse_label == "Original"
        assert rk.RELATION_KINDS[key].family == "equivalence"


def test_game_plan_scopes_and_flags():
    assert pnk.ALLOWED_SCOPES["next"]["game"] == frozenset(
        {"entry", "series", "franchise"}
    )
    assert pnk.ALLOWED_SCOPES["rewatch"]["game"] == frozenset(
        {"entry", "series", "franchise"}
    )
    assert pnk.PLAN_FLAG_FIELDS["game"] == (
        ("play_next", "next"),
        ("to_replay", "rewatch"),
    )


def test_games_have_no_size_buckets():
    assert "game" not in pnk.SIZE_THRESHOLDS
