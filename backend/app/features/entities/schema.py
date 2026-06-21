"""Entity API schemas — Phase 0 multi-restaurant foundation."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class EntityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class EntityRead(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EntitySettingCreate(BaseModel):
    key: str = Field(min_length=1, max_length=128)
    value: str = Field(max_length=1024)


class EntitySettingRead(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    key: str
    value: str
    created_at: datetime

    model_config = {"from_attributes": True}
