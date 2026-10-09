import logging
import os
from uuid import uuid4
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from config import normalized_database_url

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

database_url = normalized_database_url()

# Render sets RENDER=true. Its disk is wiped on every deploy and restart, so a SQLite file there
# would silently lose every post: refuse to start instead.
if os.getenv("RENDER") and database_url.startswith("sqlite"):
    raise RuntimeError("DATABASE_URL is not set. Add the Neon connection string under Render > Environment.")


def connect_args_for(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    if "-pooler." in (make_url(url).host or ""):
        # Neon's pooled address goes through PgBouncer, which doesn't keep asyncpg's cached
        # prepared statements between transactions. Use one-off statements instead.
        return {
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        }
    return {}


# Create the database engine
engine = create_async_engine(database_url, connect_args=connect_args_for(database_url), pool_pre_ping=True)
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine, class_=AsyncSession, expire_on_commit=False
)
Base = declarative_base()


# Dependency to get the database session
async def get_db():
    async with SessionLocal() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()
