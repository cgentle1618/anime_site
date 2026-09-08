"""
Unit tests for the one-off cover-layout migration script.

The script moves `static/covers/<uuid>.jpg` to
`static/covers/<owner_type>/<uuid>.jpg` and rewrites the row's filename column
to the full key. No database: COVER_DIR is pointed at a tmp_path
and the Session is stubbed, so the whole plan/apply cycle is exercised on real
files against fake rows.
"""

import uuid
from types import SimpleNamespace

import pytest

from app import models
from app.services.integrations import image_manager
from scripts import migrate_cover_layout as mig


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeSession:
    """Stands in for a Session: fixed rows per model, commits are counted."""

    def __init__(self, rows_by_model=None):
        self.rows_by_model = rows_by_model or {}
        self.commits = 0

    def query(self, model):
        return FakeQuery(self.rows_by_model.get(model, []))

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass

    def close(self):
        pass


@pytest.fixture
def covers(tmp_path, monkeypatch):
    """Local mode with COVER_DIR under tmp_path."""
    root = tmp_path / "covers"
    root.mkdir()
    monkeypatch.setattr(image_manager, "COVER_DIR", str(root))
    return root


def flat_file(root, name):
    path = root / name
    path.write_bytes(b"jpeg-bytes")
    return path


def anime_row(filename):
    return SimpleNamespace(system_id=uuid.uuid4(), cover_image_file=filename)


def test_flat_file_is_moved_and_column_updated(covers):
    row = anime_row("aaa.jpg")
    flat_file(covers, "aaa.jpg")
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=True)

    assert not (covers / "aaa.jpg").exists()
    assert (covers / "anime" / "aaa.jpg").read_bytes() == b"jpeg-bytes"
    assert row.cover_image_file == "anime/aaa.jpg"
    assert report.owners["anime"]["moved"] == 1
    assert report.owners["anime"]["column_updated"] == 1
    assert db.commits == 1


def test_second_run_is_a_noop(covers):
    row = anime_row("aaa.jpg")
    flat_file(covers, "aaa.jpg")
    db = FakeSession({models.Anime: [row]})

    mig.migrate(db, mig.LocalStore(), apply=True)
    report = mig.migrate(db, mig.LocalStore(), apply=True)

    assert report.owners["anime"]["moved"] == 0
    assert report.owners["anime"]["column_updated"] == 0
    assert report.owners["anime"]["already"] == 1
    assert report.owners["anime"]["missing"] == 0
    assert row.cover_image_file == "anime/aaa.jpg"
    assert (covers / "anime" / "aaa.jpg").exists()


def test_column_already_namespaced_still_moves_the_file(covers):
    """The other machine pulls migrated column values but keeps flat files."""
    row = anime_row("anime/aaa.jpg")
    flat_file(covers, "aaa.jpg")
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=True)

    assert (covers / "anime" / "aaa.jpg").exists()
    assert not (covers / "aaa.jpg").exists()
    assert report.owners["anime"]["moved"] == 1
    assert report.owners["anime"]["column_updated"] == 0


def test_row_with_missing_file_is_reported_and_not_touched(covers):
    row = anime_row("gone.jpg")
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=True)

    assert report.owners["anime"]["missing"] == 1
    assert report.owners["anime"]["moved"] == 0
    assert ("anime", "gone.jpg") in report.missing
    # A row whose image is gone keeps its column: rewriting it would invent a
    # key for a file that does not exist.
    assert row.cover_image_file == "gone.jpg"


def test_file_with_no_row_is_reported_and_left_in_place(covers):
    flat_file(covers, "orphan.jpg")
    db = FakeSession()

    report = mig.migrate(db, mig.LocalStore(), apply=True)

    assert report.orphans == ["orphan.jpg"]
    assert (covers / "orphan.jpg").exists()
    for owner in mig.owner_types():
        assert not (covers / owner / "orphan.jpg").exists()


def test_dry_run_changes_nothing(covers):
    row = anime_row("aaa.jpg")
    flat_file(covers, "aaa.jpg")
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=False)

    assert (covers / "aaa.jpg").exists()
    assert not (covers / "anime" / "aaa.jpg").exists()
    assert row.cover_image_file == "aaa.jpg"
    assert db.commits == 0
    # The plan is still reported in full.
    assert report.owners["anime"]["moved"] == 1
    assert report.owners["anime"]["column_updated"] == 1


def test_every_owner_type_has_a_source_table():
    assert set(mig.owner_types()) == set(image_manager.COVER_OWNERS)


def test_empty_column_is_skipped(covers):
    row = anime_row(None)
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=True)

    assert report.owners["anime"]["moved"] == 0
    assert report.owners["anime"]["missing"] == 0
    assert row.cover_image_file is None


# ---------------------------------------------------------------------------
# --prune-orphans
#
# Files no row references. The admin "delete orphaned covers" action can only
# see the ones inside an owner folder - list_all_cover_images ignores the
# storage root - so anything left flat has to be cleaned up here.
# ---------------------------------------------------------------------------


def test_prune_deletes_unreferenced_root_files(covers):
    row = anime_row("aaa.jpg")
    flat_file(covers, "aaa.jpg")
    stray = flat_file(covers, "stray.jpg")
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=True, prune_orphans=True)

    assert not stray.exists()
    assert (covers / "anime" / "aaa.jpg").exists()
    assert report.orphans == ["stray.jpg"]
    assert report.pruned == 1


def test_prune_deletes_unreferenced_files_inside_owner_folders(covers):
    row = anime_row("aaa.jpg")
    flat_file(covers, "aaa.jpg")
    (covers / "studio").mkdir()
    duplicate = covers / "studio" / "copy.jpg"
    duplicate.write_bytes(b"a stray logo")
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=True, prune_orphans=True)

    assert not duplicate.exists()
    assert report.folder_orphans == ["studio/copy.jpg"]
    assert report.pruned == 1


def test_prune_keeps_every_referenced_file(covers):
    row = anime_row("aaa.jpg")
    flat_file(covers, "aaa.jpg")
    db = FakeSession({models.Anime: [row]})

    report = mig.migrate(db, mig.LocalStore(), apply=True, prune_orphans=True)

    assert (covers / "anime" / "aaa.jpg").exists()
    assert report.pruned == 0


def test_prune_without_apply_deletes_nothing(covers):
    stray = flat_file(covers, "stray.jpg")
    db = FakeSession({})

    report = mig.migrate(db, mig.LocalStore(), apply=False, prune_orphans=True)

    assert stray.exists()
    assert report.orphans == ["stray.jpg"]
    assert report.pruned == 0


def test_orphans_are_left_alone_without_the_prune_flag(covers):
    stray = flat_file(covers, "stray.jpg")
    db = FakeSession({})

    report = mig.migrate(db, mig.LocalStore(), apply=True)

    assert stray.exists()
    assert report.orphans == ["stray.jpg"]
    assert report.pruned == 0
