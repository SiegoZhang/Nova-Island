"""notifications"""

from fastapi.testclient import TestClient

from app.main import create_app

SEED_PASSWORD = "island@2026"


def _login(client: TestClient, identifier: str) -> str:
    payload = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": SEED_PASSWORD},
    ).json()
    return payload["data"]["tokens"]["accessToken"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_like_and_comment_create_notifications() -> None:
    with TestClient(create_app()) as client:
        leo = _auth(_login(client, "leo"))
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "username": "notif_user",
                "email": "notif_user@novaisland.ai",
                "password": SEED_PASSWORD,
                "displayName": "通知测试",
            },
        )
        assert reg.status_code == 200
        headers = _auth(reg.json()["data"]["tokens"]["accessToken"])
        actor_id = reg.json()["data"]["user"]["id"]

        assert client.post("/api/v1/posts/p_1/like", headers=headers).status_code == 200
        assert (
            client.post(
                "/api/v1/posts/p_1/comments",
                headers=headers,
                json={"content": "写得很好"},
            ).status_code
            == 200
        )

        listed = client.get("/api/v1/notifications", headers=leo).json()["data"]
        types = {item["type"] for item in listed["items"]}
        assert "post_like" in types
        assert "comment" in types

        count = client.get("/api/v1/notifications/unread-count", headers=leo).json()[
            "data"
        ]["count"]
        assert count >= 2

        # 自己给自己不产生通知
        mine = client.get("/api/v1/notifications", headers=headers).json()["data"]
        assert all(item["actor"]["id"] != actor_id for item in mine["items"])

        read_all = client.post("/api/v1/notifications/read-all", headers=leo)
        assert read_all.status_code == 200
        after = client.get("/api/v1/notifications/unread-count", headers=leo).json()[
            "data"
        ]["count"]
        assert after == 0


def test_follow_and_reply_notifications() -> None:
    with TestClient(create_app()) as client:
        leo = _auth(_login(client, "leo"))
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "username": "follower_x",
                "email": "follower_x@novaisland.ai",
                "password": SEED_PASSWORD,
                "displayName": "新关注者",
            },
        )
        assert reg.status_code == 200
        follower = _auth(reg.json()["data"]["tokens"]["accessToken"])

        followed = client.post("/api/v1/users/leo/follow", headers=follower)
        assert followed.status_code == 200

        leo_notifs = client.get(
            "/api/v1/notifications",
            headers=leo,
            params={"unreadOnly": "true"},
        ).json()["data"]["items"]
        assert any(
            item["type"] == "follow" and item["actor"]["username"] == "follower_x"
            for item in leo_notifs
        )

        # leo 先发评论，新用户回复 → leo 收到 reply
        root = client.post(
            "/api/v1/posts/p_2/comments",
            headers=leo,
            json={"content": "根评论等回复"},
        ).json()["data"]
        reply = client.post(
            "/api/v1/posts/p_2/comments",
            headers=follower,
            json={"content": "我来回复你", "parentId": root["id"]},
        )
        assert reply.status_code == 200

        leo_after = client.get("/api/v1/notifications", headers=leo).json()["data"][
            "items"
        ]
        assert any(item["type"] == "reply" for item in leo_after)
