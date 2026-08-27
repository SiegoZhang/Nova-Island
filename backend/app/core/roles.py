"""角色与最小权限判定（member / moderator / admin）。"""

from __future__ import annotations

from typing import Final

ROLE_MEMBER: Final = "member"
ROLE_MODERATOR: Final = "moderator"
ROLE_ADMIN: Final = "admin"

ALL_ROLES: Final = frozenset({ROLE_MEMBER, ROLE_MODERATOR, ROLE_ADMIN})
STAFF_ROLES: Final = frozenset({ROLE_MODERATOR, ROLE_ADMIN})

USER_STATUSES: Final = frozenset({"active", "suspended", "deactivated"})


def is_staff(role: str) -> bool:
    return role in STAFF_ROLES


def is_admin(role: str) -> bool:
    return role == ROLE_ADMIN


def can_edit_post_content(*, user_id: str, role: str, author_id: str) -> bool:
    """仅作者可改正文；staff 走隐藏/删除/加精，不代写。"""
    return user_id == author_id


def can_moderate_post(*, user_id: str, role: str, author_id: str) -> bool:
    """删除 / 隐藏：作者或 staff。"""
    return user_id == author_id or is_staff(role)


def can_feature_post(*, role: str) -> bool:
    return is_staff(role)


def can_set_public_visibility(*, role: str) -> bool:
    """全站公开仅 staff；普通岛民只能发「仅登录可见」。"""
    return is_staff(role)


def can_edit_comment_content(*, user_id: str, author_id: str) -> bool:
    return user_id == author_id


def can_delete_comment(*, user_id: str, role: str, author_id: str) -> bool:
    return user_id == author_id or is_staff(role)


def can_view_post(
    *,
    status: str,
    visibility: str,
    author_id: str,
    viewer_id: str | None,
    viewer_role: str | None,
) -> bool:
    """列表/详情统一可见性。"""
    if status == "deleted":
        return False
    if status == "draft":
        return viewer_id is not None and viewer_id == author_id
    if status == "hidden":
        if viewer_id is None:
            return False
        return viewer_id == author_id or is_staff(viewer_role or "")
    if status != "published":
        return False
    if visibility == "public":
        return True
    if visibility == "members":
        return viewer_id is not None
    return False
