"""ASGI middleware — server-side idempotency on mutation endpoints (Phase 8.5 Slice 1)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.core.idempotency import service as idempotency_service
from app.db.session import SessionLocal


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        method = request.method.upper()
        path = request.url.path

        if idempotency_service.should_skip_idempotency(method, path):
            return await call_next(request)

        raw_key = request.headers.get("Idempotency-Key")
        if settings.idempotency_enforcement and not raw_key:
            return JSONResponse(
                status_code=400,
                content={"detail": "Idempotency-Key header required"},
            )

        try:
            idempotency_key = idempotency_service.validate_idempotency_key(raw_key)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        if idempotency_key is None:
            return await call_next(request)

        session = SessionLocal()
        try:
            try:
                scope_user_id = idempotency_service.resolve_scope_user_id(
                    session, request.headers.get("authorization")
                )
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

            existing = idempotency_service.find_record(
                session,
                scope_user_id=scope_user_id,
                method=method,
                path=path,
                idempotency_key=idempotency_key,
            )
            if existing is not None and not idempotency_service.is_duplicate_record_response(
                existing.status_code, existing.response_body
            ):
                return _cached_response(existing.status_code, existing.response_body)
        finally:
            session.close()

        response = await call_next(request)
        body = b"".join([chunk async for chunk in response.body_iterator])
        content_type = response.headers.get("content-type")
        parsed_body = idempotency_service.decode_response_body(body, content_type)

        store_session = SessionLocal()
        try:
            winner = idempotency_service.store_record(
                store_session,
                scope_user_id=scope_user_id,
                method=method,
                path=path,
                idempotency_key=idempotency_key,
                status_code=response.status_code,
                response_body=parsed_body,
            )
            if winner is not None and winner.status_code != response.status_code:
                return _cached_response(winner.status_code, winner.response_body)
        finally:
            store_session.close()

        return Response(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )


def _cached_response(status_code: int, body: Any) -> Response:
    if isinstance(body, (dict, list)):
        return JSONResponse(status_code=status_code, content=body)
    if body is None:
        return Response(status_code=status_code)
    if isinstance(body, str):
        return Response(content=body, status_code=status_code, media_type="text/plain")
    return JSONResponse(status_code=status_code, content=body)
