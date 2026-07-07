"""Idempotency lookup and persistence — Phase 8.5 Slice 1."""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.deps import resolve_current_user
from app.core.idempotency.models import IdempotencyRecord

ANONYMOUS_SCOPE = "__anonymous__"
MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
SKIP_PATH_PREFIXES = ("/docs", "/redoc", "/openapi.json")
SKIP_PATH_SUFFIXES = ("/statements/preview", "/detect-document-type")
SKIP_EXACT_PATHS = frozenset({"/", "/health", "/health/ready"})


def is_mutation_method(method: str) -> bool:
    return method.upper() in MUTATION_METHODS


def should_skip_idempotency(method: str, path: str) -> bool:
    if not is_mutation_method(method):
        return True
    if path in SKIP_EXACT_PATHS:
        return True
    if any(path.startswith(prefix) for prefix in SKIP_PATH_PREFIXES):
        return True
    return any(path.endswith(suffix) for suffix in SKIP_PATH_SUFFIXES)


def validate_idempotency_key(raw_key: str | None) -> str | None:
    if raw_key is None or not raw_key.strip():
        return None
    key = raw_key.strip()
    try:
        uuid.UUID(key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Idempotency-Key must be a UUID") from exc
    return key


def resolve_scope_user_id(session: Session, authorization: str | None) -> str:
    if settings.auth_enforcement:
        user = resolve_current_user(session, authorization)
        return str(user.id)
    return ANONYMOUS_SCOPE


def find_record(
    session: Session,
    *,
    scope_user_id: str,
    method: str,
    path: str,
    idempotency_key: str,
) -> IdempotencyRecord | None:
    return session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.scope_user_id == scope_user_id,
            IdempotencyRecord.method == method.upper(),
            IdempotencyRecord.path == path,
            IdempotencyRecord.idempotency_key == idempotency_key,
        )
    )


def is_duplicate_record_response(status_code: int, response_body: Any) -> bool:
    """Duplicate confirm is transient — must not be replayed from idempotency cache."""
    if status_code != 409:
        return False
    if not isinstance(response_body, dict):
        return False
    detail = response_body.get("detail")
    return isinstance(detail, dict) and detail.get("code") == "duplicate_record"


def decode_response_body(raw: bytes, content_type: str | None) -> Any:
    if not raw:
        return None
    if content_type and "application/json" in content_type:
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return raw.decode("utf-8", errors="replace")
    try:
        return json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return raw.decode("utf-8", errors="replace")


def store_record(
    session: Session,
    *,
    scope_user_id: str,
    method: str,
    path: str,
    idempotency_key: str,
    status_code: int,
    response_body: Any,
) -> IdempotencyRecord | None:
    if status_code >= 500:
        return None
    if is_duplicate_record_response(status_code, response_body):
        return None
    record = IdempotencyRecord(
        scope_user_id=scope_user_id,
        method=method.upper(),
        path=path,
        idempotency_key=idempotency_key,
        status_code=status_code,
        response_body=response_body,
    )
    session.add(record)
    try:
        session.commit()
        return record
    except IntegrityError:
        session.rollback()
        return find_record(
            session,
            scope_user_id=scope_user_id,
            method=method,
            path=path,
            idempotency_key=idempotency_key,
        )
