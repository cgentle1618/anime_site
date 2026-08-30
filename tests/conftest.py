"""
Root conftest.py — runs before ALL test modules.

Sets environment variables BEFORE any app module is imported so that
database.py picks up the test DB name and security.py uses a test secret.
"""

import os

# Override DB to a dedicated test database (must exist; PostgreSQL required for API tests)
os.environ.setdefault("POSTGRES_DB", "anime_site_test")
os.environ.setdefault("POSTGRES_USER", "postgres")
# POSTGRES_PASSWORD is deliberately NOT defaulted here: it comes from the
# developer's .env (via pydantic-settings) or the CI job's environment.
os.environ.setdefault("JWT_SECRET_KEY", "test_secret_key_for_testing_only_do_not_use_in_prod")
os.environ.setdefault("ADMIN_PASSWORD", "testadmin123")
