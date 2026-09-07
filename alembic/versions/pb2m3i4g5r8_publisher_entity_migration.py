"""Convert publisher_tw / comic_publisher into publisher entities.

Revision ID: pb2m3i4g5r8
Revises: pb1s2c3o4p5e

Data only - the schema for this already exists. Every media_tag row in the two
retired vocabularies becomes a media_credit with role='publisher', pointing at
an entity created from the reviewed name map, and the two system_option
categories that backed them are deleted.

Depends on pid1a2b3c4d5 having run: backfill_publishers goes through the
live ORM models, which SELECT every column they declare, so public_id has
to be on the tables already.

The work lives in backfill_publishers rather than here, for the reason
backfill_credits gives: a service function can be tested with the normal
fixtures and re-run by hand when a restore brings old data back.
"""

from alembic import op

revision = "pb2m3i4g5r8"
down_revision = "pid1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy.orm import Session

    from app.services.domain.credits import backfill_publishers

    bind = op.get_bind()
    session = Session(bind=bind)
    report = backfill_publishers(session)
    print(
        f"backfill_publishers: {report['credits']} credits, "
        f"{report['entities']} entities, {report['scopes']} scopes, "
        f"{len(report['skipped'])} skipped"
    )
    if report["skipped"]:
        # Decision C says these cannot exist in the live data. If one does,
        # the operator must see it - the row is left in place, not dropped.
        for row in report["skipped"]:
            print(f"  SKIPPED {row}")


def downgrade() -> None:
    raise NotImplementedError(
        "One-way: the tag rows and their vocabulary are gone. Restore from "
        "the pre-migration dump named in docs/PROGRESS.md."
    )
