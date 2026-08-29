"""
Startup schema guard.

Alembic owns the schema. This module exists so that the dev server cannot
silently paper over a database that Alembic has never touched -- which is
exactly how a dropped database once came back looking healthy: the server
recreated all 25 tables via create_all(), reseeded the admin user, and left no
error anywhere. The only tell was a missing alembic_version table, because
create_all() never writes one.

The rules:

- A migrated database (alembic_version present) is left completely alone. No
  create_all, so a model change that lacks a migration fails loudly at query
  time instead of appearing to work locally and breaking at deploy.
- An empty database with no tables at all is a first-run convenience: tables are
  created, and the log says plainly that Alembic must still be stamped.
- A database that has tables but no alembic_version is the dangerous middle
  case -- either a drop that something already rebuilt, or a create_all from an
  older build. That is reported as a warning rather than quietly extended.
"""

import logging

from sqlalchemy import inspect

from app import models

logger = logging.getLogger(__name__)

_STAMP_HINT = (
    "Run 'alembic upgrade head' on a fresh database, or 'alembic stamp head' if "
    "the schema is already current, so Alembic can manage it from here."
)


def schema_state(engine) -> str:
    """
    Classify the database: "migrated", "empty", or "unmanaged".

    Split out from ensure_schema so it can be tested without side effects.
    """
    tables = set(inspect(engine).get_table_names())
    if "alembic_version" in tables:
        return "migrated"
    if not tables:
        return "empty"
    return "unmanaged"


def ensure_schema(engine) -> str:
    """
    Decide what, if anything, to create at startup. Returns the state observed.

    Replaces an unconditional models.Base.metadata.create_all(), which ran on
    every start and every --reload. That call could only ever add missing
    tables, so it never destroyed data -- but it hid the absence of a database
    behind a working-looking app, and it raced Alembic by creating tables a
    subsequent 'alembic upgrade head' then failed to create.
    """
    state = schema_state(engine)

    if state == "migrated":
        return state

    if state == "empty":
        logger.warning(
            "[System] Empty database: creating tables from the models so the app "
            "can start. This is NOT a migration. %s",
            _STAMP_HINT,
        )
        models.Base.metadata.create_all(bind=engine)
        return state

    logger.warning(
        "[System] Database has tables but no alembic_version. Alembic is not "
        "managing this schema, so it may be stale or a rebuild of a dropped "
        "database. Leaving it untouched -- no tables were created. %s",
        _STAMP_HINT,
    )
    return state
