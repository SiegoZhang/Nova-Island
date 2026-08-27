from fastapi.testclient import TestClient

from app.main import create_app

SEED_PASSWORD = "island@2026"


def _login(client: TestClient, identifier: str = "leo") -> str:
    payload = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": SEED_PASSWORD},
    ).json()
    return payload["data"]["tokens"]["accessToken"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_create_update_delete_post() -> None:
    with TestClient(create_app()) as client:
        token = _login(client)

        created = client.post(
            "/api/v1/posts",
            headers=_auth(token),
            json={
                "title": "我的第一篇实战笔记",
                "content": "这是正文内容，足够长。" * 3,
                "tags": ["实战复盘", "工作流"],
            },
        )
        assert created.status_code == 200
        post = created.json()["data"]
        post_id = post["id"]
        assert post["title"] == "我的第一篇实战笔记"
        assert post["status"] == "published"
        assert post["author"]["username"] == "leo"

        updated = client.patch(
            f"/api/v1/posts/{post_id}",
            headers=_auth(token),
            json={"title": "更新后的标题"},
        )
        assert updated.status_code == 200
        assert updated.json()["data"]["title"] == "更新后的标题"

        deleted = client.delete(f"/api/v1/posts/{post_id}", headers=_auth(token))
        assert deleted.status_code == 200
        assert deleted.json()["code"] == 0

        missing = client.get(f"/api/v1/posts/{post_id}", headers=_auth(token))
        assert missing.status_code == 404


def test_create_post_requires_auth() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/posts",
            json={"title": "未登录", "content": "正文"},
        )
    assert response.status_code == 401


def test_post_like_and_bookmark_idempotent() -> None:
    with TestClient(create_app()) as client:
        token = _login(client)
        headers = _auth(token)

        before = client.get("/api/v1/posts/p_1", headers=headers).json()["data"]
        like_count = before["likeCount"]

        liked = client.post("/api/v1/posts/p_1/like", headers=headers)
        assert liked.status_code == 200
        assert liked.json()["data"] == {
            "liked": True,
            "likeCount": like_count + 1,
        }

        # 幂等：重复点赞不增加计数
        liked_again = client.post("/api/v1/posts/p_1/like", headers=headers)
        assert liked_again.json()["data"]["likeCount"] == like_count + 1

        detail = client.get("/api/v1/posts/p_1", headers=headers).json()["data"]
        assert detail["isLiked"] is True
        assert detail["likeCount"] == like_count + 1

        unliked = client.delete("/api/v1/posts/p_1/like", headers=headers)
        assert unliked.json()["data"]["liked"] is False
        assert unliked.json()["data"]["likeCount"] == like_count

        bookmarked = client.post("/api/v1/posts/p_1/bookmark", headers=headers)
        assert bookmarked.json()["data"]["bookmarked"] is True
        detail2 = client.get("/api/v1/posts/p_1", headers=headers).json()["data"]
        assert detail2["isBookmarked"] is True

        unbookmarked = client.delete(
            "/api/v1/posts/p_1/bookmark", headers=headers
        )
        assert unbookmarked.json()["data"]["bookmarked"] is False


def test_list_my_bookmarks() -> None:
    with TestClient(create_app()) as client:
        token = _login(client)
        headers = _auth(token)

        empty = client.get("/api/v1/users/me/bookmarks", headers=headers)
        assert empty.status_code == 200
        assert empty.json()["data"]["items"] == []

        client.post("/api/v1/posts/p_1/bookmark", headers=headers)
        client.post("/api/v1/posts/p_2/bookmark", headers=headers)

        listed = client.get("/api/v1/users/me/bookmarks", headers=headers)
        assert listed.status_code == 200
        payload = listed.json()["data"]
        assert payload["pagination"]["total"] == 2
        ids = [item["id"] for item in payload["items"]]
        assert ids == ["p_2", "p_1"]
        assert all(item["isBookmarked"] is True for item in payload["items"])

        client.cookies.delete("nova.access")
        unauth = client.get("/api/v1/users/me/bookmarks")
        assert unauth.status_code == 401


def test_comment_crud_and_like() -> None:
    with TestClient(create_app()) as client:
        token = _login(client)
        headers = _auth(token)

        created = client.post(
            "/api/v1/posts/p_2/comments",
            headers=headers,
            json={"content": "很有启发，收藏了。"},
        )
        assert created.status_code == 200
        comment = created.json()["data"]
        comment_id = comment["id"]
        assert comment["content"] == "很有启发，收藏了。"
        assert comment["author"]["username"] == "leo"

        updated = client.patch(
            f"/api/v1/posts/p_2/comments/{comment_id}",
            headers=headers,
            json={"content": "改一下措辞。"},
        )
        assert updated.json()["data"]["content"] == "改一下措辞。"

        liked = client.post(
            f"/api/v1/posts/p_2/comments/{comment_id}/like",
            headers=headers,
        )
        assert liked.json()["data"]["liked"] is True
        assert liked.json()["data"]["likeCount"] == 1

        listed = client.get(
            "/api/v1/posts/p_2/comments", headers=headers
        ).json()["data"]
        mine = next(item for item in listed["items"] if item["id"] == comment_id)
        assert mine["isLiked"] is True

        deleted = client.delete(
            f"/api/v1/posts/p_2/comments/{comment_id}",
            headers=headers,
        )
        assert deleted.status_code == 200

        after = client.get(
            "/api/v1/posts/p_2/comments", headers=headers
        ).json()["data"]
        assert all(item["id"] != comment_id for item in after["items"])


def test_blank_comment_rejected() -> None:
    """纯空白（空格/换行/制表符）不构成有效评论；正常内容首尾空白被 trim。"""
    with TestClient(create_app()) as client:
        token = _login(client)
        headers = _auth(token)

        for blank in ("   ", "\n\n", "\t", " \r\n \t ", "　"):
            response = client.post(
                "/api/v1/posts/p_2/comments",
                headers=headers,
                json={"content": blank},
            )
            assert response.status_code == 422, repr(blank)
            assert response.json()["code"] == 422001, repr(blank)

        trimmed = client.post(
            "/api/v1/posts/p_2/comments",
            headers=headers,
            json={"content": "  正常内容  "},
        )
        assert trimmed.status_code == 200
        comment_id = trimmed.json()["data"]["id"]
        assert trimmed.json()["data"]["content"] == "正常内容"

        blank_update = client.patch(
            f"/api/v1/posts/p_2/comments/{comment_id}",
            headers=headers,
            json={"content": "   "},
        )
        assert blank_update.status_code == 422

        client.delete(
            f"/api/v1/posts/p_2/comments/{comment_id}",
            headers=headers,
        )


def test_comment_reply_max_two_levels() -> None:
    """回复挂在根下；再回复「回复」仍挂根，replyTo 指向被回复者。"""
    with TestClient(create_app()) as client:
        token = _login(client)
        headers = _auth(token)

        root = client.post(
            "/api/v1/posts/p_2/comments",
            headers=headers,
            json={"content": "根评论"},
        ).json()["data"]
        root_id = root["id"]

        reply = client.post(
            "/api/v1/posts/p_2/comments",
            headers=headers,
            json={"content": "一层回复", "parentId": root_id},
        ).json()["data"]
        assert reply["parentId"] == root_id
        assert reply["replyToUser"]["username"] == "leo"

        nested = client.post(
            "/api/v1/posts/p_2/comments",
            headers=headers,
            json={"content": "回复的回复", "parentId": reply["id"]},
        ).json()["data"]
        assert nested["parentId"] == root_id
        assert nested["replyToUser"]["username"] == "leo"
        assert nested["content"] == "回复的回复"

        listed = client.get(
            "/api/v1/posts/p_2/comments", headers=headers
        ).json()["data"]["items"]
        root_row = next(item for item in listed if item["id"] == root_id)
        assert root_row["replyCount"] >= 2

        client.delete(
            f"/api/v1/posts/p_2/comments/{root_id}",
            headers=headers,
        )
        after = client.get(
            "/api/v1/posts/p_2/comments", headers=headers
        ).json()["data"]["items"]
        ids = {item["id"] for item in after}
        assert root_id not in ids
        assert reply["id"] not in ids
        assert nested["id"] not in ids


def test_cannot_edit_others_post() -> None:
    with TestClient(create_app()) as client:
        # 注册新用户改 leo 的帖
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "username": "editor_x",
                "email": "editor_x@example.com",
                "password": "secret123",
                "displayName": "路人甲",
            },
        ).json()
        token = reg["data"]["tokens"]["accessToken"]

        response = client.patch(
            "/api/v1/posts/p_1",
            headers=_auth(token),
            json={"title": "篡改标题"},
        )
        assert response.status_code == 403
        assert response.json()["code"] == 403001
