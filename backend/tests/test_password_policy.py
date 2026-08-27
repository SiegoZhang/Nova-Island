"""密码规则：至少 8 位，且含字母与数字。"""

import pytest
from fastapi.testclient import TestClient

from app.core.exceptions import AppException
from app.core.password_policy import validate_new_password
from app.main import create_app


def test_validate_new_password_basic_rules() -> None:
    with pytest.raises(AppException) as short:
        validate_new_password("ab12")
    assert "至少 8" in short.value.message

    with pytest.raises(AppException) as letters_only:
        validate_new_password("abcdefgh")
    assert "字母和数字" in letters_only.value.message

    with pytest.raises(AppException) as digits_only:
        validate_new_password("12345678")
    assert "字母和数字" in digits_only.value.message

    assert validate_new_password("secret123") == "secret123"


def test_register_rejects_password_without_digit() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "nodigit1",
                "email": "nodigit1@example.com",
                "password": "abcdefgh",
                "displayName": "无数字",
            },
        )
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == 422001
    details = payload["data"]["details"]
    assert any("字母和数字" in str(item.get("msg", "")) for item in details)
