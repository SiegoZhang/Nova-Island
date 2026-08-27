from fastapi import APIRouter

from app.api.deps import CacheDep, CurrentUserOptional, DbSession, SettingsDep
from app.schemas.common import ApiResponse, success_response
from app.schemas.community import EventSchema
from app.services import community
from app.services.hot_cache import get_or_set_models

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=ApiResponse[list[EventSchema]])
async def list_events(
    db: DbSession,
    cache: CacheDep,
    settings: SettingsDep,
    _viewer: CurrentUserOptional,
) -> ApiResponse[list[EventSchema]]:
    async def loader() -> list[EventSchema]:
        rows = await community.list_events(db)
        return [EventSchema.model_validate(row) for row in rows]

    data = await get_or_set_models(
        cache,
        key="cache:events",
        ttl=settings.cache_ttl_seconds,
        model=EventSchema,
        loader=loader,
    )
    return success_response(data)
