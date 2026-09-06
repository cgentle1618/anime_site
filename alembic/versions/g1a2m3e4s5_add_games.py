"""Add games, game_copy, system_option_alias, note.entries and the game vocabulary.

Revision ID: g1a2m3e4s5

Games are the ninth media type. `games` is an ordinary uniform entry table -
the registry and the router factory need nothing special from it - but three
things here are new.

`games` rows are PURCHASABLES, not works: a base game, a DLC, an expansion or
a bundle. A DLC is a row in this same table with a base_game_id, because it is
bought, played and finished separately from its base game while sharing nearly
every column with one. base_game_id stays nullable even for a DLC, since a DLC
is often entered before its base game exists, and it is SET NULL rather than
CASCADE: deleting a base game must not delete separately bought DLC rows.

`game_copy` is deliberately not a media_source row. "Where can I watch this"
and "which storefront do I own this on" look alike at one field, but a copy
carries six more - ownership, format, acquisition, price paid, currency,
date - and at that size it is a purchase record. Putting it on media_source
would mean six columns meaning nothing for the other eight media types.
Ownership is DERIVED from these rows and stored nowhere.

`system_option_alias` is the third sibling of system_option_scope ("in which
media types") and system_option_usage ("for what"): it answers "what does IGDB
call it". Vocabulary values are stored in Chinese; an external API's English is
a wire format resolved through here on the way in. Unlike its two siblings,
absence is NOT permissive - a value with no alias rows simply cannot be
resolved from an external string.

`note.entries` backs the new name_entries note shape (guides, builds and mods):
an ordered list of mixed text and link items. Separate from `note.links`, which
is a plain list of URL strings for seven other sections - one column meaning
two things is how subtle bugs start.

The seeded vocabulary lives in app/utils/game_vocabulary.py rather than inline
here, because the test suite builds its schema with create_all and never runs
Alembic, so a seed buried in a revision file could not be tested at all.

Revises: p1u2b3l4i5s6
Create Date: 2026-09-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Session

from app.utils.game_vocabulary import (
    GAME_REFERENCE_SOURCES,
    GAME_SHARED_REFERENCE_SOURCES,
    GAME_VOCABULARY,
    seed_game_vocabulary,
)

revision = "g1a2m3e4s5"
down_revision = "p1u2b3l4i5s6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "games",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("franchise_id", UUID(as_uuid=True), nullable=True),
        sa.Column("series_id", UUID(as_uuid=True), nullable=True),
        sa.Column("game_name_en", sa.String(), nullable=True),
        sa.Column("game_name_cn", sa.String(), nullable=True),
        sa.Column("game_name_roman", sa.String(), nullable=True),
        sa.Column("game_name_jp", sa.String(), nullable=True),
        sa.Column("game_name_alt", sa.String(), nullable=True),
        sa.Column("game_type", sa.String(), nullable=True),
        sa.Column("base_game_id", UUID(as_uuid=True), nullable=True),
        sa.Column("playing_status", sa.String(), nullable=False),
        sa.Column("completion_level", sa.String(), nullable=True),
        sa.Column("all_endings", sa.Boolean(), nullable=True),
        sa.Column("achievements_earned", sa.Integer(), nullable=True),
        sa.Column("achievements_total", sa.Integer(), nullable=True),
        sa.Column("release_status", sa.String(), nullable=True),
        sa.Column("release_date", sa.String(), nullable=True),
        sa.Column("current_patch", sa.String(), nullable=True),
        sa.Column("hours_played", sa.Float(), nullable=True),
        sa.Column("hltb_main", sa.Float(), nullable=True),
        sa.Column("hltb_main_extra", sa.Float(), nullable=True),
        sa.Column("hltb_completionist", sa.Float(), nullable=True),
        sa.Column("price_original_us", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_original_jp", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_original_tw", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_current_us", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_current_jp", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_current_tw", sa.Numeric(10, 2), nullable=True),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("cover_image_file", sa.String(), nullable=True),
        sa.Column("igdb_id", sa.Integer(), nullable=True),
        sa.Column("igdb_link", sa.String(), nullable=True),
        sa.Column("steam_appid", sa.Integer(), nullable=True),
        sa.Column("steam_link", sa.String(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["franchise_id"], ["franchise.system_id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["series_id"], ["series.system_id"], ondelete="SET NULL"
        ),
        # SET NULL, not CASCADE: deleting a base game must not silently delete
        # the DLC rows that were bought separately.
        sa.ForeignKeyConstraint(
            ["base_game_id"], ["games.system_id"], ondelete="SET NULL"
        ),
        sa.CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_games_release_date_iso",
        ),
        sa.CheckConstraint(
            "game_type <> 'Base Game' OR base_game_id IS NULL",
            name="ck_games_base_no_parent",
        ),
        sa.CheckConstraint(
            "base_game_id IS NULL OR base_game_id <> system_id",
            name="ck_games_not_self_parent",
        ),
    )
    op.create_index("ix_games_system_id", "games", ["system_id"])

    op.create_table(
        "game_copy",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("game_id", UUID(as_uuid=True), nullable=False),
        sa.Column("storefront", sa.String(), nullable=True),
        sa.Column("ownership", sa.String(), nullable=True),
        sa.Column("copy_format", sa.String(), nullable=True),
        sa.Column("acquisition", sa.String(), nullable=True),
        sa.Column("price_paid", sa.Numeric(10, 2), nullable=True),
        sa.Column("price_currency", sa.String(), nullable=True),
        sa.Column("acquired_date", sa.String(), nullable=True),
        sa.Column("remark", sa.String(), nullable=True),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["game_id"], ["games.system_id"], ondelete="CASCADE"
        ),
        # One game can be Digital-on-Steam and Physical-on-Switch without
        # colliding; buying the same edition on the same store twice cannot.
        sa.UniqueConstraint(
            "game_id", "storefront", "copy_format", name="uq_game_copy_row"
        ),
        sa.CheckConstraint(
            r"acquired_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_game_copy_acquired_date_iso",
        ),
    )
    op.create_index("ix_game_copy_system_id", "game_copy", ["system_id"])
    op.create_index("ix_game_copy_game", "game_copy", ["game_id"])

    op.create_table(
        "system_option_alias",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("option_id", UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["option_id"], ["system_option.system_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "option_id", "source", "value", name="uq_system_option_alias"
        ),
    )
    op.create_index(
        "ix_system_option_alias_option_id", "system_option_alias", ["option_id"]
    )
    op.create_index(
        "ix_system_option_alias_lookup",
        "system_option_alias",
        ["source", "value"],
    )

    op.add_column("note", sa.Column("entries", JSONB(), nullable=True))

    # The seed is idempotent and refuses to narrow an existing shared value
    # (Bahamut, Official, Wiki), so re-running it costs nothing.
    session = Session(bind=op.get_bind())
    seed_game_vocabulary(session)
    session.commit()


def downgrade() -> None:
    conn = op.get_bind()

    # Delete the seeded rows before the alias table goes: the alias and scope
    # rows go with them by ON DELETE CASCADE.
    conn.execute(
        sa.text("DELETE FROM system_option WHERE category = ANY(:categories)"),
        {"categories": list(GAME_VOCABULARY)},
    )
    # The shared Reference Source vocabulary keeps its pre-existing values;
    # only the ones this revision introduced are removed, and only where
    # nothing but `game` scopes them.
    conn.execute(
        sa.text(
            "DELETE FROM system_option o "
            "WHERE o.category = 'Reference Source' AND o.value = ANY(:values) "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM system_option_scope s "
            "  WHERE s.option_id = o.system_id AND s.scope <> 'game')"
        ),
        {"values": list(GAME_REFERENCE_SOURCES)},
    )
    # "Official site" predates this revision; only the `game` scope it gained
    # here goes.
    conn.execute(
        sa.text(
            "DELETE FROM system_option_scope s "
            "USING system_option o "
            "WHERE s.option_id = o.system_id AND s.scope = 'game' "
            "AND o.category = 'Reference Source' AND o.value = ANY(:values)"
        ),
        {"values": list(GAME_SHARED_REFERENCE_SOURCES)},
    )

    op.drop_column("note", "entries")

    op.drop_index("ix_system_option_alias_lookup", table_name="system_option_alias")
    op.drop_index("ix_system_option_alias_option_id", table_name="system_option_alias")
    op.drop_table("system_option_alias")

    op.drop_index("ix_game_copy_game", table_name="game_copy")
    op.drop_index("ix_game_copy_system_id", table_name="game_copy")
    op.drop_table("game_copy")

    op.drop_index("ix_games_system_id", table_name="games")
    op.drop_table("games")
