"""
Unit tests for the owner-typed cover storage layout.

Every image is stored under `static/covers/<owner_type>/<system_id>.jpg`, so a
system_id alone no longer names a file - each entry point takes the owner type
alongside it. These tests point COVER_DIR at a tmp_path and exercise the real
filesystem.
"""

from types import SimpleNamespace

import pytest

from app.services.integrations import image_manager


@pytest.fixture
def local_covers(tmp_path, monkeypatch):
    """COVER_DIR under tmp_path."""
    root = tmp_path / "covers"
    monkeypatch.setattr(image_manager, "COVER_DIR", str(root))
    return root


# --------------------------------------------------------------------------
# cover_key
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "owner_type",
    [
        "anime",
        "anime-movie",
        "tv-show",
        "game",
        "staff",
        "character",
        "publisher",
        "studio",
    ],
)
def test_cover_key_is_owner_folder_plus_id(owner_type):
    assert image_manager.cover_key(owner_type, "abc-123") == f"{owner_type}/abc-123.jpg"


def test_cover_key_rejects_unknown_owner_type():
    """A typo must fail loudly rather than silently create a stray folder."""
    with pytest.raises(ValueError):
        image_manager.cover_key("animes", "abc-123")


def test_every_media_type_key_is_a_cover_owner():
    from app.utils.media_resolver import MEDIA_TYPE_KEYS

    for key in MEDIA_TYPE_KEYS:
        assert key in image_manager.COVER_OWNERS


# --------------------------------------------------------------------------
# download
# --------------------------------------------------------------------------


def test_download_writes_into_the_owner_folder_and_returns_the_key(
    local_covers, monkeypatch
):
    monkeypatch.setattr(
        image_manager.requests,
        "get",
        lambda *a, **k: SimpleNamespace(
            content=b"jpegbytes", raise_for_status=lambda: None
        ),
    )

    key = image_manager.download_cover_image("http://x/y.jpg", "anime", "id1")

    assert key == "anime/id1.jpg"
    assert (local_covers / "anime" / "id1.jpg").read_bytes() == b"jpegbytes"


def test_download_skips_when_the_owner_scoped_file_already_exists(
    local_covers, monkeypatch
):
    (local_covers / "staff").mkdir(parents=True)
    (local_covers / "staff" / "id1.jpg").write_bytes(b"old")

    def explode(*a, **k):
        raise AssertionError("must not re-download an existing cover")

    monkeypatch.setattr(image_manager.requests, "get", explode)

    assert (
        image_manager.download_cover_image("http://x/y.jpg", "staff", "id1")
        == "staff/id1.jpg"
    )


def test_download_ignores_a_stray_flat_file_of_the_same_id(local_covers, monkeypatch):
    """An un-migrated file at the root must not satisfy the new location."""
    local_covers.mkdir(parents=True)
    (local_covers / "id1.jpg").write_bytes(b"flat")
    monkeypatch.setattr(
        image_manager.requests,
        "get",
        lambda *a, **k: SimpleNamespace(content=b"fresh", raise_for_status=lambda: None),
    )

    image_manager.download_cover_image("http://x/y.jpg", "anime", "id1")

    assert (local_covers / "anime" / "id1.jpg").read_bytes() == b"fresh"


# --------------------------------------------------------------------------
# exists / delete
# --------------------------------------------------------------------------


def test_exists_is_owner_scoped(local_covers):
    (local_covers / "manga").mkdir(parents=True)
    (local_covers / "manga" / "id1.jpg").write_bytes(b"x")

    assert image_manager.cover_image_exists("manga", "id1") is True
    # The same id under a different owner is a different image.
    assert image_manager.cover_image_exists("novel", "id1") is False


def test_exists_does_not_match_a_flat_file(local_covers):
    local_covers.mkdir(parents=True)
    (local_covers / "id1.jpg").write_bytes(b"x")

    assert image_manager.cover_image_exists("anime", "id1") is False


def test_delete_removes_only_the_owner_scoped_file(local_covers):
    (local_covers / "studio").mkdir(parents=True)
    (local_covers / "studio" / "id1.jpg").write_bytes(b"x")
    (local_covers / "id1.jpg").write_bytes(b"flat")

    image_manager.delete_cover_image("studio", "id1")

    assert not (local_covers / "studio" / "id1.jpg").exists()
    assert (local_covers / "id1.jpg").exists()


def test_delete_is_quiet_when_the_file_is_absent(local_covers):
    local_covers.mkdir(parents=True)
    image_manager.delete_cover_image("comic", "nope")  # must not raise


# --------------------------------------------------------------------------
# listing
# --------------------------------------------------------------------------


def test_list_returns_keys_not_bare_filenames(local_covers):
    for owner, name in [("anime", "a"), ("anime", "b"), ("staff", "c")]:
        (local_covers / owner).mkdir(parents=True, exist_ok=True)
        (local_covers / owner / f"{name}.jpg").write_bytes(b"x")

    assert set(image_manager.list_all_cover_images()) == {
        "anime/a.jpg",
        "anime/b.jpg",
        "staff/c.jpg",
    }


def test_list_can_be_restricted_to_one_owner(local_covers):
    for owner, name in [("anime", "a"), ("staff", "c")]:
        (local_covers / owner).mkdir(parents=True, exist_ok=True)
        (local_covers / owner / f"{name}.jpg").write_bytes(b"x")

    assert image_manager.list_all_cover_images("anime") == ["anime/a.jpg"]


def test_list_skips_files_left_at_the_root(local_covers):
    """Un-migrated flat files are not part of the new layout's inventory."""
    local_covers.mkdir(parents=True)
    (local_covers / "loose.jpg").write_bytes(b"x")

    assert image_manager.list_all_cover_images() == []


def test_list_of_a_missing_dir_is_empty(local_covers):
    assert image_manager.list_all_cover_images() == []
