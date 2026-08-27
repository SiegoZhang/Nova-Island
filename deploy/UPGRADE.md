# 离线升级（业务镜像 amd64）

适用于已在运行的部署目录（默认 `/opt/nova-island`），保留 MySQL / Redis / 上传文件 /
Caddy 证书 / `.env`。本机是 Apple Silicon 时，脚本会按 `linux/amd64` 构建，与 x86 服务器一致。

## 1. 本机打包

在仓库根目录：

```bash
chmod +x deploy/pack-release.sh deploy/apply-release.sh
./deploy/pack-release.sh
```

产出：

- `dist/nova-island-release-<时间戳>.tar.gz`
- `dist/nova-island-release-latest.tar.gz`（软链，指向最新包）

包内含 `nova-island-backend:prod`、`nova-island-front:prod` 镜像，以及更新后的
compose / Caddyfile / 应用脚本。**不含 `.env`，不含数据库。**

首次构建可能较久（Next 构建 + 跨架构）。需要加速时，脚本会读取仓库 `.env`
或 `compose.env.production.example` 里的 `NPM_REGISTRY` / `PIP_INDEX_URL`。

## 2. 上传到服务器

```bash
scp dist/nova-island-release-latest.tar.gz root@<服务器公网 IP>:/opt/nova-island/
```

（也可换成带时间戳的具体文件名。）

## 3. 服务器上应用

```bash
cd /opt/nova-island
tar -xzf nova-island-release-latest.tar.gz
# 若解压出 bundle/ 与镜像包在当前目录：
./bundle/deploy/apply-release.sh

# 或者不解压，直接指定包：
# ./deploy/apply-release.sh /opt/nova-island/nova-island-release-XXXX.tar.gz
```

脚本行为：

1. **不覆盖**已有 `.env`
2. 同步 `docker-compose*.yml`、`deploy/Caddyfile`
3. `docker load` 业务镜像
4. `up -d --no-build --force-recreate backend front`，并刷新 caddy
5. **不执行** `down -v`，数据卷保留

backend 容器启动时会自动执行 `alembic upgrade head`。

## 4. 验收

```bash
cd /opt/nova-island
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 backend
curl -fsS "https://<your.domain>/api/v1/health"
```

浏览器打开 `https://<your.domain>`。

## 5. 回滚

若新镜像有问题，且旧镜像仍在服务器上：

```bash
docker images | grep nova-island
# 把旧的 IMAGE ID 重新 tag 为 *:prod 后：
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --force-recreate backend front
```

更稳妥的做法：升级前先备份当前镜像：

```bash
docker save nova-island-backend:prod nova-island-front:prod \
  | gzip -c > /opt/nova-island/backup-images-$(date +%F).tar.gz
```

## 注意

- 不要把 macOS 产生的 `._*` 文件当配置用；scp 用上面的 `.tar.gz` 即可。
- 安全组只需放行公网 **22 / 80 / 443**；3000、8000 仅本机调试。
- `.env` 保持服务器现有内容即可，本流程不会修改它。
