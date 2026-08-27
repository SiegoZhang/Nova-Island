"""Token 会话与黑名单（Redis / 内存缓存）。

MySQL `refresh_tokens` 仍是持久化真相；缓存用于：
- 活跃 refresh 会话索引（快速存在性）
- 已吊销 refresh / access 的 denylist（logout / 轮换后即时失效）
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.core.cache import CacheBackend

REFRESH_SESSION_PREFIX = "auth:refresh:"
REFRESH_DENY_PREFIX = "auth:denylist:refresh:"
ACCESS_DENY_PREFIX = "auth:denylist:access:"


def _ttl_seconds(expires_at: datetime) -> int:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    remaining = int((expires_at - datetime.now(timezone.utc)).total_seconds())
    return max(remaining, 1)


async def store_refresh_session(
    cache: CacheBackend,
    *,
    jti: str,
    user_id: str,
    expires_at: datetime,
) -> None:
    await cache.set(
        f"{REFRESH_SESSION_PREFIX}{jti}",
        user_id,
        ex=_ttl_seconds(expires_at),
    )


async def revoke_refresh_session(
    cache: CacheBackend,
    *,
    jti: str,
    expires_at: datetime | None = None,
) -> None:
    key = f"{REFRESH_SESSION_PREFIX}{jti}"
    deny_key = f"{REFRESH_DENY_PREFIX}{jti}"
    ttl = _ttl_seconds(expires_at) if expires_at is not None else await cache.ttl(key)
    if ttl < 1:
        ttl = 60
    await cache.delete(key)
    await cache.set(deny_key, "1", ex=ttl)


async def is_refresh_denied(cache: CacheBackend, jti: str) -> bool:
    return await cache.exists(f"{REFRESH_DENY_PREFIX}{jti}")


async def deny_access_token(
    cache: CacheBackend,
    *,
    jti: str,
    expires_at: datetime,
) -> None:
    await cache.set(
        f"{ACCESS_DENY_PREFIX}{jti}",
        "1",
        ex=_ttl_seconds(expires_at),
    )


async def is_access_denied(cache: CacheBackend, jti: str) -> bool:
    return await cache.exists(f"{ACCESS_DENY_PREFIX}{jti}")
