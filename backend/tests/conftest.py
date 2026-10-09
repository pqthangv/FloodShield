import asyncio
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["ADMIN_TOKEN"] = "test-admin"

# Tests use a throwaway SQLite file by default. Set TEST_DATABASE_URL to run them against
# PostgreSQL instead (as the CI does); that database is emptied at the start of every run.
_test_db = os.getenv("TEST_DATABASE_URL")
if _test_db:
    os.environ["DATABASE_URL"] = _test_db

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from config import normalized_database_url

    async def _empty_database():
        engine = create_async_engine(normalized_database_url(_test_db))
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
        await engine.dispose()

    asyncio.run(_empty_database())
else:
    _tmp = tempfile.mkdtemp(prefix="floodshield-test-")
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(_tmp) / 'test.db'}"
