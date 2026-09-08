"""Plan Next ORM model - what is queued to watch or read, at any of three tiers."""

import uuid

from sqlalchemy import Column, DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class PlanNext(Base):
    """
    One thing queued to watch/read next, or marked for rewatch/reread: an
    entry, a series, or a franchise. The table holds both Plan-page queues,
    distinguished by kind; the name predates the second one.

    The row's existence is the flag. There is no is_next column - un-planning
    deletes the row - so the table only ever holds what is actually queued.

    The target is a FK-less (scope, media_type, target_id) triple, the same
    contract media_relation and watch_order_item use: no single foreign key can
    span the eight media entry tables plus series and franchise. Read-time
    resolution goes through OWNER_TABLES in app/utils/media_resolver.py, which
    surfaces a deleted target as missing=True rather than dropping the row, so a
    dangling reference stays visible and fixable in the admin page. The franchise
    and series delete paths clear these rows, the same obligation media_relation
    already carries.

    media_type is stored even for scope='entry', where it could be derived from
    whichever table holds the id. It is the tab discriminator on the Plan page,
    and storing it keeps one uniform key across all three scopes.

    Replaces the watch_next / read_next booleans on the seven entry tables and
    franchise.watch_next_group. Those could not represent a series at all (series
    is one table shared by every media type, so it would have needed one boolean
    column per type), could not bucket a franchise per media type, and left anime
    entries with no way to be marked at all.
    """

    __tablename__ = "plan_next"
    __table_args__ = (
        # One row per marked thing per media type per kind. A franchise can be
        # both queued and marked for rewatch, so kind joins the key.
        UniqueConstraint(
            "kind", "scope", "target_id", "media_type", name="uq_plan_next_target"
        ),
        # The Plan page reads one tab of one section at a time.
        Index("ix_plan_next_kind_type_scope", "kind", "media_type", "scope"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # "next" or "rewatch" - one of KINDS in app/utils/plan_next_kinds.py.
    # The table holds both Plan-page queues; the name predates the second one.
    #
    # server_default is load-bearing, not decoration. A Pull of a Plan Next tab
    # backed up before this column existed carries no `kind` header, and pull.py
    # drops parsed keys the header did not have - so the ORM builds the row with
    # `kind` unset. SQLAlchemy emits an unset non-nullable column as an explicit
    # NULL unless the MODEL declares a default, which fails the NOT NULL check;
    # a bare ALTER TABLE ... SET DEFAULT on the database does not help, because
    # the NULL is sent explicitly. Declaring it here makes SQLAlchemy omit the
    # column and let the database fill it. Every such row predates rewatch, so
    # "next" is the correct value for it.
    kind = Column(String, nullable=False, server_default="next")
    # Hyphenated key from MEDIA_TABLES, e.g. "anime-movie". Not a DB enum: the
    # vocabulary is validated in the API layer, the same choice already made for
    # media_relation.relation_type, so adding a type needs no migration.
    media_type = Column(String, nullable=False)
    # One of SCOPES in app/utils/plan_next_kinds.py.
    scope = Column(String, nullable=False)
    target_id = Column(UUID(as_uuid=True), nullable=False)

    # Free text scoping the plan, e.g. "after the movie".
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
