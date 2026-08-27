"""对认证写接口做简易滑动窗口限流（按客户端 IP）。"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings
from app.core.exceptions import error_response

_AUTH_WRITE_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        settings: Settings = request.app.state.settings
        if (
            not settings.rate_limit_enabled
            or request.method.upper() != "POST"
            or request.url.path not in _AUTH_WRITE_PATHS
        ):
            return await call_next(request)

        cache = request.app.state.cache
        ip = _client_ip(request)
        window = max(settings.rate_limit_window_seconds, 1)
        limit = max(settings.rate_limit_auth_limit, 1)
        key = f"rl:auth:{ip}:{request.url.path}"

        count = await cache.incr(key)
        if count == 1:
            await cache.expire(key, window)
        if count > limit:
            return error_response(
                status_code=429,
                code=429001,
                message="请求过于频繁，请稍后再试",
                details={"retryAfter": window},
            )
        return await call_next(request)
