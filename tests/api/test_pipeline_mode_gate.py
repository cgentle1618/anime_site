"""Pipelines are gated on the ROLE alone. The access mode does not apply.

Decision 14 used to add a second gate: a pipeline ran only from a session
whose mode carried every content label and field group. The stated reason was
that a per-viewer filter would write a PARTIAL sheet over the complete one.

That reason does not hold, because **no pipeline is viewer-aware**.
`execute_backup` reads `db.query(tab.model).all()`, `runner.py` reads
`db.query(spec.model).all()`, and `calculation.py` says outright that Calculate
"is a pipeline with no viewer". `entry_visible` and `hidden_label_ids` are
called only from the entry routers, never from anything these two routers
reach. A narrowed session therefore wrote exactly the same complete sheet as a
wide one; the gate refused requests without changing a single byte of output.

So the mode is a ceiling on what a session SEES, and a pipeline does not read
through it. Role decides: `admin` and `super` hold `manage.pipelines` and may
run a pipeline from any mode they happen to be sitting in.

WHAT THIS GIVES UP, deliberately. The gate also closed an existence oracle for
free: `POST /api/data-control/replace/anime/{id}` answers 404 for a missing
entry and 200 "Successfully updated <display_name>." for one hidden by a
label, which is a write, an existence oracle and a title leak in one answer.
That route is now reachable from a narrowed session again. The leak is to an
account that already holds `manage.pipelines` - `admin` or `super` - about
entries in its own installation, and a mode is a self-imposed view ceiling
rather than a boundary against the person who chose it. See
test_replace_one_on_a_hidden_entry_is_reachable_again below, which pins the
behaviour so the next reader finds it stated rather than discovering it.
"""

import pytest

from app.services.rbac.seed_modes import (
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)

# Routes declared literally on the two pipeline routers. The per-type Fill and
# Replace routes are registered in a loop over PIPELINES, which is why the
# role gate stays on the ROUTER and not on individual handlers.
PIPELINE_ROUTES = [
    ("post", "/api/data-control/backup"),
    ("post", "/api/data-control/pull"),
    ("post", "/api/data-control/replace/all"),
]

SYSTEM_ROUTES = [
    ("get", "/api/system/config/current_season"),
]


@pytest.fixture(autouse=True)
def _no_real_pipelines(monkeypatch):
    """Stub the two pipelines that would otherwise reach Google Sheets.

    Every assertion here is about the GATE, which runs as a dependency before
    any handler body. The stubs let the "reaches the handler" cases prove they
    got past it without a network round trip.
    """
    import app.routers.data_control as dc

    monkeypatch.setattr(dc, "execute_backup", lambda *a, **k: {"status": "stubbed"})
    monkeypatch.setattr(dc, "execute_pull_all", lambda *a, **k: {"status": "stubbed"})


@pytest.mark.parametrize("method,path", PIPELINE_ROUTES)
@pytest.mark.parametrize("session_mode", [MODE_SAFE, MODE_NORMAL, MODE_UNRESTRICTED])
def test_a_pipeline_runs_from_any_mode(mode_client, nsfw_label, method, path, session_mode):
    """`safe` and `normal` carry neither the nsfw label nor, for safe, every
    field group - and it makes no difference, because the pipeline does not
    read through the mode.

    nsfw_label is load-bearing, not decoration: without a label in the
    database every mode carries "all" of an empty set, so the narrow cases
    would be vacuously wide and this test would pass against the old gate too.
    """
    assert getattr(mode_client(session_mode), method)(path).status_code != 401


@pytest.mark.parametrize("method,path", SYSTEM_ROUTES)
@pytest.mark.parametrize("session_mode", [MODE_SAFE, MODE_UNRESTRICTED])
def test_the_system_router_runs_from_any_mode_too(
    mode_client, nsfw_label, method, path, session_mode
):
    """system.py carried the same gate for the same stated reason, and its
    routes - season config, logs, deleted records - read no entries at all."""
    assert getattr(mode_client(session_mode), method)(path).status_code != 401


def test_the_role_gate_still_refuses_an_account_without_the_permission(user_client):
    """Removing the mode gate does not remove the capability gate. An ordinary
    account may not run a pipeline from ANY mode - this is the refusal that
    still has to bite."""
    assert user_client.post("/api/data-control/backup").status_code == 401


def test_super_may_run_a_pipeline_from_its_default_mode(super_client):
    """The case that started this: `super` holds manage.pipelines, so Backup
    works without first widening the session."""
    assert super_client.post("/api/data-control/backup").status_code != 401


def test_replace_one_on_a_hidden_entry_is_reachable_again(
    mode_client, nsfw_label, hidden_anime
):
    """The cost of the change, pinned rather than left to be discovered.

    The old mode gate closed this oracle for free. Without it, a narrowed
    session that holds manage.pipelines reaches the route and the response
    distinguishes a hidden entry from a missing one. Accepted: the caller is
    `admin` or `super` either way, and the mode is their own view ceiling.

    If this ever needs closing, close it where it lives - an entry_visible
    check in the replace-one handler - not by gating the whole router on a
    mode that no pipeline reads.
    """
    response = mode_client(MODE_NORMAL).post(
        f"/api/data-control/replace/anime/{hidden_anime.system_id}"
    )
    assert response.status_code != 401
