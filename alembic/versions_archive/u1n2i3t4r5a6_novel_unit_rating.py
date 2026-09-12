"""Give each novel unit its own rating.

Revision ID: u1n2i3t4r5a6

A volume or an arc is rated on its own now, on the same S..F scale as
novel.my_rating (constants.MY_RATINGS). Like the rating columns on `novel`,
`character` and `staff` this is a plain nullable String with no CHECK: the
vocabulary is enforced by the dropdown, and a Pull from a sheet must be able
to carry whatever is in the cell rather than fail the whole tab on one typo.

Nothing derives from it. The novel's own my_rating stays hand-set, so this
column only ever holds what someone typed against that unit.

Backup picks the new column up on its own - execute_backup builds the Novel
Unit tab's headers from NovelUnit.__table__.columns - but the Pull side needs
parse_novel_unit_from_sheet to name it, which it now does.

Revises: mg1e2r3g4e5
Create Date: 2026-09-05
"""

import sqlalchemy as sa
from alembic import op

revision = "u1n2i3t4r5a6"
down_revision = "mg1e2r3g4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("novel_unit", sa.Column("my_rating", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("novel_unit", "my_rating")
