"""add meme table and drop quote.kind

Revision ID: w6x7y8z9a0b1
Revises: v5w6x7y8z9a0
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'w6x7y8z9a0b1'
down_revision: Union[str, Sequence[str], None] = 'v5w6x7y8z9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Memes move out of quote.kind into their own table. A meme is not a variant
    of a quote: it is an ordered list of text lines plus at most one image,
    with none of a quote's speaker/translation/language/original_source. The
    two link per line - a meme content line may name the Quote it also is.

    quote.kind is dropped rather than migrated: no row is a meme, so there is
    nothing to move out.

    meme.entry_id has no foreign key on purpose, for the same reason
    quote.entry_id does not: it points at whichever of the seven media tables
    media_type names, and no single FK can span them.

    Column order is deliberate - format_model_for_sheet walks __table__.columns
    in declaration order, so it is also the Google Sheets column order.
    """
    op.create_table(
        "meme",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=True),
        sa.Column("entry_id", sa.UUID(), nullable=True),
        sa.Column("content", sa.dialects.postgresql.JSONB(), nullable=True),
        # A column rather than an entry in `content`: a meme has at most one
        # image, so the cap is guaranteed by the schema instead of by
        # validation, and the image needs no stored position.
        sa.Column("image_file", sa.String(), nullable=True),
        sa.Column("episode", sa.String(), nullable=True),
        sa.Column("link", sa.String(), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=True),
        sa.Column("sort_index", sa.Float(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(op.f("ix_meme_system_id"), "meme", ["system_id"], unique=False)
    op.create_index(op.f("ix_meme_media_type"), "meme", ["media_type"], unique=False)
    op.create_index(op.f("ix_meme_entry_id"), "meme", ["entry_id"], unique=False)

    op.drop_constraint("ck_quote_kind", "quote", type_="check")
    op.drop_column("quote", "kind")


def downgrade() -> None:
    """Downgrade schema.

    Restores quote.kind with every row set back to 'quote'. Memes created while
    the table existed are dropped with it - they have no representation in the
    old single-table shape, since kind carried no content lines or image.
    """
    op.add_column(
        "quote",
        sa.Column("kind", sa.String(), nullable=True, server_default="quote"),
    )
    op.execute("UPDATE quote SET kind = 'quote' WHERE kind IS NULL")
    op.create_check_constraint(
        "ck_quote_kind", "quote", "kind IN ('quote', 'meme')"
    )
    # Drop the server default: the model supplies the default on insert, and
    # the original column had none.
    op.alter_column("quote", "kind", server_default=None)

    op.drop_index(op.f("ix_meme_entry_id"), table_name="meme")
    op.drop_index(op.f("ix_meme_media_type"), table_name="meme")
    op.drop_index(op.f("ix_meme_system_id"), table_name="meme")
    op.drop_table("meme")
