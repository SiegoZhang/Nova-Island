"""add_likes_and_bookmarks

Revision ID: 67f5016bef53
Revises: c8c69763bd07
Create Date: 2026-07-24 19:39:01.812524

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "67f5016bef53"
down_revision: str | Sequence[str] | None = "c8c69763bd07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "post_bookmarks",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("post_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id", "post_id"),
    )
    op.create_index(
        op.f("ix_post_bookmarks_post_id"), "post_bookmarks", ["post_id"], unique=False
    )
    op.create_table(
        "post_likes",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("post_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id", "post_id"),
    )
    op.create_index(
        op.f("ix_post_likes_post_id"), "post_likes", ["post_id"], unique=False
    )
    op.create_table(
        "comment_likes",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("comment_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["comment_id"], ["comments.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id", "comment_id"),
    )
    op.create_index(
        op.f("ix_comment_likes_comment_id"),
        "comment_likes",
        ["comment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_comment_likes_comment_id"), table_name="comment_likes")
    op.drop_table("comment_likes")
    op.drop_index(op.f("ix_post_likes_post_id"), table_name="post_likes")
    op.drop_table("post_likes")
    op.drop_index(op.f("ix_post_bookmarks_post_id"), table_name="post_bookmarks")
    op.drop_table("post_bookmarks")
