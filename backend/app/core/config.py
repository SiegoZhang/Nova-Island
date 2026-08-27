from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 开发默认值：生产环境禁止继续使用
_DEV_JWT_SECRET = "change-me-in-production-please-use-a-long-random-secret"
_WEAK_DB_PASSWORDS = frozenset(
    {
        "",
        "123456",
        "password",
        "root",
        "mysql",
        "admin",
    }
)
_WEAK_SEED_PASSWORDS = frozenset(
    {
        "",
        "123456",
        "password",
        "island@2026",
    }
)


class Settings(BaseSettings):
    app_name: str = "Nova Island API"
    app_version: str = "0.1.0"
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    # MySQL 连接配置（推荐 127.0.0.1，避免 localhost 走 unix socket）
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_database: str = "nova_island_demo"
    mysql_user: str = "root"
    mysql_password: str = "123456"

    # 可选：完整 SQLAlchemy URL 覆盖（测试可注入 sqlite+aiosqlite）
    database_url: str | None = None

    # 启动行为：
    # - db_auto_create：仅测试/临时兜底建表；MySQL 默认 False，用 Alembic
    # - db_seed：空库时灌入演示数据
    db_auto_create: bool = False
    db_seed: bool = True
    db_echo: bool = False

    # Redis（限流 / refresh 会话与黑名单 / 热数据缓存）
    redis_url: str = "redis://127.0.0.1:6379/0"
    redis_enabled: bool = True
    # 认证写接口限流（login / register / refresh）
    rate_limit_enabled: bool = True
    rate_limit_auth_limit: int = 30
    rate_limit_window_seconds: int = 60
    # 社区只读热列表缓存 TTL（秒）；0 表示关闭
    cache_ttl_seconds: int = 60

    # 榜单日更：默认每天 03:00（Asia/Shanghai）重算 weekly / monthly / all
    ranking_recalc_enabled: bool = True
    ranking_recalc_hour: int = 3
    ranking_recalc_minute: int = 0
    ranking_recalc_timezone: str = "Asia/Shanghai"
    ranking_top_n: int = 50

    # JWT 认证配置
    jwt_secret: str = _DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    # 短期 access JWT 同时写入 HttpOnly Cookie，供 Next Server Component
    # 在只读请求中识别当前用户；浏览器写请求仍使用 Bearer token。
    access_cookie_name: str = "nova.access"
    access_cookie_path: str = "/"
    # refresh JWT 只通过 HttpOnly Cookie 下发；生产默认强制 Secure。
    refresh_cookie_name: str = "nova.refresh"
    refresh_cookie_path: str = "/api/v1/auth"
    refresh_cookie_domain: str | None = None
    refresh_cookie_secure: bool | None = None
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    # 种子用户的默认演示密码
    seed_default_password: str = "island@2026"

    # 日志
    log_level: str = "INFO"
    # None = 随环境自动（production → JSON）；显式 true/false 可覆盖
    log_json: bool | None = None

    # 对象存储：local（默认）| s3（预留，需 boto3 + STORAGE_S3_*）
    storage_backend: str = "local"
    storage_local_root: str = "./storage/uploads"
    # 本地文件经 FastAPI /media 挂载后的公开前缀
    storage_public_base_url: str = "http://localhost:8000/media"
    upload_max_bytes: int = 10 * 1024 * 1024
    # 图片单独更严：上传前原始文件上限；服务端会再裁剪压缩
    upload_image_max_bytes: int = 5 * 1024 * 1024
    upload_max_attachments_per_post: int = 10
    # S3 / MinIO（STORAGE_BACKEND=s3 时生效）
    storage_s3_bucket: str = ""
    storage_s3_region: str = "us-east-1"
    storage_s3_endpoint_url: str = ""
    storage_s3_access_key: str = ""
    storage_s3_secret_key: str = ""
    storage_s3_prefix: str = ""
    storage_s3_public_base_url: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def should_log_json(self) -> bool:
        if self.log_json is not None:
            return self.log_json
        return self.is_production

    @property
    def should_secure_refresh_cookie(self) -> bool:
        if self.refresh_cookie_secure is not None:
            return self.refresh_cookie_secure
        return self.is_production

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            "mysql+aiomysql://"
            f"{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
            "?charset=utf8mb4"
        )

    @model_validator(mode="after")
    def _reject_insecure_production(self) -> Self:
        if (
            self.refresh_cookie_samesite == "none"
            and not self.should_secure_refresh_cookie
        ):
            raise ValueError("SameSite=None refresh cookies require Secure=true")
        if not self.is_production:
            return self

        errors: list[str] = []
        secret = self.jwt_secret.strip()
        if (
            len(secret) < 32
            or secret == _DEV_JWT_SECRET
            or secret.lower().startswith("change-me")
        ):
            errors.append(
                "JWT_SECRET must be a strong random secret (>=32 chars), "
                "not the development default"
            )
        if self.mysql_password.strip().lower() in _WEAK_DB_PASSWORDS:
            errors.append("MYSQL_PASSWORD is too weak for production")
        if self.db_auto_create:
            errors.append("DB_AUTO_CREATE must be false in production")
        if self.db_seed:
            errors.append("DB_SEED must be false in production")
        if self.seed_default_password.strip().lower() in _WEAK_SEED_PASSWORDS:
            errors.append(
                "SEED_DEFAULT_PASSWORD must not use the demo password in production"
            )
        if "*" in self.cors_origins:
            errors.append("CORS_ORIGINS must not include '*' in production")
        if not self.should_secure_refresh_cookie:
            errors.append("REFRESH_COOKIE_SECURE must not be false in production")

        if errors:
            raise ValueError("; ".join(errors))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
