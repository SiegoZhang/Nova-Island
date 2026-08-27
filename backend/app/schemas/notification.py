"""通知 API schema。"""

from __future__ import annotations

from datetime import datetime

from app.schemas.common import BaseSchema, ORMSchema
from app.schemas.community import UserSummarySchema


class NotificationSchema(ORMSchema):
    id: str
    type: str
    actor: UserSummarySchema
    post_id: str | None = None
    comment_id: str | None = None
    read_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UnreadCountSchema(BaseSchema):
    count: int


class MarkAllReadSchema(BaseSchema):
    updated: int
