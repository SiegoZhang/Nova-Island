from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class PostLike(Base, TimestampMixin):
    """用户对帖子的点赞（复合主键，幂等）。"""

    __tablename__ = "post_likes"

    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), primary_key=True
    )
    post_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("posts.id"), primary_key=True, index=True
    )


class PostBookmark(Base, TimestampMixin):
    """用户对帖子的收藏。"""

    __tablename__ = "post_bookmarks"

    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), primary_key=True
    )
    post_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("posts.id"), primary_key=True, index=True
    )


class CommentLike(Base, TimestampMixin):
    """用户对评论的点赞。"""

    __tablename__ = "comment_likes"

    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), primary_key=True
    )
    comment_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("comments.id"), primary_key=True, index=True
    )


class ImportIdMap(Base, TimestampMixin):
    """知识星球等外部源 ID → 本站 ID 映射，保证导入幂等。"""

    __tablename__ = "import_id_map"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_system: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    local_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    bio: Mapped[str | None] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(32), default="member", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    # 管理员重置后为 True；用户自行改密成功后清 False，并清空 temporary_password
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # 仅供管理员查看的临时明文密码；用户改密后清空（运营激活场景）
    temporary_password: Mapped[str | None] = mapped_column(String(128))
    follower_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    following_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    post_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    posts: Mapped[list[Post]] = relationship(back_populates="author")


class Post(Base, TimestampMixin):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    author_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False, index=True
    )
    column_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("content_columns.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    excerpt: Mapped[str | None] = mapped_column(String(512))
    cover_image_url: Mapped[str | None] = mapped_column(String(512))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="published", nullable=False)
    visibility: Mapped[str] = mapped_column(
        String(32), default="public", nullable=False
    )
    is_featured: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author: Mapped[User] = relationship(back_populates="posts", lazy="selectin")
    column: Mapped[ContentColumn | None] = relationship(
        lazy="selectin", foreign_keys=[column_id]
    )
    comments: Mapped[list[Comment]] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
    )
    attachments: Mapped[list[PostAttachment]] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="PostAttachment.sort_order",
        lazy="selectin",
    )


class PostAttachment(Base, TimestampMixin):
    """帖子附件（图片或文件）。storage_key 供本地/S3 统一删除与迁移。"""

    __tablename__ = "post_attachments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    post_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("posts.id"), nullable=False, index=True
    )
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="file")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    post: Mapped[Post] = relationship(back_populates="attachments")


class Comment(Base, TimestampMixin):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    post_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("posts.id"), nullable=False, index=True
    )
    author_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    parent_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("comments.id"))
    reply_to_user_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("users.id")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="published", nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reply_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    post: Mapped[Post] = relationship(back_populates="comments")
    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="selectin")
    reply_to_user: Mapped[User | None] = relationship(
        foreign_keys=[reply_to_user_id], lazy="selectin"
    )


class Voyage(Base, TimestampMixin):
    __tablename__ = "voyages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(String(512), nullable=False)
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_weeks: Mapped[int] = mapped_column(Integer, nullable=False)
    captain_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    member_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    captain: Mapped[User] = relationship(lazy="selectin")


class ContentColumn(Base, TimestampMixin):
    __tablename__ = "content_columns"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    cadence: Mapped[str] = mapped_column(String(128), nullable=False)
    article_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    author_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    tag: Mapped[str] = mapped_column(String(64), nullable=False)

    author: Mapped[User] = relationship(lazy="selectin")


class RankingEntry(Base, TimestampMixin):
    __tablename__ = "ranking_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period: Mapped[str] = mapped_column(
        String(32), default="weekly", nullable=False, index=True
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    headline: Mapped[str] = mapped_column(String(255), nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trend: Mapped[str] = mapped_column(String(16), default="flat", nullable=False)

    user: Mapped[User] = relationship(lazy="selectin")


class Tag(Base, TimestampMixin):
    """管理员维护的发帖标签库（白名单）。"""

    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Event(Base, TimestampMixin):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    city: Mapped[str] = mapped_column(String(128), nullable=False)
    event_date: Mapped[str] = mapped_column(String(32), nullable=False)
    event_time: Mapped[str] = mapped_column(String(64), nullable=False)
    host_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id"), nullable=False
    )
    seats_left: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    host: Mapped[User] = relationship(lazy="selectin")
