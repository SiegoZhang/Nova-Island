from datetime import datetime, timezone
from math import ceil
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

DataT = TypeVar("DataT")
ItemT = TypeVar("ItemT")


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(word.capitalize() for word in rest)


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


class ORMSchema(BaseSchema):
    """从 ORM 对象直接构建的响应模型。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )


class PaginationMeta(BaseSchema):
    page: int
    page_size: int
    total: int
    total_pages: int


class PaginatedData(BaseSchema, Generic[ItemT]):
    items: list[ItemT]
    pagination: PaginationMeta


def paginate(
    items: list[ItemT],
    *,
    page: int,
    page_size: int,
    total: int,
) -> PaginatedData[ItemT]:
    total_pages = ceil(total / page_size) if page_size > 0 else 0
    return PaginatedData(
        items=items,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        ),
    )


class ApiResponse(BaseSchema, Generic[DataT]):
    code: int = 0
    message: str = "success"
    data: DataT
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ErrorData(BaseSchema):
    details: Any = None


def success_response(
    data: DataT,
    *,
    message: str = "success",
) -> ApiResponse[DataT]:
    return ApiResponse(code=0, message=message, data=data)
