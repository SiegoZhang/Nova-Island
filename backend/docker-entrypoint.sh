#!/bin/sh
set -e

# 等待 MySQL 可连接后再跑迁移（compose healthcheck 之外的兜底）
if [ "${SKIP_DB_WAIT:-false}" != "true" ]; then
  echo "waiting for MySQL ${MYSQL_HOST:-127.0.0.1}:${MYSQL_PORT:-3306}..."
  python - <<'PY'
import os, socket, sys, time

host = os.getenv("MYSQL_HOST", "127.0.0.1")
port = int(os.getenv("MYSQL_PORT", "3306"))
deadline = time.time() + int(os.getenv("DB_WAIT_SECONDS", "60"))

while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"MySQL reachable at {host}:{port}")
            sys.exit(0)
    except OSError:
        time.sleep(1)

print(f"timed out waiting for MySQL at {host}:{port}", file=sys.stderr)
sys.exit(1)
PY
fi

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "running alembic upgrade head..."
  alembic upgrade head
fi

exec "$@"
