"""文件上传：写入当前 ObjectStorage，返回可挂到帖子的元数据。"""

from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, UploadFile

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.core.exceptions import AppException
from app.core.storage import get_storage
from app.schemas.common import ApiResponse, success_response
from app.schemas.community import UploadResultSchema
from app.services.image_processing import process_upload_image
from app.services.uploads import (
    ALLOWED_IMAGE_TYPES,
    stored_to_upload_payload,
    validate_upload_bytes,
)

router = APIRouter(prefix="/uploads", tags=["uploads"])

UploadPurpose = Literal["default", "avatar"]


def _with_extension(filename: str, extension: str) -> str:
    stem = Path(filename or "image").stem or "image"
    return f"{stem}{extension}"


@router.post("", response_model=ApiResponse[UploadResultSchema])
async def upload_file(
    _current: CurrentUser,
    file: Annotated[UploadFile, File(description="图片或附件")],
    purpose: Annotated[UploadPurpose, Form()] = "default",
) -> ApiResponse[UploadResultSchema]:
    settings = get_settings()
    storage = get_storage()
    data = await file.read()
    content_type = validate_upload_bytes(
        data=data,
        content_type=file.content_type or "",
        settings=settings,
    )
    original_name = file.filename or "file"

    if content_type in ALLOWED_IMAGE_TYPES:
        if purpose not in {"default", "avatar"}:
            purpose = "default"
        processed = process_upload_image(data, purpose=purpose)
        data = processed.data
        content_type = processed.content_type
        original_name = _with_extension(original_name, processed.extension)

    try:
        stored = await storage.put(
            data=data,
            content_type=content_type,
            original_name=original_name,
        )
    except Exception as exc:  # noqa: BLE001 — 转为业务错误
        raise AppException(
            code=500010,
            message="文件存储失败，请稍后重试",
            status_code=500,
            details=str(exc),
        ) from exc

    payload = stored_to_upload_payload(stored)
    return success_response(
        UploadResultSchema.model_validate(payload),
        message="上传成功",
    )
