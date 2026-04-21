"""add franchise_type to deleted_record

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-21 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('deleted_record', sa.Column('franchise_type', sa.String(), nullable=True))


def downgrade():
    op.drop_column('deleted_record', 'franchise_type')
