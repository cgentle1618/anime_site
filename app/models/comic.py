"""Comic ORM model."""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Comic(Base, NameFallbackMixin):
    """Western comic runs, Marvel-focused. One entry is one numbered run."""

    __tablename__ = "comic"
    _name_fields = [
        "comic_name_en",
        "comic_name_cn",
        "comic_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
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
    publisher = Column(String, nullable=True)
    imprint = Column(String, nullable=True)
    continuity = Column(String, nullable=True)
    era = Column(String, nullable=True)
    # Comma-joined multi-select, same idiom as franchise.franchise_type.
    events = Column(String, nullable=True)
    is_main_entry = Column(Boolean, nullable=True)

    writer = Column(String, nullable=True)
    artist = Column(String, nullable=True)
    release_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    publisher_tw = Column(String, nullable=True)

    issue_total = Column(Integer, nullable=True)
    issue_fin = Column(Integer, nullable=False, default=0)
    serialization_status = Column(String, nullable=True)
    reading_status = Column(String, nullable=False, default="Might Read")
    read_order = Column(Float, nullable=True)

    my_rating = Column(String, nullable=True)

    source_other = Column(JSONB, default=None, nullable=True)

    # No UI this pass (plan pages are out of scope), but created now so adding
    # those pages later needs no migration.
    read_next = Column(Boolean, nullable=True)
    to_reread = Column(Boolean, default=False, nullable=True)

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
