"""Uvicorn 启动执行类，供 run.py / python -m app 共用。"""

from __future__ import annotations

import argparse
import os

import uvicorn

from app.core.config import get_settings


class UvicornRunner:
    """用当前 Settings 启动 uvicorn。"""

    def __init__(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        reload: bool | None = None,
        log_level: str | None = None,
    ) -> None:
        settings = get_settings()
        self.host = host or settings.api_host
        self.port = port or settings.api_port
        self.reload = (
            reload
            if reload is not None
            else settings.app_env.lower() in {"development", "dev", "local"}
        )
        self.log_level = (log_level or settings.log_level).lower()

    def run(self) -> None:
        # reload 时必须传 import string，不能传 app 对象
        uvicorn.run(
            "app.main:app",
            host=self.host,
            port=self.port,
            reload=self.reload,
            log_level=self.log_level,
        )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Start Nova Island API")
    parser.add_argument(
        "--host",
        default=None,
        help="Bind host (default: Settings.api_host / API_HOST)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Bind port (default: Settings.api_port / API_PORT)",
    )
    parser.add_argument(
        "--reload",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Enable auto-reload (default: on in development)",
    )
    parser.add_argument(
        "--log-level",
        default=None,
        help="uvicorn log level (default: Settings.log_level)",
    )
    args = parser.parse_args(argv)

    host = args.host or os.getenv("API_HOST")
    port = args.port
    if port is None and os.getenv("API_PORT"):
        port = int(os.environ["API_PORT"])

    UvicornRunner(
        host=host,
        port=port,
        reload=args.reload,
        log_level=args.log_level,
    ).run()
