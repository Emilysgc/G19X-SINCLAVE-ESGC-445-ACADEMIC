"""Motor async de SQLAlchemy. PostgreSQL en producción (SQLite solo para pruebas locales)."""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    pass


if settings.is_postgresql:
    _kwargs: dict = {"pool_size": 10, "max_overflow": 20, "pool_pre_ping": True, "pool_recycle": 300}
else:
    _kwargs = {"connect_args": {"check_same_thread": False}}

engine = create_async_engine(settings.DATABASE_URL, echo=False, **_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    from app import models  # noqa: F401  (registra tablas)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
