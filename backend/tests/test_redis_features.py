from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app

SEED_PASSWORD = "island@2026"


def _login(client: TestClient) -> dict:
    return client.post(
        "/api/v1/auth/login",
        json={"identifier": "leo", "password": SEED_PASSWORD},
    ).json()["data"]


def test_logout_denies_access_token_immediately() -> None:
    with TestClient(create_app()) as client:
        data = _login(client)
        access = data["tokens"]["accessToken"]

        me = client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert me.status_code == 200

        logout = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert logout.status_code == 200

        denied = client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert denied.status_code == 401
        assert denied.json()["code"] == 401000


def test_revoked_refresh_rejected_via_denylist() -> None:
    with TestClient(create_app()) as client:
        _login(client)
        refresh = client.cookies.get("nova.refresh")

        client.post("/api/v1/auth/logout")

        again = client.post(
            "/api/v1/auth/refresh",
            headers={"Cookie": f"nova.refresh={refresh}"},
        )
        assert again.status_code == 401
        assert again.json()["code"] == 401004


def test_hot_list_cache_hit_returns_same_payload() -> None:
    with TestClient(create_app()) as client:
        headers = {"Authorization": f"Bearer {_login(client)['tokens']['accessToken']}"}
        first = client.get("/api/v1/voyages", headers=headers).json()
        second = client.get("/api/v1/voyages", headers=headers).json()

    assert first["code"] == 0
    assert first["data"] == second["data"]
    assert len(first["data"]) == 4


def test_auth_rate_limit_returns_429(monkeypatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RATE_LIMIT_AUTH_LIMIT", "3")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")
    get_settings.cache_clear()

    with TestClient(create_app()) as client:
        responses = [
            client.post(
                "/api/v1/auth/login",
                json={"identifier": "leo", "password": "wrong-pass"},
            )
            for _ in range(5)
        ]

    get_settings.cache_clear()

    assert responses[0].status_code == 401
    assert responses[1].status_code == 401
    assert responses[2].status_code == 401
    assert responses[3].status_code == 429
    assert responses[3].json()["code"] == 429001
