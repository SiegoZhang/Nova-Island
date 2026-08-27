"""榜单贡献值重算。

产品口径（已定）：
- 权重：赞×1 + 评×2 + 粉×3
- 本周 / 本月：窗口内「获赞次数 / 被评次数 / 新增粉丝」
- 总榜：帖子累计赞评计数 + 当前粉丝总数
- 冷启动：周期窗口内无任何互动事件时，退回总榜同口径，避免空榜
- 触发：每日 03:00、管理员 POST /rankings/recalculate、导入结束后全量重算
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheBackend
from app.models import Comment, Follow, Post, PostLike, RankingEntry, User

RANKING_PERIODS = ("weekly", "monthly", "all")
LIKE_WEIGHT = 1
COMMENT_WEIGHT = 2
FOLLOWER_WEIGHT = 3
DEFAULT_TOP_N = 50


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _window_start(period: str, *, now: datetime | None = None) -> datetime | None:
    current = now or _utcnow()
    if period == "weekly":
        return current - timedelta(days=7)
    if period == "monthly":
        return current - timedelta(days=30)
    if period == "all":
        return None
    raise ValueError(f"unsupported ranking period: {period}")


def _trend(prev_rank: int | None, new_rank: int) -> str:
    if prev_rank is None:
        return "up"
    if new_rank < prev_rank:
        return "up"
    if new_rank > prev_rank:
        return "down"
    return "flat"


async def _headline_for_user(db: AsyncSession, *, user_id: str) -> str:
    title = await db.scalar(
        select(Post.title)
        .where(Post.author_id == user_id, Post.status == "published")
        .order_by(
            (Post.like_count + Post.comment_count).desc(),
            Post.published_at.desc(),
        )
        .limit(1)
    )
    if title and title.strip():
        cleaned = title.strip()
        return cleaned if len(cleaned) <= 40 else cleaned[:39] + "…"
    return "持续贡献中的岛民"


async def _agg_all_time(db: AsyncSession) -> dict[str, tuple[int, int, int]]:
    """author_id -> (likes, comments, followers)。"""
    post_rows = (
        await db.execute(
            select(
                Post.author_id,
                func.coalesce(func.sum(Post.like_count), 0),
                func.coalesce(func.sum(Post.comment_count), 0),
            )
            .where(Post.status == "published")
            .group_by(Post.author_id)
        )
    ).all()
    post_map = {
        author_id: (int(likes or 0), int(comments or 0))
        for author_id, likes, comments in post_rows
    }
    follower_rows = (
        await db.execute(
            select(User.id, User.follower_count).where(User.status == "active")
        )
    ).all()
    result: dict[str, tuple[int, int, int]] = {}
    for user_id, follower_count in follower_rows:
        likes, comments = post_map.get(user_id, (0, 0))
        result[user_id] = (likes, comments, int(follower_count or 0))
    for user_id, (likes, comments) in post_map.items():
        if user_id not in result:
            result[user_id] = (likes, comments, 0)
    return result


async def _agg_window(
    db: AsyncSession, *, since: datetime
) -> dict[str, tuple[int, int, int]]:
    """窗口内：获赞次数 / 被评次数 / 新增粉丝数。"""
    like_rows = (
        await db.execute(
            select(Post.author_id, func.count())
            .select_from(PostLike)
            .join(Post, Post.id == PostLike.post_id)
            .where(
                Post.status == "published",
                PostLike.created_at >= since,
            )
            .group_by(Post.author_id)
        )
    ).all()
    comment_rows = (
        await db.execute(
            select(Post.author_id, func.count())
            .select_from(Comment)
            .join(Post, Post.id == Comment.post_id)
            .where(
                Post.status == "published",
                Comment.status == "published",
                Comment.created_at >= since,
            )
            .group_by(Post.author_id)
        )
    ).all()
    follow_rows = (
        await db.execute(
            select(Follow.following_id, func.count())
            .where(Follow.created_at >= since)
            .group_by(Follow.following_id)
        )
    ).all()

    likes_map = {uid: int(n) for uid, n in like_rows}
    comments_map = {uid: int(n) for uid, n in comment_rows}
    follows_map = {uid: int(n) for uid, n in follow_rows}
    user_ids = set(likes_map) | set(comments_map) | set(follows_map)
    return {
        uid: (
            likes_map.get(uid, 0),
            comments_map.get(uid, 0),
            follows_map.get(uid, 0),
        )
        for uid in user_ids
    }


async def recalculate_period(
    db: AsyncSession,
    *,
    period: str,
    top_n: int = DEFAULT_TOP_N,
) -> int:
    """重算单个周期；返回写入条数。"""
    if period not in RANKING_PERIODS:
        raise ValueError(f"unsupported ranking period: {period}")

    since = _window_start(period)
    prev_rows = (
        await db.scalars(
            select(RankingEntry).where(RankingEntry.period == period)
        )
    ).all()
    prev_rank = {row.user_id: row.rank for row in prev_rows}

    used_fallback = False
    if since is None:
        aggregates = await _agg_all_time(db)
    else:
        aggregates = await _agg_window(db, since=since)
        # 3B 冷启动：窗口内尚无互动事件时，退回累计贡献
        if not aggregates:
            aggregates = await _agg_all_time(db)
            used_fallback = True

    async def _score_users(
        agg: dict[str, tuple[int, int, int]],
    ) -> list[tuple[User, int]]:
        if not agg:
            return []
        users = {
            user.id: user
            for user in (
                await db.scalars(
                    select(User).where(
                        User.status == "active",
                        User.id.in_(list(agg.keys())),
                    )
                )
            ).all()
        }
        scored: list[tuple[User, int]] = []
        for user_id, (likes, comments, followers) in agg.items():
            user = users.get(user_id)
            if user is None:
                continue
            score = (
                likes * LIKE_WEIGHT
                + comments * COMMENT_WEIGHT
                + followers * FOLLOWER_WEIGHT
            )
            if score <= 0:
                continue
            scored.append((user, score))
        scored.sort(key=lambda item: (-item[1], item[0].id))
        return scored

    scored = await _score_users(aggregates)
    # 窗口有脏数据但得分全 0 时，同样退回累计
    if since is not None and not scored and not used_fallback:
        aggregates = await _agg_all_time(db)
        used_fallback = True
        scored = await _score_users(aggregates)

    await db.execute(delete(RankingEntry).where(RankingEntry.period == period))

    if not scored:
        await db.flush()
        return 0

    top = scored[: max(1, top_n)]
    for rank, (user, score) in enumerate(top, start=1):
        headline = await _headline_for_user(db, user_id=user.id)
        db.add(
            RankingEntry(
                period=period,
                rank=rank,
                user_id=user.id,
                headline=headline,
                score=score,
                trend=_trend(prev_rank.get(user.id), rank),
            )
        )

    await db.flush()
    return len(top)


async def recalculate_rankings(
    db: AsyncSession,
    *,
    periods: tuple[str, ...] | list[str] | None = None,
    top_n: int = DEFAULT_TOP_N,
    cache: CacheBackend | None = None,
) -> dict[str, int]:
    """重算多个周期并失效缓存。"""
    selected = tuple(periods) if periods else RANKING_PERIODS
    counts: dict[str, int] = {}
    for period in selected:
        counts[period] = await recalculate_period(db, period=period, top_n=top_n)
    await db.commit()

    if cache is not None:
        for period in selected:
            await cache.delete(f"cache:rankings:{period}")

    return counts


async def ensure_rankings_populated(
    db: AsyncSession,
    *,
    cache: CacheBackend | None = None,
    top_n: int = DEFAULT_TOP_N,
) -> dict[str, int]:
    """仅对空周期补算（导入后 / 启动时）。"""
    missing: list[str] = []
    for period in RANKING_PERIODS:
        total = await db.scalar(
            select(func.count())
            .select_from(RankingEntry)
            .where(RankingEntry.period == period)
        )
        if int(total or 0) == 0:
            missing.append(period)
    if not missing:
        return {}
    return await recalculate_rankings(
        db, periods=missing, top_n=top_n, cache=cache
    )
