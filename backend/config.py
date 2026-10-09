import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
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


def normalized_database_url(url: str | None = None) -> str:
    """Accept the postgres:// URLs most hosts hand out and use the async driver.

    Hosts such as Neon add libpq options (?sslmode=require&channel_binding=require) that
    asyncpg rejects: it calls the first one `ssl` and has no channel_binding option.
    """
    url = settings.database_url if url is None else url
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    if not url.startswith("postgresql+asyncpg://"):
        return url

    parts = urlsplit(url)
    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            query.append(("ssl", value))
        elif key != "channel_binding":
            query.append((key, value))
    return urlunsplit(parts._replace(query=urlencode(query)))


def public_base_url() -> str:
    """Our public address; Render sets RENDER_EXTERNAL_URL automatically."""
    return (settings.public_base_url or os.getenv("RENDER_EXTERNAL_URL", "")).rstrip("/")


def user_agent() -> str:
    contact = settings.contact_email or os.getenv("CONTACT_EMAIL", "")
    return f"FloodShield/1.0 ({contact})" if contact else "FloodShield/1.0"
