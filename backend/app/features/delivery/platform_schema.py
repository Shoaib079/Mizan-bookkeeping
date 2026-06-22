"""Delivery platform master API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeliveryPlatformCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class DeliveryPlatformUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    is_active: bool | None = None


class DeliveryPlatformRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_id: uuid.UUID
    name: str
    gl_account_id: uuid.UUID
    gl_account_code: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
