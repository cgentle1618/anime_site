"""System-support ORM models (options, config, logs, users)."""

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now


class SystemOption(Base):
    """
    One value in an open vocabulary - Tier 2 of the options design.

    Only values no code branches on live here. Anything the business logic
    compares against (airing status, watching status, my rating) is a Python
    constant in app/utils/constants.py instead, served read-only by
    app/routers/constants.py, so it cannot be renamed out from under the logic.
    """

    __tablename__ = "system_option"
    __table_args__ = (
        UniqueConstraint("category", "value", name="uq_system_option_value"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    category = Column(String, nullable=False, index=True)
    value = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    scopes = relationship(
        "SystemOptionScope",
        back_populates="option",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    usages = relationship(
        "SystemOptionUsage",
        back_populates="option",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    aliases = relationship(
        "SystemOptionAlias",
        back_populates="option",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SystemOptionScope(Base):
    """
    Which media types a vocabulary value is offered in.

    Replaces the old habit of duplicating a category per consumer - "TV Show
    Official Source" plus "Cartoon Official Source" for one vocabulary. A value
    with no scope rows is offered everywhere.
    """

    __tablename__ = "system_option_scope"
    __table_args__ = (
        UniqueConstraint("option_id", "scope", name="uq_system_option_scope"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of MEDIA_TYPE_KEYS (hyphenated) from app/utils/media_resolver.py.
    scope = Column(String, nullable=False)

    option = relationship("SystemOption", back_populates="scopes")


class SystemOptionUsage(Base):
    """
    Which roles a vocabulary value may be used in.

    Parallel to SystemOptionScope, which answers "in which media types". This
    answers "for what". The Platform category serves both the access rows on a
    media entry and the origin tag fields, and some values belong to only one:
    Fox and ABC are places a show first aired, never places to go and watch it.

    A value with no usage rows serves every usage.
    """

    __tablename__ = "system_option_usage"
    __table_args__ = (
        UniqueConstraint("option_id", "usage", name="uq_system_option_usage"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # One of app.utils.source_fields.OPTION_USAGES.
    usage = Column(String, nullable=False)

    option = relationship("SystemOption", back_populates="usages")


class SystemOptionAlias(Base):
    """
    What an external source calls this vocabulary value.

    The third sibling of SystemOptionScope ("in which media types") and
    SystemOptionUsage ("for what"): this answers "what does IGDB call it".
    Values are stored in Chinese; an external API's English is a wire format,
    resolved through here on the way in.

    Unlike its two siblings, absence is NOT permissive. A value with no scope
    rows is offered everywhere; a value with no alias rows simply cannot be
    resolved from an external string, which is why this is read by an explicit
    lookup rather than by _filter_by_child.
    """

    __tablename__ = "system_option_alias"
    __table_args__ = (
        UniqueConstraint(
            "option_id", "source", "value", name="uq_system_option_alias"
        ),
        Index("ix_system_option_alias_lookup", "source", "value"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "igdb" now; "steam" when the Steam sync lands.
    source = Column(String, nullable=False)
    value = Column(String, nullable=False)

    option = relationship("SystemOption", back_populates="aliases")


class SystemConfigs(Base):
    """Stores persistent global application settings as key-value pairs."""

    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    config_key = Column(String, unique=True, nullable=False, index=True)
    config_value = Column(String, nullable=False)


class Seasonal(Base):
    """
    One user's view of one airing season: their rating and their four counts.

    The counters are aggregates over THAT USER's list rows (see
    app/services/domain/seasonal.py) and my_rating is their own; both were
    global before Step 3 only because the database held one person. The
    primary key is therefore the pair, and a deleted user takes their seasons
    with them.
    """

    __tablename__ = "seasonal"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_seasonal_user"),
        primary_key=True,
    )
    # No longer unique on its own: two users hold "WIN 2026" independently.
    seasonal = Column(String, primary_key=True, index=True)
    my_rating = Column(String, nullable=True)
    entry_planned = Column(Integer, nullable=False, default=0)
    entry_completed = Column(Integer, nullable=False, default=0)
    entry_watching = Column(Integer, nullable=False, default=0)
    entry_dropped = Column(Integer, nullable=False, default=0)


class Role(Base):
    """
    A named bundle of permissions - Tier 1 of the authorization design.

    The permissions themselves are Python constants (app/services/rbac), for
    the same reason SystemOption gives above: a permission names a column, a
    media type or a field group, so a stored name with no code behind it would
    be inert. Only the grants that bind a permission to a role are data.

    `is_superuser` is not a shortcut. Without it the admin role would need an
    explicit grant for every content label and field group, and creating one
    would hide content from the admin until someone remembered to re-grant it.
    """

    __tablename__ = "role"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    name = Column(String, nullable=False, unique=True, index=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # guest and admin: the app reads them by name, so they cannot be renamed
    # or deleted through the API.
    is_system = Column(Boolean, nullable=False, default=False, server_default="false")
    is_superuser = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    permissions = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class RolePermission(Base):
    """
    One permission granted to one role.

    `permission` is a plain string validated against the computed catalog on
    write, the same contract media_tag.field has against TAG_FIELD_KEYS. A
    grant naming nothing is rejected rather than silently stored.
    """

    __tablename__ = "role_permission"
    __table_args__ = (
        UniqueConstraint("role_id", "permission", name="uq_role_permission"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    role_id = Column(
        UUID(as_uuid=True),
        ForeignKey("role.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission = Column(String, nullable=False)
    created_at = Column(DateTime, default=get_taipei_now)

    role = relationship("Role", back_populates="permissions")


class User(Base):
    """Administrative user accounts for access control."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    username = Column(String, nullable=False, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    # `role` is not a column any more. It is mapped back on as a read-only
    # column_property over role.name at the bottom of app/models/__init__.py,
    # because auth.py returns it on login and mints it as a JWT claim.
    role_id = Column(
        UUID(as_uuid=True),
        ForeignKey("role.system_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Private by default, and only its owner can change it (PATCH
    # /api/account/settings). An admin may see the flag on the Users page but
    # does not set it: whose list is visible is the account holder's decision,
    # not the inviter's.
    list_is_public = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Whose rows a restore or the Calculate pipeline files under. NOT a
    # permission and not on any request path - see
    # services/domain/user_list.py::installation_owner_id for what it answers
    # and what it deliberately does not. It lives here, as data, so that
    # moving the collection to another account is a row edit rather than a
    # commit, and so that the answer travels between the two machines on the
    # Sheets Users tab. `ix_one_installation_owner` is partial, so at most one
    # account holds it and any number hold false.
    is_installation_owner = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    __table_args__ = (
        Index(
            "ix_one_installation_owner",
            # The indexed expression is a constant, not the column: this is a
            # SITE singleton rather than one-per-something, so there is no
            # column to key it on. A partial unique index over `(true)` is how
            # PostgreSQL says "at most one row in the whole table".
            text("(true)"),
            unique=True,
            postgresql_where=text("is_installation_owner"),
        ),
    )

    role_ref = relationship("Role", lazy="joined")


class DataControlLog(Base):
    """Audit log tracking the outcome of sync and maintenance pipelines."""

    __tablename__ = "data_control_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action_main = Column(String, nullable=False)
    action_specific = Column(String, nullable=False)
    type = Column(String, nullable=False)
    status = Column(String, nullable=False)
    rows_added = Column(Integer, default=0)
    rows_updated = Column(Integer, default=0)
    rows_deleted = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=get_taipei_now)


class DeletedRecord(Base):
    """Tombstone log capturing metadata of entries removed from the database."""

    __tablename__ = "deleted_record"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String, nullable=False)
    franchise_type = Column(String, nullable=True)
    franchise_cn = Column(String, nullable=True)
    series_cn = Column(String, nullable=True)
    category = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    name_en = Column(String, nullable=True)

    timestamp = Column(DateTime, default=get_taipei_now)
