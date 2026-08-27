"""站内通知路由。"""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, PaginationDep
from app.core.exceptions import AppException
from app.models import Notification
from app.schemas.common import ApiResponse, PaginatedData, paginate, success_response
from app.schemas.notification import (
    MarkAllReadSchema,
    NotificationSchema,
    UnreadCountSchema,
)
from app.services import notifications as notif_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _serialize(row: Notification) -> NotificationSchema:
    return NotificationSchema.model_validate(row)


@router.get("", response_model=ApiResponse[PaginatedData[NotificationSchema]])
async def list_my_notifications(
    db: DbSession,
    current: CurrentUser,
    pagination: PaginationDep,
    unread_only: Annotated[bool, Query(alias="unreadOnly")] = False,
) -> ApiResponse[PaginatedData[NotificationSchema]]:
    rows, total = await notif_service.list_notifications(
        db,
        recipient_id=current.id,
        page=pagination.page,
        page_size=pagination.page_size,
        unread_only=unread_only,
    )
    data = paginate(
        [_serialize(row) for row in rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.get("/unread-count", response_model=ApiResponse[UnreadCountSchema])
async def get_unread_count(
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[UnreadCountSchema]:
    count = await notif_service.count_unread(db, recipient_id=current.id)
    return success_response(UnreadCountSchema(count=count))


@router.post("/read-all", response_model=ApiResponse[MarkAllReadSchema])
async def mark_all_notifications_read(
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[MarkAllReadSchema]:
    updated = await notif_service.mark_all_read(db, recipient_id=current.id)
    return success_response(
        MarkAllReadSchema(updated=updated),
        message="已全部标为已读",
    )


@router.post(
    "/{notification_id}/read",
    response_model=ApiResponse[NotificationSchema],
)
async def mark_notification_read(
    notification_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[NotificationSchema]:
    row = await notif_service.get_notification(
        db, notification_id=notification_id, recipient_id=current.id
    )
    if row is None:
        raise AppException(code=404020, message="通知不存在", status_code=404)
    await notif_service.mark_read(db, notification=row)
    loaded = await db.scalar(
        select(Notification)
        .where(Notification.id == notification_id)
        .options(selectinload(Notification.actor))
    )
    assert loaded is not None
    return success_response(_serialize(loaded), message="已标记已读")
