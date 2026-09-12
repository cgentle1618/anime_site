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
from sqlalchemy import false
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
    actually holds. `upload.size` is only populated by newer Starlette
    versions, so it is read defensively.
    """
    declared = getattr(upload, "size", None)
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
        attached = db.query(models.ImageAttachment.image_id)
        query = query.filter(models.Image.system_id.notin_(attached))

    if duplicates:
        # Should always be empty: checksum is unique, so this exists to PROVE
        # dedup works rather than to fix anything. `query.filter(False)` is not
        # valid SQLAlchemy - it needs the sql-expression false().
        query = query.filter(false())

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
