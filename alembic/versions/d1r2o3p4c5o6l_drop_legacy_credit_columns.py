"""Drop the legacy comma-joined credit/tag string columns and system_option.id.

Revision ID: d1r2o3p4c5o6l

Task 9's migration (m1i2g3r4a5t6) copied every legacy column into media_credit
and media_tag. This migration is the one that makes that copy the only copy,
so before it drops a single column it proves the copy is lossless: for every
(media_type, column) in credits.BACKFILL_MAP, it rebuilds what the link tables
say and compares it, as a set of normalized names, against the legacy column's
raw values. A name the legacy column had that the link tables are missing
aborts the whole migration - nothing is dropped in that case. Extra names on
the link side are fine (a rerun or a manual addition can legitimately produce
them) and never abort anything.
"""

import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy.orm import Session

revision = "d1r2o3p4c5o6l"
down_revision = "m1i2g3r4a5t6"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    from app.services.domain.credits import verify_backfill_lossless

    session = Session(bind=op.get_bind())
    report = verify_backfill_lossless(session)
    logger.info(
        "Legacy column drop verification: %s rows checked, %s mismatches",
        report["checked"],
        len(report["mismatches"]),
    )
    if report["mismatches"]:
        for mismatch in report["mismatches"]:
            logger.error("Verification mismatch: %s", mismatch)
        raise RuntimeError(
            f"Aborting legacy column drop: {len(report['mismatches'])} "
            "entries have names in a legacy column that are missing from "
            "the link tables. See the logged mismatches above. No column "
            "was dropped."
        )

    op.drop_column("anime", "studio")
    op.drop_column("anime", "director")
    op.drop_column("anime", "producer")
    op.drop_column("anime", "music")
    op.drop_column("anime", "distributor_tw")
    op.drop_column("anime", "genre_main")
    op.drop_column("anime", "genre_sub")

    op.drop_column("anime_movies", "studio")
    op.drop_column("anime_movies", "director")

    op.drop_column("movies", "director")

    op.drop_column("tv_shows", "source_official")

    op.drop_column("cartoons", "source_official")

    op.drop_column("manga", "author_plot")
    op.drop_column("manga", "author_draw")
    op.drop_column("manga", "publisher_tw")

    op.drop_column("novel", "author")
    op.drop_column("novel", "illustrator")
    op.drop_column("novel", "publisher_tw")

    op.drop_column("comic", "writer")
    op.drop_column("comic", "artist")
    op.drop_column("comic", "publisher")
    op.drop_column("comic", "imprint")
    op.drop_column("comic", "continuity")
    op.drop_column("comic", "era")
    op.drop_column("comic", "events")
    op.drop_column("comic", "publisher_tw")

    # The legacy integer key so1p2t3i4o5n kept alive for Task 10's backfill.
    op.drop_column("system_option", "id")


def downgrade() -> None:
    """
    Re-add every dropped column, empty.

    VALUES ARE NOT RESTORED. The columns come back as nullable strings with no
    data - the only copy of what they used to hold lives in media_credit and
    media_tag, and this downgrade does not attempt to reconstruct comma-joined
    strings from those link rows.
    """
    op.add_column("system_option", sa.Column("id", sa.Integer(), nullable=True))

    op.add_column("comic", sa.Column("publisher_tw", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("events", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("era", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("continuity", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("imprint", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("publisher", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("artist", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("writer", sa.String(), nullable=True))

    op.add_column("novel", sa.Column("publisher_tw", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("illustrator", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("author", sa.String(), nullable=True))

    op.add_column("manga", sa.Column("publisher_tw", sa.String(), nullable=True))
    op.add_column("manga", sa.Column("author_draw", sa.String(), nullable=True))
    op.add_column("manga", sa.Column("author_plot", sa.String(), nullable=True))

    op.add_column("cartoons", sa.Column("source_official", sa.String(), nullable=True))

    op.add_column("tv_shows", sa.Column("source_official", sa.String(), nullable=True))

    op.add_column("movies", sa.Column("director", sa.String(), nullable=True))

    op.add_column("anime_movies", sa.Column("director", sa.String(), nullable=True))
    op.add_column("anime_movies", sa.Column("studio", sa.String(), nullable=True))

    op.add_column("anime", sa.Column("genre_sub", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("genre_main", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("distributor_tw", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("music", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("producer", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("director", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("studio", sa.String(), nullable=True))
