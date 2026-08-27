"""将知识星球导出包导入本站 MySQL。

用法（在 backend/ 目录）：

    uv run python -m app.scripts.import_zsxq \\
      --data-dir ../data/28882121511111 \\
      --wipe

默认会清空业务表后全量导入；不传 --wipe 则拒绝在非空库上运行（防误操作）。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote
from urllib.request import Request, urlopen

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.core.storage import get_storage
from app.db.session import create_database
from app.models import (
    Comment,
    CommentLike,
    ContentColumn,
    Event,
    Follow,
    ImportIdMap,
    Notification,
    Post,
    PostAttachment,
    PostBookmark,
    PostLike,
    RankingEntry,
    RefreshToken,
    User,
    Voyage,
)

SOURCE = "zsxq"
OWNER_SOURCE_ID = "218224411124521"
OWNER_USERNAME = "michelle"

_ZSXQ_TAG = re.compile(
    r'<e\s+type="(?P<type>[^"]+)"(?P<attrs>[^>]*)\s*/>',
    re.IGNORECASE,
)
_ATTR = re.compile(r'(\w+)="([^"]*)"')
_MD_IMAGE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
_HTML_IMG = re.compile(r'<img[^>]+src="([^"]+)"[^>]*>', re.IGNORECASE)
_LOCAL_IMAGE = re.compile(
    r"(?:\.\./)+images/([A-Za-z0-9]+\.(?:png|jpe?g|gif|webp))",
    re.IGNORECASE,
)
_ASCII_USER = re.compile(r"[a-zA-Z][a-zA-Z0-9_]{1,31}")
_NON_USER = re.compile(r"[^a-zA-Z0-9_]+")


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    raw = value.strip()
    if raw.endswith("+0800"):
        raw = raw[:-5] + "+08:00"
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _zsxq_to_markdown(raw: str | None) -> str:
    if not raw:
        return ""

    def repl(match: re.Match[str]) -> str:
        kind = match.group("type")
        attrs = dict(_ATTR.findall(match.group("attrs") or ""))
        title = unquote(attrs.get("title", ""))
        href = unquote(attrs.get("href", ""))
        if kind == "text_bold":
            return f"**{title}**" if title else ""
        if kind == "text_italic":
            return f"*{title}*" if title else ""
        if kind in {"web", "mention"}:
            label = title or href
            return f"[{label}]({href})" if href else label
        if kind == "hashtag":
            return f"#{title}" if title else ""
        return title or href

    text_body = _ZSXQ_TAG.sub(repl, raw)
    text_body = re.sub(r"<br\s*/?>", "\n", text_body, flags=re.IGNORECASE)
    text_body = re.sub(r"</?p>", "\n", text_body, flags=re.IGNORECASE)
    text_body = re.sub(r"<[^>]+>", "", text_body)
    return re.sub(r"\n{3,}", "\n\n", text_body).strip()


def _collapse_repeated_body(text: str) -> str:
    """导出 MD 常把同一段正文复制 2~3 遍，折叠为单份。"""
    paras = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    if len(paras) < 6:
        return text.strip()

    # 精确周期重复：paras == unit * n
    for k in range(1, len(paras) // 2 + 1):
        if len(paras) % k != 0:
            continue
        n = len(paras) // k
        if n < 2:
            continue
        unit = paras[:k]
        if paras == unit * n:
            return "\n\n".join(unit)

    # 正文探针：跳过标题/封面/短元信息后，找首次正文段的重复起点
    start = 0
    while start < len(paras):
        p = paras[start]
        if (
            p.startswith("![")
            or p.startswith("#")
            or len(p) < 20
            or re.fullmatch(r"\d{4}年\d{1,2}月\d{1,2}日(?:\s+\d{1,2}:\d{2})?", p)
            or p in {"知识星球", "**", "***"}
        ):
            start += 1
            continue
        break

    if start < len(paras):
        probe = paras[start]
        idxs = [i for i, p in enumerate(paras) if p == probe]
        if len(idxs) >= 2:
            unit_len = idxs[1] - idxs[0]
            if unit_len > 0 and all(
                idxs[i] - idxs[0] == i * unit_len for i in range(len(idxs))
            ):
                header = paras[: idxs[0]]
                unit = paras[idxs[0] : idxs[0] + unit_len]
                return "\n\n".join(header + unit)

    # 前缀单元重复覆盖大部分内容
    for k in range(len(paras) // 2, 0, -1):
        unit = paras[:k]
        repeats = 1
        while (repeats + 1) * k <= len(paras) and paras[
            repeats * k : (repeats + 1) * k
        ] == unit:
            repeats += 1
        if repeats >= 2 and repeats * k >= int(len(paras) * 0.75):
            rest = paras[repeats * k :]
            rest = [
                p
                for p in rest
                if "知识星球" not in p and "扫码加入" not in p and len(p) > 8
            ]
            return "\n\n".join(unit + rest)

    return text.strip()


def _clean_migration_markdown(
    md: str, *, title: str, author_name: str | None = None
) -> str:
    text_body = md.replace("\r\n", "\n")

    # 页脚：知识星球品牌 / 加群 CTA（取最早出现位置）
    footer_marks = (
        "\n## 💬",
        "\n## 评论",
        "\n### 附件",
        "\n## 附件",
        "扫码加入星球",
        "查看更多优质内容",
        "\n                知识星球",
        "\n知识星球\n",
        "\n知识星球\r",
    )
    cut_at = None
    for marker in footer_marks:
        idx = text_body.find(marker)
        if idx >= 0 and (cut_at is None or idx < cut_at):
            cut_at = idx
    # 单独一行的「知识星球」
    for m in re.finditer(r"(?m)^\s*知识星球\s*$", text_body):
        if cut_at is None or m.start() < cut_at:
            cut_at = m.start()
    if cut_at is not None:
        text_body = text_body[:cut_at]

    text_body = re.sub(
        r"https://wx\.zsxq\.com/mweb/views/join/join_group\.html[^\s)]*",
        "",
        text_body,
    )

    lines = text_body.splitlines()
    cleaned: list[str] = []
    author_names = {n for n in (author_name, "新岛Michelle", "Bill", "何锦成") if n}

    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned.append("")
            continue
        if re.search(r'alt="avatar"', line, re.IGNORECASE):
            continue
        if re.search(r"<img[^>]+>", line, re.IGNORECASE) and "images.zsxq.com" in line:
            continue
        if re.search(r"[❤💬👁🕒]", line) and "**" in line:
            continue
        if "来自：" in line or "wx.zsxq.com/group" in line:
            continue
        if stripped in {"知识星球", "***", "**"}:
            continue
        if "wx.zsxq.com/tags" in line and stripped.startswith("["):
            line = re.sub(r"\[(#[^\]]+)\]\([^)]+\)", r"\1", line)
            stripped = line.strip()
        if re.match(r"^#\s+", stripped) and title and title[:12] in stripped:
            continue
        if re.fullmatch(r"\d{4}年\d{1,2}月\d{1,2}日(?:\s+\d{1,2}:\d{2})?", stripped):
            continue
        # 导出模板里的孤立作者名行（封面图后常见）
        if stripped in author_names:
            continue
        # 去掉模板残留大缩进
        if re.match(r"^\s{4,}", line) and not re.match(r"^\s*([-*+]|\d+\.)\s+", line):
            line = stripped
        cleaned.append(line.rstrip())

    body = "\n".join(cleaned)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    body = _collapse_repeated_body(body)
    # 再次清尾部「知识星球」
    body = re.sub(r"(?:\n|\s)*知识星球\s*$", "", body).strip()
    return body


def _title_from(raw: str | None, content: str) -> str:
    title = (raw or "").strip()
    if title and title not in {"...", "无标题"}:
        return title.lstrip("#").strip().replace("\n", " ")[:200]
    for line in content.splitlines():
        line = line.strip().lstrip("#").strip()
        if line and not line.startswith("!["):
            return line[:200]
    return "未命名内容"


def _excerpt(content: str) -> str | None:
    cleaned = content
    cleaned = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"[#>*_`]+", " ", cleaned)
    cleaned = " ".join(cleaned.split()).strip()
    if not cleaned:
        return None
    return cleaned[:160] + ("…" if len(cleaned) > 160 else "")


def _media_public_path(url: str) -> str:
    """入库用相对 /media/...，前端同源反代，避免跨端口头像失败。"""
    match = re.search(r"(/media/.+)$", url)
    return match.group(1) if match else url


def _make_username(display_name: str, source_id: str, used: set[str]) -> str:
    if source_id == OWNER_SOURCE_ID:
        base = OWNER_USERNAME
    else:
        ascii_hit = _ASCII_USER.search(display_name.replace(" ", "_"))
        if ascii_hit:
            base = ascii_hit.group(0).lower()
        else:
            slug = _NON_USER.sub("", display_name)
            base = slug.lower()[:32] if len(slug) >= 2 else f"u{source_id[-10:]}"
        base = base[:32] or f"u{source_id[-10:]}"

    candidate = base
    n = 2
    while candidate in used:
        suffix = f"_{n}"
        candidate = f"{base[: 32 - len(suffix)]}{suffix}"
        n += 1
    used.add(candidate)
    return candidate


async def _put_bytes(
    *,
    data: bytes,
    original_name: str,
    key: str,
    content_type: str | None = None,
) -> tuple[str, str, str, int]:
    storage = get_storage()
    guessed = content_type or mimetypes.guess_type(original_name)[0] or (
        "application/octet-stream"
    )
    stored = await storage.put(
        data=data,
        content_type=guessed,
        original_name=original_name,
        key=key,
    )
    return stored.key, stored.url, stored.content_type, stored.size_bytes


async def _download_url(url: str, timeout: float = 20.0) -> bytes | None:
    if not url or not url.startswith("http"):
        return None
    try:
        req = Request(url, headers={"User-Agent": "nova-island-import/1.0"})
        with urlopen(req, timeout=timeout) as resp:  # noqa: S310
            return resp.read()
    except Exception:
        return None


async def wipe_business_tables(db: AsyncSession) -> None:
    """按外键依赖顺序清空业务数据（保留 schema）。"""
    await db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    for table in (
        Notification,
        CommentLike,
        PostLike,
        PostBookmark,
        Comment,
        PostAttachment,
        Post,
        Follow,
        RefreshToken,
        RankingEntry,
        Event,
        Voyage,
        ContentColumn,
        ImportIdMap,
        User,
    ):
        await db.execute(delete(table))
    await db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    await db.commit()


async def _remember(
    db: AsyncSession,
    *,
    entity_type: str,
    source_id: str,
    local_id: str,
) -> None:
    db.add(
        ImportIdMap(
            source_system=SOURCE,
            entity_type=entity_type,
            source_id=str(source_id),
            local_id=local_id,
        )
    )


def _open_topics(data_dir: Path) -> sqlite3.Connection:
    path = data_dir / f"zsxq_topics_{data_dir.name}.db"
    if not path.exists():
        path = data_dir / "zsxq_topics_28882121511111.db"
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    return con


def _open_files(data_dir: Path) -> sqlite3.Connection:
    path = data_dir / f"zsxq_files_{data_dir.name}.db"
    if not path.exists():
        path = data_dir / "zsxq_files_28882121511111.db"
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    return con


def _open_columns(data_dir: Path) -> sqlite3.Connection:
    path = data_dir / f"zsxq_columns_{data_dir.name}.db"
    if not path.exists():
        path = data_dir / "zsxq_columns_28882121511111.db"
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    return con


async def import_package(data_dir: Path, *, wipe: bool) -> dict:
    settings = get_settings()
    database = create_database(settings)
    images_dir = data_dir / "images"
    downloads_dir = data_dir / "downloads"
    topics_md_dir = data_dir / "migration_source" / "topics"
    group_meta = json.loads((data_dir / "group_meta.json").read_text(encoding="utf-8"))

    stats = {
        "users": 0,
        "posts": 0,
        "attachments": 0,
        "columns": 0,
        "avatars_ok": 0,
        "avatars_fail": 0,
        "images_rewritten": 0,
    }

    async with database.sessionmaker() as db:
        user_count = await db.scalar(select(func.count()).select_from(User))
        if (user_count or 0) > 0 and not wipe:
            raise SystemExit(
                f"数据库已有 {user_count} 个用户。若要清空后导入请加 --wipe"
            )
        if wipe:
            await wipe_business_tables(db)

        topics_con = _open_topics(data_dir)
        files_con = _open_files(data_dir)
        columns_con = _open_columns(data_dir)

        # ---- users ----
        used_usernames: set[str] = set()
        user_map: dict[str, str] = {}
        user_names: dict[str, str] = {}
        owner_password = hash_password(settings.seed_default_password)

        for row in topics_con.execute("SELECT * FROM users"):
            source_id = str(row["user_id"])
            display_name = (row["name"] or f"用户{source_id}")[:128]
            user_names[source_id] = display_name
            username = _make_username(display_name, source_id, used_usernames)
            local_id = f"u_{uuid.uuid4().hex[:20]}"

            avatar_url = None
            remote = row["avatar_url"] or ""
            data = await _download_url(remote)
            if data:
                ext = ".jpg"
                ctype = "image/jpeg"
                if b"PNG" in data[:16]:
                    ext, ctype = ".png", "image/png"
                elif b"GIF" in data[:16]:
                    ext, ctype = ".gif", "image/gif"
                key = f"import/avatars/{source_id}{ext}"
                try:
                    _, avatar_url, _, _ = await _put_bytes(
                        data=data,
                        original_name=f"{source_id}{ext}",
                        key=key,
                        content_type=ctype,
                    )
                    avatar_url = _media_public_path(avatar_url)
                    stats["avatars_ok"] += 1
                except Exception:
                    stats["avatars_fail"] += 1
            else:
                stats["avatars_fail"] += 1

            is_owner = source_id == OWNER_SOURCE_ID or source_id == str(
                group_meta.get("owner", {}).get("user_id")
            )
            user = User(
                id=local_id,
                username=username,
                email=None,
                password_hash=owner_password if is_owner else None,
                display_name=display_name,
                avatar_url=avatar_url,
                bio=None,
                role="admin" if is_owner else "member",
                status="active",
                follower_count=0,
                following_count=0,
                post_count=0,
            )
            db.add(user)
            await _remember(
                db, entity_type="user", source_id=source_id, local_id=local_id
            )
            user_map[source_id] = local_id
            stats["users"] += 1

        await db.flush()

        # ---- column ----
        column_local_id: str | None = None
        column_topic_ids: set[str] = set()
        col_row = columns_con.execute("SELECT * FROM columns LIMIT 1").fetchone()
        if col_row:
            source_col = str(col_row["column_id"])
            owner_row = columns_con.execute(
                "SELECT user_id FROM topic_owners LIMIT 1"
            ).fetchone()
            author_source = (
                str(owner_row["user_id"]) if owner_row else next(iter(user_map))
            )
            author_id = user_map.get(author_source) or next(iter(user_map.values()))
            column_local_id = f"col_{uuid.uuid4().hex[:18]}"
            db.add(
                ContentColumn(
                    id=column_local_id,
                    title=(col_row["name"] or "未命名专栏")[:255],
                    description="来自知识星球的专栏合集",
                    cadence="不定期",
                    article_count=0,
                    author_id=author_id,
                    tag="专栏",
                )
            )
            await _remember(
                db,
                entity_type="column",
                source_id=source_col,
                local_id=column_local_id,
            )
            stats["columns"] += 1
            for ct in columns_con.execute("SELECT topic_id FROM column_topics"):
                column_topic_ids.add(str(ct["topic_id"]))

        await db.flush()

        # ---- file lookup ----
        file_by_topic: dict[str, list[sqlite3.Row]] = {}
        for tf in topics_con.execute("SELECT * FROM topic_files"):
            file_by_topic.setdefault(str(tf["topic_id"]), []).append(tf)

        file_meta: dict[str, sqlite3.Row] = {}
        for fr in files_con.execute("SELECT * FROM files"):
            file_meta[str(fr["file_id"])] = fr

        download_by_name = {p.name: p for p in downloads_dir.glob("*") if p.is_file()}

        def resolve_download(name: str, file_id: str | None) -> Path | None:
            meta = file_meta.get(str(file_id)) if file_id else None
            if meta and meta["local_path"]:
                # 原路径可能指向另一台机器；改映射到本仓库 downloads
                candidate = downloads_dir / Path(meta["local_path"]).name
                if candidate.is_file():
                    return candidate
            if name in download_by_name:
                return download_by_name[name]
            # 模糊：去破折号空格
            norm = re.sub(r"[\s—\-–_]+", "", name)
            for fname, path in download_by_name.items():
                if re.sub(r"[\s—\-–_]+", "", fname) == norm:
                    return path
            return None

        # ---- tags ----
        tag_names = {
            str(r["tag_id"]): r["tag_name"]
            for r in topics_con.execute("SELECT tag_id, tag_name FROM tags")
        }
        tags_by_topic: dict[str, list[str]] = {}
        for tt in topics_con.execute("SELECT topic_id, tag_id FROM topic_tags"):
            name = tag_names.get(str(tt["tag_id"]))
            if name:
                tags_by_topic.setdefault(str(tt["topic_id"]), []).append(name)

        # ---- talks / q&a bodies ----
        talk_owner = {
            str(r["topic_id"]): (str(r["owner_user_id"]), r["text"])
            for r in topics_con.execute(
                "SELECT topic_id, owner_user_id, text FROM talks"
            )
        }
        qa_owner = {
            str(r["topic_id"]): (str(r["owner_user_id"]), r["text"])
            for r in topics_con.execute(
                "SELECT topic_id, owner_user_id, text FROM questions"
            )
        }
        answers = {
            str(r["topic_id"]): r["text"]
            for r in topics_con.execute("SELECT topic_id, text FROM answers")
        }

        image_url_cache: dict[str, str] = {}

        async def rewrite_images(content: str) -> str:
            nonlocal stats

            async def ensure_local(filename: str) -> str | None:
                if filename in image_url_cache:
                    return image_url_cache[filename]
                path = images_dir / filename
                if not path.is_file():
                    return None
                data = path.read_bytes()
                ctype = mimetypes.guess_type(filename)[0] or "image/jpeg"
                key = f"import/images/{filename}"
                _, url, _, _ = await _put_bytes(
                    data=data,
                    original_name=filename,
                    key=key,
                    content_type=ctype,
                )
                url = _media_public_path(url)
                image_url_cache[filename] = url
                stats["images_rewritten"] += 1
                return url

            filenames = set(_LOCAL_IMAGE.findall(content))
            for md_url in _MD_IMAGE.findall(content):
                m = _LOCAL_IMAGE.search(md_url)
                if m:
                    filenames.add(m.group(1))
            for html_url in _HTML_IMG.findall(content):
                m = _LOCAL_IMAGE.search(html_url)
                if m:
                    filenames.add(m.group(1))

            mapping: dict[str, str] = {}
            for name in filenames:
                url = await ensure_local(name)
                if url:
                    mapping[name] = url

            def sub_path(match: re.Match[str]) -> str:
                name = match.group(1)
                return mapping.get(name, match.group(0))

            out = _LOCAL_IMAGE.sub(sub_path, content)

            def sub_md(match: re.Match[str]) -> str:
                url = match.group(1)
                m = _LOCAL_IMAGE.search(url)
                if m and m.group(1) in mapping:
                    return f"![]({mapping[m.group(1)]})"
                if url in mapping.values():
                    return match.group(0)
                return match.group(0)

            out = _MD_IMAGE.sub(sub_md, out)
            return out

        post_count_by_user: dict[str, int] = {}

        for topic in topics_con.execute(
            "SELECT * FROM topics ORDER BY create_time ASC"
        ):
            topic_id = str(topic["topic_id"])
            owner_text = talk_owner.get(topic_id) or qa_owner.get(topic_id)
            if not owner_text:
                continue
            owner_source, talk_text = owner_text
            author_id = user_map.get(owner_source)
            if not author_id:
                continue

            md_path = topics_md_dir / f"{topic_id}.md"
            raw_title = (topic["title"] or "").strip()
            author_name = user_names.get(owner_source)
            if md_path.is_file():
                content = _clean_migration_markdown(
                    md_path.read_text(encoding="utf-8"),
                    title=raw_title,
                    author_name=author_name,
                )
            else:
                content = _zsxq_to_markdown(talk_text)
                if topic_id in answers:
                    content = (
                        content
                        + "\n\n---\n\n## 回答\n\n"
                        + _zsxq_to_markdown(answers[topic_id])
                    )

            if not content.strip():
                content = _zsxq_to_markdown(talk_text) or "（空内容）"

            content = await rewrite_images(content)
            title = _title_from(raw_title, content)

            cover = None
            first_img = _MD_IMAGE.search(content)
            if first_img:
                cover = first_img.group(1)[:512]

            is_featured = bool(topic["digested"]) or bool(topic["sticky"])
            tags = list(dict.fromkeys(tags_by_topic.get(topic_id, [])))[:10]
            published_at = _parse_dt(topic["create_time"])
            local_post_id = f"p_{uuid.uuid4().hex[:20]}"
            col_id = column_local_id if topic_id in column_topic_ids else None

            post = Post(
                id=local_post_id,
                author_id=author_id,
                column_id=col_id,
                title=title,
                content=content,
                excerpt=_excerpt(content),
                cover_image_url=cover,
                tags=tags,
                status="published",
                visibility="public",
                is_featured=is_featured,
                like_count=0,
                comment_count=0,
                view_count=0,
                published_at=published_at,
                created_at=published_at,
                updated_at=published_at,
            )
            db.add(post)
            await _remember(
                db, entity_type="post", source_id=topic_id, local_id=local_post_id
            )
            post_count_by_user[author_id] = post_count_by_user.get(author_id, 0) + 1
            stats["posts"] += 1

            # attachments
            sort_order = 0
            for tf in file_by_topic.get(topic_id, []):
                path = resolve_download(tf["name"], str(tf["file_id"]))
                if path is None or not path.is_file():
                    continue
                data = path.read_bytes()
                ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
                key = f"import/files/{tf['hash'] or path.stem}{path.suffix.lower()}"
                storage_key, url, content_type, size_bytes = await _put_bytes(
                    data=data,
                    original_name=tf["name"] or path.name,
                    key=key,
                    content_type=ctype,
                )
                url = _media_public_path(url)
                db.add(
                    PostAttachment(
                        id=f"a_{uuid.uuid4().hex[:20]}",
                        post_id=local_post_id,
                        storage_key=storage_key,
                        url=url,
                        original_name=(tf["name"] or path.name)[:255],
                        content_type=content_type,
                        size_bytes=size_bytes,
                        kind="file",
                        sort_order=sort_order,
                    )
                )
                sort_order += 1
                stats["attachments"] += 1

        await db.flush()

        # calibrate counts
        if column_local_id:
            col = await db.get(ContentColumn, column_local_id)
            if col is not None:
                n = await db.scalar(
                    select(func.count())
                    .select_from(Post)
                    .where(Post.column_id == column_local_id)
                )
                col.article_count = int(n or 0)

        for uid, count in post_count_by_user.items():
            user = await db.get(User, uid)
            if user is not None:
                user.post_count = count

        await db.commit()
        topics_con.close()
        files_con.close()
        columns_con.close()

        # 导入后按互动重算榜单（wipe 会清空 ranking_entries）
        from app.services.ranking import recalculate_rankings

        ranking_counts = await recalculate_rankings(db)
        stats["rankings"] = ranking_counts

    await database.dispose()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Import ZSXQ package into Nova Island")
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="Path to data/28882121511111",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Truncate business tables before import",
    )
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    if not data_dir.is_dir():
        raise SystemExit(f"data dir not found: {data_dir}")

    stats = asyncio.run(import_package(data_dir, wipe=args.wipe))
    print(json.dumps({"ok": True, **stats}, ensure_ascii=False, indent=2))
    print(
        f"Admin login: username={OWNER_USERNAME} "
        f"password=<SEED_DEFAULT_PASSWORD from .env>"
    )


if __name__ == "__main__":
    main()
