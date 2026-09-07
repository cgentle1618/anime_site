"""Character entity ORM models: characters and their per-entry castings."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Character(Base, NameFallbackMixin):
    """
    One fictional character, shared across every entry they appear in.

    Shaped like Person deliberately, with ONE deviation: there is no unique
    constraint over the names. uq_person_name works because a human's full
    name is nearly unique; character names are not - "Yuki" and "Ichika" recur
    across unrelated works - and a character has no owning franchise to scope
    a constraint to, so any uniqueness rule here would refuse legitimate rows.
    Duplicates are found by the name-match search the cast editor runs and
    fixed by the merge endpoint. Do not "restore" a constraint to match the
    siblings; test_two_unrelated_characters_may_share_a_name will stop you.
    See the design spec's Decision G.
    """

    __tablename__ = "character"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_has_a_name",
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
    gender = Column(String, nullable=True)
    # One of constants.MY_RATINGS.
    my_rating = Column(String, nullable=True)
    # GCS object key. The canonical portrait; a casting may override it with
    # its own photo_file for how the character looks in that entry.
    photo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    castings = relationship(
        "CharacterCasting",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

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
        The name to show. Like Person and Studio, the choice is DATA:
        display_name_field names the winner, and the chain below is only the
        fallback for when that is NULL or names an empty column.
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


class CharacterCasting(Base):
    """
    One character, in one entry, optionally voiced by one person.

    THE cast record - there is no second one. No media_credit row with
    role="seiyuu" exists anywhere, because a seiyuu reaches an anime through
    the character they voice; deriving the entry's seiyuu list from these rows
    is what keeps "who is in this anime" to a single answer. See Decision A.

    The entry endpoint is a FK-less (media_type, entry_id) pair, the same
    contract media_credit and media_relation use.

    person_id is ON DELETE SET NULL, NOT CASCADE like media_credit.person_id.
    A credit IS the person's link to the work and dies with them; a casting is
    the CHARACTER's link to the work and merely names a seiyuu, so deleting a
    seiyuu must not delete the character from the anime. See Decision H.
    """

    __tablename__ = "character_casting"
    __table_args__ = (
        # One casting per character per entry - the whole point of recording
        # casting per appearance rather than per character. No NULLS NOT
        # DISTINCT needed here, unlike uq_person_name: all three columns are
        # NOT NULL, so Postgres has no NULL to treat as distinct from itself.
        UniqueConstraint(
            "character_id", "media_type", "entry_id", name="uq_character_casting"
        ),
        # Characters reach the four ACG types; seiyuu reach only two of them.
        # Enforced here rather than by convention because the Fill pipeline and
        # any future migration write these rows without going through the API.
        CheckConstraint(
            "person_id IS NULL OR media_type IN ('anime', 'anime-movie')",
            name="ck_casting_voice_scope",
        ),
        Index("ix_character_casting_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("character.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of "anime", "anime-movie", "manga", "novel" (hyphenated keys).
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("person.system_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # One of constants.CHARACTER_ROLES.
    role = Column(String, nullable=True)
    position = Column(Integer, nullable=False, default=0, server_default="0")
    # GCS key: this character AS SHE APPEARS in this entry. NULL falls back to
    # character.photo_file at read time.
    photo_file = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)

    character = relationship("Character", back_populates="castings")
