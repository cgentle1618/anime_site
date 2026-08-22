"""collapse meme content from a list of lines to one text plus one image

Revision ID: z9a0b1c2d3e4
Revises: y8z9a0b1c2d3
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'z9a0b1c2d3e4'
down_revision: Union[str, Sequence[str], None] = 'y8z9a0b1c2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    A meme holds one text, one image, or one of each - never a list. The
    `content` JSONB list collapses into a plain `text` column, and the per-line
    `quote_id` becomes a single column.

    That turns both meme/quote rules into database constraints instead of
    router code, because the link is no longer buried in JSONB:

      * ON DELETE SET NULL - deleting a quote nulls the link rather than
        leaving a dangling id the reader has to flag.
      * UNIQUE - a quote belongs to at most one meme. Postgres allows many
        NULLs, so any number of memes may link no quote.
    """
    op.add_column("meme", sa.Column("text", sa.Text(), nullable=True))
    op.add_column("meme", sa.Column("quote_id", sa.UUID(), nullable=True))

    # Existing rows are single-line, but join defensively so a multi-line row
    # written before this runs keeps all of its text rather than losing lines.
    op.execute(
        """
        UPDATE meme
        SET text = sub.joined
        FROM (
            SELECT m.system_id,
                   string_agg(line->>'text', E'\\n' ORDER BY ord) AS joined
            FROM meme m,
                 LATERAL jsonb_array_elements(m.content) WITH ORDINALITY AS t(line, ord)
            WHERE jsonb_typeof(m.content) = 'array'
              AND line->>'text' IS NOT NULL
            GROUP BY m.system_id
        ) AS sub
        WHERE meme.system_id = sub.system_id
        """
    )
    op.execute(
        """
        UPDATE meme
        SET quote_id = sub.qid
        FROM (
            SELECT m.system_id,
                   (array_agg((line->>'quote_id')::uuid ORDER BY ord))[1] AS qid
            FROM meme m,
                 LATERAL jsonb_array_elements(m.content) WITH ORDINALITY AS t(line, ord)
            WHERE jsonb_typeof(m.content) = 'array'
              AND line->>'quote_id' IS NOT NULL
            GROUP BY m.system_id
        ) AS sub
        WHERE meme.system_id = sub.system_id
        """
    )

    op.drop_column("meme", "content")

    op.create_foreign_key(
        "fk_meme_quote_id",
        "meme",
        "quote",
        ["quote_id"],
        ["system_id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_meme_quote_id", "meme", ["quote_id"])
    op.create_index(op.f("ix_meme_quote_id"), "meme", ["quote_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema. The single text folds back into a one-line list."""
    op.drop_index(op.f("ix_meme_quote_id"), table_name="meme")
    op.drop_constraint("uq_meme_quote_id", "meme", type_="unique")
    op.drop_constraint("fk_meme_quote_id", "meme", type_="foreignkey")

    op.add_column(
        "meme", sa.Column("content", sa.dialects.postgresql.JSONB(), nullable=True)
    )
    op.execute(
        """
        UPDATE meme
        SET content = jsonb_build_array(
            jsonb_build_object(
                'text', text,
                'quote_id', CASE WHEN quote_id IS NULL THEN NULL
                                 ELSE to_jsonb(quote_id::text) END
            )
        )
        WHERE text IS NOT NULL OR quote_id IS NOT NULL
        """
    )

    op.drop_column("meme", "quote_id")
    op.drop_column("meme", "text")
