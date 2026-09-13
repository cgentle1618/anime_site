"""backfill image attachments from the existing cover columns

Revision ID: c1image0002
Revises: c1image0001
Create Date: 2026-09-12

Every image that already exists arrived by DOWNLOAD, so `uploaded_by` is left
NULL for all of them - which is exactly what tells them apart from uploads
later, and what keeps bulk_download_missing_covers free to re-fetch them.

The source of a legacy cover is `media`, not the nine per-type tables:
`cover_image_file` lives on the `media` supertable and `media.media_type`
already names the owner_type each row's attachment needs, so one pass over
`media` backfills all nine media types. The other four owners - staff,
character, publisher, studio - are entity tables with their own image column:
`person.photo_file`, `character.photo_file`, `publisher.logo_file` and
`studio.logo_file`. Publisher and studio use `logo_file`, not
`cover_image_file` - read the column definition, the shape only looks uniform.

The checksum for a backfilled row is NOT the sha256 of its bytes: the files are
not re-read here (there may be thousands, and some are missing on this
machine). The existing column value is already unique per owner - it is
`<owner_type>/<system_id>.jpg`, per image_manager.cover_key - so it doubles as
the identity: `legacy:<owner_type>/<system_id>.jpg`. A later upload of the same
picture gets a real checksum and is a separate row, which is correct: they are
different files on disk.

The new `image.storage_key` is NOT the column value verbatim - it is
`covers/<owner_type>/<system_id>.jpg`. `image_library.file_exists()` resolves
`storage_key` against `static/` (the library root moved out of `static/covers/`
after this backfill was designed), and a legacy file actually lives at
`static/covers/<owner_type>/<system_id>.jpg`, so the `covers/` prefix is what
makes `file_exists` and the `missing` filter resolve it correctly. The mirror
column (`cover_image_file` and friends) keeps the value WITHOUT that prefix,
because `getCoverUrl` already prepends `/static/covers/` itself. So for a
legacy row, `image.storage_key` and the mirror column deliberately differ by
the `covers/` prefix - that is not an inconsistency, it is two different
consumers resolving against two different roots.
"""

import sqlalchemy as sa

from alembic import op

revision = "c1image0002"
down_revision = "c1image0001"
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return (
        conn.execute(
            sa.text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}
        ).scalar()
        is not None
    )


def _backfill(conn, table: str, image_col: str, owner_type_sql: str) -> None:
    """
    Backfill one source table.

    `owner_type_sql` is a raw SQL fragment naming the owner_type for each row -
    either a quoted literal (`'staff'`) or a column reference (`media_type`).
    It is never user input, so building it into the statement text is safe.
    """
    if not _table_exists(conn, table):
        return

    conn.execute(
        sa.text(
            f"""
            INSERT INTO image (system_id, storage_key, checksum, uploaded_by)
            SELECT gen_random_uuid(), 'covers/' || {image_col},
                   'legacy:' || {image_col}, NULL
            FROM {table}
            WHERE {image_col} IS NOT NULL
              AND {image_col} <> ''
              AND {image_col} <> 'N/A'
            ON CONFLICT (checksum) DO NOTHING
            """
        )
    )

    conn.execute(
        sa.text(
            f"""
            INSERT INTO image_attachment
                (system_id, image_id, owner_type, owner_id, role, position)
            SELECT gen_random_uuid(), i.system_id, {owner_type_sql},
                   t.system_id, 'cover', 0
            FROM {table} t
            JOIN image i ON i.checksum = 'legacy:' || t.{image_col}
            WHERE t.{image_col} IS NOT NULL
              AND t.{image_col} <> ''
              AND t.{image_col} <> 'N/A'
            ON CONFLICT ON CONSTRAINT uq_image_attachment_owner_role_position
            DO NOTHING
            """
        )
    )


def upgrade():
    conn = op.get_bind()

    # media_type is a per-row column, not a constant - this one pass covers
    # all nine media entry types at once.
    _backfill(conn, "media", "cover_image_file", "media_type")

    for owner_type, table, image_col in (
        ("staff", "person", "photo_file"),
        ("character", "character", "photo_file"),
        ("publisher", "publisher", "logo_file"),
        ("studio", "studio", "logo_file"),
    ):
        _backfill(conn, table, image_col, f"'{owner_type}'")


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM image_attachment"))
    conn.execute(sa.text("DELETE FROM image WHERE checksum LIKE 'legacy:%'"))
