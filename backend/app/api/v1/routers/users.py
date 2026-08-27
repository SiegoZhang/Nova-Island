from datetime import datetime, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Query, Response

from app.api.deps import (
    BearerDep,
    CacheDep,
    CurrentUser,
    DbSession,
    PaginationDep,
    RequireAdmin,
    SettingsDep,
)
from app.core.cache import CacheBackend
from app.core.config import Settings
from app.core.exceptions import AppException
from app.core.security import decode_token
from app.core.temp_password import generate_temporary_password
from app.models import User
from app.schemas.common import (
    ApiResponse,
    PaginatedData,
    paginate,
    success_response,
)
from app.schemas.community import PostSchema, UserSummarySchema
from app.schemas.user import (
    AdminCreateUserRequest,
    AdminUserProfileSchema,
    ChangePasswordRequest,
    CurrentUserSchema,
    FollowStateSchema,
    UpdateProfileRequest,
    UpdateUserRoleRequest,
    UpdateUserStatusRequest,
    UserProfileSchema,
)
from app.services import community, token_store
from app.services import user as user_service

router = APIRouter(prefix="/users", tags=["users"])


def _admin_profile(user: User) -> AdminUserProfileSchema:
    profile = AdminUserProfileSchema.model_validate(user)
    profile.has_password = bool(user.password_hash)
    profile.must_change_password = bool(user.must_change_password)
    profile.temporary_password = user.temporary_password
    return profile


def _delete_auth_cookies(response: Response, settings: Settings) -> None:
    cookie_options = {
        "domain": settings.refresh_cookie_domain,
        "secure": settings.should_secure_refresh_cookie,
        "httponly": True,
        "samesite": settings.refresh_cookie_samesite,
    }
    response.delete_cookie(
        key=settings.access_cookie_name,
        path=settings.access_cookie_path,
        **cookie_options,
    )
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        **cookie_options,
    )


async def _deny_access_token(
    cache: CacheBackend,
    settings: Settings,
    access_token: str | None,
) -> None:
    if not access_token:
        return
    try:
        payload = decode_token(settings, access_token)
    except jwt.PyJWTError:
        return
    if payload.get("type") != "access":
        return
    jti = payload.get("jti")
    exp = payload.get("exp")
    if not jti or not isinstance(exp, int):
        return
    await token_store.deny_access_token(
        cache,
        jti=jti,
        expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
    )


@router.get("/me", response_model=ApiResponse[CurrentUserSchema])
async def get_me(current: CurrentUser) -> ApiResponse[CurrentUserSchema]:
    profile = CurrentUserSchema.model_validate(current)
    profile.is_self = True
    return success_response(profile)


@router.get(
    "/me/bookmarks",
    response_model=ApiResponse[PaginatedData[PostSchema]],
)
async def list_my_bookmarks(
    db: DbSession,
    pagination: PaginationDep,
    current: CurrentUser,
) -> ApiResponse[PaginatedData[PostSchema]]:
    rows, total = await community.list_bookmarked_posts(
        db,
        user_id=current.id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    liked, bookmarked = await community.get_post_reaction_flags(
        db, user_id=current.id, post_ids=[p.id for p in rows]
    )
    items: list[PostSchema] = []
    for post in rows:
        schema = PostSchema.model_validate(post)
        schema.is_liked = post.id in liked
        schema.is_bookmarked = post.id in bookmarked
        items.append(schema)
    data = paginate(
        items,
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.get(
    "/me/following/posts",
    response_model=ApiResponse[PaginatedData[PostSchema]],
)
async def list_my_following_posts(
    db: DbSession,
    pagination: PaginationDep,
    current: CurrentUser,
) -> ApiResponse[PaginatedData[PostSchema]]:
    """关注动态：我关注的人发布的帖子。"""
    rows, total = await community.list_following_posts(
        db,
        follower_id=current.id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    liked, bookmarked = await community.get_post_reaction_flags(
        db, user_id=current.id, post_ids=[p.id for p in rows]
    )
    items: list[PostSchema] = []
    for post in rows:
        schema = PostSchema.model_validate(post)
        schema.is_liked = post.id in liked
        schema.is_bookmarked = post.id in bookmarked
        items.append(schema)
    data = paginate(
        items,
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.get(
    "/me/drafts",
    response_model=ApiResponse[PaginatedData[PostSchema]],
)
async def list_my_drafts(
    db: DbSession,
    pagination: PaginationDep,
    current: CurrentUser,
) -> ApiResponse[PaginatedData[PostSchema]]:
    rows, total = await community.list_draft_posts(
        db,
        author_id=current.id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    data = paginate(
        [PostSchema.model_validate(row) for row in rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.patch("/me", response_model=ApiResponse[CurrentUserSchema])
async def update_me(
    body: UpdateProfileRequest,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[CurrentUserSchema]:
    user = await user_service.update_profile(
        db,
        current,
        display_name=body.display_name,
        bio=body.bio,
        avatar_url=body.avatar_url,
    )
    profile = CurrentUserSchema.model_validate(user)
    profile.is_self = True
    return success_response(profile, message="资料已更新")


@router.post("/me/password", response_model=ApiResponse[None])
async def change_my_password(
    response: Response,
    body: ChangePasswordRequest,
    db: DbSession,
    cache: CacheDep,
    settings: SettingsDep,
    current: CurrentUser,
    credentials: BearerDep,
) -> ApiResponse[None]:
    ok = await user_service.change_password(
        db,
        cache,
        current,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    if not ok:
        raise AppException(code=400002, message="当前密码不正确", status_code=400)

    access = credentials.credentials if credentials else None
    await _deny_access_token(cache, settings, access)
    _delete_auth_cookies(response, settings)
    return success_response(None, message="密码已修改，请重新登录")


@router.get("", response_model=ApiResponse[PaginatedData[AdminUserProfileSchema]])
async def list_users(
    db: DbSession,
    pagination: PaginationDep,
    _admin: RequireAdmin,
    q: Annotated[str | None, Query(max_length=64)] = None,
    password_state: Annotated[
        str | None,
        Query(
            description="unset | temporary | set；筛选密码状态",
            pattern="^(unset|temporary|set)$",
        ),
    ] = None,
) -> ApiResponse[PaginatedData[AdminUserProfileSchema]]:
    rows, total = await user_service.list_users(
        db,
        page=pagination.page,
        page_size=pagination.page_size,
        q=q,
        password_state=password_state,
    )
    data = paginate(
        [_admin_profile(row) for row in rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.post("", response_model=ApiResponse[AdminUserProfileSchema], status_code=201)
async def create_user(
    body: AdminCreateUserRequest,
    db: DbSession,
    _admin: RequireAdmin,
) -> ApiResponse[AdminUserProfileSchema]:
    user = await user_service.create_user(
        db,
        username=body.username,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        role=body.role,
    )
    profile = _admin_profile(user)
    profile.is_self = False
    return success_response(profile, message="用户已创建")


@router.get("/{username}", response_model=ApiResponse[UserProfileSchema])
async def get_user_profile(
    username: str,
    db: DbSession,
    viewer: CurrentUser,
) -> ApiResponse[UserProfileSchema]:
    user = await user_service.get_user_by_username(db, username)
    if user is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)

    profile = UserProfileSchema.model_validate(user)
    profile.is_self = viewer.id == user.id
    if not profile.is_self:
        profile.is_following = await user_service.is_following(
            db, viewer.id, user.id
        )
    return success_response(profile)


@router.get(
    "/{username}/posts",
    response_model=ApiResponse[PaginatedData[PostSchema]],
)
async def get_user_posts(
    username: str,
    db: DbSession,
    pagination: PaginationDep,
    viewer: CurrentUser,
    featured: Annotated[bool | None, Query()] = None,
) -> ApiResponse[PaginatedData[PostSchema]]:
    user = await user_service.get_user_by_username(db, username)
    if user is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)

    rows, total = await user_service.list_user_posts(
        db,
        author_id=user.id,
        page=pagination.page,
        page_size=pagination.page_size,
        featured=featured,
    )
    liked, bookmarked = await community.get_post_reaction_flags(
        db, user_id=viewer.id, post_ids=[p.id for p in rows]
    )
    items: list[PostSchema] = []
    for post in rows:
        schema = PostSchema.model_validate(post)
        schema.is_liked = post.id in liked
        schema.is_bookmarked = post.id in bookmarked
        items.append(schema)
    data = paginate(
        items,
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.get(
    "/{username}/bookmarks",
    response_model=ApiResponse[PaginatedData[PostSchema]],
)
async def get_user_bookmarks(
    username: str,
    db: DbSession,
    pagination: PaginationDep,
    viewer: CurrentUser,
) -> ApiResponse[PaginatedData[PostSchema]]:
    """公开收藏：任意登录用户可查看该岛民收藏的已发布帖。"""
    user = await user_service.get_user_by_username(db, username)
    if user is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)

    rows, total = await community.list_bookmarked_posts(
        db,
        user_id=user.id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    liked, bookmarked = await community.get_post_reaction_flags(
        db, user_id=viewer.id, post_ids=[p.id for p in rows]
    )
    items: list[PostSchema] = []
    for post in rows:
        schema = PostSchema.model_validate(post)
        schema.is_liked = post.id in liked
        schema.is_bookmarked = post.id in bookmarked
        items.append(schema)
    data = paginate(
        items,
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.get(
    "/{username}/followers",
    response_model=ApiResponse[PaginatedData[UserSummarySchema]],
)
async def get_user_followers(
    username: str,
    db: DbSession,
    pagination: PaginationDep,
    _viewer: CurrentUser,
) -> ApiResponse[PaginatedData[UserSummarySchema]]:
    user = await user_service.get_user_by_username(db, username)
    if user is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)

    rows, total = await user_service.list_followers(
        db,
        user_id=user.id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    data = paginate(
        [UserSummarySchema.model_validate(row) for row in rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.get(
    "/{username}/following",
    response_model=ApiResponse[PaginatedData[UserSummarySchema]],
)
async def get_user_following(
    username: str,
    db: DbSession,
    pagination: PaginationDep,
    _viewer: CurrentUser,
) -> ApiResponse[PaginatedData[UserSummarySchema]]:
    user = await user_service.get_user_by_username(db, username)
    if user is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)

    rows, total = await user_service.list_following(
        db,
        user_id=user.id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    data = paginate(
        [UserSummarySchema.model_validate(row) for row in rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.post("/{username}/follow", response_model=ApiResponse[FollowStateSchema])
async def follow_user(
    username: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[FollowStateSchema]:
    target = await user_service.get_user_by_username(db, username)
    if target is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)
    if target.id == current.id:
        raise AppException(code=400003, message="不能关注自己", status_code=400)

    await user_service.follow_user(db, current, target)
    return success_response(
        FollowStateSchema(following=True, follower_count=target.follower_count),
        message="已关注",
    )


@router.delete("/{username}/follow", response_model=ApiResponse[FollowStateSchema])
async def unfollow_user(
    username: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[FollowStateSchema]:
    target = await user_service.get_user_by_username(db, username)
    if target is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)

    await user_service.unfollow_user(db, current, target)
    return success_response(
        FollowStateSchema(following=False, follower_count=target.follower_count),
        message="已取消关注",
    )


@router.post(
    "/{username}/password/reset",
    response_model=ApiResponse[AdminUserProfileSchema],
)
async def admin_reset_user_password(
    username: str,
    db: DbSession,
    cache: CacheDep,
    admin: RequireAdmin,
) -> ApiResponse[AdminUserProfileSchema]:
    """管理员重置密码（激活迁入用户 / 忘记密码）。系统生成临时密码供后台查看。"""
    target = await user_service.get_user_by_username(db, username)
    if target is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)
    if target.id == admin.id:
        raise AppException(
            code=400010, message="请使用「账号设置」修改自己的密码", status_code=400
        )

    temporary = generate_temporary_password()
    user = await user_service.admin_reset_password(
        db, cache, target, temporary_password=temporary
    )
    profile = _admin_profile(user)
    profile.is_self = False
    return success_response(
        profile,
        message="已重置密码，请将临时密码告知用户并提醒登录后立即修改",
    )


@router.patch("/{username}/role", response_model=ApiResponse[AdminUserProfileSchema])
async def update_user_role(
    username: str,
    body: UpdateUserRoleRequest,
    db: DbSession,
    admin: RequireAdmin,
) -> ApiResponse[AdminUserProfileSchema]:
    target = await user_service.get_user_by_username(db, username)
    if target is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)
    if target.id == admin.id and body.role != "admin":
        raise AppException(
            code=400005, message="不能取消自己的管理员角色", status_code=400
        )

    user = await user_service.set_user_role(db, target, role=body.role)
    profile = _admin_profile(user)
    profile.is_self = False
    return success_response(profile, message="角色已更新")


@router.patch("/{username}/status", response_model=ApiResponse[AdminUserProfileSchema])
async def update_user_status(
    username: str,
    body: UpdateUserStatusRequest,
    db: DbSession,
    admin: RequireAdmin,
) -> ApiResponse[AdminUserProfileSchema]:
    target = await user_service.get_user_by_username(db, username)
    if target is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)
    if target.id == admin.id and body.status != "active":
        raise AppException(
            code=400006, message="不能停用自己的账号", status_code=400
        )

    user = await user_service.set_user_status(db, target, status=body.status)
    profile = _admin_profile(user)
    profile.is_self = False
    return success_response(profile, message="账号状态已更新")


@router.delete("/{username}", response_model=ApiResponse[AdminUserProfileSchema])
async def delete_user(
    username: str,
    db: DbSession,
    admin: RequireAdmin,
) -> ApiResponse[AdminUserProfileSchema]:
    target = await user_service.get_user_by_username(db, username)
    if target is None:
        raise AppException(code=404002, message="用户不存在", status_code=404)
    if target.id == admin.id:
        raise AppException(
            code=400007, message="不能删除自己的账号", status_code=400
        )
    if target.status == "deactivated" and not target.password_hash:
        raise AppException(code=400008, message="用户已被删除", status_code=400)

    user = await user_service.delete_user(db, target)
    profile = _admin_profile(user)
    profile.is_self = False
    return success_response(profile, message="用户已删除")
