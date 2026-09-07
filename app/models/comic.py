"""Comic ORM model."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Sequence,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Comic(Base, NameFallbackMixin):
    """Western comic runs, Marvel-focused. One entry is one numbered run."""

    __tablename__ = "comic"
    __table_args__ = (
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_comic_release_date_iso",
        ),
        CheckConstraint(
            r"end_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_comic_end_date_iso",
        ),
        UniqueConstraint(
            "public_id",
            name="uq_comic_public_id",
            # Deferred so a Pull can permute public_id across rows inside
            # one transaction: the sheet can hand row A an id row B still
            # holds until the restore reaches B. Only the end state has to
            # be unique, and it is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    _name_fields = [
        "comic_name_en",
        "comic_name_cn",
        "comic_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Short, stable, per-table id shown in SPA URLs; system_id remains the
    # join key and never leaves the API.
    public_id = Column(Integer, Sequence("comic_public_id_seq"), nullable=False)
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    comic_name_en = Column(String, nullable=True)
    comic_name_cn = Column(String, nullable=True)
    comic_name_alt = Column(String, nullable=True)
    # Run designator: "Vol. 5", "(2018)", "Legacy". Free text, not numeric:
    # Marvel run labels are not consistently numbered.
    volume_label = Column(String, nullable=True)

    comic_type = Column(String, nullable=True)
    is_main_entry = Column(Boolean, nullable=True)

    release_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)

    issue_total = Column(Integer, nullable=True)
    issue_fin = Column(Integer, nullable=False, default=0)
    serialization_status = Column(String, nullable=True)
    reading_status = Column(String, nullable=False, default="Might Read")
    read_order = Column(Float, nullable=True)

    my_rating = Column(String, nullable=True)

    # Comic Vine volume handle. The ID is derived from the link (same idiom as
    # manga.mal_id / mal_link) and is what the Fill pipeline fetches on.
    comicvine_id = Column(Integer, nullable=True)
    comicvine_link = Column(String, nullable=True)

    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    @property
    def display_name(self) -> str:
        sequence = [
            ("EN", self.comic_name_en),
            ("CN", self.comic_name_cn),
            ("Alt", self.comic_name_alt),
        ]
        return self.get_fallback_name(sequence, "EN")
