"""Auth API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

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
    user_id: uuid.UUID | None = None
    email: str | None = Field(default=None, min_length=3, max_length=255)
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: EntityRole

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower()
        if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
            raise ValueError("Invalid email address")
        return cleaned

    @model_validator(mode="after")
    def require_user_id_or_email(self) -> MembershipCreate:
        if self.user_id is None and self.email is None:
            raise ValueError("Either user_id or email is required")
        if self.user_id is not None and self.email is not None:
            raise ValueError("Provide user_id or email, not both")
        return self


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
