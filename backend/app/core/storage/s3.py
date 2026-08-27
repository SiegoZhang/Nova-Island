"""S3 兼容对象存储扩展点（AWS S3 / MinIO）。

切换方式：
1. 设置 STORAGE_BACKEND=s3
2. 配置 STORAGE_S3_* 环境变量
3. 安装可选依赖：`uv add boto3`

当前为可运行骨架：接口与本地后端一致，便于后续接入而不改业务层。
"""

from __future__ import annotations

import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.storage.base import StoredObject


class S3ObjectStorage:
    """S3 兼容后端。未安装 boto3 或未配齐密钥时，put/delete 会给出明确错误。"""

    backend_name = "s3"

    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        public_base_url: str,
        endpoint_url: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        prefix: str = "",
    ) -> None:
        if not bucket.strip():
            raise ValueError("STORAGE_S3_BUCKET is required when STORAGE_BACKEND=s3")
        if not public_base_url.strip():
            raise ValueError(
                "STORAGE_S3_PUBLIC_BASE_URL (or STORAGE_PUBLIC_BASE_URL) "
                "is required when STORAGE_BACKEND=s3"
            )
        self.bucket = bucket
        self.region = region
        self.endpoint_url = endpoint_url or None
        self.access_key = access_key or None
        self.secret_key = secret_key or None
        self.prefix = prefix.strip("/")
        self.public_base_url = public_base_url.rstrip("/")
        self._client: Any | None = None

    def _client_or_raise(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import boto3
        except ImportError as exc:  # pragma: no cover - optional dep
            raise RuntimeError(
                "S3 storage requires boto3. Install with: uv add boto3"
            ) from exc

        kwargs: dict[str, Any] = {"region_name": self.region}
        if self.endpoint_url:
            kwargs["endpoint_url"] = self.endpoint_url
        if self.access_key and self.secret_key:
            kwargs["aws_access_key_id"] = self.access_key
            kwargs["aws_secret_access_key"] = self.secret_key
        self._client = boto3.client("s3", **kwargs)
        return self._client

    def _build_key(self, original_name: str) -> str:
        day = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        suffix = Path(original_name).suffix.lower()[:16]
        name = f"{day}/{uuid.uuid4().hex}{suffix}"
        return f"{self.prefix}/{name}" if self.prefix else name

    def public_url(self, *, key: str) -> str:
        return f"{self.public_base_url}/{key.lstrip('/')}"

    def is_managed_url(self, url: str) -> bool:
        return url.startswith(f"{self.public_base_url}/")

    async def put(
        self,
        *,
        data: bytes,
        content_type: str,
        original_name: str,
        key: str | None = None,
    ) -> StoredObject:
        import asyncio

        client = self._client_or_raise()
        storage_key = key or self._build_key(original_name)
        guessed = content_type or mimetypes.guess_type(original_name)[0] or (
            "application/octet-stream"
        )

        def _upload() -> None:
            client.put_object(
                Bucket=self.bucket,
                Key=storage_key,
                Body=data,
                ContentType=guessed,
            )

        await asyncio.to_thread(_upload)
        return StoredObject(
            key=storage_key,
            url=self.public_url(key=storage_key),
            content_type=guessed,
            size_bytes=len(data),
            original_name=Path(original_name).name[:180] or "file",
        )

    async def delete(self, *, key: str) -> None:
        import asyncio

        client = self._client_or_raise()

        def _delete() -> None:
            client.delete_object(Bucket=self.bucket, Key=key)

        await asyncio.to_thread(_delete)
