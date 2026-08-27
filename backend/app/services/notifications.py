"""站内通知：创建、列表、已读。"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Notification


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def queue_notification(
    db: AsyncSession,
    *,
    recipient_id: str,
    actor_id: str,
    type: str,
    post_id: str | None = None,
    comment_id: str | None = None,
) -> Notification | None:
    """加入当前事务；自己给自己不通知。调用方负责 commit。"""
    if not recipient_id or recipient_id == actor_id:
        return None
    row = Notification(
        id=f"n_{uuid.uuid4().hex[:20]}",
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=type,
        post_id=post_id,
        comment_id=comment_id,
        read_at=None,
    )
    db.add(row)
    return row


async def list_notifications(
    db: AsyncSession,
    *,
    recipient_id: str,
    page: int,
    page_size: int,
    unread_only: bool = False,
) -> tuple[list[Notification], int]:
    base = select(Notification).where(Notification.recipient_id == recipient_id)
    if unread_only:
        base = base.where(Notification.read_at.is_(None))

    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (
        await db.scalars(
            base.options(selectinload(Notification.actor))
            .order_by(Notification.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)


async def count_unread(db: AsyncSession, *, recipient_id: str) -> int:
    total = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.recipient_id == recipient_id,
            Notification.read_at.is_(None),
        )
    )
    return int(total or 0)


async def get_notification(
    db: AsyncSession, *, notification_id: str, recipient_id: str
) -> Notification | None:
    row = await db.get(Notification, notification_id)
    if row is None or row.recipient_id != recipient_id:
        return None
    return row


async def mark_read(
    db: AsyncSession, *, notification: Notification
) -> Notification:
    if notification.read_at is None:
        notification.read_at = _utcnow()
        await db.commit()
        await db.refresh(notification)
    return notification


async def mark_all_read(db: AsyncSession, *, recipient_id: str) -> int:
    rows = (
        await db.scalars(
            select(Notification).where(
                Notification.recipient_id == recipient_id,
                Notification.read_at.is_(None),
            )
        )
    ).all()
    now = _utcnow()
    for row in rows:
        row.read_at = now
    await db.commit()
    return len(rows)
