from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import (
    Comment,
    ContentColumn,
    Event,
    Follow,
    Post,
    RankingEntry,
    Tag,
    User,
    Voyage,
)


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


AUTHORS: list[dict] = [
    {
        "id": "u_leo",
        "username": "leo",
        "display_name": "Leo",
        "avatar_url": "/images/Leo.png",
        "role": "moderator",
    },
    {
        "id": "u_seanna",
        "username": "seanna",
        "display_name": "Seanna",
        "avatar_url": "/images/Seanna.png",
        "role": "member",
    },
    {
        "id": "u_cake",
        "username": "cake",
        "display_name": "Cake",
        "avatar_url": "/images/Cake.png",
        "role": "member",
    },
    {
        "id": "u_yhy",
        "username": "yhy",
        "display_name": "YHY",
        "avatar_url": "/images/YHY.png",
        "role": "admin",
    },
    {
        "id": "u_qiqi",
        "username": "qiqi",
        "display_name": "七七",
        "avatar_url": "/images/七七.png",
        "role": "member",
    },
    {
        "id": "u_michelle",
        "username": "michelle",
        "display_name": "Michelle",
        "avatar_url": "/images/Michelle.png",
        "role": "member",
    },
]


def _body(excerpt: str, title: str) -> str:
    return "\n\n".join(
        [
            excerpt,
            f"在「{title}」这个主题下，最容易被忽略的往往不是技术选型，"
            "而是把复杂问题拆成可执行小步骤的能力。",
            "先明确边界，再快速验证，最后让每一次迭代都可度量、可回滚——"
            "这是社区里被反复验证过的方法论。",
        ]
    )


FEATURED_POSTS: list[dict] = [
    {
        "id": "p_1",
        "author_id": "u_leo",
        "title": "从 0 到 1 搭建一个可交付的 AI Agent 工作流",
        "excerpt": "我把过去三个月落地 12 个客户项目的经验，抽象成一套可复用的 "
        "Agent 编排范式，涵盖任务拆解、工具调用与失败兜底。",
        "tags": ["AI Agent", "实战复盘", "工作流"],
        "like_count": 328,
        "comment_count": 64,
        "view_count": 5820,
        "published_at": "2026-07-22T09:00:00Z",
    },
    {
        "id": "p_2",
        "author_id": "u_yhy",
        "title": "大模型推理成本优化：把单次调用压到 1/5 的四个杠杆",
        "excerpt": "缓存、蒸馏、批处理与路由，四个工程杠杆的取舍与实测数据，"
        "附带一份可直接套用的成本核算表。",
        "tags": ["LLM", "成本优化", "工程"],
        "like_count": 291,
        "comment_count": 47,
        "view_count": 4930,
        "published_at": "2026-07-21T03:20:00Z",
    },
    {
        "id": "p_3",
        "author_id": "u_cake",
        "title": "一个人也能跑起来的 AI 内容工厂",
        "excerpt": "从选题、生成、审校到分发的全链路自动化，我如何用 3 个工作流"
        "让日更成为默认状态。",
        "tags": ["内容创作", "自动化", "增长"],
        "like_count": 264,
        "comment_count": 38,
        "view_count": 4410,
        "published_at": "2026-07-20T12:00:00Z",
    },
    {
        "id": "p_4",
        "author_id": "u_seanna",
        "title": "RAG 落地避坑指南：检索质量才是天花板",
        "excerpt": "分块策略、混合检索与重排的组合拳，以及为什么大多数 RAG 项目"
        "死在了数据清洗这一步。",
        "tags": ["RAG", "检索", "避坑"],
        "like_count": 233,
        "comment_count": 52,
        "view_count": 3980,
        "published_at": "2026-07-19T08:30:00Z",
    },
    {
        "id": "p_5",
        "author_id": "u_qiqi",
        "title": "把 Prompt 当成产品来迭代",
        "excerpt": "版本管理、A/B 评测与线上回归，一套让 Prompt 质量可度量、"
        "可回滚的工程方法论。",
        "tags": ["Prompt", "评测", "方法论"],
        "like_count": 208,
        "comment_count": 29,
        "view_count": 3560,
        "published_at": "2026-07-18T15:10:00Z",
    },
    {
        "id": "p_6",
        "author_id": "u_michelle",
        "title": "私域 × AI：让每一条自动回复都像真人",
        "excerpt": "人设固化、上下文记忆与转人工时机，三个细节决定了 AI 客服"
        "到底是加分还是劝退。",
        "tags": ["私域", "增长", "客服"],
        "like_count": 187,
        "comment_count": 41,
        "view_count": 3120,
        "published_at": "2026-07-17T06:45:00Z",
    },
]


LATEST_POSTS: list[dict] = [
    {
        "id": "l_1",
        "author_id": "u_qiqi",
        "title": "今天试了新出的多模态模型，实测下来这几个场景真的能打",
        "excerpt": "简单分享一下我在图文理解和表格抽取上的对比结果，附截图，"
        "欢迎一起讨论。",
        "tags": ["多模态", "实测"],
        "like_count": 42,
        "comment_count": 11,
        "view_count": 680,
        "published_at": "2026-07-24T02:10:00Z",
    },
    {
        "id": "l_2",
        "author_id": "u_cake",
        "title": "求助：Agent 在长对话里会丢失早期上下文，大家怎么解决？",
        "excerpt": "目前用的是滑动窗口 + 摘要，效果一般，想看看有没有更稳的方案。",
        "tags": ["求助", "Agent"],
        "like_count": 18,
        "comment_count": 23,
        "view_count": 410,
        "published_at": "2026-07-24T01:05:00Z",
    },
    {
        "id": "l_3",
        "author_id": "u_leo",
        "title": "分享一个把周报自动化的小工作流，省了我每周两小时",
        "excerpt": "从日历、Git 提交和文档里自动汇总，生成初稿再人工润色。",
        "tags": ["自动化", "效率"],
        "like_count": 76,
        "comment_count": 14,
        "view_count": 1120,
        "published_at": "2026-07-23T13:40:00Z",
    },
    {
        "id": "l_4",
        "author_id": "u_yhy",
        "title": "关于向量数据库选型，说说我踩过的坑",
        "excerpt": "从自建到托管，成本、延迟和运维复杂度的真实取舍。",
        "tags": ["向量数据库", "选型"],
        "like_count": 55,
        "comment_count": 9,
        "view_count": 890,
        "published_at": "2026-07-23T09:20:00Z",
    },
    {
        "id": "l_5",
        "author_id": "u_seanna",
        "title": "第一次参加航海就跑出了正反馈，记录一下心路历程",
        "excerpt": "从不敢发帖到主动分享，社区氛围真的会推着人往前走。",
        "tags": ["航海", "记录"],
        "like_count": 133,
        "comment_count": 27,
        "view_count": 2040,
        "published_at": "2026-07-22T21:00:00Z",
    },
]


VOYAGES: list[dict] = [
    {
        "id": "v_1",
        "title": "AI 独立开发者出海航海",
        "summary": "两个月内做出一款面向海外市场的 AI 小工具并跑通首批付费用户。",
        "category": "出海 · 独立开发",
        "status": "recruiting",
        "duration_weeks": 8,
        "captain_id": "u_leo",
        "member_count": 42,
        "capacity": 60,
    },
    {
        "id": "v_2",
        "title": "小红书 AI 内容矩阵航海",
        "summary": "用 AI 工作流搭建可复制的内容矩阵，目标单账号月涨粉过万。",
        "category": "内容 · 增长",
        "status": "in_progress",
        "duration_weeks": 6,
        "captain_id": "u_cake",
        "member_count": 80,
        "capacity": 80,
    },
    {
        "id": "v_3",
        "title": "企业 AI 落地陪跑航海",
        "summary": "面向 B 端，从需求诊断到 POC 交付，完整走一遍企业级落地流程。",
        "category": "企业 · 落地",
        "status": "recruiting",
        "duration_weeks": 10,
        "captain_id": "u_michelle",
        "member_count": 25,
        "capacity": 40,
    },
    {
        "id": "v_4",
        "title": "大模型微调实战航海",
        "summary": "从数据构造到 LoRA 微调再到评测上线，产出一个垂直领域小模型。",
        "category": "模型 · 工程",
        "status": "finished",
        "duration_weeks": 6,
        "captain_id": "u_yhy",
        "member_count": 55,
        "capacity": 55,
    },
]


COLUMNS: list[dict] = [
    {
        "id": "c_1",
        "title": "轻享 · 每周一",
        "description": "圈内实战派分享可即刻上手的 AI 变现小方法。",
        "cadence": "每周一更新",
        "article_count": 48,
        "author_id": "u_qiqi",
        "tag": "入门",
    },
    {
        "id": "c_2",
        "title": "岛民合伙人 · 每周三",
        "description": "项目对接、资源整合与合作机会，在这里发生真实连接。",
        "cadence": "每周三更新",
        "article_count": 36,
        "author_id": "u_michelle",
        "tag": "连接",
    },
    {
        "id": "c_3",
        "title": "一起赚美元 · 每周五",
        "description": "跨境、出海与海外项目机会的深度拆解。",
        "cadence": "每周五更新",
        "article_count": 52,
        "author_id": "u_leo",
        "tag": "出海",
    },
    {
        "id": "c_4",
        "title": "工程周刊",
        "description": "大模型工程、推理优化与 Agent 架构的前沿实践。",
        "cadence": "每周更新",
        "article_count": 29,
        "author_id": "u_yhy",
        "tag": "工程",
    },
]


RANKINGS: list[dict] = [
    {
        "rank": 1,
        "user_id": "u_leo",
        "headline": "本周精华帖 × 3，带队航海反馈拉满",
        "score": 9820,
        "trend": "up",
    },
    {
        "rank": 2,
        "user_id": "u_yhy",
        "headline": "推理成本优化长文引发大量讨论",
        "score": 8640,
        "trend": "up",
    },
    {
        "rank": 3,
        "user_id": "u_cake",
        "headline": "内容工厂工作流被反复收藏",
        "score": 7510,
        "trend": "flat",
    },
    {
        "rank": 4,
        "user_id": "u_seanna",
        "headline": "RAG 避坑指南持续发酵",
        "score": 6980,
        "trend": "up",
    },
    {
        "rank": 5,
        "user_id": "u_qiqi",
        "headline": "多模态实测分享获高赞",
        "score": 6120,
        "trend": "down",
    },
    {
        "rank": 6,
        "user_id": "u_michelle",
        "headline": "私域 AI 案例被多人参考",
        "score": 5730,
        "trend": "flat",
    },
]


# (follower_id, following_id) 关注关系，同时用于计算粉丝/关注计数
FOLLOWS: list[tuple[str, str]] = [
    ("u_seanna", "u_leo"),
    ("u_cake", "u_leo"),
    ("u_qiqi", "u_leo"),
    ("u_michelle", "u_leo"),
    ("u_yhy", "u_leo"),
    ("u_leo", "u_yhy"),
    ("u_cake", "u_yhy"),
    ("u_qiqi", "u_cake"),
    ("u_seanna", "u_yhy"),
    ("u_leo", "u_cake"),
]


EVENTS: list[dict] = [
    {
        "id": "e_1",
        "title": "岛民夜话：Agent 落地的真实 ROI",
        "description": "四位一线实践者围炉夜话，聊聊 Agent 到底为业务带来了什么。",
        "type": "线上",
        "city": "腾讯会议",
        "event_date": "2026-07-28",
        "event_time": "20:00 - 21:30",
        "host_id": "u_leo",
        "seats_left": 120,
    },
    {
        "id": "e_2",
        "title": "上海线下见面会 · AI 独立开发者专场",
        "description": "面对面交流出海经验，现场 Demo 与项目路演。",
        "type": "线下",
        "city": "上海 · 徐汇",
        "event_date": "2026-08-02",
        "event_time": "14:00 - 18:00",
        "host_id": "u_cake",
        "seats_left": 12,
    },
    {
        "id": "e_3",
        "title": "工程专场：把推理成本打下来",
        "description": "YHY 带你逐层拆解推理链路的优化空间。",
        "type": "线上",
        "city": "线上直播",
        "event_date": "2026-08-05",
        "event_time": "19:30 - 21:00",
        "host_id": "u_yhy",
        "seats_left": 0,
    },
    {
        "id": "e_4",
        "title": "北京同城 · 新岛咖啡局",
        "description": "轻松的周末下午茶，认识更多同频的 AI 原住民。",
        "type": "线下",
        "city": "北京 · 朝阳",
        "event_date": "2026-08-09",
        "event_time": "15:00 - 17:30",
        "host_id": "u_michelle",
        "seats_left": 6,
    },
]


_COMMENT_AUTHORS = ["u_seanna", "u_cake", "u_qiqi", "u_michelle"]
_COMMENT_CONTENTS = [
    "写得太实用了，第二步「快速验证」这块我之前一直做反了，受教。",
    "已经收藏，准备照着这个思路重构一下我手上的项目。",
    "请问在快速验证阶段，你一般怎么控制不过度投入？",
]
_COMMENT_LIKES = [12, 5, 3]


def _build_comments(post: dict) -> list[Comment]:
    """尾号为奇数的帖子生成 3 条评论，偶数则为空，用于覆盖空评论场景。"""
    last = post["id"][-1]
    if not last.isdigit() or int(last) % 2 == 0:
        return []

    base = _dt(post["published_at"])
    comments: list[Comment] = []
    for index, content in enumerate(_COMMENT_CONTENTS):
        created = base + timedelta(hours=index + 1)
        comments.append(
            Comment(
                id=f"{post['id']}_c{index + 1}",
                post_id=post["id"],
                author_id=_COMMENT_AUTHORS[index % len(_COMMENT_AUTHORS)],
                parent_id=None,
                reply_to_user_id=None,
                content=content,
                status="published",
                like_count=_COMMENT_LIKES[index],
                reply_count=0,
                created_at=created,
                updated_at=created,
            )
        )
    return comments


def collect_seed_tag_names() -> list[str]:
    """演示帖用到的标签（保序去重），作为标签库种子。"""
    names: list[str] = []
    seen: set[str] = set()
    for group in (FEATURED_POSTS, LATEST_POSTS):
        for item in group:
            for tag in item.get("tags", []):
                cleaned = str(tag).strip()
                if not cleaned or cleaned in seen:
                    continue
                seen.add(cleaned)
                names.append(cleaned)
    return names


async def ensure_tag_library(db: AsyncSession) -> int:
    """标签库为空时写入种子标签；返回新增条数。"""
    existing = await db.scalar(select(func.count()).select_from(Tag))
    if existing:
        return 0
    names = collect_seed_tag_names()
    for index, name in enumerate(names):
        db.add(
            Tag(
                id=f"tag_seed_{index:03d}",
                name=name,
                sort_order=index,
            )
        )
    await db.commit()
    return len(names)


async def seed_if_empty(db: AsyncSession) -> bool:
    """空库时灌入演示数据；已有数据则跳过。返回是否执行了灌库。"""
    existing = await db.scalar(select(func.count()).select_from(User))
    if existing:
        return False

    settings = get_settings()
    default_hash = hash_password(settings.seed_default_password)

    follower_counts: dict[str, int] = {}
    following_counts: dict[str, int] = {}
    for follower_id, following_id in FOLLOWS:
        following_counts[follower_id] = following_counts.get(follower_id, 0) + 1
        follower_counts[following_id] = follower_counts.get(following_id, 0) + 1

    for author in AUTHORS:
        db.add(
            User(
                **author,
                email=f"{author['username']}@novaisland.ai",
                password_hash=default_hash,
                post_count=0,
                follower_count=follower_counts.get(author["id"], 0),
                following_count=following_counts.get(author["id"], 0),
            )
        )
    # MySQL 外键需先落库用户，再写入关注关系
    await db.flush()

    for follower_id, following_id in FOLLOWS:
        db.add(Follow(follower_id=follower_id, following_id=following_id))

    for index, name in enumerate(collect_seed_tag_names()):
        db.add(
            Tag(
                id=f"tag_seed_{index:03d}",
                name=name,
                sort_order=index,
            )
        )

    for is_featured, group in ((True, FEATURED_POSTS), (False, LATEST_POSTS)):
        for item in group:
            db.add(
                Post(
                    id=item["id"],
                    author_id=item["author_id"],
                    title=item["title"],
                    content=_body(item["excerpt"], item["title"]),
                    excerpt=item["excerpt"],
                    cover_image_url=None,
                    tags=item["tags"],
                    status="published",
                    visibility="public",
                    is_featured=is_featured,
                    like_count=item["like_count"],
                    comment_count=item["comment_count"],
                    view_count=item["view_count"],
                    published_at=_dt(item["published_at"]),
                )
            )
            for comment in _build_comments(item):
                db.add(comment)

    for voyage in VOYAGES:
        db.add(Voyage(**voyage))
    for column in COLUMNS:
        db.add(ContentColumn(**column))
    for ranking in RANKINGS:
        db.add(RankingEntry(period="weekly", **ranking))
    for event in EVENTS:
        db.add(Event(**event))

    await db.commit()
    return True
