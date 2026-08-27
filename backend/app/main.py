import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.cache import create_cache
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.core.storage import get_storage
from app.db.seed import ensure_tag_library, seed_if_empty
from app.db.session import create_all, create_database
from app.middleware import AuthRateLimitMiddleware, RequestContextMiddleware
from app.services.ranking_scheduler import ranking_scheduler_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    application.state.settings = settings

    database = create_database(settings)
    application.state.database = database

    cache = await create_cache(settings)
    application.state.cache = cache

    get_storage.cache_clear()
    storage = get_storage()
    application.state.storage = storage
    logger.info(
        "app started env=%s cache=%s storage=%s",
        settings.app_env,
        cache.backend_name,
        storage.backend_name,
    )

    # MySQL 正式环境用 Alembic（`uv run alembic upgrade head`）。
    # create_all 仅作测试/临时兜底，避免与 migration 双轨演进。
    if settings.db_auto_create:
        logger.warning(
            "DB_AUTO_CREATE=true：使用 metadata.create_all 兜底建表"
            "（正式环境请改用 Alembic）"
        )
        await create_all(database)

    if settings.db_seed:
        async with database.sessionmaker() as session:
            await seed_if_empty(session)
            # 已有用户库但标签表为空（如迁移后）时补种标签库
            added = await ensure_tag_library(session)
            if added:
                logger.info("seeded tag library count=%s", added)

    scheduler_task = asyncio.create_task(
        ranking_scheduler_loop(application),
        name="ranking-scheduler",
    )

    try:
        yield
    finally:
        scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task
        await cache.close()
        await database.dispose()
        logger.info("app shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings)

    docs_url = None if settings.is_production else "/docs"
    openapi_url = None if settings.is_production else "/api/v1/openapi.json"

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url=docs_url,
        redoc_url=None,
        openapi_url=openapi_url,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    # 后添加 = 更靠外：Request ID 包住限流，限流包住 CORS 内的业务
    application.add_middleware(AuthRateLimitMiddleware)
    application.add_middleware(RequestContextMiddleware)
    register_exception_handlers(application)
    application.include_router(api_router, prefix="/api/v1")

    # 本地存储静态访问：/media/** → STORAGE_LOCAL_ROOT
    if settings.storage_backend.strip().lower() == "local":
        media_root = Path(settings.storage_local_root)
        media_root.mkdir(parents=True, exist_ok=True)
        application.mount(
            "/media",
            StaticFiles(directory=str(media_root.resolve())),
            name="media",
        )

    return application


app = create_app()
