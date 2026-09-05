"""Retire the option categories nothing reads any more.

Revision ID: o1r2p3h4a5n6

WHAT WAS WRONG
--------------
The Options page lists whatever distinct categories exist in `system_option`,
not the twelve in OPTION_CATEGORIES, so every superseded vocabulary was still
on screen and still offered as a place to add values:

  * "Distributor TW", "Manga Publisher TW", "Novel Publisher TW" were merged
    into "Publisher / Distributor TW", whose values already carry the right
    scope rows (anime / manga / novel).
  * "TV Official Source" and "Cartoon Official Source" were merged into
    "Official Source" (tv-show / cartoon).
  * "Director", "Studio", "Manga Author", "Novel Author", "Novel Illustrator",
    "Comic Writer", "Music / Composer" and "Producer" predate Tier 3 — those
    names live in `person` and `studio` now, with a rating and a photo.

None of the thirteen is named by a TagField, so no dropdown reads them and no
media_tag row points at one. They are duplicates that only cost the admin a
choice between two spellings of the same list.

THE THREE VALUES THAT WERE NOT DUPLICATES
-----------------------------------------
Comparing each retired category against its successor turned up three values
that existed nowhere else, so they are moved before the delete:

  * "bilibili" — the merged category has only "bilibili (GoodShow)", which is
    the co-distribution label, not the same distributor.
  * "FX" — distinct from the "Fox" already in Official Source; the retired
    "FOX" is only a case variant of it and needs no rescue.
  * "Gonzo", "Project No.9", "SANZIGEN" — studio names with no `studio` row
    (not even a case variant), so they become studio entities rather than
    being dropped with the category.

WHY THE DELETE IS GUARDED
-------------------------
Both FKs into system_option are ON DELETE CASCADE, so deleting a referenced
value would take an entry's media_tag rows with it. This database has none,
but another might, so the delete skips any option a tag still points at
instead of destroying entry data. Whatever it skips stays visible on the
Options page, which is the correct outcome: a value in use is not an orphan.

Revises: l1a2b3e4l5o6
Create Date: 2026-09-04
"""

from alembic import op

revision = "o1r2p3h4a5n6"
down_revision = "l1a2b3e4l5o6"
branch_labels = None
depends_on = None

RETIRED_CATEGORIES: tuple[str, ...] = (
    "Distributor TW",
    "Manga Publisher TW",
    "Novel Publisher TW",
    "TV Official Source",
    "Cartoon Official Source",
    "Director",
    "Studio",
    "Manga Author",
    "Novel Author",
    "Novel Illustrator",
    "Comic Writer",
    "Music / Composer",
    "Producer",
)

# (destination category, value, scope) for values a retired category held
# alone. sort_order is 0 throughout both destination categories today, so
# these join at 0 and the admin orders them on the Options page.
PRESERVED_VALUES: tuple[tuple[str, str, str], ...] = (
    ("Publisher / Distributor TW", "bilibili", "anime"),
    # "Official Source" was the category name when this migration was
    # written; st1a2g3s4_source_tag_fields later renamed the whole category
    # to "Platform". Written here as "Platform" directly so a fresh install
    # replaying this chain ends in the same place as a live database that
    # already ran both migrations, and so this migration's own
    # test_preserved_values_land_in_live_categories check stays true against
    # the current vocabulary instead of a since-renamed one.
    ("Platform", "FX", "tv-show"),
)

# Studio names that existed only as an option value.
PRESERVED_STUDIOS: tuple[str, ...] = ("Gonzo", "Project No.9", "SANZIGEN")


def _sql_str(value: str) -> str:
    return value.replace("'", "''")


def upgrade() -> None:
    for category, value, scope in PRESERVED_VALUES:
        cat, val = _sql_str(category), _sql_str(value)
        # uq_system_option_value forbids a duplicate (category, value), so the
        # guard is what lets this run on a database where the admin already
        # added the value by hand.
        op.execute(
            f"""
            INSERT INTO system_option
                (system_id, category, value, sort_order, created_at, updated_at)
            SELECT gen_random_uuid(), '{cat}', '{val}', 0, NOW(), NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM system_option
                WHERE category = '{cat}' AND value = '{val}'
            )
            """
        )
        op.execute(
            f"""
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, '{scope}'
            FROM system_option o
            WHERE o.category = '{cat}' AND o.value = '{val}'
              AND NOT EXISTS (
                  SELECT 1 FROM system_option_scope s
                  WHERE s.option_id = o.system_id AND s.scope = '{scope}'
              )
            """
        )

    for name in PRESERVED_STUDIOS:
        studio = _sql_str(name)
        op.execute(
            f"""
            INSERT INTO studio (system_id, name_native, created_at, updated_at)
            SELECT gen_random_uuid(), '{studio}', NOW(), NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM studio WHERE name_native = '{studio}'
            )
            """
        )

    categories = ", ".join(f"'{_sql_str(c)}'" for c in RETIRED_CATEGORIES)
    op.execute(
        f"""
        DELETE FROM system_option o
        WHERE o.category IN ({categories})
          AND NOT EXISTS (
              SELECT 1 FROM media_tag t WHERE t.option_id = o.system_id
          )
        """
    )


def downgrade() -> None:
    # Not reversible, and deliberately not faked. The retired rows were
    # duplicates of vocabulary that still exists, so re-creating them would
    # restore the confusion, not the data — and their original system_id
    # values are gone, so nothing could point at them again anyway. The three
    # rescued values stay where they were moved to: they are live vocabulary
    # now, and dropping them would lose the only copy.
    pass
