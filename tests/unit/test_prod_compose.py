"""The production compose file's invariants.

These are the properties that are easy to break by accident and expensive to
notice: a published port exposes the database to the LAN, a missing restart
policy means the box comes back from a power cut without the app, and a missing
healthcheck condition makes the app crash-loop through alembic on a slow boot.

The file these assert against is never exercised by this suite - it runs on a
machine CI cannot reach - so structure is the only thing that can be checked
here. That makes it worth checking.
"""

from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker-compose.prod.yml"
INGRESS = ROOT / "deploy" / "cloudflared" / "config.yml"


@pytest.fixture(scope="module")
def compose():
    return yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))


def test_compose_file_exists():
    assert COMPOSE.is_file(), f"{COMPOSE} is missing"


def test_the_three_services_are_present(compose):
    assert set(compose["services"]) == {"db", "app", "cloudflared"}


@pytest.mark.parametrize("service", ["db", "app", "cloudflared"])
def test_no_service_publishes_a_port(compose, service):
    # The tunnel is the only ingress. A published port on db would put
    # PostgreSQL on the LAN; on app it would bypass Cloudflare entirely.
    assert "ports" not in compose["services"][service]


@pytest.mark.parametrize("service", ["db", "app", "cloudflared"])
def test_every_service_restarts_unless_stopped(compose, service):
    # Not "always": a deliberate `docker compose stop` must survive a daemon
    # restart, or debugging on the box fights the restart policy.
    assert compose["services"][service]["restart"] == "unless-stopped"


@pytest.mark.parametrize("service", ["db", "app", "cloudflared"])
def test_no_service_hardcodes_a_container_name(compose, service):
    # Compose derives names from COMPOSE_PROJECT_NAME (media-db-1, ...), which
    # makes the project name the one place a name is written. A hardcoded
    # container_name is a second place for a stale one to hide - and this
    # project has already renamed itself once, from "anime" to a media tracker.
    assert "container_name" not in compose["services"][service]


def test_db_has_a_readiness_healthcheck(compose):
    assert "healthcheck" in compose["services"]["db"]


def test_app_waits_for_a_healthy_db(compose):
    assert compose["services"]["app"]["depends_on"]["db"]["condition"] == "service_healthy"


def test_the_app_healthcheck_does_not_probe_the_catch_all_route(compose):
    # `app` carried no healthcheck at all until /api/health existed, and the
    # reasoning was right rather than an oversight: the catch-all route at
    # app/main.py serves the SPA for any path, so a check against "/" returns
    # 200 with the database down, and a healthcheck that lies is worse than
    # none.
    #
    # /api/health retires that reasoning by opening a real session, reading
    # alembic_version, and comparing it to the head the running code expects -
    # so it fails when the database is gone AND when the schema and the image
    # disagree, which is the state a half-rolled-back deploy leaves behind.
    #
    # This pins the DISTINCTION, not the presence. Repointing the probe at "/"
    # must fail rather than pass quietly, because that single character is the
    # whole difference between a check and a lie.
    probe = " ".join(compose["services"]["app"]["healthcheck"]["test"])
    assert "/api/health" in probe, probe


def test_app_carries_an_image_name_alongside_build(compose):
    # Keeps the move to a registry a one-line change: the service already
    # refers to an image by name, so only what that name points at changes.
    app = compose["services"]["app"]
    assert app["build"]["context"] == "."
    assert app["image"] == "media-app:local"


def test_covers_and_library_are_bind_mounts(compose):
    # Named volumes would hide these from rsync and from the backup that
    # build-order step 7 adds. static/library/ is the only copy of every
    # uploaded image in existence.
    volumes = compose["services"]["app"]["volumes"]
    assert any(v.startswith("./static/covers:") for v in volumes)
    assert any(v.startswith("./static/library:") for v in volumes)


def test_cloudflared_mounts_its_config_read_only(compose):
    volumes = compose["services"]["cloudflared"]["volumes"]
    assert any(v.endswith("/etc/cloudflared/config.yml:ro") for v in volumes)
    assert any(v.endswith("/etc/cloudflared/credentials.json:ro") for v in volumes)


def test_the_compose_file_sits_beside_the_env_it_interpolates():
    """Compose loads `.env` from the compose file's own directory.

    Moving this file into a subdirectory makes every ${...} below interpolate
    to an empty string, while `env_file:` keeps working - so the app still
    starts, with a database password of "". That is the quiet version of this
    failure, and it is why the file lives at the repository root.
    """
    assert COMPOSE.parent == ROOT, (
        f"{COMPOSE.name} must sit beside .env at the repository root; found it in {COMPOSE.parent}"
    )


def test_ingress_ends_with_a_catch_all():
    # cloudflared refuses to start without a catch-all, and it must be last.
    rules = yaml.safe_load(INGRESS.read_text(encoding="utf-8"))["ingress"]
    assert "hostname" not in rules[-1]
    assert rules[-1]["service"] == "http_status:404"


def test_ingress_routes_the_media_tracker_to_the_app_service(compose):
    rules = yaml.safe_load(INGRESS.read_text(encoding="utf-8"))["ingress"]
    media = [r for r in rules if r.get("hostname") == "media.cg1618.com"]
    assert len(media) == 1, "media.cg1618.com should be routed exactly once"
    # Reaches the app over the compose network by service name, on the port
    # entrypoint.sh binds from PORT.
    assert media[0]["service"] == "http://app:8000"
    assert compose["services"]["app"]["environment"]["PORT"] == 8000


def test_ingress_does_not_route_the_sensitive_projects():
    # journal, health and money hold a different class of data, and
    # docs/deployment-selfhost.md requires the Cloudflare Access decision to be
    # made BEFORE an ingress rule exists, not after. This fails the moment one
    # is added without that conversation.
    rules = yaml.safe_load(INGRESS.read_text(encoding="utf-8"))["ingress"]
    hostnames = {r.get("hostname") for r in rules}
    for sensitive in ("journal.cg1618.com", "health.cg1618.com", "money.cg1618.com"):
        assert sensitive not in hostnames
