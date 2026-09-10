"""
The production signal, and the secret check that deliberately ignores it.

Two separate ideas, split on purpose:

- `APP_ENV` says which runtime this is, and drives environment-specific
  hardening (today, the login cookie's `secure` flag). It defaults to
  **production**, against the Rails/Django/Laravel convention and with
  ASP.NET Core's: a dev machine that forgets it fails loudly and locally
  (the browser drops a `secure` cookie over plain HTTP, so login stops
  working), while a public box that forgets it would fail silently and
  dangerously. The loud failure is the one worth having.
- The default-secret check runs in **both** modes, following Django's
  `SECRET_KEY`, which raises whether or not `DEBUG` is set. `validate_production()`
  used to be gated on Cloud Run and therefore never fired locally; gating a
  secret check on the environment is how it comes to never fire at all.
"""

import pytest

from app.config import (
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_JWT_SECRET_KEY,
    ENV_DEVELOPMENT,
    ENV_PRODUCTION,
    Settings,
)


def _settings(**overrides) -> Settings:
    """
    A Settings built without reading this machine's .env.

    `_env_file=None` matters: the developer running these tests has real
    secrets in .env, so a Settings that read it would never see the defaults
    the checks below exist to reject.
    """
    values = {
        "jwt_secret_key": "a-real-secret",
        "admin_password": "a-real-password",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


# --- the signal -----------------------------------------------------------


def test_app_env_defaults_to_production(monkeypatch):
    """
    The fail-safe direction. A machine that says nothing is treated as the
    exposed one, so forgetting the variable cannot quietly downgrade the box.

    The variable is removed from the environment as well as the .env file:
    tests/conftest.py pins APP_ENV=development for the suite, so a Settings
    that still saw os.environ would be asserting that pin rather than the
    code's own default.
    """
    monkeypatch.delenv("APP_ENV", raising=False)
    assert _settings().app_env == ENV_PRODUCTION


def test_is_development_is_true_only_in_development():
    assert _settings(app_env=ENV_DEVELOPMENT).is_development is True
    assert _settings(app_env=ENV_PRODUCTION).is_development is False


def test_an_unknown_app_env_is_rejected():
    """
    A typo must not resolve to "not development" and silently harden a dev
    machine, nor to "not production" and silently soften a real one.
    """
    with pytest.raises(ValueError):
        _settings(app_env="prod")


# --- the secret check -----------------------------------------------------


def test_the_shipped_jwt_secret_is_refused():
    settings = _settings(jwt_secret_key=DEFAULT_JWT_SECRET_KEY)
    with pytest.raises(RuntimeError) as excinfo:
        settings.validate_secrets()
    assert "JWT_SECRET_KEY" in str(excinfo.value)


def test_the_shipped_admin_password_is_refused():
    settings = _settings(admin_password=DEFAULT_ADMIN_PASSWORD)
    with pytest.raises(RuntimeError) as excinfo:
        settings.validate_secrets()
    assert "ADMIN_PASSWORD" in str(excinfo.value)


def test_both_defaults_are_reported_together():
    """One boot, one message: fixing the first must not reveal the second."""
    settings = _settings(
        jwt_secret_key=DEFAULT_JWT_SECRET_KEY,
        admin_password=DEFAULT_ADMIN_PASSWORD,
    )
    with pytest.raises(RuntimeError) as excinfo:
        settings.validate_secrets()
    message = str(excinfo.value)
    assert "JWT_SECRET_KEY" in message
    assert "ADMIN_PASSWORD" in message


def test_the_check_is_not_gated_on_the_environment():
    """
    The whole point. `validate_production()` returned early unless it was on
    Cloud Run, so it never once ran on a developer's machine - and a default
    secret is not more acceptable in development now that a second person can
    hold an account.
    """
    settings = _settings(
        app_env=ENV_DEVELOPMENT, jwt_secret_key=DEFAULT_JWT_SECRET_KEY
    )
    with pytest.raises(RuntimeError):
        settings.validate_secrets()


def test_real_secrets_pass_in_both_modes():
    for env in (ENV_DEVELOPMENT, ENV_PRODUCTION):
        _settings(app_env=env).validate_secrets()


def test_the_message_never_prints_the_offending_value():
    """
    A startup error goes to logs, a terminal and possibly a screenshot. It
    names the variable; it does not quote what the variable holds.
    """
    settings = _settings(
        jwt_secret_key=DEFAULT_JWT_SECRET_KEY,
        admin_password=DEFAULT_ADMIN_PASSWORD,
    )
    with pytest.raises(RuntimeError) as excinfo:
        settings.validate_secrets()
    message = str(excinfo.value)
    assert DEFAULT_JWT_SECRET_KEY not in message
    assert DEFAULT_ADMIN_PASSWORD not in message
