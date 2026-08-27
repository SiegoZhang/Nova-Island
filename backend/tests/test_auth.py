from fastapi.testclient import TestClient

from app.main import create_app

SEED_PASSWORD = "island@2026"


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient, **overrides) -> dict:
    body = {
        "username": "newbie",
        "email": "newbie@example.com",
        "password": "secret123",
        "displayName": "新岛萌新",
    }
    body.update(overrides)
    return client.post("/api/v1/auth/register", json=body).json()


def test_register_returns_access_token_and_sets_auth_cookies() -> None:
    with TestClient(create_app()) as client:
        payload = _register(client)
        access_cookie = client.cookies.get("nova.access")
        refresh_cookie = client.cookies.get("nova.refresh")

    assert payload["code"] == 0
    data = payload["data"]
    assert data["user"]["username"] == "newbie"
    assert data["user"]["isSelf"] is True
    assert data["user"]["email"] == "newbie@example.com"
    assert data["tokens"]["accessToken"]
    assert "refreshToken" not in data["tokens"]
    assert data["tokens"]["tokenType"] == "bearer"
    assert data["tokens"]["expiresIn"] > 0
    assert access_cookie == data["tokens"]["accessToken"]
    assert refresh_cookie


def test_register_duplicate_username_conflict() -> None:
    with TestClient(create_app()) as client:
        _register(client, username="leo", email="leo2@example.com")
        # leo 为种子用户，用户名冲突
        dup = client.post(
            "/api/v1/auth/register",
            json={
                "username": "leo",
                "email": "brand-new@example.com",
                "password": "secret123",
            },
        )

    assert dup.status_code == 409
    assert dup.json()["code"] == 409001


def test_login_with_username_and_email() -> None:
    with TestClient(create_app()) as client:
        by_username = client.post(
            "/api/v1/auth/login",
            json={"identifier": "leo", "password": SEED_PASSWORD},
        )
        by_email = client.post(
            "/api/v1/auth/login",
            json={"identifier": "leo@novaisland.ai", "password": SEED_PASSWORD},
        )

    assert by_username.status_code == 200
    assert by_email.status_code == 200
    assert by_username.json()["data"]["user"]["username"] == "leo"
    cookie_header = by_email.headers["set-cookie"].lower()
    assert "nova.access=" in cookie_header
    assert "nova.refresh=" in cookie_header
    assert "httponly" in cookie_header
    assert "samesite=lax" in cookie_header
    assert "path=/" in cookie_header
    assert "path=/api/v1/auth" in cookie_header


def test_auth_rejects_untrusted_browser_origin() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/auth/login",
            headers={"Origin": "https://evil.example"},
            json={"identifier": "leo", "password": SEED_PASSWORD},
        )

    assert response.status_code == 403
    assert response.json()["code"] == 403003


def test_login_wrong_password() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"identifier": "leo", "password": "wrong-pass"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == 401001


def test_me_requires_auth() -> None:
    with TestClient(create_app()) as client:
        anon = client.get("/api/v1/users/me")
        tokens = _register(client)["data"]["tokens"]
        me = client.get("/api/v1/users/me", headers=_auth_header(tokens["accessToken"]))

    assert anon.status_code == 401
    assert anon.json()["code"] == 401000
    assert me.status_code == 200
    assert me.json()["data"]["username"] == "newbie"


def test_safe_get_accepts_access_cookie() -> None:
    with TestClient(create_app()) as client:
        _register(client)
        me = client.get("/api/v1/users/me")

    assert me.status_code == 200
    assert me.json()["data"]["username"] == "newbie"


def test_write_request_does_not_accept_access_cookie() -> None:
    with TestClient(create_app()) as client:
        _register(client)
        response = client.post(
            "/api/v1/posts/p_1/comments",
            json={"content": "只有 Cookie 的写请求"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == 401000


def test_refresh_rotates_and_revokes_old() -> None:
    with TestClient(create_app()) as client:
        _register(client)
        old_refresh = client.cookies.get("nova.refresh")
        refreshed = client.post("/api/v1/auth/refresh")
        new_refresh = client.cookies.get("nova.refresh")
        # 旧 refresh 已被轮换吊销
        reused = client.post(
            "/api/v1/auth/refresh",
            headers={"Cookie": f"nova.refresh={old_refresh}"},
        )

    assert refreshed.status_code == 200
    new_tokens = refreshed.json()["data"]["tokens"]
    assert new_tokens["accessToken"]
    assert "refreshToken" not in new_tokens
    assert new_refresh
    assert new_refresh != old_refresh
    assert reused.status_code == 401
    assert reused.json()["code"] == 401004
    assert "nova.access=" in reused.headers["set-cookie"]
    assert "nova.refresh=" in reused.headers["set-cookie"]
    assert "Max-Age=0" in reused.headers["set-cookie"]


def test_logout_revokes_refresh_token() -> None:
    with TestClient(create_app()) as client:
        _register(client)
        refresh_token = client.cookies.get("nova.refresh")
        # 登出不依赖 access token，仅凭 refresh 吊销会话
        logout = client.post("/api/v1/auth/logout")
        reused = client.post(
            "/api/v1/auth/refresh",
            headers={"Cookie": f"nova.refresh={refresh_token}"},
        )

    assert logout.status_code == 200
    assert "Max-Age=0" in logout.headers["set-cookie"]
    assert reused.status_code == 401


def test_create_comment_requires_auth() -> None:
    with TestClient(create_app()) as client:
        anon = client.post(
            "/api/v1/posts/p_1/comments",
            json={"content": "未登录留言"},
        )
        tokens = _register(client)["data"]["tokens"]
        created = client.post(
            "/api/v1/posts/p_1/comments",
            json={"content": "这是一条登录后的评论"},
            headers=_auth_header(tokens["accessToken"]),
        )

    assert anon.status_code == 401
    assert created.status_code == 200
    data = created.json()["data"]
    assert data["content"] == "这是一条登录后的评论"
    assert data["author"]["username"] == "newbie"


def test_update_profile() -> None:
    with TestClient(create_app()) as client:
        tokens = _register(client)["data"]["tokens"]
        response = client.patch(
            "/api/v1/users/me",
            json={"displayName": "更新后的名字", "bio": "热爱 AI 的萌新"},
            headers=_auth_header(tokens["accessToken"]),
        )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["displayName"] == "更新后的名字"
    assert data["bio"] == "热爱 AI 的萌新"


def test_change_password_then_login() -> None:
    with TestClient(create_app()) as client:
        tokens = _register(client)["data"]["tokens"]
        changed = client.post(
            "/api/v1/users/me/password",
            json={"currentPassword": "secret123", "newPassword": "secret456"},
            headers=_auth_header(tokens["accessToken"]),
        )
        # 改密后旧 access 应失效
        stale = client.get(
            "/api/v1/users/me",
            headers=_auth_header(tokens["accessToken"]),
        )
        relogin = client.post(
            "/api/v1/auth/login",
            json={"identifier": "newbie", "password": "secret456"},
        )
        new_tokens = relogin.json()["data"]["tokens"]
        wrong_current = client.post(
            "/api/v1/users/me/password",
            json={"currentPassword": "wrongpass", "newPassword": "secret789"},
            headers=_auth_header(new_tokens["accessToken"]),
        )
        same_as_current = client.post(
            "/api/v1/users/me/password",
            json={"currentPassword": "secret456", "newPassword": "secret456"},
            headers=_auth_header(new_tokens["accessToken"]),
        )

    assert changed.status_code == 200
    assert changed.json()["message"] == "密码已修改，请重新登录"
    assert stale.status_code == 401
    assert relogin.status_code == 200
    assert wrong_current.status_code == 400
    assert wrong_current.json()["code"] == 400002
    assert same_as_current.status_code == 400
    assert same_as_current.json()["code"] == 400003
    assert "不能与当前密码相同" in same_as_current.json()["message"]


def test_public_profile_and_follow_flow() -> None:
    with TestClient(create_app()) as client:
        tokens = _register(client)["data"]["tokens"]
        headers = _auth_header(tokens["accessToken"])

        before = client.get("/api/v1/users/leo", headers=headers).json()["data"]
        follow = client.post("/api/v1/users/leo/follow", headers=headers)
        after = client.get("/api/v1/users/leo", headers=headers).json()["data"]
        unfollow = client.delete("/api/v1/users/leo/follow", headers=headers)

    assert before["isFollowing"] is False
    assert follow.status_code == 200
    assert follow.json()["data"]["following"] is True
    assert after["isFollowing"] is True
    assert after["followerCount"] == before["followerCount"] + 1
    assert unfollow.json()["data"]["following"] is False


def test_followers_and_following_lists() -> None:
    with TestClient(create_app()) as client:
        tokens = _register(client)["data"]["tokens"]
        headers = _auth_header(tokens["accessToken"])
        me = client.get("/api/v1/users/me", headers=headers).json()["data"]
        username = me["username"]

        client.post("/api/v1/users/leo/follow", headers=headers)

        leo_followers = client.get(
            "/api/v1/users/leo/followers", headers=headers
        ).json()["data"]
        assert any(u["username"] == username for u in leo_followers["items"])

        my_following = client.get(
            f"/api/v1/users/{username}/following",
            headers=headers,
        ).json()["data"]
        assert any(u["username"] == "leo" for u in my_following["items"])
        assert my_following["pagination"]["total"] >= 1

        missing = client.get(
            "/api/v1/users/no_such_user/followers", headers=headers
        )
        assert missing.status_code == 404


def test_cannot_follow_self() -> None:
    with TestClient(create_app()) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"identifier": "leo", "password": SEED_PASSWORD},
        ).json()
        headers = _auth_header(login["data"]["tokens"]["accessToken"])
        response = client.post("/api/v1/users/leo/follow", headers=headers)

    assert response.status_code == 400
    assert response.json()["code"] == 400003


def test_user_posts_pagination() -> None:
    with TestClient(create_app()) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"identifier": "leo", "password": SEED_PASSWORD},
        ).json()
        headers = _auth_header(login["data"]["tokens"]["accessToken"])
        payload = client.get(
            "/api/v1/users/leo/posts",
            params={"page": 1, "page_size": 10},
            headers=headers,
        ).json()

    assert payload["code"] == 0
    assert payload["data"]["pagination"]["total"] >= 1
    assert all(item["author"]["username"] == "leo" for item in payload["data"]["items"])
