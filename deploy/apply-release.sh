#!/usr/bin/env bash
# 服务器端：加载离线业务镜像并滚动重启 front/backend（保留 MySQL/Redis/上传/证书/.env）。
#
# 用法（在 /opt/nova-island）：
#   # 方式 1：已解压发布包，当前目录有 nova-island-images-amd64.tar.gz + bundle/
#   ./bundle/deploy/apply-release.sh
#
#   # 方式 2：指定发布包路径（会解压到临时目录再同步 compose）
#   ./deploy/apply-release.sh /opt/nova-island/nova-island-release-YYYYMMDD-HHMMSS.tar.gz
#
# 安全：
#   - 绝不覆盖已有 .env
#   - 不执行 down -v / 不碰数据卷
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nova-island}"
BACKEND_IMAGE="${BACKEND_IMAGE:-nova-island-backend:prod}"
FRONT_IMAGE="${FRONT_IMAGE:-nova-island-front:prod}"

die() {
  echo "error: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "需要命令：$1"
}

need_cmd docker
need_cmd tar
need_cmd gzip

RELEASE_ARCHIVE="${1:-}"
WORK=""
CLEANUP_WORK=0

cleanup() {
  if [[ "$CLEANUP_WORK" -eq 1 && -n "$WORK" && -d "$WORK" ]]; then
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

if [[ -n "$RELEASE_ARCHIVE" ]]; then
  [[ -f "$RELEASE_ARCHIVE" ]] || die "找不到发布包：$RELEASE_ARCHIVE"
  WORK="$(mktemp -d /tmp/nova-island-release.XXXXXX)"
  CLEANUP_WORK=1
  echo "==> extract $RELEASE_ARCHIVE"
  tar -xzf "$RELEASE_ARCHIVE" -C "$WORK"
elif [[ -f "./nova-island-images-amd64.tar.gz" && -d "./bundle" ]]; then
  WORK="$(pwd)"
elif [[ -f "$APP_DIR/nova-island-images-amd64.tar.gz" && -d "$APP_DIR/bundle" ]]; then
  WORK="$APP_DIR"
else
  die "请在解压后的发布目录执行，或传入 nova-island-release-*.tar.gz 路径"
fi

IMAGES="$WORK/nova-island-images-amd64.tar.gz"
BUNDLE="$WORK/bundle"
[[ -f "$IMAGES" ]] || die "缺少 $IMAGES"
[[ -d "$BUNDLE" ]] || die "缺少 $BUNDLE"

mkdir -p "$APP_DIR/deploy"
cd "$APP_DIR"

if [[ ! -f "$APP_DIR/.env" ]]; then
  die "缺少 $APP_DIR/.env —— 请先放好生产配置后再升级（脚本不会自动创建）"
fi

echo "==> sync compose / Caddyfile / apply script（保留 .env）"
cp "$BUNDLE/docker-compose.yml" "$APP_DIR/docker-compose.yml"
cp "$BUNDLE/docker-compose.prod.yml" "$APP_DIR/docker-compose.prod.yml"
cp "$BUNDLE/deploy/Caddyfile" "$APP_DIR/deploy/Caddyfile"
cp "$BUNDLE/deploy/apply-release.sh" "$APP_DIR/deploy/apply-release.sh"
chmod +x "$APP_DIR/deploy/apply-release.sh"
if [[ -f "$BUNDLE/deploy/UPGRADE.md" ]]; then
  cp "$BUNDLE/deploy/UPGRADE.md" "$APP_DIR/deploy/UPGRADE.md"
fi

# 便于下次直接在本目录 load：把镜像包拷到 APP_DIR（若来自临时解压）
if [[ "$IMAGES" != "$APP_DIR/nova-island-images-amd64.tar.gz" ]]; then
  cp "$IMAGES" "$APP_DIR/nova-island-images-amd64.tar.gz"
  IMAGES="$APP_DIR/nova-island-images-amd64.tar.gz"
fi

echo "==> docker load"
gzip -dc "$IMAGES" | docker load

docker image inspect "$BACKEND_IMAGE" >/dev/null
docker image inspect "$FRONT_IMAGE" >/dev/null

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "==> recreate backend + front（--no-build，保留数据卷）"
"${COMPOSE[@]}" up -d --no-build --force-recreate backend front

# Caddyfile 若有变更，轻量重启反代（不重建证书卷）
echo "==> refresh caddy"
"${COMPOSE[@]}" up -d --no-build caddy

echo "==> status"
"${COMPOSE[@]}" ps

echo
echo "升级完成。建议检查："
echo "  ${COMPOSE[*]} logs -f --tail=80 backend"
echo "  curl -fsS \"https://\${SITE_DOMAIN:-your.domain}/api/v1/health\" || true"
echo
echo "说明：backend 入口会自动 alembic upgrade head；MySQL/Redis/上传/证书未动；.env 未覆盖。"
