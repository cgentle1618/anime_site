"""add plan_next kind and drop rewatch booleans

Revision ID: 9b0bcb763e8c
Revises: b872c435410b
Create Date: 2026-08-29 13:32:56.819311

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b0bcb763e8c'
down_revision: Union[str, Sequence[str], None] = 'b872c435410b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. kind, nullable first so existing rows survive the add.
    op.add_column("plan_next", sa.Column("kind", sa.String(), nullable=True))
    conn.execute(sa.text("UPDATE plan_next SET kind = 'next'"))
    op.alter_column("plan_next", "kind", nullable=False)

    # 2. Widen the key. Drop before create: the old constraint would reject
    #    the same target appearing under a second kind.
    op.drop_constraint("uq_plan_next_target", "plan_next", type_="unique")
    op.create_unique_constraint(
        "uq_plan_next_target", "plan_next", ["kind", "scope", "target_id", "media_type"]
    )
    op.drop_index("ix_plan_next_type_scope", table_name="plan_next")
    op.create_index(
        "ix_plan_next_kind_type_scope", "plan_next", ["kind", "media_type", "scope"]
    )

    # 3a. Entry-scope rewatch rows, one per flagged entry.
    #     cartoons is deliberately absent: cartoon moves to franchise-only and
    #     its entry marks are discarded (see the spec's migration section).
    entry_tables = [
        ("anime_movies", "to_rewatch", "anime-movie"),
        ("movies", "to_rewatch", "movie"),
        ("tv_shows", "to_rewatch", "tv-show"),
        ("manga", "to_reread", "manga"),
        ("novel", "to_reread", "novel"),
        ("comic", "to_reread", "comic"),
    ]
    for table, column, media_type in entry_tables:
        conn.execute(
            sa.text(
                f"""
                INSERT INTO plan_next
                    (system_id, kind, scope, media_type, target_id, created_at, updated_at)
                SELECT gen_random_uuid(), 'rewatch', 'entry', :mt, system_id, NOW(), NOW()
                FROM {table}
                WHERE {column} IS TRUE
                """
            ),
            {"mt": media_type},
        )

    # 3b. Group-scope rows, one per media type the group actually holds.
    #     Types come from the child entries, never from franchise_type: that
    #     column is multi-valued, bundles types (ACG implies anime and manga
    #     and novel), and carries an undocumented legacy "Anime" value.
    group_sources = [
        # (group column on the entry table, scope, legal media types)
        ("franchise_id", "franchise", ["anime", "movie", "tv-show", "cartoon", "novel"]),
        ("series_id", "series", ["movie", "tv-show", "novel", "comic"]),
    ]
    entry_type_tables = [
        ("anime", "anime"),
        ("anime_movies", "anime-movie"),
        ("movies", "movie"),
        ("tv_shows", "tv-show"),
        ("cartoons", "cartoon"),
        ("manga", "manga"),
        ("novel", "novel"),
        ("comic", "comic"),
    ]
    for fk_column, scope, legal in group_sources:
        group_table = "franchise" if scope == "franchise" else "series"
        for table, media_type in entry_type_tables:
            if media_type not in legal:
                continue
            conn.execute(
                sa.text(
                    f"""
                    INSERT INTO plan_next
                        (system_id, kind, scope, media_type, target_id, created_at, updated_at)
                    SELECT gen_random_uuid(), 'rewatch', :scope, :mt,
                           t.system_id, NOW(), NOW()
                    FROM (
                        SELECT DISTINCT g.system_id
                        FROM {group_table} g
                        JOIN {table} e ON e.{fk_column} = g.system_id
                        WHERE g.to_rewatch IS TRUE
                    ) t
                    """
                ),
                {"scope": scope, "mt": media_type},
            )

    # 4. The rows are the source of truth now.
    for table, column in [
        ("franchise", "to_rewatch"),
        ("series", "to_rewatch"),
        ("anime_movies", "to_rewatch"),
        ("movies", "to_rewatch"),
        ("tv_shows", "to_rewatch"),
        ("cartoons", "to_rewatch"),
        ("manga", "to_reread"),
        ("novel", "to_reread"),
        ("comic", "to_reread"),
    ]:
        op.drop_column(table, column)


def downgrade() -> None:
    conn = op.get_bind()

    for table, column in [
        ("franchise", "to_rewatch"),
        ("series", "to_rewatch"),
        ("anime_movies", "to_rewatch"),
        ("movies", "to_rewatch"),
        ("tv_shows", "to_rewatch"),
        ("cartoons", "to_rewatch"),
        ("manga", "to_reread"),
        ("novel", "to_reread"),
        ("comic", "to_reread"),
    ]:
        op.add_column(
            table,
            sa.Column(column, sa.Boolean(), nullable=True, server_default=sa.false()),
        )

    # Per-type detail collapses back to one boolean. Discarded cartoon entry
    # marks do not return.
    for table, column, media_type in [
        ("anime_movies", "to_rewatch", "anime-movie"),
        ("movies", "to_rewatch", "movie"),
        ("tv_shows", "to_rewatch", "tv-show"),
        ("manga", "to_reread", "manga"),
        ("novel", "to_reread", "novel"),
        ("comic", "to_reread", "comic"),
    ]:
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} SET {column} = TRUE
                WHERE system_id IN (
                    SELECT target_id FROM plan_next
                    WHERE kind = 'rewatch' AND scope = 'entry' AND media_type = :mt
                )
                """
            ),
            {"mt": media_type},
        )
    for group_table, scope in [("franchise", "franchise"), ("series", "series")]:
        conn.execute(
            sa.text(
                f"""
                UPDATE {group_table} SET to_rewatch = TRUE
                WHERE system_id IN (
                    SELECT target_id FROM plan_next
                    WHERE kind = 'rewatch' AND scope = :scope
                )
                """
            ),
            {"scope": scope},
        )

    conn.execute(sa.text("DELETE FROM plan_next WHERE kind = 'rewatch'"))
    op.drop_index("ix_plan_next_kind_type_scope", table_name="plan_next")
    op.create_index("ix_plan_next_type_scope", "plan_next", ["media_type", "scope"])
    op.drop_constraint("uq_plan_next_target", "plan_next", type_="unique")
    op.create_unique_constraint(
        "uq_plan_next_target", "plan_next", ["scope", "target_id", "media_type"]
    )
    op.drop_column("plan_next", "kind")
