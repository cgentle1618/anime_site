"""Collection ORM model — the optional umbrella tier above Franchise."""

import uuid
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Collection(Base, NameFallbackMixin):
    """
    Optional umbrella tier above Franchise. Groups several distinct franchises
    that share an IP or creator (e.g. "Marvel" over MCU / X-Men / Spider-Man,
    "Type-Moon" over Fate/stay night / Tsukihime / Kara no Kyoukai).

    Deliberately inert: no derivation, no duplicate detection, no stats.
    Media entries never reference a Collection directly - they reach it only
    through Franchise.collection_id.
    """

    __tablename__ = "collection"
    _name_fields = [
        "collection_name_en",
        "collection_name_cn",
        "collection_name_roman",
        "collection_name_jp",
        "collection_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    collection_name_en = Column(String, nullable=True)
    collection_name_cn = Column(String, nullable=True)
    collection_name_roman = Column(String, nullable=True)
    collection_name_jp = Column(String, nullable=True)
    collection_name_alt = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    collection_expectation = Column(String, default="Low")
    # Cover is chosen by pointing at one member Franchise; the actual image is
    # then resolved through that franchise's existing cover logic.
    # use_alter breaks the collection <-> franchise FK cycle so that
    # Base.metadata.create_all()/drop_all() can order the DDL.
    cover_franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "franchise.system_id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_collection_cover_franchise_id",
        ),
        nullable=True,
    )
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    # Two FKs join collection and franchise, so foreign_keys is required on both
    # sides for SQLAlchemy to pick the right one.
    franchises = relationship(
        "Franchise",
        back_populates="collection",
        foreign_keys="[Franchise.collection_id]",
    )
    cover_franchise = relationship("Franchise", foreign_keys=[cover_franchise_id])

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.collection_name_cn),
            ("EN", self.collection_name_en),
            ("Alt", self.collection_name_alt),
            ("roman", self.collection_name_roman),
            ("JP", self.collection_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
