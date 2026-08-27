import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_request_id
from app.schemas.common import ApiResponse, ErrorData

logger = logging.getLogger(__name__)


class AppException(Exception):
    def __init__(
        self,
        *,
        code: int,
        message: str,
        status_code: int = 400,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def error_response(
    *,
    status_code: int,
    code: int,
    message: str,
    details: Any = None,
) -> JSONResponse:
    payload = ApiResponse[ErrorData](
        code=code,
        message=message,
        data=ErrorData(details=details),
    )
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(mode="json", by_alias=True),
    )


async def app_exception_handler(
    _request: Request,
    exc: AppException,
) -> JSONResponse:
    return error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )


async def validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return error_response(
        status_code=422,
        code=422001,
        message="请求参数校验失败",
        details=jsonable_encoder(exc.errors()),
    )


async def http_exception_handler(
    _request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "请求失败"
    details = None if isinstance(exc.detail, str) else exc.detail
    return error_response(
        status_code=exc.status_code,
        code=exc.status_code * 1000,
        message=message,
        details=details,
    )


async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    logger.exception(
        "Unhandled exception request_id=%s while processing %s %s",
        get_request_id() or getattr(request.state, "request_id", None),
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return error_response(
        status_code=500,
        code=500000,
        message="服务器内部错误",
    )


def register_exception_handlers(application: FastAPI) -> None:
    application.add_exception_handler(AppException, app_exception_handler)
    application.add_exception_handler(
        RequestValidationError,
        validation_exception_handler,
    )
    application.add_exception_handler(
        StarletteHTTPException,
        http_exception_handler,
    )
    application.add_exception_handler(Exception, unhandled_exception_handler)
