"""Liveness that touches the database, for the deploy ladder and the container.

`app` carried no healthcheck for most of this project's life, deliberately: the
catch-all route in `app/main.py` serves the SPA for any path, so a probe against
"/" returns 200 with the database down, and a healthcheck that lies is worse
than none. What retires that reasoning is a probe that cannot lie the same way.

Three conditions are checked, and the third is the one nothing else on the box
would notice. After a failed migration-bearing deploy the database holds the new
revision while the image has rolled back to code that has never heard of it. The
site still serves pages. Row counts still look right. Only a comparison between
what the schema SAYS it is and what the code EXPECTS catches that.

Two paths, deliberately unequal. The bare path is public - the Cloudflare
ingress routes every path at media.cg1618.com to app:8000, so there is no such
thing as an internal path here - and says only whether the app is serving. The
detail path is gated on manage.pipelines, the permission that already guards the
operational surfaces, and is what a human reads during an incident.

The revision is read from `alembic_version.version_num` and from nowhere else:
not from an image's revision files, not from `alembic heads` against the
database. The off-box backup's stamp asserts against that same table, and two
authoritative answers that can disagree mid-deploy is worse than one.
"""

from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.rbac.resolver import require_manage_pipelines

router = APIRouter(prefix="/api/health", tags=["Health"])

# app/routers/health.py -> app/ -> the repository root, where alembic.ini lives.
# Derived from this file rather than imported from app.main, which imports this
# module to register the router.
BASE_DIR = Path(__file__).resolve().parents[2]


def read_alembic_revision(db: Session) -> str | None:
    """The revision the DATABASE believes it is at, or None if unstamped."""
    row = db.execute(text("SELECT version_num FROM alembic_version")).first()
    return row[0] if row else None


@lru_cache(maxsize=1)
def expected_revision() -> str | None:
    """The head the RUNNING CODE expects, from the revision files it ships.

    Cached because the container's filesystem is immutable for its lifetime and
    the compose healthcheck calls this every 30 seconds; `ScriptDirectory` walks
    every revision file on each construction, which would otherwise make the
    health probe the most expensive request this app serves.

    Returns None when the chain has more than one head, which is a broken
    repository rather than a state to serve traffic in - the caller treats it as
    unhealthy.
    """
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(Config(str(BASE_DIR / "alembic.ini")))
    heads = script.get_heads()
    return heads[0] if len(heads) == 1 else None


@router.get("")
def health(response: Response, db: Session = Depends(get_db)):
    try:
        actual = read_alembic_revision(db)
    except Exception:
        # Deliberately broad. Anything that stops this query - the database
        # down, the table absent, a connection pool exhausted - means the app
        # cannot serve, and a health probe that raised would be a 500 the
        # container's healthcheck reads the same way anyway. Reporting 503
        # keeps the meaning explicit.
        response.status_code = 503
        return {"status": "unavailable"}

    expected = expected_revision()

    # `actual is None` is checked explicitly rather than relying on the
    # comparison: if expected_revision() also returned None, None == None would
    # be a MATCH and an app that could read neither side would report healthy.
    if actual is None or expected is None or actual != expected:
        response.status_code = 503
        return {"status": "unavailable"}

    return {"status": "ok"}


@router.get("/detail")
def health_detail(
    db: Session = Depends(get_db),
    _viewer=Depends(require_manage_pipelines),
):
    try:
        actual = read_alembic_revision(db)
    except Exception:
        actual = None

    return {
        "status": "ok",
        "alembic_revision": actual,
        "expected_revision": expected_revision(),
    }
