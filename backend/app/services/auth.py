from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheBackend
from app.core.config import Settings
from app.core.exceptions import AppException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import TokenPairSchema
from app.services import token_store
from app.services import user as user_service


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def _issue_token_pair(
    db: AsyncSession,
    settings: Settings,
    cache: CacheBackend,
    user: User,
) -> TokenPairSchema:
    access_token, _, _ = create_access_token(settings, user.id)
    refresh_token, jti, expires_at = create_refresh_token(settings, user.id)

    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires_at))
    await db.commit()
    await token_store.store_refresh_session(
        cache, jti=jti, user_id=user.id, expires_at=expires_at
    )

    return TokenPairSchema(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )


async def register(
    db: AsyncSession,
    settings: Settings,
    cache: CacheBackend,
    *,
    username: str,
    email: str,
    password: str,
    display_name: str | None,
) -> tuple[User, TokenPairSchema]:
    if await user_service.get_user_by_username(db, username):
        raise AppException(code=409001, message="用户名已被使用", status_code=409)
    if await user_service.get_user_by_email(db, email):
        raise AppException(code=409002, message="邮箱已被注册", status_code=409)

    user = User(
        id=f"u_{uuid.uuid4().hex[:20]}",
        username=username,
        email=email,
        password_hash=hash_password(password),
        display_name=display_name or username,
        role="member",
        status="active",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    tokens = await _issue_token_pair(db, settings, cache, user)
    return user, tokens


async def authenticate(db: AsyncSession, *, identifier: str, password: str) -> User:
    user = await user_service.get_user_by_identifier(db, identifier)
    if user is None:
        raise AppException(code=401001, message="账号或密码错误", status_code=401)
    if not user.password_hash:
        raise AppException(
            code=401004,
            message="该账号尚未设置密码，请联系管理员在后台重置后再登录",
            status_code=401,
        )
    if not verify_password(password, user.password_hash):
        raise AppException(code=401001, message="账号或密码错误", status_code=401)
    if user.status != "active":
        raise AppException(code=403002, message="账号已被停用", status_code=403)
    return user


async def login(
    db: AsyncSession,
    settings: Settings,
    cache: CacheBackend,
    *,
    identifier: str,
    password: str,
) -> tuple[User, TokenPairSchema]:
    user = await authenticate(db, identifier=identifier, password=password)
    tokens = await _issue_token_pair(db, settings, cache, user)
    return user, tokens


async def refresh(
    db: AsyncSession,
    settings: Settings,
    cache: CacheBackend,
    *,
    refresh_token: str,
) -> tuple[User, TokenPairSchema]:
    try:
        payload = decode_token(settings, refresh_token)
    except jwt.PyJWTError as exc:
        raise AppException(
            code=401002, message="刷新令牌无效或已过期", status_code=401
        ) from exc

    if payload.get("type") != "refresh":
        raise AppException(code=401003, message="令牌类型错误", status_code=401)

    jti = payload.get("jti")
    if not jti:
        raise AppException(
            code=401004, message="刷新令牌已失效，请重新登录", status_code=401
        )

    if await token_store.is_refresh_denied(cache, jti):
        raise AppException(
            code=401004, message="刷新令牌已失效，请重新登录", status_code=401
        )

    record = await db.get(RefreshToken, jti)
    if record is None or record.revoked:
        await token_store.revoke_refresh_session(cache, jti=jti)
        raise AppException(
            code=401004, message="刷新令牌已失效，请重新登录", status_code=401
        )

    expires_at = _as_utc(record.expires_at)
    if expires_at < datetime.now(timezone.utc):
        raise AppException(code=401002, message="刷新令牌已过期", status_code=401)

    user = await user_service.get_user_by_id(db, record.user_id)
    if user is None:
        raise AppException(code=401001, message="用户不存在", status_code=401)

    # 轮换：吊销旧 refresh token，签发新的一对
    record.revoked = True
    await db.commit()
    await token_store.revoke_refresh_session(
        cache, jti=jti, expires_at=expires_at
    )
    tokens = await _issue_token_pair(db, settings, cache, user)
    return user, tokens


async def logout(
    db: AsyncSession,
    settings: Settings,
    cache: CacheBackend,
    *,
    refresh_token: str,
    access_token: str | None = None,
) -> None:
    try:
        payload = decode_token(settings, refresh_token)
    except jwt.PyJWTError:
        payload = None

    if payload and payload.get("type") == "refresh":
        jti = payload.get("jti")
        record = await db.get(RefreshToken, jti) if jti else None
        if record is not None and not record.revoked:
            record.revoked = True
            await db.commit()
            await token_store.revoke_refresh_session(
                cache, jti=record.jti, expires_at=_as_utc(record.expires_at)
            )
        elif jti:
            exp = payload.get("exp")
            expires_at = (
                datetime.fromtimestamp(exp, tz=timezone.utc)
                if isinstance(exp, int)
                else None
            )
            await token_store.revoke_refresh_session(
                cache, jti=jti, expires_at=expires_at
            )

    if not access_token:
        return
    try:
        access_payload = decode_token(settings, access_token)
    except jwt.PyJWTError:
        return
    if access_payload.get("type") != "access":
        return
    access_jti = access_payload.get("jti")
    exp = access_payload.get("exp")
    if not access_jti or not isinstance(exp, int):
        return
    await token_store.deny_access_token(
        cache,
        jti=access_jti,
        expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
    )
