"""Staff entity ORM models: people, studios and publishers."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Sequence,
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

    All four names are nullable and at least one must be set, matching Studio:
    a person is known by whichever names they are known by, and requiring a
    specific one would force a made-up value. Which column a name lands in when
    a writer other than the admin form creates the row is decided by
    name_slot_for in app/utils/name_normalize.py.
    """

    __tablename__ = "person"
    __table_args__ = (
        # NULLS NOT DISTINCT: three of the four name columns are NULL on a
        # typical row, and Postgres treats two NULLs as distinct by default -
        # without this the constraint is INERT and duplicates commit cleanly.
        # Same lesson as uq_studio_name and uq_media_credit_row, and see
        # alembic/versions/n1u2l3l4s5n6d_* for the migration that collapsed the
        # duplicates the inert version already allowed.
        UniqueConstraint(
            "name_en",
            "name_cn",
            "name_jp",
            "name_alt",
            name="uq_person_name",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_person_has_a_name",
        ),
        UniqueConstraint(
            "public_id",
            name="uq_person_public_id",
            # Deferred so a Pull can permute public_id across rows inside
            # one transaction: the sheet can hand row A an id row B still
            # holds until the restore reaches B. Only the end state has to
            # be unique, and it is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    # Used by _find_by_name (app/services/domain/credits.py): a person matches
    # on any of their names, because the same human arrives as a Japanese name
    # from Tenrai, a Chinese one from the sheet and an English one typed into
    # the Add form. Matching on only one column would split their credits.
    # Ambiguity is not silently resolved - _find_by_name raises when two people
    # match, which is the safe answer when a person has no external id.
    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Short, stable, per-table id shown in SPA URLs; system_id remains the
    # join key and never leaves the API.
    public_id = Column(Integer, Sequence("person_public_id_seq"), nullable=False)
    name_en = Column(String, nullable=True, index=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    # One of constants.MY_RATINGS.
    my_rating = Column(String, nullable=True)
    # Storage key under static/covers/, same convention as the media tables'
    # cover_image_file.
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
        The name to show. Like Studio and unlike every media model, whose
        fallback chain is hard-coded per type, a person's choice is DATA:
        display_name_field names the winner. The chain below is only the
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


class PersonRole(Base):
    """
    Which dropdowns a person appears in.

    Explicit rather than derived from credits: a director added today must be
    offered in the anime director dropdown before their first credit exists.
    Every row carries a media-type scope, and a person's visibility is the
    union of their rows. There is deliberately no unscoped "offered
    everywhere" state - unlike system_option_scope, where zero rows means
    everywhere. Person credits ARE auto-scoped on write, and under an
    "everywhere" rule the first scope row would silently narrow the person,
    which is exactly the trap Ruling R27 removed from tags. With no
    "everywhere" state to collapse, auto-scoping is purely additive and the
    trap cannot occur. See the design spec's Decision B.
    """

    __tablename__ = "person_role"
    __table_args__ = (
        # No NULLS NOT DISTINCT here, unlike uq_person_name and
        # uq_media_credit_row: scope is NOT NULL, so there is no nullable
        # column left in the key for Postgres to treat as distinct from
        # itself. It WAS needed when scope was NULL for every role but
        # director.
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
    # A hyphenated media-type key, and one of legal_scopes(role).
    scope = Column(String, nullable=False)

    person = relationship("Person", back_populates="roles")


class Studio(Base, NameFallbackMixin):
    """
    One anime production studio.

    Publishers and distributors are NOT here - they live in their own
    Publisher table below. The split is deliberate: most publisher and
    distributor values are distributors that never developed anything, so
    listing them among studios would blur what /library/studio means. This
    reverses the earlier ruling recorded here, which kept publishers as a
    single "Publisher / Distributor TW" vocabulary in system_option; that
    vocabulary is gone - the migration moved its rows onto media_credit as
    `publisher` credits and deleted it.

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
        UniqueConstraint(
            "public_id",
            name="uq_studio_public_id",
            # Deferred so a Pull can permute public_id across rows inside
            # one transaction: the sheet can hand row A an id row B still
            # holds until the restore reaches B. Only the end state has to
            # be unique, and it is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Short, stable, per-table id shown in SPA URLs; system_id remains the
    # join key and never leaves the API.
    public_id = Column(Integer, Sequence("studio_public_id_seq"), nullable=False)
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


class Publisher(Base, NameFallbackMixin):
    """
    One publisher or distributor: a games publisher, a TW licensor, or a
    comic's original publisher. Every one of the six types that credits a
    publisher points here; no publisher vocabulary survives beside it.

    Shaped after Studio but not identical to it: a publisher carries
    media-type scope (see PublisherScope) and a studio does not, because a
    distributor list that offers 木棉花 on a game is wrong in a way a studio
    list is not. Deliberately a separate table rather than a `publisher` role
    pointing at Studio. The overlap is real - Bandai Namco
    and Kadokawa both develop and publish, and will exist as two unlinked
    rows - but the bulk of publisher/distributor values are distributors
    (木棉花, 曼迪) that never developed anything, and putting them on
    /library/studio would make that page mean something vaguer than it does.

    Reverses the ruling recorded in Studio's docstring, which said publishers
    need no profile and should stay a system_option vocabulary. Games are
    where that stopped holding: a publisher is a first-class fact about a
    game, not a distribution footnote.

    Carries no MAL columns: MAL has no record of a games publisher or a
    Taiwanese distributor, so there is nothing to autofill from.
    """

    __tablename__ = "publisher"
    __table_args__ = (
        # NULLS NOT DISTINCT: three of the four name columns are NULL on a
        # typical row, and Postgres treats two NULLs as distinct by default -
        # without this the constraint is INERT and duplicates commit cleanly.
        # Same lesson as uq_studio_name and uq_person_name.
        UniqueConstraint(
            "name_en",
            "name_cn",
            "name_jp",
            "name_alt",
            name="uq_publisher_name",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_publisher_has_a_name",
        ),
        CheckConstraint(
            r"founded_date IS NULL OR founded_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_publisher_founded_date",
        ),
        CheckConstraint(
            r"defunct_date IS NULL OR defunct_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_publisher_defunct_date",
        ),
        UniqueConstraint(
            "public_id",
            name="uq_publisher_public_id",
            # Deferred so a Pull can permute public_id across rows inside
            # one transaction: the sheet can hand row A an id row B still
            # holds until the restore reaches B. Only the end state has to
            # be unique, and it is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Short, stable, per-table id shown in SPA URLs; system_id remains the
    # join key and never leaves the API.
    public_id = Column(Integer, Sequence("publisher_public_id_seq"), nullable=False)
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
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    scopes = relationship(
        "PublisherScope",
        back_populates="publisher",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Which column each display_name_field value names.
    _DISPLAY_FIELDS = {
        "en": "name_en",
        "cn": "name_cn",
        "jp": "name_jp",
        "alt": "name_alt",
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
        The name to show. Like Studio, the choice is DATA: display_name_field
        names the winner, and the chain below is only the fallback for when
        that is NULL or names an empty column.
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


class PublisherScope(Base):
    """
    Which media types a publisher is offered on.

    Explicit rather than derived from credits, for the reason PersonRole's
    docstring gives: a distributor added today must appear in the anime picker
    before its first credit exists.

    Unlike person_role there is no `role` column. A publisher holds exactly one
    role, `publisher`, so a column whose value is that constant on every row
    would encode nothing. The key is (publisher_id, scope) alone.

    As with PersonRole there is deliberately NO unscoped "offered everywhere"
    state: zero rows means offered nowhere. That is the opposite of
    system_option_scope, and it is what makes auto-scoping on write purely
    additive - under an "everywhere" rule the first scope row would silently
    NARROW the publisher, the trap Ruling R27 removed from tags.
    """

    __tablename__ = "publisher_scope"
    __table_args__ = (
        # A plain unique constraint, not NULLS NOT DISTINCT: scope is NOT NULL,
        # so no nullable column is left in the key for Postgres to treat as
        # distinct from itself. uq_person_role needed the opposite treatment
        # only while its scope column was still nullable.
        UniqueConstraint("publisher_id", "scope", name="uq_publisher_scope"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    publisher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("publisher.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A hyphenated media-type key, and one of legal_scopes("publisher").
    scope = Column(String, nullable=False)

    publisher = relationship("Publisher", back_populates="scopes")
