"""
Keeps every media detail row's `media` parent row in step, in both directions.

Three facts about this codebase decide the shape of what follows.

1. The suite builds its schema with `Base.metadata.create_all`, never Alembic
   (`tests/api/conftest.py`). A trigger that exists only inside a migration is
   invisible to every test. So the AFTER DELETE trigger is attached to the
   table's metadata here, and each porting migration creates the same trigger
   for the real database.
2. Entries are written through the ORM directly as often as through the router
   (`db.add(models.Anime(...)); db.commit()`), so a `pre_commit_hook` on the
   router's spec would miss most writes. The parent row is therefore maintained
   by mapper events, which fire wherever the write came from.
3. `public_id` is a `Sequence` default, so it does not exist until the INSERT
   has run. That rules out building a `Media(...)` before the flush; the parent
   row is written by an INSERT ... SELECT off the row just inserted, which
   reads the minted value back in the same statement.

`display_name` is computed in Python by the single producer,
`compute_display_name`. An entry with no name at all makes it raise, and
`media.display_name` is NOT NULL, so that one case falls through to the same
`(unnamed <type> <public_id>)` placeholder the backfill migrations use - built
in SQL, where public_id is in scope.
"""

from sqlalchemy import DDL, event, text

from app.database import get_taipei_now
from app.models.media import Media

# The shared trigger function. Attached to `media` so create_all defines it
# before any detail table's trigger references it; the porting migrations
# create it with the same body (CREATE OR REPLACE, so re-running is safe).
DELETE_MEDIA_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION delete_media_row() RETURNS trigger AS $$
BEGIN
    DELETE FROM media WHERE system_id = OLD.system_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql
"""


event.listen(
    Media.__table__,
    "after_create",
    DDL(DELETE_MEDIA_FUNCTION_SQL).execute_if(dialect="postgresql"),
)


def delete_trigger_sql(table: str) -> str:
    """The AFTER DELETE trigger that stops a detail delete orphaning `media`."""
    return (
        f"CREATE TRIGGER trg_{table}_delete_media "
        f"AFTER DELETE ON {table} "
        f"FOR EACH ROW EXECUTE FUNCTION delete_media_row()"
    )


def _display_name_or_none(entry) -> str | None:
    # Imported here, not at module scope: this module is loaded from
    # app/models/__init__.py, and importing anything under
    # app.services.domain runs that package's __init__, which imports
    # app.utils.media_resolver, which imports app.models. The cycle only
    # closes at import time, so deferring the import to first call breaks it.
    from app.services.domain.display_name import compute_display_name

    try:
        return compute_display_name(entry)
    except ValueError:
        return None


def register_media_sync(model, media_type: str) -> None:
    """
    Wire one detail model to `media`: insert the parent row after an insert,
    keep the shared columns current after an update, and create the delete
    trigger when the table is created.

    Called once per media type from `app/models/__init__.py`, so that the nine
    registrations sit together and no model module has to import Media.
    """
    table = model.__table__.name
    # anime_movies has no series_id column: anime movies have no series.
    series = "series_id" if "series_id" in model.__table__.c else "NULL"

    insert_sql = text(f"""
        INSERT INTO media (system_id, media_type, public_id, display_name,
                           cover_image_file, franchise_id, series_id,
                           created_at, updated_at)
        SELECT system_id,
               :media_type,
               public_id,
               COALESCE(
                   :display_name,
                   '(unnamed {media_type} ' || public_id::text || ')'
               ),
               cover_image_file,
               franchise_id,
               {series},
               :now,
               :now
        FROM {table}
        WHERE system_id = :system_id
        -- Pull restores the Media tab before the nine entry tabs, so the
        -- parent row can already exist when the detail row arrives. The
        -- detail row is the producer of these columns, so it wins.
        ON CONFLICT (system_id) DO UPDATE SET
            media_type = EXCLUDED.media_type,
            public_id = EXCLUDED.public_id,
            display_name = EXCLUDED.display_name,
            cover_image_file = EXCLUDED.cover_image_file,
            franchise_id = EXCLUDED.franchise_id,
            series_id = EXCLUDED.series_id,
            updated_at = EXCLUDED.updated_at
    """)

    update_sql = text(f"""
        UPDATE media SET
            public_id = d.public_id,
            display_name = COALESCE(
                :display_name,
                '(unnamed {media_type} ' || d.public_id::text || ')'
            ),
            cover_image_file = d.cover_image_file,
            franchise_id = d.franchise_id,
            series_id = {"d.series_id" if series != "NULL" else "NULL"},
            updated_at = :now
        FROM {table} d
        WHERE media.system_id = d.system_id AND d.system_id = :system_id
    """)

    @event.listens_for(model, "after_insert")
    def _after_insert(mapper, connection, target):  # noqa: ARG001
        connection.execute(
            insert_sql,
            {
                "media_type": media_type,
                "display_name": _display_name_or_none(target),
                "now": get_taipei_now(),
                "system_id": target.system_id,
            },
        )

    @event.listens_for(model, "after_update")
    def _after_update(mapper, connection, target):  # noqa: ARG001
        connection.execute(
            update_sql,
            {
                "display_name": _display_name_or_none(target),
                "now": get_taipei_now(),
                "system_id": target.system_id,
            },
        )

    event.listen(
        model.__table__,
        "after_create",
        DDL(delete_trigger_sql(table)).execute_if(dialect="postgresql"),
    )
