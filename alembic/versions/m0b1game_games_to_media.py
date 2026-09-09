"""backfill media from games and point games at it

Revision ID: m0b1game
Revises: m0a9comic
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m0b1game"
down_revision: Union[str, Sequence[str], None] = "m0a9comic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# CN-first, matching compute_display_name and NameFallbackMixin. NULLIF collapses
# whitespace-only names to NULL so COALESCE skips them, exactly as the Python
# helper's .strip() check does. Columns re-confirmed against _name_fields in
# app/models/game.py.
DISPLAY_NAME = """
    COALESCE(
        NULLIF(TRIM(game_name_cn), ''),
        NULLIF(TRIM(game_name_en), ''),
        NULLIF(TRIM(game_name_roman), ''),
        NULLIF(TRIM(game_name_jp), ''),
        NULLIF(TRIM(game_name_alt), ''),
        '(unnamed game ' || public_id::text || ')'
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
        SELECT system_id, 'game', public_id, {DISPLAY_NAME},
               cover_image_file, franchise_id, series_id,
               COALESCE(created_at, now()), COALESCE(updated_at, now())
        FROM games
    """)

    op.add_column(
        "games",
        sa.Column("media_type", sa.String(), nullable=False, server_default="game"),
    )
    op.create_check_constraint(
        "ck_games_media_type", "games", "media_type = 'game'"
    )
    # DEFERRABLE INITIALLY DEFERRED: the media row is written after the detail
    # row, because it copies public_id and a Sequence default does not mint
    # that until the INSERT runs. See app/models/media_sync.py.
    op.execute(
        "ALTER TABLE games ADD CONSTRAINT fk_games_media "
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
        CREATE TRIGGER trg_games_delete_media
        AFTER DELETE ON games
        FOR EACH ROW EXECUTE FUNCTION delete_media_row()
    """)

    counts = sa.text(
        "SELECT (SELECT COUNT(*) FROM games), "
        "(SELECT COUNT(*) FROM media WHERE media_type = 'game')"
    )
    detail, parent = op.get_bind().execute(counts).one()
    if detail != parent:
        raise RuntimeError(
            f"games backfill mismatch: {detail} rows, {parent} media"
        )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_games_delete_media ON games")
    op.drop_constraint("fk_games_media", "games", type_="foreignkey")
    op.drop_constraint("ck_games_media_type", "games", type_="check")
    op.drop_column("games", "media_type")
    op.execute("DELETE FROM media WHERE media_type = 'game'")
