"""Drop the superseded source columns.

Revision ID: dc1o2l3s4d5

Four overlapping mechanisms used to record where an entry can be watched or
read: the `source_baha`/`baha_link` pair, the `source_netflix` flag, the
free-form `source_other` JSONB blob, and the loose `official_link`,
`twitter_link` and `anilist_link` columns. They are all one `media_source`
table now, with the manga/novel serialization platform living in `media_tag`.

The earlier backfill copied every value across (3,360 source rows and 129
serialization tags, verified row by row) and a whole-branch review confirmed
nothing in `app/` reads or writes these columns as behaviour any more, so this
revision removes the storage itself.

Deliberately kept: `mal_id`/`mal_link`, `imdb_id`/`imdb_link`,
`comicvine_id`/`comicvine_link` and `openlibrary_link`/`openlibrary_id`. Those
are not source records - the Fill pipeline extracts the external ids out of
them.

`manga.serialization_platform` is not listed here; an earlier revision already
dropped it.

Revises: u1n2i3t4r5a6
Create Date: 2026-09-05
"""

from alembic import op

revision = "dc1o2l3s4d5"
down_revision = "u1n2i3t4r5a6"
branch_labels = None
depends_on = None

SOURCE_COLUMNS: tuple[str, ...] = (
    "source_baha",
    "baha_link",
    "source_netflix",
    "source_other",
    "official_link",
    "twitter_link",
    "anilist_link",
)

DROPS: dict[str, tuple[str, ...]] = {
    "anime": SOURCE_COLUMNS,
    "anime_movies": SOURCE_COLUMNS,
    "manga": ("source_other", "anilist_link"),
    "novel": ("source_other", "anilist_link"),
    "movies": ("source_other",),
    "tv_shows": ("source_other",),
    "cartoons": ("source_other",),
    "comic": ("source_other",),
}


def upgrade():
    for table, columns in DROPS.items():
        for column in columns:
            op.drop_column(table, column)


def downgrade():
    raise NotImplementedError(
        "There is no way back down. The data these columns held now lives in "
        "media_source (and the serialization platform in media_tag), and "
        "nothing writes it back; recreating the columns would hand back eight "
        "tables of silent NULLs and lose the 3,360 source rows the backfill "
        "moved. To return to the previous shape, check out the code from "
        "before this revision and restore the database from a Backup."
    )
