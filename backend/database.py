import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from config import normalized_database_url

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

database_url = normalized_database_url()

# Create the database engine
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
engine = create_async_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
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
