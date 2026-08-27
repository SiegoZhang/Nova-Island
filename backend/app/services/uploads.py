"""上传校验与附件组装（与具体存储后端解耦）。"""

from __future__ import annotations

import uuid

from app.core.config import Settings
from app.core.exceptions import AppException
from app.core.storage import ObjectStorage, StoredObject
from app.models.community import PostAttachment
from app.schemas.community import AttachmentInput

ALLOWED_IMAGE_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    }
)
ALLOWED_FILE_TYPES = frozenset(
    {
        "application/pdf",
        "text/plain",
        "application/zip",
        "application/x-zip-compressed",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
)
ALLOWED_UPLOAD_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_FILE_TYPES


def attachment_kind(content_type: str) -> str:
    return "image" if content_type in ALLOWED_IMAGE_TYPES else "file"


def validate_upload_bytes(
    *,
    data: bytes,
    content_type: str,
    settings: Settings,
) -> str:
    if not data:
        raise AppException(code=400010, message="空文件不能上传", status_code=400)
    normalized = (content_type or "").split(";")[0].strip().lower()
    if normalized not in ALLOWED_UPLOAD_TYPES:
        raise AppException(
            code=400012,
            message="不支持的文件类型（仅图片、PDF、文本、压缩包与常见 Office 文档）",
            status_code=400,
        )
    max_bytes = (
        settings.upload_image_max_bytes
        if normalized in ALLOWED_IMAGE_TYPES
        else settings.upload_max_bytes
    )
    if len(data) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        kind = "图片" if normalized in ALLOWED_IMAGE_TYPES else "文件"
        raise AppException(
            code=400011,
            message=f"{kind}过大，上限 {mb}MB",
            status_code=400,
        )
    return normalized


def stored_to_upload_payload(stored: StoredObject) -> dict[str, object]:
    return {
        "storage_key": stored.key,
        "url": stored.url,
        "original_name": stored.original_name,
        "content_type": stored.content_type,
        "size_bytes": stored.size_bytes,
        "kind": attachment_kind(stored.content_type),
    }


def build_attachments(
    items: list[AttachmentInput],
    *,
    storage: ObjectStorage,
    settings: Settings,
) -> list[PostAttachment]:
    if len(items) > settings.upload_max_attachments_per_post:
        raise AppException(
            code=400013,
            message=f"每帖最多 {settings.upload_max_attachments_per_post} 个附件",
            status_code=400,
        )
    rows: list[PostAttachment] = []
    for index, item in enumerate(items):
        content_type = item.content_type.split(";")[0].strip().lower()
        if content_type not in ALLOWED_UPLOAD_TYPES:
            raise AppException(
                code=400012,
                message="附件包含不支持的文件类型",
                status_code=400,
            )
        if item.size_bytes > settings.upload_max_bytes:
            raise AppException(
                code=400011,
                message="附件大小超出限制",
                status_code=400,
            )
        expected = storage.public_url(key=item.storage_key)
        if item.url != expected and not storage.is_managed_url(item.url):
            raise AppException(
                code=400014,
                message="附件地址无效，请重新上传",
                status_code=400,
            )
        rows.append(
            PostAttachment(
                id=f"att_{uuid.uuid4().hex[:20]}",
                storage_key=item.storage_key,
                url=expected,
                original_name=item.original_name.strip()[:255] or "file",
                content_type=content_type,
                size_bytes=item.size_bytes,
                kind=attachment_kind(content_type),
                sort_order=index,
            )
        )
    return rows
