"""import_id_map and posts.column_id

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-04 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_id_map",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_system", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("local_id", sa.String(length=64), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_system",
            "entity_type",
            "source_id",
            name="uq_import_id_map_source",
        ),
    )
    op.create_index(
        "ix_import_id_map_local",
        "import_id_map",
        ["entity_type", "local_id"],
    )

    op.add_column(
        "posts",
        sa.Column("column_id", sa.String(length=64), nullable=True),
    )
    op.create_foreign_key(
        "fk_posts_column_id_content_columns",
        "posts",
        "content_columns",
        ["column_id"],
        ["id"],
    )
    op.create_index("ix_posts_column_id", "posts", ["column_id"])


def downgrade() -> None:
    op.drop_index("ix_posts_column_id", table_name="posts")
    op.drop_constraint(
        "fk_posts_column_id_content_columns", "posts", type_="foreignkey"
    )
    op.drop_column("posts", "column_id")
    op.drop_index("ix_import_id_map_local", table_name="import_id_map")
    op.drop_table("import_id_map")
