"""Auth API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.auth.types import EntityRole


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    display_name: str = Field(min_length=1, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
            raise ValueError("Invalid email address")
        return cleaned


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MembershipCreate(BaseModel):
    user_id: uuid.UUID
    role: EntityRole


class MembershipUpdate(BaseModel):
    role: EntityRole | None = None
    is_active: bool | None = None


class MembershipRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    user_id: uuid.UUID
    role: EntityRole
    created_at: datetime
    user: UserRead

    model_config = {"from_attributes": True}


class MyMembershipRead(BaseModel):
    """Caller role + resolved permissions for UI gating (Slice 11.21)."""

    role: EntityRole
    permissions: list[str]
