"""
The data migration that moves `guides` and `builds_and_mods` rows onto the
攻略 group's keys.

The suite has no Alembic harness - tests/api/conftest.py builds its schema with
create_all and never runs Alembic - so this executes the revision's OWN
statement tuples against the test session. Importing them by file path rather
than restating them is the point: a test that restated the SQL would pass while
the shipped SQL was wrong.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "g1u2i3d4e5s6_guides_group_sections.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_guides_revision", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def game(db_session, sample_franchise):
    g = models.Game(
        game_name_en="Elden Ring", franchise_id=sample_franchise.system_id
    )
    db_session.add(g)
    db_session.flush()
    return g


def _note(db, game, section, kind, content, author_id):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=game.system_id,
        section=section,
        kind=kind,
        content=content,
        author_id=author_id,
    )
    db.add(row)
    return row


def _run(db, statements):
    for statement in statements:
        db.execute(text(statement))
    db.commit()


def _reload(db, row):
    db.expire(row)
    return row


@pytest.fixture
def legacy_rows(db_session, game, admin_user):
    rows = {
        "guide": _note(db_session, game, "guides", None, "walkthrough", admin_user.id),
        "build": _note(
            db_session, game, "builds_and_mods", "Build", "bleed", admin_user.id
        ),
        "mod": _note(
            db_session, game, "builds_and_mods", "Mod", "co-op", admin_user.id
        ),
        "tool": _note(
            db_session, game, "builds_and_mods", "Tool", "save editor", admin_user.id
        ),
        "kindless": _note(
            db_session, game, "builds_and_mods", None, "no kind chosen", admin_user.id
        ),
    }
    db_session.commit()
    return rows


def test_guides_rows_become_guide_resources(db_session, revision, legacy_rows):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    assert _reload(db_session, legacy_rows["guide"]).section == "guide_resources"


def test_build_rows_become_builds_and_styles_with_the_kind_cleared(
    db_session, revision, legacy_rows
):
    """
    builds_and_styles declares no kinds, so a surviving kind='Build' would fail
    validate_note_payload check 5 the next time the row is edited - accepted by
    the migration, rejected by the app.
    """
    _run(db_session, revision.UPGRADE_STATEMENTS)
    row = _reload(db_session, legacy_rows["build"])
    assert row.section == "builds_and_styles"
    assert row.kind is None


def test_mod_and_tool_rows_become_mods_and_tools_keeping_their_kind(
    db_session, revision, legacy_rows
):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    mod = _reload(db_session, legacy_rows["mod"])
    tool = _reload(db_session, legacy_rows["tool"])
    assert (mod.section, mod.kind) == ("mods_and_tools", "Mod")
    assert (tool.section, tool.kind) == ("mods_and_tools", "Tool")


def test_a_kindless_row_is_treated_as_a_build(db_session, revision, legacy_rows):
    """
    A row entered without choosing a kind is far likelier to be a build than a
    tool - builds are what that section was mostly used for.
    """
    _run(db_session, revision.UPGRADE_STATEMENTS)
    row = _reload(db_session, legacy_rows["kindless"])
    assert row.section == "builds_and_styles"
    assert row.kind is None


def test_no_row_is_left_on_a_retired_key(db_session, revision, legacy_rows):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    left = (
        db_session.query(models.Note)
        .filter(models.Note.section.in_(("guides", "builds_and_mods")))
        .count()
    )
    assert left == 0


def test_every_migrated_key_is_a_real_registry_section(
    db_session, revision, legacy_rows
):
    """
    The migration and the registry have to agree. A key that survives here but
    is absent from NOTE_SECTIONS is a row the notes page silently drops.
    """
    from app.utils.note_sections import section_by_key

    _run(db_session, revision.UPGRADE_STATEMENTS)
    sections = {
        row.section
        for row in db_session.query(models.Note)
        .filter(models.Note.media_id.isnot(None))
        .all()
    }
    for section in sections:
        assert section_by_key(section) is not None, section


def test_downgrade_puts_every_row_back(db_session, revision, legacy_rows):
    _run(db_session, revision.UPGRADE_STATEMENTS)
    _run(db_session, revision.DOWNGRADE_STATEMENTS)

    sections = {
        name: _reload(db_session, row).section for name, row in legacy_rows.items()
    }
    assert sections["guide"] == "guides"
    assert sections["build"] == "builds_and_mods"
    assert sections["mod"] == "builds_and_mods"
    assert sections["tool"] == "builds_and_mods"
    assert _reload(db_session, legacy_rows["build"]).kind == "Build"
    assert _reload(db_session, legacy_rows["mod"]).kind == "Mod"


def test_the_migration_touches_no_other_section(
    db_session, revision, game, admin_user, legacy_rows
):
    """
    A refusal test needs something to refuse. `highlight_moments` is a game
    section that is NOT being migrated, and `resources` is the site-wide
    section whose key `builds_and_mods` was named around - if either moved, the
    WHERE clauses are too wide.
    """
    _note(db_session, game, "highlight_moments", None, "Ch 3 boss", admin_user.id)
    _note(db_session, game, "resources", None, "wiki", admin_user.id)
    db_session.commit()

    _run(db_session, revision.UPGRADE_STATEMENTS)

    kept = {
        row.section
        for row in db_session.query(models.Note)
        .filter(models.Note.section.in_(("highlight_moments", "resources")))
        .all()
    }
    assert kept == {"highlight_moments", "resources"}
