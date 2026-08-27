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


def test_admin_can_list_hidden_queue() -> None:
    with TestClient(create_app()) as client:
        author = client.post(
            "/api/v1/auth/register",
            json={
                "username": "queue_author",
                "email": "queue_author@example.com",
                "password": "secret123",
                "displayName": "队列作者",
            },
        ).json()
        author_token = author["data"]["tokens"]["accessToken"]
        post_id = client.post(
            "/api/v1/posts",
            headers=_auth(author_token),
            json={"title": "待隐藏帖", "content": "正文内容足够长，用于审核队列。"},
        ).json()["data"]["id"]

        mod_token = _login(client, "leo")
        assert (
            client.post(
                f"/api/v1/posts/{post_id}/hide",
                headers=_auth(mod_token),
            ).status_code
            == 200
        )

        admin_token = _login(client, "yhy")
        queue = client.get(
            "/api/v1/admin/posts",
            params={"status": "hidden"},
            headers=_auth(admin_token),
        )
        assert queue.status_code == 200
        ids = [item["id"] for item in queue.json()["data"]["items"]]
        assert post_id in ids

        restored = client.post(
            f"/api/v1/posts/{post_id}/unhide",
            headers=_auth(admin_token),
        )
        assert restored.status_code == 200
        assert restored.json()["data"]["status"] == "published"

        after = client.get(
            "/api/v1/admin/posts",
            params={"status": "hidden"},
            headers=_auth(admin_token),
        )
        after_ids = [item["id"] for item in after.json()["data"]["items"]]
        assert post_id not in after_ids


def test_admin_can_list_published_and_featured() -> None:
    with TestClient(create_app()) as client:
        admin_token = _login(client, "yhy")
        published = client.get(
            "/api/v1/admin/posts",
            params={"status": "published"},
            headers=_auth(admin_token),
        )
        assert published.status_code == 200
        assert published.json()["data"]["pagination"]["total"] >= 1

        featured = client.get(
            "/api/v1/admin/posts",
            params={"status": "published", "featured": "true"},
            headers=_auth(admin_token),
        )
        assert featured.status_code == 200
        for item in featured.json()["data"]["items"]:
            assert item["isFeatured"] is True
            assert item["status"] == "published"


def test_moderator_cannot_access_admin_posts() -> None:
    with TestClient(create_app()) as client:
        mod_token = _login(client, "leo")
        response = client.get(
            "/api/v1/admin/posts",
            headers=_auth(mod_token),
        )
        assert response.status_code == 403


def test_member_cannot_access_admin_posts() -> None:
    with TestClient(create_app()) as client:
        reg = client.post(
            "/api/v1/auth/register",
            json={
                "username": "queue_member",
                "email": "queue_member@example.com",
                "password": "secret123",
            },
        ).json()
        token = reg["data"]["tokens"]["accessToken"]
        response = client.get(
            "/api/v1/admin/posts",
            headers=_auth(token),
        )
        assert response.status_code == 403
