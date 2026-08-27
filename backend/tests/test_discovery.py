"""主页与发现：精华筛选、公开收藏、关注动态、榜单重算。"""

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import auth_header, login_as


def test_user_posts_featured_filter() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client, "yhy"))
        all_posts = client.get("/api/v1/users/leo/posts", headers=headers).json()
        featured = client.get(
            "/api/v1/users/leo/posts",
            params={"featured": "true"},
            headers=headers,
        ).json()

    assert all_posts["code"] == 0
    assert featured["code"] == 0
    assert featured["data"]["pagination"]["total"] <= all_posts["data"]["pagination"][
        "total"
    ]
    assert all(item["isFeatured"] for item in featured["data"]["items"])


def test_public_bookmarks_and_following_feed() -> None:
    with TestClient(create_app()) as client:
        leo = auth_header(login_as(client, "leo"))
        # leo 收藏一篇帖
        posts = client.get("/api/v1/posts", headers=leo).json()["data"]["items"]
        post_id = posts[0]["id"]
        bookmarked = client.post(
            f"/api/v1/posts/{post_id}/bookmark", headers=leo
        )
        assert bookmarked.status_code == 200

        # 他人可读公开收藏
        yhy = auth_header(login_as(client, "yhy"))
        public_bm = client.get("/api/v1/users/leo/bookmarks", headers=yhy)
        assert public_bm.status_code == 200
        ids = [item["id"] for item in public_bm.json()["data"]["items"]]
        assert post_id in ids

        # yhy 关注 leo 后能看到关注动态
        client.post("/api/v1/users/leo/follow", headers=yhy)
        feed = client.get("/api/v1/users/me/following/posts", headers=yhy)
        assert feed.status_code == 200
        assert feed.json()["data"]["pagination"]["total"] >= 1
        authors = {
            item["author"]["username"] for item in feed.json()["data"]["items"]
        }
        assert "leo" in authors


def test_ranking_recalculate_periods() -> None:
    with TestClient(create_app()) as client:
        admin = auth_header(login_as(client, "yhy"))
        recalc = client.post("/api/v1/rankings/recalculate", headers=admin)
        assert recalc.status_code == 200
        counts = recalc.json()["data"]
        assert set(counts) >= {"weekly", "monthly", "all"}

        for period in ("weekly", "monthly", "all"):
            rows = client.get(
                "/api/v1/rankings",
                params={"period": period},
                headers=admin,
            )
            assert rows.status_code == 200
            data = rows.json()["data"]
            assert isinstance(data, list)
            # seed 含关注关系；周期榜按窗口内互动，也应有条目
            assert len(data) >= 1, period
            assert data[0]["rank"] == 1
            assert data[0]["score"] > 0
            assert data[0]["user"]["username"]


def test_ranking_recalculate_requires_admin() -> None:
    with TestClient(create_app()) as client:
        member = auth_header(login_as(client, "leo"))
        response = client.post("/api/v1/rankings/recalculate", headers=member)
        assert response.status_code == 403
        assert response.json()["code"] == 403001


def test_invalid_ranking_period() -> None:
    with TestClient(create_app()) as client:
        headers = auth_header(login_as(client))
        response = client.get(
            "/api/v1/rankings",
            params={"period": "year"},
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["code"] == 400001
