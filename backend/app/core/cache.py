"""缓存后端抽象：Redis 优先，不可用或关闭时回落到进程内内存。"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger(__name__)


class CacheBackend(Protocol):
    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, *, ex: int | None = None) -> None: ...

    async def delete(self, *keys: str) -> None: ...

    async def exists(self, key: str) -> bool: ...

    async def incr(self, key: str) -> int: ...

    async def expire(self, key: str, seconds: int) -> None: ...

    async def ttl(self, key: str) -> int: ...

    async def close(self) -> None: ...

    @property
    def backend_name(self) -> str: ...


class MemoryCache:
    """测试与 Redis 不可用时的进程内兜底（非跨进程共享）。"""

    def __init__(self) -> None:
        self._store: dict[str, tuple[str, float | None]] = {}
        self._lock = asyncio.Lock()

    @property
    def backend_name(self) -> str:
        return "memory"

    def _purge_expired(self, key: str) -> None:
        item = self._store.get(key)
        if item is None:
            return
        _value, expires_at = item
        if expires_at is not None and expires_at <= time.monotonic():
            del self._store[key]

    async def get(self, key: str) -> str | None:
        async with self._lock:
            self._purge_expired(key)
            item = self._store.get(key)
            return None if item is None else item[0]

    async def set(self, key: str, value: str, *, ex: int | None = None) -> None:
        async with self._lock:
            expires_at = None if ex is None else time.monotonic() + max(ex, 0)
            self._store[key] = (value, expires_at)

    async def delete(self, *keys: str) -> None:
        async with self._lock:
            for key in keys:
                self._store.pop(key, None)

    async def exists(self, key: str) -> bool:
        return await self.get(key) is not None

    async def incr(self, key: str) -> int:
        async with self._lock:
            self._purge_expired(key)
            item = self._store.get(key)
            current = int(item[0]) if item is not None else 0
            current += 1
            expires_at = item[1] if item is not None else None
            self._store[key] = (str(current), expires_at)
            return current

    async def expire(self, key: str, seconds: int) -> None:
        async with self._lock:
            self._purge_expired(key)
            item = self._store.get(key)
            if item is None:
                return
            self._store[key] = (item[0], time.monotonic() + max(seconds, 0))

    async def ttl(self, key: str) -> int:
        async with self._lock:
            self._purge_expired(key)
            item = self._store.get(key)
            if item is None:
                return -2
            _value, expires_at = item
            if expires_at is None:
                return -1
            return max(0, int(expires_at - time.monotonic()))

    async def close(self) -> None:
        async with self._lock:
            self._store.clear()


class RedisCache:
    def __init__(self, client: object) -> None:
        # redis.asyncio.Redis；用 object 避免硬耦合类型检查
        self._client = client

    @property
    def backend_name(self) -> str:
        return "redis"

    async def get(self, key: str) -> str | None:
        value = await self._client.get(key)  # type: ignore[attr-defined]
        if value is None:
            return None
        return value if isinstance(value, str) else value.decode("utf-8")

    async def set(self, key: str, value: str, *, ex: int | None = None) -> None:
        if ex is None:
            await self._client.set(key, value)  # type: ignore[attr-defined]
        else:
            await self._client.set(key, value, ex=max(ex, 1))  # type: ignore[attr-defined]

    async def delete(self, *keys: str) -> None:
        if keys:
            await self._client.delete(*keys)  # type: ignore[attr-defined]

    async def exists(self, key: str) -> bool:
        return bool(await self._client.exists(key))  # type: ignore[attr-defined]

    async def incr(self, key: str) -> int:
        return int(await self._client.incr(key))  # type: ignore[attr-defined]

    async def expire(self, key: str, seconds: int) -> None:
        await self._client.expire(key, max(seconds, 0))  # type: ignore[attr-defined]

    async def ttl(self, key: str) -> int:
        return int(await self._client.ttl(key))  # type: ignore[attr-defined]

    async def close(self) -> None:
        await self._client.aclose()  # type: ignore[attr-defined]


async def create_cache(settings: Settings) -> CacheBackend:
    if not settings.redis_enabled:
        logger.info("Redis disabled; using in-memory cache backend")
        return MemoryCache()

    try:
        from redis.asyncio import Redis

        client = Redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
        )
        await client.ping()
        logger.info("Connected to Redis at %s", settings.redis_url)
        return RedisCache(client)
    except Exception:
        logger.warning(
            "Redis unavailable (%s); falling back to in-memory cache",
            settings.redis_url,
            exc_info=True,
        )
        return MemoryCache()
