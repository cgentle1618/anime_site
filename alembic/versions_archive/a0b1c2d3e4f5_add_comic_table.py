"""add comic table

Revision ID: a0b1c2d3e4f5
Revises: l1o2c3a4t5o6
Create Date: 2026-08-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, Sequence[str], None] = 'l1o2c3a4t5o6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'comic',
        sa.Column('system_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('franchise_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('series_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('comic_name_en', sa.String(), nullable=True),
        sa.Column('comic_name_cn', sa.String(), nullable=True),
        sa.Column('comic_name_alt', sa.String(), nullable=True),
        sa.Column('volume_label', sa.String(), nullable=True),
        sa.Column('comic_type', sa.String(), nullable=True),
        sa.Column('publisher', sa.String(), nullable=True),
        sa.Column('imprint', sa.String(), nullable=True),
        sa.Column('continuity', sa.String(), nullable=True),
        sa.Column('era', sa.String(), nullable=True),
        sa.Column('events', sa.String(), nullable=True),
        sa.Column('is_main_entry', sa.Boolean(), nullable=True),
        sa.Column('writer', sa.String(), nullable=True),
        sa.Column('artist', sa.String(), nullable=True),
        sa.Column('release_year', sa.Integer(), nullable=True),
        sa.Column('end_year', sa.Integer(), nullable=True),
        sa.Column('publisher_tw', sa.String(), nullable=True),
        sa.Column('issue_total', sa.Integer(), nullable=True),
        sa.Column('issue_fin', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('serialization_status', sa.String(), nullable=True),
        sa.Column('reading_status', sa.String(), nullable=False,
                  server_default='Might Read'),
        sa.Column('read_order', sa.Float(), nullable=True),
        sa.Column('my_rating', sa.String(), nullable=True),
        sa.Column('source_other', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('read_next', sa.Boolean(), nullable=True),
        sa.Column('to_reread', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('cover_image_file', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['franchise_id'], ['franchise.system_id'],
                                ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['series_id'], ['series.system_id'],
                                ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('system_id'),
    )
    op.create_index(op.f('ix_comic_system_id'), 'comic', ['system_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_comic_system_id'), table_name='comic')
    op.drop_table('comic')
