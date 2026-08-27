"""管理员重置密码 / 无密码登录提示 / 强制改密。"""

import asyncio

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models import User

SEED_PASSWORD = "island@2026"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client: TestClient, identifier: str, password: str = SEED_PASSWORD) -> str:
    payload = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    ).json()
    return payload["data"]["tokens"]["accessToken"]


def _clear_password(client: TestClient, username: str) -> None:
    database = client.app.state.database

    async def _run() -> None:
        async with database.sessionmaker() as db:
            user = await db.scalar(select(User).where(User.username == username))
            assert user is not None
            user.password_hash = None
            user.temporary_password = None
            user.must_change_password = False
            await db.commit()

    asyncio.run(_run())


def test_login_no_password_hash_returns_401004() -> None:
    with TestClient(create_app()) as client:
        admin = _login(client, "yhy")
        created = client.post(
            "/api/v1/users",
            headers=_auth(admin),
            json={
                "username": "zsxq_guest",
                "email": "zsxq_guest@example.com",
                "password": "secret123",
                "displayName": "星球用户",
            },
        )
        assert created.status_code == 201
        _clear_password(client, "zsxq_guest")

        resp = client.post(
            "/api/v1/auth/login",
            json={"identifier": "zsxq_guest", "password": "whatever1"},
        )
        assert resp.status_code == 401
        assert resp.json()["code"] == 401004
        assert "尚未设置密码" in resp.json()["message"]

        listed = client.get(
            "/api/v1/users",
            headers=_auth(admin),
            params={"password_state": "unset", "q": "zsxq_guest"},
        )
        assert listed.status_code == 200
        items = listed.json()["data"]["items"]
        assert any(
            item["username"] == "zsxq_guest" and item["hasPassword"] is False
            for item in items
        )


def test_admin_reset_and_force_change_password() -> None:
    with TestClient(create_app()) as client:
        admin = _login(client, "yhy")
        created = client.post(
            "/api/v1/users",
            headers=_auth(admin),
            json={
                "username": "activate_me",
                "email": "activate_me@example.com",
                "password": "secret123",
                "displayName": "待激活",
            },
        )
        assert created.status_code == 201

        reset = client.post(
            "/api/v1/users/activate_me/password/reset",
            headers=_auth(admin),
        )
        assert reset.status_code == 200
        body = reset.json()["data"]
        assert body["hasPassword"] is True
        assert body["mustChangePassword"] is True
        temp = body["temporaryPassword"]
        assert isinstance(temp, str) and len(temp) >= 8

        listed = client.get(
            "/api/v1/users",
            headers=_auth(admin),
            params={"password_state": "temporary", "q": "activate_me"},
        )
        assert listed.status_code == 200
        items = listed.json()["data"]["items"]
        row = next(item for item in items if item["username"] == "activate_me")
        assert row["temporaryPassword"] == temp

        login = client.post(
            "/api/v1/auth/login",
            json={"identifier": "activate_me", "password": temp},
        )
        assert login.status_code == 200
        assert login.json()["data"]["user"]["mustChangePassword"] is True
        token = login.json()["data"]["tokens"]["accessToken"]

        blocked = client.post(
            "/api/v1/posts",
            headers=_auth(token),
            json={"title": "不能发", "content": "强制改密前不应成功。"},
        )
        assert blocked.status_code == 403
        assert blocked.json()["code"] == 403004

        changed = client.post(
            "/api/v1/users/me/password",
            headers=_auth(token),
            json={"currentPassword": temp, "newPassword": "newpass456"},
        )
        assert changed.status_code == 200

        again = client.post(
            "/api/v1/auth/login",
            json={"identifier": "activate_me", "password": "newpass456"},
        )
        assert again.status_code == 200
        assert again.json()["data"]["user"]["mustChangePassword"] is False

        listed2 = client.get(
            "/api/v1/users",
            headers=_auth(admin),
            params={"q": "activate_me"},
        ).json()["data"]["items"]
        row2 = next(item for item in listed2 if item["username"] == "activate_me")
        assert row2["mustChangePassword"] is False
        assert row2["temporaryPassword"] is None


def test_moderator_cannot_reset_password() -> None:
    with TestClient(create_app()) as client:
        mod = _login(client, "leo")
        resp = client.post(
            "/api/v1/users/yhy/password/reset",
            headers=_auth(mod),
        )
        assert resp.status_code == 403
