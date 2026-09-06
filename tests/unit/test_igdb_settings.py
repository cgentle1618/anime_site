"""IGDB credentials are optional, like every other API key."""

from pathlib import Path

from app.config import Settings


def test_credentials_default_to_none():
    """
    An unset key degrades to a logged no-op rather than a boot failure -
    validate_production() deliberately does not check API keys.
    """
    settings = Settings(_env_file=None)
    assert settings.igdb_client_id is None
    assert settings.igdb_client_secret is None


def test_env_example_documents_both():
    text = Path(".env.example").read_text(encoding="utf-8")
    assert "IGDB_CLIENT_ID=" in text
    assert "IGDB_CLIENT_SECRET=" in text
