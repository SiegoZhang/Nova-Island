from collections.abc import AsyncIterator
from typing import Annotated

import jwt
from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheBackend
from app.core.config import Settings, get_settings
from app.core.exceptions import AppException
from app.core.roles import ROLE_ADMIN, ROLE_MODERATOR
from app.core.security import decode_token
from app.db.session import Database
from app.models import User
from app.services import token_store

SettingsDep = Annotated[Settings, Depends(get_settings)]

_bearer_scheme = HTTPBearer(auto_error=False)
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)]


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    database: Database = request.app.state.database
    async with database.sessionmaker() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]


def get_cache(request: Request) -> CacheBackend:
    return request.app.state.cache


CacheDep = Annotated[CacheBackend, Depends(get_cache)]


async def _resolve_user(
    request: Request,
    settings: Settings,
    db: AsyncSession,
    cache: CacheBackend,
    credentials: HTTPAuthorizationCredentials | None,
) -> User | None:
    token = credentials.credentials if credentials else None
    if not token and request.method in {"GET", "HEAD"}:
        token = request.cookies.get(settings.access_cookie_name)
    if not token:
        return None
    try:
        payload = decode_token(settings, token)
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    jti = payload.get("jti")
    if jti and await token_store.is_access_denied(cache, jti):
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await db.get(User, user_id)


def _password_change_allowed(request: Request) -> bool:
    """强制改密期间仅允许查自己、改密、登出与 refresh。"""
    path = request.url.path.rstrip("/")
    method = request.method.upper()
    if method in {"GET", "HEAD"} and path.endswith("/users/me"):
        return True
    if method == "POST" and path.endswith("/users/me/password"):
        return True
    if method == "POST" and path.endswith("/auth/logout"):
        return True
    return method == "POST" and path.endswith("/auth/refresh")


async def get_current_user(
    request: Request,
    settings: SettingsDep,
    db: DbSession,
    cache: CacheDep,
    credentials: BearerDep,
) -> User:
    user = await _resolve_user(request, settings, db, cache, credentials)
    if user is None:
        raise AppException(
            code=401000, message="未认证或登录状态已失效", status_code=401
        )
    if user.status != "active":
        raise AppException(code=403002, message="账号已被停用", status_code=403)
    if user.must_change_password and not _password_change_allowed(request):
        raise AppException(
            code=403004,
            message="请先修改临时密码后再使用社区功能",
            status_code=403,
        )
    return user


async def get_current_user_optional(
    request: Request,
    settings: SettingsDep,
    db: DbSession,
    cache: CacheDep,
    credentials: BearerDep,
) -> User | None:
    return await _resolve_user(request, settings, db, cache, credentials)


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentUserOptional = Annotated[User | None, Depends(get_current_user_optional)]


class RoleChecker:
    """依赖注入：要求当前用户具备指定角色之一。"""

    def __init__(self, *roles: str) -> None:
        self.roles = frozenset(roles)

    async def __call__(self, user: CurrentUser) -> User:
        if user.role not in self.roles:
            raise AppException(
                code=403001, message="无权执行该操作", status_code=403
            )
        return user


RequireStaff = Annotated[
    User, Depends(RoleChecker(ROLE_MODERATOR, ROLE_ADMIN))
]
RequireAdmin = Annotated[User, Depends(RoleChecker(ROLE_ADMIN))]


class PaginationParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


PaginationDep = Annotated[PaginationParams, Depends()]
