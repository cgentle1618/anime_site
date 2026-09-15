"""The deploy workflow's invariants.

Same bind as the compose and script tests: this file drives a machine CI cannot
reach, so structure is the only thing checkable - which is what makes it worth
checking. Several of these are the difference between a deploy and an incident,
and none of them would fail loudly on the day they were broken.
"""

from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"

DEPLOY_JOBS = ["deploy", "deploy-migration"]


@pytest.fixture(scope="module")
def workflow():
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def body():
    return WORKFLOW.read_text(encoding="utf-8")


def test_it_deploys_only_from_main(workflow):
    # `on` is parsed by PyYAML as the boolean True - YAML 1.1 treats on/off as
    # booleans - so the key is True, not "on". Reading workflow["on"] here
    # returns a KeyError rather than the trigger, which is how a test like this
    # quietly asserts nothing.
    trigger = workflow[True] if True in workflow else workflow["on"]
    assert trigger["push"]["branches"] == ["main"]


@pytest.mark.parametrize("job", DEPLOY_JOBS)
def test_the_deploy_jobs_never_check_out(workflow, job):
    # The runner's workspace is ~/actions-runner/_work/..., and the stack only
    # works from ~/anime_site: that is where .env lives, where static/covers and
    # static/library are bind-mounted, and where COMPOSE_PROJECT_NAME=media
    # decides WHICH VOLUME is the real database. Deploying from the runner's own
    # checkout would come up on a brand-new empty volume while the real data sat
    # in the old one - which looks exactly like data loss and is the same
    # failure CLAUDE.md warns about for worktrees.
    steps = workflow["jobs"][job]["steps"]
    assert not any("actions/checkout" in str(step.get("uses", "")) for step in steps)
    assert all("anime_site" in step.get("run", "") for step in steps)


def test_only_the_deploy_jobs_run_on_the_box(workflow):
    # The box never runs the test suite for anybody. Classification needs only a
    # diff, so it stays on GitHub's runners.
    assert workflow["jobs"]["classify"]["runs-on"] == "ubuntu-latest"
    for job in DEPLOY_JOBS:
        assert "self-hosted" in workflow["jobs"][job]["runs-on"]


def test_the_migration_lane_is_gated_by_an_environment(workflow):
    # The whole of Lane B. Without the environment a schema change reaches
    # production unattended, and `alembic downgrade` is not a restore.
    assert workflow["jobs"]["deploy-migration"]["environment"] == "production"
    # And the ungated lane must NOT carry one, or every deploy needs a tap and
    # the gate stops meaning anything.
    assert "environment" not in workflow["jobs"]["deploy"]


def test_the_two_lanes_are_mutually_exclusive(workflow):
    assert workflow["jobs"]["deploy"]["if"] == "needs.classify.outputs.migration == 'false'"
    assert workflow["jobs"]["deploy-migration"]["if"] == "needs.classify.outputs.migration == 'true'"


def test_the_approval_reaches_the_box(workflow):
    # deploy.sh re-checks for migrations against the box's own HEAD and refuses
    # unless MIGRATION_APPROVED=1. If the gated lane did not set it, an approved
    # migration deploy would be refused ON the box - the gate would be a gate to
    # nowhere.
    steps = workflow["jobs"]["deploy-migration"]["steps"]
    assert any(step.get("env", {}).get("MIGRATION_APPROVED") == "1" for step in steps)
    # The ungated lane must never set it, or the box-side re-check - the only
    # thing covering a runner that was offline across two merges - is disarmed.
    for step in workflow["jobs"]["deploy"]["steps"]:
        assert "MIGRATION_APPROVED" not in step.get("env", {})


@pytest.mark.parametrize("job", DEPLOY_JOBS)
def test_rollback_runs_only_on_a_deploy_that_actually_ran(workflow, job):
    # deploy.sh exits 2 when the deploy ran and is unhealthy, and 1 when it
    # refused to start. A bare `if: failure()` would roll back on a refusal too -
    # taking a working site down to recover from something that never touched
    # it.
    steps = {step["name"]: step for step in workflow["jobs"][job]["steps"]}
    assert steps["Roll back"]["if"] == "failure() && steps.deploy.outputs.rc == '2'"


def test_an_unknown_range_takes_the_gated_lane(body):
    # A zero `before` - first push, force-push, branch created at this sha -
    # means there is no range to diff. Defaulting to "no migrations" would send
    # an unclassifiable deploy down the unattended lane, which is the one
    # outcome this design refuses. An unnecessary approval costs one tap.
    assert "0000000000000000000000000000000000000000" in body
    classify = body[body.index("id: check") : body.index("deploy:")]
    zero_branch = classify[classify.index("0000000000000000000000000000000000000000") :]
    assert zero_branch.index("migration=true") < zero_branch.index("migration=false")


def test_deploys_never_run_concurrently(workflow):
    assert workflow["concurrency"]["group"] == "deploy"
    # Cancelling mid-deploy can leave the box between `git pull` and
    # `up -d --build`, a state no exit code describes and no ladder recovers.
    assert workflow["concurrency"]["cancel-in-progress"] is False
