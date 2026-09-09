"""
Keeps every media detail row's `media` parent row in step, in both directions.

Four facts about this codebase decide the shape of what follows.

1. The suite builds its schema with `Base.metadata.create_all`, never Alembic
   (`tests/api/conftest.py`). A trigger that exists only inside a migration is
   invisible to every test. So the AFTER DELETE trigger is attached to the
   table's metadata here, and each porting migration creates the same trigger
   for the real database.
2. Entries are written through the ORM directly as often as through the router
   (`db.add(models.Anime(...)); db.commit()`), so a `pre_commit_hook` on the
   router's spec would miss most writes. The parent row is therefore maintained
   by session and mapper events, which fire wherever the write came from.
3. The parent row is created when the detail object is CONSTRUCTED, not after
   it is inserted. Phase C moves writable columns onto `media` - the cover, the
   parent links, the public id - and the code that writes them does so before
   the flush (`entry.cover_image_file = key` on a brand-new entry). A parent
   row that appeared only at INSERT time would not be there to receive them.
   The composite FK makes `media` the parent in SQLAlchemy's eyes, so it is
   inserted first and the child's FK is populated from it automatically.
4. `public_id` is a `Sequence` default, which Postgres would not mint until the
   detail INSERT. Since `media.public_id` is NOT NULL and `media` is now
   inserted FIRST, the value is minted explicitly at flush time and written to
   both rows, which is what the sequence default would have done anyway.

`display_name` is computed by the single producer, `compute_display_name`. An
entry with no name at all makes it raise, so that one case falls through to the
same `(unnamed <type> <public_id>)` placeholder the backfill migrations use.
"""

import uuid

from sqlalchemy import DDL, event, text
from sqlalchemy.orm import Session, relationship

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

# Columns `media` shares with the detail tables, in the order Phase C moves
# them. Copied only while the detail table still declares them - see
# sync_media_row.
SHARED_COLUMNS = ("cover_image_file", "franchise_id", "series_id")

# {detail model: hyphenated media_type key}, filled by register_media_sync.
MEDIA_TYPE_FOR_MODEL: dict[type, str] = {}


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
    Wire one detail model to `media`: give it a parent row on construction,
    keep the derived columns current at flush, and create the delete trigger
    when the table is created.

    Called once per media type from `app/models/__init__.py`, so that the nine
    registrations sit together and no model module has to import Media.
    """
    table = model.__table__.name
    MEDIA_TYPE_FOR_MODEL[model] = media_type

    model.media_row = relationship(Media, lazy="joined")

    @event.listens_for(model, "init")
    def _on_init(target, args, kwargs):  # noqa: ARG001
        """
        Attach the parent row before the constructor assigns anything, so a
        caller can write a media-owned column on the very next line.

        The id is minted here rather than left to the column default because
        both rows must carry the same one, and `system_id=` passed to the
        constructor is reconciled at flush.
        """
        system_id = uuid.uuid4()
        target.system_id = system_id
        target.media_row = Media(system_id=system_id, media_type=media_type)

    event.listen(
        model.__table__,
        "after_create",
        DDL(delete_trigger_sql(table)).execute_if(dialect="postgresql"),
    )


def _sequence_name(entry) -> str | None:
    """The public_id sequence the entry's own table owns, if it has one."""
    from sqlalchemy import Sequence

    column = entry.__table__.columns.get("public_id")
    if column is None or not isinstance(column.default, Sequence):
        return None
    return column.default.name


def sync_media_row(session: Session, entry) -> None:
    """
    Make the entry's `media` row agree with the entry, before either is written.

    Called for every new and every changed detail row. Everything it sets is
    either derived (display_name) or shared identity (system_id, public_id):
    the columns that live only on `media` are written straight there by the
    code that owns them, and are deliberately not copied from anywhere.
    """
    media = entry.media_row
    if media is None or media.system_id != entry.system_id:
        # Either the entry was loaded from the database (no parent attached),
        # or it was constructed with an explicit system_id - Pull does that -
        # which overrode the one `init` minted. In the second case a parent row
        # for that id may already exist, and adopting it is the whole point:
        # Pull restores the Media tab BEFORE the nine entry tabs, so the parent
        # is usually already there when the detail row arrives.
        existing = session.get(Media, entry.system_id)
        if existing is not None:
            if media is not None and media in session.new:
                session.expunge(media)
            media = existing
        elif media is None:
            media = Media(
                system_id=entry.system_id,
                media_type=MEDIA_TYPE_FOR_MODEL[type(entry)],
            )
            session.add(media)
        entry.media_row = media

    media.system_id = entry.system_id
    media.media_type = MEDIA_TYPE_FOR_MODEL[type(entry)]

    if media.public_id is None:
        detail_id = getattr(entry, "public_id", None)
        if detail_id is None:
            sequence = _sequence_name(entry)
            detail_id = (
                session.execute(text(f"SELECT nextval('{sequence}')")).scalar_one()
                if sequence
                else None
            )
            if "public_id" in entry.__table__.columns:
                entry.public_id = detail_id
        media.public_id = detail_id

    # Phase C moves these onto `media` one at a time. While a column is still
    # on the detail table, the detail table owns it and the copy keeps `media`
    # current; the moment a task drops it, this stops copying it on its own and
    # `media` becomes the only home. That is what keeps a column from ever
    # being writable in two places at once.
    for column in SHARED_COLUMNS:
        if column in entry.__table__.columns:
            setattr(media, column, getattr(entry, column))

    name = _display_name_or_none(entry)
    media.display_name = (
        name if name is not None else f"(unnamed {media.media_type} {media.public_id})"
    )


@event.listens_for(Session, "before_flush")
def _sync_media_rows(session: Session, flush_context, instances):  # noqa: ARG001
    """
    One listener for all nine types, rather than nine mapper events.

    before_flush, not after_insert: the parent row has to be INSERTed before
    the child, so it must be in the session as an object while there is still
    a flush plan to put it in.
    """
    for entry in list(session.new) + list(session.dirty):
        if type(entry) not in MEDIA_TYPE_FOR_MODEL:
            continue
        if entry in session.new or session.is_modified(
            entry, include_collections=False
        ):
            sync_media_row(session, entry)
