"""rename romanji to roman in anime and franchise

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-21 00:00:00.000000

"""
from alembic import op

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('anime', 'anime_name_romanji', new_column_name='anime_name_roman')
    op.alter_column('franchise', 'franchise_name_romanji', new_column_name='franchise_name_roman')


def downgrade():
    op.alter_column('anime', 'anime_name_roman', new_column_name='anime_name_romanji')
    op.alter_column('franchise', 'franchise_name_roman', new_column_name='franchise_name_romanji')
