"""converge an installed database and a fresh one

Revision ID: b1n2amealign
Revises: 4832c83905a3
Create Date: 2026-09-12

A database built by the old 145-revision chain and one built from the models
were structurally identical - same tables, same 73 foreign keys, same 610
columns - and disagreed about 31 NAMES. The migrations named constraints
explicitly (`fk_note_media_id`); the models name none, so create_all and the
new baseline take PostgreSQL defaults (`note_media_id_fkey`). Both were
"correct" and nothing had ever compared them, which is the same blind spot
that let the chain run 145 revisions without being able to build a database.

A name is not cosmetic to a migration. `op.drop_constraint("fk_note_media_id")`
works on an installed database and fails on a fresh one, so leaving both shapes
in the world means every future revision has to handle both. This converges
them on the models.

It also closes two more gaps found the same way:

  * five indexes the models declare and no installed database has
    (`ix_person_name_en` and four on `plan_next`);
  * eleven SERVER DEFAULTS that every installed database has and no fresh one
    did - `nextval(...)` on eight `public_id` columns and `gen_random_uuid()`
    on three `system_id` columns. The models now declare them too, so this is
    the revision that brings an already-created database and a newly-built one
    to the same place. Here the INSTALLED shape was the better one: without a
    default, only SQLAlchemy can fill those columns and a raw INSERT fails.

EVERY STATEMENT IS CONDITIONAL, because this revision runs on both shapes: on
a fresh database the baseline already produced the model names, so each rename
must no-op rather than error. That is also what makes it safe to re-run.
"""

from alembic import op

revision = "b1n2amealign"
down_revision = "4832c83905a3"
branch_labels = None
depends_on = None

# (kind, table, installed name, model name). Derived by matching STRUCTURE -
# the table, the column NAMES, and for a foreign key the referenced table and
# columns - never by matching names, which are the thing that differs. Column
# names rather than numbers: an installed table holds its columns in the order
# migrations added them, so pg_constraint.conkey carries different attnums for
# the same logical column and a number-based match pairs almost nothing.
RENAMES = (
    ("constraint", "game_copy", "fk_game_copy_user", "game_copy_user_id_fkey"),
    ("constraint", "media_content_label", "fk_media_content_label_media", "media_content_label_media_id_fkey"),
    ("constraint", "media_credit", "fk_media_credit_media", "media_credit_media_id_fkey"),
    ("constraint", "media_credit", "fk_media_credit_publisher_id", "media_credit_publisher_id_fkey"),
    ("constraint", "media_source", "fk_media_source_media", "media_source_media_id_fkey"),
    ("constraint", "media_tag", "fk_media_tag_media", "media_tag_media_id_fkey"),
    ("constraint", "meme", "fk_meme_author", "meme_author_id_fkey"),
    ("constraint", "meme", "fk_meme_collection_id", "meme_collection_id_fkey"),
    ("constraint", "meme", "fk_meme_franchise_id", "meme_franchise_id_fkey"),
    ("constraint", "meme", "fk_meme_media_id", "meme_media_id_fkey"),
    ("constraint", "meme", "fk_meme_series_id", "meme_series_id_fkey"),
    ("constraint", "note", "fk_note_author", "note_author_id_fkey"),
    ("constraint", "note", "fk_note_collection_id", "note_collection_id_fkey"),
    ("constraint", "note", "fk_note_franchise_id", "note_franchise_id_fkey"),
    ("constraint", "note", "fk_note_media_id", "note_media_id_fkey"),
    ("constraint", "note", "fk_note_series_id", "note_series_id_fkey"),
    ("constraint", "quote", "fk_quote_author", "quote_author_id_fkey"),
    ("constraint", "quote", "fk_quote_media", "quote_media_id_fkey"),
    ("constraint", "seasonal", "pk_seasonal", "seasonal_pkey"),
    ("constraint", "user_media_list", "fk_user_media_list_media", "user_media_list_media_id_fkey"),
    ("constraint", "user_media_list", "fk_user_media_list_user", "user_media_list_user_id_fkey"),
    ("constraint", "user_novel_unit_rating", "fk_user_novel_unit_rating_unit", "user_novel_unit_rating_unit_id_fkey"),
    ("constraint", "user_novel_unit_rating", "fk_user_novel_unit_rating_user", "user_novel_unit_rating_user_id_fkey"),
    ("constraint", "users", "fk_users_role_id", "users_role_id_fkey"),
    ("constraint", "watch_order_item", "fk_watch_order_item_media", "watch_order_item_media_id_fkey"),
    ("index", "game_copy", "ix_game_copy_user", "ix_game_copy_user_id"),
    ("index", "system_option", "ix_system_options_category", "ix_system_option_category"),
    ("index", "user_access_mode_denial", "ix_user_access_mode_denial_grant", "ix_user_access_mode_denial_user_access_mode_id"),
    ("index", "user_novel_unit_rating", "ix_user_novel_unit_rating_unit", "ix_user_novel_unit_rating_unit_id"),
    ("index", "user_novel_unit_rating", "ix_user_novel_unit_rating_user", "ix_user_novel_unit_rating_user_id"),
)

# Declared by the models, absent from every installed database.
MISSING_INDEXES = (
    ("ix_person_name_en", "person", "name_en"),
    ("ix_plan_next_franchise_id", "plan_next", "franchise_id"),
    ("ix_plan_next_media_id", "plan_next", "media_id"),
    ("ix_plan_next_series_id", "plan_next", "series_id"),
    ("ix_plan_next_user_id", "plan_next", "user_id"),
)

# (table, column, default expression). Idempotent on both shapes: an installed
# database is already like this, and SET DEFAULT to the same value is a no-op.
SERVER_DEFAULTS = (
    ("character", "public_id", "nextval('character_public_id_seq'::regclass)"),
    ("collection", "public_id", "nextval('collection_public_id_seq'::regclass)"),
    ("franchise", "public_id", "nextval('franchise_public_id_seq'::regclass)"),
    ("person", "public_id", "nextval('person_public_id_seq'::regclass)"),
    ("publisher", "public_id", "nextval('publisher_public_id_seq'::regclass)"),
    ("series", "public_id", "nextval('series_public_id_seq'::regclass)"),
    ("studio", "public_id", "nextval('studio_public_id_seq'::regclass)"),
    ("watch_order_list", "public_id",
     "nextval('watch_order_list_public_id_seq'::regclass)"),
    ("content_label", "system_id", "gen_random_uuid()"),
    ("media_content_label", "system_id", "gen_random_uuid()"),
    ("role", "system_id", "gen_random_uuid()"),
)

_CONSTRAINT = """
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{a}')
                       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{b}')
                    THEN ALTER TABLE {t} RENAME CONSTRAINT {a} TO {b};
                    END IF;
                END $$;
"""

_INDEX = """
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '{a}' AND relkind = 'i')
                       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '{b}' AND relkind = 'i')
                    THEN ALTER INDEX {a} RENAME TO {b};
                    END IF;
                END $$;
"""


def _rename(a: str, b: str) -> None:
    """Rename every pair from `a` to `b`, where a/b select which name wins."""
    for kind, table, old, new in RENAMES:
        source, target = (old, new) if a == "installed" else (new, old)
        template = _CONSTRAINT if kind == "constraint" else _INDEX
        op.execute(template.format(a=source, b=target, t=table))


# access_mode.key is NOT a rename, and treating it as one would have been a
# data-integrity bug. An installed database has a UNIQUE CONSTRAINT
# `access_mode_key_key` and a separate NON-unique index `ix_access_mode_key`;
# the models declare one index that is itself unique, under the second name.
# So dropping the "redundant" constraint on its own would leave a non-unique
# index behind and silently lose uniqueness on that column. The whole swap has
# to happen together, which a migration transaction gives for free.
_ACCESS_MODE_KEY = """
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_mode_key_key')
    THEN
        ALTER TABLE access_mode DROP CONSTRAINT access_mode_key_key;
        DROP INDEX IF EXISTS ix_access_mode_key;
        CREATE UNIQUE INDEX ix_access_mode_key ON access_mode (key);
    END IF;
END $$;
"""


def upgrade() -> None:
    _rename("installed", "model")
    op.execute(_ACCESS_MODE_KEY)
    for name, table, column in MISSING_INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})")
    for table, column, expression in SERVER_DEFAULTS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {expression}")


def downgrade() -> None:
    for table, column, _expression in SERVER_DEFAULTS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT")
    for name, _table, _column in MISSING_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
    _rename("model", "installed")
