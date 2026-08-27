# Nova Island Backend

新岛社区 API，技术栈：**FastAPI + SQLAlchemy 2.0（async）+ aiomysql + MySQL + Alembic + Redis + JWT**，依赖管理使用 **uv**。

## 环境要求

- Python 3.10+
- uv
- MySQL 8.0+
- Redis 7+（本地默认 `redis://127.0.0.1:6379/0`；`REDIS_ENABLED=false` 时回落进程内存）

## 本地开发

```bash
uv sync
cp .env.example .env
# 默认已指向本机 MySQL：nova_island_demo / root / 123456（主机 127.0.0.1）

# 1) 应用数据库迁移（schema 唯一来源）
uv run alembic upgrade head

# 2) 启动 API（空库时自动灌种子数据）
uv run python run.py --reload
# 或：python run.py --reload  /  python -m app --reload
# 或：uv run uvicorn app.main:app --reload
```

- API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/api/v1/health
- 演示账号：`leo` / `island@2026`（邮箱 `leo@novaisland.ai` 亦可登录）

> `DB_AUTO_CREATE` 默认 `false`。正式环境**禁止**依赖 `create_all`；测试环境由 `conftest.py` 临时开启。

## 生产环境（密钥与日志）

`APP_ENV=production`（或 `prod`）启动时会强制校验，不满足则**拒绝启动**：

| 项 | 要求 |
| --- | --- |
| `JWT_SECRET` | ≥32 字符，且不是开发默认值 |
| `MYSQL_PASSWORD` | 非弱口令（禁止 `123456` / `password` 等） |
| `DB_AUTO_CREATE` / `DB_SEED` | 必须为 `false` |
| `SEED_DEFAULT_PASSWORD` | 禁止沿用演示密码 `island@2026` |
| `CORS_ORIGINS` | 禁止 `*` |
| `/docs` / OpenAPI | 生产自动关闭 |

日志：

- `LOG_LEVEL`（默认 `INFO`）
- `LOG_JSON`：留空则 production 自动 JSON 行日志；development 人类可读
- 每个响应带 `X-Request-ID`（可透传客户端传入值）；access 日志含 method/path/status/duration

```bash
# 生产示例（密钥请用密钥管理注入，勿提交仓库）
export APP_ENV=production
export JWT_SECRET="$(openssl rand -hex 32)"
export MYSQL_PASSWORD="..."
export DB_SEED=false
export DB_AUTO_CREATE=false
export SEED_DEFAULT_PASSWORD="$(openssl rand -hex 16)"
export CORS_ORIGINS='["https://your.domain"]'
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Docker 镜像入口会先执行 `alembic upgrade head` 再启动 uvicorn；编排见仓库根目录 `docker-compose.yml` / `compose.env.example`。

## 数据库迁移（Alembic）

```bash
# 根据 models 变更自动生成 revision
uv run alembic revision --autogenerate -m "描述本次变更"

# 升级到最新
uv run alembic upgrade head

# 回滚一版
uv run alembic downgrade -1

# 查看当前版本
uv run alembic current
uv run alembic history
```

连接串从 `.env` / Settings 读取，**不要**把密码写进 `alembic.ini`。

流程约定：改 schema → Alembic revision → 更新 models/schemas/services → pytest → 前端类型。

## 统一响应协议

所有接口返回统一信封，字段为 camelCase：

```json
{ "code": 0, "message": "success", "data": {}, "timestamp": "ISO-8601" }
```

`code === 0` 表示成功；分页数据为 `{ items, pagination: { page, pageSize, total, totalPages } }`。

鉴权：短期 access token 由响应体返回，JavaScript 侧只保存在前端内存；后端
还设置一份短期 HttpOnly access Cookie，供 Next Server Component 的
GET/HEAD 请求识别身份。refresh token 仅通过 HttpOnly Cookie 下发。写接口
始终要求请求头携带：

```
Authorization: Bearer <accessToken>
```

## 接口一览（前缀 `/api/v1`）

### 认证 `/auth`

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 否 | 注册，返回 `user + access token`，设置 access/refresh Cookie |
| POST | `/auth/login` | 否 | 登录，返回 `user + access token`，设置 access/refresh Cookie |
| POST | `/auth/refresh` | Cookie | 轮换 refresh Cookie，并更新短期 access Cookie/响应体 token |
| POST | `/auth/logout` | Cookie/可选 access | 吊销 refresh 会话、删除两枚 Cookie；有 Bearer access 时同步加入黑名单 |

access Cookie 默认名为 `nova.access`、路径为 `/`；refresh Cookie 默认名为
`nova.refresh`、路径为 `/api/v1/auth`。两者均为 `HttpOnly`、
`SameSite=Lax`，生产环境默认强制 `Secure`。Cookie access 只参与 GET/HEAD
鉴权，POST/PATCH/DELETE 必须使用 Bearer。迁移期刷新/登出仍接受请求体中的
`refreshToken`，新前端不得继续使用该兼容入口。

### 用户 `/users`

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/users/me` | 是 | 当前登录用户 |
| PATCH | `/users/me` | 是 | 更新资料（昵称/简介/头像） |
| POST | `/users/me/password` | 是 | 修改密码 |
| GET | `/users/me/bookmarks` | 是 | 我的收藏（分页） |
| GET | `/users` | admin | 用户列表（可选 `q` 搜索） |
| POST | `/users` | admin | 代建用户（用户名/邮箱/密码/角色；不签发会话） |
| DELETE | `/users/{username}` | admin | 软删除用户（注销、吊销会话、释放用户名/邮箱） |
| GET | `/users/{username}` | 可选 | 公开主页（含 `isFollowing`/`isSelf`） |
| GET | `/users/{username}/posts` | 否 | 用户帖子分页 |
| GET | `/users/{username}/followers` | 否 | 粉丝列表 |
| GET | `/users/{username}/following` | 否 | 关注列表 |
| POST | `/users/{username}/follow` | 是 | 关注 |
| DELETE | `/users/{username}/follow` | 是 | 取消关注 |
| PATCH | `/users/{username}/role` | admin | 修改角色 |
| PATCH | `/users/{username}/status` | admin | 停用/恢复账号 |
| GET | `/notifications` | 是 | 我的通知（可选 `unreadOnly`） |
| GET | `/notifications/unread-count` | 是 | 未读数量 |
| POST | `/notifications/read-all` | 是 | 全部标已读 |
| POST | `/notifications/{id}/read` | 是 | 单条标已读 |

### 社区内容

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/posts?featured=true` | 精华帖 |
| GET | `/posts/tags?featured=true` | 精华帖实际出现的标签 |
| GET | `/posts/search?q=` | 搜索标题/正文/摘要/标签 |
| GET | `/posts` | 最新帖 |
| GET | `/posts/{id}` | 帖子详情（自增浏览量） |
| GET | `/posts/{id}/comments` | 评论列表 |
| POST | `/posts/{id}/comments` | 发表评论（需登录） |
| POST | `/posts/{id}/feature` | 加精（moderator/admin） |
| DELETE | `/posts/{id}/feature` | 取消加精 |
| POST | `/posts/{id}/hide` | 隐藏（staff） |
| POST | `/posts/{id}/unhide` | 恢复公开 |
| POST | `/uploads` | 上传图片/附件（需登录；本地或 S3） |
| GET | `/voyages` | 航海 |
| GET | `/columns` | 专栏 |
| GET | `/rankings?period=weekly` | 榜单 |
| GET | `/events` | 活动 |

## 角色权限（最小集）

| 动作 | member | moderator | admin |
| --- | :---: | :---: | :---: |
| 发帖 / 评论 / 赞藏 | ✓ | ✓ | ✓ |
| 改自己的帖/评正文 | ✓ | ✓ | ✓ |
| 删自己的帖/评 | ✓ | ✓ | ✓ |
| 删/隐藏他人帖、删他人评 | — | ✓ | ✓ |
| 加精 | — | ✓ | ✓ |
| 改角色 / 停用账号 | — | — | ✓ |
| 读 `visibility=members` | 登录后 | ✓ | ✓ |

`leo`=moderator，`yhy`=admin（密码均为 `island@2026`）。

## Token 机制

- **access_token**：短时 JWT（默认 30 分钟），`type=access`；logout 时可写入 Redis 黑名单即时失效
- **refresh_token**：长时 JWT（默认 14 天），MySQL 持久化 + Redis 会话/黑名单；刷新时轮换吊销旧 jti
- 密码：`pbkdf2_sha256`

## Redis 能力

| 能力 | 说明 |
| --- | --- |
| 限流 | `POST /auth/login|register|refresh` 按 IP 滑动窗口（默认 30 次 / 60s） |
| 会话 / 黑名单 | refresh 活跃会话索引；logout / 轮换后 denylist；可选 access 黑名单 |
| 热数据缓存 | `/voyages` `/columns` `/rankings` `/events` 短 TTL（默认 60s） |

`REDIS_ENABLED=false` 或 Redis 不可达时自动使用进程内内存后端（单进程有效，适合测试）。

## 对象存储

默认 **本地**：文件写入 `STORAGE_LOCAL_ROOT`，经 `GET /media/**` 访问。

切换对象存储：设 `STORAGE_BACKEND=s3`，配置 `STORAGE_S3_*`，并 `uv add boto3`。业务层只依赖 `app.core.storage.ObjectStorage`，发帖/上传接口无需改动。

## 检查与测试

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

测试使用内存 sqlite + 内存缓存（`tests/conftest.py` 关闭真实 Redis / 限流），无需 MySQL/Redis。
