"""post search"""

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import auth_header, login_as


def test_search_posts_by_title_and_tag() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        # seed 帖子含「RAG」「Agent」等
        hit = client.get(
            "/api/v1/posts/search",
            params={"q": "RAG", "page_size": 20},
            headers=headers,
        )
        assert hit.status_code == 200
        payload = hit.json()["data"]
        assert payload["pagination"]["total"] >= 1
        assert any(
            "RAG" in (item["title"] + item["content"] + "".join(item["tags"]))
            for item in payload["items"]
        )

        miss = client.get(
            "/api/v1/posts/search",
            params={"q": "zzz_no_such_term_zzz"},
            headers=headers,
        )
        assert miss.status_code == 200
        assert miss.json()["data"]["pagination"]["total"] == 0
        assert miss.json()["data"]["items"] == []


def test_search_requires_query() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        empty = client.get(
            "/api/v1/posts/search", params={"q": ""}, headers=headers
        )
        assert empty.status_code == 422


def test_search_requires_auth() -> None:
    with TestClient(create_app()) as client:
        guest = client.get("/api/v1/posts/search", params={"q": "RAG"})
        assert guest.status_code == 401
        assert guest.json()["code"] == 401000


def test_search_members_visibility_for_logged_in() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        created = client.post(
            "/api/v1/posts",
            headers=headers,
            json={
                "title": "私密关键词独角兽搜索",
                "content": "仅登录可见的正文",
                "visibility": "members",
                "status": "published",
            },
        )
        assert created.status_code == 200

        authed = client.get(
            "/api/v1/posts/search",
            params={"q": "独角兽搜索"},
            headers=headers,
        ).json()["data"]
        assert any(item["title"] == "私密关键词独角兽搜索" for item in authed["items"])

        client.cookies.delete("nova.access")
        guest = client.get("/api/v1/posts/search", params={"q": "独角兽搜索"})
        assert guest.status_code == 401
        assert guest.json()["code"] == 401000
