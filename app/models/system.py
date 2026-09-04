"""System-support ORM models (options, config, logs, users)."""

import uuid

from sqlalchemy import (
    Boolean,
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


class SystemConfigs(Base):
    """Stores persistent global application settings as key-value pairs."""

    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    config_key = Column(String, unique=True, nullable=False, index=True)
    config_value = Column(String, nullable=False)


class Seasonal(Base):
    """Aggregates metrics for specific airing seasons."""

    __tablename__ = "seasonal"

    seasonal = Column(String, primary_key=True, unique=True, index=True)
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
