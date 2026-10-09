from config import normalized_database_url, public_base_url
from database import connect_args_for


def test_neon_url_works_with_asyncpg():
    url = normalized_database_url(
        "postgresql://user:p%40ss@ep-x-123.ap-southeast-1.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require"
    )
    assert url == "postgresql+asyncpg://user:p%40ss@ep-x-123.ap-southeast-1.aws.neon.tech/neondb?ssl=require"


def test_other_urls():
    assert normalized_database_url("postgres://u:p@host:5432/db") == "postgresql+asyncpg://u:p@host:5432/db"
    assert normalized_database_url("sqlite+aiosqlite:///./store.db") == "sqlite+aiosqlite:///./store.db"


def test_neon_pooled_url_skips_prepared_statement_cache():
    pooled = normalized_database_url("postgresql://u:p@ep-x-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require")
    args = connect_args_for(pooled)
    assert args["statement_cache_size"] == 0 and args["prepared_statement_cache_size"] == 0
    assert connect_args_for(normalized_database_url("postgresql://u:p@ep-x-123.ap-southeast-1.aws.neon.tech/neondb")) == {}


def test_public_base_url_falls_back_to_render(monkeypatch):
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://floodshield-api.onrender.com/")
    assert public_base_url() == "https://floodshield-api.onrender.com"
