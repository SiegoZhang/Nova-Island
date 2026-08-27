"""upload and post attachments"""

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

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


def _png_bytes(size: tuple[int, int] = (64, 48)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color=(32, 120, 80)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_upload_and_attach_to_post() -> None:
    with TestClient(create_app()) as client:
        token = _login(client)
        headers = _auth(token)

        png_bytes = _png_bytes()
        uploaded = client.post(
            "/api/v1/uploads",
            headers=headers,
            files={"file": ("cover.png", BytesIO(png_bytes), "image/png")},
        )
        assert uploaded.status_code == 200
        meta = uploaded.json()["data"]
        assert meta["kind"] == "image"
        assert meta["contentType"] in {"image/jpeg", "image/webp"}
        assert meta["url"].startswith("http://testserver/media/")

        created = client.post(
            "/api/v1/posts",
            headers=headers,
            json={
                "title": "带封面与附件",
                "content": "正文内容足够长。",
                "coverImageUrl": meta["url"],
                "attachments": [
                    {
                        "storageKey": meta["storageKey"],
                        "url": meta["url"],
                        "originalName": meta["originalName"],
                        "contentType": meta["contentType"],
                        "sizeBytes": meta["sizeBytes"],
                    }
                ],
                "status": "published",
                "visibility": "public",
            },
        )
        assert created.status_code == 200, created.text
        post = created.json()["data"]
        assert post["coverImageUrl"] == meta["url"]
        assert len(post["attachments"]) == 1
        assert post["attachments"][0]["kind"] == "image"

        detail = client.get(
            f"/api/v1/posts/{post['id']}", headers=headers
        ).json()["data"]
        assert len(detail["attachments"]) == 1


def test_upload_rejects_disallowed_type() -> None:
    with TestClient(create_app()) as client:
        token = _login(client)
        bad = client.post(
            "/api/v1/uploads",
            headers=_auth(token),
            files={
                "file": ("x.exe", BytesIO(b"MZ"), "application/octet-stream")
            },
        )
        assert bad.status_code == 400
        assert bad.json()["code"] == 400012


def test_upload_avatar_purpose_returns_jpeg() -> None:
    with TestClient(create_app()) as client:
        token = _login(client)
        png_bytes = _png_bytes((120, 80))
        uploaded = client.post(
            "/api/v1/uploads",
            headers=_auth(token),
            data={"purpose": "avatar"},
            files={"file": ("avatar.png", BytesIO(png_bytes), "image/png")},
        )
        assert uploaded.status_code == 200, uploaded.text
        meta = uploaded.json()["data"]
        assert meta["kind"] == "image"
        assert meta["contentType"] == "image/jpeg"
        assert meta["originalName"].endswith(".jpg")
