"""Shared Pydantic field types for API request schemas."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from pydantic import BeforeValidator, Field

DEV_ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def coerce_optional_uuid(value: Any) -> uuid.UUID | None:
    """Parse optional UUID; treat blank strings as None (frontend sends actor_id=\"\")."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        return uuid.UUID(stripped)
    raise TypeError("actor_id must be a UUID string or null")


OptionalActorId = Annotated[
    uuid.UUID | None,
    BeforeValidator(coerce_optional_uuid),
    Field(default=None),
]
