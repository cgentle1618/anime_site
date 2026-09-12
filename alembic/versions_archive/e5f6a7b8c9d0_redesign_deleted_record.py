"""redesign deleted_record table columns

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-21 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('deleted_record', sa.Column('name_cn', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('name_en', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('franchise_cn', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('series_cn', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('category', sa.String(), nullable=True))
    op.drop_column('deleted_record', 'franchise')
    op.drop_column('deleted_record', 'series')
    op.drop_column('deleted_record', 'anime_cn')
    op.drop_column('deleted_record', 'anime_en')
    op.drop_column('deleted_record', 'airing_type')


def downgrade():
    op.add_column('deleted_record', sa.Column('franchise', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('series', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('anime_cn', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('anime_en', sa.String(), nullable=True))
    op.add_column('deleted_record', sa.Column('airing_type', sa.String(), nullable=True))
    op.drop_column('deleted_record', 'name_cn')
    op.drop_column('deleted_record', 'name_en')
    op.drop_column('deleted_record', 'franchise_cn')
    op.drop_column('deleted_record', 'series_cn')
    op.drop_column('deleted_record', 'category')
