from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Comment,
    CommentLike,
    ContentColumn,
    Event,
    Follow,
    Post,
    PostBookmark,
    PostLike,
    RankingEntry,
    User,
    Voyage,
)

_POST_LOAD = (
    selectinload(Post.attachments),
    selectinload(Post.author),
    selectinload(Post.column),
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _excerpt_from(content: str, excerpt: str | None) -> str | None:
    if excerpt is not None and excerpt.strip():
        return excerpt.strip()[:500]
    cleaned = " ".join(content.split())
    if not cleaned:
        return None
    return cleaned[:160] + ("…" if len(cleaned) > 160 else "")


async def list_posts(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    tag: str | None = None,
    featured: bool | None = None,
    author_id: str | None = None,
    column_id: str | None = None,
    include_drafts_for: str | None = None,
    viewer_authenticated: bool = False,
    include_hidden: bool = False,
) -> tuple[list[Post], int]:
    if include_hidden:
        base = select(Post).where(Post.status.in_(("published", "hidden")))
    elif include_drafts_for:
        base = select(Post).where(
            (Post.status == "published")
            | ((Post.status == "draft") & (Post.author_id == include_drafts_for))
        )
    else:
        base = select(Post).where(Post.status == "published")

    if not viewer_authenticated:
        base = base.where(Post.visibility == "public")

    if featured is not None:
        base = base.where(Post.is_featured.is_(featured))
    if author_id is not None:
        base = base.where(Post.author_id == author_id)
    if column_id is not None:
        base = base.where(Post.column_id == column_id)

    ordered = base.options(*_POST_LOAD).order_by(
        Post.published_at.is_(None),
        Post.published_at.desc(),
        Post.created_at.desc(),
    )

    if tag:
        rows = (await db.scalars(ordered)).all()
        filtered = [post for post in rows if tag in (post.tags or [])]
        total = len(filtered)
        start = (page - 1) * page_size
        return filtered[start : start + page_size], total

    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    page_rows = (
        await db.scalars(ordered.offset((page - 1) * page_size).limit(page_size))
    ).all()
    return list(page_rows), int(total or 0)


async def list_admin_posts(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    status: str,
    featured: bool | None = None,
    q: str | None = None,
) -> tuple[list[Post], int]:
    """管理后台内容队列：按状态筛选 published / hidden，不含 draft/deleted。"""
    if status not in ("published", "hidden"):
        raise ValueError(f"unsupported admin post status: {status}")

    base = select(Post).where(Post.status == status)
    if featured is not None:
        base = base.where(Post.is_featured.is_(featured))

    keyword = (q or "").strip()
    if keyword:
        pattern = f"%{keyword}%"
        base = base.where(
            or_(
                Post.title.ilike(pattern),
                Post.excerpt.ilike(pattern),
                cast(Post.tags, String).ilike(pattern),
            )
        )

    ordered = base.options(*_POST_LOAD).order_by(
        Post.updated_at.desc(),
        Post.created_at.desc(),
    )
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    page_rows = (
        await db.scalars(ordered.offset((page - 1) * page_size).limit(page_size))
    ).all()
    return list(page_rows), int(total or 0)


async def get_post(db: AsyncSession, post_id: str) -> Post | None:
    return await db.scalar(
        select(Post).where(Post.id == post_id).options(*_POST_LOAD)
    )


async def search_posts(
    db: AsyncSession,
    *,
    q: str,
    page: int,
    page_size: int,
    viewer_authenticated: bool = False,
    include_hidden: bool = False,
) -> tuple[list[Post], int]:
    """按标题 / 正文 / 摘要 / 标签模糊搜索（首期 LIKE，兼容 MySQL 与 sqlite）。"""
    keyword = q.strip()
    if not keyword:
        return [], 0

    pattern = f"%{keyword}%"
    filters = []
    if include_hidden:
        filters.append(Post.status.in_(("published", "hidden")))
    else:
        filters.append(Post.status == "published")

    if not viewer_authenticated:
        filters.append(Post.visibility == "public")

    filters.append(
        or_(
            Post.title.ilike(pattern),
            Post.content.ilike(pattern),
            Post.excerpt.ilike(pattern),
            cast(Post.tags, String).ilike(pattern),
        )
    )

    total = await db.scalar(
        select(func.count()).select_from(Post).where(*filters)
    )
    rows = (
        await db.scalars(
            select(Post)
            .where(*filters)
            .options(*_POST_LOAD)
            .order_by(
                Post.published_at.is_(None),
                Post.published_at.desc(),
                Post.created_at.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)


async def list_post_tags(
    db: AsyncSession,
    *,
    featured: bool | None = None,
    viewer_authenticated: bool = False,
) -> list[str]:
    """返回当前筛选范围内实际出现过的标签，按出现次数降序。"""
    base = select(Post).where(Post.status == "published")
    if not viewer_authenticated:
        base = base.where(Post.visibility == "public")
    if featured is not None:
        base = base.where(Post.is_featured.is_(featured))

    rows = (await db.scalars(base)).all()
    counts: dict[str, int] = {}
    for post in rows:
        for tag in post.tags or []:
            name = tag.strip() if isinstance(tag, str) else ""
            if not name:
                continue
            counts[name] = counts.get(name, 0) + 1
    return sorted(counts.keys(), key=lambda name: (-counts[name], name))


async def create_post(
    db: AsyncSession,
    *,
    author: User,
    title: str,
    content: str,
    excerpt: str | None = None,
    cover_image_url: str | None = None,
    tags: list[str] | None = None,
    attachments: list | None = None,
    column_id: str | None = None,
    status: str = "published",
    visibility: str = "members",
) -> Post:
    now = _utcnow()
    if column_id is not None:
        column = await get_column(db, column_id)
        if column is None:
            raise ValueError("column_not_found")
    post = Post(
        id=f"p_{uuid.uuid4().hex[:20]}",
        author_id=author.id,
        column_id=column_id,
        title=title.strip(),
        content=content.strip(),
        excerpt=_excerpt_from(content, excerpt),
        cover_image_url=cover_image_url,
        tags=[t.strip() for t in (tags or []) if t.strip()][:10],
        status=status,
        visibility=visibility,
        is_featured=False,
        published_at=now if status == "published" else None,
    )
    db.add(post)
    if attachments:
        for row in attachments:
            row.post_id = post.id
            db.add(row)
    if status == "published":
        author.post_count += 1
        if column_id is not None:
            column = await get_column(db, column_id)
            if column is not None:
                column.article_count += 1
    await db.commit()
    loaded = await get_post(db, post.id)
    assert loaded is not None
    return loaded


async def update_post(
    db: AsyncSession,
    post: Post,
    *,
    title: str | None = None,
    content: str | None = None,
    excerpt: str | None = None,
    cover_image_url: str | None = None,
    tags: list[str] | None = None,
    attachments: list | None = None,
    replace_attachments: bool = False,
    status: str | None = None,
    visibility: str | None = None,
) -> Post:
    if title is not None:
        post.title = title.strip()
    if content is not None:
        post.content = content.strip()
        if excerpt is None:
            post.excerpt = _excerpt_from(content, post.excerpt)
    if excerpt is not None:
        post.excerpt = _excerpt_from(post.content, excerpt)
    if cover_image_url is not None:
        post.cover_image_url = cover_image_url or None
    if tags is not None:
        post.tags = [t.strip() for t in tags if t.strip()][:10]
    if visibility is not None:
        post.visibility = visibility
    if status is not None:
        prev = post.status
        if prev == "published" and status == "draft":
            raise ValueError("published_to_draft_forbidden")
        post.status = status
        if status == "published" and prev != "published":
            if post.published_at is None:
                post.published_at = _utcnow()
            # 草稿首次发布：计入作者帖子数
            if prev == "draft" and post.author is not None:
                post.author.post_count += 1
                if post.column_id is not None:
                    column = await get_column(db, post.column_id)
                    if column is not None:
                        column.article_count += 1
    if replace_attachments:
        post.attachments.clear()
        await db.flush()
        for row in attachments or []:
            row.post_id = post.id
            db.add(row)
    await db.commit()
    loaded = await get_post(db, post.id)
    assert loaded is not None
    return loaded


async def soft_delete_post(db: AsyncSession, post: Post) -> None:
    if post.status == "deleted":
        return
    was_published = post.status == "published"
    post.status = "deleted"
    if was_published and post.author is not None:
        post.author.post_count = max(0, post.author.post_count - 1)
    if was_published and post.column_id is not None:
        column = await get_column(db, post.column_id)
        if column is not None:
            column.article_count = max(0, column.article_count - 1)
        post.column_id = None
    await db.commit()


async def list_draft_posts(
    db: AsyncSession,
    *,
    author_id: str,
    page: int,
    page_size: int,
) -> tuple[list[Post], int]:
    """当前用户草稿，按更新时间倒序。"""
    filters = (Post.author_id == author_id, Post.status == "draft")
    total = await db.scalar(
        select(func.count()).select_from(Post).where(*filters)
    )
    rows = (
        await db.scalars(
            select(Post)
            .options(*_POST_LOAD)
            .where(*filters)
            .order_by(Post.updated_at.desc(), Post.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)

async def set_post_featured(
    db: AsyncSession, post: Post, *, featured: bool
) -> Post:
    post.is_featured = featured
    await db.commit()
    loaded = await get_post(db, post.id)
    assert loaded is not None
    return loaded


async def set_post_column(
    db: AsyncSession, post: Post, *, column_id: str | None
) -> Post:
    """将帖子归入或移出专栏，并校准 article_count。"""
    old_id = post.column_id
    if old_id == column_id:
        loaded = await get_post(db, post.id)
        assert loaded is not None
        return loaded

    if column_id is not None:
        target = await get_column(db, column_id)
        if target is None:
            raise ValueError("column_not_found")

    if old_id is not None:
        old = await get_column(db, old_id)
        if old is not None:
            old.article_count = max(0, old.article_count - 1)

    post.column_id = column_id
    if column_id is not None:
        target = await get_column(db, column_id)
        if target is not None:
            target.article_count += 1

    await db.commit()
    loaded = await get_post(db, post.id)
    assert loaded is not None
    return loaded


async def set_post_status(db: AsyncSession, post: Post, *, status: str) -> Post:
    prev = post.status
    post.status = status
    if status == "published" and prev != "published" and post.published_at is None:
        post.published_at = _utcnow()
    await db.commit()
    loaded = await get_post(db, post.id)
    assert loaded is not None
    return loaded


async def register_post_view(db: AsyncSession, post: Post) -> None:
    post.view_count += 1
    await db.commit()


async def get_post_reaction_flags(
    db: AsyncSession, *, user_id: str, post_ids: list[str]
) -> tuple[set[str], set[str]]:
    if not post_ids:
        return set(), set()
    liked = set(
        (
            await db.scalars(
                select(PostLike.post_id).where(
                    PostLike.user_id == user_id,
                    PostLike.post_id.in_(post_ids),
                )
            )
        ).all()
    )
    bookmarked = set(
        (
            await db.scalars(
                select(PostBookmark.post_id).where(
                    PostBookmark.user_id == user_id,
                    PostBookmark.post_id.in_(post_ids),
                )
            )
        ).all()
    )
    return liked, bookmarked


async def like_post(db: AsyncSession, *, user: User, post: Post) -> bool:
    existing = await db.get(PostLike, (user.id, post.id))
    if existing is not None:
        return False
    db.add(PostLike(user_id=user.id, post_id=post.id))
    post.like_count += 1
    from app.services.notifications import queue_notification

    queue_notification(
        db,
        recipient_id=post.author_id,
        actor_id=user.id,
        type="post_like",
        post_id=post.id,
    )
    await db.commit()
    return True


async def unlike_post(db: AsyncSession, *, user: User, post: Post) -> bool:
    existing = await db.get(PostLike, (user.id, post.id))
    if existing is None:
        return False
    await db.delete(existing)
    post.like_count = max(0, post.like_count - 1)
    await db.commit()
    return True


async def bookmark_post(db: AsyncSession, *, user: User, post: Post) -> bool:
    existing = await db.get(PostBookmark, (user.id, post.id))
    if existing is not None:
        return False
    db.add(PostBookmark(user_id=user.id, post_id=post.id))
    await db.commit()
    return True


async def unbookmark_post(db: AsyncSession, *, user: User, post: Post) -> bool:
    existing = await db.get(PostBookmark, (user.id, post.id))
    if existing is None:
        return False
    await db.delete(existing)
    await db.commit()
    return True


async def is_post_bookmarked(db: AsyncSession, *, user_id: str, post_id: str) -> bool:
    return await db.get(PostBookmark, (user_id, post_id)) is not None


async def list_bookmarked_posts(
    db: AsyncSession,
    *,
    user_id: str,
    page: int,
    page_size: int,
) -> tuple[list[Post], int]:
    """用户收藏的已发布帖，按收藏时间倒序（公开可读，登录社区内）。"""
    filters = (
        PostBookmark.user_id == user_id,
        Post.status == "published",
    )
    total = await db.scalar(
        select(func.count())
        .select_from(PostBookmark)
        .join(Post, Post.id == PostBookmark.post_id)
        .where(*filters)
    )
    rows = (
        await db.scalars(
            select(Post)
            .options(*_POST_LOAD)
            .join(PostBookmark, PostBookmark.post_id == Post.id)
            .where(*filters)
            .order_by(PostBookmark.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)


async def list_following_posts(
    db: AsyncSession,
    *,
    follower_id: str,
    page: int,
    page_size: int,
) -> tuple[list[Post], int]:
    """关注的人发布的已发布帖，按发布时间倒序。"""
    filters = (
        Follow.follower_id == follower_id,
        Post.status == "published",
    )
    total = await db.scalar(
        select(func.count())
        .select_from(Post)
        .join(Follow, Follow.following_id == Post.author_id)
        .where(*filters)
    )
    rows = (
        await db.scalars(
            select(Post)
            .options(*_POST_LOAD)
            .join(Follow, Follow.following_id == Post.author_id)
            .where(*filters)
            .order_by(
                Post.published_at.is_(None),
                Post.published_at.desc(),
                Post.created_at.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), int(total or 0)


async def list_comments(
    db: AsyncSession,
    *,
    post_id: str,
    page: int,
    page_size: int,
) -> tuple[list[Comment], int]:
    base = select(Comment).where(
        Comment.post_id == post_id,
        Comment.status == "published",
    )
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    ordered = base.order_by(Comment.created_at.asc())
    rows = (
        await db.scalars(ordered.offset((page - 1) * page_size).limit(page_size))
    ).all()
    return list(rows), int(total or 0)


async def get_comment(db: AsyncSession, comment_id: str) -> Comment | None:
    return await db.get(Comment, comment_id)


async def create_comment(
    db: AsyncSession,
    *,
    post: Post,
    author: User,
    content: str,
    parent_id: str | None = None,
) -> Comment:
    """创建评论。最多 2 层：回复「回复」时挂到根评论下，reply_to 仍指向被回复者。"""
    stored_parent_id: str | None = None
    reply_to_user_id: str | None = None
    if parent_id:
        parent = await db.get(Comment, parent_id)
        if parent is None or parent.post_id != post.id or parent.status != "published":
            raise ValueError("parent_not_found")
        reply_to_user_id = parent.author_id
        root = parent
        if parent.parent_id:
            root = await db.get(Comment, parent.parent_id)
            if (
                root is None
                or root.post_id != post.id
                or root.status != "published"
                or root.parent_id is not None
            ):
                raise ValueError("parent_not_found")
        stored_parent_id = root.id
        root.reply_count += 1

    comment = Comment(
        id=f"c_{uuid.uuid4().hex[:20]}",
        post_id=post.id,
        author_id=author.id,
        parent_id=stored_parent_id,
        reply_to_user_id=reply_to_user_id,
        content=content.strip(),
        status="published",
    )
    db.add(comment)
    post.comment_count += 1
    # 先 flush 评论，再写带 comment_id 的通知，避免 MySQL FK 1452
    await db.flush()

    from app.services.notifications import queue_notification

    # 回复：通知被回复者
    if reply_to_user_id:
        queue_notification(
            db,
            recipient_id=reply_to_user_id,
            actor_id=author.id,
            type="reply",
            post_id=post.id,
            comment_id=comment.id,
        )
    # 评论帖子：通知楼主（若不是被回复者本人，避免重复）
    if post.author_id != reply_to_user_id:
        queue_notification(
            db,
            recipient_id=post.author_id,
            actor_id=author.id,
            type="comment",
            post_id=post.id,
            comment_id=comment.id,
        )

    await db.commit()

    loaded = await db.scalar(select(Comment).where(Comment.id == comment.id))
    assert loaded is not None
    return loaded


async def update_comment(
    db: AsyncSession, comment: Comment, *, content: str
) -> Comment:
    comment.content = content.strip()
    await db.commit()
    await db.refresh(comment)
    return comment


async def soft_delete_comment(
    db: AsyncSession, *, comment: Comment, post: Post
) -> None:
    if comment.status == "deleted":
        return
    comment.status = "deleted"
    post.comment_count = max(0, post.comment_count - 1)

    if comment.parent_id is None:
        # 删除根评论时级联软删其下回复，避免孤儿评论
        children = (
            await db.scalars(
                select(Comment).where(
                    Comment.parent_id == comment.id,
                    Comment.status == "published",
                )
            )
        ).all()
        for child in children:
            child.status = "deleted"
            post.comment_count = max(0, post.comment_count - 1)
        comment.reply_count = 0
    else:
        parent = await db.get(Comment, comment.parent_id)
        if parent is not None:
            parent.reply_count = max(0, parent.reply_count - 1)

    await db.commit()


async def get_comment_liked_ids(
    db: AsyncSession, *, user_id: str, comment_ids: list[str]
) -> set[str]:
    if not comment_ids:
        return set()
    return set(
        (
            await db.scalars(
                select(CommentLike.comment_id).where(
                    CommentLike.user_id == user_id,
                    CommentLike.comment_id.in_(comment_ids),
                )
            )
        ).all()
    )


async def like_comment(db: AsyncSession, *, user: User, comment: Comment) -> bool:
    existing = await db.get(CommentLike, (user.id, comment.id))
    if existing is not None:
        return False
    db.add(CommentLike(user_id=user.id, comment_id=comment.id))
    comment.like_count += 1
    await db.commit()
    return True


async def unlike_comment(db: AsyncSession, *, user: User, comment: Comment) -> bool:
    existing = await db.get(CommentLike, (user.id, comment.id))
    if existing is None:
        return False
    await db.delete(existing)
    comment.like_count = max(0, comment.like_count - 1)
    await db.commit()
    return True


async def list_voyages(db: AsyncSession) -> list[Voyage]:
    rows = await db.scalars(select(Voyage).order_by(Voyage.created_at.asc()))
    return list(rows.all())


async def list_columns(db: AsyncSession) -> list[ContentColumn]:
    rows = await db.scalars(
        select(ContentColumn).order_by(ContentColumn.created_at.asc())
    )
    return list(rows.all())


async def get_column(db: AsyncSession, column_id: str) -> ContentColumn | None:
    return await db.get(ContentColumn, column_id)


async def list_rankings(
    db: AsyncSession, *, period: str = "weekly"
) -> list[RankingEntry]:
    rows = await db.scalars(
        select(RankingEntry)
        .where(RankingEntry.period == period)
        .order_by(RankingEntry.rank.asc())
    )
    return list(rows.all())


async def list_events(db: AsyncSession) -> list[Event]:
    rows = await db.scalars(select(Event).order_by(Event.event_date.asc()))
    return list(rows.all())
