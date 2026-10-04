import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """App settings, read from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./store.db"
    # Required for /api/v1/admin/* endpoints. Admin endpoints are disabled when empty.
    admin_token: str = ""
    # Public base URL of this API (e.g. https://floodshield-api.onrender.com). Used to build
    # absolute image URLs; when empty the request's own host is used.
    public_base_url: str = ""
    # Sent in the User-Agent to OpenStreetMap services, as their usage policy requires.
    contact_email: str = ""

    # Community moderation
    report_hide_threshold: int = 3
    max_posts_per_hour: int = 5
    max_upload_mb: int = 8


settings = Settings()


def normalized_database_url() -> str:
    """Accept the postgres:// URLs most hosts hand out and use the async driver."""
    url = settings.database_url
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


def user_agent() -> str:
    contact = settings.contact_email or os.getenv("CONTACT_EMAIL", "")
    return f"FloodShield/1.0 ({contact})" if contact else "FloodShield/1.0"
