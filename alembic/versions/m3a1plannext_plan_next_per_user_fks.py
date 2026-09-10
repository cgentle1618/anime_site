"""plan_next: per-user, with disjoint owner foreign keys

Expand only. The four new columns are added and backfilled from the existing
(scope, target_id) pair; scope and target_id are made NULLABLE so the code may
stop writing them, and are dropped in m3a2plandrop once nothing does.

Entry-scope rows backfill straight into media_id because Step 0 gave every
media row the detail row's OWN system_id - target_id and media.system_id are
the same value, so this is a join, not a remap.

DANGLING ROWS ARE DELETED. plan_next deliberately kept a row whose target no
longer exists, surfacing it in the admin page as missing=True; a real foreign
key cannot. The count is logged so the deletion is not silent.

No app.models import: a data migration that queries live ORM models SELECTs
every column the model currently declares and breaks the moment a later
migration adds one (docs/PROGRESS.md, open item).

Revision ID: m3a1plannext
Revises: m2a2public
Create Date: 2026-09-10 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3a1plannext"
down_revision: Union[str, Sequence[str], None] = "m2a2public"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def _owner_id(conn) -> object:
    """The user every existing plan row belongs to: `admin`, else the first."""
    owner = conn.execute(
        sa.text("SELECT id FROM users WHERE username = 'admin'")
    ).scalar()
    if owner is None:
        owner = conn.execute(
            sa.text("SELECT id FROM users ORDER BY username LIMIT 1")
        ).scalar()
    return owner


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column(
        "plan_next",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "plan_next",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "plan_next",
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "plan_next",
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # --- Dangling rows first: a FK cannot hold what is not there. ---
    for label, sql in (
        (
            "entry",
            "DELETE FROM plan_next WHERE scope = 'entry' AND target_id NOT IN "
            "(SELECT system_id FROM media)",
        ),
        (
            "franchise",
            "DELETE FROM plan_next WHERE scope = 'franchise' AND target_id NOT IN "
            "(SELECT system_id FROM franchise)",
        ),
        (
            "series",
            "DELETE FROM plan_next WHERE scope = 'series' AND target_id NOT IN "
            "(SELECT system_id FROM series)",
        ),
        (
            "unknown scope",
            "DELETE FROM plan_next WHERE scope NOT IN "
            "('entry', 'franchise', 'series') OR scope IS NULL "
            "OR target_id IS NULL",
        ),
    ):
        removed = conn.execute(sa.text(sql)).rowcount
        if removed:
            logger.warning(
                "plan_next: dropped %d dangling %s row(s).", removed, label
            )

    # --- An entry row whose media_type does not match its media row's type
    # cannot satisfy the composite FK either. The pair was never enforced
    # before, so a mismatched row is possible; drop it rather than fail. ---
    removed = conn.execute(
        sa.text(
            "DELETE FROM plan_next WHERE scope = 'entry' AND NOT EXISTS ("
            "SELECT 1 FROM media m WHERE m.system_id = plan_next.target_id "
            "AND m.media_type = plan_next.media_type)"
        )
    ).rowcount
    if removed:
        logger.warning(
            "plan_next: dropped %d entry row(s) whose media_type did not match "
            "the media row.",
            removed,
        )

    # --- Backfill the owner columns from the FK-less pair. ---
    op.execute("UPDATE plan_next SET media_id = target_id WHERE scope = 'entry'")
    op.execute(
        "UPDATE plan_next SET franchise_id = target_id WHERE scope = 'franchise'"
    )
    op.execute("UPDATE plan_next SET series_id = target_id WHERE scope = 'series'")

    # --- Backfill the owner. ---
    row_count = conn.execute(sa.text("SELECT COUNT(*) FROM plan_next")).scalar()
    owner = _owner_id(conn)
    if owner is None and row_count:
        raise RuntimeError(
            "plan_next holds rows but the users table is empty; cannot decide "
            "whose plans these are."
        )
    if owner is not None:
        conn.execute(
            sa.text("UPDATE plan_next SET user_id = :owner WHERE user_id IS NULL"),
            {"owner": owner},
        )

    op.alter_column("plan_next", "user_id", nullable=False)

    # --- The old pair loosens; m3a2plandrop removes it. ---
    op.alter_column("plan_next", "scope", nullable=True)
    op.alter_column("plan_next", "target_id", nullable=True)

    # --- Constraints. ---
    op.execute(
        "ALTER TABLE plan_next ADD CONSTRAINT ck_plan_next_one_owner "
        "CHECK (num_nonnulls(media_id, franchise_id, series_id) = 1)"
    )
    op.create_foreign_key(
        "fk_plan_next_user",
        "plan_next",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Composite, against Step 0's uq_media_id_type: an entry plan filed under
    # media_type 'anime' can only point at a media row that IS an anime. A NULL
    # media_id makes the whole constraint inapplicable (MATCH SIMPLE), which is
    # what the franchise- and series-scope rows need.
    op.create_foreign_key(
        "fk_plan_next_media_type",
        "plan_next",
        "media",
        ["media_id", "media_type"],
        ["system_id", "media_type"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_plan_next_franchise",
        "plan_next",
        "franchise",
        ["franchise_id"],
        ["system_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_plan_next_series",
        "plan_next",
        "series",
        ["series_id"],
        ["system_id"],
        ondelete="CASCADE",
    )

    # --- Keys and indexes. ---
    op.drop_constraint("uq_plan_next_target", "plan_next", type_="unique")
    op.drop_index("ix_plan_next_kind_type_scope", table_name="plan_next")
    # NULLS NOT DISTINCT: two of the three owner columns are NULL on every row,
    # and PostgreSQL's default would treat those NULLs as distinct, so the same
    # franchise could be queued twice. Raw SQL because sa.UniqueConstraint
    # cannot express it through op.create_unique_constraint - the same reason
    # and the same shape as n1u2l3l4s5n6d.
    op.execute(
        "ALTER TABLE plan_next ADD CONSTRAINT uq_plan_next_target "
        "UNIQUE NULLS NOT DISTINCT "
        "(user_id, kind, media_type, media_id, franchise_id, series_id)"
    )
    op.create_index(
        "ix_plan_next_user_kind_type",
        "plan_next",
        ["user_id", "kind", "media_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_plan_next_user_kind_type", table_name="plan_next")
    op.execute("ALTER TABLE plan_next DROP CONSTRAINT uq_plan_next_target")
    op.create_index(
        "ix_plan_next_kind_type_scope",
        "plan_next",
        ["kind", "media_type", "scope"],
    )
    op.create_unique_constraint(
        "uq_plan_next_target",
        "plan_next",
        ["kind", "scope", "target_id", "media_type"],
    )
    op.drop_constraint("fk_plan_next_series", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_plan_next_franchise", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_plan_next_media_type", "plan_next", type_="foreignkey")
    op.drop_constraint("fk_plan_next_user", "plan_next", type_="foreignkey")
    op.execute("ALTER TABLE plan_next DROP CONSTRAINT ck_plan_next_one_owner")
    op.alter_column("plan_next", "scope", nullable=False)
    op.alter_column("plan_next", "target_id", nullable=False)
    op.drop_column("plan_next", "series_id")
    op.drop_column("plan_next", "franchise_id")
    op.drop_column("plan_next", "media_id")
    op.drop_column("plan_next", "user_id")
