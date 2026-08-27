from datetime import datetime

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import auth_header, login_as


def assert_api_envelope(payload: dict) -> None:
    assert set(payload) == {"code", "message", "data", "timestamp"}
    datetime.fromisoformat(payload["timestamp"].replace("Z", "+00:00"))


def test_community_reads_require_auth() -> None:
    """帖子 / 榜单 / 用户资料等内容读取必须登录。"""
    with TestClient(create_app()) as client:
        for path in (
            "/api/v1/posts",
            "/api/v1/posts/p_1",
            "/api/v1/posts/p_1/comments",
            "/api/v1/posts/tags",
            "/api/v1/rankings",
            "/api/v1/users/leo",
        ):
            response = client.get(path)
            assert response.status_code == 401, path
            assert response.json()["code"] == 401000


def test_catalog_previews_are_public() -> None:
    """专栏 / 活动 / 航海目录对未登录用户开放预览，且不得泄露私密字段。"""
    forbidden_fields = {"email", "phone", "passwordHash", "mustChangePassword"}
    with TestClient(create_app()) as client:
        for path in (
            "/api/v1/columns",
            "/api/v1/events",
            "/api/v1/voyages",
        ):
            response = client.get(path)
            assert response.status_code == 200, path
            payload = response.json()
            assert_api_envelope(payload)
            assert payload["code"] == 0, path
            assert not forbidden_fields & set(str(payload["data"]).split()), path
            assert not any(
                field in str(payload["data"]) for field in forbidden_fields
            ), path


def test_column_detail_still_requires_auth() -> None:
    """目录可预览，但专栏详情与其帖子列表仍需登录。"""
    with TestClient(create_app()) as client:
        columns = client.get("/api/v1/columns").json()["data"]
        assert columns, "种子数据应至少有一个专栏"
        column_id = columns[0]["id"]
        for path in (
            f"/api/v1/columns/{column_id}",
            f"/api/v1/columns/{column_id}/posts",
        ):
            response = client.get(path)
            assert response.status_code == 401, path


def test_list_featured_posts() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        response = client.get(
            "/api/v1/posts", params={"featured": "true"}, headers=headers
        )

    assert response.status_code == 200
    payload = response.json()
    assert_api_envelope(payload)
    data = payload["data"]
    assert data["pagination"]["total"] == 6
    assert len(data["items"]) == 6
    first = data["items"][0]
    # camelCase 契约
    assert {
        "likeCount",
        "commentCount",
        "viewCount",
        "publishedAt",
        "isFeatured",
    } <= set(first)
    assert {"id", "displayName", "avatarUrl", "role"} <= set(first["author"])


def test_list_latest_posts_and_pagination() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        full = client.get("/api/v1/posts", headers=headers).json()
        paged = client.get(
            "/api/v1/posts",
            params={"page": 1, "page_size": 2},
            headers=headers,
        ).json()

    assert full["data"]["pagination"]["total"] == 11
    assert len(full["data"]["items"]) == 11
    assert paged["data"]["pagination"]["totalPages"] == 6
    assert len(paged["data"]["items"]) == 2


def test_filter_posts_by_tag() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        payload = client.get(
            "/api/v1/posts", params={"tag": "AI Agent"}, headers=headers
        ).json()

    ids = [item["id"] for item in payload["data"]["items"]]
    assert ids == ["p_1"]


def test_list_featured_post_tags() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        payload = client.get(
            "/api/v1/posts/tags", params={"featured": "true"}, headers=headers
        ).json()

    assert_api_envelope(payload)
    tags = payload["data"]
    assert "AI Agent" in tags
    assert "LLM" in tags
    assert "私域" in tags
    # 硬编码筛选项里不存在的假标签不得出现
    assert "LLM 工程" not in tags
    assert "出海" not in tags


def test_get_post_detail_increments_view() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        first = client.get("/api/v1/posts/p_1", headers=headers).json()
        second = client.get("/api/v1/posts/p_1", headers=headers).json()

    assert first["data"]["id"] == "p_1"
    assert first["data"]["author"]["displayName"] == "Leo"
    assert second["data"]["viewCount"] == first["data"]["viewCount"] + 1


def test_get_missing_post_returns_404_envelope() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        response = client.get("/api/v1/posts/does-not-exist", headers=headers)

    assert response.status_code == 404
    payload = response.json()
    assert_api_envelope(payload)
    assert payload["code"] == 404001


def test_post_comments_present_and_empty() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        with_comments = client.get(
            "/api/v1/posts/p_1/comments", headers=headers
        ).json()
        empty = client.get("/api/v1/posts/p_2/comments", headers=headers).json()

    assert with_comments["data"]["pagination"]["total"] == 3
    assert with_comments["data"]["items"][0]["content"]
    assert empty["data"]["pagination"]["total"] == 0
    assert empty["data"]["items"] == []


def test_list_voyages() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        payload = client.get("/api/v1/voyages", headers=headers).json()

    items = payload["data"]
    assert len(items) == 4
    assert {"durationWeeks", "memberCount", "capacity"} <= set(items[0])
    assert items[0]["captain"]["displayName"]


def test_list_columns() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        payload = client.get("/api/v1/columns", headers=headers).json()

    items = payload["data"]
    assert len(items) == 4
    assert {"articleCount", "cadence", "tag"} <= set(items[0])


def test_list_rankings_ordered() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        payload = client.get("/api/v1/rankings", headers=headers).json()

    items = payload["data"]
    assert [entry["rank"] for entry in items] == [1, 2, 3, 4, 5, 6]
    assert items[0]["user"]["displayName"] == "Leo"
    assert items[0]["trend"] == "up"


def test_list_events() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        payload = client.get("/api/v1/events", headers=headers).json()

    items = payload["data"]
    assert len(items) == 4
    sample = items[0]
    assert {"date", "time", "seatsLeft", "type"} <= set(sample)
    assert sample["host"]["displayName"]
