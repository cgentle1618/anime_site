"""rename Official Source vocabulary to Platform

Revision ID: st1a2g3s4
Revises: ms1o2u3r4c5e
"""

from alembic import op

revision = "st1a2g3s4"
down_revision = "ms1o2u3r4c5e"
branch_labels = None
depends_on = None

# The nine broadcast networks plus "Other" (cartoon's catch-all origin value).
# See .superpowers/sdd/2026-09-04-media-sources/task-9-decisions.md - these
# four (Comedy Central, FX, HBO -> HBO Max, NBC) are real live values the plan
# never mentioned.
_ORIGIN_ONLY_VALUES = (
    "ABC",
    "Adult Swim",
    "Cartoon Network",
    "Comedy Central",
    "Fox",
    "FX",
    "NBC",
    "Nickelodeon",
    "Other",
    "The CW",
)


def upgrade():
    # Disney was always Disney+, and HBO was always HBO Max; normalise IN
    # PLACE (not delete+recreate) so the 241 media_tag rows keep pointing at
    # the same system_option row.
    op.execute(
        "UPDATE system_option SET value = 'Disney+' "
        "WHERE category = 'Official Source' AND value = 'Disney'"
    )
    op.execute(
        "UPDATE system_option SET value = 'HBO Max' "
        "WHERE category = 'Official Source' AND value = 'HBO'"
    )
    # Drop any Official Source row whose value already exists under Platform -
    # (category, value) is unique, so the rename would collide. Its media_tag
    # rows are repointed at the surviving Platform row first. A no-op today
    # (Platform has no rows yet, ahead of Task 10), kept to protect a re-run.
    op.execute(
        """
        UPDATE media_tag mt
           SET option_id = keep.system_id
          FROM system_option dup
          JOIN system_option keep
            ON keep.category = 'Platform' AND keep.value = dup.value
         WHERE dup.category = 'Official Source'
           AND mt.option_id = dup.system_id
        """
    )
    op.execute(
        """
        DELETE FROM system_option dup
         USING system_option keep
         WHERE dup.category = 'Official Source'
           AND keep.category = 'Platform'
           AND keep.value = dup.value
        """
    )
    op.execute(
        "UPDATE system_option SET category = 'Platform' "
        "WHERE category = 'Official Source'"
    )
    # THE SCOPE BUG: Netflix and Disney+ are scoped to tv-show/cartoon only
    # because that is the only place "Official Source" values ever lived. The
    # spec offers them on every media type (no scope rows = everywhere), and
    # Task 10's seed migration only ever ADDS scope rows, so these two must be
    # cleared here or they can never appear outside tv-show and cartoon.
    op.execute(
        """
        DELETE FROM system_option_scope
         USING system_option o
         WHERE system_option_scope.option_id = o.system_id
           AND o.category = 'Platform'
           AND o.value IN ('Netflix', 'Disney+')
        """
    )
    # Broadcast networks (plus cartoon's "Other") are origin-only - places a
    # show first aired, never places to go watch it now.
    op.execute(
        f"""
        INSERT INTO system_option_usage (option_id, usage)
        SELECT o.system_id, 'origin'
          FROM system_option o
         WHERE o.category = 'Platform'
           AND o.value IN ({",".join(f"'{v}'" for v in _ORIGIN_ONLY_VALUES)})
        ON CONFLICT (option_id, usage) DO NOTHING
        """
    )
    # The parenthetical never goes in `value` - (category, value) is the
    # unique key and 241 media_tag rows point at that string.
    op.execute(
        "UPDATE system_option SET remark = 'now part of HBO Max' "
        "WHERE category = 'Platform' AND value = 'Cartoon Network'"
    )
    # The field key on the tag rows themselves.
    op.execute(
        "UPDATE media_tag SET field = 'original_source' "
        "WHERE field = 'source_official'"
    )


def downgrade():
    op.execute(
        "UPDATE media_tag SET field = 'source_official' "
        "WHERE field = 'original_source'"
    )
    op.execute(
        "UPDATE system_option SET remark = NULL "
        "WHERE category = 'Platform' AND value = 'Cartoon Network' "
        "AND remark = 'now part of HBO Max'"
    )
    op.execute(
        f"""
        DELETE FROM system_option_usage
         USING system_option o
         WHERE system_option_usage.option_id = o.system_id
           AND o.category = 'Platform'
           AND o.value IN ({",".join(f"'{v}'" for v in _ORIGIN_ONLY_VALUES)})
           AND system_option_usage.usage = 'origin'
        """
    )
    # Best-effort restore of the scopes cleared in upgrade(); cannot recover
    # any admin-added scope beyond tv-show/cartoon.
    op.execute(
        """
        INSERT INTO system_option_scope (option_id, scope)
        SELECT o.system_id, s.scope
          FROM system_option o
         CROSS JOIN (VALUES ('tv-show'), ('cartoon')) AS s(scope)
         WHERE o.category = 'Platform'
           AND o.value IN ('Netflix', 'Disney+')
        ON CONFLICT (option_id, scope) DO NOTHING
        """
    )
    op.execute(
        "UPDATE system_option SET category = 'Official Source' "
        "WHERE category = 'Platform'"
    )
    op.execute(
        "UPDATE system_option SET value = 'HBO' "
        "WHERE category = 'Official Source' AND value = 'HBO Max'"
    )
    op.execute(
        "UPDATE system_option SET value = 'Disney' "
        "WHERE category = 'Official Source' AND value = 'Disney+'"
    )
