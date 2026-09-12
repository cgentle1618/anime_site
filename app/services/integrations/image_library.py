"""
image_library.py
The uploaded-image library: bytes in, stored file out.

Layout: every library image lives at `library/<checksum>.jpg` under
`static/`, with a thumbnail beside it at `library/thumbs/<checksum>.jpg`.
Storage is CONTENT-ADDRESSED, which buys two things the per-row layout in
image_manager.py cannot give:

  * dedup - the same bytes uploaded twice are one file and one row;
  * a safe replace - a replaced image is a NEW url, so no browser serves the
    old bytes from cache. Under `<owner>/<id>.jpg` the url never changes and a
    replaced cover goes stale in every open tab.

The `library/` tree is a sibling of `covers/`, not part of it, so it is
invisible to `list_all_cover_images()`, which walks COVER_OWNERS folders under
`static/covers/` only - the orphan sweep can never mistake a library file for
a stray cover and delete it.
"""

import hashlib
import io
import logging
import os
from dataclasses import dataclass

from PIL import Image as PILImage
from PIL import UnidentifiedImageError

logger = logging.getLogger(__name__)

STATIC_DIR = "static"
LIBRARY_SUBDIR = "library"
THUMB_SUBDIR = "library/thumbs"

# The long edge a stored image is capped at, and the long edge of its
# thumbnail. A cover is displayed at a few hundred pixels; 2000 leaves room to
# zoom without storing a 12-megapixel phone photo forever.
MAX_EDGE = 2000
THUMB_EDGE = 400

JPEG_QUALITY = 88


class ImageValidationError(Exception):
    """The uploaded bytes are not an image this application will store."""


@dataclass(frozen=True)
class NormalizedImage:
    jpeg: bytes
    thumb: bytes
    width: int
    height: int
    checksum: str


def _decode(raw: bytes) -> PILImage.Image:
    """
    Decide what the bytes actually are.

    The filename extension and the multipart Content-Type are both supplied by
    the client and are used for nothing. `verify()` consumes the file object,
    so the image has to be opened a second time to be usable - that is Pillow's
    documented contract, not a workaround.
    """
    if not raw:
        raise ImageValidationError("The uploaded file is empty.")

    try:
        PILImage.open(io.BytesIO(raw)).verify()
        return PILImage.open(io.BytesIO(raw))
    except UnidentifiedImageError as exc:
        raise ImageValidationError(
            "That file is not a PNG, JPEG or WebP image."
        ) from exc
    except Exception as exc:
        raise ImageValidationError(f"The image could not be read: {exc}") from exc


def normalize_image(raw: bytes) -> NormalizedImage:
    """
    Validate, re-encode to JPEG, cap the dimensions, build a thumbnail.

    The re-encode is the SECURITY control and not a format preference: it
    strips EXIF - a phone screenshot carries GPS coordinates - and it cannot
    carry over a payload hidden in a container segment the decoder skipped,
    because the output is written from decoded pixels rather than copied.

    The checksum is taken over the NORMALIZED bytes: identical bytes uploaded
    twice dedup to a single row, and so do identical pixels arriving in two
    LOSSLESS containers (PNG, lossless WebP). A lossy JPEG of the same picture
    deliberately does not - it decodes to different pixels than its source,
    so content addressing cannot bridge the two.
    """
    image = _decode(raw)

    # RGB because JPEG has no alpha channel; a transparent PNG would otherwise
    # raise on save. The white background is what transparency flattens onto.
    if image.mode in ("RGBA", "LA", "P"):
        backdrop = PILImage.new("RGB", image.size, (255, 255, 255))
        converted = image.convert("RGBA")
        backdrop.paste(converted, mask=converted.split()[-1])
        image = backdrop
    elif image.mode != "RGB":
        image = image.convert("RGB")

    if max(image.size) > MAX_EDGE:
        image.thumbnail((MAX_EDGE, MAX_EDGE), PILImage.LANCZOS)

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    jpeg = buf.getvalue()

    thumbnail = image.copy()
    thumbnail.thumbnail((THUMB_EDGE, THUMB_EDGE), PILImage.LANCZOS)
    thumb_buf = io.BytesIO()
    thumbnail.save(thumb_buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)

    return NormalizedImage(
        jpeg=jpeg,
        thumb=thumb_buf.getvalue(),
        width=image.width,
        height=image.height,
        checksum=hashlib.sha256(jpeg).hexdigest(),
    )


def _local_path(key: str) -> str:
    return os.path.join(STATIC_DIR, *key.split("/"))


def store(normalized: NormalizedImage) -> tuple[str, str]:
    """
    Write the image and its thumbnail, returning `(storage_key, thumb_key)`.

    Idempotent by construction: the key is the checksum, so re-storing the same
    picture overwrites identical bytes with identical bytes.
    """
    storage_key = f"{LIBRARY_SUBDIR}/{normalized.checksum}.jpg"
    thumb_key = f"{THUMB_SUBDIR}/{normalized.checksum}.jpg"

    for key, payload in ((storage_key, normalized.jpeg), (thumb_key, normalized.thumb)):
        path = _local_path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(payload)

    logger.info(f"Stored library image: {storage_key}")
    return storage_key, thumb_key


def file_exists(storage_key: str) -> bool:
    """
    Whether the bytes are on THIS machine.

    False is a normal answer, not an error: uploaded images deliberately do not
    travel through Backup or Pull, so after a machine switch every uploaded
    image is a live reference with no local file.
    """
    if not storage_key:
        return False
    return os.path.exists(_local_path(storage_key))


def delete_file(storage_key: str, thumb_key: str) -> None:
    """Remove an image and its thumbnail. Absent files are not an error."""
    for key in (storage_key, thumb_key):
        if not key:
            continue
        try:
            path = _local_path(key)
            if os.path.exists(path):
                os.remove(path)
        except Exception as exc:
            # Non-critical: the row is already gone or going. Log and continue.
            logger.error(f"Failed to delete library image {key}: {exc}")
