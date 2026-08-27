"""新密码规则：至少 8 位，且同时包含字母与数字。"""

from __future__ import annotations

import re

from app.core.exceptions import AppException

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

PASSWORD_HINT = "至少 8 位，需同时包含字母和数字"


def validate_new_password(password: str) -> str:
    """校验新密码；通过则返回原字符串，失败抛 AppException。"""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise AppException(
            code=422010,
            message=f"密码至少 {PASSWORD_MIN_LENGTH} 位",
            status_code=422,
        )
    if len(password) > PASSWORD_MAX_LENGTH:
        raise AppException(
            code=422011,
            message=f"密码最多 {PASSWORD_MAX_LENGTH} 位",
            status_code=422,
        )
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise AppException(
            code=422012,
            message="密码需同时包含字母和数字",
            status_code=422,
        )
    return password
