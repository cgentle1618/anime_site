"""Franchise and Series ORM models."""

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


class Franchise(Base, NameFallbackMixin):
    """
    Top-level media franchise entity. Groups related series and individual entries.
    """

    __tablename__ = "franchise"
    _name_fields = [
        "franchise_name_en",
        "franchise_name_cn",
        "franchise_name_roman",
        "franchise_name_jp",
        "franchise_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_type = Column(String, nullable=True)
    franchise_name_en = Column(String, nullable=True)
    franchise_name_cn = Column(String, nullable=True)
    franchise_name_roman = Column(String, nullable=True)
    franchise_name_jp = Column(String, nullable=True)
    franchise_name_alt = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    franchise_expectation = Column(String, default="Low")
    # Optional umbrella tier. SET NULL keeps deleting a Collection non-destructive:
    # member franchises survive and simply become uncollected.
    # Declared here (not at the end) because format_model_for_sheet iterates
    # __table__.columns, so this position is the Franchise sheet's column J.
    collection_id = Column(
        UUID(as_uuid=True),
        ForeignKey("collection.system_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    cover_entry_id = Column(UUID(as_uuid=True), nullable=True)
    type_covers = Column(JSONB, nullable=True)
    type_slots = Column(JSONB, nullable=True)
    # Size bucket per media type, e.g. {"anime": "24ep", "tv-show": "2season"}.
    # A standing property of the group, not of a plan_next row: a series is
    # "2 Seasons" whether or not it is queued. Two maps rather than one plus an
    # override flag - Calculate rewrites `derived` freely and can never stomp a
    # manual edit. See app/services/domain/size_group.py.
    size_group_derived = Column(JSONB, nullable=True)
    size_group_manual = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    series = relationship("Series", back_populates="franchise")
    collection = relationship(
        "Collection", back_populates="franchises", foreign_keys=[collection_id]
    )
    animes = relationship(
        "Anime", back_populates="franchise", foreign_keys="[Anime.franchise_id]"
    )

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.franchise_name_cn),
            ("EN", self.franchise_name_en),
            ("Alt", self.franchise_name_alt),
            ("roman", self.franchise_name_roman),
            ("JP", self.franchise_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")



class Series(Base, NameFallbackMixin):
    """
    Intermediate grouping layer. Links individual entries to a parent Franchise.

    Mirrors Franchise's shape without its type/collection concepts: a series has
    no type of its own, and Collection is an umbrella over franchises, not series.
    """

    __tablename__ = "series"
    _name_fields = [
        "series_name_en",
        "series_name_cn",
        "series_name_roman",
        "series_name_jp",
        "series_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    series_name_en = Column(String, nullable=True)
    series_name_cn = Column(String, nullable=True)
    series_name_roman = Column(String, nullable=True)
    series_name_jp = Column(String, nullable=True)
    series_name_alt = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    series_expectation = Column(String, default="Low")
    # Any entry UUID, any type. No FK: no single constraint can span the six
    # entry tables a series may hold. Mirrors Franchise.cover_entry_id.
    cover_entry_id = Column(UUID(as_uuid=True), nullable=True)
    # Size bucket per media type, e.g. {"anime": "24ep", "tv-show": "2season"}.
    # A standing property of the group, not of a plan_next row: a series is
    # "2 Seasons" whether or not it is queued. Two maps rather than one plus an
    # override flag - Calculate rewrites `derived` freely and can never stomp a
    # manual edit. See app/services/domain/size_group.py.
    size_group_derived = Column(JSONB, nullable=True)
    size_group_manual = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    franchise = relationship("Franchise", back_populates="series")
    animes = relationship("Anime", back_populates="series")

    @property
    def names_dict(self) -> dict:
        return {
            "en": self.series_name_en,
            "cn": self.series_name_cn,
            "roman": self.series_name_roman,
            "jp": self.series_name_jp,
            "alt": self.series_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.series_name_cn),
            ("EN", self.series_name_en),
            ("Alt", self.series_name_alt),
            ("roman", self.series_name_roman),
            ("JP", self.series_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
