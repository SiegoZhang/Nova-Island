from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.schemas.common import BaseSchema, ORMSchema


class UserSummarySchema(ORMSchema):
    id: str
    username: str
    display_name: str
    avatar_url: str | None = None
    role: str


class AttachmentSchema(ORMSchema):
    id: str
    storage_key: str
    url: str
    original_name: str
    content_type: str
    size_bytes: int
    kind: str
    sort_order: int = 0


class AttachmentInput(BaseSchema):
    """发帖时引用已上传文件（须为本存储后端签发的 key/url）。"""

    storage_key: str = Field(min_length=1, max_length=512)
    url: str = Field(min_length=1, max_length=1024)
    original_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=128)
    size_bytes: int = Field(ge=0)


class UploadResultSchema(BaseSchema):
    storage_key: str
    url: str
    original_name: str
    content_type: str
    size_bytes: int
    kind: str


class ColumnSummarySchema(ORMSchema):
    id: str
    title: str
    tag: str


class TagSchema(ORMSchema):
    id: str
    name: str
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime


class CreateTagRequest(BaseSchema):
    name: str = Field(min_length=1, max_length=64)
    sort_order: int = Field(default=0, ge=0, le=9999)


class UpdateTagRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    sort_order: int | None = Field(default=None, ge=0, le=9999)


class PostSchema(ORMSchema):
    id: str
    author: UserSummarySchema
    title: str
    content: str
    excerpt: str | None = None
    cover_image_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    attachments: list[AttachmentSchema] = Field(default_factory=list)
    column_id: str | None = None
    column: ColumnSummarySchema | None = None
    status: str
    visibility: str
    is_featured: bool = False
    is_liked: bool = False
    is_bookmarked: bool = False
    like_count: int
    comment_count: int
    view_count: int
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CreatePostRequest(BaseSchema):
    title: str = Field(default="", max_length=200)
    content: str = Field(default="", max_length=50000)
    excerpt: str | None = Field(default=None, max_length=500)
    cover_image_url: str | None = Field(default=None, max_length=1024)
    tags: list[str] = Field(default_factory=list, max_length=10)
    attachments: list[AttachmentInput] = Field(default_factory=list, max_length=10)
    column_id: str | None = Field(default=None, max_length=64)
    status: str = Field(default="published", pattern="^(draft|published)$")
    visibility: str = Field(default="members", pattern="^(public|members)$")

    @model_validator(mode="after")
    def _require_fields_by_status(self) -> CreatePostRequest:
        title = self.title.strip()
        content = self.content.strip()
        if self.status == "published":
            if not title or not content:
                raise ValueError("发布需要填写标题和正文")
        elif not title and not content:
            raise ValueError("草稿至少填写标题或正文其一")
        return self


class UpdatePostRequest(BaseSchema):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, max_length=50000)
    excerpt: str | None = Field(default=None, max_length=500)
    cover_image_url: str | None = Field(default=None, max_length=1024)
    tags: list[str] | None = Field(default=None, max_length=10)
    # None = 不改附件；传列表（可空）= 全量替换
    attachments: list[AttachmentInput] | None = None
    column_id: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, pattern="^(draft|published|hidden)$")
    visibility: str | None = Field(default=None, pattern="^(public|members)$")


class SetPostColumnRequest(BaseSchema):
    """管理端将帖子归入/移出专栏；columnId 为 null 表示移出。"""

    column_id: str | None = Field(default=None, max_length=64)


def _require_non_blank_content(value: str) -> str:
    """评论正文去除首尾空白后不得为空（纯空格/换行/制表符视为空）。"""
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("评论内容不能为空")
    return trimmed


class CreateCommentRequest(BaseSchema):
    content: str = Field(min_length=1, max_length=2000)
    parent_id: str | None = None

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        return _require_non_blank_content(value)


class UpdateCommentRequest(BaseSchema):
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        return _require_non_blank_content(value)


class CommentSchema(ORMSchema):
    id: str
    post_id: str
    author: UserSummarySchema
    parent_id: str | None = None
    reply_to_user: UserSummarySchema | None = None
    content: str
    status: str
    is_liked: bool = False
    like_count: int
    reply_count: int
    created_at: datetime
    updated_at: datetime


class LikeStateSchema(BaseSchema):
    liked: bool
    like_count: int


class BookmarkStateSchema(BaseSchema):
    bookmarked: bool


class FeatureStateSchema(BaseSchema):
    featured: bool


class VoyageSchema(ORMSchema):
    id: str
    title: str
    summary: str
    category: str
    status: str
    duration_weeks: int
    captain: UserSummarySchema
    member_count: int
    capacity: int


class ColumnSchema(ORMSchema):
    id: str
    title: str
    description: str
    cadence: str
    article_count: int
    author: UserSummarySchema
    tag: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RankingEntrySchema(ORMSchema):
    rank: int
    user: UserSummarySchema
    headline: str
    score: int
    trend: str


class EventSchema(ORMSchema):
    id: str
    title: str
    description: str
    type: str
    city: str
    date: str = Field(validation_alias="event_date", serialization_alias="date")
    time: str = Field(validation_alias="event_time", serialization_alias="time")
    host: UserSummarySchema
    seats_left: int
