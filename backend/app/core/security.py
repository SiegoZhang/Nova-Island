from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt

from app.core.config import Settings

# 密码哈希：pbkdf2_sha256（Django 风格，零原生依赖）。
# 生产可平滑替换为 bcrypt / argon2，接口保持不变。
_PBKDF2_ALGORITHM = "pbkdf2_sha256"
_PBKDF2_ITERATIONS = 240_000
_SALT_BYTES = 16

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS
    )
    return f"{_PBKDF2_ALGORITHM}${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_raw, salt_hex, digest_hex = encoded.split("$")
    except ValueError:
        return False
    if algorithm != _PBKDF2_ALGORITHM:
        return False

    iterations = int(iterations_raw)
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(candidate, expected)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _create_token(
    settings: Settings,
    *,
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
) -> tuple[str, str, datetime]:
    """返回 (token, jti, expires_at)。"""
    jti = uuid.uuid4().hex
    expires_at = _now() + expires_delta
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "jti": jti,
        "iat": int(_now().timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def create_access_token(settings: Settings, subject: str) -> tuple[str, str, datetime]:
    return _create_token(
        settings,
        subject=subject,
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(settings: Settings, subject: str) -> tuple[str, str, datetime]:
    return _create_token(
        settings,
        subject=subject,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(settings: Settings, token: str) -> dict[str, Any]:
    """解码并校验 JWT，失败抛出 jwt.PyJWTError 子类。"""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )
