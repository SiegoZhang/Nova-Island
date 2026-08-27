from __future__ import annotations

from pydantic import Field, field_validator

from app.core.exceptions import AppException
from app.core.password_policy import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    validate_new_password,
)
from app.schemas.common import BaseSchema
from app.schemas.user import CurrentUserSchema

_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
_USERNAME_PATTERN = r"^[a-zA-Z0-9_]+$"


def _coerce_password_policy(value: str) -> str:
    try:
        return validate_new_password(value)
    except AppException as exc:
        raise ValueError(exc.message) from exc


class RegisterRequest(BaseSchema):
    username: str = Field(min_length=3, max_length=32, pattern=_USERNAME_PATTERN)
    email: str = Field(pattern=_EMAIL_PATTERN, max_length=255)
    password: str = Field(
        min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH
    )
    display_name: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _coerce_password_policy(value)


class LoginRequest(BaseSchema):
    # 支持用户名或邮箱登录；口令不做强度校验（兼容历史短密码）
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class RefreshRequest(BaseSchema):
    refresh_token: str


class LogoutRequest(BaseSchema):
    refresh_token: str


class TokenPairSchema(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class AccessTokenSchema(BaseSchema):
    """可暴露给 JavaScript 的短期 access token；refresh 仅存 HttpOnly Cookie。"""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthResponse(BaseSchema):
    user: CurrentUserSchema
    tokens: AccessTokenSchema
