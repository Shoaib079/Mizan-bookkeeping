"""Logging configuration — JSON in production, human-readable in dev/test."""

from __future__ import annotations

import json
import logging
import sys
from typing import Any


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line on stderr."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        for key in ("method", "path", "status_code", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(app_env: str) -> None:
    """Configure root logger — JSON when ``app_env`` is production."""
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stderr)
    if app_env.lower() == "production":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))

    root.addHandler(handler)
    root.setLevel(logging.INFO)
