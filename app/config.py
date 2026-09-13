"""
config.py
Centralized application configuration using pydantic-settings.

Single source of truth for every environment variable. Replaces the scattered
os.getenv() reads and duplicated load_dotenv() calls that previously lived in
database.py, security.py, dependencies.py, auth.py, main.py, and the service
modules. Import `settings` from here instead of reading os.environ directly.
"""

import urllib.parse
from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- The production signal -------------------------------------------------
# Which runtime this is. A named environment variable is the standard
# mechanism - Laravel and Symfony spell it APP_ENV exactly, Rails has
# RAILS_ENV, ASP.NET Core ASPNETCORE_ENVIRONMENT - and it drives
# environment-specific hardening rather than being deduced per request. The
# login cookie's `secure` flag is the only thing reading it today.
ENV_DEVELOPMENT = "development"
ENV_PRODUCTION = "production"
APP_ENVIRONMENTS = (ENV_DEVELOPMENT, ENV_PRODUCTION)

# The values .env.example used to ship live. They are named here so the check
# below and its tests share one definition, and so that changing a default
# without changing the check is impossible.
DEFAULT_JWT_SECRET_KEY = "fallback_dev_secret_key_change_me_in_prod"
DEFAULT_ADMIN_PASSWORD = "admin123"


class Settings(BaseSettings):
    """
    Application settings, populated from environment variables (and a local
    .env file for development). Field names map case-insensitively to env vars,
    e.g. `postgres_user` <- POSTGRES_USER.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Runtime ---
    # Defaults to production, which is the minority convention - Rails, Django,
    # Laravel and Node all default to development - and deliberately so. It is
    # the direction that fails loudly: a dev machine that forgets APP_ENV sets
    # a Secure cookie over plain HTTP, the browser drops it, and login stops
    # working on the machine you are sitting at. The opposite default lets a
    # public box run with an insecure cookie and say nothing, which is the
    # failure this whole change exists to end. ASP.NET Core makes the same
    # choice for the same reason.
    app_env: str = ENV_PRODUCTION

    # --- Database ---
    postgres_user: str = "postgres"
    postgres_password: str = "password"
    postgres_db: str = "anime_site_db"
    database_url: Optional[str] = None  # Full connection string override

    # --- Auth / JWT ---
    jwt_secret_key: str = "fallback_dev_secret_key_change_me_in_prod"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    admin_password: str = "admin123"

    # --- Image uploads ---
    # A cap on what one upload may weigh, checked twice: against the declared
    # Content-Length, and again while the body is streamed. The header is a
    # claim from the client and cannot be the only check.
    max_image_upload_mb: int = 10

    # --- External metadata APIs ---
    tmdb_api_key: Optional[str] = None
    omdb_api_key: Optional[str] = None
    comicvine_api_key: Optional[str] = None
    # IGDB needs two: a Twitch client id and secret, exchanged for a bearer
    # token that expires. Every other integration here uses a static key.
    igdb_client_id: Optional[str] = None
    igdb_client_secret: Optional[str] = None
    # Steam is two services. The storefront (prices, Metacritic, achievement
    # totals) needs no credential at all; only the personal-progress calls do,
    # and they degrade to a logged no-op when either of these is unset.
    steam_api_key: Optional[str] = None
    steam_id: Optional[str] = None
    # A kill switch for both halves at once. Steam is the one integration whose
    # hosts sit behind TLS inspection on some networks, where even a refused
    # connection is a logged connection; STEAM_ENABLED=false stops the traffic
    # at the transport instead of relying on nobody pressing Fill.
    steam_enabled: bool = True

    # --- Google Sheets (backup / restore) ---
    google_credentials_json: Optional[str] = None
    google_sheet_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    @field_validator("app_env")
    @classmethod
    def _known_environment(cls, value: str) -> str:
        """
        Reject a typo rather than resolving it.

        `APP_ENV=prod` is not production, and an unvalidated field would read it
        as "not development" and harden a dev machine - or, with the comparison
        the other way round, soften a real one. Neither failure announces
        itself, so the value is checked instead of interpreted.
        """
        normalised = value.strip().lower()
        if normalised not in APP_ENVIRONMENTS:
            raise ValueError(
                f"APP_ENV must be one of {', '.join(APP_ENVIRONMENTS)}; "
                f"got {value!r}."
            )
        return normalised

    def validate_secrets(self) -> None:
        """
        Refuse to start on a secret that is still the shipped default.

        Called from the lifespan in app/main.py, and deliberately **not** gated
        on `app_env`. Django's SECRET_KEY raises whether or not DEBUG is set,
        for the reason this codebase learned the hard way: the previous check,
        `validate_production()`, returned early unless it was running on Cloud
        Run, so it never fired on a developer's machine and then left with the
        GCP code without anyone noticing it had gone. A default secret has no
        legitimate use in any environment, least of all now that a second
        person can hold an account.

        Both problems are reported at once - fixing the first must not be the
        way you discover the second - and neither message quotes the offending
        value, because a startup error reaches logs, terminals and screenshots.
        """
        problems = []
        if self.jwt_secret_key == DEFAULT_JWT_SECRET_KEY:
            problems.append(
                "JWT_SECRET_KEY is still the example value. Anyone holding it "
                "can mint a valid admin session cookie."
            )
        if self.admin_password == DEFAULT_ADMIN_PASSWORD:
            problems.append(
                "ADMIN_PASSWORD is still the example value. It seeds the "
                "master account on first boot."
            )

        if problems:
            raise RuntimeError(
                "Refusing to start: insecure configuration.\n  - "
                + "\n  - ".join(problems)
                + "\nSet real values in .env (see .env.example)."
            )

    # ------------------------------------------------------------------
    # Derived / computed values
    # ------------------------------------------------------------------
    @property
    def is_development(self) -> bool:
        """
        True only on a development runtime.

        Phrased as "is development" rather than "is production" so that any
        future environment name added to APP_ENVIRONMENTS is treated as a real
        one by default, and gets the hardening rather than escaping it.
        """
        return self.app_env == ENV_DEVELOPMENT

    @property
    def sqlalchemy_database_url(self) -> str:
        """
        The SQLAlchemy connection URL: DATABASE_URL when set, otherwise a local
        connection assembled from the POSTGRES_* parts.
        """
        if self.database_url:
            return self.database_url

        password = urllib.parse.quote_plus(self.postgres_password.strip())
        return (
            f"postgresql://{self.postgres_user}:{password}"
            f"@localhost:5432/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Returns a cached singleton Settings instance."""
    return Settings()


# Import-time singleton used across the app.
settings = get_settings()
