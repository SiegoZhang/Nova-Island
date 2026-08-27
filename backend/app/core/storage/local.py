"""本地文件系统对象存储。"""

from __future__ import annotations

import asyncio
import mimetypes
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.core.storage.base import StoredObject

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    base = Path(name).name.strip() or "file"
    cleaned = _SAFE_NAME.sub("_", base).strip("._") or "file"
    return cleaned[:180]


class LocalObjectStorage:
    """文件落在本地目录，经 FastAPI /media 静态挂载对外提供。"""

    backend_name = "local"

    def __init__(self, *, root: Path, public_base_url: str) -> None:
        self.root = root.resolve()
        self.public_base_url = public_base_url.rstrip("/")
        self.root.mkdir(parents=True, exist_ok=True)

    def _key_path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not str(path).startswith(str(self.root)):
            raise ValueError("invalid_storage_key")
        return path

    def _build_key(self, original_name: str) -> str:
        day = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        suffix = Path(original_name).suffix.lower()[:16]
        return f"{day}/{uuid.uuid4().hex}{suffix}"

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
        storage_key = key or self._build_key(original_name)
        path = self._key_path(storage_key)
        path.parent.mkdir(parents=True, exist_ok=True)

        def _write() -> None:
            path.write_bytes(data)

        await asyncio.to_thread(_write)
        guessed = content_type or mimetypes.guess_type(original_name)[0] or (
            "application/octet-stream"
        )
        return StoredObject(
            key=storage_key,
            url=self.public_url(key=storage_key),
            content_type=guessed,
            size_bytes=len(data),
            original_name=_safe_filename(original_name),
        )

    async def delete(self, *, key: str) -> None:
        path = self._key_path(key)

        def _unlink() -> None:
            if path.is_file():
                path.unlink()

        await asyncio.to_thread(_unlink)
