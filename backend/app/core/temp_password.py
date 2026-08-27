"""管理员重置用的临时密码生成（满足本站强度策略）。"""

from __future__ import annotations

import secrets
import string

from app.core.exceptions import AppException
from app.core.password_policy import validate_new_password

_ALPHABET = string.ascii_letters + string.digits


def generate_temporary_password(*, length: int = 12) -> str:
    if length < 8:
        length = 8
    while True:
        candidate = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        try:
            return validate_new_password(candidate)
        except AppException:
            continue
