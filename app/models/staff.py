"""Staff entity ORM models: people and studios."""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now


class Person(Base):
    """
    One human credited on a media entry.

    gender is on the base rather than on a seiyuu extension table: only seiyuu
    have it filled today, but gender is a fact about the person, not about the
    role, and putting it on an extension would encode a data-entry habit into
    the schema. No role extension table exists yet - one is added when a role
    earns several columns that are genuinely meaningless elsewhere.
    """

    __tablename__ = "person"
    __table_args__ = (
        UniqueConstraint("name_native", "name_en", name="uq_person_name"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name_native = Column(String, nullable=False, index=True)
    name_en = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    # One of constants.MY_RATINGS.
    my_rating = Column(String, nullable=True)
    # GCS object key, same convention as the media tables' cover_image_file.
    photo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    roles = relationship(
        "PersonRole",
        back_populates="person",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PersonRole(Base):
    """
    Which dropdowns a person appears in.

    Explicit rather than derived from credits: a director added today must be
    offered in the anime director dropdown before their first credit exists.
    Only "director" is scoped (anime / non_anime); every other role means the
    same thing everywhere and stores scope = NULL.
    """

    __tablename__ = "person_role"
    __table_args__ = (
        UniqueConstraint("person_id", "role", "scope", name="uq_person_role"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("person.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of credit_roles.PERSON_ROLES.
    role = Column(String, nullable=False, index=True)
    # "anime" | "non_anime" for director; NULL for every other role.
    scope = Column(String, nullable=True)

    person = relationship("Person", back_populates="roles")


class Studio(Base):
    """
    One anime production studio.

    Publishers and distributors are deliberately NOT here - they need no
    profile, so they stay a single "Publisher / Distributor TW" vocabulary in
    system_option, which is what fixes the old three-way split across
    "Distributor TW", "Manga Publisher TW" and "Novel Publisher TW".
    """

    __tablename__ = "studio"
    __table_args__ = (
        UniqueConstraint("name_native", "name_en", name="uq_studio_name"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name_native = Column(String, nullable=False, index=True)
    name_en = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    my_rating = Column(String, nullable=True)
    logo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
