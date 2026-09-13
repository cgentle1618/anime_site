"""Plan Next ORM model - what is queued to watch or read, at any of three tiers."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class PlanNext(Base):
    """
    One thing one USER has queued to watch/read next, or marked for rewatch:
    an entry, a series, or a franchise. The table holds both Plan-page queues,
    distinguished by kind; the name predates the second one.

    The row's existence is the flag. There is no is_next column - un-planning
    deletes the row - so the table only ever holds what is actually queued.

    THE OWNER IS THREE MUTUALLY EXCLUSIVE FOREIGN KEYS, exactly one of which is
    set (ck_plan_next_one_owner). It used to be a FK-less (scope, target_id)
    pair resolved through OWNER_TABLES, which meant nothing cascaded: the
    franchise and series delete paths, and every entry delete, each had to call
    delete_plans_for by hand or leave the row behind forever. Every owner now
    cascades in the database, and delete_plans_for is gone.

    `scope` and `target_id` survive as READ-ONLY properties derived from
    whichever column is set. They are the API's wire format, the key
    drop_hidden_rows reads, and what the Plan page's JSON carries; deriving
    them keeps that contract while storing the fact once.

    media_type is stored on every row, INCLUDING the franchise- and
    series-scope ones, and is NOT the owner kind. It is the tab discriminator
    on the Plan page: one franchise can be queued once under 'anime' and again
    under 'tv-show'. For an entry-scope row fk_plan_next_media_type pins it
    against media(system_id, media_type), so an entry filed under 'anime'
    cannot point at a manga; for the two tier scopes media_id is NULL and the
    composite FK is inapplicable, which is the intended MATCH SIMPLE
    behaviour.
    """

    __tablename__ = "plan_next"
    __table_args__ = (
        # Exactly one owner. num_nonnulls is a PostgreSQL builtin.
        CheckConstraint(
            "num_nonnulls(media_id, franchise_id, series_id) = 1",
            name="ck_plan_next_one_owner",
        ),
        # Pins an entry plan's media_type against the media row's own type,
        # using Step 0's uq_media_id_type.
        ForeignKeyConstraint(
            ["media_id", "media_type"],
            ["media.system_id", "media.media_type"],
            ondelete="CASCADE",
            name="fk_plan_next_media_type",
        ),
        # One row per marked thing per media type per kind PER USER. A
        # franchise can be both queued and marked for rewatch, so kind joins
        # the key. NULLS NOT DISTINCT because two of the three owner columns
        # are NULL on every row and the default would make every row unique.
        UniqueConstraint(
            "user_id",
            "kind",
            "media_type",
            "media_id",
            "franchise_id",
            "series_id",
            name="uq_plan_next_target",
            postgresql_nulls_not_distinct=True,
        ),
        # The Plan page reads one tab of one section of one user at a time.
        Index("ix_plan_next_user_kind_type", "user_id", "kind", "media_type"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_plan_next_user"),
        nullable=False,
        index=True,
    )

    # "next" or "rewatch" - one of KINDS in app/utils/plan_next_kinds.py.
    #
    # server_default is load-bearing, not decoration. A Pull of a Plan Next tab
    # backed up before this column existed carries no `kind` header, and pull.py
    # drops parsed keys the header did not have - so the ORM builds the row with
    # `kind` unset. SQLAlchemy emits an unset non-nullable column as an explicit
    # NULL unless the MODEL declares a default, which fails the NOT NULL check.
    kind = Column(String, nullable=False, server_default="next")
    # Hyphenated key from MEDIA_TABLES, e.g. "anime-movie". Not a DB enum: the
    # vocabulary is validated in the API layer, the same choice already made for
    # media_relation.relation_type, so adding a type needs no migration.
    media_type = Column(String, nullable=False)

    # --- The disjoint owner set. Exactly one is non-null. ---
    # media_id declares no column-level ForeignKey: its FK is the composite
    # fk_plan_next_media_type above, and declaring both would put two
    # constraints on one column.
    media_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "franchise.system_id",
            ondelete="CASCADE",
            name="fk_plan_next_franchise",
        ),
        nullable=True,
        index=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "series.system_id", ondelete="CASCADE", name="fk_plan_next_series"
        ),
        nullable=True,
        index=True,
    )

    # Free text scoping the plan, e.g. "after the movie".
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def scope(self) -> str:
        """The owner kind, derived. Read-only: set the owner column instead."""
        # Imported here, not at module scope: plan_next_kinds reads
        # media_resolver, which reads app.models, so a top-level import would
        # close a cycle while app.models is still being built.
        from app.utils.plan_next_kinds import scope_for_columns

        return scope_for_columns(self.media_id, self.franchise_id, self.series_id)

    @property
    def target_id(self):
        """The owner's id, derived. Read-only: set the owner column instead."""
        if self.media_id is not None:
            return self.media_id
        if self.franchise_id is not None:
            return self.franchise_id
        return self.series_id
