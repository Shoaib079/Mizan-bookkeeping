"""In-memory per-IP rate limiting — production only; not shared across instances."""

from __future__ import annotations

import threading
from collections import defaultdict
from time import monotonic

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings

SKIP_EXACT_PATHS = frozenset({"/health", "/health/ready", "/docs", "/openapi.json", "/redoc"})
SKIP_PREFIXES = ("/docs/",)


def should_skip_rate_limit(path: str) -> bool:
    if path in SKIP_EXACT_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in SKIP_PREFIXES)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-window counter per client IP — 60 req/min default in production."""

    def __init__(self, app, *, window_seconds: int = 60) -> None:
        super().__init__(app)
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.is_production:
            return await call_next(request)

        path = request.url.path
        if should_skip_rate_limit(path):
            return await call_next(request)

        client_ip = self._client_ip(request)
        now = monotonic()
        cutoff = now - self.window_seconds
        limit = settings.rate_limit_per_minute

        with self._lock:
            recent = [t for t in self._hits[client_ip] if t > cutoff]
            if len(recent) >= limit:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": (
                            f"Rate limit exceeded ({limit} requests per "
                            f"{self.window_seconds} seconds). Try again shortly."
                        )
                    },
                )
            recent.append(now)
            self._hits[client_ip] = recent

        return await call_next(request)
