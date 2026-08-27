import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings

SEED_PASSWORD = "island@2026"


@pytest.fixture(autouse=True)
def _use_sqlite(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    """所有测试统一使用内存 sqlite，并关闭 Redis/限流避免依赖外部服务。"""
    media_root = tmp_path_factory.mktemp("media")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("DB_SEED", "true")
    monkeypatch.setenv("DB_AUTO_CREATE", "true")
    monkeypatch.setenv("REDIS_ENABLED", "false")
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("CACHE_TTL_SECONDS", "60")
    monkeypatch.setenv("RANKING_RECALC_ENABLED", "false")
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("STORAGE_LOCAL_ROOT", str(media_root))
    monkeypatch.setenv("STORAGE_PUBLIC_BASE_URL", "http://testserver/media")
    get_settings.cache_clear()
    from app.core.storage import get_storage

    get_storage.cache_clear()
    yield
    get_settings.cache_clear()
    get_storage.cache_clear()


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login_as(client: TestClient, identifier: str = "leo") -> str:
    payload = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": SEED_PASSWORD},
    ).json()
    return payload["data"]["tokens"]["accessToken"]
