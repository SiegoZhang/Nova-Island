from typing import Literal

from fastapi import APIRouter

from app.api.deps import SettingsDep
from app.schemas.common import ApiResponse, BaseSchema, success_response

router = APIRouter(prefix="/health", tags=["health"])


class HealthData(BaseSchema):
    status: Literal["ok"]
    service: str
    version: str


@router.get("", response_model=ApiResponse[HealthData])
def get_health(settings: SettingsDep) -> ApiResponse[HealthData]:
    return success_response(
        HealthData(
            status="ok",
            service=settings.app_name,
            version=settings.app_version,
        )
    )
