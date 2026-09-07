"""add openlibrary link and id to novel

Revision ID: ol1b2k3s4
Revises: st1a2g3s4
"""

import sqlalchemy as sa

from alembic import op

revision = "ol1b2k3s4"
down_revision = "st1a2g3s4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("novel", sa.Column("openlibrary_link", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("openlibrary_id", sa.String(), nullable=True))


def downgrade():
    op.drop_column("novel", "openlibrary_id")
    op.drop_column("novel", "openlibrary_link")
