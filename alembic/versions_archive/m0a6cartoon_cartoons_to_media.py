"""backfill media from cartoons and point cartoons at it

Revision ID: m0a6cartoon
Revises: m0a5tvshow
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m0a6cartoon"
down_revision: Union[str, Sequence[str], None] = "m0a5tvshow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# CN-first, matching compute_display_name and NameFallbackMixin. NULLIF collapses
# whitespace-only names to NULL so COALESCE skips them, exactly as the Python
# helper's .strip() check does. Columns re-confirmed against _name_fields in
# app/models/cartoon.py.
DISPLAY_NAME = """
    COALESCE(
        NULLIF(TRIM(cartoon_name_cn), ''),
        NULLIF(TRIM(cartoon_name_en), ''),
        NULLIF(TRIM(cartoon_name_alt), ''),
        '(unnamed cartoon ' || public_id::text || ')'
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
        SELECT system_id, 'cartoon', public_id, {DISPLAY_NAME},
               cover_image_file, franchise_id, series_id,
               COALESCE(created_at, now()), COALESCE(updated_at, now())
        FROM cartoons
    """)

    op.add_column(
        "cartoons",
        sa.Column("media_type", sa.String(), nullable=False, server_default="cartoon"),
    )
    op.create_check_constraint(
        "ck_cartoons_media_type", "cartoons", "media_type = 'cartoon'"
    )
    # DEFERRABLE INITIALLY DEFERRED: the media row is written after the detail
    # row, because it copies public_id and a Sequence default does not mint
    # that until the INSERT runs. See app/models/media_sync.py.
    op.execute(
        "ALTER TABLE cartoons ADD CONSTRAINT fk_cartoons_media "
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
        CREATE TRIGGER trg_cartoons_delete_media
        AFTER DELETE ON cartoons
        FOR EACH ROW EXECUTE FUNCTION delete_media_row()
    """)

    counts = sa.text(
        "SELECT (SELECT COUNT(*) FROM cartoons), "
        "(SELECT COUNT(*) FROM media WHERE media_type = 'cartoon')"
    )
    detail, parent = op.get_bind().execute(counts).one()
    if detail != parent:
        raise RuntimeError(
            f"cartoons backfill mismatch: {detail} rows, {parent} media"
        )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_cartoons_delete_media ON cartoons")
    op.drop_constraint("fk_cartoons_media", "cartoons", type_="foreignkey")
    op.drop_constraint("ck_cartoons_media_type", "cartoons", type_="check")
    op.drop_column("cartoons", "media_type")
    op.execute("DELETE FROM media WHERE media_type = 'cartoon'")
