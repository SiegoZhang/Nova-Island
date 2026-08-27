from fastapi import APIRouter

from app.api.deps import (
    CacheDep,
    CurrentUser,
    CurrentUserOptional,
    DbSession,
    PaginationDep,
    SettingsDep,
)
from app.core.exceptions import AppException
from app.core.roles import is_staff
from app.schemas.common import ApiResponse, PaginatedData, paginate, success_response
from app.schemas.community import ColumnSchema, PostSchema
from app.services import community
from app.services.hot_cache import get_or_set_models

router = APIRouter(prefix="/columns", tags=["columns"])


def _serialize_post(
    post: community.Post,
    *,
    liked: bool = False,
    bookmarked: bool = False,
) -> PostSchema:
    schema = PostSchema.model_validate(post)
    schema.is_liked = liked
    schema.is_bookmarked = bookmarked
    return schema


@router.get("", response_model=ApiResponse[list[ColumnSchema]])
async def list_columns(
    db: DbSession,
    cache: CacheDep,
    settings: SettingsDep,
    _viewer: CurrentUserOptional,
) -> ApiResponse[list[ColumnSchema]]:
    async def loader() -> list[ColumnSchema]:
        rows = await community.list_columns(db)
        return [ColumnSchema.model_validate(row) for row in rows]

    data = await get_or_set_models(
        cache,
        key="cache:columns",
        ttl=settings.cache_ttl_seconds,
        model=ColumnSchema,
        loader=loader,
    )
    return success_response(data)


@router.get("/{column_id}", response_model=ApiResponse[ColumnSchema])
async def get_column(
    column_id: str,
    db: DbSession,
    _viewer: CurrentUser,
) -> ApiResponse[ColumnSchema]:
    row = await community.get_column(db, column_id)
    if row is None:
        raise AppException(code=404006, message="专栏不存在", status_code=404)
    return success_response(ColumnSchema.model_validate(row))


@router.get(
    "/{column_id}/posts",
    response_model=ApiResponse[PaginatedData[PostSchema]],
)
async def list_column_posts(
    column_id: str,
    db: DbSession,
    pagination: PaginationDep,
    viewer: CurrentUser,
) -> ApiResponse[PaginatedData[PostSchema]]:
    column = await community.get_column(db, column_id)
    if column is None:
        raise AppException(code=404006, message="专栏不存在", status_code=404)

    staff = is_staff(viewer.role)
    rows, total = await community.list_posts(
        db,
        page=pagination.page,
        page_size=pagination.page_size,
        column_id=column_id,
        viewer_authenticated=True,
        include_hidden=staff,
    )
    liked, bookmarked = await community.get_post_reaction_flags(
        db, user_id=viewer.id, post_ids=[p.id for p in rows]
    )
    data = paginate(
        [
            _serialize_post(p, liked=p.id in liked, bookmarked=p.id in bookmarked)
            for p in rows
        ],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)
