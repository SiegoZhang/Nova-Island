from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.core.config import Settings


@dataclass(slots=True)
class Database:
    """封装引擎与会话工厂，挂载到 app.state 便于测试替换。"""

    engine: AsyncEngine
    sessionmaker: async_sessionmaker[AsyncSession]

    async def dispose(self) -> None:
        await self.engine.dispose()


def create_database(settings: Settings) -> Database:
    url = settings.sqlalchemy_url
    is_sqlite = url.startswith("sqlite")

    if is_sqlite and ":memory:" in url:
        # 内存 sqlite 需共享单一连接，供异步会话与 TestClient 复用
        engine = create_async_engine(
            url,
            echo=settings.db_echo,
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        engine = create_async_engine(
            url,
            echo=settings.db_echo,
            future=True,
            pool_pre_ping=True,
        )

    factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
        autoflush=False,
    )
    return Database(engine=engine, sessionmaker=factory)


async def create_all(database: Database) -> None:
    from app.db.base import Base

    async with database.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def session_scope(database: Database) -> AsyncIterator[AsyncSession]:
    async with database.sessionmaker() as session:
        yield session
