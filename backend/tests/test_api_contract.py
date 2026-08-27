from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.exceptions import AppException
from app.main import create_app


def assert_api_envelope(payload: dict) -> None:
    assert set(payload) == {"code", "message", "data", "timestamp"}
    datetime.fromisoformat(payload["timestamp"].replace("Z", "+00:00"))


def test_health_endpoint() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert_api_envelope(payload)
    assert payload["code"] == 0
    assert payload["message"] == "success"
    assert payload["data"] == {
        "status": "ok",
        "service": "Nova Island API",
        "version": "0.1.0",
    }


def test_not_found_uses_api_envelope() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/does-not-exist")

    assert response.status_code == 404
    payload = response.json()
    assert_api_envelope(payload)
    assert payload["code"] == 404000
    assert payload["data"]["details"] is None


def test_validation_error_uses_api_envelope() -> None:
    application = create_app()

    @application.get("/__test__/items/{item_id}")
    def get_test_item(item_id: int) -> dict[str, int]:
        return {"item_id": item_id}

    with TestClient(application) as client:
        response = client.get("/__test__/items/not-an-integer")

    assert response.status_code == 422
    payload = response.json()
    assert_api_envelope(payload)
    assert payload["code"] == 422001
    assert isinstance(payload["data"]["details"], list)


def test_business_error_uses_api_envelope() -> None:
    application: FastAPI = create_app()

    @application.get("/__test__/forbidden")
    def get_forbidden() -> None:
        raise AppException(
            code=403001,
            message="无权访问该资源",
            status_code=403,
        )

    with TestClient(application) as client:
        response = client.get("/__test__/forbidden")

    assert response.status_code == 403
    payload = response.json()
    assert_api_envelope(payload)
    assert payload["code"] == 403001
    assert payload["message"] == "无权访问该资源"
