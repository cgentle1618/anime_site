"""
Unit-test fixtures.

`db_session` is defined in tests/api/conftest.py (session-scoped `test_engine`
+ per-test rollback). Fixture visibility follows the directory tree, so a
conftest.py under tests/api is invisible to tests under tests/unit even
though pytest's rootdir is shared. Re-exporting the already-decorated
fixtures here (rather than redefining the engine setup) keeps a single
source of truth for the test-DB schema reset.
"""

from tests.api.conftest import db_session, test_engine  # noqa: F401
