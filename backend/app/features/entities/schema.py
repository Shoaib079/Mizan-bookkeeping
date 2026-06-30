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
    name: str | None = Field(default=None, min_length=1, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    vkn: str | None = Field(default=None, min_length=10, max_length=11)

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
    created_at: datetime

    model_config = {"from_attributes": True}


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
