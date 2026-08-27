"""对象存储抽象：本地与后续 S3/MinIO 共用同一接口。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class StoredObject:
    """一次写入后的对象元数据。"""

    key: str
    url: str
    content_type: str
    size_bytes: int
    original_name: str


class ObjectStorage(Protocol):
    """可替换的对象存储后端。"""

    backend_name: str

    async def put(
        self,
        *,
        data: bytes,
        content_type: str,
        original_name: str,
        key: str | None = None,
    ) -> StoredObject:
        """写入对象，返回可公开访问的 URL 与 storage key。"""

    async def delete(self, *, key: str) -> None:
        """按 key 删除；key 不存在时静默成功。"""

    def public_url(self, *, key: str) -> str:
        """由 storage key 推导公开 URL。"""

    def is_managed_url(self, url: str) -> bool:
        """判断 URL 是否由本后端签发（防任意外链冒充附件）。"""
