import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Add the root directory to the python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# We import the pre-calculated URL from database.py
# This ensures Alembic and FastAPI always use the exact same connection
from database import SQLALCHEMY_DATABASE_URL
from models import Base

config = context.config

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
    print(
        f"🚀 [ALEMBIC DEBUG] Attempting connection to: {SQLALCHEMY_DATABASE_URL}",
        flush=True,
    )

    # Build configuration to use the dynamic URL from database.py
    configuration = config.get_section(config.config_ini_section, {})

    # --- FIXED LOGIC ---
    # We force Alembic to use the URL provided by database.py
    configuration["sqlalchemy.url"] = str(SQLALCHEMY_DATABASE_URL).replace("%", "%%")

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        try:
            with context.begin_transaction():
                context.run_migrations()
            print(
                "✅ [ALEMBIC SUCCESS] All database migrations applied perfectly!",
                flush=True,
            )
        except Exception as e:
            print(f"❌ [ALEMBIC FATAL CRASH] Migrations failed to apply:", flush=True)
            print(str(e), flush=True)
            raise e


# Execute migrations
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
