"""站内通知模型。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.community import User


class Notification(Base, TimestampMixin):
    """互动站内通知：赞 / 评论 / 回复 / 关注。"""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    recipient_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False, index=True
    )
    actor_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    post_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("posts.id"), nullable=True
    )
    comment_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("comments.id"), nullable=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    actor: Mapped[User] = relationship(foreign_keys=[actor_id], lazy="selectin")
