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
    role = Column(String, nullable=False, default="cover", server_default="cover")
    # Reserved for the multi-image case; always 0 today.
    position = Column(Integer, nullable=False, default=0, server_default="0")
