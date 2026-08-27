from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import auth_header, login_as


def test_tag_library_seeded_and_admin_crud() -> None:
    with TestClient(create_app()) as client:
        member = auth_header(login_as(client, "cake"))
        admin = auth_header(login_as(client, "yhy"))

        catalog = client.get("/api/v1/tags", headers=member)
        assert catalog.status_code == 200
        names = [row["name"] for row in catalog.json()["data"]]
        assert "实战复盘" in names
        assert "全部" not in names

        # 普通用户不能管理
        denied = client.post(
            "/api/v1/tags",
            headers=member,
            json={"name": "非法标签"},
        )
        assert denied.status_code == 403

        created = client.post(
            "/api/v1/tags",
            headers=admin,
            json={"name": "模块三测试", "sortOrder": 99},
        )
        assert created.status_code == 201
        tag = created.json()["data"]
        assert tag["name"] == "模块三测试"
        tag_id = tag["id"]

        renamed = client.patch(
            f"/api/v1/tags/{tag_id}",
            headers=admin,
            json={"name": "模块三已改"},
        )
        assert renamed.status_code == 200
        assert renamed.json()["data"]["name"] == "模块三已改"

        deleted = client.delete(f"/api/v1/tags/{tag_id}", headers=admin)
        assert deleted.status_code == 200
        assert deleted.json()["code"] == 0


def test_create_post_rejects_unknown_tags() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client, "leo"))
        response = client.post(
            "/api/v1/posts",
            headers=headers,
            json={
                "title": "带未知标签",
                "content": "正文内容足够长。" * 3,
                "tags": ["不存在的标签XYZ"],
            },
        )
        assert response.status_code == 400
        assert response.json()["code"] == 400010


def test_draft_create_list_and_publish() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client, "leo"))

        empty = client.post(
            "/api/v1/posts",
            headers=headers,
            json={"title": "", "content": "", "status": "draft"},
        )
        assert empty.status_code == 422

        drafted = client.post(
            "/api/v1/posts",
            headers=headers,
            json={
                "title": "仅标题草稿",
                "content": "",
                "status": "draft",
                "tags": ["求助"],
            },
        )
        assert drafted.status_code == 200
        draft = drafted.json()["data"]
        assert draft["status"] == "draft"
        assert draft["publishedAt"] is None
        draft_id = draft["id"]

        listed = client.get("/api/v1/users/me/drafts", headers=headers)
        assert listed.status_code == 200
        ids = [item["id"] for item in listed.json()["data"]["items"]]
        assert draft_id in ids

        # 草稿不出现在公开最新流
        latest = client.get("/api/v1/posts", headers=headers).json()["data"]
        assert draft_id not in [item["id"] for item in latest["items"]]

        published = client.patch(
            f"/api/v1/posts/{draft_id}",
            headers=headers,
            json={
                "content": "补齐正文后发布。" * 3,
                "status": "published",
            },
        )
        assert published.status_code == 200
        assert published.json()["data"]["status"] == "published"
        assert published.json()["data"]["publishedAt"] is not None

        # 已发布不可改回草稿
        back = client.patch(
            f"/api/v1/posts/{draft_id}",
            headers=headers,
            json={"status": "draft"},
        )
        assert back.status_code == 400
        assert back.json()["code"] == 400011
