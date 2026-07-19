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

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # --- Runtime environment ---
    # Cloud Run auto-sets K_SERVICE; its presence signals the production runtime.
    k_service: Optional[str] = None

    # --- Database ---
    postgres_user: str = "postgres"
    postgres_password: str = "password"
    postgres_db: str = "anime_site_db"
    instance_connection_name: Optional[str] = None  # Cloud SQL unix socket (Cloud Run)
    database_url: Optional[str] = None  # External TCP override

    # --- Auth / JWT ---
    jwt_secret_key: str = "fallback_dev_secret_key_change_me_in_prod"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    admin_password: str = "admin123"

    # --- External metadata APIs ---
    tmdb_api_key: Optional[str] = None
    omdb_api_key: Optional[str] = None

    # --- Google integrations ---
    google_credentials_json: Optional[str] = None
    google_sheet_id: Optional[str] = None
    gcp_bucket_name: Optional[str] = None

    # ------------------------------------------------------------------
    # Derived / computed values
    # ------------------------------------------------------------------
    @property
    def is_cloud_run(self) -> bool:
        """True when running inside Cloud Run (production)."""
        return self.k_service is not None

    @property
    def bucket_name(self) -> Optional[str]:
        """
        Target GCS bucket. Falls back to the internal production bucket when
        running on Cloud Run and none is explicitly configured.
        """
        if self.gcp_bucket_name:
            return self.gcp_bucket_name
        return "cg1618-anime-covers" if self.is_cloud_run else None

    @property
    def sqlalchemy_database_url(self) -> str:
        """
        Builds the SQLAlchemy connection URL with environment-aware routing:
        Cloud SQL unix socket > external TCP override > local development.
        """
        password = urllib.parse.quote_plus(self.postgres_password.strip())

        # Cloud SQL via unix socket (Cloud Run)
        if self.instance_connection_name:
            return (
                f"postgresql+psycopg2://{self.postgres_user}:{password}@/"
                f"{self.postgres_db}?host=/cloudsql/{self.instance_connection_name}"
            )

        # External cloud TCP connection string (ignored if it points at localhost,
        # to prevent a leaked local .env from crashing a Cloud Run container).
        use_local_override = bool(self.database_url and "localhost" in self.database_url)
        if self.database_url and not use_local_override:
            return self.database_url

        # Local development
        return (
            f"postgresql://{self.postgres_user}:{password}"
            f"@localhost:5432/{self.postgres_db}"
        )

    # ------------------------------------------------------------------
    # Startup validation
    # ------------------------------------------------------------------
    def validate_production(self) -> None:
        """
        Fail-fast in production (Cloud Run) if critical secrets are still at
        their insecure development defaults. No-op locally. Call once at startup.
        """
        if not self.is_cloud_run:
            return

        problems = []
        if self.jwt_secret_key == "fallback_dev_secret_key_change_me_in_prod":
            problems.append("JWT_SECRET_KEY is unset (using the insecure default).")
        if self.admin_password == "admin123":
            problems.append("ADMIN_PASSWORD is unset (using the insecure default).")
        if "localhost" in self.sqlalchemy_database_url:
            problems.append(
                "INSTANCE_CONNECTION_NAME is missing (database points at localhost)."
            )

        if problems:
            raise RuntimeError(
                "❌ [CRITICAL] Insecure production configuration detected:\n  - "
                + "\n  - ".join(problems)
            )


@lru_cache
def get_settings() -> Settings:
    """Returns a cached singleton Settings instance."""
    return Settings()


# Import-time singleton used across the app.
settings = get_settings()
