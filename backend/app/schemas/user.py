from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.core.exceptions import AppException
from app.core.password_policy import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    validate_new_password,
)
from app.schemas.common import BaseSchema, ORMSchema


def _coerce_password_policy(value: str) -> str:
    try:
        return validate_new_password(value)
    except AppException as exc:
        raise ValueError(exc.message) from exc


class UserProfileSchema(ORMSchema):
    """公开用户资料（含浏览者视角的关注状态）。"""

    id: str
    username: str
    display_name: str
    avatar_url: str | None = None
    bio: str | None = None
    role: str
    status: str
    follower_count: int
    following_count: int
    post_count: int
    is_following: bool = False
    is_self: bool = False
    created_at: datetime
    updated_at: datetime


class CurrentUserSchema(UserProfileSchema):
    """当前登录用户，额外暴露私有字段。"""

    email: str | None = None
    must_change_password: bool = False


class AdminUserProfileSchema(UserProfileSchema):
    """管理后台用户资料：密码激活相关字段仅管理员可见。"""

    has_password: bool = False
    must_change_password: bool = False
    temporary_password: str | None = None


class UpdateProfileRequest(BaseSchema):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    bio: str | None = Field(default=None, max_length=300)
    avatar_url: str | None = Field(default=None, max_length=512)


class ChangePasswordRequest(BaseSchema):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: str = Field(
        min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    )

    @field_validator("new_password")
    @classmethod
    def new_password_strength(cls, value: str) -> str:
        return _coerce_password_policy(value)


class FollowStateSchema(BaseSchema):
    following: bool
    follower_count: int


class UpdateUserRoleRequest(BaseSchema):
    role: str = Field(pattern="^(member|moderator|admin)$")


class UpdateUserStatusRequest(BaseSchema):
    status: str = Field(pattern="^(active|suspended|deactivated)$")


_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
_USERNAME_PATTERN = r"^[a-zA-Z0-9_]+$"


class AdminCreateUserRequest(BaseSchema):
    """管理员代建账号；不签发登录会话。"""

    username: str = Field(min_length=3, max_length=32, pattern=_USERNAME_PATTERN)
    email: str = Field(pattern=_EMAIL_PATTERN, max_length=255)
    password: str = Field(
        min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    )
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    role: str = Field(default="member", pattern="^(member|moderator|admin)$")

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _coerce_password_policy(value)
