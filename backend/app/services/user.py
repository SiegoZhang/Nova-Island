from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheBackend
from app.core.exceptions import AppException
from app.core.security import hash_password, verify_password
from app.models import Follow, Post, RefreshToken, User
from app.services import token_store


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    return await db.scalar(select(User).where(User.username == username))


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email))


async def get_user_by_identifier(db: AsyncSession, identifier: str) -> User | None:
    return await db.scalar(
        select(User).where(or_(User.username == identifier, User.email == identifier))
    )


async def create_user(
    db: AsyncSession,
    *,
    username: str,
    email: str,
    password: str,
    display_name: str | None = None,
    role: str = "member",
) -> User:
    """管理员代建用户；不签发 token。"""
    if await get_user_by_username(db, username):
        raise AppException(code=409001, message="用户名已被使用", status_code=409)
    if await get_user_by_email(db, email):
        raise AppException(code=409002, message="邮箱已被注册", status_code=409)

    user = User(
        id=f"u_{uuid.uuid4().hex[:20]}",
        username=username,
        email=email,
        password_hash=hash_password(password),
        display_name=display_name or username,
        role=role,
        status="active",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_profile(
    db: AsyncSession,
    user: User,
    *,
    display_name: str | None = None,
    bio: str | None = None,
    avatar_url: str | None = None,
) -> User:
    if display_name is not None:
        user.display_name = display_name
    if bio is not None:
        user.bio = bio
    if avatar_url is not None:
        user.avatar_url = avatar_url
    await db.commit()
    await db.refresh(user)
    return user


async def change_password(
    db: AsyncSession,
    cache: CacheBackend,
    user: User,
    *,
    current_password: str,
    new_password: str,
) -> bool:
    """修改密码并吊销该用户全部 refresh 会话。

    返回 False 表示当前密码不正确。
    新密码与当前密码相同时抛出 AppException(400003)。
    """
    if not user.password_hash or not verify_password(
        current_password, user.password_hash
    ):
        return False
    if verify_password(new_password, user.password_hash):
        raise AppException(
            code=400003,
            message="新密码不能与当前密码相同",
            status_code=400,
        )
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.temporary_password = None

    tokens = (
        await db.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked.is_(False),
            )
        )
    ).all()
    for token in tokens:
        token.revoked = True
        await token_store.revoke_refresh_session(
            cache, jti=token.jti, expires_at=_as_utc(token.expires_at)
        )

    await db.commit()
    return True


async def admin_reset_password(
    db: AsyncSession,
    cache: CacheBackend,
    user: User,
    *,
    temporary_password: str,
) -> User:
    """管理员重置密码：写入哈希与可查看临时密码，并强制下次改密。"""
    if user.status == "deactivated":
        raise AppException(
            code=400009, message="已注销用户不能重置密码", status_code=400
        )
    user.password_hash = hash_password(temporary_password)
    user.temporary_password = temporary_password
    user.must_change_password = True

    tokens = (
        await db.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked.is_(False),
            )
        )
    ).all()
    for token in tokens:
        token.revoked = True
        await token_store.revoke_refresh_session(
            cache, jti=token.jti, expires_at=_as_utc(token.expires_at)
        )

    await db.commit()
    await db.refresh(user)
    return user


async def is_following(db: AsyncSession, follower_id: str, following_id: str) -> bool:
    row = await db.get(Follow, (follower_id, following_id))
    return row is not None


async def follow_user(db: AsyncSession, follower: User, target: User) -> bool:
    """返回是否新建立关注（幂等）。"""
    if follower.id == target.id:
        return False
    if await is_following(db, follower.id, target.id):
        return False

    db.add(Follow(follower_id=follower.id, following_id=target.id))
    target.follower_count += 1
    follower.following_count += 1
    from app.services.notifications import queue_notification

    queue_notification(
        db,
        recipient_id=target.id,
        actor_id=follower.id,
        type="follow",
    )
    await db.commit()
    return True


async def unfollow_user(db: AsyncSession, follower: User, target: User) -> bool:
    row = await db.get(Follow, (follower.id, target.id))
    if row is None:
        return False

    await db.delete(row)
    target.follower_count = max(0, target.follower_count - 1)
    follower.following_count = max(0, follower.following_count - 1)
    await db.commit()
    return True


async def set_user_role(db: AsyncSession, user: User, *, role: str) -> User:
    user.role = role
    await db.commit()
    await db.refresh(user)
    return user


async def set_user_status(db: AsyncSession, user: User, *, status: str) -> User:
    user.status = status
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user: User) -> User:
    """软删除：注销账号、吊销会话、释放用户名/邮箱以便再次注册。

    保留用户行与历史内容外键；不可硬删（帖子/评论等大量引用）。
    """
    from app.models import RefreshToken

    if user.status == "deactivated" and not user.password_hash:
        return user

    original_username = user.username
    suffix = uuid.uuid4().hex[:8]
    # 用户名最长 32：del_ + 8 hex + _ + 截断原名
    kept = original_username[:18]
    user.username = f"del_{suffix}_{kept}"
    user.email = None
    user.password_hash = None
    user.temporary_password = None
    user.must_change_password = False
    user.display_name = "已删除用户"
    user.avatar_url = None
    user.bio = None
    user.status = "deactivated"
    user.role = "member"

    tokens = (
        await db.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked.is_(False),
            )
        )
    ).all()
    for token in tokens:
        token.revoked = True

    await db.commit()
    await db.refresh(user)
    return user


async def list_users(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    q: str | None = None,
    password_state: str | None = None,
) -> tuple[list[User], int]:
    """管理员用户列表；可选按用户名/昵称与密码状态筛选。"""
    base = select(User)
    if q:
        keyword = f"%{q.strip()}%"
        base = base.where(
            or_(User.username.ilike(keyword), User.display_name.ilike(keyword))
        )
    if password_state == "unset":
        base = base.where(User.password_hash.is_(None))
    elif password_state == "temporary":
        base = base.where(
            User.password_hash.is_not(None),
            User.must_change_password.is_(True),
        )
    elif password_state == "set":
        base = base.where(
            User.password_hash.is_not(None),
            User.must_change_password.is_(False),
        )
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (
        await db.scalars(
            base.order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)


async def list_user_posts(
    db: AsyncSession,
    *,
    author_id: str,
    page: int,
    page_size: int,
    featured: bool | None = None,
) -> tuple[list[Post], int]:
    base = select(Post).where(
        Post.author_id == author_id,
        Post.status == "published",
    )
    if featured is not None:
        base = base.where(Post.is_featured.is_(featured))
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    ordered = base.order_by(
        Post.published_at.is_(None),
        Post.published_at.desc(),
        Post.created_at.desc(),
    )
    rows = (
        await db.scalars(ordered.offset((page - 1) * page_size).limit(page_size))
    ).all()
    return list(rows), int(total or 0)


async def list_followers(
    db: AsyncSession, *, user_id: str, page: int, page_size: int
) -> tuple[list[User], int]:
    """关注该用户的人，按关注时间倒序。"""
    filters = (Follow.following_id == user_id,)
    total = await db.scalar(
        select(func.count()).select_from(Follow).where(*filters)
    )
    rows = (
        await db.scalars(
            select(User)
            .join(Follow, Follow.follower_id == User.id)
            .where(*filters)
            .order_by(Follow.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)


async def list_following(
    db: AsyncSession, *, user_id: str, page: int, page_size: int
) -> tuple[list[User], int]:
    """该用户关注的人，按关注时间倒序。"""
    filters = (Follow.follower_id == user_id,)
    total = await db.scalar(
        select(func.count()).select_from(Follow).where(*filters)
    )
    rows = (
        await db.scalars(
            select(User)
            .join(Follow, Follow.following_id == User.id)
            .where(*filters)
            .order_by(Follow.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)
