"""backfill media_source and serialization_platform tags from the old columns

Revision ID: bf1i2l3l4
Revises: sv1o2c3a4b

Kept as a migration rather than a service so it runs exactly once, in order,
on both machines. The Twitter rows on manga and novel come out of source_other
by name, replacing the string-match that used to happen in the browser.

This migration does FOUR things atomically (see
.superpowers/sdd/2026-09-04-media-sources/task-10-decisions.md, "Task 11's
extra obligation"):

1. Backfill the old source columns into `media_source` rows.
2. Backfill `manga.serialization_platform` into `media_tag` rows, using the
   shared `app.utils.serialization_values` helper - the SAME normalisation
   `sv1o2c3a4b_seed_source_vocabulary` used to seed the vocabulary, so every
   row lands on a canonical string that already has an option.
3. Drop the `manga.serialization_platform` column.
4. (In the same commit, in code: `TAG_FIELDS["serialization_platform"]`
   widens to `("manga", "novel")`.)

They must land together: nothing at the DB or ORM level enforces
`(media_type, field)` legality on `media_tag`, so widening the TagField
before this backfill runs would make `attach_link_fields` null the live
column on every read, while backfilling before the widen would insert rows
`tag_fields_for("manga")` can't see yet.
"""

import json
import uuid
from dataclasses import dataclass

import sqlalchemy as sa
from alembic import op

from app.utils.serialization_values import canonical_values, resolve

revision = "bf1i2l3l4"
down_revision = "sv1o2c3a4b"
branch_labels = None
depends_on = None


@dataclass(frozen=True)
class SourceColumn:
    """One old column, and the media_source row it becomes."""

    option_value: str
    kind: str
    link_column: str | None = None
    flag_column: str | None = None


SOURCE_COLUMNS: dict[str, tuple[SourceColumn, ...]] = {
    "anime": (
        SourceColumn("Bahamut", "access", "baha_link", "source_baha"),
        SourceColumn("Netflix", "access", None, "source_netflix"),
        SourceColumn("Official site", "reference", "official_link"),
        SourceColumn("Twitter", "reference", "twitter_link"),
        SourceColumn("AniList", "reference", "anilist_link"),
    ),
    "anime-movie": (
        SourceColumn("Bahamut", "access", "baha_link", "source_baha"),
        SourceColumn("Netflix", "access", None, "source_netflix"),
        SourceColumn("Official site", "reference", "official_link"),
        SourceColumn("Twitter", "reference", "twitter_link"),
        SourceColumn("AniList", "reference", "anilist_link"),
    ),
    # movie, tv-show, cartoon and comic had no named source column - only
    # source_other, which the generic block below handles for every type.
    "movie": (),
    "tv-show": (),
    "cartoon": (),
    "manga": (SourceColumn("AniList", "reference", "anilist_link"),),
    "novel": (SourceColumn("AniList", "reference", "anilist_link"),),
    "comic": (),
}

TABLE_FOR_TYPE = {
    "anime": "anime",
    "anime-movie": "anime_movies",
    "movie": "movies",
    "tv-show": "tv_shows",
    "cartoon": "cartoons",
    "manga": "manga",
    "novel": "novel",
    "comic": "comic",
}

SERIALIZATION_CATEGORY = "Serialization Platform"


def _option_ids(conn) -> dict[tuple[str, str], uuid.UUID]:
    rows = conn.execute(
        sa.text("SELECT category, value, system_id FROM system_option")
    ).fetchall()
    return {(c, v): i for c, v, i in rows}


def _backfill_media_source(conn, options: dict[tuple[str, str], uuid.UUID]) -> None:
    for media_type, columns in SOURCE_COLUMNS.items():
        table = TABLE_FOR_TYPE[media_type]

        # --- named columns -> main rows ---------------------------------
        for column in columns:
            category = "Platform" if column.kind == "access" else "Reference Source"
            option_id = options.get((category, column.option_value))
            if option_id is None:
                continue

            selects = ["system_id"]
            if column.link_column:
                selects.append(column.link_column)
            if column.flag_column:
                selects.append(column.flag_column)

            rows = (
                conn.execute(sa.text(f"SELECT {', '.join(selects)} FROM {table}"))
                .mappings()
                .fetchall()
            )

            for row in rows:
                url = row.get(column.link_column) if column.link_column else None
                flag = row.get(column.flag_column) if column.flag_column else None
                if not url and flag is None:
                    continue
                conn.execute(
                    sa.text(
                        "INSERT INTO media_source "
                        "(system_id, media_type, entry_id, kind, bucket, "
                        " option_id, name, available, url, position) "
                        "VALUES (:id, :mt, :eid, :k, 'main', :oid, NULL, "
                        "        :av, :url, 0) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "mt": media_type,
                        "eid": row["system_id"],
                        "k": column.kind,
                        "oid": option_id,
                        "av": flag,
                        "url": url or None,
                    },
                )

        # --- source_other -> other rows, with Twitter lifted out --------
        twitter_id = options.get(("Reference Source", "Twitter"))
        rows = (
            conn.execute(sa.text(f"SELECT system_id, source_other FROM {table}"))
            .mappings()
            .fetchall()
        )

        for row in rows:
            raw = row["source_other"]
            if not raw:
                continue
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except ValueError:
                    continue
            if not isinstance(raw, dict):
                continue

            position = 0
            for name, url in raw.items():
                name = (name or "").strip()
                if not name:
                    continue
                is_twitter = (
                    name.lower() == "twitter"
                    and media_type in ("manga", "novel")
                    and twitter_id is not None
                )
                conn.execute(
                    sa.text(
                        "INSERT INTO media_source "
                        "(system_id, media_type, entry_id, kind, bucket, "
                        " option_id, name, available, url, position) "
                        "VALUES (:id, :mt, :eid, :k, :b, :oid, :nm, NULL, "
                        "        :url, :pos) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "mt": media_type,
                        "eid": row["system_id"],
                        "k": "reference" if is_twitter else "access",
                        "b": "main" if is_twitter else "other",
                        "oid": twitter_id if is_twitter else None,
                        "nm": None if is_twitter else name,
                        "url": (url or None),
                        "pos": 0 if is_twitter else position,
                    },
                )
                if not is_twitter:
                    position += 1


def _backfill_serialization_tags(conn) -> None:
    """manga.serialization_platform -> media_tag, via the shared helper.

    Re-derives the exact same canonical mapping
    `sv1o2c3a4b_seed_source_vocabulary` used to seed `system_option` - same
    query, same algorithm, same corpus - so every raw value resolves to a
    string that already has a matching option. A compound raw value
    ("週刊少年Jump, Jump+") becomes multiple tag rows, `position` following the
    order the parts appeared in the string.
    """
    rows = conn.execute(
        sa.text(
            "SELECT system_id, serialization_platform FROM manga "
            "WHERE serialization_platform IS NOT NULL "
            "AND TRIM(serialization_platform) <> ''"
        )
    ).fetchall()
    if not rows:
        return

    raw_values = [row[1] for row in rows]
    canonical_map = canonical_values(raw_values)

    option_rows = conn.execute(
        sa.text("SELECT value, system_id FROM system_option WHERE category = :c"),
        {"c": SERIALIZATION_CATEGORY},
    ).fetchall()
    option_by_value = {value: option_id for value, option_id in option_rows}

    for system_id, raw in rows:
        for position, value in enumerate(resolve(raw, canonical_map)):
            option_id = option_by_value.get(value)
            if option_id is None:
                # Should never happen: sv1o2c3a4b seeded exactly these values
                # from this same corpus. Skip rather than crash the whole
                # backfill over one unexpected mismatch.
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO media_tag "
                    "(system_id, media_type, entry_id, field, option_id, position) "
                    "VALUES (:id, 'manga', :eid, 'serialization_platform', "
                    "        :oid, :pos) "
                    "ON CONFLICT DO NOTHING"
                ),
                {
                    "id": uuid.uuid4(),
                    "eid": system_id,
                    "oid": option_id,
                    "pos": position,
                },
            )


def upgrade():
    conn = op.get_bind()
    options = _option_ids(conn)

    _backfill_media_source(conn, options)
    _backfill_serialization_tags(conn)

    op.drop_column("manga", "serialization_platform")


def downgrade():
    op.add_column(
        "manga", sa.Column("serialization_platform", sa.String(), nullable=True)
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE manga m
               SET serialization_platform = sub.joined
              FROM (
                SELECT mt.entry_id,
                       string_agg(o.value, ', ' ORDER BY mt.position) AS joined
                  FROM media_tag mt
                  JOIN system_option o ON o.system_id = mt.option_id
                 WHERE mt.media_type = 'manga'
                   AND mt.field = 'serialization_platform'
                 GROUP BY mt.entry_id
              ) AS sub
             WHERE m.system_id = sub.entry_id
            """
        )
    )

    op.execute("DELETE FROM media_tag WHERE field = 'serialization_platform'")
    op.execute("DELETE FROM media_source")
