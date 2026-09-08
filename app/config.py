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
    # Derived / computed values
    # ------------------------------------------------------------------
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
