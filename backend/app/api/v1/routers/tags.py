from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, PaginationDep, RequireAdmin
from app.core.exceptions import AppException
from app.schemas.common import (
    ApiResponse,
    PaginatedData,
    paginate,
    success_response,
)
from app.schemas.community import (
    CreateTagRequest,
    TagSchema,
    UpdateTagRequest,
)
from app.services import tag as tag_service

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=ApiResponse[list[TagSchema]])
async def list_tags(
    db: DbSession,
    _viewer: CurrentUser,
) -> ApiResponse[list[TagSchema]]:
    """发帖用标签库（仅库内名称可选）。"""
    rows = await tag_service.list_tags(db)
    return success_response([TagSchema.model_validate(row) for row in rows])


@router.get(
    "/manage",
    response_model=ApiResponse[PaginatedData[TagSchema]],
)
async def manage_list_tags(
    db: DbSession,
    pagination: PaginationDep,
    _admin: RequireAdmin,
    q: Annotated[str | None, Query(max_length=64)] = None,
) -> ApiResponse[PaginatedData[TagSchema]]:
    rows = await tag_service.list_tags(db)
    if q and q.strip():
        keyword = q.strip().lower()
        rows = [row for row in rows if keyword in row.name.lower()]
    total = len(rows)
    start = (pagination.page - 1) * pagination.page_size
    page_rows = rows[start : start + pagination.page_size]
    data = paginate(
        [TagSchema.model_validate(row) for row in page_rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.post("", response_model=ApiResponse[TagSchema], status_code=201)
async def create_tag(
    body: CreateTagRequest,
    db: DbSession,
    _admin: RequireAdmin,
) -> ApiResponse[TagSchema]:
    try:
        tag = await tag_service.create_tag(
            db, name=body.name, sort_order=body.sort_order
        )
    except ValueError as exc:
        code = str(exc)
        if code == "duplicate_name":
            raise AppException(
                code=409001, message="标签名称已存在", status_code=409
            ) from exc
        if code in {"empty_name", "name_too_long"}:
            raise AppException(
                code=400001, message="标签名称不合法", status_code=400
            ) from exc
        raise
    return success_response(TagSchema.model_validate(tag), message="标签已创建")


@router.patch("/{tag_id}", response_model=ApiResponse[TagSchema])
async def update_tag(
    tag_id: str,
    body: UpdateTagRequest,
    db: DbSession,
    _admin: RequireAdmin,
) -> ApiResponse[TagSchema]:
    tag = await tag_service.get_tag(db, tag_id)
    if tag is None:
        raise AppException(code=404010, message="标签不存在", status_code=404)
    try:
        tag = await tag_service.update_tag(
            db, tag, name=body.name, sort_order=body.sort_order
        )
    except ValueError as exc:
        code = str(exc)
        if code == "duplicate_name":
            raise AppException(
                code=409001, message="标签名称已存在", status_code=409
            ) from exc
        if code in {"empty_name", "name_too_long"}:
            raise AppException(
                code=400001, message="标签名称不合法", status_code=400
            ) from exc
        raise
    return success_response(TagSchema.model_validate(tag), message="标签已更新")


@router.delete("/{tag_id}", response_model=ApiResponse[None])
async def delete_tag(
    tag_id: str,
    db: DbSession,
    _admin: RequireAdmin,
) -> ApiResponse[None]:
    tag = await tag_service.get_tag(db, tag_id)
    if tag is None:
        raise AppException(code=404010, message="标签不存在", status_code=404)
    await tag_service.delete_tag(db, tag)
    return success_response(None, message="标签已删除")
