# 部署到自有服务器（Docker Compose + Caddy）

**已有站点的离线镜像升级请看 [`UPGRADE.md`](./UPGRADE.md)。** 下方是首次从零部署。

前置条件：一台公网可访问的 Linux 服务器（已安装 Docker 与 Compose 插件）、一个你控制的域名。

## 1. DNS

在域名服务商添加解析，指向服务器公网 IP：

| 类型 | 主机记录 | 值 |
| --- | --- | --- |
| A | `@` | `<服务器公网 IP>` |
| A | `www` | `<服务器公网 IP>` |

等解析生效（`ping your.domain` 应指向该 IP）。Caddy 申请证书要求解析已生效。

## 2. 云安全组 / 防火墙

放行入站：**22**（SSH）、**80**、**443**。
不要对公网开放 3000 / 8000。

## 3. 部署

```bash
cd /opt/nova-island        # 或你的实际路径

git clone <仓库地址> .      # 首次部署；后续用 git pull

cp compose.env.production.example .env
# 编辑 .env：替换全部 <...> 占位符
# （SITE_DOMAIN / MYSQL_PASSWORD / JWT_SECRET / CORS_ORIGINS / STORAGE_PUBLIC_BASE_URL）

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`APP_ENV=production` 时后端会校验密钥强度并关闭 `/docs`；占位符未替换会直接启动失败，
而不是降级运行。

### 构建慢 / 拉镜像超时

1. **基础镜像**（mysql / redis / node / python / caddy）：配置 `/etc/docker/daemon.json`
   的 `registry-mirrors`，然后 `systemctl restart docker`。
2. **npm / PyPI**：在 `.env` 里取消注释 `NPM_REGISTRY`、`PIP_INDEX_URL`、`UV_INDEX_URL`
   后重新构建。
3. 仍然慢：在网络较好的机器上构建，再走 [`UPGRADE.md`](./UPGRADE.md) 的离线发布包流程。

查看状态：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
```

浏览器打开 `https://<your.domain>`。

## 4. 空库创建第一个管理员

生产默认 `DB_SEED=false`，数据库是空的，没有内置账号。

1. 打开站点 → 注册一个账号（例如 `admin`）
2. SSH 到服务器执行（密码用 `.env` 里的 `MYSQL_PASSWORD`）：

```bash
docker compose exec mysql \
  mysql -uroot -p'<你的 MYSQL_PASSWORD>' nova_island \
  -e "UPDATE users SET role='admin' WHERE username='admin';"
```

把 `admin` 换成你的用户名。重新登录后即可访问 `/admin`。

## 5. 配置要点

| 项 | 说明 |
| --- | --- |
| `SITE_DOMAIN` | Caddy 用它申请证书并反代；多个域名用逗号分隔 |
| `MYSQL_PASSWORD` | 自行设置强密码 |
| `JWT_SECRET` | `openssl rand -hex 32`；生产会拒绝默认值 |
| `DB_SEED` | 生产保持 `false` |
| HTTPS | Caddy 自动签发 / 续期，无需 certbot |

密钥只写在服务器上的 `.env`（已被 `.gitignore` 排除），不要提交进仓库。

## 6. 常用命令

```bash
# 更新代码后重建
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 只看后端日志
docker compose logs -f backend

# 停止（不加 -v，保留数据卷）
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```
