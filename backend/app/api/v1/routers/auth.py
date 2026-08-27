from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.api.deps import BearerDep, CacheDep, DbSession, SettingsDep
from app.core.config import Settings
from app.core.exceptions import AppException, error_response
from app.schemas.auth import (
    AccessTokenSchema,
    AuthResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPairSchema,
)
from app.schemas.common import ApiResponse, success_response
from app.schemas.user import CurrentUserSchema
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _verify_auth_origin(request: Request, settings: Settings) -> None:
    """Cookie 认证端点只接受配置内的浏览器 Origin；非浏览器客户端可不带。"""

    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        raise AppException(
            code=403003,
            message="不允许的请求来源",
            status_code=403,
        )


def _set_auth_cookies(
    response: Response,
    settings: Settings,
    tokens: TokenPairSchema,
) -> None:
    cookie_options = {
        "domain": settings.refresh_cookie_domain,
        "secure": settings.should_secure_refresh_cookie,
        "httponly": True,
        "samesite": settings.refresh_cookie_samesite,
    }
    response.set_cookie(
        key=settings.access_cookie_name,
        value=tokens.access_token,
        max_age=tokens.expires_in,
        path=settings.access_cookie_path,
        **cookie_options,
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=tokens.refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path=settings.refresh_cookie_path,
        **cookie_options,
    )


def _delete_auth_cookies(response: Response, settings: Settings) -> None:
    cookie_options = {
        "domain": settings.refresh_cookie_domain,
        "secure": settings.should_secure_refresh_cookie,
        "httponly": True,
        "samesite": settings.refresh_cookie_samesite,
    }
    response.delete_cookie(
        key=settings.access_cookie_name,
        path=settings.access_cookie_path,
        **cookie_options,
    )
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        **cookie_options,
    )


def _auth_response(
    user: CurrentUserSchema,
    tokens: TokenPairSchema,
) -> AuthResponse:
    return AuthResponse(
        user=user,
        tokens=AccessTokenSchema(
            access_token=tokens.access_token,
            token_type=tokens.token_type,
            expires_in=tokens.expires_in,
        ),
    )


def _request_refresh_token(
    request: Request,
    settings: Settings,
    body: RefreshRequest | LogoutRequest | None,
) -> str | None:
    return request.cookies.get(settings.refresh_cookie_name) or (
        body.refresh_token if body else None
    )


@router.post("/register", response_model=ApiResponse[AuthResponse])
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    db: DbSession,
    settings: SettingsDep,
    cache: CacheDep,
) -> ApiResponse[AuthResponse]:
    _verify_auth_origin(request, settings)
    user, tokens = await auth_service.register(
        db,
        settings,
        cache,
        username=body.username,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
    )
    profile = CurrentUserSchema.model_validate(user)
    profile.is_self = True
    _set_auth_cookies(response, settings, tokens)
    return success_response(
        _auth_response(profile, tokens), message="注册成功"
    )


@router.post("/login", response_model=ApiResponse[AuthResponse])
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: DbSession,
    settings: SettingsDep,
    cache: CacheDep,
) -> ApiResponse[AuthResponse]:
    _verify_auth_origin(request, settings)
    user, tokens = await auth_service.login(
        db, settings, cache, identifier=body.identifier, password=body.password
    )
    profile = CurrentUserSchema.model_validate(user)
    profile.is_self = True
    _set_auth_cookies(response, settings, tokens)
    return success_response(
        _auth_response(profile, tokens), message="登录成功"
    )


@router.post("/refresh", response_model=ApiResponse[AuthResponse])
async def refresh(
    request: Request,
    response: Response,
    db: DbSession,
    settings: SettingsDep,
    cache: CacheDep,
    body: RefreshRequest | None = None,
) -> ApiResponse[AuthResponse] | JSONResponse:
    _verify_auth_origin(request, settings)
    refresh_token = _request_refresh_token(request, settings, body)
    if not refresh_token:
        _delete_auth_cookies(response, settings)
        raise AppException(
            code=401000,
            message="未认证或登录状态已失效",
            status_code=401,
        )
    try:
        user, tokens = await auth_service.refresh(
            db, settings, cache, refresh_token=refresh_token
        )
    except AppException as exc:
        error = error_response(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.details,
        )
        _delete_auth_cookies(error, settings)
        return error
    profile = CurrentUserSchema.model_validate(user)
    profile.is_self = True
    _set_auth_cookies(response, settings, tokens)
    return success_response(_auth_response(profile, tokens))


@router.post("/logout", response_model=ApiResponse[None])
async def logout(
    request: Request,
    response: Response,
    db: DbSession,
    settings: SettingsDep,
    cache: CacheDep,
    credentials: BearerDep,
    body: LogoutRequest | None = None,
) -> ApiResponse[None]:
    _verify_auth_origin(request, settings)
    # refresh 吊销会话；若携带 access，同步写入 access 黑名单
    access = credentials.credentials if credentials else None
    refresh_token = _request_refresh_token(request, settings, body)
    if refresh_token:
        await auth_service.logout(
            db,
            settings,
            cache,
            refresh_token=refresh_token,
            access_token=access,
        )
    _delete_auth_cookies(response, settings)
    return success_response(None, message="已退出登录")
