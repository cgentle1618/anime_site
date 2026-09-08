"""seed the Platform and Reference Source vocabularies

Revision ID: sv1o2c3a4b
Revises: st1a2g3s4
"""

import uuid

import sqlalchemy as sa

from alembic import op
from app.utils.serialization_values import canonical_values

revision = "sv1o2c3a4b"
down_revision = "st1a2g3s4"
branch_labels = None
depends_on = None

PLATFORM = "Platform"
REFERENCE = "Reference Source"
SERIALIZATION = "Serialization Platform"

# (category, value, scopes, usages). Empty scopes = offered on every media
# type; empty usages = serves both watch and origin.
#
# Netflix and Disney+ are listed here with empty scopes on purpose: st1a2g3s4
# already cleared their scope rows so they are offered everywhere, and this
# migration only ever ADDS scope rows via the loop below - never list either
# of them with a non-empty scope here, or the loop would resurrect scoping
# that was deliberately removed.
SEED: list[tuple[str, str, list[str], list[str]]] = [
    (PLATFORM, "Netflix", [], []),
    (PLATFORM, "Disney+", [], []),
    (PLATFORM, "Prime Video", [], []),
    (PLATFORM, "Apple TV+", ["movie", "tv-show", "cartoon"], []),
    (PLATFORM, "HBO Max", ["movie", "tv-show", "cartoon"], []),
    (PLATFORM, "Cinema", ["movie", "anime-movie"], []),
    (PLATFORM, "Crunchyroll", ["anime", "anime-movie"], []),
    (PLATFORM, "Bahamut", ["anime", "anime-movie"], []),
    (PLATFORM, "Bilibili", ["anime", "anime-movie"], []),
    (PLATFORM, "Fox", ["tv-show", "cartoon"], ["origin"]),
    (PLATFORM, "ABC", ["tv-show"], ["origin"]),
    (PLATFORM, "The CW", ["tv-show"], ["origin"]),
    (PLATFORM, "Nickelodeon", ["cartoon"], ["origin"]),
    (PLATFORM, "Adult Swim", ["cartoon"], ["origin"]),
    (PLATFORM, "Cartoon Network", ["cartoon"], ["origin"]),
    (PLATFORM, "Other", ["cartoon"], ["origin"]),
    (REFERENCE, "Wikipedia", [], []),
    (REFERENCE, "Fandom wiki", [], []),
    (REFERENCE, "Official site", ["anime", "anime-movie", "comic"], []),
    (REFERENCE, "Twitter", ["anime", "anime-movie", "manga", "novel"], []),
    (REFERENCE, "AniList", ["anime", "anime-movie", "manga", "novel"], []),
    (REFERENCE, "KeyFrame Staff List", ["anime", "anime-movie"], []),
]

# Cartoon Network is now part of HBO Max. Recorded as a remark rather than
# inside the value: (category, value) is the unique key and every entry points
# at that string, so folding the parenthetical in would make a future rename
# break them all.
REMARKS = {"Cartoon Network": "now part of HBO Max"}


def _upsert_option(conn, category, value, sort_order, remark):
    existing = conn.execute(
        sa.text(
            "SELECT system_id FROM system_option WHERE category = :c AND value = :v"
        ),
        {"c": category, "v": value},
    ).scalar()
    if existing:
        return existing
    option_id = uuid.uuid4()
    conn.execute(
        sa.text(
            "INSERT INTO system_option (system_id, category, value, sort_order, remark) "
            "VALUES (:id, :c, :v, :so, :r)"
        ),
        {"id": option_id, "c": category, "v": value, "so": sort_order, "r": remark},
    )
    return option_id


def upgrade():
    conn = op.get_bind()
    for sort_order, (category, value, scopes, usages) in enumerate(SEED):
        option_id = _upsert_option(
            conn, category, value, sort_order, REMARKS.get(value)
        )
        for scope in scopes:
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_scope (option_id, scope) "
                    "VALUES (:id, :s) ON CONFLICT DO NOTHING"
                ),
                {"id": option_id, "s": scope},
            )
        for usage in usages:
            conn.execute(
                sa.text(
                    "INSERT INTO system_option_usage (option_id, usage) "
                    "VALUES (:id, :u) ON CONFLICT DO NOTHING"
                ),
                {"id": option_id, "u": usage},
            )

    # The Serialization Platform vocabulary comes from whatever has already
    # been typed into manga.serialization_platform - it cannot be listed
    # above. Naively grouping by TRIM(serialization_platform) would seed a
    # literal comma-compound value ("週刊少年Jump, Jump+") as one option; the
    # controller's decision (task-10-decisions.md) is to split on comma and
    # auto-merge case/parenthetical variants instead. That algorithm lives in
    # app/utils/serialization_values.py, imported here AND by the later
    # migration that backfills media_tag from this same column, so both
    # agree on the exact same canonical spelling byte-for-byte.
    raw_values = [
        row[0]
        for row in conn.execute(
            sa.text(
                "SELECT serialization_platform FROM manga "
                "WHERE serialization_platform IS NOT NULL "
                "AND TRIM(serialization_platform) <> ''"
            )
        ).fetchall()
    ]
    merged = canonical_values(raw_values)
    # Multiple casefold groups cannot land on the same canonical string here
    # (they would have casefolded identically and merged into one group), but
    # dedupe by value defensively and seed in a stable, deterministic order.
    seen_values: dict[str, str | None] = {}
    for value, remark in merged.values():
        seen_values[value] = remark
    for sort_order, value in enumerate(sorted(seen_values)):
        option_id = _upsert_option(
            conn, SERIALIZATION, value, sort_order, seen_values[value]
        )
        conn.execute(
            sa.text(
                "INSERT INTO system_option_scope (option_id, scope) "
                "VALUES (:id, 'manga') ON CONFLICT DO NOTHING"
            ),
            {"id": option_id},
        )


def downgrade():
    conn = op.get_bind()
    for category, value, _scopes, _usages in SEED:
        conn.execute(
            sa.text("DELETE FROM system_option WHERE category = :c AND value = :v"),
            {"c": category, "v": value},
        )
    conn.execute(
        sa.text("DELETE FROM system_option WHERE category = :c"),
        {"c": SERIALIZATION},
    )
