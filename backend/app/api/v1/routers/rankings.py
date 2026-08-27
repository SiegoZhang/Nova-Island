from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.api.deps import CacheDep, CurrentUser, DbSession, RequireAdmin, SettingsDep
from app.core.exceptions import AppException
from app.schemas.common import ApiResponse, success_response
from app.schemas.community import RankingEntrySchema
from app.services import community
from app.services.hot_cache import get_or_set_models
from app.services.ranking import RANKING_PERIODS, recalculate_rankings

router = APIRouter(prefix="/rankings", tags=["rankings"])


class RecalculateRankingsRequest(BaseModel):
    periods: list[str] | None = Field(
        default=None,
        description="weekly / monthly / all；缺省则全部重算",
    )


@router.get("", response_model=ApiResponse[list[RankingEntrySchema]])
async def list_rankings(
    db: DbSession,
    cache: CacheDep,
    settings: SettingsDep,
    _viewer: CurrentUser,
    period: Annotated[str, Query()] = "weekly",
) -> ApiResponse[list[RankingEntrySchema]]:
    if period not in RANKING_PERIODS:
        raise AppException(
            code=400001,
            message="period 仅支持 weekly / monthly / all",
            status_code=400,
        )

    async def loader() -> list[RankingEntrySchema]:
        rows = await community.list_rankings(db, period=period)
        return [RankingEntrySchema.model_validate(row) for row in rows]

    data = await get_or_set_models(
        cache,
        key=f"cache:rankings:{period}",
        ttl=settings.cache_ttl_seconds,
        model=RankingEntrySchema,
        loader=loader,
    )
    return success_response(data)


@router.post("/recalculate", response_model=ApiResponse[dict[str, int]])
async def recalculate(
    db: DbSession,
    cache: CacheDep,
    settings: SettingsDep,
    _admin: RequireAdmin,
    body: RecalculateRankingsRequest | None = None,
) -> ApiResponse[dict[str, int]]:
    """管理员手动触发榜单重算。"""
    periods = None
    if body and body.periods:
        invalid = [p for p in body.periods if p not in RANKING_PERIODS]
        if invalid:
            raise AppException(
                code=400001,
                message="period 仅支持 weekly / monthly / all",
                status_code=400,
            )
        periods = body.periods

    counts = await recalculate_rankings(
        db,
        periods=periods,
        top_n=settings.ranking_top_n,
        cache=cache,
    )
    return success_response(counts, message="榜单已重算")
