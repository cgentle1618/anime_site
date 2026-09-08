"""Backfill media_credit and media_tag from the legacy string columns.

Revision ID: m1i2g3r4a5t6
"""

import logging

from alembic import op
from sqlalchemy.orm import Session

revision = "m1i2g3r4a5t6"
down_revision = "c1r2e3d4i5t6"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    from app.services.domain.credits import backfill_credits

    session = Session(bind=op.get_bind())
    report = backfill_credits(session)
    logger.info("Credit backfill: %s", {k: v for k, v in report.items() if k != "unplaced"})
    for row in report["unplaced"]:
        logger.warning("Unplaced value: %s", row)


def downgrade() -> None:
    # The string columns still exist at this revision, so the link rows can
    # simply be discarded; Task 10's revision is what makes them the only copy.
    op.execute("DELETE FROM media_tag")
    op.execute("DELETE FROM media_credit")
