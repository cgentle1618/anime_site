import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Add the root directory to the python path so it can find your modules
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# We import the pre-calculated URL from database.py to ensure
# Alembic uses the exact same connection logic as FastAPI (Local vs Cloud SQL)
from database import SQLALCHEMY_DATABASE_URL
from models import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    context.configure(
        url=str(SQLALCHEMY_DATABASE_URL),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # Build a config section that uses the dynamic URL from database.py
    configuration = config.get_section(config.config_ini_section, {})
    # Escape % signs for the ConfigParser
    configuration["sqlalchemy.url"] = str(SQLALCHEMY_DATABASE_URL).replace("%", "%%")

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


# --- THE MISSING POWER SWITCH ---
# This block actually executes the migration logic
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
