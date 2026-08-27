"""短 TTL JSON 缓存辅助。"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import TypeVar

from pydantic import BaseModel

from app.core.cache import CacheBackend

T = TypeVar("T", bound=BaseModel)


async def get_or_set_models(
    cache: CacheBackend,
    *,
    key: str,
    ttl: int,
    model: type[T],
    loader: Callable[[], Awaitable[list[T]]],
) -> list[T]:
    if ttl > 0:
        raw = await cache.get(key)
        if raw is not None:
            try:
                payload = json.loads(raw)
                if isinstance(payload, list):
                    return [model.model_validate(item) for item in payload]
            except (json.JSONDecodeError, ValueError):
                await cache.delete(key)

    items = await loader()
    if ttl > 0:
        encoded = json.dumps(
            [item.model_dump(mode="json", by_alias=True) for item in items],
            ensure_ascii=False,
        )
        await cache.set(key, encoded, ex=ttl)
    return items
