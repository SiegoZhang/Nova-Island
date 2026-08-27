"""标签库：管理员维护，发帖仅可选库内名称。"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tag


async def list_tags(db: AsyncSession) -> list[Tag]:
    rows = await db.scalars(
        select(Tag).order_by(Tag.sort_order.asc(), Tag.name.asc())
    )
    return list(rows.all())


async def list_tag_names(db: AsyncSession) -> list[str]:
    rows = await list_tags(db)
    return [row.name for row in rows]


async def get_tag(db: AsyncSession, tag_id: str) -> Tag | None:
    return await db.get(Tag, tag_id)


async def get_tag_by_name(db: AsyncSession, name: str) -> Tag | None:
    cleaned = name.strip()
    if not cleaned:
        return None
    return await db.scalar(select(Tag).where(Tag.name == cleaned))


async def create_tag(
    db: AsyncSession, *, name: str, sort_order: int = 0
) -> Tag:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("empty_name")
    if len(cleaned) > 64:
        raise ValueError("name_too_long")
    existing = await get_tag_by_name(db, cleaned)
    if existing is not None:
        raise ValueError("duplicate_name")
    tag = Tag(
        id=f"tag_{uuid.uuid4().hex[:16]}",
        name=cleaned,
        sort_order=sort_order,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


async def update_tag(
    db: AsyncSession,
    tag: Tag,
    *,
    name: str | None = None,
    sort_order: int | None = None,
) -> Tag:
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("empty_name")
        if len(cleaned) > 64:
            raise ValueError("name_too_long")
        other = await get_tag_by_name(db, cleaned)
        if other is not None and other.id != tag.id:
            raise ValueError("duplicate_name")
        tag.name = cleaned
    if sort_order is not None:
        tag.sort_order = sort_order
    await db.commit()
    await db.refresh(tag)
    return tag


async def delete_tag(db: AsyncSession, tag: Tag) -> None:
    await db.delete(tag)
    await db.commit()


async def assert_tags_allowed(db: AsyncSession, tags: list[str]) -> list[str]:
    """校验并规范化标签；未知标签抛 ValueError('unknown_tags')。"""
    cleaned = [t.strip() for t in tags if t and t.strip()][:10]
    if not cleaned:
        return []
    allowed = set(await list_tag_names(db))
    unknown = [name for name in cleaned if name not in allowed]
    if unknown:
        raise ValueError("unknown_tags")
    # 去重保序
    seen: set[str] = set()
    ordered: list[str] = []
    for name in cleaned:
        if name in seen:
            continue
        seen.add(name)
        ordered.append(name)
    return ordered


async def tag_count(db: AsyncSession) -> int:
    total = await db.scalar(select(func.count()).select_from(Tag))
    return int(total or 0)
