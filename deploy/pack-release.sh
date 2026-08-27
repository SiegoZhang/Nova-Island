#!/usr/bin/env bash
# 本机构建 linux/amd64 业务镜像，打成可 scp 的发布包（不含 .env / 不含数据）。
#
# 用法（在仓库根目录）：
#   ./deploy/pack-release.sh
#   ./deploy/pack-release.sh --skip-build   # 仅打包已存在的 *:prod 镜像
#
# 产出：
#   dist/nova-island-release-<时间戳>.tar.gz
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLATFORM="${PLATFORM:-linux/amd64}"
BACKEND_IMAGE="${BACKEND_IMAGE:-nova-island-backend:prod}"
FRONT_IMAGE="${FRONT_IMAGE:-nova-island-front:prod}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DIST_DIR="${DIST_DIR:-$ROOT/dist}"
WORK_DIR="$DIST_DIR/release-$STAMP"
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

# 构建参数：优先读本地 .env，否则回退生产示例（仅用于镜像构建，不会写入发布包）
ENV_FILE=""
if [[ -f "$ROOT/.env" ]]; then
  ENV_FILE="$ROOT/.env"
elif [[ -f "$ROOT/compose.env.production.example" ]]; then
  ENV_FILE="$ROOT/compose.env.production.example"
fi

read_env() {
  local key="$1"
  local default="${2:-}"
  if [[ -z "$ENV_FILE" ]]; then
    printf '%s' "$default"
    return
  fi
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "$default"
    return
  fi
  printf '%s' "${line#*=}"
}

NPM_REGISTRY="$(read_env NPM_REGISTRY https://registry.npmmirror.com)"
PIP_INDEX_URL="$(read_env PIP_INDEX_URL https://mirrors.aliyun.com/pypi/simple/)"
UV_INDEX_URL="$(read_env UV_INDEX_URL https://mirrors.aliyun.com/pypi/simple/)"
UV_HTTP_TIMEOUT="$(read_env UV_HTTP_TIMEOUT 180)"
API_INTERNAL_BASE_URL="$(read_env API_INTERNAL_BASE_URL http://backend:8000/api/v1)"
ENABLE_HTTPS_SECURITY_HEADERS="$(read_env ENABLE_HTTPS_SECURITY_HEADERS true)"

mkdir -p "$WORK_DIR/bundle/deploy"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "==> build $BACKEND_IMAGE ($PLATFORM)"
  docker build \
    --platform "$PLATFORM" \
    -t "$BACKEND_IMAGE" \
    --build-arg "PIP_INDEX_URL=$PIP_INDEX_URL" \
    --build-arg "UV_INDEX_URL=$UV_INDEX_URL" \
    --build-arg "UV_HTTP_TIMEOUT=$UV_HTTP_TIMEOUT" \
    "$ROOT/backend"

  echo "==> build $FRONT_IMAGE ($PLATFORM)"
  docker build \
    --platform "$PLATFORM" \
    -t "$FRONT_IMAGE" \
    --build-arg "API_INTERNAL_BASE_URL=$API_INTERNAL_BASE_URL" \
    --build-arg "ENABLE_HTTPS_SECURITY_HEADERS=$ENABLE_HTTPS_SECURITY_HEADERS" \
    --build-arg "NPM_REGISTRY=$NPM_REGISTRY" \
    "$ROOT/front"
else
  echo "==> skip build; require existing images"
  docker image inspect "$BACKEND_IMAGE" >/dev/null
  docker image inspect "$FRONT_IMAGE" >/dev/null
fi

echo "==> docker save → images"
docker save "$BACKEND_IMAGE" "$FRONT_IMAGE" | gzip -c >"$WORK_DIR/nova-island-images-amd64.tar.gz"

echo "==> copy compose + apply script (never .env)"
cp "$ROOT/docker-compose.yml" "$WORK_DIR/bundle/docker-compose.yml"
cp "$ROOT/docker-compose.prod.yml" "$WORK_DIR/bundle/docker-compose.prod.yml"
cp "$ROOT/deploy/Caddyfile" "$WORK_DIR/bundle/deploy/Caddyfile"
cp "$ROOT/deploy/apply-release.sh" "$WORK_DIR/bundle/deploy/apply-release.sh"
cp "$ROOT/deploy/UPGRADE.md" "$WORK_DIR/bundle/deploy/UPGRADE.md"
chmod +x "$WORK_DIR/bundle/deploy/apply-release.sh"

# 说明文件放在包根，方便服务器解开后直接看到
cp "$ROOT/deploy/UPGRADE.md" "$WORK_DIR/README.md"

ARCHIVE="$DIST_DIR/nova-island-release-$STAMP.tar.gz"
echo "==> archive $ARCHIVE"
tar -czf "$ARCHIVE" -C "$WORK_DIR" \
  nova-island-images-amd64.tar.gz \
  bundle \
  README.md

# 保留 work 目录便于检查；同时给最新包一个稳定软链名
ln -sfn "nova-island-release-$STAMP.tar.gz" "$DIST_DIR/nova-island-release-latest.tar.gz"

echo
echo "打包完成："
echo "  $ARCHIVE"
echo "  $DIST_DIR/nova-island-release-latest.tar.gz  (symlink)"
echo
echo "下一步（你自己 scp）："
echo "  scp $ARCHIVE root@<服务器>:/opt/nova-island/"
echo "然后在服务器："
echo "  cd /opt/nova-island && tar -xzf nova-island-release-$STAMP.tar.gz && ./bundle/deploy/apply-release.sh"
