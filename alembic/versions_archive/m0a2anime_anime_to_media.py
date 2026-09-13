"""backfill media from anime and point anime at it

Revision ID: m0a2anime
Revises: m0a1media
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m0a2anime"
down_revision: Union[str, Sequence[str], None] = "m0a1media"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# CN-first, matching compute_display_name and NameFallbackMixin. NULLIF collapses
# whitespace-only names to NULL so COALESCE skips them, exactly as the Python
# helper's .strip() check does.
DISPLAY_NAME = """
    COALESCE(
        NULLIF(TRIM(anime_name_cn), ''),
        NULLIF(TRIM(anime_name_en), ''),
        NULLIF(TRIM(anime_name_roman), ''),
        NULLIF(TRIM(anime_name_jp), ''),
        NULLIF(TRIM(anime_name_alt), ''),
        '(unnamed anime ' || public_id::text || ')'
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
        SELECT system_id, 'anime', public_id, {DISPLAY_NAME},
               cover_image_file, franchise_id, series_id,
               COALESCE(created_at, now()), COALESCE(updated_at, now())
        FROM anime
    """)

    op.add_column(
        "anime",
        sa.Column("media_type", sa.String(), nullable=False, server_default="anime"),
    )
    op.create_check_constraint(
        "ck_anime_media_type", "anime", "media_type = 'anime'"
    )
    # DEFERRABLE INITIALLY DEFERRED: the media row is written after the detail
    # row, because it copies public_id and a Sequence default does not mint
    # that until the INSERT runs. See app/models/media_sync.py.
    op.execute(
        "ALTER TABLE anime ADD CONSTRAINT fk_anime_media "
        "FOREIGN KEY (system_id, media_type) "
        "REFERENCES media (system_id, media_type) ON DELETE CASCADE "
        "DEFERRABLE INITIALLY DEFERRED"
    )

    # Deleting the child must not orphan the parent. The cascade only runs
    # downward, and code will reach for the table named `anime`.
    op.execute("""
        CREATE OR REPLACE FUNCTION delete_media_row() RETURNS trigger AS $$
        BEGIN
            DELETE FROM media WHERE system_id = OLD.system_id;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_anime_delete_media
        AFTER DELETE ON anime
        FOR EACH ROW EXECUTE FUNCTION delete_media_row()
    """)

    counts = sa.text(
        "SELECT (SELECT COUNT(*) FROM anime), "
        "(SELECT COUNT(*) FROM media WHERE media_type = 'anime')"
    )
    detail, parent = op.get_bind().execute(counts).one()
    if detail != parent:
        raise RuntimeError(f"anime backfill mismatch: {detail} rows, {parent} media")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_anime_delete_media ON anime")
    op.drop_constraint("fk_anime_media", "anime", type_="foreignkey")
    op.drop_constraint("ck_anime_media_type", "anime", type_="check")
    op.drop_column("anime", "media_type")
    op.execute("DELETE FROM media WHERE media_type = 'anime'")
    # The function is shared by all nine triggers; drop it only with the last.
