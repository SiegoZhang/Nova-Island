"""管理后台专用接口（RequireAdmin）。"""

from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.api.deps import DbSession, PaginationDep, RequireAdmin
from app.schemas.common import ApiResponse, PaginatedData, paginate, success_response
from app.schemas.community import PostSchema
from app.services import community

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/posts", response_model=ApiResponse[PaginatedData[PostSchema]])
async def list_admin_posts(
    db: DbSession,
    pagination: PaginationDep,
    _admin: RequireAdmin,
    status: Annotated[
        Literal["hidden", "published"],
        Query(description="队列状态：hidden=待恢复，published=已发布"),
    ] = "hidden",
    featured: Annotated[bool | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> ApiResponse[PaginatedData[PostSchema]]:
    """内容审核队列：列出已隐藏或已发布帖，供后台集中处理。"""
    rows, total = await community.list_admin_posts(
        db,
        page=pagination.page,
        page_size=pagination.page_size,
        status=status,
        featured=featured,
        q=q,
    )
    data = paginate(
        [PostSchema.model_validate(post) for post in rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)
