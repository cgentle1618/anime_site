"""
Guards on migration p1e2r3s4o5n6, which collapses the two role vocabularies.

The migration file is loaded by path: importlib.import_module on
"alembic.versions..." resolves to the installed alembic package, which has no
versions submodule (same reason as tests/unit/test_release_date_migration.py).

These assert the migration's MAPPING, not its SQL. The row counts it produces
were verified by hand against the live database on 2026-09-04 and are recorded
in the plan; what can silently rot here is the mapping drifting out of step
with the live vocabulary, which is what these catch.
"""

import importlib.util
import pathlib

from app.utils.credit_roles import PERSON_ROLES, legal_scopes

_spec = importlib.util.spec_from_file_location(
    "r0l1c2o3l4p5_collapse_person_roles",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/r0l1c2o3l4p5_collapse_person_roles.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_every_rename_target_is_a_live_role():
    for target in migration.CREDIT_ROLE_RENAMES.values():
        assert target in PERSON_ROLES


def test_no_retired_credit_role_key_is_left_behind():
    """All six retired keys must be named, or rows keep a dead role."""
    assert set(migration.CREDIT_ROLE_RENAMES) == {
        "manga_author_plot",
        "manga_author_draw",
        "novel_author",
        "novel_illustrator",
        "comic_writer",
        "comic_artist",
    }


def test_the_manga_pair_lands_on_different_roles():
    """
    The collapse is only safe because 原作 and 作畫 do not merge. If they did,
    uq_media_credit_row would reject a manga written and drawn by one person -
    two credits that must stay two rows.
    """
    assert (
        migration.CREDIT_ROLE_RENAMES["manga_author_plot"]
        != migration.CREDIT_ROLE_RENAMES["manga_author_draw"]
    )


def test_every_expanded_scope_is_legal_for_its_role():
    for pairs in migration.ROLE_SCOPE_EXPANSION.values():
        for role, scope in pairs:
            assert scope in legal_scopes(role), f"{role} cannot be scoped {scope}"


def test_director_anime_expands_to_both_anime_media_types():
    """
    The old `anime` director scope served the anime AND anime-movie dropdowns
    through the now-deleted DIRECTOR_ANIME_MEDIA_TYPES. Expanding to only one
    would silently empty the other.
    """
    assert migration.ROLE_SCOPE_EXPANSION[("director", "anime")] == (
        ("director", "anime"),
        ("director", "anime-movie"),
    )


def test_director_non_anime_becomes_movie():
    """movie is the only non-anime media type with a director credit."""
    assert migration.ROLE_SCOPE_EXPANSION[("director", "non_anime")] == (
        ("director", "movie"),
    )


def test_manga_author_is_derived_not_expanded():
    """
    manga_author backed BOTH dropdowns, so it is the one row that cannot be
    renamed. It must be split from each person's actual credits, which the
    static expansion table cannot express.
    """
    assert ("manga_author", None) not in migration.ROLE_SCOPE_EXPANSION


def test_no_expansion_names_a_retired_role():
    for pairs in migration.ROLE_SCOPE_EXPANSION.values():
        for role, _scope in pairs:
            assert role in PERSON_ROLES, role


def test_every_unscoped_source_role_is_a_retired_name():
    """
    A source key whose role is still live would mean the migration is trying
    to rewrite a role that no longer needs rewriting.
    """
    retired = {
        "novel_author",
        "novel_illustrator",
        "comic_writer",
        "comic_artist",
        "manga_author",
    }
    for role, scope in migration.ROLE_SCOPE_EXPANSION:
        if scope is None:
            assert role in retired or role in ("producer", "composer"), role
