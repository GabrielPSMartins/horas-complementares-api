import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from config.settings import settings


logger = logging.getLogger(__name__)


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def check_database_connection() -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True

    except Exception:
        logger.exception("database_health_check_failed")
        return False