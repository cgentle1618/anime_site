"""backfill media from tv_shows and point tv_shows at it

Revision ID: m0a5tvshow
Revises: m0a4movie
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m0a5tvshow"
down_revision: Union[str, Sequence[str], None] = "m0a4movie"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# CN-first, matching compute_display_name and NameFallbackMixin. NULLIF collapses
# whitespace-only names to NULL so COALESCE skips them, exactly as the Python
# helper's .strip() check does. Columns re-confirmed against _name_fields in
# app/models/tv_show.py.
DISPLAY_NAME = """
    COALESCE(
        NULLIF(TRIM(tv_name_cn), ''),
        NULLIF(TRIM(tv_name_en), ''),
        NULLIF(TRIM(tv_name_alt), ''),
        '(unnamed tv-show ' || public_id::text || ')'
    )
"""


def upgrade() -> None:
    """
    Raw SQL by design. docs/PROGRESS.md records that data migrations importing
    live ORM models break whenever a later migration adds a column, because the
    model SELECTs every column it currently declares.
    """
    op.execute(f"""
        INSERT INTO media (system_id, media_type, public_id, display_name,
                           cover_image_file, franchise_id, series_id,
                           created_at, updated_at)
        SELECT system_id, 'tv-show', public_id, {DISPLAY_NAME},
               cover_image_file, franchise_id, series_id,
               COALESCE(created_at, now()), COALESCE(updated_at, now())
        FROM tv_shows
    """)

    op.add_column(
        "tv_shows",
        sa.Column("media_type", sa.String(), nullable=False, server_default="tv-show"),
    )
    op.create_check_constraint(
        "ck_tv_shows_media_type", "tv_shows", "media_type = 'tv-show'"
    )
    # DEFERRABLE INITIALLY DEFERRED: the media row is written after the detail
    # row, because it copies public_id and a Sequence default does not mint
    # that until the INSERT runs. See app/models/media_sync.py.
    op.execute(
        "ALTER TABLE tv_shows ADD CONSTRAINT fk_tv_shows_media "
        "FOREIGN KEY (system_id, media_type) "
        "REFERENCES media (system_id, media_type) ON DELETE CASCADE "
        "DEFERRABLE INITIALLY DEFERRED"
    )

    # delete_media_row() is shared by all nine triggers and was created by
    # m0a2anime; CREATE OR REPLACE keeps this revision standalone.
    op.execute("""
        CREATE OR REPLACE FUNCTION delete_media_row() RETURNS trigger AS $$
        BEGIN
            DELETE FROM media WHERE system_id = OLD.system_id;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_tv_shows_delete_media
        AFTER DELETE ON tv_shows
        FOR EACH ROW EXECUTE FUNCTION delete_media_row()
    """)

    counts = sa.text(
        "SELECT (SELECT COUNT(*) FROM tv_shows), "
        "(SELECT COUNT(*) FROM media WHERE media_type = 'tv-show')"
    )
    detail, parent = op.get_bind().execute(counts).one()
    if detail != parent:
        raise RuntimeError(
            f"tv_shows backfill mismatch: {detail} rows, {parent} media"
        )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_tv_shows_delete_media ON tv_shows")
    op.drop_constraint("fk_tv_shows_media", "tv_shows", type_="foreignkey")
    op.drop_constraint("ck_tv_shows_media_type", "tv_shows", type_="check")
    op.drop_column("tv_shows", "media_type")
    op.execute("DELETE FROM media WHERE media_type = 'tv-show'")
