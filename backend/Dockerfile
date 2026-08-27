# Nova Island API — production image
FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# 国内构建示例：
#   --build-arg PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
#   --build-arg UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
#   --build-arg UV_HTTP_TIMEOUT=180
ARG PIP_INDEX_URL=
ARG UV_INDEX_URL=
ARG UV_HTTP_TIMEOUT=180
ENV UV_HTTP_TIMEOUT=${UV_HTTP_TIMEOUT}

# 用 pip 装 uv，避免拉取 ghcr.io（国内常超时）
RUN if [ -n "$PIP_INDEX_URL" ]; then \
      pip install --no-cache-dir -i "$PIP_INDEX_URL" "uv==0.7.12"; \
    else \
      pip install --no-cache-dir "uv==0.7.12"; \
    fi

# 依赖层（锁文件变更才重建）
COPY pyproject.toml uv.lock ./
RUN if [ -n "$UV_INDEX_URL" ]; then \
      uv sync --frozen --no-dev --no-install-project --index-url "$UV_INDEX_URL"; \
    else \
      uv sync --frozen --no-dev --no-install-project; \
    fi

# 应用代码
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY run.py ./
COPY docker-entrypoint.sh ./

RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /app/storage/uploads

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
