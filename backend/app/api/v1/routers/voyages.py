from fastapi import APIRouter

from app.api.deps import CacheDep, CurrentUserOptional, DbSession, SettingsDep
from app.schemas.common import ApiResponse, success_response
from app.schemas.community import VoyageSchema
from app.services import community
from app.services.hot_cache import get_or_set_models

router = APIRouter(prefix="/voyages", tags=["voyages"])


@router.get("", response_model=ApiResponse[list[VoyageSchema]])
async def list_voyages(
    db: DbSession,
    cache: CacheDep,
    settings: SettingsDep,
    _viewer: CurrentUserOptional,
) -> ApiResponse[list[VoyageSchema]]:
    async def loader() -> list[VoyageSchema]:
        rows = await community.list_voyages(db)
        return [VoyageSchema.model_validate(row) for row in rows]

    data = await get_or_set_models(
        cache,
        key="cache:voyages",
        ttl=settings.cache_ttl_seconds,
        model=VoyageSchema,
        loader=loader,
    )
    return success_response(data)
