from fastapi.testclient import TestClient

from app.main import create_app

SEED_PASSWORD = "island@2026"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client: TestClient, identifier: str) -> str:
    payload = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": SEED_PASSWORD},
    ).json()
    return payload["data"]["tokens"]["accessToken"]


def test_moderator_cannot_edit_others_content_but_can_hide() -> None:
    with TestClient(create_app()) as client:
        # 注册作者发帖
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "username": "author_rbac",
                "email": "author_rbac@example.com",
                "password": "secret123",
                "displayName": "作者",
            },
        ).json()
        author_token = reg["data"]["tokens"]["accessToken"]
        created = client.post(
            "/api/v1/posts",
            headers=_auth(author_token),
            json={"title": "成员帖", "content": "正文内容足够长。"},
        ).json()["data"]
        post_id = created["id"]

        mod_token = _login(client, "leo")
        forbidden = client.patch(
            f"/api/v1/posts/{post_id}",
            headers=_auth(mod_token),
            json={"title": "版主代写"},
        )
        assert forbidden.status_code == 403

        hidden = client.post(
            f"/api/v1/posts/{post_id}/hide",
            headers=_auth(mod_token),
        )
        assert hidden.status_code == 200
        assert hidden.json()["data"]["status"] == "hidden"

        # 匿名不可见（需登录）
        client.cookies.delete("nova.access")
        anon = client.get(f"/api/v1/posts/{post_id}")
        assert anon.status_code == 401

        # 版主可见
        staff_view = client.get(
            f"/api/v1/posts/{post_id}", headers=_auth(mod_token)
        )
        assert staff_view.status_code == 200


def test_moderator_can_feature_post() -> None:
    with TestClient(create_app()) as client:
        token = _login(client, "leo")
        featured = client.post(
            "/api/v1/posts/p_2/feature",
            headers=_auth(token),
        )
        assert featured.status_code == 200
        assert featured.json()["data"]["featured"] is True

        detail = client.get(
            "/api/v1/posts/p_2", headers=_auth(token)
        ).json()["data"]
        assert detail["isFeatured"] is True

        unfeatured = client.delete(
            "/api/v1/posts/p_2/feature",
            headers=_auth(token),
        )
        assert unfeatured.json()["data"]["featured"] is False


def test_member_cannot_feature() -> None:
    with TestClient(create_app()) as client:
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "username": "plain_member",
                "email": "plain_member@example.com",
                "password": "secret123",
            },
        ).json()
        token = reg["data"]["tokens"]["accessToken"]
        response = client.post(
            "/api/v1/posts/p_1/feature",
            headers=_auth(token),
        )
        assert response.status_code == 403
        assert response.json()["code"] == 403001


def test_members_visibility_requires_login() -> None:
    with TestClient(create_app()) as client:
        token = _login(client, "leo")
        created = client.post(
            "/api/v1/posts",
            headers=_auth(token),
            json={
                "title": "仅成员可见",
                "content": "岛民专属内容。",
                "visibility": "members",
            },
        ).json()["data"]
        post_id = created["id"]

        client.cookies.delete("nova.access")
        anon = client.get(f"/api/v1/posts/{post_id}")
        assert anon.status_code == 401

        member = client.get(
            f"/api/v1/posts/{post_id}", headers=_auth(token)
        )
        assert member.status_code == 200

        listed_anon = client.get("/api/v1/posts")
        assert listed_anon.status_code == 401

        listed_auth = client.get(
            "/api/v1/posts", headers=_auth(token)
        ).json()["data"]["items"]
        assert any(item["id"] == post_id for item in listed_auth)


def test_member_cannot_publish_public() -> None:
    with TestClient(create_app()) as client:
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "username": "member_vis",
                "email": "member_vis@example.com",
                "password": "secret123",
                "displayName": "普通岛民",
            },
        ).json()
        token = reg["data"]["tokens"]["accessToken"]

        forbidden = client.post(
            "/api/v1/posts",
            headers=_auth(token),
            json={
                "title": "想公开",
                "content": "普通成员尝试公开。",
                "visibility": "public",
            },
        )
        assert forbidden.status_code == 403
        assert forbidden.json()["code"] == 403003

        ok = client.post(
            "/api/v1/posts",
            headers=_auth(token),
            json={
                "title": "默认岛民可见",
                "content": "不传 visibility 应默认 members。",
            },
        )
        assert ok.status_code == 200
        assert ok.json()["data"]["visibility"] == "members"


def test_admin_can_list_users() -> None:
    with TestClient(create_app()) as client:
        admin_token = _login(client, "yhy")
        listed = client.get(
            "/api/v1/users",
            headers=_auth(admin_token),
            params={"page": 1, "page_size": 20},
        )
        assert listed.status_code == 200
        items = listed.json()["data"]["items"]
        assert len(items) >= 6
        assert any(u["username"] == "leo" for u in items)

        filtered = client.get(
            "/api/v1/users",
            headers=_auth(admin_token),
            params={"q": "leo"},
        )
        assert all("leo" in u["username"].lower() or "leo" in u["displayName"].lower()
                   for u in filtered.json()["data"]["items"])

        mod_token = _login(client, "leo")
        forbidden = client.get("/api/v1/users", headers=_auth(mod_token))
        assert forbidden.status_code == 403


def test_admin_can_create_user() -> None:
    with TestClient(create_app()) as client:
        admin_token = _login(client, "yhy")
        created = client.post(
            "/api/v1/users",
            headers=_auth(admin_token),
            json={
                "username": "staff_new",
                "email": "staff_new@example.com",
                "password": "secret123",
                "displayName": "新员工",
                "role": "moderator",
            },
        )
        assert created.status_code == 201
        body = created.json()["data"]
        assert body["username"] == "staff_new"
        assert body["displayName"] == "新员工"
        assert body["role"] == "moderator"
        assert body["status"] == "active"

        # 可用新账号登录，且管理员会话未被替换
        login = client.post(
            "/api/v1/auth/login",
            json={"identifier": "staff_new", "password": "secret123"},
        )
        assert login.status_code == 200
        assert login.json()["data"]["user"]["role"] == "moderator"

        conflict = client.post(
            "/api/v1/users",
            headers=_auth(admin_token),
            json={
                "username": "staff_new",
                "email": "other@example.com",
                "password": "secret123",
            },
        )
        assert conflict.status_code == 409
        assert conflict.json()["code"] == 409001


def test_moderator_cannot_create_user() -> None:
    with TestClient(create_app()) as client:
        mod_token = _login(client, "leo")
        response = client.post(
            "/api/v1/users",
            headers=_auth(mod_token),
            json={
                "username": "nope_user",
                "email": "nope_user@example.com",
                "password": "secret123",
            },
        )
        assert response.status_code == 403


def test_admin_can_delete_user() -> None:
    with TestClient(create_app()) as client:
        admin_token = _login(client, "yhy")
        client.post(
            "/api/v1/users",
            headers=_auth(admin_token),
            json={
                "username": "to_delete",
                "email": "to_delete@example.com",
                "password": "secret123",
            },
        )

        deleted = client.delete(
            "/api/v1/users/to_delete",
            headers=_auth(admin_token),
        )
        assert deleted.status_code == 200
        data = deleted.json()["data"]
        assert data["status"] == "deactivated"
        assert data["displayName"] == "已删除用户"
        assert data["username"].startswith("del_")

        login = client.post(
            "/api/v1/auth/login",
            json={"identifier": "to_delete", "password": "secret123"},
        )
        assert login.status_code == 401

        # 原用户名可再次注册
        again = client.post(
            "/api/v1/auth/register",
            json={
                "username": "to_delete",
                "email": "to_delete@example.com",
                "password": "secret123",
            },
        )
        assert again.status_code == 200

        self_delete = client.delete(
            "/api/v1/users/yhy",
            headers=_auth(admin_token),
        )
        assert self_delete.status_code == 400
        assert self_delete.json()["code"] == 400007


def test_moderator_cannot_delete_user() -> None:
    with TestClient(create_app()) as client:
        mod_token = _login(client, "leo")
        response = client.delete(
            "/api/v1/users/michelle",
            headers=_auth(mod_token),
        )
        assert response.status_code == 403


def test_admin_can_change_role_and_status() -> None:
    with TestClient(create_app()) as client:
        admin_token = _login(client, "yhy")
        # 注册目标用户
        client.post(
            "/api/v1/auth/register",
            json={
                "username": "promote_me",
                "email": "promote_me@example.com",
                "password": "secret123",
            },
        )

        promoted = client.patch(
            "/api/v1/users/promote_me/role",
            headers=_auth(admin_token),
            json={"role": "moderator"},
        )
        assert promoted.status_code == 200
        assert promoted.json()["data"]["role"] == "moderator"

        suspended = client.patch(
            "/api/v1/users/promote_me/status",
            headers=_auth(admin_token),
            json={"status": "suspended"},
        )
        assert suspended.status_code == 200
        assert suspended.json()["data"]["status"] == "suspended"

        # 被停用后无法登录受保护接口
        login = client.post(
            "/api/v1/auth/login",
            json={"identifier": "promote_me", "password": "secret123"},
        )
        assert login.status_code == 403
        assert login.json()["code"] == 403002


def test_moderator_cannot_change_roles() -> None:
    with TestClient(create_app()) as client:
        mod_token = _login(client, "leo")
        response = client.patch(
            "/api/v1/users/michelle/role",
            headers=_auth(mod_token),
            json={"role": "admin"},
        )
        assert response.status_code == 403
