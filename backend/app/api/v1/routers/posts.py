from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import (
    CurrentUser,
    DbSession,
    PaginationDep,
    RequireStaff,
)
from app.core.config import get_settings
from app.core.exceptions import AppException
from app.core.roles import (
    can_delete_comment,
    can_edit_comment_content,
    can_edit_post_content,
    can_moderate_post,
    can_set_public_visibility,
    can_view_post,
    is_staff,
)
from app.core.storage import get_storage
from app.schemas.common import ApiResponse, PaginatedData, paginate, success_response
from app.schemas.community import (
    BookmarkStateSchema,
    CommentSchema,
    CreateCommentRequest,
    CreatePostRequest,
    FeatureStateSchema,
    LikeStateSchema,
    PostSchema,
    SetPostColumnRequest,
    UpdateCommentRequest,
    UpdatePostRequest,
)
from app.services import community
from app.services import tag as tag_service
from app.services.uploads import build_attachments

router = APIRouter(prefix="/posts", tags=["posts"])


def _serialize_post(
    post: community.Post,
    *,
    liked: bool = False,
    bookmarked: bool = False,
) -> PostSchema:
    schema = PostSchema.model_validate(post)
    schema.is_liked = liked
    schema.is_bookmarked = bookmarked
    return schema


async def _normalize_tags(db: DbSession, tags: list[str] | None) -> list[str] | None:
    if tags is None:
        return None
    try:
        return await tag_service.assert_tags_allowed(db, tags)
    except ValueError as exc:
        if str(exc) == "unknown_tags":
            raise AppException(
                code=400010,
                message="只能选择标签库中的标签",
                status_code=400,
            ) from exc
        raise


def _serialize_comment(
    comment: community.Comment, *, liked: bool = False
) -> CommentSchema:
    schema = CommentSchema.model_validate(comment)
    schema.is_liked = liked
    return schema


def _deny() -> None:
    raise AppException(code=403001, message="无权操作该内容", status_code=403)


def _not_found_post() -> AppException:
    return AppException(code=404001, message="内容不存在或已下架", status_code=404)


@router.get("", response_model=ApiResponse[PaginatedData[PostSchema]])
async def list_posts(
    db: DbSession,
    pagination: PaginationDep,
    viewer: CurrentUser,
    tag: Annotated[str | None, Query()] = None,
    featured: Annotated[bool | None, Query()] = None,
    column_id: Annotated[str | None, Query(alias="columnId")] = None,
) -> ApiResponse[PaginatedData[PostSchema]]:
    staff = is_staff(viewer.role)
    rows, total = await community.list_posts(
        db,
        page=pagination.page,
        page_size=pagination.page_size,
        tag=tag,
        featured=featured,
        column_id=column_id,
        viewer_authenticated=True,
        include_hidden=staff,
    )
    liked, bookmarked = await community.get_post_reaction_flags(
        db, user_id=viewer.id, post_ids=[p.id for p in rows]
    )
    data = paginate(
        [
            _serialize_post(p, liked=p.id in liked, bookmarked=p.id in bookmarked)
            for p in rows
        ],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.get("/tags", response_model=ApiResponse[list[str]])
async def list_post_tags(
    db: DbSession,
    viewer: CurrentUser,
    featured: Annotated[bool | None, Query()] = None,
) -> ApiResponse[list[str]]:
    tags = await community.list_post_tags(
        db,
        featured=featured,
        viewer_authenticated=True,
    )
    return success_response(tags)


@router.get("/search", response_model=ApiResponse[PaginatedData[PostSchema]])
async def search_posts(
    db: DbSession,
    pagination: PaginationDep,
    viewer: CurrentUser,
    q: Annotated[str, Query(min_length=1, max_length=100)],
) -> ApiResponse[PaginatedData[PostSchema]]:
    """搜索帖子标题 / 正文 / 摘要 / 标签；需登录。"""
    staff = is_staff(viewer.role)
    rows, total = await community.search_posts(
        db,
        q=q,
        page=pagination.page,
        page_size=pagination.page_size,
        viewer_authenticated=True,
        include_hidden=staff,
    )
    liked, bookmarked = await community.get_post_reaction_flags(
        db, user_id=viewer.id, post_ids=[p.id for p in rows]
    )
    data = paginate(
        [
            _serialize_post(p, liked=p.id in liked, bookmarked=p.id in bookmarked)
            for p in rows
        ],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.post("", response_model=ApiResponse[PostSchema])
async def create_post(
    body: CreatePostRequest,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[PostSchema]:
    if body.visibility == "public" and not can_set_public_visibility(
        role=current.role
    ):
        raise AppException(
            code=403003,
            message="普通岛民不能发布全站公开内容",
            status_code=403,
        )
    normalized_tags = await _normalize_tags(db, body.tags)
    settings = get_settings()
    attachment_rows = build_attachments(
        body.attachments,
        storage=get_storage(),
        settings=settings,
    )
    try:
        post = await community.create_post(
            db,
            author=current,
            title=body.title,
            content=body.content,
            excerpt=body.excerpt,
            cover_image_url=body.cover_image_url,
            tags=normalized_tags,
            attachments=attachment_rows,
            column_id=body.column_id,
            status=body.status,
            visibility=body.visibility,
        )
    except ValueError as exc:
        if str(exc) == "column_not_found":
            raise AppException(
                code=404006, message="专栏不存在", status_code=404
            ) from exc
        raise
    message = "已保存草稿" if body.status == "draft" else "发布成功"
    return success_response(_serialize_post(post), message=message)

@router.get("/{post_id}", response_model=ApiResponse[PostSchema])
async def get_post(
    post_id: str,
    db: DbSession,
    viewer: CurrentUser,
) -> ApiResponse[PostSchema]:
    post = await community.get_post(db, post_id)
    if post is None:
        raise _not_found_post()

    visible = can_view_post(
        status=post.status,
        visibility=post.visibility,
        author_id=post.author_id,
        viewer_id=viewer.id,
        viewer_role=viewer.role,
    )
    if not visible:
        raise _not_found_post()

    if post.status == "published":
        await community.register_post_view(db, post)

    liked_ids, bookmarked_ids = await community.get_post_reaction_flags(
        db, user_id=viewer.id, post_ids=[post.id]
    )
    return success_response(
        _serialize_post(
            post,
            liked=post.id in liked_ids,
            bookmarked=post.id in bookmarked_ids,
        )
    )


@router.patch("/{post_id}", response_model=ApiResponse[PostSchema])
async def update_post(
    post_id: str,
    body: UpdatePostRequest,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[PostSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status == "deleted":
        raise AppException(code=404001, message="内容不存在", status_code=404)
    if not can_edit_post_content(
        user_id=current.id, role=current.role, author_id=post.author_id
    ):
        _deny()

    if (
        body.visibility == "public"
        and not can_set_public_visibility(role=current.role)
    ):
        raise AppException(
            code=403003,
            message="普通岛民不能将内容设为全站公开",
            status_code=403,
        )

    if body.status == "draft" and post.status == "published":
        raise AppException(
            code=400011,
            message="已发布内容不能改回草稿，如需下架请使用隐藏",
            status_code=400,
        )

    if body.status == "published":
        next_title = (body.title if body.title is not None else post.title).strip()
        next_content = (
            body.content if body.content is not None else post.content
        ).strip()
        if not next_title or not next_content:
            raise AppException(
                code=400001,
                message="发布需要填写标题和正文",
                status_code=400,
            )

    if body.status == "draft" or (body.status is None and post.status == "draft"):
        next_title = (body.title if body.title is not None else post.title).strip()
        next_content = (
            body.content if body.content is not None else post.content
        ).strip()
        if not next_title and not next_content:
            raise AppException(
                code=400001,
                message="草稿至少填写标题或正文其一",
                status_code=400,
            )

    normalized_tags = await _normalize_tags(db, body.tags)

    try:
        post = await community.update_post(
            db,
            post,
            title=body.title,
            content=body.content,
            excerpt=body.excerpt,
            cover_image_url=body.cover_image_url,
            tags=normalized_tags,
            attachments=(
                build_attachments(
                    body.attachments,
                    storage=get_storage(),
                    settings=get_settings(),
                )
                if body.attachments is not None
                else None
            ),
            replace_attachments=body.attachments is not None,
            status=body.status,
            visibility=body.visibility,
        )
    except ValueError as exc:
        if str(exc) == "published_to_draft_forbidden":
            raise AppException(
                code=400011,
                message="已发布内容不能改回草稿，如需下架请使用隐藏",
                status_code=400,
            ) from exc
        raise
    return success_response(_serialize_post(post), message="已更新")

@router.delete("/{post_id}", response_model=ApiResponse[None])
async def delete_post(
    post_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[None]:
    post = await community.get_post(db, post_id)
    if post is None or post.status == "deleted":
        raise AppException(code=404001, message="内容不存在", status_code=404)
    if not can_moderate_post(
        user_id=current.id, role=current.role, author_id=post.author_id
    ):
        _deny()
    await community.soft_delete_post(db, post)
    return success_response(None, message="已删除")


@router.post("/{post_id}/feature", response_model=ApiResponse[FeatureStateSchema])
async def feature_post(
    post_id: str,
    db: DbSession,
    _staff: RequireStaff,
) -> ApiResponse[FeatureStateSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status == "deleted":
        raise AppException(code=404001, message="内容不存在", status_code=404)
    post = await community.set_post_featured(db, post, featured=True)
    return success_response(
        FeatureStateSchema(featured=True), message="已加精"
    )


@router.delete("/{post_id}/feature", response_model=ApiResponse[FeatureStateSchema])
async def unfeature_post(
    post_id: str,
    db: DbSession,
    _staff: RequireStaff,
) -> ApiResponse[FeatureStateSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status == "deleted":
        raise AppException(code=404001, message="内容不存在", status_code=404)
    post = await community.set_post_featured(db, post, featured=False)
    return success_response(
        FeatureStateSchema(featured=False), message="已取消加精"
    )


@router.put("/{post_id}/column", response_model=ApiResponse[PostSchema])
async def set_post_column(
    post_id: str,
    body: SetPostColumnRequest,
    db: DbSession,
    _staff: RequireStaff,
) -> ApiResponse[PostSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status == "deleted":
        raise AppException(code=404001, message="内容不存在", status_code=404)
    try:
        post = await community.set_post_column(db, post, column_id=body.column_id)
    except ValueError as exc:
        if str(exc) == "column_not_found":
            raise AppException(
                code=404006, message="专栏不存在", status_code=404
            ) from exc
        raise
    return success_response(_serialize_post(post), message="已更新专栏归属")


@router.post("/{post_id}/hide", response_model=ApiResponse[PostSchema])
async def hide_post(
    post_id: str,
    db: DbSession,
    _staff: RequireStaff,
) -> ApiResponse[PostSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status == "deleted":
        raise AppException(code=404001, message="内容不存在", status_code=404)
    post = await community.set_post_status(db, post, status="hidden")
    return success_response(_serialize_post(post), message="已隐藏")


@router.post("/{post_id}/unhide", response_model=ApiResponse[PostSchema])
async def unhide_post(
    post_id: str,
    db: DbSession,
    _staff: RequireStaff,
) -> ApiResponse[PostSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status == "deleted":
        raise AppException(code=404001, message="内容不存在", status_code=404)
    post = await community.set_post_status(db, post, status="published")
    return success_response(_serialize_post(post), message="已恢复公开")


@router.post("/{post_id}/like", response_model=ApiResponse[LikeStateSchema])
async def like_post(
    post_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[LikeStateSchema]:
    post = await community.get_post(db, post_id)
    if post is None or not can_view_post(
        status=post.status,
        visibility=post.visibility,
        author_id=post.author_id,
        viewer_id=current.id,
        viewer_role=current.role,
    ):
        raise _not_found_post()
    if post.status != "published":
        raise _not_found_post()
    await community.like_post(db, user=current, post=post)
    return success_response(
        LikeStateSchema(liked=True, like_count=post.like_count),
        message="已点赞",
    )


@router.delete("/{post_id}/like", response_model=ApiResponse[LikeStateSchema])
async def unlike_post(
    post_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[LikeStateSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status != "published":
        raise _not_found_post()
    await community.unlike_post(db, user=current, post=post)
    return success_response(
        LikeStateSchema(liked=False, like_count=post.like_count),
        message="已取消点赞",
    )


@router.post("/{post_id}/bookmark", response_model=ApiResponse[BookmarkStateSchema])
async def bookmark_post(
    post_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[BookmarkStateSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status != "published":
        raise _not_found_post()
    await community.bookmark_post(db, user=current, post=post)
    return success_response(BookmarkStateSchema(bookmarked=True), message="已收藏")


@router.delete("/{post_id}/bookmark", response_model=ApiResponse[BookmarkStateSchema])
async def unbookmark_post(
    post_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[BookmarkStateSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status != "published":
        raise _not_found_post()
    await community.unbookmark_post(db, user=current, post=post)
    return success_response(BookmarkStateSchema(bookmarked=False), message="已取消收藏")


@router.get(
    "/{post_id}/comments",
    response_model=ApiResponse[PaginatedData[CommentSchema]],
)
async def list_post_comments(
    post_id: str,
    db: DbSession,
    pagination: PaginationDep,
    viewer: CurrentUser,
) -> ApiResponse[PaginatedData[CommentSchema]]:
    post = await community.get_post(db, post_id)
    if post is None or not can_view_post(
        status=post.status,
        visibility=post.visibility,
        author_id=post.author_id,
        viewer_id=viewer.id,
        viewer_role=viewer.role,
    ):
        raise AppException(code=404001, message="内容不存在", status_code=404)

    rows, total = await community.list_comments(
        db,
        post_id=post_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    liked_ids = await community.get_comment_liked_ids(
        db, user_id=viewer.id, comment_ids=[c.id for c in rows]
    )
    data = paginate(
        [_serialize_comment(c, liked=c.id in liked_ids) for c in rows],
        page=pagination.page,
        page_size=pagination.page_size,
        total=total,
    )
    return success_response(data)


@router.post(
    "/{post_id}/comments",
    response_model=ApiResponse[CommentSchema],
)
async def create_post_comment(
    post_id: str,
    body: CreateCommentRequest,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[CommentSchema]:
    post = await community.get_post(db, post_id)
    if post is None or post.status != "published":
        raise _not_found_post()
    if not can_view_post(
        status=post.status,
        visibility=post.visibility,
        author_id=post.author_id,
        viewer_id=current.id,
        viewer_role=current.role,
    ):
        raise _not_found_post()

    try:
        comment = await community.create_comment(
            db,
            post=post,
            author=current,
            content=body.content,
            parent_id=body.parent_id,
        )
    except ValueError:
        raise AppException(
            code=400004, message="回复的评论不存在", status_code=400
        ) from None

    return success_response(_serialize_comment(comment), message="评论已发布")


@router.patch(
    "/{post_id}/comments/{comment_id}",
    response_model=ApiResponse[CommentSchema],
)
async def update_post_comment(
    post_id: str,
    comment_id: str,
    body: UpdateCommentRequest,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[CommentSchema]:
    comment = await community.get_comment(db, comment_id)
    if (
        comment is None
        or comment.post_id != post_id
        or comment.status != "published"
    ):
        raise AppException(code=404003, message="评论不存在", status_code=404)
    if not can_edit_comment_content(
        user_id=current.id, author_id=comment.author_id
    ):
        raise AppException(code=403001, message="无权操作该评论", status_code=403)

    comment = await community.update_comment(db, comment, content=body.content)
    return success_response(_serialize_comment(comment), message="评论已更新")


@router.delete(
    "/{post_id}/comments/{comment_id}",
    response_model=ApiResponse[None],
)
async def delete_post_comment(
    post_id: str,
    comment_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[None]:
    post = await community.get_post(db, post_id)
    comment = await community.get_comment(db, comment_id)
    if (
        post is None
        or comment is None
        or comment.post_id != post_id
        or comment.status == "deleted"
    ):
        raise AppException(code=404003, message="评论不存在", status_code=404)
    if not can_delete_comment(
        user_id=current.id, role=current.role, author_id=comment.author_id
    ):
        raise AppException(code=403001, message="无权操作该评论", status_code=403)

    await community.soft_delete_comment(db, comment=comment, post=post)
    return success_response(None, message="评论已删除")


@router.post(
    "/{post_id}/comments/{comment_id}/like",
    response_model=ApiResponse[LikeStateSchema],
)
async def like_comment(
    post_id: str,
    comment_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[LikeStateSchema]:
    comment = await community.get_comment(db, comment_id)
    if (
        comment is None
        or comment.post_id != post_id
        or comment.status != "published"
    ):
        raise AppException(code=404003, message="评论不存在", status_code=404)
    await community.like_comment(db, user=current, comment=comment)
    return success_response(
        LikeStateSchema(liked=True, like_count=comment.like_count),
        message="已点赞",
    )


@router.delete(
    "/{post_id}/comments/{comment_id}/like",
    response_model=ApiResponse[LikeStateSchema],
)
async def unlike_comment(
    post_id: str,
    comment_id: str,
    db: DbSession,
    current: CurrentUser,
) -> ApiResponse[LikeStateSchema]:
    comment = await community.get_comment(db, comment_id)
    if (
        comment is None
        or comment.post_id != post_id
        or comment.status != "published"
    ):
        raise AppException(code=404003, message="评论不存在", status_code=404)
    await community.unlike_comment(db, user=current, comment=comment)
    return success_response(
        LikeStateSchema(liked=False, like_count=comment.like_count),
        message="已取消点赞",
    )
