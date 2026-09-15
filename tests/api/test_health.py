"""`/api/health` is the one signal the deploy ladder is allowed to believe.

`app` deliberately had no healthcheck for most of this project's life, and the
reasoning was right: the catch-all route in `app/main.py` serves the SPA for any
path, so a probe against "/" returns 200 with the database down. A healthcheck
that lies is worse than none.

This endpoint exists to be the thing that cannot lie that way. It opens a real
session and reads a real row, and it compares what the database says its schema
is against what the running code expects - which is the condition that catches a
half-rolled-back box, where the image and the schema disagree and nothing else
on the machine would say so.

The unauthenticated body carries no detail on purpose. The Cloudflare ingress
routes everything at media.cg1618.com to app:8000, so this path is on the public
internet, and the alembic head is the schema version and the migration cadence.
"""

from sqlalchemy import text

from app.routers import health


def _stamp(db, revision: str) -> None:
    """Give the test database an `alembic_version` row.

    `tests/api/conftest.py` builds its schema with `Base.metadata.create_all`
    and never runs Alembic, so the table the endpoint reads does not exist here
    unless a test makes it. That absence is itself a real 503 case and is
    asserted below - but the healthy path has to be set up deliberately.
    """
    db.execute(
        text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num varchar(32) NOT NULL PRIMARY KEY)"
        )
    )
    db.execute(text("DELETE FROM alembic_version"))
    db.execute(text("INSERT INTO alembic_version VALUES (:v)"), {"v": revision})
    db.commit()


def test_health_is_ok_when_the_schema_matches_the_code(client, db_session):
    _stamp(db_session, health.expected_revision())

    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_the_public_body_carries_no_detail(client, db_session):
    # The WHOLE body, not a subset. Asserting only that two known fields are
    # absent would pass for a third field added later, and a field added later
    # is exactly how a leak arrives.
    _stamp(db_session, health.expected_revision())

    assert client.get("/api/health").json() == {"status": "ok"}


def test_health_is_503_when_the_database_is_unreachable(client, monkeypatch):
    def explode(_db):
        raise RuntimeError("no database")

    monkeypatch.setattr(health, "read_alembic_revision", explode)

    assert client.get("/api/health").status_code == 503


def test_health_is_503_when_the_database_is_unstamped(client, db_session):
    # An empty or absent alembic_version means the schema's provenance is
    # unknown. `entrypoint.sh` runs `alembic upgrade head` before uvicorn binds,
    # so in production this cannot happen on a healthy start - which is why it
    # is a failure rather than a shrug.
    db_session.execute(text("DROP TABLE IF EXISTS alembic_version"))
    db_session.commit()

    assert client.get("/api/health").status_code == 503


def test_health_is_503_when_the_schema_and_the_code_disagree(client, db_session):
    # THE case this endpoint exists for. After a failed migration-bearing
    # deploy, the database holds the new revision while the image rolled back
    # to code that has never heard of it. The site can still serve pages, so
    # every weaker probe passes. This one does not.
    _stamp(db_session, "zz9notarealrevision")

    assert client.get("/api/health").status_code == 503


def test_detail_refuses_an_anonymous_caller(client):
    assert client.get("/api/health/detail").status_code == 401


def test_detail_reports_both_revisions_for_an_authorised_caller(admin_client, db_session):
    _stamp(db_session, "abc123")

    response = admin_client.get("/api/health/detail")
    assert response.status_code == 200
    body = response.json()
    assert body["alembic_revision"] == "abc123"
    assert body["expected_revision"] == health.expected_revision()


def test_the_expected_revision_is_a_real_head():
    # Guards against the endpoint comparing against None forever, which would
    # make every other assertion here pass for the wrong reason: None == None
    # is a match, so an endpoint that could not read either side would look
    # healthy. The repo has exactly one head.
    assert health.expected_revision()
