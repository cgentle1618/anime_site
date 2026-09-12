"""
The image library service: validation, normalization, dedup, storage.

These tests never touch the database or the HTTP layer. They write real files,
so every test that stores anything points COVER_DIR at a tmp_path.
"""

import io

import pytest
from PIL import Image as PILImage

from app.services.integrations import image_library


def _png_bytes(width=50, height=40, color=(200, 30, 30)):
    """A real PNG, built in memory."""
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(width=50, height=40, color=(200, 30, 30)):
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(buf, format="JPEG")
    return buf.getvalue()


def _lossless_webp_bytes(width=50, height=40, color=(200, 30, 30)):
    """The same pixels as `_png_bytes`, in a different container."""
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(
        buf, format="WEBP", lossless=True
    )
    return buf.getvalue()


def test_normalize_accepts_png_and_returns_jpeg():
    result = image_library.normalize_image(_png_bytes())

    assert result.jpeg[:2] == b"\xff\xd8"  # JPEG SOI marker
    assert result.width == 50
    assert result.height == 40
    assert len(result.checksum) == 64


def test_normalize_rejects_a_file_that_is_not_an_image():
    # A zip renamed .jpg is the shape this actually defends against: the
    # extension and the multipart Content-Type are both attacker-controlled,
    # so the bytes are the only thing worth asking.
    with pytest.raises(image_library.ImageValidationError):
        image_library.normalize_image(b"PK\x03\x04 not an image at all")


def test_normalize_rejects_empty_bytes():
    with pytest.raises(image_library.ImageValidationError):
        image_library.normalize_image(b"")


def test_normalize_caps_the_long_edge():
    result = image_library.normalize_image(_png_bytes(width=4000, height=1000))

    assert result.width == image_library.MAX_EDGE
    assert result.height == image_library.MAX_EDGE // 4


def test_normalize_leaves_a_small_image_alone():
    result = image_library.normalize_image(_png_bytes(width=50, height=40))

    assert (result.width, result.height) == (50, 40)


def test_thumbnail_is_capped_at_the_thumb_edge():
    result = image_library.normalize_image(_png_bytes(width=1000, height=1000))

    thumb = PILImage.open(io.BytesIO(result.thumb))
    assert max(thumb.size) == image_library.THUMB_EDGE


def test_the_same_bytes_uploaded_twice_dedup_to_one_checksum():
    # The checksum is taken over the NORMALIZED bytes, not the upload, and the
    # re-encode is deterministic - so one file arriving twice is one library
    # row and one file on disk.
    first = image_library.normalize_image(_png_bytes())
    second = image_library.normalize_image(_png_bytes())

    assert first.checksum == second.checksum


def test_the_same_pixels_in_two_containers_dedup_to_one_checksum():
    # Dedup is over PIXELS, not over the container: a picture stored losslessly
    # as PNG and as WebP decodes to the same pixels and normalizes to the same
    # bytes. What it cannot bridge is a LOSSY source - the test below.
    from_png = image_library.normalize_image(_png_bytes())
    from_webp = image_library.normalize_image(_lossless_webp_bytes())

    assert from_png.checksum == from_webp.checksum


def test_a_lossy_jpeg_source_does_not_dedup_against_its_png_original():
    # Recorded because the design claimed the opposite. A JPEG is lossy: it
    # decodes to DIFFERENT pixels than the PNG it was made from - a flat
    # (200, 30, 30) comes back (202, 30, 30) - so re-encoding the two cannot
    # produce identical bytes. Cross-format dedup of a lossy source is not
    # reachable by content addressing, and nothing here attempts it.
    from_png = image_library.normalize_image(_png_bytes())
    from_jpeg = image_library.normalize_image(_jpeg_bytes())

    assert from_png.checksum != from_jpeg.checksum


def test_different_pictures_get_different_checksums():
    a = image_library.normalize_image(_png_bytes(color=(200, 30, 30)))
    b = image_library.normalize_image(_png_bytes(color=(30, 30, 200)))

    assert a.checksum != b.checksum


def test_exif_is_stripped_by_the_re_encode():
    buf = io.BytesIO()
    source = PILImage.new("RGB", (60, 60), (10, 20, 30))
    exif = source.getexif()
    exif[0x010F] = "SomeCamera"  # Make
    source.save(buf, format="JPEG", exif=exif)

    result = image_library.normalize_image(buf.getvalue())

    assert PILImage.open(io.BytesIO(result.jpeg)).getexif().get(0x010F) is None


def test_store_writes_both_files_and_returns_their_keys(tmp_path, monkeypatch):
    monkeypatch.setattr(image_library, "COVER_DIR", str(tmp_path))
    result = image_library.normalize_image(_png_bytes())

    storage_key, thumb_key = image_library.store(result)

    assert storage_key == f"library/{result.checksum}.jpg"
    assert thumb_key == f"library/thumbs/{result.checksum}.jpg"
    assert (tmp_path / "library" / f"{result.checksum}.jpg").exists()
    assert (tmp_path / "library" / "thumbs" / f"{result.checksum}.jpg").exists()


def test_store_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(image_library, "COVER_DIR", str(tmp_path))
    result = image_library.normalize_image(_png_bytes())

    first = image_library.store(result)
    second = image_library.store(result)

    assert first == second
    assert len(list((tmp_path / "library").glob("*.jpg"))) == 1


def test_file_exists_reports_a_missing_file(tmp_path, monkeypatch):
    # "Missing" is a NORMAL state here, not corruption: uploaded images never
    # travel through Backup or Pull, so after a machine switch every uploaded
    # image is a reference with no bytes. The manager page names it.
    monkeypatch.setattr(image_library, "COVER_DIR", str(tmp_path))

    assert image_library.file_exists("library/deadbeef.jpg") is False


def test_delete_file_removes_both_and_tolerates_absence(tmp_path, monkeypatch):
    monkeypatch.setattr(image_library, "COVER_DIR", str(tmp_path))
    result = image_library.normalize_image(_png_bytes())
    storage_key, thumb_key = image_library.store(result)

    image_library.delete_file(storage_key, thumb_key)
    image_library.delete_file(storage_key, thumb_key)  # second call is a no-op

    assert image_library.file_exists(storage_key) is False
