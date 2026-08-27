"""生产环境密钥 / 启动开关守卫 + Request ID。"""

import json
import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.logging import JsonFormatter, setup_logging
from app.main import create_app


def _production_kwargs(**overrides: object) -> dict:
    base: dict = {
        "_env_file": None,
        "app_env": "production",
        "jwt_secret": "prod-grade-secret-key-32chars-min!!",
        "mysql_password": "S3cure-db-passw0rd",
        "db_auto_create": False,
        "db_seed": False,
        "seed_default_password": "prod-seed-password-not-demo",
        "cors_origins": ["https://novaisland.example"],
        "redis_enabled": False,
        "rate_limit_enabled": False,
    }
    base.update(overrides)
    return base


def test_development_defaults_still_load() -> None:
    settings = Settings(_env_file=None, app_env="development")
    assert not settings.is_production
    assert settings.jwt_secret.startswith("change-me")


def test_production_rejects_default_jwt_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(
            **_production_kwargs(
                jwt_secret="change-me-in-production-please-use-a-long-random-secret"
            )
        )


def test_production_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(**_production_kwargs(jwt_secret="too-short-secret"))


def test_production_rejects_weak_mysql_password() -> None:
    with pytest.raises(ValidationError):
        Settings(**_production_kwargs(mysql_password="123456"))


def test_production_rejects_db_seed_and_auto_create() -> None:
    with pytest.raises(ValidationError):
        Settings(**_production_kwargs(db_seed=True))
    with pytest.raises(ValidationError):
        Settings(**_production_kwargs(db_auto_create=True))


def test_production_rejects_wildcard_cors() -> None:
    with pytest.raises(ValidationError):
        Settings(**_production_kwargs(cors_origins=["*"]))


def test_production_requires_secure_refresh_cookie() -> None:
    with pytest.raises(ValidationError):
        Settings(**_production_kwargs(refresh_cookie_secure=False))


def test_samesite_none_requires_secure_cookie_in_every_environment() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            app_env="development",
            refresh_cookie_samesite="none",
            refresh_cookie_secure=False,
        )


def test_production_accepts_strong_config() -> None:
    settings = Settings(**_production_kwargs())
    assert settings.is_production
    assert settings.should_log_json is True
    assert settings.should_secure_refresh_cookie is True


def test_log_json_explicit_override() -> None:
    settings = Settings(
        _env_file=None,
        app_env="development",
        log_json=True,
    )
    assert settings.should_log_json is True


def test_json_formatter_includes_request_fields() -> None:
    record = logging.LogRecord(
        name="app.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="GET /health -> 200",
        args=(),
        exc_info=None,
    )
    record.method = "GET"
    record.path = "/api/v1/health"
    record.statusCode = 200
    record.durationMs = 1.23
    payload = json.loads(JsonFormatter().format(record))
    assert payload["level"] == "INFO"
    assert payload["method"] == "GET"
    assert payload["path"] == "/api/v1/health"
    assert payload["statusCode"] == 200


def test_request_id_generated_and_echoed() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers.get("x-request-id")
    assert len(response.headers["x-request-id"]) >= 16


def test_request_id_passthrough() -> None:
    with TestClient(create_app()) as client:
        response = client.get(
            "/api/v1/health",
            headers={"X-Request-ID": "client-trace-abc123"},
        )
    assert response.headers.get("x-request-id") == "client-trace-abc123"


def test_setup_logging_json_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_JSON", "true")
    get_settings.cache_clear()
    settings = get_settings()
    setup_logging(settings)
    root = logging.getLogger()
    assert root.handlers
    assert isinstance(root.handlers[0].formatter, JsonFormatter)
    get_settings.cache_clear()
