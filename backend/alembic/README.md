Nova Island Alembic migrations.

常用命令（在 backend/ 目录）：

  uv run alembic revision --autogenerate -m "描述"
  uv run alembic upgrade head
  uv run alembic downgrade -1
  uv run alembic current
  uv run alembic history

连接串来自 `.env` / Settings（不在 alembic.ini 写死密码）。
