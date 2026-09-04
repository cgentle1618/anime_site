"""Staff entity ORM models: people and studios."""

import uuid

from sqlalchemy import (
    CheckConstraint,
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
from app.models.base import NameFallbackMixin


class Person(Base, NameFallbackMixin):
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
        # NULLS NOT DISTINCT: name_en is nullable and almost always NULL, and
        # Postgres treats two NULLs as distinct by default - without this the
        # constraint is INERT and two Person rows with the same name_native
        # commit cleanly. See uq_media_credit_row for the same lesson, and
        # alembic/versions/n1u2l3l4s5n6d_* for the migration that collapsed
        # the duplicates the inert version already allowed.
        UniqueConstraint(
            "name_native",
            "name_en",
            name="uq_person_name",
            postgresql_nulls_not_distinct=True,
        ),
    )

    # Used by _find_by_name (app/services/domain/credits.py) so a person
    # matches on any of these three, the same fields the resolver checked
    # before it was made model-generic.
    _name_fields = ["name_native", "name_en", "name_cn"]

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
        # NULLS NOT DISTINCT: scope is NULL for every role except director, so
        # without this the constraint never fires for the common case and one
        # person can hold the same unscoped role many times over.
        UniqueConstraint(
            "person_id",
            "role",
            "scope",
            name="uq_person_role",
            postgresql_nulls_not_distinct=True,
        ),
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


class Studio(Base, NameFallbackMixin):
    """
    One anime production studio.

    Publishers and distributors are deliberately NOT here - they need no
    profile, so they stay a single "Publisher / Distributor TW" vocabulary in
    system_option.

    All four names are nullable and at least one must be set: a studio is
    known by whichever names it is known by, and requiring a specific one
    would force a made-up value. display_name_field picks the one to show;
    see the display_name property for the fallback when it is NULL.
    """

    __tablename__ = "studio"
    __table_args__ = (
        # NULLS NOT DISTINCT: three of the four name columns are NULL on a
        # typical row, and Postgres treats two NULLs as distinct by default -
        # without this the constraint is INERT and duplicates commit cleanly.
        # Same lesson as uq_person_name and uq_media_credit_row.
        UniqueConstraint(
            "name_en",
            "name_cn",
            "name_jp",
            "name_alt",
            name="uq_studio_name",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_studio_has_a_name",
        ),
        CheckConstraint(
            r"founded_date IS NULL OR founded_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_studio_founded_date",
        ),
        CheckConstraint(
            r"defunct_date IS NULL OR defunct_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_studio_defunct_date",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name_en = Column(String, nullable=True, index=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    my_rating = Column(String, nullable=True)
    logo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    # Truncated ISO-8601, the format owned by app/utils/release_date.py.
    founded_date = Column(String, nullable=True)
    defunct_date = Column(String, nullable=True)
    country = Column(String, nullable=True)
    website_url = Column(String, nullable=True)
    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Which column each display_name_field value names.
    _DISPLAY_FIELDS = {
        "en": "name_en", "cn": "name_cn", "jp": "name_jp", "alt": "name_alt",
    }

    @property
    def names_dict(self) -> dict:
        """Every name variation, for resolution and for the detail page."""
        return {
            "en": self.name_en,
            "cn": self.name_cn,
            "jp": self.name_jp,
            "alt": self.name_alt,
        }

    @property
    def display_name(self) -> str:
        """
        The name to show. Unlike every media model, whose fallback chain is
        hard-coded per type, a studio's choice is DATA: display_name_field
        names the winner. The chain below is only the fallback for when that
        is NULL or names an empty column.
        """
        chosen = self._DISPLAY_FIELDS.get(self.display_name_field or "")
        if chosen:
            value = getattr(self, chosen)
            if value and value.strip():
                return value.strip()
        sequence = [
            ("EN", self.name_en),
            ("CN", self.name_cn),
            ("JP", self.name_jp),
            ("Alt", self.name_alt),
        ]
        return self.get_fallback_name(sequence, "EN")
