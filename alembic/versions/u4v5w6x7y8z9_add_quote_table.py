"""add quote table and migrate notes.quotes_memes into it

Revision ID: u4v5w6x7y8z9
Revises: t3u4v5w6x7y8
Create Date: 2026-08-22 00:00:00.000000

"""
import json
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'u4v5w6x7y8z9'
down_revision: Union[str, Sequence[str], None] = 't3u4v5w6x7y8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# media_type value -> table name. Cartoon carries no quotes_memes section
# today, but is scanned anyway: the JSONB filter makes it a no-op, and an
# older config may have written rows there.
SOURCE_TABLES: list[tuple[str, str]] = [
    ("anime", "anime"),
    ("anime-movie", "anime_movies"),
    ("movie", "movies"),
    ("tv-show", "tv_shows"),
    ("cartoon", "cartoons"),
    ("manga", "manga"),
    ("novel", "novel"),
]


def upgrade() -> None:
    """Upgrade schema.

    quote.entry_id has no foreign key on purpose: it points at whichever of the
    seven media tables media_type names, and no single FK can span them.

    Column order is deliberate - format_model_for_sheet walks __table__.columns
    in declaration order, so it is also the Google Sheets column order.
    """
    op.create_table(
        "quote",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=True),
        sa.Column("entry_id", sa.UUID(), nullable=True),
        sa.Column("kind", sa.String(), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("translation", sa.Text(), nullable=True),
        sa.Column("language", sa.String(), nullable=True),
        sa.Column("speaker", sa.String(), nullable=True),
        sa.Column("original_source", sa.String(), nullable=True),
        sa.Column("episode", sa.String(), nullable=True),
        sa.Column("link", sa.String(), nullable=True),
        sa.Column("image_file", sa.String(), nullable=True),
        sa.Column("tags", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("is_general", sa.Boolean(), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=True),
        sa.Column("sort_index", sa.Float(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("kind IN ('quote', 'meme')", name="ck_quote_kind"),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(op.f("ix_quote_system_id"), "quote", ["system_id"], unique=False)
    op.create_index(op.f("ix_quote_media_type"), "quote", ["media_type"], unique=False)
    op.create_index(op.f("ix_quote_entry_id"), "quote", ["entry_id"], unique=False)

    _migrate_notes_into_quote()


def _migrate_notes_into_quote() -> None:
    """
    Move every notes.quotes_memes item into a quote row, then strip the key.

    The old shape carried only {description, link}, so kind falls back to
    "quote" and needs_review is set on every imported row - there was no
    episode or quote/meme distinction to import.

    The `link` field was in practice used for whoever said the line ("main
    character's mother", "ep 1 Professor Moriarty") far more often than for a
    URL, so a value that is not a URL is imported as `speaker` instead. That is
    what the data actually means; downgrade recombines the two back into one.
    """
    conn = op.get_bind()
    now = sa.func.now()

    for media_type, table in SOURCE_TABLES:
        rows = conn.execute(
            sa.text(
                f"SELECT system_id, notes FROM {table} WHERE notes ? 'quotes_memes'"
            )
        ).fetchall()

        for entry_id, notes in rows:
            # JSONB comes back already decoded by psycopg; tolerate either.
            if isinstance(notes, str):
                notes = json.loads(notes)
            items = (notes or {}).get("quotes_memes") or []
            if not isinstance(items, list):
                continue

            for index, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                description = (item.get("description") or "").strip()
                second = (item.get("link") or "").strip()
                if not description and not second:
                    continue
                is_url = second.lower().startswith(("http://", "https://"))
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO quote (
                            system_id, media_type, entry_id, kind, text,
                            speaker, link,
                            is_general, is_favorite, needs_review, sort_index,
                            created_at, updated_at
                        ) VALUES (
                            :system_id, :media_type, :entry_id, 'quote', :text,
                            :speaker, :link,
                            false, false, true, :sort_index,
                            now(), now()
                        )
                        """
                    ),
                    {
                        "system_id": str(uuid.uuid4()),
                        "media_type": media_type,
                        "entry_id": str(entry_id),
                        "text": description or None,
                        "speaker": None if is_url else (second or None),
                        "link": second if is_url else None,
                        "sort_index": float(index + 1),
                    },
                )

        # Strip the key only after its items are safely inserted.
        conn.execute(
            sa.text(
                f"UPDATE {table} SET notes = notes - 'quotes_memes' "
                f"WHERE notes ? 'quotes_memes'"
            )
        )


def downgrade() -> None:
    """Downgrade schema. Quotes are folded back into notes before the drop."""
    conn = op.get_bind()

    for media_type, table in SOURCE_TABLES:
        rows = conn.execute(
            sa.text(
                """
                SELECT entry_id, text, COALESCE(link, speaker)
                FROM quote
                WHERE media_type = :media_type AND entry_id IS NOT NULL
                ORDER BY entry_id, sort_index NULLS LAST, created_at
                """
            ),
            {"media_type": media_type},
        ).fetchall()

        grouped: dict = {}
        # speaker and link shared one field in the old shape; put back whichever
        # of the two this row carries.
        for entry_id, text, second in rows:
            grouped.setdefault(entry_id, []).append(
                {"description": text or "", "link": second or ""}
            )

        for entry_id, items in grouped.items():
            conn.execute(
                sa.text(
                    f"UPDATE {table} "
                    f"SET notes = COALESCE(notes, '{{}}'::jsonb) "
                    f"    || jsonb_build_object('quotes_memes', CAST(:items AS jsonb)) "
                    f"WHERE system_id = :entry_id"
                ),
                {"items": json.dumps(items, ensure_ascii=False), "entry_id": str(entry_id)},
            )

    op.drop_index(op.f("ix_quote_entry_id"), table_name="quote")
    op.drop_index(op.f("ix_quote_media_type"), table_name="quote")
    op.drop_index(op.f("ix_quote_system_id"), table_name="quote")
    op.drop_table("quote")
