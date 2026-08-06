"""Entity API schemas — Phase 0 multi-restaurant foundation."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.features.suppliers.schema import validate_vkn


class EntityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    vkn: str = Field(min_length=10, max_length=11)

    @field_validator("vkn")
    @classmethod
    def check_vkn(cls, value: str) -> str:
        return validate_vkn(value)


class EntityUpdate(BaseModel):
    """Omitted means unchanged; `""` means clear.

    Null is not how a field is cleared here, because `name` cannot be cleared
    at all and one rule across the whole payload is easier to hold than two.
    """

    name: str | None = Field(default=None, min_length=1, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    vkn: str | None = Field(default=None, min_length=10, max_length=11)

    # Branding — MENU_PLAN.md slice 3.
    address: str | None = Field(default=None, max_length=512)
    phone_primary: str | None = Field(default=None, max_length=64)
    phone_secondary: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=255)
    menu_terms: str | None = Field(default=None, max_length=4096)
    menu_validity_note: str | None = Field(default=None, max_length=255)

    @field_validator("vkn")
    @classmethod
    def check_vkn(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_vkn(value)


class EntityRead(BaseModel):
    id: uuid.UUID
    name: str
    legal_name: str | None
    vkn: str | None
    address: str | None = None
    phone_primary: str | None = None
    phone_secondary: str | None = None
    email: str | None = None
    menu_terms: str | None = None
    menu_validity_note: str | None = None
    created_at: datetime

    # A flag, not the path. The stored path is an R2 key or a disk location:
    # useless to the browser and not something to hand out. The client asks
    # `GET /entities/{id}/logo` and the server reads the file itself.
    has_logo: bool = False

    model_config = {"from_attributes": True}

    @classmethod
    def from_entity(cls, entity) -> "EntityRead":
        read = cls.model_validate(entity)
        return read.model_copy(
            update={"has_logo": bool(entity.logo_stored_path)}
        )


class EntitySettingCreate(BaseModel):
    key: str = Field(min_length=1, max_length=128)
    value: str = Field(max_length=1024)


class EntitySettingUpdate(BaseModel):
    value: str = Field(max_length=1024)


class EntitySettingRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    key: str
    value: str
    created_at: datetime

    model_config = {"from_attributes": True}
