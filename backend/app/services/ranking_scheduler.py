"""进程内日更调度：每天固定时刻重算榜单（无 Celery 时的轻量方案）。"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import FastAPI

from app.services.ranking import ensure_rankings_populated, recalculate_rankings

logger = logging.getLogger(__name__)


def _seconds_until_next_run(
    *,
    hour: int,
    minute: int,
    tz_name: str,
) -> float:
    tz = ZoneInfo(tz_name)
    now = datetime.now(tz)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return max(1.0, (target - now).total_seconds())


async def ranking_scheduler_loop(application: FastAPI) -> None:
    settings = application.state.settings
    if not settings.ranking_recalc_enabled:
        logger.info("ranking scheduler disabled")
        return

    # 启动时仅补齐空周期，避免覆盖 seed 手工榜
    try:
        database = application.state.database
        cache = application.state.cache
        async with database.sessionmaker() as session:
            filled = await ensure_rankings_populated(
                session,
                cache=cache,
                top_n=settings.ranking_top_n,
            )
        if filled:
            logger.info("ranking empty periods filled counts=%s", filled)
    except Exception:
        logger.exception("ranking ensure on startup failed")

    while True:
        delay = _seconds_until_next_run(
            hour=settings.ranking_recalc_hour,
            minute=settings.ranking_recalc_minute,
            tz_name=settings.ranking_recalc_timezone,
        )
        logger.info(
            "ranking scheduler sleep_seconds=%.0f next=%02d:%02d %s",
            delay,
            settings.ranking_recalc_hour,
            settings.ranking_recalc_minute,
            settings.ranking_recalc_timezone,
        )
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            raise

        try:
            database = application.state.database
            cache = application.state.cache
            async with database.sessionmaker() as session:
                counts = await recalculate_rankings(
                    session,
                    top_n=settings.ranking_top_n,
                    cache=cache,
                )
            logger.info("ranking daily recalc done counts=%s", counts)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("ranking daily recalc failed")
