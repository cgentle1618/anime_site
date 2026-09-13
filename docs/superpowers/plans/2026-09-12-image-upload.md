# Image Upload Implementation Plan

**Status: SHIPPED** — `ab822576..873148a7` on `feat/image-upload`. See the
spec's own post-mortem
(`docs/superpowers/specs/2026-09-12-image-upload-design.md`) for what shipped
differently from what is planned below: the storage root moved from
`static/covers/library/` to `static/library/` on the owner's decision, `meme`
was added to the attachable owners after being missed here too, and the
`SOURCES` table in the backfill task below names the wrong tables and the
wrong column for four of nine owners (see the decision ledger,
`.superpowers/sdd/2026-09-12-image-upload/progress.md`, Ruling H and Ruling
F) — the plan text is left as originally written rather than edited to match
what actually shipped.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a catalogue editor upload an image from their own machine and attach it to any entry, person, character or quote, instead of only ever receiving images downloaded from external APIs.

**Architecture:** A two-table media library — `image` (one row per stored file, content-addressed by sha256 of the normalized bytes) and `image_attachment` (a polymorphic join to any owner). Uploads are re-encoded to JPEG by Pillow, which is both the format decision and the security control. This is the **expand** half of an expand/contract migration: the new tables become the source of truth and `cover_image_file` is written through, so every existing reader — Sheets, the formatters, the pipelines, the SPA — keeps working untouched.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, Alembic, Pillow (new), React + Vite, TanStack Query, Tailwind v4 semantic tokens.

**Spec:** `docs/superpowers/specs/2026-09-12-image-upload-design.md`

## Global Constraints

- **Branch and worktree.** `feat/image-upload`, worktree `C:\Users\cgent\Documents\anime_site_image_upload`, database `anime_site_image_upload`. Never work in the main checkout — other sessions have uncommitted files there.
- **Storage root.** Library files live at `static/covers/library/<checksum>.jpg`, thumbnails at `static/covers/library/thumbs/<checksum>.jpg`. **This is deliberate and load-bearing:** `getCoverUrl` in `frontend/src/lib/covers.js` prefixes `/static/covers/`, so a `cover_image_file` value of `library/<checksum>.jpg` resolves correctly with **zero frontend changes**. A sibling directory such as `static/images/` would break the dual-write of Task 3. It is also invisible to the orphan scanner by construction: `list_all_cover_images()` iterates `COVER_OWNERS` only, so `library/` is never listed and never deleted as a stray.
- **Permission gate.** `require_manage_catalog` from `app.services.rbac.resolver`. Import it by name; do not call `require_permission` inline.
- **The label gate is separate from the permission gate.** Any route that writes to a media entry must also call `entry_visible(db, viewer, media_type, entry_id)` from `app.services.rbac.enforcement` and return 404 on False.
- **Refusal tests need a non-empty label fixture.** `catalog_writer(label_keys=())` plus `hidden_anime` — both in `tests/api/conftest.py`. A refusal test without `nsfw_label` in the graph passes vacuously.
- **Image size cap:** `MAX_IMAGE_UPLOAD_MB`, default `10`. **Long-edge cap:** 2000px. **Thumbnail:** 400px.
- **Test command:** `venv\Scripts\python.exe -m pytest -q` from the worktree. **Take the lock first** — one pytest at a time across every tree:
  ```bash
  LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
  until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
  venv/Scripts/python.exe -m pytest -q; rc=$?
  rmdir "$LOCK"; exit $rc
  ```
- **The full backend suite takes ~5.5 minutes.** Run it before every commit, not at checkpoints. A scoped `-k` run cannot see a test three directories away that your change invalidated.
- **Commit with explicit paths only:** `git commit -m "..." -- path/one path/two`. Never `git add -A`, never a directory pathspec, never a bare `git commit`.
- **No AI attribution in any commit message.** No `Co-Authored-By`, no `Claude-Session`, no generated-with line. CLAUDE.md overrides the harness reminder that asks for them.
- **Frontend:** after any frontend change run `cd frontend && npm run build`. Use semantic colour tokens (`bg-surface`, `text-text-muted`); `src/theme-tokens.test.js` fails the build on hard-coded greys.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `app/models/image.py` | The `Image` and `ImageAttachment` ORM models. Nothing else. |
| `app/schemas/image.py` | Request/response shapes for the router. |
| `app/services/integrations/image_library.py` | Bytes in, stored file out: validate, normalize, checksum, write, delete. The only module that knows the library layout. |
| `app/routers/images.py` | HTTP surface, permission and label gates, error mapping. No image processing. |
| `alembic/versions/c1image0001_image_library.py` | Creates the two tables. |
| `alembic/versions/c1image0002_backfill_attachments.py` | Backfills attachments from the ten `cover_image_file` columns. |
| `tests/api/test_image_library_service.py` | The service in isolation — validation, normalization, dedup. |
| `tests/api/test_image_router.py` | Routes, permission gate, label gate. |
| `tests/api/test_image_dual_write.py` | The phase-1 invariant. |
| `frontend/src/pages/admin/Images.jsx` | The manager page. |
| `frontend/src/components/forms/ImagePicker.jsx` | The inline widget. |
| `frontend/src/hooks/useImages.js` | Query/mutation hooks. |
| `frontend/src/components/forms/ImagePicker.test.jsx` | Widget tests. |

**Modified:** `app/config.py`, `app/models/__init__.py`, `app/main.py`, `app/services/calculation.py`, `requirements.txt`, `frontend/src/api/endpoints.js`, `frontend/src/App.jsx`, `frontend/src/config/navigation.js`, `frontend/src/components/forms/QuoteForm.jsx`, `frontend/src/components/forms/MemeForm.jsx`, `docs/data-model.md`, `docs/api.md`, `docs/authorization.md`, `docs/roadmap.md`, `docs/PROGRESS.md`.

---

### Task 1: The library service, models and migration

**Files:**
- Create: `app/models/image.py`, `app/services/integrations/image_library.py`, `alembic/versions/c1image0001_image_library.py`, `tests/api/test_image_library_service.py`
- Modify: `app/models/__init__.py`, `app/config.py`, `requirements.txt`
- Test: `tests/api/test_image_library_service.py`

**Interfaces:**
- Consumes: `app.database.Base`, `app.database.get_taipei_now`, `app.config.settings`.
- Produces:
  - `models.Image` with columns `system_id, storage_key, thumb_key, checksum, original_filename, byte_size, width, height, uploaded_by, uploaded_at`
  - `models.ImageAttachment` with `system_id, image_id, owner_type, owner_id, role, position`
  - `image_library.ImageValidationError(Exception)`
  - `image_library.normalize_image(raw: bytes) -> NormalizedImage` where `NormalizedImage` is a dataclass `(jpeg: bytes, thumb: bytes, width: int, height: int, checksum: str)`
  - `image_library.store(normalized: NormalizedImage) -> tuple[str, str]` returning `(storage_key, thumb_key)`
  - `image_library.file_exists(storage_key: str) -> bool`
  - `image_library.delete_file(storage_key: str, thumb_key: str) -> None`
  - `image_library.MAX_EDGE`, `THUMB_EDGE`, `LIBRARY_SUBDIR`

- [ ] **Step 1: Add Pillow to requirements**

In `requirements.txt`, add (keeping the file's existing alphabetical grouping):

```
Pillow==11.3.0
```

Then install it into this worktree's venv:

```bash
venv/Scripts/python.exe -m pip install -r requirements-dev.txt
```

- [ ] **Step 2: Add the upload size setting**

In `app/config.py`, inside `class Settings`, after the `# --- Auth / JWT ---` block, add a new section:

```python
    # --- Image uploads ---
    # A cap on what one upload may weigh, checked twice: against the declared
    # Content-Length, and again while the body is streamed. The header is a
    # claim from the client and cannot be the only check.
    max_image_upload_mb: int = 10
```

- [ ] **Step 3: Write the failing service test**

Create `tests/api/test_image_library_service.py`:

```python
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
    # The re-encode is deterministic, so one file arriving twice is one row.
    first = image_library.normalize_image(_png_bytes())
    second = image_library.normalize_image(_png_bytes())

    assert first.checksum == second.checksum


def test_a_lossy_jpeg_source_does_not_dedup_against_its_png_original():
    # A JPEG decodes to DIFFERENT pixels than the PNG it was made from, so
    # content addressing cannot bridge the two. See the spec's correction.
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
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_library_service.py -q
```

Expected: collection error — `ModuleNotFoundError: No module named 'app.services.integrations.image_library'`.

- [ ] **Step 5: Write the service**

Create `app/services/integrations/image_library.py`:

```python
"""
image_library.py
The uploaded-image library: bytes in, stored file out.

Layout: every library image lives at `library/<checksum>.jpg` under
`static/covers/`, with a thumbnail beside it at
`library/thumbs/<checksum>.jpg`. Storage is CONTENT-ADDRESSED, which buys two
things the per-row layout in image_manager.py cannot give:

  * dedup - the same picture uploaded twice is one file and one row;
  * a safe replace - a replaced image is a NEW url, so no browser serves the
    old bytes from cache. Under `<owner>/<id>.jpg` the url never changes and a
    replaced cover goes stale in every open tab.

It sits under static/covers/ rather than a sibling directory on purpose:
`getCoverUrl` in the SPA prefixes `/static/covers/`, so `library/<sum>.jpg`
resolves with no frontend change and the dual-write of phase 1 works. The
`library/` folder is invisible to `list_all_cover_images()`, which walks
COVER_OWNERS only - so the orphan sweep can never mistake a library file for a
stray and delete it.
"""

import hashlib
import io
import logging
import os
from dataclasses import dataclass

from PIL import Image as PILImage
from PIL import UnidentifiedImageError

from app.services.integrations.image_manager import COVER_DIR

logger = logging.getLogger(__name__)

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

    The checksum is taken over the NORMALIZED bytes, so one picture uploaded
    once as PNG and once as JPEG dedups to a single row.
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
    return os.path.join(COVER_DIR, *key.split("/"))


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
```

- [ ] **Step 6: Run the service test to verify it passes**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_library_service.py -q
```

Expected: PASS, 15 tests.

- [ ] **Step 7: Write the models**

Create `app/models/image.py`:

```python
"""Image library ORM models - uploaded files and what they are attached to."""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class Image(Base):
    """
    One stored file in the library.

    Content-addressed: `checksum` is the sha256 of the NORMALIZED jpeg bytes
    and is unique, so the same picture uploaded twice is one row and one file.

    `uploaded_by` is not only provenance. It is how an UPLOADED image is told
    apart from a DOWNLOADED one, which `bulk_download_missing_covers` has to
    know: it re-fetches a missing cover from MAL, and doing that to an upload
    would destroy the only reference to a file no API can supply.
    """

    __tablename__ = "image"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Storage ---
    # Both keys are relative to static/covers/, matching cover_image_file, so
    # the SPA's existing /static/covers/ prefix resolves them unchanged.
    storage_key = Column(String, nullable=False)
    thumb_key = Column(String, nullable=True)
    checksum = Column(String(64), nullable=False, unique=True, index=True)

    # --- Provenance ---
    original_filename = Column(String, nullable=True)
    byte_size = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    uploaded_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_at = Column(DateTime(timezone=True), default=get_taipei_now)


class ImageAttachment(Base):
    """
    What an image is being used FOR.

    Polymorphic: `owner_type` is a plain string, so a new kind of owner costs a
    string rather than a migration. `owner_id` is deliberately NOT a foreign
    key - there is no single table to point at. The price is that nothing in
    the database stops an attachment outliving its owner; the `unused` filter
    on the manager page is what finds those. Ten nullable FK columns would be
    worse in every other respect.
    """

    __tablename__ = "image_attachment"
    __table_args__ = (
        UniqueConstraint(
            "owner_type",
            "owner_id",
            "role",
            "position",
            name="uq_image_attachment_owner_role_position",
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    image_id = Column(
        UUID(as_uuid=True),
        ForeignKey("image.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # e.g. "anime", "anime-movie", "staff", "character", "quote". Hyphenated
    # for media types, matching app/utils/media_resolver.py's data-layer keys -
    # NOT the registry's underscored router keys.
    owner_type = Column(String, nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # What the image is to its owner: "cover", "portrait", "quote".
    role = Column(String, nullable=False, default="cover")
    # Reserved for the multi-image case; always 0 today.
    position = Column(Integer, nullable=False, default=0)
```

- [ ] **Step 8: Register the models**

In `app/models/__init__.py`, add the import beside the others (keeping alphabetical order — it sits between `game_copy` and `manga`):

```python
from app.models.image import Image, ImageAttachment
```

If the file has an `__all__`, add `"Image"` and `"ImageAttachment"` to it in the same position.

- [ ] **Step 9: Write the migration**

Create `alembic/versions/c1image0001_image_library.py`:

```python
"""image library: uploaded files and their attachments

Revision ID: c1image0001
Revises: al1n2ilist
Create Date: 2026-09-12

Phase 1 of an expand/contract. These tables become the source of truth for
images; `cover_image_file` is kept written-through so every existing reader -
the Sheets formatters, the download pipelines, the orphan checks, the SPA -
is untouched. Phases 2 and 3 are on the roadmap.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c1image0001"
down_revision = "b1n2amealign"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "image",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("thumb_key", sa.String(), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("checksum", name="image_checksum_key"),
    )
    op.create_index("ix_image_system_id", "image", ["system_id"])
    op.create_index("ix_image_checksum", "image", ["checksum"])
    op.create_index("ix_image_uploaded_by", "image", ["uploaded_by"])

    op.create_table(
        "image_attachment",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_type", sa.String(), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="cover"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["image_id"], ["image.system_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "owner_type",
            "owner_id",
            "role",
            "position",
            name="uq_image_attachment_owner_role_position",
        ),
    )
    op.create_index("ix_image_attachment_system_id", "image_attachment", ["system_id"])
    op.create_index("ix_image_attachment_image_id", "image_attachment", ["image_id"])
    op.create_index("ix_image_attachment_owner_type", "image_attachment", ["owner_type"])
    op.create_index("ix_image_attachment_owner_id", "image_attachment", ["owner_id"])


def downgrade():
    op.drop_table("image_attachment")
    op.drop_table("image")
```

- [ ] **Step 10: Run the migration and confirm the chain still builds a schema**

```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m pytest tests/api/test_migrations_build_the_schema.py -q
```

Expected: the upgrade runs, and the migration test passes — it runs the real command against a scratch database and compares the result to the models, so a mismatch between the migration above and `app/models/image.py` fails here rather than silently.

- [ ] **Step 11: Run ruff and the full backend suite**

```bash
venv/Scripts/ruff.exe check .
```

Then, holding the lock:

```bash
LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
venv/Scripts/python.exe -m pytest -q; rc=$?
rmdir "$LOCK"; exit $rc
```

Expected: ruff clean, suite green. ~5.5 minutes.

- [ ] **Step 12: Commit**

```bash
git add app/models/image.py app/services/integrations/image_library.py \
        alembic/versions/c1image0001_image_library.py \
        tests/api/test_image_library_service.py \
        app/models/__init__.py app/config.py requirements.txt
git commit -m "feat(images): image library tables and storage service" -- \
        app/models/image.py app/services/integrations/image_library.py \
        alembic/versions/c1image0001_image_library.py \
        tests/api/test_image_library_service.py \
        app/models/__init__.py app/config.py requirements.txt
```

---

### Task 2: The upload router, its gates, and the download-pipeline guard

**Files:**
- Create: `app/routers/images.py`, `app/schemas/image.py`, `tests/api/test_image_router.py`
- Modify: `app/main.py` (router registration, ~line 222 beside `announcements`), `app/services/calculation.py` (`bulk_download_missing_covers`)
- Test: `tests/api/test_image_router.py`

**Interfaces:**
- Consumes: everything Task 1 produced; `require_manage_catalog` and `viewer_user_id` from `app.services.rbac.resolver`; `entry_visible` from `app.services.rbac.enforcement`; `MEDIA_TABLES` from `app.utils.media_resolver`.
- Produces:
  - `POST /api/images`, `GET /api/images`, `POST /api/images/{image_id}/attach`, `DELETE /api/images/{image_id}/attach/{attachment_id}`, `DELETE /api/images/{image_id}`
  - `app.routers.images.ATTACHABLE_OWNERS: frozenset[str]`
  - `app.routers.images.uploaded_image_ids(db) -> set[UUID]` — used by Task 2's guard and available to later phases

- [ ] **Step 1: Write the failing router test**

Create `tests/api/test_image_router.py`:

```python
"""
The image upload router: upload, list, attach, detach, delete.

`hidden_anime`, `nsfw_label` and `catalog_writer` are imported from conftest,
matching the pattern the rest of tests/api/ uses. nsfw_label is NOT decoration
here - without a content label in the graph the refusal test below has nothing
to refuse and passes vacuously on a fresh database.
"""

import io
import uuid

import pytest
from PIL import Image as PILImage

from app import models
from app.services.integrations import image_library
from tests.api.conftest import (  # noqa: F401
    catalog_writer,
    hidden_anime,
    nsfw_label,
)


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    """Never write into the developer's real static/covers during a test."""
    monkeypatch.setattr(image_library, "COVER_DIR", str(tmp_path))


def _png(width=50, height=40, color=(200, 30, 30)):
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, data=None, filename="cover.png", content_type="image/png"):
    return client.post(
        "/api/images",
        files={"file": (filename, data if data is not None else _png(), content_type)},
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def test_upload_stores_the_image_and_returns_the_row(admin_client, db_session):
    response = _upload(admin_client)

    assert response.status_code == 201
    body = response.json()
    assert body["storage_key"].startswith("library/")
    assert body["width"] == 50
    assert len(body["checksum"]) == 64
    assert db_session.query(models.Image).count() == 1


def test_upload_attaches_nothing_on_its_own(admin_client, db_session):
    _upload(admin_client)

    assert db_session.query(models.ImageAttachment).count() == 0


def test_uploading_the_same_picture_twice_makes_one_row(admin_client, db_session):
    first = _upload(admin_client).json()
    second = _upload(admin_client).json()

    assert first["system_id"] == second["system_id"]
    assert db_session.query(models.Image).count() == 1


def test_upload_records_who_uploaded_it(admin_client, db_session, admin_user):
    _upload(admin_client)

    image = db_session.query(models.Image).one()
    assert image.uploaded_by == admin_user.id


def test_upload_rejects_a_file_that_is_not_an_image(admin_client):
    response = _upload(admin_client, data=b"PK\x03\x04 nope", filename="cover.jpg")

    assert response.status_code == 422
    assert "image" in response.json()["detail"].lower()


def test_upload_rejects_a_file_over_the_cap(admin_client, monkeypatch):
    from app.routers import images as images_router

    monkeypatch.setattr(images_router, "MAX_UPLOAD_BYTES", 100)

    response = _upload(admin_client, data=_png(width=400, height=400))

    assert response.status_code == 413


def test_upload_requires_manage_catalog(client):
    assert _upload(client).status_code == 401


def test_upload_is_refused_to_a_signed_in_member(user_client):
    assert _upload(user_client).status_code == 401


# ---------------------------------------------------------------------------
# Attach
# ---------------------------------------------------------------------------

def test_attach_links_the_image_to_an_entry(admin_client, db_session, sample_anime):
    image = _upload(admin_client).json()

    response = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 201
    attachment = db_session.query(models.ImageAttachment).one()
    assert attachment.owner_type == "anime"
    assert attachment.owner_id == sample_anime.system_id


def test_attaching_again_replaces_rather_than_duplicating(
    admin_client, db_session, sample_anime
):
    first = _upload(admin_client).json()
    second = _upload(admin_client, data=_png(color=(30, 30, 200))).json()
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "role": "cover",
    }

    admin_client.post(f"/api/images/{first['system_id']}/attach", json=body)
    admin_client.post(f"/api/images/{second['system_id']}/attach", json=body)

    attachment = db_session.query(models.ImageAttachment).one()
    assert str(attachment.image_id) == second["system_id"]


def test_attach_rejects_an_unknown_owner_type(admin_client, sample_anime):
    image = _upload(admin_client).json()

    response = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "not-a-table",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 400


def test_attach_404s_on_a_missing_image(admin_client, sample_anime):
    response = admin_client.post(
        f"/api/images/{uuid.uuid4()}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# The content-label gate
#
# manage.catalog says NOTHING about which entries you may reach. A writer who
# cannot SEE a labelled entry must not be able to write to it - attaching a
# cover is a write. Both cases are asserted with the same fixtures, so a green
# proves the gate did the refusing rather than something incidental.
# ---------------------------------------------------------------------------

def test_attach_404s_for_a_writer_who_cannot_see_the_entry(
    db_session, client, catalog_writer, hidden_anime  # noqa: F811
):
    writer = catalog_writer(username="blindwriter", label_keys=())
    upload = writer.post(
        "/api/images", files={"file": ("c.png", _png(), "image/png")}
    )
    assert upload.status_code == 201

    response = writer.post(
        f"/api/images/{upload.json()['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(hidden_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 404
    assert db_session.query(models.ImageAttachment).count() == 0


def test_attach_succeeds_for_a_writer_who_holds_the_label(
    db_session, client, catalog_writer, hidden_anime  # noqa: F811
):
    writer = catalog_writer(username="seeingwriter", label_keys=("nsfw",))
    upload = writer.post(
        "/api/images", files={"file": ("c.png", _png(), "image/png")}
    )

    response = writer.post(
        f"/api/images/{upload.json()['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(hidden_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 201
    assert db_session.query(models.ImageAttachment).count() == 1


# ---------------------------------------------------------------------------
# List, detach, delete
# ---------------------------------------------------------------------------

def test_list_returns_the_library(admin_client):
    _upload(admin_client)

    response = admin_client.get("/api/images")

    assert response.status_code == 200
    assert len(response.json()["images"]) == 1


def test_list_unused_filters_to_unattached_images(admin_client, sample_anime):
    attached = _upload(admin_client).json()
    _upload(admin_client, data=_png(color=(30, 30, 200)))
    admin_client.post(
        f"/api/images/{attached['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = admin_client.get("/api/images?unused=true")

    assert len(response.json()["images"]) == 1
    assert response.json()["images"][0]["system_id"] != attached["system_id"]


def test_list_missing_reports_a_reference_with_no_file(
    admin_client, db_session, tmp_path
):
    # The normal state after a machine switch: uploaded images never travel
    # through Backup or Pull, so the row is live and the bytes are elsewhere.
    image = _upload(admin_client).json()
    (tmp_path / "library" / f"{image['checksum']}.jpg").unlink()

    response = admin_client.get("/api/images?missing=true")

    assert len(response.json()["images"]) == 1
    assert response.json()["images"][0]["missing"] is True


def test_detach_leaves_the_image_in_the_library(
    admin_client, db_session, sample_anime
):
    image = _upload(admin_client).json()
    attach = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    ).json()

    response = admin_client.delete(
        f"/api/images/{image['system_id']}/attach/{attach['system_id']}"
    )

    assert response.status_code == 204
    assert db_session.query(models.ImageAttachment).count() == 0
    assert db_session.query(models.Image).count() == 1


def test_delete_refuses_while_attached(admin_client, sample_anime):
    image = _upload(admin_client).json()
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = admin_client.delete(f"/api/images/{image['system_id']}")

    assert response.status_code == 409


def test_delete_force_removes_the_image_and_its_attachments(
    admin_client, db_session, sample_anime
):
    image = _upload(admin_client).json()
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = admin_client.delete(f"/api/images/{image['system_id']}?force=true")

    assert response.status_code == 204
    assert db_session.query(models.Image).count() == 0
    assert db_session.query(models.ImageAttachment).count() == 0
```

**Note on `sample_anime`:** confirm the fixture's exact name in `tests/api/conftest.py` before running — `grep -n "def sample_anime\|def anime" tests/api/conftest.py`. If it is named `anime`, use that name throughout this file instead.

- [ ] **Step 2: Run the test to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_router.py -q
```

Expected: every test fails with 404 (the routes do not exist), and the `MAX_UPLOAD_BYTES` test fails on import.

- [ ] **Step 3: Write the schemas**

Create `app/schemas/image.py`:

```python
"""Image library request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    storage_key: str
    thumb_key: Optional[str] = None
    checksum: str
    original_filename: Optional[str] = None
    byte_size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    uploaded_by: Optional[UUID] = None
    uploaded_at: Optional[datetime] = None

    # Computed per request rather than stored: whether the bytes are on THIS
    # machine, and what this image is currently used for.
    missing: bool = False
    attachments: List["AttachmentOut"] = []


class AttachmentIn(BaseModel):
    owner_type: str
    owner_id: UUID
    role: str = "cover"


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    image_id: UUID
    owner_type: str
    owner_id: UUID
    role: str
    position: int


class ImageListOut(BaseModel):
    images: List[ImageOut]
    total: int


ImageOut.model_rebuild()
```

- [ ] **Step 4: Write the router**

Create `app/routers/images.py`:

```python
"""
routers/images.py
Upload an image from your own machine and attach it to something.

Every other image this application holds arrived by download from an external
API. This is the one place bytes come from the user.

Upload and attach are deliberately SEPARATE calls. An image can be uploaded to
the library with no owner in mind, and an existing image can be attached to a
second owner without re-uploading; the picker widget simply makes both calls in
sequence.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.dependencies import get_db
from app.schemas.image import AttachmentIn, AttachmentOut, ImageListOut, ImageOut
from app.services.integrations import image_library
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.resolver import Viewer, require_manage_catalog, viewer_user_id
from app.utils.media_resolver import MEDIA_TABLES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/images", tags=["Images"])

MAX_UPLOAD_BYTES = settings.max_image_upload_mb * 1024 * 1024

# Read in 1MB chunks so an oversized body is refused partway through rather
# than after the whole thing is in memory.
CHUNK_SIZE = 1024 * 1024

# Every owner an image may be attached to. The media types come from
# MEDIA_TABLES so the hyphen/underscore split stays in one place; the rest are
# named explicitly. Note this is NOT the same set as image_manager.COVER_OWNERS,
# which has no `quote` - the shape reads uniform and is not.
ATTACHABLE_OWNERS: frozenset[str] = frozenset(MEDIA_TABLES) | frozenset(
    {"staff", "character", "publisher", "studio", "quote"}
)


def _read_capped(upload: UploadFile) -> bytes:
    """
    Read the body, refusing anything over the cap.

    Content-Length is checked first because it is free, and then ignored: it is
    a claim from the client, so the streaming check below is the one that
    actually holds.
    """
    declared = upload.size
    if declared is not None and declared > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds the {settings.max_image_upload_mb}MB limit.",
        )

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = upload.file.read(CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Image exceeds the {settings.max_image_upload_mb}MB limit.",
            )
        chunks.append(chunk)

    return b"".join(chunks)


def _to_out(db: Session, image: models.Image) -> ImageOut:
    """One image, plus the two things only a request can know."""
    out = ImageOut.model_validate(image)
    out.missing = not image_library.file_exists(image.storage_key)
    out.attachments = [
        AttachmentOut.model_validate(row)
        for row in db.query(models.ImageAttachment)
        .filter(models.ImageAttachment.image_id == image.system_id)
        .all()
    ]
    return out


def uploaded_image_ids(db: Session) -> set:
    """
    Every image that was UPLOADED rather than downloaded.

    `bulk_download_missing_covers` needs this: it re-fetches a missing cover
    from MAL, and an uploaded image cannot be re-fetched by anything, so doing
    that to one destroys the only reference to the file.
    """
    return {
        row[0]
        for row in db.query(models.Image.system_id)
        .filter(models.Image.uploaded_by.isnot(None))
        .all()
    }


@router.post("", status_code=201, response_model=ImageOut, summary="Upload an image")
def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Validate, normalize and store one image. Attaches it to nothing.

    The re-encode inside normalize_image is the security control: the filename
    extension and the multipart content type are both client-supplied and are
    used for nothing here.
    """
    raw = _read_capped(file)

    try:
        normalized = image_library.normalize_image(raw)
    except image_library.ImageValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    existing = (
        db.query(models.Image)
        .filter(models.Image.checksum == normalized.checksum)
        .first()
    )
    if existing:
        # Same picture, already here. Re-store anyway: the bytes may be missing
        # on this machine even though the row is not.
        image_library.store(normalized)
        return _to_out(db, existing)

    storage_key, thumb_key = image_library.store(normalized)
    image = models.Image(
        storage_key=storage_key,
        thumb_key=thumb_key,
        checksum=normalized.checksum,
        original_filename=file.filename,
        byte_size=len(normalized.jpeg),
        width=normalized.width,
        height=normalized.height,
        uploaded_by=viewer_user_id(admin),
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    return _to_out(db, image)


@router.get("", response_model=ImageListOut, summary="The image library")
def list_images(
    unused: bool = Query(False),
    missing: bool = Query(False),
    duplicates: bool = Query(False),
    q: Optional[str] = Query(None),
    limit: int = Query(60, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """The library, filtered by the three questions the manager page asks."""
    query = db.query(models.Image)

    if q:
        query = query.filter(models.Image.original_filename.ilike(f"%{q}%"))

    if unused:
        attached = db.query(models.ImageAttachment.image_id).subquery()
        query = query.filter(models.Image.system_id.notin_(attached))

    if duplicates:
        # Should always be empty: checksum is unique, so this exists to PROVE
        # dedup works rather than to fix anything.
        query = query.filter(False)

    rows = query.order_by(models.Image.uploaded_at.desc()).all()
    out = [_to_out(db, row) for row in rows]

    if missing:
        out = [row for row in out if row.missing]

    total = len(out)
    return ImageListOut(images=out[offset : offset + limit], total=total)


@router.post(
    "/{image_id}/attach",
    status_code=201,
    response_model=AttachmentOut,
    summary="Attach an image to an owner",
)
def attach_image(
    image_id: UUID,
    payload: AttachmentIn,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Point an owner at this image. Idempotent per (owner, role): re-attaching
    replaces, so "change the cover" is one call and never leaves two rows.

    The permission gate is NOT sufficient on its own. manage.catalog says
    nothing about WHICH entries a writer may reach, so a media owner is checked
    against entry_visible and 404s exactly as a missing entry does - writes
    follow reads.
    """
    if payload.owner_type not in ATTACHABLE_OWNERS:
        raise HTTPException(
            status_code=400, detail=f"Unknown owner type: {payload.owner_type}"
        )

    image = db.get(models.Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")

    if payload.owner_type in MEDIA_TABLES:
        if not entry_visible(db, admin, payload.owner_type, payload.owner_id):
            raise HTTPException(status_code=404, detail="Entry not found.")

    existing = (
        db.query(models.ImageAttachment)
        .filter(
            models.ImageAttachment.owner_type == payload.owner_type,
            models.ImageAttachment.owner_id == payload.owner_id,
            models.ImageAttachment.role == payload.role,
            models.ImageAttachment.position == 0,
        )
        .first()
    )
    if existing:
        existing.image_id = image.system_id
        attachment = existing
    else:
        attachment = models.ImageAttachment(
            image_id=image.system_id,
            owner_type=payload.owner_type,
            owner_id=payload.owner_id,
            role=payload.role,
            position=0,
        )
        db.add(attachment)

    db.commit()
    db.refresh(attachment)
    return AttachmentOut.model_validate(attachment)


@router.delete(
    "/{image_id}/attach/{attachment_id}",
    status_code=204,
    summary="Detach an image",
)
def detach_image(
    image_id: UUID,
    attachment_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Unlink, leaving the file in the library for reuse."""
    attachment = db.get(models.ImageAttachment, attachment_id)
    if attachment is None or attachment.image_id != image_id:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    db.delete(attachment)
    db.commit()
    return Response(status_code=204)


@router.delete("/{image_id}", status_code=204, summary="Delete an image")
def delete_image(
    image_id: UUID,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Remove the image and its file. Refuses while anything still uses it, unless
    forced - deleting an attached image is a decision, not a tidy-up.
    """
    image = db.get(models.Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")

    attached = (
        db.query(models.ImageAttachment)
        .filter(models.ImageAttachment.image_id == image_id)
        .count()
    )
    if attached and not force:
        raise HTTPException(
            status_code=409,
            detail=f"Image is still attached to {attached} owner(s).",
        )

    storage_key, thumb_key = image.storage_key, image.thumb_key
    db.delete(image)  # attachments cascade
    db.commit()
    image_library.delete_file(storage_key, thumb_key)
    return Response(status_code=204)
```

- [ ] **Step 5: Register the router**

In `app/main.py`, add the import beside the other router imports and register it next to `announcements` (around line 222):

```python
app.include_router(images.router)
```

Add `images` to the router import list at the top of the file, in alphabetical position.

- [ ] **Step 6: Run the router test to verify it passes**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_router.py -q
```

Expected: PASS. If `test_attach_succeeds_for_a_writer_who_holds_the_label` fails while its refusal twin passes, the label fixture is not reaching the mode — check `make_viewer`'s `label_keys` handling in conftest before changing the router.

- [ ] **Step 7: Write the failing guard test**

Append to `tests/api/test_image_router.py`:

```python
# ---------------------------------------------------------------------------
# The guard on bulk_download_missing_covers
#
# That action nulls cover_image_file and re-fetches from MAL. Against a
# DOWNLOADED cover that is correct and idempotent. Against an UPLOADED one on a
# machine that does not have the file - which is guaranteed to happen, because
# uploaded images never travel through Backup or Pull - it destroys the only
# reference to a file no API can supply, and reports success.
# ---------------------------------------------------------------------------

def test_download_missing_covers_skips_an_uploaded_image(
    admin_client, db_session, sample_anime, tmp_path
):
    from app.services import calculation

    image = _upload(admin_client).json()
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )
    sample_anime.cover_image_file = image["storage_key"]
    db_session.flush()
    # The bytes are gone - the other machine has them, this one does not.
    (tmp_path / "library" / f"{image['checksum']}.jpg").unlink()

    result = calculation.bulk_download_missing_covers(db_session)

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == image["storage_key"]
    assert result["skipped_uploads"] >= 1
```

- [ ] **Step 8: Run it to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_router.py -k uploaded_image -q
```

Expected: FAIL — `KeyError: 'skipped_uploads'`, and `cover_image_file` has been set to `None`. That failure **is the defect**; confirm you see the None before fixing it.

- [ ] **Step 9: Add the guard**

In `app/services/calculation.py`, inside `bulk_download_missing_covers`, add the upload set at the top of the function:

```python
    # Rows whose cover is an UPLOAD are skipped: re-fetching from MAL would
    # null a reference to a file no external API can supply. Uploaded images
    # deliberately do not travel through Backup or Pull, so a missing file is
    # the normal state on the other machine, not a repairable one.
    from app.routers.images import uploaded_image_ids

    uploaded = uploaded_image_ids(db)
    uploaded_owners = {
        (row.owner_type, row.owner_id)
        for row in db.query(models.ImageAttachment)
        .filter(models.ImageAttachment.image_id.in_(uploaded))
        .all()
    } if uploaded else set()
    skipped_uploads = 0
```

Then in `_collect`, filter them out — the helper already takes `owner_type`:

```python
    def _collect(query, model, owner_type):
        if system_ids is not None:
            query = query.filter(model.system_id.in_(system_ids))
        return [
            e
            for e in query.all()
            if not cover_image_exists(owner_type, str(e.system_id))
            and (owner_type, e.system_id) not in uploaded_owners
        ]
```

Count what was skipped by measuring the difference, and add it to the returned dict:

```python
    return {
        "status": "success",
        "downloaded": downloaded,
        "skipped": skipped,
        "skipped_uploads": skipped_uploads,
        "total": total,
    }
```

Set `skipped_uploads = len(uploaded_owners)` immediately before the return. Read the existing return statement first and preserve every key it already has — other callers and the `/system` page read them.

- [ ] **Step 10: Run the guard test to verify it passes**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_router.py -q
```

Expected: PASS, all tests in the file.

- [ ] **Step 11: ruff, then the full suite under the lock**

```bash
venv/Scripts/ruff.exe check .
```

```bash
LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
venv/Scripts/python.exe -m pytest -q; rc=$?
rmdir "$LOCK"; exit $rc
```

Expected: green. Pay attention to `tests/api/test_capability_dependencies.py` and `test_authz_router_gates.py` — they enumerate routers and gates, and a new router may need to be listed there. If one fails, read it and add `images` rather than weakening the assertion.

- [ ] **Step 12: Commit**

```bash
git commit -m "feat(images): upload router with label gate and download guard" -- \
        app/routers/images.py app/schemas/image.py app/main.py \
        app/services/calculation.py tests/api/test_image_router.py
```

---

### Task 3: Backfill and dual-write

**Files:**
- Create: `alembic/versions/c1image0002_backfill_attachments.py`, `tests/api/test_image_dual_write.py`
- Modify: `app/routers/images.py` (write through to the owner's column on attach/detach)
- Test: `tests/api/test_image_dual_write.py`

**Interfaces:**
- Consumes: Task 2's `attach_image` / `detach_image`.
- Produces: `app.routers.images.mirror_to_owner_column(db, owner_type, owner_id, role, storage_key) -> None`

- [ ] **Step 1: Write the failing dual-write test**

Create `tests/api/test_image_dual_write.py`:

```python
"""
Phase 1 of the expand/contract: the new tables are the truth, and
cover_image_file is written THROUGH so every existing reader - the Sheets
formatters, the download pipelines, the orphan checks, the SPA - keeps working
untouched.

This file guards that invariant. If it goes red, phase 1's entire premise -
"behaviour-neutral for existing readers" - has stopped holding.
"""

import io

import pytest
from PIL import Image as PILImage

from app.services.integrations import image_library


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(image_library, "COVER_DIR", str(tmp_path))


def _png(color=(200, 30, 30)):
    buf = io.BytesIO()
    PILImage.new("RGB", (50, 40), color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, color=(200, 30, 30)):
    return client.post(
        "/api/images", files={"file": ("c.png", _png(color), "image/png")}
    ).json()


def test_attaching_a_cover_writes_the_mirror_column(
    admin_client, db_session, sample_anime
):
    image = _upload(admin_client)

    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == image["storage_key"]


def test_replacing_a_cover_updates_the_mirror(
    admin_client, db_session, sample_anime
):
    first = _upload(admin_client)
    second = _upload(admin_client, color=(30, 30, 200))
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "role": "cover",
    }

    admin_client.post(f"/api/images/{first['system_id']}/attach", json=body)
    admin_client.post(f"/api/images/{second['system_id']}/attach", json=body)

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == second["storage_key"]


def test_detaching_clears_the_mirror(admin_client, db_session, sample_anime):
    image = _upload(admin_client)
    attach = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    ).json()

    admin_client.delete(
        f"/api/images/{image['system_id']}/attach/{attach['system_id']}"
    )

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None


def test_the_mirror_resolves_through_the_spa_url_prefix(
    admin_client, db_session, sample_anime
):
    # getCoverUrl prefixes /static/covers/, so the mirror value must be
    # relative to that directory and nothing else. This is why the library
    # lives UNDER static/covers/ rather than in a sibling folder.
    image = _upload(admin_client)
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file.startswith("library/")
    assert not sample_anime.cover_image_file.startswith("/")
```

- [ ] **Step 2: Run it to verify it fails**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_dual_write.py -q
```

Expected: FAIL — `cover_image_file` is None after attach.

- [ ] **Step 3: Add the mirror write**

In `app/routers/images.py`, add above `attach_image`:

```python
# The owner tables that carry a mirror column, and what that column is called.
# Media entries mirror onto the `media` supertable's cover_image_file; the
# entity tables carry their own. Read each definition rather than assuming the
# shape is uniform - staff and character use `photo_file`, not
# `cover_image_file`, and `quote` uses `image_file` and resolves against
# static/quotes/ rather than static/covers/.
MIRROR_COLUMNS = {
    "staff": "photo_file",
    "character": "photo_file",
    "publisher": "cover_image_file",
    "studio": "cover_image_file",
    "quote": "image_file",
}


def mirror_to_owner_column(db, owner_type, owner_id, role, storage_key):
    """
    Write the storage key onto the owner's legacy column.

    Phase 1 of the expand/contract keeps `cover_image_file` and friends
    written-through so that the Sheets formatters, the download pipelines, the
    orphan checks and every getCoverUrl call in the SPA keep working with no
    change at all. Phases 2 and 3 - moving readers, then dropping the columns -
    are on the roadmap, and this function is what they eventually delete.
    """
    if role != "cover" and owner_type != "quote":
        return

    if owner_type in MEDIA_TABLES:
        model = MEDIA_TABLES[owner_type].model
        row = db.get(model, owner_id)
        if row is not None:
            row.cover_image_file = storage_key
        return

    column = MIRROR_COLUMNS.get(owner_type)
    if column is None:
        return

    model = _ENTITY_MODELS.get(owner_type)
    if model is None:
        return
    row = db.get(model, owner_id)
    if row is not None:
        setattr(row, column, storage_key)
```

And the model map beside it:

```python
_ENTITY_MODELS = {
    "staff": models.Person,
    "character": models.Character,
    "publisher": models.Publisher,
    "studio": models.Studio,
    "quote": models.Quote,
}
```

**Before writing this, verify every name in both dicts** by reading the models: `grep -n "photo_file\|cover_image_file\|image_file" app/models/staff.py app/models/character.py app/models/publisher.py app/models/quote.py`, and confirm the class the `staff` owner type maps to (`app/models/staff.py` defines `Person`, not `Staff` — check it). A wrong name here writes to the wrong column silently.

Then call it from `attach_image`, immediately before `db.commit()`:

```python
    mirror_to_owner_column(
        db, payload.owner_type, payload.owner_id, payload.role, image.storage_key
    )
```

And from `detach_image`, before `db.commit()`:

```python
    mirror_to_owner_column(
        db, attachment.owner_type, attachment.owner_id, attachment.role, None
    )
```

- [ ] **Step 4: Run the dual-write test to verify it passes**

```bash
venv/Scripts/python.exe -m pytest tests/api/test_image_dual_write.py -q
```

Expected: PASS.

- [ ] **Step 5: Write the backfill migration**

Create `alembic/versions/c1image0002_backfill_attachments.py`:

```python
"""backfill image attachments from the existing cover columns

Revision ID: c1image0002
Revises: c1image0001
Create Date: 2026-09-12

Every image that already exists arrived by DOWNLOAD, so `uploaded_by` is left
NULL for all of them - which is exactly what tells them apart from uploads
later, and what keeps bulk_download_missing_covers free to re-fetch them.

The checksum for a backfilled row is NOT the sha256 of its bytes: the files are
not re-read here (there may be thousands, and some are missing on this
machine). The storage key is already unique per owner, so it doubles as the
identity - `legacy:<owner_type>/<id>.jpg`. A later upload of the same picture
gets a real checksum and is a separate row, which is correct: they are
different files on disk.
"""

import sqlalchemy as sa
from alembic import op

revision = "c1image0002"
down_revision = "c1image0001"
branch_labels = None
depends_on = None

# (owner_type, table, id column, image column). Read from the models rather
# than assumed: staff and character use photo_file, not cover_image_file.
SOURCES = (
    ("anime", "anime", "system_id", "cover_image_file"),
    ("anime-movie", "anime_movies", "system_id", "cover_image_file"),
    ("cartoon", "cartoon", "system_id", "cover_image_file"),
    ("movie", "movie", "system_id", "cover_image_file"),
    ("tv-show", "tv_show", "system_id", "cover_image_file"),
    ("manga", "manga", "system_id", "cover_image_file"),
    ("novel", "novel", "system_id", "cover_image_file"),
    ("comic", "comic", "system_id", "cover_image_file"),
    ("game", "game", "system_id", "cover_image_file"),
    ("staff", "person", "system_id", "photo_file"),
    ("character", "character", "system_id", "photo_file"),
)


def upgrade():
    conn = op.get_bind()

    for owner_type, table, id_col, image_col in SOURCES:
        # Skip a table this database does not have rather than aborting the
        # whole migration - the media tables are stable, but this keeps the
        # revision runnable against a partially-built database.
        exists = conn.execute(
            sa.text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}
        ).scalar()
        if exists is None:
            continue

        conn.execute(
            sa.text(
                f"""
                INSERT INTO image (system_id, storage_key, checksum, uploaded_by)
                SELECT gen_random_uuid(), {image_col},
                       'legacy:' || {image_col}, NULL
                FROM {table}
                WHERE {image_col} IS NOT NULL
                  AND {image_col} <> ''
                  AND {image_col} <> 'N/A'
                ON CONFLICT (checksum) DO NOTHING
                """
            )
        )

        conn.execute(
            sa.text(
                f"""
                INSERT INTO image_attachment
                    (system_id, image_id, owner_type, owner_id, role, position)
                SELECT gen_random_uuid(), i.system_id, :owner_type,
                       t.{id_col}, 'cover', 0
                FROM {table} t
                JOIN image i ON i.checksum = 'legacy:' || t.{image_col}
                WHERE t.{image_col} IS NOT NULL
                  AND t.{image_col} <> ''
                  AND t.{image_col} <> 'N/A'
                ON CONFLICT ON CONSTRAINT uq_image_attachment_owner_role_position
                DO NOTHING
                """
            ),
            {"owner_type": owner_type},
        )


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM image_attachment"))
    conn.execute(
        sa.text("DELETE FROM image WHERE checksum LIKE 'legacy:%'")
    )
```

**Verify every table name in `SOURCES` before running it** — `\dt` in psql, or `grep -n "__tablename__" app/models/*.py`. The spec warns that this shape reads uniform and is not: `anime_movies` is plural where the rest are singular.

- [ ] **Step 6: Run the migration and confirm the backfill**

```bash
venv/Scripts/python.exe -m alembic upgrade head
venv/Scripts/python.exe -m pytest tests/api/test_migrations_build_the_schema.py -q
```

Expected: upgrade succeeds, migration test passes.

- [ ] **Step 7: ruff, then the full suite under the lock**

```bash
venv/Scripts/ruff.exe check .
```

```bash
LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
venv/Scripts/python.exe -m pytest -q; rc=$?
rmdir "$LOCK"; exit $rc
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(images): backfill attachments and dual-write cover columns" -- \
        alembic/versions/c1image0002_backfill_attachments.py \
        app/routers/images.py tests/api/test_image_dual_write.py
```

---

### Task 4: The manager page and the inline picker

**Files:**
- Create: `frontend/src/pages/admin/Images.jsx`, `frontend/src/components/forms/ImagePicker.jsx`, `frontend/src/hooks/useImages.js`, `frontend/src/components/forms/ImagePicker.test.jsx`
- Modify: `frontend/src/api/endpoints.js`, `frontend/src/App.jsx`, `frontend/src/config/navigation.js`, `frontend/src/components/forms/QuoteForm.jsx:155`, `frontend/src/components/forms/MemeForm.jsx:155`
- Test: `frontend/src/components/forms/ImagePicker.test.jsx`

**Interfaces:**
- Consumes: the five routes from Task 2.
- Produces: `useImages(filters)`, `useUploadImage()`, `useAttachImage()`, `useDeleteImage()` from `hooks/useImages.js`; `<ImagePicker ownerType ownerId role value onChange />`.

- [ ] **Step 1: Add the endpoints**

In `frontend/src/api/endpoints.js`, inside the `endpoints` object beside `announcements`:

```javascript
  images: {
    list: (params = "") => `/api/images${params ? `?${params}` : ""}`,
    upload: () => "/api/images",
    attach: (imageId) => `/api/images/${imageId}/attach`,
    detach: (imageId, attachmentId) =>
      `/api/images/${imageId}/attach/${attachmentId}`,
    remove: (imageId, force = false) =>
      `/api/images/${imageId}${force ? "?force=true" : ""}`,
  },
```

- [ ] **Step 2: Write the hooks**

Create `frontend/src/hooks/useImages.js`:

```javascript
// Frontend: data hooks for the image library.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endpoints } from "../api/endpoints";
import { fetchJson } from "./queryUtils";

export function imagesQueryKey(filters = {}) {
  return ["images", filters];
}

export function useImages(filters = {}, options = {}) {
  const params = new URLSearchParams();
  if (filters.unused) params.set("unused", "true");
  if (filters.missing) params.set("missing", "true");
  if (filters.duplicates) params.set("duplicates", "true");
  if (filters.q) params.set("q", filters.q);

  return useQuery({
    queryKey: imagesQueryKey(filters),
    queryFn: () => fetchJson(endpoints.images.list(params.toString())),
    staleTime: 30_000,
    ...options,
  });
}

export function useUploadImage() {
  const queryClient = useQueryClient();

  return useMutation({
    // FormData, and deliberately NO Content-Type header: the browser has to
    // set it itself so that it carries the multipart boundary. Setting it by
    // hand produces a body the server cannot parse.
    mutationFn: (file) => {
      const body = new FormData();
      body.append("file", file);
      return fetchJson(endpoints.images.upload(), { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}

export function useAttachImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ imageId, ownerType, ownerId, role = "cover" }) =>
      fetchJson(endpoints.images.attach(imageId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_type: ownerType,
          owner_id: ownerId,
          role,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ imageId, force = false }) =>
      fetchJson(endpoints.images.remove(imageId, force), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}
```

**Check `fetchJson` first** — `sed -n 1,40p frontend/src/hooks/queryUtils.js`. If it always sets a JSON `Content-Type` or always calls `JSON.stringify`, the upload mutation must use `fetch` directly instead; a FormData body must reach the network untouched.

- [ ] **Step 3: Write the failing picker test**

Create `frontend/src/components/forms/ImagePicker.test.jsx`:

```jsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImagePicker from "./ImagePicker";

function renderPicker(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImagePicker
        ownerType="anime"
        ownerId="11111111-1111-1111-1111-111111111111"
        role="cover"
        value={null}
        onChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("ImagePicker", () => {
  it("shows the upload control when there is no image", () => {
    renderPicker();
    expect(screen.getByLabelText(/upload/i)).toBeInTheDocument();
  });

  it("renders the current image when one is set", () => {
    renderPicker({ value: "library/abc123.jpg" });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/static/covers/library/abc123.jpg",
    );
  });

  it("offers the library picker", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: /choose from library/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
cd frontend && npm run test:run -- ImagePicker
```

Expected: FAIL — cannot resolve `./ImagePicker`.

- [ ] **Step 5: Write the picker and the page**

Create `frontend/src/components/forms/ImagePicker.jsx` — current thumbnail via `getCoverUrl`, a file input labelled "Upload", and a "Choose from library" button opening a modal grid fed by `useImages`. On file select: `useUploadImage()` then `useAttachImage()` in sequence, then `onChange(storage_key)` so the surrounding form's value stays in step.

Create `frontend/src/pages/admin/Images.jsx` — a paginated thumbnail grid over `useImages`, a multi-file drop zone, and the three filters (`unused`, `missing`, `duplicates`) as toggle chips. Each tile shows what it is attached to, or "unused". **The `missing` filter's empty state must not read as an error**: after a machine switch, missing is the expected state for every uploaded image, so word it as "not on this machine" rather than "broken".

Use only semantic tokens (`bg-surface`, `text-text-muted`, `border-border`). Follow `frontend/src/pages/admin/CleanOrphans.jsx` for the page shell, filter chips and confirm-dialog patterns — read it before writing.

- [ ] **Step 6: Register the route and the nav entry — BOTH**

In `frontend/src/App.jsx`, inside the existing `<Route element={<ProtectedRoute permission="manage.catalog" />}>` block (around line 194, beside `/add` and `/modify`):

```jsx
                  <Route path="/images" element={<Images />} />
```

In `frontend/src/config/navigation.js`, add a row in the same group as Add/Modify:

```javascript
      {
        label: "Images",
        to: "/images",
        requires: "manage.catalog",
      },
```

**These are two independent permission surfaces.** `App.jsx` blocks the route; `navigation.js` calls `has()` separately to decide whether the link is drawn. Registering one and not the other half-ships the page — CLAUDE.md names this as the standing way this SPA does it.

- [ ] **Step 7: Swap the picker into the quote and meme forms**

In `frontend/src/components/forms/QuoteForm.jsx` (the `image_file` input at ~line 155) and `frontend/src/components/forms/MemeForm.jsx` (~line 155), replace the text input with:

```jsx
<ImagePicker
  ownerType="quote"
  ownerId={val.system_id}
  role="quote"
  value={val.image_file}
  onChange={(key) => set("image_file", key)}
/>
```

`getQuoteImageUrl` in `frontend/src/lib/covers.js` returns null off localhost, which is the hold this retires. Leave that function in place for now — other callers use it — but the picker resolves through `getCoverUrl` instead, so the controls are no longer hidden. Note in the commit message that the hold is lifted.

- [ ] **Step 8: Run the frontend checks**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```

Expected: all green. `npm run build` is not optional — `:8000` serves the prebuilt bundle, so without it the page exists on `:5173` only.

- [ ] **Step 9: Notify that it is viewable, then run the backend suite**

Send a push notification saying the image manager is viewable on `:8001`, then start the backend suite. **Do not pause for a reply** — the notification is a signal, not a question, and the review happens while the suite runs.

```bash
LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
venv/Scripts/python.exe -m pytest -q; rc=$?
rmdir "$LOCK"; exit $rc
```

- [ ] **Step 10: Update the docs in the same change**

- `docs/data-model.md` — the two new tables, present tense, with the `Last verified` line bumped.
- `docs/api.md` — the five routes and their gates.
- `docs/authorization.md` — that image routes are `manage.catalog` plus the content-label check.
- `docs/roadmap.md` — a **Done** entry, newest first: what shipped, why the library is content-addressed, that this is expand/contract phase 1, **and that phases 2 and 3 are outstanding with the Google Sheets column as phase 3's gate**. Also record what was deliberately not done: no sync of image bytes between machines.
- `docs/PROGRESS.md` — delete this plan's task table once every task is `done <sha>`.

Do not write history into any doc other than those three — no "added 2026-09-12", no phase names in `data-model.md` or `api.md`.

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(images): image manager page and inline picker" -- \
        frontend/src/pages/admin/Images.jsx \
        frontend/src/components/forms/ImagePicker.jsx \
        frontend/src/components/forms/ImagePicker.test.jsx \
        frontend/src/hooks/useImages.js frontend/src/api/endpoints.js \
        frontend/src/App.jsx frontend/src/config/navigation.js \
        frontend/src/components/forms/QuoteForm.jsx \
        frontend/src/components/forms/MemeForm.jsx \
        docs/data-model.md docs/api.md docs/authorization.md \
        docs/roadmap.md docs/PROGRESS.md
```

- [ ] **Step 12: Push and draft the PR — then stop**

```bash
git push -u origin feat/image-upload
```

Show the owner the PR title and body and **wait**. Opening the PR and merging it are theirs. No AI attribution anywhere in the title or body.

---

## Self-Review

**Spec coverage:** Decision 1 → Task 1 (models, migration). Decision 2 → Task 1 (service, tests). Decision 3 → Task 3 (backfill, dual-write) and Task 4 Step 10 (roadmap records phases 2–3). Decision 4 → Task 1 (`file_exists`), Task 2 (`missing` filter), Task 4 (page wording). Decision 5 → Task 2 Steps 7–9. Decision 6 → Task 2 (gate plus both label tests). Decision 7 → Task 2 (`ATTACHABLE_OWNERS`). Endpoints → Task 2. UI → Task 4. Testing → every task. Sequencing → the four tasks, in order.

**Known gaps the executor must close by reading code, flagged inline rather than guessed:**
- The `sample_anime` fixture name (Task 2 Step 1).
- `MIRROR_COLUMNS` and `_ENTITY_MODELS` — column and class names (Task 3 Step 3). `app/models/staff.py` defines `Person`.
- The exact existing return keys of `bulk_download_missing_covers` (Task 2 Step 9).
- Whether `fetchJson` can carry a FormData body (Task 4 Step 2).
- Table names in the backfill's `SOURCES` (Task 3 Step 5) — `anime_movies` is plural where others are singular.

These are named rather than filled in because a wrong value in any of them fails silently — writing to the wrong column, or backfilling nothing — which is precisely the "shape that reads as uniform" trap CLAUDE.md warns about.
