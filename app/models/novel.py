"""Novel ORM model."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Novel(Base, NameFallbackMixin):
    """Light novel, web novel, and book entries."""

    __tablename__ = "novel"
    __table_args__ = (
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_novel_release_date_iso",
        ),
        CheckConstraint(
            r"end_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_novel_end_date_iso",
        ),
    )
    _name_fields = [
        "novel_name_en",
        "novel_name_cn",
        "novel_name_roman",
        "novel_name_jp",
        "novel_name_alt",
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

    novel_name_en = Column(String, nullable=True)
    novel_name_cn = Column(String, nullable=True)
    novel_name_roman = Column(String, nullable=True)
    novel_name_jp = Column(String, nullable=True)
    novel_name_alt = Column(String, nullable=True)

    region = Column(String, nullable=True)
    type = Column(String, nullable=True)
    version = Column(String, nullable=True)
    is_main = Column(String, nullable=True)
    serialization_status = Column(String, nullable=True)
    reading_status = Column(String, nullable=False, default="Might Read")

    vol_total_original = Column(Float, nullable=True)
    vol_total_tw = Column(Float, nullable=True)
    vol_fin = Column(Float, nullable=False, default=0)
    arc_total = Column(Float, nullable=True)
    arc_fin = Column(Float, nullable=False, default=0)
    ch_total = Column(Float, nullable=True)
    ch_fin = Column(Float, nullable=False, default=0)
    # Chapters read into the arc *currently* being read, which is the arc at
    # position arc_fin + 1. Zero for every novel with no arc rows.
    ch_fin_in_arc = Column(Float, nullable=False, default=0)
    progress_display = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    anilist_rating = Column(String, nullable=True)

    release_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)

    is_main_entry = Column(Boolean, nullable=True)
    read_order = Column(Float, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    # An Open Library *work* URL and the OL...W id derived from it. String, not
    # Integer like comicvine_id: the trailing W is what separates a work from an
    # edition (OL...M) or an author (OL...A).
    openlibrary_link = Column(String, nullable=True)
    openlibrary_id = Column(String, nullable=True)

    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    units = relationship(
        "NovelUnit",
        back_populates="novel",
        cascade="all, delete-orphan",
        order_by="NovelUnit.position",
    )

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.novel_name_cn),
            ("EN", self.novel_name_en),
            ("Alt", self.novel_name_alt),
            ("roman", self.novel_name_roman),
            ("JP", self.novel_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")


class NovelUnit(Base):
    """
    One volume, arc, story or chapter belonging to exactly one Novel.

    Replaces the two parallel JSONB lists (novel_name_each_cn/_en) that could
    drift out of alignment, because they were matched by list position and
    nothing else. One row now holds both languages.

    The kind asymmetry matters (Decision B in the design doc): volume rows are
    optional enrichment and nothing derives from them — vol_total_original /
    vol_total_tw remain the denominators. Arc rows are authoritative, because
    ch_count lives nowhere else.
    """

    __tablename__ = "novel_unit"
    __table_args__ = (
        CheckConstraint(
            "unit_kind IN ('volume','arc','story','chapter')",
            name="ck_novel_unit_kind",
        ),
        # ch_count is the arc's chapter count; it means nothing on other kinds.
        CheckConstraint(
            "unit_kind = 'arc' OR ch_count IS NULL",
            name="ck_novel_unit_ch_count_arc_only",
        ),
        Index("ix_novel_unit_novel_kind_position", "novel_id", "unit_kind", "position"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    novel_id = Column(
        UUID(as_uuid=True),
        ForeignKey("novel.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_kind = Column(String, nullable=False)
    # Float, matching read_order and the half-volume convention on vol_fin.
    # Deliberately NOT unique: the editor reorders by swapping adjacent
    # values, and a unique constraint would fire mid-swap.
    position = Column(Float, nullable=False)
    unit_key = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    name_en = Column(String, nullable=True)
    remark = Column(String, nullable=True)
    ch_count = Column(Float, nullable=True)
    # One of constants.MY_RATINGS. Per-unit and independent: nothing derives
    # from it, and the novel's own my_rating stays hand-set.
    my_rating = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    novel = relationship("Novel", back_populates="units")
