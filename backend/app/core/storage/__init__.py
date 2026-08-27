"""对象存储工厂。业务层只依赖 ObjectStorage 协议，不耦合本地/S3。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.core.config import Settings, get_settings
from app.core.storage.base import ObjectStorage, StoredObject
from app.core.storage.local import LocalObjectStorage


def create_storage(settings: Settings) -> ObjectStorage:
    backend = settings.storage_backend.strip().lower()
    if backend == "local":
        return LocalObjectStorage(
            root=Path(settings.storage_local_root),
            public_base_url=settings.storage_public_base_url,
        )
    if backend == "s3":
        from app.core.storage.s3 import S3ObjectStorage

        public = (
            settings.storage_s3_public_base_url
            or settings.storage_public_base_url
        )
        return S3ObjectStorage(
            bucket=settings.storage_s3_bucket,
            region=settings.storage_s3_region,
            public_base_url=public,
            endpoint_url=settings.storage_s3_endpoint_url,
            access_key=settings.storage_s3_access_key,
            secret_key=settings.storage_s3_secret_key,
            prefix=settings.storage_s3_prefix,
        )
    raise ValueError(
        f"Unsupported STORAGE_BACKEND={settings.storage_backend!r}; "
        "use 'local' or 's3'"
    )


@lru_cache
def get_storage() -> ObjectStorage:
    return create_storage(get_settings())


__all__ = [
    "ObjectStorage",
    "StoredObject",
    "create_storage",
    "get_storage",
]
